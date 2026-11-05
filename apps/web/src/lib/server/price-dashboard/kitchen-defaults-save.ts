import "server-only";

import { NextResponse } from "next/server";

import {
  declaredCabinetDepthsMm,
  FinishSchema,
  HandleSchema,
  judgeKitchenDefaults,
  readStoredNewKitchenSettings,
  stampedSettingsOf,
  type CatalogueAvailability,
  type ItemRef,
  type KitchenDefaultsField,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { isHeadStill } from "@/lib/server/catalogue-availability";
import { ACCOUNT_RESPONSE_HEADERS } from "@/lib/server/account/account-responses";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import { kitchenDefaultsSavedEntry } from "@/lib/server/price-dashboard/dashboard-audit-entries";
import {
  dashboardConflictResponse,
  dashboardInvalidInputResponse,
} from "@/lib/server/price-dashboard/dashboard-responses";
import { readDashboardAvailability } from "@/lib/server/price-dashboard/dashboard-state";
import {
  accepted,
  MALFORMED,
  membersOf,
  ownMember,
  type Members,
  type RequestReading,
} from "@/lib/server/price-dashboard/draft-requests";
import {
  hasMemberOutside,
  isIdentifier,
  isPlainRecord,
} from "@/lib/server/price-dashboard/identifier-shape";
import { readActiveBook } from "@/lib/server/price-dashboard/item-ref-reading";
import { completedDefaultsOf } from "@/lib/server/price-dashboard/new-kitchen-defaults";
import {
  PRICE_DRAFT_EVENT,
  changedMeanwhile,
  refused,
  runStaffWrite,
  succeeded,
  type DashboardWriteRequest,
  type StaffWrite,
} from "@/lib/server/price-dashboard/price-dashboard-service";
import { isRevisionShape } from "@/lib/server/price-dashboard/revision-shape";
import { readSavedDefaultsLeniently } from "@/lib/server/price-dashboard/saved-defaults";
import { getPriceStores, type PriceStores } from "@/lib/server/price-stores";
import { actingSessionOf } from "@/lib/server/staff/staff-acting-session";
import {
  DEFAULTS_ROW_ORDER,
  modifiedMembers,
} from "@/price-dashboard/kitchen-defaults-model";
import {
  KITCHEN_DEFAULTS_MEMBERS,
  type DashboardItemUnavailableWire,
  type DefaultsRefusalCode,
  type KitchenDefaultsMember,
  type KitchenDefaultsSavedWire,
  type KitchenDefaultsSaveRequestWire,
  type KitchenDefaultsWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

const SAVE_MEMBERS = [
  "expectedRevision",
  "expectedAvailabilityRevision",
  "defaults",
] as const;

const ALL_FIELDS: readonly KitchenDefaultsField[] = DEFAULTS_ROW_ORDER.map(
  (member) => KITCHEN_DEFAULTS_MEMBERS[member],
);

const DEFAULTS_WRITE: StaffWrite<KitchenDefaultsSaveRequestWire> = {
  judge: readKitchenDefaultsRequest,
  perform: performSave,
};

/**
 * Saves the new-kitchen defaults for every customer's next new kitchen, against the defaults revision and the
 * availability head the page read (ADR 0178, A-9). It is outside the draft and needs no publish.
 *
 * The pipeline is the draft writes': the session and `price.edit`, the body's members, the draft's own account bucket
 * (shared, and failing closed), and only then the stores. The availability head is read first, then the book, then the
 * saved defaults. The save, the head's move and its audit row commit in one transaction or not at all. A save that
 * changes nothing writes nothing and is answered with both revisions as they are, whatever revisions it names.
 */
export function saveKitchenDefaultsAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runStaffWrite(DEFAULTS_WRITE, request);
}

// ---------------------------------------------------------------------------------------------------------------------
// The request

/**
 * Exactly three members, and `defaults` exactly the six. Nothing here reaches a store, and nothing that passes can make
 * `stampedSettingsOf` throw. A member that is absent or `null` is `MISSING_VALUE` and a member that is present and not
 * one the setting takes is `UNKNOWN_VALUE`, naming the member; the first is the one told. A body that is not an object,
 * or holds a member beyond those, is a request this route does not read: `defaults` itself has no name to be refused by.
 */
function readKitchenDefaultsRequest(
  bodyText: string,
): RequestReading<KitchenDefaultsSaveRequestWire, DefaultsRefusalCode> {
  const body = membersOf(bodyText, SAVE_MEMBERS);
  if (body === undefined) return MALFORMED;
  const expectedRevision = readRevision(body, "expectedRevision");
  if (!expectedRevision.ok) return expectedRevision;
  const expectedAvailabilityRevision = readRevision(
    body,
    "expectedAvailabilityRevision",
  );
  if (!expectedAvailabilityRevision.ok) return expectedAvailabilityRevision;
  const defaults = readDefaults(ownMember(body, "defaults"));
  if (!defaults.ok) return defaults;
  return accepted({
    expectedRevision: expectedRevision.value,
    expectedAvailabilityRevision: expectedAvailabilityRevision.value,
    defaults: defaults.value,
  });
}

function refusedWith(
  field:
    | KitchenDefaultsMember
    | "expectedRevision"
    | "expectedAvailabilityRevision",
  code: DefaultsRefusalCode,
): RequestReading<never, DefaultsRefusalCode> {
  return {
    ok: false,
    refusal: { kind: "issues", issues: [{ field, code }] },
  };
}

/** The revision is opaque: it is checked for its shape as text and compared for equality, and never parsed. */
function readRevision(
  body: Members,
  field: "expectedRevision" | "expectedAvailabilityRevision",
): RequestReading<string, DefaultsRefusalCode> {
  const declared = ownMember(body, field);
  if (typeof declared !== "string") return refusedWith(field, "MISSING_VALUE");
  return isRevisionShape(declared)
    ? accepted(declared)
    : refusedWith(field, "UNKNOWN_VALUE");
}

function readDefaults(
  declared: unknown,
): RequestReading<KitchenDefaultsWire, DefaultsRefusalCode> {
  if (!isPlainRecord(declared)) return MALFORMED;
  if (hasMemberOutside(declared, DEFAULTS_ROW_ORDER)) return MALFORMED;
  const absent = DEFAULTS_ROW_ORDER.find((member) =>
    isAbsent(declared, member),
  );
  if (absent !== undefined) return refusedWith(absent, "MISSING_VALUE");
  const unknown = DEFAULTS_ROW_ORDER.find(
    (member) => !isValueOf(declared, member),
  );
  if (unknown !== undefined) {
    return refusedWith(
      unknown,
      unknown === "finish" ? "FINISH_NOT_IN_PALETTE" : "UNKNOWN_VALUE",
    );
  }
  return wholeDefaultsOf(declared);
}

function isAbsent(members: Members, member: KitchenDefaultsMember): boolean {
  const declared = ownMember(members, member);
  return declared === undefined || declared === null;
}

/** Whether the member holds a value its setting takes, judged by shape alone: what is on offer is the judgement's. */
function isValueOf(members: Members, member: KitchenDefaultsMember): boolean {
  const declared = ownMember(members, member);
  switch (member) {
    case "materialTierId":
    case "hardwareTierId":
      return isIdentifier(declared);
    case "cabinetDepthMm":
      return (
        typeof declared === "number" &&
        declaredCabinetDepthsMm().includes(declared)
      );
    case "finish":
      return FinishSchema.safeParse(declared).success;
    case "handle":
    case "topRowHandle":
      return HandleSchema.safeParse(declared).success;
  }
}

/**
 * The six members rebuilt from what was read, so nothing but them is kept. The stored settings' own reader is the last
 * check, so a value the stamp would refuse is a request this route does not read and never a `503`.
 */
function wholeDefaultsOf(
  declared: Members,
): RequestReading<KitchenDefaultsWire, DefaultsRefusalCode> {
  const reading = readStoredNewKitchenSettings(declared);
  if (!reading.ok) return MALFORMED;
  const {
    materialTierId,
    hardwareTierId,
    cabinetDepthMm,
    finish,
    handle,
    topRowHandle,
  } = reading.defaults;
  if (
    materialTierId === undefined ||
    hardwareTierId === undefined ||
    cabinetDepthMm === undefined ||
    finish === undefined ||
    handle === undefined ||
    topRowHandle === undefined
  ) {
    return MALFORMED;
  }
  return accepted({
    materialTierId,
    hardwareTierId,
    cabinetDepthMm,
    finish,
    handle,
    topRowHandle,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The write

async function performSave(
  request: KitchenDefaultsSaveRequestWire,
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
  const saved = await readSavedDefaultsLeniently(stores);
  const changed = changedMembersOf(saved.defaults, book, request.defaults);
  if (changed.length === 0) {
    return answerNothingToSave(stores, {
      availability,
      revision: saved.revision,
    });
  }
  if (availability.revision !== request.expectedAvailabilityRevision) {
    return availabilityChangedMeanwhile();
  }
  if (saved.revision !== request.expectedRevision) return changedMeanwhile();
  const refusal = refusalOfJudgement(request.defaults, { book, availability });
  if (refusal !== undefined) return refusal;
  return writeDefaults(stores, { request, changed, cookies });
}

/**
 * The members whose value is not the held one, as the audit row's codes, in the rows' order. A saved row that cannot be
 * read holds nothing to equal, so a save over it changes every member: that is how it is repaired.
 */
function changedMembersOf(
  held: NewKitchenSettings | undefined,
  book: PriceBook,
  sent: KitchenDefaultsWire,
): readonly KitchenDefaultsField[] {
  if (held === undefined) return ALL_FIELDS;
  const completed = completedDefaultsOf(held, book);
  return [...modifiedMembers(completed, sent)].map(
    (member) => KITCHEN_DEFAULTS_MEMBERS[member],
  );
}

/**
 * A save of what is already held is `200` with the revisions as they are, and writes nothing. If the head has moved since
 * it was read, the book read after it may not be the one the answer would describe, so the page reads again instead.
 */
async function answerNothingToSave(
  stores: PriceStores,
  {
    availability,
    revision,
  }: { availability: CatalogueAvailability; revision: string },
): Promise<NextResponse> {
  if (!(await isHeadStill(stores, availability))) {
    return availabilityChangedMeanwhile();
  }
  return succeeded(
    PRICE_DRAFT_EVENT,
    savedResponse({ revision, availabilityRevision: availability.revision }),
  );
}

/** The domain's verdict as the route's refusal, or `undefined` for defaults the book and the head offer. */
function refusalOfJudgement(
  defaults: KitchenDefaultsWire,
  context: { book: PriceBook; availability: CatalogueAvailability },
): NextResponse | undefined {
  const verdict = judgeKitchenDefaults(defaults, context);
  switch (verdict.kind) {
    case "acceptable":
      return undefined;
    case "unavailable":
      return refused(PRICE_DRAFT_EVENT, itemUnavailableResponse(verdict.item));
    case "colour-not-in-palette":
      return refused(
        PRICE_DRAFT_EVENT,
        dashboardInvalidInputResponse([
          { field: "finish", code: "FINISH_NOT_IN_PALETTE" },
        ]),
      );
  }
}

async function writeDefaults(
  stores: PriceStores,
  {
    request,
    changed,
    cookies,
  }: {
    readonly request: KitchenDefaultsSaveRequestWire;
    readonly changed: readonly KitchenDefaultsField[];
    readonly cookies: SessionCookieReader;
  },
): Promise<NextResponse> {
  const result = await stores.defaults.save({
    expectedRevision: request.expectedRevision,
    expectedAvailabilityRevision: request.expectedAvailabilityRevision,
    defaults: stampedSettingsOf(request.defaults),
    audit: {
      session: actingSessionOf(cookies),
      entry: kitchenDefaultsSavedEntry(changed),
    },
  });
  if (result.kind === "changed-meanwhile") return changedMeanwhile();
  if (result.kind === "availability-changed-meanwhile") {
    return availabilityChangedMeanwhile();
  }
  return succeeded(PRICE_DRAFT_EVENT, savedResponse(result));
}

// ---------------------------------------------------------------------------------------------------------------------
// The answers

function availabilityChangedMeanwhile(): NextResponse {
  return refused(
    PRICE_DRAFT_EVENT,
    dashboardConflictResponse("availability-changed-meanwhile"),
  );
}

/** `409`: a value names an item that is switched off or that the active book does not state. Nothing was written. */
function itemUnavailableResponse(item: ItemRef): NextResponse {
  const body: DashboardItemUnavailableWire = {
    status: "item-unavailable",
    item,
  };
  return NextResponse.json(body, {
    status: 409,
    headers: ACCOUNT_RESPONSE_HEADERS,
  });
}

/** `200`: the defaults revision, and the availability head, as they are after the save. */
function savedResponse({
  revision,
  availabilityRevision,
}: KitchenDefaultsSavedWire): NextResponse {
  return NextResponse.json(
    { revision, availabilityRevision },
    { status: 200, headers: ACCOUNT_RESPONSE_HEADERS },
  );
}
