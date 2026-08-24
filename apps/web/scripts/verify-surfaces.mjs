// Internal verification tooling for the M1 surface criteria: the scene renders and orbits at the
// mobile viewport with the camera controls reachable, renders full width on desktop with no editor
// panel, keeps the console free of WebGL/resource errors, and falls back to the explicit 2F / D2F
// exit — with no stand-in preview — when WebGL is unavailable.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.VERIFY_PORT ?? 4320);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CONFIGURE_URL = `${BASE_URL}/configurator/configure`;
const MIN_TOUCH_TARGET_PX = 44;

const VIEWPORTS = [
  { name: "mobile-390x844", width: 390, height: 844 },
  { name: "desktop-1440x900", width: 1440, height: 900 },
];

const PRESET_LABELS = ["Vedere generală", "Perete A", "Perete B"];

/** Repo-relative and gitignored (`.tmp/`) so the default resolves the same way on any machine. */
const DEFAULT_OUTPUT = resolve(appRoot, ".tmp/fidelity/surfaces");

/** Make `getContext` refuse every WebGL flavour, the way a device without a usable GPU pipeline
 *  does. Nothing in the application reads a debug flag for this, so the exit is exercised through
 *  the same code path a real customer would hit. */
const DISABLE_WEBGL = `
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (id, ...rest) {
    if (typeof id === "string" && id.toLowerCase().includes("webgl")) return null;
    return original.call(this, id, ...rest);
  };
`;

async function startServer() {
  const server = spawn(
    "pnpm",
    ["exec", "next", "start", "--port", String(PORT)],
    {
      cwd: appRoot,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(CONFIGURE_URL)).ok) return server;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  server.kill();
  throw new Error("next start did not become ready");
}

function watchConsole(page, sink) {
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      sink.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => sink.push(`pageerror: ${String(error)}`));
  page.on("requestfailed", (request) =>
    sink.push(
      `requestfailed: ${request.url()} ${String(request.failure()?.errorText)}`,
    ),
  );
}

async function verifyRendering(browser, viewport, outputDirectory, findings) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.name.startsWith("mobile"),
    isMobile: viewport.name.startsWith("mobile"),
  });
  const page = await context.newPage();
  const messages = [];
  watchConsole(page, messages);
  await page.goto(CONFIGURE_URL, { waitUntil: "load" });
  await page.waitForSelector("canvas", { timeout: 30_000 });
  await page.waitForTimeout(1500);

  const canvasBox = await page.locator("canvas").boundingBox();
  const editorPanels = await page
    .locator('[data-testid="editor-panel"]')
    .count();

  const chips = [];
  for (const label of PRESET_LABELS) {
    const chip = page.getByRole("button", { name: label });
    const box = await chip.boundingBox();
    chips.push({ label, box });
    await chip.click();
    // Long enough for the 0.7 s camera ease to settle.
    await page.waitForTimeout(1400);
    await page.screenshot({
      path: resolve(
        outputDirectory,
        `${viewport.name}-preset-${label.replace(/\s+/g, "-")}.png`,
      ),
    });
  }

  // Orbit: a drag on the canvas must move the camera, and must not be read as anything else.
  const before = await page.screenshot();
  const centre = {
    x: (canvasBox?.x ?? 0) + (canvasBox?.width ?? 0) / 2,
    y: (canvasBox?.y ?? 0) + (canvasBox?.height ?? 0) / 2,
  };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x - 120, centre.y + 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const after = await page.screenshot();
  await writeFile(
    resolve(outputDirectory, `${viewport.name}-after-orbit.png`),
    after,
  );

  findings.push({
    surface: viewport.name,
    canvasSize: canvasBox
      ? {
          width: Math.round(canvasBox.width),
          height: Math.round(canvasBox.height),
        }
      : null,
    canvasFillsWidth: canvasBox
      ? Math.round(canvasBox.width) === viewport.width
      : false,
    editorPanelsPresent: editorPanels,
    orbitChangedTheView: !before.equals(after),
    cameraChips: chips.map((chip) => ({
      label: chip.label,
      height: chip.box ? Math.round(chip.box.height) : null,
      meetsTouchTarget: (chip.box?.height ?? 0) >= MIN_TOUCH_TARGET_PX,
      withinThumbReach: chip.box
        ? chip.box.y + chip.box.height <= viewport.height
        : false,
    })),
    consoleMessages: messages,
  });
  await context.close();
}

async function verifyWebglUnavailable(
  browser,
  viewport,
  outputDirectory,
  findings,
) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  await context.addInitScript(DISABLE_WEBGL);
  const page = await context.newPage();
  const messages = [];
  watchConsole(page, messages);
  await page.goto(CONFIGURE_URL, { waitUntil: "load" });
  await page.waitForSelector('[data-testid="webgl-unavailable"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(outputDirectory, `${viewport.name}-webgl-unavailable.png`),
  });

  const text = await page
    .locator('[data-testid="webgl-unavailable"]')
    .innerText();
  findings.push({
    surface: `${viewport.name}-no-webgl`,
    canvasesRendered: await page.locator("canvas").count(),
    imagesRendered: await page.locator("img").count(),
    continuationPaths: await page
      .locator('a[href^="/configurator/contact"]')
      .count(),
    mentionsPrice: /MDL|preț de la|De la\s+\d/i.test(text),
    saysNoFakePreview: text.includes(
      "Nu afișăm o previzualizare statică falsă",
    ),
    visibleText: text.split("\n").filter(Boolean),
    consoleMessages: messages,
  });
  await context.close();
}

async function main() {
  const outputDirectory = resolve(process.argv[2] ?? DEFAULT_OUTPUT);
  await mkdir(outputDirectory, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const findings = [];
  try {
    for (const viewport of VIEWPORTS) {
      await verifyRendering(browser, viewport, outputDirectory, findings);
      await verifyWebglUnavailable(
        browser,
        viewport,
        outputDirectory,
        findings,
      );
    }
  } finally {
    await browser.close();
    server.kill();
  }
  await writeFile(
    resolve(outputDirectory, "report.json"),
    JSON.stringify(findings, null, 2) + "\n",
  );
  console.log(JSON.stringify(findings, null, 2));
}

await main();
