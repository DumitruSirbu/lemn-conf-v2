import { readFileSync } from "node:fs";

import { isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** `connection()` reads Next's request store and throws without one, so a direct call to the page needs the request it
 *  declares it is waiting for. Mocked to resolve and counted: what the call is *for*, the route staying out of the
 *  prerender manifest and so carrying the CSP's nonce, is measured in `next build`'s manifest (8L criterion 9), which no
 *  unit test can stand in for. */
const connection = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection,
}));

import { CallbackContactScreen } from "@/contact/contact-screen";

import CallbackContactPage from "../../src/app/[locale]/configurator/contact/page";

const DIGEST_SECRET_VALUE =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

const SENDABLE_ENVIRONMENT = {
  RESEND_API_KEY: undefined,
  MAIL_FROM_ADDRESS: undefined,
  LEAD_NOTIFICATION_ADDRESS: undefined,
  LEMNARIA_E2E_FAKE_MAIL: "1",
  DIGEST_SECRET: DIGEST_SECRET_VALUE,
} as const;

const UNSENDABLE_ENVIRONMENT = {
  ...SENDABLE_ENVIRONMENT,
  DIGEST_SECRET: undefined,
} as const;

function stubTheServersEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  for (const [name, value] of Object.entries(environment))
    vi.stubEnv(name, value);
}

async function propsOfThePage(): Promise<Record<string, unknown>> {
  const page = await CallbackContactPage();
  if (!isValidElement<Record<string, unknown>>(page))
    throw new Error("the page returned a non-element");
  expect(page.type).toBe(CallbackContactScreen);
  return page.props;
}

afterEach(() => {
  vi.unstubAllEnvs();
  connection.mockClear();
});

describe("the callback form's page", () => {
  it.each([
    ["can take a request", SENDABLE_ENVIRONMENT, true],
    ["cannot take a request", UNSENDABLE_ENVIRONMENT, false],
  ])(
    "hands its screen one boolean and nothing else when the server %s",
    async (_name, environment, expected) => {
      stubTheServersEnvironment(environment);

      const props = await propsOfThePage();

      expect(props).toEqual({ isSendable: expected });
    },
  );

  it("asks for the request before it reads the server's environment, so it is rendered per request", async () => {
    stubTheServersEnvironment(SENDABLE_ENVIRONMENT);

    await propsOfThePage();

    expect(connection).toHaveBeenCalledTimes(1);
  });

  it("loads no design and reads no cookie, parameter or query: the form has nothing behind it", () => {
    const source = readFileSync(
      new URL(
        "../../src/app/[locale]/configurator/contact/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "");

    for (const name of [
      "loadOwnedDesign",
      "cookies",
      "headers",
      "params",
      "searchParams",
    ]) {
      expect(code, name).not.toContain(name);
    }
  });
});
