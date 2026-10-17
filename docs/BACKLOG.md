# Backlog — index

Things found in use that are **not** currently being fixed and are **not** in a milestone plan. A
finding recorded only in a chat log is a finding lost.

This file is for product behaviour observed by someone using the app. It is not:

- **`docs/decisions/`** — the durable "why" behind the code. When a backlog item is decided, the
  decision goes there and the item leaves this file.
- **`docs/STATUS.md`** — where the project stands, including engineering deferrals from review
  rounds. Those stay there; this file does not duplicate them.
- **A milestone plan.** An item here has no owner and no phase until someone gives it one.

Each entry records what was observed, what is actually true in the code, and what deciding it would
cost — so the next person can act without re-deriving the investigation.

## Where the entries actually live

This file is an index only, split 2026-09-06 because the combined file had grown to roughly 2,250
lines. Nothing was deleted or rewritten — every entry below lives in full, unedited except for
status corrections, in one of these two files:

- **[`docs/backlog/open.md`](backlog/open.md)** — everything still open. Read this one. Ordered with
  items an owner or architect has already ruled or scheduled first, then fully undecided items, then
  an appendix pointing at findings whose full record lives elsewhere (`STATUS.md`, an ADR, a
  milestone).
- **[`docs/backlog/resolved.md`](backlog/resolved.md)** — everything fixed and shipped. Kept for
  history only; skip it unless you are specifically researching a past decision.

## Numbered entries, for lookup by number

| # | Title | Where |
| --- | --- | --- |
| 1 | The hob cannot be put back once it is removed | resolved.md |
| 2 | Rearranging a run: re-split, and the narrow bottle cabinet | open.md |
| 3 | Telling cabinets apart in the replace list | resolved.md |
| 4 | Moving and resizing a cabinet | resolved.md — closed 2026-09-06 (this pass), shipped M5 wave 5C |
| 5 | Wall cabinets over a column build too shallow | resolved.md — closed 2026-09-06 (this pass), shipped M5 waves 5A/5F |
| 6 | The 200 mm cargo is unreachable by any insert | open.md |
| 7 | A narrow body poisons the openings above it after a reload | open.md |
| 8 | A fixed-set body in a much wider opening leaves an unbuilt gap | open.md |
| 9 | A hood round trip costs a wall opening 100 mm of depth, permanently | resolved.md |
| 10 | Swap and delete-then-insert give a wall cabinet different depths | resolved.md |
| 11 | `base-dishwasher` offers a finish and a handle it has neither of | resolved.md |
| 12 | §3.2's column cannot express a middle level at its own width | open.md |
| 13 | The insert path ignores a width bound | resolved.md — closed 2026-09-06 (this pass), fixed by ADR 0032 rule 4 |
| 14 | Keep only the last few database dumps | resolved.md |
| 15 | A wall cabinet over a full-height column is built to a depth no one manufactures | resolved.md |
| 16 | No camera preset frames the right end of wall A's base run at the mobile viewport | open.md — ruled 2026-09-05, not built; **widened 2026-10-08 by M8 wave 8D: walls B and C and the U overview too, and the review's links land on a body the customer may not see; the owner's call at the hand check** |
| 17 | An emptied wall-A base run may render no void to insert into | open.md |
| 18 | A cabinet-hardware choice reaches the oven's and the microwave's bars in `tall-oven-tower` | resolved.md |
| 19 | The dishwasher decor door meets its own appliance at a 520 mm cabinet depth | resolved.md |
| 20 | A resized seeded body renames itself | resolved.md |
| 21 | The rendered shell and the seeded document disagree about the size of the room | resolved.md |
| 22 | A partly emptied column forgets what it freed | resolved.md |
| 23 | ADR 0032's refused rows are published but never rendered | open.md |
| 24 | The e2e suite went six days without being run | resolved.md |
| 25 | A narrow empty column can sit clipped against the frame edge | open.md |
| 26 | A resized column's freed space opens on different sides depending on position | resolved.md |
| 27 | An empty-column selection box is drawn deeper than what will actually fit there | open.md |
| 28 | PROPOSAL: remove all cabinets in a column at once | open.md |
| 29 | A refresh on the default route loses edits that were already saved to the database | open.md |
| 30 | PROPOSAL: mint the session id at intake (step 1) | open.md |
| 31 | A store action that throws leaves no trace on any surface | resolved.md |
| 32 | The chips row grows past the column | resolved.md |
| 33 | The settings trigger is a 93.5 x 13 px touch target | resolved.md |
| 34 | One interrupted persistence run reds the whole package until repaired | resolved.md |
| 35 | The joint-seat non-intersection gate needs oriented boxes, not AABBs | resolved.md |
| 36 | `HEIGHT_EXCEEDS_LEVEL` refuses a depth change after two ordinary deletes | resolved.md |
| 37 | Two pinned deep tops are 100 mm proud if a depth change ever reaches them | resolved.md |
| 38 | `resolveFinishesTheTierDoesNotOffer`'s `Set<DesignPlacement>` is membership by object identity | resolved.md |
| 39 | `wearsAFinishTheMaterialDoesNotOffer` and `wearing` are duplicated verbatim, twice | resolved.md |
| 40 | Comments naming a schema-version number go stale silently | resolved.md |
| 41 | The sink, its bowl and its faucet do not follow the cabinet-depth setting | open.md — ruled 2026-09-07 (ADR 0098), awaiting a wave |
| 42 | `tall-pantry`'s door-leaf/handle declaration should be pinned separately | open.md |
| 43 | Wave 6A2's own files carry no literal pin on the seeded row's rendered name | open.md |
| 44 | A vacuous test in `cabinet-depth-sweep.parity.test.ts` calls no production code | resolved.md — closed 2026-09-06 (this pass), test no longer present |
| 45 | A stale test name in `cabinet-handle-apply.test.ts` undercounts its own assertion | resolved.md — closed 2026-09-06 (this pass), test renamed |
| 46 | An orphaned doc comment in `cabinet-depth-rule.ts` is attached to the wrong function | resolved.md — closed 2026-09-06 (this pass), comment reattached |
| 47 | `alongWallPositionFollows` has a validator and no consumer | resolved.md — closed 2026-09-06, ADR 0089 / wave 6J-c |
| 48 | `apps/web`'s vitest environment has no DOM | open.md |
| 49 | The hob's front clearance reads as flush with the worktop's edge | open.md |
| 50 | `validateDesignForCatalog` is blind to a cross-wall corner intersection | open.md |
| 51 | Column chain-homogeneity is an invariant nothing enforces | open.md |
| 52 | A resize or an insert carries the wall-end cap into the recorded map | resolved.md — closed 2026-09-07, ADR 0090 Amendment B addendum |
| 53 | Russian is a supported locale — decided on day one, no milestone owns it | open.md |
| 54 | Cabinet depth changes the material used and does not change the price | open.md — shape ruled 2026-09-07 (ADR 0100), implementation deferred by the owner |
| 55 | The global settings actions are absent on a first visit and present after a reload | open.md |
| 56 | An emptied column over a full-height member can lose 269 mm of depth after a depth round trip | open.md — ruled 2026-09-08 (ADR 0102), awaiting wave 6Y |
| 57 | A depth change hands the hood a width control it is declared not to have | open.md — recorded 2026-09-08 (ADR 0103 decision 12), pre-existing, no owner |
| 58 | `THREE.Clock` is deprecated and React Three Fiber still constructs one | open.md — diagnosed 2026-09-08, third-party, nothing to fix here |
| 59 | `setCabinetDepth` slides every wall-B column and has no key-collision guard | open.md — recorded 2026-09-08, latent, not scheduled |
| 60 | A colour leaves the structural corner base white, and nothing tells the customer why | open.md — ruled and shipped 2026-09-09 in two waves; the ADR 0099 amendment is still owed |
| 61 | The open shelf sits on the handle line where the owner ruled it onto the door line | open.md — ruled 2026-09-09, deferred to its own wave |
| 62 | The narrower stacking fix on desktop — delete a number instead of adding one | open.md — waiting on a z-index audit across 900–1920 px, not taken on the last day of M6 |
| 63 | A hood is offered over wall A's corner, accepted, and then marked | open.md — recorded 2026-09-11 (M7 7D1 QA Q1.3), pre-existing, no owner; **narrowed 2026-10-01 (M7C C2, `0a1a69a`), not closed**: remains on the seeded kitchen, a U of 10 m or more, and designs stored before it |
| 64 | The run-end panel is not checked against the end of wall A | resolved.md — **closed 2026-09-11 by M7 wave 7D1b (`f61c361` + `85091cc`)** |
| 65 | An `it.fails` shell at height 2188–2199 can yield `PLACEMENT_ABOVE_ROOM` against `FIT_TOLERANCE_M`'s 12 mm | open.md — recorded 2026-09-11 (M7 7D1 QA Q3.1), pre-existing, not reachable by an approved room, no owner |
| 66 | The catalogue has three full-height rows and no broom / utility unit | open.md — ruled 2026-09-14 (ADR 0110 Amendment E, E12.4): new tall bodies wait for beta feedback |
| 67 | Tapping the overflow warning should move the camera to the marked body | open.md — wanted by the owner 2026-09-16 (M7 wave 7H, Q7H-8), not built, not scheduled. **Recorded as *66* when first written and corrected here the same day** — 66 was already the tall-body gap above, cited by number in ADR 0110, ADR 0117 and `milestones/M7-room-and-presets.md` |
| 69 | Two gate runs against one test database corrupt its migration ledger | open.md — observed 2026-09-18 on wave 7D6's push; environmental, wave 7T's subject, not scheduled |
| 68 | A large wood-decor run-end panel shows a visible grain tiling seam | open.md — observed 2026-09-17 in M7 wave 7D8's visual check of `dcec03f`, not compared against a pre-fix build, owner question, not built, not scheduled |
| 70 | The editor allows a kitchen with no oven | open.md — owner principle recorded 2026-09-21 (ADR 0110 Amendment M, M12), no owner, no phase yet |
| 71 | Re-tapping the selected *Vedere generală* chip does not reset the camera | open.md — seen by the 7D5b visual gate, 2026-09-21; no owner, no phase |
| 72 | Wide-U facing labels overlap | open.md — pre-existing, confirmed 2026-09-22 by M7 wave 7F2's visual gate; no owner, no phase |
| 73 | Language switch at Step 1B drops the room | open.md — confirmed 2026-09-22 by M7 wave 7F2's visual gate; contradicts `use-locale-menu.ts`'s own contract; no owner, no phase. **2026-10-08 (M8 wave 8D, R2.1): the same links drop the editor's two arrival parameters, and the menu is drawn on three screens** |
| 74 | An open help popover covers the field above it | open.md — found 2026-09-22, M7 wave 7F2's S5b × 7A3 interaction; low; no owner, no phase |
| 75 | A second field problem is not re-announced while the note already shows | open.md — raised 2026-09-22 by M7 wave 7F2's S3 review R1.6; needs copy; no owner, no phase |
| 76 | `DRAWABLE_WALLS` has no exhaustiveness tie to `requiredFieldsFor` | open.md — raised 2026-09-22 by M7 wave 7F2's S5 review R1.4; no owner, no phase |
| 77 | Press completion assumes `click` fires in the same task as `mouseup` | open.md — recorded 2026-09-22 from `use-after-press.ts`'s own header; verified in Chromium only; no owner, no phase |
| 78 | Mid-typing slivers under mm entry | open.md — captured 2026-09-22 by M7 wave 7F2's visual gate; deliberate under C-7F2-1; owner question, no phase |
| 79 | 16 rows leaked in the test database, pre-S1 configure-route specs | open.md — found 2026-09-23 by M7 wave 7E4's QA; leak closed by the wave, rows themselves not deleted (ADR 0006); no owner, no phase |
| 80 | The store's mint-on-first-command branch has no reaching route since 7E3a | open.md — found 2026-09-23 by M7 wave 7E3a's review (L1.3); needs its own dated retirement record; no owner, no phase |
| 81 | SEC-7E3a.1 — cookie fixation is harmless today, durable read access once 7E3b lands | resolved.md — **CLOSED 2026-09-23, shipped in M7 wave 7E3b**: random rotation on every mint (ADR 0114 H1, kept through H6) |
| 82 | A share link's trailing slash gets Next's headerless 308 before the proxy runs | open.md — found 2026-09-23 by M7 wave 7E3c's close-out (ruling b); accepted, no owner, no phase |
| 83 | A client-side transition between two hydrated designs logs a dev-only React warning | open.md — found 2026-09-23 by M7 wave 7E3c's close-out (ruling c); pre-existing in `HydrateAndConfigure`; no owner, no phase |
| 84 | SEC-7E3c.5 — the platform's own error logger may print a token hash on a share-token PK collision | open.md — found 2026-09-23 by M7 wave 7E3c's security review; our own log lines are clean; no owner, no phase |
| 85 | Criterion 9's share-view leak scan did not exercise a camera preset | open.md — found 2026-09-23 by M7 wave 7E3c's review (L1.5); no owner, no phase |
| 86 | Optional hardening: `GRANT UPDATE (revoked_at)` on `design_share_links` instead of table-wide `UPDATE` | open.md — found 2026-09-23 by M7 wave 7E3c's security review (SEC-7E3c.3); no owner, no phase |
| 87 | Visual J6 — a never-saved design's absent share section is unreachable via the UI, covered only by a DOM test | open.md — found 2026-09-23 by M7 wave 7E3c's visual pass; no owner, no phase |
| 88 | SEC-7E3b.1 — an attacker's rows planted under a fixated value move into the victim's identity on rotation | open.md — found 2026-09-23 by M7 wave 7E3b's security review (R4); owner to decide: record or prefer browser-minted rows on resume |
| 89 | R2.2 / SEC-7E3b.2 — the create-design lock covers only the mint `POST`; a save-vs-rotation race can revert the jar to a value owning nothing | open.md — found 2026-09-23 by M7 wave 7E3b's logic and security reviews independently; recorded to tell the owner, not fixed. **Measured 2026-10-09** (relayed, QA-run): 12 of 100 rounds under eight workers, 1 of 10 in a whole `CI=1` run, so "plausibly rare" no longer holds; two proposed fixes, the owner's decision; not established on a CI runner. **Now Q35 (2026-10-09, wave 8F): recorded, not decided; three options (a, b, c), the architect recommends (c); 0 of 100 rounds with the limiter is not a fix; blocks 8T's gate unless the owner accepts the residual** |
| 90 | SEC-7E3b.3 — the rotation `UPDATE` has no rate limit | open.md — found 2026-09-23 by M7 wave 7E3b's security review; deferred to M8's limiter (ADR 0114 decision 7) |
| 91 | There is no full-height oven column without a microwave | open.md — owner, 2026-09-29 (M7B Q-U3, relayed); recorded at ADR 0110 Amendment N; not in M7B, no owner, no phase |
| 92 | The largest storable design row grows to 523,972 bytes | open.md — found 2026-09-29 by M7B wave U1's security review (S1.1, Low); ADR 0019 SEC-001/DB-002's accepted risk should be re-measured; deferred to M8's launch gate |
| 93 | No per-shape empty-column count check bounds an L/straight document's wall-C entries | open.md — found 2026-09-29 by M7B wave U1's security review (S1.2, Low); optional, not built, no owner, no phase |
| 94 | AC6's mirror-equivariance property ran on arbitrary U documents, not generated U kitchens | open.md — **CLOSED 2026-09-29 by M7B wave U2**: the property re-ran on real `buildUShellDesign` outputs (200 samples plus ~80 boundary rooms), 0 findings, voids mirroring |
| 95 | The A∩C corner sweep also fires a mark-severity finding on L/straight documents with a stray wall-C span | open.md — found 2026-09-29 by M7B wave U1's logic review (R1.4, disagreement not a bug); AC2 not at risk; gating on `wallsOf` is optional, not done, no owner, no phase |
| 96 | The engine's minimum-kitchen figures omit the 100 mm reserve, so they cannot be switched on as a gate | open.md — found 2026-09-30 at M7B wave U3b's close-out; latent (`isRequired: false`), U6 brings the approved 1000; no owner until U6 |
| 97 | Generation below the approved ceiling floor (2200) throws for every shape | open.md — found 2026-09-30 at M7B wave U3b's close-out; a U throws from 1900 (RQ7's hood), the L succeeds at 2000; unreachable under approved heights; no owner, no phase |
| 98 | A reload shows the seeded L (3 chips) before the loaded design | open.md — found 2026-09-30 at M7B wave U5's close-out; pre-existing since zustand 5, beside 83; latent cross-request store write for a security reviewer; not a U6 blocker; no owner, no phase |
| 99 | Plan-preview label fit has known limits (three cases) | open.md — found 2026-09-30 at M7B wave U5's review; recorded in test comments, not fixed; needs a copy or layout decision; no owner, no phase |
| 100 | Six orphan design rows in the test database | open.md — found 2026-09-30 at M7B wave U5's visual review; not deleted (add-only); **owner answered 2026-09-30 (Q-U7-2): "Leave them"**; one more row 2026-10-07 (8A S1) and five more 2026-10-08 (8D's visual verifier), which that answer does not cover |
| 101 | The shape-refusal region is kept on purpose, though no shipped path draws it | open.md — recorded 2026-09-30 at M7B wave U6's close-out; if a future policy stops stating a shape, the e2e tests removed in U6 (E3, E4's U half, E5, E9) must come back; no owner |
| 102 | Dev-only security candidates from the undici review (js-yaml, vitest, Node's bundled undici) | open.md — found 2026-09-30; lockfile refresh, a major vitest upgrade and a Node patch release respectively; not scheduled, no owner |
| 103 | Editing the room's size keeps none of the customer's changes | open.md — wanted by the owner 2026-10-01 (M7C Q1); not built, no phase |
| 104 | A cabinet cannot be resized through a fixed-width neighbour | open.md — asked by the owner 2026-10-01 (M7-FB-010, M7C Q6); the generator half is M7C wave C5; not built, no phase |
| 105 | Step 1's desktop footer departs from the mockup frames in three places | open.md — found 2026-10-01 by C1 S1's review; not fixed, no owner |
| 106 | The e2e desktop shard 2/3 sits at exactly its 70-test budget | open.md — found 2026-10-01 by C1 S1's QA; not scheduled, no owner. Updated 2026-10-08: desktop 69 / 70 / 62 of 70, mobile now six shards |
| 107 | A design stored before ADR 0135 keeps the old corner geometry | open.md — accepted pre-release 2026-10-01; read-side fix not built; the record is ADR 0135 |
| 108 | `wallCabinet`'s two-door leaves are 3 mm apart where the kit's `GAP` is 4 mm | open.md — found 2026-10-01 by C2 S1's review; pre-existing, not changed; no owner |
| 109 | The corner wall unit's names and prices are placeholders awaiting the owner | open.md — M7C plan Q8 (i)/(ii); built with defaults 2026-10-01; owner input pending |
| 110 | A wall door beside a hood or fridge at the unit's far edge cannot open past about 90° | open.md — a manufacturing note, not a defect; recorded 2026-10-01 from C2 S2 |
| 111 | On the 900 px desktop card the back confirmation's text is left-aligned and its buttons centred | open.md — found 2026-10-02 by C1 S3's QA; the owner asked for the buttons only; no owner |
| 112 | The settings confirmation's alignment has no unit-level guard | open.md — found 2026-10-02 by C1 S3's QA; only the browser specs catch it; not scheduled |
| 113 | The shared confirmation component still lives under `apps/web/src/settings/` | open.md — recorded 2026-10-02; move when a third asker appears |
| 114 | Two e2e helpers break on the generated top row | open.md — found 2026-10-02 by C3 S1's QA; **closed 2026-10-06, fixed in `fecd430` (CE S1)** |
| 115 | The 2600 mm top-row line is derived in two places | open.md — recorded 2026-10-02 by C3 S1; pinned by QA; not scheduled |
| 116 | A refused top-row insert becomes a `not_placed` step with no customer-visible reason | open.md — recorded 2026-10-02 by C3 S1; not observed in the census |
| 117 | The remote test database drops connections intermittently (a share-POST 500, a persistence lock test) | open.md — found 2026-10-06 by the pre-push gate; unexplained; no owner |
| 118 | Dev-scope advisories in the lockfile (tinypool, js-yaml, brace-expansion, braces, vitest); extends 102 | open.md — found 2026-10-06 by the security review; not scheduled, no owner |
| 119 | A client transition probes write access for the design being left | open.md — found 2026-10-06 by CE S2; harmless (the answer is dropped); a fix is production code; owner's call |
| 120 | The first WebGL frame can hold "Se verifică accesul" for seconds on a slow device | open.md — found 2026-10-06 by CE S2; a product question, not a defect; no owner |
| 121 | F1 — `scripts/gates/boundary.sh` matches a driver import on one line only | **Closed 2026-10-08 by M8 wave 8D3** (`b5aed77` … `be4ffe2`); follow-ups 136 to 138. Found 2026-10-07 by M8 8B's QA |
| 122 | F5 — a session close that never returns hangs `applyMigrations` | open.md — found 2026-10-07 by M8 8B's QA; unmeasured; the coordinator, before 8S, after the owner approves a measurement |
| 123 | F6 — do Neon's connection strings carry `sslrootcert` or a sibling? | open.md — recorded 2026-10-07; a documentation read, the coordinator's |
| 124 | QA18 (census blind to a second `Client` through the opener), "Finding …" journal comments in three test files, and two 8C review nits in `review-model.ts` | open.md — recorded 2026-10-07; low priority, no owner. Gained 2026-10-08 (8D): two long comments in `use-honour-arrival.ts`, an unattributed line beside the locale chip at 1440 px, the Russian top-bar title truncated, the chip's height |
| 125 | Three e2e specs fail under `CI=1`, uninvestigated | open.md — found 2026-10-07 by M8 8A S1. **TRIAGED and closed 2026-10-09** (`m8-e2e-triage` at `af55c16`, relayed): one product defect (the two-tab race, entry 89), one test fault (the top-bar Control/Meta click, entry 161), the lock spec's failure not reproduced; nothing else failed in a whole `CI=1` run of 677 |
| 126 | The price bar and the breakdown print "De la 0 MDL" for a kitchen holding only customer-supplied bodies | open.md — found 2026-10-07 by M8 8C's QA (QA1); what such a kitchen should show is the owner's; no phase |
| 127 | No test pins the Russian wording of any leaf, project-wide | open.md — found 2026-10-07 by M8 8C's QA (a surviving mutation); no owner, no phase |
| 128 | The editor shows a save conflict only inside the panel; an editor with nothing selected says nothing | open.md — found 2026-10-08 by M8 8D's QA (QA11); M4's open question; a product question first, no phase |
| 129 | A real finger during the scene's first frame is delivered after the rest and lands on the just-opened panel | open.md — recorded 2026-10-08 at M8 8D's close, unmeasured; trigger: the first real-device pass |
| 130 | A two-finger pinch may read as a tap and drop a pending arrival | open.md — recorded 2026-10-08 at M8 8D's close; an inference; trigger: the first real-device pass |
| 131 | The camera chips are written twice (editor and review) | open.md — recorded 2026-10-08 (8D ruling 5); trigger: a third place that draws them |
| 132 | `loadOwnedDesign` takes an id of any shape | open.md — found 2026-10-08 by M8 8D's security review (R1.2); owner: wave 8L, slice S2 |
| 133 | The review's first screenful holds about half the rows it held before 8D2 | open.md — recorded 2026-10-08 at M8 8D2's close; the owner's hand check |
| 134 | A faint vertical hairline left of the Russian chip at 1440 px | open.md — carried from 8D, cause not found; probably 124 item 2; no owner |
| 135 | The app has no `error.tsx` or `global-error.tsx` | open.md — found 2026-10-08 by M8 8D2's combined review; no owner, no phase |
| 136 | The boundary gate's supplier-folder check has no manifest behind it (`vi.mock` of a `design-source` path passes); `capture-reference-rig.mjs:29` names a path in `design-source/` | open.md — found 2026-10-08 by M8 8D3's combined review; no owner, no phase |
| 137 | The boundary gate knows two driver names (`postgres`, `pg-pool`, a relative path into persistence's `node_modules` pass) | open.md — found 2026-10-08 by M8 8D3's combined review; no owner, no phase |
| 138 | The boundary gate flags a string literal containing `import 'pg'` | open.md — found 2026-10-08 by M8 8D3's combined review; a false positive, none on the real tree; no owner |
| 139 | The older three tables' grant tests are blind to `PUBLIC`; grant option, column grants, the database-owner gap, `CREATE`/`TEMP`, and the file's clean-code R2.1/R2.2 | open.md — found 2026-10-08 by M8 8E's QA and security review; owner the coordinator with the security reviewer; trigger the delivery milestone's launch gate |
| 140 | CI never sets `DATABASE_URL`, so the privilege file never runs on a runner | open.md — recorded 2026-10-08 at M8 8E's close; the delivery milestone's |
| 141 | One code-less `NeonDbError` among 150 concurrent hits, seen once | open.md — recorded 2026-10-08; not reproduced; trigger: a recurrence |
| 142 | Owner decisions from 8E: ~~S2's over-count~~ and ~~the keyed hash~~ decided 2026-10-08; what remains is whether the two guarded deletes (now on preview) stay, and the `.gitignore` line `vercel env pull` added | open.md — recorded 2026-10-08, updated at 8H's close; the owner's |
| 143 | The revision shape admits nineteen digits, past a bigint column's range (F12) | open.md — found 2026-10-08 by M8 8H's QA; persistence's; trigger: `design-revision.ts` is next opened |
| 144 | Any export of contact data neutralises a leading `=`, `+`, `-` or `@` | open.md — recorded 2026-10-08 at 8H's close; trigger: an export is built |
| 145 | A web-suite run failed once (1 of 6227), unidentified | open.md — seen once in five runs 2026-10-08; a possible recurrence with a name added 2026-10-08 (`client-write-path.adversarial`, not established to be the same test); **a second named sighting 2026-10-09** (`plan-preview-model.facing-labels.test.ts:255`, a test-side cause: seed the property; no recurrence needed); **seen flaky again during 8U/8V, 2026-10-17 [relayed]**; trigger: a recurrence |
| 146 | Count the stored design ids that lack the generator's shape, before 8L S2 | open.md — recorded 2026-10-08; **resolved by owner ruling 2026-10-12 (nothing in production; ADR 0159 Amendment A); the owner must still confirm no production data exists at merge time** |
| 147 | `e2e-shard-budget` failed at `ee834b6` and the pre-push hook runs it | open.md — **closed 2026-10-08**, owner chose option 1, fixed in `8aba717` (the file split); residue is 153 |
| 148 | A metres field and a dangling separator (`3,` `,5`): refuse, or read as a value? | open.md — **closed 2026-10-08**, ruled by the owner ("no separator should be accepted"), pinned in `eaef634`; the URL question is 154 |
| 149 | The empty `test.fixme` in `global-settings-apply.e2e.spec.ts` is the only record of an unasserted behaviour (row 2881) | open.md — fixme deleted 2026-10-08 (`eaef634`, owner's choice); **the gap stays open**: no browser route reaches a detached probe |
| 150 | A third copy of the undeclared-or-offers check, `withoutAFinishTheMaterialRefuses`, without the schema check | open.md — found 2026-10-08 by the D3 logic review; a drift risk; trigger: that function is next opened |
| 151 | `DESIGN_ENVELOPE_BYTES` is public through `export *` for one test | open.md — recorded 2026-10-08; the owner approved the export; trigger: a second reader or a surface trim |
| 152 | Single-guard behaviours were not collected; the two-tab lock's desktop rounds were removed | open.md — recorded 2026-10-08; trigger: the next test audit |
| 153 | The desktop e2e ceiling stays 70 with a largest shard of 67; the gate script's comment and three test comments name the deleted spec | open.md — **closed 2026-10-08**: ceiling 70 to 67 and the comments fixed in `18283a8` |
| 154 | Should the room URL carry millimetres instead of metres? | open.md — recorded 2026-10-08; undecided; the owner's; trigger: the URL's wire form is next touched |
| 155 | The only consent text version in code is `"placeholder"` (`packages/configurator-domain/src/contact/contact-fields.ts:26`): a launch item | open.md — recorded 2026-10-09 at M8 8I's close; the owner's consent text (Q7); trigger: before launch (M9) |
| 156 | The boundary gate (`scripts/gates/boundary.sh`) does not catch a test importing another package's tests by relative path | open.md — found 2026-10-09 in 8I's review (C-R1.1), fixed in the one file; trigger: the next change to the gate |
| 157 | For the milestone-close test audit: 8I's QA files restate six cases the developer's tests hold, file sizes and other nits | open.md — recorded 2026-10-09 at M8 8I's close; trigger: the M8 close audit (ADR 0152 Amendment A) |
| 158 | The mail tests' fixtures are duplicated between the developer's and QA's files (fake key and addresses, fetch stubs, notice fixtures, the dressed-kitchen fixture) | open.md — recorded 2026-10-09 at M8 8J's close (JC-R1.12, JC-R1.18); trigger: 8K's first test that needs them |
| 159 | For the milestone-close test audit: 8J's restated pairs, the nits and JC-R1.20/1.21, with the file sizes at review | open.md — recorded 2026-10-09 at M8 8J's close; trigger: the M8 close audit (ADR 0152 Amendment A) |
| 160 | The mail adapter's answer mapping moves to its own module | open.md — recorded 2026-10-09 at M8 8J's close (JC-R1.8); **closed 2026-10-17: the Gmail adapter's answer table is its own module, `mail/smtp-answer.ts` (8J2 S1 `b51899a6`; ADR 0164 d5)** |
| 161 | The Control/Meta-click spec's URL wait is a test fault; the two-tab helpers hide the status of a lockout | open.md — recorded 2026-10-09 by the triage of 125; **closed 2026-10-09, fixed in `c5432da`** |
| 162 | A pixel comparison in `qa-8d-review-scene…e2e.spec.ts:188` flickered once in a whole `CI=1` run | open.md — recorded 2026-10-09 at M8 8F's close; trigger: a recurrence, or the M8 test audit |
| 163 | A tap on Continuă immediately after Step 1 loads does nothing (before hydration) | open.md — recorded 2026-10-09 (visual verifier); a product question; no owner |
| 164 | One unidentified `404` resource appears on Step 1 in every run | open.md — recorded 2026-10-09 (visual verifier); not established what; no owner |
| 165 | Both e2e harness servers listen on every interface | open.md — recorded 2026-10-09 (security F-S2.4); trigger: loopback only, measured on its own |
| 166 | The environment type and its own-member read are written three times across mail, digest and network | open.md — recorded 2026-10-09 (clean-code FC-R1.9); trigger: the fourth reader, 8G or 8K |
| 167 | For the milestone-close test audit: 8F's restated pairs and remaining should-fix and nits | open.md — recorded 2026-10-09 at M8 8F's close; trigger: the M8 close audit (ADR 0152 Amendment A) |
| 168 | A design returned to by Back or Forward is shown from the page's kept copy, older than the stored one, and as saved (C2-1; with GL-R4.1, the same path for a failure's backoff) | open.md — found 2026-10-10 by M8 8G's QA; **closed 2026-10-12 by M8 wave 8K2** (`5f0d93f6` … `7d282603`, ADR 0158); QA's two tests pass unmarked |
| 169 | The coalescer's two long functions and its one invariant kept in four places | open.md — recorded 2026-10-10 at M8 8G's close (GC-R3.10); **closed 2026-10-12 by M8 8K2 S2 (`7b16568a`)** |
| 170 | A save's deciding policy is named by a closure's side effect | open.md — recorded 2026-10-10 (GC-R3.7); trigger: a third step, which 8K's judge may be |
| 171 | `isSavePaused` narrows only the time; answer the time itself | open.md — recorded 2026-10-10 (GC-R4.1); **predicate closed 2026-10-12 by M8 8K2 S2 (`1087f45b`)**; the two nits are S3's item 4 and 184 |
| 172 | For the milestone-close test audit: 8G's renames blocked by two `qa-*` pins, and the rest | open.md — recorded 2026-10-10 (GC-R3.9 to R3.11, nits); trigger: the M8 close audit (ADR 0152 Amendment A) |
| 173 | Step 1's first save refused reads as a plain failure | open.md — recorded 2026-10-10 (GL-R3.3); trigger: Q37 answered (a) |
| 174 | One cold-start timeout in Step 1's hand-off, seen once | open.md — recorded 2026-10-10; not reproduced; trigger: a recurrence |
| 175 | Calls at once under one id are each counted as a new request (K-S2.1) | open.md — recorded 2026-10-12 at M8 8K's close; trigger: 8L cannot hold one request in flight, a customer refused for a request the shop received, or M9's hardening |
| 176 | The application has two price-book roots; they must become one before either names another book | open.md — recorded 2026-10-12 (ADR 0062 seam 1 note; ADR 0157 d8); trigger: before either root names another book |
| 177 | For the milestone-close test audit: 8K's restated pairs (KC-R1.19), KC-R2.1 to R2.3 | open.md — recorded 2026-10-12; trigger: the M8 close audit (ADR 0152 Amendment A) |
| 178 | Bytes that are not UTF-8 are stored and mailed as replacement characters (K-S2.2) | open.md — recorded 2026-10-12; trigger: a reader of stored contact fields as bytes, or a strict mode in the shared reader |
| 179 | Round-2 notes: eager leaves make one bad leaf a `503` for all (KL-R2.1), no end-to-end test of a missing leaf, the log tests' mail list | open.md — recorded 2026-10-12; trigger: a `contact-request-unavailable` line with `unexpected` on every request |
| 180 | `prepareSubmission` takes three arguments | open.md — recorded 2026-10-12; trigger: the next change to it or its callers |
| 181 | 8K's recorded notes: a book changed without its version (K-S1.7, KL-R1.1), unpriceable design (KL-R1.5), ports before the first count (KL-R1.6) | open.md — recorded 2026-10-12; trigger: a deployment while a not-sent line is in the log; an `unexpected` cause |
| 182 | `pnpm ci:local`'s e2e step runs `next dev`, where the exact-read-count specs cannot hold; the push is blocked | open.md — recorded 2026-10-12 at M8 8K2's close; **owner: Q42** |
| 183 | One discriminated union in place of `resumesAtMs` and the optional `heldAs` | open.md — recorded 2026-10-12 (clean-code); trigger: that module's next change of behaviour |
| 184 | Rename `WaitingWrite` to `HeldWrite` (touches QA-owned tests) | open.md — recorded 2026-10-12 (clean-code); trigger: 183, or the M8 close audit |
| 185 | The re-export of `isGreaterRevision` in `hydrate-and-review.tsx` exists only for a `qa-*` pin | open.md — recorded 2026-10-12 (clean-code); trigger: QA repoints the test, then delete |
| 186 | A held write that has outlived its limit wait still shows its past time until the next `runSave` | open.md — recorded 2026-10-12 (logic finding 1, minor); trigger: Q38 answered, or a customer told a time that had passed |
| 187 | No test drives `HydrateAndReview` with a held write in each of the four states | open.md — recorded 2026-10-12; owner: 8L, with criterion 14 |
| 188 | 8K2's recorded limits and reports: K2.4, L1, L5, L6, a frozen tab, the sweeps' form | open.md — recorded 2026-10-12; triggers in the entry |
| 189 | A malformed percent-escape in a path (`/ro/d/%E0%A4%A`, `/ro/s/…`, `/%E0…`) answers 500, not 400; no leak, predates 8L (8L's security F4) | open.md — recorded 2026-10-12 at M8 8L's close; optional proxy fix |
| 190 | `usePriceBookVersion()`, a version-only reader, so `contact/use-contact-submission.ts` leaves the price allow-list (8L's F5) | open.md — recorded 2026-10-12; trigger: the next change to the hook or to the allow-list |
| 191 | 8L's clean-code deferrals: shared `HydrateStoredDesign`; the hook reads the store by `getState`; five files not read in depth | open.md — recorded 2026-10-12; triggers in the entry; the unread files go to the M8 close audit / 8T |
| 192 | The locale switcher is 25 px high, under the 44 px touch target; likely inherited from the mockup | open.md — recorded 2026-10-12; owner: the human, at the hand check or 8T |
| 193 | 8L's earlier deferred items carried: the discriminated-union hand-over type, `WaitingWrite` to `HeldWrite`, security F2 and F6 optional hardening | open.md — recorded 2026-10-12; points to 183, 184 and the security report |
| 194 | 8L's unproven list: real keyboard and autofill, a real 422, a send in flight on leaving, e2e mutants, leftover test-database rows, one desktop flake | open.md — recorded 2026-10-12; 8T's phone gate and the M8 close audit |
| 195 | A whole-run e2e failure that passes alone: `qa-8d-review-scene.adversarial` :189 (32757 against at most 60) | open.md — recorded 2026-10-13 at M8 8M's close; trigger: a second occurrence, or the close audit |
| 196 | No index serves `findSentReference`'s query | open.md — recorded 2026-10-13 (security); additive migration if leads grow, never edit `0008` |
| 197 | The sent request's typed phone or e-mail stays in tab memory until a reload or the next design form | open.md — recorded 2026-10-13 (security); optional clear on unmount |
| 198 | An import cycle between `contact/` and `done/` (`ChannelSummary`, `ResultHeading`, `ReviewLink`) | open.md — recorded 2026-10-13 (clean-code) |
| 199 | Comments citing `8M.3` and long headers (ADR 0136) | open.md — recorded 2026-10-13 (clean-code) |
| 200 | Long hooks and components (`useContactSubmission`, `WhatsappActionControl`), two `*BackLink` near-duplicates, naming | open.md — recorded 2026-10-13 (clean-code) |
| 201 | A visible focus ring on the `h1` after a reload or in the no-request view | open.md — recorded 2026-10-13 (visual); owner: the human |
| 202 | The no-request view's heading looks unstyled against 5A | open.md — recorded 2026-10-13 (visual) |
| 203 | The interim line's look, and its wording; proposed leaf `contact.leavingLine` | open.md — recorded 2026-10-13; **owner approves copy** |
| 204 | Contrast of the 10.5 px *Număr cerere* label unmeasured | open.md — recorded 2026-10-13 (visual); 8T |
| 205 | WhatsApp action: no spoken *busy* leaf; *go on* reuses `share.reissue` | open.md — recorded 2026-10-13; the owner's copy pass |
| 206 | 8M's logic notes: F2, F3 (`canWrite` after a `/done` reload), not-sent wording, revision drift | open.md — recorded 2026-10-13; owner questions |
| 207 | Addresses whose last segment looks like a file (`/ro/zz.png`, `/ro/configurator/zz.svg`, `/_next/static/zz.js`) answer a `404` `text/html` with no CSP (the `proxy.ts` matcher) | open.md — recorded 2026-10-13 at M8 8Q's close; Low |
| 208 | `/ro/%` answers `500` | open.md — recorded 2026-10-13 (8Q) |
| 209 | F5: the `proxy.ts` matcher and the request body size | open.md — recorded 2026-10-13 (8Q security) |
| 210 | F6: one database write per refused CSP report request; an optional `Origin` pre-check before counting; an M9 firewall rule | open.md — recorded 2026-10-13 (8Q security); M9 |
| 211 | Cold-start `503` flake in the mint and contact specs (five specs, each passes alone) | open.md — recorded 2026-10-13 (8Q QA) |
| 212 | The `csp-report-limited` line is memoised per instance, so a multi-instance host writes one per instance an hour | open.md — recorded 2026-10-13 (8Q) |
| 213 | A report's `origin` may read `foreign` behind a TLS terminator | open.md — recorded 2026-10-13 (8Q); check on the real host |
| 214 | `packages/configurator-domain/package.json` has no `sideEffects` field, so a bundler may skip `zod-without-eval.ts` if marked `false` | open.md — recorded 2026-10-13 (8Q) |
| 215 | The unmatched-address sweep spec exempts any last segment matching `/\.[A-Za-z0-9]{1,8}$/`, broader than the matcher | open.md — recorded 2026-10-13 (8Q QA) |
| 216 | The lint rule against a direct `"zod"` import does not catch a dynamic `import("zod")` | open.md — recorded 2026-10-13 (8Q) |
| 217 | The summary-card thumbnail is a striped placeholder on a fresh design (unverified as a defect) | open.md — recorded 2026-10-13 (8Q visual); Low |
| 218 | The ru top-bar title truncates to "Конфигур…" at 390 px (unverified as a defect) | open.md — recorded 2026-10-13 (8Q visual); Low |
| 219 | The CSP report sink moves from the server log to a table in our own database (owner's Q46 = (c)) | open.md — recorded 2026-10-13; **built in wave 8Q2, closed 2026-10-14** ([plan](milestones/done/8Q2-csp-report-table.md), ADR 0162 Accepted); `0009` and its grant on preview and production are owner actions, not done |
| 220 | H1: `contact-answer.ts`'s 60 s unreadable wait is pinned only against its own constant; no record fixes 60 s | open.md — audit 2026-10-13 (held) |
| 221 | Unguarded: `prepare-submission.ts:88` (`NO_CABINET` branch) and `:90` (`PRICING_VERSION_MISMATCH` cause, unreachable in tests) | open.md — audit 2026-10-13 |
| 222 | Unguarded: `submit-contact.ts:303` (`channel === "email" && email !== undefined`, `&&` to `\|\|`) | open.md — audit 2026-10-13 |
| 223 | Unguarded: `contact-log.ts` HTTP status bounds 100 and 599 | open.md — audit 2026-10-13 |
| 224 | Unguarded: the Chisinau-day clock, the limiter's timer bounds and the prune's day step | open.md — audit 2026-10-13 |
| 225 | Unguarded, related-run survivors not re-run against the whole suite (seven sites: online snapshot, `data-ready`, review prefetch, `ssr:false`, a one-width range, a four-segment editor path, selection through a global-finish change) | open.md — audit 2026-10-13 |
| 226 | Unguarded: `client-network.ts` (`LONGEST_ADDRESS_TEXT` is dead code; two truth-table cases missing) | open.md — audit 2026-10-13 |
| 227 | Unguarded: `scripts/gates/boundary.sh` treats a `git grep` failure (exit above 1) as clean | open.md — audit 2026-10-13 |
| 228 | Whole-run e2e failure that passes alone: `global-colour.e2e.spec.ts` 208 and 230 (`storedColour` empty); not proven | open.md — recorded 2026-10-14 (8Q2 close) |
| 229 | The live pattern differential costs 28 s per persistence live run | open.md — recorded 2026-10-14 (8Q2 QA note) |
| 230 | Second-server report rows are bounded only by the sink spec | open.md — recorded 2026-10-14 (8Q2 QA note) |
| 231 | `requireValidCspReportPlacement` and its three QA-owned cases could be deleted outright | open.md — recorded 2026-10-14 (8Q2 QA edit) |
| 232 | Four persistence live files fail at collection with every database variable blanked (`neon('')` in a `describe` body; pre-existing) | open.md — recorded 2026-10-14 (8Q2 QA note); **seen again 2026-10-17 (8V): the non-live recipe in `ci-and-local-gates.md` does not hold for these files** |
| 233 | The store's `lock_timeout` is not tested with a real contending lock | open.md — recorded 2026-10-14 (8Q2 close) |
| 234 | `contact_submissions` test-database leak: one `ro` and one `ru` row per multi-spec e2e invocation; writer spec unknown; pre-existing, 30 rows | open.md — recorded 2026-10-14 (8M2 close) |
| 235 | The launch gate refuses only the exact placeholder; `deploy.yml`'s gate is not Vercel's, so the checklist line is the real gate | open.md — recorded 2026-10-14 (8M2 close) |
| 236 | `deploy.yml` F1 (Low): the gate step runs build tools with `MIGRATION_DATABASE_URL` in env; wants a separate no-secrets job; owner not yet answered | open.md — recorded 2026-10-14 (8M2 close) |
| 237 | ro leaf `panel.accessUncheckableNotice` typo "poți modifică"; needs the owner's sign-off | open.md — recorded 2026-10-14 (8M2 close) |
| 238 | Already-sent `h1` is 22 px against 24 px; its focus ring touches the glyph edges (cosmetic) | open.md — recorded 2026-10-14 (8M2 close) |
| 239 | The register test is a word list plus a suffix advisory | open.md — recorded 2026-10-14 (8M2 close) |
| 240 | The contact page's 300 ms read deadline fired once in a whole e2e run | open.md — recorded 2026-10-14 (8M2 close) |
| 241 | One very long unbroken Russian word not verified visually | open.md — recorded 2026-10-14 (8M2 close) |
| 242 | Phone and e-mail done-screen variants and the keyboard open not verified visually (8T) | open.md — recorded 2026-10-14 (8M2 close) |
| 243 | A cabinet-depth round trip (600 → 700 → 600) drifts occupied columns' recorded depth (fridge 620 → 742, tower 620 → 638); since 8U it splits one 1700 space into three | open.md — recorded 2026-10-17 (8U close); pre-existing |
| 244 | An offered width chip grows a base beside a U's right corner into the corner base (unsavable design) | open.md — recorded 2026-10-17 (8U close); pre-existing |
| 245 | An odd-width stored opening offers rows the insert then refuses (`NON_INTEGER_MILLIMETRES`; 8U R13) | open.md — recorded 2026-10-17 (8U close); known limit, ADR 0166 d7 |
| 246 | A tolerance chain's merge depends on the clear order and can cost a member over 20 mm (8U R14); reachable through `setCabinetDepth` | open.md — recorded 2026-10-17 (8U close); owner ruled Q-8U-3 = (a), not built; ADR 0166 d8 |
| 247 | The 800 + 100 spaces above each U corner stay two (F2; Q-8U-2 = (a)) | open.md — recorded 2026-10-17 (8U close); ADR 0166 d6 |
| 248 | The shell trims the upper row 1 mm in odd-width rooms (8U R12) | open.md — recorded 2026-10-17 (8U close); pre-existing |
| 249 | `qa-5b4b` "merges four abutting 200s into one 800" cannot fail its title under the uncapped merge — **blocks M8's close** (ADR 0152 Amendment A) | open.md — recorded 2026-10-17 (8U close); owner: the M8 test audit |
| 250 | A retry under the same price-book version re-prices from the live book | open.md — recorded 2026-10-17 (8V review); pre-existing |
| 251 | A Romanian plural without *"de"* flagged in review — kept by the owner's 2026-09-10 ruling (bare noun) | open.md — recorded 2026-10-17 (8V review); no action |
| 252 | `migrate-design.ts:255-257`'s comment says an odd-width v1 entry is refused; since 8U it loads whole | open.md — recorded 2026-10-17 (8U review) |
| 253 | `ContactPageView`'s already-sent arm carries a sent-reference field nothing reads | open.md — recorded 2026-10-17 (8V review) |
| 254 | Until `0010` and its grant are applied, the notice says "link unavailable" and an unknown share token answers 500 | open.md — recorded 2026-10-17 (8V close); owner step |
| 255 | 8U S5 not built: the commands still cut empty space at 800 and the reconcile rejoins it (behaviour-free) | open.md — recorded 2026-10-17 (8U close) |
| 256 | The mobile camera preset crops the run ends on long walls (straight 4100 and 6000, L 3560x4250 wall B); unknown whether it predates F1b | open.md — recorded 2026-10-17 (M8C F1b visual check) |
| 257 | The room form rejects a straight wall of 6100 ("A prea lung", limit 6000); the M8C plan's 6100 witness is unenterable | open.md — recorded 2026-10-17 (M8C F1b) |
| 258 | No committed test exercises O10 and the fill together (`qa-c5s1`/`qa-c5s2` run with the fill off) | open.md — recorded 2026-10-17 (M8C F1b); to be covered by option C's one property (ADR 0168) |
| 259 | E2e support-file comments (e.g. `qa-u5-cutaway.ts`) still describe bare remainders | open.md — recorded 2026-10-17 (M8C F1b); prose only |
| 260 | A `generation-model.ts` comment about a 900x2200 room reading "nu poate fi inclus" may be stale (unverified) | open.md — recorded 2026-10-17 (M8C F1b) |

*Notes at the 8J2, 8U and 8V close (2026-10-17) on existing entries:* 145 (facing-labels flaky again), 160 (closed), 232 (the non-live recipe does not hold) carry dated notes in `open.md`.

*Notes at 8M2's close on existing entries:* 196 (second caller, new triggers, the deadline seen once) and 198 (`SentReferenceAnswer` in `@/done/result-to-show`) carry dated notes in `open.md`.

## 2026-09-06 audit note

This pass re-checked every entry's status against the tree, the relevant ADR, and `docs/STATUS.md`,
and corrected seven that were stale: entries 4, 5, 13, 44, 45, 46 and 47 were still filed as open but
are shipped — see their closing notes at the top of `docs/backlog/resolved.md` for exactly what was
checked. Entries 23, 29, 42 and 48 were re-checked against the same evidence and confirmed still
accurate; no other entries were changed. No application code, test, or entry content was altered —
only status headers, the closing notes named above, and this reorganisation.
