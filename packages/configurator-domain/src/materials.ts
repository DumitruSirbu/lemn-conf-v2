// The three materials a kitchen is built from, the palette each offers, and the two kinds of thing a
// finish is (ADR 0071).
//
// Only material carries price. Nothing in this module is a price input, and nothing under `pricing/` may
// import it (`pricing-seams.test.ts` asserts the import graph).
//
// A material id is the price book's material tier id: the domain imports no book (ADR 0062 seam 1), so it
// cannot ask whether a tier exists, but `DesignSettings.materialTierId` stores exactly these strings, so
// there is one identifier and not two that agree.
//
// Colour is a reference, not a specification: a palette entry's name is a `finish.*` catalogue leaf the app
// resolves from `entryId` (ADR 0095), never a string declared here. The supplier code is internal
// provenance and no surface presents it as a code a customer picks from.
import { z } from "zod";

/** The three materials in price order: PAL (melamine) < MDF (painted) < veneer (natural wood over MDF). */
export const MATERIAL_IDS = [
  "material.melamine",
  "material.painted-mdf",
  "material.veneer",
] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

/** The material an unset design wears and a legacy document is deemed to carry: PAL, also the id
 *  `sample-price-book.ts` declares as its `material.defaultTierId`. */
export const DEFAULT_MATERIAL_ID: MaterialId = "material.melamine";

/** Every palette entry this product declares, across all three materials. Ids are namespaced by material
 *  because a decor and a veneer may share a wood's name (PAL's *Nuc Warmia Maro* is printed, veneer's *Nuc*
 *  is walnut). */
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

/** How settled a decor's supplier code is. Required per entry, so a new decor cannot be added without
 *  stating which, and the two states are never presented as equally settled (ADR 0071 decision 4). */
export const DECOR_CODE_CONFIDENCES = ["confirmed", "unverified"] as const;
export type DecorCodeConfidence = (typeof DECOR_CODE_CONFIDENCES)[number];

/** What a palette entry is ordered as, when it is ordered as anything. Discriminated, not an optional
 *  string: a natural wood has no decor code, and `undefined` would read as "nobody has filled this in yet". */
export type SupplierDecorCode =
  | {
      readonly kind: "catalogue";
      readonly code: string;
      readonly confidence: DecorCodeConfidence;
    }
  | { readonly kind: "none" };

/** A wood is not a manufacturer's decor, so it has no code — stated rather than left absent. */
export const NOT_A_MANUFACTURED_DECOR: SupplierDecorCode = { kind: "none" };

/** Read from a supplier catalogue. */
export function confirmedDecorCode(code: string): SupplierDecorCode {
  return { kind: "catalogue", code, confidence: "confirmed" };
}

/** Not confirmed against a supplier stock list. */
export function unverifiedDecorCode(code: string): SupplierDecorCode {
  return { kind: "catalogue", code, confidence: "unverified" };
}

/** One entry a customer can pick by name. The name is not here: `entryId` is the descriptor the app
 *  resolves through its `finish.*` leaves (the domain publishes codes, never sentences). */
export interface PaletteEntry {
  readonly entryId: PaletteEntryId;
  /** Internal provenance, never rendered as a code a customer chooses from. */
  readonly supplierCode: SupplierDecorCode;
}

/** The shape of the control, declared (ADR 0071 decision 3): three different controls reading one setting.
 *  Declared, not inferred from the entry count: two swatches and a list of two are the same array and
 *  different products. */
export type ColourControl =
  | { readonly shape: "decor-list"; readonly entries: readonly PaletteEntry[] }
  | { readonly shape: "ral-picker" }
  | {
      readonly shape: "wood-swatches";
      readonly entries: readonly PaletteEntry[];
    };

/**
 * A finish is a palette entry named by its id (a PAL decor, a veneer wood) or a free colour value (MDF's
 * RAL pick); there is no third kind. The discriminant is `kind` and nothing else: a hex-looking value is
 * not thereby a free colour, and a palette id is not recognised by failing to parse as one.
 *
 * A free colour is validated here, at the one gate the API write seam and `migrateDesign` both pass
 * through. It is the first free-form value a customer authors that a document carries, so a malformed one
 * is refused, never defaulted or nudged to a nearby colour; the exact pattern also caps the length.
 *
 * A palette id is closed against the declaration above: an id no material offers is a value this product
 * never wrote. Retiring an entry brings its own migration.
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

/** Thrown, not returned: a colour that does not parse is a programming error at every seam inside this
 *  package, and a refusal at the schema everywhere else. */
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

/** Value equality: the same kind naming the same thing. */
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
  /** The reset target (ADR 0057): Alb for PAL, white for MDF, Stejar for veneer. The value a cabinet's
   *  finish resolves to when this material does not offer what it is wearing. */
  readonly defaultFinish: Finish;
}

/** PAL's six factory decors (ADR 0071 decision 4): PAL arrives pre-manufactured, so only what the
 *  manufacturer makes can be offered. */
const PAL_DECORS: readonly PaletteEntry[] = [
  {
    entryId: "pal.alb",
    supplierCode: unverifiedDecorCode("W1000 ST9 Alb Premium"),
  },
  {
    entryId: "pal.stejar-bardolino",
    supplierCode: confirmedDecorCode("H1145 ST10"),
  },
  {
    entryId: "pal.stejar-halifax",
    supplierCode: confirmedDecorCode("H1180 ST37"),
  },
  {
    entryId: "pal.antracit",
    supplierCode: unverifiedDecorCode("U963 ST9"),
  },
  {
    entryId: "pal.gri-havanna",
    supplierCode: confirmedDecorCode("U755 ST9"),
  },
  {
    entryId: "pal.nuc-warmia",
    supplierCode: confirmedDecorCode("H1307 ST19"),
  },
];

/** Veneer's two woods (ADR 0071 decision 3). */
const VENEER_WOODS: readonly PaletteEntry[] = [
  {
    entryId: "veneer.stejar",
    supplierCode: NOT_A_MANUFACTURED_DECOR,
  },
  {
    entryId: "veneer.nuc",
    supplierCode: NOT_A_MANUFACTURED_DECOR,
  },
];

/** The default MDF colour: a free colour like every other MDF pick, equal to the white `finishes.ts` in
 *  `@lemnaria/three-adapter` has always drawn, so the default is one the customer has seen. */
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

/** Every entry any material offers, in material order: what a sweep over "any legal palette finish" reads. */
export const PALETTE_ENTRIES: readonly PaletteEntry[] = MATERIALS.flatMap(
  (material) => paletteEntriesOf(material),
);

/** What a material offers to pick from. A RAL picker offers no entries: the empty array is an answer, so
 *  no caller needs a null check to ask what MDF's decors are. */
export function paletteEntriesOf(material: Material): readonly PaletteEntry[] {
  return material.colourControl.shape === "ral-picker"
    ? []
    : material.colourControl.entries;
}

/** Whether a material offers a finish: the one query the reset rule, the command guard and both load
 *  seams read, so "does not offer" is decided in one place (ADR 0078 decision 1).
 *
 *  It asks the control's declared `shape` and never counts entries (a veneer gaining a third wood must not
 *  change the answer's product). A RAL picker offers every free colour `FinishSchema` admits and no palette
 *  entry: no RAL set is declared, and narrowing to a table nobody authored would reset colours a customer
 *  chose. Absence is not asked about: a body wearing no finish never reaches this query. */
export function materialOffersFinish(
  material: Material,
  finish: Finish,
): boolean {
  if (material.colourControl.shape === "ral-picker") {
    return finish.kind === "free-colour";
  }
  return (
    finish.kind === "palette-entry" &&
    paletteEntriesOf(material).some((entry) => entry.entryId === finish.entryId)
  );
}

export class UnknownMaterialError extends Error {
  constructor(materialId: string) {
    super(`no material is declared for tier id "${materialId}"`);
    this.name = "UnknownMaterialError";
  }
}

/** The material a declared id names. Throws, because a caller holds an id from this module's own
 *  declaration. A caller holding a stored id wants `lookUpMaterial` below, which answers instead. */
export function materialById(materialId: string): Material {
  const lookup = lookUpMaterial(materialId);
  if (lookup.kind === "undeclared") throw new UnknownMaterialError(materialId);
  return lookup.material;
}

/** What a stored `materialTierId` resolves to when nobody may throw: "no material for that id" is an
 *  answer, where a bare `undefined` would read as an oversight. */
export type MaterialLookup =
  | { readonly kind: "declared"; readonly material: Material }
  | { readonly kind: "undeclared" };

/** What an undeclared id resolves to, so no caller writes the literal twice. */
export const UNDECLARED_MATERIAL: MaterialLookup = { kind: "undeclared" };

/** The total lookup, for the load paths (ADR 0078 decision 3). `DesignSettingsSchema` validates
 *  `materialTierId` for shape only (the domain imports no price book), so a stored id naming no declared
 *  material is reachable and must keep loading. An undeclared material makes no offer, so a caller holding
 *  `{ kind: "undeclared" }` corrects nothing and refuses nothing. */
export function lookUpMaterial(materialId: string): MaterialLookup {
  const material = MATERIALS.find(
    (candidate) => candidate.materialId === materialId,
  );
  return material ? { kind: "declared", material } : UNDECLARED_MATERIAL;
}

/** The finish a design wearing nothing is deemed to wear, and the one a legacy value resets to: PAL's
 *  default, *Alb*. */
export const DEFAULT_FINISH: Finish =
  materialById(DEFAULT_MATERIAL_ID).defaultFinish;

/** The five finishes the legacy enum offered: the migration's input alphabet. A stored value is one of
 *  these or it is not a legacy finish at all. */
export const LEGACY_ENUM_FINISH_NAMES = [
  "white",
  "clay",
  "sage",
  "graphite",
  "oak",
] as const;
export type LegacyEnumFinishName = (typeof LEGACY_ENUM_FINISH_NAMES)[number];

/**
 * What each of the legacy enum's five names is, in the shape that replaced it. Read by `migrateDesign`
 * (which meets documents written under the old enum) and by `/internal/scene-shot` (the M1 reference's
 * preset shots are keyed by those names). The migration reads only each row's `kind`: `white`, `graphite`
 * and `oak` are palette entries, so a stored document keeps its colour, while *Lut* and *Salvie* are free
 * colours (ADR 0071 decision 5 narrows them out of every palette) and reset to PAL's *Alb*
 * (`DEFAULT_FINISH`); deeming a painted document MDF would move it onto a dearer tier the customer never
 * chose. The two hex values are the ones the adapter has always drawn.
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

/** Whether a stored value is one of the five the enum shipped with; asked of a raw document before it is
 *  parsed, so it takes `unknown`. */
export function isLegacyEnumFinishName(
  value: unknown,
): value is LegacyEnumFinishName {
  return (
    typeof value === "string" &&
    (LEGACY_ENUM_FINISH_NAMES as readonly string[]).includes(value)
  );
}
