// @vitest-environment happy-dom
//
// Disabling and enabling a hardware class (frames D4E and D5G's block) and deleting one (D4D): each is asked in a dialog that
// opens on its safe button, a switch applies at once and is no entry of "De publicat", and a refusal, a failure, a count that
// cannot be had and an answer that comes late each leave the screen as it was.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn } from "../support/render-with-intl";
import {
  BLUM,
  HETTICH,
  STANDARD,
  dialogButton,
  dialogButtons,
  hardwareItem,
  hardwarePageOf,
  menuEntry,
  mountHardwareList,
  openDialog,
  openMenuOf,
  pendingChipText,
  press,
  rowOf,
  type MountedHardware,
} from "./hardware-harness";
import { flushPromises } from "../support/render-hook";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const STANDARD_NAME = roCopy("priceBook.hardware.standard.name");
const HETTICH_NAME = "Hettich";
const BLUM_NAME = "Blum";
const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
const ACTIVATE = roCopy("priceDashboard.common.activate");
const CANCEL = roCopy("priceDashboard.common.cancel");
/** What a deletion says of publication; a switch applies at once and its dialogs never say it. */
const TAKES_EFFECT_AT_PUBLISH = /intr. .n vigoare c.nd publici/iu;
const chipsOf = (container: HTMLElement, tierId: string) =>
  allIn(rowOf(container, tierId), '[data-testid="hardware-chip"]').map(
    (chip) => chip.textContent,
  );

const readUsageCalls = (screen: MountedHardware): number =>
  screen.lifecycle.calls.filter((call) => call.kind === "readUsage").length;

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

async function openDialogFor(
  tierId: string,
  name: string,
  entryWords: string,
  options: { readonly focusesOnPress?: boolean } = {},
): Promise<HTMLElement> {
  const screen = mounted;
  if (screen === undefined) throw new Error("nothing is mounted");
  await openMenuOf(screen.container, tierId, name);
  const entry = menuEntry(screen.container, tierId, entryWords);
  if (options.focusesOnPress !== false) entry.focus();
  await press(entry);
  const dialog = openDialog();
  if (dialog === null) throw new Error("no dialog opened");
  return dialog;
}

describe("disabling a class kitchens use", () => {
  it("asks first, with the count, what customers can no longer do, that it applies now, and what remains, and opens on Cancel", async () => {
    mounted = await mountHardwareList(hardwarePageOf());

    const dialog = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);

    expect(dialog.getAttribute("role")).toBe("alertdialog");
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deactivateTitle", {
        name: HETTICH_NAME,
      }),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usedBy", { count: 14 }),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.replacementExplained"),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.appliesImmediately"),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.remaining", {
        options: `${STANDARD_NAME}, ${BLUM_NAME}`,
      }),
    );
    expect(document.activeElement).toBe(dialogButton(dialog, CANCEL));
  });

  it("never says it takes effect when publishing, in the dialog that disables or the one that enables", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ disabled: [hardwareItem(BLUM)] }),
    );

    const disabling = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);
    const disablingText = disabling.textContent;
    await press(dialogButton(disabling, CANCEL));
    const enabling = await openDialogFor(BLUM, BLUM_NAME, ACTIVATE);

    expect(disablingText).not.toMatch(TAKES_EFFECT_AT_PUBLISH);
    expect(enabling.textContent).not.toMatch(TAKES_EFFECT_AT_PUBLISH);
  });

  it("leaves out the line about use, and the replacement it would explain, for a class no kitchen uses", async () => {
    mounted = await mountHardwareList(hardwarePageOf());

    const dialog = await openDialogFor(BLUM, BLUM_NAME, DEACTIVATE);

    expect(dialog.textContent).not.toContain(
      roCopy("priceDashboard.lifecycle.replacementExplained"),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.clientsCannotChoose"),
    );
  });

  it("takes effect on confirming without a single write to the draft, and the pending count does not move", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const pendingBefore = pendingChipText(mounted.container);
    const dialog = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);

    await press(
      dialogButton(
        dialog,
        roCopy("priceDashboard.lifecycle.deactivateConfirm"),
      ),
    );

    expect(
      mounted.lifecycle.calls.filter((call) => call.kind === "setActive"),
    ).toEqual([
      {
        kind: "setActive",
        request: {
          expectedRevision: "1",
          item: hardwareItem(HETTICH),
          active: false,
        },
      },
    ]);
    expect(mounted.draftServer.calls).toEqual([]);
    expect(chipsOf(mounted.container, HETTICH)).toEqual([
      roCopy("priceDashboard.chips.inactive"),
    ]);
    expect(pendingChipText(mounted.container)).toBe(pendingBefore);
    expect(openDialog()).toBeNull();
  });

  it("sends the revision the last write answered, so a second switch is not a stale one", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const first = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);
    await press(
      dialogButton(first, roCopy("priceDashboard.lifecycle.deactivateConfirm")),
    );

    const second = await openDialogFor(BLUM, BLUM_NAME, DEACTIVATE);
    await press(
      dialogButton(
        second,
        roCopy("priceDashboard.lifecycle.deactivateConfirm"),
      ),
    );

    expect(
      mounted.lifecycle.calls.flatMap((call) =>
        call.kind === "setActive" ? [call.request.expectedRevision] : [],
      ),
    ).toEqual(["1", "2"]);
    expect(chipsOf(mounted.container, BLUM)).toEqual([
      roCopy("priceDashboard.chips.inactive"),
    ]);
  });

  it("leaves everything as it was when Cancel is pressed, and puts focus back on the entry that opened it", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);

    await press(dialogButton(dialog, CANCEL));

    expect(openDialog()).toBeNull();
    expect(
      mounted.lifecycle.calls.filter((call) => call.kind === "setActive"),
    ).toEqual([]);
    expect(chipsOf(mounted.container, HETTICH)).toEqual([
      roCopy("priceDashboard.chips.active"),
    ]);
    expect(document.activeElement).toBe(
      menuEntry(mounted.container, HETTICH, DEACTIVATE),
    );
  });
});

describe("where focus goes when a dialog closes", () => {
  it("goes to the page's heading where the press did not focus the entry, as Safari and Firefox do not", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE, {
      focusesOnPress: false,
    });

    await press(dialogButton(dialog, CANCEL));

    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="hardware-list"] h1'),
    );
  });
});

describe("a switch that is not written", () => {
  it("keeps the dialog open with the server's refusal in the words of the default, and the class active", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);
    mounted.lifecycle.answerNextWriteWith({
      kind: "refused",
      code: "item-is-default",
    });

    await press(
      dialogButton(
        dialog,
        roCopy("priceDashboard.lifecycle.deactivateConfirm"),
      ),
    );

    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.defaultCannotChange"),
    );
    expect(chipsOf(mounted.container, HETTICH)).toEqual([
      roCopy("priceDashboard.chips.active"),
    ]);
  });

  it("tells a fixed default apart from a saved one when the server refuses it", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);
    mounted.lifecycle.answerNextWriteWith({
      kind: "refused",
      code: "item-is-fixed-default",
    });

    await press(
      dialogButton(
        dialog,
        roCopy("priceDashboard.lifecycle.deactivateConfirm"),
      ),
    );

    const text = openDialog()?.textContent ?? "";
    expect(text).toContain(
      roCopy("priceDashboard.lifecycle.fixedDefaultCannotChange"),
    );
    expect(text).not.toContain(
      roCopy("priceDashboard.lifecycle.defaultCannotChange"),
    );
  });

  it("closes the dialog after a conflict and says the data changed, and the next question is asked of what was read, and counted again", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);
    await mounted.lifecycle.writeBehindTheScreen({
      item: hardwareItem(BLUM),
      active: false,
    });
    const countsBefore = readUsageCalls(mounted);

    await press(
      dialogButton(
        dialog,
        roCopy("priceDashboard.lifecycle.deactivateConfirm"),
      ),
    );

    expect(openDialog()).toBeNull();
    expect(
      allIn(mounted.container, '[role="alert"]').map(
        (alert) => alert.textContent,
      ),
    ).toEqual([roCopy("priceDashboard.errors.changedMeanwhile")]);
    expect(
      mounted.lifecycle.calls.some((call) => call.kind === "readAvailability"),
    ).toBe(true);
    expect(chipsOf(mounted.container, BLUM)).toEqual([
      roCopy("priceDashboard.chips.inactive"),
    ]);
    expect(chipsOf(mounted.container, HETTICH)).toEqual([
      roCopy("priceDashboard.chips.active"),
    ]);

    // The menu that asked is still open: the same entry asks again.
    await press(menuEntry(mounted.container, HETTICH, DEACTIVATE));
    const asked = openDialog();

    expect(asked?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.remaining", { options: STANDARD_NAME }),
    );
    expect(readUsageCalls(mounted)).toBe(countsBefore + 1);
    expect(
      allIn(mounted.container, '[role="alert"]'),
      "asking again clears the notice",
    ).toEqual([]);
  });

  it("says the saved kitchens are being counted while they are, with no dialog yet, and opens the dialog when the count is in", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const release = mounted.lifecycle.holdNextUsage();
    await openMenuOf(mounted.container, HETTICH, HETTICH_NAME);

    await press(menuEntry(mounted.container, HETTICH, DEACTIVATE));

    expect(openDialog()).toBeNull();
    expect(mounted.container.textContent).toContain(
      roCopy("priceDashboard.lifecycle.counting"),
    );

    release();
    await act(async () => {
      await flushPromises(10);
    });

    expect(openDialog()).not.toBeNull();
    expect(mounted.container.textContent).not.toContain(
      roCopy("priceDashboard.lifecycle.counting"),
    );
  });

  it("says the save failed and leaves the class active when the request fails, and the press can be made again", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);
    mounted.lifecycle.answerNextWriteWith({ kind: "failed" });
    const confirm = roCopy("priceDashboard.lifecycle.deactivateConfirm");

    await press(dialogButton(dialog, confirm));

    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.errors.saveFailed"),
    );
    expect(chipsOf(mounted.container, HETTICH)).toEqual([
      roCopy("priceDashboard.chips.active"),
    ]);

    await press(dialogButton(dialog, confirm));

    expect(chipsOf(mounted.container, HETTICH)).toEqual([
      roCopy("priceDashboard.chips.inactive"),
    ]);
  });

  it("sends nothing and claims nothing about use where the saved kitchens cannot be counted", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    mounted.lifecycle.answerNextUsageWith({ kind: "unavailable" });

    const dialog = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);
    const confirm = dialogButton(
      dialog,
      roCopy("priceDashboard.lifecycle.deactivateConfirm"),
    );
    await press(confirm);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usageUnavailable"),
    );
    expect(dialog.textContent).not.toContain(
      roCopy("priceDashboard.lifecycle.usedBy", { count: 0 }),
    );
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(chipsOf(mounted.container, HETTICH)).toEqual([
      roCopy("priceDashboard.chips.active"),
    ]);
  });

  it("shows no count a counter did not give: a class the reader left out is uncounted, never read as unused", async () => {
    mounted = await mountHardwareList(hardwarePageOf({ usage: [] }));

    const dialog = await openDialogFor(BLUM, BLUM_NAME, DEACTIVATE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usageUnavailable"),
    );
  });
});

describe("a count that names no number for the class asked about", () => {
  it("is uncounted where the reader answers counted with an entry for no class, never read as none", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    mounted.lifecycle.answerNextUsageWith({ kind: "counted", counts: [] });

    const dialog = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usageUnavailable"),
    );
  });

  it("is uncounted where the reader counts a class twice, since which count is true is unknown", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    mounted.lifecycle.answerNextUsageWith({
      kind: "counted",
      counts: [
        { item: hardwareItem(HETTICH), designCount: 3 },
        { item: hardwareItem(HETTICH), designCount: 3 },
      ],
    });

    const dialog = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usageUnavailable"),
    );
  });
});

describe("an answer that arrives late", () => {
  it("is dropped when the person has asked about another class since: the dialog is the second class's", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    await openMenuOf(mounted.container, HETTICH, HETTICH_NAME);
    const releaseFirst = mounted.lifecycle.holdNextUsage();
    await press(menuEntry(mounted.container, HETTICH, DEACTIVATE));
    await openMenuOf(mounted.container, BLUM, BLUM_NAME);
    await press(menuEntry(mounted.container, BLUM, DEACTIVATE));
    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deactivateTitle", { name: BLUM_NAME }),
    );

    releaseFirst();
    await act(async () => {
      await flushPromises(10);
    });

    const text = openDialog()?.textContent ?? "";
    expect(text).toContain(
      roCopy("priceDashboard.lifecycle.deactivateTitle", { name: BLUM_NAME }),
    );
    expect(text).not.toContain(
      roCopy("priceDashboard.lifecycle.deactivateTitle", {
        name: HETTICH_NAME,
      }),
    );
  });
});

describe("the last class that is on", () => {
  it("opens a block with one button, the close button, where focus starts, and writes nothing", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ disabled: [hardwareItem(HETTICH), hardwareItem(BLUM)] }),
    );

    const dialog = await openDialogFor(STANDARD, STANDARD_NAME, DEACTIVATE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.lastActiveBody"),
    );
    expect(dialogButtons(dialog).map((button) => button.textContent)).toEqual([
      roCopy("priceDashboard.common.close"),
    ]);
    expect(document.activeElement).toBe(
      dialogButton(dialog, roCopy("priceDashboard.common.close")),
    );
    await press(dialogButton(dialog, roCopy("priceDashboard.common.close")));
    expect(openDialog()).toBeNull();
    expect(
      mounted.lifecycle.calls.filter((call) => call.kind === "setActive"),
    ).toEqual([]);
  });

  it("is judged as the last before it is judged a default: the fallback class says keep one active, not that it is a default", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ disabled: [hardwareItem(HETTICH), hardwareItem(BLUM)] }),
    );

    await openMenuOf(mounted.container, STANDARD, STANDARD_NAME);

    const entry = menuEntry(mounted.container, STANDARD, DEACTIVATE);
    expect(entry.getAttribute("aria-disabled")).toBeNull();
  });
});

describe("enabling a switched-off class", () => {
  it("asks, opens on Cancel, writes at once on confirming and leaves the draft alone", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ disabled: [hardwareItem(BLUM)] }),
    );
    const dialog = await openDialogFor(BLUM, BLUM_NAME, ACTIVATE);
    expect(document.activeElement).toBe(dialogButton(dialog, CANCEL));

    await press(
      dialogButton(dialog, roCopy("priceDashboard.lifecycle.activateConfirm")),
    );

    expect(
      mounted.lifecycle.calls.filter((call) => call.kind === "setActive"),
    ).toEqual([
      {
        kind: "setActive",
        request: {
          expectedRevision: "1",
          item: hardwareItem(BLUM),
          active: true,
        },
      },
    ]);
    expect(mounted.draftServer.calls).toEqual([]);
    expect(chipsOf(mounted.container, BLUM)).toEqual([
      roCopy("priceDashboard.chips.active"),
    ]);
  });
});
