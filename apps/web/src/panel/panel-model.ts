// `DEVELOPMENT-SPEC.md` §9's panel as a value (§12: no product logic in components). Disabled states are read off
// `describeSelection`'s numbers; no domain rule is re-derived (§11 row 24 asks `isKnownKind`).
import {
  HandleSchema,
  isKnownKind,
  normaliseBand,
  sameFinish,
  type CatalogOffer,
  type ColourControl,
  type CornerDirection,
  type DesignWall,
  type Finish,
  type Handle,
  type Material,
  type MaterialLookup,
  type PaletteEntry,
  type PaletteEntryId,
  type PricingResult,
  type RejectionReason,
  type SelectionMeta,
  type WidthOption,
  type WidthRangeMm,
} from "@lemnaria/configurator-domain";

import { swatchOf } from "@lemnaria/three-adapter";

import type { SaveStatus } from "@/persistence/save-coalescer";
import { describeEditability, type Editability } from "@/store/editability";
import type { WriteAccess } from "@/store/configurator-store";

import { crossesOnScreen, type Content } from "@/i18n/content";
import {
  describeFlaggedTotalWarning,
  describeStartingPrice,
  type PriceFigure,
} from "@/price/starting-price";

import { findCabinetThumbnailUrl } from "./cabinet-thumbnails";
import type { WidthSteps } from "@lemnaria/configurator-domain";

export interface PanelHeader {
  readonly label: string;
  /** `Perete X · band · W × H mm`. */
  readonly detail: string;
}

export interface OfferRow {
  readonly buildId: string;
  readonly label: string;
  /** §9's secondary line: what this body would build to in this opening or, when disabled, §9's reason. Chosen here,
   *  not by the component, which would otherwise hold a rule §12 keeps out. */
  readonly secondaryLine: string;
  /** §9: the current row is badged ACTUAL rather than hidden. */
  readonly isCurrent: boolean;
  /** Whether §9's row is clickable, resolved here rather than inferred from the copy downstream. */
  readonly isDisabled: boolean;
  /** Mockup frame 2B's thumbnail URL, resolved here; absent when no drawing is vendored (see
   *  `findCabinetThumbnailUrl`). */
  readonly thumbnailUrl?: string;
}

export interface ChoiceChip<TValue> {
  readonly value: TValue;
  readonly label: string;
  readonly isActive: boolean;
  /** Resolved here as for `OfferRow.isDisabled`: a chip the browser cannot apply is a §9 "never offer what cannot be
   *  satisfied" case. */
  readonly isDisabled: boolean;
  /** §13.1: a greyed control carries its reason. A chip has no secondary line, so it carries its own; absent when
   *  clickable, as a reason beside a working control is noise. */
  readonly reason?: string;
}

/** §9's three width states on ADR 0035 decision 3's discrete control: `blocked` is dashed and unclickable, `free` is
 *  a legal move. A stepper button has no third state and carries `isDisabled` alone. */
export type WidthChipState = "active" | "free" | "blocked";

export interface WidthChip {
  readonly widthMm: number;
  readonly label: string;
  /** §9's vocabulary, which the component styles by. It does not decide clickability from it. */
  readonly state: WidthChipState;
  /** Clickability is §9's rule, published resolved so the component cannot answer it differently. */
  readonly isDisabled: boolean;
  /** §13.1's reason: the engine's own localized sentence, no new vocabulary (ADR 0032 decision 2). Absent on `free`
   *  and an ordinary `active` chip, present on a fixed-width cabinet's; a locked panel replaces it with
   *  `disabledReason`. */
  readonly reason?: string;
}

export interface RejectionSection {
  readonly kind: "rejection";
  readonly message: string;
}

/** §11 row 16: a body that offers nothing never produces a refusal, so the explanation renders as its own section
 *  rather than leaving the panel empty. */
export interface StructuralSection {
  readonly kind: "structural";
  readonly title: string;
  readonly message: string;
}

export interface ReplaceSection {
  readonly kind: "replace";
  readonly title: string;
  /** §9: derived, never a literal; absent when there is nothing to count, as "0 corpuri" is the bare "0" §9 forbids. */
  readonly countLine?: string;
  readonly rows: readonly OfferRow[];
  /** §9's zero-result sentence, saying what to clear. Present exactly when `rows` is empty. */
  readonly emptyLine?: string;
}

/** One entry of a material's declared palette. `value` is its declared id (React key, test id); `swatchColor` is the
 *  adapter's own hex, as a stylesheet cannot import a constant; `isWood` lets the swatch draw a grain from that hex. */
export interface FinishChip extends ChoiceChip<PaletteEntryId> {
  readonly finish: Finish;
  readonly swatchColor: string;
  readonly isWood: boolean;
}

/** §9's Finisaj section in the shape the material declares (ADR 0071 decision 3). `control` is copied from
 *  `Material.colourControl.shape`, never inferred from the entry count (a third wood must not make a decor list). */
export type FinishSection = PaletteSwatchSection | RalPickerSection;

/** The controls offering a declared palette: PAL's decor list and veneer's two woods. They share a projection but
 *  not a rendering; `control` says which, rather than the component inferring it from `chips.length`. */
export interface PaletteSwatchSection {
  readonly kind: "finish";
  readonly control: "decor-list" | "wood-swatches";
  readonly title: string;
  readonly chips: readonly FinishChip[];
  /** §9's way back out of an override (`FollowTheKitchenChip`). Absent on the global settings sheet, which has no
   *  level above it to follow (ADR 0099 decision 9). */
  readonly follow?: FollowTheKitchenChip;
  readonly note: string;
}

/** "Follow the kitchen's colour" (ADR 0099 decision 8): without a control that un-chooses, the first swatch tap pins
 *  a cabinet out of the kitchen's colour for ever. A `ChoiceChip`, active when the cabinet chose nothing. */
export type FollowTheKitchenChip = ChoiceChip<"follow">;

/** MDF: a colour picker, as painted MDF can be any colour. `value` is the six-digit hex it opens on: the body's own
 *  colour, else the material's default. Present only on an MDF kitchen, never present-and-disabled (§13.1). */
export interface RalPickerSection {
  readonly kind: "finish";
  readonly control: "ral-picker";
  readonly title: string;
  /** The control's own label, which a colour input has no room to carry inside itself. */
  readonly label: string;
  readonly value: string;
  readonly isDisabled: boolean;
  /** §13.1's reason beside the greyed control, on the same condition a chip carries one. */
  readonly reason?: string;
  /** ADR 0099 decision 8's way back out of an override; a picker needs it most, as every hex it produces is a
   *  choice. Absent on the global settings sheet. */
  readonly follow?: FollowTheKitchenChip;
  readonly note: string;
}

export interface HandleSection {
  readonly kind: "handle";
  readonly title: string;
  readonly chips: readonly ChoiceChip<Handle>[];
  /** Present only when no handle was chosen and §6.5's default is what the scene is showing. */
  readonly note?: string;
}

/** `+50` / `−50` from where the body stands, each button disabled at its bound carrying the engine's reason rather
 *  than absent (ADR 0035 decision 1). */
export interface WidthStepButton {
  /** Which way the step goes, published so nothing downstream re-derives the sign. */
  readonly direction: WidthStepDirection;
  /** The width this button would resize to; outside the column's candidate set at a bound, which disables the
   *  button. */
  readonly widthMm: number;
  readonly label: string;
  readonly ariaLabel: string;
  readonly isDisabled: boolean;
  /** §13.1's reason: at a bound it tells the customer §7's 800 ceiling, §2's 300 floor, the entry's floor or the
   *  hood floor (ADR 0035 decision 6), in the engine's own words. Absent on a working button. */
  readonly reason?: string;
}

export type WidthStepDirection = "narrower" | "wider";

/** §9's width control where the width is free (ADR 0035 decision 1). */
export interface WidthStepperSection {
  readonly kind: "width";
  readonly control: "stepper";
  readonly title: string;
  readonly valueLabel: string;
  /** Narrower first, so the pair reads left-to-right the way the numbers run. */
  readonly steps: readonly [WidthStepButton, WidthStepButton];
  readonly note: string;
}

/** §9's width control where widths are genuinely a set (ADR 0035 decision 3): a dishwasher is 450 or 600, and `+50`
 *  would offer eleven widths nobody manufactures. */
export interface WidthChoiceSection {
  readonly kind: "width";
  readonly control: "choice";
  readonly title: string;
  readonly valueLabel: string;
  readonly chips: readonly WidthChip[];
  readonly note: string;
}

export type WidthSection = WidthStepperSection | WidthChoiceSection;

export type PanelSection =
  | RejectionSection
  | StructuralSection
  | ReplaceSection
  | FinishSection
  | HandleSection
  | WidthSection;

export interface PanelFooter {
  /** Whether §9's Șterge corpul exists (a structural body has no delete). Distinct from `isRemoveDisabled`: a
   *  read-only browser still sees it, disabled with a reason, as hiding it would say the body cannot be deleted. */
  readonly canDelete: boolean;
  readonly isRemoveDisabled: boolean;
  /** Why **Șterge corpul** is dimmed, for the same §13.1 reason the chips carry one. Present
   *  exactly when `isRemoveDisabled` is true and the control is shown at all. */
  readonly removeDisabledReason?: string;
  readonly removeLabel: string;
  readonly doneLabel: string;
  /** §9 item 7's price: the starting-price figure, its label and rounded amount. Absent when no price was supplied or
   *  pricing failed, rendering the same either way: a zero or dash would read as free. */
  readonly price?: PriceFigure;
  /** ADR 0065 decision 7b's warning, on the same condition the bar flags its total; present only where `price` is.
   *  On mobile the footer carries the only total on screen (decision 6). */
  readonly overflowWarning?: string;
}

/** Why this panel cannot write. `read-only` is no error (ADR 0019); `read-only-refused` means an edit will never be
 *  stored; `save-failed` (retry armed) and `save-stopped` need different sentences; `save-conflict` loses nothing. */
export interface PanelNotice {
  readonly kind:
    | "read-only"
    | "read-only-refused"
    | "access-checking"
    | "access-uncheckable"
    | "save-failed"
    | "save-stopped"
    | "save-conflict";
  /** Published resolved so the component styles rather than classifies. */
  readonly tone: "info" | "error";
  readonly message: string;
  /** What this notice offers, in reading order. Absent, never empty, when nothing is pressable; each entry is a
   *  label and an action kind, since what a kind does is the shell's wiring. */
  readonly actions?: readonly PanelNoticeAction[];
}

/** One action on a notice. `kind` names what the shell must do, deliberately not a callback, so `describePanel`
 *  stays a pure projection comparable as a value. `reload` is a page reload, as it discards all client state. */
export interface PanelNoticeAction {
  readonly kind: "retry-access-check" | "reload-stored" | "overwrite-stored";
  readonly label: string;
}

/** Nothing selected is a real panel state, not a missing one: frames 2A and D2A show no panel at
 *  all and put the instruction copy over the scene. The shell renders nothing for this. */
export interface ClosedPanel {
  readonly kind: "closed";
}

export interface OpenPanel {
  readonly kind: "open";
  readonly header: PanelHeader;
  /** Absent when there is nothing to say. Above §9's sections, since the top of the body is reserved for the
   *  rejection banner and this concerns the whole panel. */
  readonly notice?: PanelNotice;
  /** §9's order, already applied. A section absent from this list is one whose flag was false. */
  readonly sections: readonly PanelSection[];
  readonly footer: PanelFooter;
}

export type PanelView = ClosedPanel | OpenPanel;

export interface DescribePanelInput {
  readonly content: Content;
  /** `cornerDirectionOf(design.room)`, read once here (ADR 0129 D8). Optional, defaulting to left (`directionOf`): a
   *  room carrying no direction is a valid, unchanged state. */
  readonly direction?: CornerDirection;
  /** `undefined` when nothing is selected, or when the selection no longer resolves. */
  readonly meta: SelectionMeta | undefined;
  readonly offers: readonly CatalogOffer[];
  /** What the catalogue can be built to at all, never derived from `offers` (empty when nothing fits); `undefined`
   *  means an empty catalogue. Required though possibly `undefined`, so a dropped wiring is a compile error. */
  readonly buildableWidthSpanMm: WidthRangeMm | undefined;
  /** The column's candidate widths, already judged by `setWidth`: "a chip is free iff the command succeeds" holds
   *  only if this module does not reimplement it. Read by the discrete control only; empty means no width section. */
  readonly widthOptions: readonly WidthOption[];
  /** ADR 0035 decision 1's two step candidates, each judged by `setWidth` (see `width-steps.ts`). `undefined` where
   *  `widthOptions` is empty; deliberately ignored when the column's widths are a set. */
  readonly widthSteps?: WidthSteps | undefined;
  /** ADR 0035 decision 3's discriminator, from `ColumnWidthChoices.widthRangesMm` (`isSteppedColumn`). Optional;
   *  absent means the discrete choice, as a chip row with the right widths is never wrong, only more clicks. */
  readonly widthRanges?: readonly WidthRangeMm[];
  readonly rejection: RejectionReason | null;
  /** The design's material, already looked up; it decides the shape of the Finisaj control. Required, no safe
   *  default. A `MaterialLookup`: an undeclared tier is reachable (ADR 0078 decision 3). */
  readonly material: MaterialLookup;
  /** The current design priced as `usePricedDesign` derived it, never a stored total or a figure computed here
   *  (§12). Optional; absent means no price. Dropped wiring is caught by `price-wiring.adversarial.test.ts`. */
  readonly pricing?: PricingResult;
  /** §5.2 cannot run without the scene's `BodyProbe`, so until it attaches every offer row is
   *  disabled with that reason rather than tapped and then refused. */
  readonly isBodyProbeAttached: boolean;
  /** Whether this browser holds the design's write credential, or `"checking"` / `"check-failed"` before a load
   *  answers. Advisory, never an authorisation decision (`hasWriteCredentialFor`); only `true` opens the controls. */
  readonly canWrite: WriteAccess;
  readonly saveStatus: SaveStatus;
}

/** §9's half of the one editability rule: an alias, with `store/editability.ts` deciding it so no second surface can
 *  decide differently. */
type PanelEditability = Editability;

const CLOSED_PANEL: ClosedPanel = { kind: "closed" };

export function describePanel(input: DescribePanelInput): PanelView {
  const { meta } = input;
  if (!meta) return CLOSED_PANEL;
  const editability = describeEditability(input, input.content.panel);
  const notice = describeNotice(input, editability);
  return {
    kind: "open",
    header: describeHeader(meta, input.content),
    ...(notice ? { notice } : {}),
    sections: collectSections(input, meta, editability),
    footer: describeFooter({
      meta,
      content: input.content,
      editability,
      rejection: input.rejection,
      ...(input.pricing ? { pricing: input.pricing } : {}),
    }),
  };
}

/** Everything §9's footer row is decided from, gathered into one argument. */
interface FooterContext {
  readonly content: Content;
  readonly meta: SelectionMeta;
  readonly editability: PanelEditability;
  readonly rejection: RejectionReason | null;
  readonly pricing?: PricingResult;
}

function describeFooter(context: FooterContext): PanelFooter {
  const { meta, editability } = context;
  const price = describeFooterPrice(context);
  const warning = price ? describeFooterPriceWarning(context) : undefined;
  return {
    canDelete: meta.canDelete,
    isRemoveDisabled: editability.isReadOnly,
    ...(editability.isReadOnly
      ? { removeDisabledReason: editability.disabledReason }
      : {}),
    removeLabel: context.content.panel.remove,
    doneLabel: context.content.panel.done,
    ...(price ? { price } : {}),
    ...(warning === undefined ? {} : { overflowWarning: warning }),
  };
}

/** The same question the price bar asks of the same priced design, through the same function — so
 *  the two totals cannot disagree about whether this kitchen fits. */
function describeFooterPriceWarning(
  context: FooterContext,
): string | undefined {
  const { pricing } = context;
  if (!pricing?.ok) return undefined;
  return describeFlaggedTotalWarning(pricing.priced, context.content.price);
}

function describeFooterPrice(context: FooterContext): PriceFigure | undefined {
  const { pricing } = context;
  if (!pricing?.ok) return undefined;
  return describeStartingPrice({
    totalMinor: pricing.priced.totalMinor,
    copy: context.content.price,
  });
}

/** `undefined` when there is nothing to say, which is the ordinary case: a writable panel whose
 *  last save is `idle` or in flight says nothing at all, because "saved" is not news. */
function describeNotice(
  input: DescribePanelInput,
  editability: PanelEditability,
): PanelNotice | undefined {
  if (editability.isReadOnly) return describeLockedNotice(input);
  if (input.saveStatus === "error")
    return {
      kind: "save-failed",
      tone: "error",
      message: input.content.panel.saveFailedNotice,
    };
  if (input.saveStatus === "stopped")
    return {
      kind: "save-stopped",
      tone: "error",
      message: input.content.panel.saveStoppedNotice,
    };
  if (input.saveStatus === "conflict")
    return describeConflictNotice(input.content);
  return undefined;
}

/** The two-way save-conflict choice. Reload is first, as the conservative one; overwrite discards a version the
 *  customer cannot see. The panel stays unlocked: the on-screen edit is real. */
function describeConflictNotice(content: Content): PanelNotice {
  return {
    kind: "save-conflict",
    tone: "error",
    message: content.panel.saveConflictNotice,
    actions: [
      { kind: "reload-stored", label: content.panel.saveConflictReloadLabel },
      {
        kind: "overwrite-stored",
        label: content.panel.saveConflictOverwriteLabel,
      },
    ],
  };
}

/** Which sentence a locked panel earned: `"checking"` (a wait) and `"check-failed"` (a failure with a retry) may not
 *  borrow `readOnlyNotice`, which asserts an unestablished permission. */
function describeLockedNotice(input: DescribePanelInput): PanelNotice {
  if (input.canWrite === "checking")
    return {
      kind: "access-checking",
      tone: "info",
      message: input.content.panel.accessCheckingNotice,
    };
  if (input.canWrite === "check-failed")
    return {
      kind: "access-uncheckable",
      tone: "error",
      message: input.content.panel.accessUncheckableNotice,
      actions: [
        {
          kind: "retry-access-check",
          label: input.content.panel.accessRetryLabel,
        },
      ],
    };
  // Narrowed to a boolean by the checks above; `isReadOnly` cannot rely on that, as the string states are truthy there,
  // so it asks `!== true`.
  if (!input.canWrite)
    return {
      kind: "read-only",
      tone: "info",
      message: input.content.panel.readOnlyNotice,
    };
  return {
    kind: "read-only-refused",
    tone: "error",
    message: input.content.panel.readOnlyRefusedNotice,
  };
}

function describeHeader(meta: SelectionMeta, content: Content): PanelHeader {
  return {
    label: content.bodyLabel(meta.label),
    // The band the selection carries is resolved here: `SelectionMeta` publishes the fact, not a second presentational
    // copy.
    detail: content.panel.headerMeta(
      meta.wall,
      content.bandLabel(meta.band),
      meta.widthMm,
      meta.heightMm,
    ),
  };
}

/** §9's order, expressed only here: rejection banner, replace, finish, handle, width. The banner is first so it is
 *  visible on the fixed-width bodies that refuse most. */
function collectSections(
  input: DescribePanelInput,
  meta: SelectionMeta,
  editability: PanelEditability,
): PanelSection[] {
  const sections: PanelSection[] = [];
  if (input.rejection) {
    sections.push({
      kind: "rejection",
      // The side word's screen crossing depends on the selection's wall (`crossesOnScreen`), not only the room's
      // direction, so `meta.wall` is the wall a side-carrying refusal names.
      message: input.content.rejection(
        input.rejection,
        input.direction,
        meta.wall,
      ),
    });
  }
  // The refusal renders whenever declared, offers or not (§11 row 16): the corner has `canFinish`, so Finisaj must not
  // hide why there is no swap list or delete. Pushed before the offers so the body is read first.
  const structural = describeStructuralSection(meta, input.content);
  if (structural) sections.push(structural);
  sections.push(...collectOfferedSections(input, meta, editability));
  return sections;
}

/** Everything §9 offers on this selection in §9's order, split from `describeStructuralSection` so what the body is
 *  and what can be done to it stay separable. */
function collectOfferedSections(
  input: DescribePanelInput,
  meta: SelectionMeta,
  editability: PanelEditability,
): PanelSection[] {
  const sections: PanelSection[] = [];
  const replace = describeReplaceSection(input, meta, editability);
  if (replace) sections.push(replace);
  if (meta.canFinish) {
    const finish = describeFinishSection(
      input.material,
      meta.finish,
      editability,
      input.content,
    );
    // The follow chip is added here, not in the projection (ADR 0099 decisions 8, 9): the global settings sheet shares
    // it and has no level above to follow, so a control there would be an offer this product cannot satisfy (§9).
    if (finish)
      sections.push(
        followingTheKitchen(finish, meta, editability, input.content),
      );
  }
  if (meta.canHandle)
    sections.push(describeHandleSection(meta, editability, input.content));
  // Not gated on `meta.canWidth` (ADR 0049): `fixedWidth` must not hide the section a fixed-width body's record
  // requires. Whether there is anything to render is the domain's answer (`columnWidthChoices`).
  const width = describeWidthSection(input, meta, editability);
  if (width) sections.push(width);
  return sections;
}

/** `undefined` when the catalogue declared no reason, as for every ordinary body; a body offering nothing and
 *  declaring no reason is a catalogue gap, left visible as the empty panel it is. */
function describeStructuralSection(
  meta: SelectionMeta,
  content: Content,
): StructuralSection | undefined {
  if (meta.structuralReason === undefined) return undefined;
  return {
    kind: "structural",
    title: content.panel.structuralTitle,
    message: content.panel.structuralReasons[meta.structuralReason],
  };
}

/** `undefined` when §9 renders no replace section: the selection refuses replacement, or §11 row 24's unknown kind
 *  (no fallback set, which would offer refused rows). An empty list keeps its section, which needs a sentence. */
function describeReplaceSection(
  input: DescribePanelInput,
  meta: SelectionMeta,
  editability: PanelEditability,
): ReplaceSection | undefined {
  if (!meta.canReplace) return undefined;
  if (!meta.empty && !isKnownKind(meta.kind)) return undefined;

  const rows = input.offers.map((offer) =>
    describeOfferRow(offer, {
      isBodyProbeAttached: input.isBodyProbeAttached,
      editability,
      content: input.content,
    }),
  );
  const title = meta.empty
    ? input.content.panel.replaceTitleEmpty
    : input.content.panel.replaceTitleOccupied;
  if (rows.length === 0) {
    return {
      kind: "replace",
      title,
      rows,
      emptyLine: describeEmptyLine(
        meta,
        input.buildableWidthSpanMm,
        input.content,
      ),
    };
  }
  return {
    kind: "replace",
    title,
    countLine: describeCountLine(meta, rows.length, input.content),
    rows,
  };
}

/** The independent reasons a row can be unclickable. Read-only wins; then a domain refusal; then a
 *  model that is still preparing an otherwise valid insertion. */
interface OfferRowAvailability {
  readonly isBodyProbeAttached: boolean;
  readonly editability: PanelEditability;
  readonly content: Content;
}

/** §9's row: the size it would build to, or the reason the whole panel is unclickable. No refused arm (`offersFor`
 *  publishes only insertable rows), so the two reasons left are read-only and a probe still attaching. */
function describeOfferRow(
  offer: CatalogOffer,
  availability: OfferRowAvailability,
): OfferRow {
  // ADR 0033: the built width picks the drawing for a merged cabinet, exactly as it picks the label.
  const thumbnailUrl = findCabinetThumbnailUrl(
    offer.buildId,
    offer.buildsToWidthMm,
  );
  return {
    buildId: offer.buildId,
    label: availability.content.bodyLabel(offer.label),
    secondaryLine: describeOfferSecondaryLine(offer, availability),
    isCurrent: offer.isCurrent,
    isDisabled:
      availability.editability.isReadOnly || !availability.isBodyProbeAttached,
    ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
  };
}

function describeOfferSecondaryLine(
  offer: CatalogOffer,
  { isBodyProbeAttached, editability, content }: OfferRowAvailability,
): string {
  if (editability.isReadOnly) return editability.disabledReason;
  if (!isBodyProbeAttached) return content.panel.probeUnavailable;
  return content.panel.offerSize(offer.buildsToWidthMm, offer.buildsToHeightMm);
}

function describeCountLine(
  meta: SelectionMeta,
  count: number,
  content: Content,
): string {
  if (meta.empty)
    return content.panel.countForSlot(count, meta.openWmm, meta.openHmm);
  const words = content.panel.bandWords[normaliseBand(meta.band)];
  return content.panel.countForBody(
    count,
    count === 1 ? words.one : words.many,
    meta.widthMm,
  );
}

/** §9's zero-result sentence, never a bare 0. A space wider than any cabinet or narrower than the narrowest may be
 *  left, as clearing would widen it (ADR 0037). Bounds come from `buildableWidthSpanMm`, not a panel constant. */
function describeEmptyLine(
  meta: SelectionMeta,
  span: WidthRangeMm | undefined,
  content: Content,
): string {
  if (!meta.empty)
    return content.panel.noOffersForBody(
      content.panel.bandWords[normaliseBand(meta.band)].one,
    );
  if (span === undefined)
    return content.panel.noOffersForSlot(meta.openWmm, meta.openHmm);
  if (meta.openWmm > span.maxMm)
    return content.panel.noOffersTooWide(meta.openWmm, span.maxMm);
  if (meta.openWmm < span.minMm)
    return content.panel.noOffersTooNarrow(meta.openWmm, span.minMm);
  return content.panel.noOffersForSlot(meta.openWmm, meta.openHmm);
}

/** The disabled half of every `ChoiceChip`: §13.1's reason beside the greyed control, spread in so a clickable chip
 *  has no `reason` field. */
function describeChipAvailability(editability: PanelEditability): {
  readonly isDisabled: boolean;
  readonly reason?: string;
} {
  return editability.isReadOnly
    ? { isDisabled: true, reason: editability.disabledReason }
    : { isDisabled: false };
}

/** §9's Finisaj control by the material's declared shape, never the entry count (ADR 0071 decision 3). `undefined`
 *  for an undeclared material. Shared with the global settings sheet (ADR 0099). */
export function describeFinishSection(
  lookup: MaterialLookup,
  chosen: Finish | undefined,
  editability: PanelEditability,
  content: Content,
): FinishSection | undefined {
  if (lookup.kind === "undeclared") return undefined;
  const { material } = lookup;
  if (material.colourControl.shape === "ral-picker") {
    return describeRalPickerSection(material, chosen, editability, content);
  }
  return describeSwatchSection(
    material.colourControl,
    chosen,
    editability,
    content,
  );
}

/** §9's finish section with the follow chip: active when the cabinet carries no colour of its own, as absence is
 *  following, so exactly one choice always stands (ADR 0099 decision 8). */
function followingTheKitchen(
  section: FinishSection,
  meta: SelectionMeta,
  editability: PanelEditability,
  content: Content,
): FinishSection {
  return {
    ...section,
    follow: {
      value: "follow",
      label: content.panel.finishFollowsKitchen,
      isActive: meta.finish === undefined,
      ...describeChipAvailability(editability),
    },
  };
}

/** The two list-shaped controls, differing only in `control`, carried across from the declaration so neither can
 *  become the other as its entries change. */
function describeSwatchSection(
  control: Extract<ColourControl, { entries: readonly PaletteEntry[] }>,
  chosen: Finish | undefined,
  editability: PanelEditability,
  content: Content,
): PaletteSwatchSection {
  return {
    kind: "finish",
    control: control.shape,
    title: content.panel.finishTitle,
    chips: control.entries.map((entry) =>
      describeFinishChip(entry, { chosen, editability, content }),
    ),
    note: content.panel.finishApproximationNote,
  };
}

/** One decor, rendered: the label is the entry's name resolved through the catalogue (ADR 0071 decision 4), never a
 *  supplier code; the colour is the adapter's, so swatch and 3D share one hex. */
function describeFinishChip(
  entry: PaletteEntry,
  against: {
    readonly chosen: Finish | undefined;
    readonly editability: PanelEditability;
    readonly content: Content;
  },
): FinishChip {
  const { chosen, editability, content } = against;
  const finish: Finish = { kind: "palette-entry", entryId: entry.entryId };
  const swatch = swatchOf(finish);
  return {
    value: entry.entryId,
    finish,
    label: content.finishName(entry.entryId),
    swatchColor: swatch.color,
    isWood: swatch.isWood,
    isActive: chosen !== undefined && sameFinish(chosen, finish),
    ...describeChipAvailability(editability),
  };
}

function describeRalPickerSection(
  material: Material,
  chosen: Finish | undefined,
  editability: PanelEditability,
  content: Content,
): RalPickerSection {
  return {
    kind: "finish",
    control: "ral-picker",
    title: content.panel.finishTitle,
    label: content.panel.finishPickerLabel,
    value: describePickerValue(material, chosen),
    ...describeChipAvailability(editability),
    note: content.panel.finishApproximationNote,
  };
}

/** Where the picker opens: the body's own colour, else the material's declared default. Never the body's current
 *  decor read as a hex, which would be an invisible substitution (ADR 0078 decision 4). */
function describePickerValue(
  material: Material,
  chosen: Finish | undefined,
): string {
  const opening =
    chosen?.kind === "free-colour" ? chosen : material.defaultFinish;
  return swatchOf(opening).color;
}

/** §6.5, §11 row 13: with nothing chosen, the marked chip is the one the scene renders (push-to-open on the top row,
 *  a bar handle below), and the note says the mark came from the default. */
function describeHandleSection(
  meta: SelectionMeta,
  editability: PanelEditability,
  content: Content,
): HandleSection {
  const active = meta.handle ?? meta.defaultHandle;
  return {
    kind: "handle",
    title: content.panel.handleTitle,
    chips: HandleSchema.options.map((handle) => ({
      value: handle,
      label: content.panel.handleLabels[handle],
      isActive: active === handle,
      ...describeChipAvailability(editability),
    })),
    ...(meta.handle === undefined
      ? {
          note: content.panel.handleDefaultNote(
            content.panel.handleLabels[active],
          ),
        }
      : {}),
  };
}

/** §9's width section: a stepper where width is free, a discrete choice where it is a set; `undefined` only when
 *  nothing resolves. Candidates are per column, not `meta.sizesMm` (ADR 0035 decision 3). */
function describeWidthSection(
  input: DescribePanelInput,
  meta: SelectionMeta,
  editability: PanelEditability,
): WidthSection | undefined {
  const options = input.widthOptions;
  if (options.length === 0) return undefined;
  const direction = directionOf(input);
  const head = {
    kind: "width",
    title: input.content.panel.widthTitle,
    valueLabel: input.content.panel.widthValue(meta.widthMm),
  } as const;
  const steps = input.widthSteps;
  if (steps && isSteppedColumn(input.widthRanges ?? []))
    return {
      ...head,
      control: "stepper",
      steps: [
        describeWidthStep(
          "narrower",
          steps.narrower,
          editability,
          input.content,
          meta.wall,
          direction,
        ),
        describeWidthStep(
          "wider",
          steps.wider,
          editability,
          input.content,
          meta.wall,
          direction,
        ),
      ],
      // ADR 0129 D8: the reflected sentence for whichever wall/direction pair crosses on screen (`crossesOnScreen`).
      // `widthStepNoteRight` means "the swapped note"; the copy lock pins the leaf name.
      note: crossesOnScreen(meta.wall, direction)
        ? input.content.panel.widthStepNoteRight
        : input.content.panel.widthStepNote,
    };
  return {
    ...head,
    control: "choice",
    chips: options.map((option) =>
      describeWidthChip(
        option,
        editability,
        input.content,
        meta.wall,
        direction,
      ),
    ),
    note: input.content.panel.widthChoiceNote,
  };
}

/** ADR 0129 D8's default: no direction means a left-hand room, `cornerDirectionOf`'s own rule restated for callers
 *  not yet room-aware. */
function directionOf(input: DescribePanelInput): CornerDirection {
  return input.direction ?? "left";
}

/** ADR 0035 decision 3's discriminator, read from `ColumnWidthChoices.widthRangesMm`: a range with `minMm < maxMm`
 *  is free, otherwise a set. Asked of the column, not the body; `fixedWidth` cannot tell the two apart. */
function isSteppedColumn(ranges: readonly WidthRangeMm[]): boolean {
  return ranges.some((range) => range.minMm < range.maxMm);
}

/** One step button: a step is never the current width, so it is available or refused with the engine's reason.
 *  Read-only replaces the reason on both buttons, as a browser that cannot write is told it cannot edit. */
function describeWidthStep(
  direction: WidthStepDirection,
  option: WidthOption,
  editability: PanelEditability,
  content: Content,
  wall: DesignWall,
  cornerDirection: CornerDirection,
): WidthStepButton {
  return {
    direction,
    widthMm: option.widthMm,
    label: content.panel.widthStepLabels[direction],
    ariaLabel: content.panel.widthStepAriaLabels[direction],
    isDisabled: editability.isReadOnly || option.verdict.status !== "available",
    ...describeWidthStepReason(
      option.verdict,
      editability,
      content,
      wall,
      cornerDirection,
    ),
  };
}

/** Spread into the button so a working one carries no `reason` field, as `describeWidthChipReason` does. */
function describeWidthStepReason(
  verdict: WidthOption["verdict"],
  editability: PanelEditability,
  content: Content,
  wall: DesignWall,
  cornerDirection: CornerDirection,
): { readonly reason?: string } {
  if (editability.isReadOnly) return { reason: editability.disabledReason };
  if (verdict.status !== "refused") return {};
  return { reason: content.rejection(verdict.reason, cornerDirection, wall) };
}

/** One candidate width: only `free` is a move; `active` is where the column sits and `blocked` was refused, so state
 *  stays three-valued while clickability is its own answer. Read-only replaces the reason line first. */
function describeWidthChip(
  option: WidthOption,
  editability: PanelEditability,
  content: Content,
  wall: DesignWall,
  cornerDirection: CornerDirection,
): WidthChip {
  const state = describeWidthChipState(option.verdict);
  return {
    widthMm: option.widthMm,
    label: String(option.widthMm),
    state,
    isDisabled: isWidthChipDisabled(state, editability),
    ...describeWidthChipReason(
      option.verdict,
      editability,
      content,
      wall,
      cornerDirection,
    ),
  };
}

function describeWidthChipState(
  verdict: WidthOption["verdict"],
): WidthChipState {
  switch (verdict.status) {
    case "current":
      return "active";
    // ADR 0049: the width a non-resizable cabinet is made at is `active`, since the body stands on it and §9's value
    // label names it; `blocked` would leave the label pointing at a dashed chip.
    case "fixed":
      return "active";
    case "available":
      return "free";
    case "refused":
      return "blocked";
  }
}

/** Spread into the chip, so a clickable one carries no `reason` field at all — the same shape
 *  `describeChipAvailability` uses for the finish and handle swatches. */
function describeWidthChipReason(
  verdict: WidthOption["verdict"],
  editability: PanelEditability,
  content: Content,
  wall: DesignWall,
  cornerDirection: CornerDirection,
): { readonly reason?: string } {
  if (editability.isReadOnly) return { reason: editability.disabledReason };
  if (verdict.status === "current" || verdict.status === "available") return {};
  return { reason: content.rejection(verdict.reason, cornerDirection, wall) };
}

/** Takes the whole three-state union and applies read-only first, so `free` never becomes clickable in a browser
 *  that cannot write. */
function isWidthChipDisabled(
  state: WidthChipState,
  editability: PanelEditability,
): boolean {
  return editability.isReadOnly || state !== "free";
}
