// @vitest-environment happy-dom
//
// The dialog that switches a class off lists what remains, and `qa-m10-u4a-lifecycle.adversarial.dom.test.ts` holds that list
// to the classes that are on. With the domain's list sabotaged to include a class that is off, the same gestures put that class
// in the dialog, so the adversarial test (which expects it absent) is one that can fail.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import {
  BLUM,
  HETTICH,
  hardwareItem,
  hardwarePageOf,
  menuEntry,
  mountHardwareList,
  openDialog,
  openMenuOf,
  press,
  type MountedHardware,
} from "./hardware-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const world = vi.hoisted(() => ({ isSabotaged: false }));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...actual,
    remainingOptionsIfSwitchedOff: (
      item: Parameters<typeof actual.remainingOptionsIfSwitchedOff>[0],
      context: Parameters<typeof actual.remainingOptionsIfSwitchedOff>[1],
    ) =>
      world.isSabotaged
        ? actual
            .declaredOptionsOfGroupOf(item, context.book)
            .filter((option) => !actual.isSameItem(option, item))
        : actual.remainingOptionsIfSwitchedOff(item, context),
  };
});

let mounted: MountedHardware | undefined;

beforeEach(() => {
  stubTheStaffServer();
  world.isSabotaged = false;
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

async function dialogTextForSwitchingOffHettich(): Promise<string> {
  mounted = await mountHardwareList(
    hardwarePageOf({ disabled: [hardwareItem(BLUM)] }),
  );
  await openMenuOf(mounted.container, HETTICH, "Hettich");
  await press(
    menuEntry(
      mounted.container,
      HETTICH,
      roCopy("priceDashboard.common.deactivate"),
    ),
  );
  return openDialog()?.textContent ?? "";
}

describe("a sabotage of the list of what remains", () => {
  it("leaves a class that is off out of the dialog while the list is the domain's", async () => {
    expect(await dialogTextForSwitchingOffHettich()).not.toContain("Blum");
  });

  it("puts that class in the dialog once the list ignores what is off", async () => {
    world.isSabotaged = true;

    expect(await dialogTextForSwitchingOffHettich()).toContain("Blum");
  });
});
