import { fc } from "@fast-check/vitest";
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { DesignId } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { NeonConfigurationRepository } from "../src/neon-configuration-repository.js";
import { NeonShareLinkRepository } from "../src/share-link-repository.js";
import type { ShareLinkCredentials } from "../src/share-link-repository.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes share-link rows through a fresh design per test, and needs the schema
// intact while it does, but tolerates other shared runs (M7 wave 7E3c, D3).
holdSharedTestSchemaLock();

const SUITE_NAME = "NeonShareLinkRepository (live test database)";

const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

const WRITE_TOKEN_HASH = "1".repeat(64);
const VISITOR_HASH = "2".repeat(64);
const WRONG_WRITE_TOKEN_HASH = "3".repeat(64);
const WRONG_VISITOR_HASH = "4".repeat(64);
const UNKNOWN_DESIGN_ID = "qa-0006-no-such-design" as DesignId;

/** A fresh 64-character hex value on every call, never reused within this process — S2 never
 *  generates a token from a raw value itself (S3a's `share-token.ts`/`sha256-hex.ts` do that); this
 *  suite only exercises what the repository does with an already-hashed value, so a monotonic
 *  counter is exactly as good as a real digest and never risks a primary-key collision across a
 *  property test's shrink attempts. */
let tokenHashCounter = 0;
function nextTokenHash(): string {
  tokenHashCounter += 1;
  return tokenHashCounter.toString(16).padStart(64, "0");
}

describe(SUITE_NAME, () => {
  const mintedIds: DesignId[] = [];

  async function mintDesign(): Promise<ShareLinkCredentials> {
    const { id } = await new NeonConfigurationRepository(testDatabaseUrl).mint({
      design: KITCHEN_L_DESIGN,
      writeTokenHash: WRITE_TOKEN_HASH,
      visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
    });
    mintedIds.push(id);
    return {
      designId: id,
      writeTokenHash: WRITE_TOKEN_HASH,
      visitorHash: VISITOR_HASH,
    };
  }

  function repository(): NeonShareLinkRepository {
    return new NeonShareLinkRepository(testDatabaseUrl);
  }

  /** Rows fetched and counted in JS rather than with SQL's own aggregate: the census's destructive
   *  pattern reads a whole-table aggregate off a literal `count(*)`, and this one is per-design and
   *  never more than a handful of rows, so it does not need the exclusive lock that pattern exists
   *  to force onto a genuine whole-table count. */
  async function activeShareRowCount(designId: DesignId): Promise<number> {
    const rows = (await neon(testDatabaseUrl)`
      select token_hash from design_share_links
      where design_id = ${designId} and revoked_at is null
    `) as { token_hash: string }[];
    return rows.length;
  }

  beforeAll(async () => {
    if (hasLiveDatabase) await runMigrations(testDatabaseUrl);
  });

  afterEach(async () => {
    if (!hasLiveDatabase || mintedIds.length === 0) return;
    const ids = mintedIds.splice(0, mintedIds.length);
    // `on delete cascade` (0006) takes every share row with it, so this is the only cleanup needed.
    await neon(testDatabaseUrl)`delete from designs where id = any(${ids})`;
  });

  describe("issue", () => {
    it.skipIf(!hasLiveDatabase)(
      "issues an active link for an authorised design, findable by loadShared",
      async () => {
        const credentials = await mintDesign();
        const tokenHash = nextTokenHash();

        const outcome = await repository().issue({ ...credentials, tokenHash });

        expect(outcome).toBe("issued");
        const loaded = await repository().loadShared(tokenHash);
        expect(loaded).toEqual({ kind: "found", design: KITCHEN_L_DESIGN });
      },
    );

    it.skipIf(!hasLiveDatabase)(
      "refuses the wrong write-token hash, the wrong visitor hash and an unknown design, inserting nothing",
      async () => {
        const credentials = await mintDesign();

        const wrongToken = await repository().issue({
          ...credentials,
          writeTokenHash: WRONG_WRITE_TOKEN_HASH,
          tokenHash: nextTokenHash(),
        });
        const wrongVisitor = await repository().issue({
          ...credentials,
          visitorHash: WRONG_VISITOR_HASH,
          tokenHash: nextTokenHash(),
        });
        const unknownDesign = await repository().issue({
          ...credentials,
          designId: UNKNOWN_DESIGN_ID,
          tokenHash: nextTokenHash(),
        });

        expect([wrongToken, wrongVisitor, unknownDesign]).toEqual([
          "refused",
          "refused",
          "refused",
        ]);
        expect(await activeShareRowCount(credentials.designId)).toBe(0);
      },
    );

    it.skipIf(!hasLiveDatabase)(
      "revokes the previously active link when issuing a new one, so only the new one opens",
      async () => {
        const credentials = await mintDesign();
        const firstHash = nextTokenHash();
        const secondHash = nextTokenHash();

        await repository().issue({ ...credentials, tokenHash: firstHash });
        await repository().issue({ ...credentials, tokenHash: secondHash });

        expect(await repository().loadShared(firstHash)).toEqual({
          kind: "none",
        });
        expect(await repository().loadShared(secondHash)).toEqual({
          kind: "found",
          design: KITCHEN_L_DESIGN,
        });
        expect(await activeShareRowCount(credentials.designId)).toBe(1);
      },
    );

    it.skipIf(!hasLiveDatabase)(
      "throws rather than storing a token hash of the wrong shape",
      async () => {
        const credentials = await mintDesign();

        await expect(
          repository().issue({
            ...credentials,
            tokenHash: "not-a-sha256-digest",
          }),
        ).rejects.toThrow(/Refusing to issue a share link/);
      },
    );
  });

  describe("revoke", () => {
    it.skipIf(!hasLiveDatabase)("closes the active link", async () => {
      const credentials = await mintDesign();
      const tokenHash = nextTokenHash();
      await repository().issue({ ...credentials, tokenHash });

      const outcome = await repository().revoke(credentials);

      expect(outcome).toBe("revoked");
      expect(await repository().loadShared(tokenHash)).toEqual({
        kind: "none",
      });
      expect(await repository().status(credentials)).toEqual({ active: false });
    });

    it.skipIf(!hasLiveDatabase)(
      "is idempotent: revoking with nothing active still answers revoked",
      async () => {
        const credentials = await mintDesign();

        expect(await repository().revoke(credentials)).toBe("revoked");
        expect(await repository().revoke(credentials)).toBe("revoked");
      },
    );

    it.skipIf(!hasLiveDatabase)(
      "refuses the wrong credentials, leaving the active link untouched",
      async () => {
        const credentials = await mintDesign();
        const tokenHash = nextTokenHash();
        await repository().issue({ ...credentials, tokenHash });

        const outcome = await repository().revoke({
          ...credentials,
          writeTokenHash: WRONG_WRITE_TOKEN_HASH,
        });

        expect(outcome).toBe("refused");
        expect(await repository().status(credentials)).toEqual({
          active: true,
        });
      },
    );
  });

  describe("status", () => {
    it.skipIf(!hasLiveDatabase)(
      "reports active only between an issue and the revoke that follows it",
      async () => {
        const credentials = await mintDesign();

        expect(await repository().status(credentials)).toEqual({
          active: false,
        });
        await repository().issue({
          ...credentials,
          tokenHash: nextTokenHash(),
        });
        expect(await repository().status(credentials)).toEqual({
          active: true,
        });
        await repository().revoke(credentials);
        expect(await repository().status(credentials)).toEqual({
          active: false,
        });
      },
    );

    it.skipIf(!hasLiveDatabase)("refuses the wrong credentials", async () => {
      const credentials = await mintDesign();

      expect(
        await repository().status({
          ...credentials,
          visitorHash: WRONG_VISITOR_HASH,
        }),
      ).toBe("refused");
    });
  });

  describe("loadShared", () => {
    it.skipIf(!hasLiveDatabase)(
      "selects no id: the found outcome carries only the design",
      async () => {
        const credentials = await mintDesign();
        const tokenHash = nextTokenHash();
        await repository().issue({ ...credentials, tokenHash });

        const loaded = await repository().loadShared(tokenHash);

        expect(loaded.kind).toBe("found");
        expect(Object.keys(loaded)).toEqual(["kind", "design"]);
      },
    );

    it.skipIf(!hasLiveDatabase)(
      "returns none for a token nobody issued",
      async () => {
        expect(await repository().loadShared(nextTokenHash())).toEqual({
          kind: "none",
        });
      },
    );
  });

  it.skipIf(!hasLiveDatabase)(
    "never moves designs.document, revision or updated_at (D3, D8)",
    async () => {
      const credentials = await mintDesign();
      const before = await designSnapshot(credentials.designId);

      const tokenHash = nextTokenHash();
      await repository().issue({ ...credentials, tokenHash });
      await repository().status(credentials);
      await repository().loadShared(tokenHash);
      await repository().revoke(credentials);

      expect(await designSnapshot(credentials.designId)).toEqual(before);
    },
  );

  // Criterion 5's sequence property: at most one active row after any sequence of issues and
  // revokes, and a token opens iff it was the last issued and no revoke has followed it since. A
  // fresh design per run keeps runs independent; the small `numRuns` bounds the live round trips a
  // sweep like this costs (design-row-source.test.ts has no comparable precedent to size against).
  it.skipIf(!hasLiveDatabase)(
    "keeps at most one active link, and only the last-issued one open, over any sequence",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.constantFrom<"issue" | "revoke">("issue", "revoke"), {
            minLength: 1,
            maxLength: 8,
          }),
          async (actions) => {
            const credentials = await mintDesign();
            const issuedHashes: string[] = [];
            let activeHash: string | undefined;

            for (const action of actions) {
              if (action === "issue") {
                const tokenHash = nextTokenHash();
                issuedHashes.push(tokenHash);
                await repository().issue({ ...credentials, tokenHash });
                activeHash = tokenHash;
              } else {
                await repository().revoke(credentials);
                activeHash = undefined;
              }
            }

            expect(await activeShareRowCount(credentials.designId)).toBe(
              activeHash === undefined ? 0 : 1,
            );
            expect(await repository().status(credentials)).toEqual({
              active: activeHash !== undefined,
            });
            for (const hash of issuedHashes) {
              const expected = hash === activeHash ? "found" : "none";
              expect((await repository().loadShared(hash)).kind).toBe(expected);
            }
          },
        ),
        { seed: 20260923, numRuns: 15 },
      );
    },
  );
});

describe(`${SUITE_NAME} — adversarial QA (M7 wave 7E3c)`, () => {
  const mintedIds: DesignId[] = [];

  async function mintDesign(
    hashes: { writeTokenHash: string; visitorHash: string } = {
      writeTokenHash: WRITE_TOKEN_HASH,
      visitorHash: VISITOR_HASH,
    },
  ): Promise<ShareLinkCredentials> {
    const { id } = await new NeonConfigurationRepository(testDatabaseUrl).mint({
      design: KITCHEN_L_DESIGN,
      writeTokenHash: hashes.writeTokenHash,
      visitor: { kind: "fresh", visitorHash: hashes.visitorHash },
    });
    mintedIds.push(id);
    return { designId: id, ...hashes };
  }

  function repository(): NeonShareLinkRepository {
    return new NeonShareLinkRepository(testDatabaseUrl);
  }

  async function activeHashesOf(designId: DesignId): Promise<string[]> {
    const rows = (await neon(testDatabaseUrl)`
      select token_hash from design_share_links
      where design_id = ${designId} and revoked_at is null
    `) as { token_hash: string }[];
    return rows.map((row) => row.token_hash);
  }

  afterEach(async () => {
    if (!hasLiveDatabase || mintedIds.length === 0) return;
    const ids = mintedIds.splice(0, mintedIds.length);
    await neon(testDatabaseUrl)`delete from designs where id = any(${ids})`;
  });

  it.skipIf(!hasLiveDatabase)(
    "a refused issue never revokes the owner's active link, whichever credential is wrong",
    async () => {
      const credentials = await mintDesign();
      const ownersHash = nextTokenHash();
      await repository().issue({ ...credentials, tokenHash: ownersHash });

      const refusals = await Promise.all([
        repository().issue({
          ...credentials,
          writeTokenHash: WRONG_WRITE_TOKEN_HASH,
          tokenHash: nextTokenHash(),
        }),
        repository().issue({
          ...credentials,
          visitorHash: WRONG_VISITOR_HASH,
          tokenHash: nextTokenHash(),
        }),
      ]);

      expect(refusals).toEqual(["refused", "refused"]);
      expect(await activeHashesOf(credentials.designId)).toEqual([ownersHash]);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "one design's full credential pair, aimed at another design's id, is refused by every method",
    async () => {
      const attacker = await mintDesign();
      const victim = await mintDesign({
        writeTokenHash: "5".repeat(64),
        visitorHash: "6".repeat(64),
      });
      const victimsHash = nextTokenHash();
      await repository().issue({ ...victim, tokenHash: victimsHash });
      const crossed = { ...attacker, designId: victim.designId };

      expect(
        await repository().issue({ ...crossed, tokenHash: nextTokenHash() }),
      ).toBe("refused");
      expect(await repository().revoke(crossed)).toBe("refused");
      expect(await repository().status(crossed)).toBe("refused");
      expect(await activeHashesOf(victim.designId)).toEqual([victimsHash]);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "five concurrent issues all succeed and leave exactly one active row, the only token that opens",
    async () => {
      const credentials = await mintDesign();
      const hashes = Array.from({ length: 5 }, () => nextTokenHash());

      const outcomes = await Promise.all(
        hashes.map((tokenHash) =>
          repository().issue({ ...credentials, tokenHash }),
        ),
      );

      expect(outcomes).toEqual(hashes.map(() => "issued"));
      const active = await activeHashesOf(credentials.designId);
      expect(active).toHaveLength(1);
      const opened = [];
      for (const hash of hashes) {
        if ((await repository().loadShared(hash)).kind === "found")
          opened.push(hash);
      }
      expect(opened).toEqual(active);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "issue racing revoke never leaves more than one active row, and status agrees with the table",
    async () => {
      const credentials = await mintDesign();
      for (let round = 0; round < 6; round += 1) {
        await Promise.all([
          repository().issue({ ...credentials, tokenHash: nextTokenHash() }),
          repository().revoke(credentials),
          repository().issue({ ...credentials, tokenHash: nextTokenHash() }),
        ]);
        const active = await activeHashesOf(credentials.designId);
        expect(active.length).toBeLessThanOrEqual(1);
        expect(await repository().status(credentials)).toEqual({
          active: active.length === 1,
        });
      }
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "a read that begins after revoke resolves never finds the design, even under concurrent reads",
    async () => {
      const credentials = await mintDesign();
      const tokenHash = nextTokenHash();
      await repository().issue({ ...credentials, tokenHash });

      const racingReads = Array.from({ length: 4 }, () =>
        repository().loadShared(tokenHash),
      );
      await repository().revoke(credentials);
      const laterReads = await Promise.all(
        Array.from({ length: 4 }, () => repository().loadShared(tokenHash)),
      );
      await Promise.all(racingReads);

      expect(laterReads.map((read) => read.kind)).toEqual([
        "none",
        "none",
        "none",
        "none",
      ]);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "loadShared matches the stored digest exactly: an uppercase or truncated form of a live hash finds nothing",
    async () => {
      const credentials = await mintDesign();
      const tokenHash = "ab".repeat(32);
      await repository().issue({ ...credentials, tokenHash });

      expect((await repository().loadShared(tokenHash)).kind).toBe("found");
      expect(
        (await repository().loadShared(tokenHash.toUpperCase())).kind,
      ).toBe("none");
      expect((await repository().loadShared(tokenHash.slice(0, 63))).kind).toBe(
        "none",
      );
      expect((await repository().loadShared("")).kind).toBe("none");
    },
  );
});

/** Everything a share operation must never move, read once by id rather than through either
 *  repository (so a bug in one cannot mask itself when the test reads it back through the same
 *  bug). */
async function designSnapshot(
  id: DesignId,
): Promise<{ document: unknown; revision: string; updated_at: string }> {
  const rows = (await neon(testDatabaseUrl)`
    select document, revision::text as revision, updated_at::text as updated_at
    from designs where id = ${id}
  `) as { document: unknown; revision: string; updated_at: string }[];
  const row = rows[0];
  if (!row) throw new Error(`No row for id "${id}"`);
  return row;
}
