// `swatchOf` exists so the panel's swatch chips can paint the colour a front will actually wear.
// That promise is only worth anything while the published value and the material builder agree, and
// the two are separated by a package boundary the compiler cannot see across.
//
// So this file diffs them: for every finish the domain declares, dress a front in it and read the
// colour off the material. Wave 6R made that sweep **total** — where `FINISH_COLORS` was a map with
// `oak` missing from it, every declared entry now publishes the one hex both surfaces are built
// from, and these tests are what hold the two ends of it together.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  freeColourFinish,
  FREE_COLOUR_PATTERN,
  LEGACY_ENUM_FINISHES,
  MalformedColourValueError,
  materialById,
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  PALETTE_ENTRIES,
  PALETTE_ENTRY_IDS,
  type Finish,
} from "@lemnaria/configurator-domain";

import {
  applyBodyFinish,
  applyFinish,
  collectFronts,
  finishSignature,
  swatchOf,
} from "../src/finishes.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

/** Every declared entry, as the pair a `it.each` row reads. Taken from the domain's own generator,
 *  so a seventh decor joins this sweep without anything here being edited — which is the half of
 *  "the table is total" a type annotation cannot assert. */
const DECLARED: readonly (readonly [string, Finish])[] = PALETTE_ENTRIES.map(
  (entry) => [entry.name, paletteFinish(entry.entryId)] as const,
);

function makeFront(): THREE.Mesh {
  const front = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), kit.M.door);
  front.name = "door_front";
  return front;
}

function colourOf(mesh: THREE.Mesh): string {
  const material = mesh.material;
  if (Array.isArray(material) || !("color" in material)) {
    throw new Error(`Mesh "${mesh.name}" has no single coloured material`);
  }
  return `#${(material.color as THREE.Color).getHexString()}`;
}

function dressedFront(finish: Finish): THREE.Mesh {
  const front = makeFront();
  applyFinish([front], kit.M, finish);
  return front;
}

describe("the finish table is total over the domain's declared palette", () => {
  it("sweeps every id the domain declares and no fewer", () => {
    expect(PALETTE_ENTRIES.map((entry) => entry.entryId)).toEqual([
      ...PALETTE_ENTRY_IDS,
    ]);
  });

  // The failure this replaces is M4's *Finisaj* defect one layer down: a decor declared in the
  // domain, absent from the adapter, and rendering the kit's own default white with nothing said.
  // A missing row is a compile failure in `finishes.ts`; this is the runtime half.
  it.each(DECLARED)("publishes a six-digit hex for %s", (_name, finish) => {
    expect(swatchOf(finish).color).toMatch(FREE_COLOUR_PATTERN);
  });

  it.each(DECLARED)(
    "paints %s with exactly the colour it publishes",
    (_name, finish) => {
      expect(colourOf(dressedFront(finish))).toBe(swatchOf(finish).color);
    },
  );

  it.each(DECLARED)(
    "paints %s the same way through applyBodyFinish",
    (_name, finish) => {
      const body = new THREE.Group();
      body.add(makeFront());
      applyBodyFinish(body, kit.M, finish);

      expect(colourOf(body.children[0] as THREE.Mesh)).toBe(
        swatchOf(finish).color,
      );
    },
  );

  it("gives no two decors the same colour", () => {
    // Not an aesthetic rule: two entries sharing a hex is what a copy-paste row looks like, and the
    // panel would then show one colour under two names with nothing failing.
    const colours = PALETTE_ENTRIES.map(
      (entry) => swatchOf(paletteFinish(entry.entryId)).color,
    );

    expect(new Set(colours).size).toBe(colours.length);
  });
});

describe("a wood is one texture at several tints, and never a second generator", () => {
  const WOODS = DECLARED.filter(([, finish]) => swatchOf(finish).isWood);
  const FLATS = DECLARED.filter(([, finish]) => !swatchOf(finish).isWood);

  it("declares both kinds, so neither branch is asserted against an empty list", () => {
    expect(WOODS.length).toBeGreaterThan(0);
    expect(FLATS.length).toBeGreaterThan(0);
    // And the two materials are told apart by their maps, which is what the two rows below read.
    expect(kit.M.oak.map).not.toBe(kit.M.door.map);
  });

  // ADR 0071 decision 2 puts photoreal rendering out of scope, and this is what that licenses: the
  // five woods are `oakTex` — the one instance of the package's one `woodTex` generator that
  // becomes `M.oak` — tinted, not five generated grains. (`kitchen-parts.ts` instantiates that same
  // generator a second time for the floor, which no front ever samples.) A second texture object
  // reaching a front is a wave that left its scope.
  it.each(WOODS)("draws %s on the kit's one oak map", (_name, finish) => {
    expect(
      (dressedFront(finish).material as THREE.MeshStandardMaterial).map,
    ).toBe(kit.M.oak.map);
  });

  it.each(FLATS)("draws %s as a flat colour with no map", (_name, finish) => {
    expect(
      (dressedFront(finish).material as THREE.MeshStandardMaterial).map,
    ).toBe(kit.M.door.map);
  });

  it("publishes isWood beside the hex rather than a second colour", () => {
    // The swatch's grain is derived from `color` in CSS. If `isWood` ever came from somewhere other
    // than the same row the colour came from, the two could disagree about one decor.
    for (const [, finish] of DECLARED) {
      const swatch = swatchOf(finish);
      expect(Object.keys(swatch).sort()).toEqual(["color", "isWood"]);
    }
  });
});

describe("MDF's free colour is its own colour, and a malformed one is refused", () => {
  it("paints the exact value the picker produced", () => {
    expect(colourOf(dressedFront(freeColourFinish("#b8c4a1")))).toBe("#b8c4a1");
  });

  it("publishes that same value as the swatch, and calls it no wood", () => {
    const swatch = swatchOf(freeColourFinish("#b8c4a1"));

    expect(swatch).toEqual({ color: "#b8c4a1", isWood: false });
  });

  it("throws rather than painting white for a value that is not a colour", () => {
    // `new THREE.Color("teak")` warns and leaves the material white, which is the silent default
    // this whole table exists to make impossible. A value reaching here has bypassed both
    // `FinishSchema` and the command, so it is a programming error and is thrown as one.
    const smuggled = { kind: "free-colour", value: "teak" } as Finish;

    expect(() => swatchOf(smuggled)).toThrow(MalformedColourValueError);
    expect(() => {
      applyFinish([makeFront()], kit.M, smuggled);
    }).toThrow(MalformedColourValueError);
  });
});

describe("every material's whole offer is drawable", () => {
  // ADR 0078 decision 6's correction recorded the state this closes: on a veneer kitchen every one
  // of the five legacy chips refused, so the finish control was inert and `veneer.nuc` was
  // unreachable through any surface. The check is per material, so a material whose palette the
  // adapter cannot draw fails under its own name.
  it.each(
    MATERIALS.map((material) => [material.materialId, material] as const),
  )("%s", (_id, material) => {
    const offered = paletteEntriesOf(material).map((entry) =>
      paletteFinish(entry.entryId),
    );
    const drawable = offered.filter(
      (finish) => colourOf(dressedFront(finish)) === swatchOf(finish).color,
    );

    expect(drawable).toEqual(offered);
  });

  it("draws the default finish of every material, including the picker's", () => {
    for (const material of MATERIALS) {
      expect(colourOf(dressedFront(material.defaultFinish))).toBe(
        swatchOf(material.defaultFinish).color,
      );
    }
  });
});

describe("the five finishes shipped since M1 keep the colours they were", () => {
  // Wave 6P's migration maps `white` onto PAL *Alb* and `graphite` onto *Antracit*, and `clay` and
  // `sage` onto the two free colours this file has drawn since M1. A decor that quietly changed hex
  // would repaint a stored kitchen on load with nothing having been decided.
  it.each([
    ["white", "#eceeeb"],
    ["clay", "#cbc3b8"],
    ["sage", "#8d9a84"],
    ["graphite", "#2b2d30"],
  ] as const)("%s still paints %s", (name, hex) => {
    expect(colourOf(dressedFront(LEGACY_ENUM_FINISHES[name]))).toBe(hex);
  });

  it("still draws oak's successor on the wood material", () => {
    expect(swatchOf(LEGACY_ENUM_FINISHES.oak).isWood).toBe(true);
  });
});

/**
 * **Review finding R1.6.** One hex authored in two packages with a stated dependency between them.
 *
 * `materials.ts` declares MDF's default as `#eceeeb` and justifies that value by pointing across
 * this boundary — *"`finishes.ts` in `@lemnaria/three-adapter` has rendered exactly this value since
 * M1, so the default is a colour the customer has seen rather than one invented at the
 * declaration"* — while `finishes.ts` independently declares `"pal.alb": flatColour("#eceeeb")`.
 *
 * They are two different finishes (a free colour and a palette entry), so this is not ADR 0028's
 * two hexes for one decor and neither may be derived from the other. What can go wrong is the
 * *sentence*: repaint *Alb* and the domain's justification becomes false with nothing going red.
 * The domain must not import the adapter, so the equality is asserted here — the one side that
 * legitimately sees both.
 */
describe("MDF's default white is the white this package has drawn since M1", () => {
  const mdfDefault = materialById("material.painted-mdf").defaultFinish;

  it("is a free colour, which is the only kind a picker can produce", () => {
    expect(mdfDefault.kind).toBe("free-colour");
  });

  it("is the colour PAL Alb is drawn with, which is what the domain's comment claims", () => {
    expect(swatchOf(mdfDefault).color).toBe(
      swatchOf(paletteFinish("pal.alb")).color,
    );
  });

  it("is also the kit's own door white, which is where 'since M1' comes from", () => {
    // `M.door` is what both of them repaint, and it has carried this hex since the M1 port. Pinning
    // all three together is what makes "the customer has seen this colour" a checked claim.
    expect(`#${kit.M.door.color.getHexString()}`).toBe(
      swatchOf(mdfDefault).color,
    );
  });
});

// Q6 (owner, 2026-09-01): `base-hob-oven`'s filler panel is a **finishable front**, and the whole
// of that decision rests on the mesh's name — `collectFronts` matches names, not materials, so a
// panel renamed away from `_door_front` would leave the catalogue declaring `canFinish: true` over
// a body no finish can reach. That is a silent failure at runtime, so it is a loud one here.
describe("the hob+oven filler panel is a front the customer can finish", () => {
  const FILLER_MESH_NAME = "oven_filler_door_front";

  function hobOvenBody(): THREE.Group {
    return kit.make.hobBaseWithOven(0.6);
  }

  it("is the front collectFronts finds on the body", () => {
    const fronts = collectFronts(hobOvenBody());

    expect(fronts.map((front) => front.name)).toEqual([FILLER_MESH_NAME]);
  });

  it.each(DECLARED)("wears %s once the body is dressed", (_name, finish) => {
    const body = hobOvenBody();
    const [filler] = collectFronts(body);
    if (!filler) throw new Error(`no mesh named "${FILLER_MESH_NAME}"`);
    const before = filler.material;

    applyBodyFinish(body, kit.M, finish);

    expect(filler.material).not.toBe(before);
    expect(colourOf(filler)).toBe(swatchOf(finish).color);
  });
});

// ADR 0051 (owner, 2026-09-01): the dishwasher niche wears a **decor door**, and this is the half
// of that decision the customer sees — finish chips that recorded a pick and recoloured nothing,
// because the builder produced no mesh `FRONT_MESH_NAME` could reach. Unlike the hob filler above,
// no rename was needed: `doorSlab` already names its slab `door_front`. That is exactly what makes
// the failure mode here a *deletion* rather than a rename, so the second test measures which meshes
// a finish reaches and which it must leave alone.
describe("the dishwasher niche's decor door is a front the customer can finish", () => {
  const NICHE_WIDTHS_M = [0.45, 0.6];

  function nicheBody(widthM: number): THREE.Group {
    return kit.make.dishwasherHousing(widthM);
  }

  it.each(NICHE_WIDTHS_M)(
    "is the one front collectFronts finds at %s m",
    (widthM) => {
      const fronts = collectFronts(nicheBody(widthM));

      expect(fronts.map((front) => front.name)).toEqual(["door_front"]);
    },
  );

  it.each(DECLARED)(
    "wears %s on the door and leaves every other mesh in the body alone",
    (_name, finish) => {
      const body = nicheBody(0.6);
      const [door] = collectFronts(body);
      if (!door) throw new Error('no mesh named "door_front"');
      const untouched = new Map<
        THREE.Mesh,
        THREE.Material | THREE.Material[]
      >();
      body.traverse((node) => {
        if (isMesh(node) && node !== door) untouched.set(node, node.material);
      });

      applyBodyFinish(body, kit.M, finish);

      expect(colourOf(door)).toBe(swatchOf(finish).color);
      for (const [mesh, material] of untouched) {
        expect(mesh.material, mesh.name).toBe(material);
      }
      // The worktop, the plinth, the two sides and the appliance behind the door are all in there.
      expect([...untouched.keys()].map((mesh) => mesh.name)).toEqual(
        expect.arrayContaining([
          "countertop",
          "plinth",
          "side_left",
          "side_right",
          "dw_body",
        ]),
      );
    },
  );
});

describe("a finish signs itself, so a scene notices a change it cannot read", () => {
  it("signs absence as nothing at all", () => {
    expect(finishSignature(undefined)).toBe("");
  });

  it("signs the two kinds apart and never lets them collide", () => {
    expect(finishSignature(paletteFinish("pal.alb"))).not.toBe(
      finishSignature(paletteFinish("pal.antracit")),
    );
    expect(finishSignature(freeColourFinish("#b8c4a1"))).not.toBe(
      finishSignature(freeColourFinish("#b8c4a2")),
    );
    expect(
      new Set([
        ...PALETTE_ENTRY_IDS.map((entryId) =>
          finishSignature(paletteFinish(entryId)),
        ),
        finishSignature(freeColourFinish("#eceeeb")),
      ]).size,
    ).toBe(PALETTE_ENTRY_IDS.length + 1);
  });
});
