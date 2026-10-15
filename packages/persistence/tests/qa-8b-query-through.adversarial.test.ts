import {
  Client,
  NeonDbError,
  neon,
  neonConfig,
} from "@neondatabase/serverless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../src/migrate.js";
import { MigrationExecutionError } from "../src/migration-errors.js";
import { openDatabase, openDatabaseSession } from "../src/open-database.js";
import { assertSafeTestDatabaseUrl } from "../src/test-database-url.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";
import {
  FAKE_DATABASE,
  QA_MARKERS,
  markersReachableFrom,
} from "./support/qa-8b-connection-values.js";
import {
  LISTED_NAMES,
  ODD_CHARACTERS,
  sweptValues,
} from "./support/qa-8b-swept-values.js";

/**
 * Every swept string an entry point accepts is then used: a query is sent with it, and a migration session is opened
 * with it. Only the socket is replaced. The request is still built by the runtime's own `Request`, and the session's
 * address by its own `URL`, so header and URL validation run, and their refusals quote what they were given.
 */
const SOCKET_REPLACED = "the socket was replaced by the test";
const A_QUERY_FAILS_ONLY_AT_THE_SOCKET = `Error connecting to database: TypeError: ${SOCKET_REPLACED}`;
const A_SESSION_FAILS_ONLY_AT_THE_CONNECT =
  /^Could not connect to "[^"]*" to run migrations\. No migration was attempted\.$/;

/** Builds the request as `fetch` would, then fails where the socket would have been opened. */
function fetchWithoutASocket(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<never> {
  new Request(input, init);
  return Promise.reject(new TypeError(SOCKET_REPLACED));
}

/** Reads its address as the runtime's `WebSocket` would, then reports an error where it would have connected. */
class WebSocketWithoutASocket extends EventTarget {
  readonly readyState = 3;
  binaryType = "arraybuffer";

  constructor(address: string) {
    super();
    new URL(address);
    queueMicrotask(() => this.dispatchEvent(new Event("error")));
  }

  /** Bytes the driver queues after the failure go nowhere, as on a socket that never opened. */
  send(): void {
    return;
  }

  close(): void {
    this.dispatchEvent(new Event("close"));
  }
}

const driverDefaults = {
  fetchFunction: neonConfig.fetchFunction as unknown,
  webSocketConstructor: neonConfig.webSocketConstructor,
};
const unhandledRejections: unknown[] = [];
const recordUnhandled = (reason: unknown): void => {
  unhandledRejections.push(reason);
};

beforeEach(() => {
  neonConfig.fetchFunction = fetchWithoutASocket;
  neonConfig.webSocketConstructor = WebSocketWithoutASocket;
  // The session socket falls back to the global `fetch` when its constructor throws, so that is replaced too.
  vi.stubGlobal("fetch", fetchWithoutASocket);
  unhandledRejections.length = 0;
  process.on("unhandledRejection", recordUnhandled);
});

afterEach(() => {
  process.off("unhandledRejection", recordUnhandled);
  vi.unstubAllGlobals();
  neonConfig.fetchFunction = driverDefaults.fetchFunction;
  neonConfig.webSocketConstructor = driverDefaults.webSocketConstructor;
});

function isAccepted(open: (value: string) => unknown, value: string): boolean {
  try {
    open(value);
    return true;
  } catch {
    return false;
  }
}

const NAMES_A_MESSAGE_MAY_PRINT: readonly string[] = [
  ...LISTED_NAMES,
  FAKE_DATABASE,
];
const SHORTEST_PART_WORTH_LOOKING_FOR = 5;

/** The whole string and each credential and host in it, as written and decoded: what must not come back out. */
function partsOf(value: string): string[] {
  return [value, value.trim(), ...credentialsAndHostOf(value), ...QA_MARKERS]
    .flatMap((part) => [part, decodedOrAsWritten(part)])
    .filter(
      (part) =>
        part.length >= SHORTEST_PART_WORTH_LOOKING_FOR &&
        !NAMES_A_MESSAGE_MAY_PRINT.includes(part),
    );
}

/** Read as the query driver reads them; none for a string that does not parse, whose whole text is still looked for. */
function credentialsAndHostOf(value: string): string[] {
  try {
    const { username, password, hostname } = new URL(
      `http:${value.substring(new URL(value).protocol.length)}`,
    );
    return [username, password, hostname];
  } catch {
    return [];
  }
}

function decodedOrAsWritten(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function shown(value: string): string {
  return JSON.stringify(value);
}

async function settled(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

/** What is wrong with the failure of a query sent with `value`, or nothing: it must be the replaced socket alone. */
async function faultsOfAQueryWith(value: string): Promise<string[]> {
  const error = await settled(() => openDatabase(value)`select 1`);
  const faults: string[] = [];
  if (!(error instanceof NeonDbError))
    faults.push(`threw ${String(error)}, not the driver's own error`);
  else if (error.message !== A_QUERY_FAILS_ONLY_AT_THE_SOCKET)
    faults.push(`failed before the socket: ${error.message}`);
  const parts = partsOf(value);
  for (const found of [
    ...markersReachableFrom(error, parts),
    ...markersFoundOn(error, parts),
  ])
    faults.push(`carries ${shown(found)}`);
  return faults.map((fault) => `${shown(value)} -> ${fault}`);
}

/** What is wrong with the failure of a session opened with `value`, or nothing: it must be the built connect failure.
 */
async function faultsOfASessionWith(value: string): Promise<string[]> {
  const error = await settled(() => applyMigrations(value, []));
  const faults: string[] = [];
  if (!(error instanceof MigrationExecutionError))
    faults.push(`threw ${String(error)}, not the connect failure`);
  else if (!A_SESSION_FAILS_ONLY_AT_THE_CONNECT.test(error.message))
    faults.push(`says something else: ${error.message}`);
  const parts = partsOf(value);
  for (const found of [
    ...markersReachableFrom(error, parts),
    ...markersFoundOn(error, parts),
  ])
    faults.push(`carries ${shown(found)}`);
  return faults.map((fault) => `${shown(value)} -> ${fault}`);
}

function faultsOfWhatWasThrown(value: string, thrown: unknown): string[] {
  const parts = partsOf(value);
  return [
    ...markersReachableFrom(thrown, parts),
    ...markersFoundOn(thrown, parts),
  ].map((found) => `${shown(value)} -> carries ${shown(found)}`);
}

/** The driver queried with no opener in between, as the live suites' ledger helpers do after the guard. */
async function faultsOfTheDriverQueriedDirectlyWith(
  value: string,
): Promise<string[]> {
  const error = await settled(() => neon(value)`select 1`);
  const faults = faultsOfWhatWasThrown(value, error);
  if (
    (error as Error | undefined)?.message !== A_QUERY_FAILS_ONLY_AT_THE_SOCKET
  )
    faults.push(
      `${shown(value)} -> failed before the socket: ${String(error)}`,
    );
  return faults;
}

/** The session client built and connected with no opener in between, as the live suites' schema lock does. */
async function faultsOfTheClientConnectedDirectlyWith(
  value: string,
): Promise<string[]> {
  const error = await settled(async () => {
    const client = new Client(value);
    client.on("error", () => undefined);
    await client.connect();
  });
  const faults = faultsOfWhatWasThrown(value, error);
  if (error === undefined)
    faults.push(`${shown(value)} -> connected through a replaced socket`);
  return faults;
}

interface UsedStrings {
  readonly used: string[];
  readonly faults: string[];
}

async function useEveryAcceptedString(
  open: (value: string) => unknown,
  faultsOf: (value: string) => Promise<string[]>,
): Promise<UsedStrings> {
  const used = sweptValues().filter((value) => isAccepted(open, value));
  const faults: string[] = [];
  for (const value of used) faults.push(...(await faultsOf(value)));
  await new Promise((resume) => setImmediate(resume));
  return { used, faults };
}

function holdsAnOddCharacter(value: string): boolean {
  return ODD_CHARACTERS.some((character) => value.includes(character));
}

describe("a query sent with every swept string the query entry point accepts", () => {
  it("fails only at the replaced socket and carries nothing of the string", async () => {
    const { used, faults } = await useEveryAcceptedString(
      openDatabase,
      faultsOfAQueryWith,
    );

    expect(faults).toEqual([]);
    expect(unhandledRejections).toEqual([]);
    expect(used.length).toBeGreaterThan(200);
    expect(used.filter(holdsAnOddCharacter).length).toBeGreaterThan(50);
  });
});

describe("a migration session opened with every swept string the session entry point accepts", () => {
  it("fails only at the connect, with the failure this package built, and carries nothing of the string", async () => {
    const { used, faults } = await useEveryAcceptedString(
      openDatabaseSession,
      faultsOfASessionWith,
    );

    expect(faults).toEqual([]);
    expect(unhandledRejections).toEqual([]);
    expect(used.length).toBeGreaterThan(200);
    expect(used.filter(holdsAnOddCharacter).length).toBeGreaterThan(50);
  });
});

function isAllowedByTheGuard(value: string): boolean {
  return isAccepted((url) => {
    assertSafeTestDatabaseUrl(url);
  }, value);
}

describe("every swept string the isolation guard allows, used in each way a live suite uses the test URL", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each<[string, (value: string) => Promise<string[]>]>([
    ["a query through the opener", faultsOfAQueryWith],
    ["a migration session through the opener", faultsOfASessionWith],
    ["a query with the driver directly", faultsOfTheDriverQueriedDirectlyWith],
    [
      "a session client connected directly",
      faultsOfTheClientConnectedDirectlyWith,
    ],
  ])("%s carries nothing of the string", async (_use, faultsOf) => {
    const { used, faults } = await useEveryAcceptedString(
      isAllowedByTheGuardOrThrow,
      faultsOf,
    );

    expect(faults).toEqual([]);
    expect(unhandledRejections).toEqual([]);
    expect(used.length).toBeGreaterThan(50);
    expect(used.filter(holdsAnOddCharacter).length).toBeGreaterThan(30);
  });

  it("allows nothing either entry point refuses", () => {
    const allowed = sweptValues().filter(isAllowedByTheGuard);

    expect(allowed.filter((value) => !isAccepted(openDatabase, value))).toEqual(
      [],
    );
    expect(
      allowed.filter((value) => !isAccepted(openDatabaseSession, value)),
    ).toEqual([]);
  });
});

function isAllowedByTheGuardOrThrow(value: string): void {
  assertSafeTestDatabaseUrl(value);
}

describe("the harness itself", () => {
  it("lets the runtime refuse a header it cannot carry, quoting it, when nothing refused the string first", () => {
    const init = { headers: { "Neon-Connection-String": "a\nb" } };

    expect(() => fetchWithoutASocket("https://api.invalid/sql", init)).toThrow(
      /invalid header value/,
    );
  });
});
