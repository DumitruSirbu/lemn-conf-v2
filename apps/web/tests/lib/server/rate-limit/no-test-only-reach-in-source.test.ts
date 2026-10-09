import { describe, expect, it } from "vitest";

import {
  sourceFilesMatching,
  testFilesMatching,
} from "../server-source-support";

const TEST_ONLY_DELETES =
  /deleteDesignsForTests|findDesignIdsForTests|deleteRateLimitCountersForTests/;
const RUN_SECRET_VARIABLE = /LEMNARIA_E2E_RUN_SECRET/;
/** A test that replaces the judgement of the limit, whether by `mock` or `doMock`, rather than what it counts in. */
const MOCKS_THE_JUDGEMENT =
  /vi\.(?:mock|doMock)\(\s*["'`][^"'`]*(?:judge-mint-request|enforce-rate-limit)["'`]/;

const THIS_FILE = "lib/server/rate-limit/no-test-only-reach-in-source.test.ts";

describe("what apps/web/src may not name", () => {
  it.each([
    "import { deleteDesignsForTests } from '@lemnaria/persistence';",
    "await findDesignIdsForTests(ids);",
    "deleteRateLimitCountersForTests([key])",
  ])("reads source: the delete pattern recognises %s", (text) => {
    expect(TEST_ONLY_DELETES.test(text)).toBe(true);
  });

  it("reads source: no file under apps/web/src names a test-only delete of the persistence package", () => {
    expect(sourceFilesMatching(TEST_ONLY_DELETES)).toEqual([]);
  });

  it("reads source: no file under apps/web/src names the run's secret variable", () => {
    expect(sourceFilesMatching(RUN_SECRET_VARIABLE)).toEqual([]);
  });

  it("reads source: the scans read the server modules they exist for", () => {
    expect(
      sourceFilesMatching(/NeonRateLimitStore|from "@lemnaria\/persistence"/)
        .length,
    ).toBeGreaterThanOrEqual(10);
  });
});

describe("what a test may fake", () => {
  it.each([
    'vi.mock("@/lib/server/rate-limit/judge-mint-request", () => ({}));',
    "vi.doMock('@/lib/server/rate-limit/enforce-rate-limit', factory);",
    'vi.mock(\n    "../../src/lib/server/rate-limit/judge-mint-request",',
  ])("reads source: the mock pattern recognises %s", (text) => {
    expect(MOCKS_THE_JUDGEMENT.test(text)).toBe(true);
  });

  it.each([
    'vi.mock("@/lib/server/rate-limit/rate-limit-store-instance", () => ({}));',
    'vi.unmock("@/lib/server/rate-limit/judge-mint-request");',
    'vi.mock("@/lib/server/repository", () => ({}));',
  ])("reads source: the mock pattern leaves out %s", (text) => {
    expect(MOCKS_THE_JUDGEMENT.test(text)).toBe(false);
  });

  it("reads source: no test mocks the judgement of the limit, which runs for real in every route test", () => {
    const mockers = testFilesMatching(MOCKS_THE_JUDGEMENT).filter(
      (path) => path !== THIS_FILE,
    );

    expect(mockers).toEqual([]);
  });

  it("reads source: reads the route tests it protects, so a clean answer is no empty scan", () => {
    const routeTests = testFilesMatching(/api\/designs\/route"/);

    expect(routeTests.length).toBeGreaterThanOrEqual(16);
  });
});
