import "server-only";

import type { PresetRefusal } from "@lemnaria/configurator-domain";
import { NextResponse } from "next/server";

import { PER_CREDENTIAL_HEADERS } from "@/lib/server/design-errors";
import { reportDesignRefusal } from "@/lib/server/design-failure-log";

/**
 * The answers of `POST /api/designs/{id}/preset` that are the route's own. Every one carries a stable code and a fixed
 * sentence: nothing of the body, the name, the image or the stored design is echoed, and each refusal is written down
 * as a fixed-size line (`reportDesignRefusal`) that carries nothing the caller chose.
 *
 * The credential refusals are not here: they answer `designNotFoundResponse`, byte for byte (ADR 0114 decision G5).
 */

export const PRESET_REQUEST_INVALID_CODE = "PRESET_REQUEST_INVALID";
export const PRESET_NAME_REFUSED_CODE = "PRESET_NAME_REFUSED";
export const PRESET_IMAGE_REFUSED_CODE = "PRESET_IMAGE_REFUSED";
export const PRESET_STALE_CODE = "PRESET_STALE";
export const PRESET_TOO_LARGE_CODE = "PRESET_TOO_LARGE";

/** The log-only codes of the refusals that answer as a design that does not exist. */
export const PRESET_CROSS_SITE_REFUSED = {
  code: "PRESET_CROSS_SITE_REFUSED",
  status: 404,
} as const;
export const PRESET_AUTHORING_REFUSED = {
  code: "PRESET_AUTHORING_REFUSED",
  status: 404,
} as const;

const BAD_REQUEST_STATUS = 400;
const CONFLICT_STATUS = 409;
const UNPROCESSABLE_STATUS = 422;
const CREATED_STATUS = 201;

/** `400`: the body is not the request this route reads. */
export function presetRequestInvalidResponse(): NextResponse {
  return refusal({
    code: PRESET_REQUEST_INVALID_CODE,
    status: BAD_REQUEST_STATUS,
    sentence: "The preset request was not understood.",
  });
}

/** `422`: the typed name fails the name rule. The rule is the dialog's to state, not this answer's. */
export function presetNameRefusedResponse(): NextResponse {
  return refusal({
    code: PRESET_NAME_REFUSED_CODE,
    status: UNPROCESSABLE_STATUS,
    sentence: "The preset name was refused.",
  });
}

/** `422`: the image is not a thumbnail this route accepts, whichever check ended it. */
export function presetImageRefusedResponse(): NextResponse {
  return refusal({
    code: PRESET_IMAGE_REFUSED_CODE,
    status: UNPROCESSABLE_STATUS,
    sentence: "The preset image was refused.",
  });
}

/** `422`: the stored kitchen is larger than a preset may be, the size a listing sends. Reached only by the design's author. */
export function presetTooLargeResponse(): NextResponse {
  return refusal({
    code: PRESET_TOO_LARGE_CODE,
    status: UNPROCESSABLE_STATUS,
    sentence: "The design is too large to be kept as a preset.",
  });
}

/** `409`: the kitchen the editor shows is not the one stored, so no row was made. Reached only by the design's author. */
export function presetStaleResponse(): NextResponse {
  return refusal({
    code: PRESET_STALE_CODE,
    status: CONFLICT_STATUS,
    sentence: "The design changed since it was loaded.",
  });
}

/**
 * `422`: the stored kitchen is not one the product would propose (ADR 0112 decision 4). The domain's code, and the first
 * finding or the parts missing, are a short closed list of codes the dialog shows in the owner's language.
 */
export function presetCandidateRefusedResponse(
  candidateRefusal: PresetRefusal,
): NextResponse {
  reportDesignRefusal("preset-save", {
    code: candidateRefusal.code,
    status: UNPROCESSABLE_STATUS,
  });
  const detail =
    candidateRefusal.code === "PRESET_HAS_FINDINGS"
      ? { finding: candidateRefusal.finding }
      : { missing: candidateRefusal.missing };
  return NextResponse.json(
    {
      code: candidateRefusal.code,
      error: "This kitchen cannot be saved as a preset.",
      ...detail,
    },
    { status: UNPROCESSABLE_STATUS },
  );
}

/** `201`: the new preset's id. Like every answer of an author's route, it is never cached for another caller. */
export function presetSavedResponse(id: string): NextResponse {
  return NextResponse.json(
    { id },
    { status: CREATED_STATUS, headers: PER_CREDENTIAL_HEADERS },
  );
}

interface Refusal {
  readonly code: string;
  readonly status: number;
  readonly sentence: string;
}

function refusal({ code, status, sentence }: Refusal): NextResponse {
  reportDesignRefusal("preset-save", { code, status });
  return NextResponse.json({ code, error: sentence }, { status });
}
