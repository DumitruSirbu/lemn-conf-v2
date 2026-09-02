# ADR 0061 — A cabinet handle is declared per entry; an appliance's bar is neither restyled nor billed

Status: Accepted
Date: 2026-09-02
Type: Decision
Milestone: M6 — wave 6L, consumed by waves 6B and 6D; closes `docs/BACKLOG.md` entry 18

## Context

`setHandlesVisible` and `applyBlackHandleMaterial`
(`packages/three-adapter/src/decomposed-bodies.ts`) act on **every** `handle` group in a body.
`tall-oven-tower` builds four `handle_bar` meshes of which exactly two are the cabinet's — the other
two belong to the oven and to the microwave. So `handle: "push"` hides the appliances' bars alongside
the cabinet's and `handle: "black"` repaints them in cabinet hardware. `base-hob-oven` carries the
same exposure with one bar, the oven's, and is held off it only by `canFinish`/`canHandle` flags.

`docs/BACKLOG.md` entry 18 records the fix: teach the *apply* path the cabinet-versus-appliance rule
`opensAFront()` already encodes in the capability gate — a `handle` group is the cabinet's exactly
when its own parent also holds a front — and records the cost, that the file is one every body in the
scene passes through.

The owner confirmed the wave for M6 on 2026-09-02 and added a second half that reaches pricing: the
appliances have their own handles, those are wanted in 3D, and the price must *"take into account the
handler that are on top of facades not on electric devices"*.

## Decision

**1. Rendering: only a handle group whose parent also holds a front responds to a handle choice.**
Appliance bars stay visible and keep their own material at every setting of `handle`. `opensAFront()`
is one rule with two callers — the capability gate that decides whether a body *has* a handle choice,
and the apply path that carries it out — asserted to be the same rule rather than two that agree.

**2. Pricing: the handle line's quantity is a count of _cabinet_ handles, never of handle meshes.**
On `tall-oven-tower` a naive count bills four where the customer is buying two; the oven's and the
microwave's arrived with the appliances.

**3. The count is declared on the catalogue entry, and a three-adapter parity gate holds the
declaration to the built meshes.** This is forced by §12 and is not a stylistic choice: pricing is a
pure domain query, the domain has no meshes to look at, and `opensAFront()` inspects geometry. So the
domain cannot count handles — it can only read a number the catalogue states.

The pattern is the project's own, three times over:
[ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md) declares
`catalogEquivalentId` rather than inferring identity from measurements;
[ADR 0040](0040-a-recorded-seat-is-converted-back-not-read-as-a-depth.md)'s amendment declares
`occupiedDepth` per entry and **throws** for an undeclared kind; and `cabinet-depth-source.test.ts`
holds a declared product rule to the geometry the adapter builds. The gate is what keeps the
declaration honest — [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md)'s remedy for two
numbers agreeing by luck, applied to the pair this creates.

**4. An entry that declares no count fails loudly**, rather than defaulting to its mesh count or to
zero. A silent default is what let four families carry a wrong `occupiedDepth` with every suite green
(DOM-002).

## Alternatives considered

- **Count meshes in the adapter and hand the number to pricing.** Rejected: it puts a pricing input
  behind the renderer, so a headless price query would depend on a scene having been built, and §12
  keeps product rules in the domain and geometry in the builders.
- **Infer the count from `kind`.** Rejected for ADR 0022's recorded reason — inference produced a
  fridge housing labelled and priced as a pantry — and because `kind` is demonstrably not enough
  here: `base-hob-oven` and `base-3drawer` are both `base_cabinet` and carry different bar
  populations.
- **Price handles as a flat per-body line.** Rejected: it makes the breakdown's per-placement handle
  line untraceable to anything the customer can see, and §12 requires every line to trace to a
  placement or a named whole-kitchen rule.

## Consequences

- Wave **6L** ships the rule, the declaration and the parity gate, and must therefore land **before
  wave 6B**, which reads the declared count, and before **6G**. It has no other gate.
- Wave **6B**'s handle line takes its quantity from the declaration; wave **6D** renders it.
  `tall-oven-tower` is the named case in both the rendering and the counting assertions.
- **`docs/BACKLOG.md` entry 18 closes.** Its diagnosis and its proposed fix were both right; what it
  did not carry is the pricing half, which is the owner's addition here.
- `base-hob-oven` is asserted directly rather than through its capability flag, so the exposure
  cannot return if that flag ever changes.
- No geometry moves. The M1 fidelity gate is unaffected; only which meshes a choice reaches, and
  which of them are counted.
