import {
  removeCountersOfTheRun,
  secretOfThisRun,
} from "./support/e2e-rate-limit-run";
import { E2E_MINT_POLICY_NAME } from "../../src/lib/server/rate-limit/limit-policy";

/**
 * Runs once, in the runner's main process, after every test: removes the counter rows the run made under its own
 * secret and says how many designs the run minted. That figure is what the e2e policy's day is sized against. It
 * throws, and so fails the run, when it finds no row.
 */
export default async function globalTeardown(): Promise<void> {
  const counted = await removeCountersOfTheRun(
    secretOfThisRun(),
    E2E_MINT_POLICY_NAME,
  );
  console.log(
    `e2e rate limit: this run minted ${String(counted.mintsCounted)} designs ` +
      `(${String(counted.rowsRemoved)} counter row removed)`,
  );
}
