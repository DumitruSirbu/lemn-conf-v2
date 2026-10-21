import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STAFF_KITCHENS_LIST_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  READ_POLICY_NAME,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  type AccountWorld,
} from "../../../support/account-world";
import {
  freshStaffActionsWorld,
  noteRequest,
  plantActionKitchen,
  signedInStaffNamed,
} from "../../../support/staff-actions-world";
import {
  freshStaffWorld,
  plantKitchen,
  signedInAs,
  type StaffWorld,
} from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-kitchen-reader-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffKitchenReaderModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-kitchen-actions-store-instance", () =>
  import("../../../support/staff-actions-world").then((world) =>
    world.staffKitchenActionsStoreModule(),
  ),
);

const { GET: LIST } = await import("@/app/api/staff/kitchens/route");
const { GET: ONE } = await import("@/app/api/staff/kitchens/[id]/route");
const { POST: NOTES } = await import(
  "@/app/api/staff/kitchens/[id]/notes/route"
);

/**
 * A staff session is marked seen by every staff request that is admitted, read or write, so a person who only reads
 * stays signed in for their idle lifetime. The mark comes after the capability and before any bucket or store, is
 * made whatever the request is then answered, and is never made for a request that is refused before admission. A mark
 * that fails changes no answer.
 */

const SESSION_TOUCH = "sessions.touch";

let world: AccountWorld;
let staffWorld: StaffWorld;

beforeEach(() => {
  world = freshAccountWorld();
  staffWorld = freshStaffWorld();
  freshStaffActionsWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function touches(): number {
  return world.calls.filter((call) => call === SESSION_TOUCH).length;
}

interface StaffRoute {
  readonly title: string;
  readonly plantKitchenId: () => string;
  readonly ask: (id: string, init?: AskInit) => Promise<Response>;
  /** A request this route refuses after admission, with the status it is refused with. */
  readonly refusedAfterAdmission: (
    cookie: string,
  ) => Promise<{ status: number }>;
}

type AskInit = Omit<Parameters<typeof accountRequest>[1] & object, "method">;

const LIST_ROUTE: StaffRoute = {
  title: "the list",
  plantKitchenId: () => plantKitchen().id,
  ask: (_id, init = {}) =>
    LIST(accountRequest("/api/staff/kitchens", withNetwork(init))),
  refusedAfterAdmission: (cookie) =>
    LIST(
      accountRequest(
        "/api/staff/kitchens",
        withNetwork({ cookie, search: "?page=0" }),
      ),
    ),
};

const ONE_ROUTE: StaffRoute = {
  title: "one kitchen",
  plantKitchenId: () => plantKitchen().id,
  ask: (id, init = {}) =>
    ONE(accountRequest(`/api/staff/kitchens/${id}`, withNetwork(init)), {
      params: Promise.resolve({ id }),
    }),
  refusedAfterAdmission: (cookie) =>
    ONE(
      accountRequest("/api/staff/kitchens/unknown", withNetwork({ cookie })),
      { params: Promise.resolve({ id: "unknown" }) },
    ),
};

const NOTE_ROUTE: StaffRoute = {
  title: "adding a note",
  plantKitchenId: () => plantActionKitchen().id,
  ask: (id, init = {}) =>
    NOTES(noteRequest(id, { json: { text: "A note" }, ...init }), {
      params: Promise.resolve({ id }),
    }),
  refusedAfterAdmission: (cookie) =>
    NOTES(noteRequest("unknown", { cookie, json: { text: "A note" } }), {
      params: Promise.resolve({ id: "unknown" }),
    }),
};

const ROUTES: readonly StaffRoute[] = [LIST_ROUTE, ONE_ROUTE, NOTE_ROUTE];

function withNetwork(init: AskInit): AskInit {
  return {
    ...init,
    headers: { "x-forwarded-for": "192.0.2.10", ...init.headers },
  };
}

async function signedInOperator(email = "operator@example.test") {
  return signedInStaffNamed({ role: "operator" }, email);
}

describe.each(ROUTES)("$title", (route) => {
  it("marks an admitted session seen once, and answers as it always did", async () => {
    const { session } = await signedInOperator();
    const id = route.plantKitchenId();

    const answer = await route.ask(id, { cookie: session.cookie });

    expect(answer.status).toBeLessThan(300);
    expect(touches()).toBe(1);
  });

  it("marks the session seen before any bucket is counted or any store is asked", async () => {
    const { session } = await signedInOperator();
    const id = route.plantKitchenId();
    const seenAtTheMark: { counted: string[]; storeCalls: string[] }[] = [];
    world.intercept(SESSION_TOUCH, (real) => {
      seenAtTheMark.push({
        counted: limiterLedger.counted.filter(
          (name) => name !== READ_POLICY_NAME,
        ),
        storeCalls: [...staffWorld.calls],
      });
      return real();
    });

    await route.ask(id, { cookie: session.cookie });

    expect(seenAtTheMark).toEqual([{ counted: [], storeCalls: [] }]);
  });

  it("marks the session seen when an admitted request is then refused", async () => {
    const { session } = await signedInOperator();

    const answer = await route.refusedAfterAdmission(session.cookie);

    expect([400, 404]).toContain(answer.status);
    expect(touches()).toBe(1);
  });

  it("marks the session seen when its bucket refuses the request", async () => {
    const { session } = await signedInOperator();
    const id = route.plantKitchenId();
    for (const name of [
      "staff-kitchens-list-by-account-per-60-utc-minutes",
      "staff-kitchen-open-by-account-per-60-utc-minutes",
      "staff-note-by-account-per-60-utc-minutes",
    ]) {
      limiterLedger.refusing.set(name, 1);
    }

    const answer = await route.ask(id, { cookie: session.cookie });

    expect(answer.status).toBe(429);
    expect(touches()).toBe(1);
  });

  it("marks no session seen for a request refused before admission", async () => {
    const client = await signedInAs({ role: "client" });
    const id = route.plantKitchenId();
    const unconfirmed = await signedInAs(
      { role: "operator", isVerified: false },
      "unconfirmed@example.test",
    );

    const answers = [
      await route.ask(id),
      await route.ask(id, { cookie: client.session.cookie }),
      await route.ask(id, { cookie: unconfirmed.session.cookie }),
      await route.ask(id, {
        cookie: client.session.cookie,
        secFetchSite: "cross-site",
      }),
    ];

    expect(answers.map(({ status }) => status)).toEqual([401, 403, 403, 403]);
    expect(touches()).toBe(0);
  });

  it("answers the same when the mark itself fails, and leaks nothing of the failure", async () => {
    const { session } = await signedInOperator();
    const console_ = captureConsole();
    const id = route.plantKitchenId();
    world.failOn(SESSION_TOUCH);

    const answer = await route.ask(id, { cookie: session.cookie });

    expect(answer.status).toBeLessThan(300);
    expect(await answer.clone().text()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("the reads", () => {
  it("mark no session seen when the network's read limit refuses, which is asked before the session", async () => {
    const { session } = await signedInOperator();
    limiterLedger.refusing.set(READ_POLICY_NAME, 1);

    const answers = [
      await LIST_ROUTE.ask("", { cookie: session.cookie }),
      await ONE_ROUTE.ask(plantKitchen().id, { cookie: session.cookie }),
    ];

    expect(answers.map((answer) => answer.status)).toEqual([429, 429]);
    expect(touches()).toBe(0);
  });

  it("mark the session seen when the page bucket cannot be counted, and refuse the page", async () => {
    const { session } = await signedInOperator();
    limiterLedger.unavailable.add(STAFF_KITCHENS_LIST_BY_ACCOUNT_POLICY.name);

    const answer = await LIST_ROUTE.ask("", { cookie: session.cookie });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(touches()).toBe(1);
  });

  it("mark the session seen when the reader fails and the request is answered 503", async () => {
    const { session } = await signedInOperator();
    staffWorld.failReader = true;

    const answer = await LIST_ROUTE.ask("", { cookie: session.cookie });

    expect(answer.status).toBe(503);
    expect(touches()).toBe(1);
  });
});
