/**
 * A length-stress catalogue, deliberately not a locale: it lengthens strings so a translation that
 * breaks the price bar, §9's panel header or the scene's warning band shows before real copy arrives
 * (German and Russian typically run 30-50 % longer than Romanian).
 *
 * It is a transform applied to a real locale's catalogue, not an entry in `routing.locales`: a third
 * locale would reach the switcher, `generateStaticParams`, the sitemap and root negotiation, so a
 * customer could reach it by URL or `Accept-Language`. `isPseudoLocaleEnabled` answers `false` in
 * production unconditionally, since nothing needs to run this against a deployed build.
 *
 * The transform is ICU-aware, which is the whole of its correctness: argument names, formats,
 * skeletons and plural categories are structure, and padding `{widthMm, number, ::group-off}` would
 * throw at render. Only literal text is touched, at every nesting depth, plural branches included.
 */

/** The proportion of extra characters a stressed literal gains, from the 30-50 % spread between
 *  Romanian and the target languages. The padding is on top of the accented substitution. */
export const PSEUDO_LOCALE_EXPANSION = 0.4;

/** Padding, and the two marks that make a cut string distinguishable from a short one: a surface
 *  that truncates loses its closing mark. */
const PADDING_CHARACTER = "·";
export const PSEUDO_LOCALE_OPENING_MARK = "⟦";
export const PSEUDO_LOCALE_CLOSING_MARK = "⟧";

/** ASCII letters mapped to accented look-alikes, so an encoding fault shows as mojibake. Romanian's
 *  own diacritics are left alone. */
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

/** Only this exact value opts in, so a stray `false`/`0`/`off` cannot read as enabled. */
export const PSEUDO_LOCALE_FLAG_ENABLED = "1";

/** Production is refused outright, not gated, unlike `isSceneShotRouteEnabled`: no customer may reach
 *  padded copy by any configuration. */
export function isPseudoLocaleEnabled(
  environment: Record<string, string | undefined>,
): boolean {
  if (environment.NODE_ENV === "production") return false;
  return environment[PSEUDO_LOCALE_FLAG] === PSEUDO_LOCALE_FLAG_ENABLED;
}

/**
 * One message, lengthened without touching its ICU structure. Brace depth decides what is text: odd
 * depths are argument specifications (`name`, `count, plural, one `, `widthMm, number, ::group-off`)
 * and even depths are literal text. `#` and diacritics pass through; the catalogue must contain no
 * `'` escapes or markup tags, which would break this parity.
 */
export function pseudoLocalizeMessage(message: string): string {
  const parts = literalRunsOf(message).map(({ isLiteral, text }) =>
    isLiteral ? stressLiteral(text) : text,
  );
  return `${PSEUDO_LOCALE_OPENING_MARK}${parts.join("")}${PSEUDO_LOCALE_CLOSING_MARK}`;
}

/**
 * How many letters of a message this tool can lengthen: those of its literal text, not of argument
 * names and formats. `Pasul {step, number} din {totalSteps, number}` has 34 letters, only 8 of them
 * words, so a proportion over the whole string would ask the transform to pad an argument name.
 */
export function stressableLetterCountOf(message: string): number {
  return literalRunsOf(message)
    .filter(({ isLiteral }) => isLiteral)
    .reduce((total, { text }) => total + letterCountOf(text), 0);
}

interface MessageRun {
  /** Text a translator writes, rather than an argument specification. */
  readonly isLiteral: boolean;
  readonly text: string;
}

/** The message split at its braces; the braces are runs too, so joining reproduces the message. */
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

/** A whole catalogue, leaf by leaf, with namespaces and key order untouched, so it is a drop-in for
 *  the one `createTranslator` would be handed. */
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

/** A literal run: accented, then padded in proportion to the letters it carries, so a run of
 *  punctuation alone (the `/` in the step pill) gains nothing. */
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
