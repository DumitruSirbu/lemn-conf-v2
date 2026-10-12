// @vitest-environment happy-dom
//
// Frame 5A as a screen, in every state it has: a request this tab sent (each channel, both languages), the same page
// after a reload (the reference and no typed value), a design with no request to show, and a read that failed. The
// canvas and the locale menu are stubs; the scene probe is the test's own. What each state claims comes from the pure
// `resultToShow`, whose property is `result-to-show.test.ts`; here it is what reaches the page.
//
// What this cannot see: layout, the painted disc and picture, and a touch landing at 390 px (the visual pass's).
import type { DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scene = vi.hoisted(() => ({
  support: "supported" as "probing" | "supported" | "unsupported",
  views: [] as unknown[],
}));

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => scene.support,
}));
vi.mock("@/scene/kitchen-canvas", () => ({
  default: () => null,
  ViewOnlyKitchenCanvas: (props: { view: unknown }) => {
    scene.views.push(props.view);
    return createElement("canvas", { "data-testid": "stub-canvas" });
  },
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div", { "data-testid": "locale-menu" }),
}));

import { DoneScreen } from "@/done/done-screen";
import type { SentReferenceAnswer } from "@/done/result-to-show";
import {
  forgetSentRequest,
  rememberSentRequest,
  type SentRequest,
} from "@/done/sent-request-memory";
import { resolveContent } from "@/i18n/content";
import { useCameraPreset } from "@/scene/camera-preset-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const MESSAGES = { ro: roMessages, ru: ruMessages } as const;
type Locale = keyof typeof MESSAGES;

const DESIGN_ID = "design0123456789abcde" as DesignId;
const OTHER_DESIGN_ID = "design0123456789abcdf";
const REVISION = "4";
const TYPED_PHONE = "079 123 456";
const TYPED_EMAIL = "ana.popescu@example.com";
const SERVER_REFERENCE = "SRV-5521";
const HANDED_REFERENCE = "LM-2614";

const SENT_ON_SERVER: SentReferenceAnswer = {
  kind: "sent",
  reference: SERVER_REFERENCE,
};
const NONE_ON_SERVER: SentReferenceAnswer = { kind: "none" };
const UNKNOWN_ON_SERVER: SentReferenceAnswer = { kind: "unknown" };

const CHANNELS = [
  ["phone", TYPED_PHONE],
  ["whatsapp", TYPED_PHONE],
  ["email", TYPED_EMAIL],
] as const;

function handedOver(overrides: Partial<SentRequest> = {}): SentRequest {
  return {
    designId: DESIGN_ID,
    revision: REVISION,
    reference: HANDED_REFERENCE,
    channel: "whatsapp",
    contactValue: TYPED_PHONE,
    ...overrides,
  };
}

function contentIn(locale: Locale) {
  return resolveContent(
    createTranslator({ locale, messages: MESSAGES[locale] }),
  );
}

let container: HTMLDivElement;
let root: Root | undefined;

function unmountScreen(): void {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  container.remove();
}

async function mountDoneScreen(
  sentReference: SentReferenceAnswer,
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
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function byTestId(testId: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  if (element === null) throw new Error(`nothing is marked ${testId}`);
  return element;
}

function textOf(testId: string): string {
  return byTestId(testId).textContent;
}

function isDrawn(testId: string): boolean {
  return container.querySelector(`[data-testid="${testId}"]`) !== null;
}

beforeEach(() => {
  scene.support = "supported";
  scene.views = [];
  forgetSentRequest();
  useCameraPreset.setState({ presetId: "overview" });
});

afterEach(() => {
  if (root !== undefined) unmountScreen();
  forgetSentRequest();
});

describe.each(["ro", "ru"] as const)(
  "5A for a request this tab sent, in %s",
  (locale) => {
    it.each(CHANNELS)(
      "says the %s channel and the exact value typed for it, with the reference the answer gave",
      async (channel, contactValue) => {
        rememberSentRequest(handedOver({ channel, contactValue }));

        await mountDoneScreen(NONE_ON_SERVER, locale);

        expect(textOf("done-channel-line")).toBe(
          contentIn(locale).submissionResult.channelLine({
            channel,
            contact: contactValue,
          }),
        );
        expect(textOf("done-channel-line")).toContain(contactValue);
        expect(textOf("done-reference")).toBe(HANDED_REFERENCE);
        expect(textOf("done-heading")).toBe(
          contentIn(locale).submissionResult.sentHeading,
        );
      },
    );

    it("tells the three channels apart, and each by a sentence of its own", async () => {
      const sentences = new Set<string>();
      for (const [channel, contactValue] of CHANNELS) {
        rememberSentRequest(handedOver({ channel, contactValue }));
        await mountDoneScreen(NONE_ON_SERVER, locale);
        sentences.add(textOf("done-channel-line"));
        unmountScreen();
      }

      expect(sentences.size).toBe(CHANNELS.length);
    });

    it("says the design is kept in the browser, naming no profile, account, link e-mail or telephone", async () => {
      rememberSentRequest(handedOver());

      await mountDoneScreen(NONE_ON_SERVER, locale);

      expect(textOf("done-saved-sentence")).toBe(
        contentIn(locale).submissionResult.savedSentence,
      );
      const wholeScreen = container.textContent;
      expect(wholeScreen).not.toMatch(
        /telefon|профил|аккаунт|учётн|регистр|cont |profil|nregistr/i,
      );
    });
  },
);

describe("5A, the screen as a whole, for a request this tab sent", () => {
  beforeEach(async () => {
    rememberSentRequest(handedOver());
    await mountDoneScreen(NONE_ON_SERVER);
  });

  it("is titled as a sent request, with exactly one h1", () => {
    expect(textOf("done-top-bar-title")).toBe(
      roMessages.submissionResult.topBarTitle,
    );
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("puts focus on the h1 as it arrives", () => {
    const heading = byTestId("done-heading");

    expect(heading.tagName).toBe("H1");
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(heading);
  });

  it("hides the check disc, drawn before the heading, from assistive technology", () => {
    const disc = byTestId("done-heading").previousElementSibling;

    expect(disc?.className).toMatch(/disc/);
    expect(disc?.getAttribute("aria-hidden")).toBe("true");
    expect(disc?.textContent).toBe("");
  });

  it("draws the three steps with the provisional marker and no figure in any of them", () => {
    const steps = [...byTestId("done-steps").querySelectorAll("li")];

    expect(steps).toHaveLength(3);
    expect(textOf("done-steps-provisional")).toBe(
      roMessages.submissionResult.nextStepsProvisionalMarker,
    );
    for (const step of steps) {
      const sentence = step.querySelector(":scope > span:not([aria-hidden])");
      expect(sentence?.textContent).toMatch(/\S/);
      expect(sentence?.textContent).not.toMatch(/\d|lei|mdl|eur|€|\$|руб|лей/i);
    }
  });

  it("offers the way back to the design as a link to the editor, in the pinned region, and a copy control", () => {
    const back = byTestId("done-back-to-design");

    expect(back.tagName).toBe("A");
    expect(back.getAttribute("href")).toMatch(new RegExp(`/d/${DESIGN_ID}$`));
    expect(byTestId("done-bottom").contains(back)).toBe(true);
    expect(back.textContent).toBe(roMessages.submissionResult.backToDesign);
    expect(textOf("done-copy")).toBe(roMessages.submissionResult.copy);
  });

  it("dials nothing: no telephone link anywhere", () => {
    expect(container.querySelectorAll('a[href^="tel:"]')).toHaveLength(0);
  });

  it("draws the picture at the room's overview, whatever view the editor remembers", async () => {
    unmountScreen();
    useCameraPreset.setState({ presetId: "wallB" });
    scene.views = [];

    await mountDoneScreen(NONE_ON_SERVER);

    expect(scene.views.at(-1)).toEqual({ kind: "preset", id: "overview" });
    expect(useCameraPreset.getState().presetId).toBe("wallB");
    expect(isDrawn("stub-canvas")).toBe(true);
    expect(byTestId("done-picture").getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll('[role="group"] button')).toHaveLength(0);
  });
});

describe("5A while WebGL is asked and where it is missing", () => {
  it.each(["probing", "unsupported"] as const)(
    "is %s: no canvas, and the heading, the reference and the way back are drawn all the same",
    async (support) => {
      scene.support = support;
      rememberSentRequest(handedOver());

      await mountDoneScreen(NONE_ON_SERVER);

      expect(isDrawn("stub-canvas")).toBe(false);
      expect(isDrawn("done-picture")).toBe(true);
      expect(textOf("done-reference")).toBe(HANDED_REFERENCE);
      expect(textOf("done-heading")).toBe(
        roMessages.submissionResult.sentHeading,
      );
      expect(isDrawn("done-back-to-design")).toBe(true);
    },
  );
});

describe("5A after a reload: the server's answer and no hand-over", () => {
  it("shows the server's reference and the channel line that names no value", async () => {
    await mountDoneScreen(SENT_ON_SERVER);

    expect(textOf("done-reference")).toBe(SERVER_REFERENCE);
    expect(textOf("done-channel-line")).toBe(
      roMessages.submissionResult.channelLineWithoutValue,
    );
    expect(textOf("done-heading")).toBe(
      roMessages.submissionResult.sentHeading,
    );
  });

  it("puts focus on the h1 after a load as after a send", async () => {
    await mountDoneScreen(SENT_ON_SERVER);

    expect(document.activeElement).toBe(byTestId("done-heading"));
  });

  it("shows no typed value anywhere once the memory is gone", async () => {
    rememberSentRequest(
      handedOver({ channel: "email", contactValue: TYPED_EMAIL }),
    );
    forgetSentRequest();

    await mountDoneScreen(SENT_ON_SERVER);

    expect(container.innerHTML).not.toContain(TYPED_EMAIL);
    expect(container.innerHTML).not.toContain(HANDED_REFERENCE);
  });

  it("shows the hand-over's reference, not the server's, when this tab sent the request", async () => {
    rememberSentRequest(handedOver());

    await mountDoneScreen(SENT_ON_SERVER);

    expect(textOf("done-reference")).toBe(HANDED_REFERENCE);
    expect(container.innerHTML).not.toContain(SERVER_REFERENCE);
  });
});

describe("a hand-over that is not this page's", () => {
  it.each([
    ["another design", handedOver({ designId: OTHER_DESIGN_ID })],
    ["another revision", handedOver({ revision: "5" })],
  ])(
    "from %s claims no request, shows none of it, when the server knows none",
    async (_name, request) => {
      rememberSentRequest(request);

      await mountDoneScreen(NONE_ON_SERVER);

      expect(isDrawn("done-reference")).toBe(false);
      expect(container.innerHTML).not.toContain(HANDED_REFERENCE);
      expect(container.innerHTML).not.toContain(TYPED_PHONE);
      expect(textOf("done-heading")).toBe(
        roMessages.submissionResult.noRequest,
      );
    },
  );

  it("from another design leaves the server's own reference with no typed value", async () => {
    rememberSentRequest(handedOver({ designId: OTHER_DESIGN_ID }));

    await mountDoneScreen(SENT_ON_SERVER);

    expect(textOf("done-reference")).toBe(SERVER_REFERENCE);
    expect(container.innerHTML).not.toContain(TYPED_PHONE);
    expect(textOf("done-channel-line")).toBe(
      roMessages.submissionResult.channelLineWithoutValue,
    );
  });
});

describe.each([
  ["no request is known", NONE_ON_SERVER, "noRequest"],
  ["the read failed", UNKNOWN_ON_SERVER, "notShown"],
] as const)("the view where %s", (_name, answer, sentenceKey) => {
  beforeEach(async () => {
    await mountDoneScreen(answer);
  });

  it("says so in the h1 and claims no send: no check, no reference, no copy, no steps, no pinned region", () => {
    expect(textOf("done-heading")).toBe(
      roMessages.submissionResult[sentenceKey],
    );
    expect(container.textContent).not.toContain(
      roMessages.submissionResult.sentHeading,
    );
    expect(textOf("done-top-bar-title")).not.toBe(
      roMessages.submissionResult.topBarTitle,
    );
    for (const absent of [
      "done-reference",
      "done-copy",
      "done-steps",
      "done-bottom",
      "done-picture",
      "done-summary",
    ]) {
      expect(isDrawn(absent), absent).toBe(false);
    }
    expect(container.querySelectorAll(".disc, [class*=disc]")).toHaveLength(0);
  });

  it("offers the review as the way on, and draws a fetched link rather than a prefetched one", () => {
    const link = byTestId("done-review-link");

    expect(link.getAttribute("href")).toMatch(
      new RegExp(`/d/${DESIGN_ID}/review$`),
    );
    expect(link.textContent).toBe(roMessages.submissionResult.reviewLink);
  });

  it("puts focus on the h1, and draws one h1", () => {
    expect(document.activeElement).toBe(byTestId("done-heading"));
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("shows no code and no status", () => {
    expect(container.textContent).not.toMatch(
      /[A-Z]{2,}_[A-Z_]+|\b[1-5]\d\d\b/,
    );
  });
});

describe("what a server render may show", () => {
  it("never the hand-over, even when this module holds one: the first render is the server's", () => {
    rememberSentRequest(handedOver());

    const markup = renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(DoneScreen, {
          designId: DESIGN_ID,
          revision: REVISION,
          sentReference: SENT_ON_SERVER,
        }),
      }),
    );

    expect(markup).toContain(SERVER_REFERENCE);
    expect(markup).not.toContain(HANDED_REFERENCE);
    expect(markup).not.toContain(TYPED_PHONE);
  });
});
