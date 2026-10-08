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
vi.mock("../../../../src/app/internal/mirror-shot/mirror-shot", () => ({
  MirrorShot: () => null,
}));

import { MirrorShot } from "../../../../src/app/internal/mirror-shot/mirror-shot";
import MirrorShotPage from "../../../../src/app/internal/mirror-shot/page";

describe("the /internal/mirror-shot page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers not-found on a production server that has not opted in", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(SCENE_SHOT_ROUTE_FLAG, "");

    expect(() => MirrorShotPage()).toThrow(NOT_FOUND);
  });

  it("renders on a production server that set the flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(SCENE_SHOT_ROUTE_FLAG, SCENE_SHOT_ROUTE_FLAG_ENABLED);

    // Which element, and not only that there is one: an empty `<div />` is defined too.
    expect(MirrorShotPage().type).toBe(MirrorShot);
  });
});
