// @vitest-environment happy-dom
//
// A value typed into a row's "Nou" and not sent is not in the draft, so a publish would put the old figure live. While
// any row holds such text the publish is off, and the page says why; sending the value, closing the field or taking the
// row back lets it go.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { allIn, click, requireIn, typeInto } from "../support/render-with-intl";
import {
  inputWithDraft,
  mountDesk,
  pressKey,
  settle,
  type MountedDesk,
} from "./publish-desk-harness";
import {
  anchorOf,
  BASE_ANCHOR,
  LEI,
  openFieldOf,
  TWO_AMOUNT_ROWS,
  WALL_ANCHOR,
} from "./qa-m10-u5b-support";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const REASON = roCopy("priceDashboard.publish.unsentAmountHint");
const PUBLISH_BUTTON = '[class*="primary"]';

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  leaveTheStaffServer();
});

async function mountWithTwoRows(): Promise<MountedDesk> {
  mounted = await mountDesk({ input: inputWithDraft(TWO_AMOUNT_ROWS, "1") });
  return mounted;
}

function typeAnotherPrice(
  container: HTMLElement,
  ruleId: string,
): HTMLInputElement {
  const field = openFieldOf(container, ruleId);
  typeInto(field, String((anchorOf(ruleId) + 90 * LEI) / LEI));
  return field;
}

const isPublishOff = (container: HTMLElement): boolean =>
  requireIn(container, PUBLISH_BUTTON).getAttribute("aria-disabled") === "true";

const reasonsOn = (container: HTMLElement): number =>
  allIn(container, "p").filter((paragraph) => paragraph.textContent === REASON)
    .length;

describe("a value typed into a row's Nou and not sent", () => {
  it("turns the publish off and says why, and a press on it opens no question", async () => {
    const { container, client } = await mountWithTwoRows();
    expect(isPublishOff(container)).toBe(false);
    expect(reasonsOn(container)).toBe(0);

    typeAnotherPrice(container, BASE_ANCHOR.ruleId);
    await settle();
    click(requireIn(container, PUBLISH_BUTTON));
    await settle();

    expect(isPublishOff(container)).toBe(true);
    expect(reasonsOn(container)).toBe(1);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(client.publish).not.toHaveBeenCalled();
  });

  it("holds the publish off for text that is not an amount as well", async () => {
    const { container } = await mountWithTwoRows();
    const field = openFieldOf(container, BASE_ANCHOR.ruleId);

    typeInto(field, "abc");
    await settle();

    expect(isPublishOff(container)).toBe(true);
    expect(reasonsOn(container)).toBe(1);
  });

  it("is let go of when it is sent, and the publish is on again", async () => {
    const { container } = await mountWithTwoRows();
    const field = typeAnotherPrice(container, BASE_ANCHOR.ruleId);
    await settle();

    await pressKey(field, "Enter");

    expect(isPublishOff(container)).toBe(false);
    expect(reasonsOn(container)).toBe(0);
  });

  it("is let go of when the field is closed with Escape", async () => {
    const { container } = await mountWithTwoRows();
    const field = typeAnotherPrice(container, BASE_ANCHOR.ruleId);
    await settle();

    await pressKey(field, "Escape");

    expect(isPublishOff(container)).toBe(false);
    expect(reasonsOn(container)).toBe(0);
  });

  it("is let go of when its row is taken back", async () => {
    const { container } = await mountWithTwoRows();
    typeAnotherPrice(container, BASE_ANCHOR.ruleId);
    await settle();

    click(requireIn(container, '[data-testid="diff-revert"]'));
    await settle();

    expect(allIn(container, '[data-testid="diff-row"]')).toHaveLength(1);
    expect(isPublishOff(container)).toBe(false);
    expect(reasonsOn(container)).toBe(0);
  });

  it("holds the publish off for as long as any one of two rows holds text", async () => {
    const { container } = await mountWithTwoRows();
    const first = typeAnotherPrice(container, BASE_ANCHOR.ruleId);
    const second = typeAnotherPrice(container, WALL_ANCHOR.ruleId);
    await settle();

    await pressKey(first, "Escape");
    expect(isPublishOff(container), "the other row still holds text").toBe(
      true,
    );
    await pressKey(second, "Escape");

    expect(isPublishOff(container)).toBe(false);
  });
});

describe("a field opened and left as it was", () => {
  it("does not hold the publish off", async () => {
    const { container } = await mountWithTwoRows();

    openFieldOf(container, BASE_ANCHOR.ruleId);
    await settle();

    expect(isPublishOff(container)).toBe(false);
    expect(reasonsOn(container)).toBe(0);
  });
});
