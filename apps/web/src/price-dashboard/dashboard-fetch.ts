// How the browser asks the dashboard's routes. A request that cannot be made or answered is `undefined`, and a body
// that is not JSON reads as `undefined`: the callers sort the answer, and anything that is not a route's own is a
// failure.

export const OK_STATUS = 200;
export const INVALID_INPUT_STATUS = 400;
export const UNAUTHORISED_STATUS = 401;
export const NOT_FOUND_STATUS = 404;
export const CONFLICT_STATUS = 409;

export const STATE_ADDRESS = "/api/staff/prices";
export const DRAFT_ADDRESS = "/api/staff/prices/draft";

/** A write states the origin the routes' cross-site guard reads, which `no-referrer` would turn into `null`. */
const SAME_ORIGIN_REFERRER_POLICY: ReferrerPolicy = "same-origin";
const NO_REFERRER_POLICY: ReferrerPolicy = "no-referrer";

export interface Answer {
  readonly status: number;
  readonly body: unknown;
  /** The whole seconds a `Retry-After` header asks for; absent when the answer names none or not a whole number. */
  readonly retryAfterSeconds?: number | undefined;
}

export type Request =
  | { readonly method: "GET" }
  | {
      readonly method: "PUT" | "DELETE" | "POST";
      readonly body: string;
    };

/** A `signal` that aborts ends the request, and the answer is then `undefined` like any other that cannot be had. */
export async function ask(
  address: string,
  request: Request,
  signal?: AbortSignal,
): Promise<Answer | undefined> {
  try {
    const response = await fetch(address, {
      ...init(request),
      ...(signal === undefined ? {} : { signal }),
    });
    return {
      status: response.status,
      body: await readJsonOrNothing(response),
      retryAfterSeconds: retryAfterSecondsOf(response),
    };
  } catch {
    return undefined;
  }
}

function init(request: Request): RequestInit {
  if (request.method === "GET") {
    return { method: "GET", referrerPolicy: NO_REFERRER_POLICY };
  }
  return {
    method: request.method,
    body: request.body,
    headers: { "content-type": "application/json" },
    referrerPolicy: SAME_ORIGIN_REFERRER_POLICY,
  };
}

const WHOLE_SECONDS = /^\d+$/;

function retryAfterSecondsOf(response: Response): number | undefined {
  const declared = response.headers.get("Retry-After");
  return declared !== null && WHOLE_SECONDS.test(declared)
    ? Number(declared)
    : undefined;
}

async function readJsonOrNothing(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
