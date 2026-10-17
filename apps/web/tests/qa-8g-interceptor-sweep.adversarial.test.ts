// The request interceptor over every combination of path, method, network source and e2e flag: which requests
// it holds for the limiter's judgement, which it counts and how often, and what its own module graph can reach
// without the one dynamic import.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { READS_PER_BLOCK_FIGURE } from "@/lib/server/rate-limit/limit-policy";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import {
  consoleCallsOf,
  spyOnEveryConsoleMethod,
} from "./lib/server/mail/mail-test-support";

const { proxy } = await import("../src/proxy");

const SOURCE_VARIABLE = "CLIENT_NETWORK_SOURCE";
const FLAG_VARIABLE = "LEMNARIA_E2E_RATE_LIMIT_POLICY";
const USABLE_SECRET = "5d81c0".repeat(10) + "0a1b";
const AN_ID = "QaDesign5d81c0QaDesig";
const AN_ADDRESS = { "x-forwarded-for": "203.0.113.7" };

const COUNTED_PATHS = [
  "/ro",
  "/ru",
  `/ro/d/${AN_ID}`,
  `/ru/d/${AN_ID}`,
  `/ro/d/${AN_ID}/review`,
  `/ro/d/${AN_ID}/contact`,
  `/ro/d/${AN_ID}/done`,
  "/ro/s/qa-share-token",
  "/ru/s/qa-share-token",
  `/ro/d/${AN_ID}?_rsc=1abcd`,
  "/ro?utm_source=qa",
];

const UNCOUNTED_PATHS = [
  "/",
  `/d/${AN_ID}`,
  "/s/qa-share-token",
  `/RO/d/${AN_ID}`,
  "/Ru",
  "/ro/d",
  `/ro/d/${AN_ID}/settings`,
  `/ro/d/${AN_ID}/review/more`,
  "/ro/s",
  "/ro/s/qa-share-token/more",
  "/ro/configurator/room",
  "/ro/configurator/configure",
  "/ro/configurator/contact",
  `/api/designs/${AN_ID}`,
  `/api/designs/${AN_ID}/share`,
  "/api/cron/prune-rate-limits",
  `/ro/api/designs/${AN_ID}`,
  "/internal/scene-shot",
  "/models/kitchen.glb",
  "/robots.txt",
  "/ro/nowhere",
  "/en/d/x",
];

/** Paths nobody rules on: each must still answer, and be counted exactly when it is held. */
const ODD_PATHS = [
  `/ro/d/${AN_ID}/`,
  `/ro/d/${"a".repeat(5000)}`,
  "/ro/d/%E0%A4%A",
  "/ro/d/x%00y",
  "/ro/d/..%2f..%2fapi%2fdesigns",
  "//ro/d/x",
  "/ro//d/x",
  "/ro/d//review",
  "/ro/s/%20",
  `/ro/d/${AN_ID}.rsc`,
  "/ro/d/<script>",
  "/ro/%72o",
];

const METHODS = ["GET", "HEAD", "POST"] as const;

interface SourceState {
  readonly label: string;
  readonly value: string | undefined;
}

const NO_SOURCE: SourceState = { label: "no source", value: undefined };
const NAMED_HOST: SourceState = { label: "the named host", value: "vercel" };
const NOT_A_HOST: SourceState = {
  label: "a source that is no host",
  value: "x",
};
const EMPTY_SOURCE: SourceState = { label: "an empty source", value: "" };
const FLAGS = [undefined, "1"] as const;

function under(source: SourceState, flag: string | undefined): void {
  vi.stubEnv(SOURCE_VARIABLE, source.value as unknown as string);
  vi.stubEnv(FLAG_VARIABLE, flag as unknown as string);
}

function ask(path: string, method = "GET", headers = AN_ADDRESS) {
  return proxy(
    new NextRequest(new URL(path, "https://lemnaria.test"), {
      method,
      headers,
    }),
  );
}

function isHeld(answer: NextResponse | Promise<NextResponse>): boolean {
  return answer instanceof Promise;
}

/** Whether each request was held, read at once, and then every judgement that was started, let finish. */
async function heldOfEach(
  requests: readonly (readonly [path: string, method: string])[],
): Promise<boolean[]> {
  const answers = requests.map(([path, method]) => ask(path, method));
  const held = answers.map(isHeld);
  await Promise.all(answers);
  return held;
}

function hitsRecorded() {
  return vi.spyOn(getRateLimitStore(), "recordHits");
}

beforeEach(() => {
  vi.stubEnv("DIGEST_SECRET", USABLE_SECRET);
  under(NO_SOURCE, undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function everyMethodOf(paths: readonly string[]) {
  return METHODS.flatMap((method) =>
    paths.map((path) => [path, method] as const),
  );
}

describe("which requests the interceptor holds for a judgement", () => {
  it.each(FLAGS)(
    "holds every counted path, by any method, where the owner names the host, and no other path there (flag %s)",
    async (flag) => {
      spyOnEveryConsoleMethod();
      under(NAMED_HOST, flag);

      const counted = await heldOfEach(everyMethodOf(COUNTED_PATHS));
      const uncounted = await heldOfEach(everyMethodOf(UNCOUNTED_PATHS));

      expect(counted.filter((held) => !held)).toEqual([]);
      expect(uncounted.filter((held) => held)).toEqual([]);
      expect(counted).toHaveLength(METHODS.length * COUNTED_PATHS.length);
    },
  );

  it.each(FLAGS)(
    "holds nothing at all where no source is named, whatever the path or the method (flag %s)",
    async (flag) => {
      under(NO_SOURCE, flag);

      const held = await heldOfEach(
        everyMethodOf([...COUNTED_PATHS, ...UNCOUNTED_PATHS, ...ODD_PATHS]),
      );

      expect(held.filter(Boolean)).toEqual([]);
      expect(held.length).toBeGreaterThan(100);
    },
  );

  it.each([NOT_A_HOST, EMPTY_SOURCE])(
    "never holds a path it does not count under $label",
    async (source) => {
      under(source, undefined);

      const held = await heldOfEach(everyMethodOf(UNCOUNTED_PATHS));

      expect(held.filter(Boolean)).toEqual([]);
    },
  );
});

describe("what the interceptor counts", () => {
  it("counts a held request once and an unheld one never, for every path, where the owner names the host", async () => {
    under(NAMED_HOST, undefined);
    const hits = hitsRecorded();
    const wrong: string[] = [];
    let held = 0;
    for (const path of [...COUNTED_PATHS, ...UNCOUNTED_PATHS, ...ODD_PATHS]) {
      hits.mockClear();
      const answer = ask(path);
      const wasHeld = isHeld(answer);
      const { status } = await answer;
      held += wasHeld ? 1 : 0;
      const isRight = wasHeld
        ? hits.mock.calls.length === 1 && status === 200
        : hits.mock.calls.length === 0;
      if (!isRight) wrong.push(`${path}: ${String(status)}`);
    }

    expect(wrong).toEqual([]);
    expect(held).toBeGreaterThanOrEqual(COUNTED_PATHS.length);
  });

  it("counts nothing that it answers with a redirect or a 404, by any method", async () => {
    under(NAMED_HOST, undefined);
    const hits = hitsRecorded();
    const statuses = new Set<number>();
    for (const method of METHODS) {
      for (const path of [
        "/",
        `/d/${AN_ID}`,
        "/s/qa-token",
        `/RO/d/${AN_ID}`,
      ]) {
        statuses.add((await ask(path, method)).status);
      }
    }

    expect(hits).not.toHaveBeenCalled();
    expect([...statuses].sort()).toEqual([307, 404]);
  });

  it.each([
    ["the source is set to something that is no host", NOT_A_HOST, undefined],
    ["the source is empty", EMPTY_SOURCE, undefined],
    ["the e2e flag stands beside the named host", NAMED_HOST, "1"],
  ])(
    "counts nothing and serves every counted page when %s",
    async (_label, source, flag) => {
      spyOnEveryConsoleMethod();
      under(source, flag);
      const hits = hitsRecorded();
      const statuses = new Set<number>();
      for (const path of COUNTED_PATHS) statuses.add((await ask(path)).status);

      expect(hits).not.toHaveBeenCalled();
      expect([...statuses]).toEqual([200]);
    },
  );

  it("never refuses a path it does not count, even from a block that is past its figure", async () => {
    spyOnEveryConsoleMethod();
    under(NAMED_HOST, undefined);
    hitsRecorded().mockResolvedValue([READS_PER_BLOCK_FIGURE + 1]);
    const refusedCounted = (await ask(`/ro/d/${AN_ID}`)).status;
    const statuses = new Set<number>();
    for (const path of UNCOUNTED_PATHS) statuses.add((await ask(path)).status);

    expect(refusedCounted).toBe(429);
    expect(statuses.has(429)).toBe(false);
  });
});

describe("a later segment that reads as a locale once decoded", () => {
  it.each(["/ro/d/%72o", "/ro/d/r%6F/review", "/ro/s/%72%75", "/ro/d/RO"])(
    "leaves %s to its page: held, counted once and served, since only the first segment is a locale",
    async (path) => {
      under(NAMED_HOST, undefined);
      const hits = hitsRecorded();

      const answer = ask(path);
      const wasHeld = isHeld(answer);
      const { status } = await answer;

      expect([wasHeld, status]).toEqual([true, 200]);
      expect(hits).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["/api/%72o", "/internal/r%6F", "/ro/configurator/%72o"])(
    "does not refuse %s, which is no page of a locale's, as a misspelled locale",
    async (path) => {
      under(NAMED_HOST, undefined);

      const answer = ask(path);

      expect(isHeld(answer)).toBe(false);
      expect((await answer).status).not.toBe(404);
    },
  );
});

describe("what the interceptor answers for a path nobody rules on", () => {
  it.each([NO_SOURCE, NAMED_HOST, NOT_A_HOST])(
    "answers each of them, under $label, with a status below 500 and no throw",
    async (source) => {
      spyOnEveryConsoleMethod();
      under(source, undefined);
      const statuses: number[] = [];
      for (const method of METHODS) {
        for (const path of ODD_PATHS) {
          statuses.push((await ask(path, method)).status);
        }
      }

      expect(statuses.filter((status) => status >= 500)).toEqual([]);
      expect(statuses).toHaveLength(METHODS.length * ODD_PATHS.length);
    },
  );
});

describe("a held request that is served", () => {
  it("gets the status, the header names and the text the same request gets where no source is named", async () => {
    const differing: string[] = [];
    for (const path of COUNTED_PATHS) {
      under(NO_SOURCE, undefined);
      const immediate = await ask(path);
      under(NAMED_HOST, undefined);
      const held = await ask(path);
      const namesOf = (response: NextResponse) =>
        [...response.headers.keys()].sort().join(",");
      if (
        held.status !== immediate.status ||
        namesOf(held) !== namesOf(immediate) ||
        (await held.text()) !== (await immediate.text())
      ) {
        differing.push(path);
      }
    }

    expect(differing).toEqual([]);
  });
});

describe("a refused page", () => {
  it("is the same for an owner and a stranger, and for any design's address, but for the nonce", async () => {
    spyOnEveryConsoleMethod();
    under(NAMED_HOST, undefined);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T14:20:00.000Z"));
    hitsRecorded().mockResolvedValue([READS_PER_BLOCK_FIGURE + 1]);
    const withCookies = {
      ...AN_ADDRESS,
      cookie: `__Host-lemnaria_visitor=${"q".repeat(43)}; lemnaria_write_token_${AN_ID}=QA-TOKEN`,
    };

    const answers = [];
    for (const [path, headers] of [
      [`/ro/d/${AN_ID}`, withCookies],
      [`/ro/d/${AN_ID}`, AN_ADDRESS],
      ["/ro/d/no-such-design", AN_ADDRESS],
      ["/ro/d/no-such-design/review", withCookies],
    ] as const) {
      const refused = await ask(path, "GET", headers);
      answers.push(
        JSON.stringify([
          refused.status,
          refused.headers.get("retry-after"),
          refused.headers.get("cache-control"),
          [...refused.headers.keys()].sort(),
          await refused.text(),
        ]),
      );
    }

    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toContain('[429,"2400","no-store"');
    expect(answers[0]).not.toContain("QA-TOKEN");
  });
});

describe("what the interceptor writes for reads it serves unjudged", () => {
  it("writes each cause once in a process however many requests meet it, and never a line for a request", async () => {
    vi.resetModules();
    const fresh = await import("../src/proxy");
    const freshStore = await import(
      "@/lib/server/rate-limit/rate-limit-store-instance"
    );
    const askFresh = (path: string) =>
      fresh.proxy(
        new NextRequest(new URL(path, "https://lemnaria.test"), {
          headers: AN_ADDRESS,
        }),
      );
    const consoleSpies = spyOnEveryConsoleMethod();
    under(NAMED_HOST, undefined);
    vi.spyOn(freshStore.getRateLimitStore(), "recordHits").mockRejectedValue(
      new Error("the store is down"),
    );
    for (let sent = 0; sent < 40; sent += 1) await askFresh(`/ro/d/${AN_ID}`);
    vi.stubEnv("DIGEST_SECRET", "");
    for (let sent = 0; sent < 40; sent += 1) await askFresh("/ro");
    under(NOT_A_HOST, undefined);
    for (let sent = 0; sent < 40; sent += 1) await askFresh("/ro/s/qa-token");

    const causes = consoleCallsOf(consoleSpies).map(
      ([, line]) => (line as { cause?: string }).cause,
    );

    expect([...causes].sort()).toEqual([
      "digester-unusable",
      "source-misconfigured",
      "store-failed",
    ]);
  });
});

const SOURCE_ROOT = join(import.meta.dirname, "../src");
const IMPORT_FROM = String.raw`(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']`;
const BARE_IMPORT = String.raw`(?:^|\n)\s*import\s+["']([^"']+)["']`;
const STATIC_IMPORT = new RegExp(`${IMPORT_FROM}|${BARE_IMPORT}`, "g");

function fileOf(specifier: string, importer: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? join(SOURCE_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? join(dirname(importer), specifier)
      : undefined;
  if (base === undefined) return undefined;
  return [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(
    (candidate) => existsSync(candidate) && !candidate.endsWith("/"),
  );
}

/** Every module reachable from `entry` by static imports alone, and every package named on the way. */
function staticGraphOf(entry: string) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() ?? "";
    if (files.has(file) || !/\.tsx?$/.test(file)) continue;
    files.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(STATIC_IMPORT)) {
      const specifier = match[1] ?? match[2] ?? "";
      const resolved = fileOf(specifier, file);
      if (resolved === undefined) packages.add(specifier);
      else pending.push(resolved);
    }
  }
  return {
    files: [...files].map((file) => file.slice(SOURCE_ROOT.length + 1)).sort(),
    packages: [...packages].sort(),
  };
}

const NOT_FOR_THE_INTERCEPTOR = new RegExp(
  [
    "rate-limit-store",
    "digest",
    "judge-",
    "enforce-rate-limit",
    "limit-policy",
    "page-limit",
    "rate-limited-response",
    "design-failure-log",
    "repository",
    "messages/",
  ].join("|"),
);

describe("reads source: what the interceptor's own module graph reaches without its dynamic import", () => {
  const graph = staticGraphOf(join(SOURCE_ROOT, "proxy.ts"));

  it("walks a real graph: the interceptor, the routing and the two modules that only name a source", () => {
    expect(graph.files).toContain("proxy.ts");
    expect(graph.files).toContain("lib/server/rate-limit/network-source.ts");
    expect(graph.files).toContain("lib/server/rate-limit/client-network.ts");
    expect(graph.files.length).toBeGreaterThanOrEqual(5);
  });

  it("reaches no store, no digest, no judge, no refusal, no log module and no message file", () => {
    const reached = graph.files.filter((file) =>
      NOT_FOR_THE_INTERCEPTOR.test(file),
    );

    expect(reached).toEqual([]);
  });

  it("names neither the persistence package nor a server-only module anywhere in that graph", () => {
    expect(
      graph.packages.filter((name) =>
        /@lemnaria\/persistence|server-only|@neondatabase|node:crypto/.test(
          name,
        ),
      ),
    ).toEqual([]);
  });

  it("has one dynamic import in the interceptor, and it is the refused page's module", () => {
    const source = readFileSync(join(SOURCE_ROOT, "proxy.ts"), "utf8");

    expect(
      [...source.matchAll(/\bimport\(\s*["']([^"']+)["']/g)].map(
        ([, target]) => target,
      ),
    ).toEqual(["@/lib/server/rate-limit/page-limit-response"]);
  });
});
