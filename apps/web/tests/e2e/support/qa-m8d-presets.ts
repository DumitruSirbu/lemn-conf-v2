// M8D QA — Step 1's preset screens in a real browser WITHOUT a database row. The preset library is faked at the browser
// by Playwright route interception, exactly as `preset-owner-loop.ts` fakes it (ADR 0151: no preset row is ever
// written by a test), and so is the one write Select can start, the mint (`POST /api/designs`): it is held, refused or
// answered with the day's limit here and never reaches the server. Everything else on the page is the real build.
//
// Three routes are answered: the listing (`GET /api/presets`), each image (`GET /api/presets/{id}/image`) and the
// mint. A request to the preset save (`POST /api/designs/{id}/preset`) is failed loudly: no spec of this family may
// reach it. `unexpectedWrites` records every non-GET request that reached any of the faked prefixes and was not one of
// the answered mints, so a spec can assert that nothing else was attempted.
import {
  KITCHEN_L_DESIGN,
  presetNameFactsOf,
  presetRoomOf,
} from "@lemnaria/configurator-domain";
import { expect, type Locator, type Page, type Route } from "@playwright/test";

import { countPixels, type PixelRect } from "./pixels";

/** The seeded L kitchen's own room, in metres, so the offers are unchanged and no adaptation can drop a body. */
export const L_ROOM_PATH =
  "/configurator/room?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left";

const PRESET_LIST_PATH = "/api/presets";
const MINT_PATH = "/api/designs";
const OK_STATUS = 200;
const NOT_FOUND_STATUS = 404;
const MINT_LIMIT_STATUS = 429;
const MINT_REFUSED_STATUS = 500;

/** The sources the plan names (L-2): the stored 4:3, the frames' placeholder, and a tall one. */
export const IMAGE_SOURCES = {
  stored: { width: 1280, height: 960 },
  wide: { width: 924, height: 540 },
  tall: { width: 600, height: 900 },
} as const;

export type ImageSource = keyof typeof IMAGE_SOURCES;

/** What an image request is answered with: a source, a 404 (the failed state), or held until the spec releases it. */
export type ImageAnswer = ImageSource | "missing" | "held";

export interface FakeOffer {
  /** 21 characters of `[A-Za-z0-9_-]`: the shape the browser requires of a preset's id, or it drops the item. */
  readonly id: string;
  readonly typedName?: string;
  readonly image: ImageAnswer;
}

/** What the mint is answered with. `held` never answers until `releaseMint`. */
export type MintAnswer = "held" | "refused" | "limited";

export interface FakeLibrary {
  /** The listing request's own delay in milliseconds, set before the page asks. */
  listingDelayMs: number;
  mintAnswer: MintAnswer;
  readonly mintRequests: string[];
  readonly imageRequests: string[];
  /** Non-GET requests to a preset or design route that were neither a mint nor the preset save (the save is failed). */
  readonly unexpectedWrites: string[];
  /** Resolves every image the spec held. */
  releaseHeldImages: () => void;
}

/** Offer ids are `m8d` plus a zero-padded position, 21 characters, so a list of any size has valid, distinct ids. */
export function offerIdAt(position: number): string {
  return `m8dQaPreset${String(position).padStart(10, "0")}`;
}

export function offersNamed(
  names: readonly (string | undefined)[],
  image: ImageAnswer = "stored",
): FakeOffer[] {
  return names.map((typedName, position) => ({
    id: offerIdAt(position + 1),
    ...(typedName === undefined ? {} : { typedName }),
    image,
  }));
}

export async function fakeLibraryOn(
  page: Page,
  offers: readonly FakeOffer[],
): Promise<FakeLibrary> {
  const held: (() => void)[] = [];
  const library: FakeLibrary = {
    listingDelayMs: 0,
    mintAnswer: "held",
    mintRequests: [],
    imageRequests: [],
    unexpectedWrites: [],
    releaseHeldImages: () => {
      for (const release of held.splice(0)) release();
    },
  };

  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    const isMint = request.method() === "POST" && pathname === MINT_PATH;
    if (request.method() !== "GET" && pathname.startsWith("/api/") && !isMint) {
      library.unexpectedWrites.push(`${request.method()} ${pathname}`);
    }
  });
  await page.route(
    (url) => url.pathname === PRESET_LIST_PATH,
    (route) => answerListing(route, offers, library),
  );
  await page.route(
    (url) => IMAGE_PATH.test(url.pathname),
    (route) => answerImage(route, offers, library, held),
  );
  await page.route(
    (url) => url.pathname === MINT_PATH,
    (route) => answerMint(route, library),
  );
  await page.route(
    (url) => PRESET_SAVE_PATH.test(url.pathname),
    (route) => {
      library.unexpectedWrites.push(
        `${route.request().method()} ${route.request().url()}`,
      );
      return route.abort("failed");
    },
  );
  return library;
}

const IMAGE_PATH = /^\/api\/presets\/([^/]+)\/image$/;
const PRESET_SAVE_PATH = /^\/api\/designs\/[^/]+\/preset$/;

async function answerListing(
  route: Route,
  offers: readonly FakeOffer[],
  library: FakeLibrary,
): Promise<void> {
  if (route.request().method() !== "GET") {
    library.unexpectedWrites.push(
      `${route.request().method()} ${route.request().url()}`,
    );
    return route.abort("failed");
  }
  if (library.listingDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, library.listingDelayMs));
  }
  await route.fulfill({
    status: OK_STATUS,
    contentType: "application/json",
    body: JSON.stringify({ presets: offers.map(summaryOf) }),
  });
}

/** One item as `presetSummaryOf` builds it from a stored row, from the seeded L kitchen. */
function summaryOf(offer: FakeOffer): unknown {
  const { shape, walls, heightMm } = presetRoomOf(KITCHEN_L_DESIGN);
  return {
    id: offer.id,
    shape,
    walls,
    heightMm,
    ...(offer.typedName === undefined ? {} : { typedName: offer.typedName }),
    nameFacts: presetNameFactsOf(KITCHEN_L_DESIGN),
    imageUrl: `${PRESET_LIST_PATH}/${offer.id}/image`,
    design: { ...KITCHEN_L_DESIGN, presetId: null },
  };
}

async function answerImage(
  route: Route,
  offers: readonly FakeOffer[],
  library: FakeLibrary,
  held: (() => void)[],
): Promise<void> {
  const id = IMAGE_PATH.exec(new URL(route.request().url()).pathname)?.[1];
  const offer = offers.find((candidate) => candidate.id === id);
  library.imageRequests.push(id ?? "");
  if (offer === undefined || offer.image === "missing") {
    return route.fulfill({ status: NOT_FOUND_STATUS });
  }
  if (offer.image === "held") {
    await new Promise<void>((release) => held.push(release));
    return route.fulfill({
      status: OK_STATUS,
      contentType: "image/svg+xml",
      body: svgOf("stored"),
    });
  }
  await route.fulfill({
    status: OK_STATUS,
    contentType: "image/svg+xml",
    body: svgOf(offer.image),
  });
}

/** A blue picture whose outer 24 units are a red frame, so that whether the whole picture is shown (every side of the
 *  frame visible, nothing stretched) is a measurement and not a look. */
export function svgOf(source: ImageSource): string {
  const { width, height } = IMAGE_SOURCES[source];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" ` +
    `viewBox="0 0 ${String(width)} ${String(height)}">` +
    `<rect width="${String(width)}" height="${String(height)}" fill="#2a6fdb"/>` +
    `<rect width="${String(width)}" height="${String(height)}" fill="none" stroke="#ff0000" stroke-width="48"/>` +
    `</svg>`
  );
}

async function answerMint(route: Route, library: FakeLibrary): Promise<void> {
  const request = route.request();
  if (request.method() !== "POST") return route.fallback();
  library.mintRequests.push(
    `${request.method()} ${new URL(request.url()).pathname}`,
  );
  if (library.mintAnswer === "held") return new Promise<void>(() => undefined);
  if (library.mintAnswer === "limited") {
    return route.fulfill({
      status: MINT_LIMIT_STATUS,
      contentType: "application/json",
      body: JSON.stringify({ code: "MINT_LIMIT_REACHED" }),
    });
  }
  await route.fulfill({
    status: MINT_REFUSED_STATUS,
    contentType: "application/json",
    body: "{}",
  });
}

/** 1D, then 1E: opens the room, continues, and waits for the list. */
export async function openTheList(
  page: Page,
  locale: "ro" | "ru" = "ro",
): Promise<void> {
  await page.goto(`/${locale}${L_ROOM_PATH}`);
  await expect(page.locator("main[data-room-substate]")).toHaveAttribute(
    "data-room-substate",
    "1D",
  );
  await page.getByTestId("room-continue").click();
  await expect(page.getByTestId("room-presets")).toBeVisible();
}

/** Opens the Preview pop-up on the `position`-th card (1-based). */
export async function openPreviewOf(
  page: Page,
  position: number,
): Promise<void> {
  await page
    .getByTestId("room-preset-preview")
    .nth(position - 1)
    .click();
  await expect(page.getByTestId("preset-carousel-dialog")).toBeVisible();
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A locator's bounding box, which is `null` for anything not rendered: a spec that asks for one wants it on screen. */
export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("nothing is rendered at that locator");
  return box;
}

export const NAMES_OF_EVERY_LENGTH: readonly string[] = Array.from(
  { length: 80 },
  (_, position) => spacedNameOf(position + 1),
);

/** `length` characters of words (so it wraps at spaces), never ending in a space: names are trimmed on write. */
function spacedNameOf(length: number): string {
  const words = "Small kitchen in an L shape ";
  return words
    .repeat(Math.ceil(length / words.length))
    .slice(0, length)
    .trimEnd()
    .padEnd(length, "x");
}

/** The name as one unbroken word, the widest case: 80 capital Ws, and 80 Cyrillic letters for `ru`. */
export const UNBROKEN_WORDS: readonly string[] = [
  "W".repeat(80),
  "Ж".repeat(80),
  "Подогнанная".repeat(8).slice(0, 80),
];

const FRAME_UNITS = 24;
const RED = [255, 0, 0] as const;
const BLUE = [42, 111, 219] as const;
const COLOUR_TOLERANCE = 60;
const MIN_FRAME_COVERAGE = 0.9;

/**
 * The picture is whole when the red frame's four sides are all on screen where `contain` puts them, and nothing of the
 * picture is outside that rectangle. A `cover` crop loses two sides of the frame; a `fill` stretch moves the frame to
 * the box's edges, off the rectangle computed here.
 */
export async function expectPictureShownWhole(
  page: Page,
  box: PixelRect,
  source: ImageSource,
): Promise<void> {
  const natural = IMAGE_SOURCES[source];
  const scale = Math.min(
    box.width / natural.width,
    box.height / natural.height,
  );
  const content = {
    width: natural.width * scale,
    height: natural.height * scale,
    x: box.x + (box.width - natural.width * scale) / 2,
    y: box.y + (box.height - natural.height * scale) / 2,
  };
  const thickness = FRAME_UNITS * scale;
  const strip = Math.max(2, thickness - 4);
  const inset = 2;
  const sides: Record<string, PixelRect> = {
    top: {
      x: content.x + thickness,
      y: content.y + inset,
      width: content.width - 2 * thickness,
      height: strip,
    },
    bottom: {
      x: content.x + thickness,
      y: content.y + content.height - inset - strip,
      width: content.width - 2 * thickness,
      height: strip,
    },
    left: {
      x: content.x + inset,
      y: content.y + thickness,
      width: strip,
      height: content.height - 2 * thickness,
    },
    right: {
      x: content.x + content.width - inset - strip,
      y: content.y + thickness,
      width: strip,
      height: content.height - 2 * thickness,
    },
  };

  for (const [side, clip] of Object.entries(sides)) {
    const area = Math.floor(clip.width) * Math.floor(clip.height);
    const red = await countPixels(page, roundedClip(clip), {
      kind: "near",
      color: RED,
      tolerance: COLOUR_TOLERANCE,
    });
    expect(
      red / area,
      `the picture's ${side} frame side is shown in ${source}`,
    ).toBeGreaterThanOrEqual(MIN_FRAME_COVERAGE);
  }
  for (const letterbox of letterboxesOf(box, content)) {
    const red = await countPixels(page, roundedClip(letterbox), {
      kind: "near",
      color: RED,
      tolerance: COLOUR_TOLERANCE,
    });
    const blue = await countPixels(page, roundedClip(letterbox), {
      kind: "near",
      color: BLUE,
      tolerance: COLOUR_TOLERANCE,
    });
    expect(
      red + blue,
      `no picture outside the contained rectangle in ${source}`,
    ).toBe(0);
  }
}

/** The parts of the box the contained picture leaves empty, shrunk by 2 px so antialiasing at the edge is not counted. */
function letterboxesOf(box: PixelRect, content: PixelRect): PixelRect[] {
  const margin = 2;
  const empty: PixelRect[] = [];
  const above = content.y - box.y - margin;
  const sideways = content.x - box.x - margin;
  if (above > margin)
    empty.push({
      x: box.x + margin,
      y: box.y + 1,
      width: box.width - 2 * margin,
      height: above - 1,
    });
  if (above > margin)
    empty.push({
      x: box.x + margin,
      y: content.y + content.height + margin,
      width: box.width - 2 * margin,
      height: above - 1,
    });
  if (sideways > margin)
    empty.push({
      x: box.x + 1,
      y: box.y + margin,
      width: sideways - 1,
      height: box.height - 2 * margin,
    });
  if (sideways > margin)
    empty.push({
      x: content.x + content.width + margin,
      y: box.y + margin,
      width: sideways - 1,
      height: box.height - 2 * margin,
    });
  return empty;
}

function roundedClip(clip: PixelRect): PixelRect {
  return {
    x: Math.ceil(clip.x),
    y: Math.ceil(clip.y),
    width: Math.floor(clip.width),
    height: Math.floor(clip.height),
  };
}
