// Adversarial QA for wave 5D2b's final part — the hood floor (ADR 0035 decision 6, amended
// 2026-08-29) and the shrink strip that ADR 0035 decision 7 creates.
//
// **This file was half about ADR 0037's merge, and that half is gone with it.** Five blocks proved
// the merge terminated on a chain, did not depend on iteration order, refused to clobber an occupied
// key, conserved the wall across every delete on the shipped kitchen, and united across levels. All
// five passed — and none of it mattered, because a cabinet inserted into a merged span closed the
// level. The foot-note at the end of this file records what left and why.
//
// **Every row here passes.** Two were findings and are answered: the no-width sentence, and the
// strip that publishes an opening nothing fits. Both keep their measurement rather than their
// failure, so the shape stays visible instead of becoming folklore.
import { describe, expect, it } from "vitest";

import type { DesignPlacement } from "../../src/design.js";
import { insertBody } from "../../src/commands/insert-body.js";
import { columnWidthChoices } from "../../src/commands/set-width.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { offersFor } from "../../src/queries/offers.js";
import { widthOptionsFor } from "../../src/queries/width-options.js";
import {
  clearBodies,
  insertInto,
  OCCURRED_AT,
  resizeTo,
} from "../support/commands.js";
import { renderRejection } from "../../src/commands/rejection.js";
import { createFakeProbe } from "../support/fake-probe.js";
import {
  advance,
  advanceWithColumns,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";

function placement(
  id: string,
  alongMm: number,
  y0Mm: number,
  buildId: string,
  widthMm: number,
  heightMm: number,
): DesignPlacement {
  return { id, wall: "A", alongMm, y0Mm, body: { buildId, widthMm, heightMm } };
}

function shippedKitchen(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

/** Every column with no record filed under it, as `key:widthMm`, sorted — the shape a shrink's
 *  vacated strip takes. */
function emptyColumns(world: KitchenWorld): string[] {
  return [...world.columns.values()]
    .filter(
      (column) => !world.records.some((record) => record.col === column.key),
    )
    .map((column) => `${column.key}:${String(Math.round(column.w * 1000))}`)
    .sort();
}

describe("the hood floor", () => {
  it("takes the widest hood where a column holds two", () => {
    const world = syntheticWorld([
      placement("run", 1000, 0, "base-panbank", 800, 860),
      placement("small-hood", 1000, 1500, "hood", 600, 710),
      placement("big-hood", 1000, 2300, "hood", 800, 710),
    ]);

    expect(
      columnWidthChoices({
        design: world.design,
        catalog: world.catalog,
        target: { kind: "placement", id: "run" },
      })?.sizesMm,
    ).toEqual([800]);
  });

  it("floors at an off-grid hood's own width, not at a catalogue size", () => {
    // A 650 mm hood is not a size the catalogue builds a hood at, and the floor is the hood's
    // *standing* width, so 650 is exactly where the column stops.
    const world = syntheticWorld([
      placement("run", 1000, 0, "base-panbank", 800, 860),
      placement("odd-hood", 1000, 1500, "hood", 650, 710),
    ]);

    expect(
      columnWidthChoices({
        design: world.design,
        catalog: world.catalog,
        target: { kind: "placement", id: "run" },
      })?.sizesMm,
    ).toEqual([650, 700, 750, 800]);
  });

  it("explains itself when the column can agree on no width at all", () => {
    // **The frozen column is reachable in two ordinary taps, not only by seeding.** The commit
    // records the 600 mm hood over a 200/300 bottle cargo as *"only reachable by seeding it — the
    // floor is what stops a resize producing it"*. The floor lives in `setWidth` alone: `offersFor`
    // and `insertBody` know nothing about it, so deleting the shipped hob base `p2` and inserting a
    // `base-bottle-cargo` into the opening it leaves under the shipped hood `p13` produces exactly
    // that column.
    //
    // And once there the two halves disagree. `columnWidthChoices` falls back to the selected body's
    // own `declared` set when the intersection is empty (`set-width.ts`, `candidates`), so §9 renders
    // chips for 200 and 300 — while `refuseIllegalWidth` refuses both with `WIDTH_NOT_SUPPORTED`
    // carrying `sizesMm: []`, which renders as a sentence with a hole in it:
    // *„Cargo îngust pentru sticle” se face doar în  mm, iar deschiderea are 600 mm.*
    //
    // **Answered 2026-08-30.** Two halves, and only one was a defect.
    //
    // The *record* was wrong and is corrected: this column is reachable in two ordinary taps, not by
    // seeding, and ADR 0035's amendment now says so.
    //
    // The *fallback* stays. ADR 0032's rule is disabled-with-a-reason rather than removed, so a
    // column that can agree on nothing must still render its chips and explain itself — rendering
    // no section at all is the defect wave 5D2a was written to fix. What was genuinely broken was
    // the sentence: an empty list rendered as *„…” se face doar în  mm*, a hole where the numbers
    // belong. `renderWidthNotSupported` now answers the no-width case as its own sentence, naming
    // the cause the customer can act on — the bodies above.
    //
    // So this asserts what a customer READS, not what the params carry. An empty `sizesMm` is the
    // truth here; a sentence with a gap in it never is.
    const cleared = clearBodies(shippedKitchen(), ["p2"]);
    const opening = cleared.voids.find(
      (record) => record.col === "A|2.60" && record.y0 < 0.1,
    );
    if (!opening) throw new Error("Expected the base opening under the hood");
    const inserted = insertInto(
      cleared,
      { kind: "void", id: opening.id },
      "base-bottle-cargo",
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const after = advance(cleared, inserted.design);
    const cargo = after.records.find(
      (record) => record.buildId === "base-bottle-cargo",
    );
    if (!cargo) throw new Error("Expected the inserted cargo");

    const options = widthOptionsFor({
      design: after.design,
      catalog: after.catalog,
      columns: after.columns,
      target: { kind: "placement", id: cargo.id },
      probe: createFakeProbe(),
    });

    const refused = options.filter(
      (option) => option.verdict.status === "refused",
    );
    // The section is rendered rather than suppressed (ADR 0032). One chip is the body's current
    // width — `active`, a fact about the body rather than an answer from the command (ADR 0034) —
    // and every other chip is refused.
    expect(refused.length).toBe(options.length - 1);
    expect(refused.length).toBeGreaterThan(0);
    for (const option of refused) {
      if (option.verdict.status !== "refused") continue;
      const sentence = renderRejection(option.verdict.reason);
      expect(sentence).not.toContain("doar în  mm");
      expect(sentence).toBe(
        "„Cargo îngust pentru sticle” nu poate fi construit la nicio lățime pe care o acceptă și corpurile de deasupra.",
      );
    }
  });
});

// ---------------------------------------------------------------------------------------------
// FINDING C — the growth-only floor is right, and the strip it now permits is published as an
// opening nothing fits.
// ---------------------------------------------------------------------------------------------

describe("a shrink's strip widens on the next press", () => {
  function oneRun(): KitchenWorld {
    return syntheticWorld([
      placement("run", 1000, 0, "base-panbank", 600, 860),
    ]);
  }

  function press(world: KitchenWorld, widthMm: number): KitchenWorld {
    const result = resizeTo(world, "run", widthMm);
    if (!result.ok)
      throw new Error(`Refused ${String(widthMm)}: ${result.reason.code}`);
    return advanceWithColumns(world, result.design, result.effect.columns);
  }

  it("absorbs the strip rather than parking a second one beside it", () => {
    // The growth-only floor, from the other end: each press finds the strip the last one made and
    // widens it, so the count stays at one and the width climbs by 50 every time.
    let world = oneRun();
    const widths: string[] = [];
    for (const widthMm of [550, 500, 450, 400, 350, 300]) {
      world = press(world, widthMm);
      widths.push(emptyColumns(world).join(","));
    }
    expect(widths).toEqual([
      "A|1.27:50",
      "A|1.25:100",
      "A|1.23:150",
      "A|1.20:200",
      "A|1.18:250",
      "A|1.15:300",
    ]);
  });

  // **FINDING C, answered 2026-08-30, and the answer is a sentence rather than a suppression.**
  //
  // A 50 mm strip is published as a selectable opening that `offersFor` answers with sixteen rows
  // and nothing offered. Suppressing it was tried and reverted: a horizontal floor on void emission
  // also hides the 190-199 mm openings `bottle-cargo-width-floor.test.ts` observes a refusal in, and
  // ADR 0032's rule is disabled-with-a-reason rather than removed. The owner has already decided the
  // space itself is fine (ADR 0037, *"ok to have empty space left"*).
  //
  // What is owed is §9 telling the customer the space is too narrow for anything and may be left —
  // wave 5D2c's copy, recorded in `docs/milestones/M5-width.md`. The measurement below is kept as a
  // passing row so the shape stays visible rather than becoming folklore.
  it("publishes the strip as an opening, with nothing offered into it", () => {
    const world = press(oneRun(), 550);
    const strip = world.voids.find((record) => record.w < 0.1);
    if (!strip) throw new Error("Expected the 50 mm strip to be an opening");

    const offers = offersFor({
      ...world,
      target: { kind: "void", id: strip.id },
    });

    expect(offers.length).toBeGreaterThan(0);
    expect(
      offers.filter((offer) => offer.verdict.status === "offered"),
    ).toEqual([]);
  });
});

describe("an inserted hood is fitted to its opening, so the floor is never breached by an insert", () => {
  it("places the resizable hood row at 600 in a 600 mm opening, not at its 800 maximum", () => {
    // The attack the floor invites: `hood` (600–800, not `fixedWidth`) is offered into the opening
    // the shipped `hood-600` leaves. If the insert took the row's maximum the hood would span
    // 2200–3000 and bury 100 mm of each neighbour. It does not — it is fitted to the column.
    const cleared = clearBodies(shippedKitchen(), ["p13"]);
    const opening = cleared.voids.find(
      (record) => record.col === "A|2.60" && record.y0 > 1.4 && record.y0 < 1.6,
    );
    if (!opening) throw new Error("Expected the hood's opening");

    const result = insertBody({
      design: cleared.design,
      catalog: cleared.catalog,
      columns: cleared.columns,
      target: { kind: "void", id: opening.id },
      buildId: "hood",
      probe: createFakeProbe(),
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placed = result.design.placements.find(
      (entry) => entry.body.buildId === "hood",
    );
    expect(placed?.body.widthMm).toBe(600);
    expect(placed?.alongMm).toBe(2600);
  });
});

// **The merge's own attacks were here, and they are withdrawn with the merge** (2026-08-29).
// Five blocks: a chain of five collapsing to one 3000 mm space and doing so order-independently, a
// union refusing to clobber an occupied key, a sweep of every delete on the shipped kitchen finding
// zero drift, the cross-level union, and FINDING A. The first four passed — the machinery was
// correct. FINDING A is why none of that mattered: a 600 mm cabinet inserted into a merged 1400 mm
// span closes the level and strands 800 mm of wall, because §4 has no horizontal half. The merge is
// unbuildable until backlog 2's re-split exists; `void-engine.ts`'s `recomputeVoids` carries
// the reasoning, and the blocks belong with the wave that builds it.
