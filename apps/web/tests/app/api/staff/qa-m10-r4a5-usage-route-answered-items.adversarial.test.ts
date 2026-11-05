// Adversarial QA of which items the usage route still answers once it leaves out the tiers and linked accessories its
// active book does not state. What it answers it answers per item and per kind, up to the bound, and what it leaves out it
// leaves out whole.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ItemRef } from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { MAX_USAGE_ITEMS } from "@/price-dashboard/price-dashboard-wire-contract";

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
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld } from "../../../support/staff-world";

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

let prices: PriceDashboardWorld;
let admin: Administrator;

async function startWorld(): Promise<void> {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  admin = await administrator();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
}

beforeEach(async () => {
  await startWorld();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function count(items: unknown) {
  return readUsage({ cookie: admin.cookie, json: { items } });
}

function plant(designId: string, uses: readonly ItemRef[]): void {
  prices.designs.plant({ designId, uses, isDeletedByClient: false });
}

describe("items of kinds the route always answers", () => {
  it("answers a colour and a handle that share an id as two items, each with its own count", async () => {
    const colour: ItemRef = { kind: "finish", finishId: "black" };
    const handle: ItemRef = { kind: "handle", handle: "black" };
    plant("d1", [handle]);
    plant("d2", [handle]);
    plant("d3", [colour]);

    const answer = await count([colour, handle]);

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({
      counts: [
        { item: colour, count: 1 },
        { item: handle, count: 2 },
      ],
    });
  });

  it("answers the most distinct colours one request may name, one entry each, and refuses one more", async () => {
    const colours: ItemRef[] = Array.from(
      { length: MAX_USAGE_ITEMS + 1 },
      (_, place) => ({ kind: "finish", finishId: `colour-${String(place)}` }),
    );

    const atTheBound = await count(colours.slice(0, MAX_USAGE_ITEMS));
    const overIt = await count(colours);

    expect(atTheBound.status).toBe(200);
    expect(
      ((await jsonOf(atTheBound)) as { counts: unknown[] }).counts,
    ).toHaveLength(MAX_USAGE_ITEMS);
    expect(overIt.status).toBe(400);
  });

  it("answers a colour named in the other order of members as the same item, so 50 distinct and a twin of the first are one entry each", async () => {
    const colours = Array.from({ length: MAX_USAGE_ITEMS }, (_, place) => ({
      kind: "finish",
      finishId: `colour-${String(place)}`,
    }));
    const body = `{"items":[${[
      ...colours.map((item) => JSON.stringify(item)),
      `{"finishId":"colour-0","kind":"finish"}`,
    ].join(",")}]}`;

    const answer = await readUsage({ cookie: admin.cookie, json: body });

    expect(answer.status).toBe(200);
    expect(
      ((await jsonOf(answer)) as { counts: unknown[] }).counts,
    ).toHaveLength(MAX_USAGE_ITEMS);
  });
});

describe("what the route leaves out", () => {
  it("leaves out a stated item's unstated neighbours in every position, whatever the order asked", async () => {
    const stated: ItemRef = { kind: "material", tierId: "material.melamine" };
    const unstated = (place: number): ItemRef => ({
      kind: "hardware",
      tierId: `hardware.gone-${String(place)}`,
    });
    plant("d1", [stated]);

    for (const asked of [
      [stated, unstated(1), unstated(2)],
      [unstated(1), stated, unstated(2)],
      [unstated(1), unstated(2), stated],
    ]) {
      const answer = await count(asked);

      expect(await jsonOf(answer)).toEqual({
        counts: [{ item: stated, count: 1 }],
      });
    }
  });
});
