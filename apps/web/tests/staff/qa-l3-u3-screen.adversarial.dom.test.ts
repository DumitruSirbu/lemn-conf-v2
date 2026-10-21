// @vitest-environment happy-dom
//
// The staff kitchen screen as a whole, tried where its parts meet (wave L3-U3): run twice by the development build, moved from
// one kitchen to another by the framework, asked again after every kind of failure, and left in the middle of a request. And
// the three things it must never do with what it reads, over a whole visit: keep it, say it, or send it anywhere but back to
// the staff member who asked.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCameraPreset } from "@/scene/camera-preset-store";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  allIn,
  click,
  requireIn,
  type TestLocale,
} from "../support/render-with-intl";
import {
  STAFF_KITCHEN_ID,
  WIRE_DESIGN,
  wireChangedStatus,
  wireKitchen,
} from "../support/staff-kitchen-wire";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  staffKitchenIdOf,
} from "../support/staff-kitchens-wire";

import {
  PAGE,
  setUpScreenHarness,
  type ScreenHarness,
} from "./qa-l3-u3-harness.adversarial";

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => null,
    ViewOnlyKitchenCanvas: () => element("canvas"),
  };
});

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
  detectWebGLSupport: () => true,
}));

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const OTHER_ID = staffKitchenIdOf(2);
const SENTINEL = "SENTINEL-3f9a-CLIENT";
const SMALL_DESIGN: unknown = {
  ...(WIRE_DESIGN as { placements: unknown[] }),
  placements: (WIRE_DESIGN as { placements: unknown[] }).placements.slice(0, 3),
};
const CONSOLE_METHODS = [
  "log",
  "info",
  "warn",
  "error",
  "debug",
  "trace",
] as const;

let harness: ScreenHarness;

beforeEach(() => {
  harness = setUpScreenHarness();
});

afterEach(() => {
  harness.tearDown();
});

function page(): HTMLElement {
  return requireIn(harness.container(), PAGE);
}

describe("run twice, as the development build runs a page", () => {
  it("shows the kitchen of the second request only, and leaves the first request aborted", async () => {
    harness.answers(() => "hold");
    harness.server.honoursAbort = false;
    await harness.mount({ isStrict: true });
    const [first, second] = harness.server.held;

    first?.answer({
      body: wireKitchen({ kitchen: { name: "From the first" } }),
    });
    await harness.settle();
    expect(allIn(page(), "h1")[0]?.textContent).not.toBe("From the first");
    second?.answer({
      body: wireKitchen({ kitchen: { name: "From the second" } }),
    });
    await harness.settle();

    expect(first?.signal.aborted).toBe(true);
    expect(requireIn(page(), "h1").textContent).toBe("From the second");
    expect(harness.kitchenRequests()).toHaveLength(2);
  });

  it("draws the session sheet once for a 401, navigates nowhere and draws nothing of a kitchen", async () => {
    harness.answers(() => UNAUTHENTICATED_ANSWER);

    await harness.mount({ isStrict: true, locale: "ru" });

    expect(harness.assigned).toEqual([]);
    expect(
      allIn(harness.container(), '[data-testid="staff-session-sheet"]'),
    ).toHaveLength(1);
    expect(
      allIn(harness.container(), '[data-testid="staff-kitchen-profile"]'),
    ).toHaveLength(0);
  });

  it("ends on the same page as a run that was not doubled, for the same answer", async () => {
    harness.answers(() => ({ body: wireKitchen() }));
    await harness.mount();
    const once = withoutGeneratedIds(page().innerHTML);
    harness.unmount();
    useConfiguratorStore.setState(useConfiguratorStore.getInitialState(), true);

    await harness.mount({ isStrict: true });

    expect(withoutGeneratedIds(page().innerHTML)).toBe(once);
  });
});

/** React's generated ids differ between two mounts of one page; nothing else may. */
function withoutGeneratedIds(markup: string): string {
  return markup.replace(/_r_[a-z0-9]+_/g, "_r_");
}

describe("moved from one kitchen to another while the page is up", () => {
  it("draws the loading state at once for the new kitchen, and nothing of the one it left", async () => {
    harness.answers((request) =>
      request.url.pathname.endsWith(OTHER_ID)
        ? "hold"
        : { body: wireKitchen({ kitchen: { name: "First kitchen" } }) },
    );
    await harness.mount();
    expect(requireIn(page(), "h1").textContent).toBe("First kitchen");

    await harness.moveTo(OTHER_ID);

    expect(page().textContent).not.toContain("First kitchen");
    expect(
      allIn(harness.container(), '[data-testid="staff-kitchen-skeleton"]'),
    ).toHaveLength(1);
    expect(
      allIn(harness.container(), '[data-testid="staff-kitchen-profile"]'),
    ).toHaveLength(0);
  });

  it("draws the answer of the kitchen it was moved to, whatever the one it left answers afterwards", async () => {
    harness.answers(() => "hold");
    harness.server.honoursAbort = false;
    await harness.mount();
    await harness.moveTo(OTHER_ID);
    const [forFirst, forSecond] = harness.server.held;

    forSecond?.answer({
      body: wireKitchen({ kitchen: { id: OTHER_ID, name: "Second" } }),
    });
    await harness.settle();
    forFirst?.answer({
      body: wireKitchen({ kitchen: { id: STAFF_KITCHEN_ID, name: "First" } }),
    });
    await harness.settle();

    expect(requireIn(page(), "h1").textContent).toBe("Second");
  });

  it("puts the second kitchen's document into the picture's store, not the first's", async () => {
    harness.answers((request) => ({
      body: request.url.pathname.endsWith(OTHER_ID)
        ? wireKitchen({ kitchen: { id: OTHER_ID, asSent: SMALL_DESIGN } })
        : wireKitchen(),
    }));
    await harness.mount();
    expect(useConfiguratorStore.getState().design.placements).toHaveLength(
      (WIRE_DESIGN as { placements: unknown[] }).placements.length,
    );

    await harness.moveTo(OTHER_ID);

    expect(useConfiguratorStore.getState().design.placements).toHaveLength(3);
  });

  it("does not leave for the login page for the 401 of the kitchen it left", async () => {
    harness.answers(() => "hold");
    harness.server.honoursAbort = false;
    await harness.mount();
    await harness.moveTo(OTHER_ID);

    harness.server.held[0]?.answer(UNAUTHENTICATED_ANSWER);
    await harness.settle();

    expect(harness.assigned).toEqual([]);
  });
});

describe.each(LOCALES)(
  "asked again after each kind of failure, in %s",
  (locale) => {
    const retryWord = CATALOGUES[locale].accountForm.retry;

    function retryButton(): HTMLButtonElement {
      const found = allIn<HTMLButtonElement>(page(), "button").find(
        (button) => button.textContent === retryWord,
      );
      if (found === undefined) throw new Error("no retry button");
      return found;
    }

    it.each([
      ["a 503", () => UNAVAILABLE_ANSWER],
      ["a connection that failed", () => "offline" as const],
      ["an answer that is not a kitchen", () => ({ body: { kitchen: {} } })],
      ["a 500", () => ({ status: 500 })],
    ])(
      "recovers from %s on one press, and the notice goes",
      async (_, failure) => {
        harness.answers(failure);
        await harness.mount({ locale });
        expect(allIn(page(), "[role='alert']")).toHaveLength(1);
        harness.answers(() => ({ body: wireKitchen() }));

        click(retryButton());
        await harness.settle();

        expect(allIn(harness.container(), "[role='alert']")).toHaveLength(0);
        expect(requireIn(page(), "h1").textContent).toBe("Casa din Orhei");
        expect(harness.kitchenRequests()).toHaveLength(2);
      },
    );

    it("fails again, once, on a press that is answered with another failure, and sends nothing alone afterwards", async () => {
      harness.answers(() => UNAVAILABLE_ANSWER);
      await harness.mount({ locale });

      click(retryButton());
      await harness.settle();
      await harness.pass(24 * 60 * 60 * 1000);

      expect(harness.kitchenRequests()).toHaveLength(2);
      expect(allIn(page(), "[role='alert']")).toHaveLength(1);
    });

    it("goes to the staff frame's forbidden page, not the sign-in page, when a press is answered with a 403", async () => {
      harness.answers(() => UNAVAILABLE_ANSWER);
      await harness.mount({ locale });
      harness.answers(() => FORBIDDEN_ANSWER);

      click(retryButton());
      await harness.settle();

      expect(harness.assigned).toEqual([]);
      expect(harness.container().textContent).toContain(
        CATALOGUES[locale].accountForbidden.title,
      );
    });

    it("ignores every press while a wait of up to ten minutes is counted, sends one when it ends, and never alone", async () => {
      harness.answers(() => RATE_LIMITED_ANSWER(599));
      await harness.mount({ locale });

      for (let press = 0; press < 5; press += 1) {
        click(retryButton());
        await harness.settle();
      }
      expect(harness.kitchenRequests()).toHaveLength(1);
      expect(retryButton().getAttribute("aria-disabled")).toBe("true");

      await harness.pass(599 * 1000);
      expect(retryButton().getAttribute("aria-disabled")).toBeNull();
      expect(harness.kitchenRequests()).toHaveLength(1);
      await harness.pass(24 * 60 * 60 * 1000);
      expect(harness.kitchenRequests()).toHaveLength(1);
    });

    it("is left in the middle of a request without a message from React, and the late answer draws nothing", async () => {
      const errors = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      harness.answers(() => "hold");
      harness.server.honoursAbort = false;
      await harness.mount({ locale });
      const held = harness.server.held[0];

      harness.unmount();
      held?.answer({ body: wireKitchen() });
      await harness.settle();

      expect(errors).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain("Casa din Orhei");
    });
  },
);

describe("what the page does with a kitchen over a whole visit", () => {
  const TYPED = {
    kitchen: { name: SENTINEL },
    client: { email: `${SENTINEL}@mail.md`, name: SENTINEL, phone: SENTINEL },
    request: { reference: SENTINEL, sentAt: "2026-10-17T11:08:00.000Z" },
    status: wireChangedStatus("contacted", {
      email: `${SENTINEL}@x.md`,
      name: SENTINEL,
    }),
  };

  it.each(LOCALES)(
    "keeps nothing and says nothing in %s: no storage, no cookie, no console, no address, no title",
    async (locale) => {
      const consoleCalls = CONSOLE_METHODS.map((method) =>
        vi.spyOn(console, method).mockImplementation(() => undefined),
      );
      const stored = vi.spyOn(Storage.prototype, "setItem");
      const cookies = vi.spyOn(document, "cookie", "set");
      const addressWrites = [
        vi.spyOn(window.history, "pushState"),
        vi.spyOn(window.history, "replaceState"),
      ];
      document.title = "unchanged";
      harness.answers(() => ({ body: wireKitchen(TYPED) }));

      await harness.mount({ locale });
      for (const chip of allIn<HTMLButtonElement>(page(), "button"))
        click(chip);
      await harness.pass(5 * 60 * 1000);
      harness.unmount();

      expect(stored).not.toHaveBeenCalled();
      expect(cookies).not.toHaveBeenCalled();
      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);
      for (const call of consoleCalls) expect(call).not.toHaveBeenCalled();
      for (const write of addressWrites) expect(write).not.toHaveBeenCalled();
      expect(document.title).toBe("unchanged");
      expect(document.cookie).toBe("");
    },
  );

  it("asks the network only for this kitchen and the session, by GET, with no body, never twice for a kitchen it has", async () => {
    harness.answers(() => ({ body: wireKitchen(TYPED) }));

    await harness.mount();
    for (const chip of allIn<HTMLButtonElement>(
      page(),
      '[role="group"] button',
    )) {
      click(chip);
    }
    await harness.pass(10 * 60 * 1000);

    expect(harness.kitchenRequests()).toHaveLength(1);
    for (const request of harness.server.requests) {
      expect(request.init.method ?? "GET").toBe("GET");
      expect(request.init.body).toBeUndefined();
      expect(request.url.search).toBe("");
      expect([
        `/api/staff/kitchens/${STAFF_KITCHEN_ID}`,
        "/api/account/session",
      ]).toContain(request.url.pathname);
    }
    expect(useCameraPreset.getState().presetId).not.toBe("overview");
  });

  it("leaves the picture's store unable to write, and under an id no kitchen has, whatever was read", async () => {
    harness.answers(() => ({ body: wireKitchen(TYPED) }));

    await harness.mount();

    const store = useConfiguratorStore.getState();
    expect(store.canWrite).toBe(false);
    expect(store.designId).toBe("staff-view");
    await act(async () => {
      await Promise.resolve();
    });
    expect(harness.kitchenRequests()).toHaveLength(1);
  });
});
