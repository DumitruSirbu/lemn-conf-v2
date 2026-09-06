# ADR 0066 — The wall corner returns get their own kinds and names, one per row

Status: Accepted
Date: 2026-09-03
Type: Decision
Milestone: M6 wave 6A4 — mirrors [ADR 0025](0025-the-corner-base-legs-seat-on-the-l-joint.md) for the wall band

## Context

`wall-corner-return-570` (570 × 700) and `wall-corner-return-570-top` (570 × 400) both declare
`kind: "wall_cabinet"` and neither carries a `label` or a `catalogEquivalentId` — corner returns have
no catalogue equivalent, which [ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md)
records as the correct answer for them and which
[ADR 0064](0064-a-seeded-row-carries-its-catalogue-equivalents-name.md)'s amendment left untouched.

So `describeBodyLabelAt` falls back to `describeKindLabel("wall_cabinet")` and **both read exactly
"Corp suspendat"**.

**Why that stops being tolerable in M6.** Wave 6D puts these names in a **priced document**. Two
lines then read identically while being two different bodies at two different heights and two
different prices — an identical description against two different amounts, with nothing on screen
explaining the difference. In a panel header it was cosmetic; in an estimate it reads as an error in
the estimate.

This is exactly the position ADR 0025 addressed for the base band: without a name of their own the
base corner's header read the generic *"Corp"*, and §11 row 16 asks the panel to *explain* a corner,
which starts with calling it one. That ADR gave the two base corner bodies **two kinds** —
`corner_base_x` → *"Corp bază de colț"* and `corner_base_return` → *"Racord bază de colț"*.

The owner approved mirroring it for the wall band on 2026-09-03.

## Decision

**Two kinds, one per row, each with its own Romanian name** — not one shared kind for both returns.

**The names, owner 2026-09-03:** *"Dulap suspendat de colț"* for the wall-band return and *"Dulap de
colț rând de sus"* for the top-row one. **"Dulap", not "Racord"** — the base corners keep
*"Racord bază de colț"* unchanged, so the two bands deliberately do **not** share a noun. Mirroring
ADR 0025 is a decision about giving each corner body its own kind and name; it is not a licence to
copy its vocabulary.

**One shared kind would not fix the reported defect**, and this is the finding that shapes the wave.
The two bodies differ by **row**: one is band `wall`, the other band `top`. §9's header renders
`label · band · W × H` and would distinguish them either way — but **the breakdown line renders
`describeBodyLabelAt` alone**, label and width, with no band. Give them one shared kind and the
priced document still shows two identical descriptions at two different amounts, which is the whole
complaint. Two kinds is also the literal mirror of ADR 0025, which gave the two base corner bodies
two kinds rather than one.

The cost is a **label, not a mechanism**: `"wall_cabinet"` has no behavioural reader. `grep` finds
the string only in the fixture rows themselves, one catalogue row, and its own
`WALL_CABINET_KIND` declaration in `body-kinds.ts` — nothing branches on it. Changing these two rows'
`kind` therefore changes what they are *called* and nothing about what they *are*.

Two things this must not disturb, both load-bearing elsewhere:

- **`normaliseBand` still folds `top` into `wall`** ([ADR 0011](0011-m3-insert-contract-gaps.md)
  Gap C). The new kinds change the name, never the band gate, so both returns keep landing in the
  mockup's *Perete A · suspendate* group and §5.2's gate is untouched.
- **They remain structural** ([ADR 0021](0021-corner-returns-are-structural-in-data.md)) and keep
  `carriesHandles(1)`. A name is not a capability.

## Alternatives considered

- **One shared kind for both returns.** The obvious mirror, and it does not work: the breakdown line
  carries no band, so the two lines stay identical in the one place the defect was reported.
- **Add the band to the breakdown line** instead of naming the bodies. Rejected: it changes how
  *every* line reads in order to disambiguate two, and it does not answer §11 row 16's requirement
  that a corner be explained by being called one.
- **Give them a `catalogEquivalentId` so they inherit `wall-cabinet`'s name.** Rejected, and it would
  be a regression: ADR 0022 records that these bodies have no catalogue equivalent, and pointing them
  at one would also give them its width set and its swap badge — inferring identity from a name, the
  defect ADR 0022 exists to prevent. It would additionally make both read *"Corp suspendat 2 uși"*,
  which is *more* wrong, not less: a 570 mm corner return is not a two-door cabinet.
- **Leave it.** Tenable while the name lived only in a panel header, which is why nobody raised it
  before 6D existed.

## Consequences

- Two lines in a priced document that read identically at different amounts now read differently, for
  the reason they differ.
- `KIND_LABELS_RO` gains two entries and stays the single place a kind is named. No seeded body
  renders `UNKNOWN_KIND_LABEL_RO` before or after — the point ADR 0064's wave asserted, and worth
  re-asserting here because this decision changes two kinds.

## Correction — 2026-09-03: the harm a typo would cause was stated wrongly

**The decision above is unaffected. The reason given for one part of it was false**, and it is
corrected here rather than deleted so that the wrong version cannot be cited later.

**What was claimed**, in this record, in `body-kinds.ts` and in the wave test's own title: the two
kinds are declared as constants rather than bare literals because **a typo would silently remove a
corner's swap list** under §11 row 24.

**Why that is false for these two bodies.** `describeReplaceSection`
(`apps/web/src/panel/panel-model.ts`) returns `undefined` at `if (!meta.canReplace)` — **one line
before** it reaches `isKnownKind`. Both corner returns are structural under
[ADR 0021](0021-corner-returns-are-structural-in-data.md) with `canReplace: false`, so they render no
swap list at any spelling. **A typo cannot remove a section that never renders.**

**The general claim is true; its application here was not.** For a body that *can* be replaced, a
mistyped `kind` does fail `isKnownKind` and does render no replace section — so "declare kinds as
constants" remains well-founded as a general pattern, and §11 row 24 is not weakened. It simply is
not the harm these two bodies are exposed to.

**What a typo in these two kinds would actually break, and it is worse where it matters.**
`describeKindLabel` would fall through to `UNKNOWN_KIND_LABEL_RO`, so both returns would read
**"Corp"** — in the panel header and, since wave 6D, **in the priced document**. That silently
reinstates the exact defect this decision exists to remove: two lines with identical descriptions
against two different amounts. The real reason for the constants is therefore narrower and more
concrete: **three sites must spell each kind identically — the fixture row, `KIND_LABELS_RO`, and
the tests — and the label table is the one that goes wrong when they diverge.**

**[ADR 0025](0025-the-corner-base-legs-seat-on-the-l-joint.md) does not carry the same error**,
checked. Its decision 5 says only that naming the base corners *"does not weaken row 24: a kind
outside the table is still unknown and still renders no replace section"* — a true general statement
about the rule, not a claim that those structural bodies would lose a swap list. Nothing is owed
there.

**Why this is worth correcting at all**, since a wrong reason attached to a right decision invites a
shrug. This session has produced several comments asserting things the adjacent code disproves, each
caught in review. **A wrong rationale inside an ADR is worse than a wrong comment**: an ADR is the
artefact a future session reads *instead of* the code, and this one would have been cited to justify
declaring kinds as constants somewhere the reasoning genuinely does not hold — or, worse, to argue
that a structural body's kind is safety-critical when what actually matters about it is its name.

**Owed in code, not here:** the same claim appears in `body-kinds.ts` and in a wave test's title, and
both should be corrected where they are written.
- The base band and the wall band now treat corners the same way, which is the state ADR 0025 would
  have produced if the wall returns had been reachable when it was written.
