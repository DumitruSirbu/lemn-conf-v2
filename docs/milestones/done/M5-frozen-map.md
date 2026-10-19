# M5 waves 5G and 5H — the frozen map is bounded, and it is recorded whole

> **STATUS: Both waves complete, 2026-09-02.** Two waves appended to M5 (5E remains M5's only open
> wave — see `M5-width.md`). Full records: **ADR 0052** (5G) and **ADR 0053** (5H). `docs/STATUS.md`
> carries the current summary and verified test counts. This file is trimmed to a pointer; the design
> reasoning, the acceptance-criteria tables and the decision sweep now live only in the ADRs and in
> git history.

## Wave 5G — 800 mm is the ceiling on any empty column

**Complete, 2026-09-02.** Closed Q5 (M5's own open question since ADR 0035 decision 7: does shrinking
a column have any ceiling at all). `MERGE_CAP_MM` and the bound a shrink's release needs became one
constant, `MAX_EMPTY_COLUMN_WIDTH_MM = 800`; a shrink that would free more than the ceiling splits the
freed span into two columns rather than leaving one with no bound, preserving ADR 0037's "a span may
simply stay empty" while changing only how that space decomposes into columns. Schema version bumped
to 2, with a v1-document migration that splits an oversized stored entry rather than refusing it (the
document is executable, not invalid) and a v2 document with an oversized entry refused at both
seams. Full mechanism, the three rejected alternatives (refuse the shrink; cap and strand the
remainder), the migration-hazard measurement (5 rows in the application database at the time, 0
carrying an oversized entry), and every acceptance criterion with its falsifying mutant: **ADR 0052**.

## Wave 5H — the frozen map is recorded whole

**Complete, 2026-09-02.** Closed `docs/BACKLOG.md` entry 22: a column that still holds a member but
whose frozen extent its placements no longer imply used to diverge on reload (clear a column, insert
a smaller exact-fit body, reload — the column silently shrinks and its openings vanish). Fixed with a
second wire array, `columnExtents`, carrying the frozen extents of columns that do hold a member,
validated by precedence-plus-containment rather than the disjointness proof `emptyColumns` alone
relied on. This supersedes ADR 0044's rejected alternative ("store the whole frozen map" — rejected on
the premise that occupied columns are fully derivable from placements, which backlog 22 proved false).
A review round (adversarial QA, logic and security reviewers, independently) found the plan's
containment check alone was not sufficient — a stored extent could publish an opening through a
**neighbouring** column's real placements — closed by `findWallOverlaps`, a cross-column sweep added
in-wave. Full mechanism, the corrected disjointness proof, the two dropped clauses (depth, along-wall)
kept dropped for measured rather than assumed reasons, and every acceptance criterion with its
falsifying mutant: **ADR 0053**.

## Verification, both waves

`pnpm ci:local` (all nine gates), plus a full Playwright e2e run at each wave's close — required
because `docs/BACKLOG.md` entry 24 (closed 2026-09-02) is what let a red e2e suite sit unnoticed for
six days beforehand. Visual verification at 390×844, reporting measured void ids and dimensions before
and after a real reload rather than the plan's wording — both waves' full observation logs, including
md5-identical screenshots across the reload, are in ADR 0052 and ADR 0053.
