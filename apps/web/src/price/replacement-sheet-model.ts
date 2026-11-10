// The forced-replacement sheet as values: its rows, names, chooser and confirmation lines. `replacement-sheet.tsx` draws
// them and `use-price-notice.ts` owns the one `GET`.
// - Rows are live: `replacementsRequired` run on the store's design and the page's availability, so a disable shows the
//   sheet on the next open and a re-enable removes it, with no new book version.
// - A name comes only from a book row the page still holds. A tier the book no longer holds gets the generic line, never
//   its id (ADR 0062 Amendment 3).
import {
  cornerDirectionOf,
  countDisplayedBodies,
  itemIdOf,
  isSameItem,
  NoReplacementOptionError,
  PALETTE_ENTRY_IDS,
  paletteFinish,
  projectDesignForDisplay,
  replacementsRequired,
  sameFinish,
  type BodyCatalog,
  type Design,
  type Finish,
  type Handle,
  type ItemRef,
  type ReplacementRequired,
  type RejectionReason,
} from "@lemnaria/configurator-domain";
import { swatchOf } from "@lemnaria/three-adapter";

import type { Content, ContentTranslator } from "@/i18n/content";
import {
  finishesStoredIn,
  handlesStoredIn,
  type AppearanceReplacement,
} from "@/store/whole-kitchen-apply";

import type { ActivePriceBook } from "./price-book-root";
import {
  isTierOffered,
  type OfferedTier,
  type OfferedTierGroup,
  type TierOfferAnswer,
} from "./whole-kitchen-tiers";

/** The four kinds a replacement row can be about. An accessory is never one: it is removed, not replaced. */
export type ReplacementKind = "material" | "hardware" | "finish" | "handle";

/** The two kinds that are a tier of the price book, chosen from the book's offer. */
export type TierKind = "material" | "hardware";

/**
 * The rows still owed, live from the design and the page's availability. The one answer swallowed is
 * `NoReplacementOptionError`, whose one remaining cause is a group with every option switched off (the dashboard refuses
 * the last one, so it takes an out-of-band write): there is nothing to offer, so no sheet opens and the price stays
 * refused, as it does wherever no flow can help. Anything else is a defect and is thrown, never an empty sheet.
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

/** The rows the sheet has shown since it opened, so a row the customer has resolved stays drawn as resolved and not
 *  as a row that vanished. A row is kept as first seen. Answers `seen` itself when nothing is new, so
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

const CHANGED_LEAF = {
  material: "replacementSheet.changedMaterial",
  hardware: "replacementSheet.changedHardware",
  finish: "replacementSheet.changedColour",
  handle: "replacementSheet.changedHandle",
} as const satisfies Record<ReplacementKind, string>;

/** A control character no leaf contains, so it marks exactly where `{name}` falls in a translated leaf. */
const NAME_PLACEHOLDER = "\u0001";

/**
 * A "changed to {name}" line without its closing "the price was updated" sentence, for the confirmation to say that
 * sentence once for all its lines. Every such leaf is "<head>{name}. <sentence>", so the line is cut at the first full stop
 * after the name; a leaf not of that shape (a locale that words it otherwise) is left whole and says its sentence itself.
 */
function withoutPriceSentence(
  translate: ContentTranslator,
  leaf: (typeof CHANGED_LEAF)[ReplacementKind],
  name: string,
): string {
  const parts = translate(leaf, { name: NAME_PLACEHOLDER }).split(
    NAME_PLACEHOLDER,
  );
  const [head, tail] = parts;
  const sentenceStart = tail?.indexOf(". ") ?? -1;
  if (
    parts.length !== 2 ||
    head === undefined ||
    tail === undefined ||
    sentenceStart < 0
  ) {
    return translate(leaf, { name });
  }
  return `${head}${name}${tail.slice(0, sentenceStart + 1)}`;
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
    changed: (kind: ReplacementKind, name: string) =>
      translate(CHANGED_LEAF[kind], { name }),
    changedWithoutPriceSentence: (kind: ReplacementKind, name: string) =>
      withoutPriceSentence(translate, CHANGED_LEAF[kind], name),
    materialAndColoursUnavailable: translate(
      "replacementSheet.materialAndColoursUnavailable",
    ),
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
  /** The item's name, or the generic line where the page has none to give. Absent for a resolved row with nothing to say. */
  readonly valueText: string | undefined;
  /** `"nu mai este disponibil"`, or nothing where the generic line already says it. */
  readonly statusText: string;
  /** What a screen reader announces for the row: "{name} nu mai este disponibil", or the kind and the generic line. */
  readonly announcement: string;
  /** What the body's "Producătorul nu mai oferă" lists: "Material · MDF vopsit mat", or the kind alone where unnamed. */
  readonly itemPhrase: string;
  readonly isResolved: boolean;
  /** Whether the row has a control to press now. */
  readonly isChoosable: boolean;
  /** A colour owed while a material is: the material's change resets colours (ADR 0057), so the colour waits for it
   *  and would otherwise be chosen only to be discarded. */
  readonly isWaiting: boolean;
}

export interface ReplacementSheetView {
  readonly title: string;
  readonly body: string;
  /** Said while a material row is owed, before any choice: the material's colours go with it. */
  readonly materialNote: string | undefined;
  readonly rows: readonly ReplacementRowView[];
  /** Accessories removed with nothing to choose instead: information only. */
  readonly infoLines: readonly string[];
  readonly priceLine: string;
  readonly exitHint: string;
  readonly chooseLabel: string;
  readonly changeLabel: string;
}

/** The names the sheet's own choices gave to the items they resolved, by `replacedItemKey`. */
export type ChosenNames = ReadonlyMap<string, string>;

const NO_CHOSEN_NAMES: ChosenNames = new Map();

/** What an item is called among the sheet's choices: its kind and id, which is also its row's `key`. */
export function replacedItemKey(item: ItemRef): string {
  return `${replacementKindOf(item)}:${itemIdOf(item)}`;
}

/** The sheet's list step. `seen` is every item shown since the sheet opened, `live` what is still owed. */
export function describeReplacementSheet({
  seen,
  live,
  design,
  accessoryNames,
  vocabulary,
  chosenNames = NO_CHOSEN_NAMES,
}: {
  readonly seen: readonly ReplacementRequired[];
  readonly live: readonly ReplacementRequired[];
  readonly design: Design;
  readonly accessoryNames: readonly string[];
  readonly vocabulary: SheetVocabulary;
  readonly chosenNames?: ChosenNames;
}): ReplacementSheetView {
  const { copy } = vocabulary;
  const isMaterialOwed = live.some((row) => row.item.kind === "material");
  const hasColourChoice = [...chosenNames.keys()].some(isColourKey);
  const rows = seen.map(({ item }) =>
    describeRow({
      item,
      isResolved: !live.some((row) => isSameItem(row.item, item)),
      isMaterialOwed,
      hasColourChoice,
      design,
      chosenName: chosenNames.get(replacedItemKey(item)),
      vocabulary,
    }),
  );
  const itemsText = rows.map((row) => row.itemPhrase).join(copy.itemJoin);
  return {
    title: copy.title,
    body:
      rows.length === 1 ? copy.bodyOne(itemsText) : copy.bodyMany(itemsText),
    materialNote: isMaterialOwed
      ? copy.materialAndColoursUnavailable
      : undefined,
    rows,
    infoLines: accessoryNames.map(copy.accessoryRemoved),
    priceLine: copy.priceAfterChoosing,
    exitHint: copy.exitHint,
    chooseLabel: copy.choose,
    changeLabel: copy.change,
  };
}

function isColourKey(key: string): boolean {
  return key.startsWith("finish:");
}

interface RowContext {
  readonly item: ItemRef;
  readonly isResolved: boolean;
  readonly isMaterialOwed: boolean;
  /** The customer chose a colour in this sheet, which a later material change would discard. */
  readonly hasColourChoice: boolean;
  readonly design: Design;
  /** What the customer's own choice was called, where it is what resolved the row. */
  readonly chosenName: string | undefined;
  readonly vocabulary: SheetVocabulary;
}

function describeRow(context: RowContext): ReplacementRowView {
  const { item, isResolved, vocabulary } = context;
  const kind = replacementKindOf(item);
  const { copy, content } = vocabulary;
  const kindLabel = kindLabelOf(kind, content);
  const unavailableName = nameOfUnavailable(item, vocabulary);
  const isWaiting = !isResolved && kind === "finish" && context.isMaterialOwed;
  return {
    key: replacedItemKey(item),
    item,
    kind,
    kindLabel,
    valueText: isResolved
      ? (context.chosenName ?? nameNowApplying(item, context))
      : (unavailableName ?? copy.unnamedOptionUnavailable),
    statusText:
      isResolved || unavailableName === undefined ? "" : copy.unavailable,
    announcement:
      unavailableName === undefined
        ? `${kindLabel}: ${copy.unnamedOptionUnavailable}`
        : copy.unavailableAria(unavailableName),
    itemPhrase:
      unavailableName === undefined
        ? kindLabel
        : content.priceBreakdown.wholeKitchenLabel(kindLabel, unavailableName),
    isResolved,
    isChoosable: hasControl(context, kind, isWaiting),
    isWaiting,
  };
}

/**
 * Which rows carry a button. An unresolved row has one unless it waits. A resolved colour or handle has none: replacing
 * it again would name an item the design no longer stores, which changes nothing, or the value another cabinet wears.
 * A resolved hardware row can be changed, and so can a material, but not once a colour was chosen after it: that change
 * would discard the colour.
 */
function hasControl(
  { isResolved, hasColourChoice }: RowContext,
  kind: ReplacementKind,
  isWaiting: boolean,
): boolean {
  if (!isResolved) return !isWaiting;
  if (kind === "material") return !hasColourChoice;
  return kind === "hardware";
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
 *  its book row; a tier it does not hold is not named. A colour or a handle is named from the code. */
function nameOfUnavailable(
  item: ItemRef,
  { content, offer }: SheetVocabulary,
): string | undefined {
  switch (item.kind) {
    case "material":
    case "hardware":
      return nameOfHeldTier(item.kind, item.tierId, offer, content);
    case "finish":
      return nameOfPaletteEntry(item.finishId, content);
    case "handle":
      return content.panel.handleLabels[item.handle];
    case "accessory":
      return undefined;
  }
}

function nameOfPaletteEntry(
  finishId: string,
  content: Content,
): string | undefined {
  const finish = paletteFinishOf(finishId);
  return finish === undefined ? undefined : nameOfFinish(finish, content);
}

/** The palette entry an id names, or nothing for an id no palette holds. */
function paletteFinishOf(finishId: string): Finish | undefined {
  const entryId = PALETTE_ENTRY_IDS.find((known) => known === finishId);
  return entryId === undefined ? undefined : paletteFinish(entryId);
}

/** A palette entry by its name, a free colour by its value (which is all it has), as the pill says them. */
function nameOfFinish(finish: Finish, content: Content): string {
  return finish.kind === "palette-entry"
    ? content.finishName(finish.entryId)
    : content.globalSettings.pillColourValue(finish.value);
}

/** What a resolved row says when no choice of the sheet's own resolved it: what the kitchen carries in its place now. */
function nameNowApplying(
  item: ItemRef,
  { design, vocabulary }: RowContext,
): string | undefined {
  const { content, offer } = vocabulary;
  switch (item.kind) {
    case "material":
    case "hardware":
      return nameOfCurrentTier(item.kind, design, offer, content);
    case "finish":
      return nameOfColourAsItWas(item.finishId, design, content);
    case "handle":
      return nameOfHandleAsItWas(item.handle, design, content);
    case "accessory":
      return undefined;
  }
}

/**
 * A handle row resolved without a choice of the sheet's: availability came back, so the design still stores the handle at
 * some level and it is named as it is. A handle the design no longer stores has nothing to say: no other handle replaced
 * it, so the kitchen's own handle is never named in its place.
 */
function nameOfHandleAsItWas(
  handle: Handle,
  design: Design,
  content: Content,
): string | undefined {
  return handlesStoredIn(design).includes(handle)
    ? content.panel.handleLabels[handle]
    : undefined;
}

function nameOfCurrentTier(
  kind: TierKind,
  design: Design,
  offer: TierOfferAnswer,
  content: Content,
): string | undefined {
  const tierId =
    kind === "material"
      ? design.settings?.materialTierId
      : design.settings?.hardwareTierId;
  return tierId === undefined
    ? undefined
    : nameOfHeldTier(kind, tierId, offer, content);
}

/**
 * A colour row resolved without a choice of the sheet's: availability came back, so the design still names the colour and
 * it is named as it was. A colour the design no longer stores has nothing to say: the material's reset replaced it, and
 * the colour the kitchen returned to is never named in its place (ADR 0081).
 */
function nameOfColourAsItWas(
  finishId: string,
  design: Design,
  content: Content,
): string | undefined {
  const named = paletteFinishOf(finishId);
  if (
    named !== undefined &&
    finishesStoredIn(design).some((stored) => sameFinish(stored, named))
  ) {
    return nameOfFinish(named, content);
  }
  return undefined;
}

function nameOfHeldTier(
  kind: TierKind,
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

/** One option in a tier chooser. A struck one is the kitchen's own switched-off tier: shown, never choosable. */
export interface ChooserOptionView {
  readonly tierId: string;
  readonly name: string;
  readonly description: string;
  readonly isStruck: boolean;
}

/** One tier group's chooser. Carries no figure: the design cannot be priced until the choice is made, so no delta is
 *  measured, and the bar says the price comes after "Aplică". */
export interface ChooserView {
  readonly kind: TierKind;
  readonly heading: string;
  readonly appliesTo: string;
  readonly hint: string;
  readonly options: readonly ChooserOptionView[];
  readonly struckNote: string;
  readonly priceLine: string;
}

/** One option in a colour or handle chooser: its name, and for a colour its swatch. A struck one is the kitchen's own
 *  switched-off item. */
export interface AppearanceOptionView {
  readonly item: ItemRef;
  readonly optionId: string;
  readonly name: string;
  /** What the adapter paints the colour as, so the swatch, the pill and the 3D scene share one value. */
  readonly swatch:
    | { readonly colour: string; readonly isWood: boolean }
    | undefined;
  readonly isStruck: boolean;
}

/** The chooser's shape for a colour or a handle: the options are the row's own `remaining`, with no line saying how
 *  many cabinets it applies to, because a replacement reaches only the cabinets wearing the replaced item. */
export interface AppearanceChooserView {
  readonly kind: "finish" | "handle";
  readonly heading: string;
  readonly hint: string;
  readonly options: readonly AppearanceOptionView[];
  readonly struckNote: string;
  readonly priceLine: string;
}

/** Whichever chooser a row opens. */
export type SheetChooser = ChooserView | AppearanceChooserView;
export type SheetChooserOption = ChooserOptionView | AppearanceOptionView;

/** What picking an option names, across both kinds of chooser. */
export function optionIdOf(option: SheetChooserOption): string {
  return "tierId" in option ? option.tierId : option.optionId;
}

/** The chooser for a row, or nothing where it cannot be drawn (a tier row with no book: the sheet is then not open). */
export function describeRowChooser({
  row,
  design,
  catalog,
  vocabulary,
}: {
  readonly row: ReplacementRequired;
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly vocabulary: SheetVocabulary;
}): SheetChooser | undefined {
  return row.item.kind === "finish" || row.item.kind === "handle"
    ? describeAppearanceChooser(row, vocabulary)
    : describeChooser({ row, design, catalog, vocabulary });
}

/** The tier chooser for a row, or nothing where the offer cannot be read (no book: the sheet is then not open at all). */
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
    appliesTo: copy.chooserAppliesTo(
      countDisplayedBodies(projectDesignForDisplay(design, catalog)),
    ),
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
    return tier === undefined ? [] : [remainingOptionOf(tier, content)];
  });
}

/** Only the kitchen's own tier, and only where the book still holds it: a vanished tier has no name to strike. */
function struckOptions(
  ownTierId: string,
  group: OfferedTierGroup,
  content: Content,
): readonly ChooserOptionView[] {
  const own = group.switchedOffTiers.find((tier) => tier.tierId === ownTierId);
  return own === undefined ? [] : [struckOptionOf(own, content)];
}

function remainingOptionOf(
  tier: OfferedTier,
  content: Content,
): ChooserOptionView {
  return {
    tierId: tier.tierId,
    name: tierNameOf(tier, content),
    description: content.bookText(tier.description, tier.descriptionKey),
    isStruck: false,
  };
}

function struckOptionOf(
  tier: OfferedTier,
  content: Content,
): ChooserOptionView {
  return { ...remainingOptionOf(tier, content), isStruck: true };
}

/** The colour or handle chooser for a row: its remaining options in the domain's order, then the kitchen's own item struck. */
function describeAppearanceChooser(
  row: ReplacementRequired,
  { content, copy }: SheetVocabulary,
): AppearanceChooserView | undefined {
  const { item } = row;
  if (item.kind !== "finish" && item.kind !== "handle") return undefined;
  const options = [
    ...row.remaining.flatMap((remaining) =>
      optionalOption(remainingAppearanceOptionOf(remaining, content)),
    ),
    ...optionalOption(struckAppearanceOptionOf(item, content)),
  ];
  return {
    kind: item.kind,
    heading: kindLabelOf(item.kind, content),
    hint: copy.chooseFromRemaining,
    options,
    struckNote: copy.strikethroughNote,
    priceLine: copy.priceAfterApplying,
  };
}

function optionalOption(
  option: AppearanceOptionView | undefined,
): readonly AppearanceOptionView[] {
  return option === undefined ? [] : [option];
}

function remainingAppearanceOptionOf(
  item: ItemRef,
  content: Content,
): AppearanceOptionView | undefined {
  if (item.kind === "handle") {
    return {
      item,
      optionId: item.handle,
      name: content.panel.handleLabels[item.handle],
      swatch: undefined,
      isStruck: false,
    };
  }
  if (item.kind !== "finish") return undefined;
  const finish = paletteFinishOf(item.finishId);
  if (finish === undefined) return undefined;
  const { color, isWood } = swatchOf(finish);
  return {
    item,
    optionId: item.finishId,
    name: nameOfFinish(finish, content),
    swatch: { colour: color, isWood },
    isStruck: false,
  };
}

function struckAppearanceOptionOf(
  item: ItemRef,
  content: Content,
): AppearanceOptionView | undefined {
  const option = remainingAppearanceOptionOf(item, content);
  return option === undefined ? undefined : { ...option, isStruck: true };
}

/** What a colour or handle choice asks of the store: the item replaced and the one chosen, as the values it stores. */
export function appearanceReplacementOf(
  row: ReplacementRequired,
  option: AppearanceOptionView,
): AppearanceReplacement | undefined {
  const { item } = row;
  if (item.kind === "handle" && option.item.kind === "handle") {
    return { kind: "handle", from: item.handle, to: option.item.handle };
  }
  if (item.kind !== "finish" || option.item.kind !== "finish") return undefined;
  const from = paletteFinishOf(item.finishId);
  const to = paletteFinishOf(option.item.finishId);
  return from === undefined || to === undefined
    ? undefined
    : { kind: "finish", from, to };
}

/** The sentence a refused press is answered with: the setting's name, then the domain's reason, as the settings sheet says it. */
export function describeApplyRefusal({
  kind,
  reason,
  design,
  content,
}: {
  readonly kind: ReplacementKind;
  readonly reason: RejectionReason;
  readonly design: Design;
  readonly content: Content;
}): string {
  return content.globalSettings.applyRefused(
    kindLabelOf(kind, content),
    content.rejection(reason, cornerDirectionOf(design.room)),
  );
}

/** The order the confirmation says what changed in. */
const CHANGE_ORDER: readonly ReplacementKind[] = [
  "material",
  "hardware",
  "finish",
  "handle",
];

/**
 * The confirmation's lines: the material, hardware, colour and handle, then
 * accessories removed that the sheet did not show, then the merged prices sentence when the second `GET` says so. Each
 * item the customer replaced is one line; the "price was updated" sentence closes the last of them, once.
 */
export function describeConfirmationLines({
  changes,
  accessoryNames = [],
  alsoUpdated,
  copy,
}: {
  readonly changes: readonly {
    readonly kind: ReplacementKind;
    readonly name: string;
  }[];
  readonly accessoryNames?: readonly string[];
  readonly alsoUpdated: boolean;
  readonly copy: ReplacementSheetCopy;
}): readonly string[] {
  const ordered = CHANGE_ORDER.flatMap((kind) =>
    changes.filter((change) => change.kind === kind),
  );
  const lines = ordered.map(({ kind, name }, position) =>
    position === ordered.length - 1
      ? copy.changed(kind, name)
      : copy.changedWithoutPriceSentence(kind, name),
  );
  return [
    ...lines,
    ...accessoryNames.map(copy.accessoryRemoved),
    ...(alsoUpdated ? [copy.alsoUpdated] : []),
  ];
}
