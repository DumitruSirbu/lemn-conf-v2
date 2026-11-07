// The defaults screen's fetching client against the routes it talks to. A stub of `fetch` hands the client's request to the
// real route handlers over the persistence package's fake stores, so what the client sends is what the routes read and
// what the routes answer is what the client sorts. Each outcome the screen tells apart is reached through a route, and a
// head that moves between the two reads of `readAgain` is moved by a real switch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { paletteFinish } from "@lemnaria/configurator-domain";

import {
  GET as DEFAULTS_GET,
  PUT as DEFAULTS_PUT,
} from "@/app/api/staff/prices/defaults/route";
import { GET as STATE_GET } from "@/app/api/staff/prices/route";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { FETCHING_KITCHEN_DEFAULTS_CLIENT } from "@/price-dashboard/fetching-kitchen-defaults-client";
import type { KitchenDefaultsSaveRequestWire } from "@/price-dashboard/price-dashboard-wire-contract";

import {
  accountRequest,
  captureConsole,
  freshAccountWorld,
} from "../../../support/account-world";
import {
  administrator,
  availabilityHead,
  switchItem,
} from "../../../support/availability-route-world";
import { FIXED_DEFAULTS } from "../../../support/kitchen-defaults-route-world";
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

const NETWORK = { "x-forwarded-for": "192.0.2.10" };
const VENEER = { kind: "material", tierId: "material.veneer" } as const;

let cookie: string | undefined;
let afterDefaultsRead: () => Promise<void> = () => Promise.resolve();

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
  if (address === "/api/staff/prices") return STATE_GET(request);
  if (address !== "/api/staff/prices/defaults") {
    throw new Error(`no route answers ${address}`);
  }
  if (method === "PUT") return DEFAULTS_PUT(request);
  const answer = await DEFAULTS_GET(request);
  await afterDefaultsRead();
  return answer;
}

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  await freshPriceDashboardWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubGlobal("fetch", routeFetch);
  afterDefaultsRead = () => Promise.resolve();
  cookie = (await administrator()).cookie;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function saveRequestFromFacts(
  defaults: Partial<KitchenDefaultsSaveRequestWire["defaults"]> = {},
): Promise<KitchenDefaultsSaveRequestWire> {
  const facts = await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain();
  if (facts === undefined) throw new Error("the facts cannot be read");
  return {
    expectedRevision: facts.state.revision,
    expectedAvailabilityRevision: facts.state.availabilityRevision,
    defaults: { ...facts.state.defaults, ...defaults },
  };
}

describe("the facts read again", () => {
  it("are the fixed fallbacks with the book's tiers while nothing is saved, as the routes state them", async () => {
    const facts = await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain();

    expect(facts?.state).toEqual({
      revision: "0",
      availabilityRevision: await availabilityHead(),
      saved: false,
      defaults: FIXED_DEFAULTS,
    });
    expect(facts?.materials.map(({ tierId }) => tierId)).toContain(
      VENEER.tierId,
    );
    expect(facts?.disabled).toEqual([]);
  });

  it("name what is switched off, from the head the defaults were read at", async () => {
    await switchItem(cookie ?? "", VENEER, false);

    const facts = await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain();

    expect(facts?.disabled).toEqual([VENEER]);
    expect(facts?.state.availabilityRevision).toBe(await availabilityHead());
  });

  it("are nothing when an item is switched between the two reads: the heads differ and they are never joined", async () => {
    afterDefaultsRead = async () => {
      afterDefaultsRead = () => Promise.resolve();
      await switchItem(cookie ?? "", VENEER, false);
    };

    const facts = await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain();

    expect(facts).toBeUndefined();
    expect(await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain()).toBeDefined();
  });

  it("are nothing for a caller who is not an administrator", async () => {
    cookie = (await signedInAs({ role: "operator" })).session.cookie;

    expect(await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain()).toBeUndefined();
  });
});

describe("a save", () => {
  it("is saved, and the next read states the saved whole and the revisions the save answered", async () => {
    const request = await saveRequestFromFacts({
      materialTierId: VENEER.tierId,
      finish: paletteFinish("veneer.stejar"),
    });

    const outcome = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);

    expect(outcome.kind).toBe("saved");
    const facts = await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain();
    expect(facts?.state.saved).toBe(true);
    expect(facts?.state.defaults.materialTierId).toBe(VENEER.tierId);
    if (outcome.kind === "saved") {
      expect(facts?.state.revision).toBe(outcome.saved.revision);
      expect(facts?.state.availabilityRevision).toBe(
        outcome.saved.availabilityRevision,
      );
    }
  });

  it("is a conflict when the defaults moved since the page read them", async () => {
    const staleRequest = await saveRequestFromFacts({ handle: "black" });
    await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(
      await saveRequestFromFacts({ topRowHandle: "black" }),
    );

    const outcome = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(staleRequest);

    expect(outcome).toEqual({ kind: "conflict" });
  });

  it("is a conflict when an item was switched since the page read the head", async () => {
    const request = await saveRequestFromFacts({ handle: "black" });
    await switchItem(cookie ?? "", VENEER, false);

    const outcome = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);

    expect(outcome).toEqual({ kind: "conflict" });
  });

  it("names the item when a value is an item that is switched off", async () => {
    const request = await saveRequestFromFacts({
      materialTierId: VENEER.tierId,
      finish: paletteFinish("veneer.stejar"),
    });
    const head = await availabilityHead();
    await switchItem(cookie ?? "", VENEER, false);

    const outcome = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save({
      ...request,
      expectedAvailabilityRevision: await availabilityHead(),
    });

    expect(head).not.toBe(await availabilityHead());
    expect(outcome).toEqual({ kind: "item-unavailable", item: VENEER });
  });

  it("is invalid, naming the row, when a depth is one nobody manufactures", async () => {
    const request = await saveRequestFromFacts({ cabinetDepthMm: 650 });

    const outcome = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);

    expect(outcome).toEqual({
      kind: "invalid",
      issues: [{ field: "cabinetDepthMm", code: "UNKNOWN_VALUE" }],
    });
  });

  it("is failed when the body is a request the route does not read", async () => {
    const outcome = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save({
      ...(await saveRequestFromFacts()),
      extra: true,
    } as KitchenDefaultsSaveRequestWire);

    expect(outcome).toEqual({ kind: "failed" });
  });

  it("is failed for an operator, who may not save, and for a caller with no session", async () => {
    const request = await saveRequestFromFacts();
    cookie = (await signedInAs({ role: "operator" })).session.cookie;
    const asOperator = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);
    cookie = undefined;
    const withNoSession = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);

    expect([asOperator, withNoSession]).toEqual([
      { kind: "failed" },
      { kind: "failed" },
    ]);
  });
});
