import { Client, NeonDbError, neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export type ConnectionVariableName =
  | "DATABASE_URL"
  | "MIGRATION_DATABASE_URL"
  | "TEST_DATABASE_URL";

/**
 * A connection string is not the accepted shape. Names the variable the value was read from, or says it was handed in
 * when no variable is given, and nothing about the value; it carries neither the refused string nor the error that
 * rejected it: the driver and Node's `ERR_INVALID_URL` both echo the whole string, password included.
 */
export class InvalidConnectionUrlError extends Error {
  readonly variableName: ConnectionVariableName | undefined;

  constructor(readFrom?: ConnectionVariableName) {
    super(
      `${readFrom ?? "The connection string handed in"} is not a valid Postgres connection string: it must be a ` +
        `postgres:// or postgresql:// URL with a user, a host and a database name. Its value is deliberately not shown.`,
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
 * The one place a Neon connection is opened. `readFrom` names the variable the caller read `connectionUrl` from and is
 * omitted for a value the caller was handed: a refusal names only a variable the value came from. The caller reads the
 * value, so no variable can stand in for another.
 */
export function openDatabase(
  connectionUrl: string,
  readFrom?: ConnectionVariableName,
): NeonQueryFunction<false, false> {
  assertConnectionUrlShape(connectionUrl, readFrom);
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
    throw new InvalidConnectionUrlError(readFrom);
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

export function assertConnectionUrlShape(
  connectionUrl: string,
  readFrom?: ConnectionVariableName,
): void {
  if (!isTheAcceptedShape(connectionUrl))
    throw new InvalidConnectionUrlError(readFrom);
}

/**
 * Stricter than `@neondatabase/serverless@1.1.0`, which re-parses under `http:` and so takes a URL with no database or
 * with no `//` after the scheme. Everything accepted here the driver also accepts, because the checks below are the
 * driver's own (two `URL`s, then percent-decoding the credentials and path): a value passed on never reaches its
 * error, which echoes the string.
 */
function isTheAcceptedShape(connectionUrl: string): boolean {
  try {
    const { protocol } = new URL(connectionUrl);
    const { username, password, hostname, pathname } = new URL(
      `http:${connectionUrl.substring(protocol.length)}`,
    );
    const decodedUsername = decodeURIComponent(username);
    decodeURIComponent(password);
    const decodedDatabaseName = decodeURIComponent(pathname).replace(/^\//, "");
    return (
      (protocol === "postgres:" || protocol === "postgresql:") &&
      connectionUrl.substring(protocol.length, protocol.length + 2) === "//" &&
      decodedUsername !== "" &&
      hostname !== "" &&
      decodedDatabaseName !== ""
    );
  } catch {
    return false;
  }
}

/**
 * The path a connection string names, for comparison only; re-exported by `migrate.ts`. Never print it: a mistyped
 * string defines its own path, which can hold a credential (`postgres://u:1/pw@h/db` yields `pw@h/db`). A line shows
 * a name only through `printListedDatabaseName` or `printReachedDatabaseName` (`migration-target.ts`).
 *
 * Never throws: `new URL` on a malformed string raises `ERR_INVALID_URL`, which carries the whole input, password
 * included, where Node's uncaught-exception printer emits it. A scheme other than `postgres:`/`postgresql:`, or no `//`
 * authority, gets a placeholder before any pathname is read. Without the authority (`postgres:/user:pw@host/db`) the
 * URL parses with an empty host and a `pathname` holding the credential, which would be returned as the name and could
 * pass `assertDeclaredEnvironmentReaches` as an unclaimed name while the driver reaches a listed environment.
 *
 * The pathname stays percent-encoded and keeps any backslash: `assertDeclaredEnvironmentReaches` is the one place that
 * judges a raw `%` or `\`.
 */
export function databaseNameOf(connectionUrl: string): string {
  try {
    const url = new URL(connectionUrl);
    if (!hasTrustedPostgresAuthority(url)) return UNTRUSTED_CONNECTION_SHAPE;
    return url.pathname.replace(/^\//, "");
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

const UNPARSEABLE_DATABASE_NAME = "<unparseable connection string>";

/** `databaseNameOf`'s placeholder for a URL that parses but is not a `postgres:`/`postgresql:` URL with a host.
 *  Duplicated in `migration-target.ts`: importing it back would make an import cycle with this CLI file. */
const UNTRUSTED_CONNECTION_SHAPE =
  "<connection string is not a postgres:// or postgresql:// URL with a host>";
