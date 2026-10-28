import {
  SAMPLE_PRICE_BOOK,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type { ActivePriceBook } from "@/price/price-book-root";

import { SAMPLE_PRICE_ROOT } from "./sample-price-root";

/** The sample book with only the published depth percentage changed. */
export function bookPublishingDeepCabinetPercent(
  deepCabinetPercent: number,
): PriceBook {
  return { ...SAMPLE_PRICE_BOOK, depthRule: { deepCabinetPercent } };
}

/** The sample root with only the published depth percentage changed, so two roots differ in that one figure. */
export function rootPublishingDeepCabinetPercent(
  deepCabinetPercent: number,
): ActivePriceBook {
  return {
    ...SAMPLE_PRICE_ROOT,
    book: bookPublishingDeepCabinetPercent(deepCabinetPercent),
  };
}
