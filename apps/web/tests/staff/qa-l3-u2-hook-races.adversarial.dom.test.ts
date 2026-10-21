// @vitest-environment happy-dom
//
// The staff list's hook under interleavings the developer's suite does not make: answers that arrive after the request
// they belong to was replaced (also when the abort came too late to stop them), a search that settles, is cleared or is
// typed back to what was asked while a request is out, a page chosen and then a filter, a list whose total moves between
// pages, a screen that goes away with a request out, and answers that must never be drawn as a page. The server is the
// project's stand-in for `fetch`, which can hold a request and answer it when the test says.
import { StrictMode, act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SEARCH_SETTLE_DELAY_MS,
  useStaffKitchens,
  type StaffKitchens,
} from "@/staff/use-staff-kitchens";

import { renderHook, type RenderedHook } from "../support/render-hook";
import {
  STAFF_KITCHENS_PAGE_SIZE,
  installStaffKitchensServer,
  rowsOfPage,
  staffKitchenIdOf,
  wireList,
  wireRow,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

let server: StaffKitchensServer;
let hook: RenderedHook<StaffKitchens> | undefined;
let assigned: string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
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

async function mount(wrapStrictly = false): Promise<void> {
  hook = renderHook(
    () => useStaffKitchens("ro"),
    wrapStrictly
      ? (children) => createElement(StrictMode, null, children)
      : undefined,
  );
  await settle();
}

function current(): StaffKitchens {
  if (hook === undefined) throw new Error("nothing is mounted");
  return hook.result.current;
}

function listing() {
  const { state } = current();
  if (state.phase !== "ready") throw new Error(`state was ${state.phase}`);
  return state.listing;
}

function idsShown(): string[] {
  return listing().rows.map(({ id }) => id);
}

function type(text: string): void {
  act(() => {
    current().typeSearch(text);
  });
}

function queryOf(index: number): Record<string, string> {
  const request = server.requests[index];
  if (request === undefined) throw new Error(`no request ${String(index)}`);
  return Object.fromEntries(request.url.searchParams);
}

/** A page answered with `serials` as its rows. */
function pageOf(serials: number[], total = serials.length): ServerAnswer {
  return {
    body: wireList(
      serials.map((serial) => wireRow(serial)),
      { total },
    ),
  };
}

function serialsOf(...ids: number[]): string[] {
  return ids.map(staffKitchenIdOf);
}

describe("answers that arrive after their request was replaced", () => {
  beforeEach(() => {
    server.honoursAbort = false;
  });

  it("does not draw the page a segment change replaced while 'load more' was out", async () => {
    server.script(({ url }) =>
      url.searchParams.get("page") === "2" &&
      url.searchParams.get("segment") === "sent"
        ? "hold"
        : {
            body: wireList(rowsOfPage(1, STAFF_KITCHENS_PAGE_SIZE), {
              total: 45,
            }),
          },
    );
    await mount();

    act(() => {
      current().loadMore();
    });
    await settle();
    act(() => {
      current().chooseSegment("drafts");
    });
    await settle();
    const stale = server.held[0];
    stale?.answer(pageOf([901, 902, 903], 3));
    await settle();

    expect(queryOf(2)).toEqual({ segment: "drafts", page: "1" });
    expect(listing().segment).toBe("drafts");
    expect(listing().total).toBe(45);
    expect(idsShown()).not.toContain(staffKitchenIdOf(901));
    expect(listing().lastPage).toBe(1);
  });

  it("keeps the unsearched list when the search was cleared while its own request was out", async () => {
    server.script(({ url }) =>
      url.searchParams.has("q") ? "hold" : pageOf([1, 2, 3]),
    );
    await mount();
    type("ana");
    await pass(SEARCH_SETTLE_DELAY_MS);
    const searchRequest = server.held[0];

    act(() => {
      current().clearSearch();
    });
    await settle();
    searchRequest?.answer(pageOf([77], 1));
    await settle();

    expect(server.searches()).toEqual([null, "ana", null]);
    expect(current().filters.searchText).toBe("");
    expect(listing().search).toBeNull();
    expect(idsShown()).toEqual(serialsOf(1, 2, 3));
  });

  it("keeps the segment chosen after a page was asked for and its answer comes last", async () => {
    server.script(({ url }) =>
      url.searchParams.get("page") === "3" ? "hold" : pageOf([1, 2], 50),
    );
    await mount();

    act(() => {
      current().goToPage(3);
    });
    await settle();
    act(() => {
      current().chooseSegment("drafts");
    });
    await settle();
    server.held[0]?.answer(pageOf([555], 50));
    await settle();

    expect(queryOf(2)).toEqual({ segment: "drafts", page: "1" });
    expect(listing().segment).toBe("drafts");
    expect(listing().firstPage).toBe(1);
    expect(idsShown()).toEqual(serialsOf(1, 2));
  });

  it("asks for the next page of the segment chosen, not of the one the page was chosen under", async () => {
    server.script(() => pageOf([1, 2], 80));
    await mount();
    act(() => {
      current().goToPage(3);
    });
    await settle();
    act(() => {
      current().chooseSegment("all");
    });
    await settle();

    act(() => {
      current().goToPage(2);
    });
    await settle();

    expect(queryOf(3)).toEqual({ segment: "all", page: "2" });
  });

  it("goes back to the first page when the status changes, from a page far down", async () => {
    server.script(() => pageOf([1, 2], 80));
    await mount();
    act(() => {
      current().goToPage(4);
    });
    await settle();

    act(() => {
      current().chooseStatus("closed");
    });
    await settle();

    expect(queryOf(2)).toEqual({
      segment: "sent",
      status: "closed",
      page: "1",
    });
  });

  it("does not leave for the login page, or complain, on a 401 that comes after the screen went away", async () => {
    const complaints = vi.spyOn(console, "error");
    const rejections: unknown[] = [];
    const remember = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", remember);
    server.script(() => "hold");
    await mount();
    const request = server.held[0];

    hook?.unmount();
    hook = undefined;
    request?.answer({
      status: 401,
      body: { status: "unauthenticated" },
    });
    await pass(SEARCH_SETTLE_DELAY_MS * 2);
    process.off("unhandledRejection", remember);

    expect(complaints).not.toHaveBeenCalled();
    expect(rejections).toEqual([]);
    expect(assigned).toEqual([]);
  });

  it("does not leave for the login page on a 401 that answers a request already replaced", async () => {
    server.script(({ url }) =>
      url.searchParams.get("segment") === "sent" ? "hold" : pageOf([1], 1),
    );
    await mount();
    act(() => {
      current().chooseSegment("drafts");
    });
    await settle();

    server.held[0]?.answer({
      status: 401,
      body: { status: "unauthenticated" },
    });
    await settle();

    expect(assigned).toEqual([]);
    expect(current().state.phase).toBe("ready");
  });
});

describe("a search that is typed, settled and typed back", () => {
  beforeEach(async () => {
    server.script(() => pageOf([1], 1));
    await mount();
    server.requests.length = 0;
  });

  it("asks nothing when the text is typed back to what was asked for inside the pause", async () => {
    type("ana");
    await pass(SEARCH_SETTLE_DELAY_MS);
    expect(server.searches()).toEqual(["ana"]);

    type("anax");
    await pass(SEARCH_SETTLE_DELAY_MS - 1);
    type("ana");
    await pass(SEARCH_SETTLE_DELAY_MS * 3);

    expect(server.searches()).toEqual(["ana"]);
  });

  it("asks nothing, and names no problem, for a box holding only spaces", async () => {
    type("   ");
    await pass(SEARCH_SETTLE_DELAY_MS * 2);

    expect(server.requests).toHaveLength(0);
    expect(current().searchProblem).toBeUndefined();
  });

  it("asks twice for two different searches separated by Enter and a second pause, and no more", async () => {
    type("ana");
    act(() => {
      current().submitSearch();
    });
    await settle();
    type("anam");
    await pass(SEARCH_SETTLE_DELAY_MS * 4);

    expect(server.searches()).toEqual(["ana", "anam"]);
  });

  it("asks for a search held in the box only once, however the pause and Enter fall", async () => {
    type("ana");
    await pass(SEARCH_SETTLE_DELAY_MS - 1);
    act(() => {
      current().submitSearch();
    });
    await pass(1);
    await pass(SEARCH_SETTLE_DELAY_MS * 4);

    expect(server.searches()).toEqual(["ana"]);
  });

  it("sends 100 letters followed by spaces, trimmed, and not as too long", async () => {
    const hundred = "a".repeat(100);

    type(`${hundred}     `);
    await pass(SEARCH_SETTLE_DELAY_MS);

    expect(current().searchProblem).toBeUndefined();
    expect(server.searches()).toEqual([hundred]);
  });

  it("counts a decomposed letter as the one it composes to: 100 of them are allowed, 101 are too long", async () => {
    const decomposed = "é";

    type(decomposed.repeat(100));
    await pass(SEARCH_SETTLE_DELAY_MS);
    expect(current().searchProblem).toBeUndefined();
    expect(server.requests).toHaveLength(1);

    type(decomposed.repeat(101));
    await pass(SEARCH_SETTLE_DELAY_MS);
    expect(current().searchProblem).toBe("too-long");
    expect(server.requests).toHaveLength(1);
  });

  it("does not count an invisible format character toward the limit", async () => {
    type(`${"a".repeat(100)}\u200B\u200D`);
    await pass(SEARCH_SETTLE_DELAY_MS);

    expect(current().searchProblem).toBeUndefined();
    expect(server.requests).toHaveLength(1);
  });
});

describe("a list whose total moves between two pages", () => {
  it("stops offering more when the total fell below what is already shown", async () => {
    server.script(({ url }) =>
      url.searchParams.get("page") === "1"
        ? { body: wireList(rowsOfPage(1, 20), { total: 45 }) }
        : { body: wireList(rowsOfPage(2, 5), { total: 25, page: 2 }) },
    );
    await mount();

    act(() => {
      current().loadMore();
    });
    await settle();
    server.requests.length = 0;
    act(() => {
      current().loadMore();
    });
    await settle();

    expect(listing().total).toBe(25);
    expect(listing().rows).toHaveLength(25);
    expect(server.requests).toHaveLength(0);
  });

  it("goes on offering more when the total grew, and appends the page after the last one shown", async () => {
    server.script(({ url }) => {
      const page = Number(url.searchParams.get("page"));
      return {
        body: wireList(rowsOfPage(page, 20), {
          total: page === 1 ? 25 : 100,
          page,
        }),
      };
    });
    await mount();
    act(() => {
      current().loadMore();
    });
    await settle();
    server.requests.length = 0;

    act(() => {
      current().loadMore();
    });
    await settle();

    expect(queryOf(0).page).toBe("3");
    expect(listing().rows).toHaveLength(60);
  });

  it("shows no kitchen twice when a whole page is made of kitchens already shown", async () => {
    server.script(({ url }) => ({
      body: wireList(rowsOfPage(1, 20), {
        total: 45,
        page: Number(url.searchParams.get("page")),
      }),
    }));
    await mount();

    act(() => {
      current().loadMore();
    });
    await settle();

    expect(new Set(idsShown()).size).toBe(idsShown().length);
    expect(idsShown()).toHaveLength(20);
    expect(listing().lastPage).toBe(2);
  });

  it("asks again for the page that could not be had, not the one after it", async () => {
    server.script(({ url }) =>
      url.searchParams.get("page") === "1"
        ? { body: wireList(rowsOfPage(1, 20), { total: 60 }) }
        : { status: 503, body: { status: "unavailable" } },
    );
    await mount();
    act(() => {
      current().loadMore();
    });
    await settle();
    server.requests.length = 0;
    server.script(() => ({
      body: wireList(rowsOfPage(2, 20), { total: 60, page: 2 }),
    }));

    act(() => {
      current().loadMore();
    });
    await settle();

    expect(queryOf(0).page).toBe("2");
    expect(listing().lastPage).toBe(2);
    expect(listing().rows).toHaveLength(40);
  });

  it("waits for the person after a 429 on 'load more' too, keeping the rows", async () => {
    server.script(({ url }) =>
      url.searchParams.get("page") === "1"
        ? { body: wireList(rowsOfPage(1, 20), { total: 60 }) }
        : {
            status: 429,
            body: { status: "rate-limited" },
            headers: { "retry-after": "30" },
          },
    );
    await mount();
    act(() => {
      current().loadMore();
    });
    await settle();
    server.requests.length = 0;

    await pass(30 * 60 * 1000);

    expect(server.requests).toHaveLength(0);
    expect(listing().rows).toHaveLength(20);
  });
});

describe("what a 429 states", () => {
  it.each([
    ["no Retry-After at all", undefined],
    ["a Retry-After of nought", "0"],
    ["a Retry-After that is a date", "Wed, 21 Oct 2026 12:30:00 GMT"],
    ["a Retry-After that is a word", "soon"],
  ])("is told with no number for %s", async (_label, retryAfter) => {
    server.script(() => ({
      status: 429,
      body: { status: "rate-limited" },
      headers: retryAfter === undefined ? {} : { "retry-after": retryAfter },
    }));

    await mount();

    expect(current().state).toEqual({
      phase: "failed",
      failure: { kind: "rate-limited", notice: { kind: "unreadable" } },
    });
  });

  it("counts a short wait from the moment the answer came, not from the moment it was asked", async () => {
    server.script(() => "hold");
    await mount();

    await pass(10_000);
    server.held[0]?.answer({
      status: 429,
      body: { status: "rate-limited" },
      headers: { "retry-after": "60" },
    });
    await settle();

    const { state } = current();
    expect(state).toMatchObject({
      phase: "failed",
      failure: {
        kind: "rate-limited",
        notice: { kind: "countdown", endsAtMs: Date.now() + 60_000 },
      },
    });
  });
});

describe("an answer that is not a page", () => {
  it.each([
    ["a 201", { status: 201 }],
    ["a 202", { status: 202 }],
    ["a 206", { status: 206 }],
    ["a 404", { status: 404 }],
    ["a 400", { status: 400, body: { status: "invalid-input", issues: [] } }],
    ["a 502", { status: 502 }],
  ])("does not draw the page that comes with %s", async (_label, answer) => {
    server.script(() => ({ body: wireList([wireRow(1)]), ...answer }));

    await mount();

    expect(current().state).toEqual({
      phase: "failed",
      failure: { kind: "failed" },
    });
  });

  it("tells a 429 whose body does not say it is a limit as a failed request, not as a wait", async () => {
    server.script(() => ({
      status: 429,
      body: { status: "something-else" },
      headers: { "retry-after": "30" },
    }));

    await mount();

    expect(current().state).toEqual({
      phase: "failed",
      failure: { kind: "failed" },
    });
  });

  it("tells a 200 that is not JSON as a failed request", async () => {
    server.script(() => ({ body: undefined }));

    await mount();

    expect(current().state).toEqual({
      phase: "failed",
      failure: { kind: "failed" },
    });
  });

  it("leaves for the login page on a 401 given to 'load more', and draws nothing else", async () => {
    server.script(({ url }) =>
      url.searchParams.get("page") === "1"
        ? { body: wireList(rowsOfPage(1, 20), { total: 60 }) }
        : { status: 401, body: { status: "unauthenticated" } },
    );
    await mount();

    act(() => {
      current().loadMore();
    });
    await settle();

    expect(assigned).toEqual(["/ro/account/login?reason=session-expired"]);
  });

  it("tells a 403 given to 'load more' as the forbidden screen", async () => {
    server.script(({ url }) =>
      url.searchParams.get("page") === "1"
        ? { body: wireList(rowsOfPage(1, 20), { total: 60 }) }
        : { status: 403, body: { status: "forbidden" } },
    );
    await mount();

    act(() => {
      current().loadMore();
    });
    await settle();

    expect(current().state).toEqual({ phase: "forbidden" });
  });
});

describe("a screen drawn twice on mount (React's strict mode)", () => {
  it("draws the answer of the request that stayed, once", async () => {
    server.script(() => pageOf([1, 2, 3]));

    await mount(true);

    expect(idsShown()).toEqual(serialsOf(1, 2, 3));
    expect(server.requests.length).toBeLessThanOrEqual(2);
    expect(
      server.requests.slice(0, -1).every(({ signal }) => signal.aborted),
    ).toBe(true);
  });
});
