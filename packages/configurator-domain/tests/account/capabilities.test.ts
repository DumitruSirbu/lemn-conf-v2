import { describe, expect, it } from "vitest";

import {
  CAPABILITIES,
  ROLES,
  hasCapability,
  isRole,
  type Capability,
  type Role,
} from "../../src/account/index.js";

const SELF_SERVICE: Capability = "account.manage.own";
const CLIENT_DESIGN_PAIR: readonly Capability[] = [
  "design.read.own",
  "design.edit.own",
];
const ROLE_NAMES: readonly Role[] = ["client", "operator", "administrator"];

function capabilitiesOf(role: Role): readonly Capability[] {
  return CAPABILITIES.filter((capability) => hasCapability(role, capability));
}

describe("the capabilities of each role", () => {
  it("has exactly the owner's three roles", () => {
    expect(Object.keys(ROLES).sort()).toEqual([...ROLE_NAMES].sort());
  });

  it("lists every capability once", () => {
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
    expect(CAPABILITIES).toContain(SELF_SERVICE);
  });

  describe("account.manage.own: every signed-in account may keep its own sign-in details", () => {
    it.each(ROLE_NAMES)("%s holds it", (role) => {
      expect(hasCapability(role, SELF_SERVICE)).toBe(true);
    });

    it("an unknown role holds it no more than any other capability", () => {
      for (const role of ["", "root", "Client", "ADMINISTRATOR", " client"]) {
        expect(hasCapability(role, SELF_SERVICE)).toBe(false);
      }
    });
  });

  describe("the client's own-design pair stays the client's alone", () => {
    it.each(CLIENT_DESIGN_PAIR)("the client holds %s", (capability) => {
      expect(hasCapability("client", capability)).toBe(true);
    });

    it.each(CLIENT_DESIGN_PAIR)(
      "the operator does not hold %s",
      (capability) => {
        expect(hasCapability("operator", capability)).toBe(false);
      },
    );

    it.each(CLIENT_DESIGN_PAIR)(
      "the administrator still does not hold %s although it holds account.manage.own",
      (capability) => {
        expect(hasCapability("administrator", capability)).toBe(false);
        expect(hasCapability("administrator", SELF_SERVICE)).toBe(true);
      },
    );
  });

  describe("each role's whole set is pinned, so a capability cannot arrive unreviewed", () => {
    it("client", () => {
      expect([...capabilitiesOf("client")].sort()).toEqual(
        ["account.manage.own", "design.edit.own", "design.read.own"].sort(),
      );
    });

    it("operator", () => {
      expect([...capabilitiesOf("operator")].sort()).toEqual(
        [
          "account.manage.own",
          "contact.read",
          "contact.update-status",
          "design.read.any",
          "design.unhide",
          "note.write",
        ].sort(),
      );
    });

    it("administrator holds everything but the client's pair", () => {
      expect([...capabilitiesOf("administrator")].sort()).toEqual(
        CAPABILITIES.filter(
          (capability) => !CLIENT_DESIGN_PAIR.includes(capability),
        ).sort(),
      );
    });
  });

  it("no role may edit any design: staff read and never change one", () => {
    const names: readonly string[] = CAPABILITIES;

    expect(names).not.toContain("design.edit.any");
  });

  describe("an unknown role has no capability", () => {
    it.each(["constructor", "__proto__", "toString", "hasOwnProperty", ""])(
      "%j is not a role and grants nothing",
      (name) => {
        expect(isRole(name)).toBe(false);
        for (const capability of CAPABILITIES) {
          expect(hasCapability(name, capability)).toBe(false);
        }
      },
    );
  });
});
