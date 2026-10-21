import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  unhideRequest,
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

const route = await import("@/app/api/staff/kitchens/[id]/unhide/route");
const { POST } = route;

/**
 * `POST /api/staff/kitchens/{id}/unhide` (M8B Lot 3, E-L3-5, K-6; ADR 0173, ADR 0019 d11, ADR 0172 Amendment G item 3).
 * The route clears the hide mark and nothing else, commits it with its audit row, and says `409 not-hidden` to a kitchen
 * that is not hidden. The route is built in full; the owner must accept hide and unhide again before production.
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

async function signedInOperator(email = "operator@example.test") {
  return signedInStaffNamed({ role: "operator" }, email, "Olga Operator");
}

async function unhide(
  id: string,
  cookie: string,
  init: Parameters<typeof unhideRequest>[1] = {},
) {
  return POST(unhideRequest(id, { cookie, ...init }), {
    params: Promise.resolve({ id }),
  });
}

function heldEvents() {
  return staffWorld.audit.heldEvents();
}

describe("a kitchen its client hid", () => {
  it("is unhidden: 204 with no body, the hide mark cleared and nothing else of the kitchen changed", async () => {
    const { session } = await signedInOperator();
    const kitchen = plantActionKitchen({ isHidden: true });

    const answer = await unhide(kitchen.id, session.cookie);

    expect(answer.status).toBe(204);
    expect(await answer.text()).toBe("");
    expect(actions.store.heldKitchen(kitchen.id)).toEqual({
      ...kitchen,
      isHidden: false,
    });
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
  });

  it("writes one kitchen-unhidden audit row naming the actor and the kitchen, with no detail", async () => {
    const { session, account } = await signedInOperator();
    const { id } = plantActionKitchen({ isHidden: true });

    await unhide(id, session.cookie);

    expect(heldEvents()).toEqual([
      expect.objectContaining({
        action: "kitchen-unhidden",
        actorAccountId: account.id,
        designId: id,
        detail: null,
      }),
    ]);
  });

  it("keeps its request status and its share links: it touches neither", async () => {
    const { session, account } = await signedInOperator();
    const { id } = plantActionKitchen({ isHidden: true });
    actions.store.plantStatus({
      designId: id,
      status: "offer-sent",
      changedByAccountId: account.id,
      changedAt: new Date("2026-10-19T10:00:00.000Z"),
    });

    await unhide(id, session.cookie);

    expect(actions.store.heldStatus(id)?.status).toBe("offer-sent");
    expect(world.revokedShareLinks).toEqual([]);
    expect(world.calls.filter((call) => call.startsWith("kitchens."))).toEqual(
      [],
    );
  });

  it("takes no body: any body and any media type are unhidden alike and the request is never read as input", async () => {
    const { session } = await signedInOperator();
    const first = plantActionKitchen({ isHidden: true });
    const second = plantActionKitchen({ isHidden: true });

    const withJunk = await unhide(first.id, session.cookie, {
      json: "{not json",
      contentType: "text/plain",
    });
    const withClaims = await unhide(second.id, session.cookie, {
      json: { id: "someone-else", role: "administrator" },
    });

    expect([withJunk.status, withClaims.status]).toEqual([204, 204]);
    expect(actions.store.heldKitchen(second.id)?.isHidden).toBe(false);
  });
});

describe("a kitchen that is not hidden", () => {
  it("is 409 not-hidden and writes no audit row", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen({ isHidden: false });

    const answer = await unhide(id, session.cookie);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "not-hidden" });
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(heldEvents()).toEqual([]);
  });

  it("is 409 for the second of two calls in a row, with one audit row for the first", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen({ isHidden: true });

    const first = await unhide(id, session.cookie);
    const second = await unhide(id, session.cookie);

    expect([first.status, second.status]).toEqual([204, 409]);
    expect(heldEvents()).toHaveLength(1);
  });

  it("is unhidden once by two calls made at once: one 204, one 409 not-hidden and one audit row", async () => {
    const { session } = await signedInOperator();
    const other = await signedInOperator("second@example.test");
    const { id } = plantActionKitchen({ isHidden: true });

    const answers = await Promise.all([
      unhide(id, session.cookie),
      unhide(id, other.session.cookie),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([204, 409]);
    const refused = answers.find(({ status }) => status === 409);
    expect(await jsonOf(refused as Response)).toEqual({ status: "not-hidden" });
    expect(heldEvents()).toHaveLength(1);
  });
});

describe("the one kitchen refusal (K-4)", () => {
  it("is byte-identical for an unknown id, a client-deleted kitchen and a visitor's unsent draft", async () => {
    const { session } = await signedInOperator();
    const unknown = "U".repeat(21);
    const deleted = plantActionKitchen({
      isDeletedByClient: true,
      isHidden: true,
    });
    const visitorDraft = plantActionKitchen({
      isSent: false,
      accountId: null,
      isHidden: true,
    });

    const refused = await unhide(unknown, session.cookie);
    const asDeleted = await unhide(deleted.id, session.cookie);
    const asDraft = await unhide(visitorDraft.id, session.cookie);

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
    expect(heldEvents()).toEqual([]);
    expect(actions.store.heldKitchen(deleted.id)?.isHidden).toBe(true);
  });

  it("answers a malformed id without asking the store", async () => {
    const { session } = await signedInOperator();

    const answer = await unhide("not-an-id", session.cookie);

    expect(answer.status).toBe(404);
    expect(actions.calls).toEqual([]);
  });
});

describe("a write and its audit row are one thing (K-3, at the route)", () => {
  it("answers 503 with no detail when the audit row cannot be staged, and the kitchen stays hidden", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen({ isHidden: true });
    vi.spyOn(staffWorld.audit, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await unhide(id, session.cookie);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(actions.store.heldKitchen(id)?.isHidden).toBe(true);
    expect(heldEvents()).toEqual([]);
    expect(actions.calls).toEqual(["actions.unhide"]);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("answers 503 when the store fails, with no second attempt", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen({ isHidden: true });
    actions.failStore = true;

    const answer = await unhide(id, session.cookie);

    expect(answer.status).toBe(503);
    expect(actions.calls).toEqual(["actions.unhide"]);
  });

  it("answers 401 when the session ended between the route's read and the store's write, and the kitchen stays hidden", async () => {
    const { session, account } = await signedInOperator();
    const { id } = plantActionKitchen({ isHidden: true });
    const realUnhide = actions.store.unhide.bind(actions.store);
    vi.spyOn(actions.store, "unhide").mockImplementation(async (request) => {
      await world.sessions.revokeAllForAccount(account.id);
      return realUnhide(request);
    });

    const answer = await unhide(id, session.cookie);

    expect(answer.status).toBe(401);
    expect(actions.store.heldKitchen(id)?.isHidden).toBe(true);
    expect(heldEvents()).toEqual([]);
  });
});

describe("the route's inventory and order", () => {
  it("answers to POST alone", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "dynamic", "runtime"]);
  });

  it("refuses a cross-site request first: no session is read and no store is asked", async () => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen({ isHidden: true });
    world.calls.length = 0;

    for (const secFetchSite of ["cross-site", "same-site", "none"]) {
      const answer = await unhide(id, session.cookie, { secFetchSite });
      expect(answer.status).toBe(403);
      expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    }
    expect(world.calls).toEqual([]);
    expect(actions.calls).toEqual([]);
  });
});
