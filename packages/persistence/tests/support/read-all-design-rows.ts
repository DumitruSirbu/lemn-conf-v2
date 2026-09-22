import type {
  DesignBackupRow,
  DesignRowSource,
} from "../../src/design-row-source.js";

/**
 * The walk reads the whole shared `designs` table, so its round trips scale with the table, not with
 * the rows a test minted. At a page size of 2 and ~840 accumulated rows that was ~420 sequential
 * round trips — about 20 s per call, which pushed the tests that also restore and write past their
 * 30 s budget and lengthened every hold of the shared schema lock. Paging itself stays covered by a
 * dedicated small-page walk in `design-row-source.test.ts`.
 */
const WALK_PAGE_SIZE = 100;

/**
 * Drains a `DesignRowSource` into one array.
 *
 * For tests only. The production backup deliberately never does this — holding every row at once is
 * the failure finding DB-002 removed — but a live assertion about *which* rows the source returns
 * needs them together. `pageSize` exists so the paging test can force several pages over a handful
 * of rows; every other caller takes the default.
 */
export async function readAllDesignRows(
  source: DesignRowSource,
  pageSize: number = WALK_PAGE_SIZE,
): Promise<DesignBackupRow[]> {
  const rows: DesignBackupRow[] = [];
  let afterId: string | undefined;

  for (;;) {
    const page = await source.fetchDesignPage(
      afterId === undefined ? { pageSize } : { afterId, pageSize },
    );
    rows.push(...page);
    if (page.length < pageSize) return rows;
    afterId = page.at(-1)?.id;
  }
}
