import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { readCspReportWriterMark } from "@/lib/server/csp/csp-report-writer-mark";

import { readSource } from "../server-source-support";

const SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const OTHER_SECRET = "ff".repeat(32);

/** Made from the encoding the digest module documents and not by it: the purpose and the one field, each as its byte
 *  count, a colon, the text and a comma, under HMAC-SHA-256 with the secret's bytes. */
function expectedMark(secret: string): string {
  const encoding = ["csp-report-writer", "csp_reports"]
    .map((part) => `${String(Buffer.byteLength(part))}:${part},`)
    .join("");
  return createHmac("sha256", Buffer.from(secret, "hex"))
    .update(encoding, "utf8")
    .digest("hex");
}

describe("readCspReportWriterMark", () => {
  it("is the keyed digest of the writer purpose over the one constant field, under the secret", () => {
    expect(readCspReportWriterMark({ DIGEST_SECRET: SECRET })).toEqual({
      status: "usable",
      mark: expectedMark(SECRET),
    });
  });

  it("is sixty-four lower-case hexadecimal characters, the shape the table checks", () => {
    const outcome = readCspReportWriterMark({ DIGEST_SECRET: SECRET });

    expect(outcome.status === "usable" && outcome.mark).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("is one mark for one secret and another for another, and the same on every read", () => {
    const first = readCspReportWriterMark({ DIGEST_SECRET: SECRET });

    expect(readCspReportWriterMark({ DIGEST_SECRET: SECRET })).toEqual(first);
    expect(
      readCspReportWriterMark({ DIGEST_SECRET: OTHER_SECRET }),
    ).not.toEqual(first);
  });

  it.each([
    ["no variable", {}],
    ["an empty one", { DIGEST_SECRET: "" }],
    ["one too short", { DIGEST_SECRET: "00ff" }],
    ["one that is not hexadecimal", { DIGEST_SECRET: "zz".repeat(32) }],
    ["one in upper case", { DIGEST_SECRET: SECRET.toUpperCase() }],
  ])(
    "is unavailable for %s, and says nothing of why",
    (_label, environment) => {
      expect(readCspReportWriterMark(environment)).toEqual({
        status: "unavailable",
      });
    },
  );

  it("reads source: begins with the server-only import and holds no module-level key or mark", () => {
    const source = readSource("lib/server/csp/csp-report-writer-mark.ts");

    expect(source.startsWith('import "server-only";\n')).toBe(true);
    expect(source).not.toMatch(/process\.env/);
  });
});
