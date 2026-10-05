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

    await expect(
      SceneShotPage({ searchParams: NO_SEARCH_PARAMS }),
    ).resolves.toBeDefined();
  });
});
