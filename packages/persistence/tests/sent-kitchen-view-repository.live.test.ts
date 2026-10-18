import { randomBytes } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
} from "@lemnaria/configurator-domain";
import type { DesignId } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteContactSubmissionsForTests } from "../src/delete-contact-submissions-for-tests.js";
import type { DesignRevision } from "../src/design-revision.js";
import { runMigrations } from "../src/migrate.js";
import { NeonConfigurationRepository } from "../src/neon-configuration-repository.js";
import { NeonContactSubmissionStore } from "../src/neon-contact-submission-store.js";
import {
  NeonSentKitchenViewRepository,
  SentKitchenViewRepositoryError,
} from "../src/sent-kitchen-view-repository.js";
import { NeonShareLinkRepository } from "../src/share-link-repository.js";
import { flatShareRepository } from "./support/flat-share-repository.js";
import {
  FAKE_SNAPSHOT,
  aDesignSubmission,
  aDesignSubmissionNaming,
} from "./support/contact-submission-fixtures.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { rejectionOf } from "./support/rejection-of.js";
import {
  ANOTHER_KITCHEN,
  aViewOf,
  describeSentKitchenViewRepositoryContract,
  newTokenHash,
} from "./support/sent-kitchen-view-repository-contract.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes rows under ids only it makes and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "NeonSentKitchenViewRepository (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/**
 * The marker only this file writes at the start of every client request id it makes. Its view rows go with those
 * requests by the table's cascade, and its designs by the ids it minted, on the test database alone (ADR 0151).
 */
const TEST_ID_MARKER = "contact-view-live-";
const WRITE_TOKEN_HASH = "5".repeat(64);
const VISITOR_HASH = "6".repeat(64);
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";

function newClientRequestId(): string {
  return `${TEST_ID_MARKER}${randomBytes(8).toString("hex")}`;
}

/** A minted design's credentials and the revision it was minted at. */
interface MintedDesign {
  readonly designId: string;
  readonly writeTokenHash: string;
  readonly visitorHash: string;
  readonly revision: DesignRevision;
}

interface HeldViewRow {
  readonly token_hash: string;
  readonly client_request_id: string;
  readonly schema_version: number;
  readonly design_document: unknown;
  readonly created_at: string;
  readonly revoked_at: string | null;
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  /** The test database's owner credential, opened per use: a skipped describe still runs this body. */
  const sql = () => neon(liveTestDatabaseUrl);
  const mintedDesignIds: DesignId[] = [];
  const repository = () =>
    new NeonSentKitchenViewRepository(liveTestDatabaseUrl);
  const contactStore = () =>
    new NeonContactSubmissionStore(liveTestDatabaseUrl);

  async function newStoredClientRequestId(): Promise<string> {
    const id = newClientRequestId();
    expect((await contactStore().record(aDesignSubmission(id))).kind).toBe(
      "stored",
    );
    return id;
  }

  /** Deletes the requests this file's marker is on, and with them their views; says how many requests went. */
  async function removeRequestsCarryingTheTestMarker(): Promise<number> {
    const removed = await sql()`
      delete from contact_submissions
      where client_request_id like ${`${TEST_ID_MARKER}%`}
      returning client_request_id
    `;
    return removed.length;
  }

  /** What the table holds for a request, read with the test database's owner credential. */
  async function viewsHeldFor(clientRequestId: string): Promise<HeldViewRow[]> {
    return (await sql()`
      select token_hash, client_request_id, schema_version, design_document,
        created_at::text as created_at, revoked_at::text as revoked_at
      from contact_submission_views
      where client_request_id = ${clientRequestId}
      order by token_hash
    `) as HeldViewRow[];
  }

  async function failureOfInsert(row: {
    tokenHash: string;
    clientRequestId: string;
    document: string;
  }): Promise<unknown> {
    return rejectionOf(sql()`
      insert into contact_submission_views (token_hash, client_request_id, schema_version, design_document)
      values (${row.tokenHash}, ${row.clientRequestId}, ${CURRENT_SCHEMA_VERSION}, ${row.document}::jsonb)
    `);
  }

  async function mintDesign(): Promise<MintedDesign> {
    const { id, revision } = await new NeonConfigurationRepository(
      liveTestDatabaseUrl,
    ).mint({
      design: KITCHEN_L_DESIGN,
      writeTokenHash: WRITE_TOKEN_HASH,
      visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
    });
    mintedDesignIds.push(id);
    return {
      designId: id,
      writeTokenHash: WRITE_TOKEN_HASH,
      visitorHash: VISITOR_HASH,
      revision,
    };
  }

  /** A request for the minted design at its revision, its snapshot the design as minted, as the contact route sends. */
  async function sendTheKitchen(
    design: MintedDesign,
  ): Promise<{ clientRequestId: string; snapshotDocument: string }> {
    const clientRequestId = newClientRequestId();
    const snapshotDocument = canonicalSerializeDesign(KITCHEN_L_DESIGN);
    await contactStore().record({
      ...aDesignSubmissionNaming(clientRequestId, {
        id: design.designId,
        revision: design.revision,
      }),
      snapshot: { ...FAKE_SNAPSHOT, document: snapshotDocument },
    });
    return { clientRequestId, snapshotDocument };
  }

  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
    const strays = await removeRequestsCarryingTheTestMarker();
    console.info(
      `[sent-kitchen-view-repository] removed ${String(strays)} stray test requests before the run`,
    );
  });

  afterAll(async () => {
    const removed = await removeRequestsCarryingTheTestMarker();
    const designIds = mintedDesignIds.splice(0, mintedDesignIds.length);
    await sql()`delete from designs where id = any(${designIds})`;
    console.info(
      `[sent-kitchen-view-repository] removed ${String(removed)} test requests and ${String(designIds.length)} ` +
        `minted designs after the run`,
    );
  });

  describeSentKitchenViewRepositoryContract({
    createRepository: repository,
    newStoredClientRequestId,
  });

  describe("the table, read and written as its owner", () => {
    it("refuses, by its check, a token hash that is not a SHA-256 digest", async () => {
      const failure = await failureOfInsert({
        tokenHash: "not-a-digest",
        clientRequestId: await newStoredClientRequestId(),
        document: "{}",
      });

      expect(failure).toMatchObject({
        code: CHECK_VIOLATION,
        constraint: "contact_submission_views_token_hash_is_sha256",
      });
    });

    it("refuses, by its check, a document that is not a JSON object", async () => {
      const failure = await failureOfInsert({
        tokenHash: newTokenHash(),
        clientRequestId: await newStoredClientRequestId(),
        document: JSON.stringify("{}"),
      });

      expect(failure).toMatchObject({
        code: CHECK_VIOLATION,
        constraint: "contact_submission_views_design_document_is_an_object",
      });
    });

    it("holds one row for a hash recorded twice", async () => {
      const clientRequestId = await newStoredClientRequestId();
      const view = aViewOf(clientRequestId);

      await repository().record(view);
      await repository().record(view);

      expect(await viewsHeldFor(clientRequestId)).toHaveLength(1);
    });

    it("holds the document as the object it was, the version and no revocation", async () => {
      const clientRequestId = await newStoredClientRequestId();
      const view = aViewOf(clientRequestId);

      await repository().record(view);

      expect(await viewsHeldFor(clientRequestId)).toEqual([
        expect.objectContaining({
          token_hash: view.tokenHash,
          schema_version: CURRENT_SCHEMA_VERSION,
          design_document: JSON.parse(view.document) as unknown,
          revoked_at: null,
        }),
      ]);
    });

    it("answers none for a row the owner revoked by hand, and keeps the row", async () => {
      const clientRequestId = await newStoredClientRequestId();
      const view = aViewOf(clientRequestId);
      await repository().record(view);

      await sql()`update contact_submission_views set revoked_at = now() where token_hash = ${view.tokenHash}`;

      expect(await repository().load(view.tokenHash)).toEqual({ kind: "none" });
      expect(await viewsHeldFor(clientRequestId)).toHaveLength(1);
    });
  });

  describe("the reference to the request", () => {
    it("refuses a view of a request the table does not hold, as the repository error with the reference's code", async () => {
      const view = aViewOf(newClientRequestId());

      const failure = await rejectionOf(repository().record(view));

      expect(failure).toBeInstanceOf(SentKitchenViewRepositoryError);
      expect((failure as Error).cause).toEqual({
        name: "NeonDbError",
        code: FOREIGN_KEY_VIOLATION,
      });
      expect(await repository().load(view.tokenHash)).toEqual({ kind: "none" });
    });

    it("deletes a request's views with the request, and no other request's", async () => {
      const deleted = await newStoredClientRequestId();
      const kept = await newStoredClientRequestId();
      const keptView = aViewOf(kept);
      await repository().record(aViewOf(deleted));
      await repository().record(aViewOf(deleted, ANOTHER_KITCHEN));
      await repository().record(keptView);
      expect(await viewsHeldFor(deleted)).toHaveLength(2);

      expect(await deleteContactSubmissionsForTests([deleted])).toBe(1);

      expect(await viewsHeldFor(deleted)).toEqual([]);
      expect(await repository().load(keptView.tokenHash)).toEqual({
        kind: "found",
        design: KITCHEN_L_DESIGN,
      });
    });
  });

  describe("a frozen copy (8V criterion 9)", () => {
    it("still opens the kitchen as sent after the customer saves an edit of the design", async () => {
      const design = await mintDesign();
      const { clientRequestId, snapshotDocument } =
        await sendTheKitchen(design);
      const view = { ...aViewOf(clientRequestId), document: snapshotDocument };
      await repository().record(view);

      await new NeonConfigurationRepository(liveTestDatabaseUrl).saveAuthorized(
        {
          id: design.designId,
          design: ANOTHER_KITCHEN,
          credential: { kind: "write-token", hash: design.writeTokenHash },
          expectedRevision: design.revision,
          requestVisitor: { kind: "present", visitorHash: design.visitorHash },
        },
      );

      const edited = await new NeonConfigurationRepository(
        liveTestDatabaseUrl,
      ).load(design.designId);
      expect(edited.design).toEqual(ANOTHER_KITCHEN);
      const loaded = await repository().load(view.tokenHash);
      expect(loaded.kind).toBe("found");
      expect(
        loaded.kind === "found" && canonicalSerializeDesign(loaded.design),
      ).toBe(snapshotDocument);
    });

    it("is untouched by issuing and revoking the customer's share link, and touches no share link itself", async () => {
      const design = await mintDesign();
      const shares = flatShareRepository(
        new NeonShareLinkRepository(liveTestDatabaseUrl),
      );
      const shareTokenHash = newTokenHash();
      expect(await shares.issue({ ...design, tokenHash: shareTokenHash })).toBe(
        "issued",
      );
      const { clientRequestId, snapshotDocument } =
        await sendTheKitchen(design);

      await repository().record({
        ...aViewOf(clientRequestId),
        document: snapshotDocument,
      });
      expect(await shares.status(design)).toEqual({ active: true });
      expect(await shares.loadShared(shareTokenHash)).toEqual({
        kind: "found",
        design: KITCHEN_L_DESIGN,
      });

      const viewsBefore = await viewsHeldFor(clientRequestId);
      expect(await shares.revoke(design)).toBe("revoked");
      expect(await shares.issue({ ...design, tokenHash: newTokenHash() })).toBe(
        "issued",
      );
      expect(await shares.revoke(design)).toBe("revoked");

      expect(await viewsHeldFor(clientRequestId)).toEqual(viewsBefore);
      expect(viewsBefore).toHaveLength(1);
    });
  });
});
