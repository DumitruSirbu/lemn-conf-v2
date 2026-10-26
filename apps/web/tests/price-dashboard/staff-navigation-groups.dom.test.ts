// @vitest-environment happy-dom
//
// The staff menu as the dashboard's frames draw it (D1C the administrator's whole menu, D1D the operator's one group, D1M
// the phone's sheet): pages under headings, the number of prices awaiting publication beside "Publicare prețuri" and in the
// bar. The pages are the server's decision; the frame draws exactly those and puts each under its heading.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StaffForbiddenScreen } from "@/staff/staff-shell";
import type { StaffAreaPage } from "@/staff/staff-paths";

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
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  mountInStaffFrame,
  stubTheStaffServer,
} from "./staff-frame-harness";

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;

/** What the menu says a number of waiting prices means, in Romanian: the catalogue's plural arm for that number. */
const pendingWords = (count: number): string =>
  roCopy("priceDashboard.nav.pendingChip", { count });
const DESKTOP_NAV = '[data-testid="staff-nav"]';
const SHEET = '[data-testid="staff-menu-sheet"]';
const MENU_BUTTON = '[data-testid="staff-menu-button"]';
const PENDING_CHIP = '[data-testid="staff-pending-prices"]';

/** Every page the area can show: the menu D1C draws, in the order the server would hand it. */
const WHOLE_MENU: readonly StaffAreaPage[] = [
  "kitchens",
  "audit",
  "cabinets",
  "hardware",
  "materials",
  "accessories",
  "defaults",
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

async function mount({
  locale = "ro",
  page = "cabinets",
  navigation = WHOLE_MENU,
  role = "administrator",
  pendingPriceCount = 7,
}: {
  locale?: TestLocale;
  page?: StaffAreaPage;
  navigation?: readonly StaffAreaPage[];
  role?: "administrator" | "operator";
  pendingPriceCount?: number | "unknown";
} = {}): Promise<HTMLElement> {
  screen = await mountInStaffFrame({
    locale,
    page,
    context: contextOf(
      role,
      navigation,
      pendingPriceCount === "unknown" ? undefined : pendingPriceCount,
    ),
    children: null,
  });
  return screen.container;
}

/** The headings of a navigation, each with the names of the pages under it, as the person reads them. */
function outline(nav: HTMLElement): [string, string[]][] {
  return allIn(nav, ":scope > div").map((group) => [
    allIn(group, "p")[0]?.textContent ?? "",
    allIn(group, "a").map(
      (link) => link.querySelector("span")?.textContent ?? "",
    ),
  ]);
}

describe("the administrator's whole menu (frame D1C)", () => {
  it.each(["ro", "ru"] as const)(
    "%s: stands every page under its heading, in the plan's order",
    async (locale) => {
      const container = await mount({ locale });
      const { nav, staffShell } = {
        nav: CATALOGUES[locale].priceDashboard.nav,
        staffShell: CATALOGUES[locale].staffShell,
      };

      expect(outline(requireIn(container, DESKTOP_NAV))).toEqual([
        [nav.groupCustomers, [staffShell.navKitchens]],
        [
          nav.groupCatalog,
          [
            nav.cabinets,
            nav.hardware,
            nav.materials,
            nav.accessories,
            nav.defaults,
          ],
        ],
        [nav.groupPrices, [nav.publish]],
        ["", [staffShell.navAudit]],
      ]);
    },
  );

  it("links every page under the catalog family, in the page's language", async () => {
    const container = await mount({ locale: "ru" });

    expect(
      allIn<HTMLAnchorElement>(requireIn(container, DESKTOP_NAV), "a").map(
        (link) => link.getAttribute("href"),
      ),
    ).toEqual([
      "/ru/staff/kitchens",
      "/ru/staff/catalog/cabinets",
      "/ru/staff/catalog/hardware",
      "/ru/staff/catalog/materials",
      "/ru/staff/catalog/accessories",
      "/ru/staff/catalog/defaults",
      "/ru/staff/catalog/publish",
      "/ru/staff/audit",
    ]);
  });

  it("marks the page being shown as the current one, and no other", async () => {
    const container = await mount({ page: "materials" });

    expect(
      allIn(container, `${DESKTOP_NAV} a[aria-current="page"]`).map(
        (link) => link.textContent,
      ),
    ).toEqual([roMessages.priceDashboard.nav.materials]);
  });

  it("says what the menu leaves out", async () => {
    const container = await mount();

    expect(requireIn(container, DESKTOP_NAV).textContent).toContain(
      roMessages.priceDashboard.nav.note,
    );
  });

  it("names each group's list after its heading", async () => {
    const container = await mount();

    for (const list of allIn(requireIn(container, DESKTOP_NAV), "ul")) {
      const labelledBy = list.getAttribute("aria-labelledby");
      if (labelledBy === null) continue;
      expect(
        requireIn(container, `#${CSS.escape(labelledBy)}`).textContent,
      ).not.toBe("");
    }
  });
});

describe("the operator's menu (frame D1D)", () => {
  it("holds the customers' group and nothing of the catalog, the prices or the administration", async () => {
    const container = await mount({
      role: "operator",
      page: "kitchens",
      navigation: ["kitchens"],
      pendingPriceCount: "unknown",
    });

    expect(outline(requireIn(container, DESKTOP_NAV))).toEqual([
      [
        roMessages.priceDashboard.nav.groupCustomers,
        [roMessages.staffShell.navKitchens],
      ],
    ]);
    expect(container.textContent).not.toContain(
      roMessages.priceDashboard.nav.groupCatalog,
    );
    expect(container.querySelector(PENDING_CHIP)).toBeNull();
  });
});

describe("the number of prices awaiting publication (frames D1C, D2B)", () => {
  it("is drawn beside the publish page's name, and said in words after it", async () => {
    const container = await mount({ pendingPriceCount: 7 });
    const publishLink = requireIn(
      container,
      `${DESKTOP_NAV} a[href$="/catalog/publish"]`,
    );

    expect(publishLink.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      "7",
    );
    expect(publishLink.textContent).toContain(pendingWords(7));
  });

  it("is a link in the bar to the publish page, on any page of the area", async () => {
    const container = await mount({ page: "audit", pendingPriceCount: 7 });
    const chip = requireIn<HTMLAnchorElement>(container, PENDING_CHIP);

    expect(chip.getAttribute("href")).toBe("/ro/staff/catalog/publish");
    expect(chip.textContent).toContain(pendingWords(7));
  });

  it.each([1, 2, 20])(
    "says its number in the words that agree with it: %i",
    async (count) => {
      const container = await mount({ pendingPriceCount: count });

      expect(requireIn(container, PENDING_CHIP).textContent).toContain(
        pendingWords(count),
      );
    },
  );

  it.each([0, "unknown" as const])(
    "draws no number and no chip when it is %s",
    async (count) => {
      const container = await mount({ pendingPriceCount: count });

      expect(container.querySelector(PENDING_CHIP)).toBeNull();
      expect(
        requireIn(
          container,
          `${DESKTOP_NAV} a[href$="/catalog/publish"]`,
        ).querySelector('[aria-hidden="true"]'),
      ).toBeNull();
    },
  );

  it("is not drawn while the publish page is not in the navigation: no link to a page that is not built", async () => {
    const container = await mount({
      navigation: ["kitchens", "audit", "cabinets"],
      pendingPriceCount: 7,
    });

    expect(container.querySelector(PENDING_CHIP)).toBeNull();
    expect(container.querySelector('a[href$="/catalog/publish"]')).toBeNull();
  });
});

describe("the phone's menu sheet (frame D1M)", () => {
  function openSheet(container: HTMLElement): HTMLElement {
    click(requireIn<HTMLButtonElement>(container, MENU_BUTTON));
    return requireIn(container, SHEET);
  }

  it("holds the same groups, with the same pages under them", async () => {
    const container = await mount();
    const sheet = openSheet(container);
    const nav = roMessages.priceDashboard.nav;

    expect(
      allIn(sheet, 'nav [role="group"]').map((group) => [
        document.getElementById(group.getAttribute("aria-labelledby") ?? "")
          ?.textContent,
        allIn(group, "a").map((link) => link.getAttribute("href")),
      ]),
    ).toEqual([
      [nav.groupCustomers, ["/ro/staff/kitchens"]],
      [
        nav.groupCatalog,
        ["cabinets", "hardware", "materials", "accessories", "defaults"].map(
          (page) => `/ro/staff/catalog/${page}`,
        ),
      ],
      [nav.groupPrices, ["/ro/staff/catalog/publish"]],
    ]);
  });

  it("draws the number beside the publish page's name and says it in words", async () => {
    const container = await mount({ pendingPriceCount: 7 });
    const sheet = openSheet(container);
    const row = requireIn(sheet, 'a[href$="/catalog/publish"]');

    expect(row.querySelector('[aria-hidden="true"]')?.textContent).toBe("7");
    expect(row.textContent).toContain(pendingWords(7));
  });

  it("keeps the operator's sheet to the customers' group", async () => {
    const container = await mount({
      role: "operator",
      navigation: ["kitchens"],
      pendingPriceCount: "unknown",
    });
    const sheet = openSheet(container);

    expect(allIn(sheet, "nav a").map((link) => link.textContent)).toEqual([
      roMessages.staffShell.navKitchens,
    ]);
  });
});

describe("a direct address to a catalog page the role does not open", () => {
  it.each(["ro", "ru"] as const)(
    "%s: says the account has no access, inside the frame, and leads back to the first page the role has",
    async (locale) => {
      screen = mountInCatalogue(
        createElement(StaffForbiddenScreen, {
          locale,
          page: "cabinets",
          context: contextOf("operator", ["kitchens"]),
        }),
        locale,
      );
      await flushPromises(5);
      const container = screen.container;
      const words = CATALOGUES[locale];

      expect(container.textContent).toContain(words.accountForbidden.title);
      expect(container.textContent).toContain(words.accountForbidden.body);
      expect(
        requireIn<HTMLAnchorElement>(
          container,
          'main a[href$="/staff/kitchens"]:not([aria-current])',
        ).getAttribute("href"),
      ).toBe(`/${locale}/staff/kitchens`);
      expect(container.querySelector(DESKTOP_NAV)).not.toBeNull();
      expect(container.textContent).not.toContain(
        words.priceDashboard.nav.groupCatalog,
      );
    },
  );
});
