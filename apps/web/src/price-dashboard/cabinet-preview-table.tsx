"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";

import {
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  TEN_LEI_MINOR,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import { useContent } from "@/i18n/use-content";

import styles from "./cabinet-detail.module.css";
import type { CabinetDetailFacts } from "./cabinet-detail-facts";
import {
  previewTableOf,
  type PreviewColumn,
  type PreviewTable,
  type PreviewTableRow,
} from "./cabinet-preview-model";
import { formatLei } from "./format-lei";

// The table of prices and the switches that put the hardware and the deep kitchen into it (frames D3A to D3G). Every
// figure is a row of `previewCabinet`; this component only lays them out.

export function CabinetPreviewSection({
  facts,
  books,
  depthPercent,
}: {
  readonly facts: CabinetDetailFacts;
  readonly books: {
    readonly active: PriceBook;
    readonly typed: PriceBook | undefined;
  };
  /** The depth rule's percentage in the draft. */
  readonly depthPercent: number;
}) {
  const translate = useTranslations();
  const content = useContent();
  const [withHardware, setWithHardware] = useState(false);
  const [isDeepKitchen, setIsDeepKitchen] = useState(false);
  const [chosenTierId, setChosenTierId] = useState<string | undefined>(
    undefined,
  );
  const tiers = books.active.hardware.tiers;
  const hardwareTierId = chosenTierId ?? books.active.hardware.defaultTierId;
  const isDeep = isDeepKitchen && facts.canDeepen;
  const { active, typed } = books;
  const table = useMemo(
    () =>
      previewTableOf({ active, typed }, facts.ruleId, {
        withHardware,
        hardwareTierId,
        isDeepKitchen: isDeep,
      }),
    [active, typed, facts.ruleId, withHardware, hardwareTierId, isDeep],
  );
  const headingId = useId();
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.previewHead}>
        <h2 id={headingId} className={styles.cardTitle}>
          {translate("priceDashboard.cabinet.previewHeading")}
        </h2>
        <span className={styles.cardNote}>
          {translate("priceDashboard.cabinet.previewIntro", {
            roundTo: formatLei(
              TEN_LEI_MINOR,
              translate("priceDashboard.units.currency"),
            ),
          })}
        </span>
      </div>
      <Switch
        name={translate("priceDashboard.cabinet.withHardware")}
        state={translate(
          withHardware
            ? "priceDashboard.cabinet.withHardwareOn"
            : "priceDashboard.cabinet.withHardwareOff",
        )}
        isOn={withHardware}
        onToggle={() => {
          setWithHardware((isOn) => !isOn);
        }}
      />
      {withHardware ? (
        <fieldset className={styles.tierChoices}>
          <legend className={styles.visuallyHidden}>
            {translate("priceDashboard.cabinet.withHardware")}
          </legend>
          {tiers.map((tier) => (
            <label key={tier.tierId} className={styles.tierChoice}>
              <input
                type="radio"
                name="hardware-tier"
                checked={tier.tierId === hardwareTierId}
                onChange={() => {
                  setChosenTierId(tier.tierId);
                }}
              />
              {content.bookText(tier.name, tier.nameKey)}
            </label>
          ))}
        </fieldset>
      ) : null}
      <DepthSwitch
        facts={facts}
        isDeep={isDeep}
        depthPercent={depthPercent}
        onToggle={() => {
          setIsDeepKitchen((isOn) => !isOn);
        }}
      />
      {table === undefined ? null : (
        <PreviewGrid table={table} translate={translate} />
      )}
    </section>
  );
}

export function DepthSwitch({
  facts,
  isDeep,
  depthPercent,
  onToggle,
}: {
  readonly facts: CabinetDetailFacts;
  readonly isDeep: boolean;
  readonly depthPercent: number;
  readonly onToggle: () => void;
}) {
  const translate = useTranslations();
  const { shallowDepth, deepDepth } = facts.dimensions;
  const state = !facts.canDeepen
    ? translate("priceDashboard.cabinet.depthToggleDisabled", {
        deepMm: DEEP_CABINET_DEPTH_MM,
      })
    : isDeep
      ? translate("priceDashboard.cabinet.depthToggleOn", {
          deepMm: DEEP_CABINET_DEPTH_MM,
          percent: String(depthPercent),
        })
      : translate("priceDashboard.cabinet.depthToggleOff", {
          shallowMm: DEFAULT_CABINET_DEPTH_MM,
        });
  return (
    <Switch
      name={translate("priceDashboard.cabinet.depthToggle", {
        shallowMm: shallowDepth.kitchenDepthMm,
        deepMm: deepDepth.kitchenDepthMm,
      })}
      state={state}
      isOn={isDeep}
      isDisabled={!facts.canDeepen}
      onToggle={onToggle}
    />
  );
}

function Switch({
  name,
  state,
  isOn,
  isDisabled = false,
  onToggle,
}: {
  readonly name: string;
  readonly state: string;
  readonly isOn: boolean;
  readonly isDisabled?: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      className={styles.switch}
      aria-checked={isOn}
      disabled={isDisabled}
      onClick={onToggle}
    >
      <span className={styles.switchName}>{name}</span>
      <span className={styles.switchState}>{state}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The table

function PreviewGrid({
  table,
  translate,
}: {
  readonly table: PreviewTable;
  readonly translate: ContentTranslator;
}) {
  const content = useContent();
  const labelOf = (column: PreviewColumn) =>
    columnLabel(translate, content, column);
  return (
    <table
      className={styles.previewTable}
      role="table"
      data-testid="cabinet-preview"
    >
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader" rowSpan={2}>
            {translate("priceDashboard.cabinet.columnWidth")}
          </th>
          {table.hasDoorColumn ? (
            <th scope="col" role="columnheader" rowSpan={2}>
              {translate("priceDashboard.cabinet.columnDoors")}
            </th>
          ) : null}
          {table.columns.map((column) => (
            <th
              key={columnKey(column)}
              scope="colgroup"
              role="columnheader"
              colSpan={2}
            >
              {labelOf(column)}
            </th>
          ))}
        </tr>
        <tr role="row">
          {table.columns.map((column) => (
            <ActiveAndNewHeads key={columnKey(column)} />
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {table.rows.map((row) => (
          <PreviewLine
            key={row.widthMm}
            row={row}
            table={table}
            labelOf={labelOf}
          />
        ))}
      </tbody>
    </table>
  );
}

function ActiveAndNewHeads() {
  const translate = useTranslations();
  return (
    <>
      <th scope="col" role="columnheader">
        {translate("priceDashboard.cabinet.columnActive")}
      </th>
      <th scope="col" role="columnheader">
        {translate("priceDashboard.cabinet.columnNew")}
      </th>
    </>
  );
}

function PreviewLine({
  row,
  table,
  labelOf,
}: {
  readonly row: PreviewTableRow;
  readonly table: PreviewTable;
  readonly labelOf: (column: PreviewColumn) => string;
}) {
  const translate = useTranslations();
  const currency = translate("priceDashboard.units.currency");
  const active = translate("priceDashboard.cabinet.columnActive");
  const next = translate("priceDashboard.cabinet.columnNew");
  return (
    <tr role="row" data-step={row.isDoorStep}>
      <th scope="row" role="rowheader">
        {row.isOffGridMinimum
          ? translate("priceDashboard.cabinet.widthRoundedUp", {
              widthMm: row.widthMm,
              roundedMm: row.pricedAsWidthMm,
            })
          : translate("priceDashboard.cabinet.previewWidth", {
              widthMm: row.widthMm,
            })}
      </th>
      {table.hasDoorColumn ? (
        <td
          role="cell"
          data-label={translate("priceDashboard.cabinet.columnDoors")}
        >
          {row.isDoorStep ? (
            <span className={styles.stepChip}>
              {translate("priceDashboard.cabinet.doorsFromHere", {
                doorCount: row.doorLeaves,
              })}
            </span>
          ) : (
            translate("priceDashboard.cabinet.doorCount", {
              doorCount: row.doorLeaves,
            })
          )}
        </td>
      ) : null}
      {row.cells.flatMap((cell, index) => {
        const column = table.columns[index];
        const name = column === undefined ? "" : labelOf(column);
        const isChanged =
          cell.nextMinor !== undefined && cell.nextMinor !== cell.activeMinor;
        return [
          <td
            role="cell"
            key={`${String(index)}-active`}
            data-role="active"
            data-label={translate("priceDashboard.cabinet.previewCellLabel", {
              column: name,
              kind: active,
            })}
          >
            {cell.activeMinor === undefined ? (
              <span className={styles.noValue} />
            ) : (
              formatLei(cell.activeMinor, currency)
            )}
          </td>,
          <td
            role="cell"
            key={`${String(index)}-next`}
            data-role="next"
            data-changed={isChanged}
            data-label={translate("priceDashboard.cabinet.previewCellLabel", {
              column: name,
              kind: next,
            })}
          >
            {cell.nextMinor === undefined ? (
              <span className={styles.noValue} />
            ) : (
              formatLei(cell.nextMinor, currency)
            )}
          </td>,
        ];
      })}
    </tr>
  );
}

function columnKey(column: PreviewColumn): string {
  return column.kind === "material"
    ? column.tierId
    : `height-${String(column.heightMm)}`;
}

function columnLabel(
  translate: ContentTranslator,
  content: ReturnType<typeof useContent>,
  column: PreviewColumn,
): string {
  if (column.kind === "material") {
    const name = content.bookText(column.name.authored, column.name.key);
    return column.isDefault
      ? name
      : translate("priceDashboard.cabinet.columnMaterialPercent", {
          name,
          percent: String(column.percent),
        });
  }
  const { heightMm } = column;
  switch (column.role) {
    case "wall":
      return translate("priceDashboard.cabinet.columnWallRow", { heightMm });
    case "top":
      return translate("priceDashboard.cabinet.columnTopRow", { heightMm });
    case "other":
      return translate("priceDashboard.cabinet.columnHeight", { heightMm });
  }
}
