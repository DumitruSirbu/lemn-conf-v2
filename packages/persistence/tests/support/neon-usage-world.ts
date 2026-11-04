import {
  KITCHEN_L_BODY_CATALOG,
  SAMPLE_PRICE_BOOK,
  pricedAsBuildId,
} from "@lemnaria/configurator-domain";
import type { ItemRef, PriceBook } from "@lemnaria/configurator-domain";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { nanoid } from "nanoid";

import { usageProbesFor } from "../../src/item-usage-probes.js";
import type { ItemUsageProbe } from "../../src/m10-ports.js";

/**
 * What the usage half of the defaults contract needs around the Neon reader: a design that uses the items the contract
 * names, written to `designs` as the stored document the reader's SQL reads, and the probe the reader is asked with for
 * each item. The contract names accessories it made up, so each is linked, in a book this world keeps, to a catalogue row
 * of its own, and a design that "uses" it places a body of that row. Tiers are written into the settings. The contract
 * asks only about those kinds, so a colour or a handle is refused here.
 *
 * Every row names an id this world minted at random, and `removeTheRowsItPlanted` deletes by those ids alone, on the test
 * database alone (ADR 0151). The runner's connection is the test database's owner, which may delete from `designs`.
 */
export interface NeonUsageWorld {
  probeFor(item: ItemRef): ItemUsageProbe;
  aDesignUsing(spec: {
    readonly uses: readonly ItemRef[];
    readonly isDeletedByClient?: boolean;
  }): Promise<void>;
  removeTheRowsItPlanted(): Promise<void>;
}

const CATALOG = KITCHEN_L_BODY_CATALOG;

/** The rows a made-up accessory may be linked to: those priced as themselves, in the catalogue's order. */
const LINKABLE_ROW_IDS = [...CATALOG.keys()].filter(
  (buildId) => pricedAsBuildId(CATALOG, buildId) === buildId,
);

export function createNeonUsageWorld(
  sql: () => NeonQueryFunction<false, false>,
): NeonUsageWorld {
  const rowIdByAccessoryId = new Map<string, string>();
  const designIds: string[] = [];

  function linkedRowOf(accessoryId: string): string {
    const known = rowIdByAccessoryId.get(accessoryId);
    if (known !== undefined) return known;
    const next = LINKABLE_ROW_IDS[rowIdByAccessoryId.size];
    if (next === undefined) throw new Error("no catalogue row is left to link");
    rowIdByAccessoryId.set(accessoryId, next);
    return next;
  }

  function currentBook(): PriceBook {
    return {
      ...SAMPLE_PRICE_BOOK,
      linkedAccessories: [...rowIdByAccessoryId].map(
        ([accessoryId, linkedBuildId]) => ({
          accessoryId,
          ruleId: `accessory.${accessoryId}`,
          linkedBuildId,
          perUnitMinor: 1_000,
          name: `Accesoriu ${accessoryId}`,
        }),
      ),
    };
  }

  function documentUsing(uses: readonly ItemRef[]): unknown {
    const settings: Record<string, string> = {};
    const placements: unknown[] = [];
    for (const item of uses) {
      if (item.kind === "material") settings["materialTierId"] = item.tierId;
      else if (item.kind === "hardware") {
        settings["hardwareTierId"] = item.tierId;
      } else if (item.kind === "accessory") {
        placements.push({
          id: `p${String(placements.length)}`,
          body: { buildId: linkedRowOf(item.accessoryId) },
        });
      } else throw new Error(`a ${item.kind} cannot be planted here`);
    }
    return { settings, placements };
  }

  return {
    probeFor(item) {
      if (item.kind === "accessory") linkedRowOf(item.accessoryId);
      const [probe] = usageProbesFor([item], {
        catalog: CATALOG,
        book: currentBook(),
      });
      if (probe === undefined) throw new Error("no probe for the item");
      return probe;
    },
    async aDesignUsing({ uses, isDeletedByClient = false }) {
      const designId = nanoid();
      designIds.push(designId);
      const document = JSON.stringify(documentUsing(uses));
      await sql()`
        insert into designs (id, schema_version, document, deleted_by_client_at)
        values (${designId}, 5, ${document}::jsonb,
          case when ${isDeletedByClient}::boolean then now() end)
      `;
    },
    async removeTheRowsItPlanted() {
      if (designIds.length === 0) return;
      await sql()`delete from designs where id = any(${designIds})`;
    },
  };
}
