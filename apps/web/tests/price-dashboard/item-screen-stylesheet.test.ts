// The hardware, the materials and the accessory screens draw their lists and pages from one shared sheet. A class a screen leaves out of
// its own sheet's `composes` is undefined in its markup, so its element is drawn bare while every stylesheet test, which
// reads the two sheets joined, stays green.
import { describe, expect, it } from "vitest";

import {
  declarationsOfRule,
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

describe("a switch that cannot be pressed", () => {
  const OFF_PROPERTIES = ["color", "background", "border-color", "cursor"];

  it("is drawn with what a button that cannot be pressed is drawn with", () => {
    const buttonOff = declarationsOfRule(
      "price-edit.module.css",
      '.action[aria-disabled="true"]',
    );
    const switchOff = declarationsOfRule(
      "item-screen.module.css",
      '.switch[aria-disabled="true"]',
    );

    for (const property of OFF_PROPERTIES) {
      expect(switchOff[property], property).toBeDefined();
      expect(switchOff[property], property).toBe(buttonOff[property]);
    }
  });

  it("leaves a switch that can be pressed on the paper, with the pointer", () => {
    const switchLive = declarationsOfRule("item-screen.module.css", ".switch");

    expect(switchLive.background).toBe("var(--paper)");
    expect(switchLive.cursor).toBe("pointer");
  });
});
