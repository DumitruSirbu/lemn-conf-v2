// **Guards that the desktop Step 1 footer rules declare `align-items: center`** — M7C wave C1
// slice S1, FB-007 and FB-009 (frames: D1A `:92`, D1B `:190`). It pins the declaration in the two
// desktop rules and is the guard a pull request runs. It does not prove the controls are centred: a
// child's `align-self` would leave this green, though a later rule overriding `align-items` no longer does. Computed
// layout is measured by `tests/e2e/qa-m7c-c1-footer-centring.adversarial.desktop.e2e.spec.ts`.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { declarationsFor } from "../support/css-declarations";

const ROOM_CSS = readFileSync(
  resolve(import.meta.dirname, "../../src/room/room.module.css"),
  "utf8",
);
const DESKTOP = "@media (min-width: 900px)";

/** Every declaration of the property on the footer, anywhere in the sheet, as `[media, value]`. The whole list, so
 *  that a later desktop rule undoing the first is a second entry rather than text the first rule still holds. */
function declaredOn(
  className: string,
  property: string,
): readonly (readonly [string, string])[] {
  return declarationsFor(ROOM_CSS, className, property).map(
    ({ media, value }) => [media, value] as const,
  );
}

describe("the desktop Step 1 footers", () => {
  it("centres the shape screen's footer control on the cross axis", () => {
    expect(declaredOn("footer", "align-items")).toEqual([[DESKTOP, "center"]]);
  });

  it("centres the dimensions and composition footers' controls on the cross axis", () => {
    expect(declaredOn("dimensionsFooter", "align-items")).toEqual([
      [DESKTOP, "center"],
    ]);
    expect(declaredOn("composeFooter", "align-items")).toEqual([
      [DESKTOP, "center"],
    ]);
  });

  it("keeps the frame's 88 px height, which the centring is measured against", () => {
    expect(declaredOn("footer", "height")).toEqual([[DESKTOP, "88px"]]);
  });
});
