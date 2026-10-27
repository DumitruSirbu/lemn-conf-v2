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

const { makeContactProductionPorts } = await import(
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
      "unexpected",
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
