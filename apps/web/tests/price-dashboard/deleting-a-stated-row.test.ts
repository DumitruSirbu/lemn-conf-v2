// Delete is on in the dashboard. The client leaves a deletion of a stated row to the draft route, and a deleted
// row takes itself back by its own address, on the publish page's D7 and on the list of a draft that no longer makes a
// book. A field of a deleted row still carries no ↺ of its own.
import { describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { FETCHING_ITEM_LIFECYCLE_CLIENT } from "@/price-dashboard/fetching-item-lifecycle-client";
import {
  readPendingDraft,
  type RowView,
} from "@/price-dashboard/publish-model";
import { staleDraftOf } from "@/price-dashboard/stale-draft";

import {
  ACTIVE,
  CABINET_NAMES,
  change,
} from "./publish-structural-rows.support";

const PUBLISHED_TIER = "hardware.soft-close";
const DELETION = change(
  { kind: "item-deleted", item: { kind: "hardware", tierId: PUBLISHED_TIER } },
  true,
);
const RATE_OF_DELETED_TIER = change(
  { kind: "hardware", tierId: PUBLISHED_TIER, field: "perHingeMinor" },
  2_000,
);
const STALE = change(
  { kind: "cabinet", ruleId: "cabinet.gone", field: "anchorMinor" },
  5_000,
);
const REVERT_BY_THE_DELETION = { kind: "change", address: DELETION.address };

function pendingRows(changes: readonly DraftChange[]): readonly RowView[] {
  const reading = readPendingDraft({
    active: ACTIVE,
    changes,
    cabinetNames: CABINET_NAMES,
  });
  if (reading.kind !== "ready") throw new Error(`read as ${reading.kind}`);
  return reading.view.sections.flatMap((section) => section.rows);
}

function staleLines(changes: readonly DraftChange[]) {
  const stale = staleDraftOf({
    active: ACTIVE,
    changes,
    cabinetNames: CABINET_NAMES,
  });
  if (stale.kind !== "lines") throw new Error("the draft has no lines");
  return stale.lines;
}

describe("the client of a build with a server behind the screen", () => {
  it("leaves the deletion of a row the active book states to the draft route", () => {
    expect(FETCHING_ITEM_LIFECYCLE_CLIENT.canWrite).toBe(true);
    expect(FETCHING_ITEM_LIFECYCLE_CLIENT.canDeleteStatedItems).toBe(true);
  });
});

describe("the publish page's row of a deleted class", () => {
  it("takes the deletion back by its own address", () => {
    const [deleted] = pendingRows([DELETION]).filter(
      (row) => row.kind === "row",
    );

    expect(deleted).toMatchObject({
      change: "deleted",
      revert: REVERT_BY_THE_DELETION,
    });
  });

  it("offers no ↺ on a rate of the deleted class, which the route would refuse as not editable", () => {
    const rates = pendingRows([RATE_OF_DELETED_TIER, DELETION]).filter(
      (row) => row.kind === "field" && row.address.kind === "hardware",
    );

    expect(rates.length).toBeGreaterThan(0);
    expect(rates.map((row) => row.revert)).toEqual(rates.map(() => undefined));
  });
});

describe("the stale-draft line of a deleted class", () => {
  it.each([
    { order: "deletion first", changes: [DELETION, RATE_OF_DELETED_TIER] },
    { order: "rate first", changes: [RATE_OF_DELETED_TIER, DELETION] },
  ])(
    "reverts by the deletion's address, $order, and names no rate to take back",
    ({ changes }) => {
      const lines = staleLines([...changes, STALE]);

      expect(lines).toHaveLength(2);
      expect(lines[0]?.revert).toEqual(REVERT_BY_THE_DELETION);
      expect(lines[1]?.revert).toEqual({
        kind: "change",
        address: STALE.address,
      });
    },
  );
});
