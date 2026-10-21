// The whole of a limit, for a control that must stay off until it ends. The account forms hold their submit button for a
// short wait only (`waitOfFeedback`), because a person may try again after a longer one; the staff screens' retry and
// "load more" hold for every wait the answer states, whatever form the notice tells it in.
import { describe, expect, it } from "vitest";

import {
  fullWaitOfFeedback,
  waitOfFeedback,
} from "@/account/account-form-parts";
import { rateLimitNoticeOf, waitFrom } from "@/account/account-answer";

const NOW_MS = Date.UTC(2026, 10, 3, 9, 0, 0);

function feedbackOf(retryAfter: string) {
  return {
    kind: "rate-limited",
    notice: rateLimitNoticeOf(waitFrom(retryAfter), NOW_MS),
  };
}

describe("fullWaitOfFeedback", () => {
  it.each([
    ["a countdown", "30", 30],
    ["whole minutes", "600", 600],
    ["whole minutes, rounded up", "601", 660],
    ["a clock time", "7200", 7200],
    ["the longest window", "90000", 90_000],
  ])("ends %s at the instant the wait ends", (_, retryAfter, seconds) => {
    expect(fullWaitOfFeedback(feedbackOf(retryAfter))).toEqual({
      endsAtMs: NOW_MS + seconds * 1000,
    });
  });

  it("holds nothing for a wait the answer did not state", () => {
    expect(fullWaitOfFeedback(feedbackOf("soon"))).toBeUndefined();
  });

  it("holds nothing for a notice built without an end", () => {
    expect(
      fullWaitOfFeedback({
        kind: "rate-limited",
        notice: { kind: "minutes", minutes: 12 },
      }),
    ).toBeUndefined();
  });

  it("holds nothing for a failure that is not a limit, whatever it carries", () => {
    expect(
      fullWaitOfFeedback({
        kind: "unavailable",
        notice: { kind: "countdown", endsAtMs: NOW_MS + 5000 },
      }),
    ).toBeUndefined();
    expect(fullWaitOfFeedback({ kind: "offline" })).toBeUndefined();
  });
});

describe("waitOfFeedback keeps to the short wait, as the account forms rely on", () => {
  it("holds a countdown and lets a longer wait go", () => {
    expect(waitOfFeedback(feedbackOf("30"))).toEqual({
      endsAtMs: NOW_MS + 30_000,
    });
    expect(waitOfFeedback(feedbackOf("600"))).toBeUndefined();
    expect(waitOfFeedback(feedbackOf("7200"))).toBeUndefined();
  });
});
