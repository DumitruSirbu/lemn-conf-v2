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
// are. What the screens also send has no route until R4a (no `/api/staff/prices/availability` exists, and
// `draft-address.ts` reads only the applied kinds): a test below marked `it.fails` is a promise of the screens' port
// that no route keeps yet. It runs and goes red the moment R4a keeps it; R4a flips each to `it`.

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

/** The availability route's `PUT` once the tree has one, and `undefined` until then. The module is named through a
 *  variable so that the file's not existing is an answer and not a failure to load this test. A route that exists and
 *  cannot load, or whose handler throws, is answered `500`, so a broken route is never read as an absent one. */
async function availabilityHandlerOf(): Promise<
  ((request: Request) => Promise<Response>) | undefined
> {
  try {
    const route = (await import(/* @vite-ignore */ AVAILABILITY_ROUTE)) as {
      readonly PUT?: (request: Request) => Promise<Response>;
    };
    const handler = route.PUT;
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

function isTheRefusalOfTheAddress(outcome: DraftChangeOutcome): boolean {
  return outcome.kind === "refused" && outcome.code === "NOT_EDITABLE";
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

describe("the write that deletes a held material (the materials screens' `deleteFromDraft`), no route until R4a", () => {
  // R4a adds the deletion's route and owes the flip to `it`.
  it.fails(
    "is taken by the draft route, so the confirmation of an unused material's deletion can succeed",
    async () => {
      const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: { kind: "item-deleted", item: MDF }, value: true },
      });

      // Only the refusal of the address, which R4a removes, may keep this red by design: any other answer (a write, or
      // a route that failed) ends the test green, and so turns the `it.fails` red.
      if (!isTheRefusalOfTheAddress(outcome)) return;
      expect(outcome.kind).toBe("changed");
    },
  );

  // Pins today's answer, and goes red when R4a adds the deletion's route: delete this test then, with the flip of the
  // `it.fails` above.
  it("is answered, today, as a refusal of the address, which the screen shows as a failed save it asks to retry", async () => {
    const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await currentDraftRevision(),
      change: { address: { kind: "item-deleted", item: MDF }, value: true },
    });

    expect(outcome).toEqual<DraftChangeOutcome>({
      kind: "refused",
      code: "NOT_EDITABLE",
    });
  });
});

describe("the write that switches a material off or on (the lifecycle client's `setActive`), no route until R4a", () => {
  // R4a adds the availability route and a fetching lifecycle client, and owes the flip to `it`.
  it.fails(
    "has a route that takes it, so a confirmed switch can be written outside a sample",
    async () => {
      const answer = await fetch(AVAILABILITY_ADDRESS, {
        method: "PUT",
        body: JSON.stringify({
          expectedRevision: "0",
          item: MDF,
          active: false,
        }),
      });

      expect(answer.status).not.toBe(404);
    },
  );
});
