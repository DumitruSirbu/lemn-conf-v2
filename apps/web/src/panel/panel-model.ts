// `DEVELOPMENT-SPEC.md` §9's panel, as a value.
//
// §12 says "no product logic in components". This module is what makes that testable: it takes
// `meta`, the offer list and the last refusal, and returns §9's sections in §9's order with their
// content already resolved. A component below it chooses markup and spacing and decides nothing.
//
// Every disabled state here is read off the numbers `describeSelection` published. Nothing in this
// file attempts an edit to discover whether it is allowed, and nothing re-derives a rule the domain
// already decided — the one apparent exception, §11 row 24's unknown kind, is asked of the domain's
// own `isKnownKind` rather than answered here.
import {
  HandleSchema,
  isKnownKind,
  normaliseBand,
  sameFinish,
  type CatalogOffer,
  type ColourControl,
  type CornerDirection,
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

import type { Content } from "@/i18n/content";
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
  /** §9's secondary line, already chosen between the two candidates: what this body would build to
   *  in this opening, or — when the row is disabled — §9's "a disabled option shows its reason".
   *  Which of the two occupies the line is a content decision, so it is made here and not by the
   *  component, which would otherwise hold a rule §12 keeps out of components. */
  readonly secondaryLine: string;
  /** §9: the current row is badged ACTUAL rather than hidden. */
  readonly isCurrent: boolean;
  /** Whether §9's row is clickable, resolved here rather than inferred from the copy downstream. */
  readonly isDisabled: boolean;
  /** Mockup frame 2B's thumbnail: the URL of this body's front-elevation drawing, resolved here so
   *  the component paints a value rather than looking one up. Absent when the catalogue offers a
   *  body no drawing has been vendored for — see `findCabinetThumbnailUrl`. */
  readonly thumbnailUrl?: string;
}

export interface ChoiceChip<TValue> {
  readonly value: TValue;
  readonly label: string;
  readonly isActive: boolean;
  /** Resolved here for the same reason `OfferRow.isDisabled` is: a chip the browser cannot apply is
   *  a §9 "never offer what cannot be satisfied" case, and the component must not answer it. */
  readonly isDisabled: boolean;
  /** §13.1: a control that cannot be satisfied is greyed and unclickable **with the reason**. An
   *  offer row puts its reason on the secondary line it already has; a chip has no such line, so it
   *  carries one of its own and the component renders it. Absent when the chip is clickable — a
   *  reason beside a control that works is noise. */
  readonly reason?: string;
}

/** §9's three width states, on ADR 0035 decision 3's **discrete** control. `blocked` is dashed and
 *  unclickable; `free` is a legal move. A stepper button has no third state — it is never standing
 *  on the width it offers — so it carries `isDisabled` alone. */
export type WidthChipState = "active" | "free" | "blocked";

export interface WidthChip {
  readonly widthMm: number;
  readonly label: string;
  /** §9's vocabulary, which the component styles by. It does not decide clickability from it. */
  readonly state: WidthChipState;
  /** Which states are clickable is §9's rule, not the component's: published resolved so the
   *  component cannot answer it differently, and so M5's arrival of `free` changes one place. */
  readonly isDisabled: boolean;
  /** §13.1's "greyed and unclickable **with the reason**", for the section that finally has real
   *  reasons to give. It is the engine's own sentence — `setWidth` refused this width and said why —
   *  resolved through the localized content boundary exactly as a disabled offer row's is, so the
   *  width section invents no vocabulary of its own (ADR 0032 rule 2).
   *
   *  Absent on `free`, and on the ordinary `active` chip, in a writable panel: a width the body
   *  already has needs no explanation, and a reason beside a control that works is noise.
   *
   *  **The one `active` chip that does carry a reason is a fixed-width cabinet's** (ADR 0049). It is
   *  the width the cabinet is made at *and* the reason there is no other, which is why the verdict
   *  carries both and this line says which cabinet and what it is made for.
   *
   *  **A locked panel replaces it rather than clearing it**, on every chip including `active`, with
   *  `PanelEditability.disabledReason` — the panel's own sentence, not the engine's. A browser that
   *  cannot write is not being told which widths its cabinet could reach; it is being told it
   *  cannot edit, or that nothing yet knows whether it may. Two sentences under one chip would be
   *  the panel arguing with itself. This matches what `describeChipAvailability` already does for
   *  the finish and handle swatches. */
  readonly reason?: string;
}

export interface RejectionSection {
  readonly kind: "rejection";
  readonly message: string;
}

/** §11 row 16: "no swap list, no delete, **refusal explains why**". A body that offers nothing never
 *  produces a refusal, so the explanation cannot live in the rejection banner — it renders as its own
 *  section instead of leaving the panel an empty scroll body between a header and "Gata". */
export interface StructuralSection {
  readonly kind: "structural";
  readonly title: string;
  readonly message: string;
}

export interface ReplaceSection {
  readonly kind: "replace";
  readonly title: string;
  /** §9: derived, never a literal. Absent when there is nothing to count — the zero-result case
   *  carries a sentence instead, because "0 corpuri" is the bare "0" §9 forbids. */
  readonly countLine?: string;
  readonly rows: readonly OfferRow[];
  /** §9's zero-result sentence, saying what to clear. Present exactly when `rows` is empty. */
  readonly emptyLine?: string;
}

/** One entry of a material's declared palette, ready to render.
 *
 *  `value` is the entry's own **declared id** — the React key, the test id and the string a browser
 *  test addresses it by. Wave 6P had to carry a second string here because the panel offered five
 *  legacy names the command could no longer take; there is no second string now, because the chip
 *  offers exactly what `materials.ts` declares.
 *
 *  `swatchColor` is the adapter's own hex for this entry, carried across rather than re-derived: a
 *  stylesheet cannot import a constant, so the value travels on the chip and the component publishes
 *  it as a custom property. `isWood` is published beside it so the swatch can draw a grain from that
 *  one hex — never from a second one authored in CSS. */
export interface FinishChip extends ChoiceChip<PaletteEntryId> {
  readonly finish: Finish;
  readonly swatchColor: string;
  readonly isWood: boolean;
}

/**
 * **§9's Finisaj section, in the shape the design's material declares** (ADR 0071 decision 3).
 *
 * `control` is copied from `Material.colourControl.shape` and is **never inferred from how many
 * entries came back**: two swatches and a list of two are the same array and different products, so
 * a veneer kitchen that grew a third wood would otherwise turn into a decor list, and a PAL list
 * that shrank to two would turn into the wood swatches. The union below is discriminated on it, so
 * a reader cannot reach a decor list's chips without having read that it is one.
 */
export type FinishSection = PaletteSwatchSection | RalPickerSection;

/**
 * The two controls that offer a declared palette — PAL's fixed list of factory decors, and veneer's
 * two named woods.
 *
 * They share a projection and **not** a rendering: `control` says which one this is, copied from
 * the material's declaration, and the surface draws a list against a pair of swatches from it. It
 * is a published field rather than something the component works out from `chips.length`, which is
 * the same unfalsifiable predicate one layer up.
 */
export interface PaletteSwatchSection {
  readonly kind: "finish";
  readonly control: "decor-list" | "wood-swatches";
  readonly title: string;
  readonly chips: readonly FinishChip[];
  /** §9's way back out of an override — see `FollowTheKitchenChip`. **Absent on the global settings
   *  sheet**, which reads this same section (ADR 0099 decision 9) and has no level above it to
   *  follow. */
  readonly follow?: FollowTheKitchenChip;
  readonly note: string;
}

/**
 * **"Follow the kitchen's colour"** — ADR 0099 decision 8, and part of that decision rather than UI
 * polish.
 *
 * Without a control that *un*-chooses, the first tap on any swatch pins that cabinet out of the
 * kitchen's colour for ever: the precedence becomes a one-way door, and the customer would report
 * it next.
 *
 * `isActive` when this cabinet has chosen nothing and is already following — the same marking the
 * swatches use, so the section always shows exactly one standing choice.
 *
 * It is a `ChoiceChip` and not a fourth shape: it sits in the same row as the swatches, it is
 * greyed by the same `describeChipAvailability`, and *"follow"* is a value in the same sense a decor
 * id is. What it writes is the difference, and that is the command's to say, not the chip's.
 */
export type FollowTheKitchenChip = ChoiceChip<"follow">;

/**
 * MDF: a colour picker, because painted MDF can be any colour and no list can stand in for that.
 *
 * It carries a `value` rather than chips — the six-digit hex the control opens on. That is the
 * body's own colour where it has one, and the material's declared default where it does not; a
 * picker with nothing in it would open on the browser's own black.
 *
 * **Reachable only on an MDF kitchen**, and on a PAL or veneer one it is not present at all rather
 * than present and disabled (§13.1): it is a different control, not a greyed one.
 */
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
  /** ADR 0099 decision 8's way back out of an override. A picker needs it more than a swatch list
   *  does: every hex it can produce is a choice, so without this an MDF cabinet has no way at all to
   *  stop choosing. Absent on the global settings sheet, which has no level above it to follow. */
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

/** ADR 0035 decision 1: `+50` / `−50` from where the body stands, each button disabled at its
 *  bound **carrying the engine's reason** rather than absent (ADR 0032). */
export interface WidthStepButton {
  /** Which way the step goes, published rather than inferred from the arithmetic: the component
   *  orders the pair and labels it from this, and nothing downstream re-derives the sign. */
  readonly direction: WidthStepDirection;
  /** The width this button would resize to. Outside the column's candidate set at a bound — that
   *  is what makes the button disabled, and what produces the sentence beside it. */
  readonly widthMm: number;
  readonly label: string;
  readonly ariaLabel: string;
  readonly isDisabled: boolean;
  /** §13.1's "greyed and unclickable **with the reason**", and the most-read sentence in the whole
   *  stepper: at a bound this is where §7's 800 ceiling, §2's 300 floor, the entry's own floor and
   *  ADR 0035 decision 6's hood floor are told to the customer. Always the engine's own words
   *  through the localized content boundary, never copy authored here. Absent on a button that
   *  works. */
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

/** §9's width control where the widths are genuinely a set (ADR 0035 decision 3) — wave 5D's chip
 *  row, kept for exactly the columns a stepper would be wrong for. A dishwasher is 450 or 600
 *  because dishwashers are, and `+50` there would offer eleven widths nobody manufactures. */
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
  /** Whether §9's **Șterge corpul** exists for this selection at all — a structural body has no
   *  delete. Distinct from `isRemoveDisabled`, which is about this browser rather than this body:
   *  a read-only browser still sees the control, disabled with a reason, because hiding it would
   *  say the body cannot be deleted, which is a different and false statement. */
  readonly canDelete: boolean;
  readonly isRemoveDisabled: boolean;
  /** Why **Șterge corpul** is dimmed, for the same §13.1 reason the chips carry one. Present
   *  exactly when `isRemoveDisabled` is true and the control is shown at all. */
  readonly removeDisabledReason?: string;
  readonly removeLabel: string;
  readonly doneLabel: string;
  /** §9 item 7's *price · Șterge corpul · Gata*, and *"De la neschimbat"* while a refusal stands.
   *
   *  **Absent when no price was supplied, and when pricing failed** — the same rendering either
   *  way, deliberately: a failed query has no customer-facing form, and a footer that filled the
   *  gap with a zero or a dash would read as free. Nothing here holds a previous figure, because a
   *  refused edit did not change the document the figure is derived from. */
  readonly price?: PriceFigure;
  /** ADR 0065 decision 7b's warning, beside the footer figure and on the same condition the bar
   *  flags its own total. Present only where `price` is.
   *
   *  **The footer carries it because on mobile it is the only total on screen**: §9's sheet covers
   *  the price bar, and that is the state a customer fixing an overflow is in, since the width chips
   *  are in this sheet. Decision 6's rationale is that the running total is needed precisely then. */
  readonly overflowWarning?: string;
}

/** Why this panel cannot currently write, said once at the top of it.
 *
 * `read-only` is **not an error** and its tone says so: ADR 0019 decision 1 makes the write
 * credential a per-design cookie, so a 30-day expiry, a cleared jar or a link opened by someone who
 * never held one all land here in ordinary operation. `save-failed` is the other thing — a write
 * that should have worked and did not — and it is the one that reads as a fault.
 *
 * `read-only-refused` is read-only reached the other way: the load believed this browser could
 * write, so the panel was interactive and an edit was made — and refused. That edit is on screen and
 * will never be stored, which `read-only`'s copy does not say because in its own case nothing was
 * ever attempted. Splitting them is what stops the permanent-loss path from carrying weaker copy
 * than the retryable one.
 *
 * `save-failed` and `save-stopped` are two kinds rather than one because the coalescer's two
 * failure branches deliver different things: `error` has a retry armed and will write the state
 * queued behind it, while `stopped` never writes again. One sentence cannot be true of both — it
 * would either tell a customer to wait for a save that is not coming, or to reload and lose the
 * edit a pending retry was about to store.
 *
 * `save-conflict` (WEB-003) is a third kind for the same reason and is unlike both: no retry is
 * coming, and yet nothing is lost — the stored design and this screen's design both exist, and the
 * customer chooses which survives. It is the only notice carrying more than one action. */
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
  /** What this notice offers, in the order it should be read. Absent — never empty — when there is
   *  nothing to press, which is every notice but two. Each entry publishes a label and the *kind*
   *  of action it is, so the component renders a value and decides nothing: what a kind does is the
   *  shell's wiring, which is not a product rule. */
  readonly actions?: readonly PanelNoticeAction[];
}

/**
 * One action on a notice. The `kind` is a name for what the shell must do, deliberately not a
 * callback: `describePanel` is a pure projection tested as a value, and a function in its output
 * could not be compared to an expectation.
 *
 * `reload` is a page reload rather than a store action, and that is the honest place for it: it
 * discards the whole client state by definition, so no reducer can model it.
 */
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
  /** Absent when there is nothing to say. It sits above §9's sections rather than among them: §9
   *  reserves the top of the *body* for the rejection banner, and this is a statement about the
   *  whole panel, not about the edit that was just refused. */
  readonly notice?: PanelNotice;
  /** §9's order, already applied. A section absent from this list is one whose flag was false. */
  readonly sections: readonly PanelSection[];
  readonly footer: PanelFooter;
}

export type PanelView = ClosedPanel | OpenPanel;

export interface DescribePanelInput {
  readonly content: Content;
  /** ADR 0129 D8: `cornerDirectionOf(design.room)`, read once here rather than by each helper that
   *  needs it — the width section's step/chip refusals and its reflected note.
   *
   *  **Optional, defaulting to left** (`directionOf` below) rather than required: every fixture and
   *  test that builds this input for a room that carries no direction is exactly ADR 0053's "absence
   *  is a valid, unchanged state" — the same argument S1 made for `DesignRoom.cornerDirection`
   *  itself, one level up. A caller that does carry a room's direction, `use-panel-view.ts`, is the
   *  only one this wave touches. */
  readonly direction?: CornerDirection;
  /** `undefined` when nothing is selected, or when the selection no longer resolves. */
  readonly meta: SelectionMeta | undefined;
  readonly offers: readonly CatalogOffer[];
  /** **What the catalogue can be built to at all** — `buildableWidthSpanMm(catalog)`, and never a
   *  span derived from the list above.
   *
   *  It used to be read off the offers, which held every band-appropriate row whether or not it
   *  fitted (ADR 0032). Since the owner's ruling of 2026-09-10 an opening nothing fits publishes no
   *  rows, so the two informative empty sentences — *wider than the widest cabinet*, *narrower than
   *  the narrowest* — would have had nothing to read. `undefined` is a real answer for an **empty
   *  catalogue** and leaves §9's original sentence in place; see `describeEmptyLine`.
   *
   *  **Required, never optional**, though its value may be `undefined` — the distinction is the
   *  whole guard. `offers` above is required for the same reason, and while this one was optional a
   *  caller could drop it and both informative sentences would quietly degrade to the bare *nothing
   *  fits*: QA deleted it from `use-panel-view.ts` and all 2,445 web cases stayed green. A missing
   *  span is now a compile error, which is where a wiring mistake belongs. */
  readonly buildableWidthSpanMm: WidthRangeMm | undefined;
  /** The **column's** candidate widths, already judged by the engine — `widthOptionsFor` ran
   *  `setWidth` once per candidate. This module renders that answer and does not second-guess it:
   *  "a chip is free iff the command succeeds" is only true if one side of it is not reimplemented
   *  here.
   *
   *  One reader since wave 5D2c: ADR 0035 decision 3's **discrete** control renders these as chips.
   *  The stepper does not render them at all — which control a selection gets is `widthRanges`'
   *  question, and it is read from the engine rather than inferred from the shape of this list.
   *
   *  Empty is a real answer and means no width section, the same way an empty `meta.sizesMm` did:
   *  see `describeWidthSection`. */
  readonly widthOptions: readonly WidthOption[];
  /** ADR 0035 decision 1's two candidates, each judged by running `setWidth` — see `width-steps.ts`
   *  for why the step question is asked separately from the set question rather than folded into it.
   *
   *  `undefined` on exactly the selections `widthOptions` is empty for, and on those the section is
   *  absent anyway. Where it is present and the column's widths are a **set** rather than a bound,
   *  it is deliberately ignored: decision 3's discrete rows get a choice, not a stepper. */
  readonly widthSteps?: WidthSteps | undefined;
  /** ADR 0035 decision 3's discriminator, from `ColumnWidthChoices.widthRangesMm`: a range with
   *  `minMm < maxMm` means the column is a bound and gets the stepper; every range a single width
   *  means it is a set and gets the discrete choice. Read rather than inferred — see
   *  `isSteppedColumn`.
   *
   *  **Optional, and absent means the discrete choice**, which is the safe answer rather than the
   *  convenient one: a caller that has not resolved the column's shape has not earned a stepper, and
   *  a chip row with the right widths is never wrong — only more clicks. `use-panel-view.ts` always
   *  supplies it; fixtures that are not about the width control leave it out. */
  readonly widthRanges?: readonly WidthRangeMm[];
  readonly rejection: RejectionReason | null;
  /**
   * **The design's material, already looked up** (ADR 0071 decision 3) — what decides the *shape*
   * of §9's Finisaj control, not merely which options it holds.
   *
   * **Required rather than optional**, unlike `pricing` and `widthRanges`. An absent material has
   * no safe default: PAL's decor list on an MDF kitchen offers six finishes the command refuses,
   * which is the state §9's "never offer what cannot be satisfied" exists to forbid. Making it
   * required is what stops a caller forgetting it.
   *
   * A `MaterialLookup` rather than a `Material`, because a stored `materialTierId` naming nothing
   * this product declares is a reachable state (ADR 0078 decision 3) and the panel must keep
   * rendering everything else.
   */
  readonly material: MaterialLookup;
  /** The current design priced, as `usePricedDesign` derived it this render — never a stored total
   *  and never a figure this module computes (§12, and wave 6C's criterion).
   *
   *  **Optional, and absent means the footer shows no price**, which is the safe answer rather than
   *  the convenient one: a caller that has not priced the design has no figure to show, and an
   *  invented one is the failure this wave's criteria exist to prevent. `use-panel-view.ts` always
   *  supplies it; fixtures that are not about the price leave it out.
   *
   *  **Kept optional deliberately, and the dropped-wiring risk is closed by a test rather than by
   *  the type.** Required would make the one real caller unforgettable at compile time, at the cost
   *  of a priced design in twelve fixtures that are about sections, notices and width chips —
   *  coupling every panel test to the price book to protect a single call site. That call site is
   *  now driven through the real `usePanelView` by `tests/price/price-wiring.adversarial.test.ts`,
   *  which goes red when `pricing` is dropped from it; verified by doing exactly that. */
  readonly pricing?: PricingResult;
  /** §5.2 cannot run without the scene's `BodyProbe`, so until it attaches every offer row is
   *  disabled with that reason rather than tapped and then refused. */
  readonly isBodyProbeAttached: boolean;
  /** Whether this browser holds the design's write credential, as `GET /api/designs/{id}` reported
   *  it — or `"checking"` / `"check-failed"` where no load has answered yet. Advisory and never an
   *  authorisation decision — see `hasWriteCredentialFor`. Only `true` opens the controls; see
   *  `isReadOnly`. */
  readonly canWrite: WriteAccess;
  readonly saveStatus: SaveStatus;
}

/** §9's half of the one editability rule. An alias rather than a second interface: the panel names
 *  the answer in its own vocabulary and `store/editability.ts` decides it, which is what stops a
 *  second surface deciding it differently — see that module's head comment. */
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

/** Everything §9's footer row is decided from, gathered into one argument so that adding the price
 *  did not turn a two-argument function into a three-argument one. */
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

/**
 * WEB-003's two-way choice, and the one notice whose actions are both destructive of something.
 *
 * Reload is listed first because it is the conservative one: it keeps what is already stored, and
 * the design it discards is one the customer can still see while deciding. Overwrite is second
 * because it discards a version they cannot see.
 *
 * The panel is **not** locked while this stands. The edit on screen is real and still editable, the
 * coalescer refuses further writes for this design rather than losing them, and overwriting sends
 * whatever the design has become by the time it is pressed — so continuing to work and then
 * overwriting is a coherent path, where a greyed panel would only add a second thing to undo.
 */
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

/**
 * Which sentence a locked panel earned. Four states, told apart by what is true of each — none of
 * them "read-only" in the same sense.
 *
 * `"checking"` and `"check-failed"` are both "nobody has answered", and they are separated by
 * whether an answer is still coming: one is a wait, the other is a failure with a retry attached.
 * Neither may borrow `readOnlyNotice`, which asserts a permission that has not been established.
 *
 * `canWrite === false` is the load having said so: every control was disabled from the first frame,
 * nothing was attempted and nothing was lost, so the plain statement of fact is the whole truth.
 * What falls through is `canWrite === true` with an `unauthorized` save — the only way a panel that
 * was genuinely interactive reaches here, since wave S7 stopped the unanswered states from being
 * interactive at all. That edit is on screen, no retry is coming for it, and the notice has to say
 * so; its tone is `error` for that reason alone, not because being read-only is a fault.
 */
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
  // Narrowed to a boolean by the two checks above, so the falsy test is right by rule here rather
  // than by accident. `isReadOnly` cannot rely on that — the string states are truthy there, which
  // is why it asks `!== true` rather than reading `canWrite` as a boolean.
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
    // The band the selection carries, resolved here: `SelectionMeta` publishes the fact and never a
    // second, presentational copy of it beside the fact.
    detail: content.panel.headerMeta(
      meta.wall,
      content.bandLabel(meta.band),
      meta.widthMm,
      meta.heightMm,
    ),
  };
}

/** §9's order, and the only place it is expressed: rejection banner, replace, finish, handle,
 *  width. The banner is first because authored inside the width section it was invisible on
 *  exactly the fixed-width bodies that refuse most. */
function collectSections(
  input: DescribePanelInput,
  meta: SelectionMeta,
  editability: PanelEditability,
): PanelSection[] {
  const sections: PanelSection[] = [];
  if (input.rejection) {
    sections.push({
      kind: "rejection",
      message: input.content.rejection(input.rejection, input.direction),
    });
  }
  // **The refusal is rendered whenever it is declared, offers or no offers** (§11 row 16, and the
  // owner's corner ruling of 2026-09-09). It used to be the *fallback* for a body that offered
  // nothing, which was the same thing while `STRUCTURAL_CORNER` set all four capability flags to
  // false. It stopped being the same thing the moment the corner gained `canFinish`: the panel would
  // have shown *Finisaj* and silently dropped the one sentence that says why there is no swap list
  // and no delete — offering more and explaining less. Pushed **before** the offers so the customer
  // reads what this body is before what they can do to it.
  const structural = describeStructuralSection(meta, input.content);
  if (structural) sections.push(structural);
  sections.push(...collectOfferedSections(input, meta, editability));
  return sections;
}

/** Everything §9 offers the customer on this selection: replace, finish, handle, width, in §9's
 *  order. Split out so the two halves of the panel stay separable: what this body *is*, which
 *  `describeStructuralSection` states, and what can be done to it, which is this. */
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
    // **The follow chip is added here and not inside the projection** (ADR 0099 decisions 8 and 9).
    // The projection is shared with the global settings sheet, which is the level being followed and
    // so has nothing above it — a control offered there would be an offer this product cannot
    // satisfy (§9). Composed rather than parameterised: a fourth argument switching a control on and
    // off is the flag argument this codebase splits functions to avoid.
    if (finish)
      sections.push(
        followingTheKitchen(finish, meta, editability, input.content),
      );
  }
  if (meta.canHandle)
    sections.push(describeHandleSection(meta, editability, input.content));
  // **Not gated on `meta.canWidth`** (ADR 0049). §9 item 6 made `fixedWidth` decide whether the
  // section *exists*, and it would hide the very section that record requires. The flag now gates
  // nothing in this panel at all: which chips are disabled is decided from the engine's verdict, by
  // `describeWidthChipState` and `isWidthChipDisabled`. It stays on `SelectionMeta` as §9's literal
  // statement for `describeSelection`'s other consumers.
  //
  // Whether there is anything to render is the domain's single answer — `columnWidthChoices`
  // publishes chips or it publishes none — and a void, an unresolvable selection and a body with no
  // width set all reach here with no options and get no section, exactly as the flag used to give
  // them.
  const width = describeWidthSection(input, meta, editability);
  if (width) sections.push(width);
  return sections;
}

/** `undefined` when the catalogue declared no reason, which is every ordinary body. A body that
 *  offers nothing *and* declares no reason is a catalogue gap rather than a state to paper over with
 *  generic copy, and it stays visible as the empty panel it is. */
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

/** `undefined` when §9 renders no replace section at all: the selection refuses replacement, or
 *  §11 row 24's unknown kind, for which a fallback set once produced six guaranteed-refused rows.
 *  An empty *list* is a different answer and keeps its section, because §9 requires a sentence
 *  saying what to clear. */
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

/** §9's row: the size it would build to under the name, or the reason the whole panel is
 *  unclickable where there is one.
 *
 *  **No refused arm since the owner's ruling of 2026-09-10.** `offersFor` publishes only what can
 *  actually be inserted, so a row here is always one the engine planned — the two reasons left are
 *  read-only and a probe still attaching, and both are facts about the panel rather than about the
 *  entry. */
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

/** §9's zero-result sentence, and **two of its three arms are new in wave 5D2c**.
 *
 *  §9's rule is "say what to clear, never a bare 0", and ADR 0037 records where it inverts: an
 *  opening wider than any cabinet is not closed by clearing a neighbour — clearing makes it
 *  **wider**. The owner decided on 2026-08-28 that such a space *"ok to have empty space left"*, so
 *  the sentence says it may be left rather than asking for an action that would make it worse.
 *
 *  A **too-narrow** strip is the same trap arriving from the other side, and ADR 0035 decision 7
 *  created it: a shrink vacates a strip, and until the next press absorbs it that strip is a
 *  selectable opening no cabinet fits. Advising a delete there is advice about a space nobody made
 *  on purpose and nobody has to fill.
 *
 *  **The two bounds are still read from the catalogue and still never written down here** — but the
 *  offer list is no longer where they come from. ADR 0032 put every band-appropriate row in the
 *  list whatever its verdict, so a slot nothing fitted still published a `widthRangesMm` to take a
 *  minimum and a maximum from; the owner's ruling of 2026-09-10 empties that list instead, and these
 *  two sentences are exactly the ones a customer needs at that moment. `buildableWidthSpanMm`
 *  answers from the catalogue directly, which is where the numbers always came from — a panel
 *  constant beside them would be the two-numbers-agreeing-by-luck defect ADR 0028 is about. */
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

/** The disabled half of every `ChoiceChip`, in one place: §13.1 asks for the reason beside the
 *  greyed control, and read-only is the only thing that greys a finish or handle chip today. Spread
 *  into the chip so a clickable one carries no `reason` field at all. */
function describeChipAvailability(editability: PanelEditability): {
  readonly isDisabled: boolean;
  readonly reason?: string;
} {
  return editability.isReadOnly
    ? { isDisabled: true, reason: editability.disabledReason }
    : { isDisabled: false };
}

/**
 * **§9's Finisaj control, in the shape the design's material declares** (ADR 0071 decision 3).
 *
 * The branch below is on `colourControl.shape` and on nothing else. It is deliberately not on
 * `paletteEntriesOf(material).length`, which happens to distinguish the three materials today —
 * six, none and two — and would keep doing so right up until veneer gained a third wood or PAL lost
 * a decor, at which point the customer would be handed the wrong control with no test having moved.
 *
 * `undefined` when the design's `materialTierId` names no declared material (ADR 0078 decision 3).
 * A material this product does not declare makes no offer, and there is no control shape to render
 * for it — the rest of the panel keeps working, which is what 6G's recovery path stands on.
 *
 * **Exported, and read by a second surface since ADR 0099 decision 9** — the global settings sheet's
 * colour group. That is the owner's *"same as we have on clicking on the cabinet"* and ADR 0071
 * decision 3's *"three different controls reading one setting"*: one declaration, two callers, never
 * a second implementation.
 *
 * **It takes the chosen colour and not a `SelectionMeta`** for exactly that reason. The second
 * caller holds a whole-kitchen pending choice and no cabinet at all, and a parameter it would have
 * to fabricate a selection for is a parameter that invites two projections instead of one.
 */
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

/** §9's finish section with ADR 0099 decision 8's chip on it. The chip is *active* when the cabinet
 *  carries no colour of its own — absence is the state of following (ADR 0078 decision 5) — so the
 *  section always shows exactly one standing choice, whichever of the three controls it is. */
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

/** The two list-shaped controls, which differ in their `control` and in nothing else here: PAL's
 *  fixed decor list and veneer's two woods are the same projection, and it is the surface that
 *  draws a list against a pair of swatches. The shape is carried across from the declaration, so
 *  neither can turn into the other by its entries changing. */
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

/** One decor, rendered. The label is the entry's name resolved from its id through the catalogue —
 *  ADR 0071 decision 4's word, in the customer's language — and never a supplier code, which
 *  `materials.ts` keeps as internal provenance. The colour is the adapter's, so the swatch and the
 *  3D paint from one declared hex. */
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

/**
 * **Where the picker opens**, which is a position for a control and never a finish anything writes.
 *
 * The body's own colour when it has one; otherwise the material's declared default, which for the
 * one material declaring a picker is itself a free colour and so arrives verbatim.
 *
 * **Never the body's current decor read as a hex.** ADR 0078 decision 4 forbids constructing a free
 * colour from a palette entry's swatch, and a body still wearing a PAL decor on an MDF kitchen is
 * the transient 6Q-b's reset clears — seeding the picker from it is exactly the invisible
 * substitution ADR 0057 rejected, arriving through the door this wave opens by publishing a hex per
 * decor.
 */
function describePickerValue(
  material: Material,
  chosen: Finish | undefined,
): string {
  const opening =
    chosen?.kind === "free-colour" ? chosen : material.defaultFinish;
  return swatchOf(opening).color;
}

/** §6.5 and §11 row 13: with nothing chosen, the chip that is marked is the one the scene is
 *  actually rendering — push-to-open on the top row, a bar handle below it — and the note says the
 *  mark came from the default rather than from a choice. */
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

/** §9's width section, and as of M5 wave 5D2c **two controls rather than one** (ADR 0035
 *  decision 3): a `+50` / `−50` stepper where the width is free, and wave 5D's discrete choice where
 *  it is genuinely a set.
 *
 *  `undefined` when there is nothing to choose from, and that is now the **only** thing that
 *  suppresses the section (ADR 0049). A body that resolves no set at all — a row whose declared
 *  catalogue equivalent points nowhere, an entry whose floor excludes every listed width — is
 *  missing catalogue data, and it keeps failing loudly as a section that is not there rather than a
 *  chipless one that makes broken data look like a constrained product (FINDING R2.7).
 *
 *  A `fixedWidth` cabinet is the opposite case and renders: one `active` chip at the width it is
 *  made at, carrying the engine's `NOT_RESIZABLE` sentence. `canWidth` no longer gates this — see
 *  `collectOfferedSections`.
 *
 *  The candidate list is the domain's, not `meta.sizesMm`. ADR 0031 resizes a **column** and `meta`
 *  describes one **body**, so the two disagree wherever a column's members declare different sets —
 *  the panel offered widths the column refuses and hid widths it accepts. `widthOptionsFor` answers
 *  per column, which is the scope the command actually works at. */
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
          direction,
        ),
        describeWidthStep(
          "wider",
          steps.wider,
          editability,
          input.content,
          direction,
        ),
      ],
      // ADR 0129 D8: the reflected sentence for a right-hand room — same rule, the sides it names
      // swapped along with the ones the buttons themselves now refuse from.
      note:
        direction === "right"
          ? input.content.panel.widthStepNoteRight
          : input.content.panel.widthStepNote,
    };
  return {
    ...head,
    control: "choice",
    chips: options.map((option) =>
      describeWidthChip(option, editability, input.content, direction),
    ),
    note: input.content.panel.widthChoiceNote,
  };
}

/** ADR 0129 D8's default: a `DescribePanelInput` carrying no direction is a left-hand room,
 *  `cornerDirectionOf`'s own rule restated for the one caller that has not opted into a room-aware
 *  `content.rejection` call — see `DescribePanelInput.direction`. */
function directionOf(input: DescribePanelInput): CornerDirection {
  return input.direction ?? "left";
}

/** **ADR 0035 decision 3's discriminator, and the correction is the point of it.** The decision's
 *  first version said `fixedWidth` separates the two shapes; it does not — the flag is `false` on
 *  both discrete rows, `base-dishwasher` included, and cannot be corrected there without making `p1`
 *  unresizable and undoing §11 row 14. The real discriminator is the **shape of the bound**: a row
 *  with any range where `minMm < maxMm` is free, a row whose every range is a single width is a set.
 *
 *  This asks that of the **column**, not of the selected body, and the difference is a real defect
 *  rather than a nicety. `p1`'s dishwasher fixes column `A|2.00` to 450 and 600, so the wall cabinet
 *  standing above it — cabinetry, bound 200–800, a stepper by its own row's shape — has a column
 *  that accepts neither 400 nor 500. A stepper there is two dead buttons with 600 unreachable
 *  between them.
 *
 *  **The column's ranges are published, and this reads them** (`ColumnWidthChoices.widthRangesMm`).
 *  It used to infer the shape from two candidates 50 apart in the set — which worked, and which is
 *  the inference ADR 0022 records as how this codebase gets identity wrong, and the one decision 3
 *  itself had to be corrected for. A range with `minMm < maxMm` is a bound; every range a single
 *  width is a set. */
function isSteppedColumn(ranges: readonly WidthRangeMm[]): boolean {
  return ranges.some((range) => range.minMm < range.maxMm);
}

/** One step button, in §9's vocabulary. A step candidate is never the current width, so unlike a
 *  chip it has only two states — the move is available, or the engine refused it and said why.
 *
 *  Read-only takes the click and replaces the reason, first and on both buttons, for the reason it
 *  does on every other control: a browser that cannot write is not being told where its cabinet's
 *  bounds are, it is being told it cannot edit. */
function describeWidthStep(
  direction: WidthStepDirection,
  option: WidthOption,
  editability: PanelEditability,
  content: Content,
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
      cornerDirection,
    ),
  };
}

/** Spread into the button, so a working one carries no `reason` field at all — the same shape
 *  `describeWidthChipReason` and `describeChipAvailability` use. */
function describeWidthStepReason(
  verdict: WidthOption["verdict"],
  editability: PanelEditability,
  content: Content,
  cornerDirection: CornerDirection,
): { readonly reason?: string } {
  if (editability.isReadOnly) return { reason: editability.disabledReason };
  if (verdict.status !== "refused") return {};
  return { reason: content.rejection(verdict.reason, cornerDirection) };
}

/** One candidate width, in §9's vocabulary. Only a `free` chip is a move: `active` is the width the
 *  column already sits at, and `blocked` is one the command refused. Both are unclickable for
 *  different reasons, which is why the state stays three-valued while clickability is published as
 *  its own resolved answer.
 *
 *  Read-only takes the reason line as well as the click, and takes it first: a browser that cannot
 *  write is not being told which widths its cabinet could reach, it is being told it cannot edit.
 *  Two sentences under one chip would be the panel arguing with itself. */
function describeWidthChip(
  option: WidthOption,
  editability: PanelEditability,
  content: Content,
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
    // ADR 0049: the width a cabinet that cannot be resized is made at. `active`, because the body is
    // standing on it and §9 puts that number in the section's value label — not `blocked`, which
    // would leave the section with no active chip and the value label pointing at a dashed one.
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
  cornerDirection: CornerDirection,
): { readonly reason?: string } {
  if (editability.isReadOnly) return { reason: editability.disabledReason };
  if (verdict.status === "current" || verdict.status === "available") return {};
  return { reason: content.rejection(verdict.reason, cornerDirection) };
}

/** Takes the whole three-state union rather than what any one milestone happens to produce, and
 *  applies read-only first: M5 made `free` reachable, and it must not become reachable in a browser
 *  that cannot write — which would leave this the one section offering what cannot be satisfied. */
function isWidthChipDisabled(
  state: WidthChipState,
  editability: PanelEditability,
): boolean {
  return editability.isReadOnly || state !== "free";
}
