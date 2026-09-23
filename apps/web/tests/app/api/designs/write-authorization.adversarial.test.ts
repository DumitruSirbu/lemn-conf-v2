// Adversarial QA for M3 Wave 3C-2a at the HTTP boundary.
//
// The implementer's route suite proves the happy path and the three obvious refusals. This file
// attacks the edges around them: what a *malformed* request does once it is past the cookie check,
// whether the refusal is identical in every observable — headers included, not only status and body
// — and whether the raw token can reach anywhere a person or a log could read it.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import {
  DesignNotFoundError,
  canonicalSerializeDesign,
} from "@lemnaria/configurator-domain";
import {
  DesignWriteConflictError,
  DesignWriteForbiddenError,
} from "@lemnaria/persistence";
import type {
  AuthorizedConfigurationRepository,
  AuthorizedSave,
  DesignVersion,
  SaveOutcome,
  MintDesign,
  StoredDesign,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flattenLogArguments } from "../../../support/console-log-line";
import { ownerVisitorCookiePair } from "../../../support/owned-design-lookup";

/** What `0004_add_design_revision.sql` gives every row. These tests mint and save once, so it is
 *  also the revision every save in this file states. */
const FIRST_REVISION = "1";

class FakeAuthorizedRepository implements AuthorizedConfigurationRepository {
  private readonly rows = new Map<
    DesignId,
    {
      design: Design;
      writeTokenHash: string | null;
      visitorHash: string | undefined;
      revision: string;
    }
  >();
  private nextId = 0;

  mint({
    design,
    writeTokenHash,
    visitor,
  }: MintDesign): Promise<DesignVersion> {
    const id = `design-${String(this.nextId++)}`;
    this.rows.set(id, {
      design,
      writeTokenHash,
      visitorHash: visitor.visitorHash,
      revision: FIRST_REVISION,
    });
    return Promise.resolve({ id, revision: FIRST_REVISION });
  }

  saveAuthorized({
    id,
    design,
    writeTokenHash,
    expectedRevision,
  }: AuthorizedSave): Promise<SaveOutcome> {
    const row = this.rows.get(id);
    // The order the real repository uses: the credential decides between 403 and 409, so a caller
    // without one can never see a conflict and never learn the design exists.
    if (!row || row.writeTokenHash !== writeTokenHash) {
      return Promise.reject(new DesignWriteForbiddenError(id));
    }
    if (row.revision !== expectedRevision) {
      return Promise.reject(new DesignWriteConflictError(id));
    }
    const revision = String(Number(row.revision) + 1);
    this.rows.set(id, { ...row, design, revision });
    return Promise.resolve({ id, revision, ownsVisitor: false });
  }

  load(id: DesignId): Promise<StoredDesign> {
    const row = this.rows.get(id);
    return row
      ? Promise.resolve({ design: row.design, revision: row.revision })
      : Promise.reject(new DesignNotFoundError(id));
  }

  loadOwned({
    id,
    visitorHash,
  }: {
    id: DesignId;
    visitorHash: string;
  }): Promise<
    { kind: "found"; design: Design; revision: string } | { kind: "none" }
  > {
    const row = this.rows.get(id);
    if (!row || row.visitorHash !== visitorHash)
      return Promise.resolve({ kind: "none" });
    return Promise.resolve({
      kind: "found",
      design: row.design,
      revision: row.revision,
    });
  }

  /** A design minted before ADR 0019, and before the visitor column (M7 wave 7E3a): readable by
   *  nobody under the current gate, and writable by nobody either. */
  seedTokenlessRow(id: DesignId, design: Design): void {
    this.rows.set(id, {
      design,
      writeTokenHash: null,
      visitorHash: undefined,
      revision: FIRST_REVISION,
    });
  }

  storedDesign(id: DesignId): Design | undefined {
    return this.rows.get(id)?.design;
  }
}

const repository = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repository.current,
}));

const { POST } = await import("../../../../src/app/api/designs/route");
const { GET, PUT } = await import("../../../../src/app/api/designs/[id]/route");

let fakeRepository: FakeAuthorizedRepository;

beforeEach(() => {
  fakeRepository = new FakeAuthorizedRepository();
  repository.current = fakeRepository;
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface Minted {
  readonly id: string;
  readonly cookie: string;
  readonly visitorCookie: string;
  readonly setCookie: string;
  readonly token: string;
}

function mintRequest(): NextRequest {
  return new NextRequest("https://example.test/api/designs", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
}

/** M7 wave 7E3b: every mint also sets the visitor cookie (ADR 0114 decision 5), which the read gate
 *  now requires on every `GET` regardless of the write token — `visitorCookie` is that identity. */
async function mintDesign(): Promise<Minted> {
  const response = await POST(mintRequest());
  const { id } = (await response.json()) as { id: string };
  const setCookies = response.headers.getSetCookie();
  const setCookie =
    setCookies.find((line) => line.startsWith("lemnaria_write_token_")) ?? "";
  const visitorLine =
    setCookies.find((line) => line.startsWith("__Host-lemnaria_visitor=")) ??
    "";
  const pair = setCookie.split(";")[0] ?? "";
  return {
    id,
    cookie: pair,
    visitorCookie: visitorLine.split(";")[0] ?? "",
    setCookie,
    token: pair.split("=")[1] ?? "",
  };
}

/** Joins cookie pairs the way a browser's own `Cookie` header does, dropping any that are empty. */
function combinedCookie(...pairs: readonly string[]): string {
  return pairs.filter((pair) => pair !== "").join("; ");
}

/** Every save this file sends states a revision, because the route refuses one that does not
 *  (WEB-003). It defaults to the revision a mint produces, which is what these tests hold. */
const EXPECTED_REVISION_HEADER = "x-expected-revision";

function requestWith(
  id: string,
  {
    body,
    cookie,
    revision = FIRST_REVISION,
  }: { body: string; cookie: string; revision?: string },
): NextRequest {
  return new NextRequest(`https://example.test/api/designs/${id}`, {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
      [EXPECTED_REVISION_HEADER]: revision,
    },
    body,
  });
}

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// FINDING QA-B — found in R1, fixed by `readDesign`, which wraps `request.json()` in its own `try`
// and answers 400. These cases are now the regression guard, and the block below them checks the
// thing a fix of this shape most easily gets wrong: a `try` that also swallows failures which are
// not the client's fault.
describe("a malformed body is refused, not thrown", () => {
  const MALFORMED: readonly { readonly name: string; readonly body: string }[] =
    [
      { name: "truncated JSON", body: '{"room":' },
      { name: "not JSON at all", body: "definitely-not-json" },
      { name: "an empty body", body: "" },
    ];

  it.each(MALFORMED)("answers 400 for $name", async (testCase) => {
    const { id, cookie } = await mintDesign();
    const before = canonicalSerializeDesign(
      fakeRepository.storedDesign(id) ?? KITCHEN_L_DESIGN,
    );

    const response = await PUT(
      requestWith(id, { body: testCase.body, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(
      canonicalSerializeDesign(
        fakeRepository.storedDesign(id) ?? KITCHEN_L_DESIGN,
      ),
    ).toBe(before);
  });

  it("refuses a malformed body from an unauthorised caller as 403, before parsing it", async () => {
    const { id } = await mintDesign();

    const response = await PUT(
      requestWith(id, { body: "definitely-not-json", cookie: "" }),
      routeParams(id),
    );

    // The cookie check runs first, so an unauthenticated caller cannot reach the parser at all.
    expect(response.status).toBe(403);
  });
});

describe("the refusal is identical in every observable, not only in status and body", () => {
  async function refusalFor(
    id: string,
    cookie: string,
  ): Promise<{
    status: number;
    body: string;
    headers: [string, string][];
  }> {
    const response = await PUT(
      requestWith(id, { body: JSON.stringify(KITCHEN_L_DESIGN), cookie }),
      routeParams(id),
    );
    return {
      status: response.status,
      body: await response.text(),
      headers: [...response.headers.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    };
  }

  it("answers a wrong token, an unknown id and a missing cookie the same way", async () => {
    const { id, cookie } = await mintDesign();
    const wrongToken = cookie.replace(/=.*$/, "=not-the-real-token");

    const wrong = await refusalFor(id, wrongToken);
    const unknown = await refusalFor(
      "totally-unknown-id",
      "lemnaria_write_token_totally-unknown-id=not-the-real-token",
    );
    const missing = await refusalFor(id, "");

    expect(wrong.status).toBe(403);
    expect(unknown).toEqual(wrong);
    expect(missing).toEqual(wrong);
  });

  it("sets no cookie on a refusal, so a refused caller learns nothing from the headers", async () => {
    const { id, cookie } = await mintDesign();
    const response = await PUT(
      requestWith(id, {
        body: JSON.stringify(KITCHEN_L_DESIGN),
        cookie: cookie.replace(/=.*$/, "=wrong"),
      }),
      routeParams(id),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("names no id and no reason anywhere in the refusal body", async () => {
    const { id, cookie } = await mintDesign();

    const response = await PUT(
      requestWith(id, {
        body: JSON.stringify(KITCHEN_L_DESIGN),
        cookie: cookie.replace(/=.*$/, "=wrong"),
      }),
      routeParams(id),
    );
    const body = await response.text();

    expect(body).not.toContain(id);
    expect(body.toLowerCase()).not.toContain("token");
    expect(body.toLowerCase()).not.toContain("credential");
  });
});

describe("the raw token never leaves the Set-Cookie header", () => {
  it("carries every attribute ADR 0019 decision 1 requires, on the real response", async () => {
    const { id, setCookie } = await mintDesign();

    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain(`Path=/api/designs/${id}`);
    expect(setCookie).toContain(`Max-Age=${String(30 * 24 * 60 * 60)}`);
  });

  it("appears in no console output during mint, save, or refusal", async () => {
    const logged: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(flattenLogArguments(args));
      });
    }

    const { id, cookie, token } = await mintDesign();
    await PUT(
      requestWith(id, { body: JSON.stringify(KITCHEN_L_DESIGN), cookie }),
      routeParams(id),
    );
    await PUT(
      requestWith(id, { body: "not-json-at-all", cookie }),
      routeParams(id),
    ).catch(() => undefined);
    await PUT(
      requestWith(id, { body: JSON.stringify({ nope: true }), cookie }),
      routeParams(id),
    );

    expect(token.length).toBeGreaterThan(20);
    expect(logged.join("\n")).not.toContain(token);
  });

  it("is absent from the mint response body and from the GET response", async () => {
    const { id, token, visitorCookie } = await mintDesign();

    const minted = await POST(mintRequest());
    const mintedBody = await minted.text();
    const read = await GET(
      new NextRequest(`https://example.test/api/designs/${id}`, {
        headers: { cookie: visitorCookie },
      }),
      routeParams(id),
    );
    const readBody = await read.text();

    expect(mintedBody).not.toContain(token);
    expect(readBody).not.toContain(token);
    expect(read.headers.get("set-cookie")).toBeNull();
  });
});

/**
 * `canWrite` is presence of a cookie, not proof of the right one, and the whole safety of that
 * shortcut rests on it never being the authorisation decision. These cases pin the boundary from
 * both sides: an advisory `true` that a write still refuses, and a write that is refused for
 * reasons `canWrite` never consulted.
 */
describe("canWrite is advisory and never the authorisation decision", () => {
  function readRequest(id: string, cookie: string): NextRequest {
    return new NextRequest(`https://example.test/api/designs/${id}`, {
      headers: { cookie },
    });
  }

  async function canWriteFor(id: string, cookie: string): Promise<unknown> {
    const response = await GET(readRequest(id, cookie), routeParams(id));
    return ((await response.json()) as { canWrite: unknown }).canWrite;
  }

  it("reports true for a forged cookie, and the write is still refused", async () => {
    const { id, visitorCookie } = await mintDesign();
    const forged = `lemnaria_write_token_${id}=not-the-real-token`;

    const advisory = await canWriteFor(
      id,
      combinedCookie(forged, visitorCookie),
    );
    const write = await PUT(
      requestWith(id, {
        body: JSON.stringify(KITCHEN_L_DESIGN),
        cookie: forged,
      }),
      routeParams(id),
    );

    // The honest bound of a check that costs no round trip: the route reports what the browser
    // presents, and `saveAuthorized` decides what it may do with it. If this ever flips to `false`
    // because someone taught GET to verify the token, the write above must STILL be the only thing
    // that authorises — a verified read followed by a trusting write is the TOCTOU window ADR 0019
    // exists to close.
    expect(advisory).toBe(true);
    expect(write.status).toBe(403);
  });

  it("reports false for a cookie whose token is empty — the name alone is not a credential", async () => {
    const { id, visitorCookie } = await mintDesign();

    expect(
      await canWriteFor(
        id,
        combinedCookie(`lemnaria_write_token_${id}=`, visitorCookie),
      ),
    ).toBe(false);
  });

  it("refuses a pre-ADR-0019 row outright — no credential can read or write it (Amendment H2)", async () => {
    // Superseded from "reports true on a pre-ADR-0019 row that no credential can ever write": since
    // M7 wave 7E3b such a row also has no visitor owner (it predates that column too), so the read
    // itself is refused and `canWrite` is never computed — the same "have no owner and are therefore
    // unreadable" consequence ADR 0114 decision 5 states for a pre-`0005` row.
    const legacyId = "legacy-design";
    fakeRepository.seedTokenlessRow(legacyId, KITCHEN_L_DESIGN);
    const anyCookie = `lemnaria_write_token_${legacyId}=anything-at-all`;

    const read = await GET(
      readRequest(legacyId, ownerVisitorCookiePair()),
      routeParams(legacyId),
    );
    const write = await PUT(
      requestWith(legacyId, {
        body: JSON.stringify(KITCHEN_L_DESIGN),
        cookie: anyCookie,
      }),
      routeParams(legacyId),
    );

    expect(read.status).toBe(404);
    expect(write.status).toBe(403);
  });

  it("refuses a cookie-less read outright, rather than answering canWrite: false (Amendment H2)", async () => {
    // Superseded from "does not turn a cookie-less read into a refusal": ADR 0019 decision 1's open
    // read is exactly what M7 wave 7E3b (ADR 0114 decision 5) retires — a design now opens only in
    // its owning browser, so a cookie-less caller gets the same 404 every other refusal case does.
    const { id } = await mintDesign();

    const response = await GET(
      new NextRequest(`https://example.test/api/designs/${id}`),
      routeParams(id),
    );

    expect(response.status).toBe(404);
  });

  it("sets no cookie on a read, whatever the answer", async () => {
    const { id, cookie, visitorCookie } = await mintDesign();

    const withCredential = await GET(
      readRequest(id, combinedCookie(cookie, visitorCookie)),
      routeParams(id),
    );
    const without = await GET(
      new NextRequest(`https://example.test/api/designs/${id}`),
      routeParams(id),
    );

    expect(withCredential.headers.get("set-cookie")).toBeNull();
    expect(without.headers.get("set-cookie")).toBeNull();
  });
});

// Re-verification of the QA-B fix, beyond "my three cases now pass". A `try` added around a parse
// is the classic place for over-broad catching: everything inside it starts reporting as a bad
// request, including failures that are the server's fault and belong in a 500.
describe("the parse guard swallows the parse and nothing else", () => {
  it("catches only request.json(), not the schema check that follows it", async () => {
    const { id, cookie } = await mintDesign();
    const warnings: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warnings.push(flattenLogArguments(args));
    });

    const unparseable = await PUT(
      requestWith(id, { body: "{not json", cookie }),
      routeParams(id),
    );
    const wrongShape = await PUT(
      requestWith(id, { body: JSON.stringify({ nope: true }), cookie }),
      routeParams(id),
    );

    expect(unparseable.status).toBe(400);
    expect(wrongShape.status).toBe(400);
    // Same 400 and the same opaque body to the client — ADR 0014 S2 says the schema must not be
    // handed back — but the two are distinguishable in the log, which is where an operator looks.
    expect(await unparseable.text()).toBe(await wrongShape.text());
    expect(warnings.join("\n")).toContain("not parseable JSON");
    // R3.2 changed what a schema failure logs — it is now bounded *shape* (an issue count plus
    // capped `path:code` pairs), not the Zod tree. This assertion is re-aimed at that contract
    // rather than left matching a substring that happens to survive.
    const schemaLine = warnings.find((line) => line.includes("issue(s)"));
    expect(schemaLine).toBeDefined();
    expect(schemaLine).toMatch(/\d+ issue\(s\)/);
    expect(schemaLine).not.toContain("Expected");
  });

  it("still answers 403, not 400, when the repository refuses the write", async () => {
    const { id } = await mintDesign();
    const other = await mintDesign();

    // A valid body, a well-formed cookie, and a credential for a different design: the refusal has
    // to come from the repository and stay a 403 — a parse guard that reached too far would report
    // this as a bad payload.
    const response = await PUT(
      requestWith(id, {
        body: JSON.stringify(KITCHEN_L_DESIGN),
        cookie: `lemnaria_write_token_${id}=${other.token}`,
      }),
      routeParams(id),
    );

    expect(response.status).toBe(403);
  });

  it("lets a genuine server fault surface as a fault, not as a bad body", async () => {
    const { id, cookie } = await mintDesign();
    vi.spyOn(fakeRepository, "saveAuthorized").mockRejectedValue(
      new Error("connection reset"),
    );

    // `designErrorResponse` rethrows anything that is not a domain failure, so this must reject out
    // of the handler rather than being reported to the client as a 400 or a 403. Masking it would
    // hide a database outage behind "your payload was invalid".
    await expect(
      PUT(
        requestWith(id, { body: JSON.stringify(KITCHEN_L_DESIGN), cookie }),
        routeParams(id),
      ),
    ).rejects.toThrow("connection reset");
  });
});

// R3.2. A rejection is the one path a caller drives with an arbitrary body, so its log line must be
// a function of the *shape* of the failure and never of the body's size or contents. Two ways that
// breaks: amplification (one cheap request buys a huge log write) and forgery (a caller writes its
// own lines into this application's log).
describe("a rejected payload cannot amplify or forge a log line", () => {
  function capturedWarnings(): string[] {
    const warnings: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warnings.push(flattenLogArguments(args));
    });
    return warnings;
  }

  it("bounds the log for 300 malformed placements", async () => {
    const { id, cookie } = await mintDesign();
    const warnings = capturedWarnings();
    const body = JSON.stringify({
      ...KITCHEN_L_DESIGN,
      placements: Array.from({ length: 300 }, (_unused, index) => ({
        id: `p${String(index)}`,
        wall: "NOT-A-WALL",
        alongMm: "not-a-number",
        y0Mm: "not-a-number",
        body: { buildId: 42 },
      })),
    });

    const response = await PUT(
      requestWith(id, { body, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    const logged = warnings.join(" ");
    // The Zod tree for this body runs to roughly 10^5 characters. Anything near that is the
    // amplification itself, whatever it happens to contain.
    expect(logged.length).toBeLessThan(2000);
    expect(logged).toMatch(/\d+ issue\(s\)/);
    const text = await response.text();
    expect(text).not.toContain("placements");
    expect(text).not.toContain("NOT-A-WALL");
  });

  it("writes no forged line and echoes no attacker-chosen value", async () => {
    const { id, cookie } = await mintDesign();
    const warnings = capturedWarnings();
    const forgedKey = [
      "room",
      "[designs] FORGED: the database is on fire",
    ].join(String.fromCharCode(10));
    const secretish = "s3cr3t-value-the-caller-chose";
    const body = JSON.stringify({
      ...KITCHEN_L_DESIGN,
      [forgedKey]: secretish,
      room: secretish,
    });

    const response = await PUT(
      requestWith(id, { body, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    const logged = warnings.join(" ");
    expect(logged).not.toContain("FORGED");
    // No control characters survive into the line, so nothing can start a new one.
    expect(logged).not.toMatch(/\p{Cc}/u);
    // And the value the caller chose is never echoed — only paths and codes are.
    expect(logged).not.toContain(secretish);
    expect(await response.text()).not.toContain(secretish);
  });
});

// R3.3. The sliding window must be driven by a *successful* write and by nothing else: a
// `Set-Cookie` on a refusal would tell an unauthorised caller that its request reached the write
// path, which is a new oracle in exactly the place security review established there is none.
describe("the write cookie is refreshed on a save and never on a refusal", () => {
  it("re-sets the same token, with a full Max-Age, after a successful write", async () => {
    const { id, cookie, token } = await mintDesign();

    const response = await PUT(
      requestWith(id, { body: JSON.stringify(KITCHEN_L_DESIGN), cookie }),
      routeParams(id),
    );
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain(`lemnaria_write_token_${id}=${token}`);
    expect(setCookie).toContain(`Max-Age=${String(30 * 24 * 60 * 60)}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain(`Path=/api/designs/${id}`);
  });

  it.each([
    {
      name: "a wrong token",
      cookieFor: (id: string) => `lemnaria_write_token_${id}=wrong`,
    },
    { name: "no cookie at all", cookieFor: () => "" },
  ])(
    "emits no Set-Cookie when the write is refused with $name",
    async (testCase) => {
      const { id } = await mintDesign();

      const response = await PUT(
        requestWith(id, {
          body: JSON.stringify(KITCHEN_L_DESIGN),
          cookie: testCase.cookieFor(id),
        }),
        routeParams(id),
      );

      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it("emits no Set-Cookie when the body is rejected", async () => {
    const { id, cookie } = await mintDesign();

    const malformed = await PUT(
      requestWith(id, { body: "not-json", cookie }),
      routeParams(id),
    );
    const wrongShape = await PUT(
      requestWith(id, { body: JSON.stringify({ nope: true }), cookie }),
      routeParams(id),
    );

    expect(malformed.status).toBe(400);
    expect(wrongShape.status).toBe(400);
    expect(malformed.headers.get("set-cookie")).toBeNull();
    expect(wrongShape.headers.get("set-cookie")).toBeNull();
  });
});
