import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REQUEST_STATUSES } from "@lemnaria/configurator-domain";

import { designNotFoundResponse } from "@/lib/server/design-errors";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  wireOf,
  type AccountWorld,
} from "../../../support/account-world";
import {
  freshStaffActionsWorld,
  plantActionKitchen,
  signedInStaffNamed,
  statusRequest,
  type StaffActionsWorld,
} from "../../../support/staff-actions-world";
import { freshStaffWorld, type StaffWorld } from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-kitchen-actions-store-instance", () =>
  import("../../../support/staff-actions-world").then((world) =>
    world.staffKitchenActionsStoreModule(),
  ),
);

const route = await import("@/app/api/staff/kitchens/[id]/status/route");
const { PUT } = route;

/**
 * `PUT /api/staff/kitchens/{id}/status` (ADR 0173). Each answer of the store maps to the one
 * the port documents: saved and unchanged are `200`, a status that cannot be saved is a `409` with a word, and a
 * kitchen staff cannot see gets the one refusal.
 */

let world: AccountWorld;
let staffWorld: StaffWorld;
let actions: StaffActionsWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(() => {
  world = freshAccountWorld();
  staffWorld = freshStaffWorld();
  actions = freshStaffActionsWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const OPERATOR_EMAIL = "operator@example.test";
const OPERATOR_NAME = "Olga Operator";
const ISO_INSTANT = /^\d{4}-\d\d-\d\dT.*Z$/;

async function signedInOperator(email = OPERATOR_EMAIL, name = OPERATOR_NAME) {
  return signedInStaffNamed({ role: "operator" }, email, name);
}

async function setStatus(
  id: string,
  cookie: string,
  json: unknown,
  init: Parameters<typeof statusRequest>[1] = {},
) {
  return PUT(statusRequest(id, { cookie, json, ...init }), {
    params: Promise.resolve({ id }),
  });
}

function heldEvents() {
  return staffWorld.audit.heldEvents();
}

describe("a status that is saved", () => {
  it("is answered 200 with the status, who set it and when, field by field and without an account id", async () => {
    const { session, account } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await setStatus(id, session.cookie, {
      status: "contacted",
      from: "new",
    });

    expect(answer.status).toBe(200);
    const body = (await jsonOf(answer)) as { changedAt: string };
    expect(Object.keys(body).sort()).toEqual([
      "changedAt",
      "changedBy",
      "status",
    ]);
    expect(body.changedAt).toMatch(ISO_INSTANT);
    expect(body).toEqual({
      status: "contacted",
      changedBy: { email: OPERATOR_EMAIL, name: OPERATOR_NAME },
      changedAt: body.changedAt,
    });
    expect(JSON.stringify(body)).not.toContain(account.id);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
  });

  it("writes one audit row naming the status it replaced and the one it set", async () => {
    const { session, account } = await signedInOperator();
    const { id } = plantActionKitchen();

    await setStatus(id, session.cookie, { status: "contacted", from: "new" });
    await setStatus(id, session.cookie, {
      status: "offer-sent",
      from: "contacted",
    });

    expect(
      heldEvents().map(({ action, detail, actorAccountId, designId }) => ({
        action,
        detail,
        actorAccountId,
        designId,
      })),
    ).toEqual([
      {
        action: "status-changed",
        detail: { from: "new", to: "contacted" },
        actorAccountId: account.id,
        designId: id,
      },
      {
        action: "status-changed",
        detail: { from: "contacted", to: "offer-sent" },
        actorAccountId: account.id,
        designId: id,
      },
    ]);
  });

  it.each(
    REQUEST_STATUSES.flatMap((from) =>
      REQUEST_STATUSES.map((to) => [from, to] as const),
    ).filter(([from, to]) => from !== to),
  )(
    "lets %s be followed by %s: any status may follow any",
    async (from, to) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();
      if (from !== "new") {
        await setStatus(id, session.cookie, { status: from, from: "new" });
      }

      const answer = await setStatus(id, session.cookie, { status: to, from });

      expect(answer.status).toBe(200);
      expect(((await jsonOf(answer)) as { status: string }).status).toBe(to);
    },
  );

  it("survives the client's hide and unhide: a hidden kitchen still takes a status", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen({ isHidden: true });

    const answer = await setStatus(id, session.cookie, {
      status: "closed",
      from: "new",
    });

    expect(answer.status).toBe(200);
  });
});

describe("a status the kitchen already shows (unchanged)", () => {
  it("is 200 with the saved row and writes no second audit row", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    const first = await setStatus(id, session.cookie, {
      status: "contacted",
      from: "new",
    });

    const again = await setStatus(id, session.cookie, {
      status: "contacted",
      from: "contacted",
    });

    expect(again.status).toBe(200);
    expect(await jsonOf(again)).toEqual(await jsonOf(first));
    expect(heldEvents()).toHaveLength(1);
  });

  it("is 200 with a null last change for new on a kitchen with no saved status, and creates no row", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await setStatus(id, session.cookie, {
      status: "new",
      from: "new",
    });

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({
      status: "new",
      changedBy: null,
      changedAt: null,
    });
    expect(actions.store.heldStatus(id)).toBeUndefined();
    expect(heldEvents()).toEqual([]);
  });
});

describe("a status that cannot be saved", () => {
  it("is 409 not-sent for a draft, and writes nothing", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen({ isSent: false });

    const answer = await setStatus(id, session.cookie, {
      status: "contacted",
      from: "new",
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "not-sent" });
    expect(actions.store.heldStatus(id)).toBeUndefined();
    expect(heldEvents()).toEqual([]);
  });

  it("is 409 status-not-recognised when the stored status is outside this build's list, and nothing is read as new", async () => {
    const { session, account } = await signedInOperator();
    const { id } = plantActionKitchen();
    actions.store.plantStatus({
      designId: id,
      status: "waiting-for-supplier",
      changedByAccountId: account.id,
      changedAt: new Date("2026-10-19T10:00:00.000Z"),
    });

    const answer = await setStatus(id, session.cookie, {
      status: "new",
      from: "new",
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "status-not-recognised" });
    expect(actions.store.heldStatus(id)?.status).toBe("waiting-for-supplier");
    expect(heldEvents()).toEqual([]);
  });

  it("is 409 changed-meanwhile for the later of two saves made at once, which writes nothing and is not retried", async () => {
    const { session } = await signedInOperator();
    const other = await signedInOperator("second@example.test", "Second");
    const { id } = plantActionKitchen();

    const answers = await Promise.all([
      setStatus(id, session.cookie, { status: "contacted", from: "new" }),
      setStatus(id, other.session.cookie, { status: "closed", from: "new" }),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    const refused = answers.find(({ status }) => status === 409);
    expect(await jsonOf(refused as Response)).toEqual({
      status: "changed-meanwhile",
    });
    expect(heldEvents()).toHaveLength(1);
    expect(actions.calls).toEqual(["actions.setStatus", "actions.setStatus"]);
  });

  it("is 409 changed-meanwhile for the second of two identical saves made at once, and only one audit row exists", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answers = await Promise.all([
      setStatus(id, session.cookie, { status: "contacted", from: "new" }),
      setStatus(id, session.cookie, { status: "contacted", from: "new" }),
    ]);

    expect(heldEvents()).toHaveLength(1);
    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
  });
});

describe("the status member", () => {
  const SECRET_STATUS = "SECRET-STATUS-3319";

  it.each([
    ["absent", {}, "REQUIRED"],
    ["a number", { status: 1 }, "NOT_TEXT"],
    ["null", { status: null }, "NOT_TEXT"],
    ["an array", { status: ["new"] }, "NOT_TEXT"],
    ["empty", { status: "" }, "STATUS_NOT_IN_LIST"],
    [
      "a word outside the list",
      { status: SECRET_STATUS },
      "STATUS_NOT_IN_LIST",
    ],
    [
      "a listed word in capitals",
      { status: "CONTACTED" },
      "STATUS_NOT_IN_LIST",
    ],
    [
      "a listed word with a space",
      { status: "contacted " },
      "STATUS_NOT_IN_LIST",
    ],
    ["an inherited name", { status: "constructor" }, "STATUS_NOT_IN_LIST"],
  ] as const)(
    "is 400 with field status when it is %s",
    async (_title, json, code) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();

      const answer = await setStatus(id, session.cookie, {
        ...json,
        from: "new",
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "status", code }],
      });
      expect(await answer.clone().text()).not.toContain(SECRET_STATUS);
      expect(console_.everything()).not.toContain(SECRET_STATUS);
      expect(actions.calls).toEqual([]);
      expect(heldEvents()).toEqual([]);
    },
  );

  it.each([
    [
      "an extra member",
      { status: "closed", from: "new", role: "administrator" },
    ],
    ["another member only", { state: "closed" }],
    ["an array", ["closed"]],
    ["text that is not JSON", "{nope"],
    ["an empty body", ""],
  ] as const)("is 400 invalid-request for %s", async (_title, json) => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await setStatus(id, session.cookie, json);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    expect(actions.calls).toEqual([]);
  });
});

describe("the from member (the status the page last saw)", () => {
  const SECRET_FROM = "SECRET-FROM-5521";

  it.each([
    ["absent", undefined, "REQUIRED"],
    ["a number", 1, "NOT_TEXT"],
    ["null", null, "NOT_TEXT"],
    ["empty", "", "STATUS_NOT_IN_LIST"],
    ["a word outside the list", SECRET_FROM, "STATUS_NOT_IN_LIST"],
    ["a listed word in capitals", "NEW", "STATUS_NOT_IN_LIST"],
    [
      "the word a page shows for a status it cannot name",
      "unrecognised",
      "STATUS_NOT_IN_LIST",
    ],
  ] as const)(
    "is 400 with field from when it is %s, and nothing is asked of the store",
    async (_title, from, code) => {
      const { session } = await signedInOperator();
      const { id } = plantActionKitchen();

      const answer = await setStatus(id, session.cookie, {
        status: "closed",
        ...(from === undefined ? {} : { from }),
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "from", code }],
      });
      expect(await answer.clone().text()).not.toContain(SECRET_FROM);
      expect(console_.everything()).not.toContain(SECRET_FROM);
      expect(actions.calls).toEqual([]);
      expect(heldEvents()).toEqual([]);
    },
  );

  it("answers both members at once, the status first, when both are refused", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await setStatus(id, session.cookie, {
      status: "won",
      from: 7,
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [
        { field: "status", code: "STATUS_NOT_IN_LIST" },
        { field: "from", code: "NOT_TEXT" },
      ],
    });
    expect(actions.calls).toEqual([]);
  });

  it("is 400 invalid-request when a body of only the status is sent: the page always says what it saw", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await setStatus(id, session.cookie, { status: "closed" });

    expect(answer.status).toBe(400);
    expect(actions.calls).toEqual([]);
  });
});

describe("a save made from a page that read an older status", () => {
  it("is 409 changed-meanwhile, and the status another member saved stands, with no second audit row", async () => {
    const { session } = await signedInOperator();
    const other = await signedInOperator("second@example.test", "Second");
    const { id } = plantActionKitchen();
    await setStatus(id, other.session.cookie, {
      status: "offer-sent",
      from: "new",
    });

    const answer = await setStatus(id, session.cookie, {
      status: "closed",
      from: "new",
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(actions.store.heldStatus(id)?.status).toBe("offer-sent");
    expect(heldEvents()).toHaveLength(1);
  });

  it("is 409 changed-meanwhile, and not 200, when the status asked for is the one now stored", async () => {
    const { session } = await signedInOperator();
    const other = await signedInOperator("second@example.test", "Second");
    const { id } = plantActionKitchen();
    await setStatus(id, other.session.cookie, {
      status: "closed",
      from: "new",
    });

    const answer = await setStatus(id, session.cookie, {
      status: "closed",
      from: "new",
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
  });

  it("saves once the page has read the stored status again", async () => {
    const { session } = await signedInOperator();
    const other = await signedInOperator("second@example.test", "Second");
    const { id } = plantActionKitchen();
    await setStatus(id, other.session.cookie, {
      status: "offer-sent",
      from: "new",
    });

    const answer = await setStatus(id, session.cookie, {
      status: "closed",
      from: "offer-sent",
    });

    expect(answer.status).toBe(200);
    expect(actions.store.heldStatus(id)?.status).toBe("closed");
  });
});

describe("the one kitchen refusal", () => {
  it("is byte-identical for an unknown id, a client-deleted kitchen and a visitor's unsent draft, and a hidden kitchen is not refused", async () => {
    const { session } = await signedInOperator();
    const unknown = "U".repeat(21);
    const deleted = plantActionKitchen({ isDeletedByClient: true });
    const visitorDraft = plantActionKitchen({ isSent: false, accountId: null });
    const hidden = plantActionKitchen({ isHidden: true });

    const refused = await setStatus(unknown, session.cookie, {
      status: "closed",
      from: "new",
    });
    const asDeleted = await setStatus(deleted.id, session.cookie, {
      status: "closed",
      from: "new",
    });
    const asDraft = await setStatus(visitorDraft.id, session.cookie, {
      status: "closed",
      from: "new",
    });
    const asHidden = await setStatus(hidden.id, session.cookie, {
      status: "closed",
      from: "new",
    });

    expect(refused.status).toBe(404);
    expect(await wireOf(refused)).toBe(
      await wireOf(designNotFoundResponse(unknown)),
    );
    expect(await wireOf(asDeleted)).toBe(
      await wireOf(designNotFoundResponse(deleted.id)),
    );
    expect(await wireOf(asDraft)).toBe(
      await wireOf(designNotFoundResponse(visitorDraft.id)),
    );
    expect(asHidden.status).toBe(200);
    expect(heldEvents()).toHaveLength(1);
  });

  it("answers a malformed id without asking the store", async () => {
    const { session } = await signedInOperator();

    const answer = await setStatus("not-an-id", session.cookie, {
      status: "closed",
      from: "new",
    });

    expect(answer.status).toBe(404);
    expect(actions.calls).toEqual([]);
  });
});

describe("a write and its audit row are one thing (at the route)", () => {
  it("answers 503 with no detail when the audit row cannot be staged, and the status is not visible", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    vi.spyOn(staffWorld.audit, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await setStatus(id, session.cookie, {
      status: "closed",
      from: "new",
    });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(actions.store.heldStatus(id)).toBeUndefined();
    expect(heldEvents()).toEqual([]);
    expect(actions.calls).toEqual(["actions.setStatus"]);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("answers 503 when the store fails, with no second attempt", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();
    actions.failStore = true;

    const answer = await setStatus(id, session.cookie, {
      status: "closed",
      from: "new",
    });

    expect(answer.status).toBe(503);
    expect(actions.calls).toEqual(["actions.setStatus"]);
  });

  it("answers 401 when the session ended between the route's read and the store's write, and writes nothing", async () => {
    const { session, account } = await signedInOperator();
    const { id } = plantActionKitchen();
    const realSetStatus = actions.store.setStatus.bind(actions.store);
    vi.spyOn(actions.store, "setStatus").mockImplementation(async (request) => {
      await world.sessions.revokeAllForAccount(account.id);
      return realSetStatus(request);
    });

    const answer = await setStatus(id, session.cookie, {
      status: "closed",
      from: "new",
    });

    expect(answer.status).toBe(401);
    expect(actions.store.heldStatus(id)).toBeUndefined();
    expect(heldEvents()).toEqual([]);
  });
});
