// @vitest-environment happy-dom
//
// ADR 0184 on the pages of a hardware class, a material and an accessory, which share one section: whether customers are
// given the item is a status stated in text (a badge), not a switch, and the change is one button named for what it will
// do ("Dezactivează" / "Activează") that opens the dialog first. Nothing in the section is a switch.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import {
  accessoryItem,
  accessoryPageOf,
  DRYING_RACK,
  mountAccessoryEdit,
} from "./accessory-harness";
import {
  dialogButton,
  hardwareItem,
  hardwarePageOf,
  HETTICH,
  mountHardwareEdit,
  openDialog,
  press,
} from "./hardware-harness";
import {
  availabilityActionIn,
  availabilityBadgeTextIn,
  availabilityStatusIn,
} from "./item-availability-control";
import {
  materialItem,
  materialPageOf,
  MDF,
  mountMaterialEdit,
} from "./material-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
const ACTIVATE = roCopy("priceDashboard.common.activate");
const ACTIVE = roCopy("priceDashboard.chips.active");
const INACTIVE = roCopy("priceDashboard.chips.inactive");
const CANCEL = roCopy("priceDashboard.common.cancel");
const CONFIRM_DEACTIVATE = roCopy("priceDashboard.lifecycle.deactivateConfirm");
const CONFIRM_ACTIVATE = roCopy("priceDashboard.lifecycle.activateConfirm");

interface MountedItemPage {
  readonly container: HTMLElement;
  readonly unmount: () => void;
}

interface ItemPage {
  readonly name: string;
  readonly mountActive: () => Promise<MountedItemPage>;
  readonly mountInactive: () => Promise<MountedItemPage>;
}

const PAGES: readonly ItemPage[] = [
  {
    name: "a hardware class",
    mountActive: () => mountHardwareEdit(HETTICH, hardwarePageOf()),
    mountInactive: () =>
      mountHardwareEdit(
        HETTICH,
        hardwarePageOf({ disabled: [hardwareItem(HETTICH)] }),
      ),
  },
  {
    name: "a material",
    mountActive: () => mountMaterialEdit(MDF, materialPageOf()),
    mountInactive: () =>
      mountMaterialEdit(MDF, materialPageOf({ disabled: [materialItem(MDF)] })),
  },
  {
    name: "an accessory",
    mountActive: () => mountAccessoryEdit(DRYING_RACK, accessoryPageOf()),
    mountInactive: () =>
      mountAccessoryEdit(
        DRYING_RACK,
        accessoryPageOf({ disabled: [accessoryItem(DRYING_RACK)] }),
      ),
  },
];

let mounted: MountedItemPage | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

describe.each(PAGES)("the availability section of $name", (page) => {
  it("states an active item as text and offers a plain deactivate button, with no switch anywhere in it", async () => {
    mounted = await page.mountActive();
    const { container } = mounted;

    const action = availabilityActionIn(container);
    expect(availabilityBadgeTextIn(container)).toBe(ACTIVE);
    expect(action.textContent).toBe(DEACTIVATE);
    for (const part of [availabilityStatusIn(container), action]) {
      expect(part.closest('[role="switch"]')).toBeNull();
      expect(part.querySelector('[role="switch"], [aria-checked]')).toBeNull();
      expect(part.hasAttribute("aria-checked")).toBe(false);
    }
    expect(action.hasAttribute("role")).toBe(false);
  });

  it("states an inactive item as text and offers an activate button", async () => {
    mounted = await page.mountInactive();
    const { container } = mounted;

    expect(availabilityBadgeTextIn(container)).toBe(INACTIVE);
    expect(availabilityActionIn(container).textContent).toBe(ACTIVATE);
  });

  it("opens the dialog on the deactivate button with focus on Cancel, and Cancel changes nothing and returns focus to the button", async () => {
    mounted = await page.mountActive();
    const { container } = mounted;
    const action = availabilityActionIn(container);
    action.focus();

    await press(action);
    const dialog = openDialog();
    if (dialog === null) throw new Error("no dialog opened");
    expect(document.activeElement).toBe(dialogButton(dialog, CANCEL));
    await press(dialogButton(dialog, CANCEL));

    expect(openDialog()).toBeNull();
    expect(document.activeElement).toBe(action);
    expect(availabilityBadgeTextIn(container)).toBe(ACTIVE);
    expect(action.textContent).toBe(DEACTIVATE);
  });

  it("leaves the inactive badge and the activate button once the deactivation is confirmed", async () => {
    mounted = await page.mountActive();
    const { container } = mounted;

    await press(availabilityActionIn(container));
    await press(dialogButton(openDialog() ?? container, CONFIRM_DEACTIVATE));

    expect(availabilityBadgeTextIn(container)).toBe(INACTIVE);
    expect(availabilityActionIn(container).textContent).toBe(ACTIVATE);
  });

  it("opens the activation dialog on the activate button, and confirming leaves the active badge and the deactivate button", async () => {
    mounted = await page.mountInactive();
    const { container } = mounted;

    await press(availabilityActionIn(container));
    await press(dialogButton(openDialog() ?? container, CONFIRM_ACTIVATE));

    expect(availabilityBadgeTextIn(container)).toBe(ACTIVE);
    expect(availabilityActionIn(container).textContent).toBe(DEACTIVATE);
  });
});
