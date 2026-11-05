// @vitest-environment happy-dom
//
// Adversarial QA of a production build whose server cannot be had, or has not answered yet: a count that is not known is
// not drawn, in a chip or in a dialog, and is never drawn as 0 kitchens; a switch that did not reach the server does not
// show as made.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HardwareListScreen } from "@/price-dashboard/hardware-list";
import { MaterialListScreen } from "@/price-dashboard/material-list";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import { AccessoryListScreen } from "@/price-dashboard/accessory-list";
import * as accessories from "./accessory-harness";
import * as hardware from "./hardware-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import * as materials from "./material-harness";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const USAGE_ADDRESS = "/api/staff/prices/usage";
const AVAILABILITY_ADDRESS = "/api/staff/prices/availability";
const INACTIVE = roCopy("priceDashboard.chips.inactive");
const ACTIVATE = roCopy("priceDashboard.common.activate");
const CONFIRM_ACTIVATE = roCopy("priceDashboard.lifecycle.activateConfirm");
const MOST_KITCHENS_TRIED = 60;

let screen: MountedScreen | undefined;
let asked: string[];

beforeEach(() => {
  stubTheStaffServer();
  vi.stubEnv("NODE_ENV", "production");
  asked = [];
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  resetStaffSessionExpiryForTests();
  vi.unstubAllEnvs();
  leaveTheStaffServer();
});

/** The staff session as `stubTheStaffServer` answers it, and every other address as `answerOther` does. */
function serverAnswering(
  answerOther: (address: string) => Promise<Response>,
): void {
  const session = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    (address: string, init?: RequestInit): Promise<Response> => {
      if (address !== USAGE_ADDRESS && address !== AVAILABILITY_ADDRESS) {
        return session(address, init);
      }
      asked.push(address);
      return answerOther(address);
    },
  );
}

const unavailable = () =>
  Promise.resolve(
    new Response(JSON.stringify({ status: "unavailable" }), { status: 503 }),
  );

function anyCountIn(text: string): boolean {
  return Array.from({ length: MOST_KITCHENS_TRIED }, (_, count) =>
    roCopy("priceDashboard.chips.inactiveInUse", { count }),
  ).some((chip) => text.includes(chip));
}

function mountMaterialList(): HTMLElement {
  const page = {
    ...materials.materialPageOf({
      disabled: [
        materials.materialItem(materials.MDF),
        materials.materialItem(materials.VENEER),
      ],
      defaults: {},
    }),
    sampleUsage: undefined,
  };
  screen = mountInCatalogue(
    createElement(MaterialListScreen, {
      locale: "ro",
      context: contextOf("administrator", ["kitchens", "materials"]),
      page,
      client: inMemoryPriceDraftClient(page.state).client,
    }),
    "ro",
  );
  return screen.container;
}

describe("a count the server did not give", () => {
  it("is not drawn when the server is down: the chips say only that the materials are off", async () => {
    serverAnswering(unavailable);

    const container = mountMaterialList();
    await flushPromises(20);

    expect(asked).toEqual([USAGE_ADDRESS]);
    expect(anyCountIn(container.textContent)).toBe(false);
    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.materials.usageDrift"),
    );
    const chips = allIn(container, '[data-testid="material-chip"]').map(
      (chip) => chip.textContent,
    );
    expect(chips.filter((chip) => chip === INACTIVE)).toHaveLength(2);
  });

  it("is not drawn while the server has not answered, and is drawn once it has, with the server's figure", async () => {
    let answer: () => void = () => undefined;
    serverAnswering(
      () =>
        new Promise<Response>((resolve) => {
          answer = () => {
            resolve(
              new Response(
                JSON.stringify({
                  counts: [
                    { item: materials.materialItem(materials.MDF), count: 7 },
                    {
                      item: materials.materialItem(materials.VENEER),
                      count: 0,
                    },
                  ],
                }),
                { status: 200 },
              ),
            );
          };
        }),
    );

    const container = mountMaterialList();
    await flushPromises(20);
    expect(anyCountIn(container.textContent), "before it answered").toBe(false);
    await act(async () => {
      answer();
      await flushPromises(20);
    });

    expect(container.textContent).toContain(
      roCopy("priceDashboard.chips.inactiveInUse", { count: 7 }),
    );
  });
});

describe("a switch the server did not take", () => {
  it.each([
    ["is down", () => unavailable()],
    [
      "refuses the session",
      () => Promise.resolve(new Response(null, { status: 403 })),
    ],
    [
      "answers 200 with something that is not its own answer",
      () => Promise.resolve(new Response("<html></html>", { status: 200 })),
    ],
    ["cannot be reached", () => Promise.reject(new TypeError("offline"))],
  ])(
    "leaves the class off when the server %s, and asks once",
    async (_name, answerOther) => {
      serverAnswering((address) =>
        address === AVAILABILITY_ADDRESS ? answerOther() : unavailable(),
      );
      const page = {
        ...hardware.hardwarePageOf({
          disabled: [hardware.hardwareItem(hardware.BLUM)],
          defaults: undefined,
        }),
        sampleUsage: undefined,
      };
      screen = mountInCatalogue(
        createElement(HardwareListScreen, {
          locale: "ro",
          context: contextOf("administrator", [
            "kitchens",
            "hardware",
            "publish",
          ]),
          page,
          client: inMemoryPriceDraftClient(page.state).client,
        }),
        "ro",
      );
      await flushPromises(10);
      const { container } = screen;
      await hardware.openMenuOf(container, hardware.BLUM, "Blum");
      await hardware.press(
        hardware.menuEntry(container, hardware.BLUM, ACTIVATE),
      );
      const dialog = hardware.openDialog();
      if (dialog === null) throw new Error("no dialog opened");

      await hardware.press(hardware.dialogButton(dialog, CONFIRM_ACTIVATE));

      expect(
        asked.filter((address) => address === AVAILABILITY_ADDRESS),
      ).toHaveLength(1);
      const chips = allIn(
        hardware.rowOf(container, hardware.BLUM),
        '[data-testid="hardware-chip"]',
      ).map((chip) => chip.textContent);
      expect(chips).toContain(INACTIVE);
    },
  );
});

describe("the question of a switch-off when the kitchens cannot be counted", () => {
  const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
  const CONFIRM_DEACTIVATE = roCopy(
    "priceDashboard.lifecycle.deactivateConfirm",
  );
  const CANCEL = roCopy("priceDashboard.common.cancel");

  async function expectInertQuestion(
    dialog: HTMLElement,
    unavailableCopy: string,
  ): Promise<void> {
    expect(dialog.textContent).toContain(unavailableCopy);
    expect(anyUsedByIn(dialog.textContent)).toBe(false);
    const confirmation = hardware.dialogButton(dialog, CONFIRM_DEACTIVATE);
    expect(confirmation.getAttribute("aria-disabled")).toBe("true");
    await hardware.press(confirmation);
    expect(
      asked.filter((address) => address === AVAILABILITY_ADDRESS),
      "pressing the confirmation sent nothing",
    ).toEqual([]);
    await hardware.press(hardware.dialogButton(dialog, CANCEL));
  }

  function anyUsedByIn(text: string): boolean {
    return Array.from(
      { length: MOST_KITCHENS_TRIED },
      (_, count) => count,
    ).some(
      (count) =>
        text.includes(roCopy("priceDashboard.lifecycle.usedBy", { count })) ||
        text.includes(
          roCopy("priceDashboard.lifecycle.usedByAccessory", { count }),
        ),
    );
  }

  it("says so for a class, and says no number: its confirmation is inert and sends nothing", async () => {
    serverAnswering(unavailable);
    const page = {
      ...hardware.hardwarePageOf({ defaults: {} }),
      sampleUsage: undefined,
    };
    screen = mountInCatalogue(
      createElement(HardwareListScreen, {
        locale: "ro",
        context: contextOf("administrator", [
          "kitchens",
          "hardware",
          "publish",
        ]),
        page,
        client: inMemoryPriceDraftClient(page.state).client,
      }),
      "ro",
    );
    await flushPromises(10);
    const { container } = screen;

    await hardware.openMenuOf(container, hardware.HETTICH, "Hettich");
    await hardware.press(
      hardware.menuEntry(container, hardware.HETTICH, DEACTIVATE),
    );
    const dialog = hardware.openDialog();
    if (dialog === null) throw new Error("no dialog opened");

    await expectInertQuestion(
      dialog,
      roCopy("priceDashboard.lifecycle.usageUnavailable"),
    );
    expect(asked).toEqual([USAGE_ADDRESS]);
  });

  it("says so for an accessory, and says no number: its confirmation is inert and sends nothing", async () => {
    serverAnswering(unavailable);
    const page = {
      ...accessories.accessoryPageOf({
        defaults: {},
        linked: [accessories.PUBLISHED_RULE],
      }),
      sampleUsage: undefined,
    };
    screen = mountInCatalogue(
      createElement(AccessoryListScreen, {
        locale: "ro",
        context: contextOf("administrator", [
          "kitchens",
          "accessories",
          "publish",
        ]),
        page,
        client: inMemoryPriceDraftClient(page.state).client,
      }),
      "ro",
    );
    await flushPromises(10);
    const { container } = screen;

    for (const [id, name] of [
      [accessories.DRYING_RACK, accessories.RACK_NAME],
      [accessories.PUBLISHED, accessories.PUBLISHED_RULE.name],
    ] as const) {
      await accessories.openMenuOf(container, id, name);
      await hardware.press(accessories.menuEntry(container, id, DEACTIVATE));
      const dialog = hardware.openDialog();
      if (dialog === null) throw new Error(`no dialog opened for ${id}`);

      await expectInertQuestion(
        dialog,
        roCopy("priceDashboard.lifecycle.usageUnavailableAccessory"),
      );
    }
  });
});
