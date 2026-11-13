// @vitest-environment happy-dom
//
// The creation forms as a production build hands them to a person: no client is passed, so the screens write through the
// browser's own, and the server's page carries no sample defaults or usage. Create is on once every value is valid, a
// press sends one request to the route of its kind, and the request names no id.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  hardwareRatesOf,
  SAMPLE_PRICE_BOOK,
} from "@lemnaria/configurator-domain";

import { AccessoryCreateScreen } from "@/price-dashboard/accessory-create";
import { HardwareCreateScreen } from "@/price-dashboard/hardware-create";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import { mountInCatalogue, requireIn } from "../support/render-with-intl";
import { LINKED_BUILD_ID, accessoryPageOf } from "./accessory-harness";
import { buttonNamed, typeInField } from "./cabinet-detail-harness";
import { hardwarePageOf, press } from "./hardware-harness";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const CANNOT_JUDGE = roCopy("priceDashboard.lifecycle.cannotJudge");
const HARDWARE_ADDRESS = "/api/staff/prices/draft/hardware-class";
const ACCESSORY_ADDRESS = "/api/staff/prices/draft/accessory";
const PRICE_LABELS = [
  "priceDashboard.hardware.priceHinge",
  "priceDashboard.hardware.priceSlide",
  "priceDashboard.hardware.pricePush",
  "priceDashboard.hardware.priceLift",
  "priceDashboard.hardware.pricePushRunner",
] as const;

let unmount: (() => void) | undefined;
let creations: { address: string; init: RequestInit }[];

beforeEach(() => {
  stubTheStaffServer();
  vi.stubEnv("NODE_ENV", "production");
  creations = [];
  const staffServer = globalThis.fetch;
  vi.stubGlobal("fetch", (address: string, init: RequestInit = {}) => {
    if (address !== HARDWARE_ADDRESS && address !== ACCESSORY_ADDRESS) {
      return staffServer(address, init);
    }
    creations.push({ address, init });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          draft: { draftRevision: "9", changes: [] },
          created:
            address === HARDWARE_ADDRESS
              ? { kind: "hardware", tierId: "Minted0123456789abcdef" }
              : { kind: "accessory", accessoryId: "Minted0123456789abcdef" },
        }),
        { status: 200 },
      ),
    );
  });
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
  vi.unstubAllEnvs();
});

const productionHardwarePage = () => ({
  ...hardwarePageOf({ defaults: undefined }),
  sampleUsage: undefined,
});

function bodyOfTheCreation(): Record<string, unknown> {
  const [creation] = creations;
  return JSON.parse((creation?.init.body ?? "{}") as string) as Record<
    string,
    unknown
  >;
}

describe("the hardware class form, left with the browser's own client", () => {
  async function fillTheClassForm(container: HTMLElement): Promise<void> {
    typeInField(
      container,
      roCopy("priceDashboard.hardware.nameLabel"),
      "GTV Economic",
    );
    typeInField(
      container,
      roCopy("priceDashboard.hardware.descriptionLabel"),
      "Mecanisme simple",
    );
    for (const label of PRICE_LABELS) {
      typeInField(container, roCopy(label), "10");
    }
    await flushPromises(3);
  }

  it("turns Create on once every value is valid, with no reason that nothing can be checked", async () => {
    const page = productionHardwarePage();
    const screen = mountInCatalogue(
      createElement(HardwareCreateScreen, {
        locale: "ro",
        context: contextOf("administrator", [
          "kitchens",
          "hardware",
          "publish",
        ]),
        page,
      }),
      "ro",
    );
    unmount = screen.unmount;
    await flushPromises(5);

    await fillTheClassForm(screen.container);

    const create = buttonNamed(
      screen.container,
      roCopy("priceDashboard.hardware.createAction"),
    );
    expect(create).toHaveProperty("disabled", false);
    expect(screen.container.textContent).not.toContain(CANNOT_JUDGE);
    expect(creations).toEqual([]);
  });

  it("sends one POST to the class route when Create is pressed, naming no id and one rate for each mechanism the book states", async () => {
    const page = productionHardwarePage();
    const screen = mountInCatalogue(
      createElement(HardwareCreateScreen, {
        locale: "ro",
        context: contextOf("administrator", [
          "kitchens",
          "hardware",
          "publish",
        ]),
        page,
      }),
      "ro",
    );
    unmount = screen.unmount;
    await flushPromises(5);
    await fillTheClassForm(screen.container);

    await press(
      buttonNamed(
        screen.container,
        roCopy("priceDashboard.hardware.createAction"),
      ),
    );

    expect(creations).toHaveLength(1);
    expect(creations[0]?.address).toBe(HARDWARE_ADDRESS);
    expect(creations[0]?.init.method).toBe("POST");
    const body = bodyOfTheCreation();
    expect(Object.keys(body).sort()).toEqual([
      "expectedDraftRevision",
      "rates",
      "value",
    ]);
    expect(body.expectedDraftRevision).toBe(page.state.draft.draftRevision);
    expect(Object.keys(body.rates as object).sort()).toEqual(
      [...hardwareRatesOf(SAMPLE_PRICE_BOOK)].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(/tierId|"id"/);
  });

  it("sends nothing a second time when Create is pressed again while the first is out or after it answered", async () => {
    const page = productionHardwarePage();
    const screen = mountInCatalogue(
      createElement(HardwareCreateScreen, {
        locale: "ro",
        context: contextOf("administrator", [
          "kitchens",
          "hardware",
          "publish",
        ]),
        page,
      }),
      "ro",
    );
    unmount = screen.unmount;
    await flushPromises(5);
    await fillTheClassForm(screen.container);
    const create = buttonNamed(
      screen.container,
      roCopy("priceDashboard.hardware.createAction"),
    );

    await press(create);
    await press(create);

    expect(creations.length).toBe(1);
  });
});

describe("the accessory form, left with the browser's own client", () => {
  async function fillTheAccessoryForm(container: HTMLElement): Promise<void> {
    typeInField(
      container,
      roCopy("priceDashboard.accessories.nameLabel"),
      "Soclu luminos",
    );
    typeInField(
      container,
      roCopy("priceDashboard.accessories.pricePerPiece"),
      "80",
    );
    const select = requireIn<HTMLSelectElement>(container, "select");
    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set?.call(select, LINKED_BUILD_ID);
    await act(async () => {
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await flushPromises(3);
  }

  it("turns Create on and sends one POST to the accessory route, whose value names no id and no rates", async () => {
    const page = { ...accessoryPageOf(), sampleUsage: undefined };
    const screen = mountInCatalogue(
      createElement(AccessoryCreateScreen, {
        locale: "ro",
        context: contextOf("administrator", [
          "kitchens",
          "accessories",
          "publish",
        ]),
        page,
      }),
      "ro",
    );
    unmount = screen.unmount;
    await flushPromises(5);
    await fillTheAccessoryForm(screen.container);
    const create = buttonNamed(
      screen.container,
      roCopy("priceDashboard.accessories.createAction"),
    );
    expect(create).toHaveProperty("disabled", false);
    expect(screen.container.textContent).not.toContain(CANNOT_JUDGE);

    await press(create);

    expect(creations).toHaveLength(1);
    expect(creations[0]?.address).toBe(ACCESSORY_ADDRESS);
    const body = bodyOfTheCreation();
    expect(Object.keys(body).sort()).toEqual([
      "expectedDraftRevision",
      "value",
    ]);
    expect(JSON.stringify(body)).not.toMatch(/accessoryId|tierId|"id"|rates/);
    expect((body.value as { perUnitMinor: number }).perUnitMinor).toBe(8_000);
  });
});
