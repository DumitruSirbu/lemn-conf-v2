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
          finish: "oak",
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
