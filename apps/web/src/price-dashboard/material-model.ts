import {
  applyChanges,
  MATERIALS,
  paletteEntriesOf,
  type BookFieldAddress,
  type ItemRef,
  type ItemUsageCounts,
  type MaterialTier,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type { BookText } from "./book-text";
import type {
  DashboardDraftWire,
  DashboardStateWire,
} from "./price-dashboard-wire-contract";

// What the materials screens are drawn from (frames D5A to D5F): the materials of the active book, each with its
// surcharge over PAL as it stands and as the draft would leave it. Worked out again from the state after every write,
// so the screens show what the server stored and never what was typed. Whether a material is on, or a default, is the
// lifecycle's to say (`item-lifecycle-model.ts`): this module reads no availability.

/** What a material lets the customer choose as a colour, as the code declares it. */
export type MaterialColours =
  /** A fixed list: a PAL decor or a veneer wood. */
  | { readonly kind: "count"; readonly count: number }
  /** MDF is painted, so any colour can be picked and no list exists to count. */
  | { readonly kind: "picker" }
  /** The book names a material the code declares no colours for. */
  | { readonly kind: "undeclared" };

export interface MaterialFacts {
  readonly tierId: string;
  readonly name: BookText;
  readonly description: BookText;
  /** The surcharge over PAL, in whole percent, in the active version. */
  readonly activePercent: number;
  /** The surcharge once the draft is applied. */
  readonly pendingPercent: number;
  /** PAL: the book's reference, which is always 0 % and is not edited. */
  readonly isReference: boolean;
  /** The draft deletes it; the active version still holds it. */
  readonly isDeletionPending: boolean;
  /** The draft holds a change to the material. */
  readonly isModified: boolean;
  readonly colours: MaterialColours;
}

export type MaterialDerivation =
  | {
      readonly kind: "ready";
      readonly materials: readonly MaterialFacts[];
      readonly active: PriceBook;
      /** The active book with the draft applied. */
      readonly candidate: PriceBook;
      readonly draft: DashboardDraftWire;
    }
  /** A draft that does not apply: a defect, so the screen is not drawn rather than drawn wrong. */
  | { readonly kind: "unreadable" };

export type ReadyMaterials = Extract<
  MaterialDerivation,
  { readonly kind: "ready" }
>;

export function deriveMaterials(state: DashboardStateWire): MaterialDerivation {
  const { book: active } = state.active;
  const { draft } = state;
  const applied = applyChanges(active, draft.changes);
  if (!applied.ok) return { kind: "unreadable" };
  const candidate = applied.book;
  return {
    kind: "ready",
    materials: active.material.tiers.map((tier) =>
      factsOf({ tier, active, candidate, draft }),
    ),
    active,
    candidate,
    draft,
  };
}

/**
 * The material of one id, or `undefined` where the active book does not hold it: a material is never created in the
 * draft.
 */
export function materialOf(
  derivation: ReadyMaterials,
  tierId: string,
): MaterialFacts | undefined {
  return derivation.materials.find((held) => held.tierId === tierId);
}

export function materialItemOf({
  tierId,
}: Pick<MaterialFacts, "tierId">): Extract<ItemRef, { kind: "material" }> {
  return { kind: "material", tierId };
}

/** Renders a row's words: the catalogue leaf `key` names, else `authored`. */
type BookTextOf = (authored: string, key: string | undefined) => string;

/** An item's name as a screen shows it. Only materials are named here; any other item, or a material the book does not
 *  hold, has no name on these screens. */
export function materialNameOf(
  derivation: ReadyMaterials,
  bookText: BookTextOf,
  item: ItemRef,
): string {
  const held =
    item.kind === "material" ? materialOf(derivation, item.tierId) : undefined;
  return held === undefined ? "" : bookText(held.name.authored, held.name.key);
}

/** The address of a material's surcharge. */
export function surchargeAddressOf(
  tierId: string,
): Extract<BookFieldAddress, { kind: "material" }> {
  return { kind: "material", tierId, field: "percentOfCabinets" };
}

interface FactsInput {
  readonly tier: MaterialTier;
  readonly active: PriceBook;
  readonly candidate: PriceBook;
  readonly draft: DashboardDraftWire;
}

function factsOf({
  tier,
  active,
  candidate,
  draft,
}: FactsInput): MaterialFacts {
  const { tierId } = tier;
  const candidateTier = candidate.material.tiers.find(
    (held) => held.tierId === tierId,
  );
  return {
    tierId,
    name: { authored: tier.name, key: tier.nameKey },
    description: { authored: tier.description, key: tier.descriptionKey },
    activePercent: tier.percentOfCabinets,
    pendingPercent: (candidateTier ?? tier).percentOfCabinets,
    isReference: tierId === active.material.defaultTierId,
    isDeletionPending: candidateTier === undefined,
    isModified: draft.changes.some((change) =>
      isOnMaterial(change.address, tierId),
    ),
    colours: coloursOf(tierId),
  };
}

function coloursOf(tierId: string): MaterialColours {
  const declared = MATERIALS.find(({ materialId }) => materialId === tierId);
  if (declared === undefined) return { kind: "undeclared" };
  if (declared.colourControl.shape === "ral-picker") return { kind: "picker" };
  return { kind: "count", count: paletteEntriesOf(declared).length };
}

/** Whether a draft change is the material's surcharge or its deletion. */
function isOnMaterial(address: BookFieldAddress, tierId: string): boolean {
  switch (address.kind) {
    case "material":
      return address.tierId === tierId;
    case "item-deleted":
      return address.item.kind === "material" && address.item.tierId === tierId;
    default:
      return false;
  }
}

/**
 * Everything a materials screen is given: the dashboard's state, and what judging a switch-off or a deletion also
 * needs.
 */
export interface MaterialPageInput {
  readonly state: DashboardStateWire;
  /**
   * The new-kitchen defaults as the lifecycle's judgement reads them (`{}` where none were saved); absent when they
   * could not be read, so no switch-off or deletion is then judged. */
  readonly defaults: NewKitchenSettings | undefined;
  /** What a build with no usage reader counts: given to a non-production page only, and never by a production one. */
  readonly sampleUsage?: ItemUsageCounts | undefined;
}
