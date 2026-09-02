# Configuration model and invariants

Status: **partially superseded 2026-08-24.** Commercial values and exact catalog contents remain
data, not hard-coded behaviour.

> **Supersession notice.** `docs/decisions/0003-design-reference-supersession.md` replaces this
> document's *placement* model with the placement/derived-void model in
> `docs/design/DEVELOPMENT-SPEC.md` §3–§5, and adopts its §12
> persisted `Design` shape (room + `presetId` + `placements[]`, each `wall / alongMm / y0Mm / body`).
>
> **Superseded sections:** "Placement" (`runAnchor`, order partitions), "Junction group", "Derived
> run and occupancy model", "Cross-wall room-space occupancy", "Deterministic packing and free
> space", "Placement invariants" 4–11 and 15–16, the `WallObstacle` half of "Room", the `wall-c`
> transform, and the `reorderCabinet` / `moveCabinetToRunMargin` halves of "Commands and queries".
>
> **Still in force:** "Core principle" (with the qualification below), the cabinet-definition and
> options-catalog contracts, "Preset", "Configuration", "Pricing model boundary", the command
> envelope/result/failure shapes and transactionality, the fixed reference L vertical proof as
> geometric evidence, and "Persistence and migrations".
>
> **Qualification to the core principle.** Positions are still never invented by the renderer and
> still never edited as free coordinates. They are no longer derived from an order index either: a
> placement's position along its wall is authored once — by the preset recipe, or by the free space
> it was inserted into — and then held. Free space is the derived quantity, recomputed after every
> mutation and never persisted.

## Core principle

The saved configuration is the single source of truth for the 3D scene, price, review summary, and
the design snapshot included in a contact submission. Contact fields remain separate.
Three-dimensional positions are derived from room geometry, wall transforms,
placement order, vertical band, and width. They are not independently editable persisted coordinates.

This makes drag/reorder deterministic, keeps price and visuals synchronized, and prevents a saved
configuration from containing visually plausible but structurally invalid coordinates.

## Entities

### Room

> **Superseded in part (2026-08-24).** `WallObstacle` and every door/window rule below it are
> retired; the new reference models no obstacles. `wall-c` and the U-shape wall triple are retired
> as *layout*: the reference models wall A (z=0, fronts +Z, yaw 0) and wall B (x=0, fronts +X, yaw
> +π/2) only. The room-shape picker still offers linear, L and U in the UI, but a shape without an
> approved layout is refused at Screen 1 with a human reason. The A/B transforms, the `M`-suffixed
> metre dimensions, exact grid conversion, and the rule that a cabinet's world origin derives from
> wall run start + tangent + front normal all survive.

```text
Room
  shape: linear | l_shape | u_shape
  heightM: positive number
  walls: Wall[]
  obstacles: WallObstacle[]

Wall
  id: stable identifier
  order: index in the shape's canonical wall order
  lengthM: positive number
  transform: derived position and rotation in room space

WallObstacle
  id: stable identifier
  kind: door | window
  wallId: Wall.id
  offsetM: non-negative number
  widthM: positive number
  heightM: positive number
  bottomElevationM: non-negative number
```

Wall IDs are unique and their orders are contiguous. Linear requires `wall-a`; L-shaped requires
`wall-a` and `wall-b`; U-shaped requires all of `wall-a`, `wall-b`, and `wall-c`.

The canonical room occupies +X/+Z with +Y up:

- `wall-a` lies on Z=0, starts at `(0,0,0)`, runs +X, faces +Z, and has yaw 0.
- `wall-b` lies on X=0, starts at `(0,0,lengthB)`, runs −Z to the `wall-a` junction, faces +X,
  and has yaw `+π/2`.
- `wall-c` lies on X=`lengthA`, starts at the `wall-a` junction, runs +Z, faces −X, and has yaw
  `−π/2`.

Obstacle IDs are unique within the room, stable across edits and persistence, and never derived
from array position. An obstacle is attached to exactly one wall. `offsetM` is measured from that
wall's canonical run start along its positive tangent, so its closed wall interval is
`[offsetM, offsetM + widthM]`; its closed vertical interval is
`[bottomElevationM, bottomElevationM + heightM]`. Its room position, yaw, and facing are derived
from the wall and are not persisted independently. A door has `bottomElevationM = 0`; a window has
no additional hard-coded elevation range.

After exact manufacturing-unit conversion, every obstacle must satisfy
`offset >= 0`, `offset + width <= wall.length`, `bottomElevation >= 0`, and
`bottomElevation + height <= room.height`. Two obstacles on the same wall are invalid when the
interiors of both their wall intervals and vertical intervals intersect; boundary contact is
allowed. Obstacles on different walls do not overlap in wall-local space and never wrap around a
corner. Door swing, handing, frame/reveal detail, sockets, and utilities are outside this contract.

A cabinet's world origin is the wall run start plus its tangent multiplied by the derived interval
centre, plus the wall front normal multiplied by half the cabinet depth. The builder origin remains
at the floor and horizontal centre. L-shaped rooms use A+B; U-shaped rooms use A+B+C. These
equations are tested directly so mirrored winding or fronts facing into a wall cannot pass as merely
"deterministic."

### Cabinet definition

```text
CabinetDefinition
  id
  family: base | wall | column
  verticalBand: base | middle | top | column
  variant
  supportedWidthRules: SupportedWidthRule[]
  defaultWidthM, heightM, depthM
  rendererKey
  replacementGroup
  layoutRole: cabinet | filler | end_panel
  optionSupport:
    materialColourPairs: allowed material ID + colour ID combinations
    handleIds: allowed handle IDs
    mechanismIds: allowed mechanism/hardware IDs
  defaultOptions: optional materialId, colourId, handleId, mechanismId
  pricingRuleId
  placementRules: PlacementRules
```

Definitions describe products and compatibility. They do not contain user selection state. The
initial catalog is extracted from the builders in `design-source/Modern Kitchen Cabinets 3D (3)/` and extended
only through explicit product/catalog work.
Option support is definition-specific. A globally known option is not automatically valid for
every cabinet: selected material and colour IDs must form one declared pair, and selected handle or
mechanism IDs must occur in that definition's corresponding allow-list. Empty lists mean the option
category is unavailable. `defaultOptions` is explicit per definition; an omitted default ID means
intentional `none`. An absent placement option resolves to that field in `defaultOptions`, so
rendering and pricing never infer a default from array order. Default material/colour must be both
absent or one declared pair, and every other default must occur in its allow-list.

The runtime-validatable policy shapes are:

```text
SupportedWidthRule =
  | { kind: discrete, widthsM: non-empty positive number[] }
  | { kind: stepped_range, minWidthM, maxWidthM, stepM: positive numbers }

PlacementRules
  runMargin: unrestricted | placement_touches | contiguous_group_touches
  corner: allowed | prohibited | junction_only
  obstacleClearanceProfileId: stable identifier
```

All width values must convert exactly to manufacturing units. Discrete values are unique;
`stepped_range` requires `minWidth <= maxWidth` and supports only
`minWidth + n * step` values not exceeding `maxWidth`. A definition has at least one rule and its
default width must satisfy one. The accepted initial catalog uses approved discrete values;
`stepped_range` defines a schema shape only and does not approve or invent any commercial bound.

`runMargin` expresses the existing edge rule without embedding catalog-specific distances.
`contiguous_group_touches` applies to the maximal contiguous group of placements sharing that
`runMargin` enum and the same start/end anchor on one wall/band. Definition ID, replacement group,
and obstacle-clearance profile do not split that contiguous group. `placement_touches` requires
that individual placement to own the margin edge. `corner` declares whether the definition may occupy a terminal corner slot;
`junction_only`
also requires a valid `junctionGroupId`. Every definition names an obstacle-clearance profile from
the resolved layout policy; missing references fail catalog/configuration validation.

### Placement

> **Superseded (2026-08-24).** Replaced by `DEVELOPMENT-SPEC.md` §3.1 and §12. A placement persists
> `wall`, `alongMm` (centre along the wall), `y0Mm`, and a body (`buildId`, `widthMm`, `heightMm`,
> optional `finish`, optional `handle`). `runAnchor`, `order`, order partitions, and
> `junctionGroupId` are retired. Two derived structures replace them at runtime and are never
> persisted: the **column** (§3.2, keyed off the placement's fixed wall position, computed once at
> load, never changed) and the **void** (§3.3, free vertical space produced by `recomputeVoids()`).
> Occupancy is judged by the *opening* a body occupies, taking width from the carcass and height and
> depth from the full extent — a sink's faucet must not inflate module pitch, and a body must clear
> the ceiling with everything it carries. The `finishKey`/`handleMode` choices survive a rebuild:
> resizing must not silently reset a chosen finish or handle to the default.

### Options catalog

Materials, colours, handles, and mechanisms are versioned catalog entities with stable IDs and
price-rule references. Placement option IDs are optional: absence means the definition's declared
default or explicit `none` option. Validation rejects unknown IDs, invalid material/colour pairs,
and any option not supported by the selected definition. Push-to-open top-band definitions require
the no-handle option.

### Junction group

> **Superseded (2026-08-24).** The two-body corner survives; the linking identifier does not. In the
> new reference the corner legs are ordinary placements marked structural: no replace, no delete,
> never a width donor (`DEVELOPMENT-SPEC.md` §7 and §13.1). Their geometric contract is unchanged and
> still binding — see `SPEC.md`, "Corner base + lazy susan": each leg computes its own plinth recess
> from its own depth only, and the two worktops butt without interpenetration. A sink in a corner is
> a custom product, not a loosened rule.

### Preset

```text
KitchenPreset
  id
  name/content keys
  previewAsset
  supportedShapes
  minimumRoomRules
  placementRecipes by canonical wall
  flexibleSlots and allowed substitutions
```

A preset is a recipe that creates normal placements. After confirmation, users edit those
placements; the preset itself is not the live configuration.
Every placement recipe supplies `runAnchor`; preset evaluation may change widths or use explicitly
allowed substitutions/fillers, but it cannot infer a column side or change an anchor silently.

Preset validation requires a supported room shape, minimum/maximum wall and height rules from the
active product policy, valid definition/option references, and recipes that fit every derived usable
run. Failure is transactional: no partial configuration is created.

Presets contain strategy-neutral flexibility metadata only. They never select `fixed-fit` or
`module-pack`; the resolved immutable layout policy is the sole adaptation-strategy authority.

### Configuration

```text
KitchenConfiguration
  schemaVersion
  room
  sourcePresetId
  placements
  catalogVersion
  layoutPolicyVersion
  pricingVersion
  createdAt, updatedAt
```

All configuration and command timestamps use ISO 8601 with an explicit `Z` or `±HH:mm` offset and
exactly three fractional-second digits (millisecond precision). Missing, shorter, or longer
fractional precision is invalid at the runtime boundary.

Contact details are not part of the reusable kitchen configuration. A submission combines separate
validated contact fields with an immutable configuration snapshot and its recomputed pricing result,
so sharing or saving a design does not accidentally persist personal data and edits made after
submission begins cannot change what was reviewed.

### Derived run and occupancy model

> **Superseded (2026-08-24), through the end of "Deterministic packing and free space".** The
> `UsableWallRun` / `UsableWallSegment` / `PlacementRoomOccupancy` machinery, the reservation model,
> and the cross-wall bigint collision scan all exist to make a packed, reorderable run safe. Nothing
> packs any more: positions are authored and columns never move, so two placements cannot be driven
> into each other. The replacement is `recomputeVoids()` (`DEVELOPMENT-SPEC.md` §4), which derives
> free space per column, subdivides it by the base/wall/top module lines, emits nothing for an
> interval that intersects no level, and keeps a span that starts mid-level as one opening.
>
> What survives as policy, not as this mechanism: exact integer arithmetic at the domain boundary
> with rejection rather than rounding, one immutable versioned `LayoutPolicy` passed explicitly into
> every policy-dependent call, deterministic ordering of every returned array, and the rule that
> tolerance values belong to derived scene assertions and can never make a domain gap valid. The
> reference's own tolerance table (`DEVELOPMENT-SPEC.md` §2) supplies the working values:
> `TOL` 0.012 for fit comparisons, `MIN_SPAN` 0.30 for the smallest span that becomes free space,
> `MIN_W` 0.30 as the resize floor, 0.02 for module-line snapping, 0.03 for edge adjacency, 0.06 for
> "same row", and `frame.h < 0.3` for detecting a worktop accessory.

## Placement invariants

> **Superseded in part (2026-08-24).** Invariants 4–11 and 15–16 depend on order partitions, run
> anchors, packing, junction groups, cross-wall scanning, or obstacles, and are retired with them.
> Invariants 1, 2, 3, 12, 13 and 14 stand. The replacement invariants are:
>
> - Free space is derived, never authored, and is recomputed after every mutation.
> - Columns are computed once at load and never change; nothing moves horizontally.
> - Only a `column` body may exceed one band. A wall body may not stand on the floor and a base body
>   may not hang — enforced in the engine, not only in the UI.
> - The 0.86–1.50 m backsplash zone is never an opening.
> - A column that owns no floor space invents none: free space starts at that column's own lowest
>   module.
> - Fit is judged on the carcass, not the group bounding box; faucets and hood chimneys rise into
>   free air and never block a body that fits.
> - Width editing conserves the run total between exactly two neighbours, so overlap is
>   unrepresentable and shrinking cannot leave a gap. Only deletion creates free space.
> - Corner bodies and worktop accessories never donate width, and accessories cannot be deleted.
> - Identity comes from the user's catalogue choice when one exists, never from inspecting the mesh
>   tree; inferring it produced a fridge housing labelled and priced as a pantry.

1. Every placement references an existing wall and cabinet definition.
2. A placement's vertical band agrees with the definition and its documented Y span.
3. Width follows the definition's supported width rule and stays on the manufacturing grid.
4. IDs are unique. Placement orders are unique and contiguous within a wall/band/run-anchor
   partition or are rejected during validation; implicit normalization is never hidden during load.
5. Positions are derived in ascending `order`; placements never overlap or extend outside the
   usable wall run, across column reservations, or through a non-exempt cross-wall room-space
   occupancy. Exact room-space edge contact remains valid.
6. `flow` uses earliest-fit packing across derived segments. Only explicit reservations create
   interior gaps; unused segment tails and trailing slack remain unpersisted free space.
7. Reordering changes order inside the current run-anchor partition, then recomputes the run. It
   never writes arbitrary world coordinates or silently changes margin attachment.
8. A cabinet can be replaced only by a definition in the same replacement group that fits the
   resulting run and satisfies neighbour rules.
9. Every column uses `runAnchor: start | end`; columns sharing a wall and anchor form one contiguous
   margin-attached block and reserve their combined interval across base, middle, and top.
10. Fillers and end panels exist only as explicit catalog-backed placements at supported widths;
    packing never invents, stretches, renders, or prices an implicit filler.
11. The two canonical placements in one validated junction group are exempt only from generic
   cross-wall AABB rejection. They must separately preserve the two-body depth, recess, and
   butt-joint rules from the 3D specification; their worktops may meet but never interpenetrate.
12. Fixed-size purchased elements do not scale when the hosting cabinet width changes. The host
   validates enough space for them.
13. Option IDs exist and are supported by the selected definition; top-band push-open units never
    render or price a handle.
14. Configuration updates are transactional: an invalid resize, replacement, reorder, or margin
    move leaves the previous valid state unchanged and returns a user-readable reason.
15. Every obstacle has a stable unique ID, resolves one wall, is grid-exact and contained by that
    wall and room height; door/window rectangles do not overlap on the same wall.
16. No placement intersects an obstacle rectangle expanded by its definition's resolved clearance
    profile. Moving or resizing an obstacle that would invalidate placements is rejected
    transactionally.

## Pricing model boundary

Pricing is a pure, fail-whole query over one configuration, its resolved validation context and
layout inputs, and one immutable versioned MDL price book. The price book contains data, not code or
formula callbacks. This contract defines lookup keys and arithmetic but supplies no commercial or
sample amounts.

```text
PriceConfigurationInput
  configuration: unknown
  validationContext: resolved ConfigurationValidationContext
  cornerReservations: readonly ExplicitCornerReservation[]
  priceBook: MdlPriceBook

MdlPriceBook
  version: stable pricing version
  currency: MDL
  status: estimate | commercial
  cabinetRules: CabinetPriceRule[]
  materialColourRules: MaterialColourPriceRule[]
  handleRules: FixedHandlePriceRule[]
  mechanismRules: FixedMechanismPriceRule[]
  projectRules: ProjectPriceRule[]

CabinetPriceRule
  id, labelKey
  amountsByWidth: non-empty { widthM, amountMinor }[]

MaterialColourPriceRule
  id, labelKey, materialId, colourId
  amountsByWidth: non-empty { widthM, amountMinor }[]

FixedHandlePriceRule
  id, labelKey, handleId, amountMinor

FixedMechanismPriceRule
  id, labelKey, mechanismId, amountMinor

ProjectPriceRule
  id, labelKey
  component: charge | discount
  amountMinor

PricingQueryResult
  | { ok: true, pricing: PricingResult }
  | { ok: false, error: PricingError }

PricingResult
  lines: PricingLine[]
  totalMinor: safe integer
  currency: MDL
  pricingVersion
  status: estimate | commercial

PricingLine common fields
  lineId: stable identifier
  kind: cabinet | option | project
  component: cabinet | material_colour | handle | mechanism | charge | discount
  ruleId, labelKey
  quantity: 1
  unitAmountMinor, amountMinor: equal safe integers

CabinetPricingLine = common +
  kind: cabinet, component: cabinet, placementId, cabinetDefinitionId, widthM
MaterialColourPricingLine = common +
  kind: option, component: material_colour, placementId, materialId, colourId, widthM
HandlePricingLine = common +
  kind: option, component: handle, placementId, handleId
MechanismPricingLine = common +
  kind: option, component: mechanism, placementId, mechanismId
ProjectPricingLine = common +
  kind: project, component: charge | discount, no placementId
```

`MdlPriceBook.currency` is the literal `MDL`; every amount is an integer count of MDL minor units.
Every rule ID is unique across the complete price book, each cabinet rule has unique width rows,
and each material/colour rule key, handle key, mechanism key, and project rule ID is unique. Price
book widths must convert exactly through the resolved manufacturing grid and are compared to the
placement width in integer units, never by float tolerance. All price-book amounts must be safe
integers. Cabinet, material/colour, handle, mechanism, and project-charge amounts are non-negative;
an explicit project discount is zero or negative. Percentage, conditional, quantity, tax, delivery,
worktop, appliance, and installation formulas are outside this minimal engine unless represented as
an approved fixed named project rule.

The query first validates the context, price book, base configuration, exact pricing-version match,
context-dependent configuration, and complete layout using the supplied immutable
`cornerReservations`. It uses the same `derivePlacementLayout` result as editing; a configuration
that is structurally valid but does not fit cannot be priced. The required equality is
`configuration.pricingVersion === validationContext.pricingVersion === priceBook.version`; no
"current" version fallback or migration occurs inside pricing. Failure precedence is
`INVALID_CONTEXT`, `INVALID_PRICE_BOOK`, `INVALID_CONFIGURATION`, `PRICING_VERSION_MISMATCH`,
`LAYOUT_REJECTED`, lookup failures in returned-line order, then aggregate arithmetic failures.

For each placement in canonical occupancy order, pricing emits:

1. exactly one cabinet line by resolving the definition's `pricingRuleId`, then the placement's
   exact supported width in that cabinet rule;
2. one `material_colour` line when material and colour resolve from explicit placement options or
   the definition defaults, keyed by the exact `(materialId, colourId, width)` tuple;
3. one fixed `handle` line when a handle resolves, keyed only by `handleId`;
4. one fixed `mechanism` line when a mechanism resolves, keyed only by `mechanismId`.

An option that resolves to intentional `none` emits no line and needs no rule. An option that
resolves to an ID requires exactly one matching rule even when its amount is zero. Likewise, a
matched cabinet or project rule with zero amount still emits its traceable line; omission is never
interpreted as a zero price. After placement lines, every declared project charge is emitted once
in rule-ID code-unit order, followed by every declared discount in the same order. The project-rule
array may be empty; its entries are unconditional fixed M0 lines. A configuration with no placements
and no project rules validly returns `lines: []` and `totalMinor: 0`; a non-empty configuration can
never return an empty successful result because every placement requires a cabinet line.

Line IDs are derived, never supplied by price data:

```text
placement:{placementId}:cabinet
placement:{placementId}:material-colour
placement:{placementId}:handle
placement:{placementId}:mechanism
project:{projectRuleId}
```

Placement IDs are already unique, project rule IDs are unique, and the fixed component suffixes
make these line IDs stable across input-array ordering and option/rule amount changes. Placement
lines follow canonical occupancy order and component order `cabinet`, `material_colour`, `handle`,
`mechanism`; project lines follow them. Labels come only from the matched rule's stable `labelKey`.
Every placement line carries its placement ID and exact resolved lookup source; project lines carry
no placement ID.

Runtime pricing schemas are strict, context-free transport validators, not pricing authorities.
They do not coerce values or silently discard unknown fields. `PricingLineSchema` requires the exact
derived `lineId` for that line's own placement/component or project rule ID.
`PricingResultSchema` additionally requires all placement lines before all project lines; each
placement's lines form one contiguous block that begins with exactly one cabinet line and contains
at most one each of `material_colour`, `handle`, and `mechanism` in that component order. A
placement ID cannot recur after its block. Project charges precede project discounts, and each
group is ordered by complete rule ID using locale-independent code-unit comparison. These schemas
also enforce the discriminant/source-field shapes, literal quantity one, equal safe-integer unit
and line amounts, unique line IDs, result metadata, and exact safe-integer line sum.

Context-free validation cannot prove that placement blocks follow canonical occupancy order, that
placement and option source fields resolve from the submitted configuration, or that rule IDs,
labels, amounts, status, and version match the authoritative price book. Therefore a parsed
`PricingResult`, including one nested in `ContactSubmissionSchema`, is transport data only. It is
accepted as an authoritative snapshot only through this exported contextual verifier:

```text
verifyPricingSnapshot({
  pricingSnapshot: unknown,
  configuration: unknown,
  validationContext: resolved ConfigurationValidationContext,
  cornerReservations: readonly ExplicitCornerReservation[],
  priceBook: MdlPriceBook
}): PricingSnapshotVerificationResult

PricingSnapshotVerificationResult
  | { ok: true, pricing: PricingResult }
  | { ok: false, error: PricingSnapshotVerificationError }

PricingSnapshotVerificationError
  | { code: INVALID_PRICING_SNAPSHOT }
  | PricingError
  | { code: PRICING_SNAPSHOT_MISMATCH }
```

Verification is fail-whole and deterministic. It first parses `pricingSnapshot` with the strict
context-free `PricingResultSchema`; failure returns `INVALID_PRICING_SNAPSHOT`. It then calls
`priceConfiguration` with the exact supplied configuration, context, corner reservations, and
price book; a query failure is returned unchanged. Finally, it compares the parsed snapshot with
the fresh successful result by exact field-for-field and array-order-for-array-order structural
equality. Any difference—including metadata, line count/order, ID, label, source, amount, or
total—returns `PRICING_SNAPSHOT_MISMATCH`. It does not sort, repair, migrate, or partially accept
the submitted snapshot. Success returns the freshly recomputed `pricing` object, not the submitted
object; every failure returns no accepted pricing, partial lines, or total and mutates no input.

```text
PricingError =
  | { code: INVALID_CONTEXT }
  | { code: INVALID_PRICE_BOOK }
  | { code: INVALID_CONFIGURATION }
  | { code: PRICING_VERSION_MISMATCH }
  | { code: LAYOUT_REJECTED, cause: PlacementLayoutErrorCode }
  | { code: MISSING_PRICE_RULE, placementId,
      lookup:
        | { component: cabinet, pricingRuleId, widthM }
        | { component: material_colour, materialId, colourId, widthM }
        | { component: handle, handleId }
        | { component: mechanism, mechanismId } }
  | { code: ARITHMETIC_OVERFLOW }
  | { code: NEGATIVE_TOTAL }
```

Any missing rule or missing exact-width row returns `MISSING_PRICE_RULE`; the engine never omits the
component, substitutes another width, or returns a partial result. It sums line amounts with
`bigint`, then rejects `ARITHMETIC_OVERFLOW` when the aggregate is outside JavaScript's safe-integer
range before converting the total to `number`. A safe but negative aggregate rejects
`NEGATIVE_TOTAL`; explicit negative discount lines remain valid when the final total is
non-negative. On every error, no `PricingResult`, lines, or total are returned.

The renderer never calculates price, and UI components never duplicate pricing formulas. The same
configuration, context, corner reservations, and price-book version always produce structurally
identical output. A success copies the book's `version`, `currency`, and `status` verbatim to
`pricingVersion`, `currency`, and `status` in the result. Until commercial data is approved, M0
price books and results use `status: estimate`; sample fixture amounts remain replaceable and must
not be represented as a quote or production price list.

`totalMinor` equals the exact sum of `amountMinor` across returned lines. Width, material, handle,
and mechanism changes must change the corresponding traceable line when their active pricing rule
is price-affecting.

## Fixed reference L vertical proof

The M0 vertical proof is a reference-only, fail-whole orchestration over plain data. It creates no
Three.js object and is not a production preset fitter. The JSON files in `catalog-seed/` are source
evidence rather than valid `CabinetDefinition` or `KitchenConfiguration` payloads: they omit
required domain policy, option, pricing, and placement fields and contain direct source-builder
calls. A normalized proof fixture must preserve an explicit source link for every value it adds.

```text
ReferenceLProofInput
  referenceCatalogSeed: unknown
  referencePresetSeed: unknown
  validationContext: resolved ConfigurationValidationContext
  configuration: unknown
  cornerReservations: readonly ExplicitCornerReservation[]
  sceneRecipes: readonly ReferenceSceneRecipe[]
  decorRecipes: readonly ReferenceDecorRecipe[]
  priceBook: MdlPriceBook

ReferenceLProofResult
  | { ok: true,
      configuration: KitchenConfiguration,
      layout: successful PlacementLayoutResult,
      placementDescriptors: readonly ReferenceScenePartDescriptor[],
      decorDescriptors: readonly ReferenceDecorDescriptor[],
      pricing: PricingResult }
  | { ok: false, stage: seed | configuration | layout | scene | pricing,
      error: ReferenceLProofError }
```

The proof validates in that exact stage order. It validates both source seeds and their normalized
one-to-one trace map, parses the normalized catalog/context and configuration, calls
`derivePlacementLayout` with the exact corner reservations, derives and checks plain scene
descriptors, then calls `priceConfiguration` with the same configuration/context/reservations. A
failure returns only its stage and stable error; it never exposes a partial configuration, layout,
descriptor array, price line, or total. Inputs are not mutated.

Seed-stage codes are `INVALID_REFERENCE_SEED`, `REFERENCE_TRACE_MISMATCH`, and
`UNMAPPED_REFERENCE_CALL`; configuration uses `INVALID_CONTEXT` or `INVALID_CONFIGURATION`;
layout propagates the exact `PlacementLayoutError`; scene uses `MISSING_SCENE_RECIPE`,
`INVALID_SCENE_RECIPE`, or `REFERENCE_DESCRIPTOR_MISMATCH`; pricing propagates the exact
`PricingError`. Earlier stages always take precedence over later ones.

### Fixed normalized configuration

The proof fixture uses manufacturing grid `0.001` m, no obstacles, room height `2.600` m, wall A
length `3.600` m, and wall B length `2.800` m. These are reference-fixture values, not approved
commercial widths or customer room bounds. Wall A is the source-stated cabinet run. Wall B is the
exact outer edge of the executable source column composition: the freestanding refrigerator is
centred at `z=2.450` with fixed width `0.700`, so the authored composition reaches `z=2.800`.
`reference-l-preset.json` still says `authoredRuns.wallB: 2.4`; normalization must reject that stale
metadata if it is used as the domain wall length. The executable `buildKitchen()` placements and
their fixed dimensions are authoritative for this proof.

The source's `4.2 × 3.4` floor and wall planes are photography-stage decor descriptors, not the
domain wall-run lengths. They remain exact fixed decor and do not approve a room-input range or
change canonical A/B wall transforms.

All normalized definitions use a single exact discrete supported width copied from the source,
self-only replacement groups, the zero-clearance proof obstacle profile, fixed reference materials,
empty selectable-option lists, and explicit `defaultOptions: {}`. Embedded handles, appliances,
sink, and fixed materials are recipe geometry, not invented selectable options. Each definition has
its own stable estimate pricing rule ID. The exact fixture versions are schema `1`, catalog
`reference-l-proof-catalog-v1`, layout policy `reference-l-proof-layout-v1`, and pricing
`reference-l-proof-price-zero-v1`; `sourcePresetId` is `reference-kitchen-l`. Definition pricing
rule IDs derive as `reference-price:{definitionId}` and their nonlocalized fixture label keys as
`reference.{definitionId}`. The configuration uses one fixed explicit-offset millisecond timestamp
for both creation and update and never reads the clock. The normalized placements are:

| Placement ID | Definition ID | Wall/band/anchor/order | Width m | Source scene IDs owned |
| --- | --- | --- | ---: | --- |
| `base-corner-x` | `reference-base-corner-x` | A/base/start/0 | 0.900 | `base-corner-x` |
| `base-corner-return` | `reference-base-corner-return-058` | B/base/end/0 | 0.320 | `base-corner-return` |
| `base-sink` | `reference-base-sink-080` | A/base/flow/0 | 0.800 | `base-sink` |
| `base-dishwasher` | `reference-base-dishwasher-060` | A/base/flow/1 | 0.600 | `base-dishwasher` |
| `base-panbank` | `reference-base-cooktop-panbank-060` | A/base/flow/2 | 0.600 | `base-panbank`, `cooktop` |
| `base-3drawer` | `reference-base-3drawer-060` | A/base/flow/3 | 0.600 | `base-3drawer` |
| `end-panel-right` | `reference-end-panel-right-018` | A/base/flow/4 | 0.018 | `end-panel-right` |
| `tall-oven-tower` | `reference-column-oven-overhead-060` | B/column/start/2 | 0.600 | `tall-oven-tower`, `top-b-060-1` |
| `tall-pantry` | `reference-column-pantry-overhead-060` | B/column/start/1 | 0.600 | `tall-pantry`, `top-b-060-2` |
| `fridge-free` | `reference-column-fridge-overhead-070` | B/column/start/0 | 0.700 | `fridge-free`, `top-over-fridge` |
| `middle-a-060` | `reference-middle-wall-2door-060` | A/middle/start/0 | 0.600 | `middle-a-060` |
| `middle-b-057` | `reference-middle-wall-1door-057` | B/middle/end/0 | 0.570 | `middle-b-057` |
| `middle-a-030` | `reference-middle-wall-1door-030` | A/middle/flow/0 | 0.300 | `middle-a-030` |
| `middle-a-080` | `reference-middle-wall-2door-080` | A/middle/flow/1 | 0.800 | `middle-a-080` |
| `middle-open-060` | `reference-middle-open-shelf-060` | A/middle/flow/2 | 0.600 | `middle-open-060` |
| `middle-hood-060` | `reference-middle-hood-060` | A/middle/flow/3 | 0.600 | `middle-hood-060` |
| `middle-a-060-end` | `reference-middle-wall-2door-060` | A/middle/flow/4 | 0.600 | `middle-a-060-end` |
| `top-a-060-1` | `reference-top-wall-2door-060` | A/top/start/0 | 0.600 | `top-a-060-1` |
| `top-b-057` | `reference-top-wall-1door-057` | B/top/end/0 | 0.570 | `top-b-057` |
| `top-a-030` | `reference-top-wall-1door-030` | A/top/flow/0 | 0.300 | `top-a-030` |
| `top-a-080` | `reference-top-wall-2door-080` | A/top/flow/1 | 0.800 | `top-a-080` |
| `top-a-060-2` | `reference-top-wall-2door-060` | A/top/flow/2 | 0.600 | `top-a-060-2` |
| `top-a-060-3` | `reference-top-wall-2door-060` | A/top/flow/3 | 0.600 | `top-a-060-3` |
| `top-a-060-4` | `reference-top-wall-2door-060` | A/top/flow/4 | 0.600 | `top-a-060-4` |

The persisted `placements[]` order is the first-owner order in the source seed shown above; its
partition `order` fields, not that array position, drive layout. Tests also shuffle the persisted
array and require identical layout, descriptors, and pricing.

Definition heights/depths are the exact proof envelopes needed by layout: ordinary base bodies are
`0.860 × 0.560`, the cooktop-base composite is `0.872 × 0.560`, the end panel is
`0.820 × 0.600`, middle cabinets are `0.700` high with their source depth (`0.330` for wall/open
shelf and `0.500` for hood), top cabinets are `0.400 × 0.330`, the corner X/return depths are
`0.600`/`0.580`, the oven and pantry composites are `2.600 × 0.600`, and the refrigerator composite
is `2.600 × 0.680`. These fixture envelopes do not redefine the fixed bought-component dimensions
inside their recipes.

The three junction groups and their millimetre-grid reservations are exact fixture inputs, not
inferences made by layout:

```text
reference-corner-base:
  wall-a/base   [0, 900]
  wall-b/base   [1900, 2800]
reference-corner-middle:
  wall-a/middle [0, 600]
  wall-b/middle [1900, 2800]
reference-corner-top:
  wall-a/top    [0, 600]
  wall-b/top    [1900, 2800]
```

Each named group links exactly its A-start and B-end placements. The B-side reservation includes
the source's corner setback up to world `z=0.900`; layout must consume these supplied values and
must not derive them from the `0.320`/`0.570` body widths.

### Plain scene descriptor boundary

`CabinetDefinition.rendererKey` resolves exactly one immutable `ReferenceSceneRecipe`. A recipe
contains an ordered, non-empty list of allow-listed typed builder-call descriptors and fixed local
transforms; it contains neither executable callbacks nor Three.js objects. Each expanded part is:

```text
ReferenceScenePartDescriptor
  id: exact unique source scene ID
  placementId, cabinetDefinitionId, rendererKey
  partOrder: contiguous integer within its recipe
  builderCall: typed allow-listed builder discriminant and exact source arguments
  placementTransform: derived floor-centred wall transform
  localTransform: fixed recipe offset/yaw
  worldTransform: exact composition of placementTransform and localTransform
```

Raw seed entries without `rendererKey` never become untyped persisted calls. Normalization maps an
exact known call to an explicit proof recipe: the source-equivalent exported base/corner builder
where one exists, otherwise a typed `baseCabinet`, `wallCabinet`, `openShelf`, `hood`, or fixed-box
recipe with the exact arguments in `reference-l-preset.json`. An unknown call, unsafe argument,
missing/duplicate recipe, unknown renderer key, source ID mapped zero or multiple times, or recipe
that emits an unowned part fails the whole seed/scene stage with `UNMAPPED_REFERENCE_CALL`,
`INVALID_SCENE_RECIPE`, or `MISSING_SCENE_RECIPE` as applicable. Strings from seed data are never
executed as functions.

The recipe offsets make the domain's carcass occupancy and the source's authored builder origins
both explicit:

- ordinary base builder roots add local `z=+0.020` to the `0.560` carcass-depth wall transform;
- the corner-X root adds local `z=-0.020` to its `0.600` depth transform;
- the B corner-return root adds local `x=-0.580`, and the B middle/top corner roots add local
  `x=-0.330`; after yaw `+π/2` these produce source world Z offsets;
- the cooktop-base recipe emits the base at local `(0,0,0.020)` and cooktop at
  `(0,0.860,0.080)`;
- the end-panel recipe emits a fixed `0.018 × 0.820 × 0.600` box whose centre is local
  `(0.001,0.410,0)`;
- oven/pantry recipes emit their top cabinet at local Y `2.200`; the refrigerator recipe emits its
  overhead cabinet at local `(0,1.850,-0.040)` so the source root is at world X `0.300`.

Every other proof part has zero local translation and the source yaw relative to its owning
placement. Composition uses the canonical yaw rotation; it never copies a world transform into the
saved configuration.

Placement descriptors sort by canonical layout placement order and then `partOrder`. Their exact
source-ID sequence is:

```text
base-corner-x, base-sink, base-dishwasher, base-panbank, cooktop,
base-3drawer, end-panel-right,
middle-a-060, middle-a-030, middle-a-080, middle-open-060,
middle-hood-060, middle-a-060-end,
top-a-060-1, top-a-030, top-a-080, top-a-060-2, top-a-060-3, top-a-060-4,
base-corner-return, middle-b-057, top-b-057,
fridge-free, top-over-fridge, tall-pantry, top-b-060-2,
tall-oven-tower, top-b-060-1
```

The result contains exactly those 28 placement descriptors. Every authored seed placement ID
appears exactly once, every descriptor traces to one of the 24 normalized placements, and no
standalone descriptor is priced. The four decor descriptors retain seed order `floor`,
`wall-back`, `wall-left`, `backsplash-wall-a` and copy their exact source dimensions, material IDs,
positions, and yaw. Decor has no placement ID and produces no price line.

Descriptor assertions compare every final position/yaw and typed builder argument to the source
seed using only the resolved scene-boundary epsilon; the epsilon may absorb float conversion noise
but cannot change grid layout, repair a recipe, or excuse an authored geometric gap. Nominal corner
recipe bounds must also prove the X countertop occupies world Z `[-0.010,0.630]`, the return
countertop occupies `[0.630,0.900]`, their Y spans are both `[0.820,0.860]`, and their interiors do
not overlap. Three.js mesh creation, chamfer/bounds inspection, material rendering, and visual
certification remain the next adapter wave.

The source end panel is centred at X `3.510`, so its nominal left edge is `3.501` while the adjacent
drawer ends at `3.500`. That exact 1 mm authored gap conflicts with the reference prose requiring
face sharing. The descriptor proof preserves and reports the source transform; it must not hide the
gap with epsilon or claim the later geometry/no-gap gate has passed. Closing it requires an
explicit recorded source correction before rendered M0 acceptance.

### Reference-only estimate fixture

Until sample commercial-like amounts are approved, the proof price book may use only literal zero
minor-unit rows for every required definition rule and exact width, `currency: MDL`,
`status: estimate`, a test/reference-only version, empty option/project rule arrays, and stable
fixture label keys. This is allowed solely to prove version matching, canonical placement-line
order, stable IDs, traceability, total arithmetic, and seed-to-price completeness. The expected
result has exactly 24 cabinet lines, no option/project lines, and `totalMinor: 0`. It must not be
displayed or stored as a customer quote, used to infer missing commercial inclusions, or reused as
production pricing. Any nonzero fixture amount remains blocked on separately approved data.

## Commands and queries

> **Superseded in part (2026-08-24).** The command *set* is now `applyPreset`, `remove`,
> `insert(buildId)`, `setWidth(mm)`, `setFinish(key)` and `setHandle(mode)`
> (`DEVELOPMENT-SPEC.md` §5, §8, §12). `reorderCabinet` and `moveCabinetToRunMargin` are retired, and
> `insert` subsumes replacement: filling an empty slot and swapping an occupied body run through one
> code path, because forking them is exactly how every replace row silently stopped working in the
> prototype. Finish and handle are per placement; material and hardware *brand* are whole-kitchen
> settings that live outside the cabinet editor.
>
> What survives unchanged: the envelope/result/failure shapes, one primary effect on success,
> failure returning the exact original object with no effects and no mutation, stable failure codes
> rather than English strings as the public contract, caller-supplied timestamps with no clock in the
> domain, and the review query grouping by wall then band. One addition from the reference: every
> refusal must carry a reason the panel can render verbatim in its banner, and the panel must derive
> what it disables from the selection's own numbers rather than by attempting an edit and catching the
> refusal. Bounded undo/redo is retired — see the decision record.

State changes use explicit commands such as `applyPreset`, `replaceCabinet`, `resizeCabinet`,
`reorderCabinet`, `moveCabinetToRunMargin`, and `setCabinetOptions`. Their typed inputs share:

```text
CommandBase
  configuration: KitchenConfiguration
  validationContext: resolved ConfigurationValidationContext
  cornerReservations: readonly ExplicitCornerReservation[]
  occurredAt: ISO 8601 timestamp with explicit offset and exactly millisecond precision

ReorderCabinetInput = CommandBase + placementId, targetOrder
ResizeCabinetInput = CommandBase + placementId, targetWidthM
ReplaceCabinetInput = CommandBase + placementId, targetCabinetDefinitionId
MoveCabinetToRunMarginInput = CommandBase + placementId,
  targetRunAnchor: start | end, targetOrder
SetCabinetOptionsInput = CommandBase + placementId, options: complete CabinetOptions
```

The pure domain reads no clock. Persisted `createdAt`/`updatedAt` and command `occurredAt` use
exactly three fractional-second digits. On success, `createdAt` is unchanged and `occurredAt`—which must be
valid and strictly later as an instant than the current `updatedAt`—is copied verbatim to
`updatedAt`. Failure and `NO_CHANGE` preserve both timestamps. `setCabinetOptions` replaces the
complete explicit options object; omission means the definition default or intentional `none`, not
"leave unchanged."

`reorderCabinet` removes and inserts only within the current `(wallId, verticalBand, runAnchor)`
partition, with `targetOrder` in `0..n-1`, then assigns exact contiguous orders to that partition.
It cannot change wall, band, or anchor. In M0, `moveCabinetToRunMargin` is column-only: it requires a
column definition with a margin rule, a different `start | end` anchor, and `targetOrder` in
`0..targetPartitionLength` after removal. A non-column placement is rejected even if its definition
has a margin rule. The command preserves wall/band, then compacts only the source partition and
normalizes only the target partition. Passing the current anchor is rejected; use reorder for
same-side movement. Column moves recompute reservations across every cabinet band. Resize,
replacement, option edits, hydration, and queries never normalize orders; invalid persisted order
fails instead of being repaired.

No command sorts or splices the persisted `placements[]` array. A success keeps every placement at
its original array index and replaces only affected placement objects at those indices. Reorder
changes only affected `order` fields; margin move changes the selected placement's `runAnchor` and
the affected source/target `order` fields. The other three commands replace only the selected
placement object and their documented field. Array order therefore remains persistence input order,
not derived layout order. A placement whose persisted fields did not change retains exact object
identity (`===`) in the successful configuration.

Resize preserves every placement field except width and requires a finite, grid-exact width
supported by the current definition plus a valid complete layout. Replacement preserves placement
ID, exact width, wall, band, anchor, order, explicit options, and junction group. The target must
exist and share family, vertical band, replacement group, and layout role; it must support the
preserved width, anchor/junction role, and every explicit option. Absent options stay absent and
resolve from the target's defaults; replacement never drops, substitutes, or materializes an
explicit selection. Its effect exposes resolved options before/after so a changed default is
explainable.

This wave enforces only constraints expressible by the current definition/context schemas and
`derivePlacementLayout`. Definition-specific fixed-host clearance metadata and catalogue neighbour
compatibility metadata do not yet exist, so this command wave does not claim to enforce them or
invent stand-ins. They remain M0 follow-up gates before those broader resize/replacement acceptance
criteria can be declared complete.

Every command validates original and candidate states with the same immutable
`cornerReservations`. Commands never mutate or return that collection and never infer corner
extents. A junction edit succeeds only if the unchanged set still maps one-to-one to the exact two
canonical terminal legs. A reorder must leave its leg terminal; a side move that breaks the pair
fails. A change requiring new numeric corner inputs needs a future coordinated command.

```text
CommandEnvelopeResult
  | CommandResult
  | { ok: false, reason: CommandEnvelopeFailure }

CommandEnvelopeFailure.code
  INVALID_INPUT

CommandResult
  | { ok: true, configuration: newConfiguration, effects: [CommandEffect] }
  | { ok: false, configuration: originalConfiguration, reason: CommandFailure }

CommandFailure.code
  INVALID_CONTEXT | INVALID_CONFIGURATION | PLACEMENT_NOT_FOUND |
  INVALID_OCCURRED_AT | NO_CHANGE | TARGET_ORDER_OUT_OF_RANGE |
  TARGET_ANCHOR_UNCHANGED | MARGIN_MOVE_NOT_ALLOWED | WIDTH_UNSUPPORTED |
  REPLACEMENT_NOT_FOUND | REPLACEMENT_INCOMPATIBLE | OPTIONS_UNSUPPORTED |
  CANDIDATE_LAYOUT_REJECTED

CommandEffect =
  | { type: cabinet_reordered, placementId, orderChanges: OrderChange[] }
  | { type: cabinet_resized, placementId, fromWidthM, toWidthM }
  | { type: cabinet_replaced, placementId, fromDefinitionId, toDefinitionId,
      resolvedOptionsBefore, resolvedOptionsAfter }
  | { type: cabinet_run_margin_moved, placementId, fromRunAnchor, toRunAnchor,
      orderChanges: OrderChange[] }
  | { type: cabinet_options_set, placementId,
      explicitOptionsBefore, explicitOptionsAfter,
      resolvedOptionsBefore, resolvedOptionsAfter }

OrderChange
  placementId
  before: wallId, verticalBand, runAnchor, order
  after: wallId, verticalBand, runAnchor, order
```

Layout-backed failures include the stable `PlacementLayoutErrorCode` cause; other reasons include
the placement ID and rejected target needed for localized copy. Validation precedence is context
and original state, placement lookup, command-specific target and `NO_CHANGE`, `occurredAt`, then
the complete candidate layout. Codes and fields—not English messages—are the public contract.
There is exactly one primary effect on success. `orderChanges` lists the commanded placement first,
then other changed placements in canonical wall order, band order `base`/`middle`/`top`/`column`,
anchor order `flow`/`start`/`end`, order, and placement ID. Effects do not duplicate derived
intervals, scene instances, or prices.

Every failure returns the exact original configuration object (`===`), has no effects, performs no
mutation, and leaves canonical serialization unchanged. Success returns a new validated object and
leaves the input untouched. Successful snapshots are eligible for bounded undo/redo; one undo
restores the exact prior valid snapshot. Queries derive wall runs, scene instances, compatible
replacements, pricing, and the review model.

The `INVALID_INPUT` envelope branch is the sole exception to the original-object rule. It is
returned before a typed command runs only when the top-level runtime envelope is null, non-object,
or lacks a usable configuration object, so no original snapshot exists to return. It contains
neither `configuration` nor `effects`, and the boundary must not synthesize either. Once an envelope
identifies a configuration object and reaches typed/domain validation, every rejection—including
`INVALID_CONFIGURATION`—uses `CommandFailure` and returns that exact object.

The review query groups placements by canonical wall and vertical band and includes chosen
definition, width, material, colour, handle, mechanism, and traceable price lines.

## Persistence and migrations

Every saved configuration has a schema, catalog, layout-policy, and pricing version. Loading validates and
migrates known older schemas; an unknown or invalid payload must not partially hydrate. Contact
information is stored or transmitted separately and only when the user submits it.
