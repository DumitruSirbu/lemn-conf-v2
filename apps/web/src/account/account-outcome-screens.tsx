"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import type { AppLocale } from "@/i18n/routing";
import { useAccountKitCopy, useAccountShellCopy } from "@/i18n/use-content";

import {
  AccountActions,
  AccountPane,
  PrimaryAction,
  SecondaryAction,
  startPathOf,
} from "./account-shell";
import { OutcomeHero } from "./account-form-parts";

// The screens that replace an account form when nothing on it can mend the page. They are the same on every account
// page, so a page names the state and not its words.

/** Frame A8A: our fault, not the person's (a refused request, a platform error, an answer this page has no class for).
 *  A reload mends it, and the form's values were not worth keeping across it. */
export function RequestFailedScreen({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  const kit = useAccountKitCopy();
  return (
    <FailedRequestFrame locale={locale} body={kit.requestFailed.body}>
      <PrimaryAction
        onClick={() => {
          window.location.reload();
        }}
      >
        {kit.reloadPage}
      </PrimaryAction>
    </FailedRequestFrame>
  );
}

/** Frame A8A on a page that read a single-use token from its address (lot 1 review, D7). The address no longer holds
 *  the token, so a reload would only land on the invalid-link screen: the way back is the link in the e-mail, and the
 *  screen offers no reload. */
export function TokenRequestFailedScreen({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  const kit = useAccountKitCopy();
  return (
    <FailedRequestFrame locale={locale} body={kit.requestFailed.tokenBody} />
  );
}

/** What both A8A screens share: the heading and the sentence, then the primary action if there is one, then the way
 *  back to the configurator. */
function FailedRequestFrame({
  locale,
  body,
  children,
}: {
  readonly locale: AppLocale;
  readonly body: string;
  readonly children?: ReactNode;
}) {
  const kit = useAccountKitCopy();
  const shell = useAccountShellCopy();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(headingRef);
  return (
    <>
      <AccountPane>
        <OutcomeHero
          tone="error"
          title={kit.requestFailed.title}
          headingRef={headingRef}
        >
          {body}
        </OutcomeHero>
      </AccountPane>
      <AccountActions>
        {children}
        <SecondaryAction href={startPathOf(locale)}>
          {shell.backToConfigurator}
        </SecondaryAction>
      </AccountActions>
    </>
  );
}

/** A screen that replaces the form starts a screen reader at its first word. */
export function useFocusOnMount(target: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    target.current?.focus();
  }, [target]);
}
