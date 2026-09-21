// @vitest-environment happy-dom
//
// **Sub-state 1C on the form** — M7 wave 7F2 slice S3, criteria 1, 3, 4, 5, 6, 11 and 12.
//
// The real screen is rendered through the real parser, over a mocked router one layer below
// next-intl's (the harness `room-url-round-trip.dom.test.ts` documents). Two kinds of claim:
//
// - **Properties over rooms reached from a URL.** A room arrived at is not a room being typed, so
//   every 1C surface is on screen at once and the claim is *which* surfaces: each sweep's arm is
//   built from the approved policy's own bounds (ADR 0121 decision 4), and its expected fields are
//   the arm's definition, checked against the parser the criterion names.
// - **The clock, driven keystroke by keystroke** (C-7F2-1, extended 2026-09-21): a surface appears
//   once typing has paused `URL_SETTLE_MS` and clears on the keystroke that fixes the room, with the
//   router's echo **withheld** — so a surface read off the URL could never appear.
//
// Romanian is never spelled here; every sentence is read out of the catalogue under test.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type LWallBounds,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, type ReactElement } from "react";
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

import {
  createRoomDraft,
  withEnteredText,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import {
  canonicalRoomQuery,
  queryEntriesOf,
  URL_SETTLE_MS,
} from "@/room/room-query-sync";
import { RoomScreen } from "@/room/room-screen";
import { parseRoomUrlState, type RoomUrlState } from "@/room/room-url-state";

import {
  CATALOGUES,
  requireLeafAt,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";

const SAMPLES_PER_ARM = 100;

/** Criterion 1's outer sweep, past both ends of every approved bound, on a 1 mm grid. */
const SWEPT_WALL_MM = { min: 100, max: 7000 } as const;
const SWEPT_CEILING_MM = { min: 1000, max: 5000 } as const;

const EVERY_LENGTH_FIELD: readonly RoomLengthField[] = [
  "wallA",
  "wallB",
  "wallC",
  "height",
];

// ---------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;
let rendered: readonly [CatalogueLocale, Catalogue] = CATALOGUES[0];
let echoesEveryWrite = true;

function render(
  search: string,
  catalogue: readonly [CatalogueLocale, Catalogue] = CATALOGUES[0],
): void {
  rendered = catalogue;
  arriveAt(search);
}

function arriveAt(search: string): void {
  browser.search = new URLSearchParams(search).toString();
  act(() => {
    root.render(theScreen());
  });
}

function theScreen(): ReactElement {
  const [locale, messages] = rendered;
  return createElement(NextIntlClientProvider, {
    children: createElement(RoomScreen, {}),
    locale,
    messages,
    timeZone: "Europe/Chisinau",
  });
}

function searchOf(href: string): string {
  const questionMark = href.indexOf("?");
  return questionMark === -1 ? "" : href.slice(questionMark + 1);
}

/** The router keeps every write to itself: `useSearchParams` never learns of it. */
function withholdTheEchoes(): void {
  echoesEveryWrite = false;
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

function fieldFor(field: RoomLengthField): HTMLInputElement {
  const input = elementAt(`room-length-${field}`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`the ${field} field is not an input`);
  }
  return input;
}

function continueButton(): HTMLButtonElement {
  const cta = elementAt("room-continue");
  if (!(cta instanceof HTMLButtonElement)) {
    throw new Error("the footer's control is not a button");
  }
  return cta;
}

function type(field: RoomLengthField, text: string): void {
  act(() => {
    const input = fieldFor(field);
    Reflect.set(HTMLInputElement.prototype, "value", text, input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function click(testId: string): void {
  act(() => {
    elementAt(testId).click();
  });
}

function advance(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function routerCalls(): number {
  return browser.push.mock.calls.length + browser.replace.mock.calls.length;
}

function fieldsWithAReason(): readonly RoomLengthField[] {
  return EVERY_LENGTH_FIELD.filter(
    (field) => maybeAt(`room-length-reason-${field}`) !== null,
  );
}

function fieldsMarkedInvalid(): readonly RoomLengthField[] {
  return EVERY_LENGTH_FIELD.filter(
    (field) =>
      maybeAt(`room-length-${field}`)?.getAttribute("aria-invalid") === "true",
  );
}

function markedPlanWalls(): readonly string[] {
  return [...container.querySelectorAll("[data-testid^='room-plan-label-']")]
    .filter((label) => label.getAttribute("data-marked") === "true")
    .map((label) => label.getAttribute("data-testid") ?? "");
}

function roomReasonTexts(): readonly string[] {
  return [
    ...container.querySelectorAll("[data-testid='room-room-reason']"),
  ].map((reason) => reason.textContent);
}

function isNoteShown(): boolean {
  return maybeAt("room-presets-after-valid") !== null;
}

/** Every 1C surface this slice draws, as one value, so "nothing is showing" is one assertion. */
function oneCOnScreen() {
  return {
    fieldReasons: fieldsWithAReason(),
    invalidFields: fieldsMarkedInvalid(),
    markedWalls: markedPlanWalls(),
    roomReasons: roomReasonTexts(),
    isNoteShown: isNoteShown(),
  };
}

const NOTHING_OF_ONE_C = {
  fieldReasons: [],
  invalidFields: [],
  markedWalls: [],
  roomReasons: [],
  isNoteShown: false,
};

function messageOf(key: string): string {
  return requireLeafAt(rendered[1], key);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  browser.push.mockClear();
  browser.replace.mockClear();
  echoesEveryWrite = true;
  browser.replace.mockImplementation((href: string) => {
    if (echoesEveryWrite) arriveAt(searchOf(href));
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
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------
// Rooms, built from the approved policy's bounds
// ---------------------------------------------------------------------------------------------

interface LRoomMm {
  readonly wallA: number;
  readonly wallB: number;
  readonly height: number;
}

function approvedL(): LWallBounds {
  const bounds = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (bounds === undefined) {
    throw new Error("the approved policy states no L bounds");
  }
  return bounds;
}

const walls = approvedL();
const ceiling = APPROVED_ROOM_POLICY.heightBounds;
const kitchen = walls.minimumKitchen;
const bothBodiesMm = kitchen.sinkWidthMm + kitchen.hobWidthMm;

const aOk = fc.integer({ min: walls.wallA.minMm, max: walls.wallA.maxMm });
const bOk = fc.integer({ min: walls.wallB.minMm, max: walls.wallB.maxMm });
const aShort = fc.integer({
  min: SWEPT_WALL_MM.min,
  max: walls.wallA.minMm - 1,
});
const bShort = fc.integer({
  min: SWEPT_WALL_MM.min,
  max: walls.wallB.minMm - 1,
});
const aLong = fc.integer({
  min: walls.wallA.maxMm + 1,
  max: SWEPT_WALL_MM.max,
});
const bLong = fc.integer({
  min: walls.wallB.maxMm + 1,
  max: SWEPT_WALL_MM.max,
});
const heightOk = fc.integer({ min: ceiling.minMm, max: ceiling.maxMm });
const heightLow = fc.integer({
  min: SWEPT_CEILING_MM.min,
  max: ceiling.minMm - 1,
});
const heightHigh = fc.integer({
  min: ceiling.maxMm + 1,
  max: SWEPT_CEILING_MM.max,
});

/** Wall A holding the sink and the hob beyond the corner by itself, so the kitchen fits whatever B
 *  is — the arm that must reach 1D. */
const aHoldingTheKitchen = fc.integer({
  min: kitchen.cornerReachMm.wallA + bothBodiesMm,
  max: walls.wallA.maxMm,
});

/** In range on both walls and holding the kitchen none of the three ways the domain accepts. The twin
 *  of `room-issue-model.test.ts`'s, written out again so this file's population is its own. */
function isTooSmallForKitchen({ wallA, wallB }: LRoomMm): boolean {
  const freeA = wallA - kitchen.cornerReachMm.wallA;
  const freeB = wallB - kitchen.cornerReachMm.wallB;
  const holdsPairOnOneWall = freeA >= bothBodiesMm || freeB >= bothBodiesMm;
  const holdsSplit =
    freeB >= kitchen.sinkWidthMm && freeA >= kitchen.hobWidthMm;
  return !holdsPairOnOneWall && !holdsSplit;
}

const tooSmallRoom = fc
  .record({
    wallA: fc.integer({
      min: walls.wallA.minMm,
      max: kitchen.cornerReachMm.wallA + bothBodiesMm - 1,
    }),
    wallB: fc.integer({
      min: walls.wallB.minMm,
      max: kitchen.cornerReachMm.wallB + bothBodiesMm - 1,
    }),
    height: heightOk,
  })
  .filter(isTooSmallForKitchen);

interface Arm {
  readonly name: string;
  readonly room: fc.Arbitrary<LRoomMm>;
  readonly expectedFields: readonly RoomLengthField[];
}

function armOf(
  name: string,
  parts: {
    readonly wallA: fc.Arbitrary<number>;
    readonly wallB: fc.Arbitrary<number>;
    readonly height: fc.Arbitrary<number>;
  },
  expectedFields: readonly RoomLengthField[],
): Arm {
  return { name, room: fc.record(parts), expectedFields };
}

/** Criterion 1's measured table, one arm per row. The mixed arms are the discriminating population:
 *  a screen that shows only the first issue passes every single-issue arm. */
const FIELD_ARMS: readonly Arm[] = [
  armOf("ok", { wallA: aHoldingTheKitchen, wallB: bOk, height: heightOk }, []),
  armOf("A short", { wallA: aShort, wallB: bOk, height: heightOk }, ["wallA"]),
  armOf("B short", { wallA: aOk, wallB: bShort, height: heightOk }, ["wallB"]),
  armOf("both short", { wallA: aShort, wallB: bShort, height: heightOk }, [
    "wallA",
    "wallB",
  ]),
  armOf("A long", { wallA: aLong, wallB: bOk, height: heightOk }, ["wallA"]),
  armOf("B long", { wallA: aOk, wallB: bLong, height: heightOk }, ["wallB"]),
  armOf("A long, B short", { wallA: aLong, wallB: bShort, height: heightOk }, [
    "wallA",
    "wallB",
  ]),
  armOf(
    "A short, B long, ceiling low",
    { wallA: aShort, wallB: bLong, height: heightLow },
    ["wallA", "wallB", "height"],
  ),
  armOf(
    "ceiling low",
    { wallA: aHoldingTheKitchen, wallB: bOk, height: heightLow },
    ["height"],
  ),
  armOf(
    "ceiling high",
    { wallA: aHoldingTheKitchen, wallB: bOk, height: heightHigh },
    ["height"],
  ),
];

function lDraft(room: LRoomMm): RoomDraft {
  return [
    ["wallA", room.wallA],
    ["wallB", room.wallB],
    ["height", room.height],
  ].reduce<RoomDraft>(
    (draft, [field, mm]) =>
      withEnteredText(draft, {
        field: field as RoomLengthField,
        text: String(mm),
      }),
    createRoomDraft("L"),
  );
}

function searchFor(draft: RoomDraft): string {
  return canonicalRoomQuery(draft).toString();
}

/** The criterion's own reference: the parser, over the draft's canonical query. */
function parsed(search: string): RoomUrlState {
  return parseRoomUrlState(queryEntriesOf(search));
}

function oneCLengthFieldsOf(state: RoomUrlState): readonly RoomLengthField[] {
  if (state.substate !== "1C") return [];
  return state.issues
    .map((issue) => issue.field)
    .filter((field): field is RoomLengthField => field !== "shape");
}

// ---------------------------------------------------------------------------------------------
// Criterion 1 — the reasons are exactly the parser's 1C, per field
// ---------------------------------------------------------------------------------------------

describe("the fields carrying a reason are the parser's 1C fields (criterion 1)", () => {
  it.each(FIELD_ARMS)("holds on the $name arm", ({ room, expectedFields }) => {
    fc.assert(
      fc.property(room, (mm) => {
        const search = searchFor(lDraft(mm));

        render(search);

        expect(fieldsWithAReason()).toEqual(oneCLengthFieldsOf(parsed(search)));
        expect(fieldsWithAReason()).toEqual(expectedFields);
      }),
      { numRuns: SAMPLES_PER_ARM },
    );
  });

  it.each(CATALOGUES)(
    "writes each reason beside its own field, in %s",
    (locale, messages) => {
      // The frame's own example room, 3600 x 450: wall B is too short and nothing else is.
      render("shape=L&wallA=3.6&wallB=0.45&height=2.6&direction=left", [
        locale,
        messages,
      ]);

      const reason = elementAt("room-length-reason-wallB");
      expect(reason.textContent).toBe(messageOf("room.issue.wallTooShort"));
      expect(reason.parentElement).toBe(
        fieldFor("wallB").parentElement?.parentElement,
      );
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Criterion 3 — minimum not met is the room's reason, and nothing else
// ---------------------------------------------------------------------------------------------

describe("a room too small for the kitchen is told so once, about the room (criterion 3)", () => {
  const halves = [
    ["wall A wider", tooSmallRoom.filter(({ wallA, wallB }) => wallA > wallB)],
    ["wall B wider", tooSmallRoom.filter(({ wallA, wallB }) => wallB > wallA)],
  ] as const;

  it.each(halves)(
    "shows the room-level reason and marks no field and no wall, %s",
    (_, rooms) => {
      fc.assert(
        fc.property(rooms, (mm) => {
          const search = searchFor(lDraft(mm));
          expect(parsed(search)).toMatchObject({
            substate: "1C",
            issues: [{ field: "shape", code: "ROOM_TOO_SMALL_FOR_KITCHEN" }],
          });

          render(search);

          expect(oneCOnScreen()).toEqual({
            ...NOTHING_OF_ONE_C,
            roomReasons: [messageOf("room.issue.roomTooSmall")],
            isNoteShown: true,
          });
        }),
        { numRuns: SAMPLES_PER_ARM },
      );
    },
  );

  it.each(CATALOGUES)("says it in %s", (locale, messages) => {
    render("shape=L&wallA=0.9&wallB=2.16&height=2.2&direction=right", [
      locale,
      messages,
    ]);

    expect(roomReasonTexts()).toEqual([
      requireLeafAt(messages, "room.issue.roomTooSmall"),
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 4 — live, on the client's clock
// ---------------------------------------------------------------------------------------------

/** Frame 1B's walls with the ceiling still to type — sub-state 1B until the first digit. */
const A_ROOM_AWAITING_ITS_CEILING =
  "shape=L&wallA=3.6&wallB=2.4&direction=left";

describe("1C appears as the customer types, on the pause, and never from the URL (criterion 4)", () => {
  it("paints nothing on any keystroke on the way to a valid ceiling", () => {
    // **The discriminating case, in millimetres** (S1b): *"2"*, *"26"* and *"260"* are each a readable
    // ceiling the domain refuses as too low. With no pause between keystrokes none of them may paint
    // a reason, a red field, the note — or turn *Continuă* on and off.
    render(A_ROOM_AWAITING_ITS_CEILING);
    withholdTheEchoes();

    for (const prefix of ["2", "26", "260"]) {
      type("height", prefix);

      expect(parsed(searchFor(draftWithCeiling(prefix))).substate).toBe("1C");
      expect(oneCOnScreen()).toEqual(NOTHING_OF_ONE_C);
      expect(continueButton().disabled).toBe(true);
    }

    type("height", "2600");

    expect(oneCOnScreen()).toEqual(NOTHING_OF_ONE_C);
    expect(continueButton().disabled).toBe(false);
  });

  it("shows the reason once typing has paused, from a URL that never learned of the keystroke", () => {
    // **The pause and the settle are one interval**, so the settle's write is due at the same
    // millisecond the reason is — and a fake clock runs every timer due at that instant together.
    // What makes the reason the client's is therefore asserted on the read side: the write's echo is
    // withheld, so the query the screen reads still has no ceiling, and nothing has been pushed.
    render(A_ROOM_AWAITING_ITS_CEILING);
    withholdTheEchoes();
    type("height", "2");

    advance(URL_SETTLE_MS - 1);
    expect(routerCalls()).toBe(0);
    expect(oneCOnScreen()).toEqual(NOTHING_OF_ONE_C);

    advance(1);

    expect(browser.push).not.toHaveBeenCalled();
    expect(browser.search).toBe(
      new URLSearchParams(A_ROOM_AWAITING_ITS_CEILING).toString(),
    );
    expect(oneCOnScreen()).toEqual({
      ...NOTHING_OF_ONE_C,
      fieldReasons: ["height"],
      invalidFields: ["height"],
      isNoteShown: true,
    });
    expect(elementAt("room-length-reason-height").textContent).toBe(
      messageOf("room.issue.heightTooLow"),
    );
    expect(continueButton().disabled).toBe(true);
  });

  it("clears every surface on the keystroke that fixes the room, with no router call", () => {
    render(A_ROOM_AWAITING_ITS_CEILING);
    withholdTheEchoes();
    type("height", "260");
    advance(URL_SETTLE_MS);
    expect(fieldsWithAReason()).toEqual(["height"]);
    browser.replace.mockClear();

    type("height", "2600");

    expect(routerCalls()).toBe(0);
    expect(oneCOnScreen()).toEqual(NOTHING_OF_ONE_C);
    expect(continueButton().disabled).toBe(false);
  });

  it("keeps a showing reason, red wall and note through keystrokes that do not fix it", () => {
    // *"Clear on the fixing keystroke"* and no other: wall B stays too short through *"24"* and
    // *"240"*, so nothing flickers off and on again, and it all goes on *"2400"*.
    render("shape=L&wallA=3.6&wallB=0.2&height=2.6&direction=left");
    withholdTheEchoes();
    const settledOnWallB = {
      ...NOTHING_OF_ONE_C,
      fieldReasons: ["wallB"],
      invalidFields: ["wallB"],
      markedWalls: ["room-plan-label-B"],
      isNoteShown: true,
    };
    expect(oneCOnScreen()).toEqual(settledOnWallB);

    for (const stillShort of ["24", "240"]) {
      type("wallB", stillShort);

      expect(oneCOnScreen()).toEqual(settledOnWallB);
      expect(continueButton().disabled).toBe(true);
    }

    type("wallB", "2400");

    expect(oneCOnScreen()).toEqual(NOTHING_OF_ONE_C);
    expect(continueButton().disabled).toBe(false);
  });

  it("waits for the pause before adding a problem the customer has just typed", () => {
    render("shape=L&wallA=3.6&wallB=2.4&height=2&direction=left");
    withholdTheEchoes();
    expect(fieldsWithAReason()).toEqual(["height"]);

    type("wallA", "3");

    expect(fieldsWithAReason()).toEqual(["height"]);
    expect(markedPlanWalls()).toEqual([]);

    advance(URL_SETTLE_MS);

    expect(fieldsWithAReason()).toEqual(["wallA", "height"]);
    expect(markedPlanWalls()).toEqual(["room-plan-label-A"]);
  });

  it("holds the Continue button active through a retyped wall of a valid room until the pause", () => {
    // The CTA's inactive state is on the same clock: a customer retyping 3600 does not see the
    // button go off on *"3"*, *"36"*, *"360"* — and if they stop on a refused value, it goes off.
    render("shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left");
    withholdTheEchoes();

    for (const prefix of ["3", "36", "360"]) {
      type("wallA", prefix);
      expect(continueButton().disabled).toBe(false);
    }

    advance(URL_SETTLE_MS);

    expect(continueButton().disabled).toBe(true);
    expect(fieldsWithAReason()).toEqual(["wallA"]);
  });
});

function draftWithCeiling(text: string): RoomDraft {
  return withEnteredText(lDraft({ wallA: 3600, wallB: 2400, height: 2600 }), {
    field: "height",
    text,
  });
}

// ---------------------------------------------------------------------------------------------
// Criterion 5 — Continuă is inactive exactly at 1C
// ---------------------------------------------------------------------------------------------

/** A room of a shape the approved policy refuses, every field filled — 1C for its shape alone. */
function refusedShapeSearch(shape: Exclude<RoomShape, "L">): string {
  const walls = shape === "U" ? ["wallA", "wallB", "wallC"] : ["wallA"];
  return searchFor(
    [...walls, "height"].reduce<RoomDraft>(
      (draft, field) =>
        withEnteredText(draft, {
          field: field as RoomLengthField,
          text: field === "height" ? "2600" : "3000",
        }),
      createRoomDraft(shape),
    ),
  );
}

describe("the Continue button leads on exactly when the room is one the domain accepts (criterion 5)", () => {
  it.each(FIELD_ARMS)("holds on the $name arm", ({ room }) => {
    fc.assert(
      fc.property(room, (mm) => {
        const search = searchFor(lDraft(mm));

        render(search);

        expect(continueButton().disabled).toBe(
          parsed(search).substate !== "1D",
        );
      }),
      { numRuns: SAMPLES_PER_ARM },
    );
  });

  it("holds on the too-small arm", () => {
    fc.assert(
      fc.property(tooSmallRoom, (mm) => {
        render(searchFor(lDraft(mm)));

        expect(continueButton().disabled).toBe(true);
      }),
      { numRuns: SAMPLES_PER_ARM },
    );
  });

  it.each(["U", "linear"] as const)(
    "is inactive for a filled %s room, which the policy does not build",
    (shape) => {
      const search = refusedShapeSearch(shape);
      expect(parsed(search).substate).toBe("1C");

      render(search);

      expect(continueButton().disabled).toBe(true);
    },
  );

  it("does nothing at all when tapped inactive: no navigation and no composition", () => {
    render("shape=L&wallA=3.6&wallB=0.45&height=2.6&direction=left");
    browser.replace.mockClear();

    click("room-continue");
    advance(URL_SETTLE_MS);

    expect(browser.push).not.toHaveBeenCalled();
    expect(maybeAt("room-compose")).toBe(null);
    expect(maybeAt("room-fields")).not.toBe(null);
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 6 — accessibility is attached, not painted
// ---------------------------------------------------------------------------------------------

function describedBy(input: HTMLInputElement): readonly string[] {
  return (input.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "");
}

describe("a refused field says so to a screen reader (criterion 6)", () => {
  it("describes a refused wall by the hint, its help and its reason, in that order", () => {
    render("shape=L&wallA=3.6&wallB=0.45&height=2.6&direction=left");
    const hintId = elementAt("room-lengths-hint").id;
    const wallB = fieldFor("wallB");

    const [hint, help, reason, ...rest] = describedBy(wallB);

    expect(hint).toBe(hintId);
    expect(help).toBe(`${wallB.id}-help`);
    expect(reason).toBe(elementAt("room-length-reason-wallB").id);
    expect(rest).toEqual([]);
    expect(wallB.getAttribute("aria-invalid")).toBe("true");
  });

  it("describes a refused ceiling by its reason alone, since it has no hint and no help", () => {
    render("shape=L&wallA=3.6&wallB=2.4&height=2&direction=left");

    expect(describedBy(fieldFor("height"))).toEqual([
      elementAt("room-length-reason-height").id,
    ]);
    expect(fieldFor("height").getAttribute("aria-invalid")).toBe("true");
  });

  it("leaves every field the room does not refuse unmarked and undescribed by a reason", () => {
    render("shape=L&wallA=3.6&wallB=0.45&height=2.6&direction=left");

    expect(fieldsMarkedInvalid()).toEqual(["wallB"]);
    expect(describedBy(fieldFor("wallA"))).toHaveLength(2);
    expect(fieldFor("height").hasAttribute("aria-describedby")).toBe(false);
  });

  it("marks nothing at 1B (7F1 criterion 10)", () => {
    render("shape=L");

    expect(oneCOnScreen()).toEqual(NOTHING_OF_ONE_C);
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 11 — the note is 1C's
// ---------------------------------------------------------------------------------------------

describe("the note shows at 1C and nowhere else (criterion 11)", () => {
  it.each([
    ["1A", ""],
    ["1B", "shape=L"],
    ["1B, all but the ceiling", A_ROOM_AWAITING_ITS_CEILING],
    ["1D", "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left"],
  ])("is absent at %s", (_, search) => {
    render(search);

    expect(isNoteShown()).toBe(false);
  });

  it.each(CATALOGUES)(
    "reads the frame's sentence at 1C, in %s",
    (locale, messages) => {
      render("shape=L&wallA=3.6&wallB=0.45&height=2.6&direction=left", [
        locale,
        messages,
      ]);

      expect(elementAt("room-presets-after-valid").textContent).toBe(
        requireLeafAt(messages, "room.presetsAfterValid"),
      );
    },
  );

  it("shows for a room the policy refuses by shape alone", () => {
    render(refusedShapeSearch("U"));

    expect(isNoteShown()).toBe(true);
  });

  it.each(FIELD_ARMS)(
    "shows exactly when the parser says 1C, on the $name arm",
    ({ room }) => {
      fc.assert(
        fc.property(room, (mm) => {
          const search = searchFor(lDraft(mm));

          render(search);

          expect(isNoteShown()).toBe(parsed(search).substate === "1C");
        }),
        { numRuns: SAMPLES_PER_ARM },
      );
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Criterion 12 — 1C removes nothing
// ---------------------------------------------------------------------------------------------

describe("1C keeps the chips and the corner toggle, and both still work (criterion 12)", () => {
  const THREE_REASONS = "shape=L&wallA=0.8&wallB=0.8&height=2&direction=left";

  it("draws the three chips and the toggle beside three reasons", () => {
    render(THREE_REASONS);
    expect(fieldsWithAReason()).toEqual(["wallA", "wallB", "height"]);

    expect(
      container.querySelectorAll("[data-testid^='room-shape-chip-control-']"),
    ).toHaveLength(3);
    expect(maybeAt("room-corner")).not.toBe(null);
  });

  it("mirrors the corner from 1C", () => {
    render(THREE_REASONS);

    click("room-corner-control-right");
    advance(URL_SETTLE_MS);

    expect(new URLSearchParams(browser.search).get("direction")).toBe("right");
    expect(fieldsWithAReason()).toEqual(["wallA", "wallB", "height"]);
  });

  it("changes the shape from 1C", () => {
    render(THREE_REASONS);

    click("room-shape-chip-control-U");

    expect(maybeAt("room-length-wallC")).not.toBe(null);
  });
});

// ---------------------------------------------------------------------------------------------
// After review — only what `qa-7f2-s3-one-c.adversarial.dom.test.ts` does not already assert.
// QA's file is the record for F1, F2 and F3 (review R1.9).
// ---------------------------------------------------------------------------------------------

const A_VALID_ROOM = "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left";

describe("a changed sentence mid-burst is a new problem and waits for the pause (R1.1)", () => {
  it("shows no reason and no mark on wall A from 6500 to 650 until the pause", () => {
    render("shape=L&wallA=6.5&wallB=2.4&height=2.6&direction=left");
    withholdTheEchoes();
    expect(elementAt("room-length-reason-wallA").textContent).toBe(
      messageOf("room.issue.wallTooLong"),
    );

    type("wallA", "650");

    expect(fieldsWithAReason()).toEqual([]);
    expect(markedPlanWalls()).toEqual([]);

    advance(URL_SETTLE_MS);

    expect(elementAt("room-length-reason-wallA").textContent).toBe(
      messageOf("room.issue.wallTooShort"),
    );
    expect(markedPlanWalls()).toEqual(["room-plan-label-A"]);
  });

  it("shows nothing on the way from an emptied 6500 to 4500, and leads on at 4500", () => {
    // The reviewer's trace: through 1B, where everything clears, and back up through *"4"*, *"45"*
    // and *"450"* — each too short, none of them the too-long sentence the burst began on.
    render("shape=L&wallA=6.5&wallB=2.4&height=2.6&direction=left");
    withholdTheEchoes();

    for (const text of ["", "4", "45", "450"]) {
      type("wallA", text);
      expect(fieldsWithAReason()).toEqual([]);
      expect(markedPlanWalls()).toEqual([]);
      expect(continueButton().disabled).toBe(true);
    }

    type("wallA", "4500");

    expect(oneCOnScreen()).toEqual(NOTHING_OF_ONE_C);
    expect(continueButton().disabled).toBe(false);
  });
});

describe("a chip chosen outside a burst shows its 1C at once (R1.4)", () => {
  it("shows the note as soon as the linear chip is chosen from a valid L", () => {
    // A chip is not typing: `noteEdit` carries a burst already running and never starts one. The
    // corner arm is equivalent and not repeated — a mirror never changes whether a room is valid.
    render(A_VALID_ROOM);
    expect(isNoteShown()).toBe(false);

    click("room-shape-chip-control-linear");

    expect(isNoteShown()).toBe(true);
    expect(continueButton().disabled).toBe(true);
  });
});

describe("the tap over an accepted room still leaves (F2's other arm)", () => {
  it("departs and composes from a room the domain accepts, mid-burst", () => {
    render(A_VALID_ROOM);
    type("wallA", "3700");

    click("room-continue");

    expect(maybeAt("room-compose")).not.toBe(null);
  });
});

describe("Continue is described by nothing while the note is not shown (F3)", () => {
  it("points at nothing at 1B, where it is inactive for want of a field", () => {
    render("shape=L");

    expect(continueButton().disabled).toBe(true);
    expect(continueButton().hasAttribute("aria-describedby")).toBe(false);
  });

  it("points at nothing mid-burst, while the note is not yet shown", () => {
    render("shape=L&wallA=3.6&wallB=2.4&direction=left");
    type("height", "2");

    expect(continueButton().hasAttribute("aria-describedby")).toBe(false);
  });
});
