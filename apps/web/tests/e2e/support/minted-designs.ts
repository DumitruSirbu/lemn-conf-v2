import {
  deleteDesignsForTests,
  findDesignIdsForTests,
  findWriteTokenHashesForTests,
} from "@lemnaria/persistence";

import { mintLedgerOfTheRun } from "./mint-ledger";
import {
  removeCredentialCountersOf,
  secretOfThisRun,
  type CountersOfTheRun,
} from "./e2e-rate-limit-run";

/**
 * Deletes the design rows a spec caused to be minted, and the counter rows that counted their saves.
 *
 * Any spec that mutates the configurator mints a row: the store schedules a save after the first
 * successful command, and `POST /api/designs` creates it. Without this the test database grows by
 * a row per run, forever — the same cleanup obligation every live suite carries, and the third
 * mechanism of ADR 0006. A save is also counted under its write credential's hash, which the design's row alone
 * holds, so the counters go first, while the row can still be asked.
 *
 * The designs are first written to the run's mint ledger, which the teardown reads to know whether the run minted any
 * (a run of no mint has no counter row, and a wrong key would look the same). It is written before anything is
 * deleted, so a failed delete still counts them.
 *
 * The connection is not passed in: `deleteDesignsForTests` resolves it through the same guard the
 * live suites use, which refuses the application's own database outright (finding DB-001).
 */
export async function deleteMintedDesigns(
  designIds: readonly string[],
): Promise<void> {
  if (designIds.length === 0) return;

  mintLedgerOfTheRun(secretOfThisRun()).record(designIds.length);
  await removeSaveCountersOfDesigns(designIds);
  // The SQL lives in `packages/persistence`, the only package allowed to import a Postgres driver
  // (`scripts/gates/boundary.sh`).
  await deleteDesignsForTests(designIds);
}

/**
 * Removes the rows that counted saves under the write credentials of these designs, by the keys the server counts
 * under, and answers what they held. A spec that saved a design asserts it found a row: finding none means the key
 * computed here is not the server's, and the rows would stay.
 */
export async function removeSaveCountersOfDesigns(
  designIds: readonly string[],
): Promise<CountersOfTheRun> {
  const hashes = await findWriteTokenHashesForTests(designIds);
  return removeCredentialCountersOf(secretOfThisRun(), hashes);
}

/**
 * Answers which of `designIds` still have a row in the test database — read-only, for proving a
 * delete actually happened. M7 wave 7E3b, S4: since ADR 0114 decision 5 gates every cookie-less
 * `GET /api/designs/{id}` to 404 whether or not the row exists, that response can no longer stand
 * in for "the row is gone" (`seeded-design.qa.e2e.spec.ts`, criterion 9).
 */
export async function findMintedDesignIds(
  designIds: readonly string[],
): Promise<string[]> {
  if (designIds.length === 0) return [];
  return findDesignIdsForTests(designIds);
}
