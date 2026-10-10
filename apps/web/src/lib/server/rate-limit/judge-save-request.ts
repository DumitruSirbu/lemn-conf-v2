import "server-only";

import type { NextResponse } from "next/server";

import { reportSaveLimit } from "@/lib/server/design-failure-log";
import { subjectOfWriteCredentialHash } from "@/lib/server/rate-limit/bucket-subject";
import {
  enforceRateLimit,
  judgeStepsInSequence,
  RATE_LIMIT_DEADLINE_MS,
  type RateLimitDecision,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  blockBucketRequestFor,
  judgeBlockBucket,
  type BlockBucketRequest,
} from "@/lib/server/rate-limit/judge-block-bucket";
import {
  choosePolicy,
  type PolicyChoice,
} from "@/lib/server/rate-limit/limit-policy";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import {
  saveLimitReachedResponse,
  saveUnavailableResponse,
} from "@/lib/server/rate-limit/rate-limited-response";
import {
  refusalOfWriteLimit,
  type WriteJudgement,
} from "@/lib/server/rate-limit/refusal-of-write-limit";

/**
 * Judges one save in two steps, each started only when the one before it allowed: the network's block first, and only
 * a request the block passed is counted against its write credential. A refusal at the block counts the block alone and
 * writes no row for a credential, which anyone could otherwise invent. Both steps take the one instant, and so the one
 * window, so a save judged across an hour's turn tells one wait. The credential's subject is made from the hash the
 * route read, through its constructor alone, and a hash it refuses is a judgement that failed. The policy answered is
 * the one of the step that decided.
 */
export async function judgeSaveRequest(
  headers: HeaderReader,
  writeTokenHash: string,
): Promise<WriteJudgement> {
  const environment = process.env;
  const block = blockBucketRequestFor({
    environment,
    headers,
    purpose: "save-by-block",
    deadlineMs: RATE_LIMIT_DEADLINE_MS,
    instant: new Date(),
  });
  const credentialPolicy = choosePolicy(environment, "save-by-credential");
  return judgeStepsInSequence([
    { policy: block.policy, judge: () => judgeBlockBucket(block) },
    {
      policy: credentialPolicy,
      judge: () => judgeCredential({ block, credentialPolicy, writeTokenHash }),
    },
  ]);
}

interface CredentialJudgement {
  readonly block: BlockBucketRequest;
  readonly credentialPolicy: PolicyChoice;
  readonly writeTokenHash: string;
}

/** The second step, reusing the first's secret, store, instant and deadline. */
function judgeCredential({
  block,
  credentialPolicy,
  writeTokenHash,
}: CredentialJudgement): Promise<RateLimitDecision> {
  if (credentialPolicy.status === "unavailable") {
    return Promise.resolve({
      kind: "unavailable",
      cause: "policy-misconfigured",
    });
  }
  return enforceRateLimit({
    subject: subjectOfWriteCredentialHash(writeTokenHash),
    digester: block.digester,
    policy: credentialPolicy.policy,
    store: block.store,
    instant: block.instant,
    deadlineMs: block.deadlineMs,
  });
}

/**
 * The answer that stops a save, or nothing when it may go on. Asked after the two refusals that are not counted and
 * before the body is read: a refusal reads no body, writes no row and sets, clears or refreshes no cookie. Whatever
 * cannot be judged is `503`, since a save that cannot be counted is not stored.
 */
export function refusalOfSaveLimit(
  headers: HeaderReader,
  writeTokenHash: string,
): Promise<NextResponse | undefined> {
  return refusalOfWriteLimit(() => judgeSaveRequest(headers, writeTokenHash), {
    refused: saveLimitReachedResponse,
    unavailable: saveUnavailableResponse,
    reportRefused: (policy) => {
      reportSaveLimit({ kind: "refused", policy });
    },
    reportUnavailable: (cause) => {
      reportSaveLimit({ kind: "unavailable", cause });
    },
  });
}
