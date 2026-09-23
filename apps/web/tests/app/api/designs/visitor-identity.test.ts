import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import {
  DesignWriteConflictError,
  DesignWriteForbiddenError,
} from "@lemnaria/persistence";
import type {
  AuthorizedConfigurationRepository,
  AuthorizedSave,
  DesignVersion,
  MintDesign,
  SaveOutcome,
  StoredDesign,
} from "@lemnaria/persistence";
import { fc, test as propertyTest } from "@fast-check/vitest";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M7 wave 7E3a S2 — criteria 1-4: the visitor cookie's attributes, where it is and is not set, the
 * reuse-or-mint property, and D6's cross-site refusal. `visitor-identity.e2e.spec.ts` covers
 * criterion 6 (measured `Secure` in a real browser); this file is everything reachable without one.
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const WELL_FORMED_VISITOR_VALUE = /^[A-Za-z0-9_-]{43}$/;
const EXPECTED_REVISION_HEADER = "x-expected-revision";
const FIRST_REVISION = "1";
const SOURCE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../src",
);

/** A repository that records every `mint` call, so a test can inspect the hash the route actually
 *  handed it without the route itself ever exposing one. */
class RecordingRepository implements AuthorizedConfigurationRepository {
  readonly mints: MintDesign[] = [];
  private readonly rows = new Map<
    DesignId,
    {
      design: Design;
      writeTokenHash: string;
      visitorHash: string;
      revision: string;
    }
  >();
  private nextId = 0;

  mint(params: MintDesign): Promise<DesignVersion> {
    this.mints.push(params);
    const id = `visitor-identity-${String(this.nextId++)}`;
    this.rows.set(id, {
      design: params.design,
      writeTokenHash: params.writeTokenHash,
      visitorHash: params.visitor.visitorHash,
      revision: FIRST_REVISION,
    });
    return Promise.resolve({ id, revision: FIRST_REVISION });
  }

  // Amendment H3 (D3): the same row this write lands on is what answers whether the request's own
  // visitor value is its current one — never a second lookup.
  saveAuthorized({
    id,
    design,
    writeTokenHash,
    expectedRevision,
    requestVisitor,
  }: AuthorizedSave): Promise<SaveOutcome> {
    const row = this.rows.get(id);
    if (!row || row.writeTokenHash !== writeTokenHash) {
      return Promise.reject(new DesignWriteForbiddenError(id));
    }
    if (row.revision !== expectedRevision) {
      return Promise.reject(new DesignWriteConflictError(id));
    }
    const revision = String(Number(row.revision) + 1);
    this.rows.set(id, { ...row, design, revision });
    const ownsVisitor =
      requestVisitor.kind === "present" &&
      requestVisitor.visitorHash === row.visitorHash;
    return Promise.resolve({ id, revision, ownsVisitor });
  }

  load(id: DesignId): Promise<StoredDesign> {
    const row = this.rows.get(id);
    return row
      ? Promise.resolve({ design: row.design, revision: row.revision })
      : Promise.reject(new DesignNotFoundError(id));
  }
}

const repository = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repository.current,
}));

const { POST } = await import("../../../../src/app/api/designs/route");
const { GET, PUT } = await import("../../../../src/app/api/designs/[id]/route");

let fake: RecordingRepository;

beforeEach(() => {
  fake = new RecordingRepository();
  repository.current = fake;
});

function mintRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://lemnaria.test/api/designs", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin", ...headers },
  });
}

function cookieHeaderFor(value: string): string {
  return `${VISITOR_COOKIE_NAME}=${value}`;
}

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function readRequest(id: string): NextRequest {
  return new NextRequest(`https://lemnaria.test/api/designs/${id}`);
}

function saveRequest(
  id: string,
  {
    cookie,
    body = JSON.stringify(KITCHEN_L_DESIGN),
    revision = FIRST_REVISION,
  }: { cookie: string; body?: string; revision?: string },
): NextRequest {
  return new NextRequest(`https://lemnaria.test/api/designs/${id}`, {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
      [EXPECTED_REVISION_HEADER]: revision,
    },
    body,
  });
}

async function mintAndReturnCookiePair(): Promise<{
  id: string;
  writeTokenPair: string;
  visitorPair: string;
}> {
  const response = await POST(mintRequest());
  const { id } = (await response.json()) as { id: string };
  const visitorPair = `${VISITOR_COOKIE_NAME}=${
    response.cookies.get(VISITOR_COOKIE_NAME)?.value ?? ""
  }`;
  const setCookie = response.headers.get("set-cookie") ?? "";
  return { id, writeTokenPair: setCookie.split(";")[0] ?? "", visitorPair };
}

describe("the visitor cookie name (criterion 2)", () => {
  it("appears in exactly one production module, which imports server-only", () => {
    const source = readFileSync(
      resolve(SOURCE_DIR, "lib/server/visitor.ts"),
      "utf8",
    );
    expect(source).toContain('import "server-only"');
    expect(source).toContain(VISITOR_COOKIE_NAME);

    // The name is a literal nowhere else in production code — only ever reached through visitor.ts.
    for (const file of [
      "app/api/designs/route.ts",
      "app/api/designs/[id]/route.ts",
    ]) {
      const routeSource = readFileSync(resolve(SOURCE_DIR, file), "utf8");
      expect(routeSource).not.toContain(VISITOR_COOKIE_NAME);
    }
  });

  it("has no environment conditional on Secure", () => {
    const source = readFileSync(
      resolve(SOURCE_DIR, "lib/server/visitor.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/process\.env/);
  });
});

describe("the mint's Set-Cookie for the visitor (criterion 1)", () => {
  it("carries exactly the required attributes, and a value whose hash the row was minted with", async () => {
    const response = await POST(mintRequest());

    const cookie = response.cookies.get(VISITOR_COOKIE_NAME);
    expect(cookie?.path).toBe("/");
    expect(cookie?.maxAge).toBe(2_592_000);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.domain).toBeUndefined();
    expect(cookie?.value).toMatch(WELL_FORMED_VISITOR_VALUE);

    const minted = fake.mints[0];
    expect(minted?.visitor.visitorHash).toBe(
      createHash("sha256")
        .update(cookie?.value ?? "", "utf8")
        .digest("hex"),
    );
    // Every mint is fresh (Amendment H1) — with no carried cookie there is nothing to rotate from.
    expect(minted?.visitor.kind).toBe("fresh");
  });

  it("draws its value from node:crypto, never twice the same across two mints", async () => {
    const first = await POST(mintRequest());
    const second = await POST(mintRequest());

    expect(first.cookies.get(VISITOR_COOKIE_NAME)?.value).not.toBe(
      second.cookies.get(VISITOR_COOKIE_NAME)?.value,
    );
  });
});

/**
 * M7 wave 7E3b, Amendment H1 — the owner's ruling "Rotate on mint" supersedes 7E3a's reuse. This
 * describe block inverts the property below and the boundary case that follows it (G10 in the
 * 7E3b plan's sweep): every mint issues a fresh value, and a well-formed carried one is tagged as
 * what the repository's own transaction rotates away from, never re-emitted.
 */
describe("mint rotation (criterion 5, Amendment H1, property)", () => {
  propertyTest.prop([fc.integer({ min: 1, max: 5 })], {
    seed: 20260924,
    numRuns: 30,
  })(
    "issues a fresh value on every mint in one context, and tags rotation away from the one before it",
    async (mintCount) => {
      repository.current = new RecordingRepository();
      let cookie: string | undefined;
      const seenValues = new Set<string>();

      for (let attempt = 0; attempt < mintCount; attempt += 1) {
        const headers =
          cookie === undefined ? {} : { cookie: cookieHeaderFor(cookie) };
        const response = await POST(mintRequest(headers));
        const value = response.cookies.get(VISITOR_COOKIE_NAME)?.value ?? "";
        expect(value).toMatch(WELL_FORMED_VISITOR_VALUE);
        // Never the same value twice, and in particular never the one just carried.
        expect(seenValues.has(value)).toBe(false);
        seenValues.add(value);

        const recording = repository.current as RecordingRepository;
        const minted = recording.mints.at(-1);
        const expectedHash = createHash("sha256")
          .update(value, "utf8")
          .digest("hex");
        expect(minted?.visitor).toEqual(
          cookie === undefined
            ? { kind: "fresh", visitorHash: expectedHash }
            : {
                kind: "rotate",
                visitorHash: expectedHash,
                fromVisitorHash: createHash("sha256")
                  .update(cookie, "utf8")
                  .digest("hex"),
              },
        );
        cookie = value;
      }

      expect((repository.current as RecordingRepository).mints).toHaveLength(
        mintCount,
      );
    },
  );

  const MALFORMED_VALUES = [
    { name: "empty", value: "" },
    { name: "42 characters", value: "a".repeat(42) },
    { name: "44 characters", value: "a".repeat(44) },
    { name: "a non-base64url character", value: `${"a".repeat(42)}!` },
  ];

  it.each(MALFORMED_VALUES)(
    "mints fresh, with nothing to rotate from, for a malformed carried value ($name)",
    async ({ value }) => {
      const response = await POST(
        mintRequest({ cookie: cookieHeaderFor(value) }),
      );

      const replaced = response.cookies.get(VISITOR_COOKIE_NAME)?.value;
      expect(replaced).toMatch(WELL_FORMED_VISITOR_VALUE);
      expect(replaced).not.toBe(value);
      expect(fake.mints[0]?.visitor.kind).toBe("fresh");
      expect(fake.mints[0]?.visitor.visitorHash).toBe(
        createHash("sha256")
          .update(replaced ?? "", "utf8")
          .digest("hex"),
      );
    },
  );

  it("never reads the body — a request whose body stream throws when read still answers 201", async () => {
    const throwing = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("this body must never be read"));
      },
    });
    const init = {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
      body: throwing,
      duplex: "half",
    } as unknown as ConstructorParameters<typeof NextRequest>[1];
    const request = new NextRequest("https://lemnaria.test/api/designs", init);

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(fake.mints).toHaveLength(1);
  });
});

describe("cross-site mint refusal (criterion 4, D6)", () => {
  const REFUSED_SEC_FETCH_SITE = ["cross-site", "same-site", "none"];

  it.each(REFUSED_SEC_FETCH_SITE)(
    "refuses Sec-Fetch-Site: %s with 403, no cookie of either kind, and no mint",
    async (secFetchSite) => {
      const response = await POST(
        new NextRequest("https://lemnaria.test/api/designs", {
          method: "POST",
          headers: { "sec-fetch-site": secFetchSite },
        }),
      );

      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(fake.mints).toHaveLength(0);
    },
  );

  it("refuses an absent Sec-Fetch-Site with a foreign Origin", async () => {
    const response = await POST(
      new NextRequest("https://lemnaria.test/api/designs", {
        method: "POST",
        headers: { origin: "https://attacker.test" },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(fake.mints).toHaveLength(0);
  });

  it("accepts Sec-Fetch-Site: same-origin", async () => {
    const response = await POST(mintRequest());

    expect(response.status).toBe(201);
    expect(fake.mints).toHaveLength(1);
  });

  it("accepts neither header present at all, which is what the e2e fixture and old clients send", async () => {
    const response = await POST(
      new NextRequest("https://lemnaria.test/api/designs", { method: "POST" }),
    );

    expect(response.status).toBe(201);
    expect(fake.mints).toHaveLength(1);
  });
});

describe("where a visitor Set-Cookie appears, and where it never does (criterion 2)", () => {
  it("GET /api/designs/{id} carries none", async () => {
    const { id } = await mintAndReturnCookiePair();

    const response = await GET(readRequest(id), routeParams(id));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("a failed save (403: no credential) carries none", async () => {
    const { id, visitorPair } = await mintAndReturnCookiePair();

    const response = await PUT(
      saveRequest(id, { cookie: visitorPair }),
      routeParams(id),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("a failed save (409: stale revision) carries none", async () => {
    const { id, writeTokenPair, visitorPair } = await mintAndReturnCookiePair();
    const cookie = `${writeTokenPair}; ${visitorPair}`;
    await PUT(saveRequest(id, { cookie }), routeParams(id));

    const response = await PUT(
      saveRequest(id, { cookie, revision: FIRST_REVISION }),
      routeParams(id),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("a failed save (400: malformed body) carries none", async () => {
    const { id, writeTokenPair, visitorPair } = await mintAndReturnCookiePair();

    const response = await PUT(
      saveRequest(id, {
        cookie: `${writeTokenPair}; ${visitorPair}`,
        body: "not json",
      }),
      routeParams(id),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("a successful save re-emits the request's own visitor value", async () => {
    const { id, writeTokenPair, visitorPair } = await mintAndReturnCookiePair();
    const requestedValue = visitorPair.split("=")[1] ?? "";

    const response = await PUT(
      saveRequest(id, { cookie: `${writeTokenPair}; ${visitorPair}` }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get(VISITOR_COOKIE_NAME)?.value).toBe(
      requestedValue,
    );
  });

  it("a successful save emits nothing when the request carried no visitor cookie", async () => {
    const { id, writeTokenPair } = await mintAndReturnCookiePair();

    const response = await PUT(
      saveRequest(id, { cookie: writeTokenPair }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get(VISITOR_COOKIE_NAME)).toBeUndefined();
  });
});
