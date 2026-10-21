// @vitest-environment happy-dom
//
// Adversarial reading of the staff kitchen hook (wave L3-U3): what the hook does when answers arrive late, out of order or
// for the wrong kitchen, when the page is left or run twice, and when the answer is not what the route says. The server is
// a stand-in for `fetch` that can hold a request and answer it after the hook has moved on, as a response already in flight
// does when the abort comes too late for it.
import { StrictMode, act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useStaffKitchen,
  type StaffKitchenReading,
} from "@/staff/use-staff-kitchen";
import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
  resolveStaffSessionExpired,
} from "@/staff/staff-session-expiry";

import { renderHook, type RenderedHook } from "../support/render-hook";
import { STAFF_KITCHEN_ID, wireKitchen } from "../support/staff-kitchen-wire";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  installStaffKitchensServer,
  staffKitchenIdOf,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

const NOW = "2026-10-21T12:00:00.000Z";
const OTHER_KITCHEN_ID = staffKitchenIdOf(2);
const MS_PER_SECOND = 1000;
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

let server: StaffKitchensServer;
let hook: RenderedHook<StaffKitchenReading> | undefined;
let assigned: string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  resetStaffSessionExpiryForTests();
  assigned = [];
  vi.stubGlobal("location", {
    assign: (address: string) => assigned.push(address),
  });
  server = installStaffKitchensServer();
});

afterEach(() => {
  hook?.unmount();
  hook = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

function mount(
  id: string = STAFF_KITCHEN_ID,
  wrap?: (children: React.ReactNode) => React.ReactNode,
): { setId: (next: string) => Promise<void> } {
  let current = id;
  hook = renderHook(() => useStaffKitchen(current), wrap);
  return {
    setId: async (next) => {
      current = next;
      hook?.rerender();
      await settle();
    },
  };
}

function reading(): StaffKitchenReading {
  if (hook === undefined) throw new Error("nothing is mounted");
  return hook.result.current;
}

function readyKitchenId(): string {
  const { state } = reading();
  if (state.phase !== "ready") throw new Error(`state was ${state.phase}`);
  return state.kitchen.kitchen.id;
}

function kitchenWire(id: string, name: string): Record<string, unknown> {
  return wireKitchen({ kitchen: { id, name } });
}

describe("answers that come late or out of order", () => {
  it("keeps loading when the answer of the request a retry replaced arrives before the newer one's", async () => {
    server.script(() => "hold");
    server.honoursAbort = false;
    mount();
    await settle();
    act(() => {
      reading().retry();
    });
    await settle();
    const [first, second] = server.held;

    first?.answer({ body: kitchenWire(STAFF_KITCHEN_ID, "Stale") });
    await settle();

    expect(reading().state).toEqual({ phase: "loading" });

    second?.answer({ body: kitchenWire(STAFF_KITCHEN_ID, "Newest") });
    await settle();

    const { state } = reading();
    expect(state.phase === "ready" && state.kitchen.kitchen.name).toBe(
      "Newest",
    );
  });

  it("does not leave for the login page on a 401 that a newer request replaced", async () => {
    server.script(() => "hold");
    server.honoursAbort = false;
    mount();
    await settle();
    act(() => {
      reading().retry();
    });
    await settle();
    const [first, second] = server.held;

    first?.answer(UNAUTHENTICATED_ANSWER);
    await settle();
    second?.answer({ body: kitchenWire(STAFF_KITCHEN_ID, "Newest") });
    await settle();

    expect(assigned).toEqual([]);
    expect(readyKitchenId()).toBe(STAFF_KITCHEN_ID);
  });

  it.each([
    ["a kitchen", { body: kitchenWire(STAFF_KITCHEN_ID, "Late") }],
    ["a 401", UNAUTHENTICATED_ANSWER],
    ["a 403", FORBIDDEN_ANSWER],
    ["a 429", RATE_LIMITED_ANSWER(5)],
    ["a 503", UNAVAILABLE_ANSWER],
    ["a refusal of the kitchen", { status: 404, body: { error: "gone" } }],
  ] satisfies [string, ServerAnswer][])(
    "does nothing at all with %s that arrives after the page was left",
    async (_, answer) => {
      const errors = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      server.script(() => "hold");
      server.honoursAbort = false;
      mount();
      await settle();
      const held = server.held[0];

      hook?.unmount();
      hook = undefined;
      held?.answer(answer);
      await settle();

      expect(assigned).toEqual([]);
      expect(errors).not.toHaveBeenCalled();
      expect(held?.signal.aborted).toBe(true);
    },
  );

  it("asks the server for nothing more after the page was left", async () => {
    server.script(() => ({ status: 503, body: { status: "unavailable" } }));
    mount();
    await settle();
    hook?.unmount();
    hook = undefined;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * MS_PER_SECOND);
    });

    expect(server.requests).toHaveLength(1);
  });
});

describe("another kitchen while the page is up", () => {
  it("aborts the request for the kitchen it left, asks for the new one, and draws only the new one's answer", async () => {
    server.script(() => "hold");
    server.honoursAbort = false;
    const page = mount(STAFF_KITCHEN_ID);
    await settle();

    await page.setId(OTHER_KITCHEN_ID);
    const [forFirst, forSecond] = server.held;
    forSecond?.answer({ body: kitchenWire(OTHER_KITCHEN_ID, "Second") });
    await settle();
    forFirst?.answer({ body: kitchenWire(STAFF_KITCHEN_ID, "First") });
    await settle();

    expect(forFirst?.signal.aborted).toBe(true);
    expect(forSecond?.signal.aborted).toBe(false);
    expect(server.requests.map(({ url }) => url.pathname)).toEqual([
      `/api/staff/kitchens/${STAFF_KITCHEN_ID}`,
      `/api/staff/kitchens/${OTHER_KITCHEN_ID}`,
    ]);
    expect(readyKitchenId()).toBe(OTHER_KITCHEN_ID);
  });

  it("does not draw the answer of the kitchen it left even when that is the only answer to come", async () => {
    server.script(() => "hold");
    server.honoursAbort = false;
    const page = mount(STAFF_KITCHEN_ID);
    await settle();

    await page.setId(OTHER_KITCHEN_ID);
    server.held[0]?.answer({ body: kitchenWire(STAFF_KITCHEN_ID, "First") });
    await settle();

    expect(reading().state.phase).not.toBe("ready");
  });

  it("does not leave for the login page on the 401 of the kitchen it left", async () => {
    server.script(() => "hold");
    server.honoursAbort = false;
    const page = mount(STAFF_KITCHEN_ID);
    await settle();

    await page.setId(OTHER_KITCHEN_ID);
    server.held[0]?.answer(UNAUTHENTICATED_ANSWER);
    await settle();

    expect(assigned).toEqual([]);
  });
});

describe("a kitchen that is not the one asked for", () => {
  it.each([
    ["another kitchen", OTHER_KITCHEN_ID],
    ["the same letters in another case", STAFF_KITCHEN_ID.toUpperCase()],
    ["the same id with a trailing newline", `${STAFF_KITCHEN_ID}\n`],
  ])(
    "is a failed request, not a kitchen, when the body is %s",
    async (_, id) => {
      server.script(() => ({ body: wireKitchen({ kitchen: { id } }) }));

      mount();
      await settle();

      expect(reading().state).toEqual({
        phase: "failed",
        failure: { kind: "failed" },
      });
    },
  );

  it("is a failed request after a retry too, when the retry is answered with another kitchen", async () => {
    server.script(() => UNAVAILABLE_ANSWER);
    mount();
    await settle();
    server.script(() => ({ body: kitchenWire(OTHER_KITCHEN_ID, "Wrong") }));

    act(() => {
      reading().retry();
    });
    await settle();

    expect(reading().state).toEqual({
      phase: "failed",
      failure: { kind: "failed" },
    });
  });
});

describe("the page run twice, as the development build does", () => {
  const strictly = (children: React.ReactNode) =>
    createElement(StrictMode, null, children);

  it("keeps only the second request: the first is aborted and its answer is not drawn", async () => {
    server.script(() => "hold");
    server.honoursAbort = false;
    mount(STAFF_KITCHEN_ID, strictly);
    await settle();
    const [first, second] = server.held;

    first?.answer({ body: kitchenWire(STAFF_KITCHEN_ID, "From the first") });
    await settle();
    expect(reading().state).toEqual({ phase: "loading" });
    second?.answer({ body: kitchenWire(STAFF_KITCHEN_ID, "From the second") });
    await settle();

    expect(server.held).toHaveLength(2);
    expect(first?.signal.aborted).toBe(true);
    expect(second?.signal.aborted).toBe(false);
    const { state } = reading();
    expect(state.phase === "ready" && state.kitchen.kitchen.name).toBe(
      "From the second",
    );
  });

  it("tells the staff frame the session ended once, and navigates nowhere, on a 401", async () => {
    server.script(() => UNAUTHENTICATED_ANSWER);

    mount(STAFF_KITCHEN_ID, strictly);
    await settle();

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: false });
    expect(assigned).toEqual([]);
    server.script(() => ({ body: kitchenWire(STAFF_KITCHEN_ID, "Once") }));
    const asked = server.requests.length;
    act(() => {
      resolveStaffSessionExpired();
    });
    await settle();
    expect(server.requests.length - asked).toBe(1);
  });

  it("is ready from the one answer that counts when the server answers at once", async () => {
    server.script(() => ({ body: kitchenWire(STAFF_KITCHEN_ID, "Once") }));

    mount(STAFF_KITCHEN_ID, strictly);
    await settle();

    expect(readyKitchenId()).toBe(STAFF_KITCHEN_ID);
    expect(server.requests.length).toBeLessThanOrEqual(2);
  });
});

describe("what a status and a body make of an answer", () => {
  const OK_KITCHEN = (): ServerAnswer => ({
    body: kitchenWire(STAFF_KITCHEN_ID, "Casa"),
  });

  it.each([
    ["a 200 with no body", { status: 200 }],
    ["a 200 whose body is null", { body: null }],
    ["a 200 whose body is a list", { body: [] }],
    ["a 200 whose body is a number", { body: 4 }],
    ["a 204", { status: 204 }],
    ["a 401 with no word", { status: 401 }],
    ["a 401 with another word", { status: 401, body: { status: "forbidden" } }],
    [
      "a 401 in the word of a refusal of the kitchen",
      { status: 401, body: { error: "x" } },
    ],
    ["a 403 with no word", { status: 403 }],
    [
      "a 403 with the word of a 401",
      { status: 403, body: { status: "unauthenticated" } },
    ],
    ["a 404 with no body", { status: 404 }],
    ["a 404 whose error is not text", { status: 404, body: { error: 4 } }],
    [
      "a 404 with the error nested",
      { status: 404, body: { x: { error: "gone" } } },
    ],
    ["a 429 with no word", { status: 429, headers: { "retry-after": "5" } }],
    [
      "a 429 with the wrong word",
      { status: 429, body: { status: "unavailable" } },
    ],
    ["a 503 with no word", { status: 503 }],
    [
      "a 503 with the word of a 429",
      { status: 503, body: { status: "rate-limited" } },
    ],
    ["a 400", { status: 400, body: { status: "invalid-input" } }],
    ["a 405", { status: 405 }],
    ["a 410", { status: 410, body: { error: "gone" } }],
    ["a 500", { status: 500, body: { status: "unavailable" } }],
    ["a 502", { status: 502 }],
    ["a 504", { status: 504 }],
  ] satisfies [string, ServerAnswer][])(
    "is a failed request, with no sign-out, no refusal and no wait, for %s",
    async (_, answer) => {
      server.script(() => answer);

      mount();
      await settle();

      expect(reading().state).toEqual({
        phase: "failed",
        failure: { kind: "failed" },
      });
      expect(assigned).toEqual([]);
    },
  );

  it("is a refusal of one kitchen on a 404 with an error text, and nothing of the text is kept", async () => {
    server.script(() => ({
      status: 404,
      body: { error: "Design owned by someone@else.md" },
    }));

    mount();
    await settle();

    expect(reading().state).toEqual({ phase: "not-found" });
  });

  it("is the same on the first draw as on a retry, for the same answer", async () => {
    server.script(() => UNAVAILABLE_ANSWER);
    mount();
    await settle();
    const first = reading().state;
    server.script(() => UNAVAILABLE_ANSWER);

    act(() => {
      reading().retry();
    });
    await settle();

    expect(reading().state).toEqual(first);
  });

  it("recovers from every failure on a retry that is answered with the kitchen", async () => {
    for (const failure of [
      UNAVAILABLE_ANSWER,
      RATE_LIMITED_ANSWER(1),
      { status: 500 },
    ] satisfies ServerAnswer[]) {
      server.script(() => failure);
      mount();
      await settle();
      server.script(OK_KITCHEN);

      act(() => {
        reading().retry();
      });
      await settle();

      expect(reading().state.phase).toBe("ready");
      hook?.unmount();
      hook = undefined;
    }
  });

  it("is offline after a connection that failed, and ready after a retry that gets through", async () => {
    server.script(() => "offline");
    mount();
    await settle();
    expect(reading().state).toEqual({
      phase: "failed",
      failure: { kind: "offline" },
    });
    server.script(OK_KITCHEN);

    act(() => {
      reading().retry();
    });
    await settle();

    expect(reading().state.phase).toBe("ready");
  });
});

describe("the wait of a 429", () => {
  const NOT_TOLD = { kind: "unreadable" };

  it.each([
    ["1", { kind: "countdown", endsAtMs: Date.parse(NOW) + 1 * MS_PER_SECOND }],
    [
      "599",
      { kind: "countdown", endsAtMs: Date.parse(NOW) + 599 * MS_PER_SECOND },
    ],
    [
      "600",
      {
        kind: "minutes",
        minutes: 10,
        endsAtMs: Date.parse(NOW) + 10 * 60 * MS_PER_SECOND,
      },
    ],
    [
      "601",
      {
        kind: "minutes",
        minutes: 11,
        endsAtMs: Date.parse(NOW) + 11 * 60 * MS_PER_SECOND,
      },
    ],
    [
      "3600",
      {
        kind: "minutes",
        minutes: 60,
        endsAtMs: Date.parse(NOW) + 60 * 60 * MS_PER_SECOND,
      },
    ],
    ["90000", undefined],
    ["0", NOT_TOLD],
    ["-1", NOT_TOLD],
    ["1.5", NOT_TOLD],
    ["1e2", NOT_TOLD],
    ["0x10", NOT_TOLD],
    ["+30", NOT_TOLD],
    [" 30", NOT_TOLD],
    ["30 ", NOT_TOLD],
    ["30\n", NOT_TOLD],
    ["", NOT_TOLD],
    ["abc", NOT_TOLD],
    ["Wed, 21 Oct 2026 12:00:30 GMT", NOT_TOLD],
    ["90001", NOT_TOLD],
    ["1000000", NOT_TOLD],
    ["99999999999999999999", NOT_TOLD],
    ["\u0663\u0660", NOT_TOLD],
    ["NaN", NOT_TOLD],
    ["Infinity", NOT_TOLD],
  ] satisfies [string, Record<string, unknown> | undefined][])(
    "Retry-After %j is told as %j",
    async (header, expected) => {
      server.script(() => ({
        status: 429,
        body: { status: "rate-limited" },
        headers: { "retry-after": header },
      }));

      mount();
      await settle();

      const { state } = reading();
      expect(state.phase).toBe("failed");
      const notice =
        state.phase === "failed" && state.failure.kind === "rate-limited"
          ? state.failure.notice
          : undefined;
      if (expected === undefined) {
        expect(notice?.kind).toBe("at");
      } else {
        expect(notice).toEqual(expected);
      }
    },
  );

  it("is told as unreadable when the header is missing", async () => {
    server.script(() => ({ status: 429, body: { status: "rate-limited" } }));

    mount();
    await settle();

    expect(reading().state).toEqual({
      phase: "failed",
      failure: { kind: "rate-limited", notice: { kind: "unreadable" } },
    });
  });

  it("sends nothing when the wait ends: not at the end, not a day after", async () => {
    server.script(() => RATE_LIMITED_ANSWER(30));
    mount();
    await settle();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31 * MS_PER_SECOND);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(48 * 60 * 60 * MS_PER_SECOND);
    });

    expect(server.requests).toHaveLength(1);
  });
});

describe("what a client typed is not kept anywhere and not said anywhere", () => {
  const SENTINEL = "SENTINEL-CLIENT-DATA-3f9a";

  it("writes nothing to storage, to a cookie or to a console, for any answer", async () => {
    const consoleCalls = CONSOLE_METHODS.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const stored = vi.spyOn(Storage.prototype, "setItem");
    const cookieWrites = vi.spyOn(document, "cookie", "set");
    const body = wireKitchen({
      kitchen: { name: SENTINEL },
      client: { email: `${SENTINEL}@x.md`, name: SENTINEL, phone: SENTINEL },
      request: { reference: SENTINEL, sentAt: "2026-10-17T11:08:00.000Z" },
    });
    const answers: ServerAnswer[] = [
      { body },
      { body: { ...body, kitchen: { id: 4 }, client: SENTINEL } },
      { status: 500, body: { error: SENTINEL } },
      { status: 404, body: { error: SENTINEL } },
      UNAVAILABLE_ANSWER,
      RATE_LIMITED_ANSWER(5),
    ];

    for (const answer of answers) {
      server.script(() => answer);
      mount();
      await settle();
      hook?.unmount();
      hook = undefined;
    }

    expect(stored).not.toHaveBeenCalled();
    expect(cookieWrites).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    for (const call of consoleCalls) expect(call).not.toHaveBeenCalled();
  });

  it("asks with GET only, with no body, no credentials override, and no referrer, on a retry as on the first draw", async () => {
    server.script(() => UNAVAILABLE_ANSWER);
    mount();
    await settle();
    act(() => {
      reading().retry();
    });
    await settle();

    expect(server.requests).toHaveLength(2);
    for (const request of server.requests) {
      expect(request.init.method).toBe("GET");
      expect(request.init.body).toBeUndefined();
      expect(request.init.referrerPolicy).toBe("no-referrer");
      expect(request.url.search).toBe("");
      expect(request.url.hash).toBe("");
    }
  });
});
