"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, type CSSProperties } from "react";

import type { HardwareRateField, ItemRef } from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useContent } from "@/i18n/use-content";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { pendingPriceCountOf } from "./cabinet-list-model";
import {
  type HardwareClassFacts,
  type HardwarePageInput,
  type ReadyHardware,
} from "./hardware-model";
import { hardwareNameOf } from "./hardware-names";
import {
  ClassChips,
  hardwareItemOf,
  HardwareUnavailableScreen,
  reasonsOf,
} from "./hardware-parts";
import { hardwareClassPathOf, hardwareNewPathOf } from "./hardware-paths";
import { HARDWARE_RATE_WORDS } from "./hardware-rate-words";
import styles from "./hardware.module.css";
import { formatLei, formatLeiAmount } from "./format-lei";
import { ItemDeskNotice, ItemDialogs } from "./item-dialogs";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
import { ItemRowMenu, type ItemRowMenuClasses } from "./item-row-menu";
import { isItemOn, type LifecycleContext } from "./item-lifecycle-model";
import type { PriceDraftClient } from "./price-draft-client";
import { useHardwareDesk, type HardwareDesk } from "./use-hardware-desk";

// The classes of hardware the customer chooses from (frames D4A, D4E, D4F and D4D): one row each, with every rate, its
// state and the actions "⋯" opens. A rate is changed on the class's own page, so a card never holds a field. Disabling and
// enabling apply at once and are asked of the dialogs; deleting waits for publication.

const MENU_CLASSES: ItemRowMenuClasses = {
  rowMenu: styles.rowMenu,
  more: styles.more,
  menu: styles.menu,
  menuItem: styles.menuItem,
  menuEntry: styles.menuEntry,
  menuReason: styles.menuReason,
};

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
        <span key={field}>{translate(HARDWARE_RATE_WORDS[field].column)}</span>
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
        {translate(HARDWARE_RATE_WORDS[rate.field].column)}
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
  const { availability } = desk;
  const item = hardwareItemOf(facts);
  const { switchReason, deleteReason } = reasonsOf({
    translate,
    facts,
    context,
  });
  return (
    <ItemRowMenu
      name={name}
      isAsking={availability.flow.kind !== "closed"}
      classes={MENU_CLASSES}
      entries={[
        {
          id: "switch",
          label: translate(
            isItemOn(item, context)
              ? "priceDashboard.common.deactivate"
              : "priceDashboard.common.activate",
          ),
          reason: switchReason,
          onPress: () => {
            availability.requestSwitch(item);
          },
        },
        {
          id: "delete",
          label: translate("priceDashboard.common.delete"),
          reason: deleteReason,
          onPress: () => {
            availability.requestDeletion(item);
          },
        },
      ]}
    />
  );
}
