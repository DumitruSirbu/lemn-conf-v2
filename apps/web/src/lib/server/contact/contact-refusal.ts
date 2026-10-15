import "server-only";

import type { NextResponse } from "next/server";

import {
  reportContactRefused,
  reportContactStoredRequestRefused,
} from "@/lib/server/contact/contact-log";
import {
  refusalAnswer,
  type ContactRefusal,
  type DesignRefusal,
} from "@/lib/server/contact/contact-responses";

/**
 * Writes the refusal's line and answers it, both made from its one code, so a line and an answer that disagree cannot
 * be written. The line is once for a process and a code.
 */
export function refuseWithLine(refusal: ContactRefusal): NextResponse {
  reportContactRefused(refusal.code);
  return refusalAnswer(refusal);
}

/**
 * The same for a stored request whose retry is refused for its design: its line names the stored request's reference
 * and is written each time, since the request is never notified unless the design returns.
 */
export function refuseStoredWithLine(
  refusal: DesignRefusal,
  reference: string,
): NextResponse {
  reportContactStoredRequestRefused(refusal.code, reference);
  return refusalAnswer(refusal);
}
