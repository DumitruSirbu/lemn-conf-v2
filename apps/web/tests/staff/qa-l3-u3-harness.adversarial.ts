// What the adversarial tests of the staff kitchen page (wave L3-U3) share: the whole screen mounted in the shipped
// catalogue over a stand-in for `fetch`, fake timers that settle every request, an optional `<StrictMode>`, and a root the
// test can render again with another id. Not a test file: the suites that use it are `qa-l3-u3-*.adversarial.*.test.ts`,
// and each declares its own `vi.mock` of the canvas, which Vitest only hoists inside the file that writes it.
import { NextIntlClientProvider } from "next-intl";
import { StrictMode, act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { useCameraPreset } from "@/scene/camera-preset-store";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import type { StaffShellContext } from "@/staff/staff-shell";
import { useConfiguratorStore } from "@/store/configurator-store";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import type { TestLocale } from "../support/render-with-intl";
import { STAFF_KITCHEN_ID } from "../support/staff-kitchen-wire";
import {
  installStaffKitchensServer,
  type RecordedRequest,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

export const NOW = "2026-10-21T12:00:00.000Z";
export const STAFF_ADDRESS = "mihai.rusu@lemnaria.md";
export const PAGE = '[data-testid="staff-kitchen-page"]';

const CATALOGUE_OF = {
  ro: roMessages,
  ru: ruMessages as typeof roMessages,
} as const;
const SESSION_ANSWER = {
  body: {
    state: "signed-in",
    email: STAFF_ADDRESS,
    capabilities: ["design.read.any", "account.manage.own"],
  },
} as const;
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: STAFF_ADDRESS,
  navigation: ["kitchens"],
};

export type KitchenAnswer = ServerAnswer | "hold" | "offline";

export interface MountOptions {
  readonly locale?: TestLocale;
  readonly designId?: string;
  /** The page keys the screen by the id it was given; a test of the screen alone may leave the key off. */
  readonly isKeyed?: boolean;
  readonly isStrict?: boolean;
}

export interface ScreenHarness {
  readonly server: StaffKitchensServer;
  /** Every address a full load was asked for, in order. */
  readonly assigned: string[];
  readonly settle: () => Promise<void>;
  readonly pass: (milliseconds: number) => Promise<void>;
  readonly mount: (options?: MountOptions) => Promise<void>;
  /** Draws the same root again for another id, as the framework does when the address changes. */
  readonly moveTo: (designId: string) => Promise<void>;
  readonly container: () => HTMLElement;
  readonly unmount: () => void;
  readonly answers: (
    answer: (request: RecordedRequest) => KitchenAnswer,
  ) => void;
  readonly kitchenRequests: () => RecordedRequest[];
  readonly tearDown: () => void;
}

/** Call in `beforeEach`; call `tearDown` in `afterEach`. */
export function setUpScreenHarness(): ScreenHarness {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  resetSharedStores();
  const assigned: string[] = [];
  vi.stubGlobal("location", {
    assign: (address: string) => assigned.push(address),
  });
  const server = installStaffKitchensServer();
  const state: { root: RootInHost | undefined } = { root: undefined };

  const harness: ScreenHarness = {
    server,
    assigned,
    settle,
    pass: async (milliseconds) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(milliseconds);
      });
      await settle();
    },
    mount: async (options = {}) => {
      state.root = mountRoot(options);
      await settle();
    },
    moveTo: async (designId) => {
      if (state.root === undefined) throw new Error("nothing is mounted");
      state.root.draw(designId);
      await settle();
    },
    container: () => {
      if (state.root === undefined) throw new Error("nothing is mounted");
      return state.root.container;
    },
    unmount: () => {
      state.root?.unmount();
      state.root = undefined;
    },
    answers: (answer) => {
      server.script((request) =>
        request.url.pathname.startsWith("/api/staff/kitchens/")
          ? answer(request)
          : SESSION_ANSWER,
      );
    },
    kitchenRequests: () =>
      server.requests.filter(({ url }) =>
        url.pathname.startsWith("/api/staff/kitchens/"),
      ),
    tearDown: () => {
      state.root?.unmount();
      state.root = undefined;
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      document.body.replaceChildren();
      resetSharedStores();
    },
  };
  return harness;
}

/** The two process-wide stores a ready kitchen touches: the review's own, and the camera's. */
export function resetSharedStores(): void {
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState(), true);
  useCameraPreset.setState({ presetId: "overview" });
}

interface RootInHost {
  readonly container: HTMLElement;
  readonly draw: (designId: string) => void;
  readonly unmount: () => void;
}

function mountRoot({
  locale = "ro",
  designId = STAFF_KITCHEN_ID,
  isKeyed = true,
  isStrict = false,
}: MountOptions): RootInHost {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const screenFor = (id: string): ReactElement =>
    createElement(StaffKitchenScreen, {
      ...(isKeyed ? { key: id } : {}),
      locale,
      context: CONTEXT,
      designId: id,
    });
  const draw = (id: string): void => {
    const provided = createElement(NextIntlClientProvider, {
      locale,
      messages: CATALOGUE_OF[locale],
      timeZone: "Europe/Chisinau",
      children: screenFor(id),
    });
    act(() => {
      root.render(
        isStrict ? createElement(StrictMode, null, provided) : provided,
      );
    });
  };
  draw(designId);
  return {
    container,
    draw,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
}
