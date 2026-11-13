// @vitest-environment happy-dom
//
// Disabling and enabling a material (frames D5C, D5CM and D5G) and deleting one (D5D): each is asked in a dialog that
// opens on its safe button, a switch applies at once and is no entry of "De publicat", the last material that is on
// cannot be switched off, and a count that cannot be had is said so and never read as none. Where the screen cannot
// judge, its controls stay off and no number is made up.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UNAVAILABLE_ITEM_LIFECYCLE_CLIENT } from "@/price-dashboard/item-lifecycle-client";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn } from "../support/render-with-intl";
import {
  chipsOf,
  dialogButton,
  MDF,
  MDF_NAME,
  PAL,
  PAL_NAME,
  VENEER,
  USAGE,
  VENEER_NAME,
  materialItem,
  materialPageOf,
  menuEntry,
  mountMaterialEdit,
  mountMaterialList,
  openDialog,
  openMenuOf,
  pendingChipText,
  press,
  reasonOf,
  rowOf,
  type MountedMaterials,
} from "./material-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
const ACTIVATE = roCopy("priceDashboard.common.activate");
const DELETE = roCopy("priceDashboard.common.delete");
const CANCEL = roCopy("priceDashboard.common.cancel");
const CLOSE = roCopy("priceDashboard.common.close");
const CONFIRM_DEACTIVATE = roCopy("priceDashboard.lifecycle.deactivateConfirm");
const CONFIRM_ACTIVATE = roCopy("priceDashboard.lifecycle.activateConfirm");
const INACTIVE = roCopy("priceDashboard.chips.inactive");
const ACTIVE = roCopy("priceDashboard.chips.active");
/** What a deletion says of publication; a switch applies at once and its dialogs never say it. */
const TAKES_EFFECT_AT_PUBLISH = /intr. .n vigoare c.nd publici/iu;

let mounted: MountedMaterials | undefined;

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
): Promise<HTMLElement> {
  const screen = mounted;
  if (screen === undefined) throw new Error("nothing is mounted");
  await openMenuOf(screen.container, tierId, name);
  const entry = menuEntry(screen.container, tierId, entryWords);
  entry.focus();
  await press(entry);
  const dialog = openDialog();
  if (dialog === null) throw new Error("no dialog opened");
  return dialog;
}

const writesOf = (screen: MountedMaterials) =>
  screen.lifecycle.calls.filter((call) => call.kind === "setActive");

describe("disabling a material kitchens use (D5C)", () => {
  it("asks first, with the count, what customers can no longer do, that it applies now, and what remains, and opens on Cancel", async () => {
    mounted = await mountMaterialList(materialPageOf());

    const dialog = await openDialogFor(MDF, MDF_NAME, DEACTIVATE);

    expect(dialog.getAttribute("role")).toBe("alertdialog");
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deactivateTitle", { name: MDF_NAME }),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usedBy", { count: 23 }),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.replacementExplained"),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.appliesImmediately"),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.remaining", {
        options: `${PAL_NAME}, ${VENEER_NAME}`,
      }),
    );
    expect(document.activeElement).toBe(dialogButton(dialog, CANCEL));
  });

  it("never says it takes effect when publishing, in the dialog that disables or the one that enables", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ disabled: [materialItem(VENEER)] }),
    );

    const disabling = await openDialogFor(MDF, MDF_NAME, DEACTIVATE);
    const disablingText = disabling.textContent;
    await press(dialogButton(disabling, CANCEL));
    const enabling = await openDialogFor(VENEER, VENEER_NAME, ACTIVATE);

    expect(disablingText).not.toMatch(TAKES_EFFECT_AT_PUBLISH);
    expect(enabling.textContent).not.toMatch(TAKES_EFFECT_AT_PUBLISH);
  });

  it("leaves out the line about use, and the replacement it would explain, for a material no kitchen uses", async () => {
    mounted = await mountMaterialList(materialPageOf());

    const dialog = await openDialogFor(VENEER, VENEER_NAME, DEACTIVATE);

    expect(dialog.textContent).not.toContain(
      roCopy("priceDashboard.lifecycle.replacementExplained"),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.clientsCannotChoose"),
    );
  });

  it("takes effect on confirming without a single write to the draft, and the pending count does not move", async () => {
    mounted = await mountMaterialList(materialPageOf());
    const pendingBefore = pendingChipText(mounted.container);
    const dialog = await openDialogFor(MDF, MDF_NAME, DEACTIVATE);

    await press(dialogButton(dialog, CONFIRM_DEACTIVATE));

    expect(writesOf(mounted)).toEqual([
      {
        kind: "setActive",
        request: {
          expectedRevision: "1",
          item: materialItem(MDF),
          active: false,
        },
      },
    ]);
    expect(mounted.draftServer.calls).toEqual([]);
    expect(pendingChipText(mounted.container)).toBe(pendingBefore);
    expect(openDialog()).toBeNull();
  });

  it("then says how many saved kitchens still use the material it switched off", async () => {
    mounted = await mountMaterialList(materialPageOf());
    const dialog = await openDialogFor(MDF, MDF_NAME, DEACTIVATE);

    await press(dialogButton(dialog, CONFIRM_DEACTIVATE));

    expect(chipsOf(mounted.container, MDF)).toEqual([
      roCopy("priceDashboard.chips.inactiveInUse", { count: 23 }),
    ]);
  });

  it("leaves everything as it was when Cancel is pressed, and puts focus back on the entry that opened it", async () => {
    mounted = await mountMaterialList(materialPageOf());
    const dialog = await openDialogFor(MDF, MDF_NAME, DEACTIVATE);

    await press(dialogButton(dialog, CANCEL));

    expect(openDialog()).toBeNull();
    expect(writesOf(mounted)).toEqual([]);
    expect(chipsOf(mounted.container, MDF)).toEqual([ACTIVE]);
    expect(document.activeElement).toBe(
      menuEntry(mounted.container, MDF, DEACTIVATE),
    );
  });

  it("leaves the material active and says so when the server refuses, in the server's words", async () => {
    mounted = await mountMaterialList(materialPageOf());
    const dialog = await openDialogFor(MDF, MDF_NAME, DEACTIVATE);
    mounted.lifecycle.answerNextWriteWith({
      kind: "refused",
      code: "item-is-default",
    });

    await press(dialogButton(dialog, CONFIRM_DEACTIVATE));

    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.defaultCannotChange"),
    );
    expect(chipsOf(mounted.container, MDF)).toEqual([ACTIVE]);
  });

  it("closes after a conflict and says the data changed, the switch another actor made being read", async () => {
    mounted = await mountMaterialList(materialPageOf());
    const dialog = await openDialogFor(MDF, MDF_NAME, DEACTIVATE);
    await mounted.lifecycle.writeBehindTheScreen({
      item: materialItem(VENEER),
      active: false,
    });

    await press(dialogButton(dialog, CONFIRM_DEACTIVATE));

    expect(openDialog()).toBeNull();
    expect(
      allIn(mounted.container, '[role="alert"]').map(
        (alert) => alert.textContent,
      ),
    ).toEqual([roCopy("priceDashboard.errors.changedMeanwhile")]);
    expect(chipsOf(mounted.container, VENEER)).toEqual([INACTIVE]);
    expect(chipsOf(mounted.container, MDF)).toEqual([ACTIVE]);
  });
});

describe("the last material that is on (D5G)", () => {
  it("opens a block with one button, the close button, where focus starts, and writes nothing", async () => {
    mounted = await mountMaterialList(
      materialPageOf({
        disabled: [materialItem(MDF), materialItem(VENEER)],
      }),
    );

    const dialog = await openDialogFor(PAL, PAL_NAME, DEACTIVATE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.lastActiveTitle", { name: PAL_NAME }),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.lastActiveBody"),
    );
    expect(allIn(dialog, "button").map((button) => button.textContent)).toEqual(
      [CLOSE],
    );
    expect(document.activeElement).toBe(dialogButton(dialog, CLOSE));
    await press(dialogButton(dialog, CLOSE));
    expect(openDialog()).toBeNull();
    expect(writesOf(mounted)).toEqual([]);
  });

  it("keeps PAL's switch off, with the fixed default's reason, while another material is on", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ disabled: [materialItem(MDF)] }),
    );
    await openMenuOf(mounted.container, PAL, PAL_NAME);

    const entry = menuEntry(mounted.container, PAL, DEACTIVATE);

    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(reasonOf(entry)).toBe(
      roCopy("priceDashboard.lifecycle.fixedDefaultCannotChange"),
    );
  });

  it("is told from the page's own switch the same way", async () => {
    mounted = await mountMaterialEdit(
      PAL,
      materialPageOf({
        disabled: [materialItem(MDF), materialItem(VENEER)],
      }),
    );
    const switchButton = allIn<HTMLButtonElement>(
      mounted.container,
      '[role="switch"]',
    )[0];
    if (switchButton === undefined) throw new Error("no switch");

    await press(switchButton);

    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.lastActiveBody"),
    );
  });
});

describe("enabling a switched-off material", () => {
  it("asks, opens on Cancel, writes at once on confirming and leaves the draft alone", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ disabled: [materialItem(VENEER)] }),
    );
    const dialog = await openDialogFor(VENEER, VENEER_NAME, ACTIVATE);
    expect(document.activeElement).toBe(dialogButton(dialog, CANCEL));

    await press(dialogButton(dialog, CONFIRM_ACTIVATE));

    expect(writesOf(mounted)).toEqual([
      {
        kind: "setActive",
        request: {
          expectedRevision: "1",
          item: materialItem(VENEER),
          active: true,
        },
      },
    ]);
    expect(mounted.draftServer.calls).toEqual([]);
    expect(chipsOf(mounted.container, VENEER)).toEqual([ACTIVE]);
  });

  it("is asked from the page too: the switch and the banner's button open the same dialog", async () => {
    mounted = await mountMaterialEdit(
      MDF,
      materialPageOf({ disabled: [materialItem(MDF)] }),
    );
    const banner = mounted.container.querySelector<HTMLElement>(
      '[data-testid="material-banner"]',
    );
    const activate = allIn<HTMLButtonElement>(
      banner ?? document.body,
      "button",
    )[0];
    if (activate === undefined) throw new Error("the banner offers no button");

    await press(activate);

    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.activateTitle", { name: MDF_NAME }),
    );
    await press(dialogButton(openDialog() ?? document.body, CONFIRM_ACTIVATE));
    expect(
      mounted.container.querySelector('[data-testid="material-banner"]'),
    ).toBeNull();
    expect(mounted.draftServer.calls).toEqual([]);
  });
});

describe("deleting a material (D5D)", () => {
  it("blocks the deletion of a material saved kitchens use, with the count, and offers to disable it instead", async () => {
    mounted = await mountMaterialList(materialPageOf());

    const dialog = await openDialogFor(MDF, MDF_NAME, DELETE);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedTitle", { name: MDF_NAME }),
    );
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedBody", {
        name: MDF_NAME,
        count: 23,
      }),
    );
    expect(document.activeElement).toBe(dialogButton(dialog, CANCEL));
    await press(
      dialogButton(
        dialog,
        roCopy("priceDashboard.lifecycle.deactivateInstead"),
      ),
    );
    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deactivateTitle", { name: MDF_NAME }),
    );
    expect(mounted.draftServer.calls).toEqual([]);
  });

  it("offers nothing but to close where the material that kitchens use is already off", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ disabled: [materialItem(MDF)] }),
    );

    const dialog = await openDialogFor(MDF, MDF_NAME, DELETE);

    expect(allIn(dialog, "button").map((button) => button.textContent)).toEqual(
      [CLOSE],
    );
  });

  it("asks of a material no kitchen uses, and on confirming puts the deletion in De publicat, which says it waits for publication", async () => {
    mounted = await mountMaterialList(materialPageOf());
    const dialog = await openDialogFor(VENEER, VENEER_NAME, DELETE);
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBody"),
    );

    await press(dialogButton(dialog, DELETE));

    expect(mounted.draftServer.calls).toEqual([
      {
        kind: "change",
        request: {
          expectedDraftRevision: "1",
          change: {
            address: { kind: "item-deleted", item: materialItem(VENEER) },
            value: true,
          },
        },
      },
    ]);
    expect(writesOf(mounted)).toEqual([]);
    expect(rowOf(mounted.container, VENEER).textContent).toContain(
      roCopy("priceDashboard.materials.deleteNotice"),
    );
    expect(openDialog()).toBeNull();
  });

  it("keeps PAL, the default, from being asked about at all", async () => {
    mounted = await mountMaterialList(materialPageOf());
    await openMenuOf(mounted.container, PAL, PAL_NAME);

    const entry = menuEntry(mounted.container, PAL, DELETE);
    await press(entry);

    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(openDialog()).toBeNull();
    expect(mounted.draftServer.calls).toEqual([]);
  });
});

describe("where the screen cannot judge", () => {
  it("keeps every switch and every deletion off, with the reason that it cannot be checked, where the saved defaults could not be read, as a production build leaves them", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ defaults: undefined, usage: undefined }),
      { lifecycleClient: UNAVAILABLE_ITEM_LIFECYCLE_CLIENT },
    );

    for (const [tierId, name] of [
      [MDF, MDF_NAME],
      [VENEER, VENEER_NAME],
    ] as const) {
      await openMenuOf(mounted.container, tierId, name);
      for (const words of [DEACTIVATE, DELETE]) {
        const entry = menuEntry(mounted.container, tierId, words);
        expect(entry.getAttribute("aria-disabled"), `${tierId} ${words}`).toBe(
          "true",
        );
        expect(reasonOf(entry)).toBe(
          roCopy("priceDashboard.lifecycle.cannotJudge"),
        );
        await press(entry);
      }
    }
    expect(openDialog()).toBeNull();
    expect(writesOf(mounted)).toEqual([]);
    expect(mounted.draftServer.calls).toEqual([]);
  });

  it("offers no switch-on where nothing can be written, though the defaults are known", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ disabled: [materialItem(VENEER)] }),
      { lifecycleClient: UNAVAILABLE_ITEM_LIFECYCLE_CLIENT },
    );
    await openMenuOf(mounted.container, VENEER, VENEER_NAME);

    const entry = menuEntry(mounted.container, VENEER, ACTIVATE);

    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(reasonOf(entry)).toBe(
      roCopy("priceDashboard.lifecycle.cannotJudge"),
    );
  });

  it("states no count anywhere, so none is made up", async () => {
    mounted = await mountMaterialList(
      materialPageOf({
        disabled: [materialItem(MDF)],
        defaults: undefined,
        usage: undefined,
      }),
      { lifecycleClient: UNAVAILABLE_ITEM_LIFECYCLE_CLIENT },
    );

    for (const { designCount } of USAGE) {
      expect(mounted.container.textContent).not.toContain(
        roCopy("priceDashboard.chips.inactiveInUse", { count: designCount }),
      );
    }
    expect(chipsOf(mounted.container, MDF)).toEqual([INACTIVE]);
  });

  it("says the saved kitchens could not be counted, and waits, where the reader names no count for a material", async () => {
    mounted = await mountMaterialList(materialPageOf({ usage: [] }));

    const dialog = await openDialogFor(VENEER, VENEER_NAME, DEACTIVATE);
    const confirm = dialogButton(dialog, CONFIRM_DEACTIVATE);
    await press(confirm);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usageUnavailable"),
    );
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(writesOf(mounted)).toEqual([]);
  });
});
