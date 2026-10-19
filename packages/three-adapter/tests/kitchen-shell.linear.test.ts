// ADR 0130 D8/D9 (wave 7J S3, criteria A11/A12): a straight room's shell hides wall B rather than
// removing it, the drawn-room signature tells an L and a straight room apart at equal dimensions,
// and the straight room offers two camera presets rather than three.
import {
  buildKitchenLBodyCatalog,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  runEndPanelSeatM,
  type BodyProbeFactory,
  type DesignRoom,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { disposeKit } from "../src/kit-disposal.js";
import {
  buildKitchenShell,
  resizeShellToRoom,
  syncRunEndPanel,
} from "../src/kitchen-shell.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { cameraPresetsForRoom } from "../src/stage.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-24T13:00:00.000Z";
const CORNER_OVERHANG_M = 0.3;

beforeAll(() => {
  installHeadlessDocument();
});

const L_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 3700,
  depthMm: 3400,
  heightMm: 2600,
};
const LINEAR_ROOM: DesignRoom = {
  shape: "linear",
  widthMm: 3700,
  depthMm: 3400,
  heightMm: 2600,
};

interface BuiltShell {
  readonly kit: Kit;
  readonly shell: THREE.Group;
}

function shellFor(room: DesignRoom): BuiltShell {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  return { kit, shell: buildKitchenShell(kit, room) };
}

function meshNamed(shell: THREE.Group, name: string): THREE.Mesh {
  const child = shell.children.find((candidate) => candidate.name === name);
  if (!child || !isMesh(child)) throw new Error(`No shell mesh named ${name}`);
  return child;
}

describe("buildKitchenShell — wall B is hidden, not removed, for a straight room", () => {
  it("draws wall_left invisible for a straight room and visible for an L", () => {
    expect(meshNamed(shellFor(LINEAR_ROOM).shell, "wall_left").visible).toBe(
      false,
    );
    expect(meshNamed(shellFor(L_ROOM).shell, "wall_left").visible).toBe(true);
  });

  it("still resizes wall_left's geometry to depthMm, hidden or not", () => {
    const plane = meshNamed(shellFor(LINEAR_ROOM).shell, "wall_left");
    const geometry = plane.geometry as THREE.PlaneGeometry;
    expect(geometry.parameters.width).toBeCloseTo(
      LINEAR_ROOM.depthMm / 1000 + CORNER_OVERHANG_M,
      6,
    );
  });

  it("draws the floor's depth as depthMm + 0.3 m for a straight room", () => {
    const shell = shellFor(LINEAR_ROOM).shell;
    shell.updateWorldMatrix(true, true);
    const floorBox = new THREE.Box3().setFromObject(meshNamed(shell, "floor"));

    expect(floorBox.max.z - floorBox.min.z).toBeCloseTo(
      LINEAR_ROOM.depthMm / 1000 + CORNER_OVERHANG_M,
      6,
    );
  });

  it("redraws in place when an L and a straight room stand at equal W x D x H", () => {
    const { kit, shell } = shellFor(L_ROOM);
    expect(meshNamed(shell, "wall_left").visible).toBe(true);

    resizeShellToRoom({ kit, shell, room: LINEAR_ROOM });
    expect(meshNamed(shell, "wall_left").visible).toBe(false);

    resizeShellToRoom({ kit, shell, room: L_ROOM });
    expect(meshNamed(shell, "wall_left").visible).toBe(true);
  });
});

describe("syncRunEndPanel — the straight room's one panel, never at x <= 0", () => {
  function realProbeFactory(): BodyProbeFactory {
    return (cabinetDepthMm) => {
      const probeKit = makeKit({
        createCanvas: createHeadlessCanvas,
        cabinetDepthMm,
      });
      const probeRoom = probeKit.builders["kitchen-l"]();
      return createBodyProbeLease(createBodyProbe(probeKit, probeRoom), () => {
        disposeKit(probeKit, probeRoom);
      });
    };
  }

  function generatedRecords(room: DesignRoom): readonly PlacementRecord[] {
    const result = generateKitchen({
      room,
      occurredAt: OCCURRED_AT,
      probeAt: realProbeFactory(),
    });
    if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
    return derivePlacementRecords(result.design, buildKitchenLBodyCatalog(600));
  }

  // 3700 mm (G7) fills its wall exactly, so ADR 0120 D2's own veto rightly hides the panel there —
  // 2499 mm is chosen instead: its 99 mm remainder is under the 200 mm floor (ADR 0167 D2), so it stays the ordinary
  // bare end the panel needs to stand in. A remainder of 200 mm or more is now filled to the wall (ADR 0167 D1).
  const ROOM_WITH_A_BARE_END: DesignRoom = { ...LINEAR_ROOM, widthMm: 2499 };

  it("seats the right panel at runEndPanelSeatM's own answer, no left panel drawn", () => {
    const records = generatedRecords(ROOM_WITH_A_BARE_END);
    const { shell } = shellFor(ROOM_WITH_A_BARE_END);
    const solidsRoot = new THREE.Group();
    solidsRoot.add(shell);

    syncRunEndPanel({ solidsRoot, records, room: ROOM_WITH_A_BARE_END });

    const panel = meshNamed(shell, "end_panel_right");
    const seatM = runEndPanelSeatM(records, ROOM_WITH_A_BARE_END);
    expect(seatM).toBeDefined();
    expect(panel.visible).toBe(true);
    expect(panel.position.x).toBe(seatM);
    expect(panel.position.x).toBeGreaterThan(0);
    // No shell child answers to a left-hand panel name at all — the manifest never declared one.
    expect(
      shell.children.some((child) =>
        /panel_left|end_panel_left/.test(child.name),
      ),
    ).toBe(false);
  });

  it("hides the panel where the run fills the wall exactly, at 3700 mm (D2's own veto)", () => {
    const records = generatedRecords(LINEAR_ROOM);
    const seatM = runEndPanelSeatM(records, LINEAR_ROOM);

    expect(seatM).toBeUndefined();
  });
});

describe("cameraPresetsForRoom — a straight room offers one wall (ADR 0130 D9)", () => {
  it("returns exactly [overview, wallA] for a straight room", () => {
    expect(
      cameraPresetsForRoom(LINEAR_ROOM).map((preset) => preset.id),
    ).toEqual(["overview", "wallA"]);
  });

  it("still returns all three for an L, unchanged", () => {
    expect(cameraPresetsForRoom(L_ROOM).map((preset) => preset.id)).toEqual([
      "overview",
      "wallA",
      "wallB",
    ]);
  });
});
