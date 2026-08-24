// Internal verification tooling. Runs the UNMODIFIED reference rig
// (`design-source/Modern Kitchen Cabinets 3D (3)/preset-shots.html`) in the same headless browser
// that captures the port, from the same cameras, so the two image sets differ only by the port.
//
// The reference PNGs shipped in `shots/` are resized (924 x 540 against the rig's 960 x 640 stage
// box) and several were taken from cameras nobody recorded, which makes them fine for judging
// material, lighting and proportion but useless for a pixel-level comparison. Re-shooting the rig
// removes that variable.
//
// Needs network access: the rig loads three.js 0.184.0 from unpkg through its own import map.
// Nothing here writes to `design-source/`; the folder is served read-only.
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  ALL_SHOTS,
  OUTPUT_DIRECTORY,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from "./fidelity-shots.mjs";

const referenceRoot = resolve(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "../../design-source/Modern Kitchen Cabinets 3D (3)",
);
const PORT = Number(process.env.REFERENCE_PORT ?? 4321);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

/** `preset-shots.html` exposes only `setPreset(index)`, which sets finish and camera together. */
const FINISH_PRESET_INDEX = { white: 0, clay: 1, sage: 2, oak: 3 };

function serveReference() {
  const server = createServer((request, response) => {
    const requested = decodeURIComponent((request.url ?? "/").split("?")[0]);
    const target = join(
      referenceRoot,
      normalize(requested).replace(/^(\.\.[/\\])+/, ""),
    );
    if (!target.startsWith(referenceRoot)) {
      response.writeHead(403).end();
      return;
    }
    stat(target)
      .then((info) => {
        if (!info.isFile()) throw new Error("not a file");
        response.writeHead(200, {
          "content-type": MIME[extname(target)] ?? "application/octet-stream",
        });
        createReadStream(target).pipe(response);
      })
      .catch(() => {
        response.writeHead(404).end();
      });
  });
  return new Promise((done) => {
    server.listen(PORT, "127.0.0.1", () => {
      done(server);
    });
  });
}

async function main() {
  const outputDirectory = resolve(process.argv[2] ?? OUTPUT_DIRECTORY);
  await mkdir(outputDirectory, { recursive: true });

  const server = await serveReference();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: STAGE_WIDTH, height: STAGE_HEIGHT },
  });
  const failures = [];
  page.on("pageerror", (error) => failures.push(String(error)));
  page.on("requestfailed", (request) =>
    failures.push(`${request.url()} ${String(request.failure()?.errorText)}`),
  );

  try {
    await page.goto(`http://127.0.0.1:${String(PORT)}/preset-shots.html`, {
      waitUntil: "load",
    });
    await page.waitForFunction("window.__rigReady === true", null, {
      timeout: 60_000,
    });
    for (const shot of ALL_SHOTS) {
      await page.evaluate(
        ([presetIndex, position, target]) => {
          window.setPreset(presetIndex);
          const stage = document.querySelector("three-d-stage");
          stage._camera.position.set(position[0], position[1], position[2]);
          stage._controls.target.set(target[0], target[1], target[2]);
          stage._controls.update();
        },
        [FINISH_PRESET_INDEX[shot.finish], shot.pos, shot.target],
      );
      // Long enough for orbit damping to settle before the buffer is read.
      await page.waitForTimeout(1500);
      const box = await page.locator("#box").elementHandle();
      await box.screenshot({
        path: resolve(
          outputDirectory,
          `reference-rig-${shot.name}-full-960x640.png`,
        ),
      });
      console.log(`captured reference rig ${shot.name}`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length > 0) {
    console.log("\nnetwork/page problems (the rig loads three.js from unpkg):");
    for (const failure of failures) console.log(`  ${failure}`);
  }
}

await main();
