"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { useStaffShellCopy } from "@/i18n/use-content";
import type { StaffNavGroup, StaffNavItem } from "@/staff/staff-nav-sheet";
import { staffPathOf, type StaffAreaPage } from "@/staff/staff-paths";

// The staff navigation as the plan's menu draws it (frames D1C, D1D, D1M): pages under headings. The pages are the
// server's decision and arrive as page codes; this module only decides which heading a page stands under and what it is
// called. A page with no entry in `navigation` is never drawn, and a group with no page is not drawn either, so an
// operator sees "Clienți" and nothing else.

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

/** What the draft holds, and the words that say so; only the "publish" page carries it. */
export interface PendingPricesBadge {
  readonly count: number;
  readonly label: string;
}

export interface NavigationGroupsInput {
  readonly locale: string;
  readonly page: StaffAreaPage;
  readonly navigation: readonly StaffAreaPage[];
  readonly labelOf: Readonly<Record<StaffAreaPage, string>>;
  /** A group's heading; the administration group has none yet (no copy for it exists). */
  readonly headingOf: Readonly<Record<GroupKey, string | undefined>>;
  readonly pendingPrices: PendingPricesBadge | undefined;
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
  return {
    key: page,
    href: staffPathOf(input.locale, page),
    label: input.labelOf[page],
    isCurrent: page === input.page,
    badge: page === "publish" ? input.pendingPrices : undefined,
  };
}

/** The navigation's groups for the page being shown, in the page's language. */
export function useStaffNavigationGroups({
  locale,
  page,
  navigation,
  pendingPriceCount,
}: {
  readonly locale: string;
  readonly page: StaffAreaPage;
  readonly navigation: readonly StaffAreaPage[];
  readonly pendingPriceCount: number | undefined;
}): readonly StaffNavGroup[] {
  const translate = useTranslations();
  const labelOf = useStaffPageLabels();
  return useMemo(
    () =>
      navigationGroupsOf({
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
        pendingPrices: pendingBadgeOf(pendingPriceCount, (count) =>
          translate("priceDashboard.nav.pendingChip", { count }),
        ),
      }),
    [locale, page, navigation, labelOf, pendingPriceCount, translate],
  );
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

function pendingBadgeOf(
  count: number | undefined,
  describe: (count: number) => string,
): PendingPricesBadge | undefined {
  if (count === undefined || !Number.isSafeInteger(count) || count <= 0) {
    return undefined;
  }
  return { count, label: describe(count) };
}
