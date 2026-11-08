import { createHash } from "node:crypto";

import {
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  type CatalogueAvailability,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { DashboardStoreError } from "@lemnaria/persistence";
import fc from "fast-check";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as acknowledgeRoute from "@/app/api/designs/[id]/price-notice/acknowledge/route";
import * as noticeRoute from "@/app/api/designs/[id]/price-notice/route";
import { pricesChangedFor, type Kitchen } from "@/lib/server/price-notice";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import {
  SAVE_BY_BLOCK_POLICY,
  SAVE_BY_CREDENTIAL_POLICY,
} from "@/lib/server/rate-limit/limit-policy";
import { shippedDeepeningRows } from "@/price/deepening-rows";
import { priceAgainstBook } from "@/price/price-book-root";

import {
  ORIGIN,
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
  administrator,
  writeWithoutJudgement,
  type Administrator,
} from "../../../support/availability-route-world";
import {
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  NOTICE_DESIGN_ID,
  OWNER_WRITE_COOKIE,
  OWNER_WRITE_TOKEN_HASH,
  WRITE_COOKIE_NAME,
  freshEditableDesigns,
  makePriceStoresReject,
  type StubEditableDesigns,
} from "../../../support/price-notice-stubs";
import {
  acknowledge,
  acknowledgeRequest,
  cookieOf,
  readNotice,
} from "../../../support/price-notice-world";

/**
 * M10 R5b, adversarial: counterexamples to the two public price-notice routes (ADR 0178, price-notice Amendment of
 * 2026-11-08). The routes are the real ones over the persistence package's fakes in the price dashboard world; S7's port is
 * stubbed through `@/lib/server/repository`, where every OTHER repository getter throws, so a route that reached for a
 * design write, a share link or a preset would fail here by name.
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
vi.mock("@/lib/server/repository", async () => {
  const world = await import("../../../support/price-notice-stubs");
  const forbidden = (name: string) => () => {
    throw new Error(`a price-notice route reached for ${name}`);
  };
  return {
    ...world.editableRepositoryModule(),
    getRepository: forbidden("getRepository"),
    getAuthorizedDesignRepository: forbidden("getAuthorizedDesignRepository"),
    getShareLinkRepository: forbidden("getShareLinkRepository"),
    getSentKitchenViewRepository: forbidden("getSentKitchenViewRepository"),
    getPresetRepository: forbidden("getPresetRepository"),
  };
});

let accountWorld: AccountWorld;
let priceWorld: PriceDashboardWorld;
let editable: StubEditableDesigns;
let owner: SeededAccount;
let ownerSession: SeededSession;
let staff: Administrator;

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
  staff = await administrator();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function headNow(): Promise<string> {
  return (await priceWorld.stores.availability.readCurrent()).revision;
}

async function activeVersionId(): Promise<string> {
  const active = await priceWorld.stores.priceBook.readActive();
  if (active.kind !== "found") throw new Error("no active version");
  return active.version.versionId;
}

async function displayedPair() {
  return {
    versionId: await activeVersionId(),
    availabilityRevision: await headNow(),
  };
}

function marker() {
  return priceWorld.stores.notices.readAcknowledged(NOTICE_DESIGN_ID);
}

function claimedByOwner(): void {
  editable.plant({
    id: NOTICE_DESIGN_ID,
    writeTokenHash: undefined,
    accountId: owner.id,
  });
}

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

function logText(): string {
  return JSON.stringify(vi.mocked(console.error).mock.calls);
}

/** Teaches the limiter's ledger the bucket of a write token a test presents, so a counted bucket is never unnamed. */
function knowWriteToken(token: string): string {
  limiterLedger.subjects.push({
    kind: "write-credential",
    subject: createHash("sha256").update(token, "utf8").digest("hex"),
  });
  return `${WRITE_COOKIE_NAME}=${token}`;
}

async function ackWith(
  json: unknown,
  init: { contentType?: string | null; cookie?: string } = {},
): Promise<Response> {
  return acknowledge({
    cookie: OWNER_WRITE_COOKIE,
    json,
    ...init,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The route modules themselves

describe("the route modules", () => {
  it("export exactly one handler each, beside runtime and dynamic: no other method is a writer", () => {
    expect(Object.keys(noticeRoute).sort()).toEqual([
      "GET",
      "dynamic",
      "runtime",
    ]);
    expect(Object.keys(acknowledgeRoute).sort()).toEqual([
      "POST",
      "dynamic",
      "runtime",
    ]);
    expect(noticeRoute.runtime).toBe("nodejs");
    expect(acknowledgeRoute.runtime).toBe("nodejs");
    expect(noticeRoute.dynamic).toBe("force-dynamic");
    expect(acknowledgeRoute.dynamic).toBe("force-dynamic");
  });

  it("never set a cookie, on any answer, the 200s included", async () => {
    claimedByOwner();
    const pair = await displayedPair();
    const answers = [
      await readNotice({ cookie: ownerSession.cookie }),
      await readNotice({ cookie: ownerSession.cookie }),
      await readNotice({}),
      await acknowledge({ cookie: ownerSession.cookie, json: pair }),
      await acknowledge({ cookie: ownerSession.cookie, json: {} }),
      await acknowledge({
        cookie: ownerSession.cookie,
        json: { ...pair, availabilityRevision: "99" },
      }),
      await acknowledge({ cookie: ownerSession.cookie, json: "{" }),
      await acknowledge({}),
    ];

    for (const answer of answers) {
      expect(answer.headers.get("set-cookie")).toBeNull();
      expect(answer.headers.getSetCookie()).toEqual([]);
    }
  });

  it("answer an owner through the stubbed port alone: no other repository getter is called, and no session is touched", async () => {
    claimedByOwner();
    const pair = await displayedPair();
    accountWorld.calls.length = 0;

    const read = await readNotice({ cookie: ownerSession.cookie });
    const wrote = await acknowledge({
      cookie: ownerSession.cookie,
      json: pair,
    });

    expect(read.status).toBe(200);
    expect(wrote.status).toBe(200);
    expect(accountWorld.calls).not.toContain("sessions.touch");
    expect(
      accountWorld.calls.filter((call) => call.startsWith("sessions.")),
    ).toEqual(["sessions.findLive", "sessions.findLive"]);
    expect(
      accountWorld.calls.filter((call) => !call.startsWith("sessions.")),
    ).toEqual([]);
  });

  it("leave the kitchens an account holds exactly as they were across an owner's GET and POST", async () => {
    claimedByOwner();
    const before = JSON.stringify(accountWorld.kitchens);

    await readNotice({ cookie: ownerSession.cookie });
    await acknowledge({
      cookie: ownerSession.cookie,
      json: await displayedPair(),
    });

    expect(JSON.stringify(accountWorld.kitchens)).toBe(before);
    expect(editable.calls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// R5b-a: the refusals are one answer

const ENDPOINTS = [
  {
    label: "GET",
    send: (init: Parameters<typeof readNotice>[0]) => readNotice(init),
  },
  {
    label: "POST",
    send: async (init: Parameters<typeof readNotice>[0]) =>
      acknowledge({ json: await displayedPair(), ...init }),
  },
] as const;

describe.each(ENDPOINTS)(
  "$label: every refusal is the missing design's 404",
  ({ send }) => {
    it("is byte for byte (status, headers, body) the same for all eight causes, and the design route's own for that id", async () => {
      const other = await seedVerifiedAccount({ email: "other@example.test" });
      const otherSession = await seedSession(other);
      claimedByOwner();
      const { GET: designGet } = await import("@/app/api/designs/[id]/route");
      const reference = await wireOf(
        await designGet(
          new NextRequest(`${ORIGIN}/api/designs/${NOTICE_DESIGN_ID}`, {
            headers: { "sec-fetch-site": "same-origin" },
          }),
          paramsOf(NOTICE_DESIGN_ID),
        ),
      );
      const staffSession = await (
        await import("../../../support/staff-world")
      ).signedInAs({ role: "operator" }, "operator@example.test");

      const refused = [
        await send({}),
        await send({ cookie: knowWriteToken("not-the-token") }),
        await send({ cookie: OWNER_WRITE_COOKIE }),
        await send({ cookie: otherSession.cookie }),
        await send({ cookie: staffSession.session.cookie }),
        await send({ cookie: ownerSession.cookie, secFetchSite: "cross-site" }),
        await send({ cookie: ownerSession.cookie, secFetchSite: "same-site" }),
        await send({ cookie: ownerSession.cookie, secFetchSite: "none" }),
      ];

      expect(refused.map(({ status }) => status)).toEqual(Array(8).fill(404));
      for (const answer of refused)
        expect(await wireOf(answer)).toBe(reference);
    });

    it("is the same 404 for a design that is hidden or deleted as for one that never existed", async () => {
      const neverExisted = await send({
        id: "ZZZZZZZZZZZZZZZZZZZZZ",
        cookie: knowWriteToken("x").replace(
          NOTICE_DESIGN_ID,
          "ZZZZZZZZZZZZZZZZZZZZZ",
        ),
      });
      editable.plant({ id: NOTICE_DESIGN_ID, isHidden: true });

      const hidden = await send({ cookie: OWNER_WRITE_COOKIE });

      expect(hidden.status).toBe(404);
      expect(await neverExisted.clone().json()).toEqual({
        error: expect.stringContaining("ZZZZZZZZZZZZZZZZZZZZZ") as string,
      });
      expect(await jsonOf(hidden)).toEqual({
        error: expect.stringContaining(NOTICE_DESIGN_ID) as string,
      });
      expect([...hidden.headers].sort()).toEqual(
        [...neverExisted.headers].sort(),
      );
    });

    it.each([
      ["a NUL", "V1StGXR8Z5jdHi6BmyT_\u0000"],
      ["twenty characters", "V1StGXR8Z5jdHi6BmyT_"],
      ["twenty-two characters", "V1StGXR8Z5jdHi6BmyT_aa"],
      ["twenty-one non-ASCII letters", "é".repeat(21)],
      ["a path", "../../etc/passwd"],
      ["an encoded slash", "V1StGXR8Z5jdHi6BmyT%2Fa"],
      ["a trailing newline", "V1StGXR8Z5jdHi6BmyT_\n"],
      ["a space", "V1StGXR8Z5jdHi6BmyT_ "],
      ["five thousand characters", "A".repeat(5000)],
      ["nothing", ""],
    ])(
      "answers %s as the design route answers that same id, and reads no session, store or port",
      async (_label, id) => {
        const { GET: designGet } = await import("@/app/api/designs/[id]/route");
        const designAnswer = await designGet(
          new NextRequest(`${ORIGIN}/api/designs/x`, {
            headers: { "sec-fetch-site": "same-origin" },
          }),
          paramsOf(id),
        );
        accountWorld.calls.length = 0;
        priceStoreAsks.count = 0;

        const answer = await send({
          id,
          cookie: cookieOf(
            // A control character cannot be in a cookie's name, so those ids come with the session alone.
            Array.from(id).some((character) => character.charCodeAt(0) <= 32)
              ? undefined
              : `${WRITE_COOKIE_NAME.replace(NOTICE_DESIGN_ID, id)}=a-token`,
            ownerSession.cookie,
          ),
        });

        expect(answer.status).toBe(404);
        expect(await wireOf(answer)).toBe(await wireOf(designAnswer));
        expect(accountWorld.calls).toEqual([]);
        expect(editable.calls).toEqual([]);
        expect(priceStoreAsks.count).toBe(0);
      },
    );
  },
);

describe.each(ENDPOINTS)(
  "$label: a design an account has claimed",
  ({ send }) => {
    it("refuses the old token even beside the owning session, as the save does: the token arm is chosen and is the only one asked", async () => {
      claimedByOwner();

      const answer = await send({
        cookie: cookieOf(OWNER_WRITE_COOKIE, ownerSession.cookie),
      });

      expect(answer.status).toBe(404);
      expect(editable.calls.map(({ credential }) => credential)).toEqual([
        { kind: "write-token", hash: OWNER_WRITE_TOKEN_HASH },
      ]);
    });

    it("serves the owning session once the browser holds no token", async () => {
      claimedByOwner();

      const answer = await send({ cookie: ownerSession.cookie });

      expect(answer.status).toBe(200);
    });

    it("refuses a token cookie of another design, an empty one, and a session that has expired", async () => {
      claimedByOwner();
      const empty = `${WRITE_COOKIE_NAME}=`;
      const another = `lemnaria_write_token_ZZZZZZZZZZZZZZZZZZZZZ=${"t".repeat(30)}`;
      accountWorld.advance(1000 * 24 * 3600 * 1000);

      for (const cookie of [empty, another, ownerSession.cookie]) {
        const answer = await send({ cookie });
        expect(answer.status, cookie).toBe(404);
      }
      expect(editable.calls.map(({ credential }) => credential)).toEqual([]);
    });
  },
);

describe.each(ENDPOINTS)(
  "$label: the cross-site refusal comes before any cookie",
  ({ send }) => {
    it.each([
      ["an empty Sec-Fetch-Site", { secFetchSite: "" }],
      ["an upper-case SAME-ORIGIN", { secFetchSite: "SAME-ORIGIN" }],
      [
        "an Origin of null and no Sec-Fetch-Site",
        { secFetchSite: null, headers: { origin: "null" } },
      ],
      [
        "a sibling Origin and no Sec-Fetch-Site",
        {
          secFetchSite: null,
          headers: { origin: "https://sibling.lemnaria.test" },
        },
      ],
      [
        "this site's Origin on another scheme",
        { secFetchSite: null, headers: { origin: "http://lemnaria.test" } },
      ],
    ])(
      "refuses %s, with a token and a session, and reads neither",
      async (_label, init) => {
        claimedByOwner();
        accountWorld.calls.length = 0;

        const answer = await send({
          cookie: cookieOf(OWNER_WRITE_COOKIE, ownerSession.cookie),
          ...init,
        });

        expect(answer.status).toBe(404);
        expect(editable.calls).toEqual([]);
        expect(accountWorld.calls).toEqual([]);
        expect(priceStoreAsks.count).toBe(0);
      },
    );

    it("serves a request that sent no Sec-Fetch-Site and an Origin that is this site's", async () => {
      const answer = await send({
        cookie: OWNER_WRITE_COOKIE,
        secFetchSite: null,
        headers: { origin: ORIGIN },
      });

      expect(answer.status).toBe(200);
    });

    it("serves a request that sent neither header, as a same-origin script's fetch of an old browser does", async () => {
      const answer = await send({
        cookie: OWNER_WRITE_COOKIE,
        secFetchSite: null,
      });

      expect(answer.status).toBe(200);
    });
  },
);

describe("POST: a refusal reads no body", () => {
  async function bodyUsedAfter(
    init: Parameters<typeof acknowledgeRequest>[0],
  ): Promise<{ status: number; wasRead: boolean }> {
    const request = acknowledgeRequest({
      json: await displayedPair(),
      ...init,
    });
    const answer = await acknowledgeRoute.POST(
      request,
      paramsOf(NOTICE_DESIGN_ID),
    );
    return { status: answer.status, wasRead: request.bodyUsed };
  }

  it("neither for no credential, nor another site, nor a malformed id, nor a refusing bucket, nor a limiter that cannot judge", async () => {
    const noCredential = await bodyUsedAfter({});
    const crossSite = await bodyUsedAfter({
      cookie: OWNER_WRITE_COOKIE,
      secFetchSite: "cross-site",
    });
    limiterLedger.refusing.set(SAVE_BY_CREDENTIAL_POLICY.name, 120);
    const refusing = await bodyUsedAfter({ cookie: OWNER_WRITE_COOKIE });
    limiterLedger.refusing.clear();
    limiterLedger.unavailable.add(SAVE_BY_BLOCK_POLICY.name);
    const unjudged = await bodyUsedAfter({ cookie: OWNER_WRITE_COOKIE });

    expect([noCredential, crossSite, refusing, unjudged]).toEqual([
      { status: 404, wasRead: false },
      { status: 404, wasRead: false },
      { status: 429, wasRead: false },
      { status: 503, wasRead: false },
    ]);
  });

  it("not for a media type that is not JSON either", async () => {
    const answer = await bodyUsedAfter({
      cookie: OWNER_WRITE_COOKIE,
      contentType: "text/plain",
    });

    expect(answer).toEqual({ status: 415, wasRead: false });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// R5b-c: the buckets

describe("the buckets (ruling 3)", () => {
  it("counts one read token for a GET whatever it is refused for, and never a save bucket", async () => {
    await readNotice({});
    await readNotice({ id: "short" });
    await readNotice({
      cookie: OWNER_WRITE_COOKIE,
      secFetchSite: "cross-site",
    });
    await readNotice({ cookie: OWNER_WRITE_COOKIE });

    expect(limiterLedger.counted).toEqual(Array(4).fill(READ_POLICY_NAME));
  });

  it("counts two save buckets for every POST that carries a credential, even one the body or the port then refuses", async () => {
    const pair = await displayedPair();
    await ackWith({});
    await ackWith("{");
    await ackWith(pair, { cookie: knowWriteToken("wrong") });
    await ackWith(pair);

    expect(limiterLedger.counted).toEqual(
      Array(4)
        .fill([SAVE_BY_BLOCK_POLICY.name, SAVE_BY_CREDENTIAL_POLICY.name])
        .flat(),
    );
  });

  it("answers 503 and writes nothing when the block's bucket cannot be judged, and when the account's cannot", async () => {
    claimedByOwner();
    const pair = await displayedPair();
    limiterLedger.unavailable.add(SAVE_BY_BLOCK_POLICY.name);
    const blockDown = await acknowledge({
      cookie: ownerSession.cookie,
      json: pair,
    });
    limiterLedger.unavailable.clear();
    limiterLedger.unavailable.add(SAVE_BY_ACCOUNT_POLICY_NAME);
    const accountDown = await acknowledge({
      cookie: ownerSession.cookie,
      json: pair,
    });

    expect([blockDown.status, accountDown.status]).toEqual([503, 503]);
    expect(await marker()).toEqual({ kind: "never-recorded" });
    expect(editable.calls).toEqual([]);
  });

  it("answers a GET 429 before the id's shape is judged", async () => {
    limiterLedger.refusing.set(READ_POLICY_NAME, 60);

    const answer = await readNotice({ id: "not-an-id" });

    expect(answer.status).toBe(429);
  });

  it("serves a GET whose limiter cannot judge, and writes the first-open marker for it", async () => {
    limiterLedger.unavailable.add(READ_POLICY_NAME);

    const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(200);
    expect((await marker()).kind).toBe("recorded");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// R5b-d: the body

function encoded(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** A body of exactly `bytes` bytes that is the displayed pair, padded with insignificant whitespace. */
async function pairBodyOf(bytes: number): Promise<string> {
  const text = JSON.stringify(await displayedPair());
  return text + " ".repeat(bytes - encoded(text));
}

describe("POST: the media type", () => {
  it.each([
    "application/jsonp",
    "application/vnd.api+json",
    "application/json-patch+json",
    "text/json",
    "application/json, text/plain",
    ";application/json",
    "",
    "json",
  ])(
    "answers 415 for %j, and calls neither the port nor the store",
    async (contentType) => {
      const answer = await ackWith(JSON.stringify(await displayedPair()), {
        contentType,
      });

      expect(answer.status).toBe(415);
      expect(editable.calls).toEqual([]);
      expect(await marker()).toEqual({ kind: "never-recorded" });
    },
  );

  it.each([
    "application/json",
    "Application/JSON",
    "application/json;charset=utf-8",
    "application/json ; charset=UTF-8",
    " application/json",
  ])("accepts %j", async (contentType) => {
    const answer = await ackWith(JSON.stringify(await displayedPair()), {
      contentType,
    });

    expect(answer.status).toBe(200);
  });
});

describe("POST: the bound is a kilobyte of bytes", () => {
  it("passes a body of exactly 1024 bytes and refuses 1025 with 413, the store untouched", async () => {
    const atTheBound = await ackWith(await pairBodyOf(1024));
    const pastIt = await ackWith(await pairBodyOf(1025));

    expect(atTheBound.status).toBe(200);
    expect(pastIt.status).toBe(413);
    expect(editable.calls).toHaveLength(1);
  });

  it("counts bytes and not characters: a body of 1025 bytes in fewer than 1024 characters is 413, and 1024 bytes of them is not", async () => {
    const prefix = '{"versionId":"x","availabilityRevision":"0","pad":"';
    const suffix = '"}';
    const bodyOf = (bytes: number) => {
      const room = bytes - encoded(prefix + suffix);
      return (
        prefix +
        "é".repeat(Math.floor(room / 2)) +
        "x".repeat(room % 2) +
        suffix
      );
    };
    const atTheBound = bodyOf(1024);
    const past = bodyOf(1026);

    expect(encoded(atTheBound)).toBe(1024);
    expect(atTheBound.length).toBeLessThan(1024);
    expect(encoded(past)).toBe(1026);
    expect(past.length).toBeLessThan(1024);
    expect((await ackWith(atTheBound)).status).toBe(400);
    expect((await ackWith(past)).status).toBe(413);
  });

  it("counts a streamed body across chunks, a character split between two of them included", async () => {
    async function streamed(
      bytes: Uint8Array,
      chunk: number,
    ): Promise<Response> {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let at = 0; at < bytes.length; at += chunk) {
            controller.enqueue(bytes.slice(at, at + chunk));
          }
          controller.close();
        },
      });
      const request = new NextRequest(
        `${ORIGIN}/api/designs/${NOTICE_DESIGN_ID}/price-notice/acknowledge`,
        {
          method: "POST",
          headers: {
            cookie: OWNER_WRITE_COOKIE,
            "sec-fetch-site": "same-origin",
            "content-type": "application/json",
            "x-forwarded-for": "192.0.2.10",
          },
          body: stream,
          duplex: "half",
        } as ConstructorParameters<typeof NextRequest>[1],
      );
      return acknowledgeRoute.POST(request, paramsOf(NOTICE_DESIGN_ID));
    }
    const enc = new TextEncoder();

    const oneByteAtATime = await streamed(
      enc.encode(await pairBodyOf(1024)),
      1,
    );
    const oneByteTooMany = await streamed(
      enc.encode(await pairBodyOf(1025)),
      1,
    );

    expect(oneByteAtATime.status).toBe(200);
    expect(oneByteTooMany.status).toBe(413);
  });

  it("answers 400 invalid-request for an empty body, a truncated one and text that is not JSON, with nothing echoed", async () => {
    for (const body of ["", '{"versionId":', "versionId=1", "\u0000", "NaN"]) {
      const answer = await ackWith(body);
      expect(answer.status, JSON.stringify(body)).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    }
  });
});

describe("POST: the object it takes", () => {
  it.each([
    ["an array", "[]"],
    ["an array of the pair", '[{"versionId":"x"}]'],
    ["null", "null"],
    ["a number", "1"],
    ["a string", '"versionId"'],
    ["true", "true"],
    ["a doubly encoded object", JSON.stringify(JSON.stringify({}))],
  ])("answers %s 400 invalid-request", async (_label, body) => {
    const answer = await ackWith(body);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
  });

  it.each([
    ["__proto__ beside the pair", '"__proto__":{"a":1}'],
    ["constructor beside the pair", '"constructor":"x"'],
    ["toString beside the pair", '"toString":"x"'],
    ["hasOwnProperty beside the pair", '"hasOwnProperty":1'],
    ["designId beside the pair", `"designId":"${NOTICE_DESIGN_ID}"`],
  ])(
    "answers %s 400 invalid-request and records nothing",
    async (_label, extra) => {
      const pair = JSON.stringify(await displayedPair());
      const answer = await ackWith(`${pair.slice(0, -1)},${extra}}`);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      expect(await marker()).toEqual({ kind: "never-recorded" });
    },
  );

  it("never reads the pair out of __proto__: a body that holds only that is 400, not 200", async () => {
    const pair = await displayedPair();

    const answer = await ackWith(`{"__proto__":${JSON.stringify(pair)}}`);

    expect(answer.status).toBe(400);
    expect(await marker()).toEqual({ kind: "never-recorded" });
  });

  it("takes the last of a repeated member, and judges that one", async () => {
    const pair = await displayedPair();
    const good = JSON.stringify(pair.versionId);
    const revision = JSON.stringify(pair.availabilityRevision);

    const lastIsGood = await ackWith(
      `{"versionId":"BAD","versionId":${good},"availabilityRevision":${revision}}`,
    );
    const lastIsBad = await ackWith(
      `{"versionId":${good},"versionId":"BAD","availabilityRevision":${revision}}`,
    );

    expect(lastIsGood.status).toBe(200);
    expect(lastIsBad.status).toBe(400);
    expect(await jsonOf(lastIsBad)).toEqual({
      status: "invalid-input",
      issues: [{ field: "versionId", code: "UNKNOWN_VALUE" }],
    });
  });

  it.each([
    ["no members", {}],
    ["only the version", { versionId: "A".repeat(21) }],
    ["a version that is null", { versionId: null, availabilityRevision: "0" }],
    [
      "a revision that is a number",
      { versionId: "A".repeat(21), availabilityRevision: 1 },
    ],
    [
      "a version that is an object",
      { versionId: {}, availabilityRevision: "0" },
    ],
    [
      "a revision that is an array",
      { versionId: "A".repeat(21), availabilityRevision: ["0"] },
    ],
  ])(
    "names a member that is absent or not text, for %s, MISSING_VALUE",
    async (_label, json) => {
      const answer = await ackWith(json);

      expect(answer.status).toBe(400);
      const body = (await jsonOf(answer)) as {
        status: string;
        issues: { field: string; code: string }[];
      };
      expect(body.status).toBe("invalid-input");
      expect(body.issues.every(({ code }) => code === "MISSING_VALUE")).toBe(
        true,
      );
      expect(body.issues.length).toBeGreaterThan(0);
    },
  );
});

describe("POST: the shape of each member, over the ranges the shapes admit", () => {
  const isMintedShape = (value: string) => /^[A-Za-z0-9_-]{21}$/.test(value);
  const isRevisionOracle = (value: string) =>
    /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= 2n ** 63n - 1n;

  it("sweeps the version id through every length from 0 to 40 around exactly 21: only 21 reaches the store, and never a 5xx", async () => {
    const head = await headNow();
    const statuses: Record<number, number> = {};

    for (let length = 0; length <= 40; length += 1) {
      const answer = await ackWith({
        versionId: "A".repeat(length),
        availabilityRevision: head,
      });
      statuses[length] = answer.status;
      expect(answer.status, `length ${String(length)}`).toBe(400);
      expect(await jsonOf(answer), `length ${String(length)}`).toEqual(
        length === 21
          ? { status: "unknown-version" }
          : {
              status: "invalid-input",
              issues: [{ field: "versionId", code: "UNKNOWN_VALUE" }],
            },
      );
    }
    expect(Object.keys(statuses)).toHaveLength(41);
  });

  it("holds the revision to the shape of a bigint over a sweep of strings, and answers none of them with a 5xx", async () => {
    const version = await activeVersionId();
    const head = await headNow();
    const edges = [
      "0",
      "1",
      head,
      "00",
      "01",
      "-0",
      "-1",
      "+1",
      "1.0",
      "1e3",
      "0x1",
      " 1",
      "1 ",
      "1\n",
      "\t1",
      "",
      "٣",
      "１２",
      "١٢",
      "9223372036854775807",
      "9223372036854775808",
      "9".repeat(19),
      "9".repeat(20),
      "1".repeat(25),
      "0".repeat(19),
      "NaN",
      "Infinity",
      "null",
      "true",
      "[1]",
      "{}",
    ];
    const generated = fc.oneof(
      fc.bigInt({ min: -3n, max: 2n ** 64n }).map(String),
      fc.string({ maxLength: 22 }),
      fc.stringMatching(/^[0-9+\-. eExX\n]{0,21}$/),
    );

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constantFrom(...edges), generated),
        async (revision) => {
          const answer = await ackWith({
            versionId: version,
            availabilityRevision: revision,
          });
          const body = (await answer.clone().json()) as Record<string, unknown>;

          expect(answer.status).toBeLessThan(500);
          if (!isRevisionOracle(revision)) {
            expect(answer.status).toBe(400);
            expect(body).toEqual({
              status: "invalid-input",
              issues: [
                { field: "availabilityRevision", code: "UNKNOWN_VALUE" },
              ],
            });
          } else if (BigInt(revision) > BigInt(head)) {
            expect(body).toEqual({ status: "revision-ahead" });
          } else {
            expect(answer.status).toBe(200);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("holds the version id to the minted shape over generated strings, and answers none of them with a 5xx", async () => {
    const head = await headNow();
    const alphabet = fc.constantFrom(..."AaZz09_-é\u0000 \n.=/%".split(""));

    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc
            .array(alphabet, { minLength: 19, maxLength: 23 })
            .map((c) => c.join("")),
          fc.string({ maxLength: 30 }),
        ),
        async (versionId) => {
          const answer = await ackWith({
            versionId,
            availabilityRevision: head,
          });
          const body: unknown = await answer.clone().json();

          expect(answer.status).toBe(400);
          expect(body).toEqual(
            isMintedShape(versionId)
              ? { status: "unknown-version" }
              : {
                  status: "invalid-input",
                  issues: [{ field: "versionId", code: "UNKNOWN_VALUE" }],
                },
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("compares revisions as numbers once the head has two or three digits: 100 is ahead of 11, and 9 is not ahead of 11", async () => {
    const item: ItemRef = { kind: "accessory", accessoryId: "dishDryingRack" };
    for (let toggle = 0; toggle < 10; toggle += 1) {
      await writeWithoutJudgement(staff, item, toggle % 2 === 1);
    }
    expect(Number(await headNow())).toBeGreaterThanOrEqual(10);
    const version = await activeVersionId();
    const head = Number(await headNow());

    const ahead = await ackWith({
      versionId: version,
      availabilityRevision: String(head * 10),
    });
    const equal = await ackWith({
      versionId: version,
      availabilityRevision: String(head),
    });
    const behind = await ackWith({
      versionId: version,
      availabilityRevision: "9",
    });

    expect(await jsonOf(ahead)).toEqual({ status: "revision-ahead" });
    expect(equal.status).toBe(200);
    expect(behind.status).toBe(200);
  });
});

describe("POST: replay and the order of two acknowledgements", () => {
  it("answers the same pair twice with the same 200 and leaves one marker", async () => {
    const pair = await displayedPair();

    const first = await ackWith(pair);
    const second = await ackWith(pair);

    expect(await jsonOf(first)).toEqual({ acknowledged: pair });
    expect(await jsonOf(second)).toEqual({ acknowledged: pair });
    expect(await marker()).toEqual({ kind: "recorded", acknowledged: pair });
  });

  it("holds the last of many concurrent acknowledgements and answers none with a 5xx", async () => {
    const version = await activeVersionId();
    const head = Number(await headNow());
    const revisions = Array.from({ length: 10 }, (_, at) =>
      String(Math.min(at, head)),
    );

    const answers = await Promise.all(
      revisions.map((availabilityRevision) =>
        ackWith({ versionId: version, availabilityRevision }),
      ),
    );

    expect(answers.every(({ status }) => status === 200)).toBe(true);
    const held = await marker();
    expect(held.kind).toBe("recorded");
    expect(revisions).toContain(
      held.kind === "recorded" ? held.acknowledged.availabilityRevision : "",
    );
  });

  it("lets a later acknowledgement of an older pair move the marker back, which the notice then reads as a change again", async () => {
    const olderRevision = await headNow();
    const item: ItemRef = { kind: "accessory", accessoryId: "dishDryingRack" };
    await writeWithoutJudgement(staff, item, false);
    const newer = await displayedPair();
    await ackWith(newer);

    const stale = await ackWith({
      ...newer,
      availabilityRevision: olderRevision,
    });
    const held = await marker();

    expect(stale.status).toBe(200);
    expect(held).toEqual({
      kind: "recorded",
      acknowledged: { ...newer, availabilityRevision: olderRevision },
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Every status is private

describe("every status either route gives is private and JSON", () => {
  it("carries no-store and a JSON content type on the 200, 400, 404, 413, 415, 429 and 503 of both routes", async () => {
    const pair = await displayedPair();
    const answers: Response[] = [];
    answers.push(await readNotice({ cookie: OWNER_WRITE_COOKIE }));
    answers.push(await readNotice({}));
    answers.push(await ackWith(pair));
    answers.push(await ackWith("[]"));
    answers.push(await ackWith({}));
    answers.push(await ackWith({ ...pair, availabilityRevision: "99" }));
    answers.push(await ackWith(await pairBodyOf(1025)));
    answers.push(await ackWith("{}", { contentType: "text/plain" }));
    answers.push(await acknowledge({ json: pair }));
    limiterLedger.refusing.set(READ_POLICY_NAME, 60);
    answers.push(await readNotice({ cookie: OWNER_WRITE_COOKIE }));
    limiterLedger.refusing.clear();
    makePriceStoresReject(new Error("down"));
    answers.push(await readNotice({ cookie: OWNER_WRITE_COOKIE }));

    expect(answers.map(({ status }) => status)).toEqual([
      200, 404, 200, 400, 400, 400, 413, 415, 404, 429, 503,
    ]);
    for (const answer of answers) {
      expect(
        answer.headers.get("cache-control"),
        String(answer.status),
      ).toContain("no-store");
      expect(answer.headers.get("content-type"), String(answer.status)).toMatch(
        /json/,
      );
    }
  });

  it("answers a body nested five hundred deep, a number that overflows and a lone surrogate with the 400, never a 5xx", async () => {
    for (const body of [
      "[".repeat(500) + "]".repeat(500),
      '{"versionId":1e999,"availabilityRevision":0}',
      '{"versionId":"\ud800","availabilityRevision":"0"}',
      "{".repeat(500),
    ]) {
      const answer = await ackWith(body);
      expect(answer.status, body.slice(0, 30)).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// R5b-e: nothing but a marker

describe("neither route writes anything but the notice marker", () => {
  it("leaves the audit ledger, the availability head, the active version and the draft as they were across both routes, every outcome included", async () => {
    const before = {
      rows: priceWorld.ledger.heldEvents().length,
      head: await headNow(),
      version: await activeVersionId(),
      draft: JSON.stringify(await priceWorld.priceBook.readDraft()),
    };
    const pair = await displayedPair();

    await readNotice({ cookie: OWNER_WRITE_COOKIE });
    await ackWith(pair);
    await ackWith({ ...pair, availabilityRevision: "99" });
    await ackWith({ ...pair, versionId: "B".repeat(21) });
    await ackWith("garbage");
    await readNotice({});

    expect({
      rows: priceWorld.ledger.heldEvents().length,
      head: await headNow(),
      version: await activeVersionId(),
      draft: JSON.stringify(await priceWorld.priceBook.readDraft()),
    }).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Store failures: constant answers

describe("a store that fails answers a constant body and leaks nothing", () => {
  const CANARY = "CNRY-SQL-select * from price_notices where design_id = $1";
  const failures = [
    [
      "a DashboardStoreError, unavailable",
      () =>
        new DashboardStoreError(
          "read a design's acknowledged prices",
          "unavailable",
          { cause: new Error(CANARY) },
        ),
    ],
    [
      "a DashboardStoreError, database",
      () =>
        new DashboardStoreError(
          "read a design's acknowledged prices",
          "database",
          { cause: new Error(CANARY) },
        ),
    ],
    [
      "a DashboardStoreError, invalid-request",
      () =>
        new DashboardStoreError(
          "read a design's acknowledged prices",
          "invalid-request",
          { cause: new Error(CANARY) },
        ),
    ],
    ["a plain Error", () => new Error(CANARY)],
    [
      "an Error with a cause",
      () => new Error("outer", { cause: new Error(CANARY) }),
    ],
  ] as const;

  async function allBodiesOf(responses: readonly Response[]): Promise<string> {
    return (
      await Promise.all(responses.map((answer) => answer.clone().text()))
    ).join("\n");
  }

  it.each(failures)(
    "on the GET: %s is 503 {status: unavailable}, never true, and writes no marker",
    async (_label, make) => {
      const failing = vi
        .spyOn(priceWorld.stores.notices, "readAcknowledged")
        .mockRejectedValue(make());

      const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });
      failing.mockRestore();

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(await allBodiesOf([answer])).not.toContain(CANARY);
      expect(logText()).not.toContain(CANARY);
      expect(await marker()).toEqual({ kind: "never-recorded" });
    },
  );

  it.each(failures)(
    "on the GET's first-open insert: %s is 503, not a notice",
    async (_label, make) => {
      vi.spyOn(priceWorld.stores.notices, "recordIfAbsent").mockRejectedValue(
        make(),
      );

      const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(logText()).not.toContain(CANARY);
    },
  );

  it.each(failures)(
    "on the POST: %s is 503 or the 400 of a refused shape, never a 5xx with its text",
    async (_label, make) => {
      vi.spyOn(
        priceWorld.stores.notices,
        "recordAcknowledged",
      ).mockRejectedValue(make());

      const answer = await ackWith(await displayedPair());

      expect([400, 503]).toContain(answer.status);
      expect(await allBodiesOf([answer])).not.toContain(CANARY);
      expect(logText()).not.toContain(CANARY);
    },
  );

  it("answers a price book that cannot be read as the arm with no active version, and touches no marker", async () => {
    vi.spyOn(priceWorld.stores.priceBook, "readActive").mockRejectedValue(
      new DashboardStoreError("read the active price version", "unavailable"),
    );
    const record = vi.spyOn(priceWorld.stores.notices, "recordIfAbsent");

    const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });

    expect(await jsonOf(answer)).toEqual({
      kind: "no-active-version",
      isSent: false,
    });
    expect(record).not.toHaveBeenCalled();
    expect(await marker()).toEqual({ kind: "never-recorded" });
  });

  it("answers 503 for a plain Error from the price stores' provider, whatever its message, with the same bytes each time", async () => {
    makePriceStoresReject(new Error(`   ${CANARY}`));
    const first = await readNotice({ cookie: OWNER_WRITE_COOKIE });
    makePriceStoresReject(new Error("a different message"));
    const second = await readNotice({ cookie: OWNER_WRITE_COOKIE });
    const third = await ackWith(await displayedPair());

    expect(await wireOf(first)).toBe(await wireOf(second));
    expect(first.status).toBe(503);
    expect(third.status).toBe(503);
    expect(logText()).not.toContain(CANARY);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// R5b-h: the judgement, rows the route cannot reach by publishing alone

describe("pricesChangedFor: the active side is asked first, whatever the seen side is", () => {
  const design = KITCHEN_L_DESIGN;
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const DEFAULT_MATERIAL: ItemRef = {
    kind: "material",
    tierId: SAMPLE_PRICE_BOOK.material.defaultTierId,
  };
  const ON: CatalogueAvailability = { revision: "1", disabled: [] };
  const MATERIAL_OFF: CatalogueAvailability = {
    revision: "2",
    disabled: [DEFAULT_MATERIAL],
  };
  const NO_ROWS: PriceBook = { ...SAMPLE_PRICE_BOOK, cabinetRules: [] };

  function kitchenWith(
    book: PriceBook,
    availability: CatalogueAvailability,
  ): Kitchen {
    return {
      design,
      catalog,
      active: {
        kind: "active",
        versionId: "A".repeat(21),
        book,
        availability,
      },
    };
  }

  const readable = (book: PriceBook, availability: CatalogueAvailability) =>
    ({ kind: "readable", book, availability }) as const;
  const UNREADABLE = { kind: "unreadable" } as const;

  it("has an active side that refuses with a code the sheet does not own, for the rows below", () => {
    const refusal = priceAgainstBook(
      kitchenWith(NO_ROWS, ON).active,
      design,
      catalog,
    );

    expect(refusal.ok).toBe(false);
    expect(!refusal.ok && refusal.failure.code).not.toBe(
      "REPLACEMENT_REQUIRED",
    );
  });

  it.each([
    ["a seen side that priced", readable(SAMPLE_PRICE_BOOK, ON)],
    ["a seen side that refuses too", readable(NO_ROWS, ON)],
    [
      "a seen side that refuses for a replacement",
      readable(SAMPLE_PRICE_BOOK, MATERIAL_OFF),
    ],
    ["a seen side that cannot be read", UNREADABLE],
  ])(
    "answers false for an active ordinary refusal beside %s",
    (_label, seen) => {
      expect(pricesChangedFor(kitchenWith(NO_ROWS, ON), seen)).toBe(false);
    },
  );

  it.each([
    ["a seen side that priced", readable(SAMPLE_PRICE_BOOK, ON)],
    ["a seen side that refuses", readable(NO_ROWS, ON)],
    ["a seen side that cannot be read", UNREADABLE],
  ])(
    "answers false for an active REPLACEMENT_REQUIRED beside %s",
    (_label, seen) => {
      expect(
        pricesChangedFor(kitchenWith(SAMPLE_PRICE_BOOK, MATERIAL_OFF), seen),
      ).toBe(false);
    },
  );

  it.each([
    ["a seen side that refuses", readable(NO_ROWS, ON)],
    [
      "a seen side that needs a replacement",
      readable(SAMPLE_PRICE_BOOK, MATERIAL_OFF),
    ],
    ["a seen side that cannot be read", UNREADABLE],
  ])("answers true when the active side prices beside %s", (_label, seen) => {
    expect(pricesChangedFor(kitchenWith(SAMPLE_PRICE_BOOK, ON), seen)).toBe(
      true,
    );
  });

  it("answers false for the same book and availability on both sides, and agrees with the domain's own comparison on two books", () => {
    const dearer: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      hardware: {
        ...SAMPLE_PRICE_BOOK.hardware,
        tiers: SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => ({
          ...tier,
          perHingeMinor: tier.perHingeMinor + 5_000,
        })),
      },
    };

    expect(
      pricesChangedFor(
        kitchenWith(SAMPLE_PRICE_BOOK, ON),
        readable(SAMPLE_PRICE_BOOK, ON),
      ),
    ).toBe(false);
    expect(
      pricesChangedFor(
        kitchenWith(dearer, ON),
        readable(SAMPLE_PRICE_BOOK, ON),
      ),
    ).toBe(true);
    expect(shippedDeepeningRows().size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// R5b-l: the wire, nested

describe("the nested keys of a notice with a sheet and a removed accessory", () => {
  it("holds, on the real route's JSON, exactly the members the wire names, in every row", async () => {
    await readNotice({ cookie: OWNER_WRITE_COOKIE });
    await writeWithoutJudgement(
      staff,
      { kind: "material", tierId: SAMPLE_PRICE_BOOK.material.defaultTierId },
      false,
    );
    await writeWithoutJudgement(
      staff,
      { kind: "accessory", accessoryId: "dishDryingRack" },
      false,
    );

    const body = (await jsonOf(
      await readNotice({ cookie: OWNER_WRITE_COOKIE }),
    )) as {
      replacementsRequired: { item: object; remaining: object[] }[];
      removedAccessories: object[];
    };

    expect(body.replacementsRequired.length).toBeGreaterThan(0);
    expect(body.removedAccessories.length).toBeGreaterThan(0);
    for (const row of body.replacementsRequired) {
      expect(Object.keys(row).sort()).toEqual(["item", "remaining"]);
      expect(Object.keys(row.item).sort()).toEqual(["kind", "tierId"]);
      for (const option of row.remaining) {
        expect(Object.keys(option).sort()).toEqual(["kind", "tierId"]);
      }
    }
    for (const accessory of body.removedAccessories) {
      expect(Object.keys(accessory)).toEqual(["accessoryId"]);
    }
  });
});
