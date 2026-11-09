// The replacement sheet's model for one kitchen under one availability, as the editor assembles it: the rows the domain lists,
// and the vocabulary (content, copy and tier offer) the model names them with.
import {
  KITCHEN_L_BODY_CATALOG,
  type Design,
  type ItemRef,
} from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";

import type { ActivePriceBook } from "@/price/price-book-root";
import {
  describeReplacementSheet,
  pendingReplacements,
  resolveReplacementSheetCopy,
  type SheetVocabulary,
} from "@/price/replacement-sheet-model";

import roMessages from "../../src/messages/ro.json";
import { ro } from "./romanian-content";
import { SAMPLE_PRICE_ROOT } from "./sample-price-root";
import { offerThroughRoot } from "./tier-offer-world";

export const romanianSheetCopy = resolveReplacementSheetCopy(
  createTranslator({ locale: "ro", messages: roMessages }),
);

export function worldOf(design: Design, disabled: readonly ItemRef[]) {
  const availability = { revision: "1", disabled };
  const root: ActivePriceBook = { ...SAMPLE_PRICE_ROOT, availability };
  const live = pendingReplacements(root, design, KITCHEN_L_BODY_CATALOG);
  const vocabulary: SheetVocabulary = {
    content: ro,
    copy: romanianSheetCopy,
    offer: offerThroughRoot(availability, design),
  };
  return { root, availability, live, vocabulary };
}

/** The sheet's rows as first drawn: every owed row seen and still owed. */
export function viewOf(
  design: Design,
  disabled: readonly ItemRef[],
  chosenNames?: ReadonlyMap<string, string>,
) {
  const { live, vocabulary } = worldOf(design, disabled);
  return describeReplacementSheet({
    seen: live,
    live,
    design,
    accessoryNames: [],
    vocabulary,
    ...(chosenNames === undefined ? {} : { chosenNames }),
  });
}
