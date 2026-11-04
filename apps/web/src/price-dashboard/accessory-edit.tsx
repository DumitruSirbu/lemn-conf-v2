"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import type { AppLocale } from "@/i18n/routing";
import { useContent } from "@/i18n/use-content";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { ActionThatMayBeOff } from "./action-that-may-be-off";
import {
  accessoryItemOf,
  accessoryOf,
  type AccessoryFacts,
  type AccessoryPageInput,
  type ReadyAccessories,
} from "./accessory-model";
import { accessoryNameOf } from "./accessory-names";
import {
  AccessoryChips,
  accessoryReasonsOf,
  AccessoryUnavailableScreen,
  earningWords,
} from "./accessory-parts";
import { accessoriesPathOf } from "./accessory-paths";
import styles from "./accessory.module.css";
import { pendingPriceCountOf } from "./cabinet-list-model";
import { CreatedNameField } from "./created-name-field";
import { formatLei } from "./format-lei";
import { ItemDeskNotice, ItemDialogs } from "./item-dialogs";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
import { isItemOn } from "./item-lifecycle-model";
import type { PriceDraftClient } from "./price-draft-client";
import editStyles from "./price-edit.module.css";
import { leiRefusalWords, saveFailureWords } from "./price-input-words";
import { PriceSaveBar } from "./price-save-bar";
import { PriceUnitField } from "./price-unit-field";
import { useAccessoryDesk, type AccessoryDesk } from "./use-accessory-desk";
import {
  useAccessoryPriceEditing,
  type AccessoryPriceEditing,
} from "./use-accessory-price-editing";
import { useCreatedRowNameEditing } from "./use-created-row-name-editing";
import { useFocusAfterCancel } from "./use-focus-after-cancel";

// One accessory (frame D6B): its words, the rule that adds it, whether it is on, its price per unit and its deletion. The
// price is sent to "De publicat" only on Save; whether the accessory is on applies at once, through the dialogs, and never
// joins the draft. The words and the rule of a built-in accessory are the catalogue's and read-only; a created one's name
// is authored Romanian and can be reworded here.

export interface AccessoryEditScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly page: AccessoryPageInput;
  readonly accessoryId: string;
  /** The routes the draft is written through; the fetching client when left out. */
  readonly client?: PriceDraftClient | undefined;
  /** Where a switch is written and the saved kitchens are counted; the page's own stand-in when left out. */
  readonly lifecycleClient?: ItemLifecycleClient | undefined;
}

export function AccessoryEditScreen({
  locale,
  context,
  page,
  accessoryId,
  client,
  lifecycleClient,
}: AccessoryEditScreenProps) {
  const desk = useAccessoryDesk({ page, client, lifecycleClient });
  const { derivation } = desk;
  if (derivation.kind !== "ready") {
    return <AccessoryUnavailableScreen locale={locale} context={context} />;
  }
  const shell = {
    ...context,
    pendingPriceCount: pendingPriceCountOf(desk.draft.state.draft),
  };
  const facts = accessoryOf(derivation, accessoryId);
  if (facts === undefined) {
    return (
      <StaffShell locale={locale} page="accessories" context={shell}>
        <AccessoryRemoved locale={locale} />
      </StaffShell>
    );
  }
  return (
    <StaffShell locale={locale} page="accessories" context={shell}>
      <AccessoryEdit
        key={accessoryId}
        locale={locale}
        desk={desk}
        derivation={derivation}
        facts={facts}
        cabinetNames={page.cabinetNames}
      />
    </StaffShell>
  );
}

/** The accessory is no longer in the draft: it was created there and has just been deleted, so nothing is left to publish. */
function AccessoryRemoved({ locale }: { readonly locale: AppLocale }) {
  const translate = useTranslations();
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    noticeRef.current?.focus();
  }, []);
  return (
    <section className={styles.page} data-testid="accessory-removed">
      <a className={styles.back} href={accessoriesPathOf(locale)}>
        {translate("priceDashboard.accessories.title")}
      </a>
      <p ref={noticeRef} tabIndex={-1} className={styles.notice} role="status">
        {translate("priceDashboard.accessories.createdRemoved")}
      </p>
    </section>
  );
}

function AccessoryEdit({
  locale,
  desk,
  derivation,
  facts,
  cabinetNames,
}: {
  readonly locale: AppLocale;
  readonly desk: AccessoryDesk;
  readonly derivation: ReadyAccessories;
  readonly facts: AccessoryFacts;
  readonly cabinetNames: Readonly<Record<string, string>>;
}) {
  const translate = useTranslations();
  const content = useContent();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { availability } = desk;
  const name = content.bookText(facts.name.authored, facts.name.key);
  const editing = useAccessoryPriceEditing({
    accessoryId: facts.accessoryId,
    activeMinor: facts.activePerUnitMinor,
    pendingMinor: facts.pendingPerUnitMinor,
    draft: desk.draft,
  });
  return (
    <section className={styles.page} data-testid="accessory-edit">
      <div className={styles.heading}>
        <a className={styles.back} href={accessoriesPathOf(locale)}>
          {translate("priceDashboard.accessories.title")}
        </a>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {name}
        </h1>
        <AccessoryChips facts={facts} context={availability.context} />
      </div>
      <ItemDeskNotice desk={availability} />
      <div className={styles.editColumns}>
        <div className={styles.editColumn}>
          <AccessoryWords
            facts={facts}
            name={name}
            cabinetNames={cabinetNames}
            desk={desk}
          />
          {facts.isDeletionPending ? (
            <p className={styles.notice} role="status">
              {translate("priceDashboard.accessories.deleteNotice")}
            </p>
          ) : (
            <Lifecycle facts={facts} desk={desk} />
          )}
        </div>
        {facts.isDeletionPending ? null : (
          <div className={styles.editColumn}>
            <PriceEditor locale={locale} editing={editing} facts={facts} />
          </div>
        )}
      </div>
      <ItemDialogs
        desk={availability}
        nameOf={(item) => accessoryNameOf(derivation, content.bookText, item)}
        returnFocusFallbackRef={headingRef}
      />
    </section>
  );
}

/** The accessory's name and description, and the rule that adds it. A built-in's words are the catalogue's and read-only;
 *  a created one's name is authored Romanian that can be reworded here, its description is shown only. */
function AccessoryWords({
  facts,
  name,
  cabinetNames,
  desk,
}: {
  readonly facts: AccessoryFacts;
  readonly name: string;
  readonly cabinetNames: Readonly<Record<string, string>>;
  readonly desk: AccessoryDesk;
}) {
  const translate = useTranslations();
  const content = useContent();
  const renaming = useCreatedRowNameEditing({
    item: accessoryItemOf(facts),
    currentName: facts.name.authored,
    publishedName: facts.activeName,
    draft: desk.draft,
  });
  const description = content.bookText(
    facts.description.authored,
    facts.description.key,
  );
  const canRename = !facts.isBuiltIn && !facts.isDeletionPending;
  return (
    <>
      {canRename ? (
        <CreatedNameField
          renaming={renaming}
          nameLabel={translate("priceDashboard.accessories.nameLabel")}
          renameLabel={translate("priceDashboard.accessories.renameAction")}
        />
      ) : (
        <div className={styles.words}>
          <span className={styles.wordsLabel}>
            {translate("priceDashboard.accessories.nameLabel")}
          </span>
          <span className={styles.wordsValue}>{name}</span>
        </div>
      )}
      {description === "" ? null : (
        <div className={styles.words}>
          <span className={styles.wordsLabel}>
            {translate("priceDashboard.accessories.descriptionLabel")}
          </span>
          <span className={styles.wordsValue}>{description}</span>
        </div>
      )}
      <div className={styles.words} data-testid="accessory-earning">
        <span className={styles.wordsLabel}>
          {translate("priceDashboard.accessories.linkLabel")}
        </span>
        <span className={styles.wordsValue}>
          {earningWords({ translate, earning: facts.earning, cabinetNames })}
        </span>
      </div>
      <p className={styles.hint}>
        {translate(
          facts.isBuiltIn
            ? "priceDashboard.accessories.builtInNote"
            : "priceDashboard.accessories.linkFixedNote",
        )}
      </p>
      {facts.isBuiltIn ? null : (
        <p className={styles.hint}>
          {translate("priceDashboard.common.createdTextNote")}
        </p>
      )}
    </>
  );
}

/** Whether customers are given the accessory, and its deletion. */
function Lifecycle({
  facts,
  desk,
}: {
  readonly facts: AccessoryFacts;
  readonly desk: AccessoryDesk;
}) {
  const translate = useTranslations();
  const { availability } = desk;
  const item = accessoryItemOf(facts);
  const { switchReason, deleteReason } = accessoryReasonsOf({
    translate,
    facts,
    context: availability.context,
  });
  const isOn = isItemOn(item, availability.context);
  return (
    <>
      <ActionThatMayBeOff
        reason={switchReason}
        restingNote={translate(
          facts.isCreated
            ? "priceDashboard.accessories.activeHintNew"
            : "priceDashboard.accessories.activeHint",
        )}
        switchState={isOn}
        buttonClassName={styles.switch}
        noteClassName={styles.hint}
        noteTag="p"
        onPress={() => {
          availability.requestSwitch(item);
        }}
      >
        <span>{translate("priceDashboard.accessories.activeLabel")}</span>
        <span className={styles.switchState}>
          {translate(
            isOn
              ? "priceDashboard.chips.active"
              : "priceDashboard.chips.inactive",
          )}
        </span>
      </ActionThatMayBeOff>
      <div className={styles.danger}>
        <h2 className={styles.cardTitle}>
          {translate("priceDashboard.accessories.deleteHeading")}
        </h2>
        <p className={styles.hint}>
          {translate("priceDashboard.accessories.deleteHint")}
        </p>
        <ActionThatMayBeOff
          reason={deleteReason}
          buttonClassName={editStyles.action}
          noteClassName={styles.hint}
          noteTag="p"
          onPress={() => {
            availability.requestDeletion(item);
          }}
        >
          {translate("priceDashboard.accessories.deleteAction")}
        </ActionThatMayBeOff>
      </div>
    </>
  );
}

function PriceEditor({
  locale,
  editing,
  facts,
}: {
  readonly locale: AppLocale;
  readonly editing: AccessoryPriceEditing;
  readonly facts: AccessoryFacts;
}) {
  const translate = useTranslations();
  const fieldsRef = useRef<HTMLDivElement>(null);
  const cancel = useFocusAfterCancel(editing.cancel, fieldsRef);
  const mustFix = editing.reading.kind === "refused";
  return (
    <>
      <h2 className={styles.cardTitle}>
        {translate("priceDashboard.accessories.priceHeading")}
      </h2>
      <p className={styles.intro}>
        {translate("priceDashboard.accessories.priceHint")}
      </p>
      <div ref={fieldsRef} tabIndex={-1} className={styles.fields}>
        <PriceField facts={facts} editing={editing} />
      </div>
      <PriceSaveBar
        locale={locale}
        isSaved={editing.feedback.kind === "saved" && !editing.isChanged}
        canSave={editing.canSave}
        mustFix={mustFix}
        canCancel={
          editing.isChanged || mustFix || editing.feedback.kind === "failed"
        }
        onSave={() => {
          void editing.save();
        }}
        onCancel={cancel}
      />
    </>
  );
}

function PriceField({
  facts,
  editing,
}: {
  readonly facts: AccessoryFacts;
  readonly editing: AccessoryPriceEditing;
}) {
  const translate = useTranslations();
  const { activePerUnitMinor, pendingPerUnitMinor } = facts;
  const { reading, feedback } = editing;
  const error =
    reading.kind === "refused"
      ? leiRefusalWords(translate, reading.refusal)
      : feedback.kind === "failed"
        ? saveFailureWords(translate, feedback)
        : undefined;
  const hint =
    activePerUnitMinor === undefined
      ? undefined
      : translate("priceDashboard.common.activeValue", {
          amount: formatLei(
            activePerUnitMinor,
            translate("priceDashboard.units.currency"),
          ),
        });
  return (
    <PriceUnitField
      label={translate("priceDashboard.accessories.pricePerPiece")}
      unit={translate("priceDashboard.units.currency")}
      inputMode="decimal"
      value={editing.text}
      hint={error === undefined ? hint : undefined}
      error={error}
      isPending={
        pendingPerUnitMinor !== activePerUnitMinor || editing.isChanged
      }
      onChange={editing.type}
    />
  );
}
