// Determinism and the anti-invariants, driven by random legal command sequences rather than by
// chosen examples.
//
// M2 proved §4's rules on hand-built fixtures. M3 is the first phase that can reach them by
// mutating, so this file reaches them the way a customer does: apply a legal sequence of inserts
// and removes to the seeded kitchen, and after every step assert what must still be true —
// including that the document still validates against its own schema.
import { describe, expect, it } from "vitest";

import { insertBody } from "../../src/commands/insert-body.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { canonicalSerializeDesign } from "../../src/serialize-design.js";
import { INSERTABLE_BODY_DEFINITIONS } from "../../src/catalog.js";
import { clearBodies, OCCURRED_AT } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import {
  advance,
  createWorld,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import {
  createRandom,
  findInvariantViolations,
  pick,
} from "../support/invariants.js";

const INSERTABLE_IDS = INSERTABLE_BODY_DEFINITIONS.map(([buildId]) => buildId);
const SEQUENCE_LENGTH = 14;
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233];

function seeded(): KitchenWorld {
  return createWorld(structuredClone(KITCHEN_L_DESIGN), KITCHEN_L_BODY_CATALOG);
}

interface Step {
  readonly label: string;
  readonly world: KitchenWorld;
}

/** One random command. A refusal is a legal outcome and is checked for identity, then skipped —
 *  the sequence continues from the unchanged world. */
function applyRandomCommand(world: KitchenWorld, random: () => number): Step {
  const removable = world.records.filter(
    (record) => !record.accessory && record.canDelete,
  );
  const wantsInsert = world.voids.length > 0 && random() < 0.5;

  if (!wantsInsert && removable.length > 0) {
    const target = pick(random, removable);
    const result = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: target.id },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) {
      expect(result.design).toBe(world.design);
      return { label: `remove ${target.id} refused`, world };
    }
    return {
      label: `remove ${target.id}`,
      world: advance(world, result.design),
    };
  }

  if (world.voids.length === 0) return { label: "no-op", world };
  const slot = pick(random, world.voids);
  const buildId = pick(random, INSERTABLE_IDS);
  const result = insertBody({
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    target: { kind: "void", id: slot.id },
    buildId,
    probe: createFakeProbe(),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) {
    expect(result.design).toBe(world.design);
    return { label: `insert ${buildId} refused`, world };
  }
  return {
    label: `insert ${buildId} at ${slot.col}@${slot.y0.toFixed(2)}`,
    world: advance(world, result.design),
  };
}

function runSequence(seed: number): {
  readonly world: KitchenWorld;
  readonly log: string[];
} {
  const random = createRandom(seed);
  const log: string[] = [];
  let world = seeded();
  for (let step = 0; step < SEQUENCE_LENGTH; step += 1) {
    const applied = applyRandomCommand(world, random);
    log.push(applied.label);
    world = applied.world;
    const violations = findInvariantViolations(world);
    expect(
      violations,
      `seed ${String(seed)} after [${log.join(" | ")}]`,
    ).toEqual([]);
  }
  return { world, log };
}

describe("random legal mutation sequences hold §3 and §4's invariants", () => {
  it.each(SEEDS)("seed %i", (seed) => {
    const { log } = runSequence(seed);
    expect(log).toHaveLength(SEQUENCE_LENGTH);
  });
});

describe("repeatability", () => {
  it.each(SEEDS)(
    "seed %i replays to a byte-identical canonical document",
    (seed) => {
      const first = runSequence(seed);
      const second = runSequence(seed);
      expect(canonicalSerializeDesign(second.world.design)).toBe(
        canonicalSerializeDesign(first.world.design),
      );
      expect(second.log).toEqual(first.log);
    },
  );

  it("applies the same insert to two fresh copies and gets the same document", () => {
    const run = () => {
      // The seeded kitchen is fully packed, so an opening has to be made before one can be filled.
      const world = clearBodies(seeded(), ["p8"]);
      const slot = world.voids[0];
      if (!slot) throw new Error("clearing p8 produced no void to insert into");
      return insertBody({
        design: world.design,
        catalog: world.catalog,
        columns: world.columns,
        target: { kind: "void", id: slot.id },
        buildId: "wall-cabinet",
        probe: createFakeProbe(),
        occurredAt: OCCURRED_AT,
      });
    };
    const first = run();
    const second = run();
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(canonicalSerializeDesign(second.design)).toBe(
      canonicalSerializeDesign(first.design),
    );
  });

  it("applies the same remove to two fresh copies and gets the same document", () => {
    const run = () =>
      removePlacement({
        design: seeded().design,
        catalog: KITCHEN_L_BODY_CATALOG,
        target: { kind: "placement", id: "p2" },
        occurredAt: OCCURRED_AT,
      });
    expect(canonicalSerializeDesign(run().design)).toBe(
      canonicalSerializeDesign(run().design),
    );
  });

  it("leaves the design it was given untouched, object and bytes", () => {
    const world = seeded();
    const before = canonicalSerializeDesign(world.design);
    const beforePlacements = world.design.placements;
    const result = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: "p2" },
      occurredAt: OCCURRED_AT,
    });
    expect(result.ok).toBe(true);
    expect(canonicalSerializeDesign(world.design)).toBe(before);
    expect(world.design.placements).toBe(beforePlacements);
    expect(result.design).not.toBe(world.design);
  });
});
