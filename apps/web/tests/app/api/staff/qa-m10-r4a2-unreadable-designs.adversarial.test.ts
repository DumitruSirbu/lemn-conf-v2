// What a count says of a saved design the product cannot open, over the persistence fake. The fake mirrors the Neon reader's
// documented split (`neon-kitchen-usage-reader.ts`, its docstring, and the live reader test for the SQL itself): a tier and a
// linked accessory are read from the stored document as written, so an unreadable design still counts for them; a colour,
// a handle and a built-in accessory are read by opening the design, so it counts for none of them and is logged as a bare
// number. Only the first group can ever decide a deletion.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ItemRef } from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  administrator,
  type Administrator,
} from "../../../support/availability-route-world";
import { readUsage } from "../../../support/price-dashboard-requests";
import {
  ANCHORED_BOOK,
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld } from "../../../support/staff-world";
import { bookOf } from "../../../support/usage-parity-model";

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
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

const VENEER = { kind: "material", tierId: "material.veneer" } as const;
const SOFT_CLOSE = { kind: "hardware", tierId: "hardware.soft-close" } as const;
const NUT_FINISH = { kind: "finish", finishId: "veneer.nuc" } as const;
const BLACK_HANDLE = { kind: "handle", handle: "black" } as const;
const SINK_COVER = {
  kind: "accessory",
  accessoryId: "sinkProtectiveCover",
} as const;
const LINKED = { kind: "accessory", accessoryId: "linked-a" } as const;

let prices: PriceDashboardWorld;
let admin: Administrator;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({
    book: bookOf(
      {
        materialDefault: ANCHORED_BOOK.material.defaultTierId,
        hardwareDefault: ANCHORED_BOOK.hardware.defaultTierId,
        linked: [{ id: "linked-a", row: "wall-cabinet" }],
      },
      ANCHORED_BOOK,
    ),
  });
  admin = await administrator();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  prices.designs.plant({
    designId: "unreadable",
    uses: [VENEER, SOFT_CLOSE, LINKED, NUT_FINISH, BLACK_HANDLE, SINK_COVER],
    isDeletedByClient: false,
    isUnreadable: true,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function countsFor(items: readonly ItemRef[]) {
  const answer = await readUsage({
    cookie: admin.cookie,
    json: { items },
  });
  expect(answer.status).toBe(200);
  return (
    (await jsonOf(answer)) as {
      counts: { item: ItemRef; count: number }[];
    }
  ).counts.map(({ count }) => count);
}

describe("a saved design the product cannot open", () => {
  it("still counts for a tier and a linked accessory, the items a deletion is judged by", async () => {
    const counts = await countsFor([VENEER, SOFT_CLOSE, LINKED]);

    expect(counts).toEqual([1, 1, 1]);
  });

  it("counts for no colour, handle or built-in accessory, and is logged once as a bare number", async () => {
    const counts = await countsFor([NUT_FINISH, BLACK_HANDLE, SINK_COVER]);

    expect(counts).toEqual([0, 0, 0]);
    expect(
      console_.accountLines().filter((line) => "unreadableDesigns" in line),
    ).toEqual([{ event: "staff-price-usage", unreadableDesigns: 1 }]);
  });
});
