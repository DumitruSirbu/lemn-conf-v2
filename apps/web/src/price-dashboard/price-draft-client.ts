import type { CreatedRowItemRef } from "@lemnaria/configurator-domain";

import { ownValueOf } from "@/staff/staff-kitchens-wire-reading";

import {
  ask,
  DRAFT_ADDRESS,
  STATE_ADDRESS,
  CONFLICT_STATUS,
  INVALID_INPUT_STATUS,
  OK_STATUS,
  UNAUTHORISED_STATUS,
  type Answer,
} from "./dashboard-fetch";
import {
  BULK_REFUSAL_CODES,
  DRAFT_CHANGE_REFUSAL_CODES,
  type BulkChangedWire,
  type BulkChangeRequestWire,
  type BulkRefusalCode,
  type CreateAccessoryRequestWire,
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
  readDraftChangeCreatedWire,
  readDraftWire,
} from "./price-dashboard-wire-reading";

// What the dashboard's screens write the draft through, and read the state again through. The fetching one asks the
// routes of the dashboard: `GET /api/staff/prices`, `PUT` and `DELETE` of `…/draft`, `POST …/bulk` and the two creations
// under `…/draft`. Each answer is sorted into the outcomes below, and anything that is not one of the routes' own answers
// is `failed`. A request is sent once: a creation whose answer was lost is never sent again by the client, since it
// names the draft revision it read, and only the person's own second try, against the revision then held, can tell
// whether the first landed.

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

export type CreateAccessoryOutcome = CreateHardwareClassOutcome;

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
   * Creates a linked accessory in the draft. Absent where no route takes a creation yet, which the screen reads as a
   * creation that cannot be made: nothing is sent and nothing is shown as created.
   */
  readonly createAccessory?:
    | ((request: CreateAccessoryRequestWire) => Promise<CreateAccessoryOutcome>)
    | undefined;
  /**
   * Whether `change` takes the words of a created row. Absent where the draft route does not, which the screen reads as
   * words that cannot be changed: nothing is sent.
   */
  readonly acceptsCreatedRowText?: boolean | undefined;
}

const BULK_ADDRESS = "/api/staff/prices/bulk";
const HARDWARE_CLASS_ADDRESS = "/api/staff/prices/draft/hardware-class";
const ACCESSORY_ADDRESS = "/api/staff/prices/draft/accessory";

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
  createHardwareClass: (request) =>
    write("POST", HARDWARE_CLASS_ADDRESS, request, HARDWARE_CLASS_ANSWERS),
  createAccessory: (request) =>
    write("POST", ACCESSORY_ADDRESS, request, ACCESSORY_ANSWERS),
  acceptsCreatedRowText: true,
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

const HARDWARE_CLASS_ANSWERS = createdAnswersOf("hardware");
const ACCESSORY_ANSWERS = createdAnswersOf("accessory");

/** A creation's `200` is believed only when it names a row of the kind the route creates. */
function createdAnswersOf(
  kind: CreatedRowItemRef["kind"],
): RouteAnswers<DraftChangeRefusalCode, DraftChangeCreatedWire> {
  return {
    readWritten: (body) => {
      const written = readDraftChangeCreatedWire(body);
      return written?.created.kind === kind ? written : undefined;
    },
    refusalCodes: DRAFT_CHANGE_REFUSAL_CODES,
  };
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

/** An answer of the draft route to a change or a revert, sorted as the dashboard's screens sort it. */
export function draftOutcomeOfAnswer(answer: Answer): DraftChangeOutcome {
  return outcomeOf(answer, DRAFT_ANSWERS);
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
