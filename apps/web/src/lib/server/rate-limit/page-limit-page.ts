// The page a refused read is answered with, apart from the judgement that refuses it, the server-only chain that makes
// it and the message files that hold its sentence, so the e2e harness can put the module's own refusal in front of a
// browser. The request interceptor still reaches it only through its one dynamic import.

import { hasLocale } from "next-intl";

import { routing, type AppLocale } from "@/i18n/routing";

/** The characters a sentence could not carry into markup as they are. */
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** The language of the path's own prefix. A path with no recognised prefix is the default locale's: with the prefix
 *  always required, the interceptor redirects such a path and never passes it on, so none is counted. */
export function localeOfPath(pathname: string): AppLocale {
  const [first] = pathname.split("/").filter(Boolean);
  return hasLocale(routing.locales, first) ? first : routing.defaultLocale;
}

/** One sentence in the locale's language, with no script and no style, so nothing it loads can fail or be blocked. */
export function refusedPageHtml({
  locale,
  sentence,
}: {
  locale: AppLocale;
  sentence: string;
}): string {
  const text = escaped(sentence);
  return (
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${text}</title></head><body><p>${text}</p></body></html>`
  );
}

/** What a refused read's answer must not be kept by, and the wait it tells. */
export function refusedPageHeaders(
  retryAfterSeconds: number,
): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
    "Retry-After": String(retryAfterSeconds),
  };
}

function escaped(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) => HTML_ESCAPES[character] ?? character,
  );
}
