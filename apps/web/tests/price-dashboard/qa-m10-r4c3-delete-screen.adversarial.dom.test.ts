// @vitest-environment happy-dom
//
// Adversarial QA of M10 R4c3 on the hardware list as a person drives it: a Delete pressed on facts that moved (a draft
// written behind the screen, a candidate the route refuses), a refusal for use or for a default, a route that is down, a
// press made twice, a count that cannot be had, and a row only the draft held that is gone by the recount. What the
// Delete control says to a reader (aria-disabled, aria-busy) is asserted beside what it does.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ItemLifecycleClient } from "@/price-dashboard/item-lifecycle-client";
import { FETCHING_PRICE_DRAFT_CLIENT } from "@/price-dashboard/price-draft-client";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import {
  BLUM,
  CREATED,
  CREATED_CLASS,
  dialogButton,
  hardwareItem,
  hardwarePageOf,
  menuEntry,
  mountHardwareList,
  openDialog,
  openMenuOf,
  press,
  type MountedHardware,
} from "./hardware-harness";
import { recordingLifecycleClient } from "./recording-item-lifecycle-client";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";
import { flushPromises } from "../support/render-hook";

const DELETE = roCopy("priceDashboard.common.delete");
const BLUM_NAME = "Blum";
const CREATED_NAME = "GTV Economic";
const DRAFT_ROUTE = "/api/staff/prices/draft";
const CHANGED_MEANWHILE = roCopy("priceDashboard.errors.changedMeanwhile");
const SAVE_FAILED = roCopy("priceDashboard.errors.saveFailed");
const KITCHENS_THAT_CAME = 3;
const REQUEST_LATENCY_MS = 15;

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

function requireDialog(): HTMLElement {
  const dialog = openDialog();
  if (dialog === null) throw new Error("no dialog opened");
  return dialog;
}

async function openDeleteDialogOf(tierId: string, name: string) {
  await openMenuOf(screen().container, tierId, name);
  await press(menuEntry(screen().container, tierId, DELETE));
  return requireDialog();
}

const readsOfState = (): number =>
  screen().draftServer.calls.filter(({ kind }) => kind === "readState").length;

const countsAsked = (): number =>
  screen().lifecycle.calls.filter(({ kind }) => kind === "readUsage").length;

const changesSent = (): number =>
  screen().draftServer.calls.filter(({ kind }) => kind === "change").length;

const deletionOf = (tierId: string) => ({
  address: { kind: "item-deleted", item: hardwareItem(tierId) },
  value: true,
});

describe("a Delete pressed on a draft that was written behind the screen", () => {
  it("closes the dialog with the notice standing, reads the draft again, counts again, and reopens a Delete that sends", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeleteDialogOf(BLUM, BLUM_NAME);
    screen().draftServer.moveDraftBehindTheScreen();
    const stateReadsBefore = readsOfState();
    const releaseCount = screen().lifecycle.holdNextUsage();

    await press(dialogButton(dialog, DELETE));

    expect(openDialog(), "no Delete is pressable on the old count").toBeNull();
    expect(screen().container.textContent).toContain(
      roCopy("priceDashboard.lifecycle.counting"),
    );
    expect(readsOfState()).toBe(stateReadsBefore + 1);
    releaseCount();
    await act(async () => {
      await flushPromises(20);
    });
    expect(countsAsked()).toBe(2);
    const reopened = requireDialog();
    expect(reopened.textContent).toContain(CHANGED_MEANWHILE);
    expect(
      dialogButton(reopened, DELETE).getAttribute("aria-disabled"),
    ).toBeNull();
    expect(changesSent()).toBe(1);

    await press(dialogButton(reopened, DELETE));

    expect(changesSent()).toBe(2);
    expect(screen().draftServer.state().draft.changes).toEqual([
      deletionOf(BLUM),
    ]);
    expect(openDialog()).toBeNull();
  });

  it("opens the block instead when the new count says kitchens came meanwhile, and the Delete is gone", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeleteDialogOf(BLUM, BLUM_NAME);
    screen().draftServer.moveDraftBehindTheScreen();
    screen().lifecycle.answerNextUsageWith({
      kind: "counted",
      counts: [{ item: hardwareItem(BLUM), designCount: KITCHENS_THAT_CAME }],
    });

    await press(dialogButton(dialog, DELETE));

    const blocked = requireDialog();
    expect(blocked.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedBody", {
        name: BLUM_NAME,
        count: KITCHENS_THAT_CAME,
      }),
    );
    expect(() => dialogButton(blocked, DELETE)).toThrow();
    expect(screen().draftServer.state().draft.changes).toEqual([]);
  });
});

describe("a Delete pressed on a candidate the route refuses", () => {
  // Known residual, not a defect of this wave: the draft is read again only on a conflict (`use-price-draft`'s `settle`),
  // so a refused candidate recounts the saved kitchens and offers Delete again over a draft the screen has not re-read.
  it("documents the residual: it recounts the kitchens and reopens the dialog, but the draft is not read again", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeleteDialogOf(BLUM, BLUM_NAME);
    screen().draftServer.answerNextWriteWith({ kind: "candidate-refused" });
    const stateReadsBefore = readsOfState();

    await press(dialogButton(dialog, DELETE));

    expect(countsAsked()).toBe(2);
    expect(readsOfState()).toBe(stateReadsBefore);
    expect(
      dialogButton(requireDialog(), DELETE).getAttribute("aria-disabled"),
    ).toBeNull();
    expect(screen().container.textContent).toContain(SAVE_FAILED);
  });
});

describe("a Delete the server refuses for use after a count of none", () => {
  const inUse = { kind: "refused", code: "ITEM_IN_USE" } as const;

  it("says the block with no number, offers no Delete, and counts once more", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeleteDialogOf(BLUM, BLUM_NAME);
    screen().draftServer.answerNextWriteWith(inUse);

    await press(dialogButton(dialog, DELETE));

    const blocked = requireDialog();
    expect(countsAsked()).toBe(2);
    expect(blocked.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedUncountedBody", {
        name: BLUM_NAME,
      }),
    );
    expect(() => dialogButton(blocked, DELETE)).toThrow();
    await flushPromises(20);
    expect(countsAsked()).toBe(2);
    expect(changesSent()).toBe(1);
  });

  it("says the number when the new count gives one", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeleteDialogOf(BLUM, BLUM_NAME);
    screen().draftServer.answerNextWriteWith(inUse);
    screen().lifecycle.answerNextUsageWith({
      kind: "counted",
      counts: [{ item: hardwareItem(BLUM), designCount: KITCHENS_THAT_CAME }],
    });

    await press(dialogButton(dialog, DELETE));

    expect(requireDialog().textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedBody", {
        name: BLUM_NAME,
        count: KITCHENS_THAT_CAME,
      }),
    );
  });
});

describe("a Delete the server refuses for a default", () => {
  it("says so in the dialog, counts nothing again, and leaves the dialog to be closed", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeleteDialogOf(BLUM, BLUM_NAME);
    screen().draftServer.answerNextWriteWith({
      kind: "refused",
      code: "ITEM_IS_DEFAULT",
    });

    await press(dialogButton(dialog, DELETE));

    expect(requireDialog().textContent).toContain(
      roCopy("priceDashboard.lifecycle.defaultCannotChange"),
    );
    expect(countsAsked()).toBe(1);
  });
});

describe("a Delete pressed while the draft route is down (503)", () => {
  it("says it failed, counts nothing again, and sends again on the next press: the dialog is never stuck busy", async () => {
    const asked: string[] = [];
    const staffServer = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((address: string, init?: RequestInit) => {
        if (address === DRAFT_ROUTE && init?.method === "PUT") {
          asked.push(`${init.method} ${address}`);
          return Promise.resolve(new Response("{}", { status: 503 }));
        }
        return staffServer(address, init);
      }),
    );
    mounted = await mountHardwareList(hardwarePageOf(), {
      draftClient: FETCHING_PRICE_DRAFT_CLIENT,
    });
    const dialog = await openDeleteDialogOf(BLUM, BLUM_NAME);

    await press(dialogButton(dialog, DELETE));

    expect(asked).toHaveLength(1);
    expect(requireDialog().textContent).toContain(SAVE_FAILED);
    expect(countsAsked()).toBe(1);
    const again = dialogButton(requireDialog(), DELETE);
    expect(again.getAttribute("aria-disabled")).toBeNull();
    expect(again.getAttribute("aria-busy")).toBeNull();
    await press(again);
    expect(asked).toHaveLength(2);
  });
});

describe("a Delete pressed twice at once", () => {
  it("sends one write, shows the control busy and unavailable to a reader while it is out, and frees it after", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeleteDialogOf(BLUM, BLUM_NAME);
    const confirm = dialogButton(dialog, DELETE);
    const releaseWrite = screen().draftServer.holdNextWrite();

    await press(confirm);
    await press(confirm);

    expect(changesSent()).toBe(1);
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    releaseWrite();
    await flushPromises(20);
    expect(changesSent()).toBe(1);
    expect(screen().draftServer.state().draft.changes).toEqual([
      deletionOf(BLUM),
    ]);
  });
});

describe("a Delete whose saved kitchens cannot be counted", () => {
  it("shows the Delete unavailable to a reader and sends nothing however it is pressed, saying why", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    screen().lifecycle.answerNextUsageWith({ kind: "unavailable" });

    const dialog = await openDeleteDialogOf(BLUM, BLUM_NAME);
    const confirm = dialogButton(dialog, DELETE);

    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usageUnavailable"),
    );
    await press(confirm);
    await press(confirm);
    expect(changesSent()).toBe(0);
    expect(screen().draftServer.state().draft.changes).toEqual([]);
  });

  it("is the dialog a recount reopens when the new count cannot be had after a conflict, with the same Delete unavailable", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    const dialog = await openDeleteDialogOf(BLUM, BLUM_NAME);
    screen().draftServer.moveDraftBehindTheScreen();
    screen().lifecycle.answerNextUsageWith({ kind: "unavailable" });

    await press(dialogButton(dialog, DELETE));

    const reopened = requireDialog();
    expect(dialogButton(reopened, DELETE).getAttribute("aria-disabled")).toBe(
      "true",
    );
    await press(dialogButton(reopened, DELETE));
    expect(changesSent()).toBe(1);
  });
});

describe("a Delete pressed on a class only the draft holds", () => {
  const creationAddress = { kind: "hardware-tier-created", tierId: CREATED };

  async function openCreatedClassDialog() {
    mounted = await mountHardwareList(
      hardwarePageOf({ changes: CREATED_CLASS }),
    );
    return openDeleteDialogOf(CREATED, CREATED_NAME);
  }

  it("takes the creation back out of the draft and counts nothing", async () => {
    const dialog = await openCreatedClassDialog();

    expect(dialog.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteCreatedBody"),
    );
    await press(dialogButton(dialog, DELETE));

    expect(screen().draftServer.state().draft.changes).toEqual([]);
    expect(countsAsked()).toBe(0);
  });

  it("reopens the draft-only dialog after a conflict, counts nothing, and the next Delete takes the creation away", async () => {
    const dialog = await openCreatedClassDialog();
    screen().draftServer.moveDraftBehindTheScreen();

    await press(dialogButton(dialog, DELETE));

    const reopened = requireDialog();
    expect(reopened.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteCreatedBody"),
    );
    expect(reopened.textContent).toContain(CHANGED_MEANWHILE);
    expect(countsAsked()).toBe(0);
    await press(dialogButton(reopened, DELETE));
    expect(screen().draftServer.state().draft.changes).toEqual([]);
  });

  // The screen judges the recount by the context it last rendered. A client that answers in a macrotask, as a network
  // does, lets React commit the re-read draft first, so the judgement is made on it.
  it("leaves no pressable Delete for a class another writer took away, when the availability read takes as long as a request does", async () => {
    const dialog = await openCreatedClassDialogOverSlowClient();
    const { draftRevision } = screen().draftServer.state().draft;
    await screen().draftServer.client.revert({
      expectedDraftRevision: draftRevision,
      target: { kind: "change", address: creationAddress },
    } as never);

    await press(dialogButton(dialog, DELETE));
    await act(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, REQUEST_LATENCY_MS * 4),
      );
    });

    const after = openDialog();
    const hasPressableDelete =
      after !== null &&
      dialogButton(after, DELETE).getAttribute("aria-disabled") !== "true";
    expect(hasPressableDelete).toBe(false);
    expect(screen().draftServer.state().draft.changes).toEqual([]);
    expect(countsAsked()).toBe(0);
  });

  async function openCreatedClassDialogOverSlowClient() {
    const page = hardwarePageOf({ changes: CREATED_CLASS });
    const lifecycle = recordingLifecycleClient({
      book: page.state.active.book,
      availability: page.state.active.availability,
      defaults: page.defaults,
      usage: [],
    });
    const slowToReadAvailability: ItemLifecycleClient = {
      ...lifecycle.client,
      readAvailability: async () => {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_LATENCY_MS));
        return lifecycle.client.readAvailability();
      },
    };
    mounted = await mountHardwareList(page, {
      lifecycleClient: slowToReadAvailability,
    });
    return openDeleteDialogOf(CREATED, CREATED_NAME);
  }

  it("leaves no Delete that counts a row that is not there when another writer took the creation away before the press, with no latency", async () => {
    const dialog = await openCreatedClassDialog();
    const { draftRevision } = screen().draftServer.state().draft;
    await screen().draftServer.client.revert({
      expectedDraftRevision: draftRevision,
      target: { kind: "change", address: creationAddress },
    } as never);
    const callsBefore = screen().draftServer.calls.length;

    await press(dialogButton(dialog, DELETE));

    expect(countsAsked()).toBe(0);
    const after = openDialog();
    const hasPressableDelete =
      after !== null &&
      dialogButton(after, DELETE).getAttribute("aria-disabled") !== "true";
    expect(
      hasPressableDelete,
      "a Delete that can be pressed for a class that is gone",
    ).toBe(false);
    expect(screen().draftServer.state().draft.changes).toEqual([]);
    expect(screen().draftServer.calls.slice(callsBefore)).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ kind: "bulk" })]),
    );
  });
});
