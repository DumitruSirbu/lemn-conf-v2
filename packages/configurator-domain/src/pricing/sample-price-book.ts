// The one file in this repository that holds price figures, and every figure in it is invented
// (ADR 0001 decision 4). `amountsProvisional: true` and `status: "estimate"` say so, and
// `pricing-seams.test.ts` asserts both. A real book replaces this one wholesale.
//
// Nothing imports it: the query takes a book as a parameter (ADR 0062 seam 1), so it is re-exported
// from the barrel for a composition root and no module under `pricing/` may import it.
//
// It is the only place a price may live (ADR 0062's third prohibition): no amount, tier, delta or
// rule in `catalog.ts`, the message catalogue or a component.
//
// The tier names and descriptions below are provisional sample content, not owner-ruled copy; no
// test pins their wording.
import {
  drawnButNotSupplied,
  PRICE_BOOK_CURRENCY,
  type BookAccessories,
  type CabinetPriceRule,
  type PriceBook,
} from "./price-book.js";

/** The version this sample book is filed under. Matched for equality by the query, so a stable string
 *  and not a date. */
export const SAMPLE_PRICE_BOOK_VERSION = "sample-2026-09";

/**
 * Amounts are in bani (MDL minor units) throughout and exact: a priced line rounds its own amount to 10 lei (1 000
 * bani) at one named seam, so a step or an anchor need not be a whole ten lei (ADR 0177 A-1).
 *
 * Each insertable row is quoted at its catalogue default width (`defaultWidthMm`) and steps by 50 mm either way
 * (ADR 0175, ADR 0177 A-2): a 575 mm body prices as 600. A row made in one or two listed sizes carries those sizes
 * instead (A-7). The six structural corner bodies have no catalogue default and are priced under their own ids; each
 * is made in one width, listed at the width a body of it rounds up to.
 *
 * Which row takes which shape is checkable (ADR 0068): a door term belongs to rows declaring
 * `doorCountFollowsWidth`, a height term to rows declaring `heightFlex`, and `wall-cabinet` declares
 * both. `pricing-seams.test.ts` holds this book to those catalogue flags. Every other row's height and
 * door population are fixed at build and fold into its anchor.
 */
const SAMPLE_CABINET_RULES: readonly CabinetPriceRule[] = [
  // §7's insertable rows. A seeded body reaches these through its `catalogEquivalentId` (ADR 0022).
  // The merged hinged base's door count follows its width (ADR 0033): one band of leaves, one step.
  {
    ruleId: "cabinet.base-cabinet",
    buildId: "base-cabinet",
    formula: {
      shape: "anchored-width-and-door-leaves",
      anchorWidthMm: 600,
      anchorMinor: 396_000,
      perStepWiderMinor: 20_000,
      perStepNarrowerMinor: 20_000,
      perExtraDoorLeafMinor: 18_000,
    },
  },
  {
    ruleId: "cabinet.base-3drawer",
    buildId: "base-3drawer",
    formula: {
      shape: "anchored-width",
      anchorWidthMm: 600,
      anchorMinor: 480_000,
      perStepWiderMinor: 25_000,
      perStepNarrowerMinor: 25_000,
    },
  },
  {
    ruleId: "cabinet.base-panbank",
    buildId: "base-panbank",
    formula: {
      shape: "anchored-width",
      anchorWidthMm: 600,
      anchorMinor: 448_000,
      perStepWiderMinor: 24_000,
      perStepNarrowerMinor: 24_000,
    },
  },
  {
    ruleId: "cabinet.base-hob-2drawer",
    buildId: "base-hob-2drawer",
    formula: {
      shape: "price-per-size",
      sizes: [{ widthMm: 600, amountMinor: 350_000 }],
    },
  },
  {
    ruleId: "cabinet.base-hob-oven",
    buildId: "base-hob-oven",
    formula: {
      shape: "price-per-size",
      sizes: [{ widthMm: 600, amountMinor: 420_000 }],
    },
  },
  {
    // Its hardware is billed as one drawer box, which understates a full-height cargo pull-out; ADR
    // 0070 publishes no cargo figure. Pricing the pull-out overturns ADR 0092 decision 8.
    ruleId: "cabinet.base-bottle-cargo",
    buildId: "base-bottle-cargo",
    formula: {
      shape: "price-per-size",
      sizes: [
        { widthMm: 200, amountMinor: 180_000 },
        { widthMm: 300, amountMinor: 225_000 },
      ],
    },
  },
  {
    ruleId: "cabinet.base-sink",
    buildId: "base-sink",
    formula: {
      shape: "anchored-width",
      anchorWidthMm: 600,
      anchorMinor: 402_000,
      perStepWiderMinor: 21_000,
      perStepNarrowerMinor: 21_000,
    },
  },
  {
    ruleId: "cabinet.base-dishwasher",
    buildId: "base-dishwasher",
    formula: {
      shape: "price-per-size",
      sizes: [
        { widthMm: 450, amountMinor: 275_000 },
        { widthMm: 600, amountMinor: 320_000 },
      ],
    },
  },
  // The one row exhibiting both decisions (ADR 0068): `heightFlex` for the whole wall band plus
  // `doorCountFollowsWidth`. A rule expressing only the step would misprice the most-inserted cabinet. Quoted at the
  // reference height of 700 mm.
  {
    ruleId: "cabinet.wall-cabinet",
    buildId: "wall-cabinet",
    formula: {
      shape: "anchored-width-height-and-door-leaves",
      anchorWidthMm: 600,
      anchorHeightMm: 700,
      anchorMinor: 297_000,
      perStepWiderMinor: 15_000,
      perStepNarrowerMinor: 15_000,
      perHeightStepMinor: 3_500,
      perExtraDoorLeafMinor: 14_000,
    },
  },
  // Built to its opening, so two stand at two heights. Height is an input beside width, not a front
  // area (ADR 0068).
  {
    ruleId: "cabinet.wall-lift",
    buildId: "wall-lift",
    formula: {
      shape: "anchored-width-and-height",
      anchorWidthMm: 600,
      anchorHeightMm: 700,
      anchorMinor: 350_000,
      perStepWiderMinor: 17_500,
      perStepNarrowerMinor: 17_500,
      perHeightStepMinor: 5_000,
    },
  },
  // Built to its opening with no door, so the height shape and not the door-step one.
  {
    ruleId: "cabinet.open-shelf",
    buildId: "open-shelf",
    formula: {
      shape: "anchored-width-and-height",
      anchorWidthMm: 600,
      anchorHeightMm: 700,
      anchorMinor: 185_000,
      perStepWiderMinor: 10_000,
      perStepNarrowerMinor: 10_000,
      perHeightStepMinor: 2_500,
    },
  },
  // An appliance, drawn and not sold: the customer buys the hood, and `priceBreakdown.disclaimer`
  // already excludes appliances. What Lemnaria builds around it is a different row and priced.
  // `drawnButNotSupplied` so the breakdown prints *nu este inclus* here and *inclus* beside an equally free
  // manufacturer cabinet.
  {
    ruleId: "cabinet.hood",
    buildId: "hood",
    ...drawnButNotSupplied(600),
  },
  // ADR 0048's resizable column: two stacked bands of leaves, so the 500 mm threshold takes it from
  // two doors to four and the price steps twice. The count is `widthDerivedDoorLeafCount`, not
  // `deriveDoorCount`, which answers per band.
  {
    ruleId: "cabinet.tall-pantry",
    buildId: "tall-pantry",
    formula: {
      shape: "anchored-width-and-door-leaves",
      anchorWidthMm: 600,
      anchorMinor: 808_000,
      perStepWiderMinor: 35_000,
      perStepNarrowerMinor: 35_000,
      perExtraDoorLeafMinor: 22_000,
    },
  },
  {
    ruleId: "cabinet.tall-oven-tower",
    buildId: "tall-oven-tower",
    formula: {
      shape: "price-per-size",
      sizes: [{ widthMm: 600, amountMinor: 900_000 }],
    },
  },
  {
    ruleId: "cabinet.tall-fridge-housing",
    buildId: "tall-fridge-housing",
    formula: {
      shape: "price-per-size",
      sizes: [{ widthMm: 600, amountMinor: 700_000 }],
    },
  },
  // The free-standing fridge is furniture the customer supplies: no carpentry, nothing to charge.
  // `tall-fridge-housing`, the niche an integrated fridge sits in, is joinery and keeps its price.
  {
    ruleId: "cabinet.fridge-free",
    buildId: "fridge-free",
    ...drawnButNotSupplied(700),
  },
  // Bodies with no §7 equivalent: the corner bodies, structural (ADR 0021) and never chosen by a
  // customer (§13.1). A book prices them under their own ids; without these rules the seeded kitchen
  // and a generated shell fail whole. Each is made in one width, so each lists the one size a body of it rounds up
  // to (320 to 350, 570 to 600).
  {
    ruleId: "cabinet.base-corner-x-900",
    buildId: "base-corner-x-900",
    formula: {
      shape: "price-per-size",
      sizes: [{ widthMm: 900, amountMinor: 400_000 }],
    },
  },
  {
    ruleId: "cabinet.base-corner-return-320",
    buildId: "base-corner-return-320",
    formula: {
      shape: "price-per-size",
      sizes: [{ widthMm: 350, amountMinor: 120_000 }],
    },
  },
  {
    ruleId: "cabinet.wall-corner-return-570",
    buildId: "wall-corner-return-570",
    formula: {
      shape: "price-per-size",
      sizes: [{ widthMm: 600, amountMinor: 160_000 }],
    },
  },
  {
    ruleId: "cabinet.wall-corner-return-570-top",
    buildId: "wall-corner-return-570-top",
    formula: {
      shape: "price-per-size",
      sizes: [{ widthMm: 600, amountMinor: 90_000 }],
    },
  },
  // PENDING OWNER INPUT: the corner wall unit's amounts are placeholders at each side corner piece's
  // own amount (160 000 wall row, 90 000 top row) and trace to no supplier.
  {
    ruleId: "cabinet.wall-corner-x-900",
    buildId: "wall-corner-x-900",
    formula: {
      shape: "price-per-size",
      sizes: [{ widthMm: 900, amountMinor: 160_000 }],
    },
  },
  {
    ruleId: "cabinet.wall-corner-x-900-top",
    buildId: "wall-corner-x-900-top",
    formula: {
      shape: "price-per-size",
      sizes: [{ widthMm: 900, amountMinor: 90_000 }],
    },
  },
];

/**
 * PENDING OWNER INPUT: drafted placeholders with no supplier source (ADR 0092 decision 3, open input
 * 1). ADR 0070 published no push-to-open figure and no number in this repository supports one. Their
 * ordering follows each tier's hinge rate; their magnitudes are not evidence and must not be quoted as
 * a price.
 *
 * They are load-bearing: push-to-open is priced and the demo carries 16 push fronts (its nine top-row
 * placements, which record no `handle`), so every seeded hardware total moves with these numbers. At
 * 16 latches Hettich passes Blum, contradicting ADR 0070's totals. Assertions read the rate off this
 * book and multiply; none types a magnitude, which would pin a placeholder.
 *
 * Non-zero on purpose: a zero would reinstate the zero-billed push-to-open kitchen ADR 0070 removes.
 */
const DRAFTED_PUSH_TO_OPEN_MINOR = {
  standard: 4_000,
  hettich: 12_000,
  blum: 10_000,
} as const;

/**
 * ADR 0070 decision 4's two sink extras, the one block here whose magnitudes are the owner's
 * (≈200 MDL cover, ≈400 rack, Chișinău retail), identical at all three tiers, which is why they sit
 * outside the hardware tier. Their names and descriptions are drafted placeholders; both name a
 * catalogue leaf (ADR 0106 decision 1), and the authored string is what any other book renders.
 *
 * The rack is priced and never drawn: no builder has a part for it, and
 * `sink-declaration.parity.test.ts` asserts that from the adapter side.
 */
const SAMPLE_ACCESSORIES: BookAccessories = {
  sinkProtectiveCover: {
    ruleId: "accessory.sink-protective-cover",
    name: "Protecție de aluminiu pentru dulapul chiuvetei",
    description:
      "Montată în dulapul chiuvetei, împotriva umidității și a scurgerilor.",
    nameKey: "priceBook.accessory.sink-protective-cover.name",
    descriptionKey: "priceBook.accessory.sink-protective-cover.description",
    perUnitMinor: 20_000,
  },
  dishDryingRack: {
    ruleId: "accessory.dish-drying-rack",
    name: "Uscător de vase",
    description: "Montat în dulapul suspendat deasupra chiuvetei.",
    nameKey: "priceBook.accessory.dish-drying-rack.name",
    descriptionKey: "priceBook.accessory.dish-drying-rack.description",
    perUnitMinor: 40_000,
  },
};

/**
 * A provisional sample book: not a quote, not a price list, and not checked against anything.
 *
 * Hardware tiers are priced per mechanism (ADR 0070 decision 1); a material is a whole percentage on the cabinets
 * and the depth a whole percentage on the cabinets that get deeper (ADR 0177 A-1), both invented.
 *
 * The two defaults are deliberately unlike. The default material tier costs nothing, so its line
 * renders *inclus*. The default hardware tier does not: Standard prices the seeded kitchen's
 * mechanisms near 4 500 MDL (`450_240` minor before the line is rounded to 10 lei), since ADR 0070's totals table
 * puts a Standard tier near 5 100 MDL.
 * Whether that line should be that number or zero is open owner input 6 (ADR 0092 decision 15): the
 * alternative, a line pricing the difference from the default, goes negative on a drawer-dominant
 * design and fails `priceDesign` whole.
 *
 * Every row that renders an ordinary word names its catalogue leaf (ADR 0106 decision 1). The two
 * brand rows name no `nameKey` on purpose.
 */
export const SAMPLE_PRICE_BOOK: PriceBook = {
  version: SAMPLE_PRICE_BOOK_VERSION,
  currency: PRICE_BOOK_CURRENCY,
  status: "estimate",
  amountsProvisional: true,
  cabinetRules: SAMPLE_CABINET_RULES,
  hardware: {
    defaultTierId: "hardware.standard",
    // Tier ids are opaque keys persisted in `DesignSettings.hardwareTierId`: renaming one refuses
    // every stored design carrying it (`UNKNOWN_TIER`; ADR 0072) and ADR 0092 decision 7 moved none.
    // `hardware.soft-close` is Hettich and `hardware.premium` is Blum; neither id claims a grade.
    tiers: [
      {
        tierId: "hardware.standard",
        ruleId: "hardware.standard",
        name: "Standard",
        // Says it has no soft-close, a functional difference (ADR 0070 decision 3). It must not say
        // *incluse în preț*: this tier's mechanisms are billed.
        description: "Balamale și glisiere fără amortizare, închidere simplă.",
        nameKey: "priceBook.hardware.standard.name",
        descriptionKey: "priceBook.hardware.standard.description",
        perHingeMinor: 1_760,
        perDrawerMinor: 64_000,
        perPushToOpenMinor: DRAFTED_PUSH_TO_OPEN_MINOR.standard,
      },
      {
        tierId: "hardware.soft-close",
        ruleId: "hardware.soft-close",
        // No `nameKey`: *Hettich* is a proper noun and `name` renders as typed in every locale
        // (ADR 0106 decision 2). The description is a Romanian sentence and is keyed.
        name: "Hettich",
        description: "Balamale și glisiere cu amortizare, de la Hettich.",
        descriptionKey: "priceBook.hardware.soft-close.description",
        perHingeMinor: 8_500,
        // Understated by the owner's ruling (*"for Hettich use it as it is"*): ADR 0070's Hettich
        // drawer is a runners-only line while Standard's and Blum's are complete boxes. Making the
        // three comparable overturns a decision.
        perDrawerMinor: 62_600,
        perPushToOpenMinor: DRAFTED_PUSH_TO_OPEN_MINOR.hettich,
      },
      {
        tierId: "hardware.premium",
        ruleId: "hardware.premium",
        // No `nameKey`, as for Hettich.
        name: "Blum",
        description: "Balamale și glisiere cu amortizare, de la Blum.",
        descriptionKey: "priceBook.hardware.premium.description",
        perHingeMinor: 7_500,
        perDrawerMinor: 83_700,
        perPushToOpenMinor: DRAFTED_PUSH_TO_OPEN_MINOR.blum,
      },
    ],
  },
  material: {
    defaultTierId: "material.melamine",
    tiers: [
      {
        tierId: "material.melamine",
        ruleId: "material.melamine",
        name: "PAL melaminat",
        description: "Materialul standard al bucătăriei.",
        nameKey: "priceBook.material.melamine.name",
        descriptionKey: "priceBook.material.melamine.description",
        percentOfCabinets: 0,
      },
      {
        tierId: "material.painted-mdf",
        ruleId: "material.painted-mdf",
        name: "MDF vopsit mat",
        description: "Fronturi din MDF vopsit mat, pentru toată bucătăria.",
        nameKey: "priceBook.material.painted-mdf.name",
        descriptionKey: "priceBook.material.painted-mdf.description",
        percentOfCabinets: 18,
      },
      {
        tierId: "material.veneer",
        ruleId: "material.veneer",
        name: "Furnir natural",
        description: "Fronturi furniruite natural, pentru toată bucătăria.",
        nameKey: "priceBook.material.veneer.name",
        descriptionKey: "priceBook.material.veneer.description",
        percentOfCabinets: 40,
      },
    ],
  },
  depthRule: { deepCabinetPercent: 12 },
  accessories: SAMPLE_ACCESSORIES,
};
