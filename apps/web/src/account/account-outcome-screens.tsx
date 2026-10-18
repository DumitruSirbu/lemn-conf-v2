"use client";

import { useEffect, useRef, type RefObject } from "react";

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
          {kit.requestFailed.body}
        </OutcomeHero>
      </AccountPane>
      <AccountActions>
        <PrimaryAction
          onClick={() => {
            window.location.reload();
          }}
        >
          {kit.reloadPage}
        </PrimaryAction>
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
