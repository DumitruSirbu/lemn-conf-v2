// A hex cannot tell painted white from unpainted: `pal.alb`, `kit.M.door` and MDF's declared default are all `#eceeeb`.
// So every colour claim is asserted by material instance too: a painted front wears a clone (`buildFinishMaterial`),
// never the shared `kit.M.door` / `kit.M.oak`, and the texture map says which one the clone came from.
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

/**
 * Each decor's drawn hex and whether it is drawn on the wood, written out rather than imported: a constant read
 * from the table under test agrees with whatever that table says.
 */
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

/** The premise of the hex coincidence, stated rather than read off the kit. */
const KIT_DOOR_HEX = "#eceeeb";

/**
 * MDF's control is a picker, so two free colours stand in for its palette: one far from the kit's white, one
 * exactly the kit's white.
 */
const MDF_FREE_COLOURS: readonly Finish[] = [
  freeColourFinish("#3f5c2a"),
  freeColourFinish("#eceeeb"),
];

/** A placement that draws fronts and can wear a colour. */
const FINISHABLE_ID = "p1";
/** A second, so "this body repainted" and "every body repainted" are distinguishable. */
const SECOND_FINISHABLE_ID = "p8";
/**
 * `p25`, `base-corner-x-900`: structural cabinetry that wears the kitchen's colour and draws a front, which makes
 * that observable. The appliances `p7` and `p13` draw no fronts, so claims about them are made on `drawnFinish`.
 */
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

/** MDF contributes free colours rather than an empty list, so a sweep over all materials skips none. */
function offeredFinishesOf(material: Material): readonly Finish[] {
  if (material.colourControl.shape === "ral-picker") return MDF_FREE_COLOURS;
  return paletteEntriesOf(material).map((entry) =>
    paletteFinish(entry.entryId),
  );
}

/** The seeded kitchen on a stated material, with no cabinet carrying a colour of its own. */
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

/** The kitchen's colour removed, not set to `undefined`: the two round-trip differently. */
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

/** Clearing deletes the key (ADR 0099 decision 5); it is never set to the value it was showing. */
function clearedOn(design: Design, id: string): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === id ? withNoFinishOfItsOwn(placement) : placement,
    ),
  };
}

/** Trimmed to the bodies each sweep asserts on, to keep the exhaustive sweeps inside the suite's runtime. */
function onlyTheseBodies(design: Design, ids: readonly string[]): Design {
  return {
    ...design,
    placements: design.placements.filter((placement) =>
      ids.includes(placement.id),
    ),
  };
}

function drawn(design: Design): void {
  syncSolidBodies({
    kit,
    solidsRoot,
    records: derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
    room: design.room,
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

/**
 * A finish's expected hex, and which of the kit's two shared materials its clone came from (free colours are
 * flat over `M.door`).
 */
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

/** Every front of the body wears this finish: by hex, by instance (a painted front wears a clone) and by map. */
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

/** Nothing was painted: every front still carries the kit's shared door material, by instance. */
function expectUnpainted(placementId: string): void {
  const fronts = frontsOf(mounted(placementId));
  expect(fronts.length).toBeGreaterThan(0);
  for (const front of fronts) expect(front.material).toBe(kit.M.door);
}

describe("the coincidence this file is written around", () => {
  /** A premise: if either value moves, the hex assertions elsewhere stop being vacuous and this is where it shows. */
  it("still has melamine's default, MDF's default and the kit's own door on one hex", () => {
    expect(`#${kit.M.door.color.getHexString()}`).toBe(KIT_DOOR_HEX);
    expect(
      expectedDrawing(materialById("material.melamine").defaultFinish).hex,
    ).toBe(KIT_DOOR_HEX);
    expect(
      expectedDrawing(materialById("material.painted-mdf").defaultFinish).hex,
    ).toBe(KIT_DOOR_HEX);
    expect(
      expectedDrawing(materialById("material.veneer").defaultFinish).hex,
    ).not.toBe(KIT_DOOR_HEX);
  });

  /** Instance-based, so red under the original defect on melamine and MDF, where a hex assertion is vacuous. */
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

// Exhaustive, not sampled: the three materials declare a closed set of eight palette entries.
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

  /** Another finish of the same material, so the two levels never hold the same value. */
  function anotherOfferedFinish(materialTierId: string, avoid: Finish): Finish {
    const offered = offeredFinishesOf(materialById(materialTierId));
    const other = offered.find(
      (candidate) => JSON.stringify(candidate) !== JSON.stringify(avoid),
    );
    if (!other) throw new Error(`${materialTierId} offers only one finish`);
    return other;
  }
});

// `syncSolidBodies` keeps a mounted body whose signature still matches, so the signature alone decides whether a
// colour change reaches the screen.
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

  it("repaints back to the material's default when the kitchen's colour is cleared", () => {
    const base = followingKitchen();

    drawn(withKitchenColour(base, NUC));
    const before = mounted(FINISHABLE_ID);
    expectWearing(FINISHABLE_ID, NUC);

    drawn(withoutKitchenColour(base));

    expect(mounted(FINISHABLE_ID)).not.toBe(before);
    expectWearing(FINISHABLE_ID, materialById(MELAMINE).defaultFinish);
  });

  /** Negative case: a fix that re-mounted on every settings write would pass every positive test above. */
  it("keeps every instance when the kitchen's colour is set to the value it already held", () => {
    const base = withKitchenColour(followingKitchen(), HAVANNA);

    drawn(base);
    const first = mounted(FINISHABLE_ID);
    const second = mounted(SECOND_FINISHABLE_ID);

    drawn(withKitchenColour(followingKitchen(), HAVANNA));

    expect(mounted(FINISHABLE_ID)).toBe(first);
    expect(mounted(SECOND_FINISHABLE_ID)).toBe(second);
  });

  /** Both halves in one sync, so a scene that re-mounts everything and one that re-mounts nothing both fail. */
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

  /**
   * Only `settings.finish` changes, every placement the same reference: the shape `setGlobalFinish` produces
   * (ADR 0099 decision 2).
   */
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

// Structural bodies take the kitchen's colour and appliances take none (ADR 0099 Amendment B), yet the open shelf, hood
// and fridge all carry `canFinish: false`, so a sweep over that flag would assert the wrong rule. The per-body
// claims are in qa-0099c-each-unchoosing-body-by-name.adversarial.test.ts.
describe("backlog 60 — a structural body follows the kitchen where its appliance neighbours do not", () => {
  const ANTRACIT = paletteFinish("pal.antracit");

  /**
   * Every seeded body that draws no colour, read off the records rather than a build-id list, so a body moved
   * between families in the catalogue changes what is swept.
   */
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
    // Premise: an ordinary cabinet took the same colour, so this is the kitchen's colour reaching the corner.
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

  /** Veneer's default is a tinted wood, visibly unlike the kit's white, so coincidence cannot pass this. */
  it("gives a structural body the material's declared default when the kitchen has no colour", () => {
    drawn(withoutKitchenColour(followingOn("material.veneer")));

    const veneerDefault = materialById("material.veneer").defaultFinish;
    expectWearing(STRUCTURAL_ID, veneerDefault);
    expectWearing(FINISHABLE_ID, veneerDefault);
  });

  /**
   * A corner is on `chooses-its-own-colour` (ADR 0099 Amendment C), so its own colour beats the kitchen's; the
   * neighbour stays on the kitchen's, so this is that corner overriding.
   */
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

// `resolvedFinishOf` answers `undefined` for an undeclared `materialTierId` with no kitchen colour, a state that
// loads rather than being refused; the scene must draw something rather than throw.
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

  it("still draws the kitchen's colour on a design whose material is undeclared", () => {
    drawn(withKitchenColour(followingOn(UNDECLARED), ANTRACIT));

    expectWearing(FINISHABLE_ID, ANTRACIT);
  });

  /** `settings` is optional in `DesignSchema`; `materialOfDesign` deems a bare design PAL. */
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

  /** A signature signing `""` for both absent and present drawn colour would strand a recovered kitchen on white. */
  it("repaints when an undeclared material is corrected to a declared one", () => {
    drawn(withoutKitchenColour(followingOn(UNDECLARED)));
    const before = mounted(FINISHABLE_ID);
    expectUnpainted(FINISHABLE_ID);

    drawn(withoutKitchenColour(followingOn("material.veneer")));

    expect(mounted(FINISHABLE_ID)).not.toBe(before);
    expectWearing(FINISHABLE_ID, materialById("material.veneer").defaultFinish);
  });
});

// The real builders and probe decide what an insert produces; commands rebuild bodies through `carriedAppearance`.
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

  /**
   * Key absence, not value: `finish === undefined` also passes for a present key holding `undefined`, which a save
   * round-trips into a stamped colour (ADR 0099 Amendment A section 1).
   */
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

    // `p8`, shrinking: `p10` has no free millimetre (NO_EMPTY_SPACE) and the inserted body stands over a column
    // (COLUMN_MEMBER_NOT_RESIZABLE).
    world = resize(world, SECOND_FINISHABLE_ID, 400);
    expectNoCabinetChose(world.design);

    // The swap targets the inserted body: `open-shelf` is refused on `p8`'s column (COLUMN_MISMATCH).
    const swapped = swapInto(world, inserted.placementId, "open-shelf");
    world = swapped.world;
    expectNoCabinetChose(world.design);

    drawn(world.design);
    // A rebuild that dropped the resolved colour would leave a keyless cabinet painted the kit's white, which
    // `expectNoCabinetChose` cannot see. The swapped `open-shelf` is unfinishable and not asserted here.
    expectWearing(SECOND_FINISHABLE_ID, ANTRACIT);
    expectWearing(FINISHABLE_ID, ANTRACIT);
  });

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

  /**
   * The forbidden fix, observed from the scene: writing the resolved colour into `finishKey` would leave the cabinet
   * on the first colour after a second global change.
   */
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
