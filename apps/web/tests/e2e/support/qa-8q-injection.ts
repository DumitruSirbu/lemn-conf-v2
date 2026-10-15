// Wave 8Q QA: what the QA specs inject into a document and how they read what the policy did with it. Every expectation
// is derived from `CONTENT_SECURITY_POLICY_MODE`, so a rollback of the one constant moves no spec but the one test that
// pins the constant: the same injection then RUNS and is reported as `report`, where it is blocked and `enforce` today.
import type { Page, Route } from "@playwright/test";

import {
  CONTENT_SECURITY_POLICY_MODE,
  CSP_REPORT_PATH,
} from "../../../src/lib/security-headers";
import { nonceOfPolicy, policyOf } from "./csp-violations";

export type InjectionKind =
  | "inline"
  | "handler"
  | "foreign-src"
  | "wrong-nonce";

export interface ExpectedViolation {
  readonly directive: "script-src-elem" | "script-src-attr";
  /** The `blockedURI` an event carries: `inline`, or the foreign script's address. */
  readonly blockedUriStartsWith: string;
}

export const MARKER_PREFIX = "__qa8q_";

export function markerOf(kind: InjectionKind): string {
  return `${MARKER_PREFIX}${kind.replace("-", "_")}`;
}

/** The marker a nonce-carrying control script sets, so a blocked injection is told apart from one never inserted. */
export const CONTROL_MARKER = `${MARKER_PREFIX}control`;
export const CONTROL_FOREIGN_MARKER = `${MARKER_PREFIX}control_foreign`;
/** The foreign script's own body sets this: it is set only when the foreign script was fetched AND executed. */
export const FOREIGN_BODY_MARKER = `${MARKER_PREFIX}foreign_ran`;
export const IMAGE_ID = "qa8q-image";
const BROKEN_IMAGE = "data:image/png;base64,AAAA";

export const INJECTION_KINDS: readonly InjectionKind[] = [
  "inline",
  "handler",
  "foreign-src",
  "wrong-nonce",
];

export function isEnforcing(): boolean {
  return CONTENT_SECURITY_POLICY_MODE === "enforce";
}

export function dispositionOfTheLiveMode(): "enforce" | "report" {
  return isEnforcing() ? "enforce" : "report";
}

export function expectedViolationOf(
  kind: InjectionKind,
  foreignUrl: string,
): ExpectedViolation {
  if (kind === "handler") {
    return { directive: "script-src-attr", blockedUriStartsWith: "inline" };
  }
  if (kind === "foreign-src") {
    return {
      directive: "script-src-elem",
      blockedUriStartsWith: new URL(foreignUrl).origin,
    };
  }
  return { directive: "script-src-elem", blockedUriStartsWith: "inline" };
}

/** The markup one injection adds just before `</body>`, where the parser inserts it. */
export function injectionHtml(kind: InjectionKind, foreignUrl: string): string {
  const marker = markerOf(kind);
  switch (kind) {
    case "inline":
      return `<script>window.${marker} = 1</script>`;
    case "handler":
      return `<img id="${IMAGE_ID}" src="${BROKEN_IMAGE}" onerror="window.${marker} = 1">`;
    case "foreign-src":
      return `<script src="${foreignUrl}"></script>`;
    case "wrong-nonce":
      return `<script nonce="not-the-nonce-of-this-response-0000">window.${marker} = 1</script>`;
  }
}

/** The controls: the same shapes, but carrying the response's own nonce, so each is one the policy admits. */
export function controlHtml(nonce: string, foreignUrl: string): string {
  return [
    `<img id="${IMAGE_ID}" src="${BROKEN_IMAGE}">`,
    `<script nonce="${nonce}">window.${CONTROL_MARKER} = 1</script>`,
    `<script nonce="${nonce}" src="${foreignUrl}"></script>`,
  ].join("");
}

/** Another origin than the application's. Nothing listens there: the page's requests for it are answered by the stub. */
export const FOREIGN_SCRIPT_URL =
  "https://qa8q-foreign.example/qa8q-foreign.js";

export interface ForeignScriptStub {
  /** The address of a script another origin serves; it sets `FOREIGN_BODY_MARKER` when it runs. */
  readonly url: string;
  /** What the page asked it for: a script the policy blocks is never asked for. */
  readonly requests: string[];
}

/**
 * Answers the foreign origin from the test, because no real server can stand in for it: a document that `route.fulfill`
 * serves has no network address Chromium can classify, so it treats the page as public and refuses it every script of
 * a loopback server before the policy is asked (measured). A request that reaches this stub passed the policy, so its
 * count is the count of requests the policy let through.
 */
export async function serveForeignScript(
  page: Page,
): Promise<ForeignScriptStub> {
  const requests: string[] = [];
  await page.route(`${new URL(FOREIGN_SCRIPT_URL).origin}/**`, (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "text/javascript",
      headers: { "access-control-allow-origin": "*" },
      body: `window.${FOREIGN_BODY_MARKER} = 1;`,
    });
  });
  return { url: FOREIGN_SCRIPT_URL, requests };
}

/**
 * Serves every document the page loads with `htmlFor(nonce)` added just before `</body>`, under the response's own
 * headers and so its own policy and nonce. Documents only: a script, a request of the app's own, is let through.
 */
export async function injectIntoDocuments(
  page: Page,
  htmlFor: (nonce: string) => string,
): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    if (route.request().resourceType() !== "document") {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const policy = policyOf(response);
    const nonce = nonceOfPolicy(policy);
    if (nonce === undefined) {
      await route.fulfill({ response });
      return;
    }
    const headers = { ...response.headers() };
    delete headers["content-encoding"];
    delete headers["content-length"];
    await route.fulfill({
      response,
      headers,
      body: (await response.text()).replace(
        "</body>",
        `${htmlFor(nonce)}</body>`,
      ),
    });
  });
}

export interface CapturedReport {
  readonly contentType: string;
  readonly hasCookie: boolean;
  readonly body: Record<string, unknown>;
  readonly report: Record<string, unknown>;
}

/**
 * Keeps every violation report the page sends and answers it `204` itself, so none reaches the server the page came
 * from: a spec that breaks the policy on purpose keeps its reports off the suite's server (8Q.6).
 */
export async function captureReports(page: Page): Promise<CapturedReport[]> {
  const captured: CapturedReport[] = [];
  await page.route(`**${CSP_REPORT_PATH}`, async (route) => {
    const request = route.request();
    const headers = await request.allHeaders();
    const body = parseJson(request.postData());
    captured.push({
      contentType: headers["content-type"] ?? "",
      hasCookie: headers.cookie !== undefined,
      body,
      report: asRecord(body["csp-report"]),
    });
    await route.fulfill({ status: 204 });
  });
  return captured;
}

function parseJson(text: string | null): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(text ?? "null"));
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/** A marker on `window`, or `null` when nothing set it. */
export async function readMarker(page: Page, name: string): Promise<unknown> {
  return page.evaluate(
    (markerName) =>
      (window as unknown as Record<string, unknown>)[markerName] ?? null,
    name,
  );
}

export async function hasHydrated(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    [...document.querySelectorAll("*")].some((element) =>
      Object.keys(element).some((key) => key.startsWith("__reactFiber$")),
    ),
  );
}

export async function imageHasErrored(page: Page): Promise<boolean> {
  return page.evaluate((id) => {
    const image = document.getElementById(id);
    return (
      image instanceof HTMLImageElement &&
      image.complete &&
      image.naturalWidth === 0
    );
  }, IMAGE_ID);
}
