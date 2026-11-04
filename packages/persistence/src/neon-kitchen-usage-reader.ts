import { migrateDesign, usageCountOf } from "@lemnaria/configurator-domain";
import type { Design, ItemUsageCounts } from "@lemnaria/configurator-domain";
import type { NeonQueryFunction } from "@neondatabase/serverless";

import { isCountableProbeSet } from "./dashboard-store-shapes.js";
import {
  countDesignsChoosingTierStatement,
  countDesignsPlacingBodiesStatement,
  readDesignPageStatement,
} from "./kitchen-usage-statements.js";
import type { TierSettingKey } from "./kitchen-usage-statements.js";
import { DashboardStoreError } from "./m10-ports.js";
import type { ItemUsageProbe, KitchenUsageReader } from "./m10-ports.js";
import {
  onlyRow,
  readRows,
  requiredCount,
  requiredText,
  unexpectedAnswer,
} from "./neon-dashboard-store-support.js";
import type { Row } from "./neon-row-guards.js";
import { openApplicationDatabase } from "./open-application-database.js";

type ApplicationSql = NeonQueryFunction<false, false>;
type MigratedDesignProbe = Extract<ItemUsageProbe, { via: "migrated-design" }>;
type SqlProbe = Exclude<ItemUsageProbe, MigratedDesignProbe>;

const COUNT_USAGE = "count the kitchens using an item";

/** How many stored designs one read of the walk holds: bounded, as the backup's page is, so no read loads the table. */
export const USAGE_DESIGN_PAGE_SIZE = 100;

/**
 * `KitchenUsageReader` on Neon Postgres (`designs`, with `0016`'s `deleted_by_client_at`). It only reads, and each read
 * is retried on a transient failure.
 *
 * A tier is counted from the stored document's `settings`, and a linked accessory from the build ids it was given that
 * the document places: both paths migration never rewrites. Everything else (a colour, a handle, a built-in accessory) is
 * counted by running the caller's predicate, which is the domain's `usesItem`, over each stored design after
 * `migrateDesign`, in one walk shared by every such probe of the call. A design the product cannot read is left out of
 * that walk: nobody can open it, and no deletion is judged by such a count (a colour, a handle and a built-in accessory
 * are never deleted), which only warns before an item is switched off. The two SQL counts, which a deletion is judged by,
 * read the stored document as written and so never leave a design out.
 */
export class NeonKitchenUsageReader implements KitchenUsageReader {
  private readonly sql: ApplicationSql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  async countEach(probes: readonly ItemUsageProbe[]): Promise<ItemUsageCounts> {
    if (!isCountableProbeSet(probes)) {
      throw new DashboardStoreError(COUNT_USAGE, "invalid-request");
    }
    const walked = await this.countByMigratedDesign(
      probes.filter(isMigratedDesignProbe),
    );
    const counts: ItemUsageCounts = await Promise.all(
      probes.map(async (probe) => ({
        item: probe.item,
        designCount: isMigratedDesignProbe(probe)
          ? walkedCountOf(walked, probe)
          : await this.countInSql(probe),
      })),
    );
    return requireOneCountEach(probes, counts);
  }

  private async countInSql(probe: SqlProbe): Promise<number> {
    if (probe.via === "placed-bodies") {
      if (probe.buildIds.length === 0) return 0;
      return this.countRows(() =>
        countDesignsPlacingBodiesStatement(this.sql, probe.buildIds),
      );
    }
    return this.countRows(() =>
      countDesignsChoosingTierStatement(this.sql, {
        settingKey: tierSettingKeyOf(probe.item.kind),
        tierId: probe.item.tierId,
        isFallback: probe.isFallback,
      }),
    );
  }

  private async countRows(run: () => PromiseLike<unknown>): Promise<number> {
    const rows = await readRows(COUNT_USAGE, run);
    return requiredCount(onlyRow(rows, COUNT_USAGE)["designs"], COUNT_USAGE);
  }

  /** Walks every stored design once, whatever the number of probes, and counts each design once per probe. */
  private async countByMigratedDesign(
    probes: readonly MigratedDesignProbe[],
  ): Promise<ReadonlyMap<MigratedDesignProbe, number>> {
    const counts = new Map(probes.map((probe) => [probe, 0]));
    if (probes.length === 0) return counts;
    let afterId = "";
    for (;;) {
      const page = await this.readDesignPage(afterId);
      for (const row of page) {
        const design = readableDesignOf(row);
        if (design !== undefined) tallyUse(counts, design);
      }
      if (page.length < USAGE_DESIGN_PAGE_SIZE) return counts;
      afterId = lastIdOf(page);
    }
  }

  private readDesignPage(afterId: string): Promise<readonly Row[]> {
    return readRows(COUNT_USAGE, () =>
      readDesignPageStatement(this.sql, {
        afterId,
        pageSize: USAGE_DESIGN_PAGE_SIZE,
      }),
    );
  }
}

function isMigratedDesignProbe(
  probe: ItemUsageProbe,
): probe is MigratedDesignProbe {
  return probe.via === "migrated-design";
}

function tierSettingKeyOf(kind: "material" | "hardware"): TierSettingKey {
  return kind === "material" ? "materialTierId" : "hardwareTierId";
}

/** A probe the walk was given always has a tally; a missing one is a defect, never a count of zero. */
function walkedCountOf(
  walked: ReadonlyMap<MigratedDesignProbe, number>,
  probe: MigratedDesignProbe,
): number {
  const count = walked.get(probe);
  if (count === undefined) throw unexpectedAnswer(COUNT_USAGE);
  return count;
}

function lastIdOf(page: readonly Row[]): string {
  const last = page[page.length - 1];
  return requiredText(last?.["id"], COUNT_USAGE);
}

function tallyUse(
  counts: Map<MigratedDesignProbe, number>,
  design: Design,
): void {
  for (const [probe, count] of counts) {
    if (isUsedBy(probe, design)) counts.set(probe, count + 1);
  }
}

/** A predicate that throws for a design (a body the catalogue does not hold) finds the design not using the item. */
function isUsedBy(probe: MigratedDesignProbe, design: Design): boolean {
  try {
    return probe.isUsedBy(design);
  } catch {
    return false;
  }
}

/** The failure is dropped whole: a refusal of a document can quote its text. */
function readableDesignOf(row: Row): Design | undefined {
  const schemaVersion = row["schema_version"];
  if (typeof schemaVersion !== "number") return undefined;
  try {
    return migrateDesign(schemaVersion, row["document"]);
  } catch {
    return undefined;
  }
}

/** The reader's own check of what it owes: one count per probe, found by the same rule the judgement reads them with. */
function requireOneCountEach(
  probes: readonly ItemUsageProbe[],
  counts: ItemUsageCounts,
): ItemUsageCounts {
  try {
    for (const { item } of probes) usageCountOf(counts, item);
  } catch {
    throw unexpectedAnswer(COUNT_USAGE);
  }
  return counts;
}
