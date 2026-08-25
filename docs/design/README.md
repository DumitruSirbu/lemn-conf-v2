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
| `mockups/Lemnaria Configurator Desktop.dc.html` | Desktop screen mockups. Milestones cite frames as `D2A`, `D2D`, `D2E`. |
| `mockups/Lemnaria Configurator Mobil.dc.html` | Mobile screen mockups. Frames cited as `2A`, `2D`, `2E`, `3A`, `4A`, `5A`. |
| `mockups/Alegere corp - layouturi.dc.html` | Cabinet-selection and layout mockups. |

Not copied, and deliberately so: `uploads/` and `shots/` (≈3.8 MB of source imagery and reference
screenshots) and the runnable rig (`preset-shots.html`, `kitchen-3d.html`, `support.js`,
`three-d-stage.js`). They were inputs to M1's visual fidelity work, which is complete; the fidelity
capture scripts in `apps/web/scripts/` still point at `design-source/` and only run while that folder
is present locally.

## Reference geometry

`packages/three-adapter/reference/kitchen-parts.js` is the supplier's `kitchen-parts.js`, vendored
into the package whose tests import it via the `@reference/kitchen-parts` alias. M1's structural
parity suite diffs the ported builders against it at a 1e-6 m epsilon, so it has to survive
`design-source/` being deleted.

It is not verbatim: `buildKitchen()`'s wall seating was corrected in step with the port when six
bodies were found sitting 10–20 mm proud of the wall plane. See
`docs/decisions/0005-m2-row19-m1-wall-gap-finding.md`. Treat it as a fidelity anchor that moves
only alongside a matching, documented change to the port.
