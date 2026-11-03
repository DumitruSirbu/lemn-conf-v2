// A draft that no longer makes a book is listed change by change, so the valid change beside a refused one can be taken
// back on its own. What the person can take back alone is what the revert route takes.
import { describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { readPendingDraft } from "@/price-dashboard/publish-model";
import { staleChangesOf } from "@/price-dashboard/stale-draft";

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

const linesOf = (changes: readonly DraftChange[]) =>
  staleChangesOf({ active: ACTIVE, changes, cabinetNames: CABINET_NAMES });

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
    const lines = linesOf([STALE, VALID]);

    expect(lines.map(({ isRefused }) => isRefused)).toEqual([true, false]);
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

  it("offers no revert on a creation, a deletion or a created row's words, which only the whole draft gives up", () => {
    const deletion = change(
      {
        kind: "item-deleted",
        item: { kind: "hardware", tierId: "hardware.soft-close" },
      },
      true,
    );
    const lines = linesOf([...createTierChanges(), deletion, STALE]);

    const creation = lines.find(
      ({ key }) =>
        key.includes(NEW_TIER) && key.includes("hardware-tier-created"),
    );
    const removal = lines.find(({ key }) => key.includes("item-deleted"));
    expect(creation).toBeDefined();
    expect(creation?.revert).toBeUndefined();
    expect(removal).toBeDefined();
    expect(removal?.revert).toBeUndefined();
    expect(lines.at(-1)?.revert).toEqual({
      kind: "change",
      address: STALE.address,
    });
  });
});
