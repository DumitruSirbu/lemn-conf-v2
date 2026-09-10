import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

// ---------------------------------------------------------------------------
// M6B wave 6B-j — the gate that stops Romanian drifting back into the source.
//
// M6B moved every customer-visible Romanian string into `apps/web/src/messages/*.json`. M7 and M8
// author two more screens of copy and will not have done that work, so the convention is written in
// `docs/best-practices/engineering-conventions.md` § "Localised copy" and the machine-checkable half
// is here.
//
// **Why `no-restricted-syntax` and not a `git grep` gate.** These rules read the AST, so a Romanian
// **comment** is exempt for free rather than by an exclusion a grep cannot make — and this codebase's
// comments quote approved copy constantly.
// ---------------------------------------------------------------------------

/** Romanian's five letters, in both spellings.
 *
 *  The comma-below pair (U+0219 `ș`, U+021B `ț`) is the correct Romanian one; the cedilla pair
 *  (U+015F `ş`, U+0163 `ţ`) is Turkish and renders almost identically, which is why
 *  `tests/price/starting-price.adversarial.test.ts` guards the owner's sentence against it. Both
 *  spellings are swept: a rule blind to the cedillas would pass a Romanian sentence pasted through a
 *  legacy tool, which is the one drift nobody can see. */
const ROMANIAN_LETTER_CLASS =
  "\\u0103\\u00e2\\u00ee\\u0219\\u021b\\u0102\\u00c2\\u00ce\\u0218\\u021a" +
  "\\u015f\\u0163\\u015e\\u0162";

const NEW_STRING_GOES_IN_THE_CATALOGUE =
  "Romanian belongs in apps/web/src/messages/*.json, reached by a key. See " +
  'docs/best-practices/engineering-conventions.md § "Localised copy". A test that must name Romanian ' +
  "— a negative claim about the wording, a codepoint, a hash input — records its reason at the site " +
  "or in this file's allow-list.";

/** **Three node kinds, named separately so the reach is visible in the failure.**
 *
 *  The third is not a footnote. `/incluse? în preț/i` in
 *  `packages/configurator-domain/tests/pricing/hardware-tier-reconciliation.test.ts` is a Romanian
 *  literal that two successive tree scans missed because they read `"…"` and `` `…` `` only, and one
 *  of them published a count on that basis. A regex literal's `value` is a `RegExp` object rather
 *  than a string, so the first selector cannot see it — measured, not assumed — and `regex.pattern`
 *  is what reaches it.
 *
 *  **Where the reach is narrower than the name.** A pattern assembled at runtime — `new
 *  RegExp(someVariable)` — is not a literal and no selector here sees it. */
const ROMANIAN_LITERAL_SELECTORS = [
  {
    selector: `Literal[value=/[${ROMANIAN_LETTER_CLASS}]/]`,
    message: `A Romanian string literal. ${NEW_STRING_GOES_IN_THE_CATALOGUE}`,
  },
  {
    selector: `TemplateElement[value.raw=/[${ROMANIAN_LETTER_CLASS}]/]`,
    message: `Romanian inside a template literal. ${NEW_STRING_GOES_IN_THE_CATALOGUE}`,
  },
  {
    selector: `Literal[regex.pattern=/[${ROMANIAN_LETTER_CLASS}]/]`,
    message: `Romanian inside a regex literal. ${NEW_STRING_GOES_IN_THE_CATALOGUE}`,
  },
];

/** **The glyphs a component may draw as bare JSX text, each with the reason it is not copy.**
 *
 *  An explicit allow-list rather than a rule narrowed to "text containing a letter": narrowing would
 *  silently legalise the next diacritic-free Romanian word somebody types between two tags, which is
 *  the case the positional rule exists for. Every entry below is a single non-letter mark that no
 *  locale translates, and each is already either `aria-hidden` or given an accessible name from the
 *  catalogue — so the mark is decoration and the *word* beside it is still keyed. A mark with a word
 *  attached (`‹ Înapoi`) still fails: the allow-list matches the glyph alone. */
const DECORATIVE_JSX_GLYPHS = [
  {
    glyph: "‹",
    reason:
      "single left-pointing quotation mark — frame 2A's back control, named by content.configure.back",
  },
  {
    glyph: "▾",
    reason:
      "black down-pointing small triangle — the locale chip's and the settings pill's caret, aria-hidden",
  },
  {
    glyph: "→",
    reason:
      "rightwards arrow — the WebGL fallback's path affordance, aria-hidden",
  },
  {
    glyph: "×",
    reason:
      "multiplication sign — the panel's close mark, named by content.panel.close",
  },
  {
    glyph: "!",
    reason:
      "exclamation mark — the panel rejection's severity mark, aria-hidden beside the message",
  },
];

const DECORATIVE_GLYPH_CLASS = DECORATIVE_JSX_GLYPHS.map(
  (entry) => entry.glyph,
).join("");

/** **The positional half, and the half that does not depend on the language.**
 *
 *  A diacritic rule alone would certify a file holding *"Dulap suspendat"*, *Frigider*,
 *  *Push-to-open* and every palette name — none of which carries a diacritic. This is what actually
 *  enforces "a customer-visible string is reached by a key", and it catches future English the same
 *  way.
 *
 *  **Where the reach is narrower than the name.** It sees the four attributes named and JSX text; it
 *  does not see a string passed to a component as an ordinary prop, or one assembled in a variable
 *  and rendered through an expression container. */
const UNKEYED_JSX_TEXT_SELECTORS = [
  {
    selector: `JSXText[value=/\\S/]:not([value=/^\\s*[${DECORATIVE_GLYPH_CLASS}]\\s*$/])`,
    message: `Bare text rendered as JSX. ${NEW_STRING_GOES_IN_THE_CATALOGUE}`,
  },
  {
    selector:
      "JSXAttribute[name.name=/^(aria-label|title|placeholder|alt)$/] > Literal",
    message: `A bare string as an accessible name. ${NEW_STRING_GOES_IN_THE_CATALOGUE}`,
  },
  {
    selector:
      "JSXAttribute[name.name=/^(aria-label|title|placeholder|alt)$/] > JSXExpressionContainer > :matches(Literal, TemplateLiteral)",
    message: `A bare string as an accessible name. ${NEW_STRING_GOES_IN_THE_CATALOGUE}`,
  },
];

/** **The allow-list's file-level shape, and every entry's reason.**
 *
 *  The second shape is at the site: `// eslint-disable-next-line no-restricted-syntax -- …`, with the
 *  sentence that explains it already standing above the assertion. Both shapes carry a reason; a bare
 *  disable with nothing beside it is what this wave forbids.
 *
 *  A file lands here rather than at the site when the literals *are* the file — fifteen directives in
 *  one copy test is the noise the file-level shape exists to avoid — or when the file's whole subject
 *  is the wording.
 *
 *  An entry may narrow instead of exempting: `permittedPositions` re-arms the rule and excludes one
 *  syntactic position, which is how ADR 0106 decision 2's required fallbacks stay legal without the
 *  rest of the price book going unswept.
 *
 *  **The two shapes decay differently, and only one of them says so.** A site-level directive whose
 *  literal has been removed is reported as an unused disable and fails `--max-warnings 0` — measured,
 *  not assumed. A **file-level** entry has no such feedback: once the file stops carrying Romanian
 *  the entry sits here excusing nothing, and nothing notices. Read this table on review. */
const ROMANIAN_LITERAL_FILE_ALLOWANCES = [
  {
    files: ["apps/web/tests/support/approved-romanian-messages.ts"],
    reason:
      "Gate O1's copy lock: the sole approved Romanian wording corpus, and the one place in the tree " +
      "that is *supposed* to be an inline literal table. Sweeping it would sweep the pin itself.",
  },
  {
    files: ["apps/web/tests/price/price-breakdown-copy.test.ts"],
    reason:
      "Traces each price string to the mockup frame that ruled it — a claim the copy lock cannot " +
      "make, because it pins the catalogue against itself and not against design-source.",
  },
  {
    files: ["apps/web/tests/i18n/golden-output-fixtures.ts"],
    reason:
      "These literals are the golden manifest's hash *inputs*. Reaching them through the catalogue " +
      "would move all 304 hashes and destroy the continuity the manifest exists to prove.",
  },
  {
    files: ["apps/web/tests/support/ruled-price-copy.ts"],
    reason:
      "The ruled exception set itself: sentences a sum-word sweep is not allowed to judge, recorded " +
      "by identity. An exception recorded as a key would not be an exact-string exception.",
  },
  {
    files: ["packages/configurator-domain/src/pricing/sample-price-book.ts"],
    permittedPositions: "Property[key.name=/^(name|description)$/] > *",
    reason:
      "ADR 0106 decision 2 keeps a row's `name` and `description` required and Romanian: a book " +
      "nobody at Lemnaria authored — a manufacturer's, after M8 — still renders. Narrowed rather " +
      "than exempted, so a rejection sentence or a label in this file still fails.",
  },
];

/** One config block per file-level allowance, in the allow-list's own order. Built from the table so
 *  an entry cannot be added without its reason travelling with it. */
const romanianLiteralAllowanceBlocks = ROMANIAN_LITERAL_FILE_ALLOWANCES.map(
  ({ files, permittedPositions, reason }) => ({
    name: `6B-j allow-list: ${reason}`,
    files,
    rules: {
      "no-restricted-syntax":
        permittedPositions === undefined
          ? "off"
          : [
              "error",
              ...ROMANIAN_LITERAL_SELECTORS.map(({ selector, message }) => ({
                selector: `${selector}:not(${permittedPositions})`,
                message,
              })),
            ],
    },
  }),
);

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/next-env.d.ts",
      "design-source/**",
      // Claude Code's session-local state, which `.gitignore` already excludes. Agent worktrees are
      // checked out under `.claude/worktrees/`, so without this the recursive root run walks into a
      // second copy of every package and lints files no tsconfig covers.
      ".claude/**",
      "catalog-seed/**",
      // Supplier reference geometry, vendored verbatim for the structural-parity suite to diff
      // against. Not our source, not in any tsconfig, and deliberately not reformatted — linting it
      // would only pressure someone into "fixing" the very thing the port is compared to.
      "packages/three-adapter/reference/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Plain-JS tooling scripts: no TypeScript program backs them, so the type-aware rules cannot
    // run. They drive a browser, so callbacks handed to `page.evaluate` reference DOM globals.
    files: ["**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        Buffer: "readonly",
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        HTMLCanvasElement: "readonly",
        Image: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        URLSearchParams: "readonly",
        window: "readonly",
      },
    },
  },
  {
    files: ["packages/configurator-domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "next",
                "next/*",
                "three",
                "three/*",
                "@react-three/*",
                "@lemnaria/three-adapter",
                "@lemnaria/three-adapter/*",
                "@lemnaria/catalog-data",
                "@lemnaria/catalog-data/*",
                "@lemnaria/web",
                "@lemnaria/web/*",
                "../../apps/*",
                "../../apps/**",
                "../three-adapter",
                "../three-adapter/*",
                "../catalog-data",
                "../catalog-data/*",
              ],
              message:
                "The configurator domain must remain independent of React, Next.js, Three.js, UI, adapter, and catalog-data implementations.",
            },
          ],
        },
      ],
    },
  },
  {
    // The adapter may own Three.js, but nothing above it: it renders what it is given and never
    // reaches into React, Next.js or the application shell (ARCHITECTURE_PROPOSAL.md §3).
    files: ["packages/three-adapter/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "next",
                "next/*",
                "@react-three/*",
                "@lemnaria/web",
                "@lemnaria/web/*",
                "../../apps/*",
                "../../apps/**",
              ],
              message:
                "The three-adapter must stay free of React, Next.js and the application shell; it consumes scene contracts and returns Three.js objects.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@lemnaria/three-adapter/*",
                "@lemnaria/configurator-domain/*",
                "../../packages/*",
                "../../packages/**",
                "**/design-source/**",
              ],
              message:
                "Import workspace packages through their public entry point; design-source is reference material, not a runtime dependency.",
            },
          ],
        },
      ],
    },
  },
  {
    // **The diacritic rule, everywhere Romanian is not allowed to be authored.**
    //
    // The tests are in scope and not by extension: M6B's scope names "every hardcoded string in the
    // tests, including the domain suite's fixtures", and the tests are where the surviving literals
    // actually are. Measured at this wave's open: **none** in `apps/web/src`, ten ruled ones in the
    // domain's price book, 159 in the copy lock where they belong, and 54 elsewhere under `tests/`
    // — 21 of those in three files whose literals are the subject, 33 at individual sites.
    //
    // `src/messages/**` is the one place Romanian belongs, and `ro.d.json.ts` is its generated type.
    name: "6B-j: no Romanian literal outside the message catalogue",
    files: [
      "apps/web/src/**/*.{ts,tsx}",
      "apps/web/tests/**/*.{ts,tsx}",
      "packages/*/src/**/*.ts",
      "packages/*/tests/**/*.ts",
    ],
    ignores: ["apps/web/src/messages/**"],
    rules: {
      "no-restricted-syntax": ["error", ...ROMANIAN_LITERAL_SELECTORS],
    },
  },
  {
    // **The positional rule, `apps/web/src` only**, and it carries the diacritic selectors too.
    //
    // Both sets in one block on purpose: flat config *replaces* a rule's options rather than merging
    // them, so a second block naming `no-restricted-syntax` over the same files would silently
    // disarm the first. That is the shape of gate this milestone produced four of.
    name: "6B-j: a customer-visible string is reached by a key",
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/messages/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...ROMANIAN_LITERAL_SELECTORS,
        ...UNKEYED_JSX_TEXT_SELECTORS,
      ],
    },
  },
  ...romanianLiteralAllowanceBlocks,
);
