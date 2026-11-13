import {
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  paletteFinish,
  type Design,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { FakeContactSubmissionStore } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  administrator,
  publishNextVersion,
  disabledNow,
  writeWithoutJudgement,
  type Administrator,
} from "../../../support/availability-route-world";
import { freshAccountWorld } from "../../../support/account-world";
import {
  forgetHeldPriceStores,
  holdPriceStores,
} from "../../../support/held-price-stores";
import { freshPriceDashboardWorld } from "../../../support/price-dashboard-world";
import { freshStaffWorld } from "../../../support/staff-world";
import { bodyOf } from "../../../lib/server/contact/submit-contact-harness";

const fakes = vi.hoisted(() => ({
  store: undefined as unknown,
  sender: undefined as unknown,
  design: undefined as unknown,
}));

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
vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => fakes.store,
}));
vi.mock("@/lib/server/contact/sent-mark-store-instance", () =>
  import("../../../support/sent-mark-store-fake").then((fake) =>
    fake.fakeSentMarkStoreModule(),
  ),
);
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () => ({ kind: "sender", sender: fakes.sender }),
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: () =>
    Promise.resolve({ kind: "found", design: fakes.design, revision: "1" }),
}));

const { POST: SEND } = await import(
  "../../../../src/app/api/contact-submissions/route"
);

/**
 * M10 Q3a, Q3-g: a kitchen that names a material or hardware tier the active book does not hold is a replacement, and
 * the contact route refuses a replacement as `409 CONTACT_DESIGN_NOT_CURRENT` and stores no snapshot (plan, Q3 split,
 * point 9). Before Q3a the same kitchen was `UNKNOWN_TIER`, which the route answers as an unexpected failure.
 */

let store: FakeContactSubmissionStore;
let sender: ReturnType<typeof createFakeMailSender>;
let admin: Administrator;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  const prices = await freshPriceDashboardWorld();
  holdPriceStores(prices.stores);
  admin = await administrator();
  store = new FakeContactSubmissionStore();
  sender = createFakeMailSender();
  fakes.store = store;
  fakes.sender = sender;
  fakes.design = KITCHEN_L_DESIGN;
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  forgetHeldPriceStores();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function aDesignWith(settings: NonNullable<Design["settings"]>): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, ...settings },
  };
}

function send(body: string): Promise<Response> {
  return SEND(
    new NextRequest("https://lemnaria.test/api/contact-submissions", {
      method: "POST",
      body,
      headers: {
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
    }),
  );
}

async function expectRefusedAsNotCurrent(answer: Response): Promise<void> {
  expect(answer.status).toBe(409);
  expect(await answer.json()).toMatchObject({
    code: "CONTACT_DESIGN_NOT_CURRENT",
  });
  expect(store.heldSubmissions()).toHaveLength(0);
  expect(sender.sent).toHaveLength(0);
}

function withoutMaterialTier(book: PriceBook, tierId: string): PriceBook {
  return {
    ...book,
    material: {
      ...book.material,
      tiers: book.material.tiers.filter((tier) => tier.tierId !== tierId),
    },
  };
}

describe("a kitchen sent while it names a tier the active book does not hold", () => {
  it.each<[string, NonNullable<Design["settings"]>]>([
    ["a material", { materialTierId: "material.ghost" }],
    ["a hardware class", { hardwareTierId: "hardware.ghost" }],
    [
      "both",
      { materialTierId: "material.ghost", hardwareTierId: "hardware.ghost" },
    ],
    [
      "a material that no declaration names, wearing a palette colour",
      {
        materialTierId: "material.ghost",
        finish: paletteFinish("pal.antracit"),
      },
    ],
  ])(
    "is refused CONTACT_DESIGN_NOT_CURRENT for %s, stores no snapshot and sends no notice",
    async (_name, settings) => {
      fakes.design = aDesignWith(settings);

      await expectRefusedAsNotCurrent(await send(bodyOf()));
    },
  );

  it("is refused once a publish has deleted the tier the kitchen wears, and sent again under a book that holds it", async () => {
    fakes.design = aDesignWith({ materialTierId: "material.veneer" });
    const published = await publishNextVersion(
      admin,
      withoutMaterialTier(SAMPLE_PRICE_BOOK, "material.veneer"),
    );
    expect(published.kind).toBe("ok");

    await expectRefusedAsNotCurrent(await send(bodyOf()));

    expect((await publishNextVersion(admin, SAMPLE_PRICE_BOOK)).kind).toBe(
      "ok",
    );
    expect((await send(bodyOf())).status).toBe(200);
    expect(store.heldSubmissions()).toHaveLength(1);
  });

  it("is refused when availability also lists the vanished tier, and leaves nothing behind", async () => {
    const ghost: ItemRef = { kind: "material", tierId: "material.ghost" };
    fakes.design = aDesignWith({ materialTierId: "material.ghost" });
    // The staff route would refuse an id no book holds, so the row is written past it, as the notice suite does.
    await writeWithoutJudgement(admin, ghost, false);
    expect(await disabledNow()).toContainEqual(ghost);

    await expectRefusedAsNotCurrent(await send(bodyOf()));
  });
});
