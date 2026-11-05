// @vitest-environment happy-dom
//
// Counterexamples to the materials screens' lifecycle: what a switch says in Russian as well as in Romanian, where focus
// goes when the control that asked has gone, what Escape does in each dialog, what a draft deletion changes about the
// switches beside it, and what a production page, whose lifecycle client asks the server, can be made to show.
import { act, createElement } from "react";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeletableItemRef } from "@lemnaria/configurator-domain";

import { MaterialEditScreen } from "@/price-dashboard/material-edit";
import { MaterialListScreen } from "@/price-dashboard/material-list";
import {
  surchargeAddressOf,
  type MaterialPageInput,
} from "@/price-dashboard/material-model";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";
import {
  dialogButton,
  MDF,
  MDF_NAME,
  PAL,
  PAL_NAME,
  VENEER,
  VENEER_NAME,
  materialItem,
  materialPageOf,
  menuEntry,
  mountMaterialEdit,
  mountMaterialList,
  openDialog,
  openMenuOf,
  pendingChipText,
  press,
  reasonOf,
  rowOf,
  USAGE,
  type MountedMaterials,
} from "./material-harness";
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

const ruCopy = createTranslator({
  locale: "ru",
  messages: ruMessages as unknown as Record<string, never>,
}) as unknown as (key: string, values?: Record<string, unknown>) => string;

const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
const ACTIVATE = roCopy("priceDashboard.common.activate");
const DELETE = roCopy("priceDashboard.common.delete");
const CLOSE = roCopy("priceDashboard.common.close");
const CONFIRM_DEACTIVATE = roCopy("priceDashboard.lifecycle.deactivateConfirm");
const CONFIRM_ACTIVATE = roCopy("priceDashboard.lifecycle.activateConfirm");
const CANNOT_JUDGE = roCopy("priceDashboard.lifecycle.cannotJudge");
/** What the book alone refuses stays refused where nothing can be judged: PAL is the catalogue's own default. */
const FIXED_DEFAULT = roCopy(
  "priceDashboard.lifecycle.fixedDefaultCannotChange",
);

let mounted: MountedMaterials | undefined;
let productionScreen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  productionScreen?.unmount();
  productionScreen = undefined;
  resetStaffSessionExpiryForTests();
  vi.unstubAllEnvs();
  leaveTheStaffServer();
});

async function pressEscapeAndSettle(): Promise<void> {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await flushPromises(5);
  });
}

function screenOf(): MountedMaterials {
  if (mounted === undefined) throw new Error("nothing is mounted");
  return mounted;
}

async function openRowDialog(
  tierId: string,
  name: string,
  entryWords: string,
): Promise<HTMLElement> {
  const { container } = screenOf();
  await openMenuOf(container, tierId, name);
  const entry = menuEntry(container, tierId, entryWords);
  entry.focus();
  await press(entry);
  const dialog = openDialog();
  if (dialog === null) throw new Error("no dialog opened");
  return dialog;
}

describe("a switch in Russian", () => {
  /** The dialog a row's menu entry opens, found by the Russian words, since the harness asks in Romanian. */
  async function dialogOf(tierId: string, words: string): Promise<string> {
    const row = rowOf(screenOf().container, tierId);
    await press(requireIn(row, "button[aria-expanded]"));
    const entry = allIn<HTMLButtonElement>(row, "ul button").find(
      (button) => button.textContent.trim() === words,
    );
    if (entry === undefined) throw new Error(`no menu entry says "${words}"`);
    await press(entry);
    return openDialog()?.textContent ?? "";
  }

  it("never says it waits for publication, in the dialog that disables or the one that enables, and says it applies at once", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ disabled: [materialItem(VENEER)] }),
      { locale: "ru" },
    );

    const disabling = await dialogOf(
      MDF,
      ruCopy("priceDashboard.common.deactivate"),
    );
    await press(
      dialogButton(
        openDialog() ?? document.body,
        ruCopy("priceDashboard.common.cancel"),
      ),
    );
    const enabling = await dialogOf(
      VENEER,
      ruCopy("priceDashboard.common.activate"),
    );

    expect(disabling).toContain(
      ruCopy("priceDashboard.lifecycle.appliesImmediately"),
    );
    expect(disabling).not.toMatch(/публикац/iu);
    expect(enabling).toContain(ruCopy("priceDashboard.lifecycle.activateBody"));
    expect(enabling).not.toMatch(/публикац/iu);
  });
});

describe("the page's own switch", () => {
  it("writes the switch-off at once, adds nothing to De publicat, leaves the header count as it was and then offers the banner", async () => {
    mounted = await mountMaterialEdit(
      MDF,
      materialPageOf({
        changes: [{ address: surchargeAddressOf(VENEER), value: 77 }],
      }),
    );
    const { container } = screenOf();
    const pendingBefore = pendingChipText(container);
    expect(pendingBefore).toBeDefined();
    const switchButton = allIn<HTMLButtonElement>(
      container,
      '[role="switch"]',
    )[0];
    if (switchButton === undefined) throw new Error("no switch");
    switchButton.focus();

    await press(switchButton);
    const dialog = openDialog();
    expect(dialog?.textContent).not.toMatch(/intr. .n vigoare c.nd publici/iu);
    await press(dialogButton(dialog ?? document.body, CONFIRM_DEACTIVATE));

    expect(
      screenOf().lifecycle.calls.filter((call) => call.kind === "setActive"),
    ).toEqual([
      {
        kind: "setActive",
        request: {
          expectedRevision: "1",
          item: materialItem(MDF),
          active: false,
        },
      },
    ]);
    expect(screenOf().draftServer.calls).toEqual([]);
    expect(pendingChipText(container)).toBe(pendingBefore);
    expect(
      container.querySelector('[data-testid="material-banner"]')?.textContent,
    ).toContain(roCopy("priceDashboard.chips.inactiveInUse", { count: 23 }));
    expect(document.activeElement).toBe(switchButton);
  });

  it("gives focus to the page's heading, not to nothing, when the banner's button that asked is gone after the switch-on", async () => {
    mounted = await mountMaterialEdit(
      MDF,
      materialPageOf({ disabled: [materialItem(MDF)] }),
    );
    const { container } = screenOf();
    const banner = container.querySelector('[data-testid="material-banner"]');
    const activate = allIn<HTMLButtonElement>(
      (banner as HTMLElement | null) ?? document.body,
      "button",
    )[0];
    if (activate === undefined) throw new Error("the banner offers no button");
    activate.focus();

    await press(activate);
    await press(dialogButton(openDialog() ?? document.body, CONFIRM_ACTIVATE));

    expect(
      container.querySelector('[data-testid="material-banner"]'),
    ).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.tagName).toBe("H1");
  });

  it("gives focus to the page's heading when the deletion it confirmed takes the delete button out of the page", async () => {
    mounted = await mountMaterialEdit(VENEER, materialPageOf());
    const { container } = screenOf();
    const remove = allIn<HTMLButtonElement>(container, "button").find(
      (button) =>
        button.textContent.trim() ===
        roCopy("priceDashboard.materials.deleteAction"),
    );
    if (remove === undefined) throw new Error("the page offers no deletion");
    remove.focus();

    await press(remove);
    await press(dialogButton(openDialog() ?? document.body, DELETE));

    expect(openDialog()).toBeNull();
    expect(screenOf().draftServer.calls).toHaveLength(1);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.materials.deleteNotice"),
    );
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.tagName).toBe("H1");
  });
});

describe("Escape in each dialog", () => {
  it("leaves a disable, an enable and a delete unasked: nothing is written and focus returns to the entry that asked", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ disabled: [materialItem(VENEER)] }),
    );
    const cases = [
      [MDF, MDF_NAME, DEACTIVATE, CONFIRM_DEACTIVATE],
      [VENEER, VENEER_NAME, ACTIVATE, CONFIRM_ACTIVATE],
    ] as const;

    for (const [tierId, name, words] of cases) {
      await openRowDialog(tierId, name, words);

      await pressEscapeAndSettle();

      expect(openDialog(), words).toBeNull();
      expect(document.activeElement, words).toBe(
        menuEntry(screenOf().container, tierId, words),
      );
    }
    expect(
      screenOf().lifecycle.calls.filter((call) => call.kind === "setActive"),
    ).toEqual([]);
    expect(screenOf().draftServer.calls).toEqual([]);
  });

  it("closes the delete question and the delete block without a deletion", async () => {
    mounted = await mountMaterialList(materialPageOf());

    await openRowDialog(VENEER, VENEER_NAME, DELETE);
    await pressEscapeAndSettle();
    expect(openDialog()).toBeNull();

    await openRowDialog(MDF, MDF_NAME, DELETE);
    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedTitle", { name: MDF_NAME }),
    );
    await pressEscapeAndSettle();
    expect(openDialog()).toBeNull();

    expect(screenOf().draftServer.calls).toEqual([]);
  });

  it("closes the last-active block, which has the one button, and writes nothing", async () => {
    mounted = await mountMaterialList(
      materialPageOf({
        disabled: [materialItem(MDF), materialItem(VENEER)],
      }),
    );
    const dialog = await openRowDialog(PAL, PAL_NAME, DEACTIVATE);
    expect(document.activeElement).toBe(dialogButton(dialog, CLOSE));

    await pressEscapeAndSettle();

    expect(openDialog()).toBeNull();
    expect(
      screenOf().lifecycle.calls.filter((call) => call.kind === "setActive"),
    ).toEqual([]);
  });
});

describe("a draft that deletes a material, beside the switches", () => {
  const deletesVeneer = {
    address: {
      kind: "item-deleted",
      item: materialItem(VENEER) as DeletableItemRef,
    },
    value: true,
  } as const;

  it("keeps the deleted material's switch and deletion off with the draft's notice, and leaves its neighbours' switches as they were", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ changes: [deletesVeneer] }),
    );
    const { container } = screenOf();

    await openMenuOf(container, VENEER, VENEER_NAME);
    for (const words of [DEACTIVATE, DELETE]) {
      const entry = menuEntry(container, VENEER, words);
      expect(entry.getAttribute("aria-disabled"), words).toBe("true");
      expect(reasonOf(entry), words).toBe(
        roCopy("priceDashboard.materials.deleteNotice"),
      );
    }
    await openMenuOf(container, MDF, MDF_NAME);
    expect(
      menuEntry(container, MDF, DEACTIVATE).getAttribute("aria-disabled"),
    ).not.toBe("true");
  });

  it("still blocks PAL's switch-off, with the fixed default's reason, when the draft deletes the other material that is on", async () => {
    mounted = await mountMaterialList(
      materialPageOf({
        changes: [deletesVeneer],
        disabled: [materialItem(MDF)],
      }),
    );
    const { container } = screenOf();

    await openMenuOf(container, PAL, PAL_NAME);
    const entry = menuEntry(container, PAL, DEACTIVATE);
    await press(entry);

    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(reasonOf(entry)).toBe(
      roCopy("priceDashboard.lifecycle.fixedDefaultCannotChange"),
    );
    expect(openDialog()).toBeNull();
  });
});

describe("a production page", () => {
  /** The kitchens the server counts for MDF: not one of the sample's counts, so a figure read off the page shows. */
  const SERVER_COUNT_FOR_MDF = 7;
  let server: LifecycleServer;

  /** What `readMaterials` hands a production build: the state, no defaults and no counts. */
  const productionPage = (
    options: Parameters<typeof materialPageOf>[0] = {},
  ): MaterialPageInput => ({
    ...materialPageOf(options),
    defaults: undefined,
    sampleUsage: undefined,
  });

  const mountProduction = async (
    screen: "list" | "edit",
    page: MaterialPageInput,
    tierId = MDF,
  ): Promise<HTMLElement> => {
    vi.stubEnv("NODE_ENV", "production");
    server = stubTheLifecycleServer({
      availability: page.state.active.availability,
      usage: [{ item: materialItem(MDF), designCount: SERVER_COUNT_FOR_MDF }],
    });
    const draftClient = inMemoryPriceDraftClient(page.state).client;
    const element =
      screen === "list"
        ? createElement(MaterialListScreen, {
            locale: "ro",
            context: contextOf("administrator", ["kitchens", "materials"]),
            page,
            client: draftClient,
          })
        : createElement(MaterialEditScreen, {
            locale: "ro",
            context: contextOf("administrator", ["kitchens", "materials"]),
            page,
            tierId,
            client: draftClient,
          });
    productionScreen = mountInCatalogue(element, "ro");
    await flushPromises(8);
    return productionScreen.container;
  };

  it("keeps every deletion of the list off, and every switch-off, with the reason that nothing can be checked; the switch-on of what is off is offered", async () => {
    const container = await mountProduction(
      "list",
      productionPage({ disabled: [materialItem(MDF)] }),
    );

    for (const [tierId, name] of [
      [PAL, PAL_NAME],
      [MDF, MDF_NAME],
      [VENEER, VENEER_NAME],
    ] as const) {
      await openMenuOf(container, tierId, name);
      const entries = allIn<HTMLButtonElement>(
        rowOf(container, tierId),
        "ul button",
      );
      expect(entries, tierId).toHaveLength(2);
      const [switchEntry, deleteEntry] = entries as [
        HTMLButtonElement,
        HTMLButtonElement,
      ];
      const isSwitchOffered = tierId === MDF;
      expect(switchEntry.getAttribute("aria-disabled") === "true", tierId).toBe(
        !isSwitchOffered,
      );
      if (!isSwitchOffered) {
        expect(reasonOf(switchEntry), tierId).toBe(
          tierId === PAL ? FIXED_DEFAULT : CANNOT_JUDGE,
        );
      }
      expect(deleteEntry.getAttribute("aria-disabled"), tierId).toBe("true");
      expect(reasonOf(deleteEntry), tierId).toBe(
        tierId === PAL ? FIXED_DEFAULT : CANNOT_JUDGE,
      );
      await press(deleteEntry);
    }
    expect(openDialog()).toBeNull();
  });

  it("states none of the sample's counts in the list, though they exist in the tree", async () => {
    const container = await mountProduction(
      "list",
      productionPage({ disabled: [materialItem(MDF)] }),
    );

    for (const { designCount } of USAGE) {
      expect(container.textContent).not.toContain(
        roCopy("priceDashboard.chips.inactiveInUse", { count: designCount }),
      );
    }
  });

  it("asks the server once for the count of the switched-off materials, and says the figure it gave", async () => {
    const container = await mountProduction(
      "list",
      productionPage({ disabled: [materialItem(MDF)] }),
    );

    expect(server.usageRequests).toEqual([[materialItem(MDF)]]);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.chips.inactiveInUse", {
        count: SERVER_COUNT_FOR_MDF,
      }),
    );
  });

  it("offers the switch-on on the page of a switched-off material, and its banner says the figure the server gave", async () => {
    const container = await mountProduction(
      "edit",
      productionPage({ disabled: [materialItem(MDF)] }),
    );

    const banner = container.querySelector('[data-testid="material-banner"]');
    expect(banner).not.toBeNull();
    expect(container.textContent).toContain(
      roCopy("priceDashboard.chips.inactiveInUse", {
        count: SERVER_COUNT_FOR_MDF,
      }),
    );
    for (const { designCount } of USAGE) {
      expect(container.textContent).not.toContain(
        roCopy("priceDashboard.chips.inactiveInUse", { count: designCount }),
      );
    }
    const switchButton = allIn<HTMLButtonElement>(
      container,
      '[role="switch"]',
    )[0];
    expect(switchButton?.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("opens the switch-off question of MDF, once the saved defaults are read, with the figure the server gave", async () => {
    const container = await mountProduction("list", {
      ...productionPage(),
      defaults: {},
    });

    await openMenuOf(container, MDF, MDF_NAME);
    await press(menuEntry(container, MDF, DEACTIVATE));

    expect(server.usageRequests).toEqual([[materialItem(MDF)]]);
    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usedBy", {
        count: SERVER_COUNT_FOR_MDF,
      }),
    );
  });

  it("keeps the deletion button of a material's page off with the same reason", async () => {
    const container = await mountProduction("edit", productionPage(), VENEER);

    const remove = allIn<HTMLButtonElement>(container, "button").find(
      (button) =>
        button.textContent.trim() ===
        roCopy("priceDashboard.materials.deleteAction"),
    );

    expect(remove?.getAttribute("aria-disabled")).toBe("true");
    expect(reasonOf(remove as HTMLElement)).toBe(CANNOT_JUDGE);
  });
});
