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
| 16 | No camera preset frames the right end of wall A's base run at the mobile viewport | open.md |
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
| 63 | A hood is offered over wall A's corner, accepted, and then marked | open.md — recorded 2026-09-11 (M7 7D1 QA Q1.3), pre-existing, no owner |
| 64 | The run-end panel is not checked against the end of wall A | resolved.md — **closed 2026-09-11 by M7 wave 7D1b (`f61c361` + `85091cc`)** |
| 65 | An `it.fails` shell at height 2188–2199 can yield `PLACEMENT_ABOVE_ROOM` against `FIT_TOLERANCE_M`'s 12 mm | open.md — recorded 2026-09-11 (M7 7D1 QA Q3.1), pre-existing, not reachable by an approved room, no owner |
| 66 | The catalogue has three full-height rows and no broom / utility unit | open.md — ruled 2026-09-14 (ADR 0110 Amendment E, E12.4): new tall bodies wait for beta feedback |
| 67 | Tapping the overflow warning should move the camera to the marked body | open.md — wanted by the owner 2026-09-16 (M7 wave 7H, Q7H-8), not built, not scheduled. **Recorded as *66* when first written and corrected here the same day** — 66 was already the tall-body gap above, cited by number in ADR 0110, ADR 0117 and `milestones/M7-room-and-presets.md` |
| 69 | Two gate runs against one test database corrupt its migration ledger | open.md — observed 2026-09-18 on wave 7D6's push; environmental, wave 7T's subject, not scheduled |
| 68 | A large wood-decor run-end panel shows a visible grain tiling seam | open.md — observed 2026-09-17 in M7 wave 7D8's visual check of `dcec03f`, not compared against a pre-fix build, owner question, not built, not scheduled |
| 70 | The editor allows a kitchen with no oven | open.md — owner principle recorded 2026-09-21 (ADR 0110 Amendment M, M12), no owner, no phase yet |
| 71 | Re-tapping the selected *Vedere generală* chip does not reset the camera | open.md — seen by the 7D5b visual gate, 2026-09-21; no owner, no phase |

## 2026-09-06 audit note

This pass re-checked every entry's status against the tree, the relevant ADR, and `docs/STATUS.md`,
and corrected seven that were stale: entries 4, 5, 13, 44, 45, 46 and 47 were still filed as open but
are shipped — see their closing notes at the top of `docs/backlog/resolved.md` for exactly what was
checked. Entries 23, 29, 42 and 48 were re-checked against the same evidence and confirmed still
accurate; no other entries were changed. No application code, test, or entry content was altered —
only status headers, the closing notes named above, and this reorganisation.
