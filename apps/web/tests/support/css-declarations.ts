// Every declaration of one property that lands on one class, read over the whole stylesheet.
//
// A test that reads the first rule matching a selector agrees with a stylesheet whose later rule undoes it:
// the declaration it looked for is still in the text, and the cascade no longer paints it. Nothing in this
// process computes a layout, so what a stylesheet test can hold is the complete list — every rule whose
// subject is the class, inside or outside a media query, with the value it declares. An override is then
// one more entry in a list the test wrote out in full.

export interface CssDeclaration {
  /** The one selector of the rule's list whose subject is the class, as written. */
  readonly selector: string;
  /** The enclosing at-rule's own text (`@media (min-width: 900px)`), or `""` at the top level. */
  readonly media: string;
  /** The declared value as written, `!important` included. */
  readonly value: string;
}

interface CssRule {
  readonly selectors: readonly string[];
  readonly media: string;
  readonly body: string;
}

const CONDITIONAL_AT_RULE = /^@(media|supports|container)\b/;

/** Every declaration of `property` on a rule whose subject is `.className`, in source order. */
export function declarationsFor(
  css: string,
  className: string,
  property: string,
): readonly CssDeclaration[] {
  return rulesOf(withoutComments(css), "").flatMap((rule) =>
    rule.selectors
      .filter((selector) => isSubjectOf(selector, className))
      .flatMap((selector) =>
        valuesOf(rule.body, property).map((value) => ({
          selector,
          media: rule.media,
          value,
        })),
      ),
  );
}

/** The values alone, for the usual case of one rule: `["sticky"]` reads as "declared once, and as this". */
export function valuesFor(
  css: string,
  className: string,
  property: string,
): readonly string[] {
  return declarationsFor(css, className, property).map(({ value }) => value);
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function rulesOf(css: string, media: string): readonly CssRule[] {
  const rules: CssRule[] = [];
  let cursor = 0;
  for (;;) {
    const open = css.indexOf("{", cursor);
    if (open < 0) return rules;
    const close = matchingBrace(css, open);
    const prelude = css.slice(cursor, open).trim();
    const body = css.slice(open + 1, close);
    cursor = close + 1;
    if (CONDITIONAL_AT_RULE.test(prelude)) {
      rules.push(...rulesOf(body, prelude));
    } else if (!prelude.startsWith("@")) {
      rules.push({
        selectors: prelude.split(",").map((selector) => selector.trim()),
        media,
        body,
      });
    }
  }
}

function matchingBrace(css: string, open: number): number {
  let depth = 0;
  for (let at = open; at < css.length; at += 1) {
    if (css[at] === "{") depth += 1;
    if (css[at] === "}") depth -= 1;
    if (depth === 0) return at;
  }
  throw new Error("the stylesheet opens a block it never closes");
}

/** Whether the selector's last compound names the class: `.a .b:hover` is about `.b`, not `.a`. */
function isSubjectOf(selector: string, className: string): boolean {
  const lastCompound = selector.split(/[\s>+~]+/).at(-1) ?? "";
  return new RegExp(`\\.${className}(?![\\w-])`).test(lastCompound);
}

function valuesOf(body: string, property: string): readonly string[] {
  return body
    .split(";")
    .map((declaration) => declaration.split(":"))
    .filter(([name]) => name?.trim() === property)
    .map(([, ...value]) => value.join(":").trim());
}
