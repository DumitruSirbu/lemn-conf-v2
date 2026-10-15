// @vitest-environment happy-dom
//
// The contact page's one way out (8M.3): once a design's request is answered *sent*, the page replaces its own history
// entry with the design's confirmation. The router is the test's own, with the three calls a page could make to leave;
// what is asserted is which one is made, with what, how often, and for which answers it is not made at all. Where the
// confirmation is then drawn, and that Back lands on the review, is the browser's (the e2e's).
import type { DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));

vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => router,
}));
vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div"),
}));

import { CallbackContactScreen } from "@/contact/contact-screen";
import { useReplaceWithDone } from "@/done/use-replace-with-done";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  elementIn,
  fillWholeForm,
  MESSAGES,
  mountContactScreen,
  pressCallToAction,
  recordTraffic,
  type MountedScreen,
  type RecordedTraffic,
  type ServerAnswer,
} from "../contact/contact-screen-harness";
import { DESIGN_ID } from "../contact/contact-submission-harness";

const DONE_PATH = `/d/${DESIGN_ID}/done`;

const SENT: ServerAnswer = {
  status: 200,
  body: { status: "sent", reference: "LM-1234" },
};

/** Every class of answer other than *sent*, one each: the page stays where the form's memory is. */
const ANSWERS_THAT_SENT_NOTHING: readonly (readonly [string, ServerAnswer])[] =
  [
    [
      "a service failure",
      { status: 503, body: { code: "CONTACT_UNAVAILABLE" } },
    ],
    ["a rejection", { status: 400, body: { code: "CONTACT_REJECTED" } }],
    ["a request with no answer", "network-failure"],
    ["a 200 that is not a sent line", { status: 200, body: { odd: true } }],
    ["a conflict", { status: 409, body: { code: "CONTACT_REQUEST_CONFLICT" } }],
    [
      "a design that is not current",
      { status: 409, body: { code: "CONTACT_DESIGN_NOT_CURRENT" } },
    ],
    [
      "a design that does not fit",
      {
        status: 422,
        body: { code: "CONTACT_DESIGN_DOES_NOT_FIT", placementIds: [] },
      },
    ],
  ];

let traffic: RecordedTraffic;
let screen: MountedScreen | undefined;

beforeEach(() => {
  traffic = recordTraffic();
  router.push.mockReset();
  router.replace.mockReset();
  router.back.mockReset();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
});

function expectNoNavigation(): void {
  expect(router.replace).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
}

function sendTheDesignForm(): HTMLElement {
  screen = mountContactScreen();
  fillWholeForm(screen.container);
  pressCallToAction(screen.container);
  return screen.container;
}

describe("the design form, once its request is answered", () => {
  it("replaces its own history entry with the design's confirmation, and does nothing else", async () => {
    sendTheDesignForm();

    await traffic.answerOldest(SENT);

    expect(router.replace.mock.calls).toEqual([[DONE_PATH]]);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(traffic.contactBodies).toHaveLength(1);
  });

  it("keeps the sending line on the page, as a status and with no form, until the confirmation arrives", async () => {
    const container = sendTheDesignForm();

    await traffic.answerOldest(SENT);

    const line = elementIn(container, '[data-testid="contact-leaving-line"]');
    expect(line.textContent).toBe(MESSAGES.ro.contact.sendingLine);
    expect(line.getAttribute("role")).toBe("status");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("header")).not.toBeNull();
    expect(container.contains(document.activeElement)).toBe(false);
  });

  it("goes nowhere while the request is out", () => {
    sendTheDesignForm();

    expectNoNavigation();
  });

  it.each(ANSWERS_THAT_SENT_NOTHING)(
    "goes nowhere for %s",
    async (_name, answer) => {
      sendTheDesignForm();

      await traffic.answerOldest(answer);

      expectNoNavigation();
    },
  );

  it("goes nowhere on a failure, then leaves once when the same request is sent on the retry", async () => {
    const container = sendTheDesignForm();
    await traffic.answerOldest("network-failure");
    expectNoNavigation();

    act(() => {
      elementIn(container, '[data-testid="contact-retry"]').click();
    });
    await traffic.answerOldest(SENT);

    expect(router.replace.mock.calls).toEqual([[DONE_PATH]]);
  });

  it("builds the address from the design's id and nothing the customer typed", async () => {
    sendTheDesignForm();

    await traffic.answerOldest(SENT);

    const address = String(router.replace.mock.calls[0]?.[0]);
    expect(address).toBe(DONE_PATH);
    expect(address).not.toMatch(/[?#]|Ana|069|ana@example/);
  });
});

describe("the callback form, which has no design and so no confirmation to leave for", () => {
  it("stays where it is once its request is sent", async () => {
    useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(NextIntlClientProvider, {
          locale: "ro",
          messages: MESSAGES.ro,
          timeZone: "Europe/Chisinau",
          children: createElement(CallbackContactScreen, { isSendable: true }),
        }),
      );
    });
    fillWholeForm(container);
    pressCallToAction(container);

    await traffic.answerOldest(SENT);

    expect(
      container.querySelector('[data-testid="contact-sent"]'),
    ).not.toBeNull();
    expectNoNavigation();
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

describe("useReplaceWithDone", () => {
  function Leaver({ designId }: { readonly designId: DesignId }) {
    useReplaceWithDone(designId);
    return null;
  }

  let root: Root;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function render(designId: DesignId): void {
    act(() => {
      root.render(
        createElement(StrictMode, null, createElement(Leaver, { designId })),
      );
    });
  }

  it("replaces once on mount, though strict mode runs the effect twice", () => {
    render(DESIGN_ID);

    expect(router.replace.mock.calls).toEqual([[DONE_PATH]]);
  });

  it("does not replace again when it renders again for the same design", () => {
    render(DESIGN_ID);
    render(DESIGN_ID);

    expect(router.replace).toHaveBeenCalledTimes(1);
  });
});
