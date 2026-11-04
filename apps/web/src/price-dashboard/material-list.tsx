"use client";

import { useTranslations } from "next-intl";
import { useId, useRef } from "react";

import type { ItemRef } from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useContent } from "@/i18n/use-content";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { pendingPriceCountOf } from "./cabinet-list-model";
import { ItemDeskNotice, ItemDialogs } from "./item-dialogs";
import {
  ItemRowMenu,
  lifecycleEntriesOf,
  menuClassesOf,
} from "./item-row-menu";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
import { isItemOn, type LifecycleContext } from "./item-lifecycle-model";
import {
  materialItemOf,
  materialNameOf,
  type MaterialFacts,
  type MaterialPageInput,
  type ReadyMaterials,
} from "./material-model";
import {
  colourWords,
  isStillUsed,
  MaterialChips,
  materialReasonsOf,
  surchargeWords,
} from "./material-parts";
import { materialPathOf } from "./material-paths";
import { ItemUnavailableScreen } from "./catalog-states";
import styles from "./material.module.css";
import type { PriceDraftClient } from "./price-draft-client";
import { useMaterialDesk, type MaterialDesk } from "./use-material-desk";

// The materials the customer chooses from (frames D5A, D5E and D5D): one row each, with its surcharge over PAL, its
// colours, its state and the actions "⋯" opens. A surcharge is changed on the material's own page, so a card never
// holds a field. Disabling and enabling apply at once and are asked of the dialogs; deleting waits for publication.

const MENU_CLASSES = menuClassesOf(styles);

export interface MaterialListScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly page: MaterialPageInput;
  /** The routes the draft is written through; the fetching client when left out. */
  readonly client?: PriceDraftClient | undefined;
  /** Where a switch is written and the saved kitchens are counted; the page's own stand-in when left out. */
  readonly lifecycleClient?: ItemLifecycleClient | undefined;
}

export function MaterialListScreen({
  locale,
  context,
  page,
  client,
  lifecycleClient,
}: MaterialListScreenProps) {
  const desk = useMaterialDesk({ page, client, lifecycleClient });
  const { derivation } = desk;
  if (derivation.kind === "unreadable") {
    return (
      <ItemUnavailableScreen
        locale={locale}
        context={context}
        page="materials"
      />
    );
  }
  const shell = {
    ...context,
    pendingPriceCount: pendingPriceCountOf(desk.draft.state.draft),
  };
  return (
    <StaffShell locale={locale} page="materials" context={shell}>
      <MaterialList locale={locale} desk={desk} derivation={derivation} />
    </StaffShell>
  );
}

function MaterialList({
  locale,
  desk,
  derivation,
}: {
  readonly locale: AppLocale;
  readonly desk: MaterialDesk;
  readonly derivation: ReadyMaterials;
}) {
  const translate = useTranslations();
  const content = useContent();
  const { availability } = desk;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameOf = (item: ItemRef) =>
    materialNameOf(derivation, content.bookText, item);
  return (
    <section className={styles.page} data-testid="material-list">
      <div className={styles.heading}>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {translate("priceDashboard.materials.title")}
        </h1>
        <p className={styles.subtitle}>
          {translate("priceDashboard.materials.subtitle")}
        </p>
        <p className={styles.subtitle}>
          {translate("priceDashboard.materials.referenceNote")}
        </p>
      </div>
      <ItemDeskNotice desk={availability} />
      <ColumnHeads />
      <ul
        className={styles.rows}
        aria-label={translate("priceDashboard.materials.tableLabel")}
      >
        {derivation.materials.map((facts) => (
          <MaterialRow
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

/**
 * The desktop's column titles. Each row's cells say what they are in their own words, so the titles are for the eye.
 */
function ColumnHeads() {
  const translate = useTranslations();
  return (
    <div className={styles.columns} aria-hidden="true">
      <span>{translate("priceDashboard.materials.columnMaterial")}</span>
      <span>{translate("priceDashboard.materials.columnSurcharge")}</span>
      <span>{translate("priceDashboard.materials.columnColours")}</span>
      <span>{translate("priceDashboard.materials.columnState")}</span>
      <span />
    </div>
  );
}

function MaterialRow({
  locale,
  facts,
  context,
  desk,
}: {
  readonly locale: AppLocale;
  readonly facts: MaterialFacts;
  readonly context: LifecycleContext;
  readonly desk: MaterialDesk;
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
  const href = materialPathOf(locale, facts.tierId);
  const usedBy = desk.usage.get(facts.tierId);
  const isOff = !isItemOn(materialItemOf(facts), context);
  return (
    <li
      className={styles.row}
      data-modified={facts.isModified}
      data-tier-id={facts.tierId}
      data-testid="material-row"
    >
      <div className={styles.rowName}>
        <a
          id={nameId}
          className={styles.name}
          href={href}
          data-testid="material-link"
        >
          {name}
        </a>
        {description === "" ? null : (
          <span className={styles.description}>{description}</span>
        )}
        {isOff && isStillUsed(usedBy) ? (
          <span className={styles.description}>
            {translate("priceDashboard.materials.usageDrift")}
          </span>
        ) : null}
        {facts.isDeletionPending ? (
          <span className={styles.description}>
            {translate("priceDashboard.materials.deleteNotice")}
          </span>
        ) : null}
      </div>
      <ul className={styles.cells}>
        <SurchargeCell facts={facts} translate={translate} />
        <ColoursCell facts={facts} translate={translate} />
      </ul>
      <MaterialChips facts={facts} context={context} usedBy={usedBy} />
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

function SurchargeCell({
  facts,
  translate,
}: {
  readonly facts: MaterialFacts;
  readonly translate: ContentTranslator;
}) {
  const { activePercent, pendingPercent, isReference } = facts;
  const isChanged = activePercent !== pendingPercent;
  return (
    <li
      className={styles.cell}
      data-testid="material-surcharge"
      data-tier-id={facts.tierId}
    >
      <span className={styles.cellLabel}>
        {translate("priceDashboard.materials.columnSurcharge")}
      </span>
      <span className={styles.cellValue}>
        {surchargeWords(translate, pendingPercent)}
      </span>
      {isChanged ? (
        <span className={styles.cellNote}>
          {translate("priceDashboard.common.activeThenPending", {
            active: surchargeWords(translate, activePercent),
          })}
        </span>
      ) : null}
      {isReference ? (
        <span className={styles.cellNote}>
          {translate("priceDashboard.materials.referenceRow")}
        </span>
      ) : null}
    </li>
  );
}

function ColoursCell({
  facts,
  translate,
}: {
  readonly facts: MaterialFacts;
  readonly translate: ContentTranslator;
}) {
  const words = colourWords(translate, facts.colours);
  return (
    <li className={styles.cell} data-testid="material-colours">
      <span className={styles.cellLabel}>
        {translate("priceDashboard.materials.columnColours")}
      </span>
      {words === undefined ? null : (
        <span className={styles.cellValue}>{words}</span>
      )}
    </li>
  );
}

function RowMenu({
  facts,
  name,
  context,
  desk,
}: {
  readonly facts: MaterialFacts;
  readonly name: string;
  readonly context: LifecycleContext;
  readonly desk: MaterialDesk;
}) {
  const translate = useTranslations();
  const { availability } = desk;
  const item = materialItemOf(facts);
  const { switchReason, deleteReason } = materialReasonsOf({
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
