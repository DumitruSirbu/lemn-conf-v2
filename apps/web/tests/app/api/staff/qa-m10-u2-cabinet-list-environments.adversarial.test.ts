// Adversarial QA of M10 wave U2, the cabinet list in every environment a server can be started in. The developer removed the
// list source from the production-build predicate (`publish-source.test.ts`) and rewrote the U1 guards that held it, on the
// ground that the dashboard's read now answers 503 where the stores are the unavailable ones. That ground is
// `selectPriceStores`; the only test of it through the list is one environment (a test run that names a network source).
// This file walks the environments and asks the list's source, with the real `getPriceStores`, in each.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readCabinetList } from "@/price-dashboard/cabinet-list-source";
import {
  FAKE_PRICE_BOOK_FLAG,
  FAKE_PRICE_BOOK_FLAG_ENABLED,
} from "@/lib/server/fake-price-book-flag";
import { PRICE_STORES_GLOBAL_KEY } from "@/lib/server/price-stores";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
} from "../../../support/account-world";
import { readRequest } from "../../../support/price-dashboard-requests";
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

let staffWorld: StaffWorld;
let console_: ReturnType<typeof captureConsole>;

function forgetTheStores(): void {
  (globalThis as Record<symbol, unknown>)[PRICE_STORES_GLOBAL_KEY] = undefined;
}

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  console_ = captureConsole();
  forgetTheStores();
  for (const name of [
    "VERCEL_ENV",
    FAKE_PRICE_BOOK_FLAG,
    CLIENT_NETWORK_SOURCE_VARIABLE,
  ]) {
    vi.stubEnv(name, undefined);
  }
});

afterEach(() => {
  forgetTheStores();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function listAsAdministrator(cookie?: string) {
  const session = {
    cookie:
      cookie ?? (await signedInAs({ role: "administrator" })).session.cookie,
  };
  const request = readRequest({ cookie: session.cookie });
  return readCabinetList({
    cookies: request.cookies,
    headers: request.headers,
  });
}

interface Environment {
  readonly name: string;
  readonly variables: Readonly<Record<string, string | undefined>>;
}

const PRODUCTION_LIKE: readonly Environment[] = [
  { name: "a production build", variables: { NODE_ENV: "production" } },
  { name: "a build with no mode named", variables: { NODE_ENV: undefined } },
  { name: "a mode nobody defined", variables: { NODE_ENV: "staging" } },
  { name: "a mode in other letters", variables: { NODE_ENV: "Development" } },
  {
    name: "a test mode on a deployment that names its network source",
    variables: { NODE_ENV: "test", [CLIENT_NETWORK_SOURCE_VARIABLE]: "vercel" },
  },
  {
    name: "a development mode on a deployment that names its network source",
    variables: {
      NODE_ENV: "development",
      [CLIENT_NETWORK_SOURCE_VARIABLE]: "vercel",
    },
  },
  {
    name: "a Vercel environment in test mode",
    variables: { NODE_ENV: "test", VERCEL_ENV: "production" },
  },
  {
    name: "a Vercel preview with the end-to-end flag set",
    variables: {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      [FAKE_PRICE_BOOK_FLAG]: FAKE_PRICE_BOOK_FLAG_ENABLED,
    },
  },
  {
    name: "a production build with a flag that is not exactly the enabling value",
    variables: { NODE_ENV: "production", [FAKE_PRICE_BOOK_FLAG]: "true" },
  },
  {
    name: "a production build with the flag padded",
    variables: { NODE_ENV: "production", [FAKE_PRICE_BOOK_FLAG]: " 1" },
  },
];

describe("an administrator's list where the stores are the ones of production", () => {
  it.each(PRODUCTION_LIKE.map((env) => [env.name, env] as const))(
    "is unavailable, leaves no audit row and no word of a sample in the log: %s",
    async (_name, environment) => {
      for (const [name, value] of Object.entries(environment.variables)) {
        vi.stubEnv(name, value);
      }

      const { session } = await signedInAs({ role: "administrator" });
      for (let ask = 0; ask < 2; ask += 1) {
        expect(await listAsAdministrator(session.cookie)).toEqual({
          kind: "unavailable",
        });
      }

      expect(staffWorld.audit.heldEvents()).toEqual([]);
      expect(console_.everything()).not.toMatch(/sample|seed|396000/i);
    },
  );
});

describe("the same source where the seeded stores are meant to serve", () => {
  it.each([
    ["a development server", { NODE_ENV: "development" }],
    ["a test run", { NODE_ENV: "test" }],
    [
      "the end-to-end server, a production build with its flag",
      {
        NODE_ENV: "production",
        [FAKE_PRICE_BOOK_FLAG]: FAKE_PRICE_BOOK_FLAG_ENABLED,
      },
    ],
  ] as const)(
    "is the list, as the control that the cases above are refusals and not a broken world: %s",
    async (_name, variables) => {
      for (const [name, value] of Object.entries(variables)) {
        vi.stubEnv(name, value);
      }

      const read = await listAsAdministrator();

      expect(read.kind).toBe("ready");
    },
  );
});
