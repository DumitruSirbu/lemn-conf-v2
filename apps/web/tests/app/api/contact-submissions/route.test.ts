import { createHash } from "node:crypto";

import {
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "@lemnaria/configurator-domain";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ContactBody,
  SubmitContactPorts,
} from "@/lib/server/contact/submit-contact";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import { readSource } from "../../../lib/server/server-source-support";
import { contentFor } from "../../../support/catalogues";
import roMessages from "../../../../src/messages/ro.json";
import ruMessages from "../../../../src/messages/ru.json";
import type { Catalogue } from "../../../support/catalogues";

/**
 * The route's own work and nothing past it: the orchestration is a spy that answers a sentinel, so what is asserted is
 * what the route did before it, what it handed over, and what it never did itself.
 */
const BODY_BOUND_BYTES = 8 * 1024;
const SENTINEL_STATUS = 299;
const A_STORE = { which: "the store instance" };
const MAIL_ENVIRONMENT_MARKER = "a-sender-from-the-factory";
const FAILURE_MARKER = "FORBIDDEN-FAILURE-MARKER-4471";
const WELL_FORMED_VISITOR_VALUE = "v".repeat(43);

type NextRequestInit = NonNullable<
  ConstructorParameters<typeof NextRequest>[1]
>;

const spies = vi.hoisted(() => ({
  submitContact: vi.fn(),
  makeContactJudge: vi.fn(),
  createMailSender: vi.fn(),
  loadOwnedDesign: vi.fn(),
  getContactSubmissionStore: vi.fn(),
  parsePriceBook: vi.fn(),
  reportContactRefused: vi.fn(),
  reportContactUnavailable: vi.fn(),
}));

vi.mock("@/lib/server/contact/submit-contact", () => ({
  submitContact: spies.submitContact,
}));
vi.mock("@/lib/server/contact/judge-contact-request", () => ({
  makeContactJudge: spies.makeContactJudge,
}));
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: spies.createMailSender,
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: spies.loadOwnedDesign,
}));
vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: spies.getContactSubmissionStore,
}));
vi.mock("@/lib/server/contact/contact-log", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/server/contact/contact-log")
  >()),
  reportContactRefused: spies.reportContactRefused,
  reportContactUnavailable: spies.reportContactUnavailable,
}));
vi.mock("@lemnaria/configurator-domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lemnaria/configurator-domain")>()),
  parsePriceBook: spies.parsePriceBook,
}));

const { POST } = await import(
  "../../../../src/app/api/contact-submissions/route"
);

beforeEach(() => {
  spies.submitContact.mockImplementation(() =>
    Promise.resolve(
      NextResponse.json({ sentinel: true }, { status: SENTINEL_STATUS }),
    ),
  );
  spies.getContactSubmissionStore.mockReturnValue(A_STORE);
  spies.createMailSender.mockReturnValue(MAIL_ENVIRONMENT_MARKER);
  spies.makeContactJudge.mockReturnValue({ which: "a judge" });
  spies.parsePriceBook.mockImplementation((declared: unknown) => ({
    ok: true,
    book: declared,
  }));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  Object.values(spies).forEach((spy) => spy.mockReset());
});

/** A header handed as `undefined` is one the client did not send. */
function contactRequest(
  body: BodyInit | null,
  overrides: Record<string, string | undefined> = {},
): NextRequest {
  const sent: Record<string, string | undefined> = {
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
    ...overrides,
  };
  const headers = Object.entries(sent).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return new NextRequest("https://lemnaria.test/api/contact-submissions", {
    method: "POST",
    body,
    headers,
  });
}

function streamOf(chunks: readonly Uint8Array[], failAfter?: Error) {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[pulled];
      pulled += 1;
      if (chunk !== undefined) {
        controller.enqueue(chunk);
        return;
      }
      if (failAfter !== undefined) controller.error(failAfter);
      else controller.close();
    },
  });
  return { stream, pulledChunks: () => pulled };
}

function streamedRequest(stream: ReadableStream<Uint8Array>): NextRequest {
  return new NextRequest("https://lemnaria.test/api/contact-submissions", {
    method: "POST",
    body: stream,
    headers: {
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    duplex: "half",
  } satisfies NextRequestInit & { duplex: "half" });
}

async function codeOf(answer: Response): Promise<unknown> {
  return ((await answer.clone().json()) as { code?: unknown }).code;
}

async function recordedHits(act: () => Promise<unknown>): Promise<number> {
  const recording = vi.spyOn(getRateLimitStore(), "recordHits");
  await act();
  return recording.mock.calls.length;
}

function handedPorts(): SubmitContactPorts {
  const [, ports] = spies.submitContact.mock.calls[0] as [
    ContactBody,
    SubmitContactPorts,
  ];
  return ports;
}

function handedBody(): ContactBody {
  const [body] = spies.submitContact.mock.calls[0] as [ContactBody];
  return body;
}

describe("the guard and the content type, before a byte of the body is read", () => {
  it.each([
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
    ["a same-site sibling's fetch", { "sec-fetch-site": "same-site" }],
    [
      "a foreign origin from a client that states no fetch site",
      { origin: "https://elsewhere.test", "sec-fetch-site": undefined },
    ],
  ])(
    "answers 403 for %s, counts nothing and reads nothing",
    async (_title, headers) => {
      const request = contactRequest('{"a":1}', headers);

      const hits = await recordedHits(async () => {
        const answer = await POST(request);
        expect(answer.status).toBe(403);
        expect(await codeOf(answer)).toBe("CONTACT_CROSS_SITE");
      });

      expect(hits).toBe(0);
      expect(request.bodyUsed).toBe(false);
      expect(spies.submitContact).not.toHaveBeenCalled();
      expect(spies.getContactSubmissionStore).not.toHaveBeenCalled();
      expect(spies.reportContactRefused).toHaveBeenCalledWith(
        "CONTACT_CROSS_SITE",
      );
    },
  );

  it.each([
    ["none", undefined],
    ["text/plain", "text/plain"],
    ["a longer subtype", "application/jsonx"],
    ["a suffix type", "application/json-patch+json"],
    ["a form", "application/x-www-form-urlencoded"],
    ["a multipart form", "multipart/form-data; boundary=x"],
    ["an empty value", ""],
  ])(
    "answers 415 for a body whose content type is %s, uncounted and unread",
    async (_title, contentType) => {
      const request = contactRequest('{"a":1}', {
        "content-type": contentType,
      });

      const hits = await recordedHits(async () => {
        const answer = await POST(request);
        expect(answer.status).toBe(415);
        expect(await codeOf(answer)).toBe("CONTACT_NOT_JSON");
      });

      expect(hits).toBe(0);
      expect(request.bodyUsed).toBe(false);
      expect(spies.submitContact).not.toHaveBeenCalled();
      expect(spies.getContactSubmissionStore).not.toHaveBeenCalled();
      expect(spies.reportContactRefused).toHaveBeenCalledWith(
        "CONTACT_NOT_JSON",
      );
    },
  );

  it.each([
    "application/json",
    "application/json; charset=utf-8",
    "Application/JSON",
    "  application/json  ;charset=UTF-8",
  ])(
    "takes %j for JSON, whatever its case and parameters",
    async (contentType) => {
      const answer = await POST(
        contactRequest("{}", { "content-type": contentType }),
      );

      expect(answer.status).toBe(SENTINEL_STATUS);
      expect(spies.submitContact).toHaveBeenCalledTimes(1);
    },
  );

  it("asks the guard before the content type", async () => {
    const request = contactRequest("x", {
      "sec-fetch-site": "cross-site",
      "content-type": "text/plain",
    });

    expect((await POST(request)).status).toBe(403);
  });
});

describe("the body is read to its bound, counted as it is read", () => {
  it("hands a body of exactly the bound over whole", async () => {
    const text = "a".repeat(BODY_BOUND_BYTES);

    await POST(contactRequest(text));

    expect(handedBody().text).toBe(text);
  });

  it("answers 413 one byte past the bound, with nothing counted, made or handed over", async () => {
    const request = contactRequest("a".repeat(BODY_BOUND_BYTES + 1));

    const hits = await recordedHits(async () => {
      const answer = await POST(request);
      expect(answer.status).toBe(413);
      expect(await codeOf(answer)).toBe("CONTACT_BODY_TOO_LARGE");
    });

    expect(hits).toBe(0);
    expect(spies.submitContact).not.toHaveBeenCalled();
    expect(spies.getContactSubmissionStore).not.toHaveBeenCalled();
    expect(spies.parsePriceBook).not.toHaveBeenCalled();
    expect(spies.reportContactRefused).toHaveBeenCalledWith(
      "CONTACT_BODY_TOO_LARGE",
    );
  });

  it("counts bytes and not characters: two-byte characters are past the bound at half as many", async () => {
    const exactlyTheBound = "é".repeat(BODY_BOUND_BYTES / 2);
    const oneCharacterPast = "é".repeat(BODY_BOUND_BYTES / 2 + 1);

    expect((await POST(contactRequest(exactlyTheBound))).status).toBe(
      SENTINEL_STATUS,
    );
    expect((await POST(contactRequest(oneCharacterPast))).status).toBe(413);
  });

  it("stops reading a chunked body that states no length at the first chunk past the bound", async () => {
    const chunk = new Uint8Array(BODY_BOUND_BYTES / 2).fill(97);
    const { stream, pulledChunks } = streamOf(
      Array.from({ length: 1000 }, () => chunk),
    );

    const answer = await POST(streamedRequest(stream));

    expect(answer.status).toBe(413);
    expect(pulledChunks()).toBeLessThan(10);
  });

  it("answers 400 when the stream breaks, as a request that holds nothing to refuse", async () => {
    const { stream } = streamOf(
      [new TextEncoder().encode("{")],
      new Error(FAILURE_MARKER),
    );

    const answer = await POST(streamedRequest(stream));

    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({
      code: "CONTACT_INVALID",
      issues: [],
    });
    expect(JSON.stringify(spies.reportContactRefused.mock.calls)).not.toContain(
      FAILURE_MARKER,
    );
    expect(spies.submitContact).not.toHaveBeenCalled();
  });
});

describe("the route parses nothing and asks no judgement", () => {
  it.each([
    ["an empty body", ""],
    ["text that is not JSON", "{{{ not json"],
    ["JSON that is not an object", "null"],
    ["an array", "[]"],
    ["an object the schema would refuse", '{"clientRequestId":1}'],
    ["eight kilobytes of opening brackets", "[".repeat(BODY_BOUND_BYTES)],
  ])(
    "hands %s to the orchestration exactly as it came and answers what that answers",
    async (_title, text) => {
      const answer = await POST(contactRequest(text));

      expect(handedBody().text).toBe(text);
      expect(answer.status).toBe(SENTINEL_STATUS);
      expect(spies.reportContactRefused).not.toHaveBeenCalled();
    },
  );

  it("never asks a judgement itself: the judge is made only when the orchestration asks for one", async () => {
    await POST(contactRequest("{}"));

    expect(spies.makeContactJudge).not.toHaveBeenCalled();
    expect(await recordedHits(() => POST(contactRequest("{}")))).toBe(0);
  });

  it("makes the judge of the request's headers, the process's environment and the instant asked for", async () => {
    const request = contactRequest("{}", { "x-forwarded-for": "192.0.2.9" });
    await POST(request);
    const instant = new Date("2026-07-15T12:20:00Z");

    handedPorts().makeJudge(instant);

    expect(spies.makeContactJudge).toHaveBeenCalledTimes(1);
    expect(spies.makeContactJudge).toHaveBeenCalledWith({
      environment: process.env,
      headers: request.headers,
      instant,
    });
  });
});

describe("the production ports, each made inside the request", () => {
  it("hands the store's instance, the served locales, the owned load and the clock", async () => {
    await POST(contactRequest("{}"));

    const ports = handedPorts();
    expect(ports.store).toBe(A_STORE);
    expect(ports.servedLocales).toEqual(["ro", "ru"]);
    expect(ports.loadOwned).toBe(spies.loadOwnedDesign);
    expect(Math.abs(ports.now().getTime() - Date.now())).toBeLessThan(5_000);
  });

  it("hands a sender factory that reads the process's environment when it is called, and not before", async () => {
    await POST(contactRequest("{}"));
    expect(spies.createMailSender).not.toHaveBeenCalled();

    const created = handedPorts().createSender();

    expect(created).toBe(MAIL_ENVIRONMENT_MARKER);
    expect(spies.createMailSender).toHaveBeenCalledWith(process.env);
  });

  it("hands a digester made from the process's secret", async () => {
    await POST(contactRequest("{}"));

    expect(handedPorts().digester.status).toBe("usable");
  });

  it("writes the shop's notice in Romanian and never in the other language", async () => {
    await POST(contactRequest("{}", { cookie: "NEXT_LOCALE=ru" }));

    const content = JSON.stringify(handedPorts().noticeContent);
    expect(content).toBe(JSON.stringify(contentFor("ro", roMessages)));
    expect(content).not.toBe(
      JSON.stringify(contentFor("ru", ruMessages as Catalogue)),
    );
  });

  it("makes one book for a request, the sample book this build ships, and the same one it hands over", async () => {
    await POST(contactRequest("{}"));

    expect(spies.parsePriceBook).toHaveBeenCalledTimes(1);
    expect(spies.parsePriceBook).toHaveBeenCalledWith(SAMPLE_PRICE_BOOK);
    expect(handedPorts().book).toBe(SAMPLE_PRICE_BOOK);
    expect(handedPorts().book.version).toBe(SAMPLE_PRICE_BOOK_VERSION);
  });

  it("makes another book and other ports for the next request, and holds none at module level", async () => {
    await POST(contactRequest("{}"));
    await POST(contactRequest("{}"));

    expect(spies.parsePriceBook).toHaveBeenCalledTimes(2);
    const [first, second] = spies.submitContact.mock.calls.map(
      ([, ports]) => ports as object,
    );
    expect(first).not.toBe(second);
  });
});

describe("the visitor's hash, handed over beside the text and asked of no bucket by the route", () => {
  it("hands the hash of a well-formed visitor cookie", async () => {
    const hash = createHash("sha256")
      .update(WELL_FORMED_VISITOR_VALUE)
      .digest("hex");

    await POST(
      contactRequest("{}", {
        cookie: `__Host-lemnaria_visitor=${WELL_FORMED_VISITOR_VALUE}`,
      }),
    );

    expect(handedBody().visitorHash).toBe(hash);
  });

  it.each([
    ["no cookie", undefined],
    ["a malformed one", "__Host-lemnaria_visitor=short"],
    ["another cookie's name", `lemnaria_visitor=${WELL_FORMED_VISITOR_VALUE}`],
  ])("hands none for %s", async (_title, cookie) => {
    await POST(contactRequest("{}", cookie === undefined ? {} : { cookie }));

    expect(handedBody().visitorHash).toBeUndefined();
  });
});

describe("a request that cannot be given its ports", () => {
  it("answers unavailable when the store cannot be made, with a cause and nothing a throw said", async () => {
    spies.getContactSubmissionStore.mockImplementation(() => {
      throw new Error(FAILURE_MARKER);
    });

    const answer = await POST(contactRequest("{}"));

    expect(answer.status).toBe(503);
    expect(await codeOf(answer)).toBe("CONTACT_UNAVAILABLE");
    expect(spies.reportContactUnavailable).toHaveBeenCalledWith("unexpected");
    expect(
      JSON.stringify(spies.reportContactUnavailable.mock.calls),
    ).not.toContain(FAILURE_MARKER);
    expect(JSON.stringify(await answer.clone().text())).not.toContain(
      FAILURE_MARKER,
    );
    expect(spies.submitContact).not.toHaveBeenCalled();
  });

  it("answers the same unavailable answer when the book this build ships cannot be read", async () => {
    spies.parsePriceBook.mockReturnValue({
      ok: false,
      failure: { detail: FAILURE_MARKER },
    });

    const answer = await POST(contactRequest("{}"));

    expect(answer.status).toBe(503);
    expect(await codeOf(answer)).toBe("CONTACT_UNAVAILABLE");
    expect(spies.reportContactUnavailable).toHaveBeenCalledWith("unexpected");
    expect(JSON.stringify(await answer.clone().text())).not.toContain(
      FAILURE_MARKER,
    );
    expect(spies.submitContact).not.toHaveBeenCalled();
  });
});

describe("no answer of the route sets, clears or refreshes a cookie", () => {
  it("holds for the guard's, content type's, bound's, broken stream's and unavailable answers", async () => {
    spies.getContactSubmissionStore.mockImplementation(() => {
      throw new Error("down");
    });
    const { stream } = streamOf([], new Error("broken"));
    const answers = await Promise.all([
      POST(contactRequest("{}", { "sec-fetch-site": "cross-site" })),
      POST(contactRequest("{}", { "content-type": "text/plain" })),
      POST(contactRequest("a".repeat(BODY_BOUND_BYTES + 1))),
      POST(streamedRequest(stream)),
      POST(contactRequest("{}")),
    ]);

    expect(answers.map(({ status }) => status)).toEqual([
      403, 415, 413, 400, 503,
    ]);
    answers.forEach((answer) => {
      expect(answer.headers.get("set-cookie")).toBeNull();
    });
  });
});

describe("what the route composes, and what it leaves to lib/server", () => {
  const specifiersOf = (source: string): string[] =>
    [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1] ?? "");

  it("reads source: imports no digest, price-book, mail or message module and names no environment", () => {
    const source = readSource("app/api/contact-submissions/route.ts");

    const forbidden = specifiersOf(source).filter((specifier) =>
      /digest|mail|messages|next-intl|configurator-domain|shipped-price-book/.test(
        specifier,
      ),
    );
    expect(forbidden).toEqual([]);
    expect(source).not.toMatch(/process\.env|SAMPLE_PRICE_BOOK|parsePriceBook/);
  });

  it("makes its ports once for a request, from the request's own headers", async () => {
    const request = contactRequest("{}", { "x-forwarded-for": "192.0.2.9" });

    await POST(request);
    handedPorts().makeJudge(new Date(0));

    expect(spies.getContactSubmissionStore).toHaveBeenCalledTimes(1);
    expect(spies.makeContactJudge).toHaveBeenCalledWith(
      expect.objectContaining({ headers: request.headers }),
    );
  });
});
