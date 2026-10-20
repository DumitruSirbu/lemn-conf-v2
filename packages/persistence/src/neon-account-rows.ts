import { AccountStoreError } from "./account-store.js";
import type { AccountStoreOperation } from "./account-store.js";
import { reducedCauseOf } from "./migration-errors.js";

/** The rows of a statement, or the store error. A failure leaves as a store error holding a built cause (ADR 0146 B3),
 *  and the driver's own error is thrown by nothing here. */
export async function queryRows(
  operation: AccountStoreOperation,
  runQuery: () => PromiseLike<unknown>,
): Promise<readonly Record<string, unknown>[]> {
  let reply: unknown;
  try {
    reply = await runQuery();
  } catch (failure) {
    throw new AccountStoreError(operation, reducedCauseOf(failure));
  }
  return plainRowsOf(reply, operation);
}

/** Each row is copied in one guarded step, so a row that throws when read is the store error with no cause. */
function plainRowsOf(
  reply: unknown,
  operation: AccountStoreOperation,
): readonly Record<string, unknown>[] {
  try {
    if (!Array.isArray(reply) || !reply.every(isRecord)) {
      throw new AccountStoreError(operation);
    }
    return Array.from(reply, (row) => ({ ...row }));
  } catch {
    throw new AccountStoreError(operation);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The one boolean a token statement answers. Anything else is not that statement's reply. */
export function isDone(
  rows: readonly Record<string, unknown>[],
  operation: AccountStoreOperation,
): boolean {
  const [row, ...others] = rows;
  if (
    row === undefined ||
    others.length > 0 ||
    typeof row["is_done"] !== "boolean"
  ) {
    throw new AccountStoreError(operation);
  }
  return row["is_done"];
}
