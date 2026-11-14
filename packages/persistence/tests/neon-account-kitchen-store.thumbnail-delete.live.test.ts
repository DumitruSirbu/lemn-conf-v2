import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { NeonAccountKitchenStore } from "../src/neon-account-kitchen-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes rows under ids only it makes, asserts no whole-table figure and needs the schema intact.
holdSharedTestSchemaLock();

const SUITE_NAME =
  "NeonAccountKitchenStore thumbnail delete (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/**
 * The client's delete of a kitchen removes its card thumbnail in the same statement, only for the design that statement
 * marked (ADR 0181 d9, W4a-6), against the test database. The store runs over the test database's **owner** credential;
 * the grant the application role needs for the delete is the privilege test's.
 *
 * Every kitchen carries a neighbour with a picture of its own, planted beside it, and every case ends by reading that
 * neighbour's row: a delete that named no design, or the wrong one, would take it too. Every row names an id this file
 * minted at random, and `afterAll` deletes by those ids only (ADR 0151).
 */
describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const sql = () => neon(liveTestDatabaseUrl);
  const designIds: string[] = [];
  const store = () => new NeonAccountKitchenStore(liveTestDatabaseUrl);

  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await sql()`delete from design_thumbnails where design_id = any(${designIds})`;
    await sql()`delete from designs where id = any(${designIds})`;
  });

  interface KitchenSpec {
    readonly accountId: string;
    readonly isSent?: boolean;
    readonly isHidden?: boolean;
    readonly isDeleted?: boolean;
  }

  /** A kitchen with a picture of its own, and the id it was planted under. */
  async function aKitchenWithAPicture({
    accountId,
    isSent = false,
    isHidden = false,
    isDeleted = false,
  }: KitchenSpec): Promise<string> {
    const id = nanoid();
    designIds.push(id);
    await sql()`
      insert into designs (id, schema_version, document, account_id, sent_at, hidden_by_client_at, deleted_by_client_at)
      values (${id}, ${CURRENT_SCHEMA_VERSION}, ${JSON.stringify(KITCHEN_L_DESIGN)}::jsonb, ${accountId},
        case when ${isSent}::boolean then now() end, case when ${isHidden}::boolean then now() end,
        case when ${isDeleted}::boolean then now() end)
    `;
    await sql()`
      insert into design_thumbnails (design_id, revision, image, image_type)
      values (${id}, 1, decode('00', 'hex'), 'image/webp')
    `;
    return id;
  }

  async function hasAPicture(designId: string): Promise<boolean> {
    const rows = await sql()`
      select 1 from design_thumbnails where design_id = ${designId}
    `;
    return rows.length === 1;
  }

  async function isMarkedDeleted(designId: string): Promise<boolean> {
    const rows = await sql()`
      select 1 from designs where id = ${designId} and deleted_by_client_at is not null
    `;
    return rows.length === 1;
  }

  it("deletes the picture of the kitchen it marked, in that statement, and not its neighbour's", async () => {
    const accountId = nanoid();
    const kitchen = await aKitchenWithAPicture({ accountId });
    const neighbour = await aKitchenWithAPicture({ accountId });

    const outcome = await store().markDeleted({ accountId, designId: kitchen });

    expect(outcome).toEqual({ kind: "deleted" });
    expect(await isMarkedDeleted(kitchen)).toBe(true);
    expect(await hasAPicture(kitchen)).toBe(false);
    expect(await hasAPicture(neighbour)).toBe(true);
  });

  it("keeps the picture of a sent kitchen whose delete is refused", async () => {
    const accountId = nanoid();
    const sent = await aKitchenWithAPicture({ accountId, isSent: true });
    const neighbour = await aKitchenWithAPicture({ accountId });

    const outcome = await store().markDeleted({ accountId, designId: sent });

    expect(outcome).toEqual({ kind: "sent" });
    expect(await isMarkedDeleted(sent)).toBe(false);
    expect(await hasAPicture(sent)).toBe(true);
    expect(await hasAPicture(neighbour)).toBe(true);
  });

  it("keeps the picture of another account's kitchen, whose delete answers none", async () => {
    const owner = nanoid();
    const kitchen = await aKitchenWithAPicture({ accountId: owner });

    const outcome = await store().markDeleted({
      accountId: nanoid(),
      designId: kitchen,
    });

    expect(outcome).toEqual({ kind: "none" });
    expect(await hasAPicture(kitchen)).toBe(true);
  });

  it("keeps a picture that sits under a kitchen already deleted, because that delete marks nothing", async () => {
    const accountId = nanoid();
    const alreadyDeleted = await aKitchenWithAPicture({
      accountId,
      isDeleted: true,
    });

    const outcome = await store().markDeleted({
      accountId,
      designId: alreadyDeleted,
    });

    expect(outcome).toEqual({ kind: "none" });
    expect(await hasAPicture(alreadyDeleted)).toBe(true);
  });

  it("keeps the picture of a kitchen already hidden, whose delete answers none", async () => {
    const accountId = nanoid();
    const hidden = await aKitchenWithAPicture({
      accountId,
      isSent: true,
      isHidden: true,
    });

    const outcome = await store().markDeleted({ accountId, designId: hidden });

    expect(outcome).toEqual({ kind: "none" });
    expect(await hasAPicture(hidden)).toBe(true);
  });

  it("keeps the picture of a kitchen it hides", async () => {
    const accountId = nanoid();
    const sent = await aKitchenWithAPicture({ accountId, isSent: true });

    const outcome = await store().hide({ accountId, designId: sent });

    expect(outcome).toEqual({ kind: "hidden" });
    expect(await hasAPicture(sent)).toBe(true);
  });
});
