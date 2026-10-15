import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

import type {
  UnavailableCause,
  WriteJudgement,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  MINT_POLICY,
  type PolicyChoice,
} from "@/lib/server/rate-limit/limit-policy";
import { refusalOfWriteLimit } from "@/lib/server/rate-limit/refusal-of-write-limit";

const CHOSEN: PolicyChoice = { status: "chosen", policy: MINT_POLICY };
const NOT_CHOSEN: PolicyChoice = { status: "unavailable", variable: undefined };
const THE_REFUSAL = new NextResponse("refused", { status: 429 });
const THE_UNAVAILABLE = new NextResponse("unavailable", { status: 503 });

/** The answers of one write, with what each wrote down kept in order. */
function answers(
  refused: (seconds: number) => NextResponse = () => THE_REFUSAL,
) {
  const written: string[] = [];
  return {
    written,
    answers: {
      refused: vi.fn(refused),
      unavailable: () => THE_UNAVAILABLE,
      reportRefused: (policy: string) => {
        written.push(`refused:${policy}`);
      },
      reportUnavailable: (cause: UnavailableCause) => {
        written.push(`unavailable:${cause}`);
      },
    },
  };
}

function judging(judgement: WriteJudgement): () => Promise<WriteJudgement> {
  return () => Promise.resolve(judgement);
}

describe("refusalOfWriteLimit: one routine for every limited write", () => {
  it("lets an allowed write go on, writing nothing", async () => {
    const { answers: made, written } = answers();

    const answer = await refusalOfWriteLimit(
      judging({ decision: { kind: "allow" }, policy: CHOSEN }),
      made,
    );

    expect(answer).toBeUndefined();
    expect(written).toEqual([]);
  });

  it("answers a refusal with its wait, and writes it down under the policy's name", async () => {
    const { answers: made, written } = answers();

    const answer = await refusalOfWriteLimit(
      judging({
        decision: { kind: "refuse", retryAfterSeconds: 90 },
        policy: CHOSEN,
      }),
      made,
    );

    expect(answer).toBe(THE_REFUSAL);
    expect(made.refused).toHaveBeenCalledWith(90);
    expect(written).toEqual([`refused:${MINT_POLICY.name}`]);
  });

  it("names no policy when none was chosen", async () => {
    const { answers: made, written } = answers();

    await refusalOfWriteLimit(
      judging({
        decision: { kind: "refuse", retryAfterSeconds: 1 },
        policy: NOT_CHOSEN,
      }),
      made,
    );

    expect(written).toEqual(["refused:none"]);
  });

  it.each(["store-failed", "deadline-passed", "digester-unusable"] as const)(
    "answers a judgement that could not be made, %s, as unavailable with that cause written down",
    async (cause) => {
      const { answers: made, written } = answers();

      const answer = await refusalOfWriteLimit(
        judging({ decision: { kind: "unavailable", cause }, policy: CHOSEN }),
        made,
      );

      expect(answer).toBe(THE_UNAVAILABLE);
      expect(written).toEqual([`unavailable:${cause}`]);
    },
  );

  it("answers a judge that throws as unavailable, judgement-failed, keeping nothing of what it threw", async () => {
    const { answers: made, written } = answers();

    const answer = await refusalOfWriteLimit(
      () => Promise.reject(new Error("MARKER-8841")),
      made,
    );

    expect(answer).toBe(THE_UNAVAILABLE);
    expect(written).toEqual(["unavailable:judgement-failed"]);
    expect(JSON.stringify(written)).not.toContain("MARKER");
  });

  it("answers a judge that throws at once, before it returns a promise, the same way", async () => {
    const { answers: made, written } = answers();

    const answer = await refusalOfWriteLimit(() => {
      throw new Error("at once");
    }, made);

    expect(answer).toBe(THE_UNAVAILABLE);
    expect(written).toEqual(["unavailable:judgement-failed"]);
  });

  it("builds a refusal before it writes it down: a wait nobody can tell is unavailable, none is written", async () => {
    const { answers: made, written } = answers(() => {
      throw new RangeError("the wait cannot be told");
    });

    const answer = await refusalOfWriteLimit(
      judging({
        decision: { kind: "refuse", retryAfterSeconds: 0 },
        policy: CHOSEN,
      }),
      made,
    );

    expect(answer).toBe(THE_UNAVAILABLE);
    expect(written).toEqual(["unavailable:judgement-failed"]);
  });
});
