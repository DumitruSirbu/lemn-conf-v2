// How the browser asks the dashboard's routes. A request that cannot be made or answered is `undefined`, and a body that is
// not JSON reads as `undefined`: the callers sort the answer, and anything that is not a route's own is a failure.

export const OK_STATUS = 200;
export const INVALID_INPUT_STATUS = 400;
export const UNAUTHORISED_STATUS = 401;
export const CONFLICT_STATUS = 409;

/** A write states the origin the routes' cross-site guard reads, which `no-referrer` would turn into `null`. */
const SAME_ORIGIN_REFERRER_POLICY: ReferrerPolicy = "same-origin";
const NO_REFERRER_POLICY: ReferrerPolicy = "no-referrer";

export interface Answer {
  readonly status: number;
  readonly body: unknown;
}

export async function ask(
  address: string,
  init:
    | { readonly method: "GET" }
    | { readonly method: string; readonly body: string },
): Promise<Answer | undefined> {
  const isRead = init.method === "GET";
  try {
    const response = await fetch(address, {
      ...init,
      ...(isRead ? {} : { headers: { "content-type": "application/json" } }),
      referrerPolicy: isRead ? NO_REFERRER_POLICY : SAME_ORIGIN_REFERRER_POLICY,
    });
    return { status: response.status, body: await readJsonOrNothing(response) };
  } catch {
    return undefined;
  }
}

async function readJsonOrNothing(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
