# M0 — Configurator foundations

> **STATUS: DONE — closed 2026-08-24, partially superseded. Stop reading here.**
>
> Do not read the rest of this document. Its placement model was replaced during M2 and the
> retired modules deleted; acting on the plan below would reintroduce a model the project has
> abandoned. Current state: `docs/STATUS.md`. Durable reasoning: `docs/decisions/`.
>
> Read on only to answer a historical question about what this phase committed to.

Status: **closed 2026-08-24, partially superseded.** Not abandoned and not failed — a substantial
part of it landed and still stands. The rest was built against a placement model the project has
since replaced. The revised plan is `docs/milestones/README.md` and `M1`–`M8`.

## Status revision — 2026-08-24

`docs/decisions/0003-design-reference-supersession.md` adopts the placement/derived-void model
from `docs/design/DEVELOPMENT-SPEC.md`. The 2026-08-20 progress log
below is preserved exactly as recorded; this section names what that log describes and where it now
stands. Nothing in the log was wrong when written.

**Landed and retained:**

- The pnpm workspace, the framework-free domain package, and the root commands.
- `catalog-seed/` as a traceable source extraction, still valid evidence for cabinet definitions.
  Its `source` fields cite the reference folder's former name; they are provenance of an extraction
  performed under that name and are deliberately left as recorded.
- Versioned configuration schemas, catalog definitions and option compatibility, integer-minor-unit
  pricing results, and contact submissions kept separate from configuration data.
- The pure MDL pricing engine, its fail-whole behaviour, and `verifyPricingSnapshot`.
- Wall A and wall B canonical transforms, and the scene-origin derivation that persists no arbitrary
  world coordinate.
- The command envelope, transactionality, exact-original-object-on-failure, and typed
  effect/failure discriminants — as shapes, for the new command set.

**Landed and now superseded** — these are retired code paths, not regressions:

- Persisted run anchors, anchor-partition ordering, and the anchored/flow packing algorithm.
- The `reorderCabinet` and `moveCabinetToRunMargin` commands (two of the five recorded commands).
- Canonical two-leg junction groups, their reservations, and their AABB exemption.
- Wall C transforms and every U-shape-specific derivation.
- Exact bigint cross-wall room-space occupancy and `ROOM_SPACE_COLLISION`.
- The wall-attached door/window obstacle schema and clearance-profile machinery.

**Contradiction to state plainly:** the log records 96 passing tests over that accepted surface.
Those tests are honest evidence for the model they cover, and a meaningful fraction of them test
behaviour the product no longer wants. Retiring a code path retires its tests with it. `M2` treats
the void/column engine as new work with `DEVELOPMENT-SPEC.md` §11 as its acceptance source, not as a
refactor of the packing engine.

**Never started, and now planned elsewhere:** work items 6 (Three.js adapter and rendered proof) and
7 (undo/redo). Item 6 moves to `M1`. Item 7 is cancelled — undo is retired.

The original plan follows unchanged.

---

Status (as recorded 2026-08-20): in progress. Stack and preset strategy were approved on 2026-08-20.
The policy-neutral packing engine can proceed with explicit test fixtures; production preset
adaptation and its full range sweep still wait for exact room ranges and catalog width/filler data.

## Goal

Create the smallest production foundation that can represent rooms, cabinet catalog entries,
presets, valid placement edits, and itemized pricing without coupling those rules to the 3D renderer
or UI framework.

## Why first

Drag/reorder, cabinet replacement, preset fitting, pricing, review, and 3D rendering all consume the
same configuration. Building them on separate state shapes would make invalid arrangements and
price/visual drift inevitable.

## Progress — 2026-08-20

Verified work landed so far:

- The initial product and stack decision is accepted and recorded in
  `docs/decisions/0001-initial-product-and-stack.md`.
- The pnpm workspace scaffold and buildable framework-free domain package are in place.
- `catalog-seed/` contains the traceable source catalog extraction and reference L-preset seed;
  neither is presented as approved commercial data.
- The domain package has initial structural and context-dependent Zod schemas for rooms, wall-attached
  door/window obstacles, catalog definitions and option compatibility, versioned configurations,
  traceable integer-minor-unit pricing results, and contact submissions kept separate from saved
  configuration data. Persisted run anchors, catalog layout roles, anchor-partition ordering,
  canonical two-leg junction groups, and definition-compatible anchor rules are included.
- Canonical wall A/B/C transforms now derive the documented starts, ends, tangents, front normals,
  and yaw for linear, L-shaped, and U-shaped rooms. The cabinet scene-origin query uses integer-grid
  intervals and derives its wall position, vertical-band origin, depth offset, and yaw without
  persisting arbitrary world coordinates.
- The pure placement-layout query now derives deterministic start/end/flow intervals, projects
  columns across cabinet bands, applies definition-specific obstacle clearance, consumes explicit
  terminal corner reservations, and returns contributor-preserving raw/unioned reservations plus
  usable segments in canonical order.
- Five transactional edit commands now cover reorder, resize, compatible replacement, complete
  option replacement, and column-only margin moves. They preflight the original layout, preserve
  exact failure identity, validate a complete candidate before commit, preserve placement-array
  indices, emit one typed effect, and use caller-supplied millisecond timestamps without a clock.
- Exact bigint room-space occupancies now derive canonical A/B/C carcass bounds and reject strict
  interior collisions across every distinct wall pair, while exact contact and the validated linked
  junction pair remain allowed under the documented limits.
- The pure MDL pricing engine now validates a versioned price book, reuses the accepted layout,
  resolves cabinet and option defaults, emits deterministic traceable estimate lines, and fails
  whole on missing rules or unsafe totals. Authoritative snapshot verification recomputes pricing
  before a contact or API boundary accepts it.
- All 96 tests, `pnpm check`, and `pnpm build` passed. Independent contract and QA review reported no
  remaining high- or medium-severity finding across the accepted schema, transform, layout,
  occupancy, command, and pricing waves.

M0 remains in progress. It still needs the fixed L-layout/descriptor proof, the Three.js adapter and
rendered UI vertical proof, approved nonzero estimate data for any customer-facing total, and
bounded undo/redo. The fixed proof may use the contract's zero-only reference price book without
claiming commercial readiness.

Unresolved inputs remain the exact room bounds, approved cabinet widths and filler rules, sample
price amounts and inclusions, the deploy-time contact persistence provider and privacy/retention
terms, approved linear and U-shaped preset designs, and representative verification devices,
viewports, and performance budgets.

## Planned work

1. Approve and record the application stack, then scaffold the application/workspace with strict
   type checking, unit tests, linting, production build, and their exact root commands in
   `AGENTS.md`.
2. Implement runtime-validated schemas from `docs/CONFIGURATION_MODEL.md`, including versioned
   persistence types, wall-attached door/window obstacles, policy-neutral supported-width and
   placement-rule shapes, persisted run anchors, catalog layout roles, and separate contact
   submission data.
3. Convert the existing reference builder inventory into a data-driven initial cabinet catalog
   without changing the reference geometry.
4. Implement canonical room transforms, derived run/occupancy queries, replacement and option
   compatibility, explicit run-anchor packing across obstacle-split segments, cross-band column
   reservations, integer-exact A/B, A/C, and opposing B/C room-space checks, and transactional
   resize/reorder/margin-move commands against an explicit product policy and the command contract
   in `docs/CONFIGURATION_MODEL.md`.
5. Implement the pure fail-closed pricing query and runtime-validatable versioned MDL price-book
   contract from `docs/CONFIGURATION_MODEL.md`. Normalize the source-evidenced fixed L fixture and
   wire it through seed trace validation → configuration schema → explicit corner reservations →
   layout/occupancies → plain scene descriptors → zero-only reference estimate pricing. Do not
   create Three.js objects in this wave or invent a nonzero amount.
6. Port only the reference builders required by that proof through the proposed Three.js adapter,
   mount them in the minimal mobile shell, and verify their objective geometry plus actual render.
7. Add the bounded snapshot undo/redo manager around successful domain commands and prove exact
   restoration independently of UI controls.

M0 owns the pure preset, replacement, option, reorder, pricing, and undo primitives required by the
vertical proof. M1–M3 own their user-facing controls and full-catalog integration; they do not
reimplement these domain rules.

Each implementation dispatch stays within the project's five-item/five-file guidance where
practical; this milestone is delivered as multiple reviewed waves.

## Acceptance criteria

- A linear, L-shaped, and U-shaped room validates only with the shape's required ordered walls,
  positive wall lengths, and a positive common height.
- Saved door/window obstacles round-trip with stable IDs and derive attachment from `wallId` plus
  an offset measured from the canonical wall-run start; they persist no independent world position
  or rotation. Sockets and utilities are not accepted by the M0 obstacle schema.
- Obstacle dimensions and offsets convert exactly to integer manufacturing units without rounding.
  An unknown wall, non-grid value, non-positive size, negative offset/elevation, wall or height
  overflow, nonzero door bottom elevation, duplicate ID, or same-wall rectangle overlap is rejected
  without partial hydration. Boundary-touching obstacle rectangles remain valid.
- Catalog schemas accept only the documented discrete or stepped-range supported-width variants
  and structured margin/corner/obstacle-profile placement rules. They reject empty/duplicate width
  sets, invalid steps or bounds, unsupported defaults, and missing clearance-profile references;
  tests provide policy fixtures but do not assert unapproved commercial widths or ranges.
- Representative rooms produce the exact canonical wall starts, tangents, front normals, yaw, and
  corner anchors defined in `docs/CONFIGURATION_MODEL.md`; mirrored winding or inward-facing fronts
  fail.
- The same valid configuration produces identical derived transforms and price results on repeated
  evaluation.
- Every cabinet scene instance and every cabinet/option price line traces to a placement ID in the
  configuration. A project-level price line instead traces to its named project rule.
- The fixed reference proof normalizes exactly 24 persisted placements from the two source seeds,
  using the IDs, definitions, widths, walls, bands, anchors, partition orders, source ownership,
  and definition envelopes frozen in `docs/CONFIGURATION_MODEL.md`. Its domain fixture uses the
  millimetre grid, no obstacles, height 2.600 m, wall A 3.600 m, and wall B 2.800 m. These are
  reference-only fixture dimensions, not production room bounds or width approval.
- Reference normalization treats executable `buildKitchen()` transforms as authoritative over the
  stale `authoredRuns.wallB: 2.4` metadata: the fixed 0.700 m refrigerator centred at source
  Z 2.450 reaches Z 2.800. The separate 4.2 × 3.4 photography shell remains fixed decor and never
  becomes domain wall length or a customer-input range.
- The proof supplies exactly the three named A-start/B-end junction groups and six millimetre-grid
  reservations frozen in the configuration model. Layout consumes them unchanged, returns all 24
  intervals/occupancies in canonical order, and never infers a B-corner extent from a body width.
- A raw source entry without `rendererKey` resolves only through an allow-listed typed proof recipe
  with its exact source arguments. Unknown calls, unsafe arguments, missing/duplicate recipes,
  unmapped or multiply mapped source IDs, and unowned emitted parts fail whole; source strings are
  never executed and no partial descriptor array is returned.
- Plain scene expansion returns exactly 28 placement descriptors in the frozen canonical
  placement/part order plus four decor descriptors in seed order. Every source placement ID appears
  once, every placement descriptor traces to one of the 24 configuration placements, and final
  position/yaw/builder arguments match the seed within only the resolved scene-boundary epsilon.
  The epsilon cannot affect layout or excuse a recipe mismatch.
- Descriptor-level structural assertions include the base/sink/dishwasher/cooktop dependencies,
  fixed bought-part arguments, all top-row `pushOpen: true` calls, and nominal corner worktop bounds:
  X-leg world Z `[-0.010,0.630]`, return world Z `[0.630,0.900]`, common Y
  `[0.820,0.860]`, and no interior overlap. Three.js construction, named mesh bounds, chamfers,
  materials, and rendered realism remain work item 6.
- The exact source end-panel transform leaves a nominal 1 mm gap after the adjacent drawer. The
  descriptor proof reports that conflict and does not use epsilon to certify the reference's
  no-gap prose. Rendered/no-gap M0 acceptance remains blocked until an explicit source correction
  is recorded.
- Reordering a cabinet changes only its order-derived placement; no persisted arbitrary world
  coordinate is introduced.
- Every placement persists `runAnchor: flow | start | end`, not a coordinate or derived segment ID.
  Orders are unique and contiguous per wall/band/anchor partition; otherwise identical start- and
  end-anchored column sets derive different exact margin blocks.
- Start/end partitions pack as face-sharing margin blocks. Columns reserve those intervals across
  base/middle/top, while each band's independent `flow` order takes the earliest valid integer-grid
  position across obstacle-split derived segments. Evaluation never centres a run or distributes
  residual slack. An anchored non-column collision rejects the configuration instead of sliding the
  placement inward.
- Interior gaps arise only from explicit reservations; unused segment tails remain unpersisted free
  space. Fillers/end panels are catalog-backed placements using approved supported-width rules, and
  no implicit filler, arbitrary stretch, or invented width may render or affect price.
- No successful command emits overlapping placements or a placement beyond its usable wall run.
  Columns reserve the same interval across base/middle/top bands. Derived bigint occupancies check
  A/B in L and U rooms plus A/C and opposing B/C in U rooms; a non-exempt pair is invalid exactly
  when its interiors overlap on X, Y, and Z, while equality on any axis remains valid contact.
- Generic occupancy uses the definition's carcass `depthM` and actual `heightM`; it does not claim
  worktop/handle/appliance/renderer-envelope collision coverage. It also makes no floor-polygon
  containment claim because linear rooms have no depth input and unequal U legs do not define a
  closed footprint. Those concerns require their explicit fixed-3D or room-footprint contracts.
- Public occupancies contain the placement/wall/band/anchor, source interval, and min/max X/Y/Z
  bigint bounds. They sort by canonical wall, `base`/`middle`/`top`/`column`, interval start/end,
  and locale-independent placement ID. When several cross-wall collisions exist, the engine scans
  lexicographically ordered occupancy-index pairs and returns the first as
  `ROOM_SPACE_COLLISION` with the two placement IDs in that same order and no success occupancies.
  Existing context/schema, explicit-corner, vertical, anchor, wall-local, column, and obstacle
  failures retain precedence over this final cross-wall scan.
- No successful configuration places a cabinet through a same-wall door/window rectangle expanded
  by the resolved policy clearance profile. Vertical non-intersection and exact edge contact remain
  valid, clearance beyond a wall is clamped to `[0, wallLength]`, and an invalid obstacle edit
  preserves the exact prior configuration. Vertical collision uses each definition's actual height
  from its band bottom, not the band's nominal maximum.
- Touching or overlapping reservations are unioned independent of input order and retain a sorted
  list of every contributing type/source ID. Returned placements/occupancies/scene instances sort by
  canonical wall, `base`/`middle`/`top`/`column`, interval start/end, and placement ID; reservations
  sort by start/end/type/source ID using `corner`/`column`/`obstacle`/`anchored`, while reservation
  unions use a locale-independent full contributor-sequence comparison.
- An invalid resize, replacement, option change, reorder, or margin move returns a stable reason,
  returns the exact original configuration object, and leaves its canonical serialized representation
  unchanged.
- A null/non-object top-level command envelope or one without a usable configuration object returns
  exactly `{ ok: false, reason: { code: INVALID_INPUT } }`, with no configuration or effects. Once
  typed/domain validation receives a configuration object, every failure returns that exact object;
  the boundary never fabricates a snapshot.
- Commands validate original and candidate states with the same resolved context and immutable
  explicit corner reservations. Failure has no effects and preserves timestamps; success returns a
  new object, preserves `createdAt`, and copies a caller-supplied strictly later `occurredAt` to
  `updatedAt` without reading a clock. Configuration and command timestamps require an explicit ISO
  offset and exactly three fractional-second digits. No-ops and invalid timestamps fail
  deterministically.
- Reorder normalizes only its existing wall/band/anchor partition. M0 margin move is column-only,
  requires a different eligible `start | end` side, and normalizes only its source and target
  partitions; a non-column margin definition is rejected. Resize, replacement, options, hydration,
  and layout queries never repair order implicitly.
- Successful commands preserve `placements[]` element order and each placement's original array
  index. They replace affected objects in place-by-index: reorder changes only affected `order`
  fields, while margin move changes the selected anchor plus affected source/target orders. Every
  placement with unchanged persisted fields retains exact object identity.
- Resize changes only width and timestamp and requires a grid-exact definition-supported width.
  Replacement changes only definition and timestamp, preserves exact width and explicit options,
  and requires the same family/band/replacement group/layout role plus compatible anchor, junction,
  width, and options. Absent options resolve from the target defaults and the effect reports any
  resolved change; unsupported explicit options are never silently dropped.
- `setCabinetOptions` replaces the complete explicit options object; omission means default or
  intentional `none`, not partial-patch semantics. Success effects and failure reasons use the
  documented stable discriminants and deterministic structured fields.
- Replacement candidates are limited to the selected placement's compatibility group and are
  further filtered by width and neighbour constraints.
- Preset evaluation rejects a wrong shape, unmet wall/height rule, unknown catalog reference, or
  recipe overflow before creating any placement.
- Unknown or unsupported material, colour, handle, or mechanism choices are rejected transactionally;
  push-to-open top-band units accept no priced/rendered handle.
- For every supported wall length across the agreed input range, property/sweep tests assert
  deterministic ordering, no overlap, and no overflow.
- A column arrangement is valid only when every column is in a contiguous `start` or `end` group
  touching that canonical run margin; no column may use `flow`. Contiguous grouping uses the same
  `runMargin` enum and anchor regardless of definition, replacement group, or clearance profile.
- `reorderCabinet` cannot change wall, band, or run anchor. A column changes side only through
  `moveCabinetToRunMargin`; success recomputes every cross-band reservation, while an invalid target
  returns the exact prior configuration. Resize and replacement preserve the existing run anchor.
- The exact two legs of one validated junction group are exempt only from generic cross-wall AABB
  rejection. That exemption does not waive interval/reservation/anchor/vertical validation or a
  collision with any third placement. The fixed L-preset proof must still show that their actual
  recesses and worktop volumes meet at a butt joint without interior overlap.
- An explicit junction reservation is valid only for exactly two linked legs on a canonical
  adjacent wall pair and terminal sides (A-start/B-end, or A-end/C-start in a U room). Every leg and
  its one matching wall/band reservation touches that physical margin; orphan legs, disconnected
  reservations, and extra reservation tuples fail closed.
- Commands keep explicit junction reservations unchanged. A leg edit succeeds only if those same
  reservations and the complete candidate remain valid; no command infers, resizes, re-anchors, or
  partially replaces a reservation tuple.
- Cabinet/appliance/sink/handle dimensions identified as fixed in the reference remain unchanged
  when the host cabinet is resized.
- Resizing or replacing a host below the documented clearance required by its fixed sink/appliance
  fails transactionally and preserves the exact prior configuration.
- Pricing is implemented outside rendering and UI code. Its input validates the resolved context,
  price book, configuration, immutable corner reservations, and complete layout before lookup. The
  configuration, context, book, and result use one exact pricing version; currency is literal `MDL`,
  and pre-commercial M0 data/results are structurally marked `estimate`.
- Every placement emits one cabinet line from its definition `pricingRuleId` plus exact supported
  width. Resolved material/colour—including defaults—uses the exact pair plus width; resolved
  handles and mechanisms use fixed ID-keyed rules. Intentional `none` emits no option line, while a
  matched zero-amount rule still emits a line. Missing rules, missing width rows, version mismatch,
  or layout rejection return a stable failure with no partial lines or total.
- Pricing lines have derived stable IDs, stable label keys and lookup-source fields. Placement lines
  trace to their placement and sort by canonical occupancy then `cabinet`, `material_colour`,
  `handle`, `mechanism`; unconditional fixed project charges follow by rule ID, then fixed discounts
  by rule ID. Every M0 line has literal quantity one and equal `unitAmountMinor`/`amountMinor`.
  Input array order and locale never affect the result.
- Strict context-free pricing transport schemas require exact derived line IDs, one contiguous
  cabinet-first component block per placement, complete code-unit ordering of charge and discount
  groups, canonical discriminant/source shapes, safe amounts, and the exact line sum. They cannot
  establish configuration resolution, canonical occupancy order, or price-book authority;
  `ContactSubmissionSchema` alone never accepts a quote as authoritative.
- The exported
  `verifyPricingSnapshot({ pricingSnapshot, configuration, validationContext, cornerReservations, priceBook })`
  parses the transport snapshot, recomputes through `priceConfiguration`, and requires exact
  field-for-field and array-order structural equality. Malformed transport returns
  `INVALID_PRICING_SNAPSHOT`; a structurally valid stale or tampered snapshot returns
  `PRICING_SNAPSHOT_MISMATCH`; pricing-query failures propagate unchanged. Verification is
  fail-whole, returns the fresh result on success, and returns no pricing, lines, or total on any
  failure.
- The fixed proof's pre-commercial price book has a test/reference-only exact version,
  `currency: MDL`, `status: estimate`, zero minor units at every required exact-width cabinet row,
  and no option or project rules. Successful proof pricing returns exactly 24 cabinet lines in
  canonical occupancy order and total zero. It proves wiring and traceability only; any nonzero or
  customer-facing estimate remains gated on approved data.
- All price-book and returned amounts are safe integer MDL minor units. Placement and charge amounts
  are non-negative; named project discounts are zero or negative. Totals are accumulated with
  `bigint`, must fit JavaScript's safe-integer range, equal the exact line sum, and remain
  non-negative. Empty placements plus no project rules returns an empty line array and zero total;
  a non-empty configuration never succeeds without cabinet lines.
- Contact data is absent from saved/shareable configuration schemas.
- Saved configuration round-trips exactly; known schema versions migrate atomically; unknown
  versions, missing catalog/layout-policy/pricing versions, invalid references, and partially valid
  payloads fail without partial hydration.
- Undo after a successful edit restores the exact previous valid snapshot.
- The M0 L-preset scene descriptor preserves the exact frozen source mapping and the reference's
  base/front/worktop/plinth planes, while reporting the authored end-panel gap instead of claiming
  continuous face sharing. After that source conflict is resolved, its ported builders preserve
  floor-centred axes, bottom-Y box semantics, absolute 1.6 mm chamfers, fixed purchased-part sizes,
  sink/open-host dependencies, corner butt joints, top-band push-open behavior, and the documented
  no-directional-shadow policy for every builder exercised by the proof.
- Unit tests, type checking, lint, and the production build pass using the approved commands recorded
  in `AGENTS.md` during work item 1.

## Verification

- Schema and command unit tests, including boundary and invalid cases.
- Table-driven command tests cover every stable failure code and its precedence, success effect
  shape/order, no-op/timestamp boundaries, order-normalization scope, immutable junction inputs,
  exact failure identity/serialization, unchanged-placement identity, and absence of input
  mutation. The table asserts the exact fields of every reason/effect variant and includes the
  envelope-only `INVALID_INPUT` branch, proving it returns no configuration or effects.
- Numeric sweeps across the approved room/wall dimension range, including no/start/end/both-side
  column groups, independent band orders, obstacle-segment skipping, exact edge contact, residual
  slack, filler-combination failure, every A/B, A/C, and B/C wall-pair class, vertical separation,
  opposing-wall depth collision, multiple-collision ordering, and the narrow junction exemption.
- Snapshot-free assertions over explicit transforms, adjacency, and pricing lines. Pricing tables
  cover explicit/default/none options, exact and missing widths, zero-valued rules, empty pricing,
  charges/discounts, negative final totals, safe-integer boundaries and overflow, duplicate keys,
  version/layout rejection, shuffled inputs, exact line IDs/order/source fields, and fail-whole
  errors. Snapshot-verifier cases cover malformed IDs and component blocks, placement-block
  recurrence, complete code-unit project ordering, stale metadata/source/label/amount/total/order,
  mismatched corner inputs, exact success equality, fresh-result identity, and every fail-whole
  verification path.
- One rendered reference preset inspected at desktop and the agreed mobile viewport after the
  first 3D adapter exists, including browser-console and WebGL resource checks.

## Risks and unresolved inputs

- Production preset adaptation, wall/height bounds, and approved width/filler data must be supplied
  before production-range preset sweeps can pass. The policy-neutral packing algorithm and focused
  fixture-based tests may precede those commercial inputs because the policy is always explicit.
- Fixed-host clearance and catalogue neighbour-compatibility metadata are not present in the
  current schemas. The initial command wave must not invent or claim those rules; their broader
  resize/replacement acceptance criteria remain gated on a later metadata contract and tests.
- Exact numeric corner/junction reservation extents, recesses, and clearances remain outside this
  packing wave. Tests may consume explicit validated fixtures, but implementation must not infer
  those values from generic widths or visual guesses. Generic AABB acceptance of the linked pair
  is not evidence that the special corner butt joint is correct; the reference-geometry proof
  remains required.
- Real commercial pricing is unavailable; sample pricing must remain visibly and structurally
  provisional. Tests may use explicit estimate fixtures, but neither docs nor engine code may
  invent a commercial amount or inclusion.
- Reference metadata says wall B is 2.4 m while the executable fixed refrigerator reaches 2.8 m;
  the descriptor proof uses the executable extent and rejects 2.4 m as a normalized wall length.
  The raw end-panel transform also leaves a 1 mm gap contrary to the no-gap prose. Neither
  discrepancy may be generalized into production room data, hidden by scene epsilon, or declared
  visually resolved before the recorded source correction and adapter proof.
- The exact room bounds, discrete width/filler data, sample price amounts, and deploy-time contact
  persistence provider remain open inputs; their contracts can precede the data.
- The reference currently demonstrates an L-shaped scene; linear and U-shaped preset recipes need
  product/design input even though their room transforms can be implemented generically.
