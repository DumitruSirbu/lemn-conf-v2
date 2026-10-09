import { describe, expect, it, vi } from "vitest";

import { readSource } from "./server-source-support";

const constructed = vi.hoisted(() => ({ rateLimitStores: 0 }));

vi.mock("@lemnaria/persistence", () => ({
  NeonConfigurationRepository: vi.fn(),
  NeonShareLinkRepository: vi.fn(),
  NeonRateLimitStore: vi.fn(function RateLimitStore() {
    constructed.rateLimitStores += 1;
  }),
}));

const { getRateLimitStore } = await import("@/lib/server/repository");

describe("getRateLimitStore", () => {
  it("makes no store when the module is imported, so a build opens no connection", () => {
    expect(constructed.rateLimitStores).toBe(0);
  });

  it("makes the store on first use, and the same one for every use after", () => {
    const first = getRateLimitStore();
    const second = getRateLimitStore();

    expect(second).toBe(first);
    expect(constructed.rateLimitStores).toBe(1);
  });
});

describe("repository.ts", () => {
  it("reads source: makes the rate-limit store inside its getter and nowhere at module level", () => {
    const source = readSource("lib/server/repository.ts");

    expect(source.match(/new NeonRateLimitStore\(/g)).toHaveLength(1);
    expect(source).toMatch(
      /export function getRateLimitStore\(\)[\s\S]*rateLimitStore \?\?= new NeonRateLimitStore\(\)/,
    );
  });
});
