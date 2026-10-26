import {
  holdsUnknownKey,
  isPlainObject,
  ownValueOf,
  type PlainObject,
} from "../contact/input-checks.js";
import {
  ADDRESS_FIELDS,
  BOOK_FIELD_ADDRESS_KINDS,
  ITEM_KINDS,
  type AddressField,
  type BookFieldAddressKind,
} from "../price-dashboard/book-field-address.js";
import type { ItemKind } from "../pricing/catalogue-availability.js";

import {
  isPositiveSafeInteger,
  refused,
  type StaffAuditRefusal,
} from "./audit-refusal.js";

// The manufacturer price dashboard's audit actions (M10, plan §8.4 e, A-22; ADR 0173 P-L3-3: every staff read and
// write is audited).
//
// Declared here and spread into `STAFF_AUDIT_ACTIONS`; the audit page, the stores and the wire recognise them through
// `readStaffAuditEntry`, which defers to `readDashboardAuditEntry` here.
//
// Every action has a closed detail key list (F4): kinds and codes from closed lists, server-minted ids and counts.
// Never created-row text, a version's label or note, search text or any customer value: they have no field to be
// written into, and a key outside the list refuses the whole detail.

/** The action of an item switched on or off, named once for the callers that write it before its revision is known. */
export const CATALOGUE_ACTIVATION_AUDIT_ACTION =
  "catalogue-item-active-changed" as const;

export const DASHBOARD_AUDIT_ACTIONS = Object.freeze([
  "price-draft-changed",
  "price-draft-reverted",
  "price-bulk-changed",
  "price-published",
  "price-restored-to-draft",
  CATALOGUE_ACTIVATION_AUDIT_ACTION,
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

/** The four groups D2 lists cabinets in, derived in M2 from the catalogue band and structural-ness (X0-5). */
export const PRICE_GROUP_CODES = Object.freeze([
  "base",
  "wall",
  "tall",
  "corner",
] as const);
export type PriceGroupCode = (typeof PRICE_GROUP_CODES)[number];

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

/** What a draft change touched: a cabinet (by its book rule id) or any item availability can name. */
export type ChangeItemKind = "cabinet" | ItemKind;
export const CHANGE_ITEM_KINDS: readonly ChangeItemKind[] = Object.freeze([
  "cabinet",
  ...ITEM_KINDS,
]);

/** The kind a group revert reports: it removes every change of one bulk action and names no item (m7). */
export const BULK_GROUP_CHANGE_KIND = "bulk-group";

/**
 * Which row and field a change names, by id and code. `itemKind` and `itemId` are both present or both absent. `itemId`
 * is a book rule id for `cabinet` and `cabinet-size`, otherwise a tier id, accessory id, finish id or handle code.
 * `widthMm` is present only for `cabinet-size`. The kinds `depth-rule`, `provisional` and `bulk-group` name no item.
 */
export interface DraftChangeTarget {
  readonly itemKind?: ChangeItemKind;
  readonly itemId?: string;
  readonly field?: AddressField;
  readonly widthMm?: number;
}

/** A change to the draft, by the kind of address it names and its target. No value. */
export interface PriceDraftChangedDetail extends DraftChangeTarget {
  readonly changeKind: BookFieldAddressKind;
}

/**
 * Changes removed from the draft: one (`revertedCount` 1), or every change of one bulk action (`changeKind`
 * `bulk-group`, `revertedCount` n).
 */
export interface PriceDraftRevertedDetail extends DraftChangeTarget {
  readonly changeKind: BookFieldAddressKind | typeof BULK_GROUP_CHANGE_KIND;
  readonly revertedCount: number;
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

/**
 * What a caller hands the availability store: the activation without the revision it will create. The store stamps the
 * revision its statement returned, reads the entry again with `readDashboardAuditEntry`, then inserts (X0 review M4).
 */
export interface CatalogueActivationAuditInput {
  readonly action: typeof CATALOGUE_ACTIVATION_AUDIT_ACTION;
  readonly detail: Omit<
    CatalogueItemActivationChangedDetail,
    "availabilityRevision"
  >;
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

export interface DashboardAuditDetailByAction {
  readonly "price-draft-changed": PriceDraftChangedDetail;
  readonly "price-draft-reverted": PriceDraftRevertedDetail;
  readonly "price-bulk-changed": PriceBulkChangedDetail;
  readonly "price-published": PricePublishedDetail;
  readonly "price-restored-to-draft": PriceRestoredToDraftDetail;
  readonly "catalogue-item-active-changed": CatalogueItemActivationChangedDetail;
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
  "catalogue-item-active-changed": false,
  "kitchen-defaults-saved": false,
  "kitchen-seen": true,
  "price-catalogue-viewed": false,
});

/** An id as an audit detail may hold one: short, no space, no free text. */
const AUDIT_DETAIL_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/**
 * An availability revision as the head holds it: 1 to 19 digits with no leading zero, **or the single digit 0**. The
 * head is seeded at 0 (`INITIAL_REVISION`) and a stored revision is never 0 after the first change, so 0 is a revision
 * here and nowhere else in M10.
 */
const AVAILABILITY_REVISION_SHAPE = /^(0|[1-9][0-9]{0,18})$/;

/** The widest a `bigint` reaches. At 19 digits a revision is compared with it as text, never parsed into a number. */
const BIGINT_MAX_TEXT = "9223372036854775807";

/** The keys each action's detail may hold, checked by the compiler against the action's detail type. */
export type DashboardDetailKeys = {
  readonly [Action in DashboardAuditAction]: readonly (keyof DashboardAuditDetailByAction[Action])[];
};

/** Every key an action's detail may hold; a detail holding another is refused whole. */
export const DASHBOARD_DETAIL_KEYS = Object.freeze({
  "price-draft-changed": [
    "changeKind",
    "itemKind",
    "itemId",
    "field",
    "widthMm",
  ],
  "price-draft-reverted": [
    "changeKind",
    "itemKind",
    "itemId",
    "field",
    "widthMm",
    "revertedCount",
  ],
  "price-bulk-changed": [
    "scope",
    "groupCode",
    "percent",
    "ruleCount",
    "amountCount",
  ],
  "price-published": ["sequenceNumber", "changeCount", "provisional"],
  "price-restored-to-draft": ["fromSequenceNumber", "changeCount"],
  "catalogue-item-active-changed": [
    "itemKind",
    "itemId",
    "active",
    "availabilityRevision",
  ],
  "kitchen-defaults-saved": ["changedFields"],
  "kitchen-seen": [],
  "price-catalogue-viewed": ["section"],
} satisfies DashboardDetailKeys);

/** Kinds whose address names no item: a rule or a switch of the book, or a whole bulk group. */
const ITEMLESS_CHANGE_KINDS: readonly string[] = [
  "depth-rule",
  "provisional",
  BULK_GROUP_CHANGE_KIND,
];

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

/**
 * An action and its detail as one entry. A key outside the action's list refuses the whole detail. `kitchen-seen`
 * takes the empty object that §8.4(e) writes as `{ }`, and refuses an absent detail: unlike the Lot 3 actions without
 * one, its detail is a closed key list that happens to be empty.
 */
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
    case "catalogue-item-active-changed":
      return readActivationChanged(detail);
    case "kitchen-defaults-saved":
      return readDefaultsSaved(detail);
    case "kitchen-seen":
      return { ok: true, entry: { action, detail: Object.freeze({}) } };
    case "price-catalogue-viewed":
      return readCatalogueViewed(detail);
  }
}

type ChangeTargetReading =
  | { readonly ok: true; readonly target: DraftChangeTarget }
  | { readonly ok: false };

/** The target both draft-change readers share: its members are checked one by one, then as a whole (m7). */
function readChangeTarget(
  changeKind: string,
  detail: PlainObject,
): ChangeTargetReading {
  const itemKind = ownValueOf(detail, "itemKind");
  const itemId = ownValueOf(detail, "itemId");
  const field = ownValueOf(detail, "field");
  const widthMm = ownValueOf(detail, "widthMm");
  if (
    (itemKind !== undefined && !isOneOf(CHANGE_ITEM_KINDS, itemKind)) ||
    (itemId !== undefined && !isAuditDetailId(itemId)) ||
    (field !== undefined && !isOneOf(ADDRESS_FIELDS, field)) ||
    (widthMm !== undefined &&
      !(changeKind === "cabinet-size" && isPositiveSafeInteger(widthMm)))
  ) {
    return { ok: false };
  }
  const namesItem = itemKind !== undefined && itemId !== undefined;
  const namesNoItem = itemKind === undefined && itemId === undefined;
  if (!(namesItem || namesNoItem)) return { ok: false };
  if (namesItem && ITEMLESS_CHANGE_KINDS.includes(changeKind)) {
    return { ok: false };
  }
  return {
    ok: true,
    target: {
      ...(namesItem ? { itemKind, itemId } : {}),
      ...(field === undefined ? {} : { field }),
      ...(widthMm === undefined ? {} : { widthMm }),
    },
  };
}

function readDraftChanged(detail: PlainObject): DashboardAuditEntryReading {
  const changeKind = ownValueOf(detail, "changeKind");
  if (!isOneOf(BOOK_FIELD_ADDRESS_KINDS, changeKind)) {
    return refused("INVALID_DETAIL");
  }
  const reading = readChangeTarget(changeKind, detail);
  if (!reading.ok) return refused("INVALID_DETAIL");
  return {
    ok: true,
    entry: {
      action: "price-draft-changed",
      detail: Object.freeze({ changeKind, ...reading.target }),
    },
  };
}

function readDraftReverted(detail: PlainObject): DashboardAuditEntryReading {
  const changeKind = ownValueOf(detail, "changeKind");
  const revertedCount = ownValueOf(detail, "revertedCount");
  const isGroupRevert = changeKind === BULK_GROUP_CHANGE_KIND;
  if (
    !(isGroupRevert || isOneOf(BOOK_FIELD_ADDRESS_KINDS, changeKind)) ||
    !isPositiveSafeInteger(revertedCount) ||
    (!isGroupRevert && revertedCount !== 1)
  ) {
    return refused("INVALID_DETAIL");
  }
  const reading = readChangeTarget(changeKind, detail);
  if (!reading.ok) return refused("INVALID_DETAIL");
  return {
    ok: true,
    entry: {
      action: "price-draft-reverted",
      detail: Object.freeze({ changeKind, ...reading.target, revertedCount }),
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
    (groupCode !== undefined && !isOneOf(PRICE_GROUP_CODES, groupCode)) ||
    (scope === "group") !== (groupCode !== undefined) ||
    !isSignedWholeNumber(percent) ||
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
        ...(groupCode === undefined ? {} : { groupCode }),
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
    !isAvailabilityRevision(availabilityRevision)
  ) {
    return refused("INVALID_DETAIL");
  }
  return {
    ok: true,
    entry: {
      action: "catalogue-item-active-changed",
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
  const reading = readDistinctListedFields(ownValueOf(detail, "changedFields"));
  if (!reading.ok) return refused("INVALID_DETAIL");
  return {
    ok: true,
    entry: {
      action: "kitchen-defaults-saved",
      detail: Object.freeze({ changedFields: reading.fields }),
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

type ListedFieldsReading =
  | { readonly ok: true; readonly fields: readonly KitchenDefaultsField[] }
  | { readonly ok: false };

/**
 * At least one row changed, and no row twice. The list is read once into a copy of our own (a proxy or a getter cannot
 * answer differently to the check and to the copy, and a hole becomes `undefined` and is refused); the copy is what is
 * checked, frozen and returned.
 */
function readDistinctListedFields(value: unknown): ListedFieldsReading {
  if (!Array.isArray(value)) return { ok: false };
  const fields: unknown[] = Array.from(value);
  const isListed = fields.every((field): field is KitchenDefaultsField =>
    isOneOf(KITCHEN_DEFAULTS_FIELDS, field),
  );
  if (!isListed || fields.length < 1) return { ok: false };
  if (new Set(fields).size !== fields.length) return { ok: false };
  return { ok: true, fields: Object.freeze(fields as KitchenDefaultsField[]) };
}

function isAvailabilityRevision(value: unknown): value is string {
  return (
    typeof value === "string" &&
    AVAILABILITY_REVISION_SHAPE.test(value) &&
    (value.length < BIGINT_MAX_TEXT.length || value <= BIGINT_MAX_TEXT)
  );
}

function isOneOf<Member extends string>(
  list: readonly Member[],
  value: unknown,
): value is Member {
  return list.some((member) => member === value);
}

/** A safe integer that is not `-0`: a detail is stored as JSON, which writes `-0` as `0`, so it would not read back as given. */
function isSignedWholeNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0)
  );
}

function isCount(value: unknown): value is number {
  return isSignedWholeNumber(value) && value >= 0;
}

function isAuditDetailId(value: unknown): value is string {
  return typeof value === "string" && AUDIT_DETAIL_ID_SHAPE.test(value);
}
