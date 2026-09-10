import { DesignNotFoundError } from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  designErrorResponse,
  writeForbiddenResponse,
} from "../../../src/lib/server/design-errors";

/**
 * Adversarial companion to `design-failure-log.test.ts`.
 *
 * One property, attacked from every side a thrown value can be constructed from: **no substring of
 * a credential reaches the emitted line**. It is asserted over the whole emitted call rather than
 * over the `reason` field, because a leak into `errorName` or `errorCode` would be just as
 * published and a field-scoped assertion would not see it.
 *
 * The second property is that the redaction happens *before* the bound. Truncating a connection
 * string at 300 characters leaves the half that carries the credential, so a test that only feeds
 * short messages proves nothing about the order.
 */

/** Everything the logger was handed, flattened, so an assertion covers the label and every field
 *  rather than one key someone remembered to check. */
function emittedText(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
}

function loggedLine(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  return spy.mock.calls[0]?.[1] as Record<string, unknown>;
}

function driverError(message: string, code: unknown = "42703"): Error {
  return Object.assign(new Error(message), { name: "NeonDbError", code });
}

/** Every emitted field, for an error the mapper has no domain meaning for. */
function emitFailure(error: unknown): void {
  expect(() => designErrorResponse("save", error)).toThrow();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what a credential may never survive", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("redacts every connection string in a message that carries several", () => {
    emitFailure(
      driverError(
        "failover: postgres://app:first-secret@ep-a.neon.tech/db then " +
          "postgres://app:second-secret@ep-b.neon.tech/db",
      ),
    );

    const emitted = emittedText(errorSpy);
    expect(emitted).not.toContain("first-secret");
    expect(emitted).not.toContain("second-secret");
  });

  it("redacts a credential carried in a query parameter rather than in the authority", () => {
    emitFailure(
      driverError(
        "ssl handshake failed for postgresql://ep-x.neon.tech/db?password=s3cr3t&sslmode=require",
      ),
    );

    expect(emittedText(errorSpy)).not.toContain("s3cr3t");
  });

  it("redacts a scheme written in upper case", () => {
    emitFailure(driverError("POSTGRESQL://APP:S3CR3T@EP-X.NEON.TECH/DB"));

    expect(emittedText(errorSpy)).not.toContain("S3CR3T");
  });

  it("redacts a connection string that begins beyond the length bound", () => {
    // The ordering claim, stated as a test. Bound first and this message truncates at 300
    // characters mid-authority, publishing the user and the password and dropping only the host.
    emitFailure(
      driverError(
        `${"filler ".repeat(200)}connect failed: postgres://app:s3cr3t@ep-x.neon.tech/db`,
      ),
    );

    expect(emittedText(errorSpy)).not.toContain("s3cr3t");
    expect(emittedText(errorSpy)).not.toContain("app:");
  });

  it("never reads a cause, so a credential one level down is never published", () => {
    const inner = new Error("postgres://app:s3cr3t@ep-x.neon.tech/db");
    const outer = new Error("save failed", { cause: inner });

    emitFailure(outer);

    expect(emittedText(errorSpy)).not.toContain("s3cr3t");
  });

  it("terminates on a cause chain that points back at itself", () => {
    // A guard against a future change that walks `cause` for a better reason: the chain a driver
    // and a retry wrapper build is not guaranteed acyclic.
    const outer = new Error("outer");
    const inner = new Error("inner", { cause: outer });
    outer.cause = inner;

    emitFailure(outer);

    expect(loggedLine(errorSpy).reason).toBe("outer");
  });

  it("publishes nothing from the members of an AggregateError", () => {
    const aggregate = new AggregateError(
      [new Error("postgres://app:s3cr3t@ep-x.neon.tech/db")],
      "every attempt failed",
    );

    emitFailure(aggregate);

    expect(emittedText(errorSpy)).not.toContain("s3cr3t");
    expect(loggedLine(errorSpy)).toMatchObject({
      errorName: "AggregateError",
      reason: "every attempt failed",
    });
  });

  it("publishes nothing from a thrown object that merely looks like an error", () => {
    emitFailure({
      name: "NeonDbError",
      message: "postgres://app:s3cr3t@ep-x.neon.tech/db",
    });

    const emitted = emittedText(errorSpy);
    expect(emitted).not.toContain("s3cr3t");
    expect(loggedLine(errorSpy).reason).toBe("unavailable");
  });

  it("publishes nothing when the thrown value is a string holding a connection string", () => {
    emitFailure("postgres://app:s3cr3t@ep-x.neon.tech/db");

    expect(emittedText(errorSpy)).not.toContain("s3cr3t");
  });

  // The sweep the fixed examples above cannot give: a credential of any shape, at any offset, in a
  // message of any length either side of the 300-character bound.
  propertyTest.prop(
    [
      fc.stringMatching(/^[A-Za-z0-9_.~-]{6,24}$/),
      fc.integer({ min: 0, max: 600 }),
      fc.integer({ min: 0, max: 600 }),
    ],
    { seed: 20260907, numRuns: 300 },
  )(
    "keeps a password out of the line wherever it sits in the message",
    (password, leadingLength, trailingLength) => {
      const spy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const message =
        `${"a".repeat(leadingLength)} ` +
        `postgresql://app_designs:${password}@ep-x.neon.tech/lemn-conf-v2 ` +
        "b".repeat(trailingLength);

      expect(() => designErrorResponse("save", driverError(message))).toThrow();

      expect(emittedText(spy)).not.toContain(password);
      spy.mockRestore();
    },
  );
});

describe("what a failure may never do to the line's shape", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("strips a bidirectional override, so a reason cannot reorder the line as displayed", () => {
    emitFailure(new Error("save ok‮detsefinam eruliaf‬"));

    const reason = String(loggedLine(errorSpy).reason);
    expect(reason).not.toContain("‮");
    expect(reason).not.toContain("‬");
  });

  // The Romanian is the test's subject, not copy: the log must carry a locale's own letters through
  // unchanged, beside the bidirectional overrides it strips above.
  it("keeps ordinary non-ASCII text, which is not a forgery risk", () => {
    emitFailure(new Error("bucătărie: coloană inexistentă"));

    expect(loggedLine(errorSpy).reason).toBe("bucătărie: coloană inexistentă");
  });

  it("renders a numeric SQLSTATE as a string, so the field has one type", () => {
    emitFailure(driverError("boom", 42703));

    expect(loggedLine(errorSpy).errorCode).toBe("42703");
  });

  it("reports an unusable code as unavailable rather than as an object", () => {
    emitFailure(driverError("boom", { sqlstate: "42703" }));

    expect(loggedLine(errorSpy).errorCode).toBe("unavailable");
  });

  it("survives a thrown null without inventing an error name for it", () => {
    emitFailure(null);

    expect(loggedLine(errorSpy)).toMatchObject({
      errorCode: "unavailable",
      reason: "unavailable",
    });
  });

  it("still emits a line, and still rethrows the original, when reading the message throws", () => {
    // The seam exists so a 500's digest is resolvable. A diagnostic that can replace the error it
    // is diagnosing loses both halves: no line is written, and the platform records a failure
    // inside the logger rather than the driver failure that caused it.
    const failure = driverError("placeholder");
    Object.defineProperty(failure, "message", {
      get() {
        throw new Error("message getter exploded");
      },
    });

    expect(() => designErrorResponse("save", failure)).toThrow(failure);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("still emits a line when the message is not a string", () => {
    const failure = driverError("placeholder");
    Object.defineProperty(failure, "message", { value: 12_345 });

    expect(() => designErrorResponse("save", failure)).toThrow(failure);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("the seam is not entered by an error the mapper already answers for", () => {
  it("writes no failure line for a design that simply does not exist", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = designErrorResponse("load", new DesignNotFoundError("d1"));

    expect(response.status).toBe(404);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("ADR 0014 S2 — the refusal's reason reaches no part of the response", () => {
  it("keeps the log-only refusal code out of the 403's headers as well as its body", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const response = writeForbiddenResponse();
    const logged = loggedLine(warnSpy) as { refusalCode: string };
    const wholeResponse = `${JSON.stringify([...response.headers])} ${JSON.stringify(
      await response.json(),
    )}`;

    // The body half is already asserted elsewhere; the headers are the other place a code could be
    // added later without anyone noticing the disclosure.
    expect(logged.refusalCode).toBe("DESIGN_WRITE_FORBIDDEN");
    expect(wholeResponse).not.toContain(logged.refusalCode);
    expect(wholeResponse).not.toContain("FORBIDDEN");
  });
});
