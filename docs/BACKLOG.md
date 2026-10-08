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
| 89 | R2.2 / SEC-7E3b.2 — the create-design lock covers only the mint `POST`; a save-vs-rotation race can revert the jar to a value owning nothing | open.md — found 2026-09-23 by M7 wave 7E3b's logic and security reviews independently; recorded to tell the owner, not fixed |
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
| 121 | F1 — `scripts/gates/boundary.sh` matches a driver import on one line only | open.md — found 2026-10-07 by M8 8B's QA; the coordinator schedules it before wave 8E |
| 122 | F5 — a session close that never returns hangs `applyMigrations` | open.md — found 2026-10-07 by M8 8B's QA; unmeasured; the coordinator, before 8S, after the owner approves a measurement |
| 123 | F6 — do Neon's connection strings carry `sslrootcert` or a sibling? | open.md — recorded 2026-10-07; a documentation read, the coordinator's |
| 124 | QA18 (census blind to a second `Client` through the opener), "Finding …" journal comments in three test files, and two 8C review nits in `review-model.ts` | open.md — recorded 2026-10-07; low priority, no owner. Gained 2026-10-08 (8D): two long comments in `use-honour-arrival.ts`, an unattributed line beside the locale chip at 1440 px, the Russian top-bar title truncated, the chip's height |
| 125 | Three e2e specs fail under `CI=1`, uninvestigated | open.md — found 2026-10-07 by M8 8A S1; triage before wave 8F. A fourth, `top-bar-back…desktop:179`, failed once on 2026-10-08 (8D's QA10) |
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

## 2026-09-06 audit note

This pass re-checked every entry's status against the tree, the relevant ADR, and `docs/STATUS.md`,
and corrected seven that were stale: entries 4, 5, 13, 44, 45, 46 and 47 were still filed as open but
are shipped — see their closing notes at the top of `docs/backlog/resolved.md` for exactly what was
checked. Entries 23, 29, 42 and 48 were re-checked against the same evidence and confirmed still
accurate; no other entries were changed. No application code, test, or entry content was altered —
only status headers, the closing notes named above, and this reorganisation.
