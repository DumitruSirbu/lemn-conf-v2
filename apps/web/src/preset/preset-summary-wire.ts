// What `GET /api/presets` answers, as the browser reads it (plan M8C section 3.5). It lives outside `lib/server` because
// the client bundle may not import a server-only module; the route builds it and Step 1 reads it.
import type { Design, PresetNameFacts } from "@lemnaria/configurator-domain";
import type { PresetShape, PresetWalls } from "@lemnaria/persistence";

export const PRESET_LIST_PATH = "/api/presets";

/** The address of one preset's image, served by `GET /api/presets/{id}/image`. Same-origin, so the page policy's
 *  `img-src 'self'` admits it. */
export function presetImagePath(presetId: string): string {
  return `${PRESET_LIST_PATH}/${presetId}/image`;
}

/**
 * One published preset as Step 1 is told of it. It carries the snapshot, because the room exists only in the browser
 * and the evaluation runs there, in the generation lease (plan section 3.5). It carries no status and no design id (a
 * preset has none), and its `design.presetId` is always `null`: the copy a customer makes names this preset itself.
 * `design.createdAt` and `design.updatedAt` are the owner's draft's, kept because the schema requires them.
 */
export interface PresetSummary {
  readonly id: string;
  readonly shape: PresetShape;
  readonly walls: PresetWalls;
  readonly heightMm: number;
  /** The one name the owner typed, shown verbatim; absent means the app renders the generated name from `nameFacts`. */
  readonly typedName?: string;
  readonly nameFacts: PresetNameFacts;
  readonly imageUrl: string;
  readonly design: Design;
}

export interface PresetListResponse {
  readonly presets: readonly PresetSummary[];
}
