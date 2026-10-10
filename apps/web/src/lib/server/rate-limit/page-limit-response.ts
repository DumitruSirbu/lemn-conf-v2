import "server-only";

import type { NextResponse } from "next/server";

import type { AppLocale } from "@/i18n/routing";
import { judgeReadRequest } from "@/lib/server/rate-limit/judge-read-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import {
  localeOfPath,
  refusedPageHtml,
} from "@/lib/server/rate-limit/page-limit-page";
import { readLimitReachedPageResponse } from "@/lib/server/rate-limit/rate-limited-response";
import roMessages from "@/messages/ro.json";
import ruMessages from "@/messages/ru.json";

const WORDS_OF_LOCALE: Readonly<
  Record<AppLocale, { sentence: string; retryLabel: string }>
> = {
  ro: {
    sentence: roMessages.designLoadError.tooManyRequests,
    retryLabel: roMessages.share.retry,
  },
  ru: {
    sentence: ruMessages.designLoadError.tooManyRequests,
    retryLabel: ruMessages.share.retry,
  },
};

/**
 * The `429` that stops a page read, or nothing when it is served. This module is the one place the limiter's chain and
 * the message files meet, so the request interceptor reaches both by one dynamic import and holds neither itself. The
 * judgement is the read's: unjudged or late is served, with its one line, and a refusal is asked before any lookup.
 */
export async function refusalOfPageRead(
  headers: HeaderReader,
  pathname: string,
): Promise<NextResponse | undefined> {
  const judgement = await judgeReadRequest(headers);
  if (judgement.kind === "serve") return undefined;
  const locale = localeOfPath(pathname);
  return readLimitReachedPageResponse(
    judgement.retryAfterSeconds,
    refusedPageHtml({ locale, ...WORDS_OF_LOCALE[locale] }),
  );
}
