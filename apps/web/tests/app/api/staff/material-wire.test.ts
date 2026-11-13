import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, PUT } from "@/app/api/staff/prices/draft/route";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import {
  FETCHING_PRICE_DRAFT_CLIENT,
  type DraftChangeOutcome,
} from "@/price-dashboard/price-draft-client";

import {
  accountRequest,
  freshAccountWorld,
} from "../../../support/account-world";
import {
  availabilityHead,
  disabledNow,
} from "../../../support/availability-route-world";
import { currentDraftRevision } from "../../../support/price-dashboard-requests";
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

// The materials screens' writes against the routes as they are in the tree. The screens' DOM tests write through
// `inMemoryPriceDraftClient`, which calls `applyChanges` itself, so none of them reaches the boundary reader that turns
// a request into a change. Here the fetching client (the one a browser has) is run over a `fetch` that is the real
// `PUT` and `DELETE` of `/api/staff/prices/draft`, over the persistence package's price-book fake, with the bodies the
// materials screens send. A surcharge is an applied kind, so its write and its take-back run today and are held as they
// are. A material's switch off or on is not a draft change: it goes to the availability route, a `POST` that the same
// `fetch` hands to the route handler of the tree.

let cookie: string;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  await freshPriceDashboardWorld();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  cookie = session.cookie;
  vi.stubGlobal("fetch", answerFromTheRoutes);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const NETWORK = { "x-forwarded-for": "192.0.2.10" };
const MDF = { kind: "material", tierId: "material.painted-mdf" } as const;
const PAL = { kind: "material", tierId: "material.melamine" } as const;

/** The browser's `fetch`, answered by the route handlers of the tree. */
async function answerFromTheRoutes(
  address: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = init.method ?? "GET";
  const request = accountRequest(address, {
    method,
    cookie,
    headers: NETWORK,
    ...(typeof init.body === "string" ? { json: init.body } : {}),
  });
  if (address === "/api/staff/prices/draft") {
    return method === "PUT" ? PUT(request) : DELETE(request);
  }
  if (address === AVAILABILITY_ADDRESS) {
    return (await availabilityHandlerOf())?.(request) ?? NOT_FOUND();
  }
  return NOT_FOUND();
}

const NOT_FOUND = () => new Response(null, { status: 404 });
const BROKEN = () => new Response(null, { status: 500 });
const AVAILABILITY_ADDRESS = "/api/staff/prices/availability";
const AVAILABILITY_ROUTE = "@/app/api/staff/prices/availability/route";

/** The availability route's `POST`, and `undefined` when the module has none. The module is named through a variable
 *  so that the file's not existing is an answer and not a failure to load this test. A route that exists and cannot
 *  load, or whose handler throws, is answered `500`, so a broken route is never read as an absent one. */
async function availabilityHandlerOf(): Promise<
  ((request: Request) => Promise<Response>) | undefined
> {
  try {
    const route = (await import(/* @vite-ignore */ AVAILABILITY_ROUTE)) as {
      readonly POST?: (request: Request) => Promise<Response>;
    };
    const handler = route.POST;
    return handler === undefined
      ? undefined
      : async (request) => {
          try {
            return await handler(request);
          } catch {
            return BROKEN();
          }
        };
  } catch (error) {
    return isTheRouteItselfMissing(error)
      ? undefined
      : () => Promise.resolve(BROKEN());
  }
}

/** The loader's answer for the route's own file not being there, and for nothing else it could not load. */
function isTheRouteItselfMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { code?: string }).code === "ERR_MODULE_NOT_FOUND" &&
    error.message.startsWith(`Cannot find module '${AVAILABILITY_ROUTE}'`)
  );
}

const surcharge = (item: typeof MDF | typeof PAL, value: number) => ({
  address: {
    kind: "material" as const,
    tierId: item.tierId,
    field: "percentOfCabinets" as const,
  },
  value,
});

describe("a material's surcharge, the one price the materials screens write today", () => {
  it("is taken by the draft route, so Save can write it", async () => {
    const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await currentDraftRevision(),
      change: surcharge(MDF, 35),
    });

    expect(outcome.kind).toBe("changed");
  });

  it("is taken back out by the route's revert, so typing the active surcharge back empties the draft", async () => {
    const written = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await currentDraftRevision(),
      change: surcharge(MDF, 35),
    });
    expect(written.kind).toBe("changed");

    const reverted = await FETCHING_PRICE_DRAFT_CLIENT.revert({
      expectedDraftRevision: await currentDraftRevision(),
      target: { kind: "change", address: surcharge(MDF, 35).address },
    });

    expect(reverted).toMatchObject({ kind: "changed" });
    expect(reverted.kind === "changed" && reverted.written.changes).toEqual([]);
  });

  it("is refused for PAL, the reference, which no screen offers a field for", async () => {
    const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await currentDraftRevision(),
      change: surcharge(PAL, 10),
    });

    expect(outcome).toEqual<DraftChangeOutcome>({
      kind: "refused",
      code: "NOT_EDITABLE",
    });
  });

  it("is refused past the book's greatest, in the code the screen words as 'at most the greatest'", async () => {
    const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await currentDraftRevision(),
      change: surcharge(MDF, 201),
    });

    expect(outcome).toEqual<DraftChangeOutcome>({
      kind: "refused",
      code: "TOO_LARGE",
    });
  });
});

describe("the write that deletes a held material (the materials screens' `deleteFromDraft`)", () => {
  it("is taken by the draft route, so the confirmation of an unused material's deletion can succeed", async () => {
    const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await currentDraftRevision(),
      change: { address: { kind: "item-deleted", item: MDF }, value: true },
    });

    expect(outcome.kind).toBe("changed");
  });
});

describe("the write that switches a material off or on (the lifecycle client's `setActive`)", () => {
  it("has a route that takes a POST, so a confirmed switch can be written outside a sample", async () => {
    const answer = await fetch(AVAILABILITY_ADDRESS, {
      method: "POST",
      body: JSON.stringify({
        expectedRevision: await availabilityHead(),
        item: MDF,
        active: false,
      }),
    });

    expect(answer.status).toBe(200);
    expect(await disabledNow()).toEqual([MDF]);
  });
});
