# ADR 0039 — The hood is a standard depth, hung at the front, with the gap behind it

Status: Accepted
Date: 2026-08-28
Type: Decision
Milestone: M5 wave 5F — closes *Not established — Depth* question 1 and backlog 9

## Context

ADR 0036 made wall and top depth derive from one declared **cabinet depth** (600 or 700). The hood
was left out of that: it is pinned at `HOOD_DEPTH_MM = 500` (`catalog.ts`), and *Not established*
question 1 asked whether it should follow the map like every other wall body, noting that "a hood is
a wall body over a worktop, and if the map governs wall depth it is not obvious why 500 is exempt."

Backlog 9 rides on the same question: `make.hood` takes **no depth parameter at all** and its canopy
is a hardcoded 0.5 m box, so a hood round trip costs its opening 100 mm permanently.

Measured on the shipped kitchen before this decision: `p13` (`hood-600`) has `frame.d = 0.5` and is
seated like every other body — **back face on the wall plane** (§11 row 19). Its neighbours `p12`
and `p18` are 330 deep. So the hood's front sits 170 mm proud of the wall cabinets beside it and
80 mm short of the base cabinets below it.

## Decision

**1. The hood's depth is standard and does not follow the cabinet-depth setting.** Owner,
2026-08-28: *"hood is always standard."* It stays 500 mm at a 600 mm kitchen and at a 700 mm one.
This closes question 1: the hood is **exempt from ADR 0036's map**, and the exemption is a fact about
hoods rather than an oversight.

**2. The hood is hung at the front, and the empty space goes behind it.** Owner: *"you put it to
start from the front and leave empty space between it and the wall."* Its front face aligns with the
cabinet-depth line — 600 mm today — so a 500 mm hood leaves a **100 mm gap between its back and the
wall**, which the chimney hides. At a 700 mm kitchen the hood is still 500 and the gap becomes 200.

This is the physical arrangement: a hood is sized to the cooktop it covers, not to the wall it hangs
on, and it is set forward so it actually sits over the pan rather than behind it.

**3. §11 row 19 gains its second named exception.** The row requires a body's back face to land
exactly on the wall plane (0.000). The hood is now positioned from its **front**, so its back face is
deliberately off the wall by `cabinetDepth − 500`. ADR 0025 established the precedent — the corner
base leg takes a named `-0.02` exception for the L-joint — and the rule is the same: the exception is
declared and measured, never a tolerance that drifted.

**4. The hood keeps its width when the cabinets under it are resized.** Owner, the same day: *"the
cabinets is resizable but the hood over it should remain same size."* Recorded as an amendment to
[ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 6, which is where column
membership is decided; noted here because it is the same fact as decisions 1 and 2 seen on the third
axis. **A hood is sized to the cooktop, not to the run** — that is one rule, and it fixes the depth,
sets the front alignment, and exempts the width from the column all at once.

The owner's own reading of why: *"I think this was the reason why hood was separate from cabinets and
somehow was positioned over worktop."* That is very likely right — a hood hangs over the run rather
than sitting in it, and every one of these three decisions is the model catching up with that.

## Alternatives considered

**Let the hood follow ADR 0036's depth map like every other wall body.** Rejected by decision 1. It
is what question 1 proposed and it would make a 700 mm kitchen carry a 700 mm-deep hood, which is not
a product anyone makes.

**Keep the hood wall-seated and let it protrude past its neighbours.** This is what ships today, and
it is what decision 2 replaces. The 170 mm protrusion past the wall cabinets is visible, and it puts
the extraction behind the cooktop rather than over it.

**Give the hood a depth parameter and let it fill its opening.** Rejected for the same reason as
decision 1 — a hood is a manufactured appliance, not cabinetry. Note this is the opposite direction
from ADR 0035 decision 5, which gave the hood a cabinetry **width** bound of 600–800: width follows
the run it sits in, depth does not.

## Consequences

- **Backlog 9 closes with this, and only with this.** `make.hood`'s hardcoded 0.5 m canopy stops
  being a defect the moment the depth is decided to be constant — but the *seat* must still change,
  so the builder or its caller gains a front-alignment offset rather than a depth parameter. That is
  the opposite of what backlog 9 assumed, and is why the entry can now be closed rather than carried.
- **Wave 5F owns it**, alongside the base carcass formula, because both are the same question —
  where a body's faces land once depth is derived rather than typed — and because 5F is already the
  wave that touches a builder and the M1 parity gate.
- **The M1 parity gate must be re-baselined for the hood as well.** ADR 0036 already records one
  deliberate geometry change (wall cabinets finishing at their declared depth); this is a second, and
  they should be re-baselined together in 5F rather than in two rounds.
- **One detail is inferred rather than quoted, and 5F must confirm it before building.** "The front"
  is read here as the **cabinet-depth line (600 mm)**, not the worktop's 620 — ADR 0036 decision 3
  makes the worktop external and says it must influence neither geometry nor price, so aligning to it
  would contradict that. If the owner means the hood should instead sit flush with the worktop's
  front edge, the gap is 120 mm rather than 100 and this line is the only thing that changes.
