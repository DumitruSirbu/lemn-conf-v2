import { inspect } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MailConfiguration } from "@/lib/server/mail/mail-configuration";
import {
  MAIL_FAILURE_KINDS,
  type MailFailureKind,
  type MailMessage,
  type MailOutcome,
} from "@/lib/server/mail/mail-sender";
import {
  buildResendRequest,
  createResendMailSender,
  MAIL_REQUEST_TIMEOUT_MS,
  MAIL_USER_AGENT,
  RESEND_SEND_URL,
} from "@/lib/server/mail/resend-mail-sender";

import {
  forbidFetch,
  PROCESS_ENV_OR_BUILD_MODE,
  readMailModuleSource,
  releaseFetch,
} from "./mail-test-support";

const FAKE_KEY = "re_FAKEKEY_0123456789";
const CONFIGURATION: MailConfiguration = {
  apiKey: FAKE_KEY,
  fromAddress: "orders@mail.example.com",
  notificationAddress: "inbox@example.com",
};
const MESSAGE: MailMessage = {
  key: "lead-notification/req-1",
  subject: "Cerere din configurator LM-ABCD2345",
  text: "Nume: Test\nTelefon: +37300000000\n",
};

const CUSTOMER_ADDRESS = "customer.marker@example.com";
const CUSTOMER_NAME = "Marker Customer Name";
const CUSTOMER_PHONE = "+37399999999";
const MARKERS = [CUSTOMER_ADDRESS, CUSTOMER_NAME, CUSTOMER_PHONE, FAKE_KEY];
const ERROR_BODY_WITH_PERSONAL_DATA = JSON.stringify({
  name: "validation_error",
  message: `to ${CUSTOMER_ADDRESS} for ${CUSTOMER_NAME} ${CUSTOMER_PHONE} with key ${FAKE_KEY}`,
  statusCode: 400,
});

const encoder = new TextEncoder();

function answer(status: number, body: string | null = null): Response {
  const stream =
    body === null
      ? null
      : new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(body));
            controller.close();
          },
        });
  return { status, body: stream } as unknown as Response;
}

function jsonAnswer(status: number, body: unknown): Response {
  return answer(status, JSON.stringify(body));
}

function stubFetch(
  implementation: (url: string, init: RequestInit) => Promise<Response>,
) {
  const spy = vi.fn(implementation);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function stubAnswer(response: Response) {
  return stubFetch(() => Promise.resolve(response));
}

async function sendOnce(message: MailMessage = MESSAGE): Promise<MailOutcome> {
  return await createResendMailSender(CONFIGURATION).send(message);
}

function describeOutcome(outcome: MailOutcome): string {
  return `${JSON.stringify(outcome)} ${inspect(outcome, { depth: null, showHidden: true })}`;
}

beforeEach(forbidFetch);
afterEach(() => {
  vi.useRealTimers();
  releaseFetch();
});

describe("buildResendRequest", () => {
  const request = buildResendRequest(MESSAGE, CONFIGURATION);

  it("posts to the one documented URL without following a redirect", () => {
    expect(RESEND_SEND_URL).toBe("https://api.resend.com/emails");
    expect(request.url).toBe(RESEND_SEND_URL);
    expect(request.init.method).toBe("POST");
    expect(request.init.redirect).toBe("manual");
  });

  it("sends exactly the four headers, the key as a bearer and as the idempotency key", () => {
    expect(request.init.headers).toEqual({
      Authorization: `Bearer ${FAKE_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": MAIL_USER_AGENT,
      "Idempotency-Key": MESSAGE.key,
    });
    expect(MAIL_USER_AGENT.length).toBeGreaterThan(0);
  });

  it("sends a body of exactly from, to, subject and text, with the configured inbox as the one recipient", () => {
    expect(JSON.parse(request.init.body)).toEqual({
      from: CONFIGURATION.fromAddress,
      to: [CONFIGURATION.notificationAddress],
      subject: MESSAGE.subject,
      text: MESSAGE.text,
    });
  });

  it("builds from named members: extra members on a message reach neither the body nor the headers", () => {
    const extras = {
      ...MESSAGE,
      to: CUSTOMER_ADDRESS,
      cc: CUSTOMER_ADDRESS,
      bcc: CUSTOMER_ADDRESS,
      html: "<b>x</b>",
      headers: { "X-Injected": CUSTOMER_ADDRESS },
      reply_to: CUSTOMER_ADDRESS,
      from: CUSTOMER_ADDRESS,
    } as MailMessage;

    const built = buildResendRequest(extras, CONFIGURATION);

    expect(Object.keys(JSON.parse(built.init.body) as object)).toEqual([
      "from",
      "to",
      "subject",
      "text",
    ]);
    expect(Object.keys(built.init.headers)).toEqual(
      Object.keys(request.init.headers),
    );
    expect(JSON.stringify(built)).not.toContain(CUSTOMER_ADDRESS);
  });

  it("gives the same bytes for the same input", () => {
    expect(buildResendRequest(MESSAGE, CONFIGURATION)).toEqual(request);
  });
});

describe("the sender's one request", () => {
  it("makes one request to the constant URL with the built init and an abort signal", async () => {
    const fetchSpy = stubAnswer(jsonAnswer(200, { id: "msg_1" }));

    await sendOnce();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    const expected = buildResendRequest(MESSAGE, CONFIGURATION);
    expect(url).toBe(RESEND_SEND_URL);
    expect(init).toMatchObject(expected.init);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

interface MappingRow {
  readonly label: string;
  readonly response: () => Response;
  readonly expected: MailOutcome;
}

const ACCEPTED_ROW: MappingRow = {
  label: "200 with a text id",
  response: () => jsonAnswer(200, { id: "msg_1" }),
  expected: { ok: true },
};

function failureRow(
  label: string,
  response: () => Response,
  kind: MailFailureKind,
  status: number,
): MappingRow {
  return {
    label,
    response,
    expected: { ok: false, kind, status } as MailOutcome,
  };
}

const MAPPING_ROWS: readonly MappingRow[] = [
  ACCEPTED_ROW,
  failureRow(
    "200 with no id",
    () => jsonAnswer(200, {}),
    "unreadable-answer",
    200,
  ),
  failureRow(
    "200 with an id that is empty text",
    () => jsonAnswer(200, { id: "" }),
    "unreadable-answer",
    200,
  ),
  failureRow(
    "200 with an id that is not text",
    () => jsonAnswer(200, { id: 5 }),
    "unreadable-answer",
    200,
  ),
  failureRow(
    "200 whose body is not JSON",
    () => answer(200, "<html>ok</html>"),
    "unreadable-answer",
    200,
  ),
  failureRow(
    "200 whose JSON is a list",
    () => jsonAnswer(200, [{ id: "x" }]),
    "unreadable-answer",
    200,
  ),
  failureRow("204 with no body", () => answer(204), "unreadable-answer", 204),
  failureRow(
    "301 with a Location",
    () =>
      new Response(null, {
        status: 301,
        headers: { Location: "https://elsewhere.example.com/" },
      }),
    "unreadable-answer",
    301,
  ),
  failureRow(
    "409 for a mismatched payload",
    () => jsonAnswer(409, { name: "invalid_idempotent_request" }),
    "payload-mismatch",
    409,
  ),
  failureRow(
    "409 for a request in flight",
    () => jsonAnswer(409, { name: "concurrent_idempotent_requests" }),
    "busy",
    409,
  ),
  failureRow(
    "409 for a locked resource",
    () => jsonAnswer(409, { name: "resource_locked" }),
    "busy",
    409,
  ),
  failureRow("409 with no JSON", () => answer(409, "conflict"), "busy", 409),
  failureRow(
    "409 with a name that is not text",
    () => jsonAnswer(409, { name: 5 }),
    "busy",
    409,
  ),
  failureRow(
    "429 for the rate",
    () => jsonAnswer(429, { name: "rate_limit_exceeded" }),
    "busy",
    429,
  ),
  failureRow(
    "429 for the daily quota",
    () => jsonAnswer(429, { name: "daily_quota_exceeded" }),
    "quota-spent",
    429,
  ),
  failureRow(
    "429 for the monthly quota",
    () => jsonAnswer(429, { name: "monthly_quota_exceeded" }),
    "quota-spent",
    429,
  ),
  failureRow(
    "429 with no JSON",
    () => answer(429, "slow down"),
    "quota-spent",
    429,
  ),
  ...[400, 401, 403, 404, 405, 422].map((status) =>
    failureRow(
      String(status),
      () => jsonAnswer(status, { name: "validation_error" }),
      "refused",
      status,
    ),
  ),
  ...[500, 503].map((status) =>
    failureRow(
      String(status),
      () => answer(status, "oops"),
      "unreachable",
      status,
    ),
  ),
];

describe("the sender's mapping of the provider's answer", () => {
  it.each(MAPPING_ROWS)("answers $label as the table says", async (row) => {
    const fetchSpy = stubAnswer(row.response());

    expect(await sendOnce()).toEqual(row.expected);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("has a row for every failure kind an answer can produce", () => {
    const kindsWithARow = new Set(
      MAPPING_ROWS.flatMap((row) =>
        row.expected.ok ? [] : [row.expected.kind],
      ),
    );
    const kindsAnAnswerCanProduce = MAIL_FAILURE_KINDS.filter(
      (kind) => kind !== "timed-out",
    );

    expect([...kindsWithARow].sort()).toEqual(
      [...kindsAnAnswerCanProduce].sort(),
    );
  });

  it("answers a body past the bound as the status alone allows", async () => {
    const huge = "x".repeat(17 * 1024);

    stubAnswer(answer(200, JSON.stringify({ id: "a", pad: huge })));
    const successWithHugeBody = await sendOnce();
    stubAnswer(
      answer(
        409,
        JSON.stringify({ name: "invalid_idempotent_request", pad: huge }),
      ),
    );
    const conflictWithHugeBody = await sendOnce();

    expect(successWithHugeBody).toEqual({
      ok: false,
      kind: "unreadable-answer",
      status: 200,
    });
    expect(conflictWithHugeBody).toEqual({
      ok: false,
      kind: "busy",
      status: 409,
    });
  });
});

describe("the sender's failures before and around the request", () => {
  it("refuses a message that may not be sent, without a status and without a request", async () => {
    const fetchSpy = stubAnswer(jsonAnswer(200, { id: "msg_1" }));

    const outcome = await sendOnce({ ...MESSAGE, key: "has a space" });

    expect(outcome).toEqual({ ok: false, kind: "refused" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads each member of the message once, so what was judged is what is sent", async () => {
    let keyReads = 0;
    const message = {
      get key() {
        keyReads += 1;
        return keyReads === 1 ? MESSAGE.key : "later\r\nX-Injected: 1";
      },
      subject: MESSAGE.subject,
      text: MESSAGE.text,
    };
    const fetchSpy = stubAnswer(jsonAnswer(200, { id: "msg_1" }));

    await sendOnce(message);

    const headers = fetchSpy.mock.calls[0]?.[1].headers as Record<
      string,
      string
    >;
    expect(keyReads).toBe(1);
    expect(headers["Idempotency-Key"]).toBe(MESSAGE.key);
  });

  it("keeps the status and the row of a 429 whose body cannot be asked for", async () => {
    stubAnswer({
      status: 429,
      get body(): never {
        throw new Error(MARKERS.join(" "));
      },
    } as unknown as Response);

    const outcome = await sendOnce();

    expect(outcome).toEqual({ ok: false, kind: "quota-spent", status: 429 });
  });

  it("refuses an empty text without a status and without a request", async () => {
    const fetchSpy = stubAnswer(jsonAnswer(200, { id: "msg_1" }));

    const outcome = await sendOnce({ ...MESSAGE, text: "" });

    expect(outcome).toEqual({ ok: false, kind: "refused" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses rather than rejects when the message cannot be read at all", async () => {
    const fetchSpy = stubAnswer(jsonAnswer(200, { id: "msg_1" }));

    const outcome = await sendOnce(null as unknown as MailMessage);

    expect(outcome).toEqual({ ok: false, kind: "refused" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a rejection",
      () => Promise.reject(new TypeError(`bad ${MARKERS.join(" ")}`)),
    ],
    [
      "a synchronous throw",
      () => {
        throw new Error(`boom ${MARKERS.join(" ")}`);
      },
    ],
    [
      "a rejection that is not an Error",
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test
      () => Promise.reject(MARKERS.join(" ")),
    ],
  ])(
    "answers unreachable, with no status and nothing of the error, for %s",
    async (_label, implementation) => {
      stubFetch(implementation);

      const outcome = await sendOnce();

      expect(outcome).toEqual({ ok: false, kind: "unreachable" });
      for (const marker of MARKERS) {
        expect(describeOutcome(outcome)).not.toContain(marker);
      }
    },
  );

  it("answers unreachable when reading the answer throws", async () => {
    const response = {
      get status(): number {
        throw new Error(MARKERS.join(" "));
      },
    } as unknown as Response;
    stubAnswer(response);

    expect(await sendOnce()).toEqual({ ok: false, kind: "unreachable" });
  });
});

describe("the sender's ten-second bound", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("answers timed out when fetch never settles, and aborts the request", async () => {
    let signal: AbortSignal | undefined;
    stubFetch((_url, init) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });

    const pending = sendOnce();
    await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ ok: false, kind: "timed-out" });
    expect(signal?.aborted).toBe(true);
  });

  it("is ten seconds", () => {
    expect(MAIL_REQUEST_TIMEOUT_MS).toBe(10_000);
  });

  it("answers timed out when the answer's body never ends", async () => {
    const endless = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
    });
    stubAnswer({ status: 200, body: endless } as unknown as Response);

    const pending = sendOnce();
    await vi.advanceTimersByTimeAsync(MAIL_REQUEST_TIMEOUT_MS);

    expect(await pending).toEqual({ ok: false, kind: "timed-out" });
  });

  it("clears its timer when the answer comes", async () => {
    stubAnswer(jsonAnswer(200, { id: "msg_1" }));

    expect(await sendOnce()).toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("what the provider's answer and the key can disclose", () => {
  it.each([400, 401, 403, 404, 409, 422, 429, 500, 503])(
    "keeps nothing of an error body naming a customer, for %i",
    async (status) => {
      stubAnswer(answer(status, ERROR_BODY_WITH_PERSONAL_DATA));

      const outcome = await sendOnce();

      expect(Object.keys(outcome).sort()).toEqual(["kind", "ok", "status"]);
      for (const marker of MARKERS) {
        expect(describeOutcome(outcome)).not.toContain(marker);
      }
    },
  );

  it("takes the status from the response and never from a number in the body", async () => {
    stubAnswer(jsonAnswer(400, { statusCode: 200, status: 200 }));

    expect(await sendOnce()).toEqual({
      ok: false,
      kind: "refused",
      status: 400,
    });
  });
});

describe("every status from 100 to 599, with any body", () => {
  const BODIES: readonly (string | null)[] = [
    null,
    "",
    "not json",
    JSON.stringify({ id: "msg_1" }),
    JSON.stringify({ id: 1 }),
    JSON.stringify({ id: "" }),
    JSON.stringify({ name: "rate_limit_exceeded" }),
    JSON.stringify({ name: "invalid_idempotent_request" }),
    JSON.stringify({ name: "daily_quota_exceeded" }),
    ERROR_BODY_WITH_PERSONAL_DATA,
  ];

  function bodyHasId(body: string | null): boolean {
    return body?.includes('"id":"msg_1"') ?? false;
  }

  function expectedKind(status: number, body: string | null): string {
    if (status >= 200 && status < 300) {
      return bodyHasId(body) ? "ok" : "unreadable-answer";
    }
    if (status === 409) {
      return body?.includes("invalid_idempotent_request")
        ? "payload-mismatch"
        : "busy";
    }
    if (status === 429) {
      return body?.includes("rate_limit_exceeded") ? "busy" : "quota-spent";
    }
    if (status >= 500) return "unreachable";
    if (status >= 400) return "refused";
    return "unreadable-answer";
  }

  it("falls in exactly one kind, with the response's own status and no marker", async () => {
    const wrong: string[] = [];
    for (let status = 100; status <= 599; status += 1) {
      for (const body of BODIES) {
        stubAnswer(answer(status, body));
        const outcome = await sendOnce();
        const kind = outcome.ok ? "ok" : outcome.kind;
        const keysAreAllowed = Object.keys(outcome).every((key) =>
          ["ok", "kind", "status"].includes(key),
        );
        const hasMarker = MARKERS.some((marker) =>
          describeOutcome(outcome).includes(marker),
        );
        const statusIsOwn =
          outcome.ok || (outcome as { status?: number }).status === status;
        if (
          kind !== expectedKind(status, body) ||
          !keysAreAllowed ||
          hasMarker ||
          !statusIsOwn
        ) {
          wrong.push(`${String(status)} ${String(body)}`);
        }
      }
    }

    expect(wrong).toEqual([]);
  });
});

describe("resend-mail-sender.ts", () => {
  const source = readMailModuleSource("resend-mail-sender.ts");

  it("reads source: names neither the process environment, the build mode nor a retry loop", () => {
    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
    expect(source).not.toMatch(/\b(?:for|while)\s*\(/);
  });
});
