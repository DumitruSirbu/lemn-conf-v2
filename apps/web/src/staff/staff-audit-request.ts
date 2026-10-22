import { classifySignedInAnswer } from "@/account/account-answer";

import { staffAuditPageFrom } from "./staff-audit-wire-reading";
import type { PageStep, StaffAuditQuery } from "./staff-audit-listing";
import { askStaffRoute, failureOf } from "./staff-read-request";

// The one request the audit page makes: a GET of a page of the log, by the filters the person chose. They travel in the
// API URL's query (actor id, action, days), as the kitchens list's search does, and so can reach the platform's request
// logs; the browser's own address bar, storage and history never hold them.

const STAFF_AUDIT_ENDPOINT = "/api/staff/audit";

/** Asks for one page and tells what came of it. Never throws: a network that is gone is a failure like any other. */
export async function readPage(
  query: StaffAuditQuery,
  signal: AbortSignal,
): Promise<PageStep> {
  const reading = await askStaffRoute(addressOf(query), signal);
  switch (reading.kind) {
    case "aborted":
      return { kind: "aborted" };
    case "offline":
      return { kind: "failed", failure: { kind: "offline" } };
    case "answered":
      return stepOf(reading.answer);
  }
}

function addressOf(query: StaffAuditQuery): string {
  const members = new URLSearchParams({ page: String(query.page) });
  if (query.action !== null) members.set("action", query.action);
  if (query.actorId !== null) members.set("actor", query.actorId);
  if (query.from !== null) members.set("from", query.from);
  if (query.to !== null) members.set("to", query.to);
  return `${STAFF_AUDIT_ENDPOINT}?${members.toString()}`;
}

function stepOf(
  answer: Parameters<typeof classifySignedInAnswer>[1],
): PageStep {
  // The staff list's flow is the one that reads `200` as data and has no refusal of a kitchen; the log asks no more of it.
  const outcome = classifySignedInAnswer("kitchens", answer);
  switch (outcome.kind) {
    case "received": {
      const log = staffAuditPageFrom(outcome.body);
      return log === undefined
        ? { kind: "failed", failure: { kind: "failed" } }
        : { kind: "page", log };
    }
    case "unauthenticated":
      return { kind: "sign-in" };
    case "forbidden":
      return { kind: "forbidden" };
    default:
      return { kind: "failed", failure: failureOf(outcome) };
  }
}
