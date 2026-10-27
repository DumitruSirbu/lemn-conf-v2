import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import type {
  CatalogueAvailabilityStore,
  PriceBookStore,
} from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRICE_STORES_GLOBAL_KEY } from "@/lib/server/price-stores";

import {
  consoleCallsOf,
  spyOnEveryConsoleMethod,
} from "../../../lib/server/mail/mail-test-support";
import {
  byEmail,
  callbackRequest,
  codeOf,
  contactRequest,
  designRequest,
  loadRoute,
  nameTheNetworkSource,
  resetOutside,
  send,
  SUBMITTED_MARKERS,
  type Fields,
  type Outside,
  type Post,
} from "./qa-8k-support";

// Adversarial QA for M10 wave R1's review rulings (m-1): the callback form prices nothing and so needs no book, a request
// that names a design needs one and is the one unavailable answer without it, with nothing stored or sent, and the lines
// written say only a cause of a closed list, never a word of a book or of what the customer sent.

const outside = vi.hoisted(() => ({}) as Outside);

vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => outside.store,
}));
vi.mock("@/lib/server/contact/sent-mark-store-instance", () =>
  import("../../../support/sent-mark-store-fake").then((fake) =>
    fake.fakeSentMarkStoreModule(),
  ),
);
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () => ({ kind: "sender", sender: outside.sender }),
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: (designId: string) => outside.load(designId),
}));

type Stored = "none" | "unavailable" | "unparseable" | "version-mismatch";

const STORED_VERSION_ID = "stored-version-id";
const BOOK_CONTENT_MARKERS = ["cabinetRules", "wholeKitchenMinor", "ruleId"];

let post: Post;
let consoleSpies: ReturnType<typeof spyOnEveryConsoleMethod>;
let readActive: ReturnType<typeof vi.fn>;

/** The port's refusals are built from the package as the route loaded it: `loadRoute` resets the module graph, and an error
 *  of the class from before the reset is not an instance of the class the reader tests for. */
async function plantStores(stored: Stored): Promise<void> {
  const { DashboardStoreError, NO_ACTIVE_VERSION } = await import(
    "@lemnaria/persistence"
  );
  readActive = vi.fn(() => {
    if (stored === "none") return Promise.resolve(NO_ACTIVE_VERSION);
    if (stored === "unavailable") {
      return Promise.reject(
        new DashboardStoreError("read the active price version", "unavailable"),
      );
    }
    const book =
      stored === "unparseable"
        ? { not: "a price book" }
        : { ...SAMPLE_PRICE_BOOK, version: "another-version-text" };
    return Promise.resolve({
      kind: "found" as const,
      version: {
        versionId: STORED_VERSION_ID,
        sequenceNumber: 1,
        label: "A label",
        publishedAt: new Date(0),
        book,
      },
    });
  });
  Reflect.set(
    globalThis,
    PRICE_STORES_GLOBAL_KEY,
    Promise.resolve({
      priceBook: { readActive } as unknown as PriceBookStore,
      availability: {
        readCurrent: () => Promise.resolve({ revision: "0", disabled: [] }),
      } as unknown as CatalogueAvailabilityStore,
    }),
  );
}

beforeEach(async () => {
  consoleSpies = spyOnEveryConsoleMethod();
  nameTheNetworkSource();
  resetOutside(outside);
  post = await loadRoute();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function sendDesign(overrides: Fields = {}): Promise<Response> {
  return send(post, designRequest(overrides, byEmail()), {
    withVisitor: true,
  });
}

function linesWritten(): Record<string, unknown>[] {
  return consoleCallsOf(consoleSpies).map(
    ([label, line]) =>
      ({ label, ...((line ?? {}) as object) }) as Record<string, unknown>,
  );
}

const NO_BOOK_STATES: readonly Stored[] = [
  "none",
  "unavailable",
  "unparseable",
  "version-mismatch",
];

describe.each(NO_BOOK_STATES)("with no book (%s)", (stored) => {
  it("stores and sends a callback, and asks the price store nothing", async () => {
    await plantStores(stored);

    const answer = await send(post, callbackRequest({}, byEmail()), {
      withVisitor: true,
    });

    expect(answer.status).toBe(200);
    expect(outside.heldStore.heldSubmissions()).toHaveLength(1);
    expect(outside.fakeSender.sent).toHaveLength(1);
    expect(readActive).not.toHaveBeenCalled();
  });

  it("refuses a request that names a design as the one unavailable answer, with nothing stored, sent or loaded", async () => {
    await plantStores(stored);

    const answer = await sendDesign();

    expect(answer.status).toBe(503);
    expect(await codeOf(answer)).toBe("CONTACT_UNAVAILABLE");
    expect(outside.heldStore.heldSubmissions()).toHaveLength(0);
    expect(outside.fakeSender.sent).toHaveLength(0);
    expect(outside.loadsAsked).toEqual([]);
  });

  it("writes lines that say a cause and a store's operation and kind, and nothing of a book or of the customer", async () => {
    await plantStores(stored);

    await sendDesign();

    const lines = linesWritten();
    const text = JSON.stringify(lines);
    const priceBookLines = lines.filter(
      ({ label }) => label === "[price-book]",
    );
    const contactLines = lines.filter(
      ({ event }) => event === "contact-request-unavailable",
    );
    expect(contactLines).toHaveLength(1);
    expect(contactLines[0]?.cause).toBe("no-price-book");
    expect(priceBookLines.length).toBe(stored === "none" ? 0 : 1);
    for (const line of priceBookLines) {
      expect(Object.keys(line).sort()).toEqual(
        expect.arrayContaining(["cause", "event", "label"]),
      );
      expect(Object.keys(line).length).toBeLessThanOrEqual(5);
    }
    for (const marker of [...SUBMITTED_MARKERS, ...BOOK_CONTENT_MARKERS]) {
      expect(text).not.toContain(marker);
    }
    expect(text).not.toContain(STORED_VERSION_ID);
    expect(text).not.toContain("another-version-text");
  });
});

describe("what a request that names no design costs the price store", () => {
  it("is nothing for a text that does not parse, a design request with an invalid field, and a callback", async () => {
    await plantStores("none");

    const garbled = await post(contactRequest("{}"));
    const invalid = await sendDesign({ locale: "xx" });
    await send(post, callbackRequest({}, byEmail()));

    expect(garbled.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(readActive).not.toHaveBeenCalled();
  });
});
