// The browser half of the share endpoint (M7 wave 7E3c D4, D10) — `POST`/`DELETE`/`GET` against
// `/api/designs/{id}/share`. Lives beside `fetch-configuration-repository.ts` for that file's own
// reason: the write-token and visitor cookies are ambient, same-origin credentials, and no code here
// reads, holds or logs either.
//
// **The refusal is one shape, and this file does not try to read more into it.** D4's route answers
// the same byte-identical 404 whatever refused the call — a missing credential, a foreign design, an
// unknown id — so telling those apart is not a client concern; every non-2xx here becomes one
// `ShareLinkRequestFailedError`, which `share-design.tsx` renders as its one error state.
import type { DesignId } from "@lemnaria/configurator-domain";

const SHARE_PATH_SHAPE = /^\/s\/[0-9A-Za-z]{12}$/;

/** Every failure this file can throw — a non-2xx response, or a 2xx whose body does not match the
 *  shape D4 promises. No status or body text is carried: see the file's own head comment. */
export class ShareLinkRequestFailedError extends Error {
  constructor(operation: string) {
    super(`${operation} failed`);
    this.name = "ShareLinkRequestFailedError";
  }
}

/**
 * Issues a fresh, active share link, revoking whatever was active first (D3). Returns the path
 * alone — `/s/{token}` — which is all the response carries (D4); the caller composes the full URL
 * from `location.origin` at the point it is shown, never here.
 */
export async function issueShareLink(id: DesignId): Promise<string> {
  const response = await request(id, "POST");
  if (!response.ok)
    throw new ShareLinkRequestFailedError("Creating a share link");
  const body = (await readJsonBody(response, "Creating a share link")) as {
    path?: unknown;
  };
  if (typeof body.path !== "string" || !SHARE_PATH_SHAPE.test(body.path)) {
    throw new ShareLinkRequestFailedError("Creating a share link");
  }
  return body.path;
}

/** Revokes the design's active link, if it has one. Idempotent (D3): a design with nothing active
 *  answers 204 exactly as one that had something revoke does. */
export async function revokeShareLink(id: DesignId): Promise<void> {
  const response = await request(id, "DELETE");
  if (!response.ok)
    throw new ShareLinkRequestFailedError("Revoking the share link");
}

/** Whether the design has an active link right now — never which one, and never its token. Read on
 *  the settings sheet's own open (D10: the control's *active* state), never on a schedule. */
export async function shareLinkStatus(id: DesignId): Promise<boolean> {
  const response = await request(id, "GET");
  if (!response.ok)
    throw new ShareLinkRequestFailedError("Reading the share link's status");
  const body = (await readJsonBody(
    response,
    "Reading the share link's status",
  )) as { active?: unknown };
  if (typeof body.active !== "boolean") {
    throw new ShareLinkRequestFailedError("Reading the share link's status");
  }
  return body.active;
}

/** Every request goes through here for `fetch-configuration-repository.ts`'s own reason: the routes
 *  are same-origin, so stating `credentials` is what stops a later refactor from dropping the
 *  write-token and visitor cookies and turning every call into the refusal. */
function request(
  id: DesignId,
  method: "POST" | "DELETE" | "GET",
): Promise<Response> {
  return fetch(`/api/designs/${encodeURIComponent(id)}/share`, {
    method,
    credentials: "same-origin",
  });
}

async function readJsonBody(
  response: Response,
  operation: string,
): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ShareLinkRequestFailedError(operation);
  }
}
