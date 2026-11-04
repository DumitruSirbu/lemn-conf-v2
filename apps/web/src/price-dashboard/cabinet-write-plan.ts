import {
  applyChanges,
  judgePricesOfRule,
  type AppliedAddress,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import {
  changedStatesOf,
  draftChangeOf,
  ruleIn,
  type FieldState,
} from "./cabinet-detail-fields";
import { priceDashboardCatalogue } from "./price-dashboard-catalogue";

export interface PlannedWrite {
  /** The key of the field the write is owed to. */
  readonly fieldKey: string;
  readonly address: AppliedAddress;
  readonly value: number;
  /** The active version's amount: a write of it takes the draft's change out and adds none. */
  readonly activeMinor: number;
}

/**
 * The writes a Save sends, one per changed field. The draft takes one change per write and the server does not judge a
 * half of two changes, so a write that fails part-way leaves the draft holding the writes before it. Each write is taken
 * from the first remaining one that keeps every price of the rule above zero, so that draft can be published wherever
 * such a write remains.
 */
export function plannedWritesOf(
  candidate: PriceBook,
  ruleId: string,
  states: readonly FieldState[],
): readonly PlannedWrite[] {
  const remaining = changedStatesOf(states).map(writeOf);
  const planned: PlannedWrite[] = [];
  let running = candidate;
  while (remaining.length > 0) {
    const firstSafe = remaining.findIndex((write) =>
      isSafeAfter(running, ruleId, write),
    );
    // Safe in the end does not mean safe at every step: where no remaining write is, they go in the order of the fields.
    const pick = firstSafe === -1 ? 0 : firstSafe;
    const [write] = remaining.splice(pick, 1);
    if (write === undefined) break;
    planned.push(write);
    running = afterWrite(running, write) ?? running;
  }
  return planned;
}

function writeOf({ field, effectiveMinor }: FieldState): PlannedWrite {
  return {
    fieldKey: field.key,
    address: field.address,
    value: effectiveMinor,
    activeMinor: field.activeMinor,
  };
}

function afterWrite(
  book: PriceBook,
  write: PlannedWrite,
): PriceBook | undefined {
  const applied = applyChanges(book, [
    draftChangeOf(write.address, write.value),
  ]);
  return applied.ok ? applied.book : undefined;
}

function isSafeAfter(
  book: PriceBook,
  ruleId: string,
  write: PlannedWrite,
): boolean {
  const next = afterWrite(book, write);
  const rule = next === undefined ? undefined : ruleIn(next, ruleId);
  return (
    rule !== undefined &&
    judgePricesOfRule(rule, priceDashboardCatalogue()) === undefined
  );
}
