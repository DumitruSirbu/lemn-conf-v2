// Internal verification tooling. Pixel-diffs each ported render against the reference rig render
// captured under identical headless conditions, and writes an amplified difference image so a
// person can see *where* any difference is rather than only that one exists.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

import { ALL_SHOTS, OUTPUT_DIRECTORY } from "./fidelity-shots.mjs";

async function dataUrl(path) {
  return `data:image/png;base64,${(await readFile(path)).toString("base64")}`;
}

async function main() {
  const directory = resolve(process.argv[2] ?? OUTPUT_DIRECTORY);
  await mkdir(directory, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = [];
  try {
    for (const { name } of ALL_SHOTS) {
      const referenceUrl = await dataUrl(
        resolve(directory, `reference-rig-${name}-full-960x640.png`),
      );
      const portedUrl = await dataUrl(
        resolve(directory, `ported-${name}-full-960x640.png`),
      );
      const outcome = await page.evaluate(
        async ([a, b]) => {
          const load = (src) =>
            new Promise((done, fail) => {
              const image = new Image();
              image.onload = () => {
                done(image);
              };
              image.onerror = fail;
              image.src = src;
            });
          const [left, right] = await Promise.all([load(a), load(b)]);
          if (left.width !== right.width || left.height !== right.height) {
            return {
              error: `size mismatch ${left.width}x${left.height} vs ${right.width}x${right.height}`,
            };
          }
          const draw = (image) => {
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, image.width, image.height).data;
          };
          const one = draw(left);
          const two = draw(right);
          const diffCanvas = document.createElement("canvas");
          diffCanvas.width = left.width;
          diffCanvas.height = left.height;
          const diffContext = diffCanvas.getContext("2d");
          const diffImage = diffContext.createImageData(
            left.width,
            left.height,
          );
          let maxChannelDelta = 0;
          let totalDelta = 0;
          let differingPixels = 0;
          let visiblyDifferingPixels = 0;
          for (let i = 0; i < one.length; i += 4) {
            const dr = Math.abs(one[i] - two[i]);
            const dg = Math.abs(one[i + 1] - two[i + 1]);
            const db = Math.abs(one[i + 2] - two[i + 2]);
            const worst = Math.max(dr, dg, db);
            maxChannelDelta = Math.max(maxChannelDelta, worst);
            totalDelta += worst;
            if (worst > 0) differingPixels += 1;
            if (worst > 8) visiblyDifferingPixels += 1;
            const amplified = Math.min(255, worst * 16);
            diffImage.data[i] = amplified;
            diffImage.data[i + 1] = amplified === 0 ? 24 : 0;
            diffImage.data[i + 2] = amplified === 0 ? 24 : 0;
            diffImage.data[i + 3] = 255;
          }
          diffContext.putImageData(diffImage, 0, 0);
          const pixels = one.length / 4;
          return {
            pixels,
            maxChannelDelta,
            meanChannelDelta: totalDelta / pixels,
            differingPixelPercent: (differingPixels / pixels) * 100,
            visiblyDifferingPixelPercent:
              (visiblyDifferingPixels / pixels) * 100,
            diffPng: diffCanvas.toDataURL("image/png"),
          };
        },
        [referenceUrl, portedUrl],
      );

      if (outcome.error) {
        console.log(`${name}: ${outcome.error}`);
        continue;
      }
      const { diffPng, ...numbers } = outcome;
      await writeFile(
        resolve(directory, `diff-${name}-amplified16x.png`),
        Buffer.from(diffPng.split(",")[1], "base64"),
      );
      results.push({ name, ...numbers });
      console.log(
        `${name}: max channel delta ${String(numbers.maxChannelDelta)}/255, ` +
          `mean ${numbers.meanChannelDelta.toFixed(4)}, ` +
          `any-difference ${numbers.differingPixelPercent.toFixed(3)}%, ` +
          `visible (>8/255) ${numbers.visiblyDifferingPixelPercent.toFixed(4)}%`,
      );
    }
  } finally {
    await browser.close();
  }

  await writeFile(
    resolve(directory, "diff-report.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
}

await main();
