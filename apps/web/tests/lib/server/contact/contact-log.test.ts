import { afterEach, describe, expect, it, vi } from "vitest";

import { MAIL_FAILURE_KINDS } from "@/lib/server/mail/mail-sender";
import { UNAVAILABLE_CAUSES } from "@/lib/server/rate-limit/enforce-rate-limit";
import { ALL_LIMIT_POLICIES } from "@/lib/server/rate-limit/limit-policy";

import { readSource } from "../server-source-support";

const A_REFERENCE = "LM-7K3QWXY2";
const MARKER = "FORBIDDEN-VALUE-MARKER-8830";
/** A text no reference can be, which the table's shape refuses (it takes upper case, digits and hyphens only). */
const UNSHAPED = "forbidden value, not a reference 8830";

/** The log from a module graph of its own: what it has written is kept for the process, so a test that reads the lines
 *  must start with a process that wrote none. */
async function freshLog() {
  vi.resetModules();
  const log = await import("@/lib/server/contact/contact-log");
  const responses = await import("@/lib/server/contact/contact-responses");
  return {
    ...log,
    ...responses,
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a limit refused: once for a process and a policy", () => {
  it("writes the code, the status and the policy's name, and nothing else", async () => {
    const { reportContactLimitRefused, warn } = await freshLog();
    const policy = ALL_LIMIT_POLICIES[0]?.name ?? "";

    reportContactLimitRefused(policy);

    expect(warn.mock.calls).toEqual([
      [
        "[contact]",
        {
          event: "contact-request-refused",
          refusalCode: "CONTACT_LIMIT_REACHED",
          status: 429,
          policy,
        },
      ],
    ]);
  });

  it("writes one line for a flood of one refusal, and one more for each other policy", async () => {
    const { reportContactLimitRefused, warn } = await freshLog();
    const [first, second] = ALL_LIMIT_POLICIES;

    for (let refusal = 0; refusal < 200; refusal += 1) {
      reportContactLimitRefused(first?.name ?? "");
    }
    reportContactLimitRefused(second?.name ?? "");
    reportContactLimitRefused(second?.name ?? "");

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("writes a name that is no policy's own as none, once, and never the text", async () => {
    const { reportContactLimitRefused, warn } = await freshLog();

    reportContactLimitRefused(MARKER);
    reportContactLimitRefused(`${MARKER}-another`);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("MARKER");
    expect(warn.mock.calls[0]?.[1]).toMatchObject({ policy: "none" });
  });

  it("writes the same line again in a new process, which is a fresh module graph", async () => {
    const policy = ALL_LIMIT_POLICIES[0]?.name ?? "";
    const first = await freshLog();
    first.reportContactLimitRefused(policy);
    const second = await freshLog();

    second.reportContactLimitRefused(policy);

    expect(first.warn.mock.calls).toHaveLength(1);
    expect(second.warn.mock.calls).toHaveLength(1);
  });
});

describe("any other refusal that has a line: once for a process and a code", () => {
  it("writes the code and its status from the one table, for each of the seven", async () => {
    const { CONTACT_REFUSAL_CODES, reportContactRefused, warn } =
      await freshLog();

    for (const code of CONTACT_REFUSAL_CODES) reportContactRefused(code);

    expect(warn.mock.calls.map(([, line]) => line as unknown)).toEqual(
      [
        ["CONTACT_CROSS_SITE", 403],
        ["CONTACT_NOT_JSON", 415],
        ["CONTACT_BODY_TOO_LARGE", 413],
        ["CONTACT_INVALID", 400],
        ["CONTACT_REQUEST_CONFLICT", 409],
        ["CONTACT_DESIGN_NOT_CURRENT", 409],
        ["CONTACT_DESIGN_DOES_NOT_FIT", 422],
      ].map(([refusalCode, status]) => ({
        event: "contact-request-refused",
        refusalCode,
        status,
      })),
    );
  });

  it("writes one line for a flood of the three refusals nothing counts, a line for each code and no more", async () => {
    const { reportContactRefused, warn } = await freshLog();

    for (let request = 0; request < 300; request += 1) {
      reportContactRefused("CONTACT_CROSS_SITE");
      reportContactRefused("CONTACT_NOT_JSON");
      reportContactRefused("CONTACT_BODY_TOO_LARGE");
    }

    expect(warn).toHaveBeenCalledTimes(3);
  });

  it.each(["CONTACT_REJECTED", "CONTACT_LIMIT_REACHED", MARKER, ""])(
    "writes no line for %j: the honeypot's and the time's refusal has none, and no code is made up",
    async (code) => {
      const { reportContactRefused, warn, error } = await freshLog();

      reportContactRefused(code as never);

      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    },
  );

  it("has no function that writes the honeypot's or the time's refusal", () => {
    const code = readSource("lib/server/contact/contact-log.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(code).not.toMatch(/CONTACT_REJECTED|honeypot|elapsed/i);
  });
});

describe("unavailable: each time, with a cause from a closed list", () => {
  it("writes the code, the status and the cause, for every cause on the list", async () => {
    const { CONTACT_UNAVAILABLE_CAUSES, reportContactUnavailable, error } =
      await freshLog();

    for (const cause of CONTACT_UNAVAILABLE_CAUSES) {
      reportContactUnavailable(cause);
    }

    expect(error.mock.calls.map(([, line]) => line as unknown)).toEqual(
      CONTACT_UNAVAILABLE_CAUSES.map((cause) => ({
        event: "contact-request-unavailable",
        refusalCode: "CONTACT_UNAVAILABLE",
        status: 503,
        cause,
      })),
    );
  });

  it("is the limiter's seven and five more of its own", async () => {
    const { CONTACT_UNAVAILABLE_CAUSES } = await freshLog();

    expect([...CONTACT_UNAVAILABLE_CAUSES]).toEqual([
      ...UNAVAILABLE_CAUSES,
      "sender-unusable",
      "submission-store-failed",
      "notice-unbuildable",
      "price-book-mismatch",
      "unexpected",
    ]);
  });

  it("writes a line for each, since the store failing is the signal and no caller drives it", async () => {
    const { reportContactUnavailable, error } = await freshLog();

    for (let request = 0; request < 5; request += 1) {
      reportContactUnavailable("store-failed");
    }

    expect(error).toHaveBeenCalledTimes(5);
  });

  it.each([
    ["a thrown error", new Error(MARKER)],
    ["a text", MARKER],
    ["an object with a message", { message: MARKER, name: MARKER }],
    ["nothing", undefined],
  ])(
    "writes %s as unexpected, and nothing of what it said, its message, its name or its cause",
    async (_label, thrown) => {
      const { reportContactUnavailable, error } = await freshLog();

      reportContactUnavailable(thrown as never);

      expect(error.mock.calls[0]?.[1]).toMatchObject({ cause: "unexpected" });
      expect(JSON.stringify(error.mock.calls)).not.toContain("MARKER");
    },
  );
});

describe("a notice not accepted: each time, with the kind, the provider's status and the reference", () => {
  it("writes the code, the status, the mail failure's kind, the status and the reference", async () => {
    const { reportContactNoticeNotSent, error } = await freshLog();

    reportContactNoticeNotSent({
      code: "CONTACT_NOTICE_NOT_SENT_RETRY",
      failure: { kind: "mail", failureKind: "busy", providerStatus: 409 },
      reference: A_REFERENCE,
    });

    expect(error.mock.calls).toEqual([
      [
        "[contact]",
        {
          event: "contact-notice-not-sent",
          refusalCode: "CONTACT_NOTICE_NOT_SENT_RETRY",
          status: 502,
          mailFailureKind: "busy",
          providerStatus: 409,
          reference: A_REFERENCE,
        },
      ],
    ]);
  });

  it("leaves the provider's status out when there was none, as for a failure that is ours", async () => {
    const { reportContactNoticeNotSent, error } = await freshLog();

    reportContactNoticeNotSent({
      code: "CONTACT_NOTICE_NOT_SENT",
      failure: {
        kind: "mail",
        failureKind: "refused",
        providerStatus: undefined,
      },
      reference: A_REFERENCE,
    });

    expect(error.mock.calls[0]?.[1]).not.toHaveProperty("providerStatus");
  });

  it.each([0, 99, 600, 1.5, Number.NaN, -1])(
    "leaves out a provider status of %s, which is no HTTP status",
    async (providerStatus) => {
      const { reportContactNoticeNotSent, error } = await freshLog();

      reportContactNoticeNotSent({
        code: "CONTACT_NOTICE_NOT_SENT",
        failure: { kind: "mail", failureKind: "refused", providerStatus },
        reference: A_REFERENCE,
      });

      expect(error.mock.calls[0]?.[1]).not.toHaveProperty("providerStatus");
    },
  );

  it("writes a kind that is not on the list as other, and writes a line each time", async () => {
    const { reportContactNoticeNotSent, error } = await freshLog();

    for (let request = 0; request < 3; request += 1) {
      reportContactNoticeNotSent({
        code: "CONTACT_NOTICE_NOT_SENT",
        failure: {
          kind: "mail",
          failureKind: MARKER as never,
          providerStatus: undefined,
        },
        reference: A_REFERENCE,
      });
    }

    expect(error).toHaveBeenCalledTimes(3);
    expect(error.mock.calls[0]?.[1]).toMatchObject({
      mailFailureKind: "other",
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("MARKER");
  });

  it.each([
    "",
    UNSHAPED,
    "lm-7k3qwxy2",
    "LM-",
    `${A_REFERENCE} `,
    "ana@example.com",
  ])(
    "writes no reference that has not a reference's shape: %j",
    async (reference) => {
      const { reportContactNoticeNotSent, error } = await freshLog();

      reportContactNoticeNotSent({
        code: "CONTACT_NOTICE_NOT_SENT",
        failure: {
          kind: "mail",
          failureKind: "refused",
          providerStatus: undefined,
        },
        reference,
      });

      expect(error.mock.calls[0]?.[1]).not.toHaveProperty("reference");
      expect(JSON.stringify(error.mock.calls)).not.toContain("forbidden");
    },
  );
});

describe("a notice not passed on holds a mail failure's kind or a cause, never both and never neither", () => {
  const BASE = {
    code: "CONTACT_NOTICE_NOT_SENT_RETRY",
    reference: A_REFERENCE,
  } as const;

  it("writes the kind and the status of a mail failure, and no cause", async () => {
    const { reportContactNoticeNotSent, error } = await freshLog();

    reportContactNoticeNotSent({
      ...BASE,
      failure: { kind: "mail", failureKind: "timed-out", providerStatus: 504 },
    });

    const line = error.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(line).toMatchObject({
      mailFailureKind: "timed-out",
      providerStatus: 504,
    });
    expect(line).not.toHaveProperty("cause");
  });

  it.each(["notice-unbuildable", "price-book-mismatch", "unexpected"] as const)(
    "writes the cause %s of something of ours, and no kind and no status",
    async (cause) => {
      const { reportContactNoticeNotSent, error } = await freshLog();

      reportContactNoticeNotSent({
        ...BASE,
        failure: { kind: "cause", cause },
      });

      const line = error.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(line).toMatchObject({ cause, reference: A_REFERENCE });
      expect(line).not.toHaveProperty("mailFailureKind");
      expect(line).not.toHaveProperty("providerStatus");
    },
  );

  it.each([
    ["nothing", undefined],
    ["an object that is neither", { kind: "other" }],
    ["a text", MARKER],
  ])(
    "writes %s as the cause unexpected, never as neither",
    async (_label, failure) => {
      const { reportContactNoticeNotSent, error } = await freshLog();

      reportContactNoticeNotSent({ ...BASE, failure: failure as never });

      const line = error.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(line).toMatchObject({ cause: "unexpected" });
      expect(line).not.toHaveProperty("mailFailureKind");
      expect(JSON.stringify(error.mock.calls)).not.toContain("MARKER");
    },
  );
});

describe("a stored request refused for its design: each time, the code and the reference", () => {
  it.each([
    ["CONTACT_DESIGN_NOT_CURRENT", 409],
    ["CONTACT_DESIGN_DOES_NOT_FIT", 422],
  ] as const)(
    "writes %s with its status and the reference, every time it is refused",
    async (code, status) => {
      const { reportContactStoredRequestRefused, error } = await freshLog();

      for (let attempt = 0; attempt < 4; attempt += 1) {
        reportContactStoredRequestRefused(code, A_REFERENCE);
      }

      expect(error).toHaveBeenCalledTimes(4);
      expect(error.mock.calls[0]).toEqual([
        "[contact]",
        {
          event: "contact-stored-request-refused",
          refusalCode: code,
          status,
          reference: A_REFERENCE,
        },
      ]);
    },
  );

  it("writes no reference that has not the table's shape, and holds no design's id", async () => {
    const { reportContactStoredRequestRefused, error } = await freshLog();

    reportContactStoredRequestRefused("CONTACT_DESIGN_NOT_CURRENT", UNSHAPED);

    expect(error.mock.calls[0]?.[1]).not.toHaveProperty("reference");
    expect(JSON.stringify(error.mock.calls)).not.toContain("forbidden");
  });
});

describe("a mark that failed after an accepted send: each time, the reference", () => {
  it("writes the reference alone", async () => {
    const { reportContactMarkFailed, error } = await freshLog();

    reportContactMarkFailed(A_REFERENCE);
    reportContactMarkFailed(A_REFERENCE);

    expect(error.mock.calls).toEqual([
      ["[contact]", { event: "contact-mark-failed", reference: A_REFERENCE }],
      ["[contact]", { event: "contact-mark-failed", reference: A_REFERENCE }],
    ]);
  });

  it("writes no reference of another shape", async () => {
    const { reportContactMarkFailed, error } = await freshLog();

    reportContactMarkFailed(UNSHAPED);

    expect(error.mock.calls[0]?.[1]).toEqual({ event: "contact-mark-failed" });
  });
});

describe("what no line holds, and a transport that fails", () => {
  it("lets nothing escape when the transport throws, for every kind of line", async () => {
    const {
      reportContactLimitRefused,
      reportContactRefused,
      reportContactUnavailable,
      reportContactNoticeNotSent,
      reportContactMarkFailed,
      warn,
      error,
    } = await freshLog();
    warn.mockImplementation(() => {
      throw new Error("transport down");
    });
    error.mockImplementation(() => {
      throw new Error("transport down");
    });

    expect(() => {
      reportContactLimitRefused(ALL_LIMIT_POLICIES[0]?.name ?? "");
      reportContactRefused("CONTACT_INVALID");
      reportContactUnavailable("store-failed");
      reportContactNoticeNotSent({
        code: "CONTACT_NOTICE_NOT_SENT",
        failure: { kind: "mail", failureKind: "refused", providerStatus: 503 },
        reference: A_REFERENCE,
      });
      reportContactMarkFailed(A_REFERENCE);
    }).not.toThrow();
  });

  it("holds no address, id, hash, key or digest in any line, over every function and argument", async () => {
    const log = await freshLog();
    const forbidden = [
      "ana@example.com",
      "abcdefghijklmnopqrstu",
      "0123456789abcdef",
      "ab".repeat(32),
    ];

    for (const text of forbidden) {
      log.reportContactLimitRefused(text);
      log.reportContactUnavailable(text as never);
      log.reportContactRefused(text as never);
      log.reportContactMarkFailed(text);
      log.reportContactNoticeNotSent({
        code: "CONTACT_NOTICE_NOT_SENT",
        failure: {
          kind: "mail",
          failureKind: text as never,
          providerStatus: undefined,
        },
        reference: text,
      });
    }

    const everything = JSON.stringify([
      log.warn.mock.calls,
      log.error.mock.calls,
    ]);
    for (const text of forbidden) expect(everything).not.toContain(text);
  });

  it("is handed no request, contact, snapshot or id, and keeps no state but the lines written", () => {
    const code = readSource("lib/server/contact/contact-log.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(code).not.toMatch(
      /clientRequestId|designId|visitor|snapshot|\bemail\b|\baddress\b/i,
    );
    expect(code.match(/^(?:let|var)\s/gm)).toBeNull();
    expect(code.match(/\.add\(/g)).toHaveLength(1);
    expect(code).toMatch(/refusalsWritten\.add\(identity\)/);
  });
});

describe("the mail's own list of failure kinds", () => {
  it("is the list this module writes, so a kind the mail adds is not written as other", () => {
    return import("@/lib/server/contact/contact-log").then(
      ({ CONTACT_MAIL_FAILURE_KINDS }) => {
        expect([...CONTACT_MAIL_FAILURE_KINDS]).toEqual([
          ...MAIL_FAILURE_KINDS,
        ]);
      },
    );
  });

  it("is a closed list of the reference's own import only: this module imports no mail", () => {
    expect(readSource("lib/server/contact/contact-log.ts")).not.toMatch(
      /lib\/server\/mail/,
    );
  });
});
