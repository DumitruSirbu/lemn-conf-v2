import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STAFF_NOTE_BY_ACCOUNT_POLICY,
  STAFF_NOTE_PER_ACCOUNT_HOUR_FIGURE,
  STAFF_STATUS_BY_ACCOUNT_POLICY,
  STAFF_STATUS_PER_ACCOUNT_HOUR_FIGURE,
  STAFF_UNHIDE_BY_ACCOUNT_POLICY,
  STAFF_UNHIDE_PER_ACCOUNT_DAY_FIGURE,
  type LimitPolicy,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  seedSession,
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
import {
  freshStaffWorld,
  signedInAs,
  type StaffWorld,
} from "../../../support/staff-world";

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
 * The staff write routes' limiter (M8B Lot 3 plan P-L3-11; ADR 0156): 120 notes and 120 status saves an hour and 60
 * unhides a day, each counted for the account whatever session or network asks. A write fails closed: a bucket that
 * cannot be counted writes nothing. Only a request that is admitted and valid is counted.
 */

let staffWorld: StaffWorld;
let actions: StaffActionsWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  actions = freshStaffActionsWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

interface LimitedRoute {
  readonly title: string;
  readonly policy: LimitPolicy;
  readonly figure: number;
  readonly event: string;
  readonly plant: () => string;
  /** One valid request; later ones on the same kitchen may be answered with a conflict, which still counts. */
  readonly ask: (id: string, cookie: string) => Promise<Response>;
}

const ROUTES: readonly LimitedRoute[] = [
  {
    title: "adding a note",
    policy: STAFF_NOTE_BY_ACCOUNT_POLICY,
    figure: STAFF_NOTE_PER_ACCOUNT_HOUR_FIGURE,
    event: "staff-note",
    plant: () => plantActionKitchen().id,
    ask: (id, cookie) =>
      NOTES(noteRequest(id, { cookie, json: { text: "A note" } }), {
        params: Promise.resolve({ id }),
      }),
  },
  {
    title: "setting a status",
    policy: STAFF_STATUS_BY_ACCOUNT_POLICY,
    figure: STAFF_STATUS_PER_ACCOUNT_HOUR_FIGURE,
    event: "staff-status",
    plant: () => plantActionKitchen().id,
    ask: (id, cookie) =>
      STATUS(statusRequest(id, { cookie, json: { status: "contacted" } }), {
        params: Promise.resolve({ id }),
      }),
  },
  {
    title: "unhiding a kitchen",
    policy: STAFF_UNHIDE_BY_ACCOUNT_POLICY,
    figure: STAFF_UNHIDE_PER_ACCOUNT_DAY_FIGURE,
    event: "staff-unhide",
    plant: () => plantActionKitchen({ isHidden: true }).id,
    ask: (id, cookie) =>
      UNHIDE(unhideRequest(id, { cookie }), {
        params: Promise.resolve({ id }),
      }),
  },
];

async function signedInOperator(email = "operator@example.test") {
  return signedInStaffNamed({ role: "operator" }, email);
}

async function askMany(
  route: LimitedRoute,
  id: string,
  cookie: string,
  count: number,
): Promise<number[]> {
  const statuses: number[] = [];
  for (let asked = 0; asked < count; asked += 1) {
    statuses.push((await route.ask(id, cookie)).status);
  }
  return statuses;
}

describe("the figures", () => {
  it("are 120 notes an hour, 120 status saves an hour and 60 unhides in a UTC day", () => {
    expect(
      [
        STAFF_NOTE_BY_ACCOUNT_POLICY,
        STAFF_STATUS_BY_ACCOUNT_POLICY,
        STAFF_UNHIDE_BY_ACCOUNT_POLICY,
      ].map(({ name, figure, window }) => [name, figure, window]),
    ).toEqual([
      [
        "staff-note-by-account-per-60-utc-minutes",
        120,
        { kind: "utc-minutes", minutes: 60 },
      ],
      [
        "staff-status-by-account-per-60-utc-minutes",
        120,
        { kind: "utc-minutes", minutes: 60 },
      ],
      [
        "staff-unhide-by-account-per-1440-utc-minutes",
        60,
        { kind: "utc-minutes", minutes: 1440 },
      ],
    ]);
  });
});

describe.each(ROUTES)("$title", (route) => {
  it("is allowed up to its figure and refused with 429 and a whole-second wait above it, without asking the store", async () => {
    const { session } = await signedInOperator();
    const id = route.plant();

    const within = await askMany(route, id, session.cookie, route.figure);
    const refused = await route.ask(id, session.cookie);

    expect(within.every((status) => status < 500 && status !== 429)).toBe(true);
    expect(within[0]).toBeLessThan(300);
    expect(refused.status).toBe(429);
    expect(await jsonOf(refused)).toEqual({ status: "rate-limited" });
    expectAWaitWithinTheWindowOf(refused, route.policy.name);
    expect(actions.calls).toHaveLength(route.figure);
  });

  it("is counted for the account, whichever of its sessions asks, and a second account has a bucket of its own", async () => {
    const first = await signedInOperator("first@example.test");
    const second = await signedInOperator("second@example.test");
    const otherSessionOfFirst = await seedSession(first.account);
    const id = route.plant();
    await askMany(route, id, first.session.cookie, route.figure / 2);
    await askMany(route, id, otherSessionOfFirst.cookie, route.figure / 2);

    const stopped = await route.ask(id, first.session.cookie);
    const stoppedElsewhere = await route.ask(id, otherSessionOfFirst.cookie);
    const servedToSecond = await route.ask(id, second.session.cookie);

    expect([stopped.status, stoppedElsewhere.status]).toEqual([429, 429]);
    expect([200, 201, 204, 409]).toContain(servedToSecond.status);
  });

  it("fails closed: a bucket that cannot be counted is 503 with no detail, nothing is written and the store is not asked", async () => {
    const { session } = await signedInOperator();
    const id = route.plant();
    limiterLedger.unavailable.add(route.policy.name);

    const answer = await route.ask(id, session.cookie);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(answer.headers.get("retry-after")).toBeNull();
    expect(actions.calls).toEqual([]);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("names its policy in the log line of a refusal, and nothing that identifies the account", async () => {
    const { session, account } = await signedInOperator();
    const id = route.plant();
    limiterLedger.refusing.set(route.policy.name, 1);

    await route.ask(id, session.cookie);

    expect(console_.accountLines()).toContainEqual({
      event: route.event,
      outcome: "limited",
      policy: route.policy.name,
    });
    expect(console_.everything()).not.toContain(account.id);
  });

  it("counts a valid request once, in its own bucket and no other", async () => {
    const { session } = await signedInOperator();
    const id = route.plant();

    await route.ask(id, session.cookie);

    expect(limiterLedger.counted).toEqual([route.policy.name]);
  });

  it("counts a valid request for an unknown kitchen, so the count tells nothing of whether it exists", async () => {
    const { session } = await signedInOperator();

    await route.ask("U".repeat(21), session.cookie);

    expect(limiterLedger.counted).toEqual([route.policy.name]);
  });

  it("counts nothing for a caller that is refused first", async () => {
    const client = await signedInAs({ role: "client" });
    const id = route.plant();

    const asClient = await route.ask(id, client.session.cookie);
    const anonymous = await route.ask(id, "");

    expect([asClient.status, anonymous.status]).toEqual([403, 401]);
    expect(limiterLedger.counted).toEqual([]);
  });
});

describe("a request the body judges invalid is not counted", () => {
  it.each([
    ["a note with no text", () => NOTES, noteRequest, { text: "" }],
    ["a status outside the list", () => STATUS, statusRequest, { status: "x" }],
  ] as const)("%s", async (_title, handler, makeRequest, json) => {
    const { session } = await signedInOperator();
    const { id } = plantActionKitchen();

    const answer = await handler()(
      makeRequest(id, { cookie: session.cookie, json }),
      { params: Promise.resolve({ id }) },
    );

    expect(answer.status).toBe(400);
    expect(limiterLedger.counted).toEqual([]);
  });
});

describe("the three buckets are apart", () => {
  it("lets an account that has reached its note ceiling still save a status and unhide a kitchen", async () => {
    const { session } = await signedInOperator();
    const hidden = plantActionKitchen({ isHidden: true });
    const sent = plantActionKitchen();
    limiterLedger.refusing.set(STAFF_NOTE_BY_ACCOUNT_POLICY.name, 1);

    const note = await ROUTES[0]?.ask(sent.id, session.cookie);
    const status = await ROUTES[1]?.ask(sent.id, session.cookie);
    const unhidden = await ROUTES[2]?.ask(hidden.id, session.cookie);

    expect([note?.status, status?.status, unhidden?.status]).toEqual([
      429, 200, 204,
    ]);
  });
});
