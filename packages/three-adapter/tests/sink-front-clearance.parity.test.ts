// **The gate that holds the sink to the worktop it is cut into, at every declared cabinet depth.**
//
// ADR 0098, and the sibling of `hob-front-clearance.parity.test.ts` one body over. The sink had the
// same class of defect ADR 0087 found in the hob and it survived the same three gates:
// `cabinet-depth-sweep.parity.test.ts` measures each body's finished *envelope*, which the worktop
// defines and the bowl never reaches; `room-composition.parity.test.ts` measures bodies against
// walls and neighbours, and the sink intersects nothing; `sink-declaration.parity.test.ts` asks
// whether a body *has* a sink, never where it sits. So the assembly stood still at local `z = 0`
// while the worktop grew fore and aft around it, and at 700 the cook reached 50 mm further while
// the faucet's escutcheon sat 2 mm off the wall at 600.
//
// Every claim here is a **relation between two named meshes measured in one built kit**, swept over
// the depths ADR 0056 declares and read from that declaration rather than from a literal pair — so
// a third declared depth is gated the day it lands. A table of expected positions would pass just
// as well if every number in it were wrong together, which is precisely how this defect shipped.
import { declaredCabinetDepthsMm } from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** ADR 0098 decision 2's declared fact, written here as data rather than read out of the module
 *  under test — a test that imported the constant would pass for any value of it. It is
 *  `(620 − 400) / 2`, which is what "centred at the declared 600" means. */
const FRONT_CLEARANCE_MM = 110;

/** The aperture the worktop is cut to, and the bowl that drops into it: a manufactured size. */
const APERTURE_DEPTH_MM = 400;

/** ADR 0098 decision 6: the cabinet depth at which the faucet's escutcheon meets the wall plane,
 *  `faucetToWallMm(d) = d − 578`. Unlike the hob's 510 mm floor this is **above**
 *  `MIN_CABINET_DEPTH_MM`, so the declared minimum does not protect it — only the declared depth
 *  map does. A third declared depth below 578 fails the sweep below rather than shipping. */
const FAUCET_MEETS_THE_WALL_AT_MM = 578;

/** The one depth the owner's word "centred" is a ruling *about*, as opposed to a rule carried to
 *  every other depth by the derived seat. */
const DEPTH_THE_CENTRING_IS_RULED_AT_MM = 600;

/** ADR 0098 decision 7 criterion 6: both populations reach one `baseCabinet(w, { sink: true })`,
 *  and a test covering only the seeded body proves nothing about the catalogue's. The three widths
 *  are §7's stepped ladder from the 560 mm aperture up to the 800 mm cabinetry ceiling. */
const SEEDED_SINK_BUILD_ID = "base-sink-800";
const CATALOGUE_SINK_BUILD_ID = "base-sink";
const CATALOGUE_SINK_WIDTHS_MM = [600, 700, 800] as const;

/** `base-sink` reads only the width off its request — its depth is the kit's, and its height is the
 *  worktop's — so these two are held constant to keep the sweep about the depth axis alone. */
const SWEPT_BODY_HEIGHT_M = 0.86;
const SWEPT_BODY_DEPTH_M = 0.58;

/** A `Box3` over real geometry carries float noise a seat shows as 0.5800000047683715; rounding to
 *  the millimetre is what `toMillimetres` exists to do, not a tolerance. */
const mm = (metres: number): number => Math.round(metres * 1000);

const kits = new Map<number, Kit>();

beforeAll(() => {
  installHeadlessDocument();
  for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
    // No `wallDepthMm`: nothing here is a wall body, and pairing one off ADR 0028's map would put
    // a second declaration in a file whose subject is the base worktop alone.
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

/** Every sink-bearing body the product can build, at every declared depth: the seeded room's own
 *  and the catalogue's at each declared width. */
interface SweptSinkBody {
  readonly cabinetDepthMm: number;
  readonly what: string;
  readonly body: THREE.Group;
}

function sweptSinkBodies(): SweptSinkBody[] {
  return declaredCabinetDepthsMm().flatMap((cabinetDepthMm) => {
    const kit = kitAt(cabinetDepthMm);
    const seeded = buildDecomposedBody(kit, SEEDED_SINK_BUILD_ID);
    const built: SweptSinkBody[] = [
      { cabinetDepthMm, what: SEEDED_SINK_BUILD_ID, body: seeded },
      ...CATALOGUE_SINK_WIDTHS_MM.map((widthMm) => ({
        cabinetDepthMm,
        what: `${CATALOGUE_SINK_BUILD_ID} at ${String(widthMm)} mm`,
        body: buildCatalogBody(kit, CATALOGUE_SINK_BUILD_ID, {
          widthM: widthMm / 1000,
          heightM: SWEPT_BODY_HEIGHT_M,
          depthM: SWEPT_BODY_DEPTH_M,
        }),
      })),
    ];
    for (const { body } of built) body.updateWorldMatrix(true, true);
    return built;
  });
}

/** The union of every mesh carrying this name, in the frame of the root it is measured in. Named
 *  meshes rather than child indices: a body whose parts were reordered would otherwise quietly
 *  change what this measures. */
function boundsOf(
  root: THREE.Object3D,
  ...names: readonly string[]
): THREE.Box3 {
  const bounds = new THREE.Box3();
  let found = 0;
  root.traverse((object) => {
    if (!names.includes(object.name)) return;
    found += 1;
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  if (found === 0) throw new Error(`no ${names.join("/")} in ${root.name}`);
  return bounds;
}

/** Where the stone's own two edges fall: the front one is the edge the cook stands at, the back one
 *  is the wall plane (§11 row 19). */
const worktopFrontMm = (body: THREE.Object3D): number =>
  mm(boundsOf(body, "countertop_front").max.z);
const worktopBackMm = (body: THREE.Object3D): number =>
  mm(boundsOf(body, "countertop_back").min.z);

/** And where the hole cut between them does. Read off the two slabs that bound it rather than off
 *  the bowl, so criterion 4 below — that the rim lands on those edges — is a claim about two
 *  independently measured things. */
const apertureFrontMm = (body: THREE.Object3D): number =>
  mm(boundsOf(body, "countertop_front").min.z);
const apertureBackMm = (body: THREE.Object3D): number =>
  mm(boundsOf(body, "countertop_back").max.z);

const rimBounds = (body: THREE.Object3D): THREE.Box3 =>
  boundsOf(
    body,
    "sink_rim_front",
    "sink_rim_back",
    "sink_rim_left",
    "sink_rim_right",
  );

describe("the sink is centred on its worktop at every declared cabinet depth", () => {
  // ADR 0098 decision 7 criterion 1, and the whole reason this file exists. It fails on the code
  // that shipped wave 6K — 130 mm at 600 against 180 at 700 — because the assembly was seated at a
  // flat local `z = 0` while the worktop grew fore and aft around it.
  it("leaves one declared clearance of worktop in front of the bowl", () => {
    for (const { cabinetDepthMm, what, body } of sweptSinkBodies()) {
      expect({
        what,
        cabinetDepthMm,
        clearanceMm: worktopFrontMm(body) - apertureFrontMm(body),
      }).toEqual({ what, cabinetDepthMm, clearanceMm: FRONT_CLEARANCE_MM });
    }
  });

  // Criterion 2: the owner's other sentence — *"the gap should become bigger behind — so between
  // the wall and the sink and faucet."* Measured to the **faucet**, not to the bowl: the escutcheon
  // sits on the rim's back flange and is the rearmost thing in the assembly, so it is what the gap
  // is actually limited by. It fails on today's code at 600, where it is 2 mm.
  it("clears the wall behind the faucet by the whole of the added depth", () => {
    for (const { cabinetDepthMm, what, body } of sweptSinkBodies()) {
      const gapMm = mm(boundsOf(body, "faucet").min.z) - worktopBackMm(body);

      expect({ what, cabinetDepthMm, gapMm }).toEqual({
        what,
        cabinetDepthMm,
        gapMm: cabinetDepthMm - FAUCET_MEETS_THE_WALL_AT_MM,
      });
      expect(gapMm, `${what} at ${String(cabinetDepthMm)} mm`).toBeGreaterThan(
        0,
      );
    }
  });

  // Criterion 3: the owner's word "centred", as a literal at the one depth it is a ruling about.
  // Stated as the two clearances being equal rather than as a coordinate, because the coordinate is
  // the derived seat and a test of a derivation against itself proves nothing.
  it("splits the declared 600 mm worktop evenly around the aperture", () => {
    const measured: string[] = [];

    for (const { cabinetDepthMm, what, body } of sweptSinkBodies()) {
      if (cabinetDepthMm !== DEPTH_THE_CENTRING_IS_RULED_AT_MM) continue;
      measured.push(what);

      expect({
        what,
        inFrontMm: worktopFrontMm(body) - apertureFrontMm(body),
      }).toEqual({
        what,
        inFrontMm: apertureBackMm(body) - worktopBackMm(body),
      });
    }

    // **The `continue` above is why this line exists** (ADR 0093 decision 1). The loop asserts
    // nothing on the day `DEPTH_THE_CENTRING_IS_RULED_AT_MM` leaves the declared map, and a suite
    // that quietly stops asking its question is the failure that discipline is about. Both sink
    // body the sweep builds at that depth is measured, each under its own distinct name, so
    // measuring one twice cannot stand in for measuring them all.
    expect(declaredCabinetDepthsMm()).toContain(
      DEPTH_THE_CENTRING_IS_RULED_AT_MM,
    );
    expect(measured.length).toBe(1 + CATALOGUE_SINK_WIDTHS_MM.length);
    expect(new Set(measured).size).toBe(measured.length);
  });

  // Criterion 4: the bowl fills the hole. Both edges of both, at every declared depth — a seat
  // applied to the assembly and not to the stone around it (or the other way round) leaves the bowl
  // floating over solid worktop, which is the failure a front-clearance check alone would miss.
  it("lands the rim exactly on the edges of the hole cut for it", () => {
    for (const { cabinetDepthMm, what, body } of sweptSinkBodies()) {
      const rim = rimBounds(body);

      expect({
        what,
        cabinetDepthMm,
        rimFrontMm: mm(rim.max.z),
        rimBackMm: mm(rim.min.z),
        apertureDepthMm: apertureFrontMm(body) - apertureBackMm(body),
      }).toEqual({
        what,
        cabinetDepthMm,
        rimFrontMm: apertureFrontMm(body),
        rimBackMm: apertureBackMm(body),
        apertureDepthMm: APERTURE_DEPTH_MM,
      });
    }
  });

  // Criterion 5, and what keeps this a render-only change: the worktop is still the front-most and
  // the back-most thing in the body, so `base-sink`'s `occupiedDepth` declaration and
  // `baseFinishedDepthMm` are unchanged and no stored document is migrated. A rim that reached the
  // stone's front edge, or a faucet that crossed the wall plane, would silently redefine what the
  // domain says this body finishes at.
  it("keeps the whole assembly strictly inside the worktop's own envelope", () => {
    for (const { cabinetDepthMm, what, body } of sweptSinkBodies()) {
      const stone = boundsOf(
        body,
        "countertop_front",
        "countertop_back",
        "countertop_side",
      );
      const assembly = new THREE.Box3()
        .union(rimBounds(body))
        .union(boundsOf(body, "faucet"));

      expect({
        what,
        cabinetDepthMm,
        bodyFrontMm: mm(new THREE.Box3().setFromObject(body).max.z),
        bodyBackMm: mm(new THREE.Box3().setFromObject(body).min.z),
      }).toEqual({
        what,
        cabinetDepthMm,
        bodyFrontMm: mm(stone.max.z),
        bodyBackMm: mm(stone.min.z),
      });
      expect(mm(assembly.max.z), `${what} front`).toBeLessThan(mm(stone.max.z));
      expect(mm(assembly.min.z), `${what} back`).toBeGreaterThan(
        mm(stone.min.z),
      );
    }
  });

  // **Criterion 6, and the hole this file had**: the two slabs flanking the aperture were only ever
  // measured inside a union with the front and back ones, whose edges are the stone's own — so
  // freezing them while the aperture moved would leave a visible slot in the worktop and every
  // assertion above would still pass. Recorded in `docs/STATUS.md` on 2026-09-08 and closed here.
  //
  // Stated as the three slabs **tiling** the stone with no gap and no overlap, rather than as
  // coordinates: the side pieces must start exactly where the back one ends and end exactly where
  // the front one begins, at every declared depth. Measured 2026-09-08, the span really does move —
  // `[-180, 220]` at 600 and `[-130, 270]` at 700 — so a slab left behind is caught by the setting
  // it failed to follow rather than by a literal that would need re-baselining.
  it("moves the slabs beside the aperture with it, leaving no slot in the stone", () => {
    for (const { cabinetDepthMm, what, body } of sweptSinkBodies()) {
      const side = boundsOf(body, "countertop_side");

      expect({
        what,
        cabinetDepthMm,
        sideBackMm: mm(side.min.z),
        sideFrontMm: mm(side.max.z),
      }).toEqual({
        what,
        cabinetDepthMm,
        sideBackMm: apertureBackMm(body),
        sideFrontMm: apertureFrontMm(body),
      });
    }
  });

  // ADR 0098 decision 5's split, asserted rather than left to code review: the seat belongs to the
  // caller that composes the assembly onto a worktop, and `sink-faucet` is also offered standalone
  // in the parts list, where there is no worktop for a clearance to be measured against. A seat
  // baked into the builder would move a body that has nothing to be centred on.
  it("leaves the standalone sink-and-faucet part unseated at every depth", () => {
    for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
      const standalone = kitAt(cabinetDepthMm).builders["sink-faucet"]();
      standalone.updateWorldMatrix(true, true);

      expect({
        cabinetDepthMm,
        rimFrontMm: mm(rimBounds(standalone).max.z),
        rimBackMm: mm(rimBounds(standalone).min.z),
      }).toEqual({
        cabinetDepthMm,
        rimFrontMm: APERTURE_DEPTH_MM / 2,
        rimBackMm: -APERTURE_DEPTH_MM / 2,
      });
    }
  });
});
