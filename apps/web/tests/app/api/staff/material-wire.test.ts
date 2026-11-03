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
// `inMemoryPriceDraftClient`, which calls `applyChanges` itself, so none of them reaches the boundary reader that turns a
// request into a change. Here the fetching client (the one a browser has) is run over a `fetch` that is the real `PUT` and
// `DELETE` of `/api/staff/prices/draft`, over the persistence package's price-book fake, with the bodies the materials
// screens send. A surcharge is an applied kind, so its write and its take-back run today and are held as they are. What the
// screens also send has no route until R4a (no `/api/staff/prices/availability` exists, and `draft-address.ts` reads only the
// applied kinds): a test below marked `it.fails` is a promise of the screens' port that no route keeps yet. It runs and goes
// red the moment R4a keeps it; R4a flips each to `it`.

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
  return new Response(null, { status: 404 });
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

      expect(outcome.kind).toBe("changed");
    },
  );

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
      const answer = await fetch("/api/staff/prices/availability", {
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
