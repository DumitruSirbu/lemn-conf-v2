import {
  KITCHEN_L_DESIGN,
  NARROWED_ROOM_OVERFLOWING_DESIGN,
  SAMPLE_PRICE_BOOK,
  snapshotSubmission,
} from "@lemnaria/configurator-domain";
import { ContactSubmissionStoreError } from "@lemnaria/persistence";
import { afterEach, describe, expect, it, vi } from "vitest";

import { submitContact } from "@/lib/server/contact/submit-contact";
import { composeLeadNotice } from "@/lib/server/mail/lead-notification";
import type { MailFailureKind } from "@/lib/server/mail/mail-sender";

import {
  aHarness,
  bodyOf,
  callbackBodyOf,
  DESIGN_ID,
  EMAIL_MARKER,
  NAME_MARKER,
  PLACEHOLDER_REFERENCE,
  REQUEST_ID,
  VISITOR_HASH,
  wireOf,
} from "./submit-contact-harness";

vi.mock("@/lib/server/mail/lead-notification", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/server/mail/lead-notification")
    >();
  return {
    ...original,
    composeLeadNotice: vi.fn(original.composeLeadNotice),
  };
});

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...original,
    snapshotSubmission: vi.fn(original.snapshotSubmission),
  };
});

function consoleLines() {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  return {
    warn,
    error,
    everything: () => JSON.stringify([warn.mock.calls, error.mock.calls]),
    errorLines: () =>
      error.mock.calls.map(([, line]) => line as Record<string, unknown>),
  };
}

afterEach(() => {
  vi.mocked(composeLeadNotice).mockReset();
  vi.mocked(snapshotSubmission).mockReset();
  vi.restoreAllMocks();
});

async function codeOf(answer: Response): Promise<unknown> {
  return ((await answer.clone().json()) as Record<string, unknown>).code;
}

describe("before a reference is held, a throw is unavailable, with its cause", () => {
  it.each([
    [
      "the lookup",
      {
        lookUp: () =>
          Promise.reject(new ContactSubmissionStoreError("look up a request")),
      },
      "submission-store-failed",
    ],
    [
      "the record",
      {
        record: () =>
          Promise.reject(new ContactSubmissionStoreError("record a request")),
      },
      "submission-store-failed",
    ],
    [
      "the lookup, a thrown thing that is no store error",
      { lookUp: () => Promise.reject(new Error("MARKER-5521")) },
      "unexpected",
    ],
  ] as const)(
    "answers a throw from %s as 503 and writes its cause once",
    async (_label, broken, cause) => {
      const lines = consoleLines();
      const harness = aHarness({
        store: (inner) => ({
          lookUp: (r) => inner.lookUp(r),
          record: (s) => inner.record(s),
          markNotified: (id) => inner.markNotified(id),
          ...broken,
        }),
      });

      const answer = await harness.submit(bodyOf());

      expect(answer.status).toBe(503);
      expect(await codeOf(answer)).toBe("CONTACT_UNAVAILABLE");
      expect(lines.errorLines()).toEqual([
        {
          event: "contact-request-unavailable",
          refusalCode: "CONTACT_UNAVAILABLE",
          status: 503,
          cause,
        },
      ]);
      expect(lines.everything()).not.toContain("MARKER");
      expect(harness.store.heldSubmissions()).toHaveLength(0);
    },
  );

  it.each([
    [
      "the judge's maker",
      {
        makeJudge: () => {
          throw new Error("MARKER-7710");
        },
      },
    ],
    [
      "the clock",
      {
        now: () => {
          throw new Error("MARKER-7710");
        },
      },
    ],
  ] as const)(
    "answers a throw from %s as 503, with its cause once, and counts, looks up and stores nothing",
    async (_label, broken) => {
      const lines = consoleLines();
      const harness = aHarness();

      const answer = await submitContact(
        { text: bodyOf(), visitorHash: undefined },
        { ...harness.ports, ...broken },
      );

      expect(answer.status).toBe(503);
      expect(await codeOf(answer)).toBe("CONTACT_UNAVAILABLE");
      expect(lines.errorLines()).toEqual([
        {
          event: "contact-request-unavailable",
          refusalCode: "CONTACT_UNAVAILABLE",
          status: 503,
          cause: "unexpected",
        },
      ]);
      expect(lines.everything()).not.toContain("MARKER");
      expect(harness.recorded).not.toHaveBeenCalled();
      expect(harness.calls).toEqual([]);
    },
  );

  it("answers a throw from the design's load, and from the sender's factory, the same way", async () => {
    consoleLines();
    const load = aHarness({
      loadOwned: () => Promise.reject(new Error("down")),
    });
    const factory = aHarness({
      createSender: () => {
        throw new Error("down");
      },
    });

    const answers = [
      await load.submit(bodyOf()),
      await factory.submit(bodyOf()),
    ];

    expect(answers.map((answer) => answer.status)).toEqual([503, 503]);
  });

  it("is the same bytes for every cause: a store, a sender, a secret, a notice, a stale book", async () => {
    consoleLines();
    const broken = aHarness({
      store: (inner) => ({
        lookUp: () => Promise.reject(new Error("x")),
        record: inner.record.bind(inner),
        markNotified: inner.markNotified.bind(inner),
      }),
    });
    const noSender = aHarness({
      createSender: () => ({ kind: "unavailable", variables: [] }),
    });
    const noSecret = aHarness({
      digester: { status: "unavailable", variable: "DIGEST_SECRET" },
    });
    const noNotice = aHarness({ noticeContent: { leadNotice: null } as never });
    const staleBook = aHarness();
    const actual = await vi.importActual<
      typeof import("@lemnaria/configurator-domain")
    >("@lemnaria/configurator-domain");
    let isTheStaleOne = false;
    vi.mocked(snapshotSubmission).mockImplementation((request) => {
      const real = actual.snapshotSubmission(request);
      return real.ok && isTheStaleOne
        ? {
            ok: true,
            snapshot: {
              ...real.snapshot,
              priced: { ...real.snapshot.priced, pricingVersion: "another" },
            },
          }
        : real;
    });

    const answers = [
      await broken.submit(bodyOf()),
      await noSender.submit(bodyOf()),
      await noSecret.submit(bodyOf()),
      await noNotice.submit(bodyOf()),
    ];
    isTheStaleOne = true;
    answers.push(await staleBook.submit(bodyOf()));

    expect(
      new Set(await Promise.all(answers.map((answer) => wireOf(answer)))).size,
    ).toBe(1);
    expect(answers[0]?.status).toBe(503);
  });
});

describe("one book: the digested version is the priced one, or nothing is stored", () => {
  it("stores nothing and sends nothing when the snapshot is priced under another version, with its cause", async () => {
    const lines = consoleLines();
    const actual = await vi.importActual<
      typeof import("@lemnaria/configurator-domain")
    >("@lemnaria/configurator-domain");
    vi.mocked(snapshotSubmission).mockImplementation((request) => {
      const real = actual.snapshotSubmission(request);
      return real.ok
        ? {
            ok: true,
            snapshot: {
              ...real.snapshot,
              priced: {
                ...real.snapshot.priced,
                pricingVersion: "not-the-books",
              },
            },
          }
        : real;
    });
    const harness = aHarness();

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(503);
    expect(lines.errorLines()[0]).toMatchObject({
      cause: "price-book-mismatch",
    });
    expect(harness.store.heldSubmissions()).toHaveLength(0);
    expect(harness.sender.sent).toHaveLength(0);
    expect(harness.calls).not.toContain("record");
  });

  it("prices the snapshot under the book's version", async () => {
    const harness = aHarness();

    await harness.submit(bodyOf());

    const [stored] = harness.store.heldSubmissions();
    expect(stored?.submission.snapshot?.priced.pricingVersion).toBe(
      SAMPLE_PRICE_BOOK.version,
    );
  });
});

describe("from a reference, a throw is the answer a retry may follow, with its line and the reference", () => {
  it("answers a sender that throws as 502 retry, with the reference in its line and no second row", async () => {
    const lines = consoleLines();
    const failing = aHarness({
      createSender: () => ({
        kind: "sender",
        sender: { send: () => Promise.reject(new Error("MARKER-7780")) },
      }),
    });

    const answer = await failing.submit(bodyOf());

    const [held] = failing.store.heldSubmissions();
    expect(answer.status).toBe(502);
    expect(await codeOf(answer)).toBe("CONTACT_NOTICE_NOT_SENT_RETRY");
    expect(lines.errorLines()).toEqual([
      {
        event: "contact-notice-not-sent",
        refusalCode: "CONTACT_NOTICE_NOT_SENT_RETRY",
        status: 502,
        cause: "unexpected",
        reference: held?.reference,
      },
    ]);
    expect(failing.store.heldSubmissions()).toHaveLength(1);
    expect(lines.everything()).not.toContain("MARKER");
  });

  it("answers a notice that cannot be made with the stored reference as 502 retry, and no second row", async () => {
    const lines = consoleLines();
    const harness = aHarness();
    const builtFor: string[] = [];
    const real = await vi.importActual<
      typeof import("@/lib/server/mail/lead-notification")
    >("@/lib/server/mail/lead-notification");
    vi.mocked(composeLeadNotice).mockImplementation((input) => {
      builtFor.push(input.reference);
      if (input.reference !== PLACEHOLDER_REFERENCE) {
        throw new Error("MARKER-1290");
      }
      return real.composeLeadNotice(input);
    });

    const answer = await harness.submit(bodyOf());

    expect(builtFor).toEqual([
      PLACEHOLDER_REFERENCE,
      PLACEHOLDER_REFERENCE,
      harness.store.heldSubmissions()[0]?.reference,
    ]);
    expect(answer.status).toBe(502);
    expect(lines.errorLines()[0]).toMatchObject({
      cause: "notice-unbuildable",
      reference: harness.store.heldSubmissions()[0]?.reference,
    });
    expect(harness.store.heldSubmissions()).toHaveLength(1);
    expect(harness.sender.sent).toHaveLength(0);
    expect(lines.everything()).not.toContain("MARKER");
  });

  it("answers a throw from the design's load on a retry of a stored request as 502 retry, with its line", async () => {
    const lines = consoleLines();
    const first = aHarness({ outcomes: [{ ok: false, kind: "busy" }] });
    await first.submit(bodyOf());
    lines.error.mockClear();
    const retry = aHarness({
      store: () => first.store,
      loadOwned: () => Promise.reject(new Error("MARKER-3301")),
    });

    const answer = await retry.submit(bodyOf());

    expect(answer.status).toBe(502);
    expect(lines.errorLines()[0]).toMatchObject({
      cause: "unexpected",
      reference: first.store.heldSubmissions()[0]?.reference,
    });
    expect(first.store.heldSubmissions()).toHaveLength(1);
    expect(lines.everything()).not.toContain("MARKER");
  });
});

describe("what the mail's failure becomes", () => {
  const KINDS: readonly [MailFailureKind, string, number | undefined][] = [
    ["unreadable-answer", "CONTACT_NOTICE_NOT_SENT_RETRY", 200],
    ["busy", "CONTACT_NOTICE_NOT_SENT_RETRY", 409],
    ["unreachable", "CONTACT_NOTICE_NOT_SENT_RETRY", undefined],
    ["timed-out", "CONTACT_NOTICE_NOT_SENT_RETRY", undefined],
    ["payload-mismatch", "CONTACT_NOTICE_NOT_SENT", 409],
    ["quota-spent", "CONTACT_NOTICE_NOT_SENT", 429],
    ["refused", "CONTACT_NOTICE_NOT_SENT", 422],
  ];

  it.each(KINDS)(
    "answers %s as %s, with its kind and the provider's status in the line and no reference in the answer",
    async (kind, code, status) => {
      const lines = consoleLines();
      const harness = aHarness({
        outcomes: [
          { ok: false, kind, ...(status === undefined ? {} : { status }) },
        ],
      });

      const answer = await harness.submit(bodyOf());

      expect(answer.status).toBe(502);
      expect(await codeOf(answer)).toBe(code);
      expect(await answer.text()).not.toContain("LM-");
      expect(lines.errorLines()[0]).toMatchObject({
        refusalCode: code,
        mailFailureKind: kind,
        reference: harness.store.heldSubmissions()[0]?.reference,
        ...(status === undefined ? {} : { providerStatus: status }),
      });
      expect(lines.errorLines()[0]).not.toHaveProperty("cause");
      expect(harness.store.heldSubmissions()).toHaveLength(1);
    },
  );
});

describe("a mark that fails after an accepted send is still a success", () => {
  it("answers 200 with the reference, writes the mark's line with the reference, and a retry sends again", async () => {
    const lines = consoleLines();
    const harness = aHarness({
      store: (inner) => ({
        lookUp: (r) => inner.lookUp(r),
        record: (s) => inner.record(s),
        markNotified: () => Promise.reject(new Error("MARKER-9902")),
      }),
    });

    const answer = await harness.submit(bodyOf());

    const reference = harness.store.heldSubmissions()[0]?.reference;
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ status: "sent", reference });
    expect(lines.errorLines()).toEqual([
      { event: "contact-mark-failed", reference },
    ]);
    expect(lines.everything()).not.toContain("MARKER");
    const again = await harness.submit(bodyOf());
    expect(again.status).toBe(200);
    expect(harness.sender.sent).toHaveLength(2);
  });
});

describe("a stored request refused for its design is named each time, with its reference", () => {
  async function storedAndNotNotified() {
    const first = aHarness({ outcomes: [{ ok: false, kind: "busy" }] });
    await first.submit(bodyOf());
    return first;
  }

  it.each([
    [
      "the design has moved on",
      { kind: "found", design: KITCHEN_L_DESIGN, revision: "2" },
      409,
      "CONTACT_DESIGN_NOT_CURRENT",
    ],
    [
      "the design no longer fits",
      {
        kind: "found",
        design: NARROWED_ROOM_OVERFLOWING_DESIGN,
        revision: "1",
      },
      422,
      "CONTACT_DESIGN_DOES_NOT_FIT",
    ],
    [
      "the design is no longer the caller's",
      { kind: "refused", reason: "unavailable" },
      409,
      "CONTACT_DESIGN_NOT_CURRENT",
    ],
  ] as const)(
    "answers %s as its refusal and writes a line each time",
    async (_label, load, status, code) => {
      const lines = consoleLines();
      const first = await storedAndNotNotified();
      lines.error.mockClear();
      const retry = aHarness({
        store: () => first.store,
        loadOwned: () => Promise.resolve(load),
      });

      const answers = [
        await retry.submit(bodyOf()),
        await retry.submit(bodyOf()),
      ];

      const reference = first.store.heldSubmissions()[0]?.reference;
      expect(answers.map((answer) => answer.status)).toEqual([status, status]);
      expect(await codeOf(answers[0] as Response)).toBe(code);
      expect(lines.errorLines()).toEqual([
        {
          event: "contact-stored-request-refused",
          refusalCode: code,
          status,
          reference,
        },
        {
          event: "contact-stored-request-refused",
          refusalCode: code,
          status,
          reference,
        },
      ]);
      expect(retry.sender.sent).toHaveLength(0);
      expect(await answers[0]?.text()).not.toContain("LM-");
    },
  );
});

describe("no line on any branch holds a submitted value", () => {
  it("holds no name, phone, address, id, hash or digest, over every branch, the thrown ones included", async () => {
    const lines = consoleLines();
    const email = {
      name: NAME_MARKER,
      phone: "069 000 111",
      locality: "Fakeville",
      channel: "email",
      email: EMAIL_MARKER,
      consent: true,
      consentTextVersion: "placeholder",
    };
    const scenarios = [
      aHarness().submit(bodyOf({ contact: email }), VISITOR_HASH),
      aHarness().submit("{ not json"),
      aHarness().submit(bodyOf({ honeypot: "x" })),
      aHarness({
        outcomes: [{ ok: false, kind: "refused", status: 422 }],
      }).submit(bodyOf({ contact: email }), VISITOR_HASH),
      aHarness({
        loadOwned: () =>
          Promise.reject(new Error(`${NAME_MARKER} ${DESIGN_ID}`)),
      }).submit(bodyOf()),
      aHarness({
        createSender: () => ({
          kind: "sender",
          sender: {
            send: () =>
              Promise.reject(new Error(`${EMAIL_MARKER} ${REQUEST_ID}`)),
          },
        }),
      }).submit(bodyOf({ contact: email })),
      aHarness({
        loadOwned: () =>
          Promise.resolve({
            kind: "found",
            design: NARROWED_ROOM_OVERFLOWING_DESIGN,
            revision: "1",
          }),
      }).submit(bodyOf()),
    ];
    for (const scenario of scenarios) await scenario;
    await aHarness().submit(callbackBodyOf());

    const everything = lines.everything();
    for (const text of [
      NAME_MARKER,
      EMAIL_MARKER,
      EMAIL_MARKER.toLowerCase(),
      "069 000 111",
      "Fakeville",
      DESIGN_ID,
      REQUEST_ID,
      VISITOR_HASH,
      "192.0.2",
    ]) {
      expect(everything).not.toContain(text);
    }
    expect(everything).not.toMatch(/[0-9a-f]{64}/);
  });
});

describe("submit-contact.ts and its files", () => {
  it("reads source: hold no sender, store, book or variable at module level, and read no process", async () => {
    const { readSource } = await import("../server-source-support");
    for (const file of [
      "submit-contact",
      "prepare-submission",
      "deliver-notice",
      "contact-failure",
    ]) {
      const code = readSource(`lib/server/contact/${file}.ts`)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      expect(code, file).not.toMatch(
        /process\.env|^(?:let|var)\s|new (?:Set|Map)\(/m,
      );
      expect(code, file).not.toMatch(
        /NeonContactSubmissionStore|getContactSubmissionStore|app\/api/,
      );
    }
  });

  it("reads source: imports the mail only for its factory's type, its notice and its port's own", async () => {
    const { readSource } = await import("../server-source-support");
    const imports = [
      "submit-contact",
      "prepare-submission",
      "deliver-notice",
    ].flatMap((file) =>
      [
        ...readSource(`lib/server/contact/${file}.ts`).matchAll(
          /from "(@\/lib\/server\/mail\/[^"]+)"/g,
        ),
      ].map((match) => match[1]),
    );

    expect([...new Set(imports)].sort()).toEqual([
      "@/lib/server/mail/create-mail-sender",
      "@/lib/server/mail/lead-notification",
      "@/lib/server/mail/mail-sender",
    ]);
  });
});
