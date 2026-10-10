import type {
  RateLimitBucket,
  RateLimitStore,
  RateLimitWindow,
} from "@lemnaria/persistence";

import type {
  Digester,
  DigesterOutcome,
} from "@/lib/server/digest/digest-secret";
import {
  isMadeSubject,
  type BucketSubject,
} from "@/lib/server/rate-limit/bucket-subject";
import {
  chisinauDayOf,
  secondsToWindowEnd,
} from "@/lib/server/rate-limit/chisinau-day";
import {
  isOwnPolicy,
  NO_POLICY,
  type LimitPolicy,
  type PolicyChoice,
  type WindowRule,
} from "@/lib/server/rate-limit/limit-policy";
import { utcWindowOf } from "@/lib/server/rate-limit/utc-window";

/** The limiter's own bound around a write's store call, after which the request is unavailable. With the store's
 *  longest repeat and the mint's longest time it stays under the lock's ten seconds. */
export const RATE_LIMIT_DEADLINE_MS = 3000;

/** A read waits far less than a write: after this the read is served, since a page is worth more than its count. */
export const RATE_LIMIT_READ_DEADLINE_MS = 300;

/** The most a timer can wait; a longer one fires at once, and with a warning, which this module may not write. */
const LONGEST_TIMER_MS = 2_147_483_647;

/** Why a request could not be judged, in one closed list that types the log line too. `judgement-failed` is made by
 *  the evaluator's own guards (a subject or a policy it did not make, an unusable deadline), by a sequence of
 *  judgements (a step that throws, or no step), and by a route whose judge threw. Only the log's code says which. */
export const UNAVAILABLE_CAUSES = [
  "source-misconfigured",
  "policy-misconfigured",
  "digester-unusable",
  "window-unavailable",
  "store-failed",
  "deadline-passed",
  "judgement-failed",
] as const;

export type UnavailableCause = (typeof UNAVAILABLE_CAUSES)[number];

/** Nothing here carries a count, a block or what remains: only the wait of a refusal. */
export type RateLimitDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "refuse"; readonly retryAfterSeconds: number }
  | { readonly kind: "unavailable"; readonly cause: UnavailableCause };

/** One bucket: its caller hands in what is counted, how long it is counted for, and how long to wait for the count.
 *  A subject no constructor made, or a policy outside the closed set, is not judged: nothing is counted for it. */
export interface RateLimitRequest {
  readonly subject: BucketSubject;
  readonly digester: DigesterOutcome;
  readonly policy: LimitPolicy;
  readonly store: Pick<RateLimitStore, "recordHits">;
  readonly instant: Date;
  readonly deadlineMs: number;
}

/** One judgement of a sequence, asked only when the steps before it allowed. */
export type JudgementStep = () => Promise<RateLimitDecision>;

/** A judgement and the policy it is made under, known before it is asked, so that a step that throws is still named. */
export interface PolicyStep {
  readonly policy: PolicyChoice;
  readonly judge: JudgementStep;
}

/** What a write's limit decided, and under which policy: the decision, and the policy of the step that ended it. */
export interface WriteJudgement {
  readonly decision: RateLimitDecision;
  readonly policy: PolicyChoice;
}

type Step<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly cause: UnavailableCause };

interface Usable {
  readonly subject: BucketSubject;
  readonly digest: Digester;
  readonly policy: LimitPolicy;
}

const ALLOWED: RateLimitDecision = Object.freeze({ kind: "allow" });

/**
 * Counts one hit in the request's bucket and judges it. What is not usable is answered before the store is asked, and
 * any throw is unavailable with nothing of it kept: this module logs nothing and holds no error. A hit counts before
 * it is judged, so the store's count includes it and a hit is refused when the count is above the figure.
 */
export async function enforceRateLimit(
  request: RateLimitRequest,
): Promise<RateLimitDecision> {
  const usable = usableOf(request);
  if (!usable.ok) return unavailable(usable.cause);
  const window = windowOf(usable.value.policy.window, request.instant);
  if (!window.ok) return unavailable(window.cause);
  const key = keyOf(usable.value);
  if (!key.ok) return unavailable(key.cause);
  const counts = await recordWithinDeadline({
    store: request.store,
    buckets: [{ key: key.value, window: window.value }],
    deadlineMs: request.deadlineMs,
  });
  if (!counts.ok) return unavailable(counts.cause);
  return judge({
    counts: counts.value,
    policy: usable.value.policy,
    window: window.value,
    instant: request.instant,
  });
}

function usableOf(request: RateLimitRequest): Step<Usable> {
  const { subject, digester, policy, deadlineMs } = request;
  if (!isMadeSubject(subject) || !isOwnPolicy(policy)) {
    return failed("judgement-failed");
  }
  if (!isUsableDeadline(deadlineMs)) return failed("judgement-failed");
  if (digester.status === "unavailable") return failed("digester-unusable");
  return { ok: true, value: { subject, digest: digester.digest, policy } };
}

function isUsableDeadline(deadlineMs: number): boolean {
  return (
    Number.isInteger(deadlineMs) &&
    deadlineMs >= 1 &&
    deadlineMs <= LONGEST_TIMER_MS
  );
}

function windowOf(rule: WindowRule, instant: Date): Step<RateLimitWindow> {
  try {
    return { ok: true, value: windowOfRule(rule, instant) };
  } catch {
    return failed("window-unavailable");
  }
}

function windowOfRule(rule: WindowRule, instant: Date): RateLimitWindow {
  return rule.kind === "chisinau-day"
    ? chisinauDayOf(instant)
    : utcWindowOf(instant, rule.minutes);
}

function keyOf({ subject, digest, policy }: Usable): Step<string> {
  try {
    const key = digest({
      purpose: "rate-limit-bucket",
      fields: {
        policyName: policy.name,
        subjectKind: subject.kind,
        subject: subject.subject,
      },
    });
    return { ok: true, value: key };
  } catch {
    return failed("digester-unusable");
  }
}

/**
 * The store's late answer or rejection is handled where it is made, so a deadline that has passed leaves nothing
 * unhandled behind. A synchronous throw from the store is a rejection too.
 */
async function recordWithinDeadline({
  store,
  buckets,
  deadlineMs,
}: Hits): Promise<Step<RecordedCounts>> {
  const answered = new Promise<RecordedCounts>((resolve) => {
    resolve(store.recordHits(buckets));
  }).then(
    (counts): Step<RecordedCounts> => ({ ok: true, value: counts }),
    (): Step<RecordedCounts> => failed("store-failed"),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Step<RecordedCounts>>((resolve) => {
    timer = setTimeout(() => {
      resolve(failed("deadline-passed"));
    }, deadlineMs);
  });
  try {
    return await Promise.race([answered, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

interface Hits {
  readonly store: Pick<RateLimitStore, "recordHits">;
  readonly buckets: readonly RateLimitBucket[];
  readonly deadlineMs: number;
}

interface Judgement {
  readonly counts: RecordedCounts;
  readonly policy: LimitPolicy;
  readonly window: RateLimitWindow;
  readonly instant: Date;
}

/** What the port promises of a count; the store is a boundary, so the shape is still read as if it were not. */
type RecordedCounts = Awaited<ReturnType<RateLimitStore["recordHits"]>>;

function judge({
  counts,
  policy,
  window,
  instant,
}: Judgement): RateLimitDecision {
  const count: unknown = Array.isArray(counts) ? counts[0] : undefined;
  if (!isCountOfAtLeastOne(count)) return unavailable("store-failed");
  if (count <= policy.figure) return ALLOWED;
  return {
    kind: "refuse",
    retryAfterSeconds: secondsToWindowEnd(window, instant),
  };
}

/** The port promises a count that includes this hit, so nought, a fraction or a negative is no count. */
function isCountOfAtLeastOne(count: unknown): count is number {
  return typeof count === "number" && Number.isInteger(count) && count >= 1;
}

function failed(cause: UnavailableCause): {
  ok: false;
  cause: UnavailableCause;
} {
  return { ok: false, cause };
}

function unavailable(cause: UnavailableCause): RateLimitDecision {
  return { kind: "unavailable", cause };
}

/**
 * Asks each step in order and answers the decision and the policy of the step that ended it: the first that refused,
 * the one that could not be judged, or the one that threw, so no step after it is ever called and so counts no hit.
 * All allowed answers the last step's, and a sequence of none answers no policy and is unavailable: a judgement that
 * was not made never reads as one that allowed. The policy is the step's own, so it does not depend on what a closure
 * did when it was called.
 */
export async function judgeStepsInSequence(
  steps: readonly PolicyStep[],
): Promise<WriteJudgement> {
  let endedBy: PolicyStep | undefined;
  try {
    for (const step of steps) {
      endedBy = step;
      const decision = await step.judge();
      if (decision.kind !== "allow") return { decision, policy: step.policy };
    }
    return steps.length === 0
      ? { decision: unavailable("judgement-failed"), policy: NO_POLICY }
      : { decision: ALLOWED, policy: endedBy?.policy ?? NO_POLICY };
  } catch {
    return {
      decision: unavailable("judgement-failed"),
      policy: endedBy?.policy ?? NO_POLICY,
    };
  }
}
