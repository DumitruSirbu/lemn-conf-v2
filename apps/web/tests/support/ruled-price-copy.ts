// **The ruled facts about price copy that a pattern cannot derive, and why each one is ruled.**
//
// Two of them, both by identity: the sentences a sum-word check is not allowed to judge, and — since
// wave 6B-g — the one leaf that is allowed to name the currency.
//
// One list, read by every guard that needs one, so the rule has a single exception set rather than a
// copy per file that can drift. It lives here rather than inside `starting-price.adversarial.test.ts`
// — where the rule it belongs to is enforced — for a mechanical reason only: Vitest registers
// `describe` blocks into whichever file is collecting, so importing that file from another test
// would re-run its whole suite under the importer.
//
// **The distinction the list exists to record.** The sweep hunts an *equality claim* — a surface
// telling a customer that the rounded lines add up to the rounded total. Each sentence below uses a
// sum word to assert the exact opposite:
//
// - *"suma finală se stabilește după măsurare"* — no sum here is final.
// A keyword pattern cannot draw that distinction and a human has to record it.
//
// **Excluded by identity, never by pattern and never by section.** Any other use of *suma*, *sume*,
// *sumele*, *total*, *adun*, *egal*, `+` or `=` in price copy still fails, including inside the
// breakdown's own section. And because the exclusion is an exact string, re-wording the sentence
// stops it matching, the sweep judges it again, and the pin below says which line to update — which
// is precisely when changed owner copy should make somebody look.
//
/** Gate O1's accepted disclaimer, verbatim. The accepted footnote contains no sum-family word and
 * therefore needs no exception. */
export const RULED_TO_CONTAIN_A_SUM_WORD = [
  "Prețul afișat este estimativ. Nu include transport, blat sau electrocasnice — suma finală se stabilește după măsurare.",
];

/**
 * **The words an equality claim is written with.** Defined once, so the two axes that assert this
 * rule cannot drift about what they are looking for.
 */
export const SUM_CLAIM_WORDS = /total|sum[aăe]|adun|egal/i;

/**
 * The words **plus the arithmetic signs**, which is what a sweep over authored copy refuses.
 *
 * **The signs belong to the copy axis only, and that is a finding rather than a convenience.** A
 * `+` or an `=` written into `ro.*` is somebody authoring arithmetic into a label, which is always
 * wrong. A `+` on the *rendered* surface is not the same event: the catalogue ships a body called
 * **"Coloană cuptor + microunde"**, so the seeded kitchen puts a legitimate plus sign on the page,
 * supplied by the projection and not by any price copy. Sweeping rendered output for `\+` reports
 * that cabinet as an equality claim — it did, the first time this was run.
 *
 * So the rendered-output guard reads `SUM_CLAIM_WORDS` and this one adds the signs. The shared word
 * list is what keeps them one rule; the difference between them is a real difference between what a
 * copy module may contain and what a surface may show.
 */
export const SUM_CLAIM_PATTERN = new RegExp(
  `${SUM_CLAIM_WORDS.source}|\\+|=`,
  "i",
);

/**
 * **The one message leaf a currency code is ruled to appear in**, and the only place in the product
 * a currency and an amount are joined.
 *
 * Until wave 6B-g the join was a template literal in `price/starting-price.ts` —
 * `` `${amount} ${PRICE_BOOK_CURRENCY}` `` — which wrote a word order and a currency name into
 * TypeScript. ADR 0095 Amendment C moved it here instead of reaching for `Intl.NumberFormat`, whose
 * measured output (`"143.000"` under `ro`, `"L"` under `ro-MD`) contradicts the mockups.
 *
 * **Recorded by identity in this shared module rather than inside a test**, for the reason the sum
 * list above is: the guards that assert "the currency is not written into a module" and "the
 * currency *is* in the catalogue" are two halves of one rule, and a second spelling of the key is
 * how one half comes to be asserted about a leaf the other half no longer names.
 */
export const RULED_TO_CARRY_THE_CURRENCY = "price.amountWithCurrency";

/**
 * `PRICE_BOOK_CURRENCY`'s value, re-spelled here rather than imported: a guard that asked the price
 * book what the currency is would agree with it by construction, including after somebody changed
 * it. The constant itself lives in the price book — see `price/starting-price.ts`'s note on where
 * that home comes from.
 *
 * **The two spellings differ on purpose, and a sweep that unified them would be a regression.**
 *
 * - The **negative** sweep — *"no module writes the currency into a string of its own"* — reads this
 *   literal. Derived from the book it would chase a changed value: set the book to `EUR` and a
 *   module still holding `"MDL"` stops being looked for.
 * - The **positive** case — *"the ruled leaf is spelled with the currency the book declares"* —
 *   imports `PRICE_BOOK_CURRENCY` instead, and has to. It is the only thing in the product coupling
 *   the catalogue's word to the book's; asserted against this literal it would prove nothing, and a
 *   `EUR` book would go on rendering `43 000 MDL` with every price test green. Both cases live in
 *   `tests/price/starting-price.adversarial.test.ts`, adjacent, for that reason.
 */
export const RULED_CURRENCY_CODE = "MDL";
