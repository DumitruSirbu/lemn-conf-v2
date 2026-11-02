// @vitest-environment happy-dom
//
// Deleting a hardware class (frames D4D and D4F): a deletion changes the book's rows, so it is a change of "De publicat" that
// takes effect at publish; a class any saved kitchen uses cannot be deleted and offers the switch-off instead; and where the
// saved kitchens cannot be counted nothing is claimed and nothing is sent.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UNAVAILABLE_ITEM_LIFECYCLE_CLIENT } from "@/price-dashboard/item-lifecycle-client";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn } from "../support/render-with-intl";
import {
  BLUM,
  CREATED,
  CREATED_CLASS,
  HETTICH,
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
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const HETTICH_NAME = "Hettich";
const BLUM_NAME = "Blum";
const DELETE = roCopy("priceDashboard.common.delete");
const CANCEL = roCopy("priceDashboard.common.cancel");
const CLOSE = roCopy("priceDashboard.common.close");

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

async function openDeleteFor(
  tierId: string,
  name: string,
): Promise<HTMLElement> {
  const screen = mounted;
  if (screen === undefined) throw new Error("nothing is mounted");
  await openMenuOf(screen.container, tierId, name);
  const entry = menuEntry(screen.container, tierId, DELETE);
  entry.focus();
  await press(entry);
  const dialog = openDialog();
  if (dialog === null) throw new Error("no dialog opened");
  return dialog;
}

describe("deleting a class no kitchen uses", () => {
  it("asks, says it waits for publication, and opens on Cancel", async () => {
    mounted = await mountHardwareList(hardwarePageOf());

    const dialog = await openDeleteFor(BLUM, BLUM_NAME);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteTitle", { name: BLUM_NAME }),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBody"),
    );
    expect(document.activeElement).toBe(dialogButton(dialog, CANCEL));
    expect(mounted.draftServer.calls).toEqual([]);
  });

  it("puts the deletion in the draft on confirming, as one change, and writes no availability", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const pendingBefore = pendingChipText(mounted.container);
    const dialog = await openDeleteFor(BLUM, BLUM_NAME);

    await press(dialogButton(dialog, DELETE));

    expect(mounted.draftServer.calls).toEqual([
      {
        kind: "change",
        request: {
          expectedDraftRevision: "1",
          change: {
            address: { kind: "item-deleted", item: hardwareItem(BLUM) },
            value: true,
          },
        },
      },
    ]);
    expect(
      mounted.lifecycle.calls.filter((call) => call.kind === "setActive"),
    ).toEqual([]);
    expect(pendingChipText(mounted.container)).not.toBe(pendingBefore);
    expect(rowOf(mounted.container, BLUM).textContent).toContain(
      roCopy("priceDashboard.hardware.deleteNotice"),
    );
    expect(openDialog()).toBeNull();
  });

  it("sends nothing when Cancel is pressed", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeleteFor(BLUM, BLUM_NAME);

    await press(dialogButton(dialog, CANCEL));

    expect(mounted.draftServer.calls).toEqual([]);
    expect(openDialog()).toBeNull();
  });

  it.each([
    [
      "a refusal that it is a default",
      { kind: "refused", code: "ITEM_IS_DEFAULT" } as const,
      roCopy("priceDashboard.lifecycle.defaultCannotChange"),
    ],
    [
      "a conflict",
      { kind: "conflict" } as const,
      roCopy("priceDashboard.errors.changedMeanwhile"),
    ],
    [
      "a failure",
      { kind: "failed" } as const,
      roCopy("priceDashboard.errors.saveFailed"),
    ],
  ])(
    "keeps the dialog open and the class as it was on %s",
    async (_name, answer, words) => {
      mounted = await mountHardwareList(hardwarePageOf());
      const dialog = await openDeleteFor(BLUM, BLUM_NAME);
      mounted.draftServer.answerNextWriteWith(answer);

      await press(dialogButton(dialog, DELETE));

      expect(openDialog()?.textContent).toContain(words);
      expect(rowOf(mounted.container, BLUM).textContent).not.toContain(
        roCopy("priceDashboard.hardware.deleteNotice"),
      );
    },
  );
});

describe("deleting a class kitchens use", () => {
  it("blocks it, with the count, and offers the switch-off instead, opening on Cancel", async () => {
    mounted = await mountHardwareList(hardwarePageOf());

    const dialog = await openDeleteFor(HETTICH, HETTICH_NAME);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedBody", {
        name: HETTICH_NAME,
        count: 14,
      }),
    );
    expect(dialogButtons(dialog).map((button) => button.textContent)).toEqual([
      roCopy("priceDashboard.lifecycle.deactivateInstead"),
      CANCEL,
    ]);
    expect(document.activeElement).toBe(dialogButton(dialog, CANCEL));
    expect(mounted.draftServer.calls).toEqual([]);
  });

  it("goes on to the switch-off dialog with the count it already has, and counts nothing again", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeleteFor(HETTICH, HETTICH_NAME);

    await press(
      dialogButton(
        dialog,
        roCopy("priceDashboard.lifecycle.deactivateInstead"),
      ),
    );

    const next = openDialog();
    expect(next?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deactivateTitle", {
        name: HETTICH_NAME,
      }),
    );
    expect(next?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usedBy", { count: 14 }),
    );
    expect(
      mounted.lifecycle.calls.filter((call) => call.kind === "readUsage"),
    ).toHaveLength(1);
  });

  it("only closes where the class is already switched off, and does not suggest switching it off", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ disabled: [hardwareItem(HETTICH)] }),
    );

    const dialog = await openDeleteFor(HETTICH, HETTICH_NAME);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedInactiveBody", {
        name: HETTICH_NAME,
      }),
    );
    expect(dialogButtons(dialog).map((button) => button.textContent)).toEqual([
      CLOSE,
    ]);
    expect(document.activeElement).toBe(dialogButton(dialog, CLOSE));
  });
});

describe("deleting a class only the draft holds", () => {
  it("counts nothing, since nothing published names it, and says it only leaves De publicat", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ changes: CREATED_CLASS }),
    );

    const dialog = await openDeleteFor(CREATED, "GTV Economic");

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteCreatedBody"),
    );
    expect(dialog.textContent).not.toContain(
      roCopy("priceDashboard.lifecycle.deleteBody"),
    );
    expect(
      mounted.lifecycle.calls.filter((call) => call.kind === "readUsage"),
    ).toEqual([]);
    expect(document.activeElement).toBe(dialogButton(dialog, CANCEL));
  });

  it("takes the creation back out of the draft on confirming, as one revert, so nothing is left to publish", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ changes: CREATED_CLASS }),
    );
    const dialog = await openDeleteFor(CREATED, "GTV Economic");

    await press(dialogButton(dialog, DELETE));

    expect(mounted.draftServer.calls).toEqual([
      {
        kind: "revert",
        request: {
          expectedDraftRevision: "1",
          target: {
            kind: "change",
            address: { kind: "hardware-tier-created", tierId: CREATED },
          },
        },
      },
    ]);
    expect(mounted.draftServer.state().draft.changes).toEqual([]);
    expect(() => rowOf(mounted?.container ?? document.body, CREATED)).toThrow();
    expect(openDialog()).toBeNull();
  });

  it("is judged by the same refusals: a failed revert leaves the class in the list", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ changes: CREATED_CLASS }),
    );
    const dialog = await openDeleteFor(CREATED, "GTV Economic");
    mounted.draftServer.answerNextWriteWith({ kind: "failed" });

    await press(dialogButton(dialog, DELETE));

    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.errors.saveFailed"),
    );
    expect(rowOf(mounted.container, CREATED)).toBeDefined();
  });
});

describe("where the saved kitchens cannot be counted", () => {
  it("claims nothing, leaves the confirmation off and sends nothing", async () => {
    mounted = await mountHardwareList(hardwarePageOf(), {
      lifecycleClient: UNAVAILABLE_ITEM_LIFECYCLE_CLIENT,
    });

    const dialog = await openDeleteFor(BLUM, BLUM_NAME);
    const confirm = dialogButton(dialog, DELETE);
    await press(confirm);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usageUnavailable"),
    );
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(mounted.draftServer.calls).toEqual([]);
    expect(allIn(dialog, '[role="alert"]').length).toBeGreaterThan(0);
  });
});
