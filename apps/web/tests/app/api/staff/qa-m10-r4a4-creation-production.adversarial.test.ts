import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HARDWARE_RATE_FIELDS } from "@lemnaria/configurator-domain";

import { getPriceStores } from "@/lib/server/price-stores";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import { forgetHeldPriceStores } from "../../../support/held-price-stores";
import {
  createAccessoryInDraft,
  createHardwareClassInDraft,
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

// The two creation routes in production with no database to connect to, through the real `getPriceStores`: the stores are
// the unavailable ones, so nothing is read, nothing is written, no id is made up and no book is invented.

const CLASS_BODY = {
  expectedDraftRevision: "0",
  value: { name: "GTV Economic", description: "Mecanisme simple" },
  rates: Object.fromEntries(
    HARDWARE_RATE_FIELDS.map((field) => [field, 2_000]),
  ),
};
const ACCESSORY_BODY = {
  expectedDraftRevision: "0",
  value: { linkedBuildId: "base-3drawer", perUnitMinor: 1_000, name: "Soclu" },
};
const ROUTES = [
  ["hardware-class", createHardwareClassInDraft, CLASS_BODY],
  ["accessory", createAccessoryInDraft, ACCESSORY_BODY],
] as const;

let staffWorld: StaffWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  forgetHeldPriceStores();
});

afterEach(() => {
  forgetHeldPriceStores();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a creation in production with no database", () => {
  it.each(ROUTES)(
    "answers 503 unavailable to an administrator on %s, writes no audit row, and makes up no book or id",
    async (_, create, json) => {
      const { session } = await signedInAs({ role: "administrator" });

      const answer = await create({ cookie: session.cookie, json });

      expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
        status: 503,
        body: { status: "unavailable" },
      });
      expect(staffWorld.audit.heldEvents()).toEqual([]);
      expect(console_.everything()).not.toMatch(/sample|seed/i);
    },
  );

  it.each(ROUTES)(
    "answers 503 on %s for every draft revision a client names, never a 200 or a 409 that would mean a draft was read",
    async (_, create, json) => {
      const { session } = await signedInAs({ role: "administrator" });

      const statuses: number[] = [];
      for (const expectedDraftRevision of ["0", "1", "999999"]) {
        const answer = await create({
          cookie: session.cookie,
          json: { ...json, expectedDraftRevision },
        });
        statuses.push(answer.status);
      }

      expect(new Set(statuses)).toEqual(new Set([503]));
    },
  );

  it.each(ROUTES)(
    "still refuses an operator on %s with 403 and an anonymous caller with 401, before any store is asked",
    async (_, create, json) => {
      const { session } = await signedInAs({ role: "operator" });

      const operator = await create({ cookie: session.cookie, json });
      const anonymous = await create({ json });

      expect([operator.status, anonymous.status]).toEqual([403, 401]);
    },
  );

  it("holds a price-book store whose draft cannot be read, so no creation has a draft to start from", async () => {
    const stores = await getPriceStores();

    await expect(stores.priceBook.readDraft()).rejects.toBeInstanceOf(Error);
  });
});
