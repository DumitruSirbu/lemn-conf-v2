import type { KitchenChangeStore } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAIL_ACCEPTED,
  type MailMessage,
  type MailOutcome,
} from "@/lib/server/mail/mail-sender";
import { PUBLIC_ORIGIN_VARIABLE } from "@/lib/server/public-origin-variable";

import {
  forbidNetwork,
  releaseNetwork,
} from "../../../../lib/server/mail/mail-test-support";

import {
  DRIVER_FAILURE_MARKER,
  freshAccountWorld,
} from "../../../../support/account-world";
import {
  currentSeenWorld,
  freshSeenWorld,
  plantSeenKitchen,
} from "../../../../support/staff-seen-world";

// M10 K4, adversarial: the cron route's authentication, what it reads from the request, its stable 503 answers, and
// that no value of the environment reaches an answer, a log line or the message (ADR 0178 A-13 F6; plan K4-c).

interface Controls {
  storeOpens: number;
  mailCreations: number;
  isRealMailFactory: boolean;
  openFails: boolean;
  storeOverrides: Partial<KitchenChangeStore>;
  sent: MailMessage[];
  senderOutcome: () => Promise<MailOutcome>;
}

const controls = vi.hoisted(
  (): Controls => ({
    storeOpens: 0,
    mailCreations: 0,
    isRealMailFactory: false,
    openFails: false,
    storeOverrides: {},
    sent: [],
    senderOutcome: () => Promise.resolve({ ok: true }),
  }),
);

vi.mock("@/lib/server/mail/create-mail-sender", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/server/mail/create-mail-sender")>();
  return {
    ...actual,
    createMailSender: (environment: Record<string, string | undefined>) => {
      controls.mailCreations += 1;
      if (controls.isRealMailFactory)
        return actual.createMailSender(environment);
      return {
        kind: "sender",
        sender: {
          send: (message: MailMessage) => {
            controls.sent.push(message);
            return controls.senderOutcome();
          },
        },
      };
    },
  };
});
vi.mock("@/lib/server/staff/kitchen-change-store-instance", () => ({
  getKitchenChangeStore: (): KitchenChangeStore => {
    controls.storeOpens += 1;
    if (controls.openFails) throw new Error("DRIVER-FAILURE-MARKER-5531");
    const port = currentSeenWorld().port;
    return { ...port, ...controls.storeOverrides };
  },
}));

const routeModule = await import("@/app/api/cron/staff-change-digest/route");
const { GET } = routeModule;

const CRON_SECRET = "cron-secret-ENVMARK-A1B2C3";
const ORIGIN_VALUE = "https://lemnaria.example";
const URL_OF_THE_ROUTE = "https://example.test/api/cron/staff-change-digest";
const RUN_INSTANT = new Date("2026-10-20T05:00:00.000Z");
const LOG_METHODS = ["error", "warn", "log", "info", "debug"] as const;

let logged: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  freshAccountWorld();
  freshSeenWorld();
  Object.assign(controls, {
    storeOpens: 0,
    mailCreations: 0,
    isRealMailFactory: false,
    openFails: false,
    storeOverrides: {},
    sent: [],
    senderOutcome: () => Promise.resolve(MAIL_ACCEPTED),
  });
  forbidNetwork();
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.stubEnv(PUBLIC_ORIGIN_VARIABLE, ORIGIN_VALUE);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(RUN_INSTANT);
  logged = LOG_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  releaseNetwork();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function request(
  headers: Record<string, string>,
  url = URL_OF_THE_ROUTE,
): NextRequest {
  return new NextRequest(url, { headers });
}

const authorized = { authorization: `Bearer ${CRON_SECRET}` };

function plantChanged(): void {
  plantSeenKitchen({ revision: "6", customerName: "Ana Popescu" });
}

function everythingLogged(): string {
  return JSON.stringify(logged.map((spy) => spy.mock.calls));
}

function expectNothingHappened(): void {
  expect(controls.storeOpens).toBe(0);
  expect(controls.mailCreations).toBe(0);
  expect(controls.sent).toEqual([]);
  expect(currentSeenWorld().store.heldRounds()).toEqual([]);
  expect(currentSeenWorld().store.heldDigestEntries()).toEqual([]);
}

describe("the route's module", () => {
  it("exports a GET handler and the two segment settings, and no other method", () => {
    expect(Object.keys(routeModule).sort()).toEqual([
      "GET",
      "dynamic",
      "runtime",
    ]);
    expect(routeModule.runtime).toBe("nodejs");
    expect(routeModule.dynamic).toBe("force-dynamic");
  });
});

describe("authentication", () => {
  const shortOne = CRON_SECRET.slice(0, -1);
  const longOne = `${CRON_SECRET}x`;

  it.each<[string, Record<string, string>]>([
    ["no header at all", {}],
    ["an empty header", { authorization: "" }],
    ["the bare scheme", { authorization: "Bearer" }],
    ["the scheme and a space only", { authorization: "Bearer " }],
    ["the secret without the scheme", { authorization: CRON_SECRET }],
    ["a lower-case scheme", { authorization: `bearer ${CRON_SECRET}` }],
    ["an upper-case scheme", { authorization: `BEARER ${CRON_SECRET}` }],
    [
      "two spaces after the scheme",
      { authorization: `Bearer  ${CRON_SECRET}` },
    ],
    ["a secret one character short", { authorization: `Bearer ${shortOne}` }],
    ["a secret one character long", { authorization: `Bearer ${longOne}` }],
    ["a one-character secret", { authorization: "Bearer x" }],
    ["the wrong scheme", { authorization: `Basic ${CRON_SECRET}` }],
    [
      "the secret doubled",
      { authorization: `Bearer ${CRON_SECRET}${CRON_SECRET}` },
    ],
    ["the secret in another header", { "x-cron-secret": CRON_SECRET }],
    [
      "the secret in a proxy header",
      { "proxy-authorization": `Bearer ${CRON_SECRET}` },
    ],
    [
      "the platform's cron user agent alone",
      { "user-agent": "vercel-cron/1.0" },
    ],
    [
      "the wrong secret with the cron user agent",
      { authorization: "Bearer wrong", "user-agent": "vercel-cron/1.0" },
    ],
  ])(
    "refuses %s with 401 before any store, mail or day is touched",
    async (_name, headers) => {
      plantChanged();

      const answer = await GET(request(headers));

      expect(answer.status).toBe(401);
      expect(await answer.json()).toEqual({ error: "Unauthorized" });
      expectNothingHappened();
      expect(everythingLogged()).not.toContain(CRON_SECRET);
    },
  );

  it("refuses the secret given only in the query string or the path", async () => {
    plantChanged();

    const inQuery = await GET(
      request(
        {},
        `${URL_OF_THE_ROUTE}?authorization=Bearer%20${CRON_SECRET}&secret=${CRON_SECRET}`,
      ),
    );
    const inPath = await GET(request({}, `${URL_OF_THE_ROUTE}/${CRON_SECRET}`));

    expect(inQuery.status).toBe(401);
    expect(inPath.status).toBe(401);
    expectNothingHappened();
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])("refuses every header when CRON_SECRET is %s", async (_name, value) => {
    vi.stubEnv("CRON_SECRET", value);
    plantChanged();
    const headers = [
      { authorization: "Bearer " },
      { authorization: "Bearer" },
      { authorization: "Bearer undefined" },
      { authorization: "Bearer null" },
      { authorization: "" },
      {},
    ];

    for (const header of headers) {
      const answer = await GET(request(header));
      expect(answer.status).toBe(401);
    }

    expectNothingHappened();
  });

  it("accepts the exact secret and runs", async () => {
    plantChanged();

    const answer = await GET(request(authorized));

    expect(answer.status).toBe(200);
    expect(controls.sent).toHaveLength(1);
  });
});

describe("what the route reads of the request", () => {
  it("reads the authorization header and nothing else of it", async () => {
    plantChanged();
    const real = request(authorized);
    const headers = new Proxy(real.headers, {
      get: (target, property) => {
        if (property !== "get") {
          throw new Error(`the route read headers.${String(property)}`);
        }
        return (name: string) => {
          if (name.toLowerCase() !== "authorization") {
            throw new Error(`the route read the ${name} header`);
          }
          return target.get(name);
        };
      },
    });
    const guarded = new Proxy(real, {
      get: (target, property) => {
        if (property !== "headers") {
          throw new Error(`the route read request.${String(property)}`);
        }
        return headers;
      },
    });

    const answer = await GET(guarded);

    expect(answer.status).toBe(200);
  });

  it("takes the day, the recipient and the origin from the server whatever the request carries", async () => {
    plantChanged();
    const hostile = request(
      {
        ...authorized,
        host: "evil.example",
        origin: "https://evil.example",
        referer: "https://evil.example/x",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "http",
        "x-vercel-deployment-url": "evil.example",
        "x-recipient": "victim@evil.example",
        to: "victim@evil.example",
        date: "Mon, 01 Jan 2001 00:00:00 GMT",
      },
      "https://evil.example/api/cron/staff-change-digest?day=2001-01-01&to=victim%40evil.example&recipient=victim%40evil.example&origin=https%3A%2F%2Fevil.example&now=0",
    );

    const answer = await GET(hostile);

    expect(await answer.json()).toEqual({ status: "sent", kitchenCount: 1 });
    expect(
      currentSeenWorld()
        .store.heldRounds()
        .map((round) => round.dayKey),
    ).toEqual(["2026-10-20"]);
    const [message] = controls.sent;
    expect(Object.keys(message ?? {}).sort()).toEqual([
      "html",
      "key",
      "subject",
      "text",
    ]);
    expect(JSON.stringify(message)).not.toMatch(/evil\.example|victim/);
    expect(message?.text).toContain(`${ORIGIN_VALUE}/ro/staff/kitchens/`);
  });
});

describe("a failure answers 503 with a stable code and no cause", () => {
  function sentButRefusedWith(
    kind: "busy" | "timed-out" | "quota-spent",
  ): void {
    controls.senderOutcome = () => Promise.resolve({ ok: false, kind });
  }

  const cases: [
    string,
    () => void,
    { status: "failed"; errorCode: string; mailFailure?: string },
  ][] = [
    [
      "the store cannot be opened",
      () => {
        controls.openFails = true;
      },
      { status: "failed", errorCode: "DIGEST_STORE_UNAVAILABLE" },
    ],
    [
      "the claim rejects",
      () => {
        controls.storeOverrides = {
          claimDigestDay: () =>
            Promise.reject(new Error(DRIVER_FAILURE_MARKER)),
        };
      },
      { status: "failed", errorCode: "DIGEST_CLAIM_FAILED" },
    ],
    [
      "the list rejects",
      () => {
        controls.storeOverrides = {
          listDigestEligible: () =>
            Promise.reject(new Error(DRIVER_FAILURE_MARKER)),
        };
      },
      { status: "failed", errorCode: "DIGEST_LIST_FAILED" },
    ],
    [
      "one design is listed under two revisions",
      () => {
        const port = currentSeenWorld().port;
        controls.storeOverrides = {
          listDigestEligible: async (now) => {
            const [row] = await port.listDigestEligible(now);
            if (row === undefined) throw new Error("no row");
            return [row, { ...row, revision: "7" }];
          },
        };
      },
      { status: "failed", errorCode: "DIGEST_COMPOSE_FAILED" },
    ],
    [
      "the sender rejects",
      () => {
        controls.senderOutcome = () =>
          Promise.reject(new Error(DRIVER_FAILURE_MARKER));
      },
      { status: "failed", errorCode: "DIGEST_SEND_FAILED" },
    ],
    [
      "the mail port is busy",
      () => {
        sentButRefusedWith("busy");
      },
      {
        status: "failed",
        errorCode: "DIGEST_SEND_FAILED",
        mailFailure: "busy",
      },
    ],
    [
      "the mail port times out",
      () => {
        sentButRefusedWith("timed-out");
      },
      {
        status: "failed",
        errorCode: "DIGEST_SEND_FAILED",
        mailFailure: "timed-out",
      },
    ],
    [
      "the mail quota is spent",
      () => {
        sentButRefusedWith("quota-spent");
      },
      {
        status: "failed",
        errorCode: "DIGEST_SEND_FAILED",
        mailFailure: "quota-spent",
      },
    ],
    [
      "the record rejects",
      () => {
        controls.storeOverrides = {
          recordDigested: () =>
            Promise.reject(new Error(DRIVER_FAILURE_MARKER)),
        };
      },
      { status: "failed", errorCode: "DIGEST_RECORD_FAILED" },
    ],
  ];

  it.each(cases)("when %s", async (_name, arrange, expectedBody) => {
    plantChanged();
    arrange();

    const answer = await GET(request(authorized));
    const body = (await answer.json()) as unknown;

    expect(answer.status).toBe(503);
    expect(body).toEqual(expectedBody);
    expect(JSON.stringify(body)).not.toContain(DRIVER_FAILURE_MARKER);
    expect(everythingLogged()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(everythingLogged()).not.toContain(CRON_SECRET);
    expect(controls.sent.length).toBeLessThanOrEqual(1);
  });

  it("still answers 503 when the console itself throws", async () => {
    plantChanged();
    controls.openFails = true;
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("the log transport is down");
    });

    const answer = await GET(request(authorized));

    expect(answer.status).toBe(503);
    expect(await answer.json()).toEqual({
      status: "failed",
      errorCode: "DIGEST_STORE_UNAVAILABLE",
    });
  });

  it("answers 200 for the outcomes that are not failures", async () => {
    const empty = await GET(request(authorized));
    plantChanged();
    const claimed = await GET(request(authorized));

    expect(empty.status).toBe(200);
    expect(claimed.status).toBe(200);
    expect(await claimed.json()).toEqual({ status: "already-claimed" });
  });
});

describe("no value of the environment appears anywhere", () => {
  const MARKS = {
    GOOGLE_EMAIL: "ENVMARK-MAIL-NOT-A-MAILBOX",
    GOOGLE_APP_PASSWORD: "ENVMARK PASSWORD WITH SPACES",
    LEAD_NOTIFICATION_ADDRESS: "ENVMARK-NOTICE-NOT-A-MAILBOX",
  };

  function expectNoMarkIn(text: string): void {
    for (const mark of [CRON_SECRET, ...Object.values(MARKS), "ENVMARK"]) {
      expect(text).not.toContain(mark);
    }
  }

  it("answers a mail that is not configured with a code, naming no variable's value", async () => {
    controls.isRealMailFactory = true;
    for (const [name, value] of Object.entries(MARKS)) vi.stubEnv(name, value);
    plantChanged();

    const answer = await GET(request(authorized));
    const body = JSON.stringify(await answer.json());

    expect(answer.status).toBe(503);
    expect(JSON.parse(body)).toEqual({
      status: "failed",
      errorCode: "DIGEST_MAIL_UNAVAILABLE",
    });
    expectNoMarkIn(body);
    expectNoMarkIn(everythingLogged());
    expect(currentSeenWorld().store.heldRounds()).toEqual([]);
    expect(controls.storeOpens).toBe(0);
  });

  it.each([
    ["not an origin at all", "ENVMARK-ORIGIN"],
    ["an origin with a trailing slash", `${ORIGIN_VALUE}/`],
    ["an origin with a path", `${ORIGIN_VALUE}/evil?ENVMARK`],
    ["a plain http origin", "http://lemnaria.example"],
  ])(
    "answers %s with a code, does not use the day up, and prints no value",
    async (_name, value) => {
      vi.stubEnv(PUBLIC_ORIGIN_VARIABLE, value);
      plantChanged();

      const answer = await GET(request(authorized));
      const body = JSON.stringify(await answer.json());

      expect(answer.status).toBe(503);
      expect(JSON.parse(body)).toEqual({
        status: "failed",
        errorCode: "DIGEST_ORIGIN_UNAVAILABLE",
      });
      expectNoMarkIn(body);
      expectNoMarkIn(everythingLogged());
      expect(controls.sent).toEqual([]);
      expect(currentSeenWorld().store.heldRounds()).toEqual([]);
    },
  );

  it("writes the secret and the other values into neither the sent message nor the success answer", async () => {
    for (const [name, value] of Object.entries(MARKS)) vi.stubEnv(name, value);
    plantChanged();

    const answer = await GET(request(authorized));
    const body = JSON.stringify(await answer.json());

    expect(body).toBe(JSON.stringify({ status: "sent", kitchenCount: 1 }));
    expectNoMarkIn(JSON.stringify(controls.sent));
    expectNoMarkIn(everythingLogged());
  });

  it("does not put the configured origin of the platform into an answer either", async () => {
    plantChanged();

    const answer = await GET(request(authorized));

    expect(JSON.stringify(await answer.json())).not.toContain(ORIGIN_VALUE);
  });
});
