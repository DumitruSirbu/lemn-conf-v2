// @vitest-environment happy-dom
//
// What the hardware screens do when the data is read again after a conflict, and when the server refuses a deletion the
// screen had counted as allowed. A re-read is the whole state, so it replaces what is switched off, but one that names a
// revision the screen already moved on from is an older read and leaves a newer switch alone; a refusal because a saved
// kitchen has come to use the class is a block, never a failed save to try again.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CatalogueAvailability } from "@lemnaria/configurator-domain";

import type { PriceDraftClient } from "@/price-dashboard/price-draft-client";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn } from "../support/render-with-intl";
import {
  BLUM,
  HETTICH,
  dialogButton,
  dialogButtons,
  hardwareItem,
  hardwarePageOf,
  menuEntry,
  mountHardwareList,
  openDialog,
  openMenuOf,
  press,
  rowOf,
  type MountedHardware,
} from "./hardware-harness";
import {
  inMemoryPriceDraftClient,
  type InMemoryPriceDraftClient,
} from "./in-memory-price-draft-client";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const HETTICH_NAME = "Hettich";
const BLUM_NAME = "Blum";
const DELETE = roCopy("priceDashboard.common.delete");
const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
const CONFIRM_SWITCH_OFF = roCopy("priceDashboard.lifecycle.deactivateConfirm");
const SWITCH_OFF_INSTEAD = roCopy("priceDashboard.lifecycle.deactivateInstead");

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

function screen(): MountedHardware {
  if (mounted === undefined) throw new Error("nothing is mounted");
  return mounted;
}

const chipsOf = (tierId: string): (string | null)[] =>
  allIn(rowOf(screen().container, tierId), '[data-testid="hardware-chip"]').map(
    (chip) => chip.textContent,
  );

async function openDialogFor(
  tierId: string,
  name: string,
  words: string,
): Promise<HTMLElement> {
  await openMenuOf(screen().container, tierId, name);
  await press(menuEntry(screen().container, tierId, words));
  const dialog = openDialog();
  if (dialog === null) throw new Error("no dialog opened");
  return dialog;
}

/** A client whose every read is a new object, as a read over the wire is, holding what `availabilityOf` says of what is
 *  switched off. */
function rereadingAs(
  server: InMemoryPriceDraftClient,
  availabilityOf: (held: CatalogueAvailability) => CatalogueAvailability,
): PriceDraftClient {
  return {
    ...server.client,
    readState: async () => {
      const state = await server.client.readState();
      return state === undefined
        ? undefined
        : {
            ...state,
            active: {
              ...state.active,
              availability: availabilityOf(state.active.availability),
            },
          };
    },
  };
}

describe("what is switched off after the draft is read again", () => {
  it("keeps a switch the screen wrote when the read that answers a conflict still holds the revision before it", async () => {
    const page = hardwarePageOf();
    const server = inMemoryPriceDraftClient(page.state);
    const draftClient = rereadingAs(server, (held) => ({ ...held }));
    mounted = await mountHardwareList(page, { draftClient });
    const switchOff = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);
    await press(dialogButton(switchOff, CONFIRM_SWITCH_OFF));
    expect(chipsOf(HETTICH)).toContain(roCopy("priceDashboard.chips.inactive"));
    server.moveDraftBehindTheScreen();

    const deletion = await openDialogFor(BLUM, BLUM_NAME, DELETE);
    await press(dialogButton(deletion, DELETE));

    expect(server.calls.map((call) => call.kind)).toContain("readState");
    expect(chipsOf(HETTICH)).toContain(roCopy("priceDashboard.chips.inactive"));
  });

  it("draws what a read of a newer revision holds, a class switched off by someone else included", async () => {
    const page = hardwarePageOf();
    const server = inMemoryPriceDraftClient(page.state);
    const draftClient = rereadingAs(server, () => ({
      revision: "9",
      disabled: [hardwareItem(BLUM)],
    }));
    mounted = await mountHardwareList(page, { draftClient });
    server.moveDraftBehindTheScreen();

    const dialog = await openDialogFor(HETTICH, HETTICH_NAME, DEACTIVATE);
    await press(dialogButton(dialog, CONFIRM_SWITCH_OFF));
    const deletion = await openDialogFor(BLUM, BLUM_NAME, DELETE);
    await press(dialogButton(deletion, DELETE));

    expect(chipsOf(BLUM)).toContain(roCopy("priceDashboard.chips.inactive"));
    expect(chipsOf(HETTICH)).toContain(roCopy("priceDashboard.chips.active"));
  });
});

describe("a deletion the server refuses because a saved kitchen came to use the class", () => {
  async function refusedDeletionOf(
    tierId: string,
    name: string,
  ): Promise<HTMLElement> {
    const dialog = await openDialogFor(tierId, name, DELETE);
    screen().draftServer.answerNextWriteWith({
      kind: "refused",
      code: "ITEM_IN_USE",
    });
    await press(dialogButton(dialog, DELETE));
    const answered = openDialog();
    if (answered === null) throw new Error("the dialog closed");
    return answered;
  }

  it("says the class is in use and offers the switch-off instead, without a Delete that could be pressed again", async () => {
    mounted = await mountHardwareList(hardwarePageOf());

    const dialog = await refusedDeletionOf(BLUM, BLUM_NAME);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedUncountedBody", {
        name: BLUM_NAME,
      }),
    );
    expect(dialogButtons(dialog).map((button) => button.textContent)).toEqual([
      SWITCH_OFF_INSTEAD,
      roCopy("priceDashboard.common.cancel"),
    ]);
  });

  it("counts the kitchens when the switch-off is taken, since the refusal gave no number", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await refusedDeletionOf(BLUM, BLUM_NAME);
    const asked = (): number =>
      screen().lifecycle.calls.filter((call) => call.kind === "readUsage")
        .length;
    const askedBefore = asked();

    await press(dialogButton(dialog, SWITCH_OFF_INSTEAD));

    expect(asked()).toBe(askedBefore + 1);
    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.clientsCannotChoose"),
    );
  });

  it("says only that the class stays where it is already switched off, and offers a close", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ disabled: [hardwareItem(BLUM)] }),
    );

    const dialog = await refusedDeletionOf(BLUM, BLUM_NAME);

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedInactiveBody", {
        name: BLUM_NAME,
      }),
    );
    expect(dialogButtons(dialog).map((button) => button.textContent)).toEqual([
      roCopy("priceDashboard.common.close"),
    ]);
  });
});
