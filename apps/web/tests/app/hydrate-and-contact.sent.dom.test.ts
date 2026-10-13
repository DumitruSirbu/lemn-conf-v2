// @vitest-environment happy-dom
//
// The contact page of a kitchen already sent for, server-rendered and then hydrated, with the browser holding an unsaved
// edit of that design (8M2 criterion 13): the first client render answers from the server's snapshot, the next from the
// session store the customer was editing, and no mismatch or warning may come between them. The sent view must not be
// committed for a frame, and the form must be what stands.
//
// What this cannot see: a real server's streaming, and a real device's WebGL probe (stubbed as an external value).
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Support = "probing" | "supported";

const webgl = vi.hoisted(() => ({
  state: "probing" as Support,
  listeners: new Set<() => void>(),
}));

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
        () => "probing" as const,
      ),
  };
});
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div"),
}));

import { HydrateAndContact } from "@/app/d/[id]/contact/hydrate-and-contact";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import {
  DESIGN_ID,
  FIRST_REVISION,
} from "../contact/contact-submission-harness";

let consoleError: ReturnType<typeof vi.spyOn>;

function page() {
  return createElement(NextIntlClientProvider, {
    locale: "ro",
    messages: roMessages,
    timeZone: "Europe/Chisinau",
    children: createElement(HydrateAndContact, {
      design: KITCHEN_L_DESIGN,
      designId: DESIGN_ID,
      revision: FIRST_REVISION,
      isSendable: true,
      sentReference: { kind: "sent", reference: "LM-2614" },
    }),
  });
}

function holdAnUnsavedEditOfThisDesign(): void {
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
    revision: FIRST_REVISION,
    canWrite: true,
  });
  useConfiguratorStore.setState({
    design: { ...KITCHEN_L_DESIGN, presetId: "edited-before-the-page-loaded" },
  });
}

beforeEach(() => {
  webgl.state = "probing";
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hydrating the contact page of a sent kitchen", () => {
  it.each([
    ["with an unsaved edit held", true],
    ["with a clean store", false],
  ])(
    "%s: logs no mismatch, and ends on the form when an edit is held and on the sent view when not",
    async (_name, isEditHeld) => {
      useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
      const html = renderToString(page());
      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.append(container);
      if (isEditHeld) holdAnUnsavedEditOfThisDesign();
      else {
        useConfiguratorStore.getState().hydrate({
          design: KITCHEN_L_DESIGN,
          designId: DESIGN_ID,
          revision: FIRST_REVISION,
          canWrite: true,
        });
      }

      let root: ReturnType<typeof hydrateRoot> | undefined;
      await act(() => {
        root = hydrateRoot(container, page());
        return Promise.resolve();
      });
      await act(() => {
        webgl.state = "supported";
        for (const listener of webgl.listeners) listener();
        return Promise.resolve();
      });

      expect(container.querySelector("form") !== null).toBe(isEditHeld);
      expect(
        container.querySelector('[data-testid="contact-already-sent"]') !==
          null,
      ).toBe(!isEditHeld);
      expect(consoleError).not.toHaveBeenCalled();
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  );
});
