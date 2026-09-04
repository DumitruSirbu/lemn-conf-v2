// **Wave 6P gave `applyRecordedAppearance` a branch it never had, and until this file nothing
// exercised the false arm at the scene.**
//
// Before the wave, every `PlacementRecord.finishKey` was one of five strings this build draws. Since
// the wave it is a declared `Finish`, and `scene-sync.ts:189` reads it through `finishKeyOf`, which
// returns `undefined` for the six declared entries and every free colour this build has no material
// for. `finishes.test.ts` asserts `finishKeyOf` returns nothing for those; **the scene is where that
// nothing has to be harmless**, and that is what this file attacks.
//
// Three ways it could not be harmless: a throw, a front left wearing the *previous* finish because
// the body did not re-sign, and a front painted a colour nobody offered because something guessed.
import {
  freeColourFinish,
  LEGACY_ENUM_FINISHES,
  NO_FRONT_ASSEMBLY_MM,
  paletteFinish,
  shellPlusFrontMm,
  type Frame,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const WALL_ROW_Y0_M = 1.5;

/** Every declared finish this build has no material for — the six palette entries outside the
 *  legacy five, plus a free colour a RAL picker will produce the moment wave 6R ships one. */
const UNDRAWABLE_FINISHES = [
  paletteFinish("pal.stejar-halifax"),
  paletteFinish("pal.gri-havanna"),
  paletteFinish("pal.nuc-warmia"),
  paletteFinish("veneer.stejar"),
  paletteFinish("veneer.nuc"),
  freeColourFinish("#123456"),
  freeColourFinish("#ffffff"),
] as const;

let kit: Kit;
let solidsRoot: THREE.Group;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
});

type RecordOverrides = Partial<Omit<PlacementRecord, "frame">> & {
  readonly id: string;
  readonly frame?: Partial<Frame>;
};

function makeRecord(overrides: RecordOverrides): PlacementRecord {
  return {
    buildId: "wall-cabinet",
    kind: "wall_cabinet",
    col: "A|2.00",
    wall: "A",
    rotated: false,
    band: "wall",
    widthMm: 600,
    heightMm: 700,
    canFinish: true,
    canHandle: true,
    canReplace: true,
    canDelete: true,
    fixedWidth: false,
    occupiedDepth: shellPlusFrontMm(NO_FRONT_ASSEMBLY_MM),
    ...overrides,
    frame: {
      x: 2,
      y0: WALL_ROW_Y0_M,
      z: 0.2,
      ry: 0,
      w: 0.6,
      h: 0.7,
      d: 0.4,
      ...overrides.frame,
    },
  };
}

function sync(records: readonly PlacementRecord[]): void {
  syncSolidBodies({ kit, solidsRoot, records });
}

function mounted(placementId: string): THREE.Object3D {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`No body mounted for placement "${placementId}"`);
  return body;
}

function frontsOf(root: THREE.Object3D): readonly THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (isMesh(node) && /door_front|drawer_front/.test(node.name)) {
      found.push(node);
    }
  });
  return found;
}

describe("a declared finish this build cannot draw", () => {
  it.each(UNDRAWABLE_FINISHES)("mounts the body at all for %j", (finish) => {
    expect(() => {
      sync([makeRecord({ id: "p1", finishKey: finish })]);
    }).not.toThrow();

    expect(frontsOf(mounted("p1")).length).toBeGreaterThan(0);
  });

  it.each(UNDRAWABLE_FINISHES)(
    "leaves the front in the kit's own material for %j rather than guessing a nearby colour",
    (finish) => {
      sync([makeRecord({ id: "p1", finishKey: finish })]);

      for (const front of frontsOf(mounted("p1"))) {
        expect(front.material).toBe(kit.M.door);
      }
    },
  );

  it.each(UNDRAWABLE_FINISHES)(
    "clears a finish it *could* draw when the record moves to %j",
    (finish) => {
      // The failure the branch invites: `applyBodyFinish` is skipped, and if the body were not
      // re-signed it would still be the sage one from the previous sync — a customer picking a
      // decor and seeing the old colour stay put, which is the exact defect §5.5's seam was
      // written to close.
      sync([makeRecord({ id: "p1", finishKey: LEGACY_ENUM_FINISHES.sage })]);
      const before = mounted("p1");

      sync([makeRecord({ id: "p1", finishKey: finish })]);

      expect(mounted("p1")).not.toBe(before);
      for (const front of frontsOf(mounted("p1"))) {
        expect(front.material).toBe(kit.M.door);
      }
    },
  );

  it("re-signs between two finishes it cannot draw either", () => {
    // Both render identically today, so only the signature can tell them apart. A signature that
    // collapsed them would strand the first one on screen once wave 6R gives them materials.
    sync([makeRecord({ id: "p1", finishKey: paletteFinish("veneer.stejar") })]);
    const before = mounted("p1");

    sync([makeRecord({ id: "p1", finishKey: paletteFinish("veneer.nuc") })]);

    expect(mounted("p1")).not.toBe(before);
  });

  it("re-signs when a free colour changes by one digit", () => {
    sync([makeRecord({ id: "p1", finishKey: freeColourFinish("#b8c4a1") })]);
    const before = mounted("p1");

    sync([makeRecord({ id: "p1", finishKey: freeColourFinish("#b8c4a2") })]);

    expect(mounted("p1")).not.toBe(before);
  });

  it("never confuses a palette id with a free colour that spells it", () => {
    // `finishSignature` tags both kinds. Untagged, an entry id and a colour value would share a
    // namespace, and the first collision would be a body that refuses to re-sign.
    sync([makeRecord({ id: "p1", finishKey: paletteFinish("pal.alb") })]);
    const before = mounted("p1");

    sync([makeRecord({ id: "p1", finishKey: freeColourFinish("#eceeeb") })]);

    expect(mounted("p1")).not.toBe(before);
  });

  it.each(UNDRAWABLE_FINISHES)(
    "keeps the identical instance for %j when nothing changed",
    (finish) => {
      const records = [makeRecord({ id: "p1", finishKey: finish })];
      sync(records);
      const before = mounted("p1");

      sync(records);

      expect(mounted("p1")).toBe(before);
    },
  );
});
