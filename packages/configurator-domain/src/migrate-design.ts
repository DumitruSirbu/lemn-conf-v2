import type { Design } from "./design.js";
import { DesignSchema } from "./design.js";
import { KITCHEN_L_BODY_CATALOG } from "./fixtures/kitchen-l-design.js";
import { InvalidDesignError } from "./repository.js";
import { describeSchemaIssues } from "./failure-text.js";
import { assertDesignValidForCatalog } from "./validate-design.js";
import type { BodyCatalog } from "./void-engine.js";

function migrateFromV1(raw: unknown): Design {
  const result = DesignSchema.safeParse(raw);
  // The *shape* of the failure, never `error.message`: that renders the whole tree, echoes an
  // unrecognised key verbatim, and grows with the row — and this error's message reaches a reader
  // of the share link through the load path's response.
  if (!result.success) {
    throw new InvalidDesignError(describeSchemaIssues(result.error.issues));
  }
  return result.data;
}

const MIGRATIONS: ReadonlyMap<number, (raw: unknown) => Design> = new Map([
  [1, migrateFromV1],
]);

/** Validates and migrates a stored payload to the current `Design` shape. There is exactly one
 *  schema version today, so this is validation-only, but the version-keyed lookup lets a future
 *  version 2 add a real migration step without changing this function's signature.
 *
 *  DOM-001: the wire shape is only half the answer, so a migrated document is then held to the same
 *  executable contract the API write path enforces. A stored row that names a body no catalogue
 *  entry covers is a handled `InvalidDesignError` here, rather than an `UnknownBodyError` thrown
 *  inside the client's hydration where nothing is left to catch it (AV-3 step 5).
 *
 *  The catalogue defaults to the one the product loads, so the persistence adapter keeps calling
 *  this with two arguments; an import seam holding a different catalogue passes its own. */
export function migrateDesign(
  schemaVersion: number,
  raw: unknown,
  catalog: BodyCatalog = KITCHEN_L_BODY_CATALOG,
): Design {
  const migrate = MIGRATIONS.get(schemaVersion);
  if (!migrate) {
    throw new InvalidDesignError(
      `unsupported schema version ${String(schemaVersion)}`,
    );
  }
  const design = migrate(raw);
  assertDesignValidForCatalog(design, catalog);
  return design;
}
