import {
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK_VERSION,
} from "@lemnaria/configurator-domain";
import { FakeContactSubmissionStore } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import {
  bodyOf,
  callbackBodyOf,
  DESIGN_ID,
  requestOf,
} from "../../../lib/server/contact/submit-contact-harness";

/**
 * The route with the real orchestration behind it, the real judge, the real digest and the real book: only what
 * reaches outside the process is a fake (the store, the sender, the owned load). It proves the wiring the route makes,
 * which a test with the orchestration faked cannot.
 */
const VISITOR_COOKIE = `__Host-lemnaria_visitor=${"a".repeat(43)}`;

const fakes = vi.hoisted(() => ({
  store: undefined as unknown,
  sender: undefined as unknown,
}));

vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => fakes.store,
}));
vi.mock("@/lib/server/contact/sent-mark-store-instance", () =>
  import("../../../support/sent-mark-store-fake").then((fake) =>
    fake.fakeSentMarkStoreModule(),
  ),
);
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () => ({ kind: "sender", sender: fakes.sender }),
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: () =>
    Promise.resolve({
      kind: "found",
      design: KITCHEN_L_DESIGN,
      revision: "1",
    }),
}));

const { POST } = await import(
  "../../../../src/app/api/contact-submissions/route"
);

let store: FakeContactSubmissionStore;
let sender: ReturnType<typeof createFakeMailSender>;

beforeEach(() => {
  store = new FakeContactSubmissionStore();
  sender = createFakeMailSender();
  fakes.store = store;
  fakes.sender = sender;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function post(
  body: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return POST(
    new NextRequest("https://lemnaria.test/api/contact-submissions", {
      method: "POST",
      body,
      headers: {
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        ...headers,
      },
    }),
  );
}

async function jsonOf(answer: Response): Promise<Record<string, unknown>> {
  return (await answer.json()) as Record<string, unknown>;
}

describe("a request through the route", () => {
  it("stores a callback once, answers its reference and sends one notice carrying it", async () => {
    const answer = await post(callbackBodyOf());

    const reference = store.heldSubmissions()[0]?.reference ?? "";
    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({ status: "sent", reference });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.subject).toContain(reference);
  });

  it("stores a design's request priced under the one book this build ships", async () => {
    const answer = await post(bodyOf());

    expect(answer.status).toBe(200);
    const [held] = store.heldSubmissions();
    expect(held?.submission.snapshot?.priced.pricingVersion).toBe(
      SAMPLE_PRICE_BOOK_VERSION,
    );
    expect(held?.submission.target).toMatchObject({
      kind: "design",
      design: { id: DESIGN_ID, revision: "1" },
    });
  });

  it("answers the same reference for the same request again and still holds one row and one notice", async () => {
    const first = await jsonOf(await post(callbackBodyOf()));
    const second = await jsonOf(await post(callbackBodyOf()));

    expect(second).toEqual(first);
    expect(store.heldSubmissions()).toHaveLength(1);
    expect(sender.sent).toHaveLength(1);
  });

  it("answers the refusal of the honeypot and stores nothing", async () => {
    const answer = await post(bodyOf({ honeypot: "filled" }));

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toMatchObject({ code: "CONTACT_REJECTED" });
    expect(store.heldSubmissions()).toHaveLength(0);
    expect(sender.sent).toHaveLength(0);
  });
});

describe("what the route lets be counted, and when", () => {
  it("counts a body that does not parse against every request's bucket, once, before it is read", async () => {
    const recording = vi.spyOn(getRateLimitStore(), "recordHits");

    const answer = await post("{{{ not json");

    expect(answer.status).toBe(400);
    expect(recording).toHaveBeenCalledTimes(1);
    expect(store.heldSubmissions()).toHaveLength(0);
  });

  it("counts nothing for a refusal the route makes before the body is read", async () => {
    const recording = vi.spyOn(getRateLimitStore(), "recordHits");

    await post("{}", { "content-type": "text/plain" });
    await post("{}", { "sec-fetch-site": "cross-site" });
    await post("a".repeat(9 * 1024));

    expect(recording).not.toHaveBeenCalled();
  });

  it("hands the visitor's hash on, so a third new request from one browser in an hour is refused", async () => {
    const ids = [
      "req_aaaaaaaaaaaaaaaa",
      "req_bbbbbbbbbbbbbbbb",
      "req_cccccccccccccccc",
    ];

    const statuses: number[] = [];
    for (const clientRequestId of ids) {
      const answer = await post(
        JSON.stringify(requestOf({ intent: "callback", clientRequestId })),
        { cookie: VISITOR_COOKIE },
      );
      statuses.push(answer.status);
    }

    expect(statuses).toEqual([200, 200, 429]);
    expect(store.heldSubmissions()).toHaveLength(2);
  });
});
