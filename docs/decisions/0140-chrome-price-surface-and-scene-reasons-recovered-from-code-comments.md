# ADR 0140 — Chrome, price surface and scene: reasons recovered from code comments

Status: Accepted
Date: 2026-10-06
Type: Finding (recovered reasons; no behaviour changes)
Milestone: Cross-cutting (M6, M6B, M7); filed under ADR 0136 decision 3

**Why this record exists.** [ADR 0136](0136-code-and-test-comments-carry-only-what-nothing-else-can-and-history-lives-in-the-records.md)
decision 3. **Evidence tier for every decision: recovered from a code comment on 2026-10-06, not
re-measured.** Figures are quoted from the pre-pass comment text. Owner rulings are recorded as the
comment records them, with the date the comment gives, and **not re-confirmed with the owner on
2026-10-06**; they are not generalised beyond the comment's words (see `docs/best-practices/documentation.md`,
*A rule the owner described in conversation is not yet an invariant*). Cite as `see ADR 0140 decision N`.
The price breakdown title's owner ruling is in [ADR 0141](0141-romanian-copy-rulings-recovered-from-the-copy-lock-and-a-test.md).

## Decision 1 — the wordmark is drawn only where it costs the settings pill no name

- **Rule.** `theWordmarkCostsNoName` draws the wordmark (give C of the top bar's fit) only when the pill
  names the **same number of settings with and without it** — `namesAt(trackWithWordmark) >=
  namesAt(withoutIt)` — and `oneWholeNameFitsBesideIt` also holds. There is no width threshold and no
  fixed name count ([ADR 0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md)
  decisions 8 and 9 carry the wordmark ruling itself).
- **Why a count fails.** The owner ruled twice (as the comment records, wordmark ruled 2026-09-09 in
  ADR 0104): first the wordmark returned where **one** whole name fitted beside it; shown that crossing
  that width while widening takes a name back off the pill (the label count *falling* as the window
  grows), they chose to have the artefact away. The wave expressed that as a count
  (`SETTINGS_THE_WORDMARK_WAITS_FOR = 2`). Adversarial QA measured where a count fails (2026-09-09,
  `qa-0104-the-label-count-is-monotone.adversarial.test.ts`): waiting for two names works only while a
  third name costs the pill more than the wordmark does. Figures from the comment's table:

  | tier | a third name | the wordmark | monotone |
  | --- | --- | --- | --- |
  | Standard | 128.70 | 114.56 | yes |
  | Hettich | 116.88 | 114.56 | yes, by 2.32 px |
  | Blum | 106.45 | 114.56 | **no** |

  On Blum, 1033 px named three settings and 1034 named two. It also broke at every tier on the
  three-setting pill an undeclared material leaves, because drawing that third name also retires the
  counter and so costs only 86.65.
- **Why the property holds by construction.** The count the pill settles on is always the count the wider
  of the two tracks buys, which is non-decreasing in width whatever the labels measure, in both branches.
- **Dependency on give B (not obvious).** Without the wordmark the track is discontinuous where the gaps
  close: below that width it is `reference + 105 + wordmark + 9`, above it `reference + wordmark + 28`,
  an **86 px drop** as the window grows. It is harmless only because `isSpacingClosed` means *every name
  fits* (`referenceTrackPx < atEveryLabel`), so the count is pinned at the whole ladder across the
  boundary. Loosening that threshold below "every name fits" would make the count fall with width without
  changing this function.
- **The first ruling stays as a floor.** At 900 px the pill's ladder floors at one label (*"the floor is
  one label, never zero"*), so the cost comparison alone would draw the wordmark there; with it kept the
  row fits at rung 4 with about 17 px left for the label, which is `P…`. Both conditions hold; the first
  ruling "was never wrong — it was insufficient".
- **Where.** `apps/web/src/app/configurator/configure/top-bar-fit.ts`.

## Decision 2 — Tab closes the language menu on focus leaving, not on the keydown

- **Rule.** The locale menu closes on Tab in `handleFocusLeaving` (focus actually leaving the menu
  root), never in the `Tab` key handler.
- **Why.** The comment calls it "a measured difference and not a style": closing on `Tab`'s keydown
  unmounts the very element the browser is about to move focus *from*, so sequential navigation restarts
  at the top of the document and the customer is thrown to the first control on the page. Waiting until
  focus has left lets the browser move first, and covers Shift+Tab and every other way out.
- **Where.** `apps/web/src/app/configurator/configure/locale-menu.tsx` (`handleFocusLeaving`).

## Decision 3 — choosing the language already showing does not navigate (a precaution)

- **Rule.** A plain click on the current language's entry is `preventDefault`ed
  (`stayWhereTheCustomerIs`); a click that opens a new tab or window (meta, ctrl, shift or alt) is left
  alone.
- **Why, and its evidence tier.** The comment reads Next's source (`app-router.js:51-66`,
  `segment-cache/navigation.js:461`): a soft navigation to the URL the entry already has rewrites that
  entry's state, which would strip the marker off the browser-Back guard (decision 6 of
  [ADR 0139](0139-the-room-screens-routing-generation-and-back-guard-reasons-recovered-from-code-comments.md))
  when the customer is standing on it. That reading **did not reproduce in Chromium**, so this is "a
  precaution and a pointless navigation removed, not a fixed defect". Source-verified by the comment's
  author; not re-read here.
- **Where.** `apps/web/src/app/configurator/configure/locale-menu.tsx`.

## Decision 4 — the press-completion timer is verified in Chromium and not in WebKit

- **Rule (a known limit).** `use-after-press.ts` completes a press on a zero timeout after `mouseup`,
  which assumes the browser dispatches the release's `click` in the same task as the `mouseup`, so the
  timeout runs after the click. "Verified in Chromium (QA's e2e, mouse and touch); **not verified in
  WebKit**" (review R1.6).
- **Why the hook exists.** A browser moves focus on a press, before the click; a `blur` handler that
  inserts content then pushes controls down between press and release and the click lands on whatever is
  now under the finger (QA finding S5b-1: wall B's help did not open).
- **Where.** `apps/web/src/lib/use-after-press.ts`.

## Decision 5 — the price breakdown is non-modal on both shells, and Tab leaving it is intended

- **Rule.** The price breakdown has no focus trap and no dismiss-on-blur on either shell, and says so in
  every input mode (no `aria-modal`). Escape is listened for on the **document**, not the dialog.
  Escape and the close button are the two ways out; click-outside-to-close on desktop was removed
  deliberately.
- **Owner ruling, as recorded.** *Owner ruling as recorded in the `price-breakdown.tsx` comment
  (M6-AUD-013), dated 2026-09-09 there; `docs/STATUS.md` records the same ruling ("remove the desktop
  dim"). Not re-confirmed with the owner on 2026-10-06.* The three coherent fixes were put to the owner
  and they chose the smallest: remove the desktop scrim.
- **Why.** It had been modal for a pointer and not for a keyboard: a scrim at ≥ 900 px made the scene's
  camera presets unreachable by pointer while Tab walked out onto them, so a keyboard could activate
  controls a pointer could not, and the dialog could not truthfully advertise `aria-modal` on either
  shell. "Modal on both" was rejected because frame 2D keeps the mobile scene live behind the sheet and
  DEVELOPMENT-SPEC §10.1 forbids branching behaviour on the viewport in React.
- **A trap would not replace the document listener.** A Tab wrap does not stop a `blur()`, and the tap
  behind the sheet is a blur. **Dismiss-on-blur is deliberately absent:** it would close the sheet the
  moment the tap behind it landed, making the two adversarial tests guarding this behaviour pass
  *before* Escape is pressed; if ever wanted it lands together with those tests re-pointed.
- **Escape ordering.** The listener is registered only while open. No other module under `apps/web/src`
  listened for Escape when the comment was written ("verified, not assumed"); the rule for a second
  dismissable surface is that the topmost registers last and **no handler calls `stopPropagation`**. The
  settings sheet is the application's modal surface and keeps its scrim, trap, `aria-modal` and `inert`.
- **Where.** `apps/web/src/price/price-breakdown.tsx`.

## Decision 6 — the settings sheet opens on what it displays, and an absent choice stays absent

- **Rule.** `resolveOpeningChoice` makes the sheet's opening pending state the **resolved** one:
  a stored tier id the book no longer offers is rewritten to the offered fallback (so whatever the
  customer sees checked is what one press stores). **A choice the design does not name stays unnamed.**
  The **depth is deliberately not resolved** on open.
- **Why (resolution).** Previously the sheet opened on the stored selection verbatim. A design carrying a
  withdrawn tier displayed the group's default as checked while pending still held the withdrawn id, so
  the checked radio fired no change event and *Aplică* compared the withdrawn pending id against the
  identical applied id and exited as unchanged; pricing stayed unavailable and the only escape was to
  pick another tier and come back (comment: verified in a browser against a real document holding
  `materialTierId: "material.withdrawn"`; id M6-AUD-012).
- **Why (absent stays absent).** Seeding an absent tier with the book's default would make *Aplică* on an
  untouched sheet stamp defaults into a document that deliberately chose nothing — the opposite of
  `applyPending`'s *apply writes only what changed*.
- **Why (depth).** Committing the depth fallback rebuilds every body and redraws the scene
  ([ADR 0074](0074-the-scene-rebuilds-whole-at-a-depth-change.md)), "a different class of act from
  writing a tier id, and one no decision has ruled may happen on a press the customer did not aim at the
  depth. Recorded rather than fixed in passing."
- **Where.** `apps/web/src/settings/global-settings-model.ts`.

## Decision 7 — the overflow warning is a bottom overlay and must not be restored as a flow band

- **Rule.** [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)'s scene warning is an
  overlay pinned to the bottom edge of the scene box, above the price bar and stacked below the orbit
  hint by `.sceneFooter`; it takes no flow height. Do not restore it as a flow band above the scene.
- **Why.** §9's sheet is pinned to the viewport at 78 dvh, so every band above the stage comes out of the
  strip of scene left visible above the sheet — the only part of the scene tappable while the panel is
  open, and how the sheet is dismissed. Measured in Chromium at 390 × 844 on the seeded design (comment's
  figures, quoted): the strip is **130.68 px** with no band, **86.74 px** with the settings row
  (43.9375 px) and header (55.0000 px), and **30.74 px** with a further 56 px band, which is under
  §10.1's 44 px touch target. A conditional flow band would also give the canvas two heights, so every
  e2e canvas tap constant would have two correct values.
- **What the overlay costs, as measured in the comment.** It paints over no cabinet in any camera preset
  at 390 × 844 (clearance to the lowest painted pixel: 25.05 px on Perete A, 45.06 on Perete B, 49.06 on
  Vedere generală), measured off the WebGL buffer with `preserveDrawingBuffer` on, and cannot cover the
  selected cabinet: the sheet's top edge (86.74 px into the scene box) is above the nearest cabinet
  (109.9 px). The comment records that an earlier figure ("6.8 to 13.7 px") was wrong, from a projection
  model with three errors, now held by `overflow-warning-viewport.test.ts`.
- **Where.** `apps/web/src/scene/overflow-warning-layout.ts`.

## Decision 8 — a marked body framed off screen is accepted behaviour, and its pixel gate is a tripwire

- **Owner ruling, as recorded.** *Owner ruling as recorded in the `overflow-mark.e2e.spec.ts` comments,
  dated 2026-09-16 there (wave 7H, Q7H-8); also recorded in `docs/backlog/open.md` entry 67 and
  `docs/STATUS.md`. Not re-confirmed with the owner on 2026-10-06.* In the comment's words: the band is
  what tells the customer their kitchen overflows, the body is still editable through the rail, and a
  marked body framed off screen is not a defect and does not violate ADR 0065 decision 1.
  [ADR 0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md)
  Amendment B names that the owner was ruling on it, not the verdict.
- **Consequence for the test.** The comment restates the claim rather than lowering a floor: *the wash
  reaches the framebuffer* (ADR 0091 decision 6), measured against the noise floor `MAX_ABSENT_PIXELS`
  ("0 on the fitting design in every preset, 40 of slack for antialiasing"), not a prominence bar. The
  marked count after the camera change was **333** ("not one marked body is reachable anywhere on the
  canvas"); backlog 67 quotes 333 against 7 875 before. `MIN_MARK_PIXELS` keeps its measured value as a
  **tripwire** for the ruling's own trigger: if a later wave frames the marked bodies again, that
  assertion goes red and the prominence assertion is to be restored rather than the number raised.
- **What is lost.** The browser-level proof that the wash is not a raycast target; the adapter's own
  suite still holds that claim.
- **Related, recorded.** Backlog 67 (tapping the warning moves the camera to the marked body; the owner
  added that it is *"great to have"*, quoted at that entry).
- **Where.** `apps/web/tests/e2e/overflow-mark.e2e.spec.ts`.
