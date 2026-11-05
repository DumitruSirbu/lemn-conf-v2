import {
  InvalidDesignError,
  UnknownBodyError,
  migrateDesign,
} from "@lemnaria/configurator-domain";
import type { Design, ItemUsageCounts } from "@lemnaria/configurator-domain";
import type { NeonQueryFunction } from "@neondatabase/serverless";

import { isCountableProbeSet } from "./dashboard-store-shapes.js";
import {
  countDesignsChoosingTierStatement,
  countDesignsPlacingBodiesStatement,
  readDesignPageStatement,
  tierSettingKeyOf,
} from "./kitchen-usage-statements.js";
import { DashboardStoreError } from "./m10-ports.js";
import type {
  ItemUsageProbe,
  KitchenUsageReader,
  KitchenUsageResult,
} from "./m10-ports.js";
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

/** What one walk found: the designs each probe's predicate holds of, and the designs it could not read. */
class Walk {
  readonly counts: Map<MigratedDesignProbe, number>;
  unreadableDesigns = 0;

  constructor(probes: readonly MigratedDesignProbe[]) {
    this.counts = new Map(probes.map((probe) => [probe, 0]));
  }

  recordUnreadable(): void {
    this.unreadableDesigns += 1;
  }

  recordUse(probe: MigratedDesignProbe): void {
    this.counts.set(probe, (this.counts.get(probe) ?? 0) + 1);
  }
}

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

  async countEach(
    probes: readonly ItemUsageProbe[],
    signal?: AbortSignal,
  ): Promise<KitchenUsageResult> {
    if (!isCountableProbeSet(probes)) {
      throw new DashboardStoreError(COUNT_USAGE, "invalid-request");
    }
    signal?.throwIfAborted();
    const walk = await this.walkMigratedDesigns(
      probes.filter(isMigratedDesignProbe),
      signal,
    );
    const counts: ItemUsageCounts = await Promise.all(
      probes.map(async (probe) => ({
        item: probe.item,
        designCount: isMigratedDesignProbe(probe)
          ? walkedCountOf(walk.counts, probe)
          : await this.countInSql(probe, signal),
      })),
    );
    signal?.throwIfAborted();
    return { counts, unreadableDesigns: walk.unreadableDesigns };
  }

  private async countInSql(
    probe: SqlProbe,
    signal: AbortSignal | undefined,
  ): Promise<number> {
    signal?.throwIfAborted();
    if (probe.via === "placed-bodies") {
      if (probe.buildIds.length === 0) return 0;
      return this.countRows(
        () => countDesignsPlacingBodiesStatement(this.sql, probe.buildIds),
        signal,
      );
    }
    return this.countRows(
      () =>
        countDesignsChoosingTierStatement(this.sql, {
          settingKey: tierSettingKeyOf(probe.item.kind),
          tierId: probe.item.tierId,
          isFallback: probe.isFallback,
        }),
      signal,
    );
  }

  private async countRows(
    run: () => PromiseLike<unknown>,
    signal: AbortSignal | undefined,
  ): Promise<number> {
    const rows = await readRows(COUNT_USAGE, run, signal);
    return requiredCount(onlyRow(rows, COUNT_USAGE)["designs"], COUNT_USAGE);
  }

  /**
   * Walks every stored design once, whatever the number of probes, and counts each design once per probe. A design
   * the product cannot read, or one a predicate cannot place a body of, is left out of every count and added to
   * `unreadableDesigns` once.
   */
  private async walkMigratedDesigns(
    probes: readonly MigratedDesignProbe[],
    signal: AbortSignal | undefined,
  ): Promise<Walk> {
    const walk = new Walk(probes);
    if (probes.length === 0) return walk;
    let afterId = "";
    for (;;) {
      signal?.throwIfAborted();
      const page = await this.readDesignPage(afterId, signal);
      for (const row of page) tallyDesign(walk, row);
      if (page.length < USAGE_DESIGN_PAGE_SIZE) return walk;
      afterId = lastIdOf(page);
    }
  }

  private readDesignPage(
    afterId: string,
    signal: AbortSignal | undefined,
  ): Promise<readonly Row[]> {
    return readRows(
      COUNT_USAGE,
      () =>
        readDesignPageStatement(this.sql, {
          afterId,
          pageSize: USAGE_DESIGN_PAGE_SIZE,
        }),
      signal,
    );
  }
}

function isMigratedDesignProbe(
  probe: ItemUsageProbe,
): probe is MigratedDesignProbe {
  return probe.via === "migrated-design";
}

/** A probe the walk was given always has a tally; a missing one is a defect, never a count of zero. */
function walkedCountOf(
  counts: ReadonlyMap<MigratedDesignProbe, number>,
  probe: MigratedDesignProbe,
): number {
  const count = counts.get(probe);
  if (count === undefined) throw unexpectedAnswer(COUNT_USAGE);
  return count;
}

function lastIdOf(page: readonly Row[]): string {
  const last = page[page.length - 1];
  return requiredText(last?.["id"], COUNT_USAGE);
}

function tallyDesign(walk: Walk, row: Row): void {
  const design = readableDesignOf(row);
  const used =
    design === undefined ? undefined : usedProbesOf(walk.counts.keys(), design);
  if (used === undefined) {
    walk.recordUnreadable();
    return;
  }
  for (const probe of used) walk.recordUse(probe);
}

/**
 * The probes whose predicate holds of the design, or `undefined` when a body of it is not in the catalogue
 * (`UnknownBodyError`), which no predicate can answer for. Any other failure of a caller's predicate is a failure to
 * count, with no cause, and never reads as "not used".
 */
function usedProbesOf(
  probes: Iterable<MigratedDesignProbe>,
  design: Design,
): readonly MigratedDesignProbe[] | undefined {
  try {
    return [...probes].filter((probe) => probe.isUsedBy(design));
  } catch (failure) {
    if (failure instanceof UnknownBodyError) return undefined;
    throw unexpectedAnswer(COUNT_USAGE);
  }
}

/**
 * The design as the product reads it, or `undefined` when the domain says the document is not a design it can read
 * (`InvalidDesignError`, which every refusal of a stored document is). Any other failure of the migration is a failure to
 * count, so a defect there is never read as a design that uses nothing. Both are dropped whole: a refusal of a document
 * can quote its text.
 */
function readableDesignOf(row: Row): Design | undefined {
  const schemaVersion = row["schema_version"];
  if (typeof schemaVersion !== "number") return undefined;
  try {
    return migrateDesign(schemaVersion, row["document"]);
  } catch (failure) {
    if (failure instanceof InvalidDesignError) return undefined;
    throw unexpectedAnswer(COUNT_USAGE);
  }
}
