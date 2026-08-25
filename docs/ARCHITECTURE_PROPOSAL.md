# Lemnaria configurator architecture proposal

Status: approved 2026-08-20; **partially superseded 2026-08-24**; unresolved data inputs remain in
the accepted decision records
Date: 2026-08-20, revised 2026-08-24
Scope: the complete mobile-first kitchen configurator described in
`docs/PRODUCT_REQUIREMENTS.md`; CRM integration remains out of scope.

> **Supersession notice.** `docs/decisions/2026-08-24-design-reference-supersession.md` replaces the
> placement model in this document with the placement/derived-void model in
> `docs/design/DEVELOPMENT-SPEC.md` §3–§5. Sections 4.1, 4.3, 4.4
> and 5.2 carry inline notes marking what no longer applies. Sections 1, 2, 3, 4.2, 5.1, 5.3, 5.4,
> 6, 7, 8, 9 and 10 remain in force. Nothing here about the stack, package boundaries, render
> contract, persistence, pricing boundary, or submission boundary is affected.

## 1. Outcome and architectural stance

Build the configurator as a typed web application whose saved `KitchenConfiguration` is the only
product source of truth. Room layout, cabinet transforms, compatible edits, price lines, review
content, and the contact payload are derived from that validated configuration. Neither React nor
Three.js owns product rules.

The recommended structure is a small pnpm workspace containing one Next.js application and three
purpose-specific packages:

```text
apps/web
  App Router pages, responsive UI, R3F scene host, API route, browser persistence
packages/configurator-domain
  schemas, commands, constraints, layout queries, preset fitting, review projection
packages/catalog-data
  versioned cabinet/preset/finish/hardware/pricing data
packages/three-adapter
  production port of the reference builders and configuration-to-Object3D bridge
```

A workspace boundary is worthwhile here even with one application: the browser and server both
need configuration and pricing contracts, while the domain must remain unable to import React,
Next.js, React Three Fiber, Three.js, storage, or network code. A task runner is not needed for the
initial workspace; pnpm scripts are sufficient.

## 2. Recommended stack

These engineering decisions were accepted on 2026-08-20:

| Concern | Recommendation | Reason |
| --- | --- | --- |
| Web application | Next.js App Router + React + strict TypeScript | Mobile web delivery, route-level code splitting, server contact boundary, and one deployable application |
| 3D host | Three.js through `@react-three/fiber`, with `@react-three/drei` only for narrowly selected controls/helpers | Keeps React orchestration and pointer events while allowing the existing imperative builders to survive |
| Runtime schemas | Zod, with TypeScript types inferred from schemas | One runtime/static contract for storage, URL/session restoration, catalog data, and API requests |
| Client state | Zustand store with domain commands as the only durable mutations | Small selector-based updates, usable outside React, and no product logic in store actions |
| Forms | React Hook Form using the shared Zod schemas | Mobile-friendly validation without duplicating contact or room contracts |
| Unit/component tests | Vitest + React Testing Library + `fast-check` | Fast pure-domain tests plus numeric/property sweeps |
| Browser tests | Playwright | Real mobile viewport, touch/pointer flow, WebGL, restoration, and route coverage |
| Styling | CSS Modules plus centralized CSS custom-property tokens | Low runtime cost and no need to commit to a larger design system before screens exist |
| Formatting/lint | ESLint plus Prettier and strict type checking | Conventional automated gates with explicit package boundaries |

Versions should be pinned to mutually compatible stable releases when M0 is scaffolded. This
proposal intentionally does not claim version numbers before dependency installation and build
verification.

## 3. Dependency direction and module boundaries

`A → B` means package A may import package B:

```text
apps/web ─────────────→ configurator-domain
   ├──────────────────→ catalog-data ─────→ configurator-domain (contracts only)
   └──────────────────→ three-adapter ────→ configurator-domain (scene contracts only)
```

- `configurator-domain` defines the configuration, catalog-facing interfaces, commands, and
  queries. It accepts plain data and returns plain data or an explicit failure. It performs no I/O.
- `catalog-data` implements versioned data inputs. The domain must not hard-code commercial
  catalog contents.
- `three-adapter` consumes domain scene instances and catalog `rendererKey` values. It may import
  Three.js, but it cannot write configuration state or calculate prices.
- `apps/web` composes the packages, performs browser/server I/O, and owns ephemeral presentation
  state. It never calculates placement or pricing rules inside components.

Enforce this direction with package manifests, TypeScript project references or path exports, and
an ESLint restricted-import rule. Do not create a generic `utils` package; a function belongs to
the package whose contract it implements.

## 4. Pure configuration domain

`packages/configurator-domain` implements `docs/CONFIGURATION_MODEL.md` directly.

### 4.1 Public contracts

> **Superseded in part (2026-08-24).** The command set below is replaced by the five commands in
> `DEVELOPMENT-SPEC.md` §5 and §12: `select`, `remove`, `insert(buildId)`, `setWidth(mm)`,
> `setFinish(key)`, `setHandle(mode)`, plus `applyPreset`. `reorderCabinet` and
> `moveCabinetToRunMargin` are retired. `insert` covers both filling an empty slot and swapping an
> occupied one through **one** code path — the prototype's swap silently broke when that path was
> forked. Voids are derived state recomputed inside the store after every command, never a command
> input. The result shape below survives: every command returns success with the new state, or a
> failure carrying a stable code plus a human-readable reason the panel renders in its rejection
> banner. The banner sits at the top of the panel body, above every section.

Expose a deliberately small API:

```ts
type CommandResult =
  | { ok: true; configuration: KitchenConfiguration; effects: DomainEffect[] }
  | { ok: false; configuration: KitchenConfiguration; reason: DomainError };

type PlacementCommandResult =
  | { ok: true; configuration: KitchenConfiguration; effects: [CommandEffect] }
  | { ok: false; configuration: KitchenConfiguration; reason: CommandFailure };

type PlacementCommandEnvelopeResult =
  | PlacementCommandResult
  | { ok: false; reason: { code: "INVALID_INPUT" } };

applyPreset(input, catalog, layoutPolicy): CommandResult
replaceCabinet(input): PlacementCommandEnvelopeResult
resizeCabinet(input): PlacementCommandEnvelopeResult
reorderCabinet(input): PlacementCommandEnvelopeResult
moveCabinetToRunMargin(input): PlacementCommandEnvelopeResult
setCabinetOptions(input): PlacementCommandEnvelopeResult

deriveWallRuns(configuration, catalog, layoutPolicy): WallRun[]
deriveScene(configuration, catalog, layoutPolicy): SceneInstance[]
deriveReferenceLVerticalProof(input: ReferenceLProofInput): ReferenceLProofResult
findCompatibleReplacements(configuration, placementId, catalog, layoutPolicy): Candidate[]
deriveReview(configuration, catalog, pricingResult): ReviewModel
validateConfiguration(configuration, catalog, layoutPolicy): ValidationResult
```

Every policy-dependent operation receives a resolved immutable `LayoutPolicy`; it asserts that the
version matches `configuration.layoutPolicyVersion` when a configuration exists. A repository in
`apps/web` resolves policies by version and injects them—the pure domain has no hidden current policy
and performs no lookup I/O.

Every command constructs and validates a complete candidate before returning it. Failure returns
the original configuration object unchanged; no partial update, cleanup pass, or renderer-side
correction is allowed. `DomainError` uses stable codes plus structured context so localized UI
copy can explain why an edit was rejected without parsing English strings.

The five placement-edit commands use the typed inputs and discriminated reason/effect unions in
`docs/CONFIGURATION_MODEL.md`. Each receives the configuration, resolved validation context,
readonly explicit corner reservations, and a caller-supplied `occurredAt`; the domain reads no
clock. Success preserves `createdAt`, copies the strictly later supplied instant to `updatedAt`, and
returns exactly one deterministic primary effect. Failure—including no-op or invalid time—returns
the exact input object and no effects. Only reorder and margin move normalize orders; hydration and
unrelated edits never repair them implicitly.

The runtime adapter validates the untrusted top-level envelope before invoking typed/domain logic.
If it is null, non-object, or has no usable configuration object, the adapter returns only
`{ ok: false, reason: { code: "INVALID_INPUT" } }`; it fabricates neither configuration nor effects.
After a configuration object is identified, every domain rejection returns that exact object.
Persisted and command timestamps require an explicit ISO offset and exactly three fractional-second
digits, matching JavaScript millisecond precision.

### 4.2 Units and numeric policy

- Geometry is metres throughout the domain and renderer adapter. Names that cross boundaries use
  the `M` suffix (`widthM`, `heightM`, `offsetM`).
- User-entered localized values are parsed once at the form boundary and normalized to the
  approved manufacturing grid before entering the domain.
- Grid arithmetic uses integer grid units internally where packing/reordering requires exact sums,
  then converts to metres at the scene-query boundary. Tolerance-based comparisons are reserved
  for derived Three.js bounds.
- Money is integer minor units with an ISO currency code. Floating-point prices never enter the
  pricing API.
- Persisted world coordinates are forbidden. A `SceneInstance` contains a derived transform and
  traces back to exactly one placement ID (or an explicitly identified room/decor object).

### 4.3 Layout and placement

> **Superseded (2026-08-24).** This entire section describes the run-anchor packing model. It is
> replaced by `DEVELOPMENT-SPEC.md` §3–§5: a placement owns a fixed position along its wall, columns
> are computed once at load and never change, free space is derived by `recomputeVoids()` after every
> mutation, and width editing is a boundary move between two neighbours that conserves the run total
> (so overlap is unrepresentable and shrinking cannot leave a gap). Specifically retired: `runAnchor`
> and anchor partitions, flow packing and earliest-fit segment advance, reorder and drag-to-reorder,
> `moveCabinetToRunMargin`, `junctionGroupId` and its AABB exemption, wall C, and cross-wall bigint
> occupancy scanning. What survives from this section's intent: no persisted world coordinates,
> deterministic output for the same inputs, definition/band agreement, fixed-size purchased parts
> never scaling with the host, and open shelving never placed in a corner. Corner bodies remain two
> independent placements — they are simply flagged structural (no replace, no delete, never a width
> donor) instead of being linked by an identifier.

The room shape owns canonical wall order and exact corner anchors. Each wall receives a derived
room-space transform. A placement first receives a deterministic interval on its wall from its
wall/band/run-anchor-local order, usable-run constraints, junction reservations, and width; that
interval then maps into room coordinates. Placements persist `runAnchor: flow | start | end` but no
world coordinate or derived segment ID. Start/end partitions form margin-attached blocks. Columns
in those blocks reserve the same interval across base, middle, and top; each remaining band's
independent flow order packs at the earliest valid integer-grid position and advances across
obstacle-split segments when a reservation blocks the candidate.

The layout engine must enforce:

- no overlap or wall overflow within a wall/band run;
- unique contiguous order within each wall/band/run-anchor partition;
- column reservations across base, middle, and top bands, plus room-space collision checks between
  all distinct canonical wall pairs, including opposing B/C walls in a U room;
- the explicit base/middle/top/column Y bands and canonical wall transforms in
  `docs/CONFIGURATION_MODEL.md`;
- definition family and placement vertical-band agreement;
- width support and host clearance for fixed-size bought elements;
- replacement-group, neighbour, and junction constraints;
- every column belonging to a contiguous start- or end-anchored group touching that run margin;
- no implicit offsets, centred/distributed slack, or synthesized fillers: unused segment tails stay
  free, while filler/end-panel items are explicit catalog-backed placements at supported widths;
- corner legs remaining separate linked placements; their reference-specific recess and exact
  butt-joint proof remains distinct from generic layout AABB validation;
- an open shelf never occupying a prohibited corner slot;
- deterministic output for the same configuration, catalog, and layout-policy versions.

Cross-wall validation is an integer domain query, not a Three.js bounds check. Once wall-local
packing and explicit `cornerReservations` have succeeded, each placement exposes a derived
`PlacementRoomOccupancy` containing its placement/wall/band/anchor, bigint source interval, and
bigint min/max X/Y/Z bounds. Wall A maps `[s,e]` by depth `d` to
`X=[s,e], Z=[0,d]`; wall B maps it to `X=[0,d], Z=[lengthB-e,lengthB-s]`; wall C maps it to
`X=[lengthA-d,lengthA], Z=[s,e]`. Y is the band bottom through the definition's actual height.
Here `d` is the definition's carcass `depthM`; worktop overhangs, fronts, handles, appliances,
chamfers, and other renderer envelopes remain for the fixed 3D proof. No scene epsilon or float
transform participates.

The query checks A/B for L and U rooms, and A/C plus opposing B/C for U rooms. Interior overlap on
all three axes returns `ROOM_SPACE_COLLISION`; equality on any axis is valid contact. Occupancies
sort by canonical wall, band, source interval, then locale-independent placement ID. Candidate
pairs sort lexicographically by their two occupancy indices; the first failure returns both IDs in
that order. The exact linked pair in one validated `junctionGroupId` is exempt only from this
generic AABB rejection. Reservations still constrain its local intervals and all other collisions;
because reservations carry no solid depth, they are never extruded into invented occupancies. The
reference-specific recess/worktop butt-joint proof remains a separate M0 gate and must use approved
corner inputs plus actual adapter geometry.

This wave does not add floor-polygon containment: linear rooms expose no depth and unequal U legs
do not define a closed floor footprint. Cross-wall scanning runs after existing context/schema,
corner-reservation, vertical, anchor, wall-local packing, column, and obstacle validation, preserving
their failure precedence. A collision failure contains only the ordered
`ROOM_SPACE_COLLISION` pair and never leaks a partial success `occupancies` array.

Dragging is an input method, not a separate placement model. During a pointer gesture the UI may
show an ephemeral preview, but dropping resolves only to a `targetOrder` on the placement's current
wall, vertical band, and run anchor, then calls `reorderCabinet(placementId, targetOrder)`. In M0,
changing a column between start and end uses the explicit transactional
`moveCabinetToRunMargin(placementId, targetSide, targetOrder)` command and recomputes column
reservations across all cabinet bands; non-column placements are rejected even when their
definition has a margin rule. Cross-wall or cross-band movement is rejected; it would require a
separately approved command. Invalid drops
animate back and leave durable state unchanged. The cabinet sheet
also exposes move-before/move-after controls so touch, keyboard, and assistive-technology users do
not depend on precision 3D dragging.

All command results preserve the `placements[]` element sequence: affected placement objects are
replaced at their original indices, never sorted or spliced into derived layout order. Reorder
changes only affected `order` fields; margin move changes the target anchor and affected source and
target orders. Resize preserves the selected definition and all other placement fields.
Replacement preserves exact width and explicit options and accepts only the compatible target
defined in the configuration-model contract. Omitted options resolve from the target defaults and
that resolved change is exposed in the primary effect. `setCabinetOptions` takes a complete object,
not a patch. Every placement whose persisted fields are unchanged retains its exact object identity
in the successful array.

All five edits validate original and candidate with the same `derivePlacementLayout` call and
immutable explicit corner reservations. They never infer or alter a corner extent. Fixed-host
clearance and neighbour-compatibility metadata are not in the current schemas, so this wave neither
implements nor invents those future catalogue constraints.

### 4.4 Undo and reversibility

> **Superseded (2026-08-24).** Undo is retired. `DEVELOPMENT-SPEC.md` §5.1 and §13.1: undo and the
> merging free-space model contradict each other, because by the time a user undoes a deletion the
> vacated opening may have merged with its neighbours, so there is no single prior state to restore.
> Deletion is final and the interface must say so. What survives: automatic adjustments are named and
> declared to the user (a preset that fits only after an adjustment states that adjustment on its
> card), and camera, selection, open sheet, hover, and gesture state remain presentation state that
> never enters the saved configuration.

The web store keeps bounded in-memory undo/redo history of successful configuration snapshots.
Only the current valid snapshot is persisted. Automatic preset adjustments are returned as named
`DomainEffect` entries for user explanation and are reversible with one undo action. Camera,
selection, an open sheet, hover, and drag previews are presentation state and never enter the
saved configuration.

## 5. Catalog, presets, and pricing

### 5.1 Versioned catalog

Catalog data is runtime-validated at build/startup and contains definitions, renderer keys,
replacement groups, layout roles (`cabinet | filler | end_panel`), supported widths, option
support, placement rules, and pricing rule IDs. Data
is immutable for a given `catalogVersion`. Layout ranges, grid, epsilon, obstacle behavior, and
preset strategy are immutable for a given `layoutPolicyVersion`. A saved configuration resolves
both exact versions, follows explicit migrations, or fails safely as a whole.

The first catalog should be extracted from the reference builder inventory, not inferred from
screenshots. The L-kitchen reference is evidence for its existing cabinet definitions and one
preset; it is not evidence for unapproved linear or U-shaped compositions.

### 5.2 Preset engine

> **Revised (2026-08-24).** The evaluator and the `compatible | incompatible` result survive, and so
> does the rule that the list and the confirmation use one evaluator. Two changes: there is no
> confirmation step — each card carries its own **Folosește** button, and choosing it applies the
> preset directly; and an evaluation that returns no compatible preset must fall through to bespoke
> generation rather than dead-ending. `DEVELOPMENT-SPEC.md` §13.3 question 5 also records that the
> reference's presets have no per-preset geometry — all four load the same scene and differ only by
> finish and camera. Real recipes remain unbuilt product work, and recipes for linear and U rooms
> remain blocked on those room layouts existing at all. Preset thumbnails are renders produced from
> the recipe by the `preset-shots.html` rig; re-run it whenever geometry or finishes change so a
> thumbnail cannot drift from the model.

A `KitchenPreset` is a strategy-neutral recipe. `evaluatePreset(room, preset, catalog,
layoutPolicy)` returns one of:

```text
compatible: exact placement recipe plus any named adaptations
incompatible: stable reason codes and the unmet wall/run requirements
```

Confirmation invokes `applyPreset`; only its generated placements become live state. Carousel
filtering and confirmation therefore use the same evaluator, preventing a card shown as
compatible from failing under different UI logic.

The engine should expose two strategy implementations behind one interface, selected only by the
resolved versioned `LayoutPolicy`:

- `fixed-fit`: preserve every recipe width and show the preset only if it fits;
- `module-pack`: adapt designated flexible slots on the approved width grid, using deterministic
  priority rules and reporting every changed/filler slot. It may use only recipe-allowed explicit
  filler/end-panel definitions at their supported widths; an unsatisfied explicit slot makes the
  preset incompatible rather than creating a width or hidden item.

Presets describe flexible slots and allowed substitutions but cannot choose or override a strategy;
a recipe supplies each placement's run anchor and cannot infer or silently change a column side. A
recipe/policy incompatibility is rejected. **Recommendation:** choose controlled `module-pack`
adaptation with discrete cabinet widths,
explicit filler/end-panel definitions, and no arbitrary stretching. It gives customers useful
presets across more room sizes while preserving manufacturable units and fixed appliance sizes.
This policy must not be enabled until the user approves the width and adaptation product
questions. Until then, M0 can prove the interface with a fixed reference recipe and test data.

### 5.3 Pricing boundary

Pricing is a pure fail-whole service in the domain package:

```ts
priceConfiguration(input: PriceConfigurationInput): PricingQueryResult
```

`PriceConfigurationInput` contains the unknown configuration, resolved
`ConfigurationValidationContext`, immutable `cornerReservations`, and one runtime-validated
`MdlPriceBook`. Before lookup, the query validates the context, price book, configuration, exact
pricing-version equality, and the complete `derivePlacementLayout` result. It never prices a layout
that editing would reject and never resolves a global/current book. The price book and result use
literal `MDL` plus `status: estimate | commercial`; M0 remains `estimate` until approved commercial
data exists.

Cabinet amounts resolve through the definition's `pricingRuleId` and exact integer-grid width.
Resolved material/colour—including definition defaults—uses the exact pair and width; resolved
handle and mechanism IDs use fixed rules. Intentional `none` produces no option line, whereas an
explicitly matched zero-valued rule still produces a traceable line. Optional M0 project rules are
unconditional fixed named charges or discounts; percentage, conditional, quantity, tax, delivery,
worktop, appliance, and installation formulas require later approved data/contracts.

Placement lines follow canonical occupancy order and component order `cabinet`,
`material_colour`, `handle`, `mechanism`; project charges follow by locale-independent rule ID, then
discounts by rule ID. Line IDs are derived from placement/component or project rule ID, labels come
from the matched rule, and placement lines expose their exact lookup source. Project lines have no
placement ID. Empty placements plus no project rules returns zero lines and total zero; any matched
zero amount remains a line.

All amounts are safe-integer MDL minor units. The engine sums them with `bigint`, rejects a sum
outside the JavaScript safe-integer range before conversion, and rejects a safe negative final
total. Only explicit project discounts may be negative. Version, layout, rule, exact-width, book,
overflow, or negative-total failures return stable structured errors and no partial lines or total.
The successful total is computed from returned lines, never independently.

The same pricing call supplies the editor, review, persistence metadata, and submitted snapshot.
React components and Three.js nodes may display its result but never reproduce a formula. Until
commercial data and wording are approved, sample data must be visually and structurally marked as
an estimate and must never be confused with a production price book.

`PricingLineSchema`, `PricingResultSchema`, and `ContactSubmissionSchema` are strict context-free
transport schemas, not pricing authorities. They require exact derived line IDs, canonical local
component/project grouping, discriminant/source shapes, safe amounts, and the exact line sum, but
cannot prove canonical occupancy order or resolve configuration/default/price-book facts. An API
or contact workflow accepts a submitted pricing snapshot only through:

```ts
verifyPricingSnapshot({
  pricingSnapshot,
  configuration,
  validationContext,
  cornerReservations,
  priceBook,
}): PricingSnapshotVerificationResult
```

The verifier parses the snapshot, reruns `priceConfiguration` with those exact trusted inputs, and
requires exact field-for-field and array-order structural equality. Malformed transport returns
`INVALID_PRICING_SNAPSHOT`; structurally valid but stale or tampered data returns
`PRICING_SNAPSHOT_MISMATCH`; an underlying pricing error propagates unchanged. Success returns the
fresh recomputed result. Every failure is fail-whole, with no accepted pricing, lines, or total.

### 5.4 Fixed reference L descriptor proof

Before Three.js is introduced, M0 has one reference-only orchestration boundary:

```ts
deriveReferenceLVerticalProof(
  input: ReferenceLProofInput,
): ReferenceLProofResult;
```

Its plain-data input contains both unknown JSON source seeds, the normalized resolved validation
context and configuration, exact immutable corner reservations, an immutable typed scene-recipe
registry, fixed decor recipes, and one `MdlPriceBook`. It validates and executes exactly:

```text
source trace → normalized catalog/configuration → explicit corner reservations
→ layout/occupancies → plain scene descriptors → pricing
```

Every stage is fail-whole and the first failure returns a stable stage/error without any successful
downstream or partial payload. The success contains the parsed `KitchenConfiguration`, complete
successful layout including bigint occupancies, placement/decor descriptor arrays, and successful
`PricingResult`. It creates no Three.js object, performs no I/O, mutates no input, and does not
become a general preset-adaptation API.

The fixed fixture contract is fully enumerated in `docs/CONFIGURATION_MODEL.md`: 24 normalized
placements, 28 authored placement-part descriptors, four fixed decor descriptors, three exact
junction groups/six reservations, the millimetre grid, wall A `3.600`, wall B `2.800`, and room
height `2.600`. The 2.800 m B run follows the executable refrigerator edge; stale seed metadata
claiming 2.4 m fails normalization. The source's 4.2 × 3.4 photography shell remains decor and does
not define the canonical domain runs or production room bounds.

The catalog seed remains evidence, not runtime catalog data. Every normalized definition has one
source-derived discrete width, a self-only replacement group, fixed reference materials and
geometry, no selectable options, and a stable proof renderer/pricing key. Direct/private source
calls are represented only by allow-listed typed recipes with exact arguments. A normalized
definition still has a mandatory `rendererKey`; missing/duplicate recipes, unknown calls, unsafe
arguments, or incomplete/multiple source-ID ownership fail closed. No seed string is dynamically
executed.

A recipe expands one placement into one or more ordered plain part descriptors. This is how the
cooktop remains structurally owned by its base and the three wall-B overhead cabinets remain owned
by the oven, pantry, or refrigerator column without creating overlapping independent placements.
Each descriptor carries its source scene ID, owning placement and definition IDs, renderer key,
typed builder call, derived placement transform, fixed local transform, and composed world
transform. Output sorts by canonical placement order then recipe part order; decor is separate in
source order. Auxiliary parts never emit independent pricing lines.

Reference-specific local offsets reconcile the generic carcass occupancy anchor with authored
builder roots without persisting world coordinates. Final descriptor transforms and arguments must
match all 28 seed placements within only the resolved scene-boundary epsilon. Nominal descriptor
bounds also prove the two corner countertops meet at world Z `0.630` with no interior overlap.
Actual `THREE.Group` creation, named mesh bounds, chamfer/material verification, renderer lighting,
and visual inspection belong to the following adapter wave.

Until approved nonzero estimate data exists, this proof may use only a versioned, structurally
marked reference/test price book with zero minor-unit rows for each exact cabinet width, no option
or project rules, and `status: estimate`. Its 24 cabinet lines and zero total prove deterministic
wiring and traceability, not a customer quote or commercial inclusion.

One source conflict stays an explicit gate: the authored end-panel centre leaves a nominal 1 mm gap
after the drawer even though the reference prose requires face sharing. The descriptor proof keeps
and reports the exact source transform; scene epsilon cannot hide it, and rendered/no-gap
acceptance requires a separately recorded source correction.

## 6. Three.js and React Three Fiber adaptation

### 6.1 Preserve the builders through an imperative bridge

> **Reinforced (2026-08-24), and now a gate.** A previous attempt at this project failed on exactly
> this section, and the owner has named the ported cabinets' visual quality as the single most
> important thing in the build. The guidance below is unchanged and correct; what changes is that
> compliance is now proven rather than asserted. The port is a port — same builder math, same mesh
> hierarchy, same mesh names, same materials, same chamfer cache, same structural dependencies — and
> **not** a reimplementation, an approximation, or a JSX rewrite. Its fidelity gate, with both
> structural parity assertions and side-by-side comparison against the reference renders in
> `design-source/Modern Kitchen Cabinets 3D (3)/shots/`, is in `docs/milestones/M1-scene-port.md`.
> The renderer setup in `three-d-stage.js` is part of the same gate: the environment, tone mapping,
> exposure and light rig are what make the geometry read as product photography, and porting the
> builders without them does not satisfy this section.

Do not rewrite the reference geometry as hundreds of JSX meshes. Port
`packages/three-adapter/reference/kitchen-parts.js` into `packages/three-adapter` with the builder
math, mesh hierarchy, names, materials, chamfer cache, and structural dependencies intact. The
port should expose typed production builders keyed by `CabinetDefinition.rendererKey` and accept
only the supported width/options parameters.

R3F owns the canvas, camera, controls, invalidation, and pointer-event lifecycle. Each placement
component asks the adapter registry to build an imperative `THREE.Group`, assigns
`userData.placementId` at its selectable root, applies the *derived* wall transform, and mounts the
group using R3F's `primitive` bridge. Selection raycasts to a mesh and walks to that marked root.

This provides a low-risk migration path:

1. Produce and contract-test the complete fixed L plain descriptors through the §5.4 domain proof.
2. Port only the typed recipes/builders those descriptors require and verify named geometry,
   dimensions, and bounds without React.
3. Render the descriptor-driven fixed `kitchen-l` composition through R3F and compare it to the
   reference scene; do not reintroduce `buildKitchen()` world placement.
4. Parameterize only axes/options permitted by the catalog and spec.
5. Later, and only once product supplies them: linear and U-shaped room transforms and approved
   preset recipes. Do not copy the L scene and visually guess the missing product designs.
   `DEVELOPMENT-SPEC.md` §13.3 question 4 is explicit that the band lines and the two wall planes
   are constants of this room and must become per-wall data before another shape can work.

The reference directory stays reference material. Production code is a traceable port with tests;
the source files are not casually modified or treated as a runtime dependency.

### 6.2 Non-negotiable render contract

- Local origin is floor-centred; +Y is up, +Z faces the customer, and +X is customer-right.
- Builder dimensions are metres; `box` receives bottom Y.
- Base front, worktop, plinth, working band, wall band, and ceiling-row planes remain those in
  `SPEC.md`.
- Cabinet bodies scale only on supported axes. Sinks, appliances, and handles remain fixed real
  size; the 1.6 mm chamfer is absolute.
- A sink uses a cut worktop and open no-top frame. Appliance niches remain smaller than their
  carcass and appliance fronts remain proud by their specified offsets.
- Corner legs are independent placements. Each leg owns its depth/recess calculation; worktops
  butt without overlap or coplanar interpenetration.
- Ceiling-row cabinets are push-to-open. Open shelving is prohibited in corners.
- Preserve procedural PBR-like materials, PMREM environment, ACES exposure, hemisphere/key/fill
  setup, and soft contact blob. Directional cast shadows stay off.

Finish and handle options should be implemented as material/part substitutions at builder
creation, never by non-uniformly scaling a finished group. Shared cached geometry/materials need an
explicit lifetime policy so unmounting one cabinet does not dispose resources used by another.

### 6.3 Mobile interaction and performance

The Canvas is client-only and route-loaded only for steps that need 3D. Keep one renderer alive
while moving between editor panels; option changes update the affected cabinet rather than
rebuilding the room. Use on-demand rendering outside active orbit/drag/animation, cap device pixel
ratio adaptively, cache chamfer geometry by dimensions, share immutable textures/materials, and
avoid directional shadow maps. Do not instance entire selectable cabinets unless selection,
material variation, and lifecycle behavior remain correct; geometry reuse is safer initially.

Orbit and tap gestures need explicit arbitration. With reorder retired there is no cabinet dragging:
every drag is an orbit, and the rule from `DEVELOPMENT-SPEC.md` §6.1 applies — on pointer-up, ignore
the event as a selection if the pointer moved more than 7 px. The mobile sheet must not steal or leak
pointer events into the Canvas. Price and the primary next action remain visible without covering the
selected cabinet; exact layout is a visual-design decision.

Picking has its own hard-won rules (§6.1 of the reference): raycast solids first and voids only
where nothing solid is behind, exclude void outlines from raycasting entirely
(`edges.raycast = () => {}` plus `raycaster.params.Line.threshold = 0.008`, because three.js
defaults that threshold to a full metre and every dashed outline then steals its neighbours' clicks),
inset void meshes 14 mm so they never overhang a neighbour's face, and resolve a worktop accessory to
its host cabinet. All three camera presets must frame floor to ceiling or the 2.20–2.60 m row becomes
too small to hit.

Performance budgets must be measured on an agreed representative phone after the first full
preset exists. Until then, do not invent frame-rate, load-time, or mesh-count claims. Required
evidence is an instrumented production build, browser console free of WebGL/resource errors, and
interaction checks at the agreed mobile and desktop viewports. An unsupported-WebGL state must
explain that configuration requires 3D; it must not silently present a non-editable fake preview.

## 7. Application state and persistence

> **Superseded in part (2026-08-24, engine amended 2026-08-25).** See
> `docs/decisions/2026-08-24-db-backed-shareable-persistence.md`. The three-way split of durable /
> workflow / ephemeral state below is unchanged, and so is every validation rule: parse, validate,
> migrate known schema versions as one transaction, and refuse to partially hydrate. What changes is
> where the durable tier lives. It is no longer `localStorage`; it is a **managed Postgres database
> hosted on Neon** (free tier, provisioned through the Vercel Marketplace), holding one self-contained
> JSON document per design, and a design is addressed by an opaque identifier that appears in the
> URL, so opening that link restores exactly that configuration. `ConfigurationRepository` stays —
> only the concrete adapter changes. The rule that the full configuration never travels in query
> parameters also stays, and is now load-bearing rather than incidental. Contact data remains absent
> from the stored configuration, which matters more now that a design is reachable by link.
>
> One consequence this section did not have to consider: the durable tier is now across a network.
> `localStorage` writes were synchronous and effectively infallible, so "persist after every
> successful command" was free. A network write is neither. The write path's timing and failure
> semantics are specified in the persistence record's "Write path" section and gated in M2; they are
> not an implementation detail to be settled at the keyboard.

Separate three kinds of state:

| State | Examples | Lifetime |
| --- | --- | --- |
| Durable product state | validated `KitchenConfiguration`, catalog/layout-policy/pricing versions | persisted locally under an opaque design ID |
| Workflow state | current route, source preset choice before confirmation | URL plus minimal session state |
| Ephemeral UI state | selected placement, camera, open sheet, drag preview, undo history | memory only |

For the first release, persist the small configuration envelope in `localStorage` after every
successful command. The envelope includes schema version, checksum/validation metadata if useful,
and update time, but no contact data. On load, parse unknown JSON, validate, migrate known schema
versions as one transaction, validate catalog references, and only then replace the store. A bad
or unknown payload yields a recoverable error and keeps the current state; partial hydration is
forbidden.

Use a repository interface (`ConfigurationRepository`) so a later account/server save can replace
browser storage without changing commands. Do not use IndexedDB until configuration size or
offline asset needs demonstrate it is required. Do not put the full configuration in query
parameters.

## 8. Routes and step behavior

Recommended App Router structure:

```text
/configurator/room       step 1: shape, dimensions, fitting-preset list, bespoke fallback
/configurator/configure  step 2: full-screen 3D editor, cabinet sheet/rail, live price
/configurator/review     step 3: final 3D view and grouped readable summary
/configurator/contact    step 4: contact form and submission consent/context
/configurator/success    non-editing confirmation state
```

The mobile mockup labels step 5 `/configurator/done`. The final path is an open question in
`docs/decisions/2026-08-24-design-reference-supersession.md`; pick one and use it in both places.

The wizard shell supplies progress, back/continue behavior, localized content hooks, and route
guards. Direct navigation to a later step restores a valid local configuration or redirects to
the earliest missing step with an explanation. Browser Back never erases a valid design. Review
uses the same scene query and pricing result as the editor. Contact submission uses the exact
reviewed configuration snapshot, not whatever happens to be in mutable UI state after the request
starts.

Step 1 is one step with six internal sub-states — shape, dimensions, validation, preset loading,
preset list, bespoke generation — not six steps. The customer sees "Pasul 1 din 4" across all of
them. Choosing a preset, or completing a bespoke composition, continues directly into Step 2 with
the editor open; there is no confirm-and-continue screen between them.

Step 1 validates shape-specific walls and height before evaluating presets. Preset preview assets
are optimized static renders generated from the corresponding versioned recipe; a card must not
promise a layout different from the recipe it creates. Step 2 uses a bottom sheet on mobile
(~70–83 vh, scrolling, pinned footer) and a 420 px right rail on desktop that appears on selection
and re-lays out the scene without moving the camera; the section components inside are identical and
only the shell branches. Every required edit has a semantic non-3D control.

Because the mobile sheet covers most of the viewport, mobile's viewing model is
**choose in the sheet, then dismiss it to inspect the result full-screen**, where desktop sees the
scene and the panel at once. Every edit still applies to the model immediately on both viewports —
the sheet's close control views, it does not commit, and it has no cancel semantics. This is a
visibility affordance driven by screen real estate, and it is the only place where the two viewports
differ by design; no domain rule differs. See the 2026-08-24 supersession record §5b. Step 3 groups placements
by wall then band then order — the same grouping the price breakdown uses — and each group offers an
edit action that returns to the scene with that cabinet preselected. Step 4 does not persist PII in
the configuration or browser repository.

## 9. Contact submission boundary

Define a provider-neutral server contract in `apps/web`:

```text
POST /api/contact-submissions
  contact: name plus approved email/phone fields and consent data
  design: immutable validated configuration snapshot
  pricingSnapshot: client-reviewed PricingResult transport
  clientRequestId: idempotency key
```

The server validates the payload again, loads the exact matching catalog/layout/pricing context,
resolves the immutable corner reservations used for the reviewed design, and calls
`verifyPricingSnapshot` with those trusted inputs. Missing or different corner inputs fail closed;
the endpoint never infers numeric corner extents. `ContactSubmissionSchema` alone is not authority,
and the server never trusts a client line or total. It accepts, stores, or forwards only the fresh
pricing result returned by successful verification, even when the submitted structure matched. A
`ContactSubmissionSink` adapter performs the selected temporary delivery/storage behavior. A
future CRM adapter can implement that interface later without entering the first-release scope.

The endpoint needs body-size limits, same-origin protections appropriate to deployment, rate
limiting/abuse controls, idempotency, structured errors, and PII-redacted logging. It returns a
submission identifier and status, not the submitted contact details. If no real sink is approved,
production must show submission as unavailable; a test-only in-memory sink must not fake customer
success. Retention, consent copy, destination, and operator access remain product/legal decisions.

## 10. Testing and verification strategy

### Domain and data

- Schema tests for all shapes, version migrations, missing/unknown references, and atomic load
  failure.
- Command tests proving valid edits and exact original-object identity plus unchanged canonical
  serialization on every rejection.
- Table-driven command tests for reason precedence, monotonic explicit timestamps, complete option
  replacement, preserved replacement width/options, column-only margin moves, in-place array-index
  preservation, order-normalization scope, immutable corner inputs, deterministic effects, and
  input-array-order independence. The table asserts every reason/effect variant's exact structured
  fields, unchanged-placement identity, all millisecond-precision timestamp boundaries, and the
  envelope-only `INVALID_INPUT` shape with no configuration/effects.
- `fast-check` sweeps across the approved wall and width grid for determinism, ordering, no overlap,
  no overflow, column-edge groups, replacement filtering, and junction behavior. Cross-wall cases
  cover A/B, A/C, opposing B/C, vertical separation, exact contact, interior overlap, multiple-error
  pair order, the same-group exemption, and collision with a third placement.
- Pricing contract tests proving configuration/layout preflight, exact version propagation,
  explicit/default/none option resolution, exact-width lookup, zero-valued lines, stable line
  IDs/order/source fields, placement traceability, empty pricing, charges/discounts, safe-integer
  totals and overflow, negative-total rejection, shuffled-input determinism, and fail-closed missing
  rules without partial output. Contextual snapshot tests prove strict local transport structure,
  fresh recomputation with exact corner inputs, exact structural equality, distinct malformed and
  mismatch errors, and no accepted or partial pricing on failure.
- Fixed-L proof tests validate the source-to-normalized trace, all 24 placements and six corner
  reservations, 24 canonical intervals/occupancies, the exact 28-part/four-decor descriptor sets
  and order, composed source transforms/arguments, direct-call rejection, corner nominal bounds,
  shuffled-input determinism, zero-only 24-line estimate result, and no partial payload at every
  stage failure. They expose the source end-panel gap as an unresolved gate rather than masking it.
- Catalog/preset build validation so a bad renderer key, recipe, preview reference, or pricing rule
  cannot ship.

### 3D adapter

- Headless Three.js tests over named child meshes, local bounds, anchor planes, and fixed-size
  purchased parts.
- Regression checks for the sink cut/open frame, appliance cavity/front offsets, handle caps,
  ceiling push-open state, and corner worktop butt joint without intersecting volumes.
- Integration assertions that every selectable root maps to one placement and every derived
  placement creates the expected builder key and transform.
- Real rendered inspection against the reference at desktop and the agreed mobile viewport;
  source inspection or headless bounds alone cannot certify realism.

### UI, routing, and API

- Component tests for localized numeric input, preset compatibility reasons, command rejection,
  sheet/dialog behavior, itemized price updates, and route guards.
- Playwright flows for all three room shapes once approved presets exist: create, edit, reorder,
  undo, reload, review, back, contact validation, submit, and duplicate-submit handling.
- Mobile checks include touch targets, portrait/landscape overflow, virtual keyboard, fixed-price
  bar occlusion, orbit-versus-drag behavior, browser console, and WebGL resource errors.
- API tests reject malformed/oversized payloads, invalid catalog versions, tampered totals,
  duplicates, and sink failures without logging PII or reporting false success.

Each implementation wave follows `docs/WORKFLOW.md`: scoped implementation, adversarial QA, code
and logic review, visual review for visible work, security review for contact/persistence/dependency
changes, then coordinator verification of the actual diff and commands.

## 11. Phased delivery

### Phase M0 — foundations and vertical proof

Approve the stack; scaffold the workspace and gates; implement schemas, pure commands, deterministic
layout, versioned sample catalog/pricing, persistence contract, and one fixed L-preset from the
reference. Port the minimum reference builders needed to render that proof after their domain
instances are correct. This refines, rather than narrows, `docs/milestones/M0-foundations.md`.

Exit evidence: M0 acceptance criteria pass, including numeric sweeps and a visually inspected
reference render on agreed desktop/mobile viewports.

### Phase M1 — room and preset selection

Integrate M0's canonical wall transforms and compatibility evaluator through shape/dimension input,
confirmed preset creation, previews, carousel filtering, restoration, and route guards. Add approved
linear/L/U recipes and the chosen versioned layout policy without reimplementing domain rules.

Exit evidence: every shown preset confirms successfully for the same inputs; incompatible rooms
produce actionable reasons; all three shapes survive reload with exact normalized dimensions.

### Phase M2 — interactive 3D editor

Complete the production builder registry and room scenes; integrate the M0 replacement, option, and
undo primitives through cabinet selection, a mobile sheet, supported width/options, and
material/handle/mechanism rendering.

Exit evidence: every successful edit changes configuration and scene consistently; rejected edits
change neither; fixed-size/structural render invariants pass and the real mobile surface is usable.

### Phase M3 — reorder and live price

Integrate the M0 reorder, column/junction, and pricing primitives through drag-to-order gesture
arbitration, accessible move controls, immediate itemized pricing, and editor performance tuning
based on measured devices.

Exit evidence: sweeps prove no successful reorder overlaps or overflows; invalid drops revert;
every visible price line traces to the edited configuration; measured evidence meets approved
budgets.

### Phase M4 — review, contact, and confirmation

Build the review projection/screen, contact form, server revalidation/repricing, approved temporary
submission sink, failure/retry/idempotency behavior, and confirmation route.

Exit evidence: the submitted immutable snapshot matches the reviewed design; PII remains outside
saved configuration; tampered totals are ignored; real sink success and failure are verified.

### Phase M5 — release hardening

Complete supported-locale coverage, accessibility, device/browser testing, performance and memory
profiling, security/privacy review, recovery states, production observability, and operational
documentation.

Exit evidence: every product acceptance criterion has direct current-state evidence; no phase is
closed from build/test status alone.

## 12. Falsifiable architecture acceptance criteria

- A configuration package can be imported and tested without loading React, Next.js, Three.js,
  browser globals, storage, or a network client.
- Given identical configuration/catalog/layout-policy/pricing versions, layout, scene-query, review, and price
  outputs are deterministic.
- Every 3D cabinet instance, review item, and cabinet/option price line traces to a placement ID;
  none can silently exist in only one projection.
- No UI, renderer, persistence adapter, or endpoint duplicates placement or pricing formulas.
- Pricing never substitutes a width or missing option rule, prices an invalid layout, drops an
  explicit zero-valued match, returns an unsafe/negative total, or exposes partial lines on failure.
- No accepted command persists world coordinates, overlaps, wall overflow, an invalid column
  group, a non-exempt cross-wall room-space collision, an invalid junction, or scaling of a fixed
  bought element. Generic AABB exemption of the exact linked corner pair does not certify its
  separate recess/worktop butt-joint proof.
- A rejected command and failed/unknown persisted payload leave the prior valid configuration
  unchanged.
- Placement commands never read a clock, reorder `placements[]`, silently normalize unrelated
  orders, reset replacement width/options, rewrite explicit corner reservations, or claim absent
  host/neighbour metadata. Their success effects and rejection codes are stable data contracts.
- A reference-builder port preserves the documented local axes, bottom-Y box convention,
  alignment planes, fixed-size rules, required open/cut hosts, seam behavior, chamfers, and lighting
  policy.
- Reload and browser navigation restore a complete validated design or fail clearly; they never
  partially hydrate.
- Contact details never enter the saved/shareable kitchen schema. The server treats
  `ContactSubmissionSchema` pricing as transport only and accepts it solely after exact contextual
  recomputation and structural equality; no test-only sink reports production success.
- Every required editor action works through a mobile-safe semantic control even if 3D dragging or
  hover is unavailable.

## 13. Risks and mitigations

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Rewriting builders during framework migration | Visual regression and lost structural fixes | Imperative bridge first; named geometry/bounds tests; real reference comparison |
| Product policy hidden in packing code | Presets behave unpredictably when width policy changes | Strategy interface plus explicit approved policy and versioned recipes |
| Float accumulation across long runs | False gaps/overlaps and unstable reorder | Integer manufacturing grid for packing; metres only at scene boundary |
| React state, scene graph, and price diverge | Wrong quotes or review | One validated configuration; pure projections keyed by placement ID |
| Mobile GPU/resource pressure | Jank, crashes, or lost context | Route loading, demand rendering, capped DPR, cached resources, measured device gates |
| Orbit/drag gesture collision | Configurator is unusable on touch | Explicit selection/drag state machine and semantic reorder fallback |
| Catalog or layout-policy changes invalidate saved work | Silent substitutions or broken designs | Schema/catalog/layout-policy/pricing versions, explicit migrations, fail-whole validation |
| Unapproved contact sink or privacy policy | Lost leads or mishandled PII | Provider-neutral server boundary; no fake production success; security/legal gate |
| Missing linear/U product designs | Generic engine exists but presets are visually unapproved | Treat recipes/previews as product inputs; do not infer them from the L reference |

## 14. Accepted architecture decisions

The product owner accepted these decisions on 2026-08-20; the dated record is
`docs/decisions/2026-08-20-initial-product-and-stack.md`:

1. Next.js App Router, strict TypeScript, pnpm workspace, R3F/Three.js, Zod, Zustand, Vitest,
   `fast-check`, and Playwright as the initial stack.
2. A framework-free configuration domain package and one-way dependency rules described above.
3. A traceable imperative port of the current Three.js builders mounted through R3F, not a
   declarative geometry rewrite.
4. Browser-local versioned configuration persistence for anonymous first-release designs, with no
   contact details stored in that schema.
5. Four explicit user steps plus a success route.
6. Integer manufacturing-grid layout and integer-minor-unit pricing at their respective exactness
   boundaries.
7. Controlled module-pack preset adaptation with discrete approved widths and explicit fillers.

## 15. Remaining product data inputs

These questions must not be silently answered by sample data or architecture code:

1. **Width data:** which discrete widths/grid and per-definition bounds are manufacturable? Is
   any arbitrary within-range width permitted?
2. **Room bounds:** minimum/maximum wall and height inputs. Windows and doors are in the first
   room-planning release; sockets and utilities are deferred.
3. **Commercial pricing:** source data, formula, tax/discount wording, and inclusion of
   worktops, appliances, delivery, assembly, and mechanisms.
4. **Contact deployment data:** consent/retention text and the real temporary persistence provider
   before CRM integration. Name and phone are required; email is optional.
5. **Localization ownership:** Romanian is default and Russian is supported; translation ownership
   and approved copy remain inputs.
6. **Preset design:** approved linear and U-shaped recipes/previews; only the L scene is evidenced
   by the current reference.
7. **Verification targets:** representative phone/browser matrix, exact mobile/desktop viewports,
   and measurable performance budgets after the first production preset baseline.

M0 may scaffold the approved stack and implement policy-neutral contracts while these answers are
collected. Any phase whose observable behavior depends on an unanswered item must keep that item as
an explicit gate rather than ship an accidental default.
