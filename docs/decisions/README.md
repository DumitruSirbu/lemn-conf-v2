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

The **Summary** column below is a pointer, not a retelling — the full Context / Decision /
Alternatives / Consequences live in each file. For the specific claims a later record overtook, see
[Supersessions](#supersessions) below the table.

## Index

| ADR | Title | Status | Type | Milestone | Summary |
| --- | --- | --- | --- | --- | --- |
| [0001](0001-initial-product-and-stack.md) | Initial product and stack decisions | Accepted (decision 3 → 0003; decision 7 half → 0002) | Decision | M0 | Stack, preset adaptation model, sample pricing, locale, contact rules; provider-neutral API before CRM. |
| [0002](0002-db-backed-shareable-persistence.md) | Persistence: managed Postgres with shareable design links | Accepted (Neon detail → 0007) | Decision | M2 | Postgres/Neon store, one jsonb document per design, backups, coalesced writes, round-trip invariant. |
| [0003](0003-design-reference-supersession.md) | Void/column domain model replaces the run-anchor model | Accepted | Decision | Cross-cutting | Established the M1–M8 roadmap; placements + derived voids become the domain model. |
| [0004](0004-m2-pricing-engine-deletion.md) | Delete `pricing-engine.ts` instead of retaining it | Accepted | Decision | M2 2A | Old pricing engine deleted; pricing rebuilt in M6 against the `Design`/frame model. |
| [0005](0005-m2-row19-m1-wall-gap-finding.md) | M1's `buildKitchen()` seats 6 bodies proud of the wall plane | Accepted | Finding + Decision | M2 2A | Pre-existing 10–20mm wall-seating defect found and fixed at the source. |
| [0006](0006-tests-never-touch-the-application-database.md) | Live database tests never touch the application database | Accepted (item → 0008) | Decision | M2 2B | Dedicated `lemnaria_test` DB, hard guard against `DATABASE_URL`, per-test cleanup. |
| [0007](0007-standalone-neon-instead-of-vercel-managed.md) | Postgres moves to a standalone Neon project | Accepted (item → 0008) | Decision | M2 2B | Moved off Vercel-managed Neon for direct console/SQL access and cleaner test isolation. |
| [0008](0008-least-privilege-database-role.md) | The application connects as a least-privilege role | Accepted (Preview item → 0009) | Decision | M2 2B | `app_designs` SQL role holding only SELECT/INSERT/UPDATE; verified by a live privilege test. |
| [0009](0009-deployment-configuration-gaps.md) | Deployment configuration gaps found before first deploy | Accepted (amended 2026-09-02 → 0054) | Finding + Decision | M2 2B | Four deploy gaps fixed; amendment found Preview's DB unmigrated since `0002`, unnoticed. |
| [0010](0010-m3-client-write-path-unwired.md) | M2's write path has no production caller yet | **Resolved 2026-08-25** | Finding + Decision | M3 | M3 delivers the client repository, wired coalescer, and mint-on-first-mutation. |
| [0011](0011-m3-insert-contract-gaps.md) | Five contract gaps between M3's sketch and shipped M2 code | Accepted (corrected 3x, amended → 0053) | Finding + Decision | M3 | Closed 5 gaps incl. `insertable` flag, `BodyProbe` port, column-freeze scope. |
| [0012](0012-scheduled-export-is-a-scoped-sql-select.md) | The scheduled export is a scoped SQL select, not `pg_dump` | Accepted (closes 0002 Q8/9) | Decision + Finding | M2 2B | Daily ndjson export scoped to `designs`; fixed an empty-table export defect. |
| [0013](0013-restore-drill-executed-and-what-it-broke.md) | The restore drill was executed, and found five defects | Accepted | Finding + Decision | M2 2B | Drilled end to end; fixed 5 defects incl. a silently-no-op `migrate` CLI. |
| [0014](0014-unauthenticated-write-surface.md) | The deployed write surface is unauthenticated | **Superseded by 0019** | Finding | M2 2B | 4 findings on live write/auth gaps; S1/S3/S4 decided in 0019, S2 fixed in place. |
| [0015](0015-min-span-is-exclusive.md) | `MIN_SPAN_M` is exclusive | Accepted | Finding + Decision | M3 3A | A 300mm free span produces no void; resolves a spec ambiguity in favour of pseudocode. |
| [0016](0016-hood-chimney-is-carcass.md) | The hood's carcass is canopy **and** chimney | Accepted | Finding + Decision | M3 3B | Fixed carcass mesh pattern to prevent `BUILT_SIZE_MISMATCH` on every hood insert. |
| [0017](0017-sink-base-minimum-width.md) | A catalogue entry may declare a minimum width | Accepted | Finding + Decision | M3 3B | Added `minWidthMm`; `base-sink`'s real floor is 560mm, not 300mm. |
| [0018](0018-frame-depth-is-rear-overhang.md) | `frame.d` is twice a body's rear overhang, not its depth | Accepted | Finding | M3 3B | Named the encoding defect; structural fix delivered later by 0040. |
| [0019](0019-security-baseline-writes-throttling-retention.md) | Security baseline: write auth, throttling, retention | Accepted (supersedes 0014) | Decision | M3 3C, M8 | Write-token cookie, layered rate limits, geo signal, 30-day retention, email edit link. |
| [0020](0020-a-migration-file-is-not-an-applied-migration.md) | A migration file is not an applied migration | Accepted (amended 2026-08-31 → 0042) | Finding + Decision | M3 3C-2a | App DB was never migrated despite green gates; amendment: ledger now tracks applied migrations. |
| [0021](0021-corner-returns-are-structural-in-data.md) | Corner returns are structural in the catalogue data | Accepted | Finding + Decision | M4 4B | Corner-return flags moved into catalogue data; §11 row 20's opening no longer reachable. |
| [0022](0022-seeded-entries-declare-their-catalogue-equivalent.md) | A seeded entry declares its catalogue equivalent | Accepted (amended 2026-08-27) | Finding + Decision | M4 4B | `catalogEquivalentId` field for the ACTUAL badge; amendment: also resolves width set. |
| [0023](0023-touch-compatibility-clicks-reach-the-sheet.md) | A touch on the scene was also pressing the sheet | Accepted | Finding + Decision | M4 4D | Canvas cancels `touchend` to stop synthesised mouse events reaching the sheet. |
| [0024](0024-the-rejection-banner-has-no-reachable-path.md) | §9's rejection banner has no reachable path | Accepted | Finding + Decision | M4 4D | No control can produce a refusal; criterion recorded unmet, carried to M6. |
| [0025](0025-the-corner-base-legs-seat-on-the-l-joint.md) | Corner base legs seat on the L-joint, not the wall | Accepted | Finding + Decision | post-M4 | Corner legs become placements seated on the L-joint at a measured offset. |
| [0026](0026-the-width-floor-has-a-direction.md) | `MIN_W` is the default width floor, not an absolute one | Accepted | Decision + Finding | Wave C | `minWidthMm` can replace `MIN_W` below it, not just stack above; fixed a resize-path bug. |
| [0027](0027-the-hob-is-part-of-the-cabinet.md) | The hob is part of the cabinet body, not an accessory | Accepted (2 claims later superseded → 0050, 0051) | Decision | Wave B1 | Hob merged into cabinet body via 2 new entries; accessory machinery retained. |
| [0028](0028-wall-depth-is-derived-from-the-worktop.md) | Wall/top carcass depth is derived from one declared worktop depth | Accepted (naming superseded → 0036) | Decision + Finding | M5 5A | One declared depth map replaces two disagreeing constants; fixed a seat-inheritance bug. |
| [0029](0029-a-two-door-cabinet-may-not-be-offered-at-one-door-widths.md) | A two-door cabinet may not be offered at a one-door width | Accepted (mechanism superseded → 0033) | Finding + Decision | M5 5B | `wall-2door` restricted to [600,800]; mechanism replaced same day by 0033. |
| [0030](0030-a-single-hinged-door-tops-out-at-600.md) | A single hinged door tops out at 600mm | **Retired 2026-08-28 → 0035** (mechanism → 0033) | Decision | M5 5C | Capped 1-door entries; amended to [200,300,400]; later retired entirely. |
| [0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md) | A resize moves a whole column, funded by adjacent empty space | Accepted (remainder-floor bullet → 0043) | Decision | M5 5C | Selecting a cabinet resizes its whole column via an adjacent empty column. |
| [0032](0032-an-entry-that-does-not-fit-is-shown-disabled-with-its-reason.md) | A non-fitting entry is shown disabled with its reason | Accepted | Decision | M5 5D | Non-fitting catalogue entries shown disabled with the refusal reason, not removed. |
| [0033](0033-door-count-is-derived-from-width-not-declared.md) | Door count is derived from width, not declared separately | Accepted (amended twice) | Decision | M5 5C3 | Merged door-count entry pairs into one; count and label derived from one threshold. |
| [0034](0034-width-chips-are-column-scoped-and-judged-by-the-command.md) | §9's width chips are column-scoped, judged by the command | Accepted (chip row superseded → 0035) | Decision | M5 5D | Width chips sourced from `columnWidthChoices`; each judged by running `setWidth`. |
| [0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) | Width is a bounded ±50mm stepper, not a menu of sizes | Accepted (decision 7 amended → 0052) | Decision | M5 | Replaced size-menu chips with a stepper clamped to per-entry floor/ceiling. |
| [0036](0036-a-declared-dimension-is-the-finished-cabinet.md) | A declared dimension is the finished cabinet, doors included | Accepted | Decision + Finding | M5 | Width/depth/height are the finished cabinet, not the carcass; amends 0028. |
| [0037](0037-adjacent-empty-columns-merge-into-one-space.md) | Adjacent empty columns merge into one space | Built, **WITHDRAWN 2026-08-30**, revived under a cap by 0046 | Decision | M5 5D2b | Merge shipped then withdrawn: stranded an 800mm cap on first insert into span. |
| [0038](0038-pre-release-no-stored-designs-no-migrations.md) | Pre-release: no design has ever been stored, no migration owed | Accepted (premise later measured false → 0052) | Decision | Cross-cutting | No migration owed pre-release; corrected 2026-08-31 re: a false reachability premise. |
| [0039](0039-the-hood-is-a-standard-depth-hung-at-the-front.md) | The hood is a standard depth, hung at the front | Accepted | Decision | M5 5F | Hood exempt from the depth map, fixed 500mm, hung at front with a gap behind. |
| [0040](0040-a-recorded-seat-is-converted-back-not-read-as-a-depth.md) | A recorded seat is converted back to a depth, never read as one | Accepted (decision 1's third arm superseded) | Decision | M5 5F | Seat-to-depth conversion generalised; amendment: depth declared per catalogue entry. |
| [0041](0041-the-browser-security-policy-is-versioned-and-the-csp-only-reports.md) | Browser security policy is versioned; the CSP only reports | Accepted | Decision | S4 | Headers file, nonce-based CSP shipped report-only; no report sink yet. |
| [0042](0042-the-database-records-which-migrations-it-ran.md) | The database records which migrations it ran | Accepted (supersedes 0020 prose) | Decision | S10 | Append-only `schema_migrations` ledger, one transaction per migration, refuses on mismatch. |
| [0043](0043-an-empty-space-of-any-width-is-a-legal-state.md) | An empty space of any width is a legal state | Accepted (supersedes 0031's remainder bullet) | Decision | M5B 5B1 | Removed the remainder floor; a growth is legal for any non-negative remainder. |
| [0044](0044-an-empty-space-is-recorded-in-the-design-document.md) | An empty space is recorded in the design document | Accepted (one alternative → 0053, premise corrected → 0052) | Decision | M5B 5B2 | `emptyColumns` array persists frozen empty extents so a shrink survives reload. |
| [0045](0045-the-run-end-panel-follows-the-run-it-closes.md) | The run-end panel follows the run it closes | Accepted | Decision | M5B 5B3 | `end_panel_right`'s X/visibility derived from the run; hidden when no run. |
| [0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md) | Empty columns merge under a cap; an insert splits its column | Accepted (`MERGE_CAP_MM` absorbed → 0052) | Decision | M5B 5B4 | Merge returns capped at 800mm; insert-time column split cures stranding. |
| [0047](0047-an-open-shelf-count-follows-its-clearance.md) | An open shelf's compartment count follows its clearance | Accepted | Decision | M5B 5B7 | Compartment count is a function of body clearance, not row identity. |
| [0048](0048-the-pantry-column-is-the-one-resizable-column.md) | The pantry column is the one resizable full-height column | Accepted | Decision | M5B 5B8 | `tall-pantry` made resizable 400–800mm; door threshold already matched the request. |
| [0049](0049-a-fixed-width-cabinet-shows-its-width-section-disabled.md) | A fixed-width cabinet shows its width section disabled | Accepted (supersedes suppression in `set-width.ts`) | Decision | M5B 5B5 | `fixedWidth` cabinets now show the width section disabled with a reason. |
| [0050](0050-the-hob-oven-filler-is-a-finishable-front.md) | The hob+oven filler panel is a finishable front | Accepted (supersedes 0027's front claim) | Decision | M5B 5B6 | Filler panel now finishes with the run's finish instead of permanent white. |
| [0051](0051-the-dishwasher-niche-wears-a-decor-door.md) | The dishwasher niche wears a decor door | Accepted (supersedes 0027's exemption) | Decision | M5B 5B10 | Niche now builds its own decor door so finish/handle chips affect it. |
| [0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | 800mm is the ceiling on any empty column, not only on a merge | Accepted (retires 0046's `MERGE_CAP_MM`) | Decision | M5 5G | Shared `MAX_EMPTY_COLUMN_WIDTH_MM` caps merge, shrink-split and v1 migration alike. |
| [0053](0053-the-design-document-records-the-whole-frozen-map.md) | The design document records the whole frozen map, in two arrays | Accepted (supersedes 0044's rejected alternative) | Decision | M5 5H | New `columnExtents` array preserves occupied-column extents across partial deletes. |
| [0054](0054-local-development-writes-to-the-preview-database.md) | Local development writes to the preview database | Accepted | Finding + Decision | Infra | `.env.local` points dev at Preview's DB; found Preview 3 migrations behind. |
| [0055](0055-a-depth-change-migrates-the-stored-design.md) | A depth change migrates the stored design | Accepted | Decision | M6 6J | Depth change rewrites placements through the normal command path with a version bump; never re-derived on load. |
| [0056](0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md) | Two cabinet depths, and the control reads the map | Accepted | Decision | M6 6J/6K | Confirms 600/700 and no 800 row; the control renders from the declared map so a third depth is data. |
| [0057](0057-a-material-change-resets-an-unavailable-finish.md) | A material change resets an unavailable finish | Accepted | Decision | M6 6F | Affected cabinets reset to the new material's default, stated in the warning before apply. |
| [0058](0058-the-two-deep-top-cabinets-are-pinned.md) | The two deep top cabinets are pinned | Accepted | Decision + Finding | M6 6H/6I/6J | `p22`/`p23`/`p24` immune to the depth setting, as a declared exception; measured what pinning costs at 700. |
| [0059](0059-the-dishwasher-niche-declares-a-cabinet-depth-floor.md) | A 520 mm cabinet-depth floor is declared | Accepted | Decision | M6 6K | One declared floor carrying its arithmetic `(cabinetDepth − 40)/2 − 240`; closes backlog 19's decision. |
| [0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md) | A column publishes a build depth beside its clearance | Accepted | Decision + Finding | M6 6I2 | Build depth is declared (330 capped, the cabinet-depth line lifted), never the clearance MAX; swap and insert agree at 600. Closes backlog 15 and 10. |
| [0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) | A cabinet handle is declared; an appliance bar is not one | Accepted | Decision | M6 6L | Appliance bars neither restyled nor billed; the count is declared per entry with a parity gate. Closes backlog 18. |
| [0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) | A manufacturer price dashboard comes after M8 | Accepted | Decision | Cross-cutting | Nothing built in M6–M8; three seams shaped — book rules as data, one availability predicate, notes in M7 and M8. |
| [0063](0063-a-group-is-listed-row-major-height-before-position.md) | A group is listed row-major: height before position | Accepted | Decision | M6 6A | Within a group, order by `y0Mm` then `alongMm`; the whole hanging row, then the whole top row. Inherited by 6B, 6D and M8. |
| [0064](0064-a-seeded-row-carries-its-catalogue-equivalents-name.md) | A seeded row carries its catalogue equivalent's name | Accepted (mechanism amended by 6A2) | Decision + Finding | M6 6A2 | Seeded rows read their equivalent's `label` **and** `doorCountFollowsWidth` off it, so a resize never renames a cabinet. Closes backlog 20. |
| [0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) | A body past the end of its wall is marked, not moved | Accepted | Decision | M6 6A3/6M | Nothing gives: overflow is marked and warned, priced in full with the total flagged, saved but not submittable. Withdraws the 0055 and 0056 amendments of the same day. |
| [0066](0066-the-wall-corner-returns-get-their-own-kinds-and-names.md) | The wall corner returns get their own kinds and names | Accepted | Decision | M6 6A4 | Two kinds, one per row, mirroring ADR 0025 — one shared kind would leave the priced document showing two identical lines. |
| [0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) | Leftover wall is the normal case, and the price is a floor | Accepted | Decision | Cross-cutting | Real walls are not round; a remainder is the expected outcome, not a tolerance; the estimate is a floor. Does not weaken the overrun rule. |
| [0068](0068-price-steps-at-the-door-count-and-follows-height.md) | Price steps at the door count, and follows height | Accepted | Decision | M6 6B2 | A second and third price shape: a step at the door threshold, and a height term where a body builds to its opening. Shapes stay code, coefficients stay data. |
| [0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) | "Past the wall" is one code family, and severity is declared per code | Accepted | Decision | M6 6A3 | The overrun re-enters validation as an empty column and a frozen extent, so all three codes are demoted together. `COLUMN_EXTENT_OUTSIDE_ROOM` splits per edge; severity becomes a total per-code declaration. |
| [0070](0070-hardware-is-priced-per-mechanism-not-per-handle.md) | Hardware is priced per mechanism, not per handle | Accepted | Decision | M6 6G | Hinges (2 per leaf, 3 over 900 mm), drawer runners (2 per drawer) and push-to-open (1, handle-less only) replace per-handle pricing; three named tiers (DTC Standard, Blum, Hettich); two sink extras; closes 6G's leaf-counting question. |
| [0071](0071-material-carries-price-colour-carries-a-different-control-per-material.md) | Material carries price; colour carries a different control per material | Accepted | Decision | M6 | PAL < MDF < veneer priced, colour never priced; PAL is a fixed 6-decor list, MDF a RAL picker, veneer two woods; `clay`/`sage` narrow to MDF-only under ADR 0057's reset; default-per-material ruled 2026-09-04 (Alb / white / Stejar) — amendment appended. |
| [0072](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md) | Price-book versioning is deferred to the manufacturer dashboard | Accepted | Decision | Cross-cutting | A design keeps its quoted price, recalculation is customer-initiated and explicit; M6 adds no field, version or migration — the ADR 0062 seam already covers it and the failure it would guard against is unreachable until a manufacturer, not a developer, can edit the book. |
| [0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) | A frozen extent records the body its depth came from, and a depth change re-asks that body | Accepted | Decision + Finding | M6 6K-c | A member-less column's depth cannot be derived from what it retains (`B\|1.20` and `B\|1.80` are identical and 38 mm apart), so the entry records the `buildId` that supplied §3.2's MAX and a depth change re-asks it in the catalogue at the new setting. Deeper-only fallback where it cannot; no version bump; nothing refused. Finding: `resolveDepthM` and `kitchen-stage.tsx` still hard-code `WORKTOP_DEPTH_MM`. |
| [0074](0074-the-scene-rebuilds-whole-at-a-depth-change.md) | The scene rebuilds whole at a depth change, and exactly one kit is alive at a time | Accepted | Decision + Finding | M6 6K-b; adds 6K-e | The stage memo is keyed on the design's depth and the whole stage is rebuilt. The narrow kit-and-shell swap is refused with a proof: `signBody` reads the record alone, so ADR 0058's pins keep old-kit instances and the old kit can be neither released nor kept. Ghost-freedom restated as the fixed manifest, not "once per mount". Finding: the probe measuring a depth change holds a kit at the old depth — new wave 6K-e. |
| [0075](0075-a-recorded-shell-declares-its-shell-not-its-finished-depth.md) | A `recorded-shell` entry's `frameDepthMm` is its shell, and the round trip that measured 39 mm was measuring the fake probe | Accepted | Decision + Finding | M6 6K-d | 291 is right, not 330: ADR 0018's encoding, `rebuildDepthM`'s convergence, `occupiedDepthM` publishing an unmanufactured 369, and the base band's own precedent all agree. But the round trip's 39 mm comes from `createFakeBodyProbe` answering the requested depth where the real builder subtracts the front assembly — a test-fidelity failure beside a narrower declaration defect. Two mechanisms produce 369 and neither closes the other. |
| [0076](0076-a-probe-lease-is-a-scoped-borrow-and-the-store-publishes-no-probe.md) | A body-probe lease is a scoped borrow, and the store publishes no probe | Accepted | Decision + Finding | M6 6K-f | The store drops `release` at five sites and strands one transient kit per depth change. `bodyProbe` leaves published state: commands and the width queries lease per scope, `probeAt` stays the single source, `isBodyProbeAttached` is untouched (ADR 0074 decision 6). `BodyProbeLease` becomes `use(borrow)` with no `probe` and no `release` field, so the dropped release does not typecheck. Fakes must count leases and revoke the probe on release — the third defect this fake has hidden. |
| [0077](0077-a-joint-seated-body-declares-its-seat-and-is-never-measured-for-one.md) | A recorded seat is a measurement of one quantity taken at one setting, and reading it without either qualifier is one defect in two places | Accepted | Finding + Decision | M6 6K-h then 6K-g | **Clause 1 (quantity):** `reseat` persisted `2 x` a measured rear overhang over `base-corner-x-900`'s declared joint seat (560 against 600), driving 0.00835 m3 of its carcass into `base-corner-return-320`. Which plane seats a body becomes a declared `SeatRule` with three arms and **no default**, retiring three hand-written copies of the property; `deriveFrame` ignores a stored seat for a `joint` entry. **Clause 2 (setting), in the Addendum:** a depth change planned against `Column.d` derived from the seats it was replacing, so a deepening rebuilt four wall cabinets to the 600 mm shell and published 330 against 400 — deepening only, because the stale clearance loses the `min` in the other direction. The command now clears the seats of bodies that declare they follow the setting, and Gap B is untouched everywhere else. Each arm of `setCabinetDepth` held exactly one of the two clauses. Two false test justifications corrected, not deleted. |
| [0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md) | A material's offer is its control's shape, and the load seam resolves before it validates | Accepted | Decision | M6 6Q | The offer is derived from `ColourControl.shape`, not a second list: a palette-shaped control offers exactly its entries, MDF's picker offers every free colour `FinishSchema` admits and no palette entry. `migrateDesign` resolves unconditionally **before** `assertDesignValidForCatalog`, so the new refusal code (ADR 0069 forces refusal) is unreachable on the load path and no stored row is refused; no version bump. An undeclared material id resolves and refuses nothing (ADR 0072). The reset never builds a free colour from a decor's swatch hex — ADR 0057's nearest-finish mapping through 6R's back door. Raises, without answering, whether PAL → MDF should carry colour over. |
| [0079](0079-a-republished-depth-names-the-body-it-came-from.md) | A republished depth names the body it came from, and §3.2's MAX is not decided below the millimetre | Accepted | Decision + Finding | M6 6K-c | ADR 0073's unstated invariant: `atCurrentCabinetDepth` published a depth from the measured operand and carried the old `depthFromBuildId` across, so the pair parted and 99 mm a delete freed was lost on the next depth change. The store's MAX now names its winner as `deriveColumns` does; `atDepthM` cannot be called without a source. A floor on the recorded arm is refuted twice — at `column.d` it pins ADR 0073 decision 2's ruled decrease, at `columnBuildDepthM` it unpins ADR 0058. §3.2's MAX stops being decided by a 1.11e-16 ULP the document cannot record; ties break on `depthFollowsSetting`, then `buildId` bytes (ADR 0063's last key). Finding: two deletes leave the shipped kitchen unable to change its depth (`HEIGHT_EXCEEDS_LEVEL`), unruled and not this record's — new wave 6K-i. **Amended 2026-09-05**: the anti-invariant is bounded (a freed opening follows a depth *decrease* too — held-still is what ADR 0073 decision 5 refused, and the 599/699 pair is reversible), the replacement predicate is QA's own `isAllowedShrink` and must go red against the pre-fix code, the tie-break throws rather than abstains on an undeclared `CabinetDepthRule`, and the finding's test becomes a bounded pin rather than an `it.fails`. |
| [0080](0080-an-empty-space-follows-the-setting-and-a-fallback-is-not-a-ratchet.md) | An empty space follows the setting, and the fallback that answers for a lost one is not a ratchet | Accepted | Decision (owner instruction) + Finding | M6 6K-c confirmed; opens 6K-j | The owner, 2026-09-05: *"everything, cabinets, empty spaces, everything, should change to six hundred depth… you don't keep all their depth in mind because there was earlier a cabinet deeper."* Measured: the instruction **confirms** wave 6K-c (620 → 720 → 620, a pure function of source and setting) and **condemns HEAD**, which 6K-c replaces. It reaches one half of ADR 0073 decision 3: the **ratchet** — a depth the fallback itself produced, held on the way back down, 400 in a 600 mm kitchen — is overturned; the **surplus** is not, because removing it is 290 mm wrong at the setting the extent was frozen at and unpins a `manufactured-size` niche (742 → 600). `columnBuildDepthM` is a build ceiling and cannot express a base run's 620/720, which is why "follow the setting exactly" cannot answer for a base opening. The predicate reads the document's own declared setting, so one document answers one way. Reported and not absorbed: "everything becomes 600" is not literal — the wall map, the pins and the machines are three declared exceptions the owner already ruled. **Amended 2026-09-05** on adversarial QA: decision 4's predicate is an **equality**, not a bound (`Math.abs(d - atFreezeM) <= ε`). A `<=` swallows every depth *below* a raised ceiling, so an inserted `tall-pantry` overlapping a member-less slot made a genuine 620 follow the setting to 600. With the equality the withdrawn *"keeps more, never less"* returns as a theorem: a flipped `hasFullHeightUnder` fails the comparison and routes to the surplus arm. Recording the freeze-time reading is refused — it re-freezes what ADR 0011's 2026-08-26 correction unfroze. QA's 99 mm is measured against a baseline itself 100 mm wrong; against the sourced twin the wave is never worse than 6K-c and 101 mm better on two entries. The closure is under **descent**, not by date, and the "exactly one published depth changes" criterion is withdrawn as scenario-bound. |
| [0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md) | A material change confirms before it wipes a chosen colour, and says nothing when nothing was chosen | Accepted (amends 0057 decision 3) | Decision (owner ruling) | M6 6Q-c | The owner, 2026-09-05, declining a PAL → MDF carry-over by name and closing ADR 0078's raised question: *"instead of… an algorithm of mapping these colours between different materials, I will go with just checking if there are different colours compared to default for each cabinet"*, and *"we inform, and if he agrees, we change. If this is already the default colour… we don't show this warning."* ADR 0057 decision 3's always-shown sentence becomes a **conditional blocking confirmation**: one domain query counts cabinets whose finish differs from their current material's declared default under `sameFinish` (absence never counts; an undeclared material counts every carried finish and throws nothing). Cancel runs **no** command of any kind, not just the material's. One dialog with two steps, never a second trap over the first. The copy carries the **query's** count, not the effect's — the two differ by exactly the cabinets sitting at their material's default, which are repainted silently. `materialWarning` is joined, not replaced, and 6Q-b's finish clause is withdrawn. |
| [0082](0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md) | The whole-kitchen strip wraps, and nothing on it leaves the viewport | Accepted | Finding + Decision (owner ruling) | M6 6R | Measured: `.settingsRow` keeps a flex item's default `min-width: auto` in an `auto` grid track, so at three chips the row is 442 px on a 390 px screen and the settings trigger's right edge lands at 412 — off screen. The owner, 2026-09-05: *"showing everything, not going off the screen… even if you need to just increase the height and take from the vertical height, I'm totally okay with this."* The chips **wrap**; horizontal scrolling is refused (§10's *"chips scroll horizontally"* is scoped to the editor panel, not this strip); a chip is never narrowed below the line it is alone on, so no numeric `min-width` is declared; the trigger is pinned and does not join the wrap; growth is absorbed by the stage's `minmax(0, 1fr)` track, never over the price bar — which is why this is not 6K-b3's 44-red-spec interception. Closes `docs/BACKLOG.md` 32 and schedules 33 (a 93.5 × 13 px trigger) into the same wave. Corrects entry 32's premise: 6R adds no chip. |
| [0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md) | The demo room clears its run at both depths, wall coverage is the run's extent, and an overrun is not a negative remainder | Accepted (amends ADR 0065's wall B figure) | Decision (owner ruling) + Finding | M6 6N-0/6J-c/6N-a/6N-b/6N-c | The owner, 2026-09-05, reversing themselves the same day: *"then for 700 deep adapt and make 2900"*, *"yes add clearance 20-50 mm"* — wall B goes **2830 -> 2920**, **fixed and never depth-dependent** (a room that grew with the setting makes ADR 0065's gate unfireable on any design). **A divergence, not a correction**: the fixture already *is* the reference at 2830, so this moves the demo 90 mm away from the measured kitchen and the bar then divides by an invented wall — chosen with that cost stated, and pinned at the assertion so nobody puts 2830 back. Wall A stays measured, so the two denominators are different kinds of number. **Finding, the larger half: the 2900 is intended geometry no production code builds.** Through the real `setCabinetDepth(700)`: **zero** placements move, wall B still ends at 2800, nothing overflows — `alongWallPositionFollows` has no reader in `src/` anywhere, so **wave 6J-a's own criterion is unmet** (new wave 6J-c); wave 6I's review measured the same failure in built meshes. Measured for *this* change: every derived artefact is byte-identical at 2830 and 2920 (26 records, 12 columns, no issues, no overflow) — the envelope alone moves, though `EMPTY_COLUMN_PAST_WALL_END` does differ between them. Blast radius: 32 lines / 12 files, **13 once the derived 30 mm is included — and that file is invisible to a `2830` grep**. Equality **fits** (strict `>` on exact integers), so 2900 was safe and 2920 is ruled headroom, not a rounding; ADR 0015 does not reach it. Coverage is the **furthest along-wall reach** (a sum is refuted by the reference at 580 mm; a union parts on the first interior gap); wall A includes ADR 0045's finished end at **3519, not the rounded 3520 — no 20 mm constant**, its seat moving into the domain. `remainderMm`/`overrunMm` are two non-negative fields, never one signed `free`. The remainder is always the **tail of the run**; `emptyColumns` is not a source. 6M's warning does not move. The marking loses **one** assertion, not its demo — six test files and the e2e spec place their overflow body relative to `room.depthMm` and survive — and the seven hand-built copies plus the twice-defined `LARGE_REMAINDER_DESIGN` are consolidated. **Two owner questions reserved: the reference panel is not in the tree at all, and the unruled heading/remainder copy.** |
| [0084](0084-canfinish-is-the-load-seams-and-a-command-fixture-constructs-only-its-own-contracts-inputs.md) | `canFinish` is the load seam's, and a command's fixture constructs only its own contract's inputs | Accepted | Finding + Decision | M6 6Q-b | Wave 6Q-b's veneer-fixture criterion asked one fixture to hold a hood **wearing** a stored finish *and* an effect count of exactly 2 — unsatisfiable, since `setMaterialTier` carries no `BodyCatalog` and counts the hood. Measured: **all six routes into that command close** (the load seam strips unconditionally before it resolves; the seed carries no finish; `setFinish` refuses `!canFinish`; `carriedAppearance` drops it on swap and on resize-rebuild), so the state is unreachable and the count is 2 *because a loaded hood carries nothing*. The implementer's workaround — a hood wearing `veneer.nuc`, which veneer offers — is **replaced**: the same file's MDF direction asserts `count === 3` with the command repainting that hood. The criterion is split across seams: the hood-wearing-a-finish case is the **load seam's** (already asserted better, `pal.alb` on veneer); *"never counted"* means `resolvedFinishCount`, **not** the `appliesTo` figure, which counts the hood (ADR 0016) and stays unchanged; *"never refused"* is scoped to the load path, and `PUT` refusing a payload no command produces is accepted. **`setMaterialTier`/`setHardwareTier` take no catalogue, now or later** — one shared input shape, and a third authority on `canFinish` beside the two that exist (the same prohibition 6Q-c already carries). General rule: **a fixture may construct any input the unit's own contract is defined over, and may not construct one to borrow another module's guarantee.** The duplicated web/domain fixture stands (liftability), with drift made loud inside each copy against the public offer query. |
| [0085](0085-a-normalisations-guard-asks-what-the-normalisation-changes.md) | A normalisation's guard asks what the normalisation changes, never whether the document is valid | Accepted (extends ADR 0069 decisions 5/5b) | Finding + Decision | M6 6Q-b adjudication; binds 6N-0 | Wave 6Q-b's adversarial QA, measured and left red: `correctPreCorrectionRoom` asks `hasFatalIssues(corrected)` and so **declined the 2026-09-03 room correction** on a version 2 document wearing `pal.antracit` on a veneer kitchen — `room.widthMm` came back **3600** with the finish and **3560** without it. `PLACEMENT_WEARS_UNOFFERED_FINISH` reads `settings` and `placements` and no room at all, so the finding is **carried, not created**, and the wave's *"unreachable on the load path by construction"* covers the **refusal** while the code's **fatality** has a second reader one arm earlier. **Contract gap, not a defect**: nobody wrote down that the severity table has two readers asking different questions. **The rule**: a normalisation's guard is a question about the normalisation — the only admissible validity question is what its own rewrite *changes*, and whether the document is executable belongs to `assertDesignValidForCatalog`, which runs unconditionally at the end of every load. So guard 2 becomes a **comparison** by `(code, path)`: decline only when the correction **creates** a fatal finding. No code in `DESIGN_ISSUE_SEVERITY_BY_CODE` can then reach the guard unless its finding is a function of `design.room` — **by construction, not by maintenance**. A filtered `hasFatalIssues` is rejected twice over: a hand list is ADR 0069 decision 4's own forgotten-member shape, and a second total map would **declare a computable fact** where ADR 0028 governs only facts with no ground truth. Guard 2's real work is kept and measured — a wall-B `emptyColumns` entry of `depthMm: 3580` is legal against 3600 and fatal against 3560, so the correction creates `EMPTY_COLUMN_DEEPER_THAN_ROOM` and still declines. **No collision with 6N-0** (measured at both 2830 and 2920; wall A is 3560 either way — order them by convenience). Also: 6Q-b's *"the strip runs first"* criterion is **withdrawn as unverifiable** — QA's swap produced zero failures because the two normalisations **commute on every input** (the resolution never adds or removes a `finish` key, and the strip reads no finish value). Replaced by the product claim (already asserted, ADR 0084 decision 2a) plus the finish-presence invariant that **goes red if either normalisation grows a condition**. |

## Supersessions

Beyond the index's "Status" column, these are the specific claims that were overtaken by a later
record. The superseded text stays in place, struck through, with a pointer to the record that
replaced it — nothing is deleted or rewritten silently.

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

- **ADR 0084** (2026-09-05) does not supersede a decision record: it corrects **wave 6Q-b's**
  veneer-fixture criterion in `docs/milestones/M6-price-and-global-settings.md` — the hood bullet and
  the *"not three, which would mean the hood was counted"* clause are struck in place there, with the
  measurement that moved them. Listed here because the number was reasoned and a reader who met it
  needs the pointer.

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
   at the new ADR number, and add the pair to the Supersessions list here — don't delete the old
   text.
5. Add its row to the Index table above.
