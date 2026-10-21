import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  accountRequest,
  captureConsole,
  cookieOfValue,
  freshAccountWorld,
  jsonOf,
  type AccountWorld,
} from "../../../support/account-world";
import {
  freshStaffWorld,
  plantKitchen,
  signedInAs,
  type StaffCaller,
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

const { GET: LIST } = await import("@/app/api/staff/kitchens/route");
const { GET: ONE } = await import("@/app/api/staff/kitchens/[id]/route");

/**
 * For each staff read route and each caller, the answer is `401` without a live session, `403`
 * for a session that does not hold `design.read.any` (a client, or a staff address not yet confirmed), and the route's
 * success otherwise. The table is written out, not derived from `isCapabilityHeld`, so a change to who may read a
 * client's kitchen has to be made here on purpose.
 */

let world: AccountWorld;
let staffWorld: StaffWorld;

beforeEach(() => {
  world = freshAccountWorld();
  staffWorld = freshStaffWorld();
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

const EXPECTED_STATUS: readonly [CallerName, 200 | 401 | 403][] = [
  ["anonymous", 401],
  ["a malformed cookie", 401],
  ["a client with a confirmed address", 403],
  ["a client with an unconfirmed address", 403],
  ["an operator", 200],
  ["an administrator", 200],
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

interface StaffReadRoute {
  readonly title: string;
  readonly path: string;
  readonly isList: boolean;
}

const ROUTES: readonly StaffReadRoute[] = [
  { title: "the list", path: "/api/staff/kitchens", isList: true },
  { title: "one kitchen", path: "/api/staff/kitchens/", isList: false },
];

type RequestClaims = Pick<
  NonNullable<Parameters<typeof accountRequest>[1]>,
  "search" | "headers"
>;

async function ask(
  route: StaffReadRoute,
  cookie?: string,
  claims: RequestClaims = {},
) {
  const { path, isList } = route;
  const request = accountRequest(isList ? path : `${path}${kitchenId}`, {
    ...(cookie === undefined ? {} : { cookie }),
    ...claims,
  });
  return isList
    ? LIST(request)
    : ONE(request, { params: Promise.resolve({ id: kitchenId }) });
}

let kitchenId = "";

beforeEach(() => {
  kitchenId = plantKitchen().id;
});

describe.each(ROUTES)("$title", (route) => {
  it.each(EXPECTED_STATUS)("answers %s with %i", async (name, status) => {
    const cookie = await cookieOf(name);

    const answer = await ask(route, cookie);

    expect(answer.status).toBe(status);
    if (status !== 200) {
      expect(await jsonOf(answer)).toEqual({
        status: status === 401 ? "unauthenticated" : "forbidden",
      });
      expect(staffWorld.calls).toEqual([]);
      expect(staffWorld.audit.heldEvents()).toEqual([]);
    }
  });

  it("lets no role, capability or account in the request change the answer", async () => {
    const client = await signedInAs({ role: "client" });
    const operator = await signedInAs({ role: "operator" });
    const claims = {
      search: "?role=administrator&capabilities=design.read.any&accountId=x",
      headers: {
        "x-role": "operator",
        "x-capabilities": "design.read.any",
        authorization: `Bearer ${operator.account.id}`,
      },
    };

    const asClient = await ask(route, client.session.cookie);
    const asClientClaiming = await ask(route, client.session.cookie, claims);
    const asOperatorClaiming = await ask(route, operator.session.cookie, {
      search: "?role=client",
      headers: { "x-role": "client" },
    });

    expect([asClient.status, asClientClaiming.status]).toEqual([403, 403]);
    expect(asOperatorClaiming.status).toBe(200);
  });
});
