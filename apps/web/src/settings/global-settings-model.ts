// Frames 2E / D2E's whole-kitchen settings, as a value.
//
// The split `price-breakdown-model.ts` uses, for its reason: this module owns every rule and every
// string, the component owns the markup, and a pure projection can be pinned without a browser.
//
// **Nothing here decides a price, a tier or a denominator.** The tiers, their words and their
// measured deltas all arrive from `whole-kitchen-tiers.ts`; the body count arrives from wave 6A's
// projection; the total arrives from `usePricedDesign`. What this decides is which of them the
// customer reads, and in what words.
//
// **Two selections, and they are not the same selection.** The chips beside the control name what
// the design *carries* — `applied` — because they are visible with the sheet shut. The options
// inside name what the customer has *chosen and not yet applied* — `pending`. Collapsing the two
// would make the chips change under a customer who has not pressed *Aplică* yet.
import {
  DEFAULT_CABINET_DEPTH_MM,
  DEFAULT_MATERIAL_ID,
  declaredCabinetDepthsMm,
  lookUpMaterial,
  materialOffersFinish,
  MIN_CABINET_DEPTH_MM,
  type DisplayGroup,
  type Finish,
  type MaterialLookup,
  type PricingResult,
  type RejectionReason,
} from "@lemnaria/configurator-domain";

import { ro } from "@/content/ro";
import type { WholeKitchenSetting } from "@/store/whole-kitchen-apply";
import {
  describeAddedAmount,
  describeFlaggedTotalWarning,
  describeStartingLabel,
  describeStartingPrice,
  type PriceFigure,
} from "@/price/starting-price";
import {
  UnofferedDefaultTierError,
  type OfferedTier,
  type OfferedTierGroup,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";

/** The two whole-kitchen groups the book offers, named once so the headings map, the chips and the
 *  view's own sections cannot come to disagree about what a group is. */
export type WholeKitchenGroupKey = "material" | "hardware";

/** One tier as a customer reads it: the book's name and description, and what choosing it adds. */
export interface TierOption {
  readonly tierId: string;
  readonly name: string;
  readonly description: string;
  /** *"inclus"* at zero, *"de la +9 000"* above it — never `0`, see `describeDelta`. **Absent when
   *  the design could not be priced**: the tier is still offered, with nothing said about what it
   *  would cost. **Absent, too, on a hardware tier that prices this design below the group's
   *  default** — `whole-kitchen-tiers.ts`'s `BelowDefaultTierRule`, which publishes no amount for
   *  it rather than a negative one. Both are the same state on screen, deliberately: a tier that is
   *  offered with nothing said about its price. */
  readonly deltaText?: string;
  /** Against the **pending** choice, which is what the sheet is editing. */
  readonly isSelected: boolean;
}

export interface TierGroupView {
  readonly key: WholeKitchenGroupKey;
  readonly heading: string;
  /** What this group's deltas are measured against, said in the product's own words. Present
   *  whenever any of its options states one. */
  readonly anchor?: string;
  /** Every id the book offers — handed to the 6E command as `availableTierIds` when apply runs. */
  readonly tierIds: readonly string[];
  readonly options: readonly TierOption[];
}

/** One offered cabinet depth, as a customer reads it. **No delta and no anchor**: a depth change
 *  moves no price, so the tier shape's two price fields would have to be invented empty here — see
 *  `DepthGroupView`. */
export interface DepthOption {
  readonly cabinetDepthMm: number;
  readonly label: string;
  /** Against the **pending** choice, like a tier's — the sheet edits pending, not applied. */
  readonly isSelected: boolean;
}

/**
 * The third whole-kitchen group, and **deliberately not a `TierGroupView`**.
 *
 * A tier group is shaped by a price: `tierIds` is what the 6E commands take as `availableTierIds`,
 * `anchor` names what its deltas are measured against, and each option carries a `deltaText`. A
 * depth has none of the three — it adds no price line at all (ADR 0036 decision 3), so forcing it
 * through that shape means an empty `tierIds`, an absent anchor and an option type whose price field
 * is never populated. That is a lie in the type rather than a saving.
 *
 * It is a second *shape* in one view, not a second sheet: `describeGlobalSettings` still returns one
 * value, the component still renders one surface with one apply, and the two section renderers sit
 * side by side in it.
 */
export interface DepthGroupView {
  readonly heading: string;
  /** **Read from the declared map, never counted by the component** (ADR 0056): a toggle at two
   *  declared depths, a list at three or more. Deciding it here is what makes a third depth a data
   *  row rather than a markup change. */
  readonly shape: "toggle" | "list";
  readonly options: readonly DepthOption[];
  /** Why this group shows no price. Stated so its absence does not read as a line that is missing. */
  readonly note: string;
  /** What changing it does, in words unlike the material warning's — see `ro.globalSettings`. */
  readonly warning: string;
}

/**
 * **The fourth whole-kitchen group** — ADR 0099 decision 9, and the owner's *"just behind the
 * material"*.
 *
 * It is **not** a `TierGroupView`: that shape is defined by a price delta and an anchor, and colour
 * has neither (ADR 0071 decision 1). It is `DepthGroupView`'s shape — a group that shows no price
 * and says why — with one difference that is the whole feature: its options are **a material's own
 * declared `ColourControl`**, not a list authored here. So what this publishes is *which* material's
 * palette to draw and *which* swatch is standing, and the control itself is the per-cabinet one the
 * editor already renders.
 *
 * **Nothing here says whether a swatch may be pressed.** Whether this browser may write is
 * `store/editability.ts`'s one answer, applied by the component that holds it — the same split
 * `TierGroupSection` and `DepthGroupSection` already use, and the reason this model needs no
 * `Editability` argument.
 */
export interface ColourGroupView {
  readonly heading: string;
  /** **The pending material's id, never the applied one** (ADR 0099 decision 4). One Apply is one
   *  transaction, so a customer who changes the material and then the colour must be choosing from
   *  the palette they are about to be on. */
  readonly materialTierId: string;
  /** The swatch the kitchen is standing on: the pending global colour, or the pending material's
   *  declared default where none is chosen. Absent only where that material is undeclared. */
  readonly selected?: Finish;
  /** Why this group shows no price (ADR 0071 decision 1). */
  readonly note: string;
  /** ADR 0099 decision 6 asks for this to be said rather than implied: the three materials' offers
   *  are disjoint, so a material change replaces this colour every time, not sometimes. */
  readonly warning: string;
}

/**
 * **The step that stands between *Aplică* and a material change that would discard a chosen colour**
 * (ADR 0081 decisions 2 and 3, ADR 0086).
 *
 * Its presence *is* the rule: the component holds one boolean of its own — *am I on the confirm
 * step* — and never asks whether a confirmation is owed. Absent, never an empty view, when nothing
 * would be lost, so a sheet that always confirmed could not be built out of this shape.
 *
 * **The title travels with the step** (ADR 0086 decision 6): it replaces the head's `<h2>`, so the
 * dialog's accessible name follows what the screen is asking, and `appliesTo`'s count of *every*
 * body is not left standing four lines above this one's count of chosen colours.
 */
export interface MaterialResetConfirmView {
  readonly title: string;
  /** The consequence, with the number of cabinets it applies to. **The query's count, never the
   *  command's `resolvedFinishCount`** — see `toMaterialResetConfirm`. */
  readonly body: string;
  /** Names the change, never *OK*. */
  readonly confirmLabel: string;
  /** Names what is kept, never *Anulează*. */
  readonly backLabel: string;
}

/** One of the two summaries standing beside the control that opens the sheet. */
export interface SettingsChip {
  readonly key: WholeKitchenGroupKey;
  readonly label: string;
}

/**
 * **This surface has no unavailable state, and that is the opposite of `price-breakdown-model.ts`.**
 *
 * A breakdown of a total that could not be computed is a longer version of the same invented number,
 * so it renders nothing. This is not a report — it is the **control** that chooses the tiers, and the
 * document that most needs it is exactly the one that cannot be priced: a design carrying a tier the
 * book has since withdrawn. Blanking there would make the fault remove its own remedy.
 *
 * So the tiers come from the book and are always listed; the deltas and the figure come from
 * pricing and are absent when there is none. What a pricing failure costs the customer is numbers,
 * never the ability to choose.
 */
export interface GlobalSettingsView {
  readonly openLabel: string;
  readonly chips: readonly SettingsChip[];
  readonly title: string;
  /** How many bodies this applies to, and that it is not set per cabinet. */
  readonly appliesTo: string;
  readonly groups: readonly TierGroupView[];
  /** The depth, as its own group. Always present: the map always declares at least one depth, and a
   *  sheet that hid the control when only one was offered would make the setting undiscoverable. */
  readonly depthGroup: DepthGroupView;
  /** The whole-kitchen colour, after the material group and before hardware (ADR 0099 decision 9).
   *  **Absent — never present and empty — where the pending material is undeclared**, because such a
   *  material declares no `ColourControl` and there is no control shape to render (ADR 0078
   *  decision 3). That is the panel's own answer to the same question, and it is what keeps wave
   *  6G's recovery path working: the rest of the sheet still renders, so the customer can choose
   *  their way back to a declared material. */
  readonly colourGroup?: ColourGroupView;
  readonly warning: string;
  /** The running total, restated here because on both shells this surface covers the bar that shows
   *  it — and because a customer choosing a tier is choosing against a figure. Absent, never zero,
   *  when the design cannot be priced.
   *
   *  **Its label carries the refusal**, like the bar's and §9's footer's: covering the bar is the
   *  stated reason this figure is repeated at all, so it is also the reason the *"neschimbat"*
   *  wording has to travel with it. One rule, in `describeStartingLabel`. */
  readonly figure?: PriceFigure;
  /** ADR 0065 decision 6: the flag travels with the total wherever a total is shown, and this
   *  surface shows one. Absent — never empty — when the design overflows nothing. */
  readonly overflowWarning?: string;
  readonly applyLabel: string;
  readonly cancelLabel: string;
  /** Present exactly when pressing *Aplică* must ask first — see `toMaterialResetConfirm`. */
  readonly materialResetConfirm?: MaterialResetConfirmView;
}

/** What the design carries, and what the sheet is editing. Both keys of both are optional because
 *  `design.settings` is: an absent choice is priced at the book's own default tier, which is book
 *  data rather than a rule living here. */
export interface WholeKitchenChoice {
  readonly materialTierId?: string | undefined;
  readonly hardwareTierId?: string | undefined;
  /** Optional for the reason the two tier ids are: `design.settings` is, and a document written
   *  before wave 6J-a carries none. An absent choice reads as the declared default. */
  readonly cabinetDepthMm?: number | undefined;
  /** ADR 0099's whole-kitchen colour. **Absent is the state most documents are in and it must stay
   *  reachable**: it means every cabinet follows the material's declared default, and an apply that
   *  stamped a colour in would convert a whole kitchen of following cabinets into overriding ones. */
  readonly finish?: Finish | undefined;
}

export interface DescribeGlobalSettingsInput {
  readonly pricing: PricingResult;
  readonly offer: WholeKitchenTierOffer;
  /** `projectDesignForDisplay`'s answer, and **the only source of the body count**: a void and an
   *  empty column are placements the projection does not carry, so `placements.length` would state
   *  a number of bodies the customer cannot see. */
  readonly groups: readonly DisplayGroup[];
  readonly applied: WholeKitchenChoice;
  readonly pending: WholeKitchenChoice;
  /** The last refusal, or `null`. Only the figure's *label* reads it — see `figure`. */
  readonly rejection: RejectionReason | null;
  /** `countCabinetsWearingAChosenFinish`'s answer about the **stored** design, and the only count
   *  the confirmation may state. Required rather than optional: an absent one would read as zero,
   *  which is *never confirm* — the one wrong answer that passes every other test in the suite. */
  readonly chosenColourCount: number;
  /** **ADR 0099 decision 7's second arm**, answered by the domain's `wouldDiscardTheGlobalFinish`
   *  and handed in as a fact, exactly as the count above is (ADR 0086 decision 2's shape).
   *
   *  A design where every cabinet follows one global colour has `chosenColourCount === 0` under the
   *  amended base, and a material change still discards a colour somebody chose — so without this
   *  the product would silently lose exactly the choice this feature adds.
   *
   *  **Optional, and `false` is the honest default**: it can only be true of a design carrying
   *  `settings.finish`, which no document written before this wave does, so a caller that does not
   *  answer it is describing a design the arm cannot fire for. */
  readonly globalFinishWouldBeLost?: boolean;
}

/** The material half of the press, as `toMaterialResetConfirm` asks about it. **Both sides are tier
 *  ids and both are optional**, because `design.settings` is and because a customer may not have
 *  touched the material control at all. */
interface PendingMaterialChange {
  readonly appliedMaterialTierId: string | undefined;
  readonly pendingMaterialTierId: string | undefined;
}

/** **What this press would discard, at both levels** — the two facts the confirmation's presence is
 *  a function of, grouped so `toMaterialResetConfirm` keeps taking answers rather than an input it
 *  could reach the wrong number out of (ADR 0086 decision 2). */
interface PendingColourLoss {
  readonly chosenColourCount: number;
  readonly globalFinishWouldBeLost: boolean;
}

/** The category word in front of a chip's tier name, and the composition around it, are
 *  `priceBreakdown`'s: frames 2D and 2E print the same *"Material · PAL melaminat"*, and one ruled
 *  string stored twice is how two spellings come back (`startingPrefixUnchanged` records that). */
const CHIP_CATEGORIES: Readonly<Record<WholeKitchenGroupKey, string>> =
  ro.priceBreakdown.wholeKitchenCategories;

export function describeGlobalSettings(
  input: DescribeGlobalSettingsInput,
): GlobalSettingsView {
  const { material, hardware } = input.offer;
  const figure = describeFigure(input);
  const overflowWarning = describeOverflow(input);
  const materialResetConfirm = toMaterialResetConfirm(
    {
      chosenColourCount: input.chosenColourCount,
      globalFinishWouldBeLost: input.globalFinishWouldBeLost ?? false,
    },
    {
      appliedMaterialTierId: input.applied.materialTierId,
      pendingMaterialTierId: input.pending.materialTierId,
    },
  );
  const colourGroup = toColourGroupView(input.pending);
  return {
    openLabel: ro.globalSettings.open,
    chips: [
      toChip("material", material, input.applied.materialTierId),
      toChip("hardware", hardware, input.applied.hardwareTierId),
    ],
    title: ro.globalSettings.title,
    appliesTo: ro.globalSettings.appliesTo(countBodies(input.groups)),
    groups: [
      toGroupView("material", material, input.pending.materialTierId),
      toGroupView("hardware", hardware, input.pending.hardwareTierId),
    ],
    depthGroup: toDepthGroupView(input.pending.cabinetDepthMm),
    ...(colourGroup === undefined ? {} : { colourGroup }),
    warning: ro.globalSettings.materialWarning,
    ...(figure === undefined ? {} : { figure }),
    ...(overflowWarning === undefined ? {} : { overflowWarning }),
    applyLabel: ro.globalSettings.apply,
    cancelLabel: ro.globalSettings.cancel,
    ...(materialResetConfirm === undefined ? {} : { materialResetConfirm }),
  };
}

/**
 * **What the sheet opens editing, which is what it displays and not what the document says**
 * (M6-AUD-012).
 *
 * The sheet used to open on the stored selection copied verbatim. A design carrying a tier the book
 * has since withdrawn then displayed the group's *default* as checked — `selectedTierIn` resolves an
 * unoffered id to it — while pending still held the withdrawn one. The checked radio therefore fired
 * no change event, and `Aplică` compared the withdrawn pending id against the identical applied id
 * and exited as unchanged. Pricing stayed unavailable, and the only escape was to pick another tier
 * and come back: undiscoverable. Verified in a browser against a real document holding
 * `materialTierId: "material.withdrawn"`.
 *
 * So the opening pending state is the **resolved** one: whatever the customer can see checked is
 * what one press stores.
 *
 * **A choice the design does not name stays unnamed**, and that is the trap in this fix rather than
 * an omission. Seeding an absent tier with the book's default would make *Aplică* on an untouched
 * sheet stamp the defaults into a document that had deliberately chosen nothing — the exact opposite
 * of `applyPending`'s *apply writes only what changed*. What is rewritten here is a stored id the
 * book no longer offers, which is not a choice the customer still has.
 *
 * **The depth is deliberately not resolved here.** `toDepthGroupView` falls back the same way, but
 * committing that fallback rebuilds every body and redraws the scene (ADR 0074) — a different class
 * of act from writing a tier id, and one no decision has ruled may happen on a press the customer
 * did not aim at the depth. Recorded rather than fixed in passing.
 */
export function resolveOpeningChoice(
  applied: WholeKitchenChoice,
  offer: WholeKitchenTierOffer,
): WholeKitchenChoice {
  const resolved: WholeKitchenChoice = {
    ...applied,
    ...offeredOrFallback(
      "materialTierId",
      applied.materialTierId,
      offer.material,
    ),
    ...offeredOrFallback(
      "hardwareTierId",
      applied.hardwareTierId,
      offer.hardware,
    ),
  };
  // **The stored global colour follows the material the sheet actually opens on.** A withdrawn
  // material id resolves to the book's default one line above, and that default is a different
  // declared material whose offers are disjoint from the stored one's (ADR 0078 decision 1) — so
  // the colour the document carries is not one the sheet is offering. Dropping it here is the same
  // rule decision 4 applies to a material change made *inside* the sheet, and absence stays absence.
  return withoutAFinishTheMaterialRefuses(resolved);
}

/** One group's opening id, keyed so the caller spreads it: absent stays absent, an offered id is
 *  kept, and anything else becomes the fallback the group already displays. */
function offeredOrFallback(
  key: "materialTierId" | "hardwareTierId",
  appliedTierId: string | undefined,
  group: OfferedTierGroup,
): Partial<WholeKitchenChoice> {
  if (appliedTierId === undefined) return {};
  if (group.tierIds.includes(appliedTierId)) return { [key]: appliedTierId };
  return { [key]: selectedTierIn(group, appliedTierId).tierId };
}

/** A radio press, as a change of pending state. Extracted from the component so the invariant
 *  *cancel writes nothing* can be swept over arbitrary press sequences without a browser, against
 *  the same function the sheet runs. */
export function chooseTierIn(
  chosen: WholeKitchenChoice,
  choice: { readonly key: WholeKitchenGroupKey; readonly tierId: string },
): WholeKitchenChoice {
  return choice.key === "material"
    ? withoutAFinishTheMaterialRefuses({
        ...chosen,
        materialTierId: choice.tierId,
      })
    : { ...chosen, hardwareTierId: choice.tierId };
}

export function chooseDepthIn(
  chosen: WholeKitchenChoice,
  cabinetDepthMm: number,
): WholeKitchenChoice {
  return { ...chosen, cabinetDepthMm };
}

/** A swatch press, as a change of pending state. Nothing is written until *Aplică*, exactly like a
 *  tier radio and a depth radio — which is what keeps *Renunță* writing nothing however long the
 *  sequence of presses was. */
export function chooseFinishIn(
  chosen: WholeKitchenChoice,
  finish: Finish,
): WholeKitchenChoice {
  return { ...chosen, finish };
}

/**
 * **ADR 0099 decision 4's subtlety, and it must not be left to a reader.**
 *
 * Inside the sheet the customer can change the material and the colour before pressing *Aplică*, and
 * one Apply is one transaction (M6-AUD-004). So a pending colour the newly pending material does not
 * offer is dropped **here, in the sheet, before Apply** — a value the customer can still see the
 * consequence of and re-choose — rather than being committed and then reset by a command.
 *
 * **It deletes the key, it never substitutes a colour.** Writing the new material's default in would
 * make *Aplică* stamp a global colour into a document that had deliberately chosen none, which is
 * the opposite of *apply writes only what changed*; the group still **marks** that default, because
 * `toColourGroupView` falls back to it for display without anybody having chosen it.
 *
 * **An undeclared material refuses nothing** (ADR 0078 decision 3): it declares no offer, so there
 * is nothing for a colour to fail.
 */
function withoutAFinishTheMaterialRefuses(
  chosen: WholeKitchenChoice,
): WholeKitchenChoice {
  const { finish } = chosen;
  if (finish === undefined) return chosen;
  const lookup: MaterialLookup = lookUpMaterial(
    chosen.materialTierId ?? DEFAULT_MATERIAL_ID,
  );
  if (
    lookup.kind === "undeclared" ||
    materialOffersFinish(lookup.material, finish)
  ) {
    return chosen;
  }
  const dropped = { ...chosen };
  delete dropped.finish;
  return dropped;
}

/** A refused press, as the sheet reports it: which setting refused, and the engine's own sentence
 *  about why. */
export interface ApplyRefusal {
  readonly setting: WholeKitchenSetting;
  /** `RejectionReason.message`, already rendered by the domain — this surface invents no refusal
   *  vocabulary of its own (ADR 0032 rule 2). */
  readonly message: string;
}

/** The heading each setting is known by on this sheet, so a refusal names the control the customer
 *  is looking at rather than a field name. */
const SETTING_HEADINGS: Readonly<Record<WholeKitchenSetting, string>> = {
  material: ro.globalSettings.groupHeadings.material,
  finish: ro.globalSettings.colourHeading,
  hardware: ro.globalSettings.groupHeadings.hardware,
  cabinetDepth: ro.globalSettings.depthHeading,
};

/** **What a refused press says**, and it says *nothing was applied* on purpose: the press is one
 *  commit now, so a customer who reads this has lost none of their other choices and the sheet is
 *  still open on them. */
export function describeApplyRefusal(refusal: ApplyRefusal): string {
  return ro.globalSettings.applyRefused(
    SETTING_HEADINGS[refusal.setting],
    refusal.message,
  );
}

/**
 * **The confirmation, or nothing at all** — ADR 0086 decision 3's table, in one place.
 *
 * Present if and only if the pending choice names a **declared** material, that material is not the
 * declared material the design is already on, and a chosen colour would be lost. The applied side
 * resolves through `?? DEFAULT_MATERIAL_ID`, which is the same resolution the query and the
 * validator give it — so choosing melamine on a design that carries no material at all is **not** a
 * material change, and announces no loss the command would not produce.
 *
 * **It compares materials, not id strings**, and it asks `lookUpMaterial` and never
 * `materialOffersFinish`: this decides whether the material changed, the domain decides what a
 * chosen colour is, and the offer keeps one author (ADR 0078 decision 1).
 *
 * **It takes the count and not the input** (ADR 0086 decision 2), which is `toDepthGroupView`'s
 * shape one function up applied for a stronger reason than tidiness. `countBodies(input.groups)` is
 * the other number of cabinets derivable in `describeGlobalSettings` — both are counts of bodies,
 * both are design-dependent, and on the seeded kitchen they differ — and here it is not an
 * identifier at all rather than merely the wrong one to reach for. The two are pinned as literals
 * side by side in `tests/settings/material-reset-confirm.test.ts`, which is where their values live.
 */
function toMaterialResetConfirm(
  loss: PendingColourLoss,
  change: PendingMaterialChange,
): MaterialResetConfirmView | undefined {
  if (loss.chosenColourCount === 0 && !loss.globalFinishWouldBeLost) {
    return undefined;
  }
  if (change.pendingMaterialTierId === undefined) return undefined;
  const pending = lookUpMaterial(change.pendingMaterialTierId);
  // An id the book offers and the domain does not declare resolves nothing when the command runs
  // (ADR 0078 decision 3), so there is no loss to announce.
  if (pending.kind === "undeclared") return undefined;
  const applied = lookUpMaterial(
    change.appliedMaterialTierId ?? DEFAULT_MATERIAL_ID,
  );
  if (
    applied.kind === "declared" &&
    applied.material.materialId === pending.material.materialId
  ) {
    return undefined;
  }
  return {
    title: ro.globalSettings.materialResetConfirm.title,
    body: describeColourLoss(loss),
    confirmLabel: ro.globalSettings.materialResetConfirm.confirm,
    backLabel: ro.globalSettings.materialResetConfirm.back,
  };
}

/** **What is about to be lost, in the words that match which loss it is** (ADR 0099 decision 7).
 *
 *  The per-cabinet sentence keeps its ruled wording and its count. The whole-kitchen one is a
 *  separate sentence rather than the same one with a zero in it: *"culorile alese pentru 0
 *  dulapuri"* is the bare number ADR 0001 decision 4 keeps off the screen, and it would say the
 *  wrong thing about the right press. Where both losses are true the cabinets' sentence is shown —
 *  it names the larger loss, and the kitchen's own colour goes with it either way. */
function describeColourLoss(loss: PendingColourLoss): string {
  if (loss.chosenColourCount > 0) {
    return ro.globalSettings.materialResetConfirm.body(loss.chosenColourCount);
  }
  return ro.globalSettings.materialResetConfirm.globalBody;
}

/**
 * **The colour group, drawn from the pending material's own declaration** (ADR 0099 decisions 4
 * and 9).
 *
 * `undefined` where that material is undeclared: nothing declares a `ColourControl` for it, so there
 * is no control shape to render (ADR 0078 decision 3). The sheet's other three groups keep working,
 * which is what wave 6G's recovery path stands on — the customer can still choose their way back to
 * a declared material.
 */
function toColourGroupView(
  pending: WholeKitchenChoice,
): ColourGroupView | undefined {
  const materialTierId = pending.materialTierId ?? DEFAULT_MATERIAL_ID;
  const lookup = lookUpMaterial(materialTierId);
  if (lookup.kind === "undeclared") return undefined;
  return {
    heading: ro.globalSettings.colourHeading,
    materialTierId,
    selected: pending.finish ?? lookup.material.defaultFinish,
    note: ro.globalSettings.colourNote,
    warning: ro.globalSettings.colourWarning,
  };
}

/** **The depths a customer may choose, read off the declared map and held to ADR 0059's floor.**
 *
 *  The floor is the domain's own constant rather than the arithmetic behind it — `(d − 40)/2 − 240`
 *  stays in `worktop-depth.ts`, where the command enforces it too, so a document cannot arrive below
 *  it by another route. Filtering here rather than trusting the map is §9's *never offer what cannot
 *  be satisfied*: a depth the map declared and the command would refuse must not reach a control.
 *  Today the filter removes nothing, and `cabinet-depth-control.test.ts` is what would say so. */
function offeredCabinetDepthsMm(): readonly number[] {
  return declaredCabinetDepthsMm().filter(
    (cabinetDepthMm) => cabinetDepthMm >= MIN_CABINET_DEPTH_MM,
  );
}

function toDepthGroupView(pendingDepthMm: number | undefined): DepthGroupView {
  const offered = offeredCabinetDepthsMm();
  const selected = offered.includes(pendingDepthMm ?? Number.NaN)
    ? pendingDepthMm
    : DEFAULT_CABINET_DEPTH_MM;
  return {
    heading: ro.globalSettings.depthHeading,
    shape: offered.length === 2 ? "toggle" : "list",
    options: offered.map((cabinetDepthMm) => ({
      cabinetDepthMm,
      label: ro.globalSettings.depthOption(cabinetDepthMm),
      isSelected: cabinetDepthMm === selected,
    })),
    note: ro.globalSettings.depthNote,
    warning: ro.globalSettings.depthWarning,
  };
}

/** The running total, or nothing at all where the design could not be priced — never a zero, which
 *  a customer reads as a free kitchen. */
function describeFigure(
  input: DescribeGlobalSettingsInput,
): PriceFigure | undefined {
  if (!input.pricing.ok) return undefined;
  return describeStartingPrice({
    label: describeStartingLabel(input.rejection),
    totalMinor: input.pricing.priced.totalMinor,
  });
}

function describeOverflow(
  input: DescribeGlobalSettingsInput,
): string | undefined {
  if (!input.pricing.ok) return undefined;
  return describeFlaggedTotalWarning(input.pricing.priced);
}

function toChip(
  key: WholeKitchenGroupKey,
  group: OfferedTierGroup,
  appliedTierId: string | undefined,
): SettingsChip {
  return {
    key,
    label: ro.priceBreakdown.wholeKitchenLabel(
      CHIP_CATEGORIES[key],
      selectedTierIn(group, appliedTierId).name,
    ),
  };
}

function toGroupView(
  key: WholeKitchenGroupKey,
  group: OfferedTierGroup,
  pendingTierId: string | undefined,
): TierGroupView {
  const selected = selectedTierIn(group, pendingTierId);
  return {
    key,
    heading: ro.globalSettings.groupHeadings[key],
    // Stated exactly when there is an amount for it to be about: a heading that named an anchor
    // above a list stating no amounts would be a sentence about arithmetic nobody can see.
    ...(group.tiers.some((tier) => tier.deltaMinor !== undefined)
      ? { anchor: ro.globalSettings.groupAnchors[key] }
      : {}),
    tierIds: group.tierIds,
    options: group.tiers.map((tier) => ({
      tierId: tier.tierId,
      name: tier.name,
      description: tier.description,
      ...(tier.deltaMinor === undefined
        ? {}
        : { deltaText: describeDelta(tier.deltaMinor) }),
      isSelected: tier.tierId === selected.tierId,
    })),
  };
}

/**
 * The tier a choice names, or the book's default where it names none.
 *
 * **The fallback is what a withdrawn tier lands on, and that is now its job rather than an
 * unreachable branch.** A design carrying a tier the book no longer offers used to make the whole
 * surface disappear; it now renders, with the default marked as the standing choice — which is both
 * true (that is what such a design is priced at once the id is gone) and the state a customer needs
 * to see in order to choose their way out of it.
 */
function selectedTierIn(
  group: OfferedTierGroup,
  chosenTierId: string | undefined,
): OfferedTier {
  const chosen = group.tiers.find((tier) => tier.tierId === chosenTierId);
  if (chosen) return chosen;
  const fallback = group.tiers.find(
    (tier) => tier.tierId === group.defaultTierId,
  );
  if (!fallback) throw new UnofferedDefaultTierError(group.defaultTierId);
  return fallback;
}

/**
 * What one tier's badge prints.
 *
 * **A zero reads *inclus*, never `0`** — ADR 0001 decision 4's rule as `price-breakdown-model.ts`
 * already applies it to a zero-amount row: omission never means included, and `0` beside a choice is
 * the number-that-is-not-a-price the ruled word exists to keep off the screen. Rounding is upward,
 * so only a tier that genuinely adds nothing can reach zero here.
 */
function describeDelta(deltaMinor: number): string {
  if (deltaMinor === 0) return ro.priceBreakdown.included;
  return ro.globalSettings.tierDelta(describeAddedAmount(deltaMinor));
}

/** The bodies the customer can see, which is what a whole-kitchen setting applies to. */
function countBodies(groups: readonly DisplayGroup[]): number {
  return groups.reduce((count, group) => count + group.entries.length, 0);
}
