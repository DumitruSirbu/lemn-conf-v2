// @vitest-environment happy-dom
//
// W3b adversarial QA of the staff 3D screen (ADR 0180 d4, plan W3b-2, W3b-7, W3b-8): every status the endpoint or the platform
// can answer with, the requests the screen makes in every state it can be in, the abort a leaving person makes, and the
// language switch of the staff frame that stands around each state that is not a scene.
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
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { STAFF_KITCHEN_ID, WIRE_DESIGN } from "../support/staff-kitchen-wire";
import {
  UNAUTHENTICATED_ANSWER,
  installStaffKitchensServer,
  type RecordedRequest,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

const shown = vi.hoisted(() => ({ designs: [] as unknown[] }));

vi.mock("@/app/s/[token]/shared-design-view", async () => {
  const { createElement: element } = await import("react");
  return {
    SharedDesignView: (props: { design: unknown }) => {
      shown.designs.push(props.design);
      return element("div", { "data-testid": "stub-shared-view" });
    },
  };
});

const CONTEXT: StaffShellContext = {
  role: "operator",
  email: "mihai.rusu@lemnaria.md",
  navigation: ["kitchens"],
};
const ENDPOINT = `/api/staff/kitchens/${STAFF_KITCHEN_ID}/3d`;
const READY: ServerAnswer = {
  body: { design: WIRE_DESIGN, source: "as-sent" },
};
const SIGNED_IN: ServerAnswer = {
  body: {
    state: "signed-in",
    email: CONTEXT.email,
    capabilities: ["design.read.any", "account.manage.own"],
  },
};

let screen: MountedScreen | undefined;
let server: StaffKitchensServer;

beforeEach(() => {
  vi.useFakeTimers();
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  shown.designs = [];
  vi.stubGlobal("location", { assign: () => undefined });
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
    request.url.pathname === ENDPOINT ? answer(request) : SIGNED_IN,
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
  locale: TestLocale = "ro",
  version?: "sent" | "current",
): Promise<HTMLElement> {
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
  return screen.container;
}

function has(container: HTMLElement, testId: string): boolean {
  return container.querySelector(`[data-testid="${testId}"]`) !== null;
}

describe("every status the endpoint or the platform can answer with", () => {
  it.each([
    [400, { status: "invalid-input", issues: [] }],
    [402, {}],
    [405, {}],
    [408, {}],
    [409, { code: "STAFF_KITCHEN_UNREADABLE" }],
    [410, {}],
    [413, {}],
    [418, {}],
    [422, {}],
    [422, { code: "staff_kitchen_unreadable" }],
    [422, { code: ["STAFF_KITCHEN_UNREADABLE"] }],
    [429, { status: "rate-limited" }],
    [500, { status: "unavailable" }],
    [500, undefined],
    [502, undefined],
    [504, undefined],
    [301, undefined],
    [204, undefined],
  ])(
    "draws no scene and no refusal-of-this-kitchen notice for %i with %j",
    async (status, body) => {
      answers(() => ({ status, body }));

      const container = await mount();

      expect(has(container, "stub-shared-view")).toBe(false);
      expect(has(container, "staff-kitchen-cannot-show")).toBe(false);
      expect(has(container, "staff-kitchen-not-found")).toBe(false);
      expect(shown.designs).toEqual([]);
    },
  );

  it.each([
    ["a 404 of the platform with no body", { status: 404 }],
    ["a 404 with an empty object", { status: 404, body: {} }],
    [
      "a 404 with a number for its message",
      { status: 404, body: { error: 7 } },
    ],
  ])("does not say the kitchen is gone for %s", async (_, answer) => {
    answers(() => answer);

    const container = await mount();

    expect(has(container, "staff-kitchen-not-found")).toBe(false);
    expect(has(container, "stub-shared-view")).toBe(false);
  });

  it("keeps the staff frame around the loading state, the failure and the notice, and takes it away for the scene only", async () => {
    answers(() => "hold");
    const container = await mount();
    expect(has(container, "staff-role-chip")).toBe(true);

    answers(() => READY);
    screen?.unmount();
    const ready = await mount();

    expect(has(ready, "stub-shared-view")).toBe(true);
    expect(has(ready, "staff-role-chip")).toBe(false);
  });
});

describe("the requests the screen makes", () => {
  it.each([
    ["a design", () => READY],
    ["a 404", () => ({ status: 404, body: { error: "Design not found" } })],
    ["a 503", () => ({ status: 503, body: { status: "unavailable" } })],
    [
      "a 422",
      () => ({ status: 422, body: { code: "STAFF_KITCHEN_UNREADABLE" } }),
    ],
    ["a 403", () => ({ status: 403, body: { status: "forbidden" } })],
    ["an offline browser", () => "offline" as const],
  ])(
    "are only reads of the 3D endpoint and the session, in a state of %s",
    async (_, answer) => {
      answers(answer);

      await mount("ro", "current");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });

      for (const request of [...server.requests, ...server.countPolls]) {
        expect(request.init.method ?? "GET").toBe("GET");
        expect(request.url.pathname).not.toMatch(
          /^\/api\/(designs|contact-submissions|presets)/,
        );
      }
      expect(reads()).toHaveLength(1);
    },
  );

  it("asks the endpoint for this kitchen's id only, with the one query member and nothing the page's address held", async () => {
    answers(() => READY);

    await mount("ru", "sent");

    expect(reads().map(({ url }) => url.pathname + url.search)).toEqual([
      `${ENDPOINT}?version=sent`,
    ]);
    expect(reads()[0]?.init.credentials).toBeUndefined();
  });

  it("asks once and never again by itself, however long the page stays open", async () => {
    answers(() => READY);

    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    });

    expect(reads()).toHaveLength(1);
  });
});

describe("a person who leaves before the answer", () => {
  it("is not shown a scene, and no error is logged, when the answer comes after the screen has gone", async () => {
    const logged = vi.spyOn(console, "error");
    answers(() => "hold");
    await mount();

    screen?.unmount();
    screen = undefined;
    server.held[0]?.answer(READY);
    await settle();

    expect(shown.designs).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
  });

  it("does not read again for a session sheet answered after the screen has gone", async () => {
    answers(() => UNAUTHENTICATED_ANSWER);
    await mount();
    expect(getStaffSessionExpiry()).toBeDefined();

    screen?.unmount();
    screen = undefined;
    answers(() => READY);
    act(() => {
      resolveStaffSessionExpired();
    });
    await settle();

    expect(reads()).toHaveLength(1);
    expect(shown.designs).toEqual([]);
  });

  it("aborts the read it had out when it goes", async () => {
    answers(() => "hold");
    await mount();

    screen?.unmount();
    screen = undefined;

    expect(server.held[0]?.signal.aborted).toBe(true);
  });
});

describe("pressing 'try again'", () => {
  it("after the browser was offline asks again once and draws the scene", async () => {
    answers(() => "offline");
    const container = await mount();

    answers(() => READY);
    click(byWords(container, "button", roMessages.accountForm.retry));
    await settle();

    expect(reads()).toHaveLength(2);
    expect(has(container, "stub-shared-view")).toBe(true);
    expect(shown.designs).toHaveLength(1);
  });

  it("after a 404 offers no 'try again', since the kitchen is not there to be asked for again", async () => {
    answers(() => ({ status: 404, body: { error: "Design not found" } }));
    const container = await mount();

    expect(
      allIn(container, "button").filter((button) =>
        button.textContent.includes(roMessages.accountForm.retry),
      ),
    ).toHaveLength(0);
  });
});

describe("the language switch of the frame around a state that is not a scene (plan W3b-7)", () => {
  it.each([
    ["offline", () => "offline" as const],
    ["a 404", () => ({ status: 404, body: { error: "Design not found" } })],
    [
      "a 422",
      () => ({ status: 422, body: { code: "STAFF_KITCHEN_UNREADABLE" } }),
    ],
    ["a 503", () => ({ status: 503, body: { status: "unavailable" } })],
    ["a held read", () => "hold" as const],
  ])(
    "keeps the person on this kitchen's 3D view, in the other language, in %s",
    async (_, answer) => {
      answers(answer);

      const container = await mount("ro", "current");
      const switchLinks = allIn<HTMLAnchorElement>(container, "nav a[lang]");

      expect(switchLinks.map((link) => link.getAttribute("href"))).toEqual([
        `/ru/staff/kitchens/${STAFF_KITCHEN_ID}/3d?version=current`,
      ]);
    },
  );
});
