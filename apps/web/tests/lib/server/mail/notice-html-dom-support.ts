import { Window } from "happy-dom";

/** The notice as a browser would parse it: the oracle for markup, independent of how the template escapes. */
export interface ParsedNotice {
  readonly document: Document;
  readonly elements: readonly Element[];
}

export function parseNotice(html: string): ParsedNotice {
  const window = new Window();
  const document = new window.DOMParser().parseFromString(
    html,
    "text/html",
  ) as unknown as Document;
  return { document, elements: [...document.querySelectorAll("*")] };
}

export function tagSequenceOf(parsed: ParsedNotice): string[] {
  return parsed.elements.map((element) => element.tagName.toLowerCase());
}

/** The element's own text, without its children's: what a slot holding one value shows. */
export function ownTextOf(element: Element): string {
  return [...element.childNodes]
    .filter((node) => node.nodeType === TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("");
}

const TEXT_NODE = 3;

/** The inline declarations of an element, by property, lower-cased, last one winning as in CSS. */
export function inlineStyleOf(element: Element): ReadonlyMap<string, string> {
  const declarations = (element.getAttribute("style") ?? "")
    .split(";")
    .map((declaration) => declaration.split(":"))
    .filter(([property]) => (property ?? "").trim() !== "")
    .map(
      ([property, ...value]) =>
        [
          (property ?? "").trim().toLowerCase(),
          value.join(":").trim().toLowerCase(),
        ] as const,
    );
  return new Map(declarations);
}

/** The nearest declaration of `property` on the element or an ancestor. */
export function inheritedStyle(
  element: Element,
  property: string,
): string | undefined {
  for (
    let current: Element | null = element;
    current !== null;
    current = current.parentElement
  ) {
    const value = inlineStyleOf(current).get(property);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function isHidden(element: Element): boolean {
  for (
    let current: Element | null = element;
    current !== null;
    current = current.parentElement
  ) {
    if (inlineStyleOf(current).get("display") === "none") return true;
  }
  return false;
}

/** WCAG 2.x relative luminance contrast of two `#rrggbb` colours. */
export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminanceOf(first), luminanceOf(second)].sort(
    (a, b) => b - a,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const HEX_COLOUR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/;

function luminanceOf(hex: string): number {
  const match = HEX_COLOUR.exec(hex);
  if (match === null) throw new Error(`not a #rrggbb colour: ${hex}`);
  const [red, green, blue] = match
    .slice(1)
    .map((channel) => linearChannel(Number.parseInt(channel, 16) / 255));
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

function linearChannel(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
