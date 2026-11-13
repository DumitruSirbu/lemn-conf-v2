"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import type { AppLocale } from "@/i18n/routing";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import styles from "./cabinet-detail.module.css";
import type { CabinetDetailFacts } from "./cabinet-detail-facts";
import { deriveCabinetDetail } from "./cabinet-detail-model";
import { CabinetAbout } from "./cabinet-dimensions";
import { CabinetHardwareReadout } from "./cabinet-hardware-readout";
import { CabinetListUnavailableScreen } from "./cabinet-list";
import type { CabinetListPageInput } from "./cabinet-list-facts";
import { pendingPriceCountOf } from "./cabinet-list-model";
import { cabinetsPathOf } from "./cabinet-paths";
import type { DepthPercents } from "./cabinet-preview-model";
import { CabinetPreviewSection, DepthSwitch } from "./cabinet-preview-table";
import { CabinetPriceFields } from "./cabinet-price-fields";
import { formatLei } from "./format-lei";
import type { PriceDraftClient } from "./price-draft-client";
import {
  useCabinetPriceEditing,
  type CabinetPriceEditing,
} from "./use-cabinet-price-editing";
import { usePriceDraft, type PriceDraft } from "./use-price-draft";

// One cabinet type, as the manufacturer sets its price (frames D3A to D3G; on a phone the same page stacks, D3M1 and
// D3M2). Nothing typed changes anything until Save, which sends it to "De publicat"; the page shows what the server
// stored and never what was typed.

export interface CabinetDetailEditorProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly page: CabinetListPageInput;
  readonly ruleId: string;
  /** The routes the writes go through; the fetching client when left out. */
  readonly client?: PriceDraftClient | undefined;
}

const NO_DEPTH_PERCENTS: DepthPercents = { active: 0, pending: 0 };

type ReadyDetail = Extract<
  ReturnType<typeof deriveCabinetDetail>,
  { readonly kind: "ready" }
>;

export function CabinetDetailEditor({
  locale,
  context,
  page,
  ruleId,
  client,
}: CabinetDetailEditorProps) {
  const draft = usePriceDraft({ initial: page.state, client });
  const { state } = draft;
  const detail = useMemo(
    () =>
      deriveCabinetDetail({ state, cabinetNames: page.cabinetNames }, ruleId),
    [state, page.cabinetNames, ruleId],
  );
  if (detail.kind !== "ready") {
    return <CabinetListUnavailableScreen locale={locale} context={context} />;
  }
  const shell = {
    ...context,
    pendingPriceCount: pendingPriceCountOf(state.draft),
  };
  return (
    <StaffShell locale={locale} page="cabinets" context={shell}>
      <CabinetDetail
        key={ruleId}
        locale={locale}
        ruleId={ruleId}
        detail={detail}
        draft={draft}
      />
    </StaffShell>
  );
}

function CabinetDetail({
  locale,
  ruleId,
  detail,
  draft,
}: {
  readonly locale: AppLocale;
  readonly ruleId: string;
  readonly detail: ReadyDetail;
  readonly draft: PriceDraft;
}) {
  const translate = useTranslations();
  const { facts, fields, candidate, isModified } = detail;
  const editing = useCabinetPriceEditing({ fields, candidate, ruleId, draft });
  return (
    <section className={styles.page} data-testid="cabinet-detail">
      <div className={styles.heading}>
        <a className={styles.back} href={cabinetsPathOf(locale)}>
          {translate("priceDashboard.cabinets.title")}
        </a>
        <h1 className={styles.title}>{facts.name}</h1>
      </div>
      <div className={styles.columns}>
        <CabinetAbout facts={facts} isModified={isModified} />
        <div className={styles.priceColumn}>
          <h2 className={styles.cardTitle}>
            {translate("priceDashboard.cabinet.priceHeading")}
          </h2>
          <p className={styles.intro}>
            {translate("priceDashboard.cabinet.priceIntro")}
          </p>
          <Notes facts={facts} />
          {facts.isCustomerSupplied ? (
            <CustomerSuppliedPrice facts={facts} />
          ) : (
            <SuppliedPrice
              locale={locale}
              facts={facts}
              detail={detail}
              editing={editing}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function SuppliedPrice({
  locale,
  facts,
  detail,
  editing,
}: {
  readonly locale: AppLocale;
  readonly facts: CabinetDetailFacts;
  readonly detail: ReadyDetail;
  readonly editing: CabinetPriceEditing;
}) {
  return (
    <>
      <CabinetPriceFields locale={locale} facts={facts} editing={editing} />
      <CabinetHardwareReadout
        hardware={facts.hardware}
        draftHardware={facts.draftHardware}
      />
      <CabinetPreviewSection
        facts={facts}
        books={{
          active: detail.active,
          draft: detail.candidate,
          typed: editing.pricedBook,
        }}
      />
    </>
  );
}

/** A cabinet the customer supplies has no field and no price: always zero, whatever the kitchen's depth. */
function CustomerSuppliedPrice({
  facts,
}: {
  readonly facts: CabinetDetailFacts;
}) {
  const translate = useTranslations();
  return (
    <>
      <DepthSwitch
        facts={facts}
        isDeep={false}
        depthPercents={NO_DEPTH_PERCENTS}
      />
      <div className={styles.flatPrice}>
        <span className={styles.flatPriceLabel}>
          {translate("priceDashboard.chips.customerSupplied")}
        </span>
        <span className={styles.flatPriceValue}>
          {formatLei(0, translate("priceDashboard.units.currency"))}
        </span>
      </div>
    </>
  );
}

function Notes({ facts }: { readonly facts: CabinetDetailFacts }) {
  const translate = useTranslations();
  const notes = [
    facts.isCustomerSupplied
      ? translate("priceDashboard.cabinet.customerSupplied")
      : undefined,
    facts.isHood ? translate("priceDashboard.cabinet.hoodNote") : undefined,
    facts.isStructural && !facts.isCustomerSupplied
      ? translate("priceDashboard.cabinet.structuralNote")
      : undefined,
    facts.holdsSink ? translate("priceDashboard.cabinet.sinkNote") : undefined,
  ].filter((note) => note !== undefined);
  return (
    <>
      {notes.map((note) => (
        <p key={note} className={styles.notice}>
          {note}
        </p>
      ))}
    </>
  );
}
