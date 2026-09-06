# ADR 0067 — Leftover wall is the normal case, and the price is a floor

Status: Accepted
Date: 2026-09-03
Type: Decision
Milestone: Cross-cutting — restates a constraint in M6 (6A3, 6I, 6N) and sharpens M7's preset matching

## Context

The owner, 2026-09-03:

> *"you need to know that rarely you have the fixed at the width of the walls, like 2600 or 3500. In
> majority of the cases, it's like 2444, for example. So there will remain space between cabinets and
> the end of the wall. And this space will be covered already on making the measurements and making
> the real plan by the manufacturer. Our goal is to build a tool that estimatively will provide the
> price, not exact price, but the minimum — so starting from the minimum of X currency."*

Three claims, all load-bearing, and the project has been treating the first two as edge cases.

## Decision

**1. Real walls are not round numbers, and the round-numbered case is the exception.** 2444 mm is
typical; 2400 and 3600 are not. Every fixture, preset and test in this repository is built on round
numbers, so **the normal case is currently the untested one**.

**2. Leftover space at the end of a run is the expected outcome, not a defect and not an edge
case.** The manufacturer closes it with filler at the real measurement, which is a step outside this
product entirely. This is materially stronger than the one-sided fit constraint already recorded in
[ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decision 4: that says bare
wall is *permitted*, and this says bare wall is what almost always **happens**.

The distinction matters because "permitted" invites a future implementer to treat a remainder as a
tolerance and write a gate, a filler rule or a snap-to-wall behaviour that nobody asked for. **A
remainder is the product working, not the product falling short.**

**3. The product is an estimate floor, not a quotation.** *"De la X"* — a minimum. M6's presentation
rules already require the prefix and the rounding; what this adds is that the floor is **the purpose
of the tool**, which bounds how much precision anything downstream may claim. A number derived to a
millimetre does not become a quotation by being precise.

## What this does NOT weaken — read this before acting on the above

**A run exceeding its wall is still wrong and is still marked.** ADR 0065 is untouched. The owner is
saying the **remainder** is normal, not that the **excess** is tolerable, and the two are opposite
sides of one bound:

| | Meaning | Rule |
| --- | --- | --- |
| `run end < wall length` | leftover wall | **Normal.** Never marked, never reported, never "corrected" |
| `run end > wall length` | the run does not fit | **Wrong.** Marked and warned about (ADR 0065) |

A reader who conflates them concludes the fit check does not matter. It does; only its *other*
direction is uninteresting.

## Where this is restated, and why each one needs it

- **[ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decision 4 and M6 wave
  6A3.** "Bare wall is normal and must never be reported" currently reads as a tolerance. Restated as
  the expected case.
- **M6 wave 6I's composition gate.** A gate author looking for things to assert is exactly the reader
  who would add "the run reaches the wall" as a companion check to "the run does not exceed it". It
  must not exist.
- **M6 wave 6N, the coverage bars — this one needs it most.** A bar reading *2800 / 2830* on a
  round-numbered fixture reads as *nearly full, therefore good*. On a real 2444 mm wall the same bar
  shows a large remainder, and **the customer must not read that as an error or as the tool failing
  to fill their kitchen**. The reference panel's own heading — *"LĂȚIME ACOPERITĂ · PRACTIC PLIN"* —
  was written against a round wall, and **"practic plin" may not survive contact with a real one**.
  The copy has to work at a 200 mm remainder, not only at 30.
- **M7's preset matching.** Presets and the generative fallback are matched against **arbitrary**
  wall lengths, so *"the run fits and leaves a remainder"* is the **normal successful outcome** of
  preset selection, not a near-miss to be corrected. **A distance metric that penalises leftover
  space would systematically pick the wrong preset** — it would prefer a preset that fills a wall it
  was never measured for over one that fits with room to spare.

## The fixture gap, recorded and not scheduled

Every room dimension in the codebase is a round number, so the common case is untested. Two
precisions on that, because the obvious framing is slightly wrong:

- **The correction already in flight partly closes it.** The seeded room becomes **3560 × 2830**,
  which is not round. So "round numbers" stops being literally true of the fixture the day that wave
  lands.
- **The untested property is not roundness — it is a _large_ remainder.** After the correction the
  seeded walls leave 40 mm and 30 mm. Nothing in the repository exercises a wall with 200 mm left
  over, which is the case the owner describes and the case where the coverage bars' copy, the preset
  distance rule and the "is this an error?" reading all actually bite.

**Where a non-round fixture belongs.** M7 owns it in general, with the room control — that is where
arbitrary wall lengths become customer input and where a preset must be matched to one. Within M6,
**wave 6N is the one wave meaningfully better tested against a large remainder**, because its output
*is* the remainder: a bar and a sentence whose legibility depends on the number's size. A test
fixture with a 200 mm remainder belongs with that wave. No other M6 wave gets a better test from
2444 than from 2400 — detection is a comparison, and the comparison does not care.

**The seeded design's own room is not a candidate.** It is the reference kitchen and its dimensions
are now pinned by the reference itself.
