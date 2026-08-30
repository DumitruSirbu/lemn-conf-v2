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
  FinishSchema,
  HandleSchema,
  isKnownKind,
  normaliseBand,
  renderRejection,
  type CatalogOffer,
  type Finish,
  type Handle,
  type OfferVerdict,
  type RejectionReason,
  type SelectionMeta,
  type WidthOption,
  type WidthRangeMm,
} from "@lemnaria/configurator-domain";

import type { SaveStatus } from "@/persistence/save-coalescer";
import type { WriteAccess } from "@/store/configurator-store";

import { ro } from "@/content/ro";

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
   *  rendered through `renderRejection` exactly as a disabled offer row's is, so the width section
   *  invents no vocabulary of its own (ADR 0032 rule 2).
   *
   *  Absent on `active` and on `free` in a writable panel: a width the body already has needs no
   *  explanation, and a reason beside a control that works is noise.
   *
   *  **Read-only replaces it rather than clearing it**, on every chip including `active`, with
   *  `ro.panel.readOnlyReason` — the panel's own sentence, not the engine's. A browser that cannot
   *  write is not being told which widths its cabinet could reach; it is being told it cannot edit,
   *  and two sentences under one chip would be the panel arguing with itself. This matches what
   *  `describeChipAvailability` already does for the finish and handle swatches. */
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

export interface FinishSection {
  readonly kind: "finish";
  readonly title: string;
  readonly chips: readonly ChoiceChip<Finish>[];
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
   *  through `renderRejection`, never copy authored here. Absent on a button that works. */
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
 * edit a pending retry was about to store. */
export interface PanelNotice {
  readonly kind:
    | "read-only"
    | "read-only-refused"
    | "save-failed"
    | "save-stopped";
  /** Published resolved so the component styles rather than classifies. */
  readonly tone: "info" | "error";
  readonly message: string;
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
  /** `undefined` when nothing is selected, or when the selection no longer resolves. */
  readonly meta: SelectionMeta | undefined;
  readonly offers: readonly CatalogOffer[];
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
  /** §5.2 cannot run without the scene's `BodyProbe`, so until it attaches every offer row is
   *  disabled with that reason rather than tapped and then refused. */
  readonly isBodyProbeAttached: boolean;
  /** Whether this browser holds the design's write credential, as `GET /api/designs/{id}` reported
   *  it — or `"unknown"` where no load could have answered. Advisory and never an authorisation
   *  decision — see `hasWriteCredentialFor`. */
  readonly canWrite: WriteAccess;
  readonly saveStatus: SaveStatus;
}

const CLOSED_PANEL: ClosedPanel = { kind: "closed" };

export function describePanel(input: DescribePanelInput): PanelView {
  const { meta } = input;
  if (!meta) return CLOSED_PANEL;
  const readOnly = isReadOnly(input);
  const notice = describeNotice(input, readOnly);
  return {
    kind: "open",
    header: describeHeader(meta),
    ...(notice ? { notice } : {}),
    sections: collectSections(input, meta, readOnly),
    footer: {
      canDelete: meta.canDelete,
      isRemoveDisabled: readOnly,
      ...(readOnly ? { removeDisabledReason: ro.panel.readOnlyReason } : {}),
      removeLabel: ro.panel.remove,
      doneLabel: ro.panel.done,
    },
  };
}

/**
 * The one place "this panel may not edit" is decided, from the two independent ways it becomes
 * true: the load said so, or a save has already been refused.
 *
 * The second is kept even though the first normally covers it. `canWrite` is presence of a cookie,
 * not proof it is the right one (`hasWriteCredentialFor`), so a stale or forged credential reads as
 * writable until a write is attempted — and `unauthorized` is that attempt's answer. Reading both
 * means the panel stops offering edits at the first refusal rather than at every one.
 *
 * Only an explicit `false` locks the panel: `"unknown"` is treated as writable, which is where the
 * `/d/{id}` load's deliberate optimism is spent (see `WriteAccess`). Written as `=== false` rather
 * than `!input.canWrite`, because the string is truthy and the falsy test would have been right by
 * accident rather than by rule.
 */
function isReadOnly(input: DescribePanelInput): boolean {
  return input.canWrite === false || input.saveStatus === "unauthorized";
}

/** `undefined` when there is nothing to say, which is the ordinary case: a writable panel whose
 *  last save is `idle` or in flight says nothing at all, because "saved" is not news. */
function describeNotice(
  input: DescribePanelInput,
  readOnly: boolean,
): PanelNotice | undefined {
  if (readOnly) return describeReadOnlyNotice(input);
  if (input.saveStatus === "error")
    return {
      kind: "save-failed",
      tone: "error",
      message: ro.panel.saveFailedNotice,
    };
  if (input.saveStatus === "stopped")
    return {
      kind: "save-stopped",
      tone: "error",
      message: ro.panel.saveStoppedNotice,
    };
  return undefined;
}

/**
 * Which of the two read-only sentences this panel earned, decided by whether an edit was reachable
 * before the refusal.
 *
 * `canWrite === false` means the load already said so: every control was disabled from the first
 * frame, nothing was attempted and nothing was lost, so the plain statement of fact is the whole
 * truth. Anything else — `true`, or `/d/{id}`'s `"unknown"` — means the panel rendered interactive
 * and the `unauthorized` that put it here is the answer to an edit the customer actually made. That
 * edit is on screen, no retry is coming for it, and the notice has to say so; its tone is `error`
 * for that reason alone, not because being read-only is a fault.
 */
function describeReadOnlyNotice(input: DescribePanelInput): PanelNotice {
  if (input.canWrite === false)
    return {
      kind: "read-only",
      tone: "info",
      message: ro.panel.readOnlyNotice,
    };
  return {
    kind: "read-only-refused",
    tone: "error",
    message: ro.panel.readOnlyRefusedNotice,
  };
}

function describeHeader(meta: SelectionMeta): PanelHeader {
  return {
    label: meta.label,
    detail: ro.panel.headerMeta(
      meta.wall,
      meta.bandLabel,
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
  readOnly: boolean,
): PanelSection[] {
  const sections: PanelSection[] = [];
  if (input.rejection) {
    sections.push({ kind: "rejection", message: input.rejection.message });
  }
  const offered = collectOfferedSections(input, meta, readOnly);
  if (offered.length === 0) {
    const structural = describeStructuralSection(meta);
    if (structural) sections.push(structural);
    return sections;
  }
  sections.push(...offered);
  return sections;
}

/** Everything §9 offers the customer on this selection: replace, finish, handle, width, in §9's
 *  order. Split out so `collectSections` can ask the one question §11 row 16 needs — "does this body
 *  offer anything at all?" — without re-deriving it from four flags. */
function collectOfferedSections(
  input: DescribePanelInput,
  meta: SelectionMeta,
  readOnly: boolean,
): PanelSection[] {
  const sections: PanelSection[] = [];
  const replace = describeReplaceSection(input, meta, readOnly);
  if (replace) sections.push(replace);
  if (meta.canFinish) sections.push(describeFinishSection(meta, readOnly));
  if (meta.canHandle) sections.push(describeHandleSection(meta, readOnly));
  if (meta.canWidth) {
    const width = describeWidthSection(input, meta, readOnly);
    if (width) sections.push(width);
  }
  return sections;
}

/** `undefined` when the selection offers nothing and the catalogue declared no reason for it. That
 *  is a catalogue gap rather than a state to paper over with generic copy, and it stays visible as
 *  the empty panel it is. */
function describeStructuralSection(
  meta: SelectionMeta,
): StructuralSection | undefined {
  if (meta.structuralReason === undefined) return undefined;
  return {
    kind: "structural",
    title: ro.panel.structuralTitle,
    message: ro.panel.structuralReasons[meta.structuralReason],
  };
}

/** `undefined` when §9 renders no replace section at all: the selection refuses replacement, or
 *  §11 row 24's unknown kind, for which a fallback set once produced six guaranteed-refused rows.
 *  An empty *list* is a different answer and keeps its section, because §9 requires a sentence
 *  saying what to clear. */
function describeReplaceSection(
  input: DescribePanelInput,
  meta: SelectionMeta,
  readOnly: boolean,
): ReplaceSection | undefined {
  if (!meta.canReplace) return undefined;
  if (!meta.empty && !isKnownKind(meta.kind)) return undefined;

  // ADR 0032 published the refused entries into this list with the engine's own reason on each.
  // Rendering them — the disabled row, its sentence, and what it does to the count line — is the
  // panel's own wave, so until then the projection is unchanged: it takes the offered verdicts and
  // nothing else, which is exactly the list `offersFor` used to return. The filter is the seam that
  // wave replaces; it is deliberately the only thing here that knows a refused verdict exists.
  const rows = input.offers.filter(isOffered).map((offer) =>
    describeOfferRow(offer, {
      isBodyProbeAttached: input.isBodyProbeAttached,
      readOnly,
    }),
  );
  const title = meta.empty
    ? ro.panel.replaceTitleEmpty
    : ro.panel.replaceTitleOccupied;
  if (rows.length === 0) {
    return {
      kind: "replace",
      title,
      rows,
      emptyLine: describeEmptyLine(meta, input.offers),
    };
  }
  return {
    kind: "replace",
    title,
    countLine: describeCountLine(meta, rows.length),
    rows,
  };
}

/** An offer whose verdict is `offered`, so its built width and height are present. Narrowed once at
 *  the filter above rather than re-checked in every function below it. */
type OfferedCatalogOffer = CatalogOffer & {
  readonly verdict: Extract<OfferVerdict, { status: "offered" }>;
};

function isOffered(offer: CatalogOffer): offer is OfferedCatalogOffer {
  return offer.verdict.status === "offered";
}

/** The two independent reasons a row can be offered and still be unclickable, in the order that
 *  matters: a browser that cannot write is not waiting for anything, so "the model is preparing"
 *  would be a promise nothing here can keep. */
interface OfferRowAvailability {
  readonly isBodyProbeAttached: boolean;
  readonly readOnly: boolean;
}

/** §9's secondary line: the reason displaces the size on a disabled row, because at 390 px the row
 *  has one line under the name and the reason is the half the customer cannot guess. */
function describeOfferRow(
  offer: OfferedCatalogOffer,
  availability: OfferRowAvailability,
): OfferRow {
  // ADR 0033: the width picks the drawing for a merged cabinet, exactly as it picks the label. Only
  // an offered row reaches here, so the width is always present — see the filter in
  // `describeReplaceSection`.
  const thumbnailUrl = findCabinetThumbnailUrl(
    offer.buildId,
    offer.verdict.widthMm,
  );
  return {
    buildId: offer.buildId,
    label: offer.label,
    secondaryLine: describeOfferSecondaryLine(offer, availability),
    isCurrent: offer.isCurrent,
    isDisabled: availability.readOnly || !availability.isBodyProbeAttached,
    ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
  };
}

function describeOfferSecondaryLine(
  offer: OfferedCatalogOffer,
  { isBodyProbeAttached, readOnly }: OfferRowAvailability,
): string {
  if (readOnly) return ro.panel.readOnlyReason;
  if (!isBodyProbeAttached) return ro.panel.probeUnavailable;
  return ro.panel.offerSize(offer.verdict.widthMm, offer.verdict.heightMm);
}

function describeCountLine(meta: SelectionMeta, count: number): string {
  if (meta.empty)
    return ro.panel.countForSlot(count, meta.openWmm, meta.openHmm);
  const words = ro.panel.bandWords[normaliseBand(meta.band)];
  return ro.panel.countForBody(
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
 *  **The two bounds are read from the offers, never written down here.** Every row — refused as well
 *  as offered, which is the whole of ADR 0032 — publishes `widthRangesMm`, "the widths this body may
 *  actually be built to". The narrowest floor and the widest ceiling across the rows the band
 *  admits are therefore facts the catalogue authored, and a panel constant beside them would be the
 *  two-numbers-agreeing-by-luck defect ADR 0028 is about. */
function describeEmptyLine(
  meta: SelectionMeta,
  offers: readonly CatalogOffer[],
): string {
  if (!meta.empty)
    return ro.panel.noOffersForBody(
      ro.panel.bandWords[normaliseBand(meta.band)].one,
    );
  const span = describeBuildableSpanMm(offers);
  if (span === undefined)
    return ro.panel.noOffersForSlot(meta.openWmm, meta.openHmm);
  if (meta.openWmm > span.maxMm)
    return ro.panel.noOffersTooWide(meta.openWmm, span.maxMm);
  if (meta.openWmm < span.minMm)
    return ro.panel.noOffersTooNarrow(meta.openWmm, span.minMm);
  return ro.panel.noOffersForSlot(meta.openWmm, meta.openHmm);
}

/** The narrowest and widest width **any** row in this band can be built at. `undefined` when no row
 *  declares a range at all, which leaves §9's original sentence in place rather than inventing a
 *  bound from nothing. */
function describeBuildableSpanMm(
  offers: readonly CatalogOffer[],
): { readonly minMm: number; readonly maxMm: number } | undefined {
  const ranges = offers.flatMap((offer) => offer.widthRangesMm);
  if (ranges.length === 0) return undefined;
  return {
    minMm: Math.min(...ranges.map((range) => range.minMm)),
    maxMm: Math.max(...ranges.map((range) => range.maxMm)),
  };
}

/** The disabled half of every `ChoiceChip`, in one place: §13.1 asks for the reason beside the
 *  greyed control, and read-only is the only thing that greys a finish or handle chip today. Spread
 *  into the chip so a clickable one carries no `reason` field at all. */
function describeChipAvailability(readOnly: boolean): {
  readonly isDisabled: boolean;
  readonly reason?: string;
} {
  return readOnly
    ? { isDisabled: true, reason: ro.panel.readOnlyReason }
    : { isDisabled: false };
}

function describeFinishSection(
  meta: SelectionMeta,
  readOnly: boolean,
): FinishSection {
  return {
    kind: "finish",
    title: ro.panel.finishTitle,
    chips: FinishSchema.options.map((finish) => ({
      value: finish,
      label: ro.panel.finishLabels[finish],
      isActive: meta.finish === finish,
      ...describeChipAvailability(readOnly),
    })),
    note: ro.panel.finishNote,
  };
}

/** §6.5 and §11 row 13: with nothing chosen, the chip that is marked is the one the scene is
 *  actually rendering — push-to-open on the top row, a bar handle below it — and the note says the
 *  mark came from the default rather than from a choice. */
function describeHandleSection(
  meta: SelectionMeta,
  readOnly: boolean,
): HandleSection {
  const active = meta.handle ?? meta.defaultHandle;
  return {
    kind: "handle",
    title: ro.panel.handleTitle,
    chips: HandleSchema.options.map((handle) => ({
      value: handle,
      label: ro.panel.handleLabels[handle],
      isActive: active === handle,
      ...describeChipAvailability(readOnly),
    })),
    ...(meta.handle === undefined
      ? { note: ro.panel.handleDefaultNote(ro.panel.handleLabels[active]) }
      : {}),
  };
}

/** §9's width section, and as of M5 wave 5D2c **two controls rather than one** (ADR 0035
 *  decision 3): a `+50` / `−50` stepper where the width is free, and wave 5D's discrete choice where
 *  it is genuinely a set.
 *
 *  `undefined` when there is nothing to choose from. §9 defines `canWidth` as "selected · not empty ·
 *  not `fixedWidth`" and nothing more, so the "has widths to show" half of the question is answered
 *  here: a chipless width section offers nothing, and folding the check back into `canWidth` made
 *  `canWidth: true, sizesMm: []` a representable contradiction. M5 wave 5B gave the seeded entries
 *  their sets — resolved through each row's declared `catalogEquivalentId` (ADR 0022) — so the
 *  section renders across the shipped kitchen. What still lands here is a body that publishes
 *  `canWidth` and resolves **no** set — a row that declares no catalogue equivalent and is not
 *  `fixedWidth` — so the flag stays §9's and the emptiness is answered here, which is the
 *  arrangement that made M5's missing data fail loudly.
 *
 *  The candidate list is the domain's, not `meta.sizesMm`. ADR 0031 resizes a **column** and `meta`
 *  describes one **body**, so the two disagree wherever a column's members declare different sets —
 *  the panel offered widths the column refuses and hid widths it accepts. `widthOptionsFor` answers
 *  per column, which is the scope the command actually works at. */
function describeWidthSection(
  input: DescribePanelInput,
  meta: SelectionMeta,
  readOnly: boolean,
): WidthSection | undefined {
  const options = input.widthOptions;
  if (options.length === 0) return undefined;
  const head = {
    kind: "width",
    title: ro.panel.widthTitle,
    valueLabel: ro.panel.widthValue(meta.widthMm),
  } as const;
  const steps = input.widthSteps;
  if (steps && isSteppedColumn(input.widthRanges ?? []))
    return {
      ...head,
      control: "stepper",
      steps: [
        describeWidthStep("narrower", steps.narrower, readOnly),
        describeWidthStep("wider", steps.wider, readOnly),
      ],
      note: ro.panel.widthStepNote,
    };
  return {
    ...head,
    control: "choice",
    chips: options.map((option) => describeWidthChip(option, readOnly)),
    note: ro.panel.widthChoiceNote,
  };
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
  readOnly: boolean,
): WidthStepButton {
  return {
    direction,
    widthMm: option.widthMm,
    label: ro.panel.widthStepLabels[direction],
    ariaLabel: ro.panel.widthStepAriaLabels[direction],
    isDisabled: readOnly || option.verdict.status !== "available",
    ...describeWidthStepReason(option.verdict, readOnly),
  };
}

/** Spread into the button, so a working one carries no `reason` field at all — the same shape
 *  `describeWidthChipReason` and `describeChipAvailability` use. */
function describeWidthStepReason(
  verdict: WidthOption["verdict"],
  readOnly: boolean,
): { readonly reason?: string } {
  if (readOnly) return { reason: ro.panel.readOnlyReason };
  if (verdict.status !== "refused") return {};
  return { reason: renderRejection(verdict.reason) };
}

/** One candidate width, in §9's vocabulary. Only a `free` chip is a move: `active` is the width the
 *  column already sits at, and `blocked` is one the command refused. Both are unclickable for
 *  different reasons, which is why the state stays three-valued while clickability is published as
 *  its own resolved answer.
 *
 *  Read-only takes the reason line as well as the click, and takes it first: a browser that cannot
 *  write is not being told which widths its cabinet could reach, it is being told it cannot edit.
 *  Two sentences under one chip would be the panel arguing with itself. */
function describeWidthChip(option: WidthOption, readOnly: boolean): WidthChip {
  const state = describeWidthChipState(option.verdict);
  return {
    widthMm: option.widthMm,
    label: String(option.widthMm),
    state,
    isDisabled: isWidthChipDisabled(state, readOnly),
    ...describeWidthChipReason(option.verdict, readOnly),
  };
}

function describeWidthChipState(
  verdict: WidthOption["verdict"],
): WidthChipState {
  switch (verdict.status) {
    case "current":
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
  readOnly: boolean,
): { readonly reason?: string } {
  if (readOnly) return { reason: ro.panel.readOnlyReason };
  if (verdict.status !== "refused") return {};
  return { reason: renderRejection(verdict.reason) };
}

/** Takes the whole three-state union rather than what any one milestone happens to produce, and
 *  applies read-only first: M5 made `free` reachable, and it must not become reachable in a browser
 *  that cannot write — which would leave this the one section offering what cannot be satisfied. */
function isWidthChipDisabled(
  state: WidthChipState,
  readOnly: boolean,
): boolean {
  return readOnly || state !== "free";
}
