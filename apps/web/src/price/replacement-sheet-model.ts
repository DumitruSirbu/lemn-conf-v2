// The forced-replacement sheet (frames C4A-C4D, ADR 0062 Amendment 3, ADR 0072 Amendment *Consequence*), as values. This
// module owns every rule and sentence; `replacement-sheet.tsx` draws them and `use-price-notice.ts` owns the one `GET`.
//
// - **Rows are live.** They come from `replacementsRequired`, the domain query the route's `GET` also uses, run on the
//   store's design and the page's root. So the sheet follows current availability: a disable shows it on the next open and
//   a re-enable makes it go (Q3-e), with no new book version.
// - **Nothing is preselected and nothing is guessed.** A row offers the remaining options of its group and no more.
// - **A name only from what the page can honestly read.** A tier the book still holds (switched off) is named from the
//   book; a tier the book no longer holds has no name on the client (the wire carries none for a replacement row), so it
//   gets the generic line and never its id (OQ-41).
import {
  cornerDirectionOf,
  itemIdOf,
  isSameItem,
  NoReplacementOptionError,
  PALETTE_ENTRY_IDS,
  projectDesignForDisplay,
  replacementsRequired,
  type BodyCatalog,
  type Design,
  type ItemRef,
  type ReplacementRequired,
  type RejectionReason,
} from "@lemnaria/configurator-domain";

import type { Content, ContentTranslator } from "@/i18n/content";

import type { ActivePriceBook } from "./price-book-root";
import {
  isTierOffered,
  type OfferedTier,
  type OfferedTierGroup,
  type TierOfferAnswer,
} from "./whole-kitchen-tiers";

/** The four kinds a replacement row can be about. An accessory is never one: it is removed, not replaced (OQ-42). */
export type ReplacementKind = "material" | "hardware" | "finish" | "handle";

/** The two kinds the sheet can resolve itself. A colour or a handle is drawn, and chosen in Q5. */
export type ChoosableKind = "material" | "hardware";

export function isChoosableKind(kind: ReplacementKind): kind is ChoosableKind {
  return kind === "material" || kind === "hardware";
}

/**
 * The rows still owed, live from the design and the page's availability. An empty answer for a row with nothing to choose
 * (`NoReplacementOptionError`, unreachable while the dashboard refuses to switch off a group's last option) opens no sheet
 * and so offers no way forward: the price stays refused and no modal is drawn, which is what every other place without a
 * working flow does. Throwing here would take the whole editor down.
 */
export function pendingReplacements(
  root: ActivePriceBook,
  design: Design,
  catalog: BodyCatalog,
): readonly ReplacementRequired[] {
  try {
    return replacementsRequired({
      design,
      catalog,
      book: root.book,
      availability: root.availability,
    }).filter(isReplaceableRow);
  } catch (error) {
    if (error instanceof NoReplacementOptionError) return [];
    throw error;
  }
}

function isReplaceableRow(row: ReplacementRequired): boolean {
  return row.item.kind !== "accessory";
}

/** The rows the sheet has shown since it opened, so a row the customer has resolved stays drawn as resolved (C4D, with
 *  *Schimbă*) and not as a row that vanished. A row is kept as first seen. Answers `seen` itself when nothing is new, so
 *  the caller can tell by identity. */
export function rememberRows(
  seen: readonly ReplacementRequired[],
  live: readonly ReplacementRequired[],
): readonly ReplacementRequired[] {
  const fresh = live.filter(
    (row) => !seen.some((known) => isSameItem(known.item, row.item)),
  );
  return fresh.length === 0 ? seen : [...seen, ...fresh];
}

/**
 * Whether the save of the last choice has landed. Both halves are needed: the revision moves only on the server's answer,
 * but a save of an earlier choice moves it too; and `design === savedDesign` is the one answer to "is anything still
 * waiting", where `saveStatus: "idle"` also covers an edit queued behind the coalescer's interval.
 */
export function hasReplacementSaveLanded({
  revisionAtChoice,
  revision,
  isEverythingSaved,
}: {
  readonly revisionAtChoice: string | null;
  readonly revision: string | null;
  readonly isEverythingSaved: boolean;
}): boolean {
  return isEverythingSaved && revision !== revisionAtChoice;
}

/** The copy the sheet speaks, resolved once per locale. Every leaf already exists; none is built here from an id. */
export function resolveReplacementSheetCopy(translate: ContentTranslator) {
  return {
    title: translate("replacementSheet.title"),
    bodyOne: (items: string) =>
      translate("replacementSheet.bodyOne", { items }),
    bodyMany: (items: string) =>
      translate("replacementSheet.bodyMany", { items }),
    unavailable: translate("replacementSheet.unavailable"),
    unavailableAria: (name: string) =>
      translate("replacementSheet.unavailableAria", { name }),
    choose: translate("replacementSheet.choose"),
    change: translate("replacementSheet.change"),
    priceAfterChoosing: translate("replacementSheet.priceAfterChoosing"),
    priceAfterApplying: translate("replacementSheet.priceAfterApplying"),
    exitHint: translate("replacementSheet.exitHint"),
    chooserAppliesTo: (bodyCount: number) =>
      translate("replacementSheet.chooserAppliesTo", { bodyCount }),
    chooseFromRemaining: translate("replacementSheet.chooseFromRemaining"),
    strikethroughNote: translate("replacementSheet.strikethroughNote"),
    accessoryRemoved: (name: string) =>
      translate("replacementSheet.accessoryRemoved", { name }),
    changedMaterial: (name: string) =>
      translate("replacementSheet.changedMaterial", { name }),
    changedHardware: (name: string) =>
      translate("replacementSheet.changedHardware", { name }),
    unnamedOptionUnavailable: translate(
      "replacementSheet.unnamedOptionUnavailable",
    ),
    alsoUpdated: translate("customerPriceNotice.alsoUpdated"),
    itemJoin: translate("globalSettings.pillNameJoin"),
  };
}

export type ReplacementSheetCopy = ReturnType<
  typeof resolveReplacementSheetCopy
>;

/** What the view model reads besides the rows: the offer to name tiers from, and the words. */
export interface SheetVocabulary {
  readonly content: Content;
  readonly copy: ReplacementSheetCopy;
  readonly offer: TierOfferAnswer;
}

export interface ReplacementRowView {
  /** Stable for the item across renders: the kind and the id. Never shown. */
  readonly key: string;
  readonly item: ItemRef;
  readonly kind: ReplacementKind;
  readonly kindLabel: string;
  /** The item's name, or the generic line where the page has none to give. */
  readonly valueText: string;
  /** `"nu mai este disponibil"`, or nothing where the generic line already says it. */
  readonly statusText: string;
  /** What a screen reader announces for the row: "{name} nu mai este disponibil", or the generic line. */
  readonly announcement: string;
  /** What the body's "Producătorul nu mai oferă" lists: "Material · MDF vopsit mat", or the kind alone where unnamed. */
  readonly itemPhrase: string;
  readonly isResolved: boolean;
  /** Whether the sheet can resolve it itself; a colour or a handle waits for Q5. */
  readonly isChoosable: boolean;
}

export interface ReplacementSheetView {
  readonly title: string;
  readonly body: string;
  readonly rows: readonly ReplacementRowView[];
  /** Accessories removed with nothing to choose instead: information only (C4D). */
  readonly infoLines: readonly string[];
  readonly priceLine: string;
  readonly exitHint: string;
  readonly chooseLabel: string;
  readonly changeLabel: string;
}

/** The sheet's list step. `seen` is every item shown since the sheet opened, `live` what is still owed. */
export function describeReplacementSheet({
  seen,
  live,
  design,
  accessoryNames,
  vocabulary,
}: {
  readonly seen: readonly ReplacementRequired[];
  readonly live: readonly ReplacementRequired[];
  readonly design: Design;
  readonly accessoryNames: readonly string[];
  readonly vocabulary: SheetVocabulary;
}): ReplacementSheetView {
  const { copy } = vocabulary;
  const rows = seen.map(({ item }) =>
    describeRow({
      item,
      isResolved: !live.some((row) => isSameItem(row.item, item)),
      design,
      vocabulary,
    }),
  );
  const itemsText = rows.map((row) => row.itemPhrase).join(copy.itemJoin);
  return {
    title: copy.title,
    body:
      rows.length === 1 ? copy.bodyOne(itemsText) : copy.bodyMany(itemsText),
    rows,
    infoLines: accessoryNames.map(copy.accessoryRemoved),
    priceLine: copy.priceAfterChoosing,
    exitHint: copy.exitHint,
    chooseLabel: copy.choose,
    changeLabel: copy.change,
  };
}

function describeRow({
  item,
  isResolved,
  design,
  vocabulary,
}: {
  readonly item: ItemRef;
  readonly isResolved: boolean;
  readonly design: Design;
  readonly vocabulary: SheetVocabulary;
}): ReplacementRowView {
  const kind = replacementKindOf(item);
  const { copy, content } = vocabulary;
  const kindLabel = kindLabelOf(kind, content);
  const unavailableName = nameOfUnavailable(item, vocabulary);
  const chosen = isResolved ? chosenName(kind, design, vocabulary) : undefined;
  return {
    key: `${kind}:${itemIdOf(item)}`,
    item,
    kind,
    kindLabel,
    valueText: isResolved
      ? (chosen ?? "")
      : (unavailableName ?? copy.unnamedOptionUnavailable),
    statusText:
      isResolved || unavailableName === undefined ? "" : copy.unavailable,
    announcement:
      unavailableName === undefined
        ? copy.unnamedOptionUnavailable
        : copy.unavailableAria(unavailableName),
    itemPhrase:
      unavailableName === undefined
        ? kindLabel
        : content.priceBreakdown.wholeKitchenLabel(kindLabel, unavailableName),
    isResolved,
    isChoosable: isChoosableKind(kind),
  };
}

function replacementKindOf(item: ItemRef): ReplacementKind {
  if (item.kind === "accessory") {
    throw new Error("An accessory is removed, never replaced: it is no row");
  }
  return item.kind;
}

/** The words the app already uses for these four things, never a new leaf. */
function kindLabelOf(kind: ReplacementKind, content: Content): string {
  switch (kind) {
    case "material":
      return content.priceBreakdown.wholeKitchenCategories.material;
    case "hardware":
      return content.priceBreakdown.wholeKitchenCategories.hardware;
    case "finish":
      return content.globalSettings.colourHeading;
    case "handle":
      return content.globalSettings.kitchenHandleHeading;
  }
}

/** The name of an item that is no longer available, where the page can read one. A tier the book still holds is named by
 *  its book row; a tier it does not hold is not named (OQ-41). A colour or a handle is named from the code. */
function nameOfUnavailable(
  item: ItemRef,
  { content, offer }: SheetVocabulary,
): string | undefined {
  switch (item.kind) {
    case "material":
    case "hardware":
      return nameOfHeldTier(item.kind, item.tierId, offer, content);
    case "finish":
      return finishNameOf(item.finishId, content);
    case "handle":
      return content.panel.handleLabels[item.handle];
    case "accessory":
      return undefined;
  }
}

function finishNameOf(finishId: string, content: Content): string | undefined {
  const entryId = PALETTE_ENTRY_IDS.find((known) => known === finishId);
  return entryId === undefined ? undefined : content.finishName(entryId);
}

/** What the kitchen carries now in a kind the customer has resolved: the tier they picked, for the row to say so. */
function chosenName(
  kind: ReplacementKind,
  design: Design,
  { content, offer }: SheetVocabulary,
): string | undefined {
  if (kind === "finish") return currentColourName(design, content);
  if (kind === "handle") {
    const handle = design.settings?.handle;
    return handle === undefined
      ? undefined
      : content.panel.handleLabels[handle];
  }
  const tierId =
    kind === "material"
      ? design.settings?.materialTierId
      : design.settings?.hardwareTierId;
  return tierId === undefined
    ? undefined
    : nameOfHeldTier(kind, tierId, offer, content);
}

/** The colour that applies to the kitchen now: after a material change the colour has been reset to the material's own
 *  default (ADR 0057), and a resolved colour row says which one it is. */
function currentColourName(
  design: Design,
  content: Content,
): string | undefined {
  const finish = design.settings?.finish;
  return finish?.kind === "palette-entry"
    ? finishNameOf(finish.entryId, content)
    : undefined;
}

function nameOfHeldTier(
  kind: ChoosableKind,
  tierId: string,
  offer: TierOfferAnswer,
  content: Content,
): string | undefined {
  if (!isTierOffered(offer)) return undefined;
  const group = offer[kind];
  const tier = [...group.tiers, ...group.switchedOffTiers].find(
    (held) => held.tierId === tierId,
  );
  return tier === undefined ? undefined : tierNameOf(tier, content);
}

function tierNameOf(tier: OfferedTier, content: Content): string {
  return content.bookText(tier.name, tier.nameKey);
}

/** One option in a chooser. A struck one is the kitchen's own switched-off tier: shown, never choosable. */
export interface ChooserOptionView {
  readonly tierId: string;
  readonly name: string;
  readonly description: string;
  readonly isStruck: boolean;
}

/** C4B: one group's chooser. Carries no figure: the design cannot be priced until the choice is made, so no delta is
 *  measured, and the bar says the price comes after "Aplică". */
export interface ChooserView {
  readonly kind: ChoosableKind;
  readonly heading: string;
  readonly appliesTo: string;
  readonly hint: string;
  readonly options: readonly ChooserOptionView[];
  readonly struckNote: string;
  readonly priceLine: string;
}

/** The chooser for a row, or nothing where the offer cannot be read (no book: the sheet is then not open at all). */
export function describeChooser({
  row,
  design,
  catalog,
  vocabulary,
}: {
  readonly row: ReplacementRequired;
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly vocabulary: SheetVocabulary;
}): ChooserView | undefined {
  const { item } = row;
  const { offer, content, copy } = vocabulary;
  if (!isTierOffered(offer)) return undefined;
  if (item.kind !== "material" && item.kind !== "hardware") return undefined;
  const group = offer[item.kind];
  return {
    kind: item.kind,
    heading: content.globalSettings.groupHeadings[item.kind],
    appliesTo: copy.chooserAppliesTo(countDisplayedBodies(design, catalog)),
    hint: copy.chooseFromRemaining,
    options: [
      ...remainingOptions(row, group, content),
      ...struckOptions(item.tierId, group, content),
    ],
    struckNote: copy.strikethroughNote,
    priceLine: copy.priceAfterApplying,
  };
}

function remainingOptions(
  row: ReplacementRequired,
  group: OfferedTierGroup,
  content: Content,
): readonly ChooserOptionView[] {
  return row.remaining.flatMap((option) => {
    if (option.kind !== "material" && option.kind !== "hardware") return [];
    const tier = group.tiers.find(
      (offered) => offered.tierId === option.tierId,
    );
    return tier === undefined ? [] : [optionOf(tier, false, content)];
  });
}

/** Only the kitchen's own tier, and only where the book still holds it: a vanished tier has no name to strike. */
function struckOptions(
  ownTierId: string,
  group: OfferedTierGroup,
  content: Content,
): readonly ChooserOptionView[] {
  const own = group.switchedOffTiers.find((tier) => tier.tierId === ownTierId);
  return own === undefined ? [] : [optionOf(own, true, content)];
}

function optionOf(
  tier: OfferedTier,
  isStruck: boolean,
  content: Content,
): ChooserOptionView {
  return {
    tierId: tier.tierId,
    name: tierNameOf(tier, content),
    description: content.bookText(tier.description, tier.descriptionKey),
    isStruck,
  };
}

function countDisplayedBodies(design: Design, catalog: BodyCatalog): number {
  return projectDesignForDisplay(design, catalog).reduce(
    (count, group) => count + group.entries.length,
    0,
  );
}

/** The sentence a refused press is answered with: the setting's name, then the domain's reason, as the settings sheet says it. */
export function describeApplyRefusal({
  kind,
  reason,
  design,
  content,
}: {
  readonly kind: ChoosableKind;
  readonly reason: RejectionReason;
  readonly design: Design;
  readonly content: Content;
}): string {
  return content.globalSettings.applyRefused(
    kindLabelOf(kind, content),
    content.rejection(reason, cornerDirectionOf(design.room)),
  );
}

/** C4C's lines, in the mockup's order: what changed, then the merged prices sentence when the second `GET` says so. */
export function describeConfirmationLines({
  changes,
  alsoUpdated,
  copy,
}: {
  readonly changes: readonly {
    readonly kind: ChoosableKind;
    readonly name: string;
  }[];
  readonly alsoUpdated: boolean;
  readonly copy: ReplacementSheetCopy;
}): readonly string[] {
  const changed = changes.map(({ kind, name }) =>
    kind === "material"
      ? copy.changedMaterial(name)
      : copy.changedHardware(name),
  );
  return alsoUpdated ? [...changed, copy.alsoUpdated] : changed;
}
