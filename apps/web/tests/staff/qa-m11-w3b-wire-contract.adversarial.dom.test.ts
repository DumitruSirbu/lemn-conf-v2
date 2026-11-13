// @vitest-environment happy-dom
//
// W3b adversarial QA: the 3D screen's hook reads what the server's own builders write, not what a test author typed.
// Every answer below is made by the real response builder of `GET /api/staff/kitchens/{id}/3d`
// (`lib/server/staff/staff-responses.ts`, `lib/server/design-errors.ts`) and re-served to the screen through `fetch`, so a
// drift of the wire (a renamed `source`, a changed refusal code or status) fails here and not in a browser.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { designNotFoundResponse } from "@/lib/server/design-errors";
import {
  staffInvalidVersionResponse,
  staffKitchen3dResponse,
  staffKitchenUnreadableResponse,
} from "@/lib/server/staff/staff-responses";
import { StaffKitchen3dScreen } from "@/staff/staff-kitchen-3d-screen";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import type { StaffShellContext } from "@/staff/staff-shell";

import { flushPromises } from "../support/render-hook";
import {
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import { STAFF_KITCHEN_ID } from "../support/staff-kitchen-wire";
import {
  installStaffKitchensServer,
  type ServerAnswer,
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

let screen: MountedScreen | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  shown.designs = [];
  vi.stubGlobal("location", { assign: () => undefined });
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function asAnswer(response: Response): Promise<ServerAnswer> {
  return { status: response.status, body: await response.json() };
}

async function mountAgainst(response: Response): Promise<void> {
  const answer = await asAnswer(response);
  installStaffKitchensServer().script((request) =>
    request.url.pathname === ENDPOINT
      ? answer
      : {
          body: {
            state: "signed-in",
            email: CONTEXT.email,
            capabilities: ["design.read.any", "account.manage.own"],
          },
        },
  );
  screen = mountInCatalogue(
    createElement(StaffKitchen3dScreen, {
      locale: "ro",
      context: CONTEXT,
      designId: STAFF_KITCHEN_ID,
      version: undefined,
    }),
    "ro",
  );
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
}

function has(testId: string): boolean {
  return screen?.container.querySelector(`[data-testid="${testId}"]`) != null;
}

describe("the hook against the server's own answers", () => {
  it.each(["as-sent", "current"] as const)(
    "draws the scene, with the design the server wrote, for source %s",
    async (source) => {
      await mountAgainst(
        staffKitchen3dResponse({ design: KITCHEN_L_DESIGN, source }),
      );

      expect(has("stub-shared-view")).toBe(true);
      expect(shown.designs).toHaveLength(1);
      expect(shown.designs[0]).toEqual(
        JSON.parse(JSON.stringify(KITCHEN_L_DESIGN)),
      );
    },
  );

  it("tells the server's no-copy-readable refusal as the cannot-show notice", async () => {
    await mountAgainst(staffKitchenUnreadableResponse());

    expect(has("staff-kitchen-cannot-show")).toBe(true);
    expect(has("stub-shared-view")).toBe(false);
  });

  it("tells the server's not-found refusal as the not-available notice", async () => {
    await mountAgainst(designNotFoundResponse(STAFF_KITCHEN_ID));

    expect(has("staff-kitchen-not-found")).toBe(true);
    expect(has("stub-shared-view")).toBe(false);
  });

  it("tells the server's invalid-version refusal as a failed request, never a scene", async () => {
    await mountAgainst(staffInvalidVersionResponse());

    expect(has("stub-shared-view")).toBe(false);
    expect(has("staff-kitchen-not-found")).toBe(false);
    expect(has("staff-kitchen-cannot-show")).toBe(false);
    expect(screen?.container.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe("the hook against hostile bodies", () => {
  it.each([
    ["a null body", { status: 200, body: null }],
    ["a string body", { status: 200, body: "design" }],
    ["an array body", { status: 200, body: [KITCHEN_L_DESIGN] }],
    ["a number body", { status: 200, body: 7 }],
    [
      "a design that is null",
      { status: 200, body: { design: null, source: "current" } },
    ],
    [
      "an inherited design member only",
      (() => {
        const body = Object.create({
          design: JSON.parse(JSON.stringify(KITCHEN_L_DESIGN)) as unknown,
          source: "current",
        }) as unknown;
        return { status: 200, body };
      })(),
    ],
    [
      "a 200 carrying the unreadable code",
      { status: 200, body: { code: "STAFF_KITCHEN_UNREADABLE" } },
    ],
    [
      "a 500 carrying the unreadable code",
      { status: 500, body: { code: "STAFF_KITCHEN_UNREADABLE" } },
    ],
    ["a 404 with no body", { status: 404, body: undefined }],
    ["a 404 that is the platform's", { status: 404, body: { message: "x" } }],
  ])("never draws a scene for %s", async (_, answer) => {
    installStaffKitchensServer().script((request) =>
      request.url.pathname === ENDPOINT
        ? (answer as ServerAnswer)
        : {
            body: {
              state: "signed-in",
              email: CONTEXT.email,
              capabilities: ["design.read.any", "account.manage.own"],
            },
          },
    );
    screen = mountInCatalogue(
      createElement(StaffKitchen3dScreen, {
        locale: "ro",
        context: CONTEXT,
        designId: STAFF_KITCHEN_ID,
        version: undefined,
      }),
      "ro",
    );
    for (let round = 0; round < 4; round += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    }
    await flushPromises(2);

    expect(has("stub-shared-view")).toBe(false);
    expect(has("staff-kitchen-cannot-show")).toBe(false);
    expect(shown.designs).toEqual([]);
  });
});
