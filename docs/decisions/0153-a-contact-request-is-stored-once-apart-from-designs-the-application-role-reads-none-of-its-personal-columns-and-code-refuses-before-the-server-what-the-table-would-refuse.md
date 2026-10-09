# ADR 0153 — A contact request is stored once, apart from designs; the application's role reads none of its personal columns; and code refuses before the server what the table would refuse

Status: Accepted. **Decision 1 (the grant is narrower than the owner's Q14 (i) answer), decision 7 (the stopping rules) and the
reference's look (decision 5) are the architect's rulings and open to the owner.** The owner has not yet applied `0008` or issued
the grant.
Date: 2026-10-09
Type: Decision
Milestone: M8 wave 8I (the contact submissions store)

The record was written by the documentation scribe from `docs/milestones/M8-review-contact-success.md` (wave 8I: *S0's figures,
and S1 restated for dispatch*; *the security read of `0008`*; *adjudication of QA* and *round 2*; *the three reviews*; *QA pass
4's finding*; *review round 2*, whose end lists what this record must hold) and from the coordinator's close-out hand-over. The
scribe has no shell and ran nothing. Tiers: **[doc]** quoted from a record in this repository, **[src]** read in the code by the
plan's author or a reviewer, **[inf]** inference, with what would falsify it. Every figure says who ran it. Nothing under `apps/`
uses the store yet.

## Context

A contact request (wave 8H, [ADR 0150](0150-the-submission-contract-is-one-io-free-definition-a-request-holds-no-price-reads-only-what-the-sender-wrote-and-the-snapshot-and-the-review-share-one-refusal-rule.md))
must be stored once however often it is sent, apart from designs, and the running application must not be able to read it
back: a leaked `DATABASE_URL` should show that requests exist and nothing of who sent them. The owner's Q14 (i) had approved
`INSERT`, and `SELECT` and `UPDATE` on the seven non-personal columns. Wave 8I built the table (migration `0008`), a port with a
Neon store and a fake, and a check that refuses in code what the table would refuse. It ran six QA passes and three reviews,
and several of the rules below were found by an attack and not planned. The plan is archived when M8 closes.

## Decisions

### 1. The grant is narrower than the owner's Q14 (i) answer: `UPDATE` on `notified_at` alone. The architect's ruling, inside the owner's answer as its ceiling, and open to the owner

Q14 (i) as answered: `INSERT`, and `SELECT` and `UPDATE` on the seven non-personal columns. **Narrowed: `UPDATE`, from the
seven to `notified_at` alone.** `INSERT` and `SELECT` are as answered. Nothing is added. The statements the owner issues, after
`0008`, [doc plan, *S0's figures*, R1]:

```sql
GRANT INSERT ON TABLE public.contact_submissions TO app_designs;
GRANT SELECT (
    reference, client_request_id, design_id, design_revision, payload_digest, created_at, notified_at
  ) ON TABLE public.contact_submissions TO app_designs;
GRANT UPDATE (notified_at) ON TABLE public.contact_submissions TO app_designs;
```

Not `ALL`, not `WITH GRANT OPTION`, nothing to `PUBLIC`, no table-wide `SELECT`, `UPDATE` or `DELETE`.

- *Why.* (a) With the wider privilege a leaked credential makes a stored request answer another reference, or makes a changed
  payload read as the same one (S0 probes 52 to 54 and 59 [developer-run]). (b) *"Grant it when a feature actually needs it"*
  [doc ADR 0008]; after the insert the store writes one column. (c) The plan said both on one day: Q14's parenthesis lists what is
  non-personal and was read for both verbs, while criterion 3 allowed `notified_at` only.
- *Inside or outside the answer.* Every privilege in the narrower set is one the owner approved, so issuing it goes past nothing
  he said. **It is not the set he was shown, and he is told so in words when he is asked to issue it.**
- **Widening it is gated on a probe.** The security reader's S-R1.1 [inference, unmeasured, from the executor's source]: under
  the wider grant an upsert that set a stored digest to a bad value would fail the digest's check, and the error's `DETAIL`
  would show the **stored** row's name, phone and e-mail. *Were the wider set ever asked for, a rolled-back probe in S0's form
  comes first, with stored and proposed personal values that differ.* **A rule for every later migration of this table: no
  constraint reads a column the role may `UPDATE`.** Today that column is `notified_at` and no check names it [src `0008`].
  A test fails when a migration after `0008` names the table, and its message points at this rule.
- *Not taken.* The grant as worded. Narrowing `SELECT` too, to the four columns the statements read: not measured under exactly
  four, and 8K may need the row's age for the provider's day-long key.

### 2. The insert is `do update` that changes nothing, written with its conflict target

One statement answers new, replay and conflict (S0 probes 06 to 08 [developer-run]); `do nothing` with a read is not taken. The
reason, quoted by the logic reader from the PostgreSQL 18 `INSERT` and transaction-isolation pages [relayed]: `do update` gives an
atomic insert-or-update outcome under concurrency. A `do nothing` whose read is in the same statement reads at the statement's
snapshot, so a twin that commits after it began is skipped by the insert and unseen by the read [inf, not measured]. Every
`on conflict` writes its target, the client request id alone (an untargeted one answers no row and no error for a duplicate,
probe 15). Every `returning`, `where` and `set` names only granted columns; `returning *` and `xmax` are refused (probes 11 to 13,
21). *Cost, accepted:* a replay writes a new version of an unchanged row; it happens only when a twin lands between the lookup
and the record, or when a statement is repeated (ADR 0145).

### 3. A failure is built and classified once, and nothing a driver threw leaves the store (ADR 0146 B3 applied)

A driver's error carries the row: the `DETAIL` of a `23514` holds every value the statement sent, and a `23505` holds the key
(probes 22, 23, 10 [developer-run]; the 23514 probes ran as the scratch role). So every failure leaves as one store error whose
cause is the type name and the SQLSTATE and nothing else, and the store logs nothing. A failure is classified once, where it is
caught: the upsert's translator answers the reference's collision as a value, and the lookup and the mark have no pass-through,
so no caught driver error is thrown again anywhere in the module. A reply is read inside the attempt, and a row that throws when
read is the store error with no cause. The check's catches ask a caught value nothing but whether it is one of the check's own
refusals, by identity (a `WeakSet` consults no trap [inf, the reviewer's, not run]); a thrown proxy whose every trap throws is the
refusal of the request. [src `neon-contact-submission-store.ts`, `contact-submission-refusal.ts`]

### 4. *New* is the stored reference equalling this call's proposal; a collision draws again; whether to send is decided on *notified*, never on *new*

A proposal is drawn fresh for each call from forty random bits, so a replay's proposal equals the stored reference once in 2^40
[inf]. A repeated statement (ADR 0145) re-sends the same proposal, so a call whose first attempt landed still answers *new*, which
the lost-first-reply proof requires; no granted column could say more. A transient repeat re-sends the proposal and a collision
(SQLSTATE `23505` **and** the constraint `contact_submissions_reference_is_unique`, read for the comparison and not copied) draws
a new one, at most three, then the store error: three collisions in forty bits is a broken generator, which should be seen. The
fake draws exactly when the Neon store draws and answers by the same comparison.

### 5. The table, the port and the reference

- **`contact_submissions`**, 18 columns and 8 named constraints (the primary key on `client_request_id`, the reference's
  uniqueness, three column checks, three table checks) [doc plan; the count is the runbook's check]. The role reads seven
  columns: `client_request_id`, `reference`, `design_id`, `design_revision`, `payload_digest`, `created_at`, `notified_at`. It
  writes once and reads none of `name`, `phone`, `phone_normal_form`, `locality`, `channel`, `email` (personal) and
  `consent_text_version`, `locale`, `intent`, `design_document`, `priced` (not personal, not granted for reading).
- **No foreign key** to `designs`: a cascade would delete a lead with its design, a restriction would refuse the owner's manual
  delete, and the row holds its own snapshot. No shape check on `design_id` (backlog 146).
- **Three table checks**, each reading only non-personal columns: exactly one of a design id and an intent; the revision, the
  document and the price present exactly when the design id is; and (added before the file froze, S-R1.3) both snapshots are
  JSON objects, since a document encoded twice arrives as a JSON string and would sit unseen in a column the role cannot read
  back. A callback's two nulls pass it [inf, recalled; the contract suite stores a callback on the test database].
- **`jsonb`**, and the header no longer says *canonical*: `jsonb` keeps content and not bytes, as `designs.document` does
  (S-R1.2). The digest covers the request and not the snapshot.
- **Criterion 9: nothing the database or the package computes is derived from a personal column.** No hash, no generated column,
  no index expression, no function but `now()` and `jsonb_typeof` on the two snapshots; no uniqueness rule includes a personal
  column (S0 probe 64: it would tell the role whether an address is stored). `payload_digest` is handed in by the caller, made
  under the secret outside the database; the store holds no secret and reads no variable but its connection.
- **The port has three operations and nothing that returns a personal field, the snapshot, a list or a count; no delete:** the
  lookup (absent; stored with the reference and whether notified; conflict), record (stored with the reference, whether new,
  whether notified; or conflict) and mark notified (a second mark keeps the first instant; no such row is the store error).
  *Conflict* is an outcome and not an exception, and holds no reference and nothing of whether a notice was sent. The lookup
  writes nothing.
- **The reference is `LM-` and eight characters of `0123456789ABCDEFGHJKMNPQRSTVWXYZ`**, drawn with `nanoid` from nothing else:
  forty bits, no `I`, `L`, `O` or `U`. Frame 5A's four digits cannot be random (a collision likelier than not by about the 120th
  request [inf]). **The look is the architect's and owner-visible** (he sees it on frame 5A and may ask for another at no cost
  to the schema). A test, not the column's check (six to thirty-two characters), holds the generator to its alphabet and length.
  It is a label that opens nothing; the security reader confirmed nothing treats it as a credential. **Must not, in any later
  wave: a page or a route opens anything by a reference alone.** The two reference functions are not exported from the package.

### 6. Code refuses before the server what the table would refuse: a closed list (criterion 12), and its invariant

One check, shared by both stores, with no value in a refusal. It is a **closed list**, because "a value the table would refuse"
has no end (a server refuses for encoding, range, size and depth):

1. what each named constraint of `0008` refuses but the reference's uniqueness, and a revision past `bigint` (above
   9223372036854775807, by value: the domain's shape admits nineteen digits, backlog 143);
2. a value that is not a string, wherever text is sent, before its shape is tested (`sha256-digest.ts` gained that one condition,
   so no string's verdict changes for the other callers);
3. text Postgres cannot hold: a U+0000, or half of a surrogate pair, in any text sent, found by a walk, since in JSON both travel
   as escapes and become the character only once parsed;
4. **a. the document is refused unless it is, character for character, what `JSON.stringify` makes of its own parsed value**, so
   the text handed in, judged and sent are one text (a number a double cannot hold, a key written twice, a needless escape, a
   space: each refused, never rewritten); **b.** the priced design is judged as a value before anything encodes it (plain objects
   and lists, text, finite numbers, booleans, null; an `undefined` member left out; a non-finite number, `bigint`, function,
   symbol, non-plain object, or a hole in a list refused); **c.** both no deeper than 64 levels, refused under their own part name;
5. code's own: a target whose kind says design while it holds none, or holds one while its kind says otherwise (the kind is read
   only as *design* or not, and is not stored: `{ kind: "x", intent }` is stored as an intent); an intent outside the domain's list;
   an empty design id; an e-mail present when the channel is not e-mail, or absent when it is;
6. the part `request`: anything thrown while reading a part's members becomes the refusal "the request must be plain data whose
   members can be read", keeping nothing of what was thrown, as text or as `cause`.

**The invariant:** for any value handed in, the check throws only its own refusal and nothing it throws holds a value. The
exception is the limit below (a price that shares its parts). **Left to the server, answered by the store error:** size, a time
limit, and anything a later server refuses. The fake refuses what the shared check refuses and nothing more, and says it cannot
stand for a server's refusal. *Not taken:* telling from text which numbers survive a double; sending the handed text after judging
the parsed value (two texts, a key judged once and sent twice); a recorded limit for a changed number (the snapshot is kept for
good). *Not in the list, on purpose:* the channel, the locale and the consent version are any storable text; the store is not the
request's second validator.

### 7. Stopping rules (the architect's, open to the owner)

After fix round B a finding in the snapshot's path was fixed inside 8I only if something other than the check's refusal or the
store error leaves a store, a snapshot is stored that differs from what was handed in, or a field's value leaves in an error.
After review round 2 **(the closing rule):** a finding is fixed inside 8I only if a store gives a wrong answer, a field's value
leaves, or something other than the check's refusal or the store error leaves a store. Anything else is recorded below with its
trigger. S-R4.1 (a reply is copied with `Array.from`, so a list whose species answers a proxy is never built through it) and
the line-length fix were dispatched by the coordinator directly under that rule, without a new architect section.

### 8. QA's files are the protection of the check's rules 2 and 3

For rules 2 to 4 as fix round A built them, QA's committed `qa-8i-*` files are accepted as the protection: 17 mutants died there
and nowhere else [relayed, QA-run]. The developer wrote its own tests for round B's lines. *For the test audit:* those files are
the only guard of rules 2 and 3 and are not duplicates of the developer's. Five mutants only the live suite catches are accepted
(what a statement means is proven by running it, and a stubbed driver would restate the SQL); they are unprotected wherever
`TEST_DATABASE_URL` is absent.

## Alternatives not taken

- The grant as worded in Q14 (i), and `SELECT` narrowed to four columns (decision 1).
- `on conflict do nothing` with a read in the same statement or a second one (decision 2).
- `xmax`, or any sign only an insert carries, for *new* (decision 4): it is refused, and would answer *not new* after a lost reply.
- A foreign key to `designs` (decision 5), `text` for the snapshots, a check on a personal column, a generated column, an
  identity or sequence, an index but the two unique ones.
- A random reference with four digits as frame 5A draws it (decision 5).
- Catching the encoder's `RangeError` for depth instead of a bound; four catches for the invariant instead of one (decision 6).
- Refusing a part met twice, to close the limit below: it would refuse no real price, but is a fourth change to a path that has
  had three, and a price comes only from `priceDesign`, which builds a tree.
- Leaving the snapshots-are-objects check to a test of today's store (decision 5): the table's check guards every writer for as
  long as the table lives, and after the freeze adding it costs a migration (S-R1.3).

## Limits recorded, not fixed (ADR 0118)

Each with its trigger.

- **R6, `count(*)` is answered; a leaked `DATABASE_URL` shows requests exist.** Postgres has no privilege to read a column and not
  count its rows, and without `SELECT` on the client request id the insert is refused (probe 65). In full, it shows how many;
  when each came and was notified; each one's reference, design id, revision and keyed digest; and, through `designs`, the kitchen
  as it is now. **Not who, not how to reach them** (probes 28 to 34, 50, 51), **and not the price quoted.** It can add rows and
  **mark a request notified, which stops a retry from notifying the shop.** *Trigger for more:* the delivery milestone's way to see
  a request never notified. R6's additions, each the security reader's: it shows every client request id, and whoever holds one
  can ask the public endpoint whether guessed details are the stored ones (8K counts conflict answers); the same credential can
  **clear or re-date `notified_at`**, so a retry can notify the shop twice once the provider's day-long key has lapsed [inf];
  **add rows of any size with any dates** (`INSERT` is table-wide; `INSERT` on sixteen columns not taken, unmeasured with the
  upsert); **link the requests of one browser** through a design id to `designs.visitor_hash`; **confirm a guessed set of contact
  details if `DIGEST_SECRET` leaks with it** (both are variables of one deployment [inf]). *Trigger for all of these:* the delivery
  milestone's review of what the role holds.
- **L-R1.1, a price that shares its parts is walked for each part and encoded for each path.** The work doubles with each shared
  level: twenty levels return, sixty outlast any caller [relayed, reviewer-run]. A price comes only from `priceDesign`, which builds
  a tree. The invariant holds for every document and every price that is a tree. *Trigger:* a caller that hands over anything but
  `snapshotSubmission`'s result untouched. *The fix then:* a bound on places walked, counted for each path (refuse a part met
  twice).
- **The request is read twice** (S-R3.2): the check reads each member and the statement, or the fake's record, reads it again; a
  member that answers clean once and otherwise the second time is sent unjudged [relayed, reviewer-run]. *Trigger:* a caller that
  hands over anything but plain data. *The fix then:* the check answers the judged values and the statement sends those.
- **A refusal met again:** a member that throws one of the check's own refusals lets it leave as it is. It holds no value. No
  action needed.
- **S-R2.2's residue:** a whole-row name inside a sub-select or the values list would pass the statements test. *Trigger:* a
  statement's text changes. *The fix then:* pin each statement's whole text.
- **The logic reader's L1 and L2**, as their report words them [relayed, not read by the architect]. *Trigger:* theirs.
- **The channel, the locale and the consent version are unchecked here.** The only consent text version in code is
  `"placeholder"` [src `contact-fields.ts:26`]: a launch item (backlog 155).
- **Five mutants only the live suite catches** (decision 8).
- **The boundary gate does not catch a test importing another package's tests by relative path** (C-R1.1, fixed in the one file;
  backlog 156).
- **QA's files were reviewed in excerpts in round 1** (read fully by clean-code in round 2's second pass); six cases QA's files
  restate that the developer's hold (C-R2.9), file sizes (C-R2.7) and other nits wait for **the milestone-close test audit** (ADR
  0152, Amendment A; backlog 157).
- **Left to the server:** size, a time limit, and what a later server refuses.
- **What the provider (Neon) logs of a failed row is not known.** The reason the check refuses before a statement is sent.

## Incident: the test database's migration ledger, 2026-10-08/09

A killed whole-suite run left the **test** database's migration ledger at `1,8`: an existing live test forgot ledger rows 2 to 7
from a hand-kept list that stopped at 7, and the kill came before they were re-applied. The coordinator authorised forgetting
ledger row 8 on the test database only, through the suite's own guarded helper `forgetAppliedMigrations`. The list is now read
from disk (commit `c15c08e`). Ledger after: 1 to 8 [developer-run]. No other database was touched. **Whether such a repair should
wait for the owner is an open question put to the owner.**

## What is unproven until the owner's grant

- Anything as the role `app_designs`: R1's three statements have run nowhere, and the grant test's passing arm has never executed
  (its two skips: the grant tests for `rate_limit_counters` and `contact_submissions` in `application-role-privileges.test.ts`,
  because neither table exists on the database `DATABASE_URL` reaches, preview as `app_designs` [developer-run printed line,
  relayed]).
- The grant with two connections: a role made in an open transaction is invisible to a second connection, and a committed role is
  a provisioned resource no agent makes [inf: a privilege is checked for a statement and does not depend on who else is writing].
- The HTTP driver under the grants, and which fields its errors carry.
- S-R1.1's mechanism (decision 1), and the depth of a design with every optional part set.
- The servers' versions on preview and production.
- That `has_column_privilege` counts a table-wide grant [inf, recalled].

**Owner actions, preview then production** (the runbook, `runbooks/applying-a-table-migration-and-its-application-role-grant.md`):
read `pg_default_acl`; apply `0008`; confirm 18 columns and 8 named constraints; issue decision 1's three statements, **narrower
than Q14 (i)**; run the grant test as the application role and quote its `reached database … as role …` line. Also the
reference's look on frame 5A, the closing rule and the ledger repair above, which are open to the owner. Q34 (the language of the
shop's notice) is 8J's.

## What later waves inherit

- **8K:** *whether to send is decided on* notified*, never on* new. Pass only a validated request, as plain data, and
  `snapshotSubmission`'s result untouched (L-R1.1's trigger). A retry of a request that was stored and not notified rebuilds the
  notice from the live design at the stated revision; if the customer has edited since, or the price book changed, the same bytes
  cannot be rebuilt [inf, from 8J criterion 11 and 8K's order of checks]; reading the stored snapshot back would be a wider grant
  than Q14 and is the owner's. Two calls at once can both see *not notified* and both notify, and only the provider's key stops
  the second message; a notice accepted, a mark failed and a retry past the provider's day notify twice. **A rejected `record` does
  not mean nothing was stored**: a retry goes through the lookup. Over HTTP an answer of *not notified* can arrive after one of
  *notified*. Whoever holds a stored client request id can ask the endpoint whether guessed details are the stored ones, since the
  server makes the digest: **conflict answers are counted.** The store is constructed with no argument and under no flag; a gate
  fails if anything under `apps/web/src` imports the fake; the production wiring passes no proposer. The body's bound is counted
  on bytes read, eight kilobytes being the security reader's figure, for that wave's S0 to rule.
  *Added 2026-10-09 [the 8I developer's handoff, relayed]:* `record`'s snapshot is a separate field and the type does not tie it
  to `target.kind` (the check refuses a design without one and a callback with one), so build both from `snapshotSubmission`'s
  result untouched. The document is sent as handed and the check refuses it unless it is exactly what `JSON.stringify` makes of
  its own parsed value: pass the document string as `snapshotSubmission` produced it, and never re-serialise, pretty-print or
  tidy it. *Already stated above, so not repeated:* `isNew` against *notified*, a rejected `record`, no proposer in production,
  plain data only.
- **8J:** Q34, the language of the shop's notice.
- **Any later migration of this table:** no constraint reads a column the role may `UPDATE`; a test fails until someone has read
  decision 1.
- **A page or a route** opens nothing by a reference alone.
- **The delivery milestone (M9):** the limits under R6, and the consent text (backlog 155).

## Evidence

- **[coordinator-run, at `1bbd08e`, alone]** the whole persistence suite exit 0: 78 files, 2450 passed, 2 skipped; persistence
  typecheck 0, lint 0; root `pnpm format:check` 0; `pnpm gate:boundary` 0.
- **[developer-run, S0, 2026-10-08]** on `lemn-conf-v2-staging`, PostgreSQL 18.6, one transaction rolled back: the idempotent
  insert works under `INSERT` + `SELECT` on the seven non-personal columns + `UPDATE (notified_at)`; `42501` for every read of a
  personal column, `DELETE` and `TRUNCATE`; roles 23 and relations 11 before and after. Before the bytes froze, `0008` was executed
  from disk in a rolled-back transaction: 18 columns, 8 named constraints, the three checks behave as ruled. S0 ran as a scratch
  role with the same grants in a session: not as `app_designs`, not over the HTTP driver.
- **[QA-run, m8-8i-qa, six passes]** the four live race proofs green in every pass they ran (20 rounds of 8 callers for one digest
  and for two digests; the mark race; the lost first reply); criterion 7 against four real captured refusals (`23514`, `23502`,
  `23505` on the primary key, `22003`); mutants: 24 on the Neon store, 24 + 26 on the check's fix rounds, 10 on review round A, none
  surviving un-equivalent; the deepest real snapshot is 4 levels in the document and 5 in the priced design over eight real
  kitchens, against a bound of 64; the final whole suite alone at `b492d2c` plus its tests: 2447 passed, 2 skipped.
- **[reviewers]** logic: approve at `7790748` (R2's reason quoted from the PostgreSQL 18 pages); clean-code: approve at `7790748`
  (the split a pure move by its own line-set comparison; it read the developer's tests fully, and QA's files fully only in round 2's
  second pass); security: approve at `1bbd08e`, no open security finding (four rounds plus the migration read).
- **Findings** F1 to F9 (QA), L-R1.1 to 6, L-R2.1, S-R1.1 to 5, S-R2.1 to 6, S-R3.1 to 2, S-R4.1, C-R1.1 to 16 and C-R2.1 to 11 and
  how each was ruled: the plan's adjudication sections.
- **Deviations:** S1 was split into S1a and S1b (R7); the developer committed its own rounds from review round B on, by the
  coordinator's choice; two coordinator whole-suite runs overlapped on the test database at `7445280`, each showed 2 unrelated live
  failures (share-link and retried-writes; the 8E rate-limit live file) that passed alone (139 of 139): contention and not a defect,
  and no clean coordinator run exists at `7445280` (QA's was clean).
- **Commits** on `m8-review-contact-success`, local, not pushed [coordinator ran `git log`]: see the plan's *8I as closed*.
- **Not run / not proven:** `pnpm check`, `pnpm ci:local`, e2e, anything on a CI runner; and the list above.
