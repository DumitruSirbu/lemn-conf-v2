import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRICE_STORES_GLOBAL_KEY } from "@/lib/server/price-stores";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  bulkDraft,
  changeDraft,
  readState,
  revertDraft,
} from "../../../support/price-dashboard-requests";
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
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);

/**
 * The dashboard routes in production, where the price stores are the unavailable ones until the database-backed stores
 * exist (R1, A-10): nothing is read, nothing is written, and every route says so with the one `503` and no detail. These
 * tests use the real `getPriceStores`, not a world: a deployment variable is set, which is how production is chosen.
 */

let staffWorld: StaffWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  (globalThis as Record<symbol, unknown>)[PRICE_STORES_GLOBAL_KEY] = undefined;
});

afterEach(() => {
  (globalThis as Record<symbol, unknown>)[PRICE_STORES_GLOBAL_KEY] = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const CHANGE = { address: { kind: "depth-rule" }, value: 20 };

describe.each([
  ["GET /api/staff/prices", (cookie: string) => readState({ cookie })],
  [
    "PUT /api/staff/prices/draft",
    (cookie: string) =>
      changeDraft({
        cookie,
        json: { expectedDraftRevision: "0", change: CHANGE },
      }),
  ],
  [
    "DELETE /api/staff/prices/draft",
    (cookie: string) =>
      revertDraft({
        cookie,
        json: {
          expectedDraftRevision: "0",
          target: { kind: "change", address: CHANGE.address },
        },
      }),
  ],
  [
    "POST /api/staff/prices/bulk",
    (cookie: string) =>
      bulkDraft({
        cookie,
        json: {
          expectedDraftRevision: "0",
          target: { scope: "all" },
          percent: 5,
        },
      }),
  ],
])("%s in production", (_name, ask) => {
  it("answers 503 with no detail for an administrator, and leaves no audit row", async () => {
    const { session } = await signedInAs({ role: "administrator" });

    const answer = await ask(session.cookie);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(console_.everything()).not.toMatch(/sample|seed/i);
  });

  it("still refuses an operator with 403 before any store is asked", async () => {
    const { session } = await signedInAs({ role: "operator" });

    const answer = await ask(session.cookie);

    expect(answer.status).toBe(403);
  });
});
