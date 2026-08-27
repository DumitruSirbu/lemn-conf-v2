import { describe, expect, it } from "vitest";

import {
  describeKindLabel,
  INSERTABLE_BODY_DEFINITIONS,
  isKnownKind,
  listInsertableBodies,
  toInsertableBody,
} from "../src/catalog.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_PLACEMENTS,
} from "../src/fixtures/kitchen-l-design.js";
import type { BodyDefinition } from "../src/void-engine.js";

const SEEDED_BUILD_IDS = [
  ...new Set(KITCHEN_L_PLACEMENTS.map((placement) => placement.body.buildId)),
];

describe("the one catalogue, two populations (ADR 0011 Gap A)", () => {
  it("carries every §7 entry as insertable", () => {
    expect(listInsertableBodies(KITCHEN_L_BODY_CATALOG)).toHaveLength(
      INSERTABLE_BODY_DEFINITIONS.length,
    );
  });

  it("marks every seeded entry not insertable, without losing it from the lookup", () => {
    for (const buildId of SEEDED_BUILD_IDS) {
      const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
      expect(definition, buildId).toBeDefined();
      expect(definition?.insertable, buildId).toBe(false);
    }
  });

  it("adds no id that collides with a seeded one", () => {
    for (const [buildId] of INSERTABLE_BODY_DEFINITIONS) {
      expect(SEEDED_BUILD_IDS, buildId).not.toContain(buildId);
    }
  });

  it("gives every insertable entry the fields §5.2 reads", () => {
    for (const [buildId, definition] of INSERTABLE_BODY_DEFINITIONS) {
      const body = toInsertableBody(buildId, definition);
      expect(body, buildId).toBeDefined();
      expect(body?.label.length, buildId).toBeGreaterThan(0);
      expect(body?.sizesMm.length, buildId).toBeGreaterThan(0);
      expect(body?.nominalHeightMm, buildId).toBeGreaterThan(0);
    }
  });
});

describe("toInsertableBody", () => {
  it("refuses a seeded entry rather than throwing", () => {
    const seeded = KITCHEN_L_BODY_CATALOG.get("base-sink-800");
    expect(seeded).toBeDefined();
    expect(seeded && toInsertableBody("base-sink-800", seeded)).toBeUndefined();
  });

  it("refuses an entry that claims insertable but carries no catalogue fields", () => {
    const half: BodyDefinition = {
      kind: "base_cabinet",
      band: "base",
      frameDepthMm: 580,
      canFinish: true,
      canHandle: true,
      canReplace: true,
      canDelete: true,
      fixedWidth: false,
      insertable: true,
    };
    expect(toInsertableBody("half-declared", half)).toBeUndefined();
  });
});

describe("kind labels", () => {
  it("names every kind the seeded and insertable populations use", () => {
    for (const [, definition] of KITCHEN_L_BODY_CATALOG) {
      expect(isKnownKind(definition.kind), definition.kind).toBe(true);
    }
  });

  // §11 row 24: a fallback set once produced six guaranteed-refused rows for the hob.
  it("reports an unknown kind as unknown", () => {
    expect(isKnownKind("teleporter")).toBe(false);
    expect(describeKindLabel("teleporter").length).toBeGreaterThan(0);
  });
});

// Backlog entry 1's rule half. The defect was that §7 had **no** hob-bearing entry at all, so a
// deleted hob could never be offered back; the outcome half — that one actually goes into the
// vacated opening and is built with a hob on it — is `hob-base.test.ts` in `@lemnaria/three-adapter`,
// where the real builders and the real probe are.
describe("ADR 0027's hob-bearing bases", () => {
  const HOB_ENTRIES = [
    ["base-hob-2drawer", "Corp plită și 2 sertare"],
    ["base-hob-oven", "Corp plită și cuptor"],
  ] as const;

  it.each(HOB_ENTRIES)(
    "%s is an insertable 600 mm base carrying its Romanian label",
    (buildId, label) => {
      const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
      expect(definition, buildId).toBeDefined();
      if (!definition) return;
      const body = toInsertableBody(buildId, definition);
      expect(body, buildId).toBeDefined();
      expect(body?.label).toBe(label);
      expect(body?.band).toBe("base");
      expect(body?.kind).toBe("base_cabinet");
      expect(body?.nominalHeightMm).toBe(860);
      // Fixed at 600 in both directions: the chips §9 offers and the widths §5.2 will build.
      expect(body?.sizesMm).toEqual([600]);
      expect(body?.widthFlex).toEqual([600]);
      expect(definition.fixedWidth).toBe(true);
    },
  );

  it("gives the two entries different labels, so the picker can tell them apart", () => {
    const [twoDrawer, oven] = HOB_ENTRIES;
    expect(twoDrawer[1]).not.toBe(oven[1]);
  });
});
