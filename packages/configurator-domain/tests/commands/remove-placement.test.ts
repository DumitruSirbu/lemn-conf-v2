import { describe, expect, it } from "vitest";

import { kindLabel } from "../../src/catalog.js";

import { removePlacement } from "../../src/commands/remove-placement.js";
import type { Design } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { findVacatedVoid } from "../../src/queries/vacated-void.js";
import type { BodyDefinition } from "../../src/void-engine.js";
import { advance, createWorld } from "../support/kitchen-world.js";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";

function removeFrom(
  design: Design,
  id: string,
  kind: "placement" | "void" = "placement",
) {
  return removePlacement({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    target: { kind, id },
    occurredAt: OCCURRED_AT,
  });
}

function remove(id: string, kind: "placement" | "void" = "placement") {
  return removeFrom(KITCHEN_L_DESIGN, id, kind);
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

  // §11 row 15: the hob was once a module of its own, offered six rows it could never satisfy, and
  // deleting it destroyed it permanently. ADR 0027 made it part of `p2`'s body, so there is no hob
  // placement left to refuse — a click on the hob selects `p2`, and deleting `p2` takes the hob
  // with it because they are one body. Pinned so a hob can never become separately deletable again.
  it("has no hob placement to point a delete at", () => {
    const hobIds = KITCHEN_L_DESIGN.placements
      .filter((placement) => placement.body.buildId.includes("hob"))
      .map((placement) => placement.id);
    expect(hobIds).toEqual(["p2"]);
    const result = remove("p2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements.map((p) => p.id)).not.toContain("p2");
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
    expect(result.reason.params).toEqual({ label: kindLabel("base_cabinet") });
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
    ["void selected", KITCHEN_L_DESIGN, "A|1.30:v0:0.00", "void"],
    ["missing target", KITCHEN_L_DESIGN, "p999", "placement"],
    ["structural body", KITCHEN_L_DESIGN, "p25", "placement"],
  ] as const)(
    "returns the exact original design and changes nothing (%s)",
    (_case, design, id, kind) => {
      const before = JSON.stringify(design);
      const result = removeFrom(design, id, kind);
      expect(result.ok).toBe(false);
      expect(result.design).toBe(design);
      expect(result.design.updatedAt).toBe(design.updatedAt);
      expect(JSON.stringify(design)).toBe(before);
      expect(result).not.toHaveProperty("effect");
    },
  );
});
