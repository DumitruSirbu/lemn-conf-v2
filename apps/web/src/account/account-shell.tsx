"use client";

import { useRef, type ReactNode } from "react";

import { useKeepFocusAbove } from "@/components/use-keep-focus-above";
import { endonymOf } from "@/i18n/locale-endonyms";
import { routing, type AppLocale } from "@/i18n/routing";
import { useAccountShellCopy } from "@/i18n/use-content";

import styles from "./account.module.css";

// The frame of every account page: the phone's header and the desktop's card, and the pieces a page lays out inside it.
// Every link here is a plain anchor. An account page is a document of its own with a policy of its own (the Turnstile
// frame on three pages, `no-referrer` on two), so a soft navigation, which keeps the old document, would carry the wrong
// policy and a nonce the new page's script does not hold. The site's shared start link, language menu and router link
// are all soft navigations, so none is used here.

/** The five account pages, as the path segment each is served under. */
export type AccountPage =
  | "register"
  | "login"
  | "forgot-password"
  | "verify-email"
  | "reset-password";

export function accountPathOf(locale: AppLocale, page: AccountPage): string {
  return `/${locale}/account/${page}`;
}

/** The start of the configurator in this language: where "back to the configurator" leads. */
export function startPathOf(locale: AppLocale): string {
  return `/${locale}`;
}

export interface AccountShellProps {
  readonly locale: AppLocale;
  /** The page this shell frames, so the language links lead to the same page in the other languages. A shell with no
   *  page (the 404 of an unknown address) has no counterpart to lead to and draws no language links. */
  readonly page?: AccountPage;
  /** The phone header's title. It wraps, so a longer language loses none of its words. Left out, the wordmark stands
   *  alone. */
  readonly headerTitle?: string;
  readonly children: ReactNode;
}

export function AccountShell({
  locale,
  page,
  headerTitle,
  children,
}: AccountShellProps) {
  const copy = useAccountShellCopy();
  return (
    <div className={styles.screen}>
      <header className={styles.nav}>
        <a className={styles.back} href={startPathOf(locale)}>
          <span className={styles.backMark} aria-hidden="true">
            ‹
          </span>
          <span className={styles.backText}>{copy.backToConfigurator}</span>
        </a>
        <span className={styles.wordmark}>{copy.brand}</span>
        {headerTitle === undefined ? null : (
          <>
            <span className={styles.navDivider} aria-hidden="true" />
            <span className={styles.navTitle}>{headerTitle}</span>
          </>
        )}
        {page === undefined ? null : (
          <nav className={styles.localeNav} aria-label={copy.localeMenu}>
            {otherLocalesThan(locale).map((other) => (
              <LocaleLink key={other} locale={other} page={page} />
            ))}
          </nav>
        )}
      </header>
      <main className={styles.stage}>
        <div className={styles.card}>{children}</div>
      </main>
    </div>
  );
}

function otherLocalesThan(locale: AppLocale): readonly AppLocale[] {
  return routing.locales.filter((candidate) => candidate !== locale);
}

/** This page in another language: a full load, so what was typed does not travel (Lot 1 review, P3). */
function LocaleLink({
  locale,
  page,
}: {
  readonly locale: AppLocale;
  readonly page: AccountPage;
}) {
  const code = locale.toUpperCase();
  return (
    <a
      className={styles.localeChip}
      href={accountPathOf(locale, page)}
      lang={locale}
      hrefLang={locale}
    >
      {code} <span className={styles.chipName}>{endonymOf(locale)}</span>
    </a>
  );
}

/** The column the page's content and fields go in. */
export function AccountPane({ children }: { readonly children: ReactNode }) {
  return <div className={styles.pane}>{children}</div>;
}

export function AccountHeading({
  title,
  lead,
}: {
  readonly title: string;
  /** A page whose title says it all (the login) has no lead. */
  readonly lead?: string;
}) {
  return (
    <div className={styles.head}>
      <h1 className={styles.heading}>{title}</h1>
      {lead === undefined ? null : <p className={styles.lead}>{lead}</p>}
    </div>
  );
}

/** The page's foot: the primary action, its reason and the way out. Sticky on the phone, so a focused field is kept
 *  clear of it, and in the card on a desktop. */
export function AccountActions({ children }: { readonly children: ReactNode }) {
  const regionRef = useRef<HTMLDivElement>(null);
  useKeepFocusAbove(regionRef);
  return (
    <div ref={regionRef} className={styles.actions}>
      {children}
    </div>
  );
}

/** A line of words with a link at its end, centred under the primary action. The words are optional. */
export function ActionsLine({
  lead,
  children,
}: {
  readonly lead?: string;
  readonly children: ReactNode;
}) {
  return (
    <p className={styles.actionsLine}>
      {lead === undefined ? null : <span>{lead}</span>}
      {children}
    </p>
  );
}

/** The quieter of two actions at the foot of a page that has ended: a plain anchor, full width. */
export function SecondaryAction({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <a className={styles.secondary} href={href}>
      {children}
    </a>
  );
}

/** The primary action when it leaves for another document: a plain anchor drawn as the button it stands in for. */
export function PrimaryLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <a className={styles.submit} href={href}>
      {children}
    </a>
  );
}

/** The page's primary action when no form is left to submit: the page's own reload. */
export function PrimaryAction({
  onClick,
  children,
}: {
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button type="button" className={styles.submit} onClick={onClick}>
      {children}
    </button>
  );
}
