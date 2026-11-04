"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";

import type { AppLocale } from "@/i18n/routing";
import { useContent } from "@/i18n/use-content";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { pendingPriceCountOf } from "./cabinet-list-model";
import { ItemDeskNotice, ItemDialogs } from "./item-dialogs";
import { isItemOn } from "./item-lifecycle-model";
import { ItemLifecycleSection } from "./item-edit-parts";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
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
  isStillUsed,
  managedColourWords,
  MaterialChips,
  materialReasonsOf,
  surchargeWords,
} from "./material-parts";
import { materialsPathOf } from "./material-paths";
import { ItemUnavailableScreen } from "./catalog-states";
import styles from "./material.module.css";
import type { PriceDraftClient } from "./price-draft-client";
import editStyles from "./price-edit.module.css";
import {
  materialPercentRefusalWords,
  materialWriteFailureWords,
} from "./price-input-words";
import { PriceSaveBar } from "./price-save-bar";
import { PERCENT_UNIT, PriceUnitField } from "./price-unit-field";
import { useFocusAfterCancel } from "./use-focus-after-cancel";
import { useMaterialDesk, type MaterialDesk } from "./use-material-desk";
import {
  useMaterialSurchargeEditing,
  type MaterialSurchargeEditing,
} from "./use-material-surcharge-editing";

// One material (frame D5B): its words, whether customers may choose it, its surcharge over PAL with an example, and its
// deletion. The surcharge is sent to "De publicat" only on Save; whether the material is on applies at once, through
// the dialogs, and never joins the draft.

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
  const reasons = materialReasonsOf({
    translate,
    facts,
    context: availability.context,
  });
  const usedBy = desk.usage.get(facts.tierId);
  return (
    <ItemLifecycleSection
      availability={availability}
      item={item}
      reasons={reasons}
      words={{
        activeLabel: translate("priceDashboard.materials.activeLabel"),
        activeNote: translate("priceDashboard.materials.activeHint"),
        deleteHeading: translate("priceDashboard.materials.deleteHeading"),
        deleteHint: translate("priceDashboard.materials.deleteHint"),
        deleteAction: translate("priceDashboard.materials.deleteAction"),
      }}
      aboveSwitch={
        isItemOn(item, availability.context) ? null : (
          <InactiveBanner
            usedBy={usedBy}
            canActivate={reasons.switchReason === undefined}
            onActivate={() => {
              availability.requestSwitch(item);
            }}
          />
        )
      }
      belowSwitch={<MaterialFactLines facts={facts} usedBy={usedBy} />}
    />
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
  const colours = managedColourWords(translate, facts.colours);
  if (colours === undefined && usedBy === undefined) return null;
  return (
    <dl className={styles.facts}>
      {colours === undefined ? null : (
        <div className={styles.fact}>
          <dt className={styles.factLabel}>
            {translate("priceDashboard.materials.coloursLabel")}
          </dt>
          <dd className={styles.factValue}>{colours}</dd>
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
  return (
    <>
      <h2 className={styles.cardTitle}>
        {translate("priceDashboard.materials.surchargeHeading")}
      </h2>
      {facts.isReference ? (
        <>
          <p className={styles.intro}>
            {translate("priceDashboard.materials.referenceNote")}
          </p>
          <p className={styles.hint}>
            {translate("priceDashboard.materials.referenceRow")}
          </p>
        </>
      ) : (
        <SurchargeEditor
          locale={locale}
          facts={facts}
          derivation={derivation}
          editing={editing}
        />
      )}
    </>
  );
}

function SurchargeEditor({
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
  const mustFix = editing.reading.kind === "refused";
  const percent =
    editing.reading.kind === "percent"
      ? editing.reading.percent
      : facts.pendingPercent;
  return (
    <>
      <p className={styles.intro}>
        {translate("priceDashboard.materials.surchargeHint")}
      </p>
      <div ref={fieldsRef} tabIndex={-1} className={styles.fields}>
        <SurchargeField facts={facts} editing={editing} />
      </div>
      <PriceSaveBar
        locale={locale}
        feedback={editing.feedback}
        isChanged={editing.isChanged}
        canSave={editing.canSave}
        mustFix={mustFix}
        onSave={() => {
          void editing.save();
        }}
        onCancel={cancel}
      />
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
