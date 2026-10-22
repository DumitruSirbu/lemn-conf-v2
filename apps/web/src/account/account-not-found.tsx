"use client";

import { hasLocale, useLocale } from "next-intl";

import { routing } from "@/i18n/routing";
import {
  useAccountNotFoundCopy,
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

// Frame A8C: an address under the account family that no page answers. It has no counterpart in the other language,
// so the shell draws no language links, and it sits in the locale layout, which is where its language comes from.

export function AccountNotFound() {
  const locale = useLocale();
  const copy = useAccountNotFoundCopy();
  const shell = useAccountShellCopy();
  const startLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  return (
    <AccountShell locale={startLocale}>
      <AccountPane>
        <OutcomeHero tone="neutral" glyph="question" title={copy.title}>
          {copy.body}
        </OutcomeHero>
      </AccountPane>
      <AccountActions>
        <PrimaryLink href={startPathOf(startLocale)}>
          {shell.backToConfigurator}
        </PrimaryLink>
      </AccountActions>
    </AccountShell>
  );
}
