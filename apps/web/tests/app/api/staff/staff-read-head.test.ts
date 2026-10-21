import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  accountRequest,
  freshAccountWorld,
  limiterLedger,
  type AccountWorld,
} from "../../../support/account-world";
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

const listModule = await import("@/app/api/staff/kitchens/route");
const oneModule = await import("@/app/api/staff/kitchens/[id]/route");

/**
 * `HEAD` on a staff read is refused and does nothing else. Left undeclared, the framework runs `GET` for it, which
 * would read clients, spend a bucket and write an audit row for a request that wants no body.
 */

let world: AccountWorld;
let staffWorld: StaffWorld;

beforeEach(() => {
  world = freshAccountWorld();
  staffWorld = freshStaffWorld();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The handler is declared with no parameters; the framework hands every handler the request and its context, so a
 *  handler that delegates to `GET` would have both to work with, and is called with both here. */
type FrameworkHandler = (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Response | Promise<Response>;

async function headOf(path: string, cookie: string | undefined) {
  const request = accountRequest(path, {
    method: "HEAD",
    ...(cookie === undefined ? {} : { cookie }),
    headers: { "x-forwarded-for": "192.0.2.10" },
  });
  const id = path.split("/").at(-1) ?? "";
  const handler: FrameworkHandler =
    path === "/api/staff/kitchens" ? listModule.HEAD : oneModule.HEAD;
  return handler(request, { params: Promise.resolve({ id }) });
}

describe("HEAD", () => {
  it.each([
    ["the list", "/api/staff/kitchens"],
    ["one kitchen", "/api/staff/kitchens/KITCHEN_ID"],
  ])(
    "on %s answers 405 with no-store headers and no body, to a staff session and to nobody alike",
    async (_title, template) => {
      const { session } = await signedInAs({ role: "operator" });
      const kitchen = plantKitchen();
      const path = template.replace("KITCHEN_ID", kitchen.id);

      const signedIn = await headOf(path, session.cookie);
      const anonymous = await headOf(path, undefined);

      for (const answer of [signedIn, anonymous]) {
        expect(answer.status).toBe(405);
        expect(answer.headers.get("cache-control")).toBe("private, no-store");
        expect(answer.headers.get("allow")).toBe("GET");
        expect(await answer.text()).toBe("");
      }
    },
  );

  it("reads no session, counts no bucket, asks no store and writes no audit row", async () => {
    const { session } = await signedInAs({ role: "operator" });
    const kitchen = plantKitchen();
    world.calls.length = 0;
    limiterLedger.counted.length = 0;

    await headOf("/api/staff/kitchens", session.cookie);
    await headOf(`/api/staff/kitchens/${kitchen.id}`, session.cookie);

    expect(world.calls).toEqual([]);
    expect(staffWorld.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });
});
