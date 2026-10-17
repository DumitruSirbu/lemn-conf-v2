import "server-only";

import {
  isDesignRevision,
  isShowablePresetName,
  MAX_PRESET_THUMBNAIL_BYTES,
  type DesignRevision,
  type PresetThumbnailType,
} from "@lemnaria/persistence";
import type { NextRequest, NextResponse } from "next/server";

import { payloadTooLargeResponse } from "@/lib/server/design-errors";
import {
  presetImageRefusedResponse,
  presetNameRefusedResponse,
  presetRequestInvalidResponse,
} from "@/lib/server/preset/preset-save-responses";
import { checkThumbnail } from "@/lib/server/preset/thumbnail-check";
import { readUtf8BodyWithLimit } from "@/lib/server/read-body-with-limit";

/**
 * What a preset save carries (plan M8C section 3.3; ADR 0112 decision 3): the revision the editor shows as saved, an
 * optional name, the declared type of the image and the image itself, in base64 because the body reader decodes text.
 * It carries no design, and a key the request holds beyond these four is never read, so a body carrying a `design` is
 * not refused and changes nothing.
 *
 * ```json
 * { "revision": "7", "name": "Optional name", "imageType": "image/webp", "image": "<base64>" }
 * ```
 */
export interface PresetSaveBody {
  readonly revision: DesignRevision;
  /** The name as it arrived, or absent: the rule is applied by `checkPresetSubmission`, after the stored design is
   *  known to be the author's. */
  readonly name: string | undefined;
  readonly imageType: unknown;
  /** The image's base64 text as it arrived, likewise unchecked. */
  readonly image: string;
}

export type PresetSaveBodyOutcome =
  | { readonly ok: true; readonly body: PresetSaveBody }
  | { readonly ok: false; readonly response: NextResponse };

/** What a save keeps of its body once the name and the image have passed their rules. */
export interface PresetSubmission {
  /** The name after NFC and trim, or nothing when it was empty: the name is then generated where it is shown. */
  readonly typedName: string | undefined;
  readonly image: Uint8Array;
  readonly imageType: PresetThumbnailType;
}

export type PresetSubmissionOutcome =
  | { readonly ok: true; readonly submission: PresetSubmission }
  | { readonly ok: false; readonly response: NextResponse };

/** Base64 spends four characters on three bytes, rounded up. */
const BASE64_CHARACTERS_PER_THREE_BYTES = 4;
const BYTES_PER_BASE64_GROUP = 3;
const ENVELOPE_ALLOWANCE_BYTES = 8 * 1024;

/**
 * The most a save's body may be: the largest image's base64 and an allowance for the rest, so an image one byte over
 * its cap still arrives and is refused as an image (`422`), and a body of any other size is cut off at the limit
 * (`413`) before it is held whole.
 */
export const MAX_PRESET_SAVE_BODY_BYTES =
  Math.ceil(MAX_PRESET_THUMBNAIL_BYTES / BYTES_PER_BASE64_GROUP) *
    BASE64_CHARACTERS_PER_THREE_BYTES +
  ENVELOPE_ALLOWANCE_BYTES;

/** Far above any name the rule accepts (80 characters), so a name is refused before it is normalised and not after a
 *  caller has made this route normalise a megabyte. */
const LONGEST_NAME_TEXT_UNITS = 1024;

const STRICT_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export async function readPresetSaveBody(
  request: NextRequest,
): Promise<PresetSaveBodyOutcome> {
  const raw = await readUtf8BodyWithLimit(
    request.body,
    MAX_PRESET_SAVE_BODY_BYTES,
  );
  if (!raw.ok) {
    return refused(
      raw.failure === "too-large"
        ? payloadTooLargeResponse()
        : presetRequestInvalidResponse(),
    );
  }
  const fields = fieldsOf(raw.value);
  if (fields === undefined) return refused(presetRequestInvalidResponse());
  return bodyOf(fields);
}

interface Fields {
  readonly revision: unknown;
  readonly name: unknown;
  readonly imageType: unknown;
  readonly image: unknown;
}

function fieldsOf(text: string): Fields | undefined {
  const parsed = parseJson(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const record = parsed as Partial<Fields>;
  return {
    revision: record.revision,
    name: record.name,
    imageType: record.imageType,
    image: record.image,
  };
}

function bodyOf(fields: Fields): PresetSaveBodyOutcome {
  const { revision, name, image } = fields;
  if (typeof revision !== "string" || !isDesignRevision(revision)) {
    return refused(presetRequestInvalidResponse());
  }
  if (typeof image !== "string") return refused(presetRequestInvalidResponse());
  if (name !== undefined && name !== null && typeof name !== "string") {
    return refused(presetRequestInvalidResponse());
  }
  return {
    ok: true,
    body: {
      revision,
      name: name ?? undefined,
      imageType: fields.imageType,
      image,
    },
  };
}

/**
 * The name rule, strict base64 and the image check, in that order. Asked only after the stored design has been proved
 * the author's and found fit to keep, so a caller who is not its author learns nothing of these rules, and a design
 * that cannot be a preset is told so before its image is judged (plan M8C section 3.3, steps 8 and 9).
 */
export function checkPresetSubmission(
  body: PresetSaveBody,
): PresetSubmissionOutcome {
  const typedName = typedNameOf(body.name);
  if (typedName === REFUSED_NAME) return refused(presetNameRefusedResponse());
  const image = bytesOfStrictBase64(body.image);
  if (image === undefined) return refused(presetImageRefusedResponse());
  const thumbnail = checkThumbnail(body.imageType, image);
  if (thumbnail.kind === "refused")
    return refused(presetImageRefusedResponse());
  return {
    ok: true,
    submission: { typedName, image, imageType: thumbnail.type },
  };
}

const REFUSED_NAME = Symbol("refused name");

/** NFC, trimmed, and nothing when that leaves nothing; then the rule the table and the listing apply, which is the
 *  persistence package's and not restated here. */
function typedNameOf(
  name: string | null | undefined,
): string | undefined | typeof REFUSED_NAME {
  if (name === undefined || name === null) return undefined;
  if (name.length > LONGEST_NAME_TEXT_UNITS) return REFUSED_NAME;
  const normalised = name.normalize("NFC").trim();
  if (normalised === "") return undefined;
  return isShowablePresetName(normalised) ? normalised : REFUSED_NAME;
}

/** The bytes of canonical base64 and of nothing else: `Buffer.from` skips what it cannot read, so the text is judged
 *  by its alphabet and by coming back as it went in. */
function bytesOfStrictBase64(text: string): Uint8Array | undefined {
  if (text.length % BASE64_CHARACTERS_PER_THREE_BYTES !== 0) return undefined;
  if (!STRICT_BASE64.test(text)) return undefined;
  const bytes = Buffer.from(text, "base64");
  return bytes.toString("base64") === text ? bytes : undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function refused(response: NextResponse): {
  ok: false;
  response: NextResponse;
} {
  return { ok: false, response };
}
