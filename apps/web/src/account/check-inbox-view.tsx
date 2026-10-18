"use client";

import { useId, useRef } from "react";

import type { AppLocale } from "@/i18n/routing";
import {
  useAccountCheckInboxCopy,
  useAccountKitCopy,
  useAccountShellCopy,
} from "@/i18n/use-content";

import {
  FormHint,
  HelpItem,
  HelpList,
  InlineLink,
  LinkButton,
  OutcomeHero,
  renderStrong,
} from "./account-form-parts";
import { useFocusOnMount } from "./account-outcome-screens";
import {
  AccountActions,
  AccountPane,
  accountPathOf,
  ActionsLine,
  SecondaryAction,
  startPathOf,
} from "./account-shell";

// The screen after a registration was accepted (Lot 1 frame A2A). The server's answer is the same for a new address, an
// unconfirmed one and one already registered, so nothing here depends on which it was. The address shown is the one
// the person typed, held by this page alone: the answer carries none.

export interface CheckInboxViewProps {
  readonly locale: AppLocale;
  readonly address: string;
  /** Back to the form with the address kept, for a person who mistyped it. */
  readonly onWrongAddress: () => void;
}

export function CheckInboxView({
  locale,
  address,
  onWrongAddress,
}: CheckInboxViewProps) {
  const copy = useAccountCheckInboxCopy();
  const kit = useAccountKitCopy();
  const shell = useAccountShellCopy();
  const validityId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(headingRef);
  return (
    <>
      <AccountPane>
        <OutcomeHero
          tone="neutral"
          glyph="mail"
          title={copy.title}
          headingRef={headingRef}
        >
          {copy.body(address, renderStrong)}
        </OutcomeHero>
        <FormHint id={validityId}>{copy.validity}</FormHint>
        <HelpList title={kit.checkInbox.helpTitle}>
          <HelpItem>{kit.checkInbox.spam}</HelpItem>
          <HelpItem>{kit.checkInbox.newest}</HelpItem>
          <HelpItem>
            {copy.retryOrLogIn((chunks) => (
              <InlineLink href={accountPathOf(locale, "login")}>
                {chunks}
              </InlineLink>
            ))}
          </HelpItem>
        </HelpList>
      </AccountPane>
      <AccountActions>
        <SecondaryAction href={startPathOf(locale)}>
          {shell.backToConfigurator}
        </SecondaryAction>
        <ActionsLine>
          <LinkButton onClick={onWrongAddress}>{copy.wrongAddress}</LinkButton>
        </ActionsLine>
      </AccountActions>
    </>
  );
}
