// **One press of *Aplică* is one commit, or it is nothing** (M6-AUD-004).
//
// Wave 6G's sheet ran `setMaterialTier`, `setHardwareTier` and `setCabinetDepth` as three
// independent store actions and closed unconditionally. Each one that succeeded mutated state and
// scheduled a save immediately, so a depth refused after a material committed left the design half
// changed, the sheet shut, and `lastRejection` describing only the half that failed — while
// `global-settings.tsx` stated four lines up that *a partial apply is not a state this product has*.
//
// The refusal is reachable rather than theoretical: `setCabinetDepth` refuses
// `BODY_PROBE_UNAVAILABLE` with no probe attached, and the rebuild behind it has further refusal
// paths, while the sheet offers every declared depth on the strength of the declared map alone.
//
// This module is the audit's second option — **a side-effect-free preflight, then one commit**.
// Every requested change is run against the *previous command's design* rather than against the
// store, so the chain is exactly the one the three actions used to produce and the store sees a
// single result. Checking only for an attached probe would close one race and leave the press
// non-atomic; that is not what this does.
import {
  setCabinetDepth as setCabinetDepthOnDesign,
  setHardwareTier as setHardwareTierOnDesign,
  setMaterialTier as setMaterialTierOnDesign,
  cabinetDepthMmOf,
  refuse,
  type BodyCatalog,
  type BodyProbeFactory,
  type CommandResult,
  type CommandSuccess,
  type Design,
  type RejectionReason,
  type WholeKitchenTierInput,
} from "@lemnaria/configurator-domain";

/** Which of the three whole-kitchen settings a refusal was about. Published because the sheet has
 *  to name it: "nothing was applied" with no subject leaves the customer to guess which control to
 *  put back. */
export type WholeKitchenSetting = "material" | "hardware" | "cabinetDepth";

/**
 * What one press asks for: the settings a customer chose, and the ids the caller's price book
 * offers.
 *
 * **An absent field means "leave this setting alone"**, never "reset it to the default" — the
 * invariant `global-settings.tsx` states as *apply writes only what changed*. A field naming what
 * the design already carries is dropped here for the same reason, so an untouched sheet runs no
 * command at all.
 */
export interface WholeKitchenSettingsRequest {
  readonly materialTierId?: string | undefined;
  readonly hardwareTierId?: string | undefined;
  readonly cabinetDepthMm?: number | undefined;
  /** `setMaterialTier` refuses an id its caller did not offer, so the offered list travels with the
   *  choice rather than being re-derived here — one answer to "what is on offer" (ADR 0062 seam 1,
   *  and `OfferedTierGroup.tierIds`). */
  readonly availableMaterialTierIds: readonly string[];
  readonly availableHardwareTierIds: readonly string[];
}

/** What the preflight needs from the store to run the chain without touching it. */
export interface WholeKitchenPreflightContext {
  readonly design: Design;
  /** A factory, never a built catalogue — `SetCabinetDepthInput` records why: a caller that could
   *  pair one depth with another's map is a call site that is wrong rather than impossible. */
  readonly catalogAt: (cabinetDepthMm: number) => BodyCatalog;
  /** `undefined` until the scene attaches one, which is the state `BODY_PROBE_UNAVAILABLE` is the
   *  answer to. */
  readonly probeAt: BodyProbeFactory | undefined;
  readonly occurredAt: string;
}

/**
 * The preflight's three answers.
 *
 * `"unchanged"` is a case of its own rather than a success carrying the design back untouched: the
 * store must not schedule a save, and a caller that had to compare designs to notice would be
 * deciding *whether anything happened* by inspecting a value rather than by reading an answer.
 */
export type WholeKitchenPreflight =
  | { readonly outcome: "unchanged" }
  | { readonly outcome: "ready"; readonly result: CommandSuccess }
  | {
      readonly outcome: "refused";
      readonly setting: WholeKitchenSetting;
      readonly reason: RejectionReason;
    };

/** One requested change, as the chain runs it: which setting it is about, and the command that
 *  carries it out over whatever design the previous link produced. */
interface PlannedChange {
  readonly setting: WholeKitchenSetting;
  readonly run: (design: Design) => CommandResult;
}

/**
 * Every requested change run in order, stopping at the first refusal.
 *
 * **Nothing here writes.** The domain's commands are pure — a design in, a design or a refusal out —
 * so the whole press can be evaluated before any of it is held, which is what makes the commit
 * atomic without a rollback to get wrong.
 *
 * **The order is material, then hardware, then depth**, which is the order the three separate
 * actions ran in. It is load-bearing: a depth change rebuilds every body, so it must see the
 * material the same press chose, and the store applies the *last* result — whose effect is the one
 * `applyCommandResult` reads the column map from.
 */
export function preflightWholeKitchenSettings(
  request: WholeKitchenSettingsRequest,
  context: WholeKitchenPreflightContext,
): WholeKitchenPreflight {
  const planned = planChanges(request, context);
  let design = context.design;
  let last: CommandSuccess | undefined;
  for (const change of planned) {
    const result = change.run(design);
    if (!result.ok)
      return {
        outcome: "refused",
        setting: change.setting,
        reason: result.reason,
      };
    design = result.design;
    last = result;
  }
  return last === undefined
    ? { outcome: "unchanged" }
    : { outcome: "ready", result: last };
}

/** The changes this press actually asks for — an unnamed setting and one already stored are both
 *  dropped, so *apply writes only what changed* is decided in one place rather than at three call
 *  sites. */
function planChanges(
  request: WholeKitchenSettingsRequest,
  context: WholeKitchenPreflightContext,
): readonly PlannedChange[] {
  const applied = context.design.settings ?? {};
  const planned: PlannedChange[] = [];
  if (isTierChange(request.materialTierId, applied.materialTierId))
    planned.push(
      tierChange({
        setting: "material",
        command: setMaterialTierOnDesign,
        tierId: request.materialTierId,
        availableTierIds: request.availableMaterialTierIds,
        occurredAt: context.occurredAt,
      }),
    );
  if (isTierChange(request.hardwareTierId, applied.hardwareTierId))
    planned.push(
      tierChange({
        setting: "hardware",
        command: setHardwareTierOnDesign,
        tierId: request.hardwareTierId,
        availableTierIds: request.availableHardwareTierIds,
        occurredAt: context.occurredAt,
      }),
    );
  if (isDepthChange(request.cabinetDepthMm, context.design))
    planned.push(depthChange(request.cabinetDepthMm, context));
  return planned;
}

function isTierChange(
  requested: string | undefined,
  applied: string | undefined,
): requested is string {
  return requested !== undefined && requested !== applied;
}

/** Read through `cabinetDepthMmOf` rather than off `settings`, so a document that names no depth is
 *  compared against the declared default the design is actually built at — the same resolution
 *  every other reader of this setting gives it. A depth change rebuilds every body and redraws the
 *  scene (ADR 0074), so applying an unchanged one would be the most expensive no-op in the product. */
function isDepthChange(
  requested: number | undefined,
  design: Design,
): requested is number {
  return requested !== undefined && requested !== cabinetDepthMmOf(design);
}

/** One tier setting's plan. The two tier commands take the same input, so they differ only by the
 *  function and by the name a refusal is reported under — which is what this parameterises, rather
 *  than two builders that would be identical but for one identifier. */
interface TierChangePlan {
  readonly setting: "material" | "hardware";
  readonly command: (input: WholeKitchenTierInput) => CommandResult;
  readonly tierId: string;
  readonly availableTierIds: readonly string[];
  readonly occurredAt: string;
}

function tierChange(plan: TierChangePlan): PlannedChange {
  return {
    setting: plan.setting,
    run: (design) =>
      plan.command({
        design,
        tierId: plan.tierId,
        availableTierIds: plan.availableTierIds,
        occurredAt: plan.occurredAt,
      }),
  };
}

function depthChange(
  cabinetDepthMm: number,
  context: WholeKitchenPreflightContext,
): PlannedChange {
  const { probeAt } = context;
  return {
    setting: "cabinetDepth",
    run: (design) =>
      probeAt
        ? setCabinetDepthOnDesign({
            design,
            catalogAt: context.catalogAt,
            cabinetDepthMm,
            probeAt,
            occurredAt: context.occurredAt,
          })
        : // The same safety net the store's own action carries: every body is rebuilt through the
          // insert path, so there is nothing to rebuild against without a probe.
          refuse(design, { code: "BODY_PROBE_UNAVAILABLE", params: {} }),
  };
}
