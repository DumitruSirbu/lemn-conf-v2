// Adversarial QA on M5B wave 5B5 / ADR 0049 — a fixed-width cabinet publishes the one width it is
// made at, with the engine's own `NOT_RESIZABLE` sentence.
//
// The implementer's suite asserts the happy path on the five seeded `fixedWidth` bodies and one
// anti-invariant case (a floor lifted above the only listed width). The load-bearing claim is
// narrower and stated in `set-width.ts` itself: the `declared.length === 0` guard runs **before**
// `resolveResizableBody`, so a body that resolves no width set at all is answered before the new
// refusal arm is reachable. That claim has more than one input, and this file attacks each of them
// separately rather than trusting the one the implementer picked.
//
// The rest is the ground a five-id table misses: the `fixedWidth` rows the seeded kitchen never
// places, the command's own behaviour under a sweep, the ranges the degenerate control is read off,
// determinism, and the probe the fixed arm must never need.
import { describe, expect, it } from "vitest";

import {
  acceptsWidthMm,
  resolveBuildableSizes,
  resolveCatalogEquivalent,
  toInsertableBody,
} from "../../src/catalog.js";
import type { BodyProbe } from "../../src/body-probe.js";
import { resolveResizableBody } from "../../src/commands/resolve-column-members.js";
import { columnWidthChoices, setWidth } from "../../src/commands/set-width.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { widthOptionsFor } from "../../src/queries/width-options.js";
import { widthStepsFor } from "../../src/queries/width-steps.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import type { BodyCatalog, BodyDefinition } from "../../src/void-engine.js";
import { clearBodies, OCCURRED_AT } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { createWorld, type KitchenWorld } from "../support/kitchen-world.js";
import { syntheticDesign } from "../support/synthetic-world.js";

function kitchen(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

function engineInput(world: KitchenWorld, placementId: string) {
  return {
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    target: { kind: "placement", id: placementId } as const,
    probe: createFakeProbe({ catalog: world.catalog }),
  };
}

function optionsFor(world: KitchenWorld, placementId: string) {
  return widthOptionsFor(engineInput(world, placementId));
}

function catalogWith(
  buildId: string,
  overrides: Partial<BodyDefinition>,
): BodyCatalog {
  const base = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!base) throw new Error(`no catalogue entry ${buildId}`);
  return new Map(KITCHEN_L_BODY_CATALOG).set(buildId, {
    ...base,
    ...overrides,
  });
}

/** `exactOptionalPropertyTypes` forbids writing `undefined` over an optional field, and a row that
 *  *omits* a field is the shape being modelled anyway — a catalogue entry nobody finished. */
function catalogWithout(
  buildId: string,
  key: keyof BodyDefinition,
): BodyCatalog {
  const base = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!base) throw new Error(`no catalogue entry ${buildId}`);
  const rest = Object.fromEntries(
    Object.entries(base).filter(([field]) => field !== key),
  ) as BodyDefinition;
  return new Map(KITCHEN_L_BODY_CATALOG).set(buildId, rest);
}

/** `p2`'s own row — the body from report item 9, and the one every ordering attack below edits. */
const HOB_BASE_SEEDED_ID = "base-hob-2drawer-600";
const HOB_BASE_CATALOG_ID = "base-hob-2drawer";

// -------------------------------------------------------------------------------------------
// Criterion 4, attacked at the ordering rather than at the one input the implementer chose.
// -------------------------------------------------------------------------------------------

/** **Every way a body can resolve no width set at all, each with the `fixedWidth` flag left true.**
 *
 *  ADR 0049's anti-invariant table names two situations and changes only one of them. The half that
 *  did **not** change is missing catalogue data, and it must keep failing loudly as a section that
 *  is not there — a chipless section, or worse a section carrying whatever width the placement
 *  happens to store, would make broken data look like a constrained product (FINDING R2.7).
 *
 *  The implementer's own case is the floor one. These reach the same emptiness through the pointer
 *  instead, which is the arm `set-width.ts`'s comment claims is unreachable, and each is asked with
 *  the flag **on**, because a flag read before the set is exactly what would let them through. */
describe("a fixedWidth body that resolves no set at all still renders no section", () => {
  const brokenCatalogues: readonly (readonly [string, BodyCatalog])[] = [
    [
      "its catalogEquivalentId points at no row",
      catalogWith(HOB_BASE_SEEDED_ID, { catalogEquivalentId: "no-such-entry" }),
    ],
    [
      "its catalogEquivalentId points at another seeded row, which is not insertable",
      catalogWith(HOB_BASE_SEEDED_ID, {
        catalogEquivalentId: "base-drawer2-600",
      }),
    ],
    [
      "the resolved entry lists no widths",
      catalogWith(HOB_BASE_CATALOG_ID, { sizesMm: [] }),
    ],
    [
      "the resolved entry declares no widths at all",
      catalogWithout(HOB_BASE_CATALOG_ID, "sizesMm"),
    ],
    [
      "the resolved entry's floor is above the only width it lists",
      catalogWith(HOB_BASE_CATALOG_ID, { minWidthMm: 900 }),
    ],
  ];

  it.each(brokenCatalogues)("publishes nothing when %s", (_name, catalog) => {
    const world = createWorld(KITCHEN_L_DESIGN, catalog);
    // The flag is untouched in every one of these, which is what makes them the ordering test.
    expect(world.records.find((record) => record.id === "p2")?.fixedWidth).toBe(
      true,
    );

    expect(columnWidthChoices(engineInput(world, "p2"))).toBeUndefined();
    expect(optionsFor(world, "p2")).toEqual([]);
    expect(widthStepsFor(engineInput(world, "p2"))).toBeUndefined();
  });

  // Non-vacuity for all five at once: the same body in the same fixture publishes its chip the
  // moment nothing is broken, so the empty answers above are about the missing set and not about a
  // fixture that never renders anything.
  it("publishes the chip for the same body on the unedited catalogue", () => {
    expect(optionsFor(kitchen(), "p2")).toHaveLength(1);
  });

  /** The transition, swept rather than sampled: the floor is the one input that empties the set by
   *  degrees, and a guard placed after the refusal arm would publish a chip on **every** value of
   *  it. `base-hob-2drawer` lists exactly {600}, so the section exists iff the floor is at or below
   *  600, and the sweep has to find the edge at 600/601 rather than be told it. */
  it("crosses from one chip to no section exactly where the floor passes the only width", () => {
    const transitions: number[] = [];
    let previous: number | undefined;
    for (let floorMm = 550; floorMm <= 650; floorMm += 1) {
      const world = createWorld(
        KITCHEN_L_DESIGN,
        catalogWith(HOB_BASE_CATALOG_ID, { minWidthMm: floorMm }),
      );
      const count = optionsFor(world, "p2").length;
      expect([floorMm, count]).toEqual([floorMm, floorMm <= 600 ? 1 : 0]);
      if (previous !== undefined && count !== previous)
        transitions.push(floorMm);
      previous = count;
    }
    expect(transitions).toEqual([601]);
  });
});

// -------------------------------------------------------------------------------------------
// The other half of the ordering claim, and the one place it does not hold.
// -------------------------------------------------------------------------------------------

/** The claim `set-width.ts` used to make, which this file falsified and which is now gone: *"Only
 *  the first of the two can still refuse by the time control reaches this line — a body with no
 *  equivalent resolves no set either, and the check above has already answered it."* The arm no
 *  longer reasons about the ordering at all — it reads the refusal's own `cause` — and these cases
 *  are what hold it there.
 *
 *  `resolveResizableBody` refuses for **two** reasons, and only one of them is `fixedWidth`. The
 *  other is `resolveRebuildBody` answering `undefined`, which happens whenever `toInsertableBody`
 *  refuses the resolved row — and that is a wider condition than `resolveBuildableSizes` answering
 *  empty. `resolveBuildableSizes` reads `sizesMm` alone; `toInsertableBody` also requires `label`,
 *  `widthFlex` and `nominalHeightMm`. A row that lists widths but is missing one of those three
 *  resolves a non-empty set **and** no rebuildable body, so it reaches the new arm and is published
 *  as a cabinet made at one width — on a body whose `fixedWidth` is `false`.
 *
 *  That is R2.7's own case wearing ADR 0049's clothes: unfinished catalogue data rendered as a
 *  constrained product, with a `NOT_RESIZABLE` sentence naming a cabinet whose row nobody finished.
 *  `catalog.test.ts` guards the shipped rows, so nothing reachable in the app produces it — but
 *  `columnWidthChoices` takes a `BodyCatalog` and this is what it does with one. */
describe("an unfinished catalogue row is missing data, not a fixed-width cabinet", () => {
  const unfinished: readonly (readonly [string, BodyCatalog])[] = [
    ["label", catalogWithout("base-sink", "label")],
    ["widthFlex", catalogWithout("base-sink", "widthFlex")],
    ["nominalHeightMm", catalogWithout("base-sink", "nominalHeightMm")],
  ];

  it.each(unfinished)(
    "renders no section for a resizable body whose resolved row has no %s",
    (_field, catalog) => {
      const world = createWorld(KITCHEN_L_DESIGN, catalog);
      // `p0` is a `base-sink-800`: resizable by its own flag, and `base-sink` — the row it would be
      // rebuilt through — is the one the override broke.
      expect(
        world.records.find((record) => record.id === "p0")?.fixedWidth,
      ).toBe(false);
      expect(
        resolveBuildableSizes(catalog, "base-sink").length,
      ).toBeGreaterThan(0);

      expect(optionsFor(world, "p0")).toEqual([]);
    },
  );
});

/** **The two causes are not exclusive, and a row that is both is missing data** (logic review on
 *  this wave). `resolveResizableBody` refuses on `!body || record.fixedWidth`, so a `fixedWidth` row
 *  that is *also* unfinished satisfies both — and any test made of the record's flag calls it a
 *  cabinet made at one width. Its label falls back through `describeRecordLabel` to the entry's
 *  `kind`, so what the customer would read is `„base_cabinet” nu își poate schimba lățimea.`
 *
 *  `base-hob-2drawer` is deliberately the row broken here: it is report item 9's own body and the
 *  most fixed-width thing in the catalogue, so if a flag-shaped discriminator survives anywhere it
 *  survives here. The refusal's `cause` is asserted beside the empty section, because "no section"
 *  alone would also pass if the arm were skipped for the wrong reason. */
describe("a row that is fixed-width and unfinished at once is missing data", () => {
  const brokenFields: readonly (keyof BodyDefinition)[] = [
    "label",
    "widthFlex",
    "nominalHeightMm",
  ];

  it.each(brokenFields)(
    "renders no section for the fixedWidth body whose resolved row has no %s",
    (field) => {
      const catalog = catalogWithout(HOB_BASE_CATALOG_ID, field);
      const world = createWorld(KITCHEN_L_DESIGN, catalog);
      // Both conditions hold at once, which is the entire point of the case.
      expect(
        world.records.find((record) => record.id === "p2")?.fixedWidth,
      ).toBe(true);
      expect(
        resolveBuildableSizes(catalog, HOB_BASE_CATALOG_ID).length,
      ).toBeGreaterThan(0);

      expect(optionsFor(world, "p2")).toEqual([]);
      expect(columnWidthChoices(engineInput(world, "p2"))).toBeUndefined();
    },
  );

  // And the refusal itself says which fact fired, rather than leaving a reader of the detail to
  // guess from a flag that is true in both cases.
  it("publishes the unresolvable cause, not the fixed one, when both hold", () => {
    const catalog = catalogWithout(HOB_BASE_CATALOG_ID, "label");
    const world = createWorld(KITCHEN_L_DESIGN, catalog);
    const record = world.records.find((candidate) => candidate.id === "p2");
    if (!record) throw new Error("no p2");

    const refusal = resolveResizableBody(catalog, record);
    expect(refusal.ok).toBe(false);
    if (refusal.ok) return;
    expect(refusal.detail.code).toBe("NOT_RESIZABLE");
    if (refusal.detail.code !== "NOT_RESIZABLE") return;
    expect(refusal.detail.params.cause).toBe("unresolvable");
  });

  // Non-vacuity, and the boundary the two cases sit either side of: the same body, the same
  // selection, one unbroken catalogue row — and the chip comes back.
  it("publishes the chip again once the row is whole", () => {
    const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
    expect(optionsFor(world, "p2")).toHaveLength(1);
  });
});

// -------------------------------------------------------------------------------------------
// Every fixed-width body, not the five the seeded kitchen happens to place.
// -------------------------------------------------------------------------------------------

/** The `fixedWidth` rows a customer can actually insert, read off the catalogue rather than listed,
 *  so a sixth row added later is swept without anyone remembering to add it here. The count is
 *  pinned beside it: a new `fixedWidth` entry is a new cabinet that will start showing a disabled
 *  width section, which is a product decision and should not arrive silently. */
const INSERTABLE_FIXED_WIDTH_IDS: readonly string[] = [
  ...KITCHEN_L_BODY_CATALOG,
]
  .filter(
    ([, definition]) => definition.insertable === true && definition.fixedWidth,
  )
  .map(([buildId]) => buildId);

function soleWorldFor(buildId: string): KitchenWorld {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`no catalogue entry ${buildId}`);
  const widthMm = definition.sizesMm?.[0];
  const heightMm = definition.nominalHeightMm;
  if (widthMm === undefined || heightMm === undefined) {
    throw new Error(`entry ${buildId} declares no width or height`);
  }
  const placement: DesignPlacement = {
    id: "only",
    wall: "A",
    alongMm: 1200,
    y0Mm: 0,
    body: { buildId, widthMm, heightMm },
  };
  return createWorld(syntheticDesign([placement]), KITCHEN_L_BODY_CATALOG);
}

describe("every fixed-width row in the catalogue, placed on its own", () => {
  it("holds the six the catalogue declares, so a seventh is a decision someone makes", () => {
    expect(INSERTABLE_FIXED_WIDTH_IDS).toEqual([
      "base-hob-2drawer",
      "base-hob-oven",
      "tall-pantry",
      "tall-oven-tower",
      "tall-fridge-housing",
      "fridge-free",
    ]);
  });

  it.each(INSERTABLE_FIXED_WIDTH_IDS)(
    "publishes one chip at its own width, with its own label, for %s",
    (buildId) => {
      const world = soleWorldFor(buildId);
      const record = world.records[0];
      if (!record) throw new Error("no record");
      const options = optionsFor(world, "only");

      expect(options).toHaveLength(1);
      const [only] = options;
      if (only?.verdict.status !== "fixed") {
        throw new Error(
          `expected a fixed verdict, got ${String(only?.verdict.status)}`,
        );
      }
      expect(only.widthMm).toBe(record.widthMm);
      // `cause` is part of the refusal since this wave's logic review: the two facts that produce
      // `NOT_RESIZABLE` are not exclusive, so which one fired is published rather than re-derived
      // from the record's flag. Pinned here because it is what allows this chip to be shown at all.
      expect(only.verdict.reason).toEqual({
        code: "NOT_RESIZABLE",
        params: {
          label: KITCHEN_L_BODY_CATALOG.get(buildId)?.label,
          cause: "fixed",
        },
      });
    },
  );

  /** Criterion 4's other half in ADR 0049's own words: *"reading that bound would give a cabinet
   *  that cannot be resized a stepper with two buttons that can never move."* Asserted for every
   *  fixed row, and against the row's **own** declared ranges, so a row whose bound is wider than
   *  its instance — `hood-600` inside `hood`'s 600–800 — cannot pass by coincidence. */
  it.each(INSERTABLE_FIXED_WIDTH_IDS)(
    "gets no stepper, and one degenerate range, for %s",
    (buildId) => {
      const world = soleWorldFor(buildId);
      const choices = columnWidthChoices(engineInput(world, "only"));

      expect(widthStepsFor(engineInput(world, "only"))).toBeUndefined();
      expect(choices?.widthRangesMm).toEqual([
        { minMm: world.records[0]?.widthMm, maxMm: world.records[0]?.widthMm },
      ]);
      expect(choices?.sizesMm).toEqual([world.records[0]?.widthMm]);
    },
  );
});

/** The seeded population, swept rather than named. Every `fixedWidth` record in the shipped kitchen
 *  gets either one `fixed` chip or no section at all, and **which one is decided by the set alone** —
 *  that equivalence is criterion 4 stated as a biconditional rather than as five ids and four
 *  corners. */
describe("the seeded kitchen's fixed-width bodies, by the rule rather than by id", () => {
  it("renders a chip exactly when the body resolves a width set, and never otherwise", () => {
    const world = kitchen();
    const withChip: string[] = [];
    const without: string[] = [];

    for (const record of world.records) {
      if (!record.fixedWidth) continue;
      const options = optionsFor(world, record.id);
      const hasSet =
        resolveBuildableSizes(world.catalog, record.buildId).length > 0;
      expect([record.id, options.length]).toEqual([record.id, hasSet ? 1 : 0]);
      if (options.length === 1) {
        const [only] = options;
        expect([record.id, only?.verdict.status, only?.widthMm]).toEqual([
          record.id,
          "fixed",
          record.widthMm,
        ]);
        withChip.push(record.id);
      } else {
        without.push(record.id);
      }
    }

    // ADR 0049's own consequences list, measured: five bodies gain a section, and the four corners
    // — which declare no catalogue equivalent — keep failing loudly as no section at all.
    expect([...withChip].sort()).toEqual(["p13", "p2", "p5", "p6", "p7"]);
    expect([...without].sort()).toEqual(["p21", "p25", "p26", "p9"]);
  });

  /** The width on the chip is the width of the cabinet in front of the customer, and ADR 0049 also
   *  calls it *"the one width it is made at"*. Those are the same number only while the placement's
   *  width is one its resolved row can actually build — which is the rule `validateDesignForCatalog`
   *  already enforces, so it is asserted here against that rule rather than against the set. */
  it("puts a width the resolved row can build on every fixed chip", () => {
    const world = kitchen();
    expect(validateDesignForCatalog(world.design, world.catalog)).toEqual([]);

    let checked = 0;
    for (const record of world.records) {
      const [only] = optionsFor(world, record.id);
      if (only?.verdict.status !== "fixed") continue;
      const equivalent = resolveCatalogEquivalent(
        world.catalog,
        record.buildId,
      );
      const body =
        equivalent &&
        toInsertableBody(equivalent.buildId, equivalent.definition);
      if (!body) throw new Error(`no resolvable body for ${record.id}`);
      expect([record.id, acceptsWidthMm(body, only.widthMm)]).toEqual([
        record.id,
        true,
      ]);
      checked += 1;
    }
    expect(checked).toBe(5);
  });
});

// -------------------------------------------------------------------------------------------
// Criterion 3: the command is unchanged, and the chip is not a route into it.
// -------------------------------------------------------------------------------------------

const SWEPT_WIDTHS_MM: readonly number[] = (() => {
  const widths: number[] = [];
  for (let widthMm = 150; widthMm <= 1000; widthMm += 25) widths.push(widthMm);
  // The odd ones the ladder never produces, and the width the chip itself publishes.
  widths.push(199, 301, 449, 599, 600, 601, 700, 701, 750);
  return widths;
})();

describe("setWidth still refuses NOT_RESIZABLE, at every width including the published one", () => {
  it("refuses every swept width on every fixed-width body, and changes no design", () => {
    const world = kitchen();
    const probe = createFakeProbe();
    let attempts = 0;

    for (const record of world.records) {
      if (!record.fixedWidth) continue;
      for (const widthMm of SWEPT_WIDTHS_MM) {
        const result = setWidth({
          design: world.design,
          catalog: world.catalog,
          columns: world.columns,
          target: { kind: "placement", id: record.id },
          widthMm,
          probe,
          occurredAt: OCCURRED_AT,
        });
        if (result.ok) {
          throw new Error(
            `setWidth accepted ${String(widthMm)} on fixed-width ${record.id}`,
          );
        }
        expect([record.id, widthMm, result.reason.code]).toEqual([
          record.id,
          widthMm,
          "NOT_RESIZABLE",
        ]);
        // §10: a refused command hands back the design it was given, untouched.
        expect(result.design).toBe(world.design);
        attempts += 1;
      }
    }
    expect(attempts).toBe(9 * SWEPT_WIDTHS_MM.length);
  });
});

// -------------------------------------------------------------------------------------------
// The fixed arm's own promises: no command run, no probe needed, same answer twice.
// -------------------------------------------------------------------------------------------

/** `width-options.ts` states that the command is **not** run for a fixed chip. A probe that throws
 *  on contact is the only way to assert that from outside: `setWidth` measures every candidate it
 *  considers, so a fixed chip produced without touching this probe is a chip produced without the
 *  command. */
const HOSTILE_PROBE: BodyProbe = {
  measure() {
    throw new Error("the fixed-width chip must not run the command");
  },
};

describe("the fixed chip is published without running the command", () => {
  it("answers with a probe that throws on contact", () => {
    const world = kitchen();
    const options = widthOptionsFor({
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "placement", id: "p2" },
      probe: HOSTILE_PROBE,
    });
    expect([options.length, options[0]?.verdict.status]).toEqual([1, "fixed"]);
  });

  it("gives the same answer twice and leaves the design untouched", () => {
    const world = kitchen();
    const before = JSON.stringify(world.design);
    const first = columnWidthChoices(engineInput(world, "p2"));
    const second = columnWidthChoices(engineInput(world, "p2"));

    expect(first).toEqual(second);
    expect(JSON.stringify(world.design)).toBe(before);
  });
});

/** A void reaches the width queries through the same call the panel makes, and ADR 0049 must not
 *  have given it a section: §9's "empty voids hide Finisaj, Mâner, Lățime" is untouched by this
 *  record, and the `meta.canWidth` gate that used to enforce it in the panel is gone. */
describe("a void is still not a fixed-width cabinet", () => {
  it("publishes no widths for the void the shipped kitchen holds", () => {
    // The shipped kitchen is full, so the void is opened through the real delete — the same way
    // report item 9's owner reached one.
    const world = clearBodies(kitchen(), ["p1", "p12", "p18"]);
    const emptied = world.voids[0];
    if (!emptied) throw new Error("clearing three bodies opened no void");
    const input = {
      design: world.design,
      catalog: world.catalog,
      columns: world.columns,
      target: { kind: "void", id: emptied.id } as const,
      probe: createFakeProbe(),
    };
    expect(columnWidthChoices(input)).toBeUndefined();
    expect(widthOptionsFor(input)).toEqual([]);
    expect(widthStepsFor(input)).toBeUndefined();
  });
});

/** Guard against the file's own fixtures drifting: `syntheticDesign` must still produce a design the
 *  domain would accept, or the six-row sweep above is measuring a document nobody could store. */
describe("the sweep's own fixtures are documents the domain accepts", () => {
  it.each(INSERTABLE_FIXED_WIDTH_IDS)(
    "validates the sole-placement design for %s",
    (buildId) => {
      const design: Design = soleWorldFor(buildId).design;
      expect(validateDesignForCatalog(design, KITCHEN_L_BODY_CATALOG)).toEqual(
        [],
      );
    },
  );
});

/** **The iff ADR 0049 actually asserts, in both directions.** The wave's risk is a body gaining a
 *  chip it should not have, and the `fixed` verdict is the only new way to gain one — so it must
 *  appear on a body exactly when that body's own row says it cannot be resized, and a resizable body
 *  in a column full of unresizable members must keep its ordinary blocked row rather than collapsing
 *  to one fixed chip. */
describe("a fixed verdict appears if and only if the body itself is fixedWidth", () => {
  it.each(["the shipped kitchen", "a kitchen with an emptied column"])(
    "holds in %s",
    (label) => {
      const world =
        label === "the shipped kitchen"
          ? kitchen()
          : clearBodies(kitchen(), ["p1", "p12", "p18"]);
      let fixedBodies = 0;
      let resizableWithBlockedRows = 0;

      for (const record of world.records) {
        const options = optionsFor(world, record.id);
        const isFixedChip =
          options.length === 1 && options[0]?.verdict.status === "fixed";
        const hasSet =
          resolveBuildableSizes(world.catalog, record.buildId).length > 0;
        expect([record.id, isFixedChip]).toEqual([
          record.id,
          record.fixedWidth && hasSet,
        ]);
        if (isFixedChip) fixedBodies += 1;
        // A resizable body standing in a column with an unresizable member keeps its whole declared
        // row, every chip blocked with the engine's reason (ADR 0032) — it does not become a single
        // fixed chip. `p8`, `p14` and `p24` are the shipped instances.
        if (
          !record.fixedWidth &&
          hasSet &&
          options.length > 1 &&
          options.every((option) => option.verdict.status !== "available")
        ) {
          resizableWithBlockedRows += 1;
        }
      }

      expect(fixedBodies).toBe(5);
      expect(resizableWithBlockedRows).toBeGreaterThan(0);
    },
  );
});
