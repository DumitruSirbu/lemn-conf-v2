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
  chisinauDayOf,
  secondsToWindowEnd,
} from "@/lib/server/rate-limit/chisinau-day";
import type { NetworkBlock } from "@/lib/server/rate-limit/client-network";
import type {
  LimitPolicy,
  PolicyChoice,
} from "@/lib/server/rate-limit/limit-policy";
import type { ClientNetwork } from "@/lib/server/rate-limit/network-source";

/** The limiter's own bound around the store's call, after which the request is unavailable. With the store's longest
 *  repeat and the mint's longest time it stays under the lock's ten seconds. */
export const RATE_LIMIT_DEADLINE_MS = 3000;

/** Why a mint could not be judged, in one closed list that types the log line too. `judgement-failed` is the route's
 *  own: the judgement itself threw. Only the log's code says which. */
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

export interface RateLimitRequest {
  readonly network: ClientNetwork;
  readonly digester: DigesterOutcome;
  readonly policy: PolicyChoice;
  readonly store: Pick<RateLimitStore, "recordHits">;
  readonly instant: Date;
}

type Step<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly cause: UnavailableCause };

interface Usable {
  readonly block: NetworkBlock;
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
  const window = windowOf(request.instant);
  if (!window.ok) return unavailable(window.cause);
  const key = keyOf(usable.value);
  if (!key.ok) return unavailable(key.cause);
  const counts = await recordWithinDeadline(request.store, [
    { key: key.value, window: window.value },
  ]);
  if (!counts.ok) return unavailable(counts.cause);
  return judge({
    counts: counts.value,
    policy: usable.value.policy,
    window: window.value,
    instant: request.instant,
  });
}

function usableOf(request: RateLimitRequest): Step<Usable> {
  const { network, digester, policy } = request;
  if (network.status === "misconfigured") return failed("source-misconfigured");
  if (policy.status === "unavailable") return failed("policy-misconfigured");
  if (digester.status === "unavailable") return failed("digester-unusable");
  return {
    ok: true,
    value: {
      block: network.block,
      digest: digester.digest,
      policy: policy.policy,
    },
  };
}

function windowOf(instant: Date): Step<RateLimitWindow> {
  try {
    return { ok: true, value: chisinauDayOf(instant) };
  } catch {
    return failed("window-unavailable");
  }
}

function keyOf({ block, digest, policy }: Usable): Step<string> {
  try {
    const key = digest({
      purpose: "rate-limit-bucket",
      fields: {
        policyName: policy.name,
        subjectKind: block.kind,
        subject: block.subject,
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
async function recordWithinDeadline(
  store: Pick<RateLimitStore, "recordHits">,
  buckets: readonly RateLimitBucket[],
): Promise<Step<RecordedCounts>> {
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
    }, RATE_LIMIT_DEADLINE_MS);
  });
  try {
    return await Promise.race([answered, deadline]);
  } finally {
    clearTimeout(timer);
  }
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
