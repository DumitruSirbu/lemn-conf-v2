import {
  isPresetShape,
  isPresetThumbnailType,
} from "@lemnaria/configurator-domain";

import { generateDesignId } from "./generate-design-id.js";
import { reducedCauseOf } from "./migration-errors.js";
import { openApplicationDatabase } from "./open-application-database.js";
import {
  insertUnlessHeldStatement,
  selectPublishedImageStatement,
  selectPublishedNearStatement,
  selectPublishedStatement,
} from "./preset-statements.js";
import { PresetRepositoryError } from "./preset-repository.js";
import type {
  PresetImageLookup,
  PresetListing,
  PresetLookup,
  PresetNeighbourhood,
  PresetOperation,
  PresetRepository,
  PresetShape,
  PresetThumbnailType,
  PresetToRecord,
  PresetWalls,
  StoredPreset,
} from "./preset-repository.js";
import {
  isPresetId,
  requireValidPresetNeighbourhood,
  requireValidPresetToRecord,
} from "./preset-validation.js";
import { readablePresetOf } from "./readable-preset.js";
import type { PresetFields } from "./readable-preset.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";

interface RecordedRow {
  readonly is_recorded: boolean;
}

/** A listed row. Wall columns are `null` where the shape has no such wall. */
interface PresetRow {
  readonly id: string;
  readonly shape: PresetShape;
  readonly wall_a_mm: number;
  readonly wall_b_mm: number | null;
  readonly wall_c_mm: number | null;
  readonly height_mm: number;
  readonly schema_version: number;
  readonly design_document: object;
  readonly typed_name: string | null;
  readonly thumbnail_type: PresetThumbnailType;
}

interface ImageRow {
  readonly thumbnail_hex: string;
  readonly thumbnail_type: PresetThumbnailType;
}

const PRESET_ROW_KEYS = [
  "id",
  "shape",
  "wall_a_mm",
  "wall_b_mm",
  "wall_c_mm",
  "height_mm",
  "schema_version",
  "design_document",
  "typed_name",
  "thumbnail_type",
];

const IMAGE_ROW_KEYS = ["thumbnail_hex", "thumbnail_type"];

const EVEN_LENGTH_LOWERCASE_HEX = /^(?:[0-9a-f]{2})+$/;

/**
 * `PresetRepository` on Neon Postgres, in `presets` (migration `0011`). Every query is a tagged-template `sql`, which
 * parameterises values; every read adds `status = 'published'` and a schema version this build can read. The
 * statements are those of `preset-statements.ts`. It logs nothing.
 */
export class NeonPresetRepository implements PresetRepository {
  private readonly sql;

  /** `connectionUrl` defaults to `DATABASE_URL`; only the live tests pass it, to target their own database. */
  constructor(connectionUrl?: string) {
    this.sql = openApplicationDatabase(connectionUrl);
  }

  /**
   * One statement. The id is made before the retried callback and stays there: a fresh id per retry would publish a
   * second row when only an acknowledgement was lost (ADR 0145). An id held by another preset reads as not recorded and
   * is the repository error.
   */
  async record(preset: PresetToRecord): Promise<{ readonly id: string }> {
    const documentJson = requireValidPresetToRecord(preset);
    const id = generateDesignId();
    const rows = await this.queryRows("record a preset", () =>
      insertUnlessHeldStatement(this.sql, id, preset, documentJson),
    );
    if (!isRecorded(rows)) throw new PresetRepositoryError("record a preset");
    return { id };
  }

  /**
   * The rows the window matches, newest first, read as presets. A row whose document this build cannot migrate is
   * counted and dropped, so one bad row never takes Step 1 away from every room near it. The limit applies before the
   * drop, so a listing can hold fewer than `limit` presets while more matching ones exist.
   */
  async listPublishedNear(
    neighbourhood: PresetNeighbourhood,
  ): Promise<PresetListing> {
    requireValidPresetNeighbourhood(neighbourhood);
    const rows = await this.queryRows("list published presets", () =>
      selectPublishedNearStatement(this.sql, neighbourhood),
    );
    const readable = rows
      .map((row) => readablePresetOf(fieldsOf(row, "list published presets")))
      .filter((preset): preset is StoredPreset => preset !== undefined);
    return {
      presets: readable,
      unreadableCount: rows.length - readable.length,
    };
  }

  async loadPublished(id: string): Promise<PresetLookup> {
    if (!isPresetId(id)) return { kind: "none" };
    const rows = await this.queryRows("load a published preset", () =>
      selectPublishedStatement(this.sql, id),
    );
    const [row, ...others] = rows;
    if (row === undefined) return { kind: "none" };
    if (others.length > 0) {
      throw new PresetRepositoryError("load a published preset");
    }
    const preset = readablePresetOf(fieldsOf(row, "load a published preset"));
    return preset === undefined ? { kind: "none" } : { kind: "found", preset };
  }

  async loadPublishedImage(id: string): Promise<PresetImageLookup> {
    if (!isPresetId(id)) return { kind: "none" };
    const operation = "load a published preset's image";
    const rows = await this.queryRows(operation, () =>
      selectPublishedImageStatement(this.sql, id),
    );
    const [row, ...others] = rows;
    if (row === undefined) return { kind: "none" };
    if (others.length > 0 || !isImageRow(row)) {
      throw new PresetRepositoryError(operation);
    }
    return {
      kind: "found",
      bytes: new Uint8Array(Buffer.from(row.thumbnail_hex, "hex")),
      type: row.thumbnail_type,
    };
  }

  /** The rows of a statement, copied in one guarded step, or the repository error holding a built cause: nothing the
   *  driver threw or answered leaves this module (ADR 0146 B3). */
  private async queryRows(
    operation: PresetOperation,
    runQuery: () => Promise<unknown>,
  ): Promise<object[]> {
    let reply: unknown;
    try {
      reply = await retryOnTransientFailure(runQuery);
    } catch (failure) {
      throw new PresetRepositoryError(operation, reducedCauseOf(failure));
    }
    return copiedRowsOf(reply, operation);
  }
}

function copiedRowsOf(reply: unknown, operation: PresetOperation): object[] {
  try {
    if (Array.isArray(reply) && reply.every(isObject)) {
      return Array.from(reply, (row) => ({ ...row }));
    }
  } catch {
    // A row that throws when read is no answer; refused below.
  }
  throw new PresetRepositoryError(operation);
}

function isRecorded(rows: readonly object[]): boolean {
  const [row, ...others] = rows;
  return (
    row !== undefined &&
    others.length === 0 &&
    isRecordedRow(row) &&
    row.is_recorded
  );
}

/** A row that is not the shape the statement names is no trustworthy answer, and throws; a row of the right shape whose
 *  document cannot be read is a different thing, and `readablePresetOf` drops it. */
function fieldsOf(row: object, operation: PresetOperation): PresetFields {
  if (!isPresetRow(row)) throw new PresetRepositoryError(operation);
  return {
    id: row.id,
    shape: row.shape,
    walls: wallsOf(row),
    heightMm: row.height_mm,
    schemaVersion: row.schema_version,
    document: row.design_document,
    typedName: row.typed_name,
    thumbnailType: row.thumbnail_type,
  };
}

function wallsOf(row: PresetRow): PresetWalls {
  return {
    aMm: row.wall_a_mm,
    ...(row.wall_b_mm === null ? {} : { bMm: row.wall_b_mm }),
    ...(row.wall_c_mm === null ? {} : { cMm: row.wall_c_mm }),
  };
}

function isRecordedRow(row: object): row is RecordedRow {
  return (
    hasExactlyKeys(row, ["is_recorded"]) &&
    typeof (row as RecordedRow).is_recorded === "boolean"
  );
}

function isPresetRow(row: object): row is PresetRow {
  const candidate = row as PresetRow;
  return (
    hasExactlyKeys(row, PRESET_ROW_KEYS) &&
    isPresetId(candidate.id) &&
    isPresetShape(candidate.shape) &&
    Number.isInteger(candidate.wall_a_mm) &&
    isIntegerOrNull(candidate.wall_b_mm) &&
    isIntegerOrNull(candidate.wall_c_mm) &&
    Number.isInteger(candidate.height_mm) &&
    Number.isInteger(candidate.schema_version) &&
    isObject(candidate.design_document) &&
    (candidate.typed_name === null ||
      typeof candidate.typed_name === "string") &&
    isPresetThumbnailType(candidate.thumbnail_type)
  );
}

function isImageRow(row: object): row is ImageRow {
  const candidate = row as ImageRow;
  return (
    hasExactlyKeys(row, IMAGE_ROW_KEYS) &&
    typeof candidate.thumbnail_hex === "string" &&
    EVEN_LENGTH_LOWERCASE_HEX.test(candidate.thumbnail_hex) &&
    isPresetThumbnailType(candidate.thumbnail_type)
  );
}

function isIntegerOrNull(value: unknown): boolean {
  return value === null || Number.isInteger(value);
}

function hasExactlyKeys(row: object, keys: readonly string[]): boolean {
  return Object.keys(row).sort().join() === [...keys].sort().join();
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
