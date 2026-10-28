import { CHANGE_REFUSAL_CODES } from "@lemnaria/configurator-domain";
import type {
  AccessoryCreation,
  AddressOfKind,
  BookFieldAddress,
  BulkChangeScope,
  CatalogueAvailability,
  DraftChange,
  Finish,
  Handle,
  HardwareRateField,
  HardwareTierCreation,
  ItemRef,
  KitchenDefaultsField,
  PriceBook,
  PriceGroupCode,
} from "@lemnaria/configurator-domain";

// What the manufacturer price dashboard's routes answer and its screens expect, once (M10 plan §8.4 d; ADR 0178).
// It lives outside `lib/server` because the client bundle may not import a server-only module, and holds types and
// closed code lists only.
//
// Three rules hold throughout.
// - **A body carries codes, never sentences** (ADR 0095 decision 3). The words are the message files'.
// - **A refusal is a member the person can correct and a code for it, never the value refused.** An authored text is
//   a person's own words, and an id the person typed is not echoed.
// - **Refusal codes are closed lists** below. A route answers none outside them, and a screen that meets one it does
//   not know shows its generic failure.
//
// Dates are ISO 8601, UTC, milliseconds, as the staff kitchens contract has them. Money is a safe integer count of
// bani; a percentage is a whole number. Revisions are opaque strings compared only for equality.

// ---------------------------------------------------------------------------------------------------------------------
// The book as the editor reads it

/** What the editor and the customer-side surfaces hold together (A-17): the version, its book and what is switched off. */
export interface DashboardBookPayload {
  readonly versionId: string;
  readonly book: PriceBook;
  readonly availability: CatalogueAvailability;
}

/** The ordered changes awaiting publication. */
export interface DashboardDraftWire {
  readonly draftRevision: string;
  readonly changes: readonly DraftChange[];
}

/** `200` of the dashboard's state: the active version, and the draft beside it. */
export interface DashboardStateWire {
  readonly active: DashboardBookPayload & {
    /** What a publish expects as `expectedActiveSequence` (F7). */
    readonly sequenceNumber: number;
    readonly label: string;
    readonly publishedAt: string;
  };
  readonly draft: DashboardDraftWire;
}

// ---------------------------------------------------------------------------------------------------------------------
// Refusals: closed lists

/** Why a number was refused, wherever an amount or a percentage is sent. */
export const NUMBER_REFUSAL_CODES = Object.freeze([
  "MISSING_VALUE",
  "NOT_A_WHOLE_NUMBER",
  "NEGATIVE",
  "TOO_LARGE",
] as const);

/** What a version's label or note can be refused for. */
export const PUBLISH_TEXT_REFUSAL_CODES = Object.freeze([
  "TEXT_EMPTY",
  "TEXT_TOO_LONG",
  "TEXT_FORBIDDEN_CHARACTER",
] as const);
export type PublishTextRefusalCode =
  (typeof PUBLISH_TEXT_REFUSAL_CODES)[number];

/** Why authored Romanian text was refused (A-21; ADR 0106 Amendment A: a text may not state an amount or a percentage). */
export const TEXT_REFUSAL_CODES = Object.freeze([
  ...PUBLISH_TEXT_REFUSAL_CODES,
  "TEXT_STATES_AN_AMOUNT",
] as const);

/** What a draft change can be refused for: the domain's own refusals, then its text and the refusals judged elsewhere. */
export const DRAFT_CHANGE_REFUSAL_CODES = Object.freeze([
  ...CHANGE_REFUSAL_CODES,
  ...TEXT_REFUSAL_CODES,
  "PRICE_WOULD_BE_NEGATIVE",
  "LINK_TARGET_UNKNOWN",
  "LINK_TARGET_CUSTOMER_SUPPLIED",
  "ITEM_IN_USE",
  "ITEM_IS_DEFAULT",
] as const);
export type DraftChangeRefusalCode =
  (typeof DRAFT_CHANGE_REFUSAL_CODES)[number];

/** What a bulk action can be refused for. */
export const BULK_REFUSAL_CODES = Object.freeze([
  "MISSING_VALUE",
  "NOT_A_WHOLE_NUMBER",
  "PERCENT_OUT_OF_RANGE",
  "UNKNOWN_GROUP",
  "NO_CABINETS_SELECTED",
  "UNKNOWN_RULE",
  "PRICE_WOULD_BE_NEGATIVE",
] as const);
export type BulkRefusalCode = (typeof BULK_REFUSAL_CODES)[number];

/**
 * What a defaults save can be refused for as malformed input (`400`). A value naming an item that is switched off or
 * absent from the active book is not here: it is a state of the data, `409 item-unavailable` (m2).
 */
export const DEFAULTS_REFUSAL_CODES = Object.freeze([
  "MISSING_VALUE",
  "UNKNOWN_VALUE",
  "FINISH_NOT_IN_PALETTE",
] as const);
export type DefaultsRefusalCode = (typeof DEFAULTS_REFUSAL_CODES)[number];

/** The members a `400` of any dashboard write names. */
export type DashboardRequestField =
  | "expectedDraftRevision"
  | "expectedRevision"
  | "expectedActiveSequence"
  | "expectedAvailabilityRevision"
  | "change"
  | "target"
  | "address"
  | "groupId"
  | "groupCode"
  | "scope"
  | "percent"
  | "ruleIds"
  | "label"
  | "note"
  | "item"
  | "active"
  | "items"
  | "page"
  | "versionId"
  | "availabilityRevision"
  | KitchenDefaultsMember;

/** One member of a `400`, and the closed code it was refused for. Never the value. */
export interface DashboardIssue<Code extends string> {
  readonly field: DashboardRequestField;
  readonly code: Code;
}

export interface DashboardInvalidInputWire<Code extends string> {
  readonly status: "invalid-input";
  readonly issues: readonly DashboardIssue<Code>[];
}

/**
 * The words of a dashboard write's `409`: each is a state of the data, never a failure to answer.
 * - `changed-meanwhile`: the draft, the defaults or the availability moved since the page read them; nothing was
 *   written, and the page reads again.
 * - `no-active-version`: no version was ever published, so there is no book to edit or price (A-10).
 * - `nothing-to-publish`: the draft is empty.
 * - `nothing-differs`: a restore found no difference from the active prices.
 * - `item-not-in-active-book`: availability of a row only the draft knows (A-17).
 * - `item-is-default`: the D9 default cannot be switched off, nor deleted by a publish; the body names the item
 *   (`DashboardItemIsDefaultWire`, M5).
 * - `last-active-option`: the last active option of a group cannot be switched off (D5G).
 * - `candidate-refused`: the book the draft would produce did not pass the domain's judgement, a defect of ours.
 * - `displayed-revision-ahead`: a kitchen was marked seen at a revision greater than its current one (F9).
 * - `item-unavailable`: a defaults value names an item that is disabled or absent from the active book (A-17); the
 *   body names the item (`DashboardItemUnavailableWire`).
 * - `availability-changed-meanwhile`: the availability head moved since a defaults save or a publish read it (A-17,
 *   F1, M1).
 * - `draft-unreadable`: the stored draft is not what a draft holds, so it can be neither shown nor judged; the body
 *   names its revision (`DashboardDraftUnreadableWire`) and the one write that works is a discard-all (R2 ruling Q2).
 */
export const DASHBOARD_CONFLICTS = Object.freeze([
  "changed-meanwhile",
  "no-active-version",
  "nothing-to-publish",
  "nothing-differs",
  "item-not-in-active-book",
  "item-is-default",
  "last-active-option",
  "candidate-refused",
  "displayed-revision-ahead",
  "item-unavailable",
  "availability-changed-meanwhile",
  "draft-unreadable",
] as const);
export type DashboardConflict = (typeof DASHBOARD_CONFLICTS)[number];

export interface DashboardConflictWire {
  readonly status: DashboardConflict;
}

/** `409` of a read or a write that met a stored draft it cannot read: the revision to discard it at. */
export interface DashboardDraftUnreadableWire {
  readonly status: "draft-unreadable";
  readonly draftRevision: string;
}

/** `409` of a publish whose draft deletes the current D9 default, or of a switch-off of it (M5). */
export interface DashboardItemIsDefaultWire {
  readonly status: "item-is-default";
  readonly item: ItemRef;
}

/** `409` of a publish that found an item deleted in the draft now used by a saved kitchen: the whole publish is
 *  refused and names them (A-18, D7G). */
export interface DashboardItemInUseWire {
  readonly status: "item-in-use";
  readonly items: readonly ItemRef[];
}

// ---------------------------------------------------------------------------------------------------------------------
// The draft

/**
 * A change as a request carries it. The two creations are not here: they carry no id (the server mints it, strictly
 * shaped and unique against every built-in and keyed id; A-21, F5) and have requests of their own. Every other change
 * is the stored `DraftChange` as it is.
 */
export type DraftChangeInputWire = WithoutGroupId<
  Exclude<
    DraftChange,
    {
      readonly address: AddressOfKind<
        "hardware-tier-created" | "accessory-created"
      >;
    }
  >
>;

/** A single-change input never carries a group id, nor the `bulk` that goes with it: only the bulk route sets them (m1). */
type WithoutGroupId<Change> = Change extends unknown
  ? Omit<Change, "groupId" | "bulk">
  : never;

/** One change to the draft. `groupId` ties the changes of one bulk action. */
export interface DraftChangeRequestWire {
  readonly expectedDraftRevision: string;
  readonly change: DraftChangeInputWire;
}

/** `200` of a change, a revert, a bulk action or a restore: the draft as it is now. */
export type DraftChangedWire = DashboardDraftWire;

/** The four rates of a hardware class, in bani. A mechanism the class does not have is 0 (D4C). */
export type HardwareRatesWire = Readonly<Record<HardwareRateField, number>>;

/**
 * Creates a hardware class. The request carries its text and **all four rates**, and the server writes the creation and
 * the four `hardware` rate changes, keyed by the id it minted, in one draft write: the draft never holds a created class
 * without its rates (X0-4).
 */
export interface CreateHardwareClassRequestWire {
  readonly expectedDraftRevision: string;
  readonly value: HardwareTierCreation;
  readonly rates: HardwareRatesWire;
}

/** Creates a linked accessory (A-19). Its price and the cabinet type it follows are in `value`. */
export interface CreateAccessoryRequestWire {
  readonly expectedDraftRevision: string;
  readonly value: AccessoryCreation;
}

/** `200` of a creation: the draft, and the row the server minted an id for. */
export interface DraftChangeCreatedWire {
  readonly draft: DashboardDraftWire;
  readonly created: ItemRef;
}

export type DraftChangeInvalidWire =
  DashboardInvalidInputWire<DraftChangeRefusalCode>;

/**
 * Removes one change by its address (an index would go stale under a replace), or every change of one bulk action by
 * its server-minted group id (M2).
 */
export type DraftRevertTargetWire =
  | { readonly kind: "change"; readonly address: BookFieldAddress }
  | { readonly kind: "group"; readonly groupId: string };

export interface DraftRevertRequestWire {
  readonly expectedDraftRevision: string;
  readonly target: DraftRevertTargetWire;
}

/**
 * Resets the draft to empty, whatever it holds and without reading it, so it works on a draft that cannot be read. `200`
 * answers the draft as it is now (`DraftChangedWire`, no changes). It is the `DELETE` of the draft's own path, told from a
 * revert by `scope` where a revert has `target`.
 */
export interface DraftDiscardRequestWire {
  readonly expectedDraftRevision: string;
  readonly scope: "all";
}

/** Which cabinets a bulk percentage applies to. */
export type BulkTargetWire =
  | { readonly scope: Extract<BulkChangeScope, "all"> }
  | {
      readonly scope: Extract<BulkChangeScope, "group">;
      readonly groupCode: PriceGroupCode;
    }
  | {
      readonly scope: Extract<BulkChangeScope, "selection">;
      readonly ruleIds: readonly string[];
    };

/** A bulk change of prices by a whole percentage, negative for a reduction (A-14). One draft group. */
export interface BulkChangeRequestWire {
  readonly expectedDraftRevision: string;
  readonly target: BulkTargetWire;
  readonly percent: number;
}

/** `200` of a bulk action: the draft, and how many rules (cabinets) and amounts (prices) it touched. */
export interface BulkChangedWire {
  readonly draft: DashboardDraftWire;
  readonly ruleCount: number;
  readonly amountCount: number;
}

export type BulkChangeInvalidWire = DashboardInvalidInputWire<BulkRefusalCode>;

// ---------------------------------------------------------------------------------------------------------------------
// Publish, history, restore

/**
 * Authored text, bounded by the domain: the label and the note are the staff member's own words. **The request carries
 * no book.** The server computes the book from the stored draft at `expectedDraftRevision`, judges it and stores it
 * (F10). It carries no `provisional` either: the switch has one source, the draft change `{kind: "provisional"}`
 * (m4). The publish takes the availability head's compare-and-set (M1), so it names the head the page read.
 */
export interface PublishRequestWire {
  readonly expectedDraftRevision: string;
  readonly expectedActiveSequence: number;
  readonly expectedAvailabilityRevision: string;
  readonly label: string;
  readonly note: string;
}

/** `200` of a publish: the version that went live, and the availability head after it (M1). */
export interface PublishedWire {
  readonly versionId: string;
  readonly sequenceNumber: number;
  readonly availabilityRevision: string;
}

export type PublishInvalidWire =
  DashboardInvalidInputWire<PublishTextRefusalCode>;

/** A version as the history list shows it. */
export interface PriceVersionSummaryWire {
  readonly versionId: string;
  readonly sequenceNumber: number;
  readonly label: string;
  readonly state: "active" | "archived";
  readonly publishedAt: string;
  readonly changeCount: number;
}

export interface PriceVersionListWire {
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Newest first. */
  readonly versions: readonly PriceVersionSummaryWire[];
}

/** An archived version, read-only: its book and the changes it carried. */
export interface PriceVersionWire {
  readonly versionId: string;
  readonly sequenceNumber: number;
  readonly label: string;
  readonly note: string;
  readonly state: "active" | "archived";
  readonly publishedAt: string;
  readonly book: PriceBook;
  readonly changes: readonly DraftChange[];
}

/** Restoring adds the version's differing fields to the draft. It publishes nothing. */
export interface RestoreRequestWire {
  readonly expectedDraftRevision: string;
}

/** `200` of a restore: the draft, and how many changes the restore added. */
export interface RestoredWire {
  readonly draft: DashboardDraftWire;
  readonly addedChangeCount: number;
}

/** `404` of a version that is unknown or not a shape this store holds. */
export interface PriceVersionNotFoundWire {
  readonly status: "version-not-found";
}

// ---------------------------------------------------------------------------------------------------------------------
// Availability (immediate, outside the draft: A-17) and usage

export interface AvailabilityRequestWire {
  readonly expectedRevision: string;
  readonly item: ItemRef;
  readonly active: boolean;
}

/** `200` of an availability change: the revision it created. */
export interface AvailabilitySetWire {
  readonly revision: string;
}

/** The most items one usage question names; a dialog asks about one, a list about a page. */
export const MAX_USAGE_ITEMS = 50;

/**
 * Counts only, and exempt from per-read audit (m10), like the changed-count poll (A-12): the screen that asks is
 * audited as `price-catalogue-viewed`.
 */
export interface UsageRequestWire {
  readonly items: readonly ItemRef[];
}

export interface ItemUsageWire {
  readonly item: ItemRef;
  /** Saved designs, not deleted by their client, that use the item at any level. */
  readonly count: number;
}

export interface UsageCountsWire {
  readonly counts: readonly ItemUsageWire[];
}

// ---------------------------------------------------------------------------------------------------------------------
// New-kitchen defaults (D9)

/** The six rows of D9. The member names are the stored settings' own; `KitchenDefaultsField` is their audit code. */
export interface KitchenDefaultsWire {
  readonly materialTierId: string;
  readonly hardwareTierId: string;
  readonly cabinetDepthMm: number;
  readonly finish: Finish;
  readonly handle: Handle;
  readonly topRowHandle: Handle;
}

/** The defaults' members, each with the audit code of its row. A new row does not compile until it is listed. */
export const KITCHEN_DEFAULTS_MEMBERS: Readonly<
  Record<keyof KitchenDefaultsWire, KitchenDefaultsField>
> = Object.freeze({
  materialTierId: "material",
  hardwareTierId: "hardware",
  cabinetDepthMm: "depth",
  finish: "finish",
  handle: "handle",
  topRowHandle: "topRowHandle",
});
export type KitchenDefaultsMember = keyof KitchenDefaultsWire;

/** `200` of a read: `saved` is false while none was ever saved, and `defaults` is then the fixed fallbacks. */
export interface KitchenDefaultsStateWire {
  readonly revision: string;
  /** The availability head read with the defaults, which a save expects (A-17, F1). */
  readonly availabilityRevision: string;
  readonly saved: boolean;
  readonly defaults: KitchenDefaultsWire;
}

export interface KitchenDefaultsSaveRequestWire {
  readonly expectedRevision: string;
  readonly expectedAvailabilityRevision: string;
  readonly defaults: KitchenDefaultsWire;
}

/**
 * `200` of a save: the revision it created and the availability head after it (m3). A save applies at once to new
 * kitchens and to no saved one (A-9).
 */
export interface KitchenDefaultsSavedWire {
  readonly revision: string;
  readonly availabilityRevision: string;
}

export type KitchenDefaultsInvalidWire =
  DashboardInvalidInputWire<DefaultsRefusalCode>;

/** `409` of a defaults save that names an item switched off or absent from the active book (m2). */
export interface DashboardItemUnavailableWire {
  readonly status: "item-unavailable";
  readonly item: ItemRef;
}

// ---------------------------------------------------------------------------------------------------------------------
// The customer's price notice (C1, C4, C5)

/** The pair a notice is judged against, and an acknowledgement records (A-11). */
export interface PriceStampWire {
  readonly versionId: string;
  readonly availabilityRevision: string;
}

/** One selection the customer must replace before a price shows (C4), and what they may replace it with. */
export interface RequiredReplacementWire {
  readonly item: ItemRef;
  readonly remaining: readonly ItemRef[];
}

/**
 * What a saved kitchen's owner is told when they open it. Served only to a request authorised to edit that design (F8),
 * and never on a share-link view or a staff open. `current` is the pair to acknowledge. `pricesChanged` is the
 * one calm notice (C1, merged into C4C). `replacementsRequired` holds the rows of the forced replacement, and while it
 * is not empty the price is not shown (A-16). `removedAccessories` is the C4 information row.
 */
export interface PriceNoticeWire {
  readonly current: PriceStampWire;
  readonly pricesChanged: boolean;
  readonly replacementsRequired: readonly RequiredReplacementWire[];
  readonly removedAccessories: readonly ItemRef[];
}

/** The pair the page displayed, recorded as acknowledged (A-11). It is never "the current pair": a publish that landed
 *  in between keeps the notice. */
export type PriceNoticeAcknowledgeRequestWire = PriceStampWire;

export interface PriceNoticeAcknowledgedWire {
  readonly acknowledged: PriceStampWire;
}

/**
 * What a `400` of an acknowledgement says, checked in SQL (F8, m5): the version does not exist, or the availability
 * revision is greater than the head's. Nothing was written. Not state conflicts, so not in `DASHBOARD_CONFLICTS`.
 */
export const PRICE_NOTICE_REFUSALS = Object.freeze([
  "unknown-version",
  "revision-ahead",
] as const);
export type PriceNoticeRefusal = (typeof PRICE_NOTICE_REFUSALS)[number];

export interface PriceNoticeRefusedWire {
  readonly status: PriceNoticeRefusal;
}

export type PriceNoticeInvalidWire = DashboardInvalidInputWire<
  "MISSING_VALUE" | "UNKNOWN_VALUE"
>;
