// Adversarial QA for M6 wave 6A4 / ADR 0066 — **the two wall corner returns get their own kinds**.
//
// The wave's own test (`tests/fixtures/wall-corner-return-kinds.test.ts`) asserts the criteria as
// the milestone words them. This file attacks them instead: it re-derives each one from a surface
// the wave does not touch, states the anti-invariant the defect actually violated rather than the
// two rows it violated it on, and proves the silent-failure mode bites by constructing it.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  describeBandLabel,
  isBandAccepted,
  normaliseBand,
} from "../src/bands.js";
import {
  WALL_CABINET_KIND,
  WALL_CORNER_RETURN_KIND,
  WALL_CORNER_RETURN_TOP_KIND,
} from "../src/body-kinds.js";
import { carriesHandles } from "../src/cabinet-handles.js";
import {
  describeBodyLabelAt,
  describeKindLabel,
  isKnownKind,
  resolveCatalogEquivalent,
  UNKNOWN_KIND_LABEL_RO,
} from "../src/catalog.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../src/queries/describe-selection.js";
import { projectDesignForDisplay } from "../src/queries/design-projection.js";
import { offersFor } from "../src/queries/offers.js";
import type { BodyCatalog, BodyDefinition } from "../src/void-engine.js";
import { insertInto, resizeTo } from "./support/commands.js";
import { createWorld, type KitchenWorld } from "./support/kitchen-world.js";

const WALL_RETURN_ID = "p9";
const TOP_RETURN_ID = "p21";
const RETURN_IDS = [WALL_RETURN_ID, TOP_RETURN_ID] as const;

const WALL_RETURN_BUILD_ID = "wall-corner-return-570";
const TOP_RETURN_BUILD_ID = "wall-corner-return-570-top";

const seeded = (): KitchenWorld =>
  createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function definitionOf(
  buildId: string,
  catalog: BodyCatalog = KITCHEN_L_BODY_CATALOG,
): BodyDefinition {
  const definition = catalog.get(buildId);
  if (!definition) throw new Error(`fixture has no entry "${buildId}"`);
  return definition;
}

function metaFor(world: KitchenWorld, placementId: string) {
  return describeSelection({
    records: world.records,
    voids: world.voids,
    catalog: world.catalog,
    target: { kind: "placement", id: placementId },
  });
}

/** The breakdown line, as wave 6D will build it: `describeBodyLabelAt` at the placement's width and
 *  nothing else — no band, no height, no wall. Written out here rather than imported from the
 *  projection so this file's assertions do not move if `labelOf` changes shape. */
function breakdownLineFor(placementId: string): string {
  const placement = KITCHEN_L_DESIGN.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`fixture has no placement "${placementId}"`);
  return describeBodyLabelAt(
    definitionOf(placement.body.buildId),
    placement.body.widthMm,
  );
}

/** The catalogue row a price rule would resolve through: the declared equivalent (ADR 0022) when
 *  there is one, and otherwise the body's own id. Two placements that resolve *different* rows can
 *  be quoted at different amounts, so two of them sharing a breakdown line is the defect. */
function priceIdentityOf(buildId: string): string {
  return (
    resolveCatalogEquivalent(KITCHEN_L_BODY_CATALOG, buildId)?.buildId ??
    buildId
  );
}

describe("6A4 — the defect at the surface that reported it", () => {
  it("states the anti-invariant, not the two rows: no breakdown line covers two priceable bodies", () => {
    // **The general form of the reported defect.** ADR 0066's complaint was not "these two rows
    // have the same name" but "one description, two amounts". A placement is quotable at its own
    // amount when it resolves a catalogue row of its own, so the invariant is: group every seeded
    // placement by the exact string 6D would print — label and width — and no group may straddle
    // two price identities.
    //
    // This fails on the pre-6A4 tree (`Corp suspendat|570` held both returns, and each resolves
    // its own row because neither declares a `catalogEquivalentId`) and it is stated over the whole
    // fixture, so the next row that lands in this trap fails here rather than in a customer's PDF.
    const straddling = new Map<string, readonly string[]>();
    for (const placement of KITCHEN_L_DESIGN.placements) {
      const line = `${breakdownLineFor(placement.id)}|${String(placement.body.widthMm)}`;
      straddling.set(line, [
        ...(straddling.get(line) ?? []),
        priceIdentityOf(placement.body.buildId),
      ]);
    }

    const offenders = [...straddling.entries()]
      .filter(([, identities]) => new Set(identities).size > 1)
      .map(
        ([line, identities]) =>
          `${line} → ${[...new Set(identities)].join(", ")}`,
      );

    expect(offenders).toEqual([]);
  });

  it("gives the two returns different lines, and lines nothing else in the kitchen shares", () => {
    const wallLine = breakdownLineFor(WALL_RETURN_ID);
    const topLine = breakdownLineFor(TOP_RETURN_ID);

    expect(wallLine).not.toEqual(topLine);
    // Not merely different from each other: a name that collides with the twelve `wall_cabinet`
    // bodies would move the ambiguity rather than remove it.
    const otherLines = KITCHEN_L_DESIGN.placements
      .filter(
        (placement) =>
          !(RETURN_IDS as readonly string[]).includes(placement.id),
      )
      .map((placement) => breakdownLineFor(placement.id));
    expect(otherLines).not.toContain(wallLine);
    expect(otherLines).not.toContain(topLine);
  });

  it("agrees across the breakdown, the projection and the panel header", () => {
    // Three surfaces, three call sites (`design-projection.ts:135`, `describe-selection.ts:177`,
    // and 6D's line). A new kind that named a body one way in the document and another in the
    // panel would be a worse defect than the one being fixed.
    const world = seeded();
    const projected = projectDesignForDisplay(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    ).flatMap((group) => group.entries);

    for (const placementId of RETURN_IDS) {
      const line = breakdownLineFor(placementId);
      const entry = projected.find(
        (candidate) => candidate.placementId === placementId,
      );
      expect([placementId, entry?.label]).toEqual([placementId, line]);
      expect([placementId, metaFor(world, placementId)?.label]).toEqual([
        placementId,
        line,
      ]);
    }
  });

  it("offers nothing into either return, and does so because it is structural, not because of its kind", () => {
    // **A correction to the wave's stated risk.** ADR 0066 and `body-kinds.ts` justify declaring the
    // two kinds as constants by §11 row 24 — "a typo would silently remove a corner's swap list".
    // These two corners have no swap list to remove at any spelling: `describeReplaceSection`
    // (`apps/web/src/panel/panel-model.ts`) returns `undefined` at `!meta.canReplace`, *before* it
    // reaches `isKnownKind`, and `resolveInsertOpening` refuses a non-replaceable placement so
    // `offersFor` returns `[]` regardless. The constants are still worth having — the real cost of a
    // typo is the name, which the next describe block constructs — but the offer list is not the
    // surface that would show it, and a test asserting an empty list under a typo is vacuous.
    const world = seeded();
    for (const placementId of RETURN_IDS)
      expect([
        placementId,
        offersFor({
          records: world.records,
          voids: world.voids,
          columns: world.columns,
          catalog: world.catalog,
          cabinetDepthMm: world.cabinetDepthMm,
          target: { kind: "placement", id: placementId },
        }),
      ]).toEqual([placementId, []]);

    // Not the trivial answer: the same query on a replaceable wall cabinet in the same band returns
    // rows, one of them badged ACTUAL.
    const wallCabinetRows = offersFor({
      records: world.records,
      voids: world.voids,
      columns: world.columns,
      catalog: world.catalog,
      cabinetDepthMm: world.cabinetDepthMm,
      target: { kind: "placement", id: "p8" },
    });
    expect(wallCabinetRows.length).toBeGreaterThan(0);
    expect(wallCabinetRows.filter((row) => row.isCurrent).length).toBe(1);
  });
});

describe("6A4 — the composed label and its coupling to the band table", () => {
  it("pins both names as literals, so a reword of BAND_LABELS_RO.top is a visible change", () => {
    // The wave's own test asserts the top return's name equals
    // `` `Dulap de colț ${describeBandLabel("top")}` `` — which is the expression under test
    // restated, so it holds for *any* value of `BAND_LABELS_RO.top` and cannot catch a reword.
    // The owner ruled on the two strings (2026-09-03) and they reach a priced document, so the
    // literals are pinned here. Single-sourcing the composition is still the right call: this
    // assertion makes the coupling loud instead of silent.
    expect([
      describeKindLabel(WALL_CORNER_RETURN_KIND),
      describeKindLabel(WALL_CORNER_RETURN_TOP_KIND),
    ]).toEqual(["Dulap suspendat de colț", "Dulap de colț rând de sus"]);
  });

  it("keeps the composed name agreeing with the header that names the same row", () => {
    // The reason for the coupling: §9's header renders `describeBandLabel(record.band)` for this
    // body's row, and a name that says which row a body stands on is wrong the moment the two
    // spellings drift. Asserted through the panel meta rather than through the constant.
    const meta = metaFor(seeded(), TOP_RETURN_ID);
    expect(meta?.bandLabel).toBe(describeBandLabel("top"));
    expect(meta?.label).toContain(describeBandLabel("top"));
  });

  it("keeps the two names free of the generic wall label they were confused with", () => {
    const wallCabinetLabel = describeKindLabel(WALL_CABINET_KIND);
    for (const kind of [WALL_CORNER_RETURN_KIND, WALL_CORNER_RETURN_TOP_KIND]) {
      expect(describeKindLabel(kind)).not.toBe(wallCabinetLabel);
      expect(describeKindLabel(kind)).not.toBe(UNKNOWN_KIND_LABEL_RO);
    }
  });
});

describe("6A4 — the silent failure a typo would cause, constructed", () => {
  /** The seeded catalogue with one row's `kind` misspelt: the exact shape of the mistake the two
   *  exported constants exist to prevent. Nothing else about the fixture changes. */
  function catalogWithMisspeltKind(buildId: string, kind: string): BodyCatalog {
    const mutated = new Map(KITCHEN_L_BODY_CATALOG);
    mutated.set(buildId, { ...definitionOf(buildId), kind });
    return mutated;
  }

  it.each([
    {
      buildId: WALL_RETURN_BUILD_ID,
      id: WALL_RETURN_ID,
      typo: "corner_wall_retrun",
    },
    {
      buildId: TOP_RETURN_BUILD_ID,
      id: TOP_RETURN_ID,
      typo: "corner_wall_return_topp",
    },
  ])(
    "reintroduces the reported defect on $id when its kind is misspelt $typo",
    ({ buildId, id, typo }) => {
      // What a typo actually costs, since it is not the swap list: the body is unknown, so both the
      // panel header and the breakdown line fall back to "Corp" — the original defect, one word
      // shorter, and with no error raised anywhere.
      expect(isKnownKind(typo)).toBe(false);

      const broken = createWorld(
        KITCHEN_L_DESIGN,
        catalogWithMisspeltKind(buildId, typo),
      );
      expect(metaFor(broken, id)?.label).toBe(UNKNOWN_KIND_LABEL_RO);
      expect(
        describeBodyLabelAt(
          definitionOf(buildId, catalogWithMisspeltKind(buildId, typo)),
          570,
        ),
      ).toBe(UNKNOWN_KIND_LABEL_RO);

      // And the correctly spelt tree does not, so the assertion above is about the typo.
      expect(metaFor(seeded(), id)?.label).not.toBe(UNKNOWN_KIND_LABEL_RO);
    },
  );

  it("bites: the same sweep the wave runs fails on a misspelt kind", () => {
    // The wave's sweep asserts `isKnownKind` over every seeded body. Run its predicate against the
    // mutated catalogue to show it is not vacuous — a green sweep over an unmutated fixture proves
    // only that the fixture is currently right.
    const broken = catalogWithMisspeltKind(
      WALL_RETURN_BUILD_ID,
      "corner_wall_retrun",
    );
    const unknown = KITCHEN_L_DESIGN.placements
      .filter(
        (placement) =>
          !isKnownKind(definitionOf(placement.body.buildId, broken).kind),
      )
      .map((placement) => placement.id);
    expect(unknown).toEqual([WALL_RETURN_ID]);

    // And the unmutated fixture, so the two halves are one statement.
    const named = KITCHEN_L_DESIGN.placements
      .filter(
        (placement) => !isKnownKind(definitionOf(placement.body.buildId).kind),
      )
      .map((placement) => placement.id);
    expect(named).toEqual([]);
  });
});

describe("6A4 — what a new kind must not have changed", () => {
  it("still folds both returns into the wall band, gate included", () => {
    // ADR 0011 Gap C, re-derived from the raw bands rather than from the projection: the wall
    // return declares `wall` and the top return declares `top`, and §5.2's gate sees `wall` for
    // both — so both are accepted into a wall slot and refused from a base one, exactly as before.
    expect([
      definitionOf(WALL_RETURN_BUILD_ID).band,
      definitionOf(TOP_RETURN_BUILD_ID).band,
    ]).toEqual(["wall", "top"]);

    for (const buildId of [WALL_RETURN_BUILD_ID, TOP_RETURN_BUILD_ID]) {
      const band = normaliseBand(definitionOf(buildId).band);
      expect([buildId, band]).toEqual([buildId, "wall"]);
      expect([
        buildId,
        isBandAccepted(band, "wall"),
        isBandAccepted(band, "base"),
      ]).toEqual([buildId, true, false]);
    }
  });

  it("keeps both returns in one group with the wall cabinets on their wall", () => {
    // §5.2's gate does not move only if the *group* does not: both returns stand on wall B and must
    // share a group with the top-row cabinets there, not sit in a `top` group of their own.
    const groups = projectDesignForDisplay(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const holding = groups.filter((group) =>
      group.entries.some((entry) =>
        (RETURN_IDS as readonly string[]).includes(entry.placementId),
      ),
    );
    expect(holding.length).toBe(1);
    expect([holding[0]?.wall, holding[0]?.band]).toEqual(["B", "wall"]);
    // The group is shared, not a private one the two returns were quietly moved into.
    expect(holding[0]?.entries.length).toBeGreaterThan(RETURN_IDS.length);
  });

  it("refuses a resize on either return — structural is a capability, not a name", () => {
    // ADR 0021 / §13.1, asserted through the command rather than through the panel meta the wave's
    // test reads: `canReplace: false` in a projection means nothing if `setWidth` still fires.
    const world = seeded();
    for (const placementId of RETURN_IDS) {
      const grown = resizeTo(world, placementId, 600);
      const shrunk = resizeTo(world, placementId, 500);
      expect([placementId, grown.ok, shrunk.ok]).toEqual([
        placementId,
        false,
        false,
      ]);
    }
  });

  it("refuses a swap into either return", () => {
    const world = seeded();
    for (const placementId of RETURN_IDS) {
      const result = insertInto(
        world,
        { kind: "placement", id: placementId },
        "open-shelf",
      );
      expect([placementId, result.ok]).toEqual([placementId, false]);
    }
  });

  it("keeps both returns non-replaceable, non-deletable and one-handled", () => {
    const world = seeded();
    for (const placementId of RETURN_IDS) {
      const meta = metaFor(world, placementId);
      expect([
        placementId,
        meta?.canReplace,
        meta?.canDelete,
        meta?.fixedWidth,
      ]).toEqual([placementId, false, false, true]);
      expect(typeof meta?.structuralReason).toBe("string");
    }
    for (const buildId of [WALL_RETURN_BUILD_ID, TOP_RETURN_BUILD_ID]) {
      expect([buildId, definitionOf(buildId).cabinetHandles]).toEqual([
        buildId,
        carriesHandles(1),
      ]);
    }
  });

  it("names neither return by a catalogue equivalent, at any width", () => {
    // A `catalogEquivalentId` would hand both bodies `wall-cabinet`'s width set, its ACTUAL badge
    // and its `doorCountFollowsWidth`, and 570 is over the two-door threshold — so both would read
    // "Corp suspendat 2 uși" and the defect would come back wearing a door count.
    for (const buildId of [WALL_RETURN_BUILD_ID, TOP_RETURN_BUILD_ID]) {
      expect([buildId, priceIdentityOf(buildId)]).toEqual([buildId, buildId]);
      expect(definitionOf(buildId).doorCountFollowsWidth).toBeUndefined();
      expect(definitionOf(buildId).label).toBeUndefined();
    }
  });
});

describe("6A4 — the names hold across widths", () => {
  propertyTest.prop([fc.integer({ min: 1, max: 3000 })])(
    "reads the same two distinct names at every width a line could carry",
    (widthMm) => {
      // Neither return declares `doorCountFollowsWidth`, so its name must be width-invariant — and
      // the two must stay distinct across the whole range, not only at the seeded 570. A door count
      // appearing at some widths would make one return's line collide with a wall cabinet's.
      const wallLine = describeBodyLabelAt(
        definitionOf(WALL_RETURN_BUILD_ID),
        widthMm,
      );
      const topLine = describeBodyLabelAt(
        definitionOf(TOP_RETURN_BUILD_ID),
        widthMm,
      );

      expect(wallLine).toBe(describeKindLabel(WALL_CORNER_RETURN_KIND));
      expect(topLine).toBe(describeKindLabel(WALL_CORNER_RETURN_TOP_KIND));
      expect(wallLine).not.toBe(topLine);
    },
  );

  propertyTest.prop([fc.integer({ min: 1, max: 3000 })])(
    "never collides with a wall cabinet's name at the same width",
    (widthMm) => {
      // `wall-cabinet` *does* follow its width, so its name changes under the sweep while the
      // returns' do not. The one thing that must hold at every width is that they differ.
      const wallCabinet = describeBodyLabelAt(
        definitionOf("wall-cabinet"),
        widthMm,
      );
      for (const buildId of [WALL_RETURN_BUILD_ID, TOP_RETURN_BUILD_ID])
        expect(describeBodyLabelAt(definitionOf(buildId), widthMm)).not.toBe(
          wallCabinet,
        );
    },
  );
});
