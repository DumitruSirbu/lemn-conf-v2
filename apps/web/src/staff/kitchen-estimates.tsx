"use client";

import type { ReactNode } from "react";

import {
  useContent,
  useStaffChangesCopy,
  useStaffKitchenCopy,
} from "@/i18n/use-content";
import { describeStartingPrice } from "@/price/starting-price";

import { Card } from "./staff-kitchen-card";
import styles from "./staff-kitchen.module.css";
import type {
  StaffEstimateRefusedWire,
  StaffEstimateWire,
  StaffKitchenEstimatesWire,
} from "./staff-kitchens-wire-contract";

// The two estimates of a sent kitchen (frame D10B): what the shop's notice carried, and what the kitchen as it stands is
// priced at now. Each is the starting figure every other price surface shows, from the one formatter. A kitchen that
// cannot be priced has the sentence of its refusal and never a figure, and an estimate the request did not keep says
// so: neither is ever drawn as a zero.

export function KitchenEstimates({
  estimates,
}: {
  readonly estimates: StaffKitchenEstimatesWire;
}) {
  const copy = useStaffChangesCopy().estimate;
  const kitchen = useStaffKitchenCopy();
  return (
    <Card title={kitchen.summary.price} testId="staff-kitchen-estimates">
      <dl className={styles.facts}>
        <EstimateFact
          label={copy.sent}
          testId="staff-kitchen-estimate-sent"
          text={<SentEstimateText estimate={estimates.sentEstimate} />}
        />
        <EstimateFact
          label={copy.current}
          testId="staff-kitchen-estimate-current"
          text={<CurrentEstimateText estimate={estimates.currentEstimate} />}
        />
      </dl>
    </Card>
  );
}

function EstimateFact({
  label,
  testId,
  text,
}: {
  readonly label: string;
  readonly testId: string;
  readonly text: ReactNode;
}) {
  return (
    <div className={styles.fact} data-testid={testId}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{text}</dd>
    </div>
  );
}

function SentEstimateText({
  estimate,
}: {
  readonly estimate: StaffEstimateWire | null;
}) {
  const copy = useStaffChangesCopy().estimate;
  return estimate === null ? (
    <span className={styles.muted}>{copy.sentMissing}</span>
  ) : (
    <Figure estimate={estimate} />
  );
}

function CurrentEstimateText({
  estimate,
}: {
  readonly estimate: StaffEstimateWire | StaffEstimateRefusedWire;
}) {
  const copy = useStaffChangesCopy().estimate;
  if ("refused" in estimate) {
    return (
      <span className={styles.muted}>{copy.refusals[estimate.refused]}</span>
    );
  }
  return <Figure estimate={estimate} />;
}

function Figure({ estimate }: { readonly estimate: StaffEstimateWire }) {
  const { price } = useContent();
  const figure = describeStartingPrice({
    totalMinor: estimate.totalMinor,
    copy: price,
  });
  return (
    <>
      {figure.label} {figure.amountText}
    </>
  );
}
