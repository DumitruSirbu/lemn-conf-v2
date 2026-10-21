import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StaffKitchenActionError,
  type StaffKitchenActionFailure,
  type StaffKitchenActionOperation,
  type StaffKitchenActionRefusal,
} from "@lemnaria/persistence";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  freshStaffActionsWorld,
  noteRequest,
  plantActionKitchen,
  signedInStaffNamed,
  statusRequest,
  unhideRequest,
  type StaffActionsWorld,
} from "../../../support/staff-actions-world";
import { freshStaffWorld } from "../../../support/staff-world";

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

const { POST: NOTES } = await import(
  "@/app/api/staff/kitchens/[id]/notes/route"
);
const { PUT: STATUS } = await import(
  "@/app/api/staff/kitchens/[id]/status/route"
);
const { POST: UNHIDE } = await import(
  "@/app/api/staff/kitchens/[id]/unhide/route"
);

/**
 * What a thrown `StaffKitchenActionError` becomes at each staff write route, by the port's documented mapping:
 * `not-recorded` is 401; `invalid-request` is 400 naming the field (`text` or `status`); `unavailable`,
 * `unexpected-answer` and `database` are 503 with no detail. An `invalid-request` for the audit record (no field a
 * person can correct) and any error that is not the store's are 503 too.
 */

let actions: StaffActionsWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(() => {
  freshAccountWorld();
  freshStaffWorld();
  actions = freshStaffActionsWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

interface FailingRoute {
  readonly title: string;
  readonly operation: StaffKitchenActionOperation;
  /** Makes the fake's method throw `failure`, then asks the route once. */
  readonly askWhenStoreThrows: (
    failure: unknown,
    cookie: string,
    id: string,
  ) => Promise<Response>;
}

const NOTE_ROUTE: FailingRoute = {
  title: "adding a note",
  operation: "add a staff note",
  askWhenStoreThrows: (failure, cookie, id) => {
    vi.spyOn(actions.store, "addNote").mockRejectedValue(failure);
    return NOTES(noteRequest(id, { cookie, json: { text: "A note" } }), {
      params: Promise.resolve({ id }),
    });
  },
};

const STATUS_ROUTE: FailingRoute = {
  title: "setting a status",
  operation: "set a request status",
  askWhenStoreThrows: (failure, cookie, id) => {
    vi.spyOn(actions.store, "setStatus").mockRejectedValue(failure);
    return STATUS(statusRequest(id, { cookie, json: { status: "closed" } }), {
      params: Promise.resolve({ id }),
    });
  },
};

const UNHIDE_ROUTE: FailingRoute = {
  title: "unhiding a kitchen",
  operation: "unhide a kitchen",
  askWhenStoreThrows: (failure, cookie, id) => {
    vi.spyOn(actions.store, "unhide").mockRejectedValue(failure);
    return UNHIDE(unhideRequest(id, { cookie }), {
      params: Promise.resolve({ id }),
    });
  },
};

const ROUTES = [NOTE_ROUTE, STATUS_ROUTE, UNHIDE_ROUTE] as const;

function failureOf(
  operation: StaffKitchenActionOperation,
  failure: StaffKitchenActionFailure,
  refusal?: StaffKitchenActionRefusal,
): StaffKitchenActionError {
  return new StaffKitchenActionError(operation, failure, {
    cause: new Error(DRIVER_FAILURE_MARKER),
    ...(refusal === undefined ? {} : { refusal }),
  });
}

async function ask(route: FailingRoute, failure: unknown): Promise<Response> {
  const { session } = await signedInStaffNamed(
    { role: "operator" },
    "operator@example.test",
  );
  const { id } = plantActionKitchen({ isHidden: true });
  return route.askWhenStoreThrows(failure, session.cookie, id);
}

describe.each(ROUTES)("$title", (route) => {
  it("answers 401 for a call that had no live session behind it", async () => {
    const answer = await ask(route, failureOf(route.operation, "not-recorded"));

    expect(answer.status).toBe(401);
    expect(await jsonOf(answer)).toEqual({ status: "unauthenticated" });
  });

  it.each(["unavailable", "unexpected-answer", "database"] as const)(
    "answers 503 with no detail for %s",
    async (kind) => {
      const answer = await ask(route, failureOf(route.operation, kind));

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(answer.headers.get("retry-after")).toBeNull();
      expect(await answer.clone().text()).not.toContain(DRIVER_FAILURE_MARKER);
      expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    },
  );

  it("answers 503 for a refusal of the audit record: that is not a field a person can correct", async () => {
    const answer = await ask(
      route,
      failureOf(route.operation, "invalid-request", "SESSION_NOT_WELL_FORMED"),
    );

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
  });

  it("answers 503 for an error that is not the store's", async () => {
    const answer = await ask(route, new TypeError(DRIVER_FAILURE_MARKER));

    expect(answer.status).toBe(503);
    expect(await answer.clone().text()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("a refusal the store makes of what the route judged", () => {
  it("is 400 naming the field text when the store would not have stored the note as given", async () => {
    const answer = await ask(
      NOTE_ROUTE,
      failureOf(
        NOTE_ROUTE.operation,
        "invalid-request",
        "NOTE_TEXT_NOT_JUDGED",
      ),
    );

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "text", code: "NOTE_TEXT_NOT_JUDGED" }],
    });
  });

  it("is 400 naming the field status when the store finds the status outside the list", async () => {
    const answer = await ask(
      STATUS_ROUTE,
      failureOf(
        STATUS_ROUTE.operation,
        "invalid-request",
        "STATUS_NOT_IN_LIST",
      ),
    );

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "status", code: "STATUS_NOT_IN_LIST" }],
    });
  });
});
