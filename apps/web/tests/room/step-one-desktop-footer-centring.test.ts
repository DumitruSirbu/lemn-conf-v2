// **Guards that the desktop Step 1 footer rules declare `align-items: center`** — M7C wave C1
// slice S1, FB-007 and FB-009 (frames: D1A `:92`, D1B `:190`). It pins the declaration in the two
// desktop rules and is the guard a pull request runs. It does not prove the controls are centred: a
// later rule overriding `align-items`, or a child's `align-self`, would leave this green. Computed
// layout is measured by `tests/e2e/qa-m7c-c1-footer-centring.adversarial.desktop.e2e.spec.ts`.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOM_CSS = readFileSync(
  resolve(import.meta.dirname, "../../src/room/room.module.css"),
  "utf8",
);
const DESKTOP_BRANCH = ROOM_CSS.slice(
  ROOM_CSS.indexOf("@media (min-width: 900px)"),
);

/** The declaration block of the desktop branch's rule whose whole selector list is `selectors`. */
function desktopRuleBody(selectors: readonly string[]): string {
  const list = selectors.map((name) => `\\${name}`).join(",\\s*");
  const match = new RegExp(`(?:^|\\n)\\s*${list}\\s*\\{([^{}]*)\\}`).exec(
    DESKTOP_BRANCH,
  );
  if (match?.[1] === undefined) {
    throw new Error(`No desktop rule is declared for ${selectors.join(", ")}.`);
  }
  return match[1];
}

describe("the desktop Step 1 footers", () => {
  it("centres the shape screen's footer control on the cross axis", () => {
    expect(desktopRuleBody([".footer"])).toMatch(/align-items:\s*center\s*;/);
  });

  it("centres the dimensions and composition footers' controls on the cross axis", () => {
    const body = desktopRuleBody([".dimensionsFooter", ".composeFooter"]);

    expect(body).toMatch(/align-items:\s*center\s*;/);
  });

  it("keeps the frame's 88 px height, which the centring is measured against", () => {
    expect(desktopRuleBody([".footer"])).toMatch(/height:\s*88px\s*;/);
  });
});
