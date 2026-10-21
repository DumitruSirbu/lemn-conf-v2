// @vitest-environment happy-dom
//
// The audit page asks for what the person's filters say, once, and never asks again on its own: every page the server
// serves is itself a row of the log, so a request nobody asked for would write one. A newer request aborts the one before
// it; a `429` or `503` waits for the person; a refused session is told to the staff frame and the refused page is asked
// for again, once, when the person is back; a page that comes back empty under a count that is not nought is the last page
// asked for, once; and the people the rows named are remembered. The server is a stand-in for `fetch`.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
  resolveStaffSessionExpired,
} from "@/staff/staff-session-expiry";
import { useStaffAudit, type StaffAudit } from "@/staff/use-staff-audit";

import { renderHook, type RenderedHook } from "../support/render-hook";
import {
  ADMINISTRATOR_ADDRESS,
  OPERATOR_ADDRESS,
  auditAccountIdOf,
  auditEventsFrom,
  wireAuditEvent,
  wireAuditPage,
} from "../support/staff-audit-wire";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  installStaffKitchensServer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

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

async function mount(): Promise<StaffAudit> {
  hook = renderHook(() => useStaffAudit());
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

function queries(): Record<string, string>[] {
  return server.requests.map(({ url }) => Object.fromEntries(url.searchParams));
}

function listing() {
  const { state } = current();
  if (state.phase !== "ready") throw new Error(`the page is ${state.phase}`);
  return state.listing;
}

const OPERATOR = { id: auditAccountIdOf(1), email: OPERATOR_ADDRESS };
const ADMINISTRATOR = { id: auditAccountIdOf(2), email: ADMINISTRATOR_ADDRESS };

describe("the first request", () => {
  it("asks for the first page and nothing else, and is loading until it is answered", async () => {
    server.script(() => "hold");
    await mount();

    expect(current().state).toEqual({ phase: "loading" });
    expect(queries()).toEqual([{ page: "1" }]);
    expect(server.requests[0]?.url.pathname).toBe("/api/staff/audit");
    expect(server.requests[0]?.init.method).toBe("GET");
    expect(server.requests[0]?.init.referrerPolicy).toBe("no-referrer");
  });

  it("is aborted when the page goes", async () => {
    server.script(() => "hold");
    await mount();

    hook?.unmount();
    hook = undefined;

    expect(server.requests[0]?.signal.aborted).toBe(true);
  });
});

describe("what a request carries", () => {
  beforeEach(async () => {
    server.script(() => ({ body: wireAuditPage(auditEventsFrom(1, 2)) }));
    await mount();
    server.requests.length = 0;
  });

  it("names a member only when a filter sets it", async () => {
    await doing((audit) => {
      audit.chooseAction("note-added");
    });
    await doing((audit) => {
      audit.chooseFrom("2026-10-01");
    });
    await doing((audit) => {
      audit.chooseTo("2026-10-31");
    });

    expect(queries()).toEqual([
      { page: "1", action: "note-added" },
      { page: "1", action: "note-added", from: "2026-10-01" },
      { page: "1", action: "note-added", from: "2026-10-01", to: "2026-10-31" },
    ]);
  });

  it("goes back to the first page whenever a filter changes", async () => {
    server.script(() => ({
      body: wireAuditPage(auditEventsFrom(26, 5), { total: 80, page: 2 }),
    }));
    await doing((audit) => {
      audit.goToPage(2);
    });

    await doing((audit) => {
      audit.chooseAction("audit-viewed");
    });

    expect(queries().at(-1)).toEqual({ page: "1", action: "audit-viewed" });
  });

  it("asks for a page by number with the filters of the page on screen", async () => {
    await doing((audit) => {
      audit.chooseAction("kitchen-opened");
    });
    await doing((audit) => {
      audit.goToPage(3);
    });

    expect(queries().at(-1)).toEqual({ page: "3", action: "kitchen-opened" });
  });

  it("keeps a refused range out of the request and the page it asked for last on screen", async () => {
    await doing((audit) => {
      audit.chooseFrom("2026-10-05");
    });
    server.requests.length = 0;

    const audit = await doing((again) => {
      again.chooseTo("2026-10-01");
    });

    expect(queries()).toEqual([]);
    expect(audit.dateProblem).toEqual({ kind: "inverted" });
    expect(listing().query.to).toBeNull();
    expect(audit.filters.to).toBe("2026-10-01");
  });

  it("asks for the same page again, with the same filters, when the person presses retry after a failure", async () => {
    await doing((audit) => {
      audit.chooseAction("note-added");
    });
    server.script(() => UNAVAILABLE_ANSWER);
    await doing((audit) => {
      audit.goToPage(4);
    });
    server.script(() => ({
      body: wireAuditPage(auditEventsFrom(76, 5), { total: 90, page: 4 }),
    }));

    await doing((audit) => {
      audit.retry();
    });

    expect(queries().at(-1)).toEqual({ page: "4", action: "note-added" });
    expect(current().state.phase).toBe("ready");
  });
});

describe("a newer request", () => {
  it("aborts the request that was out, and an answer that comes after is dropped", async () => {
    server.script(() => "hold");
    server.honoursAbort = false;
    await mount();

    await doing((audit) => {
      audit.chooseAction("note-added");
    });
    const [first, second] = server.held;
    act(() => {
      second?.answer({ body: wireAuditPage(auditEventsFrom(1, 1)) });
    });
    await settle();
    act(() => {
      first?.answer({ body: wireAuditPage(auditEventsFrom(10, 4)) });
    });
    await settle();

    expect(first?.signal.aborted).toBe(true);
    expect(second?.signal.aborted).toBe(false);
    expect(listing().events).toHaveLength(1);
  });
});

describe("nothing is asked again on its own", () => {
  it.each([
    ["a 503", UNAVAILABLE_ANSWER, "unavailable"],
    ["a 429", RATE_LIMITED_ANSWER(60), "rate-limited"],
  ] as const)(
    "after %s, whatever time passes",
    async (_label, answer, kind) => {
      server.script(() => answer);
      await mount();

      await pass(2 * 60 * 60 * 1000);

      const { state } = current();
      expect(state.phase === "failed" && state.failure.kind).toBe(kind);
      expect(server.requests).toHaveLength(1);
    },
  );

  it("after an answer that is not a log, a network that is gone, or a forbidden", async () => {
    server.script(() => ({ body: { nothing: true } }));
    await mount();
    await pass(60 * 60 * 1000);
    expect(server.requests).toHaveLength(1);

    server.script(() => FORBIDDEN_ANSWER);
    await doing((audit) => {
      audit.retry();
    });
    expect(current().state.phase).toBe("forbidden");
    await pass(60 * 60 * 1000);
    expect(server.requests).toHaveLength(2);
  });

  it("after a log that is shown, however long it stays open", async () => {
    server.script(() => ({ body: wireAuditPage(auditEventsFrom(1, 2)) }));
    await mount();

    await pass(24 * 60 * 60 * 1000);

    expect(server.requests).toHaveLength(1);
  });
});

describe("the session", () => {
  it("is told to the staff frame on a 401, which leaves the page where it is and nothing asked in the meantime", async () => {
    server.script(() => UNAUTHENTICATED_ANSWER);
    await mount();

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: false });
    expect(current().state).toEqual({ phase: "loading" });
    await pass(60 * 60 * 1000);
    expect(server.requests).toHaveLength(1);
  });

  it("asks again for the very page that was refused, once, when the person is back", async () => {
    server.script(() => ({
      body: wireAuditPage(auditEventsFrom(1, 25), { total: 80 }),
    }));
    await mount();
    await doing((audit) => {
      audit.chooseAction("note-added");
    });
    server.script(() => UNAUTHENTICATED_ANSWER);
    await doing((audit) => {
      audit.goToPage(3);
    });
    server.requests.length = 0;
    server.script(() => ({
      body: wireAuditPage(auditEventsFrom(51, 25), { total: 80, page: 3 }),
    }));

    await doing(() => {
      resolveStaffSessionExpired();
    });
    await doing(() => {
      resolveStaffSessionExpired();
    });

    expect(queries()).toEqual([{ page: "3", action: "note-added" }]);
    expect(listing().firstPage).toBe(3);
  });
});

describe("a page past the end", () => {
  it("is asked again once, as the last page there is, after a jump", async () => {
    server.script(() => ({
      body: wireAuditPage(auditEventsFrom(1, 25), { total: 1204 }),
    }));
    await mount();
    server.script((request) => {
      const page = Number(request.url.searchParams.get("page"));
      return {
        body:
          page === 49
            ? wireAuditPage([], { total: 60, page: 49 })
            : wireAuditPage(auditEventsFrom(51, 10), { total: 60, page }),
      };
    });

    await doing((audit) => {
      audit.goToPage(49);
    });

    expect(queries().map((query) => query.page)).toEqual(["1", "49", "3"]);
    expect(listing().firstPage).toBe(3);
    expect(listing().landedJump).toEqual({ page: 3 });
  });

  it("is not corrected on the first request, which asks for page one and cannot be past the end", async () => {
    server.script(() => ({ body: wireAuditPage([], { total: 60, page: 1 }) }));
    await mount();

    expect(server.requests).toHaveLength(1);
    expect(listing().events).toEqual([]);
  });
});

describe("the people the rows name", () => {
  it("are remembered across filters, by their latest address, each once and in the order of the addresses", async () => {
    server.script((request) => {
      const actor = request.url.searchParams.get("actor");
      return {
        body: wireAuditPage(
          actor === ADMINISTRATOR.id
            ? [wireAuditEvent(1, { actor: ADMINISTRATOR })]
            : [
                wireAuditEvent(1, { actor: OPERATOR }),
                wireAuditEvent(2, { actor: OPERATOR }),
                wireAuditEvent(3, { actor: ADMINISTRATOR }),
              ],
        ),
      };
    });
    await mount();
    expect(current().actors).toEqual([ADMINISTRATOR, OPERATOR]);

    await doing((audit) => {
      audit.chooseActor(ADMINISTRATOR.id);
    });

    expect(current().actors).toEqual([ADMINISTRATOR, OPERATOR]);
    expect(current().filters.actorId).toBe(ADMINISTRATOR.id);
    expect(queries().at(-1)).toEqual({ page: "1", actor: ADMINISTRATOR.id });
  });

  it("leave out an account whose address is gone, which no option could tell from another", async () => {
    server.script(() => ({
      body: wireAuditPage([
        wireAuditEvent(1, { actor: { id: auditAccountIdOf(7), email: null } }),
        wireAuditEvent(2, { actor: OPERATOR }),
      ]),
    }));
    await mount();

    expect(current().actors).toEqual([OPERATOR]);
  });

  it("are learned from the pages that are appended too, and from the page that was corrected", async () => {
    server.script((request) =>
      request.url.searchParams.get("page") === "2"
        ? {
            body: wireAuditPage(
              [wireAuditEvent(26, { actor: ADMINISTRATOR })],
              {
                total: 26,
                page: 2,
              },
            ),
          }
        : {
            body: wireAuditPage(auditEventsFrom(1, 25), { total: 26 }),
          },
    );
    await mount();
    expect(current().actors).toEqual([OPERATOR]);

    await doing((audit) => {
      audit.loadMore();
    });

    expect(current().actors).toEqual([ADMINISTRATOR, OPERATOR]);
    expect(listing().events).toHaveLength(26);
  });
});

describe("loading more", () => {
  it("does nothing while a page is out, and nothing when every row is shown", async () => {
    server.script(() => ({
      body: wireAuditPage(auditEventsFrom(1, 25), { total: 30 }),
    }));
    await mount();
    server.script(() => "hold");
    act(() => {
      current().loadMore();
    });
    await settle();
    act(() => {
      current().loadMore();
    });
    await settle();

    expect(server.requests).toHaveLength(2);

    server.held[0]?.answer({
      body: wireAuditPage(auditEventsFrom(26, 5), { total: 30, page: 2 }),
    });
    await settle();
    server.requests.length = 0;
    act(() => {
      current().loadMore();
    });
    await settle();

    expect(server.requests).toHaveLength(0);
  });

  it("keeps the rows shown and tells the failure, when the next page cannot be had", async () => {
    server.script(() => ({
      body: wireAuditPage(auditEventsFrom(1, 25), { total: 30 }),
    }));
    await mount();
    server.script(() => RATE_LIMITED_ANSWER(60));

    await doing((audit) => {
      audit.loadMore();
    });

    const { state } = current();
    expect(state.phase === "ready" && state.more.kind).toBe("failed");
    expect(listing().events).toHaveLength(25);
  });
});
