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

