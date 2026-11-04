// @vitest-environment happy-dom
//
// The hardware row's "⋯" closes on the click that lands outside it and not on the press, is not closed by the click that
// opened it, stays for a click inside it, hands over to another row's, opens from a native button (the browser makes Enter
// and Space a click of it), and closes on Escape from whichever of its controls holds focus.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn, requireIn } from "../support/render-with-intl";
import {
  BLUM,
  HETTICH,
  hardwarePageOf,
  menuEntry,
  moreButtonOf,
  mountHardwareList,
  openMenuOf,
  press,
  rowOf,
  type MountedHardware,
} from "./hardware-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const HETTICH_NAME = "Hettich";
const BLUM_NAME = "Blum";
const DELETE = roCopy("priceDashboard.common.delete");

let mounted: MountedHardware | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

const afterTheOpeningClick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function dispatch(target: HTMLElement, type: string): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true }),
    );
  });
}

const isOpen = (container: HTMLElement, tierId: string) =>
  allIn(rowOf(container, tierId), "ul button").length > 0;

async function mountWithHettichOpen(): Promise<HTMLElement> {
  mounted = await mountHardwareList(hardwarePageOf());
  await openMenuOf(mounted.container, HETTICH, HETTICH_NAME);
  await afterTheOpeningClick();
  return mounted.container;
}

describe("the hardware row's menu, closed by a press outside it", () => {
  it("stays open through the press and the release, and closes on the click that follows", async () => {
    const container = await mountWithHettichOpen();

    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      dispatch(document.body, type);
      expect(isOpen(container, HETTICH), type).toBe(true);
    }
    dispatch(document.body, "click");

    expect(isOpen(container, HETTICH)).toBe(false);
  });

  it("is not closed by the click that opened it", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const { container } = mounted;

    dispatch(moreButtonOf(container, HETTICH, HETTICH_NAME), "click");
    await afterTheOpeningClick();

    expect(isOpen(container, HETTICH)).toBe(true);
  });

  it("is closed by a second click on its own dots, and opens again by a third", async () => {
    const container = await mountWithHettichOpen();
    const dots = moreButtonOf(container, HETTICH, HETTICH_NAME);

    dispatch(dots, "click");
    expect(isOpen(container, HETTICH)).toBe(false);

    dispatch(dots, "click");
    await afterTheOpeningClick();
    expect(isOpen(container, HETTICH)).toBe(true);
  });

  it("stays for a click on one of its own entries and on its own list", async () => {
    const container = await mountWithHettichOpen();

    dispatch(requireIn(rowOf(container, HETTICH), "ul[aria-label]"), "click");
    expect(isOpen(container, HETTICH)).toBe(true);

    await press(menuEntry(container, HETTICH, DELETE));
    expect(isOpen(container, HETTICH)).toBe(true);
  });

  it("hands over to another row's dots at the first click: one menu is open, the other's", async () => {
    const container = await mountWithHettichOpen();

    await openMenuOf(container, BLUM, BLUM_NAME);

    expect(isOpen(container, HETTICH)).toBe(false);
    expect(isOpen(container, BLUM)).toBe(true);
    expect(allIn(container, 'button[aria-expanded="true"]')).toHaveLength(1);
  });
});

describe("the hardware row's menu, opened and closed from the keyboard", () => {
  it("is opened by a native button, which the browser presses with Enter and Space", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dots = moreButtonOf(mounted.container, HETTICH, HETTICH_NAME);

    expect(dots.tagName).toBe("BUTTON");
    expect(dots.type).toBe("button");
    expect(dots.disabled).toBe(false);
    expect(dots.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape from the dots as well as from an entry, leaving focus on the dots", async () => {
    const container = await mountWithHettichOpen();
    const dots = moreButtonOf(container, HETTICH, HETTICH_NAME);
    dots.focus();

    act(() => {
      dots.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(isOpen(container, HETTICH)).toBe(false);
    expect(document.activeElement).toBe(dots);
  });

  it("does not stop an Escape pressed while no menu is open, so a dialog or the page can take it", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const { container } = mounted;
    const dots = moreButtonOf(container, HETTICH, HETTICH_NAME);
    let reachedDocument = false;
    const note = () => {
      reachedDocument = true;
    };
    document.addEventListener("keydown", note);

    act(() => {
      dots.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    document.removeEventListener("keydown", note);

    expect(reachedDocument).toBe(true);
  });
});
