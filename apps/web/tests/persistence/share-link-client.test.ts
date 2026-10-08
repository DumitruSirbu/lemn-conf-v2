// M7 wave 7E3c D4/D10: the browser half of `/api/designs/{id}/share`. Asserted here — which verb
// hits which URL, credentials, and how a non-2xx or a malformed body becomes the one
// `ShareLinkRequestFailedError` the control renders — never a cookie's actual round trip (no jar in
// this process; that is `share-design.e2e.spec.ts`'s job).
import type { DesignId } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  issueShareLink,
  revokeShareLink,
  ShareLinkRequestFailedError,
  shareLinkStatus,
} from "../../src/persistence/share-link-client";

const DESIGN_ID = "design-under-test" as DesignId;

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly credentials: RequestCredentials | undefined;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const REFUSAL_STATUS = 404;
const REFUSAL_BODY_TEXT = "No design found for id …";

/** An error's message, its name, and every own field with its value, as one text to search. */
function everythingCarriedBy(failure: unknown): string {
  if (!(failure instanceof Error)) return String(failure);
  const ownFields = Object.getOwnPropertyNames(failure)
    .filter((field) => field !== "stack")
    .map((field) => `${field}=${String(Reflect.get(failure, field))}`);
  return [failure.name, failure.message, ...ownFields].join("\n");
}

describe("share-link-client", () => {
  let requests: RecordedRequest[];
  let nextResponse: () => Response;

  beforeEach(() => {
    requests = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      requests.push({
        url,
        method: init.method ?? "GET",
        credentials: init.credentials,
      });
      return Promise.resolve(nextResponse());
    });
  });

  it("issues a POST, same-origin, and returns the path", async () => {
    nextResponse = () => jsonResponse({ path: "/s/abcDEF123456" }, 201);

    const path = await issueShareLink(DESIGN_ID);

    expect(path).toBe("/s/abcDEF123456");
    expect(requests).toEqual([
      {
        url: `/api/designs/${DESIGN_ID}/share`,
        method: "POST",
        credentials: "same-origin",
      },
    ]);
  });

  it("refuses to trust a 2xx body shaped unlike a share path", async () => {
    nextResponse = () => jsonResponse({ path: "not-a-share-path" }, 201);

    await expect(issueShareLink(DESIGN_ID)).rejects.toThrow(
      ShareLinkRequestFailedError,
    );
  });

  it("issues a DELETE and resolves on 204, idempotently", async () => {
    nextResponse = () => new Response(null, { status: 204 });

    await revokeShareLink(DESIGN_ID);

    expect(requests).toEqual([
      {
        url: `/api/designs/${DESIGN_ID}/share`,
        method: "DELETE",
        credentials: "same-origin",
      },
    ]);
  });

  it("issues a GET and returns the active flag", async () => {
    nextResponse = () => jsonResponse({ active: true });

    await expect(shareLinkStatus(DESIGN_ID)).resolves.toBe(true);
    expect(requests[0]?.method).toBe("GET");
  });

  it.each([
    ["issue", () => issueShareLink(DESIGN_ID)],
    ["revoke", () => revokeShareLink(DESIGN_ID)],
    ["status", () => shareLinkStatus(DESIGN_ID)],
  ] as const)(
    "turns a refusal into one ShareLinkRequestFailedError, carrying no status or body (%s)",
    async (_operation, call) => {
      nextResponse = () =>
        jsonResponse({ error: REFUSAL_BODY_TEXT }, REFUSAL_STATUS);

      const failure: unknown = await call().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ShareLinkRequestFailedError);
      // The class alone is satisfied by an error whose message quotes the response. Everything the error holds is
      // read, its message and any field hung on it, and none of it may be the status or the body.
      const carried = everythingCarriedBy(failure);
      expect(carried).not.toContain(String(REFUSAL_STATUS));
      expect(carried).not.toContain(REFUSAL_BODY_TEXT);
      expect(carried).not.toContain(DESIGN_ID);
    },
  );

  it("rejects when the status body carries no boolean active field", async () => {
    nextResponse = () => jsonResponse({});

    await expect(shareLinkStatus(DESIGN_ID)).rejects.toThrow(
      ShareLinkRequestFailedError,
    );
  });
});
