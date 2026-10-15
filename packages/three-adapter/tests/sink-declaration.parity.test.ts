// **The gate that makes ADR 0092 decision 9's declared sink a fact rather than a claim.**
//
// The domain declares whether a catalogue row holds a sink (`BodyDefinition.sink`), and it has to:
// pricing is a pure domain query, the domain has no meshes, and the only thing that actually settles
// the question is which group the builder puts inside the carcass. ADR 0070 decision 4 bills two
// extras per sink, so a row that quietly grows a sink and forgets to declare one is a kitchen priced
// short — and the declaration is a **default** on 37 of 38 rows, which is exactly the shape DOM-002
// had: a catch-all that was right almost everywhere and silently wrong for four families.
//
// **Both directions, over every entry.** A row that declares a sink builds a `sink_faucet` group,
// **and** a row that builds one declares a sink. A one-directional gate passes on the `NO_SINK`
// default and is not this gate: the direction that catches a new sink row nobody declared is the
// second one, and it is the whole reason the fact is declared rather than hard-coded.
//
// **The second half of this file is the rack**, which ADR 0070 decision 4 prices and forbids drawing.
// It is asserted from **this** side — the built body has no part for it — rather than by the absence
// of a diff, because "we changed no builder" is a claim about a wave and this is a claim about the
// geometry.
//
// Scope is `KITCHEN_L_BODY_CATALOG`, **both** of its populations (ADR 0011 Gap A), and for an
// insertable row **every width it declares**: `base-sink` is built from 560 mm to 800, and a gate
// that measured one width would be checking a constant rather than the rule.
import {
  declaresASink,
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

/** M2's seeded instances: every entry of the one map that is not §7-insertable. Derived rather than
 *  listed, so a seeded entry added tomorrow is gated the day it lands. */
const SEEDED_BUILD_IDS: readonly string[] = [...KITCHEN_L_BODY_CATALOG]
  .filter(([, definition]) => definition.insertable !== true)
  .map(([buildId]) => buildId);

/** Every id in the map, and the width each is measured at. A seeded row has one already-built body
 *  and therefore one width; an insertable row is measured at each of its declared `sizesMm`. */
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

/** A seeded row is one already-built body (ADR 0011 Gap A), so there is no width for anything to
 *  follow and the argument is unused. */
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

/** The group `kitchen-parts.ts` puts inside a sink base — the bowl, its rim and the tap. The one
 *  thing in the built scene that says *this body holds a sink*. */
const SINK_GROUP_NAME = "sink_faucet";

function builtSinkCountOf(built: THREE.Object3D): number {
  let sinks = 0;
  built.traverse((node) => {
    if (node.name === SINK_GROUP_NAME) sinks += 1;
  });
  return sinks;
}

function buildsASink(body: GatedBody): boolean {
  return builtSinkCountOf(buildBodyOf(body.buildId, body.widthMm)) > 0;
}

describe("every catalogue entry's sink declaration matches what its builder draws", () => {
  it("gates both populations of the one map, at every width an insertable row declares", () => {
    expect(CATALOG_BUILD_IDS.length).toBe(16);
    // 22 → 24 (M7C wave C2): the corner wall unit's two rows.
    expect(SEEDED_BUILD_IDS.length).toBe(24);

    const gatedIds = new Set(GATED_BODIES.map(({ buildId }) => buildId));
    expect([...gatedIds].sort()).toEqual(
      [...CATALOG_BUILD_IDS, ...SEEDED_BUILD_IDS].sort(),
    );
    // The sweep is over widths, not over rows: `base-sink` alone contributes five.
    expect(GATED_BODIES.length).toBeGreaterThan(gatedIds.size);
  });

  it.each(
    GATED_BODIES.map(
      (body) => [`${body.buildId}@${String(body.widthMm)}`, body] as const,
    ),
  )(
    "%s: declares a sink if and only if its builder draws one",
    (label, body) => {
      expect([label, declaresASink(definitionOf(body.buildId))]).toEqual([
        label,
        buildsASink(body),
      ]);
    },
  );

  /** **The first direction, stated on its own so a failure names it.** Every row whose declaration
   *  says *sink* builds the group. */
  it("builds a sink_faucet group for every row that declares a sink", () => {
    const declaring = GATED_BODIES.filter((body) =>
      declaresASink(definitionOf(body.buildId)),
    );

    expect(declaring.map((body) => body.buildId).sort()).toEqual([
      "base-sink",
      "base-sink",
      "base-sink",
      "base-sink",
      "base-sink",
      "base-sink-800",
    ]);
    for (const body of declaring) {
      expect([body.buildId, buildsASink(body)]).toEqual([body.buildId, true]);
    }
  });

  /**
   * **The second direction, and the one a one-directional gate is missing.** Every row whose builder
   * draws the group declares a sink.
   *
   * This is the direction the `NO_SINK` default cannot pass by accident: a new sink row that nobody
   * declared inherits the default, and the first direction above is silent about it because it never
   * looks at rows that declare nothing.
   */
  it("declares a sink for every row that builds a sink_faucet group", () => {
    const building = GATED_BODIES.filter(buildsASink);

    expect(new Set(building.map((body) => body.buildId))).toEqual(
      new Set(["base-sink", "base-sink-800"]),
    );
    for (const body of building) {
      expect([body.buildId, declaresASink(definitionOf(body.buildId))]).toEqual(
        [body.buildId, true],
      );
    }
  });
});

/**
 * **The dish drying rack is priced and never drawn** (ADR 0070 decision 4: *"Not drawn in 3D, and
 * must not be — the geometry stays untouched; this is a price line with no mesh"*).
 *
 * Asserted **from this side**, over every gated body at every width, rather than by observing that
 * the wave changed no builder file. A diff is evidence about a wave; this is evidence about the
 * geometry, and it stays true for the wave that makes the rack selectable later.
 */
describe("nothing in the catalogue draws a dish drying rack", () => {
  /** The words a rack would have to be named to be recognisable in the scene at all — the builders'
   *  own naming convention is a snake-cased English noun, so a part for this would carry one of
   *  these. */
  const RACK_WORD = /rack|drying|drainer|uscator/i;

  it.each(
    GATED_BODIES.map(
      (body) => [`${body.buildId}@${String(body.widthMm)}`, body] as const,
    ),
  )("%s: builds no part named for a rack", (label, body) => {
    const named: string[] = [];
    buildBodyOf(body.buildId, body.widthMm).traverse((node) => {
      if (RACK_WORD.test(node.name)) named.push(node.name);
    });

    expect([label, named]).toEqual([label, []]);
  });

  /** The negative above is only worth something if the sink base is genuinely being inspected, so
   *  this pins what it *does* build: the sink group, and no rack beside it. */
  it("builds the sink group and nothing else new inside the sink base", () => {
    const parts = new Set<string>();
    buildBodyOf("base-sink-800", SEEDED_WIDTH_IS_UNUSED_MM).traverse((node) => {
      parts.add(node.name);
    });

    expect(parts.has(SINK_GROUP_NAME)).toBe(true);
    expect([...parts].filter((name) => RACK_WORD.test(name))).toEqual([]);
  });
});
