// @vitest-environment happy-dom
//
// **Adversarial QA — wave 7F2 slice S2, the red wall as the card paints it.**
//
// `plan-preview.dom.test.ts` renders frame 1C's one room. This file renders every room the plan marks
// — A, B and both, short and long, both corners, both locales — and holds the paint to the model's
// claim that marking is not geometry: each bar and each label must land on the same pixels as the
// unmarked card's, byte for byte, while only the fill and the words change. It also asks what a
// screen reader gets, since the only difference a customer who cannot see red is left with is the
// label's text.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type CornerDirection,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PLAN_BOX, PlanPreview } from "@/room/plan-preview";
import {
  derivePlanPreview,
  type PlanPreview as PlanPreviewModel,
  type PlanWallId,
} from "@/room/plan-preview-model";
import {
  createRoomDraft,
  withCornerDirection,
  withEnteredText,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import {
  deriveRoomIssueView,
  type MarkedPlanWall,
} from "@/room/room-issue-model";
import { canonicalRoomQuery, queryEntriesOf } from "@/room/room-query-sync";
import { parseRoomUrlState } from "@/room/room-url-state";

import {
  CATALOGUES,
  translatorFor,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";

const RENDERS_PER_LOCALE = 60;

const DIRECTIONS: readonly CornerDirection[] = ["left", "right"];

const MARKED_FILL = "var(--plan-wall-issue)";
const ACCENT_FILL = "var(--accent)";

/** Walls from the first digit typed to past the widest approved wall: where every mark lives. */
const TYPED_WALL_MM = { min: 1, max: 7000 } as const;
const A_VALID_CEILING_MM = 2600;

interface LRoom {
  readonly wallA: number;
  readonly wallB: number;
  readonly direction: CornerDirection;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function draftTyped(
  shape: RoomShape,
  lengths: Partial<Record<RoomLengthField, number>>,
  direction: CornerDirection,
): RoomDraft {
  const typed = Object.entries(lengths).reduce(
    (draft, [field, millimetres]) =>
      withEnteredText(draft, {
        field: field as RoomLengthField,
        text: String(millimetres),
      }),
    createRoomDraft(shape),
  );
  return withCornerDirection(typed, direction);
}

function lDraft(room: LRoom): RoomDraft {
  return draftTyped(
    "L",
    { wallA: room.wallA, wallB: room.wallB, height: A_VALID_CEILING_MM },
    room.direction,
  );
}

function markedWallsOf(draft: RoomDraft): readonly MarkedPlanWall[] {
  return deriveRoomIssueView({
    draft,
    draftState: parseRoomUrlState(
      queryEntriesOf(canonicalRoomQuery(draft).toString()),
    ),
    policy: APPROVED_ROOM_POLICY,
  }).markedWalls;
}

function renderCard(
  plan: PlanPreviewModel,
  markedWalls: readonly MarkedPlanWall[] | undefined,
  [locale, messages]: readonly [CatalogueLocale, Catalogue],
): void {
  const props = markedWalls === undefined ? { plan } : { plan, markedWalls };
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(PlanPreview, props),
        locale,
        messages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

function labelAt(wall: PlanWallId): HTMLElement {
  const label = container.querySelector(
    `[data-testid="room-plan-label-${wall}"]`,
  );
  if (!(label instanceof HTMLElement))
    throw new Error(`the card draws no label for ${wall}`);
  return label;
}

function paintedBars(): readonly Element[] {
  return [...container.querySelectorAll('[data-testid="room-plan"] rect')];
}

/** Where everything on the card was painted, and nothing about how: the rectangles' own attributes
 *  and each label's inline position. */
function paintedGeometry(): string {
  const bars = paintedBars().map((bar) =>
    ["x", "y", "width", "height", "rx"].map((name) => bar.getAttribute(name)),
  );
  const labels = [
    ...container.querySelectorAll<HTMLElement>(
      '[data-testid^="room-plan-label-"]',
    ),
  ].map((label) => [
    label.dataset.testid,
    label.style.left,
    label.style.top,
    label.style.transform,
    label.className,
  ]);
  const box = container.querySelector<HTMLElement>(
    '[data-testid="room-plan-box"]',
  );
  const svg = container.querySelector("svg");
  return JSON.stringify({
    bars,
    labels,
    box: box?.getAttribute("style"),
    viewBox: svg?.getAttribute("viewBox"),
  });
}

function isHiddenFromAssistiveTechnology(element: Element): boolean {
  for (
    let node: Element | null = element;
    node !== null;
    node = node.parentElement
  ) {
    if (
      node.getAttribute("aria-hidden") === "true" ||
      node.hasAttribute("hidden")
    )
      return true;
  }
  return false;
}

const anyMarkedRoom: fc.Arbitrary<LRoom> = fc
  .record({
    wallA: fc.integer(TYPED_WALL_MM),
    wallB: fc.integer(TYPED_WALL_MM),
    direction: fc.constantFrom(...DIRECTIONS),
  })
  .filter((room) => markedWallsOf(lDraft(room)).length > 0);

describe("the red wall moves no pixel on the card", () => {
  it.each(CATALOGUES)(
    "paints every bar and hangs every label where the unmarked card does, for any marked room, in %s",
    (locale, messages) => {
      fc.assert(
        fc.property(anyMarkedRoom, (room) => {
          const draft = lDraft(room);
          const plan = derivePlanPreview(draft, PLAN_BOX);
          renderCard(plan, [], [locale, messages]);
          const unmarked = paintedGeometry();

          renderCard(plan, markedWallsOf(draft), [locale, messages]);

          expect(paintedGeometry()).toBe(unmarked);
        }),
        { numRuns: RENDERS_PER_LOCALE },
      );
    },
  );

  it("renders the same card with no marks passed as with an empty list", () => {
    const plan = derivePlanPreview(
      lDraft({ wallA: 3600, wallB: 2400, direction: "left" }),
      PLAN_BOX,
    );
    renderCard(plan, undefined, ["ro", CATALOGUES[0][1]]);
    const withoutTheProp = container.innerHTML;

    renderCard(plan, [], ["ro", CATALOGUES[0][1]]);

    expect(container.innerHTML).toBe(withoutTheProp);
  });

  it("renders an L exactly as unmarked when the only mark names wall C, which it does not draw", () => {
    const plan = derivePlanPreview(
      lDraft({ wallA: 3600, wallB: 450, direction: "right" }),
      PLAN_BOX,
    );
    renderCard(plan, [], ["ro", CATALOGUES[0][1]]);
    const unmarked = container.innerHTML;

    renderCard(
      plan,
      [{ wall: "C", labelKey: "room.planWallIssue.tooLong" }],
      ["ro", CATALOGUES[0][1]],
    );

    expect(container.innerHTML).toBe(unmarked);
    expect(paintedBars()).toHaveLength(2);
  });
});

describe("only the marked walls are red, and each says why in words", () => {
  it.each(CATALOGUES)(
    "paints exactly the marked walls red and writes each one's reason, with no digit or unit, in %s",
    (locale, messages) => {
      const translate = translatorFor(locale, messages);
      fc.assert(
        fc.property(anyMarkedRoom, (room) => {
          const draft = lDraft(room);
          const plan = derivePlanPreview(draft, PLAN_BOX);
          const marks = markedWallsOf(draft);
          renderCard(plan, marks, [locale, messages]);
          if (plan.kind !== "drawn")
            throw new Error("a marked room draws a plan");

          plan.walls.forEach((wall, index) => {
            const mark = marks.find(
              (candidate) => candidate.wall === wall.wall,
            );
            const label = labelAt(wall.wall);
            expect(paintedBars()[index]?.getAttribute("fill")).toBe(
              mark === undefined ? ACCENT_FILL : MARKED_FILL,
            );
            expect(label.dataset.marked).toBe(String(mark !== undefined));
            if (mark === undefined) {
              expect(label.textContent).toBe(
                translate("room.planWallLabel", {
                  wall: wall.wall,
                  millimetres: wall.lengthMm,
                }),
              );
              return;
            }
            expect(label.textContent).toBe(
              translate(mark.labelKey, { wall: wall.wall }),
            );
            expect(label.textContent).not.toMatch(/\p{Nd}/u);
            expect(label.textContent).not.toMatch(/\bmm\b|мм/u);
          });
        }),
        { numRuns: RENDERS_PER_LOCALE },
      );
    },
  );

  // Criterion 7's reflection arm on the card: frame 1C's room mirrored puts wall B at the right edge,
  // and the red bar must be the one standing there — the bar the unmarked card paints for B.
  it.each(DIRECTIONS)(
    "paints the bar standing where wall B is drawn red, turning %s",
    (direction) => {
      const draft = lDraft({ wallA: 3600, wallB: 450, direction });
      const plan = derivePlanPreview(draft, PLAN_BOX);
      if (plan.kind !== "drawn")
        throw new Error("frame 1C's room draws a plan");
      const wallB = plan.walls.find((wall) => wall.wall === "B");
      renderCard(plan, markedWallsOf(draft), ["ro", CATALOGUES[0][1]]);

      const redBars = paintedBars().filter(
        (bar) => bar.getAttribute("fill") === MARKED_FILL,
      );

      expect(redBars).toHaveLength(1);
      expect(Number(redBars[0]?.getAttribute("x"))).toBe(wallB?.xPx);
      expect(Number(redBars[0]?.getAttribute("height"))).toBe(wallB?.heightPx);
    },
  );
});

describe("the red is not the only signal (accessibility)", () => {
  it.each(CATALOGUES)(
    "exposes the marked wall's reason as text no ancestor hides, in %s",
    (locale, messages) => {
      const draft = lDraft({ wallA: 3600, wallB: 450, direction: "left" });
      renderCard(derivePlanPreview(draft, PLAN_BOX), markedWallsOf(draft), [
        locale,
        messages,
      ]);

      const label = labelAt("B");

      expect(isHiddenFromAssistiveTechnology(label)).toBe(false);
      expect(label.textContent).toBe(
        translatorFor(locale, messages)("room.planWallIssue.tooShort", {
          wall: "B",
        }),
      );
    },
  );

  it.each(CATALOGUES)(
    "changes the marked wall's words, not only its colour, in %s",
    (locale, messages) => {
      const draft = lDraft({ wallA: 3600, wallB: 450, direction: "left" });
      const plan = derivePlanPreview(draft, PLAN_BOX);
      renderCard(plan, [], [locale, messages]);
      const unmarkedText = labelAt("B").textContent;

      renderCard(plan, markedWallsOf(draft), [locale, messages]);

      expect(labelAt("B").textContent).not.toBe(unmarkedText);
      expect(labelAt("A").textContent).toBe(
        translatorFor(locale, messages)("room.planWallLabel", {
          wall: "A",
          millimetres: 3600,
        }),
      );
    },
  );

  it("keeps the red bar inside the drawing that is hidden, so the reason is read once and not twice", () => {
    const draft = lDraft({ wallA: 3600, wallB: 450, direction: "left" });
    renderCard(derivePlanPreview(draft, PLAN_BOX), markedWallsOf(draft), [
      "ro",
      CATALOGUES[0][1],
    ]);

    const redBar = paintedBars().find(
      (bar) => bar.getAttribute("fill") === MARKED_FILL,
    );

    expect(redBar).toBeDefined();
    expect(isHiddenFromAssistiveTechnology(redBar ?? container)).toBe(true);
  });
});
