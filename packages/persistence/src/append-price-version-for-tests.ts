import { nanoid } from "nanoid";

import {
  isJsonObject,
  isMintedId,
  sequenceNumberOf,
  stampedWithVersion,
} from "./dashboard-store-shapes.js";
import { requireTestRunner } from "./require-test-runner.js";
import { openTestDatabase } from "./test-database-url.js";

export interface AppendedPriceVersion {
  readonly versionId: string;
  readonly sequenceNumber: number;
}

const TEST_VERSION_LABEL = "Test version";

/**
 * Appends one published version to the **test database** and answers it, so a live suite or an e2e run that needs an
 * active book seeds its own: versions are append-only, so a test must not assume the book an earlier run left. It always
 * appends, at the next sequence number, where the owner-run seed refuses once any version exists. The connection is never
 * accepted and the publisher is a shape-checked account id, so nothing here reaches another database or row. The book is
 * stored with its `version` set to the new version's id.
 *
 * One statement, never repeated: two callers racing for one number meet its uniqueness and one fails, so seed serially.
 */
export async function appendPriceVersionForTests(
  book: unknown,
  publishedByAccountId: string,
): Promise<AppendedPriceVersion> {
  requireTestRunner({
    functionName: "appendPriceVersionForTests",
    effect: "appends a published price book version",
  });
  if (!isJsonObject(book) || !isMintedId(publishedByAccountId)) {
    throw new Error(
      "appendPriceVersionForTests needs a book that is an object and a publisher account id of 21 characters.",
    );
  }
  const versionId = nanoid();
  const sql = openTestDatabase();
  const rows = (await sql`
    insert into price_book_versions (id, sequence_number, label, note, book, change_summary, published_by_account_id)
    select ${versionId}::text, coalesce(max(sequence_number), 0) + 1, ${TEST_VERSION_LABEL}::text, ''::text,
      ${JSON.stringify(stampedWithVersion(versionId, book))}::jsonb, '[]'::jsonb, ${publishedByAccountId}::text
    from price_book_versions
    returning id, sequence_number::text as sequence_number
  `) as { id?: unknown; sequence_number?: unknown }[];
  const [row] = rows;
  const sequenceNumber = sequenceNumberOf(row?.sequence_number);
  if (row?.id !== versionId || sequenceNumber === undefined) {
    throw new Error("appendPriceVersionForTests did not append one version.");
  }
  return { versionId, sequenceNumber };
}
