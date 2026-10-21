// @vitest-environment happy-dom
//
// The structure the staff kitchen page offers to a screen reader and to a keyboard, in every state it can be in and in both
// languages (wave L3-U3): one `main` (the staff frame's), one `h1` and headings that descend by one level, every id unique and
// every reference to one resolved, every control named and none ahead of its turn in the tab order, nothing focusable under
// `aria-hidden`, and the Tab order of a ready kitchen being the way back and then the camera chips, in the order they are drawn.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { allIn, requireIn, type TestLocale } from "../support/render-with-intl";
import { wireDraftKitchen, wireKitchen } from "../support/staff-kitchen-wire";
import {
  RATE_LIMITED_ANSWER,
  UNAVAILABLE_ANSWER,
} from "../support/staff-kitchens-wire";

import {
  PAGE,
  setUpScreenHarness,
  type KitchenAnswer,
  type ScreenHarness,
} from "./qa-l3-u3-harness.adversarial";

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => null,
    ViewOnlyKitchenCanvas: () => element("canvas"),
  };
});

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
  detectWebGLSupport: () => true,
}));

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";
const UNREADABLE_DOCUMENT = { room: "?" };

const STATES: readonly (readonly [string, () => KitchenAnswer, boolean])[] = [
  ["loading", () => "hold", false],
  ["a sent kitchen", () => ({ body: wireKitchen() }), false],
  ["a draft", () => ({ body: wireDraftKitchen() }), false],
  [
    "a hidden kitchen",
    () => ({ body: wireKitchen({ kitchen: { isHidden: true } }) }),
    false,
  ],
  [
    "a kitchen with no account",
    () => ({ body: wireKitchen({ client: null }) }),
    false,
  ],
  [
    "a kitchen whose document cannot be read",
    () => ({
      body: wireKitchen({
        kitchen: { design: UNREADABLE_DOCUMENT, asSent: UNREADABLE_DOCUMENT },
      }),
    }),
    false,
  ],
  [
    "a kitchen that is not available",
    () => ({ status: 404, body: { error: "gone" } }),
    false,
  ],
  ["a service that is down", () => UNAVAILABLE_ANSWER, true],
  ["a limit with a wait", () => RATE_LIMITED_ANSWER(30), false],
  ["a connection that failed", () => "offline", true],
];

let harness: ScreenHarness;

beforeEach(() => {
  harness = setUpScreenHarness();
});

afterEach(() => {
  harness.tearDown();
});

function nameOf(element: HTMLElement, root: ParentNode): string {
  const direct = element.getAttribute("aria-label");
  if (direct !== null && direct.trim() !== "") return direct.trim();
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    return labelledBy
      .split(/\s+/)
      .map((id) => root.querySelector(`[id="${id}"]`)?.textContent.trim() ?? "")
      .join(" ")
      .trim();
  }
  return element.textContent.trim();
}

function headingLevels(root: ParentNode): number[] {
  return allIn(
    root as HTMLElement,
    "h1, h2, h3, h4, h5, h6, [role='heading']",
  ).map((heading) =>
    Number(heading.getAttribute("aria-level") ?? heading.tagName.slice(1)),
  );
}

describe.each(LOCALES)("the structure of the page in %s", (locale) => {
  describe.each(STATES)("for %s", (_, answer, isFailure) => {
    beforeEach(async () => {
      harness.answers(answer);
      await harness.mount({ locale });
    });

    it("has the staff frame's one main and no other", () => {
      expect(allIn(harness.container(), "main, [role='main']")).toHaveLength(1);
    });

    it("has one h1 and headings that never skip a level on the way down", () => {
      const levels = headingLevels(harness.container());

      expect(levels.filter((level) => level === 1)).toHaveLength(1);
      expect(levels[0]).toBe(1);
      for (let index = 1; index < levels.length; index += 1) {
        const previous = levels[index - 1] ?? 0;
        expect(levels[index] ?? 0, levels.join(",")).toBeLessThanOrEqual(
          previous + 1,
        );
      }
    });

    it("has every id once, and every reference to one resolved", () => {
      const container = harness.container();
      const ids = allIn(container, "[id]").map((element) => element.id);

      expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
      for (const attribute of [
        "aria-labelledby",
        "aria-describedby",
        "aria-controls",
      ]) {
        for (const element of allIn(container, `[${attribute}]`)) {
          for (const id of (element.getAttribute(attribute) ?? "").split(
            /\s+/,
          )) {
            expect(
              container.querySelector(`[id="${id}"]`),
              `${attribute}=${id}`,
            ).not.toBeNull();
          }
        }
      }
    });

    it("names every control and every region, and puts none ahead of the order the page is read in", () => {
      const container = harness.container();

      for (const control of allIn(container, FOCUSABLE)) {
        expect(
          nameOf(control, container),
          control.outerHTML.slice(0, 120),
        ).not.toBe("");
        expect(
          Number(control.getAttribute("tabindex") ?? "0"),
        ).toBeLessThanOrEqual(0);
      }
      for (const button of allIn(container, "button")) {
        expect(button.getAttribute("type")).toBe("button");
      }
      for (const region of allIn(
        container,
        "section[aria-label], section[aria-labelledby]",
      )) {
        expect(nameOf(region, container)).not.toBe("");
      }
    });

    it("holds nothing focusable under aria-hidden", () => {
      for (const hidden of allIn(harness.container(), "[aria-hidden='true']")) {
        expect(allIn(hidden, FOCUSABLE)).toHaveLength(0);
        expect(hidden.matches(FOCUSABLE)).toBe(false);
      }
    });

    it("raises one alert for a failure and none for anything else", () => {
      const page = harness.container();
      const alerts = allIn(page, "[role='alert']").length;
      expect(alerts).toBe(isFailure ? 1 : 0);
    });
  });

  it("announces a limit's wait as a status and not as an alert, once", async () => {
    harness.answers(() => RATE_LIMITED_ANSWER(30));
    await harness.mount({ locale });

    const page = requireIn(harness.container(), PAGE);
    expect(allIn(page, "[role='status']")).toHaveLength(1);
    expect(allIn(page, "[role='alert']")).toHaveLength(0);
  });

  describe("the Tab order of a ready kitchen", () => {
    beforeEach(async () => {
      harness.answers(() => ({ body: wireKitchen() }));
      await harness.mount({ locale });
    });

    it("is the way back, then the camera chips, in the order they are drawn, after the frame's own controls", () => {
      const container = harness.container();
      const page = requireIn(container, PAGE);
      const everything = allIn(container, FOCUSABLE);
      const inPage = allIn(page, FOCUSABLE);

      expect(inPage.map((element) => element.tagName)).toEqual([
        "A",
        "BUTTON",
        "BUTTON",
        "BUTTON",
      ]);
      expect(inPage[0]?.textContent).toBe(
        CATALOGUES[locale].staffShell.navKitchens,
      );
      const [firstControl] = inPage;
      if (firstControl === undefined) throw new Error("no control in the page");
      const firstInPage = everything.indexOf(firstControl);
      expect(firstInPage).toBeGreaterThan(0);
      expect(everything.slice(firstInPage)).toEqual(inPage);
    });

    it("has one camera pressed, never two and never none", () => {
      const chips = allIn(harness.container(), "[aria-pressed]");

      expect(
        chips.map((chip) => chip.getAttribute("aria-pressed")).sort(),
      ).toEqual(["false", "false", "true"]);
    });

    it("draws the cards under the picture as regions of the page, each headed by an h2", () => {
      const page = requireIn(harness.container(), PAGE);
      const cards = allIn(page, "section[data-testid]").filter(
        (section) =>
          section.getAttribute("data-testid") !== "staff-kitchen-page",
      );

      expect(cards.length).toBeGreaterThanOrEqual(4);
      for (const card of cards) {
        if (card.getAttribute("data-testid") === "staff-kitchen-view") continue;
        expect(
          allIn(card, "h2").length,
          card.getAttribute("data-testid") ?? "",
        ).toBe(1);
      }
    });
  });
});
