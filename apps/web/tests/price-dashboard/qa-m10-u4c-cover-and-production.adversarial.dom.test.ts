// @vitest-environment happy-dom
//
// Adversarial QA of the accessory screens: no path switches the sink cover off (the menu, the page, the desk's own request
// and a write forged at the client), the rack and the others still switch, and a production build offers no switch-off or
// deletion that cannot be judged, and claims no count it was not given. The pending count is read at each step of a creation that is
// taken back.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DraftChange,
  NewKitchenSettings,
} from "@lemnaria/configurator-domain";

import { AccessoryCreateScreen } from "@/price-dashboard/accessory-create";
import { AccessoryEditScreen } from "@/price-dashboard/accessory-edit";
import { AccessoryListScreen } from "@/price-dashboard/accessory-list";
import type { AccessoryPageInput } from "@/price-dashboard/accessory-model";
import type { PriceDraftClient } from "@/price-dashboard/price-draft-client";
import { inMemoryItemLifecycleClient } from "@/price-dashboard/item-lifecycle-stand-in-client";
import { useAccessoryDesk } from "@/price-dashboard/use-accessory-desk";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises, renderHook } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";
import {
  accessoryItem,
  accessoryPageOf,
  bookWithLinked,
  chipsOf,
  COVER_NAME,
  CREATED,
  CREATED_ACCESSORY,
  DRYING_RACK,
  LINKED_BUILD_ID,
  menuEntry,
  mountAccessoryEdit,
  mountAccessoryList,
  openMenuOf,
  PUBLISHED,
  PUBLISHED_RULE,
  RACK_NAME,
  rowOf,
  SINK_COVER,
  USAGE,
  type MountedAccessories,
} from "./accessory-harness";
import { buttonNamed, typeInField } from "./cabinet-detail-harness";
import {
  dialogButton,
  openDialog,
  pendingChipText,
  press,
} from "./hardware-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import { roCopy } from "./romanian-copy";
import { stubTheLifecycleServer } from "./lifecycle-server-harness";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
const ACTIVATE = roCopy("priceDashboard.common.activate");
const DELETE = roCopy("priceDashboard.common.delete");
const DELETE_ON_PAGE = roCopy("priceDashboard.accessories.deleteAction");
const RENAME = roCopy("priceDashboard.accessories.renameAction");
const SAVE = roCopy("priceDashboard.common.save");
const NAME = roCopy("priceDashboard.accessories.nameLabel");
const PRICE = roCopy("priceDashboard.accessories.pricePerPiece");
const ALWAYS_PRESENT = roCopy(
  "priceDashboard.lifecycle.alwaysPresentCannotChange",
);
const CANNOT_JUDGE = roCopy("priceDashboard.lifecycle.cannotJudge");
const CREATE = roCopy("priceDashboard.accessories.createAction");
const CREATED_NAME = "Suport pentru farfurii";
const FRAME = () =>
  contextOf("administrator", ["kitchens", "accessories", "publish"]);

let mounted: MountedAccessories | undefined;
let extraScreen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  extraScreen?.unmount();
  extraScreen = undefined;
  resetStaffSessionExpiryForTests();
  vi.unstubAllEnvs();
  leaveTheStaffServer();
});

const setActiveCalls = (screen: MountedAccessories) =>
  screen.lifecycle.calls.filter((call) => call.kind === "setActive");

const writesTo = (screen: MountedAccessories) =>
  screen.lifecycle.calls.filter((call) => call.kind !== "readAvailability");

describe("the sink cover cannot be switched off from the list", () => {
  it("keeps the cover's switch entry off, with its reason, however it is pressed, and counts and writes nothing", async () => {
    mounted = await mountAccessoryList(accessoryPageOf());
    await openMenuOf(mounted.container, SINK_COVER, COVER_NAME);
    const entry = menuEntry(mounted.container, SINK_COVER, DEACTIVATE);

    entry.focus();
    for (const key of ["Enter", " "]) {
      entry.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      entry.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    }
    await press(entry);
    await press(entry);

    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(openDialog()).toBeNull();
    expect(writesTo(mounted)).toEqual([]);
    expect(mounted.container.textContent).toContain(ALWAYS_PRESENT);
    expect(chipsOf(mounted.container, SINK_COVER)).toEqual([
      roCopy("priceDashboard.chips.active"),
    ]);
  });

  it("still switches the rack off and on while the cover stays refused, in any order", async () => {
    mounted = await mountAccessoryList(accessoryPageOf());

    await openMenuOf(mounted.container, DRYING_RACK, RACK_NAME);
    await press(menuEntry(mounted.container, DRYING_RACK, DEACTIVATE));
    const dialog = openDialog();
    if (dialog === null) throw new Error("no dialog opened for the rack");
    await press(
      dialogButton(
        dialog,
        roCopy("priceDashboard.lifecycle.deactivateConfirm"),
      ),
    );

    expect(setActiveCalls(mounted)).toHaveLength(1);
    expect(chipsOf(mounted.container, DRYING_RACK)).toEqual([
      roCopy("priceDashboard.chips.inactive"),
    ]);
    await openMenuOf(mounted.container, SINK_COVER, COVER_NAME);
    const coverEntry = menuEntry(mounted.container, SINK_COVER, DEACTIVATE);
    await press(coverEntry);
    expect(coverEntry.getAttribute("aria-disabled")).toBe("true");
    expect(openDialog()).toBeNull();
    expect(setActiveCalls(mounted)).toHaveLength(1);
  });

  it("reads a cover the log somehow holds as off as on, so there is no way back on to offer", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ disabled: [accessoryItem(SINK_COVER)] }),
    );

    await openMenuOf(mounted.container, SINK_COVER, COVER_NAME);

    expect(chipsOf(mounted.container, SINK_COVER)).toEqual([
      roCopy("priceDashboard.chips.active"),
    ]);
    expect(() =>
      menuEntry(mounted?.container ?? document.body, SINK_COVER, ACTIVATE),
    ).toThrow();
    expect(setActiveCalls(mounted)).toEqual([]);
  });
});

describe("the sink cover cannot be switched off from its own page", () => {
  it("holds a switch that is on, off to a press, and opens nothing", async () => {
    mounted = await mountAccessoryEdit(SINK_COVER, accessoryPageOf());
    const coverSwitch = requireIn(mounted.container, 'button[role="switch"]');

    await press(coverSwitch);
    await press(coverSwitch);

    expect(coverSwitch.getAttribute("aria-checked")).toBe("true");
    expect(coverSwitch.getAttribute("aria-disabled")).toBe("true");
    expect(openDialog()).toBeNull();
    expect(writesTo(mounted)).toEqual([]);
    expect(mounted.container.textContent).toContain(ALWAYS_PRESENT);
  });

  it("holds its deletion off as well, since the cover comes with the catalogue", async () => {
    mounted = await mountAccessoryEdit(SINK_COVER, accessoryPageOf());
    const deletion = buttonNamed(mounted.container, DELETE_ON_PAGE);

    await press(deletion);

    expect(deletion.getAttribute("aria-disabled")).toBe("true");

    expect(openDialog()).toBeNull();
    expect(mounted.draftServer.calls).toEqual([]);
    expect(writesTo(mounted)).toEqual([]);
  });
});

describe("the sink cover cannot be switched off by a request the screen did not offer", () => {
  function deskOf(page: AccessoryPageInput) {
    const draftServer = inMemoryPriceDraftClient(page.state);
    const lifecycle = recording(page);
    const hook = renderHook(() =>
      useAccessoryDesk({
        page,
        client: draftServer.client,
        lifecycleClient: lifecycle.client,
      }),
    );
    return { hook, lifecycle };
  }

  function recording(page: AccessoryPageInput) {
    const calls: string[] = [];
    const inner = inMemoryItemLifecycleClient({
      book: page.state.active.book,
      availability: page.state.active.availability,
      defaults: page.defaults,
      usage: page.sampleUsage ?? [],
    });
    return {
      calls,
      client: {
        canWrite: inner.canWrite,
        canDeleteStatedItems: inner.canDeleteStatedItems,
        setActive: (request: Parameters<typeof inner.setActive>[0]) => {
          calls.push("setActive");
          return inner.setActive(request);
        },
        readUsage: (items: Parameters<typeof inner.readUsage>[0]) => {
          calls.push("readUsage");
          return inner.readUsage(items);
        },
        readAvailability: () => inner.readAvailability(),
      },
    };
  }

  it("leaves the desk closed when it is asked to switch the cover, and asks nothing of the client", async () => {
    const { hook, lifecycle } = deskOf(accessoryPageOf());
    try {
      await act(async () => {
        hook.result.current.availability.requestSwitch(
          accessoryItem(SINK_COVER),
        );
        await Promise.resolve();
      });
      await flushPromises(5);

      expect(hook.result.current.availability.flow.kind).toBe("closed");
      expect(lifecycle.calls).toEqual([]);
    } finally {
      hook.unmount();
    }
  });

  it("opens the rack's dialog from the same request, so the refusal is the cover's own", async () => {
    const { hook } = deskOf(accessoryPageOf());
    try {
      await act(async () => {
        hook.result.current.availability.requestSwitch(
          accessoryItem(DRYING_RACK),
        );
        await Promise.resolve();
      });
      await flushPromises(5);

      expect(hook.result.current.availability.flow.kind).toBe("deactivate");
    } finally {
      hook.unmount();
    }
  });

  it("is refused by the client that judges as a server does, whatever else is off, and writes nothing", async () => {
    const page = accessoryPageOf({ disabled: [accessoryItem(DRYING_RACK)] });
    const client = inMemoryItemLifecycleClient({
      book: page.state.active.book,
      availability: page.state.active.availability,
      defaults: page.defaults,
      usage: [],
    });

    const outcome = await client.setActive({
      expectedRevision: "1",
      item: accessoryItem(SINK_COVER),
      active: false,
    });

    expect(outcome).toEqual({ kind: "refused", code: "item-always-present" });
    expect(await client.readAvailability()).toEqual(
      page.state.active.availability,
    );
  });
});

describe("a production build of the accessory screens", () => {
  const productionPageOf = (
    options: Parameters<typeof accessoryPageOf>[0] = {},
  ): AccessoryPageInput => ({
    ...accessoryPageOf(options),
    sampleUsage: undefined,
  });

  function mountScreen(element: ReturnType<typeof createElement>): void {
    extraScreen = mountInCatalogue(element, "ro");
  }

  const fetchSpy = () => vi.spyOn(globalThis, "fetch");

  async function mountProductionList(defaults: NewKitchenSettings | undefined) {
    vi.stubEnv("NODE_ENV", "production");
    const page = productionPageOf({ linked: [PUBLISHED_RULE], defaults });
    const draftServer = inMemoryPriceDraftClient(page.state);
    mountScreen(
      createElement(AccessoryListScreen, {
        locale: "ro",
        context: FRAME(),
        page,
        client: draftServer.client,
      }),
    );
    await flushPromises(5);
    const container = extraScreen?.container;
    if (container === undefined) throw new Error("nothing is mounted");
    return { container, draftServer };
  }

  const EVERY_ENTRY = [
    [SINK_COVER, COVER_NAME],
    [DRYING_RACK, RACK_NAME],
    [PUBLISHED, PUBLISHED_RULE.name],
  ] as const;

  it("offers a list no switch and no deletion that could be pressed: no dialog opens, nothing is counted or written", async () => {
    const { container, draftServer } = await mountProductionList(undefined);
    const fetched = fetchSpy();

    for (const [accessoryId, name] of EVERY_ENTRY) {
      await openMenuOf(container, accessoryId, name);
      for (const words of [DEACTIVATE, DELETE]) {
        await press(menuEntry(container, accessoryId, words));
        expect(openDialog(), `${accessoryId}: ${words}`).toBeNull();
      }
    }

    expect(draftServer.calls).toEqual([]);
    expect(fetched).not.toHaveBeenCalled();
    for (const held of USAGE) {
      expect(container.textContent).not.toContain(
        roCopy("priceDashboard.lifecycle.usedByAccessory", {
          count: held.designCount,
        }),
      );
    }
  });

  // The state saved defaults make readable: the built-ins stay undeletable for what they are, the linked accessory a
  // person created is offered its deletion and counted by the server first, and a switch-off is counted by the server too,
  // never from the page.
  it("with the saved defaults read, offers the deletion of the linked accessory alone and counts a switch-off by what the server says", async () => {
    const SERVER_COUNT_FOR_RACK = 4;
    const SERVER_COUNT_FOR_LINKED = 2;
    const server = stubTheLifecycleServer({
      availability: { revision: "1", disabled: [] },
      book: bookWithLinked([PUBLISHED_RULE]),
      usage: [
        {
          item: accessoryItem(DRYING_RACK),
          designCount: SERVER_COUNT_FOR_RACK,
        },
        {
          item: accessoryItem(PUBLISHED),
          designCount: SERVER_COUNT_FOR_LINKED,
        },
      ],
    });
    const { container, draftServer } = await mountProductionList({});

    for (const [accessoryId, name] of [
      [SINK_COVER, COVER_NAME],
      [DRYING_RACK, RACK_NAME],
    ] as const) {
      await openMenuOf(container, accessoryId, name);
      const entry = menuEntry(container, accessoryId, DELETE);
      await press(entry);
      expect(entry.getAttribute("aria-disabled"), accessoryId).toBe("true");
      expect(openDialog(), accessoryId).toBeNull();
    }
    expect(server.usageRequests).toEqual([]);
    await openMenuOf(container, PUBLISHED, PUBLISHED_RULE.name);
    const linkedEntry = menuEntry(container, PUBLISHED, DELETE);
    await press(linkedEntry);
    expect(linkedEntry.getAttribute("aria-disabled")).not.toBe("true");
    expect(server.usageRequests).toEqual([[accessoryItem(PUBLISHED)]]);
    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedAccessoryBody", {
        name: PUBLISHED_RULE.name,
        count: SERVER_COUNT_FOR_LINKED,
      }),
    );
    const blocked = openDialog();
    if (blocked === null) throw new Error("no dialog opened");
    await press(dialogButton(blocked, roCopy("priceDashboard.common.cancel")));

    await openMenuOf(container, DRYING_RACK, RACK_NAME);
    await press(menuEntry(container, DRYING_RACK, DEACTIVATE));

    expect(server.usageRequests).toEqual([
      [accessoryItem(PUBLISHED)],
      [accessoryItem(DRYING_RACK)],
    ]);
    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usedByAccessory", {
        count: SERVER_COUNT_FOR_RACK,
      }),
    );
    expect(draftServer.calls).toEqual([]);
  });

  it("offers the cover and the built-ins no deletion in production either, with the reason that fits each", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const page = productionPageOf();
    mountScreen(
      createElement(AccessoryListScreen, {
        locale: "ro",
        context: FRAME(),
        page,
        client: inMemoryPriceDraftClient(page.state).client,
      }),
    );
    await flushPromises(5);
    const container = extraScreen?.container;
    if (container === undefined) throw new Error("nothing is mounted");

    await openMenuOf(container, SINK_COVER, COVER_NAME);

    const entry = (words: string) => menuEntry(container, SINK_COVER, words);
    expect(entry(DEACTIVATE).getAttribute("aria-disabled")).toBe("true");
    expect(entry(DELETE).getAttribute("aria-disabled")).toBe("true");
    expect(container.textContent).toContain(ALWAYS_PRESENT);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.lifecycle.alwaysPresentCannotBeDeleted"),
    );
    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.lifecycle.builtInAccessoryCannotBeDeleted"),
    );
  });

  it("holds the creation form's Create off for the reason that nothing can be checked where the client has no route to create through, however well it is filled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const page = productionPageOf();
    mountScreen(
      createElement(AccessoryCreateScreen, {
        locale: "ro",
        context: FRAME(),
        page,
        client: {
          ...inMemoryPriceDraftClient(page.state).client,
          createAccessory: undefined,
        },
      }),
    );
    await flushPromises(5);
    const container = extraScreen?.container;
    if (container === undefined) throw new Error("nothing is mounted");
    const fetched = fetchSpy();

    typeInField(
      container,
      roCopy("priceDashboard.accessories.nameLabel"),
      CREATED_NAME,
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
    await press(buttonNamed(container, CREATE));

    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", true);
    expect(container.textContent).toContain(CANNOT_JUDGE);
    expect(fetched).not.toHaveBeenCalled();
  });

  it("holds a created accessory's rename off on its page, with the reason, and sends nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const page = productionPageOf({ changes: CREATED_ACCESSORY });
    const productionClient: PriceDraftClient = {
      ...inMemoryPriceDraftClient(page.state).client,
      acceptsCreatedRowText: undefined,
    };
    mountScreen(
      createElement(AccessoryEditScreen, {
        locale: "ro",
        context: FRAME(),
        page,
        accessoryId: CREATED,
        client: productionClient,
      }),
    );
    await flushPromises(5);
    const container = extraScreen?.container;
    if (container === undefined) throw new Error("nothing is mounted");

    expect(
      allIn<HTMLInputElement>(container, "input").map((input) => input.value),
    ).not.toContain(CREATED_NAME);
    expect(container.textContent).toContain(CREATED_NAME);
    expect(container.textContent).toContain(CANNOT_JUDGE);
  });
});

describe("the pending count while an accessory is created and taken back out", () => {
  const unrelated: DraftChange = {
    address: {
      kind: "accessory",
      accessoryId: DRYING_RACK,
      field: "perUnitMinor",
    },
    value: 12_000,
  };

  async function deleteCreated(screen: MountedAccessories): Promise<void> {
    await openMenuOf(screen.container, CREATED, CREATED_NAME);
    await press(menuEntry(screen.container, CREATED, DELETE));
    const dialog = openDialog();
    if (dialog === null) throw new Error("no dialog opened");
    await press(dialogButton(dialog, DELETE));
  }

  it("counts what the draft holds and, once the creation is deleted, only what is left of other work", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ changes: [unrelated, ...CREATED_ACCESSORY] }),
    );
    const before = pendingChipText(mounted.container);

    await deleteCreated(mounted);

    expect(before).toMatch(/2/u);
    expect(pendingChipText(mounted.container)).toMatch(/1/u);
    expect(mounted.draftServer.state().draft.changes).toEqual([unrelated]);
  });

  it("is gone from the shell when the creation was the draft's only change", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ changes: CREATED_ACCESSORY }),
    );
    expect(pendingChipText(mounted.container)).toMatch(/1/u);

    await deleteCreated(mounted);

    expect(pendingChipText(mounted.container)).toBeUndefined();
    expect(mounted.draftServer.state().draft.changes).toEqual([]);
  });

  it("takes a price and a new name with it, leaving nothing of the accessory in the draft or in the shell", async () => {
    mounted = await mountAccessoryEdit(
      CREATED,
      accessoryPageOf({ changes: CREATED_ACCESSORY }),
    );
    const { container } = mounted;
    typeInField(container, NAME, "Alt nume");
    await press(buttonNamed(container, RENAME));
    typeInField(container, PRICE, "90");
    await press(buttonNamed(container, SAVE));
    expect(mounted.draftServer.state().draft.changes).toHaveLength(3);
    expect(pendingChipText(container)).toMatch(/1/u);

    await press(buttonNamed(container, DELETE_ON_PAGE));
    const dialog = openDialog();
    if (dialog === null) throw new Error("no dialog opened");
    await press(dialogButton(dialog, DELETE));

    expect(mounted.draftServer.state().draft.changes).toEqual([]);
    expect(pendingChipText(container)).toBeUndefined();
    expect(openDialog()).toBeNull();
    expect(container.textContent).not.toContain("Alt nume");
  });
});

describe("the name a dialog gives an accessory", () => {
  const DRAFT_NAME = "Alt nume in lucru";
  const rename: DraftChange = {
    address: {
      kind: "created-row-text",
      item: accessoryItem(PUBLISHED) as never,
      field: "name",
    },
    value: DRAFT_NAME,
  };

  it("is the published name for an accessory the active version holds, while the row already shows the draft's", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ linked: [PUBLISHED_RULE], changes: [rename] }),
    );
    expect(rowOf(mounted.container, PUBLISHED).textContent).toContain(
      DRAFT_NAME,
    );

    await openMenuOf(mounted.container, PUBLISHED, DRAFT_NAME);
    await press(menuEntry(mounted.container, PUBLISHED, DEACTIVATE));
    const dialog = openDialog();
    if (dialog === null) throw new Error("no dialog opened");

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deactivateTitle", {
        name: PUBLISHED_RULE.name,
      }),
    );
    expect(dialog.textContent).not.toContain(DRAFT_NAME);
  });
});
