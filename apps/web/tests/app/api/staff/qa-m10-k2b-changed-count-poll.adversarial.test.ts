import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  hashOf,
  jsonOf,
  type AccountWorld,
} from "../../../support/account-world";
import {
  freshStaffWorld,
  plantKitchen,
  signedInAs,
  type SignedInStaff,
  type StaffWorld,
} from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-kitchen-reader-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffKitchenReaderModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);

const { GET: COUNT } = await import(
  "@/app/api/staff/kitchens/changed-count/route"
);

/**
 * The shared count must never be an admission. Every poll is judged on its own session and capability before the count
 * is asked for, so a count held for one reader is never handed to a caller who has lost the right to it, and a poll
 * never keeps a session alive that nobody is using.
 */

const COUNT_PATH = "/api/staff/kitchens/changed-count";
const COUNT_READ = "reader.countChanged";
const OPERATOR_IDLE_MS = IDLE_LIFETIME_SECONDS_BY_ROLE.operator * 1000;
const START = new Date("2026-11-04T10:00:00.000Z");

let world: AccountWorld;
let staffWorld: StaffWorld;

beforeEach(() => {
  world = freshAccountWorld();
  staffWorld = freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function pollRequest(cookie: string, search = ""): NextRequest {
  return accountRequest(COUNT_PATH, {
    cookie,
    search,
    headers: { "x-forwarded-for": "192.0.2.10" },
  });
}

function poll(cookie: string, search = "") {
  return COUNT(pollRequest(cookie, search));
}

function operator(email = "operator@example.test"): Promise<SignedInStaff> {
  return signedInAs({ role: "operator" }, email);
}

function plantChangedKitchens(howMany: number): void {
  for (let planted = 0; planted < howMany; planted += 1) {
    const { id } = plantKitchen({ revision: "2" });
    staffWorld.reader.plantRequest({
      clientRequestId: id,
      designId: id,
      reference: `REF-${id.slice(0, 6)}`,
      createdAt: new Date("2026-10-18T09:00:00.000Z"),
      designRevision: "1",
    });
  }
}

function countReads(): number {
  return staffWorld.calls.filter((call) => call === COUNT_READ).length;
}

async function warmTheSharedCount(cookie: string): Promise<void> {
  const answer = await poll(cookie);
  expect(await jsonOf(answer)).toEqual({ count: 3 });
}

describe("a poll does not keep a session alive", () => {
  it("lets a session lapse by its idle lifetime from sign-in however often a tab polled in between", async () => {
    const { session } = await operator();

    world.advance(OPERATOR_IDLE_MS - 60_000);
    const justInside = await poll(session.cookie);
    world.advance(OPERATOR_IDLE_MS - 60_000);
    const afterPollsOnly = await poll(session.cookie);

    expect(justInside.status).toBe(200);
    expect(afterPollsOnly.status).toBe(401);
  });

  it("is the contrast to a person's own request, which does keep the session alive past that deadline", async () => {
    const { session } = await operator();
    const { GET: LIST } = await import("@/app/api/staff/kitchens/route");

    world.advance(OPERATOR_IDLE_MS - 60_000);
    const person = await LIST(
      accountRequest("/api/staff/kitchens", {
        cookie: session.cookie,
        headers: { "x-forwarded-for": "192.0.2.10" },
      }),
    );
    world.advance(OPERATOR_IDLE_MS - 60_000);
    const later = await poll(session.cookie);

    expect(person.status).toBe(200);
    expect(later.status).toBe(200);
  });
});

describe("a count held for one reader is never an answer to a caller who has lost the right to it", () => {
  async function warmedBy(
    reader: SignedInStaff,
  ): Promise<{ readonly readsBefore: number }> {
    plantChangedKitchens(3);
    await warmTheSharedCount(reader.session.cookie);
    return { readsBefore: countReads() };
  }

  async function expectRefusedWithNoCount(
    cookie: string,
    status: number,
    readsBefore: number,
  ): Promise<void> {
    const answer = await poll(cookie);

    expect(answer.status).toBe(status);
    expect(JSON.stringify(await jsonOf(answer))).not.toMatch(/count/);
    expect(countReads()).toBe(readsBefore);
  }

  it("refuses a session revoked after the count was held, and shows no number", async () => {
    const reader = await operator();
    const { readsBefore } = await warmedBy(reader);
    await world.sessions.revokeAllForAccount(reader.account.id);

    await expectRefusedWithNoCount(reader.session.cookie, 401, readsBefore);
  });

  it("refuses a session idle past its lifetime after the count was held, and shows no number", async () => {
    const reader = await operator();
    const { readsBefore } = await warmedBy(reader);
    world.advance(OPERATOR_IDLE_MS + 1_000);

    await expectRefusedWithNoCount(reader.session.cookie, 401, readsBefore);
  });

  it("refuses a session that a password change ended after the count was held", async () => {
    const reader = await operator();
    const { readsBefore } = await warmedBy(reader);
    await world.accounts.changePassword({
      accountId: reader.account.id,
      expectedPasswordHash: reader.account.passwordHash,
      passwordHash: await hashOf("a second passphrase 9"),
    });

    await expectRefusedWithNoCount(reader.session.cookie, 401, readsBefore);
  });

  it("refuses an operator demoted to a client after the count was held, with 403 and no number", async () => {
    const reader = await operator();
    const { readsBefore } = await warmedBy(reader);
    world.accounts.setRoleOf(reader.account.id, "client");

    await expectRefusedWithNoCount(reader.session.cookie, 403, readsBefore);
  });

  it("refuses a client who polls right after staff warmed the count, with 403 and no number", async () => {
    const reader = await operator();
    const { readsBefore } = await warmedBy(reader);
    const client = await signedInAs({ role: "client" });

    await expectRefusedWithNoCount(client.session.cookie, 403, readsBefore);
  });

  it("refuses an anonymous caller who polls right after staff warmed the count", async () => {
    const reader = await operator();
    const { readsBefore } = await warmedBy(reader);

    const answer = await COUNT(
      accountRequest(COUNT_PATH, {
        headers: { "x-forwarded-for": "192.0.2.10" },
      }),
    );

    expect(answer.status).toBe(401);
    expect(JSON.stringify(await jsonOf(answer))).not.toMatch(/count/);
    expect(countReads()).toBe(readsBefore);
  });

  it("is 503 and never 401 when the session store cannot answer, whatever count is held", async () => {
    const reader = await operator();
    await warmedBy(reader);
    world.failOn("sessions.findLive");

    const answer = await poll(reader.session.cookie);

    expect(answer.status).toBe(503);
    expect(await answer.text()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("the shared read under concurrent polls", () => {
  it("answers polls that arrive together from one read, the same number to every poller", async () => {
    const colleague = await operator("colleague@example.test");
    const reader = await operator();
    plantChangedKitchens(3);

    const answers = await Promise.all(
      [reader, colleague, reader, colleague, reader].map(({ session }) =>
        poll(session.cookie),
      ),
    );

    expect(answers.map(({ status }) => status)).toEqual([
      200, 200, 200, 200, 200,
    ]);
    expect(await Promise.all(answers.map(jsonOf))).toEqual(
      Array.from({ length: 5 }, () => ({ count: 3 })),
    );
    expect(countReads()).toBe(1);
  });

  it("answers every poll that met one failed read with 503, and the next poll in the same interval reads again", async () => {
    const reader = await operator();
    plantChangedKitchens(3);
    staffWorld.failReader = true;

    const together = await Promise.all([
      poll(reader.session.cookie),
      poll(reader.session.cookie),
      poll(reader.session.cookie),
    ]);
    staffWorld.failReader = false;
    const recovered = await poll(reader.session.cookie);

    expect(together.map(({ status }) => status)).toEqual([503, 503, 503]);
    for (const answer of together) {
      expect(await answer.text()).not.toContain(DRIVER_FAILURE_MARKER);
    }
    expect(await jsonOf(recovered)).toEqual({ count: 3 });
    expect(countReads()).toBe(2);
  });

  it("holds a failure for no later poll even when the failing poll was the first of its interval", async () => {
    const reader = await operator();
    plantChangedKitchens(1);
    staffWorld.failReader = true;
    await poll(reader.session.cookie);
    staffWorld.failReader = false;

    const answers = [
      await poll(reader.session.cookie),
      await poll(reader.session.cookie),
    ];

    expect(answers.map(({ status }) => status)).toEqual([200, 200]);
    expect(countReads()).toBe(2);
  });
});

describe("what the poll takes from the request", () => {
  it("answers the same count whatever query string rides along, and never a refusal of it", async () => {
    const reader = await operator();
    plantChangedKitchens(2);
    const bare = await jsonOf(await poll(reader.session.cookie));

    const decorated = await poll(
      reader.session.cookie,
      "?segment=drafts&status=new&q=anything&page=9&onlyChanged=nonsense",
    );

    expect(decorated.status).toBe(200);
    expect(await jsonOf(decorated)).toEqual(bare);
  });

  it("answers a zero count as zero, a number and not an absence", async () => {
    const reader = await operator();

    const answer = await poll(reader.session.cookie);

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({ count: 0 });
  });
});
