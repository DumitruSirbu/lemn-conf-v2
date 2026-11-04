import {
  ACCESSORY_IDS,
  applyChanges,
  linkTargetBuildIdsOf,
  type AccessoryId,
  type BookFieldAddress,
  type ItemRef,
  type ItemUsageCounts,
  type LinkedAccessoryRule,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type { BookText } from "./book-text";
import type {
  DashboardDraftWire,
  DashboardStateWire,
} from "./price-dashboard-wire-contract";

// What the accessory screens are drawn from (frames D6A to D6C): the two accessories the catalogue declares and the linked
// ones the dashboard creates, each with its price per unit as it stands and as the draft would leave it, and the rule
// that earns it. Worked out again from the state after every write, so the screens show what the server stored and never
// what was typed. Whether an accessory is on is the lifecycle's to say (`item-lifecycle-model.ts`): this module reads no
// availability.

/** When an accessory is added to a kitchen: the two catalogue rules are code, a linked one follows a cabinet type. */
export type AccessoryEarning =
  | { readonly kind: "built-in"; readonly accessoryId: AccessoryId }
  | { readonly kind: "linked"; readonly linkedBuildId: string };

export interface AccessoryFacts {
  readonly accessoryId: string;
  readonly name: BookText;
  readonly description: BookText;
  /** The active version's name; absent for an accessory only the draft knows. */
  readonly activeName: string | undefined;
  /** The price per unit in the active version; absent for an accessory only the draft knows. */
  readonly activePerUnitMinor: number | undefined;
  /** The price per unit once the draft is applied. */
  readonly pendingPerUnitMinor: number;
  readonly earning: AccessoryEarning;
  /** Created in the draft: the active version has no such accessory, so it cannot yet be switched on. */
  readonly isCreated: boolean;
  /** The draft deletes it; the active version still holds it. */
  readonly isDeletionPending: boolean;
  /** The draft holds a change to the accessory. */
  readonly isModified: boolean;
  /** An accessory the catalogue declares: its words and its rule are read-only, only its price and state change. */
  readonly isBuiltIn: boolean;
}

export type AccessoryDerivation =
  | {
      readonly kind: "ready";
      readonly accessories: readonly AccessoryFacts[];
      /** The catalogue rows a linked accessory may follow: those the manufacturer supplies, in the book's order. */
      readonly linkTargetBuildIds: readonly string[];
      readonly active: PriceBook;
      /** The active book with the draft applied. */
      readonly candidate: PriceBook;
      readonly draft: DashboardDraftWire;
    }
  /** A draft that does not apply: a defect, so the screen is not drawn rather than drawn wrong. */
  | { readonly kind: "unreadable" };

export type ReadyAccessories = Extract<
  AccessoryDerivation,
  { readonly kind: "ready" }
>;

export function deriveAccessories(
  state: DashboardStateWire,
): AccessoryDerivation {
  const { book: active } = state.active;
  const { draft } = state;
  const applied = applyChanges(active, draft.changes);
  if (!applied.ok) return { kind: "unreadable" };
  const { book: candidate } = applied;
  const statedIds = new Set(
    active.linkedAccessories.map(({ accessoryId }) => accessoryId),
  );
  const created = candidate.linkedAccessories.filter(
    ({ accessoryId }) => !statedIds.has(accessoryId),
  );
  const held = [
    ...ACCESSORY_IDS.map((accessoryId) =>
      builtInFacts({ accessoryId, active, candidate, draft }),
    ),
    ...active.linkedAccessories.map((rule) =>
      linkedFacts({ rule, active, candidate, draft }),
    ),
  ];
  return {
    kind: "ready",
    accessories: [
      ...held,
      ...created.map((rule) => linkedFacts({ rule, active, candidate, draft })),
    ],
    linkTargetBuildIds: linkTargetBuildIdsOf(candidate),
    active,
    candidate,
    draft,
  };
}

/** The accessory of one id, or `undefined` where neither the active book nor the draft's creations hold it. */
export function accessoryOf(
  derivation: ReadyAccessories,
  accessoryId: string,
): AccessoryFacts | undefined {
  return derivation.accessories.find(
    (held) => held.accessoryId === accessoryId,
  );
}

export function accessoryItemOf({
  accessoryId,
}: Pick<AccessoryFacts, "accessoryId">): Extract<
  ItemRef,
  { readonly kind: "accessory" }
> {
  return { kind: "accessory", accessoryId };
}

/** The address of an accessory's price per unit. */
export function accessoryPriceAddressOf(
  accessoryId: string,
): Extract<BookFieldAddress, { readonly kind: "accessory" }> {
  return { kind: "accessory", accessoryId, field: "perUnitMinor" };
}

/** Whether only the draft knows the accessory: the one a deletion takes back out of the draft rather than adding to it. */
export function isAccessoryCreatedInDraft(
  derivation: AccessoryDerivation,
  item: ItemRef,
): boolean {
  return (
    derivation.kind === "ready" &&
    item.kind === "accessory" &&
    accessoryOf(derivation, item.accessoryId)?.isCreated === true
  );
}

function builtInFacts({
  accessoryId,
  active,
  candidate,
  draft,
}: {
  readonly accessoryId: AccessoryId;
  readonly active: PriceBook;
  readonly candidate: PriceBook;
  readonly draft: DashboardDraftWire;
}): AccessoryFacts {
  const rule = active.accessories[accessoryId];
  return {
    accessoryId,
    name: { authored: rule.name, key: rule.nameKey },
    description: { authored: rule.description, key: rule.descriptionKey },
    activeName: rule.name,
    activePerUnitMinor: rule.perUnitMinor,
    pendingPerUnitMinor: candidate.accessories[accessoryId].perUnitMinor,
    earning: { kind: "built-in", accessoryId },
    isCreated: false,
    isDeletionPending: false,
    isModified: isModifiedBy(draft, accessoryId),
    isBuiltIn: true,
  };
}

function linkedFacts({
  rule,
  active,
  candidate,
  draft,
}: {
  readonly rule: LinkedAccessoryRule;
  readonly active: PriceBook;
  readonly candidate: PriceBook;
  readonly draft: DashboardDraftWire;
}): AccessoryFacts {
  const { accessoryId } = rule;
  const activeRule = linkedIn(active, accessoryId);
  const candidateRule = linkedIn(candidate, accessoryId);
  const pending = candidateRule ?? rule;
  return {
    accessoryId,
    name: { authored: pending.name, key: undefined },
    description: { authored: pending.description ?? "", key: undefined },
    activeName: activeRule?.name,
    activePerUnitMinor: activeRule?.perUnitMinor,
    pendingPerUnitMinor: pending.perUnitMinor,
    earning: { kind: "linked", linkedBuildId: rule.linkedBuildId },
    isCreated: activeRule === undefined,
    isDeletionPending: activeRule !== undefined && candidateRule === undefined,
    isModified: isModifiedBy(draft, accessoryId),
    isBuiltIn: false,
  };
}

function linkedIn(
  book: PriceBook,
  accessoryId: string,
): LinkedAccessoryRule | undefined {
  return book.linkedAccessories.find(
    (rule) => rule.accessoryId === accessoryId,
  );
}

function isModifiedBy(draft: DashboardDraftWire, accessoryId: string): boolean {
  return draft.changes.some((change) =>
    isOnAccessory(change.address, accessoryId),
  );
}

/** Whether a draft change is the accessory's price, its creation, its words or its deletion. */
function isOnAccessory(
  address: BookFieldAddress,
  accessoryId: string,
): boolean {
  switch (address.kind) {
    case "accessory":
    case "accessory-created":
      return address.accessoryId === accessoryId;
    case "created-row-text":
    case "item-deleted":
      return (
        address.item.kind === "accessory" &&
        address.item.accessoryId === accessoryId
      );
    default:
      return false;
  }
}

/**
 * Everything an accessory screen is given: the dashboard's state, the name of each cabinet type, and what judging a
 * switch-off or a deletion also needs.
 */
export interface AccessoryPageInput {
  readonly state: DashboardStateWire;
  /** The name of every priced cabinet type, by build id: the words the link and the earning rule say. */
  readonly cabinetNames: Readonly<Record<string, string>>;
  /** The new-kitchen defaults as the lifecycle's judgement reads them (`{}` where none were saved); absent when they
   *  could not be read, so no switch-off or deletion is then judged. */
  readonly defaults: NewKitchenSettings | undefined;
  /** What a build with no usage reader counts: given to a non-production page only, and never by a production one. */
  readonly sampleUsage?: ItemUsageCounts | undefined;
}
