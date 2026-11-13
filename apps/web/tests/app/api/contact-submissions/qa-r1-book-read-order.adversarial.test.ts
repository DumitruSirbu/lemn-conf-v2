import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import {
  DashboardStoreError,
  NO_ACTIVE_VERSION,
  type CatalogueAvailabilityStore,
  type PriceBookStore,
} from "@lemnaria/persistence";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Adversarial QA for M10 wave R1 at the contact route (R-a, R-b, ADR 0157 decision 1): with no book the request is the one
// unavailable answer and reaches nothing past the ports; and nothing that is refused before the every-request judgement,
// or by it, costs a read of the price store.

const spies = vi.hoisted(() => ({
  submitContact: vi.fn(),
  everyRequest: vi.fn(),
  reportContactUnavailable: vi.fn(),
  readActive: vi.fn(),
  readCurrent: vi.fn(),
}));

vi.mock("@/lib/server/contact/submit-contact", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/server/contact/submit-contact")
    >();
  spies.submitContact.mockImplementation(original.submitContact);
  return { ...original, submitContact: spies.submitContact };
});
vi.mock("@/lib/server/contact/judge-contact-request", () => ({
  makeContactJudge: () => ({ everyRequest: spies.everyRequest }),
}));
vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => ({}),
}));
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () => ({}),
}));
vi.mock("@/lib/server/contact/contact-log", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/server/contact/contact-log")
  >()),
  reportContactUnavailable: spies.reportContactUnavailable,
  reportContactRefused: vi.fn(),
}));

const { bodyOf } = await import(
  "../../../lib/server/contact/submit-contact-harness"
);
const { POST } = await import(
  "../../../../src/app/api/contact-submissions/route"
);
const { PRICE_STORES_GLOBAL_KEY } = await import("@/lib/server/price-stores");
const { contactUnavailableResponse } = await import(
  "@/lib/server/rate-limit/rate-limited-response"
);

const LIMITED_STATUS = 429;

function plantStores(stored: "none" | "sample" | "unavailable"): void {
  spies.readActive.mockImplementation(() => {
    if (stored === "unavailable") {
      return Promise.reject(
        new DashboardStoreError("read the active price version", "unavailable"),
      );
    }
    if (stored === "none") return Promise.resolve(NO_ACTIVE_VERSION);
    return Promise.resolve({
      kind: "found",
      version: {
        versionId: "v-1",
        sequenceNumber: 1,
        label: "A label",
        publishedAt: new Date(0),
        book: SAMPLE_PRICE_BOOK,
      },
    });
  });
  spies.readCurrent.mockResolvedValue({ revision: "0", disabled: [] });
  Reflect.set(
    globalThis,
    PRICE_STORES_GLOBAL_KEY,
    Promise.resolve({
      priceBook: { readActive: spies.readActive } as unknown as PriceBookStore,
      availability: {
        readCurrent: spies.readCurrent,
      } as unknown as CatalogueAvailabilityStore,
    }),
  );
}

/** A text that parses and names a design: the only kind of request that reads a book. */
const DESIGN_BODY = bodyOf();

function contactRequest(
  overrides: Record<string, string> = {},
  body: BodyInit = DESIGN_BODY,
): NextRequest {
  return new NextRequest("https://lemnaria.test/api/contact-submissions", {
    method: "POST",
    body,
    headers: {
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...overrides,
    },
  });
}

beforeEach(() => {
  spies.everyRequest.mockResolvedValue(undefined);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
  Object.values(spies).forEach((spy) => spy.mockClear());
});

describe("a contact request with no book to price under (R-b)", () => {
  it.each([
    ["no version was ever published", "none"],
    ["the price store cannot answer", "unavailable"],
  ] as const)(
    "is the one unavailable answer, and the orchestration is never reached, when %s",
    async (_, stored) => {
      plantStores(stored);

      const response = await POST(contactRequest());

      const unavailable = contactUnavailableResponse();
      expect(response.status).toBe(unavailable.status);
      expect(await response.json()).toEqual(await unavailable.json());
      expect(response.headers.get("retry-after")).toBe(
        unavailable.headers.get("retry-after"),
      );
      expect(spies.submitContact).not.toHaveBeenCalled();
    },
  );

  it("writes one unavailable line with the cause unexpected, and no word of the book", async () => {
    plantStores("none");

    await POST(contactRequest());

    expect(spies.reportContactUnavailable).toHaveBeenCalledTimes(1);
    expect(spies.reportContactUnavailable).toHaveBeenCalledWith(
      "no-price-book",
    );
  });

  it("is not asked for a text that does not parse as a request, which is invalid and not unavailable", async () => {
    plantStores("none");

    const response = await POST(contactRequest({}, "{}"));

    expect(response.status).toBe(400);
    expect(spies.readActive).not.toHaveBeenCalled();
  });
});

describe("what is refused before the ports are made costs the price store nothing", () => {
  it.each([
    ["a cross-site request", { "sec-fetch-site": "cross-site" }],
    ["a request that is not JSON", { "content-type": "text/plain" }],
  ] as const)("%s", async (_, headers) => {
    plantStores("sample");

    const response = await POST(contactRequest(headers));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(spies.readActive).not.toHaveBeenCalled();
    expect(spies.readCurrent).not.toHaveBeenCalled();
  });

  it("an oversize body", async () => {
    plantStores("sample");

    const response = await POST(contactRequest({}, "x".repeat(64 * 1024)));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(spies.readActive).not.toHaveBeenCalled();
  });
});

describe("every request is judged first, before the price store is read (ADR 0157 decision 1)", () => {
  // The route makes its ports before the orchestration asks the every-request bucket, and the ports now read the price
  // store: once the Neon store exists, a flood the limiter would refuse costs one database read per request.
  it("a request the every-request bucket refuses reads no price book", async () => {
    plantStores("sample");
    spies.everyRequest.mockResolvedValue(
      NextResponse.json({ code: "RATE_LIMITED" }, { status: LIMITED_STATUS }),
    );

    const response = await POST(contactRequest());

    expect(response.status).toBe(LIMITED_STATUS);
    expect(spies.readActive).not.toHaveBeenCalled();
  });

  it("a request the every-request bucket refuses is the limiter's answer, not unavailable, while the price store is down", async () => {
    plantStores("unavailable");
    spies.everyRequest.mockResolvedValue(
      NextResponse.json({ code: "RATE_LIMITED" }, { status: LIMITED_STATUS }),
    );

    const response = await POST(contactRequest());

    expect(response.status).toBe(LIMITED_STATUS);
  });
});
