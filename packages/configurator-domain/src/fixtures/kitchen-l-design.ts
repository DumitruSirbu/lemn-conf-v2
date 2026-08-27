import { INSERTABLE_BODY_DEFINITIONS } from "../catalog.js";
import type { Design, DesignPlacement } from "../design.js";
import type { BodyCatalog, BodyDefinition } from "../void-engine.js";

/**
 * The seeded L-kitchen: every body M1's `builders['kitchen-l']()` renders whole, expressed as
 * individually mounted placements. Excludes the room shell (floor, walls, backsplash,
 * `end_panel_right`), which are not placements — nothing else.
 *
 * `frameDepthMm` values reproduce `kitchen-parts.ts`'s `buildKitchen()` placement coordinates
 * exactly. Each is `2 ×` the body's **wall-normal seat offset** — the distance from its group
 * origin to the wall plane — not a claim about the body's physical depth: several bodies (the hob,
 * the hood) are visually shallower than their `frameDepthMm`, and `base-corner-x-900` is deeper
 * than its own (see `ADR 0025`).
 */

const baseCarcass: Pick<
  BodyDefinition,
  | "band"
  | "canFinish"
  | "canHandle"
  | "canReplace"
  | "canDelete"
  | "fixedWidth"
  | "insertable"
> = {
  band: "base",
  canFinish: true,
  canHandle: true,
  canReplace: true,
  canDelete: true,
  fixedWidth: false,
  // ADR 0011 Gap A: every seeded entry reproduces one already-built body at one measured depth,
  // so it can be loaded but never offered from the catalogue or accepted by `insertBody`.
  insertable: false,
};

const wallCarcass = { ...baseCarcass, band: "wall" as const };
const topCarcass = { ...baseCarcass, band: "top" as const };
const columnCarcass = { ...baseCarcass, band: "column" as const };

/** §13.1: "Corners are structural. No replace, no delete, never a width donor", repeated by §11
 *  row 16 — so a corner body also has no finish and no handle to offer, and the panel renders
 *  none of those sections for it. Shared by the two wall returns and, since ADR 0025, by the two
 *  base legs, which is what makes §11 row 16 reachable at all: it names the *base* corner, and
 *  until the legs became placements there was no base corner to select. `kind` is deliberately
 *  **not** part of this shape — the four bodies that wear it are three different kinds. */
const STRUCTURAL_CORNER: Pick<
  BodyDefinition,
  | "canReplace"
  | "canDelete"
  | "canFinish"
  | "canHandle"
  | "fixedWidth"
  | "structuralReason"
> = {
  canReplace: false,
  canDelete: false,
  canFinish: false,
  canHandle: false,
  fixedWidth: true,
  // With all four capability flags false the panel offers nothing, so it never produces the refusal
  // §11 row 16 requires to explain why. The reason is declared here and rendered as its own section.
  structuralReason: "corner",
};

/** Each `catalogEquivalentId` below was read off the two builder tables in `@lemnaria/three-adapter`
 *  — `decomposed-bodies.ts` for the seeded instance, `catalog-bodies.ts` for the §7 entry — and
 *  points at the entry that builds the *same* body: `base-drawer2-600` is
 *  `baseCabinet(0.6, { drawers: 2 })`, which is exactly what `base-panbank` builds, so the two-drawer
 *  base is the pan bank at 600. Five entries carry no pointer because nothing in §7 builds them:
 *  the hob, and the four corner bodies — §13.1 is explicit that a corner is not a body a customer
 *  chooses, so having no catalogue equivalent is the correct answer for them, not a missing one. */
const SEEDED_BODY_DEFINITIONS: readonly (readonly [string, BodyDefinition])[] =
  [
    // ADR 0025. The two base legs of the L. `frameDepthMm` is the seat, not the depth: the X-leg's
    // carcass is 600 deep but seats at 560/2 = 280 mm off the wall, because the L-joint — not the
    // wall — decides where it stands. The return leg's 580 is both at once.
    [
      "base-corner-x-900",
      {
        ...baseCarcass,
        ...STRUCTURAL_CORNER,
        kind: "corner_base_x",
        frameDepthMm: 560,
      },
    ],
    [
      "base-corner-return-320",
      {
        ...baseCarcass,
        ...STRUCTURAL_CORNER,
        kind: "corner_base_return",
        frameDepthMm: 580,
      },
    ],
    [
      "base-sink-800",
      {
        ...baseCarcass,
        kind: "base_cabinet",
        frameDepthMm: 580,
        catalogEquivalentId: "base-sink",
      },
    ],
    [
      "base-dishwasher-600",
      {
        ...baseCarcass,
        kind: "dishwasher_housing",
        frameDepthMm: 580,
        catalogEquivalentId: "base-dishwasher",
      },
    ],
    [
      "base-drawer2-600",
      {
        ...baseCarcass,
        kind: "base_cabinet",
        frameDepthMm: 580,
        catalogEquivalentId: "base-panbank",
      },
    ],
    [
      "base-drawer3-600",
      {
        ...baseCarcass,
        kind: "base_cabinet",
        frameDepthMm: 580,
        catalogEquivalentId: "base-3drawer",
      },
    ],
    // ADR 0027. The hob-bearing body the seeded kitchen now uses: one placement where `p2` + `p3`
    // used to be two. Same carcass, same 580 mm seat, same 820 mm frame as `base-drawer2-600` —
    // the hob rides on the worktop above all of that and adds nothing to the opening, exactly as
    // `base-sink-800`'s faucet does not (§5.2 judges fit on the carcass, §11 row 7).
    [
      "base-hob-2drawer-600",
      {
        ...baseCarcass,
        kind: "base_cabinet",
        frameDepthMm: 580,
        // ADR 0027: 600 mm in both directions, matching the catalogue entry. `baseCarcass` defaults
        // to `fixedWidth: false` and this row must not inherit it: the hob is a 600 mm appliance and
        // there is no 400 mm one, so §5.4's `canGive` ("not `fixedWidth`") would otherwise let the
        // one cabinet carrying a hob donate width to a neighbour. No symptom before M5 wires §5.4 —
        // a seeded entry has no `sizesMm`, so §9 renders no width chips — which is exactly why it
        // has to be right now rather than when the symptom appears.
        fixedWidth: true,
        // ADR 0027: the hob is built into this body. §5.3's cascade reads this off the **incoming**
        // entry, and ADR 0011 Gap A never lets a seeded id be the incoming one, so nothing consumes
        // it here today. It is declared because it is true of the body: the field says what a body
        // carries, and a body that carries a hob and does not say so is the defect waiting to
        // happen the next time something asks.
        carriesAccessoryKind: "induction_cooktop",
        catalogEquivalentId: "base-hob-2drawer",
      },
    ],
    // ADR 0027 left this entry in place deliberately. Nothing in the seeded design references it
    // any more, but designs saved before the migration still carry a `cooktop-600` placement, and
    // a `buildId` the catalogue cannot resolve is `UnknownBodyError` at load — so removing the row
    // would break exactly the documents the migration was meant to leave alone.
    [
      "cooktop-600",
      {
        ...baseCarcass,
        kind: "induction_cooktop",
        frameDepthMm: 700,
        frameHeightMm: 40,
        canReplace: false,
        canDelete: false,
        // Corrected rather than recorded as a known gap. A hob has no front and no handle, so
        // `baseCarcass`'s `true`/`true` was false of the body either way; today the panel happens
        // to suppress both sections on an accessory, which makes the mismatch cosmetic but does not
        // make it true. These two flags are data, not geometry — the row, its builder arm and the
        // meshes it draws are untouched, so a document persisted before the ADR 0027 migration
        // still loads and renders exactly as it did.
        canFinish: false,
        canHandle: false,
      },
    ],
    [
      "tall-oven-tower-600",
      {
        ...columnCarcass,
        // The rule: **a body that can only be built at one width must never be a §5.4 donor**,
        // whose `canGive` reads "not `fixedWidth`". A column is 600 and nothing else, so this is
        // `true`; `columnCarcass` defaults to `false`. Latent until M5 wires resize, found in the
        // same pass as the hob's identical gap (ADR 0027).
        //
        // The rule is *not* "match the catalogue row". `hood-600` below is `fixedWidth: true` while
        // its catalogue row (`hood`) never sets the flag and is therefore `false` — and `hood-600`
        // is right: the `hood` entry builds at 600 or 900, but this seeded instance is a 600.
        fixedWidth: true,
        kind: "tall_unit",
        frameDepthMm: 560,
        frameHeightMm: 2200,
        catalogEquivalentId: "tall-oven-tower",
      },
    ],
    [
      "tall-pantry-600",
      {
        ...columnCarcass,
        // Fixed for `tall-oven-tower-600`'s reason above: one buildable width, so never a §5.4
        // donor. `columnCarcass` defaults to `false` (ADR 0027).
        fixedWidth: true,
        kind: "tall_unit",
        frameDepthMm: 560,
        frameHeightMm: 2200,
        catalogEquivalentId: "tall-pantry",
      },
    ],
    [
      "fridge-free-700",
      {
        ...columnCarcass,
        kind: "fridge_freestanding",
        // A freestanding appliance, not a carcass: it builds no `door_front`, and its two handle
        // bars hang off the appliance's own group. `columnCarcass`'s `true`/`true` therefore
        // offered two sections that could only misfire — and `canHandle` was the live one, because
        // `handle: "push"` reaches `setHandlesVisible(body, false)`, which hides *every* handle mesh
        // in the group and so erased the fridge's own bars. The `fridge-free` catalogue row
        // declares both `false`; this instance is the same builder call and now agrees.
        canFinish: false,
        canHandle: false,
        frameDepthMm: 680,
        frameHeightMm: 1850,
        fixedWidth: true,
        catalogEquivalentId: "fridge-free",
      },
    ],
    [
      "wall-2door-600",
      {
        ...wallCarcass,
        kind: "wall_cabinet",
        frameDepthMm: 330,
        catalogEquivalentId: "wall-2door",
      },
    ],
    [
      "wall-corner-return-570",
      {
        ...wallCarcass,
        ...STRUCTURAL_CORNER,
        kind: "wall_cabinet",
        frameDepthMm: 330,
      },
    ],
    [
      "wall-1door-300",
      {
        ...wallCarcass,
        kind: "wall_cabinet",
        frameDepthMm: 330,
        catalogEquivalentId: "wall-1door",
      },
    ],
    [
      "wall-2door-800",
      {
        ...wallCarcass,
        kind: "wall_cabinet",
        frameDepthMm: 330,
        catalogEquivalentId: "wall-2door",
      },
    ],
    [
      "open-shelf-600",
      {
        ...wallCarcass,
        kind: "open_shelf_unit",
        // An open shelf has no door and no drawer: `collectFronts` finds nothing to recolour, so
        // `canFinish: true` from `wallCarcass` made §9 render a *Finisaj* section whose every chip
        // was a no-op. The `open-shelf` catalogue row has declared both `false` all along; this
        // instance is the same body and now says the same thing (capability-parity gate).
        canFinish: false,
        canHandle: false,
        frameDepthMm: 330,
        catalogEquivalentId: "open-shelf",
      },
    ],
    [
      "hood-600",
      {
        ...wallCarcass,
        kind: "extractor_hood",
        // A hood is a canopy and a chimney: no front, so nothing for a finish chip to recolour.
        // Same correction as `open-shelf-600` above, matching the `hood` catalogue row.
        canFinish: false,
        canHandle: false,
        fixedWidth: true,
        frameDepthMm: 500,
        catalogEquivalentId: "hood",
      },
    ],
    [
      "wall-2door-600-top",
      {
        ...topCarcass,
        kind: "wall_cabinet",
        frameDepthMm: 330,
        frameHeightMm: 400,
        catalogEquivalentId: "wall-2door",
      },
    ],
    [
      "wall-1door-300-top",
      {
        ...topCarcass,
        kind: "wall_cabinet",
        frameDepthMm: 330,
        frameHeightMm: 400,
        catalogEquivalentId: "wall-1door",
      },
    ],
    [
      "wall-2door-800-top",
      {
        ...topCarcass,
        kind: "wall_cabinet",
        frameDepthMm: 330,
        frameHeightMm: 400,
        catalogEquivalentId: "wall-2door",
      },
    ],
    [
      "wall-corner-return-570-top",
      {
        ...topCarcass,
        ...STRUCTURAL_CORNER,
        kind: "wall_cabinet",
        frameDepthMm: 330,
        frameHeightMm: 400,
      },
    ],
    [
      "wall-2door-600-deep-top",
      {
        ...topCarcass,
        kind: "wall_cabinet",
        frameDepthMm: 600,
        frameHeightMm: 400,
        catalogEquivalentId: "wall-2door",
      },
    ],
    [
      "wall-2door-700-over-fridge",
      {
        ...topCarcass,
        kind: "wall_cabinet",
        frameDepthMm: 600,
        frameHeightMm: 750,
        catalogEquivalentId: "wall-2door",
      },
    ],
  ];

/** One map, two populations (ADR 0011 Gap A): M2's seeded instances, which reproduce M1's scene
 *  and are never offered, and §7's parameterised entries, which are the only ones a customer can
 *  insert. Both resolve through the same lookup, so a placement created by `insertBody` loads the
 *  same way a seeded one does. */
export const KITCHEN_L_BODY_CATALOG: BodyCatalog = new Map<
  string,
  BodyDefinition
>([...SEEDED_BODY_DEFINITIONS, ...INSERTABLE_BODY_DEFINITIONS]);

function placement(
  id: string,
  wall: "A" | "B",
  alongMm: number,
  y0Mm: number,
  buildId: string,
  widthMm: number,
  heightMm: number,
): DesignPlacement {
  return { id, wall, alongMm, y0Mm, body: { buildId, widthMm, heightMm } };
}

export const KITCHEN_L_PLACEMENTS: readonly DesignPlacement[] = [
  placement("p0", "A", 1300, 0, "base-sink-800", 800, 820),
  placement("p1", "A", 2000, 0, "base-dishwasher-600", 600, 820),
  // ADR 0027: one body, not a cabinet plus an accessory standing on it. `p3` is gone and its id is
  // not reused — ids are persisted, and a freed id that reappears meaning something else is worse
  // than a gap in the sequence.
  placement("p2", "A", 2600, 0, "base-hob-2drawer-600", 600, 820),
  placement("p4", "A", 3200, 0, "base-drawer3-600", 600, 820),
  // ADR 0025. Appended ids, out of positional order on purpose: `p0`…`p24` are persisted in real
  // designs, so renumbering the base row to seat the corner at its head would rewrite saved data.
  placement("p25", "A", 450, 0, "base-corner-x-900", 900, 820),
  placement("p26", "B", 740, 0, "base-corner-return-320", 320, 820),
  placement("p5", "B", 1200, 0, "tall-oven-tower-600", 600, 2200),
  placement("p6", "B", 1800, 0, "tall-pantry-600", 600, 2200),
  placement("p7", "B", 2450, 0, "fridge-free-700", 700, 1850),
  placement("p8", "A", 300, 1500, "wall-2door-600", 600, 700),
  placement("p9", "B", 615, 1500, "wall-corner-return-570", 570, 700),
  placement("p10", "A", 750, 1500, "wall-1door-300", 300, 700),
  placement("p11", "A", 1300, 1500, "wall-2door-800", 800, 700),
  placement("p12", "A", 2000, 1500, "open-shelf-600", 600, 700),
  placement("p13", "A", 2600, 1500, "hood-600", 600, 700),
  placement("p14", "A", 3200, 1500, "wall-2door-600", 600, 700),
  placement("p15", "A", 300, 2200, "wall-2door-600-top", 600, 400),
  placement("p16", "A", 750, 2200, "wall-1door-300-top", 300, 400),
  placement("p17", "A", 1300, 2200, "wall-2door-800-top", 800, 400),
  placement("p18", "A", 2000, 2200, "wall-2door-600-top", 600, 400),
  placement("p19", "A", 2600, 2200, "wall-2door-600-top", 600, 400),
  placement("p20", "A", 3200, 2200, "wall-2door-600-top", 600, 400),
  placement("p21", "B", 615, 2200, "wall-corner-return-570-top", 570, 400),
  placement("p22", "B", 1200, 2200, "wall-2door-600-deep-top", 600, 400),
  placement("p23", "B", 1800, 2200, "wall-2door-600-deep-top", 600, 400),
  placement("p24", "B", 2450, 1850, "wall-2door-700-over-fridge", 700, 750),
];

export const KITCHEN_L_DESIGN: Design = {
  room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
  presetId: null,
  placements: [...KITCHEN_L_PLACEMENTS],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};
