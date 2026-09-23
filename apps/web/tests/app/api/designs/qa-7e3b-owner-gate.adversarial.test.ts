import { createHash } from "node:crypto";

import {
  InvalidDesignError,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import {
  DesignWriteConflictError,
  DesignWriteForbiddenError,
} from "@lemnaria/persistence";
import type {
  AuthorizedSave,
  LoadOwnedOutcome,
  MintDesign,
  MintOutcome,
  OwnedDesignLookup,
  SaveOutcome,
} from "@lemnaria/persistence";
import { fc, test as propertyTest } from "@fast-check/vitest";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { designNotFoundResponse } from "../../../../src/lib/server/design-errors";
import { flattenLogArguments } from "../../../support/console-log-line";
import { storedVisitorHashFor } from "../../../support/mint-visitor-hash";

/**
 * M7 wave 7E3b adversarial QA at the route boundary — criterion 2 (one refusal, as a property over
 * refusal cases x ids), criterion 10 (the save refresh decided by ownership alone, from one
 * statement), criterion 11 (no value or hash in any log line; a refusal logs nothing), and the
 * rotation's cookie contract across a sequence of mints.
 *
 * The double below models what the Neon repository promises rather than what the route happens to
 * need: a mint carrying `rotate` moves every row under the old hash, `loadOwned` compares id and
 * hash together, a `null` owner matches nothing, and `InvalidDesignError` is raised only for a row
 * the caller owns (Amendment H2).
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const OWN_ORIGIN = "https://lemnaria.test";
const FIRST_REVISION = "1";
const WELL_FORMED = /^[A-Za-z0-9_-]{43}$/;
const BASE64URL = Array.from(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
);

interface Row {
  design: Design;
  writeTokenHash: string;
  visitorHash: string | null;
  revision: string;
  isDocumentInvalid: boolean;
}

class RotatingRepository {
  readonly calls: string[] = [];
  readonly rows = new Map<DesignId, Row>();
  failWith: Error | undefined = undefined;
  private nextId = 0;

  mint({ design, writeTokenHash, visitor }: MintDesign): Promise<MintOutcome> {
    this.calls.push("mint");
    if (this.failWith !== undefined) return Promise.reject(this.failWith);
    const visitorHash = storedVisitorHashFor(visitor);
    if (visitor.kind === "rotate") {
      for (const row of this.rows.values())
        if (row.visitorHash === visitor.fromVisitorHash)
          row.visitorHash = visitorHash;
    }
    const id = `qa-7e3b-${String(this.nextId++)}`;
    this.rows.set(id, {
      design,
      writeTokenHash,
      visitorHash,
      revision: FIRST_REVISION,
      isDocumentInvalid: false,
    });
    return Promise.resolve({ id, revision: FIRST_REVISION, visitorHash });
  }

  saveAuthorized(save: AuthorizedSave): Promise<SaveOutcome> {
    this.calls.push("saveAuthorized");
    if (this.failWith !== undefined) return Promise.reject(this.failWith);
    const row = this.rows.get(save.id);
    if (!row || row.writeTokenHash !== save.writeTokenHash)
      return Promise.reject(new DesignWriteForbiddenError(save.id));
    if (row.revision !== save.expectedRevision)
      return Promise.reject(new DesignWriteConflictError(save.id));
    row.design = save.design;
    row.revision = String(Number(row.revision) + 1);
    const ownsVisitor =
      save.requestVisitor.kind === "present" &&
      save.requestVisitor.visitorHash === row.visitorHash;
    return Promise.resolve({
      id: save.id,
      revision: row.revision,
      ownsVisitor,
    });
  }

  loadOwned({ id, visitorHash }: OwnedDesignLookup): Promise<LoadOwnedOutcome> {
    this.calls.push("loadOwned");
    if (this.failWith !== undefined) return Promise.reject(this.failWith);
    const row = this.rows.get(id);
    if (row?.visitorHash !== visitorHash)
      return Promise.resolve({ kind: "none" });
    if (row.isDocumentInvalid)
      return Promise.reject(
        new InvalidDesignError("stored document is invalid"),
      );
    return Promise.resolve({
      kind: "found",
      design: row.design,
      revision: row.revision,
    });
  }

  resumeVisitor(): Promise<never> {
    this.calls.push("resumeVisitor");
    return Promise.reject(new Error("resume is not part of these routes"));
  }

  seedRow(id: DesignId, row: Partial<Row>): void {
    this.rows.set(id, {
      design: KITCHEN_L_DESIGN,
      writeTokenHash: "0".repeat(64),
      visitorHash: null,
      revision: FIRST_REVISION,
      isDocumentInvalid: false,
      ...row,
    });
  }
}

const repository = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repository.current,
}));

const { POST } = await import("../../../../src/app/api/designs/route");
const { GET, PUT } = await import("../../../../src/app/api/designs/[id]/route");

let fake: RotatingRepository;

beforeEach(() => {
  fake = new RotatingRepository();
  repository.current = fake;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function readRequest(id: string, cookie: string | undefined): NextRequest {
  const url = `${OWN_ORIGIN}/api/designs/${encodeURIComponent(id)}`;
  return cookie === undefined
    ? new NextRequest(url)
    : new NextRequest(url, { headers: { cookie } });
}

function visitorValueOf(response: Response): string | undefined {
  const line = response.headers
    .getSetCookie()
    .find((entry) => entry.startsWith(`${VISITOR_COOKIE_NAME}=`));
  return line?.slice(VISITOR_COOKIE_NAME.length + 1).split(";")[0];
}

function writeTokenPairOf(response: Response): string {
  return (
    response.headers
      .getSetCookie()
      .find((entry) => entry.startsWith("lemnaria_write_token_"))
      ?.split(";")[0] ?? ""
  );
}

function headersExceptDate(response: Response): [string, string][] {
  return [...response.headers.entries()].filter(([name]) => name !== "date");
}

/** A browser that follows `Set-Cookie` for the visitor value, exactly as a jar would. */
async function mintFrom(carried: string | undefined): Promise<{
  id: string;
  value: string;
  writeTokenPair: string;
}> {
  const headers: Record<string, string> = { "sec-fetch-site": "same-origin" };
  if (carried !== undefined)
    headers.cookie = `${VISITOR_COOKIE_NAME}=${carried}`;
  const response = await POST(
    new NextRequest(`${OWN_ORIGIN}/api/designs`, { method: "POST", headers }),
  );
  expect(response.status).toBe(201);
  const { id } = (await response.json()) as { id: string };
  return {
    id,
    value: visitorValueOf(response) ?? "",
    writeTokenPair: writeTokenPairOf(response),
  };
}

const wellFormedValue = fc
  .array(fc.constantFrom(...BASE64URL), { minLength: 43, maxLength: 43 })
  .map((chars) => chars.join(""));

/** Cookie-safe values the gate must treat as "no identity": the wrong length, or 43 characters
 *  with one outside the base64url alphabet. */
const malformedValue = fc.oneof(
  fc
    .array(fc.constantFrom(...BASE64URL), { minLength: 1, maxLength: 80 })
    .map((chars) => chars.join(""))
    .filter((value) => value.length !== 43),
  fc
    .tuple(
      fc.array(fc.constantFrom(...BASE64URL), { minLength: 42, maxLength: 42 }),
      fc.constantFrom(".", "+", "/", "=", "~", "!"),
      fc.nat({ max: 42 }),
    )
    .map(([chars, bad, at]) => {
      chars.splice(at, 0, bad);
      return chars.join("");
    }),
);

const designIdLike = fc.oneof(
  fc.stringMatching(/^[A-Za-z0-9_-]{1,40}$/),
  fc.string({ minLength: 1, maxLength: 40 }),
);

type RefusalCase =
  | { readonly kind: "no-cookie" }
  | { readonly kind: "empty" }
  | { readonly kind: "case-variant-name"; readonly value: string }
  | { readonly kind: "malformed"; readonly value: string }
  | { readonly kind: "foreign"; readonly value: string }
  | { readonly kind: "unknown-id"; readonly value: string }
  | { readonly kind: "null-owner"; readonly value: string };

const refusalCase: fc.Arbitrary<RefusalCase> = fc.oneof(
  fc.constant({ kind: "no-cookie" } as const),
  fc.constant({ kind: "empty" } as const),
  wellFormedValue.map(
    (value) => ({ kind: "case-variant-name", value }) as const,
  ),
  malformedValue.map((value) => ({ kind: "malformed", value }) as const),
  wellFormedValue.map((value) => ({ kind: "foreign", value }) as const),
  wellFormedValue.map((value) => ({ kind: "unknown-id", value }) as const),
  wellFormedValue.map((value) => ({ kind: "null-owner", value }) as const),
);

/** Seeds the row the case is about and answers the cookie header it arrives with. */
function arrangeRefusal(testCase: RefusalCase, id: string): string | undefined {
  const ownerHash = sha256Hex("owner".padEnd(43, "o"));
  switch (testCase.kind) {
    case "no-cookie":
      fake.seedRow(id, { visitorHash: ownerHash });
      return undefined;
    case "empty":
      fake.seedRow(id, { visitorHash: ownerHash });
      return `${VISITOR_COOKIE_NAME}=`;
    case "case-variant-name":
      fake.seedRow(id, { visitorHash: sha256Hex(testCase.value) });
      return `__host-lemnaria_visitor=${testCase.value}`;
    case "malformed":
      fake.seedRow(id, { visitorHash: ownerHash });
      return `${VISITOR_COOKIE_NAME}=${testCase.value}`;
    case "foreign":
      // An invalid document under someone else's hash: a stranger must never reach the migrator.
      fake.seedRow(id, { visitorHash: ownerHash, isDocumentInvalid: true });
      return `${VISITOR_COOKIE_NAME}=${testCase.value}`;
    case "unknown-id":
      return `${VISITOR_COOKIE_NAME}=${testCase.value}`;
    case "null-owner":
      fake.seedRow(id, { visitorHash: null });
      return `${VISITOR_COOKIE_NAME}=${testCase.value}`;
  }
}

const REPOSITORY_FREE_CASES = new Set<RefusalCase["kind"]>([
  "no-cookie",
  "empty",
  "case-variant-name",
  "malformed",
]);

describe("criterion 2 — one refusal across every refusal case (GET /api/designs/{id})", () => {
  propertyTest.prop([refusalCase, designIdLike], { numRuns: 300 })(
    "404, the designNotFoundResponse bytes, its headers bar Date, no Set-Cookie, and no query without a well-formed cookie",
    async (testCase, id) => {
      fake = new RotatingRepository();
      repository.current = fake;
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const error = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const cookie = arrangeRefusal(testCase, id);

      const response = await GET(readRequest(id, cookie), routeParams(id));
      const reference = designNotFoundResponse(id);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe(await reference.text());
      expect(headersExceptDate(response)).toEqual(headersExceptDate(reference));
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("vary")).toBe("Cookie");
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(fake.calls).toEqual(
        REPOSITORY_FREE_CASES.has(testCase.kind) ? [] : ["loadOwned"],
      );
      // A refusal is not an error: nothing is logged for it (criterion 11).
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      warn.mockRestore();
      error.mockRestore();
    },
  );

  it("the owner still reads the design — the positive control the property's refusals are measured against", async () => {
    const minted = await mintFrom(undefined);

    const response = await GET(
      readRequest(
        minted.id,
        `${minted.writeTokenPair}; ${VISITOR_COOKIE_NAME}=${minted.value}`,
      ),
      routeParams(minted.id),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: minted.id,
      canWrite: true,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("the owner of a row whose document is invalid gets 500 DESIGN_UNREADABLE; a stranger gets the plain refusal", async () => {
    const ownerValue = "O".repeat(43);
    fake.seedRow("invalid-row", {
      visitorHash: sha256Hex(ownerValue),
      isDocumentInvalid: true,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const owner = await GET(
      readRequest("invalid-row", `${VISITOR_COOKIE_NAME}=${ownerValue}`),
      routeParams("invalid-row"),
    );
    const stranger = await GET(
      readRequest("invalid-row", `${VISITOR_COOKIE_NAME}=${"S".repeat(43)}`),
      routeParams("invalid-row"),
    );

    expect(owner.status).toBe(500);
    expect(stranger.status).toBe(404);
    expect(await stranger.text()).toBe(
      await designNotFoundResponse("invalid-row").text(),
    );
  });
});

describe("rotation at the API — a sequence of mints in one browser (criterion 5, route half)", () => {
  propertyTest.prop([fc.integer({ min: 1, max: 5 }), fc.boolean()], {
    numRuns: 50,
  })(
    "every mint issues a never-seen value, every earlier row follows it, and no earlier value reads anything",
    async (mintCount, startsWithPlantedValue) => {
      fake = new RotatingRepository();
      repository.current = fake;
      const planted = startsWithPlantedValue ? "P".repeat(43) : undefined;
      const seen = new Set<string>(planted === undefined ? [] : [planted]);
      const ids: string[] = [];
      let jar = planted;

      for (let k = 0; k < mintCount; k++) {
        const minted = await mintFrom(jar);
        expect(minted.value).toMatch(WELL_FORMED);
        expect(seen.has(minted.value)).toBe(false);
        seen.add(minted.value);
        ids.push(minted.id);
        jar = minted.value;

        for (const id of ids)
          expect(fake.rows.get(id)?.visitorHash).toBe(sha256Hex(minted.value));
      }

      for (const earlier of seen) {
        if (earlier === jar) continue;
        for (const id of ids) {
          const read = await GET(
            readRequest(id, `${VISITOR_COOKIE_NAME}=${earlier}`),
            routeParams(id),
          );
          expect(read.status).toBe(404);
        }
      }
      for (const id of ids) {
        const read = await GET(
          readRequest(id, `${VISITOR_COOKIE_NAME}=${jar ?? ""}`),
          routeParams(id),
        );
        expect(read.status).toBe(200);
      }
    },
  );
});

describe("criterion 10 — the save refresh is decided by ownership, from one repository call", () => {
  type SaveCookie =
    | "owning"
    | "rotated-away"
    | "foreign"
    | "absent"
    | "malformed";

  async function saveWith(kind: SaveCookie): Promise<{
    response: Response;
    owningValue: string;
    callsDuringSave: string[];
  }> {
    const first = await mintFrom(undefined);
    const second = await mintFrom(first.value);
    const cookieValue: Record<SaveCookie, string | undefined> = {
      owning: second.value,
      "rotated-away": first.value,
      foreign: "F".repeat(43),
      absent: undefined,
      malformed: "short",
    };
    const value = cookieValue[kind];
    const cookie =
      value === undefined
        ? first.writeTokenPair
        : `${first.writeTokenPair}; ${VISITOR_COOKIE_NAME}=${value}`;
    const callsBefore = fake.calls.length;
    const response = await PUT(
      new NextRequest(`${OWN_ORIGIN}/api/designs/${first.id}`, {
        method: "PUT",
        headers: {
          cookie,
          "content-type": "application/json",
          "x-expected-revision": FIRST_REVISION,
        },
        body: JSON.stringify(KITCHEN_L_DESIGN),
      }),
      routeParams(first.id),
    );
    return {
      response,
      owningValue: second.value,
      callsDuringSave: fake.calls.slice(callsBefore),
    };
  }

  for (const kind of [
    "owning",
    "rotated-away",
    "foreign",
    "absent",
    "malformed",
  ] as const) {
    it(`${kind}: the save lands on the write token alone, with one repository call, and re-emits the visitor value only when it owns the row`, async () => {
      const { response, owningValue, callsDuringSave } = await saveWith(kind);

      expect(response.status).toBe(200);
      expect(callsDuringSave).toEqual(["saveAuthorized"]);
      expect(writeTokenPairOf(response)).not.toBe("");
      expect(visitorValueOf(response)).toBe(
        kind === "owning" ? owningValue : undefined,
      );
    });
  }
});

describe("criterion 11 — no value or hash in any log line", () => {
  function captureConsole(): unknown[][] {
    const lines: unknown[][] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const)
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args);
      });
    return lines;
  }

  it("a forced gate failure, rotation failure and save failure log neither the value nor its hash", async () => {
    const minted = await mintFrom(undefined);
    const carried = minted.value;
    const secrets = [carried, sha256Hex(carried)];
    const lines = captureConsole();
    fake.failWith = new Error("connection reset by peer");

    await expect(
      GET(
        readRequest(minted.id, `${VISITOR_COOKIE_NAME}=${carried}`),
        routeParams(minted.id),
      ),
    ).rejects.toThrow("connection reset by peer");
    await expect(
      POST(
        new NextRequest(`${OWN_ORIGIN}/api/designs`, {
          method: "POST",
          headers: {
            "sec-fetch-site": "same-origin",
            cookie: `${VISITOR_COOKIE_NAME}=${carried}`,
          },
        }),
      ),
    ).rejects.toThrow("connection reset by peer");
    await expect(
      PUT(
        new NextRequest(`${OWN_ORIGIN}/api/designs/${minted.id}`, {
          method: "PUT",
          headers: {
            cookie: `${minted.writeTokenPair}; ${VISITOR_COOKIE_NAME}=${carried}`,
            "content-type": "application/json",
            "x-expected-revision": FIRST_REVISION,
          },
          body: JSON.stringify(KITCHEN_L_DESIGN),
        }),
        routeParams(minted.id),
      ),
    ).rejects.toThrow("connection reset by peer");

    expect(lines.length).toBeGreaterThanOrEqual(3);
    const logged = lines.map(flattenLogArguments).join("\n");
    for (const secret of secrets) expect(logged).not.toContain(secret);
  });
});
