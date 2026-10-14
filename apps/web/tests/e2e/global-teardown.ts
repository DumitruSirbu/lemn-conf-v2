import {
  removeCspReportRowsOfTheRun,
  requireCspReportRowsWithinHits,
  type CspReportRowsOfTheRun,
} from "./support/csp-report-rows";
import {
  CONTACT_EVERY_REQUEST_TWIN,
  CONTACT_NEW_REQUEST_DAY_TWIN,
  CONTACT_NEW_REQUEST_HOUR_TWIN,
  MINT_TWIN,
  removeCountersOf,
  requireMintCountersUnlessNothingWasCounted,
  requireNoCspReportsUnderCi,
  requireRoomUnderHalfTheFigure,
  SAVE_TWIN,
  SHARE_WRITE_TWIN,
  secretOfThisRun,
  type CountersOfTheRun,
  type TwinOfTheRun,
  type WhatTheRunCounted,
} from "./support/e2e-rate-limit-run";
import { mintLedgerOfTheRun } from "./support/mint-ledger";
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
 * Runs once, in the runner's main process, after every test: removes the run's counter rows and its `csp_reports` rows
 * (by writer mark, the suite's server's and every second server's), prints the figures the e2e windows are sized
 * against, and only then fails. It fails on a CI run that counted a violation report, no mints' row in a run that minted
 * designs or counted anything else, more than half of any window, or more stored rows than counted hits; every failure
 * is reported, in an `AggregateError` when several.
 * The saves' and contacts' rows are removed by each test's own cleanup.
 */
export default async function globalTeardown(): Promise<void> {
  const secret = secretOfThisRun();
  const cspRows = await removeCspReportRowsOfTheRun(secret);
  const cspReports = await removeCountersOf(secret, CSP_REPORT_POLICY.name);
  const removal = await removalOf(secret, cspReports.hitsCounted);
  console.log(summaryOf(removal.measured, cspReports, cspRows.figures));
  const failures = [
    ...removal.failures,
    ...cspRows.failures,
    ...failuresOf(() => {
      requireNoCspReportsUnderCi(cspReports.hitsCounted);
    }),
    ...failuresOf(() => {
      requireCspReportRowsWithinHits(
        cspRows.figures.suite.removed,
        cspReports.hitsCounted,
      );
    }),
    ...failuresOf(() => {
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
async function removalOf(
  secret: string,
  cspHitsCounted: number,
): Promise<Removal> {
  const designsMinted = mintLedgerOfTheRun(secret).takeCount();
  try {
    const measured = await removeEveryTwinsRows(secret);
    const counted = whatTheRunCounted(measured, designsMinted, cspHitsCounted);
    return {
      measured,
      failures: failuresOf(() => {
        requireMintCountersUnlessNothingWasCounted(counted);
      }),
    };
  } catch (failure) {
    return { measured: new Map(), failures: [asError(failure)] };
  }
}

function whatTheRunCounted(
  measured: Measured,
  designsMinted: number,
  cspHitsCounted: number,
): WhatTheRunCounted {
  const otherTwinsHits = [...measured]
    .filter(([twin]) => twin !== MINT_TWIN)
    .reduce((sum, [, counters]) => sum + counters.hitsCounted, 0);
  return {
    mintRowsRemoved: measured.get(MINT_TWIN)?.rowsRemoved ?? 0,
    designsMinted,
    otherHitsCounted: otherTwinsHits + cspHitsCounted,
  };
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
  const mints = await removeCountersOf(secret, E2E_MINT_POLICY_NAME);
  return new Map([[MINT_TWIN, mints], ...measured]);
}

function summaryOf(
  measured: Measured,
  cspReports: CountersOfTheRun,
  cspRows: CspReportRowsOfTheRun,
): string {
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
    `(${String(cspReports.rowsRemoved)} counter rows removed) and stored ` +
    `${String(cspRows.suite.counted)} csp_reports rows (${String(cspRows.suite.removed)} removed); ` +
    `${String(cspRows.secondServersStarted)} second servers stored ` +
    `${String(cspRows.secondServers.counted)} (${String(cspRows.secondServers.removed)} removed)`
  );
}
