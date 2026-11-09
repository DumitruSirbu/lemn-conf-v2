// Kitchens that wear colours and handles at every level they are stored, and the helpers the replacement suites share.
import fc from "fast-check";

import type {
  CommandEffect,
  CommandResult,
} from "../../src/commands/command-result.js";
import type { Design, Handle } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import {
  FinishSchema,
  freeColourFinish,
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  PALETTE_ENTRY_IDS,
  type Finish,
  type PaletteEntryId,
} from "../../src/materials.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import {
  BOOK,
  CUSTOMISABLE_PLACEMENT_ID,
  withBodyOf,
  withSettings,
} from "./availability-kitchens.js";

export const OCCURRED_AT = "2026-11-09T09:00:00.000Z";
export const UNDECLARED_MATERIAL_ID = "material.created";

export const ANTRACIT = paletteFinish("pal.antracit");
export const ALB = paletteFinish("pal.alb");
export const HAVANNA = paletteFinish("pal.gri-havanna");
export const HANDLES: readonly Handle[] = ["steel", "black", "push"];

/** The result of a command that must have succeeded, narrowed so the test reads `design` and `effect` directly. */
export function succeeded<T extends CommandEffect>(result: CommandResult<T>) {
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result;
}

/** A value that may be absent, which is how a cabinet or the settings may hold a colour or a handle. */
export function maybe<T>(
  arbitrary: fc.Arbitrary<T>,
): fc.Arbitrary<T | undefined> {
  return fc.option(arbitrary, { nil: undefined });
}

/** The palette finish a stored entry id names, parsed so an id no palette holds fails here and not later. */
export function paletteFinishOf(entryId: string): Finish {
  return FinishSchema.parse({ kind: "palette-entry", entryId });
}

/** The seeded kitchen wearing one palette colour as the kitchen's and, when given, one on a customisable cabinet. */
export function wearing(
  kitchenColour: PaletteEntryId | undefined,
  cabinetColour: PaletteEntryId | undefined,
  materialTierId: string,
): Design {
  return withBodyOf(
    CUSTOMISABLE_PLACEMENT_ID,
    cabinetColour === undefined ? {} : { finish: paletteFinish(cabinetColour) },
    withSettings({
      cabinetDepthMm: 600,
      materialTierId,
      ...(kitchenColour === undefined
        ? {}
        : { finish: paletteFinish(kitchenColour) }),
    }),
  );
}

/** The sample book holding one more material tier, priced as veneer is, that no code declares a palette for. */
export function bookHoldingMaterial(tierId: string): PriceBook {
  const veneer = BOOK.material.tiers.find(
    (tier) => tier.tierId === "material.veneer",
  );
  if (veneer === undefined) throw new Error("the sample book has no veneer");
  return {
    ...BOOK,
    material: {
      ...BOOK.material,
      tiers: [...BOOK.material.tiers, { ...veneer, tierId, ruleId: tierId }],
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Designs dealt from a generated spec: colours and handles at every level, any of them absent

const PLACEMENT_COUNT = KITCHEN_L_DESIGN.placements.length;

/** The material a design is dealt under, and the colours that material offers (every colour for an undeclared one). */
export interface MaterialChoice {
  readonly materialTierId: string;
  readonly colours: readonly Finish[];
}

/** A material no code declares offers every schema-valid colour, free ones included. */
export const UNDECLARED_CHOICE: MaterialChoice = {
  materialTierId: UNDECLARED_MATERIAL_ID,
  colours: [
    ...PALETTE_ENTRY_IDS.map(paletteFinish),
    freeColourFinish("#336699"),
    freeColourFinish("#eceeeb"),
  ],
};

/** Each declared material that offers palette entries, with exactly those entries. */
export const DECLARED_PALETTE_CHOICES: readonly MaterialChoice[] =
  MATERIALS.filter((material) => paletteEntriesOf(material).length > 0).map(
    (material) => ({
      materialTierId: material.materialId,
      colours: paletteEntriesOf(material).map(({ entryId }) =>
        paletteFinish(entryId),
      ),
    }),
  );

export interface Deal {
  readonly materialTierId: string;
  readonly colours: readonly Finish[];
  readonly kitchenColour: Finish | undefined;
  readonly kitchenHandle: Handle | undefined;
  readonly topRowHandle: Handle | undefined;
  readonly ownColours: readonly (Finish | undefined)[];
  readonly ownHandles: readonly (Handle | undefined)[];
}

export function aDeal(choices: readonly MaterialChoice[]): fc.Arbitrary<Deal> {
  return fc.constantFrom(...choices).chain(({ materialTierId, colours }) => {
    const aColour = fc.constantFrom(...colours);
    const aHandle = fc.constantFrom(...HANDLES);
    const perPlacement = {
      minLength: PLACEMENT_COUNT,
      maxLength: PLACEMENT_COUNT,
    };
    return fc.record({
      materialTierId: fc.constant(materialTierId),
      colours: fc.constant(colours),
      kitchenColour: maybe(aColour),
      kitchenHandle: maybe(aHandle),
      topRowHandle: maybe(aHandle),
      ownColours: fc.array(maybe(aColour), perPlacement),
      ownHandles: fc.array(maybe(aHandle), perPlacement),
    });
  });
}

/** The seeded kitchen with the deal's values stored where the deal says; an absent value is an absent key. Every
 *  colour is a copy, so no two levels share an object. */
export function dealtDesign(deal: Deal): Design {
  const placements = KITCHEN_L_DESIGN.placements.map((placement, index) => {
    const finish = deal.ownColours[index];
    const handle = deal.ownHandles[index];
    return {
      ...placement,
      body: {
        ...placement.body,
        ...(finish ? { finish: { ...finish } } : {}),
        ...(handle ? { handle } : {}),
      },
    };
  });
  return {
    ...KITCHEN_L_DESIGN,
    placements,
    settings: {
      cabinetDepthMm: 600,
      materialTierId: deal.materialTierId,
      ...(deal.kitchenColour ? { finish: { ...deal.kitchenColour } } : {}),
      ...(deal.kitchenHandle ? { handle: deal.kitchenHandle } : {}),
      ...(deal.topRowHandle ? { topRowHandle: deal.topRowHandle } : {}),
    },
  };
}
