"use client";

import { useTranslations } from "next-intl";
import { useId, useRef } from "react";

import type { ItemRef } from "@lemnaria/configurator-domain";

import type { AppLocale } from "@/i18n/routing";
import { useContent } from "@/i18n/use-content";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import {
  accessoryItemOf,
  type AccessoryFacts,
  type AccessoryPageInput,
  type ReadyAccessories,
} from "./accessory-model";
import { accessoryNameOf } from "./accessory-names";
import {
  AccessoryChips,
  accessoryReasonsOf,
  activePriceWords,
  earningWords,
  priceWords,
} from "./accessory-parts";
import { accessoryNewPathOf, accessoryPathOf } from "./accessory-paths";
import { ItemUnavailableScreen } from "./catalog-states";
import styles from "./accessory.module.css";
import { pendingPriceCountOf } from "./cabinet-list-model";
import { ItemDeskNotice, ItemDialogs } from "./item-dialogs";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
import { isItemOn, type LifecycleContext } from "./item-lifecycle-model";
import {
  ItemRowMenu,
  lifecycleEntriesOf,
  menuClassesOf,
} from "./item-row-menu";
import type { PriceDraftClient } from "./price-draft-client";
import { useAccessoryDesk, type AccessoryDesk } from "./use-accessory-desk";

// The accessories a kitchen earns: one row each, with the rule that adds it, its price per unit, its
// state and the actions "⋯" opens. A price is changed on the accessory's own page, so a card never holds a field.
// Disabling and enabling apply at once and are asked of the dialogs; deleting waits for publication.

const MENU_CLASSES = menuClassesOf(styles);

export interface AccessoryListScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly page: AccessoryPageInput;
  /** The routes the draft is written through; the fetching client when left out. */
  readonly client?: PriceDraftClient | undefined;
  /** Where a switch is written and the saved kitchens are counted; the page's own stand-in when left out. */
  readonly lifecycleClient?: ItemLifecycleClient | undefined;
}

export function AccessoryListScreen({
  locale,
  context,
  page,
  client,
  lifecycleClient,
}: AccessoryListScreenProps) {
  const desk = useAccessoryDesk({ page, client, lifecycleClient });
  const { derivation } = desk;
  if (derivation.kind === "unreadable") {
    return (
      <ItemUnavailableScreen
        locale={locale}
        context={context}
        page="accessories"
      />
    );
  }
  const shell = {
    ...context,
    pendingPriceCount: pendingPriceCountOf(desk.draft.state.draft),
  };
  return (
    <StaffShell locale={locale} page="accessories" context={shell}>
      <AccessoryList
        locale={locale}
        desk={desk}
        derivation={derivation}
        cabinetNames={page.cabinetNames}
      />
    </StaffShell>
  );
}

function AccessoryList({
  locale,
  desk,
  derivation,
  cabinetNames,
}: {
  readonly locale: AppLocale;
  readonly desk: AccessoryDesk;
  readonly derivation: ReadyAccessories;
  readonly cabinetNames: Readonly<Record<string, string>>;
}) {
  const translate = useTranslations();
  const content = useContent();
  const { availability } = desk;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameOf = (item: ItemRef) =>
    accessoryNameOf(derivation, content.bookText, item);
  return (
    <section className={styles.page} data-testid="accessory-list">
      <div className={styles.heading}>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {translate("priceDashboard.accessories.title")}
        </h1>
        <p className={styles.subtitle}>
          {translate("priceDashboard.accessories.subtitle")}
        </p>
        <a className={styles.addLink} href={accessoryNewPathOf(locale)}>
          {translate("priceDashboard.accessories.addAction")}
        </a>
      </div>
      <ItemDeskNotice desk={availability} />
      <ColumnHeads />
      <ul
        className={styles.rows}
        aria-label={translate("priceDashboard.accessories.tableLabel")}
      >
        {derivation.accessories.map((facts) => (
          <AccessoryRow
            key={facts.accessoryId}
            locale={locale}
            facts={facts}
            cabinetNames={cabinetNames}
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

/**
 * The desktop's column titles. Each row's cells say what they are in their own words, so the titles are for the eye.
 */
function ColumnHeads() {
  const translate = useTranslations();
  return (
    <div className={styles.columns} aria-hidden="true">
      <span>{translate("priceDashboard.accessories.columnAccessory")}</span>
      <span>{translate("priceDashboard.accessories.columnAddedTo")}</span>
      <span>{translate("priceDashboard.accessories.columnPrice")}</span>
      <span>{translate("priceDashboard.accessories.columnState")}</span>
      <span />
    </div>
  );
}

function AccessoryRow({
  locale,
  facts,
  cabinetNames,
  context,
  desk,
}: {
  readonly locale: AppLocale;
  readonly facts: AccessoryFacts;
  readonly cabinetNames: Readonly<Record<string, string>>;
  readonly context: LifecycleContext;
  readonly desk: AccessoryDesk;
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
  const href = accessoryPathOf(locale, facts.accessoryId);
  const { activePerUnitMinor, pendingPerUnitMinor } = facts;
  const isChanged =
    activePerUnitMinor !== undefined &&
    activePerUnitMinor !== pendingPerUnitMinor;
  return (
    <li
      className={styles.row}
      data-modified={facts.isModified}
      data-accessory-id={facts.accessoryId}
      data-testid="accessory-row"
    >
      <div className={styles.rowName}>
        <a
          id={nameId}
          className={styles.name}
          href={href}
          data-testid="accessory-link"
        >
          {name}
        </a>
        {description === "" ? null : (
          <span className={styles.description}>{description}</span>
        )}
        {facts.isDeletionPending ? (
          <span className={styles.description}>
            {translate("priceDashboard.accessories.deleteNotice")}
          </span>
        ) : null}
      </div>
      <ul className={styles.cells}>
        <li className={styles.cell} data-testid="accessory-earning">
          <span className={styles.cellLabel}>
            {translate("priceDashboard.accessories.columnAddedTo")}
          </span>
          <span className={styles.cellText}>
            {earningWords({
              translate,
              earning: facts.earning,
              cabinetNames,
            })}
          </span>
        </li>
        <li className={styles.cell} data-testid="accessory-price">
          <span className={styles.cellLabel}>
            {translate("priceDashboard.accessories.columnPrice")}
          </span>
          <span className={styles.cellValue}>
            {priceWords(translate, pendingPerUnitMinor)}
          </span>
          {isChanged ? (
            <span className={styles.cellNote}>
              {activePriceWords(translate, activePerUnitMinor)}
            </span>
          ) : null}
        </li>
      </ul>
      <AccessoryChips facts={facts} context={context} />
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

function RowMenu({
  facts,
  name,
  context,
  desk,
}: {
  readonly facts: AccessoryFacts;
  readonly name: string;
  readonly context: LifecycleContext;
  readonly desk: AccessoryDesk;
}) {
  const translate = useTranslations();
  const { availability } = desk;
  const item = accessoryItemOf(facts);
  const { switchReason, deleteReason } = accessoryReasonsOf({
    translate,
    facts,
    context,
  });
  return (
    <ItemRowMenu
      name={name}
      isAsking={availability.flow.kind !== "closed"}
      classes={MENU_CLASSES}
      entries={lifecycleEntriesOf({
        translate,
        isOn: isItemOn(item, context),
        switchReason,
        deleteReason,
        onSwitch: () => {
          availability.requestSwitch(item);
        },
        onDelete: () => {
          availability.requestDeletion(item);
        },
      })}
    />
  );
}
