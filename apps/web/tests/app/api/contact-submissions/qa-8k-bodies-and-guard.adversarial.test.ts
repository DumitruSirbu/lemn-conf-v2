// The contact route with its real orchestration and only what reaches outside the process a fake: what the guard, the
// content type and the body's reader let through, what odd JSON becomes, and what every answer holds and never holds.
import { NARROWED_ROOM_OVERFLOWING_DESIGN } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { silenceEveryConsoleMethod } from "../../../lib/server/mail/qa-8j-support";
import {
  byEmail,
  callbackRequest,
  codeOf,
  contactRequest,
  designRequest,
  failCountersFrom,
  found,
  loadRoute,
  MARKER,
  nameTheNetworkSource,
  requestIdOf,
  resetOutside,
  send,
  SUBMITTED_MARKERS,
  watchCountedWindows,
  wireOf,
  type Fields,
  type Outside,
  type Post,
} from "./qa-8k-support";

const outside = vi.hoisted(() => ({}) as Outside);

vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => outside.store,
}));
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () => ({ kind: "sender", sender: outside.sender }),
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: (designId: string) => outside.load(designId),
}));

const BOUND_BYTES = 8 * 1024;
const NOT_SENT_RETRY = { ok: false, kind: "busy" } as const;
const NOT_SENT_FOR_GOOD = { ok: false, kind: "refused" } as const;
const SERVER_FAILURE_FROM = 500;
const DAY_MS = 86_400_000;
const FIRST_DAY = new Date("2026-10-10T00:20:00Z");
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);
/** What a text that is no JSON is answered with: the same as JSON that is no object. */
const NO_REQUEST_AT_ALL = {
  code: "CONTACT_INVALID",
  issues: [{ field: "request", code: "NOT_AN_OBJECT" }],
};

let post: Post;
let countedWindows: () => number[];

beforeEach(async () => {
  silenceEveryConsoleMethod();
  nameTheNetworkSource();
  resetOutside(outside);
  post = await loadRoute();
  countedWindows = watchCountedWindows();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function nothingStoredOrSent(): void {
  expect(outside.heldStore.heldSubmissions()).toHaveLength(0);
  expect(outside.fakeSender.sent).toHaveLength(0);
}

describe("a request from another site, by every shape of the two headers the guard reads", () => {
  it.each([
    ["sec-fetch-site: cross-site", { "sec-fetch-site": "cross-site" }],
    ["sec-fetch-site: same-site", { "sec-fetch-site": "same-site" }],
    ["sec-fetch-site: none", { "sec-fetch-site": "none" }],
    ["sec-fetch-site in another case", { "sec-fetch-site": "Same-Origin" }],
    ["sec-fetch-site empty", { "sec-fetch-site": "" }],
    [
      "a word that is no value of the header",
      { "sec-fetch-site": "same-origin, cross-site" },
    ],
    [
      "cross-site with this site's own origin",
      { "sec-fetch-site": "cross-site", origin: "https://lemnaria.test" },
    ],
    [
      "no sec-fetch-site and another origin",
      { "sec-fetch-site": undefined, origin: "https://evil.example" },
    ],
    [
      "no sec-fetch-site and a null origin",
      { "sec-fetch-site": undefined, origin: "null" },
    ],
    [
      "no sec-fetch-site and this host by http",
      { "sec-fetch-site": undefined, origin: "http://lemnaria.test" },
    ],
    [
      "no sec-fetch-site and this host on a port",
      { "sec-fetch-site": undefined, origin: "https://lemnaria.test:8443" },
    ],
    [
      "no sec-fetch-site and a host that ends as this one",
      { "sec-fetch-site": undefined, origin: "https://evil-lemnaria.test" },
    ],
  ])(
    "refuses %s, uncounted, with nothing looked up",
    async (_name, headers) => {
      const answer = await send(post, callbackRequest(), { headers });

      expect(answer.status).toBe(403);
      expect(await codeOf(answer)).toBe("CONTACT_CROSS_SITE");
      expect(countedWindows()).toEqual([]);
      nothingStoredOrSent();
    },
  );

  it.each([
    [
      "same-origin whatever the origin header says",
      { origin: "https://evil.example" },
    ],
    [
      "no sec-fetch-site and this site's own origin",
      { "sec-fetch-site": undefined, origin: "https://lemnaria.test" },
    ],
    [
      "neither header, as a caller that is no browser sends",
      { "sec-fetch-site": undefined },
    ],
  ])("lets through %s", async (_name, headers) => {
    const answer = await send(post, callbackRequest(), { headers });

    expect(answer.status).toBe(200);
  });
});

describe("a method that is not POST", () => {
  it("has no handler: the route exports POST and nothing else to answer with", async () => {
    vi.resetModules();
    const route = await import(
      "../../../../src/app/api/contact-submissions/route"
    );

    expect(Object.keys(route)).toEqual(["POST"]);
  });
});

describe("the content type, read for its media type alone", () => {
  it.each([
    ["none at all", undefined],
    ["an empty one", ""],
    ["text/plain", "text/plain"],
    ["a form's", "application/x-www-form-urlencoded"],
    ["multipart", "multipart/form-data; boundary=x"],
    ["text/json", "text/json"],
    ["a longer subtype", "application/jsonx"],
    ["a suffix type", "application/ld+json"],
    ["two types in one header", "application/json, text/plain"],
    ["JSON named only in a parameter", "text/plain; type=application/json"],
    ["a wildcard", "*/*"],
  ])("refuses %s as not JSON, uncounted", async (_name, contentType) => {
    const answer = await send(post, callbackRequest(), {
      headers: { "content-type": contentType },
    });

    expect(answer.status).toBe(415);
    expect(await codeOf(answer)).toBe("CONTACT_NOT_JSON");
    expect(countedWindows()).toEqual([]);
    nothingStoredOrSent();
  });

  it.each([
    ["upper case", "APPLICATION/JSON"],
    ["mixed case with a charset", "Application/Json; charset=UTF-8"],
    ["a charset that is not UTF-8", "application/json; charset=latin1"],
    ["spaces round the type", "  application/json  ;charset=utf-8"],
    ["a parameter with no value", "application/json;"],
  ])("takes %s as JSON", async (_name, contentType) => {
    const answer = await send(post, callbackRequest(), {
      headers: { "content-type": contentType },
    });

    expect(answer.status).toBe(200);
  });
});

describe("the body, counted in bytes as it is read", () => {
  /** A callback whose honeypot is padded until the body is exactly `bytes` long; the honeypot refuses it later. */
  function bodyOfExactly(bytes: number): string {
    const empty = JSON.stringify(callbackRequest({ junk: "" }));
    return JSON.stringify(
      callbackRequest({ junk: "j".repeat(bytes - empty.length) }),
    );
  }

  it("reads a body of exactly the bound, parses it and judges it by the schema", async () => {
    const body = bodyOfExactly(BOUND_BYTES);

    const answer = await post(contactRequest(body));

    expect(new TextEncoder().encode(body)).toHaveLength(BOUND_BYTES);
    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({
      error: expect.any(String) as string,
      code: "CONTACT_INVALID",
      issues: [{ field: "request", code: "UNKNOWN_FIELD" }],
    });
    expect(countedWindows()).toHaveLength(1);
  });

  it("refuses one byte more before it is parsed, uncounted", async () => {
    const answer = await post(contactRequest(bodyOfExactly(BOUND_BYTES + 1)));

    expect(answer.status).toBe(413);
    expect(await codeOf(answer)).toBe("CONTACT_BODY_TOO_LARGE");
    expect(countedWindows()).toEqual([]);
  });

  it("refuses a body past the bound whatever length its header claims", async () => {
    const answer = await post(
      contactRequest(bodyOfExactly(BOUND_BYTES * 3), {
        headers: { "content-length": "10" },
      }),
    );

    expect(answer.status).toBe(413);
  });

  it("answers a request with no body at all as invalid, counted once", async () => {
    const answer = await post(contactRequest(null));

    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject(NO_REQUEST_AT_ALL);
    expect(countedWindows()).toHaveLength(1);
  });
});

describe("JSON that is no request", () => {
  it.each([
    ["three opening braces", "{{{"],
    ["the bound's worth of opening brackets", "[".repeat(BOUND_BYTES)],
    [
      "nesting closed properly, four thousand deep",
      "[".repeat(4000) + "]".repeat(4000),
    ],
    ["a request cut short", JSON.stringify(callbackRequest()).slice(0, -1)],
    [
      "two requests one after the other",
      JSON.stringify(callbackRequest()).repeat(2),
    ],
    ["a single quote for a string", "{'intent':'callback'}"],
    ["a trailing comma", '{"intent":"callback",}'],
    ["a comment", '/* x */ {"intent":"callback"}'],
    ["a lone surrogate escape cut short", '{"intent":"\\ud83d'],
    ["the empty text", ""],
    ["white space alone", " \n\t "],
  ])(
    "answers %s as no request at all, and never as a failure of the server's",
    async (_name, text) => {
      const answer = await post(contactRequest(text));

      expect(answer.status).toBe(400);
      expect(await answer.json()).toMatchObject(NO_REQUEST_AT_ALL);
      nothingStoredOrSent();
    },
  );

  it.each([
    ["a number", "7"],
    ["null", "null"],
    ["true", "true"],
    ["a string", '"callback"'],
    ["an array", "[]"],
    ["an array holding a request", `[${JSON.stringify(callbackRequest())}]`],
  ])("answers %s as not an object", async (_name, text) => {
    const answer = await post(contactRequest(text));

    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({
      code: "CONTACT_INVALID",
      issues: [{ field: "request", code: "NOT_AN_OBJECT" }],
    });
    nothingStoredOrSent();
  });

  it.each([
    [
      "__proto__ at the top",
      (text: string) => text.replace("{", '{"__proto__":{"elapsedMs":99999},'),
    ],
    [
      "constructor at the top",
      (text: string) => text.replace("{", '{"constructor":{"prototype":{}},'),
    ],
    [
      "__proto__ inside the contact",
      (text: string) =>
        text.replace(
          '"contact":{',
          '"contact":{"__proto__":{"channel":"email"},',
        ),
    ],
    [
      "a price beside the request",
      (text: string) => text.replace("{", '{"total":1,'),
    ],
  ])(
    "refuses a request carrying %s as an unknown field, by name of its place and never of the key",
    async (_name, carrying) => {
      const answer = await post(
        contactRequest(carrying(JSON.stringify(callbackRequest()))),
      );

      expect(answer.status).toBe(400);
      const body = await answer.text();
      expect(body).toContain("UNKNOWN_FIELD");
      expect(body).not.toMatch(/__proto__|constructor|total/);
      nothingStoredOrSent();
    },
  );

  it("takes the last of a key written twice, as the parser does, and judges that one", async () => {
    const twice = JSON.stringify(callbackRequest()).replace(
      '"elapsedMs":12000',
      '"elapsedMs":12000,"elapsedMs":1',
    );

    const answer = await post(contactRequest(twice));

    expect(await codeOf(answer)).toBe("CONTACT_REJECTED");
    nothingStoredOrSent();
  });

  it.each([
    ["a time too large to be a number", '"elapsedMs":1e999'],
    ["a negative time", '"elapsedMs":-12000'],
    ["a time that is text", '"elapsedMs":"12000"'],
    ["a time that is null", '"elapsedMs":null'],
  ])("never stores a request stating %s", async (_name, stated) => {
    const text = JSON.stringify(callbackRequest()).replace(
      '"elapsedMs":12000',
      stated,
    );

    const answer = await post(contactRequest(text));

    expect(answer.status).toBe(400);
    nothingStoredOrSent();
  });
});

describe("bytes that are not UTF-8", () => {
  function withBytesInTheName(bytes: readonly number[]) {
    const [before = "", after = ""] = JSON.stringify(
      callbackRequest({}, { name: "Ana SPLIT Pop" }),
    ).split("SPLIT");
    const encoder = new TextEncoder();
    return Uint8Array.from([
      ...encoder.encode(before),
      ...bytes,
      ...encoder.encode(after),
    ]);
  }

  it.each([
    ["a lone continuation byte", [0x80]],
    ["an invalid lead byte", [0xff]],
    ["a sequence cut short", [0xe2, 0x82]],
    ["Latin-1's e with an acute accent", [0xe9]],
  ])(
    "answers %s without a failure of the server's, storing at most the one request",
    async (_name, bytes) => {
      const answer = await post(contactRequest(withBytesInTheName(bytes)));

      expect(answer.status).toBeLessThan(SERVER_FAILURE_FROM);
      expect(outside.heldStore.heldSubmissions().length).toBeLessThanOrEqual(1);
    },
  );

  it("reads a body that opens with a byte-order mark as the request it is", async () => {
    const marked = Uint8Array.from([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode(JSON.stringify(callbackRequest())),
    ]);

    const answer = await post(contactRequest(marked));

    const held = outside.heldStore.heldSubmissions();
    expect(answer.status).toBe(200);
    expect(held).toHaveLength(1);
    expect(JSON.stringify(held)).not.toContain(BYTE_ORDER_MARK);
  });
});

describe("what every answer holds, and what none does", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: FIRST_DAY, toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Each answer is asked for on a day of its own, so no bucket of an earlier one stands in its way. */
  function aDayLater(): void {
    vi.setSystemTime(new Date(Date.now() + DAY_MS));
  }

  /** One answer of every kind the route has, each made from a request full of marker values. */
  async function oneOfEachAnswer(): Promise<Response[]> {
    const full = (label: string, overrides: Fields = {}) =>
      designRequest(
        { clientRequestId: requestIdOf(label), ...overrides },
        byEmail(),
      );
    const answers: Response[] = [];
    const ask = async (arrange: () => void, fields: Fields, headers = {}) => {
      aDayLater();
      resetOutside(outside);
      post = await loadRoute();
      arrange();
      answers.push(await send(post, fields, { withVisitor: true, headers }));
    };
    await ask(() => undefined, full("sent"));
    await ask(() => undefined, full("cross"), {
      "sec-fetch-site": "cross-site",
    });
    await ask(() => undefined, full("type"), { "content-type": "text/plain" });
    await ask(() => undefined, full("invalid", { locale: MARKER.name }));
    await ask(() => undefined, full("rejected", { honeypot: MARKER.name }));
    await ask(() => {
      outside.load = () => Promise.resolve(found(undefined, "2"));
    }, full("stale"));
    await ask(() => {
      outside.load = () =>
        Promise.resolve(found(NARROWED_ROOM_OVERFLOWING_DESIGN));
    }, full("past-wall"));
    await ask(() => {
      resetOutside(outside, [NOT_SENT_RETRY]);
    }, full("retry"));
    await ask(() => {
      resetOutside(outside, [NOT_SENT_FOR_GOOD]);
    }, full("no-retry"));
    aDayLater();
    resetOutside(outside);
    post = await loadRoute();
    await send(post, full("conflict"), { withVisitor: true });
    answers.push(
      await send(post, full("conflict", { locale: "ru" }), {
        withVisitor: true,
      }),
    );
    answers.push(
      await post(
        contactRequest("x".repeat(BOUND_BYTES + 1), { withVisitor: true }),
      ),
    );
    // Last, since the counters stay down from here on.
    await ask(() => {
      failCountersFrom(1);
    }, full("unavailable"));
    return answers;
  }

  it("covers every status the route answers but a limit's, whose answers have a file of their own", async () => {
    const statuses = (await oneOfEachAnswer()).map(({ status }) => status);

    expect(statuses).toEqual([
      200, 403, 415, 400, 400, 409, 422, 502, 502, 409, 413, 503,
    ]);
  });

  it("is never stored by a cache, is JSON, and sets, clears or refreshes no cookie", async () => {
    for (const answer of await oneOfEachAnswer()) {
      expect(answer.headers.get("cache-control"), String(answer.status)).toBe(
        "no-store",
      );
      expect(answer.headers.get("content-type"), String(answer.status)).toMatch(
        /^application\/json/,
      );
      expect(answer.headers.getSetCookie(), String(answer.status)).toEqual([]);
    }
  });

  it("holds no submitted value, in its body or in a header, on any branch", async () => {
    for (const answer of await oneOfEachAnswer()) {
      const wire = JSON.stringify(await wireOf(answer));

      for (const marker of SUBMITTED_MARKERS) {
        expect(
          wire.includes(marker),
          `${String(answer.status)}: ${marker}`,
        ).toBe(false);
      }
    }
  });

  it("holds a reference only in the success", async () => {
    const [sent, ...failures] = await oneOfEachAnswer();

    expect(await sent?.json()).toEqual({
      status: "sent",
      reference: expect.stringMatching(/^[0-9A-Z-]{6,32}$/) as string,
    });
    for (const failure of failures) {
      const body = await failure.text();
      expect(body, String(failure.status)).not.toMatch(/reference|LM-/);
    }
  });

  it("lists a refused request's issues as a field and a code each, and nothing else", async () => {
    const answer = await send(
      post,
      designRequest(
        {
          locale: MARKER.name,
          clientRequestId: `${MARKER.requestId}!`,
          surprise: MARKER.locality,
        },
        {
          name: "",
          phone: MARKER.name,
          email: MARKER.address,
          channel: MARKER.locality,
        },
      ),
    );

    const body = (await answer.json()) as { issues: Record<string, unknown>[] };
    expect(body.issues.length).toBeGreaterThan(3);
    for (const issue of body.issues) {
      expect(Object.keys(issue).sort()).toEqual(["code", "field"]);
      expect(String(issue.field)).toMatch(/^[A-Za-z.]+$/);
      expect(String(issue.code)).toMatch(/^[A-Z_]+$/);
    }
  });

  it("names the bodies past the wall by the design's own ids and holds nothing of the customer", async () => {
    outside.load = () =>
      Promise.resolve(found(NARROWED_ROOM_OVERFLOWING_DESIGN));

    const answer = await send(post, designRequest({}, byEmail()));

    const body = (await answer.json()) as { placementIds: string[] };
    const ownIds = NARROWED_ROOM_OVERFLOWING_DESIGN.placements.map(
      ({ id }) => id,
    );
    expect(body.placementIds.length).toBeGreaterThan(0);
    expect(ownIds).toEqual(expect.arrayContaining(body.placementIds));
    expect(Object.keys(body).sort()).toEqual(["code", "error", "placementIds"]);
  });
});
