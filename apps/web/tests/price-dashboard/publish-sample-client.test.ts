// The in-memory client the builds that show samples write through: it answers as the real routes will, so the screens'
// refusals can be seen before those routes exist.
import { applyChanges, type DraftChange } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { makeSamplePublishClient } from "@/price-dashboard/publish-sample-client";
import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";

const STATE = SAMPLE_PUBLISH_PAGE.state;

function publishRequest(label: string) {
  return {
    expectedDraftRevision: STATE.draft.draftRevision,
    expectedActiveSequence: STATE.active.sequenceNumber,
    expectedAvailabilityRevision: STATE.active.availability.revision,
    label,
    note: "",
  };
}

describe("a name the client refuses", () => {
  it.each([
    ["", "TEXT_EMPTY"],
    ["   ", "TEXT_EMPTY"],
    ["x".repeat(81), "TEXT_TOO_LONG"],
    ["a\u0007b", "TEXT_FORBIDDEN_CHARACTER"],
    ["a\u2028b", "TEXT_FORBIDDEN_CHARACTER"],
  ])("refuses %j as %s", async (label, code) => {
    const client = makeSamplePublishClient({
      state: STATE,
      archived: new Map(),
    });

    expect(await client.publish(publishRequest(label))).toEqual({
      kind: "invalid",
      code,
    });
  });

  it("accepts a name of exactly the book's bound, with ordinary punctuation", async () => {
    const client = makeSamplePublishClient({
      state: STATE,
      archived: new Map(),
    });

    const outcome = await client.publish(publishRequest(`${"x".repeat(79)}.`));

    expect(outcome.kind).toBe("published");
  });
});

describe("a draft the catalogue would refuse", () => {
  it("is told as refused, not as a conflict that a re-read could clear", async () => {
    const refused: readonly DraftChange[] = [
      { address: { kind: "depth-rule" }, value: 10_000 },
    ];
    expect(applyChanges(STATE.active.book, refused).ok).toBe(false);
    const client = makeSamplePublishClient({
      state: { ...STATE, draft: { draftRevision: "1", changes: refused } },
      archived: new Map(),
    });

    expect(await client.publish(publishRequest("Ajustari"))).toEqual({
      kind: "candidate-refused",
    });
  });
});

describe("a restore of a version it does not hold", () => {
  it("answers version-not-found", async () => {
    const client = makeSamplePublishClient({
      state: STATE,
      archived: new Map(),
    });

    expect(
      await client.restore("nobody", { expectedDraftRevision: "1" }),
    ).toEqual({ kind: "version-not-found" });
  });
});
