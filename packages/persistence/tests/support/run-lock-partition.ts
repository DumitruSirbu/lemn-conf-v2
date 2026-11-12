import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  discoverTestFiles,
  lockRegistrationOf,
  readTestTree,
  sourceOf,
} from "./live-suite-census-scanner.js";

/**
 * Runs one half of this package's suite, split by the test-schema lock each file declares, so CI can
 * run the exclusive holders on their own and shard the rest five ways without any shard waiting on
 * another (owner, 2026-11-12). An exclusive hold outlasts `TEST_SCHEMA_LOCK_WAIT_BOUND_MS`, so a
 * hash-based shard that put one beside other live files would fail them on the lock, not on a bug.
 *
 * The mode comes from the census scanner, the same reading `live-suite-census.test.ts` checks against
 * its literal table, so no list of files is restated here or in the workflow.
 *
 * Usage: `tsx tests/support/run-lock-partition.ts <exclusive|non-exclusive> [vitest arguments…]`
 */

const PACKAGE_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const TESTS_DIRECTORY_NAME = "tests";
const PARTITIONS = ["exclusive", "non-exclusive"] as const;

type Partition = (typeof PARTITIONS)[number];

runPartition(process.argv.slice(2));

function runPartition(commandLine: readonly string[]): void {
  const [partitionArgument, ...vitestArguments] = commandLine;
  const partition = parsePartition(partitionArgument);
  const selection = selectionArguments(partition, exclusiveLockFiles());
  const result = spawnSync(
    "vitest",
    ["run", "--config", "vitest.config.ts", ...selection, ...vitestArguments],
    { cwd: PACKAGE_DIRECTORY, stdio: "inherit" },
  );
  if (result.error !== undefined)
    throw new Error(`Could not start vitest for the ${partition} partition`, {
      cause: result.error,
    });
  process.exitCode = result.status ?? 1;
}

function parsePartition(argument: string | undefined): Partition {
  const partition = PARTITIONS.find((name) => name === argument);
  if (partition === undefined)
    throw new Error(
      `Expected a partition (${PARTITIONS.join(" or ")}) as the first argument, got ${String(argument)}`,
    );
  return partition;
}

/** An empty list would turn the exclusive run's filters into no filter at all — the whole suite on
 *  one runner — so finding none is an error, not an empty partition. */
function exclusiveLockFiles(): string[] {
  const tree = readTestTree(PACKAGE_DIRECTORY);
  const files = discoverTestFiles(PACKAGE_DIRECTORY)
    .filter(
      (name) => lockRegistrationOf(sourceOf(tree, name)).mode === "exclusive",
    )
    .map((name) => `${TESTS_DIRECTORY_NAME}/${name}`);
  if (files.length === 0)
    throw new Error(
      "The census scanner found no file holding the exclusive test-schema lock; refusing to run an unfiltered suite",
    );
  return files;
}

function selectionArguments(
  partition: Partition,
  exclusiveFiles: readonly string[],
): string[] {
  if (partition === "exclusive") return [...exclusiveFiles];
  return exclusiveFiles.flatMap((file) => ["--exclude", file]);
}
