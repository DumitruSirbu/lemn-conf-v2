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
import type {
  DisplayGroup,
  PricingResult,
  RejectionReason,
} from "@lemnaria/configurator-domain";

import { ro } from "@/content/ro";
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
   *  would cost. */
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
}

/** What the design carries, and what the sheet is editing. Both keys of both are optional because
 *  `design.settings` is: an absent choice is priced at the book's own default tier, which is book
 *  data rather than a rule living here. */
export interface WholeKitchenChoice {
  readonly materialTierId?: string | undefined;
  readonly hardwareTierId?: string | undefined;
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
    warning: ro.globalSettings.materialWarning,
    ...(figure === undefined ? {} : { figure }),
    ...(overflowWarning === undefined ? {} : { overflowWarning }),
    applyLabel: ro.globalSettings.apply,
    cancelLabel: ro.globalSettings.cancel,
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
