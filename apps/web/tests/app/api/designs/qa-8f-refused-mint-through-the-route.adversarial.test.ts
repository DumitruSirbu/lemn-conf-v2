// The mint's limit through the real route, with nothing replaced but the two databases: the counters are the
// shared setup's in-memory store and the designs an in-memory repository. What a refused mint leaves behind,
// which answer and which logged cause every combination of the three variables gives, where a Chisinau day
// begins and ends, who shares a bucket, and what the deadline drops.
import type { MintDesign } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { E2E_MINT_POLICY_NOTICE } from "@/lib/server/design-failure-log";
import {
  RATE_LIMIT_DEADLINE_MS,
  UNAVAILABLE_CAUSES,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  E2E_MINT_POLICY_NAME,
  MINT_DAILY_FIGURE,
  MINT_POLICY_NAME,
} from "@/lib/server/rate-limit/limit-policy";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import { bucketKeyOfTheRun } from "../../../e2e/support/e2e-rate-limit-run";
import { everyReadingOf } from "../../../lib/server/mail/qa-8j-support";
import {
  consoleCallsOf,
  spyOnEveryConsoleMethod,
} from "../../../lib/server/mail/mail-test-support";

/** What the route did before it answered, so a refusal can be shown to have done none of it. */
const work = vi.hoisted(() => ({ done: [] as string[] }));
const repository = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repository.current,
}));

vi.mock("@/lib/server/visitor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/visitor")>();
  return {
    ...actual,
    resolveVisitorForMint: (
      ...given: Parameters<typeof actual.resolveVisitorForMint>
    ) => {
      work.done.push("visitor resolved");
      return actual.resolveVisitorForMint(...given);
    },
  };
});

vi.mock("@/lib/server/write-token", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/server/write-token")>();
  return {
    ...actual,
    mintWriteToken: (...given: Parameters<typeof actual.mintWriteToken>) => {
      work.done.push("token minted");
      return actual.mintWriteToken(...given);
    },
  };
});

const { POST } = await import("../../../../src/app/api/designs/route");

const SOURCE_VARIABLE = "CLIENT_NETWORK_SOURCE";
const FLAG_VARIABLE = "LEMNARIA_E2E_RATE_LIMIT_POLICY";
const SECRET_VARIABLE = "DIGEST_SECRET";
const USABLE_SECRET = "5d81c0".repeat(10) + "0a1b";
const OTHER_USABLE_SECRET = "c0815d".repeat(10) + "1b0a";
const VISITOR_COOKIE =
  "__Host-lemnaria_visitor=QA-VISITOR-5d81c0-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** Design rows held in memory, so a test reads what was written and what was not. */
class DesignRows {
  readonly mints: MintDesign[] = [];

  mint(params: MintDesign) {
    work.done.push("row written");
    this.mints.push(params);
    return Promise.resolve({
      id: `qa-design-${String(this.mints.length)}`,
      revision: "1",
    });
  }
}

let rows: DesignRows;

function mint(headers: Record<string, string> = {}) {
  return POST(
    new NextRequest("https://lemnaria.test/api/designs", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin", ...headers },
    }),
  );
}

async function statusesOf(times: number, headers = {}): Promise<number[]> {
  const statuses: number[] = [];
  for (let made = 0; made < times; made += 1) {
    statuses.push((await mint(headers)).status);
  }
  return statuses;
}

function hitsRecorded() {
  return vi.spyOn(getRateLimitStore(), "recordHits");
}

type HitsSpy = ReturnType<typeof hitsRecorded>;

function keysCounted(spy: HitsSpy): string[] {
  return spy.mock.calls.flatMap(([buckets]) => buckets.map(({ key }) => key));
}

function standAt(instant: string | number): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instant));
}

const ALLOWED_TWENTY = new Array<number>(MINT_DAILY_FIGURE).fill(201);

beforeEach(() => {
  work.done.length = 0;
  rows = new DesignRows();
  repository.current = rows;
  vi.stubEnv(SOURCE_VARIABLE, undefined as unknown as string);
  vi.stubEnv(FLAG_VARIABLE, undefined as unknown as string);
  vi.stubEnv(SECRET_VARIABLE, USABLE_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the limit, with nothing of the limiter replaced", () => {
  it("makes twenty designs in one test and refuses the twenty-first", async () => {
    const statuses = await statusesOf(MINT_DAILY_FIGURE + 1);

    expect(statuses).toEqual([...ALLOWED_TWENTY, 429]);
    expect(rows.mints).toHaveLength(MINT_DAILY_FIGURE);
  });

  it("never makes more than twenty of any number sent at once", async () => {
    const sentAtOnce = 60;

    const answers = await Promise.all(
      Array.from({ length: sentAtOnce }, () => mint()),
    );

    const statuses = answers.map(({ status }) => status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(
      MINT_DAILY_FIGURE,
    );
    expect(statuses.filter((status) => status === 429)).toHaveLength(
      sentAtOnce - MINT_DAILY_FIGURE,
    );
    expect(rows.mints).toHaveLength(MINT_DAILY_FIGURE);
  });
});

describe("a refused mint", () => {
  async function refusedWith(headers: Record<string, string>) {
    await statusesOf(MINT_DAILY_FIGURE, headers);
    work.done.length = 0;
    const hits = hitsRecorded();
    const response = await mint(headers);
    return { response, hits };
  }

  it("resolves no visitor, mints no token and writes no row, for a browser carrying both cookies", async () => {
    const { response } = await refusedWith({
      cookie: `${VISITOR_COOKIE}; lemnaria_write_token_qa-design-1=QA-TOKEN`,
    });

    expect(response.status).toBe(429);
    expect(work.done).toEqual([]);
    expect(rows.mints).toHaveLength(MINT_DAILY_FIGURE);
  });

  it("sets, clears and refreshes no cookie of either kind", async () => {
    const { response } = await refusedWith({
      cookie: `${VISITOR_COOKIE}; lemnaria_write_token_qa-design-1=QA-TOKEN`,
    });

    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("is counted once, in one bucket, like every mint before it", async () => {
    const { hits } = await refusedWith({});

    expect(hits).toHaveBeenCalledTimes(1);
    expect(keysCounted(hits)).toHaveLength(1);
  });

  it("goes on being refused and counted, and still writes nothing, however often it is repeated", async () => {
    const { hits } = await refusedWith({});

    const statuses = await statusesOf(5);

    expect(statuses).toEqual([429, 429, 429, 429, 429]);
    expect(hits).toHaveBeenCalledTimes(6);
    expect(rows.mints).toHaveLength(MINT_DAILY_FIGURE);
  });
});

describe("a request from another site", () => {
  const FROM_ANOTHER_SITE = { "sec-fetch-site": "cross-site" };

  it("is refused before it is counted, so it spends none of the day's twenty", async () => {
    const hits = hitsRecorded();

    const crossSite = await statusesOf(30, FROM_ANOTHER_SITE);
    const sameSite = await statusesOf(MINT_DAILY_FIGURE + 1);

    expect(new Set(crossSite)).toEqual(new Set([403]));
    expect(sameSite).toEqual([...ALLOWED_TWENTY, 429]);
    expect(hits).toHaveBeenCalledTimes(MINT_DAILY_FIGURE + 1);
  });

  it("is answered as from another site, not as over the limit, once the limit is reached", async () => {
    await statusesOf(MINT_DAILY_FIGURE + 1);
    const hits = hitsRecorded();

    const response = await mint(FROM_ANOTHER_SITE);

    expect(response.status).toBe(403);
    expect(response.headers.has("Retry-After")).toBe(false);
    expect(hits).not.toHaveBeenCalled();
  });

  it("is answered as from another site, not as unavailable, when the limit cannot be judged", async () => {
    vi.stubEnv(SECRET_VARIABLE, "");

    const response = await mint(FROM_ANOTHER_SITE);

    expect(response.status).toBe(403);
  });
});

const DAYS: readonly [string, string, string, number][] = [
  [
    "a winter day of 24 hours",
    "2026-01-14T22:00:00.000Z",
    "2026-01-15T22:00:00.000Z",
    86_400,
  ],
  [
    "the spring day of 23 hours",
    "2026-03-28T22:00:00.000Z",
    "2026-03-29T21:00:00.000Z",
    82_800,
  ],
  [
    "the autumn day of 25 hours",
    "2026-10-24T21:00:00.000Z",
    "2026-10-25T22:00:00.000Z",
    90_000,
  ],
];

describe.each(DAYS)(
  "the Chisinau day, on %s",
  (_label, start, end, seconds) => {
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);

    async function refusedAt(instantMs: number) {
      standAt(instantMs);
      return mint();
    }

    it("counts a mint at its first instant in that day and one a millisecond earlier in the day before", async () => {
      standAt(startMs - 1);
      const theDayBefore = await statusesOf(1);
      standAt(startMs);

      const today = await statusesOf(MINT_DAILY_FIGURE + 1);

      expect(theDayBefore).toEqual([201]);
      expect(today).toEqual([...ALLOWED_TWENTY, 429]);
    });

    it("tells a mint refused at its first instant to wait the whole day and no more", async () => {
      standAt(startMs);
      await statusesOf(MINT_DAILY_FIGURE);

      const refused = await mint();

      expect(refused.headers.get("Retry-After")).toBe(String(seconds));
    });

    it("tells a mint refused in its last second to wait one second, and just before that second two", async () => {
      standAt(startMs);
      await statusesOf(MINT_DAILY_FIGURE);

      const waits = [];
      for (const beforeTheEnd of [1001, 1000, 1]) {
        const refused = await refusedAt(endMs - beforeTheEnd);
        waits.push([refused.status, refused.headers.get("Retry-After")]);
      }

      expect(waits).toEqual([
        [429, "2"],
        [429, "1"],
        [429, "1"],
      ]);
    });

    it("allows the first mint of the next day at the instant this one ends, and twenty in all", async () => {
      standAt(endMs - 1);
      await statusesOf(MINT_DAILY_FIGURE + 1);
      standAt(endMs);

      const theNextDay = await statusesOf(MINT_DAILY_FIGURE + 1);

      expect(theNextDay).toEqual([...ALLOWED_TWENTY, 429]);
      expect(rows.mints).toHaveLength(2 * MINT_DAILY_FIGURE);
    });

    it("answers a refusal with three headers and two members at both edges, and no figure but the wait", async () => {
      standAt(startMs);
      await statusesOf(MINT_DAILY_FIGURE);

      const atTheStart = await mint();
      const atTheEnd = await refusedAt(endMs - 1);

      for (const [refused, wait] of [
        [atTheStart, String(seconds)],
        [atTheEnd, "1"],
      ] as const) {
        expect([...refused.headers].sort()).toEqual([
          ["cache-control", "no-store"],
          ["content-type", "application/json"],
          ["retry-after", wait],
        ]);
        expect(await refused.json()).toEqual({
          error: "The limit on new designs is reached for today.",
          code: "MINT_LIMIT_REACHED",
        });
      }
    });
  },
);

interface VariableState {
  readonly label: string;
  /** `undefined` leaves the variable out of the environment. */
  readonly value: string | undefined;
}

const SOURCES: readonly (VariableState & { isAccepted: boolean })[] = [
  { label: "no source", value: undefined, isAccepted: true },
  { label: "the named host", value: "vercel", isAccepted: true },
  { label: "an empty source", value: "", isAccepted: false },
  { label: "the host in capitals", value: "VERCEL", isAccepted: false },
  { label: "the word none", value: "none", isAccepted: false },
  { label: "the host and a space", value: "vercel ", isAccepted: false },
];

const FLAGS: readonly (VariableState & { isEnabled: boolean })[] = [
  { label: "no flag", value: undefined, isEnabled: false },
  { label: "the flag", value: "1", isEnabled: true },
  { label: "a flag of true", value: "true", isEnabled: false },
  { label: "an empty flag", value: "", isEnabled: false },
];

const UNUSABLE_SECRET_MARKER = "QA-SECRET-5d81c0";

const SECRETS: readonly (VariableState & { isUsable: boolean })[] = [
  { label: "a usable secret", value: USABLE_SECRET, isUsable: true },
  { label: "no secret", value: undefined, isUsable: false },
  { label: "an empty secret", value: "", isUsable: false },
  { label: "63 characters", value: USABLE_SECRET.slice(1), isUsable: false },
  { label: "65 characters", value: `${USABLE_SECRET}a`, isUsable: false },
  {
    label: "capitals",
    value: USABLE_SECRET.toUpperCase(),
    isUsable: false,
  },
  {
    label: "a trailing line break",
    value: `${USABLE_SECRET}\n`,
    isUsable: false,
  },
  {
    label: "text that is not hexadecimal",
    value: UNUSABLE_SECRET_MARKER.padEnd(64, "z"),
    isUsable: false,
  },
];

interface Cell {
  readonly label: string;
  readonly variables: readonly (readonly [string, string | undefined])[];
  /** Every cause that is true of the cell; the line must name one of them. Empty where the mint is judged. */
  readonly trueCauses: readonly string[];
  readonly secretValue: string | undefined;
}

const CELLS: readonly Cell[] = FLAGS.flatMap((flag) =>
  SOURCES.flatMap((source) =>
    SECRETS.map((secret) => ({
      label: `${flag.label}, ${source.label}, ${secret.label}`,
      variables: [
        [FLAG_VARIABLE, flag.value],
        [SOURCE_VARIABLE, source.value],
        [SECRET_VARIABLE, secret.value],
      ] as const,
      trueCauses: [
        ...(source.isAccepted ? [] : ["source-misconfigured"]),
        ...(flag.isEnabled && source.value !== undefined
          ? ["policy-misconfigured"]
          : []),
        ...(secret.isUsable ? [] : ["digester-unusable"]),
      ],
      secretValue: secret.value,
    })),
  ),
);

const JUDGED_CELLS = CELLS.filter(({ trueCauses }) => trueCauses.length === 0);
const UNJUDGED_CELLS = CELLS.filter(({ trueCauses }) => trueCauses.length > 0);

function enter(cell: Cell): void {
  for (const [name, value] of cell.variables) {
    vi.stubEnv(name, value as unknown as string);
  }
}

describe("every combination of the flag, the source and the secret, at the route", () => {
  it("holds judged cells and cells for each of the three causes, so no arm below is empty", () => {
    expect(JUDGED_CELLS.length).toBeGreaterThan(0);
    for (const cause of [
      "source-misconfigured",
      "policy-misconfigured",
      "digester-unusable",
    ]) {
      expect(
        UNJUDGED_CELLS.filter(({ trueCauses }) => trueCauses.includes(cause))
          .length,
      ).toBeGreaterThan(0);
    }
    expect(CELLS).toHaveLength(FLAGS.length * SOURCES.length * SECRETS.length);
  });

  it("makes a design exactly where the source, the flag and the secret are all in order", async () => {
    const wrong: string[] = [];
    for (const cell of CELLS) {
      enter(cell);
      const { status } = await mint();
      const expected = cell.trueCauses.length === 0 ? 201 : 503;
      if (status !== expected) wrong.push(`${cell.label}: ${String(status)}`);
    }

    expect(wrong).toEqual([]);
  });

  it("answers every other cell with the one fixed 503, before the store is asked, writing nothing", async () => {
    const hits = hitsRecorded();
    const wrong: string[] = [];
    for (const cell of UNJUDGED_CELLS) {
      enter(cell);
      const response = await mint({ cookie: VISITOR_COOKIE });
      const answer = JSON.stringify([
        [...response.headers].sort(),
        await response.json(),
      ]);
      const expected = JSON.stringify([
        [
          ["cache-control", "no-store"],
          ["content-type", "application/json"],
        ],
        {
          error: "A new design cannot be made right now.",
          code: "MINT_UNAVAILABLE",
        },
      ]);
      if (answer !== expected) wrong.push(cell.label);
    }

    expect(wrong).toEqual([]);
    expect(hits).not.toHaveBeenCalled();
    expect(work.done).toEqual([]);
    expect(rows.mints).toEqual([]);
  });

  it("writes one line for each such cell: the fixed text and a cause that is true of the cell", async () => {
    const wrong: string[] = [];
    for (const cell of UNJUDGED_CELLS) {
      const consoleSpies = spyOnEveryConsoleMethod();
      enter(cell);
      await mint();
      const lines = consoleCallsOf(consoleSpies);
      const [label, line] = lines[0] ?? [];
      const { cause, ...fixed } = (line ?? {}) as Record<string, unknown>;
      const isTheFixedLine =
        lines.length === 1 &&
        label === "[designs]" &&
        JSON.stringify(fixed) ===
          JSON.stringify({
            event: "design-operation-unavailable",
            operation: "mint",
            refusalCode: "MINT_UNAVAILABLE",
            status: 503,
          });
      if (!isTheFixedLine || !cell.trueCauses.includes(String(cause))) {
        wrong.push(`${cell.label}: ${String(cause)}`);
      }
      vi.restoreAllMocks();
    }

    expect(wrong).toEqual([]);
  });

  it("puts nothing of the secret, usable or not, into any answer or any line", async () => {
    const leaking: string[] = [];
    for (const cell of CELLS.filter(
      ({ secretValue }) => secretValue !== undefined && secretValue !== "",
    )) {
      const consoleSpies = spyOnEveryConsoleMethod();
      enter(cell);
      const response = await mint();
      const readings = everyReadingOf([
        [...response.headers],
        await response.text(),
        consoleCallsOf(consoleSpies),
      ]);
      const secret = (cell.secretValue ?? "").trim();
      if (
        readings.includes(secret) ||
        readings.toLowerCase().includes(secret.toLowerCase().slice(0, 16)) ||
        readings.includes(UNUSABLE_SECRET_MARKER)
      ) {
        leaking.push(cell.label);
      }
      vi.restoreAllMocks();
    }

    expect(leaking).toEqual([]);
  });

  it("names in its lines only causes from the closed list of seven", () => {
    expect(UNAVAILABLE_CAUSES).toHaveLength(7);
    expect(
      UNJUDGED_CELLS.flatMap(({ trueCauses }) => trueCauses).filter(
        (cause) => !(UNAVAILABLE_CAUSES as readonly string[]).includes(cause),
      ),
    ).toEqual([]);
  });
});

describe("the e2e policy's one notice", () => {
  it("is the only thing a judged mint under the flag writes", async () => {
    const consoleSpies = spyOnEveryConsoleMethod();
    vi.stubEnv(FLAG_VARIABLE, "1");

    const statuses = await statusesOf(MINT_DAILY_FIGURE + 5);

    const otherLines = consoleCallsOf(consoleSpies).filter(
      ([, line]) =>
        (line as { message?: string } | undefined)?.message !==
        E2E_MINT_POLICY_NOTICE,
    );
    expect(new Set(statuses)).toEqual(new Set([201]));
    expect(otherLines).toEqual([]);
  });
});

/** The key the one mint of `headers` was counted under. */
async function keyCountedFor(headers: Record<string, string>): Promise<string> {
  const hits = hitsRecorded();
  await mint(headers);
  const [key] = keysCounted(hits);
  hits.mockRestore();
  if (key === undefined) throw new Error("the mint was not counted");
  return key;
}

const FORWARDING_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "cf-connecting-ip",
  "true-client-ip",
  "x-vercel-forwarded-for",
  "x-client-ip",
];

describe("who shares a bucket when no source is named", () => {
  it("is everyone: twenty mints that each claim another address leave nothing for the next", async () => {
    const statuses: number[] = [];
    for (let made = 0; made <= MINT_DAILY_FIGURE; made += 1) {
      const claimed = Object.fromEntries(
        FORWARDING_HEADERS.map((name) => [
          name,
          name === "forwarded"
            ? `for=198.51.${String(made)}.7`
            : `198.51.${String(made)}.7`,
        ]),
      );
      statuses.push((await mint(claimed)).status);
    }

    expect(statuses).toEqual([...ALLOWED_TWENTY, 429]);
  });
});

describe("who shares a bucket when the owner names the host", () => {
  beforeEach(() => {
    vi.stubEnv(SOURCE_VARIABLE, "vercel");
  });

  const from = (address: string) => ({ "x-forwarded-for": address });

  it.each([
    ["two hosts of one /24", "203.0.113.1", "203.0.113.254"],
    ["an address and its mapped form", "203.0.113.9", "::ffff:203.0.113.200"],
    ["a mapped form written in hexadecimal", "203.0.113.9", "::ffff:cb00:71c8"],
    [
      "two hosts of one /64",
      "2001:db8:5d8:1c0::1",
      "2001:0DB8:05d8:01c0:ffff:ffff:ffff:ffff",
    ],
    ["a list and no header at all", "203.0.113.1, 198.51.100.2", ""],
    ["an address with a port and a zone", "203.0.113.1:443", "fe80::1%eth0"],
    ["a leading zero and a space inside", "203.0.113.01", "203.0.113. 1"],
  ])("counts %s under one key", async (_label, one, other) => {
    expect(await keyCountedFor(from(one))).toBe(
      await keyCountedFor(from(other)),
    );
  });

  it.each([
    ["two neighbouring /24s", "203.0.113.255", "203.0.114.0"],
    ["two neighbouring /64s", "2001:db8:5d8:1c0::1", "2001:db8:5d8:1c1::1"],
    ["an IPv4 block and the IPv6 block of the same digits", "0.0.0.1", "::1"],
    ["an address and no address", "203.0.113.1", "not an address"],
  ])("counts %s under two keys", async (_label, one, other) => {
    expect(await keyCountedFor(from(one))).not.toBe(
      await keyCountedFor(from(other)),
    );
  });

  it("reads that one header and no other a client could send", async () => {
    const otherHeaders = Object.fromEntries(
      FORWARDING_HEADERS.filter((name) => name !== "x-forwarded-for").map(
        (name) => [name, "198.51.100.77"],
      ),
    );

    const withOthers = await keyCountedFor({
      ...from("203.0.113.1"),
      ...otherHeaders,
    });

    expect(withOthers).toBe(await keyCountedFor(from("203.0.113.1")));
    expect(await keyCountedFor(otherHeaders)).toBe(await keyCountedFor({}));
  });

  it("refuses the twenty-first mint of one block while another block still mints", async () => {
    const oneBlock = await statusesOf(
      MINT_DAILY_FIGURE + 1,
      from("203.0.113.5"),
    );

    const anotherBlock = await statusesOf(1, from("198.51.100.5"));

    expect(oneBlock).toEqual([...ALLOWED_TWENTY, 429]);
    expect(anotherBlock).toEqual([201]);
  });

  it("keeps the block, the key and the visitor out of a refusal's answer and its one line", async () => {
    const address = "203.0.113.77";
    const key = await keyCountedFor(from(address));
    await statusesOf(MINT_DAILY_FIGURE, from(address));
    const consoleSpies = spyOnEveryConsoleMethod();

    const refused = await mint({ ...from(address), cookie: VISITOR_COOKIE });

    const readings = everyReadingOf([
      [...refused.headers],
      await refused.text(),
      consoleCallsOf(consoleSpies),
    ]);
    expect(refused.status).toBe(429);
    expect(consoleCallsOf(consoleSpies)).toHaveLength(1);
    for (const kept of ["203.0.113", key, "QA-VISITOR", USABLE_SECRET]) {
      expect(readings).not.toContain(kept);
    }
  });
});

describe("the secret and the keys made under it", () => {
  it("gives every bucket another key when the secret is replaced, and the same key while it stays", async () => {
    vi.stubEnv(SOURCE_VARIABLE, "vercel");
    const addresses = ["", "203.0.113.1", "2001:db8:5d8:1c0::1"];
    const keysUnder = async (secret: string) => {
      vi.stubEnv(SECRET_VARIABLE, secret);
      const keys = [];
      for (const address of addresses) {
        keys.push(await keyCountedFor({ "x-forwarded-for": address }));
      }
      return keys;
    };

    const first = await keysUnder(USABLE_SECRET);
    const replaced = await keysUnder(OTHER_USABLE_SECRET);
    const again = await keysUnder(USABLE_SECRET);

    expect(again).toEqual(first);
    expect(replaced.filter((key) => first.includes(key))).toEqual([]);
    expect(new Set([...first, ...replaced]).size).toBe(2 * addresses.length);
    expect(
      [...first, ...replaced].every((key) => /^[0-9a-f]{64}$/.test(key)),
    ).toBe(true);
  });

  it("starts a block from nothing under a new secret, so a replaced secret forgets the day's count", async () => {
    await statusesOf(MINT_DAILY_FIGURE + 1);
    vi.stubEnv(SECRET_VARIABLE, OTHER_USABLE_SECRET);

    expect(await statusesOf(1)).toEqual([201]);
  });
});

describe("a store that answers something that is no count", () => {
  const NO_COUNTS: readonly [string, unknown][] = [
    ["nought", [0]],
    ["a negative", [-1]],
    ["a fraction under one", [0.5]],
    ["a fraction over one", [1.5]],
    ["what is not a number", [Number.NaN]],
    ["infinity", [Number.POSITIVE_INFINITY]],
    ["a count written as text", ["20"]],
    ["nothing", [null]],
    ["no count at all", []],
    ["a count that is not in a list", 1],
    ["a count inside a list inside the list", [[1]]],
  ];

  it.each(NO_COUNTS)(
    "answers 503 as a failed store and makes no design, for %s",
    async (_label, answer) => {
      const consoleSpies = spyOnEveryConsoleMethod();
      hitsRecorded().mockResolvedValue(answer as readonly number[]);

      const response = await mint({ cookie: VISITOR_COOKIE });

      expect(response.status).toBe(503);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(work.done).toEqual([]);
      expect(rows.mints).toEqual([]);
      expect(consoleCallsOf(consoleSpies)).toEqual([
        [
          "[designs]",
          {
            event: "design-operation-unavailable",
            operation: "mint",
            refusalCode: "MINT_UNAVAILABLE",
            status: 503,
            cause: "store-failed",
          },
        ],
      ]);
    },
  );

  it.each([
    ["one", 1, 201],
    ["the figure", MINT_DAILY_FIGURE, 201],
    ["one past the figure", MINT_DAILY_FIGURE + 1, 429],
  ])(
    "judges a whole count of %s as a count, so the cases above are refused for what they are",
    async (_label, count, status) => {
      hitsRecorded().mockResolvedValue([count]);

      expect((await mint()).status).toBe(status);
    },
  );
});

describe("the key the e2e harness removes a run's rows by", () => {
  it("is the key the route counts a mint under when the server runs under the e2e flag and that secret", async () => {
    vi.stubEnv(FLAG_VARIABLE, "1");
    spyOnEveryConsoleMethod();

    const counted = await keyCountedFor({ "x-forwarded-for": "203.0.113.1" });

    expect(counted).toBe(
      bucketKeyOfTheRun(USABLE_SECRET, E2E_MINT_POLICY_NAME),
    );
  });

  it("is, for a server with no flag, the key of the production policy and not the e2e policy's", async () => {
    const counted = await keyCountedFor({});

    expect(counted).toBe(bucketKeyOfTheRun(USABLE_SECRET, MINT_POLICY_NAME));
    expect(counted).not.toBe(
      bucketKeyOfTheRun(USABLE_SECRET, E2E_MINT_POLICY_NAME),
    );
  });

  it("is not the key of a server that was handed another secret", async () => {
    const counted = await keyCountedFor({});

    expect(counted).not.toBe(
      bucketKeyOfTheRun(OTHER_USABLE_SECRET, MINT_POLICY_NAME),
    );
  });
});

describe("the three-second deadline, at the route", () => {
  interface PendingStore {
    readonly hits: HitsSpy;
    answer(counts: readonly number[]): void;
    fail(error: unknown): void;
  }

  function storeThatHasNotAnswered(): PendingStore {
    let answer: (counts: readonly number[]) => void = () => undefined;
    let fail: (error: unknown) => void = () => undefined;
    const hits = hitsRecorded().mockImplementation(
      () =>
        new Promise<readonly number[]>((resolve, reject) => {
          answer = resolve;
          fail = reject;
        }),
    );
    return {
      hits,
      answer: (counts) => {
        answer(counts);
      },
      fail: (error) => {
        fail(error);
      },
    };
  }

  function oneRealTurn(): Promise<void> {
    return new Promise((resolve) => {
      setImmediate(resolve);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  it("has not answered a millisecond before it passes, and answers 503 when it does", async () => {
    storeThatHasNotAnswered();
    let status: number | undefined;
    void mint().then((response) => {
      status = response.status;
    });

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_DEADLINE_MS - 1);
    const statusBefore = status;
    await vi.advanceTimersByTimeAsync(1);

    expect(statusBefore).toBeUndefined();
    expect(status).toBe(503);
    expect(rows.mints).toEqual([]);
  });

  it("makes no design and writes no second line when the store allows the hit after it passed", async () => {
    const consoleSpies = spyOnEveryConsoleMethod();
    const store = storeThatHasNotAnswered();
    const pending = mint();
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_DEADLINE_MS);
    const response = await pending;

    store.answer([1]);
    await oneRealTurn();

    expect(response.status).toBe(503);
    expect(work.done).toEqual([]);
    expect(store.hits).toHaveBeenCalledTimes(1);
    expect(consoleCallsOf(consoleSpies)).toHaveLength(1);
  });

  it("leaves no rejection unhandled when the store fails after it passed", async () => {
    spyOnEveryConsoleMethod();
    const unhandled: unknown[] = [];
    const remember = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", remember);
    const store = storeThatHasNotAnswered();
    const pending = mint();
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_DEADLINE_MS);
    await pending;

    store.fail(new Error("the database answered too late"));
    await oneRealTurn();
    await oneRealTurn();
    process.off("unhandledRejection", remember);

    expect(unhandled).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
