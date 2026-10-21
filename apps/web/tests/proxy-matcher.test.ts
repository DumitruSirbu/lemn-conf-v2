import { readdirSync } from "node:fs";
import { join } from "node:path";

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { config } from "../src/proxy";
import { readSource } from "./lib/server/server-source-support";

/** The framework's own matcher, asked whether the interceptor would run for an address. */
function reaches(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url });
}

/** The extensions the first matcher entry hands to the static-file rule, one written out for each. */
const STATIC_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "glb",
  "gltf",
  "hdr",
  "bin",
  "woff",
  "woff2",
];

const LOCALES = ["ro", "ru"];

describe("the interceptor's matcher: a design's and a share's address reach it whatever it ends in", () => {
  it.each(
    LOCALES.flatMap((locale) =>
      STATIC_EXTENSIONS.flatMap((extension) => [
        [`/${locale}/d/abc123.${extension}`],
        [`/${locale}/s/abcdefghijkl.${extension}`],
      ]),
    ),
  )("hands %s to the interceptor, so its lookup is counted", (url) => {
    expect(reaches(url)).toBe(true);
  });

  it("hands over a design's page and its three steps, and a share's view, written plainly", () => {
    for (const url of [
      "/ro/d/abc123",
      "/ro/d/abc123/review",
      "/ru/d/abc123/contact",
      "/ro/d/abc123/done",
      "/ru/s/abcdefghijkl",
    ]) {
      expect(reaches(url), url).toBe(true);
    }
  });

  it("hands over a step of a design whose id ends in an extension", () => {
    expect(reaches("/ro/d/abc123.png/review")).toBe(true);
    expect(reaches("/ro/d/abc123.png/done")).toBe(true);
  });
});

describe("the interceptor's matcher: a static file still does not reach it", () => {
  it.each([
    "/_next/static/chunks/main.js",
    "/_next/static/media/font.woff2",
    "/_next/image",
    "/favicon.ico",
    "/textures/oak.png",
    "/models/kitchen.glb",
    "/ro/textures/oak.png",
    "/ro/models/kitchen.glb",
    "/ro/x/abc123.png",
    "/ro/designs/abc123.png",
    "/d/abc123.png",
    "/s/abcdefghijkl.png",
    "/ro/d/abc123/extra/more.png",
  ])("keeps %s from the interceptor", (url) => {
    expect(reaches(url)).toBe(false);
  });

  it("still hands over every page and API route the first entry always did", () => {
    for (const url of [
      "/",
      "/ro",
      "/configurator/configure",
      "/ro/configurator/room",
      "/api/designs",
      "/api/designs/abc123",
      "/internal/scene-shot",
    ]) {
      expect(reaches(url), url).toBe(true);
    }
  });
});

describe("the interceptor's matcher: the entries are written as the framework reads them", () => {
  it("is a list of string literals, the first entry unchanged, and an entry for each family whose address may end in an extension", () => {
    expect(config.matcher).toHaveLength(4);
    expect(config.matcher.every((entry) => typeof entry === "string")).toBe(
      true,
    );
    expect(config.matcher.slice(1)).toEqual([
      "/:locale/d/:id",
      "/:locale/s/:token",
      "/:locale/staff/kitchens/:id",
    ]);
  });
});

describe("the interceptor's matcher: what lies deeper than a family's one segment runs no lookup", () => {
  const APP_ROOT = join(import.meta.dirname, "../src/app");
  const FILES_THAT_RUN_FOR_A_ROUTE =
    /^(?:page|layout|template|route|default|loading|error|not-found)\.tsx?$/;

  /** The files of the app tree that run for a request, under one family, by path relative to it. */
  function routedFilesUnder(family: string): string[] {
    return readdirSync(join(APP_ROOT, "[locale]", family), { recursive: true })
      .map(String)
      .filter((path) =>
        FILES_THAT_RUN_FOR_A_ROUTE.test(path.split("/").pop() ?? ""),
      )
      .sort();
  }

  it("names, under a design's family, the page and the review's, contact and confirmation pages and nothing that could run for more", () => {
    expect(routedFilesUnder("d")).toEqual([
      "[id]/contact/page.tsx",
      "[id]/done/page.tsx",
      "[id]/page.tsx",
      "[id]/review/page.tsx",
    ]);
  });

  it("names, under a share's family, the view's page and nothing else", () => {
    expect(routedFilesUnder("s")).toEqual(["[token]/page.tsx"]);
  });

  it("has no layout or template of the family, and the locale's layout looks nothing up", () => {
    expect(
      routedFilesUnder("d").some((path) => /layout|template/.test(path)),
    ).toBe(false);
    expect(
      routedFilesUnder("s").some((path) => /layout|template/.test(path)),
    ).toBe(false);
    expect(readSource("app/[locale]/layout.tsx")).not.toMatch(
      /repository|load-owned-design|visitor|write-token|share-token/,
    );
  });

  it.each([
    "/ro/d/abc123/review.png",
    "/ro/d/abc123/done.png",
    "/ro/d/abc123/x.png",
    "/ro/s/abcdefghijkl/x.png",
  ])(
    "leaves %s to the framework, which routes it to no page: it is a 404 and no lookup runs",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    },
  );
});
