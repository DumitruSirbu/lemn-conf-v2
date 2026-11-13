import { POST as AVAILABILITY } from "@/app/api/staff/prices/availability/route";
import { POST as USAGE } from "@/app/api/staff/prices/usage/route";
import { GET as STATE } from "@/app/api/staff/prices/route";

import { accountRequest } from "./account-world";

// `fetch` as a browser would do it for the three routes the lifecycle client asks, answered by the real route handlers:
// what the client sends is what the routes read, and what they answer is what the client sorts. A test file that uses it
// mocks the session store and the staff audit store, and either mocks the price stores or holds its own.

const SOME_NETWORK = { "x-forwarded-for": "192.0.2.10" };

/** Every request is made as the session whose cookie `cookieOf` names now, or as none when it names none. */
export function fetchAnsweredByTheStaffRoutes(
  cookieOf: () => string | undefined,
): (address: string, init?: RequestInit) => Promise<Response> {
  return (path, init) => {
    const cookie = cookieOf();
    const request = accountRequest(path, {
      method: init?.method ?? "GET",
      headers: SOME_NETWORK,
      ...(cookie === undefined ? {} : { cookie }),
      ...(init?.body === undefined || init.body === null
        ? {}
        : { json: init.body as string }),
    });
    if (path === "/api/staff/prices/availability") {
      return AVAILABILITY(request);
    }
    if (path === "/api/staff/prices/usage") return USAGE(request);
    if (path === "/api/staff/prices") return STATE(request);
    return Promise.reject(
      new Error(`the client asked for an address no route answers: ${path}`),
    );
  };
}
