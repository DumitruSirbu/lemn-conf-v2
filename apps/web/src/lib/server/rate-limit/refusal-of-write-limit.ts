import "server-only";

import type { NextResponse } from "next/server";

import type {
  RateLimitDecision,
  UnavailableCause,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  policyNameOf,
  type PolicyChoice,
} from "@/lib/server/rate-limit/limit-policy";

/** What a write's limit decided, and under which policy. */
export interface WriteJudgement {
  readonly decision: RateLimitDecision;
  readonly policy: PolicyChoice;
}

/** How one kind of write answers and what it writes down: the two answers, and the two lines, which are each the
 *  write's own. */
export interface WriteAnswers {
  readonly refused: (retryAfterSeconds: number) => NextResponse;
  readonly unavailable: () => NextResponse;
  readonly reportRefused: (policyName: string) => void;
  readonly reportUnavailable: (cause: UnavailableCause) => void;
}

/**
 * The answer that stops a write, or nothing when it may go on: the one routine for every write that is limited, so that
 * each fails closed the same way. Allow goes on; a refusal answers its wait and is written down; whatever cannot be
 * judged, a throw anywhere here included, answers as unavailable with its cause. The refusal is built before it is
 * written down, so a wait that cannot be told is the unavailable answer and not a refusal.
 */
export async function refusalOfWriteLimit(
  judge: () => Promise<WriteJudgement>,
  answers: WriteAnswers,
): Promise<NextResponse | undefined> {
  try {
    return answerOf(await judge(), answers);
  } catch {
    answers.reportUnavailable("judgement-failed");
    return answers.unavailable();
  }
}

function answerOf(
  { decision, policy }: WriteJudgement,
  answers: WriteAnswers,
): NextResponse | undefined {
  if (decision.kind === "allow") return undefined;
  if (decision.kind === "unavailable") {
    answers.reportUnavailable(decision.cause);
    return answers.unavailable();
  }
  const response = answers.refused(decision.retryAfterSeconds);
  answers.reportRefused(policyNameOf(policy));
  return response;
}
