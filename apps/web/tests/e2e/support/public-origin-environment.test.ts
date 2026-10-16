import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PUBLIC_ORIGIN_VARIABLE,
  readPublicOrigin,
} from "@/lib/server/public-origin";

import { MAIL_VARIABLES_THE_SUITE_REFUSES } from "./fake-mail-environment";
import {
  CONTACT_UNAVAILABLE_SERVER_PORT,
  CSP_SHARE_REPORT_SERVER_PORT,
  FAILED_RENDER_SERVER_PORT,
  inheritedEnvironmentOf,
  PRODUCTION_POLICY_SERVER_PORT,
} from "./production-policy-server";
import { publicOriginEnvironmentOf } from "./public-origin-environment";

const SUITE_ORIGIN = "http://localhost:4320";
const RUNNERS_ORIGIN = "https://production.lemnaria.example";

describe("the public origin a suite's server is given", () => {
  it.each([
    4320,
    PRODUCTION_POLICY_SERVER_PORT,
    CONTACT_UNAVAILABLE_SERVER_PORT,
    CSP_SHARE_REPORT_SERVER_PORT,
    FAILED_RENDER_SERVER_PORT,
  ])(
    "is read by the server as configured, and as exactly its own origin, on port %i",
    (port) => {
      const origin = `http://localhost:${String(port)}`;

      expect(readPublicOrigin(publicOriginEnvironmentOf(origin))).toEqual({
        status: "configured",
        origin,
      });
    },
  );

  it("names the variable as the server does, and is no mail variable the suite refuses", () => {
    expect(Object.keys(publicOriginEnvironmentOf(SUITE_ORIGIN))).toEqual([
      PUBLIC_ORIGIN_VARIABLE,
    ]);
    expect(MAIL_VARIABLES_THE_SUITE_REFUSES).not.toContain(
      PUBLIC_ORIGIN_VARIABLE,
    );
  });

  it("is never the runner's own for a second server, which is given its own origin instead", () => {
    const inherited = inheritedEnvironmentOf({
      [PUBLIC_ORIGIN_VARIABLE]: RUNNERS_ORIGIN,
      UNRELATED: "kept",
    });

    expect(inherited).toEqual({ UNRELATED: "kept" });
  });
});

describe("playwright.config.ts", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../../../playwright.config.ts"),
    "utf8",
  );

  it("reads source: gives the suite's server its own base address as the public origin, after the env file's values", () => {
    const loadsTheEnvironment = source.indexOf("loadEnvLocal();");
    const givesTheOrigin = source.indexOf(
      "...publicOriginEnvironmentOf(BASE_URL),",
    );

    expect(loadsTheEnvironment).toBeGreaterThan(-1);
    expect(givesTheOrigin).toBeGreaterThan(loadsTheEnvironment);
    expect(source).toContain(`http://localhost:\${String(PORT)}`);
  });
});
