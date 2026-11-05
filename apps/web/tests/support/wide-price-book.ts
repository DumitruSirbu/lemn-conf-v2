import {
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

// The sample book widened to the most rows a draft can delete at once: a book holds at most 20 tiers of each kind, one of
// them the fixed default, and 50 linked accessories. That is 19 + 19 + 50 = 88 rows, more than one usage count may ask.

const LINKED_ROW = "base-3drawer";
const MAX_EXTRA_TIERS = 17;
const MAX_LINKED_ACCESSORIES = 50;

export interface WidestBook {
  readonly book: PriceBook;
  /** Every row of the book that is not a default, in the order a draft deletes them: materials, hardware, accessories. */
  readonly deletable: readonly ItemRef[];
}

export function linkedAccessory(accessoryId: string) {
  return {
    accessoryId,
    ruleId: `accessory.${accessoryId}`,
    linkedBuildId: LINKED_ROW,
    perUnitMinor: 1_000,
    name: `Accesoriu ${accessoryId}`,
  };
}

export function widestBook(): WidestBook {
  const materialIds = idsOf("material.extra", MAX_EXTRA_TIERS);
  const hardwareIds = idsOf("hardware.extra", MAX_EXTRA_TIERS);
  const accessoryIds = idsOf("accessory-extra", MAX_LINKED_ACCESSORIES);
  return {
    book: {
      ...SAMPLE_PRICE_BOOK,
      material: {
        ...SAMPLE_PRICE_BOOK.material,
        tiers: [
          ...SAMPLE_PRICE_BOOK.material.tiers,
          ...materialIds.map(extraMaterialTier),
        ],
      },
      hardware: {
        ...SAMPLE_PRICE_BOOK.hardware,
        tiers: [
          ...SAMPLE_PRICE_BOOK.hardware.tiers,
          ...hardwareIds.map(extraHardwareTier),
        ],
      },
      linkedAccessories: accessoryIds.map(linkedAccessory),
    },
    deletable: [
      ...materialIds.map((tierId) => ({ kind: "material", tierId }) as const),
      ...otherTiers("material"),
      ...hardwareIds.map((tierId) => ({ kind: "hardware", tierId }) as const),
      ...otherTiers("hardware"),
      ...accessoryIds.map(
        (accessoryId) => ({ kind: "accessory", accessoryId }) as const,
      ),
    ],
  };
}

function idsOf(prefix: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${String(index)}`,
  );
}

/** The tiers the sample book already holds that its fixed default is not. */
function otherTiers(kind: "material" | "hardware"): ItemRef[] {
  const { defaultTierId, tiers } = SAMPLE_PRICE_BOOK[kind];
  return tiers
    .filter(({ tierId }) => tierId !== defaultTierId)
    .map(({ tierId }) => ({ kind, tierId }));
}

function extraMaterialTier(tierId: string) {
  const [, painted] = SAMPLE_PRICE_BOOK.material.tiers;
  if (painted === undefined) throw new Error("the sample book has no tier");
  return {
    ...withoutTextKeys(painted),
    tierId,
    ruleId: tierId,
    name: `Material ${tierId}`,
  };
}

function extraHardwareTier(tierId: string) {
  const [standard] = SAMPLE_PRICE_BOOK.hardware.tiers;
  if (standard === undefined) throw new Error("the sample book has no tier");
  return {
    ...withoutTextKeys(standard),
    tierId,
    ruleId: tierId,
    name: `Feronerie ${tierId}`,
  };
}

/** A tier that carries no translation keys, so that its own name and description are what a reader sees. */
function withoutTextKeys<Tier extends object>(tier: Tier): Tier {
  const copy: Record<string, unknown> = {
    ...(tier as Record<string, unknown>),
  };
  delete copy.nameKey;
  delete copy.descriptionKey;
  return copy as Tier;
}

/** The row at `index`, or a thrown error where the list is shorter, so that a test never reads a row that is not there. */
export function itemAt(items: readonly ItemRef[], index: number): ItemRef {
  const item = items[index];
  if (item === undefined) throw new Error(`no row at ${String(index)}`);
  return item;
}
