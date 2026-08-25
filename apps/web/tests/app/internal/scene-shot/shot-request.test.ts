import { describe, expect, it } from "vitest";

import { parseSceneShotRequest } from "../../../../src/app/internal/scene-shot/shot-request";

describe("parseSceneShotRequest", () => {
  it("defaults to the reference rig's 960 x 640 white overview", () => {
    expect(parseSceneShotRequest({})).toEqual({
      width: 960,
      height: 640,
      position: [4.3, 2.9, 5.3],
      target: [1.5, 1.15, 0.9],
      finish: "white",
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
    expect(parseSceneShotRequest({ finish: "sage" }).finish).toBe("sage");
    expect(parseSceneShotRequest({ finish: "chartreuse" }).finish).toBe(
      "white",
    );
  });

  it("ignores a non-positive canvas size", () => {
    expect(parseSceneShotRequest({ w: "0", h: "-5" })).toMatchObject({
      width: 960,
      height: 640,
    });
  });
});
