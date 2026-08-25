// `DEVELOPMENT-SPEC.md` §5.1: delete makes space. Refuse a void, an accessory, or a body the
// catalogue marks structural; otherwise drop the body **and everything it carried**.
//
// Deletion is final. No undo exists and nothing here retains a prior state "in case": a void may
// have merged with its neighbours since, so there is no single state to restore (§5.1, §13.1).
import { findHostedAccessories } from "../accessories.js";
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

/** §5.1's refusal list, closed: void selected · accessory · `!canDelete`. Each carries its own
 *  code, so the panel never has to guess which of the three happened (§11 rows 15, 16). */
function refuseRemoval(
  design: Design,
  record: PlacementRecord,
): RemoveResult | undefined {
  const label = describeKindLabel(record.kind);
  if (record.accessory) {
    return refuse(design, {
      code: "ACCESSORY_NOT_DELETABLE",
      params: { label },
    });
  }
  if (!record.canDelete) {
    return refuse(design, { code: "NOT_DELETABLE", params: { label } });
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

  return applyRemoval(input, record, records);
}

function applyRemoval(
  input: RemovePlacementInput,
  record: PlacementRecord,
  records: readonly PlacementRecord[],
): RemoveResult {
  const cascadedAccessoryIds = findHostedAccessories(record, records).map(
    (accessory) => accessory.id,
  );
  const removedIds = new Set([record.id, ...cascadedAccessoryIds]);
  const placements = input.design.placements.filter(
    (placement) => !removedIds.has(placement.id),
  );
  return succeedWith(
    withPlacements(input.design, placements, input.occurredAt),
    {
      type: "placement_removed",
      placementId: record.id,
      cascadedAccessoryIds,
      vacated: { col: record.col, y0: record.frame.y0 },
    },
  );
}
