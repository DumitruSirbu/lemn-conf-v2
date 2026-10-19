import { CURRENT_SCHEMA_VERSION } from "@lemnaria/configurator-domain";

import { generateDesignId } from "./generate-design-id.js";
import type {
  PresetImageLookup,
  PresetListing,
  PresetLookup,
  PresetNeighbourhood,
  PresetRepository,
  PresetShape,
  PresetStatus,
  PresetThumbnailType,
  PresetToRecord,
  PresetWalls,
  StoredPreset,
} from "./preset-repository.js";
import {
  isPresetId,
  isWithinWindow,
  requireValidPresetNeighbourhood,
  requireValidPresetToRecord,
} from "./preset-validation.js";
import { readablePresetOf } from "./readable-preset.js";

/** What the fake holds for one preset, for a test to read. The Neon repository has no such reading. */
export interface HeldPreset {
  readonly id: string;
  readonly shape: PresetShape;
  readonly walls: PresetWalls;
  readonly heightMm: number;
  readonly schemaVersion: number;
  readonly document: string;
  readonly typedName?: string;
  readonly thumbnail: Uint8Array;
  readonly thumbnailType: PresetThumbnailType;
  readonly status: PresetStatus;
}

/**
 * In-memory `PresetRepository` for tests that need the port's contract without a database. It refuses what the shared
 * checks refuse, answers published rows this build can read only, and orders a listing newest first. It cannot stand
 * for any refusal of a server beyond those, nor for how the driver carries bytes.
 */
export class FakePresetRepository implements PresetRepository {
  /** Oldest first, so the newest is the last: the table's `created_at` order without a clock. */
  private readonly presetsOldestFirst: HeldPreset[] = [];

  // eslint-disable-next-line @typescript-eslint/require-await -- a refusal rejects, as the Neon repository's does.
  async record(preset: PresetToRecord): Promise<{ readonly id: string }> {
    const document = requireValidPresetToRecord(preset);
    const id = generateDesignId();
    this.presetsOldestFirst.push({
      id,
      shape: preset.shape,
      walls: { ...preset.walls },
      heightMm: preset.heightMm,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      document,
      ...(preset.typedName === undefined
        ? {}
        : { typedName: preset.typedName }),
      thumbnail: Uint8Array.from(preset.thumbnail),
      thumbnailType: preset.thumbnailType,
      status: "published",
    });
    return { id };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see record.
  async listPublishedNear(
    neighbourhood: PresetNeighbourhood,
  ): Promise<PresetListing> {
    requireValidPresetNeighbourhood(neighbourhood);
    const matching = this.publishedNewestFirst()
      .filter(
        (held) =>
          held.shape === neighbourhood.shape &&
          isWithinWindow(
            held.walls,
            neighbourhood.walls,
            neighbourhood.windowMm,
          ),
      )
      .slice(0, neighbourhood.limit);
    const readable = matching
      .map(storedPresetOf)
      .filter((preset): preset is StoredPreset => preset !== undefined);
    return {
      presets: readable,
      unreadableCount: matching.length - readable.length,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see record.
  async loadPublished(id: string): Promise<PresetLookup> {
    const held = this.publishedWithId(id);
    const preset = held === undefined ? undefined : storedPresetOf(held);
    return preset === undefined ? { kind: "none" } : { kind: "found", preset };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see record.
  async loadPublishedImage(id: string): Promise<PresetImageLookup> {
    const held = this.publishedWithId(id);
    if (held === undefined) return { kind: "none" };
    return {
      kind: "found",
      bytes: Uint8Array.from(held.thumbnail),
      type: held.thumbnailType,
    };
  }

  /** Test support only, standing for the owner's hiding by hand in the console: the port has no hide. */
  hide(id: string): void {
    const index = this.presetsOldestFirst.findIndex((held) => held.id === id);
    const held = this.presetsOldestFirst[index];
    if (held !== undefined) {
      this.presetsOldestFirst[index] = { ...held, status: "hidden" };
    }
  }

  /** Copies, so a test cannot change what the fake holds through what it read. Oldest first, hidden rows included. */
  heldPresets(): readonly HeldPreset[] {
    return this.presetsOldestFirst.map((held) => ({
      ...held,
      walls: { ...held.walls },
      thumbnail: Uint8Array.from(held.thumbnail),
    }));
  }

  private publishedNewestFirst(): HeldPreset[] {
    return this.presetsOldestFirst
      .filter(
        (held) =>
          held.status === "published" &&
          held.schemaVersion <= CURRENT_SCHEMA_VERSION,
      )
      .reverse();
  }

  private publishedWithId(id: string): HeldPreset | undefined {
    if (!isPresetId(id)) return undefined;
    return this.publishedNewestFirst().find((held) => held.id === id);
  }
}

function storedPresetOf(held: HeldPreset): StoredPreset | undefined {
  return readablePresetOf({
    id: held.id,
    shape: held.shape,
    walls: held.walls,
    heightMm: held.heightMm,
    schemaVersion: held.schemaVersion,
    document: JSON.parse(held.document),
    typedName: held.typedName,
    thumbnailType: held.thumbnailType,
  });
}
