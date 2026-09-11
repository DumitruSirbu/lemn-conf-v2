// **Wave 6P gave `applyRecordedAppearance` a branch it never had; wave 6R deleted it, and this file
// is what holds the deletion.**
//
// The branch was `finishKeyOf` returning `undefined` for a declared finish the adapter had no
// material for — six of the eight palette entries and every free colour — which left the front in
// the kit's own colour. 6R made the adapter's table total, so **there is no such finish left**, and
// the property this file asserts inverted: every value a `PlacementRecord` can carry now reaches
// the front.
//
// Everything else it attacked still matters and is unchanged. The old branch could have stranded a
// front wearing the *previous* finish because the body did not re-sign; the same failure is
// reachable through `finishSignature` alone, and the re-signing tests below are what catch it.
//
// **The fixtures record `drawnFinish`, not `finishKey`** (ADR 0099 Amendment A section 3). The
// record now carries two colours — what the cabinet chose, and what to paint — and the adapter
// reads and signs the second. Every expected colour and every re-signing claim below is unchanged;
// only the field the fixture states the colour in moved, onto the one the renderer is contracted
// to read.
import {
  freeColourFinish,
  KITCHEN_L_DESIGN,
  LEGACY_ENUM_FINISHES,
  NO_FRONT_ASSEMBLY_MM,
  paletteFinish,
  shellPlusFrontMm,
  type Frame,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { swatchOf } from "../src/finishes.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const WALL_ROW_Y0_M = 1.5;

/** The finishes that had no material before wave 6R — the six palette entries outside the legacy
 *  five, plus the free colours the RAL picker now produces. Kept as this file's own sweep rather
 *  than replaced by the domain's generator: the claim is about exactly the values that used to fall
 *  through the deleted branch. */
const ONCE_UNDRAWABLE_FINISHES = [
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
  syncSolidBodies({ kit, solidsRoot, records, room: KITCHEN_L_DESIGN.room });
}

function mounted(placementId: string): THREE.Object3D {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`No body mounted for placement "${placementId}"`);
  return body;
}

function colourOf(mesh: THREE.Mesh): string {
  const material = mesh.material;
  if (Array.isArray(material) || !("color" in material)) {
    throw new Error(`Mesh "${mesh.name}" has no single coloured material`);
  }
  return `#${(material.color as THREE.Color).getHexString()}`;
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

describe("every declared finish now reaches the front it was recorded on", () => {
  it.each(ONCE_UNDRAWABLE_FINISHES)(
    "mounts the body at all for %j",
    (finish) => {
      expect(() => {
        sync([makeRecord({ id: "p1", drawnFinish: finish })]);
      }).not.toThrow();

      expect(frontsOf(mounted("p1")).length).toBeGreaterThan(0);
    },
  );

  it.each(ONCE_UNDRAWABLE_FINISHES)(
    "paints %j with the colour the adapter publishes for it, never the kit's default",
    (finish) => {
      sync([makeRecord({ id: "p1", drawnFinish: finish })]);

      const fronts = frontsOf(mounted("p1"));
      expect(fronts.length).toBeGreaterThan(0);
      for (const front of fronts) {
        // Identity first: a front still wearing `kit.M.door` is the silent default this wave
        // removed, and it would read as "white" rather than as a failure.
        expect(front.material).not.toBe(kit.M.door);
        expect(colourOf(front)).toBe(swatchOf(finish).color);
      }
    },
  );

  it.each(ONCE_UNDRAWABLE_FINISHES)(
    "replaces the colour a body was already wearing when the record moves to %j",
    (finish) => {
      // The failure the deleted branch invited, and the one `finishSignature` still has to prevent:
      // if the body were not re-signed it would still be the sage one from the previous sync — a
      // customer picking a decor and seeing the old colour stay put, which is the exact defect
      // §5.5's seam was written to close.
      sync([makeRecord({ id: "p1", drawnFinish: LEGACY_ENUM_FINISHES.sage })]);
      const before = mounted("p1");

      sync([makeRecord({ id: "p1", drawnFinish: finish })]);

      expect(mounted("p1")).not.toBe(before);
      for (const front of frontsOf(mounted("p1"))) {
        expect(colourOf(front)).toBe(swatchOf(finish).color);
      }
    },
  );

  it("re-signs between the two veneer woods", () => {
    // Before 6R both rendered identically, so only the signature could tell them apart; now they
    // are two colours and a collapsed signature would strand the first one on screen.
    sync([
      makeRecord({ id: "p1", drawnFinish: paletteFinish("veneer.stejar") }),
    ]);
    const before = mounted("p1");

    sync([makeRecord({ id: "p1", drawnFinish: paletteFinish("veneer.nuc") })]);

    expect(mounted("p1")).not.toBe(before);
  });

  it("re-signs when a free colour changes by one digit", () => {
    sync([makeRecord({ id: "p1", drawnFinish: freeColourFinish("#b8c4a1") })]);
    const before = mounted("p1");

    sync([makeRecord({ id: "p1", drawnFinish: freeColourFinish("#b8c4a2") })]);

    expect(mounted("p1")).not.toBe(before);
  });

  it("never confuses a palette id with a free colour that spells it", () => {
    // `finishSignature` tags both kinds. Untagged, an entry id and a colour value would share a
    // namespace, and the first collision would be a body that refuses to re-sign.
    sync([makeRecord({ id: "p1", drawnFinish: paletteFinish("pal.alb") })]);
    const before = mounted("p1");

    sync([makeRecord({ id: "p1", drawnFinish: freeColourFinish("#eceeeb") })]);

    expect(mounted("p1")).not.toBe(before);
  });

  it.each(ONCE_UNDRAWABLE_FINISHES)(
    "keeps the identical instance for %j when nothing changed",
    (finish) => {
      const records = [makeRecord({ id: "p1", drawnFinish: finish })];
      sync(records);
      const before = mounted("p1");

      sync(records);

      expect(mounted("p1")).toBe(before);
    },
  );
});
