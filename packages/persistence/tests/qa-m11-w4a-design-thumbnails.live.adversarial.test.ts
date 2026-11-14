import { randomBytes } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { NeonAccountKitchenStore } from "../src/neon-account-kitchen-store.js";
import { NeonDesignThumbnailStore } from "../src/neon-design-thumbnail-store.js";
import type {
  HeldRow,
  PlantedDesign,
  ThumbnailWorld,
} from "./support/design-thumbnail-store-contract.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { describeThumbnailAdversarialExtras } from "./support/qa-m11-w4a-thumbnail-extras.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";
import { taggedWebp, thumbnailBytes } from "./support/valid-thumbnail-bytes.js";

// Shared: this file writes rows under ids only it makes, asserts no whole-table figure and needs the schema intact.
holdSharedTestSchemaLock();

const SUITE_NAME =
  "adversarial QA of M11 W4a design thumbnails (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/**
 * Adversarial QA of M11 wave W4a against the test database: the extras asked of both arms, a write racing the client's
 * delete in both orders, a delete of a kitchen that has no picture, hiding, the instant a replacement restamps, and the
 * table's remaining refusals. Every row names a design id this file minted, pushed to `designIds` before it is
 * inserted, and `afterAll` deletes by those ids only (ADR 0151). Every race is awaited to its end before cleanup.
 */
const NOT_NULL_VIOLATION = "23502";
const UNIQUE_VIOLATION = "23505";
const RACE_ROUNDS = 24;
const MAX_START_SKEW_MS = 25;
const RESTAMP_GAP_MS = 40;

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const sql = () => neon(liveTestDatabaseUrl);
  const designIds: string[] = [];
  const thumbnails = () => new NeonDesignThumbnailStore(liveTestDatabaseUrl);
  const kitchens = () => new NeonAccountKitchenStore(liveTestDatabaseUrl);

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
    isSent = false,
  }: {
    isClaimed?: boolean;
    revision?: string;
    isHidden?: boolean;
    isDeletedByClient?: boolean;
    isSent?: boolean;
  } = {}): Promise<PlantedDesign> {
    const design: PlantedDesign = {
      id: nanoid(),
      tokenHash: randomBytes(32).toString("hex"),
      accountId: isClaimed ? nanoid() : undefined,
    };
    designIds.push(design.id);
    await sql()`
      insert into designs (id, schema_version, document, write_token_hash, account_id, revision,
        hidden_by_client_at, deleted_by_client_at, sent_at)
      values (${design.id}, ${CURRENT_SCHEMA_VERSION}, ${JSON.stringify(KITCHEN_L_DESIGN)}::jsonb, ${design.tokenHash},
        ${design.accountId ?? null}, ${revision}::bigint,
        case when ${isHidden}::boolean then now() end, case when ${isDeletedByClient}::boolean then now() end,
        case when ${isSent}::boolean then now() end)
    `;
    return design;
  }

  async function heldRow(designId: string): Promise<HeldRow | undefined> {
    const [row] = (await sql()`
      select revision::text as revision, image_type, get_byte(image, length(image) - 1) as tag_byte
      from design_thumbnails where design_id = ${designId}
    `) as {
      revision: string;
      image_type: HeldRow["type"];
      tag_byte: number;
    }[];
    return row === undefined
      ? undefined
      : {
          revision: row.revision,
          type: row.image_type,
          tagByte: row.tag_byte,
        };
  }

  function newWorld(): Promise<ThumbnailWorld> {
    return Promise.resolve({
      store: thumbnails(),
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
      heldThumbnail: heldRow,
    });
  }

  describeThumbnailAdversarialExtras("NeonDesignThumbnailStore", newWorld);

  async function isMarkedDeleted(designId: string): Promise<boolean> {
    const rows = await sql()`
      select 1 from designs where id = ${designId} and deleted_by_client_at is not null
    `;
    return rows.length === 1;
  }

  const pause = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  describe("a write racing the client's delete of the same kitchen", () => {
    it("leaves no picture under a kitchen that is marked deleted, whichever statement starts first", async () => {
      const store = thumbnails();
      const owned = kitchens();
      const rounds = Array.from({ length: RACE_ROUNDS }, (_, round) => round);

      const results = await Promise.all(
        rounds.map(async (round) => {
          const design = await plantDesign();
          const accountId = design.accountId ?? "";
          const write = () =>
            store.storeThumbnail({
              designId: design.id,
              credential:
                round % 2 === 0
                  ? { kind: "write-token", hash: design.tokenHash }
                  : { kind: "account", accountId },
              revision: "1",
              image: taggedWebp(1),
              type: "image/webp",
            });
          const remove = () =>
            owned.markDeleted({ accountId, designId: design.id });
          const writeFirst = round % 3 !== 0;
          const skew = Math.floor(Math.random() * MAX_START_SKEW_MS);
          const settled = await Promise.allSettled(
            writeFirst
              ? [write(), pause(skew).then(remove)]
              : [remove(), pause(skew).then(write)],
          );
          return { design, settled };
        }),
      );

      for (const { design, settled } of results) {
        expect(
          settled.map((result) => result.status),
          "neither statement fails",
        ).toEqual(["fulfilled", "fulfilled"]);
        expect(await isMarkedDeleted(design.id)).toBe(true);
        expect(
          await heldRow(design.id),
          `design ${design.id}: a deleted kitchen holds a picture`,
        ).toBeUndefined();
      }
    }, 120_000);
  });

  describe("the client's delete of a kitchen that has no picture", () => {
    it("still deletes it, since a kitchen saved before the table existed has no row to remove", async () => {
      const design = await plantDesign();
      const accountId = design.accountId ?? "";

      const outcome = await kitchens().markDeleted({
        accountId,
        designId: design.id,
      });

      expect(outcome).toEqual({ kind: "deleted" });
      expect(await isMarkedDeleted(design.id)).toBe(true);
    });

    it("answers none the second time, with no error, and removes nothing it did not mark", async () => {
      const design = await plantDesign();
      const neighbour = await plantDesign();
      const accountId = design.accountId ?? "";
      await thumbnails().storeThumbnail({
        designId: neighbour.id,
        credential: { kind: "write-token", hash: neighbour.tokenHash },
        revision: "1",
        image: taggedWebp(5),
        type: "image/webp",
      });
      await kitchens().markDeleted({ accountId, designId: design.id });

      const again = await kitchens().markDeleted({
        accountId,
        designId: design.id,
      });

      expect(again).toEqual({ kind: "none" });
      expect(await heldRow(neighbour.id)).toBeDefined();
    });
  });

  describe("a delete, then a write, over the real statements", () => {
    it("answers none to the right credential on both arms once the client has deleted the kitchen, and writes no row", async () => {
      const design = await plantDesign();
      const accountId = design.accountId ?? "";
      await kitchens().markDeleted({ accountId, designId: design.id });

      for (const credential of [
        { kind: "write-token", hash: design.tokenHash },
        { kind: "account", accountId },
      ] as const) {
        expect(
          await thumbnails().storeThumbnail({
            designId: design.id,
            credential,
            revision: "1",
            image: thumbnailBytes("image/png", [1]),
            type: "image/png",
          }),
        ).toEqual({ kind: "none" });
      }
      expect(await heldRow(design.id)).toBeUndefined();
    });

    it("keeps the picture of a hidden kitchen, serves it to no one, and takes no replacement for it", async () => {
      const design = await plantDesign({ isSent: true });
      const accountId = design.accountId ?? "";
      const write = (revision: string, byte: number) =>
        thumbnails().storeThumbnail({
          designId: design.id,
          credential: { kind: "write-token", hash: design.tokenHash },
          revision,
          image: taggedWebp(byte),
          type: "image/webp",
        });
      await write("1", 10);

      expect(await kitchens().hide({ accountId, designId: design.id })).toEqual(
        { kind: "hidden" },
      );
      await sql()`update designs set revision = 2 where id = ${design.id}`;

      expect(await heldRow(design.id)).toMatchObject({
        revision: "1",
        tagByte: 10,
      });
      expect(
        await thumbnails().loadOwnThumbnail({ accountId, designId: design.id }),
      ).toEqual({ kind: "none" });
      expect(await write("2", 20)).toEqual({ kind: "none" });
      expect(await heldRow(design.id)).toMatchObject({
        revision: "1",
        tagByte: 10,
      });
    });

    it("lets a sent kitchen that is neither hidden nor deleted keep a picture, and the delete of it refuses and keeps it", async () => {
      const design = await plantDesign({ isSent: true });
      const accountId = design.accountId ?? "";

      expect(
        await thumbnails().storeThumbnail({
          designId: design.id,
          credential: { kind: "account", accountId },
          revision: "1",
          image: taggedWebp(3),
          type: "image/webp",
        }),
      ).toEqual({ kind: "stored" });
      expect(
        await kitchens().markDeleted({ accountId, designId: design.id }),
      ).toEqual({ kind: "sent" });
      expect(await heldRow(design.id)).toBeDefined();
    });
  });

  describe("a duplicated kitchen (ADR 0181: the copy shows the placeholder until its own next save)", () => {
    it("carries no picture of the original, and leaves the original's picture where it was", async () => {
      const design = await plantDesign();
      const accountId = design.accountId ?? "";
      await thumbnails().storeThumbnail({
        designId: design.id,
        credential: { kind: "write-token", hash: design.tokenHash },
        revision: "1",
        image: taggedWebp(5),
        type: "image/webp",
      });

      const outcome = await kitchens().duplicate({
        accountId,
        designId: design.id,
        name: "A copy",
      });

      expect(outcome.kind).toBe("duplicated");
      if (outcome.kind === "duplicated") {
        designIds.push(outcome.id);
        expect(await heldRow(outcome.id)).toBeUndefined();
        expect(
          await thumbnails().loadOwnThumbnail({
            accountId,
            designId: outcome.id,
          }),
        ).toEqual({ kind: "none" });
      }
      expect(await heldRow(design.id)).toBeDefined();
    });
  });

  describe("captured_at", () => {
    async function capturedAt(designId: string): Promise<number> {
      const [row] = (await sql()`
        select extract(epoch from captured_at)::float8 as seconds from design_thumbnails where design_id = ${designId}
      `) as { seconds: number }[];
      if (row === undefined) throw new Error("no picture row");
      return row.seconds;
    }

    it("is restamped by a replacement of a greater revision, and by neither a repeat nor an older write", async () => {
      const design = await plantDesign({ revision: "2" });
      const write = (revision: string) =>
        thumbnails().storeThumbnail({
          designId: design.id,
          credential: { kind: "write-token", hash: design.tokenHash },
          revision,
          image: taggedWebp(Number(revision)),
          type: "image/webp",
        });
      await write("2");
      const first = await capturedAt(design.id);
      await pause(RESTAMP_GAP_MS);

      await write("2");
      expect(await capturedAt(design.id), "a repeat restamps nothing").toBe(
        first,
      );

      await sql()`update designs set revision = 3 where id = ${design.id}`;
      await write("2");
      expect(
        await capturedAt(design.id),
        "a stale write restamps nothing",
      ).toBe(first);

      await write("3");
      expect(
        await capturedAt(design.id),
        "a newer picture restamps the row",
      ).toBeGreaterThan(first);
    });
  });

  describe("the table's remaining refusals, inserted as the test owner", () => {
    async function failureOf(
      run: (designId: string) => Promise<unknown>,
    ): Promise<{ code?: string }> {
      const design = await plantDesign();
      try {
        await run(design.id);
      } catch (failure) {
        return failure as { code?: string };
      }
      throw new Error("the table accepted a row it was expected to refuse");
    }

    it.each([
      ["a missing image", "null", "1", "'image/png'"],
      ["a missing type", "decode('00', 'hex')", "1", "null"],
      ["a missing revision", "decode('00', 'hex')", "null", "'image/png'"],
    ])("refuses %s as a null", async (_name, image, revision, type) => {
      const failure = await failureOf((designId) =>
        sql().query(
          `insert into design_thumbnails (design_id, revision, image, image_type)
           values ($1, ${revision}, ${image}, ${type})`,
          [designId],
        ),
      );

      expect(failure.code).toBe(NOT_NULL_VIOLATION);
    });

    it("holds one row per design: a second plain insert for the same design is refused", async () => {
      const failure = await failureOf(async (designId) => {
        await sql()`insert into design_thumbnails (design_id, revision, image, image_type)
          values (${designId}, 1, decode('00', 'hex'), 'image/png')`;
        await sql()`insert into design_thumbnails (design_id, revision, image, image_type)
          values (${designId}, 2, decode('00', 'hex'), 'image/png')`;
      });

      expect(failure.code).toBe(UNIQUE_VIOLATION);
    });

    it("stamps captured_at itself when an insert does not name it", async () => {
      const design = await plantDesign();
      await sql()`insert into design_thumbnails (design_id, revision, image, image_type)
        values (${design.id}, 1, decode('00', 'hex'), 'image/png')`;

      const [row] = await sql()`
        select captured_at is not null as is_stamped from design_thumbnails where design_id = ${design.id}
      `;

      expect(row).toEqual({ is_stamped: true });
    });
  });
});
