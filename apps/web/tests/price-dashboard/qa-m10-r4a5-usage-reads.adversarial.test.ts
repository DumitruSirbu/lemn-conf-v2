// Adversarial QA of the fetching client's counts, held to what a screen may show: a count is one the server sent for the
// item asked, whatever is asked at once, in whatever order the server answers, and however the server fails. A sweep of
// reads that overlap, of servers that fail in every way the client sorts, and of the waits a busy answer names.
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isSameItem, type ItemRef } from "@lemnaria/configurator-domain";

import { createFetchingItemLifecycleClient } from "@/price-dashboard/fetching-item-lifecycle-client";
import type { UsageRead } from "@/price-dashboard/item-lifecycle-client";
import { MAX_USAGE_ITEMS } from "@/price-dashboard/price-dashboard-wire-contract";

const UNIVERSE_SIZE = 120;
const SECONDS_BETWEEN_TURNS = 5_000;
const MOST_TURNS = 400;
const WRONG_COUNT_OFFSET = 1_000;
const ENOUGH_TIME_TO_GIVE_UP_MS = 60_000;

const UNIVERSE: readonly ItemRef[] = Array.from(
  { length: UNIVERSE_SIZE },
  (_, place): ItemRef => {
    switch (place % 3) {
      case 0:
        return { kind: "hardware", tierId: `hardware.h${String(place)}` };
      case 1:
        return { kind: "material", tierId: `material.m${String(place)}` };
      default:
        return { kind: "accessory", accessoryId: `accessory-${String(place)}` };
    }
  },
);

const truthOf = (item: ItemRef): number =>
  (UNIVERSE.findIndex((one) => isSameItem(one, item)) * 7) % 13;

type Mode =
  | { readonly kind: "ok" }
  | { readonly kind: "extras" }
  | { readonly kind: "omit"; readonly every: number }
  | { readonly kind: "duplicate" }
  | { readonly kind: "status"; readonly status: number }
  | { readonly kind: "network" }
  | { readonly kind: "busy"; readonly seconds: number }
  | { readonly kind: "badCount"; readonly value: unknown }
  | { readonly kind: "badBody" };

const HEALTHY: readonly Mode[] = [{ kind: "ok" }];

const modeArb: fc.Arbitrary<Mode> = fc.oneof(
  fc.constant<Mode>({ kind: "ok" }),
  fc.constant<Mode>({ kind: "extras" }),
  fc
    .integer({ min: 1, max: 4 })
    .map<Mode>((every) => ({ kind: "omit", every })),
  fc.constant<Mode>({ kind: "duplicate" }),
  fc
    .constantFrom(400, 401, 403, 404, 413, 500, 503)
    .map<Mode>((status) => ({ kind: "status", status })),
  fc.constant<Mode>({ kind: "network" }),
  fc
    .oneof(fc.integer({ min: 0, max: 12 }), fc.constant(3_000))
    .map<Mode>((seconds) => ({ kind: "busy", seconds })),
  fc
    .constantFrom<unknown>(-1, 1.5, "3", null, Number.NaN, 2 ** 60)
    .map<Mode>((value) => ({ kind: "badCount", value })),
  fc.constant<Mode>({ kind: "badBody" }),
);

interface RequestSeen {
  readonly items: readonly ItemRef[];
}

interface Server {
  readonly requests: RequestSeen[];
  readonly mostInFlight: () => number;
  /** From now on every request is answered by these modes in turn. */
  readonly answerWith: (modes: readonly Mode[]) => void;
}

function stubServer(
  stated: readonly boolean[],
  firstModes: readonly Mode[],
): Server {
  const requests: RequestSeen[] = [];
  let modes = firstModes;
  let turn = 0;
  let inFlight = 0;
  let most = 0;
  const isStated = (item: ItemRef) =>
    stated[UNIVERSE.findIndex((one) => isSameItem(one, item))] === true;

  vi.stubGlobal(
    "fetch",
    async (_address: string, init: RequestInit): Promise<Response> => {
      const { items } = JSON.parse(init.body as string) as {
        items: ItemRef[];
      };
      requests.push({ items });
      inFlight += 1;
      most = Math.max(most, inFlight);
      const mode: Mode = modes[turn % modes.length] ?? { kind: "ok" };
      turn += 1;
      try {
        for (let tick = 0; tick < 3; tick += 1) await Promise.resolve();
        return answerTo(mode, items, isStated);
      } finally {
        inFlight -= 1;
      }
    },
  );
  return {
    requests,
    mostInFlight: () => most,
    answerWith: (next) => {
      modes = next;
      turn = 0;
    },
  };
}

const entry = (item: ItemRef, count: unknown) => ({ item, count });

function answerTo(
  mode: Mode,
  items: readonly ItemRef[],
  isStated: (item: ItemRef) => boolean,
): Response {
  const correct = [...items]
    .reverse()
    .filter(isStated)
    .map((item) => entry(item, truthOf(item)));
  switch (mode.kind) {
    case "ok":
      return json(200, { counts: correct });
    case "extras": {
      const unasked = UNIVERSE.filter(
        (one) => !items.some((asked) => isSameItem(asked, one)),
      )
        .slice(0, 5)
        .map((one) => entry(one, truthOf(one) + WRONG_COUNT_OFFSET));
      return json(200, { counts: [...unasked, ...correct] });
    }
    case "omit":
      return json(200, {
        counts: correct.filter((_, place) => place % mode.every !== 0),
      });
    case "duplicate":
      return json(200, { counts: correct.flatMap((one) => [one, one]) });
    case "status":
      return json(mode.status, {
        counts: items.map((item) => entry(item, WRONG_COUNT_OFFSET)),
      });
    case "network":
      throw new TypeError("offline");
    case "busy":
      return json(
        429,
        { status: "rate-limited" },
        {
          "Retry-After": String(mode.seconds),
        },
      );
    case "badCount":
      return json(200, {
        counts: correct.map((one, place) =>
          place === 0 ? { ...one, count: mode.value } : one,
        ),
      });
    case "badBody":
      return new Response("<html>not json</html>", { status: 200 });
  }
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function itemAt(place: number): ItemRef {
  const item = UNIVERSE[place];
  if (item === undefined) throw new Error(`no item at ${String(place)}`);
  return item;
}

const itemsOf = (places: readonly number[]): ItemRef[] =>
  places.map((place) => itemAt(place));

function distinct(items: readonly ItemRef[]): ItemRef[] {
  return items.filter(
    (item, place) => items.findIndex((one) => isSameItem(one, item)) === place,
  );
}

interface Launch {
  readonly places: readonly number[];
  /** Microtask turns waited before this read is asked. */
  readonly after: number;
}

const launchArb: fc.Arbitrary<Launch> = fc.record({
  places: fc.array(fc.nat(UNIVERSE_SIZE - 1), { maxLength: 130 }),
  after: fc.nat(6),
});

const scenarioArb = fc.record({
  stated: fc.array(fc.boolean(), {
    minLength: UNIVERSE_SIZE,
    maxLength: UNIVERSE_SIZE,
  }),
  launches: fc.array(launchArb, { minLength: 1, maxLength: 4 }),
});

interface Outcome {
  readonly asked: readonly ItemRef[];
  readonly read: UsageRead;
}

/** Asks every read, each after its own turns, lets the waits pass, and returns what each was told. */
async function runReads(launches: readonly Launch[]): Promise<Outcome[]> {
  const client = createFetchingItemLifecycleClient();
  const pending: Promise<Outcome>[] = [];
  for (const { places, after } of launches) {
    for (let turn = 0; turn < after; turn += 1) await Promise.resolve();
    const asked = itemsOf(places);
    pending.push(client.readUsage(asked).then((read) => ({ asked, read })));
  }
  const all = Promise.all(pending);
  const progress = { isDone: false };
  const markDone = () => {
    progress.isDone = true;
  };
  void all.then(markDone, markDone);
  for (let turn = 0; turn < MOST_TURNS && !progress.isDone; turn += 1) {
    await vi.advanceTimersByTimeAsync(SECONDS_BETWEEN_TURNS);
  }
  expect(progress.isDone, "every read is told something in the end").toBe(true);
  return all;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a count, whatever the server does and whatever else is being counted", () => {
  it("is a count the server sent for an item asked, and nothing else: no extra, no zero, no repeat", async () => {
    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        fc.array(modeArb, { minLength: 1, maxLength: 8 }),
        async ({ stated, launches }, modes) => {
          const server = stubServer(stated, modes);

          const outcomes = await runReads(launches);

          for (const { asked, read } of outcomes) {
            if (read.kind !== "counted") continue;
            const items = read.counts.map(({ item }) => item);
            expect(distinct(items)).toHaveLength(items.length);
            for (const { item, designCount } of read.counts) {
              expect(asked.some((one) => isSameItem(one, item))).toBe(true);
              expect(
                stated[UNIVERSE.findIndex((o) => isSameItem(o, item))],
              ).toBe(true);
              expect(designCount).toBe(truthOf(item));
            }
          }
          expect(server.mostInFlight()).toBeLessThanOrEqual(1);
          for (const { items } of server.requests) {
            expect(items.length).toBeLessThanOrEqual(MAX_USAGE_ITEMS);
            expect(distinct(items)).toHaveLength(items.length);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it("is counted again once the server is well, however it failed before: no read left a slot taken", async () => {
    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        fc.array(modeArb, { minLength: 1, maxLength: 8 }),
        async ({ stated, launches }, modes) => {
          const server = stubServer(stated, modes);
          const client = createFetchingItemLifecycleClient();
          const failing = launches.map(({ places }) =>
            client.readUsage(itemsOf(places)),
          );
          for (let turn = 0; turn < MOST_TURNS; turn += 1) {
            await vi.advanceTimersByTimeAsync(SECONDS_BETWEEN_TURNS);
          }
          await Promise.allSettled(failing);
          server.answerWith(HEALTHY);
          const firstStated = UNIVERSE.find(
            (_, place) => stated[place] === true,
          );
          if (firstStated === undefined) return;
          const before = server.requests.length;

          const read = await client.readUsage([firstStated]);

          expect(read).toEqual({
            kind: "counted",
            counts: [{ item: firstStated, designCount: truthOf(firstStated) }],
          });
          expect(server.requests.length - before).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("is exactly the stated items asked, in the order asked, by every read that overlaps, when the server is well", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ stated, launches }) => {
        const server = stubServer(stated, HEALTHY);

        const outcomes = await runReads(launches);

        for (const { asked, read } of outcomes) {
          const expected = distinct(asked)
            .filter(
              (item) => stated[UNIVERSE.findIndex((o) => isSameItem(o, item))],
            )
            .map((item) => ({ item, designCount: truthOf(item) }));
          expect(read).toEqual(
            expected.length === 0
              ? { kind: "unavailable" }
              : { kind: "counted", counts: expected },
          );
        }
        expect(server.mostInFlight()).toBeLessThanOrEqual(1);
        const mostRequestsNeeded = launches.reduce(
          (sum, { places }) =>
            sum + Math.ceil(distinct(itemsOf(places)).length / MAX_USAGE_ITEMS),
          0,
        );
        expect(server.requests.length).toBeLessThanOrEqual(mostRequestsNeeded);
      }),
      { numRuns: 150 },
    );
  });

  it("is one request for a screen that counts no more than 50 items, however many times it asks at once", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.nat(UNIVERSE_SIZE - 1), { minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 4 }),
        async (places, howOften) => {
          const server = stubServer(
            Array.from({ length: UNIVERSE_SIZE }, () => true),
            HEALTHY,
          );
          const client = createFetchingItemLifecycleClient();
          const asked = itemsOf(places);

          const reads = await Promise.all(
            Array.from({ length: howOften }, () => client.readUsage(asked)),
          );

          expect(server.requests).toHaveLength(1);
          for (const read of reads) expect(read.kind).toBe("counted");
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("a count that fails in one request of several", () => {
  it.each([0, 1, 2])(
    "leaves every count of the read unknown when request %i of 3 fails, however it fails",
    async (failing) => {
      for (const failure of [
        { kind: "status", status: 503 },
        { kind: "network" },
        { kind: "badBody" },
        { kind: "badCount", value: -1 },
      ] as const) {
        const modes: Mode[] = [{ kind: "ok" }, { kind: "ok" }, { kind: "ok" }];
        modes[failing] = failure;
        stubServer(
          Array.from({ length: UNIVERSE_SIZE }, () => true),
          modes,
        );

        const read = await createFetchingItemLifecycleClient().readUsage(
          UNIVERSE.slice(0, 2 * MAX_USAGE_ITEMS + 10),
        );

        expect(read, `${failure.kind} on request ${String(failing)}`).toEqual({
          kind: "unavailable",
        });
      }
    },
  );
});

describe("a busy answer's wait", () => {
  async function requestsSentFor(retryAfter: string): Promise<number> {
    let sent = 0;
    vi.stubGlobal("fetch", () => {
      sent += 1;
      return Promise.resolve(
        new Response("{}", {
          status: 429,
          headers: { "Retry-After": retryAfter },
        }),
      );
    });
    const read = createFetchingItemLifecycleClient().readUsage([itemAt(0)]);
    await vi.advanceTimersByTimeAsync(ENOUGH_TIME_TO_GIVE_UP_MS);
    expect(await read).toEqual({ kind: "unavailable" });
    return sent;
  }

  it.each([
    ["0", 3],
    ["1", 3],
    ["10", 3],
    ["010", 3],
    ["11", 1],
    ["99999999999999999999", 1],
    ["-1", 1],
    ["5.0", 1],
    ["1e1", 1],
    ["", 1],
    ["Wed, 21 Oct 2026 07:28:00 GMT", 1],
  ])("Retry-After %j is asked %i time(s) in all", async (retryAfter, sent) => {
    expect(await requestsSentFor(retryAfter)).toBe(sent);
  });

  it("is not waited out for any answer but a 429, whatever the answer asks", async () => {
    for (const status of [400, 401, 403, 413, 500, 502, 503, 504]) {
      let sent = 0;
      vi.stubGlobal("fetch", () => {
        sent += 1;
        return Promise.resolve(
          new Response("{}", { status, headers: { "Retry-After": "1" } }),
        );
      });

      const read = createFetchingItemLifecycleClient().readUsage([itemAt(0)]);
      await vi.advanceTimersByTimeAsync(ENOUGH_TIME_TO_GIVE_UP_MS);

      expect(await read).toEqual({ kind: "unavailable" });
      expect(sent, `status ${String(status)}`).toBe(1);
    }
  });

  it("gives up the whole of a read when its first request stays busy: the other requests are never sent", async () => {
    let sent = 0;
    vi.stubGlobal("fetch", () => {
      sent += 1;
      return Promise.resolve(
        new Response("{}", { status: 429, headers: { "Retry-After": "1" } }),
      );
    });

    const read = createFetchingItemLifecycleClient().readUsage(
      UNIVERSE.slice(0, 2 * MAX_USAGE_ITEMS + 10),
    );
    await vi.advanceTimersByTimeAsync(ENOUGH_TIME_TO_GIVE_UP_MS);

    expect(await read).toEqual({ kind: "unavailable" });
    expect(sent).toBe(3);
  });
});

describe("a switch is never asked again", () => {
  it.each([429, 503])(
    "when the route answers %i with a short wait: it is sent once and fails",
    async (status) => {
      let sent = 0;
      vi.stubGlobal("fetch", () => {
        sent += 1;
        return Promise.resolve(
          new Response("{}", { status, headers: { "Retry-After": "1" } }),
        );
      });

      const outcome = createFetchingItemLifecycleClient().setActive({
        expectedRevision: "1",
        item: itemAt(0),
        active: false,
      });
      await vi.advanceTimersByTimeAsync(ENOUGH_TIME_TO_GIVE_UP_MS);

      expect(await outcome).toEqual({ kind: "failed" });
      expect(sent).toBe(1);
    },
  );
});

describe("a read that the network never answers", () => {
  it("does not keep another read, of other items, waiting for ever", async () => {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    const client = createFetchingItemLifecycleClient();
    void client.readUsage([itemAt(0)]);
    let isSecondDone = false;
    void client.readUsage([itemAt(1)]).then(() => {
      isSecondDone = true;
    });

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(isSecondDone, "the second read was told something").toBe(true);
  });
});
