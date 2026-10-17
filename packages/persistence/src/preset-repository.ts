import type { Design } from "@lemnaria/configurator-domain";

export type PresetOperation =
  | "record a preset"
  | "list published presets"
  | "load a published preset"
  | "load a published preset's image";

export type PresetShape = "L" | "linear" | "U";

/** `published` is the default; `hidden` is set by the owner by hand and is never read back by the application. */
export type PresetStatus = "published" | "hidden";

export type PresetThumbnailType = "image/webp" | "image/png" | "image/jpeg";

/** The walls of the room a preset was saved in, or of the room Step 1 asks about. Wall B belongs to an `L` and a `U`,
 *  wall C to a `U` alone, as `DesignRoomSchema` has them; a `linear` room has wall A only. */
export interface PresetWalls {
  readonly aMm: number;
  readonly bMm?: number;
  readonly cMm?: number;
}

/** One kitchen to keep. `design` is the stored design as this build reads it, so it is written at
 *  `CURRENT_SCHEMA_VERSION`. The preset carries no design id: it does not depend on the private design it came from. */
export interface PresetToRecord {
  readonly shape: PresetShape;
  readonly walls: PresetWalls;
  readonly heightMm: number;
  readonly design: Design;
  /** The one name the owner typed, 1 to 80 characters. Absent means the name is generated when it is shown. */
  readonly typedName?: string;
  readonly thumbnail: Uint8Array;
  readonly thumbnailType: PresetThumbnailType;
}

/** A published preset as a listing shows it: never its image bytes, and never a status or a design id. */
export interface StoredPreset {
  readonly id: string;
  readonly shape: PresetShape;
  readonly walls: PresetWalls;
  readonly heightMm: number;
  readonly typedName?: string;
  readonly thumbnailType: PresetThumbnailType;
  readonly design: Design;
}

/** What a listing answers: the presets it could read, and how many matching rows it could not (a document this build
 *  cannot migrate). The count is all it says about them: nothing of such a row is kept, so nothing can be logged. */
export interface PresetListing {
  readonly presets: readonly StoredPreset[];
  readonly unreadableCount: number;
}

/** The rooms a listing serves: those of `shape` whose every saved wall is within `windowMm` of `walls`, inclusive. */
export interface PresetNeighbourhood {
  readonly shape: PresetShape;
  readonly walls: PresetWalls;
  readonly windowMm: number;
  readonly limit: number;
}

export type PresetLookup =
  | { readonly kind: "found"; readonly preset: StoredPreset }
  | { readonly kind: "none" };

export type PresetImageLookup =
  | {
      readonly kind: "found";
      readonly bytes: Uint8Array;
      readonly type: PresetThumbnailType;
    }
  | { readonly kind: "none" };

/**
 * The owner's saved kitchens, in the `presets` table (migration `0011`). Insert-only and read-only by construction:
 * the application role holds `SELECT` there and `INSERT` on the named columns only, so nothing here updates, hides or deletes, and the owner
 * hides a preset by hand (the runbook). Every read answers for a `published` row only.
 */
export interface PresetRepository {
  /** Rejects with a refusal before any statement for a preset the table would refuse, and with
   *  `PresetRepositoryError` when the database gives no trustworthy answer. Answers the new preset's id. */
  record(preset: PresetToRecord): Promise<{ readonly id: string }>;
  /** Newest first, at most `limit` rows before any unreadable one is dropped. Rejects with a refusal for a
   *  neighbourhood whose walls do not fit its shape. */
  listPublishedNear(neighbourhood: PresetNeighbourhood): Promise<PresetListing>;
  /** A malformed id, and a row this build cannot read, match nothing. */
  loadPublished(id: string): Promise<PresetLookup>;
  /** The image alone, for the image route. A malformed id matches nothing. */
  loadPublishedImage(id: string): Promise<PresetImageLookup>;
}

/** The database refused, did not answer, or answered with something that is not what the statement names. Its
 *  `cause`, when present, is a `ReducedCause`, never the driver's own error (ADR 0146 B3). */
export class PresetRepositoryError extends Error {
  readonly operation: PresetOperation;

  constructor(operation: PresetOperation, options?: ErrorOptions) {
    super(
      `The preset repository could not ${operation}: the database gave no trustworthy answer.`,
      options,
    );
    this.name = "PresetRepositoryError";
    this.operation = operation;
  }
}
