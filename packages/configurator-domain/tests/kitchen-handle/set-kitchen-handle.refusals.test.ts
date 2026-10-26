// H1-d (ruling H-4): `setKitchenHandle` judges its own input. The type says `Handle`, which a caller outside
// TypeScript is not bound by, and a stored value outside `HandleSchema` would make the document unreadable
// at the load seam. Availability is not asked here: Q2 offers only active handles, Q5 resolves a disabled
// one through the sheet, and the price refuses `REPLACEMENT_REQUIRED` (P4a).
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { setKitchenHandle } from "../../src/commands/set-kitchen-handle.js";
import type { Design, Handle } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";

const OCCURRED_AT = "2026-10-26T09:30:00.000Z";
const EVERY_HANDLE: readonly Handle[] = ["steel", "black", "push"];

const NOT_HANDLES: readonly unknown[] = [
  "gold",
  "",
  " ",
  "PUSH",
  "Steel",
  "push ",
  "steel\n",
  "__proto__",
  "constructor",
  "toString",
  null,
  undefined,
  0,
  1,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  true,
  false,
  {},
  { handle: "push" },
  ["push"],
  () => "push",
  Symbol("push"),
  10n,
];

function askedFor(handle: unknown, design: Design = KITCHEN_L_DESIGN) {
  return setKitchenHandle({
    design,
    handle: handle as Handle,
    occurredAt: OCCURRED_AT,
  });
}

function describedAs(value: unknown): string {
  return typeof value === "symbol" ? value.toString() : String(value);
}

describe("setKitchenHandle refuses any value outside HandleSchema", () => {
  it.each(NOT_HANDLES.map((value) => [describedAs(value), value] as const))(
    "refuses %s with UNKNOWN_HANDLE and returns the very same design",
    (_label, value) => {
      const result = askedFor(value);

      expect(result.ok).toBe(false);
      expect(result.design).toBe(KITCHEN_L_DESIGN);
      if (result.ok) return;
      expect(result.reason).toEqual({ code: "UNKNOWN_HANDLE", params: {} });
      expect(result).not.toHaveProperty("effect");
    },
  );

  it("leaves a design that already has a kitchen handle exactly as it was", () => {
    const chosen: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, handle: "black" },
    };
    const before = JSON.stringify(chosen);

    const result = askedFor("gold", chosen);

    expect(result.design).toBe(chosen);
    expect(JSON.stringify(chosen)).toBe(before);
  });

  it("refuses every string that is not exactly one of the three handles", () => {
    fc.assert(
      fc.property(
        fc.string().filter((text) => !EVERY_HANDLE.includes(text as Handle)),
        (text) => {
          const result = askedFor(text);

          expect(result.ok).toBe(false);
          expect(result.design).toBe(KITCHEN_L_DESIGN);
        },
      ),
    );
  });

  it("refuses every number", () => {
    fc.assert(
      fc.property(fc.double(), (value) => {
        expect(askedFor(value).ok).toBe(false);
      }),
    );
  });

  it("still accepts each of the three declared handles", () => {
    for (const handle of EVERY_HANDLE) {
      expect(askedFor(handle).ok).toBe(true);
    }
  });

  it("judges the timestamp first, as findRefusal does", () => {
    const result = setKitchenHandle({
      design: KITCHEN_L_DESIGN,
      handle: "gold" as Handle,
      occurredAt: "yesterday",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("INVALID_OCCURRED_AT");
  });
});
