import { ownValueOf } from "@/staff/staff-kitchens-wire-reading";

import {
  BULK_REFUSAL_CODES,
  DRAFT_CHANGE_REFUSAL_CODES,
  type BulkChangedWire,
  type BulkChangeRequestWire,
  type BulkRefusalCode,
  type CreateHardwareClassRequestWire,
  type DashboardDraftWire,
  type DraftChangeCreatedWire,
  type DashboardStateWire,
  type DraftChangeRefusalCode,
  type DraftChangeRequestWire,
  type DraftRevertRequestWire,
} from "./price-dashboard-wire-contract";
import {
  readDashboardStateWire,
  readDraftWire,
} from "./price-dashboard-wire-reading";

// What the dashboard's screens write the draft through, and read the state again through. The fetching one asks the
// routes of the dashboard: `GET /api/staff/prices`, `PUT` and `DELETE` of `…/draft`, and `POST …/bulk`. Each answer is
// sorted into the outcomes below, and anything that is not one of the routes' own answers is `failed`.

/**
 * What a write to the draft came to. `refused` is a `400` naming a member the person can correct; `candidate-refused`
 * is the `409` of a draft that no longer makes a book; `conflict` is `changed-meanwhile`: nothing was written, and the
 * page reads the state again. `session-ended` is a `401`.
 */
export type DraftWriteResult<Code extends string, Written> =
  | { readonly kind: "changed"; readonly written: Written }
  | { readonly kind: "refused"; readonly code: Code }
  | { readonly kind: "candidate-refused" }
  | { readonly kind: "conflict" }
  | { readonly kind: "session-ended" }
  | { readonly kind: "failed" };

export type DraftChangeOutcome = DraftWriteResult<
  DraftChangeRefusalCode,
  DashboardDraftWire
>;
export type BulkChangeOutcome = DraftWriteResult<
  BulkRefusalCode,
  BulkChangedWire
>;

export type CreateHardwareClassOutcome = DraftWriteResult<
  DraftChangeRefusalCode,
  DraftChangeCreatedWire
>;

export interface PriceDraftClient {
  /** The dashboard's state again; absent when it cannot be read. */
  readState(): Promise<DashboardStateWire | undefined>;
  change(request: DraftChangeRequestWire): Promise<DraftChangeOutcome>;
  revert(request: DraftRevertRequestWire): Promise<DraftChangeOutcome>;
  bulk(request: BulkChangeRequestWire): Promise<BulkChangeOutcome>;
  /**
   * Creates a hardware class and its rates in one write of the draft. Absent where no route takes a creation yet, which
   * the screen reads as a creation that cannot be made: nothing is sent and nothing is shown as created.
   */
  readonly createHardwareClass?:
    | ((
        request: CreateHardwareClassRequestWire,
      ) => Promise<CreateHardwareClassOutcome>)
    | undefined;
  /**
   * Whether `change` takes the words of a created row. Absent where the draft route does not, which the screen reads as
   * words that cannot be changed: nothing is sent.
   */
  readonly acceptsCreatedRowText?: boolean | undefined;
}

const STATE_ADDRESS = "/api/staff/prices";
const DRAFT_ADDRESS = "/api/staff/prices/draft";
const BULK_ADDRESS = "/api/staff/prices/bulk";

const OK_STATUS = 200;
const INVALID_INPUT_STATUS = 400;
const UNAUTHORISED_STATUS = 401;
const CONFLICT_STATUS = 409;

/** A write states the origin the routes' cross-site guard reads, which `no-referrer` would turn into `null`. */
const SAME_ORIGIN_REFERRER_POLICY: ReferrerPolicy = "same-origin";
const NO_REFERRER_POLICY: ReferrerPolicy = "no-referrer";

export const FETCHING_PRICE_DRAFT_CLIENT: PriceDraftClient = {
  readState: async () => {
    const answer = await ask(STATE_ADDRESS, { method: "GET" });
    return answer?.status === OK_STATUS
      ? readDashboardStateWire(answer.body)
      : undefined;
  },
  change: (request) => write("PUT", DRAFT_ADDRESS, request, DRAFT_ANSWERS),
  revert: (request) => write("DELETE", DRAFT_ADDRESS, request, DRAFT_ANSWERS),
  bulk: (request) => write("POST", BULK_ADDRESS, request, BULK_ANSWERS),
};

/** How a route's `200` is read and which closed codes its `400` may name; any other code is not the route's own. */
interface RouteAnswers<Code extends string, Written> {
  readonly readWritten: (body: unknown) => Written | undefined;
  readonly refusalCodes: readonly Code[];
}

const DRAFT_ANSWERS: RouteAnswers<DraftChangeRefusalCode, DashboardDraftWire> =
  { readWritten: readDraftWire, refusalCodes: DRAFT_CHANGE_REFUSAL_CODES };

const BULK_ANSWERS: RouteAnswers<BulkRefusalCode, BulkChangedWire> = {
  readWritten: readBulkChangedWire,
  refusalCodes: BULK_REFUSAL_CODES,
};

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

async function ask(
  address: string,
  init:
    | { readonly method: "GET" }
    | { readonly method: string; readonly body: string },
): Promise<Answer | undefined> {
  const isRead = init.method === "GET";
  try {
    const response = await fetch(address, {
      ...init,
      ...(isRead ? {} : { headers: { "content-type": "application/json" } }),
      referrerPolicy: isRead ? NO_REFERRER_POLICY : SAME_ORIGIN_REFERRER_POLICY,
    });
    return { status: response.status, body: await readJsonOrNothing(response) };
  } catch {
    return undefined;
  }
}

async function readJsonOrNothing(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function write<Code extends string, Written>(
  method: "PUT" | "DELETE" | "POST",
  address: string,
  request: object,
  answers: RouteAnswers<Code, Written>,
): Promise<DraftWriteResult<Code, Written>> {
  const answer = await ask(address, { method, body: JSON.stringify(request) });
  if (answer === undefined) return { kind: "failed" };
  return outcomeOf(answer, answers);
}

function outcomeOf<Code extends string, Written>(
  { status, body }: Answer,
  { readWritten, refusalCodes }: RouteAnswers<Code, Written>,
): DraftWriteResult<Code, Written> {
  if (status === OK_STATUS) {
    const written = readWritten(body);
    return written === undefined
      ? { kind: "failed" }
      : { kind: "changed", written };
  }
  if (status === UNAUTHORISED_STATUS) return { kind: "session-ended" };
  if (status === INVALID_INPUT_STATUS) return refusalOf(body, refusalCodes);
  if (status === CONFLICT_STATUS) return conflictOf(body);
  return { kind: "failed" };
}

function conflictOf(body: unknown): DraftWriteResult<never, never> {
  const word = ownValueOf(body, "status");
  if (word === "changed-meanwhile") return { kind: "conflict" };
  if (word === "candidate-refused") return { kind: "candidate-refused" };
  return { kind: "failed" };
}

/** The first member a `400` names, with its closed code. A code outside the route's list is not its own: `failed`. */
function refusalOf<Code extends string>(
  body: unknown,
  refusalCodes: readonly Code[],
): DraftWriteResult<Code, never> {
  const issues = ownValueOf(body, "issues");
  const first: unknown = Array.isArray(issues) ? issues[0] : undefined;
  const named = ownValueOf(first, "code");
  const code = refusalCodes.find((known) => known === named);
  return code === undefined ? { kind: "failed" } : { kind: "refused", code };
}

function readBulkChangedWire(body: unknown): BulkChangedWire | undefined {
  const draft = readDraftWire(ownValueOf(body, "draft"));
  const ruleCount = ownValueOf(body, "ruleCount");
  const amountCount = ownValueOf(body, "amountCount");
  if (
    draft === undefined ||
    typeof ruleCount !== "number" ||
    typeof amountCount !== "number"
  ) {
    return undefined;
  }
  return { draft, ruleCount, amountCount };
}
