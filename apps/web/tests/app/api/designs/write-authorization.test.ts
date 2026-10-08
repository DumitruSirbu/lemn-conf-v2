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
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ownerVisitorCookiePair } from "../../../support/owned-design-lookup";

/**
 * An in-memory stand-in for the Neon repository that reproduces the one property these route tests
 * depend on: a save succeeds only when the supplied hash equals the one the row was minted with,
 * and a refusal is indistinguishable from an unknown id.
 */
/** What `0004_add_design_revision.sql` gives every row. These tests mint and save once, so it is
 *  also the revision every save in this file states. */
const FIRST_REVISION = "1";

class FakeAuthorizedRepository implements AuthorizedConfigurationRepository {
  private readonly rows = new Map<
    DesignId,
    {
      design: Design;
      writeTokenHash: string | null;
      // `undefined` for a pre-ADR-0019/pre-7E3a row (`seedTokenlessRow`): no value a real request
      // could ever carry equals it, so `loadOwned` answers `none` for it, the way a pre-`0005` row
      // with `visitor_hash is null` does for the real repository (ADR 0114 decision 5).
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
const { GET, PATCH, PUT } = await import(
  "../../../../src/app/api/designs/[id]/route"
);

const EDITED_DESIGN: Design = { ...KITCHEN_L_DESIGN, presetId: "edited" };
const ATTACKER_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  presetId: "overwritten-by-attacker",
};

let fakeRepository: FakeAuthorizedRepository;

beforeEach(() => {
  fakeRepository = new FakeAuthorizedRepository();
  repository.current = fakeRepository;
});

function mintRequest(): NextRequest {
  return new NextRequest("https://example.test/api/designs", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
}

/** M7 wave 7E3b: every mint also sets the visitor cookie (ADR 0114 decision 5), which the read gate
 *  now requires on every `GET` regardless of the write token — `visitorCookie` is that identity, and
 *  `cookie` stays the write-token pair this file's own name is about. */
async function mintDesign(): Promise<{
  id: string;
  cookie: string;
  visitorCookie: string;
}> {
  const response = await POST(mintRequest());
  const { id } = (await response.json()) as { id: string };
  const setCookies = response.headers.getSetCookie();
  const writeTokenLine =
    setCookies.find((line) => line.startsWith("lemnaria_write_token_")) ?? "";
  const visitorLine =
    setCookies.find((line) => line.startsWith("__Host-lemnaria_visitor=")) ??
    "";
  return {
    id,
    cookie: cookiePairOf(writeTokenLine),
    visitorCookie: cookiePairOf(visitorLine),
  };
}

/** The `name=value` pair a browser would send back, stripped of the response-only attributes. */
function cookiePairOf(setCookieHeader: string): string {
  return setCookieHeader.split(";")[0] ?? "";
}

/** Joins cookie pairs the way a browser's own `Cookie` header does, dropping any that are empty —
 *  so a caller can combine a write-token pair with the visitor pair, or send only one of them. */
function combinedCookie(...pairs: readonly string[]): string {
  return pairs.filter((pair) => pair !== "").join("; ");
}

/** Every save this file sends states a revision, because the route refuses one that does not
 *  (WEB-003). It defaults to the revision a mint produces, which is what these tests hold. */
const EXPECTED_REVISION_HEADER = "x-expected-revision";

function saveRequest(
  id: string,
  {
    design,
    cookie,
    revision = FIRST_REVISION,
  }: { design: Design; cookie: string; revision?: string },
): NextRequest {
  return new NextRequest(`https://example.test/api/designs/${id}`, {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
      [EXPECTED_REVISION_HEADER]: revision,
    },
    body: JSON.stringify(design),
  });
}

/** The stored design's canonical form. Throws rather than asserting non-null: a missing row means
 *  the test's own setup is wrong, and that should read as a failure, not as a type escape. */
function storedSerialization(id: string): string {
  const design = fakeRepository.storedDesign(id);
  if (design === undefined) throw new Error(`No stored design for id "${id}"`);
  return canonicalSerializeDesign(design);
}

function rawBodyRequest(
  id: string,
  { body, cookie }: { body: string; cookie: string },
): NextRequest {
  return new NextRequest(`https://example.test/api/designs/${id}`, {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
      [EXPECTED_REVISION_HEADER]: FIRST_REVISION,
    },
    body,
  });
}

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/designs", () => {
  it("mints a design and hands the creating browser its write token", async () => {
    const response = await POST(mintRequest());

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toMatch(
      /^lemnaria_write_token_design-0=.+/,
    );
  });

  it("never puts the token in the response body, where script could read it", async () => {
    const response = await POST(mintRequest());
    const setCookie = response.headers.get("set-cookie") ?? "";
    const token = cookiePairOf(setCookie).split("=")[1] ?? "";

    const body = JSON.stringify(await response.json());

    expect(token).not.toBe("");
    expect(body).not.toContain(token);
  });
});

describe("PUT /api/designs/[id] — the write-token guard", () => {
  it("saves when the request carries that design's own write token", async () => {
    const { id, cookie } = await mintDesign();

    const response = await PUT(
      saveRequest(id, { design: EDITED_DESIGN, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(storedSerialization(id)).toBe(
      canonicalSerializeDesign(EDITED_DESIGN),
    );
  });

  it("refuses, and writes nothing, when no cookie is sent", async () => {
    const { id } = await mintDesign();
    const before = storedSerialization(id);

    const response = await PUT(
      saveRequest(id, { design: ATTACKER_DESIGN, cookie: "" }),
      routeParams(id),
    );

    expect(response.status).toBe(403);
    expect(storedSerialization(id)).toBe(before);
  });

  it("refuses, and writes nothing, when the token is wrong", async () => {
    const { id } = await mintDesign();
    const before = storedSerialization(id);
    const forged = `lemnaria_write_token_${id}=not-the-real-token`;

    const response = await PUT(
      saveRequest(id, { design: ATTACKER_DESIGN, cookie: forged }),
      routeParams(id),
    );

    expect(response.status).toBe(403);
    expect(storedSerialization(id)).toBe(before);
  });

  it("refuses, and writes nothing, when the token belongs to a different design", async () => {
    const victim = await mintDesign();
    const attacker = await mintDesign();
    const before = storedSerialization(victim.id);
    // The attacker's own token, renamed onto the victim's cookie — the cross-design case a single
    // shared cookie name would have let through.
    const attackersToken = attacker.cookie.split("=")[1] ?? "";
    const renamed = `lemnaria_write_token_${victim.id}=${attackersToken}`;

    const response = await PUT(
      saveRequest(victim.id, { design: ATTACKER_DESIGN, cookie: renamed }),
      routeParams(victim.id),
    );

    expect(response.status).toBe(403);
    expect(storedSerialization(victim.id)).toBe(before);
  });

  it("leaves a pre-ADR-0019 design unreadable and unwritable, by anyone (Amendment H2)", async () => {
    // No visitor hash was ever recorded for this row (it predates the column, ADR 0114 decision 5),
    // so no value any browser could present matches it — the same "have no owner and are therefore
    // unreadable" consequence a pre-`0005` row gets from the real repository.
    const legacyId = "legacy-design";
    fakeRepository.seedTokenlessRow(legacyId, KITCHEN_L_DESIGN);
    const anyCookie = `lemnaria_write_token_${legacyId}=anything-at-all`;

    const read = await GET(
      readRequest(legacyId, ownerVisitorCookiePair()),
      routeParams(legacyId),
    );
    const write = await PUT(
      saveRequest(legacyId, { design: ATTACKER_DESIGN, cookie: anyCookie }),
      routeParams(legacyId),
    );

    expect(read.status).toBe(404);
    expect(write.status).toBe(403);
    expect(storedSerialization(legacyId)).toBe(
      canonicalSerializeDesign(KITCHEN_L_DESIGN),
    );
  });

  it("returns byte-identical refusals for a wrong token and an unknown id", async () => {
    const { id } = await mintDesign();
    const wrongToken = `lemnaria_write_token_${id}=not-the-real-token`;
    const unknownId = "no-such-design";
    const unknownCookie = `lemnaria_write_token_${unknownId}=anything-at-all`;

    const wrongTokenResponse = await PUT(
      saveRequest(id, { design: ATTACKER_DESIGN, cookie: wrongToken }),
      routeParams(id),
    );
    const unknownIdResponse = await PUT(
      saveRequest(unknownId, {
        design: ATTACKER_DESIGN,
        cookie: unknownCookie,
      }),
      routeParams(unknownId),
    );

    // Any difference here — status, body, or a stray id in the message — turns the write endpoint
    // into an oracle for which design links exist.
    expect(unknownIdResponse.status).toBe(wrongTokenResponse.status);
    expect(await unknownIdResponse.json()).toEqual(
      await wrongTokenResponse.json(),
    );
  });

  it("names no design id in the refusal body", async () => {
    const { id } = await mintDesign();
    const wrongToken = `lemnaria_write_token_${id}=not-the-real-token`;

    const response = await PUT(
      saveRequest(id, { design: ATTACKER_DESIGN, cookie: wrongToken }),
      routeParams(id),
    );

    expect(JSON.stringify(await response.json())).not.toContain(id);
  });
});

describe("PUT /api/designs/[id] — the cookie slides on a successful write", () => {
  it("re-issues the write cookie, so editing past day 30 does not revoke access", async () => {
    const { id, cookie } = await mintDesign();

    const response = await PUT(
      saveRequest(id, { design: EDITED_DESIGN, cookie }),
      routeParams(id),
    );

    // Retention deletes a design 30 days after it was last touched; a fixed cookie would expire 30
    // days after mint, under a customer still editing, with no recovery until M8's emailed link.
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`lemnaria_write_token_${id}=`);
    expect(setCookie).toMatch(/;\s*Max-Age=2592000/);
    expect(setCookie).toMatch(/;\s*HttpOnly/i);
    expect(setCookie).toMatch(/;\s*Secure/i);
  });

  it("re-issues the same token rather than rotating it", async () => {
    const { id, cookie } = await mintDesign();
    const sentToken = cookie.split("=")[1] ?? "";

    const response = await PUT(
      saveRequest(id, { design: EDITED_DESIGN, cookie }),
      routeParams(id),
    );

    // A rotated token would be a second credential to keep in step with the stored hash; sliding
    // the expiry is the whole change.
    expect(cookiePairOf(response.headers.get("set-cookie") ?? "")).toBe(
      `lemnaria_write_token_${id}=${sentToken}`,
    );
  });

  it("issues no cookie on a refused write", async () => {
    const { id } = await mintDesign();

    const response = await PUT(
      saveRequest(id, { design: ATTACKER_DESIGN, cookie: "" }),
      routeParams(id),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("PUT /api/designs/[id] — a body that will not parse", () => {
  const MALFORMED = [
    { name: "truncated JSON", body: '{"room":' },
    { name: "not JSON at all", body: "definitely-not-json" },
    { name: "an empty body", body: "" },
  ];

  it.each(MALFORMED)(
    "answers 400 rather than throwing out of the handler for $name",
    async ({ body }) => {
      const { id, cookie } = await mintDesign();
      const before = storedSerialization(id);

      // A parse failure escaping the route is a 500 with a stack trace in the log, raised for what
      // is a client mistake. It is the same rejection as a schema failure to the client.
      const response = await PUT(
        rawBodyRequest(id, { body, cookie }),
        routeParams(id),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: "DESIGN_INVALID",
        error: "Design payload failed validation.",
      });
      expect(storedSerialization(id)).toBe(before);
    },
  );

  // ADR 0052's 800 mm ceiling on an empty column is witnessed at this seam by
  // `qa-5g.adversarial.test.ts`, whose fixture is invalid for that reason alone.

  it("still refuses an unauthorised caller before the parser sees the body", async () => {
    const { id } = await mintDesign();

    const response = await PUT(
      rawBodyRequest(id, { body: "definitely-not-json", cookie: "" }),
      routeParams(id),
    );

    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/designs/[id]", () => {
  it("is guarded identically to PUT", async () => {
    const { id, cookie } = await mintDesign();

    const authorized = await PATCH(
      saveRequest(id, { design: EDITED_DESIGN, cookie }),
      routeParams(id),
    );
    const unauthorized = await PATCH(
      saveRequest(id, { design: ATTACKER_DESIGN, cookie: "" }),
      routeParams(id),
    );

    expect(authorized.status).toBe(200);
    expect(unauthorized.status).toBe(403);
  });
});

/** The read that carries no credential, so a shared link keeps working. */
function readRequest(id: string, cookie?: string): NextRequest {
  const url = `https://example.test/api/designs/${id}`;
  return cookie === undefined
    ? new NextRequest(url)
    : new NextRequest(url, { headers: { cookie } });
}

async function readBodyOf(
  id: string,
  cookie?: string,
): Promise<{ status: number; body: unknown }> {
  const response = await GET(readRequest(id, cookie), routeParams(id));
  return { status: response.status, body: await response.json() };
}

describe("GET /api/designs/[id]", () => {
  it("needs no write token — only the owning browser's visitor cookie (Amendment H2)", async () => {
    const { id, visitorCookie } = await mintDesign();

    const { status, body } = await readBodyOf(id, visitorCookie);

    expect(status).toBe(200);
    expect(body).toEqual({
      id,
      revision: FIRST_REVISION,
      design: KITCHEN_L_DESIGN,
      canWrite: false,
    });
  });

  it("reports canWrite: false to the owning browser that sends no write-token cookie — a 200, never a 401 or 403", async () => {
    const { id, visitorCookie } = await mintDesign();

    const { status, body } = await readBodyOf(id, visitorCookie);

    expect(status).toBe(200);
    expect((body as { canWrite: boolean }).canWrite).toBe(false);
    expect((body as { design: Design }).design).toEqual(KITCHEN_L_DESIGN);
  });

  it("refuses a caller holding no cookie at all — 404, never a 401 or 403 (ADR 0114 decision 5)", async () => {
    const { id } = await mintDesign();

    const { status } = await readBodyOf(id);

    expect(status).toBe(404);
  });

  it("marks the response uncacheable and cookie-varying — canWrite is per-credential", async () => {
    // The design half is public, but `canWrite` is read off this request's own cookie. A shared
    // cached copy would hand one visitor another browser's `canWrite: true`, and a panel offering
    // edits every save is then refused for. Nothing caches this today; these headers are what
    // keeps that true if `s-maxage` is ever added to a payload that looks public.
    const { id, cookie, visitorCookie } = await mintDesign();

    const response = await GET(
      readRequest(id, combinedCookie(cookie, visitorCookie)),
      routeParams(id),
    );

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("reports canWrite: true to the browser that minted the design", async () => {
    const { id, cookie, visitorCookie } = await mintDesign();

    const { status, body } = await readBodyOf(
      id,
      combinedCookie(cookie, visitorCookie),
    );

    expect(status).toBe(200);
    expect((body as { canWrite: boolean }).canWrite).toBe(true);
  });

  it("refuses a foreign design outright — never canWrite: false (Amendment H2)", async () => {
    // Before M7 wave 7E3b, a write-token cookie named and pathed for the wrong design still read
    // the design with `canWrite: false`. Since decision 5, the read itself needs this browser's own
    // visitor identity to match the row, and `mine`'s never does for `theirs` — so the read is
    // refused wholesale, and `canWrite` is never computed at all.
    const mine = await mintDesign();
    const theirs = await mintDesign();

    const response = await GET(
      readRequest(theirs.id, mine.visitorCookie),
      routeParams(theirs.id),
    );

    expect(response.status).toBe(404);
    // The corresponding write is refused too, which is the guarantee the old `canWrite: false`
    // merely described.
    const write = await PUT(
      saveRequest(theirs.id, {
        design: ATTACKER_DESIGN,
        cookie: mine.cookie,
      }),
      routeParams(theirs.id),
    );
    expect(write.status).toBe(403);
  });

  it("reports canWrite as a boolean and never any part of the credential", async () => {
    const { id, cookie, visitorCookie } = await mintDesign();

    const response = await GET(
      readRequest(id, combinedCookie(cookie, visitorCookie)),
      routeParams(id),
    );
    const raw = await response.text();
    const token = cookie.split("=")[1] ?? "";

    expect(token.length).toBeGreaterThan(20);
    expect(raw).not.toContain(token);
    expect([...Object.keys(JSON.parse(raw) as object)].sort()).toEqual([
      "canWrite",
      "design",
      "id",
      "revision",
    ]);
  });
});

/**
 * WEB-003 at the HTTP boundary. Before wave S11 the route handed `saveAuthorized` an id, a
 * document and a credential and nothing else, so two tabs holding one cookie could both save from
 * the same revision and the second silently replaced the first.
 *
 * Every test here fails against that route: it had no `x-expected-revision` to read, no 409 to
 * answer with, and no `revision` in either response.
 */
describe("PUT /api/designs/[id] — the revision the save is conditional on (WEB-003)", () => {
  /** The second save in each of these is what the second tab sends: same cookie, same revision,
   *  different document. */
  async function saveEditedDesign(
    id: string,
    cookie: string,
    { design, revision }: { design: Design; revision: string },
  ): Promise<Response> {
    return PUT(saveRequest(id, { design, cookie, revision }), routeParams(id));
  }

  it("answers 409 to the second of two saves from one revision, and does not write it", async () => {
    const { id, cookie } = await mintDesign();

    const first = await saveEditedDesign(id, cookie, {
      design: EDITED_DESIGN,
      revision: FIRST_REVISION,
    });
    const second = await saveEditedDesign(id, cookie, {
      design: ATTACKER_DESIGN,
      revision: FIRST_REVISION,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({
      code: "DESIGN_REVISION_CONFLICT",
      error: "Design changed since it was loaded.",
    });
    // The refusal is worthless if the row moved anyway: the first tab's design is what is stored.
    expect(storedSerialization(id)).toBe(
      canonicalSerializeDesign(EDITED_DESIGN),
    );
  });

  it("answers the new revision, so the next save has something to state", async () => {
    const { id, cookie } = await mintDesign();

    const response = await saveEditedDesign(id, cookie, {
      design: EDITED_DESIGN,
      revision: FIRST_REVISION,
    });

    expect(await response.json()).toEqual({ id, revision: "2" });
  });

  it("accepts the next save once it states the revision the previous one produced", async () => {
    const { id, cookie } = await mintDesign();

    await saveEditedDesign(id, cookie, {
      design: EDITED_DESIGN,
      revision: FIRST_REVISION,
    });
    const second = await saveEditedDesign(id, cookie, {
      design: ATTACKER_DESIGN,
      revision: "2",
    });

    expect(second.status).toBe(200);
    expect(storedSerialization(id)).toBe(
      canonicalSerializeDesign(ATTACKER_DESIGN),
    );
  });

  // The disclosure rule. A 409 is only ever produced for a caller whose credential already matched,
  // so nobody else can tell a stale save from an unauthorised one — or learn that the design exists.
  // The *current* revision is the sharpest of these: it is the one claim that is correct in every
  // respect except the credential.
  it.each([
    { name: "the current revision", revision: "1" },
    { name: "a stale revision", revision: "9999" },
    { name: "a malformed revision", revision: "not-a-revision" },
  ])(
    "answers 403 and never 409 to a caller with the wrong credential claiming $name",
    async ({ revision }) => {
      const mine = await mintDesign();
      const theirs = await mintDesign();

      const response = await saveEditedDesign(theirs.id, mine.cookie, {
        design: ATTACKER_DESIGN,
        revision,
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Design write not authorized.",
      });
      expect(storedSerialization(theirs.id)).toBe(
        canonicalSerializeDesign(KITCHEN_L_DESIGN),
      );
    },
  );

  // Absent and malformed are one case, and both are refused rather than defaulted: a save with no
  // enforceable expectation is exactly the last-write-wins behaviour this wave removed.
  it.each([
    { name: "no revision header at all", revision: undefined },
    { name: "an empty revision", revision: "" },
    { name: "a non-numeric revision", revision: "' or '1'='1" },
    { name: "a leading-zero revision", revision: "01" },
  ])(
    "answers 400 to a save stating $name, and writes nothing",
    async ({ revision }) => {
      const { id, cookie } = await mintDesign();
      const headers: Record<string, string> = {
        cookie,
        "content-type": "application/json",
      };
      if (revision !== undefined) headers[EXPECTED_REVISION_HEADER] = revision;

      const response = await PUT(
        new NextRequest(`https://example.test/api/designs/${id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(ATTACKER_DESIGN),
        }),
        routeParams(id),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: "REVISION_REQUIRED",
        error: "Design save must state the revision it edits.",
      });
      expect(storedSerialization(id)).toBe(
        canonicalSerializeDesign(KITCHEN_L_DESIGN),
      );
    },
  );

  it("refuses a credential-less save before it complains about the missing revision", async () => {
    // Order matters for disclosure: a caller with no cookie must get the same 403 whatever else is
    // wrong with the request, so the 400 above cannot be used to probe which ids exist.
    const { id } = await mintDesign();

    const response = await PUT(
      new NextRequest(`https://example.test/api/designs/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ATTACKER_DESIGN),
      }),
      routeParams(id),
    );

    expect(response.status).toBe(403);
  });

  it("reports the design's revision on the read that hands it out", async () => {
    // Without this a browser could not state a revision on its first save at all: the credential
    // cookie and the document arrive together, and the revision has to travel with them.
    const { id, cookie, visitorCookie } = await mintDesign();

    const response = await GET(
      readRequest(id, combinedCookie(cookie, visitorCookie)),
      routeParams(id),
    );

    expect((await response.json()) as { revision: string }).toMatchObject({
      revision: FIRST_REVISION,
    });
  });

  it("mints a design already carrying its first revision", async () => {
    const response = await POST(mintRequest());

    expect((await response.json()) as { revision: string }).toMatchObject({
      revision: FIRST_REVISION,
    });
  });
});
