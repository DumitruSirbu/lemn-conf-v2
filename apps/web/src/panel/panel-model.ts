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
  type CatalogOffer,
  type Finish,
  type Handle,
  type RejectionReason,
  type SelectionMeta,
} from "@lemnaria/configurator-domain";

import { ro } from "@/content/ro";

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
}

export interface ChoiceChip<TValue> {
  readonly value: TValue;
  readonly label: string;
  readonly isActive: boolean;
}

/** §9's three width states. `blocked` is dashed and unclickable; `free` is a legal move. */
export type WidthChipState = "active" | "free" | "blocked";

export interface WidthChip {
  readonly widthMm: number;
  readonly label: string;
  /** §9's vocabulary, which the component styles by. It does not decide clickability from it. */
  readonly state: WidthChipState;
  /** Which states are clickable is §9's rule, not the component's: published resolved so the
   *  component cannot answer it differently, and so M5's arrival of `free` changes one place. */
  readonly isDisabled: boolean;
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

export interface WidthSection {
  readonly kind: "width";
  readonly title: string;
  readonly valueLabel: string;
  readonly chips: readonly WidthChip[];
  readonly note: string;
}

export type PanelSection =
  | RejectionSection
  | StructuralSection
  | ReplaceSection
  | FinishSection
  | HandleSection
  | WidthSection;

export interface PanelFooter {
  readonly canDelete: boolean;
  readonly removeLabel: string;
  readonly doneLabel: string;
}

/** Nothing selected is a real panel state, not a missing one: frames 2A and D2A show no panel at
 *  all and put the instruction copy over the scene. The shell renders nothing for this. */
export interface ClosedPanel {
  readonly kind: "closed";
}

export interface OpenPanel {
  readonly kind: "open";
  readonly header: PanelHeader;
  /** §9's order, already applied. A section absent from this list is one whose flag was false. */
  readonly sections: readonly PanelSection[];
  readonly footer: PanelFooter;
}

export type PanelView = ClosedPanel | OpenPanel;

export interface DescribePanelInput {
  /** `undefined` when nothing is selected, or when the selection no longer resolves. */
  readonly meta: SelectionMeta | undefined;
  readonly offers: readonly CatalogOffer[];
  readonly rejection: RejectionReason | null;
  /** §5.2 cannot run without the scene's `BodyProbe`, so until it attaches every offer row is
   *  disabled with that reason rather than tapped and then refused. */
  readonly isBodyProbeAttached: boolean;
}

const CLOSED_PANEL: ClosedPanel = { kind: "closed" };

export function describePanel(input: DescribePanelInput): PanelView {
  const { meta } = input;
  if (!meta) return CLOSED_PANEL;
  return {
    kind: "open",
    header: describeHeader(meta),
    sections: collectSections(input, meta),
    footer: {
      canDelete: meta.canDelete,
      removeLabel: ro.panel.remove,
      doneLabel: ro.panel.done,
    },
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
): PanelSection[] {
  const sections: PanelSection[] = [];
  if (input.rejection) {
    sections.push({ kind: "rejection", message: input.rejection.message });
  }
  const offered = collectOfferedSections(input, meta);
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
): PanelSection[] {
  const sections: PanelSection[] = [];
  const replace = describeReplaceSection(input, meta);
  if (replace) sections.push(replace);
  if (meta.canFinish) sections.push(describeFinishSection(meta));
  if (meta.canHandle) sections.push(describeHandleSection(meta));
  if (meta.canWidth) {
    const width = describeWidthSection(meta);
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
): ReplaceSection | undefined {
  if (!meta.canReplace) return undefined;
  if (!meta.empty && !isKnownKind(meta.kind)) return undefined;

  const rows = input.offers.map((offer) =>
    describeOfferRow(offer, input.isBodyProbeAttached),
  );
  const title = meta.empty
    ? ro.panel.replaceTitleEmpty
    : ro.panel.replaceTitleOccupied;
  if (rows.length === 0) {
    return { kind: "replace", title, rows, emptyLine: describeEmptyLine(meta) };
  }
  return {
    kind: "replace",
    title,
    countLine: describeCountLine(meta, rows.length),
    rows,
  };
}

/** §9's secondary line: the reason displaces the size on a disabled row, because at 390 px the row
 *  has one line under the name and the reason is the half the customer cannot guess. */
function describeOfferRow(
  offer: CatalogOffer,
  isBodyProbeAttached: boolean,
): OfferRow {
  return {
    buildId: offer.buildId,
    label: offer.label,
    secondaryLine: isBodyProbeAttached
      ? ro.panel.offerSize(offer.widthMm, offer.heightMm)
      : ro.panel.probeUnavailable,
    isCurrent: offer.isCurrent,
    isDisabled: !isBodyProbeAttached,
  };
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

function describeEmptyLine(meta: SelectionMeta): string {
  return meta.empty
    ? ro.panel.noOffersForSlot(meta.openWmm, meta.openHmm)
    : ro.panel.noOffersForBody(
        ro.panel.bandWords[normaliseBand(meta.band)].one,
      );
}

function describeFinishSection(meta: SelectionMeta): FinishSection {
  return {
    kind: "finish",
    title: ro.panel.finishTitle,
    chips: FinishSchema.options.map((finish) => ({
      value: finish,
      label: ro.panel.finishLabels[finish],
      isActive: meta.finish === finish,
    })),
    note: ro.panel.finishNote,
  };
}

/** §6.5 and §11 row 13: with nothing chosen, the chip that is marked is the one the scene is
 *  actually rendering — push-to-open on the top row, a bar handle below it — and the note says the
 *  mark came from the default rather than from a choice. */
function describeHandleSection(meta: SelectionMeta): HandleSection {
  const active = meta.handle ?? meta.defaultHandle;
  return {
    kind: "handle",
    title: ro.panel.handleTitle,
    chips: HandleSchema.options.map((handle) => ({
      value: handle,
      label: ro.panel.handleLabels[handle],
      isActive: active === handle,
    })),
    ...(meta.handle === undefined
      ? { note: ro.panel.handleDefaultNote(ro.panel.handleLabels[active]) }
      : {}),
  };
}

/** The section renders in M4 and its chips are wired in M5 (§5.4). Until then no other width can
 *  be satisfied — there is no resize command — so every other chip is `blocked`, which is the
 *  truthful state rather than a placeholder for one.
 *
 *  `undefined` when there is nothing to choose from. §9 defines `canWidth` as "selected · not empty ·
 *  not `fixedWidth`" and nothing more, so the "has widths to show" half of the question is answered
 *  here: a chipless width section offers nothing, and folding the check back into `canWidth` made
 *  `canWidth: true, sizesMm: []` a representable contradiction. Every seeded entry lands here today
 *  (M4's "Carried into M5" note), and the day M5 gives them width sets the section appears. */
function describeWidthSection(meta: SelectionMeta): WidthSection | undefined {
  const chips = describeWidthChips(meta);
  if (chips.length === 0) return undefined;
  return {
    kind: "width",
    title: ro.panel.widthTitle,
    valueLabel: ro.panel.widthValue(meta.widthMm),
    chips,
    note: ro.panel.widthNote,
  };
}

/** §9 gives a chip three states and assumes the current width is one of them. A `widthFlex: "fit"`
 *  body builds to its **opening**, which need not be a member of `sizesMm` — a `wall-2door` in a
 *  700 mm opening is 700 wide against chips of 400/600/800 — so the body's own width joins the set
 *  rather than the section rendering three blocked chips and no active one. Sorted, so the chip row
 *  reads left to right whatever the current width turns out to be. */
function describeWidthChips(meta: SelectionMeta): WidthChip[] {
  if (meta.sizesMm.length === 0) return [];
  const widths = [...new Set([...meta.sizesMm, meta.widthMm])].sort(
    (left, right) => left - right,
  );
  return widths.map((widthMm) => describeWidthChip(widthMm, meta.widthMm));
}

/** Only a `free` chip is a move: `active` is the width the body already has, and `blocked` is one
 *  no command can reach. Both are unclickable for different reasons, which is why the state stays
 *  three-valued while clickability is published as its own resolved answer. */
function describeWidthChip(widthMm: number, currentWidthMm: number): WidthChip {
  const state: WidthChipState =
    widthMm === currentWidthMm ? "active" : "blocked";
  return {
    widthMm,
    label: String(widthMm),
    state,
    isDisabled: isWidthChipDisabled(state),
  };
}

/** Takes the whole three-state union rather than what this milestone happens to produce, so the
 *  rule stays written down while M5's `free` is still unreachable. */
function isWidthChipDisabled(state: WidthChipState): boolean {
  return state !== "free";
}
