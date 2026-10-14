// @vitest-environment happy-dom
//
// The contact page of a design as the customer meets it once the kitchen was sent for (ADR 0163 A1, A5, A6, A7; 8M2
// criteria 11 to 13 and 15): which arm `ContactScreen` draws for each device state, each answer and each sendability,
// that the sent arm mounts nothing that can send, that a form once decided stays, and that every arm of the design page
// clears the hand-over and the callback page does not. The scene probe, the locale menu and the editor's exit screen are
// stubs.
//
// What this cannot see: layout, and the history entry a link adds (the e2e's).
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Support = "probing" | "supported" | "unsupported";

const webgl = vi.hoisted(() => ({
  state: "supported" as Support,
  listeners: new Set<() => void>(),
}));
const submissionHook = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/scene/webgl-support", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useWebGLSupport: () =>
      useSyncExternalStore(
        (listener) => {
          webgl.listeners.add(listener);
          return () => webgl.listeners.delete(listener);
        },
        () => webgl.state,
      ),
  };
});
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div", { "data-testid": "locale-menu" }),
}));
vi.mock("@/components/webgl-unavailable", () => ({
  WebGLUnavailable: () =>
    createElement("main", { "data-testid": "webgl-unavailable" }),
}));
vi.mock("@/contact/use-contact-submission", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/contact/use-contact-submission")>();
  return {
    ...original,
    useContactSubmission: (
      ...parameters: Parameters<typeof original.useContactSubmission>
    ) => {
      submissionHook.calls += 1;
      return original.useContactSubmission(...parameters);
    },
  };
});

import { CallbackContactScreen, ContactScreen } from "@/contact/contact-screen";
import {
  recallSentRequest,
  rememberSentRequest,
} from "@/done/sent-request-memory";
import type { SentReferenceAnswer } from "@/done/result-to-show";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  DESIGN_ID,
  FIRST_REVISION,
  editWithoutSaving,
  landSave,
} from "./contact-submission-harness";
import {
  elementIn,
  MESSAGES,
  mountContactScreen,
  type MountedScreen,
  type ScreenLocale,
} from "./contact-screen-harness";
import { sourceFilesMatching } from "../lib/server/server-source-support";

const SENT: SentReferenceAnswer = { kind: "sent", reference: "LM-2614" };
const NONE: SentReferenceAnswer = { kind: "none" };
const UNKNOWN: SentReferenceAnswer = { kind: "unknown" };
const THE_PAGES_KEY = { designId: DESIGN_ID, revision: FIRST_REVISION };

let screen: MountedScreen;
let consoleError: ReturnType<typeof vi.spyOn>;

function mount(options: {
  readonly sentReference: SentReferenceAnswer;
  readonly isSendable?: boolean;
  readonly locale?: ScreenLocale;
}): HTMLElement {
  screen = mountContactScreen(options);
  return screen.container;
}

function setSupport(next: Support): void {
  act(() => {
    webgl.state = next;
    for (const listener of webgl.listeners) listener();
  });
}

function rememberARequestForThisPage(): void {
  rememberSentRequest({
    ...THE_PAGES_KEY,
    reference: "LM-OLD",
    channel: "phone",
    contactValue: "069 123 456",
  });
}

function isTheSentView(container: HTMLElement): boolean {
  return (
    container.querySelector('[data-testid="contact-already-sent"]') !== null
  );
}

beforeEach(() => {
  webgl.state = "supported";
  submissionHook.calls = 0;
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  screen.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("which arm is drawn", () => {
  const sentArms: readonly {
    readonly support: Support;
    readonly isSendable: boolean;
  }[] = [
    { support: "supported", isSendable: true },
    { support: "supported", isSendable: false },
    { support: "unsupported", isSendable: true },
    { support: "unsupported", isSendable: false },
  ];

  it.each(sentArms)(
    "draws the sent view, and neither the exit nor the unavailable page nor a form, for a sent answer on a $support device with isSendable $isSendable",
    ({ support, isSendable }) => {
      webgl.state = support;

      const container = mount({ sentReference: SENT, isSendable });

      expect(isTheSentView(container)).toBe(true);
      expect(
        container.querySelector('[data-testid="webgl-unavailable"]'),
      ).toBeNull();
      expect(
        container.querySelector('[data-testid="contact-unavailable"]'),
      ).toBeNull();
      expect(container.querySelector("form")).toBeNull();
      expect(submissionHook.calls).toBe(0);
    },
  );

  it.each([SENT, NONE, UNKNOWN])(
    "draws the loading line and nothing else while the device is asked, for the answer %j",
    (sentReference) => {
      webgl.state = "probing";

      const container = mount({ sentReference });

      expect(container.textContent).toBe(MESSAGES.ro.configure.loading);
      expect(submissionHook.calls).toBe(0);
    },
  );

  it.each([NONE, UNKNOWN])(
    "draws the form, never the sent view, for the answer %j",
    (sentReference) => {
      const container = mount({ sentReference });

      expect(isTheSentView(container)).toBe(false);
      expect(container.querySelectorAll("form")).toHaveLength(1);
    },
  );

  it.each([NONE, UNKNOWN])(
    "keeps the editor's exit on a device that cannot show the kitchen for the answer %j",
    (sentReference) => {
      webgl.state = "unsupported";

      const container = mount({ sentReference });

      expect(
        container.querySelector('[data-testid="webgl-unavailable"]'),
      ).not.toBeNull();
      expect(isTheSentView(container)).toBe(false);
    },
  );

  it.each([NONE, UNKNOWN])(
    "keeps the unavailable page where the server cannot send, for the answer %j",
    (sentReference) => {
      const container = mount({ sentReference, isSendable: false });

      expect(
        container.querySelector('[data-testid="contact-unavailable"]'),
      ).not.toBeNull();
      expect(isTheSentView(container)).toBe(false);
    },
  );

  it("goes from the loading line to the sent view when the probe answers, calling the same hooks in the same order", () => {
    webgl.state = "probing";
    const container = mount({ sentReference: SENT });

    setSupport("supported");

    expect(isTheSentView(container)).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("the sent view", () => {
  it.each(["ro", "ru"] as const)(
    "draws the heading with focus, the reference as text, the copy control and the bar's way back to the review, in %s",
    (locale) => {
      const container = mount({ sentReference: SENT, locale });
      const heading = elementIn(container, "h1");

      expect(heading.textContent).toBe(
        MESSAGES[locale].submissionResult.alreadySentHeading,
      );
      expect(document.activeElement).toBe(heading);
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(
        elementIn(container, '[data-testid="done-reference"]').textContent,
      ).toBe("LM-2614");
      expect(
        elementIn(container, '[data-testid="done-copy"]').textContent,
      ).toBe(MESSAGES[locale].submissionResult.copy);
      expect(
        elementIn(
          container,
          '[data-testid="contact-back"]',
          HTMLAnchorElement,
        ).getAttribute("href"),
      ).toBe(`/${locale}/d/${DESIGN_ID}/review`);
      expect(
        elementIn(container, '[data-testid="contact-top-bar-title"]')
          .textContent,
      ).toBe(MESSAGES[locale].contact.topBarTitle);
    },
  );

  it("shows a reference that is markup as the literal text and makes no element of it", () => {
    const markup = "<img src=x onerror=alert(1)>";

    const container = mount({
      sentReference: { kind: "sent", reference: markup },
    });

    expect(container.querySelector("img")).toBeNull();
    expect(
      elementIn(container, '[data-testid="done-reference"]').textContent,
    ).toBe(markup);
    expect(container.innerHTML).not.toContain("<img");
    for (const element of container.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.value).not.toContain("onerror");
      }
    }
  });

  it("draws no form and no input, and every press on it makes no request to the API and no POST", async () => {
    const requests: { readonly url: string; readonly method: string }[] = [];
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method ?? "GET" });
      return new Promise<Response>(() => undefined);
    });
    const container = mount({ sentReference: SENT });

    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    const controls = container.querySelectorAll<HTMLElement>("button, a");
    expect(controls.length).toBeGreaterThan(1);
    for (const control of controls) {
      await act(() => {
        control.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
        return Promise.resolve();
      });
    }

    expect(submissionHook.calls).toBe(0);
    expect(requests.filter(({ url }) => url.includes("/api/"))).toEqual([]);
    expect(requests.filter(({ method }) => method === "POST")).toEqual([]);
  });
});

describe("a form once decided stays for the mount", () => {
  it("turns into the form when a save lands, and does not come back when the store is read again at the sent revision", () => {
    const container = mount({ sentReference: SENT });
    expect(isTheSentView(container)).toBe(true);

    editWithoutSaving("edited-in-the-editor");
    landSave("5");
    expect(isTheSentView(container)).toBe(false);
    expect(container.querySelectorAll("form")).toHaveLength(1);

    act(() => {
      useConfiguratorStore.getState().hydrate({
        design: useConfiguratorStore.getState().design,
        designId: DESIGN_ID,
        revision: FIRST_REVISION,
        canWrite: true,
      });
    });

    expect(isTheSentView(container)).toBe(false);
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("decides while the device is still being asked, so the sent view is never committed for a frame", () => {
    webgl.state = "probing";
    const container = mount({ sentReference: SENT });

    editWithoutSaving("edited-in-the-editor");
    landSave("5");
    setSupport("supported");

    expect(isTheSentView(container)).toBe(false);
    expect(container.querySelectorAll("form")).toHaveLength(1);
  });

  it("draws the form on arrival when an unsaved edit is held, with no console error", () => {
    const container = mountWithAnEditHeld();

    expect(isTheSentView(container)).toBe(false);
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

function mountWithAnEditHeld(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
  useConfiguratorStore.getState().hydrate({
    design: useConfiguratorStore.getState().design,
    designId: DESIGN_ID,
    revision: FIRST_REVISION,
    canWrite: true,
  });
  editWithoutSaving("edited-before-the-page-loaded");
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: MESSAGES.ro,
        timeZone: "Europe/Chisinau",
        children: createElement(ContactScreen, {
          designId: DESIGN_ID,
          loadedRevision: FIRST_REVISION,
          isSendable: true,
          sentReference: SENT,
        }),
      }),
    );
  });
  screen = {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
  return container;
}

describe("the hand-over", () => {
  const arms: readonly {
    readonly name: string;
    readonly support: Support;
    readonly sentReference: SentReferenceAnswer;
    readonly isSendable: boolean;
  }[] = [
    {
      name: "loading",
      support: "probing",
      sentReference: SENT,
      isSendable: true,
    },
    {
      name: "sent view",
      support: "supported",
      sentReference: SENT,
      isSendable: true,
    },
    {
      name: "WebGL exit",
      support: "unsupported",
      sentReference: NONE,
      isSendable: true,
    },
    {
      name: "unavailable page",
      support: "supported",
      sentReference: NONE,
      isSendable: false,
    },
    {
      name: "form",
      support: "supported",
      sentReference: NONE,
      isSendable: true,
    },
  ];

  it.each(arms)(
    "is cleared when the design contact page mounts in the $name arm",
    ({ support, sentReference, isSendable }) => {
      webgl.state = support;
      rememberARequestForThisPage();
      expect(recallSentRequest(THE_PAGES_KEY).kind).toBe("remembered");

      mount({ sentReference, isSendable });

      expect(recallSentRequest(THE_PAGES_KEY).kind).toBe("none");
    },
  );

  it("is left alone by the callback page, which is not a design contact page", () => {
    screen = mountContactScreen();
    screen.unmount();
    rememberARequestForThisPage();
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

    expect(recallSentRequest(THE_PAGES_KEY).kind).toBe("remembered");
    act(() => {
      root.unmount();
    });
    container.remove();
    screen = { container, unmount: () => undefined };
  });

  it("reads source: no production file names forgetSentRequest but contact-screen.tsx, beside its own module", () => {
    expect(sourceFilesMatching(/\bforgetSentRequest\b/).sort()).toEqual([
      "contact/contact-screen.tsx",
      "done/sent-request-memory.ts",
    ]);
  });
});
