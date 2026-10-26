# ADR 0174 — The owner's rulings O-L3-1 to O-L3-7 defer the price and translation screens and fix the staff request line, the notes export and the Lot 3 copy

Status: Accepted (owner rulings, 2026-10-20; relayed by the coordinator). The records owed for O-L3-4 and O-L3-5 are **not** written here.
Date: 2026-10-20
Type: Decision record (owner rulings)
Milestone: M8B Lot 3 (staff area), wave L3-W0

**Evidence tier.** Doc-quoted from [`M8B-account-screens-lot3-plan.md`](../milestones/M8B-account-screens-lot3-plan.md)
§5.3, which records that each ruling was given directly by the owner through AskUserQuestion and relayed by the
coordinator. The scribe ran nothing. Nothing is built.

## Decisions

1. **O-L3-1, S3's request line: option (c).** The staff view shows the account's profile contact, the request's
   reference and date, and the as-sent kitchen. **ADR 0153 d1 is unchanged**: the application role still reads no
   personal column of a request.
2. **O-L3-2, S6 Prețuri is deferred.** It is deferred under its own future record, which must name and supersede the
   timing in **ADR 0062** ("the dashboard comes after M8"), and a redraw against the price book's real shape. The
   "Prețuri" nav item is not shown. ADR 0062 stands until then. That record and the redraw are owed and unscheduled.
3. **O-L3-3, S7 Traduceri is deferred.** It needs its own record answering **ADR 0095 decision 2** (copy in message
   files, build-time completeness and ICU gates) at run time. The "Traduceri" nav item is not shown. ADR 0095 stands.
   Unscheduled.
4. **O-L3-6, notes join the client export** (text and date, no staff author). The S3 line drops the erasure clause and
   reads "Notele fac parte din datele clientului: apar în exportul datelor clientului." This amends the scope of O4
   (Lot 2 plan §9) for notes only; wave L3-S9 is unconditional.
5. **O-L3-7, Lot 3 copy is pre-approved as drafted**: Romanian and Russian copy, the status list ("Nouă → Contactat →
   Ofertă trimisă → Închisă") and the invitation e-mail, as O28b did for Lot 2. New leaves enter the copy lock marked
   `Drafted`; Russian stays an agent draft, never pinned (ADR 0095).

## Rulings recorded elsewhere, deliberately not decided here

- **O-L3-4** (narrow `INSERT (role)` grant, no `UPDATE (role)`, no invitation to an address that already has an
  account) reverses ADR 0172 D7's position on role writes. **No decision record exists yet.** D7 stands until one does;
  waves L3-S12a, L3-S12b, L3-U8 and L3-U9 stay outline until it exists and a security review has read it.
- **O-L3-5** (the application may `UPDATE` only `status` and `sort_position` on `presets`; Step 1 follows the
  administrator's order) reverses `0011`'s "the owner hides by hand" and supersedes ADR 0112's "newest first". **No
  amendment exists yet.** Waves L3-S10, L3-S11 and L3-U7 stay outline until it exists and a security review has read it.

## Dated pointers, 2026-10-21

- O-L3-1 (c) settles what the staff kitchen reader displays. ADR 0172 D11 records that its revisit trigger (a feature
  reading `accounts.email` with `contact_submissions.reference`) fired in wave L3-S4; remedy unbuilt, accepted.
- The owner's later ruling "Audit each list view + hard page limit" (2026-10-21) is recorded in ADR 0173 and does not
  alter O-L3-1 to O-L3-7.

## Consequences

- No ADR, migration or grant is changed by this record. ADR 0062, 0095, 0112, 0153 and 0172 keep their text.
- Residual risk the owner accepted with O-L3-4, as the architect stated it: the database cannot tie a role insert to an
  invitation; only the application's code and its review stop an injection from creating an administrator.

## Dated note, 2026-10-26: O-L3-2 is satisfied; O-L3-3 is unchanged [doc-quoted from `docs/milestones/M10-price-dashboard.md` §4 S-2, S-4; relayed owner answer; nothing built]

- **O-L3-2.** The record it required now exists: [ADR 0176](0176-the-manufacturer-price-dashboard-is-milestone-m10-and-starts-now.md)
  names and supersedes ADR 0062's "after M8" timing, and the redraw is `docs/design/mockups/Lemnaria Dashboard.dc.html`.
  The "Prețuri" nav item is shown from M10 wave U1 on. The Consequences line above that ADR 0062 "keeps [its] text" is
  superseded as to timing only, by the same record.
- **O-L3-3 (S7 Traduceri) is unchanged.** On 2026-10-26 the owner (relayed, OQ-3) named it as where Russian comes from:
  "all the translations should be done through files and a separate functionality for this". Until it exists, a row the
  dashboard creates renders its Romanian in both locales ([ADR 0178](0178-the-m10-dashboard-storage-lifecycle-defaults-notice-seen-and-digest.md) A-21).
