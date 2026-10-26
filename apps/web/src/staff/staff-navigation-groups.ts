"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { useStaffShellCopy } from "@/i18n/use-content";

import type { StaffNavGroup, StaffNavItem } from "./staff-nav-group";
import { staffPathOf, type StaffAreaPage } from "./staff-paths";

// The staff navigation as the menu draws it: pages under headings. The pages are the server's decision and arrive as page
// codes; this module decides which heading a page stands under and what it is called. A page missing from `navigation`
// is never drawn, and a group with no page is not drawn either, so an operator sees "Clienți" and nothing else.

type GroupKey = "customers" | "catalog" | "prices" | "administration";

/** Exhaustive on purpose: a page added to the staff area does not compile until it is given a heading. */
const GROUP_OF_PAGE: Readonly<Record<StaffAreaPage, GroupKey>> = {
  kitchens: "customers",
  cabinets: "catalog",
  hardware: "catalog",
  materials: "catalog",
  accessories: "catalog",
  defaults: "catalog",
  publish: "prices",
  audit: "administration",
};

const GROUP_ORDER: readonly GroupKey[] = [
  "customers",
  "catalog",
  "prices",
  "administration",
];

/** The waiting prices, in the words that mean them. */
export interface PendingPrices {
  readonly count: number;
  /** "7 prețuri de publicat". */
  readonly label: string;
  /** What a screen reader says for the publish page's menu link. */
  readonly menuLinkName: (pageName: string) => string;
  /** The bar's link to the publish page, with its arrow. */
  readonly barLinkText: string;
}

export interface NavigationGroupsInput {
  readonly locale: string;
  readonly page: StaffAreaPage;
  readonly navigation: readonly StaffAreaPage[];
  readonly labelOf: Readonly<Record<StaffAreaPage, string>>;
  /** A group's heading; the administration group has none (no copy for it exists). */
  readonly headingOf: Readonly<Record<GroupKey, string | undefined>>;
  readonly pendingPrices: PendingPrices | undefined;
}

export function navigationGroupsOf(
  input: NavigationGroupsInput,
): readonly StaffNavGroup[] {
  return GROUP_ORDER.map((group) => ({
    key: group,
    heading: input.headingOf[group],
    items: input.navigation
      .filter((page) => GROUP_OF_PAGE[page] === group)
      .map((page) => navItemOf(page, input)),
  })).filter((group) => group.items.length > 0);
}

function navItemOf(
  page: StaffAreaPage,
  input: NavigationGroupsInput,
): StaffNavItem {
  const label = input.labelOf[page];
  const pending = page === "publish" ? input.pendingPrices : undefined;
  return {
    key: page,
    href: staffPathOf(input.locale, page),
    label,
    accessibleName: pending?.menuLinkName(label),
    isCurrent: page === input.page,
    badge: pending === undefined ? undefined : { count: pending.count },
  };
}

export interface StaffNavigation {
  readonly groups: readonly StaffNavGroup[];
  /** The bar's link to the publish page, present only while that page is in the navigation and prices are waiting. */
  readonly pendingPricesLink: { href: string; text: string } | undefined;
}

/** The navigation's groups for the page being shown, in the page's language. */
export function useStaffNavigation({
  locale,
  page,
  navigation,
  pendingPriceCount,
}: {
  readonly locale: string;
  readonly page: StaffAreaPage;
  readonly navigation: readonly StaffAreaPage[];
  readonly pendingPriceCount: number | undefined;
}): StaffNavigation {
  const translate = useTranslations();
  const labelOf = useStaffPageLabels();
  return useMemo(() => {
    const waitingPrices = (count: number): PendingPrices => {
      const label = translate("priceDashboard.nav.pendingChip", { count });
      return {
        count,
        label,
        menuLinkName: (pageName) =>
          translate("priceDashboard.nav.itemWithBadge", {
            name: pageName,
            label,
          }),
        barLinkText: translate("priceDashboard.nav.pendingChipLink", { label }),
      };
    };
    const pendingPrices = isWaitingCount(pendingPriceCount)
      ? waitingPrices(pendingPriceCount)
      : undefined;
    const groups = navigationGroupsOf({
      locale,
      page,
      navigation,
      labelOf,
      headingOf: {
        customers: translate("priceDashboard.nav.groupCustomers"),
        catalog: translate("priceDashboard.nav.groupCatalog"),
        prices: translate("priceDashboard.nav.groupPrices"),
        administration: undefined,
      },
      pendingPrices,
    });
    const isPublishListed = navigation.includes("publish");
    return {
      groups,
      pendingPricesLink:
        pendingPrices === undefined || !isPublishListed
          ? undefined
          : {
              href: staffPathOf(locale, "publish"),
              text: pendingPrices.barLinkText,
            },
    };
  }, [locale, page, navigation, labelOf, pendingPriceCount, translate]);
}

/** What each staff page is called in the navigation, in the page's language. */
export function useStaffPageLabels(): Readonly<Record<StaffAreaPage, string>> {
  const translate = useTranslations();
  const shell = useStaffShellCopy();
  return useMemo(
    () => ({
      kitchens: shell.pages.kitchens,
      audit: shell.pages.audit,
      cabinets: translate("priceDashboard.nav.cabinets"),
      hardware: translate("priceDashboard.nav.hardware"),
      materials: translate("priceDashboard.nav.materials"),
      accessories: translate("priceDashboard.nav.accessories"),
      defaults: translate("priceDashboard.nav.defaults"),
      publish: translate("priceDashboard.nav.publish"),
    }),
    [shell, translate],
  );
}

function isWaitingCount(count: number | undefined): count is number {
  return count !== undefined && Number.isSafeInteger(count) && count > 0;
}
