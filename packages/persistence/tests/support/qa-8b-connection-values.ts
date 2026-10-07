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
export const QA_CREDENTIAL_MARKERS: readonly string[] = [QA_PASSWORD, QA_USER];
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
  /** What must never show. The isolation guard's refusals name the host and port by design, so only credentials there.
   */
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
