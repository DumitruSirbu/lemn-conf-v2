// Q1b-a on the shop's notice: the notice prints the review of the STORED snapshot (ADR 0154 decision 8), so the depth
// line the stored total counts has to be one of its lines, in the text part and in the HTML part alike.
import {
  DEEP_CABINET_DEPTH_MM,
  SAMPLE_PRICE_BOOK,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { composeLeadNotice } from "@/lib/server/mail/lead-notification";

import { ro } from "../../../support/romanian-content";
import { VARIED_L_ARM } from "../../../support/varied-kitchens";
import {
  designSubmission,
  noticeInput,
  sendableKitchensOf,
  snapshotOf,
} from "./lead-notice-fixtures";

function firstKitchen() {
  const [kitchen] = sendableKitchensOf(VARIED_L_ARM);
  if (kitchen === undefined)
    throw new Error("the L arm has a sendable kitchen");
  return kitchen;
}

function noticeOfKitchenBuiltAt(cabinetDepthMm: number | undefined) {
  const { design } = firstKitchen();
  const built = {
    ...design,
    settings: { ...design.settings, cabinetDepthMm },
  };
  const snapshot = snapshotOf(built);
  if (snapshot === undefined) throw new Error("the kitchen is sendable");
  const message = composeLeadNotice(
    noticeInput(designSubmission({ snapshot })),
  );
  return { snapshot, message };
}

describe("the shop's notice and the depth line", () => {
  it("stores a depth line in the 700 mm snapshot that the notice is printed from, and none at the default depth", () => {
    const deep = noticeOfKitchenBuiltAt(DEEP_CABINET_DEPTH_MM).snapshot;
    const standard = noticeOfKitchenBuiltAt(undefined).snapshot;

    expect(deep.priced.lines.some((line) => line.kind === "depth")).toBe(true);
    expect(standard.priced.lines.some((line) => line.kind === "depth")).toBe(
      false,
    );
  });

  it("states no depth line for a kitchen priced without one, as before the cut-over", () => {
    const { message } = noticeOfKitchenBuiltAt(undefined);
    const anyDepthLine = new RegExp(
      ro.priceBreakdown.depthLine(DEEP_CABINET_DEPTH_MM, 0).replace(/0 %$/, ""),
    );

    expect(message.text).not.toMatch(anyDepthLine);
    expect(message.html ?? "").not.toMatch(anyDepthLine);
  });

  // KNOWN GAP, named and loud (an open question to the architect, reported by Q1b). The stored `DepthPriceLine` carries
  // the depth (700) and the amount but not the percent, `depthLine` needs a percent, and the notice may neither read the
  // live book (the figure it prints is the stored one, ADR 0154 decision 8, and the book may have moved since) nor invent
  // a number. Until the percent is stored on the line (or another wording is ruled), the notice lists every other line and
  // omits this one, while the stored total counts it. `it.fails` runs the assertion the notice should meet and passes
  // while it does not; the day the notice carries the line it goes red, and the instruction is to delete `.fails`.
  it.fails(
    "KNOWN GAP (notice, depth row): prints the depth line the stored total counts, in the text and in the HTML",
    () => {
      const { message } = noticeOfKitchenBuiltAt(DEEP_CABINET_DEPTH_MM);
      const depthLine = ro.priceBreakdown.depthLine(
        DEEP_CABINET_DEPTH_MM,
        SAMPLE_PRICE_BOOK.depthRule.deepCabinetPercent,
      );

      expect(message.text).toContain(depthLine);
      expect(message.html).toContain(depthLine);
    },
  );
});
