import { MAX_EXPORTED_KITCHENS } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DRIVER_FAILURE_MARKER,
  EXPORT_POLICY_NAME,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  seedKitchen,
  seedSession,
  seedVerifiedAccount,
  sha256Hex,
  wireOf,
  type AccountWorld,
  type SeededAccount,
  type SeededSession,
  expectAWaitWithinTheWindowOf,
} from "../../../support/account-world";

vi.mock("@/lib/server/account/account-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountStoreModule(),
  ),
);
vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/account/account-kitchen-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountKitchenStoreModule(),
  ),
);

const { POST } = await import("@/app/api/account/export/route");

/**
 * `POST /api/account/export` (M8B Lot 2, E10; criterion 11; plan section 12.1, S10). The size is measured first and an
 * account that can never be exported is refused without spending its daily bucket; the bucket is counted next; the
 * whole export is read last.
 */

const NEWEST = new Date("2026-10-19T12:00:00.000Z");
const SENT_AT = new Date("2026-10-18T09:00:00.000Z");

let world: AccountWorld;
let client: SeededAccount;
let session: SeededSession;

beforeEach(async () => {
  world = freshAccountWorld();
  captureConsole();
  client = await seedVerifiedAccount({
    email: "client@example.test",
    locale: "ro",
  });
  session = await seedSession(client);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function download(init: Parameters<typeof accountRequest>[1] = {}) {
  return POST(
    accountRequest("/api/account/export", {
      method: "POST",
      json: {},
      cookie: session.cookie,
      ...init,
    }),
  );
}

interface ExportFile {
  readonly formatVersion: number;
  readonly exportedAt: string;
  readonly account: Record<string, unknown>;
  readonly kitchens: {
    id: string;
    name: string | null;
    updatedAt: string;
    isSent: boolean;
    isHidden: boolean;
    design: unknown;
  }[];
}

function withoutDesign({
  id,
  name,
  updatedAt,
  isSent,
  isHidden,
}: ExportFile["kitchens"][number]) {
  return { id, name, updatedAt, isSent, isHidden };
}

async function fileOf(answer: Response): Promise<ExportFile> {
  return (await jsonOf(answer)) as ExportFile;
}

function seedMany(
  count: number,
  extra: Partial<Parameters<typeof seedKitchen>[0]> = {},
): void {
  for (let index = 0; index < count; index += 1) {
    seedKitchen({
      accountId: client.id,
      updatedAt: new Date(NEWEST.getTime() - index * 1000),
      ...extra,
    });
  }
}

describe("the order of the checks", () => {
  it("refuses a cross-site request, a body that is not JSON and one that is too large before the session is read", async () => {
    world.calls.length = 0;

    const crossSite = await download({
      secFetchSite: "cross-site",
      cookie: "",
    });
    const notJson = await download({
      contentType: "text/plain",
      json: "{}",
      cookie: "",
    });
    const tooLarge = await download({
      json: JSON.stringify({ filler: "x".repeat(9000) }),
      cookie: "",
    });

    expect([crossSite.status, notJson.status, tooLarge.status]).toEqual([
      403, 415, 413,
    ]);
    expect(world.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
  });

  it("refuses a cross-site GET-like request too: only the JSON POST from this site is served", async () => {
    for (const secFetchSite of ["cross-site", "same-site", "none"]) {
      const answer = await download({ secFetchSite });

      expect(answer.status).toBe(403);
      expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    }
  });

  it("answers 401 with no live session, and 503 rather than 401 when the session store fails", async () => {
    const anonymous = await download({ cookie: "" });
    world.failOn("sessions.findLive");
    const down = await download();

    expect(anonymous.status).toBe(401);
    expect(down.status).toBe(503);
    expect(limiterLedger.counted).toEqual([]);
  });

  it("measures the size, then counts the daily bucket, then reads everything, in that order", async () => {
    seedMany(2);
    world.calls.length = 0;

    const answer = await download();

    expect(answer.status).toBe(200);
    expect(world.calls.slice(0, 2)).toEqual([
      "sessions.findLive",
      "kitchens.measureExport",
    ]);
    expect([...world.calls.slice(2)].sort()).toEqual([
      "accounts.findById",
      "accounts.findProfile",
      "kitchens.exportAll",
    ]);
    expect(limiterLedger.counted).toEqual([EXPORT_POLICY_NAME]);
  });

  it("answers 429 with Retry-After when the daily bucket refuses, reading no account and no kitchen", async () => {
    limiterLedger.refusing.set(EXPORT_POLICY_NAME, 4321);
    world.calls.length = 0;

    const answer = await download();

    expect(answer.status).toBe(429);
    expectAWaitWithinTheWindowOf(answer, EXPORT_POLICY_NAME);
    expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    expect(world.calls).toEqual([
      "sessions.findLive",
      "kitchens.measureExport",
    ]);
  });

  it("allows five exports in a day and refuses the sixth, with a whole number of seconds to wait", async () => {
    for (let count = 0; count < 5; count += 1) {
      expect((await download()).status).toBe(200);
    }

    const sixth = await download();

    expect(sixth.status).toBe(429);
    const wait = Number(sixth.headers.get("retry-after"));
    expect(Number.isInteger(wait) && wait >= 1 && wait <= 86_400).toBe(true);
  });

  it("fails closed when the bucket cannot be judged", async () => {
    limiterLedger.unavailable.add(EXPORT_POLICY_NAME);

    const answer = await download();

    expect(answer.status).toBe(503);
    expect(world.calls).not.toContain("kitchens.exportAll");
  });

  it("answers 401 for a live session whose account or profile the table has lost", async () => {
    world.intercept("accounts.findProfile", () =>
      Promise.resolve({ kind: "none" }),
    );

    expect((await download()).status).toBe(401);
  });

  it("answers 503 and leaks no cause when any store fails", async () => {
    for (const method of [
      "kitchens.measureExport",
      "kitchens.exportAll",
      "accounts.findById",
      "accounts.findProfile",
    ]) {
      world = freshAccountWorld();
      const console_ = captureConsole();
      client = await seedVerifiedAccount({ email: "client@example.test" });
      session = await seedSession(client);
      world.failOn(method);

      const answer = await download();

      expect(answer.status, method).toBe(503);
      expect(await answer.clone().text(), method).not.toContain(
        DRIVER_FAILURE_MARKER,
      );
      expect(console_.everything(), method).not.toContain(
        DRIVER_FAILURE_MARKER,
      );
    }
  });
});

describe("an account with more kitchens than one export carries", () => {
  it("is 200 at exactly the cap and 409 export-too-large at one more, hidden kitchens counting", async () => {
    seedMany(MAX_EXPORTED_KITCHENS - 1);
    seedKitchen({ accountId: client.id, hiddenAt: NEWEST, sentAt: SENT_AT });

    const atCap = await download();
    expect(atCap.status).toBe(200);
    expect((await fileOf(atCap)).kitchens).toHaveLength(MAX_EXPORTED_KITCHENS);

    seedKitchen({ accountId: client.id, hiddenAt: NEWEST, sentAt: SENT_AT });
    limiterLedger.counted.length = 0;

    const over = await download();

    expect(over.status).toBe(409);
    expect(await jsonOf(over)).toEqual({ status: "export-too-large" });
    expect(over.headers.get("cache-control")).toBe("private, no-store");
    expect(over.headers.get("retry-after")).toBeNull();
  });

  it("does not spend the daily bucket, however often it is asked", async () => {
    seedMany(MAX_EXPORTED_KITCHENS + 1);
    world.calls.length = 0;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const answer = await download();

      expect(answer.status).toBe(409);
    }
    expect(limiterLedger.counted).toEqual([]);
    expect(world.calls).not.toContain("kitchens.exportAll");
    expect(world.calls).not.toContain("accounts.findById");
  });

  it("still serves the account's first five exports after eight refusals, since none of them was counted", async () => {
    seedMany(MAX_EXPORTED_KITCHENS + 1);
    for (let attempt = 0; attempt < 8; attempt += 1) await download();
    world = freshAccountWorld();
    captureConsole();
    client = await seedVerifiedAccount({ email: "client@example.test" });
    session = await seedSession(client);

    expect((await download()).status).toBe(200);
  });

  it("does not count deleted kitchens against the cap", async () => {
    seedMany(MAX_EXPORTED_KITCHENS);
    seedKitchen({ accountId: client.id, deletedAt: NEWEST });
    seedKitchen({ accountId: client.id, deletedAt: NEWEST });

    const answer = await download();

    expect(answer.status).toBe(200);
  });

  it("does not count another account's kitchens against the cap", async () => {
    const other = await seedVerifiedAccount({ email: "other@example.test" });
    for (let index = 0; index < MAX_EXPORTED_KITCHENS + 5; index += 1) {
      seedKitchen({ accountId: other.id, updatedAt: NEWEST });
    }

    expect((await download()).status).toBe(200);
  });

  it("refuses with the bucket already spent when the account grew past the cap between the size and the read", async () => {
    seedMany(MAX_EXPORTED_KITCHENS + 1);
    world.intercept("kitchens.measureExport", () =>
      Promise.resolve({ kind: "within-bound" }),
    );

    const answer = await download();

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "export-too-large" });
    expect(limiterLedger.counted).toEqual([EXPORT_POLICY_NAME]);
  });
});

describe("the file", () => {
  it("is an attachment of JSON that a browser may not sniff or keep", async () => {
    const answer = await download();

    expect(answer.status).toBe(200);
    expect(answer.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(answer.headers.get("content-disposition")).toBe(
      'attachment; filename="lemnaria-account-data.json"',
    );
    expect(answer.headers.get("x-content-type-options")).toBe("nosniff");
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(answer.headers.getSetCookie()).toEqual([]);
  });

  it("holds the format version, the time, the account's own details and its kitchens, and no other member", async () => {
    await world.accounts.updateProfile({
      accountId: client.id,
      changes: {
        name: "Ion Popescu",
        address: "Chisinau",
        phone: { phone: "+37369123456", phoneNormalForm: "+37369123456" },
      },
    });
    const id = seedKitchen({
      accountId: client.id,
      name: "My own kitchen",
      updatedAt: NEWEST,
      sentAt: SENT_AT,
    });

    const file = await fileOf(await download());

    expect(Object.keys(file).sort()).toEqual([
      "account",
      "exportedAt",
      "formatVersion",
      "kitchens",
    ]);
    expect(file.formatVersion).toBe(1);
    expect(Math.abs(Date.parse(file.exportedAt) - Date.now())).toBeLessThan(
      10_000,
    );
    expect(file.account).toEqual({
      email: client.email,
      language: "ro",
      name: "Ion Popescu",
      address: "Chisinau",
      phone: "+37369123456",
    });
    expect(file.kitchens).toEqual([
      {
        id,
        name: "My own kitchen",
        updatedAt: NEWEST.toISOString(),
        isSent: true,
        isHidden: false,
        design: world.kitchens.held(id)?.design,
      },
    ]);
  });

  it("states the account's own language, not a default", async () => {
    const russian = await seedVerifiedAccount({
      email: "russian@example.test",
      locale: "ru",
    });
    const russianSession = await seedSession(russian);

    const file = await fileOf(
      await download({ cookie: russianSession.cookie }),
    );

    expect(file.account).toMatchObject({
      email: russian.email,
      language: "ru",
    });
  });

  it("gives an account that gave nothing optional nulls, and an account with no kitchen an empty list", async () => {
    const file = await fileOf(await download());

    expect(file.account).toEqual({
      email: client.email,
      language: "ro",
      name: null,
      address: null,
      phone: null,
    });
    expect(file.kitchens).toEqual([]);
  });

  it("holds the account's kitchens newest first, hidden ones with their mark, and no deleted one", async () => {
    const older = seedKitchen({
      accountId: client.id,
      updatedAt: new Date(NEWEST.getTime() - 5000),
    });
    const hidden = seedKitchen({
      accountId: client.id,
      updatedAt: NEWEST,
      sentAt: SENT_AT,
      hiddenAt: NEWEST,
    });
    const deleted = seedKitchen({
      accountId: client.id,
      updatedAt: NEWEST,
      deletedAt: NEWEST,
    });
    const unnamed = seedKitchen({
      accountId: client.id,
      updatedAt: new Date(NEWEST.getTime() - 1000),
    });

    const file = await fileOf(await download());

    const ids = file.kitchens.map(({ id }) => id);
    expect(ids).toContain(hidden);
    expect(ids).not.toContain(deleted);
    expect(ids.indexOf(hidden)).toBeLessThan(ids.indexOf(unnamed));
    expect(ids.indexOf(unnamed)).toBeLessThan(ids.indexOf(older));
    expect(file.kitchens.find(({ id }) => id === hidden)).toMatchObject({
      isHidden: true,
      isSent: true,
    });
    expect(file.kitchens.find(({ id }) => id === unnamed)).toMatchObject({
      name: null,
      isHidden: false,
      isSent: false,
    });
  });

  it("holds the session's account and its kitchens only, whatever the request names", async () => {
    const other = await seedVerifiedAccount({ email: "other@example.test" });
    await world.accounts.updateProfile({
      accountId: other.id,
      changes: { name: "OTHER-NAME-MARKER" },
    });
    seedKitchen({
      accountId: other.id,
      name: "OTHER-KITCHEN-MARKER",
      updatedAt: NEWEST,
    });
    const mine = seedKitchen({ accountId: client.id, updatedAt: NEWEST });

    const answer = await download({
      json: { accountId: other.id, account: other.id, all: true },
      search: `?accountId=${other.id}`,
      headers: { "x-account-id": other.id },
    });
    const text = await answer.clone().text();

    expect((await fileOf(answer)).kitchens.map(({ id }) => id)).toEqual([mine]);
    for (const marker of [
      "OTHER-NAME-MARKER",
      "OTHER-KITCHEN-MARKER",
      other.email,
      other.id,
    ]) {
      expect(text).not.toContain(marker);
    }
  });

  it("holds no password hash, token hash, session, visitor hash, write-token hash, account id or share token", async () => {
    const other = await seedVerifiedAccount({ email: "other@example.test" });
    const expiresAt = new Date(world.now().getTime() + 86_400_000);
    await world.accounts.issueToken({
      accountId: client.id,
      purpose: "reset-password",
      tokenHash: sha256Hex("reset-secret"),
      expiresAt,
    });
    await world.accounts.issueEmailChangeToken({
      accountId: client.id,
      verifiedPasswordHash: client.passwordHash,
      newEmail: "elsewhere@example.test",
      newEmailNormalForm: "elsewhere@example.test",
      tokenHash: sha256Hex("change-secret"),
      expiresAt,
    });
    seedKitchen({
      accountId: client.id,
      updatedAt: NEWEST,
      sentAt: SENT_AT,
      hiddenAt: NEWEST,
    });
    seedKitchen({ accountId: other.id, updatedAt: NEWEST });

    const answer = await download();
    const text = await answer.clone().text();
    const file = await fileOf(answer);

    for (const secret of [
      client.passwordHash,
      other.passwordHash,
      "argon2",
      session.value,
      session.tokenHash,
      sha256Hex("reset-secret"),
      sha256Hex("change-secret"),
      client.id,
      other.id,
      "elsewhere@example.test",
    ]) {
      expect(text, secret.slice(0, 12)).not.toContain(secret);
    }
    const outsideTheDesigns = JSON.stringify({
      ...file,
      kitchens: file.kitchens.map(withoutDesign),
    });
    expect(outsideTheDesigns).not.toMatch(
      /hash|token|session|visitor|password|accountId|shareLink|writeToken/i,
    );
  });

  it("reads and counts nothing it writes: an export changes no row", async () => {
    const id = seedKitchen({
      accountId: client.id,
      updatedAt: NEWEST,
      name: "Aceasta",
    });
    const before = world.kitchens.held(id);
    const accountBefore = await world.accounts.findById(client.id);
    world.calls.length = 0;

    await download();

    expect(world.kitchens.held(id)).toEqual(before);
    expect(await world.accounts.findById(client.id)).toEqual(accountBefore);
    expect(
      world.calls.filter((call) =>
        /rename|duplicate|hide|markDeleted|update|change|issue|retire|revoke|create/.test(
          call,
        ),
      ),
    ).toEqual([]);
  });

  it("is served to staff for their own account", async () => {
    const staff = await seedVerifiedAccount({
      email: "staff@example.test",
      role: "operator",
    });
    const staffSession = await seedSession(staff);

    const answer = await download({ cookie: staffSession.cookie });

    expect(answer.status).toBe(200);
    expect((await fileOf(answer)).kitchens).toEqual([]);
  });

  it("is the same for two requests of one account but the time", async () => {
    seedMany(3);

    const first = await fileOf(await download());
    const second = await fileOf(await download());

    expect({ ...first, exportedAt: "" }).toEqual({ ...second, exportedAt: "" });
  });

  it("writes one line per answer by event and outcome alone", async () => {
    const console_ = captureConsole();
    seedMany(1);
    await download();
    seedMany(MAX_EXPORTED_KITCHENS);
    await download();

    expect(console_.accountLines()).toEqual([
      { event: "export", outcome: "succeeded" },
      { event: "export", outcome: "refused" },
    ]);
    expect(console_.everything()).not.toContain(client.email);
  });

  it("answers a refusal and a success with different bodies but never a file for a refusal", async () => {
    seedMany(MAX_EXPORTED_KITCHENS + 1);

    const answer = await download();

    expect(answer.headers.get("content-disposition")).toBeNull();
    expect(await wireOf(answer)).toContain("export-too-large");
  });
});
