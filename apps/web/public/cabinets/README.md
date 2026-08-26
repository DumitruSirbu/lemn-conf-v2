# Cabinet thumbnails

Front-elevation line drawings for §9's replace/insert list, one per catalogue body.

**Vendored on purpose.** These were copied out of `design-source/…/cabinets/`, which is untracked
and will be deleted — the same treatment `packages/three-adapter/reference/` gets for the reference
geometry, and for the same reason: the project must own everything it depends on
(`docs/design/README.md`). The folder there has already been renamed once between exports, and was
briefly believed lost.

## Conventions (`DEVELOPMENT-SPEC.md` §13.4)

- Standalone SVG. No CSS, no classes, no external references. They are rendered as a CSS
  `background-image`, so an unresolved value paints nothing instead of firing a failed request.
- `viewBox` plus a `<title>` in English on every file.
- Ink `#1c1814`; body fill `#ffffff`; worktop `#e3d3b8`; plinth hatch `#c7c7c7`. Appliance drawings
  add `#dcdcdc`, `#eef3f5` and `#9a9a9a` for glass and steel.
- Stroke hierarchy — carcass heaviest, detail at roughly half weight. The values differ per family:
  base units 10.1 / 5.6 / 5.1 / 2.8, wall units 8.5 / 4.7 / 4.3, full-height units up to 22.9.
  **Match the peer file**, not a single global rule.
- `viewBox` sizes are drawing sizes chosen for legibility, not strict scale. Heights by family:
  base **310**, base with something on the worktop **350**, wall **260**, full-height **700**.

## Two pairs that must stay visually distinct

Both appear in the _same_ picker list and mean different things, so a customer confusing them orders
the wrong product. Check any redraw at the real **54 × 54** tile, not at full size.

- `tall-fridge-housing` (integrated, behind furniture doors — light lines, plinth, furniture handle)
  versus `tall-fridge` (freestanding appliance — heavy frame, appliance handles, no plinth).
- `wall-lift` (top-hinged flap, handle on the bottom edge) versus `wall-glass`.

## Drawn but unused

`base-open-shelf.svg`, `wall-glass.svg` and `wall-microwave.svg` have no catalogue entry yet. Kept so
nobody redraws them if those bodies are added.
