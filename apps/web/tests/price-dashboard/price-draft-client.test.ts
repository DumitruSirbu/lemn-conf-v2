// The fetching client asks the dashboard's routes as they are written: the method and the address, a JSON body, the
// origin the routes' cross-site guard reads, and the answer sorted into the closed outcomes. An answer that is not one
// of the routes' own is `failed`, and nothing it carries is believed.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readDashboardStateWire,
  readDraftChangeCreatedWire,
  readDraftWire,
} from "@/price-dashboard/price-dashboard-wire-reading";
import { FETCHING_PRICE_DRAFT_CLIENT } from "@/price-dashboard/price-draft-client";

import { stateOf } from "./dashboard-state-fixture";

const DRAFT = { draftRevision: "7", changes: [] };
const CHANGE_REQUEST = {
  expectedDraftRevision: "6",
  change: { address: { kind: "depth-rule" as const }, value: 18 },
};

/** The JSON a request carried. */
function bodyOf(init: RequestInit | undefined): unknown {
  return JSON.parse((init?.body ?? "null") as string);
}

function stubFetch(status: number, body?: unknown) {
  const fetchStub = vi.fn<
    (address: string, init: RequestInit) => Promise<Response>
  >(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what is sent", () => {
  it("puts a change to the draft's address as JSON, stating the origin", async () => {
    const fetchStub = stubFetch(200, DRAFT);

    await FETCHING_PRICE_DRAFT_CLIENT.change(CHANGE_REQUEST);

    const [address, init] = fetchStub.mock.calls[0] ?? [];
    expect(address).toBe("/api/staff/prices/draft");
    expect(init).toMatchObject({
      method: "PUT",
      headers: { "content-type": "application/json" },
      referrerPolicy: "same-origin",
    });
    expect(bodyOf(init)).toEqual(CHANGE_REQUEST);
  });

  it("deletes through the draft's address with the target in the body", async () => {
    const fetchStub = stubFetch(200, DRAFT);
    const request = {
      expectedDraftRevision: "6",
      target: {
        kind: "change" as const,
        address: { kind: "depth-rule" as const },
      },
    };

    await FETCHING_PRICE_DRAFT_CLIENT.revert(request);

    const [address, init] = fetchStub.mock.calls[0] ?? [];
    expect([address, init?.method]).toEqual([
      "/api/staff/prices/draft",
      "DELETE",
    ]);
    expect(bodyOf(init)).toEqual(request);
  });

  it("posts a bulk action to its own address", async () => {
    const fetchStub = stubFetch(200, {
      draft: DRAFT,
      ruleCount: 2,
      amountCount: 5,
    });
    const request = {
      expectedDraftRevision: "6",
      target: { scope: "all" as const },
      percent: 5,
    };

    await FETCHING_PRICE_DRAFT_CLIENT.bulk(request);

    const [address, init] = fetchStub.mock.calls[0] ?? [];
    expect([address, init?.method]).toEqual(["/api/staff/prices/bulk", "POST"]);
    expect(bodyOf(init)).toEqual(request);
  });

  it("reads the state with a GET that sends no referrer and no body", async () => {
    const fetchStub = stubFetch(200, stateOf());

    await FETCHING_PRICE_DRAFT_CLIENT.readState();

    const [address, init] = fetchStub.mock.calls[0] ?? [];
    expect(address).toBe("/api/staff/prices");
    expect(init).toMatchObject({
      method: "GET",
      referrerPolicy: "no-referrer",
    });
    expect(init?.body).toBeUndefined();
  });
});

describe("what an answer comes to", () => {
  it("is the draft the route sent, for a 200", async () => {
    stubFetch(200, DRAFT);

    expect(await FETCHING_PRICE_DRAFT_CLIENT.change(CHANGE_REQUEST)).toEqual({
      kind: "changed",
      written: DRAFT,
    });
  });

  it("is the bulk counts with the draft, for a 200 of a bulk action", async () => {
    const written = { draft: DRAFT, ruleCount: 2, amountCount: 5 };
    stubFetch(200, written);

    expect(
      await FETCHING_PRICE_DRAFT_CLIENT.bulk({
        expectedDraftRevision: "6",
        target: { scope: "all" },
        percent: 5,
      }),
    ).toEqual({ kind: "changed", written });
  });

  it.each([
    [
      400,
      {
        status: "invalid-input",
        issues: [{ field: "change", code: "NEGATIVE" }],
      },
      { kind: "refused", code: "NEGATIVE" },
    ],
    [401, { status: "unauthenticated" }, { kind: "session-ended" }],
    [409, { status: "changed-meanwhile" }, { kind: "conflict" }],
    [409, { status: "candidate-refused" }, { kind: "candidate-refused" }],
    [
      409,
      { status: "draft-unreadable", draftRevision: "1" },
      { kind: "failed" },
    ],
    [403, undefined, { kind: "failed" }],
    [429, undefined, { kind: "failed" }],
    [503, undefined, { kind: "failed" }],
    [400, { status: "invalid-input" }, { kind: "failed" }],
    [400, undefined, { kind: "failed" }],
  ])("is %i with %j: %j", async (status, body, outcome) => {
    stubFetch(status, body);

    expect(await FETCHING_PRICE_DRAFT_CLIENT.change(CHANGE_REQUEST)).toEqual(
      outcome,
    );
  });

  it.each([
    ["a code no route has", "NOT_A_CODE"],
    [
      "a code of the bulk route, sent by the draft route",
      "NO_CABINETS_SELECTED",
    ],
    ["a member's name in place of a code", "__proto__"],
  ])("is failed for a 400 naming %s", async (_name, code) => {
    stubFetch(400, {
      status: "invalid-input",
      issues: [{ field: "change", code }],
    });

    expect(await FETCHING_PRICE_DRAFT_CLIENT.change(CHANGE_REQUEST)).toEqual({
      kind: "failed",
    });
    expect(
      await FETCHING_PRICE_DRAFT_CLIENT.revert({
        expectedDraftRevision: "6",
        target: { kind: "change", address: { kind: "depth-rule" } },
      }),
    ).toEqual({ kind: "failed" });
  });

  it("reads a 400 of the bulk route against the bulk route's codes, and no other", async () => {
    const bulk = {
      expectedDraftRevision: "6",
      target: { scope: "all" as const },
      percent: 5,
    };
    stubFetch(400, {
      issues: [{ field: "percent", code: "PERCENT_OUT_OF_RANGE" }],
    });
    expect(await FETCHING_PRICE_DRAFT_CLIENT.bulk(bulk)).toEqual({
      kind: "refused",
      code: "PERCENT_OUT_OF_RANGE",
    });

    stubFetch(400, { issues: [{ field: "percent", code: "NEGATIVE" }] });
    expect(await FETCHING_PRICE_DRAFT_CLIENT.bulk(bulk)).toEqual({
      kind: "failed",
    });
  });

  it.each([
    ["a body that is not a draft", { draftRevision: 7, changes: [] }],
    ["changes that are not an array", { draftRevision: "7", changes: {} }],
    [
      "a change with no address",
      { draftRevision: "7", changes: [{ value: 1 }] },
    ],
  ])(
    "is failed for a 200 with %s: a draft that cannot be read is never adopted",
    async (_name, body) => {
      stubFetch(200, body);

      expect(await FETCHING_PRICE_DRAFT_CLIENT.change(CHANGE_REQUEST)).toEqual({
        kind: "failed",
      });
    },
  );

  it("is failed when the request cannot be made at all", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));

    expect(await FETCHING_PRICE_DRAFT_CLIENT.change(CHANGE_REQUEST)).toEqual({
      kind: "failed",
    });
    expect(await FETCHING_PRICE_DRAFT_CLIENT.readState()).toBeUndefined();
  });

  it("reads no state from a refusal, nor from a body that is not one", async () => {
    stubFetch(503);
    expect(await FETCHING_PRICE_DRAFT_CLIENT.readState()).toBeUndefined();

    stubFetch(200, { active: {}, draft: DRAFT });
    expect(await FETCHING_PRICE_DRAFT_CLIENT.readState()).toBeUndefined();
  });

  it("reads the state a 200 holds, as the route sent it", async () => {
    const state = stateOf();
    stubFetch(200, state);

    expect(await FETCHING_PRICE_DRAFT_CLIENT.readState()).toEqual(state);
  });
});

describe("the readers", () => {
  it("take a state and a draft as the wire has them, and nothing that only looks like one", () => {
    expect(readDashboardStateWire(stateOf())).toEqual(stateOf());
    expect(readDraftWire(DRAFT)).toEqual(DRAFT);
    for (const hostile of [undefined, null, 7, "state", [], {}]) {
      expect(readDashboardStateWire(hostile)).toBeUndefined();
      expect(readDraftWire(hostile)).toBeUndefined();
    }
  });
});

describe("the readers keep only the members the wire declares", () => {
  const ANCHOR = {
    kind: "cabinet" as const,
    ruleId: "cabinet.base-cabinet",
    field: "anchorMinor" as const,
  };
  const BULK = { percent: 5, scope: "group" as const, groupCode: "base" };

  it("hands on a change's address, value, group and bulk, and nothing else the answer carried", () => {
    const draft = readDraftWire({
      draftRevision: "7",
      editor: "editor@example.test",
      changes: [
        {
          address: ANCHOR,
          value: 400_000,
          groupId: "group-1",
          bulk: { ...BULK, author: "author@example.test" },
          authorEmail: "author@example.test",
        },
      ],
    });

    expect(draft).toEqual({
      draftRevision: "7",
      changes: [
        { address: ANCHOR, value: 400_000, groupId: "group-1", bulk: BULK },
      ],
    });
  });

  it("takes a draft whose bulk action is not the shape of one as no draft", () => {
    expect(
      readDraftWire({
        draftRevision: "7",
        changes: [
          {
            address: ANCHOR,
            value: 400_000,
            groupId: "group-1",
            bulk: { percent: 5.5, scope: "all" },
          },
        ],
      }),
    ).toBeUndefined();
  });
});

describe("a creation", () => {
  const CLASS_REQUEST = {
    expectedDraftRevision: "6",
    value: { name: "GTV Economic", description: "" },
    rates: {
      perHingeMinor: 100,
      perDrawerMinor: 200,
      perPushToOpenMinor: 300,
      perLiftMinor: 400,
      perPushRunnerMinor: 500,
    },
  };
  const ACCESSORY_REQUEST = {
    expectedDraftRevision: "6",
    value: {
      linkedBuildId: "base-3drawer",
      perUnitMinor: 1_000,
      name: "Soclu",
    },
  };
  const CLASS_ROW = { kind: "hardware" as const, tierId: "Tier1" };
  const ACCESSORY_ROW = { kind: "accessory" as const, accessoryId: "Plinth1" };

  it("posts a class to its own address as JSON, stating the origin, once", async () => {
    const fetchStub = stubFetch(200, { draft: DRAFT, created: CLASS_ROW });

    await FETCHING_PRICE_DRAFT_CLIENT.createHardwareClass?.(CLASS_REQUEST);

    const [address, init] = fetchStub.mock.calls[0] ?? [];
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect([address, init?.method]).toEqual([
      "/api/staff/prices/draft/hardware-class",
      "POST",
    ]);
    expect(init).toMatchObject({
      headers: { "content-type": "application/json" },
      referrerPolicy: "same-origin",
    });
    expect(bodyOf(init)).toEqual(CLASS_REQUEST);
  });

  it("posts an accessory to its own address as JSON, once", async () => {
    const fetchStub = stubFetch(200, { draft: DRAFT, created: ACCESSORY_ROW });

    await FETCHING_PRICE_DRAFT_CLIENT.createAccessory?.(ACCESSORY_REQUEST);

    const [address, init] = fetchStub.mock.calls[0] ?? [];
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect([address, init?.method]).toEqual([
      "/api/staff/prices/draft/accessory",
      "POST",
    ]);
    expect(bodyOf(init)).toEqual(ACCESSORY_REQUEST);
  });

  it("is the draft and the row the server minted, for a 200", async () => {
    const written = { draft: DRAFT, created: CLASS_ROW };
    stubFetch(200, written);

    expect(
      await FETCHING_PRICE_DRAFT_CLIENT.createHardwareClass?.(CLASS_REQUEST),
    ).toEqual({ kind: "changed", written });
  });

  it.each([
    [
      400,
      {
        status: "invalid-input",
        issues: [{ field: "change", code: "ZERO" }],
      },
      { kind: "refused", code: "ZERO" },
    ],
    [
      400,
      {
        status: "invalid-input",
        issues: [{ field: "change", code: "LINK_TARGET_UNKNOWN" }],
      },
      { kind: "refused", code: "LINK_TARGET_UNKNOWN" },
    ],
    [401, { status: "unauthenticated" }, { kind: "session-ended" }],
    [409, { status: "changed-meanwhile" }, { kind: "conflict" }],
    [409, { status: "candidate-refused" }, { kind: "candidate-refused" }],
    [429, undefined, { kind: "failed" }],
    [503, undefined, { kind: "failed" }],
  ])(
    "sorts %i with %j as %j, for either creation",
    async (status, body, outcome) => {
      stubFetch(status, body);
      expect(
        await FETCHING_PRICE_DRAFT_CLIENT.createHardwareClass?.(CLASS_REQUEST),
      ).toEqual(outcome);

      stubFetch(status, body);
      expect(
        await FETCHING_PRICE_DRAFT_CLIENT.createAccessory?.(ACCESSORY_REQUEST),
      ).toEqual(outcome);
    },
  );

  it("is failed, and sends nothing again, when the answer is lost", async () => {
    const fetchStub = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchStub);

    const outcome =
      await FETCHING_PRICE_DRAFT_CLIENT.createHardwareClass?.(CLASS_REQUEST);

    expect(outcome).toEqual({ kind: "failed" });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("is failed for a 200 that names a row of the other kind, which is no answer to this route", async () => {
    stubFetch(200, { draft: DRAFT, created: ACCESSORY_ROW });
    expect(
      await FETCHING_PRICE_DRAFT_CLIENT.createHardwareClass?.(CLASS_REQUEST),
    ).toEqual({ kind: "failed" });

    stubFetch(200, { draft: DRAFT, created: CLASS_ROW });
    expect(
      await FETCHING_PRICE_DRAFT_CLIENT.createAccessory?.(ACCESSORY_REQUEST),
    ).toEqual({ kind: "failed" });
  });

  it("is failed for a 200 with no draft or no created row", async () => {
    stubFetch(200, { created: CLASS_ROW });
    expect(
      await FETCHING_PRICE_DRAFT_CLIENT.createHardwareClass?.(CLASS_REQUEST),
    ).toEqual({ kind: "failed" });

    stubFetch(200, { draft: DRAFT });
    expect(
      await FETCHING_PRICE_DRAFT_CLIENT.createHardwareClass?.(CLASS_REQUEST),
    ).toEqual({ kind: "failed" });
  });
});

describe("the reader of a creation's answer", () => {
  it("keeps the draft and the one id of the row, and nothing else the answer carried", () => {
    expect(
      readDraftChangeCreatedWire({
        draft: { draftRevision: "7", changes: [], editor: "x@example.test" },
        created: { kind: "hardware", tierId: "Tier1", ruleId: "leak" },
        author: "x@example.test",
      }),
    ).toEqual({
      draft: { draftRevision: "7", changes: [] },
      created: { kind: "hardware", tierId: "Tier1" },
    });
    expect(
      readDraftChangeCreatedWire({
        draft: DRAFT,
        created: { kind: "accessory", accessoryId: "Plinth1" },
      })?.created,
    ).toEqual({ kind: "accessory", accessoryId: "Plinth1" });
  });

  it.each([
    ["nothing", undefined],
    [
      "a created row of a kind that is never created",
      { draft: DRAFT, created: { kind: "material", tierId: "t" } },
    ],
    [
      "a created row with no id",
      { draft: DRAFT, created: { kind: "hardware" } },
    ],
    [
      "a created row whose id is not text",
      { draft: DRAFT, created: { kind: "hardware", tierId: 7 } },
    ],
    [
      "a created row that names the wrong id member",
      { draft: DRAFT, created: { kind: "hardware", accessoryId: "a" } },
    ],
    [
      "a draft that cannot be read",
      {
        draft: { draftRevision: 7, changes: [] },
        created: { kind: "hardware", tierId: "t" },
      },
    ],
  ])("reads %s as no answer", (_, body) => {
    expect(readDraftChangeCreatedWire(body)).toBeUndefined();
  });
});
