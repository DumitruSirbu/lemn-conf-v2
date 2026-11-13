"use client";

import { FormNotice } from "@/account/account-form-parts";
import {
  AccountActions,
  AccountHeading,
  AccountPane,
  AccountShell,
  PrimaryAction,
} from "@/account/account-shell";
import type { AppLocale } from "@/i18n/routing";
import { useAccountKitCopy } from "@/i18n/use-content";
import type { CatalogPage } from "@/staff/staff-paths";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

// What a page of the price dashboard shows in place of its content when it cannot be had. The words are the account
// area's own: the service not being there is said the same on every screen.

/** Inside the staff frame: the page's content could not be read, and the frame, with its navigation, stays. */
export function CatalogUnavailableNotice() {
  const kit = useAccountKitCopy();
  return (
    <FormNotice tone="error" title={kit.unavailable.title}>
      {kit.unavailable.body}
    </FormNotice>
  );
}

/** The screen of an item section (hardware, materials, accessories) whose items could not be read: the frame stays, and
 *  the notice stands in the page's place. */
export function ItemUnavailableScreen({
  locale,
  context,
  page,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly page: CatalogPage;
}) {
  return (
    <StaffShell locale={locale} page={page} context={context}>
      <CatalogUnavailableNotice />
    </StaffShell>
  );
}

/**
 * The server gate could not read the session store: nothing is known of the person, so no staff frame is drawn, and the
 * way on is the page itself asked for again.
 */
export function CatalogUnavailableScreen({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  const kit = useAccountKitCopy();
  return (
    <AccountShell locale={locale} isWide>
      <AccountPane>
        <AccountHeading title={kit.unavailable.title} />
        <FormNotice tone="error">{kit.unavailable.body}</FormNotice>
      </AccountPane>
      <AccountActions>
        <PrimaryAction
          onClick={() => {
            window.location.reload();
          }}
        >
          {kit.retry}
        </PrimaryAction>
      </AccountActions>
    </AccountShell>
  );
}
