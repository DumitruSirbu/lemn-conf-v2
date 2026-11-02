"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import type { ContentTranslator } from "@/i18n/content";

import styles from "./cabinet-detail.module.css";
import type {
  CabinetDetailFacts,
  DetailDimensions,
  DetailDoors,
  DetailHeight,
} from "./cabinet-detail-facts";
import { findCabinetListImage } from "./cabinet-list-image";
import { GROUP_HEADING_KEYS } from "./cabinet-list-rows";

// The left column of a cabinet's page: its drawing, the dimensions the 3D model gives it, and what it carries.
// Read-only.

export function CabinetAbout({
  facts,
  isModified,
}: {
  readonly facts: CabinetDetailFacts;
  readonly isModified: boolean;
}) {
  const translate = useTranslations();
  return (
    <div className={styles.aboutColumn}>
      <CabinetHead facts={facts} isModified={isModified} />
      <Dimensions dimensions={facts.dimensions} />
      <Facts facts={facts} />
      <p className={styles.developerNote}>
        {translate("priceDashboard.cabinet.developerNote")}
      </p>
    </div>
  );
}

function CabinetHead({
  facts,
  isModified,
}: {
  readonly facts: CabinetDetailFacts;
  readonly isModified: boolean;
}) {
  const translate = useTranslations();
  const url = findCabinetListImage(
    facts.buildId,
    facts.dimensions.defaultWidth.widthMm,
  );
  return (
    <div className={styles.cabinetHead}>
      <span
        className={styles.picture}
        style={
          url === undefined ? undefined : { backgroundImage: `url("${url}")` }
        }
        aria-hidden="true"
      />
      <div className={styles.cabinetFacts}>
        <span className={styles.group}>
          {translate(GROUP_HEADING_KEYS[facts.group])}
        </span>
        <span className={styles.chips}>
          {isModified ? (
            <span className={styles.chip} data-tone="warm">
              {translate("priceDashboard.chips.pending")}
            </span>
          ) : null}
          {facts.isCustomerSupplied ? (
            <span className={styles.chip}>
              {translate("priceDashboard.chips.customerSupplied")}
            </span>
          ) : null}
          {facts.isStructural ? (
            <span className={styles.chip}>
              {translate("priceDashboard.chips.structural")}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function Dimensions({ dimensions }: { readonly dimensions: DetailDimensions }) {
  const translate = useTranslations();
  const headingId = useId();
  const { widths, height, defaultWidth } = dimensions;
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.cardHead}>
        <h2 id={headingId} className={styles.cardTitle}>
          {translate("priceDashboard.cabinet.dimensionsHeading")}
        </h2>
        <span className={styles.cardNote}>
          {translate("priceDashboard.cabinet.dimensionsNote")}
        </span>
      </div>
      <dl className={styles.dimensions}>
        <Dimension
          label={translate("priceDashboard.cabinet.defaultWidth")}
          tag={
            defaultWidth.isProposed
              ? translate("priceDashboard.cabinets.proposed")
              : undefined
          }
          hint={sourceWords(translate, defaultWidth.source)}
        >
          <Millimetres valueMm={defaultWidth.widthMm} />
        </Dimension>
        {widths.kind === "fixed" ? (
          <Dimension
            label={translate("priceDashboard.cabinet.availableWidths")}
          >
            {widths.widthsMm.map((widthMm) => (
              <span key={widthMm} className={styles.sizeChip}>
                <Millimetres valueMm={widthMm} />
              </span>
            ))}
          </Dimension>
        ) : (
          <>
            <Dimension label={translate("priceDashboard.cabinet.minWidth")}>
              <Millimetres valueMm={widths.minMm} />
            </Dimension>
            <Dimension label={translate("priceDashboard.cabinet.maxWidth")}>
              <Millimetres valueMm={widths.maxMm} />
            </Dimension>
            <Dimension label={translate("priceDashboard.cabinet.widthStep")}>
              <Millimetres valueMm={dimensions.stepMm ?? 0} />
            </Dimension>
          </>
        )}
        <HeightDimensions height={height} />
        <Dimension
          label={translate("priceDashboard.cabinet.depthInKitchen", {
            kitchenDepthMm: dimensions.shallowDepth.kitchenDepthMm,
          })}
        >
          <Millimetres valueMm={dimensions.shallowDepth.depthMm} />
        </Dimension>
        <Dimension
          label={translate("priceDashboard.cabinet.depthInKitchen", {
            kitchenDepthMm: dimensions.deepDepth.kitchenDepthMm,
          })}
        >
          <Millimetres valueMm={dimensions.deepDepth.depthMm} />
        </Dimension>
      </dl>
    </section>
  );
}

function HeightDimensions({
  height,
}: {
  readonly height: DetailHeight | undefined;
}) {
  const translate = useTranslations();
  if (height === undefined) return null;
  return (
    <>
      <Dimension
        label={translate("priceDashboard.cabinet.bodyHeight")}
        hint={
          height.kind === "opening"
            ? translate("priceDashboard.cabinet.followsOpening")
            : undefined
        }
      >
        <Millimetres valueMm={height.heightMm} />
      </Dimension>
      {height.kind === "opening" ? (
        <Dimension label={translate("priceDashboard.cabinet.maxHeight")}>
          <Millimetres valueMm={height.maxMm} />
        </Dimension>
      ) : null}
    </>
  );
}

function Dimension({
  label,
  tag,
  hint,
  children,
}: {
  readonly label: string;
  readonly tag?: string | undefined;
  readonly hint?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.dimension}>
      <dt className={styles.dimensionLabel}>
        {label}
        {tag === undefined ? null : (
          <span className={styles.proposed}>{tag}</span>
        )}
      </dt>
      <dd className={styles.dimensionValue}>{children}</dd>
      {hint === undefined ? null : (
        <dd className={styles.dimensionHint}>{hint}</dd>
      )}
    </div>
  );
}

function Millimetres({ valueMm }: { readonly valueMm: number }) {
  const translate = useTranslations();
  return (
    <>
      <span>{String(valueMm)}</span>
      <span className={styles.unit}>
        {translate("priceDashboard.units.mm")}
      </span>
    </>
  );
}

function sourceWords(
  translate: ContentTranslator,
  source: DetailDimensions["defaultWidth"]["source"],
): string {
  switch (source) {
    case "generator":
      return translate("priceDashboard.cabinet.sourceGenerator");
    case "only-width":
      return translate("priceDashboard.cabinet.sourceSameAsWidth");
    case "proposed":
      return translate("priceDashboard.cabinet.sourceToConfirm");
  }
}

function Facts({ facts }: { readonly facts: CabinetDetailFacts }) {
  const translate = useTranslations();
  const yesOrNo = (isYes: boolean) =>
    translate(
      isYes ? "priceDashboard.cabinet.yes" : "priceDashboard.cabinet.no",
    );
  return (
    <dl className={styles.facts}>
      <Fact name={translate("priceDashboard.cabinet.doors")}>
        <DoorsValue translate={translate} doors={facts.doors} />
      </Fact>
      <Fact name={translate("priceDashboard.cabinet.drawers")}>
        {String(facts.drawers)}
      </Fact>
      <Fact name={translate("priceDashboard.cabinet.hasHandle")}>
        {yesOrNo(facts.hasHandle)}
      </Fact>
      <Fact name={translate("priceDashboard.cabinet.canColour")}>
        {yesOrNo(facts.canColour)}
      </Fact>
    </dl>
  );
}

function Fact({
  name,
  children,
}: {
  readonly name: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factName}>{name}</dt>
      <dd className={styles.factValue}>{children}</dd>
    </div>
  );
}

function DoorsValue({
  translate,
  doors,
}: {
  readonly translate: ContentTranslator;
  readonly doors: DetailDoors;
}) {
  switch (doors.kind) {
    case "none":
      return translate("priceDashboard.cabinet.doorCount", { doorCount: 0 });
    case "fixed":
      return translate("priceDashboard.cabinet.doorCount", {
        doorCount: doors.leaves,
      });
    case "stepped":
      return translate("priceDashboard.cabinet.doorsRange", {
        low: doors.lowLeaves,
        high: doors.highLeaves,
        atMm: doors.fromMm,
      });
  }
}
