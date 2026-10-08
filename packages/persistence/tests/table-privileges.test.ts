import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { readConnectionFacts } from "./support/connection-facts.js";

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
});
