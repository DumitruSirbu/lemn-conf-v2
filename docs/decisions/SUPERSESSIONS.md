# Supersessions

This is the decision log's supersession detail, moved out of `README.md` so the index stays short.
Open this file when a record you rely on is marked superseded in the index, or when planning
(architect) — it names exactly which claim moved and where.

Beyond the index's "Status" column, these are the specific claims that were overtaken by a later
record. The superseded text stays in place, struck through, with a pointer to the record that
replaced it — nothing is deleted or rewritten silently.

- **ADR 0062** *Decision*'s *"no admin UI, no auth, no write endpoints, no schema, no feature flag"*
  in M6–M8 → **narrowed for the preset library only** by the owner's ruling of 2026-09-11, recorded as
  **ADR 0112**; the price dashboard itself still comes after M8.
- **ADR 0109** decisions 2, 7 and 8 (the reference kitchen as M7's one recipe; the interim order; the
  ≤ 30 cm narrowing) → **amended / retired** by that record's **Amendment A** on the owner's Q2 and Q4
  answers of 2026-09-11.
- **ADR 0019** decision 8 (*cross-device editing uses an e-mailed link, never a password*) and its
  Alternatives 1–2's rejection of passwords and accounts → **superseded** by **ADR 0115** on the owner's
  rulings of 2026-09-11 (*"Profile replaces PIN"*, *"In M8, with e-mail"*); the rejected alternatives'
  reasons are now M8's obligations (`milestones/M8-review-contact-success.md`, *Customer profiles*).
- **ADR 0115** decisions 1, 3 and 4 and its *Consequences* (*profiles are built in M8*) → **moved to
  M8B** by that record's **Amendment A** (2026-10-07), on the owner's answer to M8 plan Q1 (*"rest as
  recommended"*, relayed; option (b)). Wording struck in place. The rulings of 2026-09-11 stand.
- **Annotated 2026-10-07, later, nothing superseded:** **ADR 0019** decision 4's diaspora reason, against
  the owner's *"Moldova only for now"*. The decision's limits stand; M8 question Q23 is open.
- **Annotated 2026-10-07, M8 wave 8B, nothing superseded:** **ADR 0006**'s refusal wording (the guard no
  longer prints `host:port` or an unlisted name), **ADR 0142** decision 6 (`databaseNameOf` moved to
  `open-database.ts`; its no-slash refusal applies at every site) and **ADR 0041** decision 3 (four
  prerendered routes now, not five) → **ADR 0146**. ADR 0146 also supersedes, in `connectOrWrapError`'s
  own comment in `migrate.ts`, the stated intent to keep the driver error as `cause` (rule B3), and makes
  the 2026-09-06 criterion of M8's plan, *Added 2026-09-06*, hold over any string.
- **ADR 0002**'s *shareable to anyone holding the link* and **ADR 0019** decision 1's open read →
  **superseded** by **ADR 0114** decision 5 on the owner's F5 answer of 2026-09-11 (*"Only its own
  browser"*, revised the same day to *"Own browser + private share link"*); both carry dated notes.
  Writes, addressing by opaque id and 30-day retention stand; the read-only view survives behind a
  separate revocable share token (ADR 0114 Amendment B).
- **ADR 0019** decision 7 (*an abandoned design is deleted after 30 days by the nightly cron*) →
  **RETIRED** by the owner's ruling of 2026-09-15 (*"we can remove this rule of 30 days clearance…
  focus now on storing and not removing"*), recorded in that record's own **Supersession note —
  2026-09-15**. Nothing is deleted automatically; a later **manual** script for private kitchens over
  about a year is **recorded with its trigger and not built**
  ([ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md)'s
  first application). **Untouched:** the 14-day **backup** rotation, which the owner ruled separately
  the same day, and the same cron's rate-limit-counter pruning. **Consequence: no table in this
  project has a retention horizon — everything stored is permanent by default.**
- **Annotated 2026-10-07, nothing superseded:** **ADR 0019**'s 2026-08-31 *"ship together"* sentence lost
  its retention-cron term to the entry above (the replacement set is M8 owner question Q19, undecided),
  and its table's `POST /api/contact` is `POST /api/contact-submissions` in `ARCHITECTURE_PROPOSAL.md`
  §9; **ADR 0114** decision 7's *"M8's retention cron deletes the visitor hash"* is moot for the same
  reason. Each carries a dated note in its own file.
- **ADR 0019** decision 5's mint row (*10 / hour, 30 / day*; *3 / hour + challenge*; *5 / hour*), decision 4
  *as it applies to the mint* (*"Traffic from MD gets the ordinary limits. Everything else gets a much
  tighter limit and a challenge"*) and decision 3's session-cookie bucket *for the mint* → **superseded** by
  **ADR 0147** on the owner's rulings of 2026-10-07 (*"20 design generation per day for all"*, *"per user
  (ip)"*, *"20 per day"*): one counter per IP address, 20 a day, for everyone, and nothing else. Struck in
  place in ADR 0019. **Untouched:** the figures for saves, shares, page reads and the contact form, and
  decision 4 for any endpoint other than the mint. **Not ruled, in ADR 0147:** IPv4 as one address or a /24
  (Q32), the meaning of a day (the architect's), how an address is stored. ADR 0147 also records that the
  launch gate (the 2026-08-31 correction) moves whole to the delivery milestone, the architect's derivation.
- **ADR 0147**'s title and decision, *"per IP address"* → **amended for IPv4** by its own **Amendment A**
  (2026-10-08) on the owner's answer to Q32 (*"32 -go with Per block of 256"*, relayed): the 20 a day is counted
  per /24, not per address. The Q32 section and Alternative 5 are struck in place. IPv6 stays the /64, the
  architect's reading and not the owner's sentence. Nothing in ADR 0019 moves further.
- **Annotated 2026-10-08, tests-review fix-up, nothing superseded:** **ADR 0084** decision 5's *"`setFinish` offers
  everything"* → read as every *finish*, not every object, by the architect's ruling [relayed]: a value `FinishSchema`
  refuses is refused with `FINISH_NOT_OFFERED` on any material (`6eef46c`); **ADR 0078** decision 1 (`materialOffersFinish`
  now checks a free colour's type and pattern, `38fa058`, `74bcc20`) and decision 3 (it refuses no *document*, not no
  *finish*); **ADR 0031** (a width resize writes a seeded 820 mm base back at 860 mm, the architect's inference) with a
  pointer in **ADR 0022**'s amendment; **ADR 0150**'s citation of a deleted test file. Each carries a dated note in its
  own file. **ADR 0152** records the rules the cleanup produced.
- **ADR 0148** gained **Amendment A** (2026-10-08), wave 8D's half; nothing in an earlier record is superseded.
  Inside it, E2's condition is replaced by G2, and G1's *"or a language switch"* is struck; the plan keeps the
  original wording.
- **Annotated 2026-10-07, M8 wave 8C's close-out, nothing superseded:** the scope ruling (hosting and delivery
  preparation are a separate milestone) carries pointers on **ADR 0114** decision 7 and B5 (the limiter's scope
  is the application's in M8, the WAF's is the delivery milestone's), **ADR 0115** and M8B (M8B builds on M8's
  mail port and fake until the delivery milestone), **ADR 0095** (the Russian backstop re-sign moves with the
  launch gate) and **ADR 0038** with **ADR 0111** decision 8 (the first stored schema moves with it). Each
  carries a dated note in its own file.
- **ADR 0111** Amendment A2 (a pointer cookie holding the design id) → **superseded** by **ADR 0114**
  on the owner's security requirement of 2026-09-11: the cookie holds a secret, never the id.
- **ADR 0111** decision 7's demo interim (the editor stays at `/configurator/configure`) →
  **superseded** by that record's **Amendment A** on the owner's Q7 answer of 2026-09-11.

- **ADR 0032** decision 1 (*a non-fitting entry is shown disabled with its reason*) → **reversed** by
  the owner's ruling of 2026-09-10, recorded in that record's own *Superseded* section and carried as
  **ADR 0107** decision 3. Decisions 2, 3 and 4 outlived it: one `RejectionDetail` through one guard,
  the rule stated abstractly, and backlog 13 still closed. Only the *display* of a refusal is
  reversed, and re-proposing greyed rows contradicts an owner ruling made against shipped behaviour.
- **ADR 0104**'s frame-D2A declaration `de la {{ priceTotal }} MDL` at `700 21px` → **overridden for
  the prefix** by the owner's ruling of 2026-09-10 (**ADR 0104** Amendment A1, **ADR 0107** decision
  6): label 400, amount 700, on all four figure surfaces. The frame's number stays quoted in place —
  this is the one case where the frame lost, and it lost to the only authority above it.
- **ADR 0104** decision 7's *"`priceBreakdown.title` stays *De ce acest preț*"* → **corrected** to
  *De ce acest preț?* by **ADR 0104** Amendment E (owner, confirmed 2026-10-06; first ruled 2026-09-09,
  **ADR 0141** decision 1).
- **ADR 0104** decision 6's *precedent* — the inert `RO ▾` locale caret — → **spent**, not
  contradicted (Amendment A2). Wave 6B-i made the chip a link and **ADR 0107** decision 1 makes it a
  language dropdown; `Verifică designul` is still drawn inert until M8.
- **ADR 0104** decision 1's doctrine, as M7 extended it to Step 1's frames, and **ADR 0113** decision
  5's *"mockup wording is still used as written where a frame has it"* → **narrowed for copy, not
  struck**, by **ADR 0104 Amendment B** (2026-09-29), on the owner's final answer to Q-7L-1 (relayed).
  Text drawn in one mockup file and absent from the other file's frame of the same state does not ship
  on the frame's authority alone. It needs an owner ruling or a milestone criterion. A sentence that
  contradicts an owner ruling on what the product means ships under no answer. So desktop frame D1B's
  heading, on-site-measurement note and plan hint are not drawn. Decision 7 is the operative precedent,
  and ADR 0113 decision 5 still governs how frame wording is worded once it is drawn. Listed here
  because *"the desktop frame draws it and ADR 0104 makes frames the specification"* is exactly the
  citation that amendment answers.
- **M7's preset waves** (7P1, 7P2, 7G, 7B, 7C, 7F3) and the preset halves of M7's *Mobile (gate)* and
  *Desktop* criteria → **deferred past M8** and recorded by **ADR 0131** (2026-09-29). The rulings are
  the owner's direction of 2026-09-15 (relayed), the coordinator's derivation of 7B/7C the same day,
  and the coordinator's ruling on 7F3 of 2026-09-22. This supersedes milestone prose, not a decision
  record. **ADRs 0109, 0112 and 0117 stand unamended, and are unbuilt.** ADR 0112 is also
  **incomplete**: the owner's 2026-09-15 copy-on-use ruling is quoted in ADR 0131 §4 and not in 0112,
  and its amendment is owed when the work is revived.
- **ADR 0099** decision 8's placement (the reset drawn as a chip inside the colour row) → **amended**
  by that record's **Amendment D** on the owner's ruling of 2026-09-10: its own full-width row under
  the colour control, because a reset that can scroll out of sight is the one-way door decision 8
  exists to prevent, arriving as a scroll position. The decision itself is unchanged.
- **ADR 0088** decision 1's *"carries the frozen extent's … along-wall axes"* → amended by **ADR 0090**
  decision 6. *Carried* means not re-derived from the members; it does not mean immune to the command's own
  move. ADR 0088 is planned (wave 6K-i) and not implemented, so this amends a plan rather than shipped code.
- **ADR 0094** decision 2 (*"on the desktop shell the settings strip gets its own full-width grid
  row"*) → **withdrawn** by **ADR 0104** decision 2, on the owner's instruction of 2026-09-09 that the
  chrome match the design reference. That clause departs from frame D2E deliberately and says so; the
  departure is what the owner rejected. Its mechanism analysis (*"a row is an invariant; a residue is
  an inequality"*) is **not** withdrawn. Decisions 1 and 3 there stand whole, and criteria 4a–4h are
  re-pointed rather than dropped.
- **ADR 0082** decisions 2 (the wrap and its vertical currency), 3 (the floor is one chip per line)
  and 4 (the pinned trigger) → **superseded or discharged** by **ADR 0104** decisions 2–4: there is no
  chips row left to wrap, and the pill is its own trigger. Decision 8's 44 px floor **stands** with a
  new mechanism (a hit area that takes no layout space, so the frames' own band height survives).
  Decision 1 as amended, and decisions 5, 6 and 7, stand and are enforced. **The owner ruling of
  2026-09-05** it rests on → superseded by the instruction of 2026-09-09: the earlier answered how a
  chips row that does not fit should behave, the later answers whether it should exist.
- **ADR 0001** decision 3 (windows/doors in the first release) → superseded by **ADR 0003** (not
  present in the design reference; retired from near-term scope).
- **ADR 0001** decision 7, the "temporary persistence adapter" half → superseded by **ADR 0002**
  (a server-side Postgres database, not a temporary adapter).
- **ADR 0002** Consequences' Vercel-managed Neon provisioning (`neon-gray-elephant`) → superseded
  by **ADR 0007** (standalone Neon project, Marketplace integration disconnected).
- **ADR 0006** "Still open" (application connects as `neondb_owner`) → superseded by **ADR 0008**
  (least-privilege `app_designs` role).
- **ADR 0007** Consequences' "work item 8 remains open" → superseded by **ADR 0008** (role
  created, application repointed at it).
- **ADR 0008** "Still open" (Preview has no `DATABASE_URL`) → superseded by **ADR 0009** (Preview
  provisioned with its own database and role, same day).
- **ADR 0014**'s Proposed status and its open S1/S3/S4 → superseded by **ADR 0019** (read/write
  split, layered throttling, retention). S2 was already fixed in place.
- **ADR 0027**'s amendment closing paragraph — *"the owner scoped this wave to the new entry and
  decided to keep both as they are"*, exempting `base-dishwasher` and `base-dishwasher-600` from the
  capability gate → superseded by **ADR 0051** (the owner decided the product question on
  2026-09-01; the niche gets a decor door and both pins come out). ADR 0027's `base-hob-oven` front
  claim was already superseded by **ADR 0050**; the gate it created, and the four entries it
  corrected, stand.
- **ADR 0034**'s chip row, and the per-entry `sizesMm` menus of **ADR 0026**, **0029**, **0030** and
  the door-count halves of **ADR 0033** → superseded by **ADR 0035** (a bounded ±50 mm stepper; the
  rules survive as floors and ceilings, the curated lists do not). ADR 0034's engine seam is untouched.
- **ADR 0030**'s one-door cap (400 mm after its amendment) → **retired** by **ADR 0035** on the owner's
  decision of 2026-08-28. One door runs to 499; the hole it created at (400, 500) was why §11 row 14
  was failing. The rule does not survive as a bound — unlike 0026, 0029 and 0033, it is simply gone.
- **ADR 0069** decisions 5 and 5b's absolute guard 2 — *"unless the corrected room carries a fatal
  finding"* → **extended** (not superseded) by **ADR 0085**: the predicate becomes a comparison across the
  rewrite, so a finding the document carries under both rooms can no longer decline the correction. Guard 1
  stays deleted and decision 4's total map is untouched.
- **ADR 0078** decision 2's *"the refusal is unreachable on the load path by construction"* → **scope
  restated** by **ADR 0085** decision 7: true of the refusal, and read as a claim about the code, whose
  severity has a second reader in `correctPreCorrectionRoom`.
- **ADR 0028**'s `WORKTOP_DEPTH_MM` naming, and its map read as a carcass depth → superseded by
  **ADR 0036** (the setting is *cabinet* depth; a declared dimension is the finished cabinet,
  doors included). ADR 0028's mechanism — a declaration, not a computation — is untouched.
- **ADR 0040** decision 1's third arm ("`frame.d` for everything else") → superseded by the record's
  own **amendment of 2026-08-31** (wave S9, DOM-002): a body's occupied depth is declared per
  catalogue entry, and an undeclared one throws. The decision's subject — a recorded seat is
  converted back, never read as a depth, in one place — survives intact.
- **ADR 0020**'s prose describing a runner that deliberately keeps no ledger, and its decision 4's
  open owner → superseded by **ADR 0042** (an append-only `schema_migrations` ledger, one
  transaction per migration, a run that reports what it applied). ADR 0020's finding and its
  decisions 1–3 stand, and its schema read-back is still owed.
- **ADR 0031**'s *"a remainder below `MIN_W` refuses"* bullet, and its Consequences line that row 10's
  floor still binds → superseded by **ADR 0043** (a gap of any width is a legal state; a growth is legal for
  any remainder at or above zero). ADR 0031's funding rule, its column scope and its exact-to-zero removal are
  untouched, and **ADR 0037**'s shrink-side waiver stands with its stated reason narrowed.
- **ADR 0037**'s withdrawal — *"the merge is right and unbuildable alone"* → superseded by **ADR 0046**
  (the merge returns **capped at 800 mm**, after an insert-time column split supplies §4's missing
  horizontal half). Everything ADR 0037 measured stays true, and ADR 0046 states plainly that the cap
  alone does **not** cure the stranding: the split does, and it ships first and alone.
- **`DEVELOPMENT-SPEC.md` §3.2**'s *"columns are computed once at load and never change"* → superseded
  in two steps: by **ADR 0011** Gap D (the *extent* is frozen; live predicates are re-answered), and by
  **ADR 0044** (the map is built at load from the placements **and** the stored `emptyColumns`).
- **`DEVELOPMENT-SPEC.md` §13.1**'s *"nothing can move horizontally any more, so column identity is
  permanently stable"* → the rule stands, its stated bonus does not: **ADR 0031** moves two columns on
  a resize and **ADR 0046** joins and splits them. Identity is stable *within* a command.
- **`DEVELOPMENT-SPEC.md` §7**'s *"columns are fixed 600"* → superseded for `tall-pantry` alone by
  **ADR 0048**. The other three full-height rows still refuse with the millimetres in the message.
- **`DEVELOPMENT-SPEC.md` §9 item 6**'s `canWidth` rule, and the suppression reasoning in
  `commands/set-width.ts:178-182` → superseded by **ADR 0049** (`fixedWidth` decides that every chip
  is disabled, not that the section is absent). Finding R2.7's loud failure for **missing catalogue
  data** is preserved and is that record's anti-invariant.
- **ADR 0027**'s retained accessory machinery, and **ADR 0028**'s "not retroactive" tradeoff →
  superseded by **ADR 0038** (pre-release; nothing is stored, so nothing is owed a migration and
  code kept only to read an older shape is deleted). **Expires at first release.**
- **ADR 0027**'s *"`base-hob-oven` declares `canFinish: false`… it is open-front by design — the
  appliance *is* the front — so it owns no `door_front`"* → superseded by **ADR 0050** (M5B wave 5B6
  built a fixed filler panel across the hob+oven cavity, so the body now owns one finishable front,
  `oven_filler_door_front`). True when written, false once that panel existed. `canHandle: false`
  is unaffected and stands.
- **ADR 0046**'s `MERGE_CAP_MM` and its scope over the merge alone → superseded by **ADR 0052**
  (one shared `MAX_EMPTY_COLUMN_WIDTH_MM`, read by the merge, a shrink's split and the v1 migration
  split). Rule 1's greedy maximal scan and the "an opening belongs to a column" argument are reused,
  not replaced.
- **ADR 0035** decision 7, *"shrinking a column creates empty space"*, stated with no ceiling → amended
  by **ADR 0052**: the created column is held to the same 800 mm ceiling every empty column now is.
  Q5, opened by this decision, closes there.
- **ADR 0044**'s *"this record's cheapness expires with ADR 0038, at first release"* → corrected by
  **ADR 0052**: ADR 0038's premise that no design has ever been stored is itself false, measured on
  2026-09-02 (5 rows, `schema_version` 1). Read the expiry as already re-checked and found the
  database non-empty, not as an event still pending first release.
- **ADR 0038**'s *"no design has ever been stored"* → the premise is measured false by **ADR 0052**
  (5 `designs` rows exist, `schema_version` 1, none carrying `emptyColumns`). Its rules stood correctly
  for those five rows because none exercised the field this wave changes; the premise itself should be
  read as retired by measurement rather than merely untested.
- **ADR 0020**'s `APPLICATION /lemn-conf-v2 rows: 0` → superseded as a dated observation by **ADR 0052**'s
  2026-09-02 measurement (5 rows). Not a ruling to re-decide, a reading to update.
- **ADR 0044**'s *Alternatives considered*, **"store the whole frozen column map… occupied columns
  are already fully derivable from the placements"** → superseded by **ADR 0053** (M5 wave 5H). The
  premise is false — backlog 22 is the measured proof — and the replacement is narrower than the
  rejection it overturns: a *second array*, `columnExtents`, on precedence-plus-containment rather
  than disjointness, covering only the columns that still hold a member.
- **ADR 0044**'s *"an untouched document is not rewritten"* (via `withFrozenMap`'s own comment, which
  ADR 0044 relied on for `emptyColumns`) → narrowed by **ADR 0053**: true for `emptyColumns`, false
  for `columnExtents`, which is populated for every occupied column on the resolved map. The next
  save of any legacy document, of any kind, now differs from what was stored even when nothing the
  customer sees changed.
- **ADR 0011**'s 2026-08-26 Gap D correction, *"the freeze covers a column's extent… and nothing
  else"* → not superseded, obeyed more fully by **ADR 0053**, which stops `deriveColumns`
  re-deriving an occupied column's extent from its current records on every reload — precisely what
  that correction's reasoning already forbade.
- **ADR 0053**'s refusal-code list, which names one `COLUMN_EXTENT_OUTSIDE_ROOM` for all four room
  edges → split per edge by **ADR 0069**. The four edges stopped sharing a severity once ADR 0065
  made "past the wall end" a mark, so the edge belongs in the code rather than in the issue path.
- **ADR 0065** decision 7's implementation as a single demoted code → extended by **ADR 0069** to the
  whole "reaches past the end of its own wall" family, on placements, empty columns and frozen
  extents alike. Decision 7's requirement is unchanged; what it takes to meet it is not.
- **ADR 0009**'s "Verification once deployed" section, which checks only that the backup cron
  registers → narrowed by its own **2026-09-02 amendment** and by **ADR 0054**: provisioning
  `lemn-conf-v2-preview` was verified in 2026-08-25, but keeping its schema current was not, and it
  sat three migrations behind until ADR 0054's session found it while wiring local development.

- **ADR 0011** Gap B's `seatDepthMm ?? frameDepthMm` -> narrowed by **ADR 0077** decision 4 for
  entries declaring `seatedOn: "joint"`. The `??` stands wherever a placement's seat is a property of
  its own mesh; for a joint-seated body the left operand records a quantity the body does not own, so
  `deriveFrame` reads the declaration and ignores it. One entry today, bounded by a declaration.
- **ADR 0011** Gap B again -> **suspended, not narrowed**, by **ADR 0077** decision 8 (its Addendum),
  inside `setCabinetDepth` only, for entries declaring `depthFollowsSetting` only, and only for the
  records and columns the rebuild plans against. Every read path outside that command is unchanged,
  and the case Gap B protects — a wall body built deeper than its map row — is re-derived from
  `column.hasFullHeightUnder` rather than lost. Listed separately from the clause above because the
  two have different blast radii and must not be read as one change.
- **ADR 0075**'s amendment clause 4, *"that the real probe cannot measure them at all is larger than
  this record and is reported separately"* -> reported and ruled by **ADR 0077**. The premise moved:
  the probe *can* measure the structural family since 6K-d's `buildAnyBody`, and for
  `base-corner-x-900` the measurement is the wrong quantity.
- **ADR 0073** decision 3's *"and never shallower"* -> **partly overturned** by **ADR 0080** on a direct
  owner instruction, 2026-09-05. The surplus half stands: an unsourced depth deeper than the fallback could ever
  have produced is still kept, deeper-only. The ratchet half goes: where `column.d` is not deeper than
  `columnBuildDepthM` at the setting the design is **leaving**, the answer is `columnBuildDepthM` at the new
  setting exactly, in both directions. Legacy-only in what it changes today (wave 6K-j); ADR 0073's stated
  residual is re-scoped to documents older than wave 6K-c rather than deleted.
- **ADR 0057** decision 3 — *"the warning is shown before the apply, on both viewports"*, read as an
  always-present sentence in the settings sheet → **amended by ADR 0081** on a direct owner ruling,
  2026-09-05. The consequence is now stated by a **conditional blocking confirmation** shown only when
  some cabinet carries a colour differing from its current material's declared default, and nothing is
  written until the customer agrees. The requirement is strengthened where it fires and **removed where
  it does not**: a kitchen entirely at its material's default is now repainted with no warning at all,
  which ADR 0081's final section records as the trade the owner took. Decisions 1, 2 and 4 stand, and
  ADR 0057's rejection of nearest-finish mapping is **reaffirmed by the owner** in the same message.
- **ADR 0078**'s closing owner question — *"should PAL → MDF carry the colour over?"* → **answered by
  ADR 0081: no.** The owner declined to build a mapping between materials by name. Nothing in ADR 0078
  changes; the question stops being open.
- **`apps/web/src/settings/global-settings.module.css:33`'s** claim that a fourth chip *"narrows the
  three rather than breaking anything"* → **measurably false**, refuted by `docs/BACKLOG.md` entry 32's
  measurements and by **ADR 0082**. Listed here rather than only in the backlog because it is a
  load-bearing claim inside the code, and it is corrected by the wave that lands ADR 0082 (6R).
- **`declared-frame-depth-sweep.test.ts`'s** claim that `base-corner-x-900` *"is re-seated by `reseat`
  from its declared frame depth rather than from a measurement of its bounding box"* -> **false when
  written**, corrected by **ADR 0077** decision 6. Recorded here because a retraction of the
  reviewer's finding was accepted on 2026-09-05 on the strength of that sentence, and is withdrawn.

- **ADR 0027** decision 3's *"60 mm forward of the carcass centre"* → superseded by **ADR 0087**
  (2026-09-05). The hob's seat is derived from the **worktop's front edge**, holding its clearance to
  it constant at every declared cabinet depth; the carcass centre is no longer the datum. Its value
  at 600 mm is unchanged to the micrometre, so nothing else decision 3 claims moves — the clause was
  a record of where `0.06` came from, written when the kit held one depth by construction.

- **ADR 0082** decision 1's containment predicate (*"`scrollWidth` equals `clientWidth`, and every
  element of the strip has its bounding box fully inside the viewport"*) → **amended by ADR 0094**
  (2026-09-06), as *Amendment A* written into ADR 0082 itself. Not overturned: the predicate is
  necessary and was **not sufficient**. It was satisfied exactly — 900 = 900, every box inside the
  viewport — by two chips rendered 28 px wide with 138 and 115 px of label cut, painted inside the
  step nav's column, with the settings trigger standing 39 px over the price bar and intercepting
  `price-bar-total`'s hit test. Containment is now measured against **three** boxes — the viewport,
  the strip's own band on all four edges, and the chip's own clip — and on a **flagged** design as
  well as the seeded one. Listed here because a reader who meets the original sentence needs to know
  a green gate once stood on it.

- **ADR 0084** (2026-09-05) does not supersede a decision record: it corrects **wave 6Q-b's**
  veneer-fixture criterion in `docs/milestones/done/M6-price-and-global-settings.md` — the hood bullet and
  the *"not three, which would mean the hood was counted"* clause are struck in place there, with the
  measurement that moved them. Listed here because the number was reasoned and a reader who met it
  needs the pointer.

- **ADR 0020** decision 3's mechanism (*"the persistence suite keeps a standing assertion that the
  application database carries the current schema"*) → **amended by ADR 0096** (2026-09-07), struck
  in place in ADR 0020 itself. Not overturned — the intent is kept and finally implemented — but the
  mechanism is wrong twice over, and both were found only because production broke a second time. It
  **was never built at all**, thirteen days after being ruled; and a suite-level check inherits its
  target from whichever untracked `.env` file the executing machine supplies (production from the
  repository root, preview from `apps/web` per ADR 0054, nothing in CI) while
  `describe.skipIf(!hasLiveDatabase)` silences it precisely where it must speak. The read-back is now
  a **deploy-time gate naming each environment**. ADR 0020's decision 2 stands and is restated by
  ADR 0096. Listed here because a reader meeting decision 3 needs to know it described a check that
  did not exist while three environments went unmigrated.

- **ADR 0020** decision 1's *"with the owner's authorisation"* → **amended by ADR 0096** (2026-09-07)
  decision 5, in that clause only, struck in place in ADR 0020 itself. On the owner's direction that
  migrations run in the deployment pipeline, an **additive, idempotent** migration is applied
  unattended and no longer waits on a human. The requirement stands unchanged for any migration that
  can destroy or rewrite data, or that cannot run inside the runner's transaction — which the
  pipeline must **refuse** rather than run, closing the thread `migrate.ts`'s own header left open
  (*"should get its own decision record rather than a quiet exception carved into this runner"*).
  Everything else in decision 1 is untouched, and the read-back it requires is **strengthened** into
  a standing guard rather than relaxed. Listed here because it is the one line ADR 0096 moves rather
  than implements.

- **ADR 0020** alternative 1 (*"run migrations automatically at application start or during the
  build"*) is **not** superseded and is annotated in place to say so. ADR 0096 chose a pipeline job
  holding its own credential, which hands DDL to no runtime and is therefore outside what that
  rejection was about; running `migrate` from Vercel's `buildCommand` **is** that case and stays
  refused. Listed here because "migrations now run automatically" reads like a reversal of it and is
  not one.

- **ADR 0058**'s two cost-acceptance paragraphs (*"Recorded as an accepted cost… at a depth nothing
  ships at"* and *"Assessed as acceptable… at a depth nothing ships at today"*) -> struck by
  **ADR 0097**. The measurements and the mechanism stand; the **acceptance** does not, because wave 6K
  made 700 mm a customer-selectable setting and the owner met both costs in use. ADR 0058's decisions
  1-4 are untouched and the pin is unchanged — what is void is the authority to re-quote those two
  paragraphs as a live acceptance. Listed here because "ADR 0058 already decided this" is exactly the
  citation ADR 0097 exists to stop.

- **ADR 0087**'s Consequences clause *"the sink stays 20 mm rear of its worktop's centre at both
  depths, which is a coherent rule and may well be the right one for a sink"* -> struck by **ADR 0098**.
  The owner ruled the sink centred with the added depth behind it. The rest of that clause stands: the
  measurements are unchanged and ADR 0087 was right to leave the ruling to the owner rather than infer
  it from the hob's. Note the one place ADR 0098 departs rather than extends — ADR 0087 decision 1
  holds the 600 mm kitchen still to the micrometre, and ADR 0098 deliberately moves `base-sink`
  forward by 20 mm. That is a scoped re-baseline, not a reversal of ADR 0087's invariant, which still
  governs the hob.

- **ADR 0086** decision 3's criterion (*"`materialResetConfirm` is present if and only if … and
  `chosenColourCount > 0`"*) -> amended by **ADR 0099** decision 7. Once a global colour default
  exists, the count is measured against the design's **resolved** default rather than
  `material.defaultFinish`, and a **second arm** is added for a `settings.finish` the incoming
  material does not offer. The rule's shape, its table and ADR 0086's decisions 1-2 are unchanged.

- **ADR 0057** decision 2 is **not** superseded by **ADR 0099** and is annotated in place to say so.
  A global *material* change may still reset a cabinet's colour, with confirmation; ADR 0099 rules
  only that a global *colour* change never may. Listed here because "a global setting can no longer
  overwrite a cabinet choice" reads like a reversal of it and is not one.

- **ADR 0097** Finding 2, decision 2's item-8 row and decision 3's item-8 bullet -> corrected by its
  own **Amendment A** (2026-09-07). The claim that unpinning the deep tops rebuilds them into a 400 mm
  `wall-cabinet` is **false**: `resolveDepthM` takes `columnBuildDepthM`'s lifted arm over a full-height
  column, so a rebuild plans the cabinet-depth line — 700 mm at a 700 mm kitchen, measured end-to-end.
  Item 8's verdict is reversed from "not small" to "small in production, a small wave in total". The
  struck text is kept: it is a true account of the *wall* band and of a question the owner turned out
  not to be asking. Also records that **ADR 0058 finding 3**'s objection — unpinning would build `p24`
  at an unmanufactured 742 mm — is expired as well, since wave 6I2 made `resolveDepthM` read the
  declaration and never the opening's MAX (`docs/BACKLOG.md` entry 15 is resolved).

- **ADR 0028** decision 5's clause *"which is what keeps the two deep top cabinets at 600 over their
  columns"* -> superseded by **ADR 0101** decision 5. **The rule is confirmed, not overturned**: a
  full-height member still lifts the head-clearance cap, and that lift is the mechanism the deep tops'
  fix uses. What is false is the consequence — the lifted arm returns the cabinet-depth line, 700 at a
  700 mm kitchen, and it is ADR 0058's pin rather than this lift that holds those cabinets at 600.
  Listed here because the clause reads like an argument for the pin and is not one.

- **ADR 0097** Amendment A's note that `seeded-body-names.adversarial.test.ts`'s `neverMigrated`
  assertion *"becomes false"* -> corrected by **ADR 0101** decision 2. It does not: the round trip is a
  width resize and this wave changes only `depthRule`, so the assertion still passes. The real defect
  is that it keeps passing while its meaning changes, which is why its scope has to be named.

- **ADR 0079** decision 10 point 2 -> **confirmed unchanged and unnarrowed** by **ADR 0102**. Listed
  here because a reader who finds the predicate failing on the tree would reasonably expect it to have
  been scoped, and it was not: the population where it fails is exactly the population where
  `frozenDepthAtThisSetting` publishes a wrong depth (330 mm measured where 599 belongs), so narrowing
  it would have been a statement that the rule does not apply where it is being broken. What ADR 0102
  adds is a **dated record of where it is currently violated** — `restoredColumns` naming a body for a
  depth `columnBuildDepthM` produced, since wave 6I2 — and the wave that fixes it.

- **ADR 0101** decision 4's *"the 600 mm kitchen is byte-identical"* -> **scoped, not corrected**, by
  **ADR 0102** decision 5 and ADR 0101's own Amendment A. It is true **as the kitchen loads**, which is
  what it says and what was checked; it is not a claim about every reachable state, and four ordinary
  commands move a published depth by 269 mm. Nothing in ADR 0101 is struck.

- **ADR 0102**'s *Not decided here — one question for the owner* -> **ANSWERED**, not superseded, by
  **ADR 0103** decision 1 and ADR 0102's own **Amendment A** (2026-09-08). The owner chose answer
  *(a)*: the 400 mm rebuild is correct, because with the column emptied the design should not count on
  cabinets that used to be there. Listed here because the section is still in ADR 0102 under its
  original heading, and a reader who finds it would otherwise carry it forward as open — it is struck
  in place and kept verbatim, as this file's own rule requires. **ADR 0028 decision 5 is confirmed by
  the ruling, not overturned by it.** ADR 0101's Amendment A carried the same question in its
  consequences and is struck there too.

- **`DEVELOPMENT-SPEC.md` §5.2's insert path** -> **extended, nothing struck**, by **ADR 0103**
  decision 2. §5.2 describes building one body into one opening (`g = b.mk(w, h, void.d)`) and is
  correct about that; what it never said is when a body *already standing* has its depth re-answered.
  Listed here because the gap reads like an implementation defect and is not one: ADR 0011 Gap D
  already re-answers `hasFullHeightUnder` on every derivation, and — measured at `ed6c545` — it does.
  What was missing was a rule about the bodies already in the column, and the owner has now given one.

- **ADR 0041** decision 4 (*no report collector: an unauthenticated, unthrottled `POST` is SEC-001's
  shape*) → **overturned by name** by **ADR 0161** decision 2 (2026-10-13, wave 8Q), because its reason,
  the missing limiter, no longer holds (ADR 0155, 0156). **ADR 0041** decision 3's two preconditions
  for enforcing (no prerendered page without a nonce; a sink) → **discharged** by ADR 0161 decisions 1
  and 6. Decisions 1, 2 and 5 stand; decision 6 (`upgrade-insecure-requests`) stands (ADR 0161
  decision 7). The CSP is now a control and not only a declaration (SEC-004's stated bound). ADR 0161
  itself carries struck-in-place corrections by its own **Amendment B**: *"one counter write per
  accepted report"* (it is per correctly-typed `POST`, refusals included), F2's *"cannot pass for one
  of this application's pages"* (`origin` is a claim, never proved), and the plan's criterion 4,
  *"no line for 429"* (superseded by F1's once-an-hour line).

- **ADR 0161** decision 2's *"Nothing is stored but the limiter's counter."* and its *Consequences* cost line (a
  counter write per correctly-typed `POST` and nothing more) → **overtaken** by **ADR 0162** (2026-10-14, wave 8Q2,
  the owner's Q46 = (c)): an accepted report is also stored as a row in a fixed-size table. Struck in place by ADR
  0161's **Amendment C**. Decision 3's closed record stands. ADR 0162's own **Amendment A** corrects the 8Q2 plan's
  *"well under one a second"* worst-case line (about 1,820 accepted reports a second with a named network source and
  a routed IPv6 `/48`).

- **ADR 0154** d2 (*"no SDK, no dependency"*, for the transport only), d3 (the Resend answer table) and d4's
  guarantee (*"a retry inside a day cannot send a second message"*) → **superseded** by **ADR 0164** (accepted
  2026-10-17, wave 8J2, planned as 8N), on the owner's 2026-10-15 switch to nodemailer through Gmail SMTP. d6 (names),
  d7 (refusal set), d9 (third party) and the J-S1.6 harness clause are **amended**; ADR 0153 R6 and ADR 0157's quota
  line are noted. d2's must-not list stands except `html`.
- **ADR 0154** d2's must-not item `html` and **ADR 0164** d1's *Not taken: … `html`* and d4's *"Plain text only"* →
  **superseded** by **ADR 0165** (2026-10-17, wave 8V), recorded as **ADR 0164 Amendment A**: a plain-text part and,
  when it fits 90 000 bytes, an HTML part. **M8 plan Q5 (a)** (*"the 3D view waits for the dashboard"*) → superseded
  for the e-mail by the same record (Q-8V-1 = (a), a frozen copy).
- **ADR 0160**'s and **ADR 0163** d7's reference with *Copiază* on 5A and on the already-sent view → **superseded** by
  **ADR 0165** D1–D2. **Not superseded:** the callback form's sent view keeps the reference (coordinator decision,
  2026-10-17; the 8V plan's *"`SentReferenceCard` … deleted"* is struck).
- **ADR 0052** (800 mm is the ceiling on any empty column) → **superseded for spaces** by **ADR 0166** (2026-10-17, wave
  8U, Q-8U-1 = (b)); 800 stays the ceiling on every cabinet and the v1 arm's normalisation. **Until 8U S5 is built**, the
  commands' own cuts at 800 still run and the reconcile's uncapped merge rejoins their pieces. **ADR 0046**'s cap →
  superseded **in the editor** by the same record; its rule 1 sort, rule 2, rule 3, part 1 and the left seat stand.
  **ADR 0037**'s uncapped merge → **revived** under the conditions its withdrawal named (the insert split, plus the fit
  at maximum). **ADR 0110** decision 2's *"the same published openings"* → **amended for composition's intermediate
  states only**: composition merges at its own 800 limit, then finishes through the editor's uncapped derivation.
  **ADR 0122** decision 4 is untouched and remains the trigger for per-level merging.

## Moved from the index Status column

These claims were carried only in the old index's Status cells, not otherwise recorded above.
Preserved here verbatim from that column so nothing is lost by the table's slimming.

- **ADR 0029** — Status cell read *"Accepted (mechanism superseded → 0033)"*: the entry's
  width-restriction mechanism ([0600, 800]) was replaced the same day by **ADR 0033**'s
  width-derived door count.
- **ADR 0030** — Status cell read *"**Retired 2026-08-28 → 0035** (mechanism → 0033)"*: beyond the
  0035 retirement recorded above, the entry's one-door-cap mechanism was itself replaced the same
  day by **ADR 0033**'s width-derived door count.
- **ADR 0069** — Status cell read *"Accepted — **clip seam amended by [0090] Amendment B**"*: the
  clip seam this record's decision 6 relies on (`refuseUnexecutableDesign`'s empty-column clip) was
  amended by **ADR 0090**'s Amendment B, which restricts what a room-derived pass may do to a
  recorded map (bound what it publishes, never rewrite what the document records).
- **ADR 0108** Amendment D's straight-wall maximum *"1200–6300 mm … 6300 is the storage bound"* →
  **6000 mm** by ADR 0108 **Amendment G** (2026-09-24): the owner's Q-7J-1 ruling (one maximum for
  every wall unless a straight wall measurably needs more) and wave 7J's measurement that it does not.
  The minimum (1200) and the sequencing (the bounds enter the approved policy in 7J) stand.
- **ADR 0116** decision 3 / *Consequences*' *"7J changes nothing under `apps/web/src/room`"* and
  *"both helpers"* → **narrowed** by its **Amendment A** (2026-09-24): the diff there is exactly
  `room-url-state.ts` and `generation-steps.tsx` (C-7F2-3); the casts are seven, and only the
  `linear` ones are deleted in 7J — the `U` ones are M7B's.
- ~~**ADR 0110** E4's *"never two"* ovens → **narrowed for a U whose entered walls total 10 m or more** by
  that record's **Amendment N3.8** (2026-09-29), on the owner's M7B Q-U3 ruling (*"Two tall ovens+mw"*,
  relayed).~~ **Withdrawn the same day:** the owner's RQ5 (*"Place one, allow second and third"*)
  keeps E4 unchanged for every U. Recorded at ADR 0110 Amendment N6 and *N3 revised* 9.
- **ADR 0110** Amendment N1.7's *"prioritize the regular base ones"* (between the fridge and the free
  end) → **superseded below 10 m** by the owner's later answer the same day (*"… should be placed tall
  cabinets"*), recorded at N6 and *N3 revised* 4. RQ3's *"Two"* is superseded by *"Yes, both from
  corner"*: the count is taken from the corner.
- **ADR 0110** E6.2's *"that block is not planned at all"* → **departed from for a U's lone free-end
  oven tower**, ruled by RQ17 (N6′, 2026-09-29), so that the owner's *"place one"* holds.
- **ADR 0110** Amendment N1.4's *"tall optional in a large U"* → **narrowed to the far wall** by RQ13
  (*"Tall cabinets anyway"*, 2026-09-29). Pantries fill the gap between the fridge and the free end at
  every size.
- **ADR 0120** Amendment E's wider-wall rule (sink and hob on the wider wall, fridge on the narrower) →
  **not applied to a U** by ADR 0110 **Amendment N2** (2026-09-29): in a U the sink is on the back wall
  and the fridge on the wider side wall. It stands for the L.
- **ADR 0108** Amendment C's *"U (M7B): the same rule across three runs, with two corners"* (the
  architect's sentence, never a ruling) → **replaced** by ADR 0108 **Amendment H3** (2026-09-29): the
  U's minimum kitchen is not symmetric over the three runs, because the sink's wall is fixed.
- **ADR 0108** Amendment H1's approved U wall-A minimum of 1800 mm (Q-U1, relayed) → **raised** by
  **Amendment H2** the same day: the owner's 1200 mm walkway (Q-U2), held at the deepest floor body,
  measures 2696. The literal is residual question RQ1.
- **Frame 1B's note** *"Toggle-ul apare doar pentru L și U"* → **the U half is withdrawn** by ADR 0104
  **Amendment C** (2026-09-29), on the owner's Q-U4 ruling (b).
- **M7B plan** D2 (β, wall C in wall B's mirror frame), D4 (one group reflected in `x = W/2`) and D5
  (the odd millimetre) → **replaced** by **ADR 0132** decisions 1, 2 and 4 (2026-09-29), on the owner's
  Q-U5 ruling and U0's census. The plan carries dated correction lines.
- **Dated 2026-10-17, M8C wave F0 — PROPOSED, NOTHING STRUCK:** **ADR 0110** Amendment A4's *"the remainder, at most
  599 mm, stays"*, Amendment D2's *"let the edges empty"*, *N3 revised* 3's *"any bare remainder beyond it"*, N11.9's
  RQ25a / RQ25b (*"Back wall only"*, *"Fill from 300 mm"*), E8's *"not moved"* and E12.1's nearness (for the block's
  distance from the hob) → **would be superseded for generated kitchens** by **ADR 0167** (*Proposed*), on the owner's
  Fix 1 rulings of 2026-10-17 (Q-F1-1, Q-2 = (b), Q-7 = (a), relayed). **ADR 0109** Amendment A3.2 and Amendment D's F4
  (the 600 mm refill) → read through 0167 by **ADR 0109 Amendment E**. **ADR 0067** decision 2, **ADR 0117** decision 1,
  decision 6 and *Consequences*, **ADR 0120** (lines 78, 114, 438), **ADR 0130** line 31 and **ADR 0166** decision 4
  (by M-1, or by M-2) carry dated forward pointers. Converted to supersessions only when 0167 is Accepted at wave F1b's
  close; **until then the older text is the code's behaviour.**
- **Dated 2026-10-17, M8C wave F0 — decided, not built:** **ADR 0112** decision 2 (a feature flag and an owner secret)
  → **suspended until the first public deploy** by **Amendment A**, on the owner's ruling (*no password, no switch, every
  environment, for now*, relayed); decisions 1 (the typed name per locale) and 5 (*"no public list endpoint"*) →
  **amended** by the same amendment; consequence *"wave 7P1 extends the export"* → wave P2's second scoped export. **ADR
  0003** decision 4b (*"a list with a per-card CTA, not a carousel"*) → **amended for the preset chooser** by its dated
  amendment, on the owner's Q-6 (relayed); frames 1E and D1E's *"nu carusel"* notes are departed from by **ADR 0104
  Amendment F**. **ADR 0168** records the owner's option C for M8C's tests (scope: M8C only).
- **Annotated 2026-10-18, nothing superseded:** **ADR 0142** decision 6 carries a dated note pointing at **ADR
  0169**, which records the migration-target safety plan it named (extends ADR 0096 decision 3; the code also
  refuses two name shapes the plan did not list, a drift note there). **ADR 0170** restates three M1 to M3 plan
  claims with drift notes and strikes none: M3 work item 9's *"never recomputed by a command"* (read it through
  ADR 0011 Gap D, ADR 0044, ADR 0031 and ADR 0046, as the `DEVELOPMENT-SPEC.md` §3.2 and §13.1 entries above
  already say), the M3 *Surfaces* gate's *"temporary developer affordance"* (replaced by M4's panel), and the
  *fifteen* insertable entries (a test says fourteen; unreconciled). **ADR 0171** notes that 7K G3 (*"no preset
  list, card, Folosește or save-as-preset control exists"*) described the product at `642ce47` and has since
  been overtaken by the revived preset story (ADR 0112 Amendment A, ADR 0003 decision 4b amendment).
