import "server-only";

import { CAPABILITIES, hasCapability } from "@lemnaria/configurator-domain";
import type { Capability, Role } from "@lemnaria/configurator-domain";

import type { CurrentSession } from "@/lib/server/account/current-session";

// The one place a route asks whether an account may do something (ADR 0172 decision 7). It reads the session the server
// built from the session cookie and nothing the client sent: a role or capability in a body or a header is never an
// input.

/** The one capability an account whose address is not confirmed still holds: it must reach its own sign-in details to
 *  confirm, change or reset that address. Every other capability, the client's designs and all of staff's, needs a
 *  confirmed address, so a capability added to the domain is withheld from an unconfirmed account until it is listed
 *  here. */
const CAPABILITIES_HELD_WITHOUT_CONFIRMED_ADDRESS: readonly Capability[] = [
  "account.manage.own",
];

/** What a signed-in account is judged on: its current role and whether its address is confirmed. */
export interface CapabilityHolder {
  readonly role: Role;
  readonly isEmailVerified: boolean;
}

/** `unauthenticated` maps to 401 (no live session), `forbidden` to 403 (a session that does not hold the capability).
 */
export type CapabilityRefusal = "unauthenticated" | "forbidden";

export type CapabilityCheck =
  | { readonly kind: "allowed" }
  | { readonly kind: "refused"; readonly refusal: CapabilityRefusal };

export function isCapabilityHeld(
  holder: CapabilityHolder,
  capability: Capability,
): boolean {
  if (!hasCapability(holder.role, capability)) return false;
  return (
    holder.isEmailVerified ||
    CAPABILITIES_HELD_WITHOUT_CONFIRMED_ADDRESS.includes(capability)
  );
}

/** Every capability the holder holds, in the domain's order. */
export function capabilitiesHeldBy(
  holder: CapabilityHolder,
): readonly Capability[] {
  return CAPABILITIES.filter((capability) =>
    isCapabilityHeld(holder, capability),
  );
}

export function requireCapability(
  session: CurrentSession,
  capability: Capability,
): CapabilityCheck {
  if (session.kind !== "signed-in") {
    return { kind: "refused", refusal: "unauthenticated" };
  }
  return isCapabilityHeld(session, capability)
    ? { kind: "allowed" }
    : { kind: "refused", refusal: "forbidden" };
}
