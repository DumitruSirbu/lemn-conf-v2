import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { NeonContactSubmissionStore } from "../src/neon-contact-submission-store.js";
import {
  FAKE_DESIGN_ID,
  FAKE_DOCUMENT_MARKER,
  FAKE_EMAIL,
  FAKE_LOCALITY,
  FAKE_NAME,
  FAKE_PHONE,
  FAKE_PHONE_NORMAL_FORM,
  aCallbackSubmission,
  aDesignSubmission,
} from "./support/contact-submission-fixtures.js";
import { describeContactSubmissionStoreContract } from "./support/contact-submission-store-contract.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes rows under ids only it makes and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "NeonContactSubmissionStore (live test database)";

const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

/**
 * The marker only tests write, at the start of every client request id this file makes: the rows it deletes are the
 * rows that carry it, on the test database alone (ADR 0151). A real request id is a browser's random token.
 */
const TEST_ID_MARKER = "contact-live-test-";
const LARGEST_REVISION = "9223372036854775807";

function newClientRequestId(): string {
  return `${TEST_ID_MARKER}${randomBytes(8).toString("hex")}`;
}

/** Deletes the rows this file's marker is on, and says how many went. */
async function removeRowsCarryingTheTestMarker(): Promise<number> {
  const removed = await neon(testDatabaseUrl)`
    delete from contact_submissions
    where client_request_id like ${`${TEST_ID_MARKER}%`}
    returning client_request_id
  `;
  return removed.length;
}

interface OwnerView {
  readonly design_document_type: string | null;
  readonly priced_type: string | null;
  readonly design_document_marker: string | null;
  readonly design_id: string | null;
  readonly design_revision: string | null;
  readonly intent: string | null;
  readonly name: string;
  readonly phone: string;
  readonly phone_normal_form: string;
  readonly locality: string;
  readonly channel: string;
  readonly email: string | null;
  readonly consent_text_version: string;
  readonly locale: string;
  readonly is_document_sql_null: boolean;
  readonly is_priced_sql_null: boolean;
}

/** What the table holds for an id, read with the test database's owner credential: the application role cannot. */
async function rowHeldFor(clientRequestId: string): Promise<OwnerView[]> {
  return (await neon(testDatabaseUrl)`
    select
      jsonb_typeof(design_document) as design_document_type,
      jsonb_typeof(priced) as priced_type,
      design_document ->> 'marker' as design_document_marker,
      design_id, design_revision::text as design_revision, intent,
      name, phone, phone_normal_form, locality, channel, email, consent_text_version, locale,
      (design_document is null) as is_document_sql_null,
      (priced is null) as is_priced_sql_null
    from contact_submissions
    where client_request_id = ${clientRequestId}
  `) as OwnerView[];
}

describe.skipIf(!hasLiveDatabase)(SUITE_NAME, () => {
  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
    const strays = await removeRowsCarryingTheTestMarker();
    console.info(
      `[neon-contact-submission-store] removed ${String(strays)} stray test rows before the run`,
    );
  });

  afterAll(async () => {
    const removed = await removeRowsCarryingTheTestMarker();
    console.info(
      `[neon-contact-submission-store] removed ${String(removed)} test rows after the run`,
    );
  });

  describeContactSubmissionStoreContract({
    createStore: (options) =>
      new NeonContactSubmissionStore(testDatabaseUrl, options),
    newClientRequestId,
  });

  describe("what the table holds, read as its owner", () => {
    it("holds both snapshots as JSON objects for a design, the document as the object it was and not as text", async () => {
      const id = newClientRequestId();
      await new NeonContactSubmissionStore(testDatabaseUrl).record(
        aDesignSubmission(id),
      );

      const [row] = await rowHeldFor(id);

      expect(row).toMatchObject({
        design_document_type: "object",
        priced_type: "object",
        design_document_marker: FAKE_DOCUMENT_MARKER,
        design_id: FAKE_DESIGN_ID,
        design_revision: "7",
        intent: null,
      });
    });

    it("holds SQL null, and not a JSON null, in both snapshots and the design columns for a callback", async () => {
      const id = newClientRequestId();
      await new NeonContactSubmissionStore(testDatabaseUrl).record(
        aCallbackSubmission(id),
      );

      const [row] = await rowHeldFor(id);

      expect(row).toMatchObject({
        is_document_sql_null: true,
        is_priced_sql_null: true,
        design_id: null,
        design_revision: null,
        intent: "callback",
        email: null,
      });
    });

    it("holds every contact field as the request carried it", async () => {
      const id = newClientRequestId();
      await new NeonContactSubmissionStore(testDatabaseUrl).record(
        aDesignSubmission(id),
      );

      const [row] = await rowHeldFor(id);

      expect(row).toMatchObject({
        name: FAKE_NAME,
        phone: FAKE_PHONE,
        phone_normal_form: FAKE_PHONE_NORMAL_FORM,
        locality: FAKE_LOCALITY,
        channel: "email",
        email: FAKE_EMAIL,
        consent_text_version: "placeholder",
        locale: "ro",
      });
    });

    it("holds the widest revision a bigint can, which the domain's shape admits", async () => {
      const id = newClientRequestId();
      const submission = aDesignSubmission(id);
      await new NeonContactSubmissionStore(testDatabaseUrl).record({
        ...submission,
        target: {
          kind: "design",
          design: { id: FAKE_DESIGN_ID, revision: LARGEST_REVISION },
        },
      });

      const [row] = await rowHeldFor(id);

      expect(row?.design_revision).toBe(LARGEST_REVISION);
    });

    it("holds one row for a request recorded twice", async () => {
      const id = newClientRequestId();
      const store = new NeonContactSubmissionStore(testDatabaseUrl);
      await store.record(aDesignSubmission(id));
      await store.record(aDesignSubmission(id));

      expect(await rowHeldFor(id)).toHaveLength(1);
    });
  });
});
