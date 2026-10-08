import { describe, expect, it } from "vitest";

import { kindLabel } from "../../src/catalog.js";

import { setFinish, setHandle } from "../../src/commands/set-appearance.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { clearBodies, insertInto, OCCURRED_AT } from "../support/commands.js";
import { createWorld } from "../support/kitchen-world.js";
import {
  freeColourFinish,
  LEGACY_ENUM_FINISHES,
  paletteFinish,
} from "../../src/materials.js";

const base = {
  design: KITCHEN_L_DESIGN,
  catalog: KITCHEN_L_BODY_CATALOG,
  occurredAt: OCCURRED_AT,
} as const;

function bodyOf(design: typeof KITCHEN_L_DESIGN, id: string) {
  return design.placements.find((placement) => placement.id === id)?.body;
}

function withMaterial(materialTierId: string): typeof KITCHEN_L_DESIGN {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
  };
}

/** *Antracit*, a PAL decor. The fixture carries no settings, so it is a PAL kitchen — and since
 *  wave 6Q-a the colour a success is asserted with has to be one PAL offers, or the command refuses
 *  before it records anything. *Salvie* used to stand here and is now the refusal below. */
const OFFERED_ON_PAL = paletteFinish("pal.antracit");

describe("setFinish", () => {
  it("records the choice on that placement and on no other", () => {
    const result = setFinish({
      ...base,
      target: { kind: "placement", id: "p0" },
      finish: OFFERED_ON_PAL,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(bodyOf(result.design, "p0")?.finish).toEqual(OFFERED_ON_PAL);
    expect(bodyOf(result.design, "p2")?.finish).toBeUndefined();
    expect(result.design.updatedAt).toBe(OCCURRED_AT);
    expect(result.effect).toEqual({
      type: "finish_set",
      placementId: "p0",
      finish: OFFERED_ON_PAL,
    });
  });

  // ADR 0078 decision 6: a colour the kitchen's material does not offer is refused at the command,
  // for this module's own standing reason — a no-op looks identical to a broken control, and here
  // the alternative is worse than a no-op, it is storing the state the load seam would then have to
  // correct.
  it("refuses a free colour on a decor-list material", () => {
    const result = setFinish({
      ...base,
      target: { kind: "placement", id: "p0" },
      finish: LEGACY_ENUM_FINISHES.sage,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("FINISH_NOT_OFFERED");
    expect(result.reason.params).toEqual({});
    expect(result.design).toBe(KITCHEN_L_DESIGN);
  });

  it("refuses another material's palette entry", () => {
    const result = setFinish({
      ...base,
      target: { kind: "placement", id: "p0" },
      finish: paletteFinish("veneer.nuc"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("FINISH_NOT_OFFERED");
  });

  it("accepts a free colour once the kitchen's material is the picker", () => {
    const result = setFinish({
      ...base,
      design: withMaterial("material.painted-mdf"),
      target: { kind: "placement", id: "p0" },
      finish: freeColourFinish("#b8c4a1"),
    });
    expect(result.ok).toBe(true);
  });

  // ADR 0078 decision 3: a stored tier id naming no declared material is a reachable state — wave
  // 6G's recovery path stands on it loading — and a material this product does not declare makes no
  // offer to judge a colour against. So the command lets the finish through rather than making a
  // stale tier unrecolourable.
  it("refuses nothing when the stored material id names no declared material", () => {
    const result = setFinish({
      ...base,
      design: withMaterial("material.laminate"),
      target: { kind: "placement", id: "p0" },
      finish: LEGACY_ENUM_FINISHES.sage,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(bodyOf(result.design, "p0")?.finish).toEqual(
      LEGACY_ENUM_FINISHES.sage,
    );
  });

  // §5.5: a body with no doors is a refusal with its own code, not a silent no-op — a no-op looks
  // identical to a broken control. The seeded population has no such body (M2's `open-shelf-600`
  // and `hood-600` both carry `canFinish: true`, which their geometry does not support), so this
  // inserts a catalogue open shelf and finishes that.
  it("refuses a body with no doors", () => {
    const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
    const cleared = clearBodies(world, ["p8"]);
    const slot = cleared.voids.find((record) => record.col === "A|0.30");
    expect(slot).toBeDefined();
    const shelf = insertInto(
      cleared,
      { kind: "void", id: slot?.id ?? "" },
      "open-shelf",
    );
    expect(shelf.ok).toBe(true);
    if (!shelf.ok) return;

    const result = setFinish({
      design: shelf.design,
      catalog: KITCHEN_L_BODY_CATALOG,
      occurredAt: OCCURRED_AT,
      target: { kind: "placement", id: shelf.effect.placementId },
      finish: LEGACY_ENUM_FINISHES.sage,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("FINISH_NOT_SUPPORTED");
    expect(result.reason.params).toEqual({
      label: kindLabel("open_shelf_unit"),
    });
    expect(result.design).toBe(shelf.design);
  });

  it("refuses a selected void", () => {
    const result = setFinish({
      ...base,
      target: { kind: "void", id: "A|1.30:v0:0.00" },
      finish: LEGACY_ENUM_FINISHES.sage,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("VOID_SELECTED");
  });
});

describe("setHandle", () => {
  it("records the mode per placement", () => {
    const result = setHandle({
      ...base,
      target: { kind: "placement", id: "p0" },
      handle: "push",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(bodyOf(result.design, "p0")?.handle).toBe("push");
    expect(result.effect.handle).toBe("push");
  });

  it("refuses an id that resolves to nothing, without touching the design", () => {
    const snapshot = JSON.stringify(KITCHEN_L_DESIGN);
    const result = setHandle({
      ...base,
      target: { kind: "placement", id: "p999" },
      handle: "steel",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("TARGET_NOT_FOUND");
    expect(result.design).toBe(KITCHEN_L_DESIGN);
    expect(JSON.stringify(KITCHEN_L_DESIGN)).toBe(snapshot);
  });
});
