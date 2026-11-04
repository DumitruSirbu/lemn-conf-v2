import "server-only";

import { NextResponse } from "next/server";

import {
  CATALOGUE_ACTIVATION_AUDIT_ACTION,
  HandleSchema,
  isItemDisabled,
  isItemStated,
  judgeAvailabilityChange,
  readStoredNewKitchenSettings,
  type AvailabilityRefusalCode,
  type CatalogueAvailability,
  type CatalogueActivationAuditInput,
  type ItemRef,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { DashboardStoreError, NONE_SAVED } from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  ACCOUNT_RESPONSE_HEADERS,
  answerOfJudgement,
  invalidRequestResponse,
  unauthenticatedResponse,
} from "@/lib/server/account/account-responses";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import { readBookOf } from "@/lib/server/active-price-book";
import { dashboardConflictResponse } from "@/lib/server/price-dashboard/dashboard-responses";
import {
  DashboardStateUnreadableError,
  readDashboardAvailability,
} from "@/lib/server/price-dashboard/dashboard-state";
import {
  accepted,
  MALFORMED,
  membersOf,
  ownMember,
  type RequestReading,
} from "@/lib/server/price-dashboard/draft-requests";
import {
  isIdentifier,
  isPlainRecord,
} from "@/lib/server/price-dashboard/identifier-shape";
import { isRevisionShape } from "@/lib/server/price-dashboard/revision-shape";
import {
  PRICE_DRAFT_EVENT,
  type DashboardWriteRequest,
} from "@/lib/server/price-dashboard/price-dashboard-service";
import { getPriceStores, type PriceStores } from "@/lib/server/price-stores";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import { actingSessionOf } from "@/lib/server/staff/staff-acting-session";
import { admitStaff } from "@/lib/server/staff/staff-admission";
import type {
  AvailabilitySetWire,
  DashboardItemIsDefaultWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

// An item switched on or off by an administrator, immediately and outside the draft (A-17). The order of checks is the
// draft writes': the route has checked the origin, the media type and the body's size; from there the session and
// `price.edit`, the body's members, the account's bucket (the draft's own, shared, and failing closed), and only then the
// stores. The availability head is read first and the saved defaults second, so a defaults save landing between the two is
// judged against its new defaults, and one landing after both fails the write's compare-and-set on the head. The write
// and its audit row commit in one transaction or not at all. A request that asks for the state an item is already in
// writes nothing and is answered with the head as it is, whatever revision it names. Anything thrown that is not mapped here is a `503` that
// carries no cause, from the route's `answerUnavailableOnFailure`.

/** What a saved row of defaults is when none was ever saved: a new kitchen then starts from the fixed fallbacks. */
const NO_SAVED_DEFAULTS: NewKitchenSettings = Object.freeze({});

/** The saved defaults are stored as `unknown`, and a row that is not settings is a defect of the store, never "none". */
export class SavedDefaultsUnreadableError extends Error {
  constructor() {
    super("The saved kitchen defaults are not settings a new kitchen takes.");
    this.name = "SavedDefaultsUnreadableError";
  }
}

/**
 * The defaults the dashboard has saved, parsed. `{}` when none were saved. A saved row that does not parse is thrown,
 * so every route that reads it answers `503` and none judges against `{}` (which would release the saved default).
 */
export async function readSavedDefaults(
  stores: Pick<PriceStores, "defaults">,
): Promise<NewKitchenSettings> {
  const read = await stores.defaults.read();
  if (read.kind === NONE_SAVED.kind) return NO_SAVED_DEFAULTS;
  const reading = readStoredNewKitchenSettings(read.saved.defaults);
  if (!reading.ok) throw new SavedDefaultsUnreadableError();
  return reading.defaults;
}

// ---------------------------------------------------------------------------------------------------------------------
// The request

interface AvailabilityRequest {
  readonly expectedRevision: string;
  readonly item: ItemRef;
  readonly active: boolean;
}

/** The one member that names an item's id, for each kind of item the catalogue can switch off. */
const ID_MEMBER_OF_KIND = {
  material: "tierId",
  hardware: "tierId",
  finish: "finishId",
  handle: "handle",
  accessory: "accessoryId",
} as const;

type ItemKind = keyof typeof ID_MEMBER_OF_KIND;

/** A body with a member beyond the three, or one of them not what it declares, is a request this route does not read. */
function readAvailabilityRequest(
  bodyText: string,
): RequestReading<AvailabilityRequest, never> {
  const body = membersOf(bodyText, ["expectedRevision", "item", "active"]);
  if (body === undefined) return MALFORMED;
  const expectedRevision = ownMember(body, "expectedRevision");
  const item = readItem(ownMember(body, "item"));
  const active = ownMember(body, "active");
  if (
    typeof expectedRevision !== "string" ||
    !isRevisionShape(expectedRevision) ||
    item === undefined ||
    typeof active !== "boolean"
  ) {
    return MALFORMED;
  }
  return accepted({ expectedRevision, item, active });
}

/** An item as exactly its kind and its one id, rebuilt member by member: a member beyond them is not read. */
function readItem(declared: unknown): ItemRef | undefined {
  if (!isPlainRecord(declared)) return undefined;
  const kind = ownMember(declared, "kind");
  if (typeof kind !== "string" || !Object.hasOwn(ID_MEMBER_OF_KIND, kind)) {
    return undefined;
  }
  const idMember = ID_MEMBER_OF_KIND[kind as ItemKind];
  const id = ownMember(declared, idMember);
  const namesOnlyKindAndId = Object.keys(declared).length === 2;
  if (!namesOnlyKindAndId || !isIdentifier(id)) return undefined;
  if (kind === "handle" && !HandleSchema.safeParse(id).success) {
    return undefined;
  }
  return { kind, [idMember]: id } as ItemRef;
}

// ---------------------------------------------------------------------------------------------------------------------
// The write

/** Switches one item on or off for every customer's next evaluation, against the availability revision the page read. */
export async function setItemActiveAsStaff({
  cookies,
  headers,
  bodyText,
}: DashboardWriteRequest): Promise<NextResponse> {
  const admission = await admitStaff({
    cookies,
    event: PRICE_DRAFT_EVENT,
    capability: "price.edit",
  });
  if (admission.kind === "refused") return admission.response;
  const reading = readAvailabilityRequest(bodyText);
  if (!reading.ok) return refused(invalidRequestResponse());
  const limited = answerOfJudgement(
    await judgeAccountSubject({
      purpose: "staff-price-draft",
      headers,
      accountId: admission.session.accountId,
    }),
  );
  if (limited !== undefined) return limited;
  try {
    return await performSetActive(reading.value, cookies);
  } catch (failure) {
    return answerOfStoreFailure(failure);
  }
}

async function performSetActive(
  request: AvailabilityRequest,
  cookies: SessionCookieReader,
): Promise<NextResponse> {
  const stores = await getPriceStores();
  const availability = await readDashboardAvailability(stores);
  const book = await readActiveBook(stores);
  if (book === undefined) {
    return refused(dashboardConflictResponse("no-active-version"));
  }
  if (isAlreadyAsRequested(request, { availability, book })) {
    return succeeded(setResponse({ revision: availability.revision }));
  }
  if (availability.revision !== request.expectedRevision) {
    return changedMeanwhile();
  }
  const defaults = await readSavedDefaults(stores);
  const verdict = judgeAvailabilityChange(request, {
    book,
    availability,
    defaults,
  });
  if (verdict.kind === "refused") {
    return refused(refusalResponse(verdict.code, request.item));
  }
  const result = await stores.availability.setActive({
    item: request.item,
    active: request.active,
    expectedRevision: request.expectedRevision,
    audit: {
      session: actingSessionOf(cookies),
      entry: activationEntry(request),
    },
  });
  if (result.kind === "changed-meanwhile") return changedMeanwhile();
  return succeeded(setResponse({ revision: result.revision }));
}

/**
 * Whether the head already holds the item in the state asked for, so that nothing would change. Such a request writes
 * nothing and moves nothing, which is why it is answered whatever revision it names. An item the book does not state is
 * never "as requested": it goes on to be refused.
 */
function isAlreadyAsRequested(
  { item, active }: AvailabilityRequest,
  {
    availability,
    book,
  }: { availability: CatalogueAvailability; book: PriceBook },
): boolean {
  return (
    isItemStated(item, book) && isItemDisabled(availability, item) === !active
  );
}

/** The active version's book, or `undefined` before any version was published. A stored book that is not one is thrown. */
async function readActiveBook(
  stores: PriceStores,
): Promise<PriceBook | undefined> {
  const active = await stores.priceBook.readActive();
  if (active.kind !== "found") return undefined;
  const book = readBookOf(active.version);
  if (book === undefined) throw new DashboardStateUnreadableError("book");
  return book;
}

/** The activation as the audit row records it, by the item's kind and id and never a value. */
function activationEntry({
  item,
  active,
}: AvailabilityRequest): CatalogueActivationAuditInput {
  return {
    action: CATALOGUE_ACTIVATION_AUDIT_ACTION,
    detail: { itemKind: item.kind, itemId: idOf(item), active },
  };
}

function idOf(item: ItemRef): string {
  switch (item.kind) {
    case "material":
    case "hardware":
      return item.tierId;
    case "finish":
      return item.finishId;
    case "handle":
      return item.handle;
    case "accessory":
      return item.accessoryId;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The answers

/** `409` in the domain's own word. The D9 default is named, as the wire says (M5). */
function refusalResponse(
  code: AvailabilityRefusalCode,
  item: ItemRef,
): NextResponse {
  if (code !== "item-is-default") return dashboardConflictResponse(code);
  const body: DashboardItemIsDefaultWire = { status: code, item };
  return NextResponse.json(body, {
    status: 409,
    headers: ACCOUNT_RESPONSE_HEADERS,
  });
}

/** `200`: the revision the change created. */
function setResponse(wire: AvailabilitySetWire): NextResponse {
  return NextResponse.json(
    { revision: wire.revision },
    { status: 200, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}

function changedMeanwhile(): NextResponse {
  return refused(dashboardConflictResponse("changed-meanwhile"));
}

/** No live session behind the write is `401`, as for the other staff writes; every other failure is thrown on. */
function answerOfStoreFailure(failure: unknown): NextResponse {
  if (
    failure instanceof DashboardStoreError &&
    failure.failure === "not-recorded"
  ) {
    return refused(unauthenticatedResponse());
  }
  throw failure;
}

function refused(response: NextResponse): NextResponse {
  reportAccountEvent({ event: PRICE_DRAFT_EVENT, outcome: "refused" });
  return response;
}

function succeeded(response: NextResponse): NextResponse {
  reportAccountEvent({ event: PRICE_DRAFT_EVENT, outcome: "succeeded" });
  return response;
}
