// @vitest-environment happy-dom
//
// The cabinet list's controls when something else is in flight or already held: the bulk dialog while an inline write
// is out, the depth card when the person types on before its save is answered, the card's notice after a revert, and
// the price field over a value the draft already holds.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import { allIn, click, requireIn, typeInto } from "../support/render-with-intl";
import {
  alertIn,
  BASE_RULE,
  mountEditor,
  openPriceField,
  press,
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
const DEPTH = { kind: "depth-rule" } as const;
const ACTIVE_ANCHOR_MINOR = 396_000;
const OFF_TEN_ANCHOR_MINOR = 396_050;
const ACTIVE_PERCENT = pageOf().state.active.book.depthRule.deepCabinetPercent;
const PENDING_PERCENT = ACTIVE_PERCENT + 3;
const NEXT_PERCENT = ACTIVE_PERCENT + 5;

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

async function mount(
  changes: readonly DraftChange[] = [],
): Promise<MountedEditor> {
  mounted = await mountEditor(pageOf(changes));
  return mounted;
}

const buttonSaying = (scope: ParentNode, words: string): HTMLButtonElement => {
  const found = allIn<HTMLButtonElement>(scope, "button").find(
    (button) => button.textContent === words,
  );
  if (found === undefined) throw new Error(`no button says "${words}"`);
  return found;
};
const draftChangesOf = (server: MountedEditor["server"]) =>
  server.state().draft.changes;

describe("the bulk dialog opened while an inline write is out", () => {
  const dialogOf = (): HTMLElement =>
    requireIn(document.body, '[role="dialog"]');
  const isDialogOpen = (): boolean =>
    document.querySelector('[role="dialog"]') !== null;
  const confirmOf = (): HTMLButtonElement =>
    buttonSaying(dialogOf(), roCopy("priceDashboard.common.addToPending"));
  const isOff = (button: HTMLButtonElement): boolean =>
    button.getAttribute("aria-disabled") === "true";

  async function openDialogWhileAPriceIsBeingWritten() {
    const { container, server } = await mount();
    const input = openPriceField(container, SECOND_RULE);
    typeInto(input, "5000");
    const release = server.holdNextWrite();
    await press(input, "Enter");
    click(
      buttonSaying(container, roCopy("priceDashboard.cabinets.bulkAction")),
    );
    await flushPromises(5);
    typeInto(
      requireIn<HTMLInputElement>(dialogOf(), 'input[type="text"]'),
      "+5",
    );
    return { server, release };
  }

  it("keeps confirmation off while that write is out, sends no bulk write, and does not claim to be adding", async () => {
    const { server, release } = await openDialogWhileAPriceIsBeingWritten();

    click(confirmOf());
    await flushPromises(5);

    expect(isOff(confirmOf())).toBe(true);
    expect(confirmOf().textContent).toBe(
      roCopy("priceDashboard.common.addToPending"),
    );
    expect(server.calls.filter((call) => call.kind === "bulk")).toEqual([]);
    release();
    await flushPromises(5);
  });

  it("is usable again once that write has landed: confirming sends the bulk write and closes the dialog", async () => {
    const { server, release } = await openDialogWhileAPriceIsBeingWritten();
    click(confirmOf());
    await flushPromises(5);

    release();
    await flushPromises(5);
    expect(isOff(confirmOf())).toBe(false);
    click(confirmOf());
    await flushPromises(5);

    expect(server.calls.filter((call) => call.kind === "bulk")).toHaveLength(1);
    expect(isDialogOpen()).toBe(false);
  });
});

describe("the depth card's save answered after the person has typed on", () => {
  const cardOf = (container: HTMLElement): HTMLElement =>
    requireIn(container, '[data-testid="depth-rule-card"]');
  const fieldOf = (container: HTMLElement): HTMLInputElement =>
    requireIn<HTMLInputElement>(cardOf(container), "input");
  const noticeOf = (container: HTMLElement): HTMLElement | null =>
    cardOf(container).querySelector('[role="status"]');

  async function saveWhileTheWriteIsHeld(
    container: HTMLElement,
    typed: string,
  ) {
    typeInto(fieldOf(container), typed);
    click(
      buttonSaying(cardOf(container), roCopy("priceDashboard.common.save")),
    );
    await flushPromises(5);
  }

  it("keeps the value typed while the save was out, and says nothing of the value that was saved", async () => {
    const { container, server } = await mount();
    const release = server.holdNextWrite();
    await saveWhileTheWriteIsHeld(container, String(PENDING_PERCENT));

    typeInto(fieldOf(container), String(NEXT_PERCENT));
    release();
    await flushPromises(5);

    expect(draftChangesOf(server)).toHaveLength(1);
    expect(fieldOf(container).value).toBe(String(NEXT_PERCENT));
    expect(noticeOf(container)).toBeNull();
  });

  it("ignores the answer of a save whose field was cancelled while it was out", async () => {
    const { container, server } = await mount();
    const release = server.holdNextWrite();
    await saveWhileTheWriteIsHeld(container, String(PENDING_PERCENT));

    click(
      buttonSaying(cardOf(container), roCopy("priceDashboard.common.cancel")),
    );
    release();
    await flushPromises(5);

    expect(noticeOf(container)).toBeNull();
  });

  it("still says the value is in De publicat when nothing was typed or cancelled meanwhile", async () => {
    const { container } = await mount();

    await saveWhileTheWriteIsHeld(container, String(PENDING_PERCENT));

    expect(noticeOf(container)?.textContent).toBe(
      roCopy("priceDashboard.rule.savedNotice"),
    );
  });
});

describe("the depth card after a save that took the draft's change out", () => {
  it("shows no notice that a value was sent to De publicat when the value typed is the active one", async () => {
    const pending = [
      { address: DEPTH, value: PENDING_PERCENT },
    ] as unknown as DraftChange[];
    const { container, server } = await mount(pending);
    const card = requireIn(container, '[data-testid="depth-rule-card"]');
    typeInto(
      requireIn<HTMLInputElement>(card, "input"),
      String(ACTIVE_PERCENT),
    );

    click(buttonSaying(card, roCopy("priceDashboard.common.save")));
    await flushPromises(5);

    expect(draftChangesOf(server)).toEqual([]);
    expect(card.querySelector('[role="status"]')).toBeNull();
  });
});

describe("a price field over a value the draft already holds", () => {
  it("opens on a pending amount that is not a whole ten of lei with no error, and Enter closes it with nothing sent", async () => {
    const pending = [
      { address: BASE_ANCHOR, value: OFF_TEN_ANCHOR_MINOR },
    ] as unknown as DraftChange[];
    const { container, server } = await mount(pending);

    const input = openPriceField(container, BASE_RULE);
    const alertOnOpening = alertIn(rowOf(container, BASE_RULE));
    await press(input, "Enter");

    expect(input.value).toBe("3960,50");
    expect(alertOnOpening).toBeNull();
    expect(server.calls).toEqual([]);
    expect(rowOf(container, BASE_RULE).querySelector("input")).toBeNull();
  });

  it("still refuses a different amount that is not a whole ten of lei", async () => {
    const pending = [
      { address: BASE_ANCHOR, value: OFF_TEN_ANCHOR_MINOR },
    ] as unknown as DraftChange[];
    const { container, server } = await mount(pending);
    const input = openPriceField(container, BASE_RULE);

    typeInto(input, "3960,60");
    await press(input, "Enter");

    expect(alertIn(rowOf(container, BASE_RULE))).not.toBeNull();
    expect(server.calls).toEqual([]);
  });
});

describe("a price typed back to the active one while the draft holds a change at that value", () => {
  it("takes the change out of the draft", async () => {
    const pending = [
      { address: BASE_ANCHOR, value: ACTIVE_ANCHOR_MINOR },
    ] as unknown as DraftChange[];
    const { container, server } = await mount(pending);
    const input = openPriceField(container, BASE_RULE);

    typeInto(input, "3960");
    await press(input, "Enter");

    expect(server.calls.map((call) => call.kind)).toEqual(["revert"]);
    expect(draftChangesOf(server)).toEqual([]);
    expect(rowOf(container, BASE_RULE).querySelector("input")).toBeNull();
  });

  it("sends nothing when the draft holds no change there and the price is the active one", async () => {
    const { container, server } = await mount();
    const input = openPriceField(container, BASE_RULE);

    await press(input, "Enter");

    expect(server.calls).toEqual([]);
    expect(rowOf(container, BASE_RULE).querySelector("input")).toBeNull();
  });
});
