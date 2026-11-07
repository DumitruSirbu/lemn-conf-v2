// The fetching defaults client asks the defaults route as it is written: the address, a JSON body and the origin the
// route's guard reads, with every answer sorted into the stand-in's own outcome kinds. An answer is believed only when it is
// the route's: a body that is not, a `401` and a `409` of a word the screen does not know are `failed`. The facts are read
// again from two routes and joined only when they state one availability head.
import { afterEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK, type ItemRef } from "@lemnaria/configurator-domain";

import { defaultKitchenDefaultsClient } from "@/price-dashboard/default-kitchen-defaults-client";
import {
  defaultsSaveOutcomeOf,
  FETCHING_KITCHEN_DEFAULTS_CLIENT,
} from "@/price-dashboard/fetching-kitchen-defaults-client";
import { SAMPLE_KITCHEN_DEFAULTS } from "@/price-dashboard/kitchen-defaults-sample";
import {
  DEFAULTS_REFUSAL_CODES,
  type KitchenDefaultsSaveRequestWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

import { stateOf } from "./dashboard-state-fixture";

const DEFAULTS_ADDRESS = "/api/staff/prices/defaults";
const STATE_ADDRESS = "/api/staff/prices";
const HEAD_OF_BOTH = "4";

const A_SAVE: KitchenDefaultsSaveRequestWire = {
  expectedRevision: "2",
  expectedAvailabilityRevision: HEAD_OF_BOTH,
  defaults: SAMPLE_KITCHEN_DEFAULTS.state.defaults,
};

const DEFAULTS_BODY = {
  revision: "2",
  availabilityRevision: HEAD_OF_BOTH,
  saved: true,
  defaults: SAMPLE_KITCHEN_DEFAULTS.state.defaults,
};

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("a save", () => {
  it("goes to the defaults route as a PUT of the request as it is, stating the same origin", async () => {
    const fetchStub = vi.fn(() =>
      Promise.resolve(
        respond(200, { revision: "3", availabilityRevision: "5" }),
      ),
    );
    vi.stubGlobal("fetch", fetchStub);

    const outcome = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(A_SAVE);

    expect(outcome).toEqual({
      kind: "saved",
      saved: { revision: "3", availabilityRevision: "5" },
    });
    const [address, init] = fetchStub.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(address).toBe(DEFAULTS_ADDRESS);
    expect(init.method).toBe("PUT");
    expect(init.referrerPolicy).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual(A_SAVE);
  });

  it("is failed when the request cannot be made at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("network"))),
    );

    expect(await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(A_SAVE)).toEqual({
      kind: "failed",
    });
  });
});

describe("the answers of the defaults route to a save", () => {
  const RACK: ItemRef = { kind: "accessory", accessoryId: "drying-rack" };
  const unavailable = (item: unknown) => ({
    status: "item-unavailable",
    item,
  });
  const refusedWith = (field: string, code: string) => ({
    status: "invalid-input",
    issues: [{ field, code }],
  });

  it.each([
    [
      "200 with both revisions",
      200,
      { revision: "3", availabilityRevision: "5" },
      "saved",
    ],
    [
      "200 with a revision that is not one",
      200,
      { revision: "-1", availabilityRevision: "5" },
      "failed",
    ],
    ["200 with a revision missing", 200, { revision: "3" }, "failed"],
    ["200 with no body", 200, undefined, "failed"],
    [
      "400 naming a row",
      400,
      refusedWith("finish", "FINISH_NOT_IN_PALETTE"),
      "invalid",
    ],
    [
      "400 naming a row with a code the route has not got",
      400,
      refusedWith("finish", "NO_SUCH_CODE"),
      "failed",
    ],
    [
      "400 naming a member the defaults route has not got",
      400,
      refusedWith("percent", "MISSING_VALUE"),
      "failed",
    ],
    [
      "400 invalid-request, which names no member",
      400,
      { status: "invalid-request" },
      "failed",
    ],
    [
      "400 with no issues",
      400,
      { status: "invalid-input", issues: [] },
      "failed",
    ],
    [
      "409 item-unavailable of a material",
      409,
      unavailable({ kind: "material", tierId: "material.veneer" }),
      "item-unavailable",
    ],
    [
      "409 item-unavailable of a hardware tier",
      409,
      unavailable({ kind: "hardware", tierId: "hardware.premium" }),
      "item-unavailable",
    ],
    [
      "409 item-unavailable of a handle",
      409,
      unavailable({ kind: "handle", handle: "black" }),
      "item-unavailable",
    ],
    [
      "409 item-unavailable of a colour",
      409,
      unavailable({ kind: "finish", finishId: "pal.alb" }),
      "item-unavailable",
    ],
    [
      "409 item-unavailable of a handle that does not exist",
      409,
      unavailable({ kind: "handle", handle: "gold" }),
      "failed",
    ],
    [
      "409 item-unavailable of a kind that does not exist",
      409,
      unavailable({ kind: "cabinet", cabinetId: "x" }),
      "failed",
    ],
    [
      "409 item-unavailable naming no item",
      409,
      { status: "item-unavailable" },
      "failed",
    ],
    ["409 changed-meanwhile", 409, { status: "changed-meanwhile" }, "conflict"],
    [
      "409 availability-changed-meanwhile",
      409,
      { status: "availability-changed-meanwhile" },
      "conflict",
    ],
    ["409 no-active-version", 409, { status: "no-active-version" }, "failed"],
    ["409 of a word nobody knows", 409, { status: "surprise" }, "failed"],
    ["401", 401, { status: "unauthenticated" }, "failed"],
    ["403", 403, { status: "forbidden" }, "failed"],
    ["429", 429, { status: "rate-limited" }, "failed"],
    ["503", 503, { status: "unavailable" }, "failed"],
    ["500 with no body", 500, undefined, "failed"],
  ])("%s is %s", (_name, status, body, kind) => {
    expect(defaultsSaveOutcomeOf({ status, body }).kind).toBe(kind);
  });

  it("carries every code the route has for a malformed value, member by member", () => {
    for (const code of DEFAULTS_REFUSAL_CODES) {
      expect(
        defaultsSaveOutcomeOf({
          status: 400,
          body: refusedWith("cabinetDepthMm", code),
        }),
      ).toEqual({
        kind: "invalid",
        issues: [{ field: "cabinetDepthMm", code }],
      });
    }
  });

  it("rebuilds the unavailable item from its kind and its one id, whatever else the body says", () => {
    const outcome = defaultsSaveOutcomeOf({
      status: 409,
      body: unavailable({ ...RACK, name: "STORED-JUNK-4471" }),
    });

    expect(outcome).toEqual({ kind: "item-unavailable", item: RACK });
  });
});

describe("the facts read again", () => {
  /** Answers each address as the routes do, and states the order the addresses were asked in. */
  function stubRoutes(answers: {
    defaults?: () => Response;
    state?: () => Response;
  }): string[] {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((address: string) => {
        asked.push(address);
        if (address === DEFAULTS_ADDRESS) {
          return Promise.resolve(
            answers.defaults?.() ?? respond(200, DEFAULTS_BODY),
          );
        }
        return Promise.resolve(
          answers.state?.() ?? respond(200, stateAtHead(HEAD_OF_BOTH)),
        );
      }),
    );
    return asked;
  }

  function stateAtHead(revision: string, disabled: readonly ItemRef[] = []) {
    const state = stateOf();
    return {
      ...state,
      active: { ...state.active, availability: { revision, disabled } },
    };
  }

  it("reads the defaults first and then the dashboard's state, and joins them when they state one head", async () => {
    const asked = stubRoutes({});

    const input = await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain();

    expect(asked).toEqual([DEFAULTS_ADDRESS, STATE_ADDRESS]);
    expect(input?.state).toEqual(DEFAULTS_BODY);
    expect(input?.materials.map(({ tierId }) => tierId)).toEqual(
      SAMPLE_PRICE_BOOK.material.tiers.map(({ tierId }) => tierId),
    );
    expect(input?.hardware.map(({ tierId }) => tierId)).toEqual(
      SAMPLE_PRICE_BOOK.hardware.tiers.map(({ tierId }) => tierId),
    );
    expect(input?.disabled).toEqual([]);
  });

  it("takes what is switched off from the state's availability", async () => {
    const veneer: ItemRef = { kind: "material", tierId: "material.veneer" };
    stubRoutes({
      state: () => respond(200, stateAtHead(HEAD_OF_BOTH, [veneer])),
    });

    const input = await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain();

    expect(input?.disabled).toEqual([veneer]);
  });

  it("answers nothing when the two reads state different heads, and never joins them", async () => {
    stubRoutes({ state: () => respond(200, stateAtHead("5")) });

    expect(await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain()).toBeUndefined();
  });

  it.each([
    [
      "the defaults are refused",
      { defaults: () => respond(503, { status: "unavailable" }) },
    ],
    [
      "the defaults are a conflict (no published version)",
      { defaults: () => respond(409, { status: "no-active-version" }) },
    ],
    [
      "the defaults lack a row",
      {
        defaults: () =>
          respond(200, {
            ...DEFAULTS_BODY,
            defaults: { ...DEFAULTS_BODY.defaults, handle: undefined },
          }),
      },
    ],
    [
      "the defaults hold a handle that does not exist",
      {
        defaults: () =>
          respond(200, {
            ...DEFAULTS_BODY,
            defaults: { ...DEFAULTS_BODY.defaults, handle: "gold" },
          }),
      },
    ],
    [
      "the defaults state a revision that is not one",
      { defaults: () => respond(200, { ...DEFAULTS_BODY, revision: "x" }) },
    ],
    [
      "the defaults say saved with a word",
      { defaults: () => respond(200, { ...DEFAULTS_BODY, saved: "yes" }) },
    ],
    [
      "the state is refused",
      { state: () => respond(503, { status: "unavailable" }) },
    ],
    [
      "the state is no state",
      { state: () => respond(200, { surprise: true }) },
    ],
    [
      "the state names a switched-off item that is not an item",
      {
        state: () =>
          respond(
            200,
            stateAtHead(HEAD_OF_BOTH, [{ kind: "cabinet" } as never]),
          ),
      },
    ],
  ])("answers nothing when %s", async (_name, answers) => {
    stubRoutes(answers);

    expect(await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain()).toBeUndefined();
  });

  it("asks for the state only after the defaults have been read", async () => {
    const asked = stubRoutes({ defaults: () => respond(503) });

    await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain();

    expect(asked).toEqual([DEFAULTS_ADDRESS]);
  });

  it("answers nothing when a request cannot be made", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("network"))),
    );

    expect(await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain()).toBeUndefined();
  });
});

describe("the client a screen is given when none is handed in", () => {
  it("is the fetching client in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(defaultKitchenDefaultsClient(SAMPLE_KITCHEN_DEFAULTS)).toBe(
      FETCHING_KITCHEN_DEFAULTS_CLIENT,
    );
  });

  it("is a stand-in that asks no server in any other build", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);

    const client = defaultKitchenDefaultsClient(SAMPLE_KITCHEN_DEFAULTS);
    const outcome = await client.save({
      ...A_SAVE,
      expectedRevision: SAMPLE_KITCHEN_DEFAULTS.state.revision,
      expectedAvailabilityRevision:
        SAMPLE_KITCHEN_DEFAULTS.state.availabilityRevision,
    });

    expect(client).not.toBe(FETCHING_KITCHEN_DEFAULTS_CLIENT);
    expect(outcome.kind).toBe("saved");
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
