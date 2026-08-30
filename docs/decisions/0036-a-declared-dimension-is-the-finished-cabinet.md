# ADR 0036 — A declared dimension is the finished cabinet, and the depth setting is the cabinet's

Status: Accepted
Date: 2026-08-28
Type: Decision + Finding
Milestone: M5 — amends 0028, gates 5F, reshapes M6's control

## Context

ADR 0028 derived wall and top carcass depth from **one declared worktop depth**, keyed
`600 -> 330` and `700 -> 400` on a `WORKTOP_DEPTH_MM = 600`. It shipped as wave 5A and fixed the
handset report it was written for.

Two questions were left open against it and are answered here.

The first was recorded as *Not established* question 6: **what does 330 measure — the carcass, or
the carcass plus its door?** §2's own verified example has a unit declared `D = 0.33` spanning world
x `0 → 0.369`, so the built front face sits 39 mm proud of the declared number. `resolveDepthM`
hands the map's value to `wallCabinet` as the **carcass** depth, so a cabinet declared 330 finishes
at 369.

The second was question 7: **is the shipped worktop 600 or 620?** — `counter` is 0.62 deep against a
`CARC_D` of 0.56, while the owner's map is keyed on 600. It was recorded as gating wave 5F, because
a formula cannot be written until the constant it derives from is named.

## Decision

**1. Every declared dimension is the finished cabinet, doors included.** Width, depth and height
alike. Owner: *"the sizes include everything, including doors. We don't split… and the limitations
that we set, it's the limitation including the doors."*

So the map's `600 -> 330` means a wall cabinet that measures 330 mm from the wall to the front of
its door, and the carcass must be built at 330 less the front assembly so the finished face lands on
330. The current code builds the carcass at 330 and finishes at 369.

Corroboration worth recording, because it makes the rule self-consistent rather than merely
declared: the **base** cabinets already obey it. `CARC_D` 0.56 plus the same ~39 mm front gives
~599 — a 600 mm all-inclusive cabinet. Wall depth is the outlier.

**2. Whether the 3D merges the door into the box is an implementation question, decided on cost.**
Owner: do it *"only if we will simplify the code"* — if combining door and carcass into one box
makes `kitchen-parts` easier to maintain and renders faster, take it; if it is too much work, leave
the door as separate geometry. **Either way the arithmetic obeys decision 1.** Wave 5F assesses and
reports before committing to a direction; the finished cabinet is identical under both.

**3. The general setting is CABINET depth, not worktop depth.** Owner: *"it's not exactly the
worktop, it's more like the depth of the cabinets under the worktop… we set all the calculations
based on the sizes of the cabinets."* Two values, **600 and 700**. Wall and top depth derive from
it through ADR 0028's map, unchanged in mechanism.

The worktop is an **external part**, usually bought separately by the customer because it may be
stone, wood or laminate. It may be 620 — in the owner's own kitchen it sits flush with the cabinet
depth — and it must influence **neither geometry nor price**. Explicitly rejected: *"it shouldn't be
like if the worktop is 600, the cabinet should be 20 mm less."* There is no offset anywhere.

This dissolves question 7 rather than answering it. 620 is the worktop's own dimension and was never
the key; 5F is unblocked, and it derives from a cabinet depth of 600.

**4. Height does not follow width, and does not follow depth.** Owner: *"the height will not be
changed by any width changes."* Recorded as covering the depth setting too — a 700 mm deep kitchen
has the same level lines as a 600 mm one. This closes *Not established* question 3, which mattered
because §2's `LEVELS` are the spine of the void engine and a height that tracked the setting would
have made M6's control a far larger change than a second map row.

**5. Changing the setting adapts every existing cabinet automatically.** Owner, on a kitchen already
laid out at 600 when the setting moves to 700: *"we need to adapt all the depths of the cabinets —
the base, the middle, and the top ones. We need to compensate this 100 millimetres. So automatically,
we will make them deeper."*

So of the three shapes recorded against *Not established* question 4 — migrate, re-derive on load,
or refuse — the answer is that depth **follows the setting for every body, with no confirmation
step and nothing left behind**. This closes the question that was recorded as blocking M6's control.
Which mechanism delivers it (a one-time rewrite of stored placements, or depth derived on every
load) stays M6's implementation choice, and ADR 0018's *"the body's own measured seat"* is the
tension it has to resolve.

## Consequences

- **ADR 0028's naming is amended throughout.** `WORKTOP_DEPTH_MM` names the wrong quantity; the map
  is keyed on cabinet depth. The mechanism 5A shipped — a declaration, not a computation; an unknown
  depth throws; no interpolation — is correct and stays.
- **Wave 5F carries a visible geometry change**, and it is the first one M5 has produced. Correcting
  wall cabinets to finish at their declared depth moves their front faces by ~39 mm, which **M1's
  1e-6 m parity gate is built to prevent**. The gate must be deliberately re-baselined with the
  change recorded, not relaxed. 5F verifies what the 39 mm is composed of first — the door is 18 mm
  and the gap 4, which is 22, so something else contributes the remainder and it must be identified
  before it is subtracted.
- **M6's control is renamed and its price rule constrained.** The setting reads as cabinet depth,
  600 / 700; the worktop appears in no price line. Recorded alongside ADR 0035 decision 8, which
  constrains the same price engine on the width axis.
- **Two depth questions remain open and neither blocks a wave.** Whether the **hood** follows the
  depth map (it is pinned at 500, and a hood round trip still costs its opening 100 mm because
  `make.hood` takes no depth parameter — backlog 9), and whether the two deliberately-deep top
  bodies track the setting, their column, or nothing. The owner's answer on 2026-08-28 addressed the
  hood's **width** (600–800, ADR 0035 decision 5); its depth is still unanswered.
