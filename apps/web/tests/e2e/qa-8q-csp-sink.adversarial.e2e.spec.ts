// Wave 8Q criterion 4 and 5, QA's, against a RUNNING production server (not the route function with fakes): a hostile
// set of requests to `POST /api/csp-reports`, on a second server whose output this spec reads. The sink's order is 8Q.3's:
// the media type (`415`, nothing counted), one counted hit (`429` with the wait, nothing read), the body to 8 KiB (`413`,
// or `400`), a `csp-report` object (`400`), then one reduced line and an empty `204`. The checks that only a live server
// can make: exactly one `[csp]` line for each `204` and none for any refusal, the number of hits the limiter counted
// under the block's key (a `415` counts nothing, every request after it counts one, however it ends), the answer carries
// no `Set-Cookie` and echoes nothing, and none of the planted secrets of a request is anywhere in the server's output.
//
// Writes: counter rows only, under the second server's own secret, all removed; at most 100 hits in the hour's bucket.
// THIS FILE IS A `CI=1` SPEC. It sends to the second server alone: a report to the suite's server would be counted by the
// run's teardown, which fails a run that counted one. Run it with:
//   CI=1 pnpm exec playwright test tests/e2e/qa-8q-csp-sink.adversarial.e2e.spec.ts --project=mobile
import { deleteRateLimitCountersForTests } from "@lemnaria/persistence";
import { expect, test } from "@playwright/test";

import { SHARED_BLOCK } from "../../src/lib/server/rate-limit/client-network";
import {
  ALL_LIMIT_POLICIES,
  CSP_REPORT_POLICY,
  CSP_REPORTS_PER_BLOCK_FIGURE,
} from "../../src/lib/server/rate-limit/limit-policy";
import { CSP_REPORT_PATH } from "../../src/lib/security-headers";
import { bucketKeyOfBlock } from "./support/e2e-rate-limit-run";
import { deleteMintedDesigns } from "./support/minted-designs";
import {
  CSP_SINK_SERVER_PORT,
  startProductionPolicyServer,
  type ProductionPolicyServer,
} from "./support/production-policy-server";

const RUN_UNDER_CI =
  "It starts the production build the first server makes under CI. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8q-csp-sink.adversarial.e2e.spec.ts --project=mobile";

const SERVER_START_TIMEOUT_MS = 300_000;
const SETTLE_MS = 250;
const LOG_LABEL = "[csp]";
const REPORT_TYPE = "application/csp-report";
const BODY_CAP_BYTES = 8 * 1024;
const MINUTES_TO_KEEP_CLEAR_OF_THE_HOUR = 3;
const OWN_ORIGIN = `http://localhost:${String(CSP_SINK_SERVER_PORT)}`;

/** Secrets of a request: none may reach the server's output. */
const SHARE_TOKEN = "Zq7ShareTokenOfAVisitorQa8q";
const QUERY_SECRET = "Zq7QuerySecretQa8q";
const FRAGMENT_SECRET = "Zq7FragmentSecretQa8q";
const COOKIE_SECRET = "Zq7CookieSecretQa8q";
const AGENT_SECRET = "Zq7AgentSecretQa8q";
const ADDRESS_SECRET = "203.0.113.99";
const USERINFO_SECRET = "Zq7UserInfoSecretQa8q";
const SAMPLE_SECRET = "Zq7ScriptSampleSecretQa8q";
const REFERRER_SECRET = "Zq7ReferrerSecretQa8q";
const POLICY_SECRET = "Zq7PolicySecretQa8q";
const EXTRA_SECRET = "Zq7UnknownFieldSecretQa8q";
const PATH_SECRET = "Zq7PathSecretQa8q";
const SECRETS = [
  SHARE_TOKEN,
  QUERY_SECRET,
  FRAGMENT_SECRET,
  COOKIE_SECRET,
  AGENT_SECRET,
  ADDRESS_SECRET,
  USERINFO_SECRET,
  SAMPLE_SECRET,
  REFERRER_SECRET,
  POLICY_SECRET,
  EXTRA_SECRET,
  PATH_SECRET,
];
const ALLOWED_KEYS = [
  "event",
  "directive",
  "blocked",
  "source",
  "line",
  "column",
  "page",
  "locale",
  "origin",
  "disposition",
  "status",
];

interface Answer {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
}

interface Case {
  readonly name: string;
  readonly type: string | undefined;
  readonly body: string | Uint8Array | (() => ReadableStream<Uint8Array>);
  readonly status: number;
  /** Checks on the one record a `204` writes. */
  readonly record?: (record: Record<string, unknown>) => void;
}

test.describe.configure({ mode: "serial" });

test.describe("the sink on a running server, under hostile requests", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  let server: ProductionPolicyServer | undefined;
  let counted = 0;
  const mintedIds: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(SERVER_START_TIMEOUT_MS);
    await waitForAWindowWithRoom();
    server = await startProductionPolicyServer(CSP_SINK_SERVER_PORT, {
      captureOutput: true,
    });
  });

  test.afterAll(async () => {
    await server?.stop();
    if (server !== undefined) await removeEveryCounterOf(server.secret);
    await deleteMintedDesigns(mintedIds);
  });

  const report = (fields: Record<string, unknown> = {}): string =>
    JSON.stringify({ "csp-report": reportFields(fields) });

  const CASES: readonly Case[] = [
    {
      name: "no Content-Type at all is 415",
      type: undefined,
      body: new TextEncoder().encode(report()),
      status: 415,
    },
    {
      name: "application/json is 415",
      type: "application/json",
      body: report(),
      status: 415,
    },
    {
      name: "text/plain is 415",
      type: "text/plain",
      body: report(),
      status: 415,
    },
    {
      name: "application/reports+json (the Reporting API's type) is 415",
      type: "application/reports+json",
      body: report(),
      status: 415,
    },
    {
      name: "application/csp-reportx is 415: the media type is compared whole",
      type: "application/csp-reportx",
      body: report(),
      status: 415,
    },
    {
      name: "application/csp-report with a charset parameter is a report",
      type: `${REPORT_TYPE}; charset=utf-8`,
      body: report(),
      status: 204,
    },
    {
      name: "the media type's case does not matter",
      type: "APPLICATION/CSP-REPORT",
      body: report(),
      status: 204,
    },
    {
      name: "a valid report of exactly 8 KiB is taken",
      type: REPORT_TYPE,
      body: reportOfBytes(BODY_CAP_BYTES),
      status: 204,
    },
    {
      name: "a valid report of 8 KiB and one byte is 413",
      type: REPORT_TYPE,
      body: reportOfBytes(BODY_CAP_BYTES + 1),
      status: 413,
    },
    {
      name: "a chunked body of 8 KiB and one byte is 413",
      type: REPORT_TYPE,
      body: () => chunked(reportOfBytes(BODY_CAP_BYTES + 1)),
      status: 413,
    },
    {
      name: "a chunked body of exactly 8 KiB is taken",
      type: REPORT_TYPE,
      body: () => chunked(reportOfBytes(BODY_CAP_BYTES)),
      status: 204,
    },
    {
      name: "a body of one mebibyte is 413",
      type: REPORT_TYPE,
      body: "x".repeat(1024 * 1024),
      status: 413,
    },
    { name: "an empty body is 400", type: REPORT_TYPE, body: "", status: 400 },
    { name: "JSON null is 400", type: REPORT_TYPE, body: "null", status: 400 },
    { name: "a JSON array is 400", type: REPORT_TYPE, body: "[]", status: 400 },
    {
      name: "a JSON string is 400",
      type: REPORT_TYPE,
      body: '"csp-report"',
      status: 400,
    },
    { name: "{} is 400", type: REPORT_TYPE, body: "{}", status: 400 },
    {
      name: "a csp-report that is a string is 400",
      type: REPORT_TYPE,
      body: '{"csp-report":"x"}',
      status: 400,
    },
    {
      name: "a csp-report that is null is 400",
      type: REPORT_TYPE,
      body: '{"csp-report":null}',
      status: 400,
    },
    {
      name: "a csp-report that is an array is 400",
      type: REPORT_TYPE,
      body: '{"csp-report":[{"blocked-uri":"inline"}]}',
      status: 400,
    },
    {
      name: "text that is not JSON is 400",
      type: REPORT_TYPE,
      body: "{not json",
      status: 400,
    },
    {
      name: "bytes that are not UTF-8 are 400",
      type: REPORT_TYPE,
      body: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]),
      status: 400,
    },
    {
      name: "1,200 levels of nesting are 400, not a crash",
      type: REPORT_TYPE,
      body: `${'{"a":'.repeat(1200)}1${"}".repeat(1200)}`,
      status: 400,
    },
    {
      name: "an empty csp-report object is taken, as nothing but closed values",
      type: REPORT_TYPE,
      body: '{"csp-report":{}}',
      status: 204,
      record: (record) => {
        expect(record.directive).toBe("other");
        expect(record.page).toBe("other");
      },
    },
    {
      name: "a __proto__ key inside the report pollutes nothing and is taken",
      type: REPORT_TYPE,
      body: `{"csp-report":{"__proto__":{"directive":"${EXTRA_SECRET}"},"blocked-uri":"inline"}}`,
      status: 204,
    },
    {
      name: "a share view's address with a query and a fragment: the page is the family, nothing after it",
      type: REPORT_TYPE,
      body: report({
        "document-uri": `${OWN_ORIGIN}/ro/s/${SHARE_TOKEN}?x=${QUERY_SECRET}#${FRAGMENT_SECRET}`,
      }),
      status: 204,
      record: (record) => {
        expect(record.page).toBe("/[locale]/s/[token]");
        expect(record.locale).toBe("ro");
        expect(record.origin).toBe("own");
      },
    },
    {
      name: "a design's review address is the review family, not its id",
      type: REPORT_TYPE,
      body: report({
        "document-uri": `${OWN_ORIGIN}/ru/d/${PATH_SECRET}/review?${QUERY_SECRET}`,
      }),
      status: 204,
      record: (record) => {
        expect(record.page).toBe("/[locale]/d/[id]/review");
        expect(record.locale).toBe("ru");
      },
    },
    {
      name: "a scheme-relative document-uri names no origin, so it is another page",
      type: REPORT_TYPE,
      body: report({ "document-uri": `//evil.example/ro/s/${SHARE_TOKEN}` }),
      status: 204,
      record: (record) => {
        expect(record.origin).toBe("none");
        expect(record.page).toBe("other");
      },
    },
    {
      name: "a javascript: document-uri is origin none",
      type: REPORT_TYPE,
      body: report({ "document-uri": `javascript:alert('${SHARE_TOKEN}')` }),
      status: 204,
      record: (record) => {
        expect(record.origin).toBe("none");
        expect(record.page).toBe("other");
      },
    },
    {
      name: "another origin's share address is foreign, other, and drops the source",
      type: REPORT_TYPE,
      body: report({
        "document-uri": `https://evil.example/ro/s/${SHARE_TOKEN}`,
        "source-file": "https://evil.example/_next/static/chunks/a.js",
      }),
      status: 204,
      record: (record) => {
        expect(record.origin).toBe("foreign");
        expect(record.page).toBe("other");
        expect(record.source).toBeUndefined();
      },
    },
    {
      name: "a 7,000-character document-uri is taken, and none of it is written",
      type: REPORT_TYPE,
      body: report({
        "document-uri": `${OWN_ORIGIN}/ro/s/${"a".repeat(7000)}`,
      }),
      status: 204,
    },
    {
      name: "a 10,000-character document-uri is over the cap: 413",
      type: REPORT_TYPE,
      body: report({
        "document-uri": `${OWN_ORIGIN}/ro/s/${"a".repeat(10_000)}`,
      }),
      status: 413,
    },
    {
      name: "a blocked-uri with user information is cut to its origin",
      type: REPORT_TYPE,
      body: report({
        "blocked-uri": `https://user:${USERINFO_SECRET}@evil.example:8443/path/${PATH_SECRET}?q=${QUERY_SECRET}#${FRAGMENT_SECRET}`,
      }),
      status: 204,
      record: (record) => {
        expect(record.blocked).toBe("https://evil.example:8443");
      },
    },
    {
      name: "a data: blocked-uri is its scheme alone",
      type: REPORT_TYPE,
      body: report({
        "blocked-uri": `data:text/html,<script>${PATH_SECRET}</script>`,
      }),
      status: 204,
      record: (record) => {
        expect(record.blocked).toBe("data");
      },
    },
    {
      name: "a chrome-extension blocked-uri is its scheme alone",
      type: REPORT_TYPE,
      body: report({
        "blocked-uri": `chrome-extension://abcdefgh/${PATH_SECRET}.js`,
      }),
      status: 204,
      record: (record) => {
        expect(record.blocked).toBe("chrome-extension");
      },
    },
    {
      name: "a blocked-uri on the server's own origin is self",
      type: REPORT_TYPE,
      body: report({
        "blocked-uri": `${OWN_ORIGIN}/${PATH_SECRET}?${QUERY_SECRET}`,
      }),
      status: 204,
      record: (record) => {
        expect(record.blocked).toBe("self");
      },
    },
    {
      name: "a source-file with a query keeps the chunk path and drops the query",
      type: REPORT_TYPE,
      body: report({
        "source-file": `${OWN_ORIGIN}/_next/static/chunks/abc.js?q=${QUERY_SECRET}`,
      }),
      status: 204,
      record: (record) => {
        expect(record.source).toBe("/_next/static/chunks/abc.js");
      },
    },
    {
      name: "an own chunk path is kept",
      type: REPORT_TYPE,
      body: report({
        "source-file": `${OWN_ORIGIN}/_next/static/chunks/abc-123.js`,
      }),
      status: 204,
      record: (record) => {
        expect(record.source).toBe("/_next/static/chunks/abc-123.js");
      },
    },
    ...[
      "__proto__",
      "constructor",
      "toString",
      "script-src-elem ' 'nonce-x'",
      "SCRIPT-SRC",
    ].map(
      (directive): Case => ({
        name: `effective-directive ${JSON.stringify(directive)} is a closed value`,
        type: REPORT_TYPE,
        body: report({
          "effective-directive": directive,
          "violated-directive": directive,
        }),
        status: 204,
        record: (record) => {
          expect(["other", "script-src", "script-src-elem"]).toContain(
            record.directive,
          );
          expect(Object.keys(record)).not.toContain("__proto__");
        },
      }),
    ),
    {
      name: "a line-number of 1e309 (infinity once parsed) is absent",
      type: REPORT_TYPE,
      body: '{"csp-report":{"blocked-uri":"inline","line-number":1e309,"column-number":1e309}}',
      status: 204,
      record: (record) => {
        expect(record.line).toBeUndefined();
        expect(record.column).toBeUndefined();
      },
    },
    {
      name: 'a line-number that is the string "12" is absent',
      type: REPORT_TYPE,
      body: report({ "line-number": "12", "column-number": "7" }),
      status: 204,
      record: (record) => {
        expect(record.line).toBeUndefined();
        expect(record.column).toBeUndefined();
      },
    },
    {
      name: "a line-number of 10,000,000 is kept and one above it, or negative, or fractional, is absent",
      type: REPORT_TYPE,
      body: report({ "line-number": 10_000_000, "column-number": -1 }),
      status: 204,
      record: (record) => {
        expect(record.line).toBe(10_000_000);
        expect(record.column).toBeUndefined();
      },
    },
    {
      name: "a status-code outside 100 to 599 is absent",
      type: REPORT_TYPE,
      body: report({ "status-code": 600 }),
      status: 204,
      record: (record) => {
        expect(record.status).toBeUndefined();
      },
    },
    {
      name: "a disposition that is markup is other",
      type: REPORT_TYPE,
      body: report({ disposition: `<script>${EXTRA_SECRET}</script>` }),
      status: 204,
      record: (record) => {
        expect(record.disposition).toBe("other");
      },
    },
    {
      name: "script-sample, referrer, original-policy and an unknown field are read by nothing",
      type: REPORT_TYPE,
      body: report({
        "script-sample": SAMPLE_SECRET,
        referrer: `https://evil.example/${REFERRER_SECRET}`,
        "original-policy": `script-src 'nonce-${POLICY_SECRET}'`,
        "an-unknown-field": EXTRA_SECRET,
      }),
      status: 204,
    },
  ];

  // One test for the whole table, not one per case: the e2e budget counts tests (`gate:e2e-shard-budget`), and the
  // cases share one server and one bucket, so they could not run apart anyway. Each failing case is named in the message.
  test("each hostile request gets its status, writes one reduced line if it is a report and none if it is not, and leaks nothing", async () => {
    const live = requireServer(server);
    const failures: string[] = [];

    for (const hostile of CASES) {
      try {
        const outputBefore = live.output();
        const answer = await send(live, hostile);
        if (hostile.status !== 415) counted += 1;
        expect(answer.status).toBe(hostile.status);
        expect(answer.text, "no body on any answer").toBe("");
        expect(answer.headers.get("set-cookie"), "no cookie set").toBeNull();
        expect(answer.headers.get("cache-control")).toBe("no-store");
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
        const lines = linesIn(live.output().slice(outputBefore.length));
        if (hostile.status === 204) {
          expect(lines, "exactly one line for a report taken").toHaveLength(1);
          const record = lines[0]?.record ?? {};
          expect(record.event).toBe("csp-violation");
          expect(
            Object.keys(record).filter((key) => !ALLOWED_KEYS.includes(key)),
          ).toEqual([]);
          hostile.record?.(record);
        } else {
          expect(lines, "no line for a refusal").toEqual([]);
        }
        expectNoSecretIn(live.output().slice(outputBefore.length));
      } catch (error) {
        failures.push(
          `${hostile.name}: ${(error as Error).message.split("\n")[0] ?? ""}`,
        );
      }
    }

    expect(failures).toEqual([]);
    expect(CASES.length, "the table is not empty").toBeGreaterThan(40);
  });

  test("a method that is not POST is refused, counts nothing and writes nothing", async () => {
    const live = requireServer(server);
    const outputBefore = live.output();
    const statuses: Record<string, number> = {};

    for (const method of ["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      const response = await fetch(`${live.origin}${CSP_REPORT_PATH}`, {
        method,
      });
      statuses[method] = response.status;
    }

    expect(statuses).toMatchObject({
      GET: 405,
      PUT: 405,
      PATCH: 405,
      DELETE: 405,
      HEAD: 405,
    });
    expect([404, 405, 204]).toContain(statuses.OPTIONS);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(linesIn(live.output().slice(outputBefore.length))).toEqual([]);
  });

  test("the cookie, user agent and forwarding header a report carries reach no line and no answer", async () => {
    const live = requireServer(server);
    const outputBefore = live.output();

    const answer = await send(
      live,
      { type: REPORT_TYPE, body: report() },
      {
        cookie: `__Host-lemnaria_visitor=${COOKIE_SECRET}; NEXT_LOCALE=ru`,
        "user-agent": `QA/${AGENT_SECRET}`,
        "x-forwarded-for": ADDRESS_SECRET,
        origin: live.origin,
      },
    );
    counted += 1;

    expect(answer.status).toBe(204);
    expect(answer.headers.get("set-cookie")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    expect(linesIn(live.output().slice(outputBefore.length))).toHaveLength(1);
    expectNoSecretIn(live.output());
  });

  test("the limiter counted exactly the requests that passed the media type, and the output holds no secret of any request", async () => {
    const live = requireServer(server);

    const hits = await countersOf(live.secret);

    expect(hits.rows, "one bucket").toBe(1);
    expect(hits.hits, "a 415 counts nothing; every other POST counts one").toBe(
      counted,
    );
    expect(counted).toBeLessThan(CSP_REPORTS_PER_BLOCK_FIGURE);
    expectNoSecretIn(live.output());
    // Reading removes the row, so the window begins again from nothing: the next test fills it from zero.
    counted = 0;
  });

  test("the figure-th report is 204 and the next is 429 with a wait, no body and one limited line an hour; a wrong type is still 415", async () => {
    const live = requireServer(server);
    const outputBefore = live.output();
    const body = report();

    for (let sent = 0; sent < CSP_REPORTS_PER_BLOCK_FIGURE; sent += 1) {
      const answer = await send(live, { type: REPORT_TYPE, body });
      expect(
        answer.status,
        `report ${String(sent + 1)} of ${String(CSP_REPORTS_PER_BLOCK_FIGURE)}`,
      ).toBe(204);
    }
    const refusals: Answer[] = [];
    for (let extra = 0; extra < 4; extra += 1) {
      refusals.push(await send(live, { type: REPORT_TYPE, body }));
    }
    const wrongType = await send(live, { type: "text/plain", body });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS * 2));

    for (const refusal of refusals) {
      expect(refusal.status).toBe(429);
      expect(refusal.text).toBe("");
      expect(Number(refusal.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(Number(refusal.headers.get("retry-after"))).toBeLessThanOrEqual(
        3600,
      );
      expect(refusal.headers.get("set-cookie")).toBeNull();
    }
    expect(wrongType.status, "the type is judged before the count").toBe(415);
    const lines = linesIn(live.output().slice(outputBefore.length));
    const limited = lines.filter(
      (line) => line.record.event === "csp-report-limited",
    );
    expect(limited, "one limited line for four refusals").toHaveLength(1);
    expect(Object.keys(limited[0]?.record ?? {})).toEqual(["event"]);
    expect(
      lines.filter((line) => line.record.event === "csp-violation"),
      "one line for each report taken, none for a refusal",
    ).toHaveLength(CSP_REPORTS_PER_BLOCK_FIGURE);
    expect(lines).toHaveLength(CSP_REPORTS_PER_BLOCK_FIGURE + 1);
  });

  test("mints one design so the run's teardown, which fails a run that minted none, has its row; the teardown itself shows this spec sent the suite's server no report", async ({
    request,
  }) => {
    const minted = (await (
      await request.post("/api/designs", {
        headers: { "sec-fetch-site": "same-origin" },
      })
    ).json()) as { id?: string };
    if (typeof minted.id === "string") mintedIds.push(minted.id);

    expect(typeof minted.id).toBe("string");
  });
});

function requireServer(
  server: ProductionPolicyServer | undefined,
): ProductionPolicyServer {
  if (server === undefined) throw new Error("the second server did not start");
  return server;
}

/** The fields of a Chromium 151 report on a share view, on the server's own origin. */
function reportFields(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    "document-uri": `${OWN_ORIGIN}/ro/configurator/room`,
    referrer: "",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "original-policy": "default-src 'self'",
    disposition: "enforce",
    "blocked-uri": "inline",
    "status-code": 200,
    "script-sample": "",
    ...overrides,
  };
}

/** A valid report whose text is exactly `bytes` long, padded by a field the reduction never reads. */
function reportOfBytes(bytes: number): string {
  const unpadded = JSON.stringify({
    "csp-report": { ...reportFields({}), pad: "" },
  });
  return JSON.stringify({
    "csp-report": {
      ...reportFields({}),
      pad: "p".repeat(bytes - unpadded.length),
    },
  });
}

function chunked(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  const chunkSize = 1000;
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

async function send(
  server: ProductionPolicyServer,
  hostile: Pick<Case, "type" | "body">,
  headers: Record<string, string> = {},
): Promise<Answer> {
  const requestHeaders: Record<string, string> = { ...headers };
  if (hostile.type !== undefined) requestHeaders["content-type"] = hostile.type;
  const raw =
    typeof hostile.body === "function" ? hostile.body() : hostile.body;
  const body = raw;
  const response = await fetch(`${server.origin}${CSP_REPORT_PATH}`, {
    method: "POST",
    headers: requestHeaders,
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);
  return {
    status: response.status,
    headers: response.headers,
    text: await response.text(),
  };
}

function expectNoSecretIn(output: string): void {
  for (const secret of SECRETS) {
    expect(
      output,
      `a planted secret, ${secret.slice(0, 6)}…, in the server's output`,
    ).not.toContain(secret);
  }
}

interface Line {
  readonly raw: string;
  readonly record: Record<string, unknown>;
}

function linesIn(output: string): Line[] {
  return output
    .split("\n")
    .filter((text) => text.startsWith(LOG_LABEL))
    .map((raw) => ({
      raw,
      record: JSON.parse(raw.slice(LOG_LABEL.length).trim()) as Record<
        string,
        unknown
      >,
    }));
}

function keyOf(secret: string): string {
  return bucketKeyOfBlock(secret, CSP_REPORT_POLICY.name, SHARED_BLOCK);
}

/** What the server counted under the block's key. Reading removes the row, so {@link recount} puts it back. */
async function countersOf(
  secret: string,
): Promise<{ rows: number; hits: number }> {
  const removed = await deleteRateLimitCountersForTests([keyOf(secret)]);
  return {
    rows: removed.rowsRemoved,
    hits: removed.counts.reduce((sum, count) => sum + count, 0),
  };
}

async function removeEveryCounterOf(secret: string): Promise<void> {
  await deleteRateLimitCountersForTests(
    ALL_LIMIT_POLICIES.map((policy) =>
      bucketKeyOfBlock(secret, policy.name, SHARED_BLOCK),
    ),
  );
}

/** The bucket's window is the clock hour: a run across its boundary would count in two buckets and mean nothing. */
async function waitForAWindowWithRoom(): Promise<void> {
  const now = new Date();
  const minutesLeft = 60 - now.getUTCMinutes();
  if (minutesLeft > MINUTES_TO_KEEP_CLEAR_OF_THE_HOUR) return;
  await new Promise((resolve) =>
    setTimeout(resolve, (minutesLeft * 60 + 5) * 1000),
  );
}
