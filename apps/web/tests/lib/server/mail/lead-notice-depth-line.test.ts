// Q1b-a on the shop's notice: the notice prints the review of the STORED snapshot (ADR 0154 decision 8), so the depth
// line the stored total counts has to be one of its lines, in the text part and in the HTML part alike.
import {
  canonicalSerializeDesign,
  DEEP_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type PricedDesign,
  type SubmissionSnapshot,
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

// Written as JSON so nothing here can type it into today's shape: a flat hardware line and a flat material line, and no
// depth line, as the retired book priced the one body it holds.
const STORED_BEFORE_THE_CUT_OVER = JSON.parse(`{
  "currency": "MDL", "pricingVersion": "sample-2026-09", "status": "estimate", "amountsProvisional": true,
  "lines": [
    { "lineId": "placement:p0:cabinet", "kind": "cabinet", "ruleId": "cabinet.base-sink", "placementId": "p0",
      "buildId": "base-sink-800", "pricedAsBuildId": "base-sink", "label": "base-sink", "widthMm": 800,
      "suppliedBy": "manufacturer", "quantity": 1, "unitAmountMinor": 485600, "amountMinor": 485600 },
    { "lineId": "kitchen:hardware", "kind": "hardware", "ruleId": "hardware.standard", "tierId": "hardware.standard",
      "name": "Standard", "description": "d", "quantity": 1, "unitAmountMinor": 1760, "amountMinor": 1760 },
    { "lineId": "kitchen:material", "kind": "material", "ruleId": "material.painted-mdf", "tierId": "material.painted-mdf",
      "name": "MDF", "description": "d", "quantity": 1, "unitAmountMinor": 900000, "amountMinor": 900000 }
  ],
  "totalMinor": 1387360, "overflowingPlacementIds": [], "totalIsFlagged": false
}`) as PricedDesign;

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

  it("prints a snapshot stored before the cut-over, which has no depth line, as the stored hardware and material lines and nothing more", () => {
    const onlyP0 = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter((p) => p.id === "p0"),
    };
    const stored: SubmissionSnapshot = {
      document: canonicalSerializeDesign(onlyP0),
      priced: STORED_BEFORE_THE_CUT_OVER,
    };

    const message = composeLeadNotice(
      noticeInput(designSubmission({ snapshot: stored })),
    );

    expect(message.text).toContain(
      ro.priceBreakdown.wholeKitchenLabel(
        ro.priceBreakdown.wholeKitchenCategories.material,
        "MDF",
      ),
    );
    expect(message.text).not.toContain("adaos");
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
