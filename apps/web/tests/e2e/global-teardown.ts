import {
  MINT_TWIN,
  removeCountersOf,
  removeCountersOfTheRun,
  requireRoomUnderHalfTheFigure,
  SAVE_TWIN,
  SHARE_WRITE_TWIN,
  secretOfThisRun,
} from "./support/e2e-rate-limit-run";
import { E2E_MINT_POLICY_NAME } from "../../src/lib/server/rate-limit/limit-policy";

/**
 * Runs once, in the runner's main process, after every test: removes the counter rows the run made under its own
 * secret and says how many designs it minted and how many share writes and saves it made. Those figures are what the
 * e2e policies' windows are sized against. It throws, and so fails the run, when it finds no row of mints or when the
 * run made more than half of any window. The share and save rows go first, so a failure about the mints leaves none
 * behind. The saves' rows by write credential are removed by each test's own cleanup, which knows the designs.
 */
export default async function globalTeardown(): Promise<void> {
  const secret = secretOfThisRun();
  const shared = await removeCountersOf(secret, SHARE_WRITE_TWIN.policy.name);
  const saved = await removeCountersOf(secret, SAVE_TWIN.policy.name);
  const counted = await removeCountersOfTheRun(secret, E2E_MINT_POLICY_NAME);
  console.log(
    `e2e rate limit: this run minted ${String(counted.mintsCounted)} designs ` +
      `(${String(counted.rowsRemoved)} counter row removed), made ` +
      `${String(shared.hitsCounted)} share writes (${String(shared.rowsRemoved)} counter rows removed) and made ` +
      `${String(saved.hitsCounted)} saves (${String(saved.rowsRemoved)} counter rows removed)`,
  );
  requireRoomUnderHalfTheFigure(MINT_TWIN, counted.mintsCounted);
  requireRoomUnderHalfTheFigure(SHARE_WRITE_TWIN, shared.hitsCounted);
  requireRoomUnderHalfTheFigure(SAVE_TWIN, saved.hitsCounted);
}
