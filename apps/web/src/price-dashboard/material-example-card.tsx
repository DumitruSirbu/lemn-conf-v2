"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { TEN_LEI_MINOR, type PriceBook } from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import { useContent } from "@/i18n/use-content";

import { cabinetNamesOf } from "./cabinet-names";
import { formatLei, formatLeiAmount } from "./format-lei";
import {
  materialExampleOf,
  type ExampleFigures,
  type MaterialExample,
} from "./material-example";
import type { MaterialFacts } from "./material-model";
import styles from "./material.module.css";

// Frame D5B's example: what one cabinet costs in PAL and in the material, as the surcharge stands typed, with the
// version that is live beside it where it differs. Nothing is drawn where the book cannot price the cabinet.

export function MaterialExampleCard({
  active,
  draft,
  facts,
  percent,
}: {
  readonly active: PriceBook;
  /** The active book with the draft applied. */
  readonly draft: PriceBook;
  readonly facts: MaterialFacts;
  /** The surcharge to draw: the one typed, or the draft's where it is not a number. */
  readonly percent: number;
}) {
  const translate = useTranslations();
  const content = useContent();
  const example = useMemo(
    () => materialExampleOf({ active, draft, tierId: facts.tierId, percent }),
    [active, draft, facts.tierId, percent],
  );
  const cabinetNames = useMemo(
    () => cabinetNamesOf(active, translate),
    [active, translate],
  );
  if (example === undefined) return null;
  const currency = translate("priceDashboard.units.currency");
  const materialName = content.bookText(facts.name.authored, facts.name.key);
  return (
    <section className={styles.example} data-testid="material-example">
      <h3 className={styles.exampleTitle}>
        {translate("priceDashboard.materials.exampleTitle", {
          cabinetName: cabinetNames[example.buildId] ?? "",
          widthMm: example.widthMm,
        })}
      </h3>
      <p className={styles.exampleLine} data-testid="material-example-next">
        {translate(
          "priceDashboard.materials.exampleNew",
          figuresOf(example.next.standard, currency),
        )}
      </p>
      <ActiveLine example={example} currency={currency} translate={translate} />
      <p className={styles.exampleLine} data-testid="material-example-deep">
        {translate("priceDashboard.materials.exampleDeep", {
          deepMm: example.deepMm,
          ...figuresOf(example.next.deep, currency),
        })}
      </p>
      <p className={styles.exampleNote}>
        {translate("priceDashboard.materials.exampleNote", {
          roundTo: formatLei(TEN_LEI_MINOR, currency),
          customerLine: translate("priceBreakdown.wholeKitchenLabel", {
            categoryWord: translate(
              "priceBreakdown.wholeKitchenCategories.material",
            ),
            tierName: materialName,
          }),
        })}
      </p>
    </section>
  );
}

function ActiveLine({
  example,
  currency,
  translate,
}: {
  readonly example: MaterialExample;
  readonly currency: string;
  readonly translate: ContentTranslator;
}) {
  if (example.active === undefined) return null;
  return (
    <p
      className={styles.exampleLine}
      data-tone="muted"
      data-testid="material-example-active"
    >
      {translate(
        "priceDashboard.materials.exampleActive",
        figuresOf(example.active, currency),
      )}
    </p>
  );
}

/** The cabinet in PAL, then in the material: the lei of the first without the word, the second with it. */
function figuresOf(
  { referenceMinor, materialMinor }: ExampleFigures,
  currency: string,
): { readonly before: string; readonly after: string } {
  return {
    before: formatLeiAmount(referenceMinor),
    after: formatLei(materialMinor, currency),
  };
}
