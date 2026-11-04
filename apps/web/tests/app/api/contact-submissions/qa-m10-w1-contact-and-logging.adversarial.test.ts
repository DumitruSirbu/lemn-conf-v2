import { DashboardStoreError, NO_ACTIVE_VERSION } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NO_PRICE_BOOK } from "@/price/price-book-root";

// Adversarial QA for M10 wave W1, at the contact route and at a page read of the dashboard: with production's stores the
// database's, no version ever published is the one unavailable answer and no line, a database that cannot answer is the
// same answer and a line, and the stub stores of a process with no database say nothing a second time. The stores are the
// ones `getPriceStores` makes for the environment; only the Neon driver is replaced.

const world = vi.hoisted(() => ({
  priceBook: {} as Record<
    "readActive" | "readDraft",
    (() => Promise<unknown>) | undefined
  >,
  availabilityReads: 0,
  submitContact: vi.fn(),
}));

vi.mock("@lemnaria/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lemnaria/persistence")>()),
  NeonPriceBookStore: vi.fn(function PriceBookStore() {
    return {
      readActive: () => world.priceBook.readActive?.(),
      readDraft: () => world.priceBook.readDraft?.(),
    };
  }),
  NeonCatalogueAvailabilityStore: vi.fn(function AvailabilityStore() {
    return {
      readCurrent: () => {
        world.availabilityReads += 1;
        return Promise.resolve({ revision: "0", disabled: [] });
      },
    };
  }),
}));
vi.mock("@/lib/server/contact/submit-contact", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/server/contact/submit-contact")
    >();
  world.submitContact.mockImplementation(original.submitContact);
  return { ...original, submitContact: world.submitContact };
});
vi.mock("@/lib/server/contact/judge-contact-request", () => ({
  makeContactJudge: () => ({ everyRequest: () => Promise.resolve(undefined) }),
}));
vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => ({}),
}));
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () => ({}),
}));

const { bodyOf } = await import(
  "../../../lib/server/contact/submit-contact-harness"
);
const { POST } = await import("@/app/api/contact-submissions/route");
const { PRICE_STORES_GLOBAL_KEY } = await import("@/lib/server/price-stores");
const { readActivePriceBook } = await import("@/lib/server/active-price-book");
const { readAdmitted } = await import("@/price-dashboard/admitted-state-read");
const { contactUnavailableResponse } = await import(
  "@/lib/server/rate-limit/rate-limited-response"
);

const DATABASE = "postgres://user:pass@w1-qa.database.invalid/db";
const PRICE_BOOK_LINE_LABEL = "[price-book]";

function unavailable(
  operation: ConstructorParameters<typeof DashboardStoreError>[0],
) {
  return new DashboardStoreError(operation, "unavailable");
}

function contactRequest(): NextRequest {
  return new NextRequest("https://lemnaria.test/api/contact-submissions", {
    method: "POST",
    body: bodyOf(),
    headers: {
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
  });
}

function priceBookLines(written: { mock: { calls: unknown[][] } }): unknown[] {
  return written.mock.calls
    .filter(([label]) => label === PRICE_BOOK_LINE_LABEL)
    .map(([, line]) => line);
}

let written: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
  world.priceBook = { readActive: undefined, readDraft: undefined };
  world.availabilityReads = 0;
  world.submitContact.mockClear();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("DATABASE_URL", DATABASE);
  written = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a contact request in a production process whose database holds no version", () => {
  beforeEach(() => {
    world.priceBook.readActive = () => Promise.resolve(NO_ACTIVE_VERSION);
  });

  it("is the one unavailable answer, and the orchestration is never reached", async () => {
    const response = await POST(contactRequest());

    const expected = contactUnavailableResponse();
    expect(response.status).toBe(expected.status);
    expect(await response.json()).toEqual(await expected.json());
    expect(world.submitContact).not.toHaveBeenCalled();
  });

  it("is never priced from the sample, whatever the e2e flag says beside a deployment", async () => {
    vi.stubEnv("LEMNARIA_E2E_FAKE_PRICE_BOOK", "1");

    const response = await POST(contactRequest());

    expect(response.status).toBe(contactUnavailableResponse().status);
    expect(world.submitContact).not.toHaveBeenCalled();
  });

  it("is a root of no book that reads no availability and writes no price-book line", async () => {
    expect(await readActivePriceBook()).toBe(NO_PRICE_BOOK);

    expect(world.availabilityReads).toBe(0);
    expect(priceBookLines(written)).toEqual([]);
  });
});

describe("a contact request in a production process whose database cannot answer", () => {
  it("is the same one unavailable answer, with the cause in a line", async () => {
    world.priceBook.readActive = () =>
      Promise.reject(unavailable("read the active price version"));

    const response = await POST(contactRequest());

    expect(response.status).toBe(contactUnavailableResponse().status);
    expect(world.submitContact).not.toHaveBeenCalled();
    expect(priceBookLines(written)).toEqual([
      {
        event: "no-price-book",
        cause: "store-unavailable",
        operation: "read the active price version",
        kind: "unavailable",
      },
    ]);
  });
});

describe("a page read of the dashboard that meets 'unavailable'", () => {
  const readsTheDraft = () =>
    Promise.reject(unavailable("read the price draft"));

  it("writes one line when the database's store said it, which is an outage", async () => {
    world.priceBook.readDraft = readsTheDraft;

    const read = await readAdmitted(async () => {
      const { priceBook } = await (
        await import("@/lib/server/price-stores")
      ).getPriceStores();
      return priceBook.readDraft();
    });

    expect(read).toEqual({ kind: "unavailable" });
    expect(priceBookLines(written)).toEqual([
      {
        event: "no-price-book",
        cause: "store-unavailable",
        operation: "read the price draft",
        kind: "unavailable",
      },
    ]);
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])(
    "writes no line when no database is named (%s), because the price root already wrote its own",
    async (_, database) => {
      vi.stubEnv("DATABASE_URL", database);

      const read = await readAdmitted(async () => {
        const { priceBook } = await (
          await import("@/lib/server/price-stores")
        ).getPriceStores();
        return priceBook.readDraft();
      });

      expect(read).toEqual({ kind: "unavailable" });
      expect(priceBookLines(written)).toEqual([]);
    },
  );

  it("throws a refused construction on as a defect, and the next read finds the database's store and writes one line", async () => {
    const { NeonPriceBookStore } = await import("@lemnaria/persistence");
    vi.mocked(NeonPriceBookStore).mockImplementationOnce(function Refusing() {
      throw new Error("refused by the driver");
    });
    world.priceBook.readDraft = readsTheDraft;
    const readDraft = async () => {
      const { getPriceStores } = await import("@/lib/server/price-stores");
      return (await getPriceStores()).priceBook.readDraft();
    };

    await expect(readAdmitted(readDraft)).rejects.toThrow("refused");
    const recovered = await readAdmitted(readDraft);

    expect(recovered).toEqual({ kind: "unavailable" });
    expect(priceBookLines(written)).toHaveLength(1);
  });
});
