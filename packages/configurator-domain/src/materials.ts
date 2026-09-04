// **The three materials a kitchen is built from, the palette each one offers, and the two kinds of
// thing a finish is.** ADR 0071, owner 2026-09-04.
//
// **Only material carries price** (ADR 0071 decision 1). Nothing in this module is a price input,
// and nothing under `pricing/` may import it — `pricing-seams.test.ts` asserts the import graph, and
// `finish-never-prices.test.ts` asserts the behaviour the graph is protecting.
//
// **A material id *is* the price book's material tier id**, deliberately. The domain imports no book
// (ADR 0062 seam 1), so nothing here can ask whether a tier exists; what it can do is refuse to keep
// a second list. `DesignSettings.materialTierId` already stores exactly these strings, so a
// declared material and a priced tier are one identifier and not two that agree — ADR 0028's
// failure one seam over, which is what `material-tiers.test.ts` composes a book to falsify in both
// directions.
//
// **Colour is a reference, not a specification.** The owner's words: the real colour is chosen after
// measurements, so a palette entry renders its human name and nothing else. The supplier code below
// is internal provenance — what a decor is ordered as — and no surface presents it as a code a
// customer picks from.
import { z } from "zod";

/** The three materials, **price-ordered**: PAL (melamine) < MDF (painted) < veneer (natural wood
 *  over MDF). The order is the declaration — a reader asking which is dearer reads this list, and
 *  `material-tiers.test.ts` holds the shipped book's amounts to it. */
export const MATERIAL_IDS = [
  "material.melamine",
  "material.painted-mdf",
  "material.veneer",
] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

/** The material an unset design wears, and the material a legacy document is deemed to carry.
 *  PAL, ruled 2026-09-04 for both the priced baseline and the delta basis — the same id
 *  `sample-price-book.ts` declares as its own `material.defaultTierId`. */
export const DEFAULT_MATERIAL_ID: MaterialId = "material.melamine";

/** Every palette entry this product declares, across all three materials.
 *
 *  **Ids are namespaced by material** because a decor and a veneer are different things that may
 *  share a wood's name — PAL's *Nuc Warmia Maro* is a printed decor, veneer's *Nuc* is walnut. */
export const PALETTE_ENTRY_IDS = [
  "pal.alb",
  "pal.stejar-bardolino",
  "pal.stejar-halifax",
  "pal.antracit",
  "pal.gri-havanna",
  "pal.nuc-warmia",
  "veneer.stejar",
  "veneer.nuc",
] as const;
export type PaletteEntryId = (typeof PALETTE_ENTRY_IDS)[number];

const PaletteEntryIdSchema = z.enum(PALETTE_ENTRY_IDS);

/** **How settled a decor's supplier code is.** Required per entry, so a seventh decor cannot be
 *  added without stating which it is (ADR 0071 decision 4), and the two states are never presented
 *  as equally settled. */
export const DECOR_CODE_CONFIDENCES = ["confirmed", "unverified"] as const;
export type DecorCodeConfidence = (typeof DECOR_CODE_CONFIDENCES)[number];

/** What a palette entry is ordered as, when it is ordered as anything.
 *
 *  A discriminated declaration rather than an optional string: a natural wood has no manufacturer's
 *  decor code, and `undefined` would read the same as *"nobody has filled this in yet"* — which is
 *  the one distinction ADR 0071 decision 4 exists to keep. */
export type SupplierDecorCode =
  | {
      readonly kind: "catalogue";
      readonly code: string;
      readonly confidence: DecorCodeConfidence;
    }
  | { readonly kind: "none" };

/** A wood is not a manufacturer's decor, so it has no code — stated rather than left absent. */
export const NOT_A_MANUFACTURED_DECOR: SupplierDecorCode = { kind: "none" };

/** Read from a supplier catalogue on 2026-09-04. */
export function confirmedDecorCode(code: string): SupplierDecorCode {
  return { kind: "catalogue", code, confidence: "confirmed" };
}

/** Named in ADR 0071 decision 4 but **not** confirmed against a supplier stock list. */
export function unverifiedDecorCode(code: string): SupplierDecorCode {
  return { kind: "catalogue", code, confidence: "unverified" };
}

/** One entry a customer can pick by name. */
export interface PaletteEntry {
  readonly entryId: PaletteEntryId;
  /** **The only thing a surface renders.** Human and non-technical, in the product's Romanian: the
   *  palette helps a customer picture the kitchen, and the real colour is settled after
   *  measurements. */
  readonly name: string;
  /** Internal provenance, never rendered as a code a customer chooses from. */
  readonly supplierCode: SupplierDecorCode;
}

/** **The shape of the control, declared** (ADR 0071 decision 3) — three different controls reading
 *  one setting, not one control with three option sets. Declared rather than inferred from how many
 *  entries a material offers: two swatches and a list of two are the same array and different
 *  products. */
export type ColourControl =
  | { readonly shape: "decor-list"; readonly entries: readonly PaletteEntry[] }
  | { readonly shape: "ral-picker" }
  | {
      readonly shape: "wood-swatches";
      readonly entries: readonly PaletteEntry[];
    };

/**
 * **A finish is two kinds of thing, and the kind is declared.**
 *
 * Either a palette entry named by its id — a PAL decor, a veneer wood — or a free colour value, the
 * pick MDF's RAL control produces. There is no third kind.
 *
 * **The discriminant is `kind` and nothing else.** A value that looks like a hex code is not thereby
 * a free colour, and a palette id is not recognised by failing to parse as one: the shipped enum's
 * five strings were exactly the shape that made "read the string and guess" look workable, and it is
 * how a decor named after a colour would eventually be painted instead of ordered.
 *
 * **A free colour is bounded and validated here**, at the one gate both the API write seam and
 * `migrateDesign` pass through. It is the first free-form value a customer authors that a document
 * has ever carried — every other identifier in `DesignSchema` is a value the product chose — so a
 * malformed one is **refused**, never defaulted and never nudged into a nearby colour. The pattern
 * caps the length as a side effect of being exact.
 *
 * **A palette id is closed against the declaration above.** An id no material offers is not a
 * document written under a superseded rule (ADR 0052's case, which is normalised); it is a value
 * this product has never written. If an entry is ever retired, that wave brings its own migration,
 * exactly as wave 6P brings one for the five values it retires.
 */
export const FREE_COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const FreeColourSchema = z
  .string()
  .regex(FREE_COLOUR_PATTERN, "must be a six-digit hex colour, like #b8c4a1");

export const FinishSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("palette-entry"),
    entryId: PaletteEntryIdSchema,
  }),
  z.strictObject({ kind: z.literal("free-colour"), value: FreeColourSchema }),
]);
export type Finish = z.infer<typeof FinishSchema>;

/** Thrown rather than returned, and named after the operation: a colour that does not parse is a
 *  programming error at every seam inside this package, and a refusal at the schema everywhere
 *  else. */
export class MalformedColourValueError extends Error {
  constructor(value: string) {
    super(`"${value}" is not a six-digit hex colour and is not a finish`);
    this.name = "MalformedColourValueError";
  }
}

export function paletteFinish(entryId: PaletteEntryId): Finish {
  return { kind: "palette-entry", entryId };
}

export function freeColourFinish(value: string): Finish {
  if (!FREE_COLOUR_PATTERN.test(value)) {
    throw new MalformedColourValueError(value);
  }
  return { kind: "free-colour", value };
}

/** Two finishes are the same finish when they are the same kind naming the same thing. Value
 *  equality, because a finish is data a document carries and never an object a caller holds on to. */
export function sameFinish(one: Finish, other: Finish): boolean {
  if (one.kind === "palette-entry" && other.kind === "palette-entry") {
    return one.entryId === other.entryId;
  }
  if (one.kind === "free-colour" && other.kind === "free-colour") {
    return one.value === other.value;
  }
  return false;
}

/** A material and everything that follows from choosing it, except its price. */
export interface Material {
  readonly materialId: MaterialId;
  readonly colourControl: ColourControl;
  /** **ADR 0057's reset target**, ruled 2026-09-04 in ADR 0071's amendment: Alb for PAL, white for
   *  MDF, Stejar for veneer. The value a cabinet's finish resolves to when this material does not
   *  offer what it is wearing. */
  readonly defaultFinish: Finish;
}

/** PAL's six factory decors, ADR 0071 decision 4. PAL arrives pre-manufactured — there is no
 *  colouring step — so only what the manufacturer makes can be offered. */
const PAL_DECORS: readonly PaletteEntry[] = [
  {
    entryId: "pal.alb",
    name: "Alb",
    supplierCode: unverifiedDecorCode("W1000 ST9 Alb Premium"),
  },
  {
    entryId: "pal.stejar-bardolino",
    name: "Stejar Bardolino Natur",
    supplierCode: confirmedDecorCode("H1145 ST10"),
  },
  {
    entryId: "pal.stejar-halifax",
    name: "Stejar Halifax Natur",
    supplierCode: confirmedDecorCode("H1180 ST37"),
  },
  {
    entryId: "pal.antracit",
    name: "Antracit",
    supplierCode: unverifiedDecorCode("U963 ST9"),
  },
  {
    entryId: "pal.gri-havanna",
    name: "Gri Havanna",
    supplierCode: confirmedDecorCode("U755 ST9"),
  },
  {
    entryId: "pal.nuc-warmia",
    name: "Nuc Warmia Maro",
    supplierCode: confirmedDecorCode("H1307 ST19"),
  },
];

/** Veneer's two woods, ADR 0071 decision 3. */
const VENEER_WOODS: readonly PaletteEntry[] = [
  {
    entryId: "veneer.stejar",
    name: "Stejar",
    supplierCode: NOT_A_MANUFACTURED_DECOR,
  },
  {
    entryId: "veneer.nuc",
    name: "Nuc",
    supplierCode: NOT_A_MANUFACTURED_DECOR,
  },
];

/** **The white MDF is painted by default.** A free colour like every other MDF pick, and the white
 *  this product already draws — `finishes.ts` in `@lemnaria/three-adapter` has rendered exactly this
 *  value since M1 — so the default is a colour the customer has seen rather than one invented at the
 *  declaration. Which RAL white a customer lands on is theirs to pick, in wave 6R's control. */
const MDF_DEFAULT_COLOUR = "#eceeeb";

/** The three materials, in the price order `MATERIAL_IDS` declares. */
export const MATERIALS: readonly Material[] = [
  {
    materialId: "material.melamine",
    colourControl: { shape: "decor-list", entries: PAL_DECORS },
    defaultFinish: paletteFinish("pal.alb"),
  },
  {
    materialId: "material.painted-mdf",
    colourControl: { shape: "ral-picker" },
    defaultFinish: freeColourFinish(MDF_DEFAULT_COLOUR),
  },
  {
    materialId: "material.veneer",
    colourControl: { shape: "wood-swatches", entries: VENEER_WOODS },
    defaultFinish: paletteFinish("veneer.stejar"),
  },
];

/** Every entry any material offers, in material order. The generator a sweep over "any legal
 *  palette finish" reads, so a sweep cannot quietly miss a material's palette. */
export const PALETTE_ENTRIES: readonly PaletteEntry[] = MATERIALS.flatMap(
  (material) => paletteEntriesOf(material),
);

/** What a material offers to pick from. **A RAL picker offers no entries**, and that is an answer
 *  rather than a missing list — the empty array is the Special Case, so no caller needs a null
 *  check to ask what MDF's decors are. */
export function paletteEntriesOf(material: Material): readonly PaletteEntry[] {
  return material.colourControl.shape === "ral-picker"
    ? []
    : material.colourControl.entries;
}

export class UnknownMaterialError extends Error {
  constructor(materialId: string) {
    super(`no material is declared for tier id "${materialId}"`);
    this.name = "UnknownMaterialError";
  }
}

/** The material a stored `materialTierId` names. Throws rather than returning `undefined`, because
 *  every caller inside this package has already been handed an id the schema accepted. */
export function materialById(materialId: string): Material {
  const material = MATERIALS.find(
    (candidate) => candidate.materialId === materialId,
  );
  if (!material) throw new UnknownMaterialError(materialId);
  return material;
}

/** The finish a design wearing nothing is deemed to wear, and the finish wave 6P's migration resets
 *  a legacy value to: **PAL's default, *Alb***. */
export const DEFAULT_FINISH: Finish =
  materialById(DEFAULT_MATERIAL_ID).defaultFinish;

/** **The five finishes the shipped enum offered.** The migration's input alphabet — a stored value
 *  is one of these or it is not a legacy finish at all — and, until wave 6R, the list the panel's
 *  five chips and the adapter's five keys are still built from. */
export const LEGACY_ENUM_FINISH_NAMES = [
  "white",
  "clay",
  "sage",
  "graphite",
  "oak",
] as const;
export type LegacyEnumFinishName = (typeof LEGACY_ENUM_FINISH_NAMES)[number];

/**
 * **A wave 6P bridge, and wave 6R deletes it.**
 *
 * What each of the shipped enum's five names is, expressed in the shape that replaced it — so the
 * two hand-written copies of that enum (`panel-model.ts`'s chips and `finishes.ts`'s `FinishKey`)
 * keep offering and drawing exactly what they offer and draw today, through one table instead of
 * two that agree.
 *
 * **This is not the migration's table**, and the difference is the owner's ruling of 2026-09-04: a
 * *stored* legacy value resets to PAL's *Alb* (`DEFAULT_FINISH`), because deeming a document to be
 * MDF would move a design onto a dearer tier the customer never chose. This table is about what the
 * live control still offers, which is a different question with a different answer.
 *
 * *Lut* and *Salvie* are free colours because ADR 0071 decision 5 narrows them out of every
 * palette — they are paint and nothing else. The two hex values are the ones the adapter has drawn
 * since M1.
 */
export const LEGACY_ENUM_FINISHES: Readonly<
  Record<LegacyEnumFinishName, Finish>
> = {
  white: paletteFinish("pal.alb"),
  clay: freeColourFinish("#cbc3b8"),
  sage: freeColourFinish("#8d9a84"),
  graphite: paletteFinish("pal.antracit"),
  oak: paletteFinish("pal.stejar-bardolino"),
};

/** Whether a stored value is one of the five the enum shipped with. Asked of a raw document before
 *  it is parsed, so it takes `unknown` rather than a string. */
export function isLegacyEnumFinishName(
  value: unknown,
): value is LegacyEnumFinishName {
  return (
    typeof value === "string" &&
    (LEGACY_ENUM_FINISH_NAMES as readonly string[]).includes(value)
  );
}
