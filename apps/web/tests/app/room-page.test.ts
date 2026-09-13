import { readFileSync } from "node:fs";

import { isValidElement } from "react";
import { describe, expect, it } from "vitest";

import RoomPage from "../../src/app/[locale]/configurator/room/page";

const roomPageSource = readFileSync(
  new URL("../../src/app/[locale]/configurator/room/page.tsx", import.meta.url),
  "utf8",
);
const configurePageSource = readFileSync(
  new URL(
    "../../src/app/[locale]/configurator/configure/page.tsx",
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

describe("localized room route placeholder", () => {
  it.each(["ro", "ru"] as const)(
    "exposes the resolved substate and marked fields for %s",
    async (locale) => {
      const page = await RoomPage({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve({ shape: "L" }),
      });
      if (!isValidElement(page))
        throw new Error("Room route returned no element");

      expect(page.type).toBe("main");
      expect(page.props).toMatchObject({
        "data-room-substate": "1B",
        "data-marked-fields": "wallA,wallB,height,direction",
      });
    },
  );

  it("refuses an unsupported locale instead of rendering a room state", async () => {
    await expect(
      RoomPage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("stays a server-only route that awaits both Next inputs", () => {
    expect(roomPageSource).not.toMatch(/^\s*["']use client["'];/m);
    expect(roomPageSource).toMatch(/const \{ locale \} = await params;/);
    expect(roomPageSource).toMatch(/parseRoomUrlState\(await searchParams\)/);
    expect(roomPageSource).not.toMatch(
      /useConfiguratorStore|zustand|localStorage|sessionStorage|indexedDB|\bwindow\b|\bdocument\b|fetch\(|persistence/i,
    );
  });

  it("leaves the editor route and the two existing readiness probes on configure", () => {
    expect(configurePageSource).toContain(
      'import { ConfigureScreen } from "@/app/configurator/configure/configure-screen";',
    );
    expect(configurePageSource).toContain("<ConfigureScreen");
    expect(configurePageSource).not.toContain("configurator/room");
    expect(playwrightConfigSource).toContain(
      "url: `${BASE_URL}/configurator/configure`",
    );
    expect(fidelityCaptureSource).toContain(
      "fetch(`${BASE_URL}/configurator/configure`)",
    );
  });
});
