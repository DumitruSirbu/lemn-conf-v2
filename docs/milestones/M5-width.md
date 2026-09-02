# M5 — Editing a cabinet's size: width as a boundary move, depth as a derived quantity

> **STATUS: IN PROGRESS.** Waves 5A, 5B, 5C, 5C2, 5C3, 5D, 5D2a, 5D2b, 5D2c, 5F, 5G and 5H are all
> shipped. **Only 5E — the browser and mobile gate — remains.** Every shipped wave's decisions live in
> ADRs 0028–0041, 0052 and 0053; `docs/STATUS.md` carries the current summary. This file is trimmed to
> a pointer for everything shipped and kept in full only for 5E, the wave a session picking this up
> next actually has to read.

Status: in progress — 5E only.
Depends on M4.
Reference: `DEVELOPMENT-SPEC.md` §5.4, §5.2, §2, §3.2, §3.3, §4, §7, §9 item 6, §12, §13.1, §13.2,
§13.3; §11 rows 9–14, **19** and 20.
Decisions: ADRs 0028–0041 (waves 5A–5F), 0052 (wave 5G), 0053 (wave 5H); ADR 0011 (Gap A, Gap D) and
0018 as background.
Backlog entries this plan consumed: `docs/BACKLOG.md` **4**, **2**'s design obligation, **5**'s
unfinished half, **6**, and the edges of **1**. Entry **10** (swap vs. delete-then-insert depth
divergence over the fridge column) is untouched by any M5 wave and stays open there.

## Goal

Changing a cabinet's **width** moves the boundary it shares with one neighbour **in the same row**.
The run total is conserved, so overlap is unrepresentable and shrinking cannot leave a gap. A body's
**depth** is a quantity the model derives from one declared worktop depth, not a number somebody
typed. **M5 owns that geometry and nothing else about it** — the worktop depth is a single declared
constant at 600 mm in this phase; the customer-facing control is M6's (work item 4 there), and every
question about a worktop depth that *changes* travels with it.

## What shipped (5A–5D2c, 5F, 5G, 5H) — pointers only

Each wave below is fully recorded at its ADR and in `docs/STATUS.md`; this file no longer restates
the design reasoning, the measurements, or the review rounds.

| Wave | What it shipped | Record |
| --- | --- | --- |
| **5A** | The worktop → wall/top depth map (`600 -> 330`) as the single source for both the catalogue nominal and the head-clearance cap, closing the unlinked-constants defect a real handset reported | ADR 0028 (naming later superseded by ADR 0036) |
| **5B** | Seeded catalogue entries given their `sizesMm` width sets, resolved through `catalogEquivalentId` — the width section rendered in a browser for the first time | Folded into ADR 0022's mechanism; see wave table history in git log |
| **5C** | `setWidth`'s original donor-rule boundary move, plus the column-identity update (resize updates the touched columns, delete keeps them frozen) | Superseded by ADR 0031 the next day (see below) |
| **5C2** | `offersFor` publishes a verdict with its own reason instead of filtering on fit; insert and resize answer the width question through one `resolveWidth` path | ADR 0032 |
| **5C3** | Door-count entry pairs merged into one each; door count and its label derived from one threshold | ADR 0033 |
| **5D** | The domain query behind chip freedom, wired to the store and panel, with the refusal path reachable | ADR 0034 (later superseded by the stepper, ADR 0035) |
| **5D2a–5D2c** | ADR 0035's bounded ±50 mm stepper replaces the chip-row menu: a bound-based catalogue model (5D2a), square-up plus shrink-creates-space with the hood exempted from column alignment (5D2b), and the panel rendering the stepper itself (5D2c) | ADR 0035, ADR 0037 (built then withdrawn), ADR 0039 |
| **5F** | Base carcass depth as a formula over the declared worktop constant, value-preserving at 600 mm against the M1 fidelity gate | ADR 0036, ADR 0039, ADR 0040 |
| **5G** | 800 mm made the ceiling on any empty column, not only on a merge — closes Q5, this plan's own open question of whether shrinking has any ceiling at all (ADR 0035 decision 7) | ADR 0052 |
| **5H** | The design document records the whole frozen map, in two arrays (closes `docs/BACKLOG.md` entry 22) | ADR 0053 |

**Depth defect, resolved (5A/5F).** A top-row cabinet re-inserted into its own vacated slot used to
build 400 mm against 330 mm neighbours, because the wall-depth cap and the catalogue nominal were two
independent constants that happened to agree at the time the fixture was authored. 5A linked them
through one declared map; 5F made base carcass depth a formula over the same constant, verified
value-preserving against the M1 parity suite at the 600 mm default. Full reasoning, the owner's six
depth decisions, and the ADR 0018 clause-4 trap this wave had to decide about deliberately: ADR 0028,
ADR 0036, ADR 0039, ADR 0040.

**Column identity, resolved (5C).** A resize now updates only the columns it actually moved; a delete
keeps every column frozen (ADR 0011 Gap D). The four regression shapes that motivated this — a resize
without it hallucinating phantom voids, a delete-then-resize losing track of a resized width, the §10
signature flow needing three openings from a plain delete, and untouched columns staying
byte-identical — are pinned as tests, not restated here.

**The stepper, not a chip menu (5D2a–5D2c).** ADR 0035 replaced the discrete-size chip row with a
bounded ±50 mm stepper relative to the cabinet's current width (200–800 mm), with appliance-fixed
entries keeping a discrete choice. A column is one width at every level except the hood, which is
exempt from column-width membership and re-centres rather than holding an edge (ADR 0035 decision 6).
Shrinking creates adjacent empty space, capped at 800 mm since 5G (ADR 0052).

**Two things carried out of M5, both M6's to close, not this file's:**

- **The base family beyond `baseCabinet` does not follow the depth formula at 700/800 mm** — corner,
  return, dishwasher and oven-tower bodies stay byte-identical across depths (measured in 5F's QA).
  Nothing ships at 700 today, so this is a gap in reach, not a live defect; M6 must not ship the
  worktop-depth control without closing it.
- **Eight *Not established* depth questions**, five of which travel to M6 because they gate the
  control rather than M5's geometry (M6 question numbers match): is an 800 mm worktop real, does a
  700 mm worktop change wall-cabinet height, what happens to a design saved at 600 when the setting
  moves, do the two deliberately-deep top cabinets track anything, and does the hood follow the map.
  All five are repeated in full, not summarised, in
  `docs/milestones/M6-price-and-global-settings.md`'s *Worktop depth* section — read them there.
  Three of the original eight are already answered (ADR 0039 — the hood is standard depth, hung at
  the front; ADR 0036 decisions 1 and 3 — the map's value is the finished cabinet, and the "600 or
  620" question dissolves because the setting is cabinet depth, not worktop depth). The eighth,
  backlog entry 10 (swap vs. delete-then-insert giving a wall cabinet 680 vs. 600 mm over the fridge
  column), is untouched by any M5 wave and stays open in `docs/BACKLOG.md`, not here.

## Wave 5E — the browser and mobile gate (open)

The only wave left. It photographs the width surface as it exists today — the stepper, not the
retired chip row (ADR 0035) — and closes ADR 0024's rejection banner criterion, the one thing M4
closed unmet on purpose.

### What must be verified, and why it cannot be verified any other way

Per `docs/best-practices/browser-and-visual-qa.md`, a passing unit test does not close a mobile claim.
Everything below is currently verified under emulation only.

- **A real touch digitiser**, not a synthesised gesture. Tapping `+50`/`−50` visibly resizes both
  affected bodies in the scene; the stepper's controls are reachable and their disabled state carries
  a reason (ADR 0032); ADR 0023's compatibility-mouse-event fix holds under a real digitiser, not only
  Playwright's synthetic touch emulation.
- **A mobile GPU and device pixel ratio.** Nothing in the domain or Three-adapter test suite runs
  against real mobile rendering.
- **iOS Safari specifically** — the one engine none of the existing automated suites exercise.
- **HTTPS or a tunnel is required for the handset pass.** Over plain HTTP the `Secure` write-token
  cookie is silently dropped, which renders the panel read-only via `canWrite` and looks like a
  regression but is not one — this is an environment precondition for the wave, not a defect to chase.

### The rejection banner becomes reachable (ADR 0024)

M4 closed with one acceptance criterion unmet on purpose: §9's rejection banner had no reachable path
through the panel, because every list was fit-filtered through the evaluation the command runs. §5.4
onward is where a §9 control can legitimately refuse (a stepper button at a bound it cannot fund).

- A refusal reachable in a browser: attempting a width no funding source can satisfy renders the
  banner at the **top of the panel body, above every section**.
- Two of frame 2C's three requirements become testable in a browser: the control that produced the
  refusal is marked, and the valid value is retained. **The third — "the total does not move" — still
  waits for M6's price bar** and stays carried, not quietly satisfied.
- **This does not weaken "never offer the impossible."** The reachable refusal must come from a
  control the panel genuinely offers, never from a control that routinely refuses. If 5E finds itself
  building a case that offers what the engine refuses purely to photograph the banner, that is the
  defect ADR 0024 refused to manufacture, and the criterion goes back to unmet with the reason
  recorded — it is not this wave's to force closed.

### Surfaces

- **Mobile (gate):** at 390 × 844, pressing a stepper control visibly resizes the affected bodies in
  the scene, the panel scrolls to keep the active section visible, and a disabled control cannot be
  activated by touch. ADR 0023 applies: a tap on the scene must not also press the sheet. The mobile
  selection-highlight visual assertion no longer exists at 390×844 (superseded by the sheet covering
  that patch of scene, per `docs/STATUS.md`) — it is the suite's one `test.skip`; mobile still needs
  its own gate that a real touch selects the intended body and slot.
- **Desktop (same phase, separate line):** identical stepper components at the larger spacing scale in
  the 420 px rail. §10.1 holds by construction — the branch is CSS only.

### Verification this wave still owes

- Real touch interaction at 390 × 844 driving the stepper, not a synthesised gesture (superseding any
  earlier draft of this plan that treated Playwright's synthetic touch as sufficient evidence).
- A browser observation of the rejection banner actually rendering top-of-panel on a real refusal.
- iOS Safari pass, or a recorded reason it could not be reached this wave.
- Confirmation that the `Secure` write-token cookie precondition (HTTPS/tunnel) was met before any
  read-only result is trusted as a finding rather than an environment artefact.

## What is not built here, named rather than assumed

- **Any user-facing worktop depth control, or any persistence of it.** Owner decision, 2026-08-27.
  M6 work item 4 owns the control.
- **Run re-split** (§12). Decided wanted (`docs/BACKLOG.md` entry 2, option B) but not built in M5;
  the column-identity model was deliberately designed so re-split does not require redesigning it —
  see 5C's pointer above.
- **Column reordering** (*Mută la stânga/dreapta*). §13.2's rejection stands.
- **§13.3 q1** (unifying occupied swap sets with the fit-filtered catalogue). Still open.
- **The save coalescer's 1000 ms floor** (ADR 0019 decision 6) — shipped separately; confirmed done in
  `docs/STATUS.md`, not part of any M5 wave.
