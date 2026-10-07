import { neon } from "@neondatabase/serverless";
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
