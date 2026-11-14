// @vitest-environment happy-dom
//
// Adversarial QA of M12 W5 (ADR 0184): the availability status and its one named button, on the pages of a hardware class,
// a material and an accessory. It probes what the build assumed: the off states (a fixed default, a screen that cannot
// judge, an item the draft deletes) keep the status and give the button its reason without a press doing anything; a
// refused, failed or conflicting confirmation leaves the badge and the button as they were and the dialog's focus where it
// started; a double press opens one dialog and sends one write; a press that did not focus the button (Safari, Firefox)
// still leaves focus on the page; and Russian reads from the same catalogue.
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  DeletableItemRef,
  DraftChange,
} from "@lemnaria/configurator-domain";

import { UNAVAILABLE_ITEM_LIFECYCLE_CLIENT } from "@/price-dashboard/item-lifecycle-client";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import ruMessages from "../../src/messages/ru.json";
import {
  allIn,
  click,
  requireIn,
  type TestLocale,
} from "../support/render-with-intl";
import { flushPromises } from "../support/render-hook";
import {
  accessoryItem,
  accessoryPageOf,
  DRYING_RACK,
  mountAccessoryEdit,
} from "./accessory-harness";
import {
  BLUM,
  dialogButton,
  hardwareItem,
  hardwarePageOf,
  HETTICH,
  mountHardwareEdit,
  mountHardwareList,
  openDialog,
  openMenuOf,
  menuEntry,
  press,
  STANDARD,
} from "./hardware-harness";
import {
  availabilityActionIn,
  availabilityActionOrNullIn,
  availabilityBadgeTextIn,
  availabilityStatusIn,
} from "./item-availability-control";
import {
  materialItem,
  materialPageOf,
  MDF,
  mountMaterialEdit,
  PAL,
  VENEER,
} from "./material-harness";
import type { RecordingLifecycleClient } from "./recording-item-lifecycle-client";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const ruCopy = createTranslator({
  locale: "ru",
  messages: ruMessages as unknown as Record<string, never>,
}) as unknown as (key: string, values?: Record<string, string>) => string;
const copyOf = (locale: TestLocale) => (locale === "ro" ? roCopy : ruCopy);

const CANCEL = roCopy("priceDashboard.common.cancel");
const CONFIRM_DEACTIVATE = roCopy("priceDashboard.lifecycle.deactivateConfirm");
const ACTIVATE = roCopy("priceDashboard.common.activate");
const CONFIRM_ACTIVATE = roCopy("priceDashboard.lifecycle.activateConfirm");

interface Mounted {
  readonly container: HTMLElement;
  readonly lifecycle: RecordingLifecycleClient;
  readonly unmount: () => void;
}

interface ItemPage {
  readonly name: string;
  readonly mount: (options: {
    readonly isOff?: boolean;
    readonly locale?: TestLocale;
  }) => Promise<Mounted>;
}

const PAGES: readonly ItemPage[] = [
  {
    name: "a hardware class",
    mount: ({ isOff = false, locale = "ro" }) =>
      mountHardwareEdit(
        HETTICH,
        hardwarePageOf({ disabled: isOff ? [hardwareItem(HETTICH)] : [] }),
        { locale },
      ),
  },
  {
    name: "a material",
    mount: ({ isOff = false, locale = "ro" }) =>
      mountMaterialEdit(
        MDF,
        materialPageOf({ disabled: isOff ? [materialItem(MDF)] : [] }),
        { locale },
      ),
  },
  {
    name: "an accessory",
    mount: ({ isOff = false, locale = "ro" }) =>
      mountAccessoryEdit(
        DRYING_RACK,
        accessoryPageOf({
          disabled: isOff ? [accessoryItem(DRYING_RACK)] : [],
        }),
        { locale },
      ),
  },
];

const MATERIAL_PAGE: ItemPage = {
  name: "a material",
  mount: () => Promise.reject(new Error("mounted through mountUnjudgeable")),
};

let mounted: Mounted | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

const writesOf = (screen: Mounted) =>
  screen.lifecycle.calls.filter((call) => call.kind === "setActive");
const dialogCount = () =>
  document.querySelectorAll('[role="alertdialog"], [role="dialog"]').length;

describe.each(PAGES)("the availability control of $name", (page) => {
  describe.each(["ro", "ru"] as const)("in %s", (locale) => {
    const copy = copyOf(locale);

    it("has no switch semantics anywhere on the page, active or inactive, and says the state in the catalogue's words", async () => {
      for (const isOff of [false, true]) {
        mounted = await page.mount({ isOff, locale });
        const { container } = mounted;

        expect(allIn(container, '[role="switch"], [aria-checked]')).toEqual([]);
        expect(availabilityBadgeTextIn(container)).toBe(
          copy(
            isOff
              ? "priceDashboard.chips.inactive"
              : "priceDashboard.chips.active",
          ),
        );
        expect(availabilityActionIn(container).textContent).toBe(
          copy(
            isOff
              ? "priceDashboard.common.activate"
              : "priceDashboard.common.deactivate",
          ),
        );
        mounted.unmount();
        mounted = undefined;
      }
    });
  });

  it("states the status exactly once and offers exactly one availability button directly under it", async () => {
    mounted = await page.mount({});
    const { container } = mounted;

    expect(allIn(container, '[data-testid="item-status"]')).toHaveLength(1);
    const action = availabilityActionIn(container);
    expect(action.type).toBe("button");
    expect(action.disabled).toBe(false);
    expect(action.hasAttribute("aria-disabled")).toBe(false);
    expect(availabilityStatusIn(container).contains(action)).toBe(false);
  });

  it("keeps the badge and the button when the server fails the confirmation, says so in the dialog, and Cancel returns focus to the button", async () => {
    mounted = await page.mount({});
    const { container, lifecycle } = mounted;
    const action = availabilityActionIn(container);
    action.focus();
    await press(action);
    lifecycle.answerNextWriteWith({ kind: "failed" });

    await press(dialogButton(openDialog() ?? container, CONFIRM_DEACTIVATE));

    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.errors.saveFailed"),
    );
    expect(availabilityBadgeTextIn(container)).toBe(
      roCopy("priceDashboard.chips.active"),
    );
    expect(action.textContent).toBe(roCopy("priceDashboard.common.deactivate"));
    await press(dialogButton(openDialog() ?? container, CANCEL));
    expect(openDialog()).toBeNull();
    expect(document.activeElement).toBe(action);
    expect(availabilityActionIn(container)).toBe(action);
  });

  it("keeps the active state when the server refuses the switch-off as a default, and the same button works again afterwards", async () => {
    mounted = await page.mount({});
    const { container, lifecycle } = mounted;
    await press(availabilityActionIn(container));
    lifecycle.answerNextWriteWith({ kind: "refused", code: "item-is-default" });

    await press(dialogButton(openDialog() ?? container, CONFIRM_DEACTIVATE));

    expect(openDialog()).not.toBeNull();
    expect(availabilityBadgeTextIn(container)).toBe(
      roCopy("priceDashboard.chips.active"),
    );
    await press(dialogButton(openDialog() ?? container, CANCEL));
    expect(openDialog()).toBeNull();
    await press(availabilityActionIn(container));
    expect(openDialog()).not.toBeNull();
  });

  it("closes the dialog on a conflict, shows the notice, and leaves the page's own state to what was read again", async () => {
    mounted = await page.mount({});
    const { container, lifecycle } = mounted;
    await press(availabilityActionIn(container));
    lifecycle.answerNextWriteWith({ kind: "conflict" });

    await press(dialogButton(openDialog() ?? container, CONFIRM_DEACTIVATE));

    expect(openDialog()).toBeNull();
    expect(
      allIn(container, '[role="alert"]').map((alert) => alert.textContent),
    ).toContain(roCopy("priceDashboard.errors.changedMeanwhile"));
    expect(writesOf(mounted)).toHaveLength(1);
    expect(
      lifecycle.calls.some((call) => call.kind === "readAvailability"),
    ).toBe(true);
    expect(availabilityActionOrNullIn(container)).not.toBeNull();
  });

  it("opens one dialog when the button is pressed twice before the count answers, and sends one write on confirming", async () => {
    mounted = await page.mount({});
    const { container } = mounted;
    const action = availabilityActionIn(container);

    click(action);
    click(action);
    await flushPromises(10);

    expect(dialogCount()).toBe(1);
    await press(dialogButton(openDialog() ?? container, CONFIRM_DEACTIVATE));
    expect(writesOf(mounted)).toHaveLength(1);
    expect(availabilityBadgeTextIn(container)).toBe(
      roCopy("priceDashboard.chips.inactive"),
    );
  });

  it("sends one write when Confirm is pressed twice while the first is out, and the badge turns only when it answers", async () => {
    mounted = await page.mount({});
    const { container, lifecycle } = mounted;
    await press(availabilityActionIn(container));
    const confirm = dialogButton(openDialog() ?? container, CONFIRM_DEACTIVATE);
    const release = lifecycle.holdNextWrite();

    click(confirm);
    click(confirm);
    await flushPromises(5);

    expect(writesOf(mounted)).toHaveLength(1);
    expect(availabilityBadgeTextIn(container)).toBe(
      roCopy("priceDashboard.chips.active"),
    );
    release();
    await flushPromises(10);
    expect(writesOf(mounted)).toHaveLength(1);
    expect(availabilityBadgeTextIn(container)).toBe(
      roCopy("priceDashboard.chips.inactive"),
    );
    expect(openDialog()).toBeNull();
  });

  it("leaves focus on the page, not on nothing, when the press did not focus the button and the dialog is cancelled", async () => {
    mounted = await page.mount({});
    const { container } = mounted;

    await press(availabilityActionIn(container));
    await press(dialogButton(openDialog() ?? container, CANCEL));

    expect(document.activeElement).not.toBe(document.body);
    expect(container.contains(document.activeElement)).toBe(true);
  });

  it("leaves focus on the page after confirming the switch-on, where the item's own button persists", async () => {
    mounted = await page.mount({ isOff: true });
    const { container } = mounted;
    const action = availabilityActionIn(container);
    action.focus();

    await press(action);
    await press(dialogButton(openDialog() ?? container, CONFIRM_ACTIVATE));

    expect(document.activeElement).toBe(action);
  });
});

/** The off reason, which is the first of the ids the button is described by (the hint follows). */
function reasonOf(action: HTMLElement): string | undefined {
  const ids = (action.getAttribute("aria-describedby") ?? "").split(" ");
  return document.getElementById(ids[0] ?? "")?.textContent;
}

describe("where the availability action is off", () => {
  it("keeps the status, shows the fixed default's reason under the button and does nothing on a press, on a default class", async () => {
    mounted = await mountHardwareEdit(STANDARD, hardwarePageOf());
    const { container } = mounted;
    const action = availabilityActionIn(container);

    await press(action);

    expect(action.getAttribute("aria-disabled")).toBe("true");
    expect(action.disabled).toBe(false);
    expect(reasonOf(action)).toBe(
      roCopy("priceDashboard.lifecycle.fixedDefaultCannotChange"),
    );
    expect(availabilityBadgeTextIn(container)).toBe(
      roCopy("priceDashboard.chips.active"),
    );
    expect(openDialog()).toBeNull();
    expect(mounted.lifecycle.calls).toEqual([]);
  });

  it("does the same on the default material, with focus reaching the button and the reason read with it", async () => {
    mounted = await mountMaterialEdit(PAL, materialPageOf());
    const { container } = mounted;
    const action = availabilityActionIn(container);

    action.focus();
    await press(action);

    expect(document.activeElement).toBe(action);
    expect(action.getAttribute("aria-disabled")).toBe("true");
    expect(reasonOf(action)).toBe(
      roCopy("priceDashboard.lifecycle.fixedDefaultCannotChange"),
    );
    expect(openDialog()).toBeNull();
    expect(writesOf(mounted)).toEqual([]);
  });

  it("is off on every page, with the reason that it cannot be checked, where nothing can be written, active or inactive", async () => {
    for (const page of PAGES) {
      for (const isOff of [false, true]) {
        const mountedPage = await mountUnjudgeable(page, isOff);
        const action = availabilityActionIn(mountedPage.container);

        await press(action);

        const label = `${page.name}, ${isOff ? "inactive" : "active"}`;
        expect(action.getAttribute("aria-disabled"), label).toBe("true");
        expect(reasonOf(action), label).toBe(
          roCopy("priceDashboard.lifecycle.cannotJudge"),
        );
        expect(openDialog(), label).toBeNull();
        expect(availabilityBadgeTextIn(mountedPage.container), label).toBe(
          roCopy(
            isOff
              ? "priceDashboard.chips.inactive"
              : "priceDashboard.chips.active",
          ),
        );
        mountedPage.unmount();
      }
    }
  });

  it("offers no pressable Activate anywhere on an inactive material that cannot be written, banner included", async () => {
    const screen = await mountUnjudgeable(MATERIAL_PAGE, true);
    const activate = allIn<HTMLButtonElement>(
      screen.container,
      "button",
    ).filter(
      (button) =>
        button.textContent === roCopy("priceDashboard.common.activate") &&
        button.getAttribute("aria-disabled") !== "true",
    );

    expect(activate).toEqual([]);
    screen.unmount();
  });

  it("replaces the whole section with the deletion notice for an item the draft deletes: no status line, no button, and no switch (W5-3's draft-deleted clause as built)", async () => {
    const deleted = (item: DeletableItemRef): DraftChange => ({
      address: { kind: "item-deleted", item },
      value: true,
    });
    const screens = [
      await mountHardwareEdit(
        BLUM,
        hardwarePageOf({
          changes: [deleted({ kind: "hardware", tierId: BLUM })],
        }),
      ),
      await mountMaterialEdit(
        VENEER,
        materialPageOf({
          changes: [deleted({ kind: "material", tierId: VENEER })],
        }),
      ),
    ];

    const expectedNotices = [
      roCopy("priceDashboard.hardware.deleteNotice"),
      roCopy("priceDashboard.materials.deleteNotice"),
    ];
    for (const { container, unmount } of screens) {
      expect(allIn(container, '[data-testid="item-status"]')).toEqual([]);
      expect(availabilityActionOrNullIn(container)).toBeNull();
      expect(allIn(container, '[role="switch"], [aria-checked]')).toEqual([]);
      expect(
        allIn(container, '[role="status"]').map((note) => note.textContent),
      ).toContain(expectedNotices.shift());
      unmount();
    }
  });
});

describe("an inactive material, whose banner names no action", () => {
  it("offers exactly one activate button, the section's, and after confirming it focus is not lost to the document", async () => {
    mounted = await mountMaterialEdit(
      MDF,
      materialPageOf({ disabled: [materialItem(MDF)] }),
    );
    const { container } = mounted;
    const banner = requireIn(container, '[data-testid="material-banner"]');
    const activateButtons = allIn<HTMLButtonElement>(
      container,
      "button",
    ).filter((button) => button.textContent === ACTIVATE);
    expect(banner.querySelector("button")).toBeNull();
    expect(activateButtons).toEqual([availabilityActionIn(container)]);

    const sectionButton = activateButtons[0];
    if (sectionButton === undefined) throw new Error("no activate button");
    sectionButton.focus();
    await press(sectionButton);
    await press(dialogButton(openDialog() ?? container, CONFIRM_ACTIVATE));

    expect(
      container.querySelector('[data-testid="material-banner"]'),
    ).toBeNull();
    expect(document.activeElement).toBe(sectionButton);
  });
});

describe("the list's row menu, which shares the off-capable action", () => {
  it("still names the entries by their verb, as menu entries and not switches, and still asks first", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ disabled: [hardwareItem(BLUM)] }),
    );
    const { container } = mounted;

    await openMenuOf(container, HETTICH, "Hettich");
    const deactivate = menuEntry(
      container,
      HETTICH,
      roCopy("priceDashboard.common.deactivate"),
    );
    await openMenuOf(container, BLUM, "Blum");
    const activate = menuEntry(
      container,
      BLUM,
      roCopy("priceDashboard.common.activate"),
    );

    expect(allIn(container, '[role="switch"], [aria-checked]')).toEqual([]);
    expect(deactivate.hasAttribute("aria-checked")).toBe(false);
    await press(activate);
    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.activateTitle", { name: "Blum" }),
    );
  });
});

async function mountUnjudgeable(
  page: ItemPage,
  isOff: boolean,
): Promise<Mounted> {
  switch (page.name) {
    case "a hardware class":
      return mountHardwareEdit(
        HETTICH,
        hardwarePageOf({
          defaults: undefined,
          disabled: isOff ? [hardwareItem(HETTICH)] : [],
        }),
        { lifecycleClient: UNAVAILABLE_ITEM_LIFECYCLE_CLIENT },
      );
    case "a material":
      return mountMaterialEdit(
        MDF,
        materialPageOf({
          defaults: undefined,
          usage: undefined,
          disabled: isOff ? [materialItem(MDF)] : [],
        }),
        { lifecycleClient: UNAVAILABLE_ITEM_LIFECYCLE_CLIENT },
      );
    default:
      return mountAccessoryEdit(
        DRYING_RACK,
        accessoryPageOf({
          defaults: undefined,
          disabled: isOff ? [accessoryItem(DRYING_RACK)] : [],
        }),
        { lifecycleClient: UNAVAILABLE_ITEM_LIFECYCLE_CLIENT },
      );
  }
}
