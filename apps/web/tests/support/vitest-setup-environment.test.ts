import { describe, expect, it } from "vitest";

import { PUBLIC_ORIGIN_VARIABLE } from "@/lib/server/public-origin-variable";

import config from "../../vitest.config";

// The default config sets the variable as a shell would, before the setup file runs; this file sees what the setup left.
describe("the environment every test file starts in", () => {
  it("holds no public origin, though the run was started with one", () => {
    expect(config.test?.env?.[PUBLIC_ORIGIN_VARIABLE]).toMatch(/\S/);

    expect(Object.hasOwn(process.env, PUBLIC_ORIGIN_VARIABLE)).toBe(false);
  });
});
