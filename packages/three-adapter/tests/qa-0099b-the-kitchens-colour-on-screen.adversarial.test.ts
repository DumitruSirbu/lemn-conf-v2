// **Independent adversarial QA of the scene-colour wave** — ADR 0099 Amendment A section 3,
// `PlacementRecord.drawnFinish`, and the repaint signature that carries it.
//
// The wave was gated by its own author's tests. This file attacks the same claims from the outside,
// and it was written against one specific worry the wave itself raised: **its author found one of
// its acceptance criteria vacuous.** *"A cabinet that chose nothing renders the material's default"*
// stayed green with the renderer skipping following cabinets entirely, because melamine's declared
// default (*Alb*) is the exact hex M1 gave `kit.M.door`. A veneer witness was added beside it.
//
// **That coincidence is three-way, not two-way**, and the third arm was not witnessed anywhere:
// `pal.alb` is `#eceeeb`, `kit.M.door` is `#eceeeb`, **and MDF's declared `defaultFinish` is the
// free colour `#eceeeb`** (`materials.ts`, `MDF_DEFAULT_COLOUR`). So a hex assertion cannot tell
// *painted white* from *not painted at all* on **two** of the three shipped materials, and the
// melamine test is still vacuous today — it passes with `derivePlacementRecords` reverted to
// `placement.body.finish`, measured.
//
// **The witness this file uses instead is the material instance, and it is total over the palette.**
// A front that was never painted keeps the shared `kit.M.door` (or `kit.M.oak`) instance its builder
// assigned; a painted one wears a **clone** (`finishes.ts`, `buildFinishMaterial`), whatever the
// clone's colour is. `expect(front.material).not.toBe(kit.M.door)` is therefore red under the
// original defect on melamine and on MDF as well as on veneer, and it does not care whether two
// declared hexes ever coincide again. Every colour claim below is asserted as *hex **and** instance
// **and** texture map*, so no future edit to either table can make one of them vacuous silently.
//
// **What else it goes after, each because the author's own file cannot reach it:**
//
// - **Precedence at the scene, exhaustively.** Every declared material × every finish that material
//   offers × five precedence states (chose / never chose / chose then cleared / chose the value the
//   kitchen holds / kitchen set then unset). The author's file asserts three states on one material
//   with three hand-picked decors, and MDF — the one material whose control is not a palette — never
//   reaches the scene there at all.
// - **The repaint signature, past two syncs.** The author's two repaint tests both run exactly two
//   syncs and both move a colour between two set values. This runs three; sets then clears; sets the
//   *same* value twice; moves the kitchen onto a colour a cabinet already chose for itself; and
//   interleaves the change with an insert.
// - **The two families `canFinish: false` now holds**, on the real bodies that declare it, with a
//   global colour set — a structural corner that takes the kitchen's colour and two appliances that
//   take none (owner's ruling, 2026-09-09; backlog entry 60). It read as one class until then.
// - **The absence path.** An undeclared `materialTierId` (with and without a kitchen colour) and a
//   design carrying no `settings` container at all. `resolvedFinishOf` answers `undefined` for the
//   first, and the scene must draw something rather than throw.
// - **Key absence from the scene's side.** Inserts, resizes and swaps driven through the real
//   commands and the real probe under a kitchen colour, asserting `"finish" in body === false` on
//   every cabinet that never chose — a value assertion stays green while the key is being stamped,
//   which is the whole failure mode `drawnFinish` exists to avoid.
import {
  deriveColumns,
  derivePlacementRecords,
  freeColourFinish,
  insertBody,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  materialById,
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  recomputeVoids,
  removePlacement,
  setWidth,
  withCurrentFullHeightMembers,
  type Column,
  type Design,
  type DesignPlacement,
  type Finish,
  type Material,
  type PaletteEntryId,
  type PlacementRecord,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-08T12:00:00.000Z";

/** **Every declared decor's drawn hex, and whether it is drawn on the wood.** Written out rather
 *  than imported from `finishes.ts`, for the reason that file's own sibling states: a constant read
 *  from the table under test agrees with whatever that table says. `isWood` is here for the same
 *  reason — it decides which of the kit's two shared materials the clone came from, and that is the
 *  assertion the hexes alone cannot make. */
const DRAWN: Readonly<
  Record<PaletteEntryId, { readonly hex: string; readonly isWood: boolean }>
> = {
  "pal.alb": { hex: "#eceeeb", isWood: false },
  "pal.stejar-bardolino": { hex: "#d8b483", isWood: true },
  "pal.stejar-halifax": { hex: "#b09272", isWood: true },
  "pal.antracit": { hex: "#2b2d30", isWood: false },
  "pal.gri-havanna": { hex: "#9a938a", isWood: false },
  "pal.nuc-warmia": { hex: "#8a5c3b", isWood: true },
  "veneer.stejar": { hex: "#cba173", isWood: true },
  "veneer.nuc": { hex: "#6f4630", isWood: true },
};

/** The kit's own door hex, stated as the **premise** of the coincidence this file was written
 *  around rather than read off the kit: if M1's white ever moves, the sweep below still holds and
 *  this one assertion is what says the coincidence has gone. */
const KIT_DOOR_HEX = "#eceeeb";

/** MDF's control is a picker, so it offers no entry to enumerate. Two free colours stand in for its
 *  palette in every sweep — one that is nowhere near the kit's white, and **one that is exactly the
 *  kit's white**, which is the value a hex assertion cannot tell from an unpainted front. */
const MDF_FREE_COLOURS: readonly Finish[] = [
  freeColourFinish("#3f5c2a"),
  freeColourFinish("#eceeeb"),
];

/** A placement that draws fronts and can wear a colour. */
const FINISHABLE_ID = "p1";
/** A second, so "this body repainted" and "every body repainted" are distinguishable. */
const SECOND_FINISHABLE_ID = "p8";
/** **`p25`, `base-corner-x-900`** — structural cabinetry, so it wears the kitchen's colour, and it
 *  draws a front, which is what makes that observable rather than vacuous (ADR 0093 decision 1).
 *
 *  **It chooses as well as follows, since the owner's corner ruling of 2026-09-09.** It carried
 *  `canFinish: false` for the first half of that day and every claim below was written under it;
 *  what changed is only the last one, where a colour on its own document is now what it draws rather
 *  than something to ignore. The two appliances — `p7` and `p13` — draw no fronts at all, so every
 *  claim about *them* is made on `drawnFinish` in the domain instead. */
const STRUCTURAL_ID = "p25";

let kit: Kit;
let room: THREE.Object3D;
let solidsRoot: THREE.Group;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
});

// ---------------------------------------------------------------------------------------------
// Designs, stated the way the store holds them.

/** Every finish a declared material offers, as values a sweep can draw from. A RAL picker offers no
 *  palette entry, so MDF contributes free colours rather than an empty list — otherwise a sweep
 *  "over all three materials" would silently skip the one whose control differs most. */
function offeredFinishesOf(material: Material): readonly Finish[] {
  if (material.colourControl.shape === "ral-picker") return MDF_FREE_COLOURS;
  return paletteEntriesOf(material).map((entry) =>
    paletteFinish(entry.entryId),
  );
}

/** The seeded kitchen on a stated material, with **no cabinet carrying a colour of its own** — the
 *  state every document written before ADR 0099 is in, and the state the feature is for. */
function followingOn(materialTierId: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
    placements: KITCHEN_L_DESIGN.placements.map(withNoFinishOfItsOwn),
  };
}

function withNoFinishOfItsOwn(placement: DesignPlacement): DesignPlacement {
  const body = { ...placement.body };
  delete body.finish;
  return { ...placement, body };
}

function withKitchenColour(design: Design, finish: Finish): Design {
  return { ...design, settings: { ...design.settings, finish } };
}

/** The kitchen's colour **removed**, not set to `undefined`: the two round-trip differently, and
 *  `resolvedDefaultFinishOf` reads absence. */
function withoutKitchenColour(design: Design): Design {
  const settings = { ...design.settings };
  delete settings.finish;
  return { ...design, settings };
}

function wearingOn(design: Design, id: string, finish: Finish): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === id
        ? { ...placement, body: { ...placement.body, finish } }
        : placement,
    ),
  };
}

/** ADR 0099 decision 8's *"follow the kitchen's colour"*, at the document level: the key is deleted,
 *  never set to the value it was showing. */
function clearedOn(design: Design, id: string): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === id ? withNoFinishOfItsOwn(placement) : placement,
    ),
  };
}

/** Trimmed to the bodies each sweep actually asserts on, so an exhaustive sweep over three materials
 *  and every colour each offers stays inside the suite's own runtime. Nothing about the colour rule
 *  is per-design: `derivePlacementRecords` resolves each placement against the same `settings`. */
function onlyTheseBodies(design: Design, ids: readonly string[]): Design {
  return {
    ...design,
    placements: design.placements.filter((placement) =>
      ids.includes(placement.id),
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// The chain the browser runs, in the order it runs it.

function drawn(design: Design): void {
  syncSolidBodies({
    kit,
    solidsRoot,
    records: derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
  });
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

function singleMaterialOf(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
  const material = mesh.material;
  if (Array.isArray(material)) {
    throw new Error(`Mesh "${mesh.name}" carries a material array`);
  }
  return material as THREE.MeshStandardMaterial;
}

function colourOf(mesh: THREE.Mesh): string {
  return `#${singleMaterialOf(mesh).color.getHexString()}`;
}

/** What a finish must look like once drawn — hex, and which of the kit's two shared materials the
 *  clone came from. Free colours are always flat over `M.door` (`finishes.ts`'s `flatColour`). */
function expectedDrawing(finish: Finish): {
  readonly hex: string;
  readonly isWood: boolean;
} {
  if (finish.kind === "free-colour") {
    return { hex: finish.value, isWood: false };
  }
  const declared = DRAWN[finish.entryId];
  return { hex: declared.hex, isWood: declared.isWood };
}

/**
 * **Every front of this body is wearing this finish**, asserted three ways at once.
 *
 * The hex alone is not enough and that is the whole point of this file: `pal.alb`, MDF's declared
 * default and `kit.M.door` are one hex, so on two of three materials a hex assertion is satisfied by
 * a renderer that painted nothing. The instance check is what distinguishes them — a painted front
 * wears a clone — and the map check says which kit material the clone came from, so a wood and a
 * flat colour of the same value could not be swapped either.
 */
function expectWearing(placementId: string, finish: Finish): void {
  const expected = expectedDrawing(finish);
  const fronts = frontsOf(mounted(placementId));
  expect(fronts.length).toBeGreaterThan(0);
  for (const front of fronts) {
    const material = singleMaterialOf(front);
    expect(colourOf(front)).toBe(expected.hex);
    expect(material).not.toBe(kit.M.door);
    expect(material).not.toBe(kit.M.oak);
    expect(material.map).toBe(expected.isWood ? kit.M.oak.map : null);
  }
}

/** **Nothing was painted here**: every front still carries the kit's own shared door material, by
 *  instance. The claim `qa-0099-the-scene-does-not-resolve` had to give up for a following cabinet,
 *  which is still exactly right for a cabinet that must never be painted at all. */
function expectUnpainted(placementId: string): void {
  const fronts = frontsOf(mounted(placementId));
  expect(fronts.length).toBeGreaterThan(0);
  for (const front of fronts) expect(front.material).toBe(kit.M.door);
}

// ---------------------------------------------------------------------------------------------

describe("the coincidence this file is written around", () => {
  /** Stated as a premise rather than assumed. If a future edit moves either value, the melamine and
   *  MDF hex assertions elsewhere in this package stop being vacuous and this test is where the
   *  change is noticed. */
  it("still has melamine's default, MDF's default and the kit's own door on one hex", () => {
    expect(`#${kit.M.door.color.getHexString()}`).toBe(KIT_DOOR_HEX);
    expect(
      expectedDrawing(materialById("material.melamine").defaultFinish).hex,
    ).toBe(KIT_DOOR_HEX);
    expect(
      expectedDrawing(materialById("material.painted-mdf").defaultFinish).hex,
    ).toBe(KIT_DOOR_HEX);
    // Veneer's is the one that differs, which is why the author's witness had to be a veneer one.
    expect(
      expectedDrawing(materialById("material.veneer").defaultFinish).hex,
    ).not.toBe(KIT_DOOR_HEX);
  });

  /** **The non-vacuous form of acceptance criterion 3, on the two materials where the hex form is
   *  vacuous.** A following cabinet on a kitchen with no colour set must be *painted* in the
   *  material's declared default, not merely *left looking like it*. Under the original defect the
   *  front keeps `kit.M.door` by instance, so this is red for melamine and for MDF as well as for
   *  veneer — where the published hex assertion is red for veneer alone. */
  it.each(MATERIALS.map((material) => material.materialId))(
    "paints a following cabinet on a %s kitchen rather than leaving the kit's own material on it",
    (materialTierId) => {
      drawn(
        withoutKitchenColour(
          onlyTheseBodies(followingOn(materialTierId), [FINISHABLE_ID]),
        ),
      );

      expectWearing(FINISHABLE_ID, materialById(materialTierId).defaultFinish);
    },
  );
});

// **Precedence at the scene, over every material and every colour each of them offers.**
//
// Exhaustive rather than sampled: the three materials declare a closed set of eight palette entries
// between them, so the whole space is enumerable and a property test would only be a slower way of
// covering less of it. MDF's picker has no closed set, so it contributes two free colours, one of
// which is the kit's own white on purpose.
describe("ADR 0099 decision 1 — the order, drawn, for every material and every colour", () => {
  const CASES = MATERIALS.flatMap((material) =>
    offeredFinishesOf(material).map(
      (finish) => [material.materialId, finish] as const,
    ),
  );

  it.each(CASES)(
    "on %s, draws a cabinet's own %j over the kitchen's colour",
    (materialTierId, finish) => {
      const kitchenColour = anotherOfferedFinish(materialTierId, finish);
      drawn(
        wearingOn(
          withKitchenColour(
            onlyTheseBodies(followingOn(materialTierId), [FINISHABLE_ID]),
            kitchenColour,
          ),
          FINISHABLE_ID,
          finish,
        ),
      );

      expectWearing(FINISHABLE_ID, finish);
    },
  );

  it.each(CASES)(
    "on %s, draws a cabinet that never chose in the kitchen's %j",
    (materialTierId, finish) => {
      drawn(
        withKitchenColour(
          onlyTheseBodies(followingOn(materialTierId), [FINISHABLE_ID]),
          finish,
        ),
      );

      expectWearing(FINISHABLE_ID, finish);
    },
  );

  /** ADR 0099 decision 5 row 3: clearing **deletes the key**, so the cabinet falls back to the
   *  kitchen's colour — never to the value it happened to be showing. */
  it.each(CASES)(
    "on %s, draws a cabinet that chose and then cleared in the kitchen's %j",
    (materialTierId, finish) => {
      const own = anotherOfferedFinish(materialTierId, finish);
      const chosen = wearingOn(
        withKitchenColour(
          onlyTheseBodies(followingOn(materialTierId), [FINISHABLE_ID]),
          finish,
        ),
        FINISHABLE_ID,
        own,
      );

      drawn(chosen);
      expectWearing(FINISHABLE_ID, own);

      drawn(clearedOn(chosen, FINISHABLE_ID));
      expectWearing(FINISHABLE_ID, finish);
    },
  );

  /** A cabinet that explicitly chose the colour the kitchen already holds is *still* an overriding
   *  cabinet, and it must draw the same as one that is merely following — the document tells them
   *  apart, the scene does not. */
  it.each(CASES)(
    "on %s, draws the same %j whether the cabinet chose it or the kitchen holds it",
    (materialTierId, finish) => {
      const base = onlyTheseBodies(followingOn(materialTierId), [
        FINISHABLE_ID,
      ]);

      drawn(withKitchenColour(base, finish));
      expectWearing(FINISHABLE_ID, finish);

      drawn(wearingOn(withKitchenColour(base, finish), FINISHABLE_ID, finish));
      expectWearing(FINISHABLE_ID, finish);
    },
  );

  /** The kitchen's colour set and then taken away again — the third level arriving from above
   *  rather than from a fresh document. */
  it.each(CASES)(
    "on %s, falls back to the material's declared default when the kitchen's %j is unset",
    (materialTierId, finish) => {
      const base = onlyTheseBodies(followingOn(materialTierId), [
        FINISHABLE_ID,
      ]);

      drawn(withKitchenColour(base, finish));
      expectWearing(FINISHABLE_ID, finish);

      drawn(withoutKitchenColour(base));
      expectWearing(FINISHABLE_ID, materialById(materialTierId).defaultFinish);
    },
  );

  /** A second offered finish of the same material, so a "cabinet's own beats the kitchen's" case is
   *  never asserted with the two levels holding the same value. */
  function anotherOfferedFinish(materialTierId: string, avoid: Finish): Finish {
    const offered = offeredFinishesOf(materialById(materialTierId));
    const other = offered.find(
      (candidate) => JSON.stringify(candidate) !== JSON.stringify(avoid),
    );
    if (!other) throw new Error(`${materialTierId} offers only one finish`);
    return other;
  }
});

// **The repaint signature, attacked past the two syncs the wave's own tests run.**
//
// `syncSolidBodies` keeps a mounted body whose signature still matches, materials and all, so the
// signature is the only thing that decides whether a colour change reaches the screen. Every case
// below is a sequence the author's file does not run.
describe("ADR 0099 decision 5 row 1 — the repaint, over sequences of more than two syncs", () => {
  const MELAMINE = "material.melamine";
  const ANTRACIT = paletteFinish("pal.antracit");
  const HAVANNA = paletteFinish("pal.gri-havanna");
  const NUC = paletteFinish("pal.nuc-warmia");
  const ALB = paletteFinish("pal.alb");

  function followingKitchen(): Design {
    return onlyTheseBodies(followingOn(MELAMINE), [
      FINISHABLE_ID,
      SECOND_FINISHABLE_ID,
    ]);
  }

  it("repaints on the third change as it did on the first", () => {
    const base = followingKitchen();

    drawn(withKitchenColour(base, ANTRACIT));
    expectWearing(FINISHABLE_ID, ANTRACIT);
    const first = mounted(FINISHABLE_ID);

    drawn(withKitchenColour(base, HAVANNA));
    expectWearing(FINISHABLE_ID, HAVANNA);
    const second = mounted(FINISHABLE_ID);
    expect(second).not.toBe(first);

    drawn(withKitchenColour(base, NUC));
    expectWearing(FINISHABLE_ID, NUC);
    expect(mounted(FINISHABLE_ID)).not.toBe(second);
  });

  /** The kitchen's colour taken away entirely, which is not a move between two set values and is
   *  what a signature that only noticed "the value changed" over set values would miss. */
  it("repaints back to the material's default when the kitchen's colour is cleared", () => {
    const base = followingKitchen();

    drawn(withKitchenColour(base, NUC));
    const before = mounted(FINISHABLE_ID);
    expectWearing(FINISHABLE_ID, NUC);

    drawn(withoutKitchenColour(base));

    expect(mounted(FINISHABLE_ID)).not.toBe(before);
    expectWearing(FINISHABLE_ID, materialById(MELAMINE).defaultFinish);
  });

  /** **The negative case, and the one the author's twin does not cover**: the kitchen's colour is
   *  re-applied at the value it already held. Nothing about any cabinet's drawing changed, so the
   *  scene must keep every instance — a fix that re-mounted on every settings write would pass every
   *  positive test above and fail here. */
  it("keeps every instance when the kitchen's colour is set to the value it already held", () => {
    const base = withKitchenColour(followingKitchen(), HAVANNA);

    drawn(base);
    const first = mounted(FINISHABLE_ID);
    const second = mounted(SECOND_FINISHABLE_ID);

    drawn(withKitchenColour(followingKitchen(), HAVANNA));

    expect(mounted(FINISHABLE_ID)).toBe(first);
    expect(mounted(SECOND_FINISHABLE_ID)).toBe(second);
  });

  /** The kitchen's colour moved **onto** the colour one cabinet already chose for itself. That
   *  cabinet's drawing does not move and must keep its instance; its neighbour's does move and must
   *  not. Both halves in one sync, so a scene that re-mounts everything and a scene that re-mounts
   *  nothing both fail. */
  it("repaints the follower and keeps the overrider when the kitchen adopts the overrider's colour", () => {
    const chosen = wearingOn(followingKitchen(), FINISHABLE_ID, ANTRACIT);

    drawn(withKitchenColour(chosen, HAVANNA));
    const overrider = mounted(FINISHABLE_ID);
    const follower = mounted(SECOND_FINISHABLE_ID);
    expectWearing(FINISHABLE_ID, ANTRACIT);
    expectWearing(SECOND_FINISHABLE_ID, HAVANNA);

    drawn(withKitchenColour(chosen, ANTRACIT));

    expect(mounted(FINISHABLE_ID)).toBe(overrider);
    expect(mounted(SECOND_FINISHABLE_ID)).not.toBe(follower);
    expectWearing(FINISHABLE_ID, ANTRACIT);
    expectWearing(SECOND_FINISHABLE_ID, ANTRACIT);
  });

  /** A change that alters `settings.finish` and **nothing else** — every placement passed through by
   *  reference, which is the shape `setGlobalFinish` is structurally constrained to produce
   *  (ADR 0099 decision 2). If the repaint needed anything on a placement to have moved, this is the
   *  case that proves it, and it is the only case the customer ever actually creates. */
  it("repaints although every placement object is the identical instance it was", () => {
    const base = withKitchenColour(followingKitchen(), ANTRACIT);
    const onlySettingsMoved: Design = {
      ...base,
      settings: { ...base.settings, finish: HAVANNA },
    };
    for (const [index, placement] of onlySettingsMoved.placements.entries()) {
      expect(placement).toBe(base.placements[index]);
    }

    drawn(base);
    const before = mounted(FINISHABLE_ID);

    drawn(onlySettingsMoved);

    expect(mounted(FINISHABLE_ID)).not.toBe(before);
    expectWearing(FINISHABLE_ID, HAVANNA);
  });

  /** A colour change arriving in the same sync as a body that vanished: the survivor repaints and
   *  the removed body is gone, so a sync that took "the record set changed" as licence to skip the
   *  per-body comparison would show a stale colour on the survivor. */
  it("repaints a survivor in the same sync that removes its neighbour", () => {
    const base = followingKitchen();

    drawn(withKitchenColour(base, ANTRACIT));
    const before = mounted(FINISHABLE_ID);

    drawn(withKitchenColour(onlyTheseBodies(base, [FINISHABLE_ID]), ALB));

    expect(
      solidsRoot.children.filter(
        (child) => child.userData["placementId"] === SECOND_FINISHABLE_ID,
      ),
    ).toHaveLength(0);
    expect(mounted(FINISHABLE_ID)).not.toBe(before);
    expectWearing(FINISHABLE_ID, ALB);
  });
});

// **A body that cannot *choose* a colour — and which of the two things that now means.**
//
// This block asserted ADR 0099 acceptance 8 over `!record.canFinish` as one class. The owner's ruling
// of 2026-09-09 (backlog entry 60) split that class: `base-corner-x-900` is structural cabinetry and
// **takes** the kitchen's colour, while a hood and a fridge take none — and all of them still carry
// `canFinish: false`, because following is not choosing and none of them gains a control.
//
// The sweep over the flag is therefore gone: it would assert the wrong rule for five of the seven
// bodies it covered. `qa-0099c-each-unchoosing-body-by-name.adversarial.test.ts` states the claim per
// body, which is the shape a split class needs. What is kept here is the half this file's own witness
// can still see.
describe("backlog 60 — a structural body follows the kitchen where its appliance neighbours do not", () => {
  const ANTRACIT = paletteFinish("pal.antracit");

  /** Every seeded body that carries no drawn colour at all — the two appliances, since the ruling.
   *  Read off the record rather than off a build-id list, so a body moved between the two families in
   *  the catalogue changes what is swept here instead of leaving a stale set behind. */
  function unpaintedIds(): readonly string[] {
    return derivePlacementRecords(
      withKitchenColour(followingOn("material.melamine"), ANTRACIT),
      KITCHEN_L_BODY_CATALOG,
    )
      .filter((record: PlacementRecord) => record.drawnFinish === undefined)
      .map((record) => record.id);
  }

  it("draws no colour for exactly the two appliances, and one for the structural corner", () => {
    expect([...unpaintedIds()].sort()).toEqual(["p13", "p7"]);
    expect(unpaintedIds()).not.toContain(STRUCTURAL_ID);
  });

  it("paints the structural corner the kitchen's colour beside a finishable neighbour", () => {
    drawn(withKitchenColour(followingOn("material.melamine"), ANTRACIT));

    expectWearing(STRUCTURAL_ID, ANTRACIT);
    // The premise: an ordinary cabinet in the same scene took the same colour, so this is the
    // kitchen's colour reaching the corner and not a scene that painted everything by accident.
    expectWearing(FINISHABLE_ID, ANTRACIT);
  });

  it("leaves every body that draws no colour on the kit's own door material", () => {
    drawn(withKitchenColour(followingOn("material.melamine"), ANTRACIT));

    for (const id of unpaintedIds()) {
      for (const front of frontsOf(mounted(id))) {
        expect(front.material).toBe(kit.M.door);
      }
    }
    expectWearing(FINISHABLE_ID, ANTRACIT);
  });

  /** On veneer the declared default is a tinted wood — the case where "not painted" and "painted
   *  white" are visibly different values, so a following body taking the default cannot pass by
   *  coincidence with the kit's own hex. */
  it("gives a structural body the material's declared default when the kitchen has no colour", () => {
    drawn(withoutKitchenColour(followingOn("material.veneer")));

    const veneerDefault = materialById("material.veneer").defaultFinish;
    expectWearing(STRUCTURAL_ID, veneerDefault);
    expectWearing(FINISHABLE_ID, veneerDefault);
  });

  /** **A colour on a corner's own document is what gets drawn**, over the kitchen's — the owner's
   *  corner ruling of 2026-09-09, and the exact reversal of what this test asserted before it. The
   *  corner is on `chooses-its-own-colour` now, so §5.5's order applies to it unchanged.
   *
   *  Two bodies, not one: the neighbour in the same scene stays on the kitchen's colour, so this is
   *  *that* corner overriding rather than a scene that stopped following the kitchen. */
  it("draws a corner's own colour over the kitchen's, and only on that corner", () => {
    const NUC_WARMIA = paletteFinish("pal.nuc-warmia");
    drawn(
      wearingOn(
        withKitchenColour(followingOn("material.melamine"), ANTRACIT),
        STRUCTURAL_ID,
        NUC_WARMIA,
      ),
    );

    expectWearing(STRUCTURAL_ID, NUC_WARMIA);
    expectWearing(FINISHABLE_ID, ANTRACIT);
  });
});

// **The absence path.** `resolvedFinishOf` answers `undefined` for a design whose `materialTierId`
// names no declared material and whose kitchen has no colour (ADR 0078 decision 3) — a state that
// loads rather than being refused, and that wave 6G's recovery depends on. The scene must draw
// something sane for it rather than throw.
describe("ADR 0099 decision 1 — what the scene does when the resolver has no answer", () => {
  const UNDECLARED = "material.laminate";
  const ANTRACIT = paletteFinish("pal.antracit");

  it("mounts every body and paints none when the material is undeclared and the kitchen bare", () => {
    const design = withoutKitchenColour(followingOn(UNDECLARED));

    expect(() => {
      drawn(design);
    }).not.toThrow();

    expect(solidsRoot.children.length).toBe(design.placements.length);
    expectUnpainted(FINISHABLE_ID);
  });

  /** The middle level does not need the bottom one: an undeclared material declares no default, but
   *  a kitchen colour is still a colour and must reach the screen. */
  it("still draws the kitchen's colour on a design whose material is undeclared", () => {
    drawn(withKitchenColour(followingOn(UNDECLARED), ANTRACIT));

    expectWearing(FINISHABLE_ID, ANTRACIT);
  });

  /** No `settings` container at all — the shape `DesignSchema` admits, since `settings` is optional.
   *  `materialOfDesign` deems it PAL, so the scene draws PAL's declared default rather than nothing. */
  it("draws PAL's declared default for a design carrying no settings container", () => {
    const bare: Design = { ...followingOn("material.melamine") };
    delete (bare as { settings?: unknown }).settings;

    expect(() => {
      drawn(bare);
    }).not.toThrow();

    expectWearing(
      FINISHABLE_ID,
      materialById("material.melamine").defaultFinish,
    );
  });

  /** Going from no answer to an answer must repaint: a signature that signed `""` for both an absent
   *  drawn colour and a present one would strand the recovered kitchen on the kit's white. */
  it("repaints when an undeclared material is corrected to a declared one", () => {
    drawn(withoutKitchenColour(followingOn(UNDECLARED)));
    const before = mounted(FINISHABLE_ID);
    expectUnpainted(FINISHABLE_ID);

    drawn(withoutKitchenColour(followingOn("material.veneer")));

    expect(mounted(FINISHABLE_ID)).not.toBe(before);
    expectWearing(FINISHABLE_ID, materialById("material.veneer").defaultFinish);
  });
});

// **The key-absence guarantee, from the scene's side.**
//
// The document-level half is the domain's shuffled property. What no domain test can say is that the
// *drawn* colour and the *absent key* hold together through the commands that rebuild bodies through
// `carriedAppearance` — run here against the **real** builders and the **real** probe, which is what
// decides what a customer's insert actually produces.
describe("ADR 0099 decision 2 — commands under a kitchen colour grow no finish key", () => {
  const ANTRACIT = paletteFinish("pal.antracit");
  const TOP_ROW_ID = "p19";
  const TOP_ROW_COLUMN = "A|2.60";
  const TOP_ROW_VOID_Y0_M = 2.2;

  interface World {
    readonly design: Design;
    readonly columns: ReadonlyMap<string, Column>;
    readonly voids: readonly VoidRecord[];
  }

  function loadWorld(design: Design): World {
    const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
    const columns = deriveColumns(records, {}, design.room);
    return { design, columns, voids: recomputeVoids(records, columns) };
  }

  function advance(world: World, design: Design): World {
    const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
    return {
      design,
      columns: withCurrentFullHeightMembers(world.columns, records),
      voids: recomputeVoids(records, world.columns),
    };
  }

  function deleteBody(world: World, placementId: string): World {
    const result = removePlacement({
      design: world.design,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: placementId },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) {
      throw new Error(`Remove ${placementId} refused: ${result.reason.code}`);
    }
    return advance(world, result.design);
  }

  function insertInto(
    world: World,
    voidId: string,
    buildId: string,
  ): { readonly world: World; readonly placementId: string } {
    const result = insertBody({
      design: world.design,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns: world.columns,
      voids: world.voids,
      target: { kind: "void", id: voidId },
      buildId,
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) {
      throw new Error(`Insert ${buildId} refused: ${result.reason.code}`);
    }
    return {
      world: advance(world, result.design),
      placementId: result.effect.placementId,
    };
  }

  function swapInto(
    world: World,
    placementId: string,
    buildId: string,
  ): { readonly world: World; readonly placementId: string } {
    const result = insertBody({
      design: world.design,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns: world.columns,
      voids: world.voids,
      target: { kind: "placement", id: placementId },
      buildId,
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) {
      throw new Error(`Swap to ${buildId} refused: ${result.reason.code}`);
    }
    return {
      world: advance(world, result.design),
      placementId: result.effect.placementId,
    };
  }

  function resize(world: World, placementId: string, widthMm: number): World {
    const result = setWidth({
      design: world.design,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns: world.columns,
      target: { kind: "placement", id: placementId },
      widthMm,
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) {
      throw new Error(`Resize ${placementId} refused: ${result.reason.code}`);
    }
    return advance(world, result.design);
  }

  function voidAt(world: World, col: string, y0M: number): VoidRecord {
    const found = world.voids.find(
      (record) => record.col === col && Math.abs(record.y0 - y0M) < 0.01,
    );
    if (!found) throw new Error(`No void at ${col} y0=${String(y0M)}`);
    return found;
  }

  /** **Key absence, never a value comparison.** `body.finish === undefined` is satisfied by a key
   *  present and holding `undefined`, which is the state a save round-trips into a stamped colour.
   *  ADR 0099 Amendment A section 1 records that exact distinction. */
  function expectNoCabinetChose(design: Design): void {
    for (const placement of design.placements) {
      expect(
        "finish" in placement.body,
        `placement ${placement.id} grew a finish key`,
      ).toBe(false);
    }
  }

  it("leaves every cabinet keyless and every finishable one drawn in the kitchen's colour, through delete → insert → resize → swap", () => {
    const start = withKitchenColour(followingOn("material.melamine"), ANTRACIT);
    expectNoCabinetChose(start);

    let world = loadWorld(start);
    world = deleteBody(world, TOP_ROW_ID);
    expectNoCabinetChose(world.design);

    const inserted = insertInto(
      world,
      voidAt(world, TOP_ROW_COLUMN, TOP_ROW_VOID_Y0_M).id,
      "wall-cabinet",
    );
    world = inserted.world;
    expectNoCabinetChose(world.design);

    // **`p8`, and shrinking.** Two earlier targets could not carry this step, and the reasons are
    // worth keeping so nobody re-picks them: `p10` is a 300 mm wall body with no free millimetre
    // beside it (`NO_EMPTY_SPACE`), and the body this sequence just inserted stands over a column
    // (`COLUMN_MEMBER_NOT_RESIZABLE`). `p8` is finishable — which is what makes the colour
    // assertions below say anything — and shrinking always has room. What is under test is the
    // sequence, not which body carries it.
    world = resize(world, SECOND_FINISHABLE_ID, 400);
    expectNoCabinetChose(world.design);

    // The swap goes to the body this sequence inserted, not to `p8`: `open-shelf` is offered in the
    // top-row void (it is one of the three the offer list returns there) and refuses `p8`'s column
    // with COLUMN_MISMATCH. Resize and swap therefore act on different bodies, which is fine — the
    // claim is about the sequence, and `expectNoCabinetChose` sweeps every placement after each step.
    const swapped = swapInto(world, inserted.placementId, "open-shelf");
    world = swapped.world;
    expectNoCabinetChose(world.design);

    // The scene half: what the customer sees at the end of that sequence.
    drawn(world.design);
    // The two finishable bodies the sequence actually touched: `p8` went through `setWidth`'s
    // rebuild and `p1` stood still. Both must still be drawn in the kitchen's colour, which is the
    // half `expectNoCabinetChose` cannot see — a rebuild that dropped the resolved colour would
    // leave a keyless cabinet painted the kit's white and pass every assertion above.
    //
    // The swapped body is deliberately not asserted here: `open-shelf` is unfinishable, and what it
    // must do — be painted at neither level — is `acceptance 8`'s own describe block above.
    expectWearing(SECOND_FINISHABLE_ID, ANTRACIT);
    expectWearing(FINISHABLE_ID, ANTRACIT);
  });

  /** A cabinet **inserted after** a global change carries no colour and draws the kitchen's
   *  (acceptance 4), and the body it replaced is not consulted for one. */
  it("draws a freshly inserted cabinet in the kitchen's colour without recording it", () => {
    const world = loadWorld(
      withKitchenColour(
        followingOn("material.veneer"),
        paletteFinish("veneer.nuc"),
      ),
    );
    const emptied = deleteBody(world, TOP_ROW_ID);
    const inserted = insertInto(
      emptied,
      voidAt(emptied, TOP_ROW_COLUMN, TOP_ROW_VOID_Y0_M).id,
      "wall-cabinet",
    );

    const placement = inserted.world.design.placements.find(
      (candidate) => candidate.id === inserted.placementId,
    );
    expect(placement).toBeDefined();
    expect("finish" in (placement?.body ?? {})).toBe(false);

    drawn(inserted.world.design);
    expectWearing(inserted.placementId, paletteFinish("veneer.nuc"));
  });

  /** **The forbidden fix, observed from the scene rather than from the document.** A cabinet that
   *  chose nothing must go on following: after an insert *and* a second global change, it wears the
   *  second colour. Writing the resolved colour into `finishKey` leaves it on the first. */
  it("keeps a cabinet that never chose following across a second kitchen colour after an insert", () => {
    const world = loadWorld(
      withKitchenColour(followingOn("material.melamine"), ANTRACIT),
    );
    const emptied = deleteBody(world, TOP_ROW_ID);
    const inserted = insertInto(
      emptied,
      voidAt(emptied, TOP_ROW_COLUMN, TOP_ROW_VOID_Y0_M).id,
      "wall-cabinet",
    );

    drawn(inserted.world.design);
    const before = mounted(inserted.placementId);

    const repainted = withKitchenColour(
      inserted.world.design,
      paletteFinish("pal.gri-havanna"),
    );
    expectNoCabinetChose(repainted);
    drawn(repainted);

    expect(mounted(inserted.placementId)).not.toBe(before);
    expectWearing(inserted.placementId, paletteFinish("pal.gri-havanna"));
    expectWearing(FINISHABLE_ID, paletteFinish("pal.gri-havanna"));
  });
});
