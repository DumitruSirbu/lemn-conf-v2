import { describe, expect, it, vi } from "vitest";

import { readSource } from "../server-source-support";

const constructed = vi.hoisted(() => ({ contactStores: 0 }));

vi.mock("@lemnaria/persistence", () => ({
  NeonContactSubmissionStore: vi.fn(function ContactSubmissionStore() {
    constructed.contactStores += 1;
  }),
}));

const { getContactSubmissionStore } = await import(
  "@/lib/server/contact/contact-submission-store-instance"
);

describe("getContactSubmissionStore", () => {
  it("makes no store when the module is imported, so a build opens no connection", () => {
    expect(constructed.contactStores).toBe(0);
  });

  it("makes the store on first use, and the same one for every use after", () => {
    const first = getContactSubmissionStore();
    const second = getContactSubmissionStore();

    expect(second).toBe(first);
    expect(constructed.contactStores).toBe(1);
  });
});

describe("contact-submission-store-instance.ts", () => {
  const source = readSource(
    "lib/server/contact/contact-submission-store-instance.ts",
  );

  it("reads source: begins with the server-only import and makes the store inside its getter alone", () => {
    expect(source.startsWith('import "server-only";\n')).toBe(true);
    expect(source.match(/new NeonContactSubmissionStore\(/g)).toHaveLength(1);
    expect(source).toMatch(/export function getContactSubmissionStore\(\)/);
    expect(source).toMatch(
      /contactSubmissionStore \?\?= new NeonContactSubmissionStore\(\)/,
    );
  });

  it("reads source: holds no secret and reads no variable", () => {
    expect(source).not.toMatch(/process\.env|DIGEST_SECRET/);
  });

  it("reads source: repository.ts, which route tests mock whole, does not hold it", () => {
    expect(readSource("lib/server/repository.ts")).not.toMatch(
      /ContactSubmissionStore/,
    );
  });
});
