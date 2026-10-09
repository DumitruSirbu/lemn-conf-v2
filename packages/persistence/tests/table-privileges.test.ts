import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { columnsHolding, columnsOf } from "./support/column-privileges.js";
import { readConnectionFacts } from "./support/connection-facts.js";
import {
  privilegesHeldWithGrantOption,
  tablePrivilegesTheServerKnows,
} from "./support/table-privileges.js";

const SUITE_NAME = "readConnectionFacts (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  it("reads the connection's facts from the catalog: names, flags and a list, whatever the role is", async () => {
    const facts = await readConnectionFacts(neon(liveTestDatabaseUrl));

    expect(facts.databaseName).not.toBe("");
    expect(facts.roleName).not.toBe("");
    expect(typeof facts.isSuperuser).toBe("boolean");
    expect(Array.isArray(facts.memberOf)).toBe(true);
    expect(typeof facts.designsExists).toBe("boolean");
    expect(typeof facts.isDesignsOwnerOrMemberOfIt).toBe("boolean");
    expect(typeof facts.isSchemaOwnerOrMemberOfIt).toBe("boolean");
    expect(typeof facts.canCreateInSchema).toBe("boolean");
  });

  it("asks the grant-option question in a form the server answers: the owner of designs holds every privilege with it, on the table and on every column", async () => {
    const sql = neon(liveTestDatabaseUrl);
    const known = await tablePrivilegesTheServerKnows(sql);

    const heldOnTheTable = await privilegesHeldWithGrantOption(
      sql,
      "public.designs",
      known,
    );
    const heldOnTheColumns = await columnsHolding(
      sql,
      "public.designs",
      "SELECT WITH GRANT OPTION",
    );

    expect(heldOnTheTable).toEqual(known);
    expect(heldOnTheColumns).toEqual(await columnsOf(sql, "public.designs"));
  });
});
