// @vitest-environment happy-dom
// M8D wave W2, adversarial QA of the Preview pop-up (criteria C-1, C-2, C-6, C-7, C-8, C-10, C-11, C-13, C-14, X-7).
// happy-dom has no layout, no CSS and no native Tab movement, so this file proves STATE and WIRING: which input reaches
// the one transition function, what Select names, what each copy status leaves enabled, where focus is, what a press on
// the scrim does. Geometry, fades and the real Tab ring are `qa-m8d-preview-popup.adversarial.e2e.spec.ts`.
import { fc } from "@fast-check/vitest";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PresetCarouselDialog,
  type PresetSlide,
} from "@/room/preset-carousel-dialog";
import {
  slideTransition,
  stepOfSwipe,
  SWIPE_THRESHOLD_PX,
} from "@/room/slide-transition";
import type { PresetCopyStatus } from "@/room/use-generation";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import type { Catalogue, CatalogueLocale } from "../support/catalogues";

// Wrapped, not replaced: the real arithmetic still runs, and the spies say who asked for it.
vi.mock("@/room/slide-transition", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/room/slide-transition")>();
  return {
    ...actual,
    slideTransition: vi.fn(actual.slideTransition),
    stepOfSwipe: vi.fn(actual.stepOfSwipe),
  };
});

const SEED = 20_261_018;
const TOUCH = { pointerType: "touch", isPrimary: true, pointerId: 7 } as const;
const BELOW_THRESHOLD_PX = SWIPE_THRESHOLD_PX - 1;
const LONG_DRAG_PX = 120;

interface Probe {
  readonly selected: string[];
  slideChanges: number;
  closes: number;
}

interface Mounted {
  readonly probe: Probe;
  readonly setCopyStatus: (status: PresetCopyStatus) => void;
}

let container: HTMLDivElement;
let root: Root;
let outside: HTMLButtonElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(slideTransition).mockClear();
  vi.mocked(stepOfSwipe).mockClear();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function slidesOf(count: number): readonly PresetSlide[] {
  return Array.from({ length: count }, (_, position) => ({
    id: `preset-${String(position + 1)}`,
    name: `Kitchen ${String(position + 1)}`,
    imageUrl: `/api/presets/preset-${String(position + 1)}/image`,
    isAdjusted: false,
  }));
}

interface MountOptions {
  readonly count: number;
  readonly startIndex?: number;
  readonly copyStatus?: PresetCopyStatus;
  /** Plays the caller's part: the real `usePresetCopy` moves to `saving` the moment Select acts. */
  readonly savesOnSelect?: boolean;
  readonly locale?: CatalogueLocale;
}

function mount(options: MountOptions): Mounted {
  const probe: Probe = { selected: [], slideChanges: 0, closes: 0 };
  const locale = options.locale ?? "ro";
  const messages = locale === "ro" ? roMessages : (ruMessages as Catalogue);
  const control: { setCopyStatus: (status: PresetCopyStatus) => void } = {
    setCopyStatus: () => undefined,
  };

  function Host() {
    const [copyStatus, setCopyStatus] = useState<PresetCopyStatus>(
      options.copyStatus ?? "idle",
    );
    control.setCopyStatus = setCopyStatus;
    return createElement(PresetCarouselDialog, {
      slides: slidesOf(options.count),
      startIndex: options.startIndex ?? 0,
      copyStatus,
      onSelect: (presetId: string) => {
        probe.selected.push(presetId);
        if (options.savesOnSelect === true) setCopyStatus("saving");
      },
      onSlideChange: () => {
        probe.slideChanges += 1;
      },
      onClose: () => {
        probe.closes += 1;
      },
    });
  }

  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(
          "main",
          null,
          createElement("button", { type: "button", id: "outside" }, "outside"),
          createElement(Host),
        ),
        locale,
        messages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
  const outsideButton = container.querySelector<HTMLButtonElement>("#outside");
  if (outsideButton === null)
    throw new Error("the band behind the dialog is not drawn");
  outside = outsideButton;
  return {
    probe,
    setCopyStatus: (status) => {
      act(() => {
        control.setCopyStatus(status);
      });
    },
  };
}

function byTestId(testId: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  if (element === null) throw new Error(`nothing drawn as ${testId}`);
  return element;
}

function maybeByTestId(testId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

function press(testId: string): void {
  const element = byTestId(testId);
  act(() => {
    element.click();
  });
}

function pressKey(
  key: string,
  target: Element = byTestId("preset-carousel-dialog"),
): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

function pressEscape(): void {
  pressKey("Escape", document.body);
}

function pressTab(options: { readonly backwards: boolean }): boolean {
  const target = document.activeElement ?? document.body;
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey: options.backwards,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

function firePointer(
  type: "pointerdown" | "pointerup" | "pointercancel",
  at: { readonly x: number; readonly y: number },
  init: Partial<PointerEventInit> = TOUCH,
): void {
  act(() => {
    byTestId("preset-carousel-slide").dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: at.x,
        clientY: at.y,
        ...init,
      }),
    );
  });
}

/** A finger down at (200, 300) and up `deltaX`, `deltaY` away. */
function drag(
  deltaX: number,
  deltaY: number,
  init: Partial<PointerEventInit> = TOUCH,
): void {
  firePointer("pointerdown", { x: 200, y: 300 }, init);
  firePointer("pointerup", { x: 200 + deltaX, y: 300 + deltaY }, init);
}

function positionText(): string | null {
  return maybeByTestId("preset-carousel-position")?.textContent ?? null;
}

function nameText(): string {
  return byTestId("preset-carousel-name").textContent;
}

function button(testId: string): HTMLButtonElement {
  return byTestId(testId) as HTMLButtonElement;
}

function toneOfStatus(): string | null {
  return (
    byTestId("preset-carousel-status")
      .closest("[data-tone]")
      ?.getAttribute("data-tone") ?? null
  );
}

function statusText(): string {
  return byTestId("preset-carousel-status").textContent;
}

function isInsideTheDialog(element: Element | null): boolean {
  return byTestId("preset-carousel-dialog").contains(element);
}

describe("every input that moves the slide goes through the one transition function (C-10)", () => {
  it("asks slideTransition for -1 when Previous is pressed", () => {
    mount({ count: 3, startIndex: 1 });

    press("preset-carousel-previous");

    expect(slideTransition).toHaveBeenCalledWith({
      index: 1,
      count: 3,
      step: -1,
    });
    expect(positionText()).toBe("1 / 3");
  });

  it("asks slideTransition for +1 when Next is pressed", () => {
    mount({ count: 3, startIndex: 1 });

    press("preset-carousel-next");

    expect(slideTransition).toHaveBeenCalledWith({
      index: 1,
      count: 3,
      step: 1,
    });
    expect(positionText()).toBe("3 / 3");
  });

  it("asks slideTransition for -1 on ArrowLeft", () => {
    mount({ count: 3, startIndex: 1 });

    pressKey("ArrowLeft");

    expect(slideTransition).toHaveBeenCalledWith({
      index: 1,
      count: 3,
      step: -1,
    });
    expect(positionText()).toBe("1 / 3");
  });

  it("asks slideTransition for +1 on ArrowRight", () => {
    mount({ count: 3, startIndex: 1 });

    pressKey("ArrowRight");

    expect(slideTransition).toHaveBeenCalledWith({
      index: 1,
      count: 3,
      step: 1,
    });
    expect(positionText()).toBe("3 / 3");
  });

  it("reads a touch swipe to the left through stepOfSwipe and then slideTransition(+1)", () => {
    mount({ count: 3, startIndex: 1 });

    drag(-LONG_DRAG_PX, 0);

    expect(stepOfSwipe).toHaveBeenCalledWith({
      deltaX: -LONG_DRAG_PX,
      deltaY: 0,
    });
    expect(slideTransition).toHaveBeenCalledWith({
      index: 1,
      count: 3,
      step: 1,
    });
    expect(positionText()).toBe("3 / 3");
  });

  it("reads a touch swipe to the right through stepOfSwipe and then slideTransition(-1)", () => {
    mount({ count: 3, startIndex: 1 });

    drag(LONG_DRAG_PX, 0);

    expect(slideTransition).toHaveBeenCalledWith({
      index: 1,
      count: 3,
      step: -1,
    });
    expect(positionText()).toBe("1 / 3");
  });

  it("ignores any other key", () => {
    mount({ count: 3, startIndex: 1 });

    for (const key of ["ArrowUp", "ArrowDown", "Home", "End", "a", " "]) {
      pressKey(key);
    }

    expect(positionText()).toBe("2 / 3");
    expect(slideTransition).not.toHaveBeenCalled();
  });
});

describe("which pointers swipe (C-10)", () => {
  it.each([
    ["a mouse", { pointerType: "mouse", isPrimary: true, pointerId: 7 }],
    ["a pen", { pointerType: "pen", isPrimary: true, pointerId: 7 }],
    [
      "a second finger",
      { pointerType: "touch", isPrimary: false, pointerId: 7 },
    ],
  ] as const)(
    "does not move the slide for %s dragged far to the left",
    (_name, init) => {
      mount({ count: 3, startIndex: 1 });

      drag(-LONG_DRAG_PX, 0, init);

      expect(positionText()).toBe("2 / 3");
      expect(slideTransition).not.toHaveBeenCalled();
    },
  );

  it("moves one slide for a primary touch released exactly at the threshold and none one pixel short", () => {
    mount({ count: 5, startIndex: 2 });

    drag(-BELOW_THRESHOLD_PX, 0);
    expect(positionText()).toBe("3 / 5");

    drag(-SWIPE_THRESHOLD_PX, 0);
    expect(positionText()).toBe("4 / 5");
  });

  it("does not move the slide for a mostly vertical drag, however far", () => {
    mount({ count: 3, startIndex: 1 });

    drag(-70, 400);
    drag(70, -400);

    expect(positionText()).toBe("2 / 3");
  });

  it("does not move the slide when the touch is cancelled, as the browser does when it takes the pan", () => {
    mount({ count: 3, startIndex: 1 });

    firePointer("pointerdown", { x: 200, y: 300 });
    firePointer("pointercancel", { x: 40, y: 300 });
    firePointer("pointerup", { x: 40, y: 300 });

    expect(positionText()).toBe("2 / 3");
  });

  it("does not take a release for another finger as the end of this swipe", () => {
    mount({ count: 3, startIndex: 1 });

    firePointer("pointerdown", { x: 200, y: 300 }, { ...TOUCH, pointerId: 1 });
    firePointer("pointerup", { x: 20, y: 300 }, { ...TOUCH, pointerId: 2 });

    expect(positionText()).toBe("2 / 3");
  });

  it("does not remember a swipe's start for the next release: a release with no touch-down moves nothing", () => {
    mount({ count: 3, startIndex: 1 });
    drag(-LONG_DRAG_PX, 0);

    firePointer("pointerup", { x: 20, y: 300 });

    expect(positionText()).toBe("3 / 3");
  });

  it("never calls preventDefault on the pointer events it listens to, so the sheet keeps its vertical pan", () => {
    mount({ count: 3, startIndex: 1 });
    const slide = byTestId("preset-carousel-slide");
    const events = (["pointerdown", "pointerup"] as const).map(
      (type) =>
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100,
          ...TOUCH,
        }),
    );

    act(() => {
      for (const event of events) slide.dispatchEvent(event);
    });

    expect(events.map((event) => event.defaultPrevented)).toEqual([
      false,
      false,
    ]);
  });
});

describe("the ends do not wrap (C-1)", () => {
  it("disables Previous on slide 1 and Next on slide N", () => {
    mount({ count: 3, startIndex: 0 });
    expect(button("preset-carousel-previous").disabled).toBe(true);
    expect(button("preset-carousel-next").disabled).toBe(false);

    press("preset-carousel-next");
    press("preset-carousel-next");

    expect(button("preset-carousel-next").disabled).toBe(true);
    expect(button("preset-carousel-previous").disabled).toBe(false);
  });

  it("stays on slide N for Next, ArrowRight and a left swipe", () => {
    const { probe } = mount({ count: 3, startIndex: 2 });

    press("preset-carousel-next");
    pressKey("ArrowRight");
    drag(-LONG_DRAG_PX, 0);

    expect(positionText()).toBe("3 / 3");
    expect(nameText()).toBe("Kitchen 3");
    expect(probe.slideChanges).toBe(0);
  });

  it("stays on slide 1 for Previous, ArrowLeft and a right swipe", () => {
    const { probe } = mount({ count: 3, startIndex: 0 });

    press("preset-carousel-previous");
    pressKey("ArrowLeft");
    drag(LONG_DRAG_PX, 0);

    expect(positionText()).toBe("1 / 3");
    expect(nameText()).toBe("Kitchen 1");
    expect(probe.slideChanges).toBe(0);
  });

  it("opens on the slide it is given, not on the first", () => {
    mount({ count: 5, startIndex: 3 });

    expect(positionText()).toBe("4 / 5");
    expect(nameText()).toBe("Kitchen 4");
  });
});

describe("one preset (C-2)", () => {
  it("draws no counter text, no position, and neither Previous nor Next", () => {
    mount({ count: 1 });

    expect(maybeByTestId("preset-carousel-position")).toBeNull();
    expect(maybeByTestId("preset-carousel-previous")).toBeNull();
    expect(maybeByTestId("preset-carousel-next")).toBeNull();
    expect(byTestId("preset-carousel-dialog").textContent).not.toMatch(
      /\d\s*\/\s*\d/,
    );
    expect(byTestId("preset-carousel-select")).not.toBeNull();
  });

  it("still names the only preset when Select is pressed", () => {
    const { probe } = mount({ count: 1 });

    press("preset-carousel-select");

    expect(probe.selected).toEqual(["preset-1"]);
  });

  it("ignores the arrow keys and a swipe", () => {
    const { probe } = mount({ count: 1 });

    pressKey("ArrowRight");
    pressKey("ArrowLeft");
    drag(-LONG_DRAG_PX, 0);

    expect(nameText()).toBe("Kitchen 1");
    expect(probe.slideChanges).toBe(0);
  });
});

describe("Select names the slide on screen (C-10)", () => {
  it("copies the slide it ended on, not the one the pop-up opened on", () => {
    const { probe } = mount({ count: 4, startIndex: 1 });

    press("preset-carousel-next");
    pressKey("ArrowRight");
    press("preset-carousel-select");

    expect(probe.selected).toEqual(["preset-4"]);
  });

  it("copies the opening slide when the pop-up was moved away and back", () => {
    const { probe } = mount({ count: 4, startIndex: 1 });

    pressKey("ArrowRight");
    drag(LONG_DRAG_PX, 0);
    press("preset-carousel-select");

    expect(probe.selected).toEqual(["preset-2"]);
  });

  it("agrees with the position, the name and a model for any sequence of inputs over 1 to 8 slides", () => {
    const tally = {
      lowerClamp: 0,
      upperClamp: 0,
      interior: 0,
      ignoredPointer: 0,
    };

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }).chain((count) =>
          fc.record({
            count: fc.constant(count),
            start: fc.integer({ min: 0, max: count - 1 }),
            inputs: fc.array(inputArbitrary, { maxLength: 20 }),
          }),
        ),
        ({ count, start, inputs }) => {
          const { probe } = mount({ count, startIndex: start });
          let model = start;
          let movesInModel = 0;
          for (const input of inputs) {
            const step = STEP_OF_INPUT[input];
            const target = Math.min(Math.max(model + step, 0), count - 1);
            if (step === -1 && model === 0) tally.lowerClamp += 1;
            else if (step === 1 && model === count - 1) tally.upperClamp += 1;
            else if (step !== 0) tally.interior += 1;
            if (input === "mouseSwipeLeft") tally.ignoredPointer += 1;
            if (target !== model) movesInModel += 1;
            model = target;
            perform(input);
            expect(nameText()).toBe(`Kitchen ${String(model + 1)}`);
            expect(positionText()).toBe(
              count === 1 ? null : `${String(model + 1)} / ${String(count)}`,
            );
          }
          press("preset-carousel-select");

          expect(probe.selected).toEqual([`preset-${String(model + 1)}`]);
          expect(probe.slideChanges).toBe(movesInModel);
          act(() => {
            root.render(createElement("div"));
          });
        },
      ),
      { seed: SEED, numRuns: 60 },
    );

    expect(tally.lowerClamp).toBeGreaterThan(0);
    expect(tally.upperClamp).toBeGreaterThan(0);
    expect(tally.interior).toBeGreaterThan(0);
    expect(tally.ignoredPointer).toBeGreaterThan(0);
  });
});

describe("what the caller is told when the slide changes", () => {
  it("is told exactly once per real move and never for a move that stays", () => {
    const { probe } = mount({ count: 3, startIndex: 0 });

    pressKey("ArrowLeft");
    expect(probe.slideChanges).toBe(0);
    pressKey("ArrowRight");
    expect(probe.slideChanges).toBe(1);
    drag(-BELOW_THRESHOLD_PX, 0);
    expect(probe.slideChanges).toBe(1);
    press("preset-carousel-next");
    expect(probe.slideChanges).toBe(2);
    pressKey("ArrowRight");
    expect(probe.slideChanges).toBe(2);
  });
});

describe("the Preview pop-up while the copy is being written (C-6)", () => {
  it("says the selecting sentence in the progress tone and keeps Select's own label", () => {
    mount({ count: 3, startIndex: 1, copyStatus: "saving" });

    expect(toneOfStatus()).toBe("progress");
    expect(statusText()).toBe(roMessages.presetChooser.selecting);
    expect(byTestId("preset-carousel-select").textContent).toBe(
      roMessages.presetChooser.select,
    );
  });

  it("marks Select busy and aria-disabled but not natively disabled, so it keeps focus", () => {
    mount({ count: 3, startIndex: 1, copyStatus: "saving" });
    const select = button("preset-carousel-select");

    expect(select.getAttribute("aria-busy")).toBe("true");
    expect(select.getAttribute("aria-disabled")).toBe("true");
    expect(select.disabled).toBe(false);
  });

  it("marks the close button aria-disabled but not natively disabled, and Previous and Next disabled", () => {
    mount({ count: 3, startIndex: 1, copyStatus: "saving" });
    const close = button("preset-carousel-close");

    expect(close.getAttribute("aria-disabled")).toBe("true");
    expect(close.disabled).toBe(false);
    expect(button("preset-carousel-previous").disabled).toBe(true);
    expect(button("preset-carousel-next").disabled).toBe(true);
  });

  it("is idle and enabled everywhere before the copy starts", () => {
    mount({ count: 3, startIndex: 1 });

    expect(button("preset-carousel-select").getAttribute("aria-busy")).toBe(
      "false",
    );
    expect(button("preset-carousel-select").getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(button("preset-carousel-close").getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(button("preset-carousel-previous").disabled).toBe(false);
    expect(button("preset-carousel-next").disabled).toBe(false);
  });

  it("closes on nothing: Escape, the scrim, the close button", () => {
    const { probe } = mount({ count: 3, startIndex: 1, copyStatus: "saving" });

    pressEscape();
    press("preset-carousel-scrim");
    press("preset-carousel-close");

    expect(probe.closes).toBe(0);
  });

  it("moves on no input: arrows, buttons and swipes change nothing and tell nobody", () => {
    const { probe } = mount({ count: 3, startIndex: 1, copyStatus: "saving" });

    pressKey("ArrowLeft");
    pressKey("ArrowRight");
    press("preset-carousel-previous");
    press("preset-carousel-next");
    drag(-LONG_DRAG_PX, 0);
    drag(LONG_DRAG_PX, 0);

    expect(positionText()).toBe("2 / 3");
    expect(probe.slideChanges).toBe(0);
  });

  it("acts on Select no more than once however often it is pressed", () => {
    const { probe } = mount({ count: 3, startIndex: 1, savesOnSelect: true });

    press("preset-carousel-select");
    press("preset-carousel-select");
    press("preset-carousel-select");

    expect(probe.selected).toEqual(["preset-2"]);
  });

  it("closes again on Escape, the scrim and the close button once the write has ended", () => {
    const { probe, setCopyStatus } = mount({
      count: 3,
      startIndex: 1,
      copyStatus: "saving",
    });
    setCopyStatus("failed");

    pressEscape();
    press("preset-carousel-scrim");
    press("preset-carousel-close");

    expect(probe.closes).toBe(3);
  });
});

describe("a failed copy (C-7)", () => {
  it("says the failure sentence in the error tone and leaves Select able to act", () => {
    const { probe } = mount({ count: 3, startIndex: 1, copyStatus: "failed" });

    expect(toneOfStatus()).toBe("error");
    expect(statusText()).toBe(roMessages.presetChooser.selectFailed);
    expect(button("preset-carousel-select").getAttribute("aria-disabled")).toBe(
      "false",
    );

    press("preset-carousel-select");
    expect(probe.selected).toEqual(["preset-2"]);
  });

  it("tells the caller on a slide change, which is how the failure is cleared", () => {
    const { probe } = mount({ count: 3, startIndex: 1, copyStatus: "failed" });

    press("preset-carousel-next");

    expect(probe.slideChanges).toBe(1);
  });

  it("goes back to saying nothing, in no tone, once the caller reports idle", () => {
    const { setCopyStatus } = mount({
      count: 3,
      startIndex: 1,
      copyStatus: "failed",
    });

    setCopyStatus("idle");

    expect(statusText()).toBe("");
    expect(toneOfStatus()).toBeNull();
  });
});

describe("the day's limit (C-8)", () => {
  it("says the limit sentence in the warn tone, not the error tone", () => {
    mount({ count: 3, startIndex: 1, copyStatus: "limited" });

    expect(toneOfStatus()).toBe("warn");
    expect(statusText()).toBe(roMessages.presetChooser.selectLimitReached);
  });

  it("leaves Select aria-disabled on every slide and never calls onSelect", () => {
    const { probe } = mount({ count: 3, startIndex: 0, copyStatus: "limited" });

    for (let position = 0; position < 3; position += 1) {
      expect(
        button("preset-carousel-select").getAttribute("aria-disabled"),
      ).toBe("true");
      expect(button("preset-carousel-select").disabled).toBe(false);
      press("preset-carousel-select");
      pressKey("ArrowRight");
    }

    expect(probe.selected).toEqual([]);
  });

  it("still moves by Previous, Next, the arrows and a swipe, and the sentence stays", () => {
    mount({ count: 4, startIndex: 1, copyStatus: "limited" });

    press("preset-carousel-next");
    expect(positionText()).toBe("3 / 4");
    pressKey("ArrowRight");
    expect(positionText()).toBe("4 / 4");
    drag(LONG_DRAG_PX, 0);
    expect(positionText()).toBe("3 / 4");
    press("preset-carousel-previous");
    expect(positionText()).toBe("2 / 4");

    expect(statusText()).toBe(roMessages.presetChooser.selectLimitReached);
    expect(toneOfStatus()).toBe("warn");
  });

  it("is not busy: nothing is being written", () => {
    mount({ count: 3, startIndex: 1, copyStatus: "limited" });

    expect(button("preset-carousel-select").getAttribute("aria-busy")).toBe(
      "false",
    );
    expect(button("preset-carousel-close").getAttribute("aria-disabled")).toBe(
      "false",
    );
  });
});

describe.each([
  ["ro", roMessages],
  ["ru", ruMessages as Catalogue],
] as const)("the status sentences in %s", (locale, messages) => {
  it.each([
    ["saving", "progress", "selecting"],
    ["failed", "error", "selectFailed"],
    ["limited", "warn", "selectLimitReached"],
  ] as const)("shows %s as the %s tone with %s", (copyStatus, tone, key) => {
    mount({ count: 2, copyStatus, locale });

    expect(statusText()).toBe(messages.presetChooser[key]);
    expect(toneOfStatus()).toBe(tone);
  });
});

describe("the scrim (C-14)", () => {
  it("closes the pop-up once when it is tapped in the idle state", () => {
    const { probe } = mount({ count: 3, startIndex: 1 });

    press("preset-carousel-scrim");

    expect(probe.closes).toBe(1);
  });

  it("closes on the close button and on Escape in the idle state", () => {
    const { probe } = mount({ count: 3, startIndex: 1 });

    press("preset-carousel-close");
    pressEscape();

    expect(probe.closes).toBe(2);
  });

  it("refuses to take focus off the dialog when it is pressed, because the page would get it", () => {
    mount({ count: 3, startIndex: 1 });
    const press_ = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      byTestId("preset-carousel-scrim").dispatchEvent(press_);
    });

    expect(press_.defaultPrevented).toBe(true);
  });
});

describe("focus never leaves the dialog (X-7)", () => {
  it("opens with focus on the dialog itself", () => {
    mount({ count: 3, startIndex: 1 });

    expect(document.activeElement).toBe(byTestId("preset-carousel-dialog"));
  });

  it("keeps focus on Select, the control the press left it on, while the write is in flight", () => {
    const { setCopyStatus } = mount({ count: 3, startIndex: 1 });
    button("preset-carousel-select").focus();

    setCopyStatus("saving");

    expect(document.activeElement).toBe(byTestId("preset-carousel-select"));
  });

  it.each(["preset-carousel-previous", "preset-carousel-next"])(
    "hands focus to Select when the write begins with %s focused, since it is about to be disabled",
    (testId) => {
      const { setCopyStatus } = mount({ count: 3, startIndex: 1 });
      button(testId).focus();

      setCopyStatus("saving");

      expect(document.activeElement).toBe(byTestId("preset-carousel-select"));
    },
  );

  it("hands focus to Select when the write begins with focus on the page", () => {
    const { setCopyStatus } = mount({ count: 3, startIndex: 1 });
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    expect(document.activeElement).toBe(document.body);

    setCopyStatus("saving");

    expect(document.activeElement).toBe(byTestId("preset-carousel-select"));
  });

  it("hands focus to Select when Next is pressed into the last slide, where Next is disabled", () => {
    mount({ count: 3, startIndex: 1 });
    button("preset-carousel-next").focus();

    pressKey("ArrowRight", button("preset-carousel-next"));

    expect(document.activeElement).toBe(byTestId("preset-carousel-select"));
  });

  it("hands focus to Select when Previous is pressed into the first slide", () => {
    mount({ count: 3, startIndex: 1 });
    button("preset-carousel-previous").focus();

    press("preset-carousel-previous");
    button("preset-carousel-previous").focus();
    pressKey("ArrowLeft", button("preset-carousel-previous"));

    expect(positionText()).toBe("1 / 3");
    expect(isInsideTheDialog(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(byTestId("preset-carousel-select"));
  });

  it.each(["idle", "saving", "failed", "limited"] as const)(
    "wraps Tab from the last control to the first and Shift+Tab from the first to the last when %s",
    (copyStatus) => {
      mount({ count: 3, startIndex: 1, copyStatus });
      const stops = stopsOfTheDialog();
      const first = stops.at(0);
      const last = stops.at(-1);
      expect(first).toBe(byTestId("preset-carousel-close"));
      expect(last).toBe(byTestId("preset-carousel-select"));

      last?.focus();
      const tabWrapped = pressTab({ backwards: false });
      const afterTab = document.activeElement;
      first?.focus();
      const shiftTabWrapped = pressTab({ backwards: true });
      const afterShiftTab = document.activeElement;

      expect([tabWrapped, afterTab]).toEqual([true, first]);
      expect([shiftTabWrapped, afterShiftTab]).toEqual([true, last]);
    },
  );

  it.each(["idle", "saving", "failed", "limited"] as const)(
    "sends Tab and Shift+Tab pressed from the dialog's own surface to the first and the last control when %s",
    (copyStatus) => {
      mount({ count: 3, startIndex: 1, copyStatus });
      const surface = byTestId("preset-carousel-dialog");

      surface.focus();
      pressTab({ backwards: false });
      const afterTab = document.activeElement;
      surface.focus();
      pressTab({ backwards: true });
      const afterShiftTab = document.activeElement;

      expect(afterTab).toBe(byTestId("preset-carousel-close"));
      expect(afterShiftTab).toBe(byTestId("preset-carousel-select"));
    },
  );

  it("keeps the close button and Select in the Tab ring while the write is in flight, so the ring is never empty", () => {
    mount({ count: 3, startIndex: 1, copyStatus: "saving" });

    expect(stopsOfTheDialog()).toEqual([
      byTestId("preset-carousel-close"),
      byTestId("preset-carousel-select"),
    ]);
  });

  it("lists the controls in the DOM order close, Previous, Next, Select (owner answer O-2)", () => {
    mount({ count: 3, startIndex: 1 });

    expect(stopsOfTheDialog()).toEqual([
      byTestId("preset-carousel-close"),
      byTestId("preset-carousel-previous"),
      byTestId("preset-carousel-next"),
      byTestId("preset-carousel-select"),
    ]);
  });

  it("marks every band behind the dialog inert while it is open and lifts the marks when it closes", () => {
    mount({ count: 3, startIndex: 1 });

    expect(outside.closest("main > *")?.hasAttribute("inert")).toBe(true);

    act(() => {
      root.render(
        createElement("main", null, createElement("button", { id: "outside" })),
      );
    });

    expect(container.querySelector("#outside")?.hasAttribute("inert")).toBe(
      false,
    );
  });
});

describe("the slide images mounted at once (C-13)", () => {
  it("mounts at most three images, only the current one visible, whichever slide is on screen", () => {
    mount({ count: 8, startIndex: 0 });
    const widest: number[] = [];

    for (let position = 0; position < 8; position += 1) {
      const images = [
        ...byTestId("preset-carousel-slide").querySelectorAll("img"),
      ];
      const visible = images.filter(
        (image) => image.closest("[hidden]") === null,
      );
      widest.push(images.length);
      expect(images.length).toBeLessThanOrEqual(3);
      expect(visible).toHaveLength(1);
      expect(visible[0]?.getAttribute("alt")).toBe(
        `Kitchen ${String(position + 1)}`,
      );
      pressKey("ArrowRight");
    }

    expect(Math.max(...widest)).toBe(3);
  });

  it("mounts the neighbours eagerly and the one on screen lazily, so the next image is there when it is wanted", () => {
    mount({ count: 5, startIndex: 2 });

    const loadingByAlt = Object.fromEntries(
      [...byTestId("preset-carousel-slide").querySelectorAll("img")].map(
        (image): [string, string | null] => [
          image.alt,
          image.getAttribute("loading"),
        ],
      ),
    );

    expect(loadingByAlt).toEqual({
      "Kitchen 2": "eager",
      "Kitchen 3": "lazy",
      "Kitchen 4": "eager",
    });
  });

  it("mounts two images for a list of two and one for a single preset", () => {
    mount({ count: 2, startIndex: 0 });
    expect(
      byTestId("preset-carousel-slide").querySelectorAll("img"),
    ).toHaveLength(2);

    act(() => {
      root.render(createElement("div"));
    });
    mount({ count: 1 });
    expect(
      byTestId("preset-carousel-slide").querySelectorAll("img"),
    ).toHaveLength(1);
  });
});

describe("the dialog's semantics (C-12, §5)", () => {
  it("is a modal dialog named by the preset's name, with a decorative handle", () => {
    mount({ count: 3, startIndex: 1 });
    const dialog = byTestId("preset-carousel-dialog");
    const titleId = dialog.getAttribute("aria-labelledby");

    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(titleId).not.toBeNull();
    expect(
      container.querySelector(`[id="${titleId ?? ""}"]`)?.textContent,
    ).toBe("Kitchen 2");
    expect(
      dialog.querySelector('span[aria-hidden="true"]:empty'),
    ).not.toBeNull();
  });

  it("names the close button for what it closes, not by its glyph", () => {
    mount({ count: 3, startIndex: 1 });

    expect(byTestId("preset-carousel-close").getAttribute("aria-label")).toBe(
      roMessages.presetChooser.close,
    );
  });

  it("keeps the scrim out of the accessibility tree", () => {
    mount({ count: 3, startIndex: 1 });

    expect(byTestId("preset-carousel-scrim").getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});

// Helpers

type Input =
  | "previous"
  | "next"
  | "arrowLeft"
  | "arrowRight"
  | "swipeLeft"
  | "swipeRight"
  | "swipeShort"
  | "swipeVertical"
  | "swipeCancelled"
  | "mouseSwipeLeft";

const inputArbitrary = fc.constantFrom<Input>(
  "previous",
  "next",
  "arrowLeft",
  "arrowRight",
  "swipeLeft",
  "swipeRight",
  "swipeShort",
  "swipeVertical",
  "swipeCancelled",
  "mouseSwipeLeft",
);

const STEP_OF_INPUT: Readonly<Record<Input, -1 | 0 | 1>> = {
  previous: -1,
  next: 1,
  arrowLeft: -1,
  arrowRight: 1,
  swipeLeft: 1,
  swipeRight: -1,
  swipeShort: 0,
  swipeVertical: 0,
  swipeCancelled: 0,
  mouseSwipeLeft: 0,
};

function perform(input: Input): void {
  switch (input) {
    case "previous":
      pressIfDrawn("preset-carousel-previous");
      return;
    case "next":
      pressIfDrawn("preset-carousel-next");
      return;
    case "arrowLeft":
      pressKey("ArrowLeft");
      return;
    case "arrowRight":
      pressKey("ArrowRight");
      return;
    case "swipeLeft":
      drag(-LONG_DRAG_PX, 0);
      return;
    case "swipeRight":
      drag(LONG_DRAG_PX, 0);
      return;
    case "swipeShort":
      drag(-BELOW_THRESHOLD_PX, 0);
      return;
    case "swipeVertical":
      drag(-LONG_DRAG_PX, LONG_DRAG_PX * 3);
      return;
    case "swipeCancelled":
      firePointer("pointerdown", { x: 200, y: 300 });
      firePointer("pointercancel", { x: 20, y: 300 });
      return;
    case "mouseSwipeLeft":
      drag(-LONG_DRAG_PX, 0, {
        pointerType: "mouse",
        isPrimary: true,
        pointerId: 7,
      });
      return;
  }
}

/** A single preset draws neither Previous nor Next (C-2), so a customer cannot press them; nothing happens. */
function pressIfDrawn(testId: string): void {
  if (maybeByTestId(testId) !== null) press(testId);
}

/** The controls Tab can land on inside the dialog, in document order: the same set the trap wraps over. */
function stopsOfTheDialog(): HTMLElement[] {
  return [
    ...byTestId("preset-carousel-dialog").querySelectorAll<HTMLElement>(
      "button:not([disabled])",
    ),
  ];
}
