// @vitest-environment happy-dom
//
// Adversarial QA of the settings the version switch marks as differing: a whole-kitchen colour that was added, taken away or
// changed between the copy as sent and the copy as it stands is marked on the summary, whichever of the two the person reads.
import { paletteFinish, freeColourFinish } from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import type { StaffShellContext } from "@/staff/staff-shell";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";
import {
  STAFF_KITCHEN_ID,
  WIRE_DESIGN,
  wireKitchen,
} from "../support/staff-kitchen-wire";
import {
  installStaffKitchensServer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

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

const CONTEXT: StaffShellContext = {
  role: "operator",
  email: "mihai.rusu@lemnaria.md",
  navigation: ["kitchens"],
};
const KITCHEN_ADDRESS = `/api/staff/kitchens/${STAFF_KITCHEN_ID}`;
const SUMMARY_DIFFERENCES =
  '[data-testid="staff-kitchen-summary"] [data-differs]';

let screen: MountedScreen | undefined;
let server: StaffKitchensServer;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
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

function withFinish(finish: unknown): unknown {
  const { settings, ...rest } = WIRE_DESIGN as {
    settings: Record<string, unknown>;
  };
  const withoutFinish = { ...settings };
  delete withoutFinish.finish;
  return {
    ...rest,
    settings:
      finish === undefined ? withoutFinish : { ...withoutFinish, finish },
  };
}

async function mountWith(sent: unknown, current: unknown): Promise<void> {
  server.script((request) => {
    if (request.url.pathname === KITCHEN_ADDRESS) {
      return {
        body: wireKitchen({
          changedAfterSeen: true,
          displayedRevision: "7",
          kitchen: { asSent: sent, design: current },
        }),
      };
    }
    if (request.url.pathname.endsWith("/seen")) {
      return { body: { changedAfterSeen: false } };
    }
    return {
      body: {
        state: "signed-in",
        email: CONTEXT.email,
        capabilities: ["design.read.any", "account.manage.own"],
      },
    };
  });
  screen = mountInCatalogue(
    createElement(StaffKitchenScreen, {
      locale: "ro",
      context: CONTEXT,
      designId: STAFF_KITCHEN_ID,
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

function differingFacts(): (string | undefined)[] {
  if (screen === undefined) throw new Error("nothing is mounted");
  return allIn(screen.container, SUMMARY_DIFFERENCES).map(
    (fact) => fact.dataset.fact,
  );
}

const CASES: readonly (readonly [string, unknown, unknown])[] = [
  ["a colour added", undefined, paletteFinish("pal.alb")],
  ["a colour taken away", paletteFinish("pal.alb"), undefined],
  [
    "one decor for another",
    paletteFinish("pal.alb"),
    paletteFinish("pal.antracit"),
  ],
  [
    "a decor for a free colour",
    paletteFinish("pal.alb"),
    freeColourFinish("#aabbcc"),
  ],
  [
    "one free colour for another",
    freeColourFinish("#aabbcc"),
    freeColourFinish("#aabbcd"),
  ],
];

describe("a whole-kitchen colour between the copy as sent and the copy as it stands", () => {
  it.each(CASES)(
    "is marked as differing for %s, in the current copy",
    async (_name, sentFinish, currentFinish) => {
      await mountWith(withFinish(sentFinish), withFinish(currentFinish));

      expect(differingFacts()).toContain("finish");
    },
  );

  it.each(CASES)(
    "is marked as differing for %s, in the copy as sent",
    async (_name, sentFinish, currentFinish) => {
      await mountWith(withFinish(sentFinish), withFinish(currentFinish));

      click(
        requireIn(
          screen?.container ?? document.body,
          '[data-testid="staff-kitchen-versions"] input[value="sent"]',
        ),
      );
      await flushPromises(2);

      expect(differingFacts()).toContain("finish");
    },
  );

  it("is marked nowhere when it is the same", async () => {
    await mountWith(
      withFinish(paletteFinish("pal.alb")),
      withFinish(paletteFinish("pal.alb")),
    );

    expect(differingFacts()).not.toContain("finish");
  });
});
