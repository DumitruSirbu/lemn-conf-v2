// The hardware, the materials and the accessory screens draw their lists and pages from one shared sheet. A class a screen leaves out of
// its own sheet's `composes` is undefined in its markup, so its element is drawn bare while every stylesheet test, which
// reads the two sheets joined, stays green.
import { describe, expect, it } from "vitest";

import { sharedClassesNotComposed } from "../support/item-screen-stylesheet";

describe("a screen takes every class of the shared item sheet", () => {
  it.each([
    "hardware.module.css",
    "material.module.css",
    "accessory.module.css",
  ])("%s composes all of them", (screenSheetName) => {
    expect(sharedClassesNotComposed(screenSheetName)).toEqual([]);
  });
});
