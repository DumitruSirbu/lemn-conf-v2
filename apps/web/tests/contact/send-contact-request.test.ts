import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContactSubmissionBody } from "@/contact/contact-form-model";
import {
  CONTACT_SUBMISSIONS_ENDPOINT,
  isFinalOutcome,
  sendContactRequest,
  type FetchContact,
} from "@/contact/send-contact-request";

const BODY: ContactSubmissionBody = {
  contact: {
    name: "Ana Popescu",
    phone: "069 123 456",
    locality: "Chisinau",
    channel: "phone",
    consent: true,
    consentTextVersion: "placeholder",
  },
  design: { id: "design0123456789abcde", revision: "4" },
  clientRequestId: "request-id-00000001",
  locale: "ro",
  honeypot: "",
  elapsedMs: 4200,
};

function respondingWith(response: Response): FetchContact {
  return () => Promise.resolve(response);
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the request that is sent", () => {
  it("is one same-origin POST of the body as JSON to the contact endpoint", async () => {
    const fetchContact = vi.fn<FetchContact>(() =>
      Promise.resolve(jsonResponse(200, { status: "sent", reference: "r" })),
    );

    await sendContactRequest(BODY, fetchContact);

    expect(fetchContact).toHaveBeenCalledTimes(1);
    const [url, init] = fetchContact.mock.calls[0] ?? [];
    expect(url).toBe(CONTACT_SUBMISSIONS_ENDPOINT);
    expect(url?.startsWith("/")).toBe(true);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual(BODY);
  });

  it("carries no abort signal, which would end the form's guard before the server has answered", async () => {
    const fetchContact = vi.fn<FetchContact>(() =>
      Promise.resolve(jsonResponse(200, { status: "sent", reference: "r" })),
    );

    await sendContactRequest(BODY, fetchContact);

    expect(fetchContact.mock.calls[0]?.[1]).not.toHaveProperty("signal");
  });

  it("stays outstanding for two days of waiting, since no timer ends it", async () => {
    vi.useFakeTimers();
    const neverAnswered: FetchContact = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    let isSettled = false;
    void sendContactRequest(BODY, neverAnswered).then(() => {
      isSettled = true;
    });

    await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000);

    expect(isSettled).toBe(false);
  });
});

describe("what the answer becomes", () => {
  it("is sent, with its reference, for a 200 the route says is sent", async () => {
    const outcome = await sendContactRequest(
      BODY,
      respondingWith(jsonResponse(200, { status: "sent", reference: "ref-1" })),
    );

    expect(outcome).toEqual({ kind: "sent", reference: "ref-1" });
  });

  it("reads Retry-After from the answer's headers for a limited send", async () => {
    const outcome = await sendContactRequest(
      BODY,
      respondingWith(
        jsonResponse(
          429,
          { code: "CONTACT_LIMIT_REACHED" },
          { "retry-after": "90" },
        ),
      ),
    );

    expect(outcome).toEqual({ kind: "limited", waitSeconds: 90 });
  });

  it("reads the status and the code together, so a conflict is a conflict", async () => {
    const outcome = await sendContactRequest(
      BODY,
      respondingWith(jsonResponse(409, { code: "CONTACT_REQUEST_CONFLICT" })),
    );

    expect(outcome).toEqual({ kind: "conflict" });
  });

  it.each([200, 409, 502, 503])(
    "is failed for a %s whose body is not JSON",
    async (status) => {
      const outcome = await sendContactRequest(
        BODY,
        respondingWith(new Response("<html>bad gateway</html>", { status })),
      );

      expect(outcome).toEqual({ kind: "failed" });
    },
  );

  it("is unanswered for a request that got no answer, and does not throw", async () => {
    const outcome = await sendContactRequest(BODY, () =>
      Promise.reject(new TypeError("Failed to fetch")),
    );

    expect(outcome).toEqual({ kind: "unanswered" });
  });

  it("is unanswered when fetch throws before it returns a promise", async () => {
    const outcome = await sendContactRequest(BODY, () => {
      throw new TypeError("blocked");
    });

    expect(outcome).toEqual({ kind: "unanswered" });
  });

  it.each([
    ["a TypeError", new TypeError("NetworkError when attempting to fetch")],
    ["an abort", new DOMException("The operation was aborted", "AbortError")],
    ["an Error with no message", new Error("")],
    ["an Error whose text reads like an answer", new Error("503 Bad Gateway")],
  ])(
    "is unanswered for a fetch that rejects with %s: the rejection tells it, not the error's text",
    async (_name, reason) => {
      const outcome = await sendContactRequest(BODY, () =>
        Promise.reject(reason),
      );

      expect(outcome).toEqual({ kind: "unanswered" });
    },
  );

  it.each([502, 503, 500, 404])(
    "is failed, not unanswered, for a %s the browser did receive",
    async (status) => {
      const outcome = await sendContactRequest(
        BODY,
        respondingWith(jsonResponse(status, { code: "ANYTHING" })),
      );

      expect(outcome).toEqual({ kind: "failed" });
    },
  );

  it("is failed, not unanswered, for an answer whose body then fails to read", async () => {
    const unreadable = new Response("{", { status: 200 });

    const outcome = await sendContactRequest(BODY, respondingWith(unreadable));

    expect(outcome).toEqual({ kind: "failed" });
  });
});

describe("isFinalOutcome", () => {
  it.each([
    [{ kind: "sent", reference: "r" }, true],
    [{ kind: "design-not-current" }, true],
    [{ kind: "does-not-fit" }, true],
    [{ kind: "failed" }, false],
    [{ kind: "unanswered" }, false],
    [{ kind: "conflict" }, false],
    [{ kind: "limited", waitSeconds: 5 }, false],
    [{ kind: "refused", issues: [] }, false],
  ] as const)("says %j is final: %s", (outcome, isFinal) => {
    expect(isFinalOutcome(outcome)).toBe(isFinal);
  });
});
