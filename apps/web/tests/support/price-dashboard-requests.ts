import type { NextRequest } from "next/server";

import { POST as BULK } from "@/app/api/staff/prices/bulk/route";
import { DELETE, PUT } from "@/app/api/staff/prices/draft/route";
import { GET } from "@/app/api/staff/prices/route";
import type { Capability } from "@lemnaria/configurator-domain";

import { accountRequest, type AccountRequestInit } from "./account-world";
import { currentPriceDashboardWorld } from "./price-dashboard-world";

// The four price dashboard requests as a browser sends them, and the table the capability tests walk. A test file that uses
// it mocks the session store, the staff audit store, `@/lib/server/price-stores` and the bulk planner.

const SOME_NETWORK = { "x-forwarded-for": "192.0.2.10" };

type Init = Omit<AccountRequestInit, "method">;

function request(path: string, method: string, init: Init): NextRequest {
  return accountRequest(path, {
    ...init,
    method,
    headers: { ...SOME_NETWORK, ...init.headers },
  });
}

export function readRequest(init: Init = {}): NextRequest {
  return request("/api/staff/prices", "GET", init);
}

export function changeRequest(init: Init = {}): NextRequest {
  return request("/api/staff/prices/draft", "PUT", init);
}

export function revertRequest(init: Init = {}): NextRequest {
  return request("/api/staff/prices/draft", "DELETE", init);
}

export function bulkRequest(init: Init = {}): NextRequest {
  return request("/api/staff/prices/bulk", "POST", init);
}

/** The revision the draft holds now: a publish leaves it at one no reader has held, so a test asks rather than guesses. */
export async function currentDraftRevision(): Promise<string> {
  const draft = await currentPriceDashboardWorld().stores.priceBook.readDraft();
  return draft.draftRevision;
}

export const readState = (init: Init = {}) => GET(readRequest(init));
export const changeDraft = (init: Init = {}) => PUT(changeRequest(init));
export const revertDraft = (init: Init = {}) => DELETE(revertRequest(init));
export const bulkDraft = (init: Init = {}) => BULK(bulkRequest(init));

export interface DashboardRoute {
  readonly name: string;
  /** The log event the route's refusals are written under. */
  readonly event: "staff-prices" | "staff-price-draft";
  readonly capability: Capability;
  /** What an administrator's request is answered with: the status that shows the request was admitted and judged. */
  readonly admittedStatus: number;
  readonly ask: (cookie?: string) => Promise<Response>;
}

const WITH_COOKIE = (cookie: string | undefined): Init =>
  cookie === undefined ? {} : { cookie };

export const DASHBOARD_ROUTES: readonly DashboardRoute[] = [
  {
    name: "GET /api/staff/prices",
    event: "staff-prices",
    capability: "price.edit",
    admittedStatus: 200,
    ask: (cookie) => readState(WITH_COOKIE(cookie)),
  },
  {
    name: "PUT /api/staff/prices/draft",
    event: "staff-price-draft",
    capability: "price.edit",
    admittedStatus: 200,
    ask: async (cookie) =>
      changeDraft({
        ...WITH_COOKIE(cookie),
        json: {
          expectedDraftRevision: await currentDraftRevision(),
          change: { address: { kind: "provisional" }, value: false },
        },
      }),
  },
  {
    name: "DELETE /api/staff/prices/draft",
    event: "staff-price-draft",
    capability: "price.edit",
    // An administrator's revert of a change the draft does not hold is judged, not admitted to a write.
    admittedStatus: 400,
    ask: async (cookie) =>
      revertDraft({
        ...WITH_COOKIE(cookie),
        json: {
          expectedDraftRevision: await currentDraftRevision(),
          target: { kind: "change", address: { kind: "provisional" } },
        },
      }),
  },
  {
    name: "DELETE /api/staff/prices/draft (discard all)",
    event: "staff-price-draft",
    capability: "price.edit",
    admittedStatus: 200,
    ask: async (cookie) =>
      revertDraft({
        ...WITH_COOKIE(cookie),
        json: {
          expectedDraftRevision: await currentDraftRevision(),
          scope: "all",
        },
      }),
  },
  {
    name: "POST /api/staff/prices/bulk",
    event: "staff-price-draft",
    capability: "price.edit",
    admittedStatus: 200,
    ask: async (cookie) =>
      bulkDraft({
        ...WITH_COOKIE(cookie),
        json: {
          expectedDraftRevision: await currentDraftRevision(),
          target: { scope: "all" },
          percent: 5,
        },
      }),
  },
];
