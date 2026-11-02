"use client";

import { useTranslations } from "next-intl";
import {
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  PRICE_GROUP_CODES,
  TEN_LEI_MINOR,
  type BulkTarget,
  type PriceBook,
  type PriceGroupCode,
} from "@lemnaria/configurator-domain";

import { AccountDialog } from "@/account/account-dialog";
import { FormNotice, InlineRefusal } from "@/account/account-form-parts";
import type { ContentTranslator } from "@/i18n/content";

import { previewBulk, type BulkExample } from "./bulk-preview";
import type { CabinetRuleFacts } from "./cabinet-list-model";
import { formatLei } from "./format-lei";
import {
  bulkPercentRefusalWords,
  bulkPreviewRefusalWords,
  bulkWriteFailureWords,
  type FailedBulkWrite,
} from "./price-input-words";
import { readBulkPercentInput } from "./price-field-input";
import styles from "./price-edit.module.css";
import { PERCENT_UNIT, PriceUnitField } from "./price-unit-field";
import type { BulkChangeInput, BulkWriteResult } from "./use-price-draft";

// Frame D2D: "Modifică prețurile cu %". The scope is every cabinet, one group, or the cabinets ticked; the percentage
// is whole and signed. Before anything is sent the dialog says how many cabinets and prices the action touches and
// shows one cabinet's price before and after, all from the domain's plan on the candidate book, and says why an action
// would be refused. Focus starts on the percentage field, as the frame draws it, so the person types without first
// moving.

/**
 * The illustration the percentage field's hint asks for ("with a minus for a reduction, e.g. −3"), not a figure of the
 * book.
 */
const BULK_REDUCTION_EXAMPLE = "3";

type Scope = BulkTarget["scope"];

const SCOPES: readonly Scope[] = ["all", "group", "selection"];

const SCOPE_WORDS = {
  all: "priceDashboard.bulk.scopeAll",
  group: "priceDashboard.bulk.scopeGroup",
  selection: "priceDashboard.bulk.scopeSelected",
} as const;

const GROUP_WORDS = {
  base: "priceDashboard.cabinets.groupBase",
  wall: "priceDashboard.cabinets.groupWall",
  tall: "priceDashboard.cabinets.groupTall",
  corner: "priceDashboard.cabinets.groupCorner",
} as const;

export interface BulkChangeDialogProps {
  /** The cabinets of the list, with their groups and prices. */
  readonly rows: readonly CabinetRuleFacts[];
  /** The active book with the draft applied: the prices the action scales. */
  readonly candidate: PriceBook;
  readonly onApply: (input: BulkChangeInput) => Promise<BulkWriteResult>;
  /** Another write of the draft is out: confirming waits for it, without the dialog claiming to be sending. */
  readonly isDraftBusy: boolean;
  readonly onClose: () => void;
  /** Where focus goes on close when the press that opened the dialog did not focus its button (Safari and Firefox). */
  readonly returnFocusFallbackRef: RefObject<HTMLElement | null>;
}

export function BulkChangeDialog({
  rows,
  candidate,
  onApply,
  isDraftBusy,
  onClose,
  returnFocusFallbackRef,
}: BulkChangeDialogProps) {
  const translate = useTranslations();
  const noCabinetsId = useId();
  const percentRef = useRef<HTMLInputElement>(null);
  const priced = useMemo(
    () => rows.filter((row) => !row.isCustomerSupplied),
    [rows],
  );
  const groups = useMemo(
    () =>
      PRICE_GROUP_CODES.filter((code) =>
        priced.some((row) => row.group === code),
      ),
    [priced],
  );
  const [scope, setScope] = useState<Scope>("group");
  const [groupCode, setGroupCode] = useState<PriceGroupCode | undefined>(
    groups[0],
  );
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [typed, setTyped] = useState("");
  const [isTouched, setIsTouched] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [failure, setFailure] = useState<FailedBulkWrite | undefined>(
    undefined,
  );

  const target = useMemo(
    () => targetOf(scope, groupCode, ticked),
    [scope, groupCode, ticked],
  );
  const reading = useMemo(() => readBulkPercentInput(typed), [typed]);
  const preview = useMemo(
    () =>
      reading.kind === "percent" && target !== undefined
        ? previewBulk({ candidate, rows, target, percent: reading.percent })
        : undefined,
    [candidate, rows, target, reading],
  );
  const percentError = percentErrorOf(translate, {
    reading,
    isTouched,
    preview,
  });
  const isReady = preview?.kind === "ready";

  /** A change to what the action would do takes the last refusal off the screen. */
  const forgettingFailure =
    <Value,>(update: (value: Value) => void) =>
    (value: Value) => {
      update(value);
      setFailure(undefined);
    };

  const apply = async () => {
    if (reading.kind !== "percent" || target === undefined || !isReady) return;
    if (isDraftBusy) return;
    setIsSending(true);
    const result = await onApply({
      target,
      percent: reading.percent,
    });
    setIsSending(false);
    if (result.kind === "saved") onClose();
    else if (result.kind !== "busy") setFailure(result);
  };

  return (
    <InMain>
      <AccountDialog
        kind="standard"
        title={translate("priceDashboard.bulk.title")}
        initialFocusRef={percentRef}
        returnFocusFallbackRef={returnFocusFallbackRef}
        confirm={{
          label: translate("priceDashboard.common.addToPending"),
          busyLabel: translate("priceDashboard.bulk.adding"),
          isBusy: isSending,
          isOff: !isReady || isDraftBusy,
          onPress: () => {
            void apply();
          },
        }}
        cancel={{
          label: translate("priceDashboard.common.cancel"),
          onPress: onClose,
        }}
      >
        <ScopePicker scope={scope} onScope={forgettingFailure(setScope)} />
        {scope === "group" ? (
          <GroupSelect
            groups={groups}
            value={groupCode}
            onChange={forgettingFailure(setGroupCode)}
          />
        ) : null}
        {scope === "selection" ? (
          <CabinetChecklist
            rows={priced}
            ticked={ticked}
            describedBy={
              preview?.kind === "no-cabinets" ? noCabinetsId : undefined
            }
            onToggle={forgettingFailure((ruleId: string) => {
              setTicked((held) => toggled(held, ruleId));
            })}
          />
        ) : null}
        {preview?.kind === "no-cabinets" ? (
          <InlineRefusal id={noCabinetsId}>
            {bulkPreviewRefusalWords(translate, preview)}
          </InlineRefusal>
        ) : null}
        <PriceUnitField
          label={translate("priceDashboard.bulk.changeLabel")}
          unit={PERCENT_UNIT}
          inputMode="text"
          value={typed}
          inputRef={percentRef}
          hint={translate("priceDashboard.bulk.changeHint", {
            example: BULK_REDUCTION_EXAMPLE,
          })}
          error={percentError}
          onChange={forgettingFailure((next: string) => {
            setTyped(next);
            setIsTouched(true);
          })}
        />
        {preview?.kind === "ready" ? (
          <FormNotice
            tone="info"
            title={translate("priceDashboard.bulk.previewTitle")}
          >
            {translate("priceDashboard.bulk.preview", {
              cabinetCount: preview.cabinetCount,
              priceCount: preview.priceCount,
              example: exampleWords(translate, preview.example),
            })}
          </FormNotice>
        ) : null}
        <p className={styles.bulkNote}>
          {translate("priceDashboard.bulk.explainer", {
            roundTo: formatLei(
              TEN_LEI_MINOR,
              translate("priceDashboard.units.currency"),
            ),
          })}
        </p>
        {failure === undefined ? null : (
          <FormNotice tone="error">
            {bulkWriteFailureWords(translate, failure)}
          </FormNotice>
        )}
      </AccountDialog>
    </InMain>
  );
}

function percentErrorOf(
  translate: ContentTranslator,
  {
    reading,
    isTouched,
    preview,
  }: {
    readonly reading: ReturnType<typeof readBulkPercentInput>;
    readonly isTouched: boolean;
    readonly preview: ReturnType<typeof previewBulk> | undefined;
  },
): string | undefined {
  if (reading.kind === "refused") {
    return isTouched
      ? bulkPercentRefusalWords(translate, reading.refusal)
      : undefined;
  }
  if (
    preview === undefined ||
    preview.kind === "ready" ||
    preview.kind === "no-cabinets"
  ) {
    return undefined;
  }
  return bulkPreviewRefusalWords(translate, preview);
}

function exampleWords(
  translate: ContentTranslator,
  example: BulkExample,
): string {
  const currency = translate("priceDashboard.units.currency");
  return translate("priceDashboard.bulk.previewExample", {
    name: example.name,
    widthMm: example.widthMm,
    before: formatLei(example.beforeMinor, currency),
    after: formatLei(example.afterMinor, currency),
  });
}

function targetOf(
  scope: Scope,
  groupCode: PriceGroupCode | undefined,
  ticked: ReadonlySet<string>,
): BulkTarget | undefined {
  switch (scope) {
    case "all":
      return { scope };
    case "group":
      return groupCode === undefined ? undefined : { scope, groupCode };
    case "selection":
      return { scope, ruleIds: [...ticked] };
  }
}

function toggled(
  held: ReadonlySet<string>,
  ruleId: string,
): ReadonlySet<string> {
  const next = new Set(held);
  if (!next.delete(ruleId)) next.add(ruleId);
  return next;
}

function ScopePicker({
  scope,
  onScope,
}: {
  readonly scope: Scope;
  readonly onScope: (scope: Scope) => void;
}) {
  const translate = useTranslations();
  const name = useId();
  return (
    <fieldset className={styles.bulkPick}>
      <legend className={styles.bulkPickLegend}>
        {translate("priceDashboard.bulk.scopeLabel")}
      </legend>
      <div className={styles.bulkChoices}>
        {SCOPES.map((choice) => (
          <label key={choice} className={styles.bulkChoice}>
            <input
              type="radio"
              name={name}
              checked={scope === choice}
              onChange={() => {
                onScope(choice);
              }}
            />
            <span>{translate(SCOPE_WORDS[choice])}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function GroupSelect({
  groups,
  value,
  onChange,
}: {
  readonly groups: readonly PriceGroupCode[];
  readonly value: PriceGroupCode | undefined;
  readonly onChange: (code: PriceGroupCode) => void;
}) {
  const translate = useTranslations();
  const selectId = useId();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={selectId}>
        {translate("priceDashboard.bulk.groupLabel")}
      </label>
      <select
        id={selectId}
        className={styles.bulkSelect}
        value={value}
        onChange={(event) => {
          const chosen = groups.find((code) => code === event.target.value);
          if (chosen !== undefined) onChange(chosen);
        }}
      >
        {groups.map((code) => (
          <option key={code} value={code}>
            {translate(GROUP_WORDS[code])}
          </option>
        ))}
      </select>
    </div>
  );
}

function CabinetChecklist({
  rows,
  ticked,
  describedBy,
  onToggle,
}: {
  readonly rows: readonly CabinetRuleFacts[];
  readonly ticked: ReadonlySet<string>;
  readonly describedBy: string | undefined;
  readonly onToggle: (ruleId: string) => void;
}) {
  const translate = useTranslations();
  return (
    <ul
      className={styles.cabinetChecklist}
      aria-label={translate("priceDashboard.bulk.scopeSelected")}
      aria-describedby={describedBy}
    >
      {rows.map((row) => (
        <li key={row.ruleId}>
          <label className={styles.cabinetCheck}>
            <input
              type="checkbox"
              aria-label={translate("priceDashboard.cabinets.selectRowAria", {
                name: row.name,
              })}
              checked={ticked.has(row.ruleId)}
              onChange={() => {
                onToggle(row.ruleId);
              }}
            />
            <span aria-hidden="true">{row.name}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** The dialog is drawn into the frame's `<main>`, so the page behind it goes inert. */
function InMain({ children }: { readonly children: ReactNode }) {
  return createPortal(
    children,
    document.querySelector("main") ?? document.body,
  );
}
