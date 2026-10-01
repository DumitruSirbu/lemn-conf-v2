// **The gate that makes ADR 0061's declared handle count a fact rather than a claim.**
//
// The domain declares how many of a body's handles are the cabinet's
// (`BodyDefinition.cabinetHandles`), and it has to: pricing is a pure domain query, the domain has
// no meshes, and the rule that tells a cabinet's handle from an appliance's inspects geometry
// (ADR 0061 decision 3). A declaration nothing checks is exactly the defect DOM-002 was — the
// catch-all `return record.frame.d` was also a declaration, it was just wrong for four body families
// and nothing looked. This file looks, for every insertable and every seeded body, against the real
// builders and the rule the renderer itself applies.
//
// ADR 0028's remedy for two numbers agreeing by luck, applied to the pair wave 6L creates, the way
// `cabinet-depth-source.test.ts` and `occupied-depth.parity.test.ts` apply it to theirs.
//
// Scope is `KITCHEN_L_BODY_CATALOG`, **both** of its populations (ADR 0011 Gap A), and for an
// insertable row **every width it declares**: `wall-cabinet` draws one handle at 400 mm and two at
// 600, so a gate that measured one width would be checking a constant rather than the rule.
import {
  cabinetHandleCount,
  KITCHEN_L_BODY_CATALOG,
  UndeclaredCabinetHandleCountError,
  type BodyDefinition,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { countBuiltCabinetHandles } from "../src/cabinet-handle-meshes.js";
import {
  buildCatalogBody,
  CATALOG_BUILD_IDS,
  isCatalogBuildId,
} from "../src/catalog-bodies.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** M2's seeded instances: every entry of the one map that is not §7-insertable. Derived rather than
 *  listed, so a seeded entry added tomorrow is gated the day it lands. */
const SEEDED_BUILD_IDS: readonly string[] = [...KITCHEN_L_BODY_CATALOG]
  .filter(([, definition]) => definition.insertable !== true)
  .map(([buildId]) => buildId);

/** Every id in the map, and the width each is measured at. A seeded row has one already-built body
 *  and therefore one width — the width its own placement carries — while an insertable row is
 *  measured at each of its declared `sizesMm`. */
interface GatedBody {
  readonly buildId: string;
  readonly widthMm: number;
}

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for "${buildId}"`);
  return definition;
}

function buildBodyOf(buildId: string, widthMm: number): THREE.Group {
  const definition = definitionOf(buildId);
  if (!isCatalogBuildId(buildId)) return buildDecomposedBody(kit, buildId);
  return buildCatalogBody(kit, buildId, {
    widthM: widthMm / 1000,
    heightM: (definition.nominalHeightMm ?? 0) / 1000,
    depthM: (definition.nominalDepthMm ?? 0) / 1000,
  });
}

/** The width a seeded row is measured at, and it is deliberately not a real one: a seeded row has
 *  one already-built body (ADR 0011 Gap A), so there is no width for a count to follow, and every
 *  one of them declares a `declared-count` rule that ignores the argument. The test below pins that
 *  premise rather than trusting it — a seeded row that took a per-door rule would silently resolve
 *  against a one-door 0 mm cabinet here. */
const SEEDED_WIDTH_IS_UNUSED_MM = 0;

const GATED_BODIES: readonly GatedBody[] = [
  ...CATALOG_BUILD_IDS.flatMap((buildId) =>
    (definitionOf(buildId).sizesMm ?? []).map((widthMm) => ({
      buildId,
      widthMm,
    })),
  ),
  ...SEEDED_BUILD_IDS.map((buildId) => ({
    buildId,
    widthMm: SEEDED_WIDTH_IS_UNUSED_MM,
  })),
];

function declaredHandlesOf({ buildId, widthMm }: GatedBody): number {
  return cabinetHandleCount({
    buildId,
    rule: definitionOf(buildId).cabinetHandles,
    widthMm,
  });
}

function handleBarCountOf(built: THREE.Object3D): number {
  let bars = 0;
  built.traverse((node) => {
    if (isMesh(node) && node.name.includes("handle_bar")) bars += 1;
  });
  return bars;
}

describe("every catalogue entry's declared cabinet-handle count matches what its builder draws", () => {
  it("gates both populations of the one map, at every width an insertable row declares", () => {
    expect(CATALOG_BUILD_IDS.length).toBe(16);
    // 22 → 24 (M7C wave C2): the corner wall unit's two rows.
    expect(SEEDED_BUILD_IDS.length).toBe(24);

    const gatedIds = new Set(GATED_BODIES.map(({ buildId }) => buildId));
    expect([...gatedIds].sort()).toEqual(
      [...CATALOG_BUILD_IDS, ...SEEDED_BUILD_IDS].sort(),
    );
    // The sweep is over widths, not over rows: 16 insertable rows produce many more than 16 cases.
    expect(GATED_BODIES.length).toBeGreaterThan(gatedIds.size);
  });

  it("measures every seeded row against a rule that does not depend on a width", () => {
    for (const buildId of SEEDED_BUILD_IDS) {
      expect([
        buildId,
        definitionOf(buildId).cabinetHandles?.countedFrom,
      ]).toEqual([buildId, "declared-count"]);
    }
  });

  it.each(
    GATED_BODIES.map(
      (body) => [`${body.buildId}@${String(body.widthMm)}`, body] as const,
    ),
  )(
    "%s: declares the cabinet handles its builder actually draws",
    (label, body) => {
      const built = buildBodyOf(body.buildId, body.widthMm);

      expect([label, declaredHandlesOf(body)]).toEqual([
        label,
        countBuiltCabinetHandles(built),
      ]);
    },
  );

  // The gate's own premise, and the reason it is not a `handle_bar` count wearing another name: on
  // the three bodies that carry an appliance's bar the two numbers differ, and the declaration
  // follows the cabinet's.
  it("differs from a bare handle-bar count exactly where an appliance carries one", () => {
    const appliancesWithBars = [
      { buildId: "tall-oven-tower", widthMm: 600, bars: 4, cabinetHandles: 2 },
      { buildId: "base-hob-oven", widthMm: 600, bars: 1, cabinetHandles: 0 },
      { buildId: "fridge-free", widthMm: 700, bars: 2, cabinetHandles: 0 },
    ];

    for (const body of appliancesWithBars) {
      const built = buildBodyOf(body.buildId, body.widthMm);

      expect([body.buildId, handleBarCountOf(built)]).toEqual([
        body.buildId,
        body.bars,
      ]);
      expect([body.buildId, declaredHandlesOf(body)]).toEqual([
        body.buildId,
        body.cabinetHandles,
      ]);
    }
  });

  // ADR 0061 decision 4, from the side a required field cannot reach: `BodyCatalog` is a port, and a
  // definition assembled outside TypeScript can arrive with no rule at all. It must fail loudly
  // rather than fall back to the mesh count — which would bill an appliance's bars — or to zero.
  it("refuses an entry that declares no count rather than counting its meshes", () => {
    // Built by *removing* the key rather than by setting it to `undefined`: an entry arriving
    // through the `BodyCatalog` port with no rule at all is the case, and the two are not the same
    // object under `exactOptionalPropertyTypes`.
    const { cabinetHandles, ...undeclared } = definitionOf("tall-oven-tower");
    expect(cabinetHandles).toBeDefined();
    // The two numbers a silent default would have reached for, both wrong and both plausible.
    expect(countBuiltCabinetHandles(buildBodyOf("tall-oven-tower", 600))).toBe(
      2,
    );
    expect(handleBarCountOf(buildBodyOf("tall-oven-tower", 600))).toBe(4);

    expect(() =>
      cabinetHandleCount({
        buildId: "tall-oven-tower",
        rule: (undeclared as BodyDefinition).cabinetHandles,
        widthMm: 600,
      }),
    ).toThrow(UndeclaredCabinetHandleCountError);
    expect(() =>
      cabinetHandleCount({
        buildId: "tall-oven-tower",
        rule: (undeclared as BodyDefinition).cabinetHandles,
        widthMm: 600,
      }),
    ).toThrow(/tall-oven-tower/);
  });
});
