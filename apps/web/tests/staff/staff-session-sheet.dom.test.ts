// @vitest-environment happy-dom
//
// The sheet that says the staff session ended (Lot 3 frames S1C and S2F), in Romanian and in Russian, over the kitchen
// page and over the list: that any refused staff request raises it, that the page behind is left as it was, that it is
// modal, that its link opens the sign-in in another tab, and that it asks the server once, on the person's word, whether
// they are signed in again before the refused read is asked for once more. The server is the project's stand-in for
// `fetch`; the words are the shipped catalogue's.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
} from "@/staff/staff-session-expiry";
import { StaffKitchensScreen } from "@/staff/staff-kitchens-list";
import type { StaffShellContext } from "@/staff/staff-shell";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import {
  KITCHEN_ADDRESS,
  SESSION_ADDRESS,
  ONE_REFUSAL,
  pressKey,
  readsOf,
  routeKitchen,
} from "../support/staff-kitchen-actions-screen";
import { wireKitchen } from "../support/staff-kitchen-wire";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  installStaffKitchensServer,
  wireList,
  wireRow,
  type RecordedRequest,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

import {
  PAGE,
  setUpScreenHarness,
  type KitchenAnswer,
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
const SHEET = '[data-testid="staff-session-sheet"]';
const SIGNED_IN: ServerAnswer = {
  body: {
    state: "signed-in",
    email: "mihai.rusu@lemnaria.md",
    capabilities: ["design.read.any"],
  },
};
const ANONYMOUS: ServerAnswer = { body: { state: "anonymous" } };

describe.each(LOCALES)(
  "the session sheet over the kitchen page in %s",
  (locale) => {
    const copy = CATALOGUES[locale].staffActions;
    let harness: ScreenHarness;
    let session: (request: RecordedRequest) => KitchenAnswer;
    let kitchen: (request: RecordedRequest) => KitchenAnswer;

    beforeEach(() => {
      harness = setUpScreenHarness();
      session = () => SIGNED_IN;
      kitchen = () => ({ body: wireKitchen() });
      harness.server.script((request) =>
        request.url.pathname === SESSION_ADDRESS
          ? session(request)
          : routeKitchen({ read: kitchen })(request),
      );
    });

    afterEach(() => {
      harness.tearDown();
    });

    const sheet = () => requireIn(harness.container(), SHEET);
    const hasSheet = () => allIn(harness.container(), SHEET).length === 1;
    const signIn = () => requireIn<HTMLAnchorElement>(sheet(), "a");
    const recheck = () =>
      byWords<HTMLButtonElement>(sheet(), "button", copy.sessionRecheck);
    /** The frame's own account control asks the session route once when the page opens; the sheet's asks are the rest. */
    const sessionAsks = () =>
      harness.server.requests.filter(
        ({ url }) => url.pathname === SESSION_ADDRESS,
      ).length - 1;

    async function expireOnFirstRead(): Promise<void> {
      let reads = 0;
      const read = kitchen;
      kitchen = (request) => {
        reads += 1;
        return reads === 1 ? UNAUTHENTICATED_ANSWER : read(request);
      };
      await harness.mount({ locale });
    }

    describe("what it says and where it leads", () => {
      beforeEach(async () => {
        await expireOnFirstRead();
      });

      it("is a dialog over the page, titled, with the plain body when nothing was typed", () => {
        expect(sheet().getAttribute("role")).toBe("dialog");
        expect(sheet().getAttribute("aria-modal")).toBe("true");
        expect(requireIn(sheet(), "h2").textContent).toBe(copy.sessionTitle);
        expect(sheet().textContent).toContain(copy.sessionBody);
        expect(sheet().textContent).not.toContain(copy.sessionBodyKeepsText);
        expect(sheet().textContent).toContain(copy.sessionNewTab);
      });

      it("leaves the page behind it as it was: the heading and the loading state are still there, nothing navigated", () => {
        expect(requireIn(harness.container(), `${PAGE} h1`)).not.toBeNull();
        expect(
          allIn(harness.container(), '[data-testid="staff-kitchen-skeleton"]'),
        ).toHaveLength(1);
        expect(harness.assigned).toEqual([]);
      });

      it("opens the login page of the page's own language in a new tab that cannot reach back", () => {
        expect(signIn().getAttribute("href")).toBe(
          `/${locale}/account/login?reason=session-expired`,
        );
        expect(signIn().getAttribute("target")).toBe("_blank");
        const relations = (signIn().getAttribute("rel") ?? "").split(" ");
        expect(relations).toContain("noopener");
        expect(relations).toContain("noreferrer");
        expect(signIn().textContent).toBe(copy.sessionSignIn);
      });

      it("opens on the sign-in link, and keeps Tab between the link and the button", () => {
        expect(document.activeElement).toBe(signIn());

        pressKey(recheck(), "Tab");
        expect(document.activeElement).toBe(signIn());

        pressKey(signIn(), "Tab", true);
        expect(document.activeElement).toBe(recheck());
      });

      it("does not leave on Escape: there is nothing behind it that works", () => {
        pressKey(document, "Escape");

        expect(hasSheet()).toBe(true);
      });

      it("makes the rest of the page inert and is a direct child of the frame's main", () => {
        const main = requireIn(harness.container(), "main");

        expect(sheet().closest("main")).toBe(main);
        const bands = [...main.children].filter(
          (band) => !band.contains(sheet()),
        );
        expect(bands.length).toBeGreaterThan(0);
        for (const band of bands) expect(band.hasAttribute("inert")).toBe(true);
      });

      it("is drawn once, not twice, however many requests were refused", () => {
        expect(allIn(harness.container(), SHEET)).toHaveLength(1);
        expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: false });
      });
    });

    describe("asking whether the person is signed in again", () => {
      beforeEach(async () => {
        await expireOnFirstRead();
      });

      it("asks the session route once for a press, and nothing at all before it", async () => {
        await harness.pass(24 * 60 * 60 * 1000);
        expect(sessionAsks()).toBe(0);

        click(recheck());
        await harness.settle();

        expect(sessionAsks()).toBe(1);
      });

      it("stays, with a sentence at the button, when the server says nobody is signed in", async () => {
        session = () => ANONYMOUS;

        click(recheck());
        await harness.settle();

        expect(hasSheet()).toBe(true);
        expect(requireIn(sheet(), '[role="alert"]').textContent).toBe(
          copy.sessionStillSignedOut,
        );
        expect(readsOf(harness.server)).toHaveLength(1);
      });

      it.each([
        ["a 503", UNAVAILABLE_ANSWER],
        ["no connection", "offline"],
      ] as const)(
        "stays, saying it could not check, after %s",
        async (_, answer) => {
          session = () => answer;

          click(recheck());
          await harness.settle();

          expect(hasSheet()).toBe(true);
          expect(requireIn(sheet(), '[role="alert"]').textContent).toBe(
            copy.sessionRecheckFailed,
          );
          expect(readsOf(harness.server)).toHaveLength(1);
        },
      );

      it("can be pressed again after an answer that was not signed in, and leaves when the next one is", async () => {
        session = () => ANONYMOUS;
        click(recheck());
        await harness.settle();
        session = () => SIGNED_IN;

        click(recheck());
        await harness.settle();

        expect(hasSheet()).toBe(false);
        expect(sessionAsks()).toBe(2);
      });

      it("asks once for a press repeated while the question is out", async () => {
        session = () => "hold";
        const button = recheck();

        click(button);
        click(button);
        await harness.settle();

        expect(sessionAsks()).toBe(1);
        expect(button.getAttribute("aria-busy")).toBe("true");
        expect(button.textContent).toBe(copy.sessionRechecking);
      });

      it("goes away on a signed-in answer, asks for the kitchen once more, draws it, and returns focus to the page", async () => {
        click(recheck());
        await harness.settle();

        expect(hasSheet()).toBe(false);
        expect(readsOf(harness.server)).toHaveLength(2);
        expect(requireIn(harness.container(), `${PAGE} h1`).textContent).toBe(
          "Casa din Orhei",
        );
        expect(
          allIn(harness.container(), '[data-testid="staff-kitchen-profile"]'),
        ).toHaveLength(1);
        expect(getStaffSessionExpiry()).toBeUndefined();
        const main = requireIn(harness.container(), "main");
        expect(
          [...main.children].some((band) => band.hasAttribute("inert")),
        ).toBe(false);
      });

      it("sends nothing more by itself afterwards", async () => {
        click(recheck());
        await harness.settle();
        await harness.pass(24 * 60 * 60 * 1000);

        expect(readsOf(harness.server)).toHaveLength(2);
        expect(sessionAsks()).toBe(1);
      });

      it("raises the sheet again if the kitchen is refused once more", async () => {
        kitchen = () => UNAUTHENTICATED_ANSWER;

        click(recheck());
        await harness.settle();

        expect(hasSheet()).toBe(true);
        expect(readsOf(harness.server)).toHaveLength(2);
      });
    });

    describe("what does not raise it", () => {
      it.each([
        ["a 403", FORBIDDEN_ANSWER],
        ["the one refusal of a kitchen", ONE_REFUSAL],
        ["a 429", RATE_LIMITED_ANSWER(30)],
        ["a 503", UNAVAILABLE_ANSWER],
        ["no connection", "offline"],
      ] as const)("%s", async (_, answer) => {
        kitchen = () => answer;

        await harness.mount({ locale });

        expect(hasSheet()).toBe(false);
        expect(getStaffSessionExpiry()).toBeUndefined();
      });
    });

    it("is raised once when the page runs twice, as the development build runs it", async () => {
      kitchen = () => UNAUTHENTICATED_ANSWER;

      await harness.mount({ locale, isStrict: true });

      expect(allIn(harness.container(), SHEET)).toHaveLength(1);
    });

    it("asks for nothing at the kitchen's address but the reads: the sheet itself sends no write", async () => {
      await expireOnFirstRead();
      click(recheck());
      await harness.settle();

      for (const request of harness.server.requests) {
        expect(request.init.method ?? "GET").toBe("GET");
        expect([KITCHEN_ADDRESS, SESSION_ADDRESS]).toContain(
          request.url.pathname,
        );
      }
    });
  },
);

describe.each(LOCALES)(
  "the session sheet over the list in %s (frame S2F)",
  (locale) => {
    const copy = CATALOGUES[locale].staffActions;
    const CONTEXT: StaffShellContext = {
      role: "operator",
      email: "mihai.rusu@lemnaria.md",
      navigation: ["kitchens"],
    };
    let screen: MountedScreen | undefined;
    let server: StaffKitchensServer;
    let list: (request: RecordedRequest) => ServerAnswer | "hold" | "offline";

    beforeEach(() => {
      vi.useFakeTimers();
      resetAccountSessionForTests();
      resetStaffSessionExpiryForTests();
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
      server = installStaffKitchensServer();
      list = () => UNAUTHENTICATED_ANSWER;
      server.script((request) =>
        request.url.pathname === "/api/staff/kitchens"
          ? list(request)
          : SIGNED_IN,
      );
    });

    afterEach(() => {
      screen?.unmount();
      screen = undefined;
      vi.useRealTimers();
      vi.unstubAllGlobals();
      document.body.replaceChildren();
    });

    async function settle(): Promise<void> {
      for (let round = 0; round < 4; round += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
      }
      await flushPromises(2);
    }

    const listAsks = () =>
      server.requests.filter(
        ({ url }) => url.pathname === "/api/staff/kitchens",
      );

    it("is drawn over the list with the plain body, and the list's own heading is still there", async () => {
      screen = mountInCatalogue(
        createElement(StaffKitchensScreen, { locale, context: CONTEXT }),
        locale,
      );
      await settle();

      const sheet = requireIn(screen.container, SHEET);
      expect(sheet.textContent).toContain(copy.sessionBody);
      expect(requireIn(screen.container, "h1").textContent).toBe(
        CATALOGUES[locale].staffKitchens.title,
      );
    });

    it("asks for the same page once more, and draws it, when the person has signed in again", async () => {
      screen = mountInCatalogue(
        createElement(StaffKitchensScreen, { locale, context: CONTEXT }),
        locale,
      );
      await settle();
      list = () => ({ body: wireList([wireRow(1), wireRow(2)]) });

      click(byWords(screen.container, "button", copy.sessionRecheck));
      await settle();

      expect(allIn(screen.container, SHEET)).toHaveLength(0);
      expect(listAsks()).toHaveLength(2);
      expect(listAsks()[1]?.url.search).toBe(listAsks()[0]?.url.search);
      expect(
        allIn(screen.container, '[data-testid="staff-kitchen-row"]'),
      ).toHaveLength(2);
    });

    it("does not ask again by itself while the sheet is up", async () => {
      screen = mountInCatalogue(
        createElement(StaffKitchensScreen, { locale, context: CONTEXT }),
        locale,
      );
      await settle();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      });

      expect(listAsks()).toHaveLength(1);
    });
  },
);
