import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, describe, expect, it } from "vitest";

import type { HeldProfileColumns } from "../src/fake-account-store.js";
import { NeonAccountStore } from "../src/neon-account-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import {
  describeProfileFillContract,
  REQUEST_FILL,
  type ProfileFillWorld,
  type ProfileSeed,
} from "./support/profile-fill-contract.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: every row is minted under a random id and read back by it, and no assertion reads a whole-table figure.
holdSharedTestSchemaLock();

const SUITE_NAME = "NeonAccountStore.fillProfileBlanks (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/**
 * The statement against the test database, with the contract the fake also passes. It runs over the test database's
 * **owner** credential, so this file shows what the statement does with rows and not what the application role may
 * update (`0017` and `0012` grant that, and the privilege test reads the grants from the catalog).
 *
 * A Neon HTTP statement commits, so nothing here can be rolled back. Every account is minted under a random id and
 * `afterAll` deletes by those ids only, on the test database alone (ADR 0151).
 */
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const MARKER_BYTES = 6;
const LONG_AGO = "2000-01-01T00:00:00.000Z";

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  /** Opened per use: a skipped describe still runs this body. */
  const sql = () => neon(liveTestDatabaseUrl);
  const accountIds: string[] = [];
  const marker = randomBytes(MARKER_BYTES).toString("hex");
  let accountCount = 0;

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await sql()`delete from accounts where id = any(${accountIds})`;
  });

  async function anAccount(seed: ProfileSeed): Promise<string> {
    const accountId = nanoid();
    accountCount += 1;
    const email = `fill-${marker}-${String(accountCount)}@example.invalid`;
    accountIds.push(accountId);
    await sql()`
      insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version,
        name, address, phone, phone_normal_form, updated_at)
      values (${accountId}, ${email}, ${email}, ${PASSWORD_HASH}, 'client', 'ro', '1',
        ${seed.name}, ${seed.address}, ${seed.phone?.entered ?? null}, ${seed.phone?.normalForm ?? null}, ${LONG_AGO})
    `;
    return accountId;
  }

  async function columnsOf(accountId: string): Promise<HeldProfileColumns> {
    const rows = await sql()`
      select name, address, phone, phone_normal_form from accounts where id = ${accountId}
    `;
    const [row] = rows;
    if (row === undefined) throw new Error("no such account");
    return {
      name: row["name"] as string | null,
      address: row["address"] as string | null,
      phone: row["phone"] as string | null,
      phoneNormalForm: row["phone_normal_form"] as string | null,
    };
  }

  async function updatedAtOf(accountId: string): Promise<Date> {
    const rows =
      await sql()`select updated_at from accounts where id = ${accountId}`;
    return new Date(rows[0]?.["updated_at"] as string);
  }

  /** Made inside a test, so a run with no database never constructs it. */
  const storeOf = () => new NeonAccountStore(liveTestDatabaseUrl);
  const aWorld = (): ProfileFillWorld => ({
    store: storeOf(),
    anAccount,
    columnsOf,
  });

  describeProfileFillContract("the contract", aWorld);

  describe("updated_at", () => {
    it("moves when a blank is filled", async () => {
      const accountId = await anAccount({
        name: null,
        address: "Held Address",
        phone: { entered: "078 111 222", normalForm: "+37378111222" },
      });

      await storeOf().fillProfileBlanks({ accountId, fill: REQUEST_FILL });

      expect((await updatedAtOf(accountId)).getTime()).toBeGreaterThan(
        new Date(LONG_AGO).getTime(),
      );
    });

    it("stays where it was when the request has nothing to fill", async () => {
      const accountId = await anAccount({
        name: "Held Name",
        address: "Held Address",
        phone: { entered: "078 111 222", normalForm: "+37378111222" },
      });

      await storeOf().fillProfileBlanks({ accountId, fill: REQUEST_FILL });

      expect((await updatedAtOf(accountId)).toISOString()).toBe(LONG_AGO);
    });

    it("stays where it was when the only blank is an address the request does not carry", async () => {
      const accountId = await anAccount({
        name: "Held Name",
        address: null,
        phone: { entered: "078 111 222", normalForm: "+37378111222" },
      });

      await storeOf().fillProfileBlanks({
        accountId,
        fill: { ...REQUEST_FILL, address: undefined },
      });

      expect((await updatedAtOf(accountId)).toISOString()).toBe(LONG_AGO);
    });
  });
});
