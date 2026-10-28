import { SAMPLE_DEEP_CABINET_PERCENT } from "../support/sample-deep-cabinet-percent";
import {
  countCabinetsWearingAChosenFinish,
  DEEP_CABINET_DEPTH_MM,
  KITCHEN_L_BODY_CATALOG,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DisplayGroup,
} from "@lemnaria/configurator-domain";
import roMessages from "@/messages/ro.json";
import { ro as content } from "../support/romanian-content";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { offerWholeKitchenTiers } from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  type GlobalSettingsView,
  type WholeKitchenChoice,
} from "@/settings/global-settings-model";
import { GlobalSettingsSurface } from "@/settings/global-settings";
import { describeEditability } from "@/store/editability";

import { SUM_CLAIM_PATTERN } from "../support/ruled-price-copy";
import { MDF_KITCHEN_WEARING_CHOSEN_COLOURS } from "../support/mdf-kitchen-wearing-chosen-colours";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { NOTHING_DISABLED } from "../support/availability";

const SURFACE_ID = "settings";

/** The sheet's own count of cabinets, which must never reach the confirmation's sentence. */
const DISPLAYED_BODY_COUNT = projectDesignForDisplay(
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
  KITCHEN_L_BODY_CATALOG,
).reduce((count, group) => count + group.entries.length, 0);

const CHOSEN_COLOURS_ON_THE_MDF_FIXTURE = countCabinetsWearingAChosenFinish(
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
);

const SIDE_LABELS = [
  "absent",
  "melamine",
  "mdf",
  "veneer",
  "undeclared",
] as const;
type SideLabel = (typeof SIDE_LABELS)[number];

/** The five states either side of the press can be in. `undeclared` is a reachable id for which the domain declares
 *  no material. */
const TIER_ID_BY_LABEL: Readonly<Record<SideLabel, string | undefined>> = {
  absent: undefined,
  melamine: "material.melamine",
  mdf: "material.painted-mdf",
  veneer: "material.veneer",
  undeclared: "material.laminate",
};

/**
 * ADR 0086 decision 3's table as literals: rows are what is applied, columns what is pending, cells are "is this a
 * different declared material". Hand-authored, since a matrix derived through `lookUpMaterial` would agree with the
 * code under test. `absent → melamine` is false (`undefined` resolves to melamine, so nothing changes) and
 * `undeclared → melamine` is true (an id naming no material is not melamine however it resolves for pricing).
 */
const IS_A_DIFFERENT_DECLARED_MATERIAL: Readonly<
  Record<SideLabel, Readonly<Record<SideLabel, boolean>>>
> = {
  absent: {
    absent: false,
    melamine: false,
    mdf: true,
    veneer: true,
    undeclared: false,
  },
  melamine: {
    absent: false,
    melamine: false,
    mdf: true,
    veneer: true,
    undeclared: false,
  },
  mdf: {
    absent: false,
    melamine: true,
    mdf: false,
    veneer: true,
    undeclared: false,
  },
  veneer: {
    absent: false,
    melamine: true,
    mdf: true,
    veneer: false,
    undeclared: false,
  },
  undeclared: {
    absent: false,
    melamine: true,
    mdf: true,
    veneer: true,
    undeclared: false,
  },
};

/** Eleven of the twenty-five pairs are a material change. Pinned so a matrix edited to match a failing
 *  implementation is itself a failure. */
const MATERIAL_CHANGES_IN_THE_SQUARE = 11;

/** The counts each pair is asked at: none chosen, one chosen, and the fixture's four. */
const CHOSEN_COUNTS = [0, 1, 4] as const;

function choiceOf(tierId: string | undefined): WholeKitchenChoice {
  return tierId === undefined ? {} : { materialTierId: tierId };
}

function viewFor(options: {
  readonly design?: Design;
  readonly groups?: readonly DisplayGroup[];
  readonly applied?: WholeKitchenChoice;
  readonly pending?: WholeKitchenChoice;
  readonly chosenColourCount: number;
}): GlobalSettingsView {
  const design = options.design ?? MDF_KITCHEN_WEARING_CHOSEN_COLOURS;
  const priceInput = {
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  };
  return describeGlobalSettings({
    deepCabinetPercent: SAMPLE_DEEP_CABINET_PERCENT,
    content: content,
    pricing: priceDesign(priceInput),
    offer: offerWholeKitchenTiers(priceInput),
    groups:
      options.groups ?? projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
    applied: options.applied ?? {},
    pending: options.pending ?? {},
    chosenColourCount: options.chosenColourCount,
  });
}

describe("the presence rule, over every pair of sides the press can have", () => {
  interface Cell {
    readonly what: string;
    readonly expected: boolean;
    readonly published: boolean;
  }

  const SQUARE: readonly Cell[] = SIDE_LABELS.flatMap((appliedLabel) =>
    SIDE_LABELS.flatMap((pendingLabel) =>
      CHOSEN_COUNTS.map((chosenColourCount) => {
        const expected =
          chosenColourCount > 0 &&
          IS_A_DIFFERENT_DECLARED_MATERIAL[appliedLabel][pendingLabel];
        return {
          what: `${appliedLabel} → ${pendingLabel}, ${String(chosenColourCount)} chosen`,
          expected,
          published:
            viewFor({
              applied: choiceOf(TIER_ID_BY_LABEL[appliedLabel]),
              pending: choiceOf(TIER_ID_BY_LABEL[pendingLabel]),
              chosenColourCount,
            }).materialResetConfirm !== undefined,
        };
      }),
    ),
  );

  it("answers every one of the seventy-five cells as the hand-written table rules", () => {
    expect(SQUARE).toHaveLength(
      SIDE_LABELS.length * SIDE_LABELS.length * CHOSEN_COUNTS.length,
    );
    for (const cell of SQUARE) {
      expect(cell.published, cell.what).toBe(cell.expected);
    }
  });

  it("lands on both arms, in the literal proportion the table forces", () => {
    // Eleven material changes, each confirming at two of the three counts: 22 present cells and 53 absent. Confirming
    // on every change regardless of count lands on 33; comparing id strings lands on 24.
    const changes = SIDE_LABELS.flatMap((appliedLabel) =>
      SIDE_LABELS.filter(
        (pendingLabel) =>
          IS_A_DIFFERENT_DECLARED_MATERIAL[appliedLabel][pendingLabel],
      ),
    );

    expect(changes).toHaveLength(MATERIAL_CHANGES_IN_THE_SQUARE);
    expect(SQUARE.filter((cell) => cell.published)).toHaveLength(22);
    expect(SQUARE.filter((cell) => !cell.published)).toHaveLength(53);
  });
});

describe("the number in the sentence is the number handed in", () => {
  it("states each count from one to forty, and publishes nothing at zero", () => {
    // Swept rather than pinned at four: one worked example agrees with an implementation that ignores its argument.
    const spoken = [];
    for (
      let chosenColourCount = 0;
      chosenColourCount <= 40;
      chosenColourCount += 1
    ) {
      const confirm = viewFor({
        applied: choiceOf(TIER_ID_BY_LABEL.mdf),
        pending: choiceOf(TIER_ID_BY_LABEL.veneer),
        chosenColourCount,
      }).materialResetConfirm;

      if (chosenColourCount === 0) {
        expect(confirm).toBeUndefined();
        continue;
      }
      expect(confirm?.body).toBe(
        content.globalSettings.materialResetConfirm.body(chosenColourCount),
      );
      spoken.push(confirm?.body ?? "");
    }

    expect(spoken).toHaveLength(40);
    expect(new Set(spoken).size).toBe(40);
  });

  it("carries the three grammatical bands the count line is written in", () => {
    // Romanian counts in three bands by the last two digits and the confirmation reuses the rule; one, nineteen and
    // twenty are the transitions.
    const bodyAt = (count: number): string =>
      content.globalSettings.materialResetConfirm.body(count);

    expect(bodyAt(1)).toContain("1 dulap.");
    expect(bodyAt(2)).toContain("2 dulapuri");
    expect(bodyAt(19)).toContain("19 dulapuri");
    // No "de" in a plural band at any count: owner ruling, which supersedes the "de corpuri" from twenty up
    // (see ADR 0086, amendment).
    expect(bodyAt(20)).toContain("20 dulapuri");
  });
});

describe("the sentence cannot see the sheet's own count of cabinets", () => {
  it("does not move when the body count moves under it", () => {
    // ADR 0086 decision 2: `input.groups` is not in scope inside `toMaterialResetConfirm`. Asserted as behaviour: the
    // same press and chosen count over two projections; `appliesTo` moves and the confirmation must not.
    const wholeKitchen = viewFor({
      applied: choiceOf(TIER_ID_BY_LABEL.mdf),
      pending: choiceOf(TIER_ID_BY_LABEL.veneer),
      chosenColourCount: CHOSEN_COLOURS_ON_THE_MDF_FIXTURE,
    });
    const noBodiesAtAll = viewFor({
      groups: [],
      applied: choiceOf(TIER_ID_BY_LABEL.mdf),
      pending: choiceOf(TIER_ID_BY_LABEL.veneer),
      chosenColourCount: CHOSEN_COLOURS_ON_THE_MDF_FIXTURE,
    });

    expect(noBodiesAtAll.appliesTo).not.toBe(wholeKitchen.appliesTo);
    expect(noBodiesAtAll.materialResetConfirm).toEqual(
      wholeKitchen.materialResetConfirm,
    );
  });

  it("keeps the two counts distinct on the fixture, and states only one of them", () => {
    const view = viewFor({
      applied: choiceOf(TIER_ID_BY_LABEL.mdf),
      pending: choiceOf(TIER_ID_BY_LABEL.veneer),
      chosenColourCount: CHOSEN_COLOURS_ON_THE_MDF_FIXTURE,
    });

    expect(CHOSEN_COLOURS_ON_THE_MDF_FIXTURE).not.toBe(DISPLAYED_BODY_COUNT);
    expect(view.appliesTo).toContain(String(DISPLAYED_BODY_COUNT));
    expect(view.materialResetConfirm?.body).toContain(
      String(CHOSEN_COLOURS_ON_THE_MDF_FIXTURE),
    );
    expect(view.materialResetConfirm?.body).not.toContain(
      String(DISPLAYED_BODY_COUNT),
    );
  });
});

describe("the two copy sweeps reach this section and judge it", () => {
  /** `starting-price.adversarial.test.ts`'s flattening, over the catalogue rather than the resolver: the ICU message
   *  is the template, so the sweep keeps judging authored words (a count arrives as `{chosenCount, plural, …}`). */
  function copyLeaves(section: unknown): string[] {
    if (typeof section === "string") return [section];
    if (typeof section !== "object" || section === null) return [];
    return Object.values(section).flatMap(copyLeaves);
  }

  const LEAVES = copyLeaves(roMessages.globalSettings.materialResetConfirm);

  it("finds all five strings under the section the sweep walks", () => {
    // A gate that walks past a section reports green about nothing. Five leaves: a title, two sentences and two
    // actions; the second sentence (`globalBody`) is the arm that discards the kitchen's colour (ADR 0099 decision 7).
    expect(LEAVES).toHaveLength(5);
    expect(copyLeaves(roMessages.globalSettings)).toEqual(
      expect.arrayContaining(LEAVES),
    );
  });

  it("passes both patterns, and refuses the phrasing this sentence invites", () => {
    for (const leaf of LEAVES) {
      expect(leaf, leaf).not.toMatch(SUM_CLAIM_PATTERN);
      expect(leaf, leaf).not.toMatch(/\d/);
    }
    // Positive control, so the two assertions above cannot pass by finding nothing: the natural Romanian phrasing
    // fails both. A literal on purpose, since it is a sentence the catalogue must not hold.
    // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: a positive control: a sentence the catalogue must not hold, so no leaf can supply it.
    expect("Ai ales alte culori pentru în total 4 corpuri.").toMatch(
      SUM_CLAIM_PATTERN,
    );
    // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: the second axis of the same positive control.
    expect("Ai ales alte culori pentru în total 4 corpuri.").toMatch(/\d/);
  });

  it("spells its diacritics with the comma below, in every leaf that has one", () => {
    // U+0219 and U+021B, never U+015F and U+0163.
    //
    // The positive control comes from the enclosing section: Gate O1 rephrased these five leaves out of their
    // comma-below characters, so a control anchored here would pass by finding nothing.
    const enclosing = copyLeaves(roMessages.globalSettings);
    expect(
      // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: a comma-below character class, not wording.
      enclosing.filter((leaf) => /[șț]/.test(leaf)).length,
    ).toBeGreaterThan(0);
    // eslint-disable-next-line no-restricted-syntax -- 6B-j allow-list: the cedilla character class this file exists to refuse.
    for (const leaf of enclosing) expect(leaf, leaf).not.toMatch(/[şţ]/);
  });
});

describe("what the confirm step leaves behind when it replaces the body and footer", () => {
  const CONFIRM_VIEW = viewFor({
    applied: choiceOf(TIER_ID_BY_LABEL.mdf),
    pending: choiceOf(TIER_ID_BY_LABEL.veneer),
    chosenColourCount: CHOSEN_COLOURS_ON_THE_MDF_FIXTURE,
  });

  function markupOf(step: "choosing" | "confirm"): string {
    const confirm = CONFIRM_VIEW.materialResetConfirm;
    if (!confirm) throw new Error("this view publishes no confirmation");
    return renderToStaticMarkup(
      createElement(GlobalSettingsSurface, {
        id: SURFACE_ID,
        view: CONFIRM_VIEW,
        // Not about access; stated rather than defaulted, since `editability` is required so a write surface cannot
        // silently default to permitted (M6-AUD-001).
        editability: describeEditability(
          {
            canWrite: true,
            saveStatus: "idle",
          },
          content.panel,
        ),
        ...(step === "choosing"
          ? {}
          : {
              confirming: {
                view: confirm,
                onConfirm: () => undefined,
                onStepBack: () => undefined,
              },
            }),
        onChoose: () => undefined,
        onChooseDepth: () => undefined,
        onCancel: () => undefined,
        onApply: () => undefined,
      }),
    );
  }

  it("names which step it is, on one dialog that stays one dialog", () => {
    expect(markupOf("choosing")).toContain('data-step="choosing"');
    expect(markupOf("confirm")).toContain('data-step="confirm"');
    for (const step of ["choosing", "confirm"] as const) {
      expect([...markupOf(step).matchAll(/role="dialog"/g)]).toHaveLength(1);
      expect([...markupOf(step).matchAll(/aria-modal/g)]).toHaveLength(1);
    }
  });

  it("carries none of the choosing step's words onto it", () => {
    // Every string the choosing step owns, not a sample: they are what would stay standing if the head had not moved
    // with the step (ADR 0086 decision 6).
    const markup = markupOf("confirm");
    const choosingWords = [
      content.globalSettings.title,
      content.globalSettings.apply,
      content.globalSettings.cancel,
      content.globalSettings.materialWarning,
      content.globalSettings.depthWarning,
      content.globalSettings.depthNotePriced(
        DEEP_CABINET_DEPTH_MM,
        SAMPLE_DEEP_CABINET_PERCENT,
      ),
      content.globalSettings.depthHeading,
      content.globalSettings.groupHeadings.material,
      content.globalSettings.groupHeadings.hardware,
      CONFIRM_VIEW.appliesTo,
    ];

    expect(choosingWords.length).toBeGreaterThan(0);
    for (const word of choosingWords) expect(markup, word).not.toContain(word);
    // The positive control: every one of them is on the step this one replaced.
    const choosing = markupOf("choosing");
    for (const word of choosingWords) expect(choosing, word).toContain(word);
  });
});

describe("composing the confirmation reads and writes nothing", () => {
  it("leaves the document it was composed from byte-identical", () => {
    // The question is a query, never a speculative apply (ADR 0086 decision 4); a mutating dry run shows only here.
    const before = JSON.stringify(MDF_KITCHEN_WEARING_CHOSEN_COLOURS);

    viewFor({
      applied: choiceOf(TIER_ID_BY_LABEL.mdf),
      pending: choiceOf(TIER_ID_BY_LABEL.veneer),
      chosenColourCount: CHOSEN_COLOURS_ON_THE_MDF_FIXTURE,
    });

    expect(JSON.stringify(MDF_KITCHEN_WEARING_CHOSEN_COLOURS)).toBe(before);
  });

  it("publishes the same view twice for the same press", () => {
    const press = {
      applied: choiceOf(TIER_ID_BY_LABEL.mdf),
      pending: choiceOf(TIER_ID_BY_LABEL.veneer),
      chosenColourCount: CHOSEN_COLOURS_ON_THE_MDF_FIXTURE,
    };

    expect(viewFor(press).materialResetConfirm).toEqual(
      viewFor(press).materialResetConfirm,
    );
  });
});
