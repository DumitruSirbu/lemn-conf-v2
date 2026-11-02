"use client";

import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import type { HardwareRateField, ItemRef } from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useContent } from "@/i18n/use-content";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { pendingPriceCountOf } from "./cabinet-list-model";
import { CatalogUnavailableNotice } from "./catalog-states";
import {
  type HardwareClassFacts,
  type HardwarePageInput,
  type ReadyHardware,
} from "./hardware-model";
import { hardwareNameOf } from "./hardware-names";
import { hardwareClassPathOf, hardwareNewPathOf } from "./hardware-paths";
import styles from "./hardware.module.css";
import { formatLei, formatLeiAmount } from "./format-lei";
import { ItemDeskNotice, ItemDialogs } from "./item-dialogs";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
import {
  deleteStandOf,
  isDefaultItem,
  isItemOn,
  switchStandOf,
  type LifecycleContext,
} from "./item-lifecycle-model";
import { offReasonWords } from "./item-lifecycle-words";
import type { PriceDraftClient } from "./price-draft-client";
import { useHardwareDesk, type HardwareDesk } from "./use-hardware-desk";

// The classes of hardware the customer chooses from (frames D4A, D4E, D4F and D4D): one row each, with its four rates, its
// state and the actions "⋯" opens. A rate is changed on the class's own page, so a card never holds a field. Disabling and
// enabling apply at once and are asked of the dialogs; deleting waits for publication.

export interface HardwareListScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly page: HardwarePageInput;
  /** The routes the draft is written through; the fetching client when left out. */
  readonly client?: PriceDraftClient | undefined;
  /** Where a switch is written and the saved kitchens are counted; the page's own stand-in when left out. */
  readonly lifecycleClient?: ItemLifecycleClient | undefined;
}

export function HardwareListScreen({
  locale,
  context,
  page,
  client,
  lifecycleClient,
}: HardwareListScreenProps) {
  const desk = useHardwareDesk({ page, client, lifecycleClient });
  const { derivation } = desk;
  if (derivation.kind === "unreadable") {
    return <HardwareUnavailableScreen locale={locale} context={context} />;
  }
  const shell = {
    ...context,
    pendingPriceCount: pendingPriceCountOf(desk.draft.state.draft),
  };
  return (
    <StaffShell locale={locale} page="hardware" context={shell}>
      <HardwareList locale={locale} desk={desk} derivation={derivation} />
    </StaffShell>
  );
}

/** The classes could not be read: the frame stays, and the notice stands in the page's place. */
export function HardwareUnavailableScreen({
  locale,
  context,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
}) {
  return (
    <StaffShell locale={locale} page="hardware" context={context}>
      <CatalogUnavailableNotice />
    </StaffShell>
  );
}

function HardwareList({
  locale,
  desk,
  derivation,
}: {
  readonly locale: AppLocale;
  readonly desk: HardwareDesk;
  readonly derivation: ReadyHardware;
}) {
  const translate = useTranslations();
  const content = useContent();
  const { availability } = desk;
  const { classes, rates } = derivation;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameOf = (item: ItemRef) =>
    hardwareNameOf(derivation, content.bookText, item);
  return (
    <section
      className={styles.page}
      style={{ "--rate-count": rates.length } as CSSProperties}
      data-testid="hardware-list"
    >
      <div className={styles.heading}>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {translate("priceDashboard.hardware.title")}
        </h1>
        <p className={styles.subtitle}>
          {translate("priceDashboard.hardware.subtitle")}
        </p>
        <a className={styles.addLink} href={hardwareNewPathOf(locale)}>
          {translate("priceDashboard.hardware.addAction")}
        </a>
      </div>
      <ItemDeskNotice desk={availability} />
      <ColumnHeads rates={rates} />
      <ul
        className={styles.rows}
        aria-label={translate("priceDashboard.hardware.tableLabel")}
      >
        {classes.map((facts) => (
          <HardwareRow
            key={facts.tierId}
            locale={locale}
            facts={facts}
            context={availability.context}
            desk={desk}
          />
        ))}
      </ul>
      <ItemDialogs
        desk={availability}
        nameOf={nameOf}
        returnFocusFallbackRef={headingRef}
      />
    </section>
  );
}

const RATE_COLUMN_WORDS = {
  perHingeMinor: "priceDashboard.hardware.columnHinge",
  perDrawerMinor: "priceDashboard.hardware.columnSlide",
  perPushToOpenMinor: "priceDashboard.hardware.columnPush",
  perLiftMinor: "priceDashboard.hardware.columnLift",
} as const satisfies Record<HardwareRateField, string>;

/** The desktop's column titles. Each row's cells say what they are in their own words, so the titles are for the eye. */
function ColumnHeads({
  rates,
}: {
  readonly rates: readonly HardwareRateField[];
}) {
  const translate = useTranslations();
  return (
    <div className={styles.columns} aria-hidden="true">
      <span>{translate("priceDashboard.hardware.columnClass")}</span>
      {rates.map((field) => (
        <span key={field}>{translate(RATE_COLUMN_WORDS[field])}</span>
      ))}
      <span>{translate("priceDashboard.hardware.columnState")}</span>
      <span />
    </div>
  );
}

function HardwareRow({
  locale,
  facts,
  context,
  desk,
}: {
  readonly locale: AppLocale;
  readonly facts: HardwareClassFacts;
  readonly context: LifecycleContext;
  readonly desk: HardwareDesk;
}) {
  const translate = useTranslations();
  const content = useContent();
  const nameId = useId();
  const editId = useId();
  const name = content.bookText(facts.name.authored, facts.name.key);
  const description = content.bookText(
    facts.description.authored,
    facts.description.key,
  );
  const href = hardwareClassPathOf(locale, facts.tierId);
  return (
    <li
      className={styles.row}
      data-modified={facts.isModified}
      data-tier-id={facts.tierId}
      data-testid="hardware-row"
    >
      <div className={styles.rowName}>
        <a
          id={nameId}
          className={styles.name}
          href={href}
          data-testid="hardware-link"
        >
          {name}
        </a>
        {description === "" ? null : (
          <span className={styles.description}>{description}</span>
        )}
        {facts.isDeletionPending ? (
          <span className={styles.description}>
            {translate("priceDashboard.hardware.deleteNotice")}
          </span>
        ) : null}
      </div>
      <ul className={styles.rates}>
        {facts.rates.map((rate) => (
          <RateCell key={rate.field} rate={rate} translate={translate} />
        ))}
      </ul>
      <ClassChips facts={facts} context={context} />
      <div className={styles.rowActions}>
        <a
          id={editId}
          className={styles.editLink}
          href={href}
          aria-labelledby={`${editId} ${nameId}`}
        >
          {translate("priceDashboard.common.edit")}
        </a>
        <RowMenu facts={facts} name={name} context={context} desk={desk} />
      </div>
    </li>
  );
}

function RateCell({
  rate,
  translate,
}: {
  readonly rate: HardwareClassFacts["rates"][number];
  readonly translate: ContentTranslator;
}) {
  const { activeMinor, pendingMinor } = rate;
  const isChanged = activeMinor !== undefined && activeMinor !== pendingMinor;
  return (
    <li
      className={styles.rate}
      data-testid="hardware-rate"
      data-field={rate.field}
    >
      <span className={styles.rateLabel}>
        {translate(RATE_COLUMN_WORDS[rate.field])}
      </span>
      <span className={styles.rateValue}>
        {formatLei(pendingMinor, translate("priceDashboard.units.currency"))}
      </span>
      {isChanged ? (
        <span className={styles.rateActive}>
          {translate("priceDashboard.common.activeThenPending", {
            active: formatLeiAmount(activeMinor),
          })}
        </span>
      ) : null}
    </li>
  );
}

/** What the class is to customers now, whether it is the default, and whether the draft touches it. */
export function ClassChips({
  facts,
  context,
}: {
  readonly facts: HardwareClassFacts;
  readonly context: LifecycleContext;
}) {
  const translate = useTranslations();
  const item = hardwareItemOf(facts);
  const isOn = isItemOn(item, context);
  return (
    <span className={styles.chips}>
      {isDefaultItem(item, context) ? (
        <span className={styles.chip} data-testid="hardware-chip">
          {translate("priceDashboard.chips.defaultChoice")}
        </span>
      ) : null}
      <span
        className={styles.chip}
        data-tone={isOn ? "on" : undefined}
        data-testid="hardware-chip"
      >
        {translate(
          isOn
            ? "priceDashboard.chips.active"
            : "priceDashboard.chips.inactive",
        )}
      </span>
      {facts.isModified ? (
        <span
          className={styles.chip}
          data-tone="warm"
          data-testid="hardware-chip"
        >
          {translate("priceDashboard.chips.pending")}
        </span>
      ) : null}
    </span>
  );
}

export function hardwareItemOf({ tierId }: HardwareClassFacts): ItemRef {
  return { kind: "hardware", tierId };
}

/** "⋯": a disclosure of the actions that change what customers are offered. An action that cannot be taken stays in the
 *  list, off, with the reason under it. */
function RowMenu({
  facts,
  name,
  context,
  desk,
}: {
  readonly facts: HardwareClassFacts;
  readonly name: string;
  readonly context: LifecycleContext;
  readonly desk: HardwareDesk;
}) {
  const translate = useTranslations();
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);
  const { availability } = desk;
  // The dialog is drawn outside the menu, so a press in it is an outside press; the menu stays, and holds the entry
  // that asked, for focus to return to.
  const isAsking = availability.flow.kind !== "closed";
  useCloseOnOutsidePress(wrapRef, isOpen && !isAsking, close);
  const item = hardwareItemOf(facts);
  const isOn = isItemOn(item, context);
  const switchReason = switchReasonOf(translate, facts, context);
  const deleteReason = deleteReasonOf(translate, facts, context);
  return (
    <div
      ref={wrapRef}
      className={styles.rowMenu}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.stopPropagation();
        setIsOpen(false);
        buttonRef.current?.focus();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={styles.more}
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={translate("priceDashboard.common.moreActionsFor", { name })}
        onClick={() => {
          setIsOpen((wasOpen) => !wasOpen);
        }}
      />
      {isOpen ? (
        <ul
          id={menuId}
          className={styles.menu}
          aria-label={translate("priceDashboard.common.actionsFor", { name })}
        >
          <MenuEntry
            label={translate(
              isOn
                ? "priceDashboard.common.deactivate"
                : "priceDashboard.common.activate",
            )}
            reason={switchReason}
            onPress={() => {
              availability.requestSwitch(item);
            }}
          />
          <MenuEntry
            label={translate("priceDashboard.common.delete")}
            reason={deleteReason}
            onPress={() => {
              availability.requestDeletion({
                kind: "hardware",
                tierId: facts.tierId,
              });
            }}
          />
        </ul>
      ) : null}
    </div>
  );
}

/** A class the draft deletes cannot be switched: nothing is offered of it once the deletion is published. */
function switchReasonOf(
  translate: ContentTranslator,
  facts: HardwareClassFacts,
  context: LifecycleContext,
): string | undefined {
  if (facts.isDeletionPending) {
    return translate("priceDashboard.hardware.deleteNotice");
  }
  const stand = switchStandOf(hardwareItemOf(facts), context);
  return stand.kind === "off"
    ? offReasonWords(translate, stand.reason)
    : undefined;
}

function deleteReasonOf(
  translate: ContentTranslator,
  facts: HardwareClassFacts,
  context: LifecycleContext,
): string | undefined {
  if (facts.isDeletionPending) {
    return translate("priceDashboard.hardware.deleteNotice");
  }
  const stand = deleteStandOf(
    { kind: "hardware", tierId: facts.tierId },
    context,
  );
  return stand.kind === "off"
    ? offReasonWords(translate, stand.reason)
    : undefined;
}

function MenuEntry({
  label,
  reason,
  onPress,
}: {
  readonly label: string;
  /** Why the entry is off; absent, it can be pressed. */
  readonly reason: string | undefined;
  readonly onPress: () => void;
}) {
  const reasonId = useId();
  const isOff = reason !== undefined;
  return (
    <li className={styles.menuItem}>
      <button
        type="button"
        className={styles.menuEntry}
        aria-disabled={isOff ? true : undefined}
        aria-describedby={isOff ? reasonId : undefined}
        onClick={isOff ? undefined : onPress}
      >
        {label}
      </button>
      {isOff ? (
        <span
          id={reasonId}
          className={styles.menuReason}
          data-testid="menu-reason"
        >
          {reason}
        </span>
      ) : null}
    </li>
  );
}

/** A press outside the menu closes it and moves nothing: focus is wherever the press put it. */
function useCloseOnOutsidePress(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  close: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return;
    const onPress = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) {
        return;
      }
      close();
    };
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("pointerdown", onPress);
    };
  }, [ref, isOpen, close]);
}
