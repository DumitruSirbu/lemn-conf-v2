import { describe, expect, it, vi } from "vitest";

import { readSource } from "../server-source-support";

// The setup puts a fake in place of this module for every other file; this file is about the module itself.
vi.unmock("@/lib/server/rate-limit/rate-limit-store-instance");

const constructed = vi.hoisted(() => ({ rateLimitStores: 0 }));

vi.mock("@lemnaria/persistence", () => ({
  NeonRateLimitStore: vi.fn(function RateLimitStore() {
    constructed.rateLimitStores += 1;
  }),
}));

const { getRateLimitStore } = await import(
  "@/lib/server/rate-limit/rate-limit-store-instance"
);

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

describe("rate-limit-store-instance.ts", () => {
  const source = readSource(
    "lib/server/rate-limit/rate-limit-store-instance.ts",
  );

  it("reads source: begins with the server-only import and makes the store inside its getter alone", () => {
    expect(source.startsWith('import "server-only";\n')).toBe(true);
    expect(source.match(/new NeonRateLimitStore\(/g)).toHaveLength(1);
    expect(source).toMatch(
      /export function getRateLimitStore\(\)[\s\S]*rateLimitStore \?\?= new NeonRateLimitStore\(\)/,
    );
  });

  it("reads source: repository.ts, which sixteen route tests mock whole, does not hold it", () => {
    expect(readSource("lib/server/repository.ts")).not.toMatch(
      /RateLimitStore/,
    );
  });
});
