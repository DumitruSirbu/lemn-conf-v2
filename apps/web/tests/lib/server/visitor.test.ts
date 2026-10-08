import { createHash } from "node:crypto";

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { readVisitorHash } from "../../../src/lib/server/visitor";

/**
 * `readVisitorHash` alone (M7 wave 7E3c S3a, D4): the share route's own read of the visitor cookie.
 * The rest of `visitor.ts` — `resolveVisitorForMint`, `readVisitorCookieForResume`,
 * `setVisitorCookie`, `clearVisitorCookie` — is already covered where it is used, in
 * `visitor-identity.test.ts` and the resume specs; this file does not repeat that coverage.
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const WELL_FORMED_VISITOR_VALUE = "a".repeat(43);

function requestCarrying(cookieHeader: string): NextRequest {
  return new NextRequest("https://example.test/s/AbC123xYz789", {
    headers: { cookie: cookieHeader },
  });
}

describe("readVisitorHash", () => {
  it("returns the SHA-256 digest of a well-formed cookie value", () => {
    const hash = readVisitorHash(
      requestCarrying(`${VISITOR_COOKIE_NAME}=${WELL_FORMED_VISITOR_VALUE}`)
        .cookies,
    );

    expect(hash).toBe(
      createHash("sha256")
        .update(WELL_FORMED_VISITOR_VALUE, "utf8")
        .digest("hex"),
    );
  });

  it("returns undefined when no cookie is carried at all", () => {
    expect(readVisitorHash(requestCarrying("").cookies)).toBeUndefined();
  });

  it("returns undefined for a malformed value, collapsing absent and malformed to one answer", () => {
    const malformed = "too-short";

    expect(
      readVisitorHash(
        requestCarrying(`${VISITOR_COOKIE_NAME}=${malformed}`).cookies,
      ),
    ).toBeUndefined();
  });
});
