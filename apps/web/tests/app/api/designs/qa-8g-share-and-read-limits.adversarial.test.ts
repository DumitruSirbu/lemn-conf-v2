// Share writes and reads through the real routes and the real interceptor, counted in the shared setup's
// in-memory store with nothing of the limiter replaced: the figure and the next request at both ends of a
// clock hour, which requests share a bucket and which never do, and what a refused request leaves untouched.
import type { RateLimitBucket } from "@lemnaria/persistence";
import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MINT_DAILY_FIGURE,
  READS_PER_BLOCK_FIGURE,
  SHARE_WRITES_PER_BLOCK_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import {
  consoleCallsOf,
  everyReadingOf,
  silenceEveryConsoleMethod,
} from "../../../lib/server/mail/qa-8j-support";

const SOURCE_VARIABLE = "CLIENT_NETWORK_SOURCE";
const FLAG_VARIABLE = "LEMNARIA_E2E_RATE_LIMIT_POLICY";
const SECRET_VARIABLE = "DIGEST_SECRET";
const USABLE_SECRET = "5d81c0".repeat(10) + "0a1b";
const DESIGN_ID = "QaDesign5d81c0QaDesig";
const OTHER_DESIGN_ID = "QaOther5d81c0QaOtherX";
const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const OWNER_COOKIES =
  `lemnaria_write_token_${DESIGN_ID}=QA-WRITE-TOKEN-5d81c0; ` +
  `${VISITOR_COOKIE_NAME}=${"q".repeat(43)}`;
const AN_ADDRESS = { "x-forwarded-for": "203.0.113.7" };
const ANOTHER_BLOCK = { "x-forwarded-for": "198.51.100.7" };
const HOUR_MS = 3_600_000;
const AN_HOUR_STARTS = Date.parse("2026-11-03T14:00:00.000Z");

/** What the two repositories were asked, so a refusal can be shown to have asked nothing. */
const asked = vi.hoisted(() => ({ calls: [] as string[] }));
const repositories = vi.hoisted(() => ({
  config: undefined as unknown,
  share: undefined as unknown,
}));

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repositories.config,
  getShareLinkRepository: () => repositories.share,
}));

const { GET: loadDesign } = await import(
  "../../../../src/app/api/designs/[id]/route"
);
const {
  POST: shareIssue,
  DELETE: shareRevoke,
  GET: shareStatus,
} = await import("../../../../src/app/api/designs/[id]/share/route");
const { POST: mintDesign } = await import(
  "../../../../src/app/api/designs/route"
);
const { proxy } = await import("../../../../src/proxy");

type Handler = (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<NextResponse>;

interface Sent {
  readonly handler: Handler;
  readonly method: string;
  readonly path: string;
}

const ISSUE: Sent = { handler: shareIssue, method: "POST", path: "/share" };
const REVOKE: Sent = { handler: shareRevoke, method: "DELETE", path: "/share" };
const STATUS: Sent = { handler: shareStatus, method: "GET", path: "/share" };
const LOAD: Sent = { handler: loadDesign, method: "GET", path: "" };

function requestOf(
  { method, path }: Sent,
  headers: Record<string, string>,
  id = DESIGN_ID,
): NextRequest {
  return new NextRequest(`https://lemnaria.test/api/designs/${id}${path}`, {
    method,
    headers: { "sec-fetch-site": "same-origin", ...headers },
  });
}

function send(
  sent: Sent,
  headers: Record<string, string> = { cookie: OWNER_COOKIES },
  id = DESIGN_ID,
): Promise<NextResponse> {
  return sent.handler(requestOf(sent, headers, id), {
    params: Promise.resolve({ id }),
  });
}

async function statusesOf(times: number, sent: Sent, headers = {}) {
  const statuses: number[] = [];
  for (let made = 0; made < times; made += 1) {
    statuses.push(
      (await send(sent, { cookie: OWNER_COOKIES, ...headers })).status,
    );
  }
  return statuses;
}

function page(path: string, headers: Record<string, string> = {}) {
  return proxy(
    new NextRequest(new URL(path, "https://lemnaria.test"), { headers }),
  );
}

function hitsRecorded() {
  return vi.spyOn(getRateLimitStore(), "recordHits");
}

function standAt(instantMs: number): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instantMs));
}

/** Counts `hits` more in the bucket the next request of `sent` is counted in, without sending that many requests. */
async function fillTheBucketOf(
  sent: Sent,
  headers: Record<string, string>,
  hits: number,
): Promise<void> {
  const spy = hitsRecorded();
  await send(sent, { cookie: OWNER_COOKIES, ...headers });
  const [bucket] = (spy.mock.calls[0]?.[0] ?? []) as RateLimitBucket[];
  spy.mockRestore();
  if (bucket === undefined) throw new Error("the request was not counted");
  for (let hit = 1; hit < hits; hit += 1) {
    await getRateLimitStore().recordHits([bucket]);
  }
  asked.calls.length = 0;
}

beforeEach(() => {
  asked.calls.length = 0;
  repositories.config = {
    loadOwned: () => {
      asked.calls.push("design looked up");
      return Promise.resolve({ kind: "none" });
    },
    mint: () => {
      asked.calls.push("design minted");
      return Promise.resolve({ id: "qa-minted", revision: "1" });
    },
  };
  repositories.share = Object.fromEntries(
    (["issue", "revoke", "status"] as const).map((method) => [
      method,
      () => {
        asked.calls.push(`link ${method}`);
        return Promise.resolve(
          method === "status" ? { active: false } : `${method}d`,
        );
      },
    ]),
  );
  vi.stubEnv(SECRET_VARIABLE, USABLE_SECRET);
  vi.stubEnv(SOURCE_VARIABLE, undefined as unknown as string);
  vi.stubEnv(FLAG_VARIABLE, undefined as unknown as string);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const ALLOWED_SHARE_WRITES = new Array<number>(
  SHARE_WRITES_PER_BLOCK_FIGURE / 2,
);

describe("creating and revoking a link, counted together", () => {
  it("allows the figure of the two together and refuses the next of either", async () => {
    const created = await statusesOf(ALLOWED_SHARE_WRITES.length, ISSUE);
    const revoked = await statusesOf(ALLOWED_SHARE_WRITES.length, REVOKE);

    const nextCreate = await send(ISSUE);
    const nextRevoke = await send(REVOKE);

    expect(new Set(created)).toEqual(new Set([201]));
    expect(new Set(revoked)).toEqual(new Set([204]));
    expect([nextCreate.status, nextRevoke.status]).toEqual([429, 429]);
    expect(asked.calls.filter((call) => call.startsWith("link"))).toHaveLength(
      SHARE_WRITES_PER_BLOCK_FIGURE,
    );
  });

  it.each([
    ["created", ISSUE],
    ["revoked", REVOKE],
  ])(
    "leaves the link, the cookies and the request's body alone when a link may not be %s",
    async (_label, write) => {
      await fillTheBucketOf(ISSUE, {}, SHARE_WRITES_PER_BLOCK_FIGURE);
      asked.calls.length = 0;
      const request = new NextRequest(
        `https://lemnaria.test/api/designs/${DESIGN_ID}/share`,
        {
          method: write.method,
          headers: { "sec-fetch-site": "same-origin", cookie: OWNER_COOKIES },
          body: JSON.stringify({ unread: "QA-BODY-5d81c0" }),
        },
      );

      const refused = await write.handler(request, {
        params: Promise.resolve({ id: DESIGN_ID }),
      });

      expect(refused.status).toBe(429);
      expect(asked.calls).toEqual([]);
      expect(refused.headers.getSetCookie()).toEqual([]);
      expect(request.bodyUsed).toBe(false);
    },
  );

  it("is refused with three headers, two members and no figure but the wait", async () => {
    standAt(AN_HOUR_STARTS + 1);
    await fillTheBucketOf(ISSUE, {}, SHARE_WRITES_PER_BLOCK_FIGURE);

    const refused = await send(ISSUE);

    expect([...refused.headers].sort()).toEqual([
      ["cache-control", "no-store"],
      ["content-type", "application/json"],
      ["retry-after", "3600"],
    ]);
    expect(Object.keys((await refused.json()) as object).sort()).toEqual([
      "code",
      "error",
    ]);
  });

  it("writes one line for each refused write, naming the operation and nothing of the caller", async () => {
    vi.stubEnv(SOURCE_VARIABLE, "vercel");
    await fillTheBucketOf(ISSUE, AN_ADDRESS, SHARE_WRITES_PER_BLOCK_FIGURE);
    const consoleSpies = silenceEveryConsoleMethod();

    await send(ISSUE, { cookie: OWNER_COOKIES, ...AN_ADDRESS });
    await send(REVOKE, { cookie: OWNER_COOKIES, ...AN_ADDRESS });

    const lines = consoleCallsOf(consoleSpies);
    const readings = everyReadingOf(lines);
    expect(
      lines.map(([, line]) => (line as { operation: string }).operation),
    ).toEqual(["share-issue", "share-revoke"]);
    for (const kept of ["203.0.113", "QA-WRITE-TOKEN", DESIGN_ID, "qqqq"]) {
      expect(readings).not.toContain(kept);
    }
  });
});

describe("the clock hour a share write is counted in", () => {
  const hourEnds = AN_HOUR_STARTS + HOUR_MS;

  it("tells a write refused in the hour's last millisecond to wait a second, and at its first the hour", async () => {
    standAt(AN_HOUR_STARTS);
    await fillTheBucketOf(ISSUE, {}, SHARE_WRITES_PER_BLOCK_FIGURE);
    const atTheStart = await send(ISSUE);
    standAt(hourEnds - 1);

    const atTheEnd = await send(ISSUE);

    expect(atTheStart.headers.get("Retry-After")).toBe("3600");
    expect(atTheEnd.headers.get("Retry-After")).toBe("1");
  });

  it("counts a write a millisecond before the hour in the hour before, and starts again when it turns", async () => {
    standAt(AN_HOUR_STARTS - 1);
    const theHourBefore = await statusesOf(1, ISSUE);
    standAt(AN_HOUR_STARTS);
    const thisHour = await statusesOf(SHARE_WRITES_PER_BLOCK_FIGURE + 1, ISSUE);
    standAt(hourEnds);

    const theNextHour = await statusesOf(1, ISSUE);

    expect(theHourBefore).toEqual([201]);
    expect(thisHour.filter((status) => status === 201)).toHaveLength(
      SHARE_WRITES_PER_BLOCK_FIGURE,
    );
    expect(thisHour.at(-1)).toBe(429);
    expect(theNextHour).toEqual([201]);
  });
});

describe("buckets that must never be one", () => {
  it("lets a network that has spent its share writes still make its designs, and the other way round", async () => {
    await fillTheBucketOf(ISSUE, {}, SHARE_WRITES_PER_BLOCK_FIGURE);
    const mint = () =>
      mintDesign(
        new NextRequest("https://lemnaria.test/api/designs", {
          method: "POST",
          headers: { "sec-fetch-site": "same-origin" },
        }),
      );

    const mints: number[] = [];
    for (let made = 0; made <= MINT_DAILY_FIGURE; made += 1) {
      mints.push((await mint()).status);
    }
    const shareAfterTheMints = await send(ISSUE);

    expect(mints.filter((status) => status === 201)).toHaveLength(
      MINT_DAILY_FIGURE,
    );
    expect(mints.at(-1)).toBe(429);
    expect(shareAfterTheMints.status).toBe(429);
  });

  it("refuses one block's share writes while another block still writes", async () => {
    vi.stubEnv(SOURCE_VARIABLE, "vercel");
    await fillTheBucketOf(ISSUE, AN_ADDRESS, SHARE_WRITES_PER_BLOCK_FIGURE);

    const sameBlock = await send(ISSUE, {
      cookie: OWNER_COOKIES,
      ...AN_ADDRESS,
    });
    const otherBlock = await send(ISSUE, {
      cookie: OWNER_COOKIES,
      ...ANOTHER_BLOCK,
    });

    expect([sameBlock.status, otherBlock.status]).toEqual([429, 201]);
  });

  it("counts a share write and a read of one block under different keys", async () => {
    vi.stubEnv(SOURCE_VARIABLE, "vercel");
    const hits = hitsRecorded();

    await send(ISSUE, { cookie: OWNER_COOKIES, ...AN_ADDRESS });
    await send(STATUS, { cookie: OWNER_COOKIES, ...AN_ADDRESS });

    const keys = hits.mock.calls.flatMap(([buckets]) =>
      buckets.map(({ key }) => key),
    );
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });
});

describe("a network's reads, of every kind, where the owner names the host", () => {
  beforeEach(() => {
    vi.stubEnv(SOURCE_VARIABLE, "vercel");
  });

  it("are one bucket: a page takes the last of the figure; the next load, status and page are refused", async () => {
    await fillTheBucketOf(LOAD, AN_ADDRESS, READS_PER_BLOCK_FIGURE - 1);

    const lastAllowed = await page(`/ro/d/${DESIGN_ID}`, AN_ADDRESS);
    const load = await send(LOAD, { cookie: OWNER_COOKIES, ...AN_ADDRESS });
    const status = await send(STATUS, { cookie: OWNER_COOKIES, ...AN_ADDRESS });
    const nextPage = await page(`/ro/s/qa-share-token`, AN_ADDRESS);

    expect(lastAllowed.status).toBe(200);
    expect([load.status, status.status, nextPage.status]).toEqual([
      429, 429, 429,
    ]);
    expect(asked.calls).toEqual([]);
  });

  it("refuse a design that exists and one that does not, an owner and a stranger, with the same bytes", async () => {
    standAt(AN_HOUR_STARTS + 1000);
    await fillTheBucketOf(LOAD, AN_ADDRESS, READS_PER_BLOCK_FIGURE);

    const answers = [];
    for (const [headers, id] of [
      [{ cookie: OWNER_COOKIES, ...AN_ADDRESS }, DESIGN_ID],
      [AN_ADDRESS, DESIGN_ID],
      [{ cookie: OWNER_COOKIES, ...AN_ADDRESS }, OTHER_DESIGN_ID],
      [AN_ADDRESS, "no-such-design"],
    ] as const) {
      const refused = await send(LOAD, headers, id);
      answers.push(
        JSON.stringify([
          refused.status,
          [...refused.headers].sort(),
          await refused.text(),
        ]),
      );
    }

    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toContain("429");
    expect(asked.calls).toEqual([]);
  });

  it("are refused in the hour's last millisecond with a wait of one second, and allowed as it turns", async () => {
    standAt(AN_HOUR_STARTS + HOUR_MS - 1);
    await fillTheBucketOf(LOAD, AN_ADDRESS, READS_PER_BLOCK_FIGURE);
    const refused = await send(LOAD, AN_ADDRESS);
    standAt(AN_HOUR_STARTS + HOUR_MS);

    const theNextHour = await send(LOAD, {
      cookie: OWNER_COOKIES,
      ...AN_ADDRESS,
    });

    expect([refused.status, refused.headers.get("Retry-After")]).toEqual([
      429,
      "1",
    ]);
    expect(theNextHour.status).not.toBe(429);
    expect(asked.calls).toEqual(["design looked up"]);
  });

  it("leave another block's reads alone", async () => {
    await fillTheBucketOf(LOAD, AN_ADDRESS, READS_PER_BLOCK_FIGURE);

    const sameBlock = await send(LOAD, AN_ADDRESS);
    const otherBlock = await send(LOAD, ANOTHER_BLOCK);

    expect(sameBlock.status).toBe(429);
    expect(otherBlock.status).not.toBe(429);
  });

  it("are served, never refused and never counted, under the e2e flag, which has no read twin", async () => {
    silenceEveryConsoleMethod();
    vi.stubEnv(FLAG_VARIABLE, "1");
    const hits = hitsRecorded();

    const load = await send(LOAD, AN_ADDRESS);
    const viewed = await page(`/ro/d/${DESIGN_ID}`, AN_ADDRESS);

    expect(load.status).not.toBe(429);
    expect(viewed.status).toBe(200);
    expect(hits).not.toHaveBeenCalled();
  });
});

describe("reads where no source is named", () => {
  it("are never counted and never refused, however many a script sends of each kind", async () => {
    const hits = hitsRecorded();
    const statuses = new Set<number>();
    for (let sent = 0; sent < 40; sent += 1) {
      statuses.add(
        (await send(LOAD, { cookie: OWNER_COOKIES, ...AN_ADDRESS })).status,
      );
      statuses.add(
        (await send(STATUS, { cookie: OWNER_COOKIES, ...AN_ADDRESS })).status,
      );
      statuses.add((await page(`/ro/d/${DESIGN_ID}`, AN_ADDRESS)).status);
    }

    expect(hits).not.toHaveBeenCalled();
    expect(statuses.has(429)).toBe(false);
    expect(asked.calls.length).toBeGreaterThan(0);
  });

  it("ask for no secret: a read is served where the secret is unusable, and nothing is written", async () => {
    const consoleSpies = silenceEveryConsoleMethod();
    vi.stubEnv(SECRET_VARIABLE, "");

    const load = await send(LOAD);

    expect(load.status).not.toBe(429);
    expect(asked.calls).toEqual(["design looked up"]);
    expect(consoleCallsOf(consoleSpies)).toEqual([]);
  });
});
