// @vitest-environment happy-dom
//
// Frame 4C and the answers told beside the form: what the screen is while a request is out, and what each class of
// answer that keeps the form leaves on it. `unanswered` and `failed` leave the form for frame 5B, which is
// submission-failure.dom.test.ts. The scene probe, the locale menu and the editor's exit screen are stubs; every answer
// is the test's own.
//
// What this cannot see: that `inert` blocks a tap or a focus (happy-dom keeps the attribute and nothing more; the
// browser's behaviour is the e2e's), the dimming as painted, and layout. The wait of a limited send is a real second.
import { act, createElement } from "react";
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

import { clockTimeOf } from "@/i18n/clock-time";
import { shopTelAddress } from "@/shop/shop-phone";

import {
  elementIn,
  fillWholeForm,
  inputNamed,
  MESSAGES,
  mountContactScreen,
  pressCallToAction,
  recordTraffic,
  sentencesShown,
  typeInto,
  VALID_PHONE,
  type MountedScreen,
  type RecordedTraffic,
  type ScreenLocale,
  type ServerAnswer,
} from "./contact-screen-harness";
import { DESIGN_ID } from "./contact-submission-harness";

const OUTCOMES = MESSAGES.ro.contact.outcomes;
const ERROR_CODE_PATTERN = /[A-Z]{2,}_[A-Z_]+/;
const ONE_SECOND_WITH_MARGIN_MS = 1200;

const CONFLICT: ServerAnswer = {
  status: 409,
  body: { code: "CONTACT_REQUEST_CONFLICT" },
};
const DESIGN_NOT_CURRENT: ServerAnswer = {
  status: 409,
  body: { code: "CONTACT_DESIGN_NOT_CURRENT" },
};
const DOES_NOT_FIT: ServerAnswer = {
  status: 422,
  body: { code: "CONTACT_DESIGN_DOES_NOT_FIT", placementIds: [] },
};
const SENT: ServerAnswer = {
  status: 200,
  body: { status: "sent", reference: "LM-1234" },
};

let screen: MountedScreen;
let traffic: RecordedTraffic;

function mount(locale: ScreenLocale = "ro"): HTMLElement {
  screen = mountContactScreen({ locale });
  return screen.container;
}

function sendTheWholeForm(container: HTMLElement): void {
  fillWholeForm(container);
  pressCallToAction(container);
}

function ctaOf(container: HTMLElement): HTMLElement {
  return elementIn(container, '[data-testid="contact-cta"]');
}

function outcomeOf(container: HTMLElement): HTMLElement {
  return elementIn(container, '[data-testid="contact-outcome"]');
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

beforeEach(() => {
  traffic = recordTraffic();
  router.replace.mockReset();
});

afterEach(() => {
  screen.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("frame 4C: while a request is out", () => {
  it("shows the sending label and a spinner on a button that is off", () => {
    const container = mount();

    sendTheWholeForm(container);

    const cta = ctaOf(container);
    expect(cta.getAttribute("aria-disabled")).toBe("true");
    expect(cta.textContent).toBe(MESSAGES.ro.contact.sending);
    expect(cta.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("dims the body and the consent and makes both inert, with every value still readable", () => {
    const container = mount();

    sendTheWholeForm(container);

    const body = inputNamed(container, "name").closest("[data-dimmed]");
    const consent = elementIn(container, '[data-testid="contact-consent"]');
    expect(body?.getAttribute("data-dimmed")).toBe("true");
    expect(body?.hasAttribute("inert")).toBe(true);
    expect(consent.getAttribute("data-dimmed")).toBe("true");
    expect(consent.hasAttribute("inert")).toBe(true);
    expect(inputNamed(container, "phone").value).toBe(VALID_PHONE);
    expect(inputNamed(container, "consent").checked).toBe(true);
  });

  it("says not to close the page, over the button", () => {
    const container = mount();

    sendTheWholeForm(container);

    expect(
      elementIn(container, '[data-testid="contact-sending-line"]').textContent,
    ).toBe(MESSAGES.ro.contact.sendingLine);
  });

  it("keeps the consent's checkbox, and does not draw it again, when the request goes out", () => {
    const container = mount();
    fillWholeForm(container);
    const checkbox = inputNamed(container, "consent");

    pressCallToAction(container);

    expect(inputNamed(container, "consent")).toBe(checkbox);
    expect(checkbox.isConnected).toBe(true);
  });

  it("makes one request for two presses in one task", () => {
    const container = mount();
    fillWholeForm(container);

    act(() => {
      ctaOf(container).click();
      ctaOf(container).click();
    });

    expect(traffic.contactBodies).toHaveLength(1);
  });

  it("makes one request for a tap, and one more tap, and a submit by the keyboard", () => {
    const container = mount();
    sendTheWholeForm(container);

    pressCallToAction(container);
    act(() => {
      elementIn(container, "form", HTMLFormElement).requestSubmit();
    });

    expect(traffic.contactBodies).toHaveLength(1);
  });

  it("is the form again, and no longer inert, once the request is answered", async () => {
    const container = mount();
    sendTheWholeForm(container);

    await traffic.answerOldest(CONFLICT);

    expect(
      inputNamed(container, "name")
        .closest("[data-dimmed]")
        ?.hasAttribute("inert"),
    ).toBe(false);
    expect(
      container.querySelector('[data-testid="contact-sending-line"]'),
    ).toBeNull();
    expect(ctaOf(container).textContent).toBe(MESSAGES.ro.contact.callToAction);
  });
});

describe("an answer that names fields", () => {
  const refusedPhone: ServerAnswer = {
    status: 400,
    body: {
      code: "CONTACT_INVALID",
      issues: [{ field: "contact.phone", code: "PHONE_MOLDOVAN_INCOMPLETE" }],
    },
  };

  it("puts each issue's sentence beside its field, and the class's sentence in the pinned region", async () => {
    const container = mount();
    sendTheWholeForm(container);

    await traffic.answerOldest(refusedPhone);

    const phone = inputNamed(container, "phone");
    const beside = phone
      .closest("[data-field-block]")
      ?.querySelector('[role="alert"]');
    expect(beside?.lastElementChild?.textContent).toBe(
      MESSAGES.ro.contact.fieldErrors.PHONE_MOLDOVAN_INCOMPLETE,
    );
    expect(phone.getAttribute("aria-invalid")).toBe("true");
    expect(phone.getAttribute("aria-describedby")).toBe(beside?.id);
    expect(sentencesShown(outcomeOf(container))).toEqual([OUTCOMES.refused]);
    expect(container.textContent).not.toMatch(ERROR_CODE_PATTERN);
  });

  it("takes the issue away from a field once it has been edited, and leaves the others", async () => {
    const container = mount();
    sendTheWholeForm(container);
    await traffic.answerOldest({
      status: 400,
      body: {
        code: "CONTACT_INVALID",
        issues: [
          { field: "contact.phone", code: "PHONE_MOLDOVAN_INCOMPLETE" },
          { field: "contact.name", code: "FORBIDDEN_CHARACTER" },
        ],
      },
    });

    typeInto(inputNamed(container, "phone"), "069 123 457");

    expect(inputNamed(container, "phone").getAttribute("aria-invalid")).toBe(
      null,
    );
    expect(inputNamed(container, "name").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });
});

describe("a conflict", () => {
  it("asks to send again, and the next send is the customer's press with a new id", async () => {
    const container = mount();
    sendTheWholeForm(container);
    await traffic.answerOldest(CONFLICT);

    expect(sentencesShown(outcomeOf(container))).toEqual([OUTCOMES.conflict]);
    expect(ctaOf(container).getAttribute("aria-disabled")).toBeNull();
    pressCallToAction(container);

    expect(traffic.contactBodies).toHaveLength(2);
    expect(traffic.contactBodies[1]?.clientRequestId).not.toBe(
      traffic.contactBodies[0]?.clientRequestId,
    );
  });
});

describe("an answer after which no send is offered", () => {
  it.each([
    [
      "the design is not current",
      DESIGN_NOT_CURRENT,
      OUTCOMES.designNotCurrent,
    ],
    [
      "the design does not fit",
      DOES_NOT_FIT,
      MESSAGES.ro.review.refusalReasons.BODIES_PAST_WALL,
    ],
  ])(
    "%s: tells it, turns the button off beside that sentence and offers the review as a link",
    async (_name, answer, sentence) => {
      const container = mount();
      sendTheWholeForm(container);

      await traffic.answerOldest(answer);

      const outcome = outcomeOf(container);
      const cta = ctaOf(container);
      expect(sentencesShown(outcome)).toEqual([sentence]);
      expect(cta.getAttribute("aria-disabled")).toBe("true");
      expect(cta.getAttribute("aria-describedby")).toBe(
        outcome.querySelector("p")?.id,
      );
      const link = elementIn(
        outcome,
        '[data-testid="contact-outcome-review-link"]',
        HTMLAnchorElement,
      );
      expect(link.getAttribute("href")).toBe(`/ro/d/${DESIGN_ID}/review`);
      expect(link.textContent).toBe(MESSAGES.ro.contact.reviewLink);
      expect(outcome.querySelector('[data-testid="contact-retry"]')).toBeNull();
      expect(container.textContent).not.toMatch(ERROR_CODE_PATTERN);
    },
  );

  it("sends nothing for a press afterwards, by the button or by the keyboard", async () => {
    const container = mount();
    sendTheWholeForm(container);
    await traffic.answerOldest(DESIGN_NOT_CURRENT);

    pressCallToAction(container);
    act(() => {
      elementIn(container, "form", HTMLFormElement).requestSubmit();
    });

    expect(traffic.contactBodies).toHaveLength(1);
  });

  it("does not say that the design changed", async () => {
    const container = mount();
    sendTheWholeForm(container);

    await traffic.answerOldest(DESIGN_NOT_CURRENT);

    expect(OUTCOMES.designNotCurrent).not.toMatch(/modific|schimb/i);
    expect(MESSAGES.ru.contact.outcomes.designNotCurrent).not.toMatch(
      /изменил|изменен/i,
    );
  });
});

describe("a limited send", () => {
  const limitedForASecond: ServerAnswer = {
    status: 429,
    body: { code: "CONTACT_LIMIT_REACHED" },
    headers: { "retry-after": "1" },
  };

  it("tells the clock time of the wait and is off until then, and then the sentence goes and the button is on", async () => {
    const container = mount();
    sendTheWholeForm(container);
    const answeredAtMs = Date.now();

    await traffic.answerOldest(limitedForASecond);

    const [sentence] = sentencesShown(outcomeOf(container));
    // A second's wait told within a minute of midnight is tomorrow's sentence; this test is about the wait, not the day.
    const told = [answeredAtMs + 1000, Date.now() + 1000].flatMap(
      (waitsUntil) =>
        [OUTCOMES.limited, OUTCOMES.limitedTomorrow].map((leaf) =>
          leaf.replace("{time}", clockTimeOf(waitsUntil)),
        ),
    );
    expect(told).toContain(sentence);
    expect(ctaOf(container).getAttribute("aria-disabled")).toBe("true");
    pressCallToAction(container);
    expect(traffic.contactBodies).toHaveLength(1);

    await act(async () => {
      await sleep(ONE_SECOND_WITH_MARGIN_MS);
    });

    expect(
      container.querySelector('[data-testid="contact-outcome"]'),
    ).toBeNull();
    expect(ctaOf(container).getAttribute("aria-disabled")).toBeNull();
    pressCallToAction(container);
    expect(traffic.contactBodies).toHaveLength(2);
    expect(traffic.contactBodies[1]?.clientRequestId).toBe(
      traffic.contactBodies[0]?.clientRequestId,
    );
  });

  describe("told with its day, on a clock held still", () => {
    const SECONDS_PER_DAY = 86_400;

    function localInstant(hours: number, minutes: number): number {
      return new Date(2026, 9, 10, hours, minutes).getTime();
    }

    async function sentenceOfAWait(
      nowMs: number,
      retryAfterSeconds: number,
    ): Promise<string> {
      vi.useFakeTimers({ toFake: ["Date"], now: nowMs });
      const container = mount();
      sendTheWholeForm(container);
      await traffic.answerOldest({
        status: 429,
        body: { code: "CONTACT_LIMIT_REACHED" },
        headers: { "retry-after": String(retryAfterSeconds) },
      });
      const [sentence] = sentencesShown(outcomeOf(container));
      return sentence ?? "";
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it("says the time alone for a wait that ends the same day", async () => {
      const sentence = await sentenceOfAWait(localInstant(10, 0), 3600);

      expect(sentence).toBe(OUTCOMES.limited.replace("{time}", "11:00"));
    });

    it("says tomorrow for a wait of exactly a day, the longest the limit asks", async () => {
      const sentence = await sentenceOfAWait(
        localInstant(10, 0),
        SECONDS_PER_DAY,
      );

      expect(sentence).toBe(
        OUTCOMES.limitedTomorrow.replace("{time}", "10:00"),
      );
    });

    it("says tomorrow for a short wait that crosses local midnight", async () => {
      const sentence = await sentenceOfAWait(localInstant(23, 30), 3600);

      expect(sentence).toBe(
        OUTCOMES.limitedTomorrow.replace("{time}", "00:30"),
      );
    });
  });

  it("holds its wait in one timer, which is cleared when the screen goes", async () => {
    const container = mount();
    sendTheWholeForm(container);
    const setTimer = vi.spyOn(globalThis, "setTimeout");
    const clearTimer = vi.spyOn(globalThis, "clearTimeout");

    await traffic.answerOldest({
      status: 429,
      body: { code: "CONTACT_LIMIT_REACHED" },
      headers: { "retry-after": "5" },
    });

    const waitTimers = setTimer.mock.calls
      .map(([, delay], index) => ({
        delay: delay ?? 0,
        id: setTimer.mock.results[index]?.value as unknown,
      }))
      .filter(({ delay }) => delay >= 3000);
    expect(waitTimers).toHaveLength(1);
    expect(container.isConnected).toBe(true);

    screen.unmount();

    expect(clearTimer).toHaveBeenCalledWith(waitTimers[0]?.id);
    screen = mountContactScreen();
  });
});

describe("the sent state", () => {
  it("draws no form and nothing sendable, and no sent line of its own: the confirmation is a page of its own", async () => {
    const container = mount();
    sendTheWholeForm(container);

    await traffic.answerOldest(SENT);

    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector('[data-testid="contact-sent"]')).toBeNull();
  });

  it("leaves the form's page for the design's confirmation by one replacement", async () => {
    const container = mount();
    sendTheWholeForm(container);

    await traffic.answerOldest(SENT);

    expect(router.replace.mock.calls).toEqual([[`/d/${DESIGN_ID}/done`]]);
  });
});

describe("a server that cannot take a request", () => {
  it("is a sentence and the one call link to the shop, with no form, no input and no button, and the browser sends nothing", () => {
    screen = mountContactScreen({ isSendable: false });
    const { container } = screen;

    expect(
      elementIn(container, '[data-testid="contact-unavailable"]').textContent,
    ).toBe(MESSAGES.ro.contact.unavailable);
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(
      elementIn(container, '[data-testid="call-shop-link"]').getAttribute(
        "href",
      ),
    ).toBe(shopTelAddress());
    expect(container.querySelectorAll('a[href^="tel:"]')).toHaveLength(1);
    expect(traffic.contactBodies).toHaveLength(0);
    expect(traffic.otherUrls).toHaveLength(0);
  });

  it("is told in Russian in the Russian page", () => {
    screen = mountContactScreen({ isSendable: false, locale: "ru" });

    expect(
      elementIn(screen.container, '[data-testid="contact-unavailable"]')
        .textContent,
    ).toBe(MESSAGES.ru.contact.unavailable);
    expect(
      elementIn(screen.container, '[data-testid="call-shop-link"]').textContent,
    ).toContain(MESSAGES.ru.submissionResult.callShop);
  });
});
