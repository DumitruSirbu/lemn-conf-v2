import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  presetRoomOf,
  refusalOfPresetCandidate,
  type Design,
} from "@lemnaria/configurator-domain";
import {
  PresetRepositoryError,
  type PresetToRecord,
} from "@lemnaria/persistence";
import { NextResponse, type NextRequest } from "next/server";

import {
  designErrorResponse,
  designNotFoundResponse,
} from "@/lib/server/design-errors";
import {
  reportDesignFailure,
  reportDesignRefusal,
} from "@/lib/server/design-failure-log";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { mayAuthorPresets } from "@/lib/server/preset/preset-authoring-policy";
import {
  checkPresetSubmission,
  readPresetSaveBody,
  type PresetSubmission,
} from "@/lib/server/preset/preset-save-body";
import {
  PRESET_AUTHORING_REFUSED,
  PRESET_CROSS_SITE_REFUSED,
  presetCandidateRefusedResponse,
  presetSavedResponse,
  presetStaleResponse,
} from "@/lib/server/preset/preset-save-responses";
import { refusalOfPresetCreationCap } from "@/lib/server/rate-limit/judge-preset-creation";
import { refusalOfSaveLimit } from "@/lib/server/rate-limit/judge-save-request";
import { presetUnavailableResponse } from "@/lib/server/rate-limit/rate-limited-response";
import {
  getAuthorizedDesignRepository,
  getPresetRepository,
} from "@/lib/server/repository";
import { readVisitorHash } from "@/lib/server/visitor";
import { readWriteTokenHash } from "@/lib/server/write-token";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** The pair the credential check requires (ADR 0114 decision G4), present together or not at all. */
interface AuthorCredentials {
  readonly writeTokenHash: string;
  readonly visitorHash: string;
}

/**
 * Saves the design's stored kitchen as a preset (ADR 0112 decisions 3 and 4, Amendment A; plan M8C section 3.3). It
 * lives under the design's own path because the write-token cookie is scoped to it: only the browser that holds both
 * credentials can publish this design, and the credentials are compared in SQL by the load. The request names the
 * revision the editor shows, an optional name and the image, and never a document: what is kept is the stored design.
 *
 * The order is the share route's, then the rest, and every refusal before the insert leaves no row. A credential
 * refusal, a cross-site request and a policy refusal answer `designNotFoundResponse` byte for byte (ADR 0114 G5).
 * The day's cap over every caller is asked last, immediately before the insert, so only a save that would have stored
 * a row spends it.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  if (isCrossSiteRequest(request)) {
    reportDesignRefusal("preset-save", PRESET_CROSS_SITE_REFUSED);
    return designNotFoundResponse(id);
  }
  const credentials = authorCredentialsFor(request, id);
  if (!credentials) return designNotFoundResponse(id);
  if (!(await mayAuthorPresets(request))) {
    reportDesignRefusal("preset-save", PRESET_AUTHORING_REFUSED);
    return designNotFoundResponse(id);
  }
  const limited = await refusalOfSaveLimit(
    request.headers,
    credentials.writeTokenHash,
  );
  if (limited) return limited;

  try {
    return await saveAsPreset(request, id, credentials);
  } catch (error) {
    return failureResponseFor(error);
  }
}

/** Absent either credential, the repository is never asked, so the refusal costs no query and does not reveal
 *  whether the other would have mattered. */
function authorCredentialsFor(
  request: NextRequest,
  id: string,
): AuthorCredentials | undefined {
  const writeTokenHash = readWriteTokenHash(request, id);
  const visitorHash = readVisitorHash(request.cookies);
  if (writeTokenHash === undefined || visitorHash === undefined) {
    return undefined;
  }
  return { writeTokenHash, visitorHash };
}

async function saveAsPreset(
  request: NextRequest,
  id: string,
  credentials: AuthorCredentials,
): Promise<NextResponse> {
  const read = await readPresetSaveBody(request);
  if (!read.ok) return read.response;

  const stored = await getAuthorizedDesignRepository().loadAuthorized({
    id,
    ...credentials,
  });
  if (stored.kind === "none") return designNotFoundResponse(id);
  if (stored.revision !== read.body.revision) return presetStaleResponse();

  const candidateRefusal = refusalOfPresetCandidate(
    stored.design,
    buildKitchenLBodyCatalog(cabinetDepthMmOf(stored.design)),
  );
  if (candidateRefusal) return presetCandidateRefusedResponse(candidateRefusal);

  const checked = checkPresetSubmission(read.body);
  if (!checked.ok) return checked.response;

  const capped = await refusalOfPresetCreationCap();
  if (capped) return capped;

  const recorded = await getPresetRepository().record(
    presetToRecord(stored.design, checked.submission),
  );
  return presetSavedResponse(recorded.id);
}

/** The stored design as read, never the body's: the room's columns are copied from it, and the repository refuses a
 *  preset whose columns and document disagree. */
function presetToRecord(
  design: Design,
  { typedName, image, imageType }: PresetSubmission,
): PresetToRecord {
  const { shape, walls, heightMm } = presetRoomOf(design);
  return {
    shape,
    walls,
    heightMm,
    design,
    ...(typedName === undefined ? {} : { typedName }),
    thumbnail: image,
    thumbnailType: imageType,
  };
}

/** A preset store that gave no trustworthy answer is unavailable and nothing was stored; a stored design this build
 *  cannot read is the load's own answer; anything else is a defect, logged and rethrown. */
function failureResponseFor(error: unknown): NextResponse {
  if (error instanceof PresetRepositoryError) {
    reportDesignFailure("preset-save", error);
    return presetUnavailableResponse();
  }
  return designErrorResponse("preset-save", error);
}
