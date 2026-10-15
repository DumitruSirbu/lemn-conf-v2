/**
 * Set by vitest in every worker, by Playwright in every test worker (`TEST_WORKER_INDEX`) and in its own runner
 * process, where its global teardown runs (`PLAYWRIGHT_TEST`): the closest proof that this process is a test runner and
 * not the application.
 */
const TEST_RUNNER_MARKER_VARIABLES = [
  "VITEST",
  "TEST_WORKER_INDEX",
  "PLAYWRIGHT_TEST",
] as const;

/** What a test-only function is and does, in the words its refusal uses. */
export interface TestOnlyOperation {
  readonly functionName: string;
  /** The verb phrase that says what it touches, e.g. `deletes counter rows`. */
  readonly effect: string;
}

/**
 * The one guard every test-only function of this package asks before it opens a connection: this process is a test
 * runner, and is not in production. It does not choose the database: `openTestDatabase()` still refuses anything but an
 * allowlisted test database, which is what keeps these functions from the application. Both refusals say the function's
 * own name, so a person who reads one knows which door it was.
 */
export function requireTestRunner({
  functionName,
  effect,
}: TestOnlyOperation): void {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      `${functionName} was called with NODE_ENV=production. It ${effect} and exists only for test cleanup; ` +
        "application code must never reach it.",
    );
  }
  if (isMarkedAsATestRunner()) return;

  throw new Error(
    `${functionName} was called outside a test runner (none of ${TEST_RUNNER_MARKER_VARIABLES.join(", ")} is ` +
      `set). It ${effect} and exists only for test cleanup; application code must never reach it.`,
  );
}

/** Non-empty once trimmed, not merely present: neither `VITEST=""` nor `VITEST=" "` is a runner. */
function isMarkedAsATestRunner(): boolean {
  return TEST_RUNNER_MARKER_VARIABLES.some(
    (variable) => (process.env[variable] ?? "").trim() !== "",
  );
}
