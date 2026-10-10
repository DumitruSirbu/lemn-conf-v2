import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { READS_PER_BLOCK_FIGURE } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";
import {
  readLimitReachedPageResponse,
  READ_LIMIT_REACHED_CODE,
} from "@/lib/server/rate-limit/rate-limited-response";
import { limitedAnswerHeaders } from "@/lib/server/rate-limit/page-limit-page";
import { refusalOfPageRead } from "@/lib/server/rate-limit/page-limit-response";
import roMessages from "@/messages/ro.json";
import ruMessages from "@/messages/ru.json";

import { readSource } from "../server-source-support";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const FROM_192_0_2 = new Headers({ "x-forwarded-for": "192.0.2.77" });
const HOUR_SECONDS = 3600;
const SENTENCE_OF_RO = roMessages.designLoadError.tooManyRequests;
const SENTENCE_OF_RU = ruMessages.designLoadError.tooManyRequests;
const TRY_AGAIN_OF_RO = roMessages.designLoadError.tryAgain;
const TRY_AGAIN_OF_RU = ruMessages.designLoadError.tryAgain;

beforeEach(() => {
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function storeAtItsFigure() {
  return vi
    .spyOn(getRateLimitStore(), "recordHits")
    .mockResolvedValue([READS_PER_BLOCK_FIGURE + 1]);
}

describe("refusalOfPageRead: nothing for a read that is served", () => {
  it("is nothing for a read within its figure", async () => {
    expect(await refusalOfPageRead(FROM_192_0_2, "/ro/d/x")).toBeUndefined();
  });

  it("is nothing, and asks nothing of the store, under no network source", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    const recorded = storeAtItsFigure();

    expect(await refusalOfPageRead(FROM_192_0_2, "/ro/d/x")).toBeUndefined();
    expect(recorded).not.toHaveBeenCalled();
  });

  it("is nothing when the read cannot be judged", async () => {
    vi.spyOn(getRateLimitStore(), "recordHits").mockRejectedValue(
      new Error("down"),
    );

    expect(await refusalOfPageRead(FROM_192_0_2, "/ro/d/x")).toBeUndefined();
  });
});

describe("refusalOfPageRead: the page a refused read is answered with", () => {
  it("is a 429 with a page, the wait of the hour's end, and no store of it", async () => {
    storeAtItsFigure();

    const response = await refusalOfPageRead(FROM_192_0_2, "/ro/d/x");

    expect(response?.status).toBe(429);
    expect(response?.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(response?.headers.get("cache-control")).toBe("no-store");
    const wait = Number(response?.headers.get("retry-after"));
    expect(Number.isInteger(wait) && wait >= 1 && wait <= HOUR_SECONDS).toBe(
      true,
    );
  });

  it.each([
    ["/ro/d/x", "ro", SENTENCE_OF_RO, TRY_AGAIN_OF_RO],
    ["/ro", "ro", SENTENCE_OF_RO, TRY_AGAIN_OF_RO],
    ["/ru/s/abcdefghijkl", "ru", SENTENCE_OF_RU, TRY_AGAIN_OF_RU],
    ["/ru", "ru", SENTENCE_OF_RU, TRY_AGAIN_OF_RU],
  ])(
    "answers %s in %s, with the sentence and the try-again label of that catalogue alone",
    async (path, language, sentence, tryAgain) => {
      storeAtItsFigure();

      const text = await (await refusalOfPageRead(FROM_192_0_2, path))?.text();

      expect(text).toContain(`<html lang="${language}">`);
      expect(text).toContain(`<p>${sentence}</p>`);
      expect(text).toContain(`<title>${sentence}</title>`);
      expect(text).toContain(`<p><a href="">${tryAgain}</a></p>`);
    },
  );

  it.each([
    ["a path with no locale", "/d/x"],
    ["a path with an unknown locale", "/xx/d/x"],
    ["an upper-case locale", "/RO/d/x"],
    ["nothing", ""],
  ])("gives %s the default locale's page, Romanian", async (_label, path) => {
    storeAtItsFigure();

    const text = await (await refusalOfPageRead(FROM_192_0_2, path))?.text();

    expect(text).toContain('<html lang="ro">');
    expect(text).toContain(SENTENCE_OF_RO);
  });

  it("holds no script, no style, nothing that loads but one link to nowhere, no number and no address", async () => {
    storeAtItsFigure();

    for (const path of ["/ro/d/x", "/ru/d/x"]) {
      const text =
        (await (await refusalOfPageRead(FROM_192_0_2, path))?.text()) ?? "";

      expect(text).not.toMatch(
        /<script|<style|<link|<img|<iframe|<form|style=|\son[a-z]+=|src=/i,
      );
      expect(text.match(/<a\b[^>]*>/g)).toEqual(['<a href="">']);
      expect(text.match(/href=/g)).toHaveLength(1);
      expect(text.replace(/<[^>]*>/g, "")).not.toMatch(/[0-9]/);
    }
    expect(SENTENCE_OF_RO).not.toMatch(/[0-9]|adres/i);
    expect(SENTENCE_OF_RU).not.toMatch(/[0-9]|адрес/i);
  });

  it("is a page of one sentence and one link, small enough to be read at a glance", async () => {
    storeAtItsFigure();

    const text =
      (await (await refusalOfPageRead(FROM_192_0_2, "/ro/d/x"))?.text()) ?? "";

    expect(text.match(/<p>/g)).toHaveLength(2);
    expect(text.length).toBeLessThan(1000);
  });

  it("reflects nothing of the request: the link's target is empty, whatever path and query came", async () => {
    storeAtItsFigure();

    for (const path of [
      "/ro/d/x?a=1&b=<script>",
      '/ru/d/"><a href="//evil.example">',
      "/ro/s/abcdefghijkl#fragment",
    ]) {
      const text =
        (await (await refusalOfPageRead(FROM_192_0_2, path))?.text()) ?? "";

      expect(text).not.toMatch(/evil|script|fragment|a=1/);
      expect(text.match(/<a\b[^>]*>/g)).toEqual(['<a href="">']);
    }
  });

  it("asks before it says anything: a refusal reads no cookie, only the forwarding header", async () => {
    storeAtItsFigure();
    const headers = new Headers({
      ...Object.fromEntries(FROM_192_0_2),
      cookie: "__Host-visitor=secret-value",
    });

    const text =
      (await (await refusalOfPageRead(headers, "/ro/d/x"))?.text()) ?? "";

    expect(text).not.toContain("secret-value");
    expect(
      readSource("lib/server/rate-limit/page-limit-response.ts"),
    ).not.toMatch(/cookie/i);
  });
});

describe("readLimitReachedPageResponse: the wait a page may tell", () => {
  it.each([1, 59, HOUR_SECONDS])("tells %i seconds", (wait) => {
    expect(
      readLimitReachedPageResponse(wait, "<p>x</p>").headers.get("retry-after"),
    ).toBe(String(wait));
  });

  it.each([0, -1, 1.5, Number.NaN, HOUR_SECONDS + 1, 86_400])(
    "throws for a wait of %s, which no read can tell",
    (wait) => {
      expect(() => readLimitReachedPageResponse(wait, "<p>x</p>")).toThrow(
        RangeError,
      );
    },
  );
});

describe("page-limit-response.ts", () => {
  it("reads source: the response module reads the message files, and the page's own module reads none", () => {
    expect(readSource("lib/server/rate-limit/page-limit-response.ts")).toMatch(
      /@\/messages\/ro\.json/,
    );
    expect(readSource("lib/server/rate-limit/page-limit-page.ts")).not.toMatch(
      /messages\//,
    );
    expect(READ_LIMIT_REACHED_CODE).toBe("READ_LIMIT_REACHED");
  });
});

describe("limitedAnswerHeaders: the headers of every limit answer", () => {
  it("is never stored, and tells no wait unless it is given one", () => {
    expect(limitedAnswerHeaders()).toEqual({ "Cache-Control": "no-store" });
  });

  it("tells the wait it is given, after the cache header", () => {
    expect(
      Object.entries(limitedAnswerHeaders({ retryAfterSeconds: 90 })),
    ).toEqual([
      ["Cache-Control", "no-store"],
      ["Retry-After", "90"],
    ]);
  });

  it("names a body's own type between the two, as a page's headers always did", () => {
    expect(
      Object.entries(
        limitedAnswerHeaders({
          retryAfterSeconds: 90,
          contentType: "text/html; charset=utf-8",
        }),
      ),
    ).toEqual([
      ["Cache-Control", "no-store"],
      ["Content-Type", "text/html; charset=utf-8"],
      ["Retry-After", "90"],
    ]);
  });
});
