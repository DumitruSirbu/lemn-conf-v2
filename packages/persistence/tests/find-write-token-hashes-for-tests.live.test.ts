import { randomBytes } from "node:crypto";

import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteDesignsForTests } from "../src/delete-designs-for-tests.js";
import { findWriteTokenHashesForTests } from "../src/find-write-token-hashes-for-tests.js";
import { runMigrations } from "../src/migrate.js";
import { NeonConfigurationRepository } from "../src/neon-configuration-repository.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file mints designs under hashes of its own and needs the schema intact while it does.
holdSharedTestSchemaLock();

const SUITE_NAME = "findWriteTokenHashesForTests (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const mintedIds: string[] = [];

function newHash(): string {
  return randomBytes(32).toString("hex");
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const repository = () => new NeonConfigurationRepository(liveTestDatabaseUrl);

  async function mintUnder(writeTokenHash: string): Promise<string> {
    const minted = await repository().mint({
      design: KITCHEN_L_DESIGN,
      writeTokenHash,
      visitor: { kind: "fresh", visitorHash: newHash() },
    });
    mintedIds.push(minted.id);
    return minted.id;
  }

  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
  });

  afterAll(async () => {
    await deleteDesignsForTests(mintedIds);
  });

  it("answers the hash of each design it is handed, and of no design it is not", async () => {
    const [handedHash, otherHandedHash, bystanderHash] = [
      newHash(),
      newHash(),
      newHash(),
    ];
    const handed = await mintUnder(handedHash);
    const otherHanded = await mintUnder(otherHandedHash);
    await mintUnder(bystanderHash);

    const answered = await findWriteTokenHashesForTests([handed, otherHanded]);

    expect([...answered].sort()).toEqual([handedHash, otherHandedHash].sort());
    expect(answered).not.toContain(bystanderHash);
  });

  it("answers nothing for an id that has no design", async () => {
    expect(
      await findWriteTokenHashesForTests([
        `no-such-design-${newHash().slice(0, 8)}`,
      ]),
    ).toEqual([]);
  });

  it("changes no row: the same read twice answers the same, and the designs are as they were", async () => {
    const hash = newHash();
    const id = await mintUnder(hash);

    const first = await findWriteTokenHashesForTests([id]);
    const second = await findWriteTokenHashesForTests([id]);
    const loaded = await repository().load(id);

    expect([first, second]).toEqual([[hash], [hash]]);
    expect(loaded.design).toEqual(KITCHEN_L_DESIGN);
  });
});
