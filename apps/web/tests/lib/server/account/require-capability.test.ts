import {
  CAPABILITIES,
  ROLES,
  hasCapability,
  type Capability,
  type Role,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { CurrentSession } from "@/lib/server/account/current-session";
import {
  capabilitiesHeldBy,
  isCapabilityHeld,
  requireCapability,
} from "@/lib/server/account/require-capability";

/**
 * What an account holds is the domain's table for its role, minus everything but its own sign-in details while its
 * address is not confirmed. The staff capabilities are in that "everything": an unconfirmed address never holds one.
 */

const ROLE_NAMES = Object.keys(ROLES) as Role[];
const HELD_WITHOUT_CONFIRMED_ADDRESS: readonly Capability[] = [
  "account.manage.own",
];
const STAFF_CAPABILITIES: readonly Capability[] = [
  "design.read.any",
  "design.unhide",
  "contact.read",
  "contact.update-status",
  "note.write",
  "preset.create",
  "preset.manage",
  "price.edit",
  "translation.edit",
  "user.manage",
  "audit.read",
];

const everyRoleCapabilityAndAddressState = ROLE_NAMES.flatMap((role) =>
  CAPABILITIES.flatMap((capability) =>
    [true, false].map((isEmailVerified) => ({
      role,
      capability,
      isEmailVerified,
    })),
  ),
);

function signedIn(role: Role, isEmailVerified: boolean): CurrentSession {
  return {
    kind: "signed-in",
    accountId: "a".repeat(21),
    role,
    capabilities: [],
    isEmailVerified,
    email: "someone@example.test",
  };
}

describe("isCapabilityHeld: every capability, every role, confirmed and unconfirmed", () => {
  it("covers the whole table, so a capability or role added to the domain is asked here too", () => {
    expect(everyRoleCapabilityAndAddressState).toHaveLength(
      CAPABILITIES.length * ROLE_NAMES.length * 2,
    );
    expect(ROLE_NAMES).toEqual(["client", "operator", "administrator"]);
  });

  it.each(everyRoleCapabilityAndAddressState)(
    "$role, $capability, address confirmed: $isEmailVerified",
    ({ role, capability, isEmailVerified }) => {
      const holdsInDomain = hasCapability(role, capability);
      const isWaivedWithoutAddress =
        HELD_WITHOUT_CONFIRMED_ADDRESS.includes(capability);
      const expected =
        holdsInDomain && (isEmailVerified || isWaivedWithoutAddress);

      expect(isCapabilityHeld({ role, isEmailVerified }, capability)).toBe(
        expected,
      );
    },
  );

  it.each(ROLE_NAMES)(
    "an unconfirmed %s holds its own sign-in details and nothing else",
    (role) => {
      expect(capabilitiesHeldBy({ role, isEmailVerified: false })).toEqual([
        "account.manage.own",
      ]);
    },
  );

  it.each(ROLE_NAMES)(
    "a confirmed %s holds exactly the domain's capabilities for the role",
    (role) => {
      expect(capabilitiesHeldBy({ role, isEmailVerified: true })).toEqual(
        CAPABILITIES.filter((capability) => hasCapability(role, capability)),
      );
    },
  );

  it.each(STAFF_CAPABILITIES)(
    "%s is held by no unconfirmed account of any role, and by a confirmed administrator",
    (capability) => {
      for (const role of ROLE_NAMES) {
        expect(
          isCapabilityHeld({ role, isEmailVerified: false }, capability),
        ).toBe(false);
      }
      expect(
        isCapabilityHeld(
          { role: "administrator", isEmailVerified: true },
          capability,
        ),
      ).toBe(true);
    },
  );

  it("holds nothing for a role the table does not know", () => {
    expect(
      capabilitiesHeldBy({
        role: "superuser" as never,
        isEmailVerified: true,
      }),
    ).toEqual([]);
  });
});

describe("requireCapability", () => {
  it("refuses no session as unauthenticated", () => {
    expect(
      requireCapability({ kind: "anonymous" }, "account.manage.own"),
    ).toEqual({ kind: "refused", refusal: "unauthenticated" });
  });

  it("refuses an unconfirmed administrator a staff capability as forbidden", () => {
    expect(
      requireCapability(signedIn("administrator", false), "preset.create"),
    ).toEqual({ kind: "refused", refusal: "forbidden" });
  });

  it("allows a confirmed administrator the same capability", () => {
    expect(
      requireCapability(signedIn("administrator", true), "preset.create"),
    ).toEqual({ kind: "allowed" });
  });
});
