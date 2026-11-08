// QA of M10 R4b3 item 1 (`stampedDesignOf`), beside the implementer's own file: what the stamp must never do whatever the
// request and the design (write the depth, move a placement, move a timestamp, mutate its inputs), what it must be (idempotent,
// a document the write contract accepts, one that equals the settings alone for a request that names no command), and the
// seam where its two colour judgements meet.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  CurrentDesignSchema,
  cabinetDepthMmOf,
  freeColourFinish,
  KITCHEN_L_DESIGN,
  lookUpMaterial,
  MATERIALS,
  materialOfDesign,
  materialOffersFinish,
  NewKitchenSettingsError,
  PALETTE_ENTRY_IDS,
  paletteFinish,
  setCabinetDepth,
  stampedDesignOf,
  type Design,
  type Finish,
  type Handle,
  type NewKitchenSettings,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const MATERIAL_IDS = [
  ...MATERIALS.map((material) => material.materialId),
  "material.custom-supplier",
];
const HANDLES: readonly Handle[] = ["steel", "black", "push"];
const FINISHES: readonly Finish[] = [
  ...PALETTE_ENTRY_IDS.map((entryId) => paletteFinish(entryId)),
  freeColourFinish("#eceeeb"),
  freeColourFinish("#336699"),
];

/** The seeded kitchen standing at 700 mm, moved there by the editor's own command (so its bodies are 700's). */
const KITCHEN_AT_700: Design = (() => {
  const moved = setCabinetDepth({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm: 700,
    probeAt: createFakeProbeFactory(),
    occurredAt: KITCHEN_L_DESIGN.updatedAt,
  });
  if (!moved.ok) throw new Error("the seeded kitchen moves to 700 mm");
  return moved.design;
})();

function wearingOwnFinishes(base: Design, finishes: readonly Finish[]): Design {
  return {
    ...base,
    placements: base.placements.map((placement, index) =>
      index % 2 === 0
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

const DESIGNS: fc.Arbitrary<Design> = fc.oneof(
  fc.constant(KITCHEN_L_DESIGN),
  fc.constant(KITCHEN_AT_700),
  fc
    .array(fc.constantFrom(...FINISHES), { minLength: 1, maxLength: 6 })
    .map((finishes) => wearingOwnFinishes(KITCHEN_L_DESIGN, finishes)),
  fc
    .array(fc.constantFrom(...FINISHES), { minLength: 1, maxLength: 6 })
    .map((finishes) => wearingOwnFinishes(KITCHEN_AT_700, finishes)),
  fc.constantFrom(...MATERIAL_IDS).map((materialTierId) => ({
    ...KITCHEN_L_DESIGN,
    settings: { cabinetDepthMm: 600, materialTierId },
  })),
);

/** Every partial request: each of the six keys present or absent, any depth the product makes. */
const REQUESTS = fc.record(
  {
    materialTierId: fc.constantFrom(...MATERIAL_IDS),
    hardwareTierId: fc.constantFrom(
      "hardware.standard",
      "hardware.soft-close",
      "hardware.premium",
      "hardware-custom",
    ),
    cabinetDepthMm: fc.constantFrom(600, 700),
    finish: fc.constantFrom(...FINISHES),
    handle: fc.constantFrom(...HANDLES),
    topRowHandle: fc.constantFrom(...HANDLES),
  },
  { requiredKeys: [] },
);

/** A placement without the one field a tier command may rewrite. */
function withoutFinish(design: Design) {
  return design.placements.map((placement) => {
    const { finish, ...body } = placement.body;
    expect(finish === undefined || typeof finish === "object").toBe(true);
    return { ...placement, body };
  });
}

describe("stampedDesignOf, for every request and every design", () => {
  propertyTest.prop([DESIGNS, REQUESTS], { numRuns: 300 })(
    "never writes the depth, moves no placement and no timestamp, and keeps the room",
    (design, request) => {
      const stamped = stampedDesignOf(design, request);

      expect(cabinetDepthMmOf(stamped)).toBe(cabinetDepthMmOf(design));
      expect(withoutFinish(stamped)).toEqual(withoutFinish(design));
      expect(stamped.room).toEqual(design.room);
      expect(stamped.createdAt).toBe(design.createdAt);
      expect(stamped.updatedAt).toBe(design.updatedAt);
      expect(stamped.presetId).toBe(design.presetId);
    },
  );

  propertyTest.prop([DESIGNS, REQUESTS], { numRuns: 300 })(
    "is idempotent: stamping a stamped design with the same request changes nothing",
    (design, request) => {
      const once = stampedDesignOf(design, request);

      expect(stampedDesignOf(once, request)).toEqual(once);
    },
  );

  propertyTest.prop([DESIGNS, REQUESTS], { numRuns: 300 })(
    "yields a document the current write contract accepts, whose every colour its material offers",
    (design, request) => {
      const stamped = stampedDesignOf(design, request);

      expect(CurrentDesignSchema.safeParse(stamped).success).toBe(true);
      const lookup = materialOfDesign(stamped);
      if (lookup.kind !== "declared") return;
      const colours = [
        stamped.settings?.finish,
        ...stamped.placements.map((placement) => placement.body.finish),
      ];
      for (const colour of colours) {
        if (colour === undefined) continue;
        // A colour the design wore before the stamp and the request did not touch stays as it was; only the stamped
        // material's reset is owed, and only when the request names the material.
        if (request.materialTierId === undefined) continue;
        expect(materialOffersFinish(lookup.material, colour)).toBe(true);
      }
    },
  );

  propertyTest.prop([DESIGNS, REQUESTS], { numRuns: 200 })(
    "writes each key the request defines and no other, the depth excepted",
    (design, request) => {
      const settings = stampedDesignOf(design, request).settings;

      for (const key of ["materialTierId", "hardwareTierId"] as const) {
        expect(settings?.[key]).toBe(request[key] ?? design.settings?.[key]);
      }
      expect(settings?.handle).toBe(request.handle ?? design.settings?.handle);
      expect(settings?.topRowHandle).toBe(
        request.topRowHandle ?? design.settings?.topRowHandle,
      );
      expect(Object.keys(settings ?? {}).sort()).toEqual(
        [
          ...new Set([
            ...Object.keys(design.settings ?? {}),
            ...Object.keys(request).filter((key) => key !== "cabinetDepthMm"),
          ]),
        ].sort(),
      );
    },
  );

  propertyTest.prop([DESIGNS, fc.constantFrom(600, 700, undefined)], {
    numRuns: 60,
  })(
    "is the design itself, by identity, for a request that names at most a depth",
    (design, cabinetDepthMm) => {
      const request: NewKitchenSettings =
        cabinetDepthMm === undefined ? {} : { cabinetDepthMm };

      expect(stampedDesignOf(design, request)).toBe(design);
    },
  );

  it("mutates neither the design nor the request it was given", () => {
    const design = structuredClone(
      wearingOwnFinishes(KITCHEN_L_DESIGN, FINISHES),
    );
    const request: NewKitchenSettings = {
      materialTierId: "material.veneer",
      hardwareTierId: "hardware.premium",
      cabinetDepthMm: 700,
      finish: paletteFinish("pal.alb"),
      handle: "black",
      topRowHandle: "steel",
    };
    const designBefore = structuredClone(design);
    const requestBefore = structuredClone(request);

    const stamped = stampedDesignOf(design, request);

    expect(design).toEqual(designBefore);
    expect(request).toEqual(requestBefore);
    expect(stamped.settings?.finish).not.toBe(request.finish);
  });

  it("stamps a design whose settings are frozen all the way down", () => {
    const design: Design = structuredClone(KITCHEN_L_DESIGN);
    Object.freeze(design.settings);
    Object.freeze(design.placements);

    expect(() =>
      stampedDesignOf(design, { materialTierId: "material.veneer" }),
    ).not.toThrow();
  });
});

describe("stampedDesignOf refuses a request no design may hold, whatever the design", () => {
  it.each([
    ["an own __proto__ key", JSON.parse('{"__proto__":{"handle":"black"}}')],
    ["a constructor key", JSON.parse('{"constructor":{"handle":"black"}}')],
    ["a toString key", { toString: "steel" }],
    ["a seventh design setting", { presetId: "x" }],
    ["an empty tier id", { materialTierId: "" }],
    ["a depth nobody makes (650)", { cabinetDepthMm: 650 }],
    ["a depth of 0", { cabinetDepthMm: 0 }],
    ["a negative depth", { cabinetDepthMm: -600 }],
    ["a string depth", { cabinetDepthMm: "700" }],
    ["a NaN depth", { cabinetDepthMm: Number.NaN }],
    ["a null finish", { finish: null }],
    [
      "a malformed free colour",
      { finish: { kind: "free-colour", value: "not-a-colour" } },
    ],
    ["a handle nobody makes", { handle: "gold" }],
    ["a null top-row handle", { topRowHandle: null }],
    ["an array", []],
    ["null", null],
    ["a string", "steel"],
  ])("throws NewKitchenSettingsError for %s", (_, request) => {
    for (const design of [KITCHEN_L_DESIGN, KITCHEN_AT_700]) {
      expect(() =>
        stampedDesignOf(design, request as NewKitchenSettings),
      ).toThrow(NewKitchenSettingsError);
    }
  });

  it("refuses before writing anything: the design it was given is unchanged by a refused request", () => {
    const design = structuredClone(KITCHEN_L_DESIGN);

    expect(() =>
      stampedDesignOf(design, {
        materialTierId: "material.veneer",
        handle: "gold" as Handle,
      }),
    ).toThrow(NewKitchenSettingsError);

    expect(design).toEqual(KITCHEN_L_DESIGN);
  });
});

describe("stampedDesignOf over a legacy design that carries no settings at all", () => {
  const LEGACY: Design = (() => {
    const { settings, ...rest } = KITCHEN_L_DESIGN;
    expect(settings).toBeDefined();
    return rest;
  })();

  it("keeps the legacy reading of its depth (600) and stamps the keys it was given", () => {
    const stamped = stampedDesignOf(LEGACY, { handle: "black" });

    expect(cabinetDepthMmOf(stamped)).toBe(600);
    expect(stamped.settings?.handle).toBe("black");
  });
});

describe("the two colour judgements agree: the request's own and the design's material", () => {
  // `stampedSettingsOf` judges the request's finish against the request's material (PAL when it names none) before the
  // commands run; `stampedDesignOf` documents that "a design of another material keeps that material's colour rule".
  // A request that names no material, over a design wearing veneer, therefore reaches the design's judgement with a
  // colour the request's PAL-judgement has already replaced. Only the product-level reachability decides how much this
  // matters: with no active book `readNewKitchenDefaults` returns the fixed fallbacks (PAL's own colour), so no
  // production caller sends a saved veneer colour without a material today.
  it("keeps a colour the design's own material offers when the request names no material", () => {
    const veneerDesign = stampedDesignOf(KITCHEN_L_DESIGN, {
      materialTierId: "material.veneer",
    });
    const lookup = lookUpMaterial("material.veneer");
    if (lookup.kind !== "declared") throw new Error("veneer is declared");
    const wanted = paletteFinish("veneer.nuc");
    expect(materialOffersFinish(lookup.material, wanted)).toBe(true);

    const stamped = stampedDesignOf(veneerDesign, { finish: wanted });

    expect(stamped.settings?.finish).toEqual(wanted);
  });

  it("keeps a free colour on a painted-MDF design when the request names no material", () => {
    const mdfDesign = stampedDesignOf(KITCHEN_L_DESIGN, {
      materialTierId: "material.painted-mdf",
    });
    const wanted = freeColourFinish("#336699");

    const stamped = stampedDesignOf(mdfDesign, { finish: wanted });

    expect(stamped.settings?.finish).toEqual(wanted);
  });
});
