// A dashboard state built from the domain's sample book, for the tests of the list's facts and of the writes. The names
// are the catalogue's, resolved by the app's own label seam, so a test holds no second copy of them.
import { createTranslator } from "next-intl";

import {
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import { cabinetNamesOf as namesOfBook } from "@/price-dashboard/cabinet-names";
import type { CabinetListPageInput } from "@/price-dashboard/cabinet-list-facts";
import type { DashboardStateWire } from "@/price-dashboard/price-dashboard-wire-contract";

import roMessages from "../../src/messages/ro.json";

const translate = createTranslator({
  locale: "ro",
  messages: roMessages,
}) as ContentTranslator;

export const BASE_CABINET_RULE = "cabinet.base-cabinet";

export function cabinetNamesOf(
  book: PriceBook,
): Readonly<Record<string, string>> {
  return namesOfBook(book, translate);
}

export function stateOf(
  changes: readonly DraftChange[] = [],
  draftRevision = "1",
): DashboardStateWire {
  return {
    active: {
      versionId: "version-1",
      book: SAMPLE_PRICE_BOOK,
      availability: { revision: "0", disabled: [] },
      sequenceNumber: 1,
      label: "Sample",
      publishedAt: "2026-10-01T00:00:00.000Z",
    },
    draft: { draftRevision, changes },
  };
}

export function pageOf(
  changes: readonly DraftChange[] = [],
  draftRevision = "1",
): CabinetListPageInput {
  return {
    state: stateOf(changes, draftRevision),
    cabinetNames: cabinetNamesOf(SAMPLE_PRICE_BOOK),
  };
}
