// The staff kitchens list as a browser meets it: rows as `GET /api/staff/kitchens` writes them, the page around them, and a
// stand-in for `fetch` that records every request, can hold one until the test answers it, and honours an abort the way a
// browser does. Every member of a row can be replaced, so a test names only what it varies.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { vi } from "vitest";

const DESIGN_ID_LENGTH = 21;
const FIRST_UPDATED_AT_MS = Date.UTC(2026, 9, 19, 12, 0, 0);
const FIRST_SENT_AT_MS = Date.UTC(2026, 9, 17, 9, 30, 0);
export const STAFF_KITCHENS_PAGE_SIZE = 20;

/** A 21-character id of the shape `isDesignId` accepts, distinct for each `serial`. */
export function staffKitchenIdOf(serial: number): string {
  return `k${String(serial).padStart(DESIGN_ID_LENGTH - 1, "0")}`;
}

export interface WireRowOverrides {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly design?: unknown;
  readonly client?: unknown;
  readonly isSent?: unknown;
  readonly isHidden?: unknown;
  readonly sentAt?: unknown;
  readonly updatedAt?: unknown;
  readonly requestStatus?: unknown;
}

const THUMBNAIL_DESIGN = (() => {
  const { room, placements, emptyColumns, columnExtents, settings } =
    KITCHEN_L_DESIGN;
  return { room, placements, emptyColumns, columnExtents, settings };
})();

/** One row as the server writes it: a sent kitchen of a client with a profile, status new. A member given as `undefined`
 *  is left out of the object. */
export function wireRow(
  serial: number,
  overrides: WireRowOverrides = {},
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: staffKitchenIdOf(serial),
    name: `Bucatarie ${String(serial)}`,
    design: withoutUndefinedMembers(THUMBNAIL_DESIGN),
    client: {
      email: `client${String(serial)}@example.test`,
      name: `Client ${String(serial)}`,
      phone: `+3736900${String(serial).padStart(4, "0")}`,
    },
    isSent: true,
    isHidden: false,
    sentAt: new Date(FIRST_SENT_AT_MS - serial * 60_000).toISOString(),
    updatedAt: new Date(FIRST_UPDATED_AT_MS - serial * 1000).toISOString(),
    requestStatus: "new",
    ...overrides,
  };
  return withoutUndefinedMembers(row);
}

/** A draft of a client: no sent date, no status. */
export function wireDraft(
  serial: number,
  overrides: WireRowOverrides = {},
): Record<string, unknown> {
  return wireRow(serial, {
    isSent: false,
    sentAt: null,
    requestStatus: null,
    ...overrides,
  });
}

export interface WireListOverrides {
  readonly total?: unknown;
  readonly page?: unknown;
  readonly pageSize?: unknown;
}

export function wireList(
  kitchens: readonly unknown[],
  overrides: WireListOverrides = {},
): Record<string, unknown> {
  return withoutUndefinedMembers({
    total: kitchens.length,
    page: 1,
    pageSize: STAFF_KITCHENS_PAGE_SIZE,
    kitchens,
    ...overrides,
  });
}

/** The ids of the rows 1 to `count`, as a page of the given number would carry them. */
export function rowsOfPage(page: number, count: number): unknown[] {
  const first = (page - 1) * STAFF_KITCHENS_PAGE_SIZE;
  return Array.from({ length: count }, (_, index) =>
    wireRow(first + index + 1),
  );
}

export interface ServerAnswer {
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface RecordedRequest {
  readonly url: URL;
  readonly init: RequestInit;
  readonly signal: AbortSignal;
}

/** A request the server has not answered yet; `answer` settles it. */
export interface HeldRequest extends RecordedRequest {
  readonly answer: (answer: ServerAnswer) => void;
}

type Script = (request: RecordedRequest) => ServerAnswer | "hold" | "offline";

export interface StaffKitchensServer {
  /** Every request made, in order. */
  readonly requests: RecordedRequest[];
  /** The requests the script held, in order. */
  readonly held: HeldRequest[];
  /** `false` makes a held request answer even after it was aborted, as a response already in flight does when the
   *  abort comes too late for it. */
  honoursAbort: boolean;
  /** What the next requests are answered with; the default answers an empty page. */
  readonly script: (next: Script) => void;
  /** The `q` of every request, `null` where it carried none. */
  readonly searches: () => (string | null)[];
}

/** Replaces `fetch` for the test. Restore it with `vi.unstubAllGlobals()`. */
export function installStaffKitchensServer(): StaffKitchensServer {
  const requests: RecordedRequest[] = [];
  const held: HeldRequest[] = [];
  let script: Script = () => ({ body: wireList([]) });
  const server: StaffKitchensServer = {
    requests,
    held,
    honoursAbort: true,
    script: (next) => {
      script = next;
    },
    searches: () => requests.map(({ url }) => url.searchParams.get("q")),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((address: string | URL | Request, init: RequestInit = {}) => {
      const signal = init.signal ?? new AbortController().signal;
      const request: RecordedRequest = {
        url: new URL(addressOf(address), "https://lemnaria.test"),
        init,
        signal,
      };
      requests.push(request);
      return answerTo(request, script(request), { held, server });
    }),
  );
  return server;
}

function addressOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function answerTo(
  request: RecordedRequest,
  scripted: ServerAnswer | "hold" | "offline",
  { held, server }: { held: HeldRequest[]; server: StaffKitchensServer },
): Promise<Response> {
  if (scripted === "offline") {
    return Promise.reject(new TypeError("Failed to fetch"));
  }
  if (scripted !== "hold") return Promise.resolve(responseOf(scripted));
  return new Promise<Response>((resolve, reject) => {
    request.signal.addEventListener("abort", () => {
      if (server.honoursAbort) {
        reject(new DOMException("aborted", "AbortError"));
      }
    });
    held.push({
      ...request,
      answer: (answer) => {
        resolve(responseOf(answer));
      },
    });
  });
}

function responseOf({
  status = 200,
  body,
  headers = {},
}: ServerAnswer): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** The words of `account-responses`: the body every limited or unavailable answer carries. */
export const RATE_LIMITED_ANSWER = (
  retryAfterSeconds: number,
): ServerAnswer => ({
  status: 429,
  body: { status: "rate-limited" },
  headers: { "retry-after": String(retryAfterSeconds) },
});

export const UNAVAILABLE_ANSWER: ServerAnswer = {
  status: 503,
  body: { status: "unavailable" },
};

export const UNAUTHENTICATED_ANSWER: ServerAnswer = {
  status: 401,
  body: { status: "unauthenticated" },
};

export const FORBIDDEN_ANSWER: ServerAnswer = {
  status: 403,
  body: { status: "forbidden" },
};

function withoutUndefinedMembers(
  wire: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(wire).filter(([, value]) => value !== undefined),
  );
}
