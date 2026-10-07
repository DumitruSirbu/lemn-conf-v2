# ADR 0127 — Step 1's URL follows the typed room, and a late echo is still ours

Status: Accepted (owner-approved 2026-09-22)
Date: 2026-09-22
Type: Decision + Finding
Milestone: M7 — wave 7F1-D45 (original rule), wave 7F2 slice S3b (amendment)

## Context

Step 1's room screen writes the customer's typed room into the URL through a debounced
`router.replace`, and reads its own live sub-state back from `useSearchParams()` — the
convergence loop wave 7F1-D45 built to keep *Înapoi*/*Continuă* alive and the typed room intact
across a traversal (`docs/milestones/M7-room-and-presets.md`, *Wave 7F1-D45*). That rule has lived
only in the milestone's prose since 2026-09-14. Wave 7F2 slice S3b (2026-09-22) found and fixed a
defect in it — a late echo of an already-superseded write could still land after a newer keystroke
and silently restore stale text — and amended the rule in the same file. This ADR lifts the rule
out of milestone prose into the durable record, and folds in S3b's amendment, per
`docs/best-practices/documentation.md`'s instruction that business logic belongs in
`docs/decisions/`, not in a plan that goes stale the moment it ships.

**Decision-record sweep, done first, per `docs/WORKFLOW.md`:**

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [0111](0111-step-1-creates-the-design-through-the-existing-mint-then-save-and-the-room-entry-lives-in-the-url.md) decision 3 | The room entry lives in `/configurator/room`'s query string; back restores it, a reload keeps it. | **Left intact and is this ADR's premise.** Nothing here changes what the URL means; this record is about how the client keeps its own draft converged with it. |
| `docs/milestones/M7-room-and-presets.md`, *Wave 7F1-D45* (D45) | The original convergence loop: one `URL_SETTLE_MS` timer, a same-object echo contract, the departure flush-then-leave order, `Q-D45-1`…`Q-D45-5`. | **Superseded by this ADR as the durable record.** The milestone section is history; nothing in it is struck, since it accurately describes what 7F1-D45 shipped and what wave 7F2 found. |
| `docs/milestones/M7-room-and-presets.md`, S3b's *"the corrected rule"* / *"the two-history argument"* (2026-09-22) | The pruning-rule fix (oldest copy, not newest), F2/F3, R1.1/R1.2 (every departure empties the list). | **Lifted here verbatim in substance**, as decisions 4–8 below. |
| [0126](0126-the-rooms-lengths-are-typed-in-whole-millimetres.md) | The room's lengths are typed in whole millimetres; the URL keeps metres. | **Unrelated wire format, untouched.** This ADR's `URL_SETTLE_MS` and echo rule apply identically under either the metre or millimetre field grammar — S3b shipped after S1b and changed no line this ADR governs. |

No other decision record uses `D45`, `reconcile`, `echo` or `URL_SETTLE_MS` as of this sweep
(`docs/decisions` grepped 2026-09-22); this is the first ADR to carry the rule.

## Decision

**1. The draft is authoritative, and typing never re-seeds.** While the customer is typing, the
field's own state (`draftText`) is what renders. The URL is written **from** the draft, debounced;
it is never read back into a field that already holds a live, unconfirmed value **except** through
the one echo contract in decision 6. `useSearchParams()` supplies the *initial* state on mount and
the state after a `popstate`; it is not a second source of truth while the customer types.

**2. The 400 ms settle.** `URL_SETTLE_MS = 400`. A `router.replace` fires 400 ms after the last
keystroke that changed the draft, not on every keystroke — Q-D45-3's answer, unchanged since
2026-09-14 and unchanged by wave 7F2. The constant is named once and is inside every must-not-change
fence any wave dispatched against this module has carried.

**3. The traversal classification, and its accepted residue.** A browser Back gesture taken within
`URL_SETTLE_MS` of the last keystroke can leave that keystroke's write unflushed: the outgoing
history entry becomes unwritable the instant `popstate` fires
(`app-router-instance.js:146-160`, source-verified at Next 16.3.4), and a restore discards any
pending action rather than waiting for it. **This is the one loss the design accepts** — bounded by
exactly one constant (`URL_SETTLE_MS`), reachable only by a Back *gesture* (never a button, which
flushes before it navigates, decision 5), and at most a few characters, never a whole room, never on
a reload. Raising the ceiling narrows the window; it does not close it, and 400 ms was chosen, not
re-opened, by wave 7F2.

**4. The in-flight-write list, and what it is for.** The write effect registers every dispatched
`replace` in an ordered list before it fires, so that when Next's own commit later renders the URL
it wrote, the convergence loop can recognise its own echo rather than reading it as a foreign
arrival and re-seeding the draft from stale text. Without the list, an echo landing after a newer
keystroke would overwrite what the customer just typed with what they typed a moment earlier — the
defect 7F1-D45 exists to prevent.

**5. Every popstate, every departure, and every non-matching arrival empties the list.** A
`popstate` means no write of ours can still commit (Next discards a pending navigation before a
restore applies, decision 3), so the list is stale by definition; it is emptied. A departure —
*Înapoi* or *Continuă* leaving the room screen — also empties the list, **on every branch**,
per the S3b amendment (decision 8). An arrival that matches no entry in the list is treated as a
genuine external navigation and empties the list rather than being held against a text it never
matched.

**6. The same-object echo contract `use-typing-pause.ts` relies on.** When an arriving query's text
equals the current `draftText`, the draft is returned as the **same object reference**, not a new
one built from the arrival. `use-typing-pause.ts` depends on this: a new object reference on every
render of an unchanged value would restart its pause timer on every keystroke elsewhere on the
page, which would make the 400 ms settle never actually settle. This branch consults nothing else —
not the in-flight list, not `popstate` state — by design (decision 9, the forbidden discriminator).

**7. The corrected pruning rule — the list of writes not yet seen, and the two-history argument
[measured at wave 7F2 slice S3b, 2026-09-22].** When an arrival that changes `liveText` equals an
entry in the list, the **oldest** copy of that text and every entry before it are dropped;
everything after it stays, including any later copy of the same text. The rule as originally built
(`lastIndexOf`, pruning to the newest copy) loses a digit under a documented two-history race:
typing `3` then `6` dispatches writes for `"3"` (`A`) and `"36"` (`B`); if `A`'s echo lands after
`B`'s, pruning to the newest copy of `A` discards `B` from the list, and a later, genuinely later
echo of `A` re-seeds the draft from `A`, silently dropping the `6`. One input cannot have two
correct outputs from a pruning rule over text alone — keeping `B` (losing a digit) is the defect;
keeping a stale entry is not. The adopted rule trades a **stale entry** (harmless except in the one
residual case at decision 10) for the guarantee that **no write that can still echo is ever
forgotten**, under any in-order delivery, and that **every visible arrival that matches strictly
shortens the list**. Verified: the whole suite green at 44 files / 1,531 tests; QA's three model
orders (discard, mixed, commit race) clean at 3,000 runs each with backspace in the alphabet; the
knowable bound (the list is exactly the suffix after the oldest copy, after every matching arrival)
held under all three orders.

**8. Every departure empties the list — R1.1/R1.2, wave 7F2 slice S3b.** The original rule 4 said
*"arming a departure empties the list,"* but only the flush-and-arm branch of `departTo` did so;
the direct-push branch (`!liveQueryNamesARoom || liveText === draftText`) pushed immediately and
left the list full. Reproduced: type a value (write `A` in flight), clear the field back to the
live query's text, tap *Înapoi* (direct branch, list still `[A]`), let `A` arrive in commit-race
order — it is read as a kept echo, the write effect then sees `liveText !== draftText` and fires a
`replace` 400 ms later, which on a slow network discards the still-pending push: *Înapoi* silently
does nothing, D45's dead-button failure reached through the new branch. **Ruled: every departure
empties the list, on both branches of `departTo`, with no exception.** What shipped is a single
`forgetWrites()` call placed at the top of `departTo`, ahead of the branch split, covering both
branches — not two separate calls at each branch's tail. The coordinator accepted this as
satisfying the amendment's permission (decisions 9–10 below): the amendment allows `departTo` to
empty the list on both of its branches, and one call placed before the split discharges that
permission with less duplication than two calls would, while changing nothing else about the
branch conditions, the flush, or the observe-then-push order.

**9. `R-S3b-6` — do not tighten the pruning back to the newest copy.** A future reader may look at a
stale list entry, conclude it is a bound defect, and "fix" it by pruning to the newest copy again.
That reintroduces the original defect (decision 7). This record — specifically the two-history
argument — is the doc comment `writtenAfter`'s pruning function carries, and it is the reason this
paragraph exists here rather than only in a code comment: a later wave's reviewer should be able to
find the argument without opening `git blame`.

**10. Residual F3 — a popstate Next ignores, recorded under ADR 0118, not built for.** The list is
emptied on every `popstate` the room screen's own listener observes. Next's own router listener
returns early when `event.state` is null (`app-router.js:284-288`, source-verified), and in that
case Next keeps its own pending write rather than discarding it — so a list emptied on *that*
`popstate` can still forget a write that later echoes, which then re-seeds the draft and loses
whatever was typed during the round trip. **Trigger:** a `popstate` to a history entry Next did not
create on the room page — a fragment navigation (`#…`) or a foreign `history.pushState`. Nothing
under `apps/web/src` creates either (source-verified), and the room directory's lint ban forbids
the calls that would. **Revisit** if the room page ever gains a fragment link or a third-party
script that pushes history state. **Do not** fix it by reading Next's private `event.state`
contract — that was rejected (decision 11's alternatives).

## The same-object echo contract, restated as a boundary

The echo contract (decision 6) and the pruning rule (decision 7) are deliberately two different
mechanisms with two different jobs: the echo contract answers *"is this arrival the text I already
have?"* and never consults the list; the pruning rule answers *"is this arrival a write I sent and
am still owed a chance to recognise?"* and never touches `draftText`. Wave 7F2's reviewer named the
temptation to merge them — consulting the list from the `draftText` branch, or vice versa — the
**forbidden discriminator**, and it is guarded by dedicated sabotage tests in both directions
(`qa-7f1-d45-convergence.adversarial.test.ts`, S3b-4).

## Measured evidence: the bug predates 7F2

The late-echo defect this record's decisions 7–8 fix is not new in wave 7F2. It reproduces at
`89fb4ec`, the last commit before wave 7F2's slice S1 — a commit that predates this wave's own
first line of code — per the wave's own ground-truth measurement recorded in
`docs/milestones/M7-room-and-presets.md` (S3b's plan section, *"It predates 7F2: it is 7F1-D45's"*).
It was found and fixed inside wave 7F2 because slice S3b went looking for it, not because 7F2
introduced it.

## Alternatives considered

- **Prune to the newest copy on a match (`lastIndexOf`, as originally built).** Rejected — decision
  7; loses a digit under commit-race delivery, reproduced by QA's three model-sweep tests.
- **Empty the list on every echo, matching or not.** Rejected — 9 tests red, including QA's F1
  tests and the implementer's commit-race arm; it throws away writes that can still legitimately
  echo.
- **Never prune on an echo at all.** Rejected — 6 tests red, including the knowable bound and the
  traversal-without-`popstate` test; the list grows without limit and a stale entry never clears.
- **Remove only the oldest copy, keep every other entry, including later duplicates of the same
  text.** Rejected — the list only grows; 5 tests red including QA's exact-bound and re-seed tests.
- **A token per write, rather than text matching.** Rejected as impossible — the echo carries only
  the query, the query holds the canonical keys and nothing else (ADR 0111 decision 3, 7F1
  criterion 9), and `history.state` is Next's own private state, which this design does not read
  (decision 10's *do not*).
- **Read Next's `event.state` to distinguish a room-page popstate from a foreign one (F3's fix).**
  Rejected — it depends on an internal contract this project has already declined to read
  elsewhere in the same module, and F3 is bounded and unreachable today (decision 10).
- **Two separate `forgetWrites()` calls, one per `departTo` branch, exactly as the amendment's
  literal wording proposed.** Not rejected on the merits — accepted as equivalent and simpler by
  the coordinator, since a single call ahead of the branch split discharges the same permission
  (decision 8).

## Consequences

- `docs/milestones/M7-room-and-presets.md`'s *Wave 7F1-D45* and wave 7F2 slice S3b sections remain
  as the dated history of how this rule was found, built and amended; this ADR is the rule's
  durable record and the one a later wave should cite.
- `room-query-sync.ts`'s doc comments at the pruning function and at `departTo` should point readers
  here (already true post-S3b; not re-verified by this documentation pass — source-verified is left
  to whoever next edits that file).
- Any future change to `URL_SETTLE_MS`, the write-effect's conditions, the departure's
  flush/observe/push order, or the pruning rule is a decision against **this** record, not only
  against the wave that shipped it — it should be recorded here as an amendment, not silently
  overturned.
- F3 stays unbuilt, with its trigger and revisit condition recorded in decision 10, per ADR 0118's
  discipline for a problem that has not occurred.

## Addendum — 2026-10-06: why the write goes through the router and never `history.replaceState`

Filed under [ADR 0136](0136-code-and-test-comments-carry-only-what-nothing-else-can-and-history-lives-in-the-records.md)
decision 3. Evidence tier: **recovered from a code comment on 2026-10-06 (`room-query-sync.ts`), not
re-measured.** Cite as `see ADR 0127 decision 11`.

**11. The room's URL is written with `router.replace`, never `window.history.replaceState`.** The
native call updates the address bar and the client hooks without Next's own record of the history
entry following it, so on a browser Back the router restores the URL it recorded and the typed room is
gone. The comment calls this defect D4, "measured in a production build", and records that
`eslint.config.mjs`'s room block bans the native call so the mechanism cannot return. Going through
`router.replace` is what makes Next's record the URL intended. The debounce (decision 2) exists because
`router.replace` re-runs the page: the settle interval keeps a customer filling three fields to a
handful of requests where a per-keystroke write would spend one on every digit. **Where:**
`apps/web/src/room/room-query-sync.ts`.
