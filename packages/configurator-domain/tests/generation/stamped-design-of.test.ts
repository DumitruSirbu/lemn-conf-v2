// A design that already exists is stamped with the new-kitchen settings by the public commands, in rule 10's order,
// and the stamp never writes the depth (M10 R4b3 item 1; criteria (b) and (c)).
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  cabinetDepthMmOf,
  DEFAULT_FINISH,
  DEFAULT_HANDLE,
  freeColourFinish,
  generateKitchen,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  kitchenHandleSettingsOf,
  lookUpMaterial,
  MATERIALS,
  materialOfDesign,
  materialOffersFinish,
  NewKitchenSettingsError,
  PALETTE_ENTRY_IDS,
  paletteFinish,
  priceDesign,
  resolvedFinishOf,
  resolvedHandleOf,
  SAMPLE_PRICE_BOOK,
  setGlobalFinish,
  setHardwareTier,
  setKitchenHandle,
  setMaterialTier,
  stampedDesignOf,
  TOP_ROW_HANDLE,
  type Design,
  type Finish,
  type Handle,
  type NewKitchenSettings,
} from "../../src/index.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const EVERY_HANDLE: readonly Handle[] = ["steel", "black", "push"];

/** Every one of the six settings differs from the reference fixture's (600, nothing else set). */
const EVERY_SETTING_DIFFERING: NewKitchenSettings = {
  materialTierId: "material.painted-mdf",
  hardwareTierId: "hardware-premium",
  cabinetDepthMm: 700,
  finish: freeColourFinish("#336699"),
  handle: "black",
  topRowHandle: "steel",
};

const EVERY_FINISH: readonly Finish[] = [
  ...PALETTE_ENTRY_IDS.map((entryId) => paletteFinish(entryId)),
  freeColourFinish("#eceeeb"),
  freeColourFinish("#336699"),
];

describe("stampedDesignOf writes the five settings and never the depth", () => {
  it("writes every key of a request whose six settings all differ from the fixture, at the fixture's depth", () => {
    const stamped = stampedDesignOf(KITCHEN_L_DESIGN, EVERY_SETTING_DIFFERING);

    expect(stamped.settings).toEqual({
      cabinetDepthMm: 600,
      materialTierId: "material.painted-mdf",
      hardwareTierId: "hardware-premium",
      finish: freeColourFinish("#336699"),
      handle: "black",
      topRowHandle: "steel",
    });
  });

  it.each([600, 700])(
    "leaves a design standing at %i mm there, whatever depth the request names",
    (standingDepthMm) => {
      const design: Design = {
        ...KITCHEN_L_DESIGN,
        settings: { cabinetDepthMm: standingDepthMm },
      };
      const requestedDepthMm = standingDepthMm === 600 ? 700 : 600;

      const stamped = stampedDesignOf(design, {
        ...EVERY_SETTING_DIFFERING,
        cabinetDepthMm: requestedDepthMm,
      });

      expect(cabinetDepthMmOf(stamped)).toBe(standingDepthMm);
      expect(stamped.placements).toBe(design.placements);
    },
  );

  it("is the design itself, by identity, for a request that names nothing", () => {
    expect(stampedDesignOf(KITCHEN_L_DESIGN, {})).toBe(KITCHEN_L_DESIGN);
  });

  it("moves no timestamp", () => {
    const stamped = stampedDesignOf(KITCHEN_L_DESIGN, EVERY_SETTING_DIFFERING);

    expect(stamped.createdAt).toBe(KITCHEN_L_DESIGN.createdAt);
    expect(stamped.updatedAt).toBe(KITCHEN_L_DESIGN.updatedAt);
  });

  it("leaves the room and the placements it was given alone when no cabinet wears a colour of its own", () => {
    const stamped = stampedDesignOf(KITCHEN_L_DESIGN, EVERY_SETTING_DIFFERING);

    expect(stamped.room).toEqual(KITCHEN_L_DESIGN.room);
    expect(stamped.placements).toEqual(KITCHEN_L_DESIGN.placements);
  });

  it("stamps the four keys it was given when the request holds no tier (a creation with no active book)", () => {
    const { materialTierId, hardwareTierId, ...withoutTiers } =
      EVERY_SETTING_DIFFERING;
    expect([materialTierId, hardwareTierId]).not.toContain(undefined);

    const stamped = stampedDesignOf(KITCHEN_L_DESIGN, {
      ...withoutTiers,
      finish: paletteFinish("pal.alb"),
    });

    expect(stamped.settings).toEqual({
      cabinetDepthMm: 600,
      finish: paletteFinish("pal.alb"),
      handle: "black",
      topRowHandle: "steel",
    });
  });
});

describe("stampedDesignOf refuses what no design may hold", () => {
  it.each([
    ["a handle nobody makes", { handle: "gold" as Handle }],
    ["a depth nobody manufactures", { cabinetDepthMm: 650 }],
    ["a null where a value is optional", { handle: null as unknown as Handle }],
    ["a key a new kitchen does not take", { presetId: "x" } as object],
  ])("throws for %s", (_, request) => {
    expect(() =>
      stampedDesignOf(KITCHEN_L_DESIGN, request as NewKitchenSettings),
    ).toThrow(NewKitchenSettingsError);
  });
});

describe("stampedDesignOf judges the colour against the material the design wears", () => {
  it("resets a colour the stamped material does not make to that material's own default", () => {
    const stamped = stampedDesignOf(KITCHEN_L_DESIGN, {
      materialTierId: "material.veneer",
      finish: paletteFinish("pal.alb"),
    });

    expect(stamped.settings?.finish).toEqual({
      kind: "palette-entry",
      entryId: "veneer.stejar",
    });
  });

  it("does not throw over a design of another material when the request names no material", () => {
    const veneerDesign = stampedDesignOf(KITCHEN_L_DESIGN, {
      materialTierId: "material.veneer",
    });

    const stamped = stampedDesignOf(veneerDesign, {
      finish: paletteFinish("pal.alb"),
    });

    expect(stamped.settings?.materialTierId).toBe("material.veneer");
    expect(stamped.settings?.finish).toEqual({
      kind: "palette-entry",
      entryId: "veneer.stejar",
    });
  });

  it("resets nothing for a material no declaration names, and keeps the colour it was given", () => {
    const stamped = stampedDesignOf(KITCHEN_L_DESIGN, {
      materialTierId: "material.custom-supplier",
      finish: paletteFinish("pal.antracit"),
    });

    expect(stamped.settings).toMatchObject({
      materialTierId: "material.custom-supplier",
      finish: paletteFinish("pal.antracit"),
    });
  });
});

/** A design whose every third cabinet wears a colour of its own, drawn from every palette and free colour. */
function withCabinetsWearingTheirOwnFinishes(
  finishes: readonly Finish[],
): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement, index) =>
      index % 3 === 0
        ? {
            ...placement,
            body: {
              ...placement.body,
              finish: finishes[index % finishes.length] ?? finishes[0],
            },
          }
        : placement,
    ),
  };
}

/** A request that names every key the commands write, so the reference below has nothing to default. */
interface WholeRequest {
  readonly materialTierId: string;
  readonly hardwareTierId: string;
  readonly finish: Finish;
  readonly handle: Handle;
  readonly topRowHandle: Handle;
}

describe("criterion (c): no cabinet keeps a colour the stamped material does not offer", () => {
  const MATERIAL_IDS = MATERIALS.map((material) => material.materialId);

  propertyTest.prop(
    [
      fc.constantFrom(...MATERIAL_IDS),
      fc.array(fc.constantFrom(...EVERY_FINISH), {
        minLength: 1,
        maxLength: 8,
      }),
      fc.constantFrom(...EVERY_FINISH),
    ],
    { numRuns: 60 },
  )(
    "leaves every cabinet's colour offered by the stamped material, and equals rule 10's commands in their order",
    (materialTierId, cabinetFinishes, finish) => {
      const design = withCabinetsWearingTheirOwnFinishes(cabinetFinishes);
      const request: WholeRequest = {
        materialTierId,
        hardwareTierId: "hardware-standard",
        finish,
        handle: "steel",
        topRowHandle: "black",
      };

      const stamped = stampedDesignOf(design, request);

      const lookup = lookUpMaterial(materialTierId);
      if (lookup.kind !== "declared") throw new Error("a declared material");
      for (const placement of stamped.placements) {
        const own = placement.body.finish;
        if (own !== undefined) {
          expect(materialOffersFinish(lookup.material, own)).toBe(true);
        }
      }
      expect(stamped).toEqual(byTheCommandsInTheirOrder(design, request));
      expect(stamped.createdAt).toBe(design.createdAt);
      expect(stamped.updatedAt).toBe(design.updatedAt);
    },
  );

  /** Rule 10 written out: each tier command is given the stamped tier as its only offered id. */
  function byTheCommandsInTheirOrder(
    design: Design,
    request: WholeRequest,
  ): Design {
    const occurredAt = design.updatedAt;
    const { materialTierId, hardwareTierId } = request;
    const material = setMaterialTier({
      design,
      tierId: materialTierId,
      availableTierIds: [materialTierId],
      occurredAt,
    });
    const hardware = setHardwareTier({
      design: expectOk(material),
      tierId: hardwareTierId,
      availableTierIds: [hardwareTierId],
      occurredAt,
    });
    const lookup = lookUpMaterial(materialTierId);
    const wanted = request.finish;
    const offered =
      lookup.kind === "declared" &&
      !materialOffersFinish(lookup.material, wanted)
        ? lookup.material.defaultFinish
        : wanted;
    const colour = setGlobalFinish({
      design: expectOk(hardware),
      finish: offered,
      occurredAt,
    });
    const handle = setKitchenHandle({
      design: expectOk(colour),
      handle: request.handle,
      occurredAt,
    });
    const settled = expectOk(handle);
    return {
      ...settled,
      settings: { ...settled.settings, topRowHandle: request.topRowHandle },
    };
  }

  function expectOk(result: {
    readonly ok: boolean;
    readonly design: Design;
  }): Design {
    expect(result.ok).toBe(true);
    return result.design;
  }

  it("rewrites a cabinet's own colour the material does not make, and keeps one it does", () => {
    const design = withCabinetsWearingTheirOwnFinishes([
      paletteFinish("pal.antracit"),
      freeColourFinish("#336699"),
    ]);

    const stamped = stampedDesignOf(design, {
      materialTierId: "material.melamine",
    });

    const own = stamped.placements.flatMap((placement) =>
      placement.body.finish === undefined ? [] : [placement.body.finish],
    );
    expect(own).toContainEqual(paletteFinish("pal.antracit"));
    expect(own).not.toContainEqual(freeColourFinish("#336699"));
    expect(own).toContainEqual(paletteFinish("pal.alb"));
  });
});

describe("stampedDesignOf over every handle", () => {
  it.each(EVERY_HANDLE)(
    "writes the top row's handle %s through settings alone, touching no placement",
    (topRowHandle) => {
      const stamped = stampedDesignOf(KITCHEN_L_DESIGN, { topRowHandle });

      expect(stamped.settings?.topRowHandle).toBe(topRowHandle);
      expect(stamped.placements).toBe(KITCHEN_L_DESIGN.placements);
    },
  );
});

/** What a kitchen with nothing saved resolves to when its settings are absent: the fixed fallbacks, written as keys. */
const FIXED_FALLBACKS: NewKitchenSettings = {
  materialTierId: SAMPLE_PRICE_BOOK.material.defaultTierId,
  hardwareTierId: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
  cabinetDepthMm: 600,
  finish: DEFAULT_FINISH,
  handle: DEFAULT_HANDLE,
  topRowHandle: TOP_ROW_HANDLE,
};

function priceOf(design: Design) {
  return priceDesign({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK.version,
  });
}

describe("with nothing saved, the stamped kitchen prices and renders exactly as the unstamped one (golden)", () => {
  const stamped = stampedDesignOf(KITCHEN_L_DESIGN, FIXED_FALLBACKS);

  it("is priced to the same lines and the same total", () => {
    const unstampedPrice = priceOf(KITCHEN_L_DESIGN);

    expect(unstampedPrice.ok).toBe(true);
    expect(priceOf(stamped)).toEqual(unstampedPrice);
  });

  it("resolves the same material and the same colour for every cabinet", () => {
    expect(materialOfDesign(stamped)).toEqual(
      materialOfDesign(KITCHEN_L_DESIGN),
    );
    for (const placement of stamped.placements) {
      expect(resolvedFinishOf(placement, stamped)).toEqual(
        resolvedFinishOf(placement, KITCHEN_L_DESIGN),
      );
    }
  });

  it.each([true, false])(
    "resolves the same handle for a cabinet that takes one, with top row %s",
    (isTopRow) => {
      const resolvedBy = (design: Design) =>
        resolvedHandleOf({
          ownHandle: undefined,
          kitchenSettings: kitchenHandleSettingsOf(design.settings ?? {}),
          canHandle: true,
          isTopRow,
        });

      expect(resolvedBy(stamped)).toBe(resolvedBy(KITCHEN_L_DESIGN));
    },
  );
});

describe("with nothing saved, a generated kitchen is the unstamped one with the fixed fallbacks as explicit keys (golden)", () => {
  const room = {
    shape: "L",
    widthMm: 3600,
    depthMm: 3000,
    heightMm: 2600,
  } as const;

  function generatedWith(newKitchenSettings: NewKitchenSettings | undefined) {
    const result = generateKitchen({
      room,
      occurredAt: "2026-11-08T10:00:00.000Z",
      probeAt: createFakeProbeFactory(),
      newKitchenSettings,
    });
    if (!result.ok) throw new Error("the room generates");
    return result.design;
  }

  it("differs from the unstamped design by its settings alone, and prices and resolves the same", () => {
    const unstamped = generatedWith(undefined);
    const stamped = generatedWith(FIXED_FALLBACKS);

    expect({ ...stamped, settings: unstamped.settings }).toEqual(unstamped);
    expect(stamped.settings).toEqual(FIXED_FALLBACKS);
    expect(priceOf(stamped)).toEqual(priceOf(unstamped));
    for (const placement of stamped.placements) {
      expect(resolvedFinishOf(placement, stamped)).toEqual(
        resolvedFinishOf(placement, unstamped),
      );
    }
  });
});
