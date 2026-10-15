import type { NeonQueryFunction } from "@neondatabase/serverless";

import { openDatabase } from "./open-database.js";
import { readDatabaseUrl } from "./read-database-url.js";

/**
 * The application's connection: `connectionUrl` when the caller hands one in (only the live tests do), else
 * `DATABASE_URL`. A refusal names `DATABASE_URL` only for the value read from it. Resolved per call, so a missing
 * variable surfaces where the caller can catch it.
 */
export function openApplicationDatabase(
  connectionUrl?: string,
): NeonQueryFunction<false, false> {
  return connectionUrl === undefined
    ? openDatabase(readDatabaseUrl(), "DATABASE_URL")
    : openDatabase(connectionUrl);
}
