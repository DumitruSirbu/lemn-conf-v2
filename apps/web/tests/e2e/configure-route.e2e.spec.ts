import {
  expect,
  test,
  type APIResponse,
  type Response,
} from "@playwright/test";

const CSP_HEADER = "content-security-policy-report-only";

/**
 * The configure route's own render contract, split out of `locale-routing.qa` (wave 7E4 D3): this
 * is the one file the wave's gate still allows to name `/configurator/configure` as a route string,
 * because it is the file 7E3a converts from this 200 to its own 307 (ADR 0114 decision 4) once
 * `/configurator/room` and `/d/{id}` become the entrypoints everywhere else.
 */
test("the localized configure route answers 200 with no redirect and CSP", async ({
  request,
}) => {
  for (const locale of ["ro", "ru"] as const) {
    const path = `/${locale}/configurator/configure`;
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(200);
    expect(response.headers().location).toBeUndefined();
    assertCsp(response);
  }
});

function assertCsp(response: APIResponse | Response): string {
  const policy = response.headers()[CSP_HEADER];
  expect(policy).toBeTruthy();
  const nonce = /'nonce-([^']+)'/.exec(policy ?? "")?.[1];
  expect(nonce).toBeTruthy();
  if (nonce === undefined) throw new Error("CSP contains no nonce");
  return nonce;
}
