// Adversarial QA for M3 Wave 3C-3, lead 1: the temporary dev affordance must invent no product
// behaviour. Its enabled/disabled states come from `describeSelection`'s `meta` and its rows from
// `offersFor`, so the rule "never offer what cannot be satisfied" holds only if those two agree
// with the commands.
//
// Asserted here rather than through the UI because it is a property of the engine, not of a button:
// a component test would prove that *this* scaffolding reads the right field, while this proves the
// field means what the scaffolding assumes. M4's real panel inherits the same guarantee.
import { describe, expect, it } from "vitest";

import { setFinish, setHandle } from "../../src/commands/set-appearance.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { insertBody } from "../../src/commands/insert-body.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { offersFor } from "../../src/queries/offers.js";
import {
  listInsertableBodies,
  type InsertableBody,
} from "../../src/catalog.js";
import { normaliseBand } from "../../src/bands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { OCCURRED_AT } from "../support/commands.js";
import {
  advance,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import type { CommandTarget } from "../../src/commands/command-result.js";
import { LEGACY_ENUM_FINISHES } from "../../src/materials.js";

const seededWorld = (): KitchenWorld =>
  createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

/** Every selection a customer can reach in a world: each placement, and each derived void. */
function everySelection(world: KitchenWorld): CommandTarget[] {
  return [
    ...world.records.map(
      (record) => ({ kind: "placement", id: record.id }) as const,
    ),
    ...world.voids.map((record) => ({ kind: "void", id: record.id }) as const),
  ];
}

/** The seeded kitchen has no voids, so a second world with three cleared openings is needed for
 *  the void half of the sweep to be non-vacuous. */
function clearedWorld(): KitchenWorld {
  let world = seededWorld();
  for (const id of ["p7", "p24", "p2"]) {
    const result = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) throw new Error(`fixture could not remove ${id}`);
    world = advance(world, result.design);
  }
  return world;
}

const WORLDS: readonly {
  readonly name: string;
  readonly build: () => KitchenWorld;
}[] = [
  { name: "the seeded kitchen", build: seededWorld },
  { name: "a kitchen with three cleared openings", build: clearedWorld },
];

describe("a control the affordance enables is a command the engine accepts", () => {
  it.each(WORLDS)("holds for every selection in $name", (testCase) => {
    const world = testCase.build();
    const selections = everySelection(world);
    expect(selections.length).toBeGreaterThan(0);

    let enabledDeletes = 0;
    let enabledFinishes = 0;
    for (const target of selections) {
      const meta = describeSelection({
        kitchenSettings: {},
        records: world.records,
        voids: world.voids,
        catalog: world.catalog,
        target,
      });
      if (!meta) continue;

      if (meta.canDelete) {
        enabledDeletes += 1;
        const result = removePlacement({
          design: world.design,
          catalog: world.catalog,
          target,
          occurredAt: OCCURRED_AT,
        });
        expect(result.ok, `remove enabled but refused for ${target.id}`).toBe(
          true,
        );
      }
      if (meta.canFinish) {
        enabledFinishes += 1;
        const result = setFinish({
          design: world.design,
          catalog: world.catalog,
          target,
          finish: LEGACY_ENUM_FINISHES.oak,
          occurredAt: OCCURRED_AT,
        });
        expect(
          result.ok,
          `setFinish enabled but refused for ${target.id}`,
        ).toBe(true);
      }
      if (meta.canHandle) {
        const result = setHandle({
          design: world.design,
          catalog: world.catalog,
          target,
          handle: "push",
          occurredAt: OCCURRED_AT,
        });
        expect(
          result.ok,
          `setHandle enabled but refused for ${target.id}`,
        ).toBe(true);
      }
    }

    // Anti-vacuity: a `meta` that answered `false` to everything would satisfy the loop above
    // without exercising it once.
    expect(enabledDeletes).toBeGreaterThan(0);
    expect(enabledFinishes).toBeGreaterThan(0);
  });

  // The other half of "never offer what cannot be satisfied": every row the panel renders comes
  // from `offersFor`, so every row it renders must actually insert.
  it.each(WORLDS)("performs every offered row in $name", (testCase) => {
    const world = testCase.build();
    let offeredRows = 0;

    for (const target of everySelection(world)) {
      for (const offer of offersFor({ ...world, target })) {
        offeredRows += 1;
        const result = insertBody({
          design: world.design,
          catalog: world.catalog,
          columns: world.columns,
          voids: world.voids,
          target,
          buildId: offer.buildId,
          probe: createFakeProbe(),
          occurredAt: OCCURRED_AT,
        });
        expect(
          result.ok,
          `${offer.buildId} offered for ${target.id} and then refused`,
        ).toBe(true);
      }
    }

    expect(offeredRows).toBeGreaterThan(0);
  });

  // **The other half, and the half that makes the first one honest — restated for the list the
  // owner ruled on 2026-09-10.** ADR 0032 asserted that a row published as *refused* is refused by
  // the command, with the same code, because that code was the sentence the disabled row showed.
  // There are no disabled rows now, so the claim turns into its complement: an entry the list left
  // out is an entry the command will not take. That is the same "one evaluation read from two ends"
  // property, and it is the stronger direction — a list that quietly dropped something insertable
  // hides a cabinet the customer could have had, and this is what catches it.
  /** The entries the list was choosing **from** for this target — §9's swap sets are band-scoped
   *  (ADR 0032 rule 5), and a band mismatch is not a fit refusal: it means the entry was never a
   *  candidate here at all. A sweep over the whole catalogue would therefore demand that `insertBody`
   *  refuse a base cabinet for a column member, which it does not and should not.
   *
   *  A void takes the whole catalogue, which is where §5.2's *"a column body goes anywhere"* earns the
   *  full-height rows a base slot offers. */
  function candidatesFor(
    world: KitchenWorld,
    target: CommandTarget,
  ): readonly InsertableBody[] {
    const candidates = listInsertableBodies(world.catalog);
    if (target.kind === "void") return candidates;
    const meta = describeSelection({ kitchenSettings: {}, ...world, target });
    if (!meta) return [];
    return candidates.filter(
      (body) => normaliseBand(body.band) === normaliseBand(meta.band),
    );
  }

  it.each(WORLDS)("refuses every entry it left out of $name", (testCase) => {
    const world = testCase.build();
    let omittedRows = 0;

    for (const target of everySelection(world)) {
      const offered = new Set(
        offersFor({ ...world, target }).map((offer) => offer.buildId),
      );
      for (const body of candidatesFor(world, target)) {
        if (offered.has(body.buildId)) continue;
        omittedRows += 1;
        const result = insertBody({
          design: world.design,
          catalog: world.catalog,
          columns: world.columns,
          voids: world.voids,
          target,
          buildId: body.buildId,
          probe: createFakeProbe(),
          occurredAt: OCCURRED_AT,
        });
        expect(
          result.ok,
          `${body.buildId} was left out for ${target.id} and then accepted`,
        ).toBe(false);
      }
    }

    expect(omittedRows).toBeGreaterThan(0);
  });

  // A void offers no appearance controls and no delete — the three refusals §5.1 lists, read from
  // the other end. This is the case the affordance would most easily get wrong, since a void is
  // still a selection with a `meta`.
  it("disables every command for a selected void", () => {
    const world = clearedWorld();
    const voidTargets = world.voids.map(
      (record) => ({ kind: "void", id: record.id }) as const,
    );
    expect(voidTargets.length).toBeGreaterThan(0);

    for (const target of voidTargets) {
      const meta = describeSelection({
        kitchenSettings: {},
        records: world.records,
        voids: world.voids,
        catalog: world.catalog,
        target,
      });

      expect(meta?.canDelete, target.id).toBe(false);
      expect(meta?.canFinish, target.id).toBe(false);
      expect(meta?.canHandle, target.id).toBe(false);
    }
  });
});
