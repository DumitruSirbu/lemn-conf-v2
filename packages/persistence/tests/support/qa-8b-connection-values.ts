import { vi } from "vitest";

import { markersFoundOn } from "./leaked-connection-markers.js";

/**
 * Adversarial QA of M8 wave 8B. Every value is a fake whose host ends in `.invalid` (RFC 6761: never resolves) or does
 * not parse at all, so no case here can reach a database.
 */
export const QA_PASSWORD = "FAKEPASSWORD_QA8B";
export const QA_USER = "fakeuser_QA8B";
export const QA_HOST = "fakehost-qa8b.invalid";
export const QA_MARKERS: readonly string[] = [QA_PASSWORD, QA_USER, QA_HOST];
export const QA_CREDENTIALS = `${QA_USER}:${QA_PASSWORD}`;

export const FAKE_DATABASE = "lemn-fake-db";
export const ALLOWLISTED_TEST_DATABASE = "lemnaria_test";
export const OTHER_APPLICATION_URL =
  "postgresql://appuser:apppw@app-host.invalid/appdb";

interface QaValue {
  readonly label: string;
  readonly value: string;
}

/** Shapes the wave's own seven-value table does not hold: each is a slip a person makes typing or pasting a URL. */
function malformedValuesFor(databaseName: string): QaValue[] {
  const wellFormed = `postgres://${QA_CREDENTIALS}@${QA_HOST}/${databaseName}`;
  return [
    {
      label: "no authority, one slash",
      value: `postgres:/${QA_CREDENTIALS}@${QA_HOST}/${databaseName}`,
    },
    {
      label: "no authority, no slash",
      value: `postgres:${QA_CREDENTIALS}@${QA_HOST}/${databaseName}`,
    },
    {
      label: "an unencoded slash in the password",
      value: `postgres://${QA_USER}:abc/${QA_PASSWORD}@${QA_HOST}/${databaseName}`,
    },
    {
      label: "digits then an unencoded slash in the password",
      value: `postgres://${QA_USER}:123/${QA_PASSWORD}@${QA_HOST}/${databaseName}`,
    },
    {
      label: "a password that starts with an unencoded slash",
      value: `postgres://${QA_USER}:/${QA_PASSWORD}@${QA_HOST}/${databaseName}`,
    },
    {
      label: "an unencoded hash in the password",
      value: `postgres://${QA_USER}:12#${QA_PASSWORD}@${QA_HOST}/${databaseName}`,
    },
    {
      label: "an unencoded question mark in the password",
      value: `postgres://${QA_USER}:12?${QA_PASSWORD}@${QA_HOST}/${databaseName}`,
    },
    {
      label: "a space in the host",
      value: `postgres://${QA_CREDENTIALS}@fake ${QA_HOST}/${databaseName}`,
    },
    {
      label: "an unterminated IPv6 host",
      value: `postgres://${QA_CREDENTIALS}@[${QA_HOST}/${databaseName}`,
    },
    {
      label: "no user",
      value: `postgres://:${QA_PASSWORD}@${QA_HOST}/${databaseName}`,
    },
    {
      label: "a bad percent-escape in the user",
      value: `postgres://${QA_USER}%ZZ:${QA_PASSWORD}@${QA_HOST}/${databaseName}`,
    },
    {
      label: "a port out of range",
      value: `postgres://${QA_CREDENTIALS}@${QA_HOST}:99999/${databaseName}`,
    },
    { label: "a JDBC prefix", value: `jdbc:${wellFormed}` },
    { label: "the quotes of an env file left on", value: `"${wellFormed}"` },
    { label: "a pasted assignment", value: `DATABASE_URL=${wellFormed}` },
    { label: "a pasted psql command", value: `psql '${wellFormed}'` },
  ];
}

/** Values the driver takes, which then fail at the query because the host never resolves. */
function unreachableValuesFor(databaseName: string): QaValue[] {
  return [
    {
      label: "an upper-case scheme and host",
      value: `POSTGRES://${QA_CREDENTIALS}@${QA_HOST.toUpperCase()}/${databaseName}`,
    },
    {
      label: "a trailing CRLF",
      value: `postgres://${QA_CREDENTIALS}@${QA_HOST}/${databaseName}\r\n`,
    },
    {
      label: "an unencoded @ in the password",
      value: `postgres://${QA_USER}:x@${QA_PASSWORD}@${QA_HOST}/${databaseName}`,
    },
    {
      label: "a password whose tail the driver reads as the database name",
      value: `postgres://${QA_USER}:x@${QA_HOST}:12/${QA_PASSWORD}`,
    },
    {
      label: "a percent-encoded password",
      value: `postgres://${QA_USER}:${QA_PASSWORD}%2F%40@${QA_HOST}/${databaseName}`,
    },
  ];
}

export function qaValuesFor(databaseName: string): QaValue[] {
  return [
    ...malformedValuesFor(databaseName),
    ...unreachableValuesFor(databaseName),
  ];
}

export async function errorRaisedBy(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

export interface Site {
  readonly name: string;
  readonly databaseName: string;
  /** What must never show. Rule B2: no host, port or name either, so every site takes all three markers. */
  readonly markers: readonly string[];
  readonly mustRaiseForEveryValue: boolean;
  readonly run: (value: string) => unknown;
}

export interface SiteSweep {
  readonly leaks: string[];
  readonly valuesThatRaisedNothing: string[];
}

export async function sweep(site: Site): Promise<SiteSweep> {
  const leaks: string[] = [];
  const valuesThatRaisedNothing: string[] = [];
  for (const { label, value } of qaValuesFor(site.databaseName)) {
    const error = await errorRaisedBy(() => site.run(value));
    vi.unstubAllEnvs();
    if (error === undefined) valuesThatRaisedNothing.push(label);
    for (const found of markersFoundOn(error, site.markers))
      leaks.push(`${label} -> ${found}`);
  }
  return { leaks, valuesThatRaisedNothing };
}

/**
 * Every string reachable from `value` by any read a caller can make: own properties under string and symbol keys,
 * enumerable or not, getters on every prototype, and the entries of a Map or Set. Wider than `markersFoundOn`, which
 * reads what `util.inspect` shows and so cannot see a prototype getter such as an `ErrorEvent`'s `target`.
 */
export function stringsReachableFrom(value: unknown): string[] {
  const found: string[] = [];
  collectReachable(value, new Set(), found);
  return found;
}

function collectReachable(
  value: unknown,
  seen: Set<object>,
  into: string[],
): void {
  if (typeof value === "string") into.push(value);
  if (!isWalkable(value) || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Map || value instanceof Set)
    for (const entry of value.entries()) collectReachable(entry, seen, into);
  for (const holder of prototypeChainOf(value))
    for (const key of Reflect.ownKeys(holder))
      collectReachable(readQuietly(value, key), seen, into);
}

function isWalkable(value: unknown): value is object {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
}

function prototypeChainOf(value: object): object[] {
  const chain: object[] = [];
  for (
    let holder: object | null = value;
    holder !== null &&
    holder !== Object.prototype &&
    holder !== Function.prototype;
    holder = Object.getPrototypeOf(holder) as object | null
  )
    chain.push(holder);
  return chain;
}

function readQuietly(value: object, key: string | symbol): unknown {
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

export function markersReachableFrom(
  value: unknown,
  markers: readonly string[],
): string[] {
  const lowerCased = stringsReachableFrom(value).map((text) =>
    text.toLowerCase(),
  );
  return markers.filter((marker) =>
    lowerCased.some((text) => text.includes(marker.toLowerCase())),
  );
}
