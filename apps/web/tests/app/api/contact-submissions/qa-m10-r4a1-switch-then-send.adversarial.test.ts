import {
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
  type ItemRef,
} from "@lemnaria/configurator-domain";
import { FakeContactSubmissionStore } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  administrator,
  allRows,
  availabilityHead,
  switchItem,
  type Administrator,
} from "../../../support/availability-route-world";
import { freshAccountWorld } from "../../../support/account-world";
import {
  forgetHeldPriceStores,
  holdPriceStores,
} from "../../../support/held-price-stores";
import { freshPriceDashboardWorld } from "../../../support/price-dashboard-world";
import { freshStaffWorld } from "../../../support/staff-world";
import {
  bodyOf,
  callbackBodyOf,
} from "../../../lib/server/contact/submit-contact-harness";

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
 * A kitchen sent after an item it uses was switched off through `POST /api/staff/prices/availability`, through the contact
 * route itself: the one price world is shared by both routes, and only what reaches outside the process is a fake. The
 * send is refused, no snapshot is stored and no notice goes out; a send that does not use the item is unaffected.
 */

const PAINTED_MDF: ItemRef = {
  kind: "material",
  tierId: "material.painted-mdf",
};

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
  fakes.design = aDesignWith({ materialTierId: "material.painted-mdf" });
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

async function theAnswerOf(answer: Response): Promise<Record<string, unknown>> {
  return (await answer.json()) as Record<string, unknown>;
}

async function switchedOff(item: ItemRef): Promise<void> {
  const answer = await switchItem(admin.cookie, item, false);
  expect(answer.status).toBe(200);
}

describe("a kitchen sent after an item it uses was switched off", () => {
  it("is refused with CONTACT_DESIGN_NOT_CURRENT, stores no snapshot and sends no notice", async () => {
    await switchedOff(PAINTED_MDF);

    const answer = await send(bodyOf());

    expect(answer.status).toBe(409);
    expect(await theAnswerOf(answer)).toMatchObject({
      code: "CONTACT_DESIGN_NOT_CURRENT",
    });
    expect(store.heldSubmissions()).toHaveLength(0);
    expect(sender.sent).toHaveLength(0);
  });

  it.each<[string, NonNullable<Design["settings"]>, ItemRef]>([
    [
      "a hardware class",
      { hardwareTierId: "hardware.soft-close" },
      { kind: "hardware", tierId: "hardware.soft-close" },
    ],
    ["a handle", { handle: "black" }, { kind: "handle", handle: "black" }],
    [
      "a palette colour",
      {
        materialTierId: "material.melamine",
        finish: paletteFinish("pal.antracit"),
      },
      { kind: "finish", finishId: "pal.antracit" },
    ],
  ])(
    "is refused for %s it uses, and not for the material it also uses",
    async (_kind, settings, item) => {
      fakes.design = aDesignWith(settings);
      await switchedOff(item);

      const answer = await send(bodyOf());

      expect(answer.status).toBe(409);
      expect(await theAnswerOf(answer)).toMatchObject({
        code: "CONTACT_DESIGN_NOT_CURRENT",
      });
      expect(store.heldSubmissions()).toHaveLength(0);
      expect(sender.sent).toHaveLength(0);
    },
  );

  it("is sent when the item switched off is one it does not use", async () => {
    await switchedOff({ kind: "material", tierId: "material.veneer" });

    const answer = await send(bodyOf());

    expect(answer.status).toBe(200);
    expect(store.heldSubmissions()).toHaveLength(1);
    expect(sender.sent).toHaveLength(1);
  });

  it("is sent again once the item is switched back on, with the earlier refusal having left nothing behind", async () => {
    await switchedOff(PAINTED_MDF);
    const refused = await send(bodyOf());
    const switchedBackOn = await switchItem(admin.cookie, PAINTED_MDF, true);

    const answer = await send(bodyOf());

    expect(refused.status).toBe(409);
    expect(switchedBackOn.status).toBe(200);
    expect(answer.status).toBe(200);
    expect(store.heldSubmissions()).toHaveLength(1);
  });

  it("does not stop a callback, which prices nothing", async () => {
    await switchedOff(PAINTED_MDF);

    const answer = await send(callbackBodyOf());

    expect(answer.status).toBe(200);
    expect(store.heldSubmissions()).toHaveLength(1);
  });

  it("does not take a refused switch for a switch: an item that cannot be switched off keeps the kitchen sendable", async () => {
    const headBefore = await availabilityHead();
    fakes.design = aDesignWith({ materialTierId: "material.melamine" });

    const refusedSwitch = await switchItem(
      admin.cookie,
      { kind: "material", tierId: "material.melamine" },
      false,
    );
    const answer = await send(bodyOf());

    expect(refusedSwitch.status).toBe(409);
    expect(await availabilityHead()).toBe(headBefore);
    expect(answer.status).toBe(200);
    expect(
      allRows().filter(
        ({ action }) => action === "catalogue-item-active-changed",
      ),
    ).toHaveLength(0);
  });
});
