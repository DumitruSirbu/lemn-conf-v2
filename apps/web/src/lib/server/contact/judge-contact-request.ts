import "server-only";

import type { NextResponse } from "next/server";

import {
  reportContactLimitRefused,
  reportContactUnavailable,
} from "@/lib/server/contact/contact-log";
import {
  subjectOfAddress,
  subjectOfStoredRequest,
  subjectOfVisitorHash,
} from "@/lib/server/rate-limit/bucket-subject";
import {
  judgeStepsInSequence,
  RATE_LIMIT_DEADLINE_MS,
  type PolicyStep,
  type WriteJudgement,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  blockBucketRequestFor,
  blockStep,
  subjectStep,
  type BlockBucketRequest,
} from "@/lib/server/rate-limit/judge-block-bucket";
import {
  CONTACT_EVERY_BY_BLOCK_POLICY,
  CONTACT_NEW_BY_BLOCK_DAY_POLICY,
  CONTACT_TRIES_BY_REQUEST_POLICY,
  type PolicyPurpose,
  type WindowRule,
} from "@/lib/server/rate-limit/limit-policy";
import type {
  HeaderReader,
  NetworkEnvironment,
} from "@/lib/server/rate-limit/network-source";
import {
  contactLimitReachedResponse,
  contactUnavailableResponse,
} from "@/lib/server/rate-limit/rate-limited-response";
import {
  refusalOfWriteLimit,
  type WriteAnswers,
} from "@/lib/server/rate-limit/refusal-of-write-limit";

/** What a request is judged from: the environment and the request's own headers, handed in, and one instant, so that
 *  every judgement of one request counts in the same window. */
export interface ContactJudgeAsk {
  readonly environment: NetworkEnvironment;
  readonly headers: HeaderReader;
  readonly instant: Date;
}

/** The texts a new request is counted under besides its network: each only when the request has one. */
export interface NewRequestSubjects {
  /** The hash of the visitor's value, when the browser sent a cookie that gave one. */
  readonly visitorHash?: string | undefined;
  /** The address in its counted form, when the channel is e-mail. */
  readonly countedAddress?: string | undefined;
}

/**
 * Three judgements, each the answer that stops the request or nothing. Each runs through the one routine of a write's
 * refusal, so each fails closed as the mint's and the save's do: whatever cannot be judged, a throw included, is the
 * one unavailable answer, and whatever refuses is the one limit answer, whichever bucket it was. They are asked in the
 * order the route has: every request's first, then a try of a stored request's or a new request's.
 */
export interface ContactJudge {
  /** Every request, counted by its network, before anything of the request is read. */
  readonly everyRequest: () => Promise<NextResponse | undefined>;
  /** A try of a request the lookup has just shown to be stored, counted by its id and never by a new request's. */
  readonly triesOfStoredRequest: (
    clientRequestId: string,
  ) => Promise<NextResponse | undefined>;
  /** A new request: the network's hour, the network's day, the browser's, the address's, each asked only when the one
   *  before allowed, and the last two only when handed a text. */
  readonly newRequest: (
    subjects: NewRequestSubjects,
  ) => Promise<NextResponse | undefined>;
}

/** The judge of one request. Nothing is read from the process or the clock here: what it needs is handed in. */
export function makeContactJudge(ask: ContactJudgeAsk): ContactJudge {
  return {
    everyRequest: () =>
      refusalOfWriteLimit(
        () => judgeEveryRequest(ask),
        answersFor(CONTACT_EVERY_BY_BLOCK_POLICY.window),
      ),
    triesOfStoredRequest: (clientRequestId) =>
      refusalOfWriteLimit(
        () => judgeTriesOfStoredRequest(ask, clientRequestId),
        answersFor(CONTACT_TRIES_BY_REQUEST_POLICY.window),
      ),
    newRequest: (subjects) =>
      refusalOfWriteLimit(
        () => judgeNewRequest(ask, subjects),
        answersFor(CONTACT_NEW_BY_BLOCK_DAY_POLICY.window),
      ),
  };
}

/** The two answers and the two lines, with a wait checked against the longest window of the judgement that refused. */
function answersFor(window: WindowRule): WriteAnswers {
  return {
    refused: (retryAfterSeconds) =>
      contactLimitReachedResponse(retryAfterSeconds, window),
    unavailable: contactUnavailableResponse,
    reportRefused: reportContactLimitRefused,
    reportUnavailable: reportContactUnavailable,
  };
}

function judgeEveryRequest(ask: ContactJudgeAsk): Promise<WriteJudgement> {
  return judgeStepsInSequence([
    blockStep(blockRequestFor(ask, "contact-every-by-block")),
  ]);
}

function judgeTriesOfStoredRequest(
  ask: ContactJudgeAsk,
  clientRequestId: string,
): Promise<WriteJudgement> {
  const request = blockRequestFor(ask, "contact-tries-by-request");
  return judgeStepsInSequence([
    subjectStep(request, () => subjectOfStoredRequest(clientRequestId)),
  ]);
}

function judgeNewRequest(
  ask: ContactJudgeAsk,
  { visitorHash, countedAddress }: NewRequestSubjects,
): Promise<WriteJudgement> {
  const steps: PolicyStep[] = [
    blockStep(blockRequestFor(ask, "contact-new-by-block-hour")),
    blockStep(blockRequestFor(ask, "contact-new-by-block-day")),
  ];
  if (visitorHash !== undefined) {
    const request = blockRequestFor(ask, "contact-new-by-visitor");
    steps.push(subjectStep(request, () => subjectOfVisitorHash(visitorHash)));
  }
  if (countedAddress !== undefined) {
    const request = blockRequestFor(ask, "contact-new-by-address");
    steps.push(subjectStep(request, () => subjectOfAddress(countedAddress)));
  }
  return judgeStepsInSequence(steps);
}

/** The network's bucket of one purpose, asked with this request's own secret, store, instant and deadline. */
function blockRequestFor(
  { environment, headers, instant }: ContactJudgeAsk,
  purpose: PolicyPurpose,
): BlockBucketRequest {
  return blockBucketRequestFor({
    environment,
    headers,
    purpose,
    deadlineMs: RATE_LIMIT_DEADLINE_MS,
    instant,
  });
}
