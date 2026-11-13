import { randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, describe, expect, it } from "vitest";

import { NeonAccountStore } from "../src/neon-account-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: every row is minted under a random id and read back by it, and no assertion reads a whole-table figure.
holdSharedTestSchemaLock();

const SUITE_NAME =
  "NeonAccountStore.fillProfileBlanks under concurrency and at the column bounds (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/** A save and a fill run concurrently, and the column bounds (ADR 0179 d2); rows are minted and removed by id (ADR 0151). */
const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const MARKER_BYTES = 6;
const RACE_ROUNDS = 12;
const RACE_TIMEOUT_MS = 60_000;
const SAVED = {
  name: "Saved In Another Tab",
  phone: "079 555 666",
  phoneNormalForm: "+37379555666",
} as const;
const FIRST_REQUEST = {
  name: "First Request Name",
  address: "First Request Locality",
  phone: { entered: "069 000 111", normalForm: "+37369000111" },
} as const;
const SECOND_REQUEST = {
  name: "Second Request Name",
  address: "Second Request Locality",
  phone: { entered: "068 222 333", normalForm: "+37368222333" },
} as const;
const COLUMNS_OF_NO_PROFILE = {
  name: null,
  address: null,
  phone: null,
  phoneNormalForm: null,
};

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const sql = () => neon(liveTestDatabaseUrl);
  const accountIds: string[] = [];
  const marker = randomBytes(MARKER_BYTES).toString("hex");
  let accountCount = 0;

  afterAll(async () => {
    if (!isLiveTestDatabaseConfigured) return;
    await sql()`delete from accounts where id = any(${accountIds})`;
  });

  async function aBlankAccount(): Promise<string> {
    const accountId = nanoid();
    accountCount += 1;
    const email = `fill-qa-${marker}-${String(accountCount)}@example.invalid`;
    accountIds.push(accountId);
    await sql()`
      insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version)
      values (${accountId}, ${email}, ${email}, ${PASSWORD_HASH}, 'client', 'ro', '1')
    `;
    return accountId;
  }

  async function columnsOf(accountId: string) {
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

  const storeOf = () => new NeonAccountStore(liveTestDatabaseUrl);

  it(
    "a profile save racing a fill, from two connections, is never overwritten and never half-written",
    async () => {
      for (let round = 0; round < RACE_ROUNDS; round += 1) {
        const accountId = await aBlankAccount();

        await Promise.all([
          storeOf().updateProfile({
            accountId,
            changes: {
              name: SAVED.name,
              phone: {
                phone: SAVED.phone,
                phoneNormalForm: SAVED.phoneNormalForm,
              },
            },
          }),
          storeOf().fillProfileBlanks({ accountId, fill: FIRST_REQUEST }),
        ]);

        expect(await columnsOf(accountId)).toEqual({
          name: SAVED.name,
          address: FIRST_REQUEST.address,
          phone: SAVED.phone,
          phoneNormalForm: SAVED.phoneNormalForm,
        });
      }
    },
    RACE_TIMEOUT_MS,
  );

  it(
    "two fills racing on a blank profile leave every column from one request, never a mixture",
    async () => {
      const fromFirst = {
        name: FIRST_REQUEST.name,
        address: FIRST_REQUEST.address,
        phone: FIRST_REQUEST.phone.entered,
        phoneNormalForm: FIRST_REQUEST.phone.normalForm,
      };
      const fromSecond = {
        name: SECOND_REQUEST.name,
        address: SECOND_REQUEST.address,
        phone: SECOND_REQUEST.phone.entered,
        phoneNormalForm: SECOND_REQUEST.phone.normalForm,
      };
      for (let round = 0; round < RACE_ROUNDS; round += 1) {
        const accountId = await aBlankAccount();

        await Promise.all([
          storeOf().fillProfileBlanks({ accountId, fill: FIRST_REQUEST }),
          storeOf().fillProfileBlanks({ accountId, fill: SECOND_REQUEST }),
        ]);

        expect([fromFirst, fromSecond]).toContainEqual(
          await columnsOf(accountId),
        );
      }
    },
    RACE_TIMEOUT_MS,
  );

  it("writes a name and an address of 100 code points of the widest character and a phone of 32 characters", async () => {
    const accountId = await aBlankAccount();
    const widest = "\u{1F373}".repeat(100);
    const longestPhone = `+373 ${"7".repeat(10)}${" ".repeat(32 - 5 - 10)}`;

    const outcome = await storeOf().fillProfileBlanks({
      accountId,
      fill: {
        name: widest,
        address: widest,
        phone: { entered: longestPhone, normalForm: "+373777777777" },
      },
    });

    expect(outcome).toEqual({ kind: "filled" });
    expect(await columnsOf(accountId)).toEqual({
      name: widest,
      address: widest,
      phone: longestPhone,
      phoneNormalForm: "+373777777777",
    });
  });

  it("leaves a neighbour minted beside it untouched by a fill of the other", async () => {
    const filled = await aBlankAccount();
    const neighbour = await aBlankAccount();

    await storeOf().fillProfileBlanks({
      accountId: filled,
      fill: FIRST_REQUEST,
    });

    expect(await columnsOf(neighbour)).toEqual(COLUMNS_OF_NO_PROFILE);
  });
});
