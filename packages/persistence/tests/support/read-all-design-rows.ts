import type {
  DesignBackupRow,
  DesignRowSource,
} from "../../src/design-row-source.js";

/** Small enough that a handful of minted rows still spans several pages, so a test that walks a
 *  live table exercises the keyset resume rather than one first page. */
const WALK_PAGE_SIZE = 2;

/**
 * Drains a `DesignRowSource` into one array.
 *
 * For tests only. The production backup deliberately never does this — holding every row at once is
 * the failure finding DB-002 removed — but a live assertion about *which* rows the source returns
 * needs them together, and a test database holds a handful of rows.
 */
export async function readAllDesignRows(
  source: DesignRowSource,
): Promise<DesignBackupRow[]> {
  const rows: DesignBackupRow[] = [];
  let afterId: string | undefined;

  for (;;) {
    const page = await source.fetchDesignPage(
      afterId === undefined
        ? { pageSize: WALK_PAGE_SIZE }
        : { afterId, pageSize: WALK_PAGE_SIZE },
    );
    rows.push(...page);
    if (page.length < WALK_PAGE_SIZE) return rows;
    afterId = page.at(-1)?.id;
  }
}
