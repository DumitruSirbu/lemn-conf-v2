# Architecture Decision Records

This directory is the project's decision log. In this repository an ADR records **our decisions and
findings** — why the code is shaped the way it is, what was tried and rejected, and what a review
turned up that changed a plan. It is not where the product's behavioural rules live: those are
`docs/design/DEVELOPMENT-SPEC.md`, cited by section and row (e.g. "§5.2", "§11 row 19"), never
duplicated into a decision record. A dated ADR supersedes earlier prose anywhere else in the
repo — `docs/CONFIGURATION_MODEL.md`, `docs/ARCHITECTURE_PROPOSAL.md`, milestone plans — but it
does not replace the behavioural spec as the source of truth for what the product does.

Read `docs/STATUS.md` first for where the project currently stands. Come here for the "why" behind a
piece of code; come here before re-deciding anything, since a dated record must not be silently
overturned.

The table below is an index only — one row per ADR, its title and a short status. The full
Context / Decision / Alternatives / Consequences live in each file; open the linked ADR for them.
For the specific claims a later record overtook, see [SUPERSESSIONS.md](SUPERSESSIONS.md) — read it
when a record you rely on is marked superseded below, or when planning (architect).

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-initial-product-and-stack.md) | Initial product and stack decisions | Partly superseded → 0002, 0003 |
| [0002](0002-db-backed-shareable-persistence.md) | Persistence: managed Postgres with shareable design links | Partly superseded → 0007, 0114 |
| [0003](0003-design-reference-supersession.md) | Void/column domain model replaces the run-anchor model | Accepted |
| [0004](0004-m2-pricing-engine-deletion.md) | Delete `pricing-engine.ts` instead of retaining it | Accepted |
| [0005](0005-m2-row19-m1-wall-gap-finding.md) | M1's `buildKitchen()` seats 6 bodies proud of the wall plane | Accepted |
| [0006](0006-tests-never-touch-the-application-database.md) | Live database tests never touch the application database | Partly superseded → 0008 |
| [0007](0007-standalone-neon-instead-of-vercel-managed.md) | Postgres moves to a standalone Neon project | Partly superseded → 0008 |
| [0008](0008-least-privilege-database-role.md) | The application connects as a least-privilege role | Partly superseded → 0009 |
| [0009](0009-deployment-configuration-gaps.md) | Deployment configuration gaps found before first deploy | Partly superseded → 0054 |
| [0010](0010-m3-client-write-path-unwired.md) | M2's write path has no production caller yet | Accepted |
| [0011](0011-m3-insert-contract-gaps.md) | Five contract gaps between M3's sketch and shipped M2 code | Partly superseded → 0053 |
| [0012](0012-scheduled-export-is-a-scoped-sql-select.md) | The scheduled export is a scoped SQL select, not `pg_dump` | Accepted |
| [0013](0013-restore-drill-executed-and-what-it-broke.md) | The restore drill was executed, and found five defects | Accepted |
| [0014](0014-unauthenticated-write-surface.md) | The deployed write surface is unauthenticated | Superseded → 0019 |
| [0015](0015-min-span-is-exclusive.md) | `MIN_SPAN_M` is exclusive | Accepted |
| [0016](0016-hood-chimney-is-carcass.md) | The hood's carcass is canopy **and** chimney | Accepted |
| [0017](0017-sink-base-minimum-width.md) | A catalogue entry may declare a minimum width | Accepted |
| [0018](0018-frame-depth-is-rear-overhang.md) | `frame.d` is twice a body's rear overhang, not its depth | Accepted |
| [0019](0019-security-baseline-writes-throttling-retention.md) | Security baseline: write auth, throttling, retention | Partly superseded → 0114, 0115 |
| [0020](0020-a-migration-file-is-not-an-applied-migration.md) | A migration file is not an applied migration | Partly superseded → 0042, 0096 |
| [0021](0021-corner-returns-are-structural-in-data.md) | Corner returns are structural in the catalogue data | Accepted |
| [0022](0022-seeded-entries-declare-their-catalogue-equivalent.md) | A seeded entry declares its catalogue equivalent | Accepted (amended) |
| [0023](0023-touch-compatibility-clicks-reach-the-sheet.md) | A touch on the scene was also pressing the sheet | Accepted |
| [0024](0024-the-rejection-banner-has-no-reachable-path.md) | §9's rejection banner has no reachable path | Accepted |
| [0025](0025-the-corner-base-legs-seat-on-the-l-joint.md) | Corner base legs seat on the L-joint, not the wall | Accepted |
| [0026](0026-the-width-floor-has-a-direction.md) | `MIN_W` is the default width floor, not an absolute one | Accepted |
| [0027](0027-the-hob-is-part-of-the-cabinet.md) | The hob is part of the cabinet body, not an accessory | Partly superseded → 0050, 0051 |
| [0028](0028-wall-depth-is-derived-from-the-worktop.md) | Wall/top carcass depth is derived from one declared worktop depth | Partly superseded → 0036 |
| [0029](0029-a-two-door-cabinet-may-not-be-offered-at-one-door-widths.md) | A two-door cabinet may not be offered at a one-door width | Partly superseded → 0033 |
| [0030](0030-a-single-hinged-door-tops-out-at-600.md) | A single hinged door tops out at 600mm | Superseded → 0033, 0035 |
| [0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md) | A resize moves a whole column, funded by adjacent empty space | Partly superseded → 0043 |
| [0032](0032-an-entry-that-does-not-fit-is-shown-disabled-with-its-reason.md) | ~~A non-fitting entry is shown disabled with its reason~~ | Superseded → 0107 |
| [0033](0033-door-count-is-derived-from-width-not-declared.md) | Door count is derived from width, not declared separately | Accepted (amended) |
| [0034](0034-width-chips-are-column-scoped-and-judged-by-the-command.md) | §9's width chips are column-scoped, judged by the command | Partly superseded → 0035 |
| [0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) | Width is a bounded ±50mm stepper, not a menu of sizes | Partly superseded → 0052 |
| [0036](0036-a-declared-dimension-is-the-finished-cabinet.md) | A declared dimension is the finished cabinet, doors included | Accepted |
| [0037](0037-adjacent-empty-columns-merge-into-one-space.md) | Adjacent empty columns merge into one space | Superseded → 0046 |
| [0038](0038-pre-release-no-stored-designs-no-migrations.md) | Pre-release: no design has ever been stored, no migration owed | Partly superseded → 0052 |
| [0039](0039-the-hood-is-a-standard-depth-hung-at-the-front.md) | The hood is a standard depth, hung at the front | Accepted |
| [0040](0040-a-recorded-seat-is-converted-back-not-read-as-a-depth.md) | A recorded seat is converted back to a depth, never read as one | Accepted |
| [0041](0041-the-browser-security-policy-is-versioned-and-the-csp-only-reports.md) | Browser security policy is versioned; the CSP only reports | Accepted |
| [0042](0042-the-database-records-which-migrations-it-ran.md) | The database records which migrations it ran | Accepted |
| [0043](0043-an-empty-space-of-any-width-is-a-legal-state.md) | An empty space of any width is a legal state | Accepted |
| [0044](0044-an-empty-space-is-recorded-in-the-design-document.md) | An empty space is recorded in the design document | Partly superseded → 0052, 0053 |
| [0045](0045-the-run-end-panel-follows-the-run-it-closes.md) | The run-end panel follows the run it closes | Accepted (amended) |
| [0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md) | Empty columns merge under a cap; an insert splits its column | Partly superseded → 0052 |
| [0047](0047-an-open-shelf-count-follows-its-clearance.md) | An open shelf's compartment count follows its clearance | Accepted |
| [0048](0048-the-pantry-column-is-the-one-resizable-column.md) | The pantry column is the one resizable full-height column | Accepted |
| [0049](0049-a-fixed-width-cabinet-shows-its-width-section-disabled.md) | A fixed-width cabinet shows its width section disabled | Accepted |
| [0050](0050-the-hob-oven-filler-is-a-finishable-front.md) | The hob+oven filler panel is a finishable front | Accepted |
| [0051](0051-the-dishwasher-niche-wears-a-decor-door.md) | The dishwasher niche wears a decor door | Accepted |
| [0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | 800mm is the ceiling on any empty column, not only on a merge | Accepted |
| [0053](0053-the-design-document-records-the-whole-frozen-map.md) | The design document records the whole frozen map, in two arrays | Accepted |
| [0054](0054-local-development-writes-to-the-preview-database.md) | Local development writes to the preview database | Accepted |
| [0055](0055-a-depth-change-migrates-the-stored-design.md) | A depth change migrates the stored design | Accepted |
| [0056](0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md) | Two cabinet depths, and the control reads the map | Accepted |
| [0057](0057-a-material-change-resets-an-unavailable-finish.md) | A material change resets an unavailable finish | Partly superseded → 0081 |
| [0058](0058-the-two-deep-top-cabinets-are-pinned.md) | The two deep top cabinets are pinned | Partly superseded → 0097 |
| [0059](0059-the-dishwasher-niche-declares-a-cabinet-depth-floor.md) | A 520 mm cabinet-depth floor is declared | Accepted |
| [0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md) | A column publishes a build depth beside its clearance | Accepted |
| [0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) | A cabinet handle is declared; an appliance bar is not one | Accepted |
| [0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) | A manufacturer price dashboard comes after M8 | Partly superseded → 0112 |
| [0063](0063-a-group-is-listed-row-major-height-before-position.md) | A group is listed row-major: height before position | Accepted |
| [0064](0064-a-seeded-row-carries-its-catalogue-equivalents-name.md) | A seeded row carries its catalogue equivalent's name | Accepted (amended) |
| [0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) | A body past the end of its wall is marked, not moved | Partly superseded → 0083 |
| [0066](0066-the-wall-corner-returns-get-their-own-kinds-and-names.md) | The wall corner returns get their own kinds and names | Accepted |
| [0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) | Leftover wall is the normal case, and the price is a floor | Accepted |
| [0068](0068-price-steps-at-the-door-count-and-follows-height.md) | Price steps at the door count, and follows height | Accepted |
| [0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) | "Past the wall" is one code family, and severity is declared per code | Partly superseded → 0090 |
| [0070](0070-hardware-is-priced-per-mechanism-not-per-handle.md) | Hardware is priced per mechanism, not per handle | Accepted |
| [0071](0071-material-carries-price-colour-carries-a-different-control-per-material.md) | Material carries price; colour carries a different control per material | Accepted |
| [0072](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md) | Price-book versioning is deferred to the manufacturer dashboard | Accepted |
| [0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) | A frozen extent records the body its depth came from, and a depth change re-asks that body | Accepted |
| [0074](0074-the-scene-rebuilds-whole-at-a-depth-change.md) | The scene rebuilds whole at a depth change, and exactly one kit is alive at a time | Accepted |
| [0075](0075-a-recorded-shell-declares-its-shell-not-its-finished-depth.md) | A `recorded-shell` entry's `frameDepthMm` is its shell, and the round trip that measured 39 mm was measuring the fake probe | Accepted |
| [0076](0076-a-probe-lease-is-a-scoped-borrow-and-the-store-publishes-no-probe.md) | A body-probe lease is a scoped borrow, and the store publishes no probe | Accepted |
| [0077](0077-a-joint-seated-body-declares-its-seat-and-is-never-measured-for-one.md) | A recorded seat is a measurement of one quantity taken at one setting, and reading it without either qualifier is one defect in two places | Accepted |
| [0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md) | A material's offer is its control's shape, and the load seam resolves before it validates | Accepted |
| [0079](0079-a-republished-depth-names-the-body-it-came-from.md) | A republished depth names the body it came from, and §3.2's MAX is not decided below the millimetre | Accepted |
| [0080](0080-an-empty-space-follows-the-setting-and-a-fallback-is-not-a-ratchet.md) | An empty space follows the setting, and the fallback that answers for a lost one is not a ratchet | Accepted |
| [0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md) | A material change confirms before it wipes a chosen colour, and says nothing when nothing was chosen | Accepted |
| [0082](0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md) | The whole-kitchen strip wraps, and nothing on it leaves the viewport | Partly superseded → 0094 |
| [0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md) | The demo room clears its run at both depths, wall coverage is the run's extent, and an overrun is not a negative remainder | Accepted |
| [0084](0084-canfinish-is-the-load-seams-and-a-command-fixture-constructs-only-its-own-contracts-inputs.md) | `canFinish` is the load seam's, and a command's fixture constructs only its own contract's inputs | Accepted |
| [0085](0085-a-normalisations-guard-asks-what-the-normalisation-changes.md) | A normalisation's guard asks what the normalisation changes, never whether the document is valid | Accepted |
| [0086](0086-the-confirmation-counts-chosen-colours-and-only-a-different-declared-material-owes-one.md) | The confirmation counts chosen colours, is composed before any command, and only a different declared material owes one | Partly superseded → 0099 |
| [0087](0087-the-hob-holds-its-reach-and-a-deeper-worktop-grows-behind-it.md) | The hob holds its reach to the cook, and a deeper worktop grows behind it | Partly superseded → 0098 |
| [0088](0088-a-depth-change-plans-against-the-frozen-extent-and-re-derives-only-the-depth.md) | A depth change plans against the frozen extent and re-derives only the depth axis | Partly superseded → 0090 |
| [0089](0089-the-along-wall-chain-is-kept-and-its-reader-is-the-depth-command.md) | `alongWallPositionFollows` is kept and its reader is the depth command, not the descoped bars | Accepted |
| [0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) | A frozen space slides with the run it belongs to, and follows the body it recorded | Accepted (amended) |
| [0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md) | An instrument's premise may be re-quantified when a ruled product change retires it; the product claim inside it becomes a finding and a wave | Accepted |
| [0092](0092-hardware-prices-three-mechanisms-and-a-sink-carries-two-extras.md) | Hardware prices three mechanisms, a sink carries two extras, and the default hardware tier stops being a floor | Accepted (amended) |
| [0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md) | A rule the shipped kitchen cannot exercise owes a witness, not a moved fixture | Accepted |
| [0094](0094-the-strip-gets-its-own-row-and-containment-is-measured-against-its-own-band.md) | The strip gets its own row, and containment is measured against its own band | Accepted |
| [0095](0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md) | Romanian is the source and it lives in message files; the domain publishes codes, not sentences | Accepted |
| [0096](0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md) | The deployed schema is proved by a gate that reads it, and production was never in the runner's path | Accepted |
| [0097](0097-adr-0058s-costs-were-accepted-at-a-depth-nothing-shipped-at-and-that-premise-has-expired.md) | ADR 0058's two costs were accepted at a depth nothing shipped at, and that premise has expired | Accepted (amended) |
| [0098](0098-the-sink-is-centred-at-the-declared-depth-and-a-deeper-worktop-grows-behind-it.md) | The sink is centred on its worktop at the declared depth, and a deeper worktop grows behind it | Accepted |
| [0099](0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md) | A colour is chosen at two levels, the cabinet's wins, and a global change can never overwrite one | Accepted |
| [0100](0100-depth-is-priced-by-a-dashboard-editable-multiplier-on-the-600-mm-base-and-it-is-deferred.md) | Depth is priced by a dashboard-editable multiplier on the 600 mm base, and it is deferred | Accepted |
| [0101](0101-a-lifted-columns-depth-is-declared-and-the-three-deep-tops-follow-the-setting.md) | A lifted column answers its top cabinet's depth, and the three deep tops follow the setting | Partly superseded → 0102 |
| [0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md) | A recorded source must explain its own depth, and a second authority written into a test is the defect laundered | Accepted |
| [0103](0103-a-standing-body-is-re-planned-when-something-is-inserted-beneath-it-and-a-delete-leaves-it-alone.md) | A standing body is re-planned when something is inserted beneath it, and a delete leaves it alone | Accepted |
| [0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md) | The mockups are the chrome specification, and the settings strip's own row is withdrawn | Accepted (amended) |
| [0105](0105-the-e2e-job-splits-by-playwright-project-rather-than-raising-its-ceiling-again.md) | The e2e job splits by Playwright project rather than raising its ceiling again | Accepted |
| [0106](0106-the-price-books-display-prose-publishes-descriptors-and-the-book-keeps-the-tier.md) | The price book's display prose publishes descriptors, and the book still keeps the tier | Accepted |
| [0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md) | Appliances are drawn and not sold, and a language is named in its own language | Accepted |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) | A room is validated against policy data, and until the owner rules, the policy is the engine's own limits | Accepted (amended) |
| [0109](0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md) | A preset is a recipe document, and it is listed only if the product would never mark it | Accepted (amended) |
| [0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md) | Generation inserts through the command path, starting from a shell of empty space, and the corner is structural data | Accepted (amended) |
| [0111](0111-step-1-creates-the-design-through-the-existing-mint-then-save-and-the-room-entry-lives-in-the-url.md) | Step 1 creates the design through the existing mint-then-save, hands the customer its link only once it is written, and keeps the room entry in the URL | Partly superseded → 0114 (amended) |
| [0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md) | The preset library is owner-authored data, saved from the editor through a server-side gate | Accepted |
| [0113](0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md) | Step 1's copy is approved as drafted, and each leaf enters the copy lock in the wave that adds it | Accepted |
| [0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md) | A returning visitor is recognised by a host-only, HttpOnly secret, and a design's link opens only in the browser that owns it | Accepted (amended) |
| [0115](0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md) | Customer profiles replace the PIN and arrive in M8; M7 ships the owner's browser cookie and short share links | Accepted |
| [0116](0116-a-type-that-refuses-an-undesigned-shape-is-a-guard-and-the-cast-that-witnesses-it-is-confined-to-a-test.md) | A type that refuses to describe an undesigned shape is a guard, not friction, and the cast that witnesses the rule is confined to a test | Accepted (amended) |
| [0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md) | Generation produces a correct, cheap baseline, and the owner's taste enters through presets | Accepted |
| [0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | A problem that has not occurred is recorded with its trigger, not built for | Accepted |
| [0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md) | A remembered fact about this repository is a claim to re-check, and "true at HEAD" is not "true at the end of the milestone" | Accepted |
| [0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) | The room is a fact and the kitchen adapts to it; coverage is negotiable where the room's dimensions are not | Accepted (amended) |
| [0121](0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md) | A thing is identified by what it is, never by what correlates with it, and the discriminating case is the one nobody screenshots | Accepted |
| [0122](0122-a-wall-cabinet-may-widen-over-floor-nothing-records-and-the-column-model-is-why.md) | A wall cabinet may widen over floor nothing records, and the column model is why | Accepted |
| [0123](0123-a-ruled-behaviour-whose-population-empties-keeps-its-branch-and-converts-its-sweep-coverage-into-a-declared-witness.md) | A ruled behaviour whose discriminating population empties keeps its branch, and its sweep coverage converts to a declared witness | Accepted |
| [0124](0124-the-wall-maxima-move-together-and-one-number-not-two.md) | The two horizontal wire bounds move together, as one number, not two | Accepted |
| [0125](0125-the-corner-minima-stay-at-900-and-1000-as-a-deliberate-margin-above-what-the-engine-needs.md) | The corner minima stay at 900 / 1000, as a deliberate margin above what the engine needs | Accepted |
| [0126](0126-the-rooms-lengths-are-typed-in-whole-millimetres.md) | The room's lengths are typed in whole millimetres, and the URL keeps its metre wire form | Accepted |
| [0127](0127-step-1s-url-follows-the-typed-room-and-a-late-echo-is-still-ours.md) | Step 1's URL follows the typed room, and a late echo is still ours | Accepted |
| [0128](0128-live-persistence-suites-serialise-through-a-declared-transaction-scoped-readers-writer-lock.md) | Live persistence suites serialise through a declared, transaction-scoped readers–writer lock | Accepted |
| [0129](0129-a-right-hand-l-is-the-left-hand-design-drawn-in-a-reflection-and-the-reflection-is-a-per-group-primitive.md) | A right-hand L is the left-hand design drawn in a reflection, and the reflection is a per-group primitive | Proposed |
| [0130](0130-a-straight-kitchen-is-the-composers-run-on-one-wall-with-no-corner.md) | A straight kitchen is the composer's run on one wall with no corner | Proposed |
| [0131](0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md) | The preset story is deferred past M8, and every room goes from its dimensions straight to composition | Accepted |
| [0132](0132-wall-c-is-a-world-wall-and-only-the-right-corner-is-drawn-in-a-reflection.md) | Wall C is a world wall, and only the right corner is drawn in a reflection | Accepted |
| [0133](0133-the-first-server-rendered-frame-is-the-loaded-design-and-no-module-store-is-written-on-the-server.md) | The first server-rendered frame is the loaded design, and no module store is written on the server | Accepted (security review owed at U7 S0) |
| [0134](0134-a-u-gets-no-step-one-suggestion-of-its-own-and-the-straight-kitchen-suggestion-keeps-its-shape-independent-gate.md) | A U gets no Step 1 suggestion of its own, and the straight-kitchen suggestion keeps its shape-independent gate | Accepted |
| [0135](0135-the-corner-pieces-stand-on-the-runs-lines-and-the-base-return-is-a-base-body-with-a-fixed-front.md) | The corner pieces stand on the run's lines, and the base return is a base body with a fixed front | Accepted (S1 `c4eeea6`, S2 `48bbc0c`) |

## Adding the next one

1. Take the next free number (`0021`, …).
2. Name the file `NNNN-kebab-case-title.md` in this directory.
3. Give it the same header block every record here uses, directly under the `# ADR NNNN — Title`
   line:

   ```
   Status: Accepted
   Date: YYYY-MM-DD
   Type: Decision | Finding | Finding + Decision
   Milestone: <phase or wave this belongs to>
   ```

4. Write Context / Decision / Alternatives considered / Consequences, matching the existing records'
   shape. If it overtakes a claim in an earlier record, strike that claim through in place, point it
   at the new ADR number, and add the pair to [SUPERSESSIONS.md](SUPERSESSIONS.md) — don't delete the
   old text.
5. Add its row to the Index table above: ADR link, title, and a short Status (`Accepted`,
   `Accepted (amended)` when the record was later amended in place, `Superseded → NNNN` or
   `Partly superseded → NNNN[, NNNN]`). If the new record only partly or fully supersedes or
   amends an earlier one, update that earlier ADR's own Status cell here too.
