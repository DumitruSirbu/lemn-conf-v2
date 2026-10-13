import { describe, expect, it } from "vitest";

import {
  CONTENT_SECURITY_POLICY_MODE,
  cspResponseHeaderName,
  type ContentSecurityPolicyMode,
} from "../../../src/lib/security-headers";

import {
  POLICY_HEADER,
  REPORT_ONLY_UPGRADE_DIAGNOSTIC,
  REPORT_PATH,
  isReportRequest,
  isViolationMessage,
  nonceOfPolicy,
  policyOf,
} from "./csp-violations";

const MODES: readonly ContentSecurityPolicyMode[] = ["report-only", "enforce"];
const BLOCKED_INLINE_SCRIPT =
  "Refused to execute inline script because it violates the following Content Security Policy directive: " +
  "\"script-src 'self' 'nonce-abc' 'strict-dynamic'\".";

describe("which console messages count as a violation (8Q.6, observer ii)", () => {
  it.each(MODES)("counts a blocked script, in mode %s", (mode) => {
    expect(isViolationMessage(BLOCKED_INLINE_SCRIPT, mode)).toBe(true);
  });

  it.each(MODES)(
    "counts the report-only prefix of the same message, in mode %s",
    (mode) => {
      expect(
        isViolationMessage(`[Report Only] ${BLOCKED_INLINE_SCRIPT}`, mode),
      ).toBe(true);
    },
  );

  it("ignores the report-only upgrade-insecure-requests diagnostic in report-only", () => {
    expect(
      isViolationMessage(REPORT_ONLY_UPGRADE_DIAGNOSTIC, "report-only"),
    ).toBe(false);
  });

  it("counts that sentence under enforcement, where no policy writes it and one that did would be news", () => {
    expect(isViolationMessage(REPORT_ONLY_UPGRADE_DIAGNOSTIC, "enforce")).toBe(
      true,
    );
  });

  it("matches the diagnostic exactly: a longer sentence that contains it is a violation", () => {
    expect(
      isViolationMessage(
        `${REPORT_ONLY_UPGRADE_DIAGNOSTIC} Refused to load a script.`,
        "report-only",
      ),
    ).toBe(true);
  });

  it.each(MODES)(
    "ignores a message that does not name the policy, in mode %s",
    (mode) => {
      expect(
        isViolationMessage(
          "Failed to load resource: the server responded with a status of 404",
          mode,
        ),
      ).toBe(false);
    },
  );
});

describe("which requests are reports (8Q.6, observer iii)", () => {
  it("matches the report path whatever the origin and the query", () => {
    expect(isReportRequest(`http://localhost:4320${REPORT_PATH}`)).toBe(true);
    expect(isReportRequest(`http://localhost:4320${REPORT_PATH}?x=1`)).toBe(
      true,
    );
  });

  it("does not match another path, or a path that only begins with the report path", () => {
    expect(isReportRequest("http://localhost:4320/api/designs")).toBe(false);
    expect(isReportRequest(`http://localhost:4320${REPORT_PATH}/more`)).toBe(
      false,
    );
    expect(isReportRequest(`http://localhost:4320/ro${REPORT_PATH}`)).toBe(
      false,
    );
  });
});

describe("the policy header every test reads", () => {
  const OTHER_MODE: Record<
    ContentSecurityPolicyMode,
    ContentSecurityPolicyMode
  > = {
    "report-only": "enforce",
    enforce: "report-only",
  };

  it("is the header the live mode's name gives, in lower case, as Playwright lists headers", () => {
    expect(POLICY_HEADER).toBe(
      cspResponseHeaderName(CONTENT_SECURITY_POLICY_MODE).toLowerCase(),
    );
  });

  it("is read from the live mode's header and never from the other mode's", () => {
    const otherName = cspResponseHeaderName(
      OTHER_MODE[CONTENT_SECURITY_POLICY_MODE],
    ).toLowerCase();

    expect(
      policyOf({
        headers: () => ({ [POLICY_HEADER]: "live", [otherName]: "other" }),
      }),
    ).toBe("live");
    expect(
      policyOf({ headers: () => ({ [otherName]: "other" }) }),
    ).toBeUndefined();
  });

  it("yields the nonce in a policy, and none for a policy without one or no policy", () => {
    expect(
      nonceOfPolicy(
        "default-src 'self'; script-src 'self' 'nonce-QUJD' 'strict-dynamic'",
      ),
    ).toBe("QUJD");
    expect(nonceOfPolicy("default-src 'self'")).toBeUndefined();
    expect(nonceOfPolicy(undefined)).toBeUndefined();
  });
});
