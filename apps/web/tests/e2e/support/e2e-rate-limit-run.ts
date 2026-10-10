import { randomBytes } from "node:crypto";

import { deleteRateLimitCountersForTests } from "@lemnaria/persistence";

import {
  DIGEST_KEY_BYTES,
  keyedDigest,
} from "../../../src/lib/server/digest/keyed-digest";
import {
  SHARED_BLOCK,
  type NetworkBlock,
} from "../../../src/lib/server/rate-limit/client-network";
import {
  E2E_MINT_POLICY,
  E2E_SHARE_WRITE_POLICY,
  type LimitPolicy,
  type PolicyName,
} from "../../../src/lib/server/rate-limit/limit-policy";

/**
 * The variable that carries a run's secret from the runner's main process to its test workers, and to nothing else.
 * The server is handed the same value as `DIGEST_SECRET`, by the config alone. It is written to no file and printed
 * nowhere.
 */
export const RUN_SECRET_VARIABLE = "LEMNARIA_E2E_RUN_SECRET";

/** Where the main process remembers the secret it made, so a second reading of the config in the same process cannot
 *  make another and leave the server holding one the workers do not. */
const MADE_IN_THIS_PROCESS: unique symbol = Symbol.for(
  "lemnaria.e2e.run-secret",
);

/** Playwright sets this in every worker and in no other process of a run. */
const WORKER_MARKER_VARIABLE = "TEST_WORKER_INDEX";

/** Thirty-two random bytes as sixty-four lowercase hexadecimal characters, the form the variable is written in. */
export function makeRunSecret(): string {
  return randomBytes(DIGEST_KEY_BYTES).toString("hex");
}

/**
 * The run's secret. Made once, in the runner's main process, where the config is first read; a worker only inherits
 * it through its environment, since a secret made where the config is read would differ in every worker and the rows
 * of the run would never be found.
 */
export function secretOfThisRun(): string {
  return isWorker() ? inheritedSecret() : madeSecret();
}

function isWorker(): boolean {
  return process.env[WORKER_MARKER_VARIABLE] !== undefined;
}

function inheritedSecret(): string {
  const inherited = process.env[RUN_SECRET_VARIABLE];
  if (inherited === undefined || inherited === "") {
    throw new Error(
      `A test worker found no ${RUN_SECRET_VARIABLE}: ` +
        "the runner's main process makes the run's secret before any worker starts",
    );
  }
  return inherited;
}

/** Makes the secret once in this process, hands it down to every worker through the environment, and answers it. */
function madeSecret(): string {
  const secret = rememberedSecret();
  process.env[RUN_SECRET_VARIABLE] = secret;
  return secret;
}

function rememberedSecret(): string {
  const holder = globalThis as { [MADE_IN_THIS_PROCESS]?: string };
  const secret = holder[MADE_IN_THIS_PROCESS] ?? makeRunSecret();
  holder[MADE_IN_THIS_PROCESS] = secret;
  return secret;
}

/**
 * The key the server counts every mint of the run under, computed here with the one digest function the server uses,
 * from the secret's bytes and the shared block: no network source is named, so every request is in that one bucket.
 */
export function bucketKeyOfTheRun(
  secretHex: string,
  policyName: PolicyName,
): string {
  return bucketKeyOfBlock(secretHex, policyName, SHARED_BLOCK);
}

/** The same key for any block: a server that names a network source counts each request under its own block. */
export function bucketKeyOfBlock(
  secretHex: string,
  policyName: PolicyName,
  block: NetworkBlock,
): string {
  return keyedDigest(Buffer.from(secretHex, "hex"), {
    purpose: "rate-limit-bucket",
    fields: {
      policyName,
      subjectKind: block.kind,
      subject: block.subject,
    },
  });
}

/** What a run's twin is called where a person is told it is outgrown: the policy, and the words the sentence needs. */
export interface TwinOfTheRun {
  readonly policy: LimitPolicy;
  readonly verb: string;
  readonly noun: string;
  /** How long the twin's window is, as the sentence says it: "a day", "an hour". */
  readonly perWindow: string;
  /** The constant a person raises. */
  readonly figureConstant: string;
}

export const MINT_TWIN: TwinOfTheRun = {
  policy: E2E_MINT_POLICY,
  verb: "minted",
  noun: "designs",
  perWindow: "a day",
  figureConstant: "E2E_MINT_DAILY_FIGURE",
};

export const SHARE_WRITE_TWIN: TwinOfTheRun = {
  policy: E2E_SHARE_WRITE_POLICY,
  verb: "made",
  noun: "share writes",
  perWindow: "an hour",
  figureConstant: "E2E_SHARE_WRITES_PER_BLOCK_FIGURE",
};

export interface CountersOfTheRun {
  readonly rowsRemoved: number;
  /** The hits the run counted under the key: every one it made, summed over the windows it spanned. */
  readonly hitsCounted: number;
}

/**
 * Removes the run's counter rows of one policy, through the guarded test helper and by the one key computed above,
 * and answers how many hits they counted. A run that made none finds none, which is not a failure here.
 */
export async function removeCountersOf(
  secretHex: string,
  policyName: PolicyName,
): Promise<CountersOfTheRun> {
  const removed = await deleteRateLimitCountersForTests([
    bucketKeyOfTheRun(secretHex, policyName),
  ]);
  return {
    rowsRemoved: removed.rowsRemoved,
    hitsCounted: removed.counts.reduce((sum, count) => sum + count, 0),
  };
}

/**
 * The mints' rows, the same removal with one more rule: finding no row is a failure, since every run mints, and a key
 * computed wrongly would otherwise leave rows behind and report nothing.
 */
export async function removeCountersOfTheRun(
  secretHex: string,
  policyName: PolicyName,
): Promise<{ readonly rowsRemoved: number; readonly mintsCounted: number }> {
  const removed = await removeCountersOf(secretHex, policyName);
  if (removed.rowsRemoved === 0) throw new NoCountersOfTheRunError();
  return {
    rowsRemoved: removed.rowsRemoved,
    mintsCounted: removed.hitsCounted,
  };
}

/** More than half of a twin's figure is room the suite has used up: the figure is raised by a person. */
export function requireRoomUnderHalfTheFigure(
  twin: TwinOfTheRun,
  hitsCounted: number,
): void {
  const halfTheFigure = twin.policy.figure / 2;
  if (hitsCounted > halfTheFigure) {
    throw new E2eFigureOutgrownError(twin, hitsCounted);
  }
}

/** The run made more than half of a twin's window. Names the policy, two counts of tests and no secret. */
export class E2eFigureOutgrownError extends Error {
  readonly policyName: PolicyName;

  constructor(twin: TwinOfTheRun, hitsCounted: number) {
    super(
      `This run ${twin.verb} ${String(hitsCounted)} ${twin.noun}, more than half ` +
        `(${String(twin.policy.figure / 2)}) of the e2e policy's ${String(twin.policy.figure)} ${twin.perWindow}: ` +
        `raise ${twin.figureConstant} to three times the new figure, rounded up to the next hundred`,
    );
    this.name = "E2eFigureOutgrownError";
    this.policyName = twin.policy.name;
  }
}

/** The run's counter rows could not be found, so either nothing was minted or the key is not the server's. */
export class NoCountersOfTheRunError extends Error {
  constructor() {
    super(
      "The run's rate-limit counters could not be found: no design was minted, " +
        "or the harness computes a key the server does not",
    );
    this.name = "NoCountersOfTheRunError";
  }
}
