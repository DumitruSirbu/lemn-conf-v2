// @vitest-environment happy-dom
//
// Adversarial reading of the audit hook (wave L3-U6). Every page the server serves is itself a row of the log, so what the
// hook must never do is ask for a page nobody asked for: after a page is left, after a network that came back, after a
// wait that ended, after a page past the end of an empty log. The server is a stand-in for `fetch` that can hold a request
// and answer it after the hook has moved on.
import { StrictMode, act, createElement } from "react";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
  resolveStaffSessionExpired,
} from "@/staff/staff-session-expiry";
import {
  useStaffAudit,
  type StaffAudit,
  type StaffAuditFilters,
} from "@/staff/use-staff-audit";

import { renderHook, type RenderedHook } from "../support/render-hook";
import {
  auditAccountIdOf,
  auditEventIdOf,
  auditEventsFrom,
  wireAuditEvent,
  wireAuditPage,
} from "../support/staff-audit-wire";
import {
  UNAUTHENTICATED_ANSWER,
  installStaffKitchensServer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

import { required } from "./qa-l3-u6-required.adversarial";

const ONE_HOUR_MS = 60 * 60 * 1000;
const PAGE_SIZE = 25;

let server: StaffKitchensServer;
let hook: RenderedHook<StaffAudit> | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetStaffSessionExpiryForTests();
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

async function mount(
  wrap?: Parameters<typeof renderHook>[1],
): Promise<StaffAudit> {
  hook = renderHook(() => useStaffAudit(), wrap);
  await settle();
  return current();
}

function current(): StaffAudit {
  if (hook === undefined) throw new Error("nothing is mounted");
  return hook.result.current;
}

async function doing(action: (audit: StaffAudit) => void): Promise<StaffAudit> {
  act(() => {
    action(current());
  });
  await settle();
  return current();
}

function pagesAsked(): string[] {
  return server.requests.map(({ url }) => url.searchParams.get("page") ?? "");
}

function listing() {
  const { state } = current();
  if (state.phase !== "ready") throw new Error(`the page is ${state.phase}`);
  return state.listing;
}

describe("a page past the end of a log that holds nothing", () => {
  it("is not corrected: with a count of nought there is no last page to go to but the first, which was not asked for", async () => {
    server.script(() => ({ body: wireAuditPage(auditEventsFrom(1, 3)) }));
    await mount();
    server.requests.length = 0;
    server.script(() => ({ body: wireAuditPage([], { total: 0, page: 3 }) }));

    await doing((audit) => {
      audit.goToPage(3);
    });

    expect(pagesAsked()).toEqual(["3"]);
    expect(listing().events).toEqual([]);
    expect(listing().total).toBe(0);
  });

  it("is corrected once to the first page when the count is not nought but the log fits on it", async () => {
    server.script(() => ({ body: wireAuditPage(auditEventsFrom(1, 3)) }));
    await mount();
    server.requests.length = 0;
    server.script((request) =>
      request.url.searchParams.get("page") === "3"
        ? { body: wireAuditPage([], { total: 3, page: 3 }) }
        : { body: wireAuditPage(auditEventsFrom(1, 3), { total: 3, page: 1 }) },
    );

    await doing((audit) => {
      audit.goToPage(3);
    });

    expect(pagesAsked()).toEqual(["3", "1"]);
    expect(listing().events).toHaveLength(3);
  });
});

describe("the page run twice, as the development build does", () => {
  const strictly = (children: React.ReactNode) =>
    createElement(StrictMode, null, children);

  it("draws the answer of the newest request only: every request before it is aborted and its late answer is dropped", async () => {
    server.script(() => "hold");
    server.honoursAbort = false;
    await mount(strictly);
    const newest = server.held.at(-1);
    const earlier = server.held.slice(0, -1);

    for (const request of earlier) {
      request.answer({ body: wireAuditPage(auditEventsFrom(10, 4)) });
      await settle();
      expect(current().state).toEqual({ phase: "loading" });
    }
    newest?.answer({ body: wireAuditPage(auditEventsFrom(1, 2)) });
    await settle();

    expect(earlier.every((request) => request.signal.aborted)).toBe(true);
    expect(newest?.signal.aborted).toBe(false);
    expect(listing().events).toHaveLength(2);
  });

  it("tells the staff frame the session ended once on a 401, and asks again once when the person is back", async () => {
    server.script(() => UNAUTHENTICATED_ANSWER);
    await mount(strictly);
    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: false });
    const askedBefore = server.requests.length;
    server.script(() => ({ body: wireAuditPage(auditEventsFrom(1, 2)) }));

    await doing(() => {
      resolveStaffSessionExpired();
    });
    await doing(() => {
      resolveStaffSessionExpired();
    });

    expect(server.requests.length - askedBefore).toBe(1);
    expect(listing().events).toHaveLength(2);
  });
});

describe("a network that is gone", () => {
  it("waits for the person however long it is gone and whatever the browser says of coming back", async () => {
    server.script(() => "offline");
    await mount();
    expect(current().state).toEqual({
      phase: "failed",
      failure: { kind: "offline" },
    });

    await pass(6 * ONE_HOUR_MS);
    for (const [target, name] of [
      [window, "online"],
      [window, "focus"],
      [document, "visibilitychange"],
      [window, "pageshow"],
    ] as const) {
      act(() => {
        target.dispatchEvent(new Event(name));
      });
    }
    await pass(6 * ONE_HOUR_MS);

    expect(server.requests).toHaveLength(1);
  });
});

describe("a limit with a wait that the server told in a form the page can only guess at", () => {
  it.each([
    ["no Retry-After at all", undefined],
    ["a word", "soon"],
    ["a negative number", "-5"],
    ["nought", "0"],
    ["a date in the past", "Wed, 21 Oct 2015 07:28:00 GMT"],
    ["a date in the future", "Wed, 21 Oct 2037 07:28:00 GMT"],
    ["a number beyond any wait", "99999999999999999999"],
    ["a fraction", "1.5"],
  ])(
    "asks nothing when it ends, whatever the time that passes, for %s",
    async (_label, retryAfter) => {
      server.script(() => ({
        status: 429,
        body: { status: "rate-limited" },
        headers: retryAfter === undefined ? {} : { "retry-after": retryAfter },
      }));

      await mount();
      await pass(26 * ONE_HOUR_MS);

      const { state } = current();
      expect(state.phase === "failed" && state.failure.kind).toBe(
        "rate-limited",
      );
      expect(server.requests).toHaveLength(1);
    },
  );
});

describe("a page jumped to, and then a filter chosen", () => {
  it("asks for the first page of the new filters whichever page the person was on", () => {
    return fc.assert(
      fc
        .asyncProperty(
          fc.integer({ min: 2, max: 400 }),
          fc.constantFrom(
            "kitchen-opened",
            "note-added",
            "status-changed",
            "kitchen-unhidden",
            "kitchens-listed",
            "audit-viewed",
          ),
          async (page, action) => {
            server.requests.length = 0;
            server.script((request) => ({
              body: wireAuditPage(auditEventsFrom(1, 3), {
                total: 10_000,
                page: Number(request.url.searchParams.get("page")),
              }),
            }));
            await mount();
            await doing((audit) => {
              audit.goToPage(page);
            });
            await doing((audit) => {
              audit.patchFilters({ action: action });
            });

            expect(server.requests.at(-1)?.url.searchParams.get("page")).toBe(
              "1",
            );
            expect(server.requests.at(-1)?.url.searchParams.get("action")).toBe(
              action,
            );
            hook?.unmount();
            hook = undefined;
          },
        )
        .afterEach(() => {
          resetStaffSessionExpiryForTests();
        }),
      { numRuns: 25 },
    );
  });
});

describe("a phone log whose total moves under it", () => {
  /**
   * The real server: each page served is one row inserted at the top, so the rows shift down by one for the next request.
   * A page is read before its own row is inserted.
   */
  function movingLog(initialTotal: number, insertedPerRequest: number) {
    let inserted = 0;
    return {
      server: (request: { url: URL }) => {
        const page = Number(request.url.searchParams.get("page"));
        const total = initialTotal + inserted;
        const offset = (page - 1) * PAGE_SIZE;
        const count = Math.max(0, Math.min(PAGE_SIZE, total - offset));
        // Row number r (0 is the newest) keeps one id for good: ids count up from the bottom of the log.
        const events = Array.from({ length: count }, (_, index) =>
          wireAuditEvent(total - (offset + index)),
        );
        inserted += insertedPerRequest;
        return { body: wireAuditPage(events, { total, page }) };
      },
    };
  }

  it("shows no row twice, counts the rows shown as the range says, and offers more exactly while rows are left", () => {
    return fc.assert(
      fc
        .asyncProperty(
          fc.integer({ min: 26, max: 140 }),
          fc.integer({ min: 0, max: 3 }),
          async (initialTotal, insertedPerRequest) => {
            server.requests.length = 0;
            server.script(movingLog(initialTotal, insertedPerRequest).server);
            await mount();

            for (let press = 0; press < 12; press += 1) {
              const { lastPage, pageSize, total } = listing();
              if (lastPage * pageSize >= total) break;
              await doing((audit) => {
                audit.loadMore();
              });
            }

            const { events, lastPage, pageSize, total } = listing();
            const ids = events.map(({ id }) => id);
            expect(new Set(ids).size).toBe(ids.length);
            expect(ids.every((id) => id.startsWith("e"))).toBe(true);
            expect(events.length).toBeLessThanOrEqual(total);
            expect(events.length).toBeLessThanOrEqual(lastPage * pageSize);
            expect(pagesAsked().at(-1)).toBe(String(lastPage));
            hook?.unmount();
            hook = undefined;
          },
        )
        .afterEach(() => {
          resetStaffSessionExpiryForTests();
        }),
      { numRuns: 25 },
    );
  });

  it("never skips a row of the log while the log only grows at its top", async () => {
    server.script(movingLog(70, 1).server);
    await mount();

    await doing((audit) => {
      audit.loadMore();
    });
    await doing((audit) => {
      audit.loadMore();
    });
    await doing((audit) => {
      audit.loadMore();
    });

    const shown = new Set(listing().events.map(({ id }) => id));
    const everyRowOfTheFirstRead = Array.from({ length: 70 }, (_, index) =>
      auditEventIdOf(index + 1),
    );
    expect(everyRowOfTheFirstRead.filter((id) => !shown.has(id))).toEqual([]);
    expect(pagesAsked()).toEqual(["1", "2", "3"]);
    expect(listing().lastPage * listing().pageSize).toBeGreaterThanOrEqual(
      listing().total,
    );
  });
});

describe("the controls and the rows when the days are refused", () => {
  it("leaves the log that is on screen alone, and asks for nothing, when a page is pressed", async () => {
    server.script(() => ({
      body: wireAuditPage(auditEventsFrom(1, 25), { total: 200 }),
    }));
    await mount();
    await doing((audit) => {
      audit.patchFilters({ action: "note-added" });
    });
    await doing((audit) => {
      audit.patchFilters({ from: "2026-13-45" });
    });
    server.requests.length = 0;

    await doing((audit) => {
      audit.goToPage(2);
    });

    expect(current().dateProblem).toEqual({
      kind: "invalid-day",
      field: "from",
    });
    expect(server.requests).toEqual([]);
    expect(listing().firstPage).toBe(1);
  });
});

describe("whatever the person does, in any order", () => {
  const ALLOWED_QUERY_MEMBERS = ["action", "actor", "from", "page", "to"];
  const ALLOWED_INIT_MEMBERS = ["method", "referrerPolicy", "signal"];
  const DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
  const ACTORS = [auditAccountIdOf(1), auditAccountIdOf(2)];

  type Operation =
    | { kind: "action"; value: StaffAuditFilters["action"] }
    | { kind: "actor"; value: string | null }
    | { kind: "from" | "to"; value: string }
    | { kind: "clear" | "more" | "retry" }
    | { kind: "page"; value: number };

  const OPERATIONS: fc.Arbitrary<Operation> = fc.oneof(
    fc.record({
      kind: fc.constant("action" as const),
      value: fc.constantFrom("note-added", "audit-viewed", null),
    }),
    fc.record({
      kind: fc.constant("actor" as const),
      value: fc.constantFrom(...ACTORS, null),
    }),
    fc.record({
      kind: fc.constantFrom("from" as const, "to" as const),
      value: fc.constantFrom(
        "",
        "2026-03-29",
        "2026-10-25",
        "2000-01-01",
        "9998-12-31",
        "1999-12-31",
        "9999-01-01",
        "2026-02-30",
        "garbage",
      ),
    }),
    fc.record({
      kind: fc.constantFrom(
        "clear" as const,
        "more" as const,
        "retry" as const,
      ),
    }),
    fc.record({
      kind: fc.constant("page" as const),
      value: fc.integer({ min: 1, max: 12 }),
    }),
  );

  function serveEightPages(request: { url: URL }) {
    const page = Number(request.url.searchParams.get("page"));
    const events =
      page > 8
        ? []
        : Array.from({ length: PAGE_SIZE }, (_, index) =>
            wireAuditEvent((page - 1) * PAGE_SIZE + index + 1, {
              actor: {
                id: required(ACTORS[index % 2]),
                email: `person${String(index % 2)}@lemnaria.md`,
              },
            }),
          );
    return { body: wireAuditPage(events, { total: 200, page }) };
  }

  function perform(audit: StaffAudit, operation: Operation): void {
    switch (operation.kind) {
      case "action":
        audit.patchFilters({ action: operation.value });
        return;
      case "actor":
        audit.patchFilters({ actorId: operation.value });
        return;
      case "from":
        audit.patchFilters({ from: operation.value });
        return;
      case "to":
        audit.patchFilters({ to: operation.value });
        return;
      case "clear":
        audit.clearFilters();
        return;
      case "more":
        audit.loadMore();
        return;
      case "retry":
        audit.retry();
        return;
      case "page":
        audit.goToPage(operation.value);
    }
  }

  it("asks only with the five members of the contract, only with days it could be refused for nothing, one GET with no referrer each, and never more than two requests for one act", () => {
    return fc.assert(
      fc
        .asyncProperty(
          fc.array(OPERATIONS, { minLength: 1, maxLength: 14 }),
          async (operations) => {
            server.requests.length = 0;
            server.script(serveEightPages);
            await mount();

            for (const operation of operations) {
              const before = server.requests.length;
              await doing((audit) => {
                perform(audit, operation);
              });
              expect(server.requests.length - before).toBeLessThanOrEqual(2);
            }

            for (const { url, init } of server.requests) {
              const query = Object.fromEntries(url.searchParams);
              expect(
                Object.keys(query)
                  .sort()
                  .filter((name) => !ALLOWED_QUERY_MEMBERS.includes(name)),
              ).toEqual([]);
              expect(url.pathname).toBe("/api/staff/audit");
              expect(url.hash).toBe("");
              expect(query.page).toMatch(/^[1-9][0-9]*$/u);
              for (const day of [query.from, query.to]) {
                if (day !== undefined) expect(day).toMatch(DAY);
              }
              if (query.from !== undefined && query.to !== undefined) {
                expect(query.from <= query.to).toBe(true);
              }
              if (query.actor !== undefined)
                expect(ACTORS).toContain(query.actor);
              expect(init.method).toBe("GET");
              expect(init.referrerPolicy).toBe("no-referrer");
              expect(
                Object.keys(init).filter(
                  (name) => !ALLOWED_INIT_MEMBERS.includes(name),
                ),
              ).toEqual([]);
            }
            hook?.unmount();
            hook = undefined;
          },
        )
        .afterEach(() => {
          resetStaffSessionExpiryForTests();
        }),
      { numRuns: 60 },
    );
  });
});
