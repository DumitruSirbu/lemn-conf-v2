import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  cookieOfValue,
  freshAccountWorld,
  jsonOf,
  type AccountWorld,
} from "../../../support/account-world";
import {
  freshStaffActionsWorld,
  noteRequest,
  plantActionKitchen,
  statusRequest,
  unhideRequest,
  type StaffActionsWorld,
} from "../../../support/staff-actions-world";
import {
  freshStaffWorld,
  signedInAs,
  type StaffCaller,
  type StaffWorld,
} from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
const capabilitiesAsked: string[] = [];
vi.mock("@/lib/server/account/require-capability", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/server/account/require-capability")
    >();
  return {
    ...original,
    requireCapability: (
      ...args: Parameters<typeof original.requireCapability>
    ) => {
      capabilitiesAsked.push(args[1]);
      return original.requireCapability(...args);
    },
  };
});
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
 * K-1 of the Lot 3 plan for the three staff write routes: the answer is `401` without a live session, `403` for a
 * session that does not hold the route's capability (a client, or a staff address not yet confirmed), and the route's
 * success otherwise. A client's session reaches no store and leaves no row. The table is written out, not derived from
 * `isCapabilityHeld`, so a change to who may write on a client's kitchen has to be made here on purpose.
 */

let world: AccountWorld;
let staffWorld: StaffWorld;
let actions: StaffActionsWorld;

beforeEach(() => {
  world = freshAccountWorld();
  staffWorld = freshStaffWorld();
  actions = freshStaffActionsWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type CallerName =
  | "anonymous"
  | "a malformed cookie"
  | "a client with a confirmed address"
  | "a client with an unconfirmed address"
  | "an operator"
  | "an administrator"
  | "an operator with an unconfirmed address"
  | "an administrator with an unconfirmed address"
  | "an operator idle past twelve hours"
  | "an operator whose session was revoked";

type Expected = "success" | 401 | 403;

const EXPECTED: readonly [CallerName, Expected][] = [
  ["anonymous", 401],
  ["a malformed cookie", 401],
  ["a client with a confirmed address", 403],
  ["a client with an unconfirmed address", 403],
  ["an operator", "success"],
  ["an administrator", "success"],
  ["an operator with an unconfirmed address", 403],
  ["an administrator with an unconfirmed address", 403],
  ["an operator idle past twelve hours", 401],
  ["an operator whose session was revoked", 401],
];

const CALLERS_WITH_A_SESSION: Readonly<
  Partial<Record<CallerName, StaffCaller>>
> = {
  "a client with a confirmed address": { role: "client" },
  "a client with an unconfirmed address": { role: "client", isVerified: false },
  "an operator": { role: "operator" },
  "an administrator": { role: "administrator" },
  "an operator with an unconfirmed address": {
    role: "operator",
    isVerified: false,
  },
  "an administrator with an unconfirmed address": {
    role: "administrator",
    isVerified: false,
  },
  "an operator idle past twelve hours": { role: "operator" },
  "an operator whose session was revoked": { role: "operator" },
};

async function cookieOf(name: CallerName): Promise<string | undefined> {
  if (name === "anonymous") return undefined;
  if (name === "a malformed cookie") return cookieOfValue("short");
  const caller = CALLERS_WITH_A_SESSION[name];
  if (caller === undefined) throw new Error(`no caller for ${name}`);
  const { account, session } = await signedInAs(
    caller,
    `${slug(name)}@example.test`,
  );
  if (name === "an operator idle past twelve hours") {
    world.advance(12 * 60 * 60 * 1000 + 1000);
  }
  if (name === "an operator whose session was revoked") {
    await world.sessions.revokeAllForAccount(account.id);
  }
  return session.cookie;
}

function slug(name: string): string {
  return name.replaceAll(/[^a-z]+/g, "-");
}

type Ask = (
  id: string,
  cookie: string | undefined,
  claims?: Claims,
) => Promise<Response>;

interface Claims {
  readonly body?: Readonly<Record<string, unknown>>;
  readonly headers?: Record<string, string>;
}

interface StaffWriteRoute {
  readonly title: string;
  readonly capability: string;
  readonly success: 200 | 201 | 204;
  /** A kitchen the route's success needs: a note needs any, a status a sent one, an unhide a hidden one. */
  readonly plant: () => string;
  readonly ask: Ask;
}

const ROUTES: readonly StaffWriteRoute[] = [
  {
    title: "adding a note",
    capability: "note.write",
    success: 201,
    plant: () => plantActionKitchen().id,
    ask: (id, cookie, claims = {}) =>
      NOTES(
        noteRequest(id, {
          json: { text: "Called the client", ...claims.body },
          ...(cookie === undefined ? {} : { cookie }),
          ...(claims.headers === undefined ? {} : { headers: claims.headers }),
        }),
        { params: Promise.resolve({ id }) },
      ),
  },
  {
    title: "setting a status",
    capability: "contact.update-status",
    success: 200,
    plant: () => plantActionKitchen({ isSent: true }).id,
    ask: (id, cookie, claims = {}) =>
      STATUS(
        statusRequest(id, {
          json: { status: "contacted", ...claims.body },
          ...(cookie === undefined ? {} : { cookie }),
          ...(claims.headers === undefined ? {} : { headers: claims.headers }),
        }),
        { params: Promise.resolve({ id }) },
      ),
  },
  {
    title: "unhiding a kitchen",
    capability: "design.unhide",
    success: 204,
    plant: () => plantActionKitchen({ isHidden: true }).id,
    ask: (id, cookie, claims = {}) =>
      UNHIDE(
        unhideRequest(id, {
          ...(cookie === undefined ? {} : { cookie }),
          ...(claims.headers === undefined ? {} : { headers: claims.headers }),
        }),
        { params: Promise.resolve({ id }) },
      ),
  },
];

function nothingWasWritten(): void {
  expect(actions.calls).toEqual([]);
  expect(staffWorld.audit.heldEvents()).toEqual([]);
}

describe.each(ROUTES)("$title", (route) => {
  it.each(EXPECTED)("answers %s with %s", async (name, expected) => {
    const kitchenId = route.plant();
    const cookie = await cookieOf(name);

    const answer = await route.ask(kitchenId, cookie);

    if (expected === "success") {
      expect(answer.status).toBe(route.success);
      expect(staffWorld.audit.heldEvents()).toHaveLength(1);
      return;
    }
    expect(answer.status).toBe(expected);
    expect(await jsonOf(answer)).toEqual({
      status: expected === 401 ? "unauthenticated" : "forbidden",
    });
    nothingWasWritten();
  });

  it("asks for the capability the plan assigns to the route, and for no other", async () => {
    const kitchenId = route.plant();
    const { session } = await signedInAs({ role: "operator" });
    capabilitiesAsked.length = 0;

    await route.ask(kitchenId, session.cookie);

    expect(capabilitiesAsked).toEqual([route.capability]);
  });

  it("lets no role, capability or account in a header change the answer", async () => {
    const kitchenId = route.plant();
    const client = await signedInAs({ role: "client" });
    const operator = await signedInAs({ role: "operator" });
    const headers = {
      "x-role": "operator",
      "x-capabilities": route.capability,
      "x-account-id": operator.account.id,
      authorization: `Bearer ${operator.account.id}`,
    };

    const asClient = await route.ask(kitchenId, client.session.cookie, {
      headers,
    });
    const asOperatorClaiming = await route.ask(
      kitchenId,
      operator.session.cookie,
      { headers: { "x-role": "client" } },
    );

    expect(asClient.status).toBe(403);
    expect(asOperatorClaiming.status).toBe(route.success);
    expect(staffWorld.audit.heldEvents()).toHaveLength(1);
  });
});

describe("a member of the body that names an account, a role or a capability", () => {
  it.each([
    ["adding a note", ROUTES[0]],
    ["setting a status", ROUTES[1]],
  ] as const)(
    "gives a client 403 and an operator 400 on %s, and writes nothing for either",
    async (_title, route) => {
      if (route === undefined) throw new Error("no route");
      const kitchenId = route.plant();
      const client = await signedInAs({ role: "client" });
      const operator = await signedInAs({ role: "operator" });
      const claims = {
        body: {
          role: "administrator",
          capabilities: [route.capability],
          accountId: operator.account.id,
        },
      };

      const asClient = await route.ask(
        kitchenId,
        client.session.cookie,
        claims,
      );
      const asOperator = await route.ask(
        kitchenId,
        operator.session.cookie,
        claims,
      );

      expect([asClient.status, asOperator.status]).toEqual([403, 400]);
      nothingWasWritten();
    },
  );
});
