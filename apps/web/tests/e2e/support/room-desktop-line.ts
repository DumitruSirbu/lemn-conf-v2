// **Step 1's desktop line: what its three spec files share.** The viewports, frame figures, rooms,
// shared assertions, navigation and readouts of `room-desktop-line.criteria-03`, `-04-10` and
// `-12-17.desktop.e2e.spec.ts`, moved here unchanged when the one spec was split by criterion so that no
// file outgrows an e2e shard (`scripts/gates/e2e-shard-budget.mjs`). The head comment of each spec
// carries the contract; nothing here is a test.
import { readFileSync } from "node:fs";

import {
  expect,
  type Browser,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

import { countPixels } from "./pixels";
import { stepSentence } from "./step-one-by-touch";

export type Locale = "ro" | "ru";

export const LOCALES: readonly Locale[] = ["ro", "ru"];

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** The `desktop` project's own viewport (`playwright.config.ts:58-68`). */
export const DESKTOP: Viewport = { width: 1440, height: 900 };
/** One pixel either side of the codebase's one breakpoint (D2, criterion 3). */
export const LAST_PHONE_WIDTH: Viewport = { width: 899, height: 900 };
export const FIRST_DESKTOP_WIDTH: Viewport = { width: 900, height: 900 };
/** A short laptop (criterion 10, risk R7). */
export const SHORT_DESKTOP: Viewport = { width: 1280, height: 720 };
/** The frames' own width (`Desktop.dc.html:51`). */
export const WIDE_DESKTOP: Viewport = { width: 1920, height: 1080 };
/** The phone the `mobile` project pins, reached here by resizing (criterion 14). */
export const PHONE: Viewport = { width: 390, height: 844 };

/** Criterion 17's widths, each at a height inside its 720–1080 band. */
export const SIDEWAYS_VIEWPORTS: readonly Viewport[] = [
  FIRST_DESKTOP_WIDTH,
  SHORT_DESKTOP,
  DESKTOP,
  WIDE_DESKTOP,
];

// -------------------------------------------------------------------------------------------
// Frame figures — each cited to its mockup line, never read back from the stylesheet.
// -------------------------------------------------------------------------------------------

/** D1A `:52`: the top bar's band. */
export const TOP_BAR_BAND_PX = 76;
/** D1A `:52`: `padding: 0 40px` — the locale chip's right edge stands this far in. */
export const TOP_BAR_INSET_PX = 40;
/** D1A `:61`: the cards' column. */
export const SHAPE_COLUMN_MAX_PX = 1120;
/** D1A `:94`: *Continuă*'s height. */
export const CTA_HEIGHT_PX = 52;
/** D1B `:114`: the form column. */
export const FORM_COLUMN_MAX_PX = 520;
/** D1B `:115`: the gap between the form column and the plan panel; D1F `:475` draws the same. */
export const COLUMN_GAP_PX = 56;
/** D1B `:179`: the plan panel. */
export const PLAN_PANEL_MAX_PX = 900;
/** D1B `:183, 185`: 26 px walls, 14 px labels, a label standing 20 px off its wall (7L D6 b). */
export const DESKTOP_WALL_PX = 26;
export const DESKTOP_LABEL_LINE_PX = 14;
export const DESKTOP_LABEL_GAP_PX = 20;
/** The lane the drawing is never painted in: a label line and its gap (7L D6, criterion 7). */
export const DESKTOP_LABEL_LANE_PX =
  DESKTOP_LABEL_LINE_PX + DESKTOP_LABEL_GAP_PX;
/** The shortest box the desktop set can draw in: the lane, a wall, and the line beside the deepest
 *  wall (7L D6 e). */
export const DESKTOP_MINIMUM_BOX_HEIGHT_PX =
  DESKTOP_LABEL_LANE_PX + DESKTOP_WALL_PX + DESKTOP_LABEL_LINE_PX;
/** D1F `:475`: the steps column. */
export const STEPS_COLUMN_MAX_PX = 620;
/** D1F `:509`: the composition's plan panel. */
export const COMPOSE_PANEL_MAX_PX = 840;
/** `globals.css`'s `--touch-target`, written out: read from the page it would agree with any value. */
export const TOUCH_TARGET_PX = 44;

/** Every "±1" the criteria allow. */
export const LAYOUT_TOLERANCE_PX = 1;
/** Criterion 4's band tolerance. */
export const BAND_TOLERANCE_PX = 0.5;
/**
 * Mutation batches, not frames, before the first measured paint; the count rises with machine load, so
 * each leg's bound is its measured maximum under load and cannot see a one-paint regression (that is
 * pinned in `plan-preview.dom.test.ts`). See ADR 0139 d11.
 */
export const MAX_PRE_HYDRATION_PLAN_PAINTS =
  process.env.CI === undefined ? 9 : 7;

// -------------------------------------------------------------------------------------------
// Rooms, in the URL's own metres (ADR 0126).
// -------------------------------------------------------------------------------------------

export interface RoomWitness {
  readonly name: string;
  readonly query: string;
}

/** Frame D1C's own room (`Desktop.dc.html:198-272`): an L at 3600 x 450 x 2600. Wall B is under the
 *  approved L minimum, wall A and the height validate as a straight room — so wall B is refused and
 *  the linear suggestion shows (`room-issue-model.ts`'s `isLinearSuggested`). */
export const FRAME_ONE_C_ROOM = {
  name: "frame D1C's L room (3600 x 450 x 2600)",
  query: "shape=L&wallA=3.6&wallB=0.45&height=2.6&direction=left",
  /** Wall A and the height as the customer typed them, which a switch to linear keeps. */
  typed: { wallA: "3600", height: "2600" },
  /** The straight room the same wall A and height settle to: no wall B, no direction (ADR 0130 D7). */
  asLinearQuery: "shape=linear&wallA=3.6&height=2.6",
} as const;
/** 1C's vertical worst case (7F2 criterion 14): both walls too short and the ceiling too low. */
export const WORST_CASE_ROOM: RoomWitness = {
  name: "1C's worst case (800 x 800 x 2000)",
  query: "shape=L&wallA=0.8&wallB=0.8&height=2&direction=left",
};
/** D1B's own room (`Desktop.dc.html:179-188`), 3,60 m x 2,40 m, with the phone's 2600 ceiling. */
export const TYPED_L_ROOM = {
  wallA: 3600,
  wallB: 2400,
  height: 2600,
  query: "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left",
} as const;

/** The four 1B states criterion 6 and 16 walk: both L corners, the straight room, the U. */
export const ONE_B_STATES = [
  {
    name: "an L room, left corner",
    shape: "L",
    query: "shape=L&direction=left",
  },
  {
    name: "an L room, right corner",
    shape: "L",
    query: "shape=L&direction=right",
  },
  { name: "a straight room", shape: "linear", query: "shape=linear" },
  { name: "a U room", shape: "U", query: "shape=U&direction=left" },
] as const;

/** Which shapes draw the corner toggle. **Restated 2026-09-30 (M7B U5 S1; Q-U4 (b), ADR 0132
 *  decision 8): a U has one hand, so it draws none** — as a straight room, which has no corner, draws
 *  none. This spec expected the toggle on a U while nothing had said what a U's corner meant. */
export const DRAWS_THE_CORNER_TOGGLE = {
  L: true,
  linear: false,
  U: false,
} as const;

/** 1B for each shape, as the settle writes it: a straight room carries no direction (ADR 0130 D7). */
export const ONE_B_QUERY = {
  L: "shape=L&direction=left",
  linear: "shape=linear",
  U: "shape=U&direction=left",
} as const;

/** The fields each shape asks for, in field order (`requiredFieldsFor`), written out so the order
 *  the page draws is checked against something other than itself. */
export const FIELD_ORDER = {
  L: ["wallA", "wallB", "height"],
  linear: ["wallA", "height"],
  U: ["wallA", "wallB", "wallC", "height"],
} as const;

/** Rooms the large plan is fitted to (criterion 7) — at least one per binding axis and per shape. */
export const FITTED_ROOMS = [
  {
    name: "D1B's L, wall A binding",
    query: TYPED_L_ROOM.query,
    wallsMm: { A: TYPED_L_ROOM.wallA, B: TYPED_L_ROOM.wallB },
  },
  {
    name: "a deep L, the depth binding",
    query: "shape=L&wallA=2&wallB=5&height=2.6&direction=left",
    wallsMm: { A: 2000, B: 5000 },
  },
  {
    name: "a mirrored L",
    query: "shape=L&wallA=4.2&wallB=3&height=2.6&direction=right",
    wallsMm: { A: 4200, B: 3000 },
  },
  {
    name: "a straight room",
    query: "shape=linear&wallA=3.7&height=2.6",
    wallsMm: { A: 3700 },
  },
  {
    name: "a U room",
    query: "shape=U&wallA=3&wallB=2.5&wallC=2&height=2.6&direction=left",
    wallsMm: { A: 3000, B: 2500, C: 2000 },
  },
] as const;

// -------------------------------------------------------------------------------------------
// Copy — the top bar's titles, read from the catalogues the app renders.
// -------------------------------------------------------------------------------------------

export interface RoomTitles {
  readonly room: {
    readonly title: string;
    readonly compose: { readonly title: string };
  };
}

export function titlesFor(locale: Locale): RoomTitles {
  return JSON.parse(
    readFileSync(
      new URL(`../../../src/messages/${locale}.json`, import.meta.url),
      "utf8",
    ),
  ) as RoomTitles;
}

// ===========================================================================================
// Shared assertions — criteria that more than one sub-state owes.
// ===========================================================================================

export async function expectTheTopBarOfD1A(
  page: Page,
  expected: { readonly locale: Locale; readonly title: string },
): Promise<void> {
  await expect(page.getByTestId("top-bar-title")).toHaveText(expected.title);
  await expect(page.getByTestId("top-bar-step")).toHaveAttribute(
    "aria-label",
    stepSentence(expected.locale, 1),
  );
  await expect(page.locator("[role='progressbar'], progress")).toHaveCount(0);

  const bar = await readTopBar(page);
  const detail = JSON.stringify(bar);
  expect(
    Math.abs(height(bar.band) - TOP_BAR_BAND_PX),
    detail,
  ).toBeLessThanOrEqual(BAND_TOLERANCE_PX);
  expect(
    Math.abs(bar.viewportWidth - bar.chip.right - TOP_BAR_INSET_PX),
    detail,
  ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  expect(bar.chip.left, detail).toBeGreaterThan(bar.titleTextRight);
  expect(bar.chipIsLastInTheBand, detail).toBe(true);

  // **Nothing painted between the title and the chip** — the borrowed divider is gone. Every pixel
  // of the strip, above the band's own bottom rule, is the band's paper.
  const strip = {
    x: Math.ceil(bar.titleTextRight) + 2,
    y: Math.ceil(bar.band.top) + 2,
    width: Math.floor(bar.chip.left) - Math.ceil(bar.titleTextRight) - 4,
    height: Math.floor(height(bar.band)) - 6,
  };
  expect(strip.width, detail).toBeGreaterThan(0);
  const paperPixels = await countPixels(page, strip, {
    kind: "near",
    color: bar.paper,
    tolerance: PAPER_TOLERANCE,
  });
  expect(paperPixels, detail).toBe(strip.width * strip.height);
}

/** Rendering noise on a flat fill: the band is one colour with no gradient and no image, so anything
 *  past this is a painted thing rather than antialiasing. */
export const PAPER_TOLERANCE = 3;

export function expectTheDesktopDrawingFitted(
  drawing: PlanDrawing,
  wallsMm: Readonly<Partial<Record<"A" | "B" | "C", number>>>,
): void {
  const detail = JSON.stringify({ drawing, wallsMm });
  expect(drawing.measured, detail).toBe("true");
  expect(
    drawing.walls.map((wall) => wall.id),
    detail,
  ).toEqual(Object.keys(wallsMm));
  expect(
    Math.abs(drawing.svgWidth - drawing.boxWidth),
    detail,
  ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);

  const extent = unionOf(drawing.walls);
  const drawingRegionHeight = drawing.boxHeight - DESKTOP_LABEL_LANE_PX;
  const widthShortfall = drawing.boxWidth - width(extent);
  const heightShortfall = drawingRegionHeight - height(extent);
  expect(widthShortfall, detail).toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX);
  expect(heightShortfall, detail).toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX);
  expect(Math.min(widthShortfall, heightShortfall), detail).toBeLessThanOrEqual(
    LAYOUT_TOLERANCE_PX,
  );
  expect(extent.top, detail).toBeGreaterThanOrEqual(
    DESKTOP_LABEL_LANE_PX - LAYOUT_TOLERANCE_PX,
  );

  for (const wall of drawing.walls) {
    const thickness = wall.id === "A" ? height(wall) : width(wall);
    expect(thickness, detail).toBeCloseTo(DESKTOP_WALL_PX, 0);
  }
  expectOneScaleForEveryWall(drawing, wallsMm);

  for (const label of drawing.labels) {
    expect(label.fontSize, detail).toBe(`${String(DESKTOP_LABEL_LINE_PX)}px`);
    expect(label.left, detail).toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX);
    expect(label.top, detail).toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX);
    expect(label.right, detail).toBeLessThanOrEqual(
      drawing.boxWidth + LAYOUT_TOLERANCE_PX,
    );
    expect(label.bottom, detail).toBeLessThanOrEqual(
      drawing.boxHeight + LAYOUT_TOLERANCE_PX,
    );
    expect(
      drawing.walls.filter((wall) => overlaps(shrunk(label), wall)),
      detail,
    ).toEqual([]);
  }
}

/** Owner ruling R4: one px/mm for every drawn wall, ±1 px over the longest wall. The length a wall
 *  runs is its long side less nothing — a wall down the screen starts under wall A's thickness. */
export function expectOneScaleForEveryWall(
  drawing: PlanDrawing,
  wallsMm: Readonly<Partial<Record<"A" | "B" | "C", number>>>,
): void {
  const runs = drawing.walls.map((wall) => ({
    lengthMm: present(wallsMm[wall.id], `wall ${wall.id}'s length`),
    runPx: wall.id === "A" ? width(wall) : height(wall),
  }));
  const longest = runs.reduce((first, second) =>
    second.lengthMm > first.lengthMm ? second : first,
  );
  const pxPerMm = longest.runPx / longest.lengthMm;
  for (const run of runs) {
    expect(
      Math.abs(run.runPx - run.lengthMm * pxPerMm) *
        (longest.lengthMm / run.lengthMm),
      JSON.stringify({ runs }),
    ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  }
}

export async function expectNothingSidewaysAtEveryWidth(
  page: Page,
): Promise<void> {
  for (const viewport of SIDEWAYS_VIEWPORTS) {
    await page.setViewportSize(viewport);
    const overflow = await readSidewaysOverflow(page);
    const detail = JSON.stringify({ viewport, overflow });
    expect(overflow.document.scrollWidth, detail).toBeLessThanOrEqual(
      overflow.document.clientWidth,
    );
    for (const column of overflow.columns) {
      expect(column.scrollWidth, detail).toBeLessThanOrEqual(
        column.clientWidth,
      );
    }
  }
}

/** Every chip, field, reason, note and *Continuă* can be scrolled to and tapped at its centre, and
 *  nothing in the form column scrolls sideways — `room-length-fields-fit.e2e.spec.ts`'s reach claim,
 *  at desktop. */
export async function expectEveryTargetReachable(page: Page): Promise<void> {
  const column = await formColumnScroll(page);
  const detail = JSON.stringify(column);
  expect(column.scrollWidth, detail).toBeLessThanOrEqual(column.clientWidth);
  expect(column.overflowX, detail).toBe("hidden");
  expect(["auto", "scroll"], detail).toContain(column.overflowY);
  expect(await documentScrollsSideways(page)).toBe(false);

  const reachable = [
    ...(await page
      .locator(
        [
          "input[data-testid^='room-shape-chip-control-']",
          "input[data-testid^='room-length-']",
          "[data-testid^='room-length-reason-']",
          "[data-testid='room-presets-after-valid']",
        ].join(", "),
      )
      .all()),
    continueButton(page),
  ];
  expect(reachable.length).toBeGreaterThan(8);
  for (const target of reachable) {
    await target.scrollIntoViewIfNeeded();
    const reach = await reachOf(target);
    expect(reach.isTopmostAtItsCentre, JSON.stringify(reach)).toBe(true);
    expect(reach.clippedPx, JSON.stringify(reach)).toBeLessThan(1);
  }
}

// ===========================================================================================
// Navigation — how the tests reach a state. No assertion lives below this line.
// ===========================================================================================

export const COMPOSE_TIMEOUT_MS = 90_000;

export function roomScreen(page: Page): Locator {
  return page.locator("main[data-room-substate]");
}

export function continueButton(page: Page): Locator {
  return page.getByTestId("room-continue");
}

export async function openRoom(
  page: Page,
  locale: Locale,
  query = "",
): Promise<void> {
  const search = query === "" ? "" : `?${query}`;
  await page.goto(`/${locale}/configurator/room${search}`);
  await roomScreen(page).waitFor();
}

export async function expectMeasuredPlan(page: Page): Promise<void> {
  const box = page.getByTestId("room-plan-box");
  await expect(box).toHaveAttribute("data-plan-measured", "true");
  await expect(box.locator("rect").first()).toBeAttached();
}

export interface HeldWrites {
  readonly release: () => Promise<void>;
}

/** Holds every `POST /api/designs` — the mint that ends composition — so 1F stays on screen for as
 *  long as a test measures it, and aborts them on release so no row is ever written. */
export async function holdDesignWrites(page: Page): Promise<HeldWrites> {
  const held: Route[] = [];
  const isDesignMint = (url: URL) => url.pathname === "/api/designs";
  await page.route(isDesignMint, async (route) => {
    if (route.request().method() === "POST") {
      held.push(route);
      return;
    }
    await route.continue();
  });
  return {
    release: async () => {
      await Promise.all(
        held.map((route) => route.abort().catch(() => undefined)),
      );
      await page.unrouteAll({ behavior: "ignoreErrors" });
    },
  };
}

/** From a valid room at 1D: *Continuă*, then wait for the composition to finish while its write is
 *  held. */
export async function composeAndHold(page: Page): Promise<void> {
  await continueButton(page).click();
  await expect(page.getByTestId("room-compose-notice")).toHaveAttribute(
    "data-compose-phase",
    "composed",
    { timeout: COMPOSE_TIMEOUT_MS / 2 },
  );
}

export interface SettledShapeChange {
  readonly query: string;
  readonly substate: string | null;
  readonly fields: Readonly<Record<string, string>>;
  readonly focusedTestId: string | null;
  readonly designWrites: readonly string[];
  readonly everComposed: boolean;
}

/** Opens frame D1C's room in a fresh page, activates something, and reads the state it settled in:
 *  the canonical query, the fields as typed, where focus went, and anything written or composed. */
export async function settleFromFrameRoom(
  browser: Browser,
  activate: (page: Page) => Promise<void>,
): Promise<SettledShapeChange> {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  const designWrites: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.startsWith("/api/designs") &&
      ["POST", "PUT"].includes(request.method())
    ) {
      designWrites.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.addInitScript(() => {
    const flags = window as unknown as { __everComposed: boolean };
    flags.__everComposed = false;
    new MutationObserver(() => {
      if (document.querySelector("[data-testid='room-compose']") !== null) {
        flags.__everComposed = true;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  try {
    await openRoom(page, "ro", FRAME_ONE_C_ROOM.query);
    await page.getByTestId("room-suggestion-action").waitFor();
    await activate(page);
    await page.waitForURL((url) => url.searchParams.get("shape") === "linear");
    await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
    await page.waitForLoadState("networkidle");
    return {
      query: canonicalQuery(new URL(page.url()).search),
      substate: await roomScreen(page).getAttribute("data-room-substate"),
      fields: {
        wallA: await page.getByTestId("room-length-wallA").inputValue(),
        height: await page.getByTestId("room-length-height").inputValue(),
      },
      focusedTestId: await page.evaluate(
        () => document.activeElement?.getAttribute("data-testid") ?? null,
      ),
      designWrites,
      everComposed: await page.evaluate(
        () => (window as unknown as { __everComposed: boolean }).__everComposed,
      ),
    };
  } finally {
    await context.close();
  }
}

/** A query with its keys sorted, so two settles are compared by content rather than key order. */
export function canonicalQuery(search: string): string {
  const params = new URLSearchParams(search);
  params.sort();
  return params.toString();
}

/** The `data-testid` (or tag) of each stop a keyboard walk from the top of the page lands on. */
export async function tabStops(page: Page): Promise<readonly string[]> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  const stops: string[] = [];
  for (let press = 0; press < MAX_TAB_STOPS; press += 1) {
    await page.keyboard.press("Tab");
    stops.push(
      await page.evaluate(() => {
        const focused = document.activeElement;
        return focused?.getAttribute("data-testid") ?? focused?.tagName ?? "";
      }),
    );
  }
  return stops;
}

/** More than one pass over 1C's controls, so a stop that exists is met. */
export const MAX_TAB_STOPS = 30;

// ===========================================================================================
// Readouts — measurement only, taken in the page.
// ===========================================================================================

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The item a readout needs, or a thrown error naming it — never a silent `undefined`. */
export function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined)
    throw new Error(`no item ${String(index)} of ${String(items.length)}`);
  return item;
}

export function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined)
    throw new Error(`missing: ${what}`);
  return value;
}

export function width(rect: Rect): number {
  return rect.right - rect.left;
}

export function height(rect: Rect): number {
  return rect.bottom - rect.top;
}

export function centreX(rect: Rect): number {
  return (rect.left + rect.right) / 2;
}

export function unionOf(rects: readonly Rect[]): Rect {
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

export function overlaps(first: Rect, second: Rect): boolean {
  return (
    first.left < second.right &&
    second.left < first.right &&
    first.top < second.bottom &&
    second.top < first.bottom
  );
}

/** Half a pixel off every side: a label *touching* a bar at a shared sub-pixel edge is not over it. */
export function shrunk(rect: Rect): Rect {
  return {
    left: rect.left + 0.5,
    top: rect.top + 0.5,
    right: rect.right - 0.5,
    bottom: rect.bottom - 0.5,
  };
}

/** The spread of the cards' tops — zero when they stand in one row. */
export function rowSpread(layout: ShapeStepLayout): number {
  const tops = layout.cards.map((card) => card.top);
  return Math.max(...tops) - Math.min(...tops);
}

export interface ShapeStepLayout {
  readonly cardIds: readonly string[];
  readonly cards: readonly Rect[];
  readonly glyphsAndNames: readonly {
    readonly glyphBottom: number;
    readonly nameTop: number;
  }[];
  readonly bodyContentCentreX: number;
  readonly continueBox: Rect;
  readonly footerContentRight: number;
  readonly footerContentWidth: number;
}

export async function readShapeStep(page: Page): Promise<ShapeStepLayout> {
  return page.getByTestId("room-shapes").evaluate((shapes) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const rectOf = (element: Element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const contentEdges = (element: Element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const left = box.left + Number.parseFloat(style.paddingLeft);
      const right = box.right - Number.parseFloat(style.paddingRight);
      return { left, right };
    };
    const cards = [
      ...shapes.querySelectorAll<HTMLElement>(
        "[data-testid^='room-shape-card-']",
      ),
    ];
    const body = need(shapes.parentElement, "the body");
    const bodyEdges = contentEdges(body);
    const cta = need(
      document.querySelector("[data-testid='room-continue']"),
      "Continue",
    );
    const footerEdges = contentEdges(need(cta.parentElement, "the footer"));
    return {
      cardIds: cards.map((card) => card.dataset.testid ?? ""),
      cards: cards.map(rectOf),
      glyphsAndNames: cards.map((card) => {
        const glyph = need(card.querySelector("svg"), "a glyph");
        return {
          glyphBottom: glyph.getBoundingClientRect().bottom,
          nameTop: need(
            glyph.nextElementSibling,
            "a name",
          ).getBoundingClientRect().top,
        };
      }),
      bodyContentCentreX: (bodyEdges.left + bodyEdges.right) / 2,
      continueBox: rectOf(cta),
      footerContentRight: footerEdges.right,
      footerContentWidth: footerEdges.right - footerEdges.left,
    };
  });
}

export interface DimensionsLayout {
  readonly chips: Rect;
  readonly corner: Rect | null;
  readonly fields: Rect;
  readonly labels: readonly Rect[];
  readonly fieldOrder: readonly string[];
  readonly plan: Rect;
  readonly bodyContentBottom: number;
  readonly cta: Rect;
  readonly footerContentRight: number;
  readonly footerContentWidth: number;
}

export async function readDimensionsLayout(
  page: Page,
): Promise<DimensionsLayout> {
  return page.getByTestId("room-fields").evaluate((fields) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const rectOf = (element: Element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const byTestId = (testId: string) =>
      document.querySelector(`[data-testid='${testId}']`);
    const plan = need(byTestId("room-plan"), "the plan");
    const body = need(plan.parentElement, "the body");
    const corner = byTestId("room-corner");
    const cta = need(byTestId("room-continue"), "Continue");
    const footer = need(cta.parentElement, "the footer");
    const footerBox = footer.getBoundingClientRect();
    const footerStyle = getComputedStyle(footer);
    const footerLeft =
      footerBox.left + Number.parseFloat(footerStyle.paddingLeft);
    const footerRight =
      footerBox.right - Number.parseFloat(footerStyle.paddingRight);
    const inputs = [
      ...fields.querySelectorAll<HTMLInputElement>(
        "input[data-testid^='room-length-']",
      ),
    ].sort(
      (first, second) =>
        first.getBoundingClientRect().left -
        second.getBoundingClientRect().left,
    );
    return {
      chips: rectOf(need(byTestId("room-shape-chips"), "the chips")),
      corner: corner === null ? null : rectOf(corner),
      fields: rectOf(fields),
      labels: [...fields.querySelectorAll("label")].map(rectOf),
      fieldOrder: inputs.map((input) =>
        (input.dataset.testid ?? "").replace("room-length-", ""),
      ),
      plan: rectOf(plan),
      bodyContentBottom:
        body.getBoundingClientRect().bottom -
        Number.parseFloat(getComputedStyle(body).paddingBottom),
      cta: rectOf(cta),
      footerContentRight: footerRight,
      footerContentWidth: footerRight - footerLeft,
    };
  });
}

export interface OneCColumn {
  readonly fieldRowBottom: number;
  readonly firstFieldLeft: number;
  readonly lastFieldRight: number;
  readonly reasons: readonly Rect[];
  readonly clause: Rect | null;
  readonly card: Rect | null;
  readonly note: Rect | null;
}

/** 1C's column: where the row of field boxes ends, the reasons under it, and what follows. */
export async function readOneCColumn(page: Page): Promise<OneCColumn> {
  return page.getByTestId("room-fields").evaluate((fields) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const rectOf = (element: Element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const rectOrNull = (testId: string) => {
      const element = document.querySelector(`[data-testid='${testId}']`);
      return element === null ? null : rectOf(element);
    };
    const boxes = [
      ...fields.querySelectorAll("input[data-testid^='room-length-']"),
    ].map((input) =>
      need(input.parentElement, "a field box").getBoundingClientRect(),
    );
    return {
      fieldRowBottom: Math.max(...boxes.map((box) => box.bottom)),
      firstFieldLeft: Math.min(...boxes.map((box) => box.left)),
      lastFieldRight: Math.max(...boxes.map((box) => box.right)),
      reasons: [
        ...fields.querySelectorAll("[data-testid^='room-length-reason-']"),
      ].map(rectOf),
      clause: rectOrNull("room-linear-suggestion"),
      card: rectOrNull("room-suggestion-card"),
      note: rectOrNull("room-presets-after-valid"),
    };
  });
}

export interface WallBRefusalPaint {
  readonly refusal: string;
  readonly inputInvalid: string | null;
  readonly labelColour: string;
  readonly boxBorderColour: string;
  readonly planWallFill: string;
  readonly planLabelColour: string;
  readonly otherPlanWallsMarked: readonly string[];
}

export async function readWallBRefusalPaint(
  page: Page,
): Promise<WallBRefusalPaint> {
  return page.getByTestId("room-length-wallB").evaluate((input) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const probe = document.createElement("span");
    probe.style.color = "var(--refusal)";
    need(document.querySelector("main"), "main").append(probe);
    const refusal = getComputedStyle(probe).color;
    probe.remove();
    const label = need(
      document.querySelector(`label[for='${CSS.escape(input.id)}']`),
      "wall B's label",
    );
    const planLabels = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-testid^='room-plan-label-']",
      ),
    ];
    const planWalls = [
      ...document.querySelectorAll("[data-testid='room-plan-box'] rect"),
    ];
    const wallBIndex = planLabels.findIndex(
      (planLabel) => planLabel.dataset.testid === "room-plan-label-B",
    );
    return {
      refusal,
      inputInvalid: input.getAttribute("aria-invalid"),
      labelColour: getComputedStyle(label).color,
      boxBorderColour: getComputedStyle(
        need(input.parentElement, "a field box"),
      ).borderTopColor,
      planWallFill: getComputedStyle(
        need(planWalls[wallBIndex], "wall B's bar"),
      ).fill,
      planLabelColour: getComputedStyle(
        need(planLabels[wallBIndex], "wall B's label"),
      ).color,
      otherPlanWallsMarked: planLabels
        .filter((planLabel) => planLabel.dataset.marked === "true")
        .map((planLabel) => planLabel.dataset.testid ?? "")
        .filter((testId) => testId !== "room-plan-label-B"),
    };
  });
}

export interface TopBarReadout {
  readonly viewportWidth: number;
  readonly band: Rect;
  readonly chip: Rect;
  readonly titleTextRight: number;
  readonly chipIsLastInTheBand: boolean;
  readonly paper: readonly [number, number, number];
}

export async function readTopBar(page: Page): Promise<TopBarReadout> {
  return page.getByTestId("top-bar-title").evaluate((title) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const rectOf = (element: Element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const cell = need(title.closest("header"), "the title cell");
    const band = need(cell.parentElement, "the band");
    const chip = need(
      document.querySelector("[data-testid='top-bar-locale']"),
      "the locale chip",
    );
    const range = document.createRange();
    range.selectNodeContents(title);
    const chipBox = chip.getBoundingClientRect();
    const everythingInTheBand = [...band.querySelectorAll("*")].filter(
      (element) =>
        element.getBoundingClientRect().width > 0 &&
        !chip.contains(element) &&
        !element.contains(chip),
    );
    const paper = need(
      getComputedStyle(cell).backgroundColor.match(/\d+/g),
      "the paper colour",
    )
      .slice(0, 3)
      .map(Number) as [number, number, number];
    return {
      viewportWidth: document.documentElement.clientWidth,
      band: rectOf(band),
      chip: rectOf(chip),
      titleTextRight: range.getBoundingClientRect().right,
      chipIsLastInTheBand: everythingInTheBand.every(
        (element) =>
          element.getBoundingClientRect().right <= chipBox.left + 0.5,
      ),
      paper,
    };
  });
}

export interface PlanDrawingWall extends Rect {
  readonly id: "A" | "B" | "C";
  readonly marked: string | null;
}

export interface PlanDrawingLabel extends Rect {
  readonly fontSize: string;
  readonly marked: string | null;
}

export interface PlanDrawing {
  readonly measured: string | null;
  readonly overflow: string;
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly svgWidth: number;
  readonly svgHeight: number;
  readonly walls: readonly PlanDrawingWall[];
  readonly labels: readonly PlanDrawingLabel[];
}

/** The drawing in the box's own coordinates — the padding box, which is what the SVG and the labels
 *  are positioned against. Each bar is matched to its wall through the label drawn from the same
 *  wall, in the same order (`plan-preview.tsx` maps both off one list). */
export async function readPlanDrawing(page: Page): Promise<PlanDrawing> {
  return page.getByTestId("room-plan-box").evaluate((box) => {
    const boxRect = box.getBoundingClientRect();
    const originX = boxRect.left + box.clientLeft;
    const originY = boxRect.top + box.clientTop;
    const local = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - originX,
        top: rect.top - originY,
        right: rect.right - originX,
        bottom: rect.bottom - originY,
      };
    };
    const svg = box.querySelector("svg");
    const labels = [
      ...box.querySelectorAll<HTMLElement>("[data-testid^='room-plan-label-']"),
    ];
    const walls = [...box.querySelectorAll("rect")];
    return {
      measured: box.getAttribute("data-plan-measured"),
      overflow: getComputedStyle(box).overflow,
      boxWidth: boxRect.width - box.clientLeft * 2,
      boxHeight: boxRect.height - box.clientTop * 2,
      svgWidth: Number(svg?.getAttribute("width") ?? Number.NaN),
      svgHeight: Number(svg?.getAttribute("height") ?? Number.NaN),
      walls: walls.map((wall, index) => ({
        ...local(wall),
        id: (labels[index]?.dataset.testid ?? "").replace(
          "room-plan-label-",
          "",
        ) as "A" | "B" | "C",
        marked: wall.getAttribute("data-marked"),
      })),
      labels: labels.map((label) => ({
        ...local(label),
        fontSize: getComputedStyle(label).fontSize,
        marked: label.getAttribute("data-marked"),
      })),
    };
  });
}

export async function planLabelTexts(page: Page): Promise<readonly string[]> {
  return page.locator("[data-testid^='room-plan-label-']").allTextContents();
}

export interface PlanPaint {
  readonly measured: string | null;
  readonly svgWidth: number;
  readonly boxWidth: number;
  readonly inlineHeight: string;
}

/**
 * Records the box on every DOM change while it holds a drawn wall, including parser-inserted nodes.
 * Document-wide because a box-scoped count is blind to commit timing; see ADR 0139 d11.
 */
export async function recordPlanPaints(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const paints: unknown[] = [];
    (window as unknown as { __planPaints: unknown[] }).__planPaints = paints;
    new MutationObserver(() => {
      const box = document.querySelector<HTMLElement>(
        "[data-testid='room-plan-box']",
      );
      const svg = box?.querySelector("svg") ?? null;
      if (box === null || svg === null) return;
      if (box.querySelector("rect") === null) return;
      paints.push({
        measured: box.getAttribute("data-plan-measured"),
        svgWidth: Number(svg.getAttribute("width")),
        boxWidth: box.getBoundingClientRect().width - box.clientLeft * 2,
        inlineHeight: box.style.height,
      });
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });
}

export function isMeasuredAndBoxSized(paint: PlanPaint): boolean {
  return (
    paint.measured === "true" &&
    Math.abs(paint.svgWidth - paint.boxWidth) <= LAYOUT_TOLERANCE_PX
  );
}

export async function readPlanPaints(
  page: Page,
): Promise<readonly PlanPaint[]> {
  return page.evaluate(
    () => (window as unknown as { __planPaints: PlanPaint[] }).__planPaints,
  );
}

export interface ComposeLayout {
  readonly steps: Rect;
  readonly panel: Rect;
  readonly canvasCount: number;
}

export async function readComposeLayout(page: Page): Promise<ComposeLayout> {
  return page.getByTestId("room-compose").evaluate((compose) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const rectOf = (element: Element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const rows = need(
      compose.querySelector("[data-testid='room-compose-rows']"),
      "the rows",
    );
    return {
      steps: rectOf(rows),
      panel: rectOf(
        need(compose.querySelector("[data-testid='room-plan']"), "the plan"),
      ),
      canvasCount: compose.querySelectorAll("canvas").length,
    };
  });
}

export interface SidewaysOverflow {
  readonly document: {
    readonly scrollWidth: number;
    readonly clientWidth: number;
  };
  readonly columns: readonly {
    readonly testId: string;
    readonly scrollWidth: number;
    readonly clientWidth: number;
  }[];
}

/** The document, and every column the screen is built of — the top bar, the body and the footer. */
export async function readSidewaysOverflow(
  page: Page,
): Promise<SidewaysOverflow> {
  return page.evaluate(() => {
    const columns = [
      ...document.querySelectorAll("main[data-room-substate] > div"),
    ];
    return {
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
      columns: columns.map((column, index) => ({
        testId: column.getAttribute("data-testid") ?? `column-${String(index)}`,
        scrollWidth: column.scrollWidth,
        clientWidth: column.clientWidth,
      })),
    };
  });
}

export async function documentScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

export interface FormColumnScroll {
  readonly overflowX: string;
  readonly overflowY: string;
  readonly scrollWidth: number;
  readonly clientWidth: number;
}

/** The first ancestor of the fields that clips or scrolls — the form column. */
export async function formColumnScroll(page: Page): Promise<FormColumnScroll> {
  return page.getByTestId("room-fields").evaluate((fields) => {
    let column: HTMLElement | null = fields.parentElement;
    while (
      column !== null &&
      getComputedStyle(column).overflowY === "visible"
    ) {
      column = column.parentElement;
    }
    if (column === null)
      throw new Error("no column clips or scrolls the fields");
    return {
      overflowX: getComputedStyle(column).overflowX,
      overflowY: getComputedStyle(column).overflowY,
      scrollWidth: column.scrollWidth,
      clientWidth: column.clientWidth,
    };
  });
}

export async function footerBox(page: Page): Promise<Rect> {
  return continueButton(page).evaluate((cta) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const { left, top, right, bottom } = need(
      cta.parentElement,
      "the footer",
    ).getBoundingClientRect();
    return { left, top, right, bottom };
  });
}

export interface Reach {
  readonly isTopmostAtItsCentre: boolean;
  readonly clippedPx: number;
}

/** Whether a tap at the element's centre lands on it, and how much of it its scrolling column — or,
 *  outside one, the viewport — still cuts off (`room-length-fields-fit.e2e.spec.ts`'s `reachOf`). */
export async function reachOf(target: Locator): Promise<Reach> {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const answered = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    let column: HTMLElement | null = element.parentElement;
    while (
      column !== null &&
      getComputedStyle(column).overflowY === "visible"
    ) {
      column = column.parentElement;
    }
    const visible =
      column === null
        ? { top: 0, bottom: window.innerHeight }
        : column.getBoundingClientRect();
    return {
      isTopmostAtItsCentre: answered !== null && element.contains(answered),
      clippedPx:
        Math.max(0, visible.top - box.top) +
        Math.max(0, box.bottom - visible.bottom),
    };
  });
}

/** The grid the hit area is sampled on. A measured side can read short of the true one by a step. */
export const SCAN_STEP_PX = 0.5;
/** How far past the button's own box the grid reaches, so a widened target is not cut off by it. */
export const SCAN_MARGIN_PX = 24;

export interface HelpLayout {
  readonly inputs: readonly { readonly id: string; readonly box: Rect }[];
  readonly targets: readonly {
    readonly id: string;
    readonly hit: Rect;
    readonly box: Rect;
  }[];
}

/** Every visible input, and each help button's hit area as `elementFromPoint` answers it —
 *  `room-length-fields-fit.e2e.spec.ts`'s scan, at desktop. */
export async function helpTargetsAndInputs(page: Page): Promise<HelpLayout> {
  return page.evaluate(
    ({ step, margin }) => {
      const rectOf = (element: Element) => {
        const { left, top, right, bottom } = element.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      const inputs = [...document.querySelectorAll("input")]
        .filter((input) => input.getBoundingClientRect().width > 0)
        .map((input) => ({
          id: input.dataset.testid ?? "",
          box: rectOf(input),
        }));
      const buttons = [
        ...document.querySelectorAll<HTMLElement>(
          "[data-testid^='room-length-help-wall']",
        ),
      ];
      const targets = buttons.map((button) => {
        const box = rectOf(button);
        const hit = {
          left: Infinity,
          top: Infinity,
          right: -Infinity,
          bottom: -Infinity,
        };
        for (let y = box.top - margin; y < box.bottom + margin; y += step) {
          for (let x = box.left - margin; x < box.right + margin; x += step) {
            const answered = document.elementFromPoint(x, y);
            if (answered === null || !button.contains(answered)) continue;
            hit.left = Math.min(hit.left, x);
            hit.top = Math.min(hit.top, y);
            hit.right = Math.max(hit.right, x + step);
            hit.bottom = Math.max(hit.bottom, y + step);
          }
        }
        return { id: button.dataset.testid ?? "", hit, box };
      });
      return { inputs, targets };
    },
    { step: SCAN_STEP_PX, margin: SCAN_MARGIN_PX },
  );
}

export function recordPageErrors(page: Page): readonly string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}
