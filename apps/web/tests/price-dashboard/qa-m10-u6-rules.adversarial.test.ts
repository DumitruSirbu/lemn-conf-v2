// Adversarial QA of M10 wave U6, the rules of the defaults screen: the colour reset against a table written from ADR 0057
// and ADR 0071 (and against the domain's stamp), the rebase over defaults that moved meanwhile held over generated
// triples, the row a 409 names, and the request a save sends.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  freeColourFinish,
  HandleSchema,
  paletteFinish,
  sameFinish,
  stampedSettingsOf,
  type Finish,
  type Handle,
  type ItemRef,
  type PaletteEntryId,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  activeHandles,
  activeHardware,
  activeMaterials,
  colourOfferFor,
  DEFAULTS_ROW_ORDER,
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
  type KitchenDefaultsMember,
  type KitchenDefaultsWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

const SIX_MEMBERS = Object.keys(KITCHEN_DEFAULTS_MEMBERS).sort();
const HANDLES: readonly Handle[] = HandleSchema.options;

// ADR 0071 decision 3 and ADR 0057: what each material offers, and what it resets to, written out by hand.
const PAL = "material.melamine";
const MDF = "material.painted-mdf";
const VENEER = "material.veneer";
const PAL_DECORS: readonly PaletteEntryId[] = [
  "pal.alb",
  "pal.stejar-bardolino",
  "pal.stejar-halifax",
  "pal.antracit",
  "pal.gri-havanna",
  "pal.nuc-warmia",
];
const VENEER_WOODS: readonly PaletteEntryId[] = ["veneer.stejar", "veneer.nuc"];
const MDF_WHITE = "#eceeeb";
const UNDECLARED = "material.not-in-this-build";

const OFFER_TABLE: Readonly<
  Record<
    string,
    {
      offers: (finish: Finish) => boolean;
      resetTo: Finish;
    }
  >
> = {
  [PAL]: {
    offers: (finish) =>
      finish.kind === "palette-entry" && PAL_DECORS.includes(finish.entryId),
    resetTo: paletteFinish("pal.alb"),
  },
  [MDF]: {
    offers: (finish) => finish.kind === "free-colour",
    resetTo: freeColourFinish(MDF_WHITE),
  },
  [VENEER]: {
    offers: (finish) =>
      finish.kind === "palette-entry" && VENEER_WOODS.includes(finish.entryId),
    resetTo: paletteFinish("veneer.stejar"),
  },
};

const EVERY_PALETTE_FINISH: readonly Finish[] = [
  ...PAL_DECORS,
  ...VENEER_WOODS,
].map((entryId) => paletteFinish(entryId));
const FREE_COLOURS: readonly Finish[] = [
  "#000000",
  "#ffffff",
  "#eceeeb",
  "#ECEEEB",
  "#b8c4a1",
  "#B8C4A1",
  "#0a0B0c",
].map((value) => freeColourFinish(value));

function draftOf(
  materialTierId: string,
  finish: Finish,
  rest: Partial<KitchenDefaultsWire> = {},
): KitchenDefaultsWire {
  return {
    ...SAMPLE_KITCHEN_DEFAULTS.state.defaults,
    materialTierId,
    finish,
    ...rest,
  };
}

function paletteIdsOffered(
  input: KitchenDefaultsPageInput,
  material: string,
): readonly PaletteEntryId[] {
  const offer = colourOfferFor(input, material);
  if (offer.kind !== "palette") throw new Error(`${material} offers no list`);
  return offer.entryIds;
}

function inputDisabling(
  ...disabled: readonly ItemRef[]
): KitchenDefaultsPageInput {
  return { ...SAMPLE_KITCHEN_DEFAULTS, disabled };
}

describe("a change of material resets a colour it does not offer, as ADR 0057 and ADR 0071 say", () => {
  const cases = [PAL, MDF, VENEER].flatMap((material) =>
    [...EVERY_PALETTE_FINISH, ...FREE_COLOURS].map(
      (finish) => [material, finish] as const,
    ),
  );

  it.each(cases)(
    "to %s, wearing %j: the colour is kept if the table offers it and is the material's default otherwise, and the domain stamps the same",
    (material, finish) => {
      const table = OFFER_TABLE[material];
      const kept = table?.offers(finish) === true;

      const change = withMaterial(draftOf(PAL, finish), material);

      const expected = kept ? finish : table?.resetTo;
      expect(change.draft.finish).toEqual(expected);
      expect(change.draft.materialTierId).toBe(material);
      expect(change.resetFrom === null).toBe(kept);
      if (!kept) expect(change.resetFrom).toEqual(finish);
      const stamped = stampedSettingsOf({
        materialTierId: material,
        finish,
      }).finish;
      expect(sameFinish(change.draft.finish, stamped ?? finish)).toBe(true);
    },
  );

  it("keeps whatever colour it was wearing for a material this build does not declare, and says nothing", () => {
    for (const finish of [...EVERY_PALETTE_FINISH, ...FREE_COLOURS]) {
      const change = withMaterial(draftOf(PAL, finish), UNDECLARED);

      expect(change.draft.finish).toEqual(finish);
      expect(change.resetFrom).toBeNull();
      expect(change.draft.materialTierId).toBe(UNDECLARED);
    }
  });

  it("resets a malformed free colour on MDF, for an empty value, a three-digit form and a missing hash", () => {
    for (const value of [
      "",
      "#abc",
      "eceeeb",
      "#eceee",
      "#eceeebb",
      "#gggggg",
    ]) {
      const malformed = { kind: "free-colour", value } as Finish;

      const change = withMaterial(draftOf(PAL, malformed), MDF);

      expect(change.draft.finish).toEqual(freeColourFinish(MDF_WHITE));
      expect(change.resetFrom).toEqual(malformed);
    }
  });

  it("leaves every other member of the draft exactly as it was", () => {
    const draft = draftOf(PAL, paletteFinish("pal.antracit"), {
      hardwareTierId: "hardware.premium",
      cabinetDepthMm: 700,
      handle: "black",
      topRowHandle: "steel",
    });

    const { draft: changed } = withMaterial(draft, VENEER);

    expect({ ...changed, materialTierId: "", finish: draft.finish }).toEqual({
      ...draft,
      materialTierId: "",
    });
  });

  it("does not write through to the draft it was given, nor share the default colour between calls", () => {
    const draft = draftOf(PAL, paletteFinish("pal.alb"));
    const frozen = structuredClone(draft);

    const first = withMaterial(draft, MDF).draft;
    const second = withMaterial(draft, MDF).draft;

    expect(draft).toEqual(frozen);
    expect(first.finish).not.toBe(second.finish);
  });
});

describe("only what is active is offered, over every combination of what is switched off", () => {
  const everyItem: readonly ItemRef[] = [
    { kind: "material", tierId: PAL },
    { kind: "material", tierId: MDF },
    { kind: "material", tierId: VENEER },
    { kind: "hardware", tierId: "hardware.standard" },
    { kind: "hardware", tierId: "hardware.soft-close" },
    { kind: "hardware", tierId: "hardware.premium" },
    ...HANDLES.map((handle): ItemRef => ({ kind: "handle", handle })),
    ...[...PAL_DECORS, ...VENEER_WOODS].map(
      (finishId): ItemRef => ({ kind: "finish", finishId }),
    ),
  ];

  propertyTest.prop([fc.subarray([...everyItem], { minLength: 0 })], {
    numRuns: 400,
  })("no switched-off item is on offer and every other one is", (disabled) => {
    const input = inputDisabling(...disabled);
    const isOff = (item: ItemRef): boolean =>
      disabled.some((off) => JSON.stringify(off) === JSON.stringify(item));

    expect(activeMaterials(input).map((tier) => tier.tierId)).toEqual(
      [PAL, MDF, VENEER].filter(
        (tierId) => !isOff({ kind: "material", tierId }),
      ),
    );
    expect(activeHardware(input).map((tier) => tier.tierId)).toEqual(
      ["hardware.standard", "hardware.soft-close", "hardware.premium"].filter(
        (tierId) => !isOff({ kind: "hardware", tierId }),
      ),
    );
    expect(activeHandles(input)).toEqual(
      HANDLES.filter((handle) => !isOff({ kind: "handle", handle })),
    );
    expect(paletteIdsOffered(input, PAL)).toEqual(
      PAL_DECORS.filter((finishId) => !isOff({ kind: "finish", finishId })),
    );
    expect(paletteIdsOffered(input, VENEER)).toEqual(
      VENEER_WOODS.filter((finishId) => !isOff({ kind: "finish", finishId })),
    );
    expect(colourOfferFor(input, MDF)).toEqual({ kind: "free" });
    expect(colourOfferFor(input, UNDECLARED)).toEqual({ kind: "none" });
  });

  it("does not take a hardware tier for the material of the same id, nor a material for the hardware of it", () => {
    const input = inputDisabling({ kind: "hardware", tierId: PAL });

    expect(activeMaterials(input).map((tier) => tier.tierId)).toContain(PAL);
  });

  it("flags a saved value switched off since, and each row alone", () => {
    const saved = SAMPLE_KITCHEN_DEFAULTS.state.defaults;
    const flagged = (item: ItemRef): readonly KitchenDefaultsMember[] => [
      ...unofferedMembers(inputDisabling(item), saved),
    ];

    expect(flagged({ kind: "material", tierId: PAL })).toEqual([
      "materialTierId",
    ]);
    expect(flagged({ kind: "hardware", tierId: "hardware.standard" })).toEqual([
      "hardwareTierId",
    ]);
    expect(flagged({ kind: "finish", finishId: "pal.alb" })).toEqual([
      "finish",
    ]);
    expect(flagged({ kind: "handle", handle: saved.handle })).toEqual([
      "handle",
    ]);
    expect(flagged({ kind: "handle", handle: saved.topRowHandle })).toEqual([
      "topRowHandle",
    ]);
    expect(flagged({ kind: "accessory", accessoryId: "any" })).toEqual([]);
  });

  it("flags a depth nobody manufactures and a colour the chosen material does not offer", () => {
    const saved = SAMPLE_KITCHEN_DEFAULTS.state.defaults;

    for (const depth of [0, -600, 599, 650, 701, Number.NaN]) {
      expect([
        ...unofferedMembers(SAMPLE_KITCHEN_DEFAULTS, {
          ...saved,
          cabinetDepthMm: depth,
        }),
      ]).toEqual(["cabinetDepthMm"]);
    }
    expect([
      ...unofferedMembers(
        SAMPLE_KITCHEN_DEFAULTS,
        draftOf(MDF, paletteFinish("pal.alb")),
      ),
    ]).toEqual(["finish"]);
    expect([
      ...unofferedMembers(
        SAMPLE_KITCHEN_DEFAULTS,
        draftOf(PAL, freeColourFinish(MDF_WHITE)),
      ),
    ]).toEqual(["finish"]);
  });

  it("flags nothing for MDF wearing a free colour in either case, and every row for a draft with nothing on offer", () => {
    expect(
      unofferedMembers(
        SAMPLE_KITCHEN_DEFAULTS,
        draftOf(MDF, freeColourFinish("#ABCDEF")),
      ).size,
    ).toBe(0);
    const nothing: KitchenDefaultsWire = {
      materialTierId: UNDECLARED,
      hardwareTierId: "hardware.unknown",
      cabinetDepthMm: 1,
      finish: paletteFinish("pal.alb"),
      handle: "steel",
      topRowHandle: "push",
    };
    const everythingOff = inputDisabling(
      ...HANDLES.map((handle): ItemRef => ({ kind: "handle", handle })),
    );

    expect([...unofferedMembers(everythingOff, nothing)]).toEqual([
      ...DEFAULTS_ROW_ORDER,
    ]);
  });
});

describe("a draft laid over defaults that moved meanwhile", () => {
  const handleArbitrary = fc.constantFrom(...HANDLES);
  const finishArbitrary = fc.oneof(
    fc.constantFrom(...EVERY_PALETTE_FINISH),
    fc
      .stringMatching(/^#[0-9a-fA-F]{6}$/)
      .map((value) => freeColourFinish(value)),
  );
  const wireArbitrary: fc.Arbitrary<KitchenDefaultsWire> = fc.record({
    materialTierId: fc.constantFrom(PAL, MDF, VENEER),
    hardwareTierId: fc.constantFrom(
      "hardware.standard",
      "hardware.soft-close",
      "hardware.premium",
    ),
    cabinetDepthMm: fc.constantFrom(600, 700),
    finish: finishArbitrary,
    handle: handleArbitrary,
    topRowHandle: handleArbitrary,
  });
  const valueOf = (
    wire: KitchenDefaultsWire,
    member: KitchenDefaultsMember,
  ): unknown => wire[member];
  const isSameMember = (
    member: KitchenDefaultsMember,
    one: KitchenDefaultsWire,
    other: KitchenDefaultsWire,
  ): boolean =>
    member === "finish"
      ? sameFinish(one.finish, other.finish)
      : valueOf(one, member) === valueOf(other, member);

  propertyTest.prop([wireArbitrary, wireArbitrary, wireArbitrary], {
    numRuns: 1500,
  })(
    "takes the person's value for each row they changed from what they read and the fresh value for every other row",
    (fresh, readSaved, draft) => {
      const rebased = rebasedOnto(fresh, readSaved, draft);

      for (const member of DEFAULTS_ROW_ORDER) {
        const personChangedIt = !isSameMember(member, readSaved, draft);
        const expected = personChangedIt ? draft : fresh;
        expect(isSameMember(member, rebased, expected), member).toBe(true);
      }
    },
  );

  propertyTest.prop([wireArbitrary, wireArbitrary], { numRuns: 500 })(
    "is the fresh values when the person changed nothing, and the person's draft when nothing moved",
    (fresh, draft) => {
      const nothingChanged = rebasedOnto(fresh, draft, draft);
      const nothingMoved = rebasedOnto(draft, draft, fresh);

      for (const member of DEFAULTS_ROW_ORDER) {
        expect(isSameMember(member, nothingChanged, fresh), member).toBe(true);
        expect(isSameMember(member, nothingMoved, fresh), member).toBe(true);
      }
    },
  );

  propertyTest.prop([wireArbitrary, wireArbitrary, wireArbitrary], {
    numRuns: 300,
  })(
    "always holds exactly the six members and writes through to none of its three inputs",
    (fresh, readSaved, draft) => {
      const before = structuredClone([fresh, readSaved, draft]);

      const rebased = rebasedOnto(fresh, readSaved, draft);

      expect(Object.keys(rebased).sort()).toEqual(SIX_MEMBERS);
      expect([fresh, readSaved, draft]).toEqual(before);
    },
  );

  it("rebases a person's change to one row over another member's change to a different row, each row from its own owner", () => {
    const readSaved = draftOf(PAL, paletteFinish("pal.alb"));
    const memberAlternative: Readonly<Record<KitchenDefaultsMember, unknown>> =
      {
        materialTierId: VENEER,
        hardwareTierId: "hardware.premium",
        cabinetDepthMm: 700,
        finish: paletteFinish("pal.antracit"),
        handle: "black",
        topRowHandle: "steel",
      };
    for (const theirs of DEFAULTS_ROW_ORDER) {
      for (const mine of DEFAULTS_ROW_ORDER) {
        if (theirs === mine) continue;
        const fresh = { ...readSaved, [theirs]: memberAlternative[theirs] };
        const draft = { ...readSaved, [mine]: memberAlternative[mine] };

        const rebased = rebasedOnto(fresh, readSaved, draft);

        expect(rebased[theirs], `${theirs} (theirs) under ${mine}`).toEqual(
          memberAlternative[theirs],
        );
        expect(rebased[mine], `${mine} (mine) under ${theirs}`).toEqual(
          memberAlternative[mine],
        );
      }
    }
  });
});

describe("the rows a 409 item-unavailable names", () => {
  const draft = (handle: Handle, topRowHandle: Handle): KitchenDefaultsWire =>
    draftOf(PAL, paletteFinish("pal.alb"), { handle, topRowHandle });

  it.each(
    HANDLES.flatMap((one) => HANDLES.map((other) => [one, other] as const)),
  )(
    "for the handles %s and %s: a handle item names exactly the rows holding it, in the order of the page",
    (handle, topRowHandle) => {
      for (const item of HANDLES) {
        const expected = [
          ...(handle === item ? ["handle"] : []),
          ...(topRowHandle === item ? ["topRowHandle"] : []),
        ];

        expect(
          membersHoldingItem(draft(handle, topRowHandle), {
            kind: "handle",
            handle: item,
          }),
        ).toEqual(expected);
      }
    },
  );

  it("does not take a material for a hardware tier of the same id, nor an accessory for any row", () => {
    const sameIdDraft = draftOf("shared.id", paletteFinish("pal.alb"), {
      hardwareTierId: "other.id",
    });

    expect(
      membersHoldingItem(sameIdDraft, {
        kind: "hardware",
        tierId: "shared.id",
      }),
    ).toEqual([]);
    expect(
      membersHoldingItem(sameIdDraft, {
        kind: "material",
        tierId: "shared.id",
      }),
    ).toEqual(["materialTierId"]);
    expect(
      membersHoldingItem(sameIdDraft, { kind: "accessory", accessoryId: "x" }),
    ).toEqual([]);
  });

  it("names the finish row for a palette colour and no row for a free colour whatever the item says", () => {
    const palette = draftOf(PAL, paletteFinish("pal.antracit"));
    const free = draftOf(MDF, freeColourFinish("#123456"));

    expect(
      membersHoldingItem(palette, { kind: "finish", finishId: "pal.antracit" }),
    ).toEqual(["finish"]);
    expect(
      membersHoldingItem(palette, { kind: "finish", finishId: "pal.alb" }),
    ).toEqual([]);
    expect(
      membersHoldingItem(free, { kind: "finish", finishId: "pal.antracit" }),
    ).toEqual([]);
  });

  it("names the rows of a 400 in the page's order, once each, and none for a field that is not a row", () => {
    expect(
      membersOfIssues([
        { field: "topRowHandle" },
        { field: "label" },
        { field: "materialTierId" },
        { field: "topRowHandle" },
        { field: "expectedRevision" },
      ]),
    ).toEqual(["materialTierId", "topRowHandle"]);
    expect(membersOfIssues([])).toEqual([]);
    expect(membersOfIssues([{ field: "item" }, { field: "change" }])).toEqual(
      [],
    );
  });
});

describe("the request a save sends", () => {
  const state = SAMPLE_KITCHEN_DEFAULTS.state;

  it("carries both revisions as the page read them and exactly the six members, whatever else the draft holds", () => {
    const crowded = {
      ...state.defaults,
      cabinetDepthMm: 700,
      surprise: "not a setting",
      finish: { ...paletteFinish("pal.antracit"), extra: 1 },
    } as unknown as KitchenDefaultsWire;

    const request = saveRequestOf(
      { ...state, revision: "41", availabilityRevision: "7" },
      crowded,
    );

    expect(Object.keys(request).sort()).toEqual([
      "defaults",
      "expectedAvailabilityRevision",
      "expectedRevision",
    ]);
    expect(request.expectedRevision).toBe("41");
    expect(request.expectedAvailabilityRevision).toBe("7");
    expect(Object.keys(request.defaults).sort()).toEqual(SIX_MEMBERS);
    expect(request.defaults.cabinetDepthMm).toBe(700);
  });

  it("is the same six members for the draft of every material and colour, and a stampable container for each", () => {
    for (const material of [PAL, MDF, VENEER]) {
      for (const finish of [...EVERY_PALETTE_FINISH, ...FREE_COLOURS]) {
        const { draft } = withMaterial(draftOf(PAL, finish), material);

        const { defaults } = saveRequestOf(state, draft);

        expect(Object.keys(defaults).sort()).toEqual(SIX_MEMBERS);
        expect(stampedSettingsOf(defaults).finish).toEqual(defaults.finish);
      }
    }
  });

  it("does not alias the draft's colour, so a later edit of the draft cannot reach a request already built", () => {
    const draft = draftOf(MDF, freeColourFinish("#123456"));

    const { defaults } = saveRequestOf(state, draft);

    expect(defaults.finish).toEqual(draft.finish);
    expect(defaults.finish).not.toBe(draft.finish);
  });
});

describe("the rows that differ from the saved values", () => {
  const saved = SAMPLE_KITCHEN_DEFAULTS.state.defaults;

  it("are none for the saved values and exactly the one row that differs, for each row", () => {
    expect(modifiedMembers(saved, saved).size).toBe(0);
    const alternatives: Readonly<Record<KitchenDefaultsMember, unknown>> = {
      materialTierId: VENEER,
      hardwareTierId: "hardware.premium",
      cabinetDepthMm: 700,
      finish: freeColourFinish("#123456"),
      handle: "black",
      topRowHandle: "steel",
    };
    for (const member of DEFAULTS_ROW_ORDER) {
      expect([
        ...modifiedMembers(saved, { ...saved, [member]: alternatives[member] }),
      ]).toEqual([member]);
    }
  });

  it("takes a free colour for the same colour only when it is written the same", () => {
    const lower = draftOf(MDF, freeColourFinish("#abcdef"));
    const upper = draftOf(MDF, freeColourFinish("#ABCDEF"));

    expect(modifiedMembers(lower, lower).size).toBe(0);
    expect([...modifiedMembers(lower, upper)]).toEqual(["finish"]);
  });
});
