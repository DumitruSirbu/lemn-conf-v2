"use client";

import type { AppLocale } from "@/i18n/routing";
import {
  useAccountForbiddenCopy,
  useAccountShellCopy,
} from "@/i18n/use-content";

import { OutcomeHero } from "./account-form-parts";
import {
  AccountActions,
  AccountPane,
  AccountShell,
  PrimaryLink,
  startPathOf,
} from "./account-shell";

// Frame A20C: a signed-in account on a page its role does not open (a staff session on the client's kitchens). The
// server gate renders it in place of the page, so the address stays. It sits in the shell with no header title and no
// language links, like the 404, and it never says "session expired": the session is live.

export function ForbiddenScreen({ locale }: { readonly locale: AppLocale }) {
  const copy = useAccountForbiddenCopy();
  const shell = useAccountShellCopy();
  return (
    <AccountShell locale={locale}>
      <AccountPane>
        <OutcomeHero tone="error" title={copy.title}>
          {copy.body}
        </OutcomeHero>
      </AccountPane>
      <AccountActions>
        <PrimaryLink href={startPathOf(locale)}>
          {shell.backToConfigurator}
        </PrimaryLink>
      </AccountActions>
    </AccountShell>
  );
}
