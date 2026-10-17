import "server-only";

import {
  reportAccountEvent,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import {
  subjectOfAccountId,
  subjectOfAddress,
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

/** What an account route is limited for, one name for each flow that has its own log line. `confirm-email` and
 *  `password-reset-complete` count in one bucket, since the plan bounds their hashing cost together. */
export type AccountRequestPurpose =
  | "register"
  | "login"
  | "reset-request"
  | "confirm-email"
  | "password-reset-complete"
  | "mail"
  | "claim";

/** What a request is judged from. A route hands in the texts it has: an address in its counted form, an account's id.
 *  A step that counts a subject is asked only when the text for it is handed in. */
export interface AccountRequestAsk {
  readonly purpose: AccountRequestPurpose;
  readonly headers: HeaderReader;
  readonly address?: string | undefined;
  readonly accountId?: string | undefined;
}

/** The buckets of one flow, in the order they are asked: the network's, then the address's, then the account's. */
interface AccountPlan {
  readonly event: AccountEvent;
  readonly blocks: readonly PolicyPurpose[];
  readonly addressBuckets: readonly PolicyPurpose[];
  readonly accountBuckets: readonly PolicyPurpose[];
}

const NO_BUCKETS: readonly PolicyPurpose[] = [];

const PLAN_OF_PURPOSE: Readonly<Record<AccountRequestPurpose, AccountPlan>> = {
  register: {
    event: "register",
    blocks: ["account-register-by-block-hour", "account-register-by-block-day"],
    addressBuckets: ["account-mail-by-address"],
    accountBuckets: NO_BUCKETS,
  },
  login: {
    event: "login",
    blocks: ["account-login-by-block"],
    addressBuckets: [
      "account-login-by-address-quarter-hour",
      "account-login-by-address-day",
    ],
    accountBuckets: NO_BUCKETS,
  },
  "reset-request": {
    event: "password-reset-request",
    blocks: ["account-reset-request-by-block"],
    addressBuckets: ["account-mail-by-address"],
    accountBuckets: NO_BUCKETS,
  },
  "confirm-email": {
    event: "confirm-email",
    blocks: ["account-token-complete-by-block"],
    addressBuckets: NO_BUCKETS,
    accountBuckets: NO_BUCKETS,
  },
  "password-reset-complete": {
    event: "password-reset-complete",
    blocks: ["account-token-complete-by-block"],
    addressBuckets: NO_BUCKETS,
    accountBuckets: NO_BUCKETS,
  },
  mail: {
    event: "mail",
    blocks: NO_BUCKETS,
    addressBuckets: ["account-mail-by-address"],
    accountBuckets: NO_BUCKETS,
  },
  claim: {
    event: "claim",
    blocks: NO_BUCKETS,
    addressBuckets: NO_BUCKETS,
    accountBuckets: ["account-claim-by-account"],
  },
};

const UNJUDGED: WriteJudgement = Object.freeze({
  decision: Object.freeze({
    kind: "unavailable",
    cause: "judgement-failed",
  }),
  policy: NO_POLICY,
});

/**
 * Judges one account request in one sequence, each step asked only when the one before it allowed: the network's
 * buckets first, then the address's or the account's when the text for them was handed in. A refusal at the block so
 * counts no row for an address, which anyone could otherwise invent. A write fails closed: whatever cannot be judged,
 * a throw while the steps are made included, is unavailable, and so no account write goes on. A refusal and an
 * unavailability are written down through `account-log.ts`, by event, outcome and policy name alone. The answer is the
 * judgement itself; the route owns its words. A purpose outside the list, which only a cast reaches, is unavailable
 * and unreported, since the line has no event to name it by.
 */
export async function judgeAccountRequest(
  ask: AccountRequestAsk,
): Promise<WriteJudgement> {
  if (!Object.hasOwn(PLAN_OF_PURPOSE, ask.purpose)) return UNJUDGED;
  const plan = PLAN_OF_PURPOSE[ask.purpose];
  const judgement = await judgementOf(plan, ask);
  reportJudgement(plan.event, judgement);
  return judgement;
}

async function judgementOf(
  plan: AccountPlan,
  ask: AccountRequestAsk,
): Promise<WriteJudgement> {
  try {
    return await judgeStepsInSequence(stepsOf(plan, ask));
  } catch {
    return UNJUDGED;
  }
}

function stepsOf(
  plan: AccountPlan,
  { headers, address, accountId }: AccountRequestAsk,
): PolicyStep[] {
  const requestFor = requestMakerFor(headers);
  const steps = plan.blocks.map((purpose) => blockStep(requestFor(purpose)));
  if (address !== undefined) {
    steps.push(
      ...plan.addressBuckets.map((purpose) =>
        subjectStep(requestFor(purpose), () => subjectOfAddress(address)),
      ),
    );
  }
  if (accountId !== undefined) {
    steps.push(
      ...plan.accountBuckets.map((purpose) =>
        subjectStep(requestFor(purpose), () => subjectOfAccountId(accountId)),
      ),
    );
  }
  return steps;
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
