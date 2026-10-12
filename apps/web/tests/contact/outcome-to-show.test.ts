import { describe, expect, it } from "vitest";

import { outcomeToShow } from "@/contact/contact-outcome";
import type {
  ContactSubmissionPhase,
  UnsentOutcome,
} from "@/contact/use-contact-submission";

// Which answers the form tells beside its fields. `unanswered` and `failed` have the screen of frame 5B, so the form
// holds no sentence for them even where a caller hands it one.

function failedWith(outcome: UnsentOutcome): ContactSubmissionPhase {
  return { kind: "failed", outcome, waitsUntilMs: undefined };
}

describe("outcomeToShow", () => {
  it.each([
    ["a request with no answer", { kind: "unanswered" }],
    ["an answered failure", { kind: "failed" }],
  ] as const)("tells %s nowhere beside the form", (_name, outcome) => {
    expect(outcomeToShow(failedWith(outcome), false)).toBeUndefined();
    expect(outcomeToShow(failedWith(outcome), true)).toBeUndefined();
  });

  it.each([
    { kind: "refused", issues: [] },
    { kind: "conflict" },
    { kind: "design-not-current" },
    { kind: "does-not-fit" },
  ] as const)("tells a $kind answer beside the form", (outcome) => {
    expect(outcomeToShow(failedWith(outcome), false)?.outcome).toBe(outcome);
  });

  it("tells a limited send only while its wait is running", () => {
    const limited = failedWith({ kind: "limited", waitSeconds: 60 });

    expect(outcomeToShow(limited, true)?.outcome.kind).toBe("limited");
    expect(outcomeToShow(limited, false)).toBeUndefined();
  });

  it.each([
    { kind: "idle" },
    { kind: "sending" },
    { kind: "sent", reference: "LM-1" },
  ] as const)("tells nothing of a $kind phase", (phase) => {
    expect(outcomeToShow(phase, true)).toBeUndefined();
  });
});
