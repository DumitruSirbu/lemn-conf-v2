# Reference catalog seed

This directory is a traceable extraction of the existing procedural Three.js reference. It is
input to later catalog design, not approved commercial catalog or pricing data.

Sources:

- `design-source/3D design reference/kitchen-parts.js`
- `design-source/3D design reference/SPEC.md`

`reference-catalog.json` records only exported preview builders and source-stated nominal sizes.
`reference-l-preset.json` records the exact authored L-scene placements, including direct builder
calls that have no exported builder key. Prices, SKU mappings, selectable finishes, selectable
handles, arbitrary resize rules, linear/U presets, and commercial compatibility are intentionally
absent because the source does not define them.

All dimensions and transforms are metres. Positions are source scene-space transforms; they are
not yet normalized domain placements. `yawRadians` uses the source's Three.js Y rotation.
Dimension tuples named `fixedSize` use `[width, height, depth]`; builder `args` preserve the
source function's native argument order.
