import "server-only";

import type { Capability, Role } from "@lemnaria/configurator-domain";

import { isCapabilityHeld } from "@/lib/server/account/require-capability";
import { readSignedInPage } from "@/lib/server/account/signed-in-page";
import { staffNavigationOf } from "@/lib/server/staff/staff-page";
import { catalogPagesOpenTo } from "@/price-dashboard/catalog-pages";
import type { StaffRole, StaffShellContext } from "@/staff/staff-shell";

// The gate of every page of the price dashboard. It stands on the signed-in page gate, as the staff pages' gate
// (`lib/server/staff/staff-page.ts`) does, so a visitor, an expired session and an unreadable session store leave exactly
// as they do from any staff page. What it adds is the page's own capability, `price.edit` (which only administrators hold),
// and the navigation that goes with it. It reads and never writes.
//
// It composes the staff gate's exports instead of extending it: that module is the server lane's. When its navigation
// learns the catalog pages, this file shrinks to a call (M10 wave U1's report states the delta).

const PRICE_EDIT: Capability = "price.edit";
const ANY_SIGNED_IN_CAPABILITY: Capability = "account.manage.own";

export type CatalogPageRead =
  /** A live session that holds `price.edit`. */
  | { readonly kind: "signed-in"; readonly shell: StaffShellContext }
  /** A staff session without it (an operator): the 403 is drawn inside the staff frame, so the way back stays on screen. */
  | { readonly kind: "staff-forbidden"; readonly shell: StaffShellContext }
  /** A live session that is not staff's: the account area's 403, and no word of the staff area. */
  | { readonly kind: "forbidden" }
  /** The session store could not be read. */
  | { readonly kind: "unavailable" };

/** Redirects, as the signed-in gate does, when the session is not live. The locale is checked there too. */
export async function readCatalogPage({
  locale,
}: {
  locale: string;
}): Promise<CatalogPageRead> {
  const gate = await readSignedInPage({
    locale,
    capability: ANY_SIGNED_IN_CAPABILITY,
  });
  if (gate.kind !== "signed-in") return gate;

  const { session } = gate;
  const role = staffRoleOf(session.role);
  if (role === undefined) return { kind: "forbidden" };

  const canEditPrices = isCapabilityHeld(session, PRICE_EDIT);
  const shell: StaffShellContext = {
    role,
    email: session.email,
    navigation: [
      ...staffNavigationOf(session),
      ...catalogPagesOpenTo({ canEditPrices }),
    ],
  };
  return { kind: canEditPrices ? "signed-in" : "staff-forbidden", shell };
}

function staffRoleOf(role: Role): StaffRole | undefined {
  return role === "operator" || role === "administrator" ? role : undefined;
}
