// @vitest-environment happy-dom
//
// Frame 5B, the contact page's state for a send that did not arrive, and the callback form's sent view. The screen is
// mounted as a customer meets it (the real hook, the real browser connection, a `fetch` the test answers); what is
// asserted is which answers leave the form for 5B, what 5B keeps and says, where focus is, what the connection's
// events do, and what comes back when an answer is not 5B's. The scene probe, the locale menu and the router are stubs.
//
// What this cannot see: layout, the 44 px of a control as painted, and whether a phone's browser fires `online` on
// return (the e2e and 8T). Whether `online` and `offline` are fired by the browser is replaced here by events the test
// dispatches on `window`, which is the one place the page listens.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => router,
}));
vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div", { "data-testid": "locale-menu" }),
}));
vi.mock("@/components/webgl-unavailable", () => ({
  WebGLUnavailable: () => createElement("main"),
}));

import { CallbackContactScreen } from "@/contact/contact-screen";
import { failureScreenAfter } from "@/contact/submission-failure";
import type { ContactSubmissionPhase } from "@/contact/use-contact-submission";
import { shopTelAddress } from "@/shop/shop-phone";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  elementIn,
  fillWholeForm,
  inputNamed,
  MESSAGES,
  mountContactScreen,
  pressCallToAction,
  recordTraffic,
  typeInto,
  VALID_PHONE,
  type MountedScreen,
  type RecordedTraffic,
  type ScreenLocale,
  type ServerAnswer,
} from "./contact-screen-harness";
import { editWithoutSaving, landSave } from "./contact-submission-harness";
import { contentFor } from "../support/catalogues";

const RO_CONTENT = contentFor("ro", MESSAGES.ro);
const ERROR_CODE_PATTERN = /[A-Z]{2,}_[A-Z_]+/;
const THREE_DIGIT_STATUS = /\b\d{3}\b/;
const TYPED_PHONE = `  ${VALID_PHONE}  `;
const SENT: ServerAnswer = {
  status: 200,
  body: { status: "sent", reference: "LM-1234" },
};
const SERVICE_FAILURE: ServerAnswer = {
  status: 503,
  body: { code: "CONTACT_UNAVAILABLE" },
};
const CONFLICT: ServerAnswer = {
  status: 409,
  body: { code: "CONTACT_REQUEST_CONFLICT" },
};

/** Every answer 8L.7 puts on 5B's not-sent screen, and the press nothing could be made of is tested apart. */
const ANSWERED_FAILURES: readonly (readonly [string, ServerAnswer])[] = [
  ["a 503", SERVICE_FAILURE],
  [
    "a 502 whose notice was refused",
    { status: 502, body: { code: "CONTACT_NOTICE_NOT_SENT" } },
  ],
  [
    "a 502 that may be retried",
    { status: 502, body: { code: "CONTACT_NOTICE_NOT_SENT_RETRY" } },
  ],
  ["a rejection", { status: 400, body: { code: "CONTACT_REJECTED" } }],
  ["another 500", { status: 500, body: { code: "SOMETHING_ELSE" } }],
  ["a 200 that is not a sent line", { status: 200, body: { odd: true } }],
];

let traffic: RecordedTraffic;
let screen: MountedScreen | undefined;
let isOnline = true;

beforeEach(() => {
  traffic = recordTraffic();
  router.replace.mockReset();
  isOnline = true;
  vi.spyOn(window.navigator, "onLine", "get").mockImplementation(
    () => isOnline,
  );
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(locale: ScreenLocale = "ro"): HTMLElement {
  screen = mountContactScreen({ locale });
  return screen.container;
}

function sendTheWholeForm(container: HTMLElement): void {
  fillWholeForm(container);
  pressCallToAction(container);
}

/** The browser's connection changes, and says so as it does: the flag first, then the event. */
function setConnection(online: boolean): void {
  isOnline = online;
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
}

function byTestId(container: ParentNode, testId: string): HTMLElement {
  return elementIn(container, `[data-testid="${testId}"]`);
}

function maybeByTestId(container: ParentNode, testId: string): Element | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function pressRetry(container: ParentNode): void {
  act(() => {
    byTestId(container, "contact-retry").click();
  });
}

function sentenceOf(container: ParentNode): string {
  return byTestId(container, "failure-sentence").textContent;
}

async function sendAndLoseTheAnswer(container: HTMLElement): Promise<void> {
  sendTheWholeForm(container);
  await traffic.answerOldest("network-failure");
}

describe("frame 5B: a request with no answer", () => {
  it("replaces the form with the lost-connection screen, and nothing of the form is drawn", async () => {
    const container = mount();

    await sendAndLoseTheAnswer(container);

    const failure = byTestId(container, "submission-failure");
    expect(failure.getAttribute("data-screen")).toBe("lost-connection");
    expect(byTestId(container, "failure-heading").textContent).toBe(
      MESSAGES.ro.submissionResult.failureHeading,
    );
    expect(sentenceOf(container)).toBe(
      MESSAGES.ro.submissionResult.failureLostConnection,
    );
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(maybeByTestId(container, "contact-cta")).toBeNull();
    expect(maybeByTestId(container, "contact-outcome")).toBeNull();
  });

  it("moves focus to its h1 as it replaces the form, and draws one h1", async () => {
    const container = mount();

    await sendAndLoseTheAnswer(container);

    const heading = byTestId(container, "failure-heading");
    expect(heading.tagName).toBe("H1");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(document.activeElement).toBe(heading);
  });

  it("keeps the contact page's own bar and draws no check mark or claim of a send", async () => {
    const container = mount();

    await sendAndLoseTheAnswer(container);

    expect(byTestId(container, "contact-top-bar-title").textContent).toBe(
      MESSAGES.ro.contact.topBarTitle,
    );
    expect(byTestId(container, "contact-back")).not.toBeNull();
    expect(container.textContent).not.toContain("✓");
    expect(container.textContent).not.toContain(
      MESSAGES.ro.submissionResult.topBarTitle,
    );
    expect(container.textContent).not.toContain(
      MESSAGES.ro.submissionResult.sentHeading,
    );
  });

  it("hides the disc from assistive technology and says its sentence in a polite live region", async () => {
    const container = mount();

    await sendAndLoseTheAnswer(container);

    const disc = elementIn(container, '[data-testid="failure-heading"]')
      .parentElement?.firstElementChild;
    expect(disc?.getAttribute("aria-hidden")).toBe("true");
    expect(byTestId(container, "failure-sentence").getAttribute("role")).toBe(
      "status",
    );
  });

  it("draws one call link to the shop under the retry, as frame 5B places it, and no other link but the way back", async () => {
    const container = mount();

    await sendAndLoseTheAnswer(container);

    const call = byTestId(container, "call-shop-link");
    expect(call.getAttribute("href")).toBe(shopTelAddress());
    expect(call.textContent).toContain(MESSAGES.ro.submissionResult.callShop);
    expect(container.querySelectorAll('a[href^="tel:"]')).toHaveLength(1);
    expect(container.querySelectorAll("a")).toHaveLength(2);
    expect(
      byTestId(container, "contact-retry").compareDocumentPosition(call) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each(ANSWERED_FAILURES)(
    "draws the call link on the not-sent screen for %s",
    async (_name, answer) => {
      const container = mount();
      sendTheWholeForm(container);

      await traffic.answerOldest(answer);

      expect(
        byTestId(container, "submission-failure").getAttribute("data-screen"),
      ).toBe("not-sent");
      expect(byTestId(container, "call-shop-link").getAttribute("href")).toBe(
        shopTelAddress(),
      );
    },
  );

  it("labels the call link in Russian in the Russian page", async () => {
    const container = mount("ru");

    await sendAndLoseTheAnswer(container);

    expect(byTestId(container, "call-shop-link").textContent).toContain(
      MESSAGES.ru.submissionResult.callShop,
    );
  });

  it("draws no code and no status in what it says", async () => {
    const container = mount();

    await sendAndLoseTheAnswer(container);

    const said = [
      "failure-heading",
      "failure-sentence",
      "failure-kept-sentence",
      "failure-automatic-retry",
    ]
      .map((testId) => byTestId(container, testId).textContent)
      .join(" ");
    expect(said).not.toMatch(ERROR_CODE_PATTERN);
    expect(said).not.toMatch(THREE_DIGIT_STATUS);
  });

  it("says in Russian what it says in Romanian", async () => {
    const container = mount("ru");

    await sendAndLoseTheAnswer(container);

    const copy = MESSAGES.ru.submissionResult;
    expect(byTestId(container, "failure-heading").textContent).toBe(
      copy.failureHeading,
    );
    expect(sentenceOf(container)).toBe(copy.failureLostConnection);
    expect(byTestId(container, "failure-kept-sentence").textContent).toBe(
      copy.failureKept,
    );
    expect(byTestId(container, "failure-automatic-retry").textContent).toBe(
      copy.retryAutomatically,
    );
    expect(byTestId(container, "contact-retry").textContent).toBe(
      MESSAGES.ru.contact.retry,
    );
  });
});

describe("frame 5B: a request that was answered and failed", () => {
  it.each(ANSWERED_FAILURES)(
    "is the not-sent screen for %s, with no automatic-retry line",
    async (_name, answer) => {
      const container = mount();
      sendTheWholeForm(container);

      await traffic.answerOldest(answer);

      expect(
        byTestId(container, "submission-failure").getAttribute("data-screen"),
      ).toBe("not-sent");
      expect(sentenceOf(container)).toBe(
        MESSAGES.ro.submissionResult.failureNotSent,
      );
      expect(maybeByTestId(container, "failure-automatic-retry")).toBeNull();
      expect(document.activeElement).toBe(
        byTestId(container, "failure-heading"),
      );
      expect(container.textContent).not.toMatch(ERROR_CODE_PATTERN);
    },
  );

  it("is the not-sent screen for a press nothing could be made of, and sends nothing", () => {
    const container = mount();
    fillWholeForm(container);
    typeInto(
      elementIn(container, 'input[name="reference_note"]', HTMLInputElement),
      "x".repeat(257),
    );

    pressCallToAction(container);

    expect(traffic.contactBodies).toHaveLength(0);
    expect(sentenceOf(container)).toBe(
      MESSAGES.ro.submissionResult.failureNotSent,
    );
  });

  it("is the not-sent screen when no issue names a field of the form", async () => {
    const container = mount();
    sendTheWholeForm(container);

    await traffic.answerOldest({
      status: 400,
      body: {
        code: "CONTACT_INVALID",
        issues: [{ field: "locale", code: "UNKNOWN_LOCALE" }],
      },
    });

    expect(sentenceOf(container)).toBe(
      MESSAGES.ro.submissionResult.failureNotSent,
    );
  });

  it("says in Russian that the request did not arrive", async () => {
    const container = mount("ru");
    sendTheWholeForm(container);

    await traffic.answerOldest(SERVICE_FAILURE);

    expect(sentenceOf(container)).toBe(
      MESSAGES.ru.submissionResult.failureNotSent,
    );
  });
});

describe("the classes that keep the form", () => {
  it.each([
    ["a conflict", CONFLICT, "conflict"],
    [
      "a design that is not current",
      { status: 409, body: { code: "CONTACT_DESIGN_NOT_CURRENT" } },
      "design-not-current",
    ],
    [
      "a wait",
      {
        status: 429,
        body: { code: "CONTACT_LIMIT_REACHED" },
        headers: { "retry-after": "60" },
      },
      "limited",
    ],
  ] as const)(
    "does not leave the form for %s: its sentence stands beside it",
    async (_name, answer, outcomeClass) => {
      const container = mount();
      sendTheWholeForm(container);

      await traffic.answerOldest(answer);

      expect(maybeByTestId(container, "submission-failure")).toBeNull();
      expect(
        byTestId(container, "contact-outcome").getAttribute("data-outcome"),
      ).toBe(outcomeClass);
      expect(container.querySelector("form")).not.toBeNull();
    },
  );
});

describe("what 5B keeps", () => {
  it("shows the design's card and the one typed value, trimmed, under the kept title", async () => {
    const container = mount();
    fillWholeForm(container);
    typeInto(inputNamed(container, "phone"), TYPED_PHONE);
    pressCallToAction(container);
    await traffic.answerOldest("network-failure");

    const kept = byTestId(container, "failure-kept");
    expect(kept.querySelector("h2")?.textContent).toBe(
      MESSAGES.ro.submissionResult.keptTitle,
    );
    expect(maybeByTestId(kept, "contact-design-card")).not.toBeNull();
    expect(kept.textContent).toContain(
      MESSAGES.ro.submissionResult.keptContact,
    );
    expect(byTestId(kept, "failure-contact-value").textContent).toBe(
      VALID_PHONE,
    );
    expect(byTestId(container, "failure-kept-sentence").textContent).toBe(
      MESSAGES.ro.submissionResult.failureKept,
    );
  });

  it("shows the e-mail address, and not the phone, when the channel is e-mail", async () => {
    const container = mount();
    fillWholeForm(container);
    act(() => {
      elementIn(
        container,
        'input[name="channel"][value="email"]',
        HTMLInputElement,
      ).click();
    });
    typeInto(inputNamed(container, "email"), "ana@example.com");
    pressCallToAction(container);
    await traffic.answerOldest("network-failure");

    const value = byTestId(container, "failure-contact-value").textContent;
    expect(value).toBe("ana@example.com");
    expect(byTestId(container, "failure-kept").textContent).not.toContain(
      VALID_PHONE,
    );
  });

  it("draws no name and no locality, which are not what the shop would use to reach the customer", async () => {
    const container = mount();

    await sendAndLoseTheAnswer(container);

    expect(container.textContent).not.toContain("Ana Popescu");
    expect(container.textContent).not.toContain("Chisinau");
  });

  it("sends the same request again from 5B, with the same id and the same contact", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);

    pressRetry(container);

    expect(traffic.contactBodies).toHaveLength(2);
    const [first, second] = traffic.contactBodies;
    expect(second).toMatchObject({
      clientRequestId: first?.clientRequestId,
      contact: first?.contact,
      design: first?.design,
    });
  });

  it("shows what was typed in the form again when an answer sends it back there", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);
    pressRetry(container);

    await traffic.answerOldest(CONFLICT);

    expect(inputNamed(container, "phone").value).toBe(VALID_PHONE);
    expect(inputNamed(container, "name").value).toBe("Ana Popescu");
    expect(inputNamed(container, "consent").checked).toBe(true);
  });
});

describe("the retry on 5B", () => {
  it("shows the sending label, off, while the retry is out, and is not frame 4C", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);

    pressRetry(container);

    const retry = byTestId(container, "contact-retry");
    expect(retry.textContent).toBe(MESSAGES.ro.contact.sending);
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    expect(maybeByTestId(container, "submission-failure")).not.toBeNull();
    expect(maybeByTestId(container, "contact-sending-line")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });

  it("makes one request for two presses in one task", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);

    act(() => {
      byTestId(container, "contact-retry").click();
      byTestId(container, "contact-retry").click();
    });

    expect(traffic.contactBodies).toHaveLength(2);
  });

  it("keeps the focus where it was through a retry and its answer, and moves nothing when the answer changes the sentence", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);
    const heading = byTestId(container, "failure-heading");
    const retry = byTestId(container, "contact-retry");
    act(() => {
      retry.focus();
    });

    pressRetry(container);
    await traffic.answerOldest(SERVICE_FAILURE);

    expect(byTestId(container, "failure-heading")).toBe(heading);
    expect(byTestId(container, "contact-retry")).toBe(retry);
    expect(document.activeElement).toBe(retry);
    expect(sentenceOf(container)).toBe(
      MESSAGES.ro.submissionResult.failureNotSent,
    );
    expect(retry.textContent).toBe(MESSAGES.ro.contact.retry);
  });

  it("changes the sentence in the same live region, so the change is announced", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);
    const region = byTestId(container, "failure-sentence");

    pressRetry(container);
    await traffic.answerOldest(SERVICE_FAILURE);

    expect(byTestId(container, "failure-sentence")).toBe(region);
    expect(region.getAttribute("role")).toBe("status");
  });

  it("is a failure again, still on 5B, when the retry gets no answer either", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);

    pressRetry(container);
    await traffic.answerOldest("network-failure");

    expect(sentenceOf(container)).toBe(
      MESSAGES.ro.submissionResult.failureLostConnection,
    );
    expect(byTestId(container, "contact-retry").textContent).toBe(
      MESSAGES.ro.contact.retry,
    );
  });

  it("leaves 5B for the design's confirmation when the retry is sent", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);

    pressRetry(container);
    await traffic.answerOldest(SENT);

    expect(router.replace.mock.calls).toHaveLength(1);
    expect(maybeByTestId(container, "submission-failure")).toBeNull();
  });

  it("returns to the form with the class's own sentence when the retry's answer is one the form tells, and focuses the heading", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);

    pressRetry(container);
    await traffic.answerOldest(CONFLICT);

    expect(maybeByTestId(container, "submission-failure")).toBeNull();
    expect(
      byTestId(container, "contact-outcome").getAttribute("data-outcome"),
    ).toBe("conflict");
    expect(document.activeElement).toBe(elementIn(container, "h1"));
    expect(elementIn(container, "h1").textContent).toBe(
      MESSAGES.ro.contact.heading,
    );
  });

  it("does not take the focus from the page's first drawing of the form", () => {
    const container = mount();

    expect(document.activeElement).not.toBe(elementIn(container, "h1"));
  });

  it("is off, and says so, while an edit is unsaved: nothing is sent from it, and it sends once the save has landed", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);

    editWithoutSaving("edited-in-the-editor");

    const retry = byTestId(container, "contact-retry");
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    pressRetry(container);
    expect(traffic.contactBodies).toHaveLength(1);

    landSave("5");

    expect(
      byTestId(container, "contact-retry").getAttribute("aria-disabled"),
    ).toBeNull();
    pressRetry(container);
    expect(traffic.contactBodies).toHaveLength(2);
  });
});

describe("5B and the connection", () => {
  it("draws the waiting line, as a status, only while the browser says it is offline", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);
    expect(maybeByTestId(container, "failure-waiting")).toBeNull();

    setConnection(false);

    const waiting = byTestId(container, "failure-waiting");
    expect(waiting.getAttribute("role")).toBe("status");
    expect(waiting.textContent).toBe(
      MESSAGES.ro.submissionResult.waitingForConnection,
    );

    setConnection(true);

    expect(maybeByTestId(container, "failure-waiting")).toBeNull();
  });

  it("draws the waiting line at once for a request that got no answer while offline", async () => {
    const container = mount();
    fillWholeForm(container);
    isOnline = false;
    pressCallToAction(container);

    await traffic.answerOldest("network-failure");

    expect(maybeByTestId(container, "failure-waiting")).not.toBeNull();
  });

  it("draws no waiting line on the not-sent screen, offline or not", async () => {
    const container = mount();
    sendTheWholeForm(container);
    await traffic.answerOldest(SERVICE_FAILURE);

    setConnection(false);

    expect(maybeByTestId(container, "failure-waiting")).toBeNull();
  });

  it("sends the same request once when the connection returns, and none for an event that follows", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);
    setConnection(false);

    setConnection(true);

    expect(traffic.contactBodies).toHaveLength(2);
    const [first, second] = traffic.contactBodies;
    expect(second?.clientRequestId).toBe(first?.clientRequestId);
    expect(byTestId(container, "contact-retry").textContent).toBe(
      MESSAGES.ro.contact.sending,
    );
    expect(maybeByTestId(container, "failure-waiting")).toBeNull();
    setConnection(true);
    expect(traffic.contactBodies).toHaveLength(2);
  });

  it("goes on to the confirmation when the retry that the connection's return made is sent", async () => {
    const container = mount();
    await sendAndLoseTheAnswer(container);

    setConnection(true);
    await traffic.answerOldest(SENT);

    expect(router.replace.mock.calls).toHaveLength(1);
    expect(maybeByTestId(container, "submission-failure")).toBeNull();
  });

  it("sends nothing when the connection returns after an answered failure", async () => {
    const container = mount();
    sendTheWholeForm(container);
    await traffic.answerOldest(SERVICE_FAILURE);

    setConnection(true);

    expect(traffic.contactBodies).toHaveLength(1);
  });
});

describe("failureScreenAfter", () => {
  const unanswered: ContactSubmissionPhase = {
    kind: "failed",
    outcome: { kind: "unanswered" },
    waitsUntilMs: undefined,
  };
  const failed: ContactSubmissionPhase = {
    kind: "failed",
    outcome: { kind: "failed" },
    waitsUntilMs: undefined,
  };
  const conflict: ContactSubmissionPhase = {
    kind: "failed",
    outcome: { kind: "conflict" },
    waitsUntilMs: undefined,
  };

  it.each([
    [
      "the first answer that got none",
      undefined,
      unanswered,
      "lost-connection",
    ],
    ["the first answer that failed", undefined, failed, "not-sent"],
    [
      "a retry out from the lost-connection screen",
      "lost-connection",
      { kind: "sending" },
      "lost-connection",
    ],
    [
      "a retry out from the not-sent screen",
      "not-sent",
      { kind: "sending" },
      "not-sent",
    ],
    ["a press out from the form", undefined, { kind: "sending" }, undefined],
    [
      "an answer the form tells, after a retry",
      "not-sent",
      conflict,
      undefined,
    ],
    [
      "a send, after a retry",
      "lost-connection",
      { kind: "sent", reference: "R" },
      undefined,
    ],
    [
      "a failure after a retry from the other screen",
      "lost-connection",
      failed,
      "not-sent",
    ],
  ] as const)("is %s", (_name, shown, phase, expected) => {
    expect(failureScreenAfter(shown, phase)).toBe(expected);
  });
});

describe("the callback form", () => {
  let unmount: () => void;

  function mountCallback(locale: ScreenLocale = "ro"): HTMLElement {
    useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(NextIntlClientProvider, {
          locale,
          messages: MESSAGES[locale] as typeof MESSAGES.ro,
          timeZone: "Europe/Chisinau",
          children: createElement(CallbackContactScreen, { isSendable: true }),
        }),
      );
    });
    unmount = () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    };
    return container;
  }

  afterEach(() => {
    unmount();
  });

  it("tells a request with no answer on 5B with no card, and the sentence that keeps the details alone", async () => {
    const container = mountCallback();
    sendTheWholeForm(container);

    await traffic.answerOldest("network-failure");

    expect(sentenceOf(container)).toBe(
      MESSAGES.ro.submissionResult.failureLostConnection,
    );
    expect(byTestId(container, "failure-kept-sentence").textContent).toBe(
      MESSAGES.ro.submissionResult.failureKeptNoDesign,
    );
    expect(maybeByTestId(container, "contact-design-card")).toBeNull();
    expect(byTestId(container, "failure-contact-value").textContent).toBe(
      VALID_PHONE,
    );
    expect(document.activeElement).toBe(byTestId(container, "failure-heading"));
  });

  it("draws the call link on 5B for a request with no design, the same link and under the retry", async () => {
    const container = mountCallback();
    sendTheWholeForm(container);

    await traffic.answerOldest("network-failure");

    const call = byTestId(container, "call-shop-link");
    expect(call.getAttribute("href")).toBe(shopTelAddress());
    expect(container.querySelectorAll('a[href^="tel:"]')).toHaveLength(1);
  });

  it("sends the same request again from 5B, and draws its sent view in place when that is sent", async () => {
    const container = mountCallback();
    sendTheWholeForm(container);
    await traffic.answerOldest("network-failure");

    pressRetry(container);
    await traffic.answerOldest(SENT);

    expect(traffic.contactBodies).toHaveLength(2);
    expect(traffic.contactBodies[1]?.clientRequestId).toBe(
      traffic.contactBodies[0]?.clientRequestId,
    );
    expect(maybeByTestId(container, "contact-sent")).not.toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each(["ro", "ru"] as const)(
    "draws the sent view in %s: the heading, the channel line with the typed value, the reference to copy, and nothing of a design",
    async (locale) => {
      const container = mountCallback(locale);
      fillWholeForm(container);
      typeInto(inputNamed(container, "phone"), TYPED_PHONE);
      pressCallToAction(container);

      await traffic.answerOldest(SENT);

      const copy = MESSAGES[locale].submissionResult;
      const sent = byTestId(container, "contact-sent");
      expect(byTestId(sent, "done-heading").textContent).toBe(copy.sentHeading);
      const channelLine = byTestId(sent, "done-channel-line").textContent;
      expect(channelLine).toContain(VALID_PHONE);
      expect(channelLine).not.toBe(copy.channelLineWithoutValue);
      expect(byTestId(sent, "done-reference").textContent).toBe("LM-1234");
      expect(byTestId(sent, "done-copy").textContent).toBe(copy.copy);
      expect(container.querySelector("form")).toBeNull();
      for (const absent of [
        "done-steps",
        "done-picture",
        "done-back-to-design",
        "done-saved-sentence",
      ]) {
        expect(maybeByTestId(container, absent)).toBeNull();
      }
      expect(container.textContent).not.toContain(copy.savedSentence);
      expect(container.textContent).not.toContain(copy.sendOnWhatsapp);
      expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    },
  );

  it("names the typed phone exactly as the request carries it, trimmed", async () => {
    const container = mountCallback();
    fillWholeForm(container);
    typeInto(inputNamed(container, "phone"), TYPED_PHONE);
    pressCallToAction(container);

    await traffic.answerOldest(SENT);

    expect(byTestId(container, "done-channel-line").textContent).toBe(
      RO_CONTENT.submissionResult.channelLine({
        channel: "phone",
        contact: VALID_PHONE,
      }),
    );
  });

  it("moves focus to the sent view's h1, as the one h1 on the page", async () => {
    const container = mountCallback();
    fillWholeForm(container);
    pressCallToAction(container);

    await traffic.answerOldest(SENT);

    expect(document.activeElement).toBe(byTestId(container, "done-heading"));
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("draws a reference that is markup as text, and runs nothing", async () => {
    const container = mountCallback();
    fillWholeForm(container);
    pressCallToAction(container);

    await traffic.answerOldest({
      status: 200,
      body: { status: "sent", reference: "<img src=x onerror=alert(1)>" },
    });

    expect(byTestId(container, "done-reference").textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("names the e-mail address in the channel line when the channel is e-mail", async () => {
    const container = mountCallback();
    fillWholeForm(container);
    act(() => {
      elementIn(
        container,
        'input[name="channel"][value="email"]',
        HTMLInputElement,
      ).click();
    });
    typeInto(inputNamed(container, "email"), "ana@example.com");
    pressCallToAction(container);

    await traffic.answerOldest(SENT);

    expect(byTestId(container, "done-channel-line").textContent).toBe(
      RO_CONTENT.submissionResult.channelLine({
        channel: "email",
        contact: "ana@example.com",
      }),
    );
  });
});
