// The saved defaults are stored unversioned as `unknown`. A row is read as the settings it holds or as unreadable, and a
// row that is not settings is never read as `{}`: a reader that took it for "nothing saved" would judge against the fixed
// fallbacks the saved row had replaced.
import { describe, expect, it } from "vitest";

import {
  freeColourFinish,
  PALETTE_ENTRY_IDS,
  paletteFinish,
  readStoredNewKitchenSettings,
  savedDefaultItemsOf,
  type NewKitchenSettings,
} from "../../src/index.js";

const UNREADABLE = { ok: false };
const A_DEPTH_NOBODY_MANUFACTURES = 123;

function aFullRow(): Record<string, unknown> {
  return {
    materialTierId: "mdf",
    hardwareTierId: "premium",
    cabinetDepthMm: 600,
    finish: freeColourFinish("#8d9a84"),
    handle: "black",
    topRowHandle: "push",
  };
}

describe("reading a stored row of new-kitchen defaults", () => {
  it("reads an empty object as settings that state nothing", () => {
    expect(readStoredNewKitchenSettings({})).toEqual({
      ok: true,
      defaults: {},
    });
  });

  it("reads every one of the six settings a new kitchen takes", () => {
    const reading = readStoredNewKitchenSettings(aFullRow());

    expect(reading).toEqual({ ok: true, defaults: aFullRow() });
  });

  it("reads a palette colour as the colour it names", () => {
    const finish = paletteFinish(PALETTE_ENTRY_IDS[0]);

    const reading = readStoredNewKitchenSettings({ finish });

    expect(reading).toEqual({ ok: true, defaults: { finish } });
    const defaults = (reading as { defaults: NewKitchenSettings }).defaults;
    expect(savedDefaultItemsOf(defaults)).toHaveLength(1);
  });

  it("shares nothing with the row it read", () => {
    const row = aFullRow();

    const reading = readStoredNewKitchenSettings(row);

    expect(reading.ok && reading.defaults.finish).not.toBe(row["finish"]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a list", []],
    ["a list of settings", [{}]],
    ["text", "{}"],
    ["a number", 0],
    ["a boolean", false],
  ])("does not read %s as settings", (_description, stored) => {
    expect(readStoredNewKitchenSettings(stored)).toEqual(UNREADABLE);
  });

  it.each([
    ["a key a new kitchen does not take", { ...aFullRow(), colour: "red" }],
    ["a null where a value is optional", { ...aFullRow(), handle: null }],
    [
      "a depth nobody manufactures",
      { cabinetDepthMm: A_DEPTH_NOBODY_MANUFACTURES },
    ],
    ["a fractional depth", { cabinetDepthMm: 600.5 }],
    ["a handle that is not one of the three", { handle: "gold" }],
    ["a top-row handle that is not one", { topRowHandle: 7 }],
    ["a colour that is not a finish", { finish: "#8d9a84" }],
    [
      "a free colour that is not six hex digits",
      { finish: { kind: "free-colour", value: "red" } },
    ],
    [
      "a colour with an extra member",
      { finish: { ...freeColourFinish("#8d9a84"), extra: 1 } },
    ],
    ["an empty material id", { materialTierId: "" }],
    ["a material id that is not text", { materialTierId: 3 }],
  ])("does not read a row with %s as settings", (_description, stored) => {
    expect(readStoredNewKitchenSettings(stored)).toEqual(UNREADABLE);
  });

  it("does not read a row with an own key named __proto__ as settings", () => {
    const stored: unknown = JSON.parse('{"__proto__":{"handle":"steel"}}');

    expect(readStoredNewKitchenSettings(stored)).toEqual(UNREADABLE);
  });
});
