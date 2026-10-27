import {
  CURRENT_SCHEMA_VERSION,
  SAMPLE_PRICE_BOOK,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { contentFor } from "../../../support/catalogues";
import { NO_PRICE_BOOK } from "@/price/price-book-root";
import {
  SAMPLE_PRICE_ROOT,
  SAMPLE_PRICE_VERSION_ID,
} from "../../../support/sample-price-root";
import roMessages from "../../../../src/messages/ro.json";
import { readSource } from "../server-source-support";
import { bodyOf, callbackBodyOf } from "./submit-contact-harness";

/**
 * The module the route calls once for a request. Its leaf ports are the same spies the route's tests use, so what is
 * asserted is what it hands over and that it keeps nothing, never what the leaves do.
 */
const A_STORE = { which: "the store instance" };

const spies = vi.hoisted(() => ({
  makeContactJudge: vi.fn(),
  createMailSender: vi.fn(),
  loadOwnedDesign: vi.fn(),
  getContactSubmissionStore: vi.fn(),
  readActivePriceBook: vi.fn(),
  getSentKitchenViewRepository: vi.fn(),
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
vi.mock("@/lib/server/active-price-book", () => ({
  readActivePriceBook: spies.readActivePriceBook,
}));
vi.mock("@/lib/server/repository", () => ({
  getSentKitchenViewRepository: spies.getSentKitchenViewRepository,
}));

const A_VIEW = {
  tokenHash: "ab".repeat(32),
  clientRequestId: "req_0123456789abcdef",
  schemaVersion: CURRENT_SCHEMA_VERSION,
  document: "{}",
};

const { admitContactRequest, makeContactProductionPorts } = await import(
  "@/lib/server/contact/contact-production-ports"
);

beforeEach(() => {
  spies.getContactSubmissionStore.mockReturnValue(A_STORE);
  spies.readActivePriceBook.mockImplementation(() =>
    Promise.resolve({ ...SAMPLE_PRICE_ROOT, book: { ...SAMPLE_PRICE_BOOK } }),
  );
  spies.createMailSender.mockReturnValue("a sender");
});

afterEach(() => {
  vi.unstubAllEnvs();
  Object.values(spies).forEach((spy) => spy.mockReset());
});

describe("the contact's production ports, made for one request", () => {
  it("hands the store's instance, the served locales, the owned load and the clock", async () => {
    const ports = await makeContactProductionPorts(new Headers());

    expect(ports.store).toBe(A_STORE);
    expect(ports.servedLocales).toEqual(["ro", "ru"]);
    expect(ports.loadOwned).toBe(spies.loadOwnedDesign);
    expect(Math.abs(ports.now().getTime() - Date.now())).toBeLessThan(5_000);
  });

  it("hands one book and its version id, read once by the server's root for the ports", async () => {
    const ports = await makeContactProductionPorts(new Headers());

    expect(spies.readActivePriceBook).toHaveBeenCalledTimes(1);
    expect(ports.book).toEqual(SAMPLE_PRICE_BOOK);
    expect(ports.bookVersionId).toBe(SAMPLE_PRICE_VERSION_ID);
  });

  it("is refused when there is no active version, and makes no ports to price under a sample", async () => {
    spies.readActivePriceBook.mockResolvedValue(NO_PRICE_BOOK);

    await expect(makeContactProductionPorts(new Headers())).rejects.toThrow(
      "no-price-book",
    );
  });

  it("makes another book and other ports for each call, and holds none at module level", async () => {
    const first = await makeContactProductionPorts(new Headers());
    const second = await makeContactProductionPorts(new Headers());

    expect(spies.readActivePriceBook).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
    expect(second.book).not.toBe(first.book);
  });

  it("builds no sender until the orchestration asks, and then from the process's environment", async () => {
    const ports = await makeContactProductionPorts(new Headers());
    expect(spies.createMailSender).not.toHaveBeenCalled();

    expect(ports.createSender()).toBe("a sender");
    expect(spies.createMailSender).toHaveBeenCalledWith(process.env);
  });

  it("reads the digester from the process's environment when the ports are made, as unusable without a secret", async () => {
    expect(
      (await makeContactProductionPorts(new Headers())).digester.status,
    ).toBe("usable");

    vi.stubEnv("DIGEST_SECRET", undefined);

    expect(
      (await makeContactProductionPorts(new Headers())).digester.status,
    ).toBe("unavailable");
  });

  it("writes the shop's notice in Romanian", async () => {
    const ports = await makeContactProductionPorts(new Headers());

    expect(JSON.stringify(ports.noticeContent)).toBe(
      JSON.stringify(contentFor("ro", roMessages)),
    );
  });

  it("makes the judge from the headers it was handed, the process's environment and the instant asked for", async () => {
    const headers = new Headers({ "x-forwarded-for": "192.0.2.9" });
    const instant = new Date("2026-07-15T12:20:00Z");
    const ports = await makeContactProductionPorts(headers);
    expect(spies.makeContactJudge).not.toHaveBeenCalled();

    ports.makeJudge(instant);

    expect(spies.makeContactJudge).toHaveBeenCalledWith({
      environment: process.env,
      headers,
      instant,
    });
  });

  it("asks for the frozen copies' instance only when a view is recorded, and records through it", async () => {
    const record = vi.fn(() => Promise.resolve("recorded"));
    spies.getSentKitchenViewRepository.mockReturnValue({ record });
    const ports = await makeContactProductionPorts(new Headers());
    expect(spies.getSentKitchenViewRepository).not.toHaveBeenCalled();

    expect(await ports.sentKitchenViews.record(A_VIEW)).toBe("recorded");
    expect(record).toHaveBeenCalledWith(A_VIEW);
  });

  it("makes the ports when the frozen copies' instance cannot be made, and rejects the record instead", async () => {
    spies.getSentKitchenViewRepository.mockImplementation(() => {
      throw new Error("no database");
    });

    const ports = await makeContactProductionPorts(new Headers());

    await expect(ports.sentKitchenViews.record(A_VIEW)).rejects.toThrow(
      "no database",
    );
  });

  it("reads the public origin from the process's environment each time it is asked, never once for the ports", async () => {
    vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", "https://first.lemnaria.example");
    const ports = await makeContactProductionPorts(new Headers());
    expect(ports.readPublicOrigin()).toEqual({
      status: "configured",
      origin: "https://first.lemnaria.example",
    });

    vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", undefined);

    expect(ports.readPublicOrigin()).toEqual({
      status: "unavailable",
      variable: "LEMNARIA_PUBLIC_ORIGIN",
    });
  });

  it("throws when a port cannot be made and keeps nothing of the failure for the next call", async () => {
    spies.getContactSubmissionStore.mockImplementationOnce(() => {
      throw new Error("no store");
    });

    await expect(makeContactProductionPorts(new Headers())).rejects.toThrow(
      "no store",
    );
    expect((await makeContactProductionPorts(new Headers())).store).toBe(
      A_STORE,
    );
  });

  it("reads source: holds no state at module level", () => {
    const source = readSource("lib/server/contact/contact-production-ports.ts");

    expect(source.startsWith('import "server-only";\n')).toBe(true);
    expect(source).not.toMatch(/^(?:let|var)\s/m);
    expect(source).not.toMatch(
      /^const\s+\w+\s*(?::[^=]+)?=\s*(?:get|make|read|create|shipped)/m,
    );
  });
});

describe("admitting a request before any price is read (ADR 0157 decision 1)", () => {
  const everyRequest = vi.fn();
  const triesOfStoredRequest = vi.fn();

  beforeEach(() => {
    everyRequest.mockReset().mockResolvedValue(undefined);
    triesOfStoredRequest.mockReset().mockResolvedValue(undefined);
    spies.makeContactJudge.mockReturnValue({
      everyRequest,
      triesOfStoredRequest,
    });
  });

  it("answers a request the every-request bucket refuses with that answer, and reads no price", async () => {
    const refusal = new Response("limited", { status: 429 });
    everyRequest.mockResolvedValue(refusal);

    const admitted = await admitContactRequest(new Headers(), bodyOf());

    expect(admitted).toEqual({ kind: "limited", answer: refusal });
    expect(spies.readActivePriceBook).not.toHaveBeenCalled();
  });

  it("reads the price once for a request that names a design, and hands it with its version id", async () => {
    const admitted = await admitContactRequest(new Headers(), bodyOf());

    expect(spies.readActivePriceBook).toHaveBeenCalledTimes(1);
    expect(admitted.kind === "ports" && admitted.ports.bookVersionId).toBe(
      SAMPLE_PRICE_VERSION_ID,
    );
    expect(admitted.kind === "ports" && admitted.ports.book).toEqual(
      SAMPLE_PRICE_BOOK,
    );
  });

  it("reads no price for the callback form, which prices nothing and is handed no book", async () => {
    spies.readActivePriceBook.mockResolvedValue(NO_PRICE_BOOK);

    const admitted = await admitContactRequest(new Headers(), callbackBodyOf());

    expect(spies.readActivePriceBook).not.toHaveBeenCalled();
    expect(admitted.kind).toBe("ports");
    expect(admitted.kind === "ports" && admitted.ports.book).toBeUndefined();
    expect(
      admitted.kind === "ports" && admitted.ports.bookVersionId,
    ).toBeUndefined();
  });

  it("reads no price for a text the orchestration will refuse", async () => {
    await admitContactRequest(new Headers(), "{}");
    await admitContactRequest(new Headers(), "not json");

    expect(spies.readActivePriceBook).not.toHaveBeenCalled();
  });

  it("is the unavailable failure for a design's request while no version is active", async () => {
    spies.readActivePriceBook.mockResolvedValue(NO_PRICE_BOOK);

    await expect(
      admitContactRequest(new Headers(), bodyOf()),
    ).rejects.toMatchObject({
      name: "ContactFailure",
      unavailableCause: "no-price-book",
    });
  });

  it("asks the judge of the clock the ports hand out, once, and hands the orchestration a judge that does not ask it again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:20:00Z"));
    try {
      const admitted = await admitContactRequest(new Headers(), bodyOf());

      expect(spies.makeContactJudge).toHaveBeenCalledWith(
        expect.objectContaining({ instant: new Date("2026-07-15T12:20:00Z") }),
      );
      const judge =
        admitted.kind === "ports"
          ? admitted.ports.makeJudge(new Date(0))
          : undefined;
      expect(await judge?.everyRequest()).toBeUndefined();
      await judge?.triesOfStoredRequest("req_x");
      expect(everyRequest).toHaveBeenCalledTimes(1);
      expect(triesOfStoredRequest).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
