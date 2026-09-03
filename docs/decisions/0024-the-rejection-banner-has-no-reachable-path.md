# ADR 0024 — §9's rejection banner has no reachable path, and that is the rule working

Status: **Superseded in its central claim, 2026-09-03.** The finding below — that no customer can
reach §9's rejection banner — **is false.** A double-tap on `Șterge corpul` reaches it. The
reasoning about the *width and offer paths* stands and is still correct; what was wrong was
inferring "no path exists" from "no path exists through the offer set". See the amendment at the
foot of this file before relying on anything here.
Date: 2026-08-26
Type: Finding + Decision
Milestone: M4 Wave 4D — found while writing the browser tests; closes M4 with the gap named

## Context

M4's Verification section asks for "browser tests for the rejection state's three simultaneous
requirements: marked chip, retained valid value, unmoved total" (frames 2C / D2C).

Wave 4D went looking for a path to a refusal that a customer could actually reach through §9's panel,
and there is none. Not "none that was found" — none by construction:

- The replace list is the **fit-filtered** offer set. `offersFor` and `insertBody` share one
  evaluation (`resolveInsertOpening` + `evaluateInsertFit`) over the same records, voids and frozen
  columns, so every pre-probe guard agrees exactly. A row that would be refused is not offered.
- `BODY_PROBE_UNAVAILABLE` is pre-empted on the row: offer rows are disabled with that reason until
  the scene's `BodyProbe` attaches.
- `setFinish` and `setHandle` are gated on the identical `PlacementRecord` flags the domain commands
  check, so neither can refuse.
- `remove` is gated on `canDelete`, and no insertable body can become an accessory.
- Read-only disables every control (Wave 4C).

The suite proves the absence rather than asserting nothing: across the whole of §10's signature flow
and the whole §10 loop, `data-rejection` stays empty and `panel-rejection` count stays 0.

## Decision

**M4 closes with this criterion recorded as unmet-and-why, rather than met, revised away, or
quietly dropped.** Three parts:

**1. The unreachability is evidence, not a hole.** §9 states the rule directly: "Never offer what
cannot be satisfied… Every remaining refusal is a bug in a list, not a feature", and M4's own
criteria say "a refusal reaching the customer is treated as a defect in a list, not as expected
behaviour. Any refusal observed during QA is filed against the list that offered it." A panel with no
reachable refusal is that rule holding. Writing a browser test for the banner would require first
building a list that offers something the engine refuses — manufacturing the defect the rule exists
to prevent, in order to photograph it.

**2. The banner's three requirements stay covered by model tests, and that is stated plainly.**
`apps/web/tests/panel/` asserts the banner renders at the top of the panel body above every section,
including when it is the only section — the placement §9 calls out with its own WHY, because
authored inside the width section it was invisible on exactly the fixed-width bodies that refuse
most. What is *not* covered is the rendered banner in a browser, and no claim to the contrary is made
anywhere.

**3. The third requirement is deferred to M6 because it cannot exist yet.** "The total does not move"
needs a total. There is no price bar until M6, and §12 requires price to be derived from
`placements` and never stored. M6 inherits this: when the price bar lands, the 2C requirement to
verify is that a refused edit leaves the total unchanged and, on desktop, explicitly labelled
unchanged.

## Alternatives considered

- **Keep M4 open until a browser path exists.** `docs/WORKFLOW.md`'s literal rule, and it was the
  default. Rejected on the owner's direction of 2026-08-26: the criterion is unsatisfiable by a
  correct implementation, so holding the phase open would block M5 on a test that should never become
  writable. Recorded as a decision rather than an oversight.
- **Revise the criterion to the no-refusal-reaches-the-customer assertions that now exist.** Tempting
  and nearly right, but it edits the acceptance criteria to match what shipped, which is the habit
  this project's close-out rules exist to prevent. The criterion stands as written; this record says
  why it is not met.
- **Manufacture a refusal behind a test-only flag.** Rejected: a code path that exists only to make a
  test possible is a second, unreviewed way for a refusal to reach the panel.
- **Force a refusal by racing the `BodyProbe`.** Considered — tapping an offer row in the window
  before the probe attaches. Rejected: the rows are disabled in exactly that window, so it would test
  that a disabled button can be forced, not that the banner renders.

## Consequences

- M4 closes with one acceptance criterion explicitly unmet, named here and in `docs/STATUS.md`.
- **M6 inherits the third requirement** and should treat it as a carried M4 item, not a new one.
- If a future wave adds a control that *can* refuse — M5's width chips are the obvious candidate,
  since §5.4's boundary move has real failure modes — the banner becomes reachable and this test
  becomes writable. That is the moment to revisit this record.
- The standing rule is unchanged and worth restating, because it is what makes the gap acceptable:
  any refusal observed reaching the customer is filed against the **list that offered it**, not
  against the banner.

---

## Amendment, 2026-09-03 — the banner is reachable, and M4's debt is now closed on screen

**Found by wave 6C's visual verification**, which went looking for a refusal in order to prove the
price bar holds its figure during one, and found a route this record did not anticipate.

**The route: a double-tap on `Șterge corpul`.** The first click deletes the body; the second lands
on the now-void selection and refuses `VOID_SELECTED`. Both clicks land before React re-renders,
which is why the button is still there to receive the second. This is an ordinary customer gesture —
double-tapping is routine on a touch screen — not instrumentation, not a forced DOM state, and not a
manufactured refusal.

**The evidence.** Two fresh controlled runs deleting the same body `p2`, single click against
double, with the total measured against an accepted-delete-only control:

| | single | double |
| --- | --- | --- |
| total after | `91 000 MDL` | `91 000 MDL` |
| bar label | `De la` | `De la neschimbat` |
| banner | none | `Aici nu se află niciun corp.` |

The refusal moved the figure by **zero** and relabelled it unchanged while the banner stood. The
same on mobile. Screenshots at `.playwright-mcp/qa6c/07-desktop-rejection-D2C.png` and
`16-mobile-rejection-2C.png`.

**What this changes.**

1. **M4's third frame-2C requirement is closed in a browser, genuinely** — not at the model level, as
   wave 6C's close-out was about to record. The rejection state's three simultaneous requirements
   are now observable together on screen, which is what M4's Verification section asked for and
   could not obtain. That is a better outcome than this record allowed for.
2. **The width and offer-path reasoning above is untouched and still correct.** Wave 6C's
   implementer independently re-confirmed it: all 26 placements enumerated, every blocked chip and
   step already rendered `disabled` carrying its reason, and force-enabling one in the DOM does
   nothing because React reads `disabled` from the fiber's props rather than the node. A refusal
   cannot be manufactured there either, which is what this ADR wanted.
3. **The error was in the quantifier, not the analysis.** "None by construction" generalised from
   one family of paths — the fit-filtered offer set — to every path. The delete command is not in
   that family: it does not consult the offer set, and its refusal comes from the selection going
   void between two clicks rather than from a fit evaluation. Worth keeping as the shape of the
   mistake: an exhaustive-sounding claim proved over one mechanism.

**A product question this raises, deliberately not settled here.** The mechanics are right; the copy
is wrong for the way it is now known to be reached.

`Aici nu se află niciun corp.` — "there is no cabinet here" — is a true statement about a void the
customer **deliberately selected**. On this route they selected nothing: the app moved the selection
out from under their finger between two taps of one gesture. So the sentence answers a question they
did not ask, and implies they aimed at empty space. Two taps on delete is not a mistake; it is
impatience with a round trip.

**And it collides with the price label.** The bar reads `De la neschimbat` at the exact moment the
total *did* change — because the first tap of the same gesture changed it. Both sentences are
individually true and together confusing: one says nothing happened, the other says nothing is
there, and what actually happened is that the customer's cabinet was deleted.

**The cheapest fix is not new copy — it is not offering the second click:** the delete button should
leave the footer with the body it deleted. Recorded as open and owned by a later wave. Wave 6C is
not the place for it, and the visual verification that found the route said so explicitly.
