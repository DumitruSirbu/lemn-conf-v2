# ADR 0150 — The submission contract is one I/O-free definition: a request holds no price, reads only what the sender wrote, and the snapshot and the review share one refusal rule

Status: Accepted. The bounds in decision 2 and the format-character ruling in decision 3 are the architect's, open to the
owner; the phone rule (decision 1) carries the owner's words.
Date: 2026-10-08
Type: Decision
Milestone: M8 wave 8H (the submission contract)

The record was written by the documentation scribe from `docs/milestones/M8-review-contact-success.md` (wave 8H: *S1's
readings*; *S2's readings and the locale*; *S3, restated*; *S3 as built*; *adjudication of QA*; *the three reviews*; and
*The owner's answers of 2026-10-08*) and from the coordinator's close-out hand-over. The scribe has no shell and ran
nothing; the one-line read of code signatures in decisions 1 to 6 is a reading of `packages/configurator-domain/src/contact/`
only. Tiers: **[doc]** quoted from a record in this repository, **[src]** read in the code by the plan's author, a
reviewer or the scribe, **[inf]** inference. Every figure says who ran it. Cited in code as `see ADR 0150`
(`contact/contact-fields.ts`, `phone-number.ts`, `contact-submission.ts`, `submission-eligibility.ts`, and
`apps/web/tests/review/review-pricing-failure-stays-unseen.test.ts`).
**Annotated 2026-10-08 (tests-review fix-up, ADR 0152):** that file was deleted in the cleanup (review row 1544). Its
behaviour is held by three tests in the `qa-8h` review files, "holds no pricing failure code…", "is…the same value whatever
the failure said" and "reviews kitchens that draw each of the three refusals" [relayed by the coordinator; the file's
absence was checked with Glob, the three titles were not]. The `see ADR 0150` pointer in the deleted file went with it.

## Context

Wave 8H defines, in the I/O-free domain package, what a contact request is, so that the form and the server judge it
by one definition: the fields, the request around them, and the snapshot a stored request will hold. Nothing uses it yet
(no route, store or mail). Most rules were ruled only in the plan, through three review rounds in which two of the
architect's own criteria, the order of the text check, caused the two must-fix defects. The plan is archived when M8
closes, and a later reader would take several of these rules for oversights: the quadratic-cost ordering, the refused
second zero, the snapshot that does not hold a design to the catalogue's rules.

## Decision

### 1. The contact fields, their codes, and the phone rule

`contact-fields.ts` validates name, phone and its E.164 normal form, locality, channel, a conditional e-mail, consent and
the consent text's version. **Each failure is a code, never a sentence, and never a value or a count** (ADR 0095; ADR
0108 d3). The codes are `REQUIRED`, `NOT_TEXT`, `TOO_LONG`, `FORBIDDEN_CHARACTER`, `MALFORMED`, the phone codes below,
`UNKNOWN_CHANNEL`, `CONSENT_NOT_GIVEN` and `UNKNOWN_CONSENT_TEXT_VERSION` [src `contact-fields.ts:43-52`]. Every failing
field is reported once.

**Bounds** (in code points, after trimming; exported constants, 8I's columns and 8L's inputs take the same ones, never a
second literal): name 100, locality 100, e-mail 254, phone as typed 32 [src `contact-fields.ts:14-21`]. **None of the
bounds is in an earlier record; they are the architect's reading, confirmed in the plan** (S1 readings 2 and 5), and
fifteen digits for an international number is E.164's ceiling and seven a judgement of the shortest in use [inf: nobody
read the standard here]. Locality may be empty and the e-mail is required exactly when the channel is e-mail (Q6, both
answered). With another channel an e-mail is neither judged nor carried: the customer did not ask for it to be used and
it is not kept.

**The phone rule.** A Moldovan number is `0` or `+373` then exactly eight digits, the first of which is not `0`. Any
other number must be written with `+` and has seven to fifteen digits. Grouping characters, which change nothing, are
**any Unicode space separator (Zs), any dash (Pd) and round brackets**; a dot, `00373…`, `+373 (0)…` and eight bare digits
are refused. Six refusal codes tell the Moldovan form from the international one, because frame 4B's sentence *"Așteptăm
8 cifre după prefix"* is true of the first and false of the second: `PHONE_MOLDOVAN_INCOMPLETE`,
`PHONE_MOLDOVAN_TOO_MANY_DIGITS`, `PHONE_MOLDOVAN_SECOND_ZERO`, `PHONE_INTERNATIONAL_INCOMPLETE`,
`PHONE_INTERNATIONAL_TOO_MANY_DIGITS`, `PHONE_FORMAT_UNRECOGNISED` [src `phone-number.ts:31-37`].

- **Q33, the owner's, 2026-10-08.** He gave the example *"069010101"*; the coordinator then put a reading to him (accept
  only `0` and eight digits, or `+373` and eight, with spaces, dashes or brackets; keep refusing dots, `00373…`,
  `+373 (0)…` and eight bare digits) and he answered *"Yes"* [relayed]. **The four spellings stay refused; the architect's
  recommendation to accept them was not taken.** Zs and Pd as grouping are the architect's readings of *"spaces"* and
  *"dashes"* (the owner named a kind), not put to him [inf]. A minus sign is not a dash (Pd) and stays refused.
- **The leading zero (criterion 16, then 22).** Asked whether no Moldovan number's eight digits begin with 0, the owner
  first said *"All number in Moldova start with an 0 mobile or fix numbers"*, which speaks of the prefix and not of the
  first of the eight. Asked again, he said *"no there is no number 00x xxx xxx , only one 0 at start"* [relayed]. The two
  sentences are kept in the order given because the first did not say it and the second does. **Tier: the owner's word,
  with the architect's inference** that a number with its own leading 0 would be written with two, and two zeros is how a
  call abroad begins **[inf: no record states Moldova's numbering plan and nobody read it]**. *Not ruled and not asked:*
  which other first digits exist. A second 0 has its own code, `PHONE_MOLDOVAN_SECOND_ZERO`, judged **before the count**,
  at any length, since a number so begun can be completed by nothing: it is neither *incomplete* nor *too many*. The
  sentence for it is a new leaf, the owner's copy, in 8L.
- **For 8L:** a Romanian number typed as at home, *"0722 123 456"*, is read as a Moldovan number with too many digits;
  its sentence says how to write a number from outside Moldova. A lone `+` shows no refusal while the customer types.

### 2. Text: one order, and why each step stands where it does

For every typed text field, in this order (criterion 21) [src `input-checks.ts`, `readTypedText`]:

1. **Ill-formed text is refused on the value as it arrived** (`NOT_TEXT`), with nothing removed first.
2. **Format characters (Cf) are removed.**
3. **A value still longer than eight times its field's bound is `TOO_LONG` here.**
4. It is composed to **NFC**, checked for forbidden characters (Cc, Cs, Zl, Zp, and Cf by any route), trimmed and
   measured.

Each position closes a defect that the order first written down caused, and both came from the architect's criteria, which
the implementer built as written:

- **Step 1 before step 2 (L-R1.1, S-R1.2).** Criterion 10 had format characters removed "before anything else". A value
  that is not well-formed text, with its two surrogate halves split by a format character, passed the removal, became
  well-formed, and held an invisible character, against the criterion's own *"no stored value holds one"* [both reviewers
  ran it, relayed].
- **Step 3 before step 4 (S-R1.1).** Criterion 19 had the text composed "before it is measured". Composing reorders a run of
  combining marks in time quadratic in its length: **a million units took 234 seconds** [security reviewer-run, Node 24,
  relayed], and the endpoint will run this before any limit has counted the request. The eighth-fold ceiling is a named
  datum; the reviewer proposed eight and the architect took it, and the security re-check showed it to be the ceiling.
  *Must not:* a step that costs more than the value's length runs before step 3.
- **Why format characters are removed and not refused (criterion 10).** A number copied from a contact card or a spreadsheet
  often carries direction marks, and a copied place name a soft hyphen [inf, unmeasured]. Refused, the customer is told a
  character is forbidden in a value that looks right and cannot find it. Removed, the danger the refusal guarded against
  (a direction override reordering a line in the shop's mail) is gone with it. *The cost, named:* a joiner that a few
  scripts spell with is removed too and such a name is stored slightly misspelt. **The architect's ruling, open to the
  owner.**
- **NFC, not NFKC (criterion 19).** A hundred letters are a hundred however the keyboard built them. The compatibility
  form would change letters the customer chose.
- *Everything a returned value holds* satisfies: it contains none of the five forbidden kinds by any route, and validating
  a returned value gives that value again. Both are properties over arbitrary sequences of UTF-16 units, not only of whole
  characters, which is the difference an earlier sweep could not see.

**The consent text's version (criterion 11).** The client states it, since only the page knows what it showed and a
server that stamped its own would record the wrong one for a tab left open across a deploy. It is one of a **closed set
declared in the domain**, today one member, `"placeholder"`, and one outside it has its own code. The set is matched
exactly, with no trimming (F6; reading 8c ruled the same for the channel). A member is never removed once a submission
could carry it. *For the launch gate:* Q7 (b)'s line is that no page sends the placeholder.

### 3. The request

`contact-submission.ts` validates the request: the contact fields, a design reference **xor** an intent, a client request
id, a locale, whether the honeypot was filled, and the elapsed time [src `contact-submission.ts:44-94`].

- **A design reference or an intent, exactly one.** `{id, revision}` in the shapes the domain and the store give them, or
  no design and an intent from a closed set whose one member is the callback (`"callback"`, Q12 (i)). `design: null` is
  refused. Codes `DESIGN_AND_INTENT_BOTH`, `DESIGN_OR_INTENT_MISSING`, `UNKNOWN_INTENT`.
- **Strict at three levels, and `UNKNOWN_FIELD` names the level and never the key.** The request, the contact fields and
  the design reference each refuse a field they do not know. A request carrying a total, a line or a book version is
  therefore refused: **there is no price field (D6), by type and by test.**
- **Own properties only (criterion 17, F2).** Every field is read as the object's own property, and the check is in
  `validateContactFields` itself, since the form calls it without the request around it. Before the fix a consent, a
  channel or a locality could be accepted from anything the body did not hold, behind a comment and a test that claimed
  otherwise.
- **The locale is a parameter with no default (criterion 12).** `validateContactSubmission` takes the locales the
  application serves; 8K and the form both pass `routing.locales` [src `apps/web/src/i18n/routing.ts:4`]. The domain knows
  no language (ADR 0095). *Must not:* a default (that would be the second list); an empty list is accepted (it throws).
- **No ceiling on `elapsedMs` (criterion 13).** It is any non-negative whole number a JSON number holds exactly. A day's
  ceiling would refuse the customer who left a tab open, with a refusal no sentence can explain. What is too fast is 8K's;
  the package reads no clock.
- **The honeypot is a yes or no (criterion 23, S-R1.3).** The body may hold text there, bounded at 256 code points and read
  for its length only; the validated request carries `isHoneypotFilled` and never the text. What a yes means is 8K's (D9).
- **The client request id** is 16 to 64 of `A-Za-z0-9_-`. It proves nothing, since the client chooses it: one id with
  another body is a conflict and never an answer, which 8I's keyed payload digest says.
- **One home for the id's shape.** `isDesignId` beside `DesignId` in `repository.ts` is the domain's statement of what the
  generator makes, answering yes or no; the request uses it, a test in persistence holds the generator to it, and 8L S2's
  shared owned load calls it and writes no shape of its own. The revision's home stays persistence's `isDesignRevision`
  (which carries the reason the token is a string); the domain's exported `isDesignRevisionShape` is a second statement,
  **tied by a persistence property: for any string the two give one answer.** Merging them is persistence's change, not
  this wave's.

### 4. The refusal rule has one home, and takes the fit query's answer as input

`judgeSubmissionEligibility` (`submission-eligibility.ts`) is ADR 0148's three refusals in its order (a body past its
wall, naming exactly the fit query's list; nothing Lemnaria supplies; a price that cannot be computed), moved from the web
into the domain so that **the screen cannot offer what the endpoint refuses** (criterion 7). The review calls it.

- **The rule is handed the fit query's answer and does not ask it** [src `submission-eligibility.ts:34-47`, accepted in
  *S3 as built*]. "Written twice" meant the decision, and that is one function; the query is one function with callers that
  each put the same question. The reason given was sound: a rule that called the query inside the built package would not
  pass through QA's replacement of it, and `qa-8c-fit-is-the-querys-answer` would go red for how it looks and not for what
  it checks.
- **Criterion 18: it throws on facts that cannot all be true** (`SubmissionFactsContradictionError`). The list handed in
  must name only bodies the design holds and, where the design was priced, equal the price's own list as a set (order is
  not compared). So *allowed* means the price itself found no body past a wall. The review checks its own inputs first, so
  its error is the one thrown, as 8C's files expect.
- **Criterion 14: on the server only `snapshotSubmission` puts the facts together**, from one design. *Must not:* 8K, or
  anything answering a request, calls the rule with a list of its own making.
- **`PRICING_FAILED` carries its cause (criterion 15)**, the failure as `priceDesign` returned it, so the endpoint can log
  it: a price that cannot be computed is a defect in a book or the catalogue, and a customer who meets it has lost a request
  through no act of theirs. It holds design data and no contact field. *Must not:* the review prints any of it; the review's
  refusal is a code and no bodies, whatever the failure said.
- **What to draw is not what to refuse (C-R1.1).** Whether there is a figure to show is the review's own question, asked
  with the same predicate (`holdsNothingLemnariaSupplies`) defined once and imported. A kitchen with a body past its wall
  that supplies nothing is refused for the wall and has nothing to draw; both are right. The review's behaviour is as at
  `aac86d6` [logic reviewer, relayed].
- The web price module no longer re-exports the supplier predicate; its one test moved into the domain's.

### 5. The snapshot is `{document, priced}` and parses the wire schema

`snapshotSubmission` returns the canonical document and the priced design **as `priceDesign` returned it** (every line, the
exact total, the currency, the book's version and what the book says of itself), or a refusal. Nothing is re-derived or
rounded, and it holds no contact field and no figure that was shown. It is priced with the design's own settings, which is
what every price surface passes [src `apps/web/src/price/use-priced-design.ts:89, 113`], and the request's type leaves the
server no way to pass others.

**Criterion 20: it parses before it prices.** The snapshot is kept for good and nothing re-prices it, so it does not rest on
what its caller validated. A value that is not a design **throws** (`SubmissionDesignInvalidError`); it is not a fourth
refusal, since no customer can mend it. **It parses the wire schema and not the catalogue's rules** (L-R1.9). The reason:
the review does not hold a design to the catalogue's rules either, so a snapshot that did would refuse what the screen
offers, which criterion 7 forbids. *Trigger (ADR 0118):* the review gains that check; then both gain it together.

### 6. Rejected

- **The rule asking the fit query itself.** Above: it would turn 8C's files red for the wrong reason.
- **The rule checking the list against the price on its own, before the review's check.** It would throw ahead of the
  review's own error and turn 8C's files red for the same reason.
- **One shape for a field's result and a request's result (C-R1.3, half).** A field has one code and a request has a list;
  one shape for both would hide that. The text check and the counting are written once.
- **The locale as a default, or the list read from the web (options b, c).** A web-owned list would make routing depend on
  the domain for something only the web uses; a second list would judge one request in two places.
- **Accepting Q33's four spellings.** The architect recommended it, since each has one reading; the owner did not take it.
- **A day's ceiling on `elapsedMs`; a fixed multiple of the bound dropped.** Above.
- **Composing with NFKC.** Above.
- **Refusing format characters.** Above.
- **The honeypot text carried, with a promise that 8K never stores it.** A promise by type is better.
- **Re-pricing in the snapshot; rounding in the snapshot.** Nothing is re-derived and a rounded amount is a screen's.

## Limits recorded, not fixed (ADR 0118)

Each with its trigger.

- **The "another kitchen's price" gap (QA 14; logic point 4).** The rule checks the fact it decides on, not whose price it
  is; the snapshot knows by making it and the review by its own check. *Trigger:* a third caller of the rule.
- **A name of invisible characters that are not format characters passes (F5).** The phone is what the shop calls and it is
  sound. *Trigger:* the shop receives a request with a blank name.
- **Symbol and non-enumerable keys are not seen (F7).** The input is JSON's, which has neither. No action.
- **A non-ASCII e-mail address is refused** (`z.email()` after the length check). *Trigger:* a customer reports a refused
  address; the customer with one can choose the phone.
- **Padding counts toward the eighth-fold bound.** Recorded by the coordinator's hand-over without the reviewers' wording;
  the scribe read no reviewer report, so the mechanism is not restated beyond step 3 of decision 2.
- **A lone `+`, and a leading dash.** Both were named in the hand-over as recorded limits; the scribe did not read the
  reviewers' reports and does not restate how each behaves. See the plan's *the three reviews* and the phone file.
- **The phone as typed may hold a right-to-left dash, which is a dash (Pd).** The as-typed text must not be shown in a mail
  or a screen that can reorder it: **show `phoneNormalForm`, never the as-typed text.** The behaviour of a bidi dash in a
  mail client is inference, not seen.
- **The 300-unit cut can split a pair** (from the hand-over; the cut is the bound on a failure's reason, and the plan has
  8K bound the failure's detail before it is logged).
- **F8, an object from another realm is not a plain object.** It errs toward refusing. 8K's test posts a real request
  through the route and must get past it.
- **F9, F10 (a served list holding `""`; `-0` carried)** need no action: the list is the application's constant and `-0`
  leaves as `0` in JSON.
- **F12, the revision shape admits nineteen digits, past a bigint column's range.** Persistence's. The two predicates are
  tied; narrowing one alone breaks the tie. *For 8K:* a revision the column cannot hold is a mismatch, a refusal and not a
  failure. Backlog 143.
- **Whether every stored design has the generator's shape is not measured.** A page that refuses by shape would close an
  older design's link. The owner counts the live ids once, a count and no value, before 8L S2 ships (backlog 146).
- **No route, store or mail uses this code yet.**

## What later waves inherit

- **8I:** the conflict digest covers every stored and mailed field of the **validated** request and leaves out the elapsed
  time and the honeypot; one pure function beside the request's type says so, and a test fails when the type gains a field
  that the function neither covers nor names as left out. The id column compares byte for byte. The digest is keyed; see
  *The digest secret* in the plan and ADR 0149's amendment of 2026-10-08. **8I is unblocked and never touches the secret.**
  *(Note, 2026-10-09: 8I is built. The store takes `payload_digest` as a value handed in and holds no secret; the covering
  function stays 8K's. [ADR 0153](0153-a-contact-request-is-stored-once-apart-from-designs-the-application-role-reads-none-of-its-personal-columns-and-code-refuses-before-the-server-what-the-table-would-refuse.md).)*
- **8J:** a customer's text appears only in the plain-text body, one value to a line behind a fixed label, and never in a
  header; a name may be a link or a spreadsheet formula and the mail does nothing to make either live; the key sent is a
  fixed prefix and the id; its criterion 8 speaks of *"a 409"* and there are two, restated at that wave's dispatch; every
  price is provisional, so the mail does not word the figure as an offer and its words are the owner's. **Resend**
  [ven, the security reviewer fetched the page on 2026-10-08, relayed]: an Idempotency-Key may be *"up to 256 characters"*,
  so sixty-four fit, and there are two `409` answers (`invalid_idempotent_request`, `concurrent_idempotent_requests`), one
  no retry mends and one a retry does.
- **8K:** its own small limit on the body before it is parsed; a conflict answers one code with no reference and nothing of
  whether a notice was sent; the digest is compared before the notifier is called; attempts per id are capped; a pricing
  failure whose cause is a version mismatch raises an alert, and the failure's detail is bounded before it is logged; F8
  and F12; criterion 14.
- **8L:** it mints the request id with the platform's random UUID; shows no refusal for a lone `+` while the customer types;
  owns the new leaf of criterion 22; calls the domain's `isDesignId` in the shared owned load (8L S2) and writes no shape of
  its own.
- **Any export of contact data** neutralises a leading `=`, `+`, `-` or `@` (backlog 144; ADR 0012 has no export today).

## Evidence

- **[coordinator-run]** at `2b8c60b`: domain typecheck exit 0, lint exit 0, tests 300 files, 7857 passed; web typecheck exit
  0; no `qa-*` file in the diff. At `85465d6`: web lint 0, typecheck 0, vitest 335 files, 6227 passed. At `fd2c958`: **one**
  web-suite run showed 1 failed of 6227 (exit 1) and which test was not captured; four runs straight after were 6227
  passed. **An unidentified intermittent failure, seen once in five runs** (backlog 145).
- **[QA-run, m8-8h-qa]** Round 1 red on two defects (F1 phone, F2 prototype read), five tests; round 2 green, criteria 14 to
  20; round 3 green, criteria 21 to 23. The parity property (the snapshot is refused exactly when the review's call to action
  is, with the same code and bodies) had zero disagreements; per arm, judged / allowed / `PRICING_FAILED` / `NO_CABINET` /
  bodies past a wall: straight 2355 / 94 / 564 / 287 / 1410; L 2425 / 88 / 528 / 269 / 1540; right-hand L the same as L; U
  2400 / 87 / 522 / 266 / 1525, **identical in rounds 2 and 3**. The hand-summed literal 53 500 was re-derived by QA, and two
  totals against the shipped book with sums shown (530 560 and 530 260). Timing after the fix: the worst still-composed input
  about 1 ms, one million units 4 to 5 ms; before the fix the developer measured 2356 ms at 100 000 units and the security
  reviewer 234 s at one million.
- **[reviewers, at `62ed5bc`]** Logic: one must-fix (surrogate halves split by a format character reunite into an invisible
  character), one should-fix. Clean-code: no must-fix, six should-fix, and it read no test. Security (scoped): one must-fix
  (quadratic composition before any bound), one should-fix.
- **[reviewers' re-checks, at `fd2c958`]** Logic closed all five (its own probes and a sweep of about 1.1 million
  "incomplete" answers each with an accepted completion). Security closed all four (its own probes; 400 000 random
  sequences, none accepted holding a forbidden character; eight shown to be the ceiling). Clean-code closed its items, read the
  implementer's tests (eight files fully, five in part) and found three should-fix in tests.
- **Not re-read:** those three test items were applied in `2b8c60b`, a cleanup with no behaviour change, **which no reviewer
  has re-read.**
- **Commits, `m8-review-contact-success`, not pushed** [coordinator ran `git log`, HEAD `2b8c60b`]: `aecacbd` S1; `e135d52`
  S1 follow-up; `8da0e6a` S2; `a9e1843` S2 follow-up; `8539f66` S3; `4a37d56` QA round 1; `1bd2e80` fix A; `928b443` fix B;
  `62ed5bc` QA round 2; `57cb8ea` review round A; `85465d6` review round B; `fd2c958` QA round 3; `2b8c60b` clean-code cleanup.
- **Not run / not proven:** nothing on a CI runner; `pnpm check`, `pnpm ci:local` and e2e were not run at `2b8c60b`. The
  intermittent web failure is unidentified. Which first digits Moldovan numbers use beyond "not 0" was not asked. A bidi dash
  in a mail client is inference.
