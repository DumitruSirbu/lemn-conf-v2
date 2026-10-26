import {
  holdsUnknownKey,
  isPlainObject,
  ownValueOf,
  type PlainObject,
} from "../contact/input-checks.js";
import {
  BOOK_FIELD_ADDRESS_KINDS,
  ADDRESS_FIELDS,
  ITEM_KINDS,
  type AddressField,
  type BookFieldAddressKind,
} from "../price-dashboard/book-field-address.js";
import type { ItemKind } from "../pricing/catalogue-availability.js";

import { isRequestStatus, type RequestStatus } from "./request-status.js";
import {
  STAFF_KITCHEN_PAGE_SIZE,
  isStaffKitchenSegment,
  type StaffKitchenSegment,
} from "./staff-kitchen-query.js";

// What a staff member did, as a code and the few codes that qualify it. The closed list lives here and not in
// the database (ADR 0172 D10). A detail holds codes only, so an address, a name or a note's text has no field
// to be written into.

export const STAFF_AUDIT_ACTIONS = Object.freeze([
  "kitchen-opened",
  "note-added",
  "status-changed",
  "kitchen-unhidden",
  "kitchens-listed",
  "audit-viewed",
] as const);
export type StaffAuditAction = (typeof STAFF_AUDIT_ACTIONS)[number];

/** `from` is `new` when no status had been saved. */
export interface StatusChangedDetail {
  readonly from: RequestStatus;
  readonly to: RequestStatus;
}

/** What one served page of the kitchens list was, as codes and counts: never the search text or a client. */
export interface KitchensListedDetail {
  readonly segment: StaffKitchenSegment;
  readonly status: RequestStatus | null;
  /** From 1. */
  readonly page: number;
  /** Rows on the page, 0 to the page size. */
  readonly rowCount: number;
  readonly hasSearch: boolean;
}

/** Rows the audit page shows at most. The persistence package keeps its own page size, which must equal this. */
export const STAFF_AUDIT_PAGE_SIZE = 25;

/** What one served page of the audit log was: which filters were set, never their values. */
export interface AuditViewedDetail {
  /** From 1. */
  readonly page: number;
  /** Rows on the page, 0 to the page size. */
  readonly rowCount: number;
  readonly hasActorFilter: boolean;
  readonly hasActionFilter: boolean;
  readonly hasDateFilter: boolean;
}

interface StaffAuditDetailByAction {
  readonly "kitchen-opened": null;
  readonly "note-added": null;
  readonly "status-changed": StatusChangedDetail;
  readonly "kitchen-unhidden": null;
  readonly "kitchens-listed": KitchensListedDetail;
  readonly "audit-viewed": AuditViewedDetail;
}

export type StaffAuditEntry = {
  readonly [Action in StaffAuditAction]: {
    readonly action: Action;
    readonly detail: StaffAuditDetailByAction[Action];
  };
}[StaffAuditAction];

export type StaffAuditRefusalCode = "UNKNOWN_ACTION" | "INVALID_DETAIL";

interface StaffAuditRefusal {
  readonly ok: false;
  readonly code: StaffAuditRefusalCode;
}

export type StaffAuditEntryReading =
  | { readonly ok: true; readonly entry: StaffAuditEntry }
  | StaffAuditRefusal;

const STATUS_CHANGE_KEYS = Object.freeze(["from", "to"]);
const KITCHENS_LISTED_KEYS = Object.freeze([
  "segment",
  "status",
  "page",
  "rowCount",
  "hasSearch",
]);

const AUDIT_VIEWED_KEYS = Object.freeze([
  "page",
  "rowCount",
  "hasActorFilter",
  "hasActionFilter",
  "hasDateFilter",
]);

/** Whether the row names a design. A new action must be classified here before it compiles. */
export const STAFF_AUDIT_ACTION_NAMES_DESIGN: Readonly<
  Record<StaffAuditAction, boolean>
> = Object.freeze({
  "kitchen-opened": true,
  "note-added": true,
  "status-changed": true,
  "kitchen-unhidden": true,
  "kitchens-listed": false,
  "audit-viewed": false,
});

export function auditActionNamesDesign(action: StaffAuditAction): boolean {
  return STAFF_AUDIT_ACTION_NAMES_DESIGN[action];
}

/** A row names a design exactly when its action does: the two list views name none, every other action names one. */
export function auditActionAcceptsDesignId(
  action: StaffAuditAction,
  designId: string | null,
): boolean {
  return auditActionNamesDesign(action) === (designId !== null);
}

export function isStaffAuditAction(value: unknown): value is StaffAuditAction {
  return STAFF_AUDIT_ACTIONS.some((action) => action === value);
}

/** An action and its detail as one entry: what a store may write, and what it may read back from a row. */
export function readStaffAuditEntry(
  action: unknown,
  detail: unknown,
): StaffAuditEntryReading {
  if (!isStaffAuditAction(action)) return refused("UNKNOWN_ACTION");
  switch (action) {
    case "status-changed":
      return readStatusChangedEntry(detail);
    case "kitchens-listed":
      return readKitchensListedEntry(detail);
    case "audit-viewed":
      return readAuditViewedEntry(detail);
    default:
      return isAbsent(detail)
        ? { ok: true, entry: { action, detail: null } }
        : refused("INVALID_DETAIL");
  }
}

function readStatusChangedEntry(detail: unknown): StaffAuditEntryReading {
  if (!isPlainObject(detail) || holdsUnknownKey(detail, STATUS_CHANGE_KEYS)) {
    return refused("INVALID_DETAIL");
  }
  const from = ownValueOf(detail, "from");
  const to = ownValueOf(detail, "to");
  if (!isRequestStatus(from) || !isRequestStatus(to)) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: { action: "status-changed", detail: Object.freeze({ from, to }) },
  };
}

function readKitchensListedEntry(detail: unknown): StaffAuditEntryReading {
  if (!isPlainObject(detail) || holdsUnknownKey(detail, KITCHENS_LISTED_KEYS)) {
    return refused("INVALID_DETAIL");
  }
  const segment = ownValueOf(detail, "segment");
  const status = ownValueOf(detail, "status");
  const page = ownValueOf(detail, "page");
  const rowCount = ownValueOf(detail, "rowCount");
  const hasSearch = ownValueOf(detail, "hasSearch");
  if (
    !isStaffKitchenSegment(segment) ||
    !(status === null || isRequestStatus(status)) ||
    !isPositiveSafeInteger(page) ||
    !isRowCountUpTo(rowCount, STAFF_KITCHEN_PAGE_SIZE) ||
    typeof hasSearch !== "boolean"
  ) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: {
      action: "kitchens-listed",
      detail: Object.freeze({ segment, status, page, rowCount, hasSearch }),
    },
  };
}

function readAuditViewedEntry(detail: unknown): StaffAuditEntryReading {
  if (!isPlainObject(detail) || holdsUnknownKey(detail, AUDIT_VIEWED_KEYS)) {
    return refused("INVALID_DETAIL");
  }
  const page = ownValueOf(detail, "page");
  const rowCount = ownValueOf(detail, "rowCount");
  const hasActorFilter = ownValueOf(detail, "hasActorFilter");
  const hasActionFilter = ownValueOf(detail, "hasActionFilter");
  const hasDateFilter = ownValueOf(detail, "hasDateFilter");
  if (
    !isPositiveSafeInteger(page) ||
    !isRowCountUpTo(rowCount, STAFF_AUDIT_PAGE_SIZE) ||
    typeof hasActorFilter !== "boolean" ||
    typeof hasActionFilter !== "boolean" ||
    typeof hasDateFilter !== "boolean"
  ) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: {
      action: "audit-viewed",
      detail: Object.freeze({
        page,
        rowCount,
        hasActorFilter,
        hasActionFilter,
        hasDateFilter,
      }),
    },
  };
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isRowCountUpTo(value: unknown, pageSize: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= pageSize
  );
}

function isAbsent(detail: unknown): boolean {
  return detail === null || detail === undefined;
}

function refused(code: StaffAuditRefusalCode): StaffAuditRefusal {
  return { ok: false, code };
}

// ---------------------------------------------------------------------------------------------------------------------
// The manufacturer price dashboard's actions (M10, plan §8.4 e, A-22; ADR 0173 P-L3-3: every staff read and write is
// audited).
//
// A list of their own, and deliberately not members of `STAFF_AUDIT_ACTIONS`: that list is what the audit page offers
// as a filter and labels, what the persistence stores accept and what the wire reading recognises, and growing it
// changes all four at once. Folding these nine in is a separate, named step; until then a store cannot yet write them,
// and the audit page does not yet show them. Their detail shapes are fixed here so that step changes no shape.
//
// Every action has a closed detail key list (F4): kinds and codes from closed lists, server-minted ids and counts.
// Never created-row text, a version's label or note, search text or any customer value: they have no field to be
// written into, and a key outside the list refuses the whole detail.

export const DASHBOARD_AUDIT_ACTIONS = Object.freeze([
  "price-draft-changed",
  "price-draft-reverted",
  "price-bulk-changed",
  "price-published",
  "price-restored-to-draft",
  "catalogue-item-activation-changed",
  "kitchen-defaults-saved",
  "kitchen-seen",
  "price-catalogue-viewed",
] as const);
export type DashboardAuditAction = (typeof DASHBOARD_AUDIT_ACTIONS)[number];

/** Which cabinets a bulk percentage was applied to (D2D). */
export const BULK_CHANGE_SCOPES = Object.freeze([
  "all",
  "group",
  "selection",
] as const);
export type BulkChangeScope = (typeof BULK_CHANGE_SCOPES)[number];

/** The six rows of the new-kitchen defaults (D9). */
export const KITCHEN_DEFAULTS_FIELDS = Object.freeze([
  "material",
  "hardware",
  "depth",
  "finish",
  "handle",
  "topRowHandle",
] as const);
export type KitchenDefaultsField = (typeof KITCHEN_DEFAULTS_FIELDS)[number];

/** The four groups D2 lists cabinets in, derived in M2 from the catalogue band and structural-ness (X0-5). */
export const PRICE_GROUP_CODES = Object.freeze([
  "base",
  "wall",
  "tall",
  "corner",
] as const);
export type PriceGroupCode = (typeof PRICE_GROUP_CODES)[number];

/** What a staff member opened in the dashboard. */
export const PRICE_CATALOGUE_SECTIONS = Object.freeze([
  "catalogue",
  "hardware",
  "materials",
  "accessories",
  "defaults",
  "publish",
  "history",
  "version",
] as const);
export type PriceCatalogueSection = (typeof PRICE_CATALOGUE_SECTIONS)[number];

/** The fields a draft change can name: every `field` of a §8.4(b) address, by its own word. */
export const DRAFT_CHANGE_FIELDS = ADDRESS_FIELDS;
export type DraftChangeField = AddressField;

/** A change to the draft, by the kind of field it names and, where it names one, the item and field. No value. */
export interface PriceDraftChangedDetail {
  readonly changeKind: BookFieldAddressKind;
  readonly itemKind?: ItemKind;
  readonly itemId?: string;
  readonly field?: DraftChangeField;
}

/** One change removed from the draft (the row's arrow). */
export interface PriceDraftRevertedDetail {
  readonly changeKind: BookFieldAddressKind;
  readonly itemKind?: ItemKind;
  readonly itemId?: string;
}

/** One bulk action. `percent` is a whole number, negative for a reduction; `groupCode` only when the scope is a group. */
export interface PriceBulkChangedDetail {
  readonly scope: BulkChangeScope;
  readonly groupCode?: PriceGroupCode;
  readonly percent: number;
  readonly ruleCount: number;
  readonly amountCount: number;
}

/** The version that went live. Its label and note are text and are not here. */
export interface PricePublishedDetail {
  readonly sequenceNumber: number;
  readonly changeCount: number;
  readonly provisional: boolean;
}

/** The archived version whose differences were added to the draft, and how many were. */
export interface PriceRestoredToDraftDetail {
  readonly fromSequenceNumber: number;
  readonly changeCount: number;
}

/** An item switched on or off, immediately and outside the draft (A-17), and the availability revision it created. */
export interface CatalogueItemActivationChangedDetail {
  readonly itemKind: ItemKind;
  readonly itemId: string;
  readonly active: boolean;
  readonly availabilityRevision: string;
}

/** Which defaults the save changed, as the rows' codes. Never the values. */
export interface KitchenDefaultsSavedDetail {
  readonly changedFields: readonly KitchenDefaultsField[];
}

/** The design is the row's own column, so the detail names nothing. */
export type KitchenSeenDetail = Readonly<Record<string, never>>;

export interface PriceCatalogueViewedDetail {
  readonly section: PriceCatalogueSection;
}

interface DashboardAuditDetailByAction {
  readonly "price-draft-changed": PriceDraftChangedDetail;
  readonly "price-draft-reverted": PriceDraftRevertedDetail;
  readonly "price-bulk-changed": PriceBulkChangedDetail;
  readonly "price-published": PricePublishedDetail;
  readonly "price-restored-to-draft": PriceRestoredToDraftDetail;
  readonly "catalogue-item-activation-changed": CatalogueItemActivationChangedDetail;
  readonly "kitchen-defaults-saved": KitchenDefaultsSavedDetail;
  readonly "kitchen-seen": KitchenSeenDetail;
  readonly "price-catalogue-viewed": PriceCatalogueViewedDetail;
}

export type DashboardAuditEntry = {
  readonly [Action in DashboardAuditAction]: {
    readonly action: Action;
    readonly detail: DashboardAuditDetailByAction[Action];
  };
}[DashboardAuditAction];

export type DashboardAuditEntryReading =
  | { readonly ok: true; readonly entry: DashboardAuditEntry }
  | StaffAuditRefusal;

/** Whether the row names a design: only the seen marker does. A new action must be classified before it compiles. */
export const DASHBOARD_AUDIT_ACTION_NAMES_DESIGN: Readonly<
  Record<DashboardAuditAction, boolean>
> = Object.freeze({
  "price-draft-changed": false,
  "price-draft-reverted": false,
  "price-bulk-changed": false,
  "price-published": false,
  "price-restored-to-draft": false,
  "catalogue-item-activation-changed": false,
  "kitchen-defaults-saved": false,
  "kitchen-seen": true,
  "price-catalogue-viewed": false,
});

/** An id as an audit detail may hold one: short, no space, no free text. */
const AUDIT_DETAIL_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/** A revision as the availability head holds it: a digit run from 0, no leading zero, as wide as a `bigint`. */
const AVAILABILITY_REVISION_SHAPE = /^(0|[1-9][0-9]{0,18})$/;

/** Every key an action's detail may hold; a detail holding another is refused whole. */
const DASHBOARD_DETAIL_KEYS: Readonly<
  Record<DashboardAuditAction, readonly string[]>
> = Object.freeze({
  "price-draft-changed": ["changeKind", "itemKind", "itemId", "field"],
  "price-draft-reverted": ["changeKind", "itemKind", "itemId"],
  "price-bulk-changed": [
    "scope",
    "groupCode",
    "percent",
    "ruleCount",
    "amountCount",
  ],
  "price-published": ["sequenceNumber", "changeCount", "provisional"],
  "price-restored-to-draft": ["fromSequenceNumber", "changeCount"],
  "catalogue-item-activation-changed": [
    "itemKind",
    "itemId",
    "active",
    "availabilityRevision",
  ],
  "kitchen-defaults-saved": ["changedFields"],
  "kitchen-seen": [],
  "price-catalogue-viewed": ["section"],
});

export function isDashboardAuditAction(
  value: unknown,
): value is DashboardAuditAction {
  return DASHBOARD_AUDIT_ACTIONS.some((action) => action === value);
}

export function dashboardAuditActionNamesDesign(
  action: DashboardAuditAction,
): boolean {
  return DASHBOARD_AUDIT_ACTION_NAMES_DESIGN[action];
}

/** An action and its detail as one entry. A key outside the action's list refuses the whole detail. */
export function readDashboardAuditEntry(
  action: unknown,
  detail: unknown,
): DashboardAuditEntryReading {
  if (!isDashboardAuditAction(action)) return refused("UNKNOWN_ACTION");
  if (!isPlainObject(detail)) return refused("INVALID_DETAIL");
  if (holdsUnknownKey(detail, DASHBOARD_DETAIL_KEYS[action])) {
    return refused("INVALID_DETAIL");
  }
  return readDashboardDetail(action, detail);
}

function readDashboardDetail(
  action: DashboardAuditAction,
  detail: PlainObject,
): DashboardAuditEntryReading {
  switch (action) {
    case "price-draft-changed":
      return readDraftChanged(detail);
    case "price-draft-reverted":
      return readDraftReverted(detail);
    case "price-bulk-changed":
      return readBulkChanged(detail);
    case "price-published":
      return readPublished(detail);
    case "price-restored-to-draft":
      return readRestoredToDraft(detail);
    case "catalogue-item-activation-changed":
      return readActivationChanged(detail);
    case "kitchen-defaults-saved":
      return readDefaultsSaved(detail);
    case "kitchen-seen":
      return { ok: true, entry: { action, detail: Object.freeze({}) } };
    case "price-catalogue-viewed":
      return readCatalogueViewed(detail);
  }
}

function readDraftChanged(detail: PlainObject): DashboardAuditEntryReading {
  const changeKind = ownValueOf(detail, "changeKind");
  const itemKind = ownValueOf(detail, "itemKind");
  const itemId = ownValueOf(detail, "itemId");
  const field = ownValueOf(detail, "field");
  if (
    !isOneOf(BOOK_FIELD_ADDRESS_KINDS, changeKind) ||
    !isAbsentOr(itemKind, (kind) => isOneOf(ITEM_KINDS, kind)) ||
    !isAbsentOr(itemId, isAuditDetailId) ||
    !isAbsentOr(field, (word) => isOneOf(DRAFT_CHANGE_FIELDS, word))
  ) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: {
      action: "price-draft-changed",
      detail: Object.freeze({
        changeKind,
        ...presentOnly({ itemKind, itemId, field }),
      }),
    },
  };
}

function readDraftReverted(detail: PlainObject): DashboardAuditEntryReading {
  const changeKind = ownValueOf(detail, "changeKind");
  const itemKind = ownValueOf(detail, "itemKind");
  const itemId = ownValueOf(detail, "itemId");
  if (
    !isOneOf(BOOK_FIELD_ADDRESS_KINDS, changeKind) ||
    !isAbsentOr(itemKind, (kind) => isOneOf(ITEM_KINDS, kind)) ||
    !isAbsentOr(itemId, isAuditDetailId)
  ) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: {
      action: "price-draft-reverted",
      detail: Object.freeze({
        changeKind,
        ...presentOnly({ itemKind, itemId }),
      }),
    },
  };
}

function readBulkChanged(detail: PlainObject): DashboardAuditEntryReading {
  const scope = ownValueOf(detail, "scope");
  const groupCode = ownValueOf(detail, "groupCode");
  const percent = ownValueOf(detail, "percent");
  const ruleCount = ownValueOf(detail, "ruleCount");
  const amountCount = ownValueOf(detail, "amountCount");
  if (
    !isOneOf(BULK_CHANGE_SCOPES, scope) ||
    !isAbsentOr(groupCode, (code) => isOneOf(PRICE_GROUP_CODES, code)) ||
    (scope === "group") !== (groupCode !== undefined) ||
    typeof percent !== "number" ||
    !Number.isSafeInteger(percent) ||
    !isCount(ruleCount) ||
    !isCount(amountCount)
  ) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: {
      action: "price-bulk-changed",
      detail: Object.freeze({
        scope,
        ...presentOnly({ groupCode }),
        percent,
        ruleCount,
        amountCount,
      }),
    },
  };
}

function readPublished(detail: PlainObject): DashboardAuditEntryReading {
  const sequenceNumber = ownValueOf(detail, "sequenceNumber");
  const changeCount = ownValueOf(detail, "changeCount");
  const provisional = ownValueOf(detail, "provisional");
  if (
    !isPositiveSafeInteger(sequenceNumber) ||
    !isCount(changeCount) ||
    typeof provisional !== "boolean"
  ) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: {
      action: "price-published",
      detail: Object.freeze({ sequenceNumber, changeCount, provisional }),
    },
  };
}

function readRestoredToDraft(detail: PlainObject): DashboardAuditEntryReading {
  const fromSequenceNumber = ownValueOf(detail, "fromSequenceNumber");
  const changeCount = ownValueOf(detail, "changeCount");
  if (!isPositiveSafeInteger(fromSequenceNumber) || !isCount(changeCount)) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: {
      action: "price-restored-to-draft",
      detail: Object.freeze({ fromSequenceNumber, changeCount }),
    },
  };
}

function readActivationChanged(
  detail: PlainObject,
): DashboardAuditEntryReading {
  const itemKind = ownValueOf(detail, "itemKind");
  const itemId = ownValueOf(detail, "itemId");
  const active = ownValueOf(detail, "active");
  const availabilityRevision = ownValueOf(detail, "availabilityRevision");
  if (
    !isOneOf(ITEM_KINDS, itemKind) ||
    !isAuditDetailId(itemId) ||
    typeof active !== "boolean" ||
    typeof availabilityRevision !== "string" ||
    !AVAILABILITY_REVISION_SHAPE.test(availabilityRevision)
  ) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: {
      action: "catalogue-item-activation-changed",
      detail: Object.freeze({
        itemKind,
        itemId,
        active,
        availabilityRevision,
      }),
    },
  };
}

function readDefaultsSaved(detail: PlainObject): DashboardAuditEntryReading {
  const changedFields = ownValueOf(detail, "changedFields");
  if (!isDistinctListedFields(changedFields)) return refused("INVALID_DETAIL");
  return {
    ok: true,
    entry: {
      action: "kitchen-defaults-saved",
      detail: Object.freeze({
        changedFields: Object.freeze([...changedFields]),
      }),
    },
  };
}

function readCatalogueViewed(detail: PlainObject): DashboardAuditEntryReading {
  const section = ownValueOf(detail, "section");
  if (!isOneOf(PRICE_CATALOGUE_SECTIONS, section)) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: {
      action: "price-catalogue-viewed",
      detail: Object.freeze({ section }),
    },
  };
}

/** At least one row changed, and no row twice. */
function isDistinctListedFields(
  value: unknown,
): value is readonly KitchenDefaultsField[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.every((field) => isOneOf(KITCHEN_DEFAULTS_FIELDS, field)) &&
    new Set<unknown>(value).size === value.length
  );
}

/** The members of an object that were given, so an optional key left out stays out of the stored detail. */
function presentOnly(
  members: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(members).filter(([, value]) => value !== undefined),
  );
}

function isAbsentOr(
  value: unknown,
  isValid: (present: unknown) => boolean,
): boolean {
  return value === undefined || isValid(value);
}

function isOneOf<Member extends string>(
  list: readonly Member[],
  value: unknown,
): value is Member {
  return list.some((member) => member === value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isAuditDetailId(value: unknown): value is string {
  return typeof value === "string" && AUDIT_DETAIL_ID_SHAPE.test(value);
}
