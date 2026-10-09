import "server-only";

import { hasLocale } from "next-intl";
import type { NextResponse } from "next/server";

import { routing, type AppLocale } from "@/i18n/routing";
import { judgeReadRequest } from "@/lib/server/rate-limit/judge-read-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { readLimitReachedPageResponse } from "@/lib/server/rate-limit/rate-limited-response";
import roMessages from "@/messages/ro.json";
import ruMessages from "@/messages/ru.json";

const SENTENCE_OF_LOCALE: Readonly<Record<AppLocale, string>> = {
  ro: roMessages.designLoadError.tooManyRequests,
  ru: ruMessages.designLoadError.tooManyRequests,
};

/** The characters a sentence could not carry into markup as they are. */
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
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
  return readLimitReachedPageResponse(
    judgement.retryAfterSeconds,
    refusedPageHtml(localeOfPath(pathname)),
  );
}

/** The language of the path's own prefix. A path with no recognised prefix is the default locale's: with the prefix
 *  always required, the interceptor redirects such a path and never passes it on, so none is counted. */
function localeOfPath(pathname: string): AppLocale {
  const [first] = pathname.split("/").filter(Boolean);
  return hasLocale(routing.locales, first) ? first : routing.defaultLocale;
}

/** One sentence in the path's language, with no script and no style, so nothing it loads can fail or be blocked. */
function refusedPageHtml(locale: AppLocale): string {
  const sentence = escaped(SENTENCE_OF_LOCALE[locale]);
  return (
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${sentence}</title></head><body><p>${sentence}</p></body></html>`
  );
}

function escaped(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) => HTML_ESCAPES[character] ?? character,
  );
}
