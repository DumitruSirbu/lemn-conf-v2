import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardStoreError } from "@lemnaria/persistence";

import {
  readKitchenDefaultsForAdmittedPage,
  readNewKitchenDefaults,
} from "@/lib/server/price-dashboard/new-kitchen-defaults";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import { forgetHeldPriceStores } from "../../../support/held-price-stores";
import {
  FIXED_DEFAULTS,
  putDefaults,
} from "../../../support/kitchen-defaults-route-world";
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
 * The defaults in production with no database to connect to, through the real `getPriceStores`: the stores are the
 * unavailable ones, so the staff write is `503` and nothing is made up, and a customer's new kitchen still starts from the
 * fixed fallbacks.
 */

const A_SAVE = {
  expectedRevision: "0",
  expectedAvailabilityRevision: "0",
  defaults: FIXED_DEFAULTS,
};

let staffWorld: StaffWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv("DATABASE_URL", "");
  forgetHeldPriceStores();
});

afterEach(() => {
  forgetHeldPriceStores();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the defaults save in production with no database", () => {
  it("answers 503 with no detail for an administrator, writes no audit row, and makes up no book", async () => {
    const { session } = await signedInAs({ role: "administrator" });

    const answer = await putDefaults({ cookie: session.cookie, json: A_SAVE });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(console_.everything()).not.toMatch(/sample|seed/i);
  });

  it("answers 503 for a save that changes something as well as for one of the fixed fallbacks", async () => {
    const { session } = await signedInAs({ role: "administrator" });

    const answer = await putDefaults({
      cookie: session.cookie,
      json: { ...A_SAVE, defaults: { ...FIXED_DEFAULTS, handle: "black" } },
    });

    expect(answer.status).toBe(503);
  });

  it("still refuses an operator with 403 and an anonymous caller with 401, before any store is asked", async () => {
    const { session } = await signedInAs({ role: "operator" });

    const operator = await putDefaults({
      cookie: session.cookie,
      json: A_SAVE,
    });
    const anonymous = await putDefaults({ json: A_SAVE });

    expect([operator.status, anonymous.status]).toEqual([403, 401]);
  });
});

describe("the reads in production with no database", () => {
  it("gives a customer's new kitchen the fixed fallbacks of the four settings no book is needed for, and one line", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const read = await readNewKitchenDefaults();

    expect(read).toEqual({
      cabinetDepthMm: FIXED_DEFAULTS.cabinetDepthMm,
      finish: FIXED_DEFAULTS.finish,
      handle: FIXED_DEFAULTS.handle,
      topRowHandle: FIXED_DEFAULTS.topRowHandle,
    });
    expect(error.mock.calls).toEqual([
      [
        "[new-kitchen-defaults]",
        { event: "fixed-fallbacks", cause: "store-unavailable" },
      ],
    ]);
  });

  it("shows the page nothing: the read fails on the store's own refusal and invents no defaults", async () => {
    await expect(readKitchenDefaultsForAdmittedPage()).rejects.toBeInstanceOf(
      DashboardStoreError,
    );
  });
});
