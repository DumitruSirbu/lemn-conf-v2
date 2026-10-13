import {
  CONTACT_EVERY_REQUEST_TWIN,
  CONTACT_NEW_REQUEST_DAY_TWIN,
  CONTACT_NEW_REQUEST_HOUR_TWIN,
  MINT_TWIN,
  removeCountersOf,
  removeCountersOfTheRun,
  requireNoCspReportsUnderCi,
  requireRoomUnderHalfTheFigure,
  SAVE_TWIN,
  SHARE_WRITE_TWIN,
  secretOfThisRun,
  type CountersOfTheRun,
  type TwinOfTheRun,
} from "./support/e2e-rate-limit-run";
import {
  CSP_REPORT_POLICY,
  E2E_MINT_POLICY_NAME,
} from "../../src/lib/server/rate-limit/limit-policy";

/** What the run counted under one twin, and the rows it took away. */
type Measured = ReadonlyMap<TwinOfTheRun, CountersOfTheRun>;

/** Every twin but the mint's, in the order their rows go: the mint's goes last, so that a failure about the mints
 *  leaves none of these behind. */
const TWINS_REMOVED_BEFORE_THE_MINTS = [
  SHARE_WRITE_TWIN,
  SAVE_TWIN,
  CONTACT_EVERY_REQUEST_TWIN,
  CONTACT_NEW_REQUEST_HOUR_TWIN,
  CONTACT_NEW_REQUEST_DAY_TWIN,
] as const;

/**
 * Runs once, in the runner's main process, after every test: removes the counter rows the run made under its own
 * secret and says how many designs it minted, how many share writes and saves it made, how many contact requests of
 * any kind and new ones it sent, and how many content security policy violation reports its server received. Those
 * figures are what the e2e policies' windows are sized against. It throws, and so fails the run, after every row is
 * gone: when a `CI` run's server counted any violation report, when it finds no row of mints, or when the run made
 * more than half of any window. A run that fails more than one of these reports every failure in an `AggregateError`.
 * The saves' rows by write credential and the contact rows by request, visitor and address are removed by each test's
 * own cleanup, which knows what it wrote.
 */
export default async function globalTeardown(): Promise<void> {
  const secret = secretOfThisRun();
  const cspReports = await removeCountersOf(secret, CSP_REPORT_POLICY.name);
  const removal = await removalOf(secret);
  console.log(summaryOf(removal.measured, cspReports));
  const failures = [
    ...removal.failures,
    ...failuresOf(() => {
      requireNoCspReportsUnderCi(cspReports.hitsCounted);
      requireRoomUnderEveryHalfFigure(removal.measured);
    }),
  ];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      "The e2e teardown found more than one failure",
    );
  }
  if (failures[0] !== undefined) throw failures[0];
}

interface Removal {
  readonly measured: Measured;
  readonly failures: readonly Error[];
}

/** What the twins' removal measured, or nothing and the failure: the csp count must be judged either way. */
async function removalOf(secret: string): Promise<Removal> {
  try {
    return { measured: await removeEveryTwinsRows(secret), failures: [] };
  } catch (failure) {
    return { measured: new Map(), failures: [asError(failure)] };
  }
}

function failuresOf(check: () => void): readonly Error[] {
  try {
    check();
    return [];
  } catch (failure) {
    return [asError(failure)];
  }
}

function asError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

function requireRoomUnderEveryHalfFigure(measured: Measured): void {
  for (const [twin, counters] of measured) {
    requireRoomUnderHalfTheFigure(twin, counters.hitsCounted);
  }
}

async function removeEveryTwinsRows(secret: string): Promise<Measured> {
  const measured = new Map<TwinOfTheRun, CountersOfTheRun>();
  for (const twin of TWINS_REMOVED_BEFORE_THE_MINTS) {
    measured.set(twin, await removeCountersOf(secret, twin.policy.name));
  }
  const mints = await removeCountersOfTheRun(secret, E2E_MINT_POLICY_NAME);
  const asCounters = {
    rowsRemoved: mints.rowsRemoved,
    hitsCounted: mints.mintsCounted,
  };
  return new Map([[MINT_TWIN, asCounters], ...measured]);
}

function summaryOf(measured: Measured, cspReports: CountersOfTheRun): string {
  const of = (twin: TwinOfTheRun): CountersOfTheRun =>
    measured.get(twin) ?? { rowsRemoved: 0, hitsCounted: 0 };
  const rows = (twin: TwinOfTheRun): string =>
    `(${String(of(twin).rowsRemoved)} counter rows removed)`;
  const hits = (twin: TwinOfTheRun): string => String(of(twin).hitsCounted);
  return (
    `e2e rate limit: this run minted ${hits(MINT_TWIN)} designs ` +
    `(${String(of(MINT_TWIN).rowsRemoved)} counter row removed), made ` +
    `${hits(SHARE_WRITE_TWIN)} share writes ${rows(SHARE_WRITE_TWIN)}, made ` +
    `${hits(SAVE_TWIN)} saves ${rows(SAVE_TWIN)}, and sent ` +
    `${hits(CONTACT_EVERY_REQUEST_TWIN)} contact requests of any kind ${rows(CONTACT_EVERY_REQUEST_TWIN)}, ` +
    `${hits(CONTACT_NEW_REQUEST_HOUR_TWIN)} new ones counted in the hour ${rows(CONTACT_NEW_REQUEST_HOUR_TWIN)} and ` +
    `${hits(CONTACT_NEW_REQUEST_DAY_TWIN)} new ones counted in the UTC day ${rows(CONTACT_NEW_REQUEST_DAY_TWIN)}. ` +
    `Its server counted ${String(cspReports.hitsCounted)} csp-report hits ` +
    `(${String(cspReports.rowsRemoved)} counter rows removed)`
  );
}
