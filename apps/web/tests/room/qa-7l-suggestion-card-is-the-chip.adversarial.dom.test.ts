// @vitest-environment happy-dom
//
// **Adversarial QA for M7 wave 7L, criterion A12 — the card is the chip, as a [dom] property.** The
// e2e (`room-desktop-line.criteria-12-17.desktop.e2e.spec.ts`, criterion 12) proves it for the frame's one
// room. Here it is swept over a population of drafts where the suggestion shows, in both classes that turn
// `isLinearSuggested` on (`room-issue-model.ts`):
//
// - **a field reason** — an L whose wall B is too short or too long, wall A and the height valid as
//   a straight room;
// - **a room reason with no field reason** — `ROOM_TOO_SMALL_FOR_KITCHEN` over an L whose three
//   fields each pass (the 1800 × 1200 × 2600 class, F1's fix).
//
// Each sample renders the same starting URL twice — once activating *Sugestii*'s action, once the
// *Liniară* chip — and asserts the two resulting drafts and settled queries are deep-equal. The
// draft is read off the screen, and then **read again after returning to the L by its chip**, so the
// fields a straight room hides (wall B, the corner) are compared too: a handler that dropped the
// hidden wall B or the direction would pass a comparison of the straight form alone.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  validateRoomInput,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => browser.pathname,
  useSearchParams: () => new URLSearchParams(browser.search),
  useRouter: () => ({
    push: browser.push,
    replace: browser.replace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { URL_SETTLE_MS } from "@/room/room-query-sync";
import { RoomScreen } from "@/room/room-screen";
import { parseRoomUrlState } from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";

const SUGGESTION = "room-linear-suggestion";
const CARD_ACTION = "room-suggestion-action";
const LINEAR_CHIP = "room-shape-chip-control-linear";
const L_CHIP = "room-shape-chip-control-L";
const SHAPES: readonly RoomShape[] = ["linear", "L", "U"];
const LENGTH_FIELDS = ["wallA", "wallB", "wallC", "height"] as const;
const DIRECTIONS = ["left", "right"] as const;

/** Past the settle interval, so the query the draft writes is the one in the address bar. */
const SETTLE_WAIT_MS = URL_SETTLE_MS * 3;

/** The floor 7L sets for its other property (A7: ≥ 100 samples per arm). Each sample is two fresh
 *  renders and about six settles, so this keeps the file near a second per arm. */
const RUNS_PER_ARM = 100;

let container: HTMLDivElement;
let root: Root;
let fetchSpy: ReturnType<typeof vi.fn>;

function arriveAt(search: string): void {
  browser.search = new URLSearchParams(search).toString();
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(RoomScreen, { policy: APPROVED_ROOM_POLICY }),
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

function searchOf(href: string): string {
  const questionMark = href.indexOf("?");
  return questionMark === -1 ? "" : href.slice(questionMark + 1);
}

function maybeAt(testId: string): HTMLElement | null {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  return element instanceof HTMLElement ? element : null;
}

function elementAt(testId: string): HTMLElement {
  const element = maybeAt(testId);
  if (element === null) throw new Error(`the screen draws no ${testId}`);
  return element;
}

function inputAt(testId: string): HTMLInputElement {
  const input = elementAt(testId);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`${testId} is not an input`);
  }
  return input;
}

function activate(testId: string): void {
  act(() => {
    elementAt(testId).click();
  });
}

function settle(): void {
  act(() => {
    vi.advanceTimersByTime(SETTLE_WAIT_MS);
  });
}

/** Everything the screen shows of the draft: the chosen chip, each drawn field's text, the corner. */
interface ScreenDraft {
  readonly substate: string | null;
  readonly shape: RoomShape | undefined;
  readonly fields: Readonly<Record<string, string>>;
  readonly direction: string | undefined;
}

function draftOnScreen(): ScreenDraft {
  const fields: Record<string, string> = {};
  for (const field of LENGTH_FIELDS) {
    const input = maybeAt(`room-length-${field}`);
    if (input instanceof HTMLInputElement) fields[field] = input.value;
  }
  return {
    substate:
      container.querySelector("main")?.getAttribute("data-room-substate") ??
      null,
    shape: SHAPES.find(
      (shape) => inputAt(`room-shape-chip-control-${shape}`).checked,
    ),
    fields,
    direction: DIRECTIONS.find((direction) => {
      const control = maybeAt(`room-corner-control-${direction}`);
      return control instanceof HTMLInputElement && control.checked;
    }),
  };
}

/** The last query the settle wrote, as sorted entries so key order is not a difference. */
function settledQuery(): readonly (readonly [string, string])[] {
  const lastCall = browser.replace.mock.calls.at(-1);
  if (lastCall === undefined) throw new Error("nothing was ever settled");
  return [...new URLSearchParams(searchOf(String(lastCall[0])))].sort(
    ([left], [right]) => left.localeCompare(right),
  );
}

interface Outcome {
  readonly straight: ScreenDraft;
  readonly straightQuery: readonly (readonly [string, string])[];
  readonly focusedTestId: string | null;
  readonly replacesAfterActivation: number;
  readonly pushes: number;
  readonly fetches: number;
  /** The same draft after the L chip is chosen again — the hidden wall B and corner made visible. */
  readonly backToL: ScreenDraft;
  readonly backToLQuery: readonly (readonly [string, string])[];
}

/** One fresh screen at `search`, activated through `testId`, settled, then returned to the L. */
function outcomeOf(search: string, testId: string): Outcome {
  remount();
  arriveAt(search);
  settle();
  expect(maybeAt(SUGGESTION), `${search}: suggestion`).not.toBe(null);
  expect(maybeAt(CARD_ACTION), `${search}: card action`).not.toBe(null);
  browser.replace.mockClear();

  activate(testId);
  const focusedTestId =
    document.activeElement?.getAttribute("data-testid") ?? null;
  settle();
  const straight = draftOnScreen();
  const straightQuery = settledQuery();
  const replacesAfterActivation = browser.replace.mock.calls.length;

  activate(L_CHIP);
  settle();
  return {
    straight,
    straightQuery,
    focusedTestId,
    replacesAfterActivation,
    pushes: browser.push.mock.calls.length,
    fetches: fetchSpy.mock.calls.length,
    backToL: draftOnScreen(),
    backToLQuery: settledQuery(),
  };
}

function remount(): void {
  act(() => {
    root.unmount();
  });
  root = createRoot(container);
  browser.push.mockClear();
  browser.replace.mockClear();
  fetchSpy.mockClear();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchSpy = vi.fn(() => Promise.reject(new Error("no request is expected")));
  vi.stubGlobal("fetch", fetchSpy);
  browser.push.mockClear();
  browser.replace.mockClear();
  browser.replace.mockImplementation((href: string) => {
    arriveAt(searchOf(href));
  });
  browser.search = "";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------
// The population
// ---------------------------------------------------------------------------------------------

interface LRoom {
  readonly wallAMm: number;
  readonly wallBMm: number;
  readonly heightMm: number;
  readonly direction: (typeof DIRECTIONS)[number];
}

/** The URL's metre wire, from whole millimetres: `450` → `0.45`. */
function metres(millimetres: number): string {
  return String(millimetres / 1000);
}

function searchOfRoom(room: LRoom): string {
  return [
    "shape=L",
    `wallA=${metres(room.wallAMm)}`,
    `wallB=${metres(room.wallBMm)}`,
    `height=${metres(room.heightMm)}`,
    `direction=${room.direction}`,
  ].join("&");
}

/** Wall A and the height inside the straight room's own bounds (1200–6000, 2200–3900), so the gate's
 *  second half holds; each sample still asserts it against the domain below. */
const STRAIGHT_VALID_WALL_A = fc.integer({ min: 1200, max: 6000 });
const VALID_HEIGHT = fc.integer({ min: 2200, max: 3900 });
const ANY_DIRECTION = fc.constantFrom(...DIRECTIONS);

/** Field-reason arm: wall B outside the L's 1000–6000, either side. */
const FIELD_REASON_ROOM: fc.Arbitrary<LRoom> = fc.record({
  wallAMm: STRAIGHT_VALID_WALL_A,
  wallBMm: fc.oneof(
    fc.integer({ min: 1, max: 999 }),
    fc.integer({ min: 6001, max: 6500 }),
  ),
  heightMm: VALID_HEIGHT,
  direction: ANY_DIRECTION,
});

/** Room-reason arm: every field valid for an L, the minimum kitchen not held (ADR 0108 Amendments
 *  C–E): wall B leaves under a sink's 600 past its 1000 reach and wall A under both bodies' 1200
 *  past its 900, or wall A leaves under a hob's 600 and wall B under both bodies'. */
const ROOM_REASON_ROOM: fc.Arbitrary<LRoom> = fc.record({
  wallAMm: fc.integer({ min: 1200, max: 2099 }),
  wallBMm: fc.integer({ min: 1000, max: 2199 }),
  heightMm: VALID_HEIGHT,
  direction: ANY_DIRECTION,
});

function issueCodesOf(search: string): readonly string[] {
  const state = parseRoomUrlState(
    Object.fromEntries(new URLSearchParams(search)),
  );
  return state.substate === "1C" ? state.issues.map((issue) => issue.code) : [];
}

function validatesAsStraight(room: LRoom): boolean {
  return validateRoomInput(
    { shape: "linear", wallAMm: room.wallAMm, heightMm: room.heightMm },
    APPROVED_ROOM_POLICY,
  ).ok;
}

// ---------------------------------------------------------------------------------------------
// The property
// ---------------------------------------------------------------------------------------------

/** Criterion 12's own words: *"wall A and height as typed"* — and wall B and the corner kept for a
 *  return to the L, since `withRoomShape` keeps every typed length. Positive, so a drop that both
 *  paths shared would still go red. */
function expectTypedRoomKept(
  outcome: Outcome,
  room: LRoom,
  detail: string,
): void {
  expect(outcome.straight.fields, detail).toEqual({
    wallA: String(room.wallAMm),
    height: String(room.heightMm),
  });
  expect(outcome.backToL.fields, detail).toEqual({
    wallA: String(room.wallAMm),
    wallB: String(room.wallBMm),
    height: String(room.heightMm),
  });
  expect(outcome.backToL.direction, detail).toBe(room.direction);
}

function expectCardIsTheChip(room: LRoom): void {
  const search = searchOfRoom(room);
  const byCard = outcomeOf(search, CARD_ACTION);
  const byChip = outcomeOf(search, LINEAR_CHIP);
  const detail = JSON.stringify({ search, byCard, byChip });

  expect(byCard.straight, detail).toEqual(byChip.straight);
  expect(byCard.straightQuery, detail).toEqual(byChip.straightQuery);
  expect(byCard.backToL, detail).toEqual(byChip.backToL);
  expect(byCard.backToLQuery, detail).toEqual(byChip.backToLQuery);

  expect(byCard.straight.shape, detail).toBe("linear");
  expect(byCard.straight.substate, detail).toBe("1D");
  expect(byCard.replacesAfterActivation, detail).toBeGreaterThan(0);
  expect(byCard.focusedTestId, detail).toBe(LINEAR_CHIP);
  expect(byCard.pushes, detail).toBe(0);
  expect(byCard.fetches, detail).toBe(0);
  expectTypedRoomKept(byCard, room, detail);
}

describe("7L-A12 — activating the suggestion card yields the linear chip's draft and settled query", () => {
  it("for an L with wall B too short or too long (a field reason)", () => {
    fc.assert(
      fc.property(FIELD_REASON_ROOM, (room) => {
        const search = searchOfRoom(room);
        const codes = issueCodesOf(search);
        expect(codes.length, search).toBeGreaterThan(0);
        expect(codes, search).not.toContain("ROOM_TOO_SMALL_FOR_KITCHEN");
        expect(validatesAsStraight(room), search).toBe(true);

        expectCardIsTheChip(room);
      }),
      { numRuns: RUNS_PER_ARM },
    );
  });

  it("for an L too small for the kitchen with every field valid (a room reason alone)", () => {
    fc.assert(
      fc.property(ROOM_REASON_ROOM, (room) => {
        const search = searchOfRoom(room);
        fc.pre(issueCodesOf(search).includes("ROOM_TOO_SMALL_FOR_KITCHEN"));
        expect(issueCodesOf(search), search).toEqual([
          "ROOM_TOO_SMALL_FOR_KITCHEN",
        ]);
        expect(validatesAsStraight(room), search).toBe(true);

        expectCardIsTheChip(room);
      }),
      { numRuns: RUNS_PER_ARM },
    );
  });

  it.each<readonly [string, LRoom]>([
    [
      "the frame's room, wall B too short",
      { wallAMm: 3600, wallBMm: 450, heightMm: 2600, direction: "left" },
    ],
    [
      "F1's room-level class, 1800 x 1200 x 2600",
      { wallAMm: 1800, wallBMm: 1200, heightMm: 2600, direction: "left" },
    ],
    [
      "F1's class mirrored",
      { wallAMm: 1800, wallBMm: 1200, heightMm: 2600, direction: "right" },
    ],
    [
      "wall A and the height at the straight room's bounds",
      { wallAMm: 1200, wallBMm: 999, heightMm: 3900, direction: "left" },
    ],
    [
      "wall B one past the L's maximum",
      { wallAMm: 6000, wallBMm: 6001, heightMm: 2200, direction: "right" },
    ],
  ])("by name: %s", (_, room) => {
    expectCardIsTheChip(room);
  });
});
