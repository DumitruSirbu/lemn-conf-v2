"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { isDesignId } from "@lemnaria/configurator-domain";

import { OutcomeHero } from "@/account/account-form-parts";
import { startPathOf } from "@/account/account-shell";
import { AccountControl } from "@/account/session/account-control";
import { LogoutEverywhereDialog } from "@/account/session/logout-everywhere-dialog";
import {
  useLeaveForStartAfterSignOut,
  useSignOutHere,
} from "@/account/session/use-logout";
import type { StaffShellCopy } from "@/i18n/content";
import { endonymOf } from "@/i18n/locale-endonyms";
import { routing, type AppLocale } from "@/i18n/routing";
import {
  useAccountControlCopy,
  useAccountForbiddenCopy,
  useAccountShellCopy,
  useStaffShellCopy,
} from "@/i18n/use-content";

import styles from "./staff.module.css";
import { StaffNavSheet, type StaffNavItem } from "./staff-nav-sheet";

// The frame of every staff page: the bar with the role the person acts
// under, the account control and the language links, the navigation on a desktop and the "Meniu" sheet on a phone.
//
// The whole frame is one `<main>` whose direct children are the bar, the body and whatever dialog is open. That shape is
// what the modal behaviour needs (`useBackgroundInert` makes every sibling band of the dialog inert), and the account
// control renders its own menu into this `<main>` for the same reason.
//
// Every link is a plain anchor: a staff page is a document of its own with a policy of its own, so a soft navigation
// would carry the wrong nonce (the account pages' rule).

/** The staff pages that have a screen to name in the navigation. */
export type StaffPage = "kitchens" | "audit";

export type StaffRole = "operator" | "administrator";

/** What the server knows of the person and hands the frame: the navigation is its decision, never the browser's. */
export interface StaffShellContext {
  readonly role: StaffRole;
  readonly email: string;
  /** The pages the person's capabilities open and that have a screen, in the order the navigation lists them. */
  readonly navigation: readonly StaffPage[];
}

export function staffPathOf(locale: AppLocale, page: StaffPage): string {
  return `/${locale}/staff/${page}`;
}

/**
 * Where the language links lead: the page being shown, or the one kitchen of the "kitchens" page when the page shows one.
 * The kitchen's id is part of the address only if it has the shape of a design id, so nothing but a design id is ever
 * written into a link, whatever the caller was handed.
 */
export function pathForLanguageLink(
  locale: AppLocale,
  page: StaffPage,
  kitchenId: string | undefined,
): string {
  const isKitchen =
    page === "kitchens" && kitchenId !== undefined && isDesignId(kitchenId);
  return isKitchen
    ? `${staffPathOf(locale, page)}/${kitchenId}`
    : staffPathOf(locale, page);
}

export interface StaffShellProps {
  readonly locale: AppLocale;
  /** The page being shown, so the navigation marks it and the language links lead to the same page. */
  readonly page: StaffPage;
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
  const items = navigationItemsOf({ locale, page, context, copy });

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
              href={pathForLanguageLink(other, page, kitchenId)}
            />
          ))}
        </nav>
      </div>
      <div className={styles.body}>
        {items.length === 0 ? null : (
          <nav
            className={styles.nav}
            aria-label={copy.areaName}
            data-testid="staff-nav"
          >
            <ul className={styles.navItems}>
              {items.map((item) => (
                <li key={item.key}>
                  <a
                    className={styles.navItem}
                    href={item.href}
                    aria-current={item.isCurrent ? "page" : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
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
          items={items}
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
    </main>
  );
}

function navigationItemsOf({
  locale,
  page,
  context,
  copy,
}: {
  readonly locale: AppLocale;
  readonly page: StaffPage;
  readonly context: StaffShellContext;
  readonly copy: StaffShellCopy;
}): readonly StaffNavItem[] {
  return context.navigation.map((navPage) => ({
    key: navPage,
    href: staffPathOf(locale, navPage),
    label: copy.pages[navPage],
    isCurrent: navPage === page,
  }));
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
          label: copy.backTo(copy.pages[firstPage]),
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
