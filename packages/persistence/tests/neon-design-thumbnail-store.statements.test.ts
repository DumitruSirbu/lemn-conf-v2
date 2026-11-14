import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DesignThumbnailStoreError } from "../src/design-thumbnail-store.js";
import type { DesignThumbnailStoreFailure } from "../src/design-thumbnail-store.js";
import { NeonDesignThumbnailStore } from "../src/neon-design-thumbnail-store.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import type { SentQuery } from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";
import { thumbnailBytes } from "./support/valid-thumbnail-bytes.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The text of the statements `NeonDesignThumbnailStore` sends, read as the driver receives them, with no database, and what
 * the store does with each reply. What a statement does with a row is the live file's to show
 * (`neon-design-thumbnail-store.live.test.ts`); this file pins the clauses that are conditions: the marks, the account,
 * each credential's own predicate, the lock, the guard that only a greater revision replaces a row, and no column the
 * grant of `0030` leaves out.
 */
const SECRET = "DRIVER-TEXT-SECRET-91d4";
const DESIGN_ID = "D".repeat(21);
const ACCOUNT_ID = "A".repeat(21);
const TOKEN_HASH = "ab".repeat(32);
const IMAGE = thumbnailBytes("image/webp", [0, 1, 254, 255]);
const IMAGE_HEX =
  "524946461a00000057454250565038200a0000000000009d012a8002e0010001feff";

const TOKEN_WRITE = {
  designId: DESIGN_ID,
  credential: { kind: "write-token", hash: TOKEN_HASH },
  revision: "7",
  image: IMAGE,
  type: "image/webp",
} as const;

const ACCOUNT_WRITE = {
  ...TOKEN_WRITE,
  credential: { kind: "account", accountId: ACCOUNT_ID },
} as const;

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newStore(): NeonDesignThumbnailStore {
  return new NeonDesignThumbnailStore(WELL_FORMED_UNREACHABLE_VALUE);
}

function loneStatement(): SentQuery {
  const [statement, ...others] = queryDriver.statements;
  if (statement === undefined || others.length > 0) {
    throw new Error("the call did not send exactly one lone statement");
  }
  expect(queryDriver.transactions).toHaveLength(0);
  return statement;
}

function aDriverError(code: string) {
  return Object.assign(new Error(`driver text ${SECRET}`), {
    name: "NeonDbError",
    code,
  });
}

async function failureOf(
  call: () => Promise<unknown>,
  failure: DesignThumbnailStoreFailure,
): Promise<DesignThumbnailStoreError> {
  const rejection = await rejectionOf(call());
  expect(rejection).toBeInstanceOf(DesignThumbnailStoreError);
  expect((rejection as DesignThumbnailStoreError).failure).toBe(failure);
  return rejection as DesignThumbnailStoreError;
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("storing a thumbnail", () => {
  it("is one statement that reads the design under its marks and its account, for share, and writes only what it matched", async () => {
    answerQueryWith([{ is_matched: true, is_current: true }]);

    await newStore().storeThumbnail(TOKEN_WRITE);

    expect(normalised(loneStatement())).toBe(
      "with matched as ( select d.id, d.revision from designs d where d.id = ? and d.account_id is not null " +
        "and d.hidden_by_client_at is null and d.deleted_by_client_at is null and d.write_token_hash = ? for share of d ), " +
        "written as ( insert into design_thumbnails as t (design_id, revision, image, image_type) " +
        "select m.id, ?::bigint, decode(?::text, 'hex'), ?::text from matched m where m.revision = ?::bigint " +
        "on conflict (design_id) do update set revision = excluded.revision, image = excluded.image, " +
        "image_type = excluded.image_type, captured_at = now() where t.revision < excluded.revision returning t.design_id ) " +
        "select exists (select 1 from matched) as is_matched, " +
        "exists (select 1 from matched m where m.revision = ?::bigint) as is_current",
    );
  });

  it("replaces an existing row only where the stored revision is lower, and compares revisions in SQL as bigint", async () => {
    answerQueryWith([{ is_matched: true, is_current: true }]);

    await newStore().storeThumbnail(TOKEN_WRITE);

    const text = normalised(loneStatement());
    expect(text).toContain("where t.revision < excluded.revision");
    expect(text).toContain("where m.revision = ?::bigint");
  });

  it("binds the token arm's hash and nothing of the account arm, and the other way round", async () => {
    answerQueryWith([{ is_matched: true, is_current: true }]);
    await newStore().storeThumbnail(TOKEN_WRITE);
    const tokenArm = loneStatement();
    resetQueryDriver();
    answerQueryWith([{ is_matched: true, is_current: true }]);
    await newStore().storeThumbnail(ACCOUNT_WRITE);
    const accountArm = loneStatement();

    expect(normalised(tokenArm)).toContain("and d.write_token_hash = ?");
    expect(normalised(tokenArm)).not.toMatch(/d\.account_id = \?/);
    expect(tokenArm.values).toEqual([
      DESIGN_ID,
      TOKEN_HASH,
      "7",
      IMAGE_HEX,
      "image/webp",
      "7",
      "7",
    ]);
    expect(normalised(accountArm)).toContain("and d.account_id = ?");
    expect(normalised(accountArm)).not.toContain("write_token_hash");
    expect(accountArm.values).toEqual([
      DESIGN_ID,
      ACCOUNT_ID,
      "7",
      IMAGE_HEX,
      "image/webp",
      "7",
      "7",
    ]);
  });

  it("sends every value as a parameter and never in the text, and writes no column the grant leaves out", async () => {
    answerQueryWith([{ is_matched: true, is_current: true }]);

    await newStore().storeThumbnail(TOKEN_WRITE);

    const statement = loneStatement();
    for (const value of [DESIGN_ID, TOKEN_HASH, IMAGE_HEX, "image/webp"]) {
      expect(statement.text).not.toContain(value);
    }
    const assigned = [
      ...normalised(statement).matchAll(/\bset (.*?) where t\.revision/g),
    ].flatMap(([, assignments]) =>
      (assignments ?? "")
        .split(/, (?=\w+ =)/)
        .map((assignment) => assignment.split(" =")[0]),
    );
    expect(assigned.sort()).toEqual([
      "captured_at",
      "image",
      "image_type",
      "revision",
    ]);
  });

  it.each([
    ["written and current", { is_matched: true, is_current: true }, "stored"],
    [
      "matched at another revision",
      { is_matched: true, is_current: false },
      "stale",
    ],
    ["not matched", { is_matched: false, is_current: false }, "none"],
    [
      "not matched, though the revision reads current",
      { is_matched: false, is_current: true },
      "none",
    ],
  ])("reads %s as %s", async (_name, row, kind) => {
    answerQueryWith([row]);

    expect(await newStore().storeThumbnail(TOKEN_WRITE)).toEqual({ kind });
  });

  it.each([
    ["no row", []],
    ["two rows", [{ is_matched: true, is_current: true }, {}]],
    ["a flag that is not a boolean", [{ is_matched: "t", is_current: true }]],
    ["a missing flag", [{ is_matched: true }]],
    ["a reply that is not rows", { is_matched: true, is_current: true }],
  ])("refuses %s as an unexpected answer", async (_name, reply) => {
    answerQueryWith(reply);

    await failureOf(
      () => newStore().storeThumbnail(TOKEN_WRITE),
      "unexpected-answer",
    );
  });

  it.each([
    ["a design id of no id's shape", { ...TOKEN_WRITE, designId: "short" }],
    [
      "a write token hash that is not a digest",
      { ...TOKEN_WRITE, credential: { kind: "write-token", hash: "x" } },
    ],
    [
      "an account id of no id's shape",
      { ...ACCOUNT_WRITE, credential: { kind: "account", accountId: "x" } },
    ],
  ] as const)("answers none and sends nothing for %s", async (_name, write) => {
    expect(await newStore().storeThumbnail(write)).toEqual({ kind: "none" });

    expect(queryDriver.statements).toHaveLength(0);
  });

  it.each([
    ["an empty image", { ...TOKEN_WRITE, image: new Uint8Array() }],
    ["bytes that are no image", { ...TOKEN_WRITE, image: Uint8Array.of(0, 1) }],
    [
      "a png declared as a webp",
      { ...TOKEN_WRITE, image: thumbnailBytes("image/png") },
    ],
    ["a revision of 0", { ...TOKEN_WRITE, revision: "0" }],
    ["a type outside the list", { ...TOKEN_WRITE, type: "image/gif" as never }],
  ] as const)("refuses %s before any statement", async (_name, write) => {
    await failureOf(() => newStore().storeThumbnail(write), "invalid-request");

    expect(queryDriver.statements).toHaveLength(0);
  });

  it("retries after a lost acknowledgement, because a repeat of a held revision writes nothing", async () => {
    failQueryWith(new SyntaxError("Unexpected end of JSON input"));
    answerQueryWith([{ is_matched: true, is_current: true }]);

    expect(await newStore().storeThumbnail(TOKEN_WRITE)).toEqual({
      kind: "stored",
    });

    expect(queryDriver.statements).toHaveLength(2);
  });

  it.each([
    ["42501", "unavailable"],
    ["42P01", "unavailable"],
    ["23514", "database"],
    ["57014", "database"],
  ] as const)(
    "reads a driver failure of SQLSTATE %s as %s and keeps no driver text",
    async (code, failure) => {
      failQueryWith(aDriverError(code));

      const error = await failureOf(
        () => newStore().storeThumbnail(TOKEN_WRITE),
        failure,
      );

      expect(error.cause).toEqual({ name: "NeonDbError", code });
      expect(JSON.stringify([error.message, error.cause])).not.toContain(
        SECRET,
      );
    },
  );
});

describe("loading an owner's thumbnail", () => {
  it("joins the picture to its design on the account, under both marks, and reads the image as hex", async () => {
    answerQueryWith([]);

    await newStore().loadOwnThumbnail({
      accountId: ACCOUNT_ID,
      designId: DESIGN_ID,
    });

    const statement = loneStatement();
    expect(normalised(statement)).toBe(
      "select encode(t.image, 'hex') as image_hex, t.image_type, t.revision::text as revision " +
        "from design_thumbnails t join designs d on d.id = t.design_id " +
        "where d.id = ? and d.account_id = ? and d.hidden_by_client_at is null and d.deleted_by_client_at is null",
    );
    expect(statement.values).toEqual([DESIGN_ID, ACCOUNT_ID]);
  });

  it("reads no row as none and a row as the picture, bytes and type and revision", async () => {
    answerQueryWith([]);
    expect(
      await newStore().loadOwnThumbnail({
        accountId: ACCOUNT_ID,
        designId: DESIGN_ID,
      }),
    ).toEqual({ kind: "none" });

    resetQueryDriver();
    answerQueryWith([
      { image_hex: IMAGE_HEX, image_type: "image/png", revision: "7" },
    ]);
    expect(
      await newStore().loadOwnThumbnail({
        accountId: ACCOUNT_ID,
        designId: DESIGN_ID,
      }),
    ).toEqual({
      kind: "found",
      image: IMAGE,
      type: "image/png",
      revision: "7",
    });
  });

  it.each([
    ["two rows", [{}, {}]],
    [
      "hex of odd length",
      [{ image_hex: "abc", image_type: "image/png", revision: "7" }],
    ],
    [
      "upper-case hex",
      [{ image_hex: "AB", image_type: "image/png", revision: "7" }],
    ],
    [
      "a type outside the list",
      [{ image_hex: "ab", image_type: "image/gif", revision: "7" }],
    ],
    [
      "a revision with a leading zero",
      [{ image_hex: "ab", image_type: "image/png", revision: "07" }],
    ],
    [
      "a revision that is not text",
      [{ image_hex: "ab", image_type: "image/png", revision: 7 }],
    ],
  ])("refuses %s as an unexpected answer", async (_name, reply) => {
    answerQueryWith(reply);

    await failureOf(
      () =>
        newStore().loadOwnThumbnail({
          accountId: ACCOUNT_ID,
          designId: DESIGN_ID,
        }),
      "unexpected-answer",
    );
  });

  it.each([
    [
      "a design id of no id's shape",
      { accountId: ACCOUNT_ID, designId: "short" },
    ],
    [
      "an account id of no id's shape",
      { accountId: "short", designId: DESIGN_ID },
    ],
  ])("answers none and sends nothing for %s", async (_name, request) => {
    expect(await newStore().loadOwnThumbnail(request)).toEqual({
      kind: "none",
    });

    expect(queryDriver.statements).toHaveLength(0);
  });
});
