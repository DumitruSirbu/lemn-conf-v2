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
  signedInStaffNamed,
  type StaffActionsWorld,
} from "../../../support/staff-actions-world";
import {
  NOTES_ROUTE,
  STATUS_ROUTE,
  UNHIDE_ROUTE,
  WRITE_ROUTES,
  type WriteRoute,
  type WriteRouteName,
} from "../../../support/staff-write-routes";
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

interface StoreSeam {
  readonly operation: StaffKitchenActionOperation;
  readonly method: "addNote" | "setStatus" | "unhide";
}

const STORE_SEAM_OF_ROUTE: Readonly<Record<WriteRouteName, StoreSeam>> = {
  notes: { operation: "add a staff note", method: "addNote" },
  status: { operation: "set a request status", method: "setStatus" },
  unhide: { operation: "unhide a kitchen", method: "unhide" },
};

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

/** Makes the fake's method for the route throw `failure`, then asks the route once. */
async function ask(route: WriteRoute, failure: unknown): Promise<Response> {
  const { session } = await signedInStaffNamed(
    { role: "operator" },
    "operator@example.test",
  );
  const id = route.plantReady();
  vi.spyOn(
    actions.store,
    STORE_SEAM_OF_ROUTE[route.name].method,
  ).mockRejectedValue(failure);
  return route.ask(id, { cookie: session.cookie });
}

function failureOfRoute(
  route: WriteRoute,
  kind: StaffKitchenActionFailure,
  refusal?: StaffKitchenActionRefusal,
): StaffKitchenActionError {
  return failureOf(STORE_SEAM_OF_ROUTE[route.name].operation, kind, refusal);
}

describe.each(WRITE_ROUTES)("$name", (route) => {
  it("answers 401 for a call that had no live session behind it", async () => {
    const answer = await ask(route, failureOfRoute(route, "not-recorded"));

    expect(answer.status).toBe(401);
    expect(await jsonOf(answer)).toEqual({ status: "unauthenticated" });
  });

  it.each(["unavailable", "unexpected-answer", "database"] as const)(
    "answers 503 with no detail for %s",
    async (kind) => {
      const answer = await ask(route, failureOfRoute(route, kind));

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
      failureOfRoute(route, "invalid-request", "SESSION_NOT_WELL_FORMED"),
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

  it("writes one log line naming the route's own event and the outcome unavailable", async () => {
    await ask(route, failureOfRoute(route, "database"));

    expect(console_.accountLines()).toEqual([
      { event: route.event, outcome: "unavailable" },
    ]);
  });
});

describe("a refusal the store makes of what the route judged", () => {
  it("is 400 naming the field text when the store would not have stored the note as given", async () => {
    const answer = await ask(
      NOTES_ROUTE,
      failureOfRoute(NOTES_ROUTE, "invalid-request", "NOTE_TEXT_NOT_JUDGED"),
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
      failureOfRoute(STATUS_ROUTE, "invalid-request", "STATUS_NOT_IN_LIST"),
    );

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "status", code: "STATUS_NOT_IN_LIST" }],
    });
  });

  it.each([
    ["the note route", NOTES_ROUTE, "STATUS_NOT_IN_LIST"],
    ["the status route", STATUS_ROUTE, "NOTE_TEXT_NOT_JUDGED"],
    ["the unhide route", UNHIDE_ROUTE, "NOTE_TEXT_NOT_JUDGED"],
    ["the unhide route", UNHIDE_ROUTE, "STATUS_NOT_IN_LIST"],
  ] as const)(
    "is 503 on %s for a refusal that belongs to another write: %s",
    async (_title, route, refusal) => {
      const answer = await ask(
        route,
        failureOfRoute(route, "invalid-request", refusal),
      );

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    },
  );
});
