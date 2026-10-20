import type { Locator } from "@playwright/test";

/** The text a person sees in the element: `innerText` leaves out what the stylesheet hides, where `textContent` and
 *  `toHaveText` read all of it. */
export async function paintedTextOf(element: Locator): Promise<string> {
  return element.evaluate((node) => {
    if (!(node instanceof HTMLElement))
      throw new Error("paintedTextOf: the element is not an HTMLElement");
    return node.innerText;
  });
}
