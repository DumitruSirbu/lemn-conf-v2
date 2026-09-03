// **The one file in this repository that holds price figures, and every figure in it is invented.**
//
// ADR 0001 decision 4: no commercial figure is asserted anywhere, in code or in docs. So this file's
// name says what it is, its data says so too — `amountsProvisional: true`, `status: "estimate"` —
// and `pricing-seams.test.ts` asserts both rather than trusting the comment. Nothing here has been
// costed by anybody. The coefficients exist to exercise the arithmetic and to give M6's surfaces a
// number to render; a real book replaces this one wholesale.
//
// **Nothing imports it.** The query takes a book as a parameter (ADR 0062 seam 1), so this module is
// a leaf: it is re-exported from the package barrel for a composition root to pick up, and no module
// under `pricing/` may import it. That is what makes a manufacturer-supplied book a substitution
// later rather than a refactor.
//
// **And it is the only place a price may live** (ADR 0062's third prohibition): no amount, tier,
// delta or rule may exist in `catalog.ts`, in `content/ro.ts`, or in a component. The 2E sheet's
// *"de la +9 000"* is this data rendered, never copy that happens to agree with a number.
//
// **The tier names and descriptions below are provisional sample content, not owner-ruled copy.**
// Wave 6G's plan says so in as many words, and the M6 copy table's last row is the rule they fall
// under: a string nobody has ruled is not pinned by writing one and asserting it — it is raised. No
// test in this wave pins their wording, and a wave that renders them owes the owner the question.
import {
  pricedByWidth,
  pricedByWidthAndDoorLeaves,
  pricedByWidthAndHeight,
  pricedByWidthHeightAndDoorLeaves,
  pricedFlat,
  PRICE_BOOK_CURRENCY,
  type CabinetPriceRule,
  type PriceBook,
} from "./price-book.js";

/** The version this sample book is filed under. Matched for equality by the query, which is why it
 *  is a stable string and not a date: a book's version is an identity, not a timestamp. */
export const SAMPLE_PRICE_BOOK_VERSION = "sample-2026-09";

/**
 * Amounts are in **bani** — MDL minor units — throughout, because a price that is not a whole count
 * of the smallest unit is a price something has already rounded, and only presentation rounds
 * (§9's *De la*, up to the thousand MDL).
 *
 * **Every cabinetry row is a formula over width, and not one of them holds a width** (ADR 0035
 * decision 8): a body 575 mm wide prices from the same coefficients a 600 mm one does, because the
 * 50 mm ladder is what the panel offers and not what the workshop builds.
 *
 * `pricedFlat` marks the rows where width genuinely buys nothing: an appliance, a hood body, a
 * corner return — bodies made at one size, or whose cost is the machine standing in them.
 *
 * **Which row takes which shape is a statement about the product, and it is checkable** (ADR 0068).
 * A door term belongs to the rows that declare `doorCountFollowsWidth`; a height term belongs to the
 * rows that declare `heightFlex`. `wall-cabinet` declares both. `pricing-seams.test.ts` reads those
 * two catalogue flags and holds this book to them, so the assignment keys on the property rather
 * than on a list of ids somebody kept up to date by hand.
 *
 * Every other row's height and door population are fixed at build, so both facts fold into its
 * `baseMinor` exactly as they did before either term existed — that is the *reason* one shape
 * covered the whole catalogue, and not an accident that it did.
 */
const SAMPLE_CABINET_RULES: readonly CabinetPriceRule[] = [
  // §7's insertable rows. A seeded body reaches these through its `catalogEquivalentId`
  // (ADR 0022), which is why there is no rule per seeded id below.
  // ADR 0033's merged hinged base: its door count follows its width, so its price steps where
  // `deriveDoorCount` does. One band of leaves, so one step.
  {
    ruleId: "cabinet.base-cabinet",
    buildId: "base-cabinet",
    formula: pricedByWidthAndDoorLeaves({
      baseMinor: 120_000,
      perWidthMillimetreMinor: 400,
      perDoorLeafMinor: 18_000,
    }),
  },
  {
    ruleId: "cabinet.base-3drawer",
    buildId: "base-3drawer",
    formula: pricedByWidth({
      baseMinor: 180_000,
      perWidthMillimetreMinor: 500,
    }),
  },
  {
    ruleId: "cabinet.base-panbank",
    buildId: "base-panbank",
    formula: pricedByWidth({
      baseMinor: 160_000,
      perWidthMillimetreMinor: 480,
    }),
  },
  {
    ruleId: "cabinet.base-hob-2drawer",
    buildId: "base-hob-2drawer",
    formula: pricedFlat(350_000),
  },
  {
    ruleId: "cabinet.base-hob-oven",
    buildId: "base-hob-oven",
    formula: pricedFlat(420_000),
  },
  {
    ruleId: "cabinet.base-bottle-cargo",
    buildId: "base-bottle-cargo",
    formula: pricedByWidth({ baseMinor: 90_000, perWidthMillimetreMinor: 450 }),
  },
  {
    ruleId: "cabinet.base-sink",
    buildId: "base-sink",
    formula: pricedByWidth({
      baseMinor: 150_000,
      perWidthMillimetreMinor: 420,
    }),
  },
  {
    ruleId: "cabinet.base-dishwasher",
    buildId: "base-dishwasher",
    formula: pricedByWidth({
      baseMinor: 140_000,
      perWidthMillimetreMinor: 300,
    }),
  },
  // **The one row that exhibits both decisions** (ADR 0068's population correction): `wallCabinet`
  // declares `heightFlex: true` for the whole wall band, and this row declares
  // `doorCountFollowsWidth` on top of it. A rule expressing only the step would be silently wrong
  // on the most-inserted cabinet in the catalogue.
  {
    ruleId: "cabinet.wall-cabinet",
    buildId: "wall-cabinet",
    formula: pricedByWidthHeightAndDoorLeaves({
      baseMinor: 40_000,
      perWidthMillimetreMinor: 300,
      perHeightMillimetreMinor: 70,
      perDoorLeafMinor: 14_000,
    }),
  },
  // Built to its opening, so two of them stand at two heights (owner, 2026-09-03). Height is an
  // input **beside** width here, not a front area: the width term is unchanged.
  {
    ruleId: "cabinet.wall-lift",
    buildId: "wall-lift",
    formula: pricedByWidthAndHeight({
      baseMinor: 70_000,
      perWidthMillimetreMinor: 350,
      perHeightMillimetreMinor: 100,
    }),
  },
  // The second body built to its opening. No door and no leaf, so it takes the height shape and
  // not the door-step one.
  {
    ruleId: "cabinet.open-shelf",
    buildId: "open-shelf",
    formula: pricedByWidthAndHeight({
      baseMinor: 30_000,
      perWidthMillimetreMinor: 200,
      perHeightMillimetreMinor: 50,
    }),
  },
  {
    ruleId: "cabinet.hood",
    buildId: "hood",
    formula: pricedByWidth({
      baseMinor: 200_000,
      perWidthMillimetreMinor: 150,
    }),
  },
  // ADR 0048's resizable column: **two** stacked bands of leaves, so the threshold at 500 mm takes
  // it from two doors to four and the price steps twice. The count comes from
  // `widthDerivedDoorLeafCount`, not from `deriveDoorCount`, which answers per band.
  {
    ruleId: "cabinet.tall-pantry",
    buildId: "tall-pantry",
    formula: pricedByWidthAndDoorLeaves({
      baseMinor: 300_000,
      perWidthMillimetreMinor: 700,
      perDoorLeafMinor: 22_000,
    }),
  },
  {
    ruleId: "cabinet.tall-oven-tower",
    buildId: "tall-oven-tower",
    formula: pricedFlat(900_000),
  },
  {
    ruleId: "cabinet.tall-fridge-housing",
    buildId: "tall-fridge-housing",
    formula: pricedFlat(700_000),
  },
  {
    ruleId: "cabinet.fridge-free",
    buildId: "fridge-free",
    formula: pricedFlat(1_200_000),
  },
  // The four bodies with no §7 equivalent — the corners, which ADR 0021 makes structural and which
  // §13.1 is explicit a customer never chooses. Having no equivalent is the correct answer for them
  // rather than a missing one, so a book prices them under their own ids. Without these four rules
  // the seeded kitchen fails whole, which is the behaviour, not a workaround for it.
  {
    ruleId: "cabinet.base-corner-x-900",
    buildId: "base-corner-x-900",
    formula: pricedFlat(400_000),
  },
  {
    ruleId: "cabinet.base-corner-return-320",
    buildId: "base-corner-return-320",
    formula: pricedFlat(120_000),
  },
  {
    ruleId: "cabinet.wall-corner-return-570",
    buildId: "wall-corner-return-570",
    formula: pricedFlat(160_000),
  },
  {
    ruleId: "cabinet.wall-corner-return-570-top",
    buildId: "wall-corner-return-570-top",
    formula: pricedFlat(90_000),
  },
];

/**
 * A provisional sample book. **Not a quote, not a price list, and not checked against anything.**
 *
 * The hardware tiers are priced **per cabinet handle** (ADR 0061 decision 2) and the material tiers
 * once for the whole kitchen, which is the shape the 2E sheet renders as a single delta. Both
 * default tiers cost nothing, so an unconfigured kitchen carries two lines at zero — the breakdown
 * renders *inclus* for them, and a line at zero is not the same thing as a rule that is missing.
 */
export const SAMPLE_PRICE_BOOK: PriceBook = {
  version: SAMPLE_PRICE_BOOK_VERSION,
  currency: PRICE_BOOK_CURRENCY,
  status: "estimate",
  amountsProvisional: true,
  cabinetRules: SAMPLE_CABINET_RULES,
  hardware: {
    defaultTierId: "hardware.standard",
    tiers: [
      {
        tierId: "hardware.standard",
        ruleId: "hardware.standard",
        name: "Standard",
        description: "Balamale și glisiere standard, incluse în preț.",
        perCabinetHandleMinor: 0,
      },
      {
        tierId: "hardware.soft-close",
        ruleId: "hardware.soft-close",
        name: "Închidere lentă",
        description: "Balamale și glisiere cu amortizare pe fiecare front.",
        perCabinetHandleMinor: 4_500,
      },
      {
        tierId: "hardware.premium",
        ruleId: "hardware.premium",
        name: "Premium",
        description: "Feronerie premium, cu deschidere completă și amortizare.",
        perCabinetHandleMinor: 9_000,
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
        description: "Materialul standard al bucătăriei, inclus în preț.",
        wholeKitchenMinor: 0,
      },
      {
        tierId: "material.painted-mdf",
        ruleId: "material.painted-mdf",
        name: "MDF vopsit mat",
        description: "Fronturi din MDF vopsit mat, pentru toată bucătăria.",
        wholeKitchenMinor: 900_000,
      },
      {
        tierId: "material.veneer",
        ruleId: "material.veneer",
        name: "Furnir natural",
        description: "Fronturi furniruite natural, pentru toată bucătăria.",
        wholeKitchenMinor: 1_800_000,
      },
    ],
  },
};
