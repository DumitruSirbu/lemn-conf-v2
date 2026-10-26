import "server-only";

import type { Capability, Role } from "@lemnaria/configurator-domain";

import type { SignedInSession } from "@/lib/server/account/current-session";
import {
  isCapabilityHeld,
  type CapabilityHolder,
} from "@/lib/server/account/require-capability";
import { readSignedInPage } from "@/lib/server/account/signed-in-page";
import {
  BUILT_CATALOG_PAGES,
  catalogPagesOpenTo,
} from "@/price-dashboard/catalog-pages";
import { isCatalogPage } from "@/staff/staff-paths";
import type {
  StaffAreaPage,
  StaffPage,
  StaffRole,
  StaffShellContext,
} from "@/staff/staff-shell";

// The gate of every staff page (see ADR 0173). It stands on the signed-in page
// gate, so a visitor, an expired session and an unreadable session store leave exactly as they do from an account page,
// and adds the page's own capability and the navigation that goes with the person's role. It reads and never writes.

/** What each staff page asks of the session. Only a verified address holds any of these (`isCapabilityHeld`). */
const CAPABILITY_OF_PAGE: Readonly<Record<StaffAreaPage, Capability>> = {
  kitchens: "design.read.any",
  audit: "audit.read",
  cabinets: "price.edit",
  hardware: "price.edit",
  materials: "price.edit",
  accessories: "price.edit",
  defaults: "price.edit",
  publish: "price.edit",
};

/** The staff pages in the order the navigation lists them; the price dashboard's pages follow them. */
const NAVIGATION_ORDER: readonly StaffPage[] = ["kitchens", "audit"];

/** The staff pages that have a screen. A page joins this list when its directory under
 *  `app/[locale]/staff` exists, never before: the navigation must not link to a page that answers 404. The price
 *  dashboard's pages have their own list, `BUILT_CATALOG_PAGES`. */
export const BUILT_STAFF_PAGES: readonly StaffPage[] = ["kitchens", "audit"];

/** Every page the navigation may link to when it is not told otherwise. */
const BUILT_NAVIGATION_PAGES: readonly StaffAreaPage[] = [
  ...BUILT_STAFF_PAGES,
  ...BUILT_CATALOG_PAGES,
];

/** Held by every live session, an unconfirmed address included, so the signed-in gate answers the redirect, the outage
 *  and the unknown role, and the staff gate alone judges what the page asks. */
const ANY_SIGNED_IN_CAPABILITY: Capability = "account.manage.own";

export type StaffPageRead =
  /** A live session that holds the page's capability. */
  | { readonly kind: "signed-in"; readonly shell: StaffShellContext }
  /** A staff session that does not hold this page's capability: the 403 is drawn inside the staff shell, so the way
   *  back stays on screen. */
  | { readonly kind: "staff-forbidden"; readonly shell: StaffShellContext }
  /** A live session that is not staff's (a client, an unconfirmed address): the account area's 403, and no word of
   *  the staff area. */
  | { readonly kind: "forbidden" }
  /** The session store could not be read, so nobody can say whether the session is live. */
  | { readonly kind: "unavailable" };

/**
 * Redirects, as the signed-in gate does, when the session is not live. The locale is checked there too.
 */
export async function readStaffPage({
  locale,
  page,
}: {
  locale: string;
  page: StaffAreaPage;
}): Promise<StaffPageRead> {
  const gate = await readSignedInPage({
    locale,
    capability: ANY_SIGNED_IN_CAPABILITY,
  });
  if (gate.kind !== "signed-in") return gate;

  const shell = staffShellOf(gate.session);
  if (shell === undefined) return { kind: "forbidden" };
  return isCapabilityHeld(gate.session, CAPABILITY_OF_PAGE[page])
    ? { kind: "signed-in", shell }
    : { kind: "staff-forbidden", shell };
}

/**
 * The navigation's pages: those built, in the navigation's order, that the holder's capabilities open. The staff pages
 * come first and the price dashboard's pages after them, which only a holder of `price.edit` is offered.
 */
export function staffNavigationOf(
  holder: CapabilityHolder,
  builtPages: readonly StaffAreaPage[] = BUILT_NAVIGATION_PAGES,
): readonly StaffAreaPage[] {
  const staffPages = NAVIGATION_ORDER.filter(
    (page) =>
      builtPages.includes(page) &&
      isCapabilityHeld(holder, CAPABILITY_OF_PAGE[page]),
  );
  const catalogPages = catalogPagesOpenTo({
    canEditPrices: isCapabilityHeld(holder, CAPABILITY_OF_PAGE.cabinets),
    builtPages: builtPages.filter(isCatalogPage),
  });
  return [...staffPages, ...catalogPages];
}

/** What the shell draws for a staff member, or nothing for anyone else: staff are the accounts that hold a capability
 *  of some staff page, whether or not that page is built yet. */
function staffShellOf(session: SignedInSession): StaffShellContext | undefined {
  const role = staffRoleOf(session.role);
  if (role === undefined || !holdsAStaffPageCapability(session)) {
    return undefined;
  }
  return {
    role,
    email: session.email,
    navigation: staffNavigationOf(session),
  };
}

function staffRoleOf(role: Role): StaffRole | undefined {
  return role === "operator" || role === "administrator" ? role : undefined;
}

function holdsAStaffPageCapability(holder: CapabilityHolder): boolean {
  return NAVIGATION_ORDER.some((page) =>
    isCapabilityHeld(holder, CAPABILITY_OF_PAGE[page]),
  );
}
