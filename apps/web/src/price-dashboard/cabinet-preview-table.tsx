"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";

import {
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  TEN_LEI_MINOR,
  type HardwareTier,
} from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import { useContent } from "@/i18n/use-content";

import styles from "./cabinet-detail.module.css";
import type { CabinetDetailFacts } from "./cabinet-detail-facts";
import {
  depthPercentsOf,
  previewTableOf,
  type DepthPercents,
  type PreviewBooks,
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
}: {
  readonly facts: CabinetDetailFacts;
  readonly books: PreviewBooks;
}) {
  const translate = useTranslations();
  const [withHardware, setWithHardware] = useState(false);
  const [isDeepKitchen, setIsDeepKitchen] = useState(false);
  const [chosenTierId, setChosenTierId] = useState<string | undefined>(
    undefined,
  );
  const tiers = books.active.hardware.tiers;
  const hardwareTierId = chosenTierId ?? books.active.hardware.defaultTierId;
  const isDeep = isDeepKitchen && facts.canDeepen;
  const { active, draft, typed } = books;
  const table = useMemo(
    () =>
      previewTableOf({ active, draft, typed }, facts.ruleId, {
        withHardware,
        hardwareTierId,
        isDeepKitchen: isDeep,
      }),
    [active, draft, typed, facts.ruleId, withHardware, hardwareTierId, isDeep],
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
        <HardwareTierChoice
          tiers={tiers}
          chosenTierId={hardwareTierId}
          onChoose={setChosenTierId}
        />
      ) : null}
      <DepthSwitch
        facts={facts}
        isDeep={isDeep}
        depthPercents={depthPercentsOf(books)}
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

function HardwareTierChoice({
  tiers,
  chosenTierId,
  onChoose,
}: {
  readonly tiers: readonly HardwareTier[];
  readonly chosenTierId: string;
  readonly onChoose: (tierId: string) => void;
}) {
  const translate = useTranslations();
  const content = useContent();
  return (
    <fieldset className={styles.tierChoices}>
      <legend className={styles.visuallyHidden}>
        {translate("priceDashboard.cabinet.withHardware")}
      </legend>
      {tiers.map((tier) => (
        <label key={tier.tierId} className={styles.tierChoice}>
          <input
            type="radio"
            name="hardware-tier"
            checked={tier.tierId === chosenTierId}
            onChange={() => {
              onChoose(tier.tierId);
            }}
          />
          {content.bookText(tier.name, tier.nameKey)}
        </label>
      ))}
    </fieldset>
  );
}

/** The switch between the shallow and the deep kitchen; with no `onToggle` it is a statement only. */
export function DepthSwitch({
  facts,
  isDeep,
  depthPercents,
  onToggle,
}: {
  readonly facts: CabinetDetailFacts;
  readonly isDeep: boolean;
  readonly depthPercents: DepthPercents;
  readonly onToggle?: (() => void) | undefined;
}) {
  const translate = useTranslations();
  const { shallowDepth, deepDepth } = facts.dimensions;
  return (
    <Switch
      name={translate("priceDashboard.cabinet.depthToggle", {
        shallowMm: shallowDepth.kitchenDepthMm,
        deepMm: deepDepth.kitchenDepthMm,
      })}
      state={depthStateOf(translate, { facts, isDeep, depthPercents })}
      isOn={isDeep}
      isDisabled={!facts.canDeepen}
      onToggle={onToggle}
    />
  );
}

function depthStateOf(
  translate: ContentTranslator,
  {
    facts,
    isDeep,
    depthPercents,
  }: {
    readonly facts: CabinetDetailFacts;
    readonly isDeep: boolean;
    readonly depthPercents: DepthPercents;
  },
): string {
  if (!facts.canDeepen) {
    return translate("priceDashboard.cabinet.depthToggleDisabled", {
      deepMm: DEEP_CABINET_DEPTH_MM,
    });
  }
  if (!isDeep) {
    return translate("priceDashboard.cabinet.depthToggleOff", {
      shallowMm: DEFAULT_CABINET_DEPTH_MM,
    });
  }
  const { active, pending } = depthPercents;
  return active === pending
    ? translate("priceDashboard.cabinet.depthToggleOn", {
        deepMm: DEEP_CABINET_DEPTH_MM,
        percent: String(active),
      })
    : translate("priceDashboard.cabinet.depthToggleOnPending", {
        deepMm: DEEP_CABINET_DEPTH_MM,
        activePercent: String(active),
        pendingPercent: String(pending),
      });
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
  readonly onToggle?: (() => void) | undefined;
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
      {table.hasDoorColumn ? <DoorCell row={row} /> : null}
      {row.cells.flatMap((cell, index) => {
        const column = table.columns[index];
        const name = column === undefined ? "" : labelOf(column);
        const isChanged =
          cell.nextMinor !== undefined && cell.nextMinor !== cell.activeMinor;
        return [
          <PriceCell
            key={`${String(index)}-active`}
            role="active"
            column={name}
            amountMinor={cell.activeMinor}
          />,
          <PriceCell
            key={`${String(index)}-next`}
            role="next"
            column={name}
            amountMinor={cell.nextMinor}
            isChanged={isChanged}
          />,
        ];
      })}
    </tr>
  );
}

function DoorCell({ row }: { readonly row: PreviewTableRow }) {
  const translate = useTranslations();
  return (
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
  );
}

function PriceCell({
  role,
  column,
  amountMinor,
  isChanged,
}: {
  readonly role: "active" | "next";
  readonly column: string;
  readonly amountMinor: number | undefined;
  /** Only the new column says whether its price differs from the active one. */
  readonly isChanged?: boolean;
}) {
  const translate = useTranslations();
  const kind = translate(
    role === "active"
      ? "priceDashboard.cabinet.columnActive"
      : "priceDashboard.cabinet.columnNew",
  );
  return (
    <td
      role="cell"
      data-role={role}
      data-changed={isChanged}
      data-label={translate("priceDashboard.cabinet.previewCellLabel", {
        column,
        kind,
      })}
    >
      {amountMinor === undefined ? (
        <span className={styles.noValue} />
      ) : (
        formatLei(amountMinor, translate("priceDashboard.units.currency"))
      )}
    </td>
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
    return materialLabel(translate, content, column);
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

function materialLabel(
  translate: ContentTranslator,
  content: ReturnType<typeof useContent>,
  column: Extract<PreviewColumn, { readonly kind: "material" }>,
): string {
  const name = content.bookText(column.name.authored, column.name.key);
  if (column.pendingPercent !== undefined) {
    return translate("priceDashboard.cabinet.columnMaterialPercentPending", {
      name,
      percent: String(column.percent),
      pendingPercent: String(column.pendingPercent),
    });
  }
  return column.isDefault
    ? name
    : translate("priceDashboard.cabinet.columnMaterialPercent", {
        name,
        percent: String(column.percent),
      });
}
