import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "../src/lib/server/rate-limit/network-source";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const MIN_PER_ARM = 100;

/** Every way to write one character of a locale, apart from the plain one: its other case, and each escape of either
 *  case in either case of its hexadecimal digits. */
const SPELLINGS_OF: Readonly<Record<string, readonly string[]>> = {
  r: ["r", "R", "%72", "%52"],
  o: ["o", "O", "%6f", "%6F", "%4f", "%4F"],
  u: ["u", "U", "%75", "%55"],
};

function spellingsOf([first, second]: readonly [string, string]): string[] {
  return (SPELLINGS_OF[first] ?? []).flatMap((head) =>
    (SPELLINGS_OF[second] ?? []).map((tail) => `${head}${tail}`),
  );
}

/** Each spelling that is not the locale written plainly: the ones that read as it and are not it. */
const LOCALES: readonly (readonly [string, string])[] = [
  ["r", "o"],
  ["r", "u"],
];
const MISSPELLED = LOCALES.flatMap((letters) =>
  spellingsOf(letters).filter((spelling) => spelling !== letters.join("")),
);

const A_DESIGN = "V1StGXR8Z5jdHi6BmyT_a";
const A_TOKEN = "abcdefghijkl";

const PAGES_OF = (spelling: string): readonly string[] => [
  `/${spelling}`,
  `/${spelling}/d/${A_DESIGN}`,
  `/${spelling}/d/${A_DESIGN}/review`,
  `/${spelling}/s/${A_TOKEN}`,
];

/** The interceptor and the store it would count in, from a module graph of their own. */
async function freshInterceptor() {
  vi.resetModules();
  const { proxy } = await import("../src/proxy");
  const { getRateLimitStore } = await import(
    "../src/lib/server/rate-limit/rate-limit-store-instance"
  );
  return { proxy, recorded: vi.spyOn(getRateLimitStore(), "recordHits") };
}

function requestTo(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://lemnaria.test"), {
    headers: { "x-forwarded-for": "192.0.2.77" },
  });
}

beforeEach(() => {
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("proxy: a locale that is one only once decoded is the 404 a case variant gets", () => {
  it.each([
    ["no network source", undefined],
    ["a named network source", "vercel"],
  ])(
    "answers every misspelling of ro and ru with a 404 at once, under %s",
    async (_label, source) => {
      vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, source);
      const { proxy, recorded } = await freshInterceptor();
      let spellingsTried = 0;

      for (const spelling of MISSPELLED) {
        for (const path of PAGES_OF(spelling)) {
          const answer = proxy(requestTo(path));
          expect(answer, path).not.toBeInstanceOf(Promise);
          expect((answer as Response).status, path).toBe(404);
          spellingsTried += 1;
        }
      }

      expect(spellingsTried).toBeGreaterThanOrEqual(MIN_PER_ARM);
      expect(recorded).not.toHaveBeenCalled();
    },
  );

  it("covers the spellings that matter: whole and partial escapes, mixed case, and the other locale's", () => {
    const named = [
      "%72o",
      "r%6F",
      "%72%6f",
      "%72O",
      "r%6f",
      "%52%4F",
      "%72u",
      "r%75",
    ];

    expect(MISSPELLED).toEqual(expect.arrayContaining(named));
    expect(MISSPELLED).not.toContain("ro");
    expect(MISSPELLED).not.toContain("ru");
  });

  it("gives the 404 the page's policy header, as the case variant's has", async () => {
    const { proxy } = await freshInterceptor();

    const escaped = proxy(requestTo(`/%72o/d/${A_DESIGN}`)) as Response;
    const caseVariant = proxy(requestTo(`/RO/d/${A_DESIGN}`)) as Response;

    expect([...escaped.headers.keys()].sort()).toEqual(
      [...caseVariant.headers.keys()].sort(),
    );
    expect(escaped.status).toBe(caseVariant.status);
  });
});

describe("proxy: what the rule leaves as it was", () => {
  const AS_IT_WAS: readonly [string, string][] = [
    [
      "a doubled escape, which decodes to a spelling and no further",
      `/%2572o/d/${A_DESIGN}`,
    ],
    ["a doubled escape of the other locale", `/%2572u/s/${A_TOKEN}`],
    ["an escape that cannot be decoded", `/%ZZ/d/${A_DESIGN}`],
    ["a lone percent sign", `/%/d/${A_DESIGN}`],
    ["a truncated escape", `/%7/d/${A_DESIGN}`],
    ["an escape of one letter of a locale and no more", `/%72/d/${A_DESIGN}`],
    ["an escape that decodes to a locale and more", `/%72oo/d/${A_DESIGN}`],
    ["an escaped slash after the locale", `/ro%2Fd/${A_DESIGN}`],
    ["a word that is no locale", `/zz/d/${A_DESIGN}`],
  ];

  it.each(AS_IT_WAS)(
    "answers %s as the framework's own passthrough, as a word that is no locale is answered",
    async (_label, path) => {
      const { proxy } = await freshInterceptor();

      const answer = proxy(requestTo(path)) as Response;
      const unknown = proxy(requestTo(`/zz/d/${A_DESIGN}`)) as Response;

      expect(answer.status).toBe(unknown.status);
      expect(answer.status).not.toBe(404);
      expect(answer.headers.get("x-middleware-next")).toBe(
        unknown.headers.get("x-middleware-next"),
      );
    },
  );

  it.each(["ro", "ru"])(
    "still serves %s written plainly, and counts it under a named source",
    async (locale) => {
      vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
      const { proxy, recorded } = await freshInterceptor();

      const answer = proxy(requestTo(`/${locale}/d/${A_DESIGN}`));

      expect(answer).toBeInstanceOf(Promise);
      expect((await answer).status).toBe(200);
      expect(recorded).toHaveBeenCalledTimes(1);
    },
  );

  it("answers a plain locale's pages at once and 200 under no source, as before", async () => {
    const { proxy } = await freshInterceptor();

    for (const locale of ["ro", "ru"]) {
      for (const path of PAGES_OF(locale)) {
        const answer = proxy(requestTo(path));
        expect(answer, path).not.toBeInstanceOf(Promise);
        expect((answer as Response).status, path).toBe(200);
      }
    }
  });
});
