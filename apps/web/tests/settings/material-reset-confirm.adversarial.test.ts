// **Wave 6Q-c's confirmation, attacked at the seam where the two counts of cabinets meet**
// (ADR 0081, ADR 0086).
//
// `material-reset-confirm.test.ts` asserts the wave's criteria row by row. This file goes after the
// ways the same view could be wrong while every one of those rows still passed:
//
// - **the presence rule read as an id-string comparison**, which parts from the ruled table on
//   exactly **one** of the twenty-five pairs of sides — so the whole square is enumerated here
//   against a hand-authored matrix rather than against a re-derivation of the code under test. One
//   wrong cell in twenty-five is what a row-by-row table can miss and a square cannot;
// - **the sentence composed from the nearer number.** ADR 0086 decision 2 puts `input.groups` out of
//   scope inside `toMaterialResetConfirm`, which is a claim about source. The claim is made
//   falsifiable here by **moving** the body count and asserting the confirmation does not move with
//   it — a scope narrowing that had been undone would fail this without any grep;
// - **the count handed in not being the count stated**, swept over a range rather than pinned at
//   four, because the one worked example agrees with an implementation that ignores its argument.
//
// The copy sweeps are checked for **reach** as well as verdict: `starting-price.adversarial.test.ts`
// judges every leaf of `ro.globalSettings`, and a section it walks past is a gate that reports green
// about nothing.
import {
  countCabinetsWearingAChosenFinish,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
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

const SURFACE_ID = "settings";

/** The sheet's own count of cabinets, measured rather than quoted — the number that must never
 *  reach the confirmation's sentence. */
const DISPLAYED_BODY_COUNT = projectDesignForDisplay(
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
  KITCHEN_L_BODY_CATALOG,
).reduce((count, group) => count + group.entries.length, 0);

/** The chosen-colour count of the fixture the wave reuses. */
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

/** The five states either side of the press can be in. `absent` is a design that has never had a
 *  material applied, or a customer who has not touched the control; `undeclared` is ADR 0072's
 *  reachable id the domain declares no material for. */
const TIER_ID_BY_LABEL: Readonly<Record<SideLabel, string | undefined>> = {
  absent: undefined,
  melamine: "material.melamine",
  mdf: "material.painted-mdf",
  veneer: "material.veneer",
  undeclared: "material.laminate",
};

/**
 * **ADR 0086 decision 3's table, written out as literals** — rows are what is applied, columns what
 * is pending, and the cell is *"is this a different declared material"*.
 *
 * Hand-authored rather than computed, which is the whole point: a matrix derived through
 * `lookUpMaterial` would agree with the implementation whatever the implementation did. The two
 * cells that separate this rule from an id-string comparison are `absent → melamine` (**false**:
 * `undefined` resolves to melamine, so nothing changes) and `undeclared → melamine` (**true**: an
 * id naming no material is not melamine however it resolves for pricing).
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

/** Eleven of the twenty-five pairs are a material change; the other fourteen are not. Pinned so a
 *  matrix edited to match a failing implementation is itself a failure. */
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
  };
  return describeGlobalSettings({
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
    // Eleven material changes, each confirming at two of the three counts: twenty-two present cells
    // and fifty-three absent. A view that confirmed on every material change regardless of the count
    // lands on thirty-three; one that compared id strings lands on twenty-four.
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

  it("never asks about a press that would run no material command", () => {
    // `applyTierIfChanged` runs nothing when the pending id is absent or equal to the applied one.
    // A confirmation standing over either is a modal about a change that does not happen — the exact
    // failure ADR 0081 rejected *"confirm on every material change"* to avoid.
    const asked = SIDE_LABELS.flatMap((appliedLabel) =>
      SIDE_LABELS.map((pendingLabel) => ({
        appliedTierId: TIER_ID_BY_LABEL[appliedLabel],
        pendingTierId: TIER_ID_BY_LABEL[pendingLabel],
        published:
          viewFor({
            applied: choiceOf(TIER_ID_BY_LABEL[appliedLabel]),
            pending: choiceOf(TIER_ID_BY_LABEL[pendingLabel]),
            chosenColourCount: CHOSEN_COLOURS_ON_THE_MDF_FIXTURE,
          }).materialResetConfirm !== undefined,
      })),
    ).filter((pair) => pair.published);

    expect(asked.length).toBeGreaterThan(0);
    for (const pair of asked) {
      expect(pair.pendingTierId, JSON.stringify(pair)).toBeDefined();
      expect(pair.pendingTierId, JSON.stringify(pair)).not.toBe(
        pair.appliedTierId,
      );
    }
  });
});

describe("the number in the sentence is the number handed in", () => {
  it("states each count from one to forty, and publishes nothing at zero", () => {
    // Swept rather than pinned at four: the one worked example agrees with an implementation that
    // ignores its argument and reads the fixture, and with one that states the sheet's body count on
    // the single design where the two happen to be close.
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
    // Romanian counts in three bands by the last two digits, and the confirmation reuses the rule
    // rather than restating it. One, nineteen and twenty are the two transitions.
    const bodyAt = (count: number): string =>
      content.globalSettings.materialResetConfirm.body(count);

    expect(bodyAt(1)).toContain("1 dulap.");
    expect(bodyAt(2)).toContain("2 dulapuri");
    expect(bodyAt(19)).toContain("19 dulapuri");
    // **No "de" in a plural band, at any count** — owner, 2026-09-10. This key was already
    // written that way; `panel.countForBody` and `catalog.bodyLabelWithDoors` were the two that
    // carried it, and the ruling removed it there. It supersedes ADR 0086's *"twenty and above
    // takes «de corpuri»"* and extends the 2026-09-06 zero ruling to the whole `other` band.
    expect(bodyAt(20)).toContain("20 dulapuri");
  });
});

describe("the sentence cannot see the sheet's own count of cabinets", () => {
  it("does not move when the body count moves under it", () => {
    // ADR 0086 decision 2 is a claim about scope: `input.groups` is not an identifier inside
    // `toMaterialResetConfirm`. Asserted as behaviour — the same press, the same chosen count, two
    // different projections. `appliesTo` moves; the confirmation must not.
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
  /** `starting-price.adversarial.test.ts`'s flattening, over the **catalogue** rather than the
   *  resolver.
   *
   *  The pre-i18n sweep read a template's source body — everything past its first arrow — so a
   *  claim written into a template was swept as the words it would put on a screen. A resolved
   *  leaf is a closure over ICU, and its source text is the resolver's rather than the copy's. The
   *  ICU message *is* the template, so the sweep reads that and keeps judging the authored words:
   *  a count still arrives as `{chosenCount, plural, …}` and never as a digit. */
  function copyLeaves(section: unknown): string[] {
    if (typeof section === "string") return [section];
    if (typeof section !== "object" || section === null) return [];
    return Object.values(section).flatMap(copyLeaves);
  }

  const LEAVES = copyLeaves(roMessages.globalSettings.materialResetConfirm);

  it("finds all five strings under the section the sweep walks", () => {
    // A gate that walks past a section reports green about nothing, which is this project's own
    // recorded failure mode. Five leaves: a title, **two** sentences and two actions.
    //
    // It was four until ADR 0099 decision 7 added the second arm — a material change that discards
    // the *kitchen's* colour rather than any cabinet's — and that arm owes a sentence of its own
    // (`globalBody`), because the per-cabinet one would read "pentru 0 corpuri". The literal is
    // raised here deliberately: a count that moves silently is a sweep that has stopped counting.
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
    // The positive control, so the two assertions above cannot pass by finding nothing to judge:
    // the natural Romanian phrasing of this very sentence fails on both counts.
    expect("Ai ales alte culori pentru în total 4 corpuri.").toMatch(
      SUM_CLAIM_PATTERN,
    );
    expect("Ai ales alte culori pentru în total 4 corpuri.").toMatch(/\d/);
  });

  it("spells its diacritics with the comma below, in every leaf that has one", () => {
    // U+0219 and U+021B, never U+015F and U+0163.
    //
    // **The positive control is taken from the enclosing section, not from these five leaves.**
    // Gate O1 rephrased all five out of their comma-below characters — the old *"așa că"* became
    // *"iar la modificarea lui"* — so a control anchored here would now pass by finding nothing,
    // which is the exact failure mode this file exists to refuse. `globalSettings` is the smallest
    // enclosing section that still carries them, and the cedilla ban is asserted across all of it.
    const enclosing = copyLeaves(roMessages.globalSettings);
    expect(
      enclosing.filter((leaf) => /[șț]/.test(leaf)).length,
    ).toBeGreaterThan(0);
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
        // This block is about the confirmation's copy and its two steps, never about access. Stated
        // rather than defaulted: `GlobalSettingsSurface.editability` is a required prop precisely so
        // a write surface cannot silently default to permitted (M6-AUD-001).
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
    // Every string the choosing step owns, not a sample: the head's own title and its warnings are
    // what "replaces the body and footer" would leave standing if the head had not moved with the
    // step (ADR 0086 decision 6).
    const markup = markupOf("confirm");
    const choosingWords = [
      content.globalSettings.title,
      content.globalSettings.apply,
      content.globalSettings.cancel,
      content.globalSettings.materialWarning,
      content.globalSettings.depthWarning,
      content.globalSettings.depthNote,
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

  it("keeps `materialWarning` itself untouched, which is a different string entirely", () => {
    // ADR 0081 decision 5. Pinned by identity so the note beside the material group cannot be
    // quietly rewritten into the confirmation's sentence.
    expect(content.globalSettings.materialWarning).not.toContain(
      content.globalSettings.materialResetConfirm.title,
    );
    expect(
      content.globalSettings.materialResetConfirm.body(
        CHOSEN_COLOURS_ON_THE_MDF_FIXTURE,
      ),
    ).not.toContain(content.globalSettings.materialWarning);
  });
});

describe("composing the confirmation reads and writes nothing", () => {
  it("leaves the document it was composed from byte-identical", () => {
    // The question is asked by a query and never by a speculative apply (ADR 0086 decision 4). A
    // dry run that mutated on its way past would be invisible in the view and visible here.
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

  it("is composed about the stored document, not about the seeded kitchen", () => {
    // The count travels in from the caller, so the fixture the view is priced on cannot decide it.
    // The seeded kitchen wears nothing at all; handing its count in silences the confirmation even
    // on the MDF fixture's pricing.
    expect(countCabinetsWearingAChosenFinish(KITCHEN_L_DESIGN)).toBe(0);
    expect(
      viewFor({
        applied: choiceOf(TIER_ID_BY_LABEL.mdf),
        pending: choiceOf(TIER_ID_BY_LABEL.veneer),
        chosenColourCount: countCabinetsWearingAChosenFinish(KITCHEN_L_DESIGN),
      }).materialResetConfirm,
    ).toBeUndefined();
  });
});
