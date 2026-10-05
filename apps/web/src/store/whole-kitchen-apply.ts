// One press of *Aplică* is one commit, or it is nothing: a side-effect-free preflight, then one commit. Every
// requested change runs against the previous command's design rather than the store, so a refusal partway
// leaves the store untouched. Three independent store actions left a design half changed, the sheet shut and
// `lastRejection` describing only the half that failed, while `global-settings.tsx` states that a partial apply
// is not a state this product has. A refusal is reachable: `setCabinetDepth` refuses `BODY_PROBE_UNAVAILABLE`
// with no probe attached, and the sheet offers every declared depth.
import {
  setCabinetDepth as setCabinetDepthOnDesign,
  setGlobalFinish as setGlobalFinishOnDesign,
  setHardwareTier as setHardwareTierOnDesign,
  setMaterialTier as setMaterialTierOnDesign,
  cabinetDepthMmOf,
  refuse,
  sameFinish,
  type BodyCatalog,
  type BodyProbeFactory,
  type CommandResult,
  type CommandSuccess,
  type Design,
  type Finish,
  type RejectionReason,
  type WholeKitchenTierInput,
} from "@lemnaria/configurator-domain";

/** Which of the whole-kitchen settings a refusal was about, published so the sheet can name which control to
 *  put back. */
export type WholeKitchenSetting =
  | "material"
  | "finish"
  | "hardware"
  | "cabinetDepth";

/**
 * What one press asks for: the settings a customer chose and the ids the caller's price book offers. An absent
 * field means "leave this setting alone", never "reset it to the default" (`global-settings.tsx`: apply writes
 * only what changed). A field naming what the design already carries is dropped too, so an untouched sheet
 * runs no command.
 */
export interface WholeKitchenSettingsRequest {
  readonly materialTierId?: string | undefined;
  /** ADR 0099's whole-kitchen colour. Absent means "leave it alone", which stops an untouched sheet stamping a
   *  global colour into a document that deliberately carries none (`resolveOpeningChoice`). */
  readonly finish?: Finish | undefined;
  readonly hardwareTierId?: string | undefined;
  readonly cabinetDepthMm?: number | undefined;
  /** `setMaterialTier` refuses an id its caller did not offer, so the offered list travels with the choice:
   *  one answer to "what is on offer" (ADR 0062 seam 1, `OfferedTierGroup.tierIds`). */
  readonly availableMaterialTierIds: readonly string[];
  readonly availableHardwareTierIds: readonly string[];
}

/** What the preflight needs from the store to run the chain without touching it. */
export interface WholeKitchenPreflightContext {
  readonly design: Design;
  /** A factory, never a built catalogue (see `SetCabinetDepthInput`): a caller that could pair one depth with
   *  another's map is a call site that is wrong rather than impossible. */
  readonly catalogAt: (cabinetDepthMm: number) => BodyCatalog;
  /** `undefined` until the scene attaches one, which is the state `BODY_PROBE_UNAVAILABLE` is the
   *  answer to. */
  readonly probeAt: BodyProbeFactory | undefined;
  readonly occurredAt: string;
}

/**
 * The preflight's three answers. `"unchanged"` is its own case rather than a success carrying the design back:
 * the store must not schedule a save, and a caller should read an answer rather than compare designs to learn
 * whether anything happened.
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
 * Every requested change run in order, stopping at the first refusal. Nothing here writes: the domain's commands are
 * pure, so the whole press is evaluated before any of it is held, making the commit atomic without a rollback.
 * The order (material, colour, hardware, depth) is load-bearing: a depth change rebuilds every body so it must see
 * the same press's material; the store applies the last result, whose effect `applyCommandResult` reads the column
 * map from; and colour runs after material because a material change re-resolves `settings.finish` to the new
 * default (ADR 0099 decision 6), which would discard a colour picked in the same press.
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

/** The changes this press asks for: an unnamed setting and one already stored are both dropped, so *apply
 *  writes only what changed* is decided in one place. */
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
  if (isFinishChange(request.finish, applied.finish))
    planned.push(finishChange(request.finish, context.occurredAt));
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

/** `sameFinish`, not `===`: a finish is a value the document carries, so two structurally equal colours are
 *  one colour (ADR 0081). Re-applying the stored colour runs no command. */
function isFinishChange(
  requested: Finish | undefined,
  applied: Finish | undefined,
): requested is Finish {
  if (requested === undefined) return false;
  return applied === undefined || !sameFinish(requested, applied);
}

/** Read through `cabinetDepthMmOf`, so a document naming no depth is compared against the declared default it
 *  is built at. A depth change rebuilds every body and redraws the scene (ADR 0074), so applying an unchanged
 *  one would be the most expensive no-op in the product. */
function isDepthChange(
  requested: number | undefined,
  design: Design,
): requested is number {
  return requested !== undefined && requested !== cabinetDepthMmOf(design);
}

/** One tier setting's plan. The two tier commands take the same input, so they differ only by the function and
 *  the name a refusal is reported under. */
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

/** The whole-kitchen colour's plan. It carries no offered list: the offer is a function of the design's own
 *  material (ADR 0099 decision 4), which `setGlobalFinish` reads off the design it rewrites. */
function finishChange(finish: Finish, occurredAt: string): PlannedChange {
  return {
    setting: "finish",
    run: (design) => setGlobalFinishOnDesign({ design, finish, occurredAt }),
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
        : // The same safety net as the store's own action: every body is rebuilt through the insert path, so
          // without a probe there is nothing to rebuild against.
          refuse(design, { code: "BODY_PROBE_UNAVAILABLE", params: {} }),
  };
}
