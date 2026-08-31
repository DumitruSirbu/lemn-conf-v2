// Internal verification tooling for the M1 fidelity gate — not a customer-facing feature and not
// wired into any nav. It drives the real application through the internal `/internal/scene-shot`
// route and saves renders for a person to compare against
// `design-source/Modern Kitchen Cabinets 3D (3)/shots/`.
//
//   node scripts/capture-fidelity.mjs [outputDirectory]
//
// The reference preset renders are 924 x 540 files produced by `preset-shots.html`, whose stage box
// is 960 x 640 inside an overflow-hidden page — i.e. they are the top-left crop of a 960 x 640
// render, not a 924 x 540 one. Both are captured here: the crop is the like-for-like comparison,
// the full frame shows everything the crop cut off.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  ALL_SHOTS,
  OUTPUT_DIRECTORY,
  REFERENCE_HEIGHT,
  REFERENCE_WIDTH,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from "./fidelity-shots.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.FIDELITY_PORT ?? 4319);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const READY_TIMEOUT_MS = 60_000;
// Named by `src/app/internal/scene-shot/route-availability.ts`, which owns the flag. Repeated as a
// literal rather than imported because this is a plain `.mjs` script that cannot load a `.ts`
// module; `.env.example` documents the same pair.
const SCENE_SHOT_ROUTE_FLAG = "LEMNARIA_ENABLE_SCENE_SHOT_ROUTE";
const SCENE_SHOT_ROUTE_FLAG_ENABLED = "1";

function shotUrl({ pos, target, finish }, width, height) {
  const params = new URLSearchParams({
    w: String(width),
    h: String(height),
    pos: pos.join(","),
    target: target.join(","),
    finish,
  });
  return `${BASE_URL}/internal/scene-shot?${params.toString()}`;
}

async function startServer() {
  const server = spawn(
    "pnpm",
    ["exec", "next", "start", "--port", String(PORT)],
    {
      cwd: appRoot,
      stdio: ["ignore", "pipe", "pipe"],
      // `next start` runs in production mode, where `/internal/scene-shot` is 404 unless opted in.
      env: {
        ...process.env,
        [SCENE_SHOT_ROUTE_FLAG]: SCENE_SHOT_ROUTE_FLAG_ENABLED,
      },
    },
  );
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/configurator/configure`);
      if (response.ok) return server;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  server.kill();
  throw new Error(`next start did not become ready on ${BASE_URL}`);
}

async function capture(page, shot, outputDirectory, consoleErrors) {
  // Like-for-like with the reference files: a 924 x 540 viewport over the 960 x 640 stage box.
  await page.setViewportSize({
    width: REFERENCE_WIDTH,
    height: REFERENCE_HEIGHT,
  });
  await page.goto(shotUrl(shot, STAGE_WIDTH, STAGE_HEIGHT), {
    waitUntil: "load",
  });
  await page.waitForSelector('[data-testid="scene-shot"][data-ready="true"]', {
    timeout: 30_000,
  });
  await page.screenshot({
    path: resolve(
      outputDirectory,
      `ported-${shot.name}-as-reference-924x540.png`,
    ),
  });

  // The full stage, for anything the reference crop cut off.
  await page.setViewportSize({ width: STAGE_WIDTH, height: STAGE_HEIGHT });
  await page.goto(shotUrl(shot, STAGE_WIDTH, STAGE_HEIGHT), {
    waitUntil: "load",
  });
  await page.waitForSelector('[data-testid="scene-shot"][data-ready="true"]', {
    timeout: 30_000,
  });
  await page.screenshot({
    path: resolve(outputDirectory, `ported-${shot.name}-full-960x640.png`),
  });

  return {
    name: shot.name,
    shippedReference: shot.shippedReference,
    finish: shot.finish,
    cameraPosition: shot.pos,
    cameraTarget: shot.target,
    consoleErrors: [...consoleErrors],
  };
}

async function main() {
  const outputDirectory = resolve(process.argv[2] ?? OUTPUT_DIRECTORY);
  await mkdir(outputDirectory, { recursive: true });

  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  const manifest = { shots: [] };
  try {
    for (const shot of ALL_SHOTS) {
      consoleErrors.length = 0;
      manifest.shots.push(
        await capture(page, shot, outputDirectory, consoleErrors),
      );
      console.log(`captured ${shot.name}`);
    }
  } finally {
    await browser.close();
    server.kill();
  }

  manifest.note =
    "Preset camera positions and targets are pinned by preset-shots.html. Detail-shot cameras are not — the reference did not record them; they frame the same features from cameras chosen for this capture.";
  await writeFile(
    resolve(outputDirectory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    `\nwrote ${String(manifest.shots.length)} shots to ${outputDirectory}`,
  );
}

await main();
