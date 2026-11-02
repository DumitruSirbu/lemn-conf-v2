import { useTranslations } from "next-intl";
import { useMemo } from "react";

import {
  DEEP_CABINET_DEPTH_MM,
  PRICE_STEP_MM,
  TWO_DOOR_MIN_WIDTH_MM,
  type CabinetRuleField,
  type DiffValue,
  type HardwareRateField,
  type PriceGroupCode,
} from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import { useContent, useStaffKitchensCopy } from "@/i18n/use-content";

import { formatLei } from "./format-lei";
import { signOf, signedLei, signedWholeNumber } from "./publish-format";
import type {
  BulkScopeView,
  DifferenceView,
  FieldRowView,
  GroupRowView,
  RowSubject,
} from "./publish-model";

// The words a pending or archived diff row is told in: its subject, field, values, difference and bulk label.

type Translate = ContentTranslator;

const GROUP_WORD_KEYS = {
  base: "priceDashboard.cabinets.groupBase",
  wall: "priceDashboard.cabinets.groupWall",
  tall: "priceDashboard.cabinets.groupTall",
  corner: "priceDashboard.cabinets.groupCorner",
} as const satisfies Record<PriceGroupCode, string>;

/** The words a row is told in, resolved once per language. */
export function useRowWords() {
  const translate = useTranslations();
  const content = useContent();
  const { noValue } = useStaffKitchensCopy();
  return useMemo(() => {
    const currency = translate("priceDashboard.units.currency");
    const subject = (named: RowSubject): string => {
      switch (named.kind) {
        case "name":
          return named.name;
        case "book-text":
          return content.bookText(named.authored, named.key);
        case "depth-rule":
          return translate("priceDashboard.rule.deepKitchenLabel", {
            depthMm: DEEP_CABINET_DEPTH_MM,
          });
        case "provisional":
          return translate("priceDashboard.publish.provisionalLabel");
      }
    };
    const field = (row: FieldRowView): string => fieldWords(translate, row);
    const value = (shown: DiffValue, row: FieldRowView): string => {
      if (typeof shown === "object") return noValue;
      if (typeof shown === "boolean") {
        return shown
          ? translate("priceDashboard.publish.provisionalOn")
          : translate("priceDashboard.publish.provisionalOff");
      }
      return row.unit === "percent"
        ? translate("priceDashboard.common.percentPlus", {
            percent: String(shown),
          })
        : formatLei(shown, currency);
    };
    const difference = (shown: DifferenceView): string => {
      switch (shown.kind) {
        case "none":
          return "";
        case "points":
          return translate("priceDashboard.diff.points", {
            sign: signOf(shown.delta),
            count: Math.abs(shown.delta),
          });
        case "amount": {
          const signedAmount = signedLei(shown.deltaMinor, currency);
          if (shown.isUnderOnePercent) {
            return translate("priceDashboard.diff.amountUnderOne", {
              signedAmount,
            });
          }
          return shown.percent === undefined
            ? signedAmount
            : translate("priceDashboard.diff.amountPercent", {
                signedAmount,
                signedPercent: signedWholeNumber(shown.percent),
              });
        }
      }
    };
    const bulkPercent = (percent: number): string =>
      translate("priceDashboard.common.percent", {
        percent: signedWholeNumber(percent),
      });
    const bulkName = (row: GroupRowView): string =>
      row.bulk === undefined
        ? translate("priceDashboard.publish.changeCount", {
            count: row.amountCount,
          })
        : translate("priceDashboard.publish.bulkRowName", {
            signedPercent: signedWholeNumber(row.bulk.percent),
            group: scopeWords(translate, row.bulk.scope),
          });
    return {
      subject,
      field,
      value,
      difference,
      bulkPercent,
      bulkName,
      noValue,
    };
  }, [translate, content, noValue]);
}

function scopeWords(translate: Translate, scope: BulkScopeView): string {
  switch (scope.kind) {
    case "group":
      return translate(GROUP_WORD_KEYS[scope.code]);
    case "all":
      return translate("priceDashboard.publish.bulkScopeAll");
    case "selection":
      return translate("priceDashboard.cabinets.groupCount", {
        count: scope.count,
      });
  }
}

/** The name of the field a row changes, in the cabinet detail's and the hardware list's own words. */
function fieldWords(translate: Translate, row: FieldRowView): string {
  const { address } = row;
  switch (address.kind) {
    case "cabinet":
      return cabinetFieldWords(translate, row, address.field);
    case "cabinet-size":
      return translate("priceDashboard.cabinets.editPriceLabel", {
        widthMm: address.widthMm,
      });
    case "hardware":
      return hardwareFieldWords(translate, address.field);
    case "material":
      return translate("priceDashboard.materials.columnSurcharge");
    case "depth-rule":
      return typeof row.before === "object"
        ? translate("priceDashboard.rule.isNew")
        : translate("priceDashboard.rule.scope");
    case "accessory":
      return translate("priceDashboard.accessories.pricePerPiece");
    case "provisional":
      return "";
  }
}

function cabinetFieldWords(
  translate: Translate,
  row: FieldRowView,
  field: CabinetRuleField,
): string {
  switch (field) {
    case "anchorMinor":
      return row.anchorWidthMm === undefined
        ? translate("priceDashboard.cabinets.columnPrice")
        : translate("priceDashboard.cabinet.fieldAnchor", {
            widthMm: row.anchorWidthMm,
          });
    case "perStepWiderMinor":
      return translate("priceDashboard.cabinet.fieldPlus", {
        stepMm: PRICE_STEP_MM,
      });
    case "perStepNarrowerMinor":
      return translate("priceDashboard.cabinet.fieldMinus", {
        stepMm: PRICE_STEP_MM,
      });
    case "perExtraDoorLeafMinor":
      return translate("priceDashboard.cabinet.fieldDoor", {
        atMm: TWO_DOOR_MIN_WIDTH_MM,
      });
    case "perHeightStepMinor":
      return translate("priceDashboard.cabinet.fieldHeightStep", {
        stepMm: PRICE_STEP_MM,
      });
  }
}

function hardwareFieldWords(
  translate: Translate,
  field: HardwareRateField,
): string {
  switch (field) {
    case "perHingeMinor":
      return translate("priceDashboard.hardware.priceHinge");
    case "perDrawerMinor":
      return translate("priceDashboard.hardware.priceSlide");
    case "perPushToOpenMinor":
      return translate("priceDashboard.hardware.pricePush");
    case "perLiftMinor":
      return translate("priceDashboard.hardware.priceLift");
  }
}
