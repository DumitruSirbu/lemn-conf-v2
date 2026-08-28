// **Insert and resize answer the width question the same way**, over the whole catalogue and a
// swept range — ADR 0032 rule 4, and `docs/BACKLOG.md` entry 13 held shut.
//
// That backlog entry was open because `sizesMm` was consulted by `setWidth` alone: §5.2's fit path
// was the single line `return { ok: true, widthM: opening.w }`, so a 300 mm opening offered
// `wall-2door` and built one door under a two-door label. ADR 0032 closed it by moving the bound
// into `resolveWidth`, and `acceptsWidthMm` has been the one predicate since.
//
// ADR 0035 decision 2 rewrote what that predicate **reads** — a declared bound per entry, where the
// standard ladder used to derive `[floor, ∞)` — which is exactly the shape of change that reopens
// backlog 13 if the two paths stop agreeing. So this asserts the agreement directly rather than
// trusting the shared call site: for every §7 entry and every width in a sweep, the insert path's
// verdict and `acceptsWidthMm` are compared, and the width a successful insert actually builds is
// checked against the same predicate.
import { describe, expect, it } from "vitest";

import {
  acceptsWidthMm,
  INSERTABLE_BODY_DEFINITIONS,
  listInsertableBodies,
  resolveCatalogEquivalent,
  toInsertableBody,
  type InsertableBody,
} from "../../src/catalog.js";
import { setWidth } from "../../src/commands/set-width.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { clearBodies, insertInto, OCCURRED_AT } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import {
  createWorld,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { columnWorld } from "../support/synthetic-world.js";

/** Wide enough to run past every bound in the catalogue at both ends, on the 50 mm grid and off it.
 *  The off-grid widths are the point: a range is a claim about the continuum, and a sweep that only
 *  visited chips could not tell a bound from the list it replaced. */
const SWEPT_WIDTHS_MM: readonly number[] = (() => {
  const widths = new Set<number>();
  for (let widthMm = 150; widthMm <= 900; widthMm += 10) widths.add(widthMm);
  for (const anchor of [200, 400, 450, 499, 500, 560, 570, 600, 800]) {
    for (const offset of [-1, 0, 1]) widths.add(anchor + offset);
  }
  return [...widths].sort((left, right) => left - right);
})();

const OPENING_COLUMN = "A|1.00";
const OPENING_ALONG_MM = 1000;

/** A base opening of exactly `widthMm`, with a wall body above it so the free span stops at its own
 *  level rather than collapsing the whole column into one opening. */
function baseOpeningWorld(widthMm: number): KitchenWorld {
  const world = columnWorld(OPENING_ALONG_MM, [
    { id: "s0", y0Mm: 0, heightMm: 820, widthMm },
    { id: "s1", y0Mm: 1500, heightMm: 700, buildId: "wall-2door-600", widthMm },
    {
      id: "s2",
      y0Mm: 2200,
      heightMm: 400,
      buildId: "wall-2door-600-top",
      widthMm,
    },
  ]);
  return clearBodies(world, ["s0"]);
}

/** A **full-height** opening, which is the only kind a `band: 'column'` body fits in. Clearing only
 *  the base slot leaves 820 mm and every tall unit answers `HEIGHT_TOO_LARGE` at every width — which
 *  is how the discrete case below came to assert nothing at all for four of its eight entries
 *  (5D2a QA, finding S4). */
function columnOpeningWorld(widthMm: number): KitchenWorld {
  const world = columnWorld(OPENING_ALONG_MM, [
    { id: "s0", y0Mm: 0, heightMm: 820, widthMm },
    { id: "s1", y0Mm: 1500, heightMm: 700, buildId: "wall-2door-600", widthMm },
    {
      id: "s2",
      y0Mm: 2200,
      heightMm: 400,
      buildId: "wall-2door-600-top",
      widthMm,
    },
  ]);
  return clearBodies(world, ["s0", "s1", "s2"]);
}

function wallOpeningWorld(widthMm: number): KitchenWorld {
  const world = columnWorld(OPENING_ALONG_MM, [
    { id: "s0", y0Mm: 0, heightMm: 820, widthMm },
    { id: "s1", y0Mm: 1500, heightMm: 700, buildId: "wall-2door-600", widthMm },
    {
      id: "s2",
      y0Mm: 2200,
      heightMm: 400,
      buildId: "wall-2door-600-top",
      widthMm,
    },
  ]);
  return clearBodies(world, ["s1"]);
}

function openingWorldFor(band: string, widthMm: number): KitchenWorld {
  if (band === "column") return columnOpeningWorld(widthMm);
  return band === "base"
    ? baseOpeningWorld(widthMm)
    : wallOpeningWorld(widthMm);
}

function openingY0For(band: string): number {
  return band === "base" || band === "column" ? 0 : 1.5;
}

/** The `'fit'` entries: the ones whose built width **is** the opening, so the insert path's verdict
 *  is a direct statement about that width. A discrete entry chooses the widest size that fits, which
 *  is a different question and gets its own case below. */
const FIT_BODIES: readonly InsertableBody[] = listInsertableBodies(
  KITCHEN_L_BODY_CATALOG,
).filter((body) => body.widthFlex === "fit");

describe("the insert path and the width predicate agree, width by width", () => {
  it("has a `fit` entry in every band the sweep visits, so no case is vacuous", () => {
    expect(FIT_BODIES.length).toBeGreaterThan(0);
    expect(new Set(FIT_BODIES.map((body) => body.band))).toEqual(
      new Set(["base", "wall"]),
    );
  });

  it.each(FIT_BODIES.map((body) => [body.buildId, body] as const))(
    "%s is inserted at exactly the widths `acceptsWidthMm` accepts",
    (buildId, body) => {
      const disagreements: string[] = [];
      for (const widthMm of SWEPT_WIDTHS_MM) {
        const world = openingWorldFor(body.band, widthMm);
        const opening = voidAt(world, OPENING_COLUMN, openingY0For(body.band));
        const result = insertInto(
          world,
          { kind: "void", id: opening.id },
          buildId,
        );
        // A refusal that is not about the width at all — the band filter, the depth, the probe —
        // is not this test's subject, so only width codes are compared. `acceptsWidthMm` accepting
        // a width some other rule refuses is legitimate; the converse never is.
        const widthRefusal = result.ok
          ? undefined
          : result.reason.code.startsWith("WIDTH_")
            ? result.reason.code
            : undefined;
        const accepted = acceptsWidthMm(body, widthMm);
        if (accepted && widthRefusal !== undefined) {
          disagreements.push(
            `${buildId}@${String(widthMm)}: predicate accepts, insert refused ${widthRefusal}`,
          );
        }
        if (!accepted && result.ok) {
          disagreements.push(
            `${buildId}@${String(widthMm)}: predicate refuses, insert built it`,
          );
        }
      }
      expect(disagreements).toEqual([]);
    },
  );

  // The discrete rows, which do not fill their opening: the width they *land on* still has to be one
  // the predicate accepts, or a resize could never reproduce what an insert just built.
  it("builds every discrete entry at a width the predicate accepts", () => {
    const offenders: string[] = [];
    // Per entry, not overall: an overall floor goes green while half the catalogue is skipped, which
    // is exactly what a full-height opening for the `column` band was hiding (5D2a QA, finding S4).
    const judged = new Map<string, number>();
    for (const [buildId, definition] of INSERTABLE_BODY_DEFINITIONS) {
      if (definition.widthFlex === "fit") continue;
      const body = listInsertableBodies(KITCHEN_L_BODY_CATALOG).find(
        (candidate) => candidate.buildId === buildId,
      );
      if (!body) throw new Error(`no insertable entry ${buildId}`);
      judged.set(buildId, 0);
      for (const widthMm of SWEPT_WIDTHS_MM) {
        const world = openingWorldFor(body.band, widthMm);
        const opening = voidAt(world, OPENING_COLUMN, openingY0For(body.band));
        const result = insertInto(
          world,
          { kind: "void", id: opening.id },
          buildId,
        );
        if (!result.ok) continue;
        judged.set(buildId, (judged.get(buildId) ?? 0) + 1);
        const builtMm = result.design.placements.at(-1)?.body.widthMm ?? 0;
        if (!acceptsWidthMm(body, builtMm)) {
          offenders.push(
            `${buildId}@${String(widthMm)} built ${String(builtMm)}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
    // Every discrete entry was actually built at least once. Without this the `continue` above turns
    // "never fits anywhere" into a pass.
    expect(
      [...judged].filter(([, count]) => count === 0).map(([id]) => id),
    ).toEqual([]);
  });
});

describe("what a resize accepts is what an insert would have built", () => {
  /** The shipped kitchen with `A|2.00` emptied through the real delete. ADR 0031 funds a resize from
   *  an adjacent column that is empty at every level, and the shipped kitchen has none at load. */
  function kitchenWithEmptyColumn(): KitchenWorld {
    return clearBodies(createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG), [
      "p1",
      "p12",
      "p18",
    ]);
  }

  /** Every member of the resized column, as the §7 entry a rebuild would go through. */
  function membersOf(world: KitchenWorld, columnKey: string) {
    return world.records
      .filter((record) => record.col === columnKey)
      .map((record) => {
        const equivalent = resolveCatalogEquivalent(
          world.catalog,
          record.buildId,
        );
        return equivalent
          ? toInsertableBody(equivalent.buildId, equivalent.definition)
          : undefined;
      });
  }

  // **The invariant this sub-wave exists to protect** (`docs/milestones/M5-width.md`, 5D2a's risk):
  // a bound that widened what `insertBody` offers without widening what `setWidth` accepts — or the
  // reverse — is `docs/BACKLOG.md` entry 13 reappearing. Both paths read one declaration now, so a
  // divergence would be silent; this states the agreement as an assertion over the shipped kitchen
  // rather than trusting the shared call site.
  it("resizes only to widths every member of the column could be inserted at", () => {
    const offenders: string[] = [];
    let accepted = 0;
    const world = kitchenWithEmptyColumn();
    for (const record of world.records) {
      for (const widthMm of SWEPT_WIDTHS_MM) {
        const result = setWidth({
          design: world.design,
          catalog: world.catalog,
          columns: world.columns,
          target: { kind: "placement", id: record.id },
          widthMm,
          probe: createFakeProbe(),
          occurredAt: OCCURRED_AT,
        });
        if (!result.ok) continue;
        accepted += 1;
        for (const member of membersOf(world, record.col)) {
          if (member && !acceptsWidthMm(member, widthMm)) {
            offenders.push(
              `${record.col}@${String(widthMm)}: ${member.buildId} refuses it`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
    // The sweep is not vacuous. ADR 0035 made ninety-seven taps reachable after one delete across
    // the nine clearable columns; this is one of those columns, swept over the continuum rather than
    // over the chip row, so it sees more.
    expect(accepted).toBeGreaterThan(0);
  });

  // The converse direction, and the one a shared predicate makes easy to get wrong: a width that is
  // legal for **every** member and funded by the empty column must not be refused on width grounds.
  it("refuses no funded width that every member accepts", () => {
    const world = kitchenWithEmptyColumn();
    const refusedOnWidth: string[] = [];
    for (const record of world.records) {
      const members = membersOf(world, record.col);
      if (members.some((member) => member === undefined)) continue;
      for (const widthMm of SWEPT_WIDTHS_MM) {
        const result = setWidth({
          design: world.design,
          catalog: world.catalog,
          columns: world.columns,
          target: { kind: "placement", id: record.id },
          widthMm,
          probe: createFakeProbe(),
          occurredAt: OCCURRED_AT,
        });
        if (result.ok) continue;
        // Only `WIDTH_NOT_SUPPORTED` is this test's subject. Every other refusal — no empty space,
        // a non-resizable member, an unaligned column, the width the body already stands at — is a
        // fact about the *design*, not about what the entry may be built at.
        if (result.reason.code !== "WIDTH_NOT_SUPPORTED") continue;
        if (
          members.every((member) => member && acceptsWidthMm(member, widthMm))
        ) {
          refusedOnWidth.push(`${record.id}@${String(widthMm)}`);
        }
      }
    }
    // The residue is the candidate union, and it is deliberate (ADR 0031 rule 5, and the note in
    // `set-width.ts`): a resize lands only on a width **somebody in the column offers as a chip**,
    // so an off-grid width every member's bound accepts is still refused. That is what keeps a
    // resize modular; the widths listed here are all off the 50 mm grid, and none is a chip.
    expect(
      refusedOnWidth.every((entry) => {
        const widthMm = Number(entry.split("@")[1]);
        return widthMm % 50 !== 0;
      }),
      `on-grid width refused despite every member accepting it: ${refusedOnWidth.join(", ")}`,
    ).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// §11 row 14, restored — the case the whole 450 argument was about.
// -------------------------------------------------------------------------------------------

describe("the dishwasher column can be matched at 450", () => {
  /** `A|2.00` is the dishwasher column: `p1` the 450/600 niche, `p12` an open shelf, `p18` a wall
   *  cabinet. `A|1.30` beside it is cleared, so ADR 0031's donor rule has empty space to spend. */
  function dishwasherColumnWithSpace(): KitchenWorld {
    return clearBodies(createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG), [
      "p0",
      "p11",
      "p17",
    ]);
  }

  const DISHWASHER_COLUMN_IDS = ["p1", "p12", "p18"] as const;

  // **This is §11 row 14 read as a column rather than as an entry.** "Dishwasher niche: only
  // 450 / 600" was true of `base-dishwasher` and false of the column it stands in: ADR 0030 capped a
  // single hinged door at 400, so the `wall-cabinet` at `p18` could not be built at 450 and the
  // intersection collapsed to 600 alone. ADR 0034 was written around that mismatch, and ADR 0035's
  // Consequences say row 14 "is restored rather than superseded… once a wall cabinet can be built at
  // 450". The owner retired the cap on 2026-08-28 and this is where the restoration is observable.
  //
  // Asserted from **every member** of the column, because §5.4 resizes the column and a customer can
  // tap the chip on any of the three.
  it.each(DISHWASHER_COLUMN_IDS)(
    "accepts a resize to 450 tapped from %s",
    (placementId) => {
      const world = dishwasherColumnWithSpace();
      const result = setWidth({
        design: world.design,
        catalog: world.catalog,
        columns: world.columns,
        target: { kind: "placement", id: placementId },
        widthMm: 450,
        probe: createFakeProbe(),
        occurredAt: OCCURRED_AT,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const id of DISHWASHER_COLUMN_IDS) {
        const placement = result.design.placements.find(
          (candidate) => candidate.id === id,
        );
        expect([id, placement?.body.widthMm]).toEqual([id, 450]);
      }
    },
  );

  // Every member's own catalogue entry accepts 450 — which is *why* the command does, and the
  // assertion that fails if ADR 0030's cap is reinstated on any one of the three rows rather than
  // on the entry the sweep above happens to tap.
  it("has every member's entry accept 450, the wall cabinet included", () => {
    const world = dishwasherColumnWithSpace();
    for (const id of DISHWASHER_COLUMN_IDS) {
      const record = world.records.find((candidate) => candidate.id === id);
      const equivalent = record
        ? resolveCatalogEquivalent(world.catalog, record.buildId)
        : undefined;
      const body = equivalent
        ? toInsertableBody(equivalent.buildId, equivalent.definition)
        : undefined;
      expect([id, body && acceptsWidthMm(body, 450)]).toEqual([id, true]);
    }
  });

  // The anti-invariant, so "accepts 450" is not read as "accepts anything": the niche is discrete,
  // and the column cannot follow the cabinetry members up to 800.
  it("still refuses 800, which the niche is not made at", () => {
    const world = dishwasherColumnWithSpace();
    const result = setWidth({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "placement", id: "p1" },
      widthMm: 800,
      probe: createFakeProbe(),
      occurredAt: OCCURRED_AT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("WIDTH_NOT_SUPPORTED");
  });
});
