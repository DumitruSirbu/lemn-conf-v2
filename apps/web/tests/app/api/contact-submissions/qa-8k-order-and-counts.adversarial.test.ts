// The contact route with its real orchestration, judge, digest and book, and only what reaches outside the process a
// fake: what each request is counted against, in what order, and that a limit and an unavailable request are each one
// answer whichever bucket or cause made them.
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
  failTheStoreAt,
  found,
  loadRoute,
  MARKER,
  nameNoNetworkSource,
  nameTheNetworkSource,
  referenceOf,
  requestIdOf,
  resetOutside,
  send,
  watchCountedWindows,
  wireOf,
  wireWithoutTheWait,
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

const HOUR = 60;
const DAY = 1440;
const EVERY = [HOUR];
const NEW_BY_NETWORK = [HOUR, DAY];
const EVERY_FIGURE = 30;
const NEW_PER_HOUR_FIGURE = 3;
const NEW_PER_DAY_FIGURE = 10;
const VISITOR_FIGURE = 2;
const ADDRESS_FIGURE = 3;
const TRIES_FIGURE = 10;
const NOON_UTC = new Date("2026-10-10T12:20:00Z");
const NOT_SENT = { ok: false, kind: "busy" } as const;

let post: Post;
let countedWindows: () => number[];

beforeEach(async () => {
  vi.useFakeTimers({ now: NOON_UTC, toFake: ["Date"] });
  silenceEveryConsoleMethod();
  nameTheNetworkSource();
  resetOutside(outside);
  post = await loadRoute();
  countedWindows = watchCountedWindows();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** A new callback under an id of its own, from another address unless one is given. */
function newCallback(label: string, overrides: Fields = {}, contact = {}) {
  return callbackRequest(
    { clientRequestId: requestIdOf(label), ...overrides },
    contact,
  );
}

/** An address in a block of its own: the network's buckets count a block, not an address. */
function fromBlock(block: number) {
  return { headers: { "x-forwarded-for": `198.51.${String(block)}.7` } };
}

function hoursLater(hours: number): void {
  vi.setSystemTime(new Date(NOON_UTC.getTime() + hours * HOUR * 60_000));
}

describe("what a request that stores nothing is counted against", () => {
  it.each([
    ["a body that is not JSON text", "{{{"],
    [
      "a request the schema refuses",
      JSON.stringify(callbackRequest({ locale: "xx" })),
    ],
    ["a filled honeypot", JSON.stringify(callbackRequest({ honeypot: "x" }))],
    ["a form sent too fast", JSON.stringify(callbackRequest({ elapsedMs: 1 }))],
  ])(
    "counts %s against every request's bucket and nothing else",
    async (_name, body) => {
      const answer = await post(contactRequest(body));

      expect(answer.status).toBe(400);
      expect(countedWindows()).toEqual(EVERY);
      expect(outside.heldStore.heldSubmissions()).toHaveLength(0);
      expect(outside.fakeSender.sent).toHaveLength(0);
    },
  );

  it.each([
    [
      "a revision that is not the stored one",
      () => Promise.resolve(found(undefined, "2")),
      409,
    ],
    [
      "a design the browser does not own",
      () =>
        Promise.resolve({ kind: "refused", reason: "unavailable" } as const),
      409,
    ],
    [
      "a kitchen past its wall",
      () => Promise.resolve(found(NARROWED_ROOM_OVERFLOWING_DESIGN)),
      422,
    ],
  ])("spends no bucket of a new request on %s", async (_name, load, status) => {
    outside.load = load;

    const answer = await send(post, designRequest({}, byEmail()), {
      withVisitor: true,
    });

    expect(answer.status).toBe(status);
    expect(countedWindows()).toEqual(EVERY);
    expect(outside.heldStore.heldSubmissions()).toHaveLength(0);
    expect(outside.fakeSender.sent).toHaveLength(0);
  });

  it("asks the owned load nothing for a callback, and once for a design", async () => {
    await send(post, newCallback("no-load"));
    expect(outside.loadsAsked).toEqual([]);

    await send(post, designRequest());

    expect(outside.loadsAsked).toEqual([MARKER.designId]);
  });
});

describe("what a new request is counted against, step by step", () => {
  it("counts the network's hour and day alone for a callback with no cookie and no address", async () => {
    const answer = await send(post, newCallback("plain"));

    expect(answer.status).toBe(200);
    expect(countedWindows()).toEqual([...EVERY, ...NEW_BY_NETWORK]);
  });

  it("adds the browser's hour only when a visitor cookie came, and the address's day only by e-mail", async () => {
    await send(post, newCallback("browser"), { withVisitor: true });
    await send(post, newCallback("address", {}, byEmail()));
    await send(post, newCallback("both", {}, byEmail()), { withVisitor: true });

    expect(countedWindows()).toEqual([
      ...[...EVERY, ...NEW_BY_NETWORK, HOUR],
      ...[...EVERY, ...NEW_BY_NETWORK, DAY],
      ...[...EVERY, ...NEW_BY_NETWORK, HOUR, DAY],
    ]);
  });

  it.each([
    ["a cookie that is not a visitor's value", "__Host-lemnaria_visitor=short"],
    ["another cookie altogether", "session=abc"],
  ])(
    "skips the browser's step for %s, and is not unavailable",
    async (_name, cookie) => {
      const answer = await send(post, newCallback("odd-cookie"), {
        headers: { cookie },
      });

      expect(answer.status).toBe(200);
      expect(countedWindows()).toEqual([...EVERY, ...NEW_BY_NETWORK]);
    },
  );

  it("takes an address beside another channel, stores none and counts no address's day", async () => {
    const answer = await send(
      post,
      newCallback("phone-with-address", {}, { email: MARKER.address }),
    );

    const [held] = outside.heldStore.heldSubmissions();
    expect(answer.status).toBe(200);
    expect(held?.submission.contact.email).toBeUndefined();
    expect(JSON.stringify(held)).not.toContain(MARKER.address);
    expect(countedWindows()).toEqual([...EVERY, ...NEW_BY_NETWORK]);
  });
});

describe("each bucket refuses at its figure plus one and not before", () => {
  it("every request's: the thirty-first of any kind in an hour, and the next hour allows again", async () => {
    const answers: number[] = [];
    for (let sent = 0; sent <= EVERY_FIGURE; sent += 1) {
      answers.push((await post(contactRequest("{{{"))).status);
    }

    expect(answers.slice(0, EVERY_FIGURE)).toEqual(
      Array.from({ length: EVERY_FIGURE }, () => 400),
    );
    expect(answers[EVERY_FIGURE]).toBe(429);
    hoursLater(1);
    expect((await post(contactRequest("{{{"))).status).toBe(400);
  });

  it("the network's hour: the fourth new request, which stores nothing and counts no day", async () => {
    for (let sent = 1; sent <= NEW_PER_HOUR_FIGURE; sent += 1) {
      expect(
        (await send(post, newCallback(`hour-${String(sent)}`))).status,
      ).toBe(200);
    }
    const before = countedWindows().length;

    const refused = await send(post, newCallback("hour-over"));

    expect(refused.status).toBe(429);
    expect(countedWindows().slice(before)).toEqual([...EVERY, HOUR]);
    expect(outside.heldStore.heldSubmissions()).toHaveLength(
      NEW_PER_HOUR_FIGURE,
    );
    expect(outside.fakeSender.sent).toHaveLength(NEW_PER_HOUR_FIGURE);
  });

  it("the network's day: the eleventh new request of a UTC day, three an hour over four hours", async () => {
    const statuses: number[] = [];
    for (let sent = 0; sent <= NEW_PER_DAY_FIGURE; sent += 1) {
      hoursLater(Math.floor(sent / NEW_PER_HOUR_FIGURE));
      statuses.push(
        (await send(post, newCallback(`day-${String(sent)}`))).status,
      );
    }

    expect(statuses.slice(0, NEW_PER_DAY_FIGURE)).toEqual(
      Array.from({ length: NEW_PER_DAY_FIGURE }, () => 200),
    );
    expect(statuses[NEW_PER_DAY_FIGURE]).toBe(429);
    expect(outside.heldStore.heldSubmissions()).toHaveLength(
      NEW_PER_DAY_FIGURE,
    );
  });

  it("the browser's hour: the third new request of one visitor, each from another network", async () => {
    const statuses: number[] = [];
    for (let sent = 0; sent <= VISITOR_FIGURE; sent += 1) {
      const answer = await send(post, newCallback(`visitor-${String(sent)}`), {
        withVisitor: true,
        ...fromBlock(sent + 1),
      });
      statuses.push(answer.status);
    }

    expect(statuses).toEqual([200, 200, 429]);
    expect(outside.heldStore.heldSubmissions()).toHaveLength(VISITOR_FIGURE);
  });

  it("the address's day: the fourth new request to one address, each from another network", async () => {
    const statuses: number[] = [];
    for (let sent = 0; sent <= ADDRESS_FIGURE; sent += 1) {
      const answer = await send(
        post,
        newCallback(`address-${String(sent)}`, {}, byEmail()),
        fromBlock(sent + 1),
      );
      statuses.push(answer.status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(outside.heldStore.heldSubmissions()).toHaveLength(ADDRESS_FIGURE);
  });

  it("the tries of one stored request: the eleventh in an hour, counted against no new request's bucket", async () => {
    resetOutside(
      outside,
      Array.from({ length: 20 }, () => NOT_SENT),
    );
    const request = newCallback("tries");
    expect((await send(post, request)).status).toBe(502);
    const before = countedWindows().length;

    const statuses: number[] = [];
    for (let tried = 0; tried <= TRIES_FIGURE; tried += 1) {
      statuses.push((await send(post, request)).status);
    }

    expect(statuses.slice(0, TRIES_FIGURE)).toEqual(
      Array.from({ length: TRIES_FIGURE }, () => 502),
    );
    expect(statuses[TRIES_FIGURE]).toBe(429);
    expect(countedWindows().slice(before)).toEqual(
      Array.from({ length: (TRIES_FIGURE + 1) * 2 }, () => HOUR),
    );
    expect(outside.fakeSender.sent).toHaveLength(TRIES_FIGURE + 1);
    expect(outside.heldStore.heldSubmissions()).toHaveLength(1);
  });
});

describe("a caller's own text reaches a bucket only after the network's allowed", () => {
  it("counts neither the browser nor the address once the network's hour has refused", async () => {
    for (let sent = 1; sent <= NEW_PER_HOUR_FIGURE; sent += 1) {
      await send(post, newCallback(`spent-${String(sent)}`));
    }
    const before = countedWindows().length;

    const refused = await send(post, newCallback("with-text", {}, byEmail()), {
      withVisitor: true,
    });

    expect(refused.status).toBe(429);
    expect(countedWindows().slice(before)).toEqual([...EVERY, HOUR]);
  });

  it("never counts the tries of an id that is not stored, however often it is sent refused", async () => {
    outside.load = () => Promise.resolve(found(undefined, "2"));

    for (let sent = 0; sent < 5; sent += 1) await send(post, designRequest());

    expect(countedWindows()).toEqual(Array.from({ length: 5 }, () => HOUR));
  });
});

describe("the address as it is counted", () => {
  async function statusesTo(addresses: readonly string[]): Promise<number[]> {
    const statuses: number[] = [];
    for (const [index, address] of addresses.entries()) {
      const answer = await send(
        post,
        newCallback(`counted-${String(index)}`, {}, byEmail(address)),
        fromBlock(index + 1),
      );
      statuses.push(answer.status);
    }
    return statuses;
  }

  it("is one bucket however the address is cased", async () => {
    const statuses = await statusesTo([
      "marker.7c41@example.invalid",
      "MARKER.7C41@EXAMPLE.INVALID",
      "Marker.7c41@Example.Invalid",
      "mArKeR.7c41@eXaMpLe.invalid",
    ]);

    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("keeps a plus-tag and a dot apart: each is an address of its own", async () => {
    const statuses = await statusesTo([
      "marker7c41@example.invalid",
      "marker7c41+a@example.invalid",
      "marker7c41+b@example.invalid",
      "marker.7c41@example.invalid",
      "m.arker7c41@example.invalid",
    ]);

    expect(statuses).toEqual([200, 200, 200, 200, 200]);
  });
});

describe("the interim with no network source named", () => {
  beforeEach(nameNoNetworkSource);

  it("shares three new requests an hour among every address there is", async () => {
    const statuses: number[] = [];
    for (let sent = 0; sent <= NEW_PER_HOUR_FIGURE; sent += 1) {
      const answer = await send(
        post,
        newCallback(`world-${String(sent)}`),
        fromBlock(sent + 1),
      );
      statuses.push(answer.status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe("one answer for a limit, whichever bucket refused", () => {
  async function refusalOfEachBucket(): Promise<Response[]> {
    const refusals: Response[] = [];
    // The address's day, then the browser's hour, then the network's hour, each on a network of its own.
    for (let sent = 0; sent <= ADDRESS_FIGURE; sent += 1) {
      refusals[0] = await send(
        post,
        newCallback(`a-${String(sent)}`, {}, byEmail()),
        fromBlock(10 + sent),
      );
    }
    for (let sent = 0; sent <= VISITOR_FIGURE; sent += 1) {
      refusals[1] = await send(post, newCallback(`v-${String(sent)}`), {
        withVisitor: true,
        ...fromBlock(20 + sent),
      });
    }
    for (let sent = 0; sent <= NEW_PER_HOUR_FIGURE; sent += 1) {
      refusals[2] = await send(
        post,
        newCallback(`h-${String(sent)}`),
        fromBlock(30),
      );
    }
    for (let sent = 0; sent <= EVERY_FIGURE; sent += 1) {
      refusals[3] = await post(contactRequest("{{{", fromBlock(40)));
    }
    return refusals;
  }

  it("is equal in status, body and every header but the wait", async () => {
    const refusals = await refusalOfEachBucket();

    const wires = await Promise.all(refusals.map(wireWithoutTheWait));
    expect(wires.map(({ status }) => status)).toEqual([429, 429, 429, 429]);
    expect(new Set(wires.map((wire) => JSON.stringify(wire))).size).toBe(1);
    expect(new Set(await Promise.all(refusals.map(codeOf)))).toEqual(
      new Set(["CONTACT_LIMIT_REACHED"]),
    );
  });

  it("states a wait to the end of the window that refused: the hour's or the UTC day's", async () => {
    const [byAddress, byBrowser, byNetworkHour, byEvery] =
      await refusalOfEachBucket();

    const waitOf = (answer: Response | undefined) =>
      Number(answer?.headers.get("retry-after"));
    const toTheHour = 40 * 60;
    const toTheDay = 11 * 3600 + toTheHour;
    expect(waitOf(byAddress)).toBe(toTheDay);
    expect(waitOf(byBrowser)).toBe(toTheHour);
    expect(waitOf(byNetworkHour)).toBe(toTheHour);
    expect(waitOf(byEvery)).toBe(toTheHour);
  });
});

describe("one answer for unavailable, whichever cause made it", () => {
  async function unavailableBy(
    arrange: () => void,
    fields: Fields,
    withVisitor = false,
  ) {
    resetOutside(outside);
    post = await loadRoute();
    arrange();
    return send(post, fields, { withVisitor });
  }

  it("is equal in status, body and every header across every step that can fail", async () => {
    const stored = newCallback("stored-then-counters-fail");
    const answers = [
      await unavailableBy(() => {
        failCountersFrom(1);
      }, newCallback("every")),
      await unavailableBy(() => {
        failCountersFrom(2);
      }, newCallback("new-hour")),
      await unavailableBy(() => {
        failCountersFrom(3);
      }, newCallback("new-day")),
      await unavailableBy(
        () => {
          failCountersFrom(4);
        },
        newCallback("browser"),
        true,
      ),
      await unavailableBy(
        () => {
          failCountersFrom(4);
        },
        newCallback("address", {}, byEmail()),
      ),
      await unavailableBy(
        () => vi.stubEnv("DIGEST_SECRET", "not a secret"),
        newCallback("secret"),
      ),
      await unavailableBy(
        () => vi.stubEnv("CLIENT_NETWORK_SOURCE", "nowhere"),
        newCallback("source"),
      ),
      await unavailableBy(() => {
        failTheStoreAt(outside, "lookUp", new Error(MARKER.name));
      }, newCallback("lookup")),
      await unavailableBy(() => {
        outside.load = () => Promise.reject(new Error(MARKER.name));
      }, designRequest()),
    ];
    vi.unstubAllEnvs();
    nameTheNetworkSource();
    resetOutside(outside, [NOT_SENT]);
    post = await loadRoute();
    await send(post, stored);
    failCountersFrom(2);
    answers.push(await send(post, stored));

    const wires = await Promise.all(answers.map(wireOf));
    expect(wires.map(({ status }) => status)).toEqual(
      Array.from({ length: answers.length }, () => 503),
    );
    expect(new Set(wires.map((wire) => JSON.stringify(wire))).size).toBe(1);
    expect(new Set(await Promise.all(answers.map(codeOf)))).toEqual(
      new Set(["CONTACT_UNAVAILABLE"]),
    );
    expect(answers[0]?.headers.get("retry-after")).toBeNull();
  });

  it("stores and sends nothing when the counters fail at any step of a new request", async () => {
    for (const failingFrom of [1, 2, 3, 4, 5]) {
      const answer = await unavailableBy(
        () => {
          failCountersFrom(failingFrom);
        },
        newCallback(`fail-${String(failingFrom)}`, {}, byEmail()),
        true,
      );

      expect(answer.status).toBe(503);
      expect(outside.heldStore.heldSubmissions()).toHaveLength(0);
      expect(outside.fakeSender.sent).toHaveLength(0);
    }
  });
});

describe("a stored request sent again", () => {
  it("answers the same reference, holds one row, sends nothing more, and counts its tries alone", async () => {
    const request = newCallback("again", {}, byEmail());
    const first = await send(post, request, { withVisitor: true });
    const before = countedWindows().length;

    const second = await send(post, request, { withVisitor: true });

    expect(second.status).toBe(200);
    expect(await referenceOf(second)).toBe(await referenceOf(first));
    expect(countedWindows().slice(before)).toEqual([HOUR, HOUR]);
    expect(outside.heldStore.heldSubmissions()).toHaveLength(1);
    expect(outside.fakeSender.sent).toHaveLength(1);
  });

  it("is never trapped: five tries of a request stored and not notified each reach the sender", async () => {
    resetOutside(
      outside,
      Array.from({ length: 5 }, () => NOT_SENT),
    );
    const request = newCallback("not-trapped");
    const statuses = [(await send(post, request)).status];

    for (let tried = 0; tried < 5; tried += 1) {
      statuses.push((await send(post, request)).status);
    }

    expect(statuses).toEqual([502, 502, 502, 502, 502, 200]);
    expect(outside.fakeSender.sent).toHaveLength(6);
    expect(new Set(outside.fakeSender.sent.map(({ text }) => text)).size).toBe(
      1,
    );
    expect(outside.heldStore.heldSubmissions()).toHaveLength(1);
  });
});
