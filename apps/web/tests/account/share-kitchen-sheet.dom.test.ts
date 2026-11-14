// @vitest-environment happy-dom
// The share sheet's acts sit in one `.shareActions` row, never as bare children of the dialog's column flex.
import { act, createElement, createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import { flushPromises } from "../support/render-hook";
import {
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";

const issueShareLink = vi.hoisted(() => vi.fn());
const revokeShareLink = vi.hoisted(() => vi.fn());
const shareLinkStatus = vi.hoisted(() => vi.fn());

vi.mock("@/persistence/share-link-client", () => ({
  issueShareLink,
  revokeShareLink,
  shareLinkStatus,
}));

const { ShareKitchenSheet } = await import(
  "@/account/kitchens/share-kitchen-sheet"
);

const copy = roMessages.accountKitchens;
const KITCHEN_ID = "k00000000000000000001";
const ISSUED_PATH = "/s/AbCdEfGhIjKl";

let screen: MountedScreen | undefined;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  issueShareLink.mockReset();
  revokeShareLink.mockReset();
  shareLinkStatus.mockReset();
  shareLinkStatus.mockResolvedValue(false);
  issueShareLink.mockResolvedValue(ISSUED_PATH);
  writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

async function openSheetAfterStatus(isActive: boolean): Promise<HTMLElement> {
  shareLinkStatus.mockResolvedValue(isActive);
  screen = mountInCatalogue(
    createElement(
      "main",
      null,
      createElement(ShareKitchenSheet, {
        kitchenId: KITCHEN_ID,
        onClose: () => undefined,
        returnFocusRef: createRef<HTMLElement>(),
      }),
    ),
  );
  await flushPromises(5);
  return requireIn(document.body, "[role=dialog]");
}

async function openSheetOnJustIssued(): Promise<HTMLElement> {
  const sheet = await openSheetAfterStatus(false);
  click(byWords(sheet, "button", copy.shareCreate));
  await flushPromises(5);
  return sheet;
}

const buttonNamed = (sheet: HTMLElement, words: string): HTMLButtonElement =>
  byWords<HTMLButtonElement>(sheet, "button", words);

describe("the freshly issued link's acts", () => {
  it("puts Copy and Stop side by side in one row, as the active state does", async () => {
    const sheet = await openSheetOnJustIssued();

    const copyRow = buttonNamed(sheet, copy.shareCopy).parentElement;

    expect(copyRow).not.toBeNull();
    expect(copyRow).toBe(buttonNamed(sheet, copy.shareStop).parentElement);
    expect(copyRow).not.toBe(sheet);
  });

  it("keeps the row in the same shape as the active state's row", async () => {
    const issued = await openSheetOnJustIssued();
    const issuedRow = buttonNamed(issued, copy.shareCopy).parentElement;
    screen?.unmount();
    document.body.replaceChildren();
    const active = await openSheetAfterStatus(true);
    const activeRow = buttonNamed(active, copy.shareStop).parentElement;

    expect(activeRow?.className).toContain("shareActions");
    expect(issuedRow?.className).toBe(activeRow?.className);
    expect(issuedRow?.children).toHaveLength(2);
  });

  it("holds no button inside the block that holds the link's field", async () => {
    const sheet = await openSheetOnJustIssued();

    const field = requireIn<HTMLInputElement>(sheet, "input");
    const fieldBlock = field.closest("div");

    expect(field.value).toContain(ISSUED_PATH);
    expect(fieldBlock?.contains(sheet)).toBe(false);
    expect(fieldBlock?.querySelector("button")).toBeNull();
  });

  it("makes no act a bare child of the dialog, where a column flex would stretch it", async () => {
    const sheet = await openSheetOnJustIssued();

    const bareButtons = [...sheet.children].filter(
      (child) => child.tagName === "BUTTON",
    );

    expect(bareButtons).toHaveLength(0);
  });

  it("says the link is shown once, after the row", async () => {
    const sheet = await openSheetOnJustIssued();

    const row = buttonNamed(sheet, copy.shareCopy).parentElement;
    const caption = byWords(sheet, "p", copy.shareShownOnce);

    expect(row?.nextElementSibling).toBe(caption);
  });

  it("copies the link and tells so on the same button", async () => {
    const sheet = await openSheetOnJustIssued();

    click(buttonNamed(sheet, copy.shareCopy));
    await act(async () => {
      await flushPromises(2);
    });

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(ISSUED_PATH),
    );
    expect(buttonNamed(sheet, copy.shareCopied)).toBeTruthy();
  });

  it("puts focus on Copy when the link has just been issued", async () => {
    const sheet = await openSheetOnJustIssued();

    expect(document.activeElement).toBe(buttonNamed(sheet, copy.shareCopy));
  });
});
