// @vitest-environment happy-dom
//
// The cabinet list with its writes (frames D2C, D2D, D2E1 to D2E3, D2ER): a price changes in the table, the depth
// rule on its card, and several prices at once from the bulk dialog. Every write goes to the draft and never to the live
// prices; an invalid value is never sent; a refusal stays in the field it belongs to, tied to it, and is told in words the
// value does not decide. The server is a draft client that judges as the dashboard's routes do.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deriveCabinetList } from "@/price-dashboard/cabinet-list-facts";
import { previewBulk } from "@/price-dashboard/bulk-preview";
import { formatLei, formatLeiAmount } from "@/price-dashboard/format-lei";
import { CabinetListEditor } from "@/price-dashboard/cabinet-list-editor";
import type { CabinetListPageInput } from "@/price-dashboard/cabinet-list-facts";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  typeInto,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import {
  BASE_CABINET_RULE,
  cabinetNamesOf,
  pageOf,
  stateOf,
} from "./dashboard-state-fixture";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const COPY = roMessages.priceDashboard;
const RU_COPY = ruMessages.priceDashboard;
const NBSP = "\u00a0";
const ACTIVE_DEPTH_PERCENT = readableDepthPercent();
/** The sentence for a percentage past the action's bounds, which no other cause of a refusal may be worded as. */
const OUT_OF_RANGE_SENTENCE = roCopy("priceDashboard.bulk.errors.outOfRange", {
  lowest: roCopy("priceDashboard.common.percent", { percent: "-90" }),
  highest: roCopy("priceDashboard.common.percent", { percent: "300" }),
});

let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

function readableDepthPercent(): number {
  return pageOf().state.active.book.depthRule.deepCabinetPercent;
}

interface Mounted {
  readonly container: HTMLElement;
  readonly server: ReturnType<typeof inMemoryPriceDraftClient>;
}

async function mount(
  page: CabinetListPageInput = pageOf(),
  locale: TestLocale = "ro",
): Promise<Mounted> {
  const server = inMemoryPriceDraftClient(page.state);
  screen = mountInCatalogue(
    createElement(CabinetListEditor, {
      locale,
      context: contextOf("administrator", ["kitchens", "cabinets", "publish"]),
      page,
      client: server.client,
    }),
    locale,
  );
  await flushPromises(5);
  return { container: screen.container, server };
}

const names = cabinetNamesOf(pageOf().state.active.book);
const nameOf = (ruleId: string): string =>
  names[ruleId.replace("cabinet.", "")] ?? ruleId;

function rowOf(container: HTMLElement, ruleId: string): HTMLElement {
  const found = allIn(container, '[data-testid="cabinet-row"]').find(
    (row) => row.dataset.ruleId === ruleId,
  );
  if (found === undefined) throw new Error(`no row for ${ruleId}`);
  return found;
}

const priceButtonOf = (row: HTMLElement, ruleId: string): HTMLButtonElement =>
  requireIn<HTMLButtonElement>(
    row,
    `button[aria-label="${roCopy("priceDashboard.cabinets.editPriceAria", { name: nameOf(ruleId) })}"]`,
  );

function openPriceField(
  container: HTMLElement,
  ruleId: string,
): HTMLInputElement {
  click(priceButtonOf(rowOf(container, ruleId), ruleId));
  return requireIn<HTMLInputElement>(rowOf(container, ruleId), "input");
}

async function press(
  input: HTMLElement,
  key: "Enter" | "Escape",
): Promise<void> {
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
  await flushPromises(5);
}

/** The one element of a list found by a test, or a failure naming what was looked for. */
function found<Item>(item: Item | undefined, what: string): Item {
  if (item === undefined) throw new Error(`nothing is ${what}`);
  return item;
}

const alertOf = (scope: ParentNode): HTMLElement | null =>
  scope.querySelector('[role="alert"]');

/** The sentence a field's `aria-describedby` reaches that is the field's refusal. */
function refusalOf(input: HTMLElement): string | undefined {
  const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
  const refusal = ids
    .map((id) => document.getElementById(id))
    .find((element) => element?.getAttribute("role") === "alert");
  return refusal?.textContent;
}

/** The amount a row is quoted at in the active version, as the row writes it beside a pending one. */
function activeAmountOf(ruleId: string): string {
  const derived = deriveCabinetList(pageOf());
  const price =
    derived.kind === "ready"
      ? derived.input.rules.find((row) => row.ruleId === ruleId)?.price
      : undefined;
  if (price === undefined) throw new Error(`no price for ${ruleId}`);
  return formatLeiAmount(price.activeMinor);
}

/** What the preview says for a percentage over one group, worked out by the plan the dialog is unit-tested against. */
function expectedPreviewOf({
  groupCode,
  percent,
}: {
  readonly groupCode: "base";
  readonly percent: number;
}): string {
  const derived = deriveCabinetList(pageOf());
  if (derived.kind !== "ready") throw new Error("unreadable");
  const preview = previewBulk({
    candidate: derived.candidate,
    rows: derived.input.rules,
    target: { scope: "group", groupCode },
    percent,
  });
  if (preview.kind !== "ready") throw new Error("no preview");
  const { example } = preview;
  const currency = COPY.units.currency;
  return roCopy("priceDashboard.bulk.preview", {
    cabinetCount: preview.cabinetCount,
    priceCount: preview.priceCount,
    example: roCopy("priceDashboard.bulk.previewExample", {
      name: example.name,
      widthMm: example.widthMm,
      before: formatLei(example.beforeMinor, currency),
      after: formatLei(example.afterMinor, currency),
    }),
  });
}

const pendingChip = (container: HTMLElement): string =>
  requireIn(container, '[data-testid="staff-pending-prices"]').textContent;

describe("the price at the default size, in the table (frame D2C)", () => {
  it("opens as a button on every cabinet the manufacturer supplies, and on none the customer does", async () => {
    const { container } = await mount();
    const derived = deriveCabinetList(pageOf());
    if (derived.kind !== "ready") throw new Error("unreadable");

    for (const row of derived.input.rules) {
      const hasButton =
        rowOf(container, row.ruleId).querySelector("button") !== null;
      expect(hasButton, row.ruleId).toBe(!row.isCustomerSupplied);
    }
    expect(derived.input.rules.some((row) => row.isCustomerSupplied)).toBe(
      true,
    );
  });

  it("opens a field labelled with the width, in lei, holding the anchor, with focus in it and the keys told", async () => {
    const { container } = await mount();

    const input = openPriceField(container, BASE_CABINET_RULE);

    const row = rowOf(container, BASE_CABINET_RULE);
    const anchor = pageOf().state.active.book.cabinetRules[0];
    expect(row.querySelector("label")?.textContent).toBe(
      roCopy("priceDashboard.cabinets.editPriceLabel", { widthMm: 600 }),
    );
    expect(row.textContent).toContain(COPY.units.currency);
    expect(row.textContent).toContain(COPY.cabinets.editHint);
    expect(input.value).toBe(
      String((anchor?.formula as { anchorMinor: number }).anchorMinor / 100),
    );
    expect(document.activeElement).toBe(input);
  });

  it("sends the value on Enter to the draft, once, as the anchor's change against the revision the page read", async () => {
    const { container, server } = await mount();
    const input = openPriceField(container, BASE_CABINET_RULE);

    typeInto(input, "4 500");
    await press(input, "Enter");

    expect(server.calls).toEqual([
      {
        kind: "change",
        request: {
          expectedDraftRevision: "1",
          change: {
            address: {
              kind: "cabinet",
              ruleId: BASE_CABINET_RULE,
              field: "anchorMinor",
            },
            value: 450_000,
          },
        },
      },
    ]);
  });

  it.each([
    ["10", 1_000],
    ["100", 10_000],
  ])(
    "sends %j lei as %i bani: a whole ten of lei is accepted",
    async (typed, minor) => {
      const { container, server } = await mount();
      const input = openPriceField(container, BASE_CABINET_RULE);

      typeInto(input, typed);
      await press(input, "Enter");

      expect(server.calls.map((call) => call.kind)).toEqual(["change"]);
      expect(server.calls[0]).toMatchObject({
        request: { change: { value: minor } },
      });
      expect(input.isConnected).toBe(false);
    },
  );

  it("shows the saved price as pending with the active one beside it, never as live, and counts it in the frame", async () => {
    const { container, server } = await mount();
    const input = openPriceField(container, BASE_CABINET_RULE);

    typeInto(input, "5000");
    await press(input, "Enter");

    const row = rowOf(container, BASE_CABINET_RULE);
    expect(row.getAttribute("data-modified")).toBe("true");
    expect(row.textContent).toContain(COPY.chips.modified);
    expect(row.textContent).toContain(`5${NBSP}000${NBSP}lei`);
    expect(row.textContent).toContain(
      roCopy("priceDashboard.common.activeShort", {
        amount: activeAmountOf(BASE_CABINET_RULE),
      }),
    );
    expect(row.querySelector("input")).toBeNull();
    expect(pendingChip(container)).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
    );
    expect(server.state().active).toEqual(pageOf().state.active);
  });

  it("closes on Enter with focus back on the price, which now says the new amount", async () => {
    const { container } = await mount();
    const input = openPriceField(container, BASE_CABINET_RULE);

    typeInto(input, "5000");
    await press(input, "Enter");

    expect(document.activeElement).toBe(
      priceButtonOf(rowOf(container, BASE_CABINET_RULE), BASE_CABINET_RULE),
    );
  });

  it("cancels on Escape: nothing is sent, the price is as it was and focus is back on it", async () => {
    const { container, server } = await mount();
    const input = openPriceField(container, BASE_CABINET_RULE);
    const before = rowOf(container, BASE_CABINET_RULE).textContent;

    typeInto(input, "9999");
    await press(input, "Escape");

    expect(server.calls).toEqual([]);
    const row = rowOf(container, BASE_CABINET_RULE);
    expect(row.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(priceButtonOf(row, BASE_CABINET_RULE));
    expect(row.textContent).toContain(before.slice(0, 12));
  });

  it("sends nothing when the value is the one already pending, and closes", async () => {
    const { container, server } = await mount();
    const input = openPriceField(container, BASE_CABINET_RULE);

    await press(input, "Enter");

    expect(server.calls).toEqual([]);
    expect(
      rowOf(container, BASE_CABINET_RULE).querySelector("input"),
    ).toBeNull();
  });

  it("takes the change out of the draft when the value typed is the active one again", async () => {
    const { container, server } = await mount();
    const active = rowOf(container, BASE_CABINET_RULE).querySelector("input");
    expect(active).toBeNull();
    const first = openPriceField(container, BASE_CABINET_RULE);
    const original = first.value;
    typeInto(first, "5000");
    await press(first, "Enter");

    const second = openPriceField(container, BASE_CABINET_RULE);
    typeInto(second, original);
    await press(second, "Enter");

    expect(server.calls.map(({ kind }) => kind)).toEqual(["change", "revert"]);
    expect(server.state().draft.changes).toEqual([]);
    expect(
      rowOf(container, BASE_CABINET_RULE).getAttribute("data-modified"),
    ).toBe("false");
  });

  describe.each([
    ["", roCopy("priceDashboard.errors.empty")],
    ["21oo", roCopy("priceDashboard.errors.notNumber", { example: "450,00" })],
    ["-5", COPY.errors.negative],
    [
      "450,255",
      roCopy("priceDashboard.errors.tooManyDecimals", { example: "450,25" }),
    ],
    ["9".repeat(30), COPY.errors.tooBig],
    [
      "15",
      roCopy("priceDashboard.errors.notMultipleOfTen", {
        step: "10",
        example: "450",
      }),
    ],
    [
      "100.50",
      roCopy("priceDashboard.errors.notMultipleOfTen", {
        step: "10",
        example: "450",
      }),
    ],
    [
      "4 505",
      roCopy("priceDashboard.errors.notMultipleOfTen", {
        step: "10",
        example: "450",
      }),
    ],
  ])("a value typed as %j", (typed, sentence) => {
    it("is never sent: the field keeps it, is invalid, and names the reason in an alert it is tied to", async () => {
      const { container, server } = await mount();
      const input = openPriceField(container, BASE_CABINET_RULE);

      typeInto(input, typed);
      await press(input, "Enter");

      expect(server.calls).toEqual([]);
      expect(input.isConnected).toBe(true);
      expect(input.value).toBe(typed);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(refusalOf(input)).toBe(sentence);
      expect(alertOf(rowOf(container, BASE_CABINET_RULE))?.textContent).toBe(
        sentence,
      );
    });
  });

  it("clears the refusal when the value is corrected, and then Enter sends it", async () => {
    const { container, server } = await mount();
    const input = openPriceField(container, BASE_CABINET_RULE);
    typeInto(input, "21oo");
    await press(input, "Enter");

    typeInto(input, "2100");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(alertOf(rowOf(container, BASE_CABINET_RULE))).toBeNull();
    await press(input, "Enter");

    expect(server.calls).toHaveLength(1);
  });

  it("keeps a value the server refused in the field, with the server's reason in the same place", async () => {
    const { container, server } = await mount();
    const input = openPriceField(container, BASE_CABINET_RULE);
    server.answerNextWriteWith({ kind: "refused", code: "TOO_LARGE" });

    typeInto(input, "5000");
    await press(input, "Enter");

    expect(input.isConnected).toBe(true);
    expect(input.value).toBe("5000");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(refusalOf(input)).toBe(COPY.errors.tooBig);
    expect(server.state().draft.changes).toEqual([]);
  });

  it("says another writer got there first, reads the draft again, and keeps what was typed", async () => {
    const { container, server } = await mount();
    const input = openPriceField(container, BASE_CABINET_RULE);
    server.moveDraftBehindTheScreen();

    typeInto(input, "5000");
    await press(input, "Enter");

    expect(refusalOf(input)).toBe(COPY.errors.changedMeanwhile);
    expect(input.value).toBe("5000");
    await press(input, "Enter");
    expect(server.calls.filter(({ kind }) => kind === "change")).toHaveLength(
      2,
    );
    expect(server.state().draft.changes).toHaveLength(1);
  });

  it("says a write that failed did not save, and keeps the field", async () => {
    const { container, server } = await mount();
    const input = openPriceField(container, BASE_CABINET_RULE);
    server.answerNextWriteWith({ kind: "failed" });

    typeInto(input, "5000");
    await press(input, "Enter");

    expect(refusalOf(input)).toBe(COPY.errors.saveFailed);
  });
});

describe("the depth rule's card (frames D2E1 to D2E3, D2ER)", () => {
  const field = (container: HTMLElement): HTMLInputElement =>
    requireIn<HTMLInputElement>(
      requireIn(container, '[data-testid="depth-rule-card"]'),
      "input",
    );
  const buttonIn = (
    container: HTMLElement,
    label: string,
  ): HTMLButtonElement | undefined =>
    allIn<HTMLButtonElement>(
      requireIn(container, '[data-testid="depth-rule-card"]'),
      "button",
    ).find((button) => button.textContent === label);

  const requiredButtonIn = (
    container: HTMLElement,
    label: string,
  ): HTMLButtonElement =>
    found(buttonIn(container, label), `the ${label} button`);

  it("shows the rule with the active percentage in a labelled field in per cent, and the hint with the rounding", async () => {
    const { container } = await mount();
    const card = requireIn(container, '[data-testid="depth-rule-card"]');

    expect(card.textContent).toContain(COPY.rule.title);
    expect(card.textContent).toContain(COPY.rule.subtitle);
    expect(card.textContent).toContain(
      roCopy("priceDashboard.rule.deepKitchenLabel", { depthMm: 700 }),
    );
    expect(card.textContent).toContain(
      roCopy("priceDashboard.rule.activeValue", {
        percent: String(ACTIVE_DEPTH_PERCENT),
      }),
    );
    expect(field(container).value).toBe(String(ACTIVE_DEPTH_PERCENT));
    expect(buttonIn(container, COPY.common.save)).toBeUndefined();
  });

  it("offers Save and Cancel once the value is changed, and sends the rule's change on Save (D2E1)", async () => {
    const { container, server } = await mount();

    typeInto(field(container), "18");
    click(requiredButtonIn(container, COPY.common.save));
    await flushPromises(5);

    expect(server.calls).toEqual([
      {
        kind: "change",
        request: {
          expectedDraftRevision: "1",
          change: { address: { kind: "depth-rule" }, value: 18 },
        },
      },
    ]);
  });

  it("marks the card pending and counts it in the frame once saved (D2E2)", async () => {
    const { container } = await mount();

    typeInto(field(container), "18");
    click(requiredButtonIn(container, COPY.common.save));
    await flushPromises(5);

    const card = requireIn(container, '[data-testid="depth-rule-card"]');
    expect(card.textContent).toContain(COPY.chips.pending);
    expect(card.textContent).toContain(COPY.rule.savedNotice);
    expect(requireIn(card, '[role="status"]').textContent).toBe(
      COPY.rule.savedNotice,
    );
    expect(pendingChip(container)).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
    );
    expect(buttonIn(container, COPY.common.save)).toBeUndefined();
  });

  describe.each([
    ["", COPY.errors.percentEmpty],
    ["abc", roCopy("priceDashboard.errors.percentNotWhole", { example: "15" })],
    ["-3", COPY.errors.percentNegative],
    ["120", roCopy("priceDashboard.errors.percentTooBig", { max: "100" })],
  ])("a percentage typed as %j (D2E3)", (typed, sentence) => {
    it("is invalid, named in an alert the field is described by, and Save is off and sends nothing", async () => {
      const { container, server } = await mount();

      typeInto(field(container), typed);

      const input = field(container);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(refusalOf(input)).toBe(sentence);
      const save = buttonIn(container, COPY.common.save);
      expect(save?.disabled).toBe(true);
      click(found(save, "the save button"));
      await flushPromises(5);
      expect(server.calls).toEqual([]);
    });
  });

  it("goes back to the percentage it had on Cancel, sending nothing", async () => {
    const { container, server } = await mount();
    typeInto(field(container), "18");

    click(requiredButtonIn(container, COPY.common.cancel));

    expect(field(container).value).toBe(String(ACTIVE_DEPTH_PERCENT));
    expect(server.calls).toEqual([]);
  });

  it("takes the change out of the draft when the active percentage is saved again", async () => {
    const { container, server } = await mount();
    typeInto(field(container), "18");
    click(requiredButtonIn(container, COPY.common.save));
    await flushPromises(5);

    typeInto(field(container), String(ACTIVE_DEPTH_PERCENT));
    click(requiredButtonIn(container, COPY.common.save));
    await flushPromises(5);

    expect(server.calls.map(({ kind }) => kind)).toEqual(["change", "revert"]);
    expect(server.state().draft.changes).toEqual([]);
  });

  it("keeps a percentage the server refused in the field with its reason", async () => {
    const { container, server } = await mount();
    server.answerNextWriteWith({ kind: "refused", code: "TOO_LARGE" });
    typeInto(field(container), "18");

    click(requiredButtonIn(container, COPY.common.save));
    await flushPromises(5);

    expect(field(container).value).toBe("18");
    expect(refusalOf(field(container))).toBe(
      roCopy("priceDashboard.errors.percentTooBig", { max: "100" }),
    );
  });

  it("reads in Russian with the rule saved (D2ER)", async () => {
    const draft = [{ address: { kind: "depth-rule" as const }, value: 18 }];
    const { container } = await mount({ ...pageOf(draft) }, "ru");

    const card = requireIn(container, '[data-testid="depth-rule-card"]');
    expect(card.textContent).toContain(RU_COPY.rule.title);
    expect(card.textContent).toContain(RU_COPY.chips.pending);
    expect(field(container).value).toBe("18");
  });
});

describe("the bulk dialog (frame D2D)", () => {
  const opener = (container: HTMLElement): HTMLButtonElement =>
    found(
      allIn<HTMLButtonElement>(container, "button").find(
        (button) => button.textContent === COPY.cabinets.bulkAction,
      ),
      "the bulk button",
    );
  const dialogOf = (): HTMLElement =>
    requireIn(document.body, '[role="dialog"]');
  const percentField = (): HTMLInputElement =>
    requireIn<HTMLInputElement>(dialogOf(), 'input[type="text"]');
  const confirmButton = (): HTMLButtonElement =>
    found(
      allIn<HTMLButtonElement>(dialogOf(), "button").find(
        (button) => button.textContent === COPY.common.addToPending,
      ),
      "the confirmation",
    );
  /** An unavailable confirmation stays reachable and says so (`aria-disabled`), and ignores a press. */
  const isOff = (button: HTMLButtonElement): boolean =>
    button.getAttribute("aria-disabled") === "true";
  const radio = (label: string): HTMLInputElement =>
    requireIn<HTMLInputElement>(
      found(
        allIn(dialogOf(), "label").find((l) => l.textContent === label),
        `the choice ${label}`,
      ),
      "input",
    );
  const open = async (container: HTMLElement) => {
    click(opener(container));
    await flushPromises(5);
  };
  const applyTyped = async (typed: string) => {
    typeInto(percentField(), typed);
    click(confirmButton());
    await flushPromises(5);
  };

  it("opens from the rule's card with the focus on the percentage field, Esc closes it, and focus goes back to what opened it", async () => {
    const { container, server } = await mount();

    await open(container);
    expect(requireIn(dialogOf(), "h2").textContent).toBe(COPY.bulk.title);
    expect(document.activeElement).toBe(percentField());
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await flushPromises(5);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(server.calls).toEqual([]);
    expect(document.activeElement).toBe(opener(container));
  });

  it("offers the scope as three choices, a group chosen first, and its groups to choose from", async () => {
    const { container } = await mount();
    await open(container);

    expect(radio(COPY.bulk.scopeGroup).checked).toBe(true);
    expect(radio(COPY.bulk.scopeAll).checked).toBe(false);
    const options = allIn(dialogOf(), "option").map(
      (option) => option.textContent,
    );
    expect(options).toEqual([
      COPY.cabinets.groupBase,
      COPY.cabinets.groupWall,
      COPY.cabinets.groupTall,
      COPY.cabinets.groupCorner,
    ]);
  });

  it("counts the cabinets and prices and shows one price before and after, before anything is sent", async () => {
    const { container, server } = await mount();
    await open(container);

    typeInto(percentField(), "+5");

    const preview = dialogOf().textContent;
    expect(preview).toContain(COPY.bulk.previewTitle);
    expect(preview).toContain(
      expectedPreviewOf({ groupCode: "base", percent: 5 }),
    );
    expect(isOff(confirmButton())).toBe(false);
    expect(server.calls).toEqual([]);
  });

  it("sends the scope and the percentage, then closes, and the changed cabinets are marked pending", async () => {
    const { container, server } = await mount();
    await open(container);

    await applyTyped("+5");

    expect(server.calls).toEqual([
      {
        kind: "bulk",
        request: {
          expectedDraftRevision: "1",
          target: { scope: "group", groupCode: "base" },
          percent: 5,
        },
      },
    ]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const modified = allIn(container, '[data-modified="true"]');
    expect(modified.length).toBeGreaterThan(0);
    expect(pendingChip(container)).toContain(
      roCopy("priceDashboard.nav.pendingChip", {
        count: server.state().draft.changes.length,
      }),
    );
  });

  it("can be asked of every cabinet", async () => {
    const { container, server } = await mount();
    await open(container);

    click(radio(COPY.bulk.scopeAll));
    await applyTyped("-3");

    expect(server.calls[0]).toMatchObject({
      kind: "bulk",
      request: { target: { scope: "all" }, percent: -3 },
    });
  });

  it("asks for the cabinets to be ticked when it is asked of the ones ticked, and sends the ones that are", async () => {
    const { container, server } = await mount();
    await open(container);
    click(radio(COPY.bulk.scopeSelected));
    typeInto(percentField(), "+5");

    expect(dialogOf().textContent).toContain(COPY.bulk.errors.noCabinets);
    expect(isOff(confirmButton())).toBe(true);

    const box = requireIn<HTMLInputElement>(
      dialogOf(),
      `input[type="checkbox"][aria-label="${roCopy("priceDashboard.cabinets.selectRowAria", { name: nameOf(BASE_CABINET_RULE) })}"]`,
    );
    click(box);
    await flushPromises(3);
    click(confirmButton());
    await flushPromises(5);

    expect(server.calls[0]).toMatchObject({
      kind: "bulk",
      request: {
        target: { scope: "selection", ruleIds: [BASE_CABINET_RULE] },
        percent: 5,
      },
    });
  });

  it("lists no cabinet the customer supplies among the ones to tick", async () => {
    const { container } = await mount();
    await open(container);
    click(radio(COPY.bulk.scopeSelected));

    const derived = deriveCabinetList(pageOf());
    if (derived.kind !== "ready") throw new Error("unreadable");
    const supplied = derived.input.rules.filter(
      (row) => !row.isCustomerSupplied,
    );
    expect(allIn(dialogOf(), 'input[type="checkbox"]')).toHaveLength(
      supplied.length,
    );
  });

  describe.each([
    ["", roCopy("priceDashboard.bulk.errors.empty", { example: "5" })],
    ["abc", roCopy("priceDashboard.errors.percentNotWhole", { example: "5" })],
    ["0", COPY.bulk.errors.zero],
    ["301", OUT_OF_RANGE_SENTENCE],
  ])("a percentage typed as %j", (typed, sentence) => {
    it("is never sent: the field is invalid and says why, and the action is off", async () => {
      const { container, server } = await mount();
      await open(container);

      typeInto(percentField(), "1");
      typeInto(percentField(), typed);

      expect(percentField().getAttribute("aria-invalid")).toBe("true");
      expect(refusalOf(percentField())).toBe(sentence);
      expect(isOff(confirmButton())).toBe(true);
      click(confirmButton());
      await flushPromises(5);
      expect(server.calls).toEqual([]);
    });
  });

  it("says nothing would change, and not that the percentage is out of range, when every price rounds back to what it is", async () => {
    const tiny = [
      {
        address: {
          kind: "cabinet",
          ruleId: BASE_CABINET_RULE,
          field: "anchorMinor",
        },
        value: 2_000,
      },
      {
        address: {
          kind: "cabinet",
          ruleId: BASE_CABINET_RULE,
          field: "perStepWiderMinor",
        },
        value: 0,
      },
      {
        address: {
          kind: "cabinet",
          ruleId: BASE_CABINET_RULE,
          field: "perStepNarrowerMinor",
        },
        value: 0,
      },
      {
        address: {
          kind: "cabinet",
          ruleId: BASE_CABINET_RULE,
          field: "perExtraDoorLeafMinor",
        },
        value: 0,
      },
    ] as const;
    const { container, server } = await mount({
      state: stateOf(tiny),
      cabinetNames: names,
    });
    await open(container);
    click(radio(COPY.bulk.scopeSelected));
    click(
      requireIn<HTMLInputElement>(
        dialogOf(),
        `input[type="checkbox"][aria-label="${roCopy("priceDashboard.cabinets.selectRowAria", { name: nameOf(BASE_CABINET_RULE) })}"]`,
      ),
    );

    typeInto(percentField(), "1");

    const shown = refusalOf(percentField());
    expect(shown).toBe(COPY.bulk.errors.nothingChanges);
    expect(shown).not.toBe(OUT_OF_RANGE_SENTENCE);
    expect(dialogOf().textContent).not.toContain(OUT_OF_RANGE_SENTENCE);
    expect(isOff(confirmButton())).toBe(true);
    expect(server.calls).toEqual([]);
  });

  it("names the cabinet whose price the draft already holds at zero, and says the price is fixed first", async () => {
    const zeroed = [
      {
        address: {
          kind: "cabinet",
          ruleId: BASE_CABINET_RULE,
          field: "anchorMinor",
        },
        value: 0,
      },
      {
        address: {
          kind: "cabinet",
          ruleId: BASE_CABINET_RULE,
          field: "perStepWiderMinor",
        },
        value: 0,
      },
      {
        address: {
          kind: "cabinet",
          ruleId: BASE_CABINET_RULE,
          field: "perStepNarrowerMinor",
        },
        value: 0,
      },
      {
        address: {
          kind: "cabinet",
          ruleId: BASE_CABINET_RULE,
          field: "perExtraDoorLeafMinor",
        },
        value: 0,
      },
    ] as const;
    const { container } = await mount({
      state: stateOf(zeroed),
      cabinetNames: names,
    });
    await open(container);
    click(radio(COPY.bulk.scopeAll));

    typeInto(percentField(), "5");

    expect(refusalOf(percentField())).toBe(
      roCopy("priceDashboard.bulk.errors.priceAlreadyNotPositive", {
        name: nameOf(BASE_CABINET_RULE),
      }),
    );
    expect(isOff(confirmButton())).toBe(true);
  });

  it("answers a refusal of the server that the preview did not foresee in words true of every cause, and stays open", async () => {
    const { container, server } = await mount();
    await open(container);
    server.answerNextWriteWith({
      kind: "refused",
      code: "PERCENT_OUT_OF_RANGE",
    });

    await applyTyped("+5");

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(alertOf(dialogOf())?.textContent).toContain(
      COPY.bulk.errors.cannotApply,
    );
    expect(dialogOf().textContent).not.toContain(OUT_OF_RANGE_SENTENCE);
  });

  it("says another writer got there first and reads the draft again", async () => {
    const { container, server } = await mount();
    await open(container);
    server.moveDraftBehindTheScreen();

    await applyTyped("+5");

    expect(alertOf(dialogOf())?.textContent).toContain(
      COPY.errors.changedMeanwhile,
    );
    expect(server.calls.map(({ kind }) => kind)).toEqual(["bulk", "readState"]);
  });

  it("keeps the dialog open and the action live again after a failure, so it can be tried again", async () => {
    const { container, server } = await mount();
    await open(container);
    server.answerNextWriteWith({ kind: "failed" });

    await applyTyped("+5");
    expect(alertOf(dialogOf())?.textContent).toContain(COPY.errors.saveFailed);
    click(confirmButton());
    await flushPromises(5);

    expect(server.calls.filter(({ kind }) => kind === "bulk")).toHaveLength(2);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("a list that cannot be worked out", () => {
  it("draws the notice in the frame and no price", async () => {
    const page = pageOf();
    const [first] = page.state.active.book.cabinetRules;
    const stranger = {
      ...first,
      ruleId: "cabinet.stranger",
      buildId: "stranger",
    };
    const { container } = await mount({
      ...page,
      state: {
        ...page.state,
        active: {
          ...page.state.active,
          book: {
            ...page.state.active.book,
            cabinetRules: [...page.state.active.book.cabinetRules, stranger],
          },
        },
      },
    } as CabinetListPageInput);

    expect(container.querySelector('[data-testid="cabinet-list"]')).toBeNull();
    expect(container.querySelector('[data-testid="staff-nav"]')).not.toBeNull();
  });
});
