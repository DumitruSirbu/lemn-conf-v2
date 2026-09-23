import { createHash } from "node:crypto";

import {
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
  MAX_DESIGN_BYTES,
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
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M7 wave 7E3a adversarial QA — the API half: D6's full Sec-Fetch-Site × Origin matrix, D1's save
 * refresh on every failure status and on PATCH, cookie-value boundaries on the mint, planted
 * non-`__Host-` names, duplicated cookie pairs, and criterion 11's log-absence over mint and save
 * failures. `visitor-identity.test.ts` is the implementer's; this file only adds counterexamples.
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const WELL_FORMED = /^[A-Za-z0-9_-]{43}$/;
const EXPECTED_REVISION_HEADER = "x-expected-revision";
const FIRST_REVISION = "1";
const OWN_ORIGIN = "https://lemnaria.test";
const FOREIGN_ORIGIN = "https://attacker.test";
const KNOWN_VALUE = "Ab0_-".repeat(8) + "xyz";

class RecordingRepository implements AuthorizedConfigurationRepository {
  readonly mints: MintDesign[] = [];
  failSaveWith: unknown = undefined;
  failMintWith: unknown = undefined;
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
    if (this.failMintWith !== undefined) {
      return Promise.reject(this.failMintWith as Error);
    }
    this.mints.push(params);
    const id = `qa-7e3a-${String(this.nextId++)}`;
    this.rows.set(id, {
      design: params.design,
      writeTokenHash: params.writeTokenHash,
      visitorHash: params.visitor.visitorHash,
      revision: FIRST_REVISION,
    });
    return Promise.resolve({ id, revision: FIRST_REVISION });
  }

  // Amendment H3 (D3): the same row this write lands on is what answers whether the request's own
  // visitor value is its current one — a fake standing in for the same statement the real
  // repository answers this from, never a second lookup.
  saveAuthorized(save: AuthorizedSave): Promise<SaveOutcome> {
    if (this.failSaveWith !== undefined) {
      return Promise.reject(this.failSaveWith as Error);
    }
    const row = this.rows.get(save.id);
    if (!row || row.writeTokenHash !== save.writeTokenHash) {
      return Promise.reject(new DesignWriteForbiddenError(save.id));
    }
    if (row.revision !== save.expectedRevision) {
      return Promise.reject(new DesignWriteConflictError(save.id));
    }
    const revision = String(Number(row.revision) + 1);
    this.rows.set(save.id, { ...row, design: save.design, revision });
    const ownsVisitor =
      save.requestVisitor.kind === "present" &&
      save.requestVisitor.visitorHash === row.visitorHash;
    return Promise.resolve({ id: save.id, revision, ownsVisitor });
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
const { GET, PUT, PATCH } = await import(
  "../../../../src/app/api/designs/[id]/route"
);

let fake: RecordingRepository;

beforeEach(() => {
  fake = new RecordingRepository();
  repository.current = fake;
  // Refusal lines are asserted where they matter (criterion 11 below); elsewhere they are noise.
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function mintWith(headers: Record<string, string>): Promise<Response> {
  return POST(
    new NextRequest(`${OWN_ORIGIN}/api/designs`, { method: "POST", headers }),
  );
}

function visitorSetCookieOf(response: Response): string | undefined {
  return response.headers
    .getSetCookie()
    .find((line) => line.startsWith(`${VISITOR_COOKIE_NAME}=`));
}

function visitorValueOf(response: Response): string | undefined {
  const line = visitorSetCookieOf(response);
  return line?.slice(VISITOR_COOKIE_NAME.length + 1).split(";")[0];
}

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/**
 * Mints under a carried cookie value and returns the value the mint actually issued — since M7
 * wave 7E3b (Amendment H1) that is **never** `carriedVisitorValue`: rotation always answers with a
 * fresh one, moving any row `carriedVisitorValue` owned to it. A caller that wants to act as the
 * owner afterwards must present this returned value, the same way a real browser's cookie jar
 * would already hold it from the mint's own `Set-Cookie`.
 */
async function mintOwnDesign(carriedVisitorValue: string): Promise<{
  id: string;
  writeTokenPair: string;
  visitorValue: string;
}> {
  const response = await mintWith({
    "sec-fetch-site": "same-origin",
    cookie: `${VISITOR_COOKIE_NAME}=${carriedVisitorValue}`,
  });
  const { id } = (await response.json()) as { id: string };
  const writeTokenPair =
    response.headers
      .getSetCookie()
      .find((line) => line.startsWith("lemnaria_write_token_"))
      ?.split(";")[0] ?? "";
  return { id, writeTokenPair, visitorValue: visitorValueOf(response) ?? "" };
}

function saveRequest(
  id: string,
  {
    cookie,
    body = JSON.stringify(KITCHEN_L_DESIGN),
  }: { cookie: string; body?: string },
  method: "PUT" | "PATCH" = "PUT",
): NextRequest {
  return new NextRequest(`${OWN_ORIGIN}/api/designs/${id}`, {
    method,
    headers: {
      cookie,
      "content-type": "application/json",
      [EXPECTED_REVISION_HEADER]: FIRST_REVISION,
    },
    body,
  });
}

describe("D6 — Sec-Fetch-Site × Origin, the whole matrix", () => {
  const ORIGINS: Record<string, string | undefined> = {
    foreign: FOREIGN_ORIGIN,
    same: OWN_ORIGIN,
    absent: undefined,
    opaque: "null",
  };
  const SEC_FETCH_SITES = ["cross-site", "same-site", "none", undefined];

  for (const secFetchSite of SEC_FETCH_SITES) {
    for (const [originName, origin] of Object.entries(ORIGINS)) {
      const isRefusalExpected =
        secFetchSite !== undefined ||
        originName === "foreign" ||
        originName === "opaque";
      const label = `Sec-Fetch-Site ${secFetchSite ?? "absent"}, Origin ${originName}`;

      it(`${label}: ${isRefusalExpected ? "403, no cookie, no mint" : "201"}`, async () => {
        const headers: Record<string, string> = {
          cookie: `${VISITOR_COOKIE_NAME}=${KNOWN_VALUE}`,
        };
        if (secFetchSite !== undefined)
          headers["sec-fetch-site"] = secFetchSite;
        if (origin !== undefined) headers.origin = origin;

        const response = await mintWith(headers);

        if (isRefusalExpected) {
          expect(response.status).toBe(403);
          expect(response.headers.getSetCookie()).toEqual([]);
          expect(fake.mints).toHaveLength(0);
        } else {
          expect(response.status).toBe(201);
          expect(fake.mints).toHaveLength(1);
        }
      });
    }
  }

  it("Sec-Fetch-Site same-origin wins over a foreign Origin (the browser's header cannot be forged by a page)", async () => {
    const response = await mintWith({
      "sec-fetch-site": "same-origin",
      origin: FOREIGN_ORIGIN,
    });

    expect(response.status).toBe(201);
  });

  it("Sec-Fetch-Site is compared exactly — an upper-cased Same-Origin is refused, not normalised", async () => {
    const upper = await mintWith({ "sec-fetch-site": "Same-Origin" });

    expect(upper.status).toBe(403);
    expect(fake.mints).toHaveLength(0);
  });

  it("the 403 body names no reason and no cookie value", async () => {
    const response = await mintWith({
      "sec-fetch-site": "cross-site",
      cookie: `${VISITOR_COOKIE_NAME}=${KNOWN_VALUE}`,
    });

    const body = await response.text();
    expect(body).not.toContain(KNOWN_VALUE);
    expect(body).not.toContain("CROSS_SITE");
  });
});

describe("mint — carried-value boundaries (D1)", () => {
  // M7 wave 7E3b, Amendment H1 — inverted from "reuses ... " (G10 in the 7E3b plan's sweep): a
  // well-formed 43-character carried value is now the value rotation moves rows *away* from, never
  // the one re-emitted.
  it("rotates away from exactly a 43-character value made of the whole base64url alphabet's edge characters", async () => {
    const response = await mintWith({
      "sec-fetch-site": "same-origin",
      cookie: `${VISITOR_COOKIE_NAME}=${KNOWN_VALUE}`,
    });

    const minted = visitorValueOf(response);
    expect(minted).toMatch(WELL_FORMED);
    expect(minted).not.toBe(KNOWN_VALUE);
    expect(fake.mints[0]?.visitor).toEqual({
      kind: "rotate",
      visitorHash: sha256Hex(minted ?? ""),
      fromVisitorHash: sha256Hex(KNOWN_VALUE),
    });
  });

  const MALFORMED = [
    { name: "43 chars with standard-base64 '+'", value: `${"a".repeat(42)}+` },
    { name: "43 chars with '/'", value: `${"a".repeat(42)}/` },
    { name: "42 chars plus '=' padding", value: `${"a".repeat(42)}=` },
    {
      name: "a double-quoted 43-character value",
      value: `"${"a".repeat(43)}"`,
    },
    { name: "a non-ASCII letter", value: `${"a".repeat(42)}é` },
    { name: "the bare name with no '='", value: undefined },
  ];

  it.each(MALFORMED)(
    "replaces a malformed carried value ($name)",
    async ({ value }) => {
      const cookie =
        value === undefined
          ? VISITOR_COOKIE_NAME
          : `${VISITOR_COOKIE_NAME}=${value}`;

      const response = await mintWith({
        "sec-fetch-site": "same-origin",
        cookie,
      });

      const minted = visitorValueOf(response) ?? "";
      expect(minted).toMatch(WELL_FORMED);
      expect(minted).not.toBe(value);
      // Nothing well-formed was carried, so there is nothing to rotate from (Amendment H1).
      expect(fake.mints[0]?.visitor).toEqual({
        kind: "fresh",
        visitorHash: sha256Hex(minted),
      });
    },
  );

  it("ignores a planted cookie of the un-prefixed name `lemnaria_visitor` — it is never adopted", async () => {
    const response = await mintWith({
      "sec-fetch-site": "same-origin",
      cookie: `lemnaria_visitor=${KNOWN_VALUE}`,
    });

    const minted = visitorValueOf(response);
    expect(minted).toMatch(WELL_FORMED);
    expect(minted).not.toBe(KNOWN_VALUE);
    expect(fake.mints[0]?.visitor.kind).toBe("fresh");
    expect(fake.mints[0]?.visitor.visitorHash).not.toBe(sha256Hex(KNOWN_VALUE));
  });

  it("ignores a case-variant prefix `__host-lemnaria_visitor`", async () => {
    const response = await mintWith({
      "sec-fetch-site": "same-origin",
      cookie: `__host-lemnaria_visitor=${KNOWN_VALUE}`,
    });

    expect(visitorValueOf(response)).not.toBe(KNOWN_VALUE);
  });

  it("emits exactly one visitor Set-Cookie even when the request carried the pair twice", async () => {
    const other = "Z".repeat(43);
    const response = await mintWith({
      "sec-fetch-site": "same-origin",
      cookie: `${VISITOR_COOKIE_NAME}=${KNOWN_VALUE}; ${VISITOR_COOKIE_NAME}=${other}`,
    });

    const lines = response.headers
      .getSetCookie()
      .filter((line) => line.startsWith(`${VISITOR_COOKIE_NAME}=`));
    expect(lines).toHaveLength(1);
    expect(fake.mints[0]?.visitor.visitorHash).toBe(
      sha256Hex(visitorValueOf(response) ?? ""),
    );
  });

  it("a mint the repository refuses sets no cookie at all (it throws before any response exists)", async () => {
    fake.failMintWith = new Error("connection reset");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(mintWith({ "sec-fetch-site": "same-origin" })).rejects.toThrow(
      "connection reset",
    );
  });
});

describe("save refresh (D1) — never on a failure, never a mint", () => {
  it("a successful PATCH re-emits the request's own value with a fresh Max-Age", async () => {
    // The mint rotated away from KNOWN_VALUE (Amendment H1); `visitorValue` is what the browser's
    // jar now holds and so what a genuine follow-up request carries and owns.
    const { id, writeTokenPair, visitorValue } =
      await mintOwnDesign(KNOWN_VALUE);

    const response = await PATCH(
      saveRequest(
        id,
        { cookie: `${writeTokenPair}; ${VISITOR_COOKIE_NAME}=${visitorValue}` },
        "PATCH",
      ),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    const line = visitorSetCookieOf(response) ?? "";
    expect(visitorValueOf(response)).toBe(visitorValue);
    expect(line).toMatch(/Max-Age=2592000/);
    expect(line).toMatch(/Secure/);
    expect(line).toMatch(/HttpOnly/);
    expect(line).toMatch(/Path=\//);
    expect(line).not.toMatch(/Domain=/i);
  });

  it("a successful PATCH carrying the value rotated away from gets no refresh (Amendment H3)", async () => {
    const { id, writeTokenPair } = await mintOwnDesign(KNOWN_VALUE);

    const response = await PATCH(
      saveRequest(
        id,
        { cookie: `${writeTokenPair}; ${VISITOR_COOKIE_NAME}=${KNOWN_VALUE}` },
        "PATCH",
      ),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(visitorSetCookieOf(response)).toBeUndefined();
  });

  it("a successful save carrying a malformed visitor value emits no visitor cookie", async () => {
    const { id, writeTokenPair } = await mintOwnDesign(KNOWN_VALUE);

    const response = await PUT(
      saveRequest(id, {
        cookie: `${writeTokenPair}; ${VISITOR_COOKIE_NAME}=short`,
      }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(visitorSetCookieOf(response)).toBeUndefined();
  });

  it("a successful save never mints — a save with a planted un-prefixed name emits none", async () => {
    const { id, writeTokenPair } = await mintOwnDesign(KNOWN_VALUE);

    const response = await PUT(
      saveRequest(id, {
        cookie: `${writeTokenPair}; lemnaria_visitor=${KNOWN_VALUE}`,
      }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(visitorSetCookieOf(response)).toBeUndefined();
  });

  it("a failed save (413: oversized body) carries no visitor cookie", async () => {
    const { id, writeTokenPair } = await mintOwnDesign(KNOWN_VALUE);

    const response = await PUT(
      saveRequest(id, {
        cookie: `${writeTokenPair}; ${VISITOR_COOKIE_NAME}=${KNOWN_VALUE}`,
        body: JSON.stringify({ junk: "y".repeat(MAX_DESIGN_BYTES) }),
      }),
      routeParams(id),
    );

    expect(response.status).toBe(413);
    expect(visitorSetCookieOf(response)).toBeUndefined();
  });

  it("a failed save (500: the driver throws) carries no visitor cookie and logs neither value nor hash", async () => {
    const { id, writeTokenPair } = await mintOwnDesign(KNOWN_VALUE);
    fake.failSaveWith = Object.assign(new Error("terminating connection"), {
      name: "NeonDbError",
      code: "57P01",
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // The route rethrows a non-domain error (the platform renders its own 500), so there is no
    // response object that could carry a Set-Cookie at all.
    await expect(
      PUT(
        saveRequest(id, {
          cookie: `${writeTokenPair}; ${VISITOR_COOKIE_NAME}=${KNOWN_VALUE}`,
        }),
        routeParams(id),
      ),
    ).rejects.toThrow("terminating connection");
    const logged = JSON.stringify([...error.mock.calls, ...warn.mock.calls]);
    expect(error).toHaveBeenCalled();
    expect(logged).not.toContain(KNOWN_VALUE);
    expect(logged).not.toContain(sha256Hex(KNOWN_VALUE));
  });

  it("a PUT carrying the matching visitor cookie but no write token is 403 and saves nothing (criterion 9)", async () => {
    const { id } = await mintOwnDesign(KNOWN_VALUE);

    const response = await PUT(
      saveRequest(id, { cookie: `${VISITOR_COOKIE_NAME}=${KNOWN_VALUE}` }),
      routeParams(id),
    );
    const read = await GET(
      new NextRequest(`${OWN_ORIGIN}/api/designs/${id}`),
      routeParams(id),
    );

    expect(response.status).toBe(403);
    expect(visitorSetCookieOf(response)).toBeUndefined();
    expect(((await read.json()) as { revision: string }).revision).toBe(
      FIRST_REVISION,
    );
  });

  it("GET of a foreign design carrying a visitor cookie never sets or changes it", async () => {
    const { id } = await mintOwnDesign(KNOWN_VALUE);

    const response = await GET(
      new NextRequest(`${OWN_ORIGIN}/api/designs/${id}`, {
        headers: { cookie: `${VISITOR_COOKIE_NAME}=${"Q".repeat(43)}` },
      }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});

describe("criterion 11 — the mint's failure and refusal lines carry neither the visitor value nor its hash", () => {
  it("a driver failure on mint, with a well-formed carried cookie", async () => {
    fake.failMintWith = Object.assign(new Error("connection reset"), {
      code: "08006",
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      mintWith({
        "sec-fetch-site": "same-origin",
        cookie: `${VISITOR_COOKIE_NAME}=${KNOWN_VALUE}`,
      }),
    ).rejects.toThrow();

    const logged = JSON.stringify(error.mock.calls);
    expect(error).toHaveBeenCalledOnce();
    expect(logged).not.toContain(KNOWN_VALUE);
    expect(logged).not.toContain(sha256Hex(KNOWN_VALUE));
  });

  it("a D6 refusal, with a well-formed carried cookie", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await mintWith({
      "sec-fetch-site": "cross-site",
      cookie: `${VISITOR_COOKIE_NAME}=${KNOWN_VALUE}`,
    });

    const logged = JSON.stringify(warn.mock.calls);
    expect(warn).toHaveBeenCalledOnce();
    expect(logged).toContain("CROSS_SITE_MINT_REFUSED");
    expect(logged).not.toContain(KNOWN_VALUE);
    expect(logged).not.toContain(sha256Hex(KNOWN_VALUE));
  });
});
