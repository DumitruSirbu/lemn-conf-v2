import { randomBytes } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import type { DesignId } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { afterAll, describe, expect, it } from "vitest";

import { generateDesignId } from "../src/generate-design-id.js";
import {
  NeonAccountKitchenStore,
  NeonSentMarkStore,
} from "../src/neon-account-kitchen-store.js";
import {
  DesignWriteForbiddenError,
  NeonConfigurationRepository,
} from "../src/neon-configuration-repository.js";
import type { SaveCredential } from "../src/neon-configuration-repository.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes rows under ids only it makes and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME =
  "NeonConfigurationRepository.loadEditable (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/**
 * `loadEditable` against the test database (M10 wave S7). The port reads a design under exactly the credential a save
 * would use, so its truth is `saveAuthorized`'s: the first describe holds the two to one table and asserts each row's
 * expected outcome by name, so a fixture that made both sides refuse would fail on the expectation rather than agree.
 *
 * A Neon HTTP statement commits, so nothing here can be rolled back. Every row names a design id this file minted at
 * random, and `afterAll` deletes by those ids only, on the test database alone (ADR 0151). The database is shared, so
 * no assertion reads a whole-table figure. The connection is the test database's owner, which may plant a row with a
 * mark or a sent instant that the application role would reach only through its own statements.
 */
const FIRST_REVISION = "1";
const DUPLICATE_NAME = "Copie";

interface PlantedRow {
  readonly id: DesignId;
  readonly writeTokenHash: string | null;
  readonly accountId: string | null;
}

interface RowSpec {
  readonly hasWriteToken?: boolean;
  readonly visitorHash?: string | null;
  readonly accountId?: string | null;
  readonly isHidden?: boolean;
  readonly isDeleted?: boolean;
  readonly isSent?: boolean;
}

type CredentialFor = (row: PlantedRow, other: PlantedRow) => SaveCredential;
type SaveVerdict = "lands" | "forbidden";

interface ParityRow {
  readonly label: string;
  readonly spec: RowSpec;
  readonly credentialFor: CredentialFor;
  readonly expected: "found" | "none";
}

const randomHash = (): string => randomBytes(32).toString("hex");
const randomAccountId = (): string => generateDesignId();
const ownToken: CredentialFor = (row) => tokenCredential(row.writeTokenHash);
const ownAccount: CredentialFor = (row) => ({
  kind: "account",
  accountId: row.accountId ?? "",
});

function tokenCredential(hash: string | null): SaveCredential {
  return { kind: "write-token", hash: hash ?? randomHash() };
}

const PARITY_TABLE: readonly ParityRow[] = [
  {
    label: "the right token",
    spec: {},
    credentialFor: ownToken,
    expected: "found",
  },
  {
    label: "the right token on a row an account also owns",
    spec: { accountId: randomAccountId() },
    credentialFor: ownToken,
    expected: "found",
  },
  {
    label: "another design's token",
    spec: {},
    credentialFor: (_row, other) => tokenCredential(other.writeTokenHash),
    expected: "none",
  },
  {
    label: "a wrong token",
    spec: {},
    credentialFor: () => tokenCredential(null),
    expected: "none",
  },
  {
    label: "the right token on a hidden row",
    spec: { isHidden: true },
    credentialFor: ownToken,
    expected: "none",
  },
  {
    label: "the right token on a deleted row",
    spec: { isDeleted: true },
    credentialFor: ownToken,
    expected: "none",
  },
  {
    label: "a token on a row whose write_token_hash is null",
    spec: { hasWriteToken: false },
    credentialFor: () => tokenCredential(null),
    expected: "none",
  },
  {
    label: "the owning account",
    spec: { accountId: randomAccountId() },
    credentialFor: ownAccount,
    expected: "found",
  },
  {
    label: "an account on an unclaimed row",
    spec: {},
    credentialFor: () => ({ kind: "account", accountId: randomAccountId() }),
    expected: "none",
  },
  {
    label: "another account's row",
    spec: { accountId: randomAccountId() },
    credentialFor: () => ({ kind: "account", accountId: randomAccountId() }),
    expected: "none",
  },
  {
    label: "the owning account on a hidden row",
    spec: { accountId: randomAccountId(), isHidden: true },
    credentialFor: ownAccount,
    expected: "none",
  },
  {
    label: "the owning account on a deleted row",
    spec: { accountId: randomAccountId(), isDeleted: true },
    credentialFor: ownAccount,
    expected: "none",
  },
];

/** The shapes the save's own adversarial file throws at its predicate, minus those no `text` column can hold. */
const HOSTILE_SHAPES = [
  "",
  " ",
  "' or '1'='1",
  "x'; --",
  "' or write_token_hash is not null --",
  "NULL",
  "%",
  "_".repeat(64),
  "a".repeat(10_000),
];

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const plantedIds: DesignId[] = [];
  const repository = () => new NeonConfigurationRepository(liveTestDatabaseUrl);
  const owner = () => neon(liveTestDatabaseUrl);

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await owner()`delete from designs where id = any(${plantedIds})`;
  });

  async function plant(spec: RowSpec = {}): Promise<PlantedRow> {
    const id = generateDesignId();
    const writeTokenHash = spec.hasWriteToken === false ? null : randomHash();
    const accountId = spec.accountId ?? null;
    plantedIds.push(id);
    await owner()`
      insert into designs (id, schema_version, document, write_token_hash, visitor_hash, account_id,
        hidden_by_client_at, deleted_by_client_at, sent_at)
      values (${id}, ${CURRENT_SCHEMA_VERSION}, ${JSON.stringify(KITCHEN_L_DESIGN)}::jsonb, ${writeTokenHash},
        ${spec.visitorHash === undefined ? randomHash() : spec.visitorHash}, ${accountId},
        case when ${spec.isHidden ?? false}::boolean then now() end,
        case when ${spec.isDeleted ?? false}::boolean then now() end,
        case when ${spec.isSent ?? false}::boolean then now() end)
    `;
    return { id, writeTokenHash, accountId };
  }

  /** The row's revision by the ungated read, so a save of it can only be refused for its credential, never as stale. */
  async function revisionOf(id: DesignId): Promise<string> {
    return (await repository().load(id)).revision;
  }

  async function saveVerdict(
    id: DesignId,
    credential: SaveCredential,
  ): Promise<SaveVerdict> {
    try {
      await repository().saveAuthorized({
        id,
        design: KITCHEN_L_DESIGN,
        credential,
        expectedRevision: await revisionOf(id),
        requestVisitor: { kind: "absent" },
      });
      return "lands";
    } catch (error) {
      if (error instanceof DesignWriteForbiddenError) return "forbidden";
      throw error;
    }
  }

  async function storedRow(
    id: DesignId,
  ): Promise<{ revision: string; updatedAt: string; document: string }> {
    // Text, not the driver's `Date`: a Date has second resolution, so a bumped timestamp could look unchanged.
    const rows = (await owner()`
      select revision::text as revision, updated_at::text as updated_at, document::text as document
      from designs where id = ${id}
    `) as { revision: string; updated_at: string; document: string }[];
    const row = rows[0];
    if (!row) throw new Error(`the planted row ${id} is gone`);
    return {
      revision: row.revision,
      updatedAt: row.updated_at,
      document: row.document,
    };
  }

  describe("S7-a: found if and only if a save with the same credential lands", () => {
    it.each(PARITY_TABLE.map((row) => [row.label, row] as const))(
      "%s",
      async (_label, { spec, credentialFor, expected }) => {
        const row = await plant(spec);
        const other = await plant();
        const credential = credentialFor(row, other);

        const outcome = await repository().loadEditable({
          id: row.id,
          credential,
        });
        const verdict = await saveVerdict(row.id, credential);

        expect(outcome.kind).toBe(expected);
        expect(verdict).toBe(expected === "found" ? "lands" : "forbidden");
      },
    );

    it("a design that does not exist is none, as a save of it is forbidden", async () => {
      const missing = generateDesignId();
      const credential = tokenCredential(null);

      await expect(
        repository().loadEditable({ id: missing, credential }),
      ).resolves.toEqual({ kind: "none" });
      await expect(
        repository().saveAuthorized({
          id: missing,
          design: KITCHEN_L_DESIGN,
          credential,
          expectedRevision: FIRST_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toBeInstanceOf(DesignWriteForbiddenError);
    });
  });

  describe("S7-b: the token arm asks for no visitor", () => {
    it.each([
      ["a visitor that matches no cookie", randomHash()],
      ["no visitor at all", null],
    ])(
      "finds %s by the token alone, where loadAuthorized answers none",
      async (_label, visitorHash) => {
        const row = await plant({ visitorHash });
        const writeTokenHash = row.writeTokenHash ?? "";

        const editable = await repository().loadEditable({
          id: row.id,
          credential: { kind: "write-token", hash: writeTokenHash },
        });
        const authorized = await repository().loadAuthorized({
          id: row.id,
          writeTokenHash,
          visitorHash: randomHash(),
        });

        expect(editable.kind).toBe("found");
        expect(authorized).toEqual({ kind: "none" });
      },
    );

    it("returns the design and the revision the row stands at", async () => {
      const row = await plant();

      const outcome = await repository().loadEditable({
        id: row.id,
        credential: tokenCredential(row.writeTokenHash),
      });

      expect(outcome).toEqual({
        kind: "found",
        design: KITCHEN_L_DESIGN,
        revision: FIRST_REVISION,
        isSent: false,
      });
    });
  });

  describe("S7-c: isSent is sent_at is not null, and a sent mark is never cleared", () => {
    it("is false before markSent and true after it, on both arms", async () => {
      const accountId = randomAccountId();
      const row = await plant({ accountId });
      const byToken = {
        kind: "write-token",
        hash: row.writeTokenHash ?? "",
      } as const;
      const byAccount = { kind: "account", accountId } as const;
      const isSent = async (credential: SaveCredential) => {
        const outcome = await repository().loadEditable({
          id: row.id,
          credential,
        });
        if (outcome.kind !== "found") throw new Error("the row was not found");
        return outcome.isSent;
      };

      const before = [await isSent(byToken), await isSent(byAccount)];
      await new NeonSentMarkStore(liveTestDatabaseUrl).markSent(row.id);
      const after = [await isSent(byToken), await isSent(byAccount)];

      expect(before).toEqual([false, false]);
      expect(after).toEqual([true, true]);
    });

    it("stays true after a later save: a sent kitchen that is edited is still sent", async () => {
      const row = await plant({ isSent: true });
      const credential = tokenCredential(row.writeTokenHash);
      const saved = await repository().saveAuthorized({
        id: row.id,
        design: KITCHEN_L_DESIGN,
        credential,
        expectedRevision: FIRST_REVISION,
        requestVisitor: { kind: "absent" },
      });

      const outcome = await repository().loadEditable({
        id: row.id,
        credential,
      });

      expect(saved.revision).not.toBe(FIRST_REVISION);
      expect(outcome).toMatchObject({
        kind: "found",
        revision: saved.revision,
        isSent: true,
      });
    });

    it("reads false for a duplicate of a sent design", async () => {
      const accountId = randomAccountId();
      const source = await plant({ accountId, isSent: true });

      const duplication = await new NeonAccountKitchenStore(
        liveTestDatabaseUrl,
      ).duplicate({ accountId, designId: source.id, name: DUPLICATE_NAME });
      if (duplication.kind !== "duplicated")
        throw new Error("the sent kitchen was not duplicated");
      plantedIds.push(duplication.id);

      const copy = await repository().loadEditable({
        id: duplication.id,
        credential: { kind: "account", accountId },
      });
      const original = await repository().loadEditable({
        id: source.id,
        credential: { kind: "account", accountId },
      });

      expect(copy).toMatchObject({ kind: "found", isSent: false });
      expect(original).toMatchObject({ kind: "found", isSent: true });
    });
  });

  describe("S7-d: loadEditable writes nothing", () => {
    it.each([
      [
        "a match by token",
        (row: PlantedRow) => tokenCredential(row.writeTokenHash),
      ],
      ["a match by account", (row: PlantedRow) => ownAccount(row, row)],
      ["a refusal", () => tokenCredential(null)],
    ] as const)(
      "leaves revision, updated_at and document as they were on %s",
      async (_label, credentialOf) => {
        const row = await plant({ accountId: randomAccountId(), isSent: true });
        const before = await storedRow(row.id);

        await repository().loadEditable({
          id: row.id,
          credential: credentialOf(row),
        });

        expect(await storedRow(row.id)).toEqual(before);
      },
    );
  });

  describe("S7-e: a wrong-shaped id, hash or account id answers none and never throws", () => {
    it.each(
      HOSTILE_SHAPES.map(
        (shape) => [JSON.stringify(shape.slice(0, 24)), shape] as const,
      ),
    )("%s, as a save of it is forbidden", async (_label, shape) => {
      const row = await plant({ accountId: randomAccountId() });
      const hostile: readonly { id: DesignId; credential: SaveCredential }[] = [
        { id: row.id, credential: { kind: "write-token", hash: shape } },
        { id: row.id, credential: { kind: "account", accountId: shape } },
        { id: shape, credential: tokenCredential(row.writeTokenHash) },
        { id: shape, credential: ownAccount(row, row) },
      ];

      for (const { id, credential } of hostile) {
        await expect(
          repository().loadEditable({ id, credential }),
        ).resolves.toEqual({ kind: "none" });
        await expect(
          repository().saveAuthorized({
            id,
            design: KITCHEN_L_DESIGN,
            credential,
            expectedRevision: FIRST_REVISION,
            requestVisitor: { kind: "absent" },
          }),
        ).rejects.toBeInstanceOf(DesignWriteForbiddenError);
      }
    });
  });
});
