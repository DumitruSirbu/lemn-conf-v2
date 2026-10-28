import {
  PRICE_GROUP_CODES,
  type AppliedAddress,
  type PriceGroupCode,
} from "@lemnaria/configurator-domain";

import { parseJsonObject } from "@/lib/server/account/account-request";
import { readAppliedAddress } from "@/lib/server/price-dashboard/draft-address";
import {
  isIdentifier,
  isPlainRecord,
} from "@/lib/server/price-dashboard/identifier-shape";
import { isRevisionShape } from "@/lib/server/price-dashboard/revision-shape";
import type {
  BulkRefusalCode,
  DashboardIssue,
  DraftChangeRefusalCode,
} from "@/price-dashboard/price-dashboard-wire-contract";

// The bodies of the three draft writes, read at the boundary (M10 plan §8.4 d). A body that is not an object, or names a
// member the route does not take, is a request this route does not read (`malformed`, and no member is echoed). Anything
// else the person can correct is an issue: the member and a closed code, never the value. The wire types omit `groupId` and
// `bulk` from a single change at compile time only, so this reader is what keeps a crafted body from reaching
// `applyChanges`' grouping judgement: a change carrying either is `malformed`.

export type RequestReading<Value, Code extends string> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly refusal: RequestRefusal<Code> };

export type RequestRefusal<Code extends string> =
  | { readonly kind: "malformed" }
  | {
      readonly kind: "issues";
      readonly issues: readonly DashboardIssue<Code>[];
    };

type Members = Readonly<Record<string, unknown>>;

const MALFORMED = { ok: false, refusal: { kind: "malformed" } } as const;

function accepted<Value>(value: Value): RequestReading<Value, never> {
  return { ok: true, value };
}

function refusedWith<Code extends string>(
  field: DashboardIssue<Code>["field"],
  code: Code,
): RequestReading<never, Code> {
  return {
    ok: false,
    refusal: { kind: "issues", issues: [{ field, code }] },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// One change

export interface DraftChangeRequest {
  readonly expectedDraftRevision: string;
  readonly address: AppliedAddress;
  /** As sent: `applyChanges` judges it, and only a judged value is ever stored. */
  readonly value: unknown;
}

export function readDraftChangeRequest(
  bodyText: string,
): RequestReading<DraftChangeRequest, DraftChangeRefusalCode> {
  const body = membersOf(bodyText, ["expectedDraftRevision", "change"]);
  if (body === undefined) return MALFORMED;
  const revision = readRevision(body.expectedDraftRevision);
  if (!revision.ok) return revision;
  const change = readChangeMembers(body.change);
  if (!change.ok) return change;
  return accepted({ expectedDraftRevision: revision.value, ...change.value });
}

function readChangeMembers(
  declared: unknown,
): RequestReading<
  Pick<DraftChangeRequest, "address" | "value">,
  DraftChangeRefusalCode
> {
  if (!isPlainRecord(declared)) return refusedWith("change", "MISSING_VALUE");
  if (hasMemberOutside(declared, ["address", "value"])) return MALFORMED;
  return withAddress(declared.address, (address) =>
    accepted({ address, value: ownMember(declared, "value") }),
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// A revert

export type RevertTarget =
  | { readonly kind: "change"; readonly address: AppliedAddress }
  | { readonly kind: "group"; readonly groupId: string };

export interface RevertRequest {
  readonly expectedDraftRevision: string;
  readonly target: RevertTarget;
}

/** Resets the whole draft; it names no change, and `scope` is the one member that tells it from a revert. */
export interface DiscardRequest {
  readonly expectedDraftRevision: string;
  readonly scope: "all";
}

/** What the draft's `DELETE` takes: a revert of one change or group (`target`), or a discard of everything (`scope`). */
export type RevertOrDiscardRequest = RevertRequest | DiscardRequest;

export function isDiscardRequest(
  request: RevertOrDiscardRequest,
): request is DiscardRequest {
  return "scope" in request;
}

export function readRevertRequest(
  bodyText: string,
): RequestReading<RevertOrDiscardRequest, DraftChangeRefusalCode> {
  const body = membersOf(bodyText, [
    "expectedDraftRevision",
    "target",
    "scope",
  ]);
  if (body === undefined) return MALFORMED;
  const revision = readRevision(body.expectedDraftRevision);
  if (!revision.ok) return revision;
  if (Object.hasOwn(body, "scope")) {
    return readDiscard(body, revision.value);
  }
  const target = readRevertTarget(body.target);
  if (!target.ok) return target;
  return accepted({
    expectedDraftRevision: revision.value,
    target: target.value,
  });
}

function readDiscard(
  body: Members,
  expectedDraftRevision: string,
): RequestReading<DiscardRequest, DraftChangeRefusalCode> {
  if (Object.hasOwn(body, "target")) return MALFORMED;
  return body.scope === "all"
    ? accepted({ expectedDraftRevision, scope: "all" })
    : refusedWith("scope", "MISSING_VALUE");
}

function readRevertTarget(
  declared: unknown,
): RequestReading<RevertTarget, DraftChangeRefusalCode> {
  if (!isPlainRecord(declared)) return refusedWith("target", "MISSING_VALUE");
  const kind = declared.kind;
  if (kind === "change") {
    if (hasMemberOutside(declared, ["kind", "address"])) return MALFORMED;
    return withAddress(declared.address, (address) =>
      accepted({ kind: "change", address }),
    );
  }
  if (kind === "group") {
    if (hasMemberOutside(declared, ["kind", "groupId"])) return MALFORMED;
    const groupId = declared.groupId;
    return isIdentifier(groupId)
      ? accepted({ kind: "group", groupId })
      : refusedWith("groupId", "MISSING_VALUE");
  }
  return refusedWith("target", "MISSING_VALUE");
}

// ---------------------------------------------------------------------------------------------------------------------
// A bulk action

export type BulkTarget =
  | { readonly scope: "all" }
  | { readonly scope: "group"; readonly groupCode: PriceGroupCode }
  | { readonly scope: "selection"; readonly ruleIds: readonly string[] };

export interface BulkRequest {
  readonly expectedDraftRevision: string;
  readonly target: BulkTarget;
  /** A non-zero safe integer: the one form every later step (the stored `bulk`, the audit detail) can hold. */
  readonly percent: number;
}

export function readBulkRequest(
  bodyText: string,
): RequestReading<BulkRequest, BulkRefusalCode> {
  const body = membersOf(bodyText, [
    "expectedDraftRevision",
    "target",
    "percent",
  ]);
  if (body === undefined) return MALFORMED;
  const revision = readRevision(body.expectedDraftRevision);
  if (!revision.ok) return revision;
  const target = readBulkTarget(body.target);
  if (!target.ok) return target;
  const percent = readPercent(body.percent);
  if (!percent.ok) return percent;
  return accepted({
    expectedDraftRevision: revision.value,
    target: target.value,
    percent: percent.value,
  });
}

/**
 * A whole, non-zero percentage as a safe integer. 0 % is refused (ruling R2-Q7): it would write a group of changes that
 * change nothing. The bulk action's own bounds are judged by whoever scales the amounts.
 */
function readPercent(
  declared: unknown,
): RequestReading<number, BulkRefusalCode> {
  if (declared === undefined || declared === null) {
    return refusedWith("percent", "MISSING_VALUE");
  }
  if (typeof declared !== "number" || !Number.isInteger(declared)) {
    return refusedWith("percent", "NOT_A_WHOLE_NUMBER");
  }
  if (!Number.isSafeInteger(declared)) {
    return refusedWith("percent", "PERCENT_OUT_OF_RANGE");
  }
  // `-0 === 0`, so a percentage that rounds to `-0` is refused with 0 % and can never be stored or audited as a reduction.
  return declared === 0
    ? refusedWith("percent", "PERCENT_OUT_OF_RANGE")
    : accepted(declared);
}

function readBulkTarget(
  declared: unknown,
): RequestReading<BulkTarget, BulkRefusalCode> {
  if (!isPlainRecord(declared)) return refusedWith("scope", "MISSING_VALUE");
  switch (declared.scope) {
    case "all":
      return hasMemberOutside(declared, ["scope"])
        ? MALFORMED
        : accepted({ scope: "all" });
    case "group":
      return readGroupTarget(declared);
    case "selection":
      return readSelectionTarget(declared);
    default:
      return refusedWith("scope", "MISSING_VALUE");
  }
}

function readGroupTarget(
  declared: Members,
): RequestReading<BulkTarget, BulkRefusalCode> {
  if (hasMemberOutside(declared, ["scope", "groupCode"])) return MALFORMED;
  const groupCode = declared.groupCode;
  if (groupCode === undefined) return refusedWith("groupCode", "MISSING_VALUE");
  const code = PRICE_GROUP_CODES.find((known) => known === groupCode);
  return code === undefined
    ? refusedWith("groupCode", "UNKNOWN_GROUP")
    : accepted({ scope: "group", groupCode: code });
}

function readSelectionTarget(
  declared: Members,
): RequestReading<BulkTarget, BulkRefusalCode> {
  if (hasMemberOutside(declared, ["scope", "ruleIds"])) return MALFORMED;
  const ruleIds = declared.ruleIds;
  if (!Array.isArray(ruleIds)) return refusedWith("ruleIds", "MISSING_VALUE");
  if (ruleIds.length === 0) {
    return refusedWith("ruleIds", "NO_CABINETS_SELECTED");
  }
  if (!ruleIds.every(isIdentifier))
    return refusedWith("ruleIds", "UNKNOWN_RULE");
  return accepted({ scope: "selection", ruleIds: [...new Set(ruleIds)] });
}

// ---------------------------------------------------------------------------------------------------------------------
// The pieces they share

/** The body as the object it must be, with no member outside `allowed`; `undefined` is a request this route does not read. */
function membersOf(
  bodyText: string,
  allowed: readonly string[],
): Members | undefined {
  const body = parseJsonObject(bodyText);
  return body === undefined || hasMemberOutside(body, allowed)
    ? undefined
    : body;
}

function hasMemberOutside(
  members: Members,
  allowed: readonly string[],
): boolean {
  return Object.keys(members).some((member) => !allowed.includes(member));
}

function ownMember(members: Members, name: string): unknown {
  return Object.hasOwn(members, name) ? members[name] : undefined;
}

/** The revision is opaque: it is checked for its shape as text and compared for equality, and never parsed. */
function readRevision(
  declared: unknown,
): RequestReading<string, DraftChangeRefusalCode & BulkRefusalCode> {
  if (typeof declared !== "string") {
    return refusedWith("expectedDraftRevision", "MISSING_VALUE");
  }
  return isRevisionShape(declared)
    ? accepted(declared)
    : refusedWith("expectedDraftRevision", "NOT_A_WHOLE_NUMBER");
}

function withAddress<Value>(
  declared: unknown,
  continueWith: (
    address: AppliedAddress,
  ) => RequestReading<Value, DraftChangeRefusalCode>,
): RequestReading<Value, DraftChangeRefusalCode> {
  const reading = readAppliedAddress(declared);
  switch (reading.kind) {
    case "address":
      return continueWith(reading.address);
    case "not-applied":
      return refusedWith("address", "NOT_EDITABLE");
    case "unknown":
      return refusedWith("address", "UNKNOWN_ADDRESS");
    case "extra-member":
      return MALFORMED;
  }
}
