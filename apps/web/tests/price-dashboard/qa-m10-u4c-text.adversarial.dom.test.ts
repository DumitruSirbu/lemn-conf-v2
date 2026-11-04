// @vitest-environment happy-dom
//
// The Romanian words of a new accessory, typed into the creation form: each hostile name or description is refused with the
// domain's own sentence for it, nothing is sent, and the words at the very bound of what the book takes are sent as typed
// (trimmed). The form holds no rule of its own about text, so the cases are the domain's, met through the screen.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  judgeCreatedRowText,
  MAX_BOOK_NAME_LENGTH,
} from "@lemnaria/configurator-domain";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { requireIn } from "../support/render-with-intl";
import { alertsIn, buttonNamed, typeInField } from "./cabinet-detail-harness";
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
const DESCRIPTION = roCopy("priceDashboard.accessories.descriptionLabel");
const PRICE = roCopy("priceDashboard.accessories.pricePerPiece");
const CREATE = roCopy("priceDashboard.accessories.createAction");
const GOOD_NAME = "Suport pentru farfurii";

const EMPTY = roCopy("priceDashboard.errors.textEmpty");
const FORBIDDEN = roCopy("priceDashboard.errors.textForbiddenCharacter");
const TOO_LONG = roCopy("priceDashboard.errors.textTooLong");
const STATES_AN_AMOUNT = roCopy("priceDashboard.errors.textStatesAnAmount");

/** The longest description the domain takes, found by asking it: the bound is not exported. */
const MAX_BOOK_DESCRIPTION_LENGTH = (() => {
  let length = 1;
  while (judgeCreatedRowText("d".repeat(length + 1), "description").ok) {
    length += 1;
  }
  return length;
})();

const BIDI_OVERRIDE = "‮";
const ZERO_WIDTH_SPACE = "​";
const COMBINING_COMMA_BELOW = "̦";
const LONE_SURROGATE = "\uD800";

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
  const { container } = mounted;
  typeInField(container, PRICE, "80");
  const select = requireIn<HTMLSelectElement>(container, "select");
  Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set?.call(select, LINKED_BUILD_ID);
  act(() => {
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return container;
}

const isCreateOff = (container: HTMLElement) =>
  buttonNamed(container, CREATE).disabled;

describe("the bound of a description", () => {
  it("is found, and is more than the name's", () => {
    expect(MAX_BOOK_DESCRIPTION_LENGTH).toBeGreaterThan(MAX_BOOK_NAME_LENGTH);
    expect(
      judgeCreatedRowText(
        "d".repeat(MAX_BOOK_DESCRIPTION_LENGTH + 1),
        "description",
      ).ok,
    ).toBe(false);
  });
});

describe("a name the form refuses", () => {
  it.each([
    ["only blanks", "   ", EMPTY],
    ["only a zero-width space", ZERO_WIDTH_SPACE, EMPTY],
    ["a direction override", `Suport${BIDI_OVERRIDE}drow`, FORBIDDEN],
    ["a bell", "Suport\u0007", FORBIDDEN],
    ["a tab", "Suport\tcu rand", FORBIDDEN],
    ["a lone surrogate half", `Suport${LONE_SURROGATE}`, FORBIDDEN],
    [
      "a letter not composed (s and a combining comma)",
      `s${COMBINING_COMMA_BELOW}`,
      FORBIDDEN,
    ],
    [
      "one more than the book takes",
      "x".repeat(MAX_BOOK_NAME_LENGTH + 1),
      TOO_LONG,
    ],
    ["a price in lei", "Suport 50 lei", STATES_AN_AMOUNT],
    ["a price in euro, after its number", "Suport 50 euro", STATES_AN_AMOUNT],
    ["a price with a symbol", "Suport €50", STATES_AN_AMOUNT],
    [
      "a price hidden by a zero-width space",
      `Suport 5${ZERO_WIDTH_SPACE}0 lei`,
      STATES_AN_AMOUNT,
    ],
    ["a percentage sign", "Suport 20%", STATES_AN_AMOUNT],
    ["a fullwidth percentage sign", "Suport 20％", STATES_AN_AMOUNT],
    ["the word for a percentage", "Suport procent", STATES_AN_AMOUNT],
    ["the word inclus", "Suport inclus", STATES_AN_AMOUNT],
    ["a percentage said in words", "Suport zece la suta", STATES_AN_AMOUNT],
  ])(
    "%s says the domain's sentence and sends nothing",
    async (_label, typed, sentence) => {
      const container = await mountForm();

      typeInField(container, NAME, typed);
      await press(buttonNamed(container, CREATE));

      expect(alertsIn(container)).toEqual([sentence]);
      expect(isCreateOff(container)).toBe(true);
      expect(mounted?.draftServer.calls).toEqual([]);
    },
  );
});

describe("a description the form refuses", () => {
  it.each([
    ["a direction override", `Din inox${BIDI_OVERRIDE}`, FORBIDDEN],
    [
      "one more than the book takes",
      "x".repeat(MAX_BOOK_DESCRIPTION_LENGTH + 1),
      TOO_LONG,
    ],
    ["a price in lei", "Doar 500 de lei", STATES_AN_AMOUNT],
    ["a percentage", "Reducere 10%", STATES_AN_AMOUNT],
  ])(
    "%s says the domain's sentence and sends nothing",
    async (_label, typed, sentence) => {
      const container = await mountForm();
      typeInField(container, NAME, GOOD_NAME);

      typeInField(container, DESCRIPTION, typed);
      await press(buttonNamed(container, CREATE));

      expect(alertsIn(container)).toEqual([sentence]);
      expect(isCreateOff(container)).toBe(true);
      expect(mounted?.draftServer.calls).toEqual([]);
    },
  );
});

describe("words a model or a size is named by", () => {
  it.each([
    ["a bare number", "Suport 60"],
    ["a model with a bare number", "Euro 450"],
    ["a word that holds a refused one", "Procentaj de lemn"],
    [
      "a name that ends in the greatest the book takes",
      "x".repeat(MAX_BOOK_NAME_LENGTH),
    ],
  ])("%s is sent as typed", async (_label, typed) => {
    const container = await mountForm();

    typeInField(container, NAME, `  ${typed}  `);
    expect(alertsIn(container)).toEqual([]);
    await press(buttonNamed(container, CREATE));

    const [call] = mounted?.draftServer.calls ?? [];
    expect(
      call?.kind === "createAccessory" ? call.request.value.name : undefined,
    ).toBe(typed);
  });

  it("sends a description of the greatest length the book takes", async () => {
    const container = await mountForm();
    const longest = "d".repeat(MAX_BOOK_DESCRIPTION_LENGTH);
    typeInField(container, NAME, GOOD_NAME);

    typeInField(container, DESCRIPTION, longest);
    await press(buttonNamed(container, CREATE));

    const [call] = mounted?.draftServer.calls ?? [];
    expect(
      call?.kind === "createAccessory"
        ? call.request.value.description
        : undefined,
    ).toBe(longest);
  });
});
