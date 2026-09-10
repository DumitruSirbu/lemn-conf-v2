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
// delta or rule may exist in `catalog.ts`, in the app's message catalogue
// (`apps/web/src/messages/ro.json`), or in a component. The 2E sheet's
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
  type BookAccessories,
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
    // **Its hardware is billed as one drawer box, and that understates it** (ADR 0092 decision 8).
    // A full-height cargo pull-out costs more than the single drawer this row declares, and
    // ADR 0070 publishes no cargo figure at all — so the row is billed for what it demonstrably
    // has, and what it also has and nobody priced is recorded here rather than invented. This is
    // the same accepted imprecision as Hettich's runners-only drawer rate below, in the same place:
    // beside the number. **A wave that quietly prices a cargo pull-out has overturned a decision.**
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
 * **PENDING OWNER INPUT — drafted placeholders with no supplier source** (ADR 0092 decision 3, open
 * input 1). Every other amount in this book traces to a figure the owner gathered on 2026-09-04;
 * **these three trace to nothing.** ADR 0070 priced hinges and drawers and published no
 * push-to-open figure at all, and no number anywhere in this repository supports one.
 *
 * Their **ordering** follows each tier's own hinge rate, which is the only defensible relation
 * available. Their **magnitudes are not evidence of anything** and must not be quoted as a price.
 *
 * **They are load-bearing, and this comment used to say the opposite.** The owner ruled on
 * 2026-09-06 that push-to-open is priced, and the shipped demo carries **16** push fronts — its nine
 * top-row placements, which record no `handle` and are push-to-open by slot. So every seeded
 * hardware total now moves with these three numbers, and replacing one with a supplier figure moves
 * a customer-visible price. **They are open owner input 1** (ADR 0092 decision 3, Amendment C).
 * Assertions read the rate off this book and multiply; none types a magnitude, because a test
 * carrying a literal would make a placeholder a pinned expectation.
 *
 * **A customer-visible ordering rests on them today**: at 16 latches Hettich passes Blum,
 * contradicting ADR 0070's own totals. It refuses nothing, and it is why the three real rates are
 * the first thing on the pending-owner list.
 *
 * **They are non-zero on purpose.** The defect ADR 0070 exists to remove is a push-to-open kitchen
 * billing its hardware at exactly zero; a zero placeholder would reinstate it while looking
 * implemented.
 */
const DRAFTED_PUSH_TO_OPEN_MINOR = {
  standard: 4_000,
  hettich: 12_000,
  blum: 10_000,
} as const;

/**
 * **ADR 0070 decision 4's two sink extras, and the one block in this file whose magnitudes are the
 * owner's rather than drafted.** The owner priced both on 2026-09-04 from Chișinău retail — ≈200 MDL
 * for the cover and ≈400 for the rack — and published them as a flat *"Sink extras 600"* column,
 * **identical in all three tier columns**, which is the record's own way of saying the extras sit
 * outside the hardware tier rather than inside it. That is why they are here and not on a tier.
 *
 * **Their names and descriptions are not owner-ruled**, and ship as drafted placeholders under the
 * standing direction of 2026-09-04 — draft strings that carry their meaning now, and the manufacturer
 * dashboard makes copy editable later. Nothing pins their wording.
 *
 * **The rack is priced and never drawn** (ADR 0070 decision 4): no builder has a part for it, at any
 * width and any depth, and `sink-declaration.parity.test.ts` asserts that from the adapter side.
 */
const SAMPLE_ACCESSORIES: BookAccessories = {
  sinkProtectiveCover: {
    ruleId: "accessory.sink-protective-cover",
    name: "Protecție de aluminiu pentru corpul spălătorului",
    description:
      "Montată în corpul spălătorului, împotriva umidității și a scurgerilor. Inclusă întotdeauna.",
    perUnitMinor: 20_000,
  },
  dishDryingRack: {
    ruleId: "accessory.dish-drying-rack",
    name: "Uscător de vase",
    description:
      "Montat în corpul suspendat de deasupra spălătorului. Inclus unde există un corp suspendat.",
    perUnitMinor: 40_000,
  },
};

/**
 * A provisional sample book. **Not a quote, not a price list, and not checked against anything.**
 *
 * The hardware tiers are priced **per mechanism** (ADR 0070 decision 1) — three rates multiplied by
 * the hinge, drawer and push-to-open counts `countHardwareMechanisms` answers — and the material
 * tiers once for the whole kitchen, which is the shape the 2E sheet renders as a single delta.
 *
 * **The two defaults are no longer alike, and that asymmetry is deliberate and open.** The default
 * *material* tier still costs nothing, so an unconfigured kitchen's material line is zero and the
 * breakdown renders *inclus* for it. The default *hardware* tier no longer does: Standard prices the
 * seeded kitchen's mechanisms at `450_240` minor, because ADR 0070's own totals table is the only
 * figure on record for what a Standard tier costs and it says ~5 100 MDL rather than 0.
 *
 * **Whether the customer's Standard hardware line should be that number or zero is an owner input**
 * (ADR 0092 decision 15, open input 6): it decides whether the quoted cabinet price includes
 * standard hardware or hardware is billed on top of it, and no dated record has ever ruled it. The
 * absolute model ships as the interim because the alternative — a line pricing the difference from
 * the default — goes **negative** on a drawer-dominant design and fails `priceDesign` whole, so the
 * price bar would render no figure at all.
 *
 * A line at zero is still not the same thing as a rule that is missing, in either group.
 */
export const SAMPLE_PRICE_BOOK: PriceBook = {
  version: SAMPLE_PRICE_BOOK_VERSION,
  currency: PRICE_BOOK_CURRENCY,
  status: "estimate",
  amountsProvisional: true,
  cabinetRules: SAMPLE_CABINET_RULES,
  hardware: {
    defaultTierId: "hardware.standard",
    // **The tier ids are opaque keys and two of them no longer describe their tier.** They are
    // **persisted** in `DesignSettings.hardwareTierId`, so renaming one refuses every stored design
    // carrying it with `UNKNOWN_TIER` and owes a migration that ADR 0072 places in the dashboard era
    // — so ADR 0092 decision 7 renamed the six customer-facing strings and moved no id. Read them
    // as: `hardware.soft-close` **is Hettich**, `hardware.premium` **is Blum**. Neither id is a
    // claim about soft-close or about a premium grade any more.
    tiers: [
      {
        tierId: "hardware.standard",
        ruleId: "hardware.standard",
        name: "Standard",
        // **Says it has no soft-close**, which ADR 0070 decision 3 calls a functional difference the
        // customer feels on every door rather than a cheaper version of the same mechanism. It no
        // longer says *incluse în preț*: this tier's mechanisms are now billed, and a description
        // asserting the opposite of the book's own numbers is worse than one pending review.
        description: "Balamale și glisiere fără amortizare, închidere simplă.",
        perHingeMinor: 1_760,
        perDrawerMinor: 64_000,
        perPushToOpenMinor: DRAFTED_PUSH_TO_OPEN_MINOR.standard,
      },
      {
        tierId: "hardware.soft-close",
        ruleId: "hardware.soft-close",
        name: "Hettich",
        description: "Balamale și glisiere cu amortizare, de la Hettich.",
        perHingeMinor: 8_500,
        // **Understated, and staying that way.** ADR 0070's Hettich drawer figure is a
        // **runners-only** product line while Standard's and Blum's are complete boxes — box sides
        // included — so this number is missing a cost the other two carry. The owner ruled it
        // explicitly: *"for Hettich use it as it is"*. **A wave that quietly makes the three
        // comparable has overturned a decision**, and it is this understatement that makes Hettich
        // cheaper per drawer than Standard and opens wave 6W.
        perDrawerMinor: 62_600,
        perPushToOpenMinor: DRAFTED_PUSH_TO_OPEN_MINOR.hettich,
      },
      {
        tierId: "hardware.premium",
        ruleId: "hardware.premium",
        name: "Blum",
        description: "Balamale și glisiere cu amortizare, de la Blum.",
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
  accessories: SAMPLE_ACCESSORIES,
};
