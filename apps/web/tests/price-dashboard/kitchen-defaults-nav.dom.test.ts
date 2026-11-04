// @vitest-environment happy-dom
//
// "Setări implicite" in the staff menu: the menu links only to pages that exist, so the entry appears once the defaults page
// is built and not before, and stands where the closed list of catalog pages puts it, whatever order the built list is given
// in. The page's source claims no value in a production build, and its stylesheet keeps a thumb's targets.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { staffNavigationOf } from "@/lib/server/staff/staff-page";
import { BUILT_CATALOG_PAGES } from "@/price-dashboard/catalog-pages";
import { readKitchenDefaults } from "@/price-dashboard/kitchen-defaults-source";
import { CATALOG_PAGES, type StaffAreaPage } from "@/staff/staff-paths";

import { valuesFor } from "../support/css-declarations";
import {
  allIn,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  mountInStaffFrame,
  stubTheStaffServer,
} from "./staff-frame-harness";

const DESKTOP_NAV = '[data-testid="staff-nav"]';
const ADMINISTRATOR = { role: "administrator", isEmailVerified: true } as const;

let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllEnvs();
  leaveTheStaffServer();
});

async function menuLinks(
  navigation: readonly StaffAreaPage[],
): Promise<{ name: string; href: string | null }[]> {
  screen = await mountInStaffFrame({
    page: "cabinets",
    context: contextOf("administrator", navigation),
    children: null,
  });
  return allIn<HTMLAnchorElement>(
    requireIn(screen.container, DESKTOP_NAV),
    "a",
  ).map((link) => ({
    name: link.querySelector("span")?.textContent ?? "",
    href: link.getAttribute("href"),
  }));
}

const DEFAULTS_NAME = roCopy("priceDashboard.nav.defaults");

describe("the menu entry", () => {
  it("is built: the closed list of catalog pages is the menu's, and defaults has its page", () => {
    expect(BUILT_CATALOG_PAGES).toContain("defaults");
    expect(
      staffNavigationOf(ADMINISTRATOR, BUILT_CATALOG_PAGES).filter(
        (page) => page === "defaults",
      ),
    ).toEqual(["defaults"]);
  });

  it("is not offered while the page is unbuilt, however the rest of the list is built", async () => {
    const withoutDefaults = CATALOG_PAGES.filter((page) => page !== "defaults");

    const links = await menuLinks(
      staffNavigationOf(ADMINISTRATOR, ["kitchens", ...withoutDefaults]),
    );

    expect(links.map((link) => link.name)).not.toContain(DEFAULTS_NAME);
    expect(links.map((link) => link.href)).not.toContain(
      "/ro/staff/catalog/defaults",
    );
  });

  it("is offered once built, linked to its page, and stands after Dulapuri's pages in the closed list's order", async () => {
    const links = await menuLinks(
      staffNavigationOf(ADMINISTRATOR, ["cabinets", "defaults"]),
    );

    expect(links.map((link) => link.name)).toEqual([
      roCopy("priceDashboard.nav.cabinets"),
      DEFAULTS_NAME,
    ]);
    expect(links.at(-1)?.href).toBe("/ro/staff/catalog/defaults");
  });

  it("stands in the closed list's order whatever order the built list is given in", () => {
    expect(
      staffNavigationOf(ADMINISTRATOR, ["publish", "defaults", "cabinets"]),
    ).toEqual(["cabinets", "defaults", "publish"]);
  });

  it("is not offered to an operator, who holds no catalog page", () => {
    expect(
      staffNavigationOf(
        { role: "operator", isEmailVerified: true },
        BUILT_CATALOG_PAGES,
      ),
    ).not.toContain("defaults");
  });
});

describe("the page's source", () => {
  it("claims no value in a production build: until the real read exists it answers unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(await readKitchenDefaults()).toEqual({ kind: "unavailable" });
  });

  it("answers the invented sample in any other build, whole: a revision, six values and what is on offer", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const read = await readKitchenDefaults();

    expect(read.kind).toBe("ready");
    if (read.kind !== "ready") return;
    expect(Object.keys(read.input.state.defaults)).toHaveLength(6);
    expect(read.input.materials.length).toBeGreaterThan(0);
    expect(read.input.state.revision).not.toBe("");
  });
});

describe("the stylesheet", () => {
  const css = readFileSync(
    join(
      import.meta.dirname,
      "../../src/price-dashboard/kitchen-defaults.module.css",
    ),
    "utf8",
  );
  const TOUCH_TARGET = "var(--touch-target)";

  it("makes every option, colour input and button at least a touch target tall", () => {
    expect(valuesFor(css, "option", "min-height")).toEqual([TOUCH_TARGET]);
    expect(valuesFor(css, "option", "min-width")).toEqual([TOUCH_TARGET]);
    expect(valuesFor(css, "optionFace", "min-height")).toEqual([TOUCH_TARGET]);
    expect(valuesFor(css, "colourInput", "width")).toEqual([TOUCH_TARGET]);
    expect(valuesFor(css, "colourInput", "height")).toEqual([TOUCH_TARGET]);
    for (const button of ["primaryAction", "secondaryAction"]) {
      const [height] = valuesFor(css, button, "min-height");
      expect(Number.parseFloat(height ?? "0")).toBeGreaterThanOrEqual(44);
    }
  });

  it("draws a visible ring on every control that can take focus", () => {
    for (const ring of [
      ".optionInput:focus-visible + .optionFace",
      ".colourInput:focus-visible",
      ".primaryAction:focus-visible",
      ".title:focus-visible",
    ]) {
      const hasRing = css
        .split("}")
        .some((rule) => rule.includes(ring) && rule.includes("outline: 2px"));

      expect(hasRing, ring).toBe(true);
    }
  });

  it("hides a radio from the eye and never from the keyboard or a screen reader", () => {
    expect(valuesFor(css, "optionInput", "opacity")).toEqual(["0"]);
    expect(css).not.toMatch(/display:\s*none/);
    expect(css).not.toMatch(/visibility:\s*hidden/);
  });

  it("keeps the DOM order as the visual order: nothing is reordered, and nothing scrolls sideways", () => {
    expect(css).not.toMatch(/(?<![-\w])order:/);
    expect(css).not.toMatch(/overflow(-x)?:\s*(auto|scroll)/);
  });
});
