import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { config } from "../src/proxy";

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
  it("is a list of string literals, the first entry unchanged, and two entries for the two families", () => {
    expect(config.matcher).toHaveLength(3);
    expect(config.matcher.every((entry) => typeof entry === "string")).toBe(
      true,
    );
    expect(config.matcher.slice(1)).toEqual([
      "/:locale/d/:id",
      "/:locale/s/:token",
    ]);
  });
});
