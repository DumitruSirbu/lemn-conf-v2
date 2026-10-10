import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { countContactSubmissionsForTests } from "../src/count-contact-submissions-for-tests.js";
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

const SUITE_NAME = "countContactSubmissionsForTests (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/** The marker only this file writes at the start of every id it makes. */
const TEST_ID_MARKER = "contact-count-live-";
const idsWritten: string[] = [];

function newId(): string {
  const id = `${TEST_ID_MARKER}${randomBytes(8).toString("hex")}`;
  idsWritten.push(id);
  return id;
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const sql = neon(liveTestDatabaseUrl);

  async function plant(id: string): Promise<void> {
    const recorded = await new NeonContactSubmissionStore(
      liveTestDatabaseUrl,
    ).record(aCallbackSubmission(id));
    expect(recorded.kind).toBe("stored");
  }

  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    await sql`delete from contact_submissions where client_request_id = any(${idsWritten})`;
  });

  it("counts the rows of the ids it is handed and no others, planted beside them", async () => {
    const handed = [newId(), newId()];
    const beside = newId();
    for (const id of [...handed, beside]) await plant(id);

    expect(await countContactSubmissionsForTests(handed)).toBe(2);
    expect(await countContactSubmissionsForTests([beside])).toBe(1);
    expect(await countContactSubmissionsForTests([...handed, beside])).toBe(3);
  });

  it("counts none for an id with no row, and one for one stored once however often it was recorded", async () => {
    const absent = newId();
    const stored = newId();
    await plant(stored);
    await plant(stored);

    expect(await countContactSubmissionsForTests([absent])).toBe(0);
    expect(await countContactSubmissionsForTests([stored])).toBe(1);
  });

  it("changes nothing: the rows are the same after it counts them", async () => {
    const id = newId();
    await plant(id);

    await countContactSubmissionsForTests([id]);
    await countContactSubmissionsForTests([id]);

    const after = await sql`
      select client_request_id from contact_submissions where client_request_id = ${id}
    `;
    expect(after).toHaveLength(1);
  });

  it("sends nothing for an id that is not of the shape", async () => {
    await expect(
      countContactSubmissionsForTests([`${TEST_ID_MARKER}%`]),
    ).rejects.toThrow(/Refusing to count contact requests/);
  });
});
