"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { CabinetAnchorField } from "./cabinet-list-model";
import { PriceEditor } from "./price-editor";
import type { FieldWriteResult } from "./use-price-draft";

// Frame D2C: the price at the default size changes in the table, in the way `PriceEditor` describes.

/** What the list is given where it can change a price: the one write, and whether another is out. */
export interface PriceEditing {
  readonly isBusy: boolean;
  readonly saveAnchor: (
    field: CabinetAnchorField,
    minor: number,
  ) => Promise<FieldWriteResult>;
}

export interface EditablePriceProps {
  readonly cabinetName: string;
  readonly widthMm: number;
  readonly field: CabinetAnchorField;
  readonly editing: PriceEditing;
  /** The price as the row draws it. */
  readonly figure: string;
  /** What stands beside the figure while the field is closed. */
  readonly basis: ReactNode;
}

export function EditablePrice({
  cabinetName,
  widthMm,
  field,
  editing,
  figure,
  basis,
}: EditablePriceProps) {
  const translate = useTranslations();
  return (
    <PriceEditor
      label={translate("priceDashboard.cabinets.editPriceLabel", { widthMm })}
      openAriaLabel={translate("priceDashboard.cabinets.editPriceAria", {
        name: cabinetName,
      })}
      activeMinor={field.activeMinor}
      pendingMinor={field.pendingMinor}
      isBusy={editing.isBusy}
      sendAmount={(minor) => editing.saveAnchor(field, minor)}
      figure={figure}
      basis={basis}
    />
  );
}
