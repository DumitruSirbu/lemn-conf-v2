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

/** **The mockup's example room, banned as a number under `apps/web/src/room`** — M7 criterion 16.
 *
 *  Frame 1B draws a 3,60 × 2,40 m room 2,60 m high. Those three figures are that drawing's example,
 *  not the product's rule: a room's bounds are `room/approved-room-policy.ts`'s to state, and the
 *  plan's scale is derived from the lengths the customer typed. A module that spells one of them has
 *  taken a measurement off a picture, which is the defect M7 wave 7F1 exists to keep out of the room
 *  screen while it is being written.
 *
 *  **The literal, never the characters.** `3600` is already under this directory, in
 *  `parse-metres.ts`'s head comment explaining that `3,6000` is 3600 mm — so a text gate would have
 *  been red the day it landed and would have needed an exclusion that hollowed it out. A selector
 *  reads the number the code builds against and leaves the prose quoting it alone, which is this
 *  file's head comment's argument for the Romanian gate, applied again. */
const ROOM_EXAMPLE_DIMENSIONS = [
  { value: 3600, drawnAs: "wall A, 3,60 m" },
  { value: 2400, drawnAs: "wall B, 2,40 m" },
  { value: 2600, drawnAs: "the room height, 2,60 m" },
];

const ROOM_EXAMPLE_DIMENSION_SELECTORS = ROOM_EXAMPLE_DIMENSIONS.map(
  ({ value, drawnAs }) => ({
    selector: `Literal[value=${String(value)}]`,
    message:
      `${String(value)} is frame 1B's ${drawnAs}, and the mockup's example is an example. A room's ` +
      "bounds come from the approved room policy; the plan's scale is derived from the draft. Quote " +
      "the figure in a comment if it explains something — do not build against it (M7 criterion 16).",
  }),
);

/** **`window.history` is not a way to write the room's URL** — M7 wave 7F1-D45, criterion 9.
 *
 *  `history.replaceState` updates the address bar and the client hooks, and Next's own record of the
 *  history entry does **not** follow it — so on a browser Back the router restores the URL it
 *  recorded and the room the customer typed is gone. That is defect D4, measured in a production
 *  build, and ruling R9 replaces the call with a debounced `router.replace`. The ban is a rule rather
 *  than a promise because the native call is the obvious thing to reach for, it looks like it works,
 *  and it fails one traversal later.
 *
 *  **Partial survival is not a reason to soften this.** The gate's log shows at least one
 *  `replaceState`-written key surviving a traversal while the later ones did not. A write path that
 *  persists some keys and silently drops others is worse than one that reliably persists none,
 *  because nothing at the call site can be reasoned about.
 *
 *  The selector reads the member expression rather than the text, so prose naming the call — this
 *  comment, and `room-query-sync.ts`'s — is exempt for free. */
const ROOM_HISTORY_WRITE_SELECTORS = [
  {
    selector:
      "MemberExpression[property.name=/^(pushState|replaceState)$/]" +
      ":matches([object.name='history'], [object.property.name='history'])",
    message:
      "window.history.pushState/replaceState does not update Next's record of the history entry, " +
      "so a browser Back restores the URL the router recorded and the typed room is lost (defect " +
      "D4). Write the query through a debounced router.replace — see src/room/room-query-sync.ts " +
      "(M7 criterion 9, ruling R9).",
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
    files: ["apps/web/src/i18n/locale-endonyms.ts"],
    permittedPositions: "Property[key.name='ro'] > *",
    reason:
      "The language menu names each language in its own language, so `Română` here is not Romanian " +
      "copy — it is the same string in every locale and would need N² identical catalogue leaves. " +
      "Narrowed to the `ro` property, so a Romanian sentence anywhere else in the file still fails.",
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

// **A relative import that climbs out of its package into another workspace directory**, at any
// depth of `../`. A `regex` pattern rather than a `group` glob, because the glob can only be wrong one
// of two ways: anchored at one depth (`../../apps/*`), it never matches a module under `src/**`, which
// sits deeper; unanchored (`**/apps/**`), it also matches a bare specifier that merely has an `apps`
// or `packages` segment, such as `next/dist/compiled/packages/x`. Anchored at the start, so only a
// path beginning `./` or `../` can match. `directories` is a regex alternation.
function relativeClimbInto(directories) {
  return `^(?:\\./)?(?:\\.\\./)+(?:${directories})(?:/|$)`;
}

const DOMAIN_IMPORT_BOUNDARY =
  "The configurator domain must remain independent of React, Next.js, Three.js, UI, adapter, and catalog-data implementations.";
const ADAPTER_IMPORT_BOUNDARY =
  "The three-adapter must stay free of React, Next.js and the application shell; it consumes scene contracts and returns Three.js objects.";
const WEB_IMPORT_BOUNDARY =
  "Import workspace packages through their public entry point; design-source is reference material, not a runtime dependency.";

const DOMAIN_IMPORT_PATTERNS = [
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
    ],
    message: DOMAIN_IMPORT_BOUNDARY,
  },
  {
    regex: relativeClimbInto(
      "apps|(?:packages/)?(?:three-adapter|catalog-data)",
    ),
    message: DOMAIN_IMPORT_BOUNDARY,
  },
];

/** **The shell design clips nothing and removes nothing** — ADR 0090 Amendment B4, ADR 0110 Amendment B.
 *
 *  The generation starts from a shell whose free runs are recorded as empty space. Clipping those
 *  columns at a wall end is the void engine's published-face pass, and removing a placement is a
 *  command; a shell that did either itself would carry a second, private copy of a rule the engine
 *  already owns. This replaces three tests that read `shell-design.ts` as text.
 *
 *  **The reach.** `importNames` on a match-everything pattern covers a named import from any module —
 *  `void-engine.js` re-exports the clip, so naming the defining file alone would miss it — and a
 *  namespace import (`import * as engine`) of any module, because ESLint reports a namespace import
 *  against a restricted name. Dynamic `import()` and `require` are separate syntax and are listed.
 *  `no-new-func` closes `new Function("return …")`.
 *
 *  **The second pass.** Three forms the first pass let through, each caught by a source-text test:
 *  `module.require(…)` (a member call ending in `require`), a *local* `function
 *  clipEmptyColumnsAtWallEnd` declared and called in the file (any `Identifier` carrying either name,
 *  whatever it is bound to), and a bare side-effect `import "…/clip-empty-columns-at-wall-end.js"`
 *  (a path restriction on the two defining modules, with no `importNames`).
 *
 *  **Where the reach is narrower than the name.** The path restriction covers the two defining modules
 *  only: `body-probe.ts` and `pricing/*` — which the adversarial test also keeps out of the shell — are
 *  not listed, and that test still guards them by loaded value. An alias of the clip made from a
 *  re-export under another name, and `const { require: load } = module`, are not seen. A string
 *  built at run time and passed to `module.require` is caught as the member call, not as a path.
 *  Nothing here stops the shell calling the void engine's other passes. */
const SHELL_DESIGN_FORBIDDEN_NAMES = [
  "clipEmptyColumnsAtWallEnd",
  "removePlacement",
];

const SHELL_DESIGN_MUST_NOT_CLIP_OR_REMOVE =
  "The shell design must not clip empty columns at a wall end or remove a placement itself; it " +
  "reaches the clip only through the void engine (ADR 0090 Amendment B4, ADR 0110 Amendment B).";

const SHELL_DESIGN_IMPORT_PATTERN = {
  group: ["**"],
  importNames: SHELL_DESIGN_FORBIDDEN_NAMES,
  message: SHELL_DESIGN_MUST_NOT_CLIP_OR_REMOVE,
};

const SHELL_DESIGN_FORBIDDEN_MODULE_PATTERNS = [
  "clip-empty-columns-at-wall-end",
  "commands/remove-placement",
].map((modulePath) => ({
  regex: `(?:^|/)${modulePath}(?:\\.[jt]s)?$`,
  message: `Even a bare side-effect import of ${modulePath} is a way round the name rule. ${SHELL_DESIGN_MUST_NOT_CLIP_OR_REMOVE}`,
}));

const SHELL_DESIGN_LATE_BINDING_SELECTORS = [
  {
    selector: "ImportExpression",
    message: `A dynamic import() is a way round the import rule. ${SHELL_DESIGN_MUST_NOT_CLIP_OR_REMOVE}`,
  },
  {
    selector: "CallExpression[callee.name='require']",
    message: `require() is a way round the import rule. ${SHELL_DESIGN_MUST_NOT_CLIP_OR_REMOVE}`,
  },
  {
    selector:
      "MemberExpression:matches([computed=false][property.name='require'], [property.value='require'])",
    message: `module.require() and globalThis.require() are ways round the import rule. ${SHELL_DESIGN_MUST_NOT_CLIP_OR_REMOVE}`,
  },
  {
    selector: `Identifier[name=/^(${SHELL_DESIGN_FORBIDDEN_NAMES.join("|")})$/]`,
    message: `The name is reserved, whether imported, declared locally or called. ${SHELL_DESIGN_MUST_NOT_CLIP_OR_REMOVE}`,
  },
];

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
          patterns: DOMAIN_IMPORT_PATTERNS,
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
              ],
              message: ADAPTER_IMPORT_BOUNDARY,
            },
            {
              regex: relativeClimbInto("apps"),
              message: ADAPTER_IMPORT_BOUNDARY,
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
                "**/design-source/**",
              ],
              message: WEB_IMPORT_BOUNDARY,
            },
            {
              regex: relativeClimbInto("packages"),
              message: WEB_IMPORT_BOUNDARY,
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
  {
    // **The room's own gate, and why it re-declares two lists it does not own.**
    //
    // This block names `no-restricted-syntax` over a *subset* of the files the block directly above
    // covers, and flat config replaces a rule's options rather than merging them — so spelling only
    // the new selectors here would disarm both of that block's gates for exactly this directory,
    // the one M7 grows the most new JSX text in. Its comment says so; this is that warning obeyed.
    // The four lists therefore travel together, and
    // `apps/web/tests/lint/room-example-dimensions.test.ts` asserts all four still fire.
    //
    // **Adding to this block means re-declaring every list already in it.** Wave 7F1-D45 added the
    // fourth; dropping a spread while adding one is the exact failure that test exists to catch.
    name: "7F1: the room screen builds against no drawn example dimension",
    files: ["apps/web/src/room/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...ROMANIAN_LITERAL_SELECTORS,
        ...UNKEYED_JSX_TEXT_SELECTORS,
        ...ROOM_EXAMPLE_DIMENSION_SELECTORS,
        ...ROOM_HISTORY_WRITE_SELECTORS,
      ],
    },
  },
  {
    // **The shell design's own gate, and why it re-declares two lists it does not own.**
    //
    // `no-restricted-imports` and `no-restricted-syntax` are both already set for this file by the
    // domain-boundary block and the 6B-j diacritic block above, and flat config replaces a rule's
    // options rather than merging them — so this block spells those entries again and adds its own.
    // Dropping a spread here would silently switch off the domain's import boundary or the Romanian
    // gate for exactly this file. Adding to this block means re-declaring every list already in it.
    name: "shell design: no clip and no remove of its own",
    files: ["packages/configurator-domain/src/generation/shell-design.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...DOMAIN_IMPORT_PATTERNS,
            SHELL_DESIGN_IMPORT_PATTERN,
            ...SHELL_DESIGN_FORBIDDEN_MODULE_PATTERNS,
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...ROMANIAN_LITERAL_SELECTORS,
        ...SHELL_DESIGN_LATE_BINDING_SELECTORS,
      ],
      "no-new-func": "error",
    },
  },
  ...romanianLiteralAllowanceBlocks,
);
