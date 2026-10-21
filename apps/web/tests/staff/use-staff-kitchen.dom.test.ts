// @vitest-environment happy-dom
//
// The staff kitchen asks for one kitchen when the page opens, once, with no referrer, and never asks again on its own: a
// `429` or `503` waits for the person, a newer request aborts the one before it, and an answer that is not the newest one's
// is dropped. What comes back is read member by member: a document this build cannot read is `null` and not a failure, and
// a status it does not name is `unrecognised`. The server is a stand-in for `fetch`.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
  resolveStaffSessionExpired,
} from "@/staff/staff-session-expiry";

import {
  staffKitchenFrom,
  useStaffKitchen,
  type StaffKitchenReading,
} from "@/staff/use-staff-kitchen";

import { renderHook, type RenderedHook } from "../support/render-hook";
import {
  STAFF_KITCHEN_ID,
  WIRE_DESIGN,
  wireChangedStatus,
  wireDraftKitchen,
  wireKitchen,
} from "../support/staff-kitchen-wire";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  installStaffKitchensServer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

const REFUSAL_OF_ONE_KITCHEN = {
  status: 404,
  body: { error: "Design not found" },
} as const;

let server: StaffKitchensServer;
let hook: RenderedHook<StaffKitchenReading> | undefined;
let assigned: string[];

beforeEach(() => {
  vi.useFakeTimers();
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

async function pass(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
  await settle();
}

async function mount(id: string = STAFF_KITCHEN_ID): Promise<void> {
  hook = renderHook(() => useStaffKitchen(id));
  await settle();
}

function current(): StaffKitchenReading {
  if (hook === undefined) throw new Error("nothing is mounted");
  return hook.result.current;
}

function readyKitchen() {
  const { state } = current();
  if (state.phase !== "ready") throw new Error(`state was ${state.phase}`);
  return state.kitchen;
}

describe("the first draw", () => {
  it("asks once for this kitchen, by GET, and sends no referrer", async () => {
    server.script(() => ({ body: wireKitchen() }));

    await mount();

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.url.pathname).toBe(
      `/api/staff/kitchens/${STAFF_KITCHEN_ID}`,
    );
    expect(server.requests[0]?.url.search).toBe("");
    expect(server.requests[0]?.init.method).toBe("GET");
    expect(server.requests[0]?.init.referrerPolicy).toBe("no-referrer");
    expect(readyKitchen().kitchen.id).toBe(STAFF_KITCHEN_ID);
  });

  it("is loading until the kitchen is answered", async () => {
    server.script(() => "hold");

    await mount();

    expect(current().state).toEqual({ phase: "loading" });
  });
});

describe("what the answers of the route become", () => {
  it("is the one refusal for a kitchen that is missing or not the person's to open", async () => {
    server.script(() => REFUSAL_OF_ONE_KITCHEN);

    await mount();

    expect(current().state).toEqual({ phase: "not-found" });
  });

  it("is a failed request, not a refusal, for a 404 that is the platform's page", async () => {
    server.script(() => ({ status: 404 }));

    await mount();

    expect(current().state).toEqual({
      phase: "failed",
      failure: { kind: "failed" },
    });
  });

  it("tells the staff frame the session ended on a 401, and leaves the page where it was: no navigation, still loading", async () => {
    server.script(() => UNAUTHENTICATED_ANSWER);

    await mount();

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: false });
    expect(assigned).toEqual([]);
    expect(current().state).toEqual({ phase: "loading" });
  });

  it("asks for the kitchen once more, and shows it, when the person has signed in again", async () => {
    server.script(() => UNAUTHENTICATED_ANSWER);
    await mount();
    server.script(() => ({ body: wireKitchen() }));

    act(() => {
      resolveStaffSessionExpired();
    });
    await settle();

    expect(server.requests).toHaveLength(2);
    expect(current().state.phase).toBe("ready");
    expect(getStaffSessionExpiry()).toBeUndefined();
  });

  it("is forbidden on a 403, which is never an expired session", async () => {
    server.script(() => FORBIDDEN_ANSWER);

    await mount();

    expect(current().state).toEqual({ phase: "forbidden" });
    expect(assigned).toEqual([]);
  });

  it("is the service being unavailable on a 503", async () => {
    server.script(() => UNAVAILABLE_ANSWER);

    await mount();

    expect(current().state).toEqual({
      phase: "failed",
      failure: { kind: "unavailable" },
    });
  });

  it("is a limit with the wait told once on a 429", async () => {
    vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
    server.script(() => RATE_LIMITED_ANSWER(30));

    await mount();

    expect(current().state).toEqual({
      phase: "failed",
      failure: {
        kind: "rate-limited",
        notice: {
          kind: "countdown",
          endsAtMs: Date.parse("2026-10-21T12:00:30.000Z"),
        },
      },
    });
  });

  it("is offline when the request never reached a server", async () => {
    server.script(() => "offline");

    await mount();

    expect(current().state).toEqual({
      phase: "failed",
      failure: { kind: "offline" },
    });
  });

  it.each([
    ["a body that is not JSON", undefined],
    ["a body that is not an object", "kitchen"],
    [
      "a sent kitchen with no sent day",
      wireKitchen({ kitchen: { sentAt: null } }),
    ],
    [
      "a draft that has a request",
      wireKitchen({ kitchen: { isSent: false, sentAt: null, asSent: null } }),
    ],
    [
      "a day that does not exist",
      wireKitchen({ kitchen: { updatedAt: "2026-02-30T00:00:00.000Z" } }),
    ],
    ["a kitchen with no id", wireKitchen({ kitchen: { id: undefined } })],
    [
      "a kitchen that is another's than the one asked for",
      wireKitchen({ kitchen: { id: "o".repeat(21) } }),
    ],
    [
      "a kitchen id that is not a design id",
      wireKitchen({ kitchen: { id: "x" } }),
    ],
  ])("is a failed request for %s", async (_, body) => {
    server.script(() => ({ body }));

    await mount();

    expect(current().state).toEqual({
      phase: "failed",
      failure: { kind: "failed" },
    });
  });
});

describe("nothing is asked again on its own", () => {
  it.each([
    ["a 429", () => RATE_LIMITED_ANSWER(1)],
    ["a 503", () => UNAVAILABLE_ANSWER],
    ["an unreadable answer", () => ({ body: { kitchen: 4 } })],
    ["a lost connection", () => "offline" as const],
  ])("after %s, however long the page waits", async (_, answer) => {
    server.script(answer);

    await mount();
    await pass(60 * 60 * 1000);

    expect(server.requests).toHaveLength(1);
  });

  it("asks again when the person presses retry, and shows loading in between", async () => {
    server.script(() => UNAVAILABLE_ANSWER);
    await mount();
    server.script(() => "hold");

    act(() => {
      current().retry();
    });
    await settle();

    expect(server.requests).toHaveLength(2);
    expect(current().state).toEqual({ phase: "loading" });
  });

  it("aborts the request in flight when the page is left, and draws nothing from its late answer", async () => {
    server.script(() => "hold");
    server.honoursAbort = false;
    await mount();
    const held = server.held[0];

    hook?.unmount();
    hook = undefined;
    held?.answer({ body: wireKitchen() });
    await settle();

    expect(held?.signal.aborted).toBe(true);
  });

  it("drops the answer of a request that a newer one replaced", async () => {
    server.script(() => "hold");
    server.honoursAbort = false;
    await mount();
    act(() => {
      current().retry();
    });
    await settle();
    const [first, second] = server.held;

    second?.answer({ body: wireKitchen({ kitchen: { name: "Newest" } }) });
    await settle();
    first?.answer({ body: wireKitchen({ kitchen: { name: "Stale" } }) });
    await settle();

    expect(first?.signal.aborted).toBe(true);
    expect(readyKitchen().kitchen.name).toBe("Newest");
  });
});

describe("the kitchen as it is read", () => {
  it("carries the document as sent, the current one, the client, the request and the status", () => {
    const kitchen = staffKitchenFrom(
      wireKitchen({
        status: wireChangedStatus("contacted"),
        notes: [
          {
            id: "n1",
            text: "Am sunat.",
            createdAt: "2026-10-18T11:20:00.000Z",
            author: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
          },
        ],
        notesTruncated: true,
      }),
    );

    expect(kitchen?.kitchen.design).toEqual(WIRE_DESIGN);
    expect(kitchen?.kitchen.asSent).toEqual(WIRE_DESIGN);
    expect(kitchen?.client).toEqual({
      email: "ana.popescu@mail.md",
      name: "Ana Popescu",
      phone: "078900555",
    });
    expect(kitchen?.request).toEqual({
      reference: "LEM-2026-0417",
      sentAt: "2026-10-17T11:08:00.000Z",
    });
    expect(kitchen?.status).toEqual({
      value: "contacted",
      changedBy: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
      changedAt: "2026-10-18T11:22:00.000Z",
    });
    expect(kitchen?.notes.map(({ text }) => text)).toEqual(["Am sunat."]);
    expect(kitchen?.notesTruncated).toBe(true);
  });

  it("reads a status this build does not name as unrecognised, never as one it does", () => {
    const kitchen = staffKitchenFrom(
      wireKitchen({ status: wireChangedStatus("rejected-by-a-future-build") }),
    );

    expect(kitchen?.status?.value).toBe("unrecognised");
  });

  it.each(["new", "contacted", "offer-sent", "closed"])(
    "keeps the status %s as it was named",
    (word) => {
      const kitchen = staffKitchenFrom(
        wireKitchen({ status: wireChangedStatus(word) }),
      );

      expect(kitchen?.status?.value).toBe(word);
    },
  );

  it("reads a document it cannot read as nothing, and keeps the rest of the kitchen", () => {
    const kitchen = staffKitchenFrom(
      wireKitchen({ kitchen: { design: { room: "not a room" } } }),
    );

    expect(kitchen?.kitchen.design).toBeNull();
    expect(kitchen?.kitchen.asSent).toEqual(WIRE_DESIGN);
    expect(kitchen?.client?.email).toBe("ana.popescu@mail.md");
    expect(kitchen?.request?.reference).toBe("LEM-2026-0417");
  });

  it("reads an as-sent copy it cannot read as nothing, not as the current document", () => {
    const kitchen = staffKitchenFrom(
      wireKitchen({ kitchen: { asSent: { placements: 4 } } }),
    );

    expect(kitchen?.kitchen.asSent).toBeNull();
    expect(kitchen?.kitchen.design).toEqual(WIRE_DESIGN);
  });

  it("reads a kitchen with no account, no request and no status", () => {
    const kitchen = staffKitchenFrom(wireDraftKitchen({ client: null }));

    expect(kitchen?.client).toBeNull();
    expect(kitchen?.request).toBeNull();
    expect(kitchen?.status).toBeNull();
  });

  it("keeps a person whose account no longer resolves as a person with nothing to name them by", () => {
    const kitchen = staffKitchenFrom(
      wireKitchen({
        status: wireChangedStatus("closed", { email: null, name: null }),
      }),
    );

    expect(kitchen?.status?.changedBy).toEqual({ email: null, name: null });
  });

  it("keeps a status nobody ever changed, with no last change", () => {
    const kitchen = staffKitchenFrom(wireKitchen());

    expect(kitchen?.status).toEqual({
      value: "new",
      changedBy: null,
      changedAt: null,
    });
  });

  it.each([
    [
      "a client with no e-mail",
      { client: { email: 4, name: null, phone: null } },
    ],
    [
      "a request with no reference",
      { request: { reference: "", sentAt: "2026-10-17T11:08:00.000Z" } },
    ],
    [
      "a request dated nothing",
      { request: { reference: "L", sentAt: "soon" } },
    ],
    ["a status that is not an object", { status: "new" }],
    [
      "a status with no word",
      { status: { value: 4, changedBy: null, changedAt: null } },
    ],
    [
      "a status changed at nothing",
      { status: { value: "new", changedBy: null, changedAt: "soon" } },
    ],
    ["notes that are not a list", { notes: "none" }],
    [
      "a note with no text",
      {
        notes: [
          {
            id: "n",
            text: 4,
            createdAt: "2026-10-18T11:20:00.000Z",
            author: { email: null, name: null },
          },
        ],
      },
    ],
    [
      "a note with no author",
      {
        notes: [{ id: "n", text: "x", createdAt: "2026-10-18T11:20:00.000Z" }],
      },
    ],
    ["no truncation flag", { notesTruncated: undefined }],
  ])("refuses a body with %s", (_, overrides) => {
    expect(staffKitchenFrom(wireKitchen(overrides))).toBeUndefined();
  });

  it("reads only what the body's own objects hold, never what they inherit", () => {
    const inherited = Object.create({
      kitchen: wireKitchen().kitchen,
      client: null,
      request: null,
      status: null,
      notes: [],
      notesTruncated: false,
    }) as unknown;

    expect(staffKitchenFrom(inherited)).toBeUndefined();
  });
});

describe("a change of the kitchen asked for", () => {
  const OTHER_ID = "o".repeat(21);

  async function mountChangingId(): Promise<{ setId: (id: string) => void }> {
    let id = STAFF_KITCHEN_ID;
    hook = renderHook(() => useStaffKitchen(id));
    await settle();
    return {
      setId: (next) => {
        id = next;
        hook?.rerender();
      },
    };
  }

  it("is loading again at once, and never shows the first kitchen under the second id", async () => {
    server.script((request) =>
      request.url.pathname.endsWith(OTHER_ID)
        ? "hold"
        : { body: wireKitchen() },
    );
    const page = await mountChangingId();
    expect(current().state.phase).toBe("ready");

    page.setId(OTHER_ID);

    expect(current().state).toEqual({ phase: "loading" });
    await settle();
    expect(current().state).toEqual({ phase: "loading" });
    expect(server.requests.map(({ url }) => url.pathname)).toEqual([
      `/api/staff/kitchens/${STAFF_KITCHEN_ID}`,
      `/api/staff/kitchens/${OTHER_ID}`,
    ]);
  });

  it("drops the late answer of the first kitchen after the second was asked for", async () => {
    server.script(() => "hold");
    server.honoursAbort = false;
    const page = await mountChangingId();
    page.setId(OTHER_ID);
    await settle();
    const [first, second] = server.held;

    second?.answer({
      body: wireKitchen({ kitchen: { id: OTHER_ID, name: "Second" } }),
    });
    await settle();
    first?.answer({ body: wireKitchen({ kitchen: { name: "First" } }) });
    await settle();

    expect(readyKitchen().kitchen.name).toBe("Second");
  });
});
