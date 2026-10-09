import {
  removeCountersOfTheRun,
  removeShareCountersOfTheRun,
  requireRoomUnderHalfTheFigure,
  requireShareRoomUnderHalfTheFigure,
  secretOfThisRun,
} from "./support/e2e-rate-limit-run";
import { E2E_MINT_POLICY_NAME } from "../../src/lib/server/rate-limit/limit-policy";

/**
 * Runs once, in the runner's main process, after every test: removes the counter rows the run made under its own
 * secret and says how many designs it minted and how many share writes it made. Those figures are what the e2e
 * policies' windows are sized against. It throws, and so fails the run, when it finds no row of mints or when the run
 * made more than half of either window. The share rows go first, so a failure about the mints leaves none behind.
 */
export default async function globalTeardown(): Promise<void> {
  const secret = secretOfThisRun();
  const shared = await removeShareCountersOfTheRun(secret);
  const counted = await removeCountersOfTheRun(secret, E2E_MINT_POLICY_NAME);
  console.log(
    `e2e rate limit: this run minted ${String(counted.mintsCounted)} designs ` +
      `(${String(counted.rowsRemoved)} counter row removed) and made ` +
      `${String(shared.writesCounted)} share writes (${String(shared.rowsRemoved)} counter rows removed)`,
  );
  requireRoomUnderHalfTheFigure(counted);
  requireShareRoomUnderHalfTheFigure(shared);
}
