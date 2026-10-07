import { randomBytes } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { runMigrations } from "../src/migrate.js";
import {
  DesignWriteConflictError,
  NeonConfigurationRepository,
} from "../src/neon-configuration-repository.js";
import type { MintVisitor } from "../src/neon-configuration-repository.js";
import { retryOnTransientFailure } from "../src/retry-on-transient-failure.js";
import { NeonShareLinkRepository } from "../src/share-link-repository.js";
import type { ShareLinkCredentials } from "../src/share-link-repository.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { loseTheFirstReply } from "./support/lose-the-first-reply.js";
import type { LossPoint, LostReply } from "./support/lose-the-first-reply.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: rows are per visitor and the schema must stay intact, as in `share-link-repository.test.ts`.
holdSharedTestSchemaLock();

const SUITE_NAME = "retried writes leave no trace (live test database)";

const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

const LOST_REPLIES: readonly LostReply[] = [
  "empty-reply",
  "cold-start-refusal",
];
const FIRST_REVISION = "1";
const REQUESTS_OF_ONE_RETRIED_CALL = 2;

interface Loss {
  readonly reply: LostReply;
  readonly point: LossPoint;
}

function afterTheWriteLands(reply: LostReply): Loss {
  return { reply, point: "after-the-write-lands" };
}

function beforeTheWriteLands(reply: LostReply): Loss {
  return { reply, point: "before-the-write-lands" };
}

/** Random, so a leftover row from an interrupted run can never be mistaken for this run's. */
function randomDigest(): string {
  return randomBytes(32).toString("hex");
}

interface StoredRow {
  schema_version: number;
  document: Design;
  write_token_hash: string;
  visitor_hash: string;
  revision: string;
}

interface ShareRow {
  token_hash: string;
  is_active: boolean;
}

describe(SUITE_NAME, () => {
  const mintedIds: DesignId[] = [];
  const visitorHashes: string[] = [];

  function configurations(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
  }

  function shareLinks(): NeonShareLinkRepository {
    return new NeonShareLinkRepository(testDatabaseUrl);
  }

  function newVisitorHash(): string {
    const visitorHash = randomDigest();
    visitorHashes.push(visitorHash);
    return visitorHash;
  }

  async function mintDesign(
    visitor: MintVisitor,
    design: Design = KITCHEN_L_DESIGN,
  ): Promise<{ id: DesignId; writeTokenHash: string; revision: string }> {
    const writeTokenHash = randomDigest();
    const minted = await configurations().mint({
      design,
      writeTokenHash,
      visitor,
    });
    mintedIds.push(minted.id);
    return { ...minted, writeTokenHash };
  }

  async function mintFreshDesign(): Promise<{
    credentials: ShareLinkCredentials;
    revision: string;
  }> {
    const visitorHash = newVisitorHash();
    const minted = await mintDesign({ kind: "fresh", visitorHash });
    return {
      credentials: {
        designId: minted.id,
        writeTokenHash: minted.writeTokenHash,
        visitorHash,
      },
      revision: minted.revision,
    };
  }

  /** Runs `call` with its first reply lost, and proves the loss happened and was retried exactly once. */
  async function withLostFirstReply<T>(
    loss: Loss,
    call: () => Promise<T>,
    meanwhile?: () => Promise<unknown>,
  ): Promise<T> {
    const handle = loseTheFirstReply(loss.reply, loss.point, meanwhile);
    try {
      return await call();
    } finally {
      handle.restore();
      expect(handle.requestsSent()).toBe(REQUESTS_OF_ONE_RETRIED_CALL);
    }
  }

  async function designRowsOf(visitorHash: string): Promise<StoredRow[]> {
    const rows = (await neon(testDatabaseUrl)`
      select schema_version, document, write_token_hash, visitor_hash, revision::text as revision
      from designs where visitor_hash = ${visitorHash}
    `) as StoredRow[];
    return [...rows].sort((a, b) =>
      JSON.stringify(a.document).localeCompare(JSON.stringify(b.document)),
    );
  }

  async function shareRowsOf(designId: DesignId): Promise<ShareRow[]> {
    return (await neon(testDatabaseUrl)`
      select token_hash, revoked_at is null as is_active
      from design_share_links where design_id = ${designId}
    `) as ShareRow[];
  }

  /** Names each link by the role the test gave its token, so two runs with different random tokens compare equal. */
  function linksByRole(
    rows: readonly ShareRow[],
    roles: Readonly<Record<string, string>>,
  ) {
    return rows
      .map((row) => ({
        role: roles[row.token_hash] ?? "unexpected",
        isActive: row.is_active,
      }))
      .sort((a, b) => a.role.localeCompare(b.role));
  }

  /** The row without what a run chooses for itself (its credentials and visitor), so two runs compare equal. */
  function withoutRunIdentity(rows: readonly StoredRow[]) {
    return rows.map((row) => ({
      schema_version: row.schema_version,
      document: row.document,
      revision: row.revision,
    }));
  }

  beforeAll(async () => {
    if (hasLiveDatabase) await runMigrations(testDatabaseUrl);
  });

  afterEach(async () => {
    if (!hasLiveDatabase) return;
    const ids = mintedIds.splice(0, mintedIds.length);
    const visitors = visitorHashes.splice(0, visitorHashes.length);
    // Share rows go with their design (`on delete cascade`). Visitors too, so a row a faulty retry
    // inserted under an id this test never saw is removed with the rest.
    await neon(testDatabaseUrl)`
      delete from designs where id = any(${ids}) or visitor_hash = any(${visitors})
    `;
  });

  describe("mint", () => {
    async function mintScenario(loss: Loss | undefined) {
      const visitorHash = newVisitorHash();
      const mint = () =>
        mintDesign({ kind: "fresh", visitorHash }).then((minted) => ({
          revision: minted.revision,
        }));
      const outcome = loss
        ? await withLostFirstReply(loss, mint)
        : await mint();
      return {
        outcome,
        rows: withoutRunIdentity(await designRowsOf(visitorHash)),
      };
    }

    it.skipIf(!hasLiveDatabase).each(LOST_REPLIES)(
      "a fresh mint whose acknowledgement is lost (%s) ends in one design, as a clean mint does",
      async (reply) => {
        const clean = await mintScenario(undefined);
        const retried = await mintScenario(afterTheWriteLands(reply));

        expect(retried).toEqual(clean);
        expect(retried.rows).toHaveLength(1);
      },
    );

    async function rotateScenario(loss: Loss | undefined) {
      const fromVisitorHash = newVisitorHash();
      const toVisitorHash = newVisitorHash();
      for (const presetId of ["older-one", "older-two"])
        await mintDesign(
          { kind: "fresh", visitorHash: fromVisitorHash },
          { ...KITCHEN_L_DESIGN, presetId },
        );
      const rotate = () =>
        mintDesign({
          kind: "rotate",
          visitorHash: toVisitorHash,
          fromVisitorHash,
        }).then((minted) => ({ revision: minted.revision }));
      const outcome = loss
        ? await withLostFirstReply(loss, rotate)
        : await rotate();
      return {
        outcome,
        rowsLeftUnderTheOldValue: await designRowsOf(fromVisitorHash),
        rowsUnderTheNewValue: withoutRunIdentity(
          await designRowsOf(toVisitorHash),
        ),
      };
    }

    it.skipIf(!hasLiveDatabase).each(LOST_REPLIES)(
      "a rotating mint whose acknowledgement is lost (%s) moves each earlier design once and adds one",
      async (reply) => {
        const clean = await rotateScenario(undefined);
        const retried = await rotateScenario(afterTheWriteLands(reply));

        expect(retried).toEqual(clean);
        expect(retried.rowsLeftUnderTheOldValue).toEqual([]);
        expect(retried.rowsUnderTheNewValue).toHaveLength(3);
      },
    );
  });

  describe("share-link issue", () => {
    async function issueScenario(loss: Loss | undefined) {
      const { credentials } = await mintFreshDesign();
      const previousToken = randomDigest();
      const nextToken = randomDigest();
      await shareLinks().issue({ ...credentials, tokenHash: previousToken });
      const issue = () =>
        shareLinks().issue({ ...credentials, tokenHash: nextToken });
      const outcome = loss
        ? await withLostFirstReply(loss, issue)
        : await issue();
      return {
        outcome,
        links: linksByRole(await shareRowsOf(credentials.designId), {
          [previousToken]: "previous",
          [nextToken]: "next",
        }),
        opensByItsToken: (await shareLinks().loadShared(nextToken)).kind,
      };
    }

    it.skipIf(!hasLiveDatabase).each(LOST_REPLIES)(
      "an issue whose acknowledgement is lost (%s) answers issued and leaves one active link, as a clean issue does",
      async (reply) => {
        const clean = await issueScenario(undefined);
        const retried = await issueScenario(afterTheWriteLands(reply));

        expect(retried).toEqual(clean);
        expect(retried.outcome).toBe("issued");
        expect(retried.links).toEqual([
          { role: "next", isActive: true },
          { role: "previous", isActive: false },
        ]);
      },
    );

    it.skipIf(!hasLiveDatabase).each(LOST_REPLIES)(
      "an unauthorised issue whose reply is lost (%s) is still refused and inserts nothing",
      async (reply) => {
        const { credentials } = await mintFreshDesign();
        const nextToken = randomDigest();

        const outcome = await withLostFirstReply(
          afterTheWriteLands(reply),
          () =>
            shareLinks().issue({
              ...credentials,
              writeTokenHash: randomDigest(),
              tokenHash: nextToken,
            }),
        );

        expect(outcome).toBe("refused");
        expect(await shareRowsOf(credentials.designId)).toEqual([]);
      },
    );
  });

  describe("share-link issue across a visitor rotation", () => {
    async function rotationScenario(loss: Loss | undefined) {
      const { credentials } = await mintFreshDesign();
      const rotatedVisitorHash = newVisitorHash();
      const token = randomDigest();
      const rotateFromAnotherTab = () =>
        mintDesign({
          kind: "rotate",
          visitorHash: rotatedVisitorHash,
          fromVisitorHash: credentials.visitorHash,
        });
      const issue = () =>
        shareLinks().issue({ ...credentials, tokenHash: token });
      let outcome: string;
      if (loss) {
        outcome = await withLostFirstReply(loss, issue, rotateFromAnotherTab);
      } else {
        outcome = await issue();
        await rotateFromAnotherTab();
      }
      return {
        outcome,
        links: linksByRole(await shareRowsOf(credentials.designId), {
          [token]: "issued",
        }),
        opensByItsToken: (await shareLinks().loadShared(token)).kind,
        designsUnderTheOldVisitor: (await designRowsOf(credentials.visitorHash))
          .length,
        designsUnderTheNewVisitor: (await designRowsOf(rotatedVisitorHash))
          .length,
      };
    }

    it.skipIf(!hasLiveDatabase).each(LOST_REPLIES)(
      "an issue that landed, then a rotation from another tab, then the retry (%s) answers issued as the order issue-then-rotate does",
      async (reply) => {
        const clean = await rotationScenario(undefined);
        const retried = await rotationScenario(afterTheWriteLands(reply));

        expect(retried).toEqual(clean);
        expect(retried).toMatchObject({
          outcome: "issued",
          links: [{ role: "issued", isActive: true }],
          opensByItsToken: "found",
        });
      },
    );

    it.skipIf(!hasLiveDatabase).each(LOST_REPLIES)(
      "an issue that never landed, then a rotation, then the retry (%s) is refused and inserts nothing",
      async (reply) => {
        const { credentials } = await mintFreshDesign();
        const issue = () =>
          shareLinks().issue({ ...credentials, tokenHash: randomDigest() });

        const outcome = await withLostFirstReply(
          beforeTheWriteLands(reply),
          issue,
          () =>
            mintDesign({
              kind: "rotate",
              visitorHash: newVisitorHash(),
              fromVisitorHash: credentials.visitorHash,
            }),
        );

        expect(outcome).toBe("refused");
        expect(await shareRowsOf(credentials.designId)).toEqual([]);
      },
    );

    it.skipIf(!hasLiveDatabase)(
      "a first attempt with a stale visitor is refused even when its token already names the design's link",
      async () => {
        const { credentials } = await mintFreshDesign();
        const token = randomDigest();
        await shareLinks().issue({ ...credentials, tokenHash: token });

        const outcome = await shareLinks().issue({
          ...credentials,
          visitorHash: randomDigest(),
          tokenHash: token,
        });

        expect(outcome).toBe("refused");
      },
    );
  });

  describe("share-link revoke", () => {
    async function revokeScenario(loss: Loss | undefined) {
      const { credentials } = await mintFreshDesign();
      const token = randomDigest();
      await shareLinks().issue({ ...credentials, tokenHash: token });
      const revoke = () => shareLinks().revoke(credentials);
      const outcome = loss
        ? await withLostFirstReply(loss, revoke)
        : await revoke();
      return {
        outcome,
        links: linksByRole(await shareRowsOf(credentials.designId), {
          [token]: "only",
        }),
        stillOpensByItsToken: (await shareLinks().loadShared(token)).kind,
      };
    }

    it.skipIf(!hasLiveDatabase).each(LOST_REPLIES)(
      "a revoke whose acknowledgement is lost (%s) answers revoked and leaves the link revoked, as a clean revoke does",
      async (reply) => {
        const clean = await revokeScenario(undefined);
        const retried = await revokeScenario(afterTheWriteLands(reply));

        expect(retried).toEqual(clean);
        expect(retried.links).toEqual([{ role: "only", isActive: false }]);
      },
    );
  });

  describe("save", () => {
    const savedDocument: Design = {
      ...KITCHEN_L_DESIGN,
      presetId: "saved-once",
    };

    function saveRequest(
      designId: DesignId,
      writeTokenHash: string,
      visitorHash: string,
      design: Design,
      expectedRevision: string,
    ) {
      return {
        id: designId,
        design,
        writeTokenHash,
        expectedRevision,
        requestVisitor: { kind: "present", visitorHash } as const,
      };
    }

    async function saveScenario(loss: Loss | undefined) {
      const { credentials } = await mintFreshDesign();
      const save = () =>
        configurations().saveAuthorized(
          saveRequest(
            credentials.designId,
            credentials.writeTokenHash,
            credentials.visitorHash,
            savedDocument,
            FIRST_REVISION,
          ),
        );
      const outcome = loss
        ? await withLostFirstReply(loss, save)
        : await save();
      return {
        outcome: {
          revision: outcome.revision,
          ownsVisitor: outcome.ownsVisitor,
        },
        rows: withoutRunIdentity(await designRowsOf(credentials.visitorHash)),
      };
    }

    it.skipIf(!hasLiveDatabase).each(LOST_REPLIES)(
      "a save whose acknowledgement is lost (%s) answers the revision it landed at, not a conflict, and bumps the revision once",
      async (reply) => {
        const clean = await saveScenario(undefined);
        const retried = await saveScenario(afterTheWriteLands(reply));

        expect(retried).toEqual(clean);
        expect(retried.rows).toEqual([
          {
            schema_version: CURRENT_SCHEMA_VERSION,
            document: savedDocument,
            revision: "2",
          },
        ]);
      },
    );

    it.skipIf(!hasLiveDatabase).each(LOST_REPLIES)(
      "a save repeated after another writer moved the revision (%s) is still a conflict and changes nothing",
      async (reply) => {
        const { credentials } = await mintFreshDesign();
        const otherWritersDocument: Design = {
          ...KITCHEN_L_DESIGN,
          presetId: "other-writer",
        };
        await configurations().saveAuthorized(
          saveRequest(
            credentials.designId,
            credentials.writeTokenHash,
            credentials.visitorHash,
            otherWritersDocument,
            FIRST_REVISION,
          ),
        );

        const staleSave = withLostFirstReply(beforeTheWriteLands(reply), () =>
          configurations().saveAuthorized(
            saveRequest(
              credentials.designId,
              credentials.writeTokenHash,
              credentials.visitorHash,
              savedDocument,
              FIRST_REVISION,
            ),
          ),
        );

        await expect(staleSave).rejects.toBeInstanceOf(
          DesignWriteConflictError,
        );
        expect(
          withoutRunIdentity(await designRowsOf(credentials.visitorHash)),
        ).toEqual([
          {
            schema_version: CURRENT_SCHEMA_VERSION,
            document: otherWritersDocument,
            revision: "2",
          },
        ]);
      },
    );

    it.skipIf(!hasLiveDatabase)(
      "a first attempt at a stale revision is a conflict even when the stored document is the one it carries",
      async () => {
        const { credentials } = await mintFreshDesign();
        const request = (expectedRevision: string) =>
          saveRequest(
            credentials.designId,
            credentials.writeTokenHash,
            credentials.visitorHash,
            savedDocument,
            expectedRevision,
          );
        await configurations().saveAuthorized(request(FIRST_REVISION));

        await expect(
          configurations().saveAuthorized(request(FIRST_REVISION)),
        ).rejects.toBeInstanceOf(DesignWriteConflictError);
      },
    );

    it.skipIf(!hasLiveDatabase)(
      "a repeated save whose document is current only at a later revision is still a conflict",
      async () => {
        const { credentials } = await mintFreshDesign();
        const request = (design: Design, expectedRevision: string) =>
          saveRequest(
            credentials.designId,
            credentials.writeTokenHash,
            credentials.visitorHash,
            design,
            expectedRevision,
          );
        await configurations().saveAuthorized(request(savedDocument, "1"));
        await configurations().saveAuthorized(
          request({ ...KITCHEN_L_DESIGN, presetId: "in-between" }, "2"),
        );
        await configurations().saveAuthorized(request(savedDocument, "3"));

        const staleSave = withLostFirstReply(
          beforeTheWriteLands("empty-reply"),
          () => configurations().saveAuthorized(request(savedDocument, "1")),
        );

        await expect(staleSave).rejects.toBeInstanceOf(
          DesignWriteConflictError,
        );
      },
    );
  });

  describe("reads and answers that are not transient", () => {
    it.skipIf(!hasLiveDatabase).each(LOST_REPLIES)(
      "a read whose reply is lost (%s) returns the row once retried",
      async (reply) => {
        const { credentials } = await mintFreshDesign();

        const loaded = await withLostFirstReply(afterTheWriteLands(reply), () =>
          configurations().loadOwned({
            id: credentials.designId,
            visitorHash: credentials.visitorHash,
          }),
        );

        expect(loaded).toMatchObject({
          kind: "found",
          revision: FIRST_REVISION,
        });
      },
    );

    it.skipIf(!hasLiveDatabase)(
      "a unique violation from the real database reaches the caller on the first attempt",
      async () => {
        const { credentials } = await mintFreshDesign();
        const insertTakenId = vi.fn(
          () => neon(testDatabaseUrl)`
            insert into designs (id, schema_version, document, write_token_hash, visitor_hash)
            values (${credentials.designId}, 1, ${KITCHEN_L_DESIGN}, ${randomDigest()}, ${randomDigest()})
          `,
        );

        await expect(
          retryOnTransientFailure(insertTakenId),
        ).rejects.toMatchObject({
          code: "23505",
        });
        expect(insertTakenId).toHaveBeenCalledTimes(1);
      },
    );
  });
});
