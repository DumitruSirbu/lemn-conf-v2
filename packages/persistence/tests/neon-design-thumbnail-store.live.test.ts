import { randomBytes } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  DESIGN_THUMBNAIL_TYPES,
  KITCHEN_L_DESIGN,
  MAX_DESIGN_THUMBNAIL_BYTES,
} from "@lemnaria/configurator-domain";
import { Client, neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { NeonDesignThumbnailStore } from "../src/neon-design-thumbnail-store.js";
import { describeDesignThumbnailStoreContract } from "./support/design-thumbnail-store-contract.js";
import type {
  PlantedDesign,
  ThumbnailWorld,
} from "./support/design-thumbnail-store-contract.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";
import { taggedWebp } from "./support/valid-thumbnail-bytes.js";

// Shared: this file writes rows under ids only it makes, asserts no whole-table figure and needs the schema intact.
holdSharedTestSchemaLock();

const SUITE_NAME = "NeonDesignThumbnailStore (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/**
 * `NeonDesignThumbnailStore` against the test database, with the contract the fake also passes, and what only a database
 * can show: the table's own refusals (W4a-3), the cascade from `designs`, and a write that waits for a client's delete in
 * flight and then writes nothing. The store runs over the test database's **owner** credential, which holds every
 * privilege; the privilege test reads what the application role is granted from the catalog.
 *
 * Every row names a design id this file minted at random, and `afterAll` deletes by those ids only (ADR 0151). The
 * database is shared, so no assertion reads a whole-table figure.
 */
const PROPERTY_RUNS = 6;
const TABLE_BACKSTOP_BYTES = 262_144;
const POLL_INTERVAL_MS = 50;
const LOCK_WAIT_BOUND_MS = 20_000;
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

interface DriverFailure {
  readonly code?: string;
  readonly constraint?: string;
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const sql = () => neon(liveTestDatabaseUrl);
  const designIds: string[] = [];

  // The table of 0030 must exist: nothing else in a run of this file migrates the test database first.
  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await sql()`delete from design_thumbnails where design_id = any(${designIds})`;
    await sql()`delete from designs where id = any(${designIds})`;
  });

  async function plantDesign({
    isClaimed = true,
    revision = "1",
    isHidden = false,
    isDeletedByClient = false,
  }: Parameters<ThumbnailWorld["aDesign"]>[0] = {}): Promise<PlantedDesign> {
    const design: PlantedDesign = {
      id: nanoid(),
      tokenHash: randomBytes(32).toString("hex"),
      accountId: isClaimed ? nanoid() : undefined,
    };
    designIds.push(design.id);
    await sql()`
      insert into designs (id, schema_version, document, write_token_hash, account_id, revision,
        hidden_by_client_at, deleted_by_client_at)
      values (${design.id}, ${CURRENT_SCHEMA_VERSION}, ${JSON.stringify(KITCHEN_L_DESIGN)}::jsonb, ${design.tokenHash},
        ${design.accountId ?? null}, ${revision}::bigint,
        case when ${isHidden}::boolean then now() end, case when ${isDeletedByClient}::boolean then now() end)
    `;
    return design;
  }

  function newWorld(): Promise<ThumbnailWorld> {
    return Promise.resolve({
      store: new NeonDesignThumbnailStore(liveTestDatabaseUrl),
      aDesign: plantDesign,
      async setRevision(designId, revision) {
        await sql()`update designs set revision = ${revision}::bigint where id = ${designId}`;
      },
      async mark(designId, { isHidden, isDeletedByClient }) {
        await sql()`
          update designs set
            hidden_by_client_at = case when ${isHidden ?? null}::boolean then now() else hidden_by_client_at end,
            deleted_by_client_at = case when ${isDeletedByClient ?? null}::boolean then now() else deleted_by_client_at end
          where id = ${designId}
        `;
      },
      async plantThumbnail(designId, revision) {
        await sql()`
          insert into design_thumbnails (design_id, revision, image, image_type)
          values (${designId}, ${revision}::bigint, decode('00', 'hex'), 'image/webp')
          on conflict (design_id) do update set revision = excluded.revision
        `;
      },
      async heldThumbnail(designId) {
        const [row] = (await sql()`
          select revision::text as revision, image_type, get_byte(image, length(image) - 1) as tag_byte
          from design_thumbnails where design_id = ${designId}
        `) as {
          revision: string;
          image_type: (typeof DESIGN_THUMBNAIL_TYPES)[number];
          tag_byte: number;
        }[];
        return row === undefined
          ? undefined
          : {
              revision: row.revision,
              type: row.image_type,
              tagByte: row.tag_byte,
            };
      },
    });
  }

  describeDesignThumbnailStoreContract("NeonDesignThumbnailStore", newWorld, {
    propertyRuns: PROPERTY_RUNS,
  });

  describe("the table refuses what the code refuses", () => {
    async function failureOfInsert(
      insert: (designId: string) => Promise<unknown>,
    ): Promise<DriverFailure> {
      const design = await plantDesign();
      try {
        await insert(design.id);
      } catch (failure) {
        return failure as DriverFailure;
      }
      throw new Error("the table accepted a row it was expected to refuse");
    }

    it.each([
      ["an empty image", "design_thumbnails_image_size", "''"],
      [
        "an image over the table's backstop",
        "design_thumbnails_image_size",
        `repeat('00', ${String(TABLE_BACKSTOP_BYTES + 1)})`,
      ],
    ])(
      "refuses %s by the table's own check",
      async (_name, constraint, hex) => {
        const failure = await failureOfInsert((designId) =>
          sql().query(
            `insert into design_thumbnails (design_id, revision, image, image_type)
           values ($1, 1, decode(${hex}, 'hex'), 'image/webp')`,
            [designId],
          ),
        );

        expect(failure).toMatchObject({ code: CHECK_VIOLATION, constraint });
      },
    );

    it("refuses a type outside the closed list, and one the list spells in another case", async () => {
      for (const type of ["image/gif", "IMAGE/PNG", "image/png "]) {
        const failure = await failureOfInsert((designId) =>
          sql().query(
            `insert into design_thumbnails (design_id, revision, image, image_type)
             values ($1, 1, decode('00', 'hex'), $2)`,
            [designId, type],
          ),
        );

        expect(failure).toMatchObject({
          code: CHECK_VIOLATION,
          constraint: "design_thumbnails_image_type_is_known",
        });
      }
    });

    it("refuses a negative revision, and 0, which no design has", async () => {
      for (const revision of ["-1", "0"]) {
        const failure = await failureOfInsert((designId) =>
          sql().query(
            `insert into design_thumbnails (design_id, revision, image, image_type)
             values ($1, $2::bigint, decode('00', 'hex'), 'image/webp')`,
            [designId, revision],
          ),
        );

        expect(failure).toMatchObject({
          code: CHECK_VIOLATION,
          constraint: "design_thumbnails_revision_is_positive",
        });
      }
    });

    it("refuses a picture for a design that does not exist", async () => {
      const failure = await failureOfInsert(
        () =>
          sql()`
          insert into design_thumbnails (design_id, revision, image, image_type)
          values (${nanoid()}, 1, decode('00', 'hex'), 'image/webp')
        `,
      );

      expect(failure).toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
        constraint: "design_thumbnails_design_id_fkey",
      });
    });

    it("holds every type of the domain's closed list, and an image of the domain's cap and of the table's backstop", async () => {
      for (const type of DESIGN_THUMBNAIL_TYPES) {
        const design = await plantDesign();
        await sql().query(
          `insert into design_thumbnails (design_id, revision, image, image_type)
           values ($1, 1, decode('00', 'hex'), $2)`,
          [design.id, type],
        );
      }
      for (const bytes of [MAX_DESIGN_THUMBNAIL_BYTES, TABLE_BACKSTOP_BYTES]) {
        const design = await plantDesign();
        await sql().query(
          `insert into design_thumbnails (design_id, revision, image, image_type)
           values ($1, 1, decode(repeat('00', $2::int), 'hex'), 'image/png')`,
          [design.id, bytes],
        );
      }

      expect(MAX_DESIGN_THUMBNAIL_BYTES).toBeLessThan(TABLE_BACKSTOP_BYTES);
    });

    it("removes the picture with the design row it belongs to", async () => {
      const design = await plantDesign();
      await sql()`
        insert into design_thumbnails (design_id, revision, image, image_type)
        values (${design.id}, 1, decode('00', 'hex'), 'image/webp')
      `;

      await sql()`delete from designs where id = ${design.id}`;

      const remaining = await sql()`
        select 1 from design_thumbnails where design_id = ${design.id}
      `;
      expect(remaining).toHaveLength(0);
    });
  });

  describe("a write that meets a client's delete in flight", () => {
    async function waitForABlockedThumbnailStatement(): Promise<void> {
      const deadline = Date.now() + LOCK_WAIT_BOUND_MS;
      while (Date.now() < deadline) {
        const waiting = await sql()`
          select 1 from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock' and query ilike '%design_thumbnails%'
            and pid <> pg_backend_pid()
        `;
        if (waiting.length > 0) return;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      throw new Error(
        "the picture's write never waited for the design's row lock",
      );
    }

    it("waits for the delete, then writes nothing for the kitchen it deleted", async () => {
      const world = await newWorld();
      const design = await plantDesign();
      const deleter = new Client(liveTestDatabaseUrl);
      await deleter.connect();
      try {
        await deleter.query("begin");
        await deleter.query("select 1 from designs where id = $1 for update", [
          design.id,
        ]);
        const write = world.store.storeThumbnail({
          designId: design.id,
          credential: { kind: "write-token", hash: design.tokenHash },
          revision: "1",
          image: taggedWebp(1),
          type: "image/webp",
        });
        await waitForABlockedThumbnailStatement();
        await deleter.query(
          "update designs set deleted_by_client_at = now() where id = $1",
          [design.id],
        );
        await deleter.query(
          "delete from design_thumbnails where design_id = $1",
          [design.id],
        );
        await deleter.query("commit");

        expect(await write).toEqual({ kind: "none" });
      } finally {
        await deleter.end();
      }
      expect(await world.heldThumbnail(design.id)).toBeUndefined();
    });
  });
});
