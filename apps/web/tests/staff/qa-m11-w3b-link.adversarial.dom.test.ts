// @vitest-environment happy-dom
//
// W3b adversarial QA of the "open in 3D" link on the kitchen page (ADR 0180 d5, plan W3b-1): the address it writes for every
// shape of kitchen, the attributes that keep the new tab from reaching back or telling where it came from, and that the
// four guard tests which now exclude it from their anchor counts still count the rest.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import { staffKitchen3dPathOf } from "@/staff/staff-paths";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import type { StaffShellContext } from "@/staff/staff-shell";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
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

const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: "mihai.rusu@lemnaria.md",
  navigation: ["kitchens"],
};
const KITCHEN_ADDRESS = `/api/staff/kitchens/${STAFF_KITCHEN_ID}`;
const LINK = '[data-testid="staff-kitchen-open-3d"]';
const PAGE = '[data-testid="staff-kitchen-page"]';
const FEWER_BODIES: unknown = {
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
): Promise<HTMLElement> {
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
  return screen.container;
}

function links(container: HTMLElement): HTMLAnchorElement[] {
  return allIn<HTMLAnchorElement>(container, LINK);
}

function chooseVersion(container: HTMLElement, version: "sent" | "current") {
  const choice = allIn<HTMLInputElement>(
    container,
    '[data-testid="staff-kitchen-versions"] input',
  ).find((input) => input.value === version);
  if (choice === undefined) throw new Error(`no choice ${version}`);
  click(choice);
}

const TWO_DIFFERENT_COPIES = {
  kitchen: { asSent: FEWER_BODIES },
};

describe.each(LOCALES)("the open-in-3D link in %s", (locale) => {
  it("is exactly one anchor, to the one address the path builder writes, for a kitchen with a switch", async () => {
    const container = await mountWith(
      wireKitchen(TWO_DIFFERENT_COPIES),
      locale,
    );

    expect(links(container)).toHaveLength(1);
    expect(links(container)[0]?.getAttribute("href")).toBe(
      staffKitchen3dPathOf({
        locale,
        kitchenId: STAFF_KITCHEN_ID,
        version: "sent",
      }),
    );
  });

  it("cuts the new tab off from this one and from its address: noopener and noreferrer, a new tab", async () => {
    const container = await mountWith(
      wireKitchen(TWO_DIFFERENT_COPIES),
      locale,
    );
    const [link] = links(container);

    expect(link?.target).toBe("_blank");
    expect(link?.rel.split(/\s+/).sort()).toEqual(["noopener", "noreferrer"]);
  });

  it("is the same-origin path of this site and carries nothing of the page's own address", async () => {
    const container = await mountWith(
      wireKitchen(TWO_DIFFERENT_COPIES),
      locale,
    );
    const href = links(container)[0]?.getAttribute("href") ?? "";

    expect(href.startsWith(`/${locale}/staff/kitchens/`)).toBe(true);
    expect(href).not.toMatch(/^\/\//);
    expect(href).not.toContain("#");
    expect(new URL(href, "https://lemnaria.test").searchParams.size).toBe(1);
  });

  it("follows every press of the switch, over a long run, to the copy last chosen", async () => {
    const container = await mountWith(
      wireKitchen(TWO_DIFFERENT_COPIES),
      locale,
    );
    const run = [
      "current",
      "current",
      "sent",
      "sent",
      "current",
      "sent",
      "current",
      "sent",
      "sent",
      "current",
    ] as const;

    for (const choice of run) {
      chooseVersion(container, choice);

      expect(links(container)).toHaveLength(1);
      expect(links(container)[0]?.getAttribute("href")).toBe(
        `/${locale}/staff/kitchens/${STAFF_KITCHEN_ID}/3d?version=${choice}`,
      );
    }
  });

  it("names the copy the switch shows, not the one the page started on, after the person chose the other", async () => {
    const container = await mountWith(
      wireKitchen({ changedAfterSeen: true, ...TWO_DIFFERENT_COPIES }),
      locale,
    );
    chooseVersion(container, "sent");
    const checked = allIn<HTMLInputElement>(
      container,
      '[data-testid="staff-kitchen-versions"] input',
    ).find((input) => input.checked);

    expect(checked?.value).toBe("sent");
    expect(links(container)[0]?.getAttribute("href")).toContain("version=sent");
  });

  it("names no copy for a kitchen whose two copies are the same, though the page opened on 'current'", async () => {
    const container = await mountWith(
      wireKitchen({ changedAfterSeen: true }),
      locale,
    );

    expect(
      allIn(container, '[data-testid="staff-kitchen-versions"]'),
    ).toHaveLength(0);
    expect(links(container)[0]?.getAttribute("href")).toBe(
      `/${locale}/staff/kitchens/${STAFF_KITCHEN_ID}/3d`,
    );
  });

  it("names no copy for a kitchen with only its current copy readable, whatever was seen", async () => {
    const container = await mountWith(
      wireKitchen({ changedAfterSeen: true, kitchen: { asSent: null } }),
      locale,
    );

    expect(links(container)[0]?.getAttribute("href")).toBe(
      `/${locale}/staff/kitchens/${STAFF_KITCHEN_ID}/3d`,
    );
  });

  it("names no copy for a kitchen with only its sent copy readable", async () => {
    const container = await mountWith(
      wireKitchen({ kitchen: { design: null } }),
      locale,
    );

    expect(links(container)[0]?.getAttribute("href")).toBe(
      `/${locale}/staff/kitchens/${STAFF_KITCHEN_ID}/3d`,
    );
  });

  it.each([
    ["no copy at all", { design: null, asSent: null }],
    ["two documents this build cannot read", { design: {}, asSent: {} }],
  ])(
    "is not drawn for %s, and nothing else of the page changes",
    async (_, copies) => {
      const container = await mountWith(
        wireKitchen({ kitchen: copies }),
        locale,
      );

      expect(links(container)).toHaveLength(0);
      expect(
        allIn(container, `${PAGE} a`).map((anchor) =>
          anchor.getAttribute("href"),
        ),
      ).toEqual([`/${locale}/staff/kitchens`]);
    },
  );

  it("is drawn once for a draft, with no copy named, and the page keeps its one way back", async () => {
    const container = await mountWith(wireDraftKitchen(), locale);

    expect(links(container)).toHaveLength(1);
    expect(
      allIn(container, `${PAGE} a:not(${LINK})`).map((anchor) =>
        anchor.getAttribute("href"),
      ),
    ).toEqual([`/${locale}/staff/kitchens`]);
  });

  it("draws no link naming a copy for a draft that, against the wire's own rules, holds two different copies and was changed", async () => {
    const container = await mountWith(
      wireDraftKitchen({
        changedAfterSeen: true,
        kitchen: { asSent: FEWER_BODIES },
      }),
      locale,
    );

    for (const link of links(container)) {
      expect(link.getAttribute("href")).not.toContain("version=");
    }
  });

  it("writes only the list's address, never a climb, when the kitchen's id is not a design id", async () => {
    const container = await mountWith(
      wireKitchen({ kitchen: { id: "../../account/profile" } }),
      locale,
    );

    for (const link of links(container)) {
      const href = link.getAttribute("href") ?? "";
      expect(href).not.toContain("..");
      expect(href).not.toContain("account");
    }
  });
});
