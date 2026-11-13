// @vitest-environment happy-dom
//
// Creating a linked accessory (frame D6B): Romanian name and description, the cabinet type it follows and a price per unit,
// each read before anything is sent; one write puts the accessory in "De publicat", inactive. The cabinet type is required
// and chosen from the rows the manufacturer supplies; there is no Russian field. A refusal, a failure and an answer that
// comes late each leave the form as it was, except that an accessory that was created is always told.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  linkTargetBuildIdsOf,
  MAX_BOOK_NAME_LENGTH,
  SAMPLE_PRICE_BOOK,
} from "@lemnaria/configurator-domain";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn, click, requireIn } from "../support/render-with-intl";
import {
  buttonNamed,
  fieldNamed,
  settle,
  typeInField,
} from "./cabinet-detail-harness";
import {
  accessoryPageOf,
  CREATED,
  LINKED_BUILD_ID,
  mountAccessoryCreate,
  type MountedAccessories,
} from "./accessory-harness";
import { press } from "./hardware-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const NAME = roCopy("priceDashboard.accessories.nameLabel");
const DESCRIPTION = roCopy("priceDashboard.accessories.descriptionLabel");
const LINK = roCopy("priceDashboard.accessories.linkLabel");
const PRICE = roCopy("priceDashboard.accessories.pricePerPiece");
const CREATE = roCopy("priceDashboard.accessories.createAction");
const SAVE_FAILED = roCopy("priceDashboard.errors.saveFailed");
const CREATE_REFUSED = roCopy("priceDashboard.accessories.createRefused");
const LINK_REFUSED = roCopy("priceDashboard.accessories.linkRefused");
const CHANGED_MEANWHILE = roCopy("priceDashboard.errors.changedMeanwhile");
const alertsIn = (container: HTMLElement) =>
  allIn(container, '[role="alert"]').map((alert) => alert.textContent);

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

function linkSelectIn(container: HTMLElement): HTMLSelectElement {
  return requireIn<HTMLSelectElement>(container, "select");
}

function choose(container: HTMLElement, buildId: string): void {
  const select = linkSelectIn(container);
  const valueProperty = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  );
  valueProperty?.set?.call(select, buildId);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillEverything(container: HTMLElement): void {
  typeInField(container, NAME, "  Suport pentru farfurii ");
  typeInField(container, DESCRIPTION, "Din inox");
  choose(container, LINKED_BUILD_ID);
  typeInField(container, PRICE, "80");
}

describe("the form", () => {
  it("opens inactive and empty, with a Romanian name and description, a cabinet type, a price and no Russian field, and Create off", async () => {
    const container = await mountForm();

    expect(
      allIn<HTMLInputElement>(container, "input").map((input) => input.value),
    ).toEqual(["", "", ""]);
    expect(
      allIn<HTMLLabelElement>(container, "label").map((label) =>
        label.textContent.trim(),
      ),
    ).toEqual([NAME, DESCRIPTION, LINK, PRICE]);
    expect(
      allIn(container, "input, select, textarea").map((field) =>
        field.getAttribute("name"),
      ),
    ).not.toContainEqual(expect.stringMatching(/ru|rus/iu));
    expect(
      allIn(container, '[data-testid="accessory-chip"]').map(
        (chip) => chip.textContent,
      ),
    ).toEqual([roCopy("priceDashboard.chips.inactive")]);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.accessories.activeHintNew"),
    );
    expect(container.textContent).toContain(
      roCopy("priceDashboard.common.createdTextNote"),
    );
    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", true);
    expect(alertsIn(container)).toEqual([]);
  });

  it("offers the cabinet types the manufacturer supplies and no customer-supplied row, and chooses none for the person", async () => {
    const container = await mountForm();
    const select = linkSelectIn(container);
    const offered = allIn<HTMLOptionElement>(select, "option").map(
      (option) => option.value,
    );
    const customerRows = SAMPLE_PRICE_BOOK.cabinetRules
      .filter((rule) => rule.suppliedBy === "customer")
      .map((rule) => rule.buildId);

    expect(select.value).toBe("");
    expect(offered).toEqual(["", ...linkTargetBuildIdsOf(SAMPLE_PRICE_BOOK)]);
    expect(customerRows.length).toBeGreaterThan(0);
    for (const row of customerRows) expect(offered).not.toContain(row);
    expect(allIn<HTMLOptionElement>(select, "option")[0]?.textContent).toBe(
      roCopy("priceDashboard.accessories.linkPlaceholder"),
    );
  });

  it("names each cabinet type by the cabinet list's own name for it", async () => {
    const container = await mountForm();
    const names = accessoryPageOf().cabinetNames;

    const options = allIn<HTMLOptionElement>(linkSelectIn(container), "option");

    for (const option of options.slice(1)) {
      expect(option.textContent).toBe(names[option.value]);
    }
  });

  it("keeps Create off until a cabinet type is chosen, however well the rest is filled, and sends nothing", async () => {
    const container = await mountForm();
    typeInField(container, NAME, "Suport pentru farfurii");
    typeInField(container, PRICE, "80");

    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", true);
    await press(buttonNamed(container, CREATE));

    expect(mounted?.draftServer.calls).toEqual([]);
    choose(container, LINKED_BUILD_ID);
    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", false);
  });

  it("says the cabinet type is required once it has been left empty after a choice, and not before", async () => {
    const container = await mountForm();
    expect(alertsIn(container)).toEqual([]);

    choose(container, LINKED_BUILD_ID);
    choose(container, "");

    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.accessories.linkRequired"),
    ]);
    expect(linkSelectIn(container).getAttribute("aria-invalid")).toBe("true");
  });

  it("scolds only what has been typed: a field left alone says nothing, one typed and emptied says it is empty", async () => {
    const container = await mountForm();

    typeInField(container, NAME, "x");
    typeInField(container, NAME, "");

    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.textEmpty"),
    ]);
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

  it("takes an empty description, which is left out of what is sent", async () => {
    const container = await mountForm();
    typeInField(container, NAME, "Suport pentru farfurii");
    choose(container, LINKED_BUILD_ID);
    typeInField(container, PRICE, "80");

    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", false);
    await press(buttonNamed(container, CREATE));

    const [call] = mounted?.draftServer.calls ?? [];
    expect(call).toMatchObject({ kind: "createAccessory" });
    expect(
      call?.kind === "createAccessory" ? call.request.value : undefined,
    ).not.toHaveProperty("description");
  });

  it("refuses a price that is not whole tens of lei, is empty or is not a number, and takes zero, which the book allows", async () => {
    const container = await mountForm();
    typeInField(container, NAME, "Suport pentru farfurii");
    choose(container, LINKED_BUILD_ID);

    typeInField(container, PRICE, "12,50");
    expect(fieldNamed(container, PRICE).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", true);
    typeInField(container, PRICE, "");
    expect(fieldNamed(container, PRICE).getAttribute("aria-invalid")).toBe(
      "true",
    );
    typeInField(container, PRICE, "abc");
    expect(alertsIn(container)).toContain(
      roCopy("priceDashboard.errors.notNumber", { example: "450,00" }),
    );
    typeInField(container, PRICE, "0");

    expect(
      fieldNamed(container, PRICE).getAttribute("aria-invalid"),
    ).toBeNull();
    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", false);
  });
});

describe("the reason Create is off for want of a cabinet type", () => {
  const NEEDS_LINK = roCopy("priceDashboard.accessories.createNeedsLink");

  it("is said in words once the name and the price are valid and no cabinet type is chosen, and the button points to it", async () => {
    const container = await mountForm();
    typeInField(container, NAME, "Suport pentru farfurii");
    typeInField(container, PRICE, "80");

    expect(container.textContent).toContain(NEEDS_LINK);
    const create = buttonNamed(container, CREATE);
    expect(create).toHaveProperty("disabled", true);
    const reason = container.querySelector(
      `[id="${create.getAttribute("aria-describedby") ?? ""}"]`,
    );
    expect(reason?.textContent).toBe(NEEDS_LINK);
  });

  it("is not said while something else is missing, and goes once the cabinet type is chosen", async () => {
    const container = await mountForm();
    expect(container.textContent).not.toContain(NEEDS_LINK);
    typeInField(container, NAME, "Suport pentru farfurii");
    expect(container.textContent).not.toContain(NEEDS_LINK);
    typeInField(container, PRICE, "80");
    expect(container.textContent).toContain(NEEDS_LINK);

    choose(container, LINKED_BUILD_ID);

    expect(container.textContent).not.toContain(NEEDS_LINK);
    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", false);
  });
});

describe("creating", () => {
  it("sends one write with the trimmed words, the cabinet type and the price in bani, and nothing else", async () => {
    const container = await mountForm();
    fillEverything(container);

    await press(buttonNamed(container, CREATE));

    expect(mounted?.draftServer.calls).toEqual([
      {
        kind: "createAccessory",
        request: {
          expectedDraftRevision: "1",
          value: {
            linkedBuildId: LINKED_BUILD_ID,
            perUnitMinor: 8_000,
            name: "Suport pentru farfurii",
            description: "Din inox",
          },
        },
      },
    ]);
    expect(
      mounted?.draftServer
        .state()
        .draft.changes.map((change) => change.address.kind),
    ).toEqual(["accessory-created"]);
  });

  it("heads the page with the accessory's name once it is created, in place of the title of a new accessory", async () => {
    const container = await mountForm();
    expect(requireIn(container, "h1").textContent).toBe(
      roCopy("priceDashboard.accessories.newTitle"),
    );
    fillEverything(container);

    await press(buttonNamed(container, CREATE));

    expect(requireIn(container, "h1").textContent).toBe(
      "Suport pentru farfurii",
    );
  });

  it("says the accessory is in De publicat, inactive, links to its own page and the list, and moves focus to that notice", async () => {
    const container = await mountForm();
    fillEverything(container);

    await press(buttonNamed(container, CREATE));

    expect(container.textContent).toContain(
      roCopy("priceDashboard.accessories.createdNotice"),
    );
    expect(
      allIn<HTMLAnchorElement>(container, "a").map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(
      expect.arrayContaining([
        "/ro/staff/catalog/accessories",
        `/ro/staff/catalog/accessories/${CREATED}`,
      ]),
    );
    expect(document.activeElement?.textContent).toContain(
      roCopy("priceDashboard.accessories.createdNotice"),
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
      "a refusal of the link as an unknown cabinet type",
      { kind: "refused", code: "LINK_TARGET_UNKNOWN" } as const,
      LINK_REFUSED,
    ],
    [
      "a refusal of the link as a customer-supplied row",
      { kind: "refused", code: "LINK_TARGET_CUSTOMER_SUPPLIED" } as const,
      LINK_REFUSED,
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
        roCopy("priceDashboard.accessories.createdNotice"),
      );
      expect(fieldNamed(container, NAME).value).toBe(
        "  Suport pentru farfurii ",
      );
      expect(linkSelectIn(container).value).toBe(LINKED_BUILD_ID);
      expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", false);
    },
  );

  it("offers no creation where no route takes one: Create is off with the reason that nothing can be checked, and nothing is sent", async () => {
    const page = accessoryPageOf();
    const withoutCreation = {
      ...inMemoryPriceDraftClient(page.state).client,
      createAccessory: undefined,
    };
    mounted = await mountAccessoryCreate(page, {
      draftClient: withoutCreation,
    });
    const container = mounted.container;
    fillEverything(container);

    await press(buttonNamed(container, CREATE));

    expect(buttonNamed(container, CREATE)).toHaveProperty("disabled", true);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.lifecycle.cannotJudge"),
    );
    expect(alertsIn(container)).toEqual([]);
    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.accessories.createdNotice"),
    );
    expect(mounted.draftServer.calls).toEqual([]);
  });
});

describe("a creation judged as the route judges it", () => {
  it("is refused without a link: the request names none and the answer is a missing value", async () => {
    const server = inMemoryPriceDraftClient(accessoryPageOf().state);

    const outcome = await server.client.createAccessory?.({
      expectedDraftRevision: "1",
      value: { perUnitMinor: 8_000, name: "Suport" } as never,
    });

    expect(outcome).toEqual({ kind: "refused", code: "MISSING_VALUE" });
    expect(server.state().draft.changes).toEqual([]);
  });

  it("is refused for a cabinet type the customer supplies, with the link's own code", async () => {
    const server = inMemoryPriceDraftClient(accessoryPageOf().state);
    const customerRow = SAMPLE_PRICE_BOOK.cabinetRules.find(
      (rule) => rule.suppliedBy === "customer",
    );

    const outcome = await server.client.createAccessory?.({
      expectedDraftRevision: "1",
      value: {
        linkedBuildId: customerRow?.buildId ?? "",
        perUnitMinor: 8_000,
        name: "Suport",
      },
    });

    expect(outcome).toEqual({
      kind: "refused",
      code: "LINK_TARGET_CUSTOMER_SUPPLIED",
    });
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

  it("still tells an accessory that was created, whatever has been typed since, because it is in the draft", async () => {
    const container = await mountForm();
    fillEverything(container);
    const release = mounted?.draftServer.holdNextWrite();
    click(buttonNamed(container, CREATE));
    typeInField(container, NAME, "Another name");

    release?.();
    await settle();

    expect(container.textContent).toContain(
      roCopy("priceDashboard.accessories.createdNotice"),
    );
  });
});
