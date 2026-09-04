// `DEVELOPMENT-SPEC.md` §5.5: `setFinish` records the door colour, `setHandle` records the handle
// mode. Both are **per placement**, never global — material and hardware brand are whole-kitchen
// settings that live outside the cabinet editor.
//
// Neither is a silent no-op: setting a finish on a body with no doors, or a handle on a body with
// no handle meshes, is a refusal with its own code. A no-op looks identical to a broken control.
import { describeKindLabel } from "../catalog.js";
import type { CabinetBody, Design, Handle } from "../design.js";
import type { Finish } from "../materials.js";
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
      params: { label: describeKindLabel(selected.record.kind) },
    });
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

export function setHandle(
  input: SetHandleInput,
): CommandResult<HandleSetEffect> {
  const selected = selectBody(input);
  if (!selected.ok) return refuse(input.design, selected.detail);
  if (!selected.record.canHandle) {
    return refuse(input.design, {
      code: "HANDLE_NOT_SUPPORTED",
      params: { label: describeKindLabel(selected.record.kind) },
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
