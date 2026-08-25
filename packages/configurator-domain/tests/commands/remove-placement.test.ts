import { describe, expect, it } from "vitest";

import { removePlacement } from "../../src/commands/remove-placement.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { findVacatedVoid } from "../../src/queries/vacated-void.js";
import type { BodyDefinition } from "../../src/void-engine.js";
import { advance, createWorld } from "../support/kitchen-world.js";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";

function remove(id: string, kind: "placement" | "void" = "placement") {
  return removePlacement({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    target: { kind, id },
    occurredAt: OCCURRED_AT,
  });
}

describe("removePlacement — §5.1's closed refusal list", () => {
  it("refuses a selected void with its own code", () => {
    const result = remove("A|1.30:v0:0.00", "void");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("VOID_SELECTED");
  });

  it("refuses an id that resolves to nothing", () => {
    const result = remove("p999");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("TARGET_NOT_FOUND");
  });

  // §11 row 15: the hob was once a module, offered six rows it could never satisfy, and deleting
  // it destroyed it permanently.
  it("refuses the hob, and not with the same code as a structural body", () => {
    const result = remove("p3");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("ACCESSORY_NOT_DELETABLE");
    expect(result.reason.message.length).toBeGreaterThan(0);
  });

  // §11 row 16: a structural body offers no delete, and the refusal explains why.
  it("refuses a body the catalogue marks structural, with a reason a person can read", () => {
    const structural = KITCHEN_L_BODY_CATALOG.get("base-drawer3-600");
    expect(structural).toBeDefined();
    if (!structural) return;
    const cornerCatalog = new Map<string, BodyDefinition>(
      KITCHEN_L_BODY_CATALOG,
    );
    cornerCatalog.set("base-drawer3-600", {
      ...structural,
      canDelete: false,
      canReplace: false,
    });
    const result = removePlacement({
      design: KITCHEN_L_DESIGN,
      catalog: cornerCatalog,
      target: { kind: "placement", id: "p4" },
      occurredAt: OCCURRED_AT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("NOT_DELETABLE");
    expect(result.reason.message).toContain("structura");
  });

  it("refuses a timestamp it would otherwise copy into updatedAt", () => {
    const result = removePlacement({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: "p0" },
      occurredAt: "yesterday",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("INVALID_OCCURRED_AT");
  });
});

describe("removePlacement — success", () => {
  it("drops the body, copies occurredAt to updatedAt, and leaves createdAt alone", () => {
    const result = remove("p0");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements.map((p) => p.id)).not.toContain("p0");
    expect(result.design.placements).toHaveLength(
      KITCHEN_L_DESIGN.placements.length - 1,
    );
    expect(result.design.updatedAt).toBe(OCCURRED_AT);
    expect(result.design.createdAt).toBe(KITCHEN_L_DESIGN.createdAt);
    expect(result.effect.type).toBe("placement_removed");
  });

  // ADR 0011 Gap E: deleting `p2` must take `p3` (the hob) with it, in the same command and the
  // same result. What must not happen: a hob left hanging over the void where its cabinet was.
  it("cascades to the accessory its target carried", () => {
    const result = remove("p2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.cascadedAccessoryIds).toEqual(["p3"]);
    const ids = result.design.placements.map((p) => p.id);
    expect(ids).not.toContain("p2");
    expect(ids).not.toContain("p3");
  });

  it("leaves no placement whose host cannot be resolved", () => {
    const result = remove("p2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advance(
      createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
      result.design,
    );
    expect(after.records.filter((record) => record.accessory)).toEqual([]);
  });

  // ADR 0011 Gap D: the freed 400 mm must become a void. A delete that produces no void because
  // the column shrank to fit what is left reads as "delete does nothing".
  it("frees the top slot of a column without moving the column's top", () => {
    const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
    const result = remove("p18");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advance(world, result.design);
    expect(after.columns.get("A|2.00")?.top).toBe(2.6);
    const freed = findVacatedVoid(after.voids, result.effect.vacated);
    expect(freed?.y0).toBe(2.2);
    expect(freed?.h).toBeCloseTo(0.4, 6);
  });

  // §5.1: the vacated void is found by geometry, never by a remembered id — void ids are
  // regenerated on every recompute and a merge changes them.
  it("names a vacated opening the caller can find after the two neighbours merge", () => {
    const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
    const first = remove("p7");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = removePlacement({
      design: first.design,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: "p24" },
      occurredAt: OCCURRED_AT,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const after = advance(world, second.design);
    const merged = after.voids.filter((record) => record.col === "B|2.45");
    expect(merged.map((record) => record.y0)).toEqual([0, 1.5, 2.2]);
    expect(merged[0]?.spanH).toBeCloseTo(2.6, 6);
    const vacated = findVacatedVoid(after.voids, second.effect.vacated);
    expect(vacated?.y0).toBe(1.5);
  });
});

describe("removePlacement — rejection sweep", () => {
  it.each([
    ["void selected", "A|1.30:v0:0.00", "void"],
    ["missing target", "p999", "placement"],
    ["accessory", "p3", "placement"],
  ] as const)(
    "returns the exact original design and changes nothing (%s)",
    (_case, id, kind) => {
      const before = JSON.stringify(KITCHEN_L_DESIGN);
      const result = remove(id, kind);
      expect(result.ok).toBe(false);
      expect(result.design).toBe(KITCHEN_L_DESIGN);
      expect(result.design.updatedAt).toBe(KITCHEN_L_DESIGN.updatedAt);
      expect(JSON.stringify(KITCHEN_L_DESIGN)).toBe(before);
      expect(result).not.toHaveProperty("effect");
    },
  );
});
