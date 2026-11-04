// Adversarial QA of M10 wave U6's review changes: the offer predicates the screen and the stand-in client share, the
// colour a reset lands on while colours are switched off, and the two seams the dashboard's screens share
// (`orFailed`, `memoizeAsync`).
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  freeColourFinish,
  HandleSchema,
  paletteFinish,
  type Finish,
  type Handle,
  type ItemRef,
  type PaletteEntryId,
} from "@lemnaria/configurator-domain";
import { describe, expect, it, vi } from "vitest";

import { memoizeAsync, orFailed } from "@/price-dashboard/async-seams";
import {
  isDepthOffered,
  isHandleOffered,
  isHardwareOffered,
  isMaterialOffered,
  membersHoldingItem,
  membersOfIssues,
  unofferedMembers,
  withMaterial,
  type KitchenDefaultsPageInput,
} from "@/price-dashboard/kitchen-defaults-model";
import { SAMPLE_KITCHEN_DEFAULTS } from "@/price-dashboard/kitchen-defaults-sample";
import { inMemoryKitchenDefaultsClient } from "@/price-dashboard/kitchen-defaults-stand-in-client";
import type {
  KitchenDefaultsMember,
  KitchenDefaultsWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

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
const HANDLES: readonly Handle[] = HandleSchema.options;
const SAVED = SAMPLE_KITCHEN_DEFAULTS.state.defaults;

const switchedOffColours = (...ids: readonly PaletteEntryId[]): ItemRef[] =>
  ids.map((finishId) => ({ kind: "finish", finishId }));

describe("the colour a change of material lands on, while colours are switched off", () => {
  const draftWearing = (finish: Finish): KitchenDefaultsWire => ({
    ...SAVED,
    finish,
  });

  propertyTest.prop([fc.subarray([...PAL_DECORS])], { numRuns: 200 })(
    "is PAL's Alb, else the first decor in the declared order that is on, and never a switched-off one while any is on",
    (off) => {
      const { draft } = withMaterial(
        draftWearing(freeColourFinish("#123456")),
        PAL,
        switchedOffColours(...off),
      );

      const firstOn = PAL_DECORS.find((decor) => !off.includes(decor));
      const expected = off.includes("pal.alb")
        ? firstOn
        : ("pal.alb" as PaletteEntryId);
      expect(draft.finish).toEqual(paletteFinish(expected ?? "pal.alb"));
    },
  );

  it.each([
    [[], "veneer.stejar"],
    [["veneer.stejar"], "veneer.nuc"],
    [["veneer.nuc"], "veneer.stejar"],
    [["veneer.stejar", "veneer.nuc"], "veneer.stejar"],
  ] as const)(
    "for veneer with %j switched off lands on %s (the default again when nothing is on)",
    (off, landed) => {
      const { draft, resetFrom } = withMaterial(
        draftWearing(paletteFinish("pal.antracit")),
        VENEER,
        switchedOffColours(...off),
      );

      expect(draft.finish).toEqual(paletteFinish(landed));
      expect(resetFrom).toEqual(paletteFinish("pal.antracit"));
    },
  );

  it("is MDF's white whatever is switched off, since no free colour can be", () => {
    const everyDecor = switchedOffColours(...PAL_DECORS, ...VENEER_WOODS);

    const { draft } = withMaterial(
      draftWearing(paletteFinish("pal.alb")),
      MDF,
      everyDecor,
    );

    expect(draft.finish).toEqual(freeColourFinish("#eceeeb"));
  });

  it("does not reset a colour the material offers because it is switched off: that is a flag, not a reset", () => {
    const change = withMaterial(
      draftWearing(paletteFinish("veneer.nuc")),
      VENEER,
      switchedOffColours("veneer.nuc"),
    );

    expect(change.resetFrom).toBeNull();
    expect(change.draft.finish).toEqual(paletteFinish("veneer.nuc"));
  });

  it("treats a switched-off finish of the other kinds of item as nothing to it", () => {
    const { draft } = withMaterial(
      draftWearing(freeColourFinish("#123456")),
      VENEER,
      [
        { kind: "material", tierId: VENEER },
        { kind: "hardware", tierId: "veneer.stejar" },
        { kind: "handle", handle: "steel" },
      ],
    );

    expect(draft.finish).toEqual(paletteFinish("veneer.stejar"));
  });
});

describe("the offer predicates, held against the stand-in client that judges a save with them", () => {
  const ALL_ITEMS: readonly ItemRef[] = [
    { kind: "material", tierId: PAL },
    { kind: "material", tierId: MDF },
    { kind: "material", tierId: VENEER },
    { kind: "hardware", tierId: "hardware.standard" },
    { kind: "hardware", tierId: "hardware.soft-close" },
    { kind: "hardware", tierId: "hardware.premium" },
    ...HANDLES.map((handle): ItemRef => ({ kind: "handle", handle })),
    ...switchedOffColours(...PAL_DECORS, ...VENEER_WOODS),
  ];
  const handleArbitrary = fc.constantFrom(...HANDLES);
  const draftArbitrary: fc.Arbitrary<KitchenDefaultsWire> = fc.record({
    materialTierId: fc.constantFrom(PAL, MDF, VENEER, "material.unlisted", ""),
    hardwareTierId: fc.constantFrom(
      "hardware.standard",
      "hardware.soft-close",
      "hardware.premium",
      "hardware.unlisted",
    ),
    cabinetDepthMm: fc.constantFrom(600, 700, 650, 0, -1),
    finish: fc.oneof(
      fc
        .constantFrom(...PAL_DECORS, ...VENEER_WOODS)
        .map((entryId) => paletteFinish(entryId)),
      fc
        .constantFrom("#eceeeb", "#000000", "#ABCDEF")
        .map((value) => freeColourFinish(value)),
    ),
    handle: handleArbitrary,
    topRowHandle: handleArbitrary,
  });

  propertyTest.prop([fc.subarray([...ALL_ITEMS]), draftArbitrary], {
    numRuns: 1500,
  })(
    "saves exactly the drafts the screen flags nothing on, and a refusal names a row the screen flags",
    async (disabled, draft) => {
      const input: KitchenDefaultsPageInput = {
        ...SAMPLE_KITCHEN_DEFAULTS,
        disabled,
      };
      const client = inMemoryKitchenDefaultsClient(input);
      const { state } = input;

      const outcome = await client.save({
        expectedRevision: state.revision,
        expectedAvailabilityRevision: state.availabilityRevision,
        defaults: draft,
      });

      const flagged = unofferedMembers(input, draft);
      expect(outcome.kind === "saved").toBe(flagged.size === 0);
      if (outcome.kind === "item-unavailable") {
        const named = membersHoldingItem(draft, outcome.item);
        expect(named.length).toBeGreaterThan(0);
        for (const member of named) expect(flagged.has(member)).toBe(true);
      }
      if (outcome.kind === "invalid") {
        const named = membersOfIssues(outcome.issues);
        expect(named.length).toBeGreaterThan(0);
        for (const member of named) expect(flagged.has(member)).toBe(true);
      }
    },
  );

  propertyTest.prop([fc.subarray([...ALL_ITEMS]), draftArbitrary], {
    numRuns: 800,
  })(
    "flags each row by an independent reading of the same facts",
    (disabled, draft) => {
      const off = (item: ItemRef) =>
        disabled.some((one) => JSON.stringify(one) === JSON.stringify(item));
      const listed = (tiers: readonly string[], id: string) =>
        tiers.includes(id);
      const finishIsHeld =
        draft.finish.kind === "palette-entry" &&
        (draft.materialTierId === PAL
          ? PAL_DECORS.includes(draft.finish.entryId)
          : draft.materialTierId === VENEER &&
            VENEER_WOODS.includes(draft.finish.entryId)) &&
        !off({ kind: "finish", finishId: draft.finish.entryId });
      const expected: KitchenDefaultsMember[] = [];
      if (
        !listed([PAL, MDF, VENEER], draft.materialTierId) ||
        off({ kind: "material", tierId: draft.materialTierId })
      )
        expected.push("materialTierId");
      if (
        !listed(
          ["hardware.standard", "hardware.soft-close", "hardware.premium"],
          draft.hardwareTierId,
        ) ||
        off({ kind: "hardware", tierId: draft.hardwareTierId })
      )
        expected.push("hardwareTierId");
      if (![600, 700].includes(draft.cabinetDepthMm))
        expected.push("cabinetDepthMm");
      if (
        !(
          finishIsHeld ||
          (draft.materialTierId === MDF && draft.finish.kind === "free-colour")
        )
      )
        expected.push("finish");
      if (off({ kind: "handle", handle: draft.handle }))
        expected.push("handle");
      if (off({ kind: "handle", handle: draft.topRowHandle }))
        expected.push("topRowHandle");

      expect([
        ...unofferedMembers({ ...SAMPLE_KITCHEN_DEFAULTS, disabled }, draft),
      ]).toEqual(expected);
    },
  );

  it("offers nothing the book does not list: an unlisted tier, a depth nobody makes", () => {
    expect(
      isMaterialOffered(SAMPLE_KITCHEN_DEFAULTS, "material.unlisted"),
    ).toBe(false);
    expect(isHardwareOffered(SAMPLE_KITCHEN_DEFAULTS, "")).toBe(false);
    expect(isHandleOffered(SAMPLE_KITCHEN_DEFAULTS, "steel")).toBe(true);
    expect(isDepthOffered(Number.NaN)).toBe(false);
    expect(isDepthOffered(600)).toBe(true);
  });

  it("does not offer a material the book lists only for hardware, nor the reverse", () => {
    const input: KitchenDefaultsPageInput = {
      ...SAMPLE_KITCHEN_DEFAULTS,
      materials: [{ tierId: "shared", name: "x" }],
      hardware: [{ tierId: "only-hardware", name: "y" }],
    };

    expect(isMaterialOffered(input, "only-hardware")).toBe(false);
    expect(isHardwareOffered(input, "shared")).toBe(false);
    expect(isMaterialOffered(input, "shared")).toBe(true);
  });
});

describe("what the dashboard's screens share to reach a client", () => {
  it("answers what the call answers, falsy values included, and the fallback only for a throw or a rejection", async () => {
    for (const value of [0, "", false, null, undefined]) {
      expect(await orFailed(() => Promise.resolve(value), "failed")).toBe(
        value,
      );
    }
    expect(
      await orFailed(() => Promise.reject(new Error("offline")), "failed"),
    ).toBe("failed");
    expect(
      await orFailed(() => {
        throw new Error("synchronous");
      }, "failed"),
    ).toBe("failed");
    expect(await orFailed(() => Promise.reject(new Error()), "failed")).toBe(
      "failed",
    );
  });

  it("asks for nothing before its first call, loads once for any number of calls, and answers each of them alike", async () => {
    const load = vi.fn(() => Promise.resolve({ id: 1 }));
    const loader = memoizeAsync(load);
    expect(load).not.toHaveBeenCalled();

    const answers = await Promise.all([loader(), loader(), loader()]);
    const later = await loader();

    expect(load).toHaveBeenCalledTimes(1);
    expect(new Set([...answers, later]).size).toBe(1);
  });

  it("keeps one loader's state apart from another's", async () => {
    const first = memoizeAsync(() => Promise.resolve("one"));
    const second = memoizeAsync(() => Promise.resolve("two"));

    expect([await first(), await second(), await first()]).toEqual([
      "one",
      "two",
      "one",
    ]);
  });

  it("hands a rejection to every caller of the same loader, which orFailed then turns into a failure for each", async () => {
    const loader = memoizeAsync(() => Promise.reject(new Error("chunk")));

    const results = await Promise.all([
      orFailed(loader, "failed"),
      orFailed(loader, "failed"),
    ]);

    expect(results).toEqual(["failed", "failed"]);
  });
});
