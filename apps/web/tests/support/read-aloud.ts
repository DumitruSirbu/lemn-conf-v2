// What a screen reader would say for a piece of the page, in reading order: the text, the names, and nothing from a
// subtree marked `aria-hidden`. A model of the accessibility tree's text, not an implementation of the accname spec: it
// is deliberately the pessimistic reading, so a duplicated name shows up as a duplicated utterance.
//
//  - `aria-hidden="true"` and `hidden` subtrees are skipped.
//  - A button or link (or an element with that role) is read as its name and not descended into: `aria-labelledby`, else
//    `aria-label`, else its content. A name that points at an id nothing holds is empty, as in a browser.
//  - Any other element carrying `aria-labelledby` or `aria-label` says that name, then its children are read as well: a
//    labelled group is announced and then its content is read, which is exactly the double reading this exists to catch.

const NAMED_BY_ITSELF = new Set(["button", "link"]);

export function utterancesOf(root: Element): string[] {
  const utterances: string[] = [];
  readInto(root, utterances);
  return utterances;
}

/** The name a browser computes for this element: `aria-labelledby`, else `aria-label`, else its read content. */
export function accessibleNameOf(element: Element): string {
  const given = nameGivenTo(element);
  if (given !== "") return given;
  if (element.hasAttribute("aria-labelledby")) return "";
  return utterancesOfChildren(element).join(" ");
}

function readInto(node: Node, utterances: string[]): void {
  if (node instanceof Text) {
    const text = node.textContent.trim();
    if (text !== "") utterances.push(text);
    return;
  }
  if (!(node instanceof Element) || isHiddenFromReaders(node)) return;
  if (isNamedByItself(node)) {
    const name = accessibleNameOf(node);
    if (name !== "") utterances.push(name);
    return;
  }
  const ownName = nameGivenTo(node);
  if (ownName !== "") utterances.push(ownName);
  for (const child of node.childNodes) readInto(child, utterances);
}

function nameGivenTo(element: Element): string {
  const labelledby = element.getAttribute("aria-labelledby");
  if (labelledby !== null) {
    return labelledby
      .split(/\s+/)
      .filter((id) => id !== "")
      .map((id) => element.ownerDocument.getElementById(id)?.textContent.trim())
      .filter((text): text is string => text !== undefined && text !== "")
      .join(" ");
  }
  return element.getAttribute("aria-label")?.trim() ?? "";
}

function utterancesOfChildren(element: Element): string[] {
  const utterances: string[] = [];
  for (const child of element.childNodes) readInto(child, utterances);
  return utterances;
}

function isHiddenFromReaders(element: Element): boolean {
  return (
    element.getAttribute("aria-hidden") === "true" ||
    element.hasAttribute("hidden")
  );
}

function isNamedByItself(element: Element): boolean {
  return NAMED_BY_ITSELF.has(roleOf(element));
}

function roleOf(element: Element): string {
  const explicit = element.getAttribute("role");
  if (explicit !== null) return explicit;
  if (element.tagName === "BUTTON") return "button";
  if (element.tagName === "A" && element.hasAttribute("href")) return "link";
  return "";
}
