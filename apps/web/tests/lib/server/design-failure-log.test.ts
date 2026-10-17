import { InvalidDesignError } from "@lemnaria/configurator-domain";
import { DesignWriteConflictError } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  designErrorResponse,
  revisionRequiredResponse,
  writeConflictResponse,
  writeForbiddenResponse,
} from "../../../src/lib/server/design-errors";

/**
 * The diagnosis seam (ADR 0096, Consequences): a driver failure must name itself in the log, and
 * every refusal must be countable — several of the 2026-09-07 candidate causes answer 403, 409 or
 * 400 and throw nothing, so an error tracker alone would see none of them.
 *
 * Every assertion below is over what the logger was handed, never over a rendered string, because
 * the invariant being protected is a *pair*: the log gains detail and the response does not
 * (ADR 0014 finding S2).
 */

/** A `NeonDbError` as this application meets one: a driver error carrying the SQLSTATE. `42703` is
 *  the undefined-column code production actually raised against a `designs` table with no
 *  `revision`. */
function driverError(message: string, code = "42703"): Error {
  return Object.assign(new Error(message), { name: "NeonDbError", code });
}

function loggedLine(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  return spy.mock.calls[0]?.[1] as Record<string, unknown>;
}

// Without this, `vi.spyOn` on an already-spied console method hands back the same mock, and one
// test reads the previous test's first call.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("designErrorResponse, on an error with no domain meaning", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("still rethrows, so the platform's own 500 is unchanged", () => {
    const failure = driverError('column "revision" does not exist');

    expect(() => designErrorResponse("save", failure)).toThrow(failure);
  });

  it("names the operation, the error and its SQLSTATE", () => {
    // The line this incident did not have. With it, "why is production not saving?" is answered by
    // a log search instead of by a query against the production database.
    expect(() =>
      designErrorResponse(
        "save",
        driverError('column "revision" does not exist'),
      ),
    ).toThrow();

    expect(loggedLine(errorSpy)).toEqual({
      event: "design-operation-failed",
      operation: "save",
      errorName: "NeonDbError",
      errorCode: "42703",
      reason: 'column "revision" does not exist',
    });
  });

  it("bounds the reason, so one failure cannot buy a large log write", () => {
    expect(() =>
      designErrorResponse("save", new Error("x".repeat(500_000))),
    ).toThrow();

    expect(String(loggedLine(errorSpy).reason).length).toBeLessThan(400);
  });

  it("redacts a connection string rather than trusting it to fall outside the bound", () => {
    // A driver's connect failure carries the endpoint, and ADR 0008's incident is a credential
    // already printed into a transcript once.
    expect(() =>
      designErrorResponse(
        "save",
        driverError(
          "connect ECONNREFUSED postgresql://app_designs:s3cr3t@ep-x.neon.tech/lemn-conf-v2",
        ),
      ),
    ).toThrow();

    const reason = String(loggedLine(errorSpy).reason);
    expect(reason).not.toContain("s3cr3t");
    expect(reason).not.toContain("neon.tech");
    expect(reason).toContain("<redacted url>");
  });

  it("logs nothing after a connection string begins, even when the credential holds a line break", () => {
    expect(() =>
      designErrorResponse(
        "save",
        driverError(
          "Headers.append: postgresql://FAKEUSER:FAKEPASS\nWORDTAIL@h.invalid/lemn-conf-v2?sslmode=require is an invalid header value",
        ),
      ),
    ).toThrow();

    const reason = String(loggedLine(errorSpy).reason);
    expect(reason).toBe("Headers.append: <redacted url>");
    expect(reason).not.toContain("WORDTAIL");
    expect(reason).not.toContain("h.invalid");
  });

  it("keeps the text before a connection string, so the line still says what failed", () => {
    expect(() =>
      designErrorResponse(
        "save",
        driverError("connect ECONNREFUSED postgresql://u:p@h.invalid/db"),
      ),
    ).toThrow();

    expect(String(loggedLine(errorSpy).reason)).toBe(
      "connect ECONNREFUSED <redacted url>",
    );
  });

  it("strips control characters, so a failure cannot forge a log line", () => {
    expect(() =>
      designErrorResponse("save", new Error("a\n[designs] all clear\r\nb")),
    ).toThrow();

    const reason = String(loggedLine(errorSpy).reason);
    expect(reason).not.toContain("\n");
    expect(reason).not.toContain("\r");
  });

  it("reports a thrown non-Error without inventing fields for it", () => {
    expect(() => designErrorResponse("save", "not an error")).toThrow();

    expect(loggedLine(errorSpy)).toMatchObject({
      errorName: "string",
      errorCode: "unavailable",
      reason: "unavailable",
    });
  });
});

describe("a stored row that would not validate on the way out", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reaches the log as a structured line, not as a second string argument", () => {
    // The straggler this test exists for: `designUnreadableResponse` logged past
    // `emitDesignLogLine`, so an error tracker dropped behind that one function would have seen
    // every designs-route line except this one — while the source read as logged as its neighbours.
    designErrorResponse("load", new InvalidDesignError("room: invalid_type"));

    expect(errorSpy).toHaveBeenCalledWith("[designs]", {
      event: "design-row-unreadable",
      operation: "load",
      reason: "Design payload failed validation: room: invalid_type",
    });
  });

  it("names the operation it was reached from, rather than assuming a load", () => {
    // `designErrorResponse` maps this failure on both of its paths, and `operation` is the field a
    // log search filters on.
    designErrorResponse("save", new InvalidDesignError("room: invalid_type"));

    expect(loggedLine(errorSpy).operation).toBe("save");
  });
});

describe("the three refusals", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("records a refused write, which throws nothing an error tracker could see", () => {
    writeForbiddenResponse();

    expect(loggedLine(warnSpy)).toEqual({
      event: "design-operation-refused",
      operation: "save",
      refusalCode: "DESIGN_WRITE_FORBIDDEN",
      status: 403,
    });
  });

  it("records a revision conflict", () => {
    writeConflictResponse();

    expect(loggedLine(warnSpy)).toMatchObject({
      refusalCode: "DESIGN_REVISION_CONFLICT",
      status: 409,
    });
  });

  it("records a save that stated no revision", () => {
    revisionRequiredResponse();

    expect(loggedLine(warnSpy)).toMatchObject({
      refusalCode: "REVISION_REQUIRED",
      status: 400,
    });
  });

  it("records a conflict raised by the repository, through designErrorResponse", () => {
    // The 409 is only ever produced this way, so routing it through the mapper is the real path.
    designErrorResponse("save", new DesignWriteConflictError("design-1"));

    expect(loggedLine(warnSpy)).toMatchObject({ status: 409 });
  });
});

describe("ADR 0014 S2 — the log gains detail and the response does not", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("keeps the write refusal's log-only code out of the body it answers with", async () => {
    const body = JSON.stringify(await writeForbiddenResponse().json());
    const logged = loggedLine(warnSpy) as unknown as { refusalCode: string };

    // Asserted against the value the logger was handed rather than a literal, so the two cannot
    // drift into agreement: whatever this refusal is called in the log, the client never learns it.
    // The 403 carries no code at all on purpose — one answer for every write refusal is what stops
    // this route being an existence oracle for design ids.
    expect(logged.refusalCode).toBe("DESIGN_WRITE_FORBIDDEN");
    expect(body).not.toContain(logged.refusalCode);
    expect(body).toBe(
      JSON.stringify({ error: "Design write not authorized." }),
    );
  });
});

describe("reportDesignFailure, for the share view's read, which anyone can ask with any token", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  /** The once-per-process memory lives as long as its module, so each case reads a module of its own. */
  async function freshReport() {
    vi.resetModules();
    const module = await import("../../../src/lib/server/design-failure-log");
    return module.reportDesignFailure;
  }

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("writes the first failure in full, and nothing for the same error name and code again", async () => {
    const report = await freshReport();

    report("share-read", driverError('relation "a" does not exist', "42P01"));
    report("share-read", driverError('relation "b" does not exist', "42P01"));
    report("share-read", driverError('relation "c" does not exist', "42P01"));

    expect(errorSpy.mock.calls.map((call) => call[1])).toEqual([
      {
        event: "design-operation-failed",
        operation: "share-read",
        errorName: "NeonDbError",
        errorCode: "42P01",
        reason: 'relation "a" does not exist',
      },
    ]);
  });

  it("writes a failure of another code, or another error, as a first line of its own", async () => {
    const report = await freshReport();

    report("share-read", driverError("missing table", "42P01"));
    report("share-read", driverError("permission denied", "42501"));
    report("share-read", new TypeError("fetch failed"));
    report("share-read", driverError("permission denied again", "42501"));

    expect(
      errorSpy.mock.calls.map((call) => {
        const line = call[1] as Record<string, unknown>;
        return `${String(line.errorName)}:${String(line.errorCode)}`;
      }),
    ).toEqual([
      "NeonDbError:42P01",
      "NeonDbError:42501",
      "TypeError:unavailable",
    ]);
  });

  it("still writes every failure of any other operation, as the control for the read's once", async () => {
    const report = await freshReport();

    report("load", driverError("missing table", "42P01"));
    report("load", driverError("missing table", "42P01"));
    report("share-issue", driverError("missing table", "42P01"));

    expect(errorSpy).toHaveBeenCalledTimes(3);
  });
});
