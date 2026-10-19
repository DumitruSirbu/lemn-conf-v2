# ADR 0004 — Delete `pricing-engine.ts` in M2 Wave 2A instead of retaining it

Status: Accepted
Date: 2026-08-25
Type: Decision
Milestone: M2 Wave 2A

## Context

M2's "Boundaries" section calls for deleting the retired M0 domain modules
(`placement-layout.ts`, `configuration-commands.ts`, and the run-anchor/junction/wall-C parts of
`schemas.ts` and `room-transforms.ts`) in Wave 2A, while explicitly retaining "the pricing engine,
the versioning/persistence schema conventions and the wall A/B transforms."

The Wave 2A architect pass (reading `pricing-engine.ts` against the actual retired-module
boundary) found that `priceConfiguration()` is not separable from the retired model as written:

- It parses input through `createKitchenConfigurationSchema` / `KitchenConfigurationSchema`, which
  pulls in the full retired schema surface — `RunAnchorSchema`, `junctionGroupId`,
  `LayoutPolicyExactnessSchema`, grid-unit conversions, the `CabinetDefinitionSchema` chain
  (`CabinetOptionSupportSchema`, `PlacementRulesSchema`, `ObstacleClearanceProfileSchema`,
  `SupportedWidthRuleSchema`, `CabinetOptionsSchema`).
- It calls `derivePlacementLayout()` from `placement-layout.ts` directly
  (`pricing-engine.ts:213`) with `ExplicitCornerReservation[]` from that same file.

Keeping `pricing-engine.ts` compiling therefore means keeping most of what M2 marks for deletion —
two placement theories living side by side, which is the exact failure mode the Boundaries section
warns against ("a later contributor picks the wrong one").

The narrower "retained" claims hold: `room-transforms.ts`'s wall-A/B transform math is separable
from the retired parts (wall-C, `LayoutPolicyExactness`, grid units) and survives narrowed.
`ConfigurationTimestampSchema` is the one generic persistence convention in `schemas.ts` worth
carrying into `Design.createdAt`/`updatedAt` for Wave 2B. `ContactDataSchema` /
`ContactSubmissionSchema` are independent of the retired model either way.

## Decision

Delete `pricing-engine.ts` and its test in Wave 2A, alongside `placement-layout.ts` and
`configuration-commands.ts`. This is a deliberate deviation from the milestone's literal "pricing
engine is retained" line.

Rebuild pricing in M3, against the mm-based `Design`/placement `frame` model that M2 introduces,
once M3 adds mutations. There is nothing to price in M2: no mutation exists in this phase (M2
Boundaries), so a pricing engine that only compiles against a schema M2 is deleting has no live
caller either way.

## Alternatives considered

- **Keep `pricing-engine.ts` and the schema surface it depends on.** Rejected: reintroduces the
  exact "two working placement theories" problem the Boundaries section names as the reason to
  delete the retired modules in this wave, not later.
- **Port `pricing-engine.ts` to the new `Design`/frame model within Wave 2A.** Rejected as
  out-of-scope for Wave 2A (engine + picking only, no mutation semantics yet to price) and premature
  — pricing rules may need to change shape once M3's mutation commands exist to drive them.

## Addendum — `ContactSubmissionSchema` carries the same problem

The Wave 2A implementer found that `ContactSubmissionSchema` / `createContactSubmissionSchema`
(originally on the "keep" list as independent of the retired model) are not actually independent:
`ContactSubmissionSchema.configurationSnapshot` is typed as `KitchenConfigurationSchema` (deleted),
`.pricing` as `PricingResultSchema` (existed only to serve the now-deleted `pricing-engine.ts`), and
`createContactSubmissionSchema` takes `ConfigurationValidationContext` (deleted) and calls
`createKitchenConfigurationSchema` (deleted) internally. Grep confirmed no consumer of
`ContactDataSchema`, `ContactSubmissionSchema`, or `createContactSubmissionSchema` anywhere outside
`schemas.ts`/`schemas.test.ts`.

Same reasoning as the pricing-engine decision applies, and the same conclusion: delete
`ContactSubmissionSchema` and `createContactSubmissionSchema` in Wave 2A too. Keep `ContactDataSchema`
(genuinely independent — just field definitions, no reference to the retired schemas) and
`ConfigurationTimestampSchema`. Do not keep `PricingResultSchema`,
`createKitchenConfigurationSchema`, or `ConfigurationValidationContext` alive solely to satisfy one
unused type.

M2 itself has no contact table and explicitly excludes contact data from persistence in this phase.
M8 (`docs/milestones/M8-review-contact-success.md`) owns the contact table and must define what a
contact submission's configuration snapshot looks like against the `Design` shape — that is new
design work, not a resurrection of the deleted schema, and is out of scope here. Flag this in M8's
doc as a dependency.

## Follow-up

M6 (`docs/milestones/done/M6-price-and-global-settings.md`) already names work item 1 as "adapt the
existing pure pricing query to the new `Design` shape." After this deletion there is no existing
query left to adapt — M6 work item 1 becomes a rebuild from §5.5/§9's pricing rules against the
`Design`/frame model, not an adaptation of `pricing-engine.ts`. Flagged in that milestone doc.
