import "server-only";

import {
  reportAccountEvent,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import {
  subjectOfAccountId,
  subjectOfAddress,
  type BucketSubject,
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
  NO_POLICY,
  policyNameOf,
  type PolicyPurpose,
} from "@/lib/server/rate-limit/limit-policy";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";

/** What a route is limited for at the block stage (M8B plan section 5, common order step 4): the purposes whose first
 *  bucket counts the network. `confirm-email` and `password-reset-complete` count in one bucket, since the plan bounds
 *  their hashing cost together, and have no other stage. */
export type AccountBlockPurpose =
  | "register"
  | "login"
  | "reset-request"
  | "confirm-email"
  | "password-reset-complete";

/** The purposes that count an address's buckets at the subject stage. `mail` is the mail bucket alone, for a route that
 *  sends a mail the flow's own subject stage did not already count (a login that finds an unconfirmed account). */
export type AddressedPurpose = "register" | "login" | "reset-request" | "mail";

export interface AccountBlockAsk {
  readonly purpose: AccountBlockPurpose;
  readonly headers: HeaderReader;
}

/**
 * What the subject stage is judged from, keyed by purpose so that the text a purpose counts cannot be left out: an
 * address's purposes require the address in its counted form, and `claim` requires the account's id. There is no
 * request without its subject.
 */
export type AccountSubjectAsk =
  | {
      readonly purpose: AddressedPurpose;
      readonly headers: HeaderReader;
      readonly address: string;
    }
  | {
      readonly purpose: "claim";
      readonly headers: HeaderReader;
      readonly accountId: string;
    };

/** The buckets one stage of one flow counts, in the order they are asked, and the log event that names the flow. */
interface StagePlan {
  readonly event: AccountEvent;
  readonly buckets: readonly PolicyPurpose[];
}

const BLOCK_PLAN_OF_PURPOSE: Readonly<Record<AccountBlockPurpose, StagePlan>> =
  {
    register: {
      event: "register",
      buckets: [
        "account-register-by-block-hour",
        "account-register-by-block-day",
      ],
    },
    login: { event: "login", buckets: ["account-login-by-block"] },
    "reset-request": {
      event: "password-reset-request",
      buckets: ["account-reset-request-by-block"],
    },
    "confirm-email": {
      event: "confirm-email",
      buckets: ["account-token-complete-by-block"],
    },
    "password-reset-complete": {
      event: "password-reset-complete",
      buckets: ["account-token-complete-by-block"],
    },
  };

const SUBJECT_PLAN_OF_PURPOSE: Readonly<
  Record<AccountSubjectAsk["purpose"], StagePlan>
> = {
  register: { event: "register", buckets: ["account-mail-by-address"] },
  login: {
    event: "login",
    buckets: [
      "account-login-by-address-quarter-hour",
      "account-login-by-address-day",
    ],
  },
  "reset-request": {
    event: "password-reset-request",
    buckets: ["account-mail-by-address"],
  },
  mail: { event: "mail", buckets: ["account-mail-by-address"] },
  claim: { event: "claim", buckets: ["account-claim-by-account"] },
};

const UNJUDGED: WriteJudgement = Object.freeze({
  decision: Object.freeze({
    kind: "unavailable",
    cause: "judgement-failed",
  }),
  policy: NO_POLICY,
});

/**
 * The block stage, asked at step 4 of the common order, **before** Turnstile: the network's buckets alone, in one
 * sequence. A refusal here counts no row for an address, since the subject stage is never reached. A write fails
 * closed: whatever cannot be judged, a throw while the steps are made included, is unavailable, and so no account
 * write goes on. A refusal and an unavailability are written down through `account-log.ts`, by event, outcome and
 * policy name alone. The answer is the judgement itself; the route owns its words. A purpose outside the list, which
 * only a cast reaches, is unavailable and unreported, since the line has no event to name it by.
 */
export async function judgeAccountBlock({
  purpose,
  headers,
}: AccountBlockAsk): Promise<WriteJudgement> {
  if (!Object.hasOwn(BLOCK_PLAN_OF_PURPOSE, purpose)) return UNJUDGED;
  const plan = BLOCK_PLAN_OF_PURPOSE[purpose];
  return judgeStage(plan.event, () => {
    const requestFor = requestMakerFor(headers);
    return plan.buckets.map((bucket) => blockStep(requestFor(bucket)));
  });
}

/**
 * The subject stage, asked at step 7, **after** Turnstile and input validation and before any account lookup: the
 * address's or the account's buckets, in one sequence, every one counted for every valid request so a refusal reads
 * the same for every address. It counts nothing the block stage counted, and a route calls it for a purpose once. Fails
 * closed and reports exactly as `judgeAccountBlock` does; a subject text that its constructor refuses is a judgement
 * that failed.
 */
export async function judgeAccountSubject(
  ask: AccountSubjectAsk,
): Promise<WriteJudgement> {
  if (!Object.hasOwn(SUBJECT_PLAN_OF_PURPOSE, ask.purpose)) return UNJUDGED;
  const plan = SUBJECT_PLAN_OF_PURPOSE[ask.purpose];
  const makeSubject = subjectMakerOf(ask);
  return judgeStage(plan.event, () => {
    const requestFor = requestMakerFor(ask.headers);
    return plan.buckets.map((bucket) =>
      subjectStep(requestFor(bucket), makeSubject),
    );
  });
}

/** The subject is made through its constructor only when a step is asked, so a text it refuses is a failed judgement. */
function subjectMakerOf(ask: AccountSubjectAsk): () => BucketSubject {
  if (ask.purpose === "claim") {
    const { accountId } = ask;
    return () => subjectOfAccountId(accountId);
  }
  const { address } = ask;
  return () => subjectOfAddress(address);
}

async function judgeStage(
  event: AccountEvent,
  makeSteps: () => PolicyStep[],
): Promise<WriteJudgement> {
  const judgement = await judgementOf(makeSteps);
  reportJudgement(event, judgement);
  return judgement;
}

async function judgementOf(
  makeSteps: () => PolicyStep[],
): Promise<WriteJudgement> {
  try {
    return await judgeStepsInSequence(makeSteps());
  } catch {
    return UNJUDGED;
  }
}

/** One instant and one environment for every step, so a request judged across a window's turn tells one wait. */
function requestMakerFor(
  headers: HeaderReader,
): (purpose: PolicyPurpose) => BlockBucketRequest {
  const environment = process.env;
  const instant = new Date();
  return (purpose) =>
    blockBucketRequestFor({
      environment,
      headers,
      purpose,
      deadlineMs: RATE_LIMIT_DEADLINE_MS,
      instant,
    });
}

function reportJudgement(
  event: AccountEvent,
  { decision, policy }: WriteJudgement,
): void {
  if (decision.kind === "refuse") {
    reportAccountEvent({
      event,
      outcome: "limited",
      policy: policyNameOf(policy),
    });
  } else if (decision.kind === "unavailable") {
    reportAccountEvent({ event, outcome: "unavailable" });
  }
}
