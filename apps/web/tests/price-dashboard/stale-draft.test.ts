// A draft that no longer makes a book is listed change by change, so the valid change beside a refused one can be taken
// back on its own. What the person can take back alone is what the revert route takes, and a created or deleted row is
// one line with everything the draft says of it, which only the whole draft gives up.
import { describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { readPendingDraft } from "@/price-dashboard/publish-model";
import { staleDraftOf } from "@/price-dashboard/stale-draft";

import {
  ACTIVE,
  CABINET_NAMES,
  change,
  createTierChanges,
  NEW_TIER,
} from "./publish-structural-rows.support";

const VALID = change(
  { kind: "cabinet", ruleId: "cabinet.base-cabinet", field: "anchorMinor" },
  400_000,
);
const STALE = change(
  { kind: "cabinet", ruleId: "cabinet.gone", field: "anchorMinor" },
  5_000,
);
const BULK: readonly DraftChange[] = ["a", "b"].map(
  (suffix) =>
    ({
      address: {
        kind: "cabinet",
        ruleId: `cabinet.base-${suffix}`,
        field: "anchorMinor",
      },
      value: 100_000,
      groupId: "group-1",
      bulk: { percent: 5, scope: "all" },
    }) as DraftChange,
);
const [firstOfBulk = VALID] = BULK;
const PUBLISHED_TIER = "hardware.soft-close";
const deletion = change(
  { kind: "item-deleted", item: { kind: "hardware", tierId: PUBLISHED_TIER } },
  true,
);
const rateOfPublishedTier = change(
  { kind: "hardware", tierId: PUBLISHED_TIER, field: "perHingeMinor" },
  2_000,
);

function linesOf(changes: readonly DraftChange[]) {
  const stale = staleDraftOf({
    active: ACTIVE,
    changes,
    cabinetNames: CABINET_NAMES,
  });
  if (stale.kind !== "lines") throw new Error("the draft has no lines");
  return stale.lines;
}

describe("a draft with a change that cannot be applied", () => {
  it("is a refused draft, whose valid change is listed beside the refused one, each with its own revert", () => {
    expect(
      readPendingDraft({
        active: ACTIVE,
        changes: [VALID, STALE],
        cabinetNames: CABINET_NAMES,
      }).kind,
    ).toBe("candidate-refused");

    expect(linesOf([VALID, STALE])).toEqual([
      expect.objectContaining({
        isRefused: false,
        revert: { kind: "change", address: VALID.address },
      }),
      expect.objectContaining({
        isRefused: true,
        revert: { kind: "change", address: STALE.address },
      }),
    ]);
  });

  it("marks the refused change by what refused it, not by its place: the change before it stays valid", () => {
    expect(linesOf([STALE, VALID]).map(({ isRefused }) => isRefused)).toEqual([
      true,
      false,
    ]);
  });

  it("is one line for a bulk action, refused when any of its changes is, reverted by its group", () => {
    const stale = {
      ...BULK[1],
      address: {
        kind: "cabinet",
        ruleId: "cabinet.gone",
        field: "anchorMinor",
      },
    } as DraftChange;

    expect(linesOf([VALID, ...BULK])).toHaveLength(2);
    expect(linesOf([VALID, firstOfBulk, stale])).toEqual([
      expect.objectContaining({ isRefused: false }),
      expect.objectContaining({
        isRefused: true,
        revert: { kind: "group", groupId: "group-1" },
      }),
    ]);
  });
});

describe("a row the draft creates or deletes", () => {
  it("is one line with its rates and words, and no revert, which would take the whole row away", () => {
    const lines = linesOf([...createTierChanges(), STALE]);

    expect(createTierChanges().length).toBeGreaterThan(2);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.key).toContain(NEW_TIER);
    expect(lines[0]?.revert).toBeUndefined();
    expect(lines[1]?.revert).toEqual({
      kind: "change",
      address: STALE.address,
    });
  });

  it("is one line for a deleted row of the book with the prices set on it, and no revert", () => {
    const lines = linesOf([rateOfPublishedTier, deletion, STALE]);

    expect(lines).toHaveLength(2);
    expect(lines[0]?.revert).toBeUndefined();
    expect(lines[1]?.revert).toEqual({
      kind: "change",
      address: STALE.address,
    });
  });

  it("is one line for a row created and deleted again", () => {
    const deletesCreated = change(
      { kind: "item-deleted", item: { kind: "hardware", tierId: NEW_TIER } },
      true,
    );

    const lines = linesOf([...createTierChanges(), deletesCreated, STALE]);

    expect(lines).toHaveLength(2);
    expect(lines[0]?.revert).toBeUndefined();
  });

  it("is refused when any change of the row is", () => {
    const refusedRate = change(
      { kind: "hardware", tierId: PUBLISHED_TIER, field: "perHingeMinor" },
      -5,
    );

    expect(linesOf([refusedRate, deletion])[0]?.isRefused).toBe(true);
  });
});

describe("a draft whose whole book is refused", () => {
  it("names no line, since no change is the one to blame, and offers no revert", () => {
    const wholeBookRefused = {
      ...ACTIVE,
      currency: "EUR",
    } as unknown as typeof ACTIVE;

    expect(
      staleDraftOf({
        active: wholeBookRefused,
        changes: [VALID],
        cabinetNames: CABINET_NAMES,
      }),
    ).toEqual({ kind: "whole-book" });
  });
});
