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
// **Two selections, and they are not the same selection.** The pill that opens this surface names
// what the design *carries* — `applied` — because it is read with the sheet shut. The options inside
// name what the customer has *chosen and not yet applied* — `pending`. Collapsing the two would make
// the pill change under a customer who has not pressed *Aplică* yet.
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
} from "@lemnaria/configurator-domain";

import { swatchOf } from "@lemnaria/three-adapter";

import type { Content } from "@/i18n/content";
import type { WholeKitchenSetting } from "@/store/whole-kitchen-apply";
import {
  describeAddedAmount,
  describeFlaggedTotalWarning,
  describeStartingPrice,
  type PriceFigure,
} from "@/price/starting-price";
import {
  UnofferedDefaultTierError,
  type OfferedTier,
  type OfferedTierGroup,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";

/** The two whole-kitchen groups the book offers, named once so the headings map, the pill and the
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
  /** What changing it does, in words unlike the material warning's — see `globalSettings` in the catalogue. */
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

/**
 * **The settings frame D2A's pill names, in the order the ladder collapses from the end of.**
 *
 * `material │ colour │ hardware │ depth` — [ADR 0099](../../../../docs/decisions/0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md)
 * decision 9's order, on the owner's *"just behind the material"*, and the order the sheet already
 * renders. It is not a presentation choice: the pill sheds labels from the end, so this is what
 * decides that `PAL melaminat` is the name that survives at the floor — which is also what frame 2A
 * draws at its own extreme.
 */
export type SettingsPillKey = "material" | "colour" | "hardware" | "depth";

/** One setting, with the **whole** label D2A composes for it. A label is drawn whole or it is
 *  counted; there is no abbreviated form and none is invented (ADR 0104 decision 3). */
export interface SettingsPillEntry {
  readonly key: SettingsPillKey;
  /** **Empty for a colour that has no name** — see `colourEntryOf`. The setting is still shown and
   *  still counted; what shows it is the swatch, which is wearing it. */
  readonly label: string;
}

/** The colour the pill's swatch wears — the adapter's own value for the finish, so the swatch, the
 *  panel's chips and the 3D all paint one declared colour. `isWood` derives a grain from that same
 *  value rather than naming a second (the language `editor-panel.module.css` already speaks). */
export interface SettingsPillSwatch {
  readonly colour: string;
  readonly isWood: boolean;
}

/**
 * Frames D2A / 2A's one control: what the kitchen carries, readable with the sheet shut.
 *
 * **The labels are not the breakdown's**, and the frame is what says so. The shipped chips composed
 * `priceBreakdown.wholeKitchenLabel` — *"Material · PAL melaminat"* — and D2A draws none of that:
 * the material bare, the others a category word and a value with no separator. Under ADR 0104
 * decision 1 the frame wins. Only the *words* are shared with the breakdown, so a tier cannot come
 * to be spelled two ways.
 */
export interface SettingsPillView {
  readonly settings: readonly SettingsPillEntry[];
  /** **One swatch, at the head of the pill**, because that is what both frames draw and neither
   *  draws a second. It wears the kitchen's own colour rather than the frames' fixed decor texture —
   *  the owner's ruling of 2026-09-09, *"if MDF the value interpreted (real color)"*, taken as one
   *  rule for every finish rather than a special case for the one material whose colours have no
   *  names. Absent only where the applied material is undeclared and there is no palette to read. */
  readonly swatch?: SettingsPillSwatch;
  /** **Every setting, whole, at every rung.** `+N` is a visual economy and must not cost a
   *  screen-reader user a setting, so this is what the control is named by rather than what it
   *  draws. */
  readonly accessibleName: string;
}

/** What the pill draws at the rung it is on: the labels it shows, and the counter for the rest.
 *  **Never a bare counter** — `labels` always holds at least one. */
export interface SettingsPillRung {
  readonly labels: readonly string[];
  /** Absent, never empty, when every setting is named. */
  readonly counter?: string;
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
  /** The control that opens this surface, which since ADR 0104 decision 2 **is** frame D2A's pill:
   *  there is no separate *Setări globale* text trigger in any frame. */
  readonly pill: SettingsPillView;
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
   *  **It carries no refusal wording, since the owner's ruling of 2026-09-09.** The *"neschimbat"*
   *  label this figure used to inherit is gone from every surface — §9's refusal banner already says
   *  the edit was refused — so there is one label and no rule to share. */
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
  /** The active locale's copy. Every leaf this sheet renders comes from here. */
  readonly content: Content;
  readonly pricing: PricingResult;
  readonly offer: WholeKitchenTierOffer;
  /** `projectDesignForDisplay`'s answer, and **the only source of the body count**: a void and an
   *  empty column are placements the projection does not carry, so `placements.length` would state
   *  a number of bodies the customer cannot see. */
  readonly groups: readonly DisplayGroup[];
  readonly applied: WholeKitchenChoice;
  readonly pending: WholeKitchenChoice;
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

/** The category word in front of a tier name is `priceBreakdown`'s, and one ruled string stored
 *  twice is how two spellings come back (the withdrawn *"De la neschimbat"* records that). **The composition
 *  around it is no longer shared**: the breakdown prints *"Feronerie · Hettich"* and frame D2A draws
 *  *"Feronerie Hettich"*, so the pill composes its own (ADR 0104 decision 1) out of these words. */
function chipCategories(
  content: Content,
): Readonly<Record<WholeKitchenGroupKey, string>> {
  return content.priceBreakdown.wholeKitchenCategories;
}

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
    input.content,
  );
  const colourGroup = toColourGroupView(input.pending, input.content);
  return {
    pill: describeSettingsPill({
      offer: input.offer,
      applied: input.applied,
      content: input.content,
    }),
    title: input.content.globalSettings.title,
    appliesTo: input.content.globalSettings.appliesTo(
      countBodies(input.groups),
    ),
    groups: [
      toGroupView(
        "material",
        material,
        input.pending.materialTierId,
        input.content,
      ),
      toGroupView(
        "hardware",
        hardware,
        input.pending.hardwareTierId,
        input.content,
      ),
    ],
    depthGroup: toDepthGroupView(input.pending.cabinetDepthMm, input.content),
    ...(colourGroup === undefined ? {} : { colourGroup }),
    warning: input.content.globalSettings.materialWarning,
    ...(figure === undefined ? {} : { figure }),
    ...(overflowWarning === undefined ? {} : { overflowWarning }),
    applyLabel: input.content.globalSettings.apply,
    cancelLabel: input.content.globalSettings.cancel,
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
function settingHeadings(
  content: Content,
): Readonly<Record<WholeKitchenSetting, string>> {
  return {
    material: content.globalSettings.groupHeadings.material,
    finish: content.globalSettings.colourHeading,
    hardware: content.globalSettings.groupHeadings.hardware,
    cabinetDepth: content.globalSettings.depthHeading,
  };
}

/** **What a refused press says**, and it says *nothing was applied* on purpose: the press is one
 *  commit now, so a customer who reads this has lost none of their other choices and the sheet is
 *  still open on them. */
export function describeApplyRefusal(
  refusal: ApplyRefusal,
  content: Content,
): string {
  return content.globalSettings.applyRefused(
    settingHeadings(content)[refusal.setting],
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
  content: Content,
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
    title: content.globalSettings.materialResetConfirm.title,
    body: describeColourLoss(loss, content),
    confirmLabel: content.globalSettings.materialResetConfirm.confirm,
    backLabel: content.globalSettings.materialResetConfirm.back,
  };
}

/** **What is about to be lost, in the words that match which loss it is** (ADR 0099 decision 7).
 *
 *  The per-cabinet sentence keeps its ruled wording and its count. The whole-kitchen one is a
 *  separate sentence rather than the same one with a zero in it: *"culorile alese pentru 0
 *  dulapuri"* is the bare number ADR 0001 decision 4 keeps off the screen, and it would say the
 *  wrong thing about the right press. Where both losses are true the cabinets' sentence is shown —
 *  it names the larger loss, and the kitchen's own colour goes with it either way. */
function describeColourLoss(loss: PendingColourLoss, content: Content): string {
  if (loss.chosenColourCount > 0) {
    return content.globalSettings.materialResetConfirm.body(
      loss.chosenColourCount,
    );
  }
  return content.globalSettings.materialResetConfirm.globalBody;
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
  content: Content,
): ColourGroupView | undefined {
  const materialTierId = pending.materialTierId ?? DEFAULT_MATERIAL_ID;
  const lookup = lookUpMaterial(materialTierId);
  if (lookup.kind === "undeclared") return undefined;
  return {
    heading: content.globalSettings.colourHeading,
    materialTierId,
    selected: pending.finish ?? lookup.material.defaultFinish,
    note: content.globalSettings.colourNote,
    warning: content.globalSettings.colourWarning,
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

function toDepthGroupView(
  pendingDepthMm: number | undefined,
  content: Content,
): DepthGroupView {
  const offered = offeredCabinetDepthsMm();
  const selected = offered.includes(pendingDepthMm ?? Number.NaN)
    ? pendingDepthMm
    : DEFAULT_CABINET_DEPTH_MM;
  return {
    heading: content.globalSettings.depthHeading,
    shape: offered.length === 2 ? "toggle" : "list",
    options: offered.map((cabinetDepthMm) => ({
      cabinetDepthMm,
      label: content.globalSettings.depthOption(cabinetDepthMm),
      isSelected: cabinetDepthMm === selected,
    })),
    note: content.globalSettings.depthNote,
    warning: content.globalSettings.depthWarning,
  };
}

/** The running total, or nothing at all where the design could not be priced — never a zero, which
 *  a customer reads as a free kitchen. */
function describeFigure(
  input: DescribeGlobalSettingsInput,
): PriceFigure | undefined {
  if (!input.pricing.ok) return undefined;
  return describeStartingPrice({
    totalMinor: input.pricing.priced.totalMinor,
    copy: input.content.price,
  });
}

function describeOverflow(
  input: DescribeGlobalSettingsInput,
): string | undefined {
  if (!input.pricing.ok) return undefined;
  return describeFlaggedTotalWarning(input.pricing.priced, input.content.price);
}

/** What the pill needs and nothing else: the book's offer and **what the design carries**. The
 *  pending choice is deliberately absent — the pill is read with the sheet shut, so it names what is
 *  applied, exactly as the chips it replaces did. */
export interface DescribeSettingsPillInput {
  readonly offer: WholeKitchenTierOffer;
  readonly applied: WholeKitchenChoice;
  readonly content: Content;
}

/**
 * Frames D2A / 2A's pill, as a value.
 *
 * **Exported on its own** because the row above it needs the same answer before the pill is drawn:
 * which rung the pill can reach is what decides whether the wordmark stays
 * (`app/configurator/configure/top-bar-fit.ts`), and measuring a label means having its string.
 *
 * **The colour is a setting like the other three, and the ladder decides whether it is drawn** — the
 * owner's *"if it fits, it should be displayed also"*. It is absent only where the applied material
 * is undeclared, which is the one state that declares no palette to name a colour from; the count
 * then counts from three, because `N` is derived from the settings that exist.
 */
export function describeSettingsPill(
  input: DescribeSettingsPillInput,
): SettingsPillView {
  const settings = [
    {
      key: "material" as const,
      label: input.content.globalSettings.pillMaterial(
        resolvedTierName(
          selectedTierIn(input.offer.material, input.applied.materialTierId),
          input.content,
        ),
      ),
    },
    ...colourEntryOf(input.applied, input.content),
    {
      key: "hardware" as const,
      label: input.content.globalSettings.pillHardware(
        chipCategories(input.content).hardware,
        resolvedTierName(
          selectedTierIn(input.offer.hardware, input.applied.hardwareTierId),
          input.content,
        ),
      ),
    },
    {
      key: "depth" as const,
      label: input.content.globalSettings.pillDepth(
        input.applied.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM,
      ),
    },
  ];
  const swatch = swatchWornBy(input.applied);
  return {
    settings,
    ...(swatch === undefined ? {} : { swatch }),
    // **Every setting, whole, including the one that draws no text.** A colour with no name is a
    // swatch on screen and a name here — `spokenColourOf`'s fallback — because the
    // count is a visual economy and a swatch is not something a screen reader can read.
    accessibleName: input.content.globalSettings.pillNameAllSettings(
      settings.map((setting) =>
        setting.label === ""
          ? spokenColourOf(input.applied, input.content)
          : setting.label,
      ),
    ),
  };
}

/**
 * What the pill draws at the rung the fit model put it on.
 *
 * **The floor is enforced here as well as decided there** (ADR 0104 decision 3): a rung that named
 * nothing would be a bare `+3`, which is a control that says the kitchen carries four things and
 * which four is a secret.
 */
/** Frame 2A `:492` draws the counter as `+2`. **The mark lives here rather than in the copy module**:
 *  a `+` written into the catalogue is arithmetic authored into a label, which is the same rule
 *  `starting-price.ts`'s `ADDED_AMOUNT_SIGN` carries for the delta's sign. It is a mark and a digit
 *  and it carries no Romanian. */
const HIDDEN_SETTINGS_MARK = "+";

/** The widest counter the pill can draw — every setting but the one it must always name. The fit
 *  model spends this width at every rung, because a width that depended on the count it decides
 *  would not be a function. */
export function widestCounterFor(pill: SettingsPillView): string {
  return countLabelOf(Math.max(pill.settings.length - 1, 1));
}

function countLabelOf(hiddenCount: number): string {
  return `${HIDDEN_SETTINGS_MARK}${String(hiddenCount)}`;
}

export function describePillRung(
  pill: SettingsPillView,
  visibleCount: number,
): SettingsPillRung {
  const shown = Math.min(Math.max(visibleCount, 1), pill.settings.length);
  const hiddenCount = pill.settings.length - shown;
  return {
    // **A shown setting that has no name contributes no label and no separator.** The free colour is
    // on the pill — the swatch is wearing it — and a `│` around nothing would be a divider between a
    // name and a space. It is still *shown*, so the counter does not count it.
    labels: pill.settings
      .slice(0, shown)
      .map((setting) => setting.label)
      .filter((label) => label !== ""),
    ...(hiddenCount === 0 ? {} : { counter: countLabelOf(hiddenCount) }),
  };
}

/**
 * The kitchen's colour, as the owner ruled it on 2026-09-09: *"the color should be without word
 * Culoare, just the color name or if MDF the value interpreted (real color)"*.
 *
 * So there are two renderings and one setting:
 *
 * - a **palette** colour draws its own name and nothing else — `Alb`, `Nuc Warmia Maro` — with no
 *   category word, unlike the hardware and depth segments D2A does put one in front of;
 * - a **free** colour has no name to draw, only a hex, so it draws **no text at all** and the
 *   swatch wears it instead. A hex on the pill would be a value nobody reads as a colour.
 *
 * **It is a shown setting either way**, so `+N` counts from four and the ladder is unaffected: what
 * is "shown" for a free colour is a filled swatch, not an absent label.
 *
 * The finish is the design's own global one, or the applied material's declared default where it
 * chose none — absence is the state most documents are in and it means every cabinet follows the
 * material (ADR 0099).
 */
function colourEntryOf(
  applied: WholeKitchenChoice,
  content: Content,
): readonly SettingsPillEntry[] {
  const finish = appliedFinishOf(applied);
  if (finish === undefined) return [];
  return [{ key: "colour", label: nameOfFinish(finish, content) }];
}

/** What the pill's one swatch wears. Absent only where the applied material is undeclared, which is
 *  the same state that leaves the colour off the pill entirely. */
function swatchWornBy(
  applied: WholeKitchenChoice,
): SettingsPillSwatch | undefined {
  const finish = appliedFinishOf(applied);
  if (finish === undefined) return undefined;
  const swatch = swatchOf(finish);
  return { colour: swatch.color, isWood: swatch.isWood };
}

function appliedFinishOf(applied: WholeKitchenChoice): Finish | undefined {
  const lookup = lookUpMaterial(applied.materialTierId ?? DEFAULT_MATERIAL_ID);
  if (lookup.kind === "undeclared") return undefined;
  return applied.finish ?? lookup.material.defaultFinish;
}

/** A palette entry's name, resolved from the entry id through the catalogue — so a document carrying
 *  an entry from a material it has since left is still named, and a `/ru` customer reads the pill in
 *  Russian rather than in the palette's Romanian. **A free colour returns nothing**: it has no name,
 *  and the pill draws it rather than writing it. */
function nameOfFinish(finish: Finish, content: Content): string {
  if (finish.kind === "free-colour") return "";
  return content.finishName(finish.entryId);
}

/** What a screen reader is told about a colour the pill only draws. The visible pill shows a swatch;
 *  a name has to be said, and for a free colour the only fact there is is the value itself. */
function spokenColourOf(applied: WholeKitchenChoice, content: Content): string {
  const finish = appliedFinishOf(applied);
  if (finish === undefined) return "";
  return finish.kind === "free-colour"
    ? content.globalSettings.pillColourValue(finish.value)
    : nameOfFinish(finish, content);
}

function toGroupView(
  key: WholeKitchenGroupKey,
  group: OfferedTierGroup,
  pendingTierId: string | undefined,
  content: Content,
): TierGroupView {
  const selected = selectedTierIn(group, pendingTierId);
  return {
    key,
    heading: content.globalSettings.groupHeadings[key],
    // Stated exactly when there is an amount for it to be about: a heading that named an anchor
    // above a list stating no amounts would be a sentence about arithmetic nobody can see.
    ...(group.tiers.some((tier) => tier.deltaMinor !== undefined)
      ? { anchor: content.globalSettings.groupAnchors[key] }
      : {}),
    tierIds: group.tierIds,
    options: group.tiers.map((tier) => ({
      tierId: tier.tierId,
      name: resolvedTierName(tier, content),
      description: content.bookText(tier.description, tier.descriptionKey),
      ...(tier.deltaMinor === undefined
        ? {}
        : { deltaText: describeDelta(tier.deltaMinor, content) }),
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

/** What a tier is called on screen: the catalogue leaf its book row names, or the row's own authored
 *  name where it names none — ADR 0106 decision 1, resolved here because this is where the content
 *  is. The sheet's radios and the pill's segment go through this one function, so a tier cannot come
 *  to be spelled two ways on the same screen. */
function resolvedTierName(tier: OfferedTier, content: Content): string {
  return content.bookText(tier.name, tier.nameKey);
}

/**
 * What one tier's badge prints.
 *
 * **A zero reads *inclus*, never `0`** — ADR 0001 decision 4's rule as `price-breakdown-model.ts`
 * already applies it to a zero-amount row: omission never means included, and `0` beside a choice is
 * the number-that-is-not-a-price the ruled word exists to keep off the screen. Rounding is upward,
 * so only a tier that genuinely adds nothing can reach zero here.
 */
function describeDelta(deltaMinor: number, content: Content): string {
  if (deltaMinor === 0) return content.priceBreakdown.included;
  return content.globalSettings.tierDelta(describeAddedAmount(deltaMinor));
}

/** The bodies the customer can see, which is what a whole-kitchen setting applies to. */
function countBodies(groups: readonly DisplayGroup[]): number {
  return groups.reduce((count, group) => count + group.entries.length, 0);
}
