// @vitest-environment happy-dom
//
// The customer's own design address on 5A: the absolute editor address of this design in the page's locale, copied
// exactly as shown, *Copiat* announced politely, the address selected where the clipboard does not take it, and a server
// render that names no origin and hydrates without a warning. The clipboard and the page's origin are the test's own.
//
// What this cannot see: the ellipsis as painted at 390 px and a real browser's clipboard permission (the visual pass's).
import type { DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DesignLinkCard } from "@/done/design-link-card";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const MESSAGES = { ro: roMessages, ru: ruMessages } as const;
type Locale = keyof typeof MESSAGES;

const DESIGN_ID = "design0123456789abcde" as DesignId;
const ORIGIN = "https://lemnaria.example";

let container: HTMLDivElement;
let root: Root | undefined;

function theCard(locale: Locale = "ro", designId: DesignId = DESIGN_ID) {
  return createElement(NextIntlClientProvider, {
    locale,
    messages: MESSAGES[locale] as typeof roMessages,
    timeZone: "Europe/Chisinau",
    children: createElement(DesignLinkCard, { designId }),
  });
}

function mountCard(locale: Locale = "ro", designId: DesignId = DESIGN_ID) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(theCard(locale, designId));
  });
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
  vi.stubGlobal("location", { origin: ORIGIN });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  container.remove();
  vi.unstubAllGlobals();
  document.getSelection()?.removeAllRanges();
  removeClipboard();
});

describe.each(["ro", "ru"] as const)("the design's address in %s", (locale) => {
  const copy = MESSAGES[locale].submissionResult;

  it("is this design's editor in this locale, absolute from the page's origin", () => {
    mountCard(locale);

    expect(elementMarked("done-design-link").textContent).toBe(
      `${ORIGIN}/${locale}/d/${DESIGN_ID}`,
    );
  });

  it("is labelled, and says it opens the design for editing in this browser only", () => {
    mountCard(locale);

    expect(container.textContent).toContain(copy.designLinkLabel);
    expect(elementMarked("done-design-link-note").textContent).toBe(
      copy.designLinkNote,
    );
  });

  it("copies exactly the address shown, once, and announces the copy in the polite status region", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    installClipboard(writeText);
    mountCard(locale);

    await pressCopy();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      elementMarked("done-design-link").textContent,
    );
    expect(writeText).toHaveBeenCalledWith(
      `${ORIGIN}/${locale}/d/${DESIGN_ID}`,
    );
    expect(elementMarked("done-copied").textContent).toBe(copy.copied);
  });
});

describe("the card's roles", () => {
  it("is a button named by the copy leaf and described by the card's label", () => {
    mountCard();

    const button = elementMarked("done-copy");
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.textContent).toBe(roMessages.submissionResult.copy);
    const describedBy = button.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe(
      roMessages.submissionResult.designLinkLabel,
    );
  });

  it("holds a status region that is there and silent before any copy", () => {
    mountCard();

    const status = elementMarked("done-copied");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("");
  });

  it("reads the address left to right, whatever the page's direction, and draws it as text, not a link", () => {
    mountCard();

    const address = elementMarked("done-design-link");
    expect(address.getAttribute("dir")).toBe("ltr");
    expect(address.closest("a")).toBeNull();
    expect(container.querySelectorAll("a, input, textarea")).toHaveLength(0);
  });
});

describe("a copy the clipboard does not take", () => {
  it.each([
    [
      "refuses the write",
      () => {
        installClipboard(() => Promise.reject(new Error("denied")));
      },
    ],
    ["is not there at all", removeClipboard],
  ] as const)(
    "shows no Copiat when the clipboard %s, and leaves the whole address selected",
    async (_name, install) => {
      install();
      mountCard();

      await pressCopy();

      expect(elementMarked("done-copied").textContent).toBe("");
      expect(document.getSelection()?.toString()).toBe(
        `${ORIGIN}/ro/d/${DESIGN_ID}`,
      );
    },
  );
});

describe("the card as the server renders it and the browser hydrates it", () => {
  it("names no origin on a server, where there is none to read, and shows the editor's path", () => {
    vi.stubGlobal("location", undefined);

    const markup = renderToString(theCard());

    expect(markup).toContain(`/ro/d/${DESIGN_ID}`);
    expect(markup).not.toContain(ORIGIN);
  });

  it("hydrates without a warning, and then shows the absolute address it copies", async () => {
    vi.stubGlobal("location", undefined);
    const markup = renderToString(theCard());
    vi.stubGlobal("location", { origin: ORIGIN });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      return undefined;
    });
    const writeText = vi.fn(() => Promise.resolve());
    installClipboard(writeText);
    container = document.createElement("div");
    container.innerHTML = markup;
    document.body.append(container);

    act(() => {
      root = hydrateRoot(container, theCard());
    });
    await pressCopy();

    expect(consoleError).not.toHaveBeenCalled();
    expect(elementMarked("done-design-link").textContent).toBe(
      `${ORIGIN}/ro/d/${DESIGN_ID}`,
    );
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      `${ORIGIN}/ro/d/${DESIGN_ID}`,
    );
    consoleError.mockRestore();
  });
});
