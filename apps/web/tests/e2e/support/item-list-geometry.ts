import { type Locator, type Page } from "@playwright/test";

// What the desktop specs of an item screen's list ask of its layout: whether a table title runs into the next one, and
// whether a box is the topmost thing where it stands. Read in the browser, from the boxes it drew.

/** The table's titles whose text runs into the next title's text, named with the overlap in pixels. */
export function overlappingTitles(
  page: Page,
  listTestId: string,
): Promise<string[]> {
  return page.evaluate((testId) => {
    const titles = [
      ...document.querySelectorAll(
        `[data-testid="${testId}"] > [aria-hidden="true"] > span`,
      ),
    ];
    const found: string[] = [];
    for (const [index, title] of titles.entries()) {
      const next = titles[index + 1];
      if (next === undefined) continue;
      const text = document.createRange();
      text.selectNodeContents(title);
      const textRight = Math.max(
        ...Array.from(text.getClientRects()).map((rect) => rect.right),
      );
      const overlap = textRight - next.getBoundingClientRect().left;
      if (overlap > 0) {
        found.push(
          `"${title.textContent.trim()}" runs ${overlap.toFixed(1)} px into the next title`,
        );
      }
    }
    return found;
  }, listTestId);
}

/** The table's titles whose text is wider than their own box, named. */
export function clippedTitles(
  page: Page,
  listTestId: string,
): Promise<string[]> {
  return page.evaluate((testId) => {
    const titles = [
      ...document.querySelectorAll(
        `[data-testid="${testId}"] > [aria-hidden="true"] > span`,
      ),
    ];
    return titles.flatMap((title) => {
      if (!(title instanceof HTMLElement)) return [];
      const text = document.createRange();
      text.selectNodeContents(title);
      const wanted = Math.ceil(text.getBoundingClientRect().width);
      return wanted > title.clientWidth + 1
        ? [
            `"${title.textContent.trim()}" wants ${String(wanted)} of ${String(title.clientWidth)} px`,
          ]
        : [];
    });
  }, listTestId);
}

/** Whether the box's centre point lands on the box itself or something inside it, and not on a box drawn over it. */
export function isTopmostAtCentre(target: Locator): Promise<boolean> {
  return target.evaluate((element) => {
    const { left, top, width, height } = element.getBoundingClientRect();
    const hit = document.elementFromPoint(left + width / 2, top + height / 2);
    return hit !== null && element.contains(hit);
  });
}
