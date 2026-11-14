// The hardware, the materials and the accessory screens draw their lists and pages from one shared sheet. A class a screen leaves out of
// its own sheet's `composes` is undefined in its markup, so its element is drawn bare while every stylesheet test, which
// reads the two sheets joined, stays green.
import { describe, expect, it } from "vitest";

import {
  declarationsOfRule,
  readItemScreenSheet,
  sharedClassesNotComposed,
} from "../support/item-screen-stylesheet";

describe("a screen takes every class of the shared item sheet", () => {
  it.each([
    "hardware.module.css",
    "material.module.css",
    "accessory.module.css",
  ])("%s composes all of them", (screenSheetName) => {
    expect(sharedClassesNotComposed(screenSheetName)).toEqual([]);
  });
});

describe("the availability status of an item's page (ADR 0184)", () => {
  it("is drawn as text: the shared sheet has no switch rule and the status invites no press", () => {
    const sheet = readItemScreenSheet("item-screen.module.css");
    const statusRules = [".status", ".statusLabel", ".statusBadge"].map(
      (selector) => declarationsOfRule("item-screen.module.css", selector),
    );

    expect(sheet).not.toMatch(/\.switch\b/);
    for (const rule of statusRules) {
      expect(Object.keys(rule).length).toBeGreaterThan(0);
      expect(rule.cursor).toBeUndefined();
    }
  });

  it("says the off reason in a tone and weight that the hint above the button does not have", () => {
    const reason = declarationsOfRule("item-screen.module.css", ".reason");
    const hint = declarationsOfRule("item-screen.module.css", ".hint");

    expect(reason.color).toBeDefined();
    expect(reason.color).not.toBe(hint.color);
    expect(reason.font).not.toBe(hint.font);
  });
});
