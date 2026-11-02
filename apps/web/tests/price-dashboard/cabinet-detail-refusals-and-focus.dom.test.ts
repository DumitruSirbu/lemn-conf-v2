// @vitest-environment happy-dom
//
// What the cabinet's page does around a refused price: whose field the refusal lands on, what the sentence says while a
// value is refused, and where focus goes when Cancel leaves the page.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatLei } from "@/price-dashboard/format-lei";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { requireIn } from "../support/render-with-intl";
import {
  BASE_RULE,
  buttonNamed,
  cancelWords,
  fieldNamed,
  mountDetail,
  press,
  typeInField,
  type MountedDetail,
} from "./cabinet-detail-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const ANCHOR_LABEL = roCopy("priceDashboard.cabinet.fieldAnchor", {
  widthMm: 600,
});
const MINUS_LABEL = roCopy("priceDashboard.cabinet.fieldMinus", { stepMm: 50 });
const PLUS_LABEL = roCopy("priceDashboard.cabinet.fieldPlus", { stepMm: 50 });
const SENTENCE = '[data-testid="cabinet-price-sentence"]';
const lei = (minor: number) => formatLei(minor, "lei");

let mounted: MountedDetail | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

async function mountBase(): Promise<HTMLElement> {
  mounted = await mountDetail(BASE_RULE);
  return mounted.container;
}

const isInvalid = (container: HTMLElement, label: string) =>
  fieldNamed(container, label).getAttribute("aria-invalid") === "true";

describe("a price of zero or less is refused on the field that can mend it", () => {
  it("blames the anchor, not the minus step, when the anchor itself is zero", async () => {
    const container = await mountBase();

    typeInField(container, ANCHOR_LABEL, "0");

    expect(isInvalid(container, ANCHOR_LABEL)).toBe(true);
    expect(isInvalid(container, MINUS_LABEL)).toBe(false);
    expect(
      buttonNamed(container, roCopy("priceDashboard.common.save")),
    ).toHaveProperty("disabled", true);
  });

  it("still blames the minus step when a positive anchor is too low for the narrowest width", async () => {
    const container = await mountBase();

    typeInField(container, ANCHOR_LABEL, "1000");

    expect(isInvalid(container, MINUS_LABEL)).toBe(true);
    expect(isInvalid(container, ANCHOR_LABEL)).toBe(false);
  });

  it("still blames the minus step when a positive anchor is overdrawn by it", async () => {
    const container = await mountBase();

    typeInField(container, MINUS_LABEL, "480");

    expect(isInvalid(container, MINUS_LABEL)).toBe(true);
    expect(isInvalid(container, ANCHOR_LABEL)).toBe(false);
  });
});

describe("the sentence while a value is refused", () => {
  it("keeps the amount the draft holds, and does not state the refused one", async () => {
    const container = await mountBase();

    typeInField(container, MINUS_LABEL, "480");

    const sentence = requireIn(container, SENTENCE).textContent;
    expect(isInvalid(container, MINUS_LABEL)).toBe(true);
    expect(sentence).toContain(lei(20_000));
    expect(sentence).not.toContain(lei(48_000));
  });

  it("keeps the draft's anchor in the sentence while the anchor is the refused field", async () => {
    const container = await mountBase();

    typeInField(container, ANCHOR_LABEL, "0");

    const sentence = requireIn(container, SENTENCE).textContent;
    expect(sentence).toContain(
      roCopy("priceDashboard.cabinet.summaryBase", {
        widthMm: 600,
        amount: lei(396_000),
      }),
    );
  });

  it("says a value that is accepted, beside one that is refused", async () => {
    const container = await mountBase();

    typeInField(container, PLUS_LABEL, "210");
    typeInField(container, MINUS_LABEL, "480");

    const sentence = requireIn(container, SENTENCE).textContent;
    expect(sentence).toContain(lei(21_000));
    expect(sentence).not.toContain(lei(48_000));
  });
});

describe("where focus is after Cancel", () => {
  it("is still inside the page when Cancel, which had it, leaves", async () => {
    const container = await mountBase();
    typeInField(container, ANCHOR_LABEL, "3970");
    const cancel = buttonNamed(container, cancelWords());
    act(() => {
      cancel.focus();
    });
    expect(document.activeElement).toBe(cancel);

    await press(cancel);

    expect(
      document.activeElement === document.body,
      "focus fell to the body when the Cancel button left the page",
    ).toBe(false);
    expect(container.contains(document.activeElement)).toBe(true);
  });

  it("is not taken from where it is when the page opens, or when a person types", async () => {
    const container = await mountBase();
    expect(document.activeElement).toBe(document.body);

    typeInField(container, ANCHOR_LABEL, "3970");

    expect(document.activeElement).toBe(document.body);
  });
});
