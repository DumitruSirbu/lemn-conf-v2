// @vitest-environment happy-dom
//
// What the already-sent view draws once S5 completed it (8M2.7, 8M2.8, criteria 12, 16, 17 and 21): its pieces in the
// plan's order, the advice naming the shop's number in its display form, the one call link, the changed-kitchen
// sentence, and the way back to the design pinned alone at the foot. The scene probe and the locale menu are stubs.
//
// What this cannot see: the 44 px of the call link and the pinned region's height as painted, which are the visual
// pass's (the stylesheet's declarations are read by `already-sent-view.sources.test.ts`).
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div", { "data-testid": "locale-menu" }),
}));
vi.mock("@/components/webgl-unavailable", () => ({
  WebGLUnavailable: () => createElement("main"),
}));

import { shopPhoneDisplay, shopTelAddress } from "@/shop/shop-phone";

import {
  elementIn,
  MESSAGES,
  mountContactScreen,
  type MountedScreen,
  type ScreenLocale,
} from "./contact-screen-harness";
import { DESIGN_ID } from "./contact-submission-harness";

const SENT = { kind: "sent", reference: "LM-2614" } as const;
const LOCALES: readonly ScreenLocale[] = ["ro", "ru"];

let screen: MountedScreen;

function mountTheView(locale: ScreenLocale): HTMLElement {
  screen = mountContactScreen({ sentReference: SENT, locale });
  return screen.container;
}

function byTestId(container: ParentNode, testId: string): HTMLElement {
  return elementIn(container, `[data-testid="${testId}"]`);
}

function isBefore(first: Element, second: Element): boolean {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

afterEach(() => {
  screen.unmount();
  vi.unstubAllGlobals();
});

describe.each(LOCALES)("the already-sent view in %s", (locale) => {
  const copy = MESSAGES[locale].submissionResult;

  it("names the shop's number in its display form in the advice, with no placeholder left over", () => {
    const container = mountTheView(locale);

    const advice = byTestId(container, "contact-already-sent-advice");
    expect(advice.textContent).toBe(
      copy.alreadySentAdvice.replace("{phone}", shopPhoneDisplay()),
    );
    expect(advice.textContent).toContain(shopPhoneDisplay());
    expect(advice.textContent).not.toContain("{");
  });

  it("draws exactly one call link, to the shop's constant, labelled as frame 5B labels it, and the advice itself dials nothing", () => {
    const container = mountTheView(locale);

    const links = container.querySelectorAll('a[href^="tel:"]');
    expect(links).toHaveLength(1);
    const call = byTestId(container, "call-shop-link");
    expect(links[0]).toBe(call);
    expect(call.getAttribute("href")).toBe(shopTelAddress());
    expect(call.textContent).toContain(copy.callShop);
    expect(
      byTestId(container, "contact-already-sent-advice").querySelector("a"),
    ).toBeNull();
  });

  it("says that a changed kitchen can be sent again", () => {
    const container = mountTheView(locale);

    expect(
      byTestId(container, "contact-already-sent-changed-kitchen").textContent,
    ).toBe(copy.alreadySentChangedKitchen);
  });

  it("draws the heading, the reference, the advice, the call link and the changed-kitchen sentence in that order", () => {
    const container = mountTheView(locale);

    const inOrder = [
      byTestId(container, "contact-already-sent-heading"),
      byTestId(container, "done-reference-card"),
      byTestId(container, "contact-already-sent-advice"),
      byTestId(container, "call-shop-link"),
      byTestId(container, "contact-already-sent-changed-kitchen"),
      byTestId(container, "contact-already-sent-bottom"),
    ];
    for (const [index, element] of inOrder.slice(0, -1).entries()) {
      const next = inOrder[index + 1];
      expect(next !== undefined && isBefore(element, next)).toBe(true);
    }
  });

  it("pins the way back to the editor alone at the foot, a link that is not prefetched", () => {
    const container = mountTheView(locale);

    const pinned = byTestId(container, "contact-already-sent-bottom");
    const back = byTestId(pinned, "done-back-to-design");
    expect(pinned.children).toHaveLength(1);
    expect(pinned.firstElementChild).toBe(back);
    expect(back.textContent).toBe(copy.backToDesign);
    expect(back.getAttribute("href")).toBe(`/${locale}/d/${DESIGN_ID}`);
    expect(byTestId(container, "contact-already-sent").contains(back)).toBe(
      false,
    );
  });

  it("draws no price, no design card, no consent, no call to action and no retry", () => {
    const container = mountTheView(locale);

    for (const absent of [
      "contact-cta",
      "contact-retry",
      "contact-design-card",
      "review-cta",
      "done-whatsapp",
    ]) {
      expect(container.querySelector(`[data-testid="${absent}"]`)).toBeNull();
    }
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });
});
