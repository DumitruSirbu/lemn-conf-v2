import { neonConfig } from "@neondatabase/serverless";

/** The two replies a dropped acknowledgement arrives as: the empty body the driver cannot parse, and Neon's retryable 500. */
export type LostReply = "empty-reply" | "cold-start-refusal";

/** Whether the first request reaches the database before its reply is lost. */
export type LossPoint = "after-the-write-lands" | "before-the-write-lands";

const COLD_START_BODY = JSON.stringify({
  message: "Couldn't connect to compute node",
  "neon:retryable": true,
});

export interface LostReplyHandle {
  readonly requestsSent: () => number;
  restore: () => void;
}

/**
 * Routes the driver's HTTP requests through the real fetch and replaces the first reply with `reply`; every later
 * request is answered truthfully. Losing it after the request was forwarded is a commit whose acknowledgement never
 * arrived, which is the case a retry must leave no trace of. `meanwhile` is another caller's work, run between the
 * lost attempt and its retry; its own requests are neither lost nor counted.
 */
export function loseTheFirstReply(
  reply: LostReply,
  point: LossPoint,
  meanwhile?: () => Promise<unknown>,
): LostReplyHandle {
  const previousFetchFunction: unknown = neonConfig.fetchFunction;
  let requests = 0;
  let isInterleaving = false;
  neonConfig.fetchFunction = async (url: string, init: RequestInit) => {
    if (isInterleaving) return fetch(url, init);
    requests += 1;
    if (requests > 1) return fetch(url, init);
    if (point === "after-the-write-lands") await settle(await fetch(url, init));
    if (meanwhile) {
      isInterleaving = true;
      try {
        await meanwhile();
      } finally {
        isInterleaving = false;
      }
    }
    return lostReply(reply);
  };
  return {
    requestsSent: () => requests,
    restore: () => {
      neonConfig.fetchFunction = previousFetchFunction;
    },
  };
}

/** Reads the reply to its end, so the server has finished the work before the caller is told it was lost. */
async function settle(response: Response): Promise<void> {
  await response.text();
}

function lostReply(reply: LostReply): Response {
  return reply === "empty-reply"
    ? new Response("", { status: 200 })
    : new Response(COLD_START_BODY, { status: 500 });
}
