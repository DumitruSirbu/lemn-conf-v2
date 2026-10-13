import { reduceCspReport } from "@/lib/server/csp/csp-report";
import { reportCspViolation } from "@/lib/server/csp/csp-report-log";
import { refusalOfCspReportLimit } from "@/lib/server/csp/judge-csp-report";
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
  return emptyAnswer(ACCEPTED_STATUS);
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
