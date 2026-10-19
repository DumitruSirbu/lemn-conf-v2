import "server-only";

import type { NextResponse } from "next/server";

import { reportPresetSaveLimit } from "@/lib/server/design-failure-log";
import {
  RATE_LIMIT_DEADLINE_MS,
  type WriteJudgement,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  blockBucketRequestFor,
  judgeBlockBucket,
} from "@/lib/server/rate-limit/judge-block-bucket";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import {
  presetLimitReachedResponse,
  presetUnavailableResponse,
} from "@/lib/server/rate-limit/rate-limited-response";
import { refusalOfWriteLimit } from "@/lib/server/rate-limit/refusal-of-write-limit";

/** A request that names no network: the cap counts every caller in one bucket, so no header is read. */
const NO_HEADERS: HeaderReader = { get: () => null };

/**
 * Counts one preset creation in the one bucket every caller shares, under the day's cap. It is the block judge, asked
 * about a request that names no network, so the block is the shared bucket and its subject is made where every block's
 * is (`judgeBlockBucket`), from the parsed network alone: no second caller of the constructor exists. The key digests
 * the policy's name with the subject, so this bucket cannot be any other policy's. A write fails closed: whatever cannot
 * be judged is unavailable, and so nothing is stored.
 */
export async function judgePresetCreation(): Promise<WriteJudgement> {
  const request = blockBucketRequestFor({
    environment: process.env,
    headers: NO_HEADERS,
    purpose: "preset-creation",
    deadlineMs: RATE_LIMIT_DEADLINE_MS,
    instant: new Date(),
  });
  return { decision: await judgeBlockBucket(request), policy: request.policy };
}

/**
 * The answer that stops a preset save, or nothing when it may go on. Asked last of all the refusals and immediately
 * before the insert, so a request that was going to be refused anyway spends none of the day's figure and every hit
 * counted is a save that would have stored a row. Nothing thrown here is kept: it answers as unavailable.
 */
export function refusalOfPresetCreationCap(): Promise<
  NextResponse | undefined
> {
  return refusalOfWriteLimit(judgePresetCreation, {
    refused: presetLimitReachedResponse,
    unavailable: presetUnavailableResponse,
    reportRefused: (policy) => {
      reportPresetSaveLimit({ kind: "refused", policy });
    },
    reportUnavailable: (cause) => {
      reportPresetSaveLimit({ kind: "unavailable", cause });
    },
  });
}
