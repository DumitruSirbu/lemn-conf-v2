// Adversarial QA for wave 6K-d step 4 — **the arm `declared-frame-depth-sweep.test.ts` excludes.**
//
// That file sweeps `wall-plane` rows only, and states why: a `recorded-shell` row's seat *is* a
// function of what its builder was asked for, so "declared equals measured" is not the claim there.
// **But step 4 changed exactly the `recorded-shell` rows** — `wallCabinet` gained
// `frameDepthMm: wallCarcassSeatDepthMm(...)` and `open-shelf` overrode it with
// `wallCarcassDepthMm(...)` — so the rows the wave moved are the rows that sweep does not reach.
//
// Two claims here, and the second is the one that pins a value. Both are run over the **whole**
// catalogue at **every** declared depth, both builder families, seeded rows included.
import {
  buildKitchenLBodyCatalog,
  declaredCabinetDepthsMm,
  toMetres,
  wallCarcassDepthMm,
  type BodyDefinition,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildAnyBody } from "../src/build-any-body.js";
import { isCatalogBuildId, rebuildDepthM } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

beforeAll(() => {
  installHeadlessDocument();
});

/** The same two rows `declared-frame-depth-sweep.test.ts` names, and for the same dated reasons:
 *  ADR 0025 drives the corner leg 20 mm into its return, and ADR 0039 hangs the hood at the front.
 *  Neither has its back face on the wall plane, so twice its seat is not its frame depth. */
const NOT_SEATED_ON_THE_WALL_PLANE: ReadonlySet<string> = new Set([
  "base-corner-x-900",
  "hood-600",
  "hood",
]);

/** A height for a body the catalogue states none for — the seeded decompositions, whose builders
 *  take no size at all. Stated rather than left to `toMetres(undefined)`, which is `NaN`. */
const FALLBACK_HEIGHT_M = 0.72;

const kits = new Map<number, { kit: Kit; room: THREE.Object3D }>();

function kitAt(cabinetDepthMm: number): { kit: Kit; room: THREE.Object3D } {
  const held = kits.get(cabinetDepthMm);
  if (held) return held;
  const kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm,
    wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
  });
  const built = { kit, room: kit.builders["kitchen-l"]() };
  kits.set(cabinetDepthMm, built);
  return built;
}

function heightMOf(definition: BodyDefinition): number {
  return definition.nominalHeightMm === undefined
    ? FALLBACK_HEIGHT_M
    : toMetres(definition.nominalHeightMm);
}

/** The depth `scene-sync` hands the builder for a placement carrying no measured seat: its
 *  `frameDepthMm` through `rebuildDepthM`, which adds a fronted wall row's assembly back. */
function buildDepthM(kit: Kit, buildId: string, frameDepthM: number): number {
  return isCatalogBuildId(buildId)
    ? rebuildDepthM(kit, buildId, frameDepthM)
    : frameDepthM;
}

function everyRow(
  cabinetDepthMm: number,
): readonly (readonly [string, BodyDefinition])[] {
  return [...buildKitchenLBodyCatalog(cabinetDepthMm)].filter(
    ([buildId]) => !NOT_SEATED_ON_THE_WALL_PLANE.has(buildId),
  );
}

describe("a stored placement with no measured seat rebuilds to the depth it declares", () => {
  // Not a vacuous sweep, and the floor is **per arm**: the rows this file exists for are the
  // `recorded-shell` ones, and a total count alone would let the sweep land entirely on the
  // `wall-plane` arm the other file already covers.
  it.each(declaredCabinetDepthsMm())(
    "reaches both measurement kinds and both builder families at %i mm",
    (cabinetDepthMm) => {
      const rows = everyRow(cabinetDepthMm);
      const recordedShell = rows.filter(
        ([, definition]) =>
          definition.occupiedDepth.measuredFrom === "recorded-shell",
      );

      expect(rows.length).toBeGreaterThan(20);
      expect(recordedShell.length).toBeGreaterThan(3);
      expect(
        recordedShell.filter(([id]) => isCatalogBuildId(id)).length,
      ).toBeGreaterThan(0);
      expect(
        rows.filter(([id]) => !isCatalogBuildId(id)).length,
      ).toBeGreaterThan(0);
    },
  );

  // **Claim one: the round trip converges.** ADR 0018 clause 4 and `rebuildDepthM`'s own worked
  // example — *"declared 0.330 builds a 0.291 shell, records `frame.d` 0.291, and rebuilds at
  // 0.291 + 0.039 = 0.330 for as many cycles as you care to run"*.
  //
  // **Stated limit, because it matters for reading a green here.** This claim is scale-free for a
  // `recorded-shell` row: `rebuildDepthM` adds back exactly what the builder subtracts, so it holds
  // for *any* `frameDepthMm` and does **not** on its own certify step 4's value. Verified by
  // mutation on 2026-09-05 — putting `wallCabinet`'s `frameDepthMm` back to the nominal leaves this
  // green. The claim that pins the value is the second block below.
  it.each(declaredCabinetDepthsMm())(
    "measures back the frame depth it declared, for every row, at %i mm",
    (cabinetDepthMm) => {
      const { kit, room } = kitAt(cabinetDepthMm);
      const probe = createBodyProbe(kit, room);
      const disagreeing = everyRow(cabinetDepthMm)
        .map(([buildId, definition]) => ({
          buildId,
          declared: definition.frameDepthMm,
          measured: Math.round(
            2000 *
              probe.measure({
                buildId,
                widthM: 0.6,
                heightM: heightMOf(definition),
                depthM: buildDepthM(
                  kit,
                  buildId,
                  toMetres(definition.frameDepthMm),
                ),
              }).seatOffsetM,
          ),
        }))
        .filter((row) => row.declared !== row.measured);

      expect(disagreeing).toEqual([]);
    },
  );

  it.each(declaredCabinetDepthsMm())(
    "does not walk over five save-and-reload cycles at %i mm",
    (cabinetDepthMm) => {
      const { kit, room } = kitAt(cabinetDepthMm);
      const probe = createBodyProbe(kit, room);
      const drifting: string[] = [];

      for (const [buildId, definition] of everyRow(cabinetDepthMm)) {
        let frameDepthM = toMetres(definition.frameDepthMm);
        for (let cycle = 0; cycle < 5; cycle += 1) {
          frameDepthM =
            2 *
            probe.measure({
              buildId,
              widthM: 0.6,
              heightM: heightMOf(definition),
              depthM: buildDepthM(kit, buildId, frameDepthM),
            }).seatOffsetM;
        }
        if (Math.round(frameDepthM * 1000) !== definition.frameDepthMm) {
          drifting.push(
            `${buildId}: ${String(definition.frameDepthMm)} -> ` +
              String(Math.round(frameDepthM * 1000)),
          );
        }
      }

      expect(drifting).toEqual([]);
    },
  );
});

/** What a row's **declaration** says its built body fills, read off `depthRule` alone — a source
 *  that knows nothing about `frameDepthMm` or `occupiedDepth`, which is what stops the assertion
 *  below being one number compared with itself. */
function declaredFinishedDepthMm(
  definition: BodyDefinition,
  cabinetDepthMm: number,
): number | undefined {
  const rule = definition.depthRule;
  if (rule === undefined) return undefined;
  if (rule.follows === "pinned") return rule.pinnedFinishedDepthMm;
  if (rule.follows === "cabinet-depth") {
    return wallCarcassDepthMm(cabinetDepthMm);
  }
  return undefined;
}

// **Claim two: the geometry, which is what pins the value.**
//
// ADR 0075 decision 1 says a `recorded-shell` row's `frameDepthMm` is its **shell** and its finished
// body is that shell plus what stands in front of it. Both halves are measurable off the built
// group, and neither is derived from the declaration being checked:
//
//   - twice the distance from the group origin back to the rear face is the frame depth;
//   - the whole z extent is the finished depth the row's `depthRule` declares.
//
// Measured 2026-09-05 at both depths: a fronted wall carcass spans −146 → +185 at 600 and
// −181 → +220 at 700, so 291/361 behind the origin and 330/400 overall. `open-shelf` spans
// ±165 and ±200 — 330/400 both ways, which is its paired override being real geometry rather than a
// declaration choice.
describe("a recorded shell's two declared numbers, against the built body", () => {
  function shellRows(
    cabinetDepthMm: number,
  ): readonly (readonly [string, BodyDefinition])[] {
    return everyRow(cabinetDepthMm).filter(
      ([, definition]) =>
        definition.occupiedDepth.measuredFrom === "recorded-shell" &&
        declaredFinishedDepthMm(definition, cabinetDepthMm) !== undefined,
    );
  }

  it.each(declaredCabinetDepthsMm())(
    "reaches fronted rows, an unfronted one and a pinned one at %i mm",
    (cabinetDepthMm) => {
      const rows = shellRows(cabinetDepthMm);
      const unfronted = rows.filter(
        ([, definition]) =>
          definition.occupiedDepth.measuredFrom === "recorded-shell" &&
          definition.occupiedDepth.frontAssemblyMm === 0,
      );
      const pinned = rows.filter(
        ([, definition]) => definition.depthRule?.follows === "pinned",
      );

      expect(rows.length).toBeGreaterThan(9);
      expect(unfronted.length).toBeGreaterThan(1);
      expect(pinned.length).toBeGreaterThan(1);
      expect(
        rows.filter(([id]) => isCatalogBuildId(id)).length,
      ).toBeGreaterThan(0);
      expect(
        rows.filter(([id]) => !isCatalogBuildId(id)).length,
      ).toBeGreaterThan(0);
    },
  );

  it.each(declaredCabinetDepthsMm())(
    "builds a shell as deep as it declared and a body as deep as its rule says, at %i mm",
    (cabinetDepthMm) => {
      const { kit } = kitAt(cabinetDepthMm);
      const wrong: string[] = [];

      for (const [buildId, definition] of shellRows(cabinetDepthMm)) {
        const group = buildAnyBody(kit, buildId, {
          widthM: 0.6,
          heightM: heightMOf(definition),
          depthM: buildDepthM(kit, buildId, toMetres(definition.frameDepthMm)),
        });
        group.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(group);

        const shellMm = Math.round(-2000 * box.min.z);
        const finishedMm = Math.round(1000 * (box.max.z - box.min.z));
        if (shellMm !== definition.frameDepthMm) {
          wrong.push(
            `${buildId}: declared shell ${String(definition.frameDepthMm)}, ` +
              `built ${String(shellMm)}`,
          );
        }
        if (
          finishedMm !== declaredFinishedDepthMm(definition, cabinetDepthMm)
        ) {
          wrong.push(
            `${buildId}: rule says ` +
              `${String(declaredFinishedDepthMm(definition, cabinetDepthMm))} finished, ` +
              `built ${String(finishedMm)}`,
          );
        }
      }

      expect(wrong).toEqual([]);
    },
  );
});
