import {
  BULK_GROUP_CHANGE_KIND,
  DISCARD_ALL_CHANGE_KIND,
  type AppliedAddress,
  type BulkChangeScope,
  type DashboardAuditEntry,
  type DraftChangeTarget,
  type PriceCatalogueSection,
  type PriceGroupCode,
} from "@lemnaria/configurator-domain";
import type { PricePublishedAuditInput } from "@lemnaria/persistence";

// The audit entries of the dashboard's reads and draft writes (M10 plan §8.4 e). An entry names kinds, ids, fields and
// counts from the book's closed lists, and never a value: the amount a change sets is not in any detail.

export function catalogueViewedEntry(
  section: PriceCatalogueSection = "catalogue",
): DashboardAuditEntry {
  return { action: "price-catalogue-viewed", detail: { section } };
}

export function draftChangedEntry(
  address: AppliedAddress,
): DashboardAuditEntry {
  return {
    action: "price-draft-changed",
    detail: { changeKind: address.kind, ...targetOf(address) },
  };
}

export function draftRevertedEntry(
  address: AppliedAddress,
): DashboardAuditEntry {
  return {
    action: "price-draft-reverted",
    detail: {
      changeKind: address.kind,
      ...targetOf(address),
      revertedCount: 1,
    },
  };
}

export function groupRevertedEntry(revertedCount: number): DashboardAuditEntry {
  return {
    action: "price-draft-reverted",
    detail: { changeKind: BULK_GROUP_CHANGE_KIND, revertedCount },
  };
}

/** The draft was reset to empty: `revertedCount` is the entries it held, or 0 when they could not be read. */
export function draftDiscardedEntry(
  revertedCount: number,
): DashboardAuditEntry {
  return {
    action: "price-draft-reverted",
    detail: { changeKind: DISCARD_ALL_CHANGE_KIND, revertedCount },
  };
}

/** A publish, without the sequence number and change count only the store knows. Never the label or the note. */
export function publishedEntry(
  isProvisional: boolean,
): PricePublishedAuditInput {
  return {
    action: "price-published",
    detail: { provisional: isProvisional },
  };
}

/** The archived version whose prices were put in the draft, and how many changes that added. */
export function restoredToDraftEntry(restored: {
  readonly fromSequenceNumber: number;
  readonly addedChangeCount: number;
}): DashboardAuditEntry {
  return {
    action: "price-restored-to-draft",
    detail: {
      fromSequenceNumber: restored.fromSequenceNumber,
      changeCount: restored.addedChangeCount,
    },
  };
}

export interface BulkAudited {
  readonly scope: BulkChangeScope;
  readonly groupCode?: PriceGroupCode;
  readonly percent: number;
  readonly ruleCount: number;
  readonly amountCount: number;
}

export function bulkChangedEntry(bulk: BulkAudited): DashboardAuditEntry {
  const { scope, groupCode, percent, ruleCount, amountCount } = bulk;
  return {
    action: "price-bulk-changed",
    detail: {
      scope,
      ...(groupCode === undefined ? {} : { groupCode }),
      percent,
      ruleCount,
      amountCount,
    },
  };
}

/** The row and field an address names, by id and code. The depth rule and the provisional switch name no item. */
function targetOf(address: AppliedAddress): DraftChangeTarget {
  switch (address.kind) {
    case "cabinet":
      return {
        itemKind: "cabinet",
        itemId: address.ruleId,
        field: address.field,
      };
    case "cabinet-size":
      return {
        itemKind: "cabinet",
        itemId: address.ruleId,
        widthMm: address.widthMm,
      };
    case "hardware":
      return {
        itemKind: "hardware",
        itemId: address.tierId,
        field: address.field,
      };
    case "material":
      return {
        itemKind: "material",
        itemId: address.tierId,
        field: address.field,
      };
    case "accessory":
      return {
        itemKind: "accessory",
        itemId: address.accessoryId,
        field: address.field,
      };
    case "depth-rule":
    case "provisional":
      return {};
  }
}
