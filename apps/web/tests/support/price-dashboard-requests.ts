import type { NextRequest } from "next/server";

import { POST as BULK } from "@/app/api/staff/prices/bulk/route";
import { DELETE, PUT } from "@/app/api/staff/prices/draft/route";
import { POST as PUBLISH } from "@/app/api/staff/prices/publish/route";
import { GET } from "@/app/api/staff/prices/route";
import { POST as RESTORE } from "@/app/api/staff/prices/versions/[id]/restore/route";
import { GET as VERSION } from "@/app/api/staff/prices/versions/[id]/route";
import { GET as VERSIONS } from "@/app/api/staff/prices/versions/route";
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

export function publishRequest(init: Init = {}): NextRequest {
  return request("/api/staff/prices/publish", "POST", init);
}

export function versionsRequest(init: Init = {}): NextRequest {
  return request("/api/staff/prices/versions", "GET", init);
}

/** `id` is the path's segment exactly as the framework would hand it to the route. */
export function versionRequest(id: string, init: Init = {}): NextRequest {
  return request(
    `/api/staff/prices/versions/${encodeURIComponent(id)}`,
    "GET",
    init,
  );
}

export function restoreRequest(id: string, init: Init = {}): NextRequest {
  return request(
    `/api/staff/prices/versions/${encodeURIComponent(id)}/restore`,
    "POST",
    init,
  );
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
export const publishDraft = (init: Init = {}) => PUBLISH(publishRequest(init));
export const readVersions = (init: Init = {}) =>
  VERSIONS(versionsRequest(init));
export const readVersion = (id: string, init: Init = {}) =>
  VERSION(versionRequest(id, init), { params: Promise.resolve({ id }) });
export const restoreVersion = (id: string, init: Init = {}) =>
  RESTORE(restoreRequest(id, init), { params: Promise.resolve({ id }) });

/**
 * A publish body as a page would send it: the draft revision the store holds now, the active sequence and the availability
 * head, and a label. A test overrides the members it is about.
 */
export async function publishBody(
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<Record<string, unknown>> {
  const { stores } = currentPriceDashboardWorld();
  const active = await stores.priceBook.readActive();
  if (active.kind !== "found") throw new Error("the world has no version");
  const availability = await stores.availability.readCurrent();
  return {
    expectedDraftRevision: await currentDraftRevision(),
    expectedActiveSequence: active.version.sequenceNumber,
    expectedAvailabilityRevision: availability.revision,
    label: "Autumn prices",
    note: "",
    ...overrides,
  };
}

function seededVersionId(): string {
  const { versionId } = currentPriceDashboardWorld();
  if (versionId === undefined) throw new Error("the world has no version");
  return versionId;
}

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
    name: "POST /api/staff/prices/publish",
    event: "staff-price-draft",
    capability: "price.edit",
    // The world's draft is empty: an administrator's publish is judged and found to have nothing to publish.
    admittedStatus: 409,
    ask: async (cookie) =>
      publishDraft({ ...WITH_COOKIE(cookie), json: await publishBody() }),
  },
  {
    name: "GET /api/staff/prices/versions",
    event: "staff-prices",
    capability: "price.edit",
    admittedStatus: 200,
    ask: (cookie) => readVersions(WITH_COOKIE(cookie)),
  },
  {
    name: "GET /api/staff/prices/versions/{id}",
    event: "staff-prices",
    capability: "price.edit",
    admittedStatus: 200,
    ask: (cookie) => readVersion(seededVersionId(), WITH_COOKIE(cookie)),
  },
  {
    name: "POST /api/staff/prices/versions/{id}/restore",
    event: "staff-price-draft",
    capability: "price.edit",
    // The seeded version is the active one, which has nothing to restore.
    admittedStatus: 409,
    ask: async (cookie) =>
      restoreVersion(seededVersionId(), {
        ...WITH_COOKIE(cookie),
        json: { expectedDraftRevision: await currentDraftRevision() },
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
