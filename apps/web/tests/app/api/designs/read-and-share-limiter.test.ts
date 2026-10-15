import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RATE_LIMIT_READ_DEADLINE_MS } from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  E2E_RATE_LIMIT_POLICY_FLAG,
  READS_PER_BLOCK_FIGURE,
  SAVES_PER_BLOCK_FIGURE,
  SAVES_PER_CREDENTIAL_FIGURE,
  SHARE_WRITES_PER_BLOCK_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import { readSource } from "../../../lib/server/server-source-support";

/**
 * A design's load, a link's status, and the creation and revocation of a link, through the real routes with the
 * shared setup's fake counters. What is replaced is the two repositories, so each can say what was asked of it and
 * when: the limiter is real in every route test, and what a test fakes is the database and not the decision.
 */
const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const DESIGN_ID = "V1StGXR8Z5jdHi6BmyT_a";
const WRITE_TOKEN = "write-token-for-the-design-under-test";
const VISITOR_VALUE = "a".repeat(43);
const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const HOUR_SECONDS = 3600;

/** What was asked, in order: `limiter` for a hit counted, then the repository's own methods. */
const order = vi.hoisted(() => ({ calls: [] as string[] }));
const repositories = vi.hoisted(() => ({
  config: undefined as unknown,
  share: undefined as unknown,
}));

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repositories.config,
  getShareLinkRepository: () => repositories.share,
}));

const {
  GET: loadDesign,
  PUT: saveDesign,
  PATCH: patchDesign,
} = await import("../../../../src/app/api/designs/[id]/route");
const {
  POST: shareIssue,
  DELETE: shareRevoke,
  GET: shareStatus,
} = await import("../../../../src/app/api/designs/[id]/share/route");

const OWNER_COOKIES = `lemnaria_write_token_${DESIGN_ID}=${WRITE_TOKEN}; ${VISITOR_COOKIE_NAME}=${VISITOR_VALUE}`;

function requestTo(
  path: string,
  method: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(
    `https://example.test/api/designs/${DESIGN_ID}${path}`,
    {
      method,
      headers: { "sec-fetch-site": "same-origin", ...headers },
    },
  );
}

const PARAMS = { params: Promise.resolve({ id: DESIGN_ID }) };

const owner = { cookie: OWNER_COOKIES };
const stranger = {};

function countingStore() {
  const store = getRateLimitStore();
  const real = store.recordHits.bind(store);
  return vi.spyOn(store, "recordHits").mockImplementation((buckets) => {
    order.calls.push("limiter");
    return real(buckets);
  });
}

function storeAtItsFigure(figure: number) {
  return vi.spyOn(getRateLimitStore(), "recordHits").mockImplementation(() => {
    order.calls.push("limiter");
    return Promise.resolve([figure + 1]);
  });
}

function silenceTheConsole(): void {
  for (const method of [
    "debug",
    "error",
    "info",
    "log",
    "trace",
    "warn",
  ] as const) {
    vi.spyOn(console, method).mockImplementation(() => undefined);
  }
}

beforeEach(() => {
  order.calls.length = 0;
  repositories.config = {
    loadOwned: () => {
      order.calls.push("load-owned");
      return Promise.resolve({ kind: "none" });
    },
    saveAuthorized: () => {
      order.calls.push("save");
      return Promise.reject(new Error("a save is not under test"));
    },
  };
  repositories.share = {
    issue: () => {
      order.calls.push("issue");
      return Promise.resolve("issued");
    },
    revoke: () => {
      order.calls.push("revoke");
      return Promise.resolve("revoked");
    },
    status: () => {
      order.calls.push("status");
      return Promise.resolve({ active: false });
    },
  };
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv(E2E_RATE_LIMIT_POLICY_FLAG, undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/designs/{id}: counted first of all, before the cookie and before any lookup", () => {
  it("counts the read, then looks the design up", async () => {
    countingStore();

    await loadDesign(requestTo("", "GET", owner), PARAMS);

    expect(order.calls).toEqual(["limiter", "load-owned"]);
  });

  it("refuses a read past its figure with a bare 429 and looks nothing up", async () => {
    storeAtItsFigure(READS_PER_BLOCK_FIGURE);
    silenceTheConsole();

    const response = await loadDesign(requestTo("", "GET", owner), PARAMS);

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThanOrEqual(
      1,
    );
    expect(Number(response.headers.get("Retry-After"))).toBeLessThanOrEqual(
      HOUR_SECONDS,
    );
    expect((await response.json()) as unknown).toEqual({
      error: "Too many requests for now.",
      code: "READ_LIMIT_REACHED",
    });
    expect(order.calls).toEqual(["limiter"]);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("answers an owner and a stranger the same refusal, byte for byte, since neither is looked up", async () => {
    storeAtItsFigure(READS_PER_BLOCK_FIGURE);
    silenceTheConsole();

    const asOwner = await loadDesign(requestTo("", "GET", owner), PARAMS);
    const asStranger = await loadDesign(requestTo("", "GET", stranger), PARAMS);

    expect(asStranger.status).toBe(asOwner.status);
    expect(await asStranger.text()).toBe(await asOwner.text());
    expect([...asStranger.headers]).toEqual([...asOwner.headers]);
  });

  it("makes no call to the store under no network source, and looks the design up", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    const recorded = countingStore();

    await loadDesign(requestTo("", "GET", owner), PARAMS);

    expect(recorded).not.toHaveBeenCalled();
    expect(order.calls).toEqual(["load-owned"]);
  });

  it("serves a read when the store fails, and when the secret is unusable", async () => {
    silenceTheConsole();
    vi.spyOn(getRateLimitStore(), "recordHits").mockRejectedValue(
      new Error("down"),
    );
    const failedStore = await loadDesign(requestTo("", "GET", owner), PARAMS);
    vi.restoreAllMocks();
    silenceTheConsole();
    vi.stubEnv("DIGEST_SECRET", "short");
    const unusableSecret = await loadDesign(
      requestTo("", "GET", owner),
      PARAMS,
    );

    expect([failedStore.status, unusableSecret.status]).toEqual([404, 404]);
    expect(order.calls).toEqual(["load-owned", "load-owned"]);
  });

  it("serves a read whose store never answers within the read's own deadline", async () => {
    silenceTheConsole();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(getRateLimitStore(), "recordHits").mockReturnValue(
      new Promise<readonly number[]>(() => undefined),
    );
    let status: number | undefined;
    const pending = loadDesign(requestTo("", "GET", owner), PARAMS).then(
      (response) => {
        status = response.status;
      },
    );

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_READ_DEADLINE_MS - 1);
    expect(status).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(status).toBe(404);
    expect(order.calls).toEqual(["load-owned"]);
  });
});

describe("GET /api/designs/{id}/share: a read, counted after the cross-site guard and before the credentials", () => {
  it("counts the read and then asks the repository for the status", async () => {
    countingStore();

    const response = await shareStatus(
      requestTo("/share", "GET", owner),
      PARAMS,
    );

    expect(response.status).toBe(200);
    expect(order.calls).toEqual(["limiter", "status"]);
  });

  it("refuses past the figure with the read's 429, for a caller with no cookie too, asking nothing", async () => {
    storeAtItsFigure(READS_PER_BLOCK_FIGURE);
    silenceTheConsole();

    const asOwner = await shareStatus(
      requestTo("/share", "GET", owner),
      PARAMS,
    );
    const asStranger = await shareStatus(
      requestTo("/share", "GET", stranger),
      PARAMS,
    );

    expect(asOwner.status).toBe(429);
    expect(asStranger.status).toBe(429);
    expect(await asStranger.text()).toBe(await asOwner.text());
    expect(order.calls).toEqual(["limiter", "limiter"]);
  });

  it("does not count a cross-site request, which the guard answers first", async () => {
    const recorded = countingStore();

    const response = await shareStatus(
      requestTo("/share", "GET", { ...owner, "sec-fetch-site": "cross-site" }),
      PARAMS,
    );

    expect(response.status).toBe(404);
    expect(recorded).not.toHaveBeenCalled();
  });

  it("makes no call to the store under no network source", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    const recorded = countingStore();

    await shareStatus(requestTo("/share", "GET", owner), PARAMS);

    expect(recorded).not.toHaveBeenCalled();
    expect(order.calls).toEqual(["status"]);
  });
});

describe("POST and DELETE /api/designs/{id}/share: counted after the guard and credentials", () => {
  const WRITES = [
    ["POST", shareIssue, "issue"],
    ["DELETE", shareRevoke, "revoke"],
  ] as const;

  it.each(WRITES)(
    "counts a %s and then changes the link",
    async (method, handler, called) => {
      countingStore();

      const response = await handler(
        requestTo("/share", method, owner),
        PARAMS,
      );

      expect(response.status).toBe(method === "POST" ? 201 : 204);
      expect(order.calls).toEqual(["limiter", called]);
    },
  );

  it.each(WRITES)(
    "does not count a %s with no credentials, which is refused as before",
    async (method, handler) => {
      const recorded = countingStore();

      const response = await handler(
        requestTo("/share", method, stranger),
        PARAMS,
      );

      expect(response.status).toBe(404);
      expect(recorded).not.toHaveBeenCalled();
      expect(order.calls).toEqual([]);
    },
  );

  it.each(WRITES)("does not count a cross-site %s", async (method, handler) => {
    const recorded = countingStore();

    await handler(
      requestTo("/share", method, { ...owner, "sec-fetch-site": "cross-site" }),
      PARAMS,
    );

    expect(recorded).not.toHaveBeenCalled();
  });

  it.each(WRITES)(
    "refuses a %s past its figure with a 429, changes no link and sets no cookie",
    async (method, handler) => {
      storeAtItsFigure(SHARE_WRITES_PER_BLOCK_FIGURE);
      silenceTheConsole();

      const response = await handler(
        requestTo("/share", method, owner),
        PARAMS,
      );

      expect(response.status).toBe(429);
      expect(Number(response.headers.get("Retry-After"))).toBeLessThanOrEqual(
        HOUR_SECONDS,
      );
      expect(((await response.json()) as { code: string }).code).toBe(
        "SHARE_LIMIT_REACHED",
      );
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(order.calls).toEqual(["limiter"]);
    },
  );

  it.each(WRITES)(
    "answers a %s 503 when the store fails, and changes nothing: a write fails closed",
    async (method, handler) => {
      silenceTheConsole();
      vi.spyOn(getRateLimitStore(), "recordHits").mockRejectedValue(
        new Error("down"),
      );

      const response = await handler(
        requestTo("/share", method, owner),
        PARAMS,
      );

      expect(response.status).toBe(503);
      expect(((await response.json()) as { code: string }).code).toBe(
        "SHARE_UNAVAILABLE",
      );
      expect(response.headers.get("Retry-After")).toBeNull();
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(order.calls).toEqual([]);
    },
  );

  it.each(WRITES)(
    "counts a %s under no network source in the shared bucket, as a write always is",
    async (method, handler) => {
      vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
      const recorded = countingStore();

      await handler(requestTo("/share", method, owner), PARAMS);

      expect(recorded).toHaveBeenCalledTimes(1);
    },
  );
});

describe("the truth table of source and secret, for a share write and for a read", () => {
  interface Row {
    readonly label: string;
    readonly source: string | undefined;
    readonly secret: string;
    readonly write: number;
    readonly read: number;
  }
  /** A write answers 503 when it cannot be judged and a read is served; under no source a write is counted and a
   *  read is not. */
  const ROWS: readonly Row[] = [
    {
      label: "a named source and a usable secret",
      source: "vercel",
      secret: FAKE_SECRET,
      write: 201,
      read: 200,
    },
    {
      label: "no source and a usable secret",
      source: undefined,
      secret: FAKE_SECRET,
      write: 201,
      read: 200,
    },
    {
      label: "a misconfigured source",
      source: "other",
      secret: FAKE_SECRET,
      write: 503,
      read: 200,
    },
    {
      label: "a named source and an unusable secret",
      source: "vercel",
      secret: "short",
      write: 503,
      read: 200,
    },
    {
      label: "no source and an unusable secret",
      source: undefined,
      secret: "short",
      write: 503,
      read: 200,
    },
  ];

  it.each(ROWS)(
    "answers $label as the table says",
    async ({ source, secret, write, read }) => {
      silenceTheConsole();
      vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, source);
      vi.stubEnv("DIGEST_SECRET", secret);

      const written = await shareIssue(
        requestTo("/share", "POST", owner),
        PARAMS,
      );
      const status = await shareStatus(
        requestTo("/share", "GET", owner),
        PARAMS,
      );

      expect(written.status).toBe(write);
      expect(status.status).toBe(read);
    },
  );
});

describe.each(["PUT", "PATCH"] as const)(
  "%s /api/designs/{id}: counted after the two refusals that are not, and before the body",
  (method) => {
    const save = method === "PUT" ? saveDesign : patchDesign;
    const ownerWithRevision = { ...owner, "x-expected-revision": "1" };

    function requestWithABody(headers: Record<string, string>): NextRequest {
      return new NextRequest(`https://example.test/api/designs/${DESIGN_ID}`, {
        method,
        headers: { "sec-fetch-site": "same-origin", ...headers },
        body: "{}",
      });
    }

    it("counts the block and then the credential, and only then reads the body", async () => {
      silenceTheConsole();
      countingStore();
      const request = requestWithABody(ownerWithRevision);

      const response = await save(request, PARAMS);

      expect(order.calls).toEqual(["limiter", "limiter"]);
      expect(request.bodyUsed).toBe(true);
      expect(response.status).toBe(400);
    });

    it("makes no call to the store for a save with no credential for the design, and answers its 403", async () => {
      silenceTheConsole();
      const recorded = countingStore();

      const response = await save(requestWithABody(stranger), PARAMS);

      expect(response.status).toBe(403);
      expect(recorded).not.toHaveBeenCalled();
    });

    it("makes no call to the store for a save that states no revision, and answers its refusal", async () => {
      silenceTheConsole();
      const recorded = countingStore();

      const response = await save(requestWithABody(owner), PARAMS);

      expect(response.status).toBe(400);
      expect(recorded).not.toHaveBeenCalled();
    });

    it("refuses a save past the block's figure with 429, one count, no body read, no save and no cookie", async () => {
      silenceTheConsole();
      storeAtItsFigure(SAVES_PER_BLOCK_FIGURE);
      const request = requestWithABody(ownerWithRevision);

      const response = await save(request, PARAMS);

      expect(response.status).toBe(429);
      expect(
        Number(response.headers.get("Retry-After")),
      ).toBeGreaterThanOrEqual(1);
      expect(Number(response.headers.get("Retry-After"))).toBeLessThanOrEqual(
        HOUR_SECONDS,
      );
      expect((await response.json()) as unknown).toEqual({
        error: "The limit on saving is reached for now.",
        code: "SAVE_LIMIT_REACHED",
      });
      expect(order.calls).toEqual(["limiter"]);
      expect(request.bodyUsed).toBe(false);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    });

    it("refuses a save past the credential's figure with 429 after both counts, and stores nothing", async () => {
      silenceTheConsole();
      const answers = [[1], [SAVES_PER_CREDENTIAL_FIGURE + 1]];
      vi.spyOn(getRateLimitStore(), "recordHits").mockImplementation(() => {
        order.calls.push("limiter");
        return Promise.resolve(answers.shift() ?? [1]);
      });
      const request = requestWithABody(ownerWithRevision);

      const response = await save(request, PARAMS);

      expect(response.status).toBe(429);
      expect(order.calls).toEqual(["limiter", "limiter"]);
      expect(request.bodyUsed).toBe(false);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    });

    it("answers 503 with its code and no wait when the store fails or the secret is unusable", async () => {
      silenceTheConsole();
      vi.spyOn(getRateLimitStore(), "recordHits").mockRejectedValue(
        new Error("down"),
      );
      const failedStore = await save(
        requestWithABody(ownerWithRevision),
        PARAMS,
      );
      vi.restoreAllMocks();
      silenceTheConsole();
      vi.stubEnv("DIGEST_SECRET", "short");
      const request = requestWithABody(ownerWithRevision);
      const unusableSecret = await save(request, PARAMS);

      expect([failedStore.status, unusableSecret.status]).toEqual([503, 503]);
      expect(unusableSecret.headers.get("Retry-After")).toBeNull();
      expect((await unusableSecret.json()) as unknown).toEqual({
        error: "A save cannot be made right now.",
        code: "SAVE_UNAVAILABLE",
      });
      expect(order.calls).not.toContain("save");
      expect(request.bodyUsed).toBe(false);
    });

    it("answers a stranger 403 with the block at its figure, and counts nothing", async () => {
      silenceTheConsole();
      const recorded = storeAtItsFigure(SAVES_PER_BLOCK_FIGURE);

      const asStranger = await save(requestWithABody(stranger), PARAMS);
      const asOwner = await save(requestWithABody(ownerWithRevision), PARAMS);

      expect(asStranger.status).toBe(403);
      expect(asOwner.status).toBe(429);
      expect(recorded).toHaveBeenCalledTimes(1);
    });
  },
);

describe("the save route's source", () => {
  it("reads source: nothing of the limiter stands between the write and its answer", () => {
    const route = readSource("app/api/designs/[id]/route.ts");
    const aSave = route.slice(
      route.indexOf("async function saveDesign"),
      route.indexOf("function readExpectedRevision"),
    );

    expect(aSave.indexOf("refusalOfSaveLimit")).toBeLessThan(
      aSave.indexOf("readDesign(request)"),
    );
    expect(aSave.slice(aSave.indexOf("saveAuthorized("))).not.toMatch(
      /limit|judge|enforce/i,
    );
  });
});
