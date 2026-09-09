// M6 wave 6A4 / ADR 0066: **the two wall corner returns get their own kinds and names, one per row.**
//
// Before this, `wall-corner-return-570` (570 × 700) and `wall-corner-return-570-top` (570 × 400)
// both declared `kind: "wall_cabinet"` and carried no `label` and no `catalogEquivalentId` — the
// last correctly, since a corner return has no catalogue equivalent (ADR 0022) — so both fell back
// to `describeKindLabel` and read exactly *"Corp suspendat"*. Wave 6D puts that in a priced
// document: two identical descriptions at two different amounts.
//
// One shared kind would not have fixed it, and that is what these tests pin. The breakdown line
// renders `describeBodyLabelAt` alone — label and width, no band and no height — so the two lines
// only separate if the two bodies are named differently.
import { describe, expect, it } from "vitest";

import { describeBandLabel, normaliseBand } from "../../src/bands.js";
import { carriesHandles } from "../../src/cabinet-handles.js";
import {
  WALL_CORNER_RETURN_KIND,
  WALL_CORNER_RETURN_TOP_KIND,
} from "../../src/body-kinds.js";
import {
  describeBodyLabelAt,
  describeKindLabel,
  isKnownKind,
  UNKNOWN_KIND_LABEL_RO,
} from "../../src/catalog.js";
import { describeRecordLabel } from "../../src/commands/resolve-column-members.js";
import { setWidth } from "../../src/commands/set-width.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { OCCURRED_AT } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
import type { BodyDefinition } from "../../src/void-engine.js";
import { createWorld, type KitchenWorld } from "../support/kitchen-world.js";

const WALL_RETURN_BUILD_ID = "wall-corner-return-570";
const TOP_RETURN_BUILD_ID = "wall-corner-return-570-top";

/** The two returns' placements, and the widths a breakdown line would render them at. */
const RETURN_PLACEMENT_IDS = ["p9", "p21"] as const;
const RETURN_WIDTH_MM = 570;

const seeded = (): KitchenWorld =>
  createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`fixture has no entry "${buildId}"`);
  return definition;
}

function kindOf(world: KitchenWorld, placementId: string): string {
  const record = world.records.find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`fixture places no "${placementId}"`);
  return record.kind;
}

function metaFor(world: KitchenWorld, placementId: string) {
  return describeSelection({
    records: world.records,
    voids: world.voids,
    catalog: world.catalog,
    target: { kind: "placement", id: placementId },
  });
}

describe("the wall corner returns are named, one kind per row (ADR 0066)", () => {
  it("gives each return its own kind, and still no catalogue equivalent", () => {
    // ADR 0066 rejects a `catalogEquivalentId` explicitly: it would hand both bodies
    // `wall-cabinet`'s width set and its swap badge, and both would read "Corp suspendat 2 uși" —
    // 570 is over the two-door threshold, so the shortcut is *more* wrong, not less.
    expect([
      definitionOf(WALL_RETURN_BUILD_ID).kind,
      definitionOf(TOP_RETURN_BUILD_ID).kind,
    ]).toEqual([WALL_CORNER_RETURN_KIND, WALL_CORNER_RETURN_TOP_KIND]);

    for (const buildId of [WALL_RETURN_BUILD_ID, TOP_RETURN_BUILD_ID]) {
      const definition = definitionOf(buildId);
      expect([
        buildId,
        definition.catalogEquivalentId,
        definition.label,
        definition.doorCountFollowsWidth,
      ]).toEqual([buildId, undefined, undefined, undefined]);
    }
  });

  it("renders two different breakdown lines from the label and width alone", () => {
    // **The defect, stated as the surface it was reported on.** No band, no height — only what
    // `describeBodyLabelAt` returns at the width, which is what 6D's line carries.
    const wallLine = describeBodyLabelAt(
      definitionOf(WALL_RETURN_BUILD_ID),
      RETURN_WIDTH_MM,
    );
    const topLine = describeBodyLabelAt(
      definitionOf(TOP_RETURN_BUILD_ID),
      RETURN_WIDTH_MM,
    );

    expect(wallLine).not.toEqual(topLine);
    expect([wallLine, topLine]).not.toContain(UNKNOWN_KIND_LABEL_RO);
    for (const line of [wallLine, topLine]) expect(line.trim()).toBe(line);
  });

  it("reads the two names the owner ruled on", () => {
    // Owner, 2026-09-03. Pinned because this is product copy in a priced document and a silent
    // rewording is exactly the change nothing else here would catch — the tests above only ask that
    // the two differ. The top return's row word is composed from `describeBandLabel` rather than
    // spelled out, so this assertion cannot drift from §9's header for that row.
    expect([
      describeKindLabel(WALL_CORNER_RETURN_KIND),
      describeKindLabel(WALL_CORNER_RETURN_TOP_KIND),
    ]).toEqual([
      "Dulap suspendat de colț",
      `Dulap de colț ${describeBandLabel("top")}`,
    ]);
  });

  it("names both returns in the kind table, so neither falls through to the unknown label", () => {
    // A kind missing from `KIND_LABELS_RO` is *unknown*, and an unknown kind reads "Corp" — so a
    // typo in either new kind puts both returns back to one shared description, in the panel header
    // and in 6D's priced document. That, and not a lost swap list, is what this test protects: both
    // returns are structural, so §11 row 24 renders no replace section for them at any spelling
    // (ADR 0066 correction 2026-09-03). Re-asserted over every seeded body rather than inherited
    // from wave 6A2, because this wave changes two kinds.
    const world = seeded();

    for (const placement of KITCHEN_L_DESIGN.placements) {
      const kind = definitionOf(placement.body.buildId).kind;
      expect([placement.id, isKnownKind(kind)]).toEqual([placement.id, true]);
      expect([placement.id, metaFor(world, placement.id)?.label]).not.toEqual([
        placement.id,
        UNKNOWN_KIND_LABEL_RO,
      ]);
    }
  });

  it("never puts a raw kind identifier in a refusal the customer reads", () => {
    // The four corner rows carry no `label` and no catalogue equivalent to inherit one from
    // (ADR 0022), so they are the bodies `describeRecordLabel`'s fallback is reached for — and it
    // returned the bare `kind`, which the refusal then quoted into a Romanian sentence:
    // `„corner_wall_return" nu își poate schimba lățimea.` Swept over every seeded body rather than
    // the two this wave renames, because the same fallback names any unlabelled row.
    const world = seeded();
    const identifierShaped = /^[a-z0-9_]+$/;

    for (const record of world.records) {
      const label = describeRecordLabel(world.catalog, record);
      expect([record.id, identifierShaped.test(label)]).toEqual([
        record.id,
        false,
      ]);
      expect(label).not.toBe(record.kind);
    }
  });

  it("refuses a resize of either return by name, not by identifier", () => {
    // The sentence itself, end to end through the command, for the two bodies the report named.
    const world = seeded();

    for (const placementId of RETURN_PLACEMENT_IDS) {
      const result = setWidth({
        design: world.design,
        catalog: world.catalog,
        columns: world.columns,
        target: { kind: "placement", id: placementId },
        widthMm: 600,
        probe: createFakeProbe(),
        occurredAt: OCCURRED_AT,
      });

      expect([placementId, result.ok]).toEqual([placementId, false]);
      if (result.ok) continue;

      const kind = kindOf(world, placementId);
      expect(result.reason).toMatchObject({
        code: "NOT_RESIZABLE",
        params: { label: describeKindLabel(kind) },
      });
      expect(result.reason.params).not.toHaveProperty("kind");
    }
  });

  it("keeps both returns in the wall group — a new kind does not re-band a body", () => {
    // ADR 0011 Gap C: `normaliseBand` folds `top` into `wall`, so both returns land in the mockup's
    // *Perete A · suspendate* group and §5.2's gate is untouched. A new kind is exactly the change
    // that quietly re-bands a body, so this is asserted on the projection and not on the fixture.
    expect([
      normaliseBand(definitionOf(WALL_RETURN_BUILD_ID).band),
      normaliseBand(definitionOf(TOP_RETURN_BUILD_ID).band),
    ]).toEqual(["wall", "wall"]);

    const groupsHolding = projectDesignForDisplay(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    ).filter((group) =>
      group.entries.some((entry) =>
        (RETURN_PLACEMENT_IDS as readonly string[]).includes(entry.placementId),
      ),
    );

    expect(groupsHolding.length).toBe(1);
    expect([groupsHolding[0]?.wall, groupsHolding[0]?.band]).toEqual([
      "B",
      "wall",
    ]);
  });

  it("keeps both returns structural, with one handle each — a name is not a capability", () => {
    // ADR 0021.
    const world = seeded();

    for (const placementId of RETURN_PLACEMENT_IDS) {
      const meta = metaFor(world, placementId);
      expect([placementId, meta?.canReplace, meta?.canDelete]).toEqual([
        placementId,
        false,
        false,
      ]);
      expect(meta?.structuralReason).toBeDefined();
    }

    for (const buildId of [WALL_RETURN_BUILD_ID, TOP_RETURN_BUILD_ID])
      expect([buildId, definitionOf(buildId).cabinetHandles]).toEqual([
        buildId,
        carriesHandles(1),
      ]);
  });
});
