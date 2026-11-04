import type {
  BulkChangeScope,
  ChangeItemKind,
  KitchenDefaultsField,
  PriceCatalogueSection,
  PriceDraftChangedDetail,
  PriceDraftRevertedDetail,
  PriceGroupCode,
} from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "./content";

// The words the audit log tells the nine dashboard actions' details in: which kind of price changed, which item was
// switched, which version went live and how many changes it held. Each switch is exhaustive over a closed list of the domain
// and written with literal keys, so a code with no words is a compile error and not a hole in the log (ADR 0095 decision 1).

function assertNever(value: never): never {
  throw new Error(`Unhandled audit detail code: ${JSON.stringify(value)}`);
}

/** Every kind of change an audit detail can name, as the domain's two details declare them: a new one has no words until written. */
export type ChangeKindCode =
  | PriceDraftChangedDetail["changeKind"]
  | PriceDraftRevertedDetail["changeKind"];

export function resolveDashboardAuditDetailCopy(translate: ContentTranslator) {
  return {
    changeKind: (kind: ChangeKindCode): string =>
      changeKindWords(translate, kind),
    itemKind: (kind: ChangeItemKind): string => itemKindWords(translate, kind),
    defaultsField: (field: KitchenDefaultsField): string =>
      defaultsFieldWords(translate, field),
    section: (section: PriceCatalogueSection): string =>
      sectionWords(translate, section),
    bulkScope: (detail: {
      scope: BulkChangeScope;
      groupCode?: PriceGroupCode;
      ruleCount: number;
    }): string => {
      if (detail.groupCode !== undefined) {
        return groupWords(translate, detail.groupCode);
      }
      return detail.scope === "all"
        ? translate("priceDashboard.publish.bulkScopeAll")
        : translate("priceDashboard.cabinets.groupCount", {
            count: detail.ruleCount,
          });
    },
    bulkName: (words: { signedPercent: string; group: string }): string =>
      translate("priceDashboard.publish.bulkRowName", words),
    bulkSummary: (counts: { ruleCount: number; amountCount: number }): string =>
      translate("priceDashboard.publish.bulkRowSummary", {
        cabinetCount: counts.ruleCount,
        priceCount: counts.amountCount,
      }),
    version: (sequenceNumber: number): string =>
      translate("staffAuditDetail.detailVersion", { sequenceNumber }),
    fromVersion: (sequenceNumber: number): string =>
      translate("staffAuditDetail.detailFromVersion", { sequenceNumber }),
    changes: (count: number): string =>
      translate("staffAuditDetail.detailChanges", { count }),
    provisional: (isOn: boolean): string =>
      isOn
        ? translate("staffAuditDetail.detailProvisionalOn")
        : translate("staffAuditDetail.detailProvisionalOff"),
    width: (widthMm: number): string =>
      translate("staffAuditDetail.detailWidth", { widthMm }),
    activation: (isActive: boolean): string =>
      isActive
        ? translate("priceDashboard.chips.active")
        : translate("priceDashboard.chips.inactive"),
  };
}

export type DashboardAuditDetailCopy = ReturnType<
  typeof resolveDashboardAuditDetailCopy
>;

function changeKindWords(
  translate: ContentTranslator,
  kind: ChangeKindCode,
): string {
  switch (kind) {
    case "cabinet":
      return translate("staffAuditDetail.changeKinds.cabinet");
    case "cabinet-size":
      return translate("staffAuditDetail.changeKinds.cabinetSize");
    case "hardware":
      return translate("staffAuditDetail.changeKinds.hardware");
    case "material":
      return translate("staffAuditDetail.changeKinds.material");
    case "depth-rule":
      return translate("staffAuditDetail.changeKinds.depthRule");
    case "accessory":
      return translate("staffAuditDetail.changeKinds.accessory");
    case "provisional":
      return translate("staffAuditDetail.changeKinds.provisional");
    case "hardware-tier-created":
      return translate("staffAuditDetail.changeKinds.hardwareTierCreated");
    case "accessory-created":
      return translate("staffAuditDetail.changeKinds.accessoryCreated");
    case "created-row-text":
      return translate("staffAuditDetail.changeKinds.createdRowText");
    case "item-deleted":
      return translate("staffAuditDetail.changeKinds.itemDeleted");
    case "bulk-group":
      return translate("staffAuditDetail.changeKinds.bulkGroup");
    case "discard-all":
      return translate("staffAuditDetail.changeKinds.discardAll");
    default:
      return assertNever(kind);
  }
}

function itemKindWords(
  translate: ContentTranslator,
  kind: ChangeItemKind,
): string {
  switch (kind) {
    case "cabinet":
      return translate("staffAuditDetail.itemKinds.cabinet");
    case "material":
      return translate("staffAuditDetail.itemKinds.material");
    case "hardware":
      return translate("staffAuditDetail.itemKinds.hardware");
    case "finish":
      return translate("staffAuditDetail.itemKinds.finish");
    case "handle":
      return translate("staffAuditDetail.itemKinds.handle");
    case "accessory":
      return translate("staffAuditDetail.itemKinds.accessory");
    default:
      return assertNever(kind);
  }
}

function defaultsFieldWords(
  translate: ContentTranslator,
  field: KitchenDefaultsField,
): string {
  switch (field) {
    case "material":
      return translate("staffAuditDetail.defaultsFields.material");
    case "hardware":
      return translate("staffAuditDetail.defaultsFields.hardware");
    case "depth":
      return translate("staffAuditDetail.defaultsFields.depth");
    case "finish":
      return translate("staffAuditDetail.defaultsFields.finish");
    case "handle":
      return translate("staffAuditDetail.defaultsFields.handle");
    case "topRowHandle":
      return translate("staffAuditDetail.defaultsFields.topRowHandle");
    default:
      return assertNever(field);
  }
}

function sectionWords(
  translate: ContentTranslator,
  section: PriceCatalogueSection,
): string {
  switch (section) {
    case "catalogue":
      return translate("priceDashboard.nav.cabinets");
    case "hardware":
      return translate("priceDashboard.nav.hardware");
    case "materials":
      return translate("priceDashboard.nav.materials");
    case "accessories":
      return translate("priceDashboard.nav.accessories");
    case "defaults":
      return translate("priceDashboard.nav.defaults");
    case "publish":
      return translate("priceDashboard.nav.publish");
    case "history":
      return translate("priceDashboard.publish.tabHistory");
    case "version":
      return translate("staffAuditDetail.sectionVersion");
    default:
      return assertNever(section);
  }
}

function groupWords(
  translate: ContentTranslator,
  code: PriceGroupCode,
): string {
  switch (code) {
    case "base":
      return translate("priceDashboard.cabinets.groupBase");
    case "wall":
      return translate("priceDashboard.cabinets.groupWall");
    case "tall":
      return translate("priceDashboard.cabinets.groupTall");
    case "corner":
      return translate("priceDashboard.cabinets.groupCorner");
    default:
      return assertNever(code);
  }
}
