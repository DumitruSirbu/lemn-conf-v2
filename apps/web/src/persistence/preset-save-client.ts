// The browser half of `POST /api/designs/{id}/preset` (ADR 0112 decisions 3 and 4, Amendment A). It sits beside
// `share-link-client.ts` for that file's reason: the write-token and visitor cookies are ambient, same-origin
// credentials, and nothing here reads, holds or logs either. Nor does it log the image: a request that fails is told
// to the dialog as one of a closed list of reasons and the body, the name and the image are never echoed.
import {
  PRESET_HAS_FINDINGS,
  PRESET_MINIMUM_NOT_MET,
  type DesignId,
} from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import {
  PAYLOAD_TOO_LARGE_STATUS,
  PRESET_IMAGE_REFUSED_CODE,
  PRESET_LIMIT_REACHED_CODE,
  PRESET_NAME_REFUSED_CODE,
  PRESET_STALE_CODE,
  PRESET_TOO_LARGE_CODE,
  SERVICE_UNAVAILABLE_STATUS,
} from "@/preset/preset-wire-contract";
import type { EncodedPresetImage } from "@/scene/capture-scene-image";

import { SAVE_LIMIT_REACHED_CODE } from "./design-request-errors";

/** What a save asks for. It names the revision the editor shows as saved and carries no document (ADR 0112 decision 3). */
export interface PresetSaveRequest {
  readonly designId: DesignId;
  readonly revision: DesignRevision;
  /** What the customer typed, or absent for the generated name. */
  readonly name: string | undefined;
  readonly image: EncodedPresetImage;
}

/** Why a save did not store a preset: a closed list, each one a message the dialog has in the owner's language. */
export type PresetRefusalReason =
  | "findings"
  | "missingSink"
  | "missingHob"
  | "missingSinkAndHob"
  | "stale"
  | "nameRefused"
  | "imageRefused"
  | "tooLarge"
  | "presetLimit"
  | "saveLimit"
  | "unavailable"
  | "failed";

export type PresetSaveOutcome =
  | { readonly kind: "saved" }
  | { readonly kind: "refused"; readonly reason: PresetRefusalReason };

/** Never rejects: a network that fails, a body that does not read and a status nobody planned for are all `failed`. */
export async function savePreset(
  request: PresetSaveRequest,
): Promise<PresetSaveOutcome> {
  try {
    const response = await fetch(
      `/api/designs/${encodeURIComponent(request.designId)}/preset`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revision: request.revision,
          ...(request.name === undefined ? {} : { name: request.name }),
          imageType: request.image.imageType,
          image: request.image.base64,
        }),
      },
    );
    return await outcomeOf(response);
  } catch {
    return refused("failed");
  }
}

async function outcomeOf(response: Response): Promise<PresetSaveOutcome> {
  if (response.ok) return { kind: "saved" };
  return refused(reasonOf(response.status, await readBody(response)));
}

interface RefusalBody {
  readonly code?: unknown;
  readonly missing?: unknown;
}

function reasonOf(status: number, body: RefusalBody): PresetRefusalReason {
  if (status === PAYLOAD_TOO_LARGE_STATUS) return "imageRefused";
  if (status === SERVICE_UNAVAILABLE_STATUS) return "unavailable";
  switch (body.code) {
    case PRESET_HAS_FINDINGS:
      return "findings";
    case PRESET_MINIMUM_NOT_MET:
      return missingPartsReason(body.missing);
    case PRESET_STALE_CODE:
      return "stale";
    case PRESET_NAME_REFUSED_CODE:
      return "nameRefused";
    case PRESET_IMAGE_REFUSED_CODE:
      return "imageRefused";
    case PRESET_TOO_LARGE_CODE:
      return "tooLarge";
    case PRESET_LIMIT_REACHED_CODE:
      return "presetLimit";
    case SAVE_LIMIT_REACHED_CODE:
      return "saveLimit";
    default:
      return "failed";
  }
}

function missingPartsReason(missing: unknown): PresetRefusalReason {
  const parts = Array.isArray(missing) ? (missing as unknown[]) : [];
  const lacksSink = parts.includes("sink");
  const lacksHob = parts.includes("hob");
  if (lacksSink && lacksHob) return "missingSinkAndHob";
  if (lacksSink) return "missingSink";
  return lacksHob ? "missingHob" : "failed";
}

async function readBody(response: Response): Promise<RefusalBody> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null ? body : {};
  } catch {
    return {};
  }
}

function refused(reason: PresetRefusalReason): PresetSaveOutcome {
  return { kind: "refused", reason };
}
