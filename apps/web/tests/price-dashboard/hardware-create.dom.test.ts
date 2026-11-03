// @vitest-environment happy-dom
//
// Creating a class of hardware (frame D4C): Romanian name and description and a price for each mechanism, each read before
// anything is sent; one write puts the class and its rates in "De publicat", inactive; a refusal, a failure and an answer
// that comes late each leave the form as it was, except that a class that was created is always told.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  MAX_BOOK_NAME_LENGTH,
} from "@lemnaria/configurator-domain";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn, click } from "../support/render-with-intl";
import {
  buttonNamed,
  fieldNamed,
  settle,
  typeInField,
} from "./cabinet-detail-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import {
  hardwarePageOf,
  mountHardwareCreate,
  press,
  type MountedHardware,
} from "./hardware-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const NAME = roCopy("priceDashboard.hardware.nameLabel");
const DESCRIPTION = roCopy("priceDashboard.hardware.descriptionLabel");
const HINGE = roCopy("priceDashboard.hardware.priceHinge");
const SLIDE = roCopy("priceDashboard.hardware.priceSlide");
const PUSH = roCopy("priceDashboard.hardware.pricePush");
const LIFT = roCopy("priceDashboard.hardware.priceLift");
const PUSH_RUNNER = roCopy("priceDashboard.hardware.pricePushRunner");
const CREATE = roCopy("priceDashboard.hardware.createAction");
const SAVE_FAILED = roCopy("priceDashboard.errors.saveFailed");
const CREATE_REFUSED = roCopy("priceDashboard.hardware.createRefused");
const CHANGED_MEANWHILE = roCopy("priceDashboard.errors.changedMeanwhile");
const alertsIn = (container: HTMLElement) =>
  allIn(container, '[role="alert"]').map((alert) => alert.textContent);

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

async function mountForm(): Promise<HTMLElement> {
  mounted = await mountHardwareCreate(hardwarePageOf());
  return mounted.container;
}

function fillEverything(container: HTMLElement): void {
  typeInField(container, NAME, "  GTV Economic ");
  typeInField(container, DESCRIPTION, "Pentru oferte economice");
  typeInField(container, HINGE, "50");
  typeInField(container, SLIDE, "300");
  typeInField(container, PUSH, "100");
  typeInField(container, LIFT, "0");
  typeInField(container, PUSH_RUNNER, "700");
}

describe("the form", () => {
  it("opens inactive and empty, with a Romanian name and description and a price per mechanism and no Russian field, and Create off", async () => {
    const container = await mountForm();

    expect(
      allIn<HTMLInputElement>(container, "input").map((input) => input.value),
    ).toEqual(["", "", "", "", "", "", ""]);
    expect(
      allIn<HTMLLabelElement>(container, "label").map((label) =>
        label.textContent.trim(),
      ),
    ).toEqual([NAME, DESCRIPTION, HINGE, SLIDE, PUSH, LIFT, PUSH_RUNNER]);
    expect(
      allIn(container, '[data-testid="hardware-chip"]').map(
        (chip) => chip.textContent,
      ),
    ).toEqual([roCopy("priceDashboard.chips.inactive")]);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.hardware.newPricesNote"),
    );
    expect(container.textContent).toContain(
      roCopy("priceDashboard.hardware.activeHintNew"),
    );
    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", true);
    expect(alertsIn(container)).toEqual([]);
  });

  it("scolds only what has been typed: a field left alone says nothing, one typed and emptied says it is empty", async () => {
    const container = await mountForm();

    typeInField(container, NAME, "x");
    typeInField(container, NAME, "");

    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.textEmpty"),
    ]);
    expect(
      fieldNamed(container, DESCRIPTION).getAttribute("aria-invalid"),
    ).toBeNull();
  });

  it("refuses a description that states an amount, and a name too long, as the domain judges them", async () => {
    const container = await mountForm();

    typeInField(container, DESCRIPTION, "Doar 500 lei");
    typeInField(container, NAME, "x".repeat(MAX_BOOK_NAME_LENGTH + 1));

    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.textTooLong"),
      roCopy("priceDashboard.errors.textStatesAnAmount"),
    ]);
    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", true);
  });

  it("refuses a name with a control character", async () => {
    const container = await mountForm();

    typeInField(container, NAME, "Bad\u0007name");

    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.textForbiddenCharacter"),
    ]);
  });

  it("refuses a price that is not whole tens of lei or is empty, and accepts zero for a mechanism the class lacks", async () => {
    const container = await mountForm();

    typeInField(container, HINGE, "12,50");
    typeInField(container, LIFT, "0");
    typeInField(container, SLIDE, "5");
    typeInField(container, SLIDE, "");

    expect(fieldNamed(container, HINGE).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(fieldNamed(container, SLIDE).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(fieldNamed(container, LIFT).getAttribute("aria-invalid")).toBeNull();
    expect(fieldNamed(container, PUSH).getAttribute("aria-invalid")).toBeNull();
  });
});

describe("creating", () => {
  it("sends one write with the trimmed words and every price in bani, zero included, and nothing else", async () => {
    const container = await mountForm();
    fillEverything(container);
    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", false);

    await press(buttonNamed(container, CREATE));

    expect(mounted?.draftServer.calls).toEqual([
      {
        kind: "createHardwareClass",
        request: {
          expectedDraftRevision: "1",
          value: {
            name: "GTV Economic",
            description: "Pentru oferte economice",
          },
          rates: {
            perHingeMinor: 5_000,
            perDrawerMinor: 30_000,
            perPushToOpenMinor: 10_000,
            perLiftMinor: 0,
            perPushRunnerMinor: 70_000,
          },
        },
      },
    ]);
    expect(
      mounted?.draftServer
        .state()
        .draft.changes.map((change) => change.address.kind),
    ).toEqual([
      "hardware-tier-created",
      ...HARDWARE_RATE_FIELDS.map(() => "hardware"),
    ]);
  });

  it("says the class is in De publicat, inactive, links to its own page and the list, and moves focus to that notice", async () => {
    const container = await mountForm();
    fillEverything(container);

    await press(buttonNamed(container, CREATE));

    expect(container.textContent).toContain(
      roCopy("priceDashboard.hardware.createdNotice"),
    );
    expect(
      allIn<HTMLAnchorElement>(container, "a").map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(
      expect.arrayContaining([
        "/ro/staff/catalog/hardware",
        "/ro/staff/catalog/hardware/hardware.created-1",
      ]),
    );
    expect(document.activeElement?.textContent).toContain(
      roCopy("priceDashboard.hardware.createdNotice"),
    );
    expect(() => buttonNamed(container, CREATE)).toThrow();
  });

  it.each([
    [
      "a refusal of the words",
      { kind: "refused", code: "TEXT_STATES_AN_AMOUNT" } as const,
      roCopy("priceDashboard.errors.textStatesAnAmount"),
    ],
    [
      "a refusal of an amount",
      { kind: "refused", code: "TOO_LARGE" } as const,
      roCopy("priceDashboard.errors.tooBig"),
    ],
    [
      "a refusal no field explains",
      { kind: "refused", code: "UNKNOWN_ITEM" } as const,
      CREATE_REFUSED,
    ],
    [
      "a candidate the book would refuse",
      { kind: "candidate-refused" } as const,
      CREATE_REFUSED,
    ],
    ["a failure", { kind: "failed" } as const, SAVE_FAILED],
    ["a conflict", { kind: "conflict" } as const, CHANGED_MEANWHILE],
  ])(
    "keeps the form and its values and says so on %s",
    async (_name, answer, words) => {
      const container = await mountForm();
      fillEverything(container);
      mounted?.draftServer.answerNextWriteWith(answer);

      await press(buttonNamed(container, CREATE));

      expect(alertsIn(container)).toEqual([words]);
      expect(container.textContent).not.toContain(
        roCopy("priceDashboard.hardware.createdNotice"),
      );
      expect(fieldNamed(container, NAME).value).toBe("  GTV Economic ");
      expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", false);
    },
  );

  it("offers no creation where no route takes one: Create is off with the reason that nothing can be checked, and nothing is sent", async () => {
    const page = hardwarePageOf();
    const withoutCreation = {
      ...inMemoryPriceDraftClient(page.state).client,
      createHardwareClass: undefined,
    };
    mounted = await mountHardwareCreate(page, { draftClient: withoutCreation });
    const container = mounted.container;
    fillEverything(container);

    await press(buttonNamed(container, CREATE));

    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", true);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.lifecycle.cannotJudge"),
    );
    expect(alertsIn(container)).toEqual([]);
    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.hardware.createdNotice"),
    );
    expect(mounted.draftServer.calls).toEqual([]);
  });
});

describe("an answer that comes late", () => {
  it("is dropped when it is a refusal of values the person has typed over", async () => {
    const container = await mountForm();
    fillEverything(container);
    mounted?.draftServer.answerNextWriteWith({ kind: "failed" });
    const release = mounted?.draftServer.holdNextWrite();
    click(buttonNamed(container, CREATE));
    typeInField(container, NAME, "Another name");

    release?.();
    await settle();

    expect(alertsIn(container)).toEqual([]);
    expect(fieldNamed(container, NAME).value).toBe("Another name");
  });

  it("still tells a class that was created, whatever has been typed since, because it is in the draft", async () => {
    const container = await mountForm();
    fillEverything(container);
    const release = mounted?.draftServer.holdNextWrite();
    click(buttonNamed(container, CREATE));
    typeInField(container, NAME, "Another name");

    release?.();
    await settle();

    expect(container.textContent).toContain(
      roCopy("priceDashboard.hardware.createdNotice"),
    );
    expect(mounted?.draftServer.state().draft.changes).toHaveLength(
      1 + HARDWARE_RATE_FIELDS.length,
    );
  });

  it("sends once when Create is pressed twice while the first is out", async () => {
    const container = await mountForm();
    fillEverything(container);
    const release = mounted?.draftServer.holdNextWrite();
    const create = buttonNamed(container, CREATE);

    click(create);
    click(create);
    release?.();
    await settle();

    expect(mounted?.draftServer.calls).toHaveLength(1);
  });
});
