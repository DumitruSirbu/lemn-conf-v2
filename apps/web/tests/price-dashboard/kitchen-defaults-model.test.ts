// The rules of the new-kitchen defaults screen (frames D9A to D9C): which options are on offer, what a change of material does
// to the colour, what differs from the saved values, and what a save sends. The colour reset is held to the domain's own
// stamp (`stampedSettingsOf`, ADR 0071's table) over every material and every colour it could meet.
import {
  declaredCabinetDepthsMm,
  freeColourFinish,
  MATERIALS,
  PALETTE_ENTRIES,
  paletteFinish,
  sameFinish,
  stampedSettingsOf,
  type Finish,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  activeHandles,
  activeHardware,
  activeMaterials,
  colourOfferFor,
  depthOptions,
  membersHoldingItem,
  membersOfIssues,
  modifiedMembers,
  rebasedOnto,
  saveRequestOf,
  unofferedMembers,
  withMaterial,
  type KitchenDefaultsPageInput,
} from "@/price-dashboard/kitchen-defaults-model";
import { SAMPLE_KITCHEN_DEFAULTS } from "@/price-dashboard/kitchen-defaults-sample";
import {
  KITCHEN_DEFAULTS_MEMBERS,
  type KitchenDefaultsWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

const SAVED = SAMPLE_KITCHEN_DEFAULTS.state.defaults;
const SIX_MEMBERS = Object.keys(KITCHEN_DEFAULTS_MEMBERS).sort();

const EVERY_FINISH: readonly Finish[] = [
  ...PALETTE_ENTRIES.map((entry) => paletteFinish(entry.entryId)),
  freeColourFinish("#eceeeb"),
  freeColourFinish("#8d9a84"),
];

function inputWithout(
  ...disabled: KitchenDefaultsPageInput["disabled"]
): KitchenDefaultsPageInput {
  return { ...SAMPLE_KITCHEN_DEFAULTS, disabled };
}

describe("a colour the chosen material does not offer", () => {
  it.each(MATERIALS.map((material) => material.materialId))(
    "becomes what the domain stamps for %s, whatever colour the kitchen wore",
    (materialTierId) => {
      for (const finish of EVERY_FINISH) {
        const change = withMaterial({ ...SAVED, finish }, materialTierId);

        const stamped = stampedSettingsOf({ materialTierId, finish }).finish;

        expect(change.draft.finish, JSON.stringify(finish)).toEqual(stamped);
      }
    },
  );

  it.each(MATERIALS.map((material) => material.materialId))(
    "names the colour it took away exactly when it changed the colour (%s)",
    (materialTierId) => {
      for (const finish of EVERY_FINISH) {
        const change = withMaterial({ ...SAVED, finish }, materialTierId);

        const isChanged = !sameFinish(change.draft.finish, finish);

        expect(change.resetFrom, JSON.stringify(finish)).toEqual(
          isChanged ? finish : null,
        );
      }
    },
  );

  it("is the material's default colour: Alb for PAL, white for MDF, Stejar for veneer", () => {
    const fromVeneer = { ...SAVED, finish: paletteFinish("veneer.nuc") };

    expect(withMaterial(fromVeneer, "material.melamine").draft.finish).toEqual(
      paletteFinish("pal.alb"),
    );
    expect(
      withMaterial(fromVeneer, "material.painted-mdf").draft.finish,
    ).toEqual(freeColourFinish("#eceeeb"));
    expect(
      withMaterial(
        { ...SAVED, finish: paletteFinish("pal.alb") },
        "material.veneer",
      ).draft.finish,
    ).toEqual(paletteFinish("veneer.stejar"));
  });

  it("keeps a colour the new material offers, and says nothing of it", () => {
    const wood = { ...SAVED, finish: paletteFinish("veneer.stejar") };

    const change = withMaterial(wood, "material.veneer");

    expect(change.draft.finish).toEqual(paletteFinish("veneer.stejar"));
    expect(change.resetFrom).toBeNull();
  });

  it("changes nothing but the material for a tier this build does not declare", () => {
    const change = withMaterial(SAVED, "material.unheard-of");

    expect(change.draft).toEqual({
      ...SAVED,
      materialTierId: "material.unheard-of",
    });
    expect(change.resetFrom).toBeNull();
  });
});

describe("a save", () => {
  it("always carries all six settings, whole, with both revisions the page read", () => {
    const request = saveRequestOf(SAMPLE_KITCHEN_DEFAULTS.state, SAVED);

    expect(Object.keys(request.defaults).sort()).toEqual(SIX_MEMBERS);
    expect(request.expectedRevision).toBe(
      SAMPLE_KITCHEN_DEFAULTS.state.revision,
    );
    expect(request.expectedAvailabilityRevision).toBe(
      SAMPLE_KITCHEN_DEFAULTS.state.availabilityRevision,
    );
  });

  it("carries only the six, whatever else the draft was holding", () => {
    const holdingMore = { ...SAVED, stray: "x" } as KitchenDefaultsWire;

    const request = saveRequestOf(SAMPLE_KITCHEN_DEFAULTS.state, holdingMore);

    expect(Object.keys(request.defaults).sort()).toEqual(SIX_MEMBERS);
  });

  it("is a settings container the domain will stamp a kitchen with, for every material", () => {
    for (const material of MATERIALS) {
      const draft = withMaterial(SAVED, material.materialId).draft;

      const { defaults } = saveRequestOf(SAMPLE_KITCHEN_DEFAULTS.state, draft);

      expect(Object.keys(stampedSettingsOf(defaults)).sort()).toEqual(
        SIX_MEMBERS,
      );
    }
  });

  it("shares nothing with the draft it was made from", () => {
    const { defaults } = saveRequestOf(SAMPLE_KITCHEN_DEFAULTS.state, SAVED);

    expect(defaults.finish).not.toBe(SAVED.finish);
  });
});

describe("the depths on offer", () => {
  it("are the two the domain manufactures, 600 and 700 mm, and are read from its declaration", () => {
    expect(depthOptions()).toEqual([600, 700]);
    expect(depthOptions()).toEqual(declaredCabinetDepthsMm());
  });

  it("refuse a depth that is not manufactured", () => {
    const unofferedDepth = { ...SAVED, cabinetDepthMm: 650 };

    expect(unofferedMembers(SAMPLE_KITCHEN_DEFAULTS, unofferedDepth)).toEqual(
      new Set(["cabinetDepthMm"]),
    );
  });
});

describe("only what is active is offered", () => {
  it("offers every option while nothing is switched off", () => {
    expect(activeMaterials(SAMPLE_KITCHEN_DEFAULTS)).toHaveLength(3);
    expect(activeHardware(SAMPLE_KITCHEN_DEFAULTS)).toHaveLength(3);
    expect(activeHandles(SAMPLE_KITCHEN_DEFAULTS)).toEqual([
      "steel",
      "black",
      "push",
    ]);
    expect(
      colourOfferFor(SAMPLE_KITCHEN_DEFAULTS, "material.melamine"),
    ).toEqual({
      kind: "palette",
      entryIds: [
        "pal.alb",
        "pal.stejar-bardolino",
        "pal.stejar-halifax",
        "pal.antracit",
        "pal.gri-havanna",
        "pal.nuc-warmia",
      ],
    });
  });

  it("leaves out a material, a hardware class, a handle and a colour that is switched off", () => {
    const input = inputWithout(
      { kind: "material", tierId: "material.veneer" },
      { kind: "hardware", tierId: "hardware.premium" },
      { kind: "handle", handle: "black" },
      { kind: "finish", finishId: "pal.antracit" },
    );

    expect(activeMaterials(input).map((tier) => tier.tierId)).toEqual([
      "material.melamine",
      "material.painted-mdf",
    ]);
    expect(activeHardware(input).map((tier) => tier.tierId)).toEqual([
      "hardware.standard",
      "hardware.soft-close",
    ]);
    expect(activeHandles(input)).toEqual(["steel", "push"]);
    const offer = colourOfferFor(input, "material.melamine");
    expect(offer.kind === "palette" && offer.entryIds).not.toContain(
      "pal.antracit",
    );
  });

  it("does not take a colour switched off for one of another material", () => {
    const input = inputWithout({ kind: "finish", finishId: "pal.alb" });

    expect(colourOfferFor(input, "material.veneer")).toEqual({
      kind: "palette",
      entryIds: ["veneer.stejar", "veneer.nuc"],
    });
  });

  it("offers MDF a free colour and a material this build does not declare nothing", () => {
    expect(
      colourOfferFor(SAMPLE_KITCHEN_DEFAULTS, "material.painted-mdf"),
    ).toEqual({ kind: "free" });
    expect(
      colourOfferFor(SAMPLE_KITCHEN_DEFAULTS, "material.unheard-of"),
    ).toEqual({ kind: "none" });
  });

  it("marks a saved value that has since been switched off, and only that one", () => {
    const input = inputWithout(
      { kind: "hardware", tierId: "hardware.standard" },
      { kind: "handle", handle: "push" },
    );

    expect(unofferedMembers(input, SAVED)).toEqual(
      new Set(["hardwareTierId", "topRowHandle"]),
    );
    expect(unofferedMembers(SAMPLE_KITCHEN_DEFAULTS, SAVED)).toEqual(new Set());
  });
});

describe("the rows a save changed", () => {
  it("are none for the saved values and each row that differs, colour included", () => {
    expect(modifiedMembers(SAVED, { ...SAVED })).toEqual(new Set());
    expect(
      modifiedMembers(SAVED, {
        ...SAVED,
        finish: paletteFinish("pal.antracit"),
        cabinetDepthMm: 700,
      }),
    ).toEqual(new Set(["cabinetDepthMm", "finish"]));
  });

  it("takes a free colour for the same colour when its value is the same", () => {
    const mdf = { ...SAVED, finish: freeColourFinish("#eceeeb") };

    expect(
      modifiedMembers(mdf, { ...mdf, finish: freeColourFinish("#eceeeb") }),
    ).toEqual(new Set());
    expect(
      modifiedMembers(mdf, { ...mdf, finish: freeColourFinish("#8d9a84") }),
    ).toEqual(new Set(["finish"]));
  });
});

describe("the rows a refusal names", () => {
  it("are the rows a 400 lists, in the screen's order, and none for a member that is not a row", () => {
    expect(
      membersOfIssues([
        { field: "handle" },
        { field: "expectedRevision" },
        { field: "materialTierId" },
      ]),
    ).toEqual(["materialTierId", "handle"]);
    expect(membersOfIssues([{ field: "expectedRevision" }])).toEqual([]);
  });

  it("are the rows holding an item a 409 names: both handle rows when each holds that handle", () => {
    const bothSteel = {
      ...SAVED,
      handle: "steel",
      topRowHandle: "steel",
    } as const;

    expect(
      membersHoldingItem(bothSteel, { kind: "handle", handle: "steel" }),
    ).toEqual(["handle", "topRowHandle"]);
    expect(
      membersHoldingItem(SAVED, { kind: "handle", handle: "steel" }),
    ).toEqual(["handle"]);
    expect(
      membersHoldingItem(SAVED, {
        kind: "material",
        tierId: "material.melamine",
      }),
    ).toEqual(["materialTierId"]);
    expect(
      membersHoldingItem(SAVED, { kind: "finish", finishId: "pal.alb" }),
    ).toEqual(["finish"]);
    expect(
      membersHoldingItem(SAVED, { kind: "finish", finishId: "pal.antracit" }),
    ).toEqual([]);
    expect(
      membersHoldingItem(SAVED, { kind: "accessory", accessoryId: "x" }),
    ).toEqual([]);
  });
});

describe("a draft laid over defaults that moved meanwhile", () => {
  const FRESH: KitchenDefaultsWire = {
    ...SAVED,
    handle: "black",
    hardwareTierId: "hardware.premium",
  };

  it("takes the other member's value for every row the person left alone and keeps the rows they changed", () => {
    const draft = {
      ...SAVED,
      cabinetDepthMm: 700,
      hardwareTierId: "hardware.soft-close",
    };

    expect(rebasedOnto(FRESH, SAVED, draft)).toEqual({
      ...FRESH,
      cabinetDepthMm: 700,
      hardwareTierId: "hardware.soft-close",
    });
  });

  it("is the fresh defaults when the person changed nothing, and the draft when the other member changed nothing", () => {
    expect(rebasedOnto(FRESH, SAVED, SAVED)).toEqual(FRESH);
    const draft = { ...SAVED, finish: paletteFinish("pal.antracit") };

    expect(rebasedOnto(SAVED, SAVED, draft)).toEqual(draft);
  });

  it("always carries all six settings", () => {
    const draft = withMaterial(SAVED, "material.veneer").draft;

    expect(Object.keys(rebasedOnto(FRESH, SAVED, draft)).sort()).toEqual(
      SIX_MEMBERS,
    );
  });
});
