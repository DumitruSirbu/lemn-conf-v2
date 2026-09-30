// Support for M7 wave 7K, the mobile gate (`docs/milestones/M7-room-and-presets.md`, *Wave 7K — the
// plan*, D4 and D5): navigation, recorders and readouts for `mobile-gate.e2e.spec.ts`, and **no
// assertion** — every claim the gate makes stays in the spec (`browser-and-visual-qa.md`, *Browser
// test design*).
//
// **By touch, and nothing but** (D5, criterion 1). Every control here is reached with `tap()` and
// every digit with `pressSequentially`, which is what a soft keyboard produces. There is no `click`,
// no mouse, no `fill` over a length and no `goto` to a room query in this file.
//
// The scene readout and its projection arithmetic are **imported** from `mirror-flow.ts`, which
// already exports them (D4) — a third copy would be the duplication G17 records.
import { readFileSync } from "node:fs";

import {
  test as base,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import { createTranslator, type Messages } from "next-intl";

import { deleteMintedDesigns } from "./minted-designs";
import {
  centreOf,
  projectToCanvasX,
  projectToCanvasY,
  readScene,
  type SceneBodyBounds,
} from "./mirror-flow";

export type Locale = "ro" | "ru";

/** The length fields a journey types into. `wallC` is the U's (`u-steps.ts`). */
export type LengthField = "wallA" | "wallB" | "wallC" | "height";

const DESIGNS_ENDPOINT = "/api/designs";

/** The step pill's denominator: Step 1 of 4 at the room, step 2 of 4 in the editor (G15). */
const TOTAL_STEPS = 4;

// -------------------------------------------------------------------------------------------
// Copy, resolved from the message catalogues the app renders — never spelled here.
// -------------------------------------------------------------------------------------------

const MESSAGES_BY_LOCALE: Readonly<Record<Locale, Messages>> = {
  ro: readMessages("ro"),
  ru: readMessages("ru"),
};

function readMessages(locale: Locale): Messages {
  return JSON.parse(
    readFileSync(
      new URL(`../../../src/messages/${locale}.json`, import.meta.url),
      "utf8",
    ),
  ) as Messages;
}

function translatorFor(locale: Locale) {
  return createTranslator({ locale, messages: MESSAGES_BY_LOCALE[locale] });
}

/** The pill's accessible name at `step` — `configure.step`, the leaf both the room and the editor
 *  render their pill's `aria-label` from (G15). */
export function stepSentence(locale: Locale, step: number): string {
  return translatorFor(locale)("configure.step", {
    step,
    totalSteps: TOTAL_STEPS,
  });
}

/** The editor's camera group, by the leaf it is named with. */
export function cameraGroupLabel(locale: Locale): string {
  return translatorFor(locale)("configure.cameraGroupLabel");
}

// -------------------------------------------------------------------------------------------
// Step 1: where things are, and how a finger reaches them.
// -------------------------------------------------------------------------------------------

export function roomPath(locale: Locale): string {
  return `/${locale}/configurator/room`;
}

export function editorPath(locale: Locale, designId: string): string {
  return `/${locale}/d/${encodeURIComponent(designId)}`;
}

/** True for the editor's own URL, `/{locale}/d/{id}`, with nothing after the id. */
export function isEditorUrl(url: URL, locale: Locale): boolean {
  return new RegExp(`^/${locale}/d/[^/]+$`).test(url.pathname);
}

/** The screen, and the marker the sub-state is read off (`room-screen.tsx:153-157`). */
export function roomScreen(page: Page): Locator {
  return page.locator("main[data-room-substate]");
}

export function continueButton(page: Page): Locator {
  return page.getByTestId("room-continue");
}

export function lengthField(page: Page, field: LengthField): Locator {
  return page.getByTestId(`room-length-${field}`);
}

/** Focuses a length field with a finger, then types its digits one keystroke at a time. */
export async function typeDigits(
  page: Page,
  field: LengthField,
  digits: string,
): Promise<void> {
  const input = lengthField(page, field);
  await input.tap();
  await input.pressSequentially(digits);
}

/** Takes the last `count` digits back off a field from the keyboard — `End`, then `Backspace` once
 *  per digit — so a correction is typed, never written over with `fill`. */
export async function eraseDigits(
  page: Page,
  field: LengthField,
  count: number,
): Promise<void> {
  const input = lengthField(page, field);
  await input.tap();
  await input.press("End");
  for (let erased = 0; erased < count; erased += 1) {
    await input.press("Backspace");
  }
}

/** The id the hand-off navigated to. The path segment is escaped on the way in
 *  (`use-generation.ts:434`), so it is unescaped on the way out. */
export function idInEditorUrl(url: string): string {
  const id = new URL(url).pathname.split("/").pop();
  if (id === undefined || id === "") throw new Error(`no design id in ${url}`);
  return decodeURIComponent(id);
}

// -------------------------------------------------------------------------------------------
// Recorders — observation only (the plan's *Must not happen*: no interception alters a response).
// -------------------------------------------------------------------------------------------

/** One save the browser sent: the row it was aimed at, and the document it carried. */
export interface CapturedSave {
  readonly designId: string;
  readonly body: unknown;
}

/** Every design write this page made, counted as it left the browser. */
export interface DesignWrites {
  readonly postCount: () => number;
  readonly saves: () => readonly CapturedSave[];
  /** The ids every successful `POST /api/designs` answered with, once their bodies have been read —
   *  awaiting any mint still in flight. The fixture below deletes exactly these (ADR 0006; criterion
   *  16), which is why an id is taken from the observed response and never from a URL the test might
   *  not reach (risk R7). */
  readonly mintedIds: () => Promise<readonly string[]>;
  /** The same ids, but a mint whose response has not arrived within `timeoutMs` is logged and
   *  skipped rather than awaited — for teardown, which must neither hang nor throw. */
  readonly mintedIdsWithin: (timeoutMs: number) => Promise<readonly string[]>;
}

function isMint(request: Request): boolean {
  return (
    request.method() === "POST" &&
    new URL(request.url()).pathname === DESIGNS_ENDPOINT
  );
}

/** A `PUT` or `PATCH` to `/api/designs/{id}` — the route treats both as a save. The share route
 *  (`/api/designs/{id}/share`) is one segment deeper and is not a save. */
function saveTargetOf(request: Request): string | undefined {
  if (request.method() !== "PUT" && request.method() !== "PATCH")
    return undefined;
  const match = new RegExp(`^${DESIGNS_ENDPOINT}/([^/]+)$`).exec(
    new URL(request.url()).pathname,
  );
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
}

async function mintedIdIn(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { id?: unknown };
    return typeof body.id === "string" && body.id !== "" ? body.id : undefined;
  } catch {
    return undefined;
  }
}

/** The id a mint answered with, or `undefined` if it failed, was refused, or never got a response
 *  (`request.response()` resolves `null` on a network error and rejects if the page went away). */
async function mintedIdOf(request: Request): Promise<string | undefined> {
  try {
    const response = await request.response();
    return response?.ok() === true ? await mintedIdIn(response) : undefined;
  } catch {
    return undefined;
  }
}

/** A mint still unanswered when the bound runs out, so teardown moves on instead of hanging. */
const UNANSWERED_MINT = Symbol("unanswered mint");

async function withinBound(
  mint: Promise<string | undefined>,
  timeoutMs: number,
): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<typeof UNANSWERED_MINT>((resolve) => {
    timer = setTimeout(() => {
      resolve(UNANSWERED_MINT);
    }, timeoutMs);
  });
  const outcome = await Promise.race([mint, bound]);
  clearTimeout(timer);
  if (outcome !== UNANSWERED_MINT) return outcome;
  console.warn(
    `mobile gate cleanup: a POST ${DESIGNS_ENDPOINT} had no response after ${String(timeoutMs)} ms; ` +
      "its row, if one was written, is not deleted by this run",
  );
  return undefined;
}

function definedIds(ids: readonly (string | undefined)[]): string[] {
  return ids.filter((id): id is string => id !== undefined);
}

export function recordDesignWrites(page: Page): DesignWrites {
  let posts = 0;
  const saves: CapturedSave[] = [];
  // Registered when the `POST` **leaves the browser**, not when its response arrives: an assertion
  // that throws while the mint is still in flight (criterion 14 holds it for 1.5 s) must not leave
  // teardown with an empty list and the row in the database (risk R7).
  const mints: Promise<string | undefined>[] = [];

  page.on("request", (request) => {
    if (isMint(request)) {
      posts += 1;
      mints.push(mintedIdOf(request));
    }
    const designId = saveTargetOf(request);
    if (designId !== undefined) {
      saves.push({ designId, body: request.postDataJSON() as unknown });
    }
  });

  return {
    postCount: () => posts,
    saves: () => saves,
    mintedIds: async () => definedIds(await Promise.all(mints)),
    mintedIdsWithin: async (timeoutMs) =>
      definedIds(
        await Promise.all(mints.map((mint) => withinBound(mint, timeoutMs))),
      ),
  };
}

/** An ordered record of pathnames, read from a mark onward. */
export interface PathnameRecord {
  /** A position in the record, to read from later. */
  readonly mark: () => number;
  readonly since: (mark: number) => readonly string[];
}

function readableRecordOf(pathnames: readonly string[]): PathnameRecord {
  return {
    mark: () => pathnames.length,
    since: (mark) => pathnames.slice(mark),
  };
}

/** The main frame's committed pathnames, in order — same-document (router) commits included, which
 *  is what lets the gate say *"no other pathname"* between a tap and the editor (criterion 6). */
export type CommittedPathnames = PathnameRecord;

export function recordCommittedPathnames(page: Page): CommittedPathnames {
  const pathnames: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame())
      pathnames.push(new URL(frame.url()).pathname);
  });
  return readableRecordOf(pathnames);
}

/** The pathname of every request the page **issued**, in order, whatever became of it. A router
 *  `push` requests its target the instant it runs, so this sees a navigation that a slow response or
 *  a cold compile would keep from ever being committed (criterion 14). */
export type RequestedPathnames = PathnameRecord;

export function recordRequestedPathnames(page: Page): RequestedPathnames {
  const pathnames: string[] = [];
  page.on("request", (request) => {
    pathnames.push(new URL(request.url()).pathname);
  });
  return readableRecordOf(pathnames);
}

/** True for a pathname on the editor's route — `/d/{id}` with or without a locale prefix. */
export function isEditorRoutePathname(pathname: string): boolean {
  return /^\/(?:[^/]+\/)?d\//.test(pathname);
}

export function recordPageErrors(page: Page): readonly string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

/** How long teardown waits for a mint still in flight — the emulated 1.5 s round trip of criterion 14
 *  many times over, on `next dev` — before it logs the id as unrecoverable and moves on. */
const MINT_RESPONSE_BOUND_IN_TEARDOWN_MS = 15_000;

/**
 * The test fixture every gate test runs under: its own page's writes and commits recorded from before
 * the first navigation, its page errors collected, and — in teardown, which Playwright runs whether
 * the test passed or not — every design it minted deleted.
 */
export const test = base.extend<{
  designWrites: DesignWrites;
  committedPathnames: CommittedPathnames;
  pageErrors: readonly string[];
}>({
  designWrites: async ({ page }, use) => {
    const writes = recordDesignWrites(page);
    try {
      await use(writes);
    } finally {
      await deleteMintedDesigns(
        await writes.mintedIdsWithin(MINT_RESPONSE_BOUND_IN_TEARDOWN_MS),
      );
    }
  },
  committedPathnames: async ({ page }, use) => {
    await use(recordCommittedPathnames(page));
  },
  pageErrors: async ({ page }, use) => {
    await use(recordPageErrors(page));
  },
});

// -------------------------------------------------------------------------------------------
// In-page observers, for what only an atomic read inside the browser can tell.
// -------------------------------------------------------------------------------------------

/** What the page saw between *Continuă* at 1D and the editor (criterion 6). */
export interface HandOffObservation {
  /** 1F was on screen while the pill still announced step 1. */
  readonly sawComposeAtStepOne: boolean;
  /** Every `data-compose-phase` 1F was drawn in — `composed` among them, or the next field says
   *  nothing, because the dropped-roles line can only appear there. */
  readonly composePhases: readonly string[];
  readonly sawDroppedRoles: boolean;
}

const HAND_OFF_KEY = "__mobileGateHandOff";

/**
 * Watches 1F from inside the page, so *"1F at step 1"* is one read of one DOM rather than two reads a
 * navigation could fall between. Installed at 1D; the hand-off is a client-side `push`, so the window
 * — and this record — survive into the editor.
 */
export async function watchTheHandOff(
  page: Page,
  stepOneSentence: string,
): Promise<void> {
  await page.evaluate(
    ({ key, stepOne }) => {
      const seen = {
        sawComposeAtStepOne: false,
        composePhases: [] as string[],
        sawDroppedRoles: false,
      };
      const look = () => {
        const notice = document.querySelector(
          "[data-testid='room-compose-notice']",
        );
        if (notice !== null) {
          const pill = document.querySelector("[data-testid='top-bar-step']");
          if (pill?.getAttribute("aria-label") === stepOne)
            seen.sawComposeAtStepOne = true;
          const phase = notice.getAttribute("data-compose-phase");
          if (phase !== null && !seen.composePhases.includes(phase))
            seen.composePhases.push(phase);
        }
        if (
          document.querySelector("[data-testid='room-compose-dropped']") !==
          null
        )
          seen.sawDroppedRoles = true;
      };
      new MutationObserver(look).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
      });
      Reflect.set(window, key, seen);
    },
    { key: HAND_OFF_KEY, stepOne: stepOneSentence },
  );
}

/** `undefined` if the page was replaced — which would itself mean the hand-off was not a client-side
 *  navigation. */
export async function readTheHandOff(
  page: Page,
): Promise<HandOffObservation | undefined> {
  return page.evaluate(
    (key) => Reflect.get(window, key) as HandOffObservation | undefined,
    HAND_OFF_KEY,
  );
}

/** Design writes as the page's own `fetch` saw them, and the count at the instant a finger touched
 *  1F's *Înapoi* (criterion 14's precondition, read atomically in the browser). */
export interface WritesInPage {
  readonly pending: number;
  readonly settled: number;
  /** -1 until *Înapoi* in 1F is touched. */
  readonly pendingAtBackTouch: number;
}

const WRITES_KEY = "__mobileGateWrites";

/**
 * Counts `POST`/`PUT` to `/api/designs` in flight, by wrapping `fetch` **for observation only**: the
 * request goes out unchanged and the caller receives the very response the network produced. The
 * repository reads the global `fetch` at call time (`fetch-configuration-repository.ts:322-324`), so
 * a wrapper installed at 1D sees the hand-off's writes.
 */
export async function watchDesignWritesInPage(page: Page): Promise<void> {
  await page.evaluate(
    ({ key, endpoint }) => {
      const state = { pending: 0, settled: 0, pendingAtBackTouch: -1 };
      const networkFetch = window.fetch.bind(window);
      const isDesignWrite = (
        input: RequestInfo | URL,
        init: RequestInit | undefined,
      ) => {
        const href =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const method = (
          init?.method ?? (input instanceof Request ? input.method : "GET")
        ).toUpperCase();
        return (
          new URL(href, location.href).pathname.startsWith(endpoint) &&
          (method === "POST" || method === "PUT")
        );
      };
      window.fetch = async (input, init) => {
        if (!isDesignWrite(input, init)) return networkFetch(input, init);
        state.pending += 1;
        return networkFetch(input, init).finally(() => {
          state.pending -= 1;
          state.settled += 1;
        });
      };
      document.addEventListener(
        "touchstart",
        (event) => {
          const back =
            event.target instanceof Element
              ? event.target.closest("[data-testid='room-compose-back']")
              : null;
          if (back !== null) state.pendingAtBackTouch = state.pending;
        },
        { capture: true },
      );
      Reflect.set(window, key, state);
    },
    { key: WRITES_KEY, endpoint: DESIGNS_ENDPOINT },
  );
}

export async function readDesignWritesInPage(
  page: Page,
): Promise<WritesInPage> {
  return page.evaluate(
    (key) => Reflect.get(window, key) as WritesInPage,
    WRITES_KEY,
  );
}

/** Resolves once a design write is in flight in the page — the moment criterion 14 taps at. */
export async function waitForAWriteInFlight(
  page: Page,
  timeoutMs: number,
): Promise<void> {
  await page.waitForFunction(
    (key) => (Reflect.get(window, key) as WritesInPage).pending > 0,
    WRITES_KEY,
    { timeout: timeoutMs },
  );
}

/** Resolves once `count` design writes have settled and none is in flight. */
export async function waitForWritesToSettle(
  page: Page,
  { count, timeoutMs }: { count: number; timeoutMs: number },
): Promise<void> {
  await page.waitForFunction(
    ({ key, settledCount }) => {
      const state = Reflect.get(window, key) as WritesInPage;
      return state.pending === 0 && state.settled >= settledCount;
    },
    { key: WRITES_KEY, settledCount: count },
    { timeout: timeoutMs },
  );
}

/** Chrome's own network emulation (`room-late-echo.e2e.spec.ts`'s precedent, G12): every request
 *  pays `latencyMs`. Returns the undo. */
export async function emulateNetworkLatency(
  page: Page,
  latencyMs: number,
): Promise<() => Promise<void>> {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  const conditionsAt = (latency: number) =>
    session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  await conditionsAt(latencyMs);
  return async () => {
    await conditionsAt(0);
    await session.detach();
  };
}

// -------------------------------------------------------------------------------------------
// The stored design, read back from the same browser.
// -------------------------------------------------------------------------------------------

export interface StoredDesignRead {
  readonly status: number;
  readonly design: unknown;
}

/** `GET /api/designs/{id}` from inside the page, so the visitor cookie that owns the row rides along
 *  (ADR 0114 decision 5). */
export async function readStoredDesign(
  page: Page,
  designId: string,
): Promise<StoredDesignRead> {
  return page.evaluate(
    async ({ endpoint, id }) => {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}`, {
        credentials: "same-origin",
      });
      const body = (await response.json().catch(() => ({}))) as {
        design?: unknown;
      };
      return { status: response.status, design: body.design };
    },
    { endpoint: DESIGNS_ENDPOINT, id: designId },
  );
}

// -------------------------------------------------------------------------------------------
// The editor end (D9): a base-row body, measured on the scene the customer is looking at.
// -------------------------------------------------------------------------------------------

export interface TapTarget {
  readonly placementId: string;
  /** Viewport coordinates, as `page.touchscreen.tap` takes them. */
  readonly x: number;
  readonly y: number;
}

/** A base-row body stands on the floor… */
const FLOOR_TOLERANCE_M = 0.01;
/** …and ends well below the wall row's 1.5 m floor, which is what separates it from a full-height
 *  column that also stands on the floor. */
const BASE_ROW_TOP_LIMIT_M = 1.2;
/** mirror-flow's rule (`:316-317`): a projected centre inside the canvas's middle 80 %. */
const MIDDLE_BAND_FROM = 0.1;
const MIDDLE_BAND_TO = 0.9;

function isBaseRowBody(body: SceneBodyBounds): boolean {
  return (
    Math.abs(body.min[1]) < FLOOR_TOLERANCE_M &&
    body.max[1] < BASE_ROW_TOP_LIMIT_M
  );
}

function isInsideTheMiddleBand(px: number, spanPx: number): boolean {
  return px > spanPx * MIDDLE_BAND_FROM && px < spanPx * MIDDLE_BAND_TO;
}

/** How far a body's centre stands from the corner the two walls meet at. The farthest is preferred
 *  for mirror-flow's reason (`:308-315`): a corner return's bounding-box centre sits over air. */
function distanceFromCornerM(body: SceneBodyBounds): number {
  const [x, , z] = centreOf(body);
  return Math.hypot(x, z);
}

/**
 * The base-row body to tap, chosen **from the scene readout at the current camera** — never a stored
 * pixel (G14): its projected centre lies in the canvas's middle 80 % on both axes, and the canvas
 * itself is what the browser reports at that point, so no overlay would take the touch.
 */
export async function findBaseRowTapTarget(page: Page): Promise<TapTarget> {
  const scene = await readScene(page);
  const candidates = scene.bodies
    .filter(isBaseRowBody)
    .sort((a, b) => distanceFromCornerM(b) - distanceFromCornerM(a))
    .map((body) => {
      const centre = centreOf(body);
      return {
        placementId: body.placementId,
        xPx: projectToCanvasX(centre, scene.camera, scene.canvasWidthPx),
        yPx: projectToCanvasY(centre, scene.camera, scene.canvasHeightPx),
      };
    })
    .filter(
      ({ xPx, yPx }) =>
        isInsideTheMiddleBand(xPx, scene.canvasWidthPx) &&
        isInsideTheMiddleBand(yPx, scene.canvasHeightPx),
    )
    .map(({ placementId, xPx, yPx }) => ({
      placementId,
      x: scene.canvasBox.x + xPx,
      y: scene.canvasBox.y + yPx,
    }));

  for (const candidate of candidates) {
    if (await isCanvasAt(page, candidate)) return candidate;
  }
  throw new Error(
    `no base-row body projects inside the canvas's middle 80 % with the canvas topmost there ` +
      `(${String(candidates.length)} candidates inside the band)`,
  );
}

async function isCanvasAt(page: Page, point: TapTarget): Promise<boolean> {
  return page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.tagName === "CANVAS",
    { x: point.x, y: point.y },
  );
}
