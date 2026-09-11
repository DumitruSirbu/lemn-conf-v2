/**
 * **A length-stress catalogue, and deliberately not a locale.**
 *
 * The plan's words for what it is for: *"lengthens strings deliberately, so a translation that
 * breaks the price bar or the panel is visible before real copy arrives."* Romanian is the source
 * and it is a short language; German and Russian typically run 30–50 % longer, and the surfaces that
 * pay for that — the price bar's row, §9's panel header, the scene's warning band — are the ones
 * nobody looks at until a translator has already been paid.
 *
 * **It is a tool, so it is not in `routing.locales` and cannot become a route.** Adding a third
 * locale would put it in the switcher, in `generateStaticParams`, in the sitemap and in the
 * negotiation at the unprefixed root — a customer could reach it by typing a URL or by having the
 * wrong `Accept-Language`. Instead it is a *transform applied to a real locale's catalogue*: the
 * route, the switcher and the parity gates all still see exactly two locales, and `/ro` renders
 * padded Romanian while the flag is set. `isPseudoLocaleEnabled` answers `false` in production
 * unconditionally — there is no opt-in, because unlike `/internal/scene-shot` nothing needs to run
 * this against a deployed build.
 *
 * **The transform is ICU-aware, which is the whole of its correctness.** Argument names, formats,
 * skeletons and plural categories are structure, not text: padding `{widthMm, number, ::group-off}`
 * produces a catalogue that throws at render, and a stress tool that breaks the app it is stressing
 * measures nothing. Only literal text is touched, at every nesting depth — including inside a plural
 * branch, which is where the longest sentences in this catalogue actually live.
 */

/** The proportion of extra characters a stressed literal gains. Set from the observed 30–50 % spread
 *  between Romanian and the languages this product will be translated into; the padding is on top of
 *  the accented substitution, so a stressed string is at least this much longer than its source. */
export const PSEUDO_LOCALE_EXPANSION = 0.4;

/** Padding, and the two marks that make a **cut** string distinguishable from a short one: a surface
 *  that truncates loses its closing mark, which is visible at a glance in a screenshot. */
const PADDING_CHARACTER = "·";
export const PSEUDO_LOCALE_OPENING_MARK = "⟦";
export const PSEUDO_LOCALE_CLOSING_MARK = "⟧";

/** ASCII letters mapped to accented look-alikes, so an encoding fault shows up as mojibake rather
 *  than as a string that merely looks fine. Romanian's own diacritics are left alone: they are
 *  already outside ASCII and are what the surfaces are drawn against. */
const ACCENTED_LOOKALIKES: Readonly<Record<string, string>> = {
  a: "ä",
  c: "ç",
  e: "é",
  i: "ï",
  n: "ñ",
  o: "ö",
  s: "š",
  u: "ü",
  y: "ÿ",
  A: "Ä",
  C: "Ç",
  E: "É",
  I: "Ï",
  N: "Ñ",
  O: "Ö",
  S: "Š",
  U: "Ü",
  Y: "Ÿ",
};

export const PSEUDO_LOCALE_FLAG = "LEMNARIA_ENABLE_PSEUDO_LOCALE";

/** Only this exact value opts in, so a stray `false`/`0`/`off` cannot read as "enabled" — the same
 *  rule `scene-shot`'s route flag uses, for the same reason. */
export const PSEUDO_LOCALE_FLAG_ENABLED = "1";

/**
 * Whether the running process should serve stressed copy.
 *
 * **Production is refused outright rather than gated**, which is where this differs from
 * `isSceneShotRouteEnabled`: the scene-shot route has a caller that needs it against a real build,
 * and this has none. A customer must not be able to reach padded copy by any configuration.
 */
export function isPseudoLocaleEnabled(
  environment: Record<string, string | undefined>,
): boolean {
  if (environment.NODE_ENV === "production") return false;
  return environment[PSEUDO_LOCALE_FLAG] === PSEUDO_LOCALE_FLAG_ENABLED;
}

/**
 * One message, lengthened without its ICU structure being touched.
 *
 * **Brace depth decides what is text**, and the parity is exact rather than a heuristic: an ICU
 * message alternates message → argument → branch body → argument → branch body, so odd depths are
 * argument specifications (`name`, `count, plural, one `, `widthMm, number, ::group-off`) and even
 * depths are literal text. `#` and the catalogue's own diacritics pass through untouched; the
 * catalogue contains no `'` escapes and no markup tags, which is asserted by the tool's own tests.
 */
export function pseudoLocalizeMessage(message: string): string {
  const parts = literalRunsOf(message).map(({ isLiteral, text }) =>
    isLiteral ? stressLiteral(text) : text,
  );
  return `${PSEUDO_LOCALE_OPENING_MARK}${parts.join("")}${PSEUDO_LOCALE_CLOSING_MARK}`;
}

/**
 * **How many letters of a message this tool can lengthen** — the letters of its literal text, and
 * not those of its argument names and formats.
 *
 * Published because it is what a caller has to know to state the stress as a proportion. `Pasul
 * {step, number} din {totalSteps, number}` carries 34 letters and only 8 of them are words; a check
 * written against the whole string's length would be asking the transform to pad an argument name.
 */
export function stressableLetterCountOf(message: string): number {
  return literalRunsOf(message)
    .filter(({ isLiteral }) => isLiteral)
    .reduce((total, { text }) => total + letterCountOf(text), 0);
}

interface MessageRun {
  /** Whether the run is text a translator writes, rather than an argument specification. */
  readonly isLiteral: boolean;
  readonly text: string;
}

/** The message split at its braces, each run marked as text or as specification. The braces
 *  themselves are runs so joining the pieces reproduces the message exactly. */
function literalRunsOf(message: string): readonly MessageRun[] {
  const runs: MessageRun[] = [];
  let depth = 0;
  let text = "";
  const closeRun = (): void => {
    runs.push({ isLiteral: depth % 2 === 0, text });
    text = "";
  };

  for (const character of message) {
    if (character !== "{" && character !== "}") {
      text += character;
      continue;
    }
    closeRun();
    depth += character === "{" ? 1 : -1;
    runs.push({ isLiteral: false, text: character });
  }
  closeRun();

  return runs;
}

/** A whole catalogue, leaf by leaf, in its own shape — the namespaces and key order are untouched,
 *  so the stressed tree is a drop-in for the one `createTranslator` was going to be handed. */
export function pseudoLocalizeCatalogue<TCatalogue>(
  catalogue: TCatalogue,
): TCatalogue {
  return stressNode(catalogue) as TCatalogue;
}

function stressNode(node: unknown): unknown {
  if (typeof node === "string") return pseudoLocalizeMessage(node);
  if (node === null || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, stressNode(value)]),
  );
}

/** A literal run: accented, then padded in proportion to the letters it actually carries. A run of
 *  punctuation alone — the `/` between two numbers in the step pill — gains nothing, because there
 *  is no word there for a translator to make longer. */
function stressLiteral(literal: string): string {
  const accented = Array.from(
    literal,
    (character) => ACCENTED_LOOKALIKES[character] ?? character,
  ).join("");
  const padding = PADDING_CHARACTER.repeat(
    Math.ceil(letterCountOf(literal) * PSEUDO_LOCALE_EXPANSION),
  );
  return `${accented}${padding}`;
}

export function letterCountOf(text: string): number {
  return Array.from(text).filter((character) => /\p{L}/u.test(character))
    .length;
}
