# ADR 0062 — A manufacturer price dashboard comes after M8, and shapes three seams now

Status: Accepted
Date: 2026-09-02
Type: Decision
Milestone: Cross-cutting — constrains M6 wave 6B, notes M6 wave 6H, M7 and M8

## Context

The owner's direction of 2026-09-02: **after every currently-written milestone is finished** — after
M8, not during M6–M8 — the project gains a small manufacturer-facing dashboard.

In the owner's framing:

- Its **primary purpose is adjusting prices**: the manufacturer changes the price book without a
  developer.
- A **likely** second property is enabling or disabling a specific cabinet type. Phrased as *"I will
  think about"*, so it is probable, **not committed**.
- **Adding new cabinets is explicitly out of scope** for the dashboard, because it requires code
  changes, and the owner accepts that.

The instruction attached to it is precise: *take it into account during current milestone
implementation*. That is a licence to shape seams, not to build.

## Decision

**Nothing is built for the dashboard in M6, M7 or M8.** No admin UI, no auth, no write endpoints, no
schema, no feature flag, no data field. A session that finds itself specifying the dashboard inside
one of these phases has overshot this record.

What the phases owe is three seams, chosen because each is **cheap now and expensive to retrofit**,
and nothing else.

### 1. The price book must be substitutable, and its rules must be data (M6 wave 6B)

6B already specifies a versioned book read by a pure, fail-whole query, which is most of the way
there. It is **not sufficient**, on one point that would be very expensive later:

**The formula is a named shape whose coefficients live in the book — never a hand-authored function
per cabinet.** [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 8 requires
price to be a formula over width rather than a table keyed on sizes, and
`docs/CONFIGURATION_MODEL.md`'s pricing boundary requires the book to contain *"data, not code or
formula callbacks"*. Both hold at once only if the **shapes are code and the coefficients are data**.
If 6B implements "formula" as a function written per cabinet, then changing any price needs a deploy
— which is the dashboard's *primary* purpose, defeated at the seam, and unpickable afterwards
without rewriting every rule.

Two smaller constraints in the same family:

- **The book is a parameter, not an import.** The query takes it; nothing under `pricing/` imports
  the sample book except one composition root. A book from another source is then a substitution
  rather than a refactor.
- **One authority, one shape.** No amount, tier, delta or rule may exist outside the book — not in
  `catalog.ts`, not in `content/ro.ts`, not in a component. The 2E sheet's *"de la +9 000"* is book
  data rendered, not copy that happens to agree with a number.

  > **Correction — 2026-09-05, found by the M6 certification audit.** The prohibition above names
  > `content/ro.ts` and components, both `apps/web`. **The automated gate does not**:
  > `pricing-seams.test.ts`'s *"no amount, tier, delta or rule exists outside the book"* sweep
  > (`packages/configurator-domain/tests/pricing/pricing-seams.test.ts`) scans `SOURCE_ROOT`, which
  > resolves to `packages/configurator-domain/src` only — it cannot see `apps/web` at all. The web
  > side was verified clean **by hand** on 2026-09-05, not by this gate. The gap belongs to whichever
  > wave first rendered a price in `apps/web` (**wave 6C**); nothing here is retracted, only the claim
  > that a gate — rather than a person — was holding it.

  > **Note — 2026-10-12, M8 wave 8K ([ADR 0157](0157-the-contact-route-judges-every-request-first-stores-once-answers-one-code-per-kind-and-refuses-a-retry-across-a-change-of-book.md)
  > decision 8; the plan's *8K — S5: the route composed what two invariants reserve*).** "One composition
  > root" no longer describes `apps/web`. **The application has two roots, the browser's and the server's
  > (`lib/server/shipped-price-book.ts`), each named, and both name the same book;** the seam's test
  > asserts exactly those two paths and that the contact route names none. *Why:* the browser's root is a
  > client module and a route cannot read through it. **An interim, with its trigger:** two roots are two
  > substitutions; if one were changed alone, a customer would review one price and the shop would be sent
  > another, and nothing would catch it. **Before either root names another book they become one**, a
  > module both read (backlog 176). The earlier sentence stands for `packages/configurator-domain`.

**Not in tension with the sample-amount constraint.** The book is a *sample* book throughout M6 and
[ADR 0001](0001-initial-product-and-stack.md) decision 4's rule is unchanged: no commercial figure is
asserted anywhere in docs or code. Who may later edit a book is not a property of its shape, and
`status` remains a field on it.

### 2. Availability already funnels through one predicate; name it, and add nothing (M6 wave 6H)

Today a cabinet is offerable because its definition carries `insertable: true`, so availability is
implied by presence. The concern that a future flag would have no seam to land in, and that every
offer path would have to be found and edited, **does not hold** — measured, not assumed:

- `toInsertableBody` (`catalog.ts`) is the single funnel that turns a `BodyDefinition` into an
  offerable `InsertableBody`, on `definition.insertable !== true`.
- `listInsertableBodies` is its only bulk caller, and `offersFor` (`queries/offers.ts`) is that
  function's only caller.
- `resolveCatalogEquivalent` repeats the same test for the swap-equivalent path.

So availability is **two call sites testing one boolean**, not a sweep across offer paths.

**The decision is to name the predicate once, and to do it only where a wave is already open in that
file.** Wave 6H opens `catalog.ts` anyway; a single named predicate that both call sites use is
behaviour-preserving and removes the last way the two tests could diverge — this project's recurring
remedy for two constants agreeing by luck
([ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md)). **No flag, no data, no schema, no
default that means "disabled".**

**If it does not land in M6 that is fine and is not a reason to widen anything.** The retrofit cost
is two call sites, which is why this is recorded as a note rather than as a work item.

### 3. M7 and M8 each own one consequence, recorded in their own files

The seam that matters is not always in the phase that discovers it.

- **M7 — presets.** A preset recipe names build ids. If a cabinet type is later disabled, a preset
  referencing it must fail in a **stated** way rather than half-applying, so preset application must
  ask the availability predicate rather than assume presence.
- **M8 — a priced snapshot outliving its book.** M8 snapshots a price into a contact submission. The
  moment a manufacturer can edit the book, the pricing-version equality rule
  (`docs/CONFIGURATION_MODEL.md`: no "current" version fallback, no migration inside pricing) stops
  being theoretical: a design priced under a retired version must not be silently re-priced under the
  current one. M8 decides what happens instead.

  > **Note — 2026-10-25.** Answered for a saved kitchen's on-screen price by the
  > [ADR 0072 Amendment of 2026-10-25](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md):
  > a design is never priced under a retired version; it is re-priced under the current one, with a
  > one-time "prices updated" notice. M8's D7 (a contact submission keeps its snapshot) is not changed
  > by that amendment.

## Alternatives considered

- **Record nothing and let the dashboard phase retrofit.** Rejected for the formula shape
  specifically: per-cabinet functions cannot be edited by a non-developer at any price, and that one
  choice is made inside 6B whether or not anybody notices they are making it.
- **Build the seams properly now** — a flag, a book table, an editor abstraction. Rejected as
  exactly the overshoot the owner's instruction guards against, and as speculative: the second
  property is *"I will think about"*, not a commitment.
- **Put the notes only in M6's plan.** Rejected: M7 and M8 are separately planned files that a later
  session opens on its own, and a note in M6's plan is not read by whoever starts M8.

## Consequences

- Wave 6B carries three prohibitions rather than a feature, stated as what it must **not** do.
- Wave 6H may name the availability predicate as a behaviour-preserving item; it is not obliged to.
- `docs/milestones/M7-room-and-presets.md` and `docs/milestones/M8-review-contact-success.md` each
  carry their own note, dated, pointing here.
- This record exists to stop both failure modes: a future session building the dashboard early, and a
  future session being surprised by it.

## What the book row has gained since, so the dashboard inherits it rather than discovering it

Recorded here as an index, not as new decisions — each is ruled in its own record.

- **Display prose is a descriptor, and the book keeps the tier**
  ([ADR 0106](0106-the-price-books-display-prose-publishes-descriptors-and-the-book-keeps-the-tier.md),
  M6B wave 6B-f2). `TierIdentity` and `AccessoryRule` carry optional `nameKey`/`descriptionKey`;
  `name`/`description` stay **required** and stay the fallback, so a dashboard-authored row still
  renders. Amendment A adds that a keyed text may not restate an amount or a rule.
- **A row says who supplies the cabinet**
  ([ADR 0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md)
  decision 2, 2026-09-10). `CabinetPriceRule.suppliedBy` is optional; absence means the manufacturer
  builds it, so a new dashboard row is cabinetry until somebody says otherwise. A row declaring
  `customer` **must** price to nothing and `parsePriceBook` refuses a book that breaks that — which
  is the rule a dashboard's validation inherits, not a screen-level special case.

## Amendment — 2026-09-11: an owner-directed exception for the preset library

The owner asked on 2026-09-11 for an owner-only **"save as preset"** tool in M7 — a button, an
authentication step, a write endpoint, a table and a feature flag, the five things *Decision* rules
out *"for the dashboard"* in M6–M8. The preset tool is not the price dashboard, and nothing here moves
the dashboard, which still comes after M8. The exception, its gate and its security review are
[ADR 0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md), whose gate is
shaped so the dashboard can later absorb it rather than run beside it.

## Amendment — 2026-10-25: dashboard scope confirmed and extended

**Evidence tier: owner ruling 2026-10-25, coordinator-relayed.** Code facts below are
**source-verified by the coordinator**, not re-read by the scribe. Nothing is scheduled by this
amendment: the dashboard still comes after M8 and *Decision* (nothing built in M6–M8) stands. The
design brief is `docs/design/claude-design-brief-cabinet-price-dashboard.md`.

- **Enable / disable a cabinet type is now a stated future plan, deliberately postponed.** The
  *Context* wording "I will think about" is superseded: it is no longer merely probable. The owner
  postponed it on purpose, because disabling must both hide the cabinet from the customer's list *and*
  stop the generator from ever placing it, a change the owner recognises as large. **Default when
  built: everything enabled.** Seam 2's predicate note stands; it covers the offer list and does not
  cover the generator.
- **Dashboard scope confirmed.** **Prices are editable.** Cabinet characteristics (sizes) are **shown
  read-only**: default width, minimum and maximum width, height and the like. Editing sizes (minimum
  and maximum width, maximum height, default width and height) **may come later, not now**. **Adding
  new cabinet types stays out of scope.**
- **New scope: a "default settings" screen** where the owner edits the whole-kitchen defaults a new
  kitchen starts with: material tier, hardware tier, cabinet depth (600 or 700), kitchen colour, and
  **handle** (plus the top row's push-to-open). **Changing a default never changes an already-saved
  kitchen.**
- **New configurator feature requested, not scheduled: a whole-kitchen handle choice** in the
  customer's global settings sheet, applying the chosen handle to every cabinet that takes one. Today
  handles are per cabinet only: `HandleSchema` (steel, black, push) in
  `packages/configurator-domain/src/design.ts`, default `steel` in `queries/describe-selection.ts`
  (source-verified by the coordinator). Recorded as requested; no wave, no owner (backlog 278).
- **The dashboard is desktop-first.**
- **Seam 3, M8 bullet:** answered for a saved kitchen by the ADR 0072 Amendment of 2026-10-25 (see the
  note under that bullet).

## Amendment — 2026-10-25 (second): how the dashboard edits prices

**Evidence tier: owner rulings 2026-10-25, coordinator-relayed.** Nothing is scheduled; *Decision*
(nothing built in M6-M8) stands. The first amendment above fixed the dashboard's scope. This one fixes
its editing model.

- **The design is v2** (provenance: `design-source/price-v2/Lemnaria Dashboard v2.dc.html`, untracked,
  never imported). v2's bottom-up cost model (board m² × rate, edging per metre, labour, extras) is
  rejected, and so is v1's raw-coefficient editor. The owner of v1: "I really want to be able to edit
  the prices efficiently, and most or nearest to the existing methodology… the V1 I don't like at
  all."
- **A cabinet is edited as an anchor plus steps**, with odd widths and heights rounding up to 50 mm
  and prices rounding to 10 lei:
  [ADR 0175](0175-a-cabinet-is-priced-by-an-anchor-at-its-default-width-plus-steps-widths-and-heights-round-up-to-50-mm-and-prices-round-to-10-lei.md).
  The new formula shapes it needs are code, so the dashboard cannot ship them as data alone (seam 1).
- **Material is a percentage**
  ([ADR 0092 Amendment](0092-hardware-prices-three-mechanisms-and-a-sink-carries-two-extras.md)) and
  **depth 700 is priced now**, as one percentage
  ([ADR 0100 Amendment](0100-depth-is-priced-by-a-dashboard-editable-multiplier-on-the-600-mm-base-and-it-is-deferred.md)),
  edited in a "Price rules for all cabinets" card at the top of the Dulapuri screen. That supersedes
  *"depth stays deferred"* wherever the brief says so.
- **Editing efficiency.** The default-width (anchor) price is **editable inline in the cabinet list**.
  A bulk **"change prices by %"** action covers all cabinets, one group or a selection, and scales
  anchors, steps and per-size prices. **Both write to the draft ("De publicat"), never straight live.**
- **Deactivating or deleting something saved kitchens use must be designed properly.** This covers a
  material, a hardware class and an accessory. The design blocks deleting a used hardware class but has
  no warning for deactivating one in use; the owner wants that warning designed again.
  **Proposal, pending owner confirmation, not ruled:** a deactivated item is hidden from new choices
  while saved kitchens that use it keep being priced with it, so they do not fail with `UNKNOWN_TIER`
  (the consequence recorded in the ADR 0072 Amendment). **Ruled:** deleting stays blocked while the
  item is used. Backlog 285.
- **Enable / disable of cabinet types is unchanged**: a future plan (backlog 279).

## Amendment — 2026-10-25 (third): deactivation ruled; the proposal above is superseded

**Evidence tier: owner ruling 2026-10-25, coordinator-relayed (paraphrased; short phrases quoted).**
This **supersedes the deactivation proposal** in the second Amendment above (ruling 8: "a deactivated
item … keep being priced with it"), which stays above as written and is **no longer the intended
behaviour**. Nothing is scheduled.

1. **Price changes always apply to every kitchen, sent ones included.** Owner: "let's keep it like it
   now. Every time a price change will change the price of all the kitchens." *Considered and rejected
   for now:* freezing the price of kitchens that were sent, or later marked reviewed or "taken into
   manufacturing". *Possible future trigger:* a status such as "taken into production".
   Context, **my reading of ADR 0154, checked against its text** (decision 8, "It is the stored review
   printed … prices nothing … a snapshot whose stored total is changed prints the changed figure"): the
   shop's notice prints the stored review and is never priced again, so the manufacturer keeps the price
   as sent while the customer's view re-prices.
2. **Deleting an item that any saved kitchen uses is forbidden**; allowed only when no kitchen uses it.
   "Deleting no, disabling yes."
3. **Disabling a used item is allowed** (material, colour, hardware class, handle, accessory). The
   dashboard warns before disabling, with the count of kitchens that use it. A customer opening a saved
   kitchen that uses a disabled item gets a notice that the item "is not available anymore" and is
   **required to choose a replacement** from the remaining options. The relevant global setting opens
   showing only the remaining options; the price recalculates after the choice. Owner: "if the
   manufacturer can['t] offer this, it's nonsense to keep it for the old kitchens." The notice is a
   note to choose from existing options, not advice, and lists the options that remain.
4. **Consequence.** The mandatory choice resolves the `UNKNOWN_TIER`-on-open issue in the ADR 0072
   Amendment. **Open points for the architect (inference, not ruled):**
   - ~~Until the customer chooses, the kitchen has no price. Should the price wait for the choice, or show
     at the default tier?~~ **Ruled 2026-10-25, owner (coordinator-relayed):** the price is hidden until
     the customer has chosen a replacement for every disabled item. Owner: "you can hide the price until
     customer choose a replacement."
   - ~~An accessory (for example the sink extras) may have no alternative. Is it then simply removed, with
     a notice?~~ **Ruled 2026-10-25, owner (coordinator-relayed):** yes. A disabled accessory is removed
     from the kitchen with a notice to the customer; there is nothing to choose instead. Owner: "when the
     accessory is removed, when you switch it off, it's just removed from the kitchen with the notice."
   - A colour disabled on its own overlaps [ADR 0057](0057-a-material-change-resets-an-unavailable-finish.md),
     ADR 0081 and ADR 0086 on resetting an unavailable finish. Cross-reference only; not re-decided here.
   - ~~Can a submitted kitchen be edited at all after submission? Not established: I did not find it in
     ADR 0158 or M8 with the searches I ran; the architect should check.~~ ~~**Ruled 2026-10-25, owner
     (coordinator-relayed):** yes; a kitchen the customer has sent to the shop stays editable and edits
     are not blocked. Owner: "we shouldn't block the edits… non-blocking the edits." It follows that the
     mandatory-replacement prompt also appears on sent kitchens. Checked for a conflicting lock in M8's
     plan and ADRs 0150 and 0158: none found (see backlog 285).~~ **Reversed the same day: see the
     fourth Amendment below. A sent kitchen is locked.** **Reversed again the same day: see the fifth
    Amendment. There is no lock; the original answer (a sent kitchen stays editable) stands.**
   - ~~**Open point for the architect (inference, not ruled):** editing a sent kitchen does not change what
     the shop received, which is the stored review (ADR 0154 decision 8). Should the customer be told
     that their changes are not sent until they send again, and is re-sending supported?~~ **Dissolved by
     the fourth Amendment:** a sent kitchen is not edited, so nothing is lost between an edit and the
     shop's stored review.

Backlog 285.

## Amendment — 2026-10-25 (fourth): a sent kitchen is locked; to change it, create a copy

**Evidence tier: owner ruling 2026-10-25, coordinator-relayed (paraphrased; short phrases quoted).**
This **reverses the "sent kitchens stay editable" answer** in the third Amendment above (kept there,
struck through). Nothing is built or scheduled.

Owner: "you just don't provide the ability to edit it… we can introduce like creating from this one…
somehow we need to freeze this, because it can be that client will edit something that shouldn't. So just
a notification, please wait the answer from the manufacturer, in case that it sends the form or call
directly and point us to your kitchen design to get a consultation."

**Reversed later the same day: see the fifth Amendment below. There is no lock.** The text of this
Amendment is kept, struck through.

1. ~~**A sent kitchen is locked.** From the moment the customer sends it, and through and after review by
   an operator or administrator, the customer cannot edit it. **Flag for confirmation:** the owner's
   wording is ambiguous between "locked from sending" and "locked once reviewed". **The coordinator's
   reading is "locked from sending"**; it is not confirmed.~~
2. ~~**To change it, the customer creates a new kitchen from it** ("creating from this one"): a copy that
   is editable and not sent.~~
3. ~~**A sent kitchen shows a notice:** wait for the manufacturer's answer; to discuss it sooner, call the
   shop directly or refer to this design when asking for a consultation.~~
4. ~~**What this replaces:** the re-send open point. Editing a sent kitchen no longer happens, so nothing is
   lost between the edit and the shop's stored review (ADR 0154).~~

**Open points for the architect and owner (inference, not ruled):**

- ~~**What price a locked sent kitchen shows.** The coordinator recommends no estimate at all, just
  "Prețul final îl primești de la producător". That avoids showing an old price (the owner's concern in
  the [ADR 0072](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md) Amendment) and
  pricing a disabled item the customer can no longer replace.~~ **Resolved by the fifth Amendment:** a sent
  kitchen shows the current price.
- ~~**What the mandatory-replacement sheet does on a locked kitchen.** The coordinator recommends no sheet:
  the item shows as unavailable, with "Creează o copie" to choose a replacement there.~~ **Resolved by the
  fifth Amendment:** the sheet appears as on any kitchen.
- **Who can review.** An operator or an administrator. Roles are outside the dashboard's current scope.
  **Carried over, still open** (fifth Amendment).
- ~~**The review status itself** (sent, reviewed, and maybe "in production") does not exist yet. It is new
  work for the "Bucătării clienți" area.~~ **Ruled by the fifth Amendment** (four statuses, set by hand);
  still not built.
- ~~"Locked from sending" versus "locked once reviewed".~~ **Dissolved:** there is no lock.

~~**Conflicting text found, not edited here** (path and line, read today): ADR 0165 lines 41-42 and 48-52
(the done page's link "opens for editing … in this browser", Q-8V-2 = yes);
`docs/OWNER_FIXES.md` lines 373-377 (Q-F3-9: a hidden sent kitchen "cannot edit it later", which implies a
sent kitchen is editable until hidden).~~ **No longer conflicts** (fifth Amendment). The M8 plan: I found no
text that lets a customer edit a sent kitchen (searched for edit/sent phrasings; the one near hit, line
11318-11325, is about resending the form for an unchanged kitchen). Backlog 286, 285, 277.

## Amendment — 2026-10-25 (fifth): no lock; a sent kitchen stays editable, and the shop is told what changed

**Evidence tier: owner ruling 2026-10-25, coordinator-relayed (paraphrased; short phrases quoted); the
code facts in ruling 4 were source-verified by the coordinator, not re-read by me.** This **reverses the
fourth Amendment above** (kept there, struck through). The owner approved the coordinator's
recommendations in full. Nothing is built or scheduled.

Owner: "the most important part of the tool, the creating of the lead, the connection with the
manufacturer and the starting on the project, will be achieved… This is 100% the goal of the tool, not
keeping it always up to date… At the moment when the client sends his details, it's already a win."
Before anything is built, the shop calls the customer and holds a measurement day; after that the
configurator design no longer matters.

1. **No lock.** A sent kitchen stays editable. There is no "create a copy" action. ADR 0165's done-page
   link that opens the design for editing stays as it is. The conflicts the fourth Amendment listed
   (ADR 0165 lines 41-52, `docs/OWNER_FIXES.md` Q-F3-9) are **therefore no longer conflicts**.
2. **A sent kitchen behaves like any other.** It shows the current price (the ADR 0072 Amendment) and gets
   the mandatory-replacement sheet for disabled items (third Amendment).
3. **Soft, non-blocking note to the customer on a sent kitchen:** „Ai trimis deja această bucătărie.
   Modificările se văd și la noi, dar spune-ne la telefon dacă e ceva important.”
4. **"Changed after sending".** Code facts (coordinator, source-verified): `designs.revision` is
   incremented on every save (`packages/persistence/src/migrations/0004_add_design_revision.sql`);
   `contact_submissions` stores the design snapshot, the priced snapshot and `design_revision` at sending
   (`migrations/0008_create_contact_submissions.sql`); only the latest design document is kept, with no
   history of earlier versions. Rules:
   - "Changed after sending" means `designs.revision` > the submission's `design_revision`.
   - New: a per-submission **seen revision**. An operator or administrator opening the kitchen in the
     dashboard ("Bucătării clienți") records the current revision as seen.
   - A kitchen whose revision is greater than its seen revision shows the badge „Modificată după ce ai
     văzut-o", and a counter appears in the dashboard menu. Always on; not considered spam.
   - The kitchen page shows the sent snapshot and the current version side by side ("Trimisă" /
     "Actuală").
5. **Email digest to administrators and operators:**
   - at most one per day;
   - sent only if at least one kitchen changed since the previous digest; nothing new, no email;
   - each kitchen appears once per round of changes, and again only after it has been seen and changed
     again;
   - a kitchen drops out of the emails 30 days after sending, or as soon as its status becomes „Măsurare
     programată" or „În producție", whichever comes first; after that it shows the dashboard badge only.
6. **Statuses, set by hand by operators:** Trimisă → Văzută → Măsurare programată → În producție. Roles
   are still outside the dashboard's current scope, so **"who can review" carries over as open**.
7. **Freezing prices stays postponed** (third Amendment). „În producție" is now a concrete status a future
   freeze could hang on.

**Reconciliation note, 2026-10-25 (coordinator, source-verified on `main` at 0910dc06; pending owner
confirmation):** points 5 and 6 were ruled without knowing that `main` already ships staff request statuses
(ADR 0173 P-L3-8; `apps/web/src/messages/ro.json`: *Nouă / Contactat / Ofertă trimisă / Închisă*). The
recommendation carried into the design brief: keep the shipped statuses, add none; "seen" is a separate marker,
not a status; the digest stops at 30 days or at *Ofertă trimisă* / *Închisă*. Also note ADR 0174 O-L3-2 defers
the S6 *Prețuri* screen until a record supersedes this ADR's timing and a redraw against the price book's real
shape exists — ADR 0175 and the v2 dashboard briefs are that redraw's input, but the superseding record is not
yet written.

**Open points for the architect (inference, not ruled):**

- Where the seen revision and the status live: columns on `contact_submissions`, or a new table.
- The digest's sending time and its provider (ADR 0154's mail port).
- Whether the digest's 30-day window counts from the first sending or the last.
- A kitchen sent twice has two submissions: which seen revision applies.

Backlog 286 (rewritten), 285, 277. Cross-references only: ADRs 0150, 0154, 0165.

## Amendment — 2026-10-26: M10 starts now; availability is immediate; the owner's answers to the open points

**Evidence tier: owner answers of 2026-10-26, coordinator-relayed (quotation marks hold the owner's words as relayed, not a
verbatim transcript); doc-quoted from `docs/milestones/M10-price-dashboard.md` §6.1 and §4. Nothing is built.**

1. **Timing superseded.** The "after M8" timing of the Decision and of every Amendment above is **superseded by
   [ADR 0176](0176-the-manufacturer-price-dashboard-is-milestone-m10-and-starts-now.md)** (OQ-1): the dashboard is milestone
   M10 and starts now, while M8 is open. The earlier text is kept.
2. **OQ-2, availability is immediate.** Owner: "switching off, it's not the pricing changes, so it should take effect
   immediately." Disabling and enabling a catalogue item is written on save, outside the draft. This **supersedes the
   deactivation-goes-through-publish text of the fix-round briefs** (`…-v2-fixes.md:75`, `…-v2-fixes-2.md:32`) and the
   mockup dialogs' "Intră în vigoare când publici". **Correction to the coordinator's brief:** that text is in the briefs
   and the mockup, not in this ADR or backlog 285. The second Amendment's "Both write to the draft" concerns inline anchor
   edits and bulk %, and stands. The third Amendment's mandatory replacement is unchanged. Record: ADR 0178 A-17.
3. **OQ-3, Romanian-only authoring.** Owner: "all the translations should be done through files and a separate
   functionality for this … need only to set the title … in Romanian." Created rows carry Romanian only; keyed rows are
   read-only. ADR 0178 A-21; note on ADR 0106.
4. **OQ-4, linked accessories.** Owner: "keep this link between accessory and a type of cabinet, and now we need only the
   functionality of adding this link between them on creating a new accessory." **The reading that creating a new accessory
   linked to a cabinet type is in scope is the coordinator's, flagged as OQ-4a and open for the owner.** ADR 0177 A-19.
5. **OQ-7, OQ-9, OQ-10.** Whole-kitchen handle: nothing changes from the recommendation. The status reconciliation (the
   note above) is **accepted**: Nouă / Contactat / Ofertă trimisă / Închisă, the digest stops at *Ofertă trimisă* or
   *Închisă*. The digest runs at 08:00 Europe/Chisinau and counts 30 days from the first send. ADR 0178 A-12, A-13.
6. **The fifth Amendment's open points for the architect are answered** by ADR 0178 A-12 and A-13 (storage in its own
   table; the seen marker shared by all staff; the 30 days from the first send; both submissions of a twice-sent kitchen
   name the same design). "Who can review" is answered by the existing capabilities (`contact.read` for D10, `price.edit`
   for prices); the owner confirms at close (plan OQ-14).
7. **Seam 1, dated note (S-28).** Seam 1 says an array of accessories "would let a book declare one nothing implements".
   ADR 0177 A-19 adds a list of linked accessories whose rows share **one** implemented earning shape, so no entry can
   declare behaviour the code lacks. The intent is preserved, not overturned; the two built-ins stay named fields.

