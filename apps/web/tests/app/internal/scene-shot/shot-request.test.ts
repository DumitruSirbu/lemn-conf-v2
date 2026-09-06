import { LEGACY_ENUM_FINISHES } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { parseSceneShotRequest } from "../../../../src/app/internal/scene-shot/shot-request";

/** The capture envelope `shot-request.ts` pins, restated here as the asserted contract. */
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

describe("parseSceneShotRequest", () => {
  it("defaults to the reference rig's 960 x 640 white overview", () => {
    expect(parseSceneShotRequest({})).toEqual({
      width: 960,
      height: 640,
      position: [4.3, 2.9, 5.3],
      target: [1.5, 1.15, 0.9],
      // The reference's own preset names are still the route's vocabulary; what they resolve to is
      // the declared finish wave 6P mapped each onto (`white` → PAL *Alb*).
      finish: LEGACY_ENUM_FINISHES.white,
    });
  });

  it("reads an exact camera position and target off the query string", () => {
    const request = parseSceneShotRequest({
      pos: "5.5,3.2,4.4",
      target: "1.6,1.15,0.9",
    });
    expect(request.position).toEqual([5.5, 3.2, 4.4]);
    expect(request.target).toEqual([1.6, 1.15, 0.9]);
  });

  it("falls back rather than framing a shot from a malformed vector", () => {
    expect(parseSceneShotRequest({ pos: "5.5,3.2" }).position).toEqual([
      4.3, 2.9, 5.3,
    ]);
    expect(parseSceneShotRequest({ target: "a,b,c" }).target).toEqual([
      1.5, 1.15, 0.9,
    ]);
  });

  it("accepts every catalogued finish and rejects anything else", () => {
    expect(parseSceneShotRequest({ finish: "sage" }).finish).toEqual(
      LEGACY_ENUM_FINISHES.sage,
    );
    expect(parseSceneShotRequest({ finish: "chartreuse" }).finish).toEqual(
      LEGACY_ENUM_FINISHES.white,
    );
  });

  it("resolves all five of the reference's preset names and no sixth", () => {
    // The M1 fidelity capture drives this route by those five names
    // (`scripts/fidelity-shots.mjs`), and wave 6R did not change the reference — only what each
    // name resolves to. An unrecognised name is the reference's own default: a capture harness has
    // nowhere to show a refusal.
    for (const name of ["white", "clay", "sage", "graphite", "oak"] as const) {
      expect(parseSceneShotRequest({ finish: name }).finish).toEqual(
        LEGACY_ENUM_FINISHES[name],
      );
    }
  });

  it("ignores a non-positive canvas size", () => {
    expect(parseSceneShotRequest({ w: "0", h: "-5" })).toMatchObject({
      width: 960,
      height: 640,
    });
  });

  it("clamps a canvas larger than the capture envelope instead of asking for it", () => {
    expect(parseSceneShotRequest({ w: "32768", h: "32768" })).toMatchObject({
      width: MAX_WIDTH,
      height: MAX_HEIGHT,
    });
  });

  it("clamps width and height against their own maximum, not a shared one", () => {
    expect(parseSceneShotRequest({ w: "1500", h: "1500" })).toMatchObject({
      width: 1500,
      height: MAX_HEIGHT,
    });
  });

  it("admits the largest in-envelope canvas and clamps the first pixel beyond it", () => {
    expect(parseSceneShotRequest({ w: "1919", h: "1079" })).toMatchObject({
      width: 1919,
      height: 1079,
    });
    expect(parseSceneShotRequest({ w: "1920", h: "1080" })).toMatchObject({
      width: MAX_WIDTH,
      height: MAX_HEIGHT,
    });
    expect(parseSceneShotRequest({ w: "1921", h: "1081" })).toMatchObject({
      width: MAX_WIDTH,
      height: MAX_HEIGHT,
    });
  });

  it("admits the smallest canvas and falls back below it", () => {
    expect(parseSceneShotRequest({ w: "1", h: "1" })).toMatchObject({
      width: 1,
      height: 1,
    });
    expect(parseSceneShotRequest({ w: "0.4", h: "0.4" })).toMatchObject({
      width: 960,
      height: 640,
    });
  });

  it("never emits a canvas outside the envelope for any hostile size expression", () => {
    const hostileSizes = [
      "Infinity",
      "-Infinity",
      "NaN",
      "1e30",
      "-1e30",
      "9e999",
      "1e3",
      String(Number.MAX_SAFE_INTEGER),
      String(Number.MAX_VALUE),
      "0",
      "-1",
      "-9007199254740991",
      "0x7fffffff",
      "1_000",
      "9999999999999999999999",
      "",
      "   ",
      "abc",
      "960px",
      "960,640",
      "null",
      "undefined",
      "true",
    ];

    for (const size of hostileSizes) {
      const request = parseSceneShotRequest({ w: size, h: size });
      const escaped = `size ${JSON.stringify(size)} escaped the capture envelope`;
      expect(request.width, escaped).toBeGreaterThanOrEqual(1);
      expect(request.width, escaped).toBeLessThanOrEqual(MAX_WIDTH);
      expect(request.height, escaped).toBeGreaterThanOrEqual(1);
      expect(request.height, escaped).toBeLessThanOrEqual(MAX_HEIGHT);
      expect(Number.isInteger(request.width), escaped).toBe(true);
      expect(Number.isInteger(request.height), escaped).toBe(true);
    }
    expect(hostileSizes.length).toBeGreaterThan(20);
  });

  it("clamps a repeated query parameter by its first value", () => {
    expect(parseSceneShotRequest({ w: ["1e12", "800"] }).width).toBe(MAX_WIDTH);
  });

  it("falls back when the size parameter is missing entirely", () => {
    expect(parseSceneShotRequest({ h: "700" })).toMatchObject({
      width: 960,
      height: 700,
    });
  });
});
