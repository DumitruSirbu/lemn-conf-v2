import type { Design } from "./design.js";
import { DesignSchema } from "./design.js";
import { InvalidDesignError } from "./repository.js";

function migrateFromV1(raw: unknown): Design {
  const result = DesignSchema.safeParse(raw);
  if (!result.success) throw new InvalidDesignError(result.error.message);
  return result.data;
}

const MIGRATIONS: ReadonlyMap<number, (raw: unknown) => Design> = new Map([
  [1, migrateFromV1],
]);

/** Validates and migrates a stored payload to the current `Design` shape. There is exactly one
 *  schema version today, so this is validation-only, but the version-keyed lookup lets a future
 *  version 2 add a real migration step without changing this function's signature. */
export function migrateDesign(schemaVersion: number, raw: unknown): Design {
  const migrate = MIGRATIONS.get(schemaVersion);
  if (!migrate) {
    throw new InvalidDesignError(
      `unsupported schema version ${String(schemaVersion)}`,
    );
  }
  return migrate(raw);
}
