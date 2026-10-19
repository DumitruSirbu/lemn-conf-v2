// The codes and statuses the preset routes answer with and the browser branches on, once. It lives outside `lib/server`
// because the client bundle may not import a server-only module (ADR 0112 Amendment A). The domain's own refusal codes,
// `PRESET_HAS_FINDINGS` and `PRESET_MINIMUM_NOT_MET`, are not repeated here.

export const PRESET_REQUEST_INVALID_CODE = "PRESET_REQUEST_INVALID";
export const PRESET_NAME_REFUSED_CODE = "PRESET_NAME_REFUSED";
export const PRESET_IMAGE_REFUSED_CODE = "PRESET_IMAGE_REFUSED";
export const PRESET_STALE_CODE = "PRESET_STALE";
export const PRESET_TOO_LARGE_CODE = "PRESET_TOO_LARGE";
export const PRESET_LIMIT_REACHED_CODE = "PRESET_LIMIT_REACHED";
export const PRESET_UNAVAILABLE_CODE = "PRESET_UNAVAILABLE";

/** A body past its limit: the preset save reads it as an image that was refused. */
export const PAYLOAD_TOO_LARGE_STATUS = 413;

/** The one status of an answer that says a limit could not be judged or a store gave no answer. */
export const SERVICE_UNAVAILABLE_STATUS = 503;
