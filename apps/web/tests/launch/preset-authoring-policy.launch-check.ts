import { describe, expect, it } from "vitest";

import {
  mayAuthorPresets,
  ungatedUntilLaunch,
  WIRED_PRESET_AUTHORING_POLICY,
} from "../../src/lib/server/preset/preset-authoring-policy";

// Red until the ungated policy is replaced. Run only by `pnpm gate:launch-placeholders`.
describe("launch gate: who may save a preset", () => {
  it("the wired preset-authoring policy is not ungatedUntilLaunch", () => {
    expect(
      WIRED_PRESET_AUTHORING_POLICY,
      "WIRED_PRESET_AUTHORING_POLICY in apps/web/src/lib/server/preset/preset-authoring-policy.ts is " +
        "ungatedUntilLaunch: anyone who can reach this environment can publish a preset onto every Step 1 screen. " +
        "Wire the administrator capability preset.create (ADR 0112 Amendment A) before the first public deploy.",
    ).not.toBe(ungatedUntilLaunch);
  });

  it("a request with no cookies and no headers may not author a preset", async () => {
    const bareRequest = {
      cookies: { get: () => undefined },
      headers: { get: () => null },
    };

    // A wrapper around ungatedUntilLaunch is a different function and passes the identity check above; it still
    // answers yes to a request that carries nothing, which is the ungated policy's whole behaviour.
    expect(
      await mayAuthorPresets(bareRequest),
      "the wired preset-authoring policy lets a request with no credential author a preset.",
    ).toBe(false);
  });
});
