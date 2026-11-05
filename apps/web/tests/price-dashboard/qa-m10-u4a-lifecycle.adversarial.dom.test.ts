// @vitest-environment happy-dom
//
// The lifecycle of a hardware class as a person drives it, where `hardware-lifecycle.dom.test.ts` presses with a bare
// `click`. A real press is a `pointerdown` first, and the "⋯" menu closes on any press outside it, the dialog being
// drawn outside the menu: so the entry that opened the dialog is gone by the time the dialog closes. Also here: a
// production build's own client, a confirmation pressed twice or abandoned with Escape while it is out, what "the last
// class that is on" and "what remains" mean beside classes that are off or only in the draft, and a deletion of a class
// with edits.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { HardwareCreateScreen } from "@/price-dashboard/hardware-create";
import { HardwareEditScreen } from "@/price-dashboard/hardware-edit";
import { HardwareListScreen } from "@/price-dashboard/hardware-list";
import type { PriceDraftClient } from "@/price-dashboard/price-draft-client";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
} from "../support/render-with-intl";
import { flushPromises } from "../support/render-hook";
import { buttonNamed, typeInField } from "./cabinet-detail-harness";
import {
  BLUM,
  CREATED,
  CREATED_CLASS,
  HETTICH,
  STANDARD,
  dialogButton,
  hardwareItem,
  hardwarePageOf,
  menuEntry,
  moreButtonOf,
  mountHardwareEdit,
  mountHardwareList,
  openDialog,
  openMenuOf,
  press,
  rowOf,
  type MountedHardware,
} from "./hardware-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import { roCopy } from "./romanian-copy";
import {
  stubTheLifecycleServer,
  type LifecycleServer,
} from "./lifecycle-server-harness";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const STANDARD_NAME = roCopy("priceBook.hardware.standard.name");
const HETTICH_NAME = "Hettich";
const BLUM_NAME = "Blum";
const CREATED_NAME = "GTV Economic";
const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
const ACTIVATE = roCopy("priceDashboard.common.activate");
const DELETE = roCopy("priceDashboard.common.delete");
const CANCEL = roCopy("priceDashboard.common.cancel");
const SAVE_FAILED = roCopy("priceDashboard.errors.saveFailed");

let mounted: MountedHardware | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
  vi.unstubAllEnvs();
});

function screen(): MountedHardware {
  if (mounted === undefined) throw new Error("nothing is mounted");
  return mounted;
}

/** What a mouse does to a control: the press, then the click. */
async function pressWithPointer(element: HTMLElement): Promise<void> {
  act(() => {
    element.dispatchEvent(
      new Event("pointerdown", { bubbles: true, cancelable: true }),
    );
  });
  await press(element);
}

function requireDialog(): HTMLElement {
  const dialog = openDialog();
  if (dialog === null) throw new Error("no dialog opened");
  return dialog;
}

async function dialogFor(
  tierId: string,
  name: string,
  entryWords: string,
): Promise<HTMLElement> {
  await openMenuOf(screen().container, tierId, name);
  const entry = menuEntry(screen().container, tierId, entryWords);
  entry.focus();
  await pressWithPointer(entry);
  const dialog = openDialog();
  if (dialog === null) throw new Error("no dialog opened");
  return dialog;
}

describe("where focus goes when a dialog is left with the pointer", () => {
  it("returns to the row the dialog was asked from, not to the top of the page, after Cancel", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await dialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);

    await pressWithPointer(dialogButton(dialog, CANCEL));

    expect(openDialog()).toBeNull();
    expect(
      rowOf(screen().container, HETTICH).contains(document.activeElement),
    ).toBe(true);
  });

  it("returns to the row after a switch-on is confirmed, where the entry that asked has since changed its words", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ disabled: [hardwareItem(BLUM)] }),
    );
    const dialog = await dialogFor(BLUM, BLUM_NAME, ACTIVATE);

    await pressWithPointer(
      dialogButton(dialog, roCopy("priceDashboard.lifecycle.activateConfirm")),
    );

    expect(openDialog()).toBeNull();
    expect(
      rowOf(screen().container, BLUM).contains(document.activeElement),
    ).toBe(true);
  });

  it("is not lost to the document body after a class that only the draft held is deleted, the whole row being gone", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ changes: CREATED_CLASS }),
    );
    const dialog = await dialogFor(CREATED, CREATED_NAME, DELETE);

    await pressWithPointer(dialogButton(dialog, DELETE));

    expect(openDialog()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBeNull();
  });

  it("keeps the menu's own button reachable: the control that is focus's way back exists after the dialog closes", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await dialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);
    await pressWithPointer(dialogButton(dialog, CANCEL));

    expect(
      moreButtonOf(screen().container, HETTICH, HETTICH_NAME).isConnected,
    ).toBe(true);
  });
});

describe("a production build, as the server hands it its page", () => {
  type Page = ReturnType<typeof hardwarePageOf>;

  /** What `readHardware` returns in a production build: the saved defaults cannot be read and no usage is handed over. */
  const productionPageOf = (
    options: Parameters<typeof hardwarePageOf>[0] = {},
  ): Page => ({
    ...hardwarePageOf({ ...options, defaults: undefined }),
    sampleUsage: undefined,
  });

  /** The kitchens the server counts for Hettich: not the page's sample, so a count read off the page shows. */
  const SERVER_COUNT_FOR_HETTICH = 3;
  let server: LifecycleServer;

  async function mountWithNoLifecycleClient(page: Page): Promise<void> {
    vi.stubEnv("NODE_ENV", "production");
    server = stubTheLifecycleServer({
      availability: page.state.active.availability,
      book: page.state.active.book,
      usage: [
        { item: hardwareItem(HETTICH), designCount: SERVER_COUNT_FOR_HETTICH },
      ],
    });
    const draftServer = inMemoryPriceDraftClient(page.state);
    const screenOf = mountInCatalogue(
      createElement(HardwareListScreen, {
        locale: "ro",
        context: contextOf("administrator", [
          "kitchens",
          "hardware",
          "publish",
        ]),
        page,
        client: draftServer.client,
      }),
      "ro",
    );
    await flushPromises(5);
    mounted = {
      container: screenOf.container,
      draftServer,
      lifecycle: undefined as never,
      unmount: screenOf.unmount,
    };
  }

  it("offers no switch-off and no deletion that could be pressed: both are off, for the reason that nothing can be checked, and no dialog opens", async () => {
    await mountWithNoLifecycleClient(productionPageOf());

    await openMenuOf(screen().container, HETTICH, HETTICH_NAME);
    for (const words of [DEACTIVATE, DELETE]) {
      const entry = menuEntry(screen().container, HETTICH, words);
      await press(entry);

      expect(entry.getAttribute("aria-disabled"), words).toBe("true");
      expect(openDialog(), words).toBeNull();
    }
    expect(
      allIn(
        rowOf(screen().container, HETTICH),
        '[data-testid="menu-reason"]',
      ).map((reason) => reason.textContent),
    ).toEqual(Array(2).fill(roCopy("priceDashboard.lifecycle.cannotJudge")));
    expect(screen().draftServer.calls).toEqual([]);
  });

  it("offers the deletion of a class that only the draft holds: it counts nothing, and confirming takes the creation back out of the draft", async () => {
    await mountWithNoLifecycleClient(
      productionPageOf({ changes: CREATED_CLASS }),
    );

    await openMenuOf(screen().container, CREATED, CREATED_NAME);
    const entry = menuEntry(screen().container, CREATED, DELETE);
    await press(entry);
    const dialog = requireDialog();

    expect(entry.getAttribute("aria-disabled")).not.toBe("true");
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteCreatedBody"),
    );
    expect(server.usageRequests).toEqual([]);
    await press(dialogButton(dialog, DELETE));
    expect(screen().draftServer.state().draft.changes).toEqual([]);
    expect(server.switchRequests).toEqual([]);
  });

  it("names the fallback class a default that cannot be deleted, where the saved defaults cannot be read", async () => {
    await mountWithNoLifecycleClient(productionPageOf());

    await openMenuOf(screen().container, STANDARD, STANDARD_NAME);

    expect(
      allIn(
        rowOf(screen().container, STANDARD),
        '[data-testid="menu-reason"]',
      ).map((reason) => reason.textContent),
    ).toEqual([
      roCopy("priceDashboard.lifecycle.fixedDefaultCannotChange"),
      roCopy("priceDashboard.lifecycle.fixedDefaultCannotChange"),
    ]);
  });

  it("counts a switch-off by what the server says, never by the sample a page was handed", async () => {
    await mountWithNoLifecycleClient(hardwarePageOf());

    await openMenuOf(screen().container, HETTICH, HETTICH_NAME);
    await press(menuEntry(screen().container, HETTICH, DEACTIVATE));

    expect(server.usageRequests).toEqual([[hardwareItem(HETTICH)]]);
    const dialog = openDialog();
    expect(dialog?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usedBy", {
        count: SERVER_COUNT_FOR_HETTICH,
      }),
    );
    expect(dialog?.textContent).not.toContain(
      roCopy("priceDashboard.lifecycle.usedBy", { count: 14 }),
    );
  });

  it("offers no deletion of a class the book states even once the saved defaults are read: only the switch-off opens", async () => {
    await mountWithNoLifecycleClient(hardwarePageOf({ defaults: {} }));

    for (const [tierId, name] of [
      [HETTICH, HETTICH_NAME],
      [BLUM, BLUM_NAME],
    ] as const) {
      await openMenuOf(screen().container, tierId, name);
      const deletion = menuEntry(screen().container, tierId, DELETE);
      await press(deletion);

      expect(deletion.getAttribute("aria-disabled"), tierId).toBe("true");
      expect(openDialog(), tierId).toBeNull();
      expect(
        menuEntry(screen().container, tierId, DEACTIVATE).getAttribute(
          "aria-disabled",
        ),
        tierId,
      ).not.toBe("true");
    }
    expect(server.usageRequests).toEqual([]);
    expect(screen().draftServer.calls).toEqual([]);
  });

  it("offers a switch-on that is pressed through to the server, and the class is on once it answers", async () => {
    await mountWithNoLifecycleClient(
      productionPageOf({ disabled: [hardwareItem(BLUM)] }),
    );

    await openMenuOf(screen().container, BLUM, BLUM_NAME);
    const entry = menuEntry(screen().container, BLUM, ACTIVATE);
    await press(entry);
    const dialog = requireDialog();

    expect(entry.getAttribute("aria-disabled")).not.toBe("true");
    expect(server.switchRequests).toEqual([]);
    await press(
      dialogButton(dialog, roCopy("priceDashboard.lifecycle.activateConfirm")),
    );
    expect(server.switchRequests).toEqual([
      { expectedRevision: "1", item: hardwareItem(BLUM), active: true },
    ]);
    expect(server.availability().disabled).toEqual([]);
    expect(openDialog()).toBeNull();
    expect(
      allIn(
        rowOf(screen().container, BLUM),
        '[data-testid="hardware-chip"]',
      ).map((chip) => chip.textContent),
    ).not.toContain(roCopy("priceDashboard.chips.inactive"));
  });

  it("offers the switch on the class's own page as well, which asks first and sends nothing until it is confirmed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const page = productionPageOf({ disabled: [hardwareItem(BLUM)] });
    server = stubTheLifecycleServer({
      availability: page.state.active.availability,
      usage: [],
    });
    const screenOf = mountInCatalogue(
      createElement(HardwareEditScreen, {
        locale: "ro",
        context: contextOf("administrator", [
          "kitchens",
          "hardware",
          "publish",
        ]),
        page,
        tierId: BLUM,
        client: inMemoryPriceDraftClient(page.state).client,
      }),
      "ro",
    );
    await flushPromises(5);

    const classSwitch = requireIn(screenOf.container, '[role="switch"]');
    await press(classSwitch);

    expect(classSwitch.getAttribute("aria-disabled")).not.toBe("true");
    expect(openDialog()).not.toBeNull();
    expect(server.switchRequests).toEqual([]);
    screenOf.unmount();
  });

  it("offers no creation where the client has no route for one: Create is off with the same reason, whatever is typed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const screenOf = mountInCatalogue(
      createElement(HardwareCreateScreen, {
        locale: "ro",
        context: contextOf("administrator", [
          "kitchens",
          "hardware",
          "publish",
        ]),
        page: productionPageOf(),
      }),
      "ro",
    );
    await flushPromises(5);
    typeInField(
      screenOf.container,
      roCopy("priceDashboard.hardware.nameLabel"),
      "GTV",
    );
    typeInField(
      screenOf.container,
      roCopy("priceDashboard.hardware.descriptionLabel"),
      "Economic",
    );
    for (const label of [
      "priceDashboard.hardware.priceHinge",
      "priceDashboard.hardware.priceSlide",
      "priceDashboard.hardware.pricePush",
      "priceDashboard.hardware.priceLift",
    ] as const) {
      typeInField(screenOf.container, roCopy(label), "10");
    }

    const create = buttonNamed(
      screenOf.container,
      roCopy("priceDashboard.hardware.createAction"),
    );
    await press(create);

    expect(create).toHaveProperty("disabled", true);
    expect(screenOf.container.textContent).toContain(
      roCopy("priceDashboard.lifecycle.cannotJudge"),
    );
    expect(screenOf.container.textContent).not.toContain(SAVE_FAILED);
    screenOf.unmount();
  });
});

describe("a confirmation that is out", () => {
  it("is sent once when the confirmation is pressed twice in a row", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await dialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);
    const release = screen().lifecycle.holdNextWrite();
    const confirm = dialogButton(
      dialog,
      roCopy("priceDashboard.lifecycle.deactivateConfirm"),
    );

    click(confirm);
    click(confirm);
    release();
    await act(async () => {
      await flushPromises(10);
    });

    expect(
      screen().lifecycle.calls.filter((call) => call.kind === "setActive"),
    ).toHaveLength(1);
  });

  it("is not abandoned by Escape or by the scrim while it is out, and closes once it is answered", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await dialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);
    const release = screen().lifecycle.holdNextWrite();
    click(
      dialogButton(
        dialog,
        roCopy("priceDashboard.lifecycle.deactivateConfirm"),
      ),
    );
    await act(async () => {
      await flushPromises(3);
    });

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    act(() => {
      dialog.previousElementSibling?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(openDialog()).toBe(dialog);
    release();
    await act(async () => {
      await flushPromises(10);
    });
    expect(openDialog()).toBeNull();
  });
});

describe("what remains, and which class is the last that is on", () => {
  it("lists neither a class that is off nor one only the draft holds among what remains", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({
        changes: CREATED_CLASS,
        disabled: [hardwareItem(BLUM)],
      }),
    );

    const dialog = await dialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.remaining", { options: STANDARD_NAME }),
    );
    expect(dialog.textContent).not.toContain(CREATED_NAME);
    expect(dialog.textContent).not.toContain(BLUM_NAME);
  });

  it("blocks the switch-off of the only class that is on where the others are off or only in the draft", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({
        changes: CREATED_CLASS,
        disabled: [hardwareItem(STANDARD), hardwareItem(BLUM)],
      }),
    );

    const dialog = await dialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.lastActiveBody"),
    );
    expect(
      screen().lifecycle.calls.filter((call) => call.kind === "setActive"),
    ).toEqual([]);
  });

  it("lets a class be switched off when another is on, and the draft's new class is not that other", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({
        changes: CREATED_CLASS,
        disabled: [hardwareItem(STANDARD), hardwareItem(BLUM)],
      }),
    );
    await openMenuOf(screen().container, CREATED, CREATED_NAME);

    const enable = menuEntry(screen().container, CREATED, ACTIVATE);

    expect(enable.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("a class the draft deletes", () => {
  const DELETES_HETTICH: readonly DraftChange[] = [
    {
      address: {
        kind: "item-deleted",
        item: { kind: "hardware", tierId: HETTICH },
      },
      value: true,
    },
  ];

  it("is offered the same on the list and on its own page: both let the switch be pressed, or neither does", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ changes: DELETES_HETTICH }),
    );
    await openMenuOf(screen().container, HETTICH, HETTICH_NAME);
    const listOffersTheSwitch =
      menuEntry(screen().container, HETTICH, DEACTIVATE).getAttribute(
        "aria-disabled",
      ) !== "true";
    mounted.unmount();

    mounted = await mountHardwareEdit(
      HETTICH,
      hardwarePageOf({ changes: DELETES_HETTICH }),
    );
    const pageOffersTheSwitch =
      allIn(screen().container, '[role="switch"]').length > 0;

    expect(pageOffersTheSwitch).toBe(listOffersTheSwitch);
  });
});

describe("deleting a class that only the draft holds, after its rates were edited", () => {
  it("takes every change of the class out of the draft, the edited rates with the creation, and leaves nothing to publish", async () => {
    mounted = await mountHardwareEdit(
      CREATED,
      hardwarePageOf({ changes: CREATED_CLASS }),
    );
    typeInField(
      screen().container,
      roCopy("priceDashboard.hardware.priceHinge"),
      "100",
    );
    typeInField(
      screen().container,
      roCopy("priceDashboard.hardware.priceLift"),
      "300",
    );
    await press(
      buttonNamed(screen().container, roCopy("priceDashboard.common.save")),
    );
    expect(screen().draftServer.state().draft.changes.length).toBe(
      1 + HARDWARE_RATE_FIELDS.length,
    );

    await pressWithPointer(
      buttonNamed(
        screen().container,
        roCopy("priceDashboard.hardware.deleteAction"),
      ),
    );
    const dialog = openDialog();
    if (dialog === null) throw new Error("no dialog opened");
    await pressWithPointer(dialogButton(dialog, DELETE));

    expect(screen().draftServer.state().draft.changes).toEqual([]);
  });
});

describe("what the page says after it read the data again", () => {
  it("draws what the second read holds of what is switched off, not what the first read held: a re-read is the whole state", async () => {
    const page = hardwarePageOf();
    const server = inMemoryPriceDraftClient(page.state);
    const switchedOffMeanwhile = {
      revision: "7",
      disabled: [hardwareItem(BLUM)],
    };
    const draftClient: PriceDraftClient = {
      ...server.client,
      readState: async () => {
        const state = await server.client.readState();
        return state === undefined
          ? undefined
          : {
              ...state,
              active: { ...state.active, availability: switchedOffMeanwhile },
            };
      },
    };
    mounted = await mountHardwareList(page, { draftClient });
    server.moveDraftBehindTheScreen();
    const dialog = await dialogFor(BLUM, BLUM_NAME, DELETE);

    await press(dialogButton(dialog, DELETE));
    await press(dialogButton(dialog, CANCEL));

    expect(server.calls.map((call) => call.kind)).toContain("readState");
    expect(
      allIn(
        rowOf(screen().container, BLUM),
        '[data-testid="hardware-chip"]',
      ).map((chip) => chip.textContent),
    ).toEqual([roCopy("priceDashboard.chips.inactive")]);
  });
});

describe("where focus goes when a class is deleted from its own page", () => {
  it("is not lost to the document body after a class the active version holds is deleted, the page then holding no switch and no field", async () => {
    mounted = await mountHardwareEdit(BLUM, hardwarePageOf());

    await pressWithPointer(
      buttonNamed(
        screen().container,
        roCopy("priceDashboard.hardware.deleteAction"),
      ),
    );
    const dialog = openDialog();
    if (dialog === null) throw new Error("no dialog opened");
    await pressWithPointer(dialogButton(dialog, DELETE));

    expect(openDialog()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("goes to the notice that replaces the page after a class only the draft held is deleted", async () => {
    mounted = await mountHardwareEdit(
      CREATED,
      hardwarePageOf({ changes: CREATED_CLASS }),
    );

    await pressWithPointer(
      buttonNamed(
        screen().container,
        roCopy("priceDashboard.hardware.deleteAction"),
      ),
    );
    const dialog = openDialog();
    if (dialog === null) throw new Error("no dialog opened");
    await pressWithPointer(dialogButton(dialog, DELETE));

    expect(
      screen().container.querySelector('[data-testid="hardware-removed"]'),
    ).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });
});
