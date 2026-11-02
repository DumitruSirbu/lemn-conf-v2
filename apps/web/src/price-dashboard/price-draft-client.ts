import {
  readBulk,
  type DraftBulk,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { ownValueOf } from "@/staff/staff-kitchens-wire-reading";

import type {
  BulkChangedWire,
  BulkChangeRequestWire,
  BulkRefusalCode,
  DashboardBookPayload,
  DashboardDraftWire,
  DashboardStateWire,
  DraftChangeRefusalCode,
  DraftChangeRequestWire,
  DraftRevertRequestWire,
} from "./price-dashboard-wire-contract";

// What the dashboard's screens write the draft through, and read the state again through. The fetching one asks the routes
// of the dashboard: `GET /api/staff/prices`, `PUT` and `DELETE` of `…/draft`, and `POST …/bulk`. Each answer is sorted into the
// outcomes below, and anything that is not one of the routes' own answers is `failed`.

/**
 * What a write to the draft came to. `refused` is a `400` naming a member the person can correct; `candidate-refused` is
 * the `409` of a draft that no longer makes a book; `conflict` is `changed-meanwhile`: nothing was written, and the page
 * reads the state again. `session-ended` is a `401`.
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

export interface PriceDraftClient {
  /** The dashboard's state again; absent when it cannot be read. */
  readState(): Promise<DashboardStateWire | undefined>;
  change(request: DraftChangeRequestWire): Promise<DraftChangeOutcome>;
  revert(request: DraftRevertRequestWire): Promise<DraftChangeOutcome>;
  bulk(request: BulkChangeRequestWire): Promise<BulkChangeOutcome>;
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
  change: (request) =>
    write("PUT", DRAFT_ADDRESS, request, (body) => readDraftWire(body)),
  revert: (request) =>
    write("DELETE", DRAFT_ADDRESS, request, (body) => readDraftWire(body)),
  bulk: (request) =>
    write("POST", BULK_ADDRESS, request, (body) => readBulkChangedWire(body)),
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
  readWritten: (body: unknown) => Written | undefined,
): Promise<DraftWriteResult<Code, Written>> {
  const answer = await ask(address, { method, body: JSON.stringify(request) });
  if (answer === undefined) return { kind: "failed" };
  return outcomeOf<Code, Written>(answer, readWritten);
}

function outcomeOf<Code extends string, Written>(
  { status, body }: Answer,
  readWritten: (body: unknown) => Written | undefined,
): DraftWriteResult<Code, Written> {
  if (status === OK_STATUS) {
    const written = readWritten(body);
    return written === undefined
      ? { kind: "failed" }
      : { kind: "changed", written };
  }
  if (status === UNAUTHORISED_STATUS) return { kind: "session-ended" };
  if (status === INVALID_INPUT_STATUS) return refusalOf<Code>(body);
  if (status === CONFLICT_STATUS) return conflictOf(body);
  return { kind: "failed" };
}

function conflictOf(body: unknown): DraftWriteResult<never, never> {
  const word = ownValueOf(body, "status");
  if (word === "changed-meanwhile") return { kind: "conflict" };
  if (word === "candidate-refused") return { kind: "candidate-refused" };
  return { kind: "failed" };
}

/** The first member a `400` names, with its closed code. Whatever else a `400` says is the guards' and reads as failed. */
function refusalOf<Code extends string>(
  body: unknown,
): DraftWriteResult<Code, never> {
  const issues = ownValueOf(body, "issues");
  const first: unknown = Array.isArray(issues) ? issues[0] : undefined;
  const code = ownValueOf(first, "code");
  return typeof code === "string"
    ? { kind: "refused", code: code as Code }
    : { kind: "failed" };
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading what the routes answer

function isRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChange(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof ownValueOf(ownValueOf(value, "address"), "kind") === "string"
  );
}

/** The draft as the routes send it: a revision, and changes that each name an address. `applyChanges` judges the rest. */
export function readDraftWire(body: unknown): DashboardDraftWire | undefined {
  const draftRevision = ownValueOf(body, "draftRevision");
  const declared = ownValueOf(body, "changes");
  if (typeof draftRevision !== "string" || !Array.isArray(declared)) {
    return undefined;
  }
  const changes: DraftChange[] = [];
  for (const change of declared as readonly unknown[]) {
    const read = readChange(change);
    if (read === undefined) return undefined;
    changes.push(read);
  }
  return { draftRevision, changes };
}

/** A change rebuilt from the members a draft change declares, so what else the answer carried never reaches the screen. */
function readChange(declared: unknown): DraftChange | undefined {
  if (!isChange(declared)) return undefined;
  const declaredBulk = ownValueOf(declared, "bulk");
  const bulk =
    declaredBulk === undefined ? undefined : readBulkOf(declaredBulk);
  const groupId = ownValueOf(declared, "groupId");
  const isBulkUnreadable = declaredBulk !== undefined && bulk === undefined;
  const isGroupIdUnreadable =
    groupId !== undefined && typeof groupId !== "string";
  if (isBulkUnreadable || isGroupIdUnreadable) return undefined;
  return {
    address: ownValueOf(declared, "address"),
    value: ownValueOf(declared, "value"),
    ...(groupId === undefined ? {} : { groupId }),
    ...(bulk === undefined ? {} : { bulk }),
  } as DraftChange;
}

/** The bulk action's own three members, judged by the domain; a member beside them is dropped. */
function readBulkOf(declared: unknown): DraftBulk | undefined {
  const groupCode = ownValueOf(declared, "groupCode");
  return readBulk({
    percent: ownValueOf(declared, "percent"),
    scope: ownValueOf(declared, "scope"),
    ...(groupCode === undefined ? {} : { groupCode }),
  });
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

/** The dashboard's state as `GET /api/staff/prices` sends it; the book is judged by whoever applies the draft to it. */
export function readDashboardStateWire(
  body: unknown,
): DashboardStateWire | undefined {
  const active = ownValueOf(body, "active");
  const draft = readDraftWire(ownValueOf(body, "draft"));
  if (draft === undefined || !isRecord(active)) return undefined;
  const book = ownValueOf(active, "book");
  const availability = ownValueOf(active, "availability");
  const versionId = ownValueOf(active, "versionId");
  const sequenceNumber = ownValueOf(active, "sequenceNumber");
  const label = ownValueOf(active, "label");
  const publishedAt = ownValueOf(active, "publishedAt");
  if (!isRecord(book) || !isRecord(availability)) return undefined;
  if (typeof versionId !== "string" || typeof sequenceNumber !== "number") {
    return undefined;
  }
  if (typeof label !== "string" || typeof publishedAt !== "string") {
    return undefined;
  }
  return {
    active: {
      versionId,
      sequenceNumber,
      label,
      publishedAt,
      book: book as DashboardBookPayload["book"],
      availability: availability as DashboardBookPayload["availability"],
    },
    draft,
  };
}
