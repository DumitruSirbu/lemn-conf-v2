// `settings.topRowHandle` is the kitchen's handle for the top row, stamped at creation. A top-row
// body that takes a handle wears its own, else `settings.topRowHandle`, else `TOP_ROW_HANDLE`; the kitchen's `handle`
// never reaches it, and `topRowHandle` never reaches a body below the line. The module line is written here as the
// literal 2200, not read from the constant under test.
import { describe, expect, it } from "vitest";

import {
  CurrentDesignSchema,
  DesignSchema,
  DesignSettingsSchema,
  isPushToOpen,
  kitchenHandleSettingsOf,
  resolvedHandleAt,
  setKitchenHandle,
  setGlobalFinish,
  setHardwareTier,
  setMaterialTier,
  TOP_ROW_HANDLE,
  wornHandleAt,
  type Handle,
  type KitchenHandleSettings,
  type WornHandleQuery,
} from "../../src/index.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import {
  defaultHandleOf,
  resolvedHandleOf,
} from "../../src/kitchen-handle/kitchen-handle.js";

const EVERY_HANDLE: readonly Handle[] = ["steel", "black", "push"];
const OCCURRED_AT = "2026-10-27T12:00:00.000Z";
const FLOORS_AROUND_THE_LINE_MM = [2_199, 2_200, 2_201] as const;

function wornQuery(overrides: Partial<WornHandleQuery>): WornHandleQuery {
  return {
    y0Mm: 2_200,
    recordedHandle: undefined,
    kitchenSettings: {},
    canHandle: true,
    countOpeningFronts: () => 2,
    ...overrides,
  };
}

describe("the top row's handle is the cabinet's own, else the kitchen's top-row handle, else push", () => {
  it("keeps TOP_ROW_HANDLE as the last fallback, push", () => {
    expect(TOP_ROW_HANDLE).toBe("push");
  });

  it.each(FLOORS_AROUND_THE_LINE_MM)(
    "at floor %i the order is own, then topRowHandle (on the line and above), then the slot's default",
    (y0Mm) => {
      const isTopRow = y0Mm >= 2_200;
      for (const own of [undefined, ...EVERY_HANDLE]) {
        for (const topRowHandle of [undefined, ...EVERY_HANDLE]) {
          for (const handle of [undefined, ...EVERY_HANDLE]) {
            const kitchenSettings: KitchenHandleSettings = {
              ...(handle === undefined ? {} : { handle }),
              ...(topRowHandle === undefined ? {} : { topRowHandle }),
            };
            const followed = isTopRow
              ? (topRowHandle ?? "push")
              : (handle ?? "steel");

            expect(
              resolvedHandleAt(
                wornQuery({ y0Mm, recordedHandle: own, kitchenSettings }),
              ),
              `own ${String(own)} handle ${String(handle)} top ${String(topRowHandle)}`,
            ).toBe(own ?? followed);
          }
        }
      }
    },
  );

  it.each(FLOORS_AROUND_THE_LINE_MM)(
    "at floor %i a body that takes no handle reports none, whatever either kitchen handle says",
    (y0Mm) => {
      for (const topRowHandle of EVERY_HANDLE) {
        expect(
          resolvedHandleAt(
            wornQuery({
              y0Mm,
              canHandle: false,
              kitchenSettings: { handle: "black", topRowHandle },
            }),
          ),
        ).toBeUndefined();
      }
    },
  );

  it("is a latch exactly when the top row's handle is push, for a body on the line that takes a handle", () => {
    for (const topRowHandle of EVERY_HANDLE) {
      expect(
        isPushToOpen(wornQuery({ kitchenSettings: { topRowHandle } })),
      ).toBe(topRowHandle === "push");
    }
  });

  it("keeps a body below the line steel and unlatched whatever the top-row handle says", () => {
    for (const topRowHandle of EVERY_HANDLE) {
      const query = wornQuery({
        y0Mm: 2_199,
        kitchenSettings: { topRowHandle },
      });

      expect(isPushToOpen(query)).toBe(false);
      expect(resolvedHandleAt(query)).toBe("steel");
    }
  });

  it("leaves a top-row body that takes no handle push and latched, whatever the top-row handle says (H2-b)", () => {
    for (const topRowHandle of EVERY_HANDLE) {
      const query = wornQuery({
        canHandle: false,
        kitchenSettings: { topRowHandle },
      });

      expect(isPushToOpen(query)).toBe(true);
      expect(wornHandleAt(query)).toBe("push");
    }
  });

  it("wears nothing when a top-row body has no front that opens, under any top-row handle", () => {
    for (const topRowHandle of EVERY_HANDLE) {
      expect(
        wornHandleAt(
          wornQuery({
            canHandle: false,
            countOpeningFronts: () => 0,
            kitchenSettings: { topRowHandle },
          }),
        ),
      ).toBeUndefined();
    }
  });

  it("names the worn handle of a top-row body that takes one as its top-row handle", () => {
    for (const topRowHandle of EVERY_HANDLE) {
      expect(
        wornHandleAt(wornQuery({ kitchenSettings: { topRowHandle } })),
      ).toBe(topRowHandle);
    }
  });
});

describe("the panel marks the top-row handle too (defaultHandleOf)", () => {
  const base = { canHandle: true, isTopRow: true } as const;

  it("follows topRowHandle on the top row, push when it is absent", () => {
    for (const topRowHandle of EVERY_HANDLE) {
      expect(
        defaultHandleOf({ ...base, kitchenSettings: { topRowHandle } }),
      ).toBe(topRowHandle);
    }
    expect(
      defaultHandleOf({ ...base, kitchenSettings: { handle: "black" } }),
    ).toBe("push");
  });

  it("gives a body that takes no handle the slot's default and never the kitchen's top-row handle", () => {
    expect(
      defaultHandleOf({
        canHandle: false,
        isTopRow: true,
        kitchenSettings: { topRowHandle: "black" },
      }),
    ).toBe("push");
    expect(
      resolvedHandleOf({
        ownHandle: undefined,
        canHandle: false,
        isTopRow: true,
        kitchenSettings: { topRowHandle: "black" },
      }),
    ).toBeUndefined();
  });
});

describe("kitchenHandleSettingsOf carries topRowHandle beside handle", () => {
  it("states each key only when the settings hold it", () => {
    expect(kitchenHandleSettingsOf({ topRowHandle: "steel" })).toStrictEqual({
      topRowHandle: "steel",
    });
    expect(
      kitchenHandleSettingsOf({ handle: "black", topRowHandle: "steel" }),
    ).toStrictEqual({ handle: "black", topRowHandle: "steel" });
    expect(kitchenHandleSettingsOf({ handle: "black" })).toStrictEqual({
      handle: "black",
    });
  });
});

describe("the schema takes settings.topRowHandle exactly as it takes settings.handle", () => {
  const VALUES: readonly unknown[] = [
    "steel",
    "black",
    "push",
    "gold",
    "",
    "Steel",
    "PUSH",
    null,
    0,
    1,
    true,
    false,
    ["steel"],
    { handle: "steel" },
    Number.NaN,
  ];

  it("accepts the values handle accepts, refuses the ones handle refuses, and nothing differs between the two keys", () => {
    for (const value of VALUES) {
      const asHandle = DesignSettingsSchema.safeParse({ handle: value });
      const asTopRow = DesignSettingsSchema.safeParse({ topRowHandle: value });

      expect(asTopRow.success, JSON.stringify(value)).toBe(asHandle.success);
    }
    expect(
      DesignSettingsSchema.safeParse({ topRowHandle: "gold" }).success,
    ).toBe(false);
    expect(DesignSettingsSchema.safeParse({ topRowHandle: null }).success).toBe(
      false,
    );
  });

  it("accepts a design carrying one, and a design carrying neither, so no schema bump is owed", () => {
    for (const topRowHandle of EVERY_HANDLE) {
      const design = {
        ...KITCHEN_L_DESIGN,
        settings: { ...KITCHEN_L_DESIGN.settings, topRowHandle },
      };

      expect(DesignSchema.safeParse(design).success).toBe(true);
      expect(CurrentDesignSchema.safeParse(design).success).toBe(true);
    }
    expect(CurrentDesignSchema.safeParse(KITCHEN_L_DESIGN).success).toBe(true);
  });

  it("refuses a design whose topRowHandle is not a handle, and the same document with the key removed is valid", () => {
    const bad = {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, topRowHandle: "gold" },
    };

    expect(DesignSchema.safeParse(bad).success).toBe(false);
    expect(DesignSchema.safeParse(KITCHEN_L_DESIGN).success).toBe(true);
  });
});

describe("the other whole-kitchen commands keep settings.topRowHandle", () => {
  const withTopRow: typeof KITCHEN_L_DESIGN = {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, topRowHandle: "black" },
  };

  it("setKitchenHandle writes the handle and leaves the top-row handle alone", () => {
    const result = setKitchenHandle({
      design: withTopRow,
      handle: "push",
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    expect(result.design.settings).toEqual({
      ...withTopRow.settings,
      handle: "push",
    });
  });

  it("the global colour, the material tier and the hardware tier keep it", () => {
    const afterFinish = setGlobalFinish({
      design: withTopRow,
      finish: { kind: "palette-entry", entryId: "pal.alb" },
      occurredAt: OCCURRED_AT,
    });
    const afterMaterial = setMaterialTier({
      design: withTopRow,
      tierId: "material.melamine",
      availableTierIds: ["material.melamine"],
      occurredAt: OCCURRED_AT,
    });
    const afterHardware = setHardwareTier({
      design: withTopRow,
      tierId: "hardware-premium",
      availableTierIds: ["hardware-premium"],
      occurredAt: OCCURRED_AT,
    });

    for (const result of [afterFinish, afterMaterial, afterHardware]) {
      expect(result.ok).toBe(true);
      expect(result.design.settings?.topRowHandle).toBe("black");
    }
  });
});
