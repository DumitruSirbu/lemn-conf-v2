import { REQUEST_STATUSES } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  decideStatusSave,
  type StatusSaveFacts,
} from "../src/staff-kitchen-actions-store.js";

const STORED_STATUSES = [null, ...REQUEST_STATUSES] as const;

function factsOf(
  storedStatus: string | null,
  seen: StatusSaveFacts["seen"],
  requested: StatusSaveFacts["requested"],
): StatusSaveFacts {
  return { kitchen: { isSent: true, storedStatus }, requested, seen };
}

describe("decideStatusSave compares the status the person saw with the one stored", () => {
  it("writes only when the stored status is the one seen and is not the one asked for, over every combination", () => {
    for (const stored of STORED_STATUSES) {
      for (const seen of REQUEST_STATUSES) {
        for (const requested of REQUEST_STATUSES) {
          const current = stored ?? "new";
          const decision = decideStatusSave(factsOf(stored, seen, requested));

          const expected =
            current !== seen
              ? "changed-meanwhile"
              : current === requested
                ? "unchanged"
                : "write";
          expect(
            decision.kind,
            `stored ${String(stored)}, seen ${seen}, asked ${requested}`,
          ).toBe(expected);
        }
      }
    }
  });

  it("names the status it replaced and the row it expects, for a write", () => {
    expect(decideStatusSave(factsOf(null, "new", "closed"))).toEqual({
      kind: "write",
      from: "new",
      expectedStored: null,
    });
    expect(
      decideStatusSave(factsOf("contacted", "contacted", "closed")),
    ).toEqual({
      kind: "write",
      from: "contacted",
      expectedStored: "contacted",
    });
  });

  it("judges the stored text and the kitchen before it compares", () => {
    const seen = "contacted";
    expect(
      decideStatusSave(factsOf("from-a-later-build", seen, "closed")),
    ).toEqual({ kind: "status-not-recognised" });
    expect(
      decideStatusSave({
        kitchen: { isSent: false, storedStatus: "new" },
        requested: "closed",
        seen,
      }),
    ).toEqual({ kind: "not-sent" });
    expect(
      decideStatusSave({ kitchen: null, requested: "closed", seen }),
    ).toEqual({ kind: "kitchen-not-found" });
  });
});
