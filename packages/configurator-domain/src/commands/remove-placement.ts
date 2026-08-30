// `DEVELOPMENT-SPEC.md` §5.1: delete makes space. Refuse a void or a body the catalogue marks
// structural; otherwise drop the body.
//
// Deletion is final. No undo exists and nothing here retains a prior state "in case": a void may
// have merged with its neighbours since, so there is no single state to restore (§5.1, §13.1).
import { describeKindLabel } from "../catalog.js";
import type { Design } from "../design.js";
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
  type PlacementRemovedEffect,
} from "./command-result.js";

export interface RemovePlacementInput {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly target: CommandTarget;
  readonly occurredAt: string;
}

type RemoveResult = CommandResult<PlacementRemovedEffect>;

/** §5.1's one body-level refusal: `!canDelete`. A void selection is refused in `removePlacement`
 *  itself, before a record exists to ask about. Kept as its own function so the guard and its code
 *  stay one named step (§11 row 16).
 *
 *  ADR 0027 removed the third arm's subject: the hob is part of its cabinet body, so no placement
 *  is a standalone accessory any more, and ADR 0038 confirmed no document exists that carries one.
 *  §11 row 15 — "the hob cannot be deleted separately" — is satisfied by construction rather than
 *  by a guard, because there is no hob placement to point a delete at. */
function refuseRemoval(
  design: Design,
  record: PlacementRecord,
): RemoveResult | undefined {
  if (!record.canDelete) {
    return refuse(design, {
      code: "NOT_DELETABLE",
      params: { label: describeKindLabel(record.kind) },
    });
  }
  return undefined;
}

export function removePlacement(input: RemovePlacementInput): RemoveResult {
  const { design, target } = input;
  if (target.kind === "void") {
    return refuse(design, { code: "VOID_SELECTED", params: {} });
  }
  if (!isValidOccurredAt(input.occurredAt)) {
    return refuse(design, { code: "INVALID_OCCURRED_AT", params: {} });
  }

  const records = derivePlacementRecords(design, input.catalog);
  const record = records.find((candidate) => candidate.id === target.id);
  if (!record) {
    return refuse(design, { code: "TARGET_NOT_FOUND", params: {} });
  }
  const refusal = refuseRemoval(design, record);
  if (refusal) return refusal;

  return applyRemoval(input, record);
}

function applyRemoval(
  input: RemovePlacementInput,
  record: PlacementRecord,
): RemoveResult {
  const placements = input.design.placements.filter(
    (placement) => placement.id !== record.id,
  );
  return succeedWith(
    withPlacements(input.design, placements, input.occurredAt),
    {
      type: "placement_removed",
      placementId: record.id,
      vacated: { col: record.col, y0: record.frame.y0 },
    },
  );
}
