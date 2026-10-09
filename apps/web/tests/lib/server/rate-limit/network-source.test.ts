import { inspect } from "node:util";

import { describe, expect, it, vi } from "vitest";

import {
  CLIENT_NETWORK_SOURCE_VARIABLE,
  identifyClientNetwork,
  selectNetworkSource,
  type HeaderReader,
  type NetworkEnvironment,
  type NetworkSource,
} from "@/lib/server/rate-limit/network-source";

import {
  declarationsInEnvExample,
  isOnlyCommentedInEnvExample,
  PROCESS_ENV_OR_BUILD_MODE,
  readSource,
} from "../server-source-support";

const HEADER_SOURCE: NetworkSource = {
  kind: "header",
  header: "x-forwarded-for",
};
const NONE: NetworkSource = { kind: "none" };
const MISCONFIGURED: NetworkSource = {
  kind: "misconfigured",
  variable: "CLIENT_NETWORK_SOURCE",
};

describe("selectNetworkSource: the truth table", () => {
  const ROWS: readonly [string, NetworkEnvironment, NetworkSource][] = [
    ["absent", {}, NONE],
    ["the platform's name", { CLIENT_NETWORK_SOURCE: "vercel" }, HEADER_SOURCE],
    [
      "an own member holding undefined",
      { CLIENT_NETWORK_SOURCE: undefined },
      MISCONFIGURED,
    ],
    ["empty", { CLIENT_NETWORK_SOURCE: "" }, MISCONFIGURED],
    ["whitespace", { CLIENT_NETWORK_SOURCE: "   " }, MISCONFIGURED],
    [
      "the name with a leading space",
      { CLIENT_NETWORK_SOURCE: " vercel" },
      MISCONFIGURED,
    ],
    [
      "the name with a trailing space",
      { CLIENT_NETWORK_SOURCE: "vercel " },
      MISCONFIGURED,
    ],
    [
      "the name with a trailing line break",
      { CLIENT_NETWORK_SOURCE: "vercel\n" },
      MISCONFIGURED,
    ],
    [
      "the name capitalised",
      { CLIENT_NETWORK_SOURCE: "Vercel" },
      MISCONFIGURED,
    ],
    [
      "the name in capitals",
      { CLIENT_NETWORK_SOURCE: "VERCEL" },
      MISCONFIGURED,
    ],
    [
      "another host's name",
      { CLIENT_NETWORK_SOURCE: "cloudflare" },
      MISCONFIGURED,
    ],
    ["the flag's usual value", { CLIENT_NETWORK_SOURCE: "1" }, MISCONFIGURED],
    ["true", { CLIENT_NETWORK_SOURCE: "true" }, MISCONFIGURED],
    [
      "a member every object has",
      { CLIENT_NETWORK_SOURCE: "constructor" },
      MISCONFIGURED,
    ],
    [
      "the prototype's own name",
      { CLIENT_NETWORK_SOURCE: "__proto__" },
      MISCONFIGURED,
    ],
    [
      "not text",
      { CLIENT_NETWORK_SOURCE: 5 } as unknown as NetworkEnvironment,
      MISCONFIGURED,
    ],
    [
      "an inherited member, which is not the environment's own",
      Object.create({ CLIENT_NETWORK_SOURCE: "vercel" }) as NetworkEnvironment,
      NONE,
    ],
    [
      "an inherited member beside none of its own",
      Object.create({ CLIENT_NETWORK_SOURCE: "other" }) as NetworkEnvironment,
      NONE,
    ],
  ];

  it.each(ROWS)("answers for %s", (_label, environment, expected) => {
    expect(selectNetworkSource(environment)).toEqual(expected);
  });

  it("reads no variable the host sets, whatever it holds", () => {
    const hostVariables = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_URL: "example.vercel.app",
      VERCEL_REGION: "fra1",
      NOW_REGION: "fra1",
      CF_PAGES: "1",
      NODE_ENV: "production",
    };

    expect(selectNetworkSource(hostVariables)).toEqual(NONE);
  });

  it("names the variable and nothing of a value it refuses", () => {
    const answer = selectNetworkSource({
      CLIENT_NETWORK_SOURCE: "VALUE-MARKER-4471",
    });

    expect(answer).toEqual(MISCONFIGURED);
    expect(inspect(answer, { depth: null, showHidden: true })).not.toContain(
      "MARKER",
    );
    expect(CLIENT_NETWORK_SOURCE_VARIABLE).toBe("CLIENT_NETWORK_SOURCE");
  });
});

const FORWARDING_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "x-vercel-forwarded-for",
  "forwarded",
  "x-client-ip",
  "x-cluster-client-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "fastly-client-ip",
  "x-forwarded",
  "forwarded-for",
  "x-originating-ip",
];

function readerOf(values: Readonly<Record<string, string>>): HeaderReader & {
  readonly get: ReturnType<typeof vi.fn<(name: string) => string | null>>;
} {
  return { get: vi.fn((name: string) => values[name] ?? null) };
}

describe("identifyClientNetwork", () => {
  const EVERY_FORWARDING_HEADER = Object.fromEntries(
    FORWARDING_HEADERS.map((name) => [name, "192.0.2.77"]),
  );

  it("puts every request in the one shared bucket under none, and asks for no header", () => {
    const headers = readerOf(EVERY_FORWARDING_HEADER);

    const network = identifyClientNetwork(NONE, headers);

    expect(network).toEqual({
      status: "known",
      block: { kind: "shared", subject: "" },
    });
    expect(headers.get).not.toHaveBeenCalled();
  });

  it.each(FORWARDING_HEADERS)("ignores %s alone under none", (name) => {
    const network = identifyClientNetwork(
      NONE,
      readerOf({ [name]: "192.0.2.77" }),
    );

    expect(network).toEqual({
      status: "known",
      block: { kind: "shared", subject: "" },
    });
  });

  it("takes the block from the named header and no other when the source names one", () => {
    const headers = readerOf({
      ...EVERY_FORWARDING_HEADER,
      "x-forwarded-for": "198.51.100.9",
    });

    const network = identifyClientNetwork(HEADER_SOURCE, headers);

    expect(network).toEqual({
      status: "known",
      block: { kind: "ipv4-block", subject: "198.51.100" },
    });
    expect(headers.get.mock.calls).toEqual([["x-forwarded-for"]]);
  });

  it.each([
    ["a list", "198.51.100.9, 203.0.113.1"],
    ["a port", "198.51.100.9:80"],
    ["a name", "attacker.example.com"],
    ["empty text", ""],
  ])("puts a header holding %s in the shared bucket", (_label, value) => {
    const network = identifyClientNetwork(
      HEADER_SOURCE,
      readerOf({ "x-forwarded-for": value }),
    );

    expect(network).toEqual({
      status: "known",
      block: { kind: "shared", subject: "" },
    });
  });

  it("puts a request without the header in the shared bucket", () => {
    expect(identifyClientNetwork(HEADER_SOURCE, readerOf({}))).toEqual({
      status: "known",
      block: { kind: "shared", subject: "" },
    });
  });

  it("answers misconfigured, naming the variable, and asks for no header", () => {
    const headers = readerOf(EVERY_FORWARDING_HEADER);

    const network = identifyClientNetwork(MISCONFIGURED, headers);

    expect(network).toEqual({
      status: "misconfigured",
      variable: "CLIENT_NETWORK_SOURCE",
    });
    expect(headers.get).not.toHaveBeenCalled();
  });

  it("works with the platform's Headers, whose names are case-insensitive", () => {
    const headers = new Headers({ "X-Forwarded-For": "2001:db8:0:5::1" });

    expect(identifyClientNetwork(HEADER_SOURCE, headers)).toEqual({
      status: "known",
      block: { kind: "ipv6-block", subject: "2001:0db8:0000:0005" },
    });
  });

  it("never puts the header's text in the answer", () => {
    const text = "198.51.100.9";
    const network = identifyClientNetwork(
      HEADER_SOURCE,
      readerOf({ "x-forwarded-for": text }),
    );

    expect(JSON.stringify(network)).not.toContain(text);
  });
});

describe("network-source.ts", () => {
  it("reads source: names neither the process environment nor the build mode, and has no server-only import", () => {
    const source = readSource("lib/server/rate-limit/network-source.ts");

    expect(source).not.toMatch(PROCESS_ENV_OR_BUILD_MODE);
    expect(source).not.toMatch(/server-only/);
  });

  it("reads source: names no variable a host sets", () => {
    expect(readSource("lib/server/rate-limit/network-source.ts")).not.toMatch(
      /\bVERCEL|NOW_REGION/,
    );
  });
});

describe(".env.example", () => {
  it("names CLIENT_NETWORK_SOURCE once, with no value, as a comment", () => {
    expect(declarationsInEnvExample(CLIENT_NETWORK_SOURCE_VARIABLE)).toEqual([
      "CLIENT_NETWORK_SOURCE=",
    ]);
    expect(isOnlyCommentedInEnvExample(CLIENT_NETWORK_SOURCE_VARIABLE)).toBe(
      true,
    );
  });
});
