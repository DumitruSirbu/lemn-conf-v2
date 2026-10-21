// What the header takes from the server's capability list to decide whether to offer the way into the staff area. The list
// is advisory (the server's gate on each staff page decides), so the one rule worth pinning is that only the exact
// capability, in a signed-in staff session, says yes: a client, a lookalike string and anything that is not a string do
// not.
import { CAPABILITIES, ROLES } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describeSession } from "@/account/session/use-account-session";

const ADDRESS = "mihai.rusu@lemnaria.md";

function signedInWith(capabilities: unknown): unknown {
  return { state: "signed-in", email: ADDRESS, capabilities };
}

describe("the capability that opens the staff area", () => {
  it.each(["operator", "administrator"] as const)(
    "is read from the %s's real capability list",
    (role) => {
      expect(describeSession(signedInWith([...ROLES[role]]))).toEqual({
        kind: "staff",
        email: ADDRESS,
        canEnterStaffArea: true,
      });
    },
  );

  it("is not in a client's list, and the client stays a client", () => {
    expect(describeSession(signedInWith([...ROLES.client]))).toEqual({
      kind: "client",
      email: ADDRESS,
    });
  });

  it("is not in an unverified staff account's list, which holds only the account's own sign-in details", () => {
    expect(describeSession(signedInWith(["account.manage.own"]))).toEqual({
      kind: "staff",
      email: ADDRESS,
      canEnterStaffArea: false,
    });
  });

  it("is the one capability: every other, the staff's own included, leaves it out", () => {
    const everythingElse = CAPABILITIES.filter(
      (capability) =>
        capability !== "design.read.any" && capability !== "design.read.own",
    );

    expect(describeSession(signedInWith(everythingElse))).toEqual({
      kind: "staff",
      email: ADDRESS,
      canEnterStaffArea: false,
    });
    expect(describeSession(signedInWith(["design.read.any"]))).toEqual({
      kind: "staff",
      email: ADDRESS,
      canEnterStaffArea: true,
    });
  });

  it("is not in an empty list", () => {
    expect(describeSession(signedInWith([]))).toEqual({
      kind: "staff",
      email: ADDRESS,
      canEnterStaffArea: false,
    });
  });

  it("is not read from a list that also names the client's own-design capability: that session is a client's", () => {
    expect(
      describeSession(signedInWith(["design.read.own", "design.read.any"])),
    ).toEqual({ kind: "client", email: ADDRESS });
  });

  it.each([
    ["a trailing space", "design.read.any "],
    ["a leading space", " design.read.any"],
    ["capitals", "DESIGN.READ.ANY"],
    ["a trailing NUL", "design.read.any\u0000"],
    ["a trailing zero-width space", "design.read.any\u200B"],
    ["a leading right-to-left override", "\u202Edesign.read.any"],
    ["a dash for the dot", "design-read-any"],
    ["only the prefix", "design.read"],
    ["a longer capability", "design.read.any.extra"],
  ])("is not in a list that holds %s instead", (_name, lookalike) => {
    expect(describeSession(signedInWith([lookalike]))).toEqual({
      kind: "staff",
      email: ADDRESS,
      canEnterStaffArea: false,
    });
  });

  it.each([
    ["a nested list", [["design.read.any"]]],
    [
      "an object that prints as the capability",
      [{ toString: () => "design.read.any" }],
    ],
    ["an object with the capability as a key", [{ "design.read.any": true }]],
    ["a boxed string", [Object("design.read.any")]],
    ["a number", [1]],
    ["null", [null]],
  ])("is not in a list that holds %s", (_name, capabilities) => {
    expect(describeSession(signedInWith(capabilities))).toEqual({
      kind: "staff",
      email: ADDRESS,
      canEnterStaffArea: false,
    });
  });

  it.each([
    ["a string, which would match by substring", "design.read.any"],
    ["an object keyed by the capability", { "design.read.any": true }],
    ["nothing", undefined],
  ])(
    "is not read from a capability list that is %s: the body is anonymous",
    (_name, capabilities) => {
      expect(describeSession(signedInWith(capabilities))).toEqual({
        kind: "anonymous",
      });
    },
  );

  it("is not read from an anonymous answer that carries the list", () => {
    expect(
      describeSession({
        state: "anonymous",
        email: ADDRESS,
        capabilities: ["design.read.any"],
      }),
    ).toEqual({ kind: "anonymous" });
  });
});
