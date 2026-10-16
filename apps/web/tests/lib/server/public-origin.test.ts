import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  PUBLIC_ORIGIN_VARIABLE,
  readPublicOrigin,
} from "@/lib/server/public-origin";

import {
  declarationsInEnvExample,
  isOnlyCommentedInEnvExample,
} from "./server-source-support";

const UNAVAILABLE = {
  status: "unavailable",
  variable: "LEMNARIA_PUBLIC_ORIGIN",
} as const;

/** Fixed so a failure names the input it failed on again; the runs follow the web suite's other reader properties. */
const PROPERTY_SEED = 8_052;
const PROPERTY_RUNS = 2_000;
/** Each arm of the property must be reached this often, or the sweep says nothing about it. */
const MIN_RUNS_PER_ARM = 200;

function readFrom(value: string): ReturnType<typeof readPublicOrigin> {
  return readPublicOrigin({ [PUBLIC_ORIGIN_VARIABLE]: value });
}

describe("readPublicOrigin: the shapes it accepts", () => {
  it.each([
    ["an https host", "https://lemnaria.example"],
    ["an https host with a port", "https://shop.lemnaria.example:8443"],
    ["a deep https host", "https://a.b.c.lemnaria.example"],
    ["an IDN in punycode", "https://xn--bcher-kva.example"],
    ["plain http on localhost with a port", "http://localhost:3000"],
    ["plain http on localhost", "http://localhost"],
    ["plain http on 127.0.0.1", "http://127.0.0.1:3100"],
    ["plain http on [::1]", "http://[::1]:3000"],
    ["https on a loopback host", "https://127.0.0.1:8443"],
  ])("accepts %s, answering it unchanged", (_shape, value) => {
    expect(readFrom(value)).toEqual({ status: "configured", origin: value });
  });

  it("names the variable LEMNARIA_PUBLIC_ORIGIN", () => {
    expect(PUBLIC_ORIGIN_VARIABLE).toBe("LEMNARIA_PUBLIC_ORIGIN");
  });
});

describe("readPublicOrigin: what it refuses, naming only the variable", () => {
  it.each([
    ["an empty value", ""],
    ["a trailing slash", "https://lemnaria.example/"],
    ["a path", "https://lemnaria.example/ro"],
    ["a query", "https://lemnaria.example?x=1"],
    ["an empty query", "https://lemnaria.example?"],
    ["a fragment", "https://lemnaria.example#top"],
    ["a user", "https://owner@lemnaria.example"],
    ["a user and password", "https://owner:pw@lemnaria.example"],
    ["an upper-case scheme and host", "HTTPS://LEMNARIA.EXAMPLE"],
    ["a mixed-case scheme", "Https://lemnaria.example"],
    ["an upper-case host letter", "https://Lemnaria.example"],
    ["a trailing dot", "https://lemnaria.example."],
    ["a trailing dot on localhost", "http://localhost.:3000"],
    ["a Unicode IDN", "https://bücher.example"],
    ["a Cyrillic look-alike host", "https://lеmnaria.example"],
    ["plain http on a public host", "http://lemnaria.example"],
    ["plain http on a private address", "http://10.0.0.1:3000"],
    ["a loopback address the parser rewrites", "http://127.1:3000"],
    ["an upper-case localhost", "http://LOCALHOST:3000"],
    ["an explicit https default port", "https://lemnaria.example:443"],
    ["an explicit http default port", "http://localhost:80"],
    ["a port past 65535", "https://lemnaria.example:99999"],
    ["an empty port", "https://lemnaria.example:"],
    ["port 0", "https://lemnaria.example:0"],
    ["port 0 on localhost", "http://localhost:0"],
    ["a trailing newline", "https://lemnaria.example\n"],
    ["a trailing carriage return and newline", "https://lemnaria.example\r\n"],
    ["a leading space", " https://lemnaria.example"],
    ["a trailing space", "https://lemnaria.example "],
    ["a leading tab", "\thttps://lemnaria.example"],
    ["a tab inside the host", "https://lemn\taria.example"],
    ["a newline inside the host", "https://lemn\naria.example"],
    ["an underscore in the host", "https://lemn_aria.example"],
    ["a label starting with a hyphen", "https://-lemnaria.example"],
    ["a label ending with a hyphen", "https://lemnaria-.example"],
    ["a label of 64 characters", `https://${"a".repeat(64)}.example`],
    [
      "a host past 253 characters",
      `https://${Array.from({ length: 4 }, () => "a".repeat(63)).join(".")}.example`,
    ],
    ["a public IPv4 address", "https://203.0.113.7"],
    ["a top-level label that is a number", "https://lemnaria.123"],
    ["an IPv6 address that is not loopback", "https://[2001:db8::1]"],
    ["another scheme", "ftp://lemnaria.example"],
    ["a script URL", "javascript:alert(1)"],
    ["a scheme-relative address", "//lemnaria.example"],
    ["a bare host", "lemnaria.example"],
    ["a scheme with no host", "https://"],
  ])("refuses %s", (_shape, value) => {
    expect(readFrom(value)).toEqual(UNAVAILABLE);
  });

  it("refuses an environment without the variable", () => {
    expect(readPublicOrigin({})).toEqual(UNAVAILABLE);
  });

  it("refuses a variable present as undefined", () => {
    expect(readPublicOrigin({ [PUBLIC_ORIGIN_VARIABLE]: undefined })).toEqual(
      UNAVAILABLE,
    );
  });

  it("refuses a value the environment only inherits", () => {
    const environment = Object.create({
      [PUBLIC_ORIGIN_VARIABLE]: "https://lemnaria.example",
    }) as Record<string, string>;

    expect(readPublicOrigin(environment)).toEqual(UNAVAILABLE);
  });

  it("refuses, without throwing, a variable whose getter throws", () => {
    const environment = Object.defineProperty({}, PUBLIC_ORIGIN_VARIABLE, {
      enumerable: true,
      get() {
        throw new Error("https://lemnaria.example");
      },
    }) as Record<string, string>;

    expect(readPublicOrigin(environment)).toEqual(UNAVAILABLE);
  });

  it("refuses a value that is not a string", () => {
    const environment = {
      [PUBLIC_ORIGIN_VARIABLE]: new String("https://lemnaria.example"),
    } as unknown as Record<string, string>;

    expect(readPublicOrigin(environment)).toEqual(UNAVAILABLE);
  });
});

// The oracle is written from the variable's rule, not from the URL standard the reader leans on, so the two can
// disagree.
const LABEL = String.raw`[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?`;
const TOP_LEVEL = String.raw`[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?`;
const NAME_HOST = new RegExp(`^(?:${LABEL}\\.)*${TOP_LEVEL}$`);
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])$/;
const ORIGIN_SHAPE = /^(https|http):\/\/([^/:]+|\[::1\])(?::([1-9]\d{0,4}))?$/;
const DEFAULT_PORTS: Readonly<Record<string, string>> = {
  https: "443",
  http: "80",
};
const MAX_HOST_LENGTH = 253;
const MAX_PORT = 65_535;

function isOriginByTheRule(value: string): boolean {
  const match = ORIGIN_SHAPE.exec(value);
  if (match === null) return false;
  const [, scheme = "", host = "", port] = match;
  if (port !== undefined) {
    if (Number(port) > MAX_PORT || port === DEFAULT_PORTS[scheme]) return false;
  }
  if (LOOPBACK_HOST.test(host)) return true;
  return (
    scheme === "https" && host.length <= MAX_HOST_LENGTH && NAME_HOST.test(host)
  );
}

// Labels avoid `--` in their third and fourth places, which the URL standard reserves for punycode it then checks.
const labelArbitrary = fc
  .stringMatching(/^[a-z0-9](?:[a-z0-9-]{0,8}[a-z0-9])?$/)
  .filter((label) => label.slice(2, 4) !== "--");
const topLevelArbitrary = fc
  .stringMatching(/^[a-z](?:[a-z0-9]{0,6}[a-z])?$/)
  .filter((label) => label.slice(2, 4) !== "--");
const portArbitrary = fc.option(fc.integer({ min: 0, max: 70_000 }), {
  nil: undefined,
});

const originArbitrary = fc
  .record({
    scheme: fc.constantFrom("https", "http"),
    host: fc.oneof(
      fc
        .tuple(fc.array(labelArbitrary, { maxLength: 3 }), topLevelArbitrary)
        .map(([labels, top]) => [...labels, top].join(".")),
      fc.constantFrom("localhost", "127.0.0.1", "[::1]"),
    ),
    port: portArbitrary,
  })
  .map(
    ({ scheme, host, port }) =>
      `${scheme}://${host}${port === undefined ? "" : `:${String(port)}`}`,
  );

const GARBAGE = [
  "/",
  "?",
  "#",
  ".",
  " ",
  "\n",
  "\t",
  "@",
  ":",
  "A",
  "ü",
  "%2F",
  "\u0000",
];

const mutatedOriginArbitrary = fc
  .tuple(originArbitrary, fc.constantFrom(...GARBAGE), fc.boolean())
  .map(([origin, garbage, isAtStart]) =>
    isAtStart ? `${garbage}${origin}` : `${origin}${garbage}`,
  );

const anyInputArbitrary = fc.oneof(
  originArbitrary,
  mutatedOriginArbitrary,
  fc.string({ unit: "grapheme", maxLength: 80 }),
  fc.string({ unit: "binary", maxLength: 80 }),
);

describe("readPublicOrigin: as a property over generated values", () => {
  it("is configured exactly when the rule accepts the value, and then answers the value itself", () => {
    const answers = { configured: 0, unavailable: 0 };

    fc.assert(
      fc.property(anyInputArbitrary, (value) => {
        const outcome = readFrom(value);
        const expected = isOriginByTheRule(value)
          ? { status: "configured", origin: value }
          : UNAVAILABLE;
        expect(outcome).toEqual(expected);
        answers[outcome.status] += 1;
      }),
      { seed: PROPERTY_SEED, numRuns: PROPERTY_RUNS },
    );

    expect(answers.configured).toBeGreaterThanOrEqual(MIN_RUNS_PER_ARM);
    expect(answers.unavailable).toBeGreaterThanOrEqual(MIN_RUNS_PER_ARM);
  });

  it("refuses every origin with one character of garbage put before or after it", () => {
    fc.assert(
      fc.property(mutatedOriginArbitrary, (value) => {
        expect(readFrom(value)).toEqual(UNAVAILABLE);
      }),
      { seed: PROPERTY_SEED, numRuns: PROPERTY_RUNS },
    );
  });
});

describe(".env.example", () => {
  it("names LEMNARIA_PUBLIC_ORIGIN once, with no value, as a comment", () => {
    expect(declarationsInEnvExample(PUBLIC_ORIGIN_VARIABLE)).toEqual([
      "LEMNARIA_PUBLIC_ORIGIN=",
    ]);
    expect(isOnlyCommentedInEnvExample(PUBLIC_ORIGIN_VARIABLE)).toBe(true);
  });
});
