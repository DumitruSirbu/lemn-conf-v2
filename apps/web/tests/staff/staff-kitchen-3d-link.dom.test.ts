// @vitest-environment happy-dom
//
// The kitchen page's "open in 3D" link: a new tab, for the copy the version switch shows, naming none without a switch.
// The server is a stand-in for `fetch`; the 3D canvas is a stub.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import type { StaffShellContext } from "@/staff/staff-shell";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import {
  STAFF_KITCHEN_ID,
  WIRE_DESIGN,
  wireDraftKitchen,
  wireKitchen,
} from "../support/staff-kitchen-wire";
import { installStaffKitchensServer } from "../support/staff-kitchens-wire";

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => null,
    ViewOnlyKitchenCanvas: () =>
      element("canvas", { "data-testid": "stub-canvas" }),
  };
});

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
  detectWebGLSupport: () => true,
}));

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: "mihai.rusu@lemnaria.md",
  navigation: ["kitchens"],
};
const KITCHEN_ADDRESS = `/api/staff/kitchens/${STAFF_KITCHEN_ID}`;
const LINK = '[data-testid="staff-kitchen-open-3d"]';
const FEWER_BODIES_DESIGN: unknown = {
  ...(WIRE_DESIGN as { placements: unknown[] }),
  placements: (WIRE_DESIGN as { placements: unknown[] }).placements.slice(0, 3),
};

let screen: MountedScreen | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
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

async function mountWith(
  kitchen: Record<string, unknown>,
  locale: TestLocale,
): Promise<void> {
  installStaffKitchensServer().script((request) =>
    request.url.pathname === KITCHEN_ADDRESS
      ? { body: kitchen }
      : {
          body: {
            state: "signed-in",
            email: CONTEXT.email,
            capabilities: ["design.read.any", "account.manage.own"],
          },
        },
  );
  screen = mountInCatalogue(
    createElement(StaffKitchenScreen, {
      locale,
      context: CONTEXT,
      designId: STAFF_KITCHEN_ID,
    }),
    locale,
  );
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
}

function link(): HTMLAnchorElement {
  if (screen === undefined) throw new Error("nothing is mounted");
  return requireIn<HTMLAnchorElement>(screen.container, LINK);
}

function chooseVersion(version: "sent" | "current"): void {
  if (screen === undefined) throw new Error("nothing is mounted");
  const choice = allIn<HTMLInputElement>(
    screen.container,
    '[data-testid="staff-kitchen-versions"] input',
  ).find((input) => input.value === version);
  if (choice === undefined) throw new Error(`no choice ${version}`);
  click(choice);
}

describe.each(LOCALES)("the open-in-3D link in %s", (locale) => {
  const base = `/${locale}/staff/kitchens/${STAFF_KITCHEN_ID}/3d`;

  it("says its words and opens in a new tab, leaving this page where it is", async () => {
    await mountWith(wireKitchen(), locale);

    expect(link().textContent).toBe(CATALOGUES[locale].staffKitchen.open3d);
    expect(link().target).toBe("_blank");
    expect(link().rel).toContain("noopener");
  });

  it("names the current copy when the switch opens on it, and the sent copy once the person chooses it", async () => {
    await mountWith(
      wireKitchen({
        changedAfterSeen: true,
        kitchen: { asSent: FEWER_BODIES_DESIGN },
      }),
      locale,
    );
    expect(link().getAttribute("href")).toBe(`${base}?version=current`);

    chooseVersion("sent");

    expect(link().getAttribute("href")).toBe(`${base}?version=sent`);
  });

  it("follows the person back to the current copy", async () => {
    await mountWith(
      wireKitchen({ kitchen: { asSent: FEWER_BODIES_DESIGN } }),
      locale,
    );
    expect(link().getAttribute("href")).toBe(`${base}?version=sent`);

    chooseVersion("current");

    expect(link().getAttribute("href")).toBe(`${base}?version=current`);
  });

  it("names no copy when the page has no version switch", async () => {
    await mountWith(wireDraftKitchen(), locale);

    expect(link().getAttribute("href")).toBe(base);
  });

  it("is not drawn when neither copy can be read, since the view would have nothing to show", async () => {
    await mountWith(
      wireKitchen({ kitchen: { design: {}, asSent: {} } }),
      locale,
    );

    expect(screen?.container.querySelector(LINK)).toBeNull();
  });
});
