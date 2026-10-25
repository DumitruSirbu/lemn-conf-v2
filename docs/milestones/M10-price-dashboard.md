# M10 — Manufacturer price dashboard and the pricing model behind it

> **STATUS: PLANNED, 2026-10-25. Nothing built, nothing dispatched.** This plan was written by the architect.
> W0 (records) must land before any code wave is dispatched. Branch `m10-price-dashboard`, local only and
> **not pushed**: the owner declined a push on 2026-10-25. It was cut from `main` `0910dc06` and carries two commits:
> `8bddd951` (rulings, ADRs, backlog) and `3d4d892a` (the final mockup) [coordinator's brief; `git log` read by
> the architect]. Every migration this plan adds is **unapplied anywhere**, and no agent applies one to a
> provisioned database.

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
| D4 hardware, D5 materials, D6 accessories, with disable and delete dialogs | U, M (rules), S (usage counts), R |
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
| S-2 | ADR 0174 O-L3-2 (2026-10-20) | S6 *Prețuri* is deferred until a record supersedes ADR 0062's timing **and** a redraw against the book's real shape exists | Both now exist: ADR 0176 (W0) and the final mockup (`3d4d892a`) | ADR 0176 names itself as O-L3-2's owed record; dated note on 0174. The "Prețuri" nav item is shown from U1 on |
| S-3 | ADR 0106 line 87 (2026-09-10) | `priceBook.material.melamine.description`'s "…inclus în preț" restates `wholeKitchenMinor: 0` | `wholeKitchenMinor` is retired (ADR 0092 Amendment) | Retired in P3 (cut-over). The leaf's claim stays true: PAL is the 0 % reference and its material line is 0, rendered *inclus*. W0 dated note on 0106: the duplicated fact is now "PAL is 0 %" |
| S-4 | ADR 0106 decisions 1–2 and Amendment A; ADR 0095 decision 2; ADR 0174 O-L3-3 | A keyed row renders its message-file leaf; copy lives in message files; runtime translation is deferred | The mockup gives every catalogue text RO/RU tabs and says "textul apare și în Traduceri" [mock L891]. Editing a keyed row's name would change nothing a customer sees | **Owner question OQ-3** (§6). The recommendation keeps keyed rows' text read-only in M10 and gives authored per-locale text only to rows the dashboard creates |
| S-5 | ADR 0092 decision 12 (~line 634) and its 6W restatement (line 1138) | The material group keeps throwing (`NegativeTierDeltaError`) on a default that is not its cheapest tier | Amendment 2026-10-25: re-read against percentages. D9 can now pick a non-PAL default for new kitchens [mock L752-756] | → **A-8**. The book's `material.defaultTierId` stays the fixed pricing fallback (PAL). Percentages are whole and ≥ 0, so PAL at 0 % is always cheapest and the throw stays a genuine book fault. D9's default is a separate concept (A-9) that never reaches the delta baseline |
| S-6 | `price-book.ts:12-13` [src]; `pricing-seams.test.ts`, which reads the source for the catalogue's width-step constant | "A body built at 575 is priced at 575"; pricing never names the width step | ADR 0175 decision 3: round up to 50 mm | → **A-4**. Pricing declares its own `PRICE_STEP_MM`, a pricing unit and not the catalogue constant. The comment is rewritten in P1. The seam test is amended **by QA** to forbid importing the catalogue constant |
| S-7 | ADR 0175 decision 5, *open seam* | Which amount rounds to 10 lei is open; it sits against "only presentation may round" (`price-book.ts:15`) and ADR 0100's "the query forbids rounding" | ADR 0175 assigns the seam to the architect; backlog 284 names the architect as owner | → **A-1** (seam and decomposition), recorded in W0 ADR 0177. `price-book.ts:15` and ADR 0100 *What whoever picks this up* get dated notes |
| S-8 | ADR 0175 *Open*: door count | Does the door count follow the actual width or the rounded one? | Unruled. The mockup's `base()` and `hwOf()` count doors at the **rounded** width [mock L510-511] | **Owner question OQ-6**, recommending actual width (A-3). It blocks P1's **merge**, not its dispatch |
| S-9 | ADR 0175 *Open*: height rounding | "Widths and heights" round; base 700 and the step come from the brief, not ruled separately | — | → **A-2** (round up, relative to a book-stated reference height). Owner-visible, not blocking |
| S-10 | ADR 0100 *What whoever picks this up* and Amendment; `parse-price-book.ts:58-72` [src] | `MAX_PRICE_COEFFICIENT_MINOR = MAX_SAFE_INTEGER / (4 × MAX_DESIGN_DIMENSION_MM)`. It must be **re-derived, not widened** | Percentages multiply a whole line, and the material and depth lines sum across every cabinet | → **A-5**. The bound is re-derived from named constants (terms, steps, the two percentage maxima, `MAX_PLACEMENTS`), with a test pinning that the worst case is exact |
| S-11 | ADR 0100 Amendment: "applied at the cabinet's real width" | The depth percentage multiplies the cabinet's price at its real width | ADR 0175 rounds widths up, so "real width" is ambiguous between the built width and the priced width | → **A-1**. The percentage multiplies the cabinet's **priced amount**, which already reflects round-up. "Real width" is read as "the cabinet's own width, not the anchor width". Dated note on 0100 |
| S-12 | ADR 0100 Amendment, *Where it applies* | Base and tall cabinets, including hob and sink; not wall cabinets | `depthFollowsSetting()` answers `true` for the wall corner returns (`FOLLOWS_CABINET_DEPTH_ON_WALL_MAP`) [src: `cabinet-depth-rule.ts:57-60,134-140`], which the mockup draws at 320/320 [mock L500-503] | → **A-6**. Keyed on a **measured** catalogue fact (the finished depth differs between the catalogue built at 600 and at 700), never on that predicate, a band or a list of ids. A parity test sweeps every row |
| S-13 | ADR 0092 decision 8; `hardware-mechanisms.ts:27-29` [src] | "The three mechanisms ADR 0070 decision 1 names, and no fourth. A lift arm … knowingly unpriced" | D4 adds a fourth rate, "Mecanism rabatabil" [mock L689-690], and `hwOf` charges a lift cabinet hinges **and** a lift [mock L511] | **Owner question OQ-5**. Wave P5 is conditional; until it is ruled, D4 draws three rates |
| S-14 | ADR 0070 decision 4; ADR 0062 seam 1; `price-book.ts:223-243` [src] | Accessories are named fields, not a list; when an accessory applies is code. The rack is earned per sink that resolves a host | D6 says "Listă cu adăugare și editare. Fiecare accesoriu se leagă de un tip de dulap" [mock L870]. D6A shows the rack as "Dulap pentru chiuvetă · câte 1" [mock L710] | **Owner question OQ-4**, recommending that adding accessories be deferred. D6 shows each accessory's true earning rule |
| S-15 | ADR 0062 Amendment 3, point 3; fix-round-2 brief | Disabling takes effect for saved kitchens through the forced replacement | The final mockup contradicts itself. The dialogs say "Intră în vigoare când publici" [mock L779]; the comment list says text, active/inactive and defaults "se aplică imediat" [mock L887]. The D4 edit hint still reads "bucătăriile salvate cu ea o păstrează, la prețul curent" [mock L693], which the third Amendment reversed | **Owner question OQ-2**, recommending publish. The stale D4 hint is a copy error: the ruling governs and T1 does not carry it |
| S-16 | ADR 0062 Amendment 1: "Changing a default never changes an already-saved kitchen" | — | A design that names no tier prices at the book's `defaultTierId` [src: `price-design.ts:411-426`]. Its material resolves through `DEFAULT_MATERIAL_ID` [src: `design-material.ts:26`] and its handle through `DEFAULT_HANDLE` [src: `queries/describe-selection.ts:77-79`]. If D9 wrote those defaults, saved kitchens would follow them | → **A-9**. Two concepts are separated. The **pricing fallback** (book `defaultTierId`, `DEFAULT_MATERIAL_ID`, `DEFAULT_HANDLE`) is fixed and never edited. The **new-kitchen defaults** (D9) are stamped explicitly into a design's `settings` when it is created (`generation/shell-design.ts` [src]) |
| S-17 | ADR 0072 Amendment: "where the marker is stored is open" | The owner named a cookie, the profile and the database | — | → **A-11**: a database row per design. Alternatives recorded |
| S-18 | Migration `0004` header; `design-revision.ts:1-9` [src] | The revision is opaque, "compared only for equality"; no layer above SQL does arithmetic on it. **The file's bytes are frozen once applied** | ADR 0062 Amendment 5 defines "changed" as `designs.revision >` the submission's or seen revision | → **A-12**. The comparison happens **in SQL only**, as `<>` (a revision only ever increments, so inequality is the same test). It stays opaque above SQL. `0004` is never edited (checksum) |
| S-19 | ADR 0062 Amendment 5, points 5–6; reconciliation note; ADR 0173 P-L3-8; `staff/request-status.ts` [src] | Statuses Trimisă → Văzută → Măsurare programată → În producție; reconciled to the shipped Nouă / Contactat / Ofertă trimisă / Închisă, **pending owner confirmation** | The final mockup draws the reconciled form [mock L814, L833] | **Owner question OQ-9** (confirm). The plan builds the reconciled form; the digest cut-off is `offer-sent` or `closed` |
| S-20 | Lot 3 plan §2.3 [doc: `M8B-account-screens-lot3-plan.md:250-251`] | `0023` (preset sort) and `0024` (invitations) are reserved for unbuilt waves | M10 needs six tables | M10 claims `0025`–`0030` (§9.2). The scribe records the reservation in both plans |
| S-21 | ADR 0153 decision 1; O-L3-1(c) | The application role reads no personal column of a contact submission | D10D's digest prints a customer name | The name comes from the **account profile**, as S3 does. A kitchen sent without an account prints its request reference. Security tier |
| S-22 | ADR 0100 Amendment: `globalSettings.depthNote` is at `ro.json:324` / `ru.json:324` | — | It is at line **325** in both [src] | Dated note (line drift only). ADR 0100 decision 5 still binds: the copy and the depth term merge together (merge point MP-3) |
| S-23 | ADR 0068 note (2026-10-25); ADR 0071 note (2026-10-25) | Both terms survive as dashboard fields; material carries a percentage | None | Consistent; no change |
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

**A-3 — Door count follows the actual built width** (pending OQ-6).

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
- `MAX_PRICE_COEFFICIENT_MINOR` is re-derived so that `Σ over MAX_PLACEMENTS cabinets of b_i × (100 + 200) × (100 +
  100)` stays a safe integer. The derivation is code over named constants, and a test pins that the worst case is
  exact.

**A-6 — Which cabinets deepen.**

- "Deepens" is a **measured** catalogue fact: the priced-as row's finished depth in the catalogue at 700 is greater
  than in the catalogue at 600.
- Customer-supplied rows never take the uplift.
- A parity test over every catalogue row asserts the rows that deepen.
- The expected set is the ruling's: base, tall, hob, sink and the base corners deepen; wall rows and the wall
  corners do not.
- **If the measurement disagrees with the ruling for any row, the wave stops and reports. It does not edit either
  side.**

**A-7 — Fixed-size rows.**

- `price-per-size` priced at the smallest listed size ≥ the body's width (round up, as A-2).
- A width above every listed size is refused with a new code, `NO_PRICE_FOR_SIZE`. It is never priced at 0 and never
  at the nearest size.

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
- Tests and local runs seed the same book through a test-only helper (ADR 0151).

**A-11 — The notice marker is a database row per design**: the last book version whose prices its owner has
acknowledged.

| | |
| --- | --- |
| Written | Only by a request authorised to edit that design (its write token or its account) |
| Never written by | A save, so it never moves `designs.revision` (which would light D10's badge) |
| When the notice shows | The design has a marker, the active version differs from it, and `pricesChangedBetween(design, seenBook, activeBook)` is true |
| A design with no marker | Gets one written at the current version, silently, on its first open |
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

**A-13 — The digest.**

- At most one run per calendar day (Europe/Chisinau), claimed idempotently by a day key.
- It is eligible when:
  - the kitchen changed after seen; and
  - it has not been in a digest since it was last seen; and
  - `designs.sent_at` is within 30 days; and
  - the status is not `offer-sent` or `closed`.
- `designs.sent_at` keeps the **first** send's instant [src: `neon-account-kitchen-store.ts:428-436`], and it is the
  list's "Trimisă la" date. That is why the 30 days count from it (OQ-10).
- No eligible kitchen means no e-mail.
- Recipients are accounts holding `contact.read` with a confirmed address.

**A-14 — Bulk % and its rounding.** Every scaled amount (anchor, steps, size prices) becomes `r10(amount × (100 + p) /
100)`, as the mockup's `r10(a*1.05)` does [mock L608]. A bulk change is one draft group, shown as one expandable row in
D7 and D8.

**A-15 — The draft is an ordered change-set, not a second book.**

- Each change names a stable field address (§8.4).
- The candidate book is `apply(activeBook, changes)`, a pure domain function.
- ↺ removes one change.
- Restore adds the archived version's differing fields as changes.
- Publish stores the candidate book whole and immutable, plus its change summary. Versions are append-only, and exactly
  one is active.

**A-16 — A disabled colour or handle (backlog 285's open point for the architect).**

- It is one row in the C4 sheet, whichever level carries it.
- The customer's choice replaces it **at every level where it appears**: the kitchen setting and every cabinet
  override.
- No ADR 0086 confirmation is owed, because the customer is choosing explicitly.
- A colour reset caused by a material replacement follows ADR 0057 and is announced ("Culoarea a revenit la …",
  C4C).
- **Why:** leaving a disabled colour on some cabinets would leave the price refused (P4-a) with no row to resolve it.
- Owner-visible.

---

## 6. Owner questions

### 6.1 Questions that block a wave

Each question names what it blocks, and every blocked wave says so in §10.

| # | Question | Blocks | Recommendation |
| --- | --- | --- | --- |
| **OQ-2** | Does disabling (a material, colour, hardware class, handle or accessory) take effect **when published**, or immediately? The mockup says both [mock L779 vs L887]. And are name and description edits versioned? | P4, S2, R4, U4a/U4b | **Through publish.** It is customer-visible like a price. The C4 accessory notice is keyed on book versions. A published version must stay immutable. D9 defaults stay immediate (A-9) |
| **OQ-3** | Catalogue text: the mockup gives every row RO/RU tabs and points at *Traduceri*. Editing a keyed row (ADR 0106) changes nothing visible, and runtime translation is deferred (O-L3-3). What does M10 edit? | P4, U4a/U4b, R4 | **Keyed rows: text read-only in M10.** Rows the dashboard creates (a new hardware class): authored RO text required, RU optional, showing RO until RU exists (as the mockup notes). This departs from ADR 0106's rejection of RO-only fallback for that one row type, so it needs the owner's word |
| **OQ-4** | D6 "adăugare … se leagă de un tip de dulap". Adding an accessory needs a new earning shape (code), and D6A shows the rack as "câte 1" per sink cabinet, while the engine earns it per sink that resolves a host | P4 (accessory shape), U4a (D6 add flow) | **Defer adding accessories.** M10 edits and disables the two existing ones. D6 states each one's real rule |
| **OQ-5** | A fourth hardware rate, "Mecanism rabatabil", is drawn in D4 [mock L689-690]. ADR 0092 decision 8 left the lift arm knowingly unpriced. Price it, and does a lift door also count hinges? (The mockup counts both [mock L511].) | P5, and the fourth column in U4a | **Price it as drawn** (owner-reviewed final mockup). Hinges on a lift door: **ask the manufacturer**; no recommendation. Until ruled, P5 is not dispatched and D4 shows three rates |
| **OQ-6** | Door leaves at the actual or the rounded width? | P1's **merge** | **Actual** (A-3) |
| **OQ-7** | The whole-kitchen handle: do per-cabinet choices survive it, and does it reach the top row? | H1 | **ADR 0099's two-level model.** A cabinet's own handle wins, and the kitchen choice applies to cabinets without one. **The top row is excluded**: D9 has its own "Rândul de sus" line [mock L755] |
| **OQ-9** | Confirm the reconciliation: keep Nouă / Contactat / Ofertă trimisă / Închisă; "seen" is a marker; the digest stops at Ofertă trimisă or Închisă | K1's **merge** | **Confirm** (it is what the final mockup draws) |
| **OQ-10** | The digest's send time, and 30 days from the first send or the last | K4 | **08:00 Europe/Chisinau.** Vercel cron is UTC, so `0 5 * * *` gives 08:00 in summer and 07:00 in winter. **From the first send** (`designs.sent_at`, the date the list shows) |

### 6.2 Questions that block nothing, only the milestone's close

| # | Question | Recommendation |
| --- | --- | --- |
| OQ-1 | Confirm, in the owner's own words, that M10 runs **now**, before M8 and M9 close. The coordinator relayed it | Recorded in ADR 0176 as coordinator-relayed; confirmed at close |
| OQ-8 | Default widths (backlog 276): the proposed 600 for `base-panbank`, `wall-lift`, `open-shelf` and `hood`; `tall-pantry` 600 or 800; the wall cabinet's anchor width (the mockup uses 600 [mock L505]) | 600 everywhere proposed |
| OQ-11 | Approve all M10 Romanian NEW COPY as drafted (as O28b and O-L3-7 did) | Approve. Russian stays an agent draft, marked and never pinned (ADR 0095) |
| OQ-12 | Every figure: the 15 %, the material percentages, every amount | They stay placeholders. The first real book is the manufacturer's own entry, published from the dashboard. The `amountsProvisional` switch (D7C) is the owner's |
| OQ-13 | Back up the price-book versions in the scheduled export (ADR 0012's scoped select) | Yes: wave S6, before launch |
| OQ-14 | **Who can review** (ADR 0062 Amendments 4–5, carried over as open: "roles are outside the dashboard's scope") | **Use the capabilities that already exist; no role work.** `contact.read` (operator and administrator) may open a kitchen, mark it seen, see the badge and counter, and receive the digest. `price.edit` (administrator only) may edit, publish, restore and save defaults [src: `capabilities.ts:45-57`]. "Seen" is one marker per kitchen, shared by all staff (A-12). Recorded as A-12 and A-13; the owner confirms at close |

**The rulings A-1 to A-16 are not questions.** They are recorded as architect rulings that the owner may overrule.
The owner should still be shown A-1 (rounding) and A-9 (defaults), because both are customer-visible.

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
   - Evidence: coordinator-relayed owner request, 2026-10-25 (OQ-1).
2. **ADR 0177 — pricing seams:** A-1 to A-8 and S-11, S-12, S-24. It settles ADR 0175's open seams, door count
   pending OQ-6.
3. **ADR 0178 — dashboard storage and lifecycle:** A-9 to A-16; the migration table (§9.2); the audit actions; the
   capability gates.
4. **Dated notes or amendments:**
   - ADR 0062: a sixth Amendment pointer;
   - ADR 0072: the marker is decided; "M6 and M8 still build nothing" is superseded;
   - ADR 0092: S-5 settled; S-13 open as OQ-5;
   - ADR 0100: S-11, S-22, the timing;
   - ADR 0106: S-3, and S-4 per OQ-3;
   - ADR 0068: door count;
   - ADR 0070: S-14 per OQ-4;
   - ADR 0173: M10 builds on Proposed P-rows; acceptance is owed;
   - ADR 0174: O-L3-2 satisfied;
   - ADR 0175: status line and open seams.
5. **Backlog:**
   - 54, 176, 276 (field only), 277–286: each moves to "M10, wave …";
   - the Lot 3 reservation of `0023`/`0024` beside M10's `0025`–`0030`.
6. **Indexes:** `docs/milestones/README.md` gains an M10 row; `docs/STATUS.md` gains M10 as **In progress, W0**.
7. **Owner questions:** §6.1 and §6.2, asked through the coordinator. Answers are recorded as dated amendments to
   ADR 0177 or 0178.

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
| **X** | Contracts (X0; X1 gated on OQ-2/3/5) | The X0/X1 files listed in §10 | Any behaviour; any existing test's assertions | Full (logic mini-review) |
| **P** | Pricing engine | `configurator-domain/src/pricing/**`; `catalog.ts`; `hardware-mechanisms.ts` (P5); the domain root `index.ts` after MP-0; the P3 window in §9.1 | `design.ts`, `generation/**`, `price-dashboard/**`, `staff-changes/**`; `apps/web` outside the P3 window | Full |
| **H** | Whole-kitchen handle and new-kitchen stamping | `design.ts`; `queries/describe-selection.ts`; `push-to-open.ts`; `kitchen-handle/**`; `commands/set-kitchen-handle.ts`; `generation/shell-design.ts`; `generation/generate-kitchen.ts` (request type only) | `pricing/**`; `apps/web` | Full |
| **M** | Dashboard model (pure) | `configurator-domain/src/price-dashboard/**` (after X0) | `pricing/**` (reads and imports only); `apps/web` | Full |
| **S** | Persistence, **the sole writer of `packages/persistence/` in M10** | `packages/persistence/**`, including the census, the privilege test, `index.ts` and migrations `0025`–`0030` | `packages/configurator-domain`; `apps/web` | Full + security |
| **T** | Copy | `apps/web/src/messages/*`; `i18n/content.ts`; the copy-lock tests | Every component; the `depthNote` reference (Q1's) | Light |
| **R** | Web server routes and the one book root | `lib/server/active-price-book.ts`; `lib/server/price-dashboard/**`; `lib/server/price-notice.ts`; `app/api/staff/prices/**`; `app/api/designs/**/price-notice/**`; the R1 window in §9.1; the mint path (R4) | `staff/**` components; `price-dashboard/**` components; `lib/server/staff/**` except where K2 hands over (none planned) | Full + security |
| **U** | Dashboard UI D1–D9 | `apps/web/src/price-dashboard/**` (except the X0 wire contract); `app/[locale]/staff/catalog/**`; `proxy.ts`; `staff-shell.tsx`, `staff-nav-sheet.tsx`, `staff-paths.ts` (except the K4 window); `apps/web/public/cabinets/**` | `staff/staff-kitchen*`, `staff-kitchens*` (K's); `lib/server/**` | Light + visual (U5 Full) |
| **K** | D10 and the digest | `configurator-domain/src/staff-changes/**`; `staff-kitchens-rows.tsx`, `staff-kitchen-filters.tsx`, `staff-kitchen-view.tsx`, `use-staff-kitchen.ts`, `kitchen-version-switch.tsx`, `use-changed-kitchen-count.ts`; `app/api/staff/kitchens/**`; `lib/server/staff/staff-kitchens.ts`, `staff-kitchen-actions.ts`; `app/api/cron/staff-change-digest/**`; `lib/server/mail/staff-change-digest.ts`; `vercel.json`; the K4 window in §9.1 | `lib/server/mail/mail-sender.ts` and the existing senders (consume only) | K1 Full; K2 and K4 Full + security; K3 Light + visual |
| **Q** | Customer side C1–C5 | `price-breakdown.tsx`, `price-bar.tsx`, `settings/global-settings.tsx`; after MP-3, also `price-breakdown-model.ts`, `whole-kitchen-tiers.ts`, `starting-price.ts`, `settings/global-settings-model.ts`, `store/whole-kitchen-apply.ts`; new `replacement-sheet.tsx`, `price-notice-banner.tsx`, `use-price-notice.ts`, `sent-kitchen-note.tsx` | `lib/server/**`; `staff/**`; `price-dashboard/**` | Q1 and Q3 Full; Q2, Q4, Q5 Light; every wave visual |
| **Z** | Integration, visual pass, test audit, close | Nothing: Z reads, measures and reports, and the scribe writes | Everything (verifier) | Visual + test audit |

### 8.2 Dependency graph (an arrow means "must be merged before it starts")

```
W0 ─► X0 ═══ MP-0 (fan-out) ═══╦═► P1 ─► P2 ─► P3+Q1 (MP-3; P3 also needs R1) ─► P4 (also needs X1) ─► P5 (OQ-5, X1)
                               ║         │       │                              │
                               ║         └► M1   ├► M2                          ├► M3 ─► S3 (also needs S5)
                               ║                 │                              │
                               ╠═► H1 ─► H2      ├► Q2 (also needs H1, T1)      ├► Q3 (also needs R5, T1)
                               ║                 │                              └► Q5 (also needs Q3, H1)
                               ║                 └► T2 (deletes the old depthNote leaf)
                               ╠═► S1 ─► S2 ─► S4 ─► S5 ─► S3 ─► S6
                               ║    │     │     └► K4 (also needs K3, U1)
                               ║    │     └► (live wiring of R2/R3)
                               ║    ├► R1 ─► R2 (also needs M1) ─► R3 (also needs M2) ─► R4 (also needs M3, S3, H2, X1) ─► R5 (also needs P4, S5)
                               ║    └► K2 (also needs K1)
                               ╠═► K1 ─► K2 ─► K3 (also needs T1) ─► K4
                               ╠═► T1 ─► U1 ─► U2 (needs M2) , U3 (needs M2) , U4a/U4b (needs M3, X1) , U5 (needs M1) , U6 (needs H2)
                               ║    └► Q4 (needs R5)
                               ╠═► X1 (gated on OQ-2, OQ-3, OQ-5; may run any time after MP-0 once answered)
                               ╚═► (everything) ─► Z1 ─► Z2
```

**Starts immediately after MP-0, five lanes truly in parallel:** P1, H1, S1, K1, T1. They share no file (§9).

**Starts as soon as one predecessor merges:**

| Wave | Waits for |
| --- | --- |
| U1 | T1 |
| R1 | S1 |
| K2 | K1, S1 |
| M1 | P2 |
| X1 | The owner's answers to OQ-2, OQ-3, OQ-5 (it touches no lane's file in use; §10 X1) |

**Waits on the serial pricing chain:**

- after P3 (MP-3): M2, U2, U3, Q2, T2;
- after P4: M3, U4a, U4b, Q3, Q5.

Q2 waits for MP-3 because Q1 holds `global-settings.tsx` until then.

**The hardest serialisation point is P3, the cut-over** (§10, P3). It changes `PriceBook`'s shape for every consumer
at once, and while it runs it holds named files in `apps/web/src/price/**` and `settings/**`. Lane Q may not start Q3
or Q5 until P3 merges. Q1 is built **on P3's branch**, and the two merge together at MP-3 (ADR 0100 decision 5: the
`depthNote` copy and the depth term ship in one change).

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

**X0 freezes only what is already answered.** These parts depend on open owner questions and are frozen by **X1**:

- the `active` arm and `unavailable` (OQ-2);
- `hardware-tier-created` and authored text (OQ-3);
- `perLiftMinor` (OQ-5).

X1 is the one planned follow-up contract wave. It runs once those answers exist, and before P4, U4a/U4b and R4. Until
it lands, no lane writes code against these parts, so the fan-out never waits on the owner.

**(a) The book shape, as a specification.** The types land in P1, P2 and P4. X0 freezes this text, and P implements
exactly it.

```
PriceBook {
  version, currency "MDL", status ("estimate"; the dashboard never edits it [mock L894]), amountsProvisional
  cabinetRules: CabinetPriceRule[]           // formula: AnchoredFormula | PricePerSizeFormula (old linear shapes retired at P3)
  hardware: TierGroup<HardwareTier>          // defaultTierId = the fixed pricing fallback (A-8, A-9); tiers gain `active`
  material: TierGroup<MaterialTier>          // MaterialTier.percentOfCabinets: whole 0..MAX_MATERIAL_PERCENT; `active`; wholeKitchenMinor removed at P3
  depthRule: { deepCabinetPercent: whole 0..100 }
  accessories: BookAccessories               // AccessoryRule gains `active`; still named fields (OQ-4)
  unavailable: { finishIds: string[], handles: Handle[] }   // disabled colours and handles (OQ-2); unknown ids refused
}
AnchoredFormula { shape: "anchored-width" | "anchored-width-and-door-leaves" | "anchored-width-and-height"
                  | "anchored-width-height-and-door-leaves";
                  anchorWidthMm, anchorMinor, perStepWiderMinor, perStepNarrowerMinor,
                  perExtraDoorLeafMinor?, anchorHeightMm?, perHeightStepMinor? }
PricePerSizeFormula { shape: "price-per-size"; sizes: { widthMm, amountMinor }[] (1..n, widths unique, ascending) }
New refusal codes: NO_PRICE_FOR_SIZE (A-7), REPLACEMENT_REQUIRED (a selection names a disabled item; carries the item refs)
New line kind: "depth" (A-1). The Material line keeps kind "material".
```

**(b) The field address of a draft change** (domain, `price-dashboard/book-field-address.ts`, written in X0):

```
{ kind: "cabinet", ruleId, field: anchorMinor|perStepWiderMinor|perStepNarrowerMinor|perExtraDoorLeafMinor|perHeightStepMinor }
{ kind: "cabinet-size", ruleId, widthMm }
{ kind: "hardware", tierId, field: perHingeMinor|perDrawerMinor|perPushToOpenMinor (|perLiftMinor if OQ-5) }
{ kind: "material", tierId, field: "percentOfCabinets" }
{ kind: "depth-rule" }
{ kind: "accessory", accessoryId, field: "perUnitMinor" }
{ kind: "active", item: ItemRef, active: boolean }          // per OQ-2
{ kind: "provisional", value: boolean }
{ kind: "hardware-tier-created", tierId, authoredText }     // OQ-3
DraftChange { address, value, groupId? }   // groupId = one bulk action (A-14)
```

**(c) Persistence ports** (X0, `packages/persistence/src/`; S implements them).

- **No `null`; a special-case object instead.**
- **The book is `unknown`** (jsonb): the store never imports a book type, and the domain parses it.
- **Every write takes an audit entry** and commits it in its own transaction.

| Port | Operations |
| --- | --- |
| `PriceBookStore` | `readActive()` → `{versionId, label, publishedAt, book}` or `NO_ACTIVE_VERSION`; `readVersion(id)`; `listVersions(page)`; `readDraft()` → `{draftRevision, changes}`; `writeDraft({expectedDraftRevision, changes, audit})` → ok or `changed-meanwhile`; `publish({expectedDraftRevision, label, note, book, changeSummary, audit})` → ok `{versionId}` or `changed-meanwhile` (one transaction: archive the previous active version, insert the new one, clear the draft, write the audit row) |
| `KitchenDefaultsStore` | `read()` → defaults or `NONE_SAVED`; `save({expectedRevision, defaults, audit})` |
| `KitchenUsageReader` | `count(itemRef)` → a count of designs not deleted by the client |
| `KitchenChangeStore` | `markSeen({designId, displayedRevision, audit})`; `listChanged…` is folded into the staff kitchens statements; `claimDigestDay(dayKey)` (idempotent); `listDigestEligible(now)`; `recordDigested(roundId, designIds)` |
| `PriceNoticeStore` | `readAcknowledged(designId)` → `versionId` or `NEVER_RECORDED`; `recordAcknowledged(designId, versionId)` |

**(d) Wire contract** (X0, `apps/web/src/price-dashboard/price-dashboard-wire-contract.ts`, plus additions to
`apps/web/src/staff/staff-kitchens-wire-contract.ts`).

- Request and response bodies and error codes for: dashboard state, draft change, revert, bulk, publish, versions,
  version, restore, item lifecycle, usage counts, defaults, seen, changed count, price notice.
- Refusal codes are a closed list.
- Bodies carry codes, never sentences (ADR 0095 decision 3).

**(e) Staff audit actions** (X0, `packages/configurator-domain/src/staff/staff-audit-action.ts`). These are new
closed-list entries, each with its detail shape: ids, codes and counts, never names or free text.

```
price-draft-changed, price-draft-reverted, price-bulk-changed, price-published, price-restored-to-draft,
catalogue-item-activation-changed, catalogue-item-deleted, hardware-tier-created, kitchen-defaults-saved,
kitchen-seen, price-catalogue-viewed
```

The `action` column is a shape check [src: `0020` header], so no migration is owed.

---

## 9. Shared files

### 9.1 One owner per file, and when ownership moves

**Two agents never hold the same file in the same window.** Ownership moves only at a named merge.

| File | Owner, and the window | Everyone else |
| --- | --- | --- |
| `packages/configurator-domain/src/index.ts` (root barrel) | X0 writes the sub-barrel lines: `price-dashboard/index.js`, `staff-changes/index.js`, `kitchen-handle/index.js`. After MP-0: lane **P** only | M, K and H export through their own sub-barrel and never touch the root |
| `packages/configurator-domain/src/staff/staff-audit-action.ts` | X0, then frozen | Ask the architect for a follow-up contract wave |
| `packages/configurator-domain/src/account/capabilities.ts` | Nobody; no change is needed | — |
| `packages/configurator-domain/src/design.ts` | Lane **H** | P reads only |
| `packages/configurator-domain/src/catalog.ts` | Lane **P** (P1, the default-width field) | — |
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
| 0025 | `create_price_book_versions` (id, label, note, book jsonb object, change_summary jsonb, state `active`/`archived`, published_at, published_by_account_id; one active, by a partial unique index) | S2 | `SELECT`; `INSERT`; `UPDATE (state)` |
| 0026 | `create_price_book_draft` (a single row: revision bigint, changes jsonb array, base_version_id, updated_at, updated_by_account_id) | S2 | `SELECT, INSERT, UPDATE` |
| 0027 | `create_kitchen_defaults` (a single row: revision, defaults jsonb, saved_at, saved_by_account_id) | S3 | `SELECT, INSERT, UPDATE` |
| 0028 | `create_design_staff_seen` (design_id pk, seen_revision bigint, seen_by_account_id, seen_at) | S4 | `SELECT, INSERT, UPDATE` |
| 0029 | `create_staff_change_digest` (rounds: day_key unique, ran_at, sent_count; entries: round_id, design_id, revision) | S4 | `SELECT, INSERT, UPDATE (rounds.sent_count)` |
| 0030 | `create_design_price_notices` (design_id pk, acknowledged_version_id, acknowledged_at) | S5 | `SELECT, INSERT, UPDATE` |

No `DELETE` is granted on 0025. Versions are append-only (A-15).

---

## 10. Waves

Every row carries its review tier and its *Reading*. "Prod files" counts production files only; paired tests do not
count (WORKFLOW). A row over five files says so and gets a mini-review.

### X0 — Contracts (serial; after W0; Full)

**Items:**

1. Book field address and draft change types (§8.4 b).
2. Persistence ports and special-case objects (§8.4 c).
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
  mockup's fields, frame by frame.

**Reading:** this plan §5, §8.4 and §9; ADR 0173 P-L3-3; `staff/staff-audit-action.ts`; `persistence/src/staff-kitchen-actions-store.ts` (the port pattern); `apps/web/src/staff/staff-kitchens-wire-contract.ts`; mockup frames D2–D10 notes [mock L829-883].
**QA reading:** the same, plus `persistence/tests/fake-staff-kitchen-actions-store.test.ts`.
**Review reading (logic):** §4, §5 and §8.4; ADR 0062 Amendments 2–5; ADR 0175. **(clean-code):** `docs/best-practices/engineering-conventions.md`.

### X1 — The contract parts that wait on the owner (gated on OQ-2, OQ-3, OQ-5; Full)

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

### Lane P — Pricing engine (Full for every wave)

**Base reading for every P wave:** ADR 0062 seam 1; ADR 0068; ADR 0070; ADR 0092 decisions 1, 2, 8, 12 and the
Amendment; ADR 0100 and its Amendment; ADR 0175; ADR 0177 (W0); `docs/design/DEVELOPMENT-SPEC.md` §12 (price is
derived from placements and never stored) and §7 (catalogue); this plan §5 and §8.4(a);
`pricing/price-book.ts`, `parse-price-book.ts`, `price-design.ts`, `price-lines.ts`, `sample-price-book.ts`.

| Wave | Must-fix items (≤ 5) | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **P1** anchored shapes, beside the old ones | (1) the four `anchored-*` shapes and `price-per-size`, with arms in `amountForBody`; (2) round-up of width and height (A-2, A-4), and `NO_PRICE_FOR_SIZE` (A-7); (3) the signed door term at actual width (A-3, behind one named function); (4) parser arms with bounds; (5) the catalogue `defaultWidthMm` field plus a parity test against the generator's constants (backlog 276) | `price-book.ts`, new `pricing/anchored-price-formula.ts`, `parse-price-book.ts`, `price-lines.ts` (code), `catalog.ts` | MP-0. **Merge waits for OQ-6** | `cabinet-handles.ts` (`widthDerivedDoorLeafCount`); `generation/generation-priorities.ts`, `leftover-rule.ts`, `optional-run-items.ts`, `u-tall-layout.ts` (default widths); backlog 276; ADR 0035 d8; ADR 0049 |
| **P2** percentages and the rounding seam, beside the old ones | (1) `percentOfCabinets` on material tiers and `depthRule` (types and parse); (2) the deepening property (A-6) and its parity sweep; (3) the A-1 decomposition: material and depth lines and every line `r10` (integer arithmetic); (4) re-derive `MAX_PRICE_COEFFICIENT_MINOR` (A-5); (5) a book carrying both old and new material fields is refused | `price-book.ts`, new `pricing/percentage-lines.ts`, `price-design.ts`, `parse-price-book.ts`, `price-lines.ts` | P1 merged | `cabinet-depth-rule.ts`; `worktop-depth.ts`; `buildKitchenLBodyCatalog`; ADR 0101; ADR 0087; ADR 0098 |
| **P3** cut-over (the hard serialisation point) | (1) the sample book converted to anchored, percentage and depth form (placeholders, still `amountsProvisional: true`); (2) the old linear shapes and `wholeKitchenMinor` removed; (3) every consumer updated: `whole-kitchen-tiers.ts`, `starting-price.ts`, the breakdown model's material line and new depth line, and the i18n tests naming `wholeKitchenMinor` (tests only: no message-file edit); (4) the `price-book.ts:12-13` comment rewritten; (5) QA is told which pins move (`pricing-seams.test.ts`, `qa-6b2-tier-amounts`, `qa-m6-wave-b-*`, `submission-snapshot.test.ts`) | `sample-price-book.ts`, `price-book.ts`, `apps/web/src/price/whole-kitchen-tiers.ts`, `starting-price.ts`, `price-breakdown-model.ts`. **About five, plus test fixtures; a mini-review is added because it crosses packages** | P2, R1 merged (so the root is already single) | ADR 0106 and Amendment A; `apps/web/tests/i18n/price-book-text.test.ts`; ADR 0154 d8 (stored snapshots are not touched); `apps/web/src/price/price-breakdown.tsx` |
| **P4** availability and replacement | (1) `active` on tiers and accessories, and `unavailable.finishIds/handles` (per OQ-2); (2) `REPLACEMENT_REQUIRED` from `priceDesign` when a selection names a disabled item, never `UNKNOWN_TIER`; (3) `replacementsRequired(design, book, catalog)` → item refs plus remaining options; (4) a disabled accessory produces no line, and `removedAccessoriesSince(seenBook, activeBook, design)` supports the C4 info row; (5) `pricesChangedBetween(design, catalog, seenBook, activeBook)` (A-11). Authored text for created rows only if OQ-3 is answered as recommended | `price-book.ts`, `parse-price-book.ts`, `price-design.ts`, new `pricing/replacements.ts`, new `pricing/price-change-notice.ts` | P3 merged; X1 merged (so OQ-2, OQ-3 answered); **OQ-4 answered** | ADR 0062 Amendment 3; ADR 0072 Amendment; ADR 0057; ADR 0081; ADR 0086; ADR 0099; `materials.ts`; `queries/sink-accessories.ts` |
| **P5** lift mechanism (conditional) | (1) a fourth count and rate per OQ-5; (2) hinge counting on a lift door per the answer | `hardware-mechanisms.ts`, `price-book.ts`, `price-design.ts`, `parse-price-book.ts` | P4; **OQ-5** | ADR 0092 d1, d2, d8; ADR 0070 d1; `front-population.ts` |

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
  generator plans (parity). Rows marked proposed are listed in one place.
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
  - a wall row's and a customer-supplied row's contribution is 0;
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
- **P4-a:**
  - a design naming a disabled tier, colour or handle is refused with `REPLACEMENT_REQUIRED`, listing every disabled
    item it uses;
  - never `UNKNOWN_TIER` for an item still in the book;
  - must-not: a disabled item is ever offered to a new choice.
- **P4-b:** `replacementsRequired` lists only active options, and never an empty set: P4 refuses a book that would
  leave a group with no active option (the D5G rule).
- **P4-c:** a disabled accessory yields no line and no refusal.
- **P4-d:**
  - `pricesChangedBetween` is true if and only if some line amount differs;
  - identical books give false;
  - a change to a row the design does not use gives false.
- **P5:** per OQ-5; the criteria are written once it is answered.

**QA reading (every P wave):** the base reading; `packages/configurator-domain/tests/pricing/**`;
`docs/best-practices/engineering-conventions.md`, *Coverage an adversarial pass owes* and *Three guards that look
thorough and cannot fail*. A sabotage run is owed for every new arm (R6).
**Review reading (logic):** the base reading, plus §4 rows S-6 to S-12. **(clean-code):** the wave's diff and `engineering-conventions.md`.

### Lane H — Whole-kitchen handle and stamping new kitchens (Full)

| Wave | Must-fix items | Prod files | Depends on | Reading |
| --- | --- | --- | --- | --- |
| **H1** whole-kitchen handle | (1) `DesignSettings.handle` (optional, so no schema bump, per ADR 0099 d10's argument); (2) resolution: the cabinet's own handle, else the kitchen handle (excluding the top row), else today's defaults (`DEFAULT_HANDLE` / `TOP_ROW_HANDLE`); (3) a `setKitchenHandle` command; (4) `isPushToOpen` reads the resolved handle, so hardware latches follow it; (5) migration and load-seam tolerance | `design.ts`, `queries/describe-selection.ts`, new `kitchen-handle/kitchen-handle.ts`, `push-to-open.ts`, new `commands/set-kitchen-handle.ts` | MP-0; **OQ-7** | DEVELOPMENT-SPEC §5.5 and §6.5 (finish and handle); ADR 0061; ADR 0092 Amendment C; ADR 0099; backlog 278; `design.ts:44-70,170-195` |
| **H2** stamping new-kitchen defaults | (1) the generation request takes `newKitchenSettings` (material, hardware, depth, colour, handle, top-row handle); (2) `shell-design.ts` stamps them explicitly; (3) a colour the default material does not offer resets to that material's default (ADR 0057, the D9B note); (4) absent settings on a legacy document keep the fixed fallback (A-9) | `generation/shell-design.ts`, `generation/generate-kitchen.ts` (request type), `kitchen-handle/…` | H1 | ADR 0111; ADR 0057; ADR 0071 Amendment; `migrate-design.ts:83` |

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
  `HEAD`).
- **H2-a:**
  - every newly generated design carries explicit material, hardware, depth, colour and handle;
  - changing the defaults input never changes the output for an existing document.
  - This is a property: generate, then re-load under different defaults, and the design is byte-identical.

**QA reading:** H reading plus `tests/queries/describe-selection*`, `tests/generation/**`. **Review reading (logic):**
ADR 0099, ADR 0092 Amendment C, this plan A-9. **(clean-code):** the diff.

### Lane M — Dashboard model (pure; Full)

| Wave | Must-fix items | Prod files | Depends on | Reading |
| --- | --- | --- | --- | --- |
| **M1** change-set | (1) `applyChanges(book, changes)` gives the candidate book, refused per change with a code; (2) `diffBooks(a, b)` gives D7/D8 rows in the new terms [mock L742], with bulk groups as one row; (3) revert one change; (4) `restoreChanges(archived, active)` (A-15) | new `price-dashboard/apply-changes.ts`, `diff-books.ts`, `restore.ts` | P2 merged (types) | §8.4(b); A-14; A-15; D7/D8 frames [mock L871-880] |
| **M2** bulk, validation, preview | (1) bulk % over a scope (all, one group, a selection) with A-14 rounding and counts ("22 dulapuri, 64 prețuri"); (2) `judgeBookAgainstCatalog`: the narrowest buildable width prices > 0 [D3C]; anchor width = default width; size list = the catalogue's sizes; percentage ranges; (3) `previewCabinet(rule, catalog, book, {material, depth, hardwareTier?})`: rows every 50 mm, an off-grid minimum row ("560 → preț ca 600"), door-step rows marked, built **only** from P's functions | new `price-dashboard/bulk-change.ts`, `judge-book.ts`, `cabinet-preview.ts` | P3 merged | D2D, D3A–G notes [mock L846-866]; ADR 0175 *Open* (negative at the narrow end) |
| **M3** lifecycle rules | (1) `usesItem(design, itemRef)` (the predicate S3's SQL must agree with); (2) `canDelete` (unused, and not the D9 default), `canDisable` (not the D9 default, and not the last active option); (3) the D9 defaults judgement (a colour reset when the default material changes); (4) the remaining-options list for the dialogs | new `price-dashboard/item-usage.ts`, `item-lifecycle.ts`, `defaults-judgement.ts` | P4 merged | D4E/F, D5C/D/E/G, D6C, D9B [mock L868-881]; ADR 0062 Amendment 3 |

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
- **M2-c:**
  - every preview cell equals P2-b's function for that width, material and depth;
  - with hardware on, it equals that plus `r10` of that body's hardware;
  - no arithmetic is re-implemented. Sabotage: change P's step, and every preview moves with it.
- **M3-a:**
  - `canDisable` is false for the D9 default and for the last active option of a group;
  - `canDelete` is false whenever `usesItem` is true for any design.
- **M3-b:** the D9 colour reset follows ADR 0057's rule exactly. This is a sweep over every material and colour pair.

**QA reading:** M reading plus P's tests. **Review reading:** logic: the frames named, A-14 and A-15; clean-code: the diff.

### Lane S — Persistence (Full + security for every wave)

**Base reading:** the runbook `applying-a-table-migration-and-its-application-role-grant.md` (steps and the `0008`
section); ADR 0020; ADR 0042; ADR 0128; ADR 0146; ADR 0151; ADR 0153 d1; ADR 0155 (no destructive mutant against a
database); ADR 0173 P-L3-3; `staff-kitchen-actions-store.ts`, `neon-staff-kitchen-actions-store.ts`, `staff-kitchen-statements.ts`; migrations `0020`–`0022`.

The order is S1 → S2 → S4 → S5 → S3 → S6. S3 is the only S wave gated on M3, and so on P4 and the owner, so it runs
last and holds nothing up. Migration numbers follow §9.2, not wave order.

| Wave | Must-fix items | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **S1** fakes | Fakes for all five ports from §8.4(c), with a contract test suite each Neon store will also run | `fake-price-book-store.ts`, `fake-kitchen-defaults-store.ts`, `fake-kitchen-change-store.ts`, `fake-price-notice-store.ts`, `index.ts` | MP-0 | §8.4(c); `fake-staff-kitchen-actions-store.ts`; `account-domain-store-agreement.test.ts` (the agreement-suite pattern) |
| **S2** book versions and draft | `0025`, `0026`; `NeonPriceBookStore` (publish in one transaction with its audit row; `changed-meanwhile` compared in SQL); the owner-run `seed-price-book` command (A-10); migration-text tests; privilege-test arms; census rows | 2 migrations, `neon-price-book-store.ts`, `price-book-statements.ts`, `seed-price-book.ts` | S1 | A-10, A-15; §9.2 rows 0025/0026; `migrate.ts` (how an owner-run command is wired); `0011_create_presets.sql` (an append-mostly table's grant) |
| **S4** seen and digest | `0028`, `0029`; `NeonKitchenChangeStore`; the staff kitchens statement gains `changed_since_seen` (`revision <> effective-seen`, in SQL), an `only-changed` filter, changed-first sort and a count | 2 migrations, `neon-kitchen-change-store.ts`, `staff-kitchen-statements.ts` (mod), `kitchen-change-statements.ts` | S2 (sequence) | A-12, A-13; S-18; `0004` header (read only); `design-revision.ts`; `0022_create_design_request_states.sql`; `neon-staff-kitchen-reader.ts` |
| **S5** notice marker | `0030`; `NeonPriceNoticeStore` | 1 migration, `neon-price-notice-store.ts` | S4 (sequence) | A-11; `neon-configuration-repository.ts` (the write-token authorisation it must mirror, read only) |
| **S3** defaults and usage | `0027`; `NeonKitchenDefaultsStore`; `NeonKitchenUsageReader` (jsonb paths; client-deleted rows excluded) with a **parity test against M3's `usesItem`** over shared fixture designs | 1 migration, `neon-kitchen-defaults-store.ts`, `neon-kitchen-usage-reader.ts`, `kitchen-usage-statements.ts` | S5, M3 | A-9; M3's `item-usage.ts`; `design.ts:170-195` (the settings paths); `0016` (`deleted_by_client_at`) |
| **S6** backup (OQ-13) | Price-book versions and defaults added to the scheduled export | `backup` statement (one file) | S3 | ADR 0012; `apps/web/src/lib/server/backup-designs.ts` (read only; its route is not S's) |

**S acceptance:**

- **S-a:** every live suite is registered in `live-suite-census.test.ts`. Every new table has a privilege arm that is
  **red with nothing granted** and green with exactly the §9.2 grant.
- **S-b:**
  - publish is all-or-nothing: if the audit insert fails (fault injected), no version row is written and the draft is
    unchanged;
  - must-not: two active versions exist at once (the partial unique index, proved by a racing pair of publishes);
  - must-not: any `DELETE` on `price_book_versions` is granted.
- **S-c:**
  - `changed_since_seen` is computed only in SQL;
  - no TypeScript code parses, orders or does arithmetic on a revision (checked with `rtk proxy grep` for `Number(`
    and `BigInt(` near `revision`);
  - a seen mark with a stale displayed revision leaves the badge on.
- **S-d:**
  - `claimDigestDay` called twice for one day key yields exactly one claim;
  - a design digested since its last seen mark is not eligible;
  - one past 30 days from `sent_at`, or at `offer-sent` or `closed`, is not eligible.
- **S-e:** the usage reader and `usesItem` agree on every fixture design, including absent settings counted toward the
  fallback, a per-cabinet colour override, and a client-deleted design (excluded).
- **S-f:** the application role reads no personal column of `contact_submissions` in any new statement (ADR 0153 d1).
  Checked by the privilege test planning each statement as that role.
- **S-g:** every migration file is new. **No applied migration file is edited** (checksums). The runbook text for each
  is in the wave's report.

**QA reading:** the base reading plus `tests/application-role-privileges.test.ts`, `live-suite-census.test.ts` and
`migration-0020-0022-text.test.ts`. QA runs per-package (`cd packages/persistence && pnpm exec vitest run`), alone on
`TEST_DATABASE_URL`.
**Review reading (logic and security):** the base reading plus §9.2 and A-10 to A-13. **(clean-code):** the diff.

### Lane T — Copy (Light)

| Wave | Must-fix items | Prod files | Depends on | Reading |
| --- | --- | --- | --- | --- |
| **T1** all M10 Romanian leaves, with Russian drafts | (1) every NEW COPY string in D1–D10 and C1–C5 [mock L885-899, plus frame text], under namespaces `priceDashboard.*`, `staffChanges.*`, `customerPriceNotice.*`, `replacementSheet.*`, `sentKitchenNote`, `globalSettings.kitchenHandle*`, `priceBreakdown.depthLine` (with an ICU `{percent}`; no figure in copy); (2) RU drafted, marked as an agent draft (ADR 0095 d2), never pinned; (3) the copy lock gains every leaf, marked `Drafted`; (4) the **new** leaf `globalSettings.depthNotePriced` (the C3S sentence, `{percent}`), which nothing renders until Q1 switches to it; the old `depthNote` is left untouched; (5) **not** the stale D4 hint (S-15) | `ro.json`, `ru.json`, `ro.d.json.ts` (regenerated), `i18n/content.ts` (if a key path needs a case), the copy-lock file | MP-0 | ADR 0095; ADR 0100 decision 5; ADR 0106 Amendment A (no amount or rule restated in a keyed text); ADR 0141; ADR 0174 O-L3-7 (the precedent for pre-approval); `ro.d.json.ts:1-2` |
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
| **R1** one price-book root (backlog 176) | (1) `lib/server/active-price-book.ts`: read the active version and parse it once per request; (2) the editor, account card, preset preview and contact route all read it, and the client receives `{versionId, book}` as a server prop, so no client module names a book; (3) no active version means a refusal everywhere (A-10); (4) dev, test and e2e select the fake store seeded from `SAMPLE_PRICE_BOOK` through a test-only helper, mirroring how `lib/server/repository.ts` selects its store; (5) QA is told which pins move (`qa-m6-wave-b-book-ingress`, `qa-8c-model-purity`) | `active-price-book.ts`, `price-book-root.ts`, `shipped-price-book.ts` (removed or reduced to a re-export), `use-priced-design.ts`, the configurator page's server component | S1 | A-10; ADR 0133 (the first server frame is the loaded design; no module store written on the server); ADR 0072 *Decision* 1; `apps/web/src/lib/server/repository.ts`; `app/api/contact/**`; `apps/web/tests/price/qa-m6-wave-b-book-ingress*`, `qa-8c-model-purity*` (read; QA moves them); `apps/web/AGENTS.md` (this Next.js version) |
| **R2** dashboard read and draft API | `GET /api/staff/prices` (active, draft, catalogue facts, usage-free); `PUT …/draft` (changes, expected revision); `DELETE …/draft/{change}` (↺); `POST …/bulk`. Every one checks `price.edit`, writes its audit row in the same transaction, refuses cross-site and non-JSON, and answers codes from §8.4(d) | 4 route files, `lib/server/price-dashboard/price-dashboard-service.ts` | R1, M1 | M1's `apply-changes.ts`; `app/api/staff/kitchens/[id]/status/route.ts` (the guarded-body and `from` precedent); `lib/server/read-body-with-limit.ts`, `cross-site-request.ts`; ADR 0156 (limiter subjects) |
| **R3** publish, history, restore | `POST …/publish` (expected draft revision, label, note, provisional flag; the domain judges the candidate book whole first, `judgeBookAgainstCatalog`); `GET …/versions`, `GET …/versions/{id}`; `POST …/versions/{id}/restore` | 3 route files, service (mod) | R2, M2 | A-15; M2's `judge-book.ts`; frames D7A–G, D8A–C [mock L871-880] |
| **R4** item lifecycle and defaults | Activate or deactivate (into the draft, per OQ-2); delete (unused only, `canDelete`); create a hardware class (inactive at creation [mock L693]); `GET` usage counts; `GET`/`PUT` defaults (immediate, audited); the mint and generation pass the saved defaults into H2's request | about 5 route files, service (mod), the mint path | R3, M3, S3, H2, X1 | A-9; OQ-2/3 answers; M3's files; ADR 0111 (the mint path); `generation/shell-design.ts` (H2's request type, read only) |
| **R5** customer notice and sent state | `GET /api/designs/{id}/price-notice` (whether to show C1, removed accessories, `isSent`); `POST …/price-notice/acknowledge`, authorised exactly like a save (write token or owning account), never moving `revision` | 2 route files, `lib/server/price-notice.ts` | R1, P4, S1 | A-11; P4's `price-change-notice.ts`, `replacements.ts`; ADR 0114 (visitor cookie), ADR 0172 D8 (a claimed design on any device); `lib/server/load-owned-design.ts`, `write-token.ts` |

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
- **R-c:**
  - every R2–R4 write has exactly one audit row;
  - if the audit write fails, the change is absent and the answer is `503`;
  - an operator session (no `price.edit`) gets `403` on every price route and sees no catalogue nav.
- **R-d:**
  - publish with a stale draft revision gives `409 changed-meanwhile`;
  - a book the domain refuses is never stored;
  - after publish, the next customer page load prices at the new version.
- **R-e:**
  - acknowledging a notice never changes `designs.revision` (asserted against the store);
  - a share-link (`/s/<token>`) viewer is never shown the notice and cannot write it.

**QA reading:** the base reading plus `apps/web/tests/api/staff/**` and `tests/price/**`. **Review reading:** logic:
§5 and the routes; security: ADR 0019, 0153, 0156, 0161, 0172 D7, 0173; clean-code: the diff.

### Lane U — Dashboard UI D1–D9 (Light + visual; U5 Full, because it publishes)

**Base reading:** the mockup frames named in each row, with their notes; the brief `…-v2-update.md`, `…-v2-fixes.md`,
`…-v2-fixes-2.md`; `docs/design/mockups/Lemnaria Cont Lot 3.dc.html` (the staff shell); `apps/web/src/staff/staff-shell.tsx`, `staff-kitchens-list.tsx`; §8.4(d); `docs/best-practices/browser-and-visual-qa.md`.

| Wave | Must-fix items | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **U1** shell and list | (1) D1C/D1D: menu groups (Catalog: Dulapuri, Feronerie, Materiale, Accesorii, Setări implicite; Prețuri: Publicare prețuri with its count; Clienți), with role-hidden items and "Nu ai acces la această pagină" for a direct address; (2) D1M mobile menu sheet; (3) routes and the `proxy.ts` family `/[locale]/staff/catalog/**`; (4) D2A/D2B list: groups, cabinet SVGs, chips (Modificat, Furnizat de client, Structural, Inactiv), search, "Doar modificate", empty search, pending price shown beside the active one; (5) D2M cards | `staff-shell.tsx`, `staff-nav-sheet.tsx`, `staff-paths.ts`, `proxy.ts`, `price-dashboard/cabinet-list.tsx` (and its page) — **over five; the mini-review is stated** | T1, X0 | Frames D1A–D1M, D2A, D2B, D2M, D2R [mock L839-855]; ADR 0173 P-L3-2 (the route family) and P-L3-9 (shell departures); `apps/web/src/proxy.ts`; `staff-paths.ts`; `docs/design/mockups/cabinets/` |
| **U2** list editing | D2C inline anchor edit (Enter saves to the draft, Esc cancels, the error stays in the field with `aria-invalid` and `role=alert`); D2E1–3 depth-rule card (0–100, four error variants); D2D bulk-% dialog (scope, preview counts, focus on the % field) | `cabinet-list-inline-edit.tsx`, `depth-rule-card.tsx`, `bulk-change-dialog.tsx`, `use-price-draft.ts` | U1, M2 | Frames D2C, D2D, D2E1–3, D2ER [mock L848-853, L770-777]; A-14; M2's `bulk-change.ts`, `judge-book.ts` |
| **U3** cabinet detail | D3A–G and D3M1/2: read-only dimensions, fields per shape, the live sentence, the read-only hardware readout, the preview table (PAL/MDF/Furnir columns, *Cu feronerie*, *Adâncime 600/700* disabled for walls and customer rows with "Nu se schimbă la 700 mm"), save and cancel | `cabinet-detail.tsx`, `cabinet-price-fields.tsx`, `cabinet-preview-table.tsx`, page | U1, M2 | Frames D3A–G, D3M1/2, D3R [mock L856-866]; A-1, A-2, A-3, A-6; M2's `cabinet-preview.ts` (the only arithmetic allowed) |
| **U4a** hardware and accessories | D4A/B/C/D/E/F; D6A/B/C; disable and delete dialogs (initial focus on Anulează; Esc closes); a new class (inactive) | `hardware-list.tsx`, `hardware-edit.tsx`, `accessory-list.tsx`, `item-dialogs.tsx`, pages | U1, M3, X1; **OQ-4** (OQ-5 for the fourth column) | Frames D4A–F, D6A–C [mock L867-870, L686-712, L779-781]; ADR 0062 Amendment 3; OQ-2/3/4/5 answers; M3's `item-lifecycle.ts` |
| **U4b** materials | D5A–G, D5CM | `material-list.tsx`, `material-edit.tsx`, page | U4a (shares `item-dialogs.tsx`) | Frames D5A–G, D5CM [mock L869, L700, L783]; ADR 0071 note; A-16 |
| **U5** publish and history | D7A–G, D7M; D8A–C (archived read-only diff; restore puts the prices in the draft and never publishes) | `publish-page.tsx`, `publish-dialogs.tsx`, `version-history.tsx`, `version-detail.tsx` | U1, M1 | Frames D7A–G, D7M, D8A–C [mock L734-747, L871-880]; A-15; ADR 0072 Amendment (customers never see versions) |
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
- **U5-a:**
  - publish is disabled when the draft equals the active book (D7D);
  - turning "Sume provizorii" off needs the checkbox (D7C);
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
| **K1** rules | (1) digest eligibility (A-13, on facts: `sentAt`, status, seen and digested instants, a changed flag computed in SQL); (2) the digest model (subject count, rows, footer facts); (3) the Europe/Chisinau day key | `staff-changes/digest-eligibility.ts`, `digest-model.ts`, `chisinau-day.ts` | MP-0. **Merge waits for OQ-9** | `staff/request-status.ts`; frame D10D's footer [mock L833, L828]; S-19 |
| **K2** server | `POST /api/staff/kitchens/{id}/seen` (displayed revision; `contact.read`; audit `kitchen-seen`; fail closed); the list API gains `changedSinceSeen`, `onlyChanged` and the changed count; the kitchen API gains the as-sent estimate (the stored `priced` total, never re-priced) and the current estimate (priced now, a refusal shown as no figure) | 2 routes (1 new, 1 modified), `staff-kitchens.ts` (mod), `staff-kitchen-actions.ts` (mod) | K1, S1 | A-12; S-18; ADR 0173 *Dated note 2026-10-22* (the `from` precedent: the page states what it saw); `app/api/staff/kitchens/[id]/status/route.ts`; the active book from R1 (if merged; otherwise the current estimate wiring is left to Z1, stated) |
| **K3** UI | D10A/C: badge, changed-first sort, "Doar modificate", the "Văzută … modificată din nou" sub-line; D10B: marks seen on open with the displayed revision, the "Trimisă"/"Actuală" switch (thumbnail, cabinet list with differing rows highlighted, no detailed diff), both estimates, status unchanged | `staff-kitchens-rows.tsx`, `staff-kitchen-filters.tsx`, `staff-kitchen-view.tsx`, `use-staff-kitchen.ts`, new `kitchen-version-switch.tsx` | K2, T1 | Frames D10A–C [mock L814-826]; `Lemnaria Cont Lot 3.dc.html` S2/S3; `staff-kitchens-list.tsx`, `staff-kitchen-page.tsx` |
| **K4** digest and counter | Cron `/api/cron/staff-change-digest` (`cron-auth`, claim the day, eligible list, send through the mail port, record entries); the HTML and plain-text message; recipients hold `contact.read` with a confirmed address; the customer's name from the profile, else the reference; the nav counter | cron route, `lib/server/mail/staff-change-digest.ts`, `vercel.json`, `staff-shell.tsx`/`staff-nav-sheet.tsx` (handoff), `use-changed-kitchen-count.ts` | K3, U1, S4; **OQ-10** | Frame D10D [mock L827-828]; A-13; S-21; `lib/server/mail/mail-sender.ts`, `lead-notification-html.ts` (the branded pattern); `lib/server/cron-auth.ts`; `app/api/cron/prune-rate-limits/**`; `vercel.json` |

**K acceptance:**

- **K1-a:** a property over random facts: eligible if and only if (changed) ∧ (not digested since last seen) ∧
  (`now − sentAt` < 30 days) ∧ (status ∉ {offer-sent, closed}). The 30-day boundary is exclusive at exactly 30 × 24
  h, a choice recorded in the wave.
- **K2-a:** opening the page with a revision older than the current one leaves the badge on. A non-staff session gets
  `403`. A seen write without its audit row is refused (`503`).
- **K2-b:** the as-sent estimate equals the stored snapshot's total byte for byte, after any number of publishes
  (ADR 0154).
- **K3-a:** D10C's cycle: changed, badge; open, gone; changed again, back. This is an e2e test against the fake store.
- **K4-a:**
  - two cron calls on one day send at most one e-mail;
  - a day with nothing eligible sends nothing;
  - a kitchen appears once per round;
  - must-not: the e-mail contains a phone number, a postal address or a request's personal column.
- **K4-b:** a mail-port failure leaves the round unrecorded, so the next day retries. A partial send is never recorded
  as complete (ADR 0164's single-guard lesson).

**QA reading:** K's base reading plus `apps/web/tests/staff/**` and `tests/mail/**`. **Review reading:** logic:
A-12 and A-13; security: ADR 0153, 0154, 0164, 0173, plus a read of the digest template; clean-code: the diff.

### Lane Q — Customer side (Q1 and Q3 Full; Q2, Q4 and Q5 Light; every wave visual)

**Base reading:** frames C1–C5 [mock L763-812]; `…-v2-fixes.md` §1 (C3); `…-v2-fixes-2.md` §2–3; ADR 0072
Amendment; ADR 0062 Amendments 3 and 5; ADR 0104 (chrome specification); `apps/web/src/price/**`, `settings/**`.

| Wave | Must-fix items | Prod files | Depends on | Reading (in addition to the base) |
| --- | --- | --- | --- | --- |
| **Q1** depth line and copy | (1) the depth line in the breakdown ("Adâncime 700 mm · +{percent} %"); (2) the settings depth control switches from `globalSettings.depthNote` to T1's `depthNotePriced`, with `{percent}` from the published rule. This is a component edit only; no message file is touched | `price-breakdown.tsx`, `price-breakdown-model.ts` (depth line only), `settings/global-settings.tsx` | T1; **built on P3's branch after P3's QA is green; merged with P3 at MP-3** | ADR 0100 decision 5 and Amendment; A-1; frames C3, C3D, C3S, C3R [mock L784-790] |
| **Q2** whole-kitchen handle row | C2: a "Mânere" row in the settings sheet (Bară inox / Bară neagră / Push-to-open) with its hint; the store applies `setKitchenHandle` | `global-settings.tsx`, `global-settings-model.ts`, `store/whole-kitchen-apply.ts` | **MP-3** (Q1 holds `global-settings.tsx` until then), H1, T1 | Frame C2 [mock L764-767]; ADR 0099; H1's command |
| **Q3** forced replacement and merged notice | C4A–C4D (a modal sheet, not dismissable except by ‹; first "Alege" focused; rows announced; "Prețul apare după ce alegi"; only remaining options, the disabled one struck through; nothing preselected; accessory rows informational); C4C confirmation merged with C1's sentence (the mockup's choice [mock L810]); C1 standalone when there is nothing to replace; acknowledging writes the marker | `replacement-sheet.tsx`, `use-price-notice.ts`, `price-notice-banner.tsx`, `price-bar.tsx` (mod), `whole-kitchen-tiers.ts` (disabled tiers hidden or struck) | P4, R5, T1 | Frames C1, C4A–D [mock L763, L792-811]; A-11, A-16; ADR 0072 Amendment *Consequence*; ADR 0062 Amendment 3; `whole-kitchen-tiers.ts:91-162` |
| **Q4** sent-kitchen note | C5A/C5AD: a closable, non-blocking note above the price when `isSent` | `sent-kitchen-note.tsx`, editor placement | R5, T1 | Frames C5A, C5AD [mock L805-807]; ADR 0062 Amendment 5, point 3; ADR 0165 |
| **Q5** lone colour and handle replacement | A disabled colour or handle as a sheet row; choosing replaces it at every level where it appears (A-16); "Culoarea a revenit la Alb" when a material change resets it | `replacement-sheet.tsx` (mod), `store/whole-kitchen-apply.ts` (mod) | Q3, Q2, H1 | A-16; ADR 0057, 0081, 0086, 0099; `chosen-finishes.ts`, `resolved-finish.ts` |

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
- **Q4-a:** the note never blocks editing or the price, and closing it hides it for that view only.
- **Q2-a, Q5-a:** as H1-a and H1-b, end to end in the browser.

**QA reading:** Q's base reading plus `apps/web/tests/price/**`, `tests/settings/**` and the e2e specs for the editor.
**Review reading:** logic (Q1, Q3): ADR 0100 decision 5, A-1, A-11, OQ-2; combined (Q2, Q4, Q5): the frames; visual:
§13.3.

### Lane Z — Integration and close

- **Z1:**
  - all lanes are merged;
  - `pnpm check`, then `pnpm ci:local` on a clean tree, are quoted;
  - the full e2e suite runs on mobile and desktop projects;
  - the visual pass of §13.3 is done;
  - every `[mock]` frame is reproduced or its deviation is recorded with a reason.
- **Z2:**
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
| RK-2 | **`UNKNOWN_TIER` while a replacement is pending.** A disabled tier is still in the book, but a surface that reads only `UNKNOWN_TIER` shows the generic failure, or a preset naming it (ADR 0062 seam 3, M7) half-applies | P4, Q3, preset application | A separate `REPLACEMENT_REQUIRED` code (P4-a). Consumers listed: price bar, account card, D10B, the contact route, presets. Preset application with a disabled tier fails in a stated way, which Q3 asserts |
| RK-3 | **The Russian copy is RU TBD.** Agent drafts could ship as approved | T1, Q, U | ADR 0095 d2: RU stays marked and never pinned. OQ-11 covers RO only |
| RK-4 | **The migrations are unapplied anywhere**, and a deploy before the owner applies `0025`–`0030` and their grants answers 500 or refuses every price | S, R1 | Nothing is deployed in M10. The runbook sections are written per wave. A-10's refusal path; the owner's seed step. STATUS carries the obligation |
| RK-5 | **Two price-book roots during the transition** (backlog 176): the customer reviews one price and the shop gets another | R1 | R1 runs before P3; criterion R-a |
| RK-6 | **Mid-session publish**: the client priced at version N, the server at N+1 | R1 | ADR 0157 d8's refusal (R-a); the client receives `versionId` with the book |
| RK-7 | **The D9 defaults leak into saved kitchens** through absent settings | H2, R4 | A-9; criteria H2-a and U6-a |
| RK-8 | **The P3 cut-over collides with the customer lane** | P3, Q | P3 holds the named web files until MP-3; Q1 is built on P3; Q3 and Q5 wait for P4 |
| RK-9 | **The mockup's arithmetic is copied** (rounded-width doors, additive C3 split) instead of the domain's | M2, U3 | M2-c and U3-a import P's functions; a sabotage proof is required |
| RK-10 | **The shared-file collision the owner named as the main risk** | all | §9.1's single owners; handoffs only at named merges; worktrees per lane; every brief carries the git ban and the base check |
| RK-11 | **Placeholders become approved figures** | P3, T1, U | §0; P2-f; copy never carries a figure; `amountsProvisional` stays true until the owner flips D7C |
| RK-12 | **The opaque revision gets arithmetic above SQL** | S4, K2 | A-12; criterion S-c |
| RK-13 | **Digest PII and recipients** | K4 | S-21; K4-a's must-not; security review |
| RK-14 | **ADR 0173 is still Proposed** | R, K | W0 lists its acceptance as owed; M10's audit rows follow P-L3-3 regardless |
| RK-15 | **Performance:** `pricesChangedBetween` and the D3 preview price many times; the active book is read per request | R1, Q3, U3 | Measure in Z1 at 390 × 844 on a large preset kitchen. **No figure is asserted until measured** (R4) |
| RK-16 | **The e2e and dev runs need an active book** | R1 | A-10's test seeding through the fake store; ADR 0151 (tests delete only rows tests added) |
| RK-17 | **Price-book versions are not backed up** | S6 | OQ-13; S6 before launch |

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
