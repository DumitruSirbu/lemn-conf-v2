/**
 * The reduction of one browser report of a policy violation to the closed record the server may write down (ADR 0161
 * decision 3, plan 8Q.3). Pure: no clock, no store, no request, and nothing here throws.
 *
 * A report is written by a browser on a visitor's page, so its address is the visitor's: a share view's carries the
 * token (ADR 0114 Amendment B and G) and a design's page carries its id. The reduction therefore never copies a
 * field. Each value of the record is picked from a closed list, cut to an origin, or an integer within a bound, and
 * a field the list does not name is not read at all. `document-uri`, `referrer`, `script-sample` and `original-policy`
 * (which carries the nonce) reach the record only as the family a path belongs to, and never as text.
 */

/** The directives of this application's policy, and the `-elem` and `-attr` forms of the two that have them. */
export const CSP_DIRECTIVES = [
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "img-src",
  "font-src",
  "connect-src",
  "worker-src",
  "media-src",
  "manifest-src",
  "object-src",
  "base-uri",
  "form-action",
  "frame-ancestors",
  "frame-src",
] as const;

/** The page families a violation is attributed to. The list names a page in a log and decides nothing else. */
export const CSP_PAGE_FAMILIES = [
  "/[locale]",
  "/[locale]/configurator/room",
  "/[locale]/configurator/contact",
  "/[locale]/d/[id]",
  "/[locale]/d/[id]/review",
  "/[locale]/d/[id]/contact",
  "/[locale]/d/[id]/done",
  "/[locale]/s/[token]",
] as const;

/** Written here and not read from the routing module, whose chain this one must not load; a test holds them equal. */
export const CSP_REPORT_LOCALES = ["ro", "ru"] as const;

export const CSP_DISPOSITIONS = ["enforce", "report"] as const;

/** What a value outside its list is written as. */
export const OTHER = "other";
export const NO_LOCALE = "none";

/** Whether the report's `document-uri` is on this server's own origin, on another, or absent or not an http address. */
export const CSP_ORIGINS = ["own", "foreign", "none"] as const;

export type CspPage = (typeof CSP_PAGE_FAMILIES)[number] | typeof OTHER;
export type CspLocale = (typeof CSP_REPORT_LOCALES)[number] | typeof NO_LOCALE;
export type CspOrigin = (typeof CSP_ORIGINS)[number];

/** The record, and the only keys a log line made from a report may carry. `source`, `line`, `column` and `status` are
 *  absent, not empty, when the report did not give a usable one; `source` is also absent unless `origin` is `own`,
 *  and `page` is `other` unless it is, because a page of another origin is no page of this application. */
export interface ReducedCspReport {
  readonly directive: string;
  readonly blocked: string;
  readonly source?: string;
  readonly line?: number;
  readonly column?: number;
  readonly page: CspPage;
  readonly locale: CspLocale;
  readonly origin: CspOrigin;
  readonly disposition: string;
  readonly status?: number;
}

export type CspReportReduction =
  | { readonly kind: "report"; readonly record: ReducedCspReport }
  | { readonly kind: "not-a-report" };

const NOT_A_REPORT: CspReportReduction = Object.freeze({
  kind: "not-a-report",
});

/** The most an origin may be, in characters, for it to be kept: a longer one is no host of any real page. */
const LONGEST_ORIGIN_LENGTH = 255;

/** A position in a script: no real file has more lines than this. */
const LARGEST_POSITION = 10_000_000;

const LOWEST_HTTP_STATUS = 100;
const HIGHEST_HTTP_STATUS = 599;

const SELF = "self";
const BLOCKED_KEYWORDS: ReadonlySet<string> = new Set([
  "inline",
  "eval",
  "wasm-eval",
]);
const SCHEME_ONLY =
  /^(data|blob|chrome-extension|moz-extension|safari-web-extension)(?::|$)/i;

/** The build's own script chunks, which a report may name by path: segments of the characters a chunk's name is made
 *  of, and nothing a query or a fragment could add. A path that does not match is only ever `self`. */
const OWN_CHUNK_PATH = /^\/_next\/static(?:\/[A-Za-z0-9._~-]+)+\.js$/;
const LONGEST_CHUNK_PATH_LENGTH = 255;

const DIRECTIVE_NAMES: ReadonlySet<string> = new Set(CSP_DIRECTIVES);
const DESIGN_STEP_PAGES: Readonly<Record<string, CspPage>> = {
  review: "/[locale]/d/[id]/review",
  contact: "/[locale]/d/[id]/contact",
  done: "/[locale]/d/[id]/done",
};

type Report = Readonly<Record<string, unknown>>;

/**
 * A body's text to its reduced record, or `not-a-report` for a text that is not JSON holding an object `csp-report`.
 * `ownOrigin` is the origin this server was reached at (`new URL(request.url).origin`): a report whose `document-uri`
 * is on another origin, or none, is not attributed to a page of this application and names no source.
 */
export function reduceCspReport(
  bodyText: string,
  ownOrigin: string,
): CspReportReduction {
  const report = reportObjectOf(bodyText);
  if (report === undefined) return NOT_A_REPORT;
  const document = httpUrlOf(stringField(report, "document-uri"));
  const origin = originOf(document, ownOrigin);
  const documentOrigin = document?.origin;
  const segments = document?.pathname.split("/").slice(1) ?? [];
  const isOwn = origin === "own";
  return {
    kind: "report",
    record: {
      directive: directiveOf(report),
      blocked: blockedOf(stringField(report, "blocked-uri"), documentOrigin),
      ...optional(
        "source",
        isOwn
          ? sourceOf(stringField(report, "source-file"), documentOrigin)
          : undefined,
      ),
      ...optional(
        "line",
        integerWithin(report["line-number"], 0, LARGEST_POSITION),
      ),
      ...optional(
        "column",
        integerWithin(report["column-number"], 0, LARGEST_POSITION),
      ),
      page: isOwn ? pageOf(segments) : OTHER,
      locale: localeOf(segments),
      origin,
      disposition: oneOf(stringField(report, "disposition"), CSP_DISPOSITIONS),
      ...optional(
        "status",
        integerWithin(
          report["status-code"],
          LOWEST_HTTP_STATUS,
          HIGHEST_HTTP_STATUS,
        ),
      ),
    },
  };
}

function originOf(document: URL | undefined, ownOrigin: string): CspOrigin {
  if (document === undefined) return "none";
  return document.origin === ownOrigin ? "own" : "foreign";
}

function reportObjectOf(bodyText: string): Report | undefined {
  const parsed = parsedOrUndefined(bodyText);
  if (!isPlainObject(parsed) || !Object.hasOwn(parsed, "csp-report")) {
    return undefined;
  }
  const report = parsed["csp-report"];
  return isPlainObject(report) ? report : undefined;
}

function parsedOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): value is Report {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(report: Report, key: string): string | undefined {
  if (!Object.hasOwn(report, key)) return undefined;
  const value = report[key];
  return typeof value === "string" ? value : undefined;
}

function optional<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  return value === undefined ? {} : ({ [key]: value } as Record<Key, Value>);
}

function integerWithin(
  value: unknown,
  lowest: number,
  highest: number,
): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= lowest &&
    value <= highest
    ? value
    : undefined;
}

function oneOf(value: string | undefined, list: readonly string[]): string {
  return value !== undefined && list.includes(value) ? value : OTHER;
}

/** `effective-directive`, else the first word of `violated-directive` (older browsers write the whole directive there). */
function directiveOf(report: Report): string {
  const effective = stringField(report, "effective-directive");
  const violated = stringField(report, "violated-directive");
  const named =
    effective !== undefined && effective !== ""
      ? effective
      : violated?.trim().split(/\s+/)[0];
  const lowered = named?.toLowerCase();
  return lowered !== undefined && DIRECTIVE_NAMES.has(lowered)
    ? lowered
    : OTHER;
}

function httpUrlOf(text: string | undefined): URL | undefined {
  if (text === undefined) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

/** What was blocked: a keyword, `self`, the scheme of an inline kind of source, or the origin and nothing after it. */
function blockedOf(
  text: string | undefined,
  ownOrigin: string | undefined,
): string {
  return kindOfAddress(text, ownOrigin)?.kind ?? OTHER;
}

/** Where the script came from, as `blocked`, except that the build's own chunk is named by its path. */
function sourceOf(
  text: string | undefined,
  ownOrigin: string | undefined,
): string | undefined {
  const address = kindOfAddress(text, ownOrigin);
  if (address === undefined) return undefined;
  const chunkPath =
    address.url === undefined ? undefined : ownChunkPath(address.url);
  return address.kind === SELF && chunkPath !== undefined
    ? chunkPath
    : address.kind;
}

interface AddressKind {
  readonly kind: string;
  /** Set only for a same-origin address, the one a source may be named by path from. */
  readonly url?: URL;
}

function kindOfAddress(
  text: string | undefined,
  ownOrigin: string | undefined,
): AddressKind | undefined {
  if (text === undefined) return undefined;
  if (BLOCKED_KEYWORDS.has(text)) return { kind: text };
  const scheme = SCHEME_ONLY.exec(text);
  if (scheme?.[1] !== undefined) return { kind: scheme[1].toLowerCase() };
  const url = httpUrlOf(text);
  if (url === undefined || url.origin.length > LONGEST_ORIGIN_LENGTH) {
    return { kind: OTHER };
  }
  return url.origin === ownOrigin ? { kind: SELF, url } : { kind: url.origin };
}

function ownChunkPath(url: URL): string | undefined {
  const { pathname } = url;
  const isOwnChunk =
    pathname.length <= LONGEST_CHUNK_PATH_LENGTH &&
    OWN_CHUNK_PATH.test(pathname);
  return isOwnChunk ? pathname : undefined;
}

function localeOf(segments: readonly string[]): CspLocale {
  const [first] = segments;
  return CSP_REPORT_LOCALES.find((locale) => locale === first) ?? NO_LOCALE;
}

/** The family of a path's segments, the first of which is its locale. A segment that stands for an id or a token is
 *  any non-empty one, and what it holds is never read. */
function pageOf(segments: readonly string[]): CspPage {
  if (localeOf(segments) === NO_LOCALE) return OTHER;
  const [, family, second, third, ...rest] = segments;
  if (segments.length === 1) return "/[locale]";
  if (rest.length > 0) return OTHER;
  if (family === "configurator" && third === undefined) {
    return configuratorPageOf(second);
  }
  if (family === "d" && isSegment(second)) return designPageOf(third);
  if (family === "s" && isSegment(second) && third === undefined) {
    return "/[locale]/s/[token]";
  }
  return OTHER;
}

function isSegment(segment: string | undefined): boolean {
  return segment !== undefined && segment !== "";
}

function configuratorPageOf(step: string | undefined): CspPage {
  if (step === "room") return "/[locale]/configurator/room";
  if (step === "contact") return "/[locale]/configurator/contact";
  return OTHER;
}

function designPageOf(step: string | undefined): CspPage {
  if (step === undefined) return "/[locale]/d/[id]";
  return Object.hasOwn(DESIGN_STEP_PAGES, step)
    ? (DESIGN_STEP_PAGES[step] ?? OTHER)
    : OTHER;
}
