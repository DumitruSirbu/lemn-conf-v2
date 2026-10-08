import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SCENE_SHOT_ROUTE_FLAG,
  SCENE_SHOT_ROUTE_FLAG_ENABLED,
} from "../../../../src/app/internal/scene-shot/route-availability";

const NOT_FOUND = new Error("notFound() was called");

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));
// The page's own gate is under test, not the three.js scene it would mount.
vi.mock("../../../../src/app/internal/scene-shot/scene-shot", () => ({
  SceneShot: () => null,
}));

import SceneShotPage from "../../../../src/app/internal/scene-shot/page";
import { SceneShot } from "../../../../src/app/internal/scene-shot/scene-shot";

const NO_SEARCH_PARAMS = Promise.resolve({});

describe("the /internal/scene-shot page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers not-found on a production server that has not opted in", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(SCENE_SHOT_ROUTE_FLAG, "");

    await expect(
      SceneShotPage({ searchParams: NO_SEARCH_PARAMS }),
    ).rejects.toBe(NOT_FOUND);
  });

  it("renders on a production server that set the flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(SCENE_SHOT_ROUTE_FLAG, SCENE_SHOT_ROUTE_FLAG_ENABLED);

    // The shot the query asks for is the shot that is mounted: which component, and with which canvas, camera and
    // view. That an element came back says none of it.
    const page = await SceneShotPage({
      searchParams: Promise.resolve({
        w: "800",
        h: "600",
        pos: "5.5,3.2,4.4",
        target: "1.6,1.15,0.9",
        view: "wallA",
      }),
    });

    expect(page.type).toBe(SceneShot);
    expect(page.props).toMatchObject({
      width: 800,
      height: 600,
      position: [5.5, 3.2, 4.4],
      target: [1.6, 1.15, 0.9],
      view: "wallA",
    });
  });
});
