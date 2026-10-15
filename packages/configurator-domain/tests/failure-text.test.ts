import { describe, expect, it } from "vitest";

import {
  boundedFailureReason,
  describeSchemaIssues,
} from "../src/failure-text.js";

/** Review finding F3: this rule lived in two packages with the caps declared twice. It lives here
 *  now, and so do its tests — the package that owns the code owns the suite that protects it. */
describe("describeSchemaIssues", () => {
  it("reports where the failures are and what kind they are, never the values", () => {
    const summary = describeSchemaIssues([
      { path: ["room", "widthMm"], code: "invalid_type" },
    ]);

    expect(summary).toContain("room.widthMm");
    expect(summary).toContain("invalid_type");
  });

  it("names the root when an issue has no path", () => {
    expect(
      describeSchemaIssues([{ path: [], code: "invalid_type" }]),
    ).toContain("(root)");
  });

  it("stays a constant size however many issues a caller provokes", () => {
    // Measured on the shipped route: 300 malformed placements rendered a ~297,000-character Zod
    // message. The summary's length must be a function of the caps, not of the request body.
    const issues = Array.from({ length: 5_000 }, (_unused, index) => ({
      path: ["placements", index, "buildId"],
      code: "invalid_type",
    }));

    const summary = describeSchemaIssues(issues);

    expect(summary.length).toBeLessThan(400);
    // The total leads the summary, so it survives the length cap however long the paths are — it
    // is the durable signal that issues were elided, not the "(+N more)" suffix below.
    expect(summary.startsWith("5000 issue(s):")).toBe(true);
  });

  it("names how many issues it elided when the paths leave room to say so", () => {
    const issues = Array.from({ length: 5_000 }, () => ({
      path: ["a"],
      code: "x",
    }));

    expect(describeSchemaIssues(issues)).toContain("(+4990 more)");
  });

  it("truncates rather than letting ten long paths grow the line without limit", () => {
    const longPath = Array.from({ length: 20 }, () => "placements");
    const issues = Array.from({ length: 10 }, () => ({
      path: longPath,
      code: "invalid_type",
    }));

    const summary = describeSchemaIssues(issues);

    // Ten issues is under the count cap, so only the length cap can be holding this line down.
    expect(summary.length).toBeLessThan(400);
    expect(summary).toContain("(truncated)");
  });
});

describe("boundedFailureReason", () => {
  it("caps a reason so one rejection cannot flood the log", () => {
    expect(boundedFailureReason("x".repeat(500_000)).length).toBeLessThan(400);
  });

  it("strips control characters, so nothing can forge a log line", () => {
    const bounded = boundedFailureReason(
      "key_\n[migrate] executed 0001 against prod\r\ndone",
    );

    expect(bounded).not.toContain("\n");
    expect(bounded).not.toContain("\r");
  });

  it.each([
    ["a line separator", String.fromCodePoint(0x2028)],
    ["a paragraph separator", String.fromCodePoint(0x2029)],
  ])(
    "strips %s, which forges a line in a viewer that breaks on it",
    (_name, separator) => {
      const bounded = boundedFailureReason(`id${separator}[migrate] done`);

      expect(bounded).toBe("id [migrate] done");
    },
  );

  it("leaves an ordinary reason untouched", () => {
    expect(boundedFailureReason("1 issue(s): room:invalid_type")).toBe(
      "1 issue(s): room:invalid_type",
    );
  });
});
