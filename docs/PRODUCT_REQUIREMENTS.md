# Lemnaria 3D kitchen configurator — product brief

Status: active product goal. Initial decisions are recorded in
`docs/decisions/2026-08-20-initial-product-and-stack.md`; the placement model was superseded on
2026-08-24 by `docs/decisions/2026-08-24-design-reference-supersession.md`.

The canonical state and placement rules are
`design-source/Modern Kitchen Cabinets 3D (3)/DEVELOPMENT-SPEC.md` §3–§5 and §11.
`docs/CONFIGURATION_MODEL.md` remains in force only for pricing, versioning, persistence, and the
contact-data separation; its placement, run-anchor, reorder, junction-group, and cross-wall sections
are superseded. The technical design in `docs/ARCHITECTURE_PROPOSAL.md` was approved on 2026-08-20
and remains in force for the stack, package boundaries, render contract, persistence, and submission
boundary, subject to the same supersession. The revised phase plan is `docs/milestones/README.md`;
`docs/milestones/M0-foundations.md` is closed as partially superseded.

## Product goal

Build a mobile-first, 3D-only kitchen furniture configurator. A customer chooses a room shape and
dimensions, starts from a compatible full-kitchen preset, edits individual cabinets in a realistic
3D room, sees an updating price estimate, reviews the result, and submits contact details so
Lemnaria can follow up.

The first release is a kitchen configurator. Other furniture categories and CRM lead creation are
future work.

**The near-term target is a working POC that matches the design reference.** Prioritise a
demonstrable end-to-end path — room, preset, 3D editing, review, contact, success — with real
database persistence and 3D that matches the reference's visual quality. Edge-case completeness and
the remaining commercial data land as named later work, never as silent omissions.

## Flow

Five screens. Step 1 has six internal sub-states and is still one step; the customer sees "Pasul 1
din 4" throughout it. Choosing a preset, or finishing a bespoke composition, continues directly into
the 3D editor — there is no confirm-and-continue screen between them.

### Step 1 — Room and kitchen preset

1. Choose one room shape: linear, L-shaped, or U-shaped. The picker offers all three; only L is
   buildable today, so any shape without an approved layout is refused at this step with a human
   reason rather than accepted and rendered wrong.
2. Enter the length of every wall in the selected shape and the room height. For L and U, a
   corner-direction toggle mirrors a live 2D top-down plan preview; the direction is never inferred
   from the wall lengths.
3. Browse the presets that fit, as a vertical list on mobile and a grid on desktop. Each card
   carries its own **Folosește** button; there is no separate confirmation screen. Only presets that
   fit are listed, and one that fits after a declared adjustment states that adjustment inline.
4. Choosing a preset creates the editable configuration and opens the 3D editor directly. When no
   preset fits, the flow composes a bespoke layout instead of dead-ending, placing sink and cooking
   first and labelling what does not fit rather than cramming it in; when that composition finishes,
   it opens the editor the same way.

The preset is a composition of separate cabinet instances, not a single merged 3D model. Room
dimensions and preset compatibility must be validated before a preset can be used.

### Step 2 — Configure in 3D

The most important screen in the product. The kitchen and room occupy the primary viewport. The user
can orbit and inspect the room and select an individual cabinet or an empty slot. Selection opens a
focused editor: a right-hand rail on large screens, appearing on selection; a bottom sheet on small
screens.

Because that sheet covers most of a phone's viewport, mobile's viewing model is **choose in the
sheet, then dismiss it to inspect the result full-screen**, where desktop sees the scene and the
panel at once. Every edit still applies to the model immediately on both — dismissing the sheet
views the result, it does not confirm or cancel anything.

Selection resolves either a body or an empty slot. An empty slot is derived free space, never
authored: deleting a body makes space, and adjacent free space merges into one opening subdivided by
the base / middle / top module lines.

Per-cabinet editing includes, when supported by that cabinet's definition:

- replace with another cabinet in the same band (same code path as inserting into an empty slot);
- select finish colour;
- select handle mode, including push-to-open;
- adjust width, which moves the boundary with one neighbour and conserves the run total;
- delete, which turns the body's opening into selectable free space. Deletion is final; there is no
  undo.

Material and hardware brand are whole-kitchen settings reached from the editor's top bar, not
per-cabinet controls.

Compatibility categories are:

- base cabinets (floor to 0.86 m);
- middle/wall-band cabinets (1.50–2.20 m);
- top/ceiling-row cabinets (2.20–2.60 m, push-to-open by default);
- full-height column cabinets, the only family permitted to exceed one band.

The 0.86–1.50 m backsplash zone is never an opening. A replacement must preserve the band; only
`column` bodies may span more than one. Reordering and dragging a cabinet along its wall are not
supported: select-then-replace expresses the same intent, and nothing moving horizontally is what
keeps derived free space correct. Widths and inserts are offered only where they can be satisfied —
an option that cannot be applied is disabled with its reason, never offered and then refused.

The screen shows a persistent live total. It is the sum of cabinet prices adjusted by selected
materials, hardware/mechanisms, supported width rules, and any other explicitly modelled options.
Price changes must be immediate and explainable from the selected configuration.

### Step 3 — Review

Recommended as a separate step rather than hiding the outcome inside the editor. Show the final 3D
configuration plus a readable summary grouped by wall/layer: cabinet choices, dimensions,
materials, hardware, and total estimated price. The user can return to the editor without losing
state or continue to contact details.

### Step 4 — Contact and confirmation

Collect the customer's name and contact channel(s). Validate the form, preserve the reviewed
configuration, and show a clear successful-submission state. The first release may keep the
submission local or use a temporary application endpoint; creating a CRM lead is explicitly out of
scope until a later phase.

## 3D source of truth

Use `design-source/Modern Kitchen Cabinets 3D (3)/` as the starting point for cabinet geometry, materials,
lighting, camera presentation, and room composition. Preserve the contract in its `SPEC.md`:

- metres and the documented local axes/anchors;
- fixed real-world sizes for appliances, sinks, and handles;
- scalable cabinet axes only where allowed;
- host-geometry dependencies such as worktop cut-outs and open appliance/sink frames;
- butt joints without overlapping/coplanar solids;
- 1.6 mm chamfers, the existing realism/material strategy, and no directional cast shadows unless
  a later recorded decision replaces that rendering approach.

The target is a natural, product-photography-like view that remains responsive enough for direct
configuration on a typical phone and desktop.

## Initial scope boundaries

In scope:

- the L-shaped two-wall room modelled by the reference: wall A at z=0 with fronts facing +Z, wall B
  at x=0 with fronts facing +X;
- the room-shape picker for all three shapes, with wall lengths, height, and corner direction;
- curated kitchen presets made of individual cabinet instances, plus bespoke generation when none
  fits;
- 3D-only configuration, body and empty-slot selection;
- same-band replacement, insert into free space, delete, finish and handle choices, and width
  editing as a neighbour boundary move;
- whole-kitchen material and hardware-brand settings;
- live price estimate with a wall → band → order breakdown;
- review and contact flow;
- server-side persistence of a design, addressed by a shareable link that reopens exactly that
  configuration.

Out of scope for the first release:

- CRM integration and sales-pipeline automation;
- furniture categories other than kitchens;
- offline/path-traced rendering, GI, or other rendering outside the reference's real-time target;
- unconstrained free placement that ignores walls, bands, or manufacturing compatibility;
- reorder, drag-to-move, and run re-split;
- undo/redo, which the merging free-space model cannot express coherently;
- linear and U-shaped room *layouts*, wall C, and door/window obstacles — deferred until a recipe
  and per-wall data exist, per the 2026-08-24 decision record.

## Product principles

- Start from a viable full kitchen, not an empty canvas.
- Prevent invalid configurations instead of allowing them and reporting errors later.
- Keep the 3D result and price synchronized from one configuration model.
- Make every automatic adjustment explicit and declared, never silent. Deletion is final and the
  interface must say so rather than implying a reversal that the model cannot deliver.
- Never offer what cannot be satisfied. A refusal that reaches the customer means a list offered
  something it should have disabled.
- Mobile is a first-class configurator surface, not a reduced read-only preview.
- Treat the displayed price as an estimate until pricing rules and commercial wording are approved.

## Remaining product data decisions

1. Exact minimum/maximum wall lengths and room heights.
2. The approved discrete width set per cabinet definition and allowed filler widths. The reference
   prototype uses 400/600/800, dishwasher 450/600, hood 600/900 and dropped 1000; those are
   prototype values, not approved catalog data.
3. Sample price amounts and whether delivery, worktop, and appliances appear in the estimate.
4. Retention period, deletion policy, and privacy copy. The storage question is settled — a managed
   Postgres database on Neon's free tier holding one self-contained JSON document per design, with
   shareable links, per `docs/decisions/2026-08-24-db-backed-shareable-persistence.md` — but how long
   a design is kept, and what the customer is told about it, is not. Designs are currently kept
   indefinitely as a deliberate POC placeholder, which is a decision to revisit, not a policy.
5. The real threshold behind the "fits after a ≤ 30 cm adjustment" preset rule shown in the mockups.
6. Bespoke-generation priority thresholds beyond "sink and cooking first, then storage".
7. Whether any response timeframe may be promised on the success screen, and the consent/legal copy
   on the contact step. Both are content slots in the mockups, not final copy.
8. Real per-preset geometry recipes. The reference's four presets share one scene and differ only by
   finish and camera angle.
