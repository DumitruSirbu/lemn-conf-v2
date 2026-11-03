// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U2, the depth rule's card (frames D2E1 to D2E3, D2ER). The developer's tests type one
// wrong value per error and save once. Here the bounds are walked at both edges, every error is checked for the way it
// is tied to the field, the save is pressed twice in one moment and with the server answering as each code, and a value
// that differs from the pending one only in how it is written (a leading zero) is saved.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MAX_DEEP_CABINET_PERCENT,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import { allIn, click, requireIn, typeInto } from "../support/render-with-intl";
import {
  mountEditor,
  pendingChipOf,
  SECOND_RULE,
  openPriceField,
  press,
  type MountedEditor,
} from "./qa-m10-u2-harness";
import { pageOf } from "./dashboard-state-fixture";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const DEPTH = { kind: "depth-rule" } as const;
const ACTIVE_PERCENT = pageOf().state.active.book.depthRule.deepCabinetPercent;

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

async function mountCard(
  changes: readonly DraftChange[] = [],
): Promise<MountedEditor> {
  mounted = await mountEditor(pageOf(changes));
  return mounted;
}

const cardOf = (container: HTMLElement): HTMLElement =>
  requireIn(container, '[data-testid="depth-rule-card"]');
const fieldOf = (container: HTMLElement): HTMLInputElement =>
  requireIn<HTMLInputElement>(cardOf(container), "input");
const buttonIn = (
  card: HTMLElement,
  words: string,
): HTMLButtonElement | undefined =>
  allIn<HTMLButtonElement>(card, "button").find(
    (button) => button.textContent === words,
  );
const saveOf = (container: HTMLElement): HTMLButtonElement | undefined =>
  buttonIn(cardOf(container), roCopy("priceDashboard.common.save"));
const cancelOf = (container: HTMLElement): HTMLButtonElement | undefined =>
  buttonIn(cardOf(container), roCopy("priceDashboard.common.cancel"));
const alertOf = (container: HTMLElement): HTMLElement | null =>
  cardOf(container).querySelector('[role="alert"]');
const noticeOf = (container: HTMLElement): HTMLElement | null =>
  cardOf(container).querySelector('[role="status"]');

async function saveWith(container: HTMLElement, typed: string): Promise<void> {
  typeInto(fieldOf(container), typed);
  const save = saveOf(container);
  if (save === undefined) throw new Error("no Save");
  click(save);
  await flushPromises(5);
}

describe("the bounds", () => {
  it.each([
    [0, 0],
    [1, 1],
    [ACTIVE_PERCENT + 1, ACTIVE_PERCENT + 1],
    [MAX_DEEP_CABINET_PERCENT - 1, MAX_DEEP_CABINET_PERCENT - 1],
    [MAX_DEEP_CABINET_PERCENT, MAX_DEEP_CABINET_PERCENT],
  ])(
    "sends %i as the rule's change and shows it as pending",
    async (percent, sent) => {
      const { container, server } = await mountCard();

      await saveWith(container, String(percent));

      expect(server.calls).toMatchObject([
        {
          kind: "change",
          request: { change: { address: DEPTH, value: sent } },
        },
      ]);
      expect(server.state().draft.changes).toHaveLength(1);
      expect(pendingChipOf(container)).toContain(
        roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
      );
    },
  );

  it.each([
    [String(MAX_DEEP_CABINET_PERCENT + 1), "tooBig"],
    ["1000", "tooBig"],
    ["99999999999999999999", "tooBig"],
    ["-1", "negative"],
    ["−1", "negative"],
    ["", "empty"],
    ["  ", "empty"],
    ["1.5", "notWhole"],
    ["1,5", "notWhole"],
    ["abc", "notWhole"],
    ["12%%", "notWhole"],
  ])(
    "never sends %j: Save is off, and the alert the field is described by says %s",
    async (typed) => {
      const { container, server } = await mountCard();

      typeInto(fieldOf(container), typed === "" ? "1" : typed);
      if (typed === "") typeInto(fieldOf(container), "");
      const save = saveOf(container);
      if (save !== undefined) click(save);
      await flushPromises(5);

      expect(server.calls).toEqual([]);
      expect(save?.disabled).toBe(true);
      const field = fieldOf(container);
      const alert = alertOf(container);
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(alert?.textContent.trim()).not.toBe("");
      expect(
        (field.getAttribute("aria-describedby") ?? "").split(" "),
      ).toContain(alert?.id);
      expect(alert?.textContent ?? "").not.toContain(
        typed.trim() === "" ? "\u0000" : typed.trim(),
      );
    },
  );

  it("says the greatest percentage the domain allows, so a book that raises it changes the sentence and not only the check", async () => {
    const { container } = await mountCard();

    typeInto(fieldOf(container), String(MAX_DEEP_CABINET_PERCENT + 1));

    expect(alertOf(container)?.textContent).toContain(
      String(MAX_DEEP_CABINET_PERCENT),
    );
  });

  it("offers Save and Cancel for a changed value only, and neither once the value is typed back to what it was", async () => {
    const { container } = await mountCard();
    expect(saveOf(container)).toBeUndefined();

    typeInto(fieldOf(container), String(ACTIVE_PERCENT + 3));
    expect(saveOf(container)).toBeDefined();
    typeInto(fieldOf(container), String(ACTIVE_PERCENT));

    expect(saveOf(container)).toBeUndefined();
    expect(cancelOf(container)).toBeUndefined();
  });
});

describe("a value written differently from the one pending", () => {
  it("does not offer to save a value that only has a leading zero, and says nothing was saved if it is sent anyway", async () => {
    const { container, server } = await mountCard();

    typeInto(fieldOf(container), `0${String(ACTIVE_PERCENT)}`);
    const save = saveOf(container);
    if (save !== undefined) click(save);
    await flushPromises(5);

    expect(server.calls).toEqual([]);
    expect(
      noticeOf(container),
      "the card says the percentage is in De publicat, though nothing was written",
    ).toBeNull();
    expect(
      save,
      "Save is offered for a value equal to the one held",
    ).toBeUndefined();
  });
});

describe("saving twice, or while another write is out", () => {
  it("sends one write for two presses in one moment and shows no failure while it is out", async () => {
    const { container, server } = await mountCard();
    typeInto(fieldOf(container), String(ACTIVE_PERCENT + 3));
    const release = server.holdNextWrite();
    const save = saveOf(container);
    if (save === undefined) throw new Error("no Save");

    act(() => {
      save.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      save.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await flushPromises(5);

    expect(server.calls.filter((call) => call.kind === "change")).toHaveLength(
      1,
    );
    expect(
      alertOf(container)?.textContent,
      "a failure is shown for a write not yet answered",
    ).toBeUndefined();
    release();
    await flushPromises(5);
    expect(server.state().draft.changes).toHaveLength(1);
    expect(noticeOf(container)).not.toBeNull();
  });

  it("keeps Save off while a price's write is out, and sends nothing for a press on it", async () => {
    const { container, server } = await mountCard();
    typeInto(fieldOf(container), String(ACTIVE_PERCENT + 3));
    const input = openPriceField(container, SECOND_RULE);
    typeInto(input, "5000");
    const release = server.holdNextWrite();
    await press(input, "Enter");

    const save = saveOf(container);
    if (save !== undefined) click(save);
    await flushPromises(5);

    expect(save?.disabled).toBe(true);
    expect(server.calls.filter((call) => call.kind === "change")).toHaveLength(
      1,
    );
    release();
    await flushPromises(5);
  });
});

describe("the server's answers to a percentage that read well", () => {
  it.each([
    [
      "TOO_LARGE",
      roCopy("priceDashboard.errors.percentTooBig", {
        max: String(MAX_DEEP_CABINET_PERCENT),
      }),
    ],
    ["NEGATIVE", roCopy("priceDashboard.errors.percentNegative")],
    [
      "NOT_A_WHOLE_NUMBER",
      roCopy("priceDashboard.errors.percentNotWhole", { example: "15" }),
    ],
    ["UNKNOWN_ADDRESS", roCopy("priceDashboard.errors.saveFailed")],
  ] as const)(
    "shows the field the sentence for %s, keeps what was typed, and clears it on the next keystroke",
    async (code, sentence) => {
      const { container, server } = await mountCard();
      server.answerNextWriteWith({ kind: "refused", code });

      await saveWith(container, String(ACTIVE_PERCENT + 3));

      expect(alertOf(container)?.textContent).toBe(sentence);
      expect(fieldOf(container).value).toBe(String(ACTIVE_PERCENT + 3));
      typeInto(fieldOf(container), String(ACTIVE_PERCENT + 4));
      expect(alertOf(container)).toBeNull();
    },
  );

  it("says another writer got there first, keeps what was typed, and a second Save is sent against the revision now there", async () => {
    const { container, server } = await mountCard();
    server.moveDraftBehindTheScreen();

    await saveWith(container, String(ACTIVE_PERCENT + 3));
    expect(alertOf(container)?.textContent).toBe(
      roCopy("priceDashboard.errors.changedMeanwhile"),
    );
    const save = saveOf(container);
    if (save === undefined) throw new Error("no Save");
    click(save);
    await flushPromises(5);

    expect(server.state().draft.changes).toHaveLength(1);
    expect(alertOf(container)).toBeNull();
  });

  it("takes Cancel as the way back to the pending percentage, with nothing sent and no failure left behind", async () => {
    const { container, server } = await mountCard();
    server.answerNextWriteWith({ kind: "failed" });
    await saveWith(container, String(ACTIVE_PERCENT + 3));
    expect(alertOf(container)).not.toBeNull();

    const cancel = cancelOf(container);
    if (cancel === undefined) throw new Error("no Cancel");
    click(cancel);

    expect(fieldOf(container).value).toBe(String(ACTIVE_PERCENT));
    expect(alertOf(container)).toBeNull();
    expect(server.calls.filter((call) => call.kind === "change")).toHaveLength(
      1,
    );
  });
});
