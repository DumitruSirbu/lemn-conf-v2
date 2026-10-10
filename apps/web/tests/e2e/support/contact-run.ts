import { createHash, randomInt, randomUUID } from "node:crypto";

import { countedFormOfAddress } from "@lemnaria/configurator-domain";
import {
  countContactSubmissionsForTests,
  deleteContactSubmissionsForTests,
  deleteRateLimitCountersForTests,
} from "@lemnaria/persistence";
import type { BrowserContext } from "@playwright/test";

import {
  subjectOfAddress,
  subjectOfStoredRequest,
  subjectOfVisitorHash,
  type BucketSubject,
} from "../../../src/lib/server/rate-limit/bucket-subject";
import {
  CONTACT_NEW_BY_ADDRESS_POLICY,
  CONTACT_NEW_BY_VISITOR_POLICY,
  CONTACT_TRIES_BY_REQUEST_POLICY,
  type LimitPolicy,
} from "../../../src/lib/server/rate-limit/limit-policy";
import { bucketKeyOfBlock, secretOfThisRun } from "./e2e-rate-limit-run";

/** The visitor cookie's name, which `visitor.ts` keeps to itself: the hash of its value is the browser's subject. */
export const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";

const MOLDOVAN_MOBILE_PREFIX = "06";
const MOLDOVAN_SUBSCRIBER_DIGITS_AFTER_PREFIX = 7;

/**
 * Everything one spec file wrote through the contact route, so that it can all be removed by what was written and
 * nothing else: the ids of its requests, those it sent again (whose tries were counted under their ids), the
 * addresses it counted, and the hashes of the visitors it was. Every id, address, name and phone is made here from a
 * random value, so no two runs and no two specs share one.
 */
export interface ContactRun {
  readonly requestIds: string[];
  readonly storedIds: string[];
  readonly replayedIds: string[];
  readonly addresses: string[];
  readonly visitorHashes: string[];
}

export function startContactRun(): ContactRun {
  return {
    requestIds: [],
    storedIds: [],
    replayedIds: [],
    addresses: [],
    visitorHashes: [],
  };
}

/** A request id of the schema's shape, remembered before it is sent so that a failing test still cleans up. */
export function newRequestId(run: ContactRun): string {
  const id = `e2e-${randomUUID()}`;
  run.requestIds.push(id);
  return id;
}

/** Remembers that a stored request is sent again, which is what counts a try under its id. */
export function noteReplayOf(run: ContactRun, clientRequestId: string): void {
  run.replayedIds.push(clientRequestId);
}

/** An address in mixed case, so that what is removed is what the server counted in its lower-case counted form. */
export function newAddress(run: ContactRun): string {
  const address = `E2E-${randomUUID()}@Example.invalid`;
  run.addresses.push(address);
  return address;
}

export function newName(): string {
  return `E2E ${randomUUID().slice(0, 8)}`;
}

/** A Moldovan mobile number written the way a person types it: a zero, a six and seven digits chosen at random. */
export function newPhone(): string {
  const subscriber = Array.from(
    { length: MOLDOVAN_SUBSCRIBER_DIGITS_AFTER_PREFIX },
    () => String(randomInt(0, 10)),
  ).join("");
  return `${MOLDOVAN_MOBILE_PREFIX}${subscriber}`;
}

/** Remembers the visitor the browser has become, from its cookie, which only a mint sets. */
export async function noteVisitorOf(
  run: ContactRun,
  context: BrowserContext,
): Promise<void> {
  const cookies = await context.cookies();
  const visitor = cookies.find(({ name }) => name === VISITOR_COOKIE_NAME);
  if (visitor === undefined) {
    throw new Error("The browser holds no visitor cookie: nothing minted it");
  }
  run.visitorHashes.push(hashOfVisitorValue(visitor.value));
}

export function hashOfVisitorValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Counts the request's row in the database and remembers that it is one the spec expects to remove. */
export async function expectStoredOnce(
  run: ContactRun,
  clientRequestId: string,
): Promise<number> {
  const stored = await countContactSubmissionsForTests([clientRequestId]);
  if (stored > 0) run.storedIds.push(clientRequestId);
  return stored;
}

/** The key a subject is counted under by a policy, computed with the server's own digest from the run's secret. */
function keyOf(policy: LimitPolicy, subject: BucketSubject): string {
  return bucketKeyOfBlock(secretOfThisRun(), policy.name, subject);
}

export function triesKeyOf(clientRequestId: string): string {
  return keyOf(
    CONTACT_TRIES_BY_REQUEST_POLICY,
    subjectOfStoredRequest(clientRequestId),
  );
}

export function visitorKeyOf(visitorHash: string): string {
  return keyOf(
    CONTACT_NEW_BY_VISITOR_POLICY,
    subjectOfVisitorHash(visitorHash),
  );
}

export function addressKeyOf(address: string): string {
  return keyOf(
    CONTACT_NEW_BY_ADDRESS_POLICY,
    subjectOfAddress(countedFormOfAddress(address)),
  );
}

/** What was removed, so that a spec can say a key it computed was the server's and that it left nothing behind. */
export interface ContactRunRemoval {
  readonly requestRows: number;
  readonly triesRows: number;
  readonly visitorRows: number;
  readonly addressRows: number;
  readonly requestRowsLeft: number;
}

/**
 * Removes the run's counter rows by the keys computed above and its requests by the ids it wrote, through the two
 * guarded test-only functions, and counts again what is left by those ids. The network's three buckets are the whole
 * run's, removed and measured by the teardown.
 */
export async function removeContactRun(
  run: ContactRun,
): Promise<ContactRunRemoval> {
  const tries = await deleteRateLimitCountersForTests(
    run.replayedIds.map(triesKeyOf),
  );
  const visitors = await deleteRateLimitCountersForTests(
    run.visitorHashes.map(visitorKeyOf),
  );
  const addresses = await deleteRateLimitCountersForTests(
    run.addresses.map(addressKeyOf),
  );
  const requestRows = await deleteContactSubmissionsForTests(run.requestIds);
  return {
    requestRows,
    triesRows: tries.rowsRemoved,
    visitorRows: visitors.rowsRemoved,
    addressRows: addresses.rowsRemoved,
    requestRowsLeft: await countContactSubmissionsForTests(run.requestIds),
  };
}
