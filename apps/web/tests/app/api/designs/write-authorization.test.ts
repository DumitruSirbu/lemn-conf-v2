import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import {
  DesignNotFoundError,
  canonicalSerializeDesign,
} from "@lemnaria/configurator-domain";
import { DesignWriteForbiddenError } from "@lemnaria/persistence";
import type {
  AuthorizedConfigurationRepository,
  AuthorizedSave,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An in-memory stand-in for the Neon repository that reproduces the one property these route tests
 * depend on: a save succeeds only when the supplied hash equals the one the row was minted with,
 * and a refusal is indistinguishable from an unknown id.
 */
class FakeAuthorizedRepository implements AuthorizedConfigurationRepository {
  private readonly rows = new Map<
    DesignId,
    { design: Design; writeTokenHash: string | null }
  >();
  private nextId = 0;

  mint(design: Design, writeTokenHash: string): Promise<DesignId> {
    const id = `design-${String(this.nextId++)}`;
    this.rows.set(id, { design, writeTokenHash });
    return Promise.resolve(id);
  }

  saveAuthorized({
    id,
    design,
    writeTokenHash,
  }: AuthorizedSave): Promise<DesignId> {
    const row = this.rows.get(id);
    if (!row || row.writeTokenHash !== writeTokenHash) {
      return Promise.reject(new DesignWriteForbiddenError(id));
    }
    this.rows.set(id, { ...row, design });
    return Promise.resolve(id);
  }

  load(id: DesignId): Promise<Design> {
    const row = this.rows.get(id);
    return row
      ? Promise.resolve(row.design)
      : Promise.reject(new DesignNotFoundError(id));
  }

  /** A design minted before ADR 0019: readable, and carrying no credential anyone can present. */
  seedTokenlessRow(id: DesignId, design: Design): void {
    this.rows.set(id, { design, writeTokenHash: null });
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

async function mintDesign(): Promise<{ id: string; cookie: string }> {
  const response = await POST();
  const { id } = (await response.json()) as { id: string };
  return { id, cookie: cookiePairOf(response.headers.get("set-cookie") ?? "") };
}

/** The `name=value` pair a browser would send back, stripped of the response-only attributes. */
function cookiePairOf(setCookieHeader: string): string {
  return setCookieHeader.split(";")[0] ?? "";
}

function saveRequest(
  id: string,
  { design, cookie }: { design: Design; cookie: string },
): NextRequest {
  return new NextRequest(`https://example.test/api/designs/${id}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
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
    headers: { cookie, "content-type": "application/json" },
    body,
  });
}

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/designs", () => {
  it("mints a design and hands the creating browser its write token", async () => {
    const response = await POST();

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toMatch(
      /^lemnaria_write_token_design-0=.+/,
    );
  });

  it("never puts the token in the response body, where script could read it", async () => {
    const response = await POST();
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

  it("leaves a pre-ADR-0019 design readable but not writable", async () => {
    const legacyId = "legacy-design";
    fakeRepository.seedTokenlessRow(legacyId, KITCHEN_L_DESIGN);
    const anyCookie = `lemnaria_write_token_${legacyId}=anything-at-all`;

    const read = await GET(
      new NextRequest(`https://example.test/api/designs/${legacyId}`),
      routeParams(legacyId),
    );
    const write = await PUT(
      saveRequest(legacyId, { design: ATTACKER_DESIGN, cookie: anyCookie }),
      routeParams(legacyId),
    );

    expect(read.status).toBe(200);
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
  it("needs no write token — a shared link still reads", async () => {
    const { id } = await mintDesign();

    const { status, body } = await readBodyOf(id);

    expect(status).toBe(200);
    expect(body).toEqual({
      id,
      design: KITCHEN_L_DESIGN,
      canWrite: false,
    });
  });

  it("reports canWrite: false to a caller holding no cookie — a 200, never a 401 or 403", async () => {
    const { id } = await mintDesign();

    const { status, body } = await readBodyOf(id);

    expect(status).toBe(200);
    expect((body as { canWrite: boolean }).canWrite).toBe(false);
    expect((body as { design: Design }).design).toEqual(KITCHEN_L_DESIGN);
  });

  it("marks the response uncacheable and cookie-varying — canWrite is per-credential", async () => {
    // The design half is public, but `canWrite` is read off this request's own cookie. A shared
    // cached copy would hand one visitor another browser's `canWrite: true`, and a panel offering
    // edits every save is then refused for. Nothing caches this today; these headers are what
    // keeps that true if `s-maxage` is ever added to a payload that looks public.
    const { id, cookie } = await mintDesign();

    const response = await GET(readRequest(id, cookie), routeParams(id));

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("reports canWrite: true to the browser that minted the design", async () => {
    const { id, cookie } = await mintDesign();

    const { status, body } = await readBodyOf(id, cookie);

    expect(status).toBe(200);
    expect((body as { canWrite: boolean }).canWrite).toBe(true);
  });

  it("reports canWrite: false when the cookie belongs to a different design", async () => {
    const mine = await mintDesign();
    const theirs = await mintDesign();

    const { status, body } = await readBodyOf(theirs.id, mine.cookie);

    expect(status).toBe(200);
    // The cookie is real, but it is named and pathed for `mine.id`. Reading `theirs.id` with it
    // must not report edit access this browser does not have on that design.
    expect((body as { canWrite: boolean }).canWrite).toBe(false);
    // And the corresponding write is refused, which is the guarantee `canWrite` merely describes.
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
    const { id, cookie } = await mintDesign();

    const response = await GET(readRequest(id, cookie), routeParams(id));
    const raw = await response.text();
    const token = cookie.split("=")[1] ?? "";

    expect(token.length).toBeGreaterThan(20);
    expect(raw).not.toContain(token);
    expect([...Object.keys(JSON.parse(raw) as object)].sort()).toEqual([
      "canWrite",
      "design",
      "id",
    ]);
  });
});
