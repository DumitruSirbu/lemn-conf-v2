import {
  requireValidCspReportRow,
  type CspReportRow,
} from "@lemnaria/persistence";

import {
  reduceCspReport,
  type ReducedCspReport,
} from "@/lib/server/csp/csp-report";
import {
  reportCspReportUnstored,
  reportCspViolation,
  type UnstoredCause,
} from "@/lib/server/csp/csp-report-log";
import { getCspReportStore } from "@/lib/server/csp/csp-report-store-instance";
import { readCspReportWriterMark } from "@/lib/server/csp/csp-report-writer-mark";
import { refusalOfCspReportLimit } from "@/lib/server/csp/judge-csp-report";
import { RATE_LIMIT_DEADLINE_MS } from "@/lib/server/rate-limit/enforce-rate-limit";
import { limitedAnswerHeaders } from "@/lib/server/rate-limit/page-limit-page";
import { readUtf8BodyWithLimit } from "@/lib/server/read-body-with-limit";

/** A browser's report is a few hundred bytes; this is a generous cap. */
const CSP_REPORT_BODY_MAX_BYTES = 8 * 1024;

const CSP_REPORT_MEDIA_TYPE = "application/csp-report";

const ACCEPTED_STATUS = 204;
const BAD_REQUEST_STATUS = 400;
const TOO_LARGE_STATUS = 413;
const UNSUPPORTED_MEDIA_TYPE_STATUS = 415;

/**
 * A browser's report of a policy violation (ADR 0161 decision 2). Each step refuses before the next costs more: the
 * media type (no write), then one hit counted for the network block so a refused request reads nothing, then the
 * bounded body, then the reduction. A refusal logs nothing, except the first `429` of each UTC hour.
 *
 * An accepted report is logged, then kept in the table (ADR 0162): awaited under the limiter's deadline, never
 * repeated, and best effort, so a report that cannot be kept is still answered `204` and written once as unstored.
 *
 * A report arrives with the visitor's cookies; the route is a plain `Request` and reads and sets none.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isCspReportRequest(request))
    return emptyAnswer(UNSUPPORTED_MEDIA_TYPE_STATUS);
  const limited = await refusalOfCspReportLimit(request.headers);
  if (limited !== undefined) return limited;
  const body = await readUtf8BodyWithLimit(
    request.body,
    CSP_REPORT_BODY_MAX_BYTES,
  );
  if (!body.ok) {
    return emptyAnswer(
      body.failure === "too-large" ? TOO_LARGE_STATUS : BAD_REQUEST_STATUS,
    );
  }
  const reduction = reduceCspReport(body.value, new URL(request.url).origin);
  if (reduction.kind === "not-a-report") return emptyAnswer(BAD_REQUEST_STATUS);
  reportCspViolation(reduction.record);
  await keepReport(reduction.record);
  return emptyAnswer(ACCEPTED_STATUS);
}

type Kept = { readonly isKept: true } | { readonly cause: UnstoredCause };

/** Never throws and never rejects: nothing the store does may change what the browser is told. */
async function keepReport(record: ReducedCspReport): Promise<void> {
  const kept = await tryToKeep(record);
  if ("cause" in kept) reportCspReportUnstored(kept.cause);
}

async function tryToKeep(record: ReducedCspReport): Promise<Kept> {
  const writer = readCspReportWriterMark(process.env);
  if (writer.status === "unavailable") return { cause: "mark-unavailable" };
  const row: CspReportRow = { ...record, writerMark: writer.mark };
  if (!isStorable(row)) return { cause: "row-refused" };
  return writeWithinDeadline(row);
}

/** The table's own checks, run in code first, so a row it would refuse is told apart from a store that failed. */
function isStorable(row: CspReportRow): boolean {
  try {
    requireValidCspReportRow(row);
    return true;
  } catch {
    return false;
  }
}

/**
 * The store is made inside the promise, so its synchronous throw (no `DATABASE_URL`) is a rejection like any other. Its
 * late answer or rejection is handled where it is made, so a deadline that has passed leaves nothing unhandled behind.
 * Whatever the database refuses, a missing table (42P01) or a missing grant (42501) included, is the same failure.
 */
async function writeWithinDeadline(row: CspReportRow): Promise<Kept> {
  const written = new Promise<void>((resolve) => {
    resolve(getCspReportStore().recordReport(row));
  }).then(
    (): Kept => ({ isKept: true }),
    (): Kept => ({ cause: "store-failed" }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Kept>((resolve) => {
    timer = setTimeout(() => {
      resolve({ cause: "deadline" });
    }, RATE_LIMIT_DEADLINE_MS);
  });
  try {
    return await Promise.race([written, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** The media type alone decides, whatever parameters follow it and in whatever case it is written. */
function isCspReportRequest(request: Request): boolean {
  const [mediaType = ""] = (request.headers.get("content-type") ?? "").split(
    ";",
  );
  return mediaType.trim().toLowerCase() === CSP_REPORT_MEDIA_TYPE;
}

function emptyAnswer(status: number): Response {
  return new Response(null, { status, headers: limitedAnswerHeaders() });
}
