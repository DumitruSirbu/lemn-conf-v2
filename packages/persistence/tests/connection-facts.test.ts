import { describe, expect, it } from "vitest";

import {
  describeWhereTheRunIs,
  reasonsTheConnectionIsNotTheApplicationRole,
} from "./support/connection-facts.js";
import type { ConnectionFacts } from "./support/connection-facts.js";

const THE_APPLICATION_ROLE: ConnectionFacts = {
  databaseName: "some-database",
  roleName: "some-role",
  isSuperuser: false,
  memberOf: [],
  designsExists: true,
  isDesignsOwnerOrMemberOfIt: false,
  isSchemaOwnerOrMemberOfIt: false,
  canCreateInSchema: false,
};

describe("reasonsTheConnectionIsNotTheApplicationRole", () => {
  it("finds nothing against a role with no attribute, membership or ownership", () => {
    expect(
      reasonsTheConnectionIsNotTheApplicationRole(THE_APPLICATION_ROLE),
    ).toEqual([]);
  });

  it.each<[string, Partial<ConnectionFacts>, RegExp]>([
    ["a superuser", { isSuperuser: true }, /superuser/],
    [
      "a member of another role",
      { memberOf: ["neon_superuser"] },
      /neon_superuser/,
    ],
    [
      "the owner of designs",
      { isDesignsOwnerOrMemberOfIt: true },
      /owns public\.designs/,
    ],
    ["a database with no designs table", { designsExists: false }, /not found/],
  ])("refuses %s, saying what it found", (_label, difference, wording) => {
    const reasons = reasonsTheConnectionIsNotTheApplicationRole({
      ...THE_APPLICATION_ROLE,
      ...difference,
    });

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(wording);
  });

  it("lists every reason at once", () => {
    const reasons = reasonsTheConnectionIsNotTheApplicationRole({
      ...THE_APPLICATION_ROLE,
      isSuperuser: true,
      memberOf: ["a"],
      isDesignsOwnerOrMemberOfIt: true,
    });

    expect(reasons).toHaveLength(3);
  });
});

describe("describeWhereTheRunIs", () => {
  it("names the database and the role as the server gave them", () => {
    expect(describeWhereTheRunIs(THE_APPLICATION_ROLE)).toBe(
      'reached database "some-database" as role "some-role"',
    );
  });
});
