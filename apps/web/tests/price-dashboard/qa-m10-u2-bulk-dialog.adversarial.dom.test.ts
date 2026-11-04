// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U2, the bulk-percentage dialog (frame D2D). `cabinet-list-editing.dom.test.ts` presses one
// valid percentage once, from a fresh dialog, over the sample book. Here the dialog is pressed twice in one moment,
// closed while its write is out, moved from one scope to another after a refusal, shown to a draft that already holds a
// price the rule refuses (the M2 hand-off to U2), and every refusal the server can give is worded and checked against
// the one sentence a refusal of this kind must never be (the "out of range" one).
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BULK_PLAN_REFUSAL_CODES,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import type { BulkRefusalCode } from "@/price-dashboard/price-dashboard-wire-contract";

import { flushPromises } from "../support/render-hook";
import { allIn, click, requireIn, typeInto } from "../support/render-with-intl";
import {
  alertIn,
  BASE_RULE,
  mountEditor,
  pageOfBook,
  pendingChipOf,
  type MountedEditor,
} from "./qa-m10-u2-harness";
import { pageOf } from "./dashboard-state-fixture";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const OUT_OF_RANGE_SENTENCE = roCopy("priceDashboard.bulk.errors.outOfRange", {
  lowest: roCopy("priceDashboard.common.percent", { percent: "-90" }),
  highest: roCopy("priceDashboard.common.percent", { percent: "300" }),
});

let mounted: MountedEditor | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

const dialogOf = (): HTMLElement => requireIn(document.body, '[role="dialog"]');
const isOpen = (): boolean =>
  document.querySelector('[role="dialog"]') !== null;
const percentField = (): HTMLInputElement =>
  requireIn<HTMLInputElement>(dialogOf(), 'input[type="text"]');
const buttonSaying = (scope: ParentNode, words: string): HTMLButtonElement => {
  const found = allIn<HTMLButtonElement>(scope, "button").find(
    (button) => button.textContent === words,
  );
  if (found === undefined) throw new Error(`no button says "${words}"`);
  return found;
};
const confirmButton = (): HTMLButtonElement =>
  buttonSaying(dialogOf(), roCopy("priceDashboard.common.addToPending"));
const isOff = (button: HTMLButtonElement): boolean =>
  button.getAttribute("aria-disabled") === "true";
const radio = (words: string): HTMLInputElement =>
  requireIn<HTMLInputElement>(
    allIn(dialogOf(), "label").find((label) => label.textContent === words) ??
      dialogOf(),
    "input",
  );
const nameOfRule = (ruleId: string): string =>
  pageOf().cabinetNames[ruleId.replace("cabinet.", "")] ?? ruleId;
const checkboxOf = (ruleId: string): HTMLInputElement =>
  requireIn<HTMLInputElement>(
    dialogOf(),
    `input[type="checkbox"][aria-label="${roCopy("priceDashboard.cabinets.selectRowAria", { name: nameOfRule(ruleId) })}"]`,
  );

async function openDialog(page = pageOf()): Promise<MountedEditor> {
  mounted = await mountEditor(page);
  click(
    buttonSaying(
      mounted.container,
      roCopy("priceDashboard.cabinets.bulkAction"),
    ),
  );
  await flushPromises(5);
  return mounted;
}

function pressKey(target: Element, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

/** The page of a draft that sets every amount a cabinet's price is made of, so the cabinet prices as `total`. */
function draftPricingBaseCabinetAt(anchorMinor: number): DraftChange[] {
  return [
    ["anchorMinor", anchorMinor],
    ["perStepWiderMinor", 0],
    ["perStepNarrowerMinor", 0],
    ["perExtraDoorLeafMinor", 0],
  ].map(([field, value]) => ({
    address: { kind: "cabinet", ruleId: BASE_RULE, field },
    value,
  })) as unknown as DraftChange[];
}

describe("a confirmation pressed twice in one moment", () => {
  it("sends one write and shows no failure while that write is still out", async () => {
    const { server } = await openDialog();
    typeInto(percentField(), "+5");
    const release = server.holdNextWrite();

    act(() => {
      const button = confirmButton();
      button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await flushPromises(5);

    expect(server.calls.filter((call) => call.kind === "bulk")).toHaveLength(1);
    expect(
      alertIn(dialogOf())?.textContent,
      "the dialog says the save failed while the first press is still out",
    ).toBeUndefined();
    release();
    await flushPromises(5);
    expect(isOpen()).toBe(false);
  });
});

describe("a dialog closed with its write out", () => {
  it("lands the write once, raises no error, and leaves focus on the button that opened it", async () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { server, container } = await openDialog();
    typeInto(percentField(), "+5");
    const release = server.holdNextWrite();
    click(confirmButton());
    await flushPromises(3);

    pressKey(document.activeElement ?? document.body, "Escape");
    await flushPromises(3);
    release();
    await flushPromises(5);

    expect(server.calls.filter((call) => call.kind === "bulk")).toHaveLength(1);
    expect(server.state().draft.changes.length).toBeGreaterThan(0);
    expect(isOpen()).toBe(false);
    expect(errors).not.toHaveBeenCalled();
    expect(pendingChipOf(container)).toContain(
      roCopy("priceDashboard.nav.pendingChip", {
        count: server.state().draft.changes.length,
      }),
    );
  });
});

describe("the scopes", () => {
  it("offers confirmation for none until a cabinet is ticked in a selection, says so in an alert, and takes the tick back", async () => {
    const { server } = await openDialog();
    click(radio(roCopy("priceDashboard.bulk.scopeSelected")));
    typeInto(percentField(), "5");

    expect(isOff(confirmButton())).toBe(true);
    expect(alertIn(dialogOf())?.textContent).toBe(
      roCopy("priceDashboard.bulk.errors.noCabinets"),
    );
    click(checkboxOf(BASE_RULE));
    expect(isOff(confirmButton())).toBe(false);
    expect(alertIn(dialogOf())).toBeNull();
    click(checkboxOf(BASE_RULE));
    expect(isOff(confirmButton())).toBe(true);
    click(confirmButton());
    await flushPromises(5);
    expect(server.calls).toEqual([]);
  });

  it("ties the refusal of an empty selection to the list it is about, so a reader of the list hears it", async () => {
    await openDialog();
    click(radio(roCopy("priceDashboard.bulk.scopeSelected")));
    typeInto(percentField(), "5");

    const alert = alertIn(dialogOf());

    expect(alert).not.toBeNull();
    expect(alert?.id, "the alert has no id for anything to point at").not.toBe(
      "",
    );
    const checklist = requireIn(dialogOf(), "ul[aria-label]");
    const describing = allIn(dialogOf(), "[aria-describedby]").filter(
      (element) =>
        (element.getAttribute("aria-describedby") ?? "")
          .split(" ")
          .includes(alert?.id ?? "\u0000"),
    );
    expect(
      describing.some(
        (element) => element === checklist || checklist.contains(element),
      ),
      "the list of cabinets to tick (or a box in it) is not described by the sentence that says to tick one",
    ).toBe(true);
  });

  it("sends exactly the cabinets ticked, as rules the book holds, and nothing for a customer's", async () => {
    const { server } = await openDialog();
    click(radio(roCopy("priceDashboard.bulk.scopeSelected")));
    click(checkboxOf(BASE_RULE));
    click(checkboxOf("cabinet.base-3drawer"));
    typeInto(percentField(), "-10");

    click(confirmButton());
    await flushPromises(5);

    expect(server.calls).toMatchObject([
      {
        kind: "bulk",
        request: {
          target: {
            scope: "selection",
            ruleIds: [BASE_RULE, "cabinet.base-3drawer"],
          },
          percent: -10,
        },
      },
    ]);
  });

  it("keeps the typed percentage when the scope changes and shows the new scope's preview at once", async () => {
    await openDialog();
    typeInto(percentField(), "5");
    const groupPreview = dialogOf().textContent;

    click(radio(roCopy("priceDashboard.bulk.scopeAll")));

    expect(percentField().value).toBe("5");
    expect(dialogOf().textContent).not.toBe(groupPreview);
    expect(dialogOf().textContent).toContain(
      roCopy("priceDashboard.bulk.previewTitle"),
    );
  });

  it("clears the failure it showed when the group chosen changes, as it does when the scope or a tick does", async () => {
    const { server } = await openDialog();
    typeInto(percentField(), "5");
    server.answerNextWriteWith({ kind: "failed" });
    click(confirmButton());
    await flushPromises(5);
    expect(alertIn(dialogOf())?.textContent).toContain(
      roCopy("priceDashboard.errors.saveFailed"),
    );

    const select = requireIn<HTMLSelectElement>(dialogOf(), "select");
    act(() => {
      select.value = "wall";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(
      alertIn(dialogOf()),
      "a failure of the base group's action stands under the wall group",
    ).toBeNull();
  });
});

describe("a refusal that is not the percentage being out of range", () => {
  const SWEEP = [-90, -50, -10, -3, -2, -1, 1, 2, 3, 4, 10, 100, 300];

  it("is never worded as out of range in any scope, over a sweep of valid percentages, on a draft whose every price rounds back", async () => {
    const tiny = draftPricingBaseCabinetAt(2_000);
    await openDialog(pageOfBook(SAMPLE_PRICE_BOOK, tiny));
    click(radio(roCopy("priceDashboard.bulk.scopeSelected")));
    click(checkboxOf(BASE_RULE));

    for (const percent of SWEEP) {
      typeInto(percentField(), String(percent));

      expect(dialogOf().textContent, `${String(percent)} %`).not.toContain(
        OUT_OF_RANGE_SENTENCE,
      );
      expect(percentField().getAttribute("aria-invalid") === "true").toBe(
        isOff(confirmButton()),
      );
    }
  });

  it("is, for a price the draft already holds at zero, not the sentence for a price the percentage drove to zero", async () => {
    await openDialog(
      pageOfBook(SAMPLE_PRICE_BOOK, draftPricingBaseCabinetAt(0)),
    );
    click(radio(roCopy("priceDashboard.bulk.scopeAll")));
    typeInto(percentField(), "5");
    const alreadyZero = alertIn(dialogOf())?.textContent;
    mounted?.unmount();
    mounted = undefined;
    await openDialog(
      pageOfBook(SAMPLE_PRICE_BOOK, draftPricingBaseCabinetAt(2_000)),
    );
    click(radio(roCopy("priceDashboard.bulk.scopeAll")));
    typeInto(percentField(), "-90");
    const drivenToZero = alertIn(dialogOf())?.textContent;

    expect(
      alreadyZero,
      "the dialog refuses a price that is already zero",
    ).toContain(pageOf().cabinetNames["base-cabinet"]);
    expect(
      drivenToZero,
      "the dialog refuses a price the percentage drives to zero",
    ).toContain(pageOf().cabinetNames["base-cabinet"]);
    expect(
      alreadyZero,
      "the same advice (a smaller percentage) is given for a price that is zero before any percentage is applied",
    ).not.toBe(drivenToZero);
  });

  it.each(BULK_PLAN_REFUSAL_CODES)(
    "words the server's %s in a sentence that names no code and never says the percentage is out of range",
    async (code) => {
      const { server } = await openDialog();
      typeInto(percentField(), "5");
      server.answerNextWriteWith({
        kind: "refused",
        code: code as BulkRefusalCode,
      });

      click(confirmButton());
      await flushPromises(5);

      expect(isOpen()).toBe(true);
      const shown = alertIn(dialogOf())?.textContent ?? "";
      expect(shown.trim()).not.toBe("");
      expect(shown).not.toContain(code);
      expect(shown).not.toContain(OUT_OF_RANGE_SENTENCE);
      expect(isOff(confirmButton())).toBe(false);
    },
  );

  it("is, after a candidate the draft no longer makes, a sentence that says nothing was changed, and the dialog stays", async () => {
    const { server } = await openDialog();
    typeInto(percentField(), "5");
    server.answerNextWriteWith({ kind: "candidate-refused" });

    click(confirmButton());
    await flushPromises(5);

    expect(alertIn(dialogOf())?.textContent).toContain(
      roCopy("priceDashboard.bulk.errors.cannotApply"),
    );
  });
});

describe("the percentage field", () => {
  it.each([
    ["+-5"],
    ["5%"],
    ["٥"],
    ["3,5"],
    ["0"],
    ["-0"],
    ["301"],
    ["-91"],
    ["999999999999999999999"],
  ])(
    "refuses %j in an alert the field is described by, without repeating it, and sends nothing",
    async (typed) => {
      const { server } = await openDialog();
      typeInto(percentField(), "1");

      typeInto(percentField(), typed);
      click(confirmButton());
      await flushPromises(5);

      const field = percentField();
      expect(field.getAttribute("aria-invalid")).toBe("true");
      const alert = requireIn(dialogOf(), '[role="alert"]');
      expect(
        (field.getAttribute("aria-describedby") ?? "").split(" "),
      ).toContain(alert.id);
      expect(alert.textContent).not.toContain(typed);
      expect(server.calls).toEqual([]);
    },
  );

  it("shows no error on a field nothing has been typed into, and an error once something typed has been erased", async () => {
    await openDialog();

    expect(percentField().getAttribute("aria-invalid")).toBeNull();
    expect(isOff(confirmButton())).toBe(true);
    typeInto(percentField(), "5");
    typeInto(percentField(), "");
    expect(percentField().getAttribute("aria-invalid")).toBe("true");
  });

  it("starts empty every time the dialog is opened, with the focus in the field", async () => {
    const { container } = await openDialog();
    typeInto(percentField(), "5");
    pressKey(percentField(), "Escape");
    await flushPromises(5);
    expect(isOpen()).toBe(false);

    click(
      buttonSaying(container, roCopy("priceDashboard.cabinets.bulkAction")),
    );
    await flushPromises(5);

    expect(percentField().value).toBe("");
    expect(document.activeElement).toBe(percentField());
  });
});
