// @vitest-environment happy-dom
//
// The accessory form, after the words rule grew: a format character typed into the name is read by the form as the server
// reads it, the new hint holds no digit and appears only when the cabinet type is the one thing missing, and the heading
// after a creation names the accessory that was made, not what is typed afterwards.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn, requireIn } from "../support/render-with-intl";
import { buttonNamed, typeInField } from "./cabinet-detail-harness";
import {
  accessoryPageOf,
  LINKED_BUILD_ID,
  mountAccessoryCreate,
  type MountedAccessories,
} from "./accessory-harness";
import { press } from "./hardware-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const NAME = roCopy("priceDashboard.accessories.nameLabel");
const PRICE = roCopy("priceDashboard.accessories.pricePerPiece");
const CREATE = roCopy("priceDashboard.accessories.createAction");
const NEEDS_LINK = roCopy("priceDashboard.accessories.createNeedsLink");

let mounted: MountedAccessories | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

async function mountForm(): Promise<HTMLElement> {
  mounted = await mountAccessoryCreate(accessoryPageOf());
  return mounted.container;
}

function choose(container: HTMLElement, buildId: string): void {
  const select = requireIn<HTMLSelectElement>(container, "select");
  Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set?.call(select, buildId);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("a name that holds a format character, typed into the form", () => {
  it.each([
    ["a zero-width space", "So​clu"],
    ["a soft hyphen", "So­clu"],
    ["a byte-order mark at the edge", "﻿Soclu"],
  ])("keeps Create off for %s and says why in the field", async (_, text) => {
    const container = await mountForm();
    typeInField(container, NAME, text);
    typeInField(container, PRICE, "80");
    choose(container, LINKED_BUILD_ID);

    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", true);
    const alerts = allIn(container, '[role="alert"]').map(
      (alert) => alert.textContent,
    );
    expect(alerts).not.toEqual([]);
    expect(alerts.join(" ")).not.toMatch(/priceDashboard\.|undefined|\{/);
  });

  it("takes the same name without the character, and Create comes on", async () => {
    const container = await mountForm();
    typeInField(container, NAME, "So​clu");
    typeInField(container, PRICE, "80");
    choose(container, LINKED_BUILD_ID);

    typeInField(container, NAME, "Soclu");

    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", false);
  });
});

describe("the hint that the cabinet type is missing", () => {
  it.each(["priceDashboard.accessories.createNeedsLink"] as const)(
    "holds no digit in either language",
    async (key) => {
      const { default: ru } = await import("@/messages/ru.json");
      const { default: ro } = await import("@/messages/ro.json");
      const leaf = (messages: unknown) =>
        key
          .split(".")
          .reduce<unknown>(
            (held, part) => (held as Record<string, unknown>)[part],
            messages,
          );

      expect(leaf(ro)).toBe(NEEDS_LINK);
      expect(String(leaf(ro))).not.toMatch(/\d/);
      expect(String(leaf(ru))).not.toMatch(/\d/);
      expect(String(leaf(ru)).length).toBeGreaterThan(10);
    },
  );

  it("is not shown for a name the rule refuses, since the name is what is missing", async () => {
    const container = await mountForm();
    typeInField(container, NAME, "So​clu");
    typeInField(container, PRICE, "80");

    expect(container.textContent).not.toContain(NEEDS_LINK);
  });
});

describe("the heading after a creation", () => {
  it("keeps the name that was created when the field is typed in afterwards", async () => {
    const container = await mountForm();
    typeInField(container, NAME, "Suport farfurii");
    typeInField(container, PRICE, "80");
    choose(container, LINKED_BUILD_ID);
    await press(buttonNamed(container, CREATE));
    expect(requireIn(container, "h1").textContent).toBe("Suport farfurii");

    const field = allIn<HTMLInputElement>(container, "input").find(
      (input) => input.value === "Suport farfurii",
    );
    if (field !== undefined && !field.disabled && !field.readOnly) {
      typeInField(container, NAME, "Altceva");
    }

    expect(requireIn(container, "h1").textContent).toBe("Suport farfurii");
  });

  it("shows a name made of markup as text and nothing else", async () => {
    const container = await mountForm();
    typeInField(container, NAME, "<b>Soclu</b>");
    typeInField(container, PRICE, "80");
    choose(container, LINKED_BUILD_ID);
    await press(buttonNamed(container, CREATE));

    expect(requireIn(container, "h1").textContent).toBe("<b>Soclu</b>");
    expect(allIn(container, "h1 b")).toHaveLength(0);
  });
});
