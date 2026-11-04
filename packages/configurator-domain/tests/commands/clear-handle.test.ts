// `clearHandle` is `clearFinish` for the handle: it deletes the cabinet's own key so the kitchen's handle, or the module
// line's on the top row, applies again. Price, scene and panel all read `resolvedHandleOf`, so the price is asserted
// here from the design the command returns, and the scene and panel in the web package from the real store.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { clearHandle, setHandle } from "../../src/commands/set-appearance.js";
import { setKitchenHandle } from "../../src/commands/set-kitchen-handle.js";
import {
  countHardwareMechanisms,
  DesignSchema,
  HandleSchema,
  KITCHEN_L_BODY_CATALOG,
  projectDesignForDisplay,
  type Design,
  type DisplayEntry,
  type Handle,
  type HardwareMechanismCounts,
} from "../../src/index.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import { OCCURRED_AT } from "../support/commands.js";
import {
  DEEPENING_ROWS,
  STANDARD_HARDWARE_ID,
} from "../price-dashboard/m2-support.js";

const BASE_CABINET_ID = "p0";
const NO_HANDLE_BODY_ID = "p12";
const TWO_DOOR_TOP_ROW_ID = "p15";
const ONE_DOOR_TOP_ROW_ID = "p16";
const HANDLES: readonly Handle[] = HandleSchema.options;

const base = { catalog: KITCHEN_L_BODY_CATALOG, occurredAt: OCCURRED_AT };

function bodyOf(design: Design, id: string) {
  return design.placements.find((placement) => placement.id === id)?.body;
}

function setting(design: Design, id: string, handle: Handle): Design {
  const result = setHandle({
    ...base,
    design,
    target: { kind: "placement", id },
    handle,
  });
  if (!result.ok) throw new Error(`fixture: ${result.reason.code}`);
  return result.design;
}

function kitchenHandleSet(design: Design, handle: Handle): Design {
  const result = setKitchenHandle({ design, handle, occurredAt: OCCURRED_AT });
  if (!result.ok) throw new Error(`fixture: ${result.reason.code}`);
  return result.design;
}

function clearing(design: Design, id: string): Design {
  const result = clearHandle({
    ...base,
    design,
    target: { kind: "placement", id },
  });
  if (!result.ok) throw new Error(`fixture: ${result.reason.code}`);
  return result.design;
}

function withSettings(
  design: Design,
  settings: Partial<Design["settings"]>,
): Design {
  return { ...design, settings: { ...design.settings, ...settings } };
}

function entriesOf(design: Design): readonly DisplayEntry[] {
  return projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG).flatMap(
    (group) => group.entries,
  );
}

function mechanismsOn(
  design: Design,
  placementId: string,
): HardwareMechanismCounts {
  const entry = entriesOf(design).find(
    (candidate) => candidate.placementId === placementId,
  );
  if (!entry) throw new Error(`fixture: no entry for ${placementId}`);
  return countHardwareMechanisms([entry], KITCHEN_L_BODY_CATALOG);
}

function pricedOf(design: Design) {
  const result = priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK.version,
    selections: { hardwareTierId: STANDARD_HARDWARE_ID },
    deepeningRows: DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
  if (!result.ok) throw new Error(result.failure.detail);
  return result.priced;
}

describe("clearHandle", () => {
  it("deletes the key and writes nothing in its place, so a save round-trips identically", () => {
    const wearing = setting(KITCHEN_L_DESIGN, BASE_CABINET_ID, "black");

    const cleared = clearing(wearing, BASE_CABINET_ID);

    expect(bodyOf(cleared, BASE_CABINET_ID)).not.toHaveProperty("handle");
    expect(
      JSON.stringify(cleared.placements.find((p) => p.id === BASE_CABINET_ID)),
    ).not.toContain("handle");
    expect(DesignSchema.safeParse(cleared).success).toBe(true);
  });

  it("answers with an effect that names the placement and carries no handle", () => {
    const result = clearHandle({
      ...base,
      design: setting(KITCHEN_L_DESIGN, BASE_CABINET_ID, "push"),
      target: { kind: "placement", id: BASE_CABINET_ID },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect).toEqual({
      type: "handle_cleared",
      placementId: BASE_CABINET_ID,
    });
  });

  it("succeeds on a cabinet that has chosen nothing, as clearing a colour does, and changes nothing", () => {
    const result = clearHandle({
      ...base,
      design: KITCHEN_L_DESIGN,
      target: { kind: "placement", id: BASE_CABINET_ID },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.type).toBe("handle_cleared");
    expect(result.design.placements).toEqual(KITCHEN_L_DESIGN.placements);
  });

  it("touches no other cabinet and no whole-kitchen setting", () => {
    const design = withSettings(
      setting(
        setting(KITCHEN_L_DESIGN, BASE_CABINET_ID, "push"),
        "p1",
        "black",
      ),
      { handle: "black" },
    );

    const cleared = clearing(design, BASE_CABINET_ID);

    expect(cleared.settings).toEqual(design.settings);
    expect(
      cleared.placements.filter(
        (placement) => placement.id !== BASE_CABINET_ID,
      ),
    ).toEqual(
      design.placements.filter((placement) => placement.id !== BASE_CABINET_ID),
    );
  });

  it("leaves the design it was given untouched, which is the only undo this product has", () => {
    const wearing = setting(KITCHEN_L_DESIGN, BASE_CABINET_ID, "push");
    const snapshot = JSON.stringify(wearing);

    clearing(wearing, BASE_CABINET_ID);

    expect(JSON.stringify(wearing)).toBe(snapshot);
    expect(bodyOf(wearing, BASE_CABINET_ID)?.handle).toBe("push");
  });
});

describe("clearHandle refuses as clearFinish does", () => {
  it("refuses a body whose definition takes no handle, with the design returned as it came", () => {
    const result = clearHandle({
      ...base,
      design: KITCHEN_L_DESIGN,
      target: { kind: "placement", id: NO_HANDLE_BODY_ID },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("HANDLE_NOT_SUPPORTED");
    expect(result.design).toBe(KITCHEN_L_DESIGN);
  });

  it("refuses an id that resolves to nothing", () => {
    const result = clearHandle({
      ...base,
      design: KITCHEN_L_DESIGN,
      target: { kind: "placement", id: "p999" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("TARGET_NOT_FOUND");
    expect(result.design).toBe(KITCHEN_L_DESIGN);
  });

  it("refuses a void, which carries no handle to clear", () => {
    const result = clearHandle({
      ...base,
      design: KITCHEN_L_DESIGN,
      target: { kind: "void", id: "any-void" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("VOID_SELECTED");
  });

  it("refuses a malformed timestamp", () => {
    const result = clearHandle({
      ...base,
      occurredAt: "yesterday",
      design: KITCHEN_L_DESIGN,
      target: { kind: "placement", id: BASE_CABINET_ID },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("INVALID_OCCURRED_AT");
  });
});

describe("a cleared cabinet follows the kitchen again", () => {
  it.each(HANDLES)(
    "wears the kitchen's %s on the price after a clear, whatever it wore before",
    (kitchenHandle) => {
      const kitchen = withSettings(KITCHEN_L_DESIGN, { handle: kitchenHandle });
      const wearingAnother = setting(
        kitchen,
        BASE_CABINET_ID,
        kitchenHandle === "push" ? "steel" : "push",
      );

      const cleared = clearing(wearingAnother, BASE_CABINET_ID);

      expect(pricedOf(cleared).totalMinor).toBe(pricedOf(kitchen).totalMinor);
      expect(mechanismsOn(cleared, BASE_CABINET_ID)).toEqual(
        mechanismsOn(kitchen, BASE_CABINET_ID),
      );
    },
  );

  it("tracks two later changes of the kitchen's handle, because the key is gone rather than rewritten", () => {
    const cleared = clearing(
      setting(KITCHEN_L_DESIGN, BASE_CABINET_ID, "steel"),
      BASE_CABINET_ID,
    );
    const kitchenPushing = kitchenHandleSet(cleared, "push");
    const kitchenBarred = kitchenHandleSet(kitchenPushing, "black");

    expect(mechanismsOn(kitchenPushing, BASE_CABINET_ID).pushToOpen).toBe(2);
    expect(mechanismsOn(kitchenBarred, BASE_CABINET_ID).pushToOpen).toBe(0);
    expect(bodyOf(kitchenBarred, BASE_CABINET_ID)).not.toHaveProperty("handle");
  });

  it("bills a latch per door leaf on a top-row cabinet again once its own bar is cleared", () => {
    const withBar = setting(KITCHEN_L_DESIGN, TWO_DOOR_TOP_ROW_ID, "steel");
    expect(mechanismsOn(withBar, TWO_DOOR_TOP_ROW_ID).pushToOpen).toBe(0);

    const cleared = clearing(withBar, TWO_DOOR_TOP_ROW_ID);

    expect(mechanismsOn(cleared, TWO_DOOR_TOP_ROW_ID).pushToOpen).toBe(2);
    expect(mechanismsOn(cleared, ONE_DOOR_TOP_ROW_ID).pushToOpen).toBe(1);
    expect(pricedOf(cleared).totalMinor).toBe(
      pricedOf(KITCHEN_L_DESIGN).totalMinor,
    );
    expect(pricedOf(withBar).totalMinor).not.toBe(
      pricedOf(KITCHEN_L_DESIGN).totalMinor,
    );
  });

  it("follows the kitchen's top-row handle, not its base handle, on a top-row cabinet", () => {
    const kitchen = withSettings(KITCHEN_L_DESIGN, {
      handle: "black",
      topRowHandle: "steel",
    });

    const cleared = clearing(
      setting(kitchen, TWO_DOOR_TOP_ROW_ID, "push"),
      TWO_DOOR_TOP_ROW_ID,
    );

    expect(mechanismsOn(cleared, TWO_DOOR_TOP_ROW_ID).pushToOpen).toBe(0);
  });

  it("puts a drawer cabinet back on push runners when the kitchen is push-to-open", () => {
    const kitchen = withSettings(KITCHEN_L_DESIGN, { handle: "push" });
    const drawerCabinetId = entriesOf(kitchen).find(
      (entry) =>
        entry.y0Mm === 0 &&
        mechanismsOn(kitchen, entry.placementId).pushRunners > 0,
    )?.placementId;
    if (drawerCabinetId === undefined) throw new Error("fixture: no drawers");
    const withBar = setting(kitchen, drawerCabinetId, "steel");
    expect(mechanismsOn(withBar, drawerCabinetId).pushRunners).toBe(0);

    const cleared = clearing(withBar, drawerCabinetId);

    expect(mechanismsOn(cleared, drawerCabinetId)).toEqual(
      mechanismsOn(kitchen, drawerCabinetId),
    );
    expect(mechanismsOn(cleared, drawerCabinetId).pushRunners).toBeGreaterThan(
      0,
    );
  });
});

const handleArbitrary = fc.constantFrom(...HANDLES);
const targetArbitrary = fc.constantFrom(
  BASE_CABINET_ID,
  "p1",
  TWO_DOOR_TOP_ROW_ID,
  ONE_DOOR_TOP_ROW_ID,
);
const kitchenArbitrary = fc.record({
  handle: fc.option(handleArbitrary, { nil: undefined }),
  topRowHandle: fc.option(handleArbitrary, { nil: undefined }),
});

function withKitchen(kitchen: {
  handle?: Handle | undefined;
  topRowHandle?: Handle | undefined;
}): Design {
  const settings = { ...KITCHEN_L_DESIGN.settings };
  delete settings.handle;
  delete settings.topRowHandle;
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...settings,
      ...(kitchen.handle === undefined ? {} : { handle: kitchen.handle }),
      ...(kitchen.topRowHandle === undefined
        ? {}
        : { topRowHandle: kitchen.topRowHandle }),
    },
  };
}

describe("properties of set and clear over any kitchen and any cabinet", () => {
  propertyTest.prop([kitchenArbitrary, targetArbitrary, handleArbitrary])(
    "a set followed by a clear is a clear alone, for every handle",
    (kitchen, id, handle) => {
      const design = withKitchen(kitchen);

      expect(clearing(setting(design, id, handle), id)).toEqual(
        clearing(design, id),
      );
    },
  );

  propertyTest.prop([kitchenArbitrary, targetArbitrary, handleArbitrary])(
    "a clear then the same set is that set alone: the round trip with setHandle loses nothing",
    (kitchen, id, handle) => {
      const design = withKitchen(kitchen);
      const once = setting(design, id, handle);

      expect(setting(clearing(once, id), id, handle)).toEqual(once);
    },
  );

  propertyTest.prop([kitchenArbitrary, targetArbitrary])(
    "a clear is idempotent",
    (kitchen, id) => {
      const once = clearing(withKitchen(kitchen), id);

      expect(clearing(once, id)).toEqual(once);
    },
  );

  propertyTest.prop([
    kitchenArbitrary,
    targetArbitrary,
    fc.array(fc.option(handleArbitrary, { nil: undefined }), {
      minLength: 1,
      maxLength: 8,
    }),
  ])(
    "after any run of sets and clears the cabinet wears its last choice, or the kitchen's when the last step cleared",
    (kitchen, id, steps) => {
      const start = withKitchen(kitchen);

      const end = steps.reduce(
        (design, step) =>
          step === undefined ? clearing(design, id) : setting(design, id, step),
        start,
      );

      const last = steps[steps.length - 1];
      if (last === undefined) {
        expect(mechanismsOn(end, id)).toEqual(mechanismsOn(start, id));
        expect(pricedOf(end).totalMinor).toBe(pricedOf(start).totalMinor);
      } else {
        expect(bodyOf(end, id)?.handle).toBe(last);
      }
    },
  );
});
