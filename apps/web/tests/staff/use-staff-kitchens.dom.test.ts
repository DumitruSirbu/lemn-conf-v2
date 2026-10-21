// @vitest-environment happy-dom
//
// The staff list asks for what the person's filters say, once, and never asks again on its own. The search waits for a
// pause in the typing (500 ms) or for Enter; a newer request aborts the one before it and an answer that is not the newest
// one's is dropped; a segment other than "Trimise" never carries a status; a `429` or `503` waits for the person; and
// nothing the person typed leaves the hook but in the request's own query. The server is a stand-in for `fetch`.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SEARCH_SETTLE_DELAY_MS,
  useStaffKitchens,
  type StaffKitchens,
} from "@/staff/use-staff-kitchens";

import { renderHook, type RenderedHook } from "../support/render-hook";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  STAFF_KITCHENS_PAGE_SIZE,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  installStaffKitchensServer,
  rowsOfPage,
  staffKitchenIdOf,
  wireList,
  wireRow,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

let server: StaffKitchensServer;
let hook: RenderedHook<StaffKitchens> | undefined;
let assigned: string[];

beforeEach(() => {
  vi.useFakeTimers();
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

/** Lets the requests that were made be answered and their results drawn. */
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

async function mount(): Promise<StaffKitchens> {
  hook = renderHook(() => useStaffKitchens("ro"));
  await settle();
  return current();
}

function current(): StaffKitchens {
  if (hook === undefined) throw new Error("nothing is mounted");
  return hook.result.current;
}

function readyListing() {
  const { state } = current();
  if (state.phase !== "ready") throw new Error(`state was ${state.phase}`);
  return state.listing;
}

function type(text: string): void {
  act(() => {
    current().typeSearch(text);
  });
}

/** The query of request `index` as the server reads it. */
function queryOf(index: number): Record<string, string> {
  const request = server.requests[index];
  if (request === undefined) throw new Error(`no request ${String(index)}`);
  return Object.fromEntries(request.url.searchParams);
}

describe("the first draw", () => {
  it("asks once for the first page of Trimise, with no search and no status, and sends no referrer", async () => {
    server.script(() => ({ body: wireList(rowsOfPage(1, 3), { total: 3 }) }));

    await mount();

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.url.pathname).toBe("/api/staff/kitchens");
    expect(queryOf(0)).toEqual({ segment: "sent", page: "1" });
    expect(server.requests[0]?.init.method).toBe("GET");
    expect(server.requests[0]?.init.referrerPolicy).toBe("no-referrer");
    expect(readyListing().rows.map(({ id }) => id)).toEqual([
      staffKitchenIdOf(1),
      staffKitchenIdOf(2),
      staffKitchenIdOf(3),
    ]);
  });

  it("is loading until the page is answered", async () => {
    server.script(() => "hold");

    await mount();

    expect(current().state).toEqual({ phase: "loading" });
  });
});

describe("the search waits for a pause in the typing", () => {
  beforeEach(async () => {
    await mount();
    server.requests.length = 0;
  });

  it("sends nothing 499 ms after the last keystroke", async () => {
    type("ana");

    await pass(SEARCH_SETTLE_DELAY_MS - 1);

    expect(server.requests).toHaveLength(0);
  });

  it("sends one request, with the search, 500 ms after the last keystroke", async () => {
    type("ana");

    await pass(SEARCH_SETTLE_DELAY_MS);

    expect(server.requests).toHaveLength(1);
    expect(queryOf(0)).toEqual({ segment: "sent", q: "ana", page: "1" });
  });

  it("is one request for a burst of keystrokes, each inside the pause of the one before", async () => {
    for (const text of ["a", "an", "ana", "ana ", "ana p"]) {
      type(text);
      await pass(SEARCH_SETTLE_DELAY_MS - 100);
    }
    expect(server.requests).toHaveLength(0);

    await pass(100);

    expect(server.requests).toHaveLength(1);
    expect(queryOf(0).q).toBe("ana p");
  });

  it("sends at once on Enter, and the pause that was running sends nothing more", async () => {
    type("ana");
    await pass(200);

    act(() => {
      current().submitSearch();
    });
    await settle();
    await pass(SEARCH_SETTLE_DELAY_MS * 2);

    expect(server.requests).toHaveLength(1);
    expect(queryOf(0).q).toBe("ana");
  });

  it("sends the search trimmed, and nothing for a search that trims to the one already asked for", async () => {
    type("  ana  ");
    await pass(SEARCH_SETTLE_DELAY_MS);
    type("ana");
    await pass(SEARCH_SETTLE_DELAY_MS);

    expect(server.searches()).toEqual(["ana"]);
  });

  it("sends nothing when the box is emptied of a search that was never asked for", async () => {
    type("ana");
    type("");

    await pass(SEARCH_SETTLE_DELAY_MS);

    expect(server.requests).toHaveLength(0);
  });

  it("drops the search when the box is cleared, at once", async () => {
    type("ana");
    await pass(SEARCH_SETTLE_DELAY_MS);

    act(() => {
      current().clearSearch();
    });
    await settle();

    expect(server.searches()).toEqual(["ana", null]);
    expect(current().filters.searchText).toBe("");
  });

  it("goes back to the first page when the search changes", async () => {
    act(() => {
      current().goToPage(3);
    });
    await settle();

    type("ana");
    await pass(SEARCH_SETTLE_DELAY_MS);

    expect(queryOf(1)).toEqual({ segment: "sent", q: "ana", page: "1" });
  });
});

describe("a newer request replaces the one before it", () => {
  it("aborts the request that is out, and does not draw its answer when it arrives late", async () => {
    server.honoursAbort = false;
    server.script(() => "hold");
    await mount();
    const first = server.held[0];

    type("ana");
    await pass(SEARCH_SETTLE_DELAY_MS);
    const second = server.held[1];

    expect(first?.signal.aborted).toBe(true);
    expect(second?.signal.aborted).toBe(false);
    first?.answer({ body: wireList([wireRow(1)], { total: 1 }) });
    await settle();
    expect(current().state).toEqual({ phase: "loading" });
    second?.answer({ body: wireList([wireRow(2)], { total: 1 }) });
    await settle();
    expect(readyListing().rows.map(({ id }) => id)).toEqual([
      staffKitchenIdOf(2),
    ]);
  });

  it("does not draw an older answer that arrives after the newer one, though the abort came too late to stop it", async () => {
    server.honoursAbort = false;
    server.script(() => "hold");
    await mount();
    act(() => {
      current().chooseSegment("drafts");
    });
    await settle();
    const [older, newer] = server.held;

    newer?.answer({ body: wireList([wireRow(2)], { total: 1 }) });
    await settle();
    older?.answer({ body: wireList([wireRow(1)], { total: 1 }) });
    await settle();

    expect(readyListing().rows.map(({ id }) => id)).toEqual([
      staffKitchenIdOf(2),
    ]);
  });

  it("aborts the request that is out and stops the pause when the screen goes away", async () => {
    server.script(() => "hold");
    await mount();
    type("ana");

    hook?.unmount();
    hook = undefined;
    await pass(SEARCH_SETTLE_DELAY_MS * 2);

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.signal.aborted).toBe(true);
  });
});

describe("the segment and the status", () => {
  beforeEach(async () => {
    await mount();
    server.requests.length = 0;
  });

  it("asks for the status chosen under Trimise", async () => {
    act(() => {
      current().chooseStatus("contacted");
    });
    await settle();

    expect(queryOf(0)).toEqual({
      segment: "sent",
      status: "contacted",
      page: "1",
    });
  });

  it("drops the status when the segment changes, in the request and in the filters", async () => {
    act(() => {
      current().chooseStatus("offer-sent");
    });
    await settle();

    act(() => {
      current().chooseSegment("drafts");
    });
    await settle();

    expect(queryOf(1)).toEqual({ segment: "drafts", page: "1" });
    expect(current().filters).toEqual({
      segment: "drafts",
      status: null,
      searchText: "",
    });
  });

  it("does not bring the status back when the segment returns to Trimise", async () => {
    act(() => {
      current().chooseStatus("closed");
    });
    act(() => {
      current().chooseSegment("all");
    });
    act(() => {
      current().chooseSegment("sent");
    });
    await settle();

    expect(queryOf(server.requests.length - 1)).toEqual({
      segment: "sent",
      page: "1",
    });
  });

  it("asks for no status outside Trimise, whatever is chosen", async () => {
    act(() => {
      current().chooseSegment("drafts");
    });
    await settle();
    server.requests.length = 0;

    act(() => {
      current().chooseStatus("new");
    });
    await settle();

    expect(server.requests).toHaveLength(0);
    expect(current().filters.status).toBeNull();
  });

  it("keeps the search the person typed when the segment changes, and asks for it at once", async () => {
    type("ana");

    act(() => {
      current().chooseSegment("all");
    });
    await settle();
    await pass(SEARCH_SETTLE_DELAY_MS * 2);

    expect(server.requests).toHaveLength(1);
    expect(queryOf(0)).toEqual({ segment: "all", q: "ana", page: "1" });
  });

  it("asks nothing when the segment chosen is the one shown", async () => {
    act(() => {
      current().chooseSegment("sent");
    });
    await settle();

    expect(server.requests).toHaveLength(0);
  });
});

describe("a search the server would refuse is not sent", () => {
  beforeEach(async () => {
    await mount();
    server.requests.length = 0;
  });

  it("names a search of more than 100 code points as too long, and sends nothing", async () => {
    type("a".repeat(101));

    await pass(SEARCH_SETTLE_DELAY_MS);

    expect(server.requests).toHaveLength(0);
    expect(current().searchProblem).toBe("too-long");
  });

  it("counts code points, not UTF-16 units: 100 letters outside the basic plane are allowed", async () => {
    type("\u{1D7D8}".repeat(100));

    await pass(SEARCH_SETTLE_DELAY_MS);

    expect(current().searchProblem).toBeUndefined();
    expect(server.requests).toHaveLength(1);
  });

  it("names a search holding a control character as refused", async () => {
    type("ana\u0007");

    await pass(SEARCH_SETTLE_DELAY_MS);

    expect(server.requests).toHaveLength(0);
    expect(current().searchProblem).toBe("refused");
  });

  it("withdraws the message once the search is askable again", async () => {
    type("a".repeat(101));
    await pass(SEARCH_SETTLE_DELAY_MS);

    type("ana");
    await pass(SEARCH_SETTLE_DELAY_MS);

    expect(current().searchProblem).toBeUndefined();
    expect(server.searches()).toEqual(["ana"]);
  });
});

describe("a page that cannot be had waits for the person", () => {
  it.each([
    ["a 429", RATE_LIMITED_ANSWER(90)],
    ["a 503", UNAVAILABLE_ANSWER],
  ])(
    "asks nothing more after %s, however long it waits",
    async (_label, answer) => {
      server.script(() => answer);
      await mount();

      await pass(30 * 60 * 1000);

      expect(server.requests).toHaveLength(1);
      expect(current().state.phase).toBe("failed");
    },
  );

  it("asks nothing more after an answer with no connection, however long it waits", async () => {
    server.script(() => "offline");
    await mount();

    await pass(30 * 60 * 1000);

    expect(server.requests).toHaveLength(1);
    expect(current().state).toEqual({
      phase: "failed",
      failure: { kind: "offline" },
    });
  });

  it("tells a 429 with the wait the answer states, once", async () => {
    server.script(() => RATE_LIMITED_ANSWER(90));
    await mount();

    const { state } = current();

    expect(state.phase).toBe("failed");
    if (state.phase !== "failed") return;
    expect(state.failure.kind).toBe("rate-limited");
    if (state.failure.kind !== "rate-limited") return;
    expect(state.failure.notice.kind).toBe("countdown");
  });

  it("tells a 503 as the service not being there", async () => {
    server.script(() => UNAVAILABLE_ANSWER);
    await mount();

    expect(current().state).toEqual({
      phase: "failed",
      failure: { kind: "unavailable" },
    });
  });

  it("asks again, once, when the person presses retry, for the same query", async () => {
    server.script(() => UNAVAILABLE_ANSWER);
    await mount();
    act(() => {
      current().chooseStatus("closed");
    });
    await settle();
    server.requests.length = 0;
    server.script(() => ({ body: wireList([wireRow(1)], { total: 1 }) }));

    act(() => {
      current().retry();
    });
    await settle();

    expect(server.requests).toHaveLength(1);
    expect(queryOf(0)).toEqual({
      segment: "sent",
      status: "closed",
      page: "1",
    });
    expect(current().state.phase).toBe("ready");
  });

  it("leaves a request made during a 429 to the person: a filter chosen then is asked for", async () => {
    server.script(() => RATE_LIMITED_ANSWER(60));
    await mount();

    act(() => {
      current().chooseSegment("drafts");
    });
    await settle();

    expect(server.requests).toHaveLength(2);
  });
});

describe("the session", () => {
  it("sends a 401 to the login page as an expired session, and draws nothing", async () => {
    server.script(() => UNAUTHENTICATED_ANSWER);

    await mount();

    expect(assigned).toEqual(["/ro/account/login?reason=session-expired"]);
    expect(current().state).toEqual({ phase: "loading" });
  });

  it("tells a 403 as the forbidden screen, never as an expired session", async () => {
    server.script(() => FORBIDDEN_ANSWER);

    await mount();

    expect(current().state).toEqual({ phase: "forbidden" });
    expect(assigned).toEqual([]);
  });
});

describe("pages", () => {
  beforeEach(async () => {
    server.script(({ url }) => {
      const page = Number(url.searchParams.get("page"));
      return {
        body: wireList(rowsOfPage(page, STAFF_KITCHENS_PAGE_SIZE), {
          total: 50,
          page,
        }),
      };
    });
    await mount();
    server.requests.length = 0;
  });

  it("replaces the rows with the page chosen", async () => {
    act(() => {
      current().goToPage(3);
    });
    await settle();

    const listing = readyListing();
    expect(queryOf(0).page).toBe("3");
    expect(listing.firstPage).toBe(3);
    expect(listing.lastPage).toBe(3);
    expect(listing.rows[0]?.id).toBe(staffKitchenIdOf(41));
    expect(listing.rows).toHaveLength(STAFF_KITCHENS_PAGE_SIZE);
  });

  it("adds the next page after the rows shown, and puts focus on the first row it added", async () => {
    act(() => {
      current().loadMore();
    });
    await settle();

    const listing = readyListing();
    expect(queryOf(0).page).toBe("2");
    expect(listing.rows).toHaveLength(STAFF_KITCHENS_PAGE_SIZE * 2);
    expect(listing.firstPage).toBe(1);
    expect(listing.lastPage).toBe(2);
    expect(listing.focusRequest).toEqual({ rowId: staffKitchenIdOf(21) });
  });

  it("shows a kitchen that moved between two pages once", async () => {
    server.script(({ url }) => {
      const page = Number(url.searchParams.get("page"));
      return {
        body: wireList(page === 1 ? rowsOfPage(1, 20) : rowsOfPage(1, 3), {
          total: 23,
          page,
        }),
      };
    });
    act(() => {
      current().loadMore();
    });
    await settle();

    const ids = readyListing().rows.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("asks for no page past the last", async () => {
    act(() => {
      current().loadMore();
    });
    await settle();
    act(() => {
      current().loadMore();
    });
    await settle();
    server.requests.length = 0;

    act(() => {
      current().loadMore();
    });
    await settle();

    expect(server.requests).toHaveLength(0);
  });

  it("keeps the rows shown and says why when the next page cannot be had", async () => {
    server.script(() => UNAVAILABLE_ANSWER);

    act(() => {
      current().loadMore();
    });
    await settle();

    const { state } = current();
    expect(state.phase).toBe("ready");
    if (state.phase !== "ready") return;
    expect(state.listing.rows).toHaveLength(STAFF_KITCHENS_PAGE_SIZE);
    expect(state.more).toEqual({
      kind: "failed",
      failure: { kind: "unavailable" },
    });
  });

  it("ignores a second press of load-more while a page is out", async () => {
    server.script(() => "hold");
    act(() => {
      current().loadMore();
    });
    act(() => {
      current().loadMore();
    });
    await settle();

    expect(server.requests).toHaveLength(1);
  });
});

describe("what the answer holds", () => {
  it("tells a status this build does not name as unrecognised, and a draft's as none", async () => {
    server.script(() => ({
      body: wireList(
        [
          wireRow(1, { requestStatus: "rejected-by-future-build" }),
          wireRow(2, { requestStatus: "new" }),
          wireRow(3, { isSent: false, requestStatus: null, sentAt: null }),
        ],
        { total: 3 },
      ),
    }));

    await mount();

    expect(readyListing().rows.map((row) => row.requestStatus)).toEqual([
      "unrecognised",
      "new",
      null,
    ]);
  });

  it("lists a kitchen whose document this build cannot read, with no design", async () => {
    server.script(() => ({
      body: wireList([wireRow(1, { design: { room: "not a room" } })], {
        total: 1,
      }),
    }));

    await mount();

    expect(readyListing().rows[0]?.design).toBeNull();
  });

  it("keeps a sent kitchen no account owns, with no client", async () => {
    server.script(() => ({
      body: wireList([wireRow(1, { client: null })], { total: 1 }),
    }));

    await mount();

    expect(readyListing().rows[0]?.client).toBeNull();
  });

  it.each([
    ["an id that is not a design id", { id: "../x" }],
    ["a name that is not text", { name: 7 }],
    ["a sent flag that is not a boolean", { isSent: "yes" }],
    ["a date that is not a date", { updatedAt: "yesterday" }],
    ["a client with no address", { client: { name: "A", phone: null } }],
    ["a status that is not text", { requestStatus: 3 }],
  ])(
    "tells a page holding %s as a request that failed",
    async (_label, change) => {
      server.script(() => ({
        body: wireList([wireRow(1, change)], { total: 1 }),
      }));

      await mount();

      expect(current().state).toEqual({
        phase: "failed",
        failure: { kind: "failed" },
      });
    },
  );

  it("tells a page whose count is not a count as a request that failed", async () => {
    server.script(() => ({ body: wireList([], { total: -1 }) }));

    await mount();

    expect(current().state.phase).toBe("failed");
  });
});

describe("what the person typed stays on the screen", () => {
  it("writes the search to no storage, no address bar and no log", async () => {
    const stored = [
      vi.spyOn(window.localStorage, "setItem"),
      vi.spyOn(window.sessionStorage, "setItem"),
    ];
    const pushed = vi.spyOn(window.history, "pushState");
    const replaced = vi.spyOn(window.history, "replaceState");
    const logged = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "debug"),
    ];
    server.script(() => ({ body: wireList([wireRow(1)], { total: 1 }) }));
    await mount();

    type("ana.popescu@mail.md");
    await pass(SEARCH_SETTLE_DELAY_MS);
    act(() => {
      current().chooseSegment("drafts");
    });
    await settle();

    expect(server.searches()).toContain("ana.popescu@mail.md");
    for (const store of stored) expect(store).not.toHaveBeenCalled();
    expect(pushed).not.toHaveBeenCalled();
    expect(replaced).not.toHaveBeenCalled();
    for (const log of logged) expect(log).not.toHaveBeenCalled();
  });
});
