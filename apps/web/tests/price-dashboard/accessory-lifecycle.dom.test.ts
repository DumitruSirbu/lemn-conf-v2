// @vitest-environment happy-dom
//
// Switching an accessory off and on (frame D6C) and deleting one: each is asked in a dialog that opens on its safe button, a
// switch applies at once and is no entry of "De publicat", and an accessory is told as one that is earned and never chosen,
// so no dialog calls it an option. Deleting an accessory only the draft knows takes its creation back out of the draft.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import {
  accessoryItem,
  accessoryPageOf,
  chipsOf,
  CREATED,
  COVER_NAME,
  CREATED_ACCESSORY,
  DRYING_RACK,
  menuEntry,
  mountAccessoryList,
  openMenuOf,
  PUBLISHED,
  PUBLISHED_RULE,
  RACK_NAME,
  rowOf,
  SINK_COVER,
  USAGE,
  type MountedAccessories,
} from "./accessory-harness";
import {
  dialogButton,
  openDialog,
  pendingChipText,
  press,
} from "./hardware-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const CREATED_NAME = "Suport pentru farfurii";
const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
const ACTIVATE = roCopy("priceDashboard.common.activate");
const DELETE = roCopy("priceDashboard.common.delete");
const CANCEL = roCopy("priceDashboard.common.cancel");
const DEACTIVATE_CONFIRM = roCopy("priceDashboard.lifecycle.deactivateConfirm");
/** What a deletion says of publication; a switch applies at once and its dialogs never say it. */
const TAKES_EFFECT_AT_PUBLISH = /intr. .n vigoare c.nd publici/iu;
/** The word an accessory is never called, since customers do not choose it. */
const OPTION = /op.iun/iu;
/** The line that lists what stays on offer, which an accessory has no group to name. */
const REMAINING_OPTIONS = /R.m.n disponibile/u;
const linked = [PUBLISHED_RULE];

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

async function openDialogFor(
  accessoryId: string,
  name: string,
  entryWords: string,
): Promise<HTMLElement> {
  const screen = mounted;
  if (screen === undefined) throw new Error("nothing is mounted");
  await openMenuOf(screen.container, accessoryId, name);
  const entry = menuEntry(screen.container, accessoryId, entryWords);
  entry.focus();
  await press(entry);
  const dialog = openDialog();
  if (dialog === null) throw new Error("no dialog opened");
  return dialog;
}

const setActiveCalls = (screen: MountedAccessories) =>
  screen.lifecycle.calls.filter((call) => call.kind === "setActive");

describe("switching an accessory kitchens use off", () => {
  it("asks first, with the count, that customers no longer get it, what a saved kitchen is told, and that it applies now, and opens on Cancel", async () => {
    mounted = await mountAccessoryList(accessoryPageOf());

    const dialog = await openDialogFor(DRYING_RACK, RACK_NAME, DEACTIVATE);

    expect(dialog.getAttribute("role")).toBe("alertdialog");
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deactivateTitle", { name: RACK_NAME }),
    );
    for (const words of [
      roCopy("priceDashboard.lifecycle.usedByAccessory", { count: 31 }),
      roCopy("priceDashboard.lifecycle.clientsNoLongerGetAccessory"),
      roCopy("priceDashboard.lifecycle.accessoryRemovedExplained"),
      roCopy("priceDashboard.lifecycle.appliesImmediately"),
    ]) {
      expect(dialog.textContent).toContain(words);
    }
    expect(document.activeElement).toBe(dialogButton(dialog, CANCEL));
  });

  it("calls the accessory neither an option nor something customers choose, and names no option that remains", async () => {
    mounted = await mountAccessoryList(accessoryPageOf());

    const dialog = await openDialogFor(DRYING_RACK, RACK_NAME, DEACTIVATE);

    expect(dialog.textContent).not.toMatch(OPTION);
    expect(dialog.textContent).not.toContain(
      roCopy("priceDashboard.lifecycle.clientsCannotChoose"),
    );
    expect(dialog.textContent).not.toMatch(REMAINING_OPTIONS);
  });

  it("says the count with the accessory's own pronoun, whatever the number", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({
        usage: USAGE.map((held) =>
          held.item.kind === "accessory" &&
          held.item.accessoryId === DRYING_RACK
            ? { ...held, designCount: 1 }
            : held,
        ),
      }),
    );

    const dialog = await openDialogFor(DRYING_RACK, RACK_NAME, DEACTIVATE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usedByAccessory", { count: 1 }),
    );
  });

  it("leaves out the line about use, and the notice it would explain, for an accessory no kitchen uses", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({
        usage: USAGE.map((held) => ({ ...held, designCount: 0 })),
      }),
    );

    const dialog = await openDialogFor(DRYING_RACK, RACK_NAME, DEACTIVATE);

    expect(dialog.textContent).not.toContain(
      roCopy("priceDashboard.lifecycle.accessoryRemovedExplained"),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.clientsNoLongerGetAccessory"),
    );
  });

  it("never says it takes effect when publishing, in the dialog that switches off or the one that switches on", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ disabled: [accessoryItem(SINK_COVER)] }),
    );

    const disabling = await openDialogFor(DRYING_RACK, RACK_NAME, DEACTIVATE);
    const disablingText = disabling.textContent;
    await press(dialogButton(disabling, CANCEL));
    const enabling = await openDialogFor(SINK_COVER, COVER_NAME, ACTIVATE);

    expect(disablingText).not.toMatch(TAKES_EFFECT_AT_PUBLISH);
    expect(enabling.textContent).not.toMatch(TAKES_EFFECT_AT_PUBLISH);
  });

  it("takes effect on confirming without a single write to the draft, and the pending count does not move", async () => {
    mounted = await mountAccessoryList(accessoryPageOf());
    const pendingBefore = pendingChipText(mounted.container);
    const dialog = await openDialogFor(DRYING_RACK, RACK_NAME, DEACTIVATE);

    await press(dialogButton(dialog, DEACTIVATE_CONFIRM));

    expect(setActiveCalls(mounted)).toEqual([
      {
        kind: "setActive",
        request: {
          expectedRevision: "1",
          item: accessoryItem(DRYING_RACK),
          active: false,
        },
      },
    ]);
    expect(mounted.draftServer.calls).toEqual([]);
    expect(chipsOf(mounted.container, DRYING_RACK)).toEqual([
      roCopy("priceDashboard.chips.inactive"),
    ]);
    expect(pendingChipText(mounted.container)).toBe(pendingBefore);
    expect(openDialog()).toBeNull();
  });

  it("switches a linked accessory off the same way", async () => {
    mounted = await mountAccessoryList(accessoryPageOf({ linked }));

    const dialog = await openDialogFor(
      PUBLISHED,
      PUBLISHED_RULE.name,
      DEACTIVATE,
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usedByAccessory", { count: 4 }),
    );
    await press(dialogButton(dialog, DEACTIVATE_CONFIRM));

    expect(setActiveCalls(mounted)).toHaveLength(1);
    expect(chipsOf(mounted.container, PUBLISHED)).toEqual([
      roCopy("priceDashboard.chips.inactive"),
    ]);
  });

  it("leaves everything as it was when Cancel is pressed", async () => {
    mounted = await mountAccessoryList(accessoryPageOf());
    const dialog = await openDialogFor(DRYING_RACK, RACK_NAME, DEACTIVATE);

    await press(dialogButton(dialog, CANCEL));

    expect(openDialog()).toBeNull();
    expect(setActiveCalls(mounted)).toEqual([]);
    expect(chipsOf(mounted.container, DRYING_RACK)).toEqual([
      roCopy("priceDashboard.chips.active"),
    ]);
  });

  it("says, of kitchens that could not be counted, that nothing is changed, in the accessory's words, and never a count", async () => {
    mounted = await mountAccessoryList(accessoryPageOf());
    mounted.lifecycle.answerNextUsageWith({ kind: "unavailable" });

    const dialog = await openDialogFor(DRYING_RACK, RACK_NAME, DEACTIVATE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usageUnavailableAccessory"),
    );
    expect(dialog.textContent).not.toMatch(OPTION);
    expect(dialog.textContent).not.toMatch(/\d/);
    await press(dialogButton(dialog, DEACTIVATE_CONFIRM));
    expect(setActiveCalls(mounted)).toEqual([]);
  });

  it("says the kitchens are being counted in the accessory's words while the reader answers", async () => {
    mounted = await mountAccessoryList(accessoryPageOf());
    const release = mounted.lifecycle.holdNextUsage();
    await openMenuOf(mounted.container, DRYING_RACK, RACK_NAME);

    await press(menuEntry(mounted.container, DRYING_RACK, DEACTIVATE));

    expect(mounted.container.textContent).toContain(
      roCopy("priceDashboard.lifecycle.countingAccessory"),
    );
    expect(mounted.container.textContent).not.toContain(
      roCopy("priceDashboard.lifecycle.counting"),
    );
    release();
    await flushPromises(5);
  });
});

describe("switching an accessory on", () => {
  it("asks in the accessory's words and switches it on at once, with no write to the draft", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ disabled: [accessoryItem(DRYING_RACK)] }),
    );

    const dialog = await openDialogFor(DRYING_RACK, RACK_NAME, ACTIVATE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.activateAccessoryBody"),
    );
    expect(dialog.textContent).not.toContain(
      roCopy("priceDashboard.lifecycle.activateBody"),
    );
    expect(dialog.textContent).not.toMatch(OPTION);
    await press(
      dialogButton(dialog, roCopy("priceDashboard.lifecycle.activateConfirm")),
    );
    expect(setActiveCalls(mounted)).toEqual([
      {
        kind: "setActive",
        request: {
          expectedRevision: "1",
          item: accessoryItem(DRYING_RACK),
          active: true,
        },
      },
    ]);
    expect(mounted.draftServer.calls).toEqual([]);
    expect(chipsOf(mounted.container, DRYING_RACK)).toEqual([
      roCopy("priceDashboard.chips.active"),
    ]);
  });
});

describe("deleting a linked accessory the book holds", () => {
  it("is blocked, in the accessory's words, while a saved kitchen uses it, with the way on that switches it off", async () => {
    mounted = await mountAccessoryList(accessoryPageOf({ linked }));

    const dialog = await openDialogFor(PUBLISHED, PUBLISHED_RULE.name, DELETE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedAccessoryBody", {
        name: PUBLISHED_RULE.name,
        count: 4,
      }),
    );
    expect(dialog.textContent).not.toMatch(OPTION);
    expect(mounted.draftServer.calls).toEqual([]);
    expect(
      dialogButton(
        dialog,
        roCopy("priceDashboard.lifecycle.deactivateInstead"),
      ),
    ).toBeDefined();
  });

  it("is a change of the draft when no saved kitchen uses it, which publishing then carries out", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({
        linked,
        usage: USAGE.map((held) => ({ ...held, designCount: 0 })),
      }),
    );
    const dialog = await openDialogFor(PUBLISHED, PUBLISHED_RULE.name, DELETE);
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBody"),
    );

    await press(dialogButton(dialog, DELETE));

    expect(mounted.draftServer.calls).toMatchObject([
      {
        kind: "change",
        request: {
          change: {
            address: { kind: "item-deleted", item: accessoryItem(PUBLISHED) },
            value: true,
          },
        },
      },
    ]);
    expect(rowOf(mounted.container, PUBLISHED).textContent).toContain(
      roCopy("priceDashboard.accessories.deleteNotice"),
    );
  });
});

describe("deleting an accessory only the draft holds", () => {
  it("counts no kitchen, says it was never published, and takes the creation back out of the draft", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ changes: CREATED_ACCESSORY }),
    );
    const pendingBefore = pendingChipText(mounted.container);

    const dialog = await openDialogFor(CREATED, CREATED_NAME, DELETE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteCreatedAccessoryBody"),
    );
    expect(dialog.textContent).not.toMatch(OPTION);
    expect(
      mounted.lifecycle.calls.filter((call) => call.kind === "readUsage"),
    ).toEqual([]);
    await press(dialogButton(dialog, DELETE));

    expect(mounted.draftServer.calls).toMatchObject([
      {
        kind: "revert",
        request: {
          target: {
            kind: "change",
            address: { kind: "accessory-created", accessoryId: CREATED },
          },
        },
      },
    ]);
    expect(mounted.draftServer.state().draft.changes).toEqual([]);
    expect(
      Array.from(
        mounted.container.querySelectorAll('[data-testid="accessory-row"]'),
      ).map((row) => (row as HTMLElement).dataset.accessoryId),
    ).toEqual([SINK_COVER, DRYING_RACK]);
    expect(pendingChipText(mounted.container)).not.toBe(pendingBefore);
  });

  it("takes everything the draft holds of the accessory with it: its price and its new name leave with the creation, and the draft still applies", async () => {
    const follow: DraftChange[] = [
      {
        address: {
          kind: "accessory",
          accessoryId: CREATED,
          field: "perUnitMinor",
        },
        value: 9_000,
      },
      {
        address: {
          kind: "created-row-text",
          item: accessoryItem(CREATED) as never,
          field: "name",
        },
        value: "Alt nume",
      },
    ];
    mounted = await mountAccessoryList(
      accessoryPageOf({ changes: [...CREATED_ACCESSORY, ...follow] }),
    );
    const dialog = await openDialogFor(CREATED, "Alt nume", DELETE);

    await press(dialogButton(dialog, DELETE));

    expect(mounted.draftServer.state().draft.changes).toEqual([]);
    expect(rowOf(mounted.container, SINK_COVER)).toBeDefined();
  });
});
