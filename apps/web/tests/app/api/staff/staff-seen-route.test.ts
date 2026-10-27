import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { designNotFoundResponse } from "@/lib/server/design-errors";
import { STAFF_SEEN_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  aDesignId,
  captureConsole,
  cookieOfValue,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  wireOf,
  type AccountWorld,
} from "../../../support/account-world";
import {
  freshSeenWorld,
  plantSeenKitchen,
  seenRequest,
  type SeenWorld,
} from "../../../support/staff-seen-world";
import { signedInAs, type StaffCaller } from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/kitchen-change-store-instance", () =>
  import("../../../support/staff-seen-world").then((world) =>
    world.kitchenChangeStoreModule(),
  ),
);
const capabilitiesAsked: string[] = [];
vi.mock("@/lib/server/account/require-capability", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/server/account/require-capability")
    >();
  return {
    ...original,
    requireCapability: (
      ...args: Parameters<typeof original.requireCapability>
    ) => {
      capabilitiesAsked.push(args[1]);
      return original.requireCapability(...args);
    },
  };
});

const { POST } = await import("@/app/api/staff/kitchens/[id]/seen/route");

/**
 * `POST /api/staff/kitchens/{id}/seen` (ADR 0178 A-12, F9). A mark is written with its `kitchen-seen` row or not at
 * all, never lowers the stored revision, and is refused before the store when the displayed revision is not a revision.
 */

const WIDEST_REVISION = "9223372036854775807";

let world: AccountWorld;
let seen: SeenWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(() => {
  world = freshAccountWorld();
  seen = freshSeenWorld();
  console_ = captureConsole();
  capabilitiesAsked.length = 0;
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function mark(
  id: string,
  displayedRevision: unknown,
  cookie: string | undefined,
) {
  return POST(
    seenRequest(id, {
      json: { displayedRevision },
      ...(cookie === undefined ? {} : { cookie }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function operatorCookie(email = "operator@example.test") {
  return (await signedInAs({ role: "operator" }, email)).session.cookie;
}

function nothingWasWritten(): void {
  expect(seen.calls).toEqual([]);
  expect(seen.ledger.heldEvents()).toEqual([]);
}

describe("who may mark a kitchen seen", () => {
  type Expected = "marked" | 401 | 403;
  const CALLERS: readonly [
    string,
    StaffCaller | "anonymous" | "malformed",
    Expected,
  ][] = [
    ["no session", "anonymous", 401],
    ["a malformed cookie", "malformed", 401],
    ["a client with a confirmed address", { role: "client" }, 403],
    [
      "a client with an unconfirmed address",
      { role: "client", isVerified: false },
      403,
    ],
    [
      "an operator with an unconfirmed address",
      { role: "operator", isVerified: false },
      403,
    ],
    [
      "an administrator with an unconfirmed address",
      { role: "administrator", isVerified: false },
      403,
    ],
    ["an operator", { role: "operator" }, "marked"],
    ["an administrator", { role: "administrator" }, "marked"],
  ];

  async function cookieOf(
    caller: StaffCaller | "anonymous" | "malformed",
    index: number,
  ): Promise<string | undefined> {
    if (caller === "anonymous") return undefined;
    if (caller === "malformed") return cookieOfValue("short");
    const { session } = await signedInAs(
      caller,
      `caller-${String(index)}@example.test`,
    );
    return session.cookie;
  }

  it.each(CALLERS.map((row, index) => [...row, index] as const))(
    "answers %s with %s",
    async (_name, caller, expected, index) => {
      const { designId } = plantSeenKitchen();
      const cookie = await cookieOf(caller, index);

      const answer = await mark(designId, "5", cookie);

      if (expected === "marked") {
        expect(answer.status).toBe(200);
        expect(seen.store.heldSeenRevision(designId)).toBe("5");
        return;
      }
      expect(answer.status).toBe(expected);
      expect(await jsonOf(answer)).toEqual({
        status: expected === 401 ? "unauthenticated" : "forbidden",
      });
      nothingWasWritten();
      expect(seen.store.heldSeenRevision(designId)).toBeUndefined();
    },
  );

  it("asks for contact.read and no other capability", async () => {
    const { designId } = plantSeenKitchen();

    await mark(designId, "5", await operatorCookie());

    expect(capabilitiesAsked).toEqual(["contact.read"]);
  });
});

describe("a mark that is admitted", () => {
  it("is stored at the displayed revision with one kitchen-seen row naming the kitchen and no detail", async () => {
    const { designId } = plantSeenKitchen({ revision: "7" });

    const answer = await mark(designId, "7", await operatorCookie());

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({});
    expect(seen.store.heldSeenRevision(designId)).toBe("7");
    expect(seen.ledger.heldEvents()).toMatchObject([
      { action: "kitchen-seen", designId, detail: {} },
    ]);
  });

  it("never lowers the stored revision, and still writes a row for the stale mark", async () => {
    const { designId } = plantSeenKitchen({ revision: "9" });
    const cookie = await operatorCookie();
    await mark(designId, "9", cookie);

    const stale = await mark(designId, "3", cookie);

    expect(stale.status).toBe(200);
    expect(seen.store.heldSeenRevision(designId)).toBe("9");
    expect(seen.ledger.heldEvents()).toHaveLength(2);
  });

  it("is accepted at exactly the widest bigint", async () => {
    const { designId } = plantSeenKitchen({ revision: WIDEST_REVISION });

    const answer = await mark(
      designId,
      WIDEST_REVISION,
      await operatorCookie(),
    );

    expect(answer.status).toBe(200);
    expect(seen.store.heldSeenRevision(designId)).toBe(WIDEST_REVISION);
  });

  it("succeeds on a kitchen an account holds that was never sent", async () => {
    const { designId } = plantSeenKitchen({ isSent: false });

    const answer = await mark(designId, "5", await operatorCookie());

    expect(answer.status).toBe(200);
    expect(seen.store.heldSeenRevision(designId)).toBe("5");
    expect(seen.ledger.heldEvents()).toHaveLength(1);
  });

  it("is refused 409 when the displayed revision is ahead of the kitchen's, with nothing written and no row", async () => {
    const { designId } = plantSeenKitchen({ revision: "5" });

    const answer = await mark(designId, "6", await operatorCookie());

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "displayed-revision-ahead",
    });
    expect(seen.store.heldSeenRevision(designId)).toBeUndefined();
    expect(seen.ledger.heldEvents()).toEqual([]);
  });
});

describe("a request the route's guard refuses", () => {
  it.each([
    ["a cross-site origin", { secFetchSite: "cross-site" }],
    ["a media type that is not JSON", { contentType: "text/plain" }],
  ] as const)(
    "is refused for %s before any session or store is asked",
    async (_name, init) => {
      const { designId } = plantSeenKitchen();
      const cookie = await operatorCookie();

      const answer = await POST(
        seenRequest(designId, {
          json: { displayedRevision: "5" },
          cookie,
          ...init,
        }),
        { params: Promise.resolve({ id: designId }) },
      );

      expect(answer.status).toBeGreaterThanOrEqual(400);
      expect(answer.status).toBeLessThan(500);
      nothingWasWritten();
      expect(seen.store.heldSeenRevision(designId)).toBeUndefined();
    },
  );
});

describe("a kitchen staff may not mark", () => {
  async function refusalOf(designId: string, cookie: string): Promise<string> {
    const answer = await mark(designId, "5", cookie);
    expect(answer.status).toBe(404);
    return (await wireOf(answer)).replaceAll(designId, "ID");
  }

  it("gets one byte-identical 404 whether it is deleted by its client, a visitor's draft or unknown, and leaves no row", async () => {
    const deleted = plantSeenKitchen({ isDeletedByClient: true });
    const visitorDraft = plantSeenKitchen({
      isSent: false,
      hasAccount: false,
    });
    const unknownId = aDesignId();
    const cookie = await operatorCookie();

    const refusals = [
      await refusalOf(deleted.designId, cookie),
      await refusalOf(visitorDraft.designId, cookie),
      await refusalOf(unknownId, cookie),
    ];

    expect(new Set(refusals).size).toBe(1);
    expect(seen.ledger.heldEvents()).toEqual([]);
    expect(seen.store.heldSeenRevision(deleted.designId)).toBeUndefined();
  });

  it("answers a malformed id the same 404 without asking the store", async () => {
    const answer = await mark("not an id!", "5", await operatorCookie());

    expect(answer.status).toBe(404);
    expect(await jsonOf(answer)).toEqual(
      await jsonOf(designNotFoundResponse("not an id!")),
    );
    nothingWasWritten();
  });
});

describe("a displayed revision that is not a revision", () => {
  const REFUSED: readonly [
    string,
    unknown,
    "MISSING_VALUE" | "NOT_A_REVISION",
  ][] = [
    ["a leading zero", "05", "NOT_A_REVISION"],
    ["zero", "0", "NOT_A_REVISION"],
    ["twenty digits", "10000000000000000000", "NOT_A_REVISION"],
    ["one above the widest bigint", "9223372036854775808", "NOT_A_REVISION"],
    ["nineteen nines", "9999999999999999999", "NOT_A_REVISION"],
    ["letters", "abc", "NOT_A_REVISION"],
    ["an exponent", "1e3", "NOT_A_REVISION"],
    ["a sign", "-1", "NOT_A_REVISION"],
    ["a space", " 1", "NOT_A_REVISION"],
    ["an empty string", "", "NOT_A_REVISION"],
    ["a number", 5, "MISSING_VALUE"],
    ["null", null, "MISSING_VALUE"],
  ];

  it.each(REFUSED)(
    "refuses %s with 400 naming the member and a code, never the value, before the store",
    async (_name, value, code) => {
      const { designId } = plantSeenKitchen();

      const answer = await mark(designId, value, await operatorCookie());

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "displayedRevision", code }],
      });
      nothingWasWritten();
      expect(seen.store.heldSeenRevision(designId)).toBeUndefined();
    },
  );

  it("refuses a body without the member as MISSING_VALUE", async () => {
    const { designId } = plantSeenKitchen();

    const answer = await POST(
      seenRequest(designId, { json: {}, cookie: await operatorCookie() }),
      { params: Promise.resolve({ id: designId }) },
    );

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "displayedRevision", code: "MISSING_VALUE" }],
    });
    nothingWasWritten();
  });

  it("refuses a body with another member as an invalid request", async () => {
    const { designId } = plantSeenKitchen();

    const answer = await POST(
      seenRequest(designId, {
        json: { displayedRevision: "5", seenBy: "someone" },
        cookie: await operatorCookie(),
      }),
      { params: Promise.resolve({ id: designId }) },
    );

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    nothingWasWritten();
  });
});

describe("a mark fails closed", () => {
  it("is 503 with no detail when the audit row cannot be written, and no mark is stored", async () => {
    const { designId } = plantSeenKitchen();
    const cookie = await operatorCookie();
    seen.failAudit = true;

    const answer = await mark(designId, "5", cookie);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(seen.calls).toEqual(["changes.markSeen"]);
    expect(seen.store.heldSeenRevision(designId)).toBeUndefined();
    expect(seen.ledger.heldEvents()).toEqual([]);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("is 503, not 401, when the session ends between the admission and the row", async () => {
    const { designId } = plantSeenKitchen();
    const staff = await signedInAs({ role: "operator" });
    const stage = seen.ledger.stage.bind(seen.ledger);
    vi.spyOn(seen.ledger, "stage").mockImplementationOnce(async (request) => {
      await world.sessions.revokeAllForAccount(staff.account.id);
      return stage(request);
    });

    const answer = await mark(designId, "5", staff.session.cookie);

    expect(answer.status).toBe(503);
    expect(seen.store.heldSeenRevision(designId)).toBeUndefined();
    expect(seen.ledger.heldEvents()).toEqual([]);
  });

  it("is 503 with no detail when the store fails, and its message reaches no response or log", async () => {
    const { designId } = plantSeenKitchen();
    seen.failStore = true;

    const answer = await mark(designId, "5", await operatorCookie());

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(seen.ledger.heldEvents()).toEqual([]);
  });

  it("is 503 without asking the store when the account's bucket cannot be counted", async () => {
    const { designId } = plantSeenKitchen();
    limiterLedger.unavailable.add(STAFF_SEEN_BY_ACCOUNT_POLICY.name);

    const answer = await mark(designId, "5", await operatorCookie());

    expect(answer.status).toBe(503);
    nothingWasWritten();
  });
});

describe("the account's bucket", () => {
  it("is 600 an hour, counted in its own policy", () => {
    expect([
      STAFF_SEEN_BY_ACCOUNT_POLICY.name,
      STAFF_SEEN_BY_ACCOUNT_POLICY.figure,
      STAFF_SEEN_BY_ACCOUNT_POLICY.window,
    ]).toEqual([
      "staff-seen-by-account-per-60-utc-minutes",
      600,
      { kind: "utc-minutes", minutes: 60 },
    ]);
  });

  it("refuses with 429 and a wait within the window above the figure, without asking the store", async () => {
    const { designId } = plantSeenKitchen();
    limiterLedger.refusing.set(STAFF_SEEN_BY_ACCOUNT_POLICY.name, 1);

    const answer = await mark(designId, "5", await operatorCookie());

    expect(answer.status).toBe(429);
    expectAWaitWithinTheWindowOf(answer, STAFF_SEEN_BY_ACCOUNT_POLICY.name);
    nothingWasWritten();
  });

  it("counts a valid mark once in its own bucket, and a malformed revision not at all", async () => {
    const { designId } = plantSeenKitchen();
    const cookie = await operatorCookie();
    await mark(designId, "05", cookie);
    expect(limiterLedger.counted).not.toContain(
      STAFF_SEEN_BY_ACCOUNT_POLICY.name,
    );

    await mark(designId, "5", cookie);

    expect(
      limiterLedger.counted.filter(
        (name) => name === STAFF_SEEN_BY_ACCOUNT_POLICY.name,
      ),
    ).toHaveLength(1);
  });
});
