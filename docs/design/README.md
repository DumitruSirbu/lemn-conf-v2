# Design reference

Copied out of the supplier's original deliverable (`design-source/Modern Kitchen Cabinets 3D (3)/`)
so the project owns everything it depends on.

That folder is **not tracked in git** and will be deleted from the working tree once the port is
finished. Anything the repository needs from it lives here, or — for the reference geometry the test
suite imports — in `packages/three-adapter/reference/`. Nothing in the codebase may read from
`design-source/` directly.

| File | What it is |
| --- | --- |
| `DEVELOPMENT-SPEC.md` | The authoritative behavioural spec. Milestones cite it by section (`§4`, `§6.1`) and by `§11` row number. Supersedes `SPEC.md` — see `docs/decisions/0003-design-reference-supersession.md`. |
| `SPEC.md` | The original supplier spec, kept for provenance. Where the two disagree, `DEVELOPMENT-SPEC.md` wins. |
| `mockups/Lemnaria Configurator Desktop.dc.html` | Desktop screen mockups. Milestones cite frames as `D2A`, `D2D`, `D2E`. Since 2026-10-18 it opens with a *Presete v2* section that imports `Presete.dc.html` (desktop frames) and says it replaces D1D/D1E below it. |
| `mockups/Lemnaria Configurator Mobil.dc.html` | Mobile screen mockups. Frames cited as `2A`, `2D`, `2E`, `3A`, `4A`, `5A`. Since 2026-10-18 it opens with a *Presete v2* section that imports `Presete.dc.html` (mobile frames) and says it replaces 1D/1E below it. |
| `mockups/Presete.dc.html` | The preset screens, v2 (owner's export, 2026-10-18; brief: `claude-design-brief-preset-screens.md`). Frames 1D, 1E (revised), 1G, 1H, 3S, 3T and their desktop twins (`D1D` … `D3T`), each state and the Russian variants beside the default. Opened alone it shows both surfaces with a header; the two files above import it with `surface="mobile"` / `surface="desktop"`. Cite a frame by chip and element id, e.g. `Presete.dc.html#1g-single` (chip *1G · d*). Planned against in `docs/milestones/M8D-preset-screens-to-mockup.md`. |
| `mockups/support.js` | The `.dc.html` runtime (generated, *do not edit*). Every `.dc.html` file here loads it; without it a frame is an unrendered template. |
| `mockups/shots/presets/01-p.png` … `04-p.png` | The four placeholder kitchen pictures the preset frames draw (old 1E, the v2 cards, slides and editor backdrop). They are not 4:3 (924 × 540) and are not product thumbnails. |
| `mockups/Alegere corp - layouturi.dc.html` | Cabinet-selection and layout mockups. |

All mockup files are copied **verbatim** from the owner's export; nothing in them is edited (ADR 0104
decision 1). The 2026-10-18 copy was checked byte for byte (`cmp`) against
`design-source/presets/`. The pre-commit formatter leaves them alone (`docs/` is in `.prettierignore`;
`prettier --file-info` reports `support.js` and `Presete.dc.html` as ignored), and no package's `lint`
script reaches `docs/`.

## Opening the mockups

Serve the folder over HTTP and open the file in a browser, for example
`python3 -m http.server 8000` from `docs/design/mockups/`, then `http://localhost:8000/Presete.dc.html`.

- **Not from `file://`.** `support.js` fetches the page itself and each `dc-import` sibling
  (`Presete.dc.html`) with `fetch`, which a browser refuses for `file://` pages.
- **Needs internet access.** `support.js` loads React 18.3.1, ReactDOM 18.3.1 and Babel standalone
  7.29.0 from `unpkg.com`.
- **Expected 404s, harmless:** `kitchen-3d.html` (the live-3D iframe of frames 2B / D2B, not copied —
  those two frames stay blank), and two requests for a literal `{{ c.img }}` / `{{ f.img }}` made
  before the template is filled in.

Rendered on 2026-10-18 with headless Chromium (Playwright) against that server: `Presete.dc.html`
93 of 93 images loaded, no unfilled `{{ }}` left in the text; both screen files rendered their
*Presete v2* section with the imported frames.

## Line citations shifted on 2026-10-18

The v2 export **inserts five lines** near the top of both screen files (the *Presete v2* section).
A `…dc.html:N` citation written before this copy (any commit up to and including `bb112df0`) reads:

- `Lemnaria Configurator Mobil.dc.html:N` with N ≥ 39 → now line **N + 5**;
- `Lemnaria Configurator Desktop.dc.html:N` with N ≥ 37 → now line **N + 5**.

Lines above those are unchanged. On 2026-10-18 there were 91 explicit `…dc.html:N` citations in 21
files under `docs/`, `apps/` and `packages/` (build output and `node_modules` excluded; bare `:N`
citations beside a named file are not counted); they are not rewritten. The one test that reads these files (`apps/web/tests/price/price-breakdown-copy.test.ts`)
matches text, not lines, and passed against the new copies (17 of 17, run 2026-10-18). The export also
changes one editor default in each file's script, `priceTotal` `"60 000"` → `"60.000"`; the drawn
figure already read `60.000`, and the application's grouping is not decided by the mockup (ADR 0095).

## Not copied, and deliberately so

- `uploads/` and the old `shots/` (source imagery and M1 reference screenshots) — inputs to M1's
  visual fidelity work, which is complete; the fidelity capture scripts in `apps/web/scripts/` still
  point at `design-source/` and only run while that folder is present locally.
- The runnable rig: `kitchen-3d.html`, `three-d-stage.js`, `preset-shots.html`, `cabinets/*.svg` and
  the export's own `kitchen-parts.js`. A second `kitchen-parts.js` here would diverge from the
  corrected copy in `packages/three-adapter/reference/` (ADR 0005). Frames 2B / D2B therefore show
  an empty iframe, as they did before.
- The export's `DEVELOPMENT-SPEC.md` and `SPEC.md`: older than the copies above, which the project has
  since amended.
- ~~`Lemnaria Cont Lot 1.dc.html` and `ContBlocks.dc.html`~~ — **copied since 2026-10-18** (owner answer O-6,
  commit `1d08a894` [coordinator's brief; the scribe did not run `git show`]) into `docs/design/mockups/`, verbatim.
  They are the account screens (create account, confirm e-mail, sign in, forgotten and new password); they belong to
  M8B, not the preset work. Open them as the others: serve `docs/design/mockups/` over HTTP (see *Opening the mockups*
  above) and visit `http://localhost:8000/Lemnaria%20Cont%20Lot%201.dc.html` or `…/ContBlocks.dc.html`. Not rendered
  or verified by the scribe, and they are not yet in the file table above.
- `Lemnaria Cont Lot 2.dc.html` and `ContBlocks2.dc.html` (client dashboard, frames `A9`-`A20` and `DA…`) are also in
  `docs/design/mockups/` (**source-verified 2026-10-19 by a file listing; the commit is named `docs(m8b): Lot 2 account
  screens (A9-A20) mockups and port plan` in the branch reflog**). They belong to M8B, and the plan that reads them is
  [`M8B-account-screens-lot2-plan.md`](../milestones/M8B-account-screens-lot2-plan.md). Not rendered by the scribe, and not
  yet in the file table above. **Dated note 2026-10-20 [owner ruling O1, relayed]:** the frames A15A-A15D, A16A and their
  desktop twins are **dropped** (autosave only, no Save / Discard), and "Modificările vor fi pierdute" in the back-guard
  frames is untrue. A16B and DA16B survive, re-triggered as a Step-1 card (plan §14.2). Do not build the dropped frames.
- `Lemnaria Cont Lot 3.dc.html` (staff area, screens S1-S8, 68 frames) and the **extended** `ContBlocks2.dc.html`
  (replaces the Lot 2 copy; a superset of it per the plan) are in `docs/design/mockups/` (copied 2026-10-20; sha256 checked against the plan:
  `637e7aec…39b182` for Lot 3, `8be0fd0b…7623ea` for `ContBlocks2`, both matching). The Lot 2 page is not yet re-rendered to
  confirm its frames are unchanged. The plan that reads them is [`M8B-account-screens-lot3-plan.md`](../milestones/M8B-account-screens-lot3-plan.md).
  S6 (Prețuri) and S7 (Traduceri) are **deferred by the owner**; do not build them (ADR 0174).

`support.js` was in this list until 2026-10-18. The screen files already loaded it, so before that
date the tracked mockups could not render on their own; it is now copied because the v2 preset
frames are produced entirely by its runtime from data in a script.

## Reference geometry

`packages/three-adapter/reference/kitchen-parts.js` is the supplier's `kitchen-parts.js`, vendored
into the package whose tests import it via the `@reference/kitchen-parts` alias. M1's structural
parity suite diffs the ported builders against it at a 1e-6 m epsilon, so it has to survive
`design-source/` being deleted.

It is not verbatim: `buildKitchen()`'s wall seating was corrected in step with the port when six
bodies were found sitting 10–20 mm proud of the wall plane. See
`docs/decisions/0005-m2-row19-m1-wall-gap-finding.md`. Treat it as a fidelity anchor that moves
only alongside a matching, documented change to the port.
