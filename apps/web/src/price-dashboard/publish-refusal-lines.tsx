"use client";

import { useTranslations } from "next-intl";

import type { ContentTranslator } from "@/i18n/content";

import type { CandidateRefusalWire } from "./price-dashboard-wire-contract";
import {
  refusalLinesOf,
  type RefusalContext,
  type RefusalLine,
} from "./publish-refusals";
import { useRowWords } from "./publish-rows";
import styles from "./publish.module.css";

// What a publish the catalogue refused names: the row each reason is about, so the person can take it back or correct it.

export function CandidateRefusals({
  refusals,
  context,
}: {
  readonly refusals: readonly CandidateRefusalWire[];
  readonly context: RefusalContext;
}) {
  const translate = useTranslations();
  const words = useRowWords();
  const { lines, hiddenCount } = refusalLinesOf(refusals, context);
  if (lines.length === 0) return null;
  return (
    <ul className={styles.refusalList} data-testid="publish-refusals">
      {lines.map((line, position) => (
        <li key={position}>{lineWords(translate, words.subject, line)}</li>
      ))}
      {hiddenCount === 0 ? null : (
        <li>
          {translate("priceDashboard.publish.refusalsMore", {
            count: hiddenCount,
          })}
        </li>
      )}
    </ul>
  );
}

function lineWords(
  translate: ContentTranslator,
  subjectWords: ReturnType<typeof useRowWords>["subject"],
  line: RefusalLine,
): string {
  if (line.kind === "unnamed") {
    return translate("priceDashboard.publish.refusalUnnamed");
  }
  const name = subjectWords(line.subject);
  switch (line.kind) {
    case "change":
      return translate("priceDashboard.publish.refusalChange", { name });
    case "price-not-positive":
      return translate("priceDashboard.publish.refusalPriceNotPositive", {
        name,
        widthMm: line.widthMm,
        heightMm: line.heightMm,
      });
    case "price-too-large":
      return translate("priceDashboard.publish.refusalPriceTooLarge", {
        name,
        widthMm: line.widthMm,
        heightMm: line.heightMm,
      });
    case "percent-out-of-range":
      return translate("priceDashboard.publish.refusalPercent", { name });
    case "link":
      return translate("priceDashboard.publish.refusalLink", { name });
    case "cabinet":
      return translate("priceDashboard.publish.refusalCabinet", { name });
  }
}
