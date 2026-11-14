// @vitest-environment happy-dom
//
// The staff 3D screen asks `GET /api/staff/kitchens/{id}/3d` once, draws the share view's component with the design the
// answer holds, and draws a notice inside the staff frame, never a blank scene, for each answer that is not a design.
// The server is a stand-in for `fetch`; the share view is a stub (the real one mounts the editor canvas).
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffKitchen3dScreen } from "@/staff/staff-kitchen-3d-screen";
import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
  resolveStaffSessionExpired,
} from "@/staff/staff-session-expiry";
import type { StaffShellContext } from "@/staff/staff-shell";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { STAFF_KITCHEN_ID, WIRE_DESIGN } from "../support/staff-kitchen-wire";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  installStaffKitchensServer,
  type RecordedRequest,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

const sharedViews = vi.hoisted(() => ({
  designs: [] as unknown[],
  localeQueries: [] as unknown[],
}));

vi.mock("@/app/s/[token]/shared-design-view", async () => {
  const { createElement: element } = await import("react");
  return {
    SharedDesignView: (props: { design: unknown; localeQuery?: unknown }) => {
      sharedViews.designs.push(props.design);
      sharedViews.localeQueries.push(props.localeQuery);
      return element("div", { "data-testid": "stub-shared-view" });
    },
  };
});

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: "mihai.rusu@lemnaria.md",
  navigation: ["kitchens"],
};
const ENDPOINT = `/api/staff/kitchens/${STAFF_KITCHEN_ID}/3d`;
const SIGNED_IN_BODY = {
  state: "signed-in",
  email: CONTEXT.email,
  capabilities: ["design.read.any", "account.manage.own"],
};
const READY: ServerAnswer = {
  body: { design: WIRE_DESIGN, source: "as-sent" },
};
const UNREADABLE: ServerAnswer = {
  status: 422,
  body: { code: "STAFF_KITCHEN_UNREADABLE" },
};

let screen: MountedScreen | undefined;
let server: StaffKitchensServer;
let assigned: string[];

beforeEach(() => {
  vi.useFakeTimers();
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  sharedViews.designs = [];
  sharedViews.localeQueries = [];
  assigned = [];
  vi.stubGlobal("location", {
    assign: (address: string) => assigned.push(address),
  });
  server = installStaffKitchensServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function answers(
  answer: (request: RecordedRequest) => ServerAnswer | "hold" | "offline",
): void {
  server.script((request) =>
    request.url.pathname === ENDPOINT
      ? answer(request)
      : { body: SIGNED_IN_BODY },
  );
}

function reads(): RecordedRequest[] {
  return server.requests.filter(({ url }) => url.pathname === ENDPOINT);
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
}

async function mount(
  locale: TestLocale,
  version?: "sent" | "current",
): Promise<void> {
  screen = mountInCatalogue(
    createElement(StaffKitchen3dScreen, {
      locale,
      context: CONTEXT,
      designId: STAFF_KITCHEN_ID,
      version,
    }),
    locale,
  );
  await settle();
}

function container(): HTMLElement {
  if (screen === undefined) throw new Error("nothing is mounted");
  return screen.container;
}

function has(testId: string): boolean {
  return container().querySelector(`[data-testid="${testId}"]`) !== null;
}

describe.each(LOCALES)("the staff 3D screen in %s", (locale) => {
  const words = CATALOGUES[locale].staffKitchen;

  describe("the read", () => {
    it("asks once for this kitchen's 3D design, by GET with no referrer, naming no copy unasked", async () => {
      answers(() => READY);

      await mount(locale);

      expect(reads()).toHaveLength(1);
      expect(reads()[0]?.url.search).toBe("");
      expect(reads()[0]?.init.method).toBe("GET");
      expect(reads()[0]?.init.referrerPolicy).toBe("no-referrer");
    });

    it.each(["sent", "current"] as const)(
      "asks for the %s copy when the address names it",
      async (version) => {
        answers(() => READY);

        await mount(locale, version);

        expect(reads()[0]?.url.search).toBe(`?version=${version}`);
      },
    );

    it.each(["sent", "current"] as const)(
      "hands the share view the %s copy as the query its language menu keeps",
      async (version) => {
        answers(() => READY);

        await mount(locale, version);

        expect(sharedViews.localeQueries).toEqual([{ version }]);
      },
    );

    it("hands the share view no query when no copy was named", async () => {
      answers(() => READY);

      await mount(locale);

      expect(sharedViews.localeQueries).toEqual([undefined]);
    });

    it("makes no request that writes or reaches a design, share, preset or contact route", async () => {
      answers(() => READY);

      await mount(locale, "current");

      const kitchenReads = server.requests.filter(({ url }) =>
        url.pathname.startsWith("/api/staff/kitchens"),
      );
      expect(kitchenReads.map(({ init }) => init.method)).toEqual(["GET"]);
      expect(
        server.requests.filter(({ url }) =>
          /^\/api\/(designs|contact-submissions)/.test(url.pathname),
        ),
      ).toEqual([]);
    });
  });

  describe("a design", () => {
    it("is drawn by the share view's component with the design the answer held, outside the staff frame", async () => {
      answers(() => READY);

      await mount(locale);

      expect(has("stub-shared-view")).toBe(true);
      expect(sharedViews.designs).toHaveLength(1);
      expect(sharedViews.designs[0]).toMatchObject({
        placements: (WIRE_DESIGN as { placements: unknown[] }).placements,
      });
      expect(has("staff-kitchen-3d-page")).toBe(false);
    });

    it.each([
      [
        "a design this build cannot read",
        { design: { room: "?" }, source: "current" },
      ],
      ["a source it does not name", { design: WIRE_DESIGN, source: "latest" }],
      ["no source", { design: WIRE_DESIGN }],
      ["no body members", {}],
    ])(
      "is a failed request, and no scene, for an answer holding %s",
      async (_, body) => {
        answers(() => ({ body }));

        await mount(locale);

        expect(has("stub-shared-view")).toBe(false);
        expect(requireIn(container(), '[role="alert"]').textContent).toContain(
          CATALOGUES[locale].accountForm.requestFailedTitle,
        );
      },
    );
  });

  describe("an answer that is not a design draws a notice in the staff frame", () => {
    it("says the kitchen is not available for the one 404, and offers the way back to the list", async () => {
      answers(() => ({
        status: 404,
        body: { error: "Design not found" },
      }));

      await mount(locale);

      expect(
        requireIn(container(), '[data-testid="staff-kitchen-not-found"]')
          .textContent,
      ).toContain(words.notFoundTitle);
      expect(has("stub-shared-view")).toBe(false);
      expect(has("staff-role-chip")).toBe(true);
    });

    it("says it cannot show the kitchen when no copy is readable (422), and draws no scene", async () => {
      answers(() => UNREADABLE);

      await mount(locale);

      const notice = requireIn(
        container(),
        '[data-testid="staff-kitchen-cannot-show"]',
      ).textContent;
      expect(notice).toContain(words.cannotShowTitle);
      expect(has("stub-shared-view")).toBe(false);
    });

    it("tells a 422 that is not the kitchen's own refusal as a failed request", async () => {
      answers(() => ({ status: 422, body: { code: "SOMETHING_ELSE" } }));

      await mount(locale);

      expect(has("staff-kitchen-cannot-show")).toBe(false);
      expect(requireIn(container(), '[role="alert"]').textContent).toContain(
        CATALOGUES[locale].accountForm.requestFailedTitle,
      );
    });

    it("tells a 400 as a failed request, and shows no notice naming the refused value", async () => {
      answers(() => ({
        status: 400,
        body: {
          status: "invalid-input",
          issues: [{ field: "version", code: "UNKNOWN_VALUE" }],
        },
      }));

      await mount(locale);

      expect(has("stub-shared-view")).toBe(false);
      expect(requireIn(container(), '[role="alert"]').textContent).toContain(
        CATALOGUES[locale].accountForm.requestFailedTitle,
      );
    });

    it("tells a 503 as unavailable, asks again only on a press, and then draws the scene", async () => {
      answers(() => UNAVAILABLE_ANSWER);
      await mount(locale);

      expect(requireIn(container(), '[role="alert"]').textContent).toContain(
        CATALOGUES[locale].accountForm.unavailableTitle,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
      });
      expect(reads()).toHaveLength(1);

      answers(() => READY);
      click(
        byWords(container(), "button", CATALOGUES[locale].accountForm.retry),
      );
      await settle();

      expect(reads()).toHaveLength(2);
      expect(has("stub-shared-view")).toBe(true);
    });

    it("counts a 429 down and keeps the retry button off while it does", async () => {
      answers(() => RATE_LIMITED_ANSWER(30));

      await mount(locale);

      const retry = byWords(
        container(),
        "button",
        CATALOGUES[locale].accountForm.retry,
      );
      expect(retry.getAttribute("aria-disabled")).toBe("true");
    });

    it("tells an answer with no connection as the offline notice", async () => {
      answers(() => "offline");

      await mount(locale);

      expect(requireIn(container(), '[role="alert"]').textContent).toContain(
        CATALOGUES[locale].accountForm.offlineTitle,
      );
    });

    it("draws the forbidden screen inside the staff frame on a 403, never an expired session", async () => {
      answers(() => FORBIDDEN_ANSWER);

      await mount(locale);

      expect(container().textContent).toContain(
        CATALOGUES[locale].accountForbidden.title,
      );
      expect(has("stub-shared-view")).toBe(false);
      expect(getStaffSessionExpiry()).toBeUndefined();
    });

    it("raises the expired-session sheet on a 401 and reads again once the person has signed in", async () => {
      answers(() => UNAUTHENTICATED_ANSWER);
      await mount(locale);
      expect(getStaffSessionExpiry()).toBeDefined();
      expect(has("stub-shared-view")).toBe(false);

      answers(() => READY);
      act(() => {
        resolveStaffSessionExpired();
      });
      await settle();

      expect(reads()).toHaveLength(2);
      expect(has("stub-shared-view")).toBe(true);
    });

    it("shows the loading state, and no scene, while the answer is out", async () => {
      answers(() => "hold");

      await mount(locale);

      expect(has("staff-kitchen-skeleton")).toBe(true);
      expect(has("stub-shared-view")).toBe(false);
      expect(assigned).toEqual([]);
    });
  });
});
