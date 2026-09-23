// M7 wave 7I adversarial QA, criterion A15 (ADR 0129 D8): the side word crosses on a right-hand
// room for **every** refusal that carries sides — all three codes, all eight side/reason branches,
// multi-side lists, both locales — and for no refusal that carries none. Then the same crossing
// through the real panel (`describePanel`), walked over every placement of the seeded kitchen,
// wall B included, with the domain's own verdicts as the oracle.
import {
  buildableWidthSpanMm,
  cabinetDepthMmOf,
  columnWidthChoices,
  deriveColumns,
  derivePlacementRecords,
  describeSelection,
  kindLabel,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  recomputeVoids,
  widthOptionsFor,
  widthStepsFor,
  type EmptySpaceSide,
  type RejectionDetail,
} from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { resolveContent } from "@/i18n/content";
import { describePanel } from "@/panel/panel-model";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { createFakeBodyProbe } from "../support/fake-body-probe";
import { PAL_KITCHEN } from "../support/panel-material";
import { REJECTION_FIXTURES } from "./golden-output-fixtures";

const CATALOGUES = [
  ["ro", roMessages],
  ["ru", ruMessages],
] as const;

function contentFor(locale: "ro" | "ru", messages: typeof roMessages) {
  return resolveContent(createTranslator({ locale, messages }) as never);
}

const REASONS = ["absent", "too_narrow", "opens_a_gap", "key_taken"] as const;
const EVERY_SIDE: readonly EmptySpaceSide[] = (
  ["right", "left"] as const
).flatMap((side) => REASONS.map((reason) => ({ side, reason })));

function flipped(sides: readonly EmptySpaceSide[]): EmptySpaceSide[] {
  return sides.map((entry) => ({
    ...entry,
    side: entry.side === "right" ? "left" : "right",
  }));
}

function withSides(
  detail: RejectionDetail,
  sides: readonly EmptySpaceSide[],
): RejectionDetail {
  return { ...detail, params: { ...detail.params, sides } } as RejectionDetail;
}

function carriesSides(detail: RejectionDetail): boolean {
  return (
    "params" in detail &&
    Array.isArray((detail.params as { sides?: unknown }).sides)
  );
}

const LABEL = kindLabel("body-token");
const SIDE_CARRIERS: readonly RejectionDetail[] = [
  {
    code: "NO_EMPTY_SPACE",
    params: { label: LABEL, requestedMm: 650, deltaMm: 50, sides: [] },
  },
  { code: "RESIZE_OPENS_GAP", params: { label: LABEL, sides: [] } },
  {
    code: "COLUMN_KEY_COLLISION",
    params: { label: LABEL, requestedMm: 650, sides: [] },
  },
] as RejectionDetail[];

describe.each(CATALOGUES)("7I-A15 — side words in %s", (locale, messages) => {
  const content = contentFor(locale, messages as typeof roMessages);

  it.each(SIDE_CARRIERS.map((detail) => [detail.code, detail] as const))(
    "%s: each of the eight branches reads its opposite on a right-hand room",
    (_code, detail) => {
      for (const side of EVERY_SIDE) {
        const rightHand = content.rejection(withSides(detail, [side]), "right");
        const leftHandOfFlip = content.rejection(
          withSides(detail, flipped([side])),
          "left",
        );
        const leftHand = content.rejection(withSides(detail, [side]), "left");

        expect(rightHand, `${side.side}/${side.reason}`).toBe(leftHandOfFlip);
        expect(rightHand, `${side.side}/${side.reason}`).not.toBe(leftHand);
        expect(
          content.rejection(withSides(detail, [side])),
          "omitted is left",
        ).toBe(leftHand);
      }
    },
  );

  it.each(SIDE_CARRIERS.map((detail) => [detail.code, detail] as const))(
    "%s: a two-side scan crosses each side and keeps the domain's order",
    (_code, detail) => {
      for (const first of EVERY_SIDE)
        for (const second of EVERY_SIDE) {
          const sides = [first, second];
          expect(content.rejection(withSides(detail, sides), "right")).toBe(
            content.rejection(withSides(detail, flipped(sides)), "left"),
          );
        }
    },
  );

  it("renders every refusal that carries no side identically for either direction", () => {
    let compared = 0;
    for (const fixture of REJECTION_FIXTURES) {
      if (carriesSides(fixture.detail)) continue;
      expect(content.rejection(fixture.detail, "right"), fixture.id).toBe(
        content.rejection(fixture.detail, "left"),
      );
      compared += 1;
    }
    expect(compared).toBeGreaterThan(30);
  });

  it("the reflected width note is the left note with its two side words exchanged", () => {
    const [toFirst, toSecond] =
      // eslint-disable-next-line no-restricted-syntax -- the claim is about the wording itself: the reflected sentence is the left one with exactly these two side words exchanged.
      locale === "ro" ? ["spre dreapta", "spre stânga"] : ["справа", "слева"];
    const note = content.panel.widthStepNote;
    const swapped = note
      .replace(toFirst, "\u0000")
      .replace(toSecond, toFirst)
      .replace("\u0000", toSecond);

    expect(note).toContain(toFirst);
    expect(note).toContain(toSecond);
    expect(content.panel.widthStepNoteRight).toBe(swapped);
  });
});

// -------------------------------------------------------------------------------------------------
// Through the panel: every placement's width refusals, left and right, against the domain verdicts.
// -------------------------------------------------------------------------------------------------

describe("7I-A15 — the panel crosses the side word for every width refusal of the seeded kitchen", () => {
  const ro = contentFor("ro", roMessages);
  const PROBE = createFakeBodyProbe();
  const records = derivePlacementRecords(
    KITCHEN_L_DESIGN,
    KITCHEN_L_BODY_CATALOG,
  );
  const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);
  const world = {
    design: KITCHEN_L_DESIGN,
    records,
    columns,
    voids: recomputeVoids(records, columns),
    catalog: KITCHEN_L_BODY_CATALOG,
  };

  function widthSectionAt(id: string, direction: "left" | "right") {
    const target = { kind: "placement", id } as const;
    const engineInput = { ...world, target, probe: PROBE };
    const panel = describePanel({
      content: ro,
      direction,
      material: PAL_KITCHEN,
      meta: describeSelection({ ...world, target }),
      offers: offersFor({
        ...world,
        target,
        cabinetDepthMm: cabinetDepthMmOf(world.design),
      }),
      buildableWidthSpanMm: buildableWidthSpanMm(world.catalog),
      rejection: null,
      widthOptions: widthOptionsFor(engineInput),
      widthSteps: widthStepsFor(engineInput),
      widthRanges:
        columnWidthChoices({
          design: world.design,
          catalog: world.catalog,
          target,
        })?.widthRangesMm ?? [],
      isBodyProbeAttached: true,
      canWrite: true,
      saveStatus: "idle",
    });
    if (panel.kind !== "open") return undefined;
    const section = panel.sections.find(
      (candidate) => candidate.kind === "width",
    );
    return section?.kind === "width" ? section : undefined;
  }

  function reasonsOf(section: NonNullable<ReturnType<typeof widthSectionAt>>) {
    return section.control === "stepper"
      ? section.steps.map((step) => step.reason)
      : section.chips.map((chip) => chip.reason);
  }

  function domainVerdicts(id: string, control: "stepper" | "choice") {
    const target = { kind: "placement", id } as const;
    const engineInput = { ...world, target, probe: PROBE };
    if (control === "stepper") {
      const steps = widthStepsFor(engineInput);
      return steps ? [steps.narrower.verdict, steps.wider.verdict] : [];
    }
    return widthOptionsFor(engineInput).map((option) => option.verdict);
  }

  it("matches the flipped-detail oracle on every placement, on both walls", () => {
    let sideCarrying = 0;
    const wallsWithSideCarrying = new Set<string>();
    for (const placement of KITCHEN_L_DESIGN.placements) {
      const left = widthSectionAt(placement.id, "left");
      const right = widthSectionAt(placement.id, "right");
      if (!left || !right) continue;
      const verdicts = domainVerdicts(placement.id, left.control);
      const rightReasons = reasonsOf(right);
      const leftReasons = reasonsOf(left);
      verdicts.forEach((verdict, index) => {
        if (verdict.status !== "refused" || !("reason" in verdict)) {
          expect(rightReasons[index]).toBe(leftReasons[index]);
          return;
        }
        const detail = verdict.reason;
        if (!carriesSides(detail)) {
          expect(rightReasons[index], placement.id).toBe(leftReasons[index]);
          return;
        }
        const sides = (detail.params as unknown as { sides: EmptySpaceSide[] })
          .sides;
        expect(rightReasons[index], placement.id).toBe(
          ro.rejection(withSides(detail, flipped(sides))),
        );
        if (sides.length > 0) {
          sideCarrying += 1;
          wallsWithSideCarrying.add(placement.wall);
        }
      });
    }
    expect(sideCarrying).toBeGreaterThan(0);
    expect([...wallsWithSideCarrying].sort()).toEqual(["A", "B"]);
  });
});
