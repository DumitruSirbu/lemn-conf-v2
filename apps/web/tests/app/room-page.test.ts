import { readFileSync } from "node:fs";

import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

/** `connection()` reads Next's request store and throws without one, so a direct call to the route
 *  needs the request it declares it is waiting for. Mocked to resolve: what the call is *for* — the
 *  route staying out of the prerender manifest — is measured in `next build`'s route table, which
 *  is what criterion 17 asks for and what no unit test can stand in for. */
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(() => Promise.resolve()),
}));

import { RoomScreen } from "@/room/room-screen";

import RoomPage from "../../src/app/[locale]/configurator/room/page";

const roomPageSource = readFileSync(
  new URL("../../src/app/[locale]/configurator/room/page.tsx", import.meta.url),
  "utf8",
);
const configureRouteSource = readFileSync(
  new URL(
    "../../src/app/[locale]/configurator/configure/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const playwrightConfigSource = readFileSync(
  new URL("../../playwright.config.ts", import.meta.url),
  "utf8",
);
const fidelityCaptureSource = readFileSync(
  new URL("../../scripts/capture-fidelity.mjs", import.meta.url),
  "utf8",
);

/** A module's code with its prose stripped out, so a must-not about a call can be written without
 *  also forbidding the comment that explains why the call is there. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("localized room route placeholder", () => {
  it.each(["ro", "ru"] as const)(
    "renders the room screen and hands it nothing for %s",
    async (locale) => {
      const page = await RoomPage({ params: Promise.resolve({ locale }) });
      if (!isValidElement(page))
        throw new Error("Room route returned no element");

      // **Ruling R9's whole point, asserted as a value rather than as prose.** The route used to
      // wrap the screen in a `<main>` carrying its own parse of the query; Next reuses a page
      // segment on a back/forward navigation, so that parse described the entry the customer left
      // (defect D5). The markers moved onto the screen, which derives them from `useSearchParams`,
      // and the route has no reading of the URL left to disagree with.
      expect(page.type).toBe(RoomScreen);
      expect(page.props).toEqual({});
    },
  );

  it("refuses an unsupported locale before it waits for a request", async () => {
    await expect(
      RoomPage({ params: Promise.resolve({ locale: "en" }) }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("stays a server-only shell that awaits the params and a connection, and parses nothing", () => {
    // The route's **code**, with its prose stripped: the comment there records what `await
    // searchParams` was doing and why it went, which is what a reader arriving at `connection()`
    // needs, and a must-not reading the whole file would forbid the explanation along with the call.
    const code = codeOf(roomPageSource);

    expect(code).not.toMatch(/^\s*["']use client["'];/m);
    expect(code).toMatch(/const \{ locale \} = await params;/);
    // `await connection()` replaced `await searchParams` (criterion 17): nothing here consumes the
    // query any more, and a route whose only request-time API had been deleted as an unused read
    // would quietly become prerendered. The build's route table is the verdict on that; this only
    // keeps the call from being removed as dead code.
    expect(code).toMatch(/await connection\(\);/);
    expect(code).toMatch(/import \{ connection \} from "next\/server";/);
    expect(code).not.toMatch(/searchParams/);
    expect(code).not.toMatch(/parseRoomUrlState/);
    expect(code).not.toMatch(
      /useConfiguratorStore|zustand|localStorage|sessionStorage|indexedDB|\bwindow\b|\bdocument\b|fetch\(|persistence/i,
    );
  });

  it("no longer renders the editor at /configure, and points both readiness probes off it", () => {
    // Inverted since M7 wave 7E3a S3 (D7): the page that rendered `ConfigureScreen` is gone,
    // replaced by a Route Handler that only resumes. `<ConfigureScreen` now appears solely in
    // `hydrate-and-configure.tsx` (D8's close-out grep).
    expect(configureRouteSource).not.toContain(
      'import { ConfigureScreen } from "@/app/configurator/configure/configure-screen";',
    );
    expect(configureRouteSource).not.toContain("<ConfigureScreen");
    expect(configureRouteSource).not.toContain("app/configurator/configure");

    // Wave 7E4 D4: neither the e2e server's readiness poll nor the fidelity script's still names
    // `/configurator/configure` — the editor route retires as a poll target even though its source
    // file (asserted above) stays exactly where it is.
    expect(playwrightConfigSource).toContain(
      "url: `${BASE_URL}/ro/d/e2e-readiness-probe`,",
    );
    expect(fidelityCaptureSource).toContain(
      "const response = await fetch(`${BASE_URL}/internal/scene-shot`);",
    );
    // D2's gate: a route string, not `playwright.config.ts`'s own module-path import of
    // `./src/app/configurator/configure/selection-debug-availability` (the `[^p]` excludes exactly
    // that import's `app/` prefix).
    const routeStringPattern = /(^|[^p])\/configurator\/configure/;
    expect(playwrightConfigSource).not.toMatch(routeStringPattern);
    expect(fidelityCaptureSource).not.toMatch(routeStringPattern);
  });
});
