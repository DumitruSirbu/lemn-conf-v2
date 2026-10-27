"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef, useState, type ReactNode } from "react";

import { OutcomeHero } from "@/account/account-form-parts";
import { startPathOf } from "@/account/account-shell";
import { AccountControl } from "@/account/session/account-control";
import { LogoutEverywhereDialog } from "@/account/session/logout-everywhere-dialog";
import {
  useLeaveForStartAfterSignOut,
  useSignOutHere,
} from "@/account/session/use-logout";
import { endonymOf } from "@/i18n/locale-endonyms";
import { routing, type AppLocale } from "@/i18n/routing";
import {
  useAccountControlCopy,
  useAccountForbiddenCopy,
  useAccountShellCopy,
  useStaffShellCopy,
} from "@/i18n/use-content";

import styles from "./staff.module.css";
import { NavGroup } from "./staff-nav-group";
import { StaffNavSheet } from "./staff-nav-sheet";
import {
  useStaffNavigation,
  useStaffPageLabels,
} from "./staff-navigation-groups";
import { staffPathOf, type StaffAreaPage, type StaffPage } from "./staff-paths";
import { useStaffSessionExpiry } from "./staff-session-expiry";
import { StaffSessionSheet } from "./staff-session-sheet";

// The frame of every staff page: the bar with the role the person acts
// under, the account control and the language links, the navigation on a desktop and the "Meniu" sheet on a phone, and, when
// a staff request was refused because the session ended, the sheet that says so over the page.
//
// The whole frame is one `<main>` whose direct children are the bar, the body and whatever dialog is open. That shape is
// what the modal behaviour needs (`useBackgroundInert` makes every sibling band of the dialog inert), and the account
// control renders its own menu into this `<main>` for the same reason.
//
// Every link is a plain anchor: a staff page is a document of its own with a policy of its own, so a soft navigation
// would carry the wrong nonce (the account pages' rule).

/** The staff pages that have a screen to name in the navigation (their addresses are `staff-paths.ts`). */
export type { StaffAreaPage, StaffPage };

export type StaffRole = "operator" | "administrator";

/** What the server knows of the person and hands the frame: the navigation is its decision, never the browser's. */
export interface StaffShellContext {
  readonly role: StaffRole;
  readonly email: string;
  /** The pages the person's capabilities open and that have a screen, in the order the navigation lists them. */
  readonly navigation: readonly StaffAreaPage[];
  /**
   * How many prices the draft holds, which the server read. Drawn beside "Publicare prețuri" and in the bar, and only
   * while that page is in `navigation`: a page of this family that does not know it simply draws no number.
   */
  readonly pendingPriceCount?: number | undefined;
}

export interface StaffShellProps {
  readonly locale: AppLocale;
  /** The page being shown, so the navigation marks it and the language links lead to the same page. */
  readonly page: StaffAreaPage;
  /** The kitchen the "kitchens" page shows, so the language links lead to that kitchen and not to the list. Used only if
   *  it is shaped like a design id. */
  readonly kitchenId?: string;
  readonly context: StaffShellContext;
  readonly children: ReactNode;
}

type OpenSurface = "none" | "menu" | "logout-everywhere";

export function StaffShell({
  locale,
  page,
  kitchenId,
  context,
  children,
}: StaffShellProps) {
  const copy = useStaffShellCopy();
  const navNote = useTranslations()("priceDashboard.nav.note");
  const accountShell = useAccountShellCopy();
  const accountControl = useAccountControlCopy();
  const [open, setOpen] = useState<OpenSurface>("none");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const signOutHere = useSignOutHere();
  useLeaveForStartAfterSignOut(signOutHere.outcome);
  const { clearOutcome } = signOutHere;
  const openMenu = useCallback(() => {
    clearOutcome();
    setOpen("menu");
  }, [clearOutcome]);
  const close = useCallback(() => {
    setOpen("none");
  }, []);
  const askSignOutEverywhere = useCallback(() => {
    setOpen("logout-everywhere");
  }, []);
  const { groups, pendingPricesLink, allPublishedLine } = useStaffNavigation({
    locale,
    page,
    navigation: context.navigation,
    pendingPriceCount: context.pendingPriceCount,
  });
  const sessionExpiry = useStaffSessionExpiry();

  return (
    <main className={styles.screen}>
      <div className={styles.topBar}>
        <button
          ref={menuButtonRef}
          type="button"
          className={styles.menuButton}
          aria-label={copy.menu}
          aria-haspopup="dialog"
          aria-expanded={open === "menu"}
          data-testid="staff-menu-button"
          onClick={openMenu}
        >
          <span className={styles.menuBars} aria-hidden="true" />
        </button>
        <span className={styles.wordmark}>{accountShell.brand}</span>
        <span className={styles.roleChip} data-testid="staff-role-chip">
          {copy.roles[context.role]}
        </span>
        <span className={styles.spacer} />
        <AccountControl
          cellClassName={styles.account ?? ""}
          afterSignOut="leave-for-start"
          staffAreaEntry="omitted"
        />
        <nav className={styles.localeNav} aria-label={accountShell.localeMenu}>
          {otherLocalesThan(locale).map((other) => (
            <LocaleLink
              key={other}
              locale={other}
              href={staffPathOf(other, page, kitchenId)}
            />
          ))}
        </nav>
        {pendingPricesLink === undefined ? null : (
          <a
            className={styles.pendingChip}
            href={pendingPricesLink.href}
            data-testid="staff-pending-prices"
          >
            {pendingPricesLink.text}
            <span aria-hidden="true"> →</span>
          </a>
        )}
        {allPublishedLine === undefined ? null : (
          <span
            className={styles.allPublished}
            data-testid="staff-all-published"
          >
            {allPublishedLine}
          </span>
        )}
      </div>
      <div className={styles.body}>
        {groups.length === 0 ? null : (
          <nav
            className={styles.nav}
            aria-label={copy.areaName}
            data-testid="staff-nav"
          >
            {groups.map((group) => (
              <NavGroup key={group.key} group={group} />
            ))}
            <p className={styles.navNote}>{navNote}</p>
          </nav>
        )}
        <div className={styles.content}>
          {open !== "menu" && signOutHere.outcome === "failed" ? (
            <p role="alert" className={styles.signOutFailure}>
              {accountControl.signOutFailed}
            </p>
          ) : null}
          {children}
        </div>
      </div>
      {open === "menu" ? (
        <StaffNavSheet
          email={context.email}
          roleName={copy.roles[context.role]}
          groups={groups}
          profileHref={`/${locale}/account/profile`}
          signOutHere={signOutHere}
          onClose={close}
          onSignOutEverywhere={askSignOutEverywhere}
          returnFocusRef={menuButtonRef}
        />
      ) : null}
      {open === "logout-everywhere" ? (
        <LogoutEverywhereDialog
          onClose={close}
          returnFocusFallbackRef={menuButtonRef}
        />
      ) : null}
      {sessionExpiry === undefined ? null : (
        <StaffSessionSheet
          locale={locale}
          email={context.email}
          expiry={sessionExpiry}
        />
      )}
    </main>
  );
}

function otherLocalesThan(locale: AppLocale): readonly AppLocale[] {
  return routing.locales.filter((candidate) => candidate !== locale);
}

/** This page in another language: a full load, so nothing typed travels. */
function LocaleLink({
  locale,
  href,
}: {
  readonly locale: AppLocale;
  readonly href: string;
}) {
  return (
    <a
      className={styles.localeChip}
      href={href}
      lang={locale}
      hrefLang={locale}
    >
      {locale.toUpperCase()}{" "}
      <span className={styles.chipName}>{endonymOf(locale)}</span>
    </a>
  );
}

/**
 * Frame S1D: a staff account on a page its role does not open. It never says the session expired, and the frame, with
 * the navigation the role does have, stays on screen. The way back is the first page the person can open, or the
 * configurator when none is built.
 */
export function StaffForbiddenScreen(props: Omit<StaffShellProps, "children">) {
  const forbidden = useAccountForbiddenCopy();
  const copy = useStaffShellCopy();
  const pageLabels = useStaffPageLabels();
  const accountShell = useAccountShellCopy();
  const firstPage = props.context.navigation[0];
  const way =
    firstPage === undefined
      ? {
          href: startPathOf(props.locale),
          label: accountShell.backToConfigurator,
        }
      : {
          href: staffPathOf(props.locale, firstPage),
          label: copy.backTo(pageLabels[firstPage]),
        };
  return (
    <StaffShell {...props}>
      <div className={styles.forbidden}>
        <OutcomeHero tone="error" title={forbidden.title}>
          {forbidden.body}
        </OutcomeHero>
        <a className={styles.primaryLink} href={way.href}>
          {way.label}
        </a>
      </div>
    </StaffShell>
  );
}
