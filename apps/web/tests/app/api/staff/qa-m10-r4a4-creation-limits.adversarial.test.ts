import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
} from "@lemnaria/configurator-domain";

import { jsonOf } from "../../../support/account-world";
import {
  createAccessoryAs,
  createClassAs,
  startCreationWorld,
  storedChangesOf,
  type CreationWorld,
} from "../../../support/creation-world";

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

// A person who keeps creating rows reaches the book's bounds on how many classes and linked accessories it holds. The
// creation that would pass a bound is a refusal the person can read, not a book the server cannot make.

let world: CreationWorld;

beforeEach(async () => {
  world = await startCreationWorld(SAMPLE_PRICE_BOOK);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const MOST_ACCESSORIES = 50;
const MOST_CLASSES = 20;

async function createUntilRefused(
  create: () => Promise<Response>,
  attempts: number,
): Promise<{ made: number; refusal: Response }> {
  for (let made = 0; made < attempts; made += 1) {
    const answer = await create();
    if (answer.status !== 200) return { made, refusal: answer };
  }
  throw new Error(`${String(attempts)} creations were all accepted`);
}

describe("creating past the book's bounds", () => {
  it("takes accessories up to the fiftieth, and the one past it writes nothing", async () => {
    const { made, refusal } = await createUntilRefused(
      () => createAccessoryAs(world.cookie),
      MOST_ACCESSORIES + 2,
    );

    expect(made).toBe(
      MOST_ACCESSORIES - SAMPLE_PRICE_BOOK.linkedAccessories.length,
    );
    expect(refusal.status).not.toBe(200);
    expect(await storedChangesOf(world.prices)).toHaveLength(made);
  });

  it("takes classes up to the twentieth, and the one past it writes nothing", async () => {
    const { made, refusal } = await createUntilRefused(
      () => createClassAs(world.cookie),
      MOST_CLASSES + 2,
    );

    expect(made).toBe(MOST_CLASSES - SAMPLE_PRICE_BOOK.hardware.tiers.length);
    expect(refusal.status).not.toBe(200);
    expect(await storedChangesOf(world.prices)).toHaveLength(
      made * (1 + HARDWARE_RATE_FIELDS.length),
    );
  });

  it.fails(
    "refuses the accessory past the fiftieth with a refusal the person can read, not candidate-refused",
    async () => {
      const { refusal } = await createUntilRefused(
        () => createAccessoryAs(world.cookie),
        MOST_ACCESSORIES + 2,
      );

      expect(refusal.status).toBe(400);
      expect(await jsonOf(refusal)).not.toEqual({
        status: "candidate-refused",
      });
    },
  );

  it.fails(
    "refuses the class past the twentieth with a refusal the person can read, not candidate-refused",
    async () => {
      const { refusal } = await createUntilRefused(
        () => createClassAs(world.cookie),
        MOST_CLASSES + 2,
      );

      expect(refusal.status).toBe(400);
      expect(await jsonOf(refusal)).not.toEqual({
        status: "candidate-refused",
      });
    },
  );
});
