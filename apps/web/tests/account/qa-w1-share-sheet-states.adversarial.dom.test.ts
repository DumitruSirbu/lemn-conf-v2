// @vitest-environment happy-dom
// "Link de partajare": every state of the sheet, not only the freshly issued one. The sheet's surface is a column flex
// container whose buttons carry `flex: 1 1 200px`, so a button that is a direct child of the surface takes 200 px of
// height. A state's acts must therefore sit in a row of their own, whichever state it is.
import { act, createElement, createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
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
const COPY_FEEDBACK_MS = 2000;

let screen: MountedScreen | undefined;
let writeText: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;
let consoleErrors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  issueShareLink.mockReset().mockResolvedValue(ISSUED_PATH);
  revokeShareLink.mockReset().mockResolvedValue(undefined);
  shareLinkStatus.mockReset().mockResolvedValue(false);
  writeText = vi.fn().mockResolvedValue(undefined);
  onClose = vi.fn();
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  consoleErrors = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  expect(consoleErrors).not.toHaveBeenCalled();
  consoleErrors.mockRestore();
});

async function openSheet(): Promise<HTMLElement> {
  screen = mountInCatalogue(
    createElement(
      "main",
      null,
      createElement(ShareKitchenSheet, {
        kitchenId: KITCHEN_ID,
        onClose,
        returnFocusRef: createRef<HTMLElement>(),
      }),
    ),
  );
  await flushPromises(5);
  return requireIn(document.body, "[role=dialog]");
}

const surface = (): HTMLElement =>
  requireIn(document.body, "[role=dialog], [role=alertdialog]");
const buttonNamed = (words: string): HTMLButtonElement =>
  byWords<HTMLButtonElement>(surface(), "button", words);
const settle = (): Promise<void> => flushPromises(5);

async function reachNone(): Promise<void> {
  await openSheet();
}

async function reachNoneAfterRevoke(): Promise<void> {
  shareLinkStatus.mockResolvedValue(true);
  await openSheet();
  click(buttonNamed(copy.shareStop));
  click(buttonNamed(copy.shareStop));
  await settle();
}

async function reachActive(): Promise<void> {
  shareLinkStatus.mockResolvedValue(true);
  await openSheet();
}

async function reachJustIssued(): Promise<void> {
  await openSheet();
  click(buttonNamed(copy.shareCreate));
  await settle();
}

async function reachStatusError(): Promise<void> {
  shareLinkStatus.mockRejectedValue(new Error("offline"));
  await openSheet();
}

async function reachCreateError(): Promise<void> {
  issueShareLink.mockRejectedValue(new Error("offline"));
  await openSheet();
  click(buttonNamed(copy.shareCreate));
  await settle();
}

async function reachChecking(): Promise<void> {
  shareLinkStatus.mockReturnValue(new Promise<boolean>(() => undefined));
  await openSheet();
}

const REACHES: readonly (readonly [string, () => Promise<void>])[] = [
  ["checking", reachChecking],
  ["none", reachNone],
  ["none after a stop", reachNoneAfterRevoke],
  ["active", reachActive],
  ["just issued", reachJustIssued],
  ["failed status check", reachStatusError],
  ["failed create", reachCreateError],
];

describe("no state leaves an act as a bare child of the sheet's column", () => {
  it.each(REACHES)("%s", async (_state, reach) => {
    await reach();

    const bareButtons = [...surface().children].filter(
      (child) => child.tagName === "BUTTON",
    );

    expect(bareButtons.map((button) => button.textContent)).toEqual([]);
  });
});

describe("what each state draws", () => {
  it("draws only the way out while the status is being read", async () => {
    await reachChecking();

    expect(allIn(surface(), "button").map((b) => b.textContent.trim())).toEqual(
      [copy.close],
    );
    expect(surface().querySelector("input")).toBeNull();
  });

  it("offers the creation of a link, and no link, when none is active", async () => {
    await reachNone();

    expect(buttonNamed(copy.shareCreate)).toBeTruthy();
    expect(surface().querySelector("input")).toBeNull();
    expect(surface().textContent).not.toContain(copy.shareStopped);
  });

  it("says the link was stopped, and offers a new one, after a stop", async () => {
    await reachNoneAfterRevoke();

    expect(revokeShareLink).toHaveBeenCalledExactlyOnceWith(KITCHEN_ID);
    expect(surface().textContent).toContain(copy.shareStopped);
    expect(buttonNamed(copy.shareCreate)).toBeTruthy();
    expect(surface().querySelector("input")).toBeNull();
  });

  it("draws an active link's two acts in one row, with no field, since the link cannot be shown again", async () => {
    await reachActive();

    const reissue = buttonNamed(copy.shareReissue);
    const stop = buttonNamed(copy.shareStop);

    expect(reissue.parentElement).toBe(stop.parentElement);
    expect(reissue.parentElement).not.toBe(surface());
    expect(surface().querySelector("input")).toBeNull();
    expect(surface().textContent).toContain(copy.shareActive);
    expect(surface().textContent).not.toContain(copy.shareCopy);
  });

  it("draws the issued link's field above its row, the row above the caption, in that order", async () => {
    await reachJustIssued();

    const field = requireIn<HTMLInputElement>(surface(), "input");
    const row = buttonNamed(copy.shareCopy).parentElement;
    const caption = byWords(surface(), "p", copy.shareShownOnce);
    const fieldBlock = field.closest("div");

    expect(fieldBlock?.nextElementSibling).toBe(row);
    expect(row?.nextElementSibling).toBe(caption);
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe(`${window.location.origin}${ISSUED_PATH}`);
  });

  it("draws the issued row as Copy first, then Stop, and no other act in it", async () => {
    await reachJustIssued();

    const row = buttonNamed(copy.shareCopy).parentElement;

    expect(
      [...(row?.children ?? [])].map((child) => child.textContent.trim()),
    ).toEqual([copy.shareCopy, copy.shareStop]);
  });

  it("tells a failed status check, offers a retry that asks the status again and never mints a link", async () => {
    await reachStatusError();
    shareLinkStatus.mockResolvedValue(true);

    click(buttonNamed(roMessages.accountForm.retry));
    await settle();

    expect(issueShareLink).not.toHaveBeenCalled();
    expect(buttonNamed(copy.shareReissue)).toBeTruthy();
  });

  it("retries a failed create as a create, and then draws the issued row", async () => {
    await reachCreateError();
    issueShareLink.mockResolvedValue(ISSUED_PATH);

    click(buttonNamed(roMessages.accountForm.retry));
    await settle();

    expect(issueShareLink).toHaveBeenCalledTimes(2);
    expect(buttonNamed(copy.shareCopy).parentElement).toBe(
      buttonNamed(copy.shareStop).parentElement,
    );
  });

  it("retries a failed stop as a stop, never as a create", async () => {
    shareLinkStatus.mockResolvedValue(true);
    await openSheet();
    revokeShareLink.mockRejectedValueOnce(new Error("offline"));
    click(buttonNamed(copy.shareStop));
    click(buttonNamed(copy.shareStop));
    await settle();

    click(buttonNamed(roMessages.accountForm.retry));
    await settle();

    expect(revokeShareLink).toHaveBeenCalledTimes(2);
    expect(issueShareLink).not.toHaveBeenCalled();
  });
});

describe("focus follows the primary act of the state the answer draws", () => {
  it("lands on Create when no link is active", async () => {
    await reachNone();

    expect(document.activeElement).toBe(buttonNamed(copy.shareCreate));
  });

  it("stays on Close when a link is active, since that state draws no primary act", async () => {
    await reachActive();

    expect(document.activeElement).toBe(buttonNamed(copy.close));
  });

  it("lands on Retry after a failed status check", async () => {
    await reachStatusError();

    expect(document.activeElement).toBe(
      buttonNamed(roMessages.accountForm.retry),
    );
  });

  it("lands on Copy after a create, wherever the pressed button's removal left focus", async () => {
    await reachJustIssued();

    expect(document.activeElement).toBe(buttonNamed(copy.shareCopy));
  });

  it("does not pull focus off a control the person moved to while the answer was out", async () => {
    let answer: (isActive: boolean) => void = () => undefined;
    shareLinkStatus.mockReturnValue(
      new Promise<boolean>((resolve) => {
        answer = resolve;
      }),
    );
    await openSheet();
    const field = document.createElement("input");
    surface().append(field);
    field.focus();

    await act(async () => {
      answer(false);
      await Promise.resolve();
    });
    await settle();

    expect(document.activeElement).toBe(field);
  });

  it("keeps focus on the very Copy button that was pressed, which says Copiat and is not replaced", async () => {
    await reachJustIssued();
    const copyButton = buttonNamed(copy.shareCopy);
    copyButton.focus();

    click(copyButton);
    await settle();

    expect(copyButton.isConnected).toBe(true);
    expect(copyButton.textContent.trim()).toBe(copy.shareCopied);
    expect(document.activeElement).toBe(copyButton);
  });
});

describe("copying the issued link", () => {
  it("writes the absolute address, and selects the field so a hand copy is possible", async () => {
    await reachJustIssued();

    click(buttonNamed(copy.shareCopy));
    await settle();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      `${window.location.origin}${ISSUED_PATH}`,
    );
  });

  it("reverts the copied label to the copy label after the feedback has been read, in the same place in the row", async () => {
    await reachJustIssued();
    vi.useFakeTimers();
    const copyButton = buttonNamed(copy.shareCopy);
    click(copyButton);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(copyButton.textContent.trim()).toBe(copy.shareCopied);

    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_MS);
    });

    expect(copyButton.textContent.trim()).toBe(copy.shareCopy);
    expect(copyButton.parentElement).toBe(
      buttonNamed(copy.shareStop).parentElement,
    );
  });

  it("never says Copiat when the browser has no clipboard, and still shows the field to copy by hand", async () => {
    vi.stubGlobal("navigator", {});
    await reachJustIssued();

    click(buttonNamed(copy.shareCopy));
    await settle();

    expect(surface().textContent).not.toContain(copy.shareCopied);
    expect(requireIn<HTMLInputElement>(surface(), "input").value).toContain(
      ISSUED_PATH,
    );
  });

  it("never says Copiat when the clipboard refuses", async () => {
    await reachJustIssued();
    writeText.mockRejectedValue(new Error("denied"));

    click(buttonNamed(copy.shareCopy));
    await settle();

    expect(surface().textContent).not.toContain(copy.shareCopied);
  });
});

describe("stopping the link from the issued state", () => {
  it("asks first, as a destructive dialog that opens on its cancel, and sends nothing yet", async () => {
    await reachJustIssued();

    click(buttonNamed(copy.shareStop));

    expect(surface().getAttribute("role")).toBe("alertdialog");
    expect(document.activeElement).toBe(buttonNamed(copy.cancel));
    expect(revokeShareLink).not.toHaveBeenCalled();
  });

  it("keeps the issued state, its link and its row when the question is answered with Anuleaza", async () => {
    await reachJustIssued();
    click(buttonNamed(copy.shareStop));

    click(buttonNamed(copy.cancel));

    expect(revokeShareLink).not.toHaveBeenCalled();
    expect(requireIn<HTMLInputElement>(surface(), "input").value).toContain(
      ISSUED_PATH,
    );
    expect(buttonNamed(copy.shareCopy).parentElement).toBe(
      buttonNamed(copy.shareStop).parentElement,
    );
    expect(issueShareLink).toHaveBeenCalledTimes(1);
  });

  it("keeps focus inside a dialog, not on the body, after Anuleaza", async () => {
    await reachJustIssued();
    buttonNamed(copy.shareStop).focus();
    click(buttonNamed(copy.shareStop));
    click(buttonNamed(copy.cancel));
    await settle();

    expect(surface().contains(document.activeElement)).toBe(true);
  });

  it("answers Escape on the question as Anuleaza, not as a close of the sheet", async () => {
    await reachJustIssued();
    click(buttonNamed(copy.shareStop));

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(revokeShareLink).not.toHaveBeenCalled();
    expect(surface().getAttribute("role")).toBe("dialog");
    expect(surface().querySelector("input")).not.toBeNull();
  });

  it("stops the link on confirmation and draws the stopped state with no trace of the link", async () => {
    await reachJustIssued();
    click(buttonNamed(copy.shareStop));

    click(buttonNamed(copy.shareStop));
    await settle();

    expect(revokeShareLink).toHaveBeenCalledExactlyOnceWith(KITCHEN_ID);
    expect(surface().textContent).toContain(copy.shareStopped);
    expect(surface().querySelector("input")).toBeNull();
    expect(document.body.innerHTML).not.toContain(ISSUED_PATH);
  });
});

describe("leaving the sheet", () => {
  it("closes on Escape from the issued state", async () => {
    await reachJustIssued();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Inchide from the issued state, and not on Copy or Stop", async () => {
    await reachJustIssued();

    click(buttonNamed(copy.shareCopy));
    await settle();
    click(buttonNamed(copy.shareStop));
    expect(onClose).not.toHaveBeenCalled();
    click(buttonNamed(copy.cancel));
    click(buttonNamed(copy.close));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
