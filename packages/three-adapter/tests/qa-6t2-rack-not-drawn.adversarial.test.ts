// **Adversarial QA for wave 6T2's *"priced and never drawn"* criterion, on the axis its own gate
// leaves out.**
//
// The criterion is *"no builder touched, **at any width and any depth**, asserted from the adapter
// side"*. `sink-declaration.parity.test.ts` sweeps every width and builds every body in **one** kit,
// at the default cabinet depth — so the depth half of the criterion is asserted at a single point.
// Depth is a kit-level parameter (`makeKit({ cabinetDepthMm })`) that reshapes carcasses, worktops
// and fronts, so a part that appeared only in a deeper kit would pass that gate.
//
// This file builds every gated body in a kit at **each** declared manufactured depth and asks the
// same two questions: no part named for a rack, and — because a negative is only worth what the
// thing it inspects is worth — the sink base's own parts are the same set at both depths, with the
// sink group present in each.
import {
  declaredCabinetDepthsMm,
  KITCHEN_L_BODY_CATALOG,
  type BodyDefinition,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildCatalogBody,
  CATALOG_BUILD_IDS,
  isCatalogBuildId,
} from "../src/catalog-bodies.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** M2's seeded instances — every entry of the one map that is not §7-insertable. Derived rather
 *  than listed, so a seeded row added tomorrow is swept the day it lands. */
const SEEDED_BUILD_IDS: readonly string[] = [...KITCHEN_L_BODY_CATALOG]
  .filter(([, definition]) => definition.insertable !== true)
  .map(([buildId]) => buildId);

interface SweptBody {
  readonly buildId: string;
  readonly widthMm: number;
}

/** A seeded row is one already-built body (ADR 0011 Gap A), so no width follows anything. */
const SEEDED_WIDTH_IS_UNUSED_MM = 0;

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for "${buildId}"`);
  return definition;
}

const SWEPT_BODIES: readonly SweptBody[] = [
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

/** The manufactured depths ADR 0056 declares, read from the domain rather than typed, so a third
 *  row is swept the day it is declared rather than the day somebody remembers this file. */
const DEPTHS_MM: readonly number[] = declaredCabinetDepthsMm();

const kits = new Map<number, Kit>();

beforeAll(() => {
  installHeadlessDocument();
  for (const cabinetDepthMm of DEPTHS_MM) {
    kits.set(
      cabinetDepthMm,
      makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm }),
    );
  }
});

function kitAt(cabinetDepthMm: number): Kit {
  const kit = kits.get(cabinetDepthMm);
  if (!kit) throw new Error(`no kit at ${String(cabinetDepthMm)} mm`);
  return kit;
}

function buildAt(body: SweptBody, cabinetDepthMm: number): THREE.Group {
  const kit = kitAt(cabinetDepthMm);
  if (!isCatalogBuildId(body.buildId))
    return buildDecomposedBody(kit, body.buildId);

  const definition = definitionOf(body.buildId);
  return buildCatalogBody(kit, body.buildId, {
    widthM: body.widthMm / 1000,
    heightM: (definition.nominalHeightMm ?? 0) / 1000,
    depthM: (definition.nominalDepthMm ?? 0) / 1000,
  });
}

function partNamesOf(built: THREE.Object3D): readonly string[] {
  const names: string[] = [];
  built.traverse((node) => {
    if (node.name !== "") names.push(node.name);
  });
  return names;
}

/** The words a rack would have to carry to be recognisable in the scene at all — the builders' own
 *  convention is a snake-cased English noun, and the Romanian stem is here because the book's own
 *  name for it is *uscător de vase*. */
const RACK_WORD = /rack|drying|drainer|uscator/i;

const SINK_GROUP_NAME = "sink_faucet";

describe("the sweep covers more than one depth, which is the point of it", () => {
  it("builds a kit at every manufactured depth the domain declares", () => {
    expect(DEPTHS_MM.length).toBeGreaterThan(1);
    expect([...kits.keys()].sort()).toEqual([...DEPTHS_MM].sort());
  });

  it("sweeps every id in the one map, at every width an insertable row declares", () => {
    const sweptIds = new Set(SWEPT_BODIES.map(({ buildId }) => buildId));

    expect([...sweptIds].sort()).toEqual(
      [...CATALOG_BUILD_IDS, ...SEEDED_BUILD_IDS].sort(),
    );
    expect(SWEPT_BODIES.length).toBeGreaterThan(sweptIds.size);
  });
});

describe("nothing in the catalogue draws a dish drying rack at any depth", () => {
  it.each(
    DEPTHS_MM.flatMap((cabinetDepthMm) =>
      SWEPT_BODIES.map(
        (body) =>
          [
            `${body.buildId}@${String(body.widthMm)}w/${String(cabinetDepthMm)}d`,
            body,
            cabinetDepthMm,
          ] as const,
      ),
    ),
  )("%s: builds no part named for a rack", (label, body, cabinetDepthMm) => {
    const named = partNamesOf(buildAt(body, cabinetDepthMm)).filter((name) =>
      RACK_WORD.test(name),
    );

    expect([label, named]).toEqual([label, []]);
  });
});

/**
 * **The negative above is worth what the thing it inspects is worth**, so this pins that the sink
 * base is genuinely being built at both depths and that the depth changes nothing about *which*
 * parts it has.
 *
 * A set rather than a list: depth reshapes geometry and may well reorder a traversal, and the claim
 * is about the population of parts, not about their order.
 */
describe("the sink base builds the same parts at every depth", () => {
  const SINK_BODIES = ["base-sink", "base-sink-800"] as const;

  it.each(SINK_BODIES)("%s: draws its sink group at every depth", (buildId) => {
    for (const cabinetDepthMm of DEPTHS_MM) {
      const widthMm =
        definitionOf(buildId).sizesMm?.at(-1) ?? SEEDED_WIDTH_IS_UNUSED_MM;
      const names = partNamesOf(buildAt({ buildId, widthMm }, cabinetDepthMm));

      expect([cabinetDepthMm, names.includes(SINK_GROUP_NAME)]).toEqual([
        cabinetDepthMm,
        true,
      ]);
    }
  });

  it.each(SINK_BODIES)(
    "%s: grows no new part when the depth changes",
    (buildId) => {
      const widthMm =
        definitionOf(buildId).sizesMm?.at(-1) ?? SEEDED_WIDTH_IS_UNUSED_MM;
      const setsByDepth = DEPTHS_MM.map((cabinetDepthMm) =>
        [
          ...new Set(
            partNamesOf(buildAt({ buildId, widthMm }, cabinetDepthMm)),
          ),
        ].sort(),
      );
      const [firstSet] = setsByDepth;
      if (!firstSet) throw new Error("no depth was swept");

      for (const names of setsByDepth) {
        expect(names).toEqual(firstSet);
      }
    },
  );
});
