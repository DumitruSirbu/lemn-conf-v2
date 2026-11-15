"use client";

import type { ReactNode } from "react";

import {
  useContent,
  useStaffChangesCopy,
  useStaffKitchenCopy,
} from "@/i18n/use-content";
import {
  describeSignedDifference,
  describeStartingPrice,
} from "@/price/starting-price";

import { Card } from "./staff-kitchen-card";
import styles from "./staff-kitchen.module.css";
import {
  describePriceCard,
  type CopiesRelation,
  type CurrentEstimateWire,
  type PriceCardModel,
} from "./kitchen-estimates-model";
import type {
  StaffEstimateWire,
  StaffKitchenEstimatesWire,
} from "./staff-kitchens-wire-contract";

// The price card of a sent kitchen (frame D10B; ADR 0185 decision 5): what the shop's notice carried, and what the kitchen
// as it stands is priced at now. Each is the starting figure every other price surface shows, from the one formatter, but
// whether the two differ is decided from the exact totals (`kitchen-estimates-model.ts`): both figures round up to the
// thousand, so equal figures can hide a difference, which is then shown signed, to the ten lei, in text. A kitchen that
// cannot be priced has the sentence of its refusal and never a figure, and an estimate the request did not keep says
// so: neither is ever drawn as a zero.

export function KitchenEstimates({
  estimates,
  copies,
}: {
  readonly estimates: StaffKitchenEstimatesWire;
  readonly copies: CopiesRelation;
}) {
  const copy = useStaffChangesCopy().estimate;
  const kitchen = useStaffKitchenCopy();
  const card = describePriceCard(estimates, copies);
  return (
    <Card
      title={kitchen.summary.price}
      tag={card.kind === "different" ? copy.differs : undefined}
      testId="staff-kitchen-estimates"
    >
      <dl className={styles.facts}>
        <PriceCardRows card={card} />
      </dl>
      <PriceCardNote card={card} />
    </Card>
  );
}

function PriceCardRows({ card }: { readonly card: PriceCardModel }) {
  const copy = useStaffChangesCopy().estimate;
  switch (card.kind) {
    case "same":
      return (
        <EstimateFact
          label={copy.sameLabel}
          testId="staff-kitchen-estimate-same"
          text={<Figure estimate={card.total} />}
        />
      );
    case "different":
      return (
        <>
          <EstimateFact
            label={copy.atSendingLabel}
            testId="staff-kitchen-estimate-sent"
            text={<Figure estimate={card.sent} />}
          />
          <EstimateFact
            label={copy.nowLabel}
            testId="staff-kitchen-estimate-current"
            isDiffering
            text={
              <>
                <Figure estimate={card.current} />
                <Difference differenceMinor={card.differenceMinor} />
              </>
            }
          />
        </>
      );
    case "not-comparable":
      return (
        <>
          <EstimateFact
            label={copy.sent}
            testId="staff-kitchen-estimate-sent"
            text={<SentEstimateText estimate={card.sent} />}
          />
          <EstimateFact
            label={copy.current}
            testId="staff-kitchen-estimate-current"
            text={<CurrentEstimateText estimate={card.current} />}
          />
        </>
      );
  }
}

function PriceCardNote({ card }: { readonly card: PriceCardModel }) {
  const { notes } = useStaffChangesCopy().estimate;
  if (card.kind === "not-comparable") return null;
  const note = card.kind === "same" ? notes.same : notes[card.noteCause];
  return (
    <p className={styles.hint} data-testid="staff-kitchen-estimate-note">
      {note}
    </p>
  );
}

function EstimateFact({
  label,
  testId,
  text,
  isDiffering = false,
}: {
  readonly label: string;
  readonly testId: string;
  readonly text: ReactNode;
  readonly isDiffering?: boolean;
}) {
  return (
    <div
      className={styles.fact}
      data-testid={testId}
      data-differs={isDiffering ? "true" : undefined}
    >
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{text}</dd>
    </div>
  );
}

function Difference({ differenceMinor }: { readonly differenceMinor: number }) {
  const { price } = useContent();
  const { estimate } = useStaffChangesCopy();
  const amount = describeSignedDifference({
    differenceMinor,
    copy: price,
  });
  return (
    <span
      className={styles.factDifference}
      data-testid="staff-kitchen-estimate-difference"
    >
      {estimate.difference(amount)}
    </span>
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
  readonly estimate: CurrentEstimateWire;
}) {
  const copy = useStaffChangesCopy().estimate;
  if ("empty" in estimate) {
    return <span className={styles.muted}>{copy.empty}</span>;
  }
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
    <span data-figure="">
      {figure.label} {figure.amountText}
    </span>
  );
}
