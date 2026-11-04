import {
  describeBodyName,
  entryLabel,
  referenceCornerBuiltWidthsMm,
  type BodyLabel,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { resolveBodyLabel, type ContentTranslator } from "@/i18n/content";

import { priceDashboardCatalogue } from "./price-dashboard-catalogue";

// The name each priced cabinet goes by, from the catalogue's own naming of the body. The six structural corner pieces are
// named by their kind, and four kinds serve six pieces, so a piece is told apart by the width it is built at.

/** The name of every cabinet rule of the book, by build id. */
export function cabinetNamesOf(
  book: PriceBook,
  translate: ContentTranslator,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    book.cabinetRules.map(({ buildId }) => [
      buildId,
      nameOf(buildId, translate),
    ]),
  );
}

function nameOf(buildId: string, translate: ContentTranslator): string {
  const label = labelOf(buildId);
  const name = resolveBodyLabel(translate, label);
  const builtWidthMm = referenceCornerBuiltWidthsMm().get(buildId);
  if (label.kind !== "bodyKind" || builtWidthMm === undefined) return name;
  return translate("priceDashboard.cabinets.nameWithWidth", {
    name,
    widthMm: builtWidthMm,
  });
}

function labelOf(buildId: string): BodyLabel {
  const definition = priceDashboardCatalogue().get(buildId);
  return definition === undefined
    ? entryLabel(buildId)
    : describeBodyName({ buildId, definition });
}
