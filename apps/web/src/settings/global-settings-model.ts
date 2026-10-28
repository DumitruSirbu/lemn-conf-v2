// Whole-kitchen settings as a value: tier, depth and colour groups, the pill, and the apply confirmation.
// Decides no price: tiers, deltas and the total arrive from `whole-kitchen-tiers.ts` and `usePricedDesign`.
// The pill names what the design carries (`applied`); the options inside name `pending`, not yet applied.
import {
  DEEP_CABINET_DEPTH_MM,
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

/** The two whole-kitchen tier groups the book offers. */
export type WholeKitchenGroupKey = "material" | "hardware";

/** One tier as a customer reads it: the book's name and description, and what choosing it adds. */
export interface TierOption {
  readonly tierId: string;
  readonly name: string;
  readonly description: string;
  /** *"inclus"* at zero, *"de la +9 000"* above it, never `0`. Absent when the design cannot be priced, and when
   *  a hardware tier prices below the group's default (`BelowDefaultTierRule`): offered, price unsaid. */
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

/** One offered cabinet depth. No delta and no anchor: a depth change moves no price (see `DepthGroupView`). */
export interface DepthOption {
  readonly cabinetDepthMm: number;
  readonly label: string;
  /** Against the **pending** choice, like a tier's — the sheet edits pending, not applied. */
  readonly isSelected: boolean;
}

/**
 * The third whole-kitchen group, deliberately not a `TierGroupView`: a depth adds no price line
 * (ADR 0036), so it has no `tierIds`, `anchor` or `deltaText` to fill.
 */
export interface DepthGroupView {
  readonly heading: string;
  /** Read from the declared map, never counted by the component (ADR 0056): a toggle at two depths, a list at
   *  three or more. */
  readonly shape: "toggle" | "list";
  readonly options: readonly DepthOption[];
  /** Why this group shows no price. Stated so its absence does not read as a line that is missing. */
  readonly note: string;
  readonly warning: string;
}

/**
 * The fourth whole-kitchen group (ADR 0099 decision 9). Colour shows no price, like `DepthGroupView`.
 * Its options are the pending material's own declared `ColourControl`; whether a swatch may be pressed
 * is `store/editability.ts`'s answer, applied by the component.
 */
export interface ColourGroupView {
  readonly heading: string;
  /** The pending material's id, never the applied one (ADR 0099 decision 4): one Apply is one transaction. */
  readonly materialTierId: string;
  /** The swatch the kitchen is standing on: the pending global colour, or the pending material's
   *  declared default where none is chosen. Absent only where that material is undeclared. */
  readonly selected?: Finish;
  /** Why this group shows no price (ADR 0071 decision 1). */
  readonly note: string;
  /** The materials' offers are disjoint, so a material change always replaces this colour (ADR 0099 decision 6). */
  readonly warning: string;
}

/**
 * The step between *Aplică* and a material change that would discard a chosen colour (ADR 0086 decision 3).
 * Absent, never an empty view, when nothing would be lost: the component never asks whether one is owed.
 * The title replaces the head's `<h2>`, so the dialog's accessible name follows the step.
 */
export interface MaterialResetConfirmView {
  readonly title: string;
  /** The consequence with the cabinet count: the query's count, never the command's `resolvedFinishCount`. */
  readonly body: string;
  /** Names the change, never *OK*. */
  readonly confirmLabel: string;
  /** Names what is kept, never *Anulează*. */
  readonly backLabel: string;
}

/**
 * The settings the pill names, in the order the ladder sheds them from the end (ADR 0099 decision 9).
 * That order is why `PAL melaminat` is the label that survives at the floor.
 */
export type SettingsPillKey = "material" | "colour" | "hardware" | "depth";

/** One setting with its whole label; a label is drawn whole or counted, never abbreviated (ADR 0104 decision 3). */
export interface SettingsPillEntry {
  readonly key: SettingsPillKey;
  /** Empty for a colour with no name (see `colourEntryOf`): still shown and counted, the swatch wears it. */
  readonly label: string;
}

/** The colour the pill's swatch wears: the adapter's value for the finish, so swatch, chips and 3D paint one
 *  declared colour. `isWood` derives a grain from that same value. */
export interface SettingsPillSwatch {
  readonly colour: string;
  readonly isWood: boolean;
}

/**
 * What the kitchen carries, readable with the sheet shut (frame D2A). Its labels are not the breakdown's:
 * only the words are shared, so a tier is never spelled two ways (ADR 0104 decision 1).
 */
export interface SettingsPillView {
  readonly settings: readonly SettingsPillEntry[];
  /** One swatch at the head of the pill, wearing the kitchen's own colour for every finish. Absent only where
   *  the applied material is undeclared and there is no palette to read. */
  readonly swatch?: SettingsPillSwatch;
  /** Every setting, whole, at every rung: `+N` must not cost a screen-reader user a setting. */
  readonly accessibleName: string;
}

/** What the pill draws at its rung. Never a bare counter: `labels` always holds at least one. */
export interface SettingsPillRung {
  readonly labels: readonly string[];
  /** Absent, never empty, when every setting is named. */
  readonly counter?: string;
}

/**
 * This surface has no unavailable state, unlike `price-breakdown-model.ts`: it is the control that chooses
 * tiers, and a design carrying a withdrawn tier is the one that cannot be priced. Tiers always come from the
 * book; deltas and the figure are absent when there is no price.
 */
export interface GlobalSettingsView {
  /** The control that opens this surface: frame D2A's pill (ADR 0104 decision 2). */
  readonly pill: SettingsPillView;
  readonly title: string;
  /** How many bodies this applies to, and that it is not set per cabinet. */
  readonly appliesTo: string;
  readonly groups: readonly TierGroupView[];
  /** The depth as its own group. Always present: the map declares at least one depth. */
  readonly depthGroup: DepthGroupView;
  /** After the material group, before hardware (ADR 0099 decision 9). Absent, never empty, where the pending
   *  material is undeclared: it declares no `ColourControl`, and the rest of the sheet still renders. */
  readonly colourGroup?: ColourGroupView;
  readonly warning: string;
  /** The running total, restated because this surface covers the bar that shows it. Absent, never zero,
   *  when the design cannot be priced. It carries no refusal wording. */
  readonly figure?: PriceFigure;
  /** The overflow flag travels with the total (ADR 0065 decision 6). Absent, never empty, when nothing overflows. */
  readonly overflowWarning?: string;
  readonly applyLabel: string;
  readonly cancelLabel: string;
  /** Present exactly when pressing *Aplică* must ask first — see `toMaterialResetConfirm`. */
  readonly materialResetConfirm?: MaterialResetConfirmView;
}

/** What the design carries, and what the sheet is editing. Every key is optional because `design.settings` is:
 *  an absent choice is priced at the book's own default tier. */
export interface WholeKitchenChoice {
  readonly materialTierId?: string | undefined;
  readonly hardwareTierId?: string | undefined;
  /** Optional like the tier ids; an absent choice reads as the declared default. */
  readonly cabinetDepthMm?: number | undefined;
  /** ADR 0099's whole-kitchen colour. Absent means every cabinet follows the material's default and must stay
   *  reachable: an apply that stamped a colour in would turn following cabinets into overriding ones. */
  readonly finish?: Finish | undefined;
}

export interface DescribeGlobalSettingsInput {
  /** The active locale's copy. Every leaf this sheet renders comes from here. */
  readonly content: Content;
  readonly pricing: PricingResult;
  readonly offer: WholeKitchenTierOffer;
  /** The published depth rule's whole percentage (`book.depthRule.deepCabinetPercent`): the only source of the figure
   *  in the depth note. Required, because an absent one would read as 0 %, which says the depth is free. */
  readonly deepCabinetPercent: number;
  /** `projectDesignForDisplay`'s answer, the only source of the body count: a void or an empty column is not a
   *  placement it carries. */
  readonly groups: readonly DisplayGroup[];
  readonly applied: WholeKitchenChoice;
  readonly pending: WholeKitchenChoice;
  /** `countCabinetsWearingAChosenFinish` on the stored design: the only count the confirmation may state.
   *  Required, because an absent one would read as zero, which means never confirm. */
  readonly chosenColourCount: number;
  /** ADR 0099 decision 7's second arm, from the domain's `wouldDiscardTheGlobalFinish`. A design whose cabinets
   *  all follow one global colour has `chosenColourCount === 0`, yet a material change still discards it.
   *  Optional: only a design carrying `settings.finish` can make it true; absent is `false`. */
  readonly globalFinishWouldBeLost?: boolean;
}

/** The material half of the press. Both ids are optional because `design.settings` is. */
interface PendingMaterialChange {
  readonly appliedMaterialTierId: string | undefined;
  readonly pendingMaterialTierId: string | undefined;
}

/** What this press would discard at both levels, grouped so `toMaterialResetConfirm` takes answers rather than
 *  the input (ADR 0086 decision 2). */
interface PendingColourLoss {
  readonly chosenColourCount: number;
  readonly globalFinishWouldBeLost: boolean;
}

/** The category word in front of a tier name is `priceBreakdown`'s, so a tier is spelled one way. The pill
 *  composes its own wording around it (ADR 0104 decision 1). */
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
    depthGroup: toDepthGroupView(input),
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
 * What the sheet opens editing: what it displays, not what the document says. A stored tier the book has
 * withdrawn resolves to the group's default, so the checked radio and pending agree.
 *
 * An absent choice stays absent: seeding the default would make *Aplică* on an untouched sheet stamp
 * defaults into the document. The depth is not resolved here: committing one rebuilds the scene (ADR 0074).
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
  // The stored global colour follows the material the sheet opens on: a withdrawn material resolves to the
  // default, whose offers are disjoint from the stored one's (ADR 0078 decision 1), so the colour is dropped.
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

/** A radio press as a change of pending state, extracted so *cancel writes nothing* can be swept without a
 *  browser. */
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

/** A swatch press as a change of pending state; nothing is written until *Aplică*. */
export function chooseFinishIn(
  chosen: WholeKitchenChoice,
  finish: Finish,
): WholeKitchenChoice {
  return { ...chosen, finish };
}

/**
 * Drops a pending colour the pending material does not offer, in the sheet and before Apply (ADR 0099
 * decision 4). It deletes the key and never substitutes the new material's default, which would make
 * *Aplică* stamp a colour into a document that chose none. An undeclared material refuses nothing.
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

/** A refused press: which setting refused, and the engine's own sentence about why. */
export interface ApplyRefusal {
  readonly setting: WholeKitchenSetting;
  /** The engine's refusal, resolved through `content.rejection`: no refusal vocabulary here. */
  readonly message: string;
}

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

/** What a refused press says: *nothing was applied*, because the press is one commit and the sheet stays open. */
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
 * The confirmation, or nothing (ADR 0086 decision 3): present only when the pending choice names a declared
 * material other than the one the design is on, and a chosen colour would be lost. An absent applied
 * material resolves through `?? DEFAULT_MATERIAL_ID`, as in the query and the validator.
 *
 * It takes the loss as counts, not the input: `countBodies(input.groups)` is the wrong number here. It asks
 * `lookUpMaterial` and never `materialOffersFinish`: the domain alone decides what a chosen colour is.
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
  // An id the book offers and the domain does not declare resolves nothing when the command runs, so nothing
  // is lost (ADR 0078 decision 3).
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

/** What is about to be lost, worded for which loss it is (ADR 0099 decision 7). The whole-kitchen sentence is
 *  separate so no sentence reads *"culorile alese pentru 0 dulapuri"*; where both are true, the cabinets' wins. */
function describeColourLoss(loss: PendingColourLoss, content: Content): string {
  if (loss.chosenColourCount > 0) {
    return content.globalSettings.materialResetConfirm.body(
      loss.chosenColourCount,
    );
  }
  return content.globalSettings.materialResetConfirm.globalBody;
}

/**
 * The colour group from the pending material's own declaration. `undefined` where that material is
 * undeclared: there is no `ColourControl` to render, and the sheet's other groups still work.
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

/** The depths a customer may choose: the declared map held to the domain's floor `MIN_CABINET_DEPTH_MM`
 *  (ADR 0059), so the control never offers a depth the command would refuse. */
function offeredCabinetDepthsMm(): readonly number[] {
  return declaredCabinetDepthsMm().filter(
    (cabinetDepthMm) => cabinetDepthMm >= MIN_CABINET_DEPTH_MM,
  );
}

function toDepthGroupView(input: DescribeGlobalSettingsInput): DepthGroupView {
  const { content } = input;
  const pendingDepthMm = input.pending.cabinetDepthMm;
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
    // The deep depth, whichever is selected: the note says what choosing it costs.
    note: content.globalSettings.depthNotePriced(
      DEEP_CABINET_DEPTH_MM,
      input.deepCabinetPercent,
    ),
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

/** The book's offer and what the design carries. No pending choice: the pill is read with the sheet shut. */
export interface DescribeSettingsPillInput {
  readonly offer: WholeKitchenTierOffer;
  readonly applied: WholeKitchenChoice;
  readonly content: Content;
}

/**
 * Frame D2A's pill, as a value. Exported on its own because the row above needs its labels to decide which
 * rung it reaches (`app/configurator/configure/top-bar-fit.ts`). The colour is absent only where the applied
 * material is undeclared, and `N` then counts from three.
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
    // A colour with no name is spoken through `spokenColourOf`: a swatch cannot be read aloud.
    accessibleName: input.content.globalSettings.pillNameAllSettings(
      settings.map((setting) =>
        setting.label === ""
          ? spokenColourOf(input.applied, input.content)
          : setting.label,
      ),
    ),
  };
}

/** Frame 2A draws the counter as `+2`. The mark lives here, not in the copy module: a `+` in the catalogue is
 *  arithmetic authored into a label (see `ADDED_AMOUNT_SIGN` in `starting-price.ts`). */
const HIDDEN_SETTINGS_MARK = "+";

/** The widest counter the pill can draw. The fit model spends this width at every rung: a width depending on
 *  the count it decides would not be a function. */
export function widestCounterFor(pill: SettingsPillView): string {
  return countLabelOf(Math.max(pill.settings.length - 1, 1));
}

function countLabelOf(hiddenCount: number): string {
  return `${HIDDEN_SETTINGS_MARK}${String(hiddenCount)}`;
}

/** What the pill draws at the rung the fit model chose. The floor of one label is enforced here as well as decided
 *  there (ADR 0104 decision 3): a rung naming nothing would be a bare counter. */
export function describePillRung(
  pill: SettingsPillView,
  visibleCount: number,
): SettingsPillRung {
  const shown = Math.min(Math.max(visibleCount, 1), pill.settings.length);
  const hiddenCount = pill.settings.length - shown;
  return {
    // A shown setting with no name adds no label and no separator, and is not counted as hidden.
    labels: pill.settings
      .slice(0, shown)
      .map((setting) => setting.label)
      .filter((label) => label !== ""),
    ...(hiddenCount === 0 ? {} : { counter: countLabelOf(hiddenCount) }),
  };
}

/**
 * The kitchen's colour on the pill. A palette colour draws its own name with no category word; a free colour
 * has only a hex, so it draws no text and the swatch wears it. Either way it is a shown setting.
 * The finish is the design's global one, else the applied material's declared default.
 */
function colourEntryOf(
  applied: WholeKitchenChoice,
  content: Content,
): readonly SettingsPillEntry[] {
  const finish = appliedFinishOf(applied);
  if (finish === undefined) return [];
  return [{ key: "colour", label: nameOfFinish(finish, content) }];
}

/** What the pill's one swatch wears. Absent only where the applied material is undeclared. */
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

/** A palette entry's name resolved through the catalogue, so a `/ru` customer reads it in Russian.
 *  A free colour has no name and returns `""`. */
function nameOfFinish(finish: Finish, content: Content): string {
  if (finish.kind === "free-colour") return "";
  return content.finishName(finish.entryId);
}

/** What a screen reader hears for a colour the pill only draws; for a free colour, the value itself. */
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
    // Stated only where an amount exists for it to be about.
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
 * The tier a choice names, or the book's default where it names none. A tier the book has withdrawn lands on
 * the default, which is what such a design is priced at, so the customer can choose their way out.
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

/** What a tier is called on screen (ADR 0106 decision 1). One function serves radios and pill, so a tier is
 *  spelled one way. */
function resolvedTierName(tier: OfferedTier, content: Content): string {
  return content.bookText(tier.name, tier.nameKey);
}

/**
 * What one tier's badge prints. A zero reads *inclus*, never `0` (ADR 0001 decision 4); rounding is upward,
 * so only a tier that adds nothing reaches zero.
 */
function describeDelta(deltaMinor: number, content: Content): string {
  if (deltaMinor === 0) return content.priceBreakdown.included;
  return content.globalSettings.tierDelta(describeAddedAmount(deltaMinor));
}

/** The bodies the customer can see, which is what a whole-kitchen setting applies to. */
function countBodies(groups: readonly DisplayGroup[]): number {
  return groups.reduce((count, group) => count + group.entries.length, 0);
}
