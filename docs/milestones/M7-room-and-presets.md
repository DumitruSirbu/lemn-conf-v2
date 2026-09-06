# M7 — Screen 1: room shape, dimensions, presets, bespoke fallback

> **STATUS: PLANNED.** Depends on M6. Summary: `docs/STATUS.md`.

Status: planned. Depends on M6.
Reference: mockup frames 1A, 1B, 1C, 1D, 1E, 1F and D1A–D1F; `DEVELOPMENT-SPEC.md` §10, §13.3 q4/q5;
`ARCHITECTURE_PROPOSAL.md` §5.2, §8.

## Goal

The way in: choose a shape, enter dimensions, and get a kitchen — either a preset that fits, or one
composed for the room when none does. After this phase the seeded development room is no longer the
only entry point.

**This is one step with six sub-states, not six steps.** The customer sees "Pasul 1 din 4"
throughout, and the step resolves directly into the 3D editor — choosing a preset, or finishing a
bespoke composition, opens Step 2 with the editor already up. There is no confirm-and-continue
screen between them, and this phase must not introduce one.

## Why last among the build phases

`DEVELOPMENT-SPEC.md` §12 step 7 puts presets after the editor, calling them plain by comparison.
The customer meets this screen first, but it is a form over an evaluator; the editor is the risk.

## Scope

In: `/configurator/room` and its six states; the room schema and its validation; preset evaluation
and application; bespoke generation.

Out: the editor (M1–M6); linear and U-shape **layout** logic, which stays out of scope until product
supplies a recipe and per-wall band data.

## Security note — the firewall goes up after this phase

M7 is the phase that first puts real customers in front of the app, which is the point at which
`docs/decisions/0019-security-baseline-writes-throttling-retention.md`'s edge layer stops being
premature. It was deliberately deferred until now: a firewall protecting zero users is waste, and
rules staged for months go stale against an app that changed underneath them.

Nothing in M7 implements it. The exact commands, the plan constraints (**this plan permits exactly
one `rate_limit` rule**), and the mandatory log → preview → production rollout are in
`docs/runbooks/firewall-setup.md`. The owner publishes firewall changes; an agent never does.

Note also that ADR 0019 decision 1 — the read/write split — is expected to have shipped in M3 Wave
3C. If it has not, it blocks this phase rather than M8: M7 is where a shared link first reaches
someone who is not its creator.

## Work items

1. **1A / D1A** — the shape picker: three cards with 2D plan glyphs, not renders. The continue
   action stays disabled until a valid shape is chosen. Cards, not a dropdown.
2. **1B / D1B** — dimensions: one numeric field per wall in the chosen shape, plus room height, plus
   a corner-direction toggle for L and U that mirrors a live 2D top-down plan preview.
3. **1C / D1C** — the validation state.
4. **1D / D1D** — the preset-loading state: skeleton cards and the waiting copy.
5. **1E / D1E** — the list of presets that fit.
6. **1F / D1F** — bespoke generation when none fits.
7. Wire preset application to the editor, and carry the room through to the editor's state.

## Acceptance criteria

Shape and dimensions:

- All three shapes are offered. The affordance ships even though only the L layout is buildable.
- A shape whose layout does not exist is refused at this screen with a human reason before any
  preset work begins. It is never accepted and then rendered wrong, and the refusal does not expose
  an internal reason like "not implemented".
- Dimension fields use tabular numerals, an inline unit, and the Romanian decimal comma. A value is
  parsed once at the form boundary and normalised to exact integer units before entering the domain;
  a non-integral value is rejected, not rounded.
- The corner-direction toggle appears only for L and U. **The direction is never inferred from the
  wall lengths** — the mockup states this explicitly next to the control.
- The 2D plan preview updates as the customer types and mirrors with the toggle.
- The example values in the mockups (3.60 × 2.40 m, height 2.60 m) are the mockup's example, not
  constants. Nothing in the implementation may treat them as fixed.

Validation (1C / D1C):

- The reason appears next to the offending field, in human language.
- **No limit number and no error code is shown**, because the bounds are unapproved data. The
  mockup's own wording is the model: this wall is shorter than we can support, increase it or choose
  a linear shape.
- The plan preview marks the offending wall in red.
- The screen states that presets appear once every value is valid.
- Desktop uses its extra space for an actionable suggestion, not for more prose.

Preset list (1E / D1E):

- **A vertical list on mobile with a per-card "Folosește" button, and a grid on desktop with the
  same per-card button. There is no separate confirmation screen** — choosing a preset applies it
  and continues.
- Only presets that fit are shown. One that fits after a declared adjustment shows that adjustment
  inline on its card, in the mockup's form: "Ajustată −20 cm ca să intre pe peretele B". An
  adjustment is never applied silently.
- The header states the result count and how many were adapted.
- Each card carries its body counts by band, its finish summary, and its starting price.
- Thumbnails are renders produced from the preset's own recipe by the `preset-shots.html` rig, loaded
  separately from the card. A card must never promise a layout different from the recipe it applies.
- The same evaluator decides what is listed and what is applied, so a card shown as fitting cannot
  fail on application.
- **Loading (1D / D1D):** skeleton cards with the waiting copy. The number of skeletons must not
  imply the number of results.

Bespoke generation (1F / D1F):

- When no preset fits, the flow composes one instead of dead-ending. There is no "no results" state
  anywhere in this screen.
- The placement steps are visible in priority order, so the wait is legible and the omissions are
  explained.
- The stated rule holds: on short walls keep the sink and cooking first, then storage. What does not
  fit is **removed and labelled** — shown struck through with "nu încape" — never crammed in.
- Every generated design is a valid design under the M2/M3 engine. Generation produces placements
  through the same guards as manual insertion; it has no privileged path.
- Desktop shows the composition steps beside a preview that fills as bodies are placed.

Surfaces:

- **Mobile (gate):** all six states complete by touch at 390 × 844, including reaching the editor
  from a chosen preset and from a bespoke composition. This is the phase gate.
- **Desktop (same phase, separate line):** D1A–D1F, with the step labels in the top bar rather than
  a progress bar, the large live plan beside the fields, and the four-up preset grid.

Step framing:

- All six sub-states live under one step and one route, and the progress indicator reads "Pasul 1
  din 4" across every one of them. On desktop the steps are labels in the top bar, not a progress
  bar.
- Choosing a preset applies it and opens the 3D editor. Finishing a bespoke composition does the
  same. **No confirm-and-continue screen exists between Step 1 and Step 2.**
- Applying a preset creates the stored design and its identifier, so from this point the customer's
  work is reachable by link.

Boundaries:

- Route guards: reaching a later step without a valid configuration returns to the earliest missing
  step with an explanation. Browser Back never erases a valid design.
- A design identifier in the URL resolves the stored design and restores the step it belongs to,
  rather than restarting the flow.

## Risks

- **Inventing a bound to make validation implementable.** The bounds are unapproved. Implement the
  validation *mechanism* against policy data and keep the wording free of numbers, exactly as the
  mockup does.
- **Copying the L scene to fake a linear or U preset.** Explicitly forbidden. §13.3 q4 records that
  the band lines and the two wall planes are constants of this room and must become per-wall data
  first.
- **Bespoke generation growing its own placement rules.** It must call the same engine.
- The reference's four presets share one scene and differ only by finish and camera angle. Real
  per-preset recipes are unbuilt product work; this phase can prove the mechanism with one real
  recipe and explicit fixtures.

## Owner's statement of intent for this phase — recorded 2026-09-03

In the owner's own words:

> *"any future presets (after user will introduce walls size the app will search in presets to found
> a near to sizes kitchen and will propose it to be selected, if not app will gather based on a algo
> the cabinets and electric devices to have a functional kitchen) and this should always fit the
> existing walls, including demo."*

**This is more than "presets fit".** It describes three things, and only the third is in this plan's
current work items:

1. **Preset selection by nearest room size.** The customer enters wall sizes and the app searches the
   preset set for a *near* match to propose. This plan's work item 5 says "the list of presets that
   fit" — a filter — and the owner describes a **search for the nearest**, which is a different
   operation and needs a distance rule nobody has written.

   **When that rule is written, read [ADR 0067](../decisions/0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md)
   first.** Real walls are not round — the owner's own example is 2444 mm — so *"the run fits and
   leaves a remainder"* is the **normal successful outcome** of preset selection, not a near-miss to
   be corrected. **A distance metric that penalises leftover space would systematically pick the
   wrong preset**: it would prefer one that fills a wall it was never measured for over one that
   fits with room to spare. The remainder is closed with filler by the manufacturer at the real
   measurement, outside this product.
2. **A generative fallback.** Where no preset is near enough, the app **assembles** a functional
   kitchen from cabinets and appliances by algorithm. Work item 6 calls this *"bespoke generation
   when none fits"* and the acceptance criteria carry a priority order; the owner's framing is
   stronger — the fallback must produce **a functional kitchen**, not merely a placement that fits.
3. **Everything the product proposes must fit the walls, the demo included.**

**Point 3 is an invariant and it reaches M6.** It is stronger than the fit *gate*
[ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) defines: that
gate marks a body the **customer** has driven past the end of a wall, and this says the product must
never **propose** such a kitchen in the first place. A marked body is an acceptable outcome of a
customer's own edit; it is not an acceptable outcome of a preset, of generation, or of the demo
design loading. Recorded in M6 as well, at wave 6A3.

**What this phase currently assumes instead**, so the gap is explicit rather than discovered: the
acceptance criteria below say a listed preset always applies successfully, but nothing asserts that
what it applies **fits its walls**, and nothing distinguishes "fits" from "nearest". Both are this
phase's to close.

## A rule this phase owns, handed over by M6 — recorded 2026-09-03

**What gives when a run will not fit its wall at a deeper cabinet depth.** Raised by M6 wave 6I and
handed here because the case does not occur in M6.

**The requirement, in the owner's terms:** the run must fit the wall it stands on — *"in reality the
cabinets will not fit the existing wall"*. In M6 that is satisfied by measurement at both declared
depths: a deeper wall-A run consumes more of wall B at the corner, so wall B's run ends 100 mm
further along at 700, and it still fits. Nothing has to give, and
[ADR 0055](../decisions/0055-a-depth-change-migrates-the-stored-design.md) — every body adapts,
nothing left behind, no confirmation — holds unamended.

**M7 is where that stops being free.** This phase brings real room dimensions and presets, so a
customer with a **narrower wall** choosing 700 is the first configuration in which a run cannot
simply extend. Then something must give, and the options were worked out in M6 without being needed:

- **Shrink the structural corner return.** It absorbs the delta exactly — its left edge moves with
  the deeper run and its right edge holds, so the width falls out as `320 − delta`. Costs no cabinet
  and no width the customer chose, because a corner return is structural
  ([ADR 0021](../decisions/0021-corner-returns-are-structural-in-data.md)) with no chips and no
  resize. Runs out when the return does, and needs a manufacturable minimum only the owner can give.
- **Narrow a customer cabinet.** Needs a give-way rule nobody has written, against ADR 0017/0026
  floors and ADR 0031's funding rules, and it overwrites a width the customer set through ADR 0035's
  stepper.
- **Drop a body.** The customer loses a cabinet they chose.
- **Refuse the depth for that room.** Ruled out in general by
  [ADR 0036](../decisions/0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5, which is
  why it cannot simply be picked here without a dated amendment.

**The last two, and refusal, require amending ADR 0055** — *"nothing left behind"* is exactly what
they break. Whichever is chosen, the amendment is this phase's to write, not M6's.

**It interacts with M6 wave 6K**, the wave that first lets a customer choose 700 at all: a room saved
under M7 can be reopened and re-depthed there, so the rule has to hold on both paths rather than only
in the phase that introduces the room.

## A seam this phase owes a later one — recorded 2026-09-02

[ADR 0062](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md):
after M8 the project gains a manufacturer-facing dashboard, and one of its **probable** properties —
the owner's own *"I will think about"*, so not committed — is **enabling or disabling a specific
cabinet type**. Adding new cabinets is explicitly out of its scope.

**M7 builds nothing for it.** What this phase owes is one shape: **a preset recipe names build ids,
so preset application must ask whether a body is available rather than assume its presence in the
catalogue.** If a type is later disabled, a preset referencing it must fail in a *stated* way — the
phase's own acceptance criterion that a listed preset always applies successfully is what would
otherwise break silently, or half-apply.

Availability funnels through one predicate today (`toInsertableBody`, and
`resolveCatalogEquivalent` for the swap path). Route preset application through the same one. No
flag, no data, no schema — that is the dashboard's work, not this phase's.

## Open questions gating this phase

- Exact minimum and maximum wall lengths and room heights.
- The real value behind the "fits after a ≤ 30 cm adjustment" rule.
- Bespoke-generation thresholds beyond the stated priority order.
- Approved discrete width and filler sets, which bound what generation may place.
- Real per-preset geometry recipes.
- When linear and U layouts return, and with which per-wall data.

## Verification

- Evaluator tests: fitting, fitting-with-declared-adjustment, and not-fitting, with the assertion
  that a listed preset always applies successfully.
- Generation tests: every generated design passes full validation, and an item that does not fit is
  absent and labelled rather than overlapping.
- Form tests: Romanian decimal parsing, exact integer conversion, toggle-independent-of-lengths, and
  the plan preview mirroring.
- Real touch interaction through all six states at 390 × 844.
