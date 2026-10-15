import { describe, expect, it } from "vitest";

import { reasonsTheConnectionIsNotTheApplicationRole } from "./support/connection-facts.js";
import type { ConnectionFacts } from "./support/connection-facts.js";

/**
 * Adversarial QA of M8 wave 8E, criterion 13: the pure half of the privilege file's guard, over every combination of
 * the facts it is given. The live half, on the test database, is in `qa-8e-rate-limit-live.adversarial.test.ts`.
 */
const THE_APPLICATION_ROLE: ConnectionFacts = {
  databaseName: "some-database",
  roleName: "app_role",
  isSuperuser: false,
  memberOf: [],
  designsExists: true,
  isDesignsOwnerOrMemberOfIt: false,
  isSchemaOwnerOrMemberOfIt: false,
  canCreateInSchema: false,
};
const BOTH = [false, true];
const MEMBERSHIPS: readonly (readonly string[])[] = [
  [],
  ["table_owner"],
  ["neon_superuser", "pg_maintain"],
];

function everyCombinationOfFacts(): ConnectionFacts[] {
  const combinations: ConnectionFacts[] = [];
  for (const isSuperuser of BOTH)
    for (const memberOf of MEMBERSHIPS)
      for (const designsExists of BOTH)
        for (const isDesignsOwnerOrMemberOfIt of BOTH)
          for (const isSchemaOwnerOrMemberOfIt of BOTH)
            for (const canCreateInSchema of BOTH)
              combinations.push({
                ...THE_APPLICATION_ROLE,
                isSuperuser,
                memberOf,
                designsExists,
                isDesignsOwnerOrMemberOfIt,
                isSchemaOwnerOrMemberOfIt,
                canCreateInSchema,
              });
  return combinations;
}

function couldActAsMoreThanTheApplicationRole(facts: ConnectionFacts): boolean {
  return (
    facts.isSuperuser ||
    facts.memberOf.length > 0 ||
    !facts.designsExists ||
    facts.isDesignsOwnerOrMemberOfIt
  );
}

describe("QA 8E criterion 13: the guard's reasons over every combination of facts", () => {
  it("finds a reason exactly when the connection is a superuser, a member of any role, the owner of designs, or cannot show it is not", () => {
    const wronglyJudged = everyCombinationOfFacts().filter(
      (facts) =>
        reasonsTheConnectionIsNotTheApplicationRole(facts).length > 0 !==
        couldActAsMoreThanTheApplicationRole(facts),
    );

    expect(everyCombinationOfFacts()).toHaveLength(96);
    expect(wronglyJudged).toEqual([]);
  });

  it.each<[string, Partial<ConnectionFacts>, RegExp[]]>([
    ["the plain application role", {}, []],
    [
      "the owner of designs",
      { isDesignsOwnerOrMemberOfIt: true },
      [/owns public\.designs/],
    ],
    ["a superuser", { isSuperuser: true }, [/superuser/]],
    [
      "a member of the owner",
      { memberOf: ["table_owner"], isDesignsOwnerOrMemberOfIt: true },
      [/member of table_owner/, /owns public\.designs/],
    ],
    [
      "a member of a role that is itself a member of the owner",
      { memberOf: ["team"], isDesignsOwnerOrMemberOfIt: true },
      [/member of team/, /owns public\.designs/],
    ],
    [
      "a member of a predefined role that owns nothing",
      { memberOf: ["pg_maintain"] },
      [/member of pg_maintain/],
    ],
    [
      "a superuser who owns designs through a role, on a database with every fact against it",
      {
        isSuperuser: true,
        memberOf: ["table_owner"],
        isDesignsOwnerOrMemberOfIt: true,
        isSchemaOwnerOrMemberOfIt: true,
        canCreateInSchema: true,
      },
      [/superuser/, /member of table_owner/, /owns public\.designs/],
    ],
  ])("says of %s exactly what it found", (_label, difference, wordings) => {
    const reasons = reasonsTheConnectionIsNotTheApplicationRole({
      ...THE_APPLICATION_ROLE,
      ...difference,
    });

    expect(reasons).toHaveLength(wordings.length);
    wordings.forEach((wording, index) => {
      expect(reasons[index]).toMatch(wording);
    });
  });

  it("names no database and no role of its own in a reason, only the roles the connection is a member of", () => {
    const reasons = reasonsTheConnectionIsNotTheApplicationRole({
      ...THE_APPLICATION_ROLE,
      isSuperuser: true,
      memberOf: ["table_owner"],
      designsExists: false,
      isDesignsOwnerOrMemberOfIt: true,
    }).join(" ");

    expect(reasons).not.toContain(THE_APPLICATION_ROLE.databaseName);
    expect(reasons).not.toContain(THE_APPLICATION_ROLE.roleName);
  });
});
