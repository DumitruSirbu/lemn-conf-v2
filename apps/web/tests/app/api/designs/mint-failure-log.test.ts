import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type {
  AuthorizedConfigurationRepository,
  MintOutcome,
  SaveOutcome,
  MintDesign,
  StoredDesign,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { storedVisitorHashFor } from "../../../support/mint-visitor-hash";

/**
 * `POST /api/designs` had no `try`/`catch` at all, so a driver failure on **mint** — the operation
 * the 2026-09-07 outage was failing on — reached Next as an unlabelled 500 with a digest and nothing
 * else (ADR 0096, Consequences). These are assertions over what the *logger* was handed, never over
 * a rendered response, because the invariant is a pair: the log gains detail and the client does not
 * (ADR 0014 finding S2).
 */

/** The credential the route mints. Fixed here so the line can be searched for it: if anyone ever
 *  puts the token or its hash on a log line, these values are what would appear. */
const SECRET_TOKEN = "mint-test-write-token-value";
const SECRET_HASH = "mint-test-write-token-hash";

vi.mock("@/lib/server/write-token", () => ({
  mintWriteToken: () => ({ token: SECRET_TOKEN, hash: SECRET_HASH }),
  setWriteTokenCookie: () => undefined,
}));

const repository = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repository.current,
}));

const { POST } = await import("../../../../src/app/api/designs/route");

/** A same-origin mint, the shape every legitimate caller sends (D6). Built fresh per call so no
 *  two tests share one request's already-read body stream. */
function mintRequest(): NextRequest {
  return new NextRequest("https://lemnaria.test/api/designs", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
}

/** A repository whose `mint` fails the way Neon's driver fails: an `Error` carrying a `name` and a
 *  SQLSTATE. `42703` is the undefined-column code production raised against a `designs` table with
 *  no `revision`. */
class FailingMintRepository implements AuthorizedConfigurationRepository {
  constructor(private readonly failure: unknown) {}

  mint(): Promise<MintOutcome> {
    return Promise.reject(this.failure as Error);
  }

  saveAuthorized(): Promise<SaveOutcome> {
    throw new Error("this fixture is never saved to");
  }

  load(): Promise<StoredDesign> {
    throw new Error("this fixture is never loaded from");
  }
}

class MintingRepository implements AuthorizedConfigurationRepository {
  minted: Design | undefined;

  mint({ design, visitor }: MintDesign): Promise<MintOutcome> {
    this.minted = design;
    return Promise.resolve({
      id: "design-0" as DesignId,
      revision: "1",
      visitorHash: storedVisitorHashFor(visitor),
    });
  }

  saveAuthorized(): Promise<SaveOutcome> {
    throw new Error("this fixture is never saved to");
  }

  load(): Promise<StoredDesign> {
    throw new Error("this fixture is never loaded from");
  }
}

function driverError(message: string, code = "42703"): Error {
  return Object.assign(new Error(message), { name: "NeonDbError", code });
}

function loggedLine(
  spy: ReturnType<typeof vi.spyOn>,
): Record<string, unknown> | undefined {
  return spy.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

// Without this, `vi.spyOn` on an already-spied console method hands back the same mock and one test
// reads the previous test's first call.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/designs, when the driver fails", () => {
  beforeEach(() => {
    repository.current = new FailingMintRepository(
      driverError('column "revision" does not exist'),
    );
  });

  it("still rethrows, so the platform's own 500 and its digest are unchanged", async () => {
    // The point of the change is a line, not a different answer. Mapping mint to a JSON error would
    // be a contract change: this route answers 201 or nothing.
    await expect(POST(mintRequest())).rejects.toThrow(
      'column "revision" does not exist',
    );
  });

  it("names the operation, the error and its SQLSTATE", async () => {
    await expect(POST(mintRequest())).rejects.toThrow();

    expect(loggedLine(errorSpy)).toEqual({
      event: "design-operation-failed",
      operation: "mint",
      errorName: "NeonDbError",
      errorCode: "42703",
      reason: 'column "revision" does not exist',
    });
  });

  it("calls mint something other than save, so a log filter can tell them apart", async () => {
    await expect(POST(mintRequest())).rejects.toThrow();

    expect(loggedLine(errorSpy)?.operation).toBe("mint");
  });
});

describe("ADR 0014 S2 — the line carries no secret and no document", () => {
  it("writes neither the write token nor its hash", async () => {
    repository.current = new FailingMintRepository(driverError("boom"));

    await expect(POST(mintRequest())).rejects.toThrow();

    // Serialised whole rather than field by field, so a future field added beside `reason` is
    // covered by this test on the day it is added rather than the day someone remembers it.
    const serialised = JSON.stringify(loggedLine(errorSpy));
    expect(serialised).not.toContain(SECRET_TOKEN);
    expect(serialised).not.toContain(SECRET_HASH);
  });

  it("writes nothing of the design it was minting", async () => {
    repository.current = new FailingMintRepository(driverError("boom"));

    await expect(POST(mintRequest())).rejects.toThrow();

    // The document is excluded *structurally* — the logger is handed the operation and the thrown
    // value and nothing else — so the falsifiable form of that claim is the line's own key set.
    // Any field carrying design content would have to appear here first.
    expect(Object.keys(loggedLine(errorSpy) ?? {}).sort()).toEqual([
      "errorCode",
      "errorName",
      "event",
      "operation",
      "reason",
    ]);
    expect(JSON.stringify(loggedLine(errorSpy))).not.toContain(
      KITCHEN_L_DESIGN.presetId,
    );
  });

  it("redacts a connection string rather than trusting it to fall outside the bound", async () => {
    // A driver's connect failure carries the endpoint, and ADR 0008's incident is a credential
    // already printed into a transcript once. Mint is the first call a cold deployment makes, so
    // this is the failure most likely to be a connect failure.
    repository.current = new FailingMintRepository(
      driverError(
        "connect ECONNREFUSED postgresql://app_designs:s3cr3t@ep-x.neon.tech/lemn-conf-v2",
      ),
    );

    await expect(POST(mintRequest())).rejects.toThrow();

    const reason = String(loggedLine(errorSpy)?.reason);
    expect(reason).not.toContain("s3cr3t");
    expect(reason).not.toContain("neon.tech");
    expect(reason).toContain("<redacted url>");
  });

  it("bounds the reason, so one failed mint cannot buy a large log write", async () => {
    repository.current = new FailingMintRepository(
      new Error("x".repeat(500_000)),
    );

    await expect(POST(mintRequest())).rejects.toThrow();

    expect(String(loggedLine(errorSpy)?.reason).length).toBeLessThan(400);
  });
});

describe("POST /api/designs, when the driver answers", () => {
  it("mints the seeded design and logs nothing at all", async () => {
    const fake = new MintingRepository();
    repository.current = fake;
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const response = await POST(mintRequest());

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "design-0", revision: "1" });
    expect(fake.minted).toEqual(KITCHEN_L_DESIGN);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("ignores a hostile request body and still mints the seed", async () => {
    const fake = new MintingRepository();
    repository.current = fake;
    const hostile = new NextRequest("https://lemnaria.test/api/designs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({
        ...KITCHEN_L_DESIGN,
        presetId: "attacker-selected-recipe",
        room: {
          ...KITCHEN_L_DESIGN.room,
          widthMm: 999_999,
        },
      }),
    });

    const response = await POST(hostile);

    expect(response.status).toBe(201);
    expect(fake.minted).toEqual(KITCHEN_L_DESIGN);
    expect(fake.minted?.presetId).toBe(KITCHEN_L_DESIGN.presetId);
    expect(fake.minted?.room).toEqual(KITCHEN_L_DESIGN.room);
  });
});
