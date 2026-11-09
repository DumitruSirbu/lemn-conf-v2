import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AVAILABILITY_REFUSAL_CODES,
  HARDWARE_RATE_FIELDS,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { DELETE, PUT } from "@/app/api/staff/prices/draft/route";
import { GET } from "@/app/api/staff/prices/route";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { DASHBOARD_CONFLICTS } from "@/price-dashboard/price-dashboard-wire-contract";
import {
  FETCHING_PRICE_DRAFT_CLIENT,
  type DraftChangeOutcome,
} from "@/price-dashboard/price-draft-client";

import {
  accountRequest,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import { currentDraftRevision } from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
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

// The hardware screens' writes against the routes as they are in the tree. The screens' DOM tests write through
// `inMemoryPriceDraftClient`, which calls `applyChanges` itself, so none of them reaches the boundary reader that turns
// a request into a change. Here the fetching client (the one a browser has) is run over a `fetch` that is the real
// `PUT` and `DELETE` of `/api/staff/prices/draft`, over the persistence package's price-book fake, and the bodies are
// the ones the hardware screens send. R4a is not built (no `/api/staff/prices/availability` and no usage route exist,
// and `draft-address.ts` reads only the applied kinds): a test below marked `it.fails` is a promise of the screens'
// port that no route keeps yet. It runs and goes red the moment R4a keeps it; R4a flips each to `it`.

let prices: PriceDashboardWorld;
let cookie: string;
let sessionTokenHash: string;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  cookie = session.cookie;
  sessionTokenHash = session.tokenHash;
  vi.stubGlobal("fetch", answerFromTheRoutes);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const NETWORK = { "x-forwarded-for": "192.0.2.10" };

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
  if (address === "/api/staff/prices") return GET(request);
  return new Response(null, { status: 404 });
}

const SOFT_CLOSE = { kind: "hardware", tierId: "hardware.soft-close" } as const;

describe("the write that deletes a held class (the hardware screens' `deleteFromDraft`)", () => {
  it("is taken by the draft route, so the confirmation of an unused class's deletion can succeed", async () => {
    const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await currentDraftRevision(),
      change: {
        address: { kind: "item-deleted", item: SOFT_CLOSE },
        value: true,
      },
    });

    expect(outcome.kind).toBe("changed");
  });
});

describe("the write that creates a class (the creation form's `createHardwareClass`)", () => {
  it("has a client method in the browser's client, so the form can create anything at all", () => {
    expect(FETCHING_PRICE_DRAFT_CLIENT.createHardwareClass).toBeTypeOf(
      "function",
    );
  });

  it("is not smuggled through the change route: a creation as a change is refused, so the screens' optional method stays honest", async () => {
    const outcome = await FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await currentDraftRevision(),
      change: {
        address: {
          kind: "hardware-tier-created",
          tierId: "hardware.chosen-by-the-client",
        },
        value: { name: "GTV Economic", description: "" },
      },
    } as never);

    expect(outcome.kind).toBe("refused");
    expect((await prices.stores.priceBook.readDraft()).changes).toEqual([]);
  });
});

describe("the revert that takes a class only the draft holds back out (`deleteFromDraft` for a created class)", () => {
  const CREATION: readonly DraftChange[] = [
    {
      address: { kind: "hardware-tier-created", tierId: "hardware.economic" },
      value: { name: "GTV Economic", description: "" },
    },
    ...HARDWARE_RATE_FIELDS.map(
      (field): DraftChange => ({
        address: { kind: "hardware", tierId: "hardware.economic", field },
        value: 2_000,
      }),
    ),
  ];

  it("is read by the draft route's revert reader: a target naming the creation is not refused as an address the route does not apply", async () => {
    const answer = await DELETE(
      accountRequest("/api/staff/prices/draft", {
        method: "DELETE",
        cookie,
        headers: NETWORK,
        json: {
          expectedDraftRevision: await currentDraftRevision(),
          target: { kind: "change", address: CREATION[0]?.address },
        },
      }),
    );

    // The stored draft is empty here, so once the reader takes the address the answer is the route's "nothing to remove"
    // (an unknown address), not a success: only the reader's own refusal of the kind is what must not be answered.
    expect(await jsonOf(answer)).not.toEqual({
      status: "invalid-input",
      issues: [{ field: "address", code: "NOT_EDITABLE" }],
    });
  });
});

describe("the write that renames a class the draft created (the class page's rename)", () => {
  const CREATED_TIER = "hardware.economic";
  const CREATION: readonly DraftChange[] = [
    {
      address: { kind: "hardware-tier-created", tierId: CREATED_TIER },
      value: { name: "GTV Economic", description: "" },
    },
    ...HARDWARE_RATE_FIELDS.map(
      (field): DraftChange => ({
        address: { kind: "hardware", tierId: CREATED_TIER, field },
        value: 2_000,
      }),
    ),
  ];

  const RENAME: DraftChange = {
    address: {
      kind: "created-row-text",
      item: { kind: "hardware", tierId: CREATED_TIER },
      field: "name",
    },
    value: "GTV Premium",
  };

  async function storeCreatedClass(
    changes: readonly DraftChange[] = CREATION,
  ): Promise<void> {
    const written = await prices.priceBook.writeDraft({
      expectedDraftRevision: await currentDraftRevision(),
      changes,
      audit: {
        session: {
          sessionTokenHash,
          idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
        },
        entry: {
          action: "price-draft-changed",
          detail: { changeKind: "provisional" },
        },
      },
    });
    if (written.kind !== "ok") throw new Error("seed: the draft not written");
  }

  async function renameTheClass(): Promise<DraftChangeOutcome> {
    return FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: await currentDraftRevision(),
      change: {
        address: {
          kind: "created-row-text",
          item: { kind: "hardware", tierId: CREATED_TIER },
          field: "name",
        },
        value: "GTV Premium",
      },
    });
  }

  it("is taken by the draft route, so the rename on a created class's page can succeed", async () => {
    await storeCreatedClass();

    const outcome = await renameTheClass();

    expect(outcome.kind).toBe("changed");
  });

  // Naming the published name again sends a revert, not a change.
  it("a revert of a created-row-text change is taken by the route, so a name typed back leaves nothing in the draft", async () => {
    await storeCreatedClass([...CREATION, RENAME]);

    const answer = await DELETE(
      accountRequest("/api/staff/prices/draft", {
        method: "DELETE",
        cookie,
        headers: NETWORK,
        json: {
          expectedDraftRevision: await currentDraftRevision(),
          target: { kind: "change", address: RENAME.address },
        },
      }),
    );

    expect(answer.status).toBe(200);
  });

  it("is declared by the browser's client, so the page offers the rename at all", () => {
    expect(FETCHING_PRICE_DRAFT_CLIENT.acceptsCreatedRowText).toBe(true);
  });
});

describe("what the draft client does with the 409s the real routes can answer", () => {
  const respondingWith = (status: number, body: unknown) => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(JSON.stringify(body), { status })),
    );
  };
  const aRateWrite = async () =>
    FETCHING_PRICE_DRAFT_CLIENT.change({
      expectedDraftRevision: "1",
      change: {
        address: {
          kind: "hardware",
          tierId: "hardware.soft-close",
          field: "perLiftMinor",
        },
        value: 1_000,
      },
    });

  it.each([
    "draft-unreadable",
    "no-active-version",
    "item-in-use",
    "item-is-default",
  ])(
    "reads a 409 %s as a write that failed, never as a write that was made or a conflict to retry on",
    async (status) => {
      respondingWith(409, { status });

      const outcome = await aRateWrite();

      expect(outcome).toEqual({ kind: "failed" });
    },
  );

  it("reads a 401 as the end of the session and a 200 that is not a draft as a failure", async () => {
    respondingWith(401, {});
    expect(await aRateWrite()).toEqual({ kind: "session-ended" });
    respondingWith(200, { draft: "not one" });
    expect(await aRateWrite()).toEqual({ kind: "failed" });
  });
});

describe("the refusal words of the lifecycle client's port against the wire's conflicts", () => {
  it("has every word the domain refuses an availability change with, the fixed default and the always-present accessory included", () => {
    const wireWords: readonly string[] = DASHBOARD_CONFLICTS;

    expect(
      AVAILABILITY_REFUSAL_CODES.filter((code) => !wireWords.includes(code)),
    ).toEqual([]);
  });
});
