# ADR 0138 — Price arithmetic, price-book parsing and rounded figures: reasons recovered from code comments

Status: Accepted
Date: 2026-10-06
Type: Finding (recovered reasons; no behaviour changes)
Milestone: Cross-cutting (M6 pricing); filed under ADR 0136 decision 3

**Why this record exists.** [ADR 0136](0136-code-and-test-comments-carry-only-what-nothing-else-can-and-history-lives-in-the-records.md)
decision 3. **Evidence tier for every decision: recovered from a code comment on 2026-10-06, not
re-measured.** Figures are quoted from the pre-pass comment text, not re-derived. The source id
"M6-AUD-015" that two comments cite appears in no document in `docs/` (searched 2026-10-06); it is kept
here only as the comment's own label. Cite as `see ADR 0138 decision N`.

**Not filed here: an owner ruling that is already recorded.** The comment on the seeded design's
no-hardware total (`front-population.test.ts`) records the owner ruling of 2026-09-10 that the
manufacturer-unsupplied rows `hood-600` and `fridge-free-700` are not charged. That ruling is
[ADR 0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md)
decision 2 (*"An appliance the customer buys prices to zero and reads nu este inclus"*). The test's
own figures (290 000, 1 200 000, a 1 490 000 drop) are test arithmetic and stay with the test.

## Decision 1 — price terms are multiplied and added with each step checked, and the order of terms decides accept versus refuse

- **Rule.** `exactAmountOfTerms` multiplies and adds every term of one amount with `Number.isSafeInteger`
  checked **per step** (`exactProduct`, `exactSum`), so a running total that leaves the safe range is
  refused even if later terms would bring it back. It is exported so there is exactly one such
  arithmetic in the package; the hardware line's three rate × mechanism-count products go through it too.
- **Why per step.** A running total is what a cancellation hides in. The comment's example: terms
  `+5e15, -5e15, +5e15` answer `5000000000000000`; in the order `+5e15, +5e15, -5e15` the running total
  reaches `1e16` and the amount is refused. Same multiset, two outcomes. **The divergence is
  accept-versus-refuse and never figure-versus-figure**: every prefix of an accepted sum is a safe
  integer, so an accepted total is the true integer total. A refusal is the answer that is never wrong.
  Two spellings of "add up some products" is how one of them stays unchecked: when the hardware line had
  its own plain `+`, two products that each leave the safe range and a sum that lands back inside it
  published 8 where the integers give 11 (comment's example).
- **Cabinet formulas are order-invariant, by the bound's derivation.** For a book `parsePriceBook`
  accepted, every coefficient is at most `MAX_PRICE_COEFFICIENT_MINOR` and every count is under
  `MAX_DESIGN_DIMENSION_MM`, so the largest prefix any ordering of a shape's four terms can form is
  `4 × 225 179 981 368 × 10 000 = 9 007 199 254 720 000`, under `2^53 − 1 = 9 007 199 254 740 991`.
- **The hardware line is not proved, and this is the stated residual.** Its count is a whole design's
  mechanism count, and nothing in the package caps the mechanisms **one body** can carry. A prefix
  leaves the safe range only past `(2^53 − 1) / (3 × MAX_PRICE_COEFFICIENT_MINOR)`, which the comment
  gives as **13 333 mechanisms** (and not the 20 000 once estimated). `MAX_PLACEMENTS` is 279 bodies (186
  before M7B's wall C, ADR 0132; 168 before ADR 0124); at an *assumed* twelve mechanisms a body the
  ceiling is 3 348, whose largest prefix is 2.26 × 10^15, **about 3.98× under 2^53 − 1**. The seeded
  kitchen carries 74 hinges, 5 drawers and 16 latches. The per-body figure is assumed, not declared;
  closing it means deriving that cap as a domain constant, "its own decision".
- **Alternative not taken.** Accumulating in `BigInt` and range-checking once would retire the question.
  Not done because the per-term check is what names the rate and the count in a refusal, and
  `qa-m6-wave-b-regate.adversarial.test.ts` pins the order divergence as a recorded fact, so retiring it
  is a decision to take with that suite.
- **Where.** `packages/configurator-domain/src/pricing/price-book.ts` (`exactAmountOfTerms`,
  `exactProduct`, `exactSum`).

## Decision 2 — checking only the final amount is not enough, so there are two layers

- **Rule.** `InexactPriceArithmeticError` is thrown for any product or running sum that is not a safe
  integer; `price-design.ts` converts it to a coded refusal. There are **two layers on purpose**:
  `MAX_PRICE_COEFFICIENT_MINOR` keeps every legal book far from the ceiling, and the throw keeps a
  loosened bound from ever publishing a wrong figure.
- **Why the final amount cannot stand in.** Comment's case (M6-AUD-015): a `wall-cabinet` rule with a
  base of 1 and two coefficients that cancel exactly in integer arithmetic prices at 1; in floating
  point the base is lost in the addition and the cancellation yields `0` — an exact, non-negative safe
  integer, so every downstream guard accepts it. What is wrong is the arithmetic that got there.
- **The bound is derived, and it bounds magnitude, not sign.** `MAX_PRICE_COEFFICIENT_MINOR` is
  `floor(Number.MAX_SAFE_INTEGER / (TERMS_IN_THE_WIDEST_FORMULA × MAX_BOOK_AMOUNT_MULTIPLIER))`, so every
  product and partial sum `amountForBody` forms is inside the safe range. Whether a negative coefficient
  is commercially legal is an owner question nobody has ruled; `refuseNegativeAmount` refuses the
  published *line*, and the parser does not pre-empt that.
- **Layer 2 matters most for hardware.** The bound is derived per *body*, and a hardware rate is charged
  over a whole design's mechanisms, so the second layer "is the only one that reaches" that path.
- **Where.** `price-book.ts` (`InexactPriceArithmeticError`); `parse-price-book.ts`
  (`MAX_PRICE_COEFFICIENT_MINOR`). Related, recorded: ADR 0100 mentions both names in passing.

## Decision 3 — `parsePriceBook` refuses and never throws, and no member of a declared book is read bare

- **Rule.** `parsePriceBook` takes `unknown` and answers either the same book object or a
  `PricingFailure` (`INVALID_PRICE_BOOK`). It never throws. Nothing is copied or defaulted (a default
  would be the module deciding a price). Every field is read through `readDeclared`, every enumeration
  through `enumerableFieldsOf`, every list through `boundedListOf`, every description through
  `renderedAsJson` or `describedLength`; `refuseAnythingRaised` is only the backstop.
- **Why never throw.** Both price surfaces run inside React's render with no error boundary above them,
  and `use-priced-design.ts` parses at **module scope**: a raise is the module failing to load, not a
  degraded price. The claim is about *every* input because reading a book runs the book's own code (a
  getter, a `toJSON`, a proxy trap, `length` or an index on a proxy array). Narrowing the claim to what
  `JSON.parse` can produce was "the easier answer and the wrong one": the sample book is a JavaScript
  value and a model-object-backed dashboard would be too.
- **`readDeclared`.** A property read cannot take the parser with it; what raised is **named, not
  rendered**, because rendering the value is one more place the boundary could be made to raise.
- **`enumerableFieldsOf`.** Walks the declared object's prototypes and **stops at `Object.prototype`**,
  not as an optimisation: a polluted global (`Object.prototype.injectedAmountMinor`) would otherwise
  take the price off every surface for a well-formed book. The depth is bounded because a proxy may
  answer `getPrototypeOf` with a fresh object indefinitely ("a boundary that hangs is worse than one
  that raises").
- **`boundedListOf`.** Copies a list out by index within the one length it read, not through the
  iterator, because a proxy may answer `length` with a larger number every time and `Array.from` would
  follow `Symbol.iterator` for as long as the book fed it. Answers `undefined` for absent, not a list,
  longer than the bound, or a list whose reads raised; the caller says which section.
- **The backstop is not a substitute.** Every named cause has its own refusal that names the member; a
  refusal wearing the backstop's message is a defect in the parser. The comment records that this
  sentence was false twice (20 of 22 field reads bare, then four list positions bare), and that the
  sweep in `parse-price-book.test.ts` is what holds it true rather than re-checking by hand.
- **Hand-written rather than Zod.** A schema would duplicate `PriceBook`'s hand-authored interfaces and
  have to be opened up for both exceptions (the module does not decide whether a coefficient is an exact
  count — `usableCoefficientOf` — nor which formula shapes exist — `amountForBody`).
- **Related, recorded.** [ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md)
  seam 1 (the book is versioned data assembled outside TypeScript).
- **Where.** `packages/configurator-domain/src/pricing/parse-price-book.ts`.

## Decision 4 — rounded lines and a rounded total need not sum, and no surface may claim they do

- **Rule.** Line amounts and the total both round up to the thousand MDL through the one site
  `roundUpToThousandMdl`, and the two need not sum. No surface adds a subtotal, an equality claim, or a
  row labelled *total*. The disclaimer *"Toate sumele sunt prețuri de pornire, rotunjite în sus"* is what
  carries it; the single-total display makes no such claim.
- **Why.** Comment's worked case: four 1 800 MDL lines round up to 4 × 2 000 = 8 000, while their
  7 200 total rounds to 8 000 only by coincidence; at 1 200 apiece it is 8 000 against 5 000. On the
  shipped design, the breakdown-model comment says, the difference exceeds a whole step.
- **One rounding site.** A second rounding site is the defect: two sites drift, invisibly, until a
  customer reads two different numbers for one kitchen. Rounding is presentation and lives only in the
  web app; the domain's `pricing/` keeps exact integer minor units and never rounds.
- **Related, recorded.** [ADR 0092](0092-hardware-prices-three-mechanisms-and-a-sink-carries-two-extras.md)
  decision 12 covers the *De la* claim, not this. The same rule is a criterion in
  `docs/milestones/M6-price-and-global-settings.md` (a plan, not a decision record).
- **Where.** `apps/web/src/price/starting-price.ts`; `apps/web/src/price/price-breakdown-model.ts`.
