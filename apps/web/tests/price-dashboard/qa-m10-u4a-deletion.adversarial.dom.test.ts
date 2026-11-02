// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U4a, the deletion of a class as the server may answer it, and two classes that read alike. The wave's
// tests answer a deletion with what the in-memory draft judges; a real draft route answers `ITEM_IN_USE` (a saved kitchen began
// to use the class between the count and the confirmation: `DRAFT_CHANGE_REFUSAL_CODES`), a conflict, and a refusal of the
// candidate, and each must leave the dialog saying something true. Nothing in the domain forbids two classes of one name.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import {
  BLUM,
  CREATED,
  CREATED_CLASS,
  HETTICH,
  dialogButton,
  hardwarePageOf,
  menuEntry,
  mountHardwareList,
  openDialog,
  openMenuOf,
  press,
  rowOf,
  type MountedHardware,
} from "./hardware-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";
import { allIn } from "../support/render-with-intl";

const BLUM_NAME = "Blum";
const DELETE = roCopy("priceDashboard.common.delete");
const SAVE_FAILED = roCopy("priceDashboard.errors.saveFailed");
const CHANGED_MEANWHILE = roCopy("priceDashboard.errors.changedMeanwhile");

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

async function openDeletionOf(
  tierId: string,
  name: string,
): Promise<HTMLElement> {
  await openMenuOf(screen().container, tierId, name);
  const entry = menuEntry(screen().container, tierId, DELETE);
  entry.focus();
  await press(entry);
  const dialog = openDialog();
  if (dialog === null) throw new Error("no dialog opened");
  return dialog;
}

describe("a deletion the server refuses", () => {
  it("is not told as a failed save to try again where a saved kitchen has come to use the class, which no retry can change", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeletionOf(BLUM, BLUM_NAME);
    screen().draftServer.answerNextWriteWith({
      kind: "refused",
      code: "ITEM_IN_USE",
    });

    await press(dialogButton(dialog, DELETE));

    expect(openDialog()).not.toBeNull();
    expect(openDialog()?.textContent).not.toContain(SAVE_FAILED);
  });

  it("says the data changed after a conflict, reads the draft again, and the next confirmation is the one that is written", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeletionOf(BLUM, BLUM_NAME);
    screen().draftServer.moveDraftBehindTheScreen();

    await press(dialogButton(dialog, DELETE));
    expect(openDialog()?.textContent).toContain(CHANGED_MEANWHILE);
    await press(dialogButton(dialog, DELETE));

    expect(openDialog()).toBeNull();
    expect(
      screen()
        .draftServer.state()
        .draft.changes.map((change) => change.address.kind),
    ).toEqual(["item-deleted"]);
  });

  it("says the save failed, and writes nothing, where the draft no longer makes a book", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeletionOf(BLUM, BLUM_NAME);
    screen().draftServer.answerNextWriteWith({ kind: "candidate-refused" });

    await press(dialogButton(dialog, DELETE));

    expect(openDialog()?.textContent).toContain(SAVE_FAILED);
    expect(screen().draftServer.state().draft.changes).toEqual([]);
  });
});

describe("two classes that carry one name", () => {
  const SECOND = "hardware.second-hettich";
  const CREATES_A_HETTICH: readonly DraftChange[] = [
    {
      address: { kind: "hardware-tier-created", tierId: SECOND },
      value: { name: "Hettich", description: "" },
    },
    ...(
      [
        "perHingeMinor",
        "perDrawerMinor",
        "perPushToOpenMinor",
        "perLiftMinor",
      ] as const
    ).map(
      (field): DraftChange => ({
        address: { kind: "hardware", tierId: SECOND, field },
        value: 1_000,
      }),
    ),
  ];

  it("both stand in the list, each with its own actions: deleting the new one takes out the new one", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ changes: CREATES_A_HETTICH }),
    );
    const namesOf = () =>
      allIn(screen().container, '[data-testid="hardware-link"]').map(
        (link) => link.textContent,
      );
    expect(namesOf().filter((name) => name === "Hettich")).toHaveLength(2);
    expect(rowOf(screen().container, HETTICH)).not.toBe(
      rowOf(screen().container, SECOND),
    );

    const dialog = await openDeletionOf(SECOND, "Hettich");
    await press(dialogButton(dialog, DELETE));

    expect(screen().draftServer.state().draft.changes).toEqual([]);
    expect(namesOf().filter((name) => name === "Hettich")).toHaveLength(1);
    expect(rowOf(screen().container, HETTICH)).toBeDefined();
  });
});

describe("a class created in Romanian, drawn for a Russian reader", () => {
  it("shows the authored Romanian name and description in both locales, until the translation feature supplies Russian", async () => {
    const texts: string[] = [];
    for (const locale of ["ro", "ru"] as const) {
      mounted = await mountHardwareList(
        hardwarePageOf({ changes: CREATED_CLASS }),
        {
          locale,
        },
      );
      texts.push(rowOf(mounted.container, CREATED).textContent);
      mounted.unmount();
      mounted = undefined;
    }

    for (const text of texts) {
      expect(text).toContain("GTV Economic");
      expect(text).toContain("Pentru oferte economice");
    }
  });
});
