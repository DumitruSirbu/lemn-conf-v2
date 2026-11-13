# M10 hydration error #418 on customer editor load: diagnosis

Diagnosed 2026-11-11, branch `m10-price-dashboard`, HEAD `d3cb086b`. Diagnosis only: no source edited, nothing committed.
Source is `docs/milestones/m10-z1-visual-pass-report.md`, defect 1.

## Verdict

Not a product defect and not an M10 regression. It is a harness artifact: the visual pass started a production server
with `NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG=1` in its runtime environment, but the `.next` build it served was
made without that variable. The server then renders the e2e-only `SelectionDebug` node, the client bundle does not,
and React reports #418. A real deployment sets the flag on neither side, so customers do not see it.

## Exact message

Minified, as captured by `pageerror` (identical to the visual pass log):

    Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= ...

That is React's "Hydration failed because the server rendered HTML didn't match the client" (args: `HTML`, empty).
The full dev-mode text was not captured, because the mismatch does not occur in dev (see Evidence, row 1): `next dev`
inlines the flag on both sides.

## Component

`apps/web/src/app/configurator/configure/selection-debug.tsx`, `SelectionDebug()`. Its gate reads
`process.env.NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG`. `selection-debug-availability.ts` already documents the
cause: with the variable absent at build time Next "emits a runtime read against its `process` shim rather than folding
the comparison". On the server that read sees the runtime value (`1`) and renders `data-testid="selection-debug"`; in
the browser the shim has no value, so the node is absent. `ConfigureScreen` renders the component on `/<locale>/d/<id>`
only, which is why staff pages and the room page never show it.

## Evidence (what was run, all against the staging database through the e2e harness env)

| # | Build served | Runtime env | Result |
|---|---|---|---|
| 1 | `next dev` of HEAD | e2e env, flag unset | 0 errors (ro/ru, 390 and 1440, load and reload) |
| 2 | prod build of HEAD, flag unset at build | flag unset | 0 errors |
| 3 | prod build of HEAD, flag set at build | flag set | 0 errors (also via the repo's own `openSeededDesign` flow and the visual pass's `d.visual.ts`) |
| 4 | the visual pass's own `.next` (built 00:45) | flag unset | 0 errors |
| 5 | the visual pass's own `.next` | flag set at runtime (what `playwright.config.ts` webServer env does) | 1 error per load, desktop and phone; SSR HTML contains `data-testid="selection-debug"` |
| 6 | the visual pass's `d.visual.ts` against that `.next` | webServer env | 7 `pageerror` lines, 0 against build 3 |

Row 5 versus rows 2 and 4 isolates the flag; row 3 shows that building with it removes the error. Labels: rows are
executed and quoted by me; the build that produced the visual pass's `.next` is inference (its env was not recorded),
supported by rows 4 to 6.

## Introduced by

Predates M10. The gate and its flag wiring in `playwright.config.ts` come from commit `01070892`
(2026-08-31, "fix(web): stop offering edits the page can..."). `0910dc06` (the pre-M10 base, 2026-10-25) already holds
both, and `git diff 0910dc06 HEAD` leaves `selection-debug.tsx` and `selection-debug-availability.ts` unchanged. A base
checkout was not built: a build of an unchanged component under the same env cannot differ.

## Proposed minimal fix (not applied)

The product needs nothing. To stop the visual pass (and any local `next start` run under the e2e env) from raising it,
pick one:

1. Procedure: build with the same env the server runs under, i.e. the webServer env of `playwright.config.ts`, as the CI
   path already does (`pnpm run build && next start` inside the webServer command). For a visual pass:
   `NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG=1 pnpm run build`, then start with the same value. Record this in
   `docs/best-practices/browser-and-visual-qa.md`.
2. Guard (small code change, optional): in `playwright.config.ts` fail fast when the flag is in the server env but the
   `.next` build was made without it, or stop passing the flag at runtime for a pre-built server. A `NEXT_PUBLIC_` value
   is a build-time input, so a runtime-only setting is always a misconfiguration.

## Cleanup

Servers I started (ports 4323 to 4326) are stopped; no process I did not start was touched. Scratch worktrees under the
scratchpad were removed. The 15 design rows I minted in staging were deleted with `deleteDesignsForTests` (15 found, 0
left). Unsaved mints leave a few mint-limiter counter rows under run-specific digest keys that cannot be recomputed;
the daily prune cron removes them. No env file or variable was changed, no secret printed.
