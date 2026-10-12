#!/usr/bin/env node
//
// The e2e per-shard test budget, and the guard that enforces it (ADR 0105, Amendment A).
//
// Every e2e shard is held to <= TARGET_MINUTES_PER_SHARD runner minutes. The number of tests a shard
// may carry is derived below from the runner's *measured* per-test rate, never from a local run: a
// laptop and a two-core runner differ by more than a constant factor (see ci-and-local-gates.md).
// This file is the one place the rates, the target and the shard counts are written.
//
// Run by the `e2e-shard-budget` CI job and by `scripts/local-ci.sh`. It only *lists* tests - no
// browser, no server - so it costs seconds, but it does load the Playwright config and every spec
// module, so it needs the workspace built and TEST_DATABASE_URL set, exactly as `--list` does.
//
// Exceeding the budget raises the shard count. It never raises the job's `timeout-minutes`.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MEASURED on the runner, not estimated. Source: `main`'s run 34580253814, the push of 995ad03
 * (2026-09-11), the only runner evidence the project has of this suite. The M7/M7B branch's suite had
 * not run on a runner when these were recorded.
 *
 * The two rows are not on the same basis, and both biases err toward a smaller (safer) budget:
 *  - desktop: Playwright's own `82 passed, 2 failed (37.8m)` over 84 tests. Two tests failed, and a
 *    failed test runs to its 120 s timeout, so the rate is inflated by them.
 *  - mobile: the job's wall clock of 26.1 min over 109 tests. Playwright's own figure was 24.9 min,
 *    so the rate includes the job's ~1.2 min of setup.
 * Both rates also include one `next build` (~1 min) that every shard pays again.
 */
export const MEASURED_RUNNER_RATES = {
  sourceRun: "34580253814",
  desktop: { tests: 84, minutes: 37.8 },
  mobile: { tests: 109, minutes: 26.1 },
};

/** 15 minutes under the 45-minute job ceiling, which stays a hang detector rather than a schedule. */
export const TARGET_MINUTES_PER_SHARD = 30;

/**
 * Shards per project. Must equal `strategy.matrix.total` of the matching job in ci.yml; the guard
 * reads the workflow and fails if they differ. Mobile needs six: four left its third shard exactly
 * at the budget of 125 (123/120/125/114), and five put 135 on its second, because a shard is whole files.
 */
export const SHARDS_PER_PROJECT = { desktop: 3, mobile: 7 };

/**
 * A ceiling above the derived budget, for a project whose shards cannot all fit under it.
 *
 * `fullyParallel` is false, so Playwright shards by whole file. No single file is over the budget
 * any more (the largest desktop file holds 37 tests), but the largest desktop shard is 67, one over
 * the derived budget of 66, because a shard is whole files. The ceiling is today's largest shard: it
 * stops the suite growing and lets the tree pass, and does not declare 67 tests acceptable. It only
 * ever comes DOWN; delete the entry once the derived budget is enough.
 *
 * The budget is a count and the count is a proxy for time; ci-and-local-gates.md records where it
 * misleads.
 */
export const RATCHETED_CEILINGS = { desktop: 67 };

const PROJECTS = Object.keys(SHARDS_PER_PROJECT);
const MAX_SHARDS_TRIED = 16;
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const WORKFLOW_PATH = resolve(REPOSITORY_ROOT, ".github/workflows/ci.yml");

export function secondsPerTest(project) {
  const { tests, minutes } = MEASURED_RUNNER_RATES[project];
  return (minutes * 60) / tests;
}

/** The most tests a shard may carry and still finish within the target. */
export function derivedBudget(project) {
  return Math.floor((TARGET_MINUTES_PER_SHARD * 60) / secondsPerTest(project));
}

export function enforcedBudget(project) {
  return Math.max(derivedBudget(project), RATCHETED_CEILINGS[project] ?? 0);
}

/** `shards` is `[{ tests, files: { [file]: tests } }]`, one entry per shard. */
export function shardsOverBudget(shards, budget) {
  return shards.flatMap((shard, index) =>
    shard.tests > budget ? [{ shard: index + 1, tests: shard.tests }] : [],
  );
}

/** The fewest shards, above `startAt`, whose largest shard fits; null when no count can fit. */
export function findShardCountNeeded({ startAt, budget, listShards }) {
  for (let count = startAt + 1; count <= MAX_SHARDS_TRIED; count += 1) {
    if (shardsOverBudget(listShards(count), budget).length === 0) {
      return count;
    }
  }
  return null;
}

/** A file bigger than the budget cannot be fixed by sharding, because a file is never split. */
export function filesLargerThanBudget(shards, budget) {
  return shards.flatMap((shard) =>
    Object.entries(shard.files)
      .filter(([, tests]) => tests > budget)
      .map(([file, tests]) => ({ file, tests })),
  );
}

export function evaluateProject({
  project,
  listShards,
  shardCount = SHARDS_PER_PROJECT[project],
}) {
  const budget = enforcedBudget(project);
  const shards = listShards(shardCount);
  const over = shardsOverBudget(shards, budget);
  const oversizedFiles = filesLargerThanBudget(shards, budget);
  const shardsNeeded =
    over.length === 0
      ? shardCount
      : findShardCountNeeded({ startAt: shardCount, budget, listShards });
  return {
    project,
    shardCount,
    budget,
    shards,
    over,
    oversizedFiles,
    shardsNeeded,
  };
}

/**
 * Reads each e2e shard job's `shard: [...]` and `total: [...]` out of ci.yml. The text is scanned
 * rather than parsed because the repository carries no YAML dependency and these two lines are the
 * only thing the guard needs; a job whose lines cannot be found reports `null`.
 */
export function readWorkflowShards(workflowText) {
  const declared = {};
  for (const project of PROJECTS) {
    const job = jobBlock(workflowText, `e2e-${project}-shard`);
    declared[project] = {
      total: readNumberList(job, "total"),
      shard: readNumberList(job, "shard"),
    };
  }
  return declared;
}

function jobBlock(workflowText, jobId) {
  const lines = workflowText.split("\n");
  const start = lines.indexOf(`  ${jobId}:`);
  if (start === -1) {
    return "";
  }
  const length = lines
    .slice(start + 1)
    .findIndex((line) => /^ {2}\S/.test(line));
  const end = length === -1 ? lines.length : start + 1 + length;
  return lines.slice(start, end).join("\n");
}

function readNumberList(block, key) {
  const match = new RegExp(`^\\s+${key}: \\[([0-9, ]+)\\]`, "m").exec(block);
  return match ? match[1].split(",").map((item) => Number(item.trim())) : null;
}

/** Problems that would make the workflow shard differently from what the budget was checked at. */
export function workflowDisagreements(declared) {
  return PROJECTS.flatMap((project) => {
    const expected = SHARDS_PER_PROJECT[project];
    const { total, shard } = declared[project];
    const everyShard = Array.from(
      { length: expected },
      (_, index) => index + 1,
    );
    const problems = [];
    if (total === null || total.length !== 1 || total[0] !== expected) {
      problems.push(
        `${project}: ci.yml matrix.total is ${JSON.stringify(total)}, expected [${String(expected)}]`,
      );
    }
    if (shard === null || shard.join() !== everyShard.join()) {
      problems.push(
        `${project}: ci.yml matrix.shard is ${JSON.stringify(shard)}, expected [${everyShard.join(", ")}]`,
      );
    }
    return problems;
  });
}

function listShardOfProject(project, index, count) {
  const shardFlag =
    count === null ? [] : [`--shard=${String(index)}/${String(count)}`];
  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      "@lemnaria/web",
      "exec",
      "playwright",
      "test",
      "--list",
      "--reporter=json",
      `--project=${project}`,
      ...shardFlag,
    ],
    { cwd: REPOSITORY_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(
      `playwright --list failed for ${project} ${String(index)}/${String(count)}:\n${result.stderr}${result.stdout}`,
    );
  }
  return summariseListing(result.stdout);
}

export function summariseListing(stdout) {
  const report = JSON.parse(stdout.slice(stdout.indexOf("{")));
  if (report.errors.length > 0) {
    throw new Error(
      `playwright --list reported errors: ${JSON.stringify(report.errors)}`,
    );
  }
  const files = {};
  for (const suite of report.suites) {
    files[suite.file] = countTests(suite);
  }
  return {
    tests: Object.values(files).reduce((sum, tests) => sum + tests, 0),
    files,
  };
}

function countTests(suite) {
  const own = (suite.specs ?? []).reduce(
    (sum, spec) => sum + spec.tests.length,
    0,
  );
  return (suite.suites ?? []).reduce(
    (sum, child) => sum + countTests(child),
    own,
  );
}

function listAllShards(project, count) {
  return Array.from({ length: count }, (_, index) =>
    listShardOfProject(project, index + 1, count),
  );
}

function describeRates(project) {
  const { tests, minutes } = MEASURED_RUNNER_RATES[project];
  const rate = secondsPerTest(project).toFixed(1);
  return `${project}: ${String(tests)} tests in ${String(minutes)} min on run ${MEASURED_RUNNER_RATES.sourceRun} = ${rate} s/test; ${String(TARGET_MINUTES_PER_SHARD)} min / ${rate} s = ${String(derivedBudget(project))} tests per shard`;
}

function reportProject(result) {
  const ratcheted = result.budget > derivedBudget(result.project);
  console.log(`\n${describeRates(result.project)}`);
  if (ratcheted) {
    console.log(
      `  WARN: enforced ceiling is ${String(result.budget)}, a ratchet above the derived budget (see RATCHETED_CEILINGS).`,
    );
  }
  result.shards.forEach((shard, index) => {
    const verdict = shard.tests > result.budget ? "OVER BUDGET" : "ok";
    console.log(
      `  ${result.project} shard ${String(index + 1)}/${String(result.shardCount)}: ${String(shard.tests)} tests (budget ${String(result.budget)}) ${verdict}`,
    );
  });
}

function reportFailure(result) {
  for (const { file, tests } of result.oversizedFiles) {
    console.log(
      `  ${file} alone has ${String(tests)} tests, over the budget of ${String(result.budget)}. A file is never split across shards, so no shard count fixes this; split the file.`,
    );
  }
  if (result.shardsNeeded === null) {
    console.log(
      `  ${result.project}: no shard count up to ${String(MAX_SHARDS_TRIED)} fits the budget.`,
    );
    return;
  }
  console.log(
    `  ${result.project} needs ${String(result.shardsNeeded)} shards (configured: ${String(result.shardCount)}). Raise matrix.total and matrix.shard in ci.yml and SHARDS_PER_PROJECT here together.`,
  );
}

function assertShardsCoverTheSuite(result) {
  const listed = result.shards.reduce((sum, shard) => sum + shard.tests, 0);
  const whole = listShardOfProject(result.project, 1, null).tests;
  if (listed !== whole) {
    throw new Error(
      `${result.project}: shards list ${String(listed)} tests but the project has ${String(whole)}; a test is in no shard.`,
    );
  }
}

function main() {
  const workflowProblems = workflowDisagreements(
    readWorkflowShards(readFileSync(WORKFLOW_PATH, "utf8")),
  );
  workflowProblems.forEach((problem) =>
    console.error(`DISAGREEMENT: ${problem}`),
  );
  let failed = workflowProblems.length > 0;
  for (const project of PROJECTS) {
    const result = evaluateProject({
      project,
      listShards: (count) => listAllShards(project, count),
    });
    reportProject(result);
    assertShardsCoverTheSuite(result);
    if (result.over.length > 0) {
      reportFailure(result);
      failed = true;
    }
  }
  console.log(
    failed
      ? "\nE2E SHARD BUDGET FAILED"
      : "\nE2E shard budget: every shard is within budget.",
  );
  process.exit(failed ? 1 : 0);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
