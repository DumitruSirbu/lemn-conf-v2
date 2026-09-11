// Adversarial QA for wave 6B-f, domain half: **no reachable `BodyLabel` names something the
// catalogue cannot, at either declared cabinet depth, and no descriptor carries prose.**
//
// The wave's own `body-label.test.ts` sweeps `INSERTABLE_BODY_DEFINITIONS` — the materialisation at
// the *shipped* depth — and picks two seeded rows by hand. Since 6J the catalogue is a function of a
// cabinet depth, so "every entry" at 600 is half the population; and since 6B-f the descriptor *is*
// the name, so a pointer that resolves at one depth and not the other renames a body silently.
// What is swept here is both depths, both populations, and the one branch the wave added without a
// test: `describeRecordLabel` for a `buildId` the catalogue does not hold.
import { describe, expect, it } from "vitest";

import {
  buildInsertableBodyDefinitions,
  describeBodyLabelAt,
  describeBodyName,
  deriveDoorCount,
  entryLabel,
  isKnownKind,
  kindLabel,
  labelWithDoors,
  TWO_DOOR_MIN_WIDTH_MM,
  type BodyLabel,
} from "../src/catalog.js";
import { describeRecordLabel } from "../src/commands/resolve-column-members.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { declaredCabinetDepthsMm } from "../src/worktop-depth.js";
import { createWorld } from "./support/kitchen-world.js";

/** An id or a kind, never a sentence. The one shape a descriptor payload may take, asserted so a
 *  later wave cannot put a rendered word back into the domain through the descriptor's own door. */
const IDENTIFIER = /^[a-z][a-z0-9_-]*$/u;

interface ReachedLabel {
  readonly origin: string;
  readonly label: BodyLabel;
}

function flatten(label: BodyLabel): BodyLabel {
  return label.kind === "withDoors" ? label.name : label;
}

/** Every descriptor the shipped product can build, at every declared depth: the §7 rows at their own
 *  offered widths plus ADR 0033's threshold either side, and every seeded instance. */
function everyReachableLabel(): readonly ReachedLabel[] {
  const reached: ReachedLabel[] = [];
  for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
    const insertable = buildInsertableBodyDefinitions(cabinetDepthMm);
    for (const [buildId, definition] of insertable) {
      const widths = [
        ...(definition.sizesMm ?? []),
        TWO_DOOR_MIN_WIDTH_MM - 1,
        TWO_DOOR_MIN_WIDTH_MM,
      ];
      for (const widthMm of widths) {
        reached.push({
          origin: `${String(cabinetDepthMm)}/entry/${buildId}@${String(widthMm)}`,
          label: describeBodyLabelAt({ buildId, definition }, widthMm),
        });
      }
    }
    for (const [buildId, definition] of buildKitchenLBodyCatalog(
      cabinetDepthMm,
    )) {
      reached.push({
        origin: `${String(cabinetDepthMm)}/seeded/${buildId}`,
        label: describeBodyName({ buildId, definition }),
      });
    }
  }
  return reached;
}

const REACHABLE = everyReachableLabel();

function insertableIdsAt(cabinetDepthMm: number): ReadonlySet<string> {
  return new Set(
    buildInsertableBodyDefinitions(cabinetDepthMm).map(([buildId]) => buildId),
  );
}

describe("6B-f: the descriptor names something real at every declared depth", () => {
  it("swept both depths and both populations, not one materialisation", () => {
    const depths = new Set(REACHABLE.map(({ origin }) => origin.split("/")[0]));
    const seeded = REACHABLE.filter(({ origin }) =>
      origin.includes("/seeded/"),
    );

    expect(depths.size).toBe(declaredCabinetDepthsMm().length);
    expect(depths.size).toBeGreaterThan(1);
    expect(REACHABLE.length).toBeGreaterThan(200);
    expect(seeded.length).toBeGreaterThan(2 * KITCHEN_L_BODY_CATALOG.size - 1);
  });

  it("resolves every entry descriptor against the catalogue built at that same depth", () => {
    // ADR 0064: the seeded row is named by the §7 entry a §5.4 resize would rebuild it through, and
    // that entry has to exist **at the depth this catalogue was built at**. A pointer resolving at
    // 600 and not at 700 renames the body the moment the setting moves.
    for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
      const known = insertableIdsAt(cabinetDepthMm);
      const atDepth = REACHABLE.filter(({ origin }) =>
        origin.startsWith(`${String(cabinetDepthMm)}/`),
      );

      for (const { origin, label } of atDepth) {
        const inner = flatten(label);
        if (inner.kind !== "entry") continue;
        expect([origin, known.has(inner.buildId)]).toEqual([origin, true]);
      }
    }
  });

  it("names every kind descriptor with a kind the catalogue calls known", () => {
    for (const { origin, label } of REACHABLE) {
      const inner = flatten(label);
      if (inner.kind !== "bodyKind") continue;
      expect([origin, isKnownKind(inner.bodyKind)]).toEqual([origin, true]);
    }
  });

  it("carries an identifier in every payload, never a rendered word", () => {
    for (const { origin, label } of REACHABLE) {
      const inner = flatten(label);
      const payload =
        inner.kind === "entry"
          ? inner.buildId
          : inner.kind === "bodyKind"
            ? inner.bodyKind
            : "";
      if (payload === "") continue;
      expect([origin, IDENTIFIER.test(payload)]).toEqual([origin, true]);
    }
  });

  it("is one wrap deep at most, everywhere it is reachable", () => {
    for (const { origin, label } of REACHABLE) {
      if (label.kind !== "withDoors") continue;
      expect([origin, label.name.kind]).not.toEqual([origin, "withDoors"]);
      expect([origin, Number.isInteger(label.doors), label.doors > 0]).toEqual([
        origin,
        true,
        true,
      ]);
    }
  });

  it("answers the same descriptor twice from two independently built catalogues", () => {
    // The descriptor is a value, and a value that depends on build order is a defect the panel and
    // the priced document would disagree about.
    for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
      const first = buildInsertableBodyDefinitions(cabinetDepthMm);
      const second = buildInsertableBodyDefinitions(cabinetDepthMm);

      for (const [index, [buildId, definition]] of first.entries()) {
        const other = second[index];
        if (other === undefined) throw new Error("catalogues differ in length");
        expect([
          buildId,
          describeBodyLabelAt({ buildId, definition }, 600),
        ]).toEqual([
          buildId,
          describeBodyLabelAt({ buildId: other[0], definition: other[1] }, 600),
        ]);
      }
    }
  });
});

describe("6B-f: ADR 0033's count over a swept width range, not sampled widths", () => {
  // The rows that follow width are counted at **every integer millimetre** across the threshold, so
  // a count that flipped anywhere but at `TWO_DOOR_MIN_WIDTH_MM` fails here rather than at a width
  // nobody sampled.
  const SWEEP_FROM_MM = TWO_DOOR_MIN_WIDTH_MM - 200;
  const SWEEP_TO_MM = TWO_DOOR_MIN_WIDTH_MM + 200;

  it("flips from one door to two at the threshold and nowhere else", () => {
    const followsWidth = buildInsertableBodyDefinitions(600).filter(
      ([, definition]) => definition.doorCountFollowsWidth === true,
    );
    expect(followsWidth.length).toBeGreaterThan(0);

    for (const [buildId, definition] of followsWidth) {
      for (let widthMm = SWEEP_FROM_MM; widthMm <= SWEEP_TO_MM; widthMm += 1) {
        const label = describeBodyLabelAt({ buildId, definition }, widthMm);
        expect([buildId, widthMm, label]).toEqual([
          buildId,
          widthMm,
          labelWithDoors(
            entryLabel(buildId),
            widthMm < TWO_DOOR_MIN_WIDTH_MM ? 1 : 2,
          ),
        ]);
      }
    }
  });

  it("leaves every other row uncounted across the same sweep", () => {
    const staysGeneric = buildInsertableBodyDefinitions(600).filter(
      ([, definition]) => definition.doorCountFollowsWidth !== true,
    );
    expect(staysGeneric.length).toBeGreaterThan(0);

    for (const [buildId, definition] of staysGeneric) {
      for (let widthMm = SWEEP_FROM_MM; widthMm <= SWEEP_TO_MM; widthMm += 50) {
        expect([
          buildId,
          widthMm,
          describeBodyLabelAt({ buildId, definition }, widthMm),
        ]).toEqual([buildId, widthMm, entryLabel(buildId)]);
      }
    }
  });

  it("agrees with deriveDoorCount rather than restating it", () => {
    for (let widthMm = SWEEP_FROM_MM; widthMm <= SWEEP_TO_MM; widthMm += 1) {
      expect([widthMm, deriveDoorCount(widthMm)]).toEqual([
        widthMm,
        widthMm < TWO_DOOR_MIN_WIDTH_MM ? 1 : 2,
      ]);
    }
  });
});

describe("6B-f: describeRecordLabel's new fallback branch", () => {
  // The branch the wave added and left untested: `catalog.get(record.buildId)` is `undefined`, so
  // the record's own `kind` is the only fact left about it. A `BodyCatalog` is a port (ADR 0062),
  // so a record naming a row the catalogue no longer holds is reachable rather than hypothetical.
  const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

  function firstRecord() {
    const record = world.records[0];
    if (record === undefined) throw new Error("seeded world places nothing");
    return record;
  }

  it("names a record the catalogue no longer holds by its own kind", () => {
    const record = firstRecord();

    expect(
      describeRecordLabel(world.catalog, {
        ...record,
        buildId: "qa-withdrawn-row",
      }),
    ).toEqual(kindLabel(record.kind));
  });

  it("publishes the kind even when the catalogue cannot name it, never the build id", () => {
    // §11 row 24 is the resolver's job, not the domain's: the domain publishes `bodyKind` for any
    // kind, known or not, and the app renders `catalog.unknownKind`. What must never happen is the
    // *build id* leaking into the descriptor as a name.
    const label = describeRecordLabel(world.catalog, {
      ...firstRecord(),
      buildId: "qa-withdrawn-row",
      kind: "qa_unheard_of_kind",
    });

    expect(label).toEqual(kindLabel("qa_unheard_of_kind"));
    expect(isKnownKind("qa_unheard_of_kind")).toBe(false);
  });

  it("still names a record the catalogue does hold by its catalogue identity", () => {
    // The anti-vacuity half: the two assertions above would also pass against a function that
    // always returned the kind.
    const record = firstRecord();
    const definition = world.catalog.get(record.buildId);
    if (definition === undefined) throw new Error("seeded record has no entry");

    expect(describeRecordLabel(world.catalog, record)).toEqual(
      describeBodyName({ buildId: record.buildId, definition }),
    );
  });
});
