// @vitest-environment happy-dom
//
// The callback form, frame 2F's way on: the contact page with no design behind it. What stands in it and what does not
// (no card, no figure, no probe, no wait on a save, no way to a review), what it sends (`intent: "callback"` and no
// `design`), and the line it says while a request is out. The locale menu is a stub; the scene probe says the device
// cannot show the kitchen, which this page must not ask.
//
// What this cannot see: the page's request-time rendering (the page's own test and `next build`) and layout.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "unsupported",
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div", { "data-testid": "locale-menu" }),
}));

import { CallbackContactScreen } from "@/contact/contact-screen";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  elementIn,
  fillWholeForm,
  MESSAGES,
  pressCallToAction,
  recordTraffic,
  type RecordedTraffic,
  type ScreenLocale,
} from "./contact-screen-harness";

let unmount: () => void;
let traffic: RecordedTraffic;

function mount(
  options: { locale?: ScreenLocale; isSendable?: boolean } = {},
): HTMLElement {
  const { locale = "ro", isSendable = true } = options;
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
        children: createElement(CallbackContactScreen, { isSendable }),
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

beforeEach(() => {
  traffic = recordTraffic();
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe("the callback form, which has no design", () => {
  it.each(["ro", "ru"] as const)(
    "draws the form with the no-design heading in %s, though the device cannot show the kitchen",
    (locale) => {
      const container = mount({ locale });

      expect(container.querySelectorAll("form")).toHaveLength(1);
      expect(container.querySelector("h1")?.textContent).toBe(
        MESSAGES[locale].contact.headingNoDesign,
      );
      expect(container.textContent).toContain(
        MESSAGES[locale].contact.subheadingNoDesign,
      );
      expect(
        container.querySelector('[data-testid="webgl-unavailable"]'),
      ).toBeNull();
      expect(container.textContent).not.toContain(
        MESSAGES[locale].configure.loading,
      );
    },
  );

  it("posts, so a native submit before hydration never puts what was typed into the address", () => {
    const form = elementIn(mount(), "form", HTMLFormElement);

    expect(form.getAttribute("method")).toBe("post");
    expect(form.hasAttribute("action")).toBe(false);
  });

  it("draws no card, no figure and no way to a review", () => {
    const container = mount();

    expect(
      container.querySelector('[data-testid="contact-design-card"]'),
    ).toBeNull();
    expect(container.querySelector('[data-section="figure"]')).toBeNull();
    expect(
      container.querySelector('a[href*="/review"], [data-testid*="review"]'),
    ).toBeNull();
  });

  it.each(["ro", "ru"] as const)(
    "leads its bar's chevron to the start of the configurator in %s",
    (locale) => {
      const back = elementIn(
        mount({ locale }),
        '[data-testid="contact-back"]',
        HTMLAnchorElement,
      );

      expect(back.getAttribute("href")).toBe(`/${locale}`);
      expect(back.getAttribute("aria-label")).toBe(
        MESSAGES[locale].configure.backAction,
      );
    },
  );

  it("sends the callback intent and no design, with nothing waiting on a save", () => {
    const container = mount();
    fillWholeForm(container);

    pressCallToAction(container);

    expect(
      container.querySelector('[data-testid="contact-save-wait"]'),
    ).toBeNull();
    expect(traffic.contactBodies).toHaveLength(1);
    const [body] = traffic.contactBodies;
    expect(body).toMatchObject({ intent: "callback", locale: "ro" });
    expect(body).not.toHaveProperty("design");
    expect(traffic.otherUrls).toEqual([]);
  });

  it("says the no-design line while the request is out", () => {
    const container = mount();
    fillWholeForm(container);

    pressCallToAction(container);

    expect(
      elementIn(container, '[data-testid="contact-sending-line"]').textContent,
    ).toBe(MESSAGES.ro.contact.sendingLineNoDesign);
  });

  it("replaces the form with the sent line once the request is stored", async () => {
    const container = mount();
    fillWholeForm(container);
    pressCallToAction(container);

    await traffic.answerOldest({
      status: 200,
      body: { status: "sent", reference: "LM-1234" },
    });

    expect(
      elementIn(container, '[data-testid="contact-sent"]').textContent,
    ).toContain("LM-1234");
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("the callback form where the server cannot take a request", () => {
  it.each(["ro", "ru"] as const)(
    "says so in %s and draws no form, no input and no call to action, and sends nothing",
    (locale) => {
      const container = mount({ locale, isSendable: false });

      expect(
        elementIn(container, '[data-testid="contact-unavailable"]').textContent,
      ).toBe(MESSAGES[locale].contact.unavailable);
      expect(container.querySelector("form")).toBeNull();
      expect(container.querySelector("input")).toBeNull();
      expect(container.querySelector('[data-testid="contact-cta"]')).toBeNull();
      expect(
        elementIn(container, '[data-testid="contact-back"]').getAttribute(
          "href",
        ),
      ).toBe(`/${locale}`);
      expect(traffic.contactBodies).toEqual([]);
      expect(traffic.otherUrls).toEqual([]);
    },
  );
});
