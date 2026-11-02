// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U2, the price in the table (frame D2C). `cabinet-list-editing.dom.test.ts` presses Enter and
// Escape once, on an anchor that is a whole ten of lei, with no write in flight. Here the field meets what a stored book of
// an earlier time holds (an anchor that is not a multiple of 10 lei), a second press while the first is out, a key that closes
// the field before the answer comes, an answer that arrives after the person moved on, and every editable row of the book.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { deriveCabinetList } from "@/price-dashboard/cabinet-list-facts";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import { allIn, requireIn, typeInto } from "../support/render-with-intl";
import {
  alertIn,
  BASE_RULE,
  bookWithAnchor,
  keyDownOn,
  isOpenIn,
  mountEditor,
  openPriceField,
  pageOfBook,
  pendingChipOf,
  PER_SIZE_RULE,
  press,
  priceButtonOf,
  rowOf,
  SECOND_RULE,
  type MountedEditor,
} from "./qa-m10-u2-harness";
import { pageOf } from "./dashboard-state-fixture";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const BASE_ANCHOR = {
  kind: "cabinet",
  ruleId: BASE_RULE,
  field: "anchorMinor",
} as const;
const LEGACY_ANCHOR_MINOR = 396_050;

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

async function mountLegacy(
  changes: readonly DraftChange[] = [],
): Promise<MountedEditor> {
  mounted = await mountEditor(
    pageOfBook(bookWithAnchor(BASE_RULE, LEGACY_ANCHOR_MINOR), changes),
  );
  return mounted;
}

async function mountSample(
  changes: readonly DraftChange[] = [],
): Promise<MountedEditor> {
  mounted = await mountEditor(pageOf(changes));
  return mounted;
}

describe("an anchor a stored book holds that is not a whole ten of lei", () => {
  it("still draws the list, and the row is editable", async () => {
    const { container } = await mountLegacy();

    expect(
      allIn(container, '[data-testid="cabinet-row"]').length,
    ).toBeGreaterThan(0);
    expect(priceButtonOf(container, BASE_RULE).isConnected).toBe(true);
  });

  it("opens with the book's own figure in the field, not a rounded one", async () => {
    const { container } = await mountLegacy();

    const input = openPriceField(container, BASE_RULE);

    expect(input.value).toBe("3960,50");
  });

  it("closes on Enter with the value untouched and sends nothing, rather than holding the person in a refusal of what the book itself says", async () => {
    const { container, server } = await mountLegacy();
    const input = openPriceField(container, BASE_RULE);

    await press(input, "Enter");

    expect(server.calls).toEqual([]);
    expect(
      isOpenIn(rowOf(container, BASE_RULE)),
      "the field is still open and says the price must be in tens of lei",
    ).toBe(false);
  });

  it("closes on Escape, sends nothing and returns focus to the price, whatever was typed", async () => {
    const { container, server } = await mountLegacy();
    const input = openPriceField(container, BASE_RULE);
    typeInto(input, "12,5");

    await press(input, "Escape");

    expect(server.calls).toEqual([]);
    expect(isOpenIn(rowOf(container, BASE_RULE))).toBe(false);
    expect(document.activeElement).toBe(priceButtonOf(container, BASE_RULE));
  });

  it("does not stop another row's price from being changed while this row's field is open and refusing", async () => {
    const { container, server } = await mountLegacy();
    openPriceField(container, BASE_RULE);
    const other = openPriceField(container, SECOND_RULE);

    typeInto(other, "5000");
    await press(other, "Enter");

    expect(server.calls.map((call) => call.kind)).toEqual(["change"]);
    expect(server.state().draft.changes).toHaveLength(1);
  });

  it("lets a new whole ten of lei be written over it, and then the row reads as the new price", async () => {
    const { container, server } = await mountLegacy();
    const input = openPriceField(container, BASE_RULE);

    typeInto(input, "3960");
    await press(input, "Enter");

    expect(server.state().draft.changes).toHaveLength(1);
    expect(rowOf(container, BASE_RULE).getAttribute("data-modified")).toBe(
      "true",
    );
  });

  it("takes the pending change out when the person types the book's own legacy price back, as it does for any other active price", async () => {
    const pending = [
      { address: BASE_ANCHOR, value: 400_000 },
    ] as unknown as DraftChange[];
    const { container, server } = await mountLegacy(pending);
    const input = openPriceField(container, BASE_RULE);

    typeInto(input, "3960,50");
    await press(input, "Enter");

    expect(server.state().draft.changes).toEqual([]);
  });
});

describe("a second press while the first write is out", () => {
  it("sends one write for two Enter presses in the same moment, and does not say the save failed while the first is still out", async () => {
    const { container, server } = await mountSample();
    const input = openPriceField(container, BASE_RULE);
    typeInto(input, "5000");
    const release = server.holdNextWrite();

    act(() => {
      keyDownOn(input, "Enter");
      keyDownOn(input, "Enter");
    });
    await flushPromises(5);

    expect(server.calls.filter((call) => call.kind === "change")).toHaveLength(
      1,
    );
    expect(
      alertIn(rowOf(container, BASE_RULE))?.textContent,
      "a refusal is shown for a write that has not been answered",
    ).toBeUndefined();
    release();
    await flushPromises(5);
    expect(server.state().draft.changes).toHaveLength(1);
    expect(isOpenIn(rowOf(container, BASE_RULE))).toBe(false);
  });

  it("is told nothing and sends nothing when Enter is pressed on another row while one write is out", async () => {
    const { container, server } = await mountSample();
    const first = openPriceField(container, BASE_RULE);
    typeInto(first, "5000");
    const release = server.holdNextWrite();
    await press(first, "Enter");
    const second = openPriceField(container, SECOND_RULE);
    typeInto(second, "6000");

    await press(second, "Enter");

    expect(server.calls.filter((call) => call.kind === "change")).toHaveLength(
      1,
    );
    expect(isOpenIn(rowOf(container, SECOND_RULE))).toBe(true);
    release();
    await flushPromises(5);
  });
});

describe("an answer that arrives after the person has moved on", () => {
  it("does not leave the first write's refusal on the field when the person closed it and opened it again", async () => {
    const { container, server } = await mountSample();
    const input = openPriceField(container, BASE_RULE);
    typeInto(input, "5000");
    const release = server.holdNextWrite();
    server.answerNextWriteWith({ kind: "refused", code: "NEGATIVE" });
    await press(input, "Enter");
    await press(input, "Escape");

    release();
    await flushPromises(5);
    openPriceField(container, BASE_RULE);

    expect(
      alertIn(rowOf(container, BASE_RULE))?.textContent,
      "the field opens already refusing a value that is no longer in it",
    ).toBeUndefined();
  });

  it("does not take the focus back from the field the person has gone to while the first write was out", async () => {
    const { container, server } = await mountSample();
    const first = openPriceField(container, BASE_RULE);
    typeInto(first, "5000");
    const release = server.holdNextWrite();
    await press(first, "Enter");
    const second = openPriceField(container, SECOND_RULE);
    expect(document.activeElement).toBe(second);

    release();
    await flushPromises(5);

    expect(document.activeElement).toBe(second);
  });

  it("does not show the first write's refusal under text the person has since typed over it", async () => {
    const { container, server } = await mountSample();
    const input = openPriceField(container, BASE_RULE);
    typeInto(input, "5000");
    const release = server.holdNextWrite();
    server.answerNextWriteWith({ kind: "refused", code: "TOO_LARGE" });
    await press(input, "Enter");
    typeInto(input, "5010");

    release();
    await flushPromises(5);

    expect(
      alertIn(rowOf(container, BASE_RULE))?.textContent,
      "a refusal of 5000 stands under the field that now says 5010",
    ).toBeUndefined();
  });

  it("closes on Escape while a write is out, and the write still lands in the draft as sent (Escape cancels what has not been sent)", async () => {
    const { container, server } = await mountSample();
    const input = openPriceField(container, BASE_RULE);
    typeInto(input, "5000");
    const release = server.holdNextWrite();
    await press(input, "Enter");

    await press(input, "Escape");
    release();
    await flushPromises(5);

    expect(isOpenIn(rowOf(container, BASE_RULE))).toBe(false);
    expect(server.state().draft.changes).toEqual([
      { address: BASE_ANCHOR, value: 500_000 },
    ]);
    expect(rowOf(container, BASE_RULE).getAttribute("data-modified")).toBe(
      "true",
    );
    expect(pendingChipOf(container)).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
    );
  });
});

describe("a value that is the active price again", () => {
  it.each(deriveEditableRuleIds().map((ruleId) => [ruleId] as const))(
    "takes the change out of the draft for %s, and the chip counts nothing",
    async (ruleId) => {
      const { container, server } = await mountSample();
      const first = openPriceField(container, ruleId);
      const activeText = first.value;
      typeInto(first, bumpedByTenLei(activeText));
      await press(first, "Enter");
      expect(server.state().draft.changes).toHaveLength(1);

      const again = openPriceField(container, ruleId);
      typeInto(again, activeText);
      await press(again, "Enter");

      expect(server.state().draft.changes).toEqual([]);
      expect(rowOf(container, ruleId).getAttribute("data-modified")).toBe(
        "false",
      );
      expect(isOpenIn(rowOf(container, ruleId))).toBe(false);
      expect(
        container.querySelector('[data-testid="staff-pending-prices"]')
          ?.textContent ?? "",
      ).not.toMatch(/[1-9]/);
    },
  );

  it("keeps another cabinet's pending change when this cabinet's is taken out", async () => {
    const { container, server } = await mountSample();
    for (const [ruleId, typed] of [
      [BASE_RULE, "5000"],
      [SECOND_RULE, "6000"],
    ] as const) {
      const input = openPriceField(container, ruleId);
      typeInto(input, typed);
      await press(input, "Enter");
    }

    const again = openPriceField(container, BASE_RULE);
    typeInto(again, "3960");
    await press(again, "Enter");

    expect(server.state().draft.changes).toEqual([
      expect.objectContaining({
        address: expect.objectContaining({ ruleId: SECOND_RULE }) as unknown,
      }) as unknown,
    ]);
  });

  it("sends nothing for the active price when the draft holds no change at that address", async () => {
    const { container, server } = await mountSample();

    const input = openPriceField(container, BASE_RULE);
    typeInto(input, "3960");
    await press(input, "Enter");

    expect(server.calls).toEqual([]);
  });

  it("sends the new value as a change, not a revert, when it differs from the active one and a change is held", async () => {
    const held = [
      { address: BASE_ANCHOR, value: 500_000 },
    ] as unknown as DraftChange[];
    const { container, server } = await mountSample(held);
    const input = openPriceField(container, BASE_RULE);

    typeInto(input, "6000");
    await press(input, "Enter");

    expect(server.calls.map((call) => call.kind)).toEqual(["change"]);
    expect(server.state().draft.changes).toEqual([
      { address: BASE_ANCHOR, value: 600_000 },
    ]);
  });
});

describe("what a person pastes or types into the field", () => {
  it.each([
    ["a spreadsheet cell with its currency", "4 500 lei"],
    ["a figure with a thousands comma", "4,500.00"],
    ["Arabic-Indic digits", "٤٥٠٠"],
    ["a plus sign", "+4500"],
    ["a minus sign", "-4500"],
    ["a figure of 14 digits", "99999999999999"],
    ["a figure that is not a ten of lei", "4505"],
    ["nothing but spaces", "   "],
    ["a line break inside", "45\n00x"],
  ])(
    "never sends %s, keeps the text, and refuses it in an alert tied to the field that does not repeat it",
    async (_name, typed) => {
      const { container, server } = await mountSample();
      const input = openPriceField(container, BASE_RULE);

      typeInto(input, typed);
      await press(input, "Enter");

      expect(server.calls).toEqual([]);
      const row = rowOf(container, BASE_RULE);
      const field = requireIn<HTMLInputElement>(row, "input");
      // A text field takes no line break, so what it keeps is read back and not assumed.
      const kept = field.value;
      expect(kept.replace(/[\n\r]/g, "")).toBe(kept);
      expect(field.getAttribute("aria-invalid")).toBe("true");
      const alert = requireIn(row, '[role="alert"]');
      expect(alert.textContent.trim()).not.toBe("");
      if (kept.trim() !== "")
        expect(alert.textContent).not.toContain(kept.trim());
      const described = (field.getAttribute("aria-describedby") ?? "").split(
        " ",
      );
      expect(described).toContain(alert.id);
      expect(new Set(described).size).toBe(described.length);
      for (const id of described) {
        expect(document.getElementById(id), id).not.toBeNull();
      }
    },
  );

  it("sends nothing on a blur and keeps the field and the text, as there is no key that said so", async () => {
    const { container, server } = await mountSample();
    const input = openPriceField(container, BASE_RULE);
    typeInto(input, "5000");

    act(() => {
      input.blur();
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await flushPromises(5);

    expect(server.calls).toEqual([]);
    expect(
      requireIn<HTMLInputElement>(rowOf(container, BASE_RULE), "input").value,
    ).toBe("5000");
  });

  it("clears the refusal as soon as the text is corrected, and a corrected value is then sent on Enter", async () => {
    const { container, server } = await mountSample();
    const input = openPriceField(container, BASE_RULE);
    typeInto(input, "4505");
    await press(input, "Enter");
    expect(alertIn(rowOf(container, BASE_RULE))).not.toBeNull();

    typeInto(input, "4500");

    expect(alertIn(rowOf(container, BASE_RULE))).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();
    await press(input, "Enter");
    expect(server.calls.map((call) => call.kind)).toEqual(["change"]);
  });

  it("has no alert in a field that opens on a price the book holds well", async () => {
    const { container } = await mountSample();

    const input = openPriceField(container, BASE_RULE);

    expect(alertIn(rowOf(container, BASE_RULE))).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).not.toBeNull();
  });
});

describe("a write the draft moved under", () => {
  it("keeps the row's pending state through the re-read, shows the other writer's change, and keeps what was typed", async () => {
    const { container, server } = await mountSample();
    const input = openPriceField(container, BASE_RULE);
    typeInto(input, "5000");
    server.moveDraftBehindTheScreen();

    await press(input, "Enter");

    const row = rowOf(container, BASE_RULE);
    expect(alertIn(row)?.textContent).toBe(
      roCopy("priceDashboard.errors.changedMeanwhile"),
    );
    expect(requireIn<HTMLInputElement>(row, "input").value).toBe("5000");
    expect(server.calls.map((call) => call.kind)).toEqual([
      "change",
      "readState",
    ]);
    await press(requireIn(row, "input"), "Enter");
    expect(server.state().draft.changes).toHaveLength(1);
    expect(isOpenIn(rowOf(container, BASE_RULE))).toBe(false);
  });

  it("keeps a change that was pending before, through a conflict on another row", async () => {
    const held = [
      { address: BASE_ANCHOR, value: 500_000 },
    ] as unknown as DraftChange[];
    const { container, server } = await mountSample(held);
    const input = openPriceField(container, SECOND_RULE);
    typeInto(input, "6000");
    server.moveDraftBehindTheScreen();

    await press(input, "Enter");

    expect(rowOf(container, BASE_RULE).getAttribute("data-modified")).toBe(
      "true",
    );
    expect(pendingChipOf(container)).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
    );
  });
});

describe("the rows the list does not let a person edit", () => {
  it("offer no button and no field on a row the customer supplies, and the button is a control with a name on the others", async () => {
    const { container } = await mountSample();
    const derived = deriveCabinetList(pageOf());
    if (derived.kind !== "ready") throw new Error("unreadable");

    for (const row of derived.input.rules) {
      const element = rowOf(container, row.ruleId);
      if (row.isCustomerSupplied) {
        expect(element.querySelector("button, input"), row.ruleId).toBeNull();
      } else {
        const button = element.querySelector("button");
        expect(button?.getAttribute("aria-label"), row.ruleId).toBeTruthy();
        expect(button?.getAttribute("type")).toBe("button");
      }
    }
  });

  it("is a price-per-size row that opens, edits and reverts at the listed size the default width is priced as", async () => {
    const { container, server } = await mountSample();
    const input = openPriceField(container, PER_SIZE_RULE);

    typeInto(input, "3510");
    await press(input, "Enter");

    expect(server.state().draft.changes).toEqual([
      {
        address: { kind: "cabinet-size", ruleId: PER_SIZE_RULE, widthMm: 600 },
        value: 351_000,
      },
    ]);
  });
});

function deriveEditableRuleIds(): string[] {
  const derived = deriveCabinetList(pageOf());
  if (derived.kind !== "ready") throw new Error("unreadable");
  return derived.input.rules
    .filter((row) => row.anchorField !== undefined)
    .map((row) => row.ruleId);
}

/** The field's own text with ten lei more in it, for any amount the sample book holds in whole lei. */
function bumpedByTenLei(text: string): string {
  const [whole = "0", fraction] = text.split(",");
  const bumped = String(Number(whole) + 10);
  return fraction === undefined ? bumped : `${bumped},${fraction}`;
}
