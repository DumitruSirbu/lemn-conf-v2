import { Client, NeonDbError, neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export type ConnectionVariableName =
  | "DATABASE_URL"
  | "MIGRATION_DATABASE_URL"
  | "TEST_DATABASE_URL";

/** The closed set of reasons an entry point refuses a string. Each has one constant sentence: nothing of the value is in
 *  it, and which class fired is all a reader learns. */
export type ConnectionRefusal = "shape" | "request header" | "session client";

const REFUSAL_SENTENCES: Readonly<Record<ConnectionRefusal, string>> = {
  shape:
    "is not a valid Postgres connection string: it must be a postgres:// or postgresql:// URL with a user, a host " +
    "and a database name.",
  "request header":
    "cannot be sent to the query endpoint: it holds a character an HTTP header cannot carry (a line break, a NUL " +
    "or a character above U+00FF), often from a pasted value that was wrapped.",
  "session client":
    "is not one the migration session client will build: it holds something that client refuses, such as a " +
    "sslrootcert=, sslcert= or sslkey= parameter.",
};

/**
 * A connection string an entry point refuses. Names the variable the value was read from, or says it was handed in
 * when no variable is given, and nothing about the value; it carries neither the refused string nor the error that
 * rejected it: the driver and Node's `ERR_INVALID_URL` both echo the whole string, password included.
 */
export class InvalidConnectionUrlError extends Error {
  readonly variableName: ConnectionVariableName | undefined;

  constructor(
    readFrom?: ConnectionVariableName,
    refusal: ConnectionRefusal = "shape",
  ) {
    super(
      `${readFrom ?? "The connection string handed in"} ${REFUSAL_SENTENCES[refusal]} Its value is deliberately ` +
        `not shown.`,
    );
    this.name = "InvalidConnectionUrlError";
    this.variableName = readFrom;
  }
}

/** Whether `error` is the driver's own error class. Asked here so the driver is imported in this file alone. */
export function isNeonDbError(error: unknown): error is NeonDbError {
  return error instanceof NeonDbError;
}

/**
 * The one place a Neon connection is opened for queries. `readFrom` names the variable the caller read `connectionUrl`
 * from and is omitted for a value the caller was handed: a refusal names only a variable the value came from. The
 * caller reads the value, so no variable can stand in for another.
 *
 * A string is refused exactly when a consumer of it refuses it, asked before the driver is: the driver's constructor,
 * and the request header it puts the raw string in. The header's refusal quotes the value.
 */
export function openDatabase(
  connectionUrl: string,
  readFrom?: ConnectionVariableName,
): NeonQueryFunction<false, false> {
  assertConnectionUrlShape(connectionUrl, readFrom);
  assertAnHttpHeaderCanCarry(connectionUrl, readFrom);
  try {
    return neon(connectionUrl);
  } catch {
    throw new InvalidConnectionUrlError(readFrom);
  }
}

/**
 * The session counterpart of {@link openDatabase}, for the migration runner: only a session can hold a lock across a
 * read and a write. Constructs the client and nothing else; connecting and ending stay with the caller.
 */
export function openDatabaseSession(
  connectionUrl: string,
  readFrom?: ConnectionVariableName,
): Client {
  assertConnectionUrlShape(connectionUrl, readFrom);
  try {
    return new Client(connectionUrl);
  } catch {
    throw new InvalidConnectionUrlError(readFrom, "session client");
  }
}

/**
 * `new URL` over a connection string, for a caller that compares or rewrites parts of it and so needs no more than a
 * parseable URL. Refuses an unparseable string as the opener does: Node's own error keeps the whole string on `input`.
 */
export function parseConnectionUrl(
  connectionUrl: string,
  readFrom?: ConnectionVariableName,
): URL {
  try {
    return new URL(connectionUrl);
  } catch {
    throw new InvalidConnectionUrlError(readFrom);
  }
}

/** The query driver sends the raw string in this header. `Headers` applies the rule `fetch` will, so what it refuses is
 *  refused here and not in an error that quotes the string. */
const CONNECTION_STRING_HEADER = "Neon-Connection-String";

function assertAnHttpHeaderCanCarry(
  connectionUrl: string,
  readFrom?: ConnectionVariableName,
): void {
  try {
    new Headers({ [CONNECTION_STRING_HEADER]: connectionUrl });
  } catch {
    throw new InvalidConnectionUrlError(readFrom, "request header");
  }
}

export function assertConnectionUrlShape(
  connectionUrl: string,
  readFrom?: ConnectionVariableName,
): void {
  if (!isTheAcceptedShape(connectionUrl))
    throw new InvalidConnectionUrlError(readFrom);
}

/**
 * Stricter than `@neondatabase/serverless@1.1.0`, which re-parses under `http:` and so takes a URL with no database or
 * with no `//` after the scheme, and which reads a name that other readers read differently (see
 * {@link agreedDatabaseNameOf}). Everything accepted here the driver also accepts, because the checks below are the
 * driver's own (two `URL`s, then percent-decoding the credentials and path): a value passed on never reaches its
 * error, which echoes the string.
 */
function isTheAcceptedShape(connectionUrl: string): boolean {
  try {
    const { protocol } = new URL(connectionUrl);
    const { username, password, hostname } = new URL(
      `http:${connectionUrl.substring(protocol.length)}`,
    );
    const decodedUsername = decodeURIComponent(username);
    decodeURIComponent(password);
    const databaseName = agreedDatabaseNameOf(connectionUrl);
    return (
      (protocol === "postgres:" || protocol === "postgresql:") &&
      connectionUrl.substring(protocol.length, protocol.length + 2) === "//" &&
      decodedUsername !== "" &&
      hostname !== "" &&
      databaseName !== NO_AGREED_DATABASE_NAME &&
      databaseName !== ""
    );
  } catch {
    return false;
  }
}

/** What {@link agreedDatabaseNameOf} answers when the readers do not give one name. Never a database's name. */
export const NO_AGREED_DATABASE_NAME =
  "<no database name every reader agrees on>";

/** The session driver's reading of the string, or that it refuses to build from it. */
type SessionReading =
  | { readonly kind: "name"; readonly name: unknown }
  | { readonly kind: "refused" };

function sessionDriverReads(connectionUrl: string): SessionReading {
  try {
    return { kind: "name", name: new Client(connectionUrl).database };
  } catch {
    return { kind: "refused" };
  }
}

/**
 * The database name a connection string names, or {@link NO_AGREED_DATABASE_NAME}. The readers that take the string
 * must give the same name: the string as written, the string as the HTTP driver re-reads it (under `http:`, decoded),
 * and the session driver, asked by constructing its client (which connects to nothing). A reader that refuses the
 * string does not disagree, since it cannot be the one that connects. A string on which the readers differ, whatever
 * made them differ (a `\` the HTTP reading takes as `/`, an escape), has no name, and every caller refuses it: this
 * package would otherwise compare one database while a driver connects to another.
 */
export function agreedDatabaseNameOf(connectionUrl: string): string {
  try {
    const { protocol, pathname } = new URL(connectionUrl);
    const asWritten = pathname.replace(/^\//, "");
    const reparsed = new URL(
      `http:${connectionUrl.substring(protocol.length)}`,
    );
    const asTheHttpDriverReads = decodeURIComponent(reparsed.pathname).replace(
      /^\//,
      "",
    );
    const session = sessionDriverReads(connectionUrl);
    const sessionAgrees =
      session.kind === "refused" || session.name === asWritten;
    return asWritten === asTheHttpDriverReads && sessionAgrees
      ? asWritten
      : NO_AGREED_DATABASE_NAME;
  } catch {
    return NO_AGREED_DATABASE_NAME;
  }
}

/**
 * The database a connection string names, for comparison only; re-exported by `migrate.ts`. Never print it: a name is
 * shown only through `printListedDatabaseName` or `printReachedDatabaseName` (`migration-target.ts`). It is the name
 * {@link agreedDatabaseNameOf} gives, or a placeholder no environment lists: {@link NO_AGREED_DATABASE_NAME} when the
 * readers differ.
 *
 * Never throws: `new URL` on a malformed string raises `ERR_INVALID_URL`, which carries the whole input, password
 * included, where Node's uncaught-exception printer emits it. A scheme other than `postgres:`/`postgresql:`, or no `//`
 * authority, gets a placeholder before any name is read. Without the authority (`postgres:/user:pw@host/db`) the URL
 * parses with an empty host and a `pathname` holding the credential, which would be returned as the name and could
 * pass `assertDeclaredEnvironmentReaches` as an unclaimed name while the driver reaches a listed environment.
 */
export function databaseNameOf(connectionUrl: string): string {
  try {
    const url = new URL(connectionUrl);
    if (!hasTrustedPostgresAuthority(url)) return UNTRUSTED_CONNECTION_SHAPE;
    return agreedDatabaseNameOf(connectionUrl);
  } catch {
    return UNPARSEABLE_DATABASE_NAME;
  }
}

/** Exactly `postgres:` or `postgresql:` with a non-empty host; a URL failing either test is never trusted to say what
 *  it names (see `databaseNameOf`). */
function hasTrustedPostgresAuthority(url: URL): boolean {
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    return false;
  return url.host !== "";
}

/** `databaseNameOf`'s answer for a string that does not parse. */
export const UNPARSEABLE_DATABASE_NAME = "<unparseable connection string>";

/** `databaseNameOf`'s answer for a URL that parses but is not a `postgres:`/`postgresql:` URL with a host. */
export const UNTRUSTED_CONNECTION_SHAPE =
  "<connection string is not a postgres:// or postgresql:// URL with a host>";
