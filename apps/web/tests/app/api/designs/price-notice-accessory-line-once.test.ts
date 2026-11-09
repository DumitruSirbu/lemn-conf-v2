import { SAMPLE_PRICE_BOOK, type ItemRef } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  writeWithoutJudgement,
  type Administrator,
} from "../../../support/availability-route-world";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  OWNER_WRITE_COOKIE,
  OWNER_WRITE_TOKEN_HASH,
  freshEditableDesigns,
  makePriceStoresReject,
} from "../../../support/price-notice-stubs";
import { acknowledge, readNotice } from "../../../support/price-notice-world";

/**
 * Q3-f (OQ-4), route level: an accessory taken out of the kitchen is reported once per switching-off that the owner has
 * not acknowledged, and not again after the acknowledgement of the pair they were shown. The client's C1 (the info line
 * under `removedAccessories`) is only as good as this.
 */

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-notice-stubs").then((world) =>
    world.rejectablePriceStoresModule(),
  ),
);
vi.mock("@/lib/server/repository", () =>
  import("../../../support/price-notice-stubs").then((world) =>
    world.editableRepositoryModule(),
  ),
);

const DISH_RACK: ItemRef = { kind: "accessory", accessoryId: "dishDryingRack" };

let priceWorld: PriceDashboardWorld;
let staff: Administrator;

beforeEach(async () => {
  freshAccountWorld();
  limiterLedger.subjects.push({
    kind: "write-credential",
    subject: OWNER_WRITE_TOKEN_HASH,
  });
  priceWorld = await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  freshEditableDesigns();
  makePriceStoresReject(undefined);
  staff = await administrator();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function removedAccessoryIds(): Promise<readonly string[]> {
  const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });
  expect(answer.status).toBe(200);
  const body = (await jsonOf(answer)) as {
    removedAccessories: readonly { accessoryId: string }[];
  };
  return body.removedAccessories.map(({ accessoryId }) => accessoryId);
}

async function pairNow() {
  const active = await priceWorld.stores.priceBook.readActive();
  if (active.kind !== "found") throw new Error("no active version");
  return {
    versionId: active.version.versionId,
    availabilityRevision: (await priceWorld.stores.availability.readCurrent())
      .revision,
  };
}

async function send(pair: unknown): Promise<Response> {
  return acknowledge({ cookie: OWNER_WRITE_COOKIE, json: pair });
}

describe("an accessory taken out of the kitchen", () => {
  it("is reported on every open until the displayed pair is acknowledged, then not again", async () => {
    expect(await removedAccessoryIds()).toEqual([]);
    await writeWithoutJudgement(staff, DISH_RACK, false);
    const displayedAfterTheSwitchOff = await pairNow();

    expect(await removedAccessoryIds()).toEqual(["dishDryingRack"]);
    expect(await removedAccessoryIds()).toEqual(["dishDryingRack"]);
    expect((await send(displayedAfterTheSwitchOff)).status).toBe(200);

    expect(await removedAccessoryIds()).toEqual([]);
  });

  it("is reported again after an acknowledgement of the pair from before the switching-off", async () => {
    await removedAccessoryIds();
    const displayedBeforeTheSwitchOff = await pairNow();
    await writeWithoutJudgement(staff, DISH_RACK, false);

    expect((await send(displayedBeforeTheSwitchOff)).status).toBe(200);

    expect(await removedAccessoryIds()).toEqual(["dishDryingRack"]);
  });

  it("is reported once more for a second switching-off after the first was acknowledged", async () => {
    await removedAccessoryIds();
    await writeWithoutJudgement(staff, DISH_RACK, false);
    await removedAccessoryIds();
    await send(await pairNow());
    await writeWithoutJudgement(staff, DISH_RACK, true);
    await send(await pairNow());
    expect(await removedAccessoryIds()).toEqual([]);

    await writeWithoutJudgement(staff, DISH_RACK, false);

    expect(await removedAccessoryIds()).toEqual(["dishDryingRack"]);
  });
});
