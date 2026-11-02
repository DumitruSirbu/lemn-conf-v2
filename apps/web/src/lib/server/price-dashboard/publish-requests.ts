import {
  judgeVersionLabel,
  judgeVersionNote,
  type VersionTextJudgement,
  type VersionTextRefusalCode,
} from "@lemnaria/configurator-domain";

import {
  accepted,
  MALFORMED,
  membersOf,
  ownMember,
  type Members,
  type RequestReading,
} from "@/lib/server/price-dashboard/draft-requests";
import { isVersionId } from "@/lib/server/price-dashboard/identifier-shape";
import { isRevisionShape } from "@/lib/server/price-dashboard/revision-shape";
import type {
  DashboardIssue,
  PublishTextRefusalCode,
} from "@/price-dashboard/price-dashboard-wire-contract";

// A body that is not an object, names a member the route does not take, or holds a member of the wrong type is
// `malformed` and no member is echoed. That is how a `book` or a `provisional` in a publish is refused: the server
// computes the book from the stored draft and the switch has one source, the draft (see ADR 0178 F10). Only the label
// and the note are issues.

// ---------------------------------------------------------------------------------------------------------------------
// A publish

export interface PublishRequest {
  readonly expectedDraftRevision: string;
  readonly expectedActiveSequence: number;
  readonly expectedAvailabilityRevision: string;
  /** In the form that is stored: NFC, format characters gone, trimmed. */
  readonly label: string;
  /** In the form that is stored; empty when the person wrote none. */
  readonly note: string;
}

const PUBLISH_MEMBERS = [
  "expectedDraftRevision",
  "expectedActiveSequence",
  "expectedAvailabilityRevision",
  "label",
  "note",
] as const;

type Expectations = Pick<
  PublishRequest,
  | "expectedDraftRevision"
  | "expectedActiveSequence"
  | "expectedAvailabilityRevision"
>;

interface VersionTexts {
  readonly label: unknown;
  readonly note: unknown;
}

export function readPublishRequest(
  bodyText: string,
): RequestReading<PublishRequest, PublishTextRefusalCode> {
  const body = membersOf(bodyText, PUBLISH_MEMBERS);
  if (body === undefined) return MALFORMED;
  const expectations = readExpectations(body);
  const texts = {
    label: ownMember(body, "label"),
    note: ownMember(body, "note"),
  };
  if (expectations === undefined || !areTextsOrAbsent(texts)) return MALFORMED;
  return judgeVersionTexts(expectations, texts);
}

/** The revision and the sequence the page read, by shape; `undefined` when any is not one. */
function readExpectations(body: Members): Expectations | undefined {
  const expectedDraftRevision = ownMember(body, "expectedDraftRevision");
  const expectedActiveSequence = ownMember(body, "expectedActiveSequence");
  const expectedAvailabilityRevision = ownMember(
    body,
    "expectedAvailabilityRevision",
  );
  return isRevision(expectedDraftRevision) &&
    isSequence(expectedActiveSequence) &&
    isRevision(expectedAvailabilityRevision)
    ? {
        expectedDraftRevision,
        expectedActiveSequence,
        expectedAvailabilityRevision,
      }
    : undefined;
}

/** The label and the note by the domain's text rule: the request in its stored form, or an issue for each refused. */
function judgeVersionTexts(
  expectations: Expectations,
  { label, note }: VersionTexts,
): RequestReading<PublishRequest, PublishTextRefusalCode> {
  const judgedLabel = judgeVersionLabel(label);
  const judgedNote = judgeVersionNote(note);
  if (judgedLabel.ok && judgedNote.ok) {
    return accepted({
      ...expectations,
      label: judgedLabel.text,
      note: judgedNote.text,
    });
  }
  return {
    ok: false,
    refusal: {
      kind: "issues",
      issues: [
        ...issueOf("label", judgedLabel),
        ...issueOf("note", judgedNote),
      ],
    },
  };
}

function issueOf(
  field: "label" | "note",
  judgement: VersionTextJudgement,
): readonly DashboardIssue<PublishTextRefusalCode>[] {
  return judgement.ok
    ? []
    : [{ field, code: textRefusalCodeOf(judgement.code) }];
}

/** `NOT_TEXT` cannot reach here: a value that is not text was `malformed` before it was judged. */
function textRefusalCodeOf(
  code: VersionTextRefusalCode,
): PublishTextRefusalCode {
  switch (code) {
    case "REQUIRED":
      return "TEXT_EMPTY";
    case "TOO_LONG":
      return "TEXT_TOO_LONG";
    case "FORBIDDEN_CHARACTER":
    case "NOT_TEXT":
      return "TEXT_FORBIDDEN_CHARACTER";
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// A restore

export interface RestoreRequest {
  /** The version whose prices are put in the draft: an id of the shape a store can hold, before any store is asked. */
  readonly versionId: string;
  readonly expectedDraftRevision: string;
}

const NO_SUCH_VERSION = { ok: false, refusal: { kind: "not-found" } } as const;

/** `versionId` is the path's segment as it arrived: an id no store could hold is not found, and costs nothing. */
export function readRestoreRequest(
  versionId: string,
  bodyText: string,
): RequestReading<RestoreRequest, never> {
  if (!isVersionId(versionId)) return NO_SUCH_VERSION;
  const body = membersOf(bodyText, ["expectedDraftRevision"]);
  if (body === undefined) return MALFORMED;
  const expectedDraftRevision = ownMember(body, "expectedDraftRevision");
  return isRevision(expectedDraftRevision)
    ? accepted({ versionId, expectedDraftRevision })
    : MALFORMED;
}

// ---------------------------------------------------------------------------------------------------------------------
// The history's page

/** Far past any history this dashboard will hold; it keeps the page a small integer the store can turn into an offset. */
export const MAX_VERSION_PAGE = 10_000;

const FIRST_VERSION_PAGE = 1;
const PAGE_SHAPE = /^[1-9][0-9]*$/;

export type VersionPageReading =
  | { readonly ok: true; readonly page: number }
  | {
      readonly ok: false;
      readonly code: "NOT_A_WHOLE_NUMBER" | "TOO_LARGE";
    };

/** The page from the query: absent is the first, and anything but digits with no leading zero, once, is refused. */
export function readVersionPage(
  searchParams: URLSearchParams,
): VersionPageReading {
  const declared = searchParams.getAll("page");
  if (declared.length === 0) return { ok: true, page: FIRST_VERSION_PAGE };
  const [only] = declared;
  if (declared.length > 1 || only === undefined || !PAGE_SHAPE.test(only)) {
    return { ok: false, code: "NOT_A_WHOLE_NUMBER" };
  }
  const page = Number(only);
  return page > MAX_VERSION_PAGE
    ? { ok: false, code: "TOO_LARGE" }
    : { ok: true, page };
}

// ---------------------------------------------------------------------------------------------------------------------
// The pieces they share

function isRevision(declared: unknown): declared is string {
  return typeof declared === "string" && isRevisionShape(declared);
}

/** The sequence number a publish expects: a whole number from 0, `0` being a store with no version yet. */
function isSequence(declared: unknown): declared is number {
  return (
    typeof declared === "number" &&
    Number.isSafeInteger(declared) &&
    declared >= 0
  );
}

/** Text, or not sent at all: the label is judged required afterwards, and an absent note is an empty one. */
function areTextsOrAbsent({ label, note }: VersionTexts): boolean {
  return [label, note].every(
    (declared) => declared === undefined || typeof declared === "string",
  );
}
