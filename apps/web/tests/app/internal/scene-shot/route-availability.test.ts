import { describe, expect, it } from "vitest";

import {
  isSceneShotRouteEnabled,
  SCENE_SHOT_ROUTE_FLAG,
  SCENE_SHOT_ROUTE_FLAG_ENABLED,
} from "../../../../src/app/internal/scene-shot/route-availability";

describe("isSceneShotRouteEnabled", () => {
  it("withholds the capture route from production unless it is opted in", () => {
    expect(isSceneShotRouteEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  it("serves the capture route in production once the flag is set", () => {
    expect(
      isSceneShotRouteEnabled({
        NODE_ENV: "production",
        [SCENE_SHOT_ROUTE_FLAG]: SCENE_SHOT_ROUTE_FLAG_ENABLED,
      }),
    ).toBe(true);
  });

  it("treats every value but the opt-in as off, so a stray string cannot expose it", () => {
    const notOptedIn = ["", " ", "0", "false", "off", "true", "yes", "2", "01"];
    for (const value of notOptedIn) {
      expect(
        isSceneShotRouteEnabled({
          NODE_ENV: "production",
          [SCENE_SHOT_ROUTE_FLAG]: value,
        }),
        `${JSON.stringify(value)} was read as an opt-in`,
      ).toBe(false);
    }
    expect(notOptedIn).toHaveLength(9);
  });

  it("keeps the route available in development and test, where the flag is not required", () => {
    expect(isSceneShotRouteEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isSceneShotRouteEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(isSceneShotRouteEnabled({})).toBe(true);
  });
});
