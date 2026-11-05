import type { ItemRef } from "@lemnaria/configurator-domain";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { nanoid } from "nanoid";

import type { ItemUsageProbe } from "../../src/m10-ports.js";
import { NeonKitchenUsageReader } from "../../src/neon-kitchen-usage-reader.js";
import type { SavedDesignsWorld } from "./dashboard-contract-support.js";

/**
 * Saved designs on the live test database, for the contracts that check the publish's guard: a design that names an item,
 * written to `designs` as the stored document the usage SQL reads, and the usage reader's count of the designs using it. Every row
 * names an id this world minted at random, and `removeTheRowsItPlanted` deletes by those ids alone, on the test database
 * alone. The connection is the test database's owner, which may delete from `designs`.
 */
export interface NeonSavedDesigns {
  readonly world: SavedDesignsWorld;
  /** A stored row as it is, for the arms that plant the usage fixtures: the schema version, the document, the mark. */
  plantStoredDesign(stored: {
    readonly schemaVersion: number;
    readonly document: unknown;
    readonly isDeletedByClient: boolean;
  }): Promise<void>;
  removeTheRowsItPlanted(): Promise<void>;
}

export function createNeonSavedDesigns(
  sql: () => NeonQueryFunction<false, false>,
  connectionUrl: string,
): NeonSavedDesigns {
  const designIds: string[] = [];

  function documentNaming(item: ItemRef, viaBuildId: string | undefined) {
    switch (item.kind) {
      case "material":
        return { settings: { materialTierId: item.tierId }, placements: [] };
      case "hardware":
        return { settings: { hardwareTierId: item.tierId }, placements: [] };
      case "accessory":
        if (viaBuildId === undefined) {
          throw new Error("a linked accessory is named through a body");
        }
        return {
          settings: {},
          placements: [{ id: "p0", body: { buildId: viaBuildId } }],
        };
      default:
        throw new Error(`a design is not planted to name a ${item.kind}`);
    }
  }

  function probeFor(
    item: ItemRef,
    buildIds: readonly string[],
  ): ItemUsageProbe {
    if (item.kind === "accessory") {
      return { via: "placed-bodies", item, buildIds };
    }
    if (item.kind === "material" || item.kind === "hardware") {
      return { via: "settings-tier", item, isFallback: false };
    }
    throw new Error(`a ${item.kind} is not counted here`);
  }

  async function plantStoredDesign({
    schemaVersion,
    document,
    isDeletedByClient,
  }: Parameters<NeonSavedDesigns["plantStoredDesign"]>[0]): Promise<void> {
    const designId = nanoid();
    designIds.push(designId);
    await sql()`
      insert into designs (id, schema_version, document, deleted_by_client_at)
      values (${designId}, ${schemaVersion}, ${JSON.stringify(document)}::jsonb,
        case when ${isDeletedByClient}::boolean then now() end)
    `;
  }

  return {
    plantStoredDesign,
    world: {
      aDesignNaming: (item, { viaBuildId, isDeletedByClient = false } = {}) =>
        plantStoredDesign({
          schemaVersion: 5,
          document: documentNaming(item, viaBuildId),
          isDeletedByClient,
        }),
      async countDesignsUsing(item, buildIds) {
        const { counts } = await new NeonKitchenUsageReader(
          connectionUrl,
        ).countEach([probeFor(item, buildIds)]);
        return counts[0]?.designCount ?? NaN;
      },
    },
    async removeTheRowsItPlanted() {
      if (designIds.length === 0) return;
      await sql()`delete from designs where id = any(${designIds})`;
    },
  };
}
