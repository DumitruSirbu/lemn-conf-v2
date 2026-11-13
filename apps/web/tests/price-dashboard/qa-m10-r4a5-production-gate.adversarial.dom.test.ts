// @vitest-environment happy-dom
//
// Adversarial QA of a production build of every item screen, given no lifecycle client of its own so that it takes the
// default one: no deletion of an item the active book states is offered on any list or any item page while the saved
// defaults cannot be read, and once they can, a default or a built-in is still refused and every other item is offered
// and counted before anything is confirmed; no switch-off is offered where the defaults cannot be read; and what a view says it counted is
// what the server said, with every view of a page sharing the one request on its way.
import { createElement, StrictMode, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NewKitchenSettings } from "@lemnaria/configurator-domain";

import { AccessoryEditScreen } from "@/price-dashboard/accessory-edit";
import { AccessoryListScreen } from "@/price-dashboard/accessory-list";
import { HardwareEditScreen } from "@/price-dashboard/hardware-edit";
import { HardwareListScreen } from "@/price-dashboard/hardware-list";
import { MaterialEditScreen } from "@/price-dashboard/material-edit";
import { MaterialListScreen } from "@/price-dashboard/material-list";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import * as accessories from "./accessory-harness";
import { buttonNamed } from "./cabinet-detail-harness";
import * as hardware from "./hardware-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import { stubTheLifecycleServer } from "./lifecycle-server-harness";
import * as materials from "./material-harness";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
const DELETE = roCopy("priceDashboard.common.delete");
const USAGE_ADDRESS = "/api/staff/prices/usage";
const SERVER_COUNT = 7;
const OTHER_SERVER_COUNT = 4;

interface Row {
  readonly id: string;
  readonly name: string;
  /** Whether a production build offers its deletion once the defaults are read: a default or built-in is never offered. */
  readonly isDeletable: boolean;
}

interface Mounted {
  readonly container: HTMLElement;
  readonly draftCalls: () => readonly unknown[];
}

interface Kind {
  readonly label: string;
  readonly rows: readonly Row[];
  readonly deleteOnItsPage: string;
  readonly mountList: (defaults: NewKitchenSettings | undefined) => Mounted;
  readonly mountEdit: (
    id: string,
    defaults: NewKitchenSettings | undefined,
  ) => Mounted;
  readonly openMenuOf: (
    container: HTMLElement,
    id: string,
    name: string,
  ) => Promise<void>;
  readonly menuEntry: (
    container: HTMLElement,
    id: string,
    words: string,
  ) => HTMLButtonElement;
}

let screens: MountedScreen[] = [];

function mounted(
  element: ReactElement,
  draftCalls: () => readonly unknown[],
): Mounted {
  const screen = mountInCatalogue(element, "ro");
  screens.push(screen);
  return { container: screen.container, draftCalls };
}

const FRAME = (page: "hardware" | "materials" | "accessories") =>
  contextOf("administrator", ["kitchens", page, "publish"]);

const KINDS: readonly Kind[] = [
  {
    label: "hardware",
    rows: [
      {
        id: hardware.STANDARD,
        name: roCopy("priceBook.hardware.standard.name"),
        isDeletable: false,
      },
      { id: hardware.HETTICH, name: "Hettich", isDeletable: true },
      { id: hardware.BLUM, name: "Blum", isDeletable: true },
    ],
    deleteOnItsPage: roCopy("priceDashboard.hardware.deleteAction"),
    mountList: (defaults) => {
      const page = {
        ...hardware.hardwarePageOf({ defaults }),
        sampleUsage: undefined,
      };
      const draft = inMemoryPriceDraftClient(page.state);
      return mounted(
        createElement(HardwareListScreen, {
          locale: "ro",
          context: FRAME("hardware"),
          page,
          client: draft.client,
        }),
        () => writesTo(draft.calls),
      );
    },
    mountEdit: (tierId, defaults) => {
      const page = {
        ...hardware.hardwarePageOf({ defaults }),
        sampleUsage: undefined,
      };
      const draft = inMemoryPriceDraftClient(page.state);
      return mounted(
        createElement(HardwareEditScreen, {
          locale: "ro",
          context: FRAME("hardware"),
          page,
          tierId,
          client: draft.client,
        }),
        () => writesTo(draft.calls),
      );
    },
    openMenuOf: hardware.openMenuOf,
    menuEntry: hardware.menuEntry,
  },
  {
    label: "materials",
    rows: [
      { id: materials.PAL, name: materials.PAL_NAME, isDeletable: false },
      { id: materials.MDF, name: materials.MDF_NAME, isDeletable: true },
      { id: materials.VENEER, name: materials.VENEER_NAME, isDeletable: true },
    ],
    deleteOnItsPage: roCopy("priceDashboard.materials.deleteAction"),
    mountList: (defaults) => {
      const page = {
        ...materials.materialPageOf({ defaults }),
        sampleUsage: undefined,
      };
      const draft = inMemoryPriceDraftClient(page.state);
      return mounted(
        createElement(MaterialListScreen, {
          locale: "ro",
          context: FRAME("materials"),
          page,
          client: draft.client,
        }),
        () => writesTo(draft.calls),
      );
    },
    mountEdit: (tierId, defaults) => {
      const page = {
        ...materials.materialPageOf({ defaults }),
        sampleUsage: undefined,
      };
      const draft = inMemoryPriceDraftClient(page.state);
      return mounted(
        createElement(MaterialEditScreen, {
          locale: "ro",
          context: FRAME("materials"),
          page,
          tierId,
          client: draft.client,
        }),
        () => writesTo(draft.calls),
      );
    },
    openMenuOf: materials.openMenuOf,
    menuEntry: materials.menuEntry,
  },
  {
    label: "accessories",
    rows: [
      {
        id: accessories.SINK_COVER,
        name: accessories.COVER_NAME,
        isDeletable: false,
      },
      {
        id: accessories.DRYING_RACK,
        name: accessories.RACK_NAME,
        isDeletable: false,
      },
      {
        id: accessories.PUBLISHED,
        name: accessories.PUBLISHED_RULE.name,
        isDeletable: true,
      },
    ],
    deleteOnItsPage: roCopy("priceDashboard.accessories.deleteAction"),
    mountList: (defaults) => {
      const page = {
        ...accessories.accessoryPageOf({
          defaults,
          linked: [accessories.PUBLISHED_RULE],
        }),
        sampleUsage: undefined,
      };
      const draft = inMemoryPriceDraftClient(page.state);
      return mounted(
        createElement(AccessoryListScreen, {
          locale: "ro",
          context: FRAME("accessories"),
          page,
          client: draft.client,
        }),
        () => writesTo(draft.calls),
      );
    },
    mountEdit: (accessoryId, defaults) => {
      const page = {
        ...accessories.accessoryPageOf({
          defaults,
          linked: [accessories.PUBLISHED_RULE],
        }),
        sampleUsage: undefined,
      };
      const draft = inMemoryPriceDraftClient(page.state);
      return mounted(
        createElement(AccessoryEditScreen, {
          locale: "ro",
          context: FRAME("accessories"),
          page,
          accessoryId,
          client: draft.client,
        }),
        () => writesTo(draft.calls),
      );
    },
    openMenuOf: accessories.openMenuOf,
    menuEntry: accessories.menuEntry,
  },
];

const openDialog = hardware.openDialog;

/** What was asked of the draft other than reading it: a change, a revert or a creation. */
function writesTo(
  calls: readonly { readonly kind: string }[],
): readonly unknown[] {
  return calls.filter(({ kind }) => kind !== "readState");
}

let server: ReturnType<typeof stubTheLifecycleServer>;

/** A material's page counts that material for its fact line; no page counts anything more than the item it is about. */
function expectOnlyEachPagesOwnItemCounted(): void {
  expect(server.usageRequests.every((items) => items.length === 1)).toBe(true);
}

beforeEach(() => {
  stubTheStaffServer();
  vi.stubEnv("NODE_ENV", "production");
  server = stubTheLifecycleServer({
    availability: { revision: "1", disabled: [] },
    usage: [],
  });
});

afterEach(() => {
  for (const screen of screens) screen.unmount();
  screens = [];
  resetStaffSessionExpiryForTests();
  vi.unstubAllEnvs();
  leaveTheStaffServer();
});

async function cancelOpenDialog(): Promise<void> {
  const dialog = openDialog();
  if (dialog === null) throw new Error("no dialog opened");
  await hardware.press(
    hardware.dialogButton(dialog, roCopy("priceDashboard.common.cancel")),
  );
}

describe.each(KINDS)("a production $label screen", (kind) => {
  describe("with the saved defaults unreadable", () => {
    it("offers no deletion of any item the book states from its list, and sends and counts nothing", async () => {
      const { container, draftCalls } = kind.mountList(undefined);
      await flushPromises(8);

      for (const { id, name } of kind.rows) {
        await kind.openMenuOf(container, id, name);
        const entry = kind.menuEntry(container, id, DELETE);
        await hardware.press(entry);
        expect(entry.getAttribute("aria-disabled"), id).toBe("true");
        expect(openDialog(), id).toBeNull();
      }

      expect(server.usageRequests).toEqual([]);
      expect(server.switchRequests).toEqual([]);
      expect(draftCalls()).toEqual([]);
    });

    it("offers no deletion of any item the book states from its own page, and sends and counts nothing", async () => {
      for (const { id } of kind.rows) {
        const { container, draftCalls } = kind.mountEdit(id, undefined);
        await flushPromises(8);

        const remove = buttonNamed(container, kind.deleteOnItsPage);
        await hardware.press(remove);

        expect(remove.getAttribute("aria-disabled"), id).toBe("true");
        expect(openDialog(), id).toBeNull();
        expect(draftCalls(), id).toEqual([]);
      }
      expectOnlyEachPagesOwnItemCounted();
    });
  });

  describe("with the saved defaults readable", () => {
    it("offers the deletion of each row that is no default or built-in from its list, counted first, and writes nothing until confirmed", async () => {
      const { container, draftCalls } = kind.mountList({});
      await flushPromises(8);

      for (const { id, name, isDeletable } of kind.rows) {
        await kind.openMenuOf(container, id, name);
        const entry = kind.menuEntry(container, id, DELETE);
        await hardware.press(entry);
        expect(entry.getAttribute("aria-disabled") === "true", id).toBe(
          !isDeletable,
        );
        expect(openDialog() !== null, id).toBe(isDeletable);
        if (isDeletable) await cancelOpenDialog();
      }

      const deletable = kind.rows.filter(({ isDeletable }) => isDeletable);
      expect(deletable.length).toBeGreaterThan(0);
      expect(server.usageRequests).toHaveLength(deletable.length);
      expectOnlyEachPagesOwnItemCounted();
      expect(server.switchRequests).toEqual([]);
      expect(draftCalls()).toEqual([]);
    });

    it("offers the deletion of each such row from its own page, and writes nothing until confirmed", async () => {
      for (const { id, isDeletable } of kind.rows) {
        const { container, draftCalls } = kind.mountEdit(id, {});
        await flushPromises(8);

        const remove = buttonNamed(container, kind.deleteOnItsPage);
        await hardware.press(remove);

        expect(remove.getAttribute("aria-disabled") === "true", id).toBe(
          !isDeletable,
        );
        expect(openDialog() !== null, id).toBe(isDeletable);
        expect(draftCalls(), id).toEqual([]);
        if (isDeletable) await cancelOpenDialog();
      }
      expectOnlyEachPagesOwnItemCounted();
    });
  });

  it("offers no switch-off of any item from its list while the saved defaults are unreadable, and counts and sends nothing", async () => {
    const { container } = kind.mountList(undefined);
    await flushPromises(8);

    for (const { id, name } of kind.rows) {
      await kind.openMenuOf(container, id, name);
      const entry = kind.menuEntry(container, id, DEACTIVATE);
      await hardware.press(entry);
      expect(entry.getAttribute("aria-disabled"), id).toBe("true");
      expect(openDialog(), id).toBeNull();
    }

    expect(server.usageRequests).toEqual([]);
    expect(server.switchRequests).toEqual([]);
  });

  it("offers no switch-off of any item from its own page while the saved defaults are unreadable", async () => {
    for (const { id } of kind.rows) {
      const { container } = kind.mountEdit(id, undefined);
      await flushPromises(8);

      const switches = allIn(container, '[role="switch"]');
      expect(
        switches.length,
        `${id}: the page has a switch to hold off`,
      ).toBeGreaterThan(0);
      for (const control of switches) {
        await hardware.press(control);
        expect(control.getAttribute("aria-disabled"), id).toBe("true");
        expect(openDialog(), id).toBeNull();
      }
    }

    expectOnlyEachPagesOwnItemCounted();
    expect(server.switchRequests).toEqual([]);
  });

  it("does offer a switch-off of an item that is not a default once the saved defaults are read, so the refusals above are not an absence of controls", async () => {
    const { container } = kind.mountList({});
    await flushPromises(8);
    const offered: string[] = [];

    for (const { id, name } of kind.rows) {
      await kind.openMenuOf(container, id, name);
      const entry = kind.menuEntry(container, id, DEACTIVATE);
      if (entry.getAttribute("aria-disabled") !== "true") offered.push(id);
    }

    expect(offered.length).toBeGreaterThan(0);
  });
});

describe("every view of a page, in strict mode, counts through the one client", () => {
  it("counts a materials list and a material's page mounted together, with no request on top of another, and both say the server's figure", async () => {
    vi.unstubAllGlobals();
    stubTheStaffServer();
    server = stubTheLifecycleServer({
      availability: {
        revision: "1",
        disabled: [
          materials.materialItem(materials.MDF),
          materials.materialItem(materials.VENEER),
        ],
      },
      usage: [
        {
          item: materials.materialItem(materials.MDF),
          designCount: SERVER_COUNT,
        },
        {
          item: materials.materialItem(materials.VENEER),
          designCount: OTHER_SERVER_COUNT,
        },
      ],
    });
    const inFlight = { now: 0, most: 0 };
    const served = globalThis.fetch;
    vi.stubGlobal("fetch", async (address: string, init?: RequestInit) => {
      if (address !== USAGE_ADDRESS) return served(address, init);
      inFlight.now += 1;
      inFlight.most = Math.max(inFlight.most, inFlight.now);
      try {
        const answer = await served(address, init);
        for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
        return answer;
      } finally {
        inFlight.now -= 1;
      }
    });
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
    const draft = inMemoryPriceDraftClient(page.state);

    const list = mounted(
      createElement(
        StrictMode,
        null,
        createElement(MaterialListScreen, {
          locale: "ro",
          context: FRAME("materials"),
          page,
          client: draft.client,
        }),
      ),
      () => writesTo(draft.calls),
    );
    const edit = mounted(
      createElement(
        StrictMode,
        null,
        createElement(MaterialEditScreen, {
          locale: "ro",
          context: FRAME("materials"),
          page,
          tierId: materials.VENEER,
          client: draft.client,
        }),
      ),
      () => writesTo(draft.calls),
    );
    await flushPromises(40);

    expect(
      inFlight.most,
      "the most counts on their way at once",
    ).toBeLessThanOrEqual(1);
    for (const count of [SERVER_COUNT, OTHER_SERVER_COUNT]) {
      expect(
        list.container.textContent,
        `the list says ${String(count)}`,
      ).toContain(roCopy("priceDashboard.chips.inactiveInUse", { count }));
    }
    expect(edit.container.textContent).toContain(
      roCopy("priceDashboard.chips.inactiveInUse", {
        count: OTHER_SERVER_COUNT,
      }),
    );
  });
});
