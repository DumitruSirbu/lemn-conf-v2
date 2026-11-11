# M10 — Manufacturer price dashboard and the pricing model behind it

> **STATUS: PLANNED, 2026-10-25. Nothing built, nothing dispatched.** This plan was written by the architect.
> W0 (records) must land before any code wave is dispatched. Branch `m10-price-dashboard`, local only and
> **not pushed** [as of 2026-10-25; **superseded 2026-11-10**: the branch is pushed to origin up to `a6b23c18`
> (2026-11-05), the later commits are local only, and PR 16 on DumitruSirbu/lemn-conf-v2 exists; see the
> 2026-11-10 push-state correction below; **superseded again 2026-11-10: the owner pushed, local HEAD and
> origin both `99857d26`**, see the *Z gate close-out* block at the end of the 2026-11-10 blocks]: the owner declined a push on 2026-10-25. It was cut from `main` `0910dc06` and carries two commits:
> `8bddd951` (rulings, ADRs, backlog) and `3d4d892a` (the final mockup) [coordinator's brief; `git log` read by
> the architect]. Every migration this plan adds is **unapplied anywhere**, and no agent applies one to a
> provisioned database.
>
> **Amended 2026-10-26 for the owner's answers** (relayed by the coordinator; the plan was committed as `7df33c91`).
> OQ-2 to OQ-7, OQ-9 and OQ-10 are ruled; §6 holds each ruling. What moved:
> - **availability (disable and enable) now applies immediately, outside the draft** (A-17);
> - **creating an accessory linked to a cabinet type is in scope** (A-19);
> - **the lift mechanism is priced, and a lift door counts hinges** (A-20);
> - **the dashboard authors Romanian text only** (A-21).
>
> X1 is withdrawn (nothing waits on the owner any more). P4, R4 and U4a are split, M4 and S2b are added, and migration
> numbers move (§9.2). Two flags remain for the owner, neither blocking a dispatch: **OQ-5a** (500 mm inclusive or
> not) and **OQ-4a** (the coordinator's reading of OQ-4).
>
> **Amended again 2026-10-26 for the security read of ADR 0178** (findings F1–F10, every proposed fix accepted by the
> coordinator). Touched: A-10, A-11, A-12, A-13, A-15, A-17 and A-21; new A-22; §8.4(c), (d) and (e); §9.2 (grants,
> seeded singletons, the availability head folded into `0028`, the `priced` grant beside `0029`); the S, R, K and M4
> criteria; and risks RK-22 to RK-26.
>
> **Amended a third time 2026-10-26, for X0's open points X0-1 to X0-5** (rulings in §8.4 and §10 X0):
> - the seams pin is re-quantified by QA;
> - new wave **X2** folds the dashboard audit actions in;
> - `ItemRef` and `CatalogueAvailability` move to `pricing/catalogue-availability.ts`;
> - an address never carries a payload;
> - five invented shapes are blessed or corrected;
> - S1 gains the live-file skip fix.
>
> **Amended a fourth time 2026-10-26, for H1's open points H-1 to H-6** (lane H, §8.1, §9.1, Q2, P5, Z2):
> - new wave **H1b** wires the kitchen handle into every reader together, and owns `packages/three-adapter`;
> - H2 adds `settings.topRowHandle`;
> - H1 owns its input-check code;
> - Q2 adds the effect to `CommandEffect`;
> - a no-rollback note is added.
>
> **Amended a fifth time 2026-10-26, for X0's logic review** (5 Major, 11 minor, 2 doc conflicts):
> - publish takes the availability head CAS and writes its created rows inactive (M1, M5);
> - revert is by address (M2); the bulk group is a code (M3);
> - the activation audit stamps the returned revision (M4);
> - the minor shapes are pinned (m1–m11);
> - the log-revision and digest-round texts are reconciled with ADR 0178.
>
> **Position 2026-11-11 (supersedes "PLANNED ... nothing built" above):** built and merged on `m10-price-dashboard`; Z1 visual pass and Z2 test audit done; **not archived**. See the *Z1 visual pass and Z2 close, 2026-11-11* block (after the Z gate close-out) for the evidence and the two criteria that block the archive.
>
> **Amended 2026-10-27, coordinator rulings A and B:**
> - M10's migrations are renumbered contiguously from `0023` in landing order (§9.2);
> - S2b is folded into S2;
> - the S2 publish batch is accepted as equivalent to A-17, with conditions (S-b).

**Evidence tiers used below** (`docs/best-practices/documentation.md`, *Label the evidence tier*):

- **[doc]** a record quoted, with its file and section;
- **[src]** source read by the architect on 2026-10-25 at `3d4d892a`, with file and line;
- **[mock]** the final mockup `docs/design/mockups/Lemnaria Dashboard.dc.html`, read from its `x-dc` script, with the
  script line (`L<n>`);
- **[inf]** inference: not stated anywhere, and falsifiable by the owner's answer or by the named check.

**No amount or percentage in this plan, the mockup, the briefs or the sample book is approved.** That includes
15 %, +30/35 %, +70 %, every anchor, step and hardware rate. All are placeholders (ADR 0001 decision 4, ADR 0100
decision 2). Every criterion that touches money asserts a **rule**, never a magnitude.

---

## 0. How to use this plan

| You are | Read |
| --- | --- |
| The coordinator | §1 to §3, §8 (lanes, graph, merges), §9 (shared files), §11 (risks) |
| The scribe (W0) | §4 (sweep), §5 (rulings to record), §6 (owner questions), §7 (W0's list) |
| An implementer | Your wave's row in §10 and the contract it consumes in §8.4. Read nothing else unless the row's *Reading* leads you there. |
| QA or a reviewer | Your wave's *QA reading* or *Review reading* line in §10, and §12 |

---

## 1. Goal

The owner (an administrator) edits every price the configurator uses, from a desktop dashboard, without a
developer:

- the cabinet anchor prices and steps, hardware classes, material percentages, the depth rule and the accessories;
- the new-kitchen defaults.

Edits collect in a draft and go live together through **Publicare prețuri**. Every saved kitchen then prices at the
newly published book. A customer whose saved kitchen is affected sees one calm notice. A customer whose kitchen uses
a disabled option must pick a replacement before seeing a price. The shop is told when a kitchen it already received
has changed since staff last opened it, by a badge in **Bucătării clienți** and a daily digest e-mail.

## 2. Scope

**In scope.** Everything the final mockup draws, except where §6 recommends deferring it:

- frames D1–D10 and C1–C5;
- every 2026-10-25 ruling (ADR 0175; ADR 0062 Amendments 1–5 and the reconciliation note; the ADR 0072, 0092 and
  0100 Amendments; the notes on ADRs 0068 and 0071);
- backlog 54 (as superseded by 283), 176 (its trigger fires here), and 277–286.

**Out of scope** [doc: ADR 0062 Amendment 1; the briefs' *Out of scope*]:

- adding cabinet types; editing sizes; enabling or disabling a cabinet type (backlog 279, deliberately postponed);
- per-cabinet depth prices; roles and permissions beyond the existing capabilities;
- runtime translation (S7 *Traduceri*, ADR 0174 O-L3-3);
- the "Programată" version state (D8 note [mock L740]);
- price freezing (ADR 0062 Amendment 3, point 1);
- manual insert taking the default width (backlog 276's behaviour half): M10 declares the field only;
- anything under `design-source/`.

| Frames | Lane (§8) |
| --- | --- |
| D1 shell, sign-in reuse, menu groups, role-hidden items, mobile menu | U |
| D2 list, inline anchor edit, depth-rule card, bulk % | U (UI), M (bulk and validation), R (API) |
| D3 cabinet detail, preview, *Cu feronerie* and *Adâncime 600 / 700* switches | U, M (preview projection) |
| D4 hardware (including the lift rate), D5 materials, D6 accessories (including creating a linked accessory), with disable and delete dialogs | U, M (rules), S (usage counts and the availability log), R, P (P4b linked accessories, P5 lift) |
| D7 publish, D8 history and restore | U, M (change-set and diff), S, R |
| D9 new-kitchen defaults | U, H (stamping), S, R |
| D10 changed after seen, and the digest | K, S |
| C1 prices-updated notice, merged into C4C | Q, P, S, R |
| C2 whole-kitchen handle row | H, Q |
| C3 depth line and the new `depthNote` | P, Q |
| C4A–C4D forced replacement | P, Q, R |
| C5A soft note on a sent kitchen | Q, R |

## 3. Constraints that bind every wave

- **The cycle.** `docs/WORKFLOW.md`, without exception: plan, implement, adversarial QA (gates review), review per
  tier, verify, commit, archive. At most five must-fix items and about five production files per wave; this plan
  marks every exceedance.
- **The book is a parameter.** ADR 0062 seam 1: shapes are code and coefficients are data. Nothing under
  `packages/configurator-domain/src/pricing/` imports a book. Once wave R1 lands, `apps/web` has exactly **one**
  price-book root (backlog 176).
- **Exact money.** Every amount the domain publishes is a safe integer count of bani. The one rounding seam is the
  one §5 A-1 names, and nothing else rounds.
- **Snapshots are never re-priced.** A contact submission's stored `priced` snapshot, and the shop's notice built
  from it, are never re-priced (ADR 0154 decision 8; ADR 0072 Amendment, *What this answers elsewhere*).
  "Re-price everything" means **customer-facing prices of saved designs only**.
- **Every staff read and write is audited and fails closed** (ADR 0173 P-L3-3). A write commits its audit row in the
  same transaction. ADR 0173 is **Proposed**, not Accepted [doc: its status line]; M10 builds on its P-rows, and its
  acceptance is owed (§7).
- **Capabilities** [src: `packages/configurator-domain/src/account/capabilities.ts:7-63`]:
  - the catalogue, prices, publishing and defaults are gated by `price.edit`, which only administrators hold;
  - D10 (seen, badge, counter, list) is gated by `contact.read`, which operators and administrators hold.
  - No role work is needed.
- **Environments are add-only.** Migrations follow
  `docs/runbooks/applying-a-table-migration-and-its-application-role-grant.md`. Agents prepare and never run them;
  the owner applies them, preview first. No secret is printed.
- **Git hygiene.** Every brief bans `git checkout`, `git restore`, `git stash`, `git clean` and `git reset` by name.
  The scribe works only in the main tree. Every worktree brief opens with `git log --oneline -1`, and its fix is
  `git merge --ff-only m10-price-dashboard`; the branch is local, so no `fetch`.
- **Nothing ships mid-milestone.** No deploy, no push, unless the owner asks.

---

## 4. Sweep of the decision records (WORKFLOW, *Sweep the decision records before deciding*)

Commands run: grep over `docs/decisions/` for `after M8`, `wholeKitchenMinor`, `keeps throwing`, `575`,
`MAX_PRICE_COEFFICIENT`, `three mechanisms`, `nameKey`, `defaultTierId`, `revision`, and for the constants named
below. A row marked **W0** is written by the scribe in W0. "→ A-n" points at the architect ruling in §5.

| # | Record (date) | What it says | Conflict with the 2026-10-25 rulings or the final mockup | How it is settled |
| --- | --- | --- | --- | --- |
| S-1 | ADR 0062 (2026-09-02), *Decision*, and every 2026-10-25 Amendment's "the dashboard still comes after M8" | Nothing is built for the dashboard in M6–M8; it comes after M8 | The owner has asked for implementation now. STATUS shows M8 still open [doc: `docs/STATUS.md` §2 M8 row] | **W0: new ADR 0176** supersedes the timing, explicitly while M8 is open. Dated notes on 0062, 0072, 0100 and 0175 and on backlog 277 |
| S-2 | ADR 0174 O-L3-2 (2026-10-20) | S6 *Prețuri* is deferred until a record supersedes ADR 0062's timing **and** a redraw against the book's real shape exists | Both now exist: ADR 0176 (W0) and the final mockup (`3d4d892a`) | ADR 0176 names itself as O-L3-2's owed record; dated note on 0174. The "Prețuri" nav item is shown from U1 on; its pending-price count is deferred to U5 (ruling 2026-10-26, see the U1 and U5 rows) |
| S-3 | ADR 0106 line 87 (2026-09-10) | `priceBook.material.melamine.description`'s "…inclus în preț" restates `wholeKitchenMinor: 0` | `wholeKitchenMinor` is retired (ADR 0092 Amendment) | Retired in P3 (cut-over). The leaf's claim stays true: PAL is the 0 % reference and its material line is 0, rendered *inclus*. W0 dated note on 0106: the duplicated fact is now "PAL is 0 %" |
| S-4 | ADR 0106 decisions 1–2 and Amendment A; ADR 0095 decision 2; ADR 0174 O-L3-3 | A keyed row renders its message-file leaf; copy lives in message files; runtime translation is deferred | The mockup gives every catalogue text RO/RU tabs and says "textul apare și în Traduceri" [mock L891]. Editing a keyed row's name would change nothing a customer sees | **Ruled 2026-10-26 (OQ-3):** "all the translations should be done through files and a separate functionality for this … need only to set the title … in Romanian". → **A-21.** Keyed rows' text is read-only. Rows the dashboard creates get **Romanian only** (a name, and a description where the row has one); no RU tab. Russian waits for the deferred translation feature (O-L3-3 unchanged), and until then a created row renders its Romanian text in the Russian locale too. This supersedes ADR 0106's rejection of a one-language fallback **for created rows only**. W0 amends 0106 |
| S-5 | ADR 0092 decision 12 (~line 634) and its 6W restatement (line 1138) | The material group keeps throwing (`NegativeTierDeltaError`) on a default that is not its cheapest tier | Amendment 2026-10-25: re-read against percentages. D9 can now pick a non-PAL default for new kitchens [mock L752-756] | → **A-8**. The book's `material.defaultTierId` stays the fixed pricing fallback (PAL). Percentages are whole and ≥ 0, so PAL at 0 % is always cheapest and the throw stays a genuine book fault. D9's default is a separate concept (A-9) that never reaches the delta baseline |
| S-6 | `price-book.ts:12-13` [src]; `pricing-seams.test.ts`, which reads the source for the catalogue's width-step constant | "A body built at 575 is priced at 575"; pricing never names the width step | ADR 0175 decision 3: round up to 50 mm | → **A-4**. Pricing declares its own `PRICE_STEP_MM`, a pricing unit and not the catalogue constant. The comment is rewritten in P1. The seam test is amended **by QA** to forbid importing the catalogue constant |
| S-7 | ADR 0175 decision 5, *open seam* | Which amount rounds to 10 lei is open; it sits against "only presentation may round" (`price-book.ts:15`) and ADR 0100's "the query forbids rounding" | ADR 0175 assigns the seam to the architect; backlog 284 names the architect as owner | → **A-1** (seam and decomposition), recorded in W0 ADR 0177. `price-book.ts:15` and ADR 0100 *What whoever picks this up* get dated notes |
| S-8 | ADR 0175 *Open*: door count | Does the door count follow the actual width or the rounded one? | Unruled. The mockup's `base()` and `hwOf()` count doors at the **rounded** width [mock L510-511] | **Ruled 2026-10-26 (OQ-6): actual width** (A-3) |
| S-9 | ADR 0175 *Open*: height rounding | "Widths and heights" round; base 700 and the step come from the brief, not ruled separately | — | → **A-2** (round up, relative to a book-stated reference height). Owner-visible, not blocking |
| S-10 | ADR 0100 *What whoever picks this up* and Amendment; `parse-price-book.ts:58-72` [src] | `MAX_PRICE_COEFFICIENT_MINOR = MAX_SAFE_INTEGER / (4 × MAX_DESIGN_DIMENSION_MM)`. It must be **re-derived, not widened** | Percentages multiply a whole line, and the material and depth lines sum across every cabinet | → **A-5**. The bound is re-derived from named constants (terms, steps, the two percentage maxima, `MAX_PLACEMENTS`), with a test pinning that the worst case is exact |
| S-11 | ADR 0100 Amendment: "applied at the cabinet's real width" | The depth percentage multiplies the cabinet's price at its real width | ADR 0175 rounds widths up, so "real width" is ambiguous between the built width and the priced width | → **A-1**. The percentage multiplies the cabinet's **priced amount**, which already reflects round-up. "Real width" is read as "the cabinet's own width, not the anchor width". Dated note on 0100 |
| S-12 | ADR 0100 Amendment, *Where it applies* (**amended by the owner's 2026-10-26 ruling: every deeper cabinet, walls included; A-6**) | Base and tall cabinets, including hob and sink; not wall cabinets | `depthFollowsSetting()` answers `true` for the wall corner returns (`FOLLOWS_CABINET_DEPTH_ON_WALL_MAP`) [src: `cabinet-depth-rule.ts:57-60,134-140`], which the mockup draws at 320/320 [mock L500-503] | → **A-6**. Keyed on a **measured** catalogue fact (the finished depth differs between the catalogue built at 600 and at 700), never on that predicate, a band or a list of ids. A parity test sweeps every row |
| S-13 | ADR 0092 decision 8; `hardware-mechanisms.ts:27-29` [src] | "The three mechanisms ADR 0070 decision 1 names, and no fourth. A lift arm … knowingly unpriced" | D4 adds a fourth rate, "Mecanism rabatabil" [mock L689-690], and `hwOf` charges a lift cabinet hinges **and** a lift [mock L511] | **Ruled 2026-10-26 (OQ-5):** "add pricing for lift up mechanisms, and every lift up have at least two hinges. But if the door is wide … more than 500 … three hinges". → **A-20.** A fourth per-tier rate (`perLiftMinor`), one lift mechanism per lift-up door, and the lift door's hinges by width. W0 amends ADR 0092 d8 and ADR 0070 d6. The `wall-lift` catalogue comment ("lift mechanisms are out of ADR 0070's scope (decision 6)") [src: `catalog.ts:593-594`] is rewritten in P5. **OQ-5a** flags 500 mm inclusive or not |
| S-14 | ADR 0070 decision 4; ADR 0062 seam 1; `price-book.ts:223-243` [src] | Accessories are named fields, not a list; when an accessory applies is code. The rack is earned per sink that resolves a host | D6 says "Listă cu adăugare și editare. Fiecare accesoriu se leagă de un tip de dulap" [mock L870]. D6A shows the rack as "Dulap pentru chiuvetă · câte 1" [mock L710] | **Ruled 2026-10-26 (OQ-4):** "keep this link between accessory and a type of cabinet, and … adding this link between them on creating a new accessory". **Coordinator's reading, flagged as OQ-4a:** adding a new accessory is in scope, and creating one must link it to a cabinet type. → **A-19.** One new earning shape (per placement of the linked cabinet type) in a list beside the two named built-ins. The built-ins keep their rules. D6 shows each built-in's true rule, read-only. W0 amends ADR 0070 d4 and notes ADR 0062 seam 1 (S-28) |
| S-15 | ADR 0062 Amendment 3, point 3; fix-round-2 brief | Disabling takes effect for saved kitchens through the forced replacement | The final mockup contradicts itself. The dialogs say "Intră în vigoare când publici" [mock L779]; the comment list says text, active/inactive and defaults "se aplică imediat" [mock L887]. The D4 edit hint still reads "bucătăriile salvate cu ea o păstrează, la prețul curent" [mock L693], which the third Amendment reversed | **Ruled 2026-10-26 (OQ-2), against the architect's recommendation:** "switching off, it's not the pricing changes, so it should take effect immediately". → **A-17.** Disable and enable apply on save, outside the draft. The mockup's "Intră în vigoare când publici" **on a deactivation dialog** is wrong copy, and T1 replaces it. The stale D4 hint is also wrong copy (the third Amendment governs). Neither is carried |
| S-16 | ADR 0062 Amendment 1: "Changing a default never changes an already-saved kitchen" | — | A design that names no tier prices at the book's `defaultTierId` [src: `price-design.ts:411-426`]. Its material resolves through `DEFAULT_MATERIAL_ID` [src: `design-material.ts:26`] and its handle through `DEFAULT_HANDLE` [src: `queries/describe-selection.ts:77-79`]. If D9 wrote those defaults, saved kitchens would follow them | → **A-9**. Two concepts are separated. The **pricing fallback** (book `defaultTierId`, `DEFAULT_MATERIAL_ID`, `DEFAULT_HANDLE`) is fixed and never edited. The **new-kitchen defaults** (D9) are stamped explicitly into a design's `settings` when it is created (`generation/shell-design.ts` [src]) |
| S-17 | ADR 0072 Amendment: "where the marker is stored is open" | The owner named a cookie, the profile and the database | — | → **A-11**: a database row per design. Alternatives recorded |
| S-18 | Migration `0004` header; `design-revision.ts:1-9` [src] | The revision is opaque, "compared only for equality"; no layer above SQL does arithmetic on it. **The file's bytes are frozen once applied** | ADR 0062 Amendment 5 defines "changed" as `designs.revision >` the submission's or seen revision | → **A-12**. The comparison happens **in SQL only**, as `<>` (a revision only ever increments, so inequality is the same test). It stays opaque above SQL. `0004` is never edited (checksum) |
| S-19 | ADR 0062 Amendment 5, points 5–6; reconciliation note; ADR 0173 P-L3-8; `staff/request-status.ts` [src] | Statuses Trimisă → Văzută → Măsurare programată → În producție; reconciled to the shipped Nouă / Contactat / Ofertă trimisă / Închisă, **pending owner confirmation** | The final mockup draws the reconciled form [mock L814, L833] | **Ruled 2026-10-26 (OQ-9): confirmed.** Keep the four shipped statuses; the digest stops at `offer-sent` or `closed` |
| S-20 | Lot 3 plan §2.3 [doc: `M8B-account-screens-lot3-plan.md:250-251`] | `0023` (preset sort) and `0024` (invitations) are reserved for unbuilt waves | M10 needs seven tables (amended 2026-10-26: + availability) | M10 claims `0025`–`0031` (§9.2). The scribe records the reservation in both plans |
| S-20b | `packages/persistence/src/migration-files.ts:73` `assertVersionsAreContiguous` [src, S2's developer, 2026-10-27] | Migration versions must be contiguous; the latest is `0022`; no `0023` or `0024` exists on any branch | M10's `0025`… cannot land while Lot 3's reserved numbers do not exist | **Coordinator ruling A (2026-10-27):** M10 takes the next free numbers, contiguous from `0023`, in landing order (§9.2). Lot 3's provisional `0023`/`0024` move to the next free numbers after M10's, which its plan already anticipates. The guard is unchanged |
| S-21 | ADR 0153 decision 1; O-L3-1(c) | The application role reads no personal column of a contact submission | D10D's digest prints a customer name | The name comes from the **account profile**, as S3 does. A kitchen sent without an account prints its request reference. Security tier |
| S-22 | ADR 0100 Amendment: `globalSettings.depthNote` is at `ro.json:324` / `ru.json:324` | — | It is at line **325** in both [src] | Dated note (line drift only). ADR 0100 decision 5 still binds: the copy and the depth term merge together (merge point MP-3) |
| S-23 | ADR 0068 note (2026-10-25); ADR 0071 note (2026-10-25) | Both terms survive as dashboard fields; material carries a percentage | None | Consistent; no change |
| S-27 | The fix-round briefs: `…-v2-fixes.md:75` ("Deactivation goes through „De publicat” like a price change") and `…-v2-fixes-2.md:32`; mockup dialog copy [mock L779] | Deactivation takes effect at publish | Superseded by the owner's OQ-2 ruling (2026-10-26). **Correction to the coordinator's brief:** neither ADR 0062 nor backlog 285 states this. ADR 0062:222's "Both write to the draft" is about **inline anchor edits and bulk %**, and that stands. The text that says deactivation goes through publish lives only in the two briefs and in the mockup [src: grep of `docs/decisions/0062-*`, `docs/backlog/open.md` and `docs/design/*`, 2026-10-26] | W0 records the ruling as a new ADR 0062 Amendment (2026-10-26) and a dated note on backlog 285. The briefs are design history and are not edited |
| S-28 | ADR 0062 seam 1; `price-book.ts:223-226` [src] | "When an accessory applies is code, and an array would let a book declare one nothing implements" | A-19 adds a list of linked accessories | **Intent preserved, not overturned.** The list holds rows of **one** implemented earning shape (per linked placement), so no entry can declare behaviour the code lacks. The two built-ins stay named fields. W0 dated note on 0062 seam 1 |
| S-29 | ADR 0070 decisions 1 and 6; ADR 0092 decision 8; `hardware-mechanisms.ts:27-29`; `catalog.ts:593-594` [src] | Three mechanisms, and no fourth; the lift arm is knowingly unpriced and outside ADR 0070's scope | OQ-5 ruling | → **A-20.** W0 amends 0070 and 0092. P5 rewrites both code comments |
| S-30 | ADR 0070's hinge rule, as implemented: `hardware-mechanisms.ts:36-46` [src] | 2 hinges per leaf; 3 when the leaf is **taller than 900** (a strict boundary, "a 900 mm leaf takes two") | OQ-5 adds a **width** rule for lift doors: 3 hinges "if the door is wide … more than 500" | → **A-20.** For a lift-up door, the width rule decides and the height rule does not apply. The boundary is **strict (> 500)**, matching the owner's "more than 500" and the existing strict height boundary. That differs from the door-count threshold, which is ≥ 500. Flagged as **OQ-5a** |
| S-24 | `docs/CONFIGURATION_MODEL.md` (via ADR 0062 seam 3): no "current version" fallback inside pricing | — | With a database book, a server may find no published version | → **A-10**. No fallback: with no active version, every price surface refuses (renders no figure) and the contact route refuses. An owner-run seed command publishes the converted sample book as the first version |
| S-25 | ADR 0035 decision 8 | Price is a formula over width, not a table keyed on sizes | `price-per-size` for fixed-size rows | ADR 0175 already carves this out: fixed-size rows only. No change |
| S-26 | ADR 0001 decision 4 | No commercial figure is asserted in docs or code | Real prices will now live in a database | The sample book stays invented and provisional. A real figure enters only through the dashboard, as data. No change |

---

## 5. Architect rulings this plan records

W0 records these in ADR 0177 (pricing seams) and ADR 0178 (dashboard storage and lifecycle). Each one is
**owner-visible**: the owner may overrule it, and an overrule changes the named wave. None is an owner ruling. Each
carries **[inf]** for its reasoning.

**A-1 — Rounding seam and decomposition.** Within one cabinet *i*:

- `b_i` is its exact priced amount: anchor and steps, or its size price.
- `m` is the material percentage.
- `d_i` is the depth percentage if the cabinet deepens (A-6), otherwise 0.
- `r10(x)` rounds half-up to a multiple of 1 000 bani, in integer arithmetic only.

Three stages are rounded:

| Stage | Formula |
| --- | --- |
| `c_i` | `r10(b_i)` |
| `cm_i` | `r10(b_i × (100 + m) / 100)` |
| `cmd_i` | `r10(b_i × (100 + m) × (100 + d_i) / 10 000)` |

Lines:

| Line | Amount |
| --- | --- |
| cabinet line *i* | `c_i` |
| Material line | `Σ (cm_i − c_i)` |
| Depth line ("Adâncime 700 mm") | `Σ (cmd_i − cm_i)` |
| Hardware line | `r10(exact hardware)` |
| Each accessory line | `r10(exact amount)` |

Consequences:

- Every line is a multiple of 1 000 bani, and the total is exactly the sum of the lines.
- One cabinet's three parts sum to `r10` of its exact combined price. That combined price is exactly what the D3
  preview cell shows.
- The cross term `m × d` lands in the depth line. The depth line is the uplift on the cabinets *in their material*.
  The material line is then `m %` of the PAL cabinets **up to the per-cabinet 10-lei rounding**: it is a sum of
  rounded differences, never asserted equal to `r10(m % × Σ b_i)`. That matches the C3 frame's split [mock L784:
  38 200 × 35 % = 13 370].
- **The mockup is internally inconsistent here, recorded rather than copied.**
  - C3 splits the lines **additively**: material on the PAL cabinets, and depth also on the PAL cabinets with no
    cross term. 38 200 + 13 370 + 5 270 + 1 900 + 1 000 = 59 740 [mock L784].
  - The D3 preview and ADR 0100's Amendment **multiply** (1 500 × 1.15 × 1.35) [mock L512; `…-v2-fixes.md` §1].
  - The ruling governs, and A-1 implements multiplication. The C3 figures are illustrative.
- **Why not round per line from a summed exact amount:** the dashboard's preview and the customer's lines would
  disagree for one cabinet. **Why not round only the total:** the lines would not add up.
- Rejected alternatives: per-line rounding of summed exact amounts; rounding the total only; no rounding in the
  domain, with presentation rounding (the breakdown would not add up).
- This reverses "only presentation may round" (`price-book.ts:15`) at one named seam. Dated note on ADR 0100.
- **A depth line exists** if and only if the design's depth is 700 and at least one manufacturer-supplied cabinet
  deepens. At 0 % it renders *inclus*. There is no depth line at 600.

**A-2 — Round up.**

- Width: `w' = ⌈w / 50⌉ × 50`. With `k = (w' − anchorWidthMm) / 50`:
  - when `k > 0`, the price is `anchor + k × plusStep`;
  - when `k < 0`, the price is `anchor − |k| × minusStep`.
- Height: `h' = ⌈h / 50⌉ × 50`, and the height term is `((h' − anchorHeightMm) / 50) × heightStep`, signed.
- `anchorWidthMm` and `anchorHeightMm` are **book data** on the formula, so the formula needs no catalogue.
- A book × catalogue judgement (M2) keeps `anchorWidthMm` equal to the catalogue's declared default width.

**A-3 — Door count follows the actual built width** (ruled by the owner, OQ-6, 2026-10-26).

- The door term is `(leaves(actualWidth) − leaves(anchorWidth)) × perExtraDoorLeaf`. It is signed, so narrower than
  the door threshold removes one leaf's panel.
- **Why:** ADR 0068 requires the carcass door step and the hardware hinge count to count leaves the same way, and
  hardware counts the built body. The mockup's rounded count would bill hinges on a door that does not exist (a
  480 mm body rounds to 500).

**A-4 — `PRICE_STEP_MM = 50`** is declared in `pricing/`, as a pricing unit ("+ lei per 50 mm"). It is never imported
from, or derived from, the catalogue's width-step constant.

**A-5 — Percentages are whole numbers.**

- Depth: 0 to 100 [mock L852].
- Material: 0 to `MAX_MATERIAL_PERCENT` = 200 [inf; the architect's bound, not a business figure]. PAL is fixed at 0.
- Negative values are refused.
- ~~`MAX_PRICE_COEFFICIENT_MINOR` is re-derived so that `Σ over MAX_PLACEMENTS cabinets of b_i × (100 + 200) × (100 +
  100)` stays a safe integer.~~ **Re-ruled 2026-10-26 (P2 measured it):** that literal derivation bounds every
  **coefficient** by the whole kitchen's worst case and gives 671 740 bani (6 717.40 lei). That refuses realistic
  books; the sample's `tall-oven-tower` is already at 900 000. Instead:
  - **coefficients keep the existing flat-form bound** (`MAX_PRICE_COEFFICIENT_MINOR`, unchanged) for every form.
    Their own term arithmetic is already exact-checked (`exactProduct`, `exactSum`);
  - **the per-cabinet exact amount `b_i` is bounded** by `MAX_CABINET_AMOUNT_MINOR = floor(MAX_SAFE_INTEGER /
    (MAX_PLACEMENTS × (100 + MAX_MATERIAL_PERCENT) × (100 + MAX_DEPTH_PERCENT)))`, derived in code from named
    constants (no business ceiling is invented). Evaluation refuses `INVALID_AMOUNT` for a cabinet above it;
  - every A-1 line numerator is then a safe integer **by construction**, and a test pins the worst case (every
    placement at the bound, both percentages at their maxima) as exact;
  - the bound's value is computed by the code and **quoted from a run**, never restated here (R4). It is far above
    any realistic cabinet price, which the test shows by comparing it with the sample book's largest row;
  - P2 drops the separate 671 740 percentage-form coefficient bound.

**A-6 — Which cabinets deepen.**

- "Deepens" is a **measured** catalogue fact: the priced-as row's finished depth in the catalogue at 700 is greater
  than in the catalogue at 600.
- Customer-supplied rows never take the uplift.
- A parity test over every catalogue row asserts the rows that deepen.
- **Ruled by the owner, 2026-10-26: "Surcharge every deeper cabinet."**
  - P2 measured `occupiedDepthOfEntryM` in `buildKitchenLBodyCatalog(600)` against `(700)`. Every
    manufacturer-supplied wall-band row deepens: `wall-cabinet`, `wall-lift` and `open-shelf` (330 → 400), and
    `wall-corner-return-570`, `wall-corner-x-900` and their `-top` variants (330 → 400) [src:
    `worktop-depth.ts:29-32`]. Base, tall, hob, sink and the base corners deepen too. `fridge-free` does not
    (742 → 742), and it and the hood are customer-supplied in any case.
  - **The measurement governs.** Every manufacturer-supplied row that measures deeper takes the depth percentage,
    wall rows included.
  - This supersedes the 2026-10-25 expectation (and ADR 0100 Amendment's "not to wall cabinets (320 deep at both
    settings)", which was wrong about the code).
- **The rule is per priced-as row.** A lifted-column top (`wall-2door-600-deep-top`, `wall-2door-700-over-fridge`) is
  built 600 → 700 but prices as `wall-cabinet`, which measures 330 → 400. It therefore takes the percentage, because
  `wall-cabinet` deepens. Its own build depth is not consulted.
- **Where the measurement lives** (ruled 2026-10-26, P2 handoff):
  - a pure domain function in `pricing/`, `measureDeepeningRows(catalogAtShallow, catalogAtDeep)` → the set of
    priced-as build ids that deepen. It is catalogue-agnostic and imports no fixture;
  - `priceDesign`'s request gains `deepeningRows` (§8.4(a), amended);
  - the **composition root** computes it once per process from `buildKitchenLBodyCatalog(600)` and `(700)`, as it
    already builds the catalogue at the design's depth;
  - test suites pass their own;
  - rejected: computing it inside pricing from the shipped fixtures. It would bind pricing to one catalogue and be
    wrong for every other catalogue a test supplies;
  - P2's seam `priceDesignWithDeepening` folds into this field.

**A-7 — Fixed-size rows.**

- `price-per-size` priced at the smallest listed size ≥ the body's width (round up, as A-2).
- A width above every listed size is refused with a new code, `NO_PRICE_FOR_SIZE`. It is never priced at 0 and never
  at the nearest size.
- **The six structural corner rules are `price-per-size` with one entry** (P1 review, ruled 2026-10-26), **amended
  2026-10-27 (P3-Q4):**
  - each is keyed at the **round-up of its built width to the 50 mm grid**: 320 → **350**, 570 → **600**, 900 → 900
    (`sample-price-book.ts:178-209`);
  - ~~keyed at their actual built width, not rounded up~~. P1's parser refuses per-size keys off the 50 mm grid, and
    the lookup rounds the body's width up before matching, so a 320 key could never match. One rule for every
    per-size row is simpler than an exception for non-insertable rows;
  - the price of each built body is identical either way;
  - not anchored. An anchored formula on a non-insertable row is refused by M2;
  - **D3G shows the catalogue's built width** (320, 570, 900) with its one price, and never the rounded key.

**A-7b — No buildable body may price at or below zero** (P1 review, ruled 2026-10-26).

- The parser has no catalogue, so a parser-valid book can price a buildable body below zero; every kitchen holding it
  would then be refused `INVALID_AMOUNT`.
- M2's `judgeBookAgainstCatalog` evaluates **every manufacturer-supplied row over its whole buildable grid**:
  - every buildable width, after round-up: each 50 mm step in range, plus the off-grid minimum;
  - for `heightFlex` rows, every buildable height after round-up;
  - the leaf count that width actually gives.
- It refuses the book unless **every price is > 0**. Zero is refused too: the D3C copy reads "0 sau negativ"
  [`…-v2-update.md`: "La 200 mm prețul ar ieși 0 sau negativ"].
- It evaluates the grid rather than one corner, so the rule does not depend on every coefficient being ≥ 0.
- **(P3-Q2, 2026-10-27)** The same evaluation **refuses a row the build cannot evaluate** (`UNKNOWN_FORMULA_SHAPE`, for
  example a retired linear shape in a stored book) and **a catalogue row the book does not price** (`NO_RULE_FOR_BODY`).
  Publish (R3) and the owner-run seed (S2) therefore refuse a book that would parse, go active, and then refuse every
  price. The parser stays catalogue-free and unchanged on this point.
- `price-per-size` amounts are each > 0. Customer-supplied rows are exempt: they must be 0 (ADR 0107 d2).
- Publish (R3) refuses such a book whole, and the editor shows D3C's error on the field that drives the value.
- **(2026-10-26)** The same grid also refuses any price above `MAX_CABINET_AMOUNT_MINOR` (A-5), so an oversized book is
  refused at publish rather than at every kitchen that holds the row.

**A-8 — Material ordering.**

- The book's `material.defaultTierId` is the pricing fallback, fixed at the PAL reference.
- With percentages ≥ 0, `whole-kitchen-tiers.ts`'s material `"refuse"` rule stays a genuine book fault.
- That holds **only together with A-9**.

**A-9 — New-kitchen defaults are not the pricing fallback.**

- D9's values are stored unversioned and apply immediately ([mock L756, L895]; the owner's comment, per the mockup's
  *Răspunsuri la comentarii*).
- They are **stamped explicitly** into every new design's `settings` when it is created.
- Already-saved designs never read them.
- A legacy document that names no tier keeps pricing at the fixed fallback.
- The "default item cannot be disabled or deleted" rule [mock L782] refers to the **D9** default.

**A-10 — No published version means no price.**

- Every price surface renders no figure, using the existing refusal path.
- The contact route refuses with its existing unavailable answer.
- The application never falls back to the sample book.
- An owner-run seed command publishes the converted sample book, still `amountsProvisional: true`, as version 1.
  **Security amendment F3 (2026-10-26):** the seed takes the owner's account id as an argument, as the actor recorded
  as publisher. It refuses when any version already exists, so it can never replace a book. It is an owner-run
  command and writes no staff audit row.
- Tests and local runs seed the same book through a test-only helper (ADR 0151).

**A-11 — The notice marker is a database row per design**: the last pair (book version, availability revision) whose
prices its owner has acknowledged (amended 2026-10-26).

**Why a pair:** under A-17 a price can change without a new version. Activating a linked accessory adds a line to
every kitchen that earns it.

| | |
| --- | --- |
| Written | Only by a request authorised to edit that design (its write token or its account), through routes that mirror the save route's authorisation, refuse cross-site requests and accept JSON only (security F8). It is a customer write, **not a staff write**, so it has no audit row (F3) |
| Also never written by | A staff open (D10B), a share-link view (`/s/<token>`), or any request lacking edit-level authorisation. The `GET` that reports whether to show the notice needs edit-level authorisation too (F8) |
| How the first open writes | **Insert-if-absent** (`on conflict do nothing`): a first open never overwrites an acknowledgement (F8) |
| How an acknowledgement is validated | It records the pair **the page displayed**, and the server checks it: the version exists, and the availability revision is ≤ the current head revision. Otherwise `400` (F8) |
| Never written by | A save, so it never moves `designs.revision` (which would light D10's badge) |
| When the notice shows | The design has a marker, the active (version, availability revision) differs from it, and `pricesChangedBetween(design, {seenBook, seenAvailability}, {activeBook, currentAvailability})` is true. `seenAvailability` is rebuilt from the append-only availability log (A-17) |
| A design with no marker | Gets one written at the current pair, silently, on its first open |
| Sources of the marker write | Dismissing the notice ("Am înțeles"), completing the C4 sheet, or the first open |

- Alternatives, rejected:
  - a cookie: a claimed design opens on any device (ADR 0172), so "once" would break;
  - the profile: visitors have none.

**A-12 — Changed after seen.**

- The seen revision is **one marker per design, shared by all staff** (ruling: "an operator or administrator opening
  the kitchen … records the current revision as seen").
- The UI copy "ai văzut-o" is accepted as wording.
- It is stored beside the per-design request status, in its own table, not on `contact_submissions` (ADR 0153's narrow
  grants).
- With effective-seen = the seen revision, or else the latest submission's `design_revision`, a kitchen is "changed"
  when its revision `<>` effective-seen, compared in SQL.
- "Sent twice" needs no extra rule: both submissions name the same design.
- Opening the kitchen page sends the revision **the page displayed** (`POST …/seen`, audited). A save landing between
  load and mark therefore keeps the badge.
- **A seen mark never lowers the stored seen revision** (K1 QA, coordinator's ruling, 2026-10-26).
  - S4 writes `seen_revision = greatest(existing, displayed)`, compared in SQL.
  - `seen_by_account_id` and `seen_at` change only when the displayed revision is strictly greater, so they always
    describe the kept revision.
  - A stale page marking R1 after another page marked R2 leaves R2. The badge therefore cannot reappear for a revision
    already seen, and the digest's hold (A-13, revisions in SQL) stays correct.
  - The `kitchen-seen` audit row is still written for every admitted mark.
- **Security amendment F9 (2026-10-26):**
  - the store refuses, in SQL, a displayed revision **greater than** the current one (`409`);
  - a displayed revision that is not a digit string of the revision's shape is `400`, before the store;
  - **visibility (amended 2026-10-26, S1 QA, coordinator's ruling):** `markSeen` and the kitchen page follow the
    **staff-list predicate** of P-L3-4: not deleted by the client, and sent **or** held by an account. Staff can open,
    and mark seen, an account-held kitchen that was never sent; any other kitchen is `404`;
  - **the changed badge, the counter and the digest consider sent kitchens only** (`sent_at is not null`), and
    exclude client-deleted ones (F6). A mark on an account-held unsent kitchen is stored, but lights nothing;
  - **the polled changed-count read is exempt from a per-poll audit row.** It returns one number and no row, and
    auditing every poll would flood the log. This is stated as a deliberate exception to ADR 0173's "every list view
    is audited", which covers views that return rows.

**A-13 — The digest.**

- At most one run per calendar day (Europe/Chisinau), claimed idempotently by a day key.
- It is eligible when:
  - the kitchen changed after seen; and
  - it has not been in a digest since it was last seen; and
  - `designs.sent_at` is within 30 days; and
  - the status is not `offer-sent` or `closed`.
- **Judged on revisions, in SQL** (K1 review, coordinator's ruling, 2026-10-26).
  - "Not digested since seen" means **no digest entry** for the design with `revision >` the effective seen revision.
    It is never judged on instants: a stale seen mark, which A-12 allows, would otherwise re-send a revision already
    digested.
  - SQL delivers it to the domain as the boolean `isDigestedSinceSeen`, beside `isChangedSinceSeen`.
  - K1's eligibility takes those two booleans, `sentAt`, the status and `now`. It holds no seen or digested instants.
- **The window is 720 hours** (`DIGEST_WINDOW_MS`, the domain's constant): eligible if and only if `sentAt > now −
  720 h`, with `now` passed in. This is an exact duration, so a DST change in Europe/Chisinau neither lengthens nor
  shortens it.
- `designs.sent_at` keeps the **first** send's instant [src: `neon-account-kitchen-store.ts:428-436`], and it is the
  list's "Trimisă la" date. That is why the 30 days count from it (OQ-10).
- No eligible kitchen means no e-mail.
- Recipients are accounts holding `contact.read` with a confirmed address.
- **Security amendment F6 (2026-10-26):**
  - **Authentication:** the cron route authenticates only through `isAuthorizedCronRequest`
    [src: `apps/web/src/lib/server/cron-auth.ts:9`] and takes no parameters (no query, no body read).
  - **Preview:** it never runs on Preview. Preview has no `CRON_SECRET`, and no new environment variable is added.
  - **What it reads:** client-deleted designs are excluded. Of a customer it reads only `accounts.name`, else the
    request reference.
  - **What it writes:** every value goes through the existing `escapeHtml` builders. No customer text reaches the
    subject or any header. The only link is the staff kitchen URL.
  - **Claim before send:**
    - the day's claim is inserted **before** sending, with `on conflict do nothing`;
    - a send that fails **loses that day**; its kitchens stay eligible for the next day, because their entries are
      written only after a successful send;
    - the digest records itself in its own rounds and entries tables and writes **no** staff audit row (F3: it has
      no actor).

**A-14 — Bulk % and its rounding.** Every scaled amount (anchor, steps, size prices) becomes `r10(amount × (100 + p) /
100)`, as the mockup's `r10(a*1.05)` does [mock L608].

**What "amount" means (ruling R2-Q6, 2026-10-27):**
- It is the **candidate's** value (the active book with the draft applied), not the active book's. A bulk change
  scales prices as "De publicat" shows them, consistent with the running-candidate rule (M1-Q2). Each produced change
  replaces any pending change at the same address.
- **0 % is refused** (`400`, ruling R2-Q7), and so is a bulk change in which every scaled amount rounds back to its
  current value. A no-op group would inflate the pending count and the history.
- Rows whose scaled amount is unchanged after `r10` are left out of the group, so its counts name only real changes.
- `-0` is normalised before any check. A bulk change is one draft group, shown as one expandable row in
D7 and D8.

**A-15 — The draft is an ordered change-set, not a second book.**

- Each change names a stable field address (§8.4).
- The candidate book is `apply(activeBook, changes)`, a pure domain function.
- ↺ removes one change.
- Restore adds the archived version's differing fields as changes.
- **The `price-published` audit detail is stamped by the store** (S1 QA, coordinator's ruling, 2026-10-26).
  `sequenceNumber` is the inserted version's, and `changeCount` is ~~the length of the stored change summary~~
  **(amended 2026-11-04, ADR 0178's last Amendment)** the version's stored `change_count`: `countPendingPrices` over
  the summary, computed by the store at publish. Callers cannot supply either; the audit entry passed in omits both, as
  with M4's `availabilityRevision`.
- Publish stores the candidate book whole and immutable, plus its change summary. Versions are append-only, and exactly
  one is active.
- **Security amendments F7 and F10 (2026-10-26):**
  - **The active version is the newest row.** There is no `state` column and no `UPDATE` on versions.
  - Each version carries a strictly increasing `sequence_number`. Publish inserts `expectedActiveSequence + 1`, so of
    two racing publishes the second is refused by the uniqueness constraint (`changed-meanwhile`).
  - **Publish never accepts a book from the request.** The server computes `apply(activeBook, storedDraft)` from the
    stored draft at the expected draft revision, judges it, and stores it.
  - The draft and archived versions are never served on a non-staff route.

**A-16 — A disabled colour or handle (backlog 285's open point for the architect).**

- It is one row in the C4 sheet, whichever level carries it.
- The customer's choice replaces it **at every level where it appears**: the kitchen setting and every cabinet
  override.
- No ADR 0086 confirmation is owed, because the customer is choosing explicitly.
- A colour reset caused by a material replacement follows ADR 0057 and is announced ("Culoarea a revenit la …",
  C4C).
- **Why:** leaving a disabled colour on some cabinets would leave the price refused (P4a-a) with no row to resolve it.
- Owner-visible.

**A-17 — Availability is immediate, unversioned and logged** (from the owner's OQ-2 ruling, 2026-10-26).

- Disabling or enabling a material, colour, hardware class, handle or accessory is written **on save**, never into
  the draft. It is an append-only log: `catalogue_availability_changes`, one row per change with a monotonically
  increasing revision. The current state is each item's latest row.
- **The revision mechanism (security amendment F1, 2026-10-26; the coordinator's choice; pinned here so lane S does
  not guess):**
  - **The head row.** A seeded one-row table, `catalogue_availability_head(revision bigint)`, in the singleton
    pattern of `0009`'s `csp_report_cursor` [src: `0009_create_csp_reports.sql:12-16, 46-52`]. There is **no
    sequence**: the unattended screen refuses `create sequence`, so no `bigserial` either.
  - **One write is one statement.** It is a single CTE: `with h as (update catalogue_availability_head set revision =
    revision + 1 where revision = $expected returning revision) insert into catalogue_availability_changes
    (revision, …) select h.revision, … from h`. It runs in the same transaction as its audit row.
  - **No trigger** (pinned at the coordinator's request; it reconciles ADR 0178, see the doc-conflict note in §8.4).
  The log's `revision` is its **primary key** and is in the log's `INSERT` grant. Its value is only
    ever the one the head update returned within the same statement. A stale `$expected` updates no head row, inserts
    nothing, and is answered `changed-meanwhile`.
  - **Accepted residual**, recorded beside ADR 0173's F1 and F2: a holder of the application credential could insert a
    log row at an unused higher revision without moving the head. The database cannot stop that; the audit row and
    the head mismatch reveal it.
- **Publish takes the same CAS, and created rows start inactive** (X0 review M1 and M5, ruled 2026-10-26):
  - `publish` carries `expectedAvailabilityRevision` and `createdItems: ItemRef[]` (the rows the publish creates).
  - In its transaction it moves the head once per created item, chaining one CTE per item (the first at `$expected`,
    each next at the value the previous returned). Each writes an `active = false` log row for its item.
  - With no created items it still moves the head once, with no log row, so a publish always serialises with
    availability writes and defaults saves.
  - A stale `$expected` refuses the whole publish `availability-changed-meanwhile`.
  - **Implementation accepted as equivalent (2026-10-27):** S2's single Neon batch moves the head by `greatest(k, 1)`
    in one update and writes the *k* log rows at `old + 1 … old + k`, with every effect, the audit row included,
    conditional on the CAS inside one CTE. The conditions are in S-b.
  - So a created class or accessory is **inactive the moment it is published**, and becomes live only by an explicit
    activation (A-17's "activation requires the item in the active book").
  - Rejected: a separate "activated" set with created rows off by default. It would give two rules for "current
    state" (latest log row for shipped rows, set membership for created ones).
- **The head is gap-free; the log is not.** A defaults save or a publish with no created rows moves the head without
  writing a log row. "Gap-free and commit-ordered" describes the head's revisions, not the log's.
- **The D9 defaults save takes the same CAS** (the coordinator: "both take that head-row lock"). It increments the head
  revision with the same `where revision = $expected` in its transaction. Defaults and availability writes therefore
  serialise through one compare-and-set:
  - a disable judged against a stale defaults read is refused `changed-meanwhile`;
  - a defaults save naming an item that is disabled, or absent from the active book, is refused `item-unavailable`.
  - The last-active-option guard is judged against the state at `$expected`, which the CAS makes current.
- Pricing receives availability **beside** the book, as `priceDesign({…, book, availability})`. It is not a field of
  the book, so a published version stays immutable and availability never needs a publish.
- The browser receives `{versionId, book, availability}` together (R1). The contact route prices with the **current**
  availability, so a kitchen using an item disabled mid-session is refused at send (`REPLACEMENT_REQUIRED`), never
  sent at a stale price.
- **Activation requires the item to exist in the active published book.** A row created in the draft (A-18) can be
  activated only after it is published [mock L693: "O clasă nouă se creează inactivă. O activezi după ce îi publici
  prețurile"].
- The guards stay as they were, now checked at write time: the D9 default cannot be disabled, and the last active
  option of a group cannot be disabled.
- Rejected: availability inside the book via the draft (the architect's recommendation, overruled by the owner); a
  mutable flag on the active version (published versions must not change).

**A-18 — Creation and deletion stay book changes, through the draft.**

- Creating a hardware class or a linked accessory, editing a created row's Romanian text, and deleting an unused,
  non-default item are all **draft changes**. They take effect at publish, because they change what the book
  contains. The owner's OQ-2 ruling concerns switching an item off, not changing the book's rows.
- At publish the domain re-judges every deletion against the usage reader. An item that gained a user between draft
  and publish refuses the **whole** publish, naming the item. Publishing is all-or-nothing (D7G).
  - **Amended 2026-11-04 (architect; ADR 0178, Amendment on a deletion that gains a user).** The head CAS does not
    cover usage: a design save never moves the head. The refusal holds for every save the publish statement can see,
    through R4a's count inside the request and S2c's guard in the statement. A kitchen can still come to name a
    deleted item: a save in the publish's own moment, or a page loaded before the publish. That kitchen gets the
    forced-replacement sheet (Q3-g), never `UNKNOWN_TIER`. The work is in Lane S, *Publish and a deletion that gains
    a user*.
- A created row is inactive until it is published and then activated (A-17).
- Owner-visible. Editing a created row's text immediately (the mockup's comment "Textele … se aplică imediat", [mock
  L887]) was not ruled and is not taken: the text lives in the versioned book.

**A-19 — Linked accessories** (from the owner's OQ-4 ruling; **coordinator's reading, flagged as OQ-4a**).

- The book gains `linkedAccessories: LinkedAccessoryRule[]`. Each rule holds:
  - `accessoryId`, `ruleId` and `linkedBuildId`;
  - `perUnitMinor`;
  - authored Romanian `name` and optional `description` (A-21).
- **Earning:** one unit per placement whose priced-as row (`resolveCatalogEquivalent`, as cabinet rules use) equals
  `linkedBuildId`. Quantity 0 means no line, as for the built-ins (`price-design.ts:646-653`).
- **Which rows may be linked:** any catalogue row the book prices that the manufacturer supplies. Customer-supplied
  rows (hood, free-standing fridge) are excluded, because they are not sold. A link to a row the catalogue does not
  hold is refused by `judgeBookAgainstCatalog` (M4). Owner-visible.
- The two built-ins (`sinkProtectiveCover`, `dishDryingRack`) stay named fields with their code-defined earning rules
  (ADR 0070 d4), which are unchanged. Their link is shown read-only in D6.
- Lines: `accessory:<accessoryId>`, after the built-ins, in book order. Each is rounded per A-1.

**A-20 — The lift mechanism and the lift door's hinges** (from the owner's OQ-5 ruling).

- `HardwareTier.perLiftMinor` is the fourth rate, and `HardwareMechanismCounts.lifts` the fourth count.
- A **lift-up door** is a **declared** front property in the catalogue (`liftUp: true` on the front declaration). It
  is never keyed on a build id, per ADR 0068's population lesson.
- Each lift-up door counts **1 lift** and **2 hinges, or 3 when the door is wider than 500 mm** (strict, > 500; OQ-5a).
  For a lift-up door this width rule replaces the "taller than 900" height rule.
- P5 first enumerates every front the catalogue declares as a lift or flap. `front-population.ts:67` mentions "the top
  box's flap". **Only `wall-lift` is declared lift-up unless the owner names another.** Any other candidate is
  reported, not priced.
- The ADR 0092 Amendment C quantifier for Hettich below Standard gains a lift term. It is derived from the declared
  rates, never restated.

**A-21 — The dashboard authors Romanian text only** (from the owner's OQ-3 ruling).

- Keyed rows (every shipped row) show their text read-only.
- A created row carries an authored Romanian `name`, and a `description` where the row kind has one. There is no
  Russian field, and the parser refuses one.
- Rendering: a created row's authored Romanian is shown in **both** locales until the deferred translation feature
  (ADR 0174 O-L3-3) supplies Russian.
- Bounds follow the existing `MAX_BOOK_NAME_LENGTH` and `MAX_BOOK_DESCRIPTION_LENGTH` (`parse-price-book.ts:47-50`).
- **Characters (security amendment F5, 2026-10-26):** the rule of migration `0021_create_design_notes.sql:15` (not
  ADR 0021), as `judgeNoteText` applies it [src: `staff/note-text.ts:29`]:
  - NFC;
  - control and bidi-override characters refused;
  - non-empty after trimming.
  - Judged in M4.
- **Created ids (F5):** server-minted, strictly shaped, and unique against every built-in and keyed id. The client never
  supplies one.
- ADR 0106 Amendment A still binds: authored text may not state an amount, a percentage or "inclus". This is judged in
  M4 and shown as an inline error.

**A-22 — Audit, and the writes that have no actor** (security amendments F3 and F4, 2026-10-26).

- **Every staff write commits its audit row in the same transaction as the write.** Not "its own transaction".
- ADR 0178 restates P-L3-3 itself, so M10 does not depend on ADR 0173's acceptance.
- **The writes with no staff actor are named, and only these:**
  - the customer's notice marker (A-11);
  - the digest's rounds and entries (A-13);
  - the owner-run seed (A-10), which takes the owner's account id.
- **Store-stamped audit keys:** `availabilityRevision` on `catalogue-item-active-changed` (M4), and
  `sequenceNumber` and `changeCount` on `price-published` (S1 QA; `changeCount` is the stored `change_count`, 2026-11-04). The store fills them from what it wrote, before its
  own `readStaffAuditEntry` re-check. The caller's entry type omits them.
- **Every audit action has a closed detail key list** of kinds, ids, codes and counts (§8.4(e)). No created-row text,
  version label, note, search text or customer value ever enters `detail`.

---

## 6. Owner questions

### 6.1 The questions that blocked waves: all ruled 2026-10-26

The owner answered them on 2026-10-26, relayed by the coordinator. Quotation marks hold the owner's words as relayed,
not a verbatim transcript. **Nothing in §10 is blocked by an owner question any more.** Two flags remain, and neither
blocks a dispatch.

| # | Question | Ruling (2026-10-26) | Where it lands | Against the 2026-10-25 recommendation? |
| --- | --- | --- | --- | --- |
| **OQ-2** | Disabling: at publish, or immediately? | "switching off, it's not the pricing changes, so it should take effect immediately" | A-17. Availability leaves the book and the draft; a new store and migration (S2b, folded into S2 on 2026-10-27); R4a; U4a/U4b/U4c dialog copy; T1 copy | **Yes, reversed** (recommended: at publish) |
| **OQ-3** | Catalogue text and RO/RU tabs | "all the translations should be done through files and a separate functionality for this … need only to set the title … in Romanian, after that translate it using the translator functionality" | A-21. Romanian authoring only, for created rows; keyed rows read-only; no RU tab | Partly. Keyed read-only as recommended; **no RU field** (recommended: optional RU) |
| **OQ-4** | Adding accessories | "keep this link between accessory and a type of cabinet, and … adding this link between them on creating a new accessory" | A-19. Creation is in scope, with a linked cabinet type; a new earning shape (P4b, M4, U4c) | **Yes, reversed** (recommended: defer) |
| **OQ-5** | The lift mechanism; hinges on a lift door | "add pricing for lift up mechanisms, and every lift up have at least two hinges. But if the door is wide … more than 500 … three hinges. So everything should be priced." | A-20. P5 is no longer conditional; the fourth D4 column is in U4a | Priced as recommended; hinges now ruled |
| **OQ-6** | Door count at the actual or rounded width | Actual | A-3; P1 | No |
| **OQ-7** | Whole-kitchen handle vs per-cabinet; the top row | Accepted as recommended ("nothing changing here") | H1 | No |
| **OQ-9** | Status reconciliation | Accepted: Nouă / Contactat / Ofertă trimisă / Închisă; the digest stops at Ofertă trimisă or Închisă | K1 | No |
| **OQ-10** | Digest time; the 30-day origin | Accepted: 08:00 Europe/Chisinau (`0 5 * * *` UTC; 07:00 in winter); 30 days from the first send (`designs.sent_at`) | K4 | No |

**Flags for the owner (they block nothing).**

| # | Flag | Default built | Changes if the owner says otherwise |
| --- | --- | --- | --- |
| **OQ-5a** | "More than 500" for the third hinge on a lift door: strictly wider than 500, or from 500? | **Strict, > 500.** These are the owner's words, and the precedent is the "taller than 900" rule [src: `hardware-mechanisms.ts:39-46`]. Note that the door-**count** threshold is ≥ 500, so a 500 mm lift door has 2 hinges while a 500 mm hinged cabinet gets its second leaf | One comparison and its boundary test in P5 |
| **OQ-4a** | The coordinator's reading of OQ-4: adding a **new** accessory is in scope, and creating one must link it to a cabinet type. The built-ins keep their behaviour | **Built as read** (A-19) | P4b, M4 and U4c are dropped if the owner meant only "show the existing link" |

### 6.2 Questions that block nothing, only the milestone's close

| # | Question | Recommendation |
| --- | --- | --- |
| OQ-1 | M10's timing | **Instruction received (2026-10-26, relayed):** the owner asked for M10 to be planned and implemented now. W0's ADR 0176 quotes the exact wording. Nothing further is owed |
| OQ-8 | Default widths (backlog 276): the proposed 600 for `base-panbank`, `wall-lift`, `open-shelf` and `hood`; `tall-pantry` 600 or 800; the wall cabinet's anchor width (the mockup uses 600 [mock L505]) | 600 everywhere proposed |
| OQ-11 | Approve all M10 Romanian NEW COPY as drafted (as O28b and O-L3-7 did). **This now includes the replacement for the deactivation dialog's wrong "Intră în vigoare când publici"** (T1). **Also (2026-10-26): the restore-version audit label becomes "a adus în ciornă prețurile unei versiuni" (ru "Цены версии перенесены в черновик"), awaiting owner approval.** **Also (2026-10-27, U5's new leaves, awaiting owner approval):** `priceDashboard.publish.candidateRefusedTitle`, `priceDashboard.publish.candidateRefusedBody`, `priceDashboard.history.versionNotFound` and `priceDashboard.publish.bulkScopeAll` ("+{percent} % la toate dulapurile"). `candidateRefusedBody` puts the "↺" glyph in prose ("anulează (↺) o modificare"), which a screen reader may read as the glyph; the owner may prefer words only. **Also (2026-10-27):** (a) **U6's colour-reset note** names an MDF free colour by its raw hex ("Culoarea implicită devine #eceeeb"). **Owner question:** keep the hex, or use a word such as "culoarea aleasă" or "culoarea implicită MDF". The note also chains across two switches (Furnir → MDF names the colour from the previous reset, "Stejar"); the owner may prefer it to name the originally saved colour. (b) **R2's new audit label** `staffAuditDetail.changeKinds.discardAll` (ro "renunțare la ciornă", ru "отказ от черновика") awaits approval** | Approve. Russian stays an agent draft, marked and never pinned (ADR 0095) |
| OQ-12 | Every figure: the 15 %, the material percentages, every amount, and now the lift rate | They stay placeholders. The first real book is the manufacturer's own entry, published from the dashboard. The `amountsProvisional` switch (D7C) is the owner's |
| OQ-13 | Back up the price-book versions and the availability log in the scheduled export (ADR 0012's scoped select) | Yes: wave S6, before launch |
| OQ-15 | A cabinet given its own handle has no way back to "follow the kitchen": `set-appearance.ts` has `setHandle` but no clear, while colour has `clearFinish` (ADR 0099 d8). The coordinator is asking the owner (2026-10-26) | **Mirror colour:** a `clearHandle` command and a "Ca restul bucătăriei" option (wave Q2b). It is built on this default unless the owner rules otherwise before Q2b is dispatched |
| OQ-14 | **Who can review** (ADR 0062 Amendments 4–5, carried over as open: "roles are outside the dashboard's scope") | **Use the capabilities that already exist; no role work.** `contact.read` (operator and administrator) may open a kitchen, mark it seen, see the badge and counter, and receive the digest. `price.edit` (administrator only) may edit, publish, restore, switch items on or off and save defaults [src: `capabilities.ts:45-57`]. "Seen" is one marker per kitchen, shared by all staff (A-12). Recorded as A-12 and A-13; the owner confirms at close |

**The rulings A-1 to A-21 are not questions.** They are recorded as architect rulings that the owner may overrule;
A-17, A-19, A-20 and A-21 implement the owner's own 2026-10-26 answers. The owner should still be shown A-1
(rounding), A-9 (defaults) and A-18 (creation and deletion stay in the draft), because each is customer-visible or
departs from a mockup comment.

### 6.3 Owner answers, 2026-11-03

Asked by the coordinator from the U3, U4a, U5b and P5 records; the owner answered in the session. Nothing below is
built yet. Each row that changes behaviour names the work it adds.

| # | Question | Answer | Work it adds |
| --- | --- | --- | --- |
| OQ-16 | Lift prices (200 / 600 / 500 MDL) | Keep the placeholders; the owner sets real ones in the dashboard (as OQ-12) | None |
| OQ-17 | A lift door's third hinge: "wider than 500" reads the body or the door? | **The door.** `liftDoorWidthsMm` today returns the body's width per leaf, so bodies of 501–506 mm get a third hinge they should not | Change P5's comparison to the door's width, with its boundary tests (Full tier); amends A-20 |
| OQ-18 | Which fronts take a push-to-open latch | Push-to-open closes by a magnet on the cabinet's edge; every other front closes on its hinges. **One latch per door leaf, lift doors included. Drawers take none**: they open on push runners | `countPushToOpen` counts door leaves, not `openingFrontCount`; amends ADR 0092 decision 3 (a dated amendment is owed); every seeded hardware total moves (Full tier) |
| OQ-19 | Is the fridge housing's top flap a lift? | No, an ordinary door | None |
| OQ-20 | A refused draft that also holds valid changes | **List each change with its own ↺**, not discard only | The publish page's refusal list gains per-change revert (U5c, on R4a's revert reader) |
| OQ-21 | A created class's name is not editable (departs from A-18) | **Allow renaming, per A-18** | A rename route (R4a) and an editable name field (P6b) |
| OQ-22 | Anchor price 0 | Refused, as built | None |
| OQ-23 | Corner pieces named by built width (330, mockup 320) | Built width, as built | None |
| OQ-24 | Breakpoints 1200 / 1300 / 1360 px | Kept, as built | None |
| OQ-25 | A class deleted in the draft stays on the list, switched off with a reason | Kept, as built | None |
| OQ-26 | A draft whose changes cancel out offers Discard only | Kept, as built | None |
| OQ-27 | Publish is off while a "Nou" field holds unsent text | Kept, as built | None |
| OQ-28 | Does a push runner cost more than an ordinary drawer runner? | **Yes, a separate price.** Coordinator's reading, flagged: a drawer on a push-to-open body bills the push-runner rate **instead of** the ordinary runner rate, since the push runner replaces it | P6: a fourth-mechanism rate per tier, placeholder until the owner sets it |
| OQ-15 | A cabinet's own handle has no way back to "follow the kitchen" | **Mirror colour**: `clearHandle` and "Ca restul bucătăriei", as recommended | Q2b, as planned |
| OQ-11 | M10's new Romanian copy, including U5b's 23 and U4a's 18 lines | **Approved as drafted.** Russian stays an agent draft, marked and never pinned (ADR 0095) | None |

Nothing is open for the owner from the waves merged so far.

**Standing rule: every migration run against any database is asked of the owner first, every time.** An approval
covers the migrations it names and nothing later.

**Owner approval in chat, 2026-11-04 (one-time):** migrations `0023`–`0027`, as they stand once the steps below are done,
may be applied to every environment's database: the shared test database, preview and production. The reason given:
nothing is launched, so no user is affected. This changes ruling (c)'s timing (S2 row, §13.2): the
live run no longer waits for the merge to `main`. It does not cover `0028`, `0029` or any later migration, which are
asked again. Production is applied through the runbook. Order:
1. S2's stored change count lands on `m10/s2`, reviewed.
2. S4 merges `m10/s2`.
3. Every planned edit to `0023`–`0027` is confirmed on the branch tips.
4. S2, then S4, merge into `m10-price-dashboard`.
5. `ci:local` in the main checkout applies the migrations.
6. Preview and production, through the runbook, once step 5 is green. The coordinator tells the owner first, and the secret is
   never printed.

From that apply, the shared ledger is ahead of `main` and of every older branch, so their live suites fail with
`ledgerAheadOfCheckoutError` until M10 merges. `main`'s CI may too, if it shares the database (unverified, OQ-29).

**Owner approval in chat, 2026-11-04 (one-time):** migrations `0028` (S5, `design_price_notices`) and `0029` (S3,
`kitchen_defaults`), both reviewed, for every environment in the same order: S5 then S3 merge into
`m10-price-dashboard`, the live suite applies them to the test database, then preview and production through the runbook.
Nothing later is covered.

### 6.4 Queued for the owner (from 2026-11-03)

The owner is away for 12 hours from 2026-11-03 and asked that no wave wait on a decision. Each entry below was built on
the stated default and needs only a yes or a correction.

| # | Question | Default built | Wave |
| --- | --- | --- | --- |
| OQ-28a | Push runner: replaces the drawer runner's rate, or adds to it? | Replaces it | P6 |
| OQ-28b | May a hardware class's push-runner rate be 0? Under "replaces", 0 bills every push-to-open drawer's runner at nothing | **Refused at 0**: every push-to-open drawer has a runner (the "0 means the class lacks it" convention does not fit) | P6 |
| OQ-11b | New P6 copy: `priceDashboard.errors.aboveZero` and the creation note's push-runner exception, marked drafted | Built as drafted | P6 |
| OQ-24a | The hardware table now starts at 1440 px, not the 1360 OQ-24 kept: with five rates the Russian state chips ("По умолчанию", "Активно") overflow their column until about 1434 | 1440 (the desktop tests' width) | P6b |
| OQ-21a | Renaming a created class uses its own "Redenumește" button beside the name, not the page's Save | As built | P6b |
| OQ-29 | E2E shards moved: mobile 9 → 10 (U4b), desktop 6 → 7 (P6b). If `main`'s branch protection lists shard check names (`e2e (desktop, i, 6)` …) rather than the summary job, it needs the new names; `gh` here has no valid token, so it was not checked | Nothing changed on GitHub | U4b, P6b |
| OQ-21b | A rename shows no success notice; the heading and the pending chip change | As built | P6b |
| OQ-30 | How many changes a draft holds, as shown everywhere (chip, badge, publish button, confirm dialog, history row): one per price set; a bulk change counts each of its prices; a created class or accessory counts once with all it holds; a deleted row once | As built (U5c), one rule in the domain, also used for the history's count. Stored with each version at publish (ADR 0178, Amendment of 2026-11-04) | U5c; S2 |
| OQ-30a | If the counting rule changes later, should past versions in "Istoric" keep the count shown when they were published, or be recounted? | **Kept as published**: the count is stored with the version and matches its audit row (ADR 0178, Amendment of 2026-11-04). Recounting would need the summary loaded per history row and would leave the audit row disagreeing | S2 |
| OQ-31 | The sink cover: ADR 0070 d4 says it "is never toggled off"; D6A/D6C draw both built-in accessories as switchable | **The cover's switch is off with a reason** (the dated ADR wins); the rack stays switchable | U4c |
| OQ-32 | A created accessory priced at 0 | Accepted, as the domain allows; the form requires a typed amount | U4c |
| OQ-11c | U4c's 19 new Romanian lines (`accessories.*`, `lifecycle.*` accessory variants) | Built as drafted | U4c |
| OQ-11d | U5c's new Romanian lines: `publish.staleChangeKept`, `staleChangeWholeDraftOnly`, `noActiveVersion`, `answerUnreadableTitle`/`Body`, `history.restoreCandidateRefused`, `publish.staleDraftWholeBook`, `publish.writeCandidateRefused`, and the revised `staleDraftBody` | Built as drafted | U5c |
| OQ-15a | While a cabinet follows the kitchen handle, which control shows as chosen? | **Only "Ca restul bucătăriei"**, naming the resolved handle (as colour does); the default handle chip is no longer pressed and the "Implicit pentru acest dulap" note goes. Before, tapping the already-pressed default chip silently pinned the cabinet | Q2b |
| OQ-11e | Q2b's copy: "Ca restul bucătăriei" (ro); "Как в остальной кухне" (ru, an agent draft with no recorded source); on the top row it reads "Ca restul bucătăriei · Push-to-open" though the top row follows the top-row handle | Built as drafted | Q2b |
| OQ-34 | Should an anonymous kitchen, or one nobody has opened in months, keep a tier or linked accessory from being deleted? Today every saved kitchen the client has not deleted counts (S3 security review) | Every one counts, as built; switching off still works | S3, R4a |
| OQ-35 | The staff kitchen page's two estimates (as sent, current) read as "De la …", rounded up to the thousand like the customer's price, so a change under 1000 lei looks like none. Show exact totals to staff instead? | Rounded, as built | K3 |
| OQ-36 | A production deployment with no `DATABASE_URL` shows no prices and refuses contact requests, rather than failing to start | As built | W1 |
| OQ-37 | May a created hardware class or accessory have the same name as an existing one, for example a second "Blum" beside the shipped Blum? Customers would see two rows they cannot tell apart. Security review recommends refusing a name equal to another row's name, after NFC and case-folding. | Allowed, as built. Invisible format characters are refused from R4a4 on. | R4a4 (R-h) |
| OQ-38 | Two places count a created class differently. The header chip and the publish button count it once ("1 preț de publicat"), as OQ-30's proposal does. The publish page's group heading counts its lines ("6 modificări"). Should the heading follow OQ-30 too? | As built | R4a4, U5c (OQ-30) |
| OQ-39 | When the saved defaults set a cabinet depth that a preset cannot take (`setCabinetDepth` refuses it), the preset's copy keeps the preset's own depth. Should the new-kitchen screen offer only the presets that fit at the saved depth? | Every preset offered, and a copy that cannot take the depth keeps its own | R4b3 (R4b split, rule 5); also named OQ-R4b-1 (same question, not to be queued twice; noted 2026-11-08) |
| OQ-11f | The `cannot-judge` note on Switch off and Delete ends "Încearcă din nou mai târziu". From R4a5 on, production's Delete of a stated row (until R4c) and its Switch off (until R4b) are a standing state, and retrying will not help. New wording? | As drafted | R4a5 |
| OQ-40 | (added 2026-11-08, *R5 split*) The "Prețurile s-au actualizat" notice compares a kitchen's prices under the pair its owner last acknowledged with today's. If the kitchen can no longer be priced under the old pair, typically because the customer added something that did not exist then, the two cannot be compared. Should the notice show? | **Shown**, once; "Am înțeles" clears it. Not showing would turn the notice off for that kitchen for good, since nothing else moves the customer's marker (ADR 0178, price-notice Amendment of 2026-11-08, item 5; *R5 split*, ruling 6) | R5b, Q3 |
| OQ-28c | P6 leaves the seeded default kitchen's hardware total unchanged (its push fronts are top-row doors, no drawers); only push-to-open drawers move | Recorded, no question | P6 |
| OQ-33 | ADR 0062's third Amendment, item 2, forbids deleting an item any saved kitchen uses (owner, as relayed: "Deleting no, disabling yes"). That holds for every kitchen the publish can see. A kitchen can still come to name a deleted item: a save in the very moment of publishing, or a page left open since before the publish. What does that customer see? | **The same as for a switched-off item** (items 3 and 4): a notice, a required choice from the remaining options, and no price until they choose. A deleted accessory is removed with the notice. Architect's reading, ADR 0178, Amendment of 2026-11-04 | S2c, R4a, Q3 |

---

## 7. W0 — records (scribe, main tree, docs only)

**Tier:** the coordinator checks the records against this plan, and a **security reviewer reads ADR 0178**. It records
tables, grants, audit rules and who may write what, which is the precedent of Lot 3's security-reviewed W0 (ADR 0173's
status line). No code. **Nothing else writes while W0 runs**
(`docs/` and code freeze together).

1. **ADR 0176 — "The manufacturer price dashboard is milestone M10 and starts now."**
   - It supersedes ADR 0062's "after M8" timing (Decision; Amendments 1, 2 and 5) and does so explicitly while M8 is
     open.
   - It names itself as ADR 0174 O-L3-2's owed record, the redraw being `Lemnaria Dashboard.dc.html`.
   - Evidence: the owner's instruction of 2026-10-26 to plan and implement M10 now (OQ-1), quoted in the owner's words
     as relayed.
2. **ADR 0177 — pricing seams:**
   - A-1 to A-8, A-19 (the linked-accessory earning shape) and A-20 (lift mechanism and lift-door hinges, with OQ-5a's
     strict-boundary default flagged);
   - S-11, S-12, S-24, S-28, S-29, S-30;
   - it settles ADR 0175's open seams, with door count ruled by the owner (OQ-6).
3. **ADR 0178 — dashboard storage and lifecycle:**
   - A-9 to A-18 and A-21;
   - the migration table (§9.2, `0025`–`0031`);
   - the audit actions;
   - the capability gates.
4. **The owner's rulings of 2026-10-26**, each recorded as a dated amendment, relayed:
   - **ADR 0062 — a new Amendment (2026-10-26):**
     - OQ-2 (availability is immediate; it **supersedes** the deactivation-at-publish text of the fix-round briefs,
       S-27);
     - OQ-3, OQ-4 with the OQ-4a reading flagged, OQ-7, OQ-9 and OQ-10;
     - the timing pointer to ADR 0176;
     - a dated note on seam 1 (S-28).
   - **ADR 0092:**
     - decision 8 amended: the lift mechanism is priced, and a lift door counts 2 hinges, or 3 above 500 mm wide (OQ-5,
       OQ-5a flagged);
     - S-5 settled.
   - **ADR 0070:**
     - decision 4 amended: linked accessories exist beside the two built-ins (OQ-4);
     - decision 1 and decision 6: a fourth mechanism (OQ-5).
   - **ADR 0106:** S-3; and S-4 per OQ-3. Created rows are Romanian-only and render Romanian in both locales until the
     translation feature exists. This supersedes the rejection of a one-language fallback for created rows only.
     Keyed rows are unchanged.
   - **ADR 0068 and ADR 0175:** door count ruled (OQ-6); ADR 0175's status line and its open seams.
   - **ADR 0072:**
     - the marker is decided (A-11, now a version and availability pair);
     - "M6 and M8 still build nothing" is superseded.
   - **ADR 0100:** S-11, S-22, the timing.
   - **ADR 0173:** M10 builds on Proposed P-rows; acceptance is owed.
   - **ADR 0174:** O-L3-2 satisfied; O-L3-3 (translation) unchanged and now named by the owner as where Russian comes
     from.
5. **Backlog:**
   - 54, 176, 276 (field only), 277–286: each moves to "M10, wave …";
   - 285 gains a dated note: disabling is immediate (OQ-2, 2026-10-26);
   - the Lot 3 reservation of `0023`/`0024` beside M10's `0025`–`0031`.
6. **Indexes:** `docs/milestones/README.md` gains an M10 row; `docs/STATUS.md` gains M10 as **In progress, W0**.
7. **Owner flags:** OQ-5a and OQ-4a, and the close-only questions in §6.2, asked through the coordinator. Answers are
   recorded as dated amendments to ADR 0177 or 0178.

**W0 acceptance:**

- every row of §4 marked W0 has its record written or dated;
- no record states that anything is built;
- no record presents a placeholder figure as approved;
- every record that cites a mockup fact cites the frame id.

---

## 8. Lanes, contracts and the dependency graph

### 8.1 Lanes

**Worktree base for every lane.** Each lane has one worktree, reused from wave to wave and retired with a handoff at
the lane's end. The base is the tip of `m10-price-dashboard` **after the merges the wave's row in §10 names**. A
lane's first wave can therefore not start before MP-0.

**"Must not touch" for every lane** means:

- every file §9.1 assigns to another lane or window;
- `docs/**` (the scribe's);
- every applied migration;
- `design-source/`.

Below, only the additions to that rule are listed.

| Lane | Subject | Owns exclusively | Must not touch, beyond the rule above | Tier |
| --- | --- | --- | --- | --- |
| **X** | Contracts (X0; X1 withdrawn 2026-10-26, its parts are in X0) | The X0 files listed in §10 | Any behaviour; any existing test's assertions | Full (logic mini-review) |
| **P** | Pricing engine | `configurator-domain/src/pricing/**`; `catalog.ts`; `hardware-mechanisms.ts` and `front-population.ts` (P5); the domain root `index.ts` after MP-0; the P3 window in §9.1 | `design.ts`, `generation/**`, `price-dashboard/**`, `staff-changes/**`; `apps/web` outside the P3 window | Full |
| **H** | Whole-kitchen handle and new-kitchen stamping | `design.ts`; `queries/describe-selection.ts`; `push-to-open.ts`; `kitchen-handle/**`; `commands/set-kitchen-handle.ts`; `commands/rejection.ts` (H1, one code); `generation/shell-design.ts`; `generation/generate-kitchen.ts` (request type only). **H1b, added 2026-10-26:** `queries/design-projection.ts`, `hardware-mechanisms.ts` (an H1b window before P5), the PlacementRecord builder in the domain, `packages/three-adapter/src/scene-sync.ts`, and `apps/web/src/panel/use-panel-view.ts` | `pricing/**`; `apps/web` except H1b's one file | Full; H1b Full + visual |
| **M** | Dashboard model (pure) | `configurator-domain/src/price-dashboard/**` (after X0) | `pricing/**` (reads and imports only); `apps/web` | Full |
| **S** | Persistence, **the sole writer of `packages/persistence/` in M10** | `packages/persistence/**`, including the census, the privilege test, `index.ts` and migrations `0023`–`0029` (renumbered 2026-10-27, ruling A) | `packages/configurator-domain`; `apps/web` | Full + security |
| **T** | Copy | `apps/web/src/messages/*`; `i18n/content.ts`; the copy-lock tests | Every component; the `depthNote` reference (Q1's) | Light |
| **R** | Web server routes and the one book root | `lib/server/active-price-book.ts`; `lib/server/price-dashboard/**`; `lib/server/price-notice.ts`; `lib/server/price-notice-request.ts` (added 2026-11-08, *R5 split*); `lib/server/catalogue-availability.ts`; `app/api/staff/prices/**` (including `…/availability/**`); `app/api/designs/**/price-notice/**`; the R1 window in §9.1; the mint path (R4b) | `staff/**` components; `price-dashboard/**` components; `lib/server/staff/**` except where K2 hands over (none planned) | Full + security |
| **U** | Dashboard UI D1–D9 | `apps/web/src/price-dashboard/**` (except the X0 wire contract); `app/[locale]/staff/catalog/**`; `proxy.ts`; `staff-shell.tsx`, `staff-nav-sheet.tsx`, `staff-paths.ts` (except the K4 window); `apps/web/public/cabinets/**` | `staff/staff-kitchen*`, `staff-kitchens*` (K's); `lib/server/**` | Light + visual (U5 Full) |
| **K** | D10 and the digest | `configurator-domain/src/staff-changes/**`; `staff-kitchens-rows.tsx`, `staff-kitchen-filters.tsx`, `staff-kitchen-view.tsx`, `use-staff-kitchen.ts`, `kitchen-version-switch.tsx`, `use-changed-kitchen-count.ts`; `app/api/staff/kitchens/**`; `lib/server/staff/staff-kitchens.ts`, `staff-kitchen-actions.ts`; `app/api/cron/staff-change-digest/**`; `lib/server/mail/staff-change-digest.ts`; `vercel.json`; the K4 window in §9.1 | `lib/server/mail/mail-sender.ts` and the existing senders (consume only) | K1 Full; K2 and K4 Full + security; K3 Light + visual |
| **Q** | Customer side C1–C5 | `price-breakdown.tsx`, `price-bar.tsx`, `settings/global-settings.tsx`; after MP-3, also `price-breakdown-model.ts`, `whole-kitchen-tiers.ts`, `starting-price.ts`, `settings/global-settings-model.ts`, `store/whole-kitchen-apply.ts`; new `replacement-sheet.tsx`, `price-notice-banner.tsx`, `use-price-notice.ts`, `sent-kitchen-note.tsx` | `lib/server/**`; `staff/**`; `price-dashboard/**` | Q1 and Q3 Full; Q2, Q4, Q5 Light; every wave visual |
| **Z** | Integration, visual pass, test audit, close | Nothing: Z reads, measures and reports, and the scribe writes | Everything (verifier) | Visual + test audit |

### 8.2 Dependency graph (an arrow means "must be merged before it starts")

```
W0 ─► X0 ═══ MP-0 (fan-out) ═══╦═► P1 ─► P2 ─► P3+Q1 (MP-3; P3 also needs R1) ─► P4a ─► P4b ─► P5 (also needs H1b)
                               ║         │       │                              │       │
                               ║         └► M1   ├► M2                          │       ├► M3 ─► S3 (also needs S5)
                               ║                 │                              │       ├► M4
                               ╠═► H1 ─► H1b ─► H2   ├► Q2 (also needs H1b, T1)     ├► Q3 (also needs R5, T1)
                               ║                 │                              └► Q5 (also needs Q3, Q2, H1)
                               ║                 └► T2 (deletes the old depthNote leaf)
                               ╠═► S1 ─► S2 (also needs X2; S2b folded in, 2026-10-27) ─► S4 ─► S5 ─► S3 ─► S6
                               ║    │     │            └► K4 (also needs K3, U1)
                               ║    │     ├► R4a (also needs R3, M3)
                               ║    │     └► (live wiring of R2/R3)
                               ║    ├► R1 ─► R2 (also needs M1) ─► R3 (also needs M2) ─► R4a ─► R4b (also needs H2, S3) ─► R5 (also needs P4b, S5)
                               ║    └► K2a (also needs K1, X2)
                               ╠═► K1 ─► K2a ─► K2b (also needs S4, R1; merges with K2a) ─► K3 (also needs T1) ─► K4
                               ╠═► T1 ─► X2 (audit fold-in; before S2, R2, K2)
                               ╠═► T1 ─► U1 ─► U2 (needs M2) , U3 (needs M2) , U4a (needs M3) ─► U4b , U4c (needs M4, U4a) , U5 (needs M1) , U6 (needs H2)
                               ║    └► Q4 (needs R5)
                               ╚═► (everything) ─► Z1 ─► Z2
```

**Starts immediately after MP-0, five lanes truly in parallel:** P1, H1, S1, K1, T1. They share no file (§9). This is
unchanged by the 2026-10-26 amendment, and no owner question gates any of them.

**Starts as soon as one predecessor merges:**

| Wave | Waits for |
| --- | --- |
| U1 | T1 |
| R1 | S1 |
| K2a | K1, S1, X2 (built; parked on its branch until K2b, ruling K2-Q1) |
| M1 | P2 |
| X2 | T1 (it takes the message files for its window); it must merge before S2, R2 and K2 |

**Waits on the serial pricing chain:**

- after P3 (MP-3): M2, U2, U3, Q2, T2;
- after P4a: Q3 (also R5, which needs P4b);
- after P4b: M3, M4, U4a/U4b/U4c (through M3 and M4), R5, P5.

**R5 is three sub-waves (amended 2026-11-08, *R5 split*, Lane R).** Read the graph's `R5` node as R5a ∥ S7, then R5b.
Q3 and Q4 may **start** once R5a has merged, building against its wire, and **merge** only after R5b.

Q2 waits for MP-3 because Q1 holds `global-settings.tsx` until then.

**The hardest serialisation point is still P3, the cut-over** (§10, P3). It changes `PriceBook`'s shape for every
consumer at once, and while it runs it holds named files in `apps/web/src/price/**` and `settings/**`. Lane Q may not
start Q3 or Q5 until P3 merges. Q1 is built **on P3's branch**, and the two merge together at MP-3 (ADR 0100 decision 5:
the `depthNote` copy and the depth term ship in one change).

**The P lane is now longer:** P1 → P2 → P3 → P4a → P4b → P5. P5 (lift) is independent of P4 in subject but shares
`price-book.ts`, `parse-price-book.ts` and `price-design.ts`, so it runs after P4b in the same lane rather than beside
it.

### 8.3 Merge protocol

- **A wave merges only when its QA is green and its review tier is complete**, verified by the coordinator (WORKFLOW
  step 5). The wave branch is `m10/<wave-id>`, merged into `m10-price-dashboard` by the coordinator.
- **The next wave in a lane** starts from the branch tip *after* that merge, with
  `git merge --ff-only m10-price-dashboard`. Its first command is `git log --oneline -1`, and the coordinator checks
  the base itself (agent-coordination.md, *Agent worktrees arrive at the session's starting commit*).
- **Named merge points:**

  | Merge point | What merges | Why it is named |
  | --- | --- | --- |
  | MP-0 | W0 + X0 | The fan-out |
  | MP-3 | P3 and Q1 together | ADR 0100 decision 5 |
  | MP-176 | R1 | From here on, `apps/web` has one book root |
  | MP-Z | All lanes | Z1 begins |

- **No two merges run while a gate, a push or any reader is running** (R1, R8). After every merge the coordinator runs
  `pnpm check` in the main tree before the next merge.

### 8.4 Cross-lane contracts, frozen at X0

The contract is code (types, port interfaces, wire types), committed in X0 and reviewed before the fan-out. A lane
that needs a contract changed **stops and reports**. The architect amends this section, and X0's owner files are
re-opened by a named follow-up wave. A contract is never changed inside a consuming lane.

**Amended 2026-10-26: X1 is withdrawn.** The parts it was holding back are answered (OQ-2, OQ-3, OQ-5) and are
frozen in X0 itself: availability, Romanian-only created text, linked accessories, and the lift rate.

**(a) The book shape, as a specification.** The types land in P1, P2, P4b and P5. X0 freezes this text, and P
implements exactly it.

```
PriceBook {
  version, currency "MDL", status ("estimate"; the dashboard never edits it [mock L894]), amountsProvisional
  cabinetRules: CabinetPriceRule[]           // formula: AnchoredFormula | PricePerSizeFormula (old linear shapes retired at P3)
  hardware: TierGroup<HardwareTier>          // defaultTierId = the fixed pricing fallback (A-8, A-9); HardwareTier gains perLiftMinor (A-20)
  material: TierGroup<MaterialTier>          // MaterialTier.percentOfCabinets: whole 0..MAX_MATERIAL_PERCENT; wholeKitchenMinor removed at P3
  depthRule: { deepCabinetPercent: whole 0..100 }
  accessories: BookAccessories               // the two built-ins, still named fields, rules unchanged
  linkedAccessories: LinkedAccessoryRule[]   // A-19: { accessoryId, ruleId, linkedBuildId, perUnitMinor, name (RO), description? (RO) }
}
// Created rows (a hardware class, a linked accessory) carry authored Romanian `name`/`description` and no key and no
// Russian field (A-21). There is no `active` flag anywhere in the book (A-17).
// ItemRef and CatalogueAvailability live in pricing/catalogue-availability.ts (types only, written by X0; ruling 2026-10-26 X0-3):
// pricing is the lower layer, and price-dashboard/book-field-address.ts imports them from there, never the reverse.
CatalogueAvailability { revision: string (opaque), disabled: ItemRef[] }        // A-17; passed BESIDE the book
ItemRef = { kind: "material", tierId } | { kind: "hardware", tierId } | { kind: "finish", finishId }
        | { kind: "handle", handle } | { kind: "accessory", accessoryId }        // built-in or linked
priceDesign({ design, catalog, book, pricingVersion, selections, availability, deepeningRows })
// deepeningRows: ReadonlySet<string>, the priced-as build ids that deepen (A-6; amended 2026-10-26). P2 adds it as
// optional, refusing a percentage-form book without it; P3 makes it required and wires every caller through the one
// root (R1). M2's preview takes the same set.
AnchoredFormula { shape: "anchored-width" | "anchored-width-and-door-leaves" | "anchored-width-and-height"
                  | "anchored-width-height-and-door-leaves";
                  anchorWidthMm, anchorMinor, perStepWiderMinor, perStepNarrowerMinor,
                  perExtraDoorLeafMinor?, anchorHeightMm?, perHeightStepMinor? }
PricePerSizeFormula { shape: "price-per-size"; sizes: { widthMm, amountMinor }[] (1..n, widths unique, ascending) }
New refusal codes: NO_PRICE_FOR_SIZE (A-7), REPLACEMENT_REQUIRED (a selection names an item `availability` disables; carries the item refs)
New line kind: "depth" (A-1). The Material line keeps kind "material".
```

**(b) The field address of a draft change** (domain, `price-dashboard/book-field-address.ts`, written in X0):

```
{ kind: "cabinet", ruleId, field: anchorMinor|perStepWiderMinor|perStepNarrowerMinor|perExtraDoorLeafMinor|perHeightStepMinor }
{ kind: "cabinet-size", ruleId, widthMm }
{ kind: "hardware", tierId, field: perHingeMinor|perDrawerMinor|perPushToOpenMinor|perLiftMinor }
{ kind: "material", tierId, field: "percentOfCabinets" }
{ kind: "depth-rule" }
{ kind: "accessory", accessoryId, field: "perUnitMinor" }        // built-in or linked
{ kind: "provisional", value: boolean }
{ kind: "hardware-tier-created", tierId }        value: { name, description }                  // RO only (A-21); inactive until published, then activated (A-17, A-18)
{ kind: "accessory-created", accessoryId }      value: { linkedBuildId, perUnitMinor, name, description? }   // A-19
{ kind: "created-row-text", item: ItemRef, field: "name"|"description" }   value: string   // RO; created rows only.
        // item.kind ∈ { hardware (a created tier), accessory (a linked accessory) } only (m9); keyed and built-in rows refused
{ kind: "item-deleted", item: ItemRef }         value: true                                    // unused and non-default; re-judged at publish (A-18).
        // item.kind ∈ { hardware, material, accessory (linked only) } (m9). Finish, handle and the two built-in accessories
        // are code-declared: they can be disabled, never deleted
// No "active" arm: availability is not a draft change (A-17).
DraftChange { address, value, groupId?, bulk? }   // groupId = one bulk action (A-14)
// bulk: { percent, scope: all|group|selection, groupCode? (iff scope = group) }. Present iff groupId is present, and
// identical on every change of one group (ruling M1-Q1, 2026-10-27). D7/D8 can then name "+5 % la 22 dulapuri" and
// the "Coloane" scope, which r10 rounding makes impossible to recover from amounts.
```

**(c) Persistence ports** (X0, `packages/persistence/src/`; S implements them).

**Rulings on X0's open points (2026-10-26):**

- **Change identity is the address alone; the payload is always `value`** (X0-4). An address carries no payload,
  so two edits of one field have equal addresses. Within the draft, a later change with an equal address replaces the
  earlier one, and ↺ removes by address.
- **A created class's rates are separate `hardware` changes** keyed by the server-minted `tierId`. They are written
  **in the same draft write** as the `hardware-tier-created` change, so the draft never holds a created class without
  its four rates. M4's `applyChanges` refuses a candidate book holding a created tier that lacks any rate.
- **Revert names an address, never an index** (X0 review M2): `{kind: "change", address}`. `changeIndex` leaves
  `DashboardRequestField`. A bulk group is reverted as `{kind: "group", groupId}`, where the id is the server-minted
  one stored on the group's changes.
- **The bulk target is `groupCode: PriceGroupCode`** (`base | wall | tall | corner`; X0 review M3), and joins
  `DashboardRequestField`.
- **`DraftChangeInputWire` carries no `groupId`** (m1). The bulk route mints it, and a single-change input never has
  one.
- **Editing a linked accessory's cabinet type after creation is out of scope.** The owner asked only for linking "on
  creating a new accessory". D6B shows the link read-only once created, and there is no arm for it. Its price is
  edited through `{ kind: "accessory", accessoryId, field: "perUnitMinor" }`.

**(c) Persistence ports, continued.**

- **No `null`; a special-case object instead.**
- **The book is `unknown`** (jsonb): the store never imports a book type, and the domain parses it.
- **Results use a `kind` discriminant** (X0-5), e.g. `{kind: "ok"}`, `{kind: "claimed", roundId}`. Absent states stay
  named constants (`ALREADY_CLAIMED`, `NO_ACTIVE_VERSION`, `NONE_SAVED`, `NEVER_RECORDED`). The plan's literal result
  names are read as these kinds.
- **`DigestEligibleKitchen`** (X0-5) is exactly `{designId, kitchenName, customerName | reference, sentAt, updatedAt,
  revision}`:
  - `kitchenName` is `designs.name`, escaped and never in the subject;
  - `customerName` is `accounts.name` only, else the request reference;
  - `updatedAt` is the existing `designs.updated_at` [src: `0001_create_designs.sql:6`], which D10D's "modificată …"
    reads;
  - `revision` is opaque;
  - no e-mail and no phone. Any other field is removed.
- **Every staff write takes an audit entry and commits it in the same transaction as the write** (A-22, F3). The
  notice marker, the digest's tables and the owner-run seed are the only writes without one, and they are named.

| Port | Operations |
| --- | --- |
| `PriceBookStore` | `readActive()` → `{versionId, sequenceNumber, label, publishedAt, book}` (the newest row) or `NO_ACTIVE_VERSION`; `readVersion(id)`; `listVersions(page)` (state derived: the newest is active, the rest archived); `readDraft()` → `{draftRevision, changes}`; `writeDraft({expectedDraftRevision, changes, audit})` → ok or `changed-meanwhile`; `publish({expectedDraftRevision, expectedActiveSequence, expectedAvailabilityRevision, createdItems, label, note, book, changeSummary, audit})` → ok `{versionId, sequenceNumber, availabilityRevision}`, `changed-meanwhile` or `availability-changed-meanwhile`. One transaction: the head CAS and the created items' inactive log rows (A-17), the insert at `expectedActiveSequence + 1`, the draft-row reset, and the audit row. `book` is computed by the server from the stored draft (F10), never taken from a request. **`changeSummary` is pinned** (m8): the published `DraftChange[]` JSON array, with minted ids and group ids, ~~from which `changeCount` is its length~~. **Amended 2026-11-04 (ADR 0178's last Amendment):** `changeCount` is the count the publisher confirmed. The store computes it once at publish, as `countPendingPrices(changeSummary)`, and stores it in `0023`'s `change_count`. `listVersions` and the `price-published` stamp both read that stored value. The request carries no count. **Refusals the store does not return:** `item-is-default` and a used deletion are judged by the domain **before** the call, against defaults and usage read at `expectedAvailabilityRevision`, which the CAS keeps current (M5). **Amended 2026-10-26: F7, F10, then X0 review M1, M5 and m8** |
| `KitchenDefaultsStore` | `read()` → defaults or `NONE_SAVED` (the seeded row holds `{}`); `save({expectedRevision, expectedAvailabilityRevision, defaults, audit})` → ok `{revision, availabilityRevision}` (m3), `changed-meanwhile` or `availability-changed-meanwhile`. It increments the availability head in the same transaction (A-17, F1). **The store returns only these two CAS refusals** (m2): `item-unavailable` is the domain's judgement under the CAS, made before the call, because the store cannot read `defaults` (`unknown`). **Amended 2026-10-26: F1, then X0 review m2 and m3** |
| `KitchenUsageReader` | `count(itemRef)` → a count of designs not deleted by the client |
| `KitchenChangeStore` | `markSeen({designId, displayedRevision, audit})` → ok, `not-found` (outside the staff-list predicate: client-deleted, or neither sent nor held by an account; P-L3-4), or `displayed-revision-ahead` (compared in SQL; F9); `listChanged…` is folded into the staff kitchens statements, which exclude client-deleted designs; `claimDigestDay(dayKey)` → `{kind: "claimed", roundId}` or `ALREADY_CLAIMED`, **where `roundId` is the day key itself** (the round's identity is its day; doc-conflict pin) (insert, `on conflict do nothing`, before sending; F6); `listDigestEligible(now)` (client-deleted excluded); `recordDigested(roundId, entries)` (no audit; F3). **Amended 2026-10-26: result unions named** |
| `CatalogueAvailabilityStore` | `readCurrent()` → `{revision, disabled}` (`revision` is the head's); `readAt(revision)` → the state at that revision, from the append-only log; `setActive({item, active, expectedRevision, audit})` → ok `{revision}` or `changed-meanwhile`, written as one CTE statement (A-17, F1). **`audit` is an entry without `availabilityRevision`** (X0 review M4). The store stamps the revision its CTE returned into the detail, then runs its own `readStaffAuditEntry` re-check, then inserts, all in the one transaction. The expected revision is not recorded: two racing requests may share it, while the returned revision is the unique key joining the audit row to its log row |
| `PriceNoticeStore` | `readAcknowledged(designId)` → `{versionId, availabilityRevision}` or `NEVER_RECORDED`; `recordIfAbsent(designId, pair)` (the first open, insert-if-absent; F8); `recordAcknowledged(designId, pair)` → ok, `unknown-version` or `revision-ahead` (validated in SQL against the versions table and the availability head; F8). No audit (F3). **Amended 2026-10-26: `recordIfAbsent` and the result union added** |

**(d) Wire contract** (X0, `apps/web/src/price-dashboard/price-dashboard-wire-contract.ts`, plus additions to
`apps/web/src/staff/staff-kitchens-wire-contract.ts`).

- Request and response bodies and error codes for: dashboard state, draft change (all §8.4(b) kinds, including
  creation and deletion), revert, bulk, publish, versions, version, restore, **availability (immediate)**, usage counts,
  defaults, seen, changed count, price notice.
- The editor's book payload is `{versionId, book, availability}`.
- **Naming (ruling K2-Q2, 2026-10-27):** the **wire** says `changedAfterSeen` and `displayedRevision`, as the frozen
  contract has them. The **domain, ports and SQL** say `isChangedSinceSeen` (K1, merged). K2b maps one to the other at
  the wire boundary. The dispatch's `changedSinceSeen` was a slip, and no third name is introduced.
- **X0-5 shapes:**
  - **`KitchenDefaultsWire`** member names are exactly `DesignSettings`'s (`materialTierId`, `hardwareTierId`,
    `cabinetDepthMm`, `finish`; `handle` from H1) plus `topRowHandle`. Any other name is renamed to these.
  - ~~**`PriceVersionSummary.changeCount`** is blessed as **derived** from the stored `change_summary` (not a `0025`
    column). The store or service computes it; nothing stores it twice.~~ **Superseded 2026-11-04** by ADR 0178's last
    Amendment. It is the count the publisher confirmed (`countPendingPrices`). The store computes it at publish from
    the summary it stores, and keeps it in `0023`'s `change_count` column. No caller supplies it. It is not a second copy
    of the summary's length: the count cannot be derived from the length, and it is fixed at publish.
- **Amended 2026-10-26 (security):**
  - **creation requests carry no id**; the server mints it (F5);
  - **the publish request carries no book and no `provisional`** (`{expectedDraftRevision, expectedActiveSequence,
    expectedAvailabilityRevision, label, note}`; F10 and X0 review m4). `provisional` has **one** source: the draft
    change `{kind: "provisional"}`, which is versioned and shown in D7's diff. D7C's stronger confirmation shows
    whenever the draft holds `provisional = false`;
  - draft and archived versions appear only in staff responses (F10);
  - the closed refusal list gains `displayed-revision-ahead`, `item-unavailable`, `availability-changed-meanwhile`,
    `unknown-version` and `revision-ahead`;
  - the seen request's revision is a digit string, `400` otherwise (F9);
  - **every revision shape check is bounded** (m6): 1–19 digits with no leading zero, and at 19 digits ≤
    `9223372036854775807`, compared **as a string** (equal length, then lexicographic), never parsed into a number
    (the revision stays opaque). This applies to seen (`NOT_A_REVISION`) and to availability revisions
    (`AVAILABILITY_REVISION_SHAPE`);
  - **the price-notice refusals are `400`** (A-11; m5): `unknown-version` and `revision-ahead` leave
    `DASHBOARD_CONFLICTS` for a 400 list;
  - **defaults naming an unavailable item is `409 item-unavailable`** (m2). `NOT_AVAILABLE` (400) is removed: the
    refusal is a state conflict judged under the CAS, not malformed input;
  - publish adds `409 item-is-default {item}` (M5);
  - **the pending-price count read on every staff page is exempt from per-read audit** (ruling U5-Q3, 2026-10-27),
  like the changed-count poll. It is one number with no row, and the page it decorates is itself audited where audit
  applies. It is read only for sessions whose navigation lists "publish" (`price.edit`);
- **the usage-count read is exempt from per-read audit** (m10), like the changed-count poll (A-12). It returns
    counts only, and the screen that asks for it is audited as `price-catalogue-viewed`.
- Refusal codes are a closed list.
- Bodies carry codes, never sentences (ADR 0095 decision 3).

**(e) Staff audit actions** (X0, `packages/configurator-domain/src/staff/staff-audit-action.ts`). These are new
closed-list entries.

**Ruling X0-2 (2026-10-26):** X0 ships them as a separate `DASHBOARD_AUDIT_ACTIONS` list, so today no store records
them. **Wave X2 folds them in**: `STAFF_AUDIT_ACTIONS` becomes the Lot 3 six plus `DASHBOARD_AUDIT_ACTIONS`, and the
sub-list stays exported so X0's types keep compiling. X2 must merge before any wave that writes one of these rows (S2,
S3, S4, R2, K2; S2b is folded into S2, 2026-10-27). `price-catalogue-viewed` needs no new port: R2 records it through the existing `StaffAuditStore`
read-audit path (the `kitchens-listed` / `audit-viewed` path), once X2 has landed. **Amended 2026-10-26 (F4):** each has a **closed detail key list**, and a key outside it is
refused.

- **Allowed:** kinds and codes from closed lists, server-minted ids, and counts.
- **Never:** created-row text, version label or note, search text, or any customer value.

```
price-draft-changed        { changeKind, itemKind?, itemId?, field?, widthMm? } // changeKind ∈ §8.4(b) kinds; no value, no text
price-draft-reverted       { changeKind, itemKind?, itemId?, field?, widthMm?, revertedCount }
                           // m7: a group revert is changeKind "bulk-group" with revertedCount = n and no item keys; a single
                           // revert has revertedCount 1. itemKind ∈ cabinet|hardware|material|accessory|finish|handle.
                           // itemId = the ruleId for cabinet / cabinet-size (a book rule id), tierId, accessoryId, finishId or
                           // handle code otherwise; widthMm only for cabinet-size. itemKind and itemId are both present or
                           // both absent (depth-rule, provisional, bulk-group carry neither)
price-bulk-changed         { scope: all|group|selection, groupCode? (iff scope = group), percent, ruleCount, amountCount }
                           // groupCode ∈ base|wall|tall|corner, the closed list of D2's four groups (derived in M2 from the
                           // catalogue band and structural-ness), NOT id-shaped; no selected ids, counts only (X0-5)
price-published            { sequenceNumber, changeCount, provisional }   // no label, no note
price-restored-to-draft    { fromSequenceNumber, changeCount }
catalogue-item-active-changed { itemKind, itemId, active, availabilityRevision }
kitchen-defaults-saved     { changedFields: [material|hardware|depth|finish|handle|topRowHandle] }
kitchen-seen               { }                                             // the design id is the row's own column
price-catalogue-viewed     { section: catalogue|hardware|materials|accessories|defaults|publish|history|version }
```

The `action` column is a shape check [src: `0020` header], so no migration is owed.

---

## 9. Shared files

### 9.1 One owner per file, and when ownership moves

**Two agents never hold the same file in the same window.** Ownership moves only at a named merge.

| File | Owner, and the window | Everyone else |
| --- | --- | --- |
| `packages/configurator-domain/src/index.ts` (root barrel) | X0 writes the sub-barrel lines: `price-dashboard/index.js`, `staff-changes/index.js`, `kitchen-handle/index.js`. After MP-0: lane **P** only | M, K and H export through their own sub-barrel and never touch the root |
| `packages/configurator-domain/src/staff/staff-audit-action.ts` | X0, then **X2** (the fold-in), then frozen, **except K2b's one key** (`onlyChanged` on `kitchens-listed`, 2026-10-27; QA moves the kitchens-listed-audit pin) **and R2's one `changeKind` value** (`discard-all` on `price-draft-reverted`, 2026-10-27) | Ask the architect for a follow-up contract wave |
| `packages/configurator-domain/src/staff/staff-kitchen-query.ts` | **S4**, for the `onlyChanged` field and its judge only (2026-10-27) | — |
| `apps/web/src/staff/staff-kitchens-wire-contract.ts` | X0, then **K2b** for the standalone `StaffKitchenEstimatesWire` (2026-10-27). The frozen shapes are untouched | — |
| `packages/configurator-domain/src/pricing/catalogue-availability.ts` | **X0** writes it (types only: `ItemRef`, `CatalogueAvailability`), then lane **P** from MP-0 (P4a extends it) | `price-dashboard/**` imports from it; pricing never imports `price-dashboard/**` |
| `apps/web/src/i18n/content.ts`, `messages/ro.json`, `ru.json`, `ro.d.json.ts` (the nine audit-action labels only) | **X2**, in a window after T1 merges and before T2. Then back to lane **T** | — |
| `apps/web/src/staff/staff-audit-wire-reading.ts`, `staff/staff-audit-filters.tsx` | **X2** (Lot 3 files with no other M10 owner) | — |
| `packages/configurator-domain/src/account/capabilities.ts` | Nobody; no change is needed | — |
| `packages/configurator-domain/src/design.ts` | Lane **H** | P reads only |
| `packages/configurator-domain/src/catalog.ts` | Lane **P** (P1: the default-width field; P5: the `liftUp` front declaration and the rewritten `wall-lift` comment) | — |
| `packages/configurator-domain/src/hardware-mechanisms.ts` | **H1b** first (one line: the push-to-open query passes the kitchen handle), then lane **P** for P5. P5 starts only after H1b merges | — |
| `packages/configurator-domain/src/pricing/parse-price-book.ts` | **Ruling 2026-10-27: M1** edits it (lane P's file) to refuse negative and non-whole hardware, accessory and material-tier amounts. **P4b and P5 edit it next and merge on top of M1** | — |
| `packages/configurator-domain/src/front-population.ts` | Lane **P**, P5 only (A-20) | — |
| `packages/configurator-domain/src/queries/design-projection.ts` (`DisplayEntry` gains an optional kitchen-handle fact) | **H1b** | Every lane reads it only |
| `packages/configurator-domain/src/push-to-open.ts`, `queries/describe-selection.ts` | **H1**, which makes `PushToOpenQuery`, `DescribeSelectionInput` and `HandleResolutionQuery` take a **required** `KitchenHandleSettings` object (`Pick<DesignSettings, "handle">`). H1b and H2 touch these files **only to widen that object** (H2 adds `topRowHandle`), never to change its shape otherwise (ruled 2026-10-26, H1 review) | — |
| `packages/configurator-domain/src/commands/set-appearance.ts`; the panel's handle control | **Q2b**, only if the owner accepts (or does not answer) OQ-15 | — |
| `apps/web/src/review/review-model.ts`, `review/review-screen.tsx` | **H1b** (the resolved handle on the review screen), then **Q1b** (the depth line, 2026-10-27), in sequence; Q1b starts from a base that holds H1b's change | — |
| `apps/web/src/lib/server/mail/lead-notification.ts`, `lead-notification-html.ts` | **Q1b** (the depth line in the shop's notice, 2026-10-27) | K4 reads them as a pattern only |
| `apps/web/src/lib/server/staff/staff-page.ts` | **U1** (the catalog pages' capability and navigation), then **U5** (the pending-price count in the nav, 2026-10-27), in sequence | R does not touch it |
| `apps/web/src/staff/staff-audit-rows.tsx` | **U5** (2026-10-27; a Lot 3 file with no other M10 owner, for the dashboard actions' rows) | — |
| Lane T's message files, U5's new leaves | **U5**, under the new-copy permission, for its own new leaves only, in a window when no T wave is open (recorded 2026-10-27). T re-runs the copy-lock and completeness gates in its next wave | — |
| `packages/three-adapter/**` | **H1b** only. No other M10 wave touches the adapter | — |
| `apps/web/src/panel/use-panel-view.ts` | **H1b** | — |
| `packages/configurator-domain/src/commands/command-result.ts` (the `CommandEffect` union) and `apps/web/src/store/apply-command-result.ts` | **Q2**, in one change (H-6) | H1 keeps `KitchenHandleSetEffect` outside the union until Q2 |
| `packages/configurator-domain/src/commands/rejection.ts` | **H1** (one code, H-4) | — |
| `apps/web/src/price-dashboard/item-dialogs.tsx` | **U4a**, then U4b, then U4c, in sequence (never two at once) | — |
| `packages/persistence/**` (including `index.ts`, migrations, `application-role-privileges.test.ts`, `live-suite-census.test.ts`) | Lane **S**, all of it, for all of M10 | Others consume through ports and fakes |
| `apps/web/src/messages/ro.json`, `ru.json`, `ro.d.json.ts`, `i18n/content.ts`, copy-lock tests | Lane **T**, always. `ro.d.json.ts` is generated by next-intl and carries every leaf's **literal value** [src: `ro.d.json.ts:1-2, 328`], so no other lane may change a leaf's text. **The `depthNote` route:** T1 adds a **new** leaf, `globalSettings.depthNotePriced` (ICU `{percent}`). Q1 switches the component to it, which is a component edit and no message-file edit. T2 deletes the old leaf after MP-3 | Missing keys are reported to the coordinator, and T runs a follow-up wave |
| `apps/web/src/proxy.ts`, `staff/staff-shell.tsx`, `staff/staff-nav-sheet.tsx`, `staff/staff-paths.ts` | Lane **U**. **Exception:** K4 holds `staff-shell.tsx` and `staff-nav-sheet.tsx` for the nav counter, after U1 has merged and while no U wave holds them | — |
| `apps/web/src/price/price-book-root.ts`, `lib/server/shipped-price-book.ts`, `price/use-priced-design.ts` | **R1** | — |
| `apps/web/src/price/whole-kitchen-tiers.ts`, `starting-price.ts`, `price-breakdown-model.ts` (exactly P3's web files) | **P3** from its dispatch to MP-3. Then lane **Q** | Q1, built on P3's branch, may edit `price-breakdown-model.ts` only for the depth line. Q1 and P3 are one window, with Q1's edits after P3's QA is green |
| `price-breakdown.tsx`, `settings/global-settings.tsx` | **Q1** until MP-3. Then lane **Q** (Q2 onward) | — |
| `settings/global-settings-model.ts`, `store/whole-kitchen-apply.ts` | Lane **Q**, from Q2 (after MP-3) | — |
| `vercel.json` | **K4** | — |
| `apps/web/src/price-dashboard/price-dashboard-wire-contract.ts`, the price-notice section only | **R5a** (2026-11-08, *R5 split*: `isSent`, the two-arm union, `RemovedAccessoryWire`) | Q3 and Q4 read it only |
| `apps/web/src/lib/server/repository.ts` (a pre-M10 file with no M10 owner) | **R5b**, for one getter, `getEditableDesignRepository()` (2026-11-08, *R5 split*) | — |
| `docs/**`, including the runbook | The **scribe**, in the main tree, after each wave's commit. Implementers put runbook text in their report, and the scribe pastes it | No implementer edits `docs/` |
| `docs/design/mockups/cabinets/*.svg`, copied to `apps/web/public/…` | **U1** copies; the source is never edited | — |
| QA-owned pins (`qa-*.adversarial.test.ts`, `pricing-seams.test.ts`, `qa-m6-wave-b-book-ingress`, `qa-8c-model-purity`) | A wave that moves a pinned fact reports it, and **QA** edits the pin | Implementers never edit a QA pin |

### 9.2 Migration sequence, owned by lane S

| Number | File | Wave | Grant (exact text written in the wave, pasted into the runbook by the scribe) |
| --- | --- | --- | --- |
| — | **Renumbered 2026-10-27 (coordinator ruling A).** M10 takes the next free numbers, contiguous from `0023`, in the order its waves land: S2 → `0023`–`0025`, S4 → `0026`–`0027`, S5 → `0028`, S3 → `0029`. M8B Lot 3's provisional preset-sort and invitation migrations take the next free numbers after M10's. `assertVersionsAreContiguous` (`migration-files.ts:73`) is unchanged. **No live database run happens until these numbers are committed**, because migrations are add-only on the shared test database's ledger | — | — |
| 0023 | `create_price_book_versions`: id (server-minted, shaped), `sequence_number bigint not null unique check (> 0)`, label (length-checked; 1–80 [inf: `MAX_BOOK_NAME_LENGTH`]), note (≤ 240 [inf: `MAX_BOOK_DESCRIPTION_LENGTH`]), book jsonb object, change_summary jsonb, **`change_count integer not null check (change_count >= 0)`, no default (added 2026-11-04, ADR 0178's last Amendment)**, `published_at default now()`, published_by_account_id. **No `state` column**; the active version is the newest row (F7) | S2 | `SELECT`; `INSERT (id, sequence_number, label, note, book, change_summary, change_count, published_by_account_id)`. **No `UPDATE`** (F7) |
| 0024 | `create_price_book_draft`: a **seeded singleton** (0009's pattern): revision bigint, changes jsonb array (seeded `[]`), base_version_id, `updated_at default now()`, updated_by_account_id | S2 | `SELECT`; `UPDATE (revision, changes, base_version_id, updated_at, updated_by_account_id)`. **No `INSERT`** (F7) |
| 0025 | **Two tables, one file** (A-17, F1): `catalogue_availability_head`, a seeded singleton (`revision bigint not null check (>= 0)`, seeded 0), and `catalogue_availability_changes` (`revision bigint primary key`, item_kind, item_id, active boolean, `changed_at default now()`, changed_by_account_id). **No sequence and no trigger.** A row's revision comes from the head update in the same CTE statement (§5 A-17) | S2 (S2b folded in, ruling B) | head: `SELECT, UPDATE (revision)`. log: `SELECT, INSERT (revision, item_kind, item_id, active, changed_by_account_id)`. No `DELETE`, no log `UPDATE` |
| 0026 | `create_design_staff_seen`: design_id pk, seen_revision bigint, seen_by_account_id, `seen_at default now()` | S4 | `SELECT`; `INSERT (design_id, seen_revision, seen_by_account_id)`; `UPDATE (seen_revision, seen_by_account_id, seen_at)`. No PK update. **Also, as 0026's step (corrected 2026-10-27; it was written "with 0029"), on the existing table (F2):** `GRANT SELECT (priced) ON TABLE public.contact_submissions TO app_designs;`. This is a **runbook grant, not SQL in the migration file**: grants are never in a migration file, because the unattended screen does not recognise them [src: `0009_create_csp_reports.sql:32-34`]. **The first reader is S4's staff kitchen statement for the as-sent estimate, consumed by K2b** |
| 0027 | `create_staff_change_digest`, **two tables**: rounds (day_key pk, shape-checked; `claimed_at default now()`; sent_count int) and entries (round day_key, design_id, revision; pk (round, design)) | S4 | rounds: `SELECT; INSERT (day_key); UPDATE (sent_count)`. entries: `SELECT; INSERT (day_key, design_id, revision)` (F7) |
| — | **Pinned 2026-10-26 (doc conflict with ADR 0178):** `rounds.day_key` is the primary key **and the round id**; there is no separate `round_id`. `entries` is `(day_key references rounds (day_key), design_id, revision)` with primary key `(day_key, design_id)`. `rounds.claimed_at default now()` (ADR 0178's `ran_at` is renamed `claimed_at`). `ClaimDigestDayResult.roundId` carries the day key | S4 | as the 0027 row (ex-0030) |
| 0028 | `create_design_price_notices`: design_id pk, acknowledged_version_id, acknowledged_availability_revision, `acknowledged_at default now()` | S5 | `SELECT`; `INSERT (design_id, acknowledged_version_id, acknowledged_availability_revision)`; `UPDATE (acknowledged_version_id, acknowledged_availability_revision, acknowledged_at)`. No PK update |
| 0029 | `create_kitchen_defaults`: a **seeded singleton**: revision, defaults jsonb (seeded `{}` = none saved), `saved_at default now()`, saved_by_account_id | S3 | `SELECT`; `UPDATE (revision, defaults, saved_at, saved_by_account_id)`. **No `INSERT`** (F7) |

**Rules across every M10 table (F7, 2026-10-26):**

- column-level grants exactly as listed;
- every `*_at` defaults to `now()` and is outside every `INSERT` grant;
- no primary-key column is in an `UPDATE` grant;
- no `DELETE` and no `TRUNCATE` anywhere;
- nothing to `PUBLIC`.

The append-only tables are `0023` and `0025`'s log (renumbered 2026-10-27).

**Renumbered 2026-10-26.** The plan's earlier numbers were never used. The availability log took `0028`, and the three
tables after it each moved up one. Nothing was built under the old numbers.

---

## 10. Waves

Every row carries its review tier and its *Reading*. "Prod files" counts production files only; paired tests do not
count (WORKFLOW). A row over five files says so and gets a mini-review.

### U1 departures from the frames, recorded 2026-10-27 from U1's visual pass (coordinator, relayed; the scribe saw no screen)

Each is a departure from a frame, deferred, with the wave that owns it. Nothing here is built.

| # | Departure | Disposition | Owner |
| --- | --- | --- | --- |
| 16 | Mobile header (D2M) is not sticky and lacks the page title under "LEMNARIA" | Fix, or record as an accepted departure if the Lot 3 shell (ADR 0173 P-L3-9) already departs this way | U2 (the next wave to touch the shell) |
| 17a | Mobile menu sheet (D1M): no "Meniu" title; shows the account e-mail, "Rol:", Profil, "Ieși de pe toate dispozitivele" and "Închide" | **Accepted** (Lot 3 shell, P-L3-9 departures) | — |
| 17b | "Jurnal de audit" renders under the CATALOG heading on mobile (ungrouped on desktop); the frame has it under ADMINISTRARE (not built) | **Ruling (coordinator): audit must not appear under Catalog.** Fix with an "Administrare" group or ungrouped, consistently on both viewports | U2 |
| 18 | Mobile cards (D2M): line order "200–800 mm implicit 600" against the frame's "implicit 600 · 200–800 mm"; no trailing chevron | Fix; the cards become links to D3 there | U2 |
| 19a | Desktop (D2A/B): no pencil or chevron beside prices, and no price-rules card | Fix with editing | U2 / U3 |
| 19b | Language switcher is a plain "RO Română" link against the frame's "RO ▾" | **Accepted** Lot 3 shell departure | — |
| 20 | The "propus" chip sits on its own line under the width (frame: inline) | Fix | U2 |
| 21 | RU cabinet names stay Romanian on the RU list | **Not a departure.** Frame D2R states it itself: "Denumirile dulapurilor rămân în română până la traducerea oficială (RU TBD)" [mock L855]. Russian names wait for the translation feature (ADR 0174 O-L3-3), not M10 | — |

### X0 — Contracts (serial; after W0; Full)

**Items:**

1. Book field address and draft change types (§8.4 b), including, since 2026-10-26: creation, created-row text,
   deletion, the lift rate; `ItemRef` and `CatalogueAvailability` (§8.4 a).
2. Persistence ports and special-case objects (§8.4 c), including `CatalogueAvailabilityStore` and the
   (version, availability revision) notice pair.
3. The wire contract (§8.4 d).
4. Audit actions and their detail shapes (§8.4 e).
5. Sub-barrels and the root barrel lines.

**Prod files:**

- `price-dashboard/book-field-address.ts`;
- `price-dashboard/index.ts`, `staff-changes/index.ts`, `kitchen-handle/index.ts` (empty sub-barrels);
- the domain `index.ts`;
- `staff/staff-audit-action.ts`;
- `persistence/src/m10-ports.ts` and `persistence/src/index.ts`;
- `apps/web/src/price-dashboard/price-dashboard-wire-contract.ts`;
- `apps/web/src/staff/staff-kitchens-wire-contract.ts`.

That is about nine. **This exceeds five, stated here.** Every file is types or lists, and the round adds a logic
mini-review of contract against rulings.

**AC:**

- `pnpm check` is green.
- No production behaviour changes: the existing suites pass unchanged.
- Every audit detail shape refuses a key outside its list.
- Every port answer that could be "absent" is a named special-case object, and no port signature includes `null`.
- The field-address union covers every editable field D2–D7 draws. That is checked by a table test listing the
  mockup's fields, frame by frame. **Except:** activation is deliberately absent (A-17), and RU text fields are absent
  (A-21). Each absence is listed in the test with its ruling.
- No contract type carries an `active` flag inside the book or a Russian authored-text field.
- **The coverage test cites the ruling** (X0 review m11): link editing after creation is "out of scope, ruled
  2026-10-26 (X0-4)", not "unruled (reported)".
- **No address carries a payload** (X0-4). `ItemRef` and `CatalogueAvailability` are declared in
  `pricing/catalogue-availability.ts`, and no file under `pricing/` imports `price-dashboard/**` (X0-3).
- **The seams pin (X0-1, ruled 2026-10-26).** `pricing-seams.test.ts`'s "keeps every minor-unit amount in the sample
  book file" uses `/Minor\b/` as its proxy. It trips on field **names** such as `anchorMinor` in
  `price-dashboard/book-field-address.ts`, which are not amounts. **QA, not the implementer, re-quantifies the pin**
  (ADR 0091 decision 1's Q3):
  - allow-list the **directory** `price-dashboard/`, not one file, because M1–M4 add files there that name the same
    fields;
  - add the positive replacement over that directory: no `…Minor` field is assigned a numeric literal
    (`/Minor\??\s*[:=]\s*-?\d/`);
  - sabotage it: a planted `anchorMinor: 145000` must go red;
  - **(X0 review, QA pin gap)** QA adds a second pattern for an amount literal held in a `DraftChange` value next to
    a `…Minor` field address (`{address: {field: "anchorMinor"}, value: 145000}`), with its own planted sabotage;
  - heads-up for P4a: extending `pricing/catalogue-availability.ts` will trip the finish-never-prices pin and
    `coverage.test.ts:657`. **QA re-scopes both at P4a**; the implementer does not edit them.

**Reading:** this plan §5, §8.4 and §9; ADR 0173 P-L3-3; `staff/staff-audit-action.ts`; `persistence/src/staff-kitchen-actions-store.ts` (the port pattern); `apps/web/src/staff/staff-kitchens-wire-contract.ts`; mockup frames D2–D10 notes [mock L829-883].
**QA reading:** the same, plus `persistence/tests/fake-staff-kitchen-actions-store.test.ts`.
**Review reading (logic):** §4, §5 (including A-17 to A-21) and §8.4; §6.1's rulings; ADR 0062 Amendments 2–5; ADR 0175. **(clean-code):** `docs/best-practices/engineering-conventions.md`.

### X1 — withdrawn 2026-10-26

Its items are part of X0, because every question it waited on has been answered. The text below is kept so that a
reader who meets "X1" elsewhere knows why it is gone.

<details><summary>The withdrawn X1 text (2026-10-25)</summary>


**Items:**

1. The `active` arm and `ItemRef` in `book-field-address.ts` (OQ-2).
2. `hardware-tier-created` and the authored-text shape (OQ-3).
3. `perLiftMinor` (OQ-5; dropped if the answer is no).
4. The matching wire-contract entries.
5. The book-shape text in §8.4(a), amended by the architect first.

**Prod files:** `price-dashboard/book-field-address.ts`, `apps/web/src/price-dashboard/price-dashboard-wire-contract.ts`.

**Window.** X1 holds those two files. By construction no lane holds them: M writes new files beside them, and U reads
the wire contract.

**AC:**

- as X0's;
- an answer the owner did not give is not encoded. Each arm cites the dated amendment that recorded its answer.

**Reading:** the owner's dated answers in ADR 0177/0178; §8.4. **QA reading:** the same, plus X0's tests. **Review
reading (logic):** OQ-2, OQ-3, OQ-5 and their answers.

</details>

### X2 — Fold the dashboard audit actions into the staff audit list (added 2026-10-26; Full)

**Items:**

1. `STAFF_AUDIT_ACTIONS` = the Lot 3 six + `DASHBOARD_AUDIT_ACTIONS`, with `readStaffAuditEntry` accepting each
   under its closed detail key list (§8.4(e)).
2. The nine Romanian labels, with Russian drafts, and the `Record<StaffAuditAction, string>` in
   `i18n/content.ts:1499`.
3. The audit page's action filter and its wire reading accept the nine.
4. QA is told which pins move: `staff-audit-action.test.ts:31` ("exactly six"), the qa-l3-s1 pins and the
   kitchens-listed-audit pins. **QA edits them**, not the implementer.

**Prod files:** `staff/staff-audit-action.ts`; `i18n/content.ts`; `messages/ro.json`, `ru.json`, `ro.d.json.ts`;
`staff/staff-audit-wire-reading.ts`; `staff/staff-audit-filters.tsx`. **Seven, over five, stated.** Four of them are
copy and a generated declaration. Expected persistence files: none, because the store asks `readStaffAuditEntry`. If a
persistence file names the six, X2 stops and reports it to lane S.

**Depends on:** MP-0, and T1 merged (X2 takes the message files for its window). Merges before S2 (with S2b folded in), S3, S4, R2
and K2.

**AC:**

- each of the nine actions round-trips through the fake and the live `StaffAuditStore`;
- a detail key outside an action's list is refused for each;
- the audit page filter offers and filters by each;
- the Lot 3 six behave byte-identically, as the existing suites show unchanged except for the pins QA moves.

**Reading:** §8.4(e); ADR 0173 P-L3-3 and the L3-S8 rows; `staff/staff-audit-action.ts`;
`persistence/src/staff-audit-store.ts:242-380`; `apps/web/src/staff/staff-audit-*.ts(x)`; `i18n/content.ts:1490-1510`.
**QA reading:** the same, plus the pins named. **Review reading (logic):** §8.4(e) and A-22; **(clean-code):** the
diff.

### Lane P — Pricing engine (Full for every wave)

**Base reading for every P wave:** ADR 0062 seam 1; ADR 0068; ADR 0070; ADR 0092 decisions 1, 2, 8, 12 and the
Amendment; ADR 0100 and its Amendment; ADR 0175; ADR 0177 (W0); `docs/design/DEVELOPMENT-SPEC.md` §12 (price is
derived from placements and never stored) and §7 (catalogue); this plan §5 and §8.4(a);
`pricing/price-book.ts`, `parse-price-book.ts`, `price-design.ts`, `price-lines.ts`, `sample-price-book.ts`.

| Wave | Must-fix items (≤ 5) | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **P1** anchored shapes, beside the old ones | (1) the four `anchored-*` shapes and `price-per-size`, with arms in `amountForBody`; (2) round-up of width and height (A-2, A-4), and `NO_PRICE_FOR_SIZE` (A-7); (3) the signed door term at actual width (A-3, behind one named function); (4) parser arms with bounds; (5) the catalogue `defaultWidthMm` field plus a parity test against the generator's constants (backlog 276) | `price-book.ts`, new `pricing/anchored-price-formula.ts`, `parse-price-book.ts`, `price-lines.ts` (code), `catalog.ts` | MP-0 (OQ-6 ruled: actual width) | `cabinet-handles.ts` (`widthDerivedDoorLeafCount`); `generation/generation-priorities.ts`, `leftover-rule.ts`, `optional-run-items.ts`, `u-tall-layout.ts` (default widths); backlog 276; ADR 0035 d8; ADR 0049 |
| **P2** percentages and the rounding seam, beside the old ones | (1) `percentOfCabinets` on material tiers and `depthRule` (types and parse); (2) the deepening property (A-6) and its parity sweep; (3) the A-1 decomposition: material and depth lines and every line `r10` (integer arithmetic); (4) re-derive `MAX_PRICE_COEFFICIENT_MINOR` (A-5); (5) a book carrying both old and new material fields is refused | `price-book.ts`, new `pricing/percentage-lines.ts`, `price-design.ts`, `parse-price-book.ts`, `price-lines.ts` | P1 merged | `cabinet-depth-rule.ts`; `worktop-depth.ts`; `buildKitchenLBodyCatalog`; ADR 0101; ADR 0087; ADR 0098 |
| **P3** cut-over (the hard serialisation point) | (1) the sample book converted to anchored, percentage and depth form (placeholders, still `amountsProvisional: true`); (2) the old linear shapes and `wholeKitchenMinor` removed; (3) every consumer updated: `whole-kitchen-tiers.ts`, `starting-price.ts`, the breakdown model's material line and new depth line, and the i18n tests naming `wholeKitchenMinor` (tests only: no message-file edit); (4) the head comment P1 already rewrote (S-6) is re-checked so it no longer names the retired linear shapes; (5) QA is told which pins move (`pricing-seams.test.ts`, `qa-6b2-tier-amounts`, `qa-m6-wave-b-*`, `submission-snapshot.test.ts`; **added 2026-10-26:** `packages/configurator-domain/tests/contact/qa-8h-submission-snapshot.adversarial.test.ts:524,532`, `tests/pricing/qa-6b-pricing.adversarial.test.ts:428` and `tests/pricing/price-design.test.ts:223`, which assert `amountMinor === quantity × unitAmountMinor` on every line. That does not hold for an accessory in a percentage book (A-1: `r10` of the exact amount, and the unit stays the rate), so the pin is scoped "every line except an accessory in a percentage book". P3 also rewrites the qa-8c depth-line assertion deliberately (it now fails loudly if a depth line appears) when it prints the breakdown's depth row) | `sample-price-book.ts`, `price-book.ts`, `apps/web/src/price/whole-kitchen-tiers.ts`, `starting-price.ts`, `price-breakdown-model.ts`. **About five, plus test fixtures; a mini-review is added because it crosses packages** | P2, R1 merged (so the root is already single) | ADR 0106 and Amendment A; `apps/web/tests/i18n/price-book-text.test.ts`; ADR 0154 d8 (stored snapshots are not touched); `apps/web/src/price/price-breakdown.tsx` |
| **P4a** availability and replacement (amended 2026-10-26, A-17) | (1) `CatalogueAvailability` and `ItemRef` types, and `priceDesign`'s new `availability` input (no flag in the book); (2) `REPLACEMENT_REQUIRED` when a selection names a disabled material, hardware class, colour or handle, never `UNKNOWN_TIER`; (3) `replacementsRequired(design, book, availability, catalog)` → item refs plus remaining options; (4) a disabled accessory (built-in or linked) produces no line, and `removedAccessoriesSince(design, seenAvailability, currentAvailability)` supports the C4 info row | `price-design.ts`, `pricing/catalogue-availability.ts` (created types-only by X0; P4a adds its functions), new `pricing/replacements.ts`, `price-lines.ts` (code) | P3 merged | ADR 0062 Amendment 3 and the 2026-10-26 Amendment (W0); A-16, A-17; ADR 0072 Amendment; ADR 0057; ADR 0081; ADR 0086; ADR 0099; `materials.ts`; `queries/sink-accessories.ts` |
| **P4b** linked accessories, created-row text, the price-change test (added 2026-10-26) | (1) `linkedAccessories` with the per-linked-placement earning shape (A-19), priced via `resolveCatalogEquivalent` like cabinet rules; (2) parser arms: unique ids across built-ins and linked rows, bounded list, `perUnitMinor` exact, a customer-supplied link refused when the book says so; (3) authored Romanian `name`/`description` on created rows only, with no Russian field accepted (A-21); (4) `pricesChangedBetween(design, catalog, {seenBook, seenAvailability}, {activeBook, currentAvailability})` (A-11) | `price-book.ts`, `parse-price-book.ts`, `price-design.ts`, new `pricing/linked-accessories.ts`, new `pricing/price-change-notice.ts` | P4a | A-11, A-19, A-21; ADR 0070 d4; ADR 0062 seam 1 and S-28; ADR 0106 and Amendment A; `price-book.ts:205-243`; `price-design.ts:613-708` |
| **P5** lift mechanism and lift-door hinges (no longer conditional; ruled 2026-10-26) | (1) `HardwareTier.perLiftMinor` and its parser arm; (2) `HardwareMechanismCounts.lifts`, one per declared lift-up door; (3) the lift door's hinges: 2, or 3 when the door is **wider than 500 mm** (OQ-5a default, strict); its height rule does not apply; (4) the `liftUp` front declaration on `wall-lift` in `catalog.ts`, plus a sweep reporting every other front the catalogue calls a lift or flap (reported, not priced); (5) the ADR 0092 Amendment C quantifier gains its lift term, derived from the declared rates, and the code comments at `hardware-mechanisms.ts:27-29` and `catalog.ts:593-594` are rewritten | `hardware-mechanisms.ts`, `front-population.ts`, `catalog.ts`, `price-book.ts`, `price-design.ts`, `parse-price-book.ts`. **Six; over five, stated.** The arithmetic is two existing functions extended, and a mini-review is added | P4b (same files), **H1b** (it holds `hardware-mechanisms.ts` first). **OQ-5a flags the boundary, without blocking** | ADR 0070 d1, d6; ADR 0092 d1, d2, d8 and Amendment C; A-20; S-29, S-30; `hardware-mechanisms.ts:27-160`; `front-population.ts:60-130`; frames D4A/B [mock L688-695]; the mockup's `hwOf` [mock L511] (illustrative only) |
| **P6** the owner's 2026-11-03 hardware answers (added 2026-11-03) | (1) OQ-17: a lift door's third hinge reads the **door's** width, not the body's per-leaf width; the door's width is a declared domain fact held to the adapter's built leaf by a parity test, never a literal 6 typed in the rule; boundary tests at the 500 mm door (2 hinges) and the first width above it (3); (2) OQ-18: `countPushToOpen` counts **door leaves** (lift doors included), not `openingFrontCount`: a drawer on a push-to-open body takes no latch; (2b) OQ-28: `HardwareTier.perPushRunnerMinor` and its parser arm, a push-runner count, and a drawer on a push-to-open body billed at that rate instead of the drawer rate; drafted non-zero placeholders in the sample book; the dashboard's rate list gains its words (labels only, no layout work); (3) every comment and test that says "per opening front" is rewritten; seeded totals that move are re-derived, never retyped; (4) the scribe amends ADR 0092 decision 3 and ADR 0177 A-20 with dated amendments quoting OQ-17 and OQ-18 | `hardware-mechanisms.ts`, `front-population.ts`, and the parity test's home | P5 | §6.3 OQ-17, OQ-18; ADR 0092 d3 and Amendment C; A-20; `hardware-mechanisms.ts:85-185`; `front-population.ts:370-395` |
| **P6b** the hardware screens after P6 (added 2026-11-03) | (1) the push-runner rate as a column on the hardware list and a field on its page (D4A/B), at the layout U4a set; (2) OQ-21: a created class's Romanian name editable in the draft (A-18) on P4b's `created-row-text` change; built-in rows stay read-only (A-21); its route arrives with R4a, so production keeps the field off with `cannotJudge` and the wire test is deferred like U4a's; (3) from U4b's review: the hardware list moves onto `ItemRowMenu` (it closes on the click, not the press; the press closed it under a lifting finger on materials) and `use-close-on-outside-press.ts` goes if unused; the rules both screens share move to one stylesheet; `segmentOf` (three copies) to one module; the sample-gated page read shared by materials, hardware and defaults. P6 already draws the fifth column from the rate list, so item 1 is layout, and P6 and P6b merge together | `hardware-list.tsx`, `hardware-edit.tsx`, their stylesheet and words, the paths modules | P6, U4a, U4b | §6.3 OQ-21, OQ-28; A-18, A-21; the U4a record |

**Rulings of 2026-10-27 on P3's questions** (branch `m10/p3` @ `edb3b157`):

- **P3-Q1, the depth line on customer surfaces without an owner:** the review model and screen
  (`review-model.ts`, `review-screen.tsx`) and the shop's lead notice (`lead-notification.ts`,
  `lead-notification-html.ts`) copy only `groups` and `wholeKitchenRows`. At 700 mm they would omit the depth line
  while the total includes it. → **New wave Q1b**, built on P3's branch beside Q1, **merged at MP-3 with P3 and Q1**
  (row in lane Q). The notice prints the stored snapshot (ADR 0154 d8), whose lines already carry the `depth` kind; it
  only has to render it.
- **P3-Q2:** publish refuses a book with an unevaluable row (A-7b, amended).
- **P3-Q3, not accepted as stated:** a stray flat amount silently dropped is a data hole. The replacement refusal must
  not name the retired field, so it would not break P3-b's grep. **P3 makes material and hardware tier rows
  closed-key in the parser**: any key outside the declared list is refused with a code naming the row. That covers a
  stray `wholeKitchenMinor` without naming it. This is done in P3's own fix round, and the same applies to accessory
  and linked-accessory rows.
- **P3-Q4:** the corner keys are the round-up of the built width (A-7 and M2-b3, amended).
- **P3-Q5, confirmed:** `SAMPLE_PRICE_BOOK_VERSION` is bumped to a new id (`sample-2026-10`), so one id always names one
  set of figures. Stored versions are unaffected: their `book.version` is the store's minted `versionId` (R-a).
- **P3-Q6, accepted and recorded:**
  - `evaluateFormula` now converts only its named causes to refusals, and anything else (a stray `TypeError`)
    propagates, as ADR 0092 d16's front-population precedent requires;
  - front-population refusals name the **build id**, which is the existing shape `refuseUnreadableFrontsCause` already
    uses [src: `price-design.ts:562-575`].
- **P3-Q7:** the `content.ts` accessors for `priceBreakdown.depthLine`, `priceBreakdown.depthLineScope` and
  `globalSettings.depthNotePriced` are **lane T's, added in T3**, which already rewrites those leaves. T3 merges before
  MP-3, and Q1 and Q1b consume them. Neither Q wave edits `content.ts`.

**2026-10-28 — MP-3 merged** (`83cd7c6b`, one `--no-ff` merge of the combined branch `m10/mp3` @ `b2eb4e43`, pushed)
[coordinator, source-verified from git and the gate logs]:

- P3, Q1 and Q1b arrived together. Q1-a holds on the first-parent reading (MP-3 logic review).
- Coordinator rulings made on the way, recorded here:
  - `DepthPriceLine` carries `deepCabinetPercent` (P3 `40a72c06`). Every surface words the depth row from the line,
    never the live book; the settings note reads the book through `useRequiredDeepCabinetPercent`.
  - One wording function (`describeDepthLine`) and one placement rule (`listWholeKitchenRows`: directly after the
    material row, a missing anchor throws) serve the breakdown, the review and the lead notice. Hardware stays before
    material (pre-M10 order), so Q1b's "between material and hardware" reads as "directly after material".
  - The copy is T3's accessors ("Adâncime 700 mm · adaos {percent} %" plus the scope line), not the brief's "+15 %".
  - A malformed stored depth line (depth not a positive integer, percent outside 0..100, an unsafe id, more than one
    depth line) refuses the notice through `MalformedDepthLineError` → `NoticeKitchenError("review-not-sendable")`.
    Unreachable from data the domain writes (logic and security reviews); defence in depth.
  - "The lines sum to the total" means priced amounts (A-1). Printed rows round up to the thousand lei, so they need
    not add to the printed total: ~~**owner question**~~ **answered 2026-10-28**, see the rounding block below and
    ADR 0001's 2026-10-28 amendment (pinned as an `it.fails` in `qa-q1-depth-line.adversarial.test.ts`).
  - **Owner copy question:** at 0 % the depth line reads "adaos 0 %" beside *inclus* while the note says "nu schimbă
    prețul"; `depthLine` has no `=0` branch. **Re-asked 2026-10-28** with options: show as is / hide / own wording
    "fără cost suplimentar". Current behaviour (a, show as is) is kept until answered.
- Gates on `83cd7c6b` (`pnpm ci:local`): every gate passed except `test` (only the known `qa-8q2-sink-store` load
  flake, 37/37 alone) and `e2e` (1 127 passed, 1 failed: `cabinet-depth.e2e.spec.ts` still asserted the pre-P3
  "the total does not move with depth"; rewritten at `980df5ed`, the spec passes 4/4 alone). The full e2e suite was
  not rerun after the rewrite.
- Deferred clean-code items: split `price-breakdown-model.ts` (depth-line material into its own module); the
  `wholeKitchenRows` / `wholeKitchenListing` naming.
- Hand-offs: **T2** retires `globalSettings.depthNote` (no renderer left) and the stale `aud-006` test; **Q3** covers
  `useRequiredDeepCabinetPercent` as a second no-book throw site.

**2026-10-28 — owner rulings: rounding and translations** [coordinator's brief, relayed; the scribe ran nothing]:

- Owner, verbatim: "we speak about 2 rounding, the price set to things in admin rounded by 10 lei, the sum of the
  entire kitchen rounded to 1000 lei". Recorded as ADR 0001's 2026-10-28 amendment (decision 4). The display-rounding
  owner question in the MP-3 block above is **answered**: lines at 10 lei, only the total at 1 000 lei, rows need not
  sum. Wave **Q1c** (Lane Q) implements it.
- Owner, on copy: "Don't block on translations, this will be covered later". **Copy and translation questions no longer
  block waves.**
- The 0 % depth-line wording question was re-asked (show as is / hide / "fără cost suplimentar"); behaviour (a) stays
  until answered.

**2026-10-28 — P4a merged (`e06caee1`) and M2 merged (`c9ff8fd3`)**; both QA green, logic and clean-code reviewed;
pushed [coordinator's brief, relayed].

- Gates, full `pnpm ci:local` on `c9ff8fd3` (coordinator's report): format, lint, typecheck, build, boundary, lockfile
  and sca passed. Domain 11 752 passed (the gate itself failed on a vitest RPC timeout under load). e2e 1 126 passed,
  2 failed (top-bar 900×500 passed alone; the staff-kitchen status-conflict test was shown load-induced: the server
  answered 200 in 301 ms, and it passed 5/5 once load fell). Persistence 5 658 passed. Web 21 310 passed, 9 failed in
  three known load-flake files (client-write-path and qa-8q2 passed alone; qa-l3-u6-screen timed out alone at load
  average 121 and passed 155/155 in earlier runs). Running two waves plus full CI overloads the machine: run full CI
  only when no QA is running.
- P4a rulings: `UNKNOWN_TIER` precedes `REPLACEMENT_REQUIRED` (**superseded 2026-11-04 for a tier the active book
  does not hold, which is now a replacement: ADR 0178, Amendment on a deletion that gains a user; Q3-g**); built-in accessory refs use book field names, created
  and linked accessories have their own ids; `replacementsRequired` lives in `queries/` (ADR 0071 d1) and takes a named
  input, as does `removedAccessoriesSince` (with `catalog`, later `book`); the contact route prices under the real
  availability and refuses a kitchen naming a switched-off item with 409 `CONTACT_DESIGN_NOT_CURRENT` (nearest existing
  cause); `describePricedBody` and `PricingRow` are exported for M2.
- P4a hand-offs: **M3** must refuse to switch off `DEFAULT_HANDLE`, `TOP_ROW_HANDLE` and a material's `defaultFinish`
  (a top-row kitchen with no stored handle falls back to push and would still be billed latches; slot-forced push
  cannot be replaced), and defines last-active-option groups per material palette for colours and one group for
  handles. **Q3:** one switched-off tier blanks every delta (`measureEveryDelta` is all-or-nothing) and a switched-off
  tier stays in `offer.material.tierIds`, both pinned `it.fails`; Q3 also covers `useRequiredDeepCabinetPercent`.
  **Q5:** with a disabled material and a disabled colour, the colour row offers the disabled material's palette;
  replacement order matters (ADR 0057 resets the colour). **Architect, open:** defaults reached without storing are not
  "named"; a stored but unworn kitchen handle or top-row handle is named; the staff view and account card show no
  figure for a refused kitchen (D10B reason display, Q3 / staff lane).
- M2 rulings: bulk scales every manufacturer cabinet amount proportionally, including extra-door and height steps;
  bound −90..300; the bulk always checks scaled prices (`judgePricesOfRule`); the corner preview shows the real built
  width (330, ADR 0135) priced under the round-up key, no "preț ca" note; customer rows must be evaluable and free;
  seeded variants are judged with their own door leaves; duplicate build ids are refused.
- Flaky browser test, not from M10's recent waves (2026-11-03): `u-gate-journeys.ts:374` "wall C: deleting a base body frees a void…" on desktop under `CI=1`. It failed the gate once at `7baa8ef3`, then 1 run of 5 alone there, and 8 of 15 alone at `849016d2`, a commit whose full gate passed. The tap lands on a placement, not the freed void (`u-gate.ts:457`). Cause not investigated; inference: the tap point is read before the scene settles after the sheet closes.
- Fixed (2026-11-04, `0a0d6f0b`): `tests/proxy-staff-catalog-pages.adversarial.test.ts`'s fast-check property failed twice with counterexample `/ro/staff/kitchens/catalog` (seeds -1452579348, 2086916062). Test fidelity, not a proxy defect: that address is a staff kitchen whose id is spelled `catalog`, which the interceptor rightly marks; the oracle knew only the catalog family. The property now leaves kitchen pages out; both seeds pass.
- Second flaky browser test (2026-11-03): `staff-kitchen.desktop.e2e.spec.ts:145` failed the gate at `bec834ba` waiting 5 s for "Status salvat" while the save was still out; 5 of 5 alone there, and no staff code changed since `849016d2`. Inference: a slow database answer. Not investigated.
- U4b record (2026-11-03), merged `b6507afa`:
  - Browser specs `materials.e2e.spec.ts`, `materials.desktop.e2e.spec.ts`: 22 passed, 2 skipped under `next dev` (the implementer's run, after the fix); not yet run under `CI=1` outside `ci:local`. The first coordinator run found one production defect: the row menu closed on the press, so the cards slid under a lifting finger and the tap opened another material; it now closes on the click, attached after the opening click's dispatch (WebKit's coarse event clock made the timestamp guard unsafe).
  - Review fixes: a switch-off is off with `cannotJudge` where nothing can write, hardware included; the deferred wire tests go red on a broken route, not only on a present one; the percent fields accept "+35" and "35 %", the depth rule included.
  - Coordinator choices (no owner question): the materials table from 1200 px (computed, not measured; about 1100 would fit); PAL with MDF and veneer off opens D5G rather than showing the fixed-default reason (the frame names PAL); a material the draft deletes keeps its switch off with the reason; D5A's "Adaugă material" is omitted (materials are declared in code; A-18 creates only classes and linked accessories); names and descriptions read-only, colour counts from code (PAL 6, veneer 2, painted MDF a picker).
  - Ten new Romanian lines under `priceDashboard.materials`, approved as drafted (OQ-11, 2026-11-03).
  - Deferred to R4a: deletion into the draft, the real switch writes and availability route, the usage reader (and batching it: today one read per counted material per view).
- P6 browser run (2026-11-03, `next dev`, port 4330, `m10/p6` @ `d4863fdb`): hardware, cabinet-detail, publish-page and kitchen-handle-row specs, 136 passed, 4 skipped, 5 failed. All five are hardware layout specs written for four rates, owed to P6b: `hardware.desktop.e2e.spec.ts:182` (no sideways scroll 900–1920, card below 1360), `:316` (new class form, four prices), `hardware.e2e.spec.ts:181` (two by two), `:357` (rate fields), `:621` (new class).
- Q2b record (2026-11-04), merged `3474ec22`:
  - `clearHandle` in `set-appearance.ts`, mirroring `clearFinish` (shared `withoutOwn`), with a `handle_cleared` effect; price, scene and panel already read `resolvedHandleOf`, so a cleared cabinet matches one that never chose, on both sides of the top-row line (QA swept every cabinet of the L and a generated U against all 16 kitchen settings).
  - The panel's "Ca restul bucătăriei" row names the handle the kitchen gives that cabinet (top-row aware) and, while the cabinet follows, is the only pressed choice (OQ-15a); the default chip is no longer pressed and the "Implicit pentru acest dulap" note and its copy leaf are gone. Before, tapping the pressed default chip silently pinned the cabinet. The colour and handle rows share one button.
  - No undo exists (DEVELOPMENT-SPEC §5.1); the tests prove set-then-clear equals clear and clear is idempotent. A no-op clear stamps `updatedAt`, as colour does.
  - Browser: handle and panel specs, 20 passed under `next dev`, mobile and desktop, including a keyboard spec.
  - Queued: OQ-15a, OQ-11e (the Russian string has no recorded source; the top-row label overstates "like the rest of the kitchen").
- U5c record (2026-11-04), merged `fab5a514`:
  - The publish page, history and version page read and write through R2's and R3's routes in every build (`fetching-publish-client.ts`, `dashboard-fetch.ts`); each route answer maps to its own outcome: an unreadable draft goes to its page at the named revision, no active version has its own notice, an unreadable publish answer says it may have been published and re-reads, a 401 raises the expiry sheet.
  - One change-count rule (OQ-30, ADR 0178 Amendment 2026-11-04) in the domain, `countPendingPrices`: chip, badge, tab, button, dialog, history row, the store's version count (held at publish) and the publish, discard and group-revert audit stamps.
  - OQ-20: a refused draft lists each change with its own ↺; a created or deleted row is one line without ↺ until R4a; a whole-book refusal has its own sentence and offers discard only. A row the draft created and deleted again needs no usage count; a stated row still does (`cannotJudge` until S3).
  - The version page finds the predecessor by sequence; the production stub store is read silently, any other store failure logs, and a non-store error is rethrown; a malformed `publishedAt` is refused. `publish-sample*` moved to `tests/support/`.
  - QA found two defects (history count, created-then-deleted blocking publish), fixed; logic, clean-code and security reviews, two rounds, no blocker.
  - Browser: the publish specs 32 passed under `next dev` and 32 under `CI=1` (36 were skipped under `CI=1` before). No browser test publishes or restores (a publish moves the active version for every spec on the server); those paths are DOM and route tested until the Z gate.
  - Merge with U4c needed three test expectations moved (store-error rejection, the created accessory counting once) and one conflict in `qa-m10-u4a-sources`; domain, persistence and web suites green on the merge.
- U4c record (2026-11-04), merged `6448d5cc`:
  - Built-in accessories listed with their earning rule as a sentence (the mock misstates the rack's host: ADR 0070 d4 hangs it in the lowest wall cabinet over the sink); creating a linked accessory (cabinet types the manufacturer supplies, whole tens of lei, Romanian text), renaming it, and Delete on a draft-created one reverting its creation; immediate switching with the accessory dialog variant; table from 1100 px (Russian titles hold from 1060; a 1080 layout at 1100 checked for a classic scrollbar).
  - The sink cover (OQ-31): switching it off is refused in the domain (`item-always-present`), its delete reason and page carry no "dezactiva" hint, and pricing, the removed-accessory notice and the staff chips read it as on whatever availability is stored (`isAccessorySwitchedOff`).
  - Delete is off with `cannotJudge` wherever the lifecycle client cannot write, for every kind (review F3), so no inert dialog opens in production once R4b makes defaults readable.
  - Shared: `ItemLifecycleSection`, `ItemRemovedNotice`, `ItemUnavailableScreen`, `PriceSaveBar` (derives its own state), `dialogLeavesOf`, `reasonsOfItem`, `useLifecycleClient`, the created-row name editing hook.
  - Browser: accessories, hardware and materials 94 passed, 6 skipped under `next dev`; 79 passed, 21 skipped under `CI=1`. Not reachable in a browser until R4a: creating, renaming or deleting a created accessory (the fake book holds none).
  - 19 new Romanian lines, queued (OQ-11c). Departures: built-in words read-only; the link a select only on the creation form; "Se aplică imediat" for the switch hint; no "Rămân disponibile" line in D6C.
- P6 and P6b record (2026-11-04), merged together `e18d554c`:
  - P6: a lift door's third hinge reads the door (body less the 6 mm reveal the adapter builds, held by a parity test); one push-to-open latch per door leaf, lift doors included, none on drawers; `perPushRunnerMinor` billed for a push-to-open drawer instead of the drawer rate, refused at zero; ADR 0092 and ADR 0177 amended. The seeded default kitchen's total does not move; the push-everywhere fixture does.
  - P6b: the fifth rate laid out (hardware table from 1440 px; its state column holds the Russian chips at a 1420 px layout, the stand-in for a classic scrollbar); a created class's name renameable with "Redenumește" (off in production until R4a); immediate-effect dialogs name a class by its published name; the hardware list on `ItemRowMenu` (closes on the click; entries keyed by id, which fixed lost focus when Activează became Dezactivează on both lists); shared stylesheet `item-screen.module.css`; `path-segment.ts`; `item-page-read.ts`. Desktop e2e at 7 shards (six put 70 on the fourth).
  - QA found one defect (a published name typed back left a no-op change), fixed. Browser: hardware and materials 62 passed, 4 skipped under `next dev`; the `CI=1` pass last ran at `7441c456` (110 passed, 52 skipped), before the review fixes.
  - Deferred: renaming the description; the rename in a browser (the fake book holds no created class).
- U4c hand-offs to R4a and the Z gate (2026-11-04): the availability route judges through `judgeAvailabilityChange`, and the client reads `409 item-always-present` as refused; `createAccessory` on `FETCHING_PRICE_DRAFT_CLIENT` is what turns Create on (no browser test can create before that); minted accessory ids must never be `new` (`accessories/new` is a static segment beside `[accessoryId]`); the Z gate checks no stored latest availability row has the sink cover off (pricing bills it regardless, from U4c's review fix).
- More R4a hand-offs (2026-11-04): `DASHBOARD_CONFLICTS` gains `item-is-fixed-default` and `item-always-present` from the domain's list (the deferred wire test in `qa-m10-u4a-wire` lists both); the publish page's `blocked` answer is reachable only once `readPublishPage` is given `deletionFacts` (S3's counts) — until then an undeletable kind shows `cannotJudge` with "Încearcă din nou mai târziu", safe but untrue for a row that can never pass.
- U5c security hand-off to R4a (2026-11-04): when the draft route starts accepting `item-deleted`, `planPublish` (`publish-plan.ts`) must judge `deletedItemsOf(draft.changes)` with the usage reader and the defaults and answer `item-in-use` / `item-is-default`; today only the client judges, and nothing reaches publish because the route refuses deletions.
- U5c hand-off to S4 (2026-11-04): a published version's `changeCount` is computed with the domain's pending-count rule, not the stored array's length; the held S4 store must write it the same way. **Re-addressed 2026-11-04 (architect):** the code is S2's. S2 implements it and S4 takes it by merge. The line-by-line hand-off is in Lane S, *S2 and S4 hand-off: the stored change count*.
- P6b hand-off to R4a (2026-11-03): to turn renaming on, (a) `readAppliedAddress` (`draft-requests.ts`) and `draft-address.ts` accept `created-row-text` for both change and revert (typing the published name back sends a revert), (b) `FETCHING_PRICE_DRAFT_CLIENT` sets `acceptsCreatedRowText: true`, (c) the three `it.fails` in `qa-m10-u4a-wire.adversarial.test.ts` flip and the `NOT_EDITABLE` pin beside them is deleted. U5c also hands R4a the wording for an `item-is-fixed-default` deletion at publish, which today reuses the "default in Setări implicite" line.
- P6 hand-off to R4a (2026-11-03): the class-creation route must write through `applyChanges` (which refuses a zero push-runner rate as `ZERO` and a short rate set as `CREATED_TIER_RATES_MISSING`), never re-judge by hand.
- U4a record (2026-11-03):
  - Browser specs: `apps/web/tests/e2e/hardware.e2e.spec.ts`, `hardware.desktop.e2e.spec.ts`; `publish-page.e2e.spec.ts`, `publish-page.desktop.e2e.spec.ts` for U5b. Under `next dev` hardware has 27 passed, 2 skipped, publish 36 passed, 2 skipped; under `CI=1` hardware 21 passed, 8 skipped, publish 2 passed, 36 skipped. CI therefore does not hold the publish page's working surface until U5c. Not reached in a browser: creating a class, deleting into the draft, a switch surviving a reload; on the publish page the discard dialog, refusal list, pager, D7E, D7G.
  - Production until the Z gate: switch and delete off with `cannotJudge`, Create off, no count stated.
  - **R4a scope, added:** a creation route of its own (the wire contract wins over the row's "through R2's endpoint": the server mints the id and a class never lacks its rates), `createHardwareClass` on the fetching client, a reader for `DraftChangeCreatedWire`, and a retry that cannot create a second class after a lost `200`; `item-is-fixed-default` in `DASHBOARD_CONFLICTS`; a delete refused for use, answered as the wire's `400 ITEM_IN_USE` (coordinator's recommendation; `conflictOf` turns a `409` into `failed`); `deletionSettlementOf`'s conflict case still keeps the dialog open on old facts. R4a and R4b ship together, or R4a reads the defaults itself: unreadable defaults keep every control on `cannotJudge`. Three deferred tests in `qa-m10-u4a-wire` go red when R4a delivers.
  - **U4b, U4c hand-offs:** accessories get "opțiune" wording in `deactivationLines`, `activateBody`, `usedBy`; built-in accessories are offered a delete the server refuses and `OffReason` has no reason for it; `use-hardware-desk.ts` is hardware-only, and U4c needs `accessory-created`. The dashboard-wide pending count is `changes.length`, so one created class reads as five prices (rule on it in U5c).
  - Coordinator choices awaiting the owner: the card layout runs to 1359 px, the table starts at 1360 (titles do not fit sooner); a class the draft deletes keeps its switch entry off with the reason on the list and hides it on its page; a created class's name cannot be edited, so a typo means delete and recreate (departs from A-18). 18 new wording lines under `priceDashboard.lifecycle`, `errors`, `hardware`.
  - Departures kept: description one line, not D4C's textarea; name and description read-only; switch a labelled button; rate fields stacked; the menu has two entries and opens beside the dots; Activează's dialog does not say "Se aplică imediat". About ten Russian plurals still group thousands in their `one` arm (`ru.json`), left for the translations pass.
  - Publish page: the panel sits beside the table from 1300 px. Row 21 stands: cabinet names stay Romanian on the Russian route; the browser check's report otherwise was wrong and is corrected.
- U5b record and the new wave U5c (2026-11-02):
  - **U5c, added: wire the publish page to the real routes.** No wave owned this. `defaultPublishClient` answers `failed` in production and `readPublishPage` answers `unavailable` or a sample, though R2's and R3's routes exist. Scope: a fetching `PublishClient`; `readPublishPage` and `readVersionDetail` over the real state, including `draft-unreadable`; outcomes for `409 draft-unreadable`, `no-active-version`, `nothing-to-publish`, `availability-changed-meanwhile`, restore's `candidate-refused`, and `session-ended` raising `raiseStaffSessionExpired`; `readState` able to say a read was refused; `blocked` from `judgeDeletionsAtPublish`; the real pending count. Depends on R2, R3; its end-to-end proof waits for the Z gate.
  - **R4a scope, added:** the revert reader (`draft-requests.ts:151,319`, `draft-address.ts:43`) refuses `item-deleted`, `hardware-tier-created` and `created-row-text`, so ↺ on `row` and `text` rows would answer `400 NOT_EDITABLE`.
  - Owner question: a draft with a valid change beside a refused one offers only discard-all, so the valid change is lost (`publish-model.ts:209,237`). Coordinator's recommendation: list each change with its own ↺. Ordinary writes cannot create this state; a rule tightened after changes are stored can.
  - Coordinator choices awaiting the owner: a draft that changes nothing visible (created then deleted) offers discard and no publish; Publish is off while a "Nou" field holds unsent text. 23 new wording lines under `priceDashboard.publish` (unreadable, stale and unchanged draft, discard, refusal lines, `rowDeleted`, `unsentAmountHint`, `history.pageFailed`).
  - Known and open: "Le-am citit din nou" still shows when the re-read inside a write failed (`usePriceDraft` `settle`, `noticeAfterWrite`, the restore path); percent rows have no inline field; a created accessory's `linkedBuildId` and description are not drawn in D7 and D8; the sample's revert and restore answer `failed` where the route answers `candidate-refused`; raw ids can show on link rows and refusal lines when a cabinet is not named.
- P5 record (2026-11-02), awaiting the owner:
  - The third hinge reads the body's width; the door is 6 mm narrower, so a 503 mm insert has a 497 mm door and 3 hinges. Only 501-506 mm bodies differ. Ask with OQ-5a; choosing the door needs a declared, parity-gated fact in the domain.
  - In a push-to-open kitchen a lift door bills hinges, a lift and a latch (ADR 0092 d3 Amendment C applied as written; not specifically ruled). The preview assumes a floor-standing, unlatched body for every row (`cabinet-preview.ts`), so it can read below the kitchen line by the latch.
  - Only `wall-lift` is lift-up. Reported, not priced: `tall-fridge-housing` (the catalogue's "flap", the one real question), `tall-oven-tower`, `tall-oven-tower-600`, `wall-1door-300-top`, `wall-2door-600-top`, `wall-2door-600-deep-top`, `wall-2door-800-top`, `wall-corner-return-570-top`, `wall-corner-x-900-top`, and `wall-cabinet` built short.
  - `DRAFTED_LIFT_MINOR` (200, 600, 500 MDL) has no source and becomes customer-visible through the seed. The seed must run from a tree holding P5: a stored book without `perLiftMinor` is refused and every price fails closed.
- U3 and Q2 record (2026-11-02):
  - Browser specs: `apps/web/tests/e2e/cabinet-detail.e2e.spec.ts`, `cabinet-detail.desktop.e2e.spec.ts`. The first run found eight defects; all fixed, and the three price-dashboard specs pass on a production build (88 passed, 6 skipped by design). `support/price-draft-lock.ts` makes the spec files take turns, because the fake price book holds one draft per server.
  - Coordinator choices awaiting the owner: an anchor of 0 is refused on the anchor field (the mockup blames the minus step); the cabinet and its price sit side by side from 1200 px, not 900 (below it the page scrolled sideways); `priceDashboard.cabinets.nameWithWidth` names corner pieces from their built width, so "Racord bază de colț 330" where the mockup says 320; "Înălțime finită", "Prețul nu se schimbă la {deepMm} mm" and four more lines of new staff wording.
  - Departures kept (mockup against app): occupied depth 620/720 against 320 (appliance rows include bars, e.g. 648); a 400 top-row column; greatest height 900; Activ and Nou sub-columns in place of the "+50 lei · +6 %" line; wall default width "din generatorul"; hood depths 600/700; switches without a knob; fields show "3970", not "1 450,00"; no "Feronerie →" link; error label and field not red or pink; no lift count until P5.
  - Corner widths: the built widths are 330/570/900; plan lines 326 and 334 and ADR 0177 line 124 say 320. The hood row's "deepeningRows (customer-supplied)" wording is inaccurate.
  - Known and open: on the phone Save is visually after the table with its DOM position after the sentence, so Tab reaches Save before the hardware switch; the preview table's scroller has no `tabindex` and relies on Chromium's focusable scrollers; the list's freshness after Back rests on `no-store` alone (Chromium checked, no `pageshow` refresh); an unknown cabinet id shows Next's English 404 inside the Romanian staff surface; malformed percent-encoding answers 500 under `next start`, app-wide; the readout uses the book's default class while D9 stamps its own; `cabinet-list-facts.ts:258-260` keeps the anchor cast and banners.
  - `qa-8k2-design-return` failed 4 tests under `next dev` (2 GETs, not 1) at Q2 and at `55f91fcc`, and passed in the production-build gate. Not investigated; inference: a dev-mode artefact.
  - Q2: browser check passed (8 tests, 237 regression passes; figure 86 000 to 87 000 with Push-to-open; camera kept).
- M4 hand-offs (2026-11-02, M4 review; inference until each wave reads them):
  - **R4a:** the stored-draft reader and draft wire carry the four structural kinds; `web/stored-draft.ts` refuses them
    today. Publish calls `judgeDeletionsAtPublish` with `deletedItemsOf(changes)` and S3's counts. A creation writes
    exactly the rates `hardwareRatesOf(activeBook)` returns, three until P5. `planChange` appends, so a re-sent creation
    lands behind its dependents and is refused: replace it in place. Mint created ids in one namespace across kinds:
    today an accessory may take a tier's id. Decide whether restore keeps a pending deletion: `[delete T, rate on T]` is
    `candidate-refused`. Reverting a deletion can pass the 50-accessory cap, and the route answers `409`.
  - **U4c:** publishing a created class waits for **Q3**. `qa-p4a-tier-offer-switched-off` pins with `it.fails` that one
    switched-off tier blanks every delta and stays in `tierIds`, and a created class starts switched off (A-17). "Delete"
    on a draft-created row reverts its creation: `[create, rates, delete]` applies with no row in D7.
  - **U5/U5b:** draw the `row`, `text` and `link` diff rows; `publish-model.ts` keeps only `field` and `group`. A draft
    holding stale refused changes shows the list as unavailable, so the publish page is where it gets cleaned up.
  - **Restore** covers fields both books share and never recreates or deletes a row, so "reproduces the archived book"
    holds only for that pair of row sets. D8C says so in its copy.
  - **Text rule, coordinator readings awaiting the owner:** `Euro 450` passes as a hardware term and `50 euro` is refused;
    `Blum 2000, Euro 450` is refused; Cyrillic look-alikes and superscript digits are not caught.
  - **Z gate:** parse every stored version with the current parser before S2 goes live: unkeyed names and descriptions
    now refuse control, direction and non-NFC characters.
- U2 record (2026-11-02): the browser check is `apps/web/tests/e2e/price-list-editing.e2e.spec.ts` (`--project=mobile`
  runs both viewports, 21 tests). It found no behavioural defect. Layout departures from D2C, D2D and D2E stand for a
  polish pass: the depth card is stacked with no "+" and an unaligned field, the bulk scope uses native radios and the
  dialog is narrower, and labels stay black in error. The 10-lei rule lives in the field only; a bulk at −90 % can take a
  small step to 0, and the preview does not warn. Reading the cabinets page writes no audit row; `GET /api/staff/prices` does.
- M3 hand-offs (2026-11-02, M3 logic review; inference until each wave reads them):
  - **S3:** the contract is `usesItem(migrateDesign(row))`, not the stored row. Jsonb paths can match tiers and linked
    accessories (`buildIdsPricedAs`) only: the drying rack depends on geometry, the sink cover on a sink set, colours and
    handles on `canFinish`/`canHandle`, and migration rewrites legacy finishes. S3 counts those kinds by running the
    domain predicate over migrated rows, and S-e widens to built-in accessories, legacy rows and the capability gate.
    The reader owes exactly one count per item: `UsageNotCountedError` refuses a missing or repeated one.
  - **R4a:** `judgeAvailabilityChange({item, active}, state)` and `usesItem({design, item, catalog, book})` are the real
    signatures. The wire gains `item-is-fixed-default` (`price-dashboard-wire-contract.ts`, `DASHBOARD_CONFLICTS`,
    `m10-ports.ts`), which only the domain knows today.
  - **The D9 save route** runs `stampedSettingsOf` before persisting.
  - **U4a/T1:** "Alege alt implicit" is true only of `item-is-default`; `item-is-fixed-default` needs its own copy. D5G's
    message answers `last-active-option`, judged first. The D5E hint does not hold for accessories: opening a kitchen
    never lowers their count.
  - **M4:** built-in accessories are never deleted; `judgeDeletion` is kind-agnostic.
  - **Web:** `kitchen-defaults-model.ts` `withMaterial` keeps its own fallback for a default colour that is off. Its tests
    pin it; `judgeAvailabilityChange` makes the state unreachable for new writes, so it stays.
  - **Coordinator choices awaiting the owner:** the fixed defaults (PAL, Standard, `steel`, `push`, each palette default)
    can never be switched off, wider than A-9's "the D9 default"; a switched-off linked accessory stays undeletable while
    any kitchen holds its body (`removedAccessoriesSince` relies on it).
- R3 hand-offs (2026-11-02, R3 review): **U5b** shows `refusals` of publish's `409 candidate-refused`. **U5** keeps
  disabling publish for a draft equal to the active book: the server refuses only an empty draft. Restoring the active
  version answers `nothing-differs` and keeps pending edits, so D8C offers restore on archived versions only. U+2800 is
  blank for a version label only, in `version-text.ts`; the shared class in `visible-text.ts` is unchanged, since widening
  it could refuse stored books and names.
- M2 hand-offs: **R3 and S2** must call `judgeBookAgainstCatalog` (with
  `buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM)`; the judge is depth-independent for the shipped catalogue) and
  parse first. **U2:** a bulk can be refused for a ≤0 price the draft already had, so its message must name the rule.
  **U3:** `previewCabinet` takes a named request and refuses non-buildable heights (`HEIGHT_NOT_BUILDABLE`). **P5:** add
  the lift term to the preview's hardware.
- In flight, not merged: **Q1c** (rounding, in QA) and **P4b** (linked accessories; rulings: `linkedAccessories`
  required, since no stored versions exist yet and the sample id is unchanged; `pricesChangedBetween` throws when
  either side is refused, R5 decides display; the blank-name rule applies to every unkeyed row).

**2026-10-28 — P3 built, QA green, reviewed; held to MP-3** (branch `m10/p3` @ `0abdd0d2`, pushed) [coordinator's
brief, relayed; the scribe ran nothing]:

- **State:** QA green; logic review found no blockers; clean-code review found no must-fix; the review round is applied.
- **Held, never merged alone:** P3 merges at **MP-3 together with Q1 and Q1b**. At 700 mm the total includes the depth
  uplift, which only Q1 (breakdown) and Q1b (review screen, lead notice) render.
- **R2** merged into `m10-price-dashboard` on 2026-10-28 (`09b2a139`, pushed) [src: git log in the session context].
- **Coordinator ruling (P3-Q3 implementation):** the closed-key row refusal reuses `INVALID_PRICE_BOOK`, names the row
  and the key in the detail, and carries a structured `id` (tier or accessory id), as `refuseUnreadableAccessoryRule`
  does.
- **Hand-offs, by owning wave:**
  - **P4b:** add linked-accessory rows to `refuseUndeclaredRowMembers` in `pricing/parse-row-members.ts`
    (`membersOf` catches a missing member, not a missing row kind).
  - **P5:** add `perLiftMinor` to the hardware tier member list in `parse-row-members.ts` and restore the M1 test
    generator line that emits it (`qa-m1-books.ts`). Until then a book carrying it is refused.
  - **Q1:** `BreakdownDepthRow` (`price-breakdown-model.ts`) carries `depthMm` and `amountText` but not the percent.
    Q1's "Adâncime 700 mm · +{percent} %" must source `book.depthRule.deepCabinetPercent`.
  - **M2:** retired `linear-in-*` cabinet formulas still parse and are refused only when a body needs them;
    `judgeBookAgainstCatalog` (P3-Q2) is what closes it at publish. **Not covered by the closed keys** (outside P3-Q3 as
    ruled): a stray key on a cabinet-rule object, a third key in the `accessories` container, a group-level stray key.
  - **S2** (open question answered by the logic reviewer; **inference**): a pre-cut-over stored version cannot reach
    history or detail (no store existed before P3; the seed publishes the converted sample; publish refuses unevaluable
    books). The tolerances stay as defensive code: `publish-rows.tsx` depth-rule "isNew", `diff-books.ts`
    `ABSENT_VALUE` on a depth-rule row, `editable-fields.ts` `locateDepthRule` with an absent rule. Recommendation for
    S2: read archived versions through `parsePriceBook`, or record that history shows unparsed books.
  - **Test audit / QA later:**
    - `packages/configurator-domain/tests/price-dashboard/change-set-books.ts:123` generates books with
      `depthRule: undefined`, which the parser now refuses, so some M1 property suites prove properties over unparseable
      books;
    - `qa-m10-u5-publish-rows` tall-group cases now cover one anchored tall row only (the sample has one);
    - the P3-c pin holds by structure (identity of the stored snapshot), not through a read path.
- **Known flakes seen during P3 (unrelated):** `apps/web/tests/app/api/csp-reports/qa-8q2-sink-store.adversarial.test.ts`
  (30 s timeout under load, 37/37 alone) and
  `apps/web/tests/contact/qa-8m-p1-p4-with-the-connection.adversarial.dom.test.ts` (coverage floor: "told as
  unanswered" swept 95 < 100).

**P acceptance.** Each item is a property where a range exists. Use `fast-check`; the javascript-testing-expert skill
applies.

- **P1-a:**
  - for every anchored rule and every buildable width `w` in its catalogue range, the price at `w` equals the price at
    `⌈w/50⌉×50`;
  - the price at `anchorWidthMm` equals `anchorMinor` exactly;
  - the price is non-decreasing in width when both steps are ≥ 0 and the door term is ≥ 0.
- **P1-b:** a body at 575 is priced as 600, and one at 560 as 600. The old "575 priced at 575" is gone.
- **P1-c:**
  - for every body whose door count follows width, the door term's leaf count equals what hardware counts for the
    same body;
  - must-not: a body whose built width gives one leaf is never charged a second leaf's panel, at any width in
    451–499.
- **P1-d:** a fixed-size body at a listed width prices at that size. Above every listed width it is refused with
  `NO_PRICE_FOR_SIZE`. It is never priced at 0.
- **P1-e:** every catalogue row's `defaultWidthMm` equals the width the generator plans it at, for every row the
  generator plans (parity).
  - **(P1 review, 2026-10-26)** Where each value comes from is a **production** field on the catalogue entry, beside
    `defaultWidthMm`: `defaultWidthSource: "generator" | "only-width" | "proposed"`, following the brief's "Where the
    value comes from" column. It lives in `catalog.ts`; P1 owns it, in a fix round of P1.
  - The parity test reads that field (the `"generator"` rows) instead of a list in the test.
  - U1 and U3 render "propus" from the field. They read the domain catalogue in the browser, so the wire is
    unchanged.
  - OQ-8's answers flip `proposed` to a confirmed source.
- **P1-f:** the parser refuses, each with a code naming the field:
  - a negative step;
  - an anchor that is not a safe integer;
  - a `price-per-size` list that is empty, unsorted or holds a repeated width;
  - an anchor width that is not a multiple of `PRICE_STEP_MM`.
- **P2-a:** for any design, `totalMinor === Σ lines.amountMinor`, and every line amount is a multiple of 1 000.
- **P2-b:** for a one-cabinet design, cabinet + material + depth lines equal `r10(b × (100+m) × (100+d) / 10 000)`.
  This is the D3 cell function, imported, not re-implemented.
- **P2-c:**
  - at depth 600 there is no depth line;
  - at 700 the depth line covers exactly the rows the A-6 parity sweep lists;
  - a customer-supplied row's contribution is 0, and so is that of any row the `deepeningRows` measurement excludes
  (`fridge-free`). **Wall rows contribute** (owner ruling 2026-10-26, A-6);
  - the parity sweep asserts the measured set: every manufacturer wall-band row and wall corner, base, tall, hob,
    sink and base corners deepen;
  - must-not: hardware and accessory lines change with depth or material.
- **P2-d:** the material line at PAL (0 %) is 0. Material never touches hardware or accessories.
- **P2-e:**
  - every arithmetic step is in integers, with no float on the path. Check by sabotage: inject a float into the
    multiply, and the suite must go red;
  - the re-derived bound's worst case evaluates exactly.
- **P2-f:** the property suite asserts the rule with randomly drawn percentages and amounts. It never asserts 15 % or
  any placeholder.
- **P3-a:** the sample book parses. `amountsProvisional === true` and `status === "estimate"`. Its version id is
  bumped (P3-Q5).
- **P3-e (P3-Q3):** a tier, accessory or linked-accessory row carrying any key outside its declared list is refused
  with a code naming the row, so a stray flat amount beside a percentage is caught. The test plants
  `wholeKitchenMinor` from the test file, never from production source.
- **P3-b:** no source file under `packages/` or `apps/web/src` names `wholeKitchenMinor` or a `linear-in-*` shape,
  checked with `rtk proxy grep`.
- **P3-c:** stored contact-submission snapshots are untouched. `submission-snapshot.test.ts` reads old snapshots
  unchanged, and a snapshot's stored total is never recomputed.
- **P3-d:** the settings sheet still offers every tier when pricing refuses (the recovery path of ADR 0072, *One
  observation*).
- **P4a-a:**
  - a design naming a disabled tier, colour or handle is refused with `REPLACEMENT_REQUIRED`, listing every disabled
    item it uses;
  - never `UNKNOWN_TIER` for an item still in the book;
  - must-not: a disabled item is ever offered to a new choice.
- **P4a-b:**
  - the same design and book priced under two availabilities that differ only in an item the design does not use give
    byte-identical results;
  - the book is never consulted for an `active` flag (none exists);
  - a sabotage that reads availability from the book must fail to compile or go red.
- **P4a-c:**
  - `replacementsRequired` lists only active options;
  - an empty remaining set is a thrown defect, never a sheet. M3's write-time guard makes it unreachable, and the
    throw proves that.
- **P4a-d:** a disabled accessory, built-in or linked, yields no line and no refusal. Re-enabling it restores the line
  exactly.
- **P4b-a:**
  - a linked accessory's quantity equals the count of placements whose priced-as row is its `linkedBuildId`. This is a
    property over random designs, and a seeded body counts through its equivalent;
  - quantity 0 yields no line;
  - each line amount is a multiple of 1 000 (A-1).
- **P4b-b:**
  - the built-ins' lines are byte-identical before and after P4b for every fixture design;
  - must-not: a linked accessory alters a built-in's quantity.
- **P4b-c:**
  - the parser refuses a created row carrying a Russian text field, an empty Romanian name, or an id shared with any
    other rule;
  - a keyed shipped row is unchanged.
- **P4b-d:**
  - `pricesChangedBetween` is true if and only if some line amount differs;
  - identical inputs give false;
  - a change to a row the design does not use gives false;
  - **activating** a linked accessory the design earns gives true, with no new book version.
- **P5-a:** a lift-up door counts exactly one lift. A body with no lift-up front counts zero. Every catalogue row's
  lift count is pinned by a sweep.
- **P5-b:**
  - a lift door at width 500 counts 2 hinges and at 501 counts 3 (OQ-5a strict default, at both ±1);
  - a non-lift leaf's hinges still follow the height rule (taller than 900 means 3), unchanged.
- **P5-c:**
  - the hardware line equals `r10(Σ rate × count)` over the four counts;
  - the Hettich-below-Standard quantifier with its lift term is derived from the declared rates;
  - the one-`base-3drawer` witness of ADR 0092 d12 still holds.
- **P5-d:** must-not: any front other than one declared `liftUp` is charged a lift. The sweep lists every candidate it
  declined.

**QA reading (every P wave):** the base reading; `packages/configurator-domain/tests/pricing/**`;
`docs/best-practices/engineering-conventions.md`, *Coverage an adversarial pass owes* and *Three guards that look
thorough and cannot fail*. A sabotage run is owed for every new arm (R6).
**Review reading (logic):** the base reading, plus §4 rows S-6 to S-12 and S-28 to S-30. **(clean-code):** the wave's diff and `engineering-conventions.md`.

### Lane H — Whole-kitchen handle and stamping new kitchens (Full)

| Wave | Must-fix items | Prod files | Depends on | Reading |
| --- | --- | --- | --- | --- |
| **H1** whole-kitchen handle | (1) `DesignSettings.handle` (optional, so no schema bump, per ADR 0099 d10's argument); (2) resolution: the cabinet's own handle, else the kitchen handle (excluding the top row), else today's defaults (`DEFAULT_HANDLE` / `TOP_ROW_HANDLE`); (3) a `setKitchenHandle` command; (4) `isPushToOpen` reads the resolved handle, so hardware latches follow it; (5) migration and load-seam tolerance | `design.ts`, `queries/describe-selection.ts`, new `kitchen-handle/kitchen-handle.ts`, `push-to-open.ts`, new `commands/set-kitchen-handle.ts` | MP-0; **OQ-7** | DEVELOPMENT-SPEC §5.5 and §6.5 (finish and handle); ADR 0061; ADR 0092 Amendment C; ADR 0099; backlog 278; `design.ts:44-70,170-195` |
| **H1b** the kitchen handle reaches every reader, together (added 2026-10-26) | (0) **also the review screen** (`apps/web/src/review/review-model.ts:285`, which shows only the cabinet's own handle): it shows each cabinet's **resolved** handle, so the review never omits a handle the price bills a latch for (assigned 2026-10-26); **the review and the lead-notice e-mail print "Push-to-open" only for a latched body with at least one opening front (no handle word on a top-row open shelf), through one domain function shared with the price (ruling 2026-10-26); see H1-c for the golden consequence**; (1) `projectDesignForDisplay` passes the design's kitchen-handle settings into each `DisplayEntry` (an optional fact); (2) `hardware-mechanisms.ts`'s push-to-open query passes it, so the **price** follows; (3) the scene follows: `scene-sync.ts`'s `hidesHandles` passes it, the black-bar check reads `resolvedHandleOf(…)` instead of the raw `record.handleMode`, and `signBody` includes the resolved handle so a kitchen-handle change re-syncs. `PlacementRecord.handleMode` stays the **cabinet's own** handle; (4) `use-panel-view.ts` passes it to `describeSelection`; (5) the readers take H's settings **object** (`{handle?, topRowHandle?}`), not a lone value, so H2's `topRowHandle` reaches them with no second pass | `queries/design-projection.ts`, `hardware-mechanisms.ts`, the domain PlacementRecord builder, `three-adapter/src/scene-sync.ts`, `apps/web/src/panel/use-panel-view.ts`, `apps/web/src/review/review-model.ts`. **Six, across three packages; over five, stated, with a mini-review** | H1 | ADR 0092 Amendment C (price and scene must not split); ADR 0099; DEVELOPMENT-SPEC §5.5, §6.5; `docs/best-practices/product-invariants.md`; `docs/skills/lemnaria-3d-reference/SKILL.md`; `scene-sync.ts:190-310`; `built-body.ts:87-88` |
| **H2** stamping new-kitchen defaults, and the top-row handle | (1) the generation request takes `newKitchenSettings` (material, hardware, depth, colour, handle, top-row handle); (2) `shell-design.ts` stamps them explicitly; (3) a colour the default material does not offer resets to that material's default (ADR 0057, the D9B note); (4) absent settings on a legacy document keep the fixed fallback (A-9); (5) **`DesignSettings.topRowHandle`** (optional, the same no-bump argument), resolved for top-row bodies as cabinet's own → `settings.topRowHandle` → `TOP_ROW_HANDLE` (H-3); (6) **recorded 2026-10-27:** generation threads cabinet depth natively (700 changes corner widths, runs and the probe), and the depth module's constants were replaced by a per-depth catalogue map; (7) **ruling 2026-10-27 (H2 logic review): a native 700 shell must equal the 600 shell moved by `setCabinetDepth`** (no 30 mm wall-row strip beside a deeper base corner on walls B/C; an unfillable void is a DEVELOPMENT-SPEC §2/§4 dead end). This must land **before R4b** | `generation/shell-design.ts`, `generation/generate-kitchen.ts` (request type), `kitchen-handle/…`, `design.ts` | H1b | ADR 0111; ADR 0057; ADR 0071 Amendment; `migrate-design.ts:83` |

**Rulings on H1's open points (2026-10-26):**

- **H-1 — the readers belong to new wave H1b.** H1 adds the setting and the resolution and stops there. H1b wires
  every reader together, because price without scene recreates the split that ADR 0092 Amendment C closed. No lane
  owned `packages/three-adapter` until now; H1b does, and only it. H1b holds `hardware-mechanisms.ts` before P5.
  Q2 and P5 wait for H1b.
- **H-3 — `topRowHandle` is kept, as a stamped setting.** D9 draws "Rândul de sus" [mock L755], and A-9 forbids
  saved kitchens from reading the live default. The top row therefore needs a per-design value, stamped at creation.
  H2 adds optional `settings.topRowHandle`, which falls back to `TOP_ROW_HANDLE` (push) when absent. The customer gets
  no kitchen-level top-row control (C2 draws only "Mânere"); a top-row cabinet's own handle still wins. **X0's
  contract is unchanged:** `KitchenDefaultsWire.topRowHandle` and the `kitchen-defaults-saved` `changedFields` entry
  stand.
- **H-4 — H1 owns its input check.** `setKitchenHandle` refuses a value that is not a declared `Handle` with a new
  code in `commands/rejection.ts`, inside H1's own QA round. A command must judge its input. **Availability is not the
  command's:** Q2 offers only active handles, Q5 resolves a disabled one through the sheet, and the price refuses
  `REPLACEMENT_REQUIRED` (P4a).
- **H-5 — the rollback hazard is recorded.** `settings.handle` (and `settings.topRowHandle`, H2) in a `strictObject`
  make a document unreadable after a rollback to a build without the key, exactly as `settings.finish` does (ADR 0099
  d10). This is a **no-rollback release note** for Z2's close and the scribe, not a migration. *(Confirmed 2026-10-27 from H2: `settings.topRowHandle` in a `strictObject` makes documents unreadable after a rollback to a build without the key; to be written into the release notes at close.)*
- **H-6 — Q2 adds the effect to the union and its branch in one change.** H1 keeps `KitchenHandleSetEffect` outside
  `CommandEffect`. Q2 holds `commands/command-result.ts` and `store/apply-command-result.ts` together and adds the
  whole-kitchen branch, so `intendSelection` never reads `effect.placementId` from it.

**H acceptance:**

- **H1-a:**
  - a cabinet carrying its own handle keeps it under any kitchen handle;
  - a top-row body is never given the kitchen handle;
  - must-not: a body that takes no handle ever reports one.
- **H1-b:**
  - choosing `push` for the kitchen raises the hardware line's push-to-open count by exactly the number of resolved
    push bodies;
  - choosing steel or black lowers it back.
  - This is a property over random designs.
- **H1-c:** a document without `settings.handle` renders and prices exactly as before (golden comparison against
  `HEAD`). **Ruling 2026-10-26 (coordinator): "exactly as before" covers price and scene.** The review screen and the
  lead-notice e-mail now print each cabinet's **resolved** handle (H1b item (0)), so a document without a kitchen handle
  shows the default handle words on every cabinet that wears one (the lead-notice golden gained 16 handle words).
  **Recorded asymmetry (ADR 0099):** the handle line prints the resolved handle, while the finish line prints only the
  cabinet's own. Rationale: the settings row names material and hardware only, so printing only non-default handles would
  hide the kitchen's handle from the shop. Showing the kitchen handle as a settings-row pill plus per-cabinet overrides
  only is a possible product change for C2/Q2, **not decided**.
- **H1-d (H-4):** `setKitchenHandle` with any value outside `HandleSchema` (a sweep over strings, `null`,
  `undefined`, numbers) is rejected with its code and leaves the document unchanged.
- **H1b-a:**
  - choosing a kitchen handle changes, together, the hardware line's push-to-open count, the scene's visible handle
    bars (hidden for push, black bars for black) and the panel's described handle;
  - must-not: any of the three follows while another does not. Each is checked against the same resolved handle per
    body, and a sabotage of any one reader must go red;
  - a top-row body is unaffected by the kitchen handle.
- **H1b-b:**
  - `PlacementRecord.handleMode` is still the cabinet's own handle;
  - **a legacy `null` own handle is normalised to `undefined` in the PlacementRecord builder** (ruled 2026-10-26,
    H1 review). The resolver's return type is not widened. A property: a document whose bodies carry `handle: null`
    resolves, renders and prices exactly as one with the key absent;
  - **`isTopRow` is derived in exactly one place**, a domain function every reader calls. Today `push-to-open.ts`
    tests `≥ 2200` mm and `describe-selection.ts` tests `≥ 2.2` m. A sweep over every catalogue row and every body
    height, ±1 mm around the boundary, shows the readers agree, and a sabotage of the one function moves them all;
  - a kitchen-handle change alone re-syncs the affected bodies (their `signBody` changes) and no others.
- **H1b-c (visual, §13.3):**
  - at 390 × 844 and 1440 × 900, switching the kitchen handle steel → black → push repaints every handle-taking body,
    leaves top-row bodies alone, and moves the price;
  - captured, with the console read.
- **H2-b (ruled 2026-10-26, H1 review; the coordinator's ruling, adopted):**
  - `settings.topRowHandle` reaches **only top-row bodies whose catalogue row takes a handle** (`canHandle`);
  - a top-row body with `canHandle: false` (for example `wall-corner-return-570-top`) stays push and latched exactly
    as today (ADR 0092 Amendment C), whatever `topRowHandle` says;
  - checked by a sweep over every top-row catalogue row.
- **H2-a:**
  - every newly generated design carries explicit material, hardware, depth, colour, handle and top-row handle;
  - changing the defaults input never changes the output for an existing document.
  - This is a property: generate, then re-load under different defaults, and the design is byte-identical.

**QA reading:** H reading plus `tests/queries/describe-selection*`, `tests/generation/**`. **Review reading (logic):**
ADR 0099, ADR 0092 Amendment C, this plan A-9. **(clean-code):** the diff.

### Lane M — Dashboard model (pure; Full)

| Wave | Must-fix items | Prod files | Depends on | Reading |
| --- | --- | --- | --- | --- |
| **M1** change-set | (1) `applyChanges(book, changes)` gives the candidate book, refused per change with a code, for the **price-field, size, depth-rule, bulk and provisional** kinds (creation, text and deletion kinds arrive in M4); (2) `diffBooks(before, after, {changes?})` gives D7/D8 rows in the new terms [mock L742]. It takes the change list because two books cannot tell which differences were one bulk action: rows are grouped by `groupId` and labelled from `bulk` (ruling M1-Q1); with no `changes`, every difference is its own row; (3) revert one change; (4) `restoreChanges(archived, active)` (A-15). **It covers the fields both books share**: restoring between a flat-form and a percentage-form book restores only shared fields. That case cannot arise in production, because every stored version is percentage-form from P3's seed on, and it is recorded as a limit, not a defect. **Rulings of 2026-10-27, M1 contract questions:** **Q1**, the bulk metadata, is option (a), an optional `bulk` on `DraftChange` (§8.4(b)). M1 adds it to the domain type it owns (`price-dashboard/book-field-address.ts`) and makes `applyChanges` refuse a group whose members' `bulk` differ, or a `bulk` without a `groupId`. **Q2**: `applyChanges` judges each change against the **running candidate** (the book with the earlier changes applied), not the base book, **switched now in M1** while it is in QA; M4 relies on it | `apply-changes.ts`, `diff-books.ts`, `restore.ts`, `editable-fields.ts`, `book-field-address.ts` (mod, the `bulk` field), **and `pricing/parse-price-book.ts` (lane P's file, ruling 2026-10-27: refuse negative and non-whole hardware, accessory and material-tier amounts; P4b and P5 merge on top)** | new `price-dashboard/apply-changes.ts`, `diff-books.ts`, `restore.ts` | P2 merged (types) | §8.4(b); A-14; A-15; D7/D8 frames [mock L871-880] |
| **M2** bulk, validation, preview | (1) bulk % over a scope (all, one group, a selection) with A-14 rounding and counts ("22 dulapuri, 64 prețuri"); **a percentage that rounds to `-0` is normalised to 0, or a 0 % change is refused, before any audit entry is built (see R2; added 2026-10-26)**; (2) `judgeBookAgainstCatalog`: the narrowest buildable width prices > 0 [D3C]; anchor width = default width; size list = the catalogue's sizes; percentage ranges (**added 2026-10-26: `percentageStagesOf` is public, for the cabinet preview, and checks that percentages are whole but not their 0…max range, so M2 validates draft percentages before calling it, or the function gains the range check then**); (3) `previewCabinet(rule, catalog, book, {material, depth, hardwareTier?})`: rows every 50 mm, an off-grid minimum row ("560 → preț ca 600"), door-step rows marked, built **only** from P's functions | new `price-dashboard/bulk-change.ts`, `judge-book.ts`, `cabinet-preview.ts` | P3 merged | D2D, D3A–G notes [mock L846-866]; ADR 0175 *Open* (negative at the narrow end) |
| **M3** lifecycle rules (amended 2026-10-26) | (1) `usesItem(design, itemRef, catalog)`, which counts linked accessories through the earning rule and is the predicate S3's SQL must agree with; (2) `judgeAvailabilityChange(item, active, {availability, book, defaults})`, applied **at write time** (A-17): disabling refused for the D9 default and for the last active option of a group; enabling refused for an item absent from the active published book; (3) `canDelete` (unused, and not the D9 default); (4) the D9 defaults judgement (a colour reset when the default material changes); (5) the remaining-options list for the dialogs | new `price-dashboard/item-usage.ts`, `item-lifecycle.ts`, `defaults-judgement.ts` | P4b merged | D4E/F, D5C/D/E/G, D6C, D9B [mock L868-881]; ADR 0062 Amendment 3 and the 2026-10-26 Amendment; A-17, A-19 |
| **M4** creation, created-row text, deletion (added 2026-10-26) | (1) `applyChanges` gains the `hardware-tier-created`, `accessory-created`, `created-row-text` and `item-deleted` kinds (A-18), and `diffBooks` gains their D7/D8 rows; (2) `judgeBookAgainstCatalog` gains: a linked accessory's `linkedBuildId` names a catalogue row the book prices that the manufacturer supplies (A-19); (3) the authored-text judgement: Romanian only, bounded, the character rule of migration `0021_create_design_notes.sql:15` (F5), and per ADR 0106 Amendment A no amount, percentage or "inclus" (A-21); (4) `judgeDeletionsAtPublish(changes, usageCounts)`: refuses the whole publish if a deleted item gained a user (A-18). **It relies on M1's running-candidate judgement (ruling M1-Q2, 2026-10-27):** a `hardware` rate change keyed by a `tierId` created earlier in the same draft write (X0-4) is judged against the candidate that already holds that tier, so it is not refused `UNKNOWN_ITEM`. **Linked accessories are not addressable by M1's `accessory` address (2026-10-27, M1 logic review):** only the built-in `ACCESSORY_IDS` resolve, so M4 extends `candidateAddresses` and `locateAccessoryPrice` to linked accessories (§8.4(b) says "built-in or linked"). `perLiftMinor` needs nothing here (P5) | `price-dashboard/apply-changes.ts` (mod), `diff-books.ts` (mod), `judge-book.ts` (mod), new `price-dashboard/created-row-text.ts` | M2, M3, P4b | A-18, A-19, A-21; frames D4C, D6A/B [mock L692-697, L710-712]; ADR 0106 Amendment A; `parse-price-book.ts:47-50`; `staff/note-text.ts` and migration `0021_create_design_notes.sql:15` (F5) |

**M acceptance:**

- **M1-a:**
  - `apply(active, [])` deep-equals `active`;
  - `apply(active, restoreChanges(archived, active))` deep-equals `archived` on every editable field;
  - reverting the only change gives back `active`.
- **M1-b:** a diff of identical books is empty. A bulk group of *n* changes diffs as one row expanding to *n*. **(2026-10-27)** The group's row counts and expands every member from the change list, drawing no-op members with before = after; a lone no-op change has its own row (for ↺).
- **M1-c (rulings M1-Q1, M1-Q2, 2026-10-27):**
  - a group's row carries its `bulk.percent` and scope (or `groupCode`) exactly as stored, never re-derived from
    amounts;
  - a group whose members' `bulk` disagree, or a `bulk` without a `groupId`, is refused with a code;
  - a change list where change *k* targets a row or tier introduced by change *j < k* applies, because each change is
    judged against the running candidate;
  - the same list reordered so that *k* precedes *j* is refused at *k*.
- **M2-a:**
  - for any p in [−90, 300] (the bulk bound named in the wave), every scaled amount is a multiple of 1 000 and equals
    `r10(x × (100+p)/100)`;
  - must-not: a bulk change touches a customer-supplied row or a percentage.
- **M2-b:** `judgeBookAgainstCatalog` refuses the D3C case (the minus step driving the narrowest width ≤ 0) and accepts
  the boundary at exactly 1 000 bani above 0.
- **M2-b2 (A-7b):**
  - over every manufacturer row's full buildable grid, any price ≤ 0 refuses the book, naming the row, the width,
    the height and the field. The coordinator's witness (anchor 600 @ 100 000, narrower 30 000 per step, door
    20 000; 200 mm < 0) is a test;
  - a price of exactly 1 bani above 0 passes, and exactly 0 fails;
  - customer-supplied rows are exempt and must be 0;
  - must-not: the judgement samples only one point of the grid. Sabotage: restricting the judgement to the anchor
    width must turn the narrow-end witness test red;
  - a planted negative that only the off-grid minimum (for example 560 mm) produces is caught.
- **M2-b3 (A-7):**
  - for an **insertable** row, `anchorWidthMm` equals the catalogue's `defaultWidthMm` (anchored), or the size list
    equals the catalogue's fixed widths (per-size);
  - for a **non-insertable** row (the six corners), the formula must be `price-per-size` and its one listed key must
    equal **the round-up of the body's built width to 50 mm** (P3-Q4, 2026-10-27). An anchored formula there is
    refused;
  - for an insertable fixed-size row, the size list equals the round-up of each catalogue width (the shipped fixed
    widths are already on the grid);
  - no `defaultWidthMm` is read for a corner.
- **M2-c:**
  - every preview cell equals P2-b's function for that width, material and depth;
  - with hardware on, it equals that plus `r10` of that body's hardware;
  - no arithmetic is re-implemented. Sabotage: change P's step, and every preview moves with it.
- **M3-a:**
  - `canDisable` is false for the D9 default and for the last active option of a group;
  - `canDelete` is false whenever `usesItem` is true for any design.
- **M3-b:** the D9 colour reset follows ADR 0057's rule exactly. This is a sweep over every material and colour pair.
- **M3-c:**
  - `usesItem` for a linked accessory is true if and only if the design has a placement priced as its
    `linkedBuildId`;
  - enabling an item that is absent from the active book is refused.
- **M4-a:**
  - `apply(active, [create X])` contains X with no key, Romanian text only, and the created row is inactive;
  - `apply` of a deletion removes exactly that row;
  - a deletion of a used item is refused by `judgeDeletionsAtPublish`, whatever the order of the other changes.
- **M4-b:** an authored name containing a digit-bearing amount, "%", or any of `inclus`/`inclusă`/`incluse` is refused
  with a code. A plain name passes.
- **M4-c:** a link to a customer-supplied row, or to an id the catalogue does not hold, is refused.
- **M4-e (X0 review M5, m9):**
  - `judgeDeletionsAtPublish` takes the stored defaults too, and refuses a deletion of the D9 default with
    `item-is-default`;
  - a `created-row-text` change on a keyed or built-in row is refused;
  - an `item-deleted` change on a finish, a handle or a built-in accessory is refused.
- **M4-d (amended 2026-10-26, F5):**
  - created-row text is judged by the rule of migration `0021_create_design_notes.sql:15`, through `judgeNoteText`'s
    rules or a shared extraction of them (`staff/note-text.ts:29`): NFC; control and bidi-override characters
    refused; non-empty after trim. A sweep runs over the C0 and C1 controls and U+202A–U+202E, U+2066–U+2069;
  - created ids are server-minted to the stated shape and unique against every built-in and keyed id. A collision
    test seeds one.

**QA reading:** M reading plus P's tests. **Review reading:** logic: the frames named, A-14, A-15, and A-17 to A-21; clean-code: the diff.

### Lane S — Persistence (Full + security for every wave)

**Base reading:** the runbook `applying-a-table-migration-and-its-application-role-grant.md` (steps and the `0008`
section); ADR 0020; ADR 0042; ADR 0128; ADR 0146; ADR 0151; ADR 0153 d1; ADR 0155 (no destructive mutant against a
database); ADR 0173 P-L3-3; `staff-kitchen-actions-store.ts`, `neon-staff-kitchen-actions-store.ts`, `staff-kitchen-statements.ts`; migrations `0020`–`0022`.

The order is S1 → S2 → S4 → S5 → S3 → S6, **with S2c after S3 (added 2026-11-04)**. **S2b, added 2026-10-26, is folded into S2 on 2026-10-27 (coordinator ruling B):** `PriceBookStore.publish` moves the availability head and writes `catalogue_availability_changes`, so the price-book contract's world needs a real availability store. S3 is the only S wave gated on M3 (and so on
P4b), so it runs last and holds nothing up. Migration numbers follow §9.2, not wave order.

| Wave | Must-fix items | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **S1** fakes | Fakes for all six ports from §8.4(c), with a contract test suite each Neon store will also run | `fake-price-book-store.ts`, `fake-kitchen-defaults-store.ts`, `fake-catalogue-availability-store.ts`, `fake-kitchen-change-store.ts`, `fake-price-notice-store.ts`, `index.ts`. **Six (the usage reader's fake is folded into the defaults fake); over five, stated.** Each fake is small and mechanical, and the contract suites are the review surface. **Plus a test-only item (ruling 2026-10-26):** four pre-existing live files throw inside a `describe.skipIf` body in a worktree with no `.env.*.local`, instead of skipping. They are `count-contact-submissions-for-tests.live`, `delete-contact-submissions-for-tests.live`, `delete-rate-limit-counters-for-tests.live` and `neon-rate-limit-totals.live`, all calling `neon(liveTestDatabaseUrl)` at describe scope. S1 moves each connection into the guarded hooks. This changes no production file, and the census registration does not move | MP-0 | §8.4(c); `fake-staff-kitchen-actions-store.ts`; `account-domain-store-agreement.test.ts` (the agreement-suite pattern) |
| **S2** book versions, draft and the availability log (S2b folded in, 2026-10-27) | `0023`, `0024`, `0025` (availability head and log); `NeonPriceBookStore` and `NeonCatalogueAvailabilityStore` (the ex-S2b scope: one-CTE availability writes with their audit row, `readCurrent`, `readAt(revision)`, a privilege arm with no log `UPDATE`/`DELETE`; publish in one transaction with its audit row; `changed-meanwhile` compared in SQL); the owner-run `seed-price-book` command (A-10); migration-text tests; privilege-test arms; census rows; **both shared contracts (price book, availability) run live under the exclusive test-schema lock** | 3 migrations, `neon-price-book-store.ts`, `price-book-statements.ts`, `seed-price-book.ts`, `neon-catalogue-availability-store.ts`, `catalogue-availability-statements.ts`. **Five production files plus three migrations; over five, stated, with a mini-review** | S1, X2 | A-10, A-15; §9.2 rows 0023/0024/0025; `migrate.ts` (how an owner-run command is wired); `0011_create_presets.sql` (an append-mostly table's grant). **Recorded choices, 2026-10-26:** (a) the shared store contracts assert over global singletons (the price-book head, the draft and the newest version), so S2's live files hold the test-schema lock (`test-schema-lock.ts`) **exclusively**; (b) the contracts' publish arms leave the test database's newest (active) version as the contract's book, and the defaults arms leave defaults stored, neither of which can be undone (no `DELETE` grant; versions are append-only). Any later live reader of the test database (the R and K waves, e2e) must seed its own active book and defaults rather than assume one, and the test-only seeding helper must **append** a version (A-10's seed command refuses when any version exists). **Rulings of 2026-10-27 (relayed):** (c) **S2's live files run only when M10 is about to merge to `main`.** They call `runMigrations` on the shared test database and freeze migrations `0023`–`0025` there (the numbers of §9.2 and ADR 0178's Amendment of 2026-10-27). The first apply puts the shared ledger ahead of every other checkout (`ledgerAheadOfCheckoutError`, `migration-plan.ts:48-63`), affecting about 28 persistence live files and `ci:local` on other branches, and possibly main's CI if its `TEST_DATABASE_URL` is the same database (**unverified**). ~~Until then S2 merges into `m10-price-dashboard` on its non-live gates (mocked-driver statements, pglite-checked SQL).~~ **Superseded 2026-10-27 (coordinator ruling): S2 stays on its own branch `m10/s2`, unmerged into `m10-price-dashboard`, until the live gate at the merge to `main`.** Reason: the main checkout has `TEST_DATABASE_URL` configured, so any live test there that calls `runMigrations` (S2's own live files, and existing ones such as `migrate.test.ts` and `delete-rate-limit-counters-for-tests.live.test.ts`) would apply `0023`–`0025` to the shared test database as soon as those files are in the checkout, which is the irreversible ledger move the deferral exists to prevent. Waves that need S2's code (S4, S5, S3, and R1/R3's production wiring) branch from or merge `m10/s2` in their worktrees, which have no database environment. S2 merges into the dashboard branch immediately before the live run, then into `main`. S2 status (relayed): QA green; logic, clean-code and security reviewed; non-live gates green at `c44978ec`. The live run is a Z-wave gate (§13.2, Z1/Z2). (d) **A 4 MiB ceiling on `book`, the draft `changes` and `change_summary`, with a store-side byte check too** (precedent: `0011`). (e) The owner runbook text and the S2 grant list are in the runbook section for these tables (S-g). **Added 2026-10-27 (R2 review):** (f) `0024` gains `check (jsonb_typeof(changes) = 'array')` on the draft table while it is still unapplied, as defence in depth for R2's discard path. **Added 2026-11-04 (architect; ADR 0178's last Amendment):** (g) `0023` gains `change_count`, the count the publisher confirmed, computed by the store at publish. The work is listed in *S2 and S4 hand-off: the stored change count* below the table |
| ~~**S2b** availability log~~ | **Folded into S2 on 2026-10-27 (ruling B).** Its scope, files and criterion S-b2 now belong to S2 | — | — | — |
| **S4** seen and digest | `0026`, `0027` (ex-`0029`, `0030`); `NeonKitchenChangeStore`; the staff kitchens statement gains `changed_since_seen` (`revision <> effective-seen`, in SQL; **effective-seen is `greatest(seen mark, the latest request's design_revision)`, ruling 2026-10-27, see S-c0**), an `only-changed` filter, changed-first sort and a count; `listDigestEligible($now)` exactly as S-d1 restates it. **Added 2026-10-27 (rulings K2-Q1, K2-Q3):** `markSeen`'s `ok` carries `changedAfterSeen`, computed in the same SQL statement as `designs.revision <> greatest(existing, displayed)` (**now also folding in the latest request's revision, S-c0, 2026-10-27**); the staff-kitchen port gains `StaffKitchenQuery.onlyChanged`, `StaffListedKitchen.isChangedSinceSeen`, `StaffKitchenDetail.isChangedSinceSeen` with the opaque `revision` it displays, `StaffKitchenPage.changedCount`, and the as-sent `priced` total. The fakes join `FakeKitchenChangeStore`. S4 owns all of these in persistence (the port types, the fakes, the shared contracts), **plus one domain field** in a stated window: `onlyChanged` in `configurator-domain/src/staff/staff-kitchen-query.ts`, with its judge. **Added 2026-11-04:** S4 takes S2's stored-change-count change by merging `m10/s2`, and edits no price-book file itself (*S2 and S4 hand-off* below the table) | 2 migrations, `neon-kitchen-change-store.ts`, `staff-kitchen-statements.ts` (mod), `kitchen-change-statements.ts` | S2 (sequence) | A-12, A-13; S-18; `0004` header (read only); `design-revision.ts`; `0022_create_design_request_states.sql`; `neon-staff-kitchen-reader.ts` |
| **S5** notice marker | `0028` (ex-`0031`); `NeonPriceNoticeStore` storing the (version, availability revision) pair | 1 migration, `neon-price-notice-store.ts` | S4 (sequence) | A-11 (as amended 2026-10-26); `neon-configuration-repository.ts` (the write-token authorisation it must mirror, read only) |
| **S2c** the publish refuses a deletion that gained a user (added 2026-11-04; ADR 0178, Amendment on a deletion that gains a user) | The publish CTE gains an in-use branch over the deleted items, using S3's predicate text from one shared fragment. The store answers `item-in-use {items}`, and the fake mirrors it. No DDL. Items and criterion S-j are in *Publish and a deletion that gains a user*, below the table | `price-book-statements.ts`, `neon-price-book-store.ts`, `fake-price-book-store.ts`, `m10-ports.ts` (the publish outcome and request), the shared predicate fragment (moved out of S3's `kitchen-usage-statements.ts`) | S3 merged | That block; ADR 0178's Amendment; S-b; S-e; S3's `kitchen-usage-statements.ts` |
| **S3** defaults and usage | `0029` (ex-`0027`); `NeonKitchenDefaultsStore`; `NeonKitchenUsageReader` (jsonb paths; client-deleted rows excluded) with a **parity test against M3's `usesItem`** over shared fixture designs. For a linked accessory, the reader is given the set of build ids that price as the linked row (computed by the domain through `resolveCatalogEquivalent`), never a hand list | 1 migration, `neon-kitchen-defaults-store.ts`, `neon-kitchen-usage-reader.ts`, `kitchen-usage-statements.ts` | S5, M3 | A-9; M3's `item-usage.ts`; `design.ts:170-195` (the settings paths); `0016` (`deleted_by_client_at`) |
| **S6** backup (OQ-13) | Price-book versions, the availability log and the defaults added to the scheduled export | `backup` statement (one file) | S3 | ADR 0012; `apps/web/src/lib/server/backup-designs.ts` (read only; its route is not S's) |
| **S7** the editable read (added 2026-11-08, *R5 split*) | `loadEditable({id, credential})`: a design read under exactly a save's credential (the write-token hash alone, or the owning account), with `isSent`. No DDL. Items and criteria S7-a to S7-f are in *R5 split*, Lane R | `neon-configuration-repository.ts`, `index.ts` | merged only; beside R5a | *R5 split* (S7's row) |

**S5 hand-off to R5** (S5 logic and security reviews, 2026-11-04; inference until R5 reads them; **read by the architect
2026-11-08: where each item lands is tabled in *R5 split*, Lane R**). The port is safe only if the routes do all of
this:
1. The first-open pair is the server's own, taken from the same read that prices the page, never from the request.
   `recordIfAbsent` judges nothing in SQL. With no active version, skip it rather than invent a pair.
2. Both routes authorise the design exactly like a save (write token or owning account), the `GET` included, because
   it performs the first-open write. A share-link viewer or a staff session never reaches either write.
3. Load the design under that authorisation before writing: `0028` has no foreign key.
4. A malformed version id is the store's `invalid-request`; the route shape-checks it or answers 400, never 5xx.
5. Refuse cross-site requests and non-JSON bodies (415), as the save route does. Never serialise an error's cause.

**K2b decisions and gaps** (2026-11-04, K2b developer and QA):
- **Poll bound, not an index.** The changed count is read at most once per 60 s per reader per server instance;
  concurrent polls share one read and a failed read is never kept. The figure is provisional, in
  `changed-count-poll-interval.ts`, for K4's hook. The counter can lag a seen mark by up to 60 s, on another instance
  too; the list's `changedCount` is always fresh. No index migration.
- **The poll does not keep a session alive** (`admitStaffWithoutKeepAlive`); idle expiry, revocation, a password change
  and `contact.read` still apply. K4's hook handles the `401` once the session idles out.
- **A price-store outage opens the kitchen** with the current estimate refused as `INVALID_PRICE_BOOK` on the wire (the
  root's `NO_PRICE_BOOK` state, mapped by `priceAgainstBook`), never a 503. Only a defect is a 503.
- **List parameters:** an empty `onlyChanged` is absent and a repeated one takes the first value, as for `segment`,
  `status` and `page`.
- **The poll's network budget:** its own bucket, not the `read-by-block` bucket pages and design reads share, so an
  office of polling tabs cannot exhaust it. The figure is provisional, the owner's to retune. K4's hook pauses while the
  tab is hidden and never retries a 429.
- **W1 hand-off:** `kitchen-one-route.test.ts`'s "no book is active" case gets its state from the stub stores W1
  replaces; W1 seeds that state explicitly.
- **Unowned gap, new wave W1: wire the production price stores.** `productionPriceStores()` (`price-stores.ts`) still
  returns the stores that answer "unavailable", so production prices nothing although `NeonPriceBookStore` and
  `NeonCatalogueAvailabilityStore` exist. W1 swaps them, keeps `admitted-failure.ts`'s identity check true, and takes
  Full + security review. The kitchen-change store's instance is K2b's.
- **Test-database residue** from the first live runs, committed before the suite's fix: digest rounds `3500-01-01` and
  `3500-01-02` with their entries, and 26 `s4qa-%` accounts. The suite no longer touches those days. Removing them is a
  manual delete, the owner's call.

**S2 and S4 hand-off: the stored change count** (architect, 2026-11-04; ADR 0178's last Amendment). Source-verified at
`m10/s2` @ `c44978ec`. `m10/s4` @ `678c4131` holds the same bytes in the statements, the store, the fake, `0023`, the
helper and every named test except one. Measured with `git diff --stat m10/s2 m10/s4` over every file named here, S4
differs from S2 in exactly three files:
- `dashboard-store-shapes.ts`: 46 lines added;
- `m10-ports.ts`: 8 lines changed;
- `application-role-privileges.test.ts`: 170 lines changed.

*Order.* `countPendingPrices` and the contract case at `price-book-store-contract.ts:941` ("counts a created class and
its rates as one price…") exist only on `m10/u5c`; `rtk proxy grep` finds no `countPendingPrices` on
`m10-price-dashboard` @ `413b3100`. Line numbers here are as committed at `0f40c208`, and will drift, so match each case
by its title.
1. U5c merges into `m10-price-dashboard`.
2. S2 merges `m10-price-dashboard` into `m10/s2`. S2 still does not merge into the dashboard branch: ruling (c)
   stands. Resolve U5c's conflicts as follows:
   - in the fake, keep the count but store it, as in item 5 below;
   - in `m10-ports.ts`, take U5c's wording and correct it, as in item 6 below;
   - in the contract, keep U5c's cases at `:918` ("stores the change summary as the published changes with their
     group ids, and counts them") and `:941`.
3. S2 makes the change below.
4. S4 merges `m10/s2` into `m10/s4`. S4 edits no price-book file. The merge can conflict in the three files S4 already
   changes:
   - `dashboard-store-shapes.ts` and `m10-ports.ts`: keep S4's additions and take S2's count lines;
   - `application-role-privileges.test.ts`: keep S4's arms and take S2's `change_count` in the `price_book_versions`
     arm.

*S2's items:*
1. **`0023_create_price_book_versions.sql`.** Editing it is allowed because it is applied nowhere (ADR 0178's status
   line; ruling (c)).
   - Add `change_count integer not null constraint price_book_versions_change_count_is_a_count check (change_count >= 0)`
     after `change_summary`. It takes **no default**. The bounded check was rejected (ADR 0178's last Amendment).
   - Rewrite the header's "whose length is the version's change count and is stored nowhere else". The count is the
     publisher's confirmed count, computed by the application at publish.
   - The grant's `INSERT` list gains `change_count`.
   - The L1 residual's runbook cross-check gains: "and its `change_count` equals that row's `changeCount`".
2. **`price-book-statements.ts`.**
   - `:68`: replace `jsonb_array_length(v.change_summary) as change_count` with `v.change_count`. The list statement
     must no longer name `change_summary`.
   - `:210`–`:214`: the publish insert's column list and its `select` gain `change_count` and
     `${input.changeCount}::int`. `PublishStatementInput` gains `changeCount`, filled by `statementInputOf`
     (`neon-price-book-store.ts:220`) from `publishable.changeCount`.
   - `:217`: return `change_count`, not `jsonb_array_length(change_summary)`.
   - `:233` is unchanged: it still stamps `v.change_count` from `inserted_version`.
   - `:279`: the seed's insert gains `change_count` with the value `0`.
   - The comments at `:54`, `:149` and `:158` follow.
3. **`dashboard-store-shapes.ts:282`.** Replace `(changeSummary as readonly unknown[]).length` with `countPendingPrices`
   over the same array, imported from `@lemnaria/configurator-domain`. The field's comment at `:247` follows. Both
   stores take the count from here, so the audit pre-check (`neon-price-book-store.ts:198`) and the stored column
   cannot differ.
4. **`append-price-version-for-tests.ts:44`–`:46`.** Insert `change_count` 0 beside `'[]'`.
5. **`fake-price-book-store.ts`.**
   - Hold the count computed at publish on the held version.
   - `listVersions` and the stamp read the held value (on S2 today they read `.length`: `:144`, `:195`, `:231`).
   - This mirrors the column. It cannot be observed under one rule, and it keeps the fake honest if the rule changes.
6. **`m10-ports.ts` `:125`, `:135`, `:215`, `:222`.** Change "its length" / "derived and stored nowhere else" to
   "the prices it holds (`countPendingPrices`), computed by the store at publish and stored with the version".
7. **Tests that pin the old shape.**
   - `application-role-privileges.test.ts:460`–`:484`: add `change_count` to `columns` and to `insertable`; the
     `insertTail` gains `change_count` and `0`.
   - `migration-0023-0025-text.test.ts`: the column text at about `:207`, and the grant text at `:268`.
   - `neon-price-book-store.statements.test.ts` near `:235`, `:283`, `:650`: the list row's `change_count` now comes
     from the column.
   - The live file and `seed-price-book.test.ts`: the seeded version lists `changeCount` 0.
8. **Contract `price-book-store-contract.ts:343`**
   ("records the sequence it inserted and the length of the summary it stored…"). **It must discriminate:**
   - The summary gains a created class and at least one of its rates: `[DEPTH_TO_40, ANCHOR_TO_5000,
     hardware-tier-created X, hardware X perHingeMinor]`, so the length is 4 and the count 3.
   - The forged `changeCount` stays 7, which differs from both.
   - The expected stamp is 3.
   - Rename the case to "…and the count of the prices it stored…".
   - `:918` does not discriminate (length and count are both 3). It may stay as it is.
9. **A new contract case.** For one publish whose summary holds a created class with its rates:
   - `listVersions`' `changeCount` equals the `price-published` audit row's `changeCount`;
   - both equal `countPendingPrices(summary)`.

*Review tier:* Full plus security, as every S wave. Its reading is this block, ADR 0178's last Amendment, and S-b.

**Publish and a deletion that gains a user: S2c, R4a and Q3** (architect, 2026-11-04; ADR 0178, Amendment on a
deletion that gains a user).

*Evidence.* Source-verified at `m10-price-dashboard` @ `cf89af5b` and `m10/s3` @ `69823f43`; the line numbers are as
committed there. The finding is S3's logic review, as relayed.
- The publish CAS (`price-book-statements.ts:194-203`) is moved by no design save.
- A saved tier id is checked for shape only (`design.ts:163-168`).
- A design naming a tier the book does not hold gets no sheet (`named-items.ts:56-63`).

*Why none of this is urgent.* The draft route refuses `item-deleted` (the U5b and U5c notes above), so no deletion can
reach publish until R4a turns deletion on.

*Order.*
1. S3 merges, after the owner's fresh approval of `0029`. Its live tests migrate the shared database.
2. S2c, which reuses S3's predicates.
3. Q3, with the window below. It is independent of S2c and keeps its own dependencies (P4a, R5, T1).
4. **R4a merges its other items with `item-deleted` still refused**, as the draft route refuses it today, so this
   block does not lengthen R4a's path or R4b's (U4a: they ship together). R4a's publish items below land with it.
   **R3 is merged (`ce9f685b`) and is not re-dispatched.** R4a holds R3's publish route and service for those items.
5. **R4c, deletion on** (a gated step of its own, Full plus security), turns `item-deleted` on in the draft route only
   once S2c and Q3 are both merged. Its files are the draft route's readers (`draft-requests.ts`, `draft-address.ts`,
   `web/stored-draft.ts`) and the fetching client's delete; the U5b and M4 hand-offs on deletion are its scope. **(Amended 2026-11-04 by *R4a split*, Lane R: the stored reader and `draft-address.ts` read `item-deleted` from R4a3; R4c removes R4a3's named refusal in `draft-requests.ts` and turns R4a5's delete gate on.)**

*S2c's items* (`m10-price-dashboard`; Full plus security):
1. **One predicate, two users.** Move S3's tier predicate (`countDesignsChoosingTierStatement`) and body predicate
   (`countDesignsPlacingBodiesStatement`) into one shared SQL fragment. S3's count statements and the publish
   statement both use it.
2. **`publishStatement`.**
   - It takes the deleted items: kind, id, and for a linked accessory the build ids the domain computed
     (`buildIdsPricedAs`).
   - A new branch, `in_use`, lists each deleted item that at least one design with `deleted_by_client_at is null` names.
   - `moved_head` gains `and not exists (select 1 from in_use)`.
   - The final select returns `in_use`'s items.
   - A refusal writes nothing, exactly as a stale CAS writes nothing.
3. **The store's answer.**
   - `NeonPriceBookStore.publish` answers `item-in-use {items}` whenever `in_use` is non-empty, before any other
     outcome is read.
   - `m10-ports.ts` gains that outcome. `PublishPriceBookRequest` gains `deletedItems`.
   - The store refuses `invalid-request` when the refs in `deletedItems` differ from `deletedItemsOf(changeSummary)`
     less the rows `createdItemsOf(changeSummary)` creates. So a caller cannot omit a deleted item.
   - This checks the refs. A linked accessory's build ids are the domain's, so the store checks them only this far: it
     refuses an empty set, and a set that lacks the accessory's own `linkedBuildId`, read in SQL from the active
     version's `book`. Any seeded equivalents in the set are the domain's to get right.
4. **The fake.** `FakePriceBookStore` applies the same guard over a usage source of its own: the designs the fake world
   holds. It never consults the `KitchenUsageReader` instance a route is given, so a test that stubs the route's reader
   leaves the store's guard intact.
5. **No DDL.** No migration and no index.

*R4a's items* (for the publish path only; R4a's other items stand):
1. The publish handler reads the stored draft, then counts the deleted items of the active book in the same request
   with `KitchenUsageReader`. A row the same draft created and deleted needs no count.
2. It calls `judgeDeletionsAtPublish` with those counts and the stored D9 defaults (U5c's security hand-off), then
   passes `deletedItems` to the store.
3. Both refusals answer `409 item-in-use {items}`: the domain's, and the store's. The wire already has that answer
   (`price-dashboard-wire-contract.ts:240-245`).
4. The draft route keeps refusing `item-deleted`. R4c turns it on (*Order*, item 5).

*Q3's items.* Q3 holds four P-lane files in a stated window, as it holds `price-book-root.ts` for `NO_TIER_OFFER`:
`pricing/named-items.ts`, `queries/replacements-required.ts`, `pricing/price-design.ts` (the order of the checks only)
and `pricing/earned-accessories.ts`. Review is Full.
1. **A vanished tier is a replacement.** A material or hardware tier the active book does not hold is an item to
   replace. `priceDesign` refuses `REPLACEMENT_REQUIRED` before `selectTier` runs. `replacementsRequired` offers that
   group's active tiers.
2. **A deleted accessory is a removed one.** `removedAccessoriesSince` also reports a linked accessory that the kitchen
   earned under `seenBook` and that `activeBook` no longer states.
3. **The stale comments are corrected:** `named-items.ts:10-11` and `:50-55`, `price-design.ts:167-169` ("passed on
   to `UNKNOWN_TIER`, whatever is switched off"), and `earned-accessories.ts:65-67`.
4. **The sheet row's wording.** The row for a vanished item names it from the code catalogue (a material, a keyed
   class) or from the seen book (a created class). Otherwise it uses one generic line, and it never shows a raw id.
   New copy goes under OQ-11, through T.
5. **Pins that move; QA is told.** `rtk proxy grep -rln UNKNOWN_TIER` finds no surface in `apps/web/src` that branches
   on the code. It finds eight test files:
   - `apps/web/tests/price/p4a-root-prices-under-its-availability.test.ts`;
   - `apps/web/tests/review/qa-8c-refusal-order.adversarial.test.ts`;
   - `apps/web/tests/review/qa-8h-pricing-failure-stays-unseen.adversarial.test.ts`;
   - `packages/configurator-domain/tests/contact/qa-8h-submission-snapshot.adversarial.test.ts`;
   - `packages/configurator-domain/tests/pricing/availability-refusal.test.ts`;
   - `packages/configurator-domain/tests/pricing/qa-p4a-availability.adversarial.test.ts`;
   - `packages/configurator-domain/tests/pricing/price-design.test.ts`;
   - `packages/configurator-domain/tests/pricing/qa-6b-pricing.adversarial.test.ts`.

   Each assertion that `priceDesign` answers `UNKNOWN_TIER` for a design naming an absent tier moves to
   `REPLACEMENT_REQUIRED`. QA sorts the files and lists each one, with its verdict, in its report.

*Acceptance.*
- **S-j (S2c):**
  - **the guard is the authority.** A publish with `deletedItems = [T]`, while a stored design names T, is refused
    `item-in-use {T}`, naming exactly T. The store calls no usage reader, so this holds whatever a route counted;
  - **the build-id check:** a linked accessory sent with an empty build-id set, or with a set lacking its
    `linkedBuildId`, is `invalid-request`;
  - **a refusal writes nothing:** no version, no log row, the head and the draft unchanged, and no audit row;
  - **a design deleted by its client never refuses a publish;**
  - **parity:** over S-e's fixture designs, the guard's verdict for each deletable kind equals S3's count being
    non-zero. A sabotage of the shared fragment turns both red;
  - **must-not:** a refusal never reads back as `availability-changed-meanwhile`;
  - **must-not:** a request whose `deletedItems` omits a deletion its summary holds is ever stored. It is
    `invalid-request`;
  - **must-not:** a migration file changes. `0023`–`0027` are applied, so S-g's checksums hold.
- **R-i (R4a):**
  - **end to end:** the draft deletes T, which is unused. A design then saves naming T, and the publish answers `409
    item-in-use` naming T. One arm saves before the route's count, and the domain refuses. The other saves after the
    count, through a usage reader stub that answers 0, and the store refuses. Neither arm writes anything;
  - **must-not:** a publish body carrying any usage or count member is ever accepted. It is `400`, as a `book` member
    is (R-d);
  - **must-not:** a count read when the page loaded ever reaches the judgement. Asserted by moving usage between the
    page's `GET` and the publish;
  - **R4a merges with deletion still off:** a draft write carrying `item-deleted` is still refused at R4a's merge.
- **R-j (R4c):**
  - **ordering:** no commit on `m10-price-dashboard` lets the draft route accept `item-deleted` while S2c or Q3 is
    unmerged. Checked by reading `git log -p` at R4c's merge;
  - R-i's end-to-end arms run again with deletion on, through the real draft route.
- **Q3-g (Q3; the javascript-testing-expert skill applies):**
  - **property (fast-check):** for any design and any parsed book in which the design's material or hardware tier id
    is absent:
    - `priceDesign` refuses `REPLACEMENT_REQUIRED`, listing that tier, and never `UNKNOWN_TIER`;
    - the options `replacementsRequired` offers for it are exactly that group's active tiers;
    - nothing is preselected;
  - **parity:** the refusal's items and the sheet's rows stay one list, as `named-items.ts` already guarantees for
    disabled items;
  - **in the browser, without publishing:** no browser spec may publish, because a publish moves the active version
    for every spec on the server (the U5c record). So the spec stores a design naming a tier id the seeded book does
    not hold. The save route accepts any shaped id (`design.ts:163-168`), so this is path (ii)'s end state. On open,
    the sheet offers the active tiers, no figure shows anywhere (Q3-a), and the generic failure never appears.
    Choosing a tier shows the price and writes the marker. A vanished material's replacement resets the colour as
    ADR 0057 does for a disabled material (Q5);
  - **the deleting version itself** (a seen book that holds the tier, an active one that does not) is proved by DOM
    and route tests over a fake world holding both versions. Its browser arm waits for the Z gate, as U5c's publish
    paths do;
  - **the contact route** refuses that kitchen (`409 CONTACT_DESIGN_NOT_CURRENT`) and stores no snapshot;
  - **a linked accessory** the kitchen earned, deleted by a later version, shows its info row exactly once, then never
    again after acknowledgement. An accessory the kitchen never earned shows none;
  - **must-not:** a stored design reaches `UNKNOWN_TIER` through `priceDesign`. A sabotage that restores the old order
    turns the property red.

*Reading.* S2c: this block, ADR 0178's Amendment, S-b, S-e, and S3's statements. R4a: this block, plus R4a's own
reading. R4c: this block; the U5b, U5c and M4 hand-offs on deletion; `draft-requests.ts`, `draft-address.ts`. Q3: this
block; ADR 0062's third Amendment, items 2 to 4; P4a-a to P4a-d; and `named-items.ts`. QA and
reviewers of each wave: the same as their implementer, plus the wave's criteria above.

**S acceptance:**

- **S-a:** every live suite is registered in `live-suite-census.test.ts`. Every new table has a privilege arm that is
  **red with nothing granted** and green with exactly the §9.2 grant.
- **S-b (S2; amended 2026-10-26, F3, F7, F10):**
  - publish is all-or-nothing: if the audit insert fails (fault injected), no version row is written and the draft
    row is unchanged;
  - **a racing pair of publishes** at the same `expectedActiveSequence` yields exactly one new version; the other is
    `changed-meanwhile` (the uniqueness of `sequence_number`);
  - `readActive` is the row with the greatest `sequence_number`;
  - **(X0 review M1)** a publish creating *k* items moves the head by *k* (or by 1 when *k* = 0). Each created item's
    latest log row is `active = false`, so the published book prices none of them until an explicit activation;
  - **(M1/M5)** a publish at a stale `expectedAvailabilityRevision` is `availability-changed-meanwhile`, and nothing
    is written (no version, no log row, the draft unchanged);
  - **a racing pair of one publish and one defaults save** at the same `expectedAvailabilityRevision` yields exactly
    one success. **This arm belongs to S3** (it needs `KitchenDefaultsStore`). Until S3 lands, the price-book live file
    skips it with the stated reason "needs KitchenDefaultsStore (S3)", never silently (ruling B, 2026-10-27);
  - **(S2 implementation note, ruled 2026-10-27)** Neon HTTP `sql.transaction([...])` statements cannot read earlier
    results. So publish is one batch that moves the head by `greatest(k, 1)` in a single update and inserts *k* log
    rows at revisions `old + 1 … old + k`. That is **accepted as observably equivalent** to A-17's "chained CTE per
    item", on two conditions:
    - every effect is conditional on the CAS **within one statement**: the head update, the *k* log rows, the
      version insert, the draft reset, **and the audit insert**, as branches of one CTE reading the head update's
      result. A separate unconditional audit statement is **not** acceptable, because a stale publish would then
      leave an audit row with no publish (F3);
    - a CAS that updates no head row writes nothing, and the store answers `availability-changed-meanwhile` from the
      returned row count. A uniqueness failure on `sequence_number` rolls the whole batch back;
  - S-b2's property also holds for publish's log rows: they are contiguous from `old + 1`, each `active = false`;
  - `change_summary` round-trips as the published `DraftChange[]` array (m8);
  - **(S1 QA)** the `price-published` audit row's `sequenceNumber` equals the inserted version's and its
    `changeCount` equals ~~the stored summary's length~~ **(amended 2026-11-04, ADR 0178's last Amendment) the stored
    `change_count`, which is `countPendingPrices(summary)`**. A caller-supplied value for either is impossible by type
    and is overwritten if forced through a cast;
  - **(2026-11-04) the stored change count** (hand-off above):
    - **discrimination:** the arm proving the stamp uses a summary whose length differs from its count (a created
      class plus at least one of its rates). With a summary where the two agree, the arm passes on the old code and
      proves nothing;
    - **agreement:** for one publish, `listVersions`' `changeCount`, the stored `change_count` and the audit row's
      `changeCount` are equal;
    - **property (fast-check, over the fake):** for any summary drawn from every address kind, including created rows
      with and without their creation entry and a created row deleted again, all three equal
      `countPendingPrices(summary)`, are 0 exactly when the summary is empty, and never exceed its length;
    - the seed's version and the test helper's appended version list `changeCount` 0;
    - **must-not:** `jsonb_array_length` appears nowhere in `price-book-statements.ts`, and `listVersionsStatement`'s
      text does not name `change_summary`. Check both with `rtk proxy grep`;
    - **must-not:** `PublishPriceBookRequest` has no count member, proved by a `@ts-expect-error` arm;
    - **must-not:** `0023`'s `change_count` has a default. An insert that omits it fails `not null`;
  - **(S1 QA)** `expectedDraftRevision` is shape-checked like every revision (m6's bounded digit shape). A malformed
    value is `invalid-request` and never reaches SQL;
  - must-not: `UPDATE`, `DELETE` or `TRUNCATE` on `price_book_versions` is held;
  - must-not: `INSERT` on `price_book_draft` or `kitchen_defaults` is held (seeded singletons).
- **S-b1 (S2, the seed; F3):**
  - the seed refuses when any version exists, and leaves the table byte-identical;
  - it records the owner's account id it was given as `published_by_account_id`;
  - it writes no staff audit row.
- **S-b2 (now S2's, ex-S2b; amended 2026-10-26, F1):**
  - an availability write and its audit row commit together or not at all;
  - **(M4)** the audit row's `availabilityRevision` equals the log row's revision written in the same transaction, for
    every write, including both writes of a racing pair;
  - **the log's revision always equals the head revision its statement produced.** A write with a stale
    `expectedRevision` inserts no log row, moves no head and answers `changed-meanwhile`;
  - **a racing pair** of availability writes at one `expectedRevision` yields exactly one log row and a head moved by
    exactly one;
  - **a racing pair of one availability write and one defaults save** (S3) at the same `expectedRevision` yields
    exactly one success. A disable of the item a concurrent defaults save makes the default can never both succeed;
  - `readAt(r)` equals the replay of the log up to `r` for every `r`. This is a property over random change sequences;
  - the migration file contains no `sequence`, `serial` or `trigger`;
  - must-not: `UPDATE` or `DELETE` on `catalogue_availability_changes`, or `INSERT` on the head, is held.
- **S-c0 (S4; K1 QA ruling): seen never moves backwards.**
  - **Ruling 2026-10-27: the effective seen revision is `greatest(seen mark, the latest request's design_revision)`**, so
    a stale first mark below the sent revision never makes an unchanged sent kitchen read as changed. This governs over
    A-12's earlier "the seen mark, else the request's revision" (ADR 0178, Amendment of 2026-10-27);
  - `markSeen(R2)` then a stale `markSeen(R1 < R2)` leaves `seen_revision = R2`, with `seen_by_account_id` and
    `seen_at` from the R2 mark;
  - a racing pair (R1, R2) in either order ends at R2;
  - with a digest entry at R2 and the kitchen at revision R2, the stale R1 mark leaves the kitchen **neither changed
    nor held**. Lowering the seen revision to R1 would wrongly make it both changed (R2 ≠ R1) and held (entry R2 >
    R1);
  - a save to R3 then makes it changed and not held, so it is eligible;
  - the comparison is in SQL; no revision is compared above SQL.
- **S-c (S4; amended 2026-10-26, F9):**
  - `changed_since_seen` is computed only in SQL;
  - `markSeen` with a displayed revision greater than the current one is `displayed-revision-ahead` and writes
    nothing (compared in SQL);
  - `markSeen` on a client-deleted design, or one neither sent nor held by an account, is `not-found`. On an
  account-held unsent design it succeeds, and that design never shows the badge, counts toward the counter, or
  enters the digest;
  - the staff list statements, the count and `listDigestEligible` exclude client-deleted designs;
  - no TypeScript code parses, orders or does arithmetic on a revision (checked with `rtk proxy grep` for `Number(`
    and `BigInt(` near `revision`). **Exemption (2026-10-26):** the fake world's stand-in `aRevisionAfter` in
    `packages/persistence/tests/support/fake-dashboard-world.ts` stands in for SQL `($1::bigint + $2)::text` and is
    excluded from that grep;
  - a seen mark with a stale displayed revision leaves the badge on.
- **S-d (S4; amended 2026-10-26, F6, F7, and the K1-review ruling):**
  - `claimDigestDay` called twice for one day key yields exactly one claim, inserted with `on conflict do nothing`;
  - entries can only be inserted, never updated.
- **S-d1 — what `listDigestEligible($now)`'s SQL restates.** Each clause is checked by reading the statement, and each
  is covered by S-d2:
  - **(a) changed:** `d.revision <> greatest(least(seen.seen_revision, d.revision), latest_sub.design_revision)` (the
    effective-seen `greatest` rule of S-c0, 2026-10-27, replacing the earlier `coalesce`; **clamped** by `least(seen
    mark, current revision)` inside it, a security ruling of 2026-10-27; shape as the coordinator described it, the SQL
    is S4's), where `latest_sub` is
    **exactly one row**, the latest submission for the design (a `lateral … order by created_at desc limit 1`).
    Never a fan-out join over submissions.
  - **(b) held:** `exists` a digest **entry** (not merely a round) for the design with `revision >` the effective seen
    revision from (a), **and only entries with `revision` ≤ the current revision hold** (security ruling 2026-10-27). A
    claimed day with no entries holds nothing.
  - **(c) window:** `d.sent_at > $now - interval '720 hours'`, with the **passed** `$now`. Never SQL `now()`, and never
    `interval '30 days'`.
  - **(d) status:** `coalesce(rs.status, 'new') not in ('offer-sent', 'closed')`.
  - **(e) visibility:** `d.deleted_by_client_at is null and d.sent_at is not null`. S4 reads `designs.sent_at`, the
    first send.
  - **(f) shape:** exactly one row per design. The customer name is `nullif(btrim(a.name), '')`, else the request
    reference.
  - ~~Its results carry `isChangedSinceSeen` and `isDigestedSinceSeen` as booleans, computed in SQL.~~ **Corrected
    2026-10-27 (S4 review): S1's frozen `DigestEligibleKitchen` carries neither flag; SQL filters every clause above, so
    a returned row is already eligible.** The opaque revisions are never compared above SQL (A-12).
  - **Digest rows with neither a name nor a reference are excluded**, so one malformed row never aborts a digest
    (2026-10-27).
- **S-d2 — live parity with the domain** (it runs on `TEST_DATABASE_URL`, alone):
  - over a fixture grid of:
    - changed yes / no;
    - a digest entry absent, at the seen revision, above it, or a claimed day with no entries;
    - `sent_at` at 720 h − 1 ms, exactly 720 h, and 720 h + 1 ms before `$now`, including one pair whose window
      crosses a Europe/Chisinau DST change;
    - status `null` and each of the four;
    - a client-deleted design and an unsent design;
  - membership of `listDigestEligible($now)` equals K1's `isDigestEligible(facts)` for every cell;
  - the test **imports `DIGEST_WINDOW_MS` and `DIGEST_STOPPING_STATUSES` from the domain**, never restating 720 h or
    the two statuses;
  - a sabotage of any one clause (a)–(e) must turn at least one cell red.
- **S-e:** the usage reader and `usesItem` agree on every fixture design, including absent settings counted toward the
  fallback, a per-cabinet colour override, a seeded body earning a linked accessory through its equivalent, and a
  client-deleted design (excluded).
- **S-f (amended 2026-10-26, F2):**
  - the application role reads no personal column of `contact_submissions` in any new statement (ADR 0153 d1),
    checked by the privilege test planning each statement as that role;
  - S4 adds the arm for exactly `SELECT (priced)`: green with the grant, red without;
  - **must-not: any `SELECT` on `contact_submissions` wider than the runbook's existing list plus `priced`.**
- **S-h (S3; amended 2026-10-26, F1; X0 review m2, m3):**
  - the store returns only `changed-meanwhile` and `availability-changed-meanwhile`. A defaults save naming a
    disabled item, or one absent from the active book, is refused **by the service's domain judgement** under the CAS
    (`409 item-unavailable`) before the store is called, and nothing is written;
  - a success returns `{revision, availabilityRevision}`;
  - a save at a stale `expectedAvailabilityRevision` is `availability-changed-meanwhile`;
  - a successful save moves the availability head by exactly one, in its transaction.
- **S-i (S5; amended 2026-10-26, F3, F8):**
  - `recordIfAbsent` never overwrites an existing marker. This is a property: any interleaving of first-opens and
    acknowledgements ends at the last acknowledgement;
  - `recordAcknowledged` refuses a version id that is not in `price_book_versions` (`unknown-version`) and an
    availability revision greater than the head (`revision-ahead`);
  - no audit row is written;
  - must-not: `UPDATE (design_id)` is held.
- **S-g:** every migration file is new. **No applied migration file is edited** (checksums). The runbook text for each
  is in the wave's report.

**QA reading:** the base reading plus `tests/application-role-privileges.test.ts`, `live-suite-census.test.ts` and
`migration-0020-0022-text.test.ts`. QA runs per-package (`cd packages/persistence && pnpm exec vitest run`), alone on
`TEST_DATABASE_URL`.
**Review reading (logic and security):** the base reading plus §9.2 and A-10 to A-13. **(clean-code):** the diff.

### Lane T — Copy (Light)

| Wave | Must-fix items | Prod files | Depends on | Reading |
| --- | --- | --- | --- | --- |
| **T1** all M10 Romanian leaves, with Russian drafts | (1) every NEW COPY string in D1–D10 and C1–C5 [mock L885-899, plus frame text], under namespaces `priceDashboard.*`, `staffChanges.*`, `customerPriceNotice.*`, `replacementSheet.*`, `sentKitchenNote`, `globalSettings.kitchenHandle*`, `priceBreakdown.depthLine` (with an ICU `{percent}`; no figure in copy); (2) RU drafted, marked as an agent draft (ADR 0095 d2), never pinned; (3) the copy lock gains every leaf, marked `Drafted`; (4) the **new** leaf `globalSettings.depthNotePriced` (the C3S sentence, `{percent}`), which nothing renders until Q1 switches to it; the old `depthNote` is left untouched; (5) **not** the two wrong mockup texts (S-15): the stale D4 hint, and "Intră în vigoare când publici" on a **deactivation** dialog. T1 drafts the replacement: deactivation applies immediately (A-17), e.g. "Se aplică imediat." (NEW COPY, under OQ-11). The line stays on price saves, creation and deletion, which do go through publishing (A-18). No RU-tab labels are added (A-21); a created row's form says Russian comes later from the translation feature | `ro.json`, `ru.json`, `ro.d.json.ts` (regenerated), `i18n/content.ts` (if a key path needs a case), the copy-lock file | MP-0 | ADR 0095; ADR 0100 decision 5; ADR 0106 Amendment A (no amount or rule restated in a keyed text); ADR 0141; ADR 0174 O-L3-7 (the precedent for pre-approval); `ro.d.json.ts:1-2` |
| **T3** depth copy follows the owner's "every deeper cabinet" (added 2026-10-26) | RO and RU leaves stop naming "base and tall" only, and keep no figure: `priceBreakdown.depthLineScope` ("dulapurile de bază și coloanele" → e.g. "dulapurile care se adâncesc"); `globalSettings.depthNotePriced` ("scumpește dulapurile de bază și coloanele" → e.g. "scumpește dulapurile care devin mai adânci"); `priceDashboard.rule.scope`; `priceDashboard.rule.hint` (drop the sentence "Dulapurile suspendate rămân la {wallDepthMm} mm și nu se scumpesc" **and its `wallDepthMm` parameter**); `priceDashboard.defaults.depthHint` ("Pentru dulapurile de jos și coloane." is now inaccurate). `priceDashboard.cabinet.depthToggleDisabled` stays: it now applies only to rows that do not deepen (customer-supplied rows), and U3 enables the D3 switch for wall rows (D3D departs from the mockup, recorded). NEW COPY under OQ-11 | `ro.json`, `ru.json`, `ro.d.json.ts`, the copy lock | T1; merged before U2/U3 and with or before MP-3 | A-6 (owner ruling 2026-10-26); ADR 0100 decision 5 (the copy and the coefficient ship together) |
| **T2** retire the old `depthNote` | Delete `globalSettings.depthNote` from RO, RU, the generated declaration and the copy lock, once nothing renders it | the same files | MP-3 | Q1's diff |

**T acceptance:**

- the i18n gates (completeness, ICU) are green;
- no new leaf states an amount, a percentage or "inclus";
- every percentage in copy is an ICU parameter.

**QA reading:** T reading plus `apps/web/tests/i18n/**`. **Review (combined):** ADR 0095 and the mockup copy list.

### Lane R — Web server (Full + security for every wave)

**Base reading:** ADR 0062 seam 1 and its 2026-10-12 note; ADR 0157 d8; backlog 176; ADR 0172 D7–D11; ADR 0173
(every row); `lib/server/staff/staff-admission.ts`, `staff-kitchen-actions.ts`, `staff-responses.ts`;
`lib/server/shipped-price-book.ts`; `price/price-book-root.ts`; this plan §8.4(c)(d).

| Wave | Must-fix items | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **R1** one price-book root (backlog 176) | (1) `lib/server/active-price-book.ts`: read the active version and parse it once per request; (2) the editor, account card, preset preview and contact route all read it with the **current availability** (A-17), and the client receives `{versionId, book, availability}` as a server prop, so no client module names a book; (3) no active version means a refusal everywhere (A-10); (4) dev, test and e2e select the fake store seeded from `SAMPLE_PRICE_BOOK` through a test-only helper, mirroring how `lib/server/repository.ts` selects its store; (5) QA is told which pins move (`qa-m6-wave-b-book-ingress`, `qa-8c-model-purity`) | `active-price-book.ts`, `price-book-root.ts`, `shipped-price-book.ts` (removed or reduced to a re-export), `use-priced-design.ts`, the configurator page's server component. Until P4a lands, `availability` is passed as the empty state; R1 only wires it | S1 | A-10; ADR 0133 (the first server frame is the loaded design; no module store written on the server); ADR 0072 *Decision* 1; `apps/web/src/lib/server/repository.ts`; `app/api/contact/**`; `apps/web/tests/price/qa-m6-wave-b-book-ingress*`, `qa-8c-model-purity*` (read; QA moves them); `apps/web/AGENTS.md` (this Next.js version) |
| **R2** dashboard read and draft API | `GET /api/staff/prices` (active, draft, catalogue facts, usage-free); `PUT …/draft` (changes, expected revision; **the input wire omits `groupId` and `bulk` at compile time only, so R2's runtime request parser strips or refuses both, and a crafted body cannot reach `judgeGroups`, 2026-10-27**); `DELETE …/draft/{change}` (↺); `POST …/bulk` (**acceptance, added 2026-10-26: a bulk percentage that rounds to `-0`, e.g. `Math.round(-0.4)`, becomes 0, or a 0 % bulk change is refused, before the audit entry is built; the audit reader refuses `-0` because jsonb would read it back as 0, so otherwise the write fails closed as a 503**). **The bulk route writes each group's `bulk` metadata (`percent`, scope, `groupCode`) on every change it mints, and R2 adds `bulk` to `DraftChangeWire` in the wire contract (ruling M1-Q1, 2026-10-27). The input wire never carries it, as with `groupId` (m1).** Every one checks `price.edit`, writes its audit row in the same transaction, refuses cross-site and non-JSON, and answers codes from §8.4(d). **The cabinet-list seam (U1 review ruling, 2026-10-26):** when the database read replaces the sample, `apps/web/src/price-dashboard/cabinet-list-source.ts` gets `import "server-only"`; the wire shape sent to the client screen stays minimal (no author e-mails, no internal ids in draft entries); and an unmodified row's pending amount must equal its active one, which the seam asserts  **R2's rulings of 2026-10-27 (Q1 to Q9) are listed under the R table.** | 4 route files, `lib/server/price-dashboard/price-dashboard-service.ts`, `price-dashboard/cabinet-list-source.ts` (mod); R1's seeding helper (Q1) | R1, M1, X2 | M1's `apply-changes.ts`; `app/api/staff/kitchens/[id]/status/route.ts` (the guarded-body and `from` precedent); `lib/server/read-body-with-limit.ts`, `cross-site-request.ts`; ADR 0156 (limiter subjects) |
| **R2b** one revision shape (added 2026-10-27, ruling R2-Q9; Light) | One domain module, `configurator-domain/src/revision-shape.ts`, exports `isRevisionShape`: digits, no leading zero, and at 19 digits `≤ 9223372036854775807` by string comparison, never parsed (m6). The four copies delegate to it: persistence `design-revision.ts`, the seen route's validator (K2a), the dashboard wire validator (R2), and the availability revision shape. A sweep proves the old copies and the new module agree on every boundary (`0`, `1`, 19 nines, `9223372036854775807`, `…808`, 20 digits, a leading zero, a sign, a space) **before** each copy is replaced | the new module, plus four one-line delegations in files whose lanes have merged (windows: S after S4, K after K2b, R) | R2, K2b, S4 | m6; S-18; `design-revision.ts`; §8.4(d) |
| **R3** publish, history, restore | `POST …/publish` (expected draft revision, label, note, provisional flag; the domain judges the candidate book whole first, `judgeBookAgainstCatalog`); `GET …/versions`, `GET …/versions/{id}`; `POST …/versions/{id}/restore`. **Restore acceptance (2026-10-27, M1 logic review):** `restoreChanges(archived, active)` is exact only relative to its second argument. If the draft already edits a field (active 100, draft 120, archived 100) it emits nothing for it and the candidate keeps 120. R3 therefore passes the candidate `apply(active, draft)` and adds reverts where archived equals active, or replaces the draft wholesale; D8C "puts the old prices in the draft" must reproduce archived. **Confirmed 2026-10-27 (ruling U5-Q6):** R3 implements this restore-against-candidate rule **server-side**. U5 did it client-side for its in-memory client only, which is not an authority. Restored values replace pending ones for the same address, as REST's copy says ("dacă unul e deja acolo, valoarea din 2026-10 o înlocuiește"). **Label and note:** the label is required (non-empty after trim, ≤ 80, **counted in code points via `countCharacters`, not UTF-16 units; ruling from U5's QA, 2026-10-27**); **the publish route's version-name rule is the domain text rule: NFC-compose, strip `\p{Cf}`, refuse control, line-separator and lone-surrogate characters (the contact fields' rule, `input-checks.ts` `readTypedText`). U5's in-memory sample client is not an authority: it counts units and neither strips nor composes**; **the note is optional**, and an empty note is accepted (≤ 240), because the frame draws no note field. R3 refuses an empty **label**, never an empty note. **The store stamps `book.version = versionId` on publish (the id is minted inside `publish()`; S2 ruling F1, 2026-10-27); R3 does not stamp** (R-a) | 3 route files, service (mod) | R2, M2 | A-15; M2's `judge-book.ts`; frames D7A–G, D8A–C [mock L871-880]. **Acceptance for R2 and R3 (2026-10-27):** a required test that a non-administrator is refused `price.edit` on **every** dashboard route (the store's actor check is defence in depth only); the route applies the domain text rule (NFC, control and bidi-override characters refused; ADR 0178 F5) to the version label and note, because the store checks only length and NUL; stored drafts and books are untrusted and parsed before use |
| **R4a** availability and the creation and deletion guards (amended 2026-10-26) | (1) `POST /api/staff/prices/availability`: **immediate** (A-17), judged by M3's `judgeAvailabilityChange`, written through `CatalogueAvailabilityStore` with its `catalogue-item-active-changed` audit row, `price.edit`, expected revision, `409 changed-meanwhile`; (2) `GET` usage counts (`KitchenUsageReader`); (3) creation and deletion arrive as draft changes through R2's endpoint; R4a adds their server judgements (M4's `judgeBookAgainstCatalog` link check, and a usage pre-check on delete with its `409`); (4) publish (R3) calls `judgeDeletionsAtPublish` with fresh counts. **R2 review (2026-10-27):** re-putting a change moves it to the end of the draft (X0-4), so once the creation kinds apply, dependants of a moved creation would be refused at older indexes; R4a replaces in place or treats the dependants as new. **Amended 2026-11-04 (ADR 0178, Amendment on a deletion that gains a user):** item (4) counts inside the publish request, never from a page load or the body; R4a holds R3's merged publish route and service for it. R4a merges with `item-deleted` still refused; a gated step, **R4c**, turns it on once S2c and Q3 are merged. Items and criteria R-i and R-j are in Lane S, *Publish and a deletion that gains a user*. **Split 2026-11-04 into R4a1–R4a6 (architect): dispatch the sub-waves, never this row whole. Items, files, order, tiers and criteria are in *R4a split*, below R acceptance** | 2 route files, `lib/server/catalogue-availability.ts`, service (mod); per sub-wave in *R4a split* | R3, M3, M4, S2 (availability, ex-S2b), S3; R4a6 also S2c | A-17, A-18, A-19; frames D4E/F, D5C/D/G, D6C [mock L779-781]; ADR 0062 Amendment 3 and the 2026-10-26 Amendment |
| **R4b** defaults and stamping new kitchens | `GET`/`PUT` defaults (immediate, audited `kitchen-defaults-saved`); the mint and generation pass the saved defaults into H2's request. **U6-a is carried here (ruling 2026-10-27):** after a defaults save, the customer's next **new** kitchen starts with the saved values and an already-saved kitchen is unchanged; U6 cannot meet this alone, since production answers "unavailable" until the defaults route exists. **Ruling 2026-10-27 (H2):** a preset "use a copy" and the seeded mint are creations of a new design, so they are stamped with the new-kitchen defaults too (A-9). They do not go through `generateKitchen`, so R4b reuses the domain's exported `stampedSettingsOf` on those paths. **R4b also judges availability itself** (a disabled tier): the domain checks shape only. **Two criteria (H2 logic review, 2026-10-27):** (a) the depth of a preset copy or the seeded mint changes **only** through `setCabinetDepth`, never by spreading `stampedSettingsOf`'s `cabinetDepthMm` over 600-built geometry (ADR 0089's 80 mm and 31 mm corner intersections, which the validator does not report); test: a preset copy stamped at 700 equals `setCabinetDepth(copy, 700)`. (b) Every design created through the mint, generation, a preset copy or the seeded mint carries **all six** settings keys (material, hardware, depth, colour, handle, top-row handle): `NewKitchenSettings` makes them optional while `KitchenDefaultsWire` requires them. **Split 2026-11-05 into R4b1–R4b4 (architect): dispatch the sub-waves, never this row whole. Items, files, order, tiers, rulings and criteria (including a criterion (c)) are in *R4b split*, below *R4a5 merged*** | 1 route file, service (mod), the mint path; per sub-wave in *R4b split* | R4a (R4a1 only, per *R4a split*, 2026-11-04), H2, S3 | A-9; ADR 0111 (the mint path); `generation/shell-design.ts` (H2's request type, read only); frames D9A–C |
| **R5** customer notice and sent state | `GET /api/designs/{id}/price-notice` (whether to show C1, removed accessories since the acknowledged availability revision, `isSent`); `POST …/price-notice/acknowledge`, authorised exactly like a save (write token or owning account), never moving `revision`. **Split 2026-11-08 into R5a, S7 and R5b (architect), after the implementer stopped on this row: no production notice store, no read of a design under exactly a save's credential, no per-design sent read, and a frozen wire without `isSent`. Dispatch the sub-waves, never this row whole. Items, files, order, tiers, rulings and criteria are in *R5 split*, below *R4b split*** | 2 route files, `lib/server/price-notice.ts`; per sub-wave in *R5 split* | R1, P4b, S5; per sub-wave in *R5 split* | A-11 (the version and availability pair), A-17; P4b's `price-change-notice.ts`, P4a's `replacements.ts`; ADR 0114 (visitor cookie), ADR 0172 D8 (a claimed design on any device); `lib/server/load-owned-design.ts`, `write-token.ts` |

**Rulings of 2026-10-27 on R2's questions:**

- **Q1, the dev and e2e session world:** the seeded fake world (R1's `seedFakePriceStores`) uses **the app's own session
  store**, the one `lib/server/repository.ts` selects, never a private ledger, so a real staff cookie is recorded and
  writes are judged as in production. **R2 fixes it now**, holding R1's seeding helper for that one change after R1
  merges.
- **Q2, an unreadable stored draft:** a recovery path is **required**, because the dashboard exists so the owner never
  needs a developer.
  - `GET` answers a distinct `409 draft-unreadable` (not `503`).
  - R2 adds a **discard-all** write: `DELETE …/draft` with `{expectedDraftRevision, scope: "all"}`. It resets the
    seeded draft row to `[]` **without parsing the stored changes**, so it works on an unreadable draft.
  - It is audited as `price-draft-reverted` with `changeKind: "discard-all"` and `revertedCount` set to ~~the number of
    stored entries~~ **(amended 2026-11-04, ADR 0178's last Amendment, decision 3) `countPendingPrices` over the stored
    draft**, or 0 when unreadable. A bulk group's `revertedCount` uses the same rule. A single revert's stays 1. R2 holds `staff-audit-action.ts` for that one `changeKind` value.
  - **U5b** renders "Renunță la ciornă" on that state.
  - A readable but unapplicable draft keeps healing by revert (accepted).
- **Q3:** `groupId` on the draft wire is **allowed**. It is an opaque id minted per bulk action and needed for group
  revert. U1's "no internal ids" note means database row ids, account ids and author e-mails, which stay excluded.
- **Q4:** a body-based `DELETE` (`DraftRevertRequestWire`, the address in a JSON body) is **accepted** as a recorded
  departure from the row's path-shaped `DELETE …/draft/{change}`. A structured address does not belong in a path, and
  the cross-site guard already requires a JSON body.
- **Q5, buckets (provisional, fail closed, the owner's to retune):**
  - `staff-prices-read-by-account`: 300 per hour, the staff list's figure;
  - `staff-price-draft-by-account`: 600 per hour, shared by `PUT`, `DELETE` and `POST`;
  - events `staff-prices` and `staff-price-draft`;
  - recorded in **ADR 0178** (M10's record), not ADR 0173.
- **Q6, Q7:** see A-14 (bulk scales the candidate; 0 % and no-op bulks are refused).
- **Q8:** the bulk route answers `503` behind an unavailable planner until **M2** delivers it. **R2's bulk acceptance
  is met at M2's merge**, recorded here. The rest of R2 merges first.
- **Q9:** the four copies of the revision-shape check are deduplicated by **R2b** into one domain module (below)

**R acceptance:**

- **R-a (R1):**
  - grepping `apps/web/src` for `SAMPLE_PRICE_BOOK` finds it only in the test-only seeding helper;
  - the editor and the contact route price one request with the same `versionId`;
  - ~~a publish between a customer's load and their send makes the contact route refuse with ADR 0157's book-change
    answer. It never stores a snapshot priced at a book the customer never saw.~~ **Relaxed 2026-10-27 (ruling
    R1-Q2):**
    - a fresh request carries no "seen version", and adding one would put a pricing fact into a request that ADR 0150
      says "holds no price";
    - so a fresh send after a publish **prices at the current book**, and its stored snapshot records that version.
      This is consistent with the owner's ADR 0072 Amendment reasoning: the on-screen total is an estimate, and the
      binding price is fixed at the shop;
    - what stays required: a **retried** stored request id across a book change is `CONTACT_REQUEST_CONFLICT` (ADR 0157
      d8); the snapshot's stored version is the store's `versionId`; the contact digest covers that `versionId`
      (confirmed). RK-6 is updated;
  - **`book.version` equals the store's `versionId` for every stored version.** **The store stamps the minted id on
    publish (the id is minted inside `publish()`; S2 ruling F1, 2026-10-27); the seed and the test appender stamp it too;
    R3 does not.** `readActivePriceBook` refuses a book whose `version` differs from its `versionId`, and projects the
    book onto the declared `PriceBook` fields before sending it to any page, so undeclared stored members never reach
    customers; availability is bounded there too. `priceDesign`'s equality check (`PRICING_VERSION_MISMATCH`) and the digest
    therefore name one identity, never an authored string that could repeat.
- **R-b:** with no active version:
  - the price bar, the account card and D10B's current estimate show no figure;
  - **widened 2026-10-27 (R1 review): with no active book the whole editor (`/d/[id]`) and the share view (`/s/[token]`)
    crash, not only the settings sheet.** `use-top-bar-fit.ts:72` calls `useWholeKitchenTierOffer()` unconditionally and
    there is no `error.tsx`. Q3's `NO_TIER_OFFER` work covers `describeSettingsPill` and the top bar too;
  - **the no-design callback contact form (R1 ruling m-1, 2026-10-27)** prices nothing and does not need a price book;
    only design-targeted contact requests are refused with no book (A-10 applies to pricing);
  - **the editor's settings sheet does not crash** (ruling R1-Q1, 2026-10-27). Today `offerTiersAgainstBook` throws
    `UnreadablePriceBookError` when there is no book. **Unmet at R1's merge, recorded; Q3 closes it**:
    - `offerTiersAgainstBook` answers a named `NO_TIER_OFFER` special case instead of throwing. Q3 holds
      `price-book-root.ts` for this one function, after R1 merges;
    - the sheet's material and hardware groups show one line, "Prețurile nu pot fi afișate acum", with no options,
      no deltas and no default marked;
    - depth, colour and handle still work, and nothing renders 0;
    - the leaf is new copy under OQ-11, requested from T or added under the new-copy permission;
    - this cannot arise in dev, test or e2e (they always seed), and nothing is deployed;
  - the contact route refuses;
  - nothing renders 0.
- **R-c (amended 2026-10-26, F3, F4):**
  - every R2, R3, R4a and R4b write, including each immediate availability change, has exactly one audit row,
    committed **in the same transaction** as the write;
  - if the audit write fails, the change is absent and the answer is `503`;
  - every audit `detail` matches its closed key list (§8.4(e));
  - a test sweeps every route, and no detail contains created-row text, a version label or a note;
  - an operator session (no `price.edit`) gets `403` on every price route and sees no catalogue nav.
- **R-d (amended 2026-10-26, F7, F10):**
  - publish with a stale draft revision, or a stale `expectedActiveSequence`, gives `409 changed-meanwhile`; with a
    stale `expectedAvailabilityRevision`, `409 availability-changed-meanwhile`;
  - **(M5)** a publish whose draft deletes the current D9 default is `409 item-is-default {item}`, including the
    sequence "draft deletes X → defaults save names X → publish", which is tested end to end;
  - **(m4)** a publish request carrying `provisional` is `400`. The published book's flag is the draft's;
  - **a publish request carrying a `book` member is `400`**; the server computes `apply(activeBook, storedDraft)`
    itself;
  - a book the domain refuses is never stored;
  - must-not: any non-staff route serves the draft or an archived version. A sweep of every non-staff route's response
    for the draft's or archive's version id finds none;
  - after publish, the next customer page load prices at the new version.
- **R-h (R2/R4a; F5):**
  - a creation request carrying an id is `400`;
  - the server mints an id of the stated shape, unique against every built-in and keyed id;
  - created text failing the `0021_create_design_notes.sql:15` rule (not NFC, a control or bidi-override character,
    empty after trim) is `400` with M4's code.
- **R-f (R4a), the OQ-2 ruling made testable:**
  - an availability change is visible to the **next** customer price evaluation with no publish;
  - the draft and the active version are byte-identical before and after it;
  - disabling the D9 default, or the last active option, answers `409` with M3's code;
  - enabling a row that is not yet in the active book answers `409`.
- **R-g (R4a):**
  - a contact send for a kitchen using an item disabled after the page loaded is refused (`REPLACEMENT_REQUIRED`);
  - no snapshot is stored for it.
- **R-e (R5; amended 2026-10-26, F3, F8):**
  - acknowledging a notice never changes `designs.revision` (asserted against the store);
  - a share-link (`/s/<token>`) viewer is never shown the notice and cannot write it;
  - a staff open never writes it;
  - **both notice routes mirror the save route's authorisation.** A request without edit-level authorisation is
    refused, the `GET` included. A cross-site request is refused, and a non-JSON body is `415`;
  - **the first open is insert-if-absent**: it never overwrites an acknowledgement;
  - an acknowledgement of a version that does not exist, or of an availability revision above the head, is `400`, and
    nothing is written;
  - no staff audit row is written (F3).
  - **Extended 2026-11-08 by *R5 split*** (criteria R5a-a to R5b-m): the refusal is the byte-identical `404`, a
    cross-site request is refused on both credential arms, and the acknowledgement's shape refusals are named there.

**QA reading:** the base reading plus `apps/web/tests/api/staff/**` and `tests/price/**`. **Review reading:** logic:
§5 and the routes; security: ADR 0019, 0153, 0156, 0161, 0172 D7, 0173; clean-code: the diff.

**R4a split** (architect, 2026-11-04; plan step for R4a at `m10-price-dashboard` @ `41a43566`; nothing run, nothing
built). R4a's row has gathered more than twenty hand-offs. Under `docs/WORKFLOW.md`'s limit (5 items, about 5
production files) it splits into six sub-waves, R4a1 to R4a6. Each one merges alone, and `item-deleted` stays
refused by the draft route through all six. Deletion turns on only at **R4c**, as the block *Publish and a deletion
that gains a user* orders (Lane S, item 5). The row's own items, its R2-review note and its 2026-11-04 Amendment all
stand. This block says which sub-wave delivers each one.

*Evidence.* Where a claim cites source, it was read at `41a43566` (source-verified). The S3 hand-offs (the
`countEach`/`usageProbesFor` port, and the usage route's security bounds) have no line in this plan before this block:
they are the coordinator's relay of S3's reviews in the R4a planning dispatch (2026-11-04). They are checked here
against `m10-ports.ts:331-387`, `item-usage-probes.ts:28-86` and `neon-kitchen-usage-reader.ts:79-146`. Two kinds of
claim are marked **[inf]**: the bucket and deadline figures, and anything about S2c's final diff.

*Where each hand-off lands.* A plan line is cited as L-number at `41a43566`. This block was inserted below them all, so
it does not shift them.

| Hand-off (source) | Lands in |
| --- | --- |
| Row item (1), the availability route; U4b "real switch writes and availability route" (L1471); U4c "judges through `judgeAvailabilityChange`" (L1499); M3 "real signatures" (L1561) | R4a1 |
| "More R4a": `DASHBOARD_CONFLICTS` gains `item-is-fixed-default` and `item-always-present` (L1500); U4a, the same for `item-is-fixed-default` (L1508); M3, the wire gains it (L1561-1563) | R4a1 |
| U4a "R4a reads the defaults itself" (L1508) | R4a1 (server); client side, R4b (R4b2 item 4, per *R4b split*, 2026-11-05) |
| Row item (2), the usage counts; U4b "the usage reader" (L1471); the S3 port, S3 security (relayed) | R4a2 |
| U4b "batching it: today one read per counted material per view" (L1471); S3 security "batching" (relayed); U4c, `409 item-always-present` read as refused (L1499) | R4a5 |
| M4 "the stored-draft reader and draft wire carry the four structural kinds" (L1533); U5b, the revert reader (L1515); U5c, "a created … row is one line without ↺ until R4a" (L1482; its ↺ is a revert target the route refuses today); P6b (a)–(c), renaming (L1503); R2 review X0-4 and M4 `planChange` appends (row L2356, L1536) | R4a3 |
| U4a, creation routes of their own, `createHardwareClass`, the `DraftChangeCreatedWire` reader, the retry after a lost `200` (L1508); U4c `createAccessory`, ids never `new` (L1499); P6, through `applyChanges` (L1504); M4, rates are `hardwareRatesOf(activeBook)`, one id namespace (L1534-1537); row item (3), the link check; R-h (L2450) | R4a4 |
| Row item (4) as amended; the block's R4a items 1–4 (L2076-2083); U5c security, `planPublish` judges deletions (L1501); M4 "publish calls `judgeDeletionsAtPublish`" (L1533-1534); "More R4a", `readPublishPage` given `deletionFacts` (L1500); the S3 port, `deletionFacts` from `usageProbesFor`, `countEach` and the parsed defaults (relayed); R-i (L2126) | R4a6 |
| U4a, the delete refused for use as `400 ITEM_IN_USE`, and `deletionSettlementOf`'s conflict case (L1508); U4a's deletion `it.fails` (`qa-m10-u4a-wire…:104`, pin `:119`); M4, restore with a pending deletion, and reverting a deletion past the 50-accessory cap (L1537-1538); U5c, the `item-is-fixed-default` deletion wording at publish (L1503); U5b, ↺ on an `item-deleted` row (L1515), and U5c's "deleted row … without ↺" (L1482); R-d (M5), the end-to-end "draft deletes X → defaults save names X → publish" (L2441-2442), which also needs R4b | **R4c**, not R4a (deletion is off until then) |
| S5's hand-off | R5, not R4a |

*Which reader takes which structural kind, and from when.* `draft-address.ts` serves the stored-draft reader and the
request readers alike (`stored-draft.ts:36`, `draft-requests.ts:319`). So the stored draft and the draft route are
widened separately, with a named refusal at the request boundary rather than a narrower shared reader:

| Kind | Stored draft (`stored-draft.ts`) | Change (`PUT …/draft`) | Revert (`DELETE …/draft`) | Creation routes |
| --- | --- | --- | --- | --- |
| `hardware-tier-created` | R4a3 | refused, always (the pin at `qa-m10-u4a-wire…:146`) | R4a3 | R4a4 |
| `accessory-created` | R4a3 | refused, always | R4a3 | R4a4 |
| `created-row-text` | R4a3 | R4a3 | R4a3 | — |
| `item-deleted` | R4a3 | refused until R4c | refused until R4c | — |

**Dated amendment (2026-11-04) to item 5 of *Order* in the deletion-race block (L2047-2049).** That item lists
`draft-address.ts` and `web/stored-draft.ts` among R4c's files. They move to R4a3, for two reasons:
- **The first creation would make the draft unreadable.** `stored-draft.ts:36-38` refuses every kind that
  `readAppliedAddress` answers `not-applied`. `isStoredValue` (`:44-46`) refuses a creation's object value and a
  rename's string. So the first creation R4a4 writes would make every later read `draft-unreadable`.
- **R-i could not be met at R4a6.** R-i's arms seed a stored draft holding `item-deleted` while the route still refuses
  one. If the stored reader refused it, publish would answer `draft-unreadable` before judging anything.

What R-j guards is unchanged. The *draft route* accepts no `item-deleted` until S2c and Q3 are both merged. ADR 0178's
decision 3 says "the draft route", so the ADR needs no amendment. R4c's files become `draft-requests.ts`, where it
removes R4a3's named refusal, plus R4a5's client delete gate.

*Sub-waves.* Review tiers follow Lane R's header (Full + security), except R4a5. R4a5 changes no server file, route or
auth path, so it is Full + visual with **no security review** (a recorded downgrade).

A "live in production" in the column below holds only once the Z gate has applied `0023`–`0029` in that environment.
Before that, the Neon stores answer `unavailable`, and every control stays `cannot-judge`.

| Sub-wave | Items (≤ 5) | Production files | Depends on | Tier | Off in production until | Reading |
| --- | --- | --- | --- | --- | --- | --- |
| **R4a1** the stores and the availability write | (1) `PriceStores` gains `defaults: KitchenDefaultsStore` and `usage: KitchenUsageReader`. Production uses `NeonKitchenDefaultsStore` and `NeonKitchenUsageReader`, made on first use as W1 makes its own. Without `DATABASE_URL` it uses stores that answer `unavailable` (OQ-36). The seeded world uses one `FakeKitchenDefaultsStore` over the seed's ledger and availability head, which serves both (it implements both ports). (2) The saved-defaults read: `NONE_SAVED` is `{}`; a saved row is parsed with the domain; a row that does not parse is a `503`, never `{}`. The domain has no parser of stored defaults today: `new-kitchen-settings.ts` exports `stampedSettingsOf` and `copyOfNewKitchenSettings` only (`:64, :74`). So R4a1 adds one beside them, and R4b reuses it, never a second. (3) `POST /api/staff/prices/availability` (row item 1). The order of checks is the draft routes': origin, JSON, body bound, session and `price.edit`, members, the `staff-price-draft-by-account` bucket (shared, ADR 0178 2026-10-27). It then reads the head first and the defaults second, judges with `judgeAvailabilityChange`, and writes through `setActive` with the `catalogue-item-active-changed` row. (4) `DASHBOARD_CONFLICTS` gains `item-is-fixed-default` and `item-always-present`. The pin at `qa-m10-u4a-wire…:358-365` changes with it. (5) The answers: `409` with the domain's word, `409 changed-meanwhile`, `200 AvailabilitySetWire` | `price-stores.ts`, `unavailable-price-stores.ts`, `price-book-test-seed.ts`, `lib/server/catalogue-availability.ts` (new; holds items 2, 3 and 5), the availability route (new), `price-dashboard-wire-contract.ts` (two words), and the domain's `generation/new-kitchen-settings.ts` (the parser). That file is H2's merged file, held for one function as R2b held its files. Seven, stated, with a mini-review per WORKFLOW's rule for going over the limit: the sixth is a two-word edit, the seventh one function | merged only (S3 `869fee4f`, W1 `41a43566`) | Full + security | The switch, everywhere: `UNAVAILABLE_ITEM_LIFECYCLE_CLIENT` stays production's client (`default-item-lifecycle-client.ts:14-16`) until R4a5 | This block; the R4a row; R-c, R-f, R-g; ADR 0178 (A-17, F1, M1, M4; Amendment 2026-10-27, buckets); ADR 0062 Amendment 3; `m10-ports.ts:278-326, 484-528`; `price-stores.ts`; `price-book-test-seed.ts`; domain `item-lifecycle.ts`, `defaults-judgement.ts`; `price-dashboard-service.ts:394-423` (the order of checks); wire contract `:159-245, :430-448` |
| **R4a3** the draft readers and renaming (runs beside R4a1) | (1) The address reader rebuilds the four structural kinds member by member, and the stored-draft reader reads their values: a creation's object, a rename's string. (2) The request boundary keeps a named refusal of `item-deleted` for change and revert (`400 NOT_EDITABLE`, as today), and the change route keeps refusing both creation kinds. (3) `created-row-text` is accepted for change and revert, and judged by `applyChanges` (M4's text rule; R-h's third bullet). (4) `planChange` replaces a creation and its dependants in place, never appending a re-put creation behind them (X0-4). Reverting a creation also removes its dependants (its rates and its text changes), so the draft never holds a rate or a name for a row it no longer creates. (5) `FETCHING_PRICE_DRAFT_CLIENT` sets `acceptsCreatedRowText: true`. Flip `qa-m10-u4a-wire…:178, :262, :275, :297` to `it` and delete the pin at `:305` | `draft-address.ts`, `stored-draft.ts`, `draft-requests.ts`, `draft-plans.ts`, `price-draft-client.ts` | merged only | Full + security | The rename is declared, but nothing in production can reach it: no created row can exist there until R4a4 | This block (both tables); the U5b, P6b, M4 and R2-review hand-offs above; M4's `apply-changes.ts`, `structural-changes.ts`, `draft-structure.ts`; ADR 0178 F5; `0021_create_design_notes.sql:15` (the text rule); `qa-m10-u4a-wire.adversarial.test.ts` |
| **R4a2** the usage read | (1) `POST /api/staff/prices/usage` with `UsageRequestWire` (row item 2). It is a read, and it answers `UsageCountsWire`. It is **not a `GET`**: it carries up to 50 structured refs, which belong in a body, as R2's ruling Q4 accepted for a body-based `DELETE` (a recorded departure from the row). (2) The bounds S3's security review asked for. Every probe is built on the server by `usageProbesFor(items, {catalog: shippedCatalogue(), book: active})`, never from the body; a member other than `items` is `400`. One catalogue built at the default depth serves kitchens of either depth. S3's QA shows the key set and `buildIdsPricedAs` are the same at 600 and 700 (`item-usage-probes.adversarial.test.ts:189-199`), so a 700-deep kitchen is not dropped as unreadable. At most `MAX_USAGE_ITEMS` (50, wire `:451`) distinct items, deduplicated, or `400` naming `items`. The cap bounds the SQL fan-out (`countEach` runs every SQL probe at once, `neon-kitchen-usage-reader.ts:88-95`). It does not bound the walk, which runs once per call over every design (`:125-137`). (3) Its own bucket, `staff-price-usage-by-account`, **fail closed**. It is per account, not per session as relayed: per account is the tighter bound, since one account can open several sessions, and it matches ADR 0178's buckets. Proposed figure: 120 per hour, provisional, the owner's to retune **[inf]**. The scribe records it in ADR 0178. (4) A deadline. Proposed: 10 s **[inf]**, within the platform's function limit. Past it the route answers `503` with no partial counts. (5) No audit row per read (wire `:453-456`). `unreadableDesigns` is logged as a bare count when above 0, and not sent (the wire has no member for it) | the usage route (new), `lib/server/price-dashboard/item-usage-read.ts` (new; items 2 and 4, and reused by R4a6), `limit-policy.ts`, `judge-account-request.ts`, `account-log.ts` (the event) | R4a1 (`PriceStores.usage`) | Full + security | Counts, everywhere: nothing in production calls the route until R4a5 | This block; S3's port and security hand-offs (relayed) with `m10-ports.ts:331-387`, `item-usage-probes.ts`, `neon-kitchen-usage-reader.ts`; ADR 0156 (subjects); ADR 0178 (2026-10-27 buckets; OQ-34); `judge-account-request.ts:82, 209-211`; `limit-policy.ts:575, 666, 785`; wire `:450-469` |
| **R4a4** creation (runs beside R4a2) | (1) `POST /api/staff/prices/draft/hardware-class` with `CreateHardwareClassRequestWire`. In one draft write it puts the creation and a rate change for exactly the fields `hardwareRatesOf(activeBook)` returns, through `applyChanges` (P6: `ZERO`, `CREATED_TIER_RATES_MISSING`), never re-judged by hand. It writes one `price-draft-changed` row with the creation's `changeKind`. (2) `POST /api/staff/prices/draft/accessory` with `CreateAccessoryRequestWire` (A-19). The link is judged by `judgeBookAgainstCatalog` over the candidate (row item 3). (3) The server mints the id (R-h). A request naming one is `400`. Ids come from one namespace across kinds, of the shape `identifier-shape.ts` accepts, never `new`, and unique against every built-in and keyed id, the active book and the draft. They come from a random source, never from the name or a counter, so an id a past version held is not issued again **[inf: falsified by a minted id equal to one an earlier stored version's book states]**. (4) A lost `200` cannot create a second row. The request names `expectedDraftRevision`, so replaying it after a success is `409 changed-meanwhile`; the client never resends a creation by itself. (5) `createHardwareClass` and `createAccessory` on `FETCHING_PRICE_DRAFT_CLIENT`, with a reader for `DraftChangeCreatedWire`. Flip `qa-m10-u4a-wire…:137` | two route files (new), `lib/server/price-dashboard/created-ids.ts` (new), `price-dashboard-service.ts` (the two writes, inside `runDraftWrite`), `price-draft-client.ts`, `price-dashboard-wire-reading.ts`. Six, stated, with a mini-review | R4a3 | Full + security + visual (the first browser creation: U4c, L1492) | Create goes live in production at this merge, and the rename with it. A created row starts switched off (A-17), and its switch stays off until R4a5. Publishing a created class blanks the deltas until Q3 (M4, L1539): a recorded interim, since nothing deploys mid-milestone | This block; the U4a, U4c, P6 and M4 hand-offs above; R-h; ADR 0178 F5; wire `:250-304`; M4's `structural-changes.ts:82` (`hardwareRatesOf`); `identifier-shape.ts`; `price-dashboard-service.ts:304-423` |
| **R4a5** the lifecycle client: switches and counts in production | (1) A fetching `ItemLifecycleClient`. `setActive` goes to R4a1's route: `409` with an `AvailabilityRefusalCode` (`item-always-present` included) is `refused`, `409 changed-meanwhile` is `conflict`, `401` is `session-ended`, anything else is `failed`. `readUsage` goes to R4a2's route. `readAvailability` comes from the dashboard state's `availability`. (2) `defaultItemLifecycleClient` gives production the fetching client. (3) **The delete gate is separated from `canWrite`.** Today `deleteStandOf` opens Delete wherever `canWrite` holds (`item-lifecycle-model.ts:127-136`). So until R4c, Delete of a row the active book states stays off with `cannot-judge` in production, **whatever R4b later makes readable**. Delete of a draft-created row (a revert of its creation) is on. (4) Batching: `use-material-usage.ts` and `use-item-availability.ts` ask once per view for every item they count, in chunks of at most 50. This reverses U4b's one-material-at-a-time choice (its header, `:16-19`), as S3's security review asked. One failed read now leaves every count of that request unknown | `fetching-item-lifecycle-client.ts` (new), `default-item-lifecycle-client.ts`, `item-lifecycle-model.ts`, `use-material-usage.ts`, `use-item-availability.ts` | R4a1, R4a2 | Full + visual (no security: recorded above) | Switch-on is live in production. Switch-off stays `cannot-judge` until R4b's `GET` defaults makes the client's `defaults` known (`item-lifecycle-model.ts:97`). Delete of a stated row stays off until R4c | This block; the U4a, U4b, U4c records (L1466-1471, L1487-1493, L1505-1511); RK-18; frames D4E/F, D5C/D/G, D6C; `item-lifecycle-client.ts`; `item-lifecycle-model.ts`; `browser-and-visual-qa.md` |
| **R4a6** publish judges deletions in the request (runs beside R4a5, once S2c is merged) | (1) The publish handler reads the stored draft and takes the deleted items of the active book (S2c's `deletedBookItemsOf`). It counts them in that request through R4a2's `item-usage-read.ts`. The probes' basis is the **active** book, never the candidate: in the candidate, a deleted linked accessory has no rule, so `accessoryProbe` answers `buildIds: []` and the count reads 0 (`item-usage-probes.ts:64-73`). (2) `judgeDeletionsAtPublish({changes, usage, book: active, defaults})`, with R4a1's defaults read (unparseable means `503`). A default code (fixed or saved) answers `409 item-is-default {item}`, wire `:234-238`, and use answers `409 item-in-use {items}`. Any other refusal is never an allowance: the publish writes nothing. (3) `deletedItems` goes to the store, with each linked accessory's build ids taken from the same probes. The store's `item-in-use` maps to the same `409`. Whichever of S2c and R4a6 merges second keeps the mapping single. (4) `readPublishPage` is given `deletionFacts`, built by the same module (counts and defaults, no audit row, no bucket), so the page's `blocked` is reachable. A page's counts are for display only (R-i). A render may not write, so it spends no bucket. Its bound is what it asks: only the draft's deleted items that are deletable and that the book states, with SQL probes only (never the walk), under R4a2's deadline. That this read is unbucketed is an accepted residual. (5) The draft route still refuses `item-deleted`: R-i's last bullet, asserted at this merge | `publish-plan.ts`, `price-dashboard-service.ts` (`performPublish`, `answerOfPublish`), `lib/server/price-dashboard/deletion-facts.ts` (new), `price-dashboard/publish-source.ts` | R4a1, R4a2, R4a3; R4a4 (it holds the service file first); **S2c merged** | Full + security | Nothing becomes reachable: no draft in production can hold a deletion until R4c | The deletion-race block (all of it); ADR 0178 Amendment on a deletion that gains a user; R-d, R-i; U5c's security hand-off; `publish-plan.ts`; `publish-deletions.ts` (web and domain); `publish-source.ts`; S2c's merged `m10-ports.ts` and `draft-structure.ts` |

*Order and parallelism (at most two at once).* Each pair below has disjoint production files.
1. **R4a1 ∥ R4a3.**
2. **R4a2 ∥ R4a4.**
3. **R4a5 ∥ R4a6.** If S2c is late, R4a5 runs alone and R4a6 follows. R4b may take the freed slot: R4b's dependency
   on R4a is R4a1, which wires the defaults store and the server-side availability judgement. The rest is not R4b's
   need, so this split does not lengthen R4b's path (the deletion-race block, *Order*, item 4).

One test file is shared: `qa-m10-u4a-wire.adversarial.test.ts`. R4a1 owns its `:358-365` block, R4a3 the
`:163-313` blocks and R4a4 the `:135-161` block. The second merge of a pair resolves the file. The `:102-133`
block stays R4c's.

*S2c's relation.*
- **Only R4a6 waits for S2c.** `deletedItems`, the `item-in-use` outcome and `deletedBookItemsOf` are S2c's port and
  domain changes. They are in its worktree, uncommitted, at the time of writing (`m10-ports.ts` and `draft-structure.ts`
  in `.claude/worktrees/m10-s2c`). R-i's second arm, the store refusing after a stubbed count of 0, needs S2c's guard.
- **No other sub-wave waits.**
- **One coordination point.** `deletedItems` is a required member. So S2c's merge cannot compile the web app unless
  `performPublish` passes it and `answerOfPublish` maps `item-in-use`. `answerOfPublish` passes `result.kind` to
  `dashboardConflictResponse`, and `item-in-use` is not a conflict word (`price-dashboard-service.ts:556-568`). S2c's
  file list (L1913) names no web file. **[inf]** Its merge will therefore touch `price-dashboard-service.ts`, which
  R4a4 also holds.
- Recommendation: S2c makes that minimal edit (pass the deletions the domain computes, and map `item-in-use` to the
  existing `409`) and merges **before or after R4a4, never while R4a4 is in QA or review**. R4a6 keeps the in-request
  count and the domain judgement in either case.

*Migrations.* **None, and no owner approval is needed.**
- Audit actions are only shape-checked (`0020_create_staff_audit_events.sql:63`).
- Every new audit row reuses an existing action: `catalogue-item-active-changed`, and `price-draft-changed` with a
  structural `changeKind`. The `changeKind` lives in the `detail` jsonb (`dashboard-audit-action.ts:118`).
- Limiter bucket keys are stored as SHA-256 digests (`0007_create_rate_limit_counters.sql:22`).
- No sub-wave adds a table, column, index or grant.
- If a sub-wave finds it needs one, it stops and returns to planning.

*Contradictions among the hand-offs, and how each is settled.*
- **A creation through R2's endpoint (row item 3, 2026-10-26) or its own route (U4a, 2026-11-03).** Own routes. The
  wire contract already gives the creations requests of their own (`:250-253, :283-298`). U4a recorded the same ruling.
- **The delete pre-check: `409` (row item 3) or `400 ITEM_IN_USE` (U4a, later).** A draft write answers
  `400 ITEM_IN_USE`, the wire's code (`:96`), which the client maps (`item-flows.ts:189`). A publish answers
  `409 item-in-use {items}`. The pre-check is R4c's, since deletion is off.
- **"Three deferred tests go red when R4a delivers" (U4a, L1508) and "the three `it.fails` flip" (P6b, L1503).** They
  name different tests, and the deletion-race block keeps deletion off. Each one now has an owner:
  - `:137`, R4a4;
  - `:178`, R4a3;
  - `:262`, `:275` and `:297`, R4a3, which also deletes the pin at `:305`;
  - `:104` and its pin `:119`, R4c.
- **The R4c files listed at L2048 against what R4a6's criteria need.** Settled by the dated amendment above.
- **"Usage counts by `GET`" (row item 2) against a body-shaped `UsageRequestWire`.** `POST`, as a recorded departure
  (R4a2, item 1).
- **"Asked one material at a time" (U4b, `use-material-usage.ts:16-19`) against "batching" (S3 security).**
  Batching. The bound on the walk outranks keeping the other counts when one fails, and a failed count is still never
  a number.
- **A per-session limit (S3 security, relayed) against per-account buckets (ADR 0178, 2026-10-27).** Per account,
  which is the tighter of the two (R4a2, item 3).
- **"The wire gains `item-is-fixed-default` in … `m10-ports.ts`" (M3, L1562-1563).** No port change. The availability
  store never answers a domain word: the domain judges before the call (`m10-ports.ts:518-522`). The word goes in the
  wire contract only.
- **R-g's "refused (`REPLACEMENT_REQUIRED`)" against P4a's ruling (L1448).** Both hold. The pricing refusal is
  `REPLACEMENT_REQUIRED`, and the route's answer is `409 CONTACT_DESIGN_NOT_CURRENT`.

*Acceptance.* R-c, R-f, R-g, R-h and R-i apply as listed, with these bullets added.
- **R4a1 (R-c, R-f, R-g):**
  - R-f in full: the next customer evaluation sees an availability change with no publish; the draft and the active
    version are byte-identical; disabling the D9 default or the last option answers `409` with M3's code; enabling a
    row the active book does not hold answers `409 item-not-in-active-book`;
  - **must-not:** the D9 default is switched off when the stored defaults do not parse. It is `503`, never judged
    against `{}`;
  - **must-not:** a defaults save landing between the route's reads lets the newly saved default be switched off.
    Tested by saving between the head read and the defaults read;
  - **R-g, end to end:** load a design, switch off an item it uses through this route, then send. The send is refused
    with the existing `409`, and no snapshot is stored;
  - **R-c:** one audit row per write, in the same transaction. An audit failure gives `503` and the change is absent.
    An operator session gets `403`;
  - `CI=1` production wiring: with no `DATABASE_URL` both new members are the unavailable stores. With one, they are
    made once per process. `selectPriceStores`' existing matrix holds;
  - QA's property (the `javascript-testing-expert` skill applies): for any availability state and any item,
    the route's answer word equals `judgeAvailabilityChange`'s verdict. **(Amended 2026-11-05, coordinator.)** The
    exception is a no-op: a request whose `active` equals the item's current state. It answers
    `200 {revision: head}` and writes nothing, whatever its `expectedRevision`. The bucket is spent first, an unstated
    item is never a no-op, and the no-op holds only when the head is unmoved across the book read. One consequence is
    pinned: an item that is already off and is a default answers `200` to a no-op switch-off, where the domain would
    say `item-is-default`. That is true of the state and writes nothing.
- **R4a2:**
  - **must-not:** the body supplies any probe fact (`buildIds`, `isFallback`, a predicate). The only member is
    `items`;
  - 51 distinct items is `400`. 50 is answered. A duplicate item is counted once and answered once;
  - **must-not:** a count is answered as `0` past the deadline or after a failed walk. It is `503` with no counts.
    Sabotage: let the reader resolve after the deadline, and the suite must go red if any count is sent;
  - the bucket fails closed when the limiter store is down. No audit row is written per read;
  - a `price.edit`-less session gets `403` and spends nothing.
- **R4a3:**
  - every row of the kind × reader table holds as written, each cell by its own test;
  - after the merge the change route still refuses `item-deleted` and both creation kinds (pins `:119` and `:146`
    green);
  - **property (fast-check):** for any draft holding a creation with its rates and text, re-putting the creation
    leaves every dependant applicable. `applyChanges` accepts the draft, and the creation's index stays before every
    dependant's;
  - reverting a creation leaves no change naming its id;
  - created-row text that fails the `0021` text rule is `400` with M4's code (R-h).
- **R4a4:**
  - R-h's first two bullets;
  - a minted id is never `new`, never an id of another kind's namespace, and never a built-in or keyed id. A
    property over many mints shows no repeats;
  - **must-not:** a replay of a creation request after its `200` creates a second row. It is `409 changed-meanwhile`,
    and the draft holds exactly one creation;
  - a created class's rates are exactly `hardwareRatesOf(activeBook)`, and a zero push-runner rate is refused
    `ZERO`;
  - in a browser under `next dev` and `CI=1`, a class and an accessory are created and renamed. The spec takes the
    draft lock (`support/price-draft-lock.ts`) and publishes nothing.
- **R4a5:**
  - **must-not:** in a production build, Delete of a row the active book states is offered before R4c. Asserted
    with defaults made readable, so R4b's merge cannot open it;
  - **must-not:** a failed or late usage read shows as `0` kitchens. The dialog says nothing of a number it lacks
    (RK-18);
  - one usage request per view: a screen that counts *k* ≤ 50 items sends exactly one request;
  - `409 item-always-present` reads as `refused` (U4c);
  - browser: switch-on round trip, a switch surviving a reload (never reached before, U4a record, L1506), and the
    D5E/D5F counts on a seeded world. That world's fake usage reader counts
    only planted designs, so the browser shows 0 for every item. Non-zero counts are proved by DOM tests over
    planted designs, and in the browser at the Z gate (recorded residual).
- **R4a6:** R-i in full, plus:
  - **must-not:** the usage basis is the candidate book. Sabotage: pass the candidate, and a deleted linked
    accessory's arm goes red;
  - publish asks only `settings-tier` and `placed-bodies` probes, and never starts the walk. A test fails if a
    `migrated-design` probe reaches the reader at publish;
  - a draft that creates and deletes the same row asks no count for it;
  - the M5 arm of R-d: a draft deleting the saved D9 default answers `409 item-is-default {item}`, with defaults
    seeded in the store. The end-to-end sequence through a defaults save is R4c's, after R4b.

*R4c's scope, as this split leaves it.*
1. `draft-requests.ts` accepts `item-deleted`, as a change and as a revert, with a draft-write pre-check: defaults,
   then `400 ITEM_IN_USE` on a count from R4a2's module.
2. R4a5's delete gate turns on, and `deletionSettlementOf`'s conflict case keeps the dialog open on its old facts.
3. M4's two deletion edges: restore with a pending deletion, and a revert of a deletion that passes the
   50-accessory cap.
4. U5c's `item-is-fixed-default` wording at publish (new copy under OQ-11).
5. The `:104` flip and the `:119` pin deletion, with R-j and R-d's end-to-end sequence (after R4b).

That is the 5-item limit. R4c's own plan may split it.
**(Amended 2026-11-09, architect: split into R4c1, R4c2 and R4c3, with the files corrected (`draft-plans.ts` and `deletion-facts.ts` join; the pre-check is a new module). See *Q5 split and R4c plan*, Lane Q.)**

*Risks and residuals.*
- **The walk keeps running after the deadline.** `countEach` takes no cancellation signal (`m10-ports.ts:376-378`),
  so a `503` at the deadline frees the request but not the database work. The per-account bucket bounds how often
  this can happen.
- **Recommended follow-up for that.** An S-lane change adds an optional `AbortSignal` to `countEach`, checked between
  pages (`neon-kitchen-usage-reader.ts:130-136`). It touches persistence files, so it is not R's. It is the
  coordinator's to queue.
- **Usage counts silently leave some designs out.** They are of the designs the walk could read, and the screens do
  not say so (`unreadableDesigns` is logged only). Deletions are never judged by such a count. Copy for it would be
  new copy under OQ-11.
- **RK-18 becomes reachable at R4a5.** An accidental switch-off reaches customers at once. The mitigations are
  RK-18's own.
- **S2c's merge touches the service** (*S2c's relation* above). It must not merge mid-QA of R4a4.

*Verification, per sub-wave.*
- Route tests over the fake world (`tests/support/price-dashboard-world`).
- The `qa-m10-u4a-wire` flips, each in the commit that keeps its promise.
- `pnpm check` on the merge, and `pnpm ci:local` before any push.
- Browser runs for R4a4 and R4a5 under `next dev` and `CI=1`. None publishes (the U5c record).
- Live Postgres arms only where a Neon store is new to a route (R4a1's production wiring). S3's live suites already
  hold the reader and the defaults store.

*Reading, QA and reviewers.*
- **QA of each sub-wave:** its row's Reading, plus that sub-wave's acceptance bullets above, `apps/web/tests/api/staff/**`,
  and `tests/app/api/staff/qa-m10-u4a-wire.adversarial.test.ts`. R4a5's QA adds `tests/e2e/hardware*.spec.ts`,
  `materials*.spec.ts` and `accessories*.spec.ts`.
- **Logic review:** the row's Reading, plus §5 A-17 to A-19. No DEVELOPMENT-SPEC section applies (no geometry).
- **Security review (not R4a5):** the row's Reading, plus ADR 0019, 0156, 0172 D7, 0173, and S3's security hand-off
  (relayed).
- **Clean-code review:** the diff, `engineering-conventions.md`, and `price-dashboard-service.ts`'s header (the order of
  checks every route keeps).
- **Visual review (R4a4, R4a5):** the frames named in R4a5's row, and `browser-and-visual-qa.md`.

**S2c and K3 merged; decisions and hand-offs** (coordinator, 2026-11-05).

The decisions and hand-offs below were recorded at merge. Each one was ruled in the wave's dispatch or found in its review.

*S2c* (merged at `m10-price-dashboard`; QA green; logic, clean-code and security reviewed in two rounds). Decisions:
- The required deletions are those of rows the draft did not itself create. `deletedBookItemsOf` exports them once, in
  draft order.
- A stale request is judged against the version at `expectedActiveSequence`, which is the book the plan was built from.
  It is never judged against the newest book. A stale request that this book contradicts answers `changed-meanwhile`.
  `isFallback` is read from that same book, which departs from the wording of the earlier ruling ("the active book's
  `defaultTierId`"). On a fresh request it is the same book.
- The answer order is:
  1. the shape check;
  2. `not-recorded`;
  3. contradicted by the plan's book (`invalid-request`, or `changed-meanwhile` if stale);
  4. `item-in-use`;
  5. the compare-and-set refusals.

  The logic review recorded one refinement and left it open: answer `changed-meanwhile` ahead of `item-in-use` when the
  *draft* revision or sequence is stale. The contract arm that pins the current order would change with it.
- A creation whose id the running book already states is refused at the change with `NOT_EDITABLE`. The publish
  statement refuses it again (`restated_creations`). This closes create-then-delete of a used row.
- An active book that links an accessory to a row the build no longer ships is refused as unreadable by
  `readDashboardState`. Every dashboard write then answers `503`, which fails closed. This is an accepted residual;
  `judge-book.ts` never lets a publish create such a book.
- A design saved after the statement's snapshot is unseen. This is inherent (ADR 0178).

S2c's hand-offs:
- **R4a6:** pass `plan.deletedItems` unchanged to the store. One builder serves both the in-request count and the
  guard. Do not rebuild the build ids from `accessoryProbe`, because it drops the rule's own `linkedBuildId` when the
  catalogue no longer prices it, and the store then answers `invalid-request`. This supersedes item (3)'s wording
  "taken from the same probes" in the R4a6 row.
- **R4a6 (optional hardening, security N4):** tie `createdItems` to `createdItemsOf(changeSummary)` in
  `storablePublishOf`, as `deletedItems` is tied. Today no route can reach the gap.
- **Whichever of S2c and R4a1 merges second:** `price-book-test-seed.ts` builds one `FakeHeldDesigns` and hands it to
  both the price book and the fake usage reader. In the seeded app the guard and the counts must see the same designs.
- **Q3 and R4c:** no route-level test publishes a stored draft that really deletes an item. The draft route refuses
  `item-deleted` until R4c, which owns that test.
- **Unverified until preview has `0023`–`0029`:** the application-role planning arm for the publish statement. It
  skipped because preview is at ledger 22. Security review read the grants and expects no new grant. The runbook's M10
  section should say that publish now reads `designs`.

*K3* (merged; QA green; Light combined review approved; visual verified at 390 and desktop). Decisions:
- The "Văzută … modificată din nou" sub-line shows only when `updatedAt` is strictly after `seenAt`. An instant after the
  read time is written as the read time.
- A kitchen with no cabinets gets current estimate `{ empty: true }` and the leaf `staffChanges.estimateEmpty`. It never
  gets a priced zero.
- The client accepts only `PriceBookCurrency` values, through the domain's `isPriceBookCurrency`.

*R4a1* (ruled in its dispatch; not yet merged):
- A switch to the state an item is already in answers `200 {revision: head}` and writes nothing, whatever its
  `expectedRevision`. The bucket is spent first, and an unstated item is never a no-op. The owner may overturn this
  ruling.
- R4a2's dispatch carries over to it the duplicate `itemIdOf` in persistence (`dashboard-store-shapes.ts`).
- Queued for a later wave: `readDashboardAvailability` (`dashboard-state.ts:78`) does not check the revision's shape.
  A malformed revision from a store would read as a permanent `changed-meanwhile` instead of a `503`. Neither store can
  produce one today.

*R4a3*. These were ruled in QA and review on 2026-11-05.
- A revert names a change the draft holds, or it answers `400 UNKNOWN_ADDRESS`. The creation's own address counts as
  held.
- A revert that names a field of an item the draft deletes answers `400 NOT_EDITABLE`.
- The audit row of a revert names the change that actually left, with the real `revertedCount`.
- Every kind's `field` comes from its closed list, which reverses the round-1 allowance for tier and accessory fields.
  The trade is intended. A stored change at a field outside its list makes the whole draft `draft-unreadable`, and
  discard-all heals it. So a release that removes a field from a list must migrate stored drafts.
- `planChanges` names the audit row after its first change. R4a4 passes the creation first.

*Hand-offs to R4a4, to settle before its visual review:*
- **D7's ↺ on a created row's field lines.** An accessory creation carries its `perUnitMinor` inside the creation, so
  the price line's ↺ names an address the draft does not hold, and the request answers `400`. Reverting a created
  class's rate removes the whole class, which is the domain rule: every rate is owed.
  - Fold a created row's field lines under its row, as `stale-draft.ts:85-94` does, or offer no ↺ on them.
  - The row's own ↺ reverts the creation address (`publish-model.ts:224, :399`).
- **The client half of U5c's hand-off** (`stale-draft.ts`). The created row's line gets a ↺ that reverts the creation.
  A deleted row's line stays without one until R4c.
- **The multi-change planner.** R4a3 exports a planner that puts a creation plus its rates in one write, judged once.
  R4a4 uses it and does not write a second one.
- **The shared-file note above** names `qa-m10-u4a-wire` only. R4a3 also flipped `qa-m10-u4c-wire`'s revert and rename
  `it.fails`. Its `createAccessory` `it.fails` and pin stay R4a4's.

*R4a2* (merged; QA green; logic, clean-code and security reviewed in two rounds):
- **Limits.** The bucket `staff-price-usage-by-account` allows 120 in a fixed UTC hour, and a burst may spend them at
  once. The deadline is 10 s. Both figures are provisional and the owner's to retune; the scribe records them in ADR
  0178.
- **The deadline covers the whole request**: the stores, the book read and the count. At the deadline the walk and the
  SQL fan-out stop, and retries stop too. Statements already issued still run to completion.
- **One usage read in flight per account, per process.** A second concurrent read answers `429` with `Retry-After: 10`.
- **Unstated refs.** A tier or linked accessory that the given book does not state reads `0` and is never probed. This
  departs from `usesItem`, which counts a design naming a dropped tier. It is a recorded ruling, and it means callers
  must ask about items of the same book. It also means made-up refs cost no scan.
- **The log.** The account log gains `{event: "staff-price-usage", unreadableDesigns}`, an integer only. The scribe
  records this extension of the closed list in ADR 0172.

R4a2's hand-offs:
- **R4a6:**
  - Build the probes once with `usageProbesFor(deleted, {catalog, book: active})`, against the active book and never the
    candidate.
  - Count them with `countUsageProbes`, in chunks of at most 50, since a draft can delete about 88 items.
  - Read each linked accessory's `buildIds` from those same probes.
  - Assert that no `migrated-design` probe is present.
  - Optionally, tie `createdItems` to the summary (security N4, above).
- **R4a5:**
  - Match usage answers by item, never by position.
  - Never show a count for an item the current book does not state. A stale screen after another publish would read a
    false `0`.
  - The client keeps one usage read in flight: it joins a read that is already running, or retries a busy `429` after
    `Retry-After`. Otherwise strict-mode double effects and overlapping views get `429` and show counts as unknown.
  - Add a test that two concurrent views both end up counted.

*R4a4* (in review). Rulings:
- A rate outside `hardwareRatesOf(book)` answers `400 NOT_EDITABLE`.
- A creation on a stale draft answers `409 candidate-refused`, for both kinds.
- Row-identity members are refused before the bucket.
- One words reader serves creation and rename. R-h judges the text as sent, and the draft stores it trimmed.
- `\p{Cf}` is refused inside names.
- D7 offers no ↺ on a deleted row.
- Residual: the 21st class or 51st accessory answers `409 candidate-refused`. A named `LIMIT_REACHED` code is queued as a small wave of its own.

R4a4 hands to R4c:
- **Turn the deleted row's ↺ back on** in D7 and in the stale-draft list once the revert route accepts `item-deleted`. QA's `it.fails` will mark when.
- **One book for a creation's rates.** `ratesOf` and `incompleteCreationIndexes` take the rate list from the active book. `prepareTierCreation` takes the starting rates from the running candidate. Once deletions are accepted, a draft that deletes every class carrying some rate could make creation impossible.

R4a6 hands to R4c (its logic and security reviews, 2026-11-05):
- **The word for a fixed default.**
  - Today the route answers `candidate-refused`, because the candidate judgement runs first and `refuseTierDeletion` gives `ITEM_IS_DEFAULT`. So `answerOfRefusals`' `item-is-fixed-default` branch is dead at the route, while the page's `blockOf` shows is-default.
  - Settle the word with U5c's `item-is-fixed-default`.
  - Once the draft route accepts deletions, `applyChanges` refuses it at the change, so no stored draft can hold it.
- **Precedence of a stale `expectedAvailabilityRevision`.**
  - A deleting draft with a stale availability revision and an item now in use answers `item-in-use`, not `availability-changed-meanwhile`. Nothing is written either way.
  - Record the precedence, or add a pre-check. This is the same refinement left open at the store.
- **The publish page's count has no bucket.**
  - A page render runs up to 88 SQL counts, 50 at a time.
  - Before deletions can enter a draft, lower the page read's concurrency or reuse one count per draft revision.
- **R-j end to end.** Rerun R-i's arms through the real draft route once it accepts `item-deleted`.

R4b1's reviews (2026-11-05) hand on the following.

**To R4b2:**
- **Make the repair of an unreadable saved row reachable.** The `PUT` repairs such a row, but nothing hands out its revision. The page read throws on it, D9 shows the unavailable screen, and the 409 bodies carry only `{status}`. Either give the revision out alongside the unreadable answer, or record that the repair has no UI.
  **Discharged 2026-11-08 [relayed from the coordinator; logic reviewer's ruling; the scribe ran nothing]: an ACCEPTED RESIDUAL**, not a blocker and not an R4c item. An unreadable saved defaults row fails closed everywhere: D9 shows unavailable, item screens keep `cannot-judge`, the `GET` answers 503, the customer read falls back, and the server switch-off refuses. Only an out-of-band write can create such a row (the `PUT` stamps first). The repair is a database operation, and it is to get a one-line runbook entry (owed, not yet written).
- **The page read is gated only by its caller.** `readKitchenDefaultsForAdmittedPage` has no gate of its own. Confirm that the `GET` and D9 call it under the staff gate.
- `readKitchenDefaultsForAdmittedPage` and `readNewKitchenDefaults` have no production caller at R4b1. They are R4b2's and R4b3's inputs.

**R4b2 built and reviewed (branch `m10/r4b2`, not merged), 2026-11-08 [relayed from the coordinator; reviewers' reports; the scribe ran nothing].**
- **Built:** the five punch-list items.
- **QA:** verdict RED, then fixed. D1: a `HEAD` on the defaults route now answers an `Allow` header of `GET, PUT`.
- **Review:** logic, clean-code and security passed. Security found none exploitable; its one low finding is recorded as an Amendment in ADR 0178.
- **Residuals:**
  - `readAgain` depends on a readable draft. A conflict on a corrupt draft ends in "save failed" and fails closed.
  - The item screens' defaults are render-time only; the server's re-read and the CAS keep it safe.
  - Page renders have no bucket.
  - The R-d allow-list for `kitchen-defaults-source.ts` is safe only while QA's pin tests in `qa-m10-r4b2-production-source.adversarial.test.ts` stay. Treat them as load-bearing.
- **Backlog candidates (clean-code):** shared test helpers duplicated across the new test files; the `readItemRef` core in four places; the `tierOffersOf` mapping.
- **e2e, unrun:** six Playwright specs (hardware, materials, accessories, each mobile and desktop) are predicted red under `CI=1`, because switch-off is now judged. To be updated and run where `TEST_DATABASE_URL` exists. The comment at `tests/e2e/support/lifecycle-server-spec.ts:60` is stale.
- **Not yet done:** visual pass, e2e, merge.

**To R4b3:**
- **The customer read has no bound.** If it runs on the public room page's render, every anonymous request costs three uncached database reads. During an outage, each such request also writes one log line. Read it behind the creation path's limiter, or memoise it per availability-head revision or with a short TTL, and rate-limit the log line.
- **Rule 3's four-key result is wider than "no active book".** It is also what the read returns when the stores are unavailable or the book cannot be read, which is production's state until the Z gate. Criterion (b)'s property must allow for this.
  **Discharged 2026-11-08:** criterion (b) and rule 3 amended in place (dated notes). The first hand-off (the unbounded read) is discharged by the R4b3 block below.

**R4b3 built and reviewed (branch `m10/r4b3`, not merged), 2026-11-08 [relayed from the coordinator; reviewers' reports; the scribe ran nothing].**
- **Built:** the five punch-list items. Production files: the six planned plus a seventh, `apps/web/src/lib/server/price-dashboard/new-kitchen-defaults.ts` (R4b1's customer read), which the coordinator authorised to discharge R4b1's *To R4b3* hand-off "the customer read has no bound". Also `tests/support/price-dashboard-world.ts`, for the test reset.
- **QA:** verdict RED, then fixed. D1: an unmounted preset copy still minted a row. D2: the unbounded read. D3: an array request was not refused. D4: the colour was judged twice.
- **Review:** logic, clean-code and security passed.
- **The bound on the customer read** (the head is read each render; a defaults save, an in-app publish and an item switch each move it; source-verified by the developer and the logic reviewer):
  - a module memo keyed by the availability-head revision;
  - only a whole reading with a book present is remembered; failures and the no-book answer are never remembered;
  - the outage log line is budgeted at 3 per cause per 60 s, not 1, because R4b1's adversarial test asserts two lines (logic reviewer's opinion: keep 3);
  - a read deadline, with the fixed-fallback answer.
- **Residuals:**
  - the head query scans the availability log on every anonymous render, the same class as the existing `/d` and `/s` render read; accepted;
  - a point-in-time database restore that rewinds the head could match an old revision against different contents (inference; falsified by showing the head cannot rewind);
  - `seed-price-book` does not move the head, so a no-book reading is not remembered;
  - while the stores are down every render still re-reads; only the log and, with the deadline, the latency are bounded;
  - a preset copy hidden by `<Activity>` in the middle of a depth move can stay in "saving" (same class as the generation residual);
  - rule 5's `atDepthOrAsItStands` swallows chunk and probe failures with no diagnostic (candidate: a bounded log line);
  - OQ-R4b-1 is untouched. It is the same question as OQ-39 (section 6.4): one question under two names, not to be queued twice;
  - the R-d allow-list gained `app/api/designs/route.ts` and the room `page.tsx`. That is safe only while `tests/app/qa-m10-r4b3-r-d-allow-list.adversarial.test.ts` and the `qa-m10-r4b2-production-source` pins stay; treat them as load-bearing. Nit: the allow-list comment should point at the QA pin.
- **Backlog candidates (clean-code):** memo keyed on the stores object instead of a test reset; the repeated apply-if-given pattern in the domain stamp; `completionOf({}, {})` repeated; QA-wave-named test files to fold at the milestone-close audit; an optional `StampRefusedError`.
- **Not yet done:** the `CI=1` e2e specs. `global-colour`, `kitchen-handle-row` and `seeded-design.qa` are edited but not run. The QA agent also listed: `global-settings*`, `design-return-*`, `qa-8g-leave-while-waiting`, `price-breakdown*`, `price-footer-growth`, `preset-owner-loop*`, `ceiling-row-tappable`, `kitchen-stage`, `overflow-mark`, `pixel-counter-witness*`, `mint-limit-production-policy`. Also not done: the visual pass and the merge. R4c is next.

**R5b merged (`26606c74`), 2026-11-09 [relayed from the coordinator; source-verified by the coordinator; the scribe ran nothing].**
- **Built:** `GET /api/designs/[id]/price-notice` and `POST /api/designs/[id]/price-notice/acknowledge`. The judgement is in `apps/web/src/lib/server/price-notice.ts`; request handling is in `price-notice-request.ts`.
- **Evidence:** QA green. Full `apps/web` vitest: 1156 files, 28788 passed, 2 skipped. `tsc` and `eslint` clean. Logic, clean-code and security reviews found no blocker.
- **Decision (error mapping):** an unexpected throw (not a `DashboardStoreError`, not a `loadEditable` or `getPriceStores` failure) answers `500 {status:"unexpected"}`, as a defect rather than an outage. `DashboardStoreError` and `loadEditable`/`getPriceStores` failures stay `503`.
- **Residuals:**
  1. A wrong token spends the save buckets, as a save does.
  2. Acknowledging an older pair moves the marker back, so one extra notice is possible.
  3. The pinned-marker cost (security Low) is accepted. The mitigation is to be decided after measuring at the Z gate.
  4. The seen-book `authoredName` fallback is unreachable until Q3 item 2 changes `removedAccessoriesSince`. Q3 must update the pins that move, including `qa-m10-r5b-seen-side-canary.adversarial.test.ts`.
  5. Check-then-write residual.
- **Next:** Q3, Q4, Q5, then R4c, then the Z gate.

**Recorded:** an extra member in the defaults body answers `400 invalid-request` with no field, as every draft write does. This corrects the acceptance bullet's "naming the field".

R4a4 hands to Q3: an end-to-end arm showing that publishing a created class blanks the deltas, written when Q3 flips `qa-p4a-tier-offer-switched-off…:56`.

**Q3 sub-waves T4, Q3a, Q3c, Q4, Q3b merged locally, 2026-11-09 [relayed from the coordinator; facts source-verified by the coordinator with merged-tree gates: `tsc` and `eslint` exit 0, `apps/web` vitest all passed at each merge; the scribe ran nothing]. Local only, after the pushed tip `a6b23c18` (corrected 2026-11-10; this line first said "All unpushed").**
- **Correction:** S2c was already merged on 2026-11-05 (`64d98623`; see *S2c and K3 merged* above). Any text here that lists it as unbuilt is stale. R4c now waits only on Q3d, Q5 and the Z gate sequence below.
- **T4** (`b1905701`): two Romanian leaves, `globalSettings.pricesUnavailable` and `replacementSheet.unnamedOptionUnavailable`, **drafted, not approved** (OQ-11g). The Russian leaves are agent drafts.
- **Q3a** (`49e4787f`; commits `cfa1b4d1`, `76c2b751`, `9ed918f5`; QA `1499d84d`):
  - a vanished material or hardware tier is `REPLACEMENT_REQUIRED`; `UNKNOWN_TIER` is now only for a book whose default names no tier;
  - `removedAccessoriesSince` reports a deleted earned linked accessory;
  - the colour row is omitted only for a **vanished** material; a held switched-off material keeps its colour row (pinned by P4a);
  - 14 pins moved;
  - **known failure kept as `it.fails`:** a switched-off colour under a held undeclared (created) material class throws `NoReplacementOptionError`. It is Q5's.
  - Evidence at merge: domain 462 files / 13592 tests; web 1165 files / 29131 passed.
- **Q3c** (merge of `m10/q3c` and `m10/q3c-qa`; fix `490940c0`, overflow-wrap): price-notice client, the hook (acknowledge is guarded: only the active-version arm and only the displayed pair), and the C1 banner.
  - Extra members in a 200 answer are tolerated, by ruling.
  - Visual check at 390x844 and 1440x900 passed, against a stubbed answer.
  - **Missing copy:** a removed linked accessory with no `authoredName` that is not built-in shows no line (never its id).
- **Q4** (`ef07a617`, `84bdbd2a`): the sent-kitchen note; it reads `isSent` from the hook.
  - **Deviation:** on desktop the placement is a centred card in the scene footer, not the C5AD right rail, because that panel does not exist at this step. **The owner may overrule.**
  - Visual check passed. Web 1167 files / 29182 passed.
- **Q3b** (`90324563`; `m10/q3b` plus `m10/q3b-qa` `9bdf60a9`): `NO_TIER_OFFER` with no book; switched-off tiers are out of `tierIds` and out of the delta measurement. Review fixes: **B1** (the handle row shows with no book, through an empty availability), **M1** (a held-but-off carried tier stays as stored), **M2** (the pill floor draws a named label). Web 1176 files / 29355 passed.

**Q3d, e2e rewrite, T5, Q5a, Q5c merged locally; Q5b built and in QA, 2026-11-09, later [relayed from the coordinator; gates verified by the coordinator on the merged trees; the scribe ran nothing]. Local only, after the pushed tip `a6b23c18` (corrected 2026-11-10; this line first said "All unpushed").**
- **Q3d** (replacement sheet C4A-D; merge `a8e1a193`): the e2e replacement-sheet specs and the rewritten global-settings-apply spec ran green under `CI=1`: 5 passed. Visual check done at 390x844 and 1440x900; findings fixed in Q5b or listed below.
- **E2e rewrite** (`m10/e2e-withdrawn`): merged.
- **T5** (`replacementSheet.changedColour`): **drafted, not approved.** Q5b says the price sentence once by cutting the approved leaf at runtime; a standalone leaf from the T lane would be cleaner. Follow-up for the owner / T lane.
- **Q5a** (`replaceColour` / `replaceHandle`, from validated; ruling 5 palette lookup). Residual: the colour row and the command resolve an absent `materialTierId` differently (book default vs PAL), so a dead row appears only with an out-of-band book; pinned as `it.fails` in `qa-q5a-replacements-required.adversarial.test.ts`. N-2: duplication between `coloursReplacing` and `paletteContaining`.
- **Q5c**: the settings pill reads "Material de ales" while a material row is owed; the hardware entry is left out while a hardware row is owed (OQ-43 default). **Visual check still owed.**
- **Q5b** is built (`fe992f4d`, `56c18187` on `m10/q5b`) and in QA, **not merged**.
- **Owed before the Z gate:**
  - visual checks of Q5b and Q5c;
  - the disabled look of the review control: the `span role=link aria-disabled` in `configure-screen.tsx` has no disabled style (background identical to enabled; frame `btnOff` specifies `#ece7dd` / `#dcd8ce` / `#a89c8e`); a one-file follow-up in `configure-screen.tsx` / `configure.module.css`;
  - a waiting colour row has no text saying why it has no button (copy gap);
  - frame deviations the owner decides: chooser as a centred dialog vs the C4BD right rail; head divider/subtitle; fixed sheet height; primary button colour; chooser heading copy;
  - cleanup of about 25 stray test designs left by visual checks in the e2e test database;
  - the M10 phase-table row in STATUS section 2 (stale since 2026-11-04) to rewrite.
- **Remaining:** Q5b QA, reviews, visual and merge; R4c1-R4c3 (see *Q5 split and R4c plan*); the Z gate.
- **Proposed ruling, awaiting owner confirmation:** the C4 sheet announces a forced material replacement's colour reset after the change; see [ADR 0081, Amendment 2026-11-09](../decisions/0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md).
  - **Residuals:**
    1. An availability-store outage reads as `NO_PRICE_BOOK`, so the handle row offers switched-off handles, which later forces a replacement. The fix would give `NoPriceBook` a reason. Owner call.
    2. The fit model (`settings-pill-fit.ts`, `top-bar-fit.ts`) still measures the old no-label width at the pill floor.
    3. `availability?` in `DescribeGlobalSettingsInput` is still optional, with two unreachable branches.
    4. `requireDeepCabinetPercent` and `UnreadablePriceBookError` have no production caller.
    5. The no-book arm is DOM-tested only (dev, test and e2e always seed a book).
- *(Superseded by the block below: Q5b, Q5d and R4c1 are merged, R4c2 is started.)*
- **Q3d** is built (`c6211abd` on `m10/q3d`) and in QA. **Not merged.**
**Q5b, Q5d, R4c1 merged locally; R4c2 started, 2026-11-09, latest [relayed from the coordinator; facts verified by the coordinator on merged trees: `tsc` and `eslint` exit 0; `apps/web` vitest 1212 files / 30005 tests passed at the R4c1 merge; the scribe ran nothing]. Local only, after the pushed tip `a6b23c18` (corrected 2026-11-10; this line first said "All unpushed").**
- **Q5b** (colour and handle rows choosable in the replacement sheet; `fe992f4d`, `56c18187`, `cbc9f7e3`, `9c36d068` plus QA).
  - **Ruling 4's text was falsified** and is corrected in place: an undeclared OLD material also leaves a colour row owed, appearing only after the material is replaced.
  - **Departure from the Q5-a acceptance** ("the price shows once the save lands"): built and pinned, the price shows straight after Apply; the second `GET`, the marker `POST` and the C4C line wait for the save. An unsaved kitchen cannot be sent (review gates on `hasUnsavedEdit`; contact refuses `REPLACEMENT_REQUIRED` server-side). Acceptance wording fixed.
  - **Follow-up (T lane):** the price sentence is said once by cutting the approved leaf at runtime (`withoutPriceSentence`); a standalone "changed to {name}." leaf would remove the cut.
  - **Departure:** a resolved handle row the design no longer stores shows no value, against "never an empty value". Unreachable today.
  - **GATE BEFORE ANY PUSH:** the ADR 0081 amendment is still **proposed**, awaiting owner confirmation.
- **Q5d** (polish): the review control has the frame's disabled look; an owed row is read once (group label removed).
  - **Open:** the Russian pill "Выбери материал" is clipped at 390, because frame 2A's 150px cap is about 6px narrower than one ru label plus a counter. That cap is ADR 0104 decision 3's owner-ruled rung-4 floor and is **not changed**. Options for the owner: shorten the ru string (agent draft), soften the cap (needs an ADR 0104 amendment), or accept.
  - **Dead code left:** `ReplacementRowView.announcement`, `copy.unavailableAria` and the leaf `replacementSheet.unavailableAria` have no reader in `src`. `qa-m10-q5d-unread-announcement.test.ts` is to be deleted with them.
- **R4c1** (merge of `m10/r4c1`): a restore beside a draft that deletes a row. Rows the draft deletes are outside the restore; a pending change on such a row survives; a restore differing only on deleted rows answers `409` nothing-differs. This is ruling 12 and the OQ-44 default.
  - It **narrows ADR 0178 A-15**. Owed: an amendment pointer from A-15 to ruling 12 and OQ-44, when the owner answers OQ-44 (not written; ADR untouched by this scribe step).
  - Acceptance wording corrected: "holds no change addressed to T" is now "adds no change addressed to T".
  - **Ruling 13's route acceptance moves to R4c2** (a revert of a deletion answers `409 candidate-refused`); the `it.fails` in `price-dashboard-revert-deletion-past-cap.test.ts` flips there.
  - **Ruling 14 (creation rates from two books) is a real defect** for books whose classes state different rate sets (`creation-plans.ts:109`, `structural-changes.ts:120`, `apply-changes.ts:140`, `editable-fields.ts:372`). Closed as unreachable for app-written books, by induction: the seed states all five rates on every class; creation copies the running book's rate set; rate edits cannot add a field; restore sets only fields both books state; the default class cannot be deleted; publish stores the parsed candidate. But the parser requires only `perLiftMinor` and `perPushRunnerMinor`, so a parse pass cannot catch it. **Added to the Z gate:** every hardware class in the active version's book states the same rate fields (or the parser requires all five). The `it.fails` stays as the known-defect pin; owner: that Z-gate check, or the fix in `apply-changes.ts` / `structural-changes.ts`.
  - **Security review:** no exploitable issue. Informational, later improvements and not this wave: a server-side cap on changes per draft, or refusing `item-deleted` for a row the same draft created, would remove a slow-growth path; the restore route has no per-request deadline (the rate bucket is the only CPU bound).
- **R4c2** (branch `m10/r4c2`) is started, **not merged**. Remaining: R4c2 QA, reviews (security) and merge; R4c3 (Delete on in the dashboard; Full + visual); then the Z gate, which needs the owner's go-ahead before touching the shared test DB.
- **Owner decisions pending:** see STATUS section 1 (2026-11-09, close).
- *(The order below is older; Q3d, Q5a, Q5b, Q5c, Q5d and R4c1 are now merged.)* **Remaining order:** Q3d QA, reviews and visual, then Q5, then R4c, then the Z gate. Q5 also owns:
  - a colour or handle as the only owed row has no way forward but the back button;
  - the top-bar pill label `headerMaterialToChoose`;
  - the created-class colour `it.fails` (Q3a, above).
  
  **Q3d and Q5 merge together before any push.**
- **Test hygiene:** about 11 stray designs were left in the e2e test database by visual checks (ids unknown for some). Clean them before the Z gate.

**R4c2 merged (deletion accepted at the draft route), 2026-11-09 [relayed from the coordinator; gates run by the coordinator on the merged tree under `rtk proxy`; reviewers' reports; the scribe ran nothing]. Local only, after the pushed tip `a6b23c18` (corrected 2026-11-10; this line first said "Unpushed").**
- **Merge:** `a9a35ce1` on `m10-price-dashboard`; QA branch `m10/r4c2-qa`; implementer commits `a1a72a48`, `38bda547`; QA fix `86028421` (the deletion-facts memo serves nothing after the clock is set back); comment commit `ebee1f97`. This supersedes the "R4c2 started, not merged" line above.
- **Gates (coordinator, merged tree):** `tsc` exit 0; `eslint` exit 0; `apps/web` vitest 1219 files / 30189 tests passed. R-j ancestry check (`dafc263b` Q5b, `a8e1a193` Q3d) exit 0.
- **Reviews:** logic, no defects; clean-code, no blockers; security, no exploitable issue.
- **Security Low, accepted residual unless the owner wants a limiter:** the deletion pre-check has no in-flight slot, only the 600/h draft bucket; a refused deletion leaves no audit row.
- **Residuals (owner or later wave):**
  1. Repeating an identical PUT of a deletion already held re-counts and may answer `ITEM_IN_USE` (observation).
  2. The memo is process-wide inside `deletion-facts.ts` with a test-only reset export. Candidate: split it into its own module with an injected clock.
  3. The four R4c2 route test files duplicate fixtures. Candidate: a `tests/support` module.
  4. `refusalCodeOf` copies `judgeDeletion`'s order; a parity property test guards it.
  5. A `change as DraftChange` cast in `draft-deletion-check.ts`.
  6. The `UnguardedDeletionError` branch is untested.
  7. The memo TTL of 60 s is provisional; the owner is to retune it.
  8. **R4c3 must handle a linked row the catalogue no longer prices:** the usage route counts with `buildIds` `[]`, so the dialog can show 0 while Delete is refused.
  9. A defaults save moves the availability head, which is what keeps the defaults out of the memo key.
- **Next:** R4c3 (Delete on in the dashboard; Full + visual), then the Z gate, which needs the owner's go-ahead before touching the shared test DB.

**R4c3 merged and CLOSED (client Delete on), and the Z gate state, 2026-11-10 [relayed from the coordinator, who ran the commands; evidence tiers per line; the scribe ran nothing]. Local only, after the pushed tip `a6b23c18` (corrected 2026-11-10; this line first said "Unpushed"). M10 itself and the Z gate stay open.**
- **Closed by owner instruction (2026-11-10).** Per `docs/WORKFLOW.md` the archive rule of step 7 covers a whole phase, so only the wave is closed here; this file is not archived.
- **Merge (run-and-quoted by the coordinator):** `c9dd3536` (`--no-ff`) on `m10-price-dashboard`; fixes `b7e86955` (a deletion recount judges one snapshot of the draft and stays closed when the draft was not read again) and `ce139f1c` (a recount after a deletion conflict yields to a newer request; e2e specs follow Delete being on); QA commit `328d6074`. R4c2's memo clock fix is `86028421` (listed above). Gates were green at merge; e2e and a visual pass were done (coordinator, relayed; no figures restated).
- **Residuals:**
  1. `readDraftNow` is still optional.
  2. `canDeleteStatedItems` is vestigial; follow-up: remove it.
  3. `candidate-refused` does not re-read the draft.
  4. The R4c3 and R4c2 test helpers are duplicated.
- **Visual deviations:** copy; desktop menu and focus after a delete; the 60 px shift of the counting notice; the publish page's layout.
- **Unchecked:** the real usage-count path; D5G; deleting a draft-created accessory; Russian.
- **Z gate so far:**
  - Persistence live suite on staging (`lemn-conf-v2-staging`) green after `d0b122dd` (a jsonpath `?` in the publish statement was counted as a placeholder by the test helper) [run-and-quoted by the coordinator]. **Corrected 2026-11-10: this does not hold for the application-role-privileges test, which ran against an unconfirmed database, possibly preview; see the *Z gate close-out* block.**
  - Migrations 1-29 already applied in production (`lemn-conf-v2`) and staging, by read-only `migrate:status`; nothing was run [run-and-quoted].
  - Production `price_book_versions` has 0 rows and `price_book_draft` 1 row (read-only count, owner-approved). The stored-version parse check and ruling 14's rate-uniformity check are therefore moot until a book is active. Staging's 2292 versions are all live-test fixtures [run-and-quoted].
  - `pnpm ci:local` exited 1. PASS: format, lint, typecheck, test, build, boundary, lockfile, sca. **FAIL, open (being fixed in a separate wave, not fixed here):** `e2e-shard-budget` (desktop shard 5 has 81 tests against a budget of 67; needs 8 shards); `e2e` (8 mobile failures of 1415: 7 in `design-return-requests` and `qa-8k2-design-return` count an extra `/price-notice` GET as a design read; 1 `global-settings.e2e.spec.ts:262` times out waiting for `global-settings-confirm`) [run-and-quoted].
- **Z gate still open (superseded 2026-11-10 by the *Z gate close-out* block below: live S2/S4/S7 ran, sabotages ran, the demotion-write test was never skipped, stray designs deleted, production grants run by the owner; open there: the live privilege test on staging, the C-grants check not restated, and Z2):** live S7/S2/S4 runs; the C-grants check; S7 sabotages; un-skipping the demotion-write test; cleanup of about 25 stray e2e designs (see the owner rulings below: ~183 on staging, cleared to delete); grants SQL for the production application role (the owner's; see below).

**Owner rulings of 2026-11-10 and the `ci:local` state [owner rulings given in chat, relayed by the coordinator; tier: owner ruling, relayed; the scribe ran nothing].**
1. **ADR 0081 amendment rewritten by the owner.** The C4 replacement sheet only says the material and its colours are not available and the customer must choose another: no "Culoarea a revenit la ..." line (C4C), no confirmation before. The 2026-11-09 proposal is marked superseded in [ADR 0081](../decisions/0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md); the settings sheet keeps ADR 0081 whole. Consequences: **Q5b is built to the old proposal (it shows C4C) and needs a rework** (not dispatched); ADR 0178 A-16 gets an amendment pointer (done); the raw-hex question is moot; **`replacementSheet.changedColour` (T5, OQ-11h) may be dead copy: flagged for the architect, not decided**. The block on any push from this amendment is lifted; a push still needs a green `pnpm ci:local`.
2. **Staging (`lemn-conf-v2-staging`) is a test database.** The owner gave a green light to delete the about 183 stray designs in it (the "about 25 stray e2e designs" item above is superseded by that figure, as relayed). The coordinator does it after the running `ci:local` finishes; not done at the time of writing.
3. **Russian pill:** shorten "Выбери материал" to "Материал". A copy change **still to be made**; the RO pill is unchanged unless the owner says so.
4. **Raw hex in the colour-reset copy: moot** after ruling 1. The owner's remark: nobody uses colour names, they use the RAL palette.
5. **Frame deviations accepted as built** (chooser as a centred dialog vs the C4BD rail; head divider and subtitle; fixed sheet height; primary button colour; chooser heading copy). The owner will review each scenario later and may change them then.
6. **Memo TTL: 60 s accepted.** No pre-check limiter wanted; R4c2's security Low is accepted as a residual.
7. **Production grants SQL for `0023`-`0029`** for the application role: the owner ran it on `lemn-conf-v2` (production). **Owner-run, not verified by the coordinator.**
8. **Preview steps** (grants SQL, seed step, Vercel env check on the preview environment): deferred by the owner ("later").
9. **OQ-41, OQ-42, OQ-43, OQ-44, OQ-11g, OQ-11h:** none blocks anything; the defaults stand until the owner answers.

**`pnpm ci:local` state (coordinator, relayed):** run 2 left only (a) the shard-budget drift test, fixed in `7f5f8580` ("test(ci): the shard-budget drift test names the eight desktop shards"), and (b) one desktop e2e (`pixel-counter-witness:287`) that failed once and passed 18/18 when repeated. Desktop e2e now runs in **8 shards** (`4f39d97f`); the read-count helper fix (a price-notice GET no longer counted as a design read) is `03116df5`. **A third full run is in progress; its result is not known to this record.**

**Push-state correction, 2026-11-10 [coordinator, relayed; run-and-quoted by the coordinator unless stated].** Branch `m10-price-dashboard` **is pushed** on origin up to `a6b23c18` (2026-11-05). 145 commits after it (more by now) are local only. **Superseded later on 2026-11-10: the owner pushed; see the *Z gate close-out* block.** Every "unpushed" in the 2026-11-09 and 2026-11-10 blocks above means "after `a6b23c18`". A pull request, PR 16 on DumitruSirbu/lemn-conf-v2, exists; the coordinator could not read it (`gh` returned 401), so its state and contents are **unverified**.

**C4 wave (sheet message) merged locally and CLOSED, 2026-11-10 [relayed from the coordinator; tier per line; the scribe ran nothing and had no shell].** Owner ruling: the replacement sheet only says the material and its colours are not available (ruling 1 above; [ADR 0081](../decisions/0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md); plan [`m10-c4-sheet-message-plan.md`](m10-c4-sheet-message-plan.md)). Merged locally, after the pushed tip.
- **C4a `ac81cdad`:** new ro and ru leaf `replacementSheet.materialAndColoursUnavailable`, copy lock **Drafted** under OQ-11i; Russian pill `headerMaterialToChoose` = "Материал" (closes ruling 3).
- **C4b `21eb9c7a`:** the reset line and the `colourReverted` leaf removed; the note sits after the lead paragraph; the D2 colour row shows no value.
- **Review round `097c9989`:** the note is part of the dialog's `aria-describedby`; e2e assertions in `replacement-sheet-journey.ts`; one shared leaked-id pattern in `tests/support/leaked-id.ts`; the D2 tests narrowed. The clean-code reviewer's stale settings-test header was fixed.
- **Gates (run-and-quoted by the coordinator, before the commits):** `tsc` exit 0; vitest on `tests/price`, `tests/i18n`, `tests/settings` plus `tests/support/leaked-id.test.ts` exit 0, 340 files, 6532 tests. The hook (lint, prettier) passed on each commit. Desktop and mobile replacement-sheet e2e: 1 passed each [QA-reported, not run by the coordinator].
- **Reviews [reviewers' reports]:** logic = minor concerns, no logic bug, all seven checks met (the reviewer ran 9 files / 194 tests, no sabotage); clean-code = no blockers, four should-fix items, all fixed.
- **Visual [verifier's report; the coordinator viewed no screenshot]:** at 390x844 and 1440x900 in ro and ru the note sits after the lead, with no clipping or overflow; the confirmation has no reset line and no hex; the Russian pill "Материал" is 111 px wide at 390 (cap 150), not clipped; the settings sheet still asks before a material change (verified at 390, ro and ru).
- **Residuals:**
  1. The visual case of a colour row cleared by the reset could not be reproduced with the fake price book (needs a colour switched off in the book).
  2. The settings sheet desktop (1440) check failed on a flake and is **unverified**.
  3. The e2e assertions were not sabotage-tested.
  4. QA's "no reset line after the settings confirm" DOM check is nearly vacuous (`GlobalSettings` mounted alone has no announcement region).
  5. The verifier saw Next's 404 "This page could not be found" right after a mint in about 8 of 14 runs with a hand-started server; QA's two e2e runs had none; **undiagnosed**.
  6. The 900x500 pill check and the state after picking a tier were not run.
  7. The Russian leaf and the new Romanian text **await owner approval** (OQ-11i, drafted).
- **Open-item effect:** Q5b rework (item 1) and the Russian pill (item 2) are done by this wave; whether `replacementSheet.changedColour` (T5, OQ-11h) is dead copy was not reported to the scribe, so it stays for the architect.

**Z gate close-out, 2026-11-10 [relayed from the coordinator; tier per line; the scribe ran nothing and had no shell]. This supersedes the push-state, stray-design, Z-gate-open and "persistence live suite green" lines above.**
1. **Push state [run-and-quoted by the coordinator].** The owner pushed. After `git fetch`, local HEAD and `origin/m10-price-dashboard` are both `99857d26`, 0 commits on either side. PR 16 on DumitruSirbu/lemn-conf-v2 is the PR; the coordinator could not read it (`gh` 401), so its state is unverified. The owner pushed **before the final `pnpm ci:local` on this tree finished**; that run was in progress when this was written: **result unknown, none recorded here.**
2. **Earlier `ci:local` [run-and-quoted].** The third full run, before the C4 commits, passed all 10 gates (1423 e2e, 30311 unit tests, exit 0).
3. **Stray designs [run-and-quoted].** All 183 designs in `lemn-conf-v2-staging` were deleted by the coordinator on 2026-11-10 (owner-approved); 0 left. This supersedes every "about 25 stray e2e designs" line.
4. **Z1 live results [QA report; not re-run by the coordinator].** Live S2 221, S4 145 and S7 131 tests passed on staging, 0 failed, 0 skipped (files chosen from `live-suite-census.test.ts`; this milestone lists no files per gate).
   - The S7-a sabotage this plan defines (dropping the hidden half from one arm) turned the parity table red for both arms. QA added four more sabotages (deleted half on each arm, a visitor term on the token arm, `is_sent` forced false); all red. The tracked file was never edited (sha256 identical before and after).
   - The demotion-write test is not skipped: un-skipped in `9eb081bb` (2026-11-04) and passing (251 passed in `qa-m10-r2-dashboard-api.adversarial.test.ts`; its live arms passed in the S2 run).
5. **Grants [owner statement, plus one coordinator check].** The owner ran the `0023`-`0029` application-role grants on production (`lemn-conf-v2`), preview and staging. Production: the coordinator compared the owner's catalogue query output with the runbook's 22 grant lines, all present, nothing extra. Preview and staging: **the owner's word, not checked.**
   - **Correction to "persistence live suite green on staging":** the live application-role-privileges test has **not** been run against staging. It reads `DATABASE_URL`, whose only value in the repo env files is the preview database's `app_designs`; no staging `app_designs` URL exists. It ran against an unconfirmed database, possibly preview. The S2/S4/S7 live suites did run on staging (`TEST_DATABASE_URL`).
   - Production `price_book_versions` has 0 rows (1 draft row), so the stored-version parse check and ruling 14's rate-uniformity check have nothing to check until a book is active: **moot, not done.**
6. **R4c3 residuals closed in `99857d26` [run-and-quoted].** `canDeleteStatedItems` removed and `readDraftNow` made required; the tests followed (340 files, 6526 tests, exit 0). No review tier, by the mechanical-change rule. This closes residuals 1 and 2 of the R4c3 block. **Still open:** `candidate-refused` does not re-read the draft; the R4c2/R4c3 `deskDeleting` test helpers are duplicated (a merge would touch dozens of call sites).
7. **Open and unstated in the docs: state not stated.** S6; T2; K4; Q1c (its last entry, 2026-10-28, says QA, not merged; probably stale); Z2 (release notes and test audit; waits on Z1). **Superseded 2026-11-11: Z2 and Z1's visual pass are done, and T2 and Q1c are merged; S6 and K4 were NOT built before 2026-11-11 and are built now (blocks below). An earlier scribe's "state unknown" for S6 and K4 was wrong in the sense that they were simply not yet built.**

**Z1 visual pass and Z2 close, 2026-11-11 [relayed from the coordinator; reports read by the scribe; the scribe ran nothing and had no shell]. This supersedes item 7's "Z2 waits on Z1" and the 2026-11-10 push-state lines that say the final tip's `ci:local` was "in progress".**
- **Commits after `99857d26` [coordinator; subjects from `git log`, relayed]:** `e073ed9b` (docs: the Z gate close-out, the grants and the push state), `a739d4d9` (the two slow domain sweeps split per scope and per ceiling, with sized timeouts), `044a11f1` (docs: release notes, covering no rollback past `settings.handle`, migrations `0023`-`0029` and their grants, production state, known limits; this is the Z2 release-notes criterion), `d3cb086b` (the slow three-adapter property and sweep tests carry explicit, sized timeouts, so the parallel unit gate no longer times them out at the 5 s default), `77fadd67` (the Z2 audit fixes, below). The earlier "timeouts" residuals of the R4c-era blocks are closed by `a739d4d9` and `d3cb086b`.
- **Z1 visual pass [verifier's report: [`m10-z1-visual-pass-report.md`](m10-z1-visual-pass-report.md); production build, fake price book, HEAD `d3cb086b`].** 75 frames: 61 reproduced, 10 partial, 4 not [counts relayed by the coordinator; the report's frame table carries no totals line]. Not reproduced: D1B (the verification widget cannot load there), D10D (the e-mail), the settings sheet at 1440 (the report's owed-items table says it **was** reproduced; the C4 residual 2 above said unverified, so this closes it), and the cleared-colour row (not reachable from any dashboard screen; backlog 299). No functional defect on a dashboard surface. Not verified because the book is fake: usage counts above 0, audit detail text, cross-page persistence on real stores, D9's failed and refused saves. The owner accepted the frame deviations earlier (2026-11-10, ruling 5) and will review each scenario later.
- **Minor observations, in the backlog:** the failed-publish banner persists during the retry (296); phone editor top bar targets under 44 px (297, extends 192); the Permissions-Policy `ambient-light-sensor` console warning (298).
- **React #418 seen in Z1 is not a product defect: record it so nobody chases it** ([`m10-hydration-418-diagnosis.md`](m10-hydration-418-diagnosis.md), diagnosed 2026-11-11). It is a harness artifact: the visual pass served a production `.next` built without `NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG` while the server ran with it set, so the server rendered the e2e-only `SelectionDebug` node and the client bundle did not. The diagnosis reproduced it only in that combination (its evidence rows 1-6) and shows the code predates M10 (commit `01070892`, 2026-08-31; `git diff 0910dc06 HEAD` leaves both files unchanged). Visual passes must build with the env the server runs under.
- **Z2 test audit ([`../test-audits/m10-close-audit.md`](../test-audits/m10-close-audit.md)).** Found 3 cannot-fail (C1 the `material-wire` `it.fails`, C2 `qa-m4-apply:141`, C3 `deletion-facts:310`), 1 near-duplicate, 4 obsolete. All fixed and proven by mutation in `77fadd67`, which also deletes `qa-m10-u4b-wire.adversarial.test.ts`; the audit report carries a *Resolved in `77fadd67`* note. Audit limits that stand: persistence (101), e2e (45) and three-adapter (34) files not run; `d61bfd6d..0910dc06` unaudited; static triage only outside the 39 mutated modules.
- **Deferred, with a record:** backlog 291 (C4 replacement-sheet defect pinned by `qa-q5a-replacements-required:186`), 292 (`creation-after-deletions:155`), 293 (the e2e one-flake-per-full-run pattern), 294 (`candidate-refused` does not re-read the draft), 295 (duplicated `deskDeleting` helpers), 296-299 (Z1 items).
- **Push state, stated honestly [coordinator, relayed].** Commits up to `d3cb086b` are on origin; `77fadd67` and these docs are local. The push gate (`pnpm ci:local`) failed once on machine load (stale processes) and the owner pushed manually. **A re-run of the gate for the final tip is pending; no result is recorded here.** The last recorded green run (before the C4 commits) is item 2 of the Z gate close-out.
- **Archive: NOT done.** Criteria not met, at the criterion: (a) Lane Z, Z1: "`pnpm check`, then `pnpm ci:local` on a clean tree, are quoted" has no quoted run for the final tip; ~~(b) the plan's S6, T2, K4 and Q1c waves have no state~~ **(b) is answered 2026-11-11, see the block below; (a) is the sole remaining criterion.** Owner items OQ-41, OQ-42, OQ-43, OQ-44, OQ-11g, OQ-11h, OQ-11i keep their defaults and do not block. When (a) and (b) are answered with quoted evidence, the scribe archives per `docs/WORKFLOW.md` step 7 (STATUS to Done, move the plan to `milestones/done/` with the banner, a row in `done/README.md`, the index below).

**S6, K4, K4b and S6b built, 2026-11-11 [coordinator's reports, each verified by the coordinator against code and tests; commits `d7814c32` (S6) and `79036b28` (K4 + K4b + S6b); the scribe ran nothing and quotes figures from the reports]. This corrects the earlier "state not stated" for S6 and K4: git and code show they were not built before today. T2 is merged (`e94a6cb3`); Q1c is merged (`e69798a1`, `263f76a7`, `7633a53d`).**
- **S6 (`d7814c32`), `packages/persistence/src/price-dashboard-row-source.ts`, `createNeonPriceDashboardRowSource`.** One scoped select per table: `price_book_versions` (keyset on `sequence_number`), `catalogue_availability_changes` (keyset on `revision`), `catalogue_availability_head`, `kitchen_defaults`; every column except the singleton key; bigints as text, ordered numerically; the singletons throw unless exactly one row; driver errors pass through raw (owner-side ruling, as `createNeonDesignRowSource`). **The head was added beyond the plan row**, because it can run ahead of the log (publish moves it by `greatest(k,1)`) and a restore without it would collide on revision 1. `price_book_draft` is deliberately out of scope. `pageSize` is not validated (0 gives an empty page). Review: no blocker. QA: about 150 tests, 22 of 22 mutants killed; the live read-only arm against staging passed.
- **K4 (`79036b28`), the staff-change digest.** `apps/web/src/app/api/cron/staff-change-digest/route.ts`, `lib/server/staff/run-staff-change-digest.ts`, `lib/server/mail/staff-change-digest.ts` and `-html.ts`, `vercel.json` `0 5 * * *` (OQ-10), `resolveStaffChangeDigestCopy` in `i18n/content.ts`, new leaf `staffChanges.digest.moreWaiting` (RO draft, RU agent draft, copy lock; OQ-11j). `CRON_SECRET` auth only; once per Chisinau day (claim before send); entries only for rows mailed; malformed rows skipped and stay eligible (all malformed gives `DIGEST_ROWS_MALFORMED`); size-bounded (`DIGEST_HTML_BUDGET` = `HTML_MAX_LENGTH` - 2048) with an "N more waiting" line; copy, sender and origin resolved before the claim; stable `DIGEST_*` codes; no new env var. QA: 104+ tests, 19 of 20 mutants killed (1 equivalent), four defects fixed (bidi-only name fallback, throwing factories, a malformed row aborting the digest, unbounded mail); **backlog 290 is resolved by this fix.** Security and logic review: no exploitable issue. **Deviation, owner item, default stands: the digest goes to the configured shop inbox via `createMailSender`; plan A-13, the K4 row and ADR 0178 say accounts holding `contact.read` with a confirmed address** (no port lists them; backlog 302). Review notes: every failure after the claim loses the day (matches the plan's order); a kitchen name of up to 120 characters may hold a URL a mail client linkifies (backlog 304).
- **K4b (`79036b28`), the nav badge.** `apps/web/src/staff/use-changed-kitchen-count.ts` (new), `staff-navigation-groups.ts`, `staff-shell.tsx`, nav leaf `priceDashboard.nav.changedKitchens` (RO draft, RU agent draft; OQ-11j). Reuses K2b's `GET /api/staff/kitchens/changed-count` (`contact.read`, 60 s poll bound); pauses on a hidden tab; `401` raises the session sheet, `403` clears the badge, `429` stops. Latent: the poll needs `contact.read` while the menu link needs `design.read.any` (backlog 305); the badge can lag a seen mark by up to 60 s. The `qa-m10-k3-reads-never-mark` test now lets the digest route import the change store (read and claim) but still bans `.markSeen(` everywhere else.
- **S6b (`79036b28`), the nightly export.** `apps/web/src/lib/server/backup-price-dashboard.ts`, route `/api/cron/backup-price-dashboard`, `vercel.json` `45 3 * * *` (03:30 is `prune-rate-limits`); Blob prefix `backups/price-dashboard/`; rotation 14 days, at most 30 files; one tagged ndjson line `{table,row}`; order versions, log, head (read after the log walk), defaults; page sizes 2 versions (a row can reach 8 MiB: migration `0023` caps the book and `change_summary` at 4 MiB each) and 500 log rows; `BACKUP_EXPORT_FAILED` and `BACKUP_ROTATION_FAILED`; no new env var or Blob store. QA: 58 tests, 22 mutants killed, 1 equivalent. Known: rotation does not exclude the run's own pathname (as in `backup-designs.ts`) and a `..` pathname passes `startsWith`, both judged unrealistic (backlog 303); the restore runbook does not cover this export (backlog 300; stub added to `runbooks/design-db-restore.md`), and migration `0023`'s header still says versions are not in the nightly export (migrations are code, only noted); `backup-presets.ts` says to consolidate the exports into one engine when a third arrives, this is the third (backlog 301); `rowCount` is the total records across the four tables; the implementers rebuilt `packages/persistence` `dist` (gitignored) once.
- **Owner items new:** **OQ-11j** (the new nav and digest copy, drafted, not approved); **digest recipient** (backlog 302); **Vercel cron limit: `vercel.json` now holds 5 crons and the owner MUST CONFIRM the plan's cron limit (Hobby allows few).** Existing OQ-41, OQ-42, OQ-43, OQ-44, OQ-11g, OQ-11h, OQ-11i: defaults stand.
- **Archive: still NOT done. Not run on HEAD `79036b28`: `pnpm check` and `pnpm ci:local`. Quoting them on the final tip is the sole remaining exit criterion** (apart from default-standing owner items); once quoted, archive per WORKFLOW step 7.

*R4a5: record amendment (2026-11-05).* The R4a5 row said "R4a5 changes no server file, route or auth path". That
premise broke. R4a5 changed the usage route's answer (`staff-item-usage.ts`, `item-usage-read.ts`). It touches 11
production files against the row's 5. The security downgrade was therefore re-checked: R4a2's security reviewer
looked at the server change and the client's 429 retry and approved them as security-neutral.

*R4a5 merged* (QA green; logic, clean-code and visual reviewed in two rounds; security re-checked).

Hand-offs to R4b, the next wave on these screens:
- The disabled "Activă/Activ în configurator" switch rows draw with dark text and a brown border, so they look live.
  Give them the disabled look, as R4a5 gave the delete buttons.
- On desktop, a created row's menu popover covers its "De publicat" chip.
- Clean-code nits:
  - The re-wrap split `` `is-production-build.ts` `` and `` `POST /api/…` `` mid-token in two comments.
  - The `bookRef` comment in `use-item-availability.ts` is hard to read.
  - `openAfterCounting` overwrites `countingRef` without aborting the old controller. It is safe today, but a second entry path should abort it.
  - `abortion(signal)` never removes its listener. This is bounded.

Residuals:
- A read can hold the usage slot for about 65 s in the worst case: 15 s, then up to two busy retries.
- A linked-accessory switch-off with a real count is not yet pressed in production. It becomes reachable at R4b.

The revision of R4a2's rule, recorded at R4a5: The usage *route* omits a tier or linked accessory that the server's active book does not state, and does not answer `0`. The client reads an unmatched item as `unavailable`, so a stale screen shows no false `0`. `countItemUsage` and `countUsageProbes` keep answering `0` for in-process callers.

*Before the next push:* the tests-only wave `m10/flake-fixes` (merged 2026-11-05) cleared the earlier blockers:
- The census now lists the K3 live file.
- `plan-preview-model.facing-labels` sweeps a pinned seed.
- `qa-m10-w1-price-stores-wiring` has an explicit timeout.
- `qa-8q2-sink-store` has explicit timeouts.
- The `qa-m10-r2-dashboard-api` property has pinned accepted examples.
- In `client-write-path`, an earlier test now drains its held request.

What still blocks `pnpm ci:local` is the preview database. The two `priced` arms of
`application-role-privileges.test.ts` pass only once preview holds `0023`–`0029` and their grants. The owner runs those
steps.

**R4b split** (architect, 2026-11-05; plan step for R4b at `m10-price-dashboard` @ `cee64a6a`; nothing run, nothing
built). The R4b row, its hand-offs and R4a5's hand-offs come to about twenty items. Under `docs/WORKFLOW.md`'s limit
(5 items, about 5 production files) they split into four sub-waves, R4b1 to R4b4, each merging alone. The row's
rulings (U6-a, the stamped preset copy and seeded mint, availability judged by R4b, criteria (a) and (b)) all stand.
This block says which sub-wave delivers each, and settles what the code shows the row did not foresee.

*Evidence.* Every claim citing source was read at `cee64a6a` (source-verified). R4a6's footprint is from
`git diff --stat m10-price-dashboard...m10/r4a6` at `587d4e48`: **six** production files, not the four named in the
R4b dispatch. They are `publish-plan.ts`, `price-dashboard-service.ts`, `deletion-facts.ts` (new), `publish-source.ts`,
`dashboard-responses.ts` and `price-dashboard/admitted-state-read.ts` (one line). Claims marked **[inf]** are inference.
A plan line is cited as L-number at `cee64a6a`. Lines from L2839 on have since moved down (the R4a6-to-R4c hand-offs and
this block were inserted above them).

*What the code says, which shapes the split* (source-verified).
- **Switch-off is one source away from production.** Item screens take their defaults from `readKitchenDefaults()`
  (`item-page-read.ts:66-70`), which answers `unavailable` in a production build (`kitchen-defaults-source.ts:14`). The
  guard that then holds switch-off at `cannot-judge` is `item-lifecycle-model.ts:101` at this HEAD (the R4a5 row's `:97`
  and the dispatch's `:99` are older numbers). Making that source read the stores turns switch-off on for all three item
  screens; `item-lifecycle-model.ts` does not change.
- **D9 has no production client.** `defaultKitchenDefaultsClient` gives a production build
  `UNAVAILABLE_KITCHEN_DEFAULTS_CLIENT` (`default-kitchen-defaults-client.ts:14-16`).
- **The server pieces to reuse.** `readSavedDefaults` (`lib/server/price-dashboard/saved-defaults.ts:28-36`) returns
  `{revision, defaults}`, parses with R4a1's `readStoredNewKitchenSettings` (domain `new-kitchen-settings.ts:88-100`),
  and throws for a row that does not parse. The write pipeline is exported (`runStaffWrite`, `changedMeanwhile`,
  `refused`, `succeeded`: `price-dashboard-service.ts:455, :551, :733, :741`) and `catalogue-availability.ts` already
  builds a write on it. The **read** pipeline (`admitReader`, `refusalOfReadBucket`, `serveAudited`, `:250-294`) is
  module-private.
- **A design is created in the browser.** Generation (`room/use-generation.ts:397`, which passes no
  `newKitchenSettings` today) and the preset copy (`:315-330`) build the document. `POST /api/designs` takes no body and
  mints `KITCHEN_L_DESIGN` (`app/api/designs/route.ts:85-94`; ADR 0111 decision 1), and the attempt's first `PUT`
  replaces it (`persistence/fetch-configuration-repository.ts:236-241`). So the seeded mint is the row a creation holds
  until its first `PUT` lands, and all a row keeps if that `PUT` never does.
- **Only the browser can change a depth.** `setCabinetDepth` needs a body probe (`commands/set-cabinet-depth.ts:48-56`),
  and only `loadProbeFactory` makes one (`use-generation.ts:445-450`, importing `three-adapter`). No server module
  imports `three-adapter`.
- **Only the command resets a cabinet's own colour.** `setMaterialTier` rewrites every cabinet finish the new material
  does not offer (`commands/set-whole-kitchen-settings.ts:95-110`, ADR 0057). A spread of stamped settings over a
  design with cabinet finishes leaves them unoffered.
- **`stampedSettingsOf` stamps what it is given.** It writes only the keys defined, plus the depth
  (`new-kitchen-settings.ts:64-70`), so `{}` (nothing saved) stamps one key, not six. The fixed tier fallbacks are the
  active book's `defaultTierId`s (`defaults-judgement.ts:42-50`); no domain constant names them.
- **The audit action is ready.** `kitchen-defaults-saved` has its closed detail reader
  (`dashboard-audit-action.ts:268, :525-535`), and §8.4(e) gives its detail (L1129).

*Rulings this split records* (architect, **[inf] until the coordinator accepts them**; the owner may overturn any).
1. **The defaults are completed in one place.** One server function fills every key a saved row lacks from the fixed
   fallbacks: the book's material and hardware `defaultTierId`, the reference depth, `DEFAULT_HANDLE`,
   `TOP_ROW_HANDLE`, and the stamped material's `defaultFinish`. It runs through `stampedSettingsOf`, so the colour
   reset applies. It serves the `GET`'s `saved: false` answer (wire: "`defaults` is then the fixed fallbacks") and every
   stamp. The sample's written-out values (`kitchen-defaults-sample.ts:17-24`) are not copied.
2. **"R4b judges availability itself" means this:** when a new design is stamped, a saved key whose item the active book
   and the availability head do not offer (`judgeKitchenDefaults` says `unavailable`) is replaced by its fixed
   fallback, which is never off. The colour is judged after the material. The `GET` and D9 show the saved value as
   stored, since D9 already marks an unoffered row (`unofferedMembers`).
3. **A failed customer read never blocks a creation.** A store that is unavailable, or a saved row that does not parse,
   stamps the fixed fallbacks and writes one log line with no value in it. With **no active book** (A-10) there is no
   tier id to stamp, so the two tier keys stay absent and the other four are stamped. That is the one exception to
   criterion (b).
   *Amended 2026-11-08 [relayed from the coordinator; the scribe ran nothing]:* the four-key result is not only the
   no-book case. Per the R4b1 hand-off (*To R4b3*, below), the read returns it also when the stores are unavailable or
   the saved row is unreadable.
4. **The seeded mint keeps its fixture's depth.** The mint route stamps the other five keys by the commands' rules and
   keeps `cabinetDepthMm` from `KITCHEN_L_DESIGN`. Criterion (a) forbids spreading a depth, and the server has no
   probe. The row is replaced by the same attempt's first `PUT`, which carries the browser's design stamped at the
   saved depth. Only an orphaned row (one whose `PUT` never lands) keeps the fixture depth: a recorded residual.
   *Rejected:* bundling `three-adapter` into the unauthenticated mint route (SEC-001's route, ADR 0111) to rebuild
   every body on every mint. **The scribe records this as a dated amendment to the 2026-10-27 ruling on the R4b row**,
   whose "seeded mint" half it narrows.
5. **A preset copy that `setCabinetDepth` refuses keeps the preset's depth**, with the other five keys stamped. A copy is
   never refused for its depth: that would be a dead end (DEVELOPMENT-SPEC §2/§4, the H2 ruling (7)). **[inf]** Step 1's
   offers are not evaluated at the saved depth (`use-presets.ts` was not traced that far). **Owner question, proposed
   for §6.4 (OQ-R4b-1):** should Step 1 offer only presets that fit at the saved depth? It blocks nothing.
6. **The browser receives the defaults as a prop of the room page, never from a public route.** That adds no
   unauthenticated surface and no bucket. Only the six values travel: no revision, no save time, no staff fact, no
   list of offered ids. They are as of the page load, so a save made while a customer sits on Step 1 reaches that
   customer's next load (a residual).
7. **A save that changes nothing writes nothing.** When the whole defaults sent equal the saved whole, the answer is
   `200` with the current revisions and no audit row, whatever the expected revisions say, with the bucket spent first.
   This matches R4a1's no-op ruling (L2622-2627). Otherwise `changedFields` lists the members whose value differs from
   the saved whole (on the first save, from rule 1's completion of `{}`), and is never empty.
8. **A duplicate is not a new kitchen.** `app/api/account/kitchens/[id]/duplicate` copies its source's settings, and
   no defaults are stamped on it (A-9: a saved kitchen never reads them).
9. **The `GET` reuses the read pipeline.** R4b2 exports the service's admission, read bucket and audited serve as one
   function, so `GET …/defaults` is admitted, limited and audited exactly like `GET /api/staff/prices`, with no second
   copy. This is why R4b2 waits for R4a6, which holds the service.
10. **The stamp composes the public commands and moves no timestamp.** `setMaterialTier`, `setHardwareTier`,
    `setGlobalFinish` and `setKitchenHandle`, in that order, then the top-row handle as H-3's stamped key. Each tier
    command is given the stamped tier as its only offered id (`availableTierIds`,
    `set-whole-kitchen-settings.ts:43-48`), because rule 2 has already judged it against the book and the head; with no
    book (rule 3) the two tier commands are skipped. A refusal at this seam is a programming error and throws, as
    `stampedSettingsOf` does. The clock given to every command is the design's own `updatedAt`, so the stamp changes no
    timestamp. *Rejected:* exporting the commands' private reset (`resolveFinishesTheTierDoesNotOffer`), which would
    put a seventh file, `set-whole-kitchen-settings.ts`, in R4b3.
11. **The preset copy keeps one attempt per preset.** `usePresetCopy` builds its attempt synchronously on the first
    tap and reuses it on the next (`use-generation.ts:315-330`), while the probe that moves a depth arrives by an
    `await`. The copy is therefore stamped either when the offers are evaluated (Step 1 already leases a probe there,
    `use-presets.ts` imports `loadProbeFactory`), or behind one memoised entry made synchronously on the first tap. The
    implementer picks one and states it in the dispatch report. The attempt sites stay the two
    `use-generation.ts:10-11` names. If the first route is taken, `use-presets.ts` joins R4b3's files, stated.

*Sub-waves.* Lane R's header tier is Full + security; R4b4 changes no server file and gets a lighter tier, recorded.
A "live in production" below holds only once the Z gate has applied `0023`–`0029` there. Before that the Neon stores
answer `unavailable`: the staff routes answer `503`, D9 shows its unavailable screen, switch-off stays `cannot-judge`,
and new kitchens get rule 3's fixed fallbacks.

| Sub-wave | Items (≤ 5) | Production files | Depends on | Tier | Off in production until | Reading |
| --- | --- | --- | --- | --- | --- | --- |
| **R4b1** the defaults write and the server reads (runs beside R4a6) | (1) `PUT /api/staff/prices/defaults` with `KitchenDefaultsSaveRequestWire`, through `runStaffWrite`: session and `price.edit`, then the members, then the shared `staff-price-draft-by-account` bucket (ADR 0178, 2026-10-27), then the stores. Exactly three members, and `defaults` exactly six. A missing one is `400 MISSING_VALUE`, an undeclared depth or handle `400 UNKNOWN_VALUE`, each naming its field, all **before** `stampedSettingsOf` (which throws `NewKitchenSettingsError`). (2) The judgement, reading the head first, then the book, then the saved defaults (R4a1's order): no book is `409 no-active-version`; a stale head `409 availability-changed-meanwhile`; a stale saved revision `409 changed-meanwhile`; `judgeKitchenDefaults(defaults, {book, availability})` answers `409 item-unavailable {item}` or `400 FINISH_NOT_IN_PALETTE`. Then `stampedSettingsOf` (M3 hand-off, L1567), and `save` with the stamped whole; the store's two CAS refusals map to the same `409`s. (3) The `kitchen-defaults-saved {changedFields}` row, committed with the save (R-c), and rule 7. (4) Rule 1's completion, and the read for an admitted page: the state wire (revision, head, `saved`, the whole defaults) with the tier offers and `disabled`, all from **one** head read. It takes no session, bucket or audit row, because a render must not write. (5) The customer read: the whole six, judged by rule 2, failing by rule 3 | the defaults route (new; `PUT` only), `lib/server/price-dashboard/kitchen-defaults-save.ts` (new; items 1–3), `lib/server/price-dashboard/new-kitchen-defaults.ts` (new; items 4–5, over `readSavedDefaults`), `dashboard-audit-entries.ts` (one builder). Four. Its responses live in its own module: `dashboard-responses.ts` is R4a6's | merged only (R4a1) | Full + security | The route answers a `price.edit` session from this merge, but no production client sends it until R4b2. The two reads have no caller until R4b2 and R4b3 | This block; the R4b row; R-c; ADR 0178 (A-17, F1, m2, m3; 2026-10-27 buckets); §8.4(c) `KitchenDefaultsStore` (L1051), (d) X0-5 (L1068-1069), (e) L1129; A-9 (L362-369); M3 hand-offs (L1564-1573); `saved-defaults.ts`; `catalogue-availability.ts` (the pattern); `price-dashboard-service.ts:317-498, :551, :733-747`; domain `new-kitchen-settings.ts`, `defaults-judgement.ts`; `m10-ports.ts:324-374`; wire `:113-122, :482-540`; `kitchen-defaults-stand-in-client.ts` (the judgement the route must equal); `dashboard-audit-action.ts:180, 268, 525` |
| **R4b2** D9 and switch-off live in production (after R4a6 merges) | (1) `GET /api/staff/prices/defaults` answers `KitchenDefaultsStateWire` from R4b1's read, audited `price-catalogue-viewed {section: "defaults"}` under the `staff-prices-read-by-account` bucket, through the read pipeline the service now exports (rule 9; no behaviour change to the other reads). (2) `fetching-kitchen-defaults-client.ts`: `save` goes to the `PUT` and its answers map as `kitchen-defaults-client.ts:12-16` lists; a `401` is `failed`, since the client's outcomes have no session state. `readAgain` reads the defaults, then `GET /api/staff/prices` for the tier offers and `disabled`. When the two heads differ it answers `undefined` and never joins them. (3) `defaultKitchenDefaultsClient` gives a production build the fetching client, keeping the literal `NODE_ENV` test (`is-production-build.ts:1-7` says why). (4) `readKitchenDefaults()` in a production build reads R4b1's admitted-page read through `readAdmitted`; any failure is `unavailable`. D9 and every item screen's `defaults` become known, so switch-off leaves `cannot-judge`. (5) The carried checks: U6's failed and refused-save states (§13.3, L3165), and the linked-accessory switch-off with a real count (R4a5 residual, L2863) | the defaults route (adds `GET`), `price-dashboard-service.ts` (one export), `fetching-kitchen-defaults-client.ts` (new), `default-kitchen-defaults-client.ts`, `kitchen-defaults-source.ts`. Five | R4b1; **R4a6 merged** (it holds the service) | Full + security + visual | Live at this merge: D9's save and switch-off. Delete of a stated row stays off until R4c (R4a5's gate). OQ-11f's "Switch off (until R4b)" ends here; the wording stays for Delete | This block; rules 7 and 9; the R4a5 row and *R4a5 merged* (L2544, L2849-2865); U6 row and U6-a (L2893, L2924-2926); frames D9A–C [mock L752-756, L881]; OQ-11f (L769); RK-18; `kitchen-defaults-client.ts`, `kitchen-defaults-stand-in-client.ts`, `use-kitchen-defaults.ts`, `kitchen-defaults-model.ts:36-47, :285-296`; `item-page-read.ts`; `item-lifecycle-model.ts:81-108`; `admitted-state-read.ts`; `price-dashboard-service.ts:129-311`; `browser-and-visual-qa.md` |
| **R4b3** stamping new kitchens (beside R4b2, after R4b1) | (1) A domain function that stamps a whole design with the six settings **through the commands, as rule 10 says**: `setMaterialTier` (ADR 0057, cabinets' own finishes reset), hardware, the kitchen colour and handle, then the top-row handle as H-3's stamped key. **It never writes the depth.** It is added to `new-kitchen-settings.ts`, held for one function as R4a1 held it, and named in `generation/index.ts`. (2) The room page reads R4b1's customer read and hands the six values to `RoomScreen`, which hands them to the run. The page keeps its shell rules (`page.tsx:16-29`, M7 criterion 17). (3) Generation passes them to `generateKitchen` as `newKitchenSettings`; H2 already threads the depth natively. (4) The preset copy is stamped by item 1, then moved by `setCabinetDepth` with a leased probe when the depths differ (rule 5 when it refuses), keeping one attempt per preset (rule 11). (5) The seeded mint: `POST /api/designs` writes `KITCHEN_L_DESIGN` stamped by item 1 at the fixture's depth (rule 4). It keeps ADR 0111 decision 1 (no body), and reads the defaults only after its cross-site guard and limiter (`route.ts:36-46`) | domain `generation/new-kitchen-settings.ts` and `generation/index.ts` (one name), `app/[locale]/configurator/room/page.tsx`, `room/room-screen.tsx`, `room/use-generation.ts`, `app/api/designs/route.ts`. Six, stated, with a mini-review: the index is one name. `room/**` has no lane in §8.1; R4b3 holds the three room files | R4b1; H2 merged | Full + security + visual | Live at this merge: every new kitchen is stamped | This block; rules 2–6, 8, 10 and 11; the R4b row (criteria (a), (b)); H2 row, H-3, H-5 (L1742, L1750-1762); H2-a, H2-b (L1807-1815); A-9; RK-7; ADR 0111 (decision 1, A3); ADR 0057; ADR 0099 decision 10; ADR 0071 Amendment; DEVELOPMENT-SPEC §2 and §4 (dead ends); `docs/best-practices/product-invariants.md` (depth); `new-kitchen-settings.ts`; `generate-kitchen.ts:149-172, :281-284`; `commands/set-cabinet-depth.ts:48-80`; `commands/set-whole-kitchen-settings.ts`; `use-generation.ts`; `create-design.ts`; `fetch-configuration-repository.ts:200-260` |
| **R4b4** R4a5's UI hand-offs (any free slot) | (1) A switch row that cannot be pressed has the disabled look, the treatment R4a5 gave the delete buttons. (2) On desktop, a created row's menu popover no longer covers its "De publicat" chip. (3) `openAfterCounting` aborts the controller it replaces. (4) `abortion(signal)` removes its listener once the read settles. (5) The comments: the two re-wraps that split `` `is-production-build.ts` `` and `` `POST /api/…` `` mid-token (`default-item-lifecycle-client.ts:9-10`, `fetching-item-lifecycle-client.ts:29-30`), and the `bookRef` comment (`use-item-availability.ts:130`) | `item-edit-parts.tsx`, `item-row-menu.tsx`, `item-screen.module.css` **[inf: where the switch row's and the popover's styles live]**, `use-item-availability.ts`, `fetching-item-lifecycle-client.ts`, `default-item-lifecycle-client.ts`. Six, stated, with a mini-review: two of them are comment-only | merged only | Light (combined logic and clean-code) + visual. Items 3 and 4 change behaviour, so they are not CSS-only | Nothing is gated | This block; *R4a5 merged* (L2849-2865); frames D4E/F, D5C/D/G, D6C; `item-edit-parts.tsx`; `item-row-menu.tsx`; `use-item-availability.ts:120-240`; `fetching-item-lifecycle-client.ts:120-160`; `engineering-conventions.md`; `browser-and-visual-qa.md` |

*Order and parallelism (at most two R4b sub-waves at once).* Each pair below has disjoint production files, and none
of them shares a file with R4a6's six.
1. **R4b1 ∥ R4a6**, now. R4b1 touches neither the service nor `dashboard-responses.ts`.
2. **R4b4** takes the next free slot. It shares no file with any other wave.
3. **R4b2 ∥ R4b3**, once R4b1 and R4a6 have merged. R4b3 needs only R4b1, so it may start as soon as R4b1 merges.

R4b1 creates the defaults route file and R4b2 adds its `GET`, in sequence, never at once. R4c's end-to-end arm of R-d
("draft deletes X → defaults save names X → publish", L2444-2445) needs only R4b1's `PUT`.

*Migrations.* **None, and no owner approval is needed.**
- `0029_create_kitchen_defaults.sql` holds the table, and S3's store reads and writes it.
- `kitchen-defaults-saved` and `price-catalogue-viewed {section: "defaults"}` are existing closed-list entries with
  readers. Audit actions are only shape-checked (`0020`, per *R4a split*).
- No new bucket: the `PUT` spends `staff-price-draft-by-account`, the `GET` `staff-prices-read-by-account`. No
  `limit-policy.ts` change.
- The customer read and the mint's read use the same application role and the stores R1 and S3 already wired
  **[inf: the grants were not re-read; S3's live suites exercise the defaults store under that role]**.
- If a sub-wave finds it needs a table, column, index or grant, it stops and returns to planning. A migration is asked
  of the owner every time.

*Contradictions settled.*
- **"The mint and generation pass the saved defaults into H2's request" against the code.** Only generation takes
  H2's request. The preset copy and the seeded mint do not go through `generateKitchen`, as the row's own 2026-10-27
  ruling says; R4b3 item 1 is the stamp they share.
- **Criterion (a) for the seeded mint against a server with no probe.** Settled by rule 4.
- **Criterion (b) against `stampedSettingsOf` stamping only what it is given.** Settled by rule 1; with no active book,
  rule 3's exception.
- **"Reuse `stampedSettingsOf` on those paths" against ADR 0057's per-cabinet reset.** A spread of its output over a
  preset copy keeps cabinet finishes the stamped material does not offer. R4b3 stamps by the commands' rules; criterion
  (c) below holds it.
- **The client half of U4a's "R4a reads the defaults itself" (L1508; *R4a split*, L2500: "client side, R4b")** is
  R4b2 item 4. It is a server-side page read, not a browser fetch.
- **The R4a5 row's `item-lifecycle-model.ts:97`** is `:101` at `cee64a6a`; the same guard.
- **R4a6's file list in the dispatch (four)** against its diff (six). Ordering by the six keeps R4b1 clear of it.

*Acceptance.* R-c applies to every R4b write as listed.
- **R4b1:**
  - **must-not:** a malformed body reaches `stampedSettingsOf` and answers `503`. A sweep over a missing member,
    `null`, an extra member and a wrong type answers `400` naming the field, writes nothing and spends no bucket;
  - property (the `javascript-testing-expert` skill applies): for any availability state and any whole defaults over
    the book's tiers, the route's answer equals `judgeKitchenDefaults`' verdict (`unavailable` is
    `409 item-unavailable` with that item, `colour-not-in-palette` is `400 FINISH_NOT_IN_PALETTE`, `acceptable` is
    `200`), except rule 7's no-op. The same inputs give the same outcome kind from `inMemoryKitchenDefaultsClient`;
  - **must-not:** an item switched off between the route's reads and its save is saved as a default. Tested by
    switching between the head read and the save: the store answers `availability-changed-meanwhile`;
  - a `200` answers the store's new revision and the head after the save, which moved exactly once (m3);
  - round trip: what is saved reads back through `readSavedDefaults` as the stamped whole, all six keys;
  - R-c: one row per save, in its transaction; `changedFields` equals the differing members and is never empty; an audit
    failure is `503` with nothing saved; an operator session gets `403`;
  - property: for every partial saved row (`{}` included), rule 1's completion carries all six keys, keeps each key
    present (after the colour reset) and takes every absent key from the fixed fallbacks;
  - **must-not:** the customer read returns an item the head has off. Property over availability states: no key names
    an item `isItemOffered` refuses, and with every saved item on, it equals the completion;
  - the customer read with an unavailable store or an unparseable row returns the fixed fallbacks, logs one line with no
    value, and does not throw;
  - the admitted-page read writes no audit row and spends no bucket, and its `availabilityRevision` and `disabled` come
    from the same head;
  - the production store selection with no `DATABASE_URL` (no fake-price-book flag; `price-stores.ts:46-56, :97-104`):
    the `PUT` is `503`, and the customer read gives the fixed fallbacks.
- **R4b2:**
  - in a production build, an item that is not a default and leaves another option on offers its switch-off dialog
    (D4E, D5C, D6C), while a saved default, a fixed default and the last option keep their refusals;
  - **must-not:** a saved row that does not parse turns switch-off on. D9 shows its unavailable screen, and every item
    screen keeps `cannot-judge`;
  - R4a5's must-not stays green: Delete of a stated row is off in a production build with the defaults now readable;
  - the linked-accessory switch-off is pressed in a `CI=1` build. A DOM test over planted designs shows its non-zero
    count in the dialog; the browser shows the seeded world's 0, R4a5's recorded residual;
  - a table over `200`, each `400` code, `409 item-unavailable`, both `409` CAS words, `401`, `403`, `429`, `503` and a
    network failure gives the fetching client the stand-in's outcome kinds;
  - **must-not:** `readAgain` joins two heads. With a moved head between its two reads it answers `undefined`, and the
    page shows its failed notice, never a mixed state;
  - the `GET` writes one `price-catalogue-viewed {section: "defaults"}` row per read, gives an operator `403`, and with
    nothing saved answers `saved: false` with R4b1's completion;
  - visual, at 390 × 844 and 1440 × 900 in a `CI=1` build: D9A–C, the failed and refused-save states (§13.3), and a
    save that survives a reload.
- **R4b3:**
  - **(a), property:** for any preset copy and any saved depth *d*, the stamped copy equals
    `setCabinetDepth(stamp(copy), d)`. Sabotage: spreading `cabinetDepthMm` over the copy's settings turns it red;
  - **(b), property:** every design created through generation, a preset copy or the seeded mint carries all six keys,
    over saved rows from `{}` to whole (rule 3's four-key exception aside: no active book, stores unavailable or the
    saved row unreadable; amended 2026-11-08, see rule 3);
  - **(c), new, property:** for any design whose cabinets carry their own finishes and any stamped material, no cabinet
    keeps a finish the material does not offer, and the result equals rule 10's commands applied in its order, with the
    stamped tier as each tier command's only offered id. Its `createdAt` and `updatedAt` are the design's own;
  - **must-not:** two fast taps on a preset whose depth differs from the saved one mint two rows. Exactly one row is
    minted, and the attempt sites stay two (rule 11);
  - **U6-a, end to end:** after a `PUT`, the next Step 1 load creates a generated kitchen and a preset copy carrying the
    saved six, and a kitchen saved before the `PUT` is byte-identical after it (H2-a at the route level; RK-7);
  - **must-not:** a duplicate is stamped. A duplicated kitchen keeps its source's settings under any saved defaults
    (rule 8);
  - **must-not:** a mint refused by its cross-site guard or its limiter reads the defaults;
  - with nothing saved, the seeded mint and a generated kitchen price and render exactly as at `cee64a6a` (golden). The
    documents differ only by explicit keys, each equal to what the reader resolved before;
  - a preset whose `setCabinetDepth` refuses is copied at its own depth with the other five keys stamped, and never
    shows "failed" for its depth (rule 5);
  - browser, `CI=1`: from Step 1 the editor opens with the saved material, colour, handle and depth in the settings
    sheet; visual at 390 and 1440.
- **R4b4:**
  - a switch row that cannot be pressed draws disabled, and one that can draws as before (visual at 390 and 1440);
  - at 1100 and 1440 the open popover's box and the "De publicat" chip's box do not intersect (a browser assertion);
  - a second count entry aborts the first one's signal, and the first answer opens no dialog;
  - after a read settles, `abortion`'s listener is gone.

*Risks and residuals.*
- **Every seeded document changes shape.** The e2e fixture that mints the seeded design (ADR 0111 A3) gets the explicit
  keys. A test that compares a minted document with `KITCHEN_L_DESIGN` goes red; R4b3's QA updates the comparison and
  keeps the price and scene golden. It never loosens it **[inf: which tests compare was not searched]**.
- **Step 1 waits on a database read.** The room page now reads the defaults, the head and the book per load. Rule 3
  keeps a failure from blocking it; the latency is unmeasured **[inf]**. Customer pages already read the book per load
  (`with-active-price-book.tsx`).
- **An orphaned seeded row keeps the fixture depth** (rule 4).
- **A preset copy can miss the saved depth** (rule 5; OQ-R4b-1).
- **`readAgain` writes two read-audit rows** (`catalogue` and `defaults`). Accepted: each is a real read.
- **D9's recovery depends on the dashboard read.** `GET /api/staff/prices` answers `409 draft-unreadable` (R2's Q2,
  L2371) and `409 no-active-version`. So after a conflict, `readAgain` fails whenever the draft is unreadable, though D9
  never needs the draft; the page shows its failed notice. Accepted for R4b: discard-all heals the draft.
- **R4b2 and R4b4 edit `price-dashboard/**`**, which §8.1 gives lane U and forbids to R. R4a5 set the precedent, as an
  R sub-wave owning client files in that directory; per-file ownership (§9.1) still holds, since no U wave is open.
- **RK-18 widens at R4b2.** Every non-default item's switch-off reaches customers at once. The mitigations are RK-18's.

*Verification, per sub-wave.*
- Route tests over the fake world (`tests/support/price-dashboard-world`), and the properties above with `fast-check`.
- `pnpm check` on each merge, and `pnpm ci:local` before any push.
- Browser runs under `next dev` and `CI=1` for R4b2, R4b3 and R4b4. None publishes (the U5c record). Only `CI=1`
  reaches the real routes: its server is a production build over the seeded fakes (`price-stores.ts:46-56`), so the
  fetching clients run, while `next dev` keeps the in-memory stand-ins (§13.3, L3165). U6-a's browser arm and every
  "survives a reload" check therefore run under `CI=1`.
- No live Postgres arm is new: S3's live suites hold the defaults store.

*Reading, QA and reviewers.*
- **QA of each sub-wave:** its row's Reading, that sub-wave's acceptance bullets above, and
  `apps/web/tests/api/staff/**`. R4b2 adds `tests/staff/**` and the D9 and item e2e specs (`tests/e2e/hardware*`,
  `materials*`, `accessories*`, and the defaults spec). R4b3 adds `tests/room/**`, `tests/generation/**` and the
  Step 1 e2e specs.
- **Logic review:** the row's Reading, plus §5 A-9 and A-17, and rules 1–11 above. R4b3's reviewer also reads
  DEVELOPMENT-SPEC §2 and §4, and the `lemnaria-3d-reference` skill for the depth rebuild.
- **Security review (R4b1, R4b2, R4b3):** the row's Reading, plus ADR 0019, 0156, 0172 D7 and 0173. R4b3's reviewer
  also reads ADR 0111 and ADR 0114 (the mint and the visitor), and SEC-001's line in `docs/backlog/open.md`.
- **Clean-code review:** the diff, `engineering-conventions.md`, and `price-dashboard-service.ts`'s header (the order
  of checks every route keeps).
- **Visual review (R4b2, R4b3, R4b4):** the frames in each row, and `browser-and-visual-qa.md`.

**R5 split** (architect, 2026-11-08; plan step for R5 at `m10-price-dashboard` @ `bf9bc188`; nothing run, nothing
built). R5's implementer stopped on dispatch. The row names "2 route files, `lib/server/price-notice.ts`", but three
things those files need do not exist. This block splits R5 into three sub-waves, **R5a**, **S7** and **R5b**, and
records the rulings the row left open. The row's items, R-e and the S5 hand-off all stand; this block says which
sub-wave delivers each one, and how. The durable rulings are in ADR 0178, price-notice Amendment of 2026-11-08.

*Evidence.* Every source claim below was read at `bf9bc188` (source-verified), with its line. **[inf]** marks an
inference and says what would falsify it.

*What the row missed (the implementer's stop, re-checked here).*
1. **No production notice store.** `PriceStores` holds `priceBook`, `availability`, `defaults` and `usage` only
   (`price-stores.ts:27-32`). Nothing in `apps/web` constructs `NeonPriceNoticeStore` or `FakePriceNoticeStore`: a grep
   for `PriceNoticeStore|price-notice` finds them in `packages/persistence` alone. The fake needs the raw
   `FakePriceBookStore`, because it asks `hasHeldVersion` (`fake-price-notice-store.ts:26, :74`). The obstacle is
   smaller than reported: inside `seedFakePriceStores` the raw fake exists (`price-book-test-seed.ts:77`) before it is
   wrapped (`:108`), so the notice fake is built there. → **R5a**.
2. **No per-design sent read.** `loadOwned` and `loadAuthorized` select no `sent_at`
   (`neon-configuration-repository.ts:540-545, :573-579`). `SentMarkStore` only writes (`account-kitchen-store.ts:254-260`).
   `findSentReference` answers one design at one revision (`contact-submission-store.ts:83-129`), so a kitchen sent and
   then edited reads `none`. → **S7**.
3. **No read under exactly a save's credential.** The save's token arm authorises on the write-token hash alone
   (`neon-configuration-repository.ts:427-430`), and its account arm on `account_id` (`:473-476`). `loadAuthorized`
   also demands the visitor hash (`:576-577`), which a save does not. `loadOwned` is read-level: visitor or account
   (`:543`). → **S7**, one narrow port that answers 2 and 3.
4. **Unruled:** the buckets, the refusal status, the acknowledgement's refusals, and the mapping of
   `PriceChangeNotComparableError`. → rulings 2–6 below.
5. **The frozen wire disagrees with the row.** X0's `PriceNoticeWire` (`price-dashboard-wire-contract.ts:561-566`)
   holds `current`, `pricesChanged`, `replacementsRequired` and `removedAccessories`, and **no `isSent`**. The row has
   `isSent` and omits `replacementsRequired`. No file but the contract names `PriceNoticeWire` or `PriceStampWire` (grep
   over `apps/web/src` and `apps/web/tests`), so amending it now costs no consumer. → ruling 7, in **R5a**.

*Rulings (architect, 2026-11-08; recorded in ADR 0178, price-notice Amendment of 2026-11-08).*

1. **The credential is the save's choice, with the cross-site refusal first.**
   - A write-token cookie for the design gives its hash, **never with the visitor cookie**: the save's token arm
     (`app/api/designs/[id]/route.ts:206-216`; predicate `neon-configuration-repository.ts:427-430`). Otherwise, a client
     session that may edit (`editingAccountIdOf`, `design-reader.ts:54`). Otherwise, no credential.
   - Unlike the save, a cross-site request is refused on **both** arms, before any cookie is read (R-e; S5 hand-off 5).
     The save asks `isCrossSiteRequest` on the account arm only (`route.ts:214`), so it accepts a token cross-site. The
     notice routes do not.
   - A staff session gives no account credential: `readingAccountOf` needs `design.read.own`, which only a client holds
     (`design-reader.ts:32-41`). A share-link view reads no cookie and calls no API (ADR 0114 G5).
   - The cookie reaches both routes. It is scoped `Path=/api/designs/{id}` (`write-token.ts:49, :115`), a path prefix of
     `/api/designs/{id}/price-notice`. The preset route relies on the same scoping (its header comment).
   - The design is then read under that credential by S7's `loadEditable`, before any marker read or write (S5
     hand-off 3).
   - *Rejected:*
     - `loadAuthorized` (token **and** visitor). It is stricter than a save. A browser whose visitor value another tab
       rotated away (ADR 0114 Amendment H1) keeps saving, but would never see its notice.
     - `loadOwned` with `isOwnedByAccount`. That serves the account arm only. Its visitor arm is read-level, so a
       browser whose write token expired (30 days, `write-token.ts:18`), and which cannot save, could write markers.
     - Extracting `saveCredentialOf` from the save route. That file is not lane R's. R5b rebuilds the choice from the
       exported helpers (`readWriteTokenHash`, `isCrossSiteRequest`, `editingAccountIdOf`), and a parity test holds it
       to the save's (R5b-b).
2. **Every refusal for lack of edit authority is the byte-identical `404`** (`designNotFoundResponse`, with its
   headers). That covers no credential, a wrong or foreign credential, a cross-site request, an unknown or malformed
   id, a hidden or deleted design, a staff session and a share token.
   - Precedent: the routes under the design's own path. ADR 0114 G4, for share: "Every refusal is the byte-identical
     404 a missing design gets". The preset route answers the same (`preset/route.ts`, its `POST`).
   - *Rejected:* the save's `403` (`writeForbiddenResponse`). It serves the save client's reload-or-overwrite flow.
     The notice client never needs to tell "not yours" from "absent", because `canWrite` already gates the call.
3. **Buckets: reuse, and no new figure.**
   - `GET`: `refusalOfReadLimit` (`read-by-block`, 600 an hour per block; `limit-policy.ts:83-84, :298`). It is asked
     first, before any cookie or lookup, as the design `GET` asks it (`route.ts:102`), and it fails open. The `GET`'s
     only write is `recordIfAbsent`: at most one row per design for the design's whole life (`on conflict do nothing`,
     `price-notice-statements.ts:41`), written only for an edit-authorised caller. Designs themselves are bounded by
     the mint (ADR 0147). ADR 0019 decision 5's "writes fail closed" guards a write that adds rows or spends a resource
     on every call; this write cannot.
   - `POST`: `refusalOfSaveLimit(headers, credential)`: `design-save-by-block`, 600 an hour, then
     `design-save-by-credential` or `design-save-by-account`, 300 an hour (`limit-policy.ts:73-75`). It is asked after
     the credential and before the body, as the save asks it (`route.ts:167`), and it fails closed (`503`). An
     acknowledgement spends one save token. A person acknowledges at most once per notice.
   - Consequence: an editor open spends one more `read-by-block` token than before, for the notice `GET` **[inf: the
     page interceptor and the design `GET` already count there, ADR 0156's title; falsified if the page is counted
     elsewhere]**. `READS_PER_BLOCK_FIGURE` stays the owner's to retune.
   - *Rejected:* new buckets (two more provisional figures to retune, with no measured need); and counting the `GET`
     under the save buckets (a limiter outage would blank every open's notice and sent note, to bound a write that
     already writes once).
4. **The order of checks.**
   - `GET`: the read limiter, then the id's shape (`isDesignId`), then cross-site, then the credential, then
     `loadEditable`, then the judgement (ruling 6).
   - `POST`: the id's shape, then cross-site, then the credential, then the save limiter, then the media type (`415`),
     then the body bound (`413`; 1 KiB **[inf: the two members fit in under 100 bytes]**), then the members (`400`),
     then `loadEditable`, then `recordAcknowledged`.
   - No refusal before `loadEditable` reads the designs, price or notice stores (the limiter's own counter aside). An
     unauthorised `POST` spends no save token.
   - Neither route calls `touchCurrentSession`. The design `GET` of the same open already does (`route.ts:108-110`),
     and this keeps the notice routes from writing session rows.
5. **The acknowledgement.**
   - The body is exactly `{versionId, availabilityRevision}` (`PriceNoticeAcknowledgeRequestWire`).
     - Not an object, or a member beyond those two: `400 invalid-request`, nothing echoed (the draft routes'
       `MALFORMED`, through `membersOf`, `draft-requests.ts:423`).
     - A member absent or not a string: `400 invalid-input`, `MISSING_VALUE`, naming the member.
     - The wrong shape: a version id the store's own `isMintedId` refuses (exactly 21 of `[A-Za-z0-9_-]`,
       `dashboard-store-shapes.ts:213-217`), or a revision the domain's `isRevisionShape` refuses (R2b, merged:
       `configurator-domain/src/revision-shape.ts:14`, exported at `index.ts:309`). That is `400 invalid-input`,
       `UNKNOWN_VALUE`, naming the member, before the store (S5 hand-off 4).
     - **Not the dashboard's `isVersionId`** (`identifier-shape.ts:24`): it admits 1 to `MAX_IDENTIFIER_LENGTH`
       characters, so a 20-character id would pass it and make the store throw `invalid-request`, a 5xx. `isMintedId`
       is not exported from `@lemnaria/persistence` at `bf9bc188` (its `index.ts` names neither shape check), so S7
       exports it (S7 item 5). As defence in depth, R5b also answers a store `invalid-request` from
       `recordAcknowledged` as that same `400`, never a 5xx.
   - The store's refusals: `400 {status: "unknown-version"}` and `400 {status: "revision-ahead"}` (§8.4(d), m5).
     Success: `200 {acknowledged: pair}` (`PriceNoticeAcknowledgedWire`).
   - It never touches `designs`, and writes no audit row (F3).
   - **Which pair.** The client sends the pair the page displayed: the editor root's
     `{versionId, availability.revision}` (R1's server prop). Never the `GET`'s `current` (A-11; the wire's own
     comment at `:568-569`).
6. **The judgement in `price-notice.ts`, and the mapping of `PriceChangeNotComparableError`.**
   1. Read `readActivePriceBook`: R1's root, the reader that prices the page (S5 hand-off 1). On `NO_PRICE_BOOK`,
      answer the `no-active-version` arm with `isSent`. **No marker is read or written.**
   2. Compute `replacementsRequired` over the stored design, the active book and current availability.
      `NoReplacementOptionError` is a defect: `500` with a closed body, one log line, and nothing written. Never an
      empty sheet.
   3. Read `readAcknowledged`. On `NEVER_RECORDED`, call `recordIfAbsent(current)`, and answer `pricesChanged: false`
      with `removedAccessories: []`.
   4. If the marker equals `current` in both members, answer `false` and `[]`, with no read of the seen side.
   5. Otherwise (the marker differs from `current`), **always read the seen side**: `readVersion(marker.versionId)`
      through `readBookOf` (seam 1: parse, project and the version check), and `readAt(marker.availabilityRevision)`
      through `projectAvailability`. The seen side is **readable** when both succeed. It is **unreadable** when the
      version is not found, does not parse or fails the version check, or when `projectAvailability` refuses
      (`too-large` or `unreadable`); each of those writes one log line, since none is reachable without a forged
      marker (`0028`'s residual). A `DashboardStoreError` from either read, as from `readAcknowledged` or
      `recordIfAbsent`, is `503`, with nothing written after it, and is **never** read as unreadable: an outage must
      not light the notice on every open.
   6. `pricesChanged`, in this order:
      - **price the active side first**, with `priceDesign`. Any refusal answers `false`. `REPLACEMENT_REQUIRED`
        belongs to the sheet (step 2's rows). Any other code is the editor's own refusal, which already shows no
        figure, and C1's copy ("Prețul afișat este cel actual") presumes one. The route makes this check itself:
        `pricesChangedBetween` prices the seen side first, so its error's `side` cannot show that the active side
        priced;
      - the active side priced and the seen side unreadable: **`true`**;
      - both readable: `pricesChangedBetween`'s answer, and **`true`** on its `PriceChangeNotComparableError` (which
        can then only be the seen side's).
   7. `removedAccessories`, **whenever the marker differs from `current`**, whatever the active side answered (C4D
      shows the info row beside a pending replacement): `removedAccessoriesSince({design, catalog, seenBook,
      activeBook, seen, current})` when the seen side is readable, and `[]` when it is unreadable or on
      `UnknownBodyError`. Each entry is the accessory's id, plus an `authoredName` for a linked row only: the active
      book's if it states the row, otherwise the seen book's. ADR 0178's Amendment of 2026-11-04 (item 1) already says
      a deleted linked accessory is "named from the seen book", and only the server holds that book. Built-ins carry
      no name; the client names them from its messages.
   - *Why the seen side answers `true`.* The seen pair never changes: versions are append-only, and so is the
     availability log. Once a marker exists, A-11 lets only the customer move it, by dismissing the notice or
     completing the sheet. So a seen-side refusal never clears by itself. `false` would silence the notice for that
     design for good, through every later real change. `true` costs one notice, perhaps partly spurious, and
     acknowledging it moves the marker and heals the state. It is also what P4b's error exists for: answering "no
     change" for it "would hide a price that moved" (`price-change-notice.ts:32-33`). The active side differs: its
     refusal clears without the marker moving. Completing the sheet writes the marker, and any other code clears when
     the book or the design changes. **Owner-visible; queued as OQ-40, with this default.**
   - *Rejected:* `false` for a seen-side refusal (it silences the notice permanently); letting the `GET` move the
     marker on a seen-side refusal (it re-decides A-11's list of writers, F8, and swallows a real change).
7. **The wire, amended (R5a).** `PriceNoticeWire` becomes a union of two arms:
   - `{kind: "active-version", isSent, current, pricesChanged, replacementsRequired, removedAccessories}`;
   - `{kind: "no-active-version", isSent}`;
   - `removedAccessories` is `RemovedAccessoryWire[]`, where `RemovedAccessoryWire` is `{accessoryId, authoredName?}`
     (closed keys; `authoredName` only for a linked row).
   - `PriceStampWire`, the acknowledgement's request and answer, `PRICE_NOTICE_REFUSALS` and `PriceNoticeInvalidWire`
     are unchanged.
   - Bodies are built member by member, never spread. Every `200` carries `PER_CREDENTIAL_HEADERS`, as the design
     `GET`'s does (`route.ts:126`).
   - *Why `isSent` goes here, not on the design `GET` beside `canWrite`:* that route file is not lane R's, and the row
     names the notice `GET`. *Why a union:* with no book there is no `current`, yet `isSent` must still reach Q4.
8. **`isSent` is `designs.sent_at is not null`, read by S7 in the statement that authorises.**
   - Once sent, always sent. `markSent` sets `sent_at` once and nothing clears it (`account-kitchen-store.ts:255-259`;
     the statement, `neon-account-kitchen-store.ts:436-437`). The account list reads the same predicate (`:104`).
   - **A kitchen sent and then edited is still sent.** That is the case C5A exists for. ADR 0062 Amendment 5 keeps a
     sent kitchen editable (point 1) and gives it the note "Modificările se văd și la noi" (point 3), which presumes
     edits after sending.
   - A hidden or deleted design is refused before `isSent` is read. A duplicate starts unsent
     (`neon-account-kitchen-store.ts:253`).
   - A request stored before the sent mark existed leaves its kitchen unmarked. That is ADR 0172's O11 (no backfill),
     already ruled, so it raises no new question.
   - *Rejected:* `findSentReference` at the current revision (it reads `none` once the kitchen is edited, against
     point 3); a join to `contact_submissions` (a second store, and ADR 0153 keeps the application role from that
     table's personal columns; the join is not needed).
9. **Check-then-write, recorded.** The marker write follows a separate authorisation read: `loadEditable`, then
   `recordIfAbsent` or `recordAcknowledged`. ADR 0019 decision 1 rejects that window for a **design** write. Here it is
   accepted: a hide or delete landing between the two leaves a marker for a closed design, which changes no design, no
   price and no request. That is `0028`'s accepted residual, and the table has no foreign key on purpose. *Rejected:*
   folding the credential into the marker statements. It would reopen S5's merged port, statements and contract
   suite, for nothing the residual does not already accept.

*Sub-waves.* All three are Full + security: lane R's header for R5a and R5b, lane S's for S7. R5a's security reading is
narrow (the store selection that fails closed).

| Sub-wave | Items (≤ 5) | Production files | Depends on | Tier | Off in production until | Reading |
| --- | --- | --- | --- | --- | --- | --- |
| **R5a** the notice store and the wire (runs beside S7) | (1) `PriceStores` gains `notices: PriceNoticeStore`. Production makes `NeonPriceNoticeStore` on first use, as it makes the other four (`price-stores.ts:96-111`). With no `DATABASE_URL`, production holds `UNAVAILABLE_PRICE_NOTICE_STORE`. (2) `UNAVAILABLE_PRICE_NOTICE_STORE`: each of its three methods rejects `DashboardStoreError(operation, "unavailable")`, with the operations `NeonPriceNoticeStore` names (`neon-price-notice-store.ts:36-38`). (3) The seeded world builds one `FakePriceNoticeStore({priceBook, availability})` over the **raw** fakes it already holds, before `stampedWithItsVersionId` wraps the price book. So an acknowledgement is judged against the same versions and head the editor prices under. (4) The wire amendment (ruling 7), in the contract's price-notice section only. (5) The sites that build a whole `PriceStores`. The typecheck names them. Seven test files did so at `bf9bc188` (`tests/support/price-dashboard-world.ts`, `tests/lib/server/price-stores-defaults-and-usage.test.ts`, and five `qa-*` files: `qa-m10-r4b3-creation-paths`, `qa-m10-k2b-kitchen-estimates-route`, `qa-m10-m2-bulk-route.real-planner`, `qa-m10-r4a6-page-and-stores`, `qa-m10-w1-price-stores-wiring`). The implementer edits the first two, and in the five `qa-*` files adds **only** the `notices` member to the fixture literal, changing no assertion, and lists each file for QA to confirm. That is a recorded exception to §9.1's "implementers never edit a QA pin", with a precedent: R4a1's own commit added `defaults` and `usage` to three of these files (`47456e6f`). Without it the branch cannot compile. The implementer reports the count | `price-stores.ts`, `unavailable-price-stores.ts`, `price-book-test-seed.ts`, `price-dashboard/price-dashboard-wire-contract.ts` (the price-notice section). Four | merged only (S5, W1, R4a1) | Full + security | Nothing reads `notices` until R5b | This block (the stop list, ruling 7, the S5 hand-off table); §8.4(c) `PriceNoticeStore` (L1056); *R4a split*, R4a1 item 1 (the precedent for widening `PriceStores`); `price-stores.ts`; `unavailable-price-stores.ts`; `price-book-test-seed.ts`; persistence `fake-price-notice-store.ts`, `neon-price-notice-store.ts`, `m10-ports.ts:586-637`; wire `:541-592` |
| **S7** the editable read (lane S; runs beside R5a) | (1) A narrow port beside `AuthorizedDesignRepository`: `EditableDesignRepository.loadEditable({id, credential: SaveCredential})` answers `{kind: "found", design, revision, isSent}` or `{kind: "none"}`. `NeonConfigurationRepository` implements it, and `index.ts` exports the types. (2) The token arm: `select schema_version, document, revision::text as revision, (sent_at is not null) as is_sent from designs where id = $id and write_token_hash = $hash and hidden_by_client_at is null and deleted_by_client_at is null`. The account arm is the same with `account_id = $a`. These are exactly the `authorised` CTEs of `updateByWriteToken` and `updateByAccount` (`:427-430`, `:473-476`), plus `sent_at`, with no visitor term. (3) As `saveAuthorized` does: no shape check, since a wrong-shaped credential is just the wrong one and answers `none`. It retries a transient failure, being a read. `migrateDesign` runs only on a match, so `InvalidDesignError` reaches the owner alone. (4) Tests: a live parity table against `saveAuthorized` (S7-a), a mocked-driver test of the sent text, and the S4 gate census (`s4-gate-predicate-census.test.ts`), which gains two templates with one gate pair each. That census pin moves, and QA is told. (5) No DDL and no grant: `sent_at` has existed since `0016`, and the same role already reads it (`neon-account-kitchen-store.ts:104`) **[inf: the privilege test was not re-read; falsified if any arm of it changes]**. No fake: `getRepository()` is Neon in every environment (`repository.ts:55-56`), and web route tests stub the port, as they stub `getAuthorizedDesignRepository`. `index.ts` also exports `isMintedId` (`dashboard-store-shapes.ts:215`), the store's own version-id shape, so R5b's acknowledgement checks exactly what the store will (ruling 5): one line, no behaviour | `neon-configuration-repository.ts`, `index.ts`. Two | merged only | Full + security | No caller until R5b | This block (rulings 1, 8 and 9); `neon-configuration-repository.ts:80-241, :370-501, :533-590`; `account-kitchen-store.ts:249-260`; `neon-account-kitchen-store.ts:100-110, :250-255, :416-440`; `s4-gate-predicate-census.test.ts`; ADR 0114 decision 5, H2, G4; ADR 0172 D9 and Amendment G item 3 (the sent mark); ADR 0019 decision 1 |
| **R5b** the two routes (after R5a and S7) | (1) `GET /api/designs/{id}/price-notice` (rulings 2–4, 6 and 7). (2) `POST /api/designs/{id}/price-notice/acknowledge` (rulings 2–5). (3) `lib/server/price-notice.ts`: the judgement (ruling 6) and the acknowledgement, over `PriceStores` and the editable read. It builds no `NextResponse`. (4) `lib/server/price-notice-request.ts`: the credential (ruling 1), the acknowledgement's body reader (ruling 5), and the responses. (5) `getEditableDesignRepository()` in `lib/server/repository.ts`: the shared instance behind S7's port, as `getAuthorizedDesignRepository` is (`repository.ts:51-57`) | the two route files (new), `price-notice.ts` (new), `price-notice-request.ts` (new), `repository.ts` (one getter, a stated window: the file has no M10 owner). Five | R5a, S7 (R1, P4b and S5 are merged) | Full + security | Live at this merge, but nothing calls it until Q3 (`use-price-notice.ts`) and Q4. Until the Z gate applies `0023`–`0029` in production, there is no active book there, so the `GET` answers the `no-active-version` arm and touches no marker | This block (every ruling; the S5 hand-off table); the R5 row; R-e; A-11 (L382-401); §8.4(c) L1056, (d) L1090; ADR 0178 A-11, F8, and its price-notice Amendment of 2026-11-08; ADR 0114 G4, G5, H1; ADR 0172 D9; ADR 0062 Amendment 5, points 1–3; `app/api/designs/[id]/route.ts` (whole: the save's order and credential); `preset/route.ts` (its `POST`) and `share/route.ts` (the `404` precedent); `write-token.ts`; `account/design-reader.ts`; `cross-site-request.ts`; `account/account-request.ts` (`readGuardedBody`, the media-type check); `price-dashboard/draft-requests.ts:415-440` (`membersOf`); `active-price-book.ts`; `project-availability.ts`; domain `pricing/price-change-notice.ts`, `pricing/earned-accessories.ts:49-100`, `queries/replacements-required.ts`; `judge-read-request.ts`; `judge-save-request.ts` |

*Order.*
1. **R5a ∥ S7, now.** Their files are disjoint, and so are their packages.
2. **R5b**, once both have merged.
3. **Q3 and Q4 may start once R5a merges**, building against R5a's wire with a stubbed fetch, and **merge only after
   R5b**. This is a recorded departure from §8.2's "merged before it starts", as Q1 was built on P3's branch. It keeps
   Q3, and so R4c, off R5b's critical path for everything but the merge. The path to R4c is R5a ∥ S7 → R5b → Q3's merge
   → R4c (which also needs S2c).

*What Q3 and Q4 need from R5 (hand-offs; they bind those waves).*
- **Q3:**
  - `use-price-notice.ts` calls the `GET` only when `canWrite` is true, and never on the share view (its sentinel id).
    A `404`, `429`, `500` or `503` shows nothing and acknowledges nothing.
  - C1 standalone: the `active-version` arm with `pricesChanged: true` and `replacementsRequired: []`.
  - The sheet: `replacementsRequired` is the answer at open, for the stored design. Q3 may compute it live from the
    store with the same domain function, which Q3 already holds. The accessory info rows come from
    `removedAccessories`, named by `authoredName` or by the built-in's message.
  - **C4C's merged sentence (Q3-c) cannot be known while the active side refuses** (ruling 6, step 5). So after the
    last choice, Q3 waits for the replacement save's `200`, calls the `GET` again, and carries the sentence if and only
    if that answer's `pricesChanged` is `true`. Only then does it acknowledge.
  - Q3 acknowledges the **displayed** pair (ruling 5). If the `GET`'s `current` differs from it, a publish or an
    availability change landed after the page loaded, and the page is stale. Default: show no C1 and acknowledge
    nothing on that view; the next open compares again, and the marker is untouched. Q3 may add a reload offer.
  - On `400 unknown-version` or `revision-ahead`, keep the notice for that view. No retry loop.
- **Q4:** `isSent`, on both arms. Nothing else. Closing the note is per view (Q4-a) and writes nothing.

*Acceptance.*
- **R5a:**
  - **R5a-a:** in production with no `DATABASE_URL`, `notices` is `UNAVAILABLE_PRICE_NOTICE_STORE`, and each method
    rejects a `DashboardStoreError` whose `failure` is `unavailable`. With one, it is a `NeonPriceNoticeStore` made on
    first use, never at import (the existing `price-stores` tests' pattern);
  - **R5a-b, one world:** in the seeded world, an acknowledgement naming the version `priceBook.readActive()` reports
    and the head `availability.readCurrent()` reports is `ok`. After a second version is published through the seeded
    `priceBook`, an acknowledgement naming it is `ok` too. **Must-not:** a notice fake built over a second
    `FakePriceBookStore`, which would answer `unknown-version` to the second publish;
  - **R5a-c:** in the seeded world, an unknown version is `unknown-version` and the head plus one is `revision-ahead`;
    a refusal changes nothing `readAcknowledged` returns;
  - **R5a-d, must-not:** at this merge, no production module but the stores' wiring names `notices` (grep);
  - every existing test stays green; the count of test files edited is reported, with the QA pins listed.
- **S7:**
  - **S7-a, parity, live:** over the table below, `loadEditable` answers `found` if and only if a `saveAuthorized`
    with the same credential at the row's revision lands, and `none` if and only if that save answers
    `DesignWriteForbiddenError`. The rows: the right token; another design's token; a wrong token; the right token on
    a hidden row; on a deleted row; a row whose `write_token_hash` is null; the owning account; an account on an
    unclaimed row; another account's row; the owning account on a hidden row and on a deleted row. Sabotage: dropping
    the hidden half from one arm turns the table red;
  - **S7-b:** the token arm asks for no visitor. A row whose `visitor_hash` matches no cookie is `found` by its token,
    where `loadAuthorized` answers `none`;
  - **S7-c:** `isSent` is `false` before `markSent` and `true` after it; it stays `true` after a later
    `saveAuthorized` (sent, then edited); a duplicate of a sent design reads `false`;
  - **S7-d, must-not:** `loadEditable` writes. `revision` and `updated_at` are unchanged across it (live);
  - **S7-e:** a wrong-shaped id, hash or account id answers `none` and never throws, as `saveAuthorized` does;
  - **S7-f:** the S4 gate census counts `loadEditable`'s two templates, with one pair each. No migration file and no
    privilege-test arm changes.
- **R5b** (these extend R-e):
  - **R5b-a, the authorisation table, both routes:** no credential is `404`; a wrong token is `404`; the right token
    with no visitor cookie is served; the owning client session is served; a non-owning one is `404`; an operator or
    administrator session with no token is `404`. **A cross-site request carrying a valid token, and a same-site sibling
    (`Sec-Fetch-Site: same-site`) carrying one, are `404`, with no store call.** A malformed id is `404` with no store
    call. Every `404` is byte-identical, body and headers, to `GET /api/designs/{unknown}`'s;
  - **R5b-b, parity:** on a same-site request, for every combination of a token cookie (present or absent) and a session
    (editing client, reading-only client, staff, none), `price-notice-request.ts` chooses the credential the save route
    passes to `saveAuthorized`;
  - **R5b-c, order:** a `GET` limiter refusal precedes every cookie read and store call. An unauthorised `POST` spends
    no save token, and a limiter refusal reads no body. With the limiter unavailable, the `POST` is `503` and the `GET`
    is served;
  - **R5b-d, the body:** with a valid credential, a non-JSON media type is `415` and a body past the bound is `413`.
    `400 invalid-request` for a non-object, and for an extra member (`designId` among them). `400 MISSING_VALUE` for a
    missing member. `400 UNKNOWN_VALUE` for a version id off its shape, and over the revision sweep (`-1`, `01`, `1.0`,
    ` 1`, 20 digits, `9223372036854775808`), and for a version id of 20 characters that the dashboard's `isVersionId`
    would admit. For each of these, the store is not called. `400 unknown-version` and
    `400 revision-ahead` leave `readAcknowledged`'s answer unchanged. A `200` answers the pair, which
    `readAcknowledged` then returns;
  - **R5b-e, must-not:** either route changes `designs.revision` or calls a design write (the stubbed port has no write
    to call, and S7-d holds the read). Neither writes a staff audit row: the fake world's ledger is unchanged;
  - **R5b-f, the first open:** `recordIfAbsent` receives the root's pair. An acknowledgement of P followed by a `GET`
    leaves P. Two concurrent first `GET`s leave one marker;
  - **R5b-g:** with no active version, the answer is the `no-active-version` arm with `isSent`, and no marker method is
    called;
  - **R5b-h, the mapping (ruling 6), one test per row:** marker equal to `current`; an active `REPLACEMENT_REQUIRED`;
    an active ordinary refusal; the seen side refused; the seen version not found or unparseable (one log line); a
    store failure in `readVersion` or `readAt` (`503`); equal prices under a different pair (`false`); different
    prices (`true`). **Must-not:** a store `unavailable` on the seen read answers `true`. **Must-not:** an active
    ordinary refusal answers `true`. **Property** (fast-check; the `javascript-testing-expert` skill applies): for any
    design priceable under both pairs, built from P4b's fixtures, `pricesChanged` equals `pricesChangedBetween`'s
    answer, so the route adds no rule of its own;
  - **R5b-i, healing:** a design whose seen side refuses answers `true`; after the displayed pair is acknowledged, the
    next `GET` answers `false`;
  - **R5b-j:** `removedAccessories` lists exactly `removedAccessoriesSince`'s ids. `authoredName` appears on linked rows
    only, from the active book when it states the row. With a replacement pending, the list is still filled;
  - **R5b-j2:** an active `REPLACEMENT_REQUIRED` together with an earned accessory switched off since the marker answers
    `pricesChanged: false`, a non-empty `replacementsRequired` and a non-empty `removedAccessories`. A seen availability
    that `projectAvailability` refuses answers `true` and `removedAccessories: []`, with one log line;
  - **R5b-k:** `NoReplacementOptionError` is `500` with a closed body and one log line, and nothing is written;
  - **R5b-l, closed keys:** each answer's keys equal its wire arm's exactly. No answer holds a design document, a
    version label or note, an account, an e-mail, or a serialised error cause. Every `200` carries
    `PER_CREDENTIAL_HEADERS`. R-d's sweep finds no draft or archived version id in either answer;
  - **R5b-m:** `isSent` is present on both arms and under both credentials; sent, then edited, reads `true`.

*Risks and residuals.*
- **The first-open race.** A publish between the page load and the first `GET` records the newer pair, so that one
  change is never announced. It is bounded to each design's first open after R5b. Accepted: S5 hand-off 1 forbids
  taking the pair from the request.
- **Check-then-write** (ruling 9). **One more read token per open** (ruling 3).
- **Latency.** The `GET` runs up to seven reads, unmeasured **[inf]**. `readAcknowledged` may run beside the root
  read.
- **A seen-side `true` may be partly spurious** (OQ-40).
- **Before the Z gate**, production has no active book: the `no-active-version` arm, and nothing touches `0028`.

*Verification, per sub-wave.*
- Route tests over the fake world (`tests/support/price-dashboard-world`), with S7's port stubbed through
  `@/lib/server/repository`.
- S7's live arms on the test database. They add no migration, so the ledger does not move.
- `pnpm check` on each merge, and `pnpm ci:local` before any push.
- No browser arm in R5. Q3 and Q4 own the browser; the `CI=1` server is a production build over the seeded fakes
  (`price-stores.ts:46-56`), so their specs reach the real routes and R5a's seeded notice store.

*Where the S5 hand-off lands* (S5 logic and security reviews, 2026-11-04; read here 2026-11-08):

| Hand-off item | Lands in |
| --- | --- |
| 1. The first-open pair is the server's own; skip it with no active version | Ruling 6, steps 1 and 3; R5b-f, R5b-g |
| 2. Both routes authorise like a save, the `GET` included | Rulings 1 and 2; R5b-a, R5b-b |
| 3. Load the design under that authorisation before writing | Ruling 1; S7; ruling 4's order |
| 4. A malformed version id is `400`, never 5xx | Ruling 5; R5b-d |
| 5. Refuse cross-site and non-JSON (`415`); never serialise an error's cause | Rulings 1, 2 and 4; R5b-a, R5b-d, R5b-l |

*Reading, QA and reviewers.*
- **QA of each sub-wave:** its row's Reading, and that sub-wave's acceptance bullets above. R5a adds
  `apps/web/tests/lib/server/price-stores*`. S7 adds `packages/persistence/tests/neon-configuration-repository*` and
  `s4-gate-predicate-census.test.ts`. R5b adds `apps/web/tests/app/api/designs/**` (the save's authorisation tests:
  `write-authorization.adversarial.test.ts`, `read-and-share-limiter.test.ts`) and `tests/price/**`.
- **Logic review:** the row's Reading, plus §5 A-11, A-16 and A-17, ADR 0062 Amendment 5, and rulings 5–8 above.
- **Security review:** the row's Reading, plus ADR 0019 (decisions 1 and 5), 0147, 0153 d1, 0156, 0172 D7 and D9,
  and 0114 (decision 5, H1, G4, G5). S7's reviewer also reads the runbook section for `0028` and the privilege test's
  `designs` arm.
- **Clean-code review:** the diff, `engineering-conventions.md`, and the save route's header comments (the order of
  checks R5b mirrors).

### Lane U — Dashboard UI D1–D9 (Light + visual; U5 Full, because it publishes)

**Base reading:** the mockup frames named in each row, with their notes; the brief `…-v2-update.md`, `…-v2-fixes.md`,
`…-v2-fixes-2.md`; `docs/design/mockups/Lemnaria Cont Lot 3.dc.html` (the staff shell); `apps/web/src/staff/staff-shell.tsx`, `staff-kitchens-list.tsx`; §8.4(d); `docs/best-practices/browser-and-visual-qa.md`.

| Wave | Must-fix items | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **U1** shell and list | (1) D1C/D1D: menu groups (Catalog: Dulapuri, Feronerie, Materiale, Accesorii, Setări implicite; Prețuri: Publicare prețuri **without its count: the pending-price count (the header chip "N prețuri de publicat →" and the nav badge) is deferred to U5** (U1 review ruling, 2026-10-26: the menu links only to built pages, `BUILT_CATALOG_PAGES`, and the publish page arrives in U5); Clienți), with role-hidden items and "Nu ai acces la această pagină" for a direct address; (2) D1M mobile menu sheet; (3) routes and the `proxy.ts` family `/[locale]/staff/catalog/**`; (4) D2A/D2B list: groups, cabinet SVGs, chips (Modificat, Furnizat de client, Structural; ~~Inactiv~~ struck 2026-10-26: cabinets cannot be switched off, since the ItemRef kinds are material, hardware, finish, handle and accessory, so the chip has nothing to apply to), search, "Doar modificate", empty search, pending price shown beside the active one; (5) D2M cards | `staff-shell.tsx`, `staff-nav-sheet.tsx`, `staff-paths.ts`, `proxy.ts`, `price-dashboard/cabinet-list.tsx` (and its page), **and `lib/server/staff/staff-page.ts`**: the catalog pages join `CAPABILITY_OF_PAGE` (`price.edit`) and `staffNavigationOf`, so the Catalog group shows on the kitchens and audit pages too (D1C; assigned 2026-10-26) — **over five; the mini-review is stated** | T1, X0 | Frames D1A–D1M, D2A, D2B, D2M, D2R [mock L839-855]; ADR 0173 P-L3-2 (the route family) and P-L3-9 (shell departures); `apps/web/src/proxy.ts`; `staff-paths.ts`; `docs/design/mockups/cabinets/` |
| **U2** list editing | D2C inline anchor edit (Enter saves to the draft, Esc cancels, the error stays in the field with `aria-invalid` and `role=alert`); D2E1–3 depth-rule card (0–100, four error variants); D2D bulk-% dialog (scope, preview counts, focus on the % field). **Added 2026-10-27 (R2 review):** (1) an all-no-op bulk answers `PERCENT_OUT_OF_RANGE`, so the screen's message must **not** say "out of range" for that case; (2) **U2 wires the cabinet list to `GET /api/staff/prices`** (proposed by R2's review, since R2 did not), carrying the `server-only` import and the pending-equals-active assertion of the R2 row | `cabinet-list-inline-edit.tsx`, `depth-rule-card.tsx`, `bulk-change-dialog.tsx`, `use-price-draft.ts` | U1, M2 | Frames D2C, D2D, D2E1–3, D2ER [mock L848-853, L770-777]; A-14; M2's `bulk-change.ts`, `judge-book.ts` |
| **U3** cabinet detail | D3A–G and D3M1/2: read-only dimensions, fields per shape, the live sentence, the read-only hardware readout, the preview table (PAL/MDF/Furnir columns, *Cu feronerie*, *Adâncime 600/700*, disabled only for rows outside `deepeningRows` (customer-supplied), with "Nu se schimbă la 700 mm"; **enabled for wall rows**, a recorded departure from D3D under the owner's A-6 ruling), save and cancel | `cabinet-detail.tsx`, `cabinet-price-fields.tsx`, `cabinet-preview-table.tsx`, page | U1, M2 | Frames D3A–G, D3M1/2, D3R [mock L856-866]; A-1, A-2, A-3, A-6; M2's `cabinet-preview.ts` (the only arithmetic allowed) |
| **U4a** hardware (amended 2026-10-26) | D4A/B/C/D/E/F with **four** rate columns (the lift, A-20); a new class (Romanian name and description only, no RU tab, A-21; created in the draft, inactive until published); disable and enable apply **immediately** (A-17), with dialogs carrying the replacement text from T1 instead of "Intră în vigoare când publici"; delete-blocked and default-menu states | `hardware-list.tsx`, `hardware-edit.tsx`, `item-dialogs.tsx`, `use-item-availability.ts`, pages | U1, M3, M4 | Frames D4A–F [mock L686-698, L779-782]; A-17, A-18, A-20, A-21; ADR 0062 Amendment 3 and the 2026-10-26 Amendment; M3's `item-lifecycle.ts` |
| **U4b** materials | D5A–G, D5CM, with the same immediate disable and enable and the D5G last-active block. | `material-list.tsx`, `material-edit.tsx`, page | U4a (`item-dialogs.tsx` passes to U4b) | Frames D5A–G, D5CM [mock L869, L700, L783]; ADR 0071 note; A-16, A-17 |
| **U4c** accessories (added 2026-10-26) | D6A/B/C: built-ins with their true earning rule shown read-only; **creating a linked accessory**, with a cabinet-type select limited to rows the manufacturer supplies (A-19), a per-unit price, and Romanian text only; immediate disable and enable; the D6C dialog's accessory variant ("scos din bucătărie și i se spune") | `accessory-list.tsx`, `accessory-edit.tsx`, `accessory-create.tsx`, page | U4b (`item-dialogs.tsx` passes to U4c), M4 | Frames D6A–C [mock L870, L710-712, L779]; A-19, A-21; ADR 0070 d4 |
| **U5** publish and history | **Departures ruled 2026-10-27 (U5-Q4):** (a) no inline "Nou" correction in D7A yet. **Assigned to U5b**, after U2, using U2's `use-price-draft.ts`; (b) the provisional switch also shows in the D7D empty state. **Accepted:** `provisional` is a draft change (m4), so it must be reachable when nothing else is pending; (c) D7C opens with focus on the checkbox, as drawn. **Accepted:** the confirm button is disabled until the box is ticked, so that focus is safe; (d) history shows page 1 only. **Assigned to U5b** with R3's paging; (e) the version's display id is its `sequenceNumber` ("Versiunea 12") with its label in quotes. **Accepted**, recorded against the mockup's "2026-10", and the publication date is shown beside it; (f) `note: ""` is always sent. **Accepted:** the note is optional (R3), and the label carries the name. **U5b** (added): D7A's inline correction and D8A's pager, after U2 and R3. D7A–G, D7M (a bulk change renders as one grouped row "+{percent} % la {count} dulapuri", with its scope, expandable to its items, from `bulk` and `diffBooks`' groups; ruling M1-Q1); D8A–C (archived read-only diff; restore puts the prices in the draft and never publishes); **plus the audit page's detail view, deferred from X2 (2026-10-26): the staff audit page shows only labels for the nine dashboard actions, and showing their details (which item switched, the version published, the change count) lands here**; **plus the pending-price count deferred from U1 (ruling 2026-10-26): the header chip and the "Publicare prețuri" nav badge must reach every staff page (kitchens and audit included, per the D1C note), and the D2M zero state "Toate prețurile sunt publicate" (`priceDashboard.nav.allPublished`, unused until now) is wired** | `publish-page.tsx`, `publish-dialogs.tsx`, `version-history.tsx`, `version-detail.tsx` | U1, M1 | Frames D7A–G, D7M, D8A–C [mock L734-747, L871-880]; A-15; ADR 0072 Amendment (customers never see versions) |
| **U6** defaults | D9A–C: six rows, colour-reset note, save immediate ("Bucătăriile deja salvate nu se schimbă"). **2026-10-27:** criterion U6-a (the next new kitchen starts with the saved values) is **carried by R4b**, not U6. A 400 refusal is shown with the "no longer available" copy, practically unreachable since every value comes from an offered option: accepted | `kitchen-defaults-page.tsx`, page | U1, H2 | Frames D9A–C [mock L752-756, L881]; A-9; ADR 0057; H2's request type |

**U acceptance (every wave):**

- each frame is reproduced at desktop 1440 × 900 and, where the mockup draws one, mobile 390 × 844, captured
  (§13.3);
- no horizontal scroll at 390;
- targets are at least 44 px;
- dialogs trap focus, Esc closes them, and initial focus is on the safe action;
- every input has a visible label and unit, and its error is tied to it.

Wave by wave:

- **U2-a:** an invalid inline value is never sent; a valid one appears in "De publicat" and never live.
- **U3-a:** every preview cell equals M2's `previewCabinet` for the same inputs. A sabotage of M2 moves the UI.
- **U4-a:** the default item's menu shows Dezactivează and Șterge disabled, with the reason. The last active option
  shows the D5G block.
- **U4-b (OQ-2):**
  - confirming a deactivation changes what the customer's next page load offers, with **no** entry added to "De
    publicat" and the header count unchanged;
  - must-not: any deactivation dialog says it takes effect at publish.
- **U4-c (OQ-3, OQ-4):**
  - the create forms carry no Russian field;
  - creating an accessory without a linked cabinet type is impossible (the control is required, and the server
    refuses);
  - the cabinet-type list holds no customer-supplied row.
- **U5-a:**
  - publish is disabled when the draft equals the active book (D7D);
  - turning "Sume provizorii" off needs the checkbox (D7C), shown whenever the draft holds a `provisional = false`
    change (m4: the draft is the flag's only source);
  - a failed publish leaves the draft and the active version unchanged (D7G).
- **U6-a:** after saving, the customer's next **new** kitchen starts with the saved values, and an already-saved
  kitchen is unchanged. **Carried by R4b (ruling 2026-10-27):** U6 alone cannot meet it, because production answers
  "unavailable" until the defaults route exists. U6 closes on its own criteria.

**QA reading:** the row's frames, U's base reading, and `apps/web/tests/staff/**`. **Review reading (combined, Light):**
the frames and `engineering-conventions.md`. **Visual:** §13.3.

### Lane K — D10 and the digest (K1 Full; K2a and K2b Full + security; K3 Light + visual; K4 Full + security)

**Base reading:** ADR 0062 Amendment 5 and the reconciliation note; ADR 0173 (every row, especially S6/S7 and the
2026-10-22 note); ADR 0153 d1; ADR 0154; ADR 0164; ADR 0165; frames D10A–D [mock L813-833]; this plan A-12 and A-13;
`apps/web/src/staff/**`; `lib/server/mail/**`.

| Wave | Must-fix items | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **K1** rules | (1) digest eligibility (A-13, on facts: `sentAt`, status, `now`, and the two SQL-computed booleans `isChangedSinceSeen` and `isDigestedSinceSeen`; no seen or digested instants, per the K1-review ruling); exporting `DIGEST_WINDOW_MS` (720 h) and `DIGEST_STOPPING_STATUSES`; (2) the digest model (subject count, rows, footer facts); (3) the Europe/Chisinau day key | `staff-changes/digest-eligibility.ts`, `digest-model.ts`, `chisinau-day.ts` | MP-0. **Merge waits for OQ-9** | `staff/request-status.ts`; frame D10D's footer [mock L833, L828]; S-19 |
| **K2a** the seen route (split 2026-10-27; built at `241a956e`) | `POST /api/staff/kitchens/{id}/seen`: the displayed revision (`400` on a malformed shape), `contact.read`, the staff-list visibility (`404`), audit `kitchen-seen`, fail closed, and the per-account bucket `staff-seen-by-account` at **600 per hour, provisional**, failing closed (the owner's to retune; the same figure as the open bucket, because a page opens once and marks once; ruling K2-Q4) | the seen route, `lib/server/staff/staff-kitchen-actions.ts` (mod) | K1, S1, X2 | A-12; S-18; ADR 0173 *Dated note 2026-10-22*; ADR 0156 |
| **K2b** the list, the estimates and the counter (split 2026-10-27) | (1) the seen route's `200` passes through the store's SQL-computed flag as `StaffSeenMarkedWire.changedAfterSeen` (ruling K2-Q1; it needs S4's port change); (2) the list serves `StaffKitchenMarkedListWire` (`changedAfterSeen` per row, `changedCount`, the `onlyChanged` query) and the page serves `StaffKitchenMarkedWire` (`changedAfterSeen`, `displayedRevision`) from S4's statements; (3) the estimates, as a **new standalone wire type** `StaffKitchenEstimatesWire { sentEstimate: {totalMinor, currency} \| null, currentEstimate: {totalMinor, currency} \| {refused: PricingFailureCode} }` beside the frozen shapes, following the contract's own convention that no existing shape gains a member. `sentEstimate` is the stored `priced` total through S4's statement and the `SELECT (priced)` grant (migration `0026`), never re-priced; it is `null` for an intent request with no snapshot. `currentEstimate` is priced now with R1's active book and the current availability; (4) the changed-count poll route `GET /api/staff/kitchens/changed-count` (`contact.read`, the staff read bucket, **no audit row**, the stated F9 exemption); (5) the `kitchens-listed` audit detail gains `onlyChanged: boolean`. **From S4 (2026-10-27, relayed):** the changed-count poll must not scan documents per poll, and S4 provides no cheap count today, so K2b (or a small S4 follow-up) adds a `countChanged()` reader method. `onlyChanged` is optional and present only as `true` (`?onlyChanged=true`; anything else is `UNKNOWN_VALUE`). `changedCount` is **global**: all sent, visible, changed kitchens, regardless of segment, status or search. **S4 review (2026-10-27):** the changed count reuses the list CTE, a full sort of `contact_submissions` per poll. K2b bounds the poll interval, or a later migration adds an index on `contact_submissions (design_id, created_at desc, client_request_id desc)` (`0008` stays frozen); **K2b decides and records which** | the list route (mod), the kitchen route (mod), the poll route (new), `lib/server/staff/staff-kitchens.ts` (mod), `staff/staff-kitchens-wire-contract.ts` (the estimates type), `staff/staff-audit-action.ts` (one key) — **six; over five, stated** | **K2a, S4, R1** | A-12, A-13; S-21; ADR 0154 d8; ADR 0173 L3-S6 (the list audit); §8.4(d) |
| **K3** UI (now depends on **K2b**) | D10A/C: badge, changed-first sort, "Doar modificate", the "Văzută … modificată din nou" sub-line; D10B: marks seen on open with the displayed revision, the "Trimisă"/"Actuală" switch (thumbnail, cabinet list with differing rows highlighted, no detailed diff), both estimates, status unchanged | `staff-kitchens-rows.tsx`, `staff-kitchen-filters.tsx`, `staff-kitchen-view.tsx`, `use-staff-kitchen.ts`, new `kitchen-version-switch.tsx` | K2, T1 | Frames D10A–C [mock L814-826]; `Lemnaria Cont Lot 3.dc.html` S2/S3; `staff-kitchens-list.tsx`, `staff-kitchen-page.tsx` |
| **K4** digest and counter | Cron `/api/cron/staff-change-digest` (`cron-auth`, claim the day, eligible list, send through the mail port, record entries **from the deduplicated model rows, each mapped to the revision the port returned for that design**, after a successful send); the HTML and plain-text message; recipients hold `contact.read` with a confirmed address; the customer's name from the profile, else the reference; the nav counter. **Rendering rule (S4 review, 2026-10-27; A-13 F6):** kitchen and customer names are customer-typed, so they are escaped through the `escapeHtml` builders and never placed in the subject or headers (a name may contain CR/LF) | cron route, `lib/server/mail/staff-change-digest.ts`, `vercel.json`, `staff-shell.tsx`/`staff-nav-sheet.tsx` (handoff), `use-changed-kitchen-count.ts` | K3, U1, S4; **OQ-10** | Frame D10D [mock L827-828]; A-13; S-21; `lib/server/mail/mail-sender.ts`, `lead-notification-html.ts` (the branded pattern); `lib/server/cron-auth.ts`; `app/api/cron/prune-rate-limits/**`; `vercel.json` |

**K acceptance:**

- **K1-a:** a property over random facts: eligible if and only if `isChangedSinceSeen` ∧ ¬`isDigestedSinceSeen` ∧
  (`sentAt > now − DIGEST_WINDOW_MS`) ∧ (status ∉ `DIGEST_STOPPING_STATUSES`). The boundary is exclusive at exactly
  720 h.
- **Split 2026-10-27:** K2-a and K2-c are K2a's (K2-c's list, count and digest clauses are K2b's); K2-b and K2-d are
  K2b's.
- **K2-e (K2b; rulings K2-Q1, K2-Q3):**
  - the seen `200` body's `changedAfterSeen` equals S4's SQL result for the stored seen revision after the mark;
  - a save landing between load and mark answers `true`;
  - the list's `changedCount` equals the count of rows that `onlyChanged` returns over all pages;
  - the poll route writes no audit row;
  - a list request with `onlyChanged` writes a `kitchens-listed` row whose detail carries `onlyChanged: true`;
  - `StaffKitchenEstimatesWire.sentEstimate` is the stored `priced` total byte for byte (K2-b), and `null` for an
    intent request;
  - must-not: any revision is compared or ordered in TypeScript.
- **K2-a:** opening the page with a revision older than the current one leaves the badge on. A non-staff session gets
  `403`. A seen write without its audit row is refused (`503`).
- **K2-c (amended 2026-10-26, F9, P-L3-4):**
  - a displayed revision that is not a digit string of the revision shape is `400` and never reaches the store;
  - one greater than the current is `409 displayed-revision-ahead`, with nothing written;
  - a kitchen outside the staff-list predicate (client-deleted, or neither sent nor held by an account) is `404` on
    seen and page and absent from the list. An account-held unsent kitchen opens and can be marked seen, but never
    carries the badge or enters the counter or the digest;
  - the polled changed-count read writes **no** audit row per poll (the stated exception); every list view still
    writes its `kitchens-listed` row.
- **K2-d (F2):** the as-sent estimate reads `contact_submissions.priced` through S4's statement, under exactly the
  `SELECT (priced)` grant. No other column is added.
- **K2-b:** the as-sent estimate equals the stored snapshot's total byte for byte, after any number of publishes
  (ADR 0154).
- **K3-a:** D10C's cycle: changed, badge; open, gone; changed again, back. This is an e2e test against the fake store.
- **K4-a:**
  - two cron calls on one day send at most one e-mail;
  - a day with nothing eligible sends nothing;
  - a kitchen appears once per round;
  - must-not: the e-mail contains a phone number, a postal address or a request's personal column.
- **K4-d (K1-review ruling):**
  - the entries recorded are exactly the e-mail's rows, one per design, each with the revision `listDigestEligible`
    returned for it;
  - so the next run's `isDigestedSinceSeen` holds that revision and no later one, and a save after the digest makes
    the kitchen eligible again only after it is seen and changed again (A-13).
- **K4-b (amended 2026-10-26, F6; supersedes "the next day retries the round"):**
  - the day's claim is inserted **before** sending (`on conflict do nothing`);
  - a mail-port failure **loses that day**. No entries are written, so the same kitchens are eligible on the next
    day's run;
  - a partial send is never recorded as complete (ADR 0164's single-guard lesson);
  - the digest writes no staff audit row (F3).
- **K4-c (F6):**
  - the route authenticates only through `isAuthorizedCronRequest` and reads no query and no body;
  - without `CRON_SECRET` (Preview) it is refused and sends nothing, and no new environment variable is introduced;
  - client-deleted designs never appear;
  - the customer is named only from `accounts.name`, else the request reference;
  - every interpolated value passes through the `escapeHtml` builders. A test injects `<`, `"` and a bidi override
    into a kitchen name and an account name, and the HTML carries them escaped;
  - the subject and headers contain no customer text;
  - the only link is the staff kitchen URL.

**QA reading:** K's base reading plus `apps/web/tests/staff/**` and `tests/mail/**`. **Review reading:** logic:
A-12 and A-13; security: ADR 0153, 0154, 0164, 0173, plus a read of the digest template; clean-code: the diff.

### Lane Q — Customer side (Q1 and Q3 Full; Q2, Q4 and Q5 Light; every wave visual)

**Base reading:** frames C1–C5 [mock L763-812]; `…-v2-fixes.md` §1 (C3); `…-v2-fixes-2.md` §2–3; ADR 0072
Amendment; ADR 0062 Amendments 3 and 5; ADR 0104 (chrome specification); `apps/web/src/price/**`, `settings/**`.

| Wave | Must-fix items | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **Q1** depth line and copy | (1) the depth line in the breakdown ("Adâncime 700 mm · +{percent} %"); (2) the settings depth control switches from `globalSettings.depthNote` to T1's `depthNotePriced`, with `{percent}` from the published rule. This is a component edit only; no message file is touched | `price-breakdown.tsx`, `price-breakdown-model.ts` (depth line only), `settings/global-settings.tsx` | T1; **built on P3's branch after P3's QA is green; merged with P3 at MP-3** | ADR 0100 decision 5 and Amendment; A-1; frames C3, C3D, C3S, C3R [mock L784-790] |
| **Q1b** the depth line on the review screen and in the shop's notice (added 2026-10-27, P3-Q1; Full + security, because the notice is generated e-mail) | The review model and screen, and the lead notice in plain text and HTML, render the `depth` line from the priced result and the stored snapshot, between the material line and the hardware line, with the same copy as the breakdown (T3's accessors). The lines on every surface sum to the total shown | `review/review-model.ts`, `review/review-screen.tsx`, `lib/server/mail/lead-notification.ts`, `lib/server/mail/lead-notification-html.ts` | T3; **built on P3's branch; merged at MP-3 with P3 and Q1** | A-1; ADR 0154 d8; ADR 0165; `escapeHtml` builders (F6's rule applies to any value it prints) |
| **Q1c** two display roundings (added 2026-10-28, owner ruling; branch `m10/q1c`, **in QA, not merged**) | Every line on the breakdown, the review and the lead notice shows its priced amount to 10 lei; only the kitchen total rounds up to 1 000 lei; printed rows need not sum to the total. A stored legacy line not a multiple of 10 lei rounds up to the next 10 lei. Tier-delta badges stay at the thousand (they compare totals) | the Q1/Q1b surfaces and models (named in the dispatch) | MP-3 | ADR 0001 amendment 2026-10-28; ADR 0175 d5; the `it.fails` in `qa-q1-depth-line.adversarial.test.ts` |
| **Q2** whole-kitchen handle row | C2: a "Mânere" row in the settings sheet (Bară inox / Bară neagră / Push-to-open) with its hint, offering only active handles; the store applies `setKitchenHandle`; **Q2 folds `KitchenHandleSetEffect` into the `CommandEffect` union** (H1 leaves it outside, and its code comment saying so is being trimmed), together with `apply-command-result.ts`'s whole-kitchen branch, in one change (H-6) | `global-settings.tsx`, `global-settings-model.ts`, `store/whole-kitchen-apply.ts`, `domain commands/command-result.ts`, `store/apply-command-result.ts` | **MP-3** (Q1 holds `global-settings.tsx` until then), **H1b**, T1 | Frame C2 [mock L764-767]; ADR 0099; H1's command; H-6 |
| **Q2b** a cabinet follows the kitchen handle again (added 2026-10-26; **pending OQ-15**, default = mirror colour) | (1) a `clearHandle` command in `set-appearance.ts`, mirroring `clearFinish` (ADR 0099 d8): it removes the cabinet's own handle, so the kitchen handle applies again; (2) a panel option "Ca restul bucătăriei" in the cabinet's handle control, as the colour control has; (3) the copy leaf, requested from T | `commands/set-appearance.ts`, the panel handle control, `store/apply-command-result.ts` (if a new effect branch is needed) | Q2 | ADR 0099 d8 (`clearFinish`); `set-appearance.ts`; OQ-15 |
| **Q3** forced replacement and merged notice (**split 2026-11-09 into Q3a, T4, Q3b, Q3c and Q3d: dispatch the sub-waves, never this row whole; see *Q3 split* below the Q acceptance.** **Widened 2026-10-27, R1-Q1 deferral: with no active book the whole editor `/d/[id]` and the share view `/s/[token]` crash, not only the settings sheet, because `use-top-bar-fit.ts:72` calls `useWholeKitchenTierOffer()` unconditionally and there is no `error.tsx`; Q3's `NO_TIER_OFFER` work must cover `describeSettingsPill` and the top bar too, see R-b**) | C4A–C4D (a modal sheet, not dismissable except by ‹; first "Alege" focused; rows announced; "Prețul apare după ce alegi"; only remaining options, the disabled one struck through; nothing preselected; accessory rows informational); C4C confirmation merged with C1's sentence (the mockup's choice [mock L810]); C1 standalone when there is nothing to replace; acknowledging writes the marker (the version and availability pair). The sheet and the accessory info rows follow **current availability**, so they appear on the next open after a disable, with no publish (A-17). **Widened 2026-11-04 (ADR 0178, Amendment on a deletion that gains a user):** a material or hardware tier the active book no longer holds is a sheet row too, and a deleted linked accessory the kitchen earned is an info row. Q3 holds four P-lane files for this. Items and criterion Q3-g are in Lane S, *Publish and a deletion that gains a user* | `replacement-sheet.tsx`, `use-price-notice.ts`, `price-notice-banner.tsx`, `price-bar.tsx` (mod), `whole-kitchen-tiers.ts` (disabled tiers hidden or struck) | P4a, R5, T1 | Frames C1, C4A–D [mock L763, L792-811]; A-11, A-16; ADR 0072 Amendment *Consequence*; ADR 0062 Amendment 3; `whole-kitchen-tiers.ts:91-162` |
| **Q4** sent-kitchen note (**amended 2026-11-09 by *Q3 split*: depends on Q3c, reads `isSent` from Q3c's `use-price-notice.ts` and never issues its own `GET`; never concurrent with Q3d, since both edit `configure-screen.tsx`**) | C5A/C5AD: a closable, non-blocking note above the price when `isSent` | `sent-kitchen-note.tsx`, editor placement | R5, T1 | Frames C5A, C5AD [mock L805-807]; ADR 0062 Amendment 5, point 3; ADR 0165 |
| **Q5** lone colour and handle replacement (**split 2026-11-09 into T5, Q5a, Q5c and Q5b: dispatch the sub-waves, never this row whole; see *Q5 split and R4c plan* below the Q3 split. Q5a and Q5b are Full, a recorded upgrade from this lane's "Q5 Light"**) | A disabled colour or handle as a sheet row; choosing replaces it at every level where it appears (A-16); "Culoarea a revenit la Alb" when a material change resets it | `replacement-sheet.tsx` (mod), `store/whole-kitchen-apply.ts` (mod) | Q3, Q2, H1, P4a | A-16, A-17; ADR 0057, 0081, 0086, 0099; `chosen-finishes.ts`, `resolved-finish.ts` |

**Q acceptance:**

- **Q1-a (MP-3):**
  - there is no commit on `m10-price-dashboard` in which the customer's price responds to depth while the settings
    sheet renders the old `depthNote`, or the reverse;
  - checked by reading `git log -p` of the MP-3 merge.
- **Q1b-a:**
  - at 700 mm, with a positive depth percentage, the review screen and both forms of the lead notice show a depth
    line;
  - on each surface the lines sum to the total shown;
  - a snapshot stored before P3, which has no `depth` line, renders unchanged;
  - must-not: the notice re-prices anything (ADR 0154 d8).
- **Q1-b:** the depth line's percentage text is the published rule's value. A test publishes two different values and
  sees each one. No figure is in the copy.
- **Q3-a:**
  - while any replacement is pending, no figure is shown anywhere (bar, breakdown, account card);
  - the contact flow cannot send a kitchen whose price is refused. This is the existing refusal path, asserted.
- **Q3-b:** after the last choice, the price appears and the marker is written. Reopening shows neither the sheet nor
  the notice.
- **Q3-c:** with both a disabled item and a price change, exactly one sheet appears, and its confirmation carries the
  prices-updated sentence. C1 is not shown separately.
- **Q3-d:** a sent kitchen gets the same sheet (ADR 0062 Amendment 5, point 2).
- **Q3-e (OQ-2):** disabling an item the open kitchen uses makes the sheet appear on the next open, with no new book
  version. Re-enabling it before the customer chooses makes the sheet disappear and the price return unchanged.
- **Q3-f (OQ-4):**
  - an accessory info row appears once per disable the customer has not acknowledged;
  - activating a linked accessory the kitchen earns shows the prices-updated notice (P4b-d).
- **Q4-a:** the note never blocks editing or the price, and closing it hides it for that view only.
- **Q2-a, Q5-a:** as H1-a and H1-b, end to end in the browser.

**QA reading:** Q's base reading plus `apps/web/tests/price/**`, `tests/settings/**` and the e2e specs for the editor.
**Review reading:** logic (Q1, Q3): ADR 0100 decision 5, A-1, A-11, A-17, A-19, and the OQ-2 ruling; combined (Q2, Q4, Q5): the frames; visual:
§13.3.

**Q3 split** (architect, 2026-11-09; plan step for Q3 at `m10-price-dashboard` @ `185f6d05`, R5a, S7 and R5b merged;
nothing run, nothing built). The Q3 row, its 2026-10-27 widening (R-b), *Q3's items* 1–5 and Q3-g (Lane S, *Publish
and a deletion that gains a user*), Q3-a to Q3-f and *What Q3 and Q4 need from R5* come to about twenty items. Under
`docs/WORKFLOW.md`'s limit (5 items, about 5 production files) they split into five sub-waves: **Q3a**, **T4**, **Q3b**,
**Q3c** and **Q3d**. Each merges alone. **Dispatch the sub-waves, never the Q3 row whole.** Every criterion above stands;
this block says which sub-wave delivers each one, settles what the code shows the row did not foresee, and records the
tests that move.

*Evidence.* Every source claim below was read at `185f6d05` (source-verified), with its line. **[inf]** marks an
inference and says what would falsify it. Plan lines are cited by section, not number, because this file moves.

*What the code says, which shapes the split* (source-verified).
1. **The check order is already right; the list is what is wrong.** `refuseUnusableRequest` runs
   `refuseSwitchedOffSelections` before any line is priced, so before `selectTier` (`price-design.ts:171-180, :219-233`;
   `selectTier` at `:489-503`). What sends a vanished tier to `UNKNOWN_TIER` is `disabledItemsNamedBy` answering `[]`
   for a design that names a tier the book does not hold (`named-items.ts:60, :66-82`), and `tierItem` dropping such a
   tier (`:85-92`). So `price-design.ts` needs its comment corrected (`:167-170`), not a reordering. Q3's items name it
   "the order of the checks only"; that window stays, and is used only if the implementer finds otherwise.
2. **An absent book default is not a vanished choice.** `qa-6b-pricing.adversarial.test.ts:347-356` pins a book whose
   `hardware.defaultTierId` names no tier as `UNKNOWN_TIER`, so the parser does not refuse that book. `holdsTier` falls
   back to the default when nothing is chosen (`named-items.ts:80`). A rule keyed on "the tier priced at is absent"
   would turn that book fault into a replacement sheet on every choice-less kitchen.
3. **The server half of Q3 already exists.** `price-notice.ts` builds `replacementsRequired` from the domain
   (`:258-263`) and reports `removedAccessoriesSince` (`:416-439`). The domain change reaches the `GET` with no route
   edit. Its seen-book naming arm (`:441-455`) becomes reachable, and its comment ("which it does not yet", `:442-443`)
   goes stale.
4. **A replacement row carries no name on the wire.** `RequiredReplacementWire` is `{item, remaining}`
   (`price-dashboard-wire-contract.ts:549-553`), and `replacementOf` copies those two keys only
   (`price-notice-request.ts:256-261`). The client holds only the active book (R1's root, `price-book-root.ts:34-46`). A
   material declaration holds no name (`materials.ts:151-157`). A keyed class's `nameKey` lives on the book row
   (`sample-price-book.ts:386`), and Hettich and Blum have none (`:397`, `:414`). So **no client file can name a vanished
   created class from the seen book**, and a vanished keyed class's message key is not reachable from code
   **[inf: falsified by a code-side map from tier id to message leaf, which the implementer greps for]**. → ruling 2.
5. **The no-book crash has two throws, not one.** `offerTiersAgainstBook` throws (`price-book-root.ts:105-106`), and so
   does `requireDeepCabinetPercent` (`:90-93`), which the settings sheet calls (`global-settings.tsx:90`). Its comment
   says the sheet cannot open without a book; once `NO_TIER_OFFER` lets the editor render, the sheet can open, and the
   depth note throws. The top bar calls the offer unconditionally (`use-top-bar-fit.ts:72-75`).
6. **The tier offer's two known gaps are one cause.** `measureGroup` prices every tier the book holds, a switched-off one
   included; one refusal there blanks the group, and the all-or-nothing rule then blanks both groups
   (`whole-kitchen-tiers.ts:126-141, :180-199`). `tierIds` is every book tier (`:240`), and it is what the commands take
   as `availableTierIds` (`global-settings.tsx:243-244`). Both `it.fails` in
   `tests/settings/qa-p4a-tier-offer-switched-off.adversarial.test.ts` pin this.
7. **The price bar hides no figure it should show, but the frames want a bar.** A refusal already renders no bar at all
   (`price-bar.tsx:34-35`), and the account card shows no figure for a refused pricing (`price-book-root.ts:124-132`), so
   Q3-a holds on the existing path. But C4A, C4B and C4D draw the bar **present**, with the text "Prețul apare după ce
   alegi" in place of the figure and "Continuă" disabled (`base4(…, price, 1)` → `cfgbar` with `txt` and `btnOff`,
   `Lemnaria Dashboard.dc.html` L795). So `price-bar.tsx` stays in Q3's files, in Q3d, for that one state.
8. **"The save landed" has one honest signal.** `saveStatus: "idle"` also covers an edit queued behind the coalescer;
   the store says `design === savedDesign` is the only answer to "is anything still waiting", and `revision` advances
   only on the server's answer (`configurator-store.ts:160-176`).
9. **The contact route already refuses `REPLACEMENT_REQUIRED`** as `CONTACT_DESIGN_NOT_CURRENT`
   (`prepare-submission.ts:106-117`). The staff estimate maps both codes (`staff-kitchens-marks-reading.ts:34-35`), but
   with different words (`i18n/content.ts:1676, :1680`). → consequence in *Risks*.
10. **Copy.** `customerPriceNotice.*`, `replacementSheet.*` and `sentKitchenNote.*` exist (`ro.json:1906-1936`). There is
    no leaf for R-b's "Prețurile nu pot fi afișate acum", and none for Q3's item 4 generic line.
11. **The frames.** C4B draws the kitchen's own switched-off material struck ("Nu mai este oferit.") among the remaining
    options, with nothing selected and "Aplică" off until a choice. C4D's accessory row is "doar informare, fără
    alegere" (`Lemnaria Dashboard.dc.html` L796-811). ADR 0062 Amendment 3, item 3: "The relevant global setting opens
    showing only the remaining options".

*Rulings this split records* (architect, **[inf] until the coordinator accepts them**; the owner may overturn any).
1. **"Vanished" means a stored choice the book does not hold.** A material or hardware tier id that the design's
   settings name (`chosen` present), which the active book's group does not hold, is an item to replace, listed as
   `tierRef(kind, id)` in `disabledItemsNamedBy`'s one list beside the switched-off items. A choice-less design priced
   at a default the book does not hold stays `UNKNOWN_TIER`: that is a book fault (point 2). `itemsNamedBy` keeps its
   meaning, so the usage reader's parity (S-e; `item-usage.test.ts:97`) does not move. No rename, so `index.ts` is not
   touched.
2. **The sheet row names a vanished tier only from code; otherwise the generic line** (narrows *Q3's items*, item 4,
   which said "or from the seen book (a created class)"). A declared material is named through its catalogue message
   leaf if a code-side path from its id exists; anything else, a vanished created class included, gets T4's generic line.
   Never a raw id. *Why:* the wire carries no name for a replacement row (point 4); the seen book holds a created class
   only when the customer acknowledged a version that stated it, so even a wire change names it only sometimes, and a
   marker equal to `current` reads no seen side at all; and widening the wire reopens R5b's closed-keys pins (R5b-l), the
   seen-side canary's allowance, and a second exception to F10's "an archive is never served". *Rejected for now
   (option a):* a lane R sub-wave adding `authoredName?` to `RequiredReplacementWire`, filled from the seen side as
   `removedAccessoryWire` does, with an ADR 0178 amendment and a security review. Owner-visible: queued as **OQ-41**.
   Q3d renders a name when one is present, so option (a) can land later with no UI change.
3. **The deleted linked accessory.** `removedAccessoriesSince` also reports a linked accessory the kitchen earned under
   `seenBook`, that `seen` did not list as off, and that `activeBook` no longer states, whatever `current` says. One
   already off when the customer looked stays unreported, as today. ADR 0178's Amendment of 2026-11-04, decision 1.
4. **Switched-off tiers leave the offer.** `tierIds` and the measured `tiers` hold active tiers only; deltas are measured
   over them alone, so one switched-off tier blanks nothing else. The switched-off tiers the book still holds are given
   beside them, unmeasured, for C4B's struck row. The settings sheet shows only the remaining options (ADR 0062
   Amendment 3, item 3) and hides switched-off ones; it cannot be opened while a replacement is pending, because the C4
   sheet is modal (point 11). The struck row belongs to Q3d's chooser.
5. **The C4B chooser is the sheet's own**, built from Q3b's offer and applied through the store's existing one-commit
   path (`applyWholeKitchenSettings`, or `setMaterialTier`/`setHardwareTier` with the offer's `tierIds`). Q3d does not
   edit `global-settings.tsx`, so file ownership stays single.
6. **Nothing to replace, but accessories removed: no modal.** The info line ("{name} nu mai este oferit și a fost scos
   din bucătărie.", `replacementSheet.accessoryRemoved`) rides in the C1 banner, with or without the prices sentence,
   and "Am înțeles" acknowledges. That covers an accessory priced 0 (OQ-32), where `pricesChanged` is `false`. *Why:* the
   owner's "removed from the kitchen with the notice" (ADR 0062 Amendment 3, item 4) asks for a notice, not a choice,
   and C4D draws the row as information only. Owner-visible: queued as **OQ-42**.
7. **One hook owns the `GET`.** `use-price-notice.ts` calls it once per open and exposes `isSent` too; Q4 reads it from
   there and never issues its own `GET`, which would spend a second `read-by-block` token per open (ruling 3 of *R5
   split*).
8. **The merged sentence waits on the save, not on `saveStatus`.** After the last choice, Q3d waits until the store's
   `revision` differs from the revision held when that choice was applied **and** `design === savedDesign` (point 8),
   then calls the `GET` again, carries `customerPriceNotice.alsoUpdated` if and only if that answer's `pricesChanged`
   is `true`, then acknowledges the displayed pair.

*Sub-waves.*

| Sub-wave | Items (≤ 5) | Production files | Depends on | Tier | Visual | Reading |
| --- | --- | --- | --- | --- | --- | --- |
| **Q3a** the domain: a vanished tier is a replacement, a deleted accessory is a removed one | (1) Ruling 1 in `named-items.ts`: `disabledItemsNamedBy` lists a vanished chosen tier; `priceDesign` therefore refuses `REPLACEMENT_REQUIRED` naming it, before `selectTier`. (2) `replacementsRequired` offers that group's active tiers for it, through the existing `declaredOptionsOfGroup` path; its `NoReplacementOptionError` stays the only empty-set answer. (3) Ruling 3 in `earned-accessories.ts`. (4) The stale comments: `named-items.ts:10-12` (the "not listed … `UNKNOWN_TIER`'s" sentence) and `:48-55`; `price-design.ts:167-170`; `earned-accessories.ts:65-67`; and, a stated window in R5b's merged file, `lib/server/price-notice.ts:441-443` (comment only, no code). (5) Tests the implementer pairs with each change; QA moves the existing pins listed below, the implementer never edits a QA pin (§9.1) | domain `pricing/named-items.ts`, `queries/replacements-required.ts` (comment or call only), `pricing/price-design.ts` (comment; "the order of the checks only" if point 1 is wrong), `pricing/earned-accessories.ts`; web `lib/server/price-notice.ts` (one comment). Five | merged only (P4a, P4b, R5b) | **Full** (logic and clean-code) | **None: domain only.** A recorded departure from Lane Q's "every wave visual": it changes no surface; the browser arm of Q3-g is Q3d's | This block (points 1–3, 9; rulings 1 and 3); *Q3's items*; Q3-g; P4a-a to P4a-d; P4b-d; ADR 0178 Amendment of 2026-11-04 (decision 1) and of 2026-11-08 (item 7); ADR 0062 Amendment 3, items 2–4; `named-items.ts`; `replacements-required.ts`; `price-design.ts:110-233, :489-503`; `earned-accessories.ts`; `catalogue-availability.ts` (`declaredOptionsOfGroup`, `tierRef`); `price-notice.ts:242-455` |
| **T4** Q3's new leaves (runs beside Q3a) | (1) R-b's leaf for a whole-kitchen group with no book, "Prețurile nu pot fi afișate acum", under `globalSettings.*`. (2) Ruling 2's generic replacement-row line under `replacementSheet.*` (e.g. "O opțiune aleasă nu mai este disponibilă"), with no `{name}`. (3) RU drafts, marked as agent drafts, never pinned (ADR 0095 d2). (4) The copy lock gains both, marked `Drafted`. Nothing renders them until Q3b and Q3d | `ro.json`, `ru.json`, `ro.d.json.ts` (regenerated), the copy lock. Four | none | Light | None: copy only | T1's row; ADR 0095; ADR 0106 Amendment A (no figure in a keyed text); OQ-11 and its later rows; `ro.json:1906-1936` |
| **Q3b** the tier offer: no book, and switched-off tiers | (1) `offerTiersAgainstBook` answers a named `NO_TIER_OFFER` special case instead of throwing (R-b). (2) The settings sheet's material and hardware groups render T4's one line with no options, no deltas and no default marked; the settings pill and the top bar's fit (`use-top-bar-fit.ts:72-75`) accept the special case. (3) The depth note with no book: depth, colour and handle still work and nothing renders 0 (point 5); the implementer chooses between a non-throwing reader beside `requireDeepCabinetPercent` and hiding the percentage sentence, and states it. (4) Ruling 4 in `whole-kitchen-tiers.ts`. (5) A switched-off book default must not throw `UnofferedDefaultTierError` once tiers are skipped: it yields no deltas at all, never a throw (the dashboard's guard makes it unreachable; this is defence in depth) | `price/price-book-root.ts`, `price/use-priced-design.ts`, `price/whole-kitchen-tiers.ts`, `settings/global-settings-model.ts`, `settings/global-settings.tsx`, `app/configurator/configure/use-top-bar-fit.ts` (if the type needs it). **Six, stated, with a mini-review**: the sixth is a type change at one call | T4 | **Full** (logic and clean-code): it changes `tierIds`, the "what is on offer" answer every whole-kitchen command takes (ADR 0062 seam 1) | **Verify-visual, regression only**: the settings sheet at 390 × 844 and 1440 × 900 with nothing switched off is unchanged. The no-book arm cannot run in a browser (dev, test and e2e always seed, R-b), and a switched-off tier in `CI=1` needs a global availability write, so both are DOM-tested | This block (points 5, 6, 11; rulings 4 and 5); R-b; P3-d; P4a-a ("a disabled item is never offered to a new choice"); ADR 0072 Amendment (the recovery path); ADR 0062 Amendment 3, item 3; frame C4B [mock L796-798]; `whole-kitchen-tiers.ts`; `price-book-root.ts`; `use-priced-design.ts`; `global-settings-model.ts` (`describeSettingsPill`, `:293`, `:655`); `global-settings.tsx:80-250`; `use-top-bar-fit.ts`; the U4c and R4a4 hand-offs on `qa-p4a-tier-offer-switched-off` |
| **Q3c** the notice client and C1 (runs beside Q3a) | (1) `price-notice-client.ts`: the `GET` and the acknowledgement `POST`, mapping `200` arms, `400 unknown-version`/`revision-ahead`, `404`, `429`, `500`, `503` and a network failure to closed outcomes. (2) `use-price-notice.ts`: calls the `GET` once per open only when `canWrite` is `true` (never while `"checking"`), never on the share view's sentinel id, never with no active root; exposes the notice and `isSent` (ruling 7). (3) The stale-page rule: if the answer's `current` differs from the root's displayed pair, show no C1 and acknowledge nothing on that view; acknowledge only the displayed pair; on `400` keep the notice for the view, no retry loop. (4) `price-notice-banner.tsx`: C1 standalone when `replacementsRequired` is empty and `pricesChanged` is `true` or `removedAccessories` is not empty (ruling 6); "Am înțeles" acknowledges; built-ins named from their message, linked rows by `authoredName`. (5) The mount in the editor, a stated window in `configure-screen.tsx` (no M10 owner) | `price/price-notice-client.ts` (new), `price/use-price-notice.ts` (new), `price/price-notice-banner.tsx` (new), `price/price-notice-banner.module.css` (new), `app/configurator/configure/configure-screen.tsx` (mount). Five | merged only (R5b); copy from T1 | Light (one combined reviewer) + visual | **Verify-visual**: C1 at 390 × 844 and 1440 × 900 under `CI=1` is not reachable without a publish or a global availability write (the U5c record), so C1's visual runs under `next dev` over a stubbed notice answer, stated in the report; the gating arms are DOM tests | This block (rulings 6 and 7); *What Q3 and Q4 need from R5* (Q3's bullets); A-11; R5b's rulings 2, 3 and 5; the wire `:541-608`; frame C1 [mock L763]; `hydrate-and-configure.tsx:33-80` (`canWrite`); `shared-design-view.tsx` (the sentinel); `price-book-provider.tsx`; `configure-screen.tsx:170-330`; `browser-and-visual-qa.md` |
| **Q3d** the forced-replacement sheet (C4A–C4D) | (1) `replacement-sheet-model.ts`: rows from `replacementsRequired` computed live from the store and the root (the same domain function the `GET` uses), accessory info rows from the hook's `removedAccessories`, names by ruling 2, nothing preselected. (2) `replacement-sheet.tsx`: a modal, not dismissable except by ‹ (which leaves the kitchen); first "Alege" focused; each row announced "{name} nu mai este disponibil"; "Prețul apare după ce alegi"; rows resolve one by one (C4D); colour and handle rows are drawn, but choosing them is Q5's (an interim, recorded). (3) The C4B chooser (ruling 5): only the remaining options, the kitchen's own switched-off tier struck and unselectable, "Aplică" off until a choice; a vanished tier has no struck row (the book has no name for it). (4) After the last choice: ruling 8, then C4C's confirmation (`changedMaterial`/`changedHardware`, and `alsoUpdated` when the second `GET` says so), then the acknowledgement; C1 is never shown beside the sheet (Q3-c). (5) A sent kitchen gets the same sheet (Q3-d); the mount extends Q3c's in `configure-screen.tsx`, and **the sheet opens only where the hook's `GET` runs**: `canWrite === true`, not the share view (which mounts the same screen, `shared-design-view.tsx:49`, `variant="shared"`), an active root. Elsewhere the refusal shows no figure, as today, and no modal | `price/replacement-sheet-model.ts` (new), `price/replacement-sheet.tsx` (new), `price/replacement-sheet.module.css` (new), `price/use-price-notice.ts` (the sheet's flow), `app/configurator/configure/configure-screen.tsx` (mount), `price/price-bar.tsx` (point 7: the pending state only). **Six, stated, with a mini-review**: the bar is one state | Q3a, Q3b, Q3c, T4 | **Full** (logic and clean-code) + visual | **Verify-visual**: C4A, C4B, C4C and C4D at 390 × 844 and C4AD, C4BD at 1440 × 900, under `CI=1` through the vanished-tier path (below), which needs no publish | This block (points 7, 8, 11; rulings 2, 5, 6 and 8); Q3-a to Q3-f; Q3-g; A-11, A-16, A-17; ADR 0062 Amendment 3 (items 3–4) and Amendment 5 (point 2); ADR 0057 (the colour reset, announced by Q5); frames C4A–C4D, C4AD, C4BD [mock L792-811]; `configurator-store.ts:120-250, :560-720`; `store/whole-kitchen-apply.ts`; `price-bar.tsx`, `price-bar-model.ts`; `save-coalescer.ts` (read only); `browser-and-visual-qa.md` |

*Order and parallelism.* Separate worktrees; one writing agent per tree (R2). Production files are disjoint within each
pair below.
1. **Q3a ∥ T4 ∥ Q3c, now.** Q3a is the domain package plus one comment; T4 the message files; Q3c new web files and the
   editor mount.
2. **Q3b** once T4 has merged (it renders T4's leaf).
3. **Q3d** once Q3a, Q3b, Q3c and T4 have merged. It inherits `use-price-notice.ts` and the mount from Q3c.
4. **Q4** after Q3c (it reads `isSent` from Q3c's hook, ruling 7), and **never concurrently with Q3d**: both edit
   `configure-screen.tsx`. Either order; one at a time.
5. **Q5** after Q3d (it inherits `replacement-sheet.tsx`) and Q2 (merged).
6. **R4c** waits for **every Q3 sub-wave** (Q3a–Q3d and T4) and S2c. This restates R-j's "while S2c or Q3 is unmerged"
   in sub-wave terms: the customer-side guarantee of ADR 0178's Amendment of 2026-11-04 needs the domain (Q3a), the
   chooser's offer (Q3b) and the sheet (Q3d).

*Pins that move* (QA sorts each file and states its verdict in the report; the implementer edits none of them).
- **Q3a, flip** (`UNKNOWN_TIER` → `REPLACEMENT_REQUIRED` for a chosen tier the book does not hold, or a deleted earned
  accessory now reported):
  - `packages/configurator-domain/tests/pricing/price-design.test.ts:718-735`;
  - `packages/configurator-domain/tests/pricing/qa-6b-pricing.adversarial.test.ts:624-627` ("a tier nothing offers");
  - `packages/configurator-domain/tests/pricing/availability-refusal.test.ts:117-127`;
  - `packages/configurator-domain/tests/pricing/qa-p4a-availability.adversarial.test.ts:795-807` and the whole describe
    at `:943` ("RULED: … UNKNOWN_TIER whatever is switched off", `:959-984`). Its ruling was superseded by name in ADR
    0178's Amendment of 2026-11-04 ("the plan's P4a ruling `UNKNOWN_TIER` precedes `REPLACEMENT_REQUIRED`"); this split
    only applies that record;
  - `packages/configurator-domain/tests/contact/qa-8h-submission-snapshot.adversarial.test.ts:808-812`;
  - `apps/web/tests/review/qa-8c-refusal-order.adversarial.test.ts:112-118` (QA decides whether the review surface's
    order moves with the code or the row moves to another way of failing);
  - `packages/configurator-domain/tests/pricing/p4b-removed-linked-accessories.test.ts:164` ("does not name one the
    active book no longer states");
  - `apps/web/tests/app/api/designs/qa-m10-r5b-seen-side-canary.adversarial.test.ts:240-267`. It relies on the
    seen-book `authoredName` arm being unreachable: its forbidden list holds the bare string `"CNRY"`, which
    `REMOVED_NAME` ("CNRY-removed-name") contains, and Q3a makes that name reach the answer. The move: allow exactly
    `REMOVED_NAME`, once, inside `removedAccessories`; add the positive equality
    `removedAccessories = [{accessoryId: REMOVED_ACCESSORY_ID, authoredName: REMOVED_NAME}]`; keep `KEPT_NAME`, every
    description canary, the label, the note, the summary, the amount and `seenVersionId` forbidden; keep the log free of
    `"CNRY"`. The test at `:269` (renamed in the active book) stays as is.
- **Q3a, sorted by QA, expected to stay:** `apps/web/tests/price/p4a-root-prices-under-its-availability.test.ts` (its
  `:26` is a switched-off tier); `qa-6b-pricing.adversarial.test.ts:347-356` (an absent default is a book fault,
  ruling 1); `qa-8h-pricing-failure-stays-unseen.adversarial.test.ts:39` and `tests/staff/staff-changes-copy.test.ts:31`
  (enumerations of the codes); `item-usage.test.ts:97` (usage unchanged); `queries/replacements-required.test.ts`
  (gains arms; none flips). Staff tests that pin a vanished-tier kitchen's estimate wording: QA greps `tests/staff/**`.
- **Q3b, flip:**
  - both `it.fails` in `apps/web/tests/settings/qa-p4a-tier-offer-switched-off.adversarial.test.ts` lose their marker;
  - both `it.skip` in `apps/web/tests/price/qa-r1-no-book-surfaces.adversarial.dom.test.ts:146-163` (the settings pill
    renders; the top bar's fit runs) are un-skipped;
  - `apps/web/tests/price/no-price-book.test.ts:69-72` (throws `UnreadablePriceBookError`) becomes `NO_TIER_OFFER`;
  - `apps/web/tests/settings/qa-mp3-required-percent.adversarial.test.ts:141-146` ("still refuses to open without a
    book") moves with item 3; `:86-93` stays if `requireDeepCabinetPercent` keeps throwing for its other callers.
  - Expected to stay, QA confirms: `whole-kitchen-tiers.test.ts`, `global-settings-model.test.ts`,
    `global-settings.adversarial.test.ts`, `qa-6t-negative-delta`, `qa-6w-below-default-tier`,
    `qa-m6-wave-b-tier-deltas`, `whole-kitchen-tier-group-keys.test.ts`, `qa-p3-cut-over-surfaces` (nothing in them
    switches a tier off).
- **Q3c, Q3d, T4:** no existing pin is expected to move **[inf: falsified by a red test outside their new files]**.

*Acceptance.* Q3-a to Q3-g are delivered as follows; each sub-wave's bullets are its own gate.
- **Q3a:**
  - **Q3-g property** (fast-check; the `javascript-testing-expert` skill applies): over designs whose bodies the catalogue
    holds and books whose defaults are their own tiers, for any material or hardware tier id the design's settings
    choose that the book does not hold: `priceDesign` refuses `REPLACEMENT_REQUIRED` listing that tier, never
    `UNKNOWN_TIER`; `replacementsRequired`'s row for it offers exactly that group's active tiers in book order; nothing
    is preselected (no row's `remaining` is narrowed by the design's choice). The range keeps out uncatalogued bodies
    because `UNKNOWN_BODY` comes first, and would turn the property red for the wrong reason;
  - **parity:** the refusal's `items` equal the rows' `item`s in order, a vanished tier and switched-off items together;
  - **must-not:** a choice-less design against a book whose default names no tier is a replacement. It stays
    `UNKNOWN_TIER`;
  - **must-not:** a stored design reaches `UNKNOWN_TIER` through `priceDesign` under a well-formed book. Sabotage:
    restoring the `[]` early return in `disabledItemsNamedBy` turns the property red; moving `itemsNamedBy` instead
    leaves it green (R6, both directions);
  - **the deleted accessory:** earned under `seenBook`, not off in `seen`, absent from `activeBook` → reported, whatever
    `current` says; already off in `seen` → not reported; never earned → not reported; a built-in is unaffected
    (P4b-b's byte-identity holds);
  - **through the route, no route edit:** the `GET` for a design naming a vanished tier answers a non-empty
    `replacementsRequired` and `pricesChanged: false` (R5b-j2's shape); for the canary's "without-removed" world it
    names the deleted accessory by the seen book's name; R5b-l's closed keys hold;
  - **the contact route** refuses a vanished-tier kitchen `409 CONTACT_DESIGN_NOT_CURRENT` and stores no snapshot;
  - the usage reader's answers are byte-identical before and after (S-e).
- **T4:** both leaves exist in RO, are absent from no locale's generated declaration, carry no figure, and the copy lock
  lists them `Drafted`; RU is marked as an agent draft.
- **Q3b:**
  - **R-b's editor clause, met:** with `NO_PRICE_BOOK`, the settings sheet, the settings pill and the top bar mount
    without throwing; each whole-kitchen group shows T4's line with no option, delta or default; depth, colour and handle
    controls still apply; no surface renders `0` or "0 %";
  - **property:** for any availability over the book's tiers that leaves each group an active option, `tierIds` equals
    the group's active tiers in book order, and each active tier's delta equals the delta measured with every
    switched-off tier removed from the book. So one switched-off tier the kitchen did not choose blanks nothing;
  - **must-not:** a switched-off tier is in `tierIds`, or is offered by the settings sheet (P4a-a);
  - **must-not:** a switched-off book default throws. It yields no deltas, and the sheet still opens;
  - **R4a4's hand-off arm**, end to end over the fake world: a created class published inactive (A-17) leaves every
    offered delta measured, where before this wave it blanked them (the gap R4a4 recorded);
  - the kitchen's own switched-off tier is available, unmeasured, for the chooser, and the settings sheet does not show
    it.
- **Q3c:**
  - **gating:** no `GET` while `canWrite` is `"checking"` or `false`, on the share view, or with no active root; exactly
    one `GET` per open otherwise (a request counter in a DOM test);
  - `404`, `429`, `500`, `503` and a network failure show nothing and acknowledge nothing;
  - **C1 standalone:** `pricesChanged: true` with no replacements shows C1; "Am înțeles" `POST`s the **root's** pair,
    never the answer's `current`, then hides C1;
  - **ruling 6:** removed accessories with no replacements and `pricesChanged: false` (an accessory priced 0) still
    show the banner with the info line, and acknowledging writes the marker;
  - **stale page:** an answer whose `current` differs from the root's pair shows no C1 and sends no `POST`;
  - `400 unknown-version` and `revision-ahead` keep the notice for the view and send no second `POST`;
  - Q3-f: an info row shows once per disable not yet acknowledged, and not again after acknowledgement (route-level,
    over the fake world's notice store);
  - `isSent` is exposed on both wire arms (for Q4).
- **Q3d:**
  - Q3-a: while a row is unresolved, no figure shows on the bar, the breakdown or the account card; the bar shows
    "Prețul apare după ce alegi" with "Continuă" disabled (C4A), and with no replacement pending it renders exactly as
    before (a refused pricing for any other reason still draws no bar);
  - Q3-b: after the last choice the price shows, the marker is written, and reopening shows neither the sheet nor C1;
  - **Q3-c, must-not:** the second `GET` is sent before the store's `revision` has moved past the choice and
    `design === savedDesign`. A DOM test holds the save in flight (and once queued behind the coalescer's interval) and
    asserts no `GET` and no `POST` until it lands; the sentence then follows that answer's `pricesChanged` exactly;
  - Q3-c: with a replacement and a price change, exactly one sheet, and its confirmation carries the sentence; C1 never
    shows separately;
  - Q3-d: a sent kitchen gets the same sheet;
  - **must-not:** the sheet opens, or flashes, where its flow cannot complete: `canWrite` `"checking"` or `false`, the
    share view (`ConfigureScreen variant="shared"`), or no active root. There the refusal shows no figure and no modal,
    exactly as before Q3d. A non-dismissable sheet with no way to save is a defect, not an interim;
  - Q3-e (DOM and route, not browser): a disable makes the sheet appear on the next open with no new version;
    re-enabling before a choice makes it disappear and the price return unchanged;
  - accessibility: the sheet is a modal dialog, focus starts on the first "Alege", each row's accessible name is
    "{name} nu mai este disponibil", ‹ is the only exit, and no option is selected on open;
  - ruling 2: a vanished created class's row shows T4's generic line and never its id; a row with a name shows the name;
  - **browser, `CI=1`, no publish** (Q3-g): a spec stores a design naming a tier id the seeded book does not hold (the
    save route accepts any shaped id, `design.ts:163-168`). On open the sheet offers the active tiers, no figure shows,
    the generic failure never appears; choosing a tier shows the price and writes the marker. **The deleting version
    itself** (a seen book that holds the tier, an active one that does not) is proved by DOM and route tests; its browser
    arm waits for the Z gate, as U5c's publish paths do;
  - visual at the viewports in the table.

*Risks and residuals.*
- **The staff estimate's wording changes** for a vanished-tier kitchen: D10B's estimate now reads the replacement
  wording (`staffChanges.estimateRefusedReplacement`) instead of "not priceable" (point 9). Correct under ADR 0178's
  Amendment of 2026-11-04; recorded, not a question.
- **A colour row is drawn but not choosable until Q5** (Q3d item 2). An interim on an unshipped branch ("Nothing ships
  mid-milestone").
- **A disabled colour on a vanished material** offers the colours of the vanished material's code declaration
  (`replacements-required.ts:103-114`). Choosing the material first resets the colour (ADR 0057, Q5). Recorded **[inf:
  not exercised]**; Q3a's QA adds one example.
- **Global availability writes in `CI=1`.** Like a publish, an availability write changes every spec's server state
  **[inf: the U5c record names publish only; availability is the same global fake]**. So Q3-c and Q3-e have no browser
  arm.
- **Option (a) of ruling 2** stays open behind OQ-41.

*Verification, per sub-wave.*
- Domain tests and properties with `fast-check` (Q3a); `apps/web` price-notice route suites over the fake world
  (Q3a's route arms; Q3c's Q3-f); DOM tests (Q3b, Q3c, Q3d); the `CI=1` browser spec (Q3d).
- `pnpm check` on each merge; `pnpm ci:local` before any push; `pnpm format:check` whole-tree last.
- QA of Q3a runs `packages/configurator-domain` **and** `apps/web/tests/app/api/designs/**`, `tests/price/**`,
  `tests/review/**`, `tests/staff/**`, because the canary and the route arms move through the web app.

*Reading, QA and reviewers.*
- **QA of each sub-wave:** its row's Reading, that sub-wave's acceptance bullets and its pins above. Q3a adds
  `packages/configurator-domain/tests/pricing/**`, `tests/queries/**`, `tests/contact/**` and the web suites named in
  *Verification*. Q3b adds `apps/web/tests/settings/**` and `tests/price/**`. Q3c adds `tests/price/**` and the
  editor's e2e specs. Q3d adds the editor's e2e specs and `browser-and-visual-qa.md`.
- **Logic review (Q3a, Q3b, Q3d):** the row's Reading, plus §5 A-11, A-16, A-17 and A-18, ADR 0178's Amendments of
  2026-11-04 and 2026-11-08, ADR 0062 Amendment 3, and rulings 1–8 above.
- **Clean-code review (Q3a, Q3b, Q3d):** the diff and `engineering-conventions.md`.
- **Combined review (Q3c):** the row's Reading, *What Q3 and Q4 need from R5*, the diff, `engineering-conventions.md`.
- **T4:** the coordinator checks the leaves against the copy lock; no reviewer (Light, copy only).
- **Visual review (Q3c, Q3d; Q3b regression only):** the frames in each row and `browser-and-visual-qa.md`.

*Owner questions this split queues* (each built on its default; none blocks a dispatch):
- **OQ-41** — a vanished created class (and any vanished tier code cannot name) shows one generic line in the sheet
  rather than its name. Default: generic line (ruling 2). The alternative costs a lane R sub-wave and an ADR 0178
  amendment.
- **OQ-42** — when accessories were removed and nothing needs replacing, the notice is the non-blocking C1 banner with
  the accessory line, not the modal sheet. Default: the banner (ruling 6).
- **OQ-11g** — T4's two new Romanian leaves, built as drafted.

**Q5 split and R4c plan** (architect, 2026-11-09; plan step at `m10-price-dashboard` @ `9cd3986c`, with Q3d read at
`m10/q3d` @ `c6211abd`, built and in QA, **not merged**; nothing built, no test run, only reads and greps). Q5's row,
its extra duties (*Q3 sub-waves T4, Q3a, Q3c, Q4, Q3b merged*, "Remaining order"), H1-a/H1-b as Q5-a, and R4c's scope
(*R4a split*, *R4c's scope, as this split leaves it*, and the R4a4 and R4a6 hand-offs to R4c) come to about twenty
items. Under `docs/WORKFLOW.md`'s limit they split into **T5, Q5a, Q5b, Q5c** and **R4c1, R4c2, R4c3**. Each merges
alone. **Dispatch the sub-waves, never the Q5 row or R4c whole.** Every criterion already recorded (A-16, Q5-a, R-i,
R-j, R-d's M5 arm) stands; this block says which sub-wave delivers it.

*Evidence.* Every source claim below was read at `9cd3986c`, or at `c6211abd` for the four Q3d files
(`git show m10/q3d:<path>`), with its line (source-verified). **[inf]** marks an inference and says what would falsify
it. Owner rulings and records are doc-quoted.

*What the code says, which shapes the split* (source-verified).
1. **A lone colour or handle row has no way forward.** `isChoosableKind` admits material and hardware only
   (`replacement-sheet-model.ts:39-44`). A row that is not choosable is drawn with no button (`replacement-sheet.tsx:441-455`),
   the sheet stays open while any row is owed (`isPending: live.length > 0`, `:199`), and Escape and the scrim do nothing
   (`:50-54`). A kitchen whose only owed row is a colour or a handle can only leave by ‹.
2. **The sheet learns nothing from an apply.** It applies through `applyWholeKitchenSettings` (`replacement-sheet.tsx:176-182`),
   which answers `{committed: true}` and no effect (`configurator-store.ts:611-631`). `setMaterialTier`'s
   `resolvedFinishCount` counts cabinet resets only; the global colour's reset (`set-whole-kitchen-settings.ts:169-183`)
   is not counted. "A colour was reset" is therefore read by comparing the stored colours before and after the apply.
3. **No command replaces a colour or a handle at every level.** `setGlobalFinish` cannot reach a placement by its input's
   shape (ADR 0099 decision 2; `set-whole-kitchen-settings.ts:54-93`), `setKitchenHandle` writes `settings.handle` only
   (`set-kitchen-handle.ts:25-46`), and `setFinish`/`setHandle` act on one placement. A design names a colour or a handle
   at `settings.finish`, `settings.handle`, `settings.topRowHandle` and each cabinet whose catalogue row lets it carry one
   (`coloursAndHandlesNamedBy`, `catalogue-availability.ts`). The whole-kitchen effects branch at
   `store/apply-command-result.ts:138-142`.
4. **The universe is small.** Handles are `steel | black | push` (`design.ts:44`). `steel` and `push` are fixed defaults
   that are never switched off (`defaults-judgement.ts:42-50`; `kitchen-handle.ts:8, :10`), so today a handle row can
   only be `black`, and its options are `steel` and `push`. Each declared material's default colour is fixed too; a free
   colour is not an item, so MDF has no colour row.
5. **The created-class colour defect is a contract gap that throws.** Under a material no code declares,
   `coloursOfTheDesignsMaterial` answers `[]` (`replacements-required.ts:105-116`), so `activeOptionsReplacing` throws
   `NoReplacementOptionError` (`:87-91`). Q3d's `pendingReplacements` catches it and answers `[]`
   (`replacement-sheet-model.ts:52-68`): no sheet, the price refused, nothing to press. **Reachability:** materials cannot
   be created (`price-dashboard/structural-changes.ts:38-39` creates hardware classes and linked accessories only; the U4b
   record says the same); the seed holds the three declared ids (`sample-price-book.ts:430-448`, `materials.ts:17-21`); and
   no book reader checks a material tier against the declaration (`rtk proxy grep` for `MATERIAL_IDS|lookUpMaterial`
   under `pricing/` and `price-dashboard/` finds only `defaults-judgement.ts`). So it is unreachable through the app today,
   and reachable by a release that drops a declaration while the active book still holds it, or by an out-of-band write
   **[inf: falsified by a book path that refuses an undeclared material tier]**. Nothing ever said what a colour row offers
   under such a material: a contract gap, fixed in the domain (ruling 5), not in the sheet.
6. **Ordering inside the sheet.** A held switched-off material and a switched-off colour give two rows, and the colour
   row offers the switched-off material's palette (*P4a merged*, the Q5 hand-off). Choosing the colour first and the
   material second discards the colour (ADR 0057). A row resolved by that reset stays drawn (`rememberRows`), and
   `chosenName` answers `undefined` for a colour or a handle (`replacement-sheet-model.ts:301-315`), so its value is empty.
7. **The pill names a material the kitchen does not carry.** `selectedTierIn` names a switched-off tier by its own name
   and a vanished one by the book default's name (`global-settings-model.ts:890-902`, used by `materialEntryOf`,
   `:746-760`). Frames C4A, C4B and C4BD draw the header's material as "Material de ales" while the material is owed
   [mock L793-804]. The leaf exists (`replacementSheet.headerMaterialToChoose`, `ro.json:1923`) and nothing in
   `apps/web/src` reads it. Label widths are measured per render (`settings-pill-fit.ts:28-29`), so no fit-model edit is
   expected **[inf: falsified by a clipped label in the visual pass]**.
8. **Copy.** `replacementSheet.changedHandle` and `colourReverted` exist and are unread. No leaf says a colour was
   replaced by choice.
9. **The route's refusal of a deletion is in two files.** `draft-requests.ts:457` refuses `item-deleted` by its kind for
   change and revert (`isDeletion`, `:471-474`). `draft-plans.ts:222-224` refuses any revert whose removal holds a
   deletion, the deletion's own address included.
10. **The client gate.** `fetching-item-lifecycle-client.ts:61-62` sets `canDeleteStatedItems: false`, which
    `deleteStandOf` reads (`item-lifecycle-model.ts:133-149`).
11. **Publish already judges deletions in the request** (`deletion-refusal.ts:35-46`, `price-dashboard-service.ts:634-661`).
    The publish page's count is unbucketed and runs 50 probes at a time (`deletion-facts.ts:166-175`).
12. **The usage route's one-read-in-flight slot lives in the route module** (`staff-item-usage.ts:120-130`), not in
    `item-usage-read.ts` or `deletion-facts.ts`. A pre-check built on `readDeletionFacts` does not take it, so the delete
    dialog's count and the confirming write cannot collide on a `429` **[inf until R4c2's security review confirms]**.
13. **Deferred tests about deletion** (`grep -rn "it\.fails"` over `apps/web/tests/app/api/staff` and
    `tests/price-dashboard`): `qa-m10-u4a-wire.adversarial.test.ts:104` (pin `:119`), `material-wire.test.ts:196` (pin
    `:213`), `publish-client-against-routes.test.ts:566` and `:583`. Not R4c's: `qa-m10-r4a4-creation-limits…:94, :109`
    (the queued `LIMIT_REACHED` wave). No `it.fails` marks a deleted row's ↺; R4a4's "QA's `it.fails` will mark when" has
    no marker in the tree.

*Rulings this plan records* (architect; **[inf] until the coordinator accepts them**; the owner may overturn any).

1. **ADR 0081 and the forced sheet.** *Under ADR 0081 as written, an after-the-fact announcement is not acceptable.*
   Decision 8 rules every material change, and a forced replacement is one. Decisions 2 and 3, with ADR 0057 decision 3,
   ask for a blocking confirmation before the apply. Decision 6 forbids the consequence as a toast, banner or note after
   it. A-16 (ADR 0178, 2026-10-26, later) rules the C4 sheet the other way, "announced (… C4C)", and frame C4C draws
   "Culoarea a revenit la Alb." after the choice. A-16 names ADR 0086, not 0081, so **two live records disagree on this
   path**. Settled for the C4 sheet only, in A-16's favour:
   - ADR 0072's Amendment (*Consequence*) left "whether a withdrawn tier needs … the warn-before-apply shape of ADR 0057"
     to the dashboard's waves to decide. A-16 is that decision.
   - ADR 0081's intent is "we inform, and if he agrees, we change": the customer may decline and keep the colour. In the
     sheet nothing can be declined. Every declared material's palette is disjoint from every other's (ADR 0078 decision
     1), so every remaining option discards the colour, and the only exit, ‹, leaves the kitchen unpriced. A confirmation
     here would be the unconditional one ADR 0081 rejects ("a modal that always appears is a modal that is always
     dismissed").
   - **Owed:** the scribe writes a dated amendment to ADR 0081 naming decisions 2, 3, 6 and 8, recording that on the
     forced-replacement path A-16 governs (an announcement after the apply, no confirmation before), and a pointer from
     A-16 to it. It is written after Q5b's commit and before its merge. This plan does not write it.
   - **Unchanged:** the settings sheet's voluntary material change keeps ADR 0081 whole. Q5b's QA pins it (Q5b, below).
2. **When the reset is announced.** "Culoarea a revenit la {colour}" shows exactly when the material apply rewrote at
   least one stored colour, global or a cabinet's. It names the new material's default colour, as the app names a colour
   elsewhere: a palette entry by its name, MDF's free default by `globalSettings.pillColourValue`, which prints the hex.
   That is OQ-11's item (a) again, not a new question, and it follows whatever that item rules. It never shows when no
   stored colour changed. A kitchen with no stored colour that visibly repaints stays silent, as ADR 0081's
   owner-confirmed consequence (2026-09-05) has it.
3. **One command replaces a switched-off colour or handle at every level** (A-16). It is two domain functions,
   `replaceColour` and `replaceHandle` (no flag argument), each one `CommandResult` with one new effect (ADR 0057 decision
   2). `setGlobalFinish` and `setKitchenHandle` are not widened (ADR 0099 decision 2's shape guarantee). Each command
   rewrites every stored occurrence equal to the replaced item, and nothing else. For a colour that is `settings.finish`
   and each `body.finish` (`sameFinish`). For a handle it is `settings.handle`, `settings.topRowHandle` and each
   `body.handle`. Each command refuses what `setGlobalFinish`/`setKitchenHandle` refuse (`INVALID_OCCURRED_AT`,
   `FINISH_NOT_OFFERED` against the design's material, `UNKNOWN_HANDLE`). Availability is the caller's (H-4). No new
   refusal code.
4. **A colour row waits for an unresolved material row.** While a material row is unresolved, a colour row in the same
   sheet has no "Alege". Resolving the material resolves every colour row the reset cleared. Such a row is then drawn
   resolved, naming the colour it reverted to. A colour row still owed after the material is resolved becomes choosable.
   **Corrected 2026-11-09 (Q5b built, owner-relayed):** the earlier text said only an undeclared *new* material, which
   resets nothing, can leave one. That is false: an undeclared *old* material also leaves a colour row owed, and the row
   appears only after the material is replaced. A resolved colour or handle row names what replaced it, never an empty
   value and never an id (departure, see the *Q5b, Q5d, R4c1 merged* block: a resolved handle row the design no longer
   stores shows no value).
5. **Under an undeclared material, a colour row offers its entry's own palette**: the active entries of the declared
   material whose palette holds the switched-off entry (palette ids are namespaced by material, `materials.ts:28-31`).
   *Why:* it never throws, so parity between the refusal's items and the sheet's rows holds. Any entry passes
   `setGlobalFinish`'s offer under an undeclared material (ADR 0078 decision 3). M3's last-active guard is per material
   palette and each palette's default colour is fixed, so that group never empties. `NoReplacementOptionError` stays the
   answer only when a group has no active option. *Rejected:* dropping the colour row (the price would still refuse on
   it, so the parity breaks); offering every declared palette (unbounded and arbitrary).
6. **The pill's material entry reads `headerMaterialToChoose` exactly while the domain owes a material row**, computed
   from the offer and the applied choice alone (a chosen id among the switched-off tiers or held by neither list, or no
   choice and a switched-off book default). The parity criterion is in Q5c. The rule is the same on every surface that
   draws the pill, the share view included, because it is a fact of the kitchen. The hardware entry while a hardware row
   is owed is OQ-43 (default: the entry is left out, so the pill never names a tier the kitchen does not carry).
7. **The colour and handle choosers** follow C4B's shape: the heading is `globalSettings.colourHeading` or
   `kitchenHandleHeading`, the options are the row's `remaining` in order, the kitchen's own switched-off item is struck
   and cannot be chosen, nothing is preselected, and "Aplică" stays off until a choice. A colour option draws its name
   and its swatch. There is no "Se aplică tuturor celor N dulapuri" line: that leaf counts every cabinet, and a colour
   replacement reaches only the cabinets wearing that colour.
8. **The draft-write pre-check (R4c2).** The order is the change route's own checks, then the stale draft revision, then
   the plan. The plan refuses a fixed default as `400 {issues: [{field: "change", code: "ITEM_IS_DEFAULT"}]}`, an unstated item as `UNKNOWN_ITEM` and a built-in accessory as `NOT_EDITABLE`, all before any probe. These are per-change refusals (`structural-changes.ts:365-389`), which `judgeDraft` answers on the new change (`draft-judgement.ts:47-52`, `draft-plans.ts:110-115`), never `409 candidate-refused`. Only after that, and only
   for a deletion of a row the active book states, comes the pre-check:
   - the saved defaults (R4a1's read; an unparseable row is `503`) answer `400 ITEM_IS_DEFAULT` on field `change`;
   - then one count through `readDeletionFacts` (SQL probes against the active book only, never the walk, under
     R4a2's deadline) answers `400 ITEM_IN_USE` on field `change` when it is above 0;
   - a failed or late read is `503` and writes nothing.

   A row the draft created needs no count. It does not take the usage route's slot (point 12).
9. **The word for a fixed default is settled at the change.** The change route answers `400 ITEM_IS_DEFAULT` for a
   fixed default (`applyChanges`, source-verified in ruling 8) and a saved one (the pre-check) alike, so no stored draft written through the app holds a fixed-default deletion. A
   draft stored out of band keeps publish's `409 candidate-refused`, which fails closed and writes nothing.
   `publish-client-against-routes.test.ts:583` (`blocked is-default` at publish) is therefore retired by QA citing this
   ruling, not flipped. U5c's fixed-default wording at publish is not needed, so no copy is owed. *Alternative, one more
   file:* map a candidate refusal of `ITEM_IS_DEFAULT` on a deletion to `409 item-is-default` in `publish-plan.ts`. The
   coordinator may prefer it.
10. **Precedence (R4a6 hand-off 2).** A deleting publish with a stale `expectedAvailabilityRevision` and an item now in
    use answers `item-in-use`, as S2c's recorded order does. Nothing is written either way. It is recorded as accepted,
    with no pre-check.
11. **The publish page's count is bounded before deletions can enter a draft** (R4a6 hand-off 3). `deletion-facts.ts`
    gains a per-process memo of the page's counts. It is keyed by (draft revision, active sequence, availability head),
    lives a short time (proposed 60 s **[inf]**, the owner's to retune), and remembers only a whole answer. Publish never
    reads it (R-i).
12. **Restore with a pending deletion** (M4) keeps the deletion and adds no change for a row the draft deletes, so
    `[delete T, rate on T]` never arises. Owner-visible on staff screens: OQ-44.
13. **Reverting a deletion past the 20-class or 50-accessory cap** answers `409 candidate-refused`, as built, and the
    deletion stays. It joins R4a4's queued `LIMIT_REACHED` wave. It is pinned, not changed.
14. **One book for a creation's rates** (R4a4 hand-off). Falsify it first. QA's property: for any draft holding
    deletions, a class can still be created whenever the active book allows one. If the property is red, `ratesOf` and
    `prepareTierCreation` read `hardwareRatesOf(activeBook)` (M4's rule). If it is green, the hand-off is closed as
    unreachable.
15. **A conflict while deleting** (`deletionSettlementOf`'s `conflict`) re-reads the draft and re-counts before Delete
    can be pressed again. A second press never sends a deletion judged on the facts from before the conflict.

*Why Q5 precedes R4c.* Colours and handles are not deletable kinds (`book-field-address.ts`'s deletable kinds are a
hardware class, a material and a linked accessory). Turning deletion on makes a **vanished material** reachable in
production, and so makes its colour reset (ruling 2) and its colour row (ruling 4) reachable too. R-j's hard gate is
Q3d. Q5 is the recorded order ("Q3d and Q5 merge together before any push", "then Q5, then R4c").

*Sub-waves.* Separate worktrees; one writing agent per tree (R2); at most two implementers at once beside Q3d's QA and
review.

| Sub-wave | Items (≤ 5) | Production files | Depends on, and base | Tier | Visual | Reading |
| --- | --- | --- | --- | --- | --- | --- |
| **T5** Q5's new leaf | (1) `replacementSheet.changedColour`, RO draft "Culoare schimbată în {name}. Prețul a fost actualizat." (2) An RU agent draft, marked, never pinned. (3) The copy lock lists it `Drafted` (OQ-11h) | `ro.json`, `ru.json`, `ro.d.json.ts` (regenerated); copy lock `tests/support/approved-romanian-messages.ts`. Three | none; base `m10-price-dashboard` | Light, copy only (the coordinator checks the leaf against the lock) | None | T4's row; ADR 0095 decision 2; ADR 0106 Amendment A |
| **Q5a** the domain: replace at every level; a colour under an undeclared material | (1) Ruling 3: `replaceColour`, `replaceHandle` and one effect each. (2) Both effects join `CommandEffect`, with their branch beside the whole-kitchen effects in `apply-command-result.ts:138-142`, in one change (H-6). (3) Ruling 5 in `replacements-required.ts` (P-lane file, held in a stated window as Q3 held it). (4) Exports. (5) Paired tests; QA flips the `it.fails` | domain `commands/replace-switched-off-appearance.ts` (new), `commands/command-result.ts`, `index.ts` (exports), `queries/replacements-required.ts`; web `store/apply-command-result.ts`. Five | merged only; base `m10-price-dashboard` (touches no Q3d file); **may start now** | **Full** (logic and clean-code): it rewrites stored documents at two levels | None: domain and store adapter | This block (points 3–6; rulings 3 and 5); A-16; ADR 0057 decisions 2 and 4; ADR 0078 decisions 1, 3 and 5; ADR 0099 decisions 2, 6 and 8; H-4, H-6, H1-a, H1-b, H2-b; `set-whole-kitchen-settings.ts`; `set-kitchen-handle.ts`; `set-appearance.ts`; `catalogue-availability.ts:139-245`; `replacements-required.ts`; `named-items.ts`; `defaults-judgement.ts:36-50`; `apply-command-result.ts` |
| **Q5c** the pill while a material is owed | (1) Ruling 6: `materialEntryOf` reads `headerMaterialToChoose` while a material row is owed. (2) OQ-43's default for the hardware entry. (3) The C4D frame's header still reads "Material de ales" after the material row is resolved (`base4(L.matN …)`, mock L802). That is a mockup inconsistency, recorded as a departure: the label names the chosen tier once the row resolves | `settings/global-settings-model.ts`; `i18n/content.ts`, because `Content` does not expose the leaf (`rtk proxy grep` finds only `replacementSheet.accessoryRemoved` there, `content.ts:2120`) while the model reads `content.globalSettings.*`. Two (`use-top-bar-fit.ts` only if a type needs it) | merged only (Q3b); base `m10-price-dashboard`; **may start now** | Light (one combined reviewer) | **Verify-visual**: the top bar at 390 × 844, 900 × 500 and 1440 × 900 (ADR 0104 Amendment H's give widths), with a material owed and after the choice, under `CI=1` through the stored vanished-material design (Q3-g's path) | This block (point 7; ruling 6); frames C4A, C4B, C4BD, C4D [mock L793-807]; ADR 0104 decision 3 and Amendment H; Q3b's residuals 2 and 3; `global-settings-model.ts:673-800, :890-902`; `settings-pill-fit.ts`; `use-top-bar-fit.ts:72-75`; `browser-and-visual-qa.md` |
| **Q5b** the sheet resolves a colour and a handle | (1) Colour and handle rows are choosable through ruling 7's chooser. The `ChoosableKind` interim ends. (2) The request carries a replacement. `WholeKitchenSettingsRequest` gains one optional replacement (colour or handle, from and to) that the preflight runs through Q5a's command, so the sheet keeps the store's one-commit action and `configurator-store.ts` is not edited. (3) Ruling 4 (the colour row waits) and the resolved-row names. (4) Ruling 2: the sheet compares stored colours before and after a material apply and records the reset. C4C's lines run in order: material, "Culoarea a revenit la …", hardware, colour (T5's leaf), handle (`changedHandle`), then `alsoUpdated` (ruling 8 of *Q3 split* unchanged). (5) Narrow `pendingReplacements`' catch: it stays for `NoReplacementOptionError` only. Its comment states the one remaining cause (every option of a group switched off). **Also:** the confirmation's changes are keyed by item, not by kind. Q3d's `withChange` filters by `kind` (`replacement-sheet.tsx:248-256`), so a second colour choice would drop the first line; two `finish` rows are reachable (a switched-off kitchen colour and a cabinet's own other switched-off colour) | `price/replacement-sheet-model.ts`, `price/replacement-sheet.tsx`, `price/use-price-notice.ts` (`ReplacementChange` widened; the confirmation), `store/whole-kitchen-apply.ts`, `price/replacement-sheet.module.css` (the colour option's swatch). Five | Q5a and T5 merged; **Q3d merged locally after its QA and reviews** (Q5b edits Q3d's files; never branch from `c6211abd` while Q3d's QA is open) | **Full** (logic and clean-code) + visual. **A recorded upgrade from Lane Q's "Q5 Light"**: it carries A-16 and the ADR 0081 exception (ruling 1) | **Verify-visual**: C4A and C4D with a colour row and a handle row, the colour and handle choosers, and C4C with the reset line, at 390 × 844 and 1440 × 900. **Colour and handle rows run on a dedicated `next dev` server of the visual agent's own** (never port 4320, never a server another spec uses; `agent-coordination.md`), where it switches an item off through the staff route and back. **C4C's reset line also runs under `CI=1`** through a stored design naming `material.ghost` with a stored palette colour (Q3-g's path, no publish, no availability write) | This block (points 1, 2, 6, 8; rulings 1, 2, 4 and 7); *Q3 split* rulings 5 and 8; A-16; ADR 0057; ADR 0081 (decisions 2, 3, 6 and 8); ADR 0072 Amendment *Consequence*; ADR 0086; ADR 0099; frames C4A–C4D, C4AD, C4BD [mock L792-811]; Q3d's four files at its final tip; `whole-kitchen-apply.ts`; `configurator-store.ts:560-720` (read only); `chosen-finishes.ts`, `resolved-finish.ts` (read only); `browser-and-visual-qa.md` |
| **R4c1** deletion's edges, before deletion is on | (1) Ruling 12 in `restore-plan.ts`. (2) Ruling 13, pinned. (3) Ruling 14: the property first, then the fix only if red. (4) Ruling 10, pinned. Everything is tested through stored drafts that hold `item-deleted`, which the stored reader accepts since R4a3. The route still refuses one | `lib/server/price-dashboard/restore-plan.ts`; only if ruling 14's property is red: `creation-plans.ts` and domain `price-dashboard/structural-changes.ts` (M-lane file, a stated window). One to three | merged only; base `m10-price-dashboard`; may run beside Q5b (disjoint files) | Full + security (Lane R) | None: server only | This block (rulings 10, 12–14); the M4 hand-offs (*M4 hand-offs*, "Decide whether restore keeps a pending deletion"); R4a4's hand-offs to R4c; `restore-plan.ts`; `creation-plans.ts:104`; `structural-changes.ts:88-130`; `draft-structure.ts:69`; `qa-m10-r4a4-creation-limits.adversarial.test.ts` |
| **R4c2** deletion on at the draft route | (1) `draft-requests.ts` accepts `item-deleted` as a change (value `true` only) and as a revert. The named refusal goes. (2) `draft-plans.ts` lets a revert take back a deletion by its own address, and keeps R4a3's `400 NOT_EDITABLE` for a field revert of a row the draft deletes. (3) Ruling 8's pre-check in a new module, called by the change write. (4) Ruling 11's memo. (5) The `price-draft-changed` audit row with `changeKind: item-deleted`, and the revert's row naming the deletion (R4a3's audit ruling), each in the write's transaction | `draft-requests.ts`, `draft-plans.ts`, `price-dashboard-service.ts` (the change write calls the pre-check), `lib/server/price-dashboard/draft-deletion-check.ts` (new), `deletion-facts.ts`. Five | **Q3d, T5, Q5a, Q5c, Q5b and R4c1 merged, and S2c (merged `64d98623`). The branch's first commit descends from the Q5b merge** (R-j, below) | **Full + security** | None: server only | This block (points 9, 11–13; rulings 8–11); the deletion-race block (all), R-i, R-j, R-d; ADR 0178 Amendment of 2026-11-04; ADR 0062 Amendment 3, item 2; R4a2 and R4a6 records and hand-offs; `draft-requests.ts`; `draft-plans.ts:200-280`; `price-dashboard-service.ts:340-420, :520-661` (the order of checks); `deletion-facts.ts`; `deletion-refusal.ts`; `item-usage-read.ts`; `staff-item-usage.ts:120-130`; wire `:90-100, :159-245` |
| **R4c3** Delete on in the dashboard | (1) `canDeleteStatedItems: true` in the fetching client. (2) Ruling 15 in `deletionSettlementOf` and its caller. (3) D7's ↺ on a deleted row (`publish-model.ts`), reverting by the deletion's address. (4) The stale-draft list's deleted line gets the same ↺ (`stale-draft.ts:18, :26`). (5) OQ-11f's `cannot-judge` note on Delete stops being a standing state in production. No wording change; recorded | `fetching-item-lifecycle-client.ts`, `item-flows.ts`, `use-item-availability.ts` (only if ruling 15 needs it), `publish-model.ts`, `stale-draft.ts`. Five | R4c2 merged | Full + visual. No security review, as R4a5 had none: client files only, and every judgement stays on the server (a recorded choice; the coordinator re-tiers if a server file joins) | **Verify-visual and e2e under `CI=1` with the draft lock** (`support/price-draft-lock.ts`), publishing nothing (below) | This block (point 10; ruling 15); R4a5's row and record; R4a4's hand-offs; U5b, U5c records; frames D4E/F, D5C/D/G, D6C [mock L779-781] and the publish page's D7; `item-lifecycle-model.ts:120-150`; `item-flows.ts:140-207`; `publish-model.ts:185-410`; `stale-draft.ts`; `browser-and-visual-qa.md` |

*Order and the R-j check.*
1. **Now, while Q3d finishes QA and review:** Q5a ∥ Q5c. T5 any time; it is minutes and copy only.
2. **Q3d merges locally** (no push), then **Q5b** branches from the tip holding Q3d, Q5a and T5. **R4c1** may run
   beside Q5b.
3. **Q3d, Q5a, Q5c and Q5b are all merged before any push** (the recorded rule).
4. **R4c2** branches from the tip holding the Q5b merge. **R-j, made checkable:** at R4c2's merge, run
   `git merge-base --is-ancestor <Q5b merge> <R4c2's first commit>` and the same for the Q3d merge. Both must exit 0.
   Also read `rtk proxy git log -p <Q5b merge>..<R4c2 merge> -- apps/web/src/lib/server/price-dashboard/draft-requests.ts`:
   no commit before R4c2's may remove the named refusal. A branch cut earlier and merged later breaks R-j, because the
   rule is about every commit the merge makes reachable.
5. **R4c3** after R4c2. *Must-not:* the client gate opens in a commit where the route still refuses `item-deleted`.
6. Then the Z gate.

*Pins that move* (QA sorts each file and states its verdict in its report; implementers edit no QA pin, §9.1).
- **Q5a:** `packages/configurator-domain/tests/pricing/qa-q3a-vanished-tier.adversarial.test.ts:477` loses `it.fails`.
  Tests that enumerate `CommandEffect` or whole-kitchen effects gain arms. QA greps `kitchen_handle_set` under
  `packages/configurator-domain/tests` and `apps/web/tests/store`. None is expected to flip **[inf]**.
- **Q5b:** Q3d's `tests/price/q3d-replacement-sheet-model.test.ts`, `q3d-replacement-sheet.dom.test.ts` and Q3d QA's
  adversarial files. Each assertion that a colour or handle row has no button, `isChoosable: false`, or `ChoosableKind`
  material and hardware only, moves. Each `NoReplacementOptionError`-means-no-sheet assertion is kept for the all-off
  group only.
- **Q5c:** pill tests that pin a switched-off or vanished material's label (`tests/settings/**`, Q3b's QA files, and
  `tests/app/configurator/**` for the top bar). QA greps `pillMaterial` and `switchedOffTiers`. The `Content` key lists
  in `tests/i18n/content.test.ts` and `tests/i18n/golden-output-fixtures.ts` gain the leaf.
- **R4c1:** none expected **[inf]**.
- **R4c2:** `qa-m10-u4a-wire.adversarial.test.ts:104` flips and its pin `:119` is deleted. `material-wire.test.ts:196`
  flips and its pin `:213` is deleted. `publish-client-against-routes.test.ts:566` flips. `:583` is retired (ruling 9).
  The kind × reader cells "refused until R4c" in `qa-m10-r4a3-structural-routes.adversarial.test.ts`, and the R-i "R4a
  merges with deletion still off" arms in `qa-m10-r4a6-publish-deletions.adversarial.test.ts` and
  `price-dashboard-draft-route.test.ts`, move **[inf: not opened; QA lists them]**.
- **R4c3:** `qa-m10-r4a5-delete-gate.adversarial.test.ts` (its R4a5 must-not becomes the positive),
  `fetching-item-lifecycle-client.test.ts`, `accessory-linked-switch-off-production.dom.test.ts:131`,
  `qa-m10-r4b2-production-source.adversarial.test.ts` if it pins Delete off, and `stale-draft.test.ts` /
  `publish-structural-rows*` where they pin "a deleted row has no ↺".

*Acceptance.*
- **T5:** the leaf exists in RO, appears in every locale's declaration, carries no figure, and the lock lists it
  `Drafted`. RU is marked as an agent draft.
- **Q5a:**
  - **property (fast-check; the `javascript-testing-expert` skill applies):** for any design and any switched-off
    colour or handle it names, `replaceColour`/`replaceHandle` with any option from `replacementsRequired`'s row yields a
    design that `disabledItemsNamedBy` no longer lists that item for. Every stored value that differed from the
    replaced item is byte-identical before and after. That covers a cabinet's own other colour or handle (H1-a, ADR 0099
    decision 2), an absent finish staying absent (ADR 0078 decision 5) and `settings.topRowHandle` when it is another
    handle;
  - after a handle replacement, H1-b holds: the push-to-open count equals the resolved push bodies, and a top-row body
    with `canHandle: false` stays push and latched (H2-b);
  - one call is one `CommandResult` and one effect; a refusal returns the design by identity;
  - H-6: the new effects are members of `CommandEffect`, and `applyCommandResult` leaves the selection where it was for
    them. Sabotage: drop the branch and the store test goes red;
  - ruling 5: the `it.fails` at `:477` passes as `it`. Under an undeclared material, the colour row offers its entry's
    own palette's active entries in palette order, and the refusal's items equal the rows' items. `NoReplacementOptionError`
    is thrown only when that palette has no active entry. Sabotage: restore `return []` for the undeclared lookup and
    the flip goes red;
  - **must-not:** a stored colour or handle that is not the replaced item moves. A colour the design's declared material
    does not offer is accepted. The usage reader's answers move (S-e's parity holds byte-identical).
- **Q5c:**
  - **parity property:** over designs, books and availabilities, the material label is `headerMaterialToChoose` if and
    only if `replacementsRequired` lists a material item;
  - after the row resolves, the label names the chosen tier;
  - **must-not:** while a material is owed, the pill names the book default for a vanished choice, or the switched-off
    tier's name;
  - with no book the material entry is absent, as Q3b left it;
  - OQ-43's default: the hardware entry is absent while a hardware row is owed, and present otherwise.
- **Q5b:**
  - **no dead end (property):** for any set of owed rows drawn from the domain, each unresolved row either has an
    enabled "Alege" or is a colour row waiting on an unresolved material row that has one. *Must-not:* `isPending` is
    true while no unresolved row can be chosen;
  - **lone colour, lone handle (DOM):** a kitchen whose only owed row is a switched-off colour, or a switched-off
    handle, opens the sheet. Choosing an option and pressing "Aplică" makes one store commit and one save. The price
    shows once the save lands (ruling 8 of *Q3 split*). **Reworded 2026-11-09 to what is built and pinned:** the price
    shows straight after Apply; the second `GET`, the marker `POST` and the C4C line wait for the save. An unsaved kitchen
    cannot be sent (review gates on `hasUnsavedEdit`; contact refuses `REPLACEMENT_REQUIRED` server-side). Recorded as a
    departure from the Q5-a acceptance as first written. The marker is written, and C4C carries `changedColour` or
    `changedHandle`;
  - **A-16 at every level (DOM over the store):** after the choice, no level of the design names the switched-off item,
    and each other stored colour or handle is unchanged;
  - **ruling 2:** a vanished or switched-off material replaced on a design carrying a stored colour that the new material
    does not offer shows "Culoarea a revenit la {the new default}" in C4C, after the material line, only after the save
    landed. A design with no stored colour shows no such line (the silent repaint). A design whose stored colour the new
    material offers (an undeclared vanished material wearing `pal.antracit`, replaced by PAL) shows none. The trigger is
    a before-and-after comparison of stored colours, global included. Sabotage: read `resolvedFinishCount` instead, and
    the global-colour-only arm goes red;
  - **ADR 0081, both directions:** inside the sheet no confirmation step appears before a material apply. In the
    settings sheet, a voluntary material change that would discard a chosen colour still confirms before it, and never
    shows the reset line after it. The pins at `global-settings*` stay green;
  - ruling 4: with a switched-off material and a switched-off colour, the colour row has no "Alege" until the material
    resolves, then shows resolved and names its reverted colour. A choice made first can never be discarded by a later
    one in the same sheet;
  - Q5-a in the browser: C4C's reset line, and the vanished-material path, under `CI=1` (no publish, no availability
    write). H1-a and H1-b for a handle replacement run on the visual agent's dedicated server. Under `CI=1` they are DOM
    and domain tests, because a switched-off handle needs a global availability write. This is a recorded residual,
    as Q3-e's;
  - **two switched-off colours** (the kitchen's colour and a cabinet's own other one) give two rows, two choices and
    two C4C lines; each resolved row names its own replacement;
  - accessibility: the chooser is in the same dialog and trap. Focus moves to its first enabled option. A struck option
    is disabled and is not announced as selected.
- **R4c1:**
  - ruling 12, through the restore route: a draft holding `item-deleted` on T and a restore of a version that prices T
    answer `200`. The draft still deletes T and adds no change addressed to T (reworded 2026-11-09 from "holds no change"). `applyChanges` accepts the result;
  - ruling 13 **(moved to R4c2, 2026-11-09: the route cannot revert a deletion until R4c2; the `it.fails` in `price-dashboard-revert-deletion-past-cap.test.ts` flips there)**: reverting a deletion when the draft creates enough accessories that the revert passes 50 answers
    `409 candidate-refused`. The draft is unchanged, and the store holds one draft revision;
  - ruling 14: the property, green or fixed, with its verdict in the report **(verdict 2026-11-09: a real defect, closed as unreachable for app-written books and moved to the Z gate; see the *Q5b, Q5d, R4c1 merged* block)**;
  - ruling 10: the precedence, pinned by a route test that writes nothing.
- **R4c2 (R-j, R-i again, R-d):**
  - **R-j ordering:** the ancestry checks above exit 0 and are quoted in the merge report;
  - **R-i through the real route:**
    - the change route deletes an unused T (`200`);
    - a design then saves naming T, and publish answers `409 item-in-use {T}` (the domain's arm);
    - the store's arm, with the route's usage stubbed to 0 after the count, answers the same;
    - neither arm writes anything;
  - **the pre-check:**
    - a design naming T before the deletion makes the change `400 ITEM_IN_USE`, nothing is written and no audit row
      is written;
    - a saved D9 default is `400 ITEM_IS_DEFAULT`, and so is a fixed default (through `applyChanges`);
    - unreadable defaults, a failed count or a count past the deadline are `503` and write nothing. Sabotage: answer
      `0` on a timeout, and the suite goes red;
  - **R-d's M5 arm, end to end:**
    - the change route deletes X;
    - R4b1's `PUT` saves defaults naming X;
    - publish answers `409 item-is-default {X}` and writes nothing;
  - **revert:** ↺ on the deletion's address answers `200` and the draft no longer deletes the row; a field revert of a
    row the draft deletes stays `400 NOT_EDITABLE`;
  - **created then deleted:** deleting a row the same draft created asks no count. A test fails if a probe reaches the
    reader;
  - **security must-nots:**
    - a body member other than `address`, `value` and `expectedDraftRevision` is `400` before any count;
    - a value other than `true` is `400`;
    - an operator session is `403` and spends nothing;
    - an address naming an item the active book does not state is refused before any probe;
    - a `migrated-design` probe never reaches the reader at the pre-check;
    - the `ITEM_IN_USE` body is exactly `{issues: [{field: "change", code: "ITEM_IN_USE"}]}`, the field every
      domain refusal of a change carries, with no count, no design id and no name;
    - the always-present built-in (OQ-31's cover) is refused;
    - one `price-draft-changed` row per accepted deletion and per revert, in the same transaction, and an audit
      failure is `503` with the change absent;
  - **ruling 11:** two page renders at one key inside the TTL issue one set of counts. A render after the draft
    revision moves recounts. Publish issues its own counts whatever the memo holds. Sabotage: let publish read the memo,
    and R-i's "a page's count never reaches the judgement" goes red.
- **R4c3:**
  - in a production build, Delete of a stated row is offered when the defaults are readable and the row is not a
    default (the R4a5 must-not inverted);
  - ruling 15: after a `409 changed-meanwhile` on a deletion, the next press re-reads and re-counts first (a request
    counter in a DOM test);
  - D7 and the stale-draft list offer ↺ on a deleted row, and it reverts by the deletion's address;
  - **browser, `CI=1`, draft lock held, nothing published** (mobile and desktop): delete an unused, non-default stated
    class into the draft (the dialog's count reads 0), see it on D7 with ↺, take it back with ↺, and discard in
    `afterEach`;
  - **cannot run in a browser without publishing, and so run as route or DOM tests over the fake world:**
    - publishing a deletion: a publish moves the active version for every spec (the U5c record);
    - a non-zero count and `ITEM_IN_USE`: the seeded fake reader counts only planted designs (R4a5 record);
    - R-d end to end;
    - the store's race arm;
    - a customer meeting the deleted tier (that browser arm waits for the Z gate, as Q3-g's deleting version does);
  - a D9 save in a browser is also avoided, because the defaults store is shared by every spec.

*Owner questions this plan queues* (each built on its default; none blocks a dispatch).
- **OQ-43** — while a hardware row is owed, what does the settings pill say for hardware? Default: the hardware entry is
  left out, so the pill never names a tier the kitchen does not carry, and no copy is new. The alternative is a leaf
  such as "Feronerie de ales" (new copy).
- **OQ-44** — a restore while the draft deletes a row the restored version prices. Default: the deletion stays and the
  restore changes nothing on that row (ruling 12). The alternative drops the deletion.
- **OQ-11h** — T5's leaf `replacementSheet.changedColour`, built as drafted.
- Not new: the hex in "Culoarea a revenit la #eceeeb" follows OQ-11's item (a).

*Risks and residuals.*
- **Q5b edits Q3d's two largest files** (`replacement-sheet.tsx` is 584 lines at `c6211abd`). Any review fix to Q3d
  moves them, so Q5b starts only from Q3d's merged tip.
- **The ADR 0081 amendment is owed before Q5b merges** (ruling 1). Without it, two live records disagree on the forced
  path.
- **Colour and handle rows have no `CI=1` browser arm.** A switched-off item is a global availability write. The
  dedicated-server visual pass is evidence only of what it captured.
- **Ruling 5's group** is reachable only by a release that drops a material declaration. It is defence that keeps the
  sheet total, not a live path.
- **R4c makes deletion live in production at R4c3** (after the Z gate applies `0023`–`0029`). Publish still judges every
  deletion in its request, and the store guard holds (S-j). A page left open since before a publish is ADR 0178's path
  (ii), owned by Q3 and Q5.
- **The pre-check races a save,** as the publish count does. It is a courtesy, not the guard. Publish and the store are
  the guard (R-i).
- **Ruling 11's memo** can show a count up to the TTL old. It is display only.

*Verification, per sub-wave.*
- Domain properties with `fast-check` (Q5a, Q5c's parity, R4c1's ruling 14).
- DOM tests over the store (Q5b, Q5c, R4c3).
- Route tests over the fake world (R4c1, R4c2), and `qa-m10-u4a-wire` and `material-wire` flips, each in the commit
  that keeps its promise.
- `CI=1` browser specs: Q5b's reset line, Q5c's label, R4c3's draft round trip. The dedicated-server visual pass is for
  Q5b's colour and handle rows.
- `pnpm check` on each merge, `pnpm format:check` whole-tree last, and `pnpm ci:local` before the push that follows
  Q5b's merge. R4c2's merge report quotes the R-j ancestry commands.

*Reading, QA and reviewers.*
- **QA of each sub-wave:** its row's Reading, its acceptance bullets and its pins above. Q5a adds
  `packages/configurator-domain/tests/commands/**`, `tests/queries/**`, `tests/pricing/qa-q3a-*` and
  `apps/web/tests/store/**`. Q5b adds `apps/web/tests/price/**`, `tests/settings/global-settings*`, the editor's e2e
  specs and `browser-and-visual-qa.md`. Q5c adds `tests/settings/**` and `tests/app/configurator/**`. R4c1 and R4c2 add
  `apps/web/tests/app/api/staff/**`. R4c3 adds `apps/web/tests/price-dashboard/**` and `tests/e2e/hardware*`,
  `materials*`, `accessories*`, `publish-page*`.
- **Logic review (Q5a, Q5b, R4c1, R4c2, R4c3):** the row's Reading, plus §5 A-16, A-17 and A-18, ADR 0178's Amendment
  of 2026-11-04, and rulings 1–15 above. For Q5b, also ADR 0081 whole and ADR 0057.
- **Clean-code review (the same waves):** the diff and `engineering-conventions.md`. For R4c2, also
  `price-dashboard-service.ts`'s header (the order of checks).
- **Security review (R4c1, R4c2):** the row's Reading, plus ADR 0019, 0156, 0172 D7, 0173, R4a2's limits, and this
  block's point 12 (confirm the slot).
- **Combined review (Q5c):** the row's Reading and the diff.
- **Visual review (Q5b, Q5c, R4c3):** the frames in each row and `browser-and-visual-qa.md`.
- **T5:** the coordinator checks the leaf against the copy lock; no reviewer.

### Lane Z — Integration and close

- **Z1:**
  - all lanes are merged;
  - `pnpm check`, then `pnpm ci:local` on a clean tree, are quoted;
  - the full e2e suite runs on mobile and desktop projects;
  - the visual pass of §13.3 is done;
  - every `[mock]` frame is reproduced or its deviation is recorded with a reason.
- **Z2:**
  - **release notes:** no rollback past the build that introduced `settings.handle` (H1) or `settings.topRowHandle`
    (H2), because a `strictObject` refuses the unknown key (ADR 0099 d10's precedent; H-5);
  - the test audit (`configurator-test-auditor`, ADR 0152 d4) runs over every test M10 added;
  - a "cannot fail" finding keeps the milestone open;
  - then the scribe archives.

**Z's readers.** Z1's reader is the visual verifier, and Z2's is the test auditor. Neither writes.

- **Visual verifier reading:** §13.3; `docs/best-practices/browser-and-visual-qa.md`; the mockup; every wave's U/K/Q
  acceptance lines.
- **Test-auditor reading:** `docs/skills/lemnaria-test-audit/SKILL.md`; ADR 0152 and Amendment A; this plan's
  criteria; the list of test files M10 added (`git diff --name-only 0910dc06..HEAD -- '*test*'`).
- **The coordinator's Z1 check:** every criterion id in §10 has a test or a recorded reason it cannot have one.

---

## 11. Risks

| # | Risk | Where it bites | Mitigation |
| --- | --- | --- | --- |
| RK-1 | ADR 0072's "re-price everything" read as reaching the **stored submission snapshot** (ADR 0154 d8: the shop's notice is the stored review, never priced again) | R1, K2, P3 | §3; criteria P3-c and K2-b. D10B labels the two estimates "trimisă" and "actuală" |
| RK-2 | **`UNKNOWN_TIER` while a replacement is pending.** A disabled tier is still in the book (availability is beside it, A-17), but a surface that reads only `UNKNOWN_TIER` shows the generic failure, or a preset naming it (ADR 0062 seam 3, M7) half-applies | P4a, Q3, preset application | A separate `REPLACEMENT_REQUIRED` code (P4a-a). Consumers listed: price bar, account card, D10B, the contact route, presets. Preset application with a disabled tier fails in a stated way, which Q3 asserts. **Widened 2026-11-04:** a tier a publish deleted is a replacement too (ADR 0178, Amendment on a deletion that gains a user; Q3-g), so a stored design never reaches `UNKNOWN_TIER` |
| RK-3 | **The Russian copy is RU TBD.** Agent drafts could ship as approved | T1, Q, U | ADR 0095 d2: RU stays marked and never pinned. OQ-11 covers RO only |
| RK-4 | **The migrations are unapplied anywhere**, and a deploy before the owner applies `0023`–`0029` (renumbered 2026-10-27) and their grants answers 500 or refuses every price | S, R1 | Nothing is deployed in M10. The runbook sections are written per wave. A-10's refusal path; the owner's seed step. STATUS carries the obligation |
| RK-5 | **Two price-book roots during the transition** (backlog 176): the customer reviews one price and the shop gets another | R1 | R1 runs before P3; criterion R-a |
| RK-6 | **Mid-session publish**: the client priced at version N, the server at N+1 | R1 | ADR 0157 d8's refusal (R-a); the client receives `versionId` with the book. **Updated 2026-10-27 (R1-Q2):** a fresh send after a publish prices at the current book, which is accepted (the estimate is not binding). Only a retried request id across a change of book is refused. |
| RK-7 | **The D9 defaults leak into saved kitchens** through absent settings | H2, R4b | A-9; criteria H2-a and U6-a |
| RK-8 | **The P3 cut-over collides with the customer lane** | P3, Q | P3 holds the named web files until MP-3; Q1 is built on P3; Q3 and Q5 wait for P4a |
| RK-9 | **The mockup's arithmetic is copied** (rounded-width doors, additive C3 split) instead of the domain's | M2, U3 | M2-c and U3-a import P's functions; a sabotage proof is required |
| RK-10 | **The shared-file collision the owner named as the main risk** | all | §9.1's single owners; handoffs only at named merges; worktrees per lane; every brief carries the git ban and the base check |
| RK-11 | **Placeholders become approved figures** | P3, T1, U | §0; P2-f; copy never carries a figure; `amountsProvisional` stays true until the owner flips D7C |
| RK-12 | **The opaque revision gets arithmetic above SQL** | S4, K2 | A-12; criterion S-c |
| RK-13 | **Digest PII and recipients** | K4 | S-21; K4-a's must-not; K4-c (F6: `accounts.name` only, escaped values, no customer text in subject or headers, staff URL only); security review |
| RK-14 | **ADR 0173 is still Proposed** | R, K | W0 lists its acceptance as owed; M10's audit rows follow P-L3-3 regardless |
| RK-15 | **Performance:** `pricesChangedBetween` and the D3 preview price many times; the active book is read per request | R1, Q3, U3 | Measure in Z1 at 390 × 844 on a large preset kitchen. **No figure is asserted until measured** (R4) |
| RK-16 | **The e2e and dev runs need an active book** | R1 | A-10's test seeding through the fake store; ADR 0151 (tests delete only rows tests added) |
| RK-17 | **Price-book versions are not backed up** | S6 | OQ-13; S6 before launch |
| RK-18 | **An immediate disable reaches customers at once** (OQ-2). An accidental switch-off forces every affected customer through the C4 sheet before any draft review could catch it | R4a, U4a/b/c, Q3 | The dialog states the count of kitchens using the item and focuses Anulează first; re-enabling restores pricing exactly (Q3-e); every change is audited and logged (A-17). The owner's ruling accepts this; it is recorded, not reopened |
| RK-19 | **Activating a linked accessory raises saved kitchens' prices with no new book version** | P4b, R5, Q3 | A-11's version and availability pair; P4b-d; Q3-f |
| RK-20 | **OQ-4 is the coordinator's reading** (OQ-4a). If the owner meant only "show the link", three waves are wasted | P4b, M4, U4c | OQ-4a is asked in W0, before P4b is dispatched. P4b sits behind P3 and P4a, so there is time |
| RK-21 | **The lift sweep finds other "flap" fronts** (`front-population.ts:67`, "the top box's flap") whose pricing the owner did not rule | P5 | A-20 and P5-d: only declared `liftUp` fronts are priced; candidates are reported to the owner |
| RK-22 | **A forged availability-log row** (security F1's accepted residual): a holder of the application credential inserts a log row at an unused higher revision without moving the head | S2 (ex-S2b) | No database check can tie a row to the head without a trigger, which F1 declined. The audit row is missing and the head lags the log's maximum. Z1 adds a read-only consistency check (`max(log.revision) = head.revision`) to the owner's runbook. Accepted beside ADR 0173 F1/F2 |
| RK-23 | **A failed digest send loses the day** (F6) | K4 | Its kitchens stay eligible next day, because entries are written only after a successful send (K4-b). The dashboard badge is unaffected |
| RK-24 | **The polled changed-count read is unaudited** (F9) | K2b | It returns one number and no row. Every list and page view keeps its audit row. Recorded as a deliberate exception in ADR 0178 |
| RK-25 | **The digest cannot be exercised on Preview** (no `CRON_SECRET` there; F6) | K4, Z1 | Verified with the route's tests and a local run with a test secret. The first real send is the owner's, on production. Nothing new is added to any environment |
| RK-26 | **X0 is being implemented while these contracts change** | X0 | §8.4's amended lines (listed in the 2026-10-26 security amendment report) go to the X0 implementer before its QA. The tree is frozen per agent-coordination before the change is applied |

---

## 12. What QA owes in every wave (applies with each wave's row)

- **Boundaries and anti-invariants per criterion.**
  - Widths: the catalogue minimum, the off-grid minimum (560), the exact anchor, every 50 mm step to the maximum, and
    `w ± 1` around every step.
  - Heights: 350 and 700, ±1.
  - Percentages: 0, 1, 100, 101, and the material maximum.
  - The 30-day edge, exactly.
- **Properties** with `fast-check` over random books and designs, for P2-a, P2-b, M1-a, M2-a and K1-a.
- **Sabotage in both directions (R6)** for every new arm. A sabotage against an already-red suite does not count.
- **No destructive mutant against any database** (ADR 0155).
- **QA never weakens an assertion and never edits production code.** A failing QA test is a finding.

## 13. Verification method

### 13.1 Gates

- Per wave: the package's own suite (`cd <pkg> && pnpm exec vitest run`), then `pnpm format:check` whole-tree as the
  last step.
- Before a merge: `pnpm check` in the main tree after the merge.
- Z1: `pnpm ci:local` on a clean tree.
- Every result is quoted from a run the reporter made (`rtk proxy` for output that will be cited, R9).

### 13.2 Persistence

- Live suites run alone on `TEST_DATABASE_URL`.
- **Z checklist, deploy order (ruling 2026-10-27, from S4):** after M10 the existing staff kitchens list and kitchen page
  read `design_staff_seen` and `contact_submissions.priced`, so they answer 503 from deploy until `0026` is applied and its
  grants issued. At the merge to `main`, migrations `0023`–`0027` (and any later M10 migration) and **all their grants are
  applied before the code deploys**. The grant text is in the owner runbook.
- **Z gate checklist (R2 review, 2026-10-27): un-skip QA's demotion-write test** (`qa-m10-r2-dashboard-api.adversarial.test.ts`,
  "The store's admin-only actor arrives with S2") once S2 merges. **Stale, corrected 2026-11-10:** it was un-skipped in `9eb081bb` (2026-11-04) and passes; see the *Z gate close-out* block.
- **Z1/Z2 checklist item (ruling 2026-10-27): the live run of S2's files is a Z-wave gate, and S2 stays on branch `m10/s2` until then** (S2 row). It happens when M10 is about
  to merge to `main`, because the first apply puts the shared ledger ahead of every other checkout (see the S2 row). Report
  the skipped count with it.
- The privilege test runs with the application role's URL. It is red before the grant and green after, on the test
  database only. **Preview and production are the owner's, through the runbook.**
- A worktree has no `.env.*.local`, so a worktree's "green" persistence run must report its skipped count (`agent-coordination.md`,
  *A worktree has no `.env.*.local`*).

### 13.3 Visual pass (`docs/best-practices/browser-and-visual-qa.md`)

- **The build.** A production build with `next start`, so no watcher. Evidence goes outside the watched tree or under
  the gitignored `testing-reports/2026-10-<dd>-m10/`. The verifier owns the tree exclusively.
- **Viewports.** Desktop 1440 × 900 for D1–D10, C3D, C4AD, C4BD and C5AD. Mobile 390 × 844 for C1–C5, D1M, D2M,
  D3M1/2, D5CM and D7M. The viewport is set before the page loads.
- **Z1/Z2 re-verification owed from U5's visual pass (2026-10-27, relayed).** The pass could not verify these, because dev
  sample data cannot produce them. Re-verify once R3 and the real stores exist:
  - the audit page's detail text for the nine dashboard actions (needs real audit rows);
  - the "Toate prețurile sunt publicate" zero state on the kitchens, audit and cabinets pages;
  - cross-page persistence of restore and publish (the sample desk resets per navigation).

  Also, re-verify **U6's failed and refused-save states** (D9), not reachable with the dev in-memory client, once R4b's
  route exists (2026-10-27).

  Also: **no pixel comparison against D7A–G, D7M and D8A–C was done**; U5 was compared against the recorded departures
  only. Z1 does that comparison.
- **Each frame**, captured and inspected against the mockup frame of the same id:
  - its listed states (error, empty, busy, failure);
  - keyboard: focus trap, Esc, initial focus;
  - overflow;
  - targets of at least 44 px;
  - the console, read for refresh and context-loss lines before trusting any "it reverted".
- **The Russian variant** of D2R, D3R, D2ER, C3R and C4AR. Text is roughly 30 % longer and must not overflow.
- **Interactive checks**, observed rather than inferred:
  - D3A's preview recalculates as the owner types;
  - D2C's Enter and Esc;
  - D7's publish, then a customer page priced at the new version;
  - C4's forced flow end to end;
  - D10C's cycle.
- **A computed geometry is not evidence about the rendering** (WORKFLOW, *Working conventions*).

### 13.4 Close (Z2)

Every criterion above is met or recorded as unmet at the criterion. The test audit is clean of "cannot fail". STATUS,
the milestone index and the archive are updated by the scribe after the commit.
