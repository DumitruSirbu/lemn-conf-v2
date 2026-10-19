// **Adversarial QA for M7 wave 7J — the straight room in 3D** (criteria A10–A12). The slice's own
// suite proves the wall-B plane hides at one room and the presets filter at one room; this attacks
// the transitions — a hostile stored direction, a resize between two straight rooms, the switch back
// to an L at other dimensions — and sweeps the run-end panel over the approved wall.
import {
  buildKitchenLBodyCatalog,
  cornerDirectionOf,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  runEndPanelSeatM,
  type BodyProbeFactory,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { applyCornerDirection } from "../src/corner-direction.js";
import { disposeKit } from "../src/kit-disposal.js";
import { buildKitchenShell, resizeShellToRoom } from "../src/kitchen-shell.js";
import { makeKit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { cameraPresetsForRoom } from "../src/stage.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-28T09:00:00.000Z";

beforeAll(() => {
  installHeadlessDocument();
});

function linearRoom(widthMm: number, heightMm = 2600): DesignRoom {
  return { shape: "linear", widthMm, depthMm: 3400, heightMm };
}

const HOSTILE_RIGHT_LINEAR = {
  ...linearRoom(3700),
  cornerDirection: "right",
} as DesignRoom;

function wallBPlaneOf(shell: THREE.Object3D): THREE.Mesh {
  const plane = shell.children.find((child) => child.name === "wall_left");
  if (!plane || !isMesh(plane)) throw new Error("the shell has no wall_left");
  return plane;
}

describe("7J-A10 — a straight room carrying cornerDirection: right is drawn unmirrored", () => {
  it("frames the same two presets as the key-less straight room, x unnegated", () => {
    expect(cameraPresetsForRoom(HOSTILE_RIGHT_LINEAR)).toStrictEqual(
      cameraPresetsForRoom(linearRoom(3700)),
    );
  });

  it("leaves the stage root's scale.x positive", () => {
    const root = new THREE.Group();

    applyCornerDirection(root, cornerDirectionOf(HOSTILE_RIGHT_LINEAR));

    expect(root.scale.x).toBeGreaterThan(0);
  });

  it("hides wall B with the hostile key present", () => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas });

    expect(
      wallBPlaneOf(buildKitchenShell(kit, HOSTILE_RIGHT_LINEAR)).visible,
    ).toBe(false);
  });
});

describe("7J-A11 — wall B's visibility is a function of the shape through every resize", () => {
  it("stays hidden across a resize from one straight room to another", () => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas });
    const shell = buildKitchenShell(kit, linearRoom(1200));

    for (const widthMm of [6000, 3700, 1200]) {
      resizeShellToRoom({ kit, shell, room: linearRoom(widthMm, 3900) });
      expect(wallBPlaneOf(shell).visible, String(widthMm)).toBe(false);
    }
  });

  it("returns when a straight room becomes an L at different dimensions, and hides again", () => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas });
    const shell = buildKitchenShell(kit, linearRoom(1200));
    const lRoom: DesignRoom = {
      shape: "L",
      widthMm: 4200,
      depthMm: 2900,
      heightMm: 2700,
    };

    resizeShellToRoom({ kit, shell, room: lRoom });
    expect(wallBPlaneOf(shell).visible).toBe(true);

    resizeShellToRoom({ kit, shell, room: linearRoom(5000) });
    expect(wallBPlaneOf(shell).visible).toBe(false);
  });

  it("offers wall B's preset exactly when the plane is visible, over every shape and size", () => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas });
    const rooms: readonly DesignRoom[] = [
      linearRoom(1200),
      { shape: "L", widthMm: 3700, depthMm: 3400, heightMm: 2600 },
      linearRoom(6000, 3900),
      {
        shape: "L",
        widthMm: 6000,
        depthMm: 6000,
        heightMm: 3900,
        cornerDirection: "right",
      },
    ];
    const shell = buildKitchenShell(kit, linearRoom(3700));

    for (const room of rooms) {
      resizeShellToRoom({ kit, shell, room });
      const offersWallB = cameraPresetsForRoom(room).some(
        (preset) => preset.id === "wallB",
      );
      expect(offersWallB, JSON.stringify(room)).toBe(
        wallBPlaneOf(shell).visible,
      );
    }
  });
});

describe("7J-A11 — the straight run's one end panel, swept over the approved wall", () => {
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

  /** The panel's centre stands 10 mm past the last base cabinet and its outer face 9 mm past that, so a run needs
   *  19 mm of wall left over to be closed. Written out, not imported from the seat's own module. */
  const PANEL_HALF_THICKNESS_MM = 9;
  const NO_PANEL = "none";
  const MM_PER_M = 1000;
  /** A seat arrives as 2.4099999999999997 m; a thousandth of a millimetre forgives that and nothing a fitter sees. */
  const FLOAT_NOISE_MM = 0.001;

  /**
   * Each width with the seat it must produce, in millimetres along wall A. A row with no expectation passed for a
   * function that never seats a panel, so every row states one: `NO_PANEL` where the run ends closer than 19 mm to
   * the wall's end, where a remainder of 200 mm or more is filled to the wall (ADR 0167 D1), or where the generator
   * stands a column in the seat.
   */
  const SEATS_BY_WIDTH_MM: readonly {
    readonly widthMm: number;
    readonly seatMm: number | typeof NO_PANEL;
    readonly because: string;
  }[] = [
    { widthMm: 1200, seatMm: NO_PANEL, because: "the run ends on the wall" },
    { widthMm: 1201, seatMm: NO_PANEL, because: "1 mm is left past the run" },
    {
      widthMm: 1799,
      seatMm: NO_PANEL,
      because: "the 299 mm left past the run at 1500 is filled to the wall",
    },
    { widthMm: 1800, seatMm: NO_PANEL, because: "the run ends on the wall" },
    {
      widthMm: 2000,
      seatMm: NO_PANEL,
      because: "the 200 mm left past the run at 1800 is filled to the wall",
    },
    {
      widthMm: 2499,
      seatMm: 2410,
      because:
        "the run ends at 2400 and 99 mm, under the 200 mm floor, stays bare",
    },
    { widthMm: 2500, seatMm: NO_PANEL, because: "the run ends on the wall" },
    { widthMm: 3100, seatMm: NO_PANEL, because: "the run ends on the wall" },
    {
      widthMm: 3699,
      seatMm: NO_PANEL,
      because: "the 299 mm left past the run at 3400 is filled to the wall",
    },
    { widthMm: 4001, seatMm: NO_PANEL, because: "a column stands in the seat" },
    { widthMm: 4899, seatMm: NO_PANEL, because: "a column stands in the seat" },
    { widthMm: 5999, seatMm: NO_PANEL, because: "a column stands in the seat" },
    { widthMm: 6000, seatMm: NO_PANEL, because: "a column stands in the seat" },
  ];

  it.each(SEATS_BY_WIDTH_MM)(
    "never seats a panel at x ≤ 0 or past wall A's end at $widthMm mm ($because)",
    ({ widthMm, seatMm }) => {
      const room = linearRoom(widthMm);
      const result = generateKitchen({
        room,
        occurredAt: OCCURRED_AT,
        probeAt: realProbeFactory(),
      });
      if (!result.ok) throw new Error(`refused at ${String(widthMm)}`);
      const records = derivePlacementRecords(
        result.design,
        buildKitchenLBodyCatalog(600),
      );

      const seatM = runEndPanelSeatM(records, room);

      expect(
        seatM === undefined ? NO_PANEL : Math.round(seatM * MM_PER_M),
      ).toBe(seatMm);
      if (seatM === undefined) return;
      expect(seatM).toBeGreaterThan(0);
      expect(seatM * MM_PER_M + PANEL_HALF_THICKNESS_MM).toBeLessThanOrEqual(
        widthMm + FLOAT_NOISE_MM,
      );
    },
  );
});
