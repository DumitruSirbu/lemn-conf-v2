// Where a sent request stands. Staff set it to any value from any other; the list is the only rule (plan P-L3-8).
// The domain publishes the codes and the UI maps them to words (ADR 0095 decision 3).

/** In the order staff work a request: the status select lists them as written. */
export const REQUEST_STATUSES = Object.freeze([
  "new",
  "contacted",
  "offer-sent",
  "closed",
] as const);
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** What a sent kitchen shows while no status has been saved for it. */
export const INITIAL_REQUEST_STATUS = "new" as const satisfies RequestStatus;

export function isRequestStatus(value: unknown): value is RequestStatus {
  return REQUEST_STATUSES.some((status) => status === value);
}

export interface RequestStatusFacts {
  readonly isSent: boolean;
  /** The saved status, or `null` while none has been saved. */
  readonly recorded: RequestStatus | null;
}

/**
 * A draft has no request and so no status; a sent kitchen with none saved is `new`. A saved status is returned
 * as given: a store passes the stored text through `isRequestStatus` before it can call this.
 */
export function shownRequestStatus(
  facts: RequestStatusFacts,
): RequestStatus | null {
  if (!facts.isSent) return null;
  return facts.recorded ?? INITIAL_REQUEST_STATUS;
}
