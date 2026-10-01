import {
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  cabinetDepthMmOf,
  createBodyProbeLease,
  derivePlacementRecords,
  setCabinetDepth,
  toMetres,
  type BodyProbeFactory,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildAnyBody } from "../src/build-any-body.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { disposeKit } from "../src/kit-disposal.js";
import { makeKit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { describeStructure, findMesh, worldBox } from "./support/structure.js";

const occurredAt = "2026-09-18T11:00:00.000Z";
const corners = [
  {
    id: "p25",
    buildId: "base-corner-x-900",
    referenceMm: 900,
    narrowMm: 880,
    mesh: "carcass",
  },
  {
    id: "p26",
    buildId: "base-corner-return-320",
    // 320 → 330 and 300 → 310 (ADR 0135): the return starts at the run's carcass front, 570, so the
    // reference width is 900 − 570 and the 880 mm room leaves it 880 − 570.
    referenceMm: 330,
    narrowMm: 310,
    mesh: "carcass",
  },
  {
    id: "p9",
    buildId: "wall-corner-return-570",
    referenceMm: 570,
    narrowMm: 550,
    mesh: "carcass_shell",
  },
  {
    id: "p21",
    buildId: "wall-corner-return-570-top",
    referenceMm: 570,
    narrowMm: 550,
    mesh: "carcass_shell",
  },
] as const;

beforeAll(() => {
  installHeadlessDocument();
});

describe("S3b recorded corner widths at the scene and probe seams", () => {
  it.each([600, 700] as const)(
    "uses every supplied corner width through buildAnyBody and the real probe at %i mm depth",
    (cabinetDepthMm) => {
      const kit = makeKit({
        createCanvas: createHeadlessCanvas,
        cabinetDepthMm,
      });
      const room = kit.builders["kitchen-l"]();
      const probe = createBodyProbe(kit, room);
      try {
        for (const { buildId, referenceMm, narrowMm, mesh } of corners) {
          const narrowSize = {
            widthM: toMetres(narrowMm),
            heightM: 0.25,
            depthM: 1.3,
          };
          const referenceSize = {
            widthM: toMetres(referenceMm),
            heightM: 2.4,
            depthM: 0.1,
          };
          const narrow = buildAnyBody(kit, buildId, narrowSize);
          const reference = buildAnyBody(kit, buildId, referenceSize);
          const narrowBox = worldBox(narrow, findMesh(narrow, mesh));
          const referenceBox = worldBox(reference, findMesh(reference, mesh));
          expect(narrowBox.max.x - narrowBox.min.x, buildId).toBeCloseTo(
            toMetres(narrowMm),
            6,
          );
          expect(referenceBox.max.x - referenceBox.min.x, buildId).toBeCloseTo(
            toMetres(referenceMm),
            6,
          );

          const narrowProbe = probe.measure({
            ...narrowSize,
            buildId,
            seatedOn: "wall-plane",
          });
          const referenceProbe = probe.measure({
            ...referenceSize,
            buildId,
            seatedOn: "wall-plane",
          });
          expect(
            narrowProbe.carcassWidthM - referenceProbe.carcassWidthM,
            buildId,
          ).toBeCloseTo(toMetres(narrowMm - referenceMm), 6);

          const changedHeightDepth = buildAnyBody(kit, buildId, {
            widthM: narrowSize.widthM,
            heightM: referenceSize.heightM,
            depthM: referenceSize.depthM,
          });
          expect(describeStructure(changedHeightDepth), buildId).toStrictEqual(
            describeStructure(narrow),
          );

          const directReference = buildDecomposedBody(kit, buildId);
          const directBox = worldBox(
            directReference,
            findMesh(directReference, mesh),
          );
          expect(directBox.max.x - directBox.min.x, buildId).toBeCloseTo(
            toMetres(referenceMm),
            6,
          );
        }
      } finally {
        disposeKit(kit, room);
      }
    },
  );

  it.each([600, 700] as const)(
    "keeps representative non-corner decompositions independent of every supplied size at %i mm",
    (cabinetDepthMm) => {
      const kit = makeKit({
        createCanvas: createHeadlessCanvas,
        cabinetDepthMm,
      });
      const room = kit.builders["kitchen-l"]();
      try {
        for (const buildId of [
          "base-sink-800",
          "wall-1door-300",
          "fridge-free-700",
        ]) {
          const narrow = buildAnyBody(kit, buildId, {
            widthM: 0.2,
            heightM: 0.3,
            depthM: 0.2,
          });
          const wide = buildAnyBody(kit, buildId, {
            widthM: 1.2,
            heightM: 2.5,
            depthM: 1.1,
          });
          expect(describeStructure(narrow), buildId).toStrictEqual(
            describeStructure(wide),
          );
        }
      } finally {
        disposeKit(kit, room);
      }
    },
  );

  it("mounts all four non-reference 600 mm corner records and keeps their widths through the depth command", () => {
    const shell = buildLShellDesign({
      room: { shape: "L", widthMm: 880, depthMm: 880, heightMm: 2600 },
      occurredAt,
    });
    expect(
      corners.map(
        ({ id }) => shell.placements.find((p) => p.id === id)?.body.widthMm,
      ),
    ).toEqual(corners.map(({ narrowMm }) => narrowMm));
    expectMountedWidths(shell);

    const command = setCabinetDepth({
      design: shell,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: realProbeFactory(),
      cabinetDepthMm: 700,
      occurredAt,
    });
    if (!command.ok)
      throw new Error(`depth command refused: ${command.reason.code}`);
    const deepened = command.design;
    expect(cabinetDepthMmOf(deepened)).toBe(700);
    expect(
      corners.map(
        ({ id }) => deepened.placements.find((p) => p.id === id)?.body.widthMm,
      ),
    ).toEqual(corners.map(({ narrowMm }) => narrowMm));
    expectMountedWidths(deepened);
  });
});

function realProbeFactory(): BodyProbeFactory {
  return (cabinetDepthMm) => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
    const room = kit.builders["kitchen-l"]();
    return createBodyProbeLease(createBodyProbe(kit, room), () => {
      disposeKit(kit, room);
    });
  };
}

function expectMountedWidths(design: Design): void {
  const cabinetDepthMm = cabinetDepthMmOf(design);
  const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
  const room = kit.builders["kitchen-l"]();
  const solids = new THREE.Group();
  try {
    syncSolidBodies({
      kit,
      solidsRoot: solids,
      records: derivePlacementRecords(
        design,
        buildKitchenLBodyCatalog(cabinetDepthMm),
      ),
      room: design.room,
    });
    for (const { id, narrowMm, mesh } of corners) {
      const body = solids.children.find(
        (child) => child.userData["placementId"] === id,
      );
      if (!body) throw new Error(`missing mounted ${id}`);
      const box = worldBox(solids, findMesh(body, mesh));
      const widthM =
        id === "p25" ? box.max.x - box.min.x : box.max.z - box.min.z;
      expect(widthM, id).toBeCloseTo(toMetres(narrowMm), 6);
    }
  } finally {
    disposeKit(kit, room);
  }
}
