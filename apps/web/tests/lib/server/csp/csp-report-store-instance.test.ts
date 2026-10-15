import { describe, expect, it, vi } from "vitest";

import { readSource } from "../server-source-support";

// The setup puts a fake in place of this module for every other file; this file is about the module itself.
vi.unmock("@/lib/server/csp/csp-report-store-instance");

const constructed = vi.hoisted(() => ({ cspReportStores: 0 }));

vi.mock("@lemnaria/persistence", () => ({
  NeonCspReportStore: vi.fn(function CspReportStore() {
    constructed.cspReportStores += 1;
  }),
}));

const { getCspReportStore } = await import(
  "@/lib/server/csp/csp-report-store-instance"
);

describe("getCspReportStore", () => {
  it("makes no store when the module is imported, so a build opens no connection", () => {
    expect(constructed.cspReportStores).toBe(0);
  });

  it("makes the store on first use, and the same one for every use after", () => {
    const first = getCspReportStore();
    const second = getCspReportStore();

    expect(second).toBe(first);
    expect(constructed.cspReportStores).toBe(1);
  });
});

describe("csp-report-store-instance.ts", () => {
  const source = readSource("lib/server/csp/csp-report-store-instance.ts");

  it("reads source: begins with the server-only import and makes the store inside its getter alone", () => {
    expect(source.startsWith('import "server-only";\n')).toBe(true);
    expect(source.match(/new NeonCspReportStore\(/g)).toHaveLength(1);
    expect(source).toMatch(
      /export function getCspReportStore\(\)[\s\S]*cspReportStore \?\?= new NeonCspReportStore\(\)/,
    );
  });

  it("reads source: repository.ts, which route tests mock whole, does not hold it", () => {
    expect(readSource("lib/server/repository.ts")).not.toMatch(
      /CspReportStore/,
    );
  });
});
