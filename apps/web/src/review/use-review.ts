"use client";

import { projectDesignForDisplay } from "@lemnaria/configurator-domain";
import { useMemo } from "react";

import { useContent } from "@/i18n/use-content";
import { usePricedDesign } from "@/price/use-priced-design";
import { useConfiguratorStore } from "@/store/configurator-store";

import { describeReview, type ReviewView } from "./review-model";

/**
 * The one place `describeReview` is handed its inputs, all from one render's read of the store: the design, the
 * price `usePricedDesign` derives from that design, and the rows projected from it. Nothing else imports the model's
 * builder, so no screen can pair a design from its props with a price or rows from the store.
 *
 * Each memo is keyed on the design and catalogue it reads, so a projection is never kept from an earlier design.
 */
export function useReview(): ReviewView {
  const content = useContent();
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const pricing = usePricedDesign();

  const groups = useMemo(
    () => projectDesignForDisplay(design, catalog),
    [design, catalog],
  );

  return useMemo(
    () => describeReview({ content, design, pricing, groups }),
    [content, design, pricing, groups],
  );
}
