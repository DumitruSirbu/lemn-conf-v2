import {
  isRevisionShape,
  ITEM_ID_MEMBER_OF_KIND,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import {
  ask,
  INVALID_INPUT_STATUS,
  OK_STATUS,
} from "@/price-dashboard/dashboard-fetch";
import {
  PRICE_NOTICE_REFUSALS,
  type PriceNoticeRefusal,
  type PriceNoticeWire,
  type PriceStampWire,
  type RemovedAccessoryWire,
  type RequiredReplacementWire,
} from "@/price-dashboard/price-dashboard-wire-contract";
import { ownValueOf } from "@/staff/staff-kitchens-wire-reading";

// The browser's two calls to the customer's price notice (ADR 0178 A-11): what to tell the owner of a saved kitchen on
// opening it, and the record that they were told. Every answer is sorted into a closed outcome and nothing else: a
// `404`, `429`, `500`, `503`, a network failure and a body that is not the route's own are all one `unavailable`, which
// the screen reads as "say nothing and write nothing". There is no retry in this file, by design: each call spends a
// limiter token, and a notice that cannot be had is shown on the next open.

const NOTICE_ADDRESS_OF = (designId: string): string =>
  `/api/designs/${designId}/price-notice`;
const ACKNOWLEDGE_ADDRESS_OF = (designId: string): string =>
  `${NOTICE_ADDRESS_OF(designId)}/acknowledge`;

export type NoticeRead =
  | { readonly kind: "notice"; readonly notice: PriceNoticeWire }
  | { readonly kind: "unavailable" };

export type AcknowledgementOutcome =
  | { readonly kind: "acknowledged" }
  /** `400` of the route's own word: the pair names a version that does not exist or a revision beyond the head. */
  | { readonly kind: "refused"; readonly refusal: PriceNoticeRefusal }
  /** Anything else, a `400` for a malformed body included. Nothing was written, or nobody can say that it was. */
  | { readonly kind: "failed" };

export interface PriceNoticeClient {
  readonly read: (designId: string) => Promise<NoticeRead>;
  readonly acknowledge: (
    designId: string,
    displayedPair: PriceStampWire,
  ) => Promise<AcknowledgementOutcome>;
}

const UNAVAILABLE: NoticeRead = { kind: "unavailable" };
const FAILED: AcknowledgementOutcome = { kind: "failed" };

export const FETCHING_PRICE_NOTICE_CLIENT: PriceNoticeClient = {
  read: async (designId) => {
    const answer = await ask(NOTICE_ADDRESS_OF(designId), { method: "GET" });
    if (answer?.status !== OK_STATUS) return UNAVAILABLE;
    const notice = noticeOf(answer.body);
    return notice === undefined ? UNAVAILABLE : { kind: "notice", notice };
  },
  acknowledge: async (designId, displayedPair) => {
    // Exactly the two members the route reads, and never anything the answer to the `GET` carried.
    const body = JSON.stringify({
      versionId: displayedPair.versionId,
      availabilityRevision: displayedPair.availabilityRevision,
    });
    const answer = await ask(ACKNOWLEDGE_ADDRESS_OF(designId), {
      method: "POST",
      body,
    });
    if (answer === undefined) return FAILED;
    return acknowledgementOutcomeOf(answer);
  },
};

function acknowledgementOutcomeOf({
  status,
  body,
}: {
  readonly status: number;
  readonly body: unknown;
}): AcknowledgementOutcome {
  if (status === OK_STATUS) {
    return stampOf(ownValueOf(body, "acknowledged")) === undefined
      ? FAILED
      : { kind: "acknowledged" };
  }
  if (status !== INVALID_INPUT_STATUS) return FAILED;
  const word = ownValueOf(body, "status");
  const refusal = PRICE_NOTICE_REFUSALS.find((known) => known === word);
  return refusal === undefined ? FAILED : { kind: "refused", refusal };
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading a `200`

/** The notice a body states, or `undefined` for anything that is not the wire's shape member by member. */
export function noticeOf(body: unknown): PriceNoticeWire | undefined {
  const isSent = ownValueOf(body, "isSent");
  if (typeof isSent !== "boolean") return undefined;
  const kind = ownValueOf(body, "kind");
  if (kind === "no-active-version") return { kind, isSent };
  if (kind !== "active-version") return undefined;
  return activeNoticeOf(body, isSent);
}

function activeNoticeOf(
  body: unknown,
  isSent: boolean,
): PriceNoticeWire | undefined {
  const current = stampOf(ownValueOf(body, "current"));
  const pricesChanged = ownValueOf(body, "pricesChanged");
  const replacementsRequired = listOf(
    ownValueOf(body, "replacementsRequired"),
    replacementOf,
  );
  const removedAccessories = listOf(
    ownValueOf(body, "removedAccessories"),
    removedAccessoryOf,
  );
  if (
    current === undefined ||
    typeof pricesChanged !== "boolean" ||
    replacementsRequired === undefined ||
    removedAccessories === undefined
  ) {
    return undefined;
  }
  return {
    kind: "active-version",
    isSent,
    current,
    pricesChanged,
    replacementsRequired,
    removedAccessories,
  };
}

function stampOf(value: unknown): PriceStampWire | undefined {
  const versionId = ownValueOf(value, "versionId");
  const availabilityRevision = ownValueOf(value, "availabilityRevision");
  if (typeof versionId !== "string" || versionId === "") return undefined;
  if (!isRevisionShape(availabilityRevision)) return undefined;
  return { versionId, availabilityRevision };
}

/** Every member read, or nothing: one member off the wire's shape discards the whole list. */
function listOf<Member>(
  value: unknown,
  read: (member: unknown) => Member | undefined,
): readonly Member[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const members = (value as readonly unknown[]).map(read);
  return members.every((member) => member !== undefined)
    ? (members as readonly Member[])
    : undefined;
}

function replacementOf(value: unknown): RequiredReplacementWire | undefined {
  const item = itemRefOf(ownValueOf(value, "item"));
  const remaining = listOf(ownValueOf(value, "remaining"), itemRefOf);
  return item === undefined || remaining === undefined
    ? undefined
    : { item, remaining };
}

/** An item by a known kind and the one text member that kind names it by. */
function itemRefOf(value: unknown): ItemRef | undefined {
  const kind = ownValueOf(value, "kind");
  if (
    typeof kind !== "string" ||
    !Object.hasOwn(ITEM_ID_MEMBER_OF_KIND, kind)
  ) {
    return undefined;
  }
  const member =
    ITEM_ID_MEMBER_OF_KIND[kind as keyof typeof ITEM_ID_MEMBER_OF_KIND];
  const id = ownValueOf(value, member);
  // A handle is one of a closed list of words; here it is only known to be text, and nothing reads it as more.
  return typeof id === "string"
    ? ({ kind, [member]: id } as ItemRef)
    : undefined;
}

function removedAccessoryOf(value: unknown): RemovedAccessoryWire | undefined {
  const accessoryId = ownValueOf(value, "accessoryId");
  if (typeof accessoryId !== "string") return undefined;
  const authoredName = ownValueOf(value, "authoredName");
  if (authoredName === undefined) return { accessoryId };
  return typeof authoredName === "string"
    ? { accessoryId, authoredName }
    : undefined;
}
