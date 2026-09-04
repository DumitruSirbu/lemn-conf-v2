import { describe, expect, it } from "vitest";

import { setFinish, setHandle } from "../../src/commands/set-appearance.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { clearBodies, insertInto, OCCURRED_AT } from "../support/commands.js";
import { createWorld } from "../support/kitchen-world.js";
import { LEGACY_ENUM_FINISHES } from "../../src/materials.js";

const base = {
  design: KITCHEN_L_DESIGN,
  catalog: KITCHEN_L_BODY_CATALOG,
  occurredAt: OCCURRED_AT,
} as const;

function bodyOf(design: typeof KITCHEN_L_DESIGN, id: string) {
  return design.placements.find((placement) => placement.id === id)?.body;
}

describe("setFinish", () => {
  it("records the choice on that placement and on no other", () => {
    const result = setFinish({
      ...base,
      target: { kind: "placement", id: "p0" },
      finish: LEGACY_ENUM_FINISHES.sage,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(bodyOf(result.design, "p0")?.finish).toEqual(
      LEGACY_ENUM_FINISHES.sage,
    );
    expect(bodyOf(result.design, "p2")?.finish).toBeUndefined();
    expect(result.design.updatedAt).toBe(OCCURRED_AT);
    expect(result.effect).toEqual({
      type: "finish_set",
      placementId: "p0",
      finish: LEGACY_ENUM_FINISHES.sage,
    });
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
    expect(result.reason.message.length).toBeGreaterThan(0);
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

  it("refuses a body with no handle meshes", () => {
    const result = setHandle({
      ...base,
      target: { kind: "placement", id: "p12" },
      handle: "black",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("HANDLE_NOT_SUPPORTED");
    expect(result.design).toBe(KITCHEN_L_DESIGN);
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
