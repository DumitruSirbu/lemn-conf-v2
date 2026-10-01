// Shared by the M7B U7 S0 first-frame specs (`ssr-first-frame`, `qa-u7s0-ssr.adversarial`): watch what a
// page paints from its first moment, and hear React's complaint if the hydration pass disagrees with
// the HTML the server sent (ADR 0133).
import type { Page } from "@playwright/test";

import { ro } from "../../support/romanian-content.e2e";

/**
 * React's hydration complaints in **both** builds. Development names them ("Hydration failed …", "A
 * tree hydrated but some attributes … didn't match"). A production build throws the minified codes
 * instead — 418 (text content), 419 and 423 (recoverable hydration errors), 425 (text) — which a
 * `/hydrat/` pattern alone never sees. The positive control in `ssr-first-frame.e2e.spec.ts` provokes a
 * real mismatch and requires this to fire, under `next dev` and under `next start`.
 */
export const HYDRATION_COMPLAINT =
  /hydrat|did not match|didn't match|React error #(418|419|423|425)\b/i;

/** Every hydration complaint the page raises from now on, as console errors or uncaught page errors.
 *  The array grows as the page runs; read it after the page has settled. */
export function collectHydrationComplaints(page: Page): string[] {
  const complaints: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      HYDRATION_COMPLAINT.test(message.text())
    ) {
      complaints.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (HYDRATION_COMPLAINT.test(error.message)) complaints.push(error.message);
  });
  return complaints;
}

/** What one painted frame showed: how many camera chips, and which price total. */
export interface FrameSample {
  readonly chips: number;
  readonly price: string;
}

interface SamplerOptions {
  readonly groupLabel: string;
}

/** Runs in the page from the document's first moment (serialised, so it may not capture anything):
 *  on every animation frame, records the chip count and the price total once both are on the page. */
function sampleEveryFrame({ groupLabel }: SamplerOptions): void {
  const samples: FrameSample[] = [];
  Reflect.set(window, "__firstFrameSamples", samples);
  const sample = (): void => {
    const row = document.querySelector(
      `[role="group"][aria-label="${groupLabel}"]`,
    );
    const price = document.querySelector('[data-testid="price-bar-total"]');
    if (row !== null && price !== null) {
      samples.push({
        chips: row.querySelectorAll("button").length,
        price: price.textContent,
      });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

/** Installs the per-frame sampler for every document this page loads from now on. */
export async function installFrameSampler(page: Page): Promise<void> {
  await page.addInitScript(sampleEveryFrame, {
    groupLabel: ro.configure.cameraGroupLabel,
  });
}

/** The frames the current document has painted since it began, after two more have gone by so that
 *  hydration's own commit is among them. */
export async function readPaintedFrames(page: Page): Promise<FrameSample[]> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
  return page.evaluate(
    () => Reflect.get(window, "__firstFrameSamples") as FrameSample[],
  );
}

/** Runs in the page from the document's first moment (serialised, so it may not capture anything):
 *  rewrites the server-rendered price total the moment the parser inserts it, which is before any
 *  script has hydrated it. */
function tamperWithTheServerRenderedPrice(): void {
  const observer = new MutationObserver(() => {
    const total = document.querySelector('[data-testid="price-bar-total"]');
    if (total === null) return;
    total.textContent = "TAMPERED";
    observer.disconnect();
  });
  observer.observe(document, { childList: true, subtree: true });
}

/** Makes every document this page loads disagree with what its client will render, so hydration has
 *  a real text mismatch to report. */
export async function provokeAHydrationMismatch(page: Page): Promise<void> {
  await page.addInitScript(tamperWithTheServerRenderedPrice);
}
