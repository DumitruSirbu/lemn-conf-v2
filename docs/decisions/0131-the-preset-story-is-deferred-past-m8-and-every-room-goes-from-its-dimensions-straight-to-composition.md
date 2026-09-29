# ADR 0131 — The preset story is deferred past M8, and every room goes from its dimensions straight to composition

Status: Accepted — records, at M7's close, rulings already in force since 2026-09-15 and 2026-09-22
Date: 2026-09-29 (written); rulings dated 2026-09-15 (owner direction, relayed; coordinator's
derivation) and 2026-09-22 (coordinator)
Type: Decision (owner direction, relayed + coordinator scheduling rulings), recorded after the fact
Milestone: M7 — waves 7P1, 7P2, 7G, 7B, 7C and 7F3 (`docs/milestones/M7-room-and-presets.md`)

**How to read the citations.** A bare `:N` cites `docs/milestones/M7-room-and-presets.md` **as it
stood at `a989a85`**; read it with `git show a989a85:docs/milestones/M7-room-and-presets.md`. Every
load-bearing claim carries its tier — **[doc-quoted]**, **[source-verified]** (read or `git grep`ped
in the tree at `a989a85`), or **[inference]**, with what would falsify it.

## Context

M7 was planned as *room → preset → 3D edit*, with the preset library on its critical path: the
recommended order read *"7A → 7D1 → 7D2 → 7E1 → 7E2 → 7F1 → 7F4 → 7P1 → 7P2 → 7G, then 7B → 7C →
7F2 → 7F3 for matching"* (`:1610-1612`) [doc-quoted]. By M7's last build wave none of 7P1, 7P2, 7G,
7B, 7C or 7F3 had shipped, and none was meant to: they had been moved past M8 in two steps, a week
apart.

**Until this record, that move existed only in milestone prose and `docs/STATUS.md`.** Wave 7K's plan
said so and said why it matters: *"no ADR records it (`git grep` over `docs/decisions` for "past M8"
finds only the price dashboard's ADR 0062). 7K is where that deferral visibly narrows M7's own phase
gate; when M7 is archived, the reason must survive in `docs/decisions/`"* (`:4627-4631`)
[doc-quoted]. `AGENTS.md` tells readers not to open an archived milestone, so a reason left there is a
reason no one will read. This record carries it out before M7 is archived. **It decides nothing new.**
It writes down what was ruled, by whom, when and why, and what M7 shipped as a result.

## The rulings, in order

### 2026-09-15 — the owner defers storage, authoring and the admin panel (relayed)

The owner's words, **relayed** by the coordinator and recorded in the 7P1 plan's banner (`:19353-19359`)
[doc-quoted]:

> *"now I will focus on building automatically this kitchen configurations and just after focus on
> the presets functionality"*

and then, settling it, that storage, authoring and the admin panel come

> *"after even third page that is milestone 8"*

The 7P2 plan's banner records the same ruling as *"Deferred past M8 — when. The owner ruled that the
whole preset story — storage, authoring and admin panel — comes 'after even third page that is
milestone 8'. 7P2 is not next and is not in M7's order as it stands"* (`:21398-21400`) [doc-quoted].
Both are relays. Neither is a transcript, and this record does not treat them as one.

**Waves it moves directly:** 7P1 (the store), 7P2 (the authoring gate, the save endpoint and the
owner's button) and 7G (the thumbnail capture and backfill, which depends on 7P2, `:1564`)
[doc-quoted].

### 2026-09-15 — the coordinator derives 7B and 7C from it

The 7B row: *"DEFERRED PAST M8 with the rest of the preset story (coordinator, 2026-09-15) — and this
is DERIVED, not an independent choice: matching searches the preset library, and there is no library
until the owner authors one, which the owner has deferred past M8. It is not separately revisable — if
the preset store moves, this moves with it, for that reason and no other"* (`:1565`). The 7C row:
*"DEFERRED PAST M8, by 7B's derivation — it adapts what 7B matched, so it cannot precede it"*
(`:1566`) [doc-quoted].

The same day's commit, `9240d4f` (*"docs(M7): the preset story moves past M8, and nothing is deleted
automatically"*), recorded it [source-verified, `git log -S`].

### 2026-09-22 — the coordinator moves 7F3 with them

On 2026-09-15 the wave table was left with a defect it could not resolve by itself: *"7F3 depends on
7C, and 7C is DEFERRED PAST M8… A wave in M7 cannot depend on a wave that has left M7, and the table
does not say which of the two gives way"*. The scribe who found it left it open as *"a scheduling
call, not a documentation one"* (`:1600-1605`) [doc-quoted].

The coordinator resolved it on 2026-09-22: *"7F3 defers past M8 with 7B/7C"* (`:1605-1606`). The
7F3 row gives the reason: *"What is left of it is the preset list and its loading skeletons… and both
read the library (7P1) and the matcher (7B/7C) — so its dependency is not narrower than the row
states"* (`:1571`). Its one obligation that was M7-sized, *Continuă* at 1B, *"was already discharged
by 7F4"* (`:1572`, `:1606-1607`) [doc-quoted]. Recorded in commit `a67dcb8` (*"docs: plan M7 7T
S2/S3; defer 7F3 past M8; record 7T S1 and Q-7J-1"*) [source-verified].

### Exempt, by name: 7T

The live persistence suite was ordered before 7P1, but it is not part of the preset story. The 7P1
banner states: *"7T in particular should not wait for the preset story — it repairs coverage the
database seam has been missing all along"* (`:19372-19374`). The 2026-09-22 order says *"the 2026-09-15
deferral exempts it by name"* (`:1626-1627`) [doc-quoted]. 7T shipped in M7.

## Why — the reasons as recorded, and whose each one is

1. **The owner's reason is their own sentence and nothing more:** build automatic composition first,
   *"and just after focus on the presets functionality"*. No other reason from the owner is on record.
2. **Paraphrases of it exist, and they are paraphrases.** Commit `9240d4f`'s message says the owner
   deferred *"so they can see real generated kitchens before the shape of what stores them is worth
   fixing"*. The 7P2 plan's questions section says the owner deferred *"precisely so they could look at
   real generated kitchens first"* (`:21965-21966`) [doc-quoted]. Both come from the people who wrote
   those documents, not from the owner. They are consistent with the owner's sentence, but they are
   not a second ruling. **[inference]**: nothing in the repository shows the owner saying it that way.
3. **7B and 7C's reason is a dependency, not a preference.** Matching an empty library is vacuous,
   and adaptation needs a match. That is why they *"are not separately revisable"* (`:1565`).
4. **7F3's reason is also a dependency.** What remained of it reads the library and the matcher
   (`:1571`), and a wave inside M7 could not depend on waves outside it (`:1600-1603`).

## Decision

### 1. What is deferred past M8

| Wave | What it would have built | Ruled |
| --- | --- | --- |
| **7P1** | The preset store: migration, record schema, repository, read path, backup export (`:1562`) | owner, 2026-09-15 (relayed) |
| **7P2** | The authoring gate, the save endpoint and the editor's *save as preset* button, which is the project's freeze point (`:1563`) | owner, 2026-09-15 (relayed) |
| **7G** | Thumbnail captured at save, stored and served, plus the backfill (`:1564`) | owner, 2026-09-15 (relayed), through its dependency on 7P2 |
| **7B** | Preset matching: the ±600 window, fit, availability, one evaluation (`:1565`) | coordinator, 2026-09-15, **derived** |
| **7C** | Preset adaptation from the free ends and below a low ceiling (`:1566`) | coordinator, 2026-09-15, **derived** |
| **7F3** | Frame 1D's loading skeletons and frame 1E's preset list with *Folosește* and each card's declared changes (`:1571`) | coordinator, **2026-09-22** |

Together these are the whole customer-facing and owner-facing preset surface. That covers 1D, 1E,
*Folosește*, a card's price equalling the editor's, save-as-preset, the authoring session, the
`presets` table and its API, preset thumbnails, and the desktop line's D1D skeletons and D1E four-up
grid.

**The dates differ on purpose, and both stay on record.** 7F3 was not part of the 2026-09-15
deferral. For a week it sat in M7 depending on waves outside it, and it moved only when the
coordinator ruled on 2026-09-22.

### 2. Three of the six are the owner's and three are derived — and the derived three are not separately revisable

If the owner revives the store, 7B, 7C and 7F3 revive with it. No one may bring one of them back into
a milestone while the library stays deferred, because each one reads the library.

### 3. What M7 shipped instead: every buildable shape goes from its dimensions straight to composition

- ***Continuă* at a valid room composes.** `continueFromLengths()` calls `departTo("presets")` and
  then `run.compose(room)` (`apps/web/src/room/room-screen.tsx:364-372`) [source-verified at
  `a989a85`]. For the L (left and right) and the straight kitchen, the flow is 1A → 1B →
  (1C if refused) → 1D's valid form → *Continuă* → 1F composition → the editor at `/d/{id}`. No preset
  step sits between them. In the code, `"presets"` survives as the name of a URL destination
  (`room-query-sync.ts:94`). In the copy, it survives in three leaves, listed under *Consequences*.
- **No preset-authoring or preset-matching code exists under `apps/web/src`.** This was checked three
  times during M7 and once more for this record:
  - 7J's ground truth: *"Presets (7F3/7C) are deferred past M8; every shape goes 1D → 1F composition
    today"* (`:4071`) [doc-quoted].
  - 7K's ground truth: *"`git grep` over `apps/web/src` for `preset-authoring`, `saveAsPreset`,
    `save-as-preset` returns nothing"* (`:4371`) [doc-quoted].
  - 7L's ground truth: *"D1D and D1E have no surface in M7… Continuă at 1D goes straight to
    composition"* (`:4822`) [doc-quoted].
  - **Re-run for this record at `a989a85`** [source-verified]:
    - `git grep -i -E "preset-authoring|saveAsPreset|save-as-preset|Folosește|presetList|preset-list" -- apps/web/src`
      exits 1, with no match.
    - `apps/web/src/app/api/` holds only `cron` and `designs`.
    - `packages/persistence/src/migrations/` holds `0001`–`0006`, and none of them is a presets table.
    - `packages/configurator-domain/src/` has no `presets` module.
- **M7's own gates were narrowed by derivation, annotated in place rather than amended.**
  - The *Mobile (gate)* criterion (`:635-640`) now covers the bespoke-composition path. Its preset
    half moves with 7F3 (7K D2, `:4396-4402`), and the coordinator confirmed that reading as Q-7K-2
    (`:4789-4791`).
  - The *Desktop* criterion (`:641-645`) now covers D1A, D1B, D1C and D1F. D1D and D1E move with 7F3
    (7L D1, `:4838-4840`) [doc-quoted].

### 4. Reviving it — the trigger, and what a reviver inherits

**Trigger:** the owner's direction to start the preset work, which by the ruling comes after M8
(ADR 0118's form: recorded with its trigger, not built for). Nothing in this record schedules it.

**What a reviver must know, and much of it lives only in M7's archived plan:**

- **Re-measure; do not inherit.** The 7P1 and 7P2 plans were written at `41181d8` and are marked not
  dispatchable without re-measurement (`:19361-19368`, `:21402-21405`) [doc-quoted].
  - **The migration number they planned for is gone.** 7E3a took `0005` and 7E3c took `0006`, so a
    revived 7P1 starts at `0007` or later [source-verified, `packages/persistence/src/migrations/`].
- **The freeze-point deadline is already met.** 7D6 and 7D7 had to land *"before 7P2"* because the
  corner's reach becomes load-bearing on stored presets (`:1563`). Both shipped: 7D6 on 2026-09-18
  and 7D7 on 2026-09-19 (`:1551-1552`) [doc-quoted].
- **The preset model changed on 2026-09-15, and no ADR carries the change.** The owner's words,
  relayed and quoted in the 7P2 banner (`:21413-21419`) [doc-quoted]:

  > *"we mark private configuration as a preset. This preset we can move to its own table, and it
  > shouldn't depend on the initial private configuration. So these presets will be updated only by
  > the administrator… private configurations should not be messed and mixed with presets… when a
  > user will click on a preset it will make a copy of this preset… each time a user clicks to use a
  > preset, this preset creates a new record in private kitchens, linked to the specific user. In this
  > way, we will avoid any conflicts."*

  - **Copy-on-use is not in [ADR 0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md),
    and no plan covers it** (`:21439-21441`). The banner calls it *"the seam matching hangs off"*.
  - **This record does not amend ADR 0112 to add it.** A reviver writes that amendment before
    planning anything else, against the model as it then stands.
  - It is quoted here so that it survives M7's archival.
- **What survives from the plans:**
  - The separate `presets` table; the `names` map; `status` as the one gate; the nullable wall
    columns; no design id on the record; a separate administrator credential (`:21421-21430`).
  - The server-side gate, whole (`:21431-21433`) [doc-quoted].
  - Q-7P2-2, Q-7P2-3 and Q-7P2-4 were *"parked until revival, not asked"* (`:21964-21967`).
- **Where 1D/1E attach:** *"7F3 inserts 1D/1E in front of `use-generation`'s one entry call"*
  (`:1572`) [doc-quoted].

## Alternatives considered

- **Keep the preset story on M7's critical path, as originally ordered** (`:1610-1612`). Declined by
  the owner's direction of 2026-09-15.
- **Ship 7P1 in M7 so the store exists early, and defer only authoring.** The owner's words name
  storage as well as authoring and the admin panel (`:21398-21399`). The store's shape was also the
  thing that changed twice on 2026-09-15 (`:21407-21419`). A store fixed before its model settled
  would have been the expensive half of the freeze (`:19325-19333`) [doc-quoted]. Not taken.
- **Keep 7B and 7C in M7 and test them against fixture recipes.** They would have matched against a
  library that does not exist, so the product would have exercised them against nothing. This is the
  derivation in the 7B row (`:1565`).
- **Keep 7F3 in M7 with a narrower dependency, for example the skeletons alone.** Considered by the
  2026-09-15 scribe and left open (`:1600-1605`). Ruled against on 2026-09-22 because everything left
  in 7F3 reads the library and the matcher (`:1571`).
- **Leave the deferral in the milestone file and `STATUS.md`.** Rejected by 7K §7's reason
  (`:4627-4632`). The milestone is about to be archived, and archived plans are not read.

## Consequences

- **Every Step-1 design until revival is generation's baseline.**
  [ADR 0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)
  makes presets the route by which the owner's taste enters, and none exists yet. **[inference]** —
  falsified by any Step-1 path that produces a design other than `generateKitchen`'s. None exists at
  `a989a85` (§3).
- **ADRs 0109, 0112 and 0117 stand unamended.** Each names M7 waves in its *Milestone* line, and those
  waves are now past M8. Each gains a dated pointer to this record. Nothing in them is struck: the
  rules are right and simply not yet built.
- **[ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md)'s
  exception.** ADR 0112 narrowed ADR 0062 to allow the preset library's owner surface during M6–M8
  (SUPERSESSIONS.md). That exception now has no effect inside M6–M8, because the library comes after
  M8. **[inference]**. Nothing is re-decided: the narrowing stays recorded and becomes live again
  when the library returns.
- **Preset words ship in Step 1's copy, as written.**
  - `room.presetsAfterValid` — *"Presetele apar după ce toate valorile sunt valide."* — is on 1C
    (`apps/web/src/messages/ro.json:93`).
  - `room.compose.title` is *"Preset"* (`:99`).
  - `room.compose.noPresetNotice` opens 1F with *"Niciun preset gata făcut nu încape aici."*
    (`:103`) [source-verified].
  - 7F2 flagged the pairing for the owner and shipped it as written (`:14739-14741`) [doc-quoted].
  - Under an empty library, the 1F notice is always true, and the 1C note promises a list that never
    appears. That is the owner's copy to adjust under
    [ADR 0113](0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md)
    decision 4, whenever they choose. This record does not change it.
- **Stale lines remain elsewhere, and are named rather than silently fixed.**
  `docs/milestones/README.md`'s open-decisions table still lists *"The real '≤ 30 cm adjustment'
  preset-fit threshold"* and *"Real per-preset geometry recipes"* as M7's. The first was already
  retired by ADR 0109 Amendment A (±600). Correcting that table belongs to M7's close-out, not to
  this record.
- **M8 already assumes presets exist somewhere.** Its criterion 10 says *"A profile never grants
  preset authoring"* (`docs/milestones/M8-review-contact-success.md:133`). That must-not holds
  vacuously until revival and still binds M8.

## Decision-record sweep

| Record | What it says | Settled how |
| --- | --- | --- |
| [0109](0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md) | A preset is a recipe document; matching ±600, adaptation from the free ends (waves 7B, 7C) | **Stands, unbuilt.** Its waves are past M8. Pointer added. |
| [0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md) | Owner-authored library behind a server-side gate (7P1, 7P2, 7G) | **Stands, unbuilt, and incomplete.** The 2026-09-15 copy-on-use ruling (§4) is not in it, and its amendment is owed at revival. Pointer added. |
| [0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md) | Generation is the cheap, correct baseline; taste enters through presets | **Stands.** Until revival only the first half is live. Pointer added. |
| [0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | Record a problem with its trigger; do not build for it | **Applied.** §4's trigger is the owner's direction after M8. |
| [0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) | The price dashboard comes after M8; 0112 carved out the preset library | **Unchanged.** The carve-out simply has nothing to act on before M8 (Consequences). |
| [0113](0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md) | Step 1's copy approved as drafted | **Unchanged.** The preset words in Step 1's copy stay the owner's to adjust (Consequences). |
| [0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md) Amendment B | 7L's frame departures, recorded | **Lists D1D/D1E's absence** and cites this record as its reason. |
