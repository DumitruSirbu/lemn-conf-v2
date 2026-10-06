# ADR 0139 — The room screen's routing, generation lifecycle, back guard and plan scale: reasons recovered from code comments

Status: Accepted
Date: 2026-10-06
Type: Finding (recovered reasons; no behaviour changes)
Milestone: Cross-cutting (M7 Step 1 and M7C editor); filed under ADR 0136 decision 3

**Why this record exists.** [ADR 0136](0136-code-and-test-comments-carry-only-what-nothing-else-can-and-history-lives-in-the-records.md)
decision 3. **Evidence tier for every decision: recovered from a code comment on 2026-10-06, not
re-measured.** The comments label several rules "R5", "R13", "R15", "R17" and the like; those are plan
ruling ids from the archived M7 milestone and are kept here as the comments' own labels only. Rulings
marked "coordinator" were given by the coordinating agent, not the owner. The `room-query-sync.ts`
router-versus-`replaceState` reason was filed as [ADR 0127](0127-step-1s-url-follows-the-typed-room-and-a-late-echo-is-still-ours.md)
decision 11. Cite as `see ADR 0139 decision N`.

## Decision 1 — Step 1's top bar imports `LocaleMenu` from the editor's route folder, deliberately, until the move is its own wave

- **Rule.** `room-screen.tsx` imports `LocaleMenu` from `@/app/configurator/configure/locale-menu`
  (a cross-route import). The intended end state is `src/chrome/locale-menu.tsx` with a `className` prop
  for its positioning cell (ruling R5); the move was deferred.
- **Why it is deferred.** R5 was ruled on an estimate of "one moved file, one import line, zero CSS
  risk", and the comment says that estimate was corrected on measurement. The move breaks four test
  files, one of them frozen by that wave; and the `className` prop breaks `top-bar-box.test.ts` and
  `qa-w4-top-bar.adversarial.test.ts` **with no move at all**, because those two assert that the locale
  cell's positioning lives in the component and that the screen does not carry `styles.locale}`. Those
  are [ADR 0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md)
  structural guards on the top bar's grid, so R5 is an **invariant change**, not a relocation.
- **Source of the deferral.** A coordinator deferral dated 2026-09-14, as the comment records it. The
  archived M7 milestone says: *"R5 was corrected on a measurement the same day and the locale-menu
  extraction is deferred to its own wave; 7F1 imports the component where it stands."*
- **Where.** `apps/web/src/room/room-screen.tsx`.

## Decision 2 — composition is client state, not a URL sub-state

- **Rule.** Which composition the room screen shows lives in client state (`useGeneration`), not in the
  URL (ruling R13). The top bar reads it so frames 1A–1C title the screen *Cameră* and 1D–1F title it
  *Preset*.
- **Why.** The comment gives three reasons: a new query key is stripped by the settle; a new path
  segment 404s under the proxy allow-list; and an addressable composition URL would re-run generation on
  every reload and mint a second design.
- **Related, recorded.** [ADR 0111](0111-step-1-creates-the-design-through-the-existing-mint-then-save-and-the-room-entry-lives-in-the-url.md)
  decision 3 (the room entry lives in the URL).
- **Where.** `apps/web/src/room/room-screen.tsx`; `use-generation.ts`.

## Decision 3 — a history traversal out of composition clears the run, by a `popstate` listener

- **Rule.** A `popstate` clears the run (`leave`), and `leave` is idempotent, so a traversal anywhere
  else in Step 1 clears an already-clear run. This does not breach decision 2: the run is cleared by an
  *event* and nothing about composition is written to or read from the URL.
- **Why.** Both history entries around 1F carry the same query, so nothing else can tell the traversal
  apart — not `liveText`, which is unchanged, and not the sub-state, which is 1D on both sides. Without
  it a customer presses Back, 1F stays on the glass, and the button appears to do nothing.
- **What the other effect does not cover.** The effect that calls `leave` when the URL names no shape
  covers only the shape-less URL. It is *not* what catches a Back out of 1F: `departTo("presets")`
  pushes the room's own query and the entry behind it is the settle's `replace` of that same query, so
  a Back lands on a URL that still names the shape. The comment corrects an earlier note that claimed
  otherwise.
- **Source.** "Coordinator's ruling, 2026-09-15" (an agent ruling, not the owner's), as the comment
  states it.
- **Where.** `apps/web/src/room/room-screen.tsx`.

## Decision 4 — generation starts from an event handler, never from an effect

- **Rule.** A composition run starts from the tap that asked for it (ruling R15). The one place
  generation is started is an event handler in `room-screen.tsx`, and `use-generation.ts` states the
  same rule as its rule 1.
- **Why.** `next.config.ts` sets `reactStrictMode: true`, which double-invokes effects in development. An
  effect that generated would build two Three.js kits and, once the hand-off writes a design, mint two
  design rows — with every existing test green, because the second mint is a different attempt and the
  mint guarantee is per attempt by design. A handler runs once per tap. The 1A guard effect ends a run
  and **starts** none, so a StrictMode second invocation clears an already-clear run.
- **Where.** `apps/web/src/room/room-screen.tsx`; `apps/web/src/room/use-generation.ts`.

## Decision 5 — one attempt writes the design once per composition, built in the first state that holds a design

- **Rule.** The design is written once per composition, by one `createDesignCreationAttempt` that the
  run owns (R17). The attempt is built **in the transition that first holds a design** — never in a
  click handler, a render, or a `useMemo` over the design. Every retry re-runs that same attempt.
- **Why.** An attempt holds one mint identity for its whole lifetime; `createDesignCreationAttempt`'s
  own doc comment carries the caller obligation that "constructing one inside a click handler mints a
  row, and navigates, per tap". The deliberate selection here is the *Continuă* tap and its state is the
  run. Re-running one attempt is what makes a retry after a failed `PUT` a second write to an
  already-minted row rather than a second row.
- **Hand-off.** The hand-off's `push` is not an exception to decision 2: it is the customer leaving
  Step 1 and records nothing about the composition anywhere a reload could find it.
- **Where.** `apps/web/src/room/use-generation.ts`; `create-design.ts`.

## Decision 6 — the browser-Back guard is one history entry pushed on the first edit, and it has three rules and one fragility

- **Context.** [ADR 0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md)
  Amendment D4 decides *that* the browser's Back asks before leaving an edited editor and records the
  as-built behaviour; the mechanics below were recorded only in `milestones/M7C-m7-feedback-fixes.md`
  and the comment.
- **Mechanism.** The router cannot refuse a traversal (Next's `onPopState` restores whichever entry the
  browser landed on), so the only shape available is a **guard entry**: one extra history entry with the
  editor's own URL, pushed once the customer has something to lose. Back then lands on the editor's first
  entry, so the address bar does not move, and a `popstate` listener asks.
- **Rule 1 — pushed from the customer's first edit, never earlier.** Per the comment, Chrome marks
  entries a document pushed without a user gesture as skippable on Back, and after a browser-initiated
  traversal stops honouring the document's earlier gestures until the next one (comment cites
  `navigation_controller_impl.cc`, `SetShouldSkipOnBackForwardUIIfNeeded`, and
  `render_frame_host_impl.cc`, `honor_sticky_activation_for_history_intervention_`; not re-read). An edit
  is a tap or key press, so the entry it pushes is a real one.
- **Rule 2 — *Stay* never pushes.** Escape is not a user activation, so a guard re-pushed after Escape
  would mark the editor's entries skippable and take Back past Step 1. *Stay* goes `forward()` onto the
  guard entry still there, which creates no entry and keeps the history at one guard however often the
  customer stays.
- **Rule 3 — one guard per visit, held in two places that must agree.** The module's origin record
  survives a language switch's remount (the entries do too); the marker in `history.state`
  survives a reload (the module does not). A push needs both to say *none yet*.
- **The marker is fragile to one thing.** Any same-URL navigation or `router.refresh()` in the editor
  would strip it (comment cites `refresh-reducer.js:75`: the history updater rewrites the entry's
  state), so none may be added to the editor without revisiting this guard.
- **Where.** `apps/web/src/app/configurator/configure/use-back-guard.ts`.

## Decision 7 — the plan preview draws one isotropic scale for both axes

- **Rule.** `isotropicScalePxPerMm` takes the largest scale that leaves the whole room inside the
  drawing region on both axes. It is the plan's single deliberate departure from frames 1A and 1B and
  "arithmetic nowhere else in this module": if the frame's literal proportions are ruled for instead,
  this function is the only thing that moves. It is handed the region, not the box, so the label lane is
  already off it (taking the lane off here would put a second subtraction beside the scale).
- **Why.** The frame draws wall A at 250 px for 3600 mm and wall B at 50 px for 2400 mm — two scales —
  which would draw a 6000 × 1000 mm room as a square.
- **Owner ruling (R4).** *Owner ruling as recorded in the `plan-preview-model.ts` comment (criterion 12,
  ruling R4) and in the archived M7 milestone, which says it was ruled 2026-09-14 — "the plan preview
  uses one shared isotropic scale, over the alternative of taking frame 1B's two scales literally".
  Not re-confirmed with the owner on 2026-10-06.*
- **Where.** `apps/web/src/room/plan-preview-model.ts`.

## Decision 8 — the room plan draws walls at a fixed thickness and carries no depth

- **Rule.** The plan's wall bars are drawn at a fixed thickness (`PLAN_WALL_THICKNESS_PX`, 12 px, frame
  1B's value) that **never scales with the room** (criterion 12). The plan knows no depth at all: the
  thickness is only what makes a wall readable, and the plan is derived from the draft's lengths and
  corner direction and nothing else (no cabinet, placement, catalogue or depth).
- **Evidence tier.** Recovered from a code comment, **rule confirmed by the owner 2026-10-06**; the
  confirmation covers this rule as stated and no wider.
- **Related, not the source.** [ADR 0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md)
  decision 2 (the room is a fixed dimension, never a function of the cabinet-depth setting) is related
  but does **not** state this rule; the code comment's earlier pointer to it is superseded by this
  decision.
- **Where.** `apps/web/src/room/plan-preview-model.ts` (`PLAN_WALL_THICKNESS_PX`).
