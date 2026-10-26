# ADR 0176 — The manufacturer price dashboard is milestone M10 and starts now

Status: Accepted (owner instruction, 2026-10-26, relayed by the coordinator). **Nothing is built.** Branch `m10-price-dashboard`, local, not pushed.
Date: 2026-10-26
Type: Decision record (timing)
Milestone: M10 — [`M10-price-dashboard.md`](../milestones/M10-price-dashboard.md); W0 (records)

## Context

**Evidence tier: doc-quoted.** The owner's instruction is relayed by the coordinator (M10 plan §6.2, OQ-1); it is a
paraphrase, not a verbatim transcript. The earlier records are quoted from the files named. The scribe ran nothing.

[ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) (2026-09-02) ruled that the
manufacturer dashboard comes **after M8**: its Decision says "Nothing is built for the dashboard in M6, M7 or M8", and
its Amendments of 2026-10-25 (first, second, third, fifth) repeat "the dashboard still comes after M8".
[ADR 0072](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md) and
[ADR 0100](0100-depth-is-priced-by-a-dashboard-editable-multiplier-on-the-600-mm-base-and-it-is-deferred.md) and
[ADR 0175](0175-a-cabinet-is-priced-by-an-anchor-at-its-default-width-plus-steps-widths-and-heights-round-up-to-50-mm-and-prices-round-to-10-lei.md)
carry the same timing.
[ADR 0174](0174-the-owner-rulings-o-l3-1-to-o-l3-7-defer-the-price-and-translation-screens-and-fix-the-staff-request-line-the-notes-export-and-the-lot-3-copy.md)
O-L3-2 deferred the S6 *Prețuri* screen "under its own future record, which must name and supersede the timing in
ADR 0062 … and a redraw against the price book's real shape". `docs/STATUS.md` §2 still lists M8 as "In progress, not
done".

On 2026-10-26 the owner instructed that M10 be planned and implemented now, in parallel waves (relayed).

## Decision

1. **The dashboard is milestone M10 and starts now, while M8 is still open.** This supersedes the "after M8" timing of
   ADR 0062 (its Decision, and its Amendments of 2026-10-25 first, second, third and fifth, which repeat it). It does so
   explicitly: M8's open list in `docs/STATUS.md` §3 is not closed by this record and does not block M10.
2. **This record is ADR 0174 O-L3-2's owed record.** The redraw it required is the owner-reviewed final mockup
   `docs/design/mockups/Lemnaria Dashboard.dc.html` (committed `3d4d892a`). O-L3-2 is satisfied; the *Prețuri* nav item
   is shown from wave U1 on (M10 plan S-2). O-L3-3 (S7 *Traduceri*) is **unchanged**.
3. **Nothing ships mid-milestone.** No deploy, no push, unless the owner asks. Every M10 migration is unapplied
   anywhere, and no agent applies one to a provisioned database.
4. **Seams 2 and 3 of ADR 0062 and its "shapes seams now" intent stand.** What is superseded is the timing only.

## Alternatives considered

- **Keep the dashboard after M8.** Rejected: the owner instructed otherwise.
- **Start only the pricing-engine work and hold the dashboard.** Not taken: the owner asked for M10 as a whole, and the
  M10 plan orders the engine, the dashboard model, persistence, routes, UI and the customer side as parallel lanes.

## Consequences

- Dated notes in ADRs 0062, 0072, 0100, 0174 and 0175 and on backlog 277 point here.
- `docs/STATUS.md` gains M10 as **In progress, W0**; `docs/milestones/README.md` gains an M10 row.
- No amount or percentage is approved by this record or by M10's plan. Every figure in the mockup, the briefs and the
  sample book is a placeholder (ADR 0001 decision 4; ADR 0100 decision 2).
