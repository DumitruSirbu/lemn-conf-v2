// The violation net of wave 8Q (8Q.6): what a page did against the content security policy, seen three ways, and the
// policy header every test reads. Both depend on `CONTENT_SECURITY_POLICY_MODE` and on nothing else, so a flip or a
// rollback of the mode moves no test but the one that pins the constant.
//
// The three observers, and why there are three: (i) the `securitypolicyviolation` event on `document`, which fires for a
// report-only violation too and so works in either mode; (ii) the console, which a blocked `eval` never writes to, so it
// cannot carry the net alone; (iii) a request to the report path, the only one that also sees a violation inside a
// worker, where no document event fires. Chromium deduplicates identical reports, so a report count is a lower bound on
// the events and no test may assert that the two are equal.
import type { Page } from "@playwright/test";

import {
  CONTENT_SECURITY_POLICY_MODE,
  cspResponseHeaderName,
  type ContentSecurityPolicyMode,
} from "../../../src/lib/security-headers";

/** The header a response carries the policy under in the live mode, as Playwright lists it: in lower case. */
export const POLICY_HEADER = cspResponseHeaderName(
  CONTENT_SECURITY_POLICY_MODE,
).toLowerCase();

/** Where the policy sends reports. Slice S4 exports this from `lib/security-headers.ts` and this line imports it. */
export const REPORT_PATH = "/api/csp-reports";

/** The one console `error` every document writes in report-only: a diagnostic about the policy, not a violation. */
export const REPORT_ONLY_UPGRADE_DIAGNOSTIC =
  "The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy.";

const CONSOLE_NAMES_THE_POLICY = /content security policy/i;
const NONCE_IN_POLICY = /'nonce-([^']+)'/;
const VIOLATION_BINDING = "__lemnariaRecordCspViolation";

export interface ViolationEvent {
  readonly directive: string;
  readonly blockedUri: string;
  readonly disposition: "enforce" | "report";
  readonly sourceFile: string;
  readonly line: number;
  readonly column: number;
}

/** Everything a page did against the policy since {@link watchForViolations}, filled in as it happens. */
export interface ViolationNet {
  readonly events: ViolationEvent[];
  readonly consoleMessages: string[];
  readonly reportRequests: string[];
}

export interface ViolationsSeen {
  readonly events: readonly ViolationEvent[];
  readonly consoleMessages: readonly string[];
  readonly reportRequests: readonly string[];
}

interface ResponseWithHeaders {
  headers(): Record<string, string>;
}

/** The policy a response carries under the live mode's header name, or `undefined` when it carries none. */
export function policyOf(response: ResponseWithHeaders): string | undefined {
  return response.headers()[POLICY_HEADER];
}

export function nonceOfPolicy(policy: string | undefined): string | undefined {
  return NONCE_IN_POLICY.exec(policy ?? "")?.[1];
}

/** Whether a console message is a violation: it names the policy, bar the one report-only diagnostic. */
export function isViolationMessage(
  text: string,
  mode: ContentSecurityPolicyMode,
): boolean {
  if (!CONSOLE_NAMES_THE_POLICY.test(text)) return false;
  return !(mode === "report-only" && text === REPORT_ONLY_UPGRADE_DIAGNOSTIC);
}

export function isReportRequest(url: string): boolean {
  return new URL(url).pathname === REPORT_PATH;
}

/**
 * Starts the three observers on `page`. Call it before the first navigation: the event listener is an init script, so it
 * is in every document the page loads from then on, and its events reach Node through a binding, so a page that
 * navigates away does not take them with it.
 */
export async function watchForViolations(page: Page): Promise<ViolationNet> {
  const net: ViolationNet = {
    events: [],
    consoleMessages: [],
    reportRequests: [],
  };
  await page.exposeFunction(VIOLATION_BINDING, (event: ViolationEvent) => {
    net.events.push(event);
  });
  await page.addInitScript(sendEachViolationTo, VIOLATION_BINDING);
  page.on("console", (message) => {
    const text = message.text();
    if (isViolationMessage(text, CONTENT_SECURITY_POLICY_MODE)) {
      net.consoleMessages.push(text);
    }
  });
  page.on("request", (request) => {
    if (isReportRequest(request.url())) net.reportRequests.push(request.url());
  });
  return net;
}

export function violationsSeen(net: ViolationNet): ViolationsSeen {
  return {
    events: [...net.events],
    consoleMessages: [...net.consoleMessages],
    reportRequests: [...net.reportRequests],
  };
}

export const NO_VIOLATIONS: ViolationsSeen = {
  events: [],
  consoleMessages: [],
  reportRequests: [],
};

/** Runs in the page, so it names nothing from this module but what it is given. */
function sendEachViolationTo(bindingName: string): void {
  document.addEventListener(
    "securitypolicyviolation",
    (event) => {
      const binding = (window as unknown as Record<string, unknown>)[
        bindingName
      ];
      if (typeof binding !== "function") return;
      (binding as (violation: ViolationEvent) => void)({
        directive: event.effectiveDirective,
        blockedUri: event.blockedURI,
        disposition: event.disposition,
        sourceFile: event.sourceFile,
        line: event.lineNumber,
        column: event.columnNumber,
      });
    },
    true,
  );
}
