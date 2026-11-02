// Adversarial QA of M10 wave U2, the draft client against the routes it talks to. `price-draft-client.test.ts` checks
// what the client sends and what it makes of an answer it is handed; the routes' tests check what they answer to a
// request they build themselves. Neither says that the request the client builds is the request the route reads, or
// that the answer the route gives is the one the client sorts as the person is told. Here a stub of `fetch` hands the
// client's request to the real route handlers, over the persistence package's fake stores, and the client's outcome is
// read.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { DELETE, PUT } from "@/app/api/staff/prices/draft/route";
import { POST as BULK } from "@/app/api/staff/prices/bulk/route";
import { GET } from "@/app/api/staff/prices/route";
import { FETCHING_PRICE_DRAFT_CLIENT } from "@/price-dashboard/price-draft-client";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  accountRequest,
  captureConsole,
  freshAccountWorld,
} from "../../../support/account-world";
import { freshPriceDashboardWorld } from "../../../support/price-dashboard-world";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

const BASE_ANCHOR = {
  kind: "cabinet",
  ruleId: "cabinet.base-cabinet",
  field: "anchorMinor",
} as const;
const NETWORK = { "x-forwarded-for": "192.0.2.10" };

let cookie: string | undefined;

/** `fetch` as the browser does it, answered by the route handlers: the request the client built, byte for byte. */
async function routeFetch(
  address: string,
  init?: RequestInit,
): Promise<Response> {
  const method = init?.method ?? "GET";
  const request = accountRequest(address, {
    method,
    headers: NETWORK,
    ...(cookie === undefined ? {} : { cookie }),
    ...(init?.body === undefined ? {} : { json: init.body as string }),
  });
  if (address === "/api/staff/prices") return GET(request);
  if (address === "/api/staff/prices/draft") {
    return method === "PUT" ? PUT(request) : DELETE(request);
  }
  if (address === "/api/staff/prices/bulk") return BULK(request);
  throw new Error(
    `the client asked for an address no route answers: ${address}`,
  );
}

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubGlobal("fetch", routeFetch);
  cookie = (await signedInAs({ role: "administrator" })).session.cookie;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function revision(): Promise<string> {
  const state = await FETCHING_PRICE_DRAFT_CLIENT.readState();
  if (state === undefined) throw new Error("the state cannot be read");
  return state.draft.draftRevision;
}

describe("the client and the routes, one request each way", () => {
  it("reads the state the route sends, writes a change, takes it out again, and a second take-out is refused with a code", async () => {
    const written = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await revision(),
      change: { address: BASE_ANCHOR, value: 400_000 },
    });
    expect(written.kind).toBe("changed");
    if (written.kind !== "changed") return;
    expect(written.written.changes).toHaveLength(1);
    expect((await FETCHING_PRICE_DRAFT_CLIENT.readState())?.draft).toEqual(
      written.written,
    );

    const reverted = await FETCHING_PRICE_DRAFT_CLIENT.revert({
      expectedDraftRevision: written.written.draftRevision,
      target: { kind: "change", address: BASE_ANCHOR },
    });
    expect(reverted.kind).toBe("changed");
    if (reverted.kind !== "changed") return;
    expect(reverted.written.changes).toEqual([]);

    const again = await FETCHING_PRICE_DRAFT_CLIENT.revert({
      expectedDraftRevision: reverted.written.draftRevision,
      target: { kind: "change", address: BASE_ANCHOR },
    });
    expect(again).toEqual({ kind: "refused", code: "UNKNOWN_ADDRESS" });
  });

  it("sorts a write against a revision that has moved as a conflict, and writes nothing", async () => {
    const stale = await revision();
    await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: stale,
      change: { address: BASE_ANCHOR, value: 400_000 },
    });

    const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: stale,
      change: { address: BASE_ANCHOR, value: 410_000 },
    });

    expect(outcome).toEqual({ kind: "conflict" });
    const state = await FETCHING_PRICE_DRAFT_CLIENT.readState();
    expect(state?.draft.changes).toMatchObject([{ value: 400_000 }]);
  });

  it("sorts a bulk action as changed with the counts, and the same action against a stale revision as a conflict", async () => {
    const stale = await revision();

    const outcome = await FETCHING_PRICE_DRAFT_CLIENT.bulk({
      expectedDraftRevision: stale,
      target: { scope: "group", groupCode: "wall" },
      percent: 10,
    });
    const again = await FETCHING_PRICE_DRAFT_CLIENT.bulk({
      expectedDraftRevision: stale,
      target: { scope: "group", groupCode: "wall" },
      percent: 10,
    });

    expect(outcome.kind).toBe("changed");
    if (outcome.kind === "changed") {
      expect(outcome.written.ruleCount).toBeGreaterThan(0);
      expect(outcome.written.amountCount).toBeGreaterThanOrEqual(
        outcome.written.ruleCount,
      );
      expect(outcome.written.draft.changes).toHaveLength(
        outcome.written.amountCount,
      );
    }
    expect(again).toEqual({ kind: "conflict" });
  });

  it.each([
    ["a negative amount", -1_000, "NEGATIVE"],
    ["an amount past what the book holds", 9_000_000_000_000_000, "TOO_LARGE"],
    ["a fraction of a ban", 400_000.5, "NOT_A_WHOLE_NUMBER"],
  ] as const)(
    "sorts %s as refused with the code the screen words",
    async (_name, value, code) => {
      const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
        expectedDraftRevision: await revision(),
        change: { address: BASE_ANCHOR, value },
      });

      expect(outcome).toEqual({ kind: "refused", code });
    },
  );

  it("takes an anchor of 0, which the field accepts on purpose, as a write the draft holds: the route does not refuse it as a failure the screen would word as 'could not save'", async () => {
    const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await revision(),
      change: { address: BASE_ANCHOR, value: 0 },
    });

    expect(outcome.kind).toBe("changed");
  });

  it("is told a session that has ended is one, and an account without price.edit is not told so", async () => {
    cookie = undefined;
    const signedOut = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: "0",
      change: { address: BASE_ANCHOR, value: 400_000 },
    });
    cookie = (await signedInAs({ role: "operator" })).session.cookie;
    const operator = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: "0",
      change: { address: BASE_ANCHOR, value: 400_000 },
    });

    expect(signedOut).toEqual({ kind: "session-ended" });
    expect(operator.kind).toBe("failed");
    expect(await FETCHING_PRICE_DRAFT_CLIENT.readState()).toBeUndefined();
  });
});
