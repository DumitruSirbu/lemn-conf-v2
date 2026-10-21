import { MAX_STAFF_AUDIT_IDLE_LIFETIME_SECONDS } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";

describe("the idle lifetimes the sessions use and the cap the staff audit store accepts", () => {
  it("leave no role with an idle lifetime the audit store would refuse", () => {
    const longestConfigured = Math.max(
      ...Object.values(IDLE_LIFETIME_SECONDS_BY_ROLE),
    );

    expect(longestConfigured).toBeLessThanOrEqual(
      MAX_STAFF_AUDIT_IDLE_LIFETIME_SECONDS,
    );
  });
});
