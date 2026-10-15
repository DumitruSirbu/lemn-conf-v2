import { inspect } from "node:util";

export const FAKE_PASSWORD = "FAKEPASSWORD_8B";
export const FAKE_USER = "fakeuser_8B";
export const FAKE_HOST = "fakehost-8b.invalid";
export const FAKE_MARKERS: readonly string[] = [
  FAKE_PASSWORD,
  FAKE_USER,
  FAKE_HOST,
];

const FAKE_DATABASE = "lemn-fake-db";
const FAKE_CREDENTIALS = `${FAKE_USER}:${FAKE_PASSWORD}`;

export interface FakeConnectionValue {
  readonly label: string;
  readonly value: string;
}

/** Values the driver, or Node's `URL`, rejects while echoing the whole string. */
export function refusedValuesFor(databaseName: string): FakeConnectionValue[] {
  return [
    {
      label: "bad percent-escape",
      value: `postgres://${FAKE_CREDENTIALS}%ZZ@${FAKE_HOST}/${databaseName}`,
    },
    {
      label: "missing host",
      value: `postgres://${FAKE_CREDENTIALS}@/${databaseName}`,
    },
    {
      label: "non-URL string",
      value: `${FAKE_PASSWORD} ${FAKE_HOST} not a url ${FAKE_USER}`,
    },
    {
      label: "bad port",
      value: `postgres://${FAKE_CREDENTIALS}@${FAKE_HOST}:notaport/${databaseName}`,
    },
    {
      label: "wrong scheme",
      value: `mysql://${FAKE_CREDENTIALS}@${FAKE_HOST}/${databaseName}`,
    },
  ];
}

/** Well-formed values the driver takes and then fails on at query time, with an error that is clean today. */
export function acceptedValuesFor(databaseName: string): FakeConnectionValue[] {
  return [
    {
      label: "empty password",
      value: `postgres://${FAKE_USER}:@${FAKE_HOST}/${databaseName}`,
    },
    {
      label: "well-formed, unreachable",
      value: wellFormedUnreachableValueFor(databaseName),
    },
  ];
}

export function wellFormedUnreachableValueFor(databaseName: string): string {
  return `postgres://${FAKE_CREDENTIALS}@${FAKE_HOST}/${databaseName}`;
}

export const REFUSED_VALUES = refusedValuesFor(FAKE_DATABASE);
export const ACCEPTED_VALUES = acceptedValuesFor(FAKE_DATABASE);
export const WELL_FORMED_UNREACHABLE_VALUE =
  wellFormedUnreachableValueFor(FAKE_DATABASE);

/**
 * Every place a logger or a catch block can read a marker from: `message`, `stack`, every own property (non-enumerable
 * included, nested objects too), each error on the `cause` chain by the same rules, and `util.inspect` at unlimited
 * depth. Returns `"<place>: <marker>"` entries, empty when the error is clean.
 */
export function markersFoundOn(
  error: unknown,
  markers: readonly string[] = FAKE_MARKERS,
): string[] {
  const found: string[] = [];
  for (const [place, text] of textSurfacesOf(error))
    for (const marker of markers)
      if (text.includes(marker)) found.push(`${place}: ${marker}`);
  return found;
}

function textSurfacesOf(error: unknown): [string, string][] {
  const surfaces: [string, string][] = [
    ["inspect(depth: null)", inspect(error, { depth: null, showHidden: true })],
    ["inspect()", inspect(error)],
  ];
  collectStrings(error, "error", new Set(), surfaces);
  return surfaces;
}

function collectStrings(
  value: unknown,
  place: string,
  seen: Set<object>,
  into: [string, string][],
): void {
  if (typeof value === "string") {
    into.push([place, value]);
    return;
  }
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  for (const key of Object.getOwnPropertyNames(value))
    collectStrings(
      (value as Record<string, unknown>)[key],
      `${place}.${key}`,
      seen,
      into,
    );
}
