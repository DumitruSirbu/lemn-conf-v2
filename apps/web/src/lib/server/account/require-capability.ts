import "server-only";

import { CAPABILITIES, hasCapability } from "@lemnaria/configurator-domain";
import type { Capability, Role } from "@lemnaria/configurator-domain";

import type { CurrentSession } from "@/lib/server/account/current-session";

// The one place a route asks whether an account may do something (ADR 0172 decision 7). It reads the session the server
// built from the session cookie and nothing the client sent: a role or capability in a body or a header is never an
// input.

/** The capabilities that touch a design. An account whose address is not confirmed holds none of them, whatever its
 *  role. */
const DESIGN_CAPABILITIES: readonly Capability[] = [
  "design.read.own",
  "design.edit.own",
  "design.read.any",
  "design.unhide",
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
  return holder.isEmailVerified || !DESIGN_CAPABILITIES.includes(capability);
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
