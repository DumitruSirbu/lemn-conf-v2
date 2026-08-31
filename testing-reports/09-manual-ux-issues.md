# Manual UX Testing — Live Issues Log

Raw issues as reported by the user during manual testing of the configurator, in the order received. Not yet triaged or planned — see end of file for status.

---

## Issue 1 — Screenshot 2026-08-31 13.46.55.png

Context: "Corp bază 3 sertare" panel, Pasul 2 din 4, LĂȚIME step, width control at 350 mm (range shown: −50 mm / 350 mm / +50 mm).

1. **Ghost/orphaned side panel on resize.** When minimizing the cabinet's size, the left side panel ("woody" material) stays in its original place instead of following the cabinet as it shrinks. Leaves a floating panel detached from the cabinet. Possibly this panel should just be removable/not rendered separately.
2. **"+50 mm" width control permanently greyed out.** The maximize option appears disabled even when there should be room to grow — reported as a recurring/common issue, not isolated to this cabinet. Expectation: it should only grey out once the actual min/max limit is reached, not before.
3. **Tooltip on the disabled +50 mm explains the block**: "„Corp bază 3 sertare" nu poate ajunge la 400 mm: coloana ar trebui să ocupe 50 mm, dar în dreapta ar rămâne un spațiu sub 300 mm, iar în stânga nu este spațiu liber." — i.e. the system is intentionally blocking because growing would leave a sub-300mm gap on the right and there's no free space on the left. Need to reconcile this stated logic with issue #2 (user perceives it as "always" greyed out, suggesting the constraint may be miscalculated or the UI doesn't communicate remaining room clearly).

---

## Issue 2 — Screenshot 2026-08-31 13.51.36.png

Context: sequence of removals on upper + lower cabinet rows (wall/base run), empty-space-merge behavior expected.

Steps taken: resized the cabinet on the right first → removed it (left 2 columns with empty ghost/placeholder spaces) → then removed the left cabinets → now left with 3 columns showing missing/empty cabinet placeholders (dashed ghost boxes visible where cabinets used to be, both upper and lower rows).

4. **Empty spaces from removed cabinets are not merging.** User previously requested that adjacent empty spaces left by removed cabinets merge into a single contiguous gap. Instead each removed cabinet leaves its own separate empty placeholder slot. Question raised: was a decision made to change/override that previous behavior, or is this a regression?

---

## Issue 3 — Screenshot 2026-08-31 13.55.20.png

Context: "Spațiu liber" (empty space) panel, Pasul 2 din 4, Perete A · bază · 300 × 860 mm, "PUNE UN CORP AICI" list showing "4 corpuri intră în 300 × 860 mm".

5. **Direct consequence of Issue 4 (no merge of empty spaces).** Because adjacent empty slots aren't merging, each leftover gap stays capped at its own small width (300 mm here). This limits which cabinets can be placed there to only 4 options that fit 300 mm. User notes that if merging worked as requested, the gap would be 600 mm and a much larger set of cabinets could be placed. Confirms #4 is not just cosmetic — it's actively restricting usable catalog options in the empty-space picker.

---

## Issue 4 — Screenshot 2026-08-31 13.57.53.png

Context: "Nișă mașină de spălat vase" (dishwasher niche) panel, LĂȚIME step, only a single fixed width button ("450") shown plus greyed "600 mm" target with disabled-state tooltip.

6. **Can't resize back up after shrinking.** After resizing the dishwasher niche down from 600 mm to 450 mm, the user cannot choose 600 mm again — the option is greyed out/blocked. Tooltip states: "„Nișă mașină de spălat vase" nu poate ajunge la 600 mm: colo[ana...]" (truncated in screenshot, same column-space-constraint logic as Issue 1). Column-level width is fixed-step ("Coloana asta se face doar în lățimile afișate... Alegerea schimbă lățimea întregii coloane, nu doar a acestui corp.") — likely the same root cause as Issue 2 (+50mm greyed out / column resize blocked due to neighboring space constraints that may be miscalculated or not clearly communicated, and possibly linked to Issue 4's empty-space-merge gap not freeing up room for the column to grow back).

---

## Issue 5 — Screenshot 2026-08-31 14.00.09.png

Context: "Corp spălător" (sink cabinet) panel, Perete A · bază · 650 × 860 mm, LĂȚIME step, +50mm greyed out at 650mm.

7. **Sink+faucet cabinet can't widen to expected 800mm max.** User expects to be able to grow this cabinet up to 800 mm but +50 mm is blocked at 650 mm. Tooltip: "„Corp spălător" nu poate ajunge la 700 mm: coloana ar trebui să ocupe 50 mm, dar în dreapta ar rămâne un spațiu sub 300 mm, iar în stânga nu este spațiu liber." — same column-space-constraint pattern as Issues 1 and 4. User's read: "looks like limitations min/max are not properly calculated/applied" — reinforces suspicion that the column-growth blocking logic (or the underlying available-space calculation feeding it) has a bug, not just a UX communication gap. This is the third independent report of the same +50mm-blocked pattern (see Issues 1, 4, 5) — strong signal this is a systemic bug in the column resize/space-availability logic, likely tied to Issue 4's empty-space-merge defect.

---

## Issue 6 — Screenshot 2026-08-31 14.02.57.png

Context: "Coloană" (tall/pantry column) panel, Perete B · coloană · 600 × 2200 mm, showing "Nișă frigider integrat" option in the corp-type list.

8. **Product/spec request, not a bug: tall cabinet resize range + door-count rule.** User proposes this tall cabinet (double-door, not appliance-dependent — no oven/microwave inside) should be the *only* corp type that's resizable, with min 400 mm / max 800 mm. Reasoning: unlike appliance columns (oven/microwave), this one has no fixed-size electronics constraining it, so it's free to resize. Additionally proposes a width-dependent door-count variant: 400–499 mm → 1-door version (would need to be added as a new catalog variant replacing the current one at that range), 500–800 mm → keep current 2-door version. This is a scope/rules change for the catalog logic, not a defect in existing behavior.

---

## Issue 7 — Screenshot 2026-08-31 14.06.48.png

Context: "Corp plită și 2 sertare" panel, Perete B · bază · 600 × 860 mm, no LĂȚIME (width) section visible at all — panel jumps from corp-type list straight to FINISAJ.

9. **No resize options after replacing a tall cabinet with a regular one.** After removing a tall cabinet and inserting a regular (non-tall) one in its place, the new cabinet's panel shows no width/resize controls at all — the LĂȚIME section is missing entirely, not just disabled. User expectation: "If I choose a resizable cabinet it doesn't matter where I insert it, it should provide the resize options" — i.e. resizability should be a property of the cabinet type itself, not of the slot/context it was inserted into. Suggests the resize-controls-rendering logic is keying off placement context (e.g. former tall-column slot) rather than the corp's own resizable flag.

---

## Issue 8 — Screenshot 2026-08-31 14.10.17.png

Context: open-shelf wall cabinet ("top level cabinet with shelves") shown with 3 shelves in the model.

10. **Shelf count wrong for top-row open shelving.** Open-shelf wall cabinet renders with 3 shelves regardless of row position, but user expects it to be position-dependent: 3 shelves when placed in the middle row, only 2 shelves when placed on the top row — reasoning is that top-row vertical space is more limited. Likely a catalog/geometry rule that needs to account for row placement (or available vertical clearance) rather than using a fixed shelf count.

---

## Issue 9 — Screenshot 2026-08-31 14.12.54.png

Context: hob (plită) + oven cabinet, base row, red-boxed gap visible below the cooktop between the countertop cutout and the oven cabinet's front panel.

11. **Unfinished gap on hob + oven cabinet renders as raw empty space.** There's a visible empty gap on the hob+oven cabinet (highlighted red) that isn't rendered as any furniture — it should be filled using the same material/color as the rest of the run, rather than left as an open/undressed cavity. Clarified by user: doesn't need to be a functional door — even a fixed handleless facade panel would resolve it. Cosmetic/geometry defect in this cabinet's model, not a logic bug.

---

## Status
Not yet analyzed/planned. Waiting for more issues before triage.
