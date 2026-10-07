import { Client, neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export type ConnectionVariableName =
  | "DATABASE_URL"
  | "MIGRATION_DATABASE_URL"
  | "TEST_DATABASE_URL";

/**
 * A connection variable holds a value no Postgres driver accepts. Names the variable and nothing about the value, and
 * carries neither the refused string nor the error that rejected it: the driver and Node's `ERR_INVALID_URL` both
 * echo the whole string, password included.
 */
export class InvalidConnectionUrlError extends Error {
  readonly variableName: ConnectionVariableName;

  constructor(variableName: ConnectionVariableName) {
    super(
      `${variableName} is not a valid Postgres connection string: it must be a postgres:// or postgresql:// URL ` +
        `with a user, a host and a database name. Its value is deliberately not shown.`,
    );
    this.name = "InvalidConnectionUrlError";
    this.variableName = variableName;
  }
}

/**
 * The one place a Neon connection is opened. `variableName` only labels the refusal; the caller reads the value, so
 * no variable can stand in for another.
 */
export function openDatabase(
  connectionUrl: string,
  variableName: ConnectionVariableName,
): NeonQueryFunction<false, false> {
  assertConnectionUrlShape(connectionUrl, variableName);
  try {
    return neon(connectionUrl);
  } catch {
    throw new InvalidConnectionUrlError(variableName);
  }
}

/**
 * The session counterpart of {@link openDatabase}, for the migration runner: only a session can hold a lock across a
 * read and a write. Constructs the client and nothing else; connecting and ending stay with the caller.
 */
export function openDatabaseSession(
  connectionUrl: string,
  variableName: ConnectionVariableName,
): Client {
  assertConnectionUrlShape(connectionUrl, variableName);
  try {
    return new Client(connectionUrl);
  } catch {
    throw new InvalidConnectionUrlError(variableName);
  }
}

export function assertConnectionUrlShape(
  connectionUrl: string,
  variableName: ConnectionVariableName,
): void {
  if (!isAcceptedByTheDriver(connectionUrl))
    throw new InvalidConnectionUrlError(variableName);
}

// Parses as `@neondatabase/serverless@1.1.0` does (two `URL`s, then percent-decoding the credentials and path), so a
// value the driver takes passes and one it would reject, echoing the string, never reaches it.
function isAcceptedByTheDriver(connectionUrl: string): boolean {
  try {
    const { protocol } = new URL(connectionUrl);
    const { username, password, hostname, pathname } = new URL(
      `http:${connectionUrl.substring(protocol.length)}`,
    );
    const decodedUsername = decodeURIComponent(username);
    decodeURIComponent(password);
    const decodedPathname = decodeURIComponent(pathname);
    return (
      (protocol === "postgres:" || protocol === "postgresql:") &&
      decodedUsername !== "" &&
      hostname !== "" &&
      decodedPathname !== ""
    );
  } catch {
    return false;
  }
}

/**
 * The database a connection string names, and nothing else from it. Re-exported by `migrate.ts`. Exported so the no-credential-in-logs guarantee is
 * testable directly.
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
