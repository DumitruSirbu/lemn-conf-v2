import { ownValueOf } from "@/staff/staff-kitchens-wire-reading";
import { raiseStaffSessionExpired } from "@/staff/staff-session-expiry";

import {
  ask,
  CONFLICT_STATUS,
  DRAFT_ADDRESS,
  INVALID_INPUT_STATUS,
  NOT_FOUND_STATUS,
  OK_STATUS,
  STATE_ADDRESS,
  UNAUTHORISED_STATUS,
  type Answer,
} from "./dashboard-fetch";
import {
  draftOutcomeOfAnswer,
  type DraftChangeOutcome,
} from "./price-draft-client";
import {
  PUBLISH_TEXT_REFUSAL_CODES,
  type DashboardStateWire,
  type DraftDiscardRequestWire,
  type PublishRequestWire,
  type RestoreRequestWire,
} from "./price-dashboard-wire-contract";
import {
  readDashboardStateWire,
  readDraftWire,
} from "./price-dashboard-wire-reading";
import {
  isStateRefusal,
  type DiscardOutcome,
  type DraftStateRefusal,
  type DraftWriteOutcome,
  type PublishOutcome,
  type RefusalReadingPublishClient,
  type RestoreOutcome,
  type VersionPageOutcome,
} from "./publish-client";
import {
  readCandidateRefusals,
  readItemRef,
  readPublishedWire,
  readRestoredWire,
  readVersionListWire,
} from "./publish-wire-reading";

// The publish screens' client over the dashboard's routes: `GET /api/staff/prices`, `PUT` and `DELETE` of `…/draft`,
// `POST …/publish`, `GET …/versions` and `POST …/versions/{id}/restore`. Every answer is sorted into the outcomes of
// `PublishClient`, and anything that is not one of the route's own is `failed`: nothing is shown as written until the
// route says so.

const PUBLISH_ADDRESS = "/api/staff/prices/publish";
const VERSIONS_ADDRESS = "/api/staff/prices/versions";

const FAILED = { kind: "failed" } as const;
const SESSION_ENDED = { kind: "session-ended" } as const;

export const FETCHING_PUBLISH_CLIENT: RefusalReadingPublishClient = {
  readState: async () => {
    const read = await readStateWithRefusal();
    return isStateRefusal(read) ? undefined : read;
  },
  readStateOrRefusal: readStateWithRefusal,
  publish,
  change: (request) => writeDraft("PUT", request),
  revert: (request) => writeDraft("DELETE", request),
  discardDraft,
  readVersionPage,
  restore,
};

async function writeDraft(
  method: "PUT" | "DELETE",
  request: object,
): Promise<DraftWriteOutcome> {
  const answer = await sendJson(method, DRAFT_ADDRESS, request);
  if (answer === undefined) return FAILED;
  return stateRefusalOf(answer) ?? draftOutcomeOf(draftOutcomeOfAnswer(answer));
}

function draftOutcomeOf(outcome: DraftChangeOutcome): DraftWriteOutcome {
  return outcome.kind === "changed"
    ? { kind: "changed", draft: outcome.written }
    : outcome;
}

/** The `409`s of a write that reads the draft and the active version first: a draft that cannot be read, no version. */
function stateRefusalOf({
  status,
  body,
}: Answer): DraftStateRefusal | undefined {
  if (status !== CONFLICT_STATUS) return undefined;
  const word = ownValueOf(body, "status");
  if (word === "no-active-version") return { kind: "no-active-version" };
  const draftRevision = ownValueOf(body, "draftRevision");
  return word === "draft-unreadable" && typeof draftRevision === "string"
    ? { kind: "draft-unreadable", draftRevision }
    : undefined;
}

async function readStateWithRefusal(): Promise<
  DashboardStateWire | DraftStateRefusal | undefined
> {
  const answer = await ask(STATE_ADDRESS, { method: "GET" });
  if (answer === undefined) return undefined;
  if (answer.status === UNAUTHORISED_STATUS) {
    raiseStaffSessionExpired({ keepsTypedText: true });
  }
  if (answer.status === OK_STATUS) return readDashboardStateWire(answer.body);
  return stateRefusalOf(answer);
}

async function discardDraft(
  request: DraftDiscardRequestWire,
): Promise<DiscardOutcome> {
  const answer = await sendJson("DELETE", DRAFT_ADDRESS, request);
  if (answer === undefined) return FAILED;
  if (answer.status === UNAUTHORISED_STATUS) return SESSION_ENDED;
  if (answer.status === CONFLICT_STATUS) return conflictOrFailed(answer.body);
  const draft =
    answer.status === OK_STATUS ? readDraftWire(answer.body) : undefined;
  return draft === undefined ? FAILED : { kind: "changed", draft };
}

async function publish(request: PublishRequestWire): Promise<PublishOutcome> {
  const answer = await sendJson("POST", PUBLISH_ADDRESS, request);
  if (answer === undefined) return FAILED;
  const refusal = stateRefusalOf(answer);
  if (refusal !== undefined) return refusal;
  switch (answer.status) {
    case OK_STATUS:
      return publishedOutcomeOf(answer.body);
    case INVALID_INPUT_STATUS:
      return invalidOutcomeOf(answer.body);
    case UNAUTHORISED_STATUS:
      return SESSION_ENDED;
    case CONFLICT_STATUS:
      return publishConflictOf(answer.body);
    default:
      return FAILED;
  }
}

function publishedOutcomeOf(body: unknown): PublishOutcome {
  const published = readPublishedWire(body);
  return published === undefined
    ? { kind: "answer-unreadable" }
    : { kind: "published", published };
}

/** A label or note the person can correct; a request member the screen never sends wrongly is not theirs to correct. */
function invalidOutcomeOf(body: unknown): PublishOutcome {
  const issues = ownValueOf(body, "issues");
  const first: unknown = Array.isArray(issues) ? issues[0] : undefined;
  const named = ownValueOf(first, "code");
  const code = PUBLISH_TEXT_REFUSAL_CODES.find((known) => known === named);
  return code === undefined ? FAILED : { kind: "invalid", code };
}

/**
 * The facts moved (`changed-meanwhile`, `availability-changed-meanwhile`) or the draft was emptied meanwhile
 * (`nothing-to-publish`): the page reads again. A catalogue that refuses the book names its reasons; a deletion the
 * server judged used or default names its items.
 */
function publishConflictOf(body: unknown): PublishOutcome {
  switch (ownValueOf(body, "status")) {
    case "changed-meanwhile":
    case "availability-changed-meanwhile":
    case "nothing-to-publish":
      return { kind: "conflict" };
    case "candidate-refused":
      return {
        kind: "candidate-refused",
        refusals: readCandidateRefusals(body),
      };
    case "item-in-use":
      return blockedInUseOf(body);
    case "item-is-default":
      return blockedIsDefaultOf(body);
    default:
      return FAILED;
  }
}

function blockedInUseOf(body: unknown): PublishOutcome {
  const declared = ownValueOf(body, "items");
  const items = Array.isArray(declared)
    ? (declared as readonly unknown[]).flatMap(
        (item) => readItemRef(item) ?? [],
      )
    : [];
  return items.length === 0
    ? FAILED
    : { kind: "blocked", block: { kind: "in-use", items } };
}

function blockedIsDefaultOf(body: unknown): PublishOutcome {
  const item = readItemRef(ownValueOf(body, "item"));
  return item === undefined
    ? FAILED
    : { kind: "blocked", block: { kind: "is-default", item } };
}

async function readVersionPage(page: number): Promise<VersionPageOutcome> {
  const query = new URLSearchParams({ page: String(page) });
  const answer = await ask(`${VERSIONS_ADDRESS}?${query.toString()}`, {
    method: "GET",
  });
  if (answer === undefined) return FAILED;
  if (answer.status === UNAUTHORISED_STATUS) return SESSION_ENDED;
  const list =
    answer.status === OK_STATUS ? readVersionListWire(answer.body) : undefined;
  return list === undefined ? FAILED : { kind: "listed", list };
}

async function restore(
  versionId: string,
  request: RestoreRequestWire,
): Promise<RestoreOutcome> {
  const address = `${VERSIONS_ADDRESS}/${encodeURIComponent(versionId)}/restore`;
  const answer = await sendJson("POST", address, request);
  if (answer === undefined) return FAILED;
  const refusal = stateRefusalOf(answer);
  if (refusal !== undefined) return refusal;
  switch (answer.status) {
    case OK_STATUS:
      return restoredOutcomeOf(answer.body);
    case UNAUTHORISED_STATUS:
      return SESSION_ENDED;
    case NOT_FOUND_STATUS:
      return { kind: "version-not-found" };
    case CONFLICT_STATUS:
      return restoreConflictOf(answer.body);
    default:
      return FAILED;
  }
}

function restoredOutcomeOf(body: unknown): RestoreOutcome {
  const restored = readRestoredWire(body);
  return restored === undefined ? FAILED : { kind: "restored", ...restored };
}

function restoreConflictOf(body: unknown): RestoreOutcome {
  switch (ownValueOf(body, "status")) {
    case "changed-meanwhile":
      return { kind: "conflict" };
    case "nothing-differs":
      return { kind: "nothing-differs" };
    case "candidate-refused":
      return { kind: "candidate-refused" };
    default:
      return FAILED;
  }
}

function conflictOrFailed(body: unknown): DiscardOutcome {
  return ownValueOf(body, "status") === "changed-meanwhile"
    ? { kind: "conflict" }
    : FAILED;
}

function sendJson(
  method: "PUT" | "DELETE" | "POST",
  address: string,
  request: object,
): Promise<Answer | undefined> {
  return ask(address, { method, body: JSON.stringify(request) });
}
