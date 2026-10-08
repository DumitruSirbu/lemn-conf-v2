// Empty, cleared and stale states — the inputs a command meets only after something else has
// already happened.
//
// Every success here is checked against what it changed, never against the absence of an error:
// this project has shipped, twice, code that reported success while doing nothing.
import { describe, expect, it } from "vitest";

import { insertBody } from "../../src/commands/insert-body.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { offersFor } from "../../src/queries/offers.js";
import { findVacatedVoid } from "../../src/queries/vacated-void.js";
import { clearBodies, insertInto, OCCURRED_AT } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { advance, createWorld, voidAt } from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
const HOB_COLUMN = "A|2.60";

describe("a design with no placements at all", () => {
  const world = syntheticWorld([]);

  it("derives no columns and no openings", () => {
    expect(world.records).toEqual([]);
    expect([...world.columns.keys()]).toEqual([]);
    expect(world.voids).toEqual([]);
  });

  it("refuses a remove without inventing a target", () => {
    const result = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "p0" },
      occurredAt: OCCURRED_AT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("TARGET_NOT_FOUND");
    expect(result.design).toBe(world.design);
  });

  it("refuses an insert and adds nothing", () => {
    const result = insertBody({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      voids: world.voids,
      target: { kind: "void", id: "anything" },
      buildId: "base-3drawer",
      probe: createFakeProbe(),
      occurredAt: OCCURRED_AT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("TARGET_NOT_FOUND");
    expect(result.design.placements).toEqual([]);
  });

  it("describes nothing and offers nothing", () => {
    const target = { kind: "placement", id: "p0" } as const;
    expect(
      describeSelection({ ...world, catalog: world.catalog, target }),
    ).toBeUndefined();
    expect(offersFor({ ...world, target })).toEqual([]);
  });
});

describe("a column cleared to its last member (ADR 0011 Gap D)", () => {
  // A|0.30 is a wall-only column: p8 at 1.50 and p15 at 2.20, nothing on the floor.
  const cleared = clearBodies(seeded(), ["p8", "p15"]);

  it("still reports the run as openings rather than losing it (§11 row 18)", () => {
    expect(
      cleared.voids
        .filter((record) => record.col === "A|0.30")
        .map((record) => [
          Number(record.y0.toFixed(2)),
          Number(record.h.toFixed(2)),
        ]),
    ).toEqual([
      [1.5, 0.7],
      [2.2, 0.4],
    ]);
  });

  it("still accepts an insert, and the body lands back in the same column", () => {
    const result = insertInto(
      cleared,
      { kind: "void", id: voidAt(cleared, "A|0.30", 1.5).id },
      "open-shelf",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advance(cleared, result.design);
    const placed = after.records.find(
      (record) => record.id === result.effect.placementId,
    );
    expect(placed?.col).toBe("A|0.30");
    expect(placed?.frame.y0).toBeCloseTo(1.5, 6);
    expect(after.design.placements).toHaveLength(
      cleared.design.placements.length + 1,
    );
  });
});

describe("a void id that no longer names anything", () => {
  it("refuses the second insert into an opening the first one filled", () => {
    const cleared = clearBodies(seeded(), ["p7", "p24"]);
    const staleTarget = {
      kind: "void",
      id: voidAt(cleared, "B|2.45", 0).id,
    } as const;

    const first = insertInto(cleared, staleTarget, "base-3drawer");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const after = advance(cleared, first.design);

    const second = insertInto(after, staleTarget, "base-3drawer");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason.code).toBe("TARGET_NOT_FOUND");
    expect(second.design).toBe(after.design);
    expect(second.design.placements).toHaveLength(
      first.design.placements.length,
    );
  });

  it("refuses a second remove of the same body", () => {
    const world = seeded();
    const first = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "p1" },
      occurredAt: OCCURRED_AT,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = removePlacement({
      design: first.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "p1" },
      occurredAt: OCCURRED_AT,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason.code).toBe("TARGET_NOT_FOUND");
    expect(second.design).toBe(first.design);
  });
});

// ADR 0027 made the hob part of its cabinet body and ADR 0038 confirmed no document was ever
// stored carrying the pair, so there is no accessory placement left to cascade — §11 row 15 is
// satisfied by construction, the hob being a mesh inside its host rather than a placement beside
// it. What survives is the ordinary delete of the cabinet that carries it.
describe("deleting the cabinet the hob is built into", () => {
  const world = seeded();
  const result = removePlacement({
    design: world.design,
    catalog: world.catalog,
    target: { kind: "placement", id: "p2" },
    occurredAt: OCCURRED_AT,
  });

  it("removes exactly the one placement, hob and all", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.design.placements.map((placement) => placement.id);
    expect(ids).not.toContain("p2");
    expect(ids).toHaveLength(world.design.placements.length - 1);
  });

  it("leaves the vacated opening findable and free of the hob's own extent", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = advance(world, result.design);
    const vacated = findVacatedVoid(after.voids, result.effect.vacated);
    expect(vacated?.col).toBe(HOB_COLUMN);
    expect(vacated?.y0).toBeCloseTo(0, 6);
    expect(vacated?.h).toBeCloseTo(0.86, 6);
  });
});
