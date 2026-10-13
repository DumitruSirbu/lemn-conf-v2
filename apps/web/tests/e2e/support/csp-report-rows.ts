import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  countCspReportsForTests,
  deleteCspReportsForTests,
} from "@lemnaria/persistence";

import { keyedDigest } from "../../../src/lib/server/digest/keyed-digest";
import { CSP_REPORT_POLICY } from "../../../src/lib/server/rate-limit/limit-policy";

import { makeRunSecret, secretOfThisRun } from "./e2e-rate-limit-run";

/**
 * The table the writer mark stands for. `src/lib/server/csp/csp-report-writer-mark.ts` holds the same constant and is
 * server-only, so a Playwright process cannot import it: `csp-report-rows.test.ts` pins this derivation against that
 * module's own output, and a change to either side fails there.
 */
const WRITER_TABLE = "csp_reports";

const WRITER_MARK = /^[0-9a-f]{64}$/;
const REGISTRY_FILE_PREFIX = "lemnaria-e2e-second-server-marks-";
const REGISTRY_NAME_CHARACTERS = 16;

/**
 * The mark every `csp_reports` row a server holding this secret writes carries: the digest the server makes, computed
 * here from the secret's bytes with the one digest function the server uses.
 */
export function cspReportWriterMarkOf(secretHex: string): string {
  return keyedDigest(Buffer.from(secretHex, "hex"), {
    purpose: "csp-report-writer",
    fields: { table: WRITER_TABLE },
  });
}

/**
 * A second server's secret, made for it alone, whose writer mark is written down before the server can start. Second
 * servers are started in test workers and the rows they write are removed by the teardown in the runner's main process,
 * which cannot see a worker's memory; the mark, which names no secret and is already held by every row it labels, is
 * what crosses. A server that never comes up leaves a mark that matches nothing.
 */
export function makeSecondServerSecret(): string {
  const secret = makeRunSecret();
  registerSecondServerMark(secretOfThisRun(), cspReportWriterMarkOf(secret));
  return secret;
}

/** The marks of every second server this run started, as written down, each checked as a mark when it is read back. */
export function readSecondServerMarks(runSecretHex: string): readonly string[] {
  const path = registryPathOf(runSecretHex);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "");
  for (const line of lines) requireWriterMark(line);
  return [...new Set(lines)];
}

/** What the table held under a group of marks before they were removed, and what the removal then took away. */
export interface RowsOfMarks {
  readonly counted: number;
  readonly removed: number;
}

export interface CspReportRowsOfTheRun {
  /** The suite's own server's rows. */
  readonly suite: RowsOfMarks;
  /** Every second server's rows together. */
  readonly secondServers: RowsOfMarks;
  /** How many second servers the run started, whether or not they wrote. */
  readonly secondServersStarted: number;
}

export interface CspReportRowsRemoval {
  readonly figures: CspReportRowsOfTheRun;
  /** One per group whose count or removal failed. Empty when every row of the run is gone. */
  readonly failures: readonly Error[];
}

const NO_ROWS: RowsOfMarks = { counted: 0, removed: 0 };

/**
 * Counts, then removes, the `csp_reports` rows written under the run's marks: the suite's server's, and each second
 * server's, through the guarded test helpers and by mark alone. Both groups are tried whatever the first does, and the
 * list of second servers is forgotten only when every row is gone. It never throws: a failure is answered, so the
 * teardown can remove everything else before it fails.
 */
export async function removeCspReportRowsOfTheRun(
  runSecretHex: string,
): Promise<CspReportRowsRemoval> {
  const secondMarks = readableSecondServerMarks(runSecretHex);
  const suite = await attempt(() =>
    countThenRemove([cspReportWriterMarkOf(runSecretHex)]),
  );
  const secondServers = await attempt(() =>
    countThenRemove(secondMarks.marks ?? []),
  );
  const failures = [
    ...(secondMarks.failure === undefined ? [] : [secondMarks.failure]),
    ...(suite.failure === undefined ? [] : [suite.failure]),
    ...(secondServers.failure === undefined ? [] : [secondServers.failure]),
  ];
  if (failures.length === 0) forgetSecondServerMarks(runSecretHex);
  return {
    figures: {
      suite: suite.rows ?? NO_ROWS,
      secondServers: secondServers.rows ?? NO_ROWS,
      secondServersStarted: secondMarks.marks?.length ?? 0,
    },
    failures,
  };
}

/** The run removed more rows than its server's counter recorded hits: a row the limiter never let through. */
export function requireCspReportRowsWithinHits(
  rowsRemoved: number,
  hitsCounted: number,
): void {
  if (rowsRemoved > hitsCounted) {
    throw new CspReportRowsExceedHitsError(rowsRemoved, hitsCounted);
  }
}

export class CspReportRowsExceedHitsError extends Error {
  readonly rowsRemoved: number;
  readonly hitsCounted: number;

  constructor(rowsRemoved: number, hitsCounted: number) {
    super(
      `The teardown removed ${String(rowsRemoved)} csp_reports rows written by this run's server, but its ` +
        `${CSP_REPORT_POLICY.name} counter recorded ${String(hitsCounted)} hits: a row is stored only after a hit is counted, ` +
        "so either the writer mark is not this run's or the store wrote a row the limiter did not let through",
    );
    this.name = "CspReportRowsExceedHitsError";
    this.rowsRemoved = rowsRemoved;
    this.hitsCounted = hitsCounted;
  }
}

function registerSecondServerMark(runSecretHex: string, mark: string): void {
  appendFileSync(registryPathOf(runSecretHex), `${mark}\n`, "utf8");
}

function forgetSecondServerMarks(runSecretHex: string): void {
  rmSync(registryPathOf(runSecretHex), { force: true });
}

/** Keyed by the suite's own mark, which is public in the table, so the run's secret is named in no file. */
function registryPathOf(runSecretHex: string): string {
  const name = cspReportWriterMarkOf(runSecretHex).slice(
    0,
    REGISTRY_NAME_CHARACTERS,
  );
  return join(tmpdir(), `${REGISTRY_FILE_PREFIX}${name}`);
}

function requireWriterMark(candidate: string): void {
  if (!WRITER_MARK.test(candidate)) {
    throw new Error(
      "The list of second servers' marks holds a line that is not sixty-four lowercase hexadecimal characters",
    );
  }
}

function readableSecondServerMarks(runSecretHex: string): {
  readonly marks?: readonly string[];
  readonly failure?: Error;
} {
  try {
    return { marks: readSecondServerMarks(runSecretHex) };
  } catch (failure) {
    return { failure: asError(failure) };
  }
}

async function countThenRemove(marks: readonly string[]): Promise<RowsOfMarks> {
  if (marks.length === 0) return NO_ROWS;
  const counted = await countCspReportsForTests(marks);
  const removed = await deleteCspReportsForTests(marks);
  return { counted, removed };
}

async function attempt(
  work: () => Promise<RowsOfMarks>,
): Promise<{ readonly rows?: RowsOfMarks; readonly failure?: Error }> {
  try {
    return { rows: await work() };
  } catch (failure) {
    return { failure: asError(failure) };
  }
}

function asError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}
