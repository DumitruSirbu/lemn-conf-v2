// `DEVELOPMENT-SPEC.md` §5.5: `setFinish` records the door colour, `setHandle` the handle mode. Both
// are per placement; material and hardware brand are whole-kitchen settings outside the cabinet
// editor.
//
// Neither is a silent no-op: a finish on a body with no doors, or a handle on a body with no handle
// meshes, is a refusal with its own code, because a no-op looks identical to a broken control.
//
// `setFinish` refuses on two different questions: whether the body can wear a finish at all, and
// whether the kitchen's material offers the one asked for (ADR 0078 decision 6). The capability
// question is asked first: naming the material at a hood would send the customer to the wrong
// control.
import { materialOfDesign } from "../design-material.js";
import { kindLabel } from "../catalog.js";
import type { CabinetBody, Design, Handle } from "../design.js";
import { materialOffersFinish, type Finish } from "../materials.js";
import {
  derivePlacementRecords,
  type BodyCatalog,
  type PlacementRecord,
} from "../void-engine.js";
import {
  isValidOccurredAt,
  refuse,
  succeedWith,
  withPlacements,
  type CommandResult,
  type CommandTarget,
  type FinishClearedEffect,
  type FinishSetEffect,
  type HandleSetEffect,
} from "./command-result.js";
import type { RejectionDetail } from "./rejection.js";

interface AppearanceInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly target: CommandTarget;
  readonly occurredAt: string;
}

export interface SetFinishInput extends AppearanceInput {
  readonly finish: Finish;
}

export interface SetHandleInput extends AppearanceInput {
  readonly handle: Handle;
}

type Selected =
  | { readonly ok: true; readonly record: PlacementRecord }
  | { readonly ok: false; readonly detail: RejectionDetail };

/** The lookup both commands share: a void carries nothing to recolour, and an id that no longer
 *  resolves is a stale selection rather than a capability problem. */
function selectBody(input: AppearanceInput): Selected {
  if (input.target.kind === "void") {
    return { ok: false, detail: { code: "VOID_SELECTED", params: {} } };
  }
  if (!isValidOccurredAt(input.occurredAt)) {
    return { ok: false, detail: { code: "INVALID_OCCURRED_AT", params: {} } };
  }
  const records = derivePlacementRecords(input.design, input.catalog);
  const record = records.find((candidate) => candidate.id === input.target.id);
  if (!record) {
    return { ok: false, detail: { code: "TARGET_NOT_FOUND", params: {} } };
  }
  return { ok: true, record };
}

function applyToBody(
  input: AppearanceInput,
  placementId: string,
  change: Partial<Pick<CabinetBody, "finish" | "handle">>,
): Design {
  const placements = input.design.placements.map((placement) =>
    placement.id === placementId
      ? { ...placement, body: { ...placement.body, ...change } }
      : placement,
  );
  return withPlacements(input.design, placements, input.occurredAt);
}

export function setFinish(
  input: SetFinishInput,
): CommandResult<FinishSetEffect> {
  const selected = selectBody(input);
  if (!selected.ok) return refuse(input.design, selected.detail);
  if (!selected.record.canFinish) {
    return refuse(input.design, {
      code: "FINISH_NOT_SUPPORTED",
      params: { label: kindLabel(selected.record.kind) },
    });
  }
  if (!designOffersFinish(input.design, input.finish)) {
    return refuse(input.design, { code: "FINISH_NOT_OFFERED", params: {} });
  }
  return succeedWith(
    applyToBody(input, selected.record.id, { finish: input.finish }),
    {
      type: "finish_set",
      placementId: selected.record.id,
      finish: input.finish,
    },
  );
}

/**
 * The way back out of an override (ADR 0099 decision 8): without it the first tap on a swatch pins
 * the cabinet out of the kitchen's colour for ever.
 *
 * It deletes the key and never writes the current global colour into it, which would satisfy one
 * later global change and then leave the cabinet an overriding one again (ADR 0099 decision 5).
 * Clearing a cabinet that has chosen nothing is not a refusal, matching `setFinish` re-applying the
 * colour a body already wears.
 */
export function clearFinish(
  input: AppearanceInput,
): CommandResult<FinishClearedEffect> {
  const selected = selectBody(input);
  if (!selected.ok) return refuse(input.design, selected.detail);
  if (!selected.record.canFinish) {
    return refuse(input.design, {
      code: "FINISH_NOT_SUPPORTED",
      params: { label: kindLabel(selected.record.kind) },
    });
  }
  return succeedWith(withoutAFinish(input, selected.record.id), {
    type: "finish_cleared",
    placementId: selected.record.id,
  });
}

/** `applyToBody`'s opposite, not expressible as one: `finish: undefined` is not an absent `finish`,
 *  since a serialised `undefined` is the key not being there and the two would round-trip differently
 *  through a save. */
function withoutAFinish(input: AppearanceInput, placementId: string): Design {
  const placements = input.design.placements.map((placement) => {
    if (placement.id !== placementId) return placement;
    const body = { ...placement.body };
    delete body.finish;
    return { ...placement, body };
  });
  return withPlacements(input.design, placements, input.occurredAt);
}

/** ADR 0078 decision 6, read off the design rather than passed in, so a caller cannot hand this command
 *  a different material than the document's. An undeclared `materialTierId` offers nothing and refuses
 *  nothing (ADR 0078 decision 3): it is a reachable stored state, and a stale tier must stay
 *  recolourable. */
function designOffersFinish(design: Design, finish: Finish): boolean {
  const lookup = materialOfDesign(design);
  return (
    lookup.kind === "undeclared" ||
    materialOffersFinish(lookup.material, finish)
  );
}

export function setHandle(
  input: SetHandleInput,
): CommandResult<HandleSetEffect> {
  const selected = selectBody(input);
  if (!selected.ok) return refuse(input.design, selected.detail);
  if (!selected.record.canHandle) {
    return refuse(input.design, {
      code: "HANDLE_NOT_SUPPORTED",
      params: { label: kindLabel(selected.record.kind) },
    });
  }
  return succeedWith(
    applyToBody(input, selected.record.id, { handle: input.handle }),
    {
      type: "handle_set",
      placementId: selected.record.id,
      handle: input.handle,
    },
  );
}
