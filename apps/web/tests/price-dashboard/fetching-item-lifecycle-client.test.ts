// The fetching lifecycle client asks the availability and usage routes as they are written: the address, a JSON body and
// the origin the routes' guard reads, with every answer sorted into the closed outcomes. A count is believed only for an
// item asked about, found by the item and never by its place in the answer; a read that cannot be had is `unavailable`,
// never a zero. One count is on its way at a time, because the server allows one per account.
import { getEventListeners } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AVAILABILITY_REFUSAL_CODES,
  isSameItem,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import {
  availabilityOutcomeOf,
  createFetchingItemLifecycleClient,
  FETCHING_ITEM_LIFECYCLE_CLIENT,
} from "@/price-dashboard/fetching-item-lifecycle-client";
import { MAX_USAGE_ITEMS } from "@/price-dashboard/price-dashboard-wire-contract";

import { stateOf } from "./dashboard-state-fixture";

const HETTICH: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const BLUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const RACK: ItemRef = { kind: "accessory", accessoryId: "drying-rack" };

const SWITCH_REQUEST = {
  expectedRevision: "3",
  item: HETTICH,
  active: false,
};

type FetchStub = ReturnType<
  typeof vi.fn<(address: string, init: RequestInit) => Promise<Response>>
>;

function respond(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers,
  });
}

function stubFetch(
  status: number,
  body?: unknown,
  headers?: Record<string, string>,
): FetchStub {
  const fetchStub: FetchStub = vi.fn(() =>
    Promise.resolve(respond(status, body, headers)),
  );
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function bodyOf(init: RequestInit | undefined): unknown {
  return JSON.parse((init?.body ?? "null") as string);
}

function itemsOfCall(fetchStub: FetchStub, call: number): ItemRef[] {
  const [, init] = fetchStub.mock.calls[call] ?? [];
  return (bodyOf(init) as { items: ItemRef[] }).items;
}

const wireCount = (item: ItemRef, count: number) => ({ item, count });

/** The usage route as the server answers it: the counts of the items asked, in the reverse of the order asked. */
function countingServer(countOf: (item: ItemRef) => number): FetchStub {
  const fetchStub: FetchStub = vi.fn((_address, init) => {
    const { items } = bodyOf(init) as { items: ItemRef[] };
    return Promise.resolve(
      respond(200, {
        counts: [...items]
          .reverse()
          .map((item) => wireCount(item, countOf(item))),
      }),
    );
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function materials(howMany: number): ItemRef[] {
  return Array.from({ length: howMany }, (_, index) => ({
    kind: "material",
    tierId: `material.${String(index)}`,
  }));
}

/** The place a material of `materials` holds in the list it came from. */
function placeOf(item: ItemRef): number {
  return item.kind === "material" ? Number(item.tierId.split(".")[1]) : -1;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("what the client is", () => {
  it("writes, and may delete a row the active book states, the draft route taking the deletion", () => {
    expect(FETCHING_ITEM_LIFECYCLE_CLIENT.canWrite).toBe(true);
    expect(FETCHING_ITEM_LIFECYCLE_CLIENT.canDeleteStatedItems).toBe(true);
  });
});

describe("a switch", () => {
  it("is posted to the availability route as JSON, stating the origin", async () => {
    const fetchStub = stubFetch(200, { revision: "4" });

    await createFetchingItemLifecycleClient().setActive(SWITCH_REQUEST);

    const [address, init] = fetchStub.mock.calls[0] ?? [];
    expect(address).toBe("/api/staff/prices/availability");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      referrerPolicy: "same-origin",
    });
    expect(bodyOf(init)).toEqual(SWITCH_REQUEST);
  });

  it("is set, with the revision it created, on a 200", () => {
    expect(
      availabilityOutcomeOf({ status: 200, body: { revision: "4" } }),
    ).toEqual({ kind: "set", revision: "4" });
  });

  it.each([
    ["no body", undefined],
    ["no revision", {}],
    ["a revision that is not text", { revision: 4 }],
  ])("is failed on a 200 with %s", (_name, body) => {
    expect(availabilityOutcomeOf({ status: 200, body })).toEqual({
      kind: "failed",
    });
  });

  it.each(AVAILABILITY_REFUSAL_CODES)(
    "is refused with the domain's own word %s on a 409",
    (code) => {
      expect(
        availabilityOutcomeOf({ status: 409, body: { status: code } }),
      ).toEqual({ kind: "refused", code });
    },
  );

  it("is refused for the saved default too, which also names its item", () => {
    expect(
      availabilityOutcomeOf({
        status: 409,
        body: { status: "item-is-default", item: HETTICH },
      }),
    ).toEqual({ kind: "refused", code: "item-is-default" });
  });

  it("is a conflict on a 409 changed-meanwhile", () => {
    expect(
      availabilityOutcomeOf({
        status: 409,
        body: { status: "changed-meanwhile" },
      }),
    ).toEqual({ kind: "conflict" });
  });

  it.each([
    ["a word of another route", { status: "candidate-refused" }],
    ["a word that is not one of the routes", { status: "teapot" }],
    ["no word", {}],
    ["no body", undefined],
  ])("is failed on a 409 with %s", (_name, body) => {
    expect(availabilityOutcomeOf({ status: 409, body })).toEqual({
      kind: "failed",
    });
  });

  it("is the end of the session on a 401", () => {
    expect(availabilityOutcomeOf({ status: 401, body: undefined })).toEqual({
      kind: "session-ended",
    });
  });

  it.each([400, 403, 404, 429, 500, 503])(
    "is failed on a %i, whatever its body says",
    (status) => {
      expect(
        availabilityOutcomeOf({ status, body: { revision: "4" } }),
      ).toEqual({ kind: "failed" });
    },
  );

  it("is failed when the request cannot be made", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );

    expect(
      await createFetchingItemLifecycleClient().setActive(SWITCH_REQUEST),
    ).toEqual({ kind: "failed" });
  });
});

describe("what is switched off now", () => {
  it("is the availability of the dashboard's state", async () => {
    const state = stateOf();
    const availability = { revision: "5", disabled: [BLUM] };
    const fetchStub = stubFetch(200, {
      ...state,
      active: { ...state.active, availability },
    });

    const read = await createFetchingItemLifecycleClient().readAvailability();

    expect(fetchStub.mock.calls[0]?.[0]).toBe("/api/staff/prices");
    expect(read).toEqual(availability);
  });

  it("is absent when the state cannot be read", async () => {
    stubFetch(503, { status: "unavailable" });

    expect(
      await createFetchingItemLifecycleClient().readAvailability(),
    ).toBeUndefined();
  });
});

describe("a count", () => {
  it("is posted to the usage route with the items asked, once", async () => {
    const fetchStub = countingServer(() => 2);

    await createFetchingItemLifecycleClient().readUsage([HETTICH, BLUM]);

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [address, init] = fetchStub.mock.calls[0] ?? [];
    expect(address).toBe("/api/staff/prices/usage");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      referrerPolicy: "same-origin",
    });
    expect(bodyOf(init)).toEqual({ items: [HETTICH, BLUM] });
  });

  it("is matched to its item, never to its place in the answer: the server answers in another order", async () => {
    countingServer((item) => {
      if (isSameItem(item, HETTICH)) return 14;
      return isSameItem(item, BLUM) ? 0 : 5;
    });

    const read = await createFetchingItemLifecycleClient().readUsage([
      HETTICH,
      BLUM,
      RACK,
    ]);

    expect(read).toEqual({
      kind: "counted",
      counts: [
        { item: HETTICH, designCount: 14 },
        { item: BLUM, designCount: 0 },
        { item: RACK, designCount: 5 },
      ],
    });
  });

  it("believes the refs it asked about and not the ones the answer states", async () => {
    stubFetch(200, {
      counts: [wireCount({ ...HETTICH, tierId: "hardware.other" }, 9)],
    });

    expect(
      await createFetchingItemLifecycleClient().readUsage([HETTICH]),
    ).toEqual({ kind: "unavailable" });
  });

  it.each([
    [
      "a count that is missing",
      { counts: [{ item: HETTICH }, wireCount(BLUM, 1)] },
    ],
    [
      "a count that is negative",
      { counts: [wireCount(HETTICH, -1), wireCount(BLUM, 1)] },
    ],
    [
      "a count that is not whole",
      { counts: [wireCount(HETTICH, 1.5), wireCount(BLUM, 1)] },
    ],
    [
      "a count that is text",
      { counts: [{ item: HETTICH, count: "3" }, wireCount(BLUM, 1)] },
    ],
    ["counts that are no list", { counts: "none" }],
    ["no counts", {}],
  ])(
    "is unavailable, never a zero, for an answer with %s",
    async (_name, body) => {
      stubFetch(200, body);

      expect(
        await createFetchingItemLifecycleClient().readUsage([HETTICH, BLUM]),
      ).toEqual({ kind: "unavailable" });
    },
  );

  it.each([400, 401, 403, 404, 500, 503])(
    "is unavailable on a %i",
    async (status) => {
      stubFetch(status, { counts: [wireCount(HETTICH, 3)] });

      expect(
        await createFetchingItemLifecycleClient().readUsage([HETTICH]),
      ).toEqual({ kind: "unavailable" });
    },
  );

  it("is unavailable when the request cannot be made", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );

    expect(
      await createFetchingItemLifecycleClient().readUsage([HETTICH]),
    ).toEqual({ kind: "unavailable" });
  });

  it("has no count for an item the server's book does not state: the server leaves it out, and it is never a zero", async () => {
    stubFetch(200, { counts: [wireCount(HETTICH, 3)] });

    expect(
      await createFetchingItemLifecycleClient().readUsage([HETTICH, BLUM]),
    ).toEqual({
      kind: "counted",
      counts: [{ item: HETTICH, designCount: 3 }],
    });
  });

  it("is unavailable when the server states none of the items asked", async () => {
    stubFetch(200, { counts: [] });

    expect(
      await createFetchingItemLifecycleClient().readUsage([HETTICH, BLUM]),
    ).toEqual({ kind: "unavailable" });
  });

  it("sends nothing for nothing", async () => {
    const fetchStub = countingServer(() => 1);

    expect(await createFetchingItemLifecycleClient().readUsage([])).toEqual({
      kind: "unavailable",
    });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("names an item once, however often it is asked", async () => {
    const fetchStub = countingServer(() => 1);

    const read = await createFetchingItemLifecycleClient().readUsage([
      HETTICH,
      HETTICH,
    ]);

    expect(itemsOfCall(fetchStub, 0)).toEqual([HETTICH]);
    expect(read).toEqual({
      kind: "counted",
      counts: [{ item: HETTICH, designCount: 1 }],
    });
  });
});

describe("a count of many items", () => {
  it("is one request for as many items as one request may name", async () => {
    const fetchStub = countingServer(() => 1);

    const read = await createFetchingItemLifecycleClient().readUsage(
      materials(MAX_USAGE_ITEMS),
    );

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(read.kind).toBe("counted");
  });

  it("is asked in requests of at most that many, each item once, and counted in the order asked", async () => {
    const fetchStub = countingServer(placeOf);
    const asked = materials(2 * MAX_USAGE_ITEMS + 20);

    const read = await createFetchingItemLifecycleClient().readUsage(asked);

    expect(
      fetchStub.mock.calls.map(
        (_, call) => itemsOfCall(fetchStub, call).length,
      ),
    ).toEqual([MAX_USAGE_ITEMS, MAX_USAGE_ITEMS, 20]);
    expect(
      fetchStub.mock.calls.flatMap((_, call) => itemsOfCall(fetchStub, call)),
    ).toEqual(asked);
    expect(
      read.kind === "counted" && read.counts.map(({ item }) => item),
    ).toEqual(asked);
    expect(read.kind === "counted" && read.counts.at(-1)?.designCount).toBe(
      2 * MAX_USAGE_ITEMS + 19,
    );
  });

  it("leaves every count unknown when one request of it fails", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((_address: string, init: RequestInit) => {
        call += 1;
        const { items } = bodyOf(init) as { items: ItemRef[] };
        return Promise.resolve(
          call === 2
            ? respond(503, { status: "unavailable" })
            : respond(200, { counts: items.map((item) => wireCount(item, 1)) }),
        );
      }),
    );

    expect(
      await createFetchingItemLifecycleClient().readUsage(
        materials(MAX_USAGE_ITEMS + 1),
      ),
    ).toEqual({ kind: "unavailable" });
  });
});

describe("a count while another is on its way", () => {
  /** A server that holds each count until the test lets it go. */
  function heldServer() {
    const releases: (() => void)[] = [];
    const fetchStub: FetchStub = vi.fn((_address, init) => {
      const { items } = bodyOf(init) as { items: ItemRef[] };
      return new Promise<Response>((resolve) => {
        releases.push(() => {
          resolve(
            respond(200, {
              counts: items.map((item) => wireCount(item, 7)),
            }),
          );
        });
      });
    });
    vi.stubGlobal("fetch", fetchStub);
    return { fetchStub, releaseNext: () => releases.shift()?.() };
  }

  it("joins it when it asks for the same items: one request answers both", async () => {
    const { fetchStub, releaseNext } = heldServer();
    const client = createFetchingItemLifecycleClient();

    const first = client.readUsage([HETTICH, BLUM]);
    const second = client.readUsage([BLUM, HETTICH]);
    releaseNext();

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(await first).toEqual({
      kind: "counted",
      counts: [
        { item: HETTICH, designCount: 7 },
        { item: BLUM, designCount: 7 },
      ],
    });
    expect(await second).toEqual({
      kind: "counted",
      counts: [
        { item: BLUM, designCount: 7 },
        { item: HETTICH, designCount: 7 },
      ],
    });
  });

  it("joins it when it asks for fewer of the same items", async () => {
    const { fetchStub, releaseNext } = heldServer();
    const client = createFetchingItemLifecycleClient();

    const wide = client.readUsage([HETTICH, BLUM]);
    const narrow = client.readUsage([BLUM]);
    releaseNext();

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(await narrow).toEqual({
      kind: "counted",
      counts: [{ item: BLUM, designCount: 7 }],
    });
    expect((await wide).kind).toBe("counted");
  });

  it("waits for it when it asks for other items, and then goes out itself", async () => {
    const { fetchStub, releaseNext } = heldServer();
    const client = createFetchingItemLifecycleClient();

    const first = client.readUsage([HETTICH]);
    const second = client.readUsage([RACK]);
    await vi.waitFor(() => {
      expect(fetchStub).toHaveBeenCalledTimes(1);
    });
    expect(itemsOfCall(fetchStub, 0)).toEqual([HETTICH]);
    releaseNext();
    await first;
    await vi.waitFor(() => {
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });
    expect(itemsOfCall(fetchStub, 1)).toEqual([RACK]);
    releaseNext();

    expect(await second).toEqual({
      kind: "counted",
      counts: [{ item: RACK, designCount: 7 }],
    });
  });

  it("is dropped, not sent, when nobody wants it by the time the one ahead ends: dismissed questions queue no requests", async () => {
    const { fetchStub, releaseNext } = heldServer();
    const client = createFetchingItemLifecycleClient();
    const dismissals = [new AbortController(), new AbortController()];

    const first = client.readUsage([HETTICH]);
    const dismissed = [BLUM, RACK].map((item, place) =>
      client.readUsage([item], dismissals[place]?.signal),
    );
    for (const dismissal of dismissals) dismissal.abort();
    releaseNext();

    expect(await Promise.all(dismissed)).toEqual([
      { kind: "unavailable" },
      { kind: "unavailable" },
    ]);
    expect((await first).kind).toBe("counted");
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("leaves no listener on its signal once the one ahead has ended and it goes out itself", async () => {
    const { fetchStub, releaseNext } = heldServer();
    const client = createFetchingItemLifecycleClient();
    const wanted = new AbortController();

    const first = client.readUsage([HETTICH]);
    const second = client.readUsage([RACK], wanted.signal);
    expect(
      getEventListeners(wanted.signal, "abort"),
      "while it waits it listens for its own dismissal",
    ).toHaveLength(1);
    releaseNext();
    await first;
    await vi.waitFor(() => {
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });

    expect(getEventListeners(wanted.signal, "abort")).toHaveLength(0);
    releaseNext();
    await second;
  });

  it("leaves no listener on its signal once it was dismissed while it waited", async () => {
    const { releaseNext } = heldServer();
    const client = createFetchingItemLifecycleClient();
    const dismissal = new AbortController();

    const first = client.readUsage([HETTICH]);
    const dismissed = client.readUsage([RACK], dismissal.signal);
    dismissal.abort();
    await dismissed;

    expect(getEventListeners(dismissal.signal, "abort")).toHaveLength(0);
    releaseNext();
    await first;
  });

  it("sends nothing when its signal has aborted before it was asked", async () => {
    const fetchStub = countingServer(() => 1);
    const dismissed = new AbortController();
    dismissed.abort();

    expect(
      await createFetchingItemLifecycleClient().readUsage(
        [HETTICH],
        dismissed.signal,
      ),
    ).toEqual({ kind: "unavailable" });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("is still sent when only a read behind it was dismissed, and a wanted read behind it is still answered", async () => {
    const { fetchStub, releaseNext } = heldServer();
    const client = createFetchingItemLifecycleClient();
    const dismissal = new AbortController();

    const first = client.readUsage([HETTICH]);
    const dismissed = client.readUsage([BLUM], dismissal.signal);
    const wanted = client.readUsage([RACK]);
    dismissal.abort();
    releaseNext();
    await first;
    await vi.waitFor(() => {
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });
    releaseNext();

    expect(await dismissed).toEqual({ kind: "unavailable" });
    expect(await wanted).toEqual({
      kind: "counted",
      counts: [{ item: RACK, designCount: 7 }],
    });
  });

  it("asks again, once the one on its way has ended", async () => {
    const fetchStub = countingServer(() => 1);
    const client = createFetchingItemLifecycleClient();

    await client.readUsage([HETTICH]);
    await client.readUsage([HETTICH]);

    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("frees its place when a read rejects, and a read waiting behind it is not rejected with it", async () => {
    const client = createFetchingItemLifecycleClient();
    const unsendable = { kind: "material", tierId: 1n } as unknown as ItemRef;
    countingServer(() => 4);

    const rejected = client.readUsage([unsendable]);
    const waiting = client.readUsage([HETTICH]);
    await expect(rejected).rejects.toThrow();

    expect(await waiting).toEqual({
      kind: "counted",
      counts: [{ item: HETTICH, designCount: 4 }],
    });
    expect(await client.readUsage([BLUM])).toEqual({
      kind: "counted",
      counts: [{ item: BLUM, designCount: 4 }],
    });
  });

  it("is not kept waiting by one that failed", async () => {
    stubFetch(503, { status: "unavailable" });
    const client = createFetchingItemLifecycleClient();

    expect(await client.readUsage([HETTICH])).toEqual({ kind: "unavailable" });

    countingServer(() => 4);
    expect(await client.readUsage([HETTICH])).toEqual({
      kind: "counted",
      counts: [{ item: HETTICH, designCount: 4 }],
    });
  });
});

describe("a count the network never answers", () => {
  it("is ended after fifteen seconds, longer than the server's own deadline, and says it cannot count", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      (_address: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const settled = { isDone: false };

    const read = createFetchingItemLifecycleClient().readUsage([HETTICH]);
    void read.then(() => {
      settled.isDone = true;
    });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled.isDone, "the server may still answer").toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await read).toEqual({ kind: "unavailable" });
  });
});

describe("a count the server finds busy", () => {
  const BUSY = (seconds: string) => ({ "Retry-After": seconds });

  /** Busy for the first `busyFor` requests, then counting. */
  function busyThenCounting(busyFor: number, retryAfter?: string): FetchStub {
    let calls = 0;
    const fetchStub: FetchStub = vi.fn((_address, init) => {
      calls += 1;
      if (calls <= busyFor) {
        return Promise.resolve(
          respond(
            429,
            { status: "rate-limited" },
            retryAfter === undefined ? {} : BUSY(retryAfter),
          ),
        );
      }
      const { items } = bodyOf(init) as { items: ItemRef[] };
      return Promise.resolve(
        respond(200, { counts: items.map((item) => wireCount(item, 6)) }),
      );
    });
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
  }

  it("is asked again after the seconds the answer names, and counted", async () => {
    vi.useFakeTimers();
    const fetchStub = busyThenCounting(1, "10");

    const read = createFetchingItemLifecycleClient().readUsage([HETTICH]);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(await read).toEqual({
      kind: "counted",
      counts: [{ item: HETTICH, designCount: 6 }],
    });
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("gives up after two more tries, and says it cannot count", async () => {
    vi.useFakeTimers();
    const fetchStub = busyThenCounting(99, "10");

    const read = createFetchingItemLifecycleClient().readUsage([HETTICH]);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await read).toEqual({ kind: "unavailable" });
    expect(fetchStub).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["a wait of most of an hour, which is a spent allowance", "3000"],
    ["a wait that is not whole seconds", "soon"],
    ["no wait named", undefined],
  ])("is not asked again for %s", async (_name, retryAfter) => {
    vi.useFakeTimers();
    const fetchStub = busyThenCounting(99, retryAfter);

    const read = createFetchingItemLifecycleClient().readUsage([HETTICH]);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await read).toEqual({ kind: "unavailable" });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
