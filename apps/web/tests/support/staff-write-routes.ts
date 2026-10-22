import type { Capability } from "@lemnaria/configurator-domain";
import { NextRequest } from "next/server";

import { POST as NOTES } from "@/app/api/staff/kitchens/[id]/notes/route";
import { PUT as STATUS } from "@/app/api/staff/kitchens/[id]/status/route";
import { POST as UNHIDE } from "@/app/api/staff/kitchens/[id]/unhide/route";
import {
  STAFF_NOTE_BY_ACCOUNT_POLICY,
  STAFF_STATUS_BY_ACCOUNT_POLICY,
  STAFF_UNHIDE_BY_ACCOUNT_POLICY,
  type LimitPolicy,
} from "@/lib/server/rate-limit/limit-policy";

import { ORIGIN } from "./account-world";
import {
  noteRequest,
  plantActionKitchen,
  statusRequest,
  unhideRequest,
} from "./staff-actions-world";

// The three staff write routes as one table for their tests: what each is called, which capability and bucket it
// names, what a request that succeeds looks like and which kitchen it needs. A test file that uses it mocks the session
// store and the staff actions store instance.

export type WriteRouteName = "notes" | "status" | "unhide";
export type WriteEvent = "staff-note" | "staff-status" | "staff-unhide";

export interface AskInit {
  readonly cookie?: string;
  /** The body as JSON, or as the text it is; a body route sends its valid body when this is left out. */
  readonly json?: unknown;
  readonly contentType?: string | null;
  readonly secFetchSite?: string | null;
  readonly headers?: Record<string, string>;
  readonly search?: string;
}

export interface RawAskInit {
  readonly cookie?: string;
  readonly body: BodyInit | ReadableStream<Uint8Array>;
  readonly contentType?: string;
  /** The `x-forwarded-for` value, or `null` for a request that carries none. A test network when left out. */
  readonly network?: string | null;
}

export interface WriteRoute {
  readonly name: WriteRouteName;
  readonly event: WriteEvent;
  readonly method: "POST" | "PUT";
  readonly capability: Capability;
  readonly policy: LimitPolicy;
  readonly takesBody: boolean;
  readonly success: 200 | 201 | 204;
  readonly validBody: Readonly<Record<string, unknown>> | undefined;
  /** A kitchen on which this route's valid request succeeds. */
  readonly plantReady: () => string;
  readonly ask: (id: string, init?: AskInit) => Promise<Response>;
  readonly askRaw: (id: string, init: RawAskInit) => Promise<Response>;
}

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

function rawRequestFor(
  method: string,
  name: WriteRouteName,
  id: string,
  { cookie, body, contentType, network = "192.0.2.10" }: RawAskInit,
): NextRequest {
  const headers: Record<string, string> = { "sec-fetch-site": "same-origin" };
  if (network !== null) headers["x-forwarded-for"] = network;
  if (cookie !== undefined) headers.cookie = cookie;
  if (contentType !== undefined) headers["content-type"] = contentType;
  const init = { method, headers, body, duplex: "half" };
  return new NextRequest(
    `${ORIGIN}/api/staff/kitchens/${id}/${name}`,
    init as ConstructorParameters<typeof NextRequest>[1],
  );
}

function routeOf(
  definition: Omit<WriteRoute, "ask" | "askRaw"> & {
    readonly handler: RouteHandler;
    readonly build: typeof noteRequest;
  },
): WriteRoute {
  const { handler, build, ...fields } = definition;
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  return {
    ...fields,
    ask: (id, init = {}) => {
      const withBody =
        fields.takesBody && init.json === undefined
          ? { ...init, json: fields.validBody }
          : init;
      return handler(build(id, withBody), context(id));
    },
    askRaw: (id, init) =>
      handler(rawRequestFor(fields.method, fields.name, id, init), context(id)),
  };
}

export const NOTES_ROUTE = routeOf({
  name: "notes",
  event: "staff-note",
  method: "POST",
  capability: "note.write",
  policy: STAFF_NOTE_BY_ACCOUNT_POLICY,
  takesBody: true,
  success: 201,
  validBody: { text: "A note" },
  plantReady: () => plantActionKitchen().id,
  handler: NOTES,
  build: noteRequest,
});

export const STATUS_ROUTE = routeOf({
  name: "status",
  event: "staff-status",
  method: "PUT",
  capability: "contact.update-status",
  policy: STAFF_STATUS_BY_ACCOUNT_POLICY,
  takesBody: true,
  success: 200,
  validBody: { status: "contacted", from: "new" },
  plantReady: () => plantActionKitchen().id,
  handler: STATUS,
  build: statusRequest,
});

export const UNHIDE_ROUTE = routeOf({
  name: "unhide",
  event: "staff-unhide",
  method: "POST",
  capability: "design.unhide",
  policy: STAFF_UNHIDE_BY_ACCOUNT_POLICY,
  takesBody: false,
  success: 204,
  validBody: undefined,
  plantReady: () => plantActionKitchen({ isHidden: true }).id,
  handler: UNHIDE,
  build: unhideRequest,
});

export const WRITE_ROUTES: readonly WriteRoute[] = [
  NOTES_ROUTE,
  STATUS_ROUTE,
  UNHIDE_ROUTE,
];

export const BODY_ROUTES: readonly WriteRoute[] = [NOTES_ROUTE, STATUS_ROUTE];

/** A design id's shape (21 characters of `A-Za-z0-9_-`) that no kitchen has. */
export const UNKNOWN_ID = "Q".repeat(21);
