// @vitest-environment happy-dom
//
// The reference and its copy control: the text copied is exactly the reference, *Copiat* is announced politely and only
// once the clipboard accepted the write, stands for two seconds, and where the write is refused the reference is left
// selected. The clipboard is the test's own fake; the reference is rendered as text and never as markup.
//
// What this cannot see: a real browser's clipboard permission or an iOS gesture rule (the phone gate's).
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SentReferenceCard } from "@/done/sent-reference-card";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const MESSAGES = { ro: roMessages, ru: ruMessages } as const;
const REFERENCE = "LM-2614";
const COPIED_FOR_MS = 2000;

let container: HTMLDivElement;
let root: Root | undefined;

function mountCard(
  reference: string = REFERENCE,
  locale: keyof typeof MESSAGES = "ro",
): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(NextIntlClientProvider, {
        locale,
        messages: MESSAGES[locale] as typeof roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(SentReferenceCard, { reference }),
      }),
    );
  });
}

function unmountCard(): void {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  container.remove();
}

function elementMarked(testId: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  if (element === null) throw new Error(`nothing is marked ${testId}`);
  return element;
}

async function pressCopy(): Promise<void> {
  await act(async () => {
    elementMarked("done-copy").click();
    await Promise.resolve();
  });
}

function advance(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function installClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

function removeClipboard(): void {
  Object.defineProperty(navigator, "clipboard", {
    value: undefined,
    configurable: true,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  if (root !== undefined) unmountCard();
  vi.useRealTimers();
  document.getSelection()?.removeAllRanges();
  removeClipboard();
});

describe("the reference and its copy control", () => {
  it("draws the reference as text, with a status region that is there and silent before any copy", () => {
    mountCard();

    expect(elementMarked("done-reference").textContent).toBe(REFERENCE);
    expect(elementMarked("done-copy").textContent).toBe(
      roMessages.submissionResult.copy,
    );
    const status = elementMarked("done-copied");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("");
  });

  it("renders a reference that is markup as those characters, running nothing, and copies exactly them", async () => {
    const markup = "<img src=x onerror=alert(1)>";
    const writeText = vi.fn(() => Promise.resolve());
    installClipboard(writeText);

    mountCard(markup);
    await pressCopy();

    expect(elementMarked("done-reference").textContent).toBe(markup);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(markup);
  });
});

describe("a copy the clipboard accepts", () => {
  it("writes exactly the reference, once, and announces Copiat in the polite status region", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    installClipboard(writeText);
    mountCard();

    await pressCopy();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(REFERENCE);
    expect(elementMarked("done-copied").textContent).toBe(
      roMessages.submissionResult.copied,
    );
    expect(elementMarked("done-copied").getAttribute("role")).toBe("status");
  });

  it("announces Скопировано in Russian", async () => {
    installClipboard(() => Promise.resolve());
    mountCard(REFERENCE, "ru");

    await pressCopy();

    expect(elementMarked("done-copied").textContent).toBe(
      ruMessages.submissionResult.copied,
    );
  });

  it("shows nothing until the write has resolved", async () => {
    let finishWrite: () => void = () => undefined;
    installClipboard(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );
    mountCard();

    await pressCopy();
    expect(elementMarked("done-copied").textContent).toBe("");

    await act(async () => {
      finishWrite();
      await Promise.resolve();
    });
    expect(elementMarked("done-copied").textContent).toBe(
      roMessages.submissionResult.copied,
    );
  });

  it("keeps Copiat for two seconds and not a moment more", async () => {
    installClipboard(() => Promise.resolve());
    mountCard();

    await pressCopy();
    advance(COPIED_FOR_MS - 1);
    expect(elementMarked("done-copied").textContent).not.toBe("");

    advance(1);
    expect(elementMarked("done-copied").textContent).toBe("");
  });

  it("restarts the two seconds at the next copy", async () => {
    installClipboard(() => Promise.resolve());
    mountCard();

    await pressCopy();
    advance(1500);
    await pressCopy();
    advance(COPIED_FOR_MS - 1);
    expect(elementMarked("done-copied").textContent).not.toBe("");

    advance(1);
    expect(elementMarked("done-copied").textContent).toBe("");
  });

  it("leaves no timer behind when the card goes while Copiat is showing", async () => {
    installClipboard(() => Promise.resolve());
    mountCard();
    await pressCopy();

    unmountCard();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("a copy the clipboard does not take", () => {
  const FAILURES: readonly (readonly [string, () => void])[] = [
    [
      "refuses the write",
      () => {
        installClipboard(() => Promise.reject(new Error("denied")));
      },
    ],
    [
      "throws as it is called",
      () => {
        installClipboard(() => {
          throw new Error("not allowed here");
        });
      },
    ],
    ["is not there at all", removeClipboard],
  ];

  it.each(FAILURES)(
    "shows no Copiat when the clipboard %s, and leaves the reference selected for copying by hand",
    async (_name, install) => {
      install();
      mountCard();

      await pressCopy();

      expect(elementMarked("done-copied").textContent).toBe("");
      expect(document.getSelection()?.toString()).toBe(REFERENCE);
      expect(elementMarked("done-reference").textContent).toBe(REFERENCE);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("shows Copiat at a later copy that the clipboard does take", async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("denied"))
      .mockResolvedValue(undefined);
    installClipboard(writeText);
    mountCard();

    await pressCopy();
    await pressCopy();

    expect(elementMarked("done-copied").textContent).toBe(
      roMessages.submissionResult.copied,
    );
  });
});
