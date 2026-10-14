import { ContactSubmissionStoreError } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findSentReference = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => ({ findSentReference }),
}));

import {
  CONTACT_PAGE_READ_DEADLINE_MS,
  readSentReference,
} from "@/lib/server/contact/sent-reference";

const REQUEST = { designId: "design0123456789abcde", revision: "4" } as const;

const DEADLINE_MS = CONTACT_PAGE_READ_DEADLINE_MS;
const OWNER_RULED_DEADLINE_MS = 2000;
const LOG_LABEL = "[sent-reference]";

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  findSentReference.mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** The log's once-per-cause memo lives as long as its module, so each test reads the read from a graph of its own. */
async function freshRead(): Promise<{
  readSentReference: typeof readSentReference;
  ContactSubmissionStoreError: typeof ContactSubmissionStoreError;
}> {
  vi.resetModules();
  const { readSentReference: read } = await import(
    "@/lib/server/contact/sent-reference"
  );
  const persistence = await import("@lemnaria/persistence");
  return {
    readSentReference: read,
    ContactSubmissionStoreError: persistence.ContactSubmissionStoreError,
  };
}

function answeringAfter(ms: number, answer: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(answer);
    }, ms);
  });
}

function rejectingAfter(ms: number, failure: Error): Promise<unknown> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => {
      reject(failure);
    }, ms);
  });
}

describe("readSentReference", () => {
  it("asks the store for the design at the revision it was given, and nothing more", async () => {
    findSentReference.mockResolvedValue({ kind: "none" });

    await readSentReference(REQUEST);

    expect(findSentReference.mock.calls).toEqual([[REQUEST]]);
  });

  it("answers the reference of a notified request as the kind and the string", async () => {
    findSentReference.mockResolvedValue({ kind: "sent", reference: "LM-2614" });

    await expect(readSentReference(REQUEST)).resolves.toEqual({
      kind: "sent",
      reference: "LM-2614",
    });
  });

  it("answers none for a design with no notified request", async () => {
    findSentReference.mockResolvedValue({ kind: "none" });

    await expect(readSentReference(REQUEST)).resolves.toEqual({
      kind: "none",
    });
  });

  it("hands on the reference and the kind and no other field the store answered with", async () => {
    findSentReference.mockResolvedValue({
      kind: "sent",
      reference: "LM-2614",
      phone: "069 123 456",
      designRevision: "4",
    });

    const answer = await readSentReference(REQUEST);

    expect(Object.keys(answer).sort()).toEqual(["kind", "reference"]);
    expect(JSON.stringify(answer)).not.toContain("069");
  });

  it.each([
    [
      "the store's own error",
      new ContactSubmissionStoreError("find a sent reference"),
    ],
    ["a driver's error carrying a value", new Error("password=hunter2")],
    ["a thrown string", "connection reset"],
  ])(
    "answers unknown, with nothing of it, when the read fails with %s",
    async (_name, failure) => {
      findSentReference.mockRejectedValue(failure);

      const answer = await readSentReference(REQUEST);

      expect(answer).toEqual({ kind: "unknown" });
    },
  );

  it("answers unknown when the instance cannot be made, as a read that threw", async () => {
    findSentReference.mockImplementation(() => {
      throw new Error("DATABASE_URL is not set");
    });

    await expect(readSentReference(REQUEST)).resolves.toEqual({
      kind: "unknown",
    });
  });
});

describe("readSentReference with a deadline", () => {
  const WITH_DEADLINE = { deadlineMs: DEADLINE_MS } as const;

  it("keeps an answer that arrives one millisecond before the deadline", async () => {
    vi.useFakeTimers();
    findSentReference.mockReturnValue(
      answeringAfter(DEADLINE_MS - 1, { kind: "sent", reference: "LM-2614" }),
    );

    const reading = readSentReference(REQUEST, WITH_DEADLINE);
    await vi.advanceTimersByTimeAsync(DEADLINE_MS - 1);

    await expect(reading).resolves.toEqual({
      kind: "sent",
      reference: "LM-2614",
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("answers unknown for an answer that arrives one millisecond after the deadline, and writes the deadline's line", async () => {
    vi.useFakeTimers();
    findSentReference.mockReturnValue(
      answeringAfter(DEADLINE_MS + 1, { kind: "sent", reference: "LM-2614" }),
    );
    const { readSentReference: read } = await freshRead();

    const reading = read(REQUEST, WITH_DEADLINE);
    await vi.advanceTimersByTimeAsync(DEADLINE_MS + 1);

    await expect(reading).resolves.toEqual({ kind: "unknown" });
    expect(consoleError.mock.calls).toEqual([
      [
        LOG_LABEL,
        JSON.stringify({ event: "sent-reference-unread", cause: "deadline" }),
      ],
    ]);
  });

  it("raises no unhandled rejection when the read rejects after the deadline", async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    findSentReference.mockReturnValue(
      rejectingAfter(DEADLINE_MS + 200, new Error("late failure")),
    );

    const reading = readSentReference(REQUEST, WITH_DEADLINE);
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    await expect(reading).resolves.toEqual({ kind: "unknown" });
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    await vi.runAllTimersAsync();
    process.off("unhandledRejection", unhandled);

    expect(unhandled).not.toHaveBeenCalled();
  });

  it("leaves no timer running once the read has won", async () => {
    vi.useFakeTimers();
    findSentReference.mockResolvedValue({ kind: "none" });

    await readSentReference(REQUEST, WITH_DEADLINE);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves no timer running once the read has failed in time", async () => {
    vi.useFakeTimers();
    findSentReference.mockRejectedValue(new Error("connection reset"));

    await expect(readSentReference(REQUEST, WITH_DEADLINE)).resolves.toEqual({
      kind: "unknown",
    });

    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts no timer and waits as long as the store does when it is given no deadline", async () => {
    vi.useFakeTimers();
    findSentReference.mockReturnValue(
      answeringAfter(60_000, { kind: "sent", reference: "LM-2614" }),
    );

    const reading = readSentReference(REQUEST);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(reading).resolves.toEqual({
      kind: "sent",
      reference: "LM-2614",
    });
  });

  it("is the owner's 2000 ms, one named constant that the contact page passes", () => {
    expect(CONTACT_PAGE_READ_DEADLINE_MS).toBe(OWNER_RULED_DEADLINE_MS);
  });
});

describe("the line a failed read writes", () => {
  it("is one line per process and cause, whatever the number of failures", async () => {
    const { readSentReference: read } = await freshRead();
    findSentReference.mockRejectedValue(new Error("connection reset"));

    await read(REQUEST);
    await read(REQUEST);
    await read(REQUEST);

    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("names the store's own error as store-error, with the label, the event and the cause and no more", async () => {
    const { readSentReference: read, ContactSubmissionStoreError: StoreError } =
      await freshRead();
    findSentReference.mockRejectedValue(
      new StoreError("find a sent reference", { cause: new Error("secret") }),
    );

    await read(REQUEST);

    expect(consoleError.mock.calls).toEqual([
      [
        LOG_LABEL,
        JSON.stringify({
          event: "sent-reference-unread",
          cause: "store-error",
        }),
      ],
    ]);
    expect(
      Object.keys(
        JSON.parse(String(consoleError.mock.calls[0]?.[1])) as object,
      ),
    ).toEqual(["event", "cause"]);
  });

  it("writes each cause once: a store error, a deadline and anything else are three lines", async () => {
    vi.useFakeTimers();
    const { readSentReference: read, ContactSubmissionStoreError: StoreError } =
      await freshRead();

    findSentReference.mockRejectedValue(
      new StoreError("find a sent reference"),
    );
    await read(REQUEST);
    findSentReference.mockReturnValue(new Promise(() => undefined));
    const late = read(REQUEST, { deadlineMs: DEADLINE_MS });
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    await late;
    findSentReference.mockRejectedValue("connection reset");
    await read(REQUEST);

    expect(
      consoleError.mock.calls.map(
        ([, line]) => (JSON.parse(String(line)) as { cause: string }).cause,
      ),
    ).toEqual(["store-error", "deadline", "unexpected"]);
  });

  it("carries nothing a hostile thrown value says: not its message, its name, an id, a revision or a reference", async () => {
    const { readSentReference: read } = await freshRead();
    const hostile = Object.assign(
      new Error("postgres://owner:Zq7Secret@host/db"),
      {
        name: "password=hunter2",
        operation: "find a sent reference",
        designId: REQUEST.designId,
        reference: "LM-2614",
      },
    );
    findSentReference.mockRejectedValue(hostile);

    await read(REQUEST);

    const written = JSON.stringify(consoleError.mock.calls);
    for (const leaked of [
      "Zq7Secret",
      "hunter2",
      REQUEST.designId,
      "LM-2614",
      "find a sent reference",
    ]) {
      expect(written).not.toContain(leaked);
    }
    expect(consoleError.mock.calls).toEqual([
      [
        LOG_LABEL,
        JSON.stringify({ event: "sent-reference-unread", cause: "unexpected" }),
      ],
    ]);
  });

  it("takes a plain error that merely calls itself a store error for unexpected, since it is told apart by what it is and not by its name", async () => {
    const { readSentReference: read } = await freshRead();
    findSentReference.mockRejectedValue(
      Object.assign(new Error("not the store's"), {
        name: "ContactSubmissionStoreError",
      }),
    );

    await read(REQUEST);

    expect(consoleError.mock.calls).toEqual([
      [
        LOG_LABEL,
        JSON.stringify({
          event: "sent-reference-unread",
          cause: "unexpected",
        }),
      ],
    ]);
  });

  it("is not written for a read that answered", async () => {
    findSentReference.mockResolvedValue({ kind: "none" });

    await readSentReference(REQUEST);

    expect(consoleError).not.toHaveBeenCalled();
  });
});
