# DOM-003 — splitting the width command

## Wave S12 — DOM-003

`packages/configurator-domain/src/commands/set-width.ts` was 1,663 lines declaring 45 functions,
20 file-local types and 5 file-local constants. Testing report `03-domain-model.md` records the cost
as a review-surface problem rather than a correctness one: changing one width rule meant reading
several phases that share file-local types and helpers, which is why plausible rule drift repeatedly
reached review during M5.

**This wave changed no behaviour.** Not a rule, not an ordering, not a rejection code, not a
floating-point result. Every function moved verbatim; the split is a re-filing of existing text.

### The module split

`setWidth` remains the single public command. Its signature, its result shape, and the four names
`commands/set-width.ts` exports are unchanged, so nothing outside the package can tell the split
happened.

| Module                       | Lines | Fns | What it owns                                                                                                    |
| ---------------------------- | ----: | --: | --------------------------------------------------------------------------------------------------------------- |
| `set-width.ts`               |   452 |   6 | Orchestration and result composition: `setWidth`, `columnWidthChoices`, `planColumnResize`, `fundColumnResize`, `applyColumnResize`, `resizedEffect`. |
| `width-resize-model.ts`      |   137 |   0 | **Types only.** The shapes the phases hand one another.                                                          |
| `resolve-column-members.ts`  |   200 |  11 | Who the resize moves: column membership, catalogue resolution, the ADR 0035 decision 6 member/hood split.        |
| `resolve-column-width.ts`    |   216 |   5 | What width the column may take: extent, intersected sets and ranges, the hood floor, `refuseIllegalWidth`.       |
| `plan-width-funding.ts`      |   290 |   8 | Where the width comes from: the two-sided scan, the adjacent empty column, ADR 0035 decision 7's vacated strip.  |
| `apply-column-moves.ts`      |   229 |   7 | ADR 0031's arithmetic: `planMoves`, both move guards, `moveFrozenColumns`, the frozen keys.                      |
| `rebuild-resized-bodies.ts`  |   130 |   2 | `rebuild` (through `insertBody`'s own path) and `moveHood`.                                                      |
| `validate-width-result.ts`   |   137 |   5 | The two post-conditions: no opening over a body, no column drift.                                                |
| `along-wall.ts`              |    10 |   1 | `alongWallM`, needed by both the funding scan and the overlap check.                                             |

Totals: 1,663 lines / 45 functions in one file becomes 1,801 lines / 45 functions across nine. The
138 added lines are entirely import blocks and one header comment per module; **no function body,
signature, doc comment or constant was edited.**

Two seams are worth naming because they are the ones that make the rest possible:

- **`width-resize-model.ts` is types-only** — it compiles to `export {}`. Every phase is a pure
  function over those shapes, so the module they all import carries no behaviour and cannot become a
  place a rule hides. It is also what avoids an import cycle: `ColumnPlan` and `SetWidthInput` are
  produced by the orchestrator and consumed by the phases.
- **`along-wall.ts` is deliberately one function.** `alongWallM` is needed by the funding scan and by
  the overlap check, and neither is the other's natural home; a shared three-line module is honest
  where an arbitrary owner would not be.

### Evidence that nothing changed

Green tests are necessary and not sufficient, so three independent checks were run.

1. **Line-for-line reconstruction.** Every non-blank, non-import line of the pre-split file is
   present verbatim across the nine new files (`export ` prefixes normalised). The only lines that
   exist in the new tree and not the old are the nine module header comments. Nothing was dropped,
   reordered within a function, or reworded.
2. **A 20,280-call behaviour sweep, byte-identical.** `setWidth` was characterised over 27 worlds
   (the shipped kitchen plus one per placement cleared) × every placement × 26 widths from 100 to
   1000 plus off-grid, zero, negative and absurd values, together with 442 `columnWidthChoices`
   calls and the void-target, missing-target and bad-timestamp paths. Full results — design,
   effect, frozen column map, rejection code and params — were serialised deterministically before
   and after. Both dumps are 120.2 MB and hash identically:
   `057ce004c68012824760416f645d1ff1fdc6bfd9e0a0efe96df761ea5dd0b3f6`. The harness was temporary
   and has been deleted.
3. **Suites unchanged, and unedited.** No test file was touched by this wave.

### What the evidence actually rests on — review round, 2026-08-31

Review produced a stronger check than any of the three above and it is worth recording which one is
load-bearing. A brace-matching parser extracted every top-level declaration from both trees and
compared full text: **70 declarations before, 70 after, none missing, none textually different,
none new** — 45 functions, 20 types, 5 constants, byte-identical. That is stronger than check 1,
which permits reordering inside a function body. Review also closed the three routes by which
behaviour could still have moved without any line changing: the external import set matches exactly
both ways so every name resolves to the same declaration, all 70 names are distinct so nothing
shadows, each of the five constants landed in the only module that reads it so no cross-module
initialisation order exists, and the line accounting closes with no orphan top-level statement.

**The sweep is corroboration, not the proof.** It is non-vacuous for every phase the orchestrator
routes through — both funding-scan sides, the adjacent empty column, ADR 0035 decision 7's vacated
strip, the key-collision guard, hood handling, the phantom-opening check, and the `opens_a_gap`
fall-through — but it is not exhaustive, and the record should not imply otherwise.
`byFundingCapacity` is never invoked by it at all: its only call site is `abutting.sort(...)`, and
`Array.sort` does not call a comparator on a list of one, while every sweep world clears exactly one
placement. `emptyColumnExtent`'s undefined branch and `refuseFractionalCentres` need off-grid
geometry `DesignSchema` forbids; `refuseColumnDrift` and the `insertBody` backstops are
post-conditions the code itself argues are unreachable.

None of that weakens the result, because textual identity of a declaration holds whether or not
anything calls it. It does mean the 120.2 MB hash is the weaker half of the argument and should not
be quoted as though it were the whole of it.

### Commands run

| Command                                            | Before                     | After                      |
| -------------------------------------------------- | -------------------------- | -------------------------- |
| `pnpm --filter @lemnaria/configurator-domain test`  | 61 files, 1041 tests passed | 61 files, 1041 tests passed |
| `pnpm --filter @lemnaria/three-adapter test`        | 33 files, 889 tests passed  | 33 files, 889 tests passed  |
| `pnpm --filter @lemnaria/configurator-domain lint`  | clean                      | clean                      |
| `pnpm --filter @lemnaria/configurator-domain typecheck` | clean                  | clean                      |

The §11 regression suites were also run as a named subset — the 23 test files that cite §11,
521 tests, all passing — so the regression table and the shipped-kitchen assertions are green on
files this wave did not edit.

### Tests were not moved, and why

The report asks that phase-specific tests move with the extracted functions. **There are none to
move.** `set-width.ts` exported only `setWidth` and `columnWidthChoices` before the split, so every
one of the ~1,000 assertions across `set-width*.test.ts`, `qa-w5c.*`, `qa-5d2b.*`,
`minimum-width.*`, `width-options.*` and the rest reaches the phases through the public command.
The extracted modules are internal and stay internal. Writing fresh unit tests against the new seams
would be new coverage, not moved coverage, and this wave was explicitly not the place to author it.

### What was deliberately left

- **The phase functions still take the whole `SetWidthInput`.** `refuseIllegalWidth`, `fundingScan`,
  `evaluateEmptySpace`, `vacatedEmptySpace`, `planMoves`, `rebuild` and `moveHood` each read two or
  three fields of it. Narrowing them to explicit values is the second half of DOM-003's remediation
  and a real improvement — `rebuild` can currently reach `input.target` and `input.occurredAt`,
  which it must not use — but each one is a signature rewrite, and this wave's mandate was that a
  function which moves unchanged is worth more than a better one. Deferred as a named follow-up.
- **`columnWidthChoices` is still a ~35-line body under a 60-line doc comment.** Splitting it is a
  redesign of a public query, not an extraction.
- **`fundingScan`'s comment is stricter than its code.** It says creation is offered "only when
  neither side has an empty column at all — not when one has one that then refuses", while the code
  offers creation whenever no side evaluates `ok`. The two agree on every reachable input: on a
  growth `vacatedEmptySpace` returns `undefined`, and on a shrink `evaluateEmptySpace` can only
  refuse with `absent` or with the fractional-extent case its own comment calls unreachable from any
  shipped design. Recorded, not changed.

### The one thing that was edited

`rebuild`'s doc comment sat above `moveHood`, so `moveHood` carried two doc blocks and `rebuild`
carried none. Left alone, the split would have filed `rebuild`'s documentation onto its neighbour.
The block was moved to the function it describes. Comment text only; no code changed.

### Found and deliberately left

Two duplications, both recorded rather than fixed, because this wave's value rests on changing
nothing.

- **`alongWallM` is now a third instance.** `void-engine.ts` holds a private `alongWall` with an
  identical body and near-identical doc comment; the duplication pre-dates this wave — it was
  `alongWallM` inside `set-width.ts` — but promoting the copy into its own named module makes it
  conspicuous. If someone changes the wall-to-axis convention in one place, `deriveColumnKey` and
  the resize disagree about which coordinate a column is bucketed on, and the resize moves bodies
  along an axis the key does not track. The fix is to fold it downward: export `alongWall` from
  `void-engine.ts`, which both layers already depend on, and delete `along-wall.ts`. Not the
  reverse — `void-engine` importing from `commands/` would invert the layering.
- **`fundingScan`'s doc is stricter than its code.** The comment says creation is offered only when
  neither side has an empty column at all, not when one has one that then refuses; the code offers
  it whenever no side evaluates `ok`. They coincide today only because the one formally divergent
  input — a side whose abutting empty column has an off-grid frozen extent, refused as `absent` —
  needs geometry `DesignSchema` forbids. Review confirmed it is unreachable from any schema-valid
  design. It becomes live the moment anyone relaxes the grid constraint or adds a shrink-side
  refusal reason, and it would arrive silently as exactly the wider change decision 7 rules out.
  Either make the code say what the comment says, or reword the comment.
