import type {
  DashboardAuditEntry,
  DraftChangeTarget,
} from "@lemnaria/configurator-domain";

import type { DashboardAuditDetailCopy } from "@/i18n/staff-audit-dashboard-copy";
import { signedWholeNumber } from "@/price-dashboard/publish-format";

import { isolated } from "./bidi-isolate";

// What the audit log says of a dashboard action beyond its name: the kind of price, the item it names, the version that went
// live, how many changes it held. Each part is a code or a count told in the catalogue's words, or a server-minted id inside a
// first-strong isolate; nothing a person typed reaches this function (the domain gives a detail no field to hold it in).

/** The parts of the detail, in the order the log reads them; the first stands where a kitchen's name would. */
export function dashboardDetailParts(
  entry: DashboardAuditEntry,
  copy: DashboardAuditDetailCopy,
): readonly string[] {
  switch (entry.action) {
    case "price-draft-changed":
      return [
        copy.changeKind(entry.detail.changeKind),
        ...targetParts(entry.detail, copy),
      ];
    case "price-draft-reverted":
      return [
        copy.changeKind(entry.detail.changeKind),
        ...targetParts(entry.detail, copy),
        ...(entry.detail.revertedCount > 1
          ? [copy.changes(entry.detail.revertedCount)]
          : []),
      ];
    case "price-bulk-changed":
      return [
        copy.bulkName({
          signedPercent: signedWholeNumber(entry.detail.percent),
          group: copy.bulkScope(entry.detail),
        }),
        copy.bulkSummary(entry.detail),
      ];
    case "price-published":
      return [
        copy.version(entry.detail.sequenceNumber),
        copy.changes(entry.detail.changeCount),
        copy.provisional(entry.detail.provisional),
      ];
    case "price-restored-to-draft":
      return [
        copy.fromVersion(entry.detail.fromSequenceNumber),
        copy.changes(entry.detail.changeCount),
      ];
    case "catalogue-item-active-changed":
      return [
        copy.itemKind(entry.detail.itemKind),
        isolated(entry.detail.itemId),
        copy.activation(entry.detail.active),
      ];
    case "kitchen-defaults-saved":
      return entry.detail.changedFields.map((field) =>
        copy.defaultsField(field),
      );
    case "price-catalogue-viewed":
      return [copy.section(entry.detail.section)];
    case "kitchen-seen":
      return [];
  }
}

function targetParts(
  target: DraftChangeTarget,
  copy: DashboardAuditDetailCopy,
): readonly string[] {
  return [
    ...(target.itemKind === undefined ? [] : [copy.itemKind(target.itemKind)]),
    ...(target.itemId === undefined ? [] : [isolated(target.itemId)]),
    ...(target.widthMm === undefined ? [] : [copy.width(target.widthMm)]),
  ];
}
