import { randomBytes } from "node:crypto";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteContactSubmissionsForTests } from "../src/delete-contact-submissions-for-tests.js";
import { runMigrations } from "../src/migrate.js";
import { NeonContactSubmissionStore } from "../src/neon-contact-submission-store.js";
import { aCallbackSubmission } from "./support/contact-submission-fixtures.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes synthetic contact rows under ids only it makes and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "deleteContactSubmissionsForTests (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/** The marker only this file writes at the start of every id it makes; the rows it removes are the ones it planted. */
const TEST_ID_MARKER = "contact-delete-live-";
const idsWritten: string[] = [];

function newId(): string {
  const id = `${TEST_ID_MARKER}${randomBytes(8).toString("hex")}`;
  idsWritten.push(id);
  return id;
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  // Opened in `beforeAll`: a skipped suite's body still runs, and with no database configured the URL is empty.
  let sql: NeonQueryFunction<false, false>;
  const store = () => new NeonContactSubmissionStore(liveTestDatabaseUrl);

  /** The ids among `ids` that still have a row, read with the test database's owner credential. */
  async function idsStillStored(ids: readonly string[]): Promise<string[]> {
    const rows = (await sql`
      select client_request_id from contact_submissions where client_request_id = any(${ids})
    `) as { client_request_id: string }[];
    return rows.map((row) => row.client_request_id).sort();
  }

  async function plant(id: string): Promise<void> {
    const recorded = await store().record(aCallbackSubmission(id));
    expect(recorded.kind).toBe("stored");
  }

  beforeAll(async () => {
    sql = neon(liveTestDatabaseUrl);
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    // The file's own cleanup, by the ids it wrote and by nothing else.
    await sql`delete from contact_submissions where client_request_id = any(${idsWritten})`;
  });

  it("removes the rows of the ids it is handed, and answers how many went", async () => {
    const handed = [newId(), newId()];
    for (const id of handed) await plant(id);

    const removed = await deleteContactSubmissionsForTests(handed);

    expect(removed).toBe(2);
    expect(await idsStillStored(handed)).toEqual([]);
  });

  it("leaves every row whose id it was not handed, planted beside the ones it hands over", async () => {
    const handed = newId();
    const keptOne = newId();
    const keptTwo = newId();
    for (const id of [handed, keptOne, keptTwo]) await plant(id);

    const removed = await deleteContactSubmissionsForTests([handed]);

    expect(removed).toBe(1);
    expect(await idsStillStored([handed, keptOne, keptTwo])).toEqual(
      [keptOne, keptTwo].sort(),
    );
  });

  it("takes no row whose id differs by a character, and answers none for an id with no row", async () => {
    const planted = newId();
    await plant(planted);
    const neighbour = `${planted.slice(0, -1)}${planted.endsWith("0") ? "1" : "0"}`;
    idsWritten.push(neighbour);

    expect(await deleteContactSubmissionsForTests([neighbour])).toBe(0);
    expect(await idsStillStored([planted])).toEqual([planted]);
  });

  it("answers none for an id it already removed, and sends nothing for an id that is not of the shape", async () => {
    const once = newId();
    await plant(once);
    const anotherPlanted = newId();
    await plant(anotherPlanted);

    expect(await deleteContactSubmissionsForTests([once])).toBe(1);
    expect(await deleteContactSubmissionsForTests([once])).toBe(0);
    await expect(
      deleteContactSubmissionsForTests([`${TEST_ID_MARKER}%`]),
    ).rejects.toThrow(/Refusing to delete contact requests/);
    expect(await idsStillStored([anotherPlanted])).toEqual([anotherPlanted]);
  });
});
