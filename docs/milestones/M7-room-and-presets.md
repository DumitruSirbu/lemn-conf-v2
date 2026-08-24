# M7 — Screen 1: room shape, dimensions, presets, bespoke fallback

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
