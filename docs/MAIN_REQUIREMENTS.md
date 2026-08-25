# Lemnaria kitchen configurator — Claude Design prompt

> **Superseded on 2026-08-24. Historical record only — do not plan or implement from this file.**
>
> This document is the prompt that generated an earlier mockup. The owner has replaced that mockup
> with `design-source/Modern Kitchen Cabinets 3D (3)/`, whose `Lemnaria Configurator Mobil.dc.html`
> and `Lemnaria Configurator Desktop.dc.html` are now the authoritative screen, state, and copy
> reference, and whose `DEVELOPMENT-SPEC.md` is the authoritative domain and editor contract.
>
> Known direct conflicts: §3.2 specifies a **preset carousel with a confirm step**, where the new
> mockups specify a filtered list (mobile) / four-up grid (desktop) with a per-card **Folosește**
> button and no confirm screen; §4.3 specifies **reorder/drag**, which the new reference built and
> then removed. §"Project stack" also points at the removed path `design-source/3D design
> reference/`; the current path is `design-source/Modern Kitchen Cabinets 3D (3)/`.
>
> See `docs/decisions/0003-design-reference-supersession.md`. It is kept as a paper trail.

Status: design brief derived from `docs/PRODUCT_REQUIREMENTS.md`, `docs/ARCHITECTURE_PROPOSAL.md`,
`docs/CONFIGURATION_MODEL.md`, and `docs/brand.md`. Use this document as the prompt/brief handed to
Claude Design (or any visual-design tool) to produce mockups for the configurator. It describes every
screen, its required content, states, and the technical constraints the visuals must respect. It is
not a new product decision — where the source docs leave something open, this file says so explicitly
rather than inventing an answer.

---

## Project stack

Accepted 2026-08-20 (`docs/decisions/0001-initial-product-and-stack.md`,
`docs/ARCHITECTURE_PROPOSAL.md` §2/§14). Included so visual designs stay implementable within the real
constraints (e.g. CSS Modules/tokens rather than a heavier design-system runtime, R3F-driven 3D rather
than baked video/renders).

| Concern | Choice | Notes |
| --- | --- | --- |
| Workspace | pnpm workspace, single deployable Next.js app | `apps/web` + `packages/configurator-domain`, `packages/catalog-data`, `packages/three-adapter` |
| Web application | Next.js App Router + React + strict TypeScript | Mobile web delivery, route-level code splitting, server contact boundary |
| 3D host | Three.js via `@react-three/fiber`, `@react-three/drei` for select controls/helpers only | Imperative port of the existing reference builders (`design-source/3D design reference/`), not a JSX geometry rewrite |
| Runtime schemas | Zod, TypeScript types inferred from schemas | Shared contract for storage, restoration, catalog data, API requests |
| Client state | Zustand, domain commands as the only durable mutations | No product logic inside store actions |
| Forms | React Hook Form + shared Zod schemas | Contact form, room-dimension inputs |
| Styling | CSS Modules + centralized CSS custom-property design tokens | No larger design-system commitment yet — brand tokens in §1 below should map directly to CSS custom properties |
| Unit/component tests | Vitest + React Testing Library + `fast-check` | Pure-domain + numeric/property sweeps |
| Browser tests | Playwright | Real mobile viewport, touch/pointer, WebGL, restoration |
| Formatting/lint | ESLint + Prettier, strict type checking | |
| Persistence (first release) | Browser `localStorage`, versioned configuration envelope | No contact/PII in this schema; server-side sink for contact submissions is provider-neutral and not yet chosen |

**Architectural boundary that matters for design**: the domain package (`configurator-domain`) owns all
placement/pricing rules and knows nothing about React, Next.js, R3F, or Three.js. `three-adapter` renders
derived scene data; it never computes layout or price itself. Screens must never show UI that implies the
renderer or a component is deciding price/placement independently (e.g. no "recalculating locally" spinner
that isn't backed by an actual domain command) — the visual and the price always come from one validated
`KitchenConfiguration`.

---

## 0. How to use this brief

Design a **mobile-first, 3D-only kitchen furniture configurator** for Lemnaria. Mobile is a first-class
editing surface, not a read-only preview — every interaction must have a working mobile layout, not
just a desktop layout that degrades. Design both the mobile (portrait, ~375–430px width) and desktop
(≥1280px) versions of every screen. Tablet/landscape can be treated as an intermediate breakpoint of
the same layout system.

Produce, for each of the 5 steps below:
1. A primary mobile screen (portrait).
2. The equivalent desktop layout.
3. Key interactive states called out per screen (empty, loading, error, selected, invalid).

The flow is strictly linear: **Room → Configure → Review → Contact → Success**, shown as a persistent
stepper/progress indicator (1 of 4, plus a non-numbered success state). Back navigation must never
discard a valid in-progress design.

---

## 1. Brand and visual system

These are **provisional fallback tokens**, not final brand — call this out visibly in the design file
(e.g. a cover note) so it's clear the palette is a placeholder pending a real brand pass.

**Color tokens**

| Token | Value | Use |
| --- | --- | --- |
| `brand` | `#7C5C3D` | Primary actions, active states |
| `brand-light` | `#A07850` | Primary hover states |
| `brand-dark` | `#5A3E25` | Pressed states, headings |
| `surface` | `#FAFAF8` | Page background |
| `surface-raised` | `#F5F3F0` | Cards, panels |
| `surface-overlay` | `#EDE9E3` | Hovered items, chips |
| `border` | `#DDD6CC` | Dividers, input borders |
| `text` | `#1C1814` | Primary text |
| `text-subtle` | `#6B5E52` | Secondary text |
| `accent` | `#2D5016` | Sparse secondary actions/highlights |
| `success` | `#2A7D4F` | Success states |
| `warning` | `#B45309` | Warnings |
| `error` | `#DC2626` | Errors |
| `info` | `#1D4ED8` | Informational UI |

**Type & voice**

- UI typeface: **Inter**. Optional display companion for headings/marketing moments: **Fraunces**.
- 4px spacing grid.
- **Tabular numerals** for every price and dimension value (critical: the live price and wall-length
  inputs must never visually jitter as digits change).
- Photography style: warm, natural, real installations, visible wood/material texture — no sterile
  render-farm look. (Preset preview thumbnails, however, are generated 3D renders, not photography —
  see Screen 1.)
- Voice: warm, expert, understated. No superlatives, no translated-sounding copy. Content is bilingual
  Romanian (default) / Russian — design text frames wide enough to accommodate ~20–30% length variance
  between the two languages.

**Non-negotiable framing**: the displayed price is an **estimate**, not a commercial quote, until
pricing is formally approved. Every screen that shows a price must carry a small persistent "estimated
price" label/badge — do not design a screen where the total reads as a final, binding number.

---

## 2. Global chrome

Design once, reuse everywhere:

- **Stepper/progress bar**: 4 steps (Room, Configure, Review, Contact) + Success as a distinct
  non-stepped end state. Shows current step, completed steps (tappable to go back), and future steps
  (visually present but not yet reachable by tap unless already unlocked by a valid config).
- **Persistent price bar** (steps 2–4): compact, thumb-reachable on mobile, never covers the actively
  selected 3D cabinet. Shows "Estimated total" + amount + a `?`/info affordance explaining it's an
  estimate.
- **Primary/secondary action pattern**: one primary CTA per screen (bottom-anchored on mobile, e.g.
  sticky footer bar), one secondary "back" action.
- **Error/toast pattern**: inline, non-blocking, explains *why* an action was rejected in plain
  language (the domain returns structured error codes — see §3.2/3.4 — copy must translate codes to
  a human reason, not show raw codes).
- **Loading/skeleton pattern** for the 3D canvas mounting and for preset preview thumbnails.
- **Offline/WebGL-unsupported state**: if the device can't run WebGL, show an explicit message that
  3D is required to configure — never silently show a static, non-editable fake preview.

---

## 3. Screen 1 — Room & kitchen preset (`/configurator/room`)

**Goal**: capture room shape and dimensions, then let the customer pick a starting full-kitchen preset
that fits.

### 3.1 Sub-step A — Room shape and dimensions

- Three shape choices presented as large, tappable illustrated cards (not a dropdown): **Linear**,
  **L-shaped**, **U-shaped**. Each card shows a simple top-down floor-plan glyph, not a 3D render.
- On selecting a shape, reveal numeric wall-length inputs for exactly that shape's walls, plus one
  room-height input:
  - Linear → 1 wall length field (`wall-a`).
  - L-shaped → 2 wall length fields (`wall-a`, `wall-b`), shown with a small top-down diagram
    labelling which wall is which (wall-a runs along one axis, wall-b turns the corner).
  - U-shaped → 3 wall length fields (`wall-a`, `wall-b`, `wall-c`).
  - Always: 1 room-height field.
- Inputs are numeric, localized (comma/period per locale), with a unit suffix (metres) shown inline —
  design large touch-friendly number fields, not tiny native spinners. Tabular numerals.
- **Exact min/max bounds are not yet approved product data** — design the validation-error state
  generically ("this wall is shorter/taller than supported") rather than hard-coding a number in the
  mockup copy.
- A live top-down floor-plan preview updates as the user types, so they can sanity-check proportions
  before continuing — this is a simple 2D schematic, not the 3D scene.
- Primary CTA "Continue" is disabled/greyed until all required fields for the chosen shape validate.

### 3.2 Sub-step B — Preset carousel

- Horizontally swipeable carousel of **kitchen preset cards**, filtered to only those compatible with
  the confirmed room shape/dimensions (compatibility is computed, not just shape-matched — a preset
  can still be shown as incompatible for a too-small/too-large wall).
- Each card shows: a small rendered 3D preview image (`previewAsset`, generated from the preset's
  versioned recipe — must visually match what gets created, so treat it as a real product photo, not
  decorative art), a name, and enough summary info to distinguish layouts (e.g. cabinet count, style
  tags, base/wall/column mix) — exact summary fields are a content decision, leave a labelled slot.
- Incompatible presets can still be visible but visually de-emphasized (dimmed/disabled) with a short
  stable reason (e.g. "needs a longer wall B"), not simply hidden — do not silently filter without
  explanation, since the same evaluator that filters here also gates confirmation.
- Selecting a card shows a confirm affordance (e.g. bottom sheet with a bigger preview + "Use this
  kitchen" CTA), not an instant, unconfirmable jump into the editor.
- Confirming creates the editable configuration and transitions to Screen 2. This is a real state
  transition worth its own transition/loading moment (short, since it's just placement generation, not
  network-bound).

**States to design**: empty (room not yet valid → carousel hidden or replaced with a prompt to finish
Step A), loading (computing compatibility), no compatible presets (rare but must be designed —
actionable message, e.g. suggest adjusting dimensions), confirmed/transitioning.

---

## 4. Screen 2 — Configure in 3D (`/configurator/configure`)

**Goal**: the core editing surface. Full-screen 3D room + per-cabinet editing + live price.

### 4.1 Layout

- **Mobile**: 3D canvas occupies the full viewport under the stepper; a compact persistent price bar
  is docked bottom; tapping a cabinet opens a **bottom sheet** (not a full-screen takeover — the 3D
  scene should stay partially visible/dimmed behind it so context isn't lost). The sheet is draggable
  (peek / half / full states) and must never intercept pointer/orbit gestures meant for the canvas
  underneath.
- **Desktop**: 3D canvas is the primary panel; selecting a cabinet opens either a **modal** or a
  **persistent side panel** (design both directions if time allows, recommend the side panel for
  desktop since it avoids blocking the 3D view during comparison). Price is shown in a persistent
  header/sidebar strip, not floating over the model.
- Camera: orbit/inspect controls around the room. Design a subtle on-canvas hint for first-time orbit
  interaction (e.g. a one-time gesture tutorial overlay), since this is a touch surface competing with
  drag-to-reorder gestures (see 4.3).

### 4.2 Cabinet selection & editor sheet/panel

When a cabinet is tapped/clicked, the editor shows only the options that specific cabinet's definition
actually supports — **never show a control the selected cabinet doesn't support** (e.g. no handle
picker on a push-to-open top cabinet, no width control on a fixed-size host). Sections, each rendered
only if applicable:

1. **Replace** — a swappable grid/list of compatible cabinet alternatives (same placement
   layer/family/replacement group). Show each candidate with a thumbnail, name, and if it changes
   price, the delta. Replacing must visually preserve position/wall attachment — the sheet should make
   clear this is a like-for-like swap, not a re-placement.
2. **Finish** — material + colour picker. Present as swatches (material texture chips), not a
   dropdown; selecting one live-updates the 3D cabinet. Only declared valid material+colour pairs are
   selectable — invalid combinations must not even be tappable/shown as available.
3. **Handle / hardware** — handle style and mechanism picker, swatch/icon grid. Omit entirely for
   definitions with no handle option (e.g. push-to-open top band).
4. **Width** — for cabinets with adjustable width: either a **discrete chip/segmented control** (for
   `discrete` width rules — e.g. "600 / 800 / 1000 mm" as tappable pills) or a **stepped slider with
   visible tick marks** at each valid increment (for `stepped_range` rules). Never a free-drag
   continuous slider implying arbitrary width — width must always snap visibly to a valid value. Show
   the live dimension read-out in tabular numerals as the user adjusts.
5. **Reorder** — drag-along-the-wall affordance for same-layer reordering, **plus explicit
   move-left/move-right (or move-before/move-after) buttons** as a non-drag fallback for touch,
   keyboard, and assistive-technology users — this is a hard requirement, not a nice-to-have (drag
   must never be the only way to reorder).

Every edit is validated before it's shown as applied. Design an explicit **rejected-edit state**: a
brief inline message near the control (not just a generic toast) explaining why (e.g. "would overlap
the next cabinet," "too wide for this space") and the 3D model/price snapshotting back to the last
valid state — never leave the UI showing an edit that didn't actually take effect.

### 4.3 Reorder / drag interaction

- One-finger drag on an **already-selected** cabinet moves it along its wall/layer; dragging on empty
  canvas space orbits the camera. Make the selection-before-drag requirement visually obvious (e.g. a
  drag handle/glow appears only once selected) so orbit and reorder gestures don't collide.
- While dragging, show a live preview (ghost position) snapping to valid slots; dropping on an invalid
  slot animates back to the last valid position — design this bounce-back as a visible, reassuring
  motion cue, not a silent failure.
- Full-height column cabinets may only move to a room/run margin or adjacent to another column — the
  drag preview should visually constrain to only those valid destinations (e.g. dim/lock invalid drop
  zones) rather than allow a free drag that always fails.

### 4.4 Live price

- Persistent total, updating immediately on every accepted edit — never a stale number and never a
  spinner-on-every-keystroke; the recompute should read as instant.
- Provide a lightweight "why this price" affordance (e.g. tap the price bar to expand an itemized
  breakdown by cabinet/material/handle) so the total is explainable, not opaque — this doubles as an
  early preview of the Review screen's summary.

**States to design**: nothing selected (default 3D view), cabinet selected (sheet/panel open),
mid-drag, rejected edit, price-breakdown expanded, WebGL-unsupported fallback.

---

## 5. Screen 3 — Review (`/configurator/review`)

**Goal**: a dedicated, non-editing-primary step that shows the finished design plainly before contact
details are collected. Do not fold this into the editor — it's an explicit checkpoint.

- Top: the final 3D configuration, viewable/orbitable but read-only for editing (no cabinet-editor
  sheet triggered from here — tapping a cabinet, if supported at all, should route back to Configure).
- Below: a **readable summary grouped by wall, then by vertical layer** (base / middle / top /
  column), listing per placement: cabinet name, dimensions, material/colour, handle/hardware, and its
  price line. This must mirror the exact canonical order the domain returns (wall → band → order) —
  don't invent a different grouping/sort for presentation.
- A clear **total estimated price**, with the same itemized-breakdown affordance as Screen 2 (same
  underlying data, so the two must never disagree).
- Two exits: **"Edit design"** (returns to Screen 2 without losing state) and **"Continue to
  contact"** (primary CTA). Make "Edit design" visually secondary but easy to find — this screen must
  not feel like a one-way gate.

**States to design**: default populated summary, itemized-breakdown expanded, long list scroll
behavior on mobile (many walls/bands), loading (recomputing review/price on entry).

---

## 6. Screen 4 — Contact (`/configurator/contact`)

**Goal**: collect the customer's name and contact channel(s) so Lemnaria can follow up, without losing
the reviewed design.

- Form fields: **name** (required), **phone** (required), **email** (optional) — per current product
  decisions. Design the field order and required/optional markers accordingly; leave room for a
  possible additional-channel field if that's later approved, but don't invent one now.
- Consent/legal copy area: a checkbox or statement about how contact info will be used — exact legal
  wording is a pending product/legal input, so design a generic, clearly-labelled consent block rather
  than final copy.
- A compact, collapsed reminder of the reviewed design (e.g. "Your kitchen — 12 cabinets — ~X MDL
  estimated") so contact feels connected to the design just reviewed, not a disconnected lead form.
  This should not re-show the full itemized breakdown — that's Review's job.
- Inline validation per field (format, required) — mobile keyboard type should match field (tel for
  phone, email keyboard for email).
- Primary CTA: **"Submit"**, disabled until required fields are valid. Design a submitting/pending
  state (the server re-validates pricing before accepting) distinct from the final success state.
- Design a **submission-failure state**: network/server error, or (edge case) a stale/invalid design —
  message should let the user retry without re-entering already-typed contact info or losing the
  design.

**States to design**: empty form, validation errors, submitting/pending, failure/retry, (success is
its own screen — see below).

---

## 7. Screen 5 — Success (`/configurator/success`)

**Goal**: a clear, non-editing confirmation state. This is **not** part of the numbered stepper.

- Confirmation message/iconography (warm, on-brand — not a generic checkmark-in-a-circle default if
  avoidable; consider a subtle Fraunces display moment here).
- Brief recap of what happens next (follow-up expectation) — copy is a content input, leave a labelled
  slot rather than inventing operational promises (e.g. exact response time) not yet approved.
- No further editing affordance back into the same design from here (submission is final for this
  design instance); offer a clear path to start a new configuration if relevant, but do not offer
  "edit this submission."

**States to design**: default success only — this screen has no error state of its own (failures are
handled on Screen 4).

---

## 8. Cross-cutting UI requirements (apply to every screen above)

- **Mobile-first, not mobile-reduced**: every control usable with one thumb; no feature exists only on
  desktop. Touch targets ≥44px.
- **Explainable state everywhere**: any rejected action, incompatible preset, or invalid input must
  show a human reason, never a bare error code or silent no-op.
- **Reversibility**: automatic adjustments (e.g. preset adaptation choosing a filler) should be
  visually flagged as something that happened, with an undo affordance, not silently applied.
- **No world-coordinate/free placement affordances**: don't design any interaction that implies free
  drag-anywhere placement — dragging always resolves to a valid slot on the same wall/layer; the UI
  should never suggest otherwise (e.g. no free-form drag ghost that ignores walls).
- **Estimate framing**: every price display, from the compact bar to the itemized breakdown to the
  contact recap, carries the "estimate" qualifier consistently.
- **Bilingual layout tolerance**: Romanian/Russian copy length varies — design text containers with
  enough slack that a longer translation doesn't truncate or break a button.
- **Accessibility**: every 3D-dependent action (select, replace, resize, reorder, reprice) has a
  non-3D, keyboard/assistive-technology-operable equivalent, per Screen 2 §4.2's explicit
  move-before/move-after requirement.

---

## 9. Explicitly out of scope for this design pass

Do not design screens/flows for:

- CRM/sales-pipeline integration or any post-submission lead-management UI.
- Furniture categories other than kitchens.
- Offline/path-traced rendering or any non-real-time 3D presentation.
- Free/unconstrained cabinet placement ignoring walls, layers, or manufacturing compatibility.
- Final commercial pricing display (no formal "quote" UI — everything is "estimate").
- Door/window obstacle authoring UI (obstacles exist in the domain model but there is no confirmed
  screen for the customer to add them in this release — do not invent one).

---

## 10. Open product inputs this design should not silently resolve

Per `docs/PRODUCT_REQUIREMENTS.md` §"Remaining product data decisions," the following are **not yet
approved** — design generically around them rather than hard-coding a guessed value into visible copy:

1. Exact minimum/maximum wall lengths and room heights.
2. The approved discrete width set per cabinet definition and allowed filler widths.
3. Sample price amounts and whether delivery, worktop, and appliances appear in the estimate.
4. The concrete temporary contact-persistence provider, retention period, and privacy copy.
5. Final brand palette/typography (this brief's colors are fallback tokens only).
