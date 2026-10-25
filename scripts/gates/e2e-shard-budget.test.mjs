// Tests for the e2e shard-budget guard. `node --test`, so nothing here needs a browser, a build or a
// database: the guard's own logic is exercised against fabricated shard listings, and the one thing
// read from disk is ci.yml, which is what ties the guard's shard counts to the workflow's.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  derivedBudget,
  enforcedBudget,
  evaluateProject,
  filesLargerThanBudget,
  findShardCountNeeded,
  readWorkflowShards,
  shardsOverBudget,
  summariseListing,
  workflowDisagreements,
} from "./e2e-shard-budget.mjs";

const WORKFLOW_TEXT = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../.github/workflows/ci.yml",
  ),
  "utf8",
);

function shardOf(tests, file = "a.spec.ts") {
  return { tests, files: { [file]: tests } };
}

test("the derived budget is the 30-minute target over the measured rate, rounded down", () => {
  assert.equal(derivedBudget("desktop"), 66); // 1800 s / (37.8 min * 60 / 84 tests = 27.0 s) = 66.7
  assert.equal(derivedBudget("mobile"), 125); // 1800 s / (26.1 min * 60 / 109 tests = 14.4 s) = 125.3
});

test("desktop is enforced at its ratchet above the derived budget, mobile at the derived budget", () => {
  assert.equal(enforcedBudget("desktop"), 67);
  assert.equal(enforcedBudget("mobile"), 125);
});

test("a shard at its budget passes and one test over fails", () => {
  assert.deepEqual(shardsOverBudget([shardOf(125), shardOf(1)], 125), []);
  assert.deepEqual(shardsOverBudget([shardOf(125), shardOf(126)], 125), [
    { shard: 2, tests: 126 },
  ]);
});

test("three mobile shards of 138, 129 and 126 fail and the guard asks for four", () => {
  const listings = {
    3: [shardOf(138), shardOf(129), shardOf(126)],
    4: [shardOf(106), shardOf(114), shardOf(88), shardOf(85)],
  };

  const outcome = evaluateProject({
    project: "mobile",
    shardCount: 3,
    listShards: (count) => listings[count],
  });

  assert.deepEqual(outcome.over, [
    { shard: 1, tests: 138 },
    { shard: 2, tests: 129 },
    { shard: 3, tests: 126 },
  ]);
  assert.equal(outcome.shardsNeeded, 4);
});

test("a project already within budget needs no more shards than it has", () => {
  const outcome = evaluateProject({
    project: "mobile",
    shardCount: 4,
    listShards: () => [shardOf(106), shardOf(114), shardOf(88), shardOf(85)],
  });

  assert.deepEqual(outcome.over, []);
  assert.equal(outcome.shardsNeeded, 4);
});

test("no shard count fits when a single file is bigger than the budget, and the file is named", () => {
  const huge = [{ tests: 200, files: { "big.spec.ts": 200 } }];

  const needed = findShardCountNeeded({
    startAt: 1,
    budget: 125,
    listShards: () => huge,
  });

  assert.equal(needed, null);
  assert.deepEqual(filesLargerThanBudget(huge, 125), [
    { file: "big.spec.ts", tests: 200 },
  ]);
});

test("the workflow's shard matrices match the configured shard counts", () => {
  assert.deepEqual(
    workflowDisagreements(readWorkflowShards(WORKFLOW_TEXT)),
    [],
  );
});

test("a workflow whose total or shard list drifts from the configured counts is reported", () => {
  const drifted = WORKFLOW_TEXT.replace("total: [9]", "total: [3]").replace(
    "shard: [1, 2, 3, 4, 5]",
    "shard: [1, 2]",
  );

  const problems = workflowDisagreements(readWorkflowShards(drifted));

  assert.equal(problems.length, 2);
  assert.match(
    problems.join("\n"),
    /mobile: ci\.yml matrix\.total is \[3\], expected \[9\]/,
  );
  assert.match(
    problems.join("\n"),
    /desktop: ci\.yml matrix\.shard is \[1,2\], expected \[1, 2, 3, 4, 5\]/,
  );
});

test("a listing is counted per file, through nested describes", () => {
  const listing = JSON.stringify({
    errors: [],
    suites: [
      {
        file: "a.spec.ts",
        specs: [],
        suites: [
          {
            file: "a.spec.ts",
            specs: [{ tests: [{}] }, { tests: [{}] }],
            suites: [{ specs: [{ tests: [{}] }] }],
          },
        ],
      },
      { file: "b.spec.ts", specs: [{ tests: [{}] }], suites: [] },
    ],
  });

  assert.deepEqual(summariseListing(`noise\n${listing}`), {
    tests: 4,
    files: { "a.spec.ts": 3, "b.spec.ts": 1 },
  });
});

test("a listing that reports errors is refused rather than counted as zero tests", () => {
  assert.throws(
    () =>
      summariseListing(
        JSON.stringify({ errors: [{ message: "boom" }], suites: [] }),
      ),
    /reported errors/,
  );
});
