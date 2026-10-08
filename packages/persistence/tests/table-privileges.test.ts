import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import {
  TABLE_PRIVILEGES_EVERY_SERVER_KNOWS,
  privilegesHeldOn,
  tablePrivilegesTheServerKnows,
} from "./support/table-privileges.js";

const SUITE_NAME = "table-privilege helper (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  it("lists at least the seven table privileges every server knows", async () => {
    const known = await tablePrivilegesTheServerKnows(
      neon(liveTestDatabaseUrl),
    );

    expect(known).toEqual(
      expect.arrayContaining([...TABLE_PRIVILEGES_EVERY_SERVER_KNOWS]),
    );
    expect(known).toEqual([...known].sort());
  });

  it("answers effective privilege by name, so a privilege the role holds is listed and one it lacks is not", async () => {
    const sql = neon(liveTestDatabaseUrl);
    const known = await tablePrivilegesTheServerKnows(sql);

    const held = await privilegesHeldOn(sql, "pg_catalog.pg_class", known);

    expect(held).toContain("SELECT");
    expect(held.every((privilege) => known.includes(privilege))).toBe(true);
  });
});
