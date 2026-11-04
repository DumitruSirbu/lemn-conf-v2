// @vitest-environment happy-dom
//
// What the staff frame says of the waiting prices on every page of the area (D1C, D2M): a number in the bar and beside
// "Publicare prețuri" while some wait, "Toate prețurile sunt publicate" for a count that is known to be zero, and nothing
// for a count nobody knows or for a person whose menu has no publish page.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { StaffAreaPage } from "@/staff/staff-paths";

import roMessages from "../../src/messages/ro.json";
import { declarationsFor } from "../support/css-declarations";
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

const CHIP = '[data-testid="staff-pending-prices"]';
const ALL_PUBLISHED = '[data-testid="staff-all-published"]';
const DESKTOP_NAV = '[data-testid="staff-nav"]';
const MENU: readonly StaffAreaPage[] = [
  "kitchens",
  "audit",
  "cabinets",
  "publish",
];
const PAGES_WITH_THE_COUNT: readonly StaffAreaPage[] = [
  "kitchens",
  "audit",
  "cabinets",
  "publish",
];

let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  leaveTheStaffServer();
});

async function mountFrame(
  page: StaffAreaPage,
  context: ReturnType<typeof contextOf>,
): Promise<HTMLElement> {
  screen = await mountInStaffFrame({ page, context, children: null });
  return screen.container;
}

function publishLink(container: HTMLElement): HTMLAnchorElement {
  const link = allIn<HTMLAnchorElement>(
    requireIn(container, DESKTOP_NAV),
    "a",
  ).find((candidate) => candidate.href.endsWith("/staff/catalog/publish"));
  if (link === undefined) throw new Error("no link to the publish page");
  return link;
}

describe("while prices wait", () => {
  it.each(PAGES_WITH_THE_COUNT)(
    "says how many in the bar and beside the menu's publish page, on the %s page",
    async (page) => {
      const container = await mountFrame(
        page,
        contextOf("administrator", MENU, 7),
      );

      const chip = requireIn<HTMLAnchorElement>(container, CHIP);
      expect(chip.textContent).toContain(
        roCopy("priceDashboard.nav.pendingChip", { count: 7 }),
      );
      expect(chip.getAttribute("href")).toBe("/ro/staff/catalog/publish");
      const link = publishLink(container);
      expect(link.getAttribute("aria-label")).toBe(
        roCopy("priceDashboard.nav.itemWithBadge", {
          name: roMessages.priceDashboard.nav.publish,
          label: roCopy("priceDashboard.nav.pendingChip", { count: 7 }),
        }),
      );
      expect(link.textContent).toContain("7");
      expect(container.querySelector(ALL_PUBLISHED)).toBeNull();
    },
  );
});

describe("when none wait and the frame knows it", () => {
  it.each(PAGES_WITH_THE_COUNT)(
    "says that all are published, and draws neither the chip nor the badge, on the %s page",
    async (page) => {
      const container = await mountFrame(
        page,
        contextOf("administrator", MENU, 0),
      );

      expect(requireIn(container, ALL_PUBLISHED).textContent).toBe(
        roMessages.priceDashboard.nav.allPublished,
      );
      expect(container.querySelector(CHIP)).toBeNull();
      expect(publishLink(container).getAttribute("aria-label")).toBeNull();
    },
  );
});

describe("when the frame does not know", () => {
  it.each([
    ["no count", undefined],
    ["a count that is not a number of prices", Number.NaN],
    ["a negative count", -1],
    ["a count with a fraction", 1.5],
  ])(
    "draws nothing for %s: an unknown count is never 'all published'",
    async (_name, count) => {
      const container = await mountFrame(
        "kitchens",
        contextOf("administrator", MENU, count),
      );

      expect(container.querySelector(CHIP)).toBeNull();
      expect(container.querySelector(ALL_PUBLISHED)).toBeNull();
      expect(publishLink(container).getAttribute("aria-label")).toBeNull();
    },
  );
});

describe("for a person whose menu has no publish page", () => {
  it.each([0, 7])(
    "draws nothing of it, whatever the count (%i): the line would point nowhere",
    async (count) => {
      const container = await mountFrame(
        "kitchens",
        contextOf("operator", ["kitchens"], count),
      );

      expect(container.querySelector(CHIP)).toBeNull();
      expect(container.querySelector(ALL_PUBLISHED)).toBeNull();
    },
  );
});

describe("the line for a known zero", () => {
  const css = readFileSync(
    join(import.meta.dirname, "../../src/staff/staff.module.css"),
    "utf8",
  );

  it("is a phone's line only: the desktop's bar says nothing in that case", () => {
    expect(
      declarationsFor(css, "allPublished", "display").map((d) => [
        d.media,
        d.value,
      ]),
    ).toEqual([
      ["", "inline-flex"],
      ["@media (min-width: 900px)", "none"],
    ]);
  });
});
