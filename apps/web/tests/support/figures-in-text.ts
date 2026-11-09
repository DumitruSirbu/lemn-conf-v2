// What a screen with no price must not say: an amount, or a bare zero standing where a figure would. The zero
// pattern is for text and accessibility attributes, so it also catches the placeholders a broken render prints.
export const AN_AMOUNT = /\d[\d\s]*(MDL|lei)/u;

/** A 0 that stands alone, a signed one, `NaN` or `undefined`: not 600, 700 mm, a hex colour or a `+1` counter. */
export const A_BARE_ZERO = /(^|[^\d.,#\w])[+-]?0([^\d.,]|$)|NaN|undefined/u;

/** A 0 with a unit after it: the figure a price or a percentage would be. */
export const A_ZERO_WITH_A_UNIT =
  /(^|[^\d])[+-]?0(\s*%|\s*(MDL|lei))|NaN|undefined/u;

/** Everything a person or a screen reader could be told by a subtree: its text and the attributes that carry words. */
export function everythingSaidIn(container: HTMLElement): string {
  const elements = [container, ...container.querySelectorAll<HTMLElement>("*")];
  return elements
    .flatMap((element) => [
      ...[...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("alt"),
    ])
    .filter((said): said is string => said !== null && said.trim() !== "")
    .join(" | ");
}

export function occurrencesOf(needle: string, haystack: string): number {
  return haystack.split(needle).length - 1;
}
