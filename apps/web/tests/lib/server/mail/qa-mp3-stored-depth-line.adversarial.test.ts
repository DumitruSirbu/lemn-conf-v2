// Adversarial QA for the MP-3 combine after its fix round: what a STORED depth line may hold when the shop's notice and
// the review word it. The fix round refuses a percent that is not a finite number (`DepthLineWithoutPercentError`) and a
// depth line with no material row to follow (`DepthLineWithoutMaterialRowError`); this file attacks the other stored
// values that reach the label, and the placement rule's two anchors.
import {
  DEEP_CABINET_DEPTH_MM,
  type SubmissionSnapshot,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  composeLeadNotice,
  NoticeKitchenError,
} from "@/lib/server/mail/lead-notification";
import {
  DepthLineWithoutMaterialRowError,
  DepthLineWithoutPercentError,
  describeDepthLine,
  listWholeKitchenRows,
} from "@/price/price-breakdown-model";

import {
  builtDeep,
  depthLineOf,
  snapshotAtPercent,
} from "../../../support/deep-priced-kitchens";
import { ro } from "../../../support/romanian-content";
import { VARIED_L_ARM } from "../../../support/varied-kitchens";
import {
  designSubmission,
  noticeInput,
  sendableKitchensOf,
} from "./lead-notice-fixtures";
import { parseNotice } from "./notice-html-dom-support";

const [FIRST_KITCHEN] = sendableKitchensOf(VARIED_L_ARM);
const L_DEEP = builtDeep(required(FIRST_KITCHEN?.design));
const STORED = snapshotAtPercent(L_DEEP, 12);

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("the arm has a sendable kitchen");
  return value;
}

function noticeOf(snapshot: SubmissionSnapshot) {
  const message = composeLeadNotice({
    ...noticeInput(designSubmission({ snapshot })),
    content: ro,
  });
  return { text: message.text, html: message.html ?? "" };
}

/** The snapshot as if stored with `depthMm` on its depth line, the rest as priced. */
function withDepthMm(
  snapshot: SubmissionSnapshot,
  depthMm: unknown,
): SubmissionSnapshot {
  return {
    ...snapshot,
    priced: {
      ...snapshot.priced,
      lines: snapshot.priced.lines.map((line) =>
        line.kind === "depth" ? { ...line, depthMm: depthMm as number } : line,
      ),
    },
  };
}

function withoutLines(
  snapshot: SubmissionSnapshot,
  isRemoved: (kind: string) => boolean,
): SubmissionSnapshot {
  return {
    ...snapshot,
    priced: {
      ...snapshot.priced,
      lines: snapshot.priced.lines.filter((line) => !isRemoved(line.kind)),
    },
  };
}

// The percent has a guard; the depth printed beside it has none. `depthMm` has been on the stored line since P2, so
// this is not a gap in old data, but the label is worded from the stored line alone (ADR 0154 decision 8) and a value
// that is not a depth must be refused the way a value that is not a percent is, never printed as "Adâncime NaN mm" (or,
// for null, as "0 mm" without a sound). That markup and line breaks do not reach the output today is the number format
// of the ICU argument turning them into NaN, not a validation.
describe("a stored depth line whose depth is not a finite number is refused, as one whose percent is not", () => {
  const NOT_A_DEPTH: readonly [string, unknown][] = [
    ["is absent", undefined],
    ["is null", null],
    ["is NaN", Number.NaN],
    ["is infinite", Number.POSITIVE_INFINITY],
    ["is markup", '<img src=x onerror="alert(1)">'],
    ["holds a line break", "7\r\nBcc: x@y.z"],
  ];

  it.each(NOT_A_DEPTH)(
    "the notice refuses the kitchen when the stored depth %s",
    (_description, depthMm) => {
      expect(() => noticeOf(withDepthMm(STORED, depthMm))).toThrow(
        new NoticeKitchenError("review-not-sendable"),
      );
    },
  );

  it.each(NOT_A_DEPTH)(
    "describeDepthLine throws when the line's depth %s, and prints no label",
    (_description, depthMm) => {
      const line = { ...depthLineOf(STORED.priced) };

      expect(() =>
        describeDepthLine({ ...line, depthMm: depthMm as number }, ro),
      ).toThrow();
    },
  );

  it.each(NOT_A_DEPTH)(
    "whatever the notice does with a stored depth that %s, no markup and no line break reaches it",
    (_description, depthMm) => {
      let printed: { text: string; html: string } | undefined;
      try {
        printed = noticeOf(withDepthMm(STORED, depthMm));
      } catch (error) {
        expect(error).toBeInstanceOf(NoticeKitchenError);
      }
      if (printed === undefined) return;

      expect(printed.html).not.toContain("<img");
      expect(printed.text).not.toContain("Bcc:");
      expect(
        parseNotice(printed.html).elements.map((e) => e.tagName),
      ).not.toContain("IMG");
    },
  );

  it("still words the depth the domain stores, 700, with the digits of the number", () => {
    const { text } = noticeOf(withDepthMm(STORED, DEEP_CABINET_DEPTH_MM));

    expect(text).toContain(ro.priceBreakdown.depthLine(700, 12));
  });
});

describe("a stored depth line is placed after the material row the builder produced, or refused", () => {
  it("refuses a stored snapshot whose depth line has no material line, in the notice, by the value-free error", () => {
    const noMaterial = withoutLines(STORED, (kind) => kind === "material");

    expect(() => noticeOf(noMaterial)).toThrow(
      new NoticeKitchenError("review-not-sendable"),
    );
  });

  it("lists a stored depth line after the material row even when the hardware row is stored before it", () => {
    const reversed: SubmissionSnapshot = {
      ...STORED,
      priced: {
        ...STORED.priced,
        lines: [...STORED.priced.lines].reverse(),
      },
    };
    const lines = noticeOf(reversed).text.split("\n");
    const label = ro.priceBreakdown.depthLine(DEEP_CABINET_DEPTH_MM, 12);
    const at = lines.findIndex((line) => line.startsWith(`${label}: `));

    expect(
      lines[at - 1]?.startsWith(
        ro.priceBreakdown.wholeKitchenCategories.material,
      ),
    ).toBe(true);
  });

  it("listWholeKitchenRows refuses a depth line whose anchor key names no row, and one with no anchor at all", () => {
    const depthLine = {
      key: "kitchen:depth",
      label: "l",
      scope: "s",
      amountText: "a",
    };
    const wholeKitchenRows = [
      { key: "kitchen:hardware", label: "h", amountText: "1" },
      { key: "kitchen:material", label: "m", amountText: "2" },
    ];

    expect(() =>
      listWholeKitchenRows({
        wholeKitchenRows,
        depthLine,
        depthLineAfterKey: "kitchen:elsewhere",
      }),
    ).toThrow(DepthLineWithoutMaterialRowError);
    expect(() => listWholeKitchenRows({ wholeKitchenRows, depthLine })).toThrow(
      DepthLineWithoutMaterialRowError,
    );
  });

  it("describeDepthLine throws its own error for a percent-less line, never a label", () => {
    expect(() =>
      describeDepthLine(
        {
          ...depthLineOf(STORED.priced),
          deepCabinetPercent: undefined as unknown as number,
        },
        ro,
      ),
    ).toThrow(DepthLineWithoutPercentError);
  });
});
