// @vitest-environment happy-dom
//
// Frame 5A's WhatsApp action, through the screen it sits in and with a fake share-link port (the module the share control
// also calls): where it is drawn and where it is not, each step of it (before, checking, the warning, issuing, the
// link, a failure of either request), the exact address the link leads to, what it must not do (open a window, write a
// store, change the history, name a typed value or a price), and where focus goes.
//
// What this cannot see: a phone browser's own rule for a window opened after an `await` (8T's), the painted button at
// 390 px, and WhatsApp itself.
import type { DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scene = vi.hoisted(() => ({ support: "supported" as const }));
const sharePort = vi.hoisted(() => ({
  issueShareLink: vi.fn(),
  shareLinkStatus: vi.fn(),
}));

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => scene.support,
}));
vi.mock("@/scene/kitchen-canvas", () => ({
  default: () => null,
  ViewOnlyKitchenCanvas: () => null,
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => null,
}));
vi.mock("@/persistence/share-link-client", () => sharePort);

import { DoneScreen } from "@/done/done-screen";
import type { SentReferenceAnswer } from "@/done/result-to-show";
import {
  forgetSentRequest,
  rememberSentRequest,
} from "@/done/sent-request-memory";
import { resolveContent } from "@/i18n/content";
import { SHOP_PHONE_E164, shopWhatsAppDigits } from "@/shop/shop-phone";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const MESSAGES = { ro: roMessages, ru: ruMessages } as const;
type Locale = keyof typeof MESSAGES;

const DESIGN_ID = "design0123456789abcde" as DesignId;
const OTHER_DESIGN_ID = "design0123456789abcdf" as DesignId;
const REVISION = "4";
const ORIGIN = "https://lemnaria.example";
const SHARE_PATH = "/s/AbCdEfGhIjKl";
const SHARE_ADDRESS = `${ORIGIN}${SHARE_PATH}`;
const TYPED_PHONE = "079 123 456";
const REFERENCE = "LM-2614";
const SHOP_DIGITS = shopWhatsAppDigits(SHOP_PHONE_E164);
const WHATSAPP_PREFIX = `https://wa.me/${SHOP_DIGITS}?text=`;

const SENT_ON_SERVER: SentReferenceAnswer = {
  kind: "sent",
  reference: REFERENCE,
};
const NONE_ON_SERVER: SentReferenceAnswer = { kind: "none" };
const UNKNOWN_ON_SERVER: SentReferenceAnswer = { kind: "unknown" };

/** A request that stays pending until the test settles it, so a step that exists only while it is pending can be read. */
function pendingRequest<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<Value>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function contentIn(locale: Locale) {
  return resolveContent(
    createTranslator({ locale, messages: MESSAGES[locale] }),
  );
}

let container: HTMLDivElement;
let root: Root | undefined;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mountDoneScreen(
  sentReference: SentReferenceAnswer = SENT_ON_SERVER,
  locale: Locale = "ro",
): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  const mountedRoot = createRoot(container);
  root = mountedRoot;
  act(() => {
    mountedRoot.render(
      createElement(NextIntlClientProvider, {
        locale,
        messages: MESSAGES[locale] as typeof roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(DoneScreen, {
          designId: DESIGN_ID,
          revision: REVISION,
          sentReference,
        }),
      }),
    );
  });
  await flush();
}

function theCustomerMayShare(): void {
  useConfiguratorStore.setState({
    canWrite: true,
    hasPersistedSuccessfully: true,
    designId: DESIGN_ID,
  });
}

function maybeById(testId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

function byTestId(testId: string): HTMLElement {
  const element = maybeById(testId);
  if (element === null) throw new Error(`nothing is marked ${testId}`);
  return element;
}

async function press(testId: string): Promise<void> {
  act(() => {
    byTestId(testId).dispatchEvent(new Event("click", { bubbles: true }));
  });
  await flush();
}

function openingAddress(): string {
  const href = byTestId("done-whatsapp-open").getAttribute("href");
  if (href === null) throw new Error("the link has no address");
  return href;
}

/** What the customer would be offered to send: the one value of the address's one parameter, decoded. */
function draftedMessage(): string {
  return decodeURIComponent(openingAddress().slice(WHATSAPP_PREFIX.length));
}

beforeEach(() => {
  sharePort.issueShareLink.mockReset();
  sharePort.shareLinkStatus.mockReset();
  sharePort.shareLinkStatus.mockResolvedValue(false);
  sharePort.issueShareLink.mockResolvedValue(SHARE_PATH);
  vi.stubGlobal("location", { origin: ORIGIN });
  forgetSentRequest();
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
  theCustomerMayShare();
});

afterEach(() => {
  if (root !== undefined) {
    act(() => {
      root?.unmount();
    });
    root = undefined;
  }
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetSentRequest();
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
});

describe("where the WhatsApp action is drawn", () => {
  it("is above the way back to the design, in the pinned region, when the customer may share the design", async () => {
    await mountDoneScreen();

    const bottom = byTestId("done-bottom");
    const action = byTestId("done-whatsapp");
    const back = byTestId("done-back-to-design");
    expect(bottom.contains(action)).toBe(true);
    expect(
      action.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each([
    ["the design holds no write credential", { canWrite: false }],
    ["the design was never saved", { hasPersistedSuccessfully: false }],
    ["the store holds no design", { designId: null }],
    ["the store holds another design", { designId: OTHER_DESIGN_ID }],
    [
      "the store holds another design and write access is unanswered, as after a reload",
      { designId: OTHER_DESIGN_ID, canWrite: "checking" as const },
    ],
  ])("draws no element at all when %s", async (_reason, held) => {
    useConfiguratorStore.setState(held);

    await mountDoneScreen();

    expect(maybeById("done-whatsapp")).toBeNull();
    expect(byTestId("done-bottom").children).toHaveLength(1);
    expect(byTestId("done-bottom").firstElementChild).toBe(
      byTestId("done-back-to-design"),
    );
    expect(byTestId("done-bottom").querySelector('[role="status"]')).toBeNull();
  });

  // F3 (ADR 0163 d4): nothing on `/done` probes write access, so after a reload the store says `"checking"`.
  it.each([
    [
      "the write check has not answered, as after a reload",
      "checking" as const,
    ],
    ["the write check failed", "check-failed" as const],
  ])(
    "is drawn when %s: only a known `false` hides it",
    async (_reason, held) => {
      useConfiguratorStore.setState({ canWrite: held });

      await mountDoneScreen();

      expect(maybeById("done-whatsapp")).not.toBeNull();
      expect(maybeById("done-whatsapp-send")).not.toBeNull();
    },
  );

  it.each([
    ["claims no request", NONE_ON_SERVER],
    ["cannot be shown", UNKNOWN_ON_SERVER],
  ])(
    "is not drawn on a view that %s, which has no pinned region, even while write access is unanswered",
    async (_view, sentReference) => {
      useConfiguratorStore.setState({ canWrite: "checking" });

      await mountDoneScreen(sentReference);

      expect(maybeById("done-whatsapp")).toBeNull();
      expect(maybeById("done-bottom")).toBeNull();
    },
  );
});

describe.each(["ro", "ru"] as const)(
  "the action before it is pressed, in %s",
  (locale) => {
    it("offers the frame's button, asks the server for nothing and moves no focus", async () => {
      await mountDoneScreen(SENT_ON_SERVER, locale);

      const button = byTestId("done-whatsapp-send");
      expect(button.tagName).toBe("BUTTON");
      expect(button.textContent).toBe(
        contentIn(locale).submissionResult.sendOnWhatsapp,
      );
      expect(button.getAttribute("aria-disabled")).toBe("false");
      expect(button.getAttribute("aria-busy")).toBe("false");
      expect(sharePort.shareLinkStatus).not.toHaveBeenCalled();
      expect(sharePort.issueShareLink).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(byTestId("done-heading"));
    });

    it("draws no link to WhatsApp yet", async () => {
      await mountDoneScreen(SENT_ON_SERVER, locale);

      expect(container.querySelector('a[href*="wa.me"]')).toBeNull();
      expect(maybeById("done-whatsapp-open")).toBeNull();
    });
  },
);

describe("a press where no link is active", () => {
  it("reads the status, then issues exactly once, and shows the link after", async () => {
    await mountDoneScreen();

    await press("done-whatsapp-send");

    expect(sharePort.shareLinkStatus).toHaveBeenCalledTimes(1);
    expect(sharePort.shareLinkStatus).toHaveBeenCalledWith(DESIGN_ID);
    expect(sharePort.issueShareLink).toHaveBeenCalledTimes(1);
    expect(sharePort.issueShareLink).toHaveBeenCalledWith(DESIGN_ID);
    expect(maybeById("done-whatsapp-open")).not.toBeNull();
    expect(maybeById("done-whatsapp-send")).toBeNull();
  });

  it("is busy and announced as such while the status is read, and a second press makes no second request", async () => {
    const status = pendingRequest<boolean>();
    sharePort.shareLinkStatus.mockReturnValue(status.promise);
    await mountDoneScreen();

    await press("done-whatsapp-send");
    await press("done-whatsapp-send");

    const button = byTestId("done-whatsapp-send");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(sharePort.shareLinkStatus).toHaveBeenCalledTimes(1);
    expect(sharePort.issueShareLink).not.toHaveBeenCalled();

    status.resolve(false);
    await flush();
    expect(sharePort.issueShareLink).toHaveBeenCalledTimes(1);
  });

  it("is busy while the link is made, and presses meanwhile make no second link", async () => {
    const issued = pendingRequest<string>();
    sharePort.issueShareLink.mockReturnValue(issued.promise);
    await mountDoneScreen();

    await press("done-whatsapp-send");
    await press("done-whatsapp-send");

    const button = byTestId("done-whatsapp-send");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(maybeById("done-whatsapp-open")).toBeNull();
    expect(sharePort.shareLinkStatus).toHaveBeenCalledTimes(1);
    expect(sharePort.issueShareLink).toHaveBeenCalledTimes(1);

    issued.resolve(SHARE_PATH);
    await flush();
    expect(maybeById("done-whatsapp-open")).not.toBeNull();
  });

  it("keeps the pressed button focused while it is busy, and moves focus to the link when the link arrives", async () => {
    const issued = pendingRequest<string>();
    sharePort.issueShareLink.mockReturnValue(issued.promise);
    await mountDoneScreen();

    await press("done-whatsapp-send");
    expect(document.activeElement).toBe(byTestId("done-whatsapp-send"));

    issued.resolve(SHARE_PATH);
    await flush();
    expect(document.activeElement).toBe(byTestId("done-whatsapp-open"));
  });
});

describe("a press where a link is already active", () => {
  beforeEach(() => {
    sharePort.shareLinkStatus.mockResolvedValue(true);
  });

  it.each(["ro", "ru"] as const)(
    "shows the reissue warning in %s and issues nothing until the customer goes on",
    async (locale) => {
      await mountDoneScreen(SENT_ON_SERVER, locale);

      await press("done-whatsapp-send");

      const content = contentIn(locale);
      expect(byTestId("done-whatsapp-reissue-warning").textContent).toBe(
        content.share.reissueWarning,
      );
      expect(byTestId("done-whatsapp-go-on").textContent).toBe(
        content.share.reissue,
      );
      expect(sharePort.issueShareLink).not.toHaveBeenCalled();
      expect(maybeById("done-whatsapp-open")).toBeNull();
    },
  );

  it("moves focus to the button that goes on, which is described by the warning", async () => {
    await mountDoneScreen();

    await press("done-whatsapp-send");

    const goOn = byTestId("done-whatsapp-go-on");
    const warning = byTestId("done-whatsapp-reissue-warning");
    expect(document.activeElement).toBe(goOn);
    expect(goOn.getAttribute("aria-describedby")).toBe(warning.id);
    expect(warning.id).not.toBe("");
    expect(warning.closest('[role="status"]')).not.toBeNull();
  });

  it("issues exactly one link when the customer goes on, however often they press", async () => {
    await mountDoneScreen();
    await press("done-whatsapp-send");

    act(() => {
      const goOn = byTestId("done-whatsapp-go-on");
      goOn.dispatchEvent(new Event("click", { bubbles: true }));
      goOn.dispatchEvent(new Event("click", { bubbles: true }));
    });
    await flush();

    expect(sharePort.issueShareLink).toHaveBeenCalledTimes(1);
    expect(sharePort.shareLinkStatus).toHaveBeenCalledTimes(1);
    expect(maybeById("done-whatsapp-open")).not.toBeNull();
    expect(maybeById("done-whatsapp-reissue-warning")).toBeNull();
  });
});

describe.each(["ro", "ru"] as const)(
  "the link to WhatsApp, in %s",
  (locale) => {
    async function mountWithTheLink(): Promise<void> {
      await mountDoneScreen(SENT_ON_SERVER, locale);
      await press("done-whatsapp-send");
    }

    it("is an external anchor that opens in a new tab and hands WhatsApp neither opener nor referrer", async () => {
      await mountWithTheLink();

      const link = byTestId("done-whatsapp-open");
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("target")).toBe("_blank");
      const relationships = (link.getAttribute("rel") ?? "").split(/\s+/);
      expect(relationships).toContain("noopener");
      expect(relationships).toContain("noreferrer");
      expect(link.textContent).toBe(
        contentIn(locale).submissionResult.openWhatsapp,
      );
    });

    it("leads to the shop's wa.me address with the drafted message, and nothing else, as the one encoded value", async () => {
      await mountWithTheLink();

      const expectedMessage = contentIn(
        locale,
      ).submissionResult.whatsappMessageToShop({
        reference: REFERENCE,
        link: SHARE_ADDRESS,
      });
      expect(openingAddress()).toBe(
        `${WHATSAPP_PREFIX}${encodeURIComponent(expectedMessage)}`,
      );
      const parsed = new URL(openingAddress());
      expect(parsed.protocol).toBe("https:");
      expect(parsed.host).toBe("wa.me");
      expect(parsed.pathname).toBe(`/${SHOP_DIGITS}`);
      expect(SHOP_DIGITS).toMatch(/^\d+$/);
      expect([...parsed.searchParams.keys()]).toEqual(["text"]);
      expect(parsed.hash).toBe("");
      expect(parsed.searchParams.get("text")).toBe(expectedMessage);
    });

    it("encodes every character that could end the value early, and nothing else survives raw", async () => {
      await mountWithTheLink();

      const encodedValue = openingAddress().slice(WHATSAPP_PREFIX.length);
      expect(encodedValue).toMatch(/^[A-Za-z0-9\-_.!~*'()%]+$/);
      expect(encodedValue).toContain(encodeURIComponent(SHARE_ADDRESS));
      expect(encodedValue).not.toContain(" ");
      expect(encodedValue).not.toMatch(/[&#?=/]/);
    });

    it("carries the share address, the request's reference and the drafted sentence, and no typed value, price or token apart from the link's own", async () => {
      rememberSentRequest({
        designId: DESIGN_ID,
        revision: REVISION,
        reference: REFERENCE,
        channel: "whatsapp",
        contactValue: TYPED_PHONE,
      });
      await mountWithTheLink();

      const message = draftedMessage();
      expect(message).toBe(
        contentIn(locale).submissionResult.whatsappMessageToShop({
          reference: REFERENCE,
          link: SHARE_ADDRESS,
        }),
      );
      expect(message).toContain(SHARE_ADDRESS);
      expect(message).toContain(REFERENCE);
      expect(message).not.toContain(TYPED_PHONE);
      expect(message).not.toContain(DESIGN_ID);
      expect(message).not.toMatch(/\d\s?(?:lei|mdl|eur|€|\$|руб|лей)/i);
    });

    it("puts the share address nowhere else on the page: not in text, a field or another attribute", async () => {
      await mountWithTheLink();

      const token = SHARE_PATH.slice(3);
      expect(container.textContent).not.toContain(token);
      expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
      const carriers = [...container.querySelectorAll("*")].filter((element) =>
        [...element.attributes].some((attribute) =>
          attribute.value.includes(token),
        ),
      );
      expect(carriers).toEqual([byTestId("done-whatsapp-open")]);
    });
  },
);

describe.each(["ro", "ru"] as const)(
  "the reference in the message, in %s",
  (locale) => {
    function expectedMessageFor(reference: string): string {
      return contentIn(locale).submissionResult.whatsappMessageToShop({
        reference,
        link: SHARE_ADDRESS,
      });
    }

    it("is the hand-over's, not the server's, when the request was handed over from this tab", async () => {
      const handedOverReference = "LM-HANDED-OVER";
      rememberSentRequest({
        designId: DESIGN_ID,
        revision: REVISION,
        reference: handedOverReference,
        channel: "whatsapp",
        contactValue: TYPED_PHONE,
      });
      await mountDoneScreen(SENT_ON_SERVER, locale);
      await press("done-whatsapp-send");

      expect(draftedMessage()).toBe(expectedMessageFor(handedOverReference));
      expect(draftedMessage()).not.toContain(REFERENCE);
    });

    it("is the server's after a reload, when the server alone names the request", async () => {
      await mountDoneScreen(SENT_ON_SERVER, locale);
      await press("done-whatsapp-send");

      expect(draftedMessage()).toBe(expectedMessageFor(REFERENCE));
    });
  },
);

describe("write access, after a reload (F3)", () => {
  it("leaves the store's answer as it was found, through every step to the link", async () => {
    useConfiguratorStore.setState({ canWrite: "checking" });
    await mountDoneScreen();

    await press("done-whatsapp-send");

    expect(maybeById("done-whatsapp-open")).not.toBeNull();
    expect(useConfiguratorStore.getState().canWrite).toBe("checking");
  });

  it("leaves a failed check as it was found when the share request is refused", async () => {
    useConfiguratorStore.setState({ canWrite: "check-failed" });
    sharePort.shareLinkStatus.mockRejectedValue(new Error("404"));
    await mountDoneScreen();

    await press("done-whatsapp-send");

    expect(byTestId("done-whatsapp-error").textContent).toBe(
      contentIn("ro").share.error,
    );
    expect(useConfiguratorStore.getState().canWrite).toBe("check-failed");
    await flush();
    expect(sharePort.shareLinkStatus).toHaveBeenCalledTimes(1);
    expect(sharePort.issueShareLink).not.toHaveBeenCalled();
  });

  it("makes no request until the customer presses", async () => {
    useConfiguratorStore.setState({ canWrite: "checking" });

    await mountDoneScreen();

    expect(sharePort.shareLinkStatus).not.toHaveBeenCalled();
    expect(sharePort.issueShareLink).not.toHaveBeenCalled();
  });
});

describe("a request that fails", () => {
  const FAILURE_WITH_CODE = Object.assign(new Error("503 SHARE_BACKEND_DOWN"), {
    code: "SHARE_BACKEND_DOWN",
  });

  it.each(["ro", "ru"] as const)(
    "tells a failed status read in %s by the share control's sentence, shows no code, and moves focus to the retry",
    async (locale) => {
      sharePort.shareLinkStatus.mockRejectedValue(FAILURE_WITH_CODE);
      await mountDoneScreen(SENT_ON_SERVER, locale);

      await press("done-whatsapp-send");

      const content = contentIn(locale);
      expect(byTestId("done-whatsapp-error").textContent).toBe(
        content.share.error,
      );
      expect(byTestId("done-whatsapp-retry").textContent).toBe(
        content.share.retry,
      );
      expect(document.activeElement).toBe(byTestId("done-whatsapp-retry"));
      expect(container.textContent).not.toContain("503");
      expect(container.textContent).not.toContain("SHARE_BACKEND_DOWN");
      expect(sharePort.issueShareLink).not.toHaveBeenCalled();
    },
  );

  it("repeats the status read, and not the issue, when a status read failed", async () => {
    sharePort.shareLinkStatus.mockRejectedValueOnce(FAILURE_WITH_CODE);
    await mountDoneScreen();
    await press("done-whatsapp-send");

    await press("done-whatsapp-retry");

    expect(sharePort.shareLinkStatus).toHaveBeenCalledTimes(2);
    expect(sharePort.issueShareLink).toHaveBeenCalledTimes(1);
    expect(maybeById("done-whatsapp-open")).not.toBeNull();
    expect(maybeById("done-whatsapp-error")).toBeNull();
  });

  it("repeats the issue alone, and does not read the status again, when the issue failed", async () => {
    sharePort.issueShareLink.mockRejectedValueOnce(FAILURE_WITH_CODE);
    await mountDoneScreen();
    await press("done-whatsapp-send");
    expect(byTestId("done-whatsapp-error")).not.toBeNull();

    await press("done-whatsapp-retry");

    expect(sharePort.shareLinkStatus).toHaveBeenCalledTimes(1);
    expect(sharePort.issueShareLink).toHaveBeenCalledTimes(2);
    expect(maybeById("done-whatsapp-open")).not.toBeNull();
  });

  it("keeps a retry that is pressed twice to one request", async () => {
    sharePort.issueShareLink.mockRejectedValueOnce(FAILURE_WITH_CODE);
    await mountDoneScreen();
    await press("done-whatsapp-send");
    const issued = pendingRequest<string>();
    sharePort.issueShareLink.mockReturnValue(issued.promise);

    act(() => {
      const retry = byTestId("done-whatsapp-retry");
      retry.dispatchEvent(new Event("click", { bubbles: true }));
      retry.dispatchEvent(new Event("click", { bubbles: true }));
    });
    await flush();

    expect(sharePort.issueShareLink).toHaveBeenCalledTimes(2);
  });
});

describe("what the action never does", () => {
  it("opens no window, writes no browser store, adds no history entry and logs nothing, from the first press to the link", async () => {
    const openedWindow = vi.fn();
    vi.stubGlobal("open", openedWindow);
    const consoleCalls = (
      ["log", "info", "warn", "error", "debug"] as const
    ).map((method) => vi.spyOn(console, method));
    const historyLength = window.history.length;
    await mountDoneScreen();

    await press("done-whatsapp-send");

    expect(maybeById("done-whatsapp-open")).not.toBeNull();
    expect(openedWindow).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
    expect(window.history.length).toBe(historyLength);
    for (const call of consoleCalls) expect(call).not.toHaveBeenCalled();
  });

  it("keeps the share address out of the store the editor reads", async () => {
    await mountDoneScreen();

    await press("done-whatsapp-send");

    expect(JSON.stringify(useConfiguratorStore.getState())).not.toContain(
      SHARE_PATH.slice(3),
    );
  });

  it("issues the link of the page's own design", async () => {
    await mountDoneScreen();

    await press("done-whatsapp-send");

    expect(sharePort.issueShareLink.mock.calls).toEqual([[DESIGN_ID]]);
  });
});
