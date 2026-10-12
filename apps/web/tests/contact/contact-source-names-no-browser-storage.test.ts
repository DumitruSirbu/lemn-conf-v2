// Reads source: the absence claim is criterion 6's, that nothing typed is persisted, and the properties of the hook
// are what guard the behaviour. This keeps the names of every place a typed value could be kept or leaked out of the
// code that handles it: the folder that holds the form (every file under it, subfolders included), the two contact
// pages and the hydrator the design's page mounts, which are where the folder's code is put on a route.
//
// The names are looked for in code and not in comments, which say what is not done. The list is the browser's stores
// (`localStorage`, `sessionStorage`, `indexedDB`, the cookie in both its APIs, the window's name, the cache and the
// beacon), the address and the history (a typed value in either is a typed value in the URL of a history entry), the
// router's navigations, and the console.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");
const CONTACT_SOURCE_DIRECTORY = join(SOURCE_ROOT, "contact");

/** The two contact pages and the hydrator that puts the form on the design's page, by path under `src`. */
const CONTACT_ROUTE_FILES = [
  "app/[locale]/d/[id]/contact/page.tsx",
  "app/[locale]/configurator/contact/page.tsx",
  "app/d/[id]/contact/hydrate-and-contact.tsx",
] as const;

/** The browser's history, reached by any global it hangs from or by the two calls that write an entry. The form's own
 *  `history` is the last send's id and has neither a `pushState` nor a `back`. */
const BROWSER_HISTORY =
  /\b(?:window|globalThis|self|top|parent)\s*\??\.\s*history\b|\b(?:push|replace)State\b|\bhistory\s*\??\.\s*(?:back|forward|go)\s*\(/;

const NAMES_THE_CODE_MUST_NOT_USE: readonly (readonly [string, RegExp])[] = [
  ["localStorage", /\blocalStorage\b/],
  ["sessionStorage", /\bsessionStorage\b/],
  ["indexedDB", /\bindexedDB\b/],
  ["document.cookie", /\bdocument\.cookie\b/],
  ["cookieStore", /\bcookieStore\b/],
  ["window.name", /\bwindow\.name\b/],
  ["the cache API", /\bcaches\./],
  ["a beacon", /\bsendBeacon\b/],
  ["a broadcast channel", /\bBroadcastChannel\b/],
  ["window.history", BROWSER_HISTORY],
  ["the address", /\b(?:window\.)?location\b/],
  ["a search string", /\bURLSearchParams\b|\buseSearchParams\b/],
  ["a built URL", /\bnew URL\b/],
  [
    "the router's push or replace",
    /\brouter\.(?:push|replace)\b|\buseRouter\b/,
  ],
  ["the console", /\bconsole\b/],
];

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFilesUnder(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

function filesOfTheContactCode(): string[] {
  return [
    ...sourceFilesUnder(CONTACT_SOURCE_DIRECTORY),
    ...CONTACT_ROUTE_FILES.map((file) => join(SOURCE_ROOT, file)),
  ];
}

function filesNaming(pattern: RegExp): string[] {
  return filesOfTheContactCode()
    .filter((file) => pattern.test(withoutComments(readFileSync(file, "utf8"))))
    .map((file) => relative(SOURCE_ROOT, file));
}

describe("the contact form's source", () => {
  it("has files to read, so the scan below is not an empty loop", () => {
    const names = filesOfTheContactCode().map((file) =>
      relative(SOURCE_ROOT, file),
    );

    expect(names).toEqual(
      expect.arrayContaining([
        "contact/send-contact-request.ts",
        "contact/use-contact-submission.ts",
        "contact/contact-form.tsx",
        ...CONTACT_ROUTE_FILES,
      ]),
    );
  });

  it("reads files in subfolders too, so a file moved down a folder is still scanned", () => {
    const underTheDesignFolder = sourceFilesUnder(
      join(SOURCE_ROOT, "app", "d"),
    );

    expect(
      underTheDesignFolder.map((file) => relative(SOURCE_ROOT, file)),
    ).toContain("app/d/[id]/contact/hydrate-and-contact.tsx");
  });

  it.each(NAMES_THE_CODE_MUST_NOT_USE)(
    "names %s in no file",
    (_name, pattern) => {
      expect(filesNaming(pattern)).toEqual([]);
    },
  );
});

describe("the scan itself", () => {
  it.each(NAMES_THE_CODE_MUST_NOT_USE)(
    "finds %s where it is used and not where a comment says it is not",
    (_name, pattern) => {
      const sample = {
        localStorage: "window.localStorage.setItem(k, v);",
        sessionStorage: "sessionStorage.setItem(k, v);",
        indexedDB: "indexedDB.open(name);",
        "document.cookie": "document.cookie = value;",
        cookieStore: "cookieStore.set(name, value);",
        "window.name": "window.name = value;",
        "the cache API": "caches.open(name);",
        "a beacon": "navigator.sendBeacon(url, body);",
        "a broadcast channel": "new BroadcastChannel(name);",
        "window.history": "window.history.replaceState(null, '', url);",
        "the address": "window.location.search = value;",
        "a search string": "new URLSearchParams(value);",
        "a built URL": "new URL(value, base);",
        "the router's push or replace": "router.push(path);",
        "the console": "console.log(value);",
      }[_name];

      expect(pattern.test(withoutComments(sample ?? ""))).toBe(true);
      expect(pattern.test(withoutComments(`// ${sample ?? ""}`))).toBe(false);
      expect(pattern.test(withoutComments(`/* ${sample ?? ""} */`))).toBe(
        false,
      );
    },
  );

  it("does not take the form's own send history for the browser's", () => {
    expect(
      BROWSER_HISTORY.test("memory.history = historyAfterSend(prepared);"),
    ).toBe(false);
    expect(BROWSER_HISTORY.test("history.kind === 'sent-before'")).toBe(false);
    expect(BROWSER_HISTORY.test("history.pushState(null, '', url)")).toBe(true);
    expect(
      BROWSER_HISTORY.test("globalThis.history?.replaceState(null, '', id)"),
    ).toBe(true);
    expect(BROWSER_HISTORY.test("self.history.back()")).toBe(true);
  });
});
