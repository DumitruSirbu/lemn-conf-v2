import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONTACT_PAGE_READ_DEADLINE_MS } from "@/lib/server/contact/sent-reference";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import ContactPage from "../../src/app/[locale]/d/[id]/contact/page";

import { readSource } from "../lib/server/server-source-support";
import { withoutPriceBook } from "../support/price-book-wrapper";

/**
 * What the contact page reads of a sent request, and where (ADR 0163 A2 to A4 and A8; 8M2 criteria 10, 25 and 26): only
 * after the owned load allowed, never in parallel with it, at the revision it read, answered per request, with no
 * limiter call of its own and a deadline that turns a slow read into `unknown`.
 */

const OWNER_VALUE = "O".repeat(43);
const OWNED_ROW_ID = "ownedRow____________1";

interface PendingLoad {
  readonly resolve: (outcome: unknown) => void;
}

const loadOwned = vi.hoisted(() => vi.fn());
const findSentReference = vi.hoisted(() => vi.fn());
const rateLimitStoreRequested = vi.hoisted(() => vi.fn());
const hydrateAndContact = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({ loadOwned }),
}));
vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => ({ findSentReference }),
}));
vi.mock("@/lib/server/rate-limit/rate-limit-store-instance", () => ({
  getRateLimitStore: () => {
    rateLimitStoreRequested();
    throw new Error("the contact page asked for the limiter's store");
  },
}));
vi.mock("@/app/d/[id]/contact/hydrate-and-contact", () => ({
  HydrateAndContact: hydrateAndContact,
}));
vi.mock("@/app/d/[id]/design-load-error", () => ({
  DesignLoadError: () => null,
}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === "__Host-lemnaria_visitor" ? { value: OWNER_VALUE } : undefined,
    }),
}));

function foundAt(revision: string): unknown {
  return { kind: "found", design: KITCHEN_L_DESIGN, revision };
}

function renderContactPage(extra: object = {}): Promise<unknown> {
  return ContactPage({
    params: Promise.resolve({ locale: "ro", id: OWNED_ROW_ID }),
    ...extra,
  } as Parameters<typeof ContactPage>[0]);
}

function propsOf(page: unknown): Record<string, unknown> {
  const element = withoutPriceBook(page);
  if (!isValidElement<Record<string, unknown>>(element))
    throw new Error("the page returned a non-element");
  return element.props;
}

function aDeferredLoad(): PendingLoad {
  let resolve: (outcome: unknown) => void = () => undefined;
  loadOwned.mockReturnValue(
    new Promise((settle) => {
      resolve = settle;
    }),
  );
  return {
    resolve: (outcome) => {
      resolve(outcome);
    },
  };
}

async function letPendingWorkRun(): Promise<void> {
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
}

beforeEach(() => {
  loadOwned.mockReset();
  loadOwned.mockResolvedValue(foundAt("7"));
  findSentReference.mockReset();
  findSentReference.mockResolvedValue({ kind: "none" });
  rateLimitStoreRequested.mockReset();
  hydrateAndContact.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("DIGEST_SECRET", "0".repeat(64));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("where the read sits", () => {
  it("is not made while the owned load is pending, and is made once after it allows", async () => {
    const load = aDeferredLoad();

    const rendering = renderContactPage();
    await letPendingWorkRun();
    expect(findSentReference).not.toHaveBeenCalled();

    load.resolve(foundAt("7"));
    await rendering;

    expect(findSentReference.mock.calls).toEqual([
      [{ designId: OWNED_ROW_ID, revision: "7" }],
    ]);
  });

  it.each(["7", "12", "3"])(
    "asks for the revision the owned load read, %s, and for no other",
    async (revision) => {
      loadOwned.mockResolvedValue(foundAt(revision));

      await renderContactPage();

      expect(findSentReference.mock.calls).toEqual([
        [{ designId: OWNED_ROW_ID, revision }],
      ]);
    },
  );

  it("takes no revision from the request's search parameters, which it never reads", async () => {
    await renderContactPage({
      searchParams: Promise.resolve({ revision: "99", designId: "other" }),
    });

    expect(findSentReference.mock.calls).toEqual([
      [{ designId: OWNED_ROW_ID, revision: "7" }],
    ]);
  });

  it("reads source: the first read follows the refused-return, and no parallel form of work is named", () => {
    const page = readSource("app/[locale]/d/[id]/contact/page.tsx");

    const refusedReturn = page.indexOf("return <DesignLoadError");
    const firstRead = page.indexOf("readSentReference(");
    expect(refusedReturn).toBeGreaterThan(-1);
    expect(firstRead).toBeGreaterThan(refusedReturn);
    expect(page).not.toMatch(
      /Promise\.all|allSettled|Promise\.race|searchParams/,
    );
  });
});

describe("what is handed on", () => {
  it("is exactly the kind and the reference, whatever else the store answered", async () => {
    findSentReference.mockResolvedValue({
      kind: "sent",
      reference: "LM-2614",
      notified: true,
      created_at: "2026-10-14",
      client_request_id: "request-id-of-the-row",
      payload_digest: "digest-of-the-row",
    });

    const handedOn = propsOf(await renderContactPage()).sentReference;

    expect(handedOn).toStrictEqual({ kind: "sent", reference: "LM-2614" });
  });

  it("carries none of the contact table's column names, as a key or in a value, in everything the page hands on", async () => {
    findSentReference.mockResolvedValue({
      kind: "sent",
      reference: "LM-2614",
      notified: true,
      notified_at: "2026-10-14",
      created_at: "2026-10-14",
      client_request_id: "request-id-of-the-row",
      payload_digest: "digest-of-the-row",
    });

    const handedOn = JSON.stringify(propsOf(await renderContactPage()));

    expect(handedOn).toContain("LM-2614");
    for (const name of [
      "notified",
      "created_at",
      "client_request_id",
      "payload_digest",
      "request-id-of-the-row",
      "digest-of-the-row",
    ]) {
      expect(handedOn).not.toContain(name);
    }
  });

  it("is the kind unknown, with nothing of the failure, when the read fails", async () => {
    findSentReference.mockRejectedValue(new Error("password=hunter2"));

    const page = await renderContactPage();

    expect(propsOf(page).sentReference).toStrictEqual({ kind: "unknown" });
    expect(JSON.stringify(propsOf(page))).not.toContain("hunter2");
  });
});

describe("no answer is kept across requests", () => {
  it("answers each request with what the store says at that request", async () => {
    findSentReference.mockResolvedValueOnce({ kind: "none" });
    findSentReference.mockResolvedValueOnce({
      kind: "sent",
      reference: "LM-2614",
    });

    const first = propsOf(await renderContactPage()).sentReference;
    const second = propsOf(await renderContactPage()).sentReference;

    expect([first, second]).toEqual([
      { kind: "none" },
      { kind: "sent", reference: "LM-2614" },
    ]);
    expect(findSentReference).toHaveBeenCalledTimes(2);
  });

  it.each([
    "app/[locale]/d/[id]/contact/page.tsx",
    "lib/server/contact/sent-reference.ts",
  ])(
    "reads source: %s names no cache, no revalidation and no static rendering",
    (path) => {
      expect(readSource(path)).not.toMatch(
        /unstable_cache|use cache|revalidate|force-static|fetchCache|\bcache\(/,
      );
    },
  );

  it("reads source: sent-reference.ts holds no module-level variable", () => {
    const source = readSource("lib/server/contact/sent-reference.ts");

    expect(source).not.toMatch(/^(?:let|var)\s/m);
    expect(source).not.toMatch(/new (?:Map|Set|WeakMap)\b/);
  });
});

describe("the page's costs", () => {
  it("control: the limiter's store getter in this file is the recording one", () => {
    expect(() => getRateLimitStore()).toThrow("the contact page asked");
    expect(rateLimitStoreRequested).toHaveBeenCalledTimes(1);
  });

  it("makes no limiter call of its own", async () => {
    await renderContactPage();

    expect(rateLimitStoreRequested).not.toHaveBeenCalled();
  });

  it.each([
    "app/[locale]/d/[id]/contact/page.tsx",
    "lib/server/contact/sent-reference.ts",
    "lib/server/contact/sent-reference-log.ts",
  ])("reads source: %s imports nothing from the limiter", (path) => {
    expect(readSource(path)).not.toMatch(/rate-limit\//);
  });

  it("reads source: the confirmation page's call is the one it was, with no deadline", () => {
    const done = readSource("app/[locale]/d/[id]/done/page.tsx");

    expect(done).not.toMatch(/deadline/i);
    expect(done).toMatch(/readSentReference\(\{[^}]*\}\)/);
  });

  it("reads source: the contact page's deadline is the named constant, not a number of its own", () => {
    const page = readSource("app/[locale]/d/[id]/contact/page.tsx");

    expect(page).toMatch(/deadlineMs: CONTACT_PAGE_READ_DEADLINE_MS/);
    expect(page).not.toMatch(/deadlineMs: \d/);
  });

  it("serves the form's answer, unknown, when the read is still out past its deadline", async () => {
    vi.useFakeTimers();
    findSentReference.mockReturnValue(new Promise(() => undefined));

    const rendering = renderContactPage();
    await vi.advanceTimersByTimeAsync(CONTACT_PAGE_READ_DEADLINE_MS + 1);
    const page = await rendering;

    expect(propsOf(page).sentReference).toStrictEqual({ kind: "unknown" });
  });

  it("keeps an answer that arrives before its deadline", async () => {
    vi.useFakeTimers();
    findSentReference.mockReturnValue(
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({ kind: "sent", reference: "LM-2614" });
        }, CONTACT_PAGE_READ_DEADLINE_MS - 1);
      }),
    );

    const rendering = renderContactPage();
    await vi.advanceTimersByTimeAsync(CONTACT_PAGE_READ_DEADLINE_MS - 1);
    const page = await rendering;

    expect(propsOf(page).sentReference).toStrictEqual({
      kind: "sent",
      reference: "LM-2614",
    });
  });
});
