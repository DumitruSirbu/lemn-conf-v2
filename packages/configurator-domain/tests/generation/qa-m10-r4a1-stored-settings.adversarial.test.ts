// The stored row of new-kitchen defaults is read by the dashboard before it judges a switch, and stamped into a kitchen by
// the generator later. A row the reader takes must be a row the stamp takes, and a row the stamp refuses must be a row the
// reader refuses: otherwise a save the dashboard accepted is a `503` for every switch, or a kitchen that cannot be made.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  freeColourFinish,
  paletteFinish,
  PALETTE_ENTRY_IDS,
  readStoredNewKitchenSettings,
  stampedSettingsOf,
  type NewKitchenSettings,
} from "../../src/index.js";

const NEW_KITCHEN_KEYS = [
  "materialTierId",
  "hardwareTierId",
  "cabinetDepthMm",
  "finish",
  "handle",
  "topRowHandle",
];

/** Mostly a value the settings take, now and then one they do not, so a row is taken often enough to be compared. */
function mostly<Value>(
  valid: fc.Arbitrary<Value>,
  junk: fc.Arbitrary<unknown>,
): fc.Arbitrary<unknown> {
  return fc.oneof(
    { weight: 8, arbitrary: valid },
    { weight: 1, arbitrary: junk },
  );
}

const handleArbitrary = mostly(
  fc.constantFrom("black", "steel", "push"),
  fc.oneof(
    fc.constantFrom("gold", "", "Black"),
    fc.constant(null),
    fc.integer(),
  ),
);

const rowArbitrary = fc.record(
  {
    materialTierId: mostly(
      fc.constantFrom(
        "material.melamine",
        "material.painted-mdf",
        "material.veneer",
      ),
      fc.oneof(fc.string({ maxLength: 80 }), fc.constant(null), fc.integer()),
    ),
    hardwareTierId: mostly(
      fc.constantFrom("hardware.standard", "hardware.soft-close"),
      fc.oneof(fc.string({ maxLength: 80 }), fc.constant(null)),
    ),
    cabinetDepthMm: mostly(
      fc.constantFrom(600, 700),
      fc.oneof(
        fc.integer({ min: -5, max: 2_000 }),
        fc.double({ noNaN: true }),
        fc.constant(null),
      ),
    ),
    finish: mostly(
      fc.oneof(
        fc.constantFrom(...PALETTE_ENTRY_IDS).map(paletteFinish),
        fc.constant(freeColourFinish("#8d9a84")),
      ),
      fc.oneof(
        fc.constant({ kind: "free-colour", value: "nope" }),
        fc.constant(null),
        fc.string(),
      ),
    ),
    handle: handleArbitrary,
    topRowHandle: handleArbitrary,
  },
  { requiredKeys: [] },
);

function isStampable(row: unknown): boolean {
  try {
    stampedSettingsOf(row as NewKitchenSettings);
    return true;
  } catch {
    return false;
  }
}

describe("reading a stored row against stamping it", () => {
  it("takes a row exactly when the stamp takes it, and then returns the row it was given", () => {
    const outcomes = { taken: 0, refused: 0 };
    fc.assert(
      fc.property(rowArbitrary, (row) => {
        const reading = readStoredNewKitchenSettings(
          JSON.parse(JSON.stringify(row)),
        );

        expect(reading.ok, JSON.stringify(row)).toBe(isStampable(row));
        outcomes[reading.ok ? "taken" : "refused"] += 1;
        if (reading.ok) {
          expect(reading.defaults, JSON.stringify(row)).toEqual(row);
        }
      }),
      { numRuns: 500 },
    );

    expect(outcomes.taken).toBeGreaterThan(20);
    expect(outcomes.refused).toBeGreaterThan(20);
  });

  it("reads what it returned as the same settings again", () => {
    fc.assert(
      fc.property(rowArbitrary, (row) => {
        const first = readStoredNewKitchenSettings(row);
        if (!first.ok) return;

        expect(readStoredNewKitchenSettings(first.defaults)).toEqual(first);
      }),
      { numRuns: 300 },
    );
  });
});

describe("reading any JSON at all", () => {
  it("never throws, never invents a key, and never changes the row it was given", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (stored) => {
        const copy = JSON.stringify(stored);

        const reading = readStoredNewKitchenSettings(stored);

        expect(JSON.stringify(stored)).toBe(copy);
        if (reading.ok) {
          expect(
            Object.keys(reading.defaults).every((key) =>
              NEW_KITCHEN_KEYS.includes(key),
            ),
          ).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("is unreadable for any object with a key beyond the six, whatever else it holds", () => {
    fc.assert(
      fc.property(
        rowArbitrary,
        fc
          .string({ minLength: 1, maxLength: 12 })
          .filter((key) => !NEW_KITCHEN_KEYS.includes(key)),
        fc.jsonValue(),
        (row, extraKey, extraValue) => {
          const stored = JSON.parse(JSON.stringify(row)) as Record<
            string,
            unknown
          >;
          Object.defineProperty(stored, extraKey, {
            value: extraValue,
            enumerable: true,
            configurable: true,
            writable: true,
          });

          expect(readStoredNewKitchenSettings(stored)).toEqual({ ok: false });
        },
      ),
      { numRuns: 300 },
    );
  });

  it("returns settings that share nothing with the row: editing the result leaves the row as it was", () => {
    const row = { finish: freeColourFinish("#8d9a84"), handle: "black" };

    const reading = readStoredNewKitchenSettings(row);

    if (!reading.ok) throw new Error("the fixture row was not read");
    (reading.defaults as { handle?: string }).handle = "push";
    expect(row.handle).toBe("black");
    expect(row.finish).toEqual(freeColourFinish("#8d9a84"));
  });
});
