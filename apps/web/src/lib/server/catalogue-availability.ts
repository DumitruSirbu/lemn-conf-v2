import "server-only";

import { NextResponse } from "next/server";

import {
  CATALOGUE_ACTIVATION_AUDIT_ACTION,
  isItemDisabled,
  isItemStated,
  itemIdOf,
  judgeAvailabilityChange,
  type AvailabilityRefusalCode,
  type CatalogueActivationAuditInput,
  type CatalogueAvailability,
  type ItemRef,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { ACCOUNT_RESPONSE_HEADERS } from "@/lib/server/account/account-responses";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import {
  dashboardConflictResponse,
  itemIsDefaultResponse,
} from "@/lib/server/price-dashboard/dashboard-responses";
import { readDashboardAvailability } from "@/lib/server/price-dashboard/dashboard-state";
import {
  accepted,
  MALFORMED,
  membersOf,
  ownMember,
  type RequestReading,
} from "@/lib/server/price-dashboard/draft-requests";
import {
  PRICE_DRAFT_EVENT,
  changedMeanwhile,
  refused,
  runStaffWrite,
  succeeded,
  type DashboardWriteRequest,
  type StaffWrite,
} from "@/lib/server/price-dashboard/price-dashboard-service";
import {
  readActiveBook,
  readItemRef,
} from "@/lib/server/price-dashboard/item-ref-reading";
import { isRevisionShape } from "@/lib/server/price-dashboard/revision-shape";
import { readSavedDefaults } from "@/lib/server/price-dashboard/saved-defaults";
import { getPriceStores, type PriceStores } from "@/lib/server/price-stores";
import { actingSessionOf } from "@/lib/server/staff/staff-acting-session";
import type { AvailabilitySetWire } from "@/price-dashboard/price-dashboard-wire-contract";

interface AvailabilityRequest {
  readonly expectedRevision: string;
  readonly item: ItemRef;
  readonly active: boolean;
}

const AVAILABILITY_WRITE: StaffWrite<AvailabilityRequest> = {
  judge: readAvailabilityRequest,
  perform: performSetActive,
};

/**
 * Switches one item on or off for every customer's next evaluation, against the availability revision the page read
 * (ADR 0178, A-17). It is outside the draft and needs no publish.
 *
 * The pipeline is the draft writes': the session and `price.edit`, the body's members, the draft's own account bucket
 * (shared, and failing closed), and only then the stores. The availability head is read first, then the book, and the
 * saved defaults last, so a defaults save landing before the last read is judged against its new defaults, and one
 * landing after it fails the write's compare-and-set on the head. The write and its audit row commit in one transaction
 * or not at all. A request for the state an item is already in writes nothing and is answered with the head as it is,
 * whatever revision it names.
 */
export function setItemActiveAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runStaffWrite(AVAILABILITY_WRITE, request);
}

// ---------------------------------------------------------------------------------------------------------------------
// The request

/** A body with a member beyond the three, or one of them not what it declares, is a request this route does not read. */
function readAvailabilityRequest(
  bodyText: string,
): RequestReading<AvailabilityRequest, never> {
  const body = membersOf(bodyText, ["expectedRevision", "item", "active"]);
  if (body === undefined) return MALFORMED;
  const expectedRevision = ownMember(body, "expectedRevision");
  const item = readItemRef(ownMember(body, "item"));
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

// ---------------------------------------------------------------------------------------------------------------------
// The write

async function performSetActive(
  request: AvailabilityRequest,
  cookies: SessionCookieReader,
): Promise<NextResponse> {
  const stores = await getPriceStores();
  const availability = await readDashboardAvailability(stores);
  const book = await readActiveBook(stores);
  if (book === undefined) {
    return refused(
      PRICE_DRAFT_EVENT,
      dashboardConflictResponse("no-active-version"),
    );
  }
  if (
    isAlreadyAsRequested(request, { availability, book }) &&
    (await isHeadStill(stores, availability))
  ) {
    return succeeded(
      PRICE_DRAFT_EVENT,
      setResponse({ revision: availability.revision }),
    );
  }
  if (availability.revision !== request.expectedRevision) {
    return changedMeanwhile();
  }
  const defaults = await defaultsToJudge(stores, request);
  const verdict = judgeAvailabilityChange(request, {
    book,
    availability,
    defaults,
  });
  if (verdict.kind === "refused") {
    return refused(
      PRICE_DRAFT_EVENT,
      refusalResponse(verdict.code, request.item),
    );
  }
  return writeActivation(stores, request, cookies);
}

async function writeActivation(
  stores: PriceStores,
  request: AvailabilityRequest,
  cookies: SessionCookieReader,
): Promise<NextResponse> {
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
  return succeeded(
    PRICE_DRAFT_EVENT,
    setResponse({ revision: result.revision }),
  );
}

/**
 * Whether the head already holds the item in the state asked for, so that nothing would change. An item the book does not
 * state is never "as requested": it goes on to be refused.
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

/**
 * Whether the head is still the one read. A version published between the head's read and the book's creates its items
 * switched off, so a head read before it would show them on.
 */
export async function isHeadStill(
  stores: PriceStores,
  read: CatalogueAvailability,
): Promise<boolean> {
  const now = await readDashboardAvailability(stores);
  return now.revision === read.revision;
}

/** A switch-on is judged by the book alone, so a saved row that cannot be read does not stop an item coming back on. */
async function defaultsToJudge(
  stores: PriceStores,
  { active }: AvailabilityRequest,
): Promise<NewKitchenSettings> {
  if (active) return {};
  return (await readSavedDefaults(stores)).defaults;
}

/** The activation as the audit row records it, by the item's kind and id and never a value. */
function activationEntry({
  item,
  active,
}: AvailabilityRequest): CatalogueActivationAuditInput {
  return {
    action: CATALOGUE_ACTIVATION_AUDIT_ACTION,
    detail: { itemKind: item.kind, itemId: itemIdOf(item), active },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The answers

/** `409` in the domain's own word. The saved default is named, as the wire says. */
function refusalResponse(
  code: AvailabilityRefusalCode,
  item: ItemRef,
): NextResponse {
  return code === "item-is-default"
    ? itemIsDefaultResponse(item)
    : dashboardConflictResponse(code);
}

/** `200`: the revision the change created, or the head as it is for a change that was none. */
function setResponse(wire: AvailabilitySetWire): NextResponse {
  return NextResponse.json(
    { revision: wire.revision },
    { status: 200, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}
