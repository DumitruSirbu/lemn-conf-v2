"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import type { AppLocale } from "@/i18n/routing";
import { useContent } from "@/i18n/use-content";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { pendingPriceCountOf } from "./cabinet-list-model";
import { ActionThatMayBeOff } from "./action-that-may-be-off";
import { ItemDeskNotice, ItemDialogs } from "./item-dialogs";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
import { isItemOn } from "./item-lifecycle-model";
import { MaterialExampleCard } from "./material-example-card";
import {
  materialItemOf,
  materialNameOf,
  materialOf,
  type MaterialFacts,
  type MaterialPageInput,
  type ReadyMaterials,
} from "./material-model";
import {
  colourWords,
  isStillUsed,
  MaterialChips,
  materialReasonsOf,
  MaterialUnavailableScreen,
  surchargeWords,
} from "./material-parts";
import { materialsPathOf } from "./material-paths";
import styles from "./material.module.css";
import type { PriceDraftClient } from "./price-draft-client";
import editStyles from "./price-edit.module.css";
import {
  materialPercentRefusalWords,
  materialWriteFailureWords,
} from "./price-input-words";
import { PERCENT_UNIT, PriceUnitField } from "./price-unit-field";
import { publishPathOf } from "./publish-paths";
import { useFocusAfterCancel } from "./use-focus-after-cancel";
import { useMaterialDesk, type MaterialDesk } from "./use-material-desk";
import {
  useMaterialSurchargeEditing,
  type MaterialSurchargeEditing,
} from "./use-material-surcharge-editing";

// One material (frame D5B): its words, whether customers may choose it, its surcharge over PAL with an example, and its
// deletion. The surcharge is sent to "De publicat" only on Save; whether the material is on applies at once, through the
// dialogs, and never joins the draft.

export interface MaterialEditScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly page: MaterialPageInput;
  readonly tierId: string;
  /** The routes the draft is written through; the fetching client when left out. */
  readonly client?: PriceDraftClient | undefined;
  /** Where a switch is written and the saved kitchens are counted; the page's own stand-in when left out. */
  readonly lifecycleClient?: ItemLifecycleClient | undefined;
}

export function MaterialEditScreen({
  locale,
  context,
  page,
  tierId,
  client,
  lifecycleClient,
}: MaterialEditScreenProps) {
  const desk = useMaterialDesk({
    page,
    client,
    lifecycleClient,
    ownTierId: tierId,
  });
  const { derivation } = desk;
  const facts =
    derivation.kind === "ready" ? materialOf(derivation, tierId) : undefined;
  if (derivation.kind !== "ready" || facts === undefined) {
    return <MaterialUnavailableScreen locale={locale} context={context} />;
  }
  const shell = {
    ...context,
    pendingPriceCount: pendingPriceCountOf(desk.draft.state.draft),
  };
  return (
    <StaffShell locale={locale} page="materials" context={shell}>
      <MaterialEdit
        key={tierId}
        locale={locale}
        desk={desk}
        derivation={derivation}
        facts={facts}
      />
    </StaffShell>
  );
}

function MaterialEdit({
  locale,
  desk,
  derivation,
  facts,
}: {
  readonly locale: AppLocale;
  readonly desk: MaterialDesk;
  readonly derivation: ReadyMaterials;
  readonly facts: MaterialFacts;
}) {
  const translate = useTranslations();
  const content = useContent();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { availability } = desk;
  const name = content.bookText(facts.name.authored, facts.name.key);
  const editing = useMaterialSurchargeEditing({
    tierId: facts.tierId,
    activePercent: facts.activePercent,
    pendingPercent: facts.pendingPercent,
    draft: desk.draft,
  });
  return (
    <section className={styles.page} data-testid="material-edit">
      <div className={styles.heading}>
        <a className={styles.back} href={materialsPathOf(locale)}>
          {translate("priceDashboard.materials.title")}
        </a>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {name}
        </h1>
        <MaterialChips
          facts={facts}
          context={availability.context}
          usedBy={desk.usage.get(facts.tierId)}
        />
      </div>
      <ItemDeskNotice desk={availability} />
      <div className={styles.editColumns}>
        <div className={styles.editColumn}>
          <MaterialWords facts={facts} name={name} />
          {facts.isDeletionPending ? (
            <p className={styles.notice} role="status">
              {translate("priceDashboard.materials.deleteNotice")}
            </p>
          ) : (
            <Lifecycle facts={facts} desk={desk} />
          )}
        </div>
        {facts.isDeletionPending ? null : (
          <div className={styles.editColumn}>
            <Surcharge
              locale={locale}
              facts={facts}
              derivation={derivation}
              editing={editing}
            />
          </div>
        )}
      </div>
      <ItemDialogs
        desk={availability}
        nameOf={(item) => materialNameOf(derivation, content.bookText, item)}
        returnFocusFallbackRef={headingRef}
      />
    </section>
  );
}

/** The material's name and description. A material's are the catalogue's, so this page edits neither. */
function MaterialWords({
  facts,
  name,
}: {
  readonly facts: MaterialFacts;
  readonly name: string;
}) {
  const translate = useTranslations();
  const content = useContent();
  const description = content.bookText(
    facts.description.authored,
    facts.description.key,
  );
  return (
    <>
      <div className={styles.words}>
        <span className={styles.wordsLabel}>
          {translate("priceDashboard.materials.nameLabel")}
        </span>
        <span className={styles.wordsValue}>{name}</span>
      </div>
      <div className={styles.words}>
        <span className={styles.wordsLabel}>
          {translate("priceDashboard.materials.descriptionLabel")}
        </span>
        <span className={styles.wordsValue}>{description}</span>
      </div>
      <p className={styles.hint}>
        {translate("priceDashboard.common.keyedTextNote")}
      </p>
    </>
  );
}

/** Whether customers may choose the material, what it offers and how many saved kitchens use it, and its deletion. */
function Lifecycle({
  facts,
  desk,
}: {
  readonly facts: MaterialFacts;
  readonly desk: MaterialDesk;
}) {
  const translate = useTranslations();
  const { availability } = desk;
  const item = materialItemOf(facts);
  const { switchReason, deleteReason } = materialReasonsOf({
    translate,
    facts,
    context: availability.context,
  });
  const isOn = isItemOn(item, availability.context);
  const usedBy = desk.usage.get(facts.tierId);
  return (
    <>
      {isOn ? null : (
        <InactiveBanner
          usedBy={usedBy}
          canActivate={switchReason === undefined}
          onActivate={() => {
            availability.requestSwitch(item);
          }}
        />
      )}
      <ActionThatMayBeOff
        reason={switchReason}
        restingNote={translate("priceDashboard.materials.activeHint")}
        switchState={isOn}
        buttonClassName={styles.switch}
        noteClassName={styles.hint}
        noteTag="p"
        onPress={() => {
          availability.requestSwitch(item);
        }}
      >
        <span>{translate("priceDashboard.materials.activeLabel")}</span>
        <span className={styles.switchState}>
          {translate(
            isOn
              ? "priceDashboard.chips.active"
              : "priceDashboard.chips.inactive",
          )}
        </span>
      </ActionThatMayBeOff>
      <MaterialFactLines facts={facts} usedBy={usedBy} />
      <div className={styles.danger}>
        <h2 className={styles.cardTitle}>
          {translate("priceDashboard.materials.deleteHeading")}
        </h2>
        <p className={styles.hint}>
          {translate("priceDashboard.materials.deleteHint")}
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
          {translate("priceDashboard.materials.deleteAction")}
        </ActionThatMayBeOff>
      </div>
    </>
  );
}

/** A switched-off material says so, and what that does to the saved kitchens that still use it; the count is told only
 *  where one was had. */
function InactiveBanner({
  usedBy,
  canActivate,
  onActivate,
}: {
  readonly usedBy: number | undefined;
  readonly canActivate: boolean;
  readonly onActivate: () => void;
}) {
  const translate = useTranslations();
  const isUsed = isStillUsed(usedBy);
  return (
    <div className={styles.banner} data-testid="material-banner">
      {isUsed ? (
        <p className={styles.bannerTitle}>
          {translate("priceDashboard.chips.inactiveInUse", { count: usedBy })}
        </p>
      ) : null}
      <p className={styles.bannerBody}>
        {translate(
          isUsed
            ? "priceDashboard.materials.inactiveBanner"
            : "priceDashboard.materials.inactiveBannerPlain",
        )}
      </p>
      {canActivate ? (
        <button
          type="button"
          className={editStyles.action}
          data-tone="primary"
          onClick={onActivate}
        >
          {translate("priceDashboard.common.activate")}
        </button>
      ) : null}
    </div>
  );
}

/** What the material offers as colours and how many saved kitchens use it, each only where it is known. */
function MaterialFactLines({
  facts,
  usedBy,
}: {
  readonly facts: MaterialFacts;
  readonly usedBy: number | undefined;
}) {
  const translate = useTranslations();
  const colours = colourWords(translate, facts.colours);
  if (colours === undefined && usedBy === undefined) return null;
  return (
    <dl className={styles.facts}>
      {colours === undefined ? null : (
        <div className={styles.fact}>
          <dt className={styles.factLabel}>
            {translate("priceDashboard.materials.coloursLabel")}
          </dt>
          <dd className={styles.factValue}>
            {facts.colours.kind === "count"
              ? translate("priceDashboard.materials.coloursManaged", {
                  count: facts.colours.count,
                })
              : translate("priceDashboard.materials.colourPickerManaged")}
          </dd>
        </div>
      )}
      {usedBy === undefined ? null : (
        <div className={styles.fact}>
          <dt className={styles.factLabel}>
            {translate("priceDashboard.materials.usedInKitchens")}
          </dt>
          <dd className={styles.factValue}>{String(usedBy)}</dd>
        </div>
      )}
    </dl>
  );
}

/** The surcharge over PAL, and what it makes of one cabinet. PAL is the reference and has none to change. */
function Surcharge({
  locale,
  facts,
  derivation,
  editing,
}: {
  readonly locale: AppLocale;
  readonly facts: MaterialFacts;
  readonly derivation: ReadyMaterials;
  readonly editing: MaterialSurchargeEditing;
}) {
  const translate = useTranslations();
  const fieldsRef = useRef<HTMLDivElement>(null);
  const cancel = useFocusAfterCancel(editing.cancel, fieldsRef);
  if (facts.isReference) {
    return (
      <>
        <h2 className={styles.cardTitle}>
          {translate("priceDashboard.materials.surchargeHeading")}
        </h2>
        <p className={styles.intro}>
          {translate("priceDashboard.materials.referenceNote")}
        </p>
        <p className={styles.hint}>
          {translate("priceDashboard.materials.referenceRow")}
        </p>
      </>
    );
  }
  const percent =
    editing.reading.kind === "percent"
      ? editing.reading.percent
      : facts.pendingPercent;
  return (
    <>
      <h2 className={styles.cardTitle}>
        {translate("priceDashboard.materials.surchargeHeading")}
      </h2>
      <p className={styles.intro}>
        {translate("priceDashboard.materials.surchargeHint")}
      </p>
      <div ref={fieldsRef} tabIndex={-1} className={styles.fields}>
        <SurchargeField facts={facts} editing={editing} />
      </div>
      <SaveBar locale={locale} editing={editing} onCancel={cancel} />
      <MaterialExampleCard
        active={derivation.active}
        draft={derivation.candidate}
        facts={facts}
        percent={percent}
      />
    </>
  );
}

function SurchargeField({
  facts,
  editing,
}: {
  readonly facts: MaterialFacts;
  readonly editing: MaterialSurchargeEditing;
}) {
  const translate = useTranslations();
  const { reading, feedback } = editing;
  const error =
    reading.kind === "refused"
      ? materialPercentRefusalWords(translate, reading.refusal)
      : feedback.kind === "failed"
        ? materialWriteFailureWords(translate, feedback.failure)
        : undefined;
  return (
    <PriceUnitField
      label={translate("priceDashboard.materials.columnSurcharge")}
      unit={PERCENT_UNIT}
      inputMode="numeric"
      value={editing.text}
      hint={translate("priceDashboard.common.activeValue", {
        amount: surchargeWords(translate, facts.activePercent),
      })}
      error={error}
      isPending={
        facts.pendingPercent !== facts.activePercent || editing.isChanged
      }
      onChange={editing.type}
    />
  );
}

function SaveBar({
  locale,
  editing,
  onCancel,
}: {
  readonly locale: AppLocale;
  readonly editing: MaterialSurchargeEditing;
  readonly onCancel: () => void;
}) {
  const translate = useTranslations();
  const savedNoticeRef = useRef<HTMLDivElement>(null);
  const isSaved = editing.feedback.kind === "saved" && !editing.isChanged;
  const mustFix = editing.reading.kind === "refused";
  useEffect(() => {
    // Save leaves the page with the notice that replaces it; focus lost with it goes to the notice, not the body.
    if (isSaved && document.activeElement === document.body) {
      savedNoticeRef.current?.focus();
    }
  }, [isSaved]);
  if (isSaved) {
    return (
      <div
        ref={savedNoticeRef}
        tabIndex={-1}
        className={styles.saved}
        role="status"
      >
        <p>{translate("priceDashboard.common.priceSavedNotice")}</p>
        <a className={styles.savedLink} href={publishPathOf(locale)}>
          {translate("priceDashboard.nav.publish")}
        </a>
      </div>
    );
  }
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={editStyles.action}
        data-tone="primary"
        disabled={!editing.canSave}
        onClick={() => {
          void editing.save();
        }}
      >
        {translate("priceDashboard.common.save")}
      </button>
      {editing.isChanged || mustFix || editing.feedback.kind === "failed" ? (
        <button type="button" className={editStyles.action} onClick={onCancel}>
          {translate("priceDashboard.common.cancel")}
        </button>
      ) : null}
      {mustFix ? (
        <p className={styles.fixToSave}>
          {translate("priceDashboard.errors.fixToSave")}
        </p>
      ) : null}
    </div>
  );
}
