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
