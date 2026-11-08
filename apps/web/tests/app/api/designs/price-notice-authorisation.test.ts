import { createHash } from "node:crypto";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import { InvalidDesignError } from "@lemnaria/configurator-domain";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { designNotFoundResponse } from "@/lib/server/design-errors";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import {
  SAVE_BY_BLOCK_POLICY,
  SAVE_BY_CREDENTIAL_POLICY,
} from "@/lib/server/rate-limit/limit-policy";

import {
  DRIVER_FAILURE_MARKER,
  READ_POLICY_NAME,
  SAVE_BY_ACCOUNT_POLICY_NAME,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  seedSession,
  seedVerifiedAccount,
  wireOf,
  type AccountWorld,
  type SeededAccount,
  type SeededSession,
} from "../../../support/account-world";
import {
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  NOTICE_DESIGN_ID,
  OWNER_WRITE_COOKIE,
  OWNER_WRITE_TOKEN_HASH,
  VISITOR_COOKIE,
  WRITE_COOKIE_NAME,
  freshEditableDesigns,
  makePriceStoresReject,
  type StubEditableDesigns,
} from "../../../support/price-notice-stubs";
import {
  acknowledge,
  cookieOf,
  readNotice,
  type NoticeRequestInit,
} from "../../../support/price-notice-world";
import { signedInAs } from "../../../support/staff-world";

/**
 * M10 R5b-a, R5b-c, R5b-e and R5b-l at the two routes (ADR 0178, price-notice Amendment of 2026-11-08): who may ask, the
 * order the checks run in, what each refusal says, and that neither route writes a design. The routes are the real ones;
 * the stores are the persistence package's fakes in the price dashboard world, the sessions the account world's, and
 * S7's port is stubbed through `@/lib/server/repository`, which has no write to call.
 */

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-notice-stubs").then((world) =>
    world.rejectablePriceStoresModule(),
  ),
);
vi.mock("@/lib/server/repository", () =>
  import("../../../support/price-notice-stubs").then((world) =>
    world.editableRepositoryModule(),
  ),
);

const ENDPOINTS = [
  { label: "GET price-notice", send: readNotice },
  { label: "POST price-notice/acknowledge", send: acknowledgeWithPair },
] as const;

let accountWorld: AccountWorld;
let priceWorld: PriceDashboardWorld;
let editable: StubEditableDesigns;
let owner: SeededAccount;
let ownerSession: SeededSession;

beforeEach(async () => {
  accountWorld = freshAccountWorld();
  priceWorld = await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  editable = freshEditableDesigns();
  makePriceStoresReject(undefined);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  limiterLedger.subjects.push({
    kind: "write-credential",
    subject: OWNER_WRITE_TOKEN_HASH,
  });
  owner = await seedVerifiedAccount({ email: "owner@example.test" });
  ownerSession = await seedSession(owner);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The pair the page displayed: the version the world published and the head as it stands. */
async function displayedPair() {
  const head = await priceWorld.stores.availability.readCurrent();
  return {
    versionId: priceWorld.versionId,
    availabilityRevision: head.revision,
  };
}

async function acknowledgeWithPair(
  init: NoticeRequestInit = {},
): Promise<Response> {
  return acknowledge({ json: await displayedPair(), ...init });
}

function claimedByOwner(): void {
  editable.plant({
    id: NOTICE_DESIGN_ID,
    writeTokenHash: undefined,
    accountId: owner.id,
  });
}

/** Teaches the limiter's ledger the bucket of a write token a test presents, so a counted bucket is never unnamed. */
function knowWriteToken(token: string): string {
  limiterLedger.subjects.push({
    kind: "write-credential",
    subject: createHash("sha256").update(token, "utf8").digest("hex"),
  });
  return `${WRITE_COOKIE_NAME}=${token}`;
}

async function notFoundWire(id = NOTICE_DESIGN_ID): Promise<string> {
  return wireOf(designNotFoundResponse(id));
}

// ---------------------------------------------------------------------------------------------------------------------
// R5b-a

describe.each(ENDPOINTS)("$label: who may ask", ({ send }) => {
  it("serves the right write token with no visitor cookie, and asks the port with that token alone", async () => {
    const answer = await send({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(200);
    expect(editable.calls).toEqual([
      {
        id: NOTICE_DESIGN_ID,
        credential: { kind: "write-token", hash: OWNER_WRITE_TOKEN_HASH },
      },
    ]);
  });

  it("never lets a visitor cookie join the token: the credential is the token's alone", async () => {
    await send({ cookie: cookieOf(OWNER_WRITE_COOKIE, VISITOR_COOKIE) });

    expect(editable.calls.map(({ credential }) => credential)).toEqual([
      { kind: "write-token", hash: OWNER_WRITE_TOKEN_HASH },
    ]);
  });

  it("serves the session of the account that owns the design, with the account as the credential", async () => {
    claimedByOwner();

    const answer = await send({ cookie: ownerSession.cookie });

    expect(answer.status).toBe(200);
    expect(editable.calls.map(({ credential }) => credential)).toEqual([
      { kind: "account", accountId: owner.id },
    ]);
  });

  it("serves a token on a design an account has claimed: the token arm asks no account", async () => {
    const other = await seedVerifiedAccount({ email: "other@example.test" });
    editable.plant({ id: NOTICE_DESIGN_ID, accountId: other.id });

    const answer = await send({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(200);
  });

  it("refuses with no credential at all, and asks neither the port nor the stores", async () => {
    const answer = await send({});

    expect(answer.status).toBe(404);
    expect(await wireOf(answer)).toBe(await notFoundWire());
    expect(editable.calls).toEqual([]);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("refuses a wrong token as it refuses a missing design, after the port said none", async () => {
    const answer = await send({
      cookie: knowWriteToken("another-browsers-token"),
    });

    expect(answer.status).toBe(404);
    expect(await wireOf(answer)).toBe(await notFoundWire());
    expect(editable.calls).toHaveLength(1);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("refuses a session that is not the owner's", async () => {
    const stranger = await seedVerifiedAccount({
      email: "stranger@example.test",
    });
    const strangerSession = await seedSession(stranger);
    claimedByOwner();

    const answer = await send({ cookie: strangerSession.cookie });

    expect(answer.status).toBe(404);
    expect(await wireOf(answer)).toBe(await notFoundWire());
    expect(priceStoreAsks.count).toBe(0);
  });

  it("refuses the owning session on a design no account has claimed", async () => {
    const answer = await send({ cookie: ownerSession.cookie });

    expect(answer.status).toBe(404);
    expect(await wireOf(answer)).toBe(await notFoundWire());
  });

  it.each(["operator", "administrator"] as const)(
    "gives a %s session no credential: refused, and the port is not asked",
    async (role) => {
      const staff = await signedInAs({ role }, `${role}@example.test`);

      const answer = await send({ cookie: staff.session.cookie });

      expect(answer.status).toBe(404);
      expect(await wireOf(answer)).toBe(await notFoundWire());
      expect(editable.calls).toEqual([]);
      expect(priceStoreAsks.count).toBe(0);
    },
  );

  it("refuses a hidden or deleted design to its own token, as a design that does not exist", async () => {
    editable.plant({ id: NOTICE_DESIGN_ID, isHidden: true });

    const answer = await send({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(404);
    expect(await wireOf(answer)).toBe(await notFoundWire());
  });
});

describe.each(ENDPOINTS)("$label: a request from another site", ({ send }) => {
  it.each(["cross-site", "same-site", "none"])(
    "refuses a valid token under Sec-Fetch-Site %s before any store is asked",
    async (secFetchSite) => {
      const answer = await send({ cookie: OWNER_WRITE_COOKIE, secFetchSite });

      expect(answer.status).toBe(404);
      expect(await wireOf(answer)).toBe(await notFoundWire());
      expect(editable.calls).toEqual([]);
      expect(priceStoreAsks.count).toBe(0);
    },
  );

  it("refuses a valid session from a same-site sibling, and reads no session for it", async () => {
    claimedByOwner();
    accountWorld.calls.length = 0;

    const answer = await send({
      cookie: ownerSession.cookie,
      secFetchSite: "same-site",
    });

    expect(answer.status).toBe(404);
    expect(editable.calls).toEqual([]);
    expect(accountWorld.calls).toEqual([]);
  });

  it("refuses a foreign Origin when the browser sent no Sec-Fetch-Site", async () => {
    const answer = await send({
      cookie: OWNER_WRITE_COOKIE,
      secFetchSite: null,
      headers: { origin: "https://evil.example" },
    });

    expect(answer.status).toBe(404);
    expect(editable.calls).toEqual([]);
  });
});

describe.each(ENDPOINTS)("$label: an id that is not a design's", ({ send }) => {
  it.each([
    ["too short", "abc"],
    ["twenty characters", "V1StGXR8Z5jdHi6BmyT_"],
    ["twenty-two characters", "V1StGXR8Z5jdHi6BmyT_ab"],
    ["a NUL byte", "V1StGXR8Z5jdHi6BmyT_\u0000"],
    ["a slash", "V1StGXR8Z5jdHi6BmyT/a"],
  ])("refuses %s with the 404 and asks no store", async (_label, id) => {
    const answer = await send({ id, cookie: `${WRITE_COOKIE_NAME}=t` });

    expect(answer.status).toBe(404);
    expect(await wireOf(answer)).toBe(await notFoundWire(id));
    expect(editable.calls).toEqual([]);
    expect(priceStoreAsks.count).toBe(0);
  });
});

describe("the 404 is the design route's own", () => {
  it("is the answer GET /api/designs/{id} gives a request with no credential, byte for byte", async () => {
    const { GET: designRoute } = await import(
      "../../../../src/app/api/designs/[id]/route"
    );
    const designAnswer = await designRoute(
      new NextRequest(`https://lemnaria.test/api/designs/${NOTICE_DESIGN_ID}`, {
        headers: { "sec-fetch-site": "same-origin" },
      }),
      { params: Promise.resolve({ id: NOTICE_DESIGN_ID }) },
    );

    const noticeAnswer = await readNotice({});

    expect(await wireOf(noticeAnswer)).toBe(await wireOf(designAnswer));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// R5b-c

describe("GET: the read limiter comes first and fails open", () => {
  it("answers 429 before any cookie, session, port or store is read, to an owner and to a stranger alike", async () => {
    limiterLedger.refusing.set(READ_POLICY_NAME, 120);
    accountWorld.calls.length = 0;

    const toOwner = await readNotice({ cookie: ownerSession.cookie });
    const toStranger = await readNotice({});

    expect(toOwner.status).toBe(429);
    expect(toStranger.status).toBe(429);
    expect(accountWorld.calls).toEqual([]);
    expect(editable.calls).toEqual([]);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("counts one read bucket for a request it serves, and nothing for the credential", async () => {
    const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(200);
    expect(limiterLedger.counted).toEqual([READ_POLICY_NAME]);
  });

  it("serves the notice when the limiter cannot judge", async () => {
    limiterLedger.unavailable.add(READ_POLICY_NAME);

    const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(200);
  });
});

describe("POST: the save limiter comes after the credential and before the body", () => {
  it("spends no save token on a request that has no credential, a wrong one or another site's", async () => {
    await acknowledgeWithPair({});
    await acknowledgeWithPair({
      cookie: OWNER_WRITE_COOKIE,
      secFetchSite: "cross-site",
    });
    await acknowledgeWithPair({ id: "short" });

    expect(limiterLedger.counted).toEqual([]);
  });

  it("does count a token that is wrong: the credential is a hash the limiter takes before the load, behind the block's own bucket", async () => {
    await acknowledgeWithPair({ cookie: knowWriteToken("wrong") });

    expect(limiterLedger.counted).toEqual([
      SAVE_BY_BLOCK_POLICY.name,
      SAVE_BY_CREDENTIAL_POLICY.name,
    ]);
  });

  it("counts the block and then the token's own bucket for the token arm", async () => {
    await acknowledgeWithPair({ cookie: OWNER_WRITE_COOKIE });

    expect(limiterLedger.counted).toEqual([
      SAVE_BY_BLOCK_POLICY.name,
      SAVE_BY_CREDENTIAL_POLICY.name,
    ]);
  });

  it("counts the block and then the account's bucket for the account arm", async () => {
    claimedByOwner();

    await acknowledgeWithPair({ cookie: ownerSession.cookie });

    expect(limiterLedger.counted).toEqual([
      SAVE_BY_BLOCK_POLICY.name,
      SAVE_BY_ACCOUNT_POLICY_NAME,
    ]);
  });

  it("answers 429 from a refusing bucket before the media type is judged and before the port is asked", async () => {
    limiterLedger.refusing.set(SAVE_BY_CREDENTIAL_POLICY.name, 120);

    const answer = await acknowledge({
      cookie: OWNER_WRITE_COOKIE,
      json: "not json at all",
      contentType: "text/plain",
    });

    expect(answer.status).toBe(429);
    expect(editable.calls).toEqual([]);
  });

  it("fails closed: 503, a constant body and no marker, when the bucket cannot be judged", async () => {
    limiterLedger.unavailable.add(SAVE_BY_CREDENTIAL_POLICY.name);

    const answer = await acknowledgeWithPair({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({
      code: "SAVE_UNAVAILABLE",
      error: "A save cannot be made right now.",
    });
    expect(editable.calls).toEqual([]);
    expect(
      await priceWorld.stores.notices.readAcknowledged(NOTICE_DESIGN_ID),
    ).toEqual({ kind: "never-recorded" });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The failures: never folded into the 404

describe.each(ENDPOINTS)("$label: a read or a store that fails", ({ send }) => {
  it("answers a stored design this build cannot read with the design routes' own 500", async () => {
    editable.rejection = new InvalidDesignError("unreadable-for-test");

    const answer = await send({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(500);
    expect(await jsonOf(answer)).toEqual({
      code: "DESIGN_UNREADABLE",
      error: "Design could not be loaded.",
    });
  });

  it("answers a driver failure with a constant 503 that holds none of its text, and logs none of it either", async () => {
    editable.rejection = new Error(DRIVER_FAILURE_MARKER);

    const answer = await send({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      DRIVER_FAILURE_MARKER,
    );
  });

  it("answers a price store provider that rejects with a plain Error, as a connection string the driver refuses does, with the same 503", async () => {
    makePriceStoresReject(new Error(`${DRIVER_FAILURE_MARKER} database url`));

    const answer = await send({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(await answer.clone().text()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// R5b-e and R5b-l

describe("neither route writes a design, an audit row or anything but a marker", () => {
  it("asks the port for a read alone and leaves the audit ledger as it was", async () => {
    const before = priceWorld.ledger.heldEvents().length;

    await readNotice({ cookie: OWNER_WRITE_COOKIE });
    await acknowledgeWithPair({ cookie: OWNER_WRITE_COOKIE });

    expect(priceWorld.ledger.heldEvents()).toHaveLength(before);
    expect(editable).not.toHaveProperty("saveAuthorized");
    expect(editable).not.toHaveProperty("mint");
    expect(editable.calls).toHaveLength(2);
  });
});

describe.each(ENDPOINTS)("$label: every 200", ({ send }) => {
  it("carries the per-credential headers", async () => {
    const answer = await send({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(answer.headers.get("vary")).toBe("Cookie");
  });

  it("holds no design, revision, hash, account, label or token", async () => {
    claimedByOwner();
    const text = await (await send({ cookie: ownerSession.cookie })).text();

    for (const forbidden of [
      '"placements":',
      '"revision":',
      OWNER_WRITE_TOKEN_HASH,
      owner.id,
      owner.email,
      "Version 1",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("the exact keys of each answer", () => {
  it("is {kind, isSent, current, pricesChanged, replacementsRequired, removedAccessories} on the active arm", async () => {
    const body = (await jsonOf(
      await readNotice({ cookie: OWNER_WRITE_COOKIE }),
    )) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(
      [
        "current",
        "isSent",
        "kind",
        "pricesChanged",
        "removedAccessories",
        "replacementsRequired",
      ].sort(),
    );
    expect(Object.keys(body.current as object).sort()).toEqual([
      "availabilityRevision",
      "versionId",
    ]);
  });

  it("is {kind, isSent} on the arm with no active version", async () => {
    priceWorld = await freshPriceDashboardWorld({ isPublished: false });

    const body = (await jsonOf(
      await readNotice({ cookie: OWNER_WRITE_COOKIE }),
    )) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(["isSent", "kind"]);
    expect(body.kind).toBe("no-active-version");
  });

  it("is {acknowledged: {versionId, availabilityRevision}} for an acknowledgement", async () => {
    const body = (await jsonOf(
      await acknowledgeWithPair({ cookie: OWNER_WRITE_COOKIE }),
    )) as { acknowledged: Record<string, unknown> };

    expect(Object.keys(body)).toEqual(["acknowledged"]);
    expect(Object.keys(body.acknowledged).sort()).toEqual([
      "availabilityRevision",
      "versionId",
    ]);
  });

  it("is {status} for a refusal of the pair", async () => {
    const answer = await acknowledge({
      cookie: OWNER_WRITE_COOKIE,
      json: { ...(await displayedPair()), availabilityRevision: "99" },
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "revision-ahead" });
  });
});
