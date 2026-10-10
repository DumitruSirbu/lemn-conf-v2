import {
  CONTACT_EVERY_REQUEST_TWIN,
  CONTACT_NEW_REQUEST_DAY_TWIN,
  CONTACT_NEW_REQUEST_HOUR_TWIN,
  MINT_TWIN,
  removeCountersOf,
  removeCountersOfTheRun,
  requireRoomUnderHalfTheFigure,
  SAVE_TWIN,
  SHARE_WRITE_TWIN,
  secretOfThisRun,
  type CountersOfTheRun,
} from "./support/e2e-rate-limit-run";
import { E2E_MINT_POLICY_NAME } from "../../src/lib/server/rate-limit/limit-policy";

/**
 * Runs once, in the runner's main process, after every test: removes the counter rows the run made under its own
 * secret and says how many designs it minted, how many share writes and saves it made, and how many contact requests
 * of any kind and new ones it sent. Those figures are what the e2e policies' windows are sized against. It throws, and
 * so fails the run, when it finds no row of mints or when the run made more than half of any window. Every other row
 * goes first, so a failure about the mints leaves none behind. The saves' rows by write credential and the contact
 * rows by request, visitor and address are removed by each test's own cleanup, which knows what it wrote.
 */
export default async function globalTeardown(): Promise<void> {
  const secret = secretOfThisRun();
  const shared = await removeCountersOf(secret, SHARE_WRITE_TWIN.policy.name);
  const saved = await removeCountersOf(secret, SAVE_TWIN.policy.name);
  const contact = await removeContactCountersOf(secret);
  const counted = await removeCountersOfTheRun(secret, E2E_MINT_POLICY_NAME);
  console.log(
    `e2e rate limit: this run minted ${String(counted.mintsCounted)} designs ` +
      `(${String(counted.rowsRemoved)} counter row removed), made ` +
      `${String(shared.hitsCounted)} share writes (${String(shared.rowsRemoved)} counter rows removed), made ` +
      `${String(saved.hitsCounted)} saves (${String(saved.rowsRemoved)} counter rows removed), and sent ` +
      `${String(contact.everyRequest.hitsCounted)} contact requests of any kind ` +
      `(${String(contact.everyRequest.rowsRemoved)} counter rows removed), ` +
      `${String(contact.newInAnHour.hitsCounted)} new ones counted in the hour ` +
      `(${String(contact.newInAnHour.rowsRemoved)} counter rows removed) and ` +
      `${String(contact.newInADay.hitsCounted)} new ones counted in the UTC day ` +
      `(${String(contact.newInADay.rowsRemoved)} counter rows removed)`,
  );
  requireRoomUnderHalfTheFigure(MINT_TWIN, counted.mintsCounted);
  requireRoomUnderHalfTheFigure(SHARE_WRITE_TWIN, shared.hitsCounted);
  requireRoomUnderHalfTheFigure(SAVE_TWIN, saved.hitsCounted);
  requireRoomUnderHalfTheFigure(
    CONTACT_EVERY_REQUEST_TWIN,
    contact.everyRequest.hitsCounted,
  );
  requireRoomUnderHalfTheFigure(
    CONTACT_NEW_REQUEST_HOUR_TWIN,
    contact.newInAnHour.hitsCounted,
  );
  requireRoomUnderHalfTheFigure(
    CONTACT_NEW_REQUEST_DAY_TWIN,
    contact.newInADay.hitsCounted,
  );
}

/** The three buckets the suite's one shared block counts for the contact route, each under its own key. */
async function removeContactCountersOf(secret: string): Promise<{
  readonly everyRequest: CountersOfTheRun;
  readonly newInAnHour: CountersOfTheRun;
  readonly newInADay: CountersOfTheRun;
}> {
  return {
    everyRequest: await removeCountersOf(
      secret,
      CONTACT_EVERY_REQUEST_TWIN.policy.name,
    ),
    newInAnHour: await removeCountersOf(
      secret,
      CONTACT_NEW_REQUEST_HOUR_TWIN.policy.name,
    ),
    newInADay: await removeCountersOf(
      secret,
      CONTACT_NEW_REQUEST_DAY_TWIN.policy.name,
    ),
  };
}
