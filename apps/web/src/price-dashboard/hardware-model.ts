import {
  applyChanges,
  hardwareRatesOf,
  type BookFieldAddress,
  type HardwareRateField,
  type HardwareTier,
  type ItemUsageCounts,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type { BookText } from "./book-text";
import type {
  DashboardDraftWire,
  DashboardStateWire,
} from "./price-dashboard-wire-contract";

// What the hardware screens are drawn from (frames D4A to D4F): the classes of the active book and the draft's creations
// beside them, each with its rates as they stand and as the draft would leave them. Worked out again from the state after
// every write, so the screens show what the server stored and never what was typed. Whether a class is on, or a default,
// is the lifecycle's to say (`item-lifecycle-model.ts`): this module reads no availability.

export interface HardwareRateFacts {
  readonly field: HardwareRateField;
  /** The active version's rate; absent for a class only the draft knows. */
  readonly activeMinor: number | undefined;
  /** The rate once the draft is applied. */
  readonly pendingMinor: number;
}

export interface HardwareClassFacts {
  readonly tierId: string;
  readonly name: BookText;
  readonly description: BookText;
  /** In the order the rates are charged, one for each rate the book states. */
  readonly rates: readonly HardwareRateFacts[];
  /** Created in the draft: the active version has no such class, so it cannot yet be switched on. */
  readonly isCreated: boolean;
  /** The draft deletes it; the active version still holds it. */
  readonly isDeletionPending: boolean;
  /** The draft holds a change to the class. */
  readonly isModified: boolean;
  /** A class whose words are the catalogue's, read-only here; any other carries authored Romanian text. */
  readonly isKeyed: boolean;
}

export type HardwareDerivation =
  | {
      readonly kind: "ready";
      readonly classes: readonly HardwareClassFacts[];
      /** The rates the book states, which are the columns. */
      readonly rates: readonly HardwareRateField[];
      readonly active: PriceBook;
      /** The active book with the draft applied. */
      readonly candidate: PriceBook;
      readonly draft: DashboardDraftWire;
    }
  /** A draft that does not apply: a defect, so the screen is not drawn rather than drawn wrong. */
  | { readonly kind: "unreadable" };

export type ReadyHardware = Extract<
  HardwareDerivation,
  { readonly kind: "ready" }
>;

export function deriveHardware(state: DashboardStateWire): HardwareDerivation {
  const { book: active } = state.active;
  const { draft } = state;
  const applied = applyChanges(active, draft.changes);
  if (!applied.ok) return { kind: "unreadable" };
  const candidate = applied.book;
  const rates = hardwareRatesOf(active);
  const held = active.hardware.tiers.map((tier) =>
    factsOf({ tier, active, candidate, draft, rates }),
  );
  const created = candidate.hardware.tiers
    .filter((tier) => !isStated(active, tier.tierId))
    .map((tier) => factsOf({ tier, active, candidate, draft, rates }));
  return {
    kind: "ready",
    classes: [...held, ...created],
    rates,
    active,
    candidate,
    draft,
  };
}

/** The class of one id, or `undefined` where neither the active book nor the draft's creations hold it. */
export function hardwareClassOf(
  derivation: ReadyHardware,
  tierId: string,
): HardwareClassFacts | undefined {
  return derivation.classes.find((held) => held.tierId === tierId);
}

interface FactsInput {
  readonly tier: HardwareTier;
  readonly active: PriceBook;
  readonly candidate: PriceBook;
  readonly draft: DashboardDraftWire;
  readonly rates: readonly HardwareRateField[];
}

function factsOf({
  tier,
  active,
  candidate,
  draft,
  rates,
}: FactsInput): HardwareClassFacts {
  const { tierId } = tier;
  const activeTier = tierIn(active, tierId);
  const candidateTier = tierIn(candidate, tierId);
  return {
    tierId,
    name: { authored: tier.name, key: tier.nameKey },
    description: { authored: tier.description, key: tier.descriptionKey },
    rates: rates.map((field) => ({
      field,
      activeMinor: activeTier?.[field],
      pendingMinor: (candidateTier ?? tier)[field],
    })),
    isCreated: activeTier === undefined,
    isDeletionPending: activeTier !== undefined && candidateTier === undefined,
    isModified: draft.changes.some((change) =>
      isOnTier(change.address, tierId),
    ),
    isKeyed: tier.nameKey !== undefined || tier.descriptionKey !== undefined,
  };
}

function tierIn(book: PriceBook, tierId: string): HardwareTier | undefined {
  return book.hardware.tiers.find((tier) => tier.tierId === tierId);
}

function isStated(book: PriceBook, tierId: string): boolean {
  return tierIn(book, tierId) !== undefined;
}

/** Whether a draft change is a rate, a creation, a text or a deletion of the class. */
function isOnTier(address: BookFieldAddress, tierId: string): boolean {
  switch (address.kind) {
    case "hardware":
    case "hardware-tier-created":
      return address.tierId === tierId;
    case "created-row-text":
    case "item-deleted":
      return address.item.kind === "hardware" && address.item.tierId === tierId;
    default:
      return false;
  }
}

/** Everything a hardware screen is given: the dashboard's state, and what judging a switch-off or a deletion also needs. */
export interface HardwarePageInput {
  readonly state: DashboardStateWire;
  /** The new-kitchen defaults as the lifecycle's judgement reads them (`{}` where none were saved); absent when they could
   *  not be read, so no switch-off or deletion is then judged. */
  readonly defaults: NewKitchenSettings | undefined;
  /** What a build with no usage reader counts: given to a non-production page only, and never by a production one. */
  readonly sampleUsage?: ItemUsageCounts | undefined;
}
