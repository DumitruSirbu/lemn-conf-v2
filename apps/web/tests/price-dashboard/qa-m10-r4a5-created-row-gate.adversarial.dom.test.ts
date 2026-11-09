// @vitest-environment happy-dom
//
// Adversarial QA of a production build's deletion of a row the draft created, beside the rows the book states, on a list
// and on the row's own page: the created row's deletion is offered and takes the creation back out of the draft, and the
// stated rows beside it stay off, whatever the saved defaults make readable. Nothing is counted for the created row.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DraftChange,
  NewKitchenSettings,
} from "@lemnaria/configurator-domain";

import { AccessoryEditScreen } from "@/price-dashboard/accessory-edit";
import { AccessoryListScreen } from "@/price-dashboard/accessory-list";
import { HardwareEditScreen } from "@/price-dashboard/hardware-edit";
import { HardwareListScreen } from "@/price-dashboard/hardware-list";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import {
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import * as accessories from "./accessory-harness";
import { buttonNamed } from "./cabinet-detail-harness";
import * as hardware from "./hardware-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import { stubTheLifecycleServer } from "./lifecycle-server-harness";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const DELETE = roCopy("priceDashboard.common.delete");
const CREATED_NAME_OF_CLASS = "GTV Economic";
const STATED_CLASSES = [
  [hardware.HETTICH, "Hettich"],
  [hardware.BLUM, "Blum"],
] as const;

let screen: MountedScreen | undefined;
let server: ReturnType<typeof stubTheLifecycleServer>;

beforeEach(() => {
  stubTheStaffServer();
  vi.stubEnv("NODE_ENV", "production");
  server = stubTheLifecycleServer({
    availability: { revision: "1", disabled: [] },
    usage: [],
  });
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  resetStaffSessionExpiryForTests();
  vi.unstubAllEnvs();
  leaveTheStaffServer();
});

interface World {
  readonly container: HTMLElement;
  readonly changes: () => readonly DraftChange[];
}

function hardwareWorld(
  kind: "list" | "edit",
  defaults: NewKitchenSettings | undefined,
  tierId = hardware.CREATED,
): World {
  const page = {
    ...hardware.hardwarePageOf({ defaults, changes: hardware.CREATED_CLASS }),
    sampleUsage: undefined,
  };
  const draft = inMemoryPriceDraftClient(page.state);
  const context = contextOf("administrator", [
    "kitchens",
    "hardware",
    "publish",
  ]);
  screen = mountInCatalogue(
    kind === "list"
      ? createElement(HardwareListScreen, {
          locale: "ro",
          context,
          page,
          client: draft.client,
        })
      : createElement(HardwareEditScreen, {
          locale: "ro",
          context,
          page,
          tierId,
          client: draft.client,
        }),
    "ro",
  );
  return {
    container: screen.container,
    changes: () => draft.state().draft.changes,
  };
}

function accessoryWorld(
  kind: "list" | "edit",
  defaults: NewKitchenSettings | undefined,
  accessoryId = accessories.CREATED,
): World {
  const page = {
    ...accessories.accessoryPageOf({
      defaults,
      changes: accessories.CREATED_ACCESSORY,
    }),
    sampleUsage: undefined,
  };
  const draft = inMemoryPriceDraftClient(page.state);
  const context = contextOf("administrator", [
    "kitchens",
    "accessories",
    "publish",
  ]);
  screen = mountInCatalogue(
    kind === "list"
      ? createElement(AccessoryListScreen, {
          locale: "ro",
          context,
          page,
          client: draft.client,
        })
      : createElement(AccessoryEditScreen, {
          locale: "ro",
          context,
          page,
          accessoryId,
          client: draft.client,
        }),
    "ro",
  );
  return {
    container: screen.container,
    changes: () => draft.state().draft.changes,
  };
}

const DEFAULTS = [
  ["unreadable", undefined],
  ["readable", {}],
] as const;

describe.each(DEFAULTS)("with the saved defaults %s", (_name, defaults) => {
  it("offers a created class's deletion on the list, takes the creation out of the draft, and counts nothing", async () => {
    const { container, changes } = hardwareWorld("list", defaults);
    await flushPromises(8);
    expect(changes().length).toBeGreaterThan(0);

    await hardware.openMenuOf(
      container,
      hardware.CREATED,
      CREATED_NAME_OF_CLASS,
    );
    const entry = hardware.menuEntry(container, hardware.CREATED, DELETE);
    await hardware.press(entry);
    const dialog = hardware.openDialog();

    expect(entry.getAttribute("aria-disabled")).not.toBe("true");
    if (dialog === null) throw new Error("no dialog opened");
    await hardware.press(hardware.dialogButton(dialog, DELETE));
    expect(changes()).toEqual([]);
    expect(server.usageRequests).toEqual([]);
  });

  it("offers a created class's deletion on its own page, and takes the creation out of the draft", async () => {
    const { container, changes } = hardwareWorld("edit", defaults);
    await flushPromises(8);

    const remove = buttonNamed(
      container,
      roCopy("priceDashboard.hardware.deleteAction"),
    );
    await hardware.press(remove);
    const dialog = hardware.openDialog();

    expect(remove.getAttribute("aria-disabled")).not.toBe("true");
    if (dialog === null) throw new Error("no dialog opened");
    await hardware.press(hardware.dialogButton(dialog, DELETE));
    expect(changes()).toEqual([]);
    expect(server.usageRequests).toEqual([]);
  });

  it("offers a created accessory's deletion on the list, and keeps the stated accessories beside it off", async () => {
    const { container, changes } = accessoryWorld("list", defaults);
    await flushPromises(8);

    for (const [id, name] of [
      [accessories.DRYING_RACK, accessories.RACK_NAME],
      [accessories.SINK_COVER, accessories.COVER_NAME],
    ] as const) {
      await accessories.openMenuOf(container, id, name);
      const entry = accessories.menuEntry(container, id, DELETE);
      await hardware.press(entry);
      expect(entry.getAttribute("aria-disabled"), id).toBe("true");
      expect(hardware.openDialog(), id).toBeNull();
    }
    await accessories.openMenuOf(
      container,
      accessories.CREATED,
      "Suport pentru farfurii",
    );
    const created = accessories.menuEntry(
      container,
      accessories.CREATED,
      DELETE,
    );
    await hardware.press(created);
    const dialog = hardware.openDialog();

    expect(created.getAttribute("aria-disabled")).not.toBe("true");
    if (dialog === null) throw new Error("no dialog opened");
    await hardware.press(hardware.dialogButton(dialog, DELETE));
    expect(changes()).toEqual([]);
    expect(server.usageRequests).toEqual([]);
  });

  it("offers a created accessory's deletion on its own page, and keeps a stated accessory's off", async () => {
    const created = accessoryWorld("edit", defaults);
    await flushPromises(8);
    const deleteWords = roCopy("priceDashboard.accessories.deleteAction");

    const remove = buttonNamed(created.container, deleteWords);
    await hardware.press(remove);
    const dialog = hardware.openDialog();
    expect(remove.getAttribute("aria-disabled")).not.toBe("true");
    if (dialog === null) throw new Error("no dialog opened");
    await hardware.press(hardware.dialogButton(dialog, DELETE));
    expect(created.changes()).toEqual([]);
    screen?.unmount();

    const stated = accessoryWorld("edit", defaults, accessories.DRYING_RACK);
    await flushPromises(8);
    const statedRemove = buttonNamed(stated.container, deleteWords);
    await hardware.press(statedRemove);

    expect(statedRemove.getAttribute("aria-disabled")).toBe("true");
    expect(hardware.openDialog()).toBeNull();
    expect(server.usageRequests).toEqual([]);
  });
});

describe("the stated classes beside a created one, with the saved defaults unreadable", () => {
  it("keeps their deletion off on the list and on their page, counting and writing nothing", async () => {
    const list = hardwareWorld("list", undefined);
    await flushPromises(8);
    const untouched = list.changes();

    for (const [tierId, name] of STATED_CLASSES) {
      await hardware.openMenuOf(list.container, tierId, name);
      const entry = hardware.menuEntry(list.container, tierId, DELETE);
      await hardware.press(entry);
      expect(entry.getAttribute("aria-disabled"), tierId).toBe("true");
      expect(hardware.openDialog(), tierId).toBeNull();
    }
    screen?.unmount();
    const page = hardwareWorld("edit", undefined, hardware.HETTICH);
    await flushPromises(8);
    const remove = buttonNamed(
      page.container,
      roCopy("priceDashboard.hardware.deleteAction"),
    );
    await hardware.press(remove);

    expect(remove.getAttribute("aria-disabled")).toBe("true");
    expect(hardware.openDialog()).toBeNull();
    expect(page.changes()).toEqual(untouched);
    expect(server.usageRequests).toEqual([]);
  });
});

describe("the stated classes beside a created one, with the saved defaults readable", () => {
  const CANCEL = roCopy("priceDashboard.common.cancel");

  async function cancelOpenDialog(): Promise<void> {
    const dialog = hardware.openDialog();
    if (dialog === null) throw new Error("no dialog opened");
    await hardware.press(hardware.dialogButton(dialog, CANCEL));
  }

  it("offers their deletion on the list, counts the class first, and writes nothing until it is confirmed", async () => {
    const { container, changes } = hardwareWorld("list", {});
    await flushPromises(8);
    const untouched = changes();

    for (const [tierId, name] of STATED_CLASSES) {
      await hardware.openMenuOf(container, tierId, name);
      const entry = hardware.menuEntry(container, tierId, DELETE);
      await hardware.press(entry);
      expect(entry.getAttribute("aria-disabled"), tierId).not.toBe("true");
      expect(hardware.openDialog(), tierId).not.toBeNull();
      await cancelOpenDialog();
    }

    expect(server.usageRequests).toEqual(
      STATED_CLASSES.map(([tierId]) => [{ kind: "hardware", tierId }]),
    );
    expect(changes()).toEqual(untouched);
  });

  it("offers a stated class's deletion on its page, and a confirmed one adds its deletion beside the created class", async () => {
    const { container, changes } = hardwareWorld("edit", {}, hardware.HETTICH);
    await flushPromises(8);
    const created = changes();
    const remove = buttonNamed(
      container,
      roCopy("priceDashboard.hardware.deleteAction"),
    );

    await hardware.press(remove);
    const dialog = hardware.openDialog();

    expect(remove.getAttribute("aria-disabled")).not.toBe("true");
    if (dialog === null) throw new Error("no dialog opened");
    expect(changes()).toEqual(created);
    await hardware.press(hardware.dialogButton(dialog, DELETE));
    expect(changes()).toEqual([
      ...created,
      {
        address: {
          kind: "item-deleted",
          item: { kind: "hardware", tierId: hardware.HETTICH },
        },
        value: true,
      },
    ]);
  });
});
