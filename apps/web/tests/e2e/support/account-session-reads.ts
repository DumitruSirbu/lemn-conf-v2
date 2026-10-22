/**
 * The one `/api/` request a configurator page now makes of its own accord: the header's account control asks the
 * server who is signed in, once per document (M8B Lot 2 U3, `src/account/session/use-account-session.ts`). A page with
 * nothing to send still sends it, so a spec whose contract is "this page requests nothing from the design API" has to
 * say what it lets through rather than count it as a design request.
 *
 * What it lets through is exactly the read and nothing wider: a GET of that path with no query string. A POST of it, a
 * query on it or any other `/api/` path is still a request the spec's contract forbids.
 */
export const ACCOUNT_SESSION_PATH = "/api/account/session";

export function isAccountSessionRead(method: string, address: string): boolean {
  const url = new URL(address, "http://origin.invalid");
  return (
    method === "GET" &&
    url.pathname === ACCOUNT_SESSION_PATH &&
    url.search === ""
  );
}
