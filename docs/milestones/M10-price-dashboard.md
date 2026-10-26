# M10 — Manufacturer price dashboard and the pricing model behind it

> **STATUS: PLANNED, 2026-10-25. Nothing built, nothing dispatched.** This plan was written by the architect.
> W0 (records) must land before any code wave is dispatched. Branch `m10-price-dashboard`, local only and
> **not pushed**: the owner declined a push on 2026-10-25. It was cut from `main` `0910dc06` and carries two commits:
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
- **The six structural corner rules are `price-per-size` with one entry** (P1 review, ruled 2026-10-26), keyed at
  their **actual built width** (320, 570 or 900; `sample-price-book.ts:178-209`):
  - not rounded up to 350 or 600, and not anchored;
  - the lookup rule above already prices a body at exactly a listed width, and per-size widths are the catalogue's
    own sizes, so they are not held to the 50 mm step (that applies only to `anchorWidthMm`, P1-f);
  - this matches frame D3G, "Un singur preț";
  - an anchored formula on a non-insertable row is refused by M2.

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
100)`, as the mockup's `r10(a*1.05)` does [mock L608]. A bulk change is one draft group, shown as one expandable row in
D7 and D8.

**A-15 — The draft is an ordered change-set, not a second book.**

- Each change names a stable field address (§8.4).
- The candidate book is `apply(activeBook, changes)`, a pure domain function.
- ↺ removes one change.
- Restore adds the archived version's differing fields as changes.
- **The `price-published` audit detail is stamped by the store** (S1 QA, coordinator's ruling, 2026-10-26).
  `sequenceNumber` is the inserted version's, and `changeCount` is the length of the stored change summary. Callers
  cannot supply either; the audit entry passed in omits both, as with M4's `availabilityRevision`.
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
  `sequenceNumber` and `changeCount` on `price-published` (S1 QA). The store fills them from what it wrote, before its
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
| **OQ-2** | Disabling: at publish, or immediately? | "switching off, it's not the pricing changes, so it should take effect immediately" | A-17. Availability leaves the book and the draft; a new store and migration (S2b); R4a; U4a/U4b/U4c dialog copy; T1 copy | **Yes, reversed** (recommended: at publish) |
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
| OQ-11 | Approve all M10 Romanian NEW COPY as drafted (as O28b and O-L3-7 did). **This now includes the replacement for the deactivation dialog's wrong "Intră în vigoare când publici"** (T1). **Also (2026-10-26): the restore-version audit label becomes "a adus în ciornă prețurile unei versiuni" (ru "Цены версии перенесены в черновик"), awaiting owner approval** | Approve. Russian stays an agent draft, marked and never pinned (ADR 0095) |
| OQ-12 | Every figure: the 15 %, the material percentages, every amount, and now the lift rate | They stay placeholders. The first real book is the manufacturer's own entry, published from the dashboard. The `amountsProvisional` switch (D7C) is the owner's |
| OQ-13 | Back up the price-book versions and the availability log in the scheduled export (ADR 0012's scoped select) | Yes: wave S6, before launch |
| OQ-15 | A cabinet given its own handle has no way back to "follow the kitchen": `set-appearance.ts` has `setHandle` but no clear, while colour has `clearFinish` (ADR 0099 d8). The coordinator is asking the owner (2026-10-26) | **Mirror colour:** a `clearHandle` command and a "Ca restul bucătăriei" option (wave Q2b). It is built on this default unless the owner rules otherwise before Q2b is dispatched |
| OQ-14 | **Who can review** (ADR 0062 Amendments 4–5, carried over as open: "roles are outside the dashboard's scope") | **Use the capabilities that already exist; no role work.** `contact.read` (operator and administrator) may open a kitchen, mark it seen, see the badge and counter, and receive the digest. `price.edit` (administrator only) may edit, publish, restore, switch items on or off and save defaults [src: `capabilities.ts:45-57`]. "Seen" is one marker per kitchen, shared by all staff (A-12). Recorded as A-12 and A-13; the owner confirms at close |

**The rulings A-1 to A-21 are not questions.** They are recorded as architect rulings that the owner may overrule;
A-17, A-19, A-20 and A-21 implement the owner's own 2026-10-26 answers. The owner should still be shown A-1
(rounding), A-9 (defaults) and A-18 (creation and deletion stay in the draft), because each is customer-visible or
departs from a mockup comment.

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
| **S** | Persistence, **the sole writer of `packages/persistence/` in M10** | `packages/persistence/**`, including the census, the privilege test, `index.ts` and migrations `0025`–`0031` | `packages/configurator-domain`; `apps/web` | Full + security |
| **T** | Copy | `apps/web/src/messages/*`; `i18n/content.ts`; the copy-lock tests | Every component; the `depthNote` reference (Q1's) | Light |
| **R** | Web server routes and the one book root | `lib/server/active-price-book.ts`; `lib/server/price-dashboard/**`; `lib/server/price-notice.ts`; `lib/server/catalogue-availability.ts`; `app/api/staff/prices/**` (including `…/availability/**`); `app/api/designs/**/price-notice/**`; the R1 window in §9.1; the mint path (R4b) | `staff/**` components; `price-dashboard/**` components; `lib/server/staff/**` except where K2 hands over (none planned) | Full + security |
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
                               ╠═► S1 ─► S2 (also needs X2) ─► S2b ─► S4 ─► S5 ─► S3 ─► S6
                               ║    │     │      │     └► K4 (also needs K3, U1)
                               ║    │     │      └► R4a (also needs R3, M3)
                               ║    │     └► (live wiring of R2/R3)
                               ║    ├► R1 ─► R2 (also needs M1) ─► R3 (also needs M2) ─► R4a ─► R4b (also needs H2, S3) ─► R5 (also needs P4b, S5)
                               ║    └► K2 (also needs K1)
                               ╠═► K1 ─► K2 ─► K3 (also needs T1) ─► K4
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
| K2 | K1, S1 |
| M1 | P2 |
| S2b | S2 (migration sequence only) |
| X2 | T1 (it takes the message files for its window); it must merge before S2, R2 and K2 |

**Waits on the serial pricing chain:**

- after P3 (MP-3): M2, U2, U3, Q2, T2;
- after P4a: Q3 (also R5, which needs P4b);
- after P4b: M3, M4, U4a/U4b/U4c (through M3 and M4), R5, P5.

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
DraftChange { address, value, groupId? }   // groupId = one bulk action (A-14)
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
| `PriceBookStore` | `readActive()` → `{versionId, sequenceNumber, label, publishedAt, book}` (the newest row) or `NO_ACTIVE_VERSION`; `readVersion(id)`; `listVersions(page)` (state derived: the newest is active, the rest archived); `readDraft()` → `{draftRevision, changes}`; `writeDraft({expectedDraftRevision, changes, audit})` → ok or `changed-meanwhile`; `publish({expectedDraftRevision, expectedActiveSequence, expectedAvailabilityRevision, createdItems, label, note, book, changeSummary, audit})` → ok `{versionId, sequenceNumber, availabilityRevision}`, `changed-meanwhile` or `availability-changed-meanwhile`. One transaction: the head CAS and the created items' inactive log rows (A-17), the insert at `expectedActiveSequence + 1`, the draft-row reset, and the audit row. `book` is computed by the server from the stored draft (F10), never taken from a request. **`changeSummary` is pinned** (m8): the published `DraftChange[]` JSON array, with minted ids and group ids, from which `changeCount` is its length. **Refusals the store does not return:** `item-is-default` and a used deletion are judged by the domain **before** the call, against defaults and usage read at `expectedAvailabilityRevision`, which the CAS keeps current (M5). **Amended 2026-10-26: F7, F10, then X0 review M1, M5 and m8** |
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
- **X0-5 shapes:**
  - **`KitchenDefaultsWire`** member names are exactly `DesignSettings`'s (`materialTierId`, `hardwareTierId`,
    `cabinetDepthMm`, `finish`; `handle` from H1) plus `topRowHandle`. Any other name is renamed to these.
  - **`PriceVersionSummary.changeCount`** is blessed as **derived** from the stored `change_summary` (not a `0025`
    column). The store or service computes it; nothing stores it twice.
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
  - **the usage-count read is exempt from per-read audit** (m10), like the changed-count poll (A-12). It returns
    counts only, and the screen that asks for it is audited as `price-catalogue-viewed`.
- Refusal codes are a closed list.
- Bodies carry codes, never sentences (ADR 0095 decision 3).

**(e) Staff audit actions** (X0, `packages/configurator-domain/src/staff/staff-audit-action.ts`). These are new
closed-list entries.

**Ruling X0-2 (2026-10-26):** X0 ships them as a separate `DASHBOARD_AUDIT_ACTIONS` list, so today no store records
them. **Wave X2 folds them in**: `STAFF_AUDIT_ACTIONS` becomes the Lot 3 six plus `DASHBOARD_AUDIT_ACTIONS`, and the
sub-list stays exported so X0's types keep compiling. X2 must merge before any wave that writes one of these rows (S2,
S2b, S3, S4, R2, K2). `price-catalogue-viewed` needs no new port: R2 records it through the existing `StaffAuditStore`
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
| `packages/configurator-domain/src/staff/staff-audit-action.ts` | X0, then **X2** (the fold-in), then frozen | Ask the architect for a follow-up contract wave |
| `packages/configurator-domain/src/pricing/catalogue-availability.ts` | **X0** writes it (types only: `ItemRef`, `CatalogueAvailability`), then lane **P** from MP-0 (P4a extends it) | `price-dashboard/**` imports from it; pricing never imports `price-dashboard/**` |
| `apps/web/src/i18n/content.ts`, `messages/ro.json`, `ru.json`, `ro.d.json.ts` (the nine audit-action labels only) | **X2**, in a window after T1 merges and before T2. Then back to lane **T** | — |
| `apps/web/src/staff/staff-audit-wire-reading.ts`, `staff/staff-audit-filters.tsx` | **X2** (Lot 3 files with no other M10 owner) | — |
| `packages/configurator-domain/src/account/capabilities.ts` | Nobody; no change is needed | — |
| `packages/configurator-domain/src/design.ts` | Lane **H** | P reads only |
| `packages/configurator-domain/src/catalog.ts` | Lane **P** (P1: the default-width field; P5: the `liftUp` front declaration and the rewritten `wall-lift` comment) | — |
| `packages/configurator-domain/src/hardware-mechanisms.ts` | **H1b** first (one line: the push-to-open query passes the kitchen handle), then lane **P** for P5. P5 starts only after H1b merges | — |
| `packages/configurator-domain/src/front-population.ts` | Lane **P**, P5 only (A-20) | — |
| `packages/configurator-domain/src/queries/design-projection.ts` (`DisplayEntry` gains an optional kitchen-handle fact) | **H1b** | Every lane reads it only |
| `packages/configurator-domain/src/push-to-open.ts`, `queries/describe-selection.ts` | **H1**, which makes `PushToOpenQuery`, `DescribeSelectionInput` and `HandleResolutionQuery` take a **required** `KitchenHandleSettings` object (`Pick<DesignSettings, "handle">`). H1b and H2 touch these files **only to widen that object** (H2 adds `topRowHandle`), never to change its shape otherwise (ruled 2026-10-26, H1 review) | — |
| `packages/configurator-domain/src/commands/set-appearance.ts`; the panel's handle control | **Q2b**, only if the owner accepts (or does not answer) OQ-15 | — |
| `apps/web/src/review/review-model.ts` | **H1b** (the resolved handle on the review screen) | — |
| `apps/web/src/lib/server/staff/staff-page.ts` | **U1** (the catalog pages' capability and navigation) | R does not touch it |
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
| `docs/**`, including the runbook | The **scribe**, in the main tree, after each wave's commit. Implementers put runbook text in their report, and the scribe pastes it | No implementer edits `docs/` |
| `docs/design/mockups/cabinets/*.svg`, copied to `apps/web/public/…` | **U1** copies; the source is never edited | — |
| QA-owned pins (`qa-*.adversarial.test.ts`, `pricing-seams.test.ts`, `qa-m6-wave-b-book-ingress`, `qa-8c-model-purity`) | A wave that moves a pinned fact reports it, and **QA** edits the pin | Implementers never edit a QA pin |

### 9.2 Migration sequence, owned by lane S

| Number | File | Wave | Grant (exact text written in the wave, pasted into the runbook by the scribe) |
| --- | --- | --- | --- |
| 0023, 0024 | *reserved by M8B Lot 3* (preset sort, invitations) | — | — |
| 0025 | `create_price_book_versions`: id (server-minted, shaped), `sequence_number bigint not null unique check (> 0)`, label (length-checked; 1–80 [inf: `MAX_BOOK_NAME_LENGTH`]), note (≤ 240 [inf: `MAX_BOOK_DESCRIPTION_LENGTH`]), book jsonb object, change_summary jsonb, `published_at default now()`, published_by_account_id. **No `state` column**; the active version is the newest row (F7) | S2 | `SELECT`; `INSERT (id, sequence_number, label, note, book, change_summary, published_by_account_id)`. **No `UPDATE`** (F7) |
| 0026 | `create_price_book_draft`: a **seeded singleton** (0009's pattern): revision bigint, changes jsonb array (seeded `[]`), base_version_id, `updated_at default now()`, updated_by_account_id | S2 | `SELECT`; `UPDATE (revision, changes, base_version_id, updated_at, updated_by_account_id)`. **No `INSERT`** (F7) |
| 0027 | `create_kitchen_defaults`: a **seeded singleton**: revision, defaults jsonb (seeded `{}` = none saved), `saved_at default now()`, saved_by_account_id | S3 | `SELECT`; `UPDATE (revision, defaults, saved_at, saved_by_account_id)`. **No `INSERT`** (F7) |
| 0028 | **Two tables, one file** (A-17, F1): `catalogue_availability_head`, a seeded singleton (`revision bigint not null check (>= 0)`, seeded 0), and `catalogue_availability_changes` (`revision bigint primary key`, item_kind, item_id, active boolean, `changed_at default now()`, changed_by_account_id). **No sequence and no trigger.** A row's revision comes from the head update in the same CTE statement (§5 A-17) | S2b | head: `SELECT, UPDATE (revision)`. log: `SELECT, INSERT (revision, item_kind, item_id, active, changed_by_account_id)`. No `DELETE`, no log `UPDATE` |
| 0029 | `create_design_staff_seen`: design_id pk, seen_revision bigint, seen_by_account_id, `seen_at default now()` | S4 | `SELECT`; `INSERT (design_id, seen_revision, seen_by_account_id)`; `UPDATE (seen_revision, seen_by_account_id, seen_at)`. No PK update. **Also, with 0029, on the existing table (F2):** `GRANT SELECT (priced) ON TABLE public.contact_submissions TO app_designs;`. This is a **runbook grant, not SQL in the migration file**: grants are never in a migration file, because the unattended screen does not recognise them [src: `0009_create_csp_reports.sql:32-34`]. **The first reader is S4's staff kitchen statement for the as-sent estimate, consumed by K2** |
| 0030 | `create_staff_change_digest`, **two tables**: rounds (day_key pk, shape-checked; `claimed_at default now()`; sent_count int) and entries (round day_key, design_id, revision; pk (round, design)) | S4 | rounds: `SELECT; INSERT (day_key); UPDATE (sent_count)`. entries: `SELECT; INSERT (day_key, design_id, revision)` (F7) |
| — | **Pinned 2026-10-26 (doc conflict with ADR 0178):** `rounds.day_key` is the primary key **and the round id**; there is no separate `round_id`. `entries` is `(day_key references rounds (day_key), design_id, revision)` with primary key `(day_key, design_id)`. `rounds.claimed_at default now()` (ADR 0178's `ran_at` is renamed `claimed_at`). `ClaimDigestDayResult.roundId` carries the day key | S4 | as the 0030 row |
| 0031 | `create_design_price_notices`: design_id pk, acknowledged_version_id, acknowledged_availability_revision, `acknowledged_at default now()` | S5 | `SELECT`; `INSERT (design_id, acknowledged_version_id, acknowledged_availability_revision)`; `UPDATE (acknowledged_version_id, acknowledged_availability_revision, acknowledged_at)`. No PK update |

**Rules across every M10 table (F7, 2026-10-26):**

- column-level grants exactly as listed;
- every `*_at` defaults to `now()` and is outside every `INSERT` grant;
- no primary-key column is in an `UPDATE` grant;
- no `DELETE` and no `TRUNCATE` anywhere;
- nothing to `PUBLIC`.

The append-only tables are `0025` and `0028`'s log.

**Renumbered 2026-10-26.** The plan's earlier numbers were never used. The availability log took `0028`, and the three
tables after it each moved up one. Nothing was built under the old numbers.

---

## 10. Waves

Every row carries its review tier and its *Reading*. "Prod files" counts production files only; paired tests do not
count (WORKFLOW). A row over five files says so and gets a mini-review.

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

**Depends on:** MP-0, and T1 merged (X2 takes the message files for its window). Merges before S2, S2b, S3, S4, R2
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
- **P3-a:** the sample book parses. `amountsProvisional === true` and `status === "estimate"`.
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
| **H2** stamping new-kitchen defaults, and the top-row handle | (1) the generation request takes `newKitchenSettings` (material, hardware, depth, colour, handle, top-row handle); (2) `shell-design.ts` stamps them explicitly; (3) a colour the default material does not offer resets to that material's default (ADR 0057, the D9B note); (4) absent settings on a legacy document keep the fixed fallback (A-9); (5) **`DesignSettings.topRowHandle`** (optional, the same no-bump argument), resolved for top-row bodies as cabinet's own → `settings.topRowHandle` → `TOP_ROW_HANDLE` (H-3) | `generation/shell-design.ts`, `generation/generate-kitchen.ts` (request type), `kitchen-handle/…`, `design.ts` | H1b | ADR 0111; ADR 0057; ADR 0071 Amendment; `migrate-design.ts:83` |

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
  d10). This is a **no-rollback release note** for Z2's close and the scribe, not a migration.
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
| **M1** change-set | (1) `applyChanges(book, changes)` gives the candidate book, refused per change with a code, for the **price-field, size, depth-rule, bulk and provisional** kinds (creation, text and deletion kinds arrive in M4); (2) `diffBooks(a, b)` gives D7/D8 rows in the new terms [mock L742], with bulk groups as one row; (3) revert one change; (4) `restoreChanges(archived, active)` (A-15) | new `price-dashboard/apply-changes.ts`, `diff-books.ts`, `restore.ts` | P2 merged (types) | §8.4(b); A-14; A-15; D7/D8 frames [mock L871-880] |
| **M2** bulk, validation, preview | (1) bulk % over a scope (all, one group, a selection) with A-14 rounding and counts ("22 dulapuri, 64 prețuri"); **a percentage that rounds to `-0` is normalised to 0, or a 0 % change is refused, before any audit entry is built (see R2; added 2026-10-26)**; (2) `judgeBookAgainstCatalog`: the narrowest buildable width prices > 0 [D3C]; anchor width = default width; size list = the catalogue's sizes; percentage ranges (**added 2026-10-26: `percentageStagesOf` is public, for the cabinet preview, and checks that percentages are whole but not their 0…max range, so M2 validates draft percentages before calling it, or the function gains the range check then**); (3) `previewCabinet(rule, catalog, book, {material, depth, hardwareTier?})`: rows every 50 mm, an off-grid minimum row ("560 → preț ca 600"), door-step rows marked, built **only** from P's functions | new `price-dashboard/bulk-change.ts`, `judge-book.ts`, `cabinet-preview.ts` | P3 merged | D2D, D3A–G notes [mock L846-866]; ADR 0175 *Open* (negative at the narrow end) |
| **M3** lifecycle rules (amended 2026-10-26) | (1) `usesItem(design, itemRef, catalog)`, which counts linked accessories through the earning rule and is the predicate S3's SQL must agree with; (2) `judgeAvailabilityChange(item, active, {availability, book, defaults})`, applied **at write time** (A-17): disabling refused for the D9 default and for the last active option of a group; enabling refused for an item absent from the active published book; (3) `canDelete` (unused, and not the D9 default); (4) the D9 defaults judgement (a colour reset when the default material changes); (5) the remaining-options list for the dialogs | new `price-dashboard/item-usage.ts`, `item-lifecycle.ts`, `defaults-judgement.ts` | P4b merged | D4E/F, D5C/D/E/G, D6C, D9B [mock L868-881]; ADR 0062 Amendment 3 and the 2026-10-26 Amendment; A-17, A-19 |
| **M4** creation, created-row text, deletion (added 2026-10-26) | (1) `applyChanges` gains the `hardware-tier-created`, `accessory-created`, `created-row-text` and `item-deleted` kinds (A-18), and `diffBooks` gains their D7/D8 rows; (2) `judgeBookAgainstCatalog` gains: a linked accessory's `linkedBuildId` names a catalogue row the book prices that the manufacturer supplies (A-19); (3) the authored-text judgement: Romanian only, bounded, the character rule of migration `0021_create_design_notes.sql:15` (F5), and per ADR 0106 Amendment A no amount, percentage or "inclus" (A-21); (4) `judgeDeletionsAtPublish(changes, usageCounts)`: refuses the whole publish if a deleted item gained a user (A-18) | `price-dashboard/apply-changes.ts` (mod), `diff-books.ts` (mod), `judge-book.ts` (mod), new `price-dashboard/created-row-text.ts` | M2, M3, P4b | A-18, A-19, A-21; frames D4C, D6A/B [mock L692-697, L710-712]; ADR 0106 Amendment A; `parse-price-book.ts:47-50`; `staff/note-text.ts` and migration `0021_create_design_notes.sql:15` (F5) |

**M acceptance:**

- **M1-a:**
  - `apply(active, [])` deep-equals `active`;
  - `apply(active, restoreChanges(archived, active))` deep-equals `archived` on every editable field;
  - reverting the only change gives back `active`.
- **M1-b:** a diff of identical books is empty. A bulk group of *n* changes diffs as one row expanding to *n*.
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
  - for a **non-insertable** row (the six corners), the formula must be `price-per-size` and its one listed width
    must equal the body's built width. An anchored formula there is refused;
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

The order is S1 → S2 → S2b → S4 → S5 → S3 → S6 (S2b added 2026-10-26). S3 is the only S wave gated on M3 (and so on
P4b), so it runs last and holds nothing up. Migration numbers follow §9.2, not wave order.

| Wave | Must-fix items | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **S1** fakes | Fakes for all six ports from §8.4(c), with a contract test suite each Neon store will also run | `fake-price-book-store.ts`, `fake-kitchen-defaults-store.ts`, `fake-catalogue-availability-store.ts`, `fake-kitchen-change-store.ts`, `fake-price-notice-store.ts`, `index.ts`. **Six (the usage reader's fake is folded into the defaults fake); over five, stated.** Each fake is small and mechanical, and the contract suites are the review surface. **Plus a test-only item (ruling 2026-10-26):** four pre-existing live files throw inside a `describe.skipIf` body in a worktree with no `.env.*.local`, instead of skipping. They are `count-contact-submissions-for-tests.live`, `delete-contact-submissions-for-tests.live`, `delete-rate-limit-counters-for-tests.live` and `neon-rate-limit-totals.live`, all calling `neon(liveTestDatabaseUrl)` at describe scope. S1 moves each connection into the guarded hooks. This changes no production file, and the census registration does not move | MP-0 | §8.4(c); `fake-staff-kitchen-actions-store.ts`; `account-domain-store-agreement.test.ts` (the agreement-suite pattern) |
| **S2** book versions and draft | `0025`, `0026`; `NeonPriceBookStore` (publish in one transaction with its audit row; `changed-meanwhile` compared in SQL); the owner-run `seed-price-book` command (A-10); migration-text tests; privilege-test arms; census rows | 2 migrations, `neon-price-book-store.ts`, `price-book-statements.ts`, `seed-price-book.ts` | S1, X2 | A-10, A-15; §9.2 rows 0025/0026; `migrate.ts` (how an owner-run command is wired); `0011_create_presets.sql` (an append-mostly table's grant) |
| **S2b** availability log (added 2026-10-26, A-17) | `0028`; `NeonCatalogueAvailabilityStore`: append-only writes with their audit row in one transaction; `readCurrent` as each item's latest row; `readAt(revision)`; `changed-meanwhile` on a stale expected revision, compared in SQL; migration-text test; privilege arm (no `UPDATE` and no `DELETE` held); census row | 1 migration, `neon-catalogue-availability-store.ts`, `catalogue-availability-statements.ts` | S2 (sequence) | A-17; §9.2 row 0028; `0020_create_staff_audit_events.sql` (an append-only table's grant) |
| **S4** seen and digest | `0029`, `0030`; `NeonKitchenChangeStore`; the staff kitchens statement gains `changed_since_seen` (`revision <> effective-seen`, in SQL), an `only-changed` filter, changed-first sort and a count; `listDigestEligible($now)` exactly as S-d1 restates it | 2 migrations, `neon-kitchen-change-store.ts`, `staff-kitchen-statements.ts` (mod), `kitchen-change-statements.ts` | S2b (sequence) | A-12, A-13; S-18; `0004` header (read only); `design-revision.ts`; `0022_create_design_request_states.sql`; `neon-staff-kitchen-reader.ts` |
| **S5** notice marker | `0031`; `NeonPriceNoticeStore` storing the (version, availability revision) pair | 1 migration, `neon-price-notice-store.ts` | S4 (sequence) | A-11 (as amended 2026-10-26); `neon-configuration-repository.ts` (the write-token authorisation it must mirror, read only) |
| **S3** defaults and usage | `0027`; `NeonKitchenDefaultsStore`; `NeonKitchenUsageReader` (jsonb paths; client-deleted rows excluded) with a **parity test against M3's `usesItem`** over shared fixture designs. For a linked accessory, the reader is given the set of build ids that price as the linked row (computed by the domain through `resolveCatalogEquivalent`), never a hand list | 1 migration, `neon-kitchen-defaults-store.ts`, `neon-kitchen-usage-reader.ts`, `kitchen-usage-statements.ts` | S5, M3 | A-9; M3's `item-usage.ts`; `design.ts:170-195` (the settings paths); `0016` (`deleted_by_client_at`) |
| **S6** backup (OQ-13) | Price-book versions, the availability log and the defaults added to the scheduled export | `backup` statement (one file) | S3 | ADR 0012; `apps/web/src/lib/server/backup-designs.ts` (read only; its route is not S's) |

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
    one success;
  - `change_summary` round-trips as the published `DraftChange[]` array (m8);
  - **(S1 QA)** the `price-published` audit row's `sequenceNumber` equals the inserted version's and its
    `changeCount` equals the stored summary's length. A caller-supplied value for either is impossible by type and is
    overwritten if forced through a cast;
  - **(S1 QA)** `expectedDraftRevision` is shape-checked like every revision (m6's bounded digit shape). A malformed
    value is `invalid-request` and never reaches SQL;
  - must-not: `UPDATE`, `DELETE` or `TRUNCATE` on `price_book_versions` is held;
  - must-not: `INSERT` on `price_book_draft` or `kitchen_defaults` is held (seeded singletons).
- **S-b1 (S2, the seed; F3):**
  - the seed refuses when any version exists, and leaves the table byte-identical;
  - it records the owner's account id it was given as `published_by_account_id`;
  - it writes no staff audit row.
- **S-b2 (S2b; amended 2026-10-26, F1):**
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
    and `BigInt(` near `revision`);
  - a seen mark with a stale displayed revision leaves the badge on.
- **S-d (S4; amended 2026-10-26, F6, F7, and the K1-review ruling):**
  - `claimDigestDay` called twice for one day key yields exactly one claim, inserted with `on conflict do nothing`;
  - entries can only be inserted, never updated.
- **S-d1 — what `listDigestEligible($now)`'s SQL restates.** Each clause is checked by reading the statement, and each
  is covered by S-d2:
  - **(a) changed:** `d.revision <> coalesce(seen.seen_revision, latest_sub.design_revision)`, where `latest_sub` is
    **exactly one row**, the latest submission for the design (a `lateral … order by created_at desc limit 1`).
    Never a fan-out join over submissions.
  - **(b) held:** `exists` a digest **entry** (not merely a round) for the design with `revision >` the effective seen
    revision from (a). A claimed day with no entries holds nothing.
  - **(c) window:** `d.sent_at > $now - interval '720 hours'`, with the **passed** `$now`. Never SQL `now()`, and never
    `interval '30 days'`.
  - **(d) status:** `coalesce(rs.status, 'new') not in ('offer-sent', 'closed')`.
  - **(e) visibility:** `d.deleted_by_client_at is null and d.sent_at is not null`. S4 reads `designs.sent_at`, the
    first send.
  - **(f) shape:** exactly one row per design. The customer name is `nullif(btrim(a.name), '')`, else the request
    reference.
  - Its results carry `isChangedSinceSeen` and `isDigestedSinceSeen` as booleans, computed in SQL. The opaque
    revisions are never compared above SQL (A-12).
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
| **R2** dashboard read and draft API | `GET /api/staff/prices` (active, draft, catalogue facts, usage-free); `PUT …/draft` (changes, expected revision); `DELETE …/draft/{change}` (↺); `POST …/bulk` (**acceptance, added 2026-10-26: a bulk percentage that rounds to `-0`, e.g. `Math.round(-0.4)`, becomes 0, or a 0 % bulk change is refused, before the audit entry is built; the audit reader refuses `-0` because jsonb would read it back as 0, so otherwise the write fails closed as a 503**). Every one checks `price.edit`, writes its audit row in the same transaction, refuses cross-site and non-JSON, and answers codes from §8.4(d). **The cabinet-list seam (U1 review ruling, 2026-10-26):** when the database read replaces the sample, `apps/web/src/price-dashboard/cabinet-list-source.ts` gets `import "server-only"`; the wire shape sent to the client screen stays minimal (no author e-mails, no internal ids in draft entries); and an unmodified row's pending amount must equal its active one, which the seam asserts | 4 route files, `lib/server/price-dashboard/price-dashboard-service.ts`, `price-dashboard/cabinet-list-source.ts` (mod) | R1, M1, X2 | M1's `apply-changes.ts`; `app/api/staff/kitchens/[id]/status/route.ts` (the guarded-body and `from` precedent); `lib/server/read-body-with-limit.ts`, `cross-site-request.ts`; ADR 0156 (limiter subjects) |
| **R3** publish, history, restore | `POST …/publish` (expected draft revision, label, note, provisional flag; the domain judges the candidate book whole first, `judgeBookAgainstCatalog`); `GET …/versions`, `GET …/versions/{id}`; `POST …/versions/{id}/restore` | 3 route files, service (mod) | R2, M2 | A-15; M2's `judge-book.ts`; frames D7A–G, D8A–C [mock L871-880] |
| **R4a** availability and the creation and deletion guards (amended 2026-10-26) | (1) `POST /api/staff/prices/availability`: **immediate** (A-17), judged by M3's `judgeAvailabilityChange`, written through `CatalogueAvailabilityStore` with its `catalogue-item-active-changed` audit row, `price.edit`, expected revision, `409 changed-meanwhile`; (2) `GET` usage counts (`KitchenUsageReader`); (3) creation and deletion arrive as draft changes through R2's endpoint; R4a adds their server judgements (M4's `judgeBookAgainstCatalog` link check, and a usage pre-check on delete with its `409`); (4) publish (R3) calls `judgeDeletionsAtPublish` with fresh counts | 2 route files, `lib/server/catalogue-availability.ts`, service (mod) | R3, M3, M4, S2b, S3 | A-17, A-18, A-19; frames D4E/F, D5C/D/G, D6C [mock L779-781]; ADR 0062 Amendment 3 and the 2026-10-26 Amendment |
| **R4b** defaults and stamping new kitchens | `GET`/`PUT` defaults (immediate, audited `kitchen-defaults-saved`); the mint and generation pass the saved defaults into H2's request | 1 route file, service (mod), the mint path | R4a, H2, S3 | A-9; ADR 0111 (the mint path); `generation/shell-design.ts` (H2's request type, read only); frames D9A–C |
| **R5** customer notice and sent state | `GET /api/designs/{id}/price-notice` (whether to show C1, removed accessories since the acknowledged availability revision, `isSent`); `POST …/price-notice/acknowledge`, authorised exactly like a save (write token or owning account), never moving `revision` | 2 route files, `lib/server/price-notice.ts` | R1, P4b, S5 | A-11 (the version and availability pair), A-17; P4b's `price-change-notice.ts`, P4a's `replacements.ts`; ADR 0114 (visitor cookie), ADR 0172 D8 (a claimed design on any device); `lib/server/load-owned-design.ts`, `write-token.ts` |

**R acceptance:**

- **R-a (R1):**
  - grepping `apps/web/src` for `SAMPLE_PRICE_BOOK` finds it only in the test-only seeding helper;
  - the editor and the contact route price one request with the same `versionId`;
  - a publish between a customer's load and their send makes the contact route refuse with ADR 0157's book-change
    answer. It never stores a snapshot priced at a book the customer never saw.
- **R-b:** with no active version:
  - the price bar, the account card and D10B's current estimate show no figure;
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

**QA reading:** the base reading plus `apps/web/tests/api/staff/**` and `tests/price/**`. **Review reading:** logic:
§5 and the routes; security: ADR 0019, 0153, 0156, 0161, 0172 D7, 0173; clean-code: the diff.

### Lane U — Dashboard UI D1–D9 (Light + visual; U5 Full, because it publishes)

**Base reading:** the mockup frames named in each row, with their notes; the brief `…-v2-update.md`, `…-v2-fixes.md`,
`…-v2-fixes-2.md`; `docs/design/mockups/Lemnaria Cont Lot 3.dc.html` (the staff shell); `apps/web/src/staff/staff-shell.tsx`, `staff-kitchens-list.tsx`; §8.4(d); `docs/best-practices/browser-and-visual-qa.md`.

| Wave | Must-fix items | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **U1** shell and list | (1) D1C/D1D: menu groups (Catalog: Dulapuri, Feronerie, Materiale, Accesorii, Setări implicite; Prețuri: Publicare prețuri **without its count: the pending-price count (the header chip "N prețuri de publicat →" and the nav badge) is deferred to U5** (U1 review ruling, 2026-10-26: the menu links only to built pages, `BUILT_CATALOG_PAGES`, and the publish page arrives in U5); Clienți), with role-hidden items and "Nu ai acces la această pagină" for a direct address; (2) D1M mobile menu sheet; (3) routes and the `proxy.ts` family `/[locale]/staff/catalog/**`; (4) D2A/D2B list: groups, cabinet SVGs, chips (Modificat, Furnizat de client, Structural; ~~Inactiv~~ struck 2026-10-26: cabinets cannot be switched off, since the ItemRef kinds are material, hardware, finish, handle and accessory, so the chip has nothing to apply to), search, "Doar modificate", empty search, pending price shown beside the active one; (5) D2M cards | `staff-shell.tsx`, `staff-nav-sheet.tsx`, `staff-paths.ts`, `proxy.ts`, `price-dashboard/cabinet-list.tsx` (and its page), **and `lib/server/staff/staff-page.ts`**: the catalog pages join `CAPABILITY_OF_PAGE` (`price.edit`) and `staffNavigationOf`, so the Catalog group shows on the kitchens and audit pages too (D1C; assigned 2026-10-26) — **over five; the mini-review is stated** | T1, X0 | Frames D1A–D1M, D2A, D2B, D2M, D2R [mock L839-855]; ADR 0173 P-L3-2 (the route family) and P-L3-9 (shell departures); `apps/web/src/proxy.ts`; `staff-paths.ts`; `docs/design/mockups/cabinets/` |
| **U2** list editing | D2C inline anchor edit (Enter saves to the draft, Esc cancels, the error stays in the field with `aria-invalid` and `role=alert`); D2E1–3 depth-rule card (0–100, four error variants); D2D bulk-% dialog (scope, preview counts, focus on the % field) | `cabinet-list-inline-edit.tsx`, `depth-rule-card.tsx`, `bulk-change-dialog.tsx`, `use-price-draft.ts` | U1, M2 | Frames D2C, D2D, D2E1–3, D2ER [mock L848-853, L770-777]; A-14; M2's `bulk-change.ts`, `judge-book.ts` |
| **U3** cabinet detail | D3A–G and D3M1/2: read-only dimensions, fields per shape, the live sentence, the read-only hardware readout, the preview table (PAL/MDF/Furnir columns, *Cu feronerie*, *Adâncime 600/700*, disabled only for rows outside `deepeningRows` (customer-supplied), with "Nu se schimbă la 700 mm"; **enabled for wall rows**, a recorded departure from D3D under the owner's A-6 ruling), save and cancel | `cabinet-detail.tsx`, `cabinet-price-fields.tsx`, `cabinet-preview-table.tsx`, page | U1, M2 | Frames D3A–G, D3M1/2, D3R [mock L856-866]; A-1, A-2, A-3, A-6; M2's `cabinet-preview.ts` (the only arithmetic allowed) |
| **U4a** hardware (amended 2026-10-26) | D4A/B/C/D/E/F with **four** rate columns (the lift, A-20); a new class (Romanian name and description only, no RU tab, A-21; created in the draft, inactive until published); disable and enable apply **immediately** (A-17), with dialogs carrying the replacement text from T1 instead of "Intră în vigoare când publici"; delete-blocked and default-menu states | `hardware-list.tsx`, `hardware-edit.tsx`, `item-dialogs.tsx`, `use-item-availability.ts`, pages | U1, M3, M4 | Frames D4A–F [mock L686-698, L779-782]; A-17, A-18, A-20, A-21; ADR 0062 Amendment 3 and the 2026-10-26 Amendment; M3's `item-lifecycle.ts` |
| **U4b** materials | D5A–G, D5CM, with the same immediate disable and enable and the D5G last-active block | `material-list.tsx`, `material-edit.tsx`, page | U4a (`item-dialogs.tsx` passes to U4b) | Frames D5A–G, D5CM [mock L869, L700, L783]; ADR 0071 note; A-16, A-17 |
| **U4c** accessories (added 2026-10-26) | D6A/B/C: built-ins with their true earning rule shown read-only; **creating a linked accessory**, with a cabinet-type select limited to rows the manufacturer supplies (A-19), a per-unit price, and Romanian text only; immediate disable and enable; the D6C dialog's accessory variant ("scos din bucătărie și i se spune") | `accessory-list.tsx`, `accessory-edit.tsx`, `accessory-create.tsx`, page | U4b (`item-dialogs.tsx` passes to U4c), M4 | Frames D6A–C [mock L870, L710-712, L779]; A-19, A-21; ADR 0070 d4 |
| **U5** publish and history | D7A–G, D7M; D8A–C (archived read-only diff; restore puts the prices in the draft and never publishes); **plus the audit page's detail view, deferred from X2 (2026-10-26): the staff audit page shows only labels for the nine dashboard actions, and showing their details (which item switched, the version published, the change count) lands here**; **plus the pending-price count deferred from U1 (ruling 2026-10-26): the header chip and the "Publicare prețuri" nav badge must reach every staff page (kitchens and audit included, per the D1C note), and the D2M zero state "Toate prețurile sunt publicate" (`priceDashboard.nav.allPublished`, unused until now) is wired** | `publish-page.tsx`, `publish-dialogs.tsx`, `version-history.tsx`, `version-detail.tsx` | U1, M1 | Frames D7A–G, D7M, D8A–C [mock L734-747, L871-880]; A-15; ADR 0072 Amendment (customers never see versions) |
| **U6** defaults | D9A–C: six rows, colour-reset note, save immediate ("Bucătăriile deja salvate nu se schimbă") | `kitchen-defaults-page.tsx`, page | U1, H2 | Frames D9A–C [mock L752-756, L881]; A-9; ADR 0057; H2's request type |

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
  kitchen is unchanged.

**QA reading:** the row's frames, U's base reading, and `apps/web/tests/staff/**`. **Review reading (combined, Light):**
the frames and `engineering-conventions.md`. **Visual:** §13.3.

### Lane K — D10 and the digest (K1 Full; K2 Full + security; K3 Light + visual; K4 Full + security)

**Base reading:** ADR 0062 Amendment 5 and the reconciliation note; ADR 0173 (every row, especially S6/S7 and the
2026-10-22 note); ADR 0153 d1; ADR 0154; ADR 0164; ADR 0165; frames D10A–D [mock L813-833]; this plan A-12 and A-13;
`apps/web/src/staff/**`; `lib/server/mail/**`.

| Wave | Must-fix items | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **K1** rules | (1) digest eligibility (A-13, on facts: `sentAt`, status, `now`, and the two SQL-computed booleans `isChangedSinceSeen` and `isDigestedSinceSeen`; no seen or digested instants, per the K1-review ruling); exporting `DIGEST_WINDOW_MS` (720 h) and `DIGEST_STOPPING_STATUSES`; (2) the digest model (subject count, rows, footer facts); (3) the Europe/Chisinau day key | `staff-changes/digest-eligibility.ts`, `digest-model.ts`, `chisinau-day.ts` | MP-0. **Merge waits for OQ-9** | `staff/request-status.ts`; frame D10D's footer [mock L833, L828]; S-19 |
| **K2** server | `POST /api/staff/kitchens/{id}/seen` (displayed revision; `contact.read`; audit `kitchen-seen`; fail closed); the list API gains `changedSinceSeen`, `onlyChanged` and the changed count; the kitchen API gains the as-sent estimate (the stored `priced` total, never re-priced) and the current estimate (priced now, a refusal shown as no figure) | 2 routes (1 new, 1 modified), `staff-kitchens.ts` (mod), `staff-kitchen-actions.ts` (mod) | K1, S1, X2 | A-12; S-18; ADR 0173 *Dated note 2026-10-22* (the `from` precedent: the page states what it saw); `app/api/staff/kitchens/[id]/status/route.ts`; the active book from R1 (if merged; otherwise the current estimate wiring is left to Z1, stated) |
| **K3** UI | D10A/C: badge, changed-first sort, "Doar modificate", the "Văzută … modificată din nou" sub-line; D10B: marks seen on open with the displayed revision, the "Trimisă"/"Actuală" switch (thumbnail, cabinet list with differing rows highlighted, no detailed diff), both estimates, status unchanged | `staff-kitchens-rows.tsx`, `staff-kitchen-filters.tsx`, `staff-kitchen-view.tsx`, `use-staff-kitchen.ts`, new `kitchen-version-switch.tsx` | K2, T1 | Frames D10A–C [mock L814-826]; `Lemnaria Cont Lot 3.dc.html` S2/S3; `staff-kitchens-list.tsx`, `staff-kitchen-page.tsx` |
| **K4** digest and counter | Cron `/api/cron/staff-change-digest` (`cron-auth`, claim the day, eligible list, send through the mail port, record entries **from the deduplicated model rows, each mapped to the revision the port returned for that design**, after a successful send); the HTML and plain-text message; recipients hold `contact.read` with a confirmed address; the customer's name from the profile, else the reference; the nav counter | cron route, `lib/server/mail/staff-change-digest.ts`, `vercel.json`, `staff-shell.tsx`/`staff-nav-sheet.tsx` (handoff), `use-changed-kitchen-count.ts` | K3, U1, S4; **OQ-10** | Frame D10D [mock L827-828]; A-13; S-21; `lib/server/mail/mail-sender.ts`, `lead-notification-html.ts` (the branded pattern); `lib/server/cron-auth.ts`; `app/api/cron/prune-rate-limits/**`; `vercel.json` |

**K acceptance:**

- **K1-a:** a property over random facts: eligible if and only if `isChangedSinceSeen` ∧ ¬`isDigestedSinceSeen` ∧
  (`sentAt > now − DIGEST_WINDOW_MS`) ∧ (status ∉ `DIGEST_STOPPING_STATUSES`). The boundary is exclusive at exactly
  720 h.
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
| **Q2** whole-kitchen handle row | C2: a "Mânere" row in the settings sheet (Bară inox / Bară neagră / Push-to-open) with its hint, offering only active handles; the store applies `setKitchenHandle`; **Q2 folds `KitchenHandleSetEffect` into the `CommandEffect` union** (H1 leaves it outside, and its code comment saying so is being trimmed), together with `apply-command-result.ts`'s whole-kitchen branch, in one change (H-6) | `global-settings.tsx`, `global-settings-model.ts`, `store/whole-kitchen-apply.ts`, `domain commands/command-result.ts`, `store/apply-command-result.ts` | **MP-3** (Q1 holds `global-settings.tsx` until then), **H1b**, T1 | Frame C2 [mock L764-767]; ADR 0099; H1's command; H-6 |
| **Q2b** a cabinet follows the kitchen handle again (added 2026-10-26; **pending OQ-15**, default = mirror colour) | (1) a `clearHandle` command in `set-appearance.ts`, mirroring `clearFinish` (ADR 0099 d8): it removes the cabinet's own handle, so the kitchen handle applies again; (2) a panel option "Ca restul bucătăriei" in the cabinet's handle control, as the colour control has; (3) the copy leaf, requested from T | `commands/set-appearance.ts`, the panel handle control, `store/apply-command-result.ts` (if a new effect branch is needed) | Q2 | ADR 0099 d8 (`clearFinish`); `set-appearance.ts`; OQ-15 |
| **Q3** forced replacement and merged notice | C4A–C4D (a modal sheet, not dismissable except by ‹; first "Alege" focused; rows announced; "Prețul apare după ce alegi"; only remaining options, the disabled one struck through; nothing preselected; accessory rows informational); C4C confirmation merged with C1's sentence (the mockup's choice [mock L810]); C1 standalone when there is nothing to replace; acknowledging writes the marker (the version and availability pair). The sheet and the accessory info rows follow **current availability**, so they appear on the next open after a disable, with no publish (A-17) | `replacement-sheet.tsx`, `use-price-notice.ts`, `price-notice-banner.tsx`, `price-bar.tsx` (mod), `whole-kitchen-tiers.ts` (disabled tiers hidden or struck) | P4a, R5, T1 | Frames C1, C4A–D [mock L763, L792-811]; A-11, A-16; ADR 0072 Amendment *Consequence*; ADR 0062 Amendment 3; `whole-kitchen-tiers.ts:91-162` |
| **Q4** sent-kitchen note | C5A/C5AD: a closable, non-blocking note above the price when `isSent` | `sent-kitchen-note.tsx`, editor placement | R5, T1 | Frames C5A, C5AD [mock L805-807]; ADR 0062 Amendment 5, point 3; ADR 0165 |
| **Q5** lone colour and handle replacement | A disabled colour or handle as a sheet row; choosing replaces it at every level where it appears (A-16); "Culoarea a revenit la Alb" when a material change resets it | `replacement-sheet.tsx` (mod), `store/whole-kitchen-apply.ts` (mod) | Q3, Q2, H1, P4a | A-16, A-17; ADR 0057, 0081, 0086, 0099; `chosen-finishes.ts`, `resolved-finish.ts` |

**Q acceptance:**

- **Q1-a (MP-3):**
  - there is no commit on `m10-price-dashboard` in which the customer's price responds to depth while the settings
    sheet renders the old `depthNote`, or the reverse;
  - checked by reading `git log -p` of the MP-3 merge.
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
| RK-2 | **`UNKNOWN_TIER` while a replacement is pending.** A disabled tier is still in the book (availability is beside it, A-17), but a surface that reads only `UNKNOWN_TIER` shows the generic failure, or a preset naming it (ADR 0062 seam 3, M7) half-applies | P4a, Q3, preset application | A separate `REPLACEMENT_REQUIRED` code (P4a-a). Consumers listed: price bar, account card, D10B, the contact route, presets. Preset application with a disabled tier fails in a stated way, which Q3 asserts |
| RK-3 | **The Russian copy is RU TBD.** Agent drafts could ship as approved | T1, Q, U | ADR 0095 d2: RU stays marked and never pinned. OQ-11 covers RO only |
| RK-4 | **The migrations are unapplied anywhere**, and a deploy before the owner applies `0025`–`0031` and their grants answers 500 or refuses every price | S, R1 | Nothing is deployed in M10. The runbook sections are written per wave. A-10's refusal path; the owner's seed step. STATUS carries the obligation |
| RK-5 | **Two price-book roots during the transition** (backlog 176): the customer reviews one price and the shop gets another | R1 | R1 runs before P3; criterion R-a |
| RK-6 | **Mid-session publish**: the client priced at version N, the server at N+1 | R1 | ADR 0157 d8's refusal (R-a); the client receives `versionId` with the book |
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
| RK-22 | **A forged availability-log row** (security F1's accepted residual): a holder of the application credential inserts a log row at an unused higher revision without moving the head | S2b | No database check can tie a row to the head without a trigger, which F1 declined. The audit row is missing and the head lags the log's maximum. Z1 adds a read-only consistency check (`max(log.revision) = head.revision`) to the owner's runbook. Accepted beside ADR 0173 F1/F2 |
| RK-23 | **A failed digest send loses the day** (F6) | K4 | Its kitchens stay eligible next day, because entries are written only after a successful send (K4-b). The dashboard badge is unaffected |
| RK-24 | **The polled changed-count read is unaudited** (F9) | K2 | It returns one number and no row. Every list and page view keeps its audit row. Recorded as a deliberate exception in ADR 0178 |
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
- The privilege test runs with the application role's URL. It is red before the grant and green after, on the test
  database only. **Preview and production are the owner's, through the runbook.**
- A worktree has no `.env.*.local`, so a worktree's "green" persistence run must report its skipped count (`agent-coordination.md`,
  *A worktree has no `.env.*.local`*).

### 13.3 Visual pass (`docs/best-practices/browser-and-visual-qa.md`)

- **The build.** A production build with `next start`, so no watcher. Evidence goes outside the watched tree or under
  the gitignored `testing-reports/2026-10-<dd>-m10/`. The verifier owns the tree exclusively.
- **Viewports.** Desktop 1440 × 900 for D1–D10, C3D, C4AD, C4BD and C5AD. Mobile 390 × 844 for C1–C5, D1M, D2M,
  D3M1/2, D5CM and D7M. The viewport is set before the page loads.
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
