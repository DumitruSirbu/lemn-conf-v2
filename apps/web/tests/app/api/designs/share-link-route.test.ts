import { createHash } from "node:crypto";

import type { DesignId } from "@lemnaria/configurator-domain";
import { DesignNotFoundError } from "@lemnaria/configurator-domain";
import type {
  IssueShareLink,
  LoadSharedOutcome,
  ShareLinkCredentials,
  ShareLinkIssueOutcome,
  ShareLinkRepository,
  ShareLinkRevokeOutcome,
  ShareLinkStatusOutcome,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M7 wave 7E3c S3b, criterion 4's credential matrix and D4's success paths, against
 * `app/api/designs/[id]/share/route.ts`. The persistence-level invariants (one active row per
 * design, the sequence property) are `share-link-repository.test.ts`'s (S2); this file is the
 * route's own contract: which requests reach the repository at all, and that every refusal this
 * route can produce is byte-identical to `GET /api/designs/{unknown}`'s 404.
 */

function hashOf(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const DESIGN_ID = "V1StGXR8Z5jdHi6BmyT_a";
const OTHER_DESIGN_ID = "kZ9qLm3XnP0rTuVwYbCdE";
const UNKNOWN_DESIGN_ID = "no-such-design-00000x";

const WRITE_TOKEN = "write-token-for-the-design-under-test";
const VISITOR_VALUE = "a".repeat(43);
const OTHER_WRITE_TOKEN = "write-token-for-the-other-design-abc";
const OTHER_VISITOR_VALUE = "b".repeat(43);
const WRONG_WRITE_TOKEN = "not-the-right-token-at-all";
const MALFORMED_VISITOR_VALUE = "too-short";

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";

/** In-memory stand-in reproducing exactly the properties these route tests depend on: an operation
 *  is authorised only when both hashes match the design's own, an unauthorised call changes
 *  nothing, and every call is recorded so a test can assert the repository was never reached. */
class FakeShareLinkRepository implements ShareLinkRepository {
  private readonly designs = new Map<
    DesignId,
    { writeTokenHash: string; visitorHash: string }
  >();
  private readonly activeTokenByDesign = new Map<DesignId, string>();
  private readonly designByActiveToken = new Map<string, DesignId>();
  private failNextCallWith: Error | undefined;

  readonly issueCalls: IssueShareLink[] = [];
  readonly revokeCalls: ShareLinkCredentials[] = [];
  readonly statusCalls: ShareLinkCredentials[] = [];

  registerDesign(
    id: DesignId,
    writeTokenHash: string,
    visitorHash: string,
  ): void {
    this.designs.set(id, { writeTokenHash, visitorHash });
  }

  /** The next call to any method rejects with `error` instead of running, for the log tests. */
  failNextCall(error: Error): void {
    this.failNextCallWith = error;
  }

  private throwIfArmed(): void {
    const error = this.failNextCallWith;
    this.failNextCallWith = undefined;
    if (error) throw error;
  }

  private isAuthorised(credentials: ShareLinkCredentials): boolean {
    const row = this.designs.get(credentials.designId);
    return (
      row !== undefined &&
      row.writeTokenHash === credentials.writeTokenHash &&
      row.visitorHash === credentials.visitorHash
    );
  }

  async issue(issue: IssueShareLink): Promise<ShareLinkIssueOutcome> {
    await Promise.resolve();
    this.issueCalls.push(issue);
    this.throwIfArmed();
    if (!this.isAuthorised(issue)) return "refused";
    const previous = this.activeTokenByDesign.get(issue.designId);
    if (previous !== undefined) this.designByActiveToken.delete(previous);
    this.activeTokenByDesign.set(issue.designId, issue.tokenHash);
    this.designByActiveToken.set(issue.tokenHash, issue.designId);
    return "issued";
  }

  async revoke(
    credentials: ShareLinkCredentials,
  ): Promise<ShareLinkRevokeOutcome> {
    await Promise.resolve();
    this.revokeCalls.push(credentials);
    this.throwIfArmed();
    if (!this.isAuthorised(credentials)) return "refused";
    const active = this.activeTokenByDesign.get(credentials.designId);
    if (active !== undefined) {
      this.designByActiveToken.delete(active);
      this.activeTokenByDesign.delete(credentials.designId);
    }
    return "revoked";
  }

  async status(
    credentials: ShareLinkCredentials,
  ): Promise<ShareLinkStatusOutcome> {
    await Promise.resolve();
    this.statusCalls.push(credentials);
    this.throwIfArmed();
    if (!this.isAuthorised(credentials)) return "refused";
    return { active: this.activeTokenByDesign.has(credentials.designId) };
  }

  async loadShared(tokenHash: string): Promise<LoadSharedOutcome> {
    await Promise.resolve(tokenHash);
    return { kind: "none" };
  }

  /** Whether the design has an active token, and which one — read directly rather than through
   *  `status`, so "share rows and revoked_at unchanged" can be checked without the check itself
   *  counting as a call the credential-matrix tests must show never happened. */
  activeTokenFor(id: DesignId): string | undefined {
    return this.activeTokenByDesign.get(id);
  }

  callCount(): number {
    return (
      this.issueCalls.length + this.revokeCalls.length + this.statusCalls.length
    );
  }
}

const configRepository = vi.hoisted(() => ({ current: undefined as unknown }));
const shareLinkRepository = vi.hoisted(() => ({
  current: undefined as unknown,
}));
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => configRepository.current,
  getShareLinkRepository: () => shareLinkRepository.current,
}));

const { GET: loadDesign } = await import(
  "../../../../src/app/api/designs/[id]/route"
);
const {
  POST: shareIssue,
  DELETE: shareRevoke,
  GET: shareStatus,
} = await import("../../../../src/app/api/designs/[id]/share/route");

let fakeShareLinks: FakeShareLinkRepository;

beforeEach(() => {
  fakeShareLinks = new FakeShareLinkRepository();
  fakeShareLinks.registerDesign(
    DESIGN_ID,
    hashOf(WRITE_TOKEN),
    hashOf(VISITOR_VALUE),
  );
  fakeShareLinks.registerDesign(
    OTHER_DESIGN_ID,
    hashOf(OTHER_WRITE_TOKEN),
    hashOf(OTHER_VISITOR_VALUE),
  );
  shareLinkRepository.current = fakeShareLinks;
  // `GET /api/designs/{id}` is only ever asked for the baseline unknown-id 404 below; every id this
  // file uses through it is unknown, by construction.
  configRepository.current = {
    load: (id: string) => Promise.reject(new DesignNotFoundError(id)),
  };
});

type ShareMethod = "POST" | "DELETE" | "GET";

function shareHandlerFor(method: ShareMethod) {
  return method === "POST"
    ? shareIssue
    : method === "DELETE"
      ? shareRevoke
      : shareStatus;
}

function callShareRoute(
  method: ShareMethod,
  id: string,
  headers: Record<string, string>,
): Promise<Response> {
  const request = new NextRequest(
    `https://example.test/api/designs/${id}/share`,
    { method, headers },
  );
  return shareHandlerFor(method)(request, {
    params: Promise.resolve({ id }),
  });
}

function cookieHeader(pairs: readonly [string, string][]): string {
  return pairs.map(([name, value]) => `${name}=${value}`).join("; ");
}

/** A fully valid request for `DESIGN_ID`: same-origin, both cookies present and correct. Each
 *  refusal case below overrides exactly one thing away from this baseline. */
const VALID_HEADERS: Record<string, string> = {
  "sec-fetch-site": "same-origin",
  cookie: cookieHeader([
    [`lemnaria_write_token_${DESIGN_ID}`, WRITE_TOKEN],
    [VISITOR_COOKIE_NAME, VISITOR_VALUE],
  ]),
};

interface RefusalCase {
  readonly name: string;
  readonly id: string;
  readonly headers: Record<string, string>;
  readonly reachesRepository: boolean;
}

const CREDENTIAL_CASES: readonly RefusalCase[] = [
  {
    name: "no write token",
    id: DESIGN_ID,
    headers: {
      "sec-fetch-site": "same-origin",
      cookie: cookieHeader([[VISITOR_COOKIE_NAME, VISITOR_VALUE]]),
    },
    reachesRepository: false,
  },
  {
    name: "wrong write token",
    id: DESIGN_ID,
    headers: {
      "sec-fetch-site": "same-origin",
      cookie: cookieHeader([
        [`lemnaria_write_token_${DESIGN_ID}`, WRONG_WRITE_TOKEN],
        [VISITOR_COOKIE_NAME, VISITOR_VALUE],
      ]),
    },
    reachesRepository: true,
  },
  {
    name: "foreign-design write token",
    id: DESIGN_ID,
    headers: {
      "sec-fetch-site": "same-origin",
      cookie: cookieHeader([
        [`lemnaria_write_token_${DESIGN_ID}`, OTHER_WRITE_TOKEN],
        [VISITOR_COOKIE_NAME, VISITOR_VALUE],
      ]),
    },
    reachesRepository: true,
  },
  {
    name: "no visitor cookie",
    id: DESIGN_ID,
    headers: {
      "sec-fetch-site": "same-origin",
      cookie: cookieHeader([
        [`lemnaria_write_token_${DESIGN_ID}`, WRITE_TOKEN],
      ]),
    },
    reachesRepository: false,
  },
  {
    name: "malformed visitor cookie",
    id: DESIGN_ID,
    headers: {
      "sec-fetch-site": "same-origin",
      cookie: cookieHeader([
        [`lemnaria_write_token_${DESIGN_ID}`, WRITE_TOKEN],
        [VISITOR_COOKIE_NAME, MALFORMED_VISITOR_VALUE],
      ]),
    },
    reachesRepository: false,
  },
  {
    name: "foreign visitor cookie",
    id: DESIGN_ID,
    headers: {
      "sec-fetch-site": "same-origin",
      cookie: cookieHeader([
        [`lemnaria_write_token_${DESIGN_ID}`, WRITE_TOKEN],
        [VISITOR_COOKIE_NAME, OTHER_VISITOR_VALUE],
      ]),
    },
    reachesRepository: true,
  },
  {
    name: "unknown id",
    id: UNKNOWN_DESIGN_ID,
    headers: {
      "sec-fetch-site": "same-origin",
      cookie: cookieHeader([
        [`lemnaria_write_token_${UNKNOWN_DESIGN_ID}`, WRITE_TOKEN],
        [VISITOR_COOKIE_NAME, VISITOR_VALUE],
      ]),
    },
    reachesRepository: true,
  },
];

const CROSS_SITE_CASES: readonly RefusalCase[] = (
  ["cross-site", "same-site", "none"] as const
).map((secFetchSite) => ({
  name: `Sec-Fetch-Site: ${secFetchSite}`,
  id: DESIGN_ID,
  headers: { ...VALID_HEADERS, "sec-fetch-site": secFetchSite },
  reachesRepository: false,
}));
const FOREIGN_ORIGIN_CASE: RefusalCase = {
  name: "a foreign Origin without Sec-Fetch-Site",
  id: DESIGN_ID,
  headers: {
    cookie: VALID_HEADERS.cookie ?? "",
    origin: "https://attacker.example",
  },
  reachesRepository: false,
};

const ALL_REFUSAL_CASES: readonly RefusalCase[] = [
  ...CREDENTIAL_CASES,
  ...CROSS_SITE_CASES,
  FOREIGN_ORIGIN_CASE,
];

async function baselineNotFoundResponse(id: string): Promise<Response> {
  return loadDesign(new NextRequest(`https://example.test/api/designs/${id}`), {
    params: Promise.resolve({ id }),
  });
}

function headerEntriesExcludingDate(
  response: Response,
): readonly [string, string][] {
  return [...response.headers.entries()]
    .filter(([name]) => name !== "date")
    .sort(([a], [b]) => a.localeCompare(b));
}

const ALL_METHODS: readonly ShareMethod[] = ["POST", "DELETE", "GET"];

/** The full cartesian product of every refusal case and every method — 11 cases × 3 methods = 33
 *  combinations. Swept deterministically rather than through `fast-check`'s random sampling: this
 *  is a small, fixed, finite matrix, so exhaustive enumeration proves every combination the plan
 *  names, where random sampling over the same space would only prove *most* of them with any given
 *  seed. `share-link-repository.test.ts` (S2) is where a swept, unbounded sequence genuinely needs
 *  `fast-check`; this matrix does not. */
const MATRIX_CASES: readonly {
  readonly refusalCase: RefusalCase;
  readonly method: ShareMethod;
}[] = ALL_REFUSAL_CASES.flatMap((refusalCase) =>
  ALL_METHODS.map((method) => ({ refusalCase, method })),
);

/** Every export name Next's App Router treats as a route handler. */
const ROUTE_HANDLER_NAMES = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;

/** Seven credential cases, three cross-site `Sec-Fetch-Site` values and one foreign `Origin`. */
const REFUSAL_CASE_COUNT = 11;
/** Eleven cases against each of the three methods. */
const MATRIX_SIZE = 33;

describe("credential matrix (criterion 4)", () => {
  // The matrix is the product of two lists this file wrote, so its length says nothing by itself. What makes it
  // "every method" is the route module: a handler exported there and missing from `ALL_METHODS` is a door the sweep
  // below never knocks on. The two counts are literals so a refusal case deleted from the list is noticed too.
  it(`covers every case × method combination (${String(MATRIX_CASES.length)} total)`, async () => {
    const shareRoute = await import(
      "../../../../src/app/api/designs/[id]/share/route"
    );
    const handlersTheRouteExports = ROUTE_HANDLER_NAMES.filter(
      (name) => name in shareRoute,
    );

    expect([...handlersTheRouteExports].sort()).toEqual(
      [...ALL_METHODS].sort(),
    );
    expect(ALL_REFUSAL_CASES).toHaveLength(REFUSAL_CASE_COUNT);
    expect(MATRIX_CASES).toHaveLength(MATRIX_SIZE);
  });

  const matrixRows: readonly [string, ShareMethod, RefusalCase][] =
    MATRIX_CASES.map(({ refusalCase, method }) => [
      refusalCase.name,
      method,
      refusalCase,
    ]);

  it.each(matrixRows)(
    "%s, %s: answers exactly GET /api/designs/{unknown}'s 404",
    async (_name, method, refusalCase) => {
      const baseline = await baselineNotFoundResponse(refusalCase.id);
      const baselineBody: unknown = await baseline.json();
      const callsBefore = fakeShareLinks.callCount();
      const activeBefore = fakeShareLinks.activeTokenFor(refusalCase.id);

      const response = await callShareRoute(
        method,
        refusalCase.id,
        refusalCase.headers,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(baselineBody);
      expect(headerEntriesExcludingDate(response)).toEqual(
        headerEntriesExcludingDate(baseline),
      );
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(fakeShareLinks.activeTokenFor(refusalCase.id)).toBe(activeBefore);
      if (!refusalCase.reachesRepository) {
        expect(fakeShareLinks.callCount()).toBe(callsBefore);
      }
    },
  );
});

describe("success paths (D4)", () => {
  it("POST issues a link: 201, exactly {path}, private no-store, no Set-Cookie", async () => {
    const response = await callShareRoute("POST", DESIGN_ID, VALID_HEADERS);
    const body = (await response.json()) as { path: string };

    expect(response.status).toBe(201);
    expect(Object.keys(body)).toEqual(["path"]);
    expect(body.path).toMatch(/^\/s\/[0-9A-Za-z]{12}$/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("DELETE revokes: 204, empty, and is idempotent when nothing is active", async () => {
    const first = await callShareRoute("DELETE", DESIGN_ID, VALID_HEADERS);
    expect(first.status).toBe(204);
    expect(await first.text()).toBe("");

    const second = await callShareRoute("DELETE", DESIGN_ID, VALID_HEADERS);
    expect(second.status).toBe(204);
  });

  it("GET reports status: 200, exactly {active}", async () => {
    const beforeIssue = await callShareRoute("GET", DESIGN_ID, VALID_HEADERS);
    expect(await beforeIssue.json()).toEqual({ active: false });

    await callShareRoute("POST", DESIGN_ID, VALID_HEADERS);
    const afterIssue = await callShareRoute("GET", DESIGN_ID, VALID_HEADERS);

    expect(afterIssue.status).toBe(200);
    expect(await afterIssue.json()).toEqual({ active: true });
  });

  it("re-issuing revokes the previous token, leaving only the new one active", async () => {
    const first = (await (
      await callShareRoute("POST", DESIGN_ID, VALID_HEADERS)
    ).json()) as { path: string };
    const second = (await (
      await callShareRoute("POST", DESIGN_ID, VALID_HEADERS)
    ).json()) as { path: string };

    expect(second.path).not.toBe(first.path);
    expect(fakeShareLinks.issueCalls).toHaveLength(2);
    expect(fakeShareLinks.activeTokenFor(DESIGN_ID)).toBe(
      hashOf(second.path.slice("/s/".length)),
    );
  });
});

describe("logs (criterion 15)", () => {
  const OPERATIONS: readonly {
    method: ShareMethod;
    code: string;
  }[] = [
    { method: "POST", code: "share-issue" },
    { method: "DELETE", code: "share-revoke" },
    { method: "GET", code: "share-status" },
  ];

  it.each(OPERATIONS)(
    "a forced driver failure in $code logs one line naming no token, hash or cookie value",
    async ({ method, code }) => {
      const error = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      fakeShareLinks.failNextCall(new Error("simulated driver failure"));

      await expect(
        callShareRoute(method, DESIGN_ID, VALID_HEADERS),
      ).rejects.toThrow("simulated driver failure");

      expect(error).toHaveBeenCalledOnce();
      const logged = JSON.stringify(error.mock.calls);
      expect(logged).toContain(code);
      expect(logged).not.toContain(WRITE_TOKEN);
      expect(logged).not.toContain(hashOf(WRITE_TOKEN));
      expect(logged).not.toContain(VISITOR_VALUE);
      expect(logged).not.toContain(hashOf(VISITOR_VALUE));
    },
  );

  it("logs SHARE_CROSS_SITE_REFUSED, with no token or cookie value, for a cross-site request", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await callShareRoute("POST", DESIGN_ID, {
      ...VALID_HEADERS,
      "sec-fetch-site": "cross-site",
    });

    expect(warn).toHaveBeenCalledOnce();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("SHARE_CROSS_SITE_REFUSED");
    expect(logged).not.toContain(WRITE_TOKEN);
    expect(logged).not.toContain(VISITOR_VALUE);
  });
});
