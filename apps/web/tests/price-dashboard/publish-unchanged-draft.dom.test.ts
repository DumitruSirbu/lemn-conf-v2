// @vitest-environment happy-dom
//
// A draft whose changes cancel out (a class created and deleted again) shows no row. It is still stored, so the page
// does not call it empty: it says nothing differs, offers no publish, and offers the one way out. Also what the discard
// question does once a revision it was asked at has been refused.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import {
  offersOnlyDiscard,
  readPendingDraft,
} from "@/price-dashboard/publish-model";

import { allIn, byWords, click, requireIn } from "../support/render-with-intl";
import {
  inputWithDraft,
  mountDesk,
  settle,
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import {
  ACTIVE,
  CABINET_NAMES,
  change,
  createTierChanges,
  NEW_TIER,
} from "./publish-structural-rows.support";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const DISCARD_ACTION = roCopy("priceDashboard.publish.discardAction");
const CANCEL = roCopy("priceDashboard.common.cancel");
const PENDING_CHIP = '[data-testid="staff-pending-prices"]';
const CREATED_AND_DELETED: readonly DraftChange[] = [
  ...createTierChanges(),
  change(
    { kind: "item-deleted", item: { kind: "hardware", tierId: NEW_TIER } },
    true,
  ),
];
const NEGATIVE_ANCHOR = {
  address: {
    kind: "cabinet",
    ruleId: "cabinet.base-cabinet",
    field: "anchorMinor",
  },
  value: -1,
} as DraftChange;

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  leaveTheStaffServer();
});

const dialog = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="alertdialog"]');

const requireDialog = (): HTMLElement => {
  const found = dialog();
  if (found === null) throw new Error("no dialog is open");
  return found;
};

async function confirmDiscard(): Promise<void> {
  click(byWords(requireDialog(), "button", DISCARD_ACTION));
  await settle();
}

describe("the reading of a draft that shows no row", () => {
  it("is ready with no rows, and offers only the discard, where one that shows a row offers more", () => {
    const cancelling = readPendingDraft({
      active: ACTIVE,
      changes: CREATED_AND_DELETED,
      cabinetNames: CABINET_NAMES,
    });
    const listed = readPendingDraft({
      active: ACTIVE,
      changes: createTierChanges(),
      cabinetNames: CABINET_NAMES,
    });

    expect(cancelling.kind === "ready" && cancelling.view.hasRows).toBe(false);
    expect(offersOnlyDiscard(cancelling)).toBe(true);
    expect(listed.kind === "ready" && listed.view.hasRows).toBe(true);
    expect(offersOnlyDiscard(listed)).toBe(false);
  });

  it("is not a reason to offer only the discard for an empty draft", () => {
    expect(
      offersOnlyDiscard(
        readPendingDraft({
          active: ACTIVE,
          changes: [],
          cabinetNames: CABINET_NAMES,
        }),
      ),
    ).toBe(false);
  });
});

describe("the page of a draft that shows no row", () => {
  async function mountCancelling(): Promise<MountedDesk> {
    mounted = await mountDesk({ input: inputWithDraft(CREATED_AND_DELETED) });
    return mounted;
  }

  it("says nothing differs, keeps counting the stored changes, and offers no publish", async () => {
    const { container } = await mountCancelling();

    expect(container.textContent).toContain(
      roCopy("priceDashboard.publish.unchangedDraftTitle"),
    );
    expect(container.querySelector('[data-testid="publish-empty"]')).toBeNull();
    expect(container.querySelector('[class*="primary"]')).toBeNull();
    expect(
      requireIn(container, PENDING_CHIP).textContent,
      "the changes are still stored, so the frame still counts them",
    ).toMatch(/\d/u);
  });

  it("gives the draft up on confirmation, and then draws the empty page", async () => {
    const { container, client } = await mountCancelling();
    click(byWords(container, "button", DISCARD_ACTION));
    await settle();

    await confirmDiscard();

    expect(client.discardDraft).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
    expect(container.querySelector('[data-testid="publish-empty"]')).not.toBe(
      null,
    );
    expect(container.contains(document.activeElement)).toBe(true);
  });
});

describe("a discard question asked at a revision the draft has moved past", () => {
  async function mountStaleWithUnreadableRevisions(): Promise<MountedDesk> {
    const input = inputWithDraft([NEGATIVE_ANCHOR], "7");
    mounted = await mountDesk({
      input,
      client: spiedPublishClient(input, {
        discardDraft: () => Promise.resolve({ kind: "conflict" }),
        readState: () => Promise.resolve(undefined),
      }),
    });
    return mounted;
  }

  async function askAfterTheRefusal(): Promise<MountedDesk> {
    const desk = await mountStaleWithUnreadableRevisions();
    click(byWords(desk.container, "button", DISCARD_ACTION));
    await settle();
    await confirmDiscard();
    expect(dialog(), "the refusal closes the question").toBeNull();
    click(byWords(desk.container, "button", DISCARD_ACTION));
    await settle();
    return desk;
  }

  it("is not sent again at that revision when the person asks again", async () => {
    const { client } = await askAfterTheRefusal();

    await confirmDiscard();

    expect(client.discardDraft).toHaveBeenCalledTimes(1);
    expect(requireDialog().textContent).toContain(
      roCopy("priceDashboard.publish.discardChangedMeanwhile"),
    );
  });

  it("is a confirmation that reads as off, so the press is taken away and the way out is the cancel", async () => {
    await askAfterTheRefusal();

    const confirmation = byWords(requireDialog(), "button", DISCARD_ACTION);

    expect(confirmation.getAttribute("aria-disabled")).toBe("true");
    expect(allIn(requireDialog(), "button")).toHaveLength(2);
    click(byWords(requireDialog(), "button", CANCEL));
    await settle();
    expect(dialog()).toBeNull();
  });
});
