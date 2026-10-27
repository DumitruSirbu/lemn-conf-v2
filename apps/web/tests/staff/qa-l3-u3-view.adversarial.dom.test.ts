// @vitest-environment happy-dom
//
// The first column of the staff kitchen page, tried to see whether it can change anything (wave L3-U3). It draws a client's
// kitchen for a member of staff, so the promises are all negative: no gesture, key or press on it writes the document or the
// store, it never reaches the network or the browser's storage or a console, the camera chips move the camera and nothing
// else, a browser with no WebGL says so, it leaves no canvas behind, and a kitchen of any odd but valid shape draws.
import {
  KITCHEN_L_DESIGN,
  NARROWED_ROOM_OVERFLOWING_DESIGN,
  OVERFLOWING_KITCHEN_L_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveContent, resolveStaffKitchenCopy } from "@/i18n/content";
import { useCameraPreset } from "@/scene/camera-preset-store";
import {
  StaffKitchenSummary,
  StaffKitchenView,
  describeStaffSummaryRows,
} from "@/staff/staff-kitchen-view";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const scene = vi.hoisted(() => ({
  canvasesLive: 0,
  canvasesEverMounted: 0,
  editorMounts: 0,
  support: "supported" as "probing" | "supported" | "unsupported",
}));

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element, useEffect } = await import("react");
  return {
    default: () => {
      scene.editorMounts += 1;
      return null;
    },
    ViewOnlyKitchenCanvas: () => {
      useEffect(() => {
        scene.canvasesLive += 1;
        scene.canvasesEverMounted += 1;
        return () => {
          scene.canvasesLive -= 1;
        };
      }, []);
      return element("canvas", { "data-testid": "stub-canvas" });
    },
  };
});

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => scene.support,
  detectWebGLSupport: () => true,
}));

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const NO_VALUE = "—";
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
const GESTURES = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "contextmenu",
  "touchstart",
  "touchend",
  "wheel",
  "dragstart",
  "drop",
  "paste",
  "cut",
  "focusin",
] as const;
const KEYS = [
  "Delete",
  "Backspace",
  "Enter",
  " ",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Escape",
  "z",
  "y",
  "d",
  "r",
] as const;

let screen: MountedScreen | undefined;
let fetchCalls: unknown[][];

beforeEach(() => {
  scene.canvasesLive = 0;
  scene.canvasesEverMounted = 0;
  scene.editorMounts = 0;
  scene.support = "supported";
  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((...call: unknown[]) => {
      fetchCalls.push(call);
      return Promise.reject(new TypeError("no network in this test"));
    }),
  );
  useCameraPreset.setState({ presetId: "overview" });
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function mountView(
  design: Design,
  locale: TestLocale = "ro",
): Promise<HTMLElement> {
  screen = mountInCatalogue(
    createElement(StaffKitchenView, { design, isCurrentVariantOfSent: false }),
    locale,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return screen.container;
}

/** Everything the store holds that is not a function: the document, its identity, its revision, what is selected. */
function storeFacts(): string {
  const facts = Object.fromEntries(
    Object.entries(useConfiguratorStore.getState()).filter(
      ([, value]) => typeof value !== "function",
    ),
  );
  return JSON.stringify(facts);
}

describe("the picture cannot change the kitchen", () => {
  it("leaves the store as it was found after every gesture and every key is sent to every element of it", async () => {
    const container = await mountView(KITCHEN_L_DESIGN);
    const before = storeFacts();

    for (const element of [container, ...allIn(container, "*")]) {
      for (const gesture of GESTURES) {
        act(() => {
          element.dispatchEvent(
            new MouseEvent(gesture, {
              bubbles: true,
              cancelable: true,
              clientX: 40,
              clientY: 40,
            }),
          );
        });
      }
      for (const key of KEYS) {
        for (const type of ["keydown", "keyup"]) {
          act(() => {
            element.dispatchEvent(
              new KeyboardEvent(type, {
                key,
                ctrlKey: key === "z" || key === "y" || key === "d",
                metaKey: key === "z",
                bubbles: true,
                cancelable: true,
              }),
            );
          });
        }
      }
    }

    expect(storeFacts()).toBe(before);
    expect(useConfiguratorStore.getState().design).toBe(KITCHEN_L_DESIGN);
    expect(useConfiguratorStore.getState().canWrite).toBe(false);
    expect(fetchCalls).toEqual([]);
  });

  it("moves only the camera when a camera chip is pressed, and the store of the kitchen is untouched", async () => {
    const container = await mountView(KITCHEN_L_DESIGN);
    const before = storeFacts();
    const chips = allIn<HTMLButtonElement>(container, "button");

    for (const chip of chips) click(chip);

    expect(chips.length).toBeGreaterThan(1);
    expect(useCameraPreset.getState().presetId).not.toBe("overview");
    expect(storeFacts()).toBe(before);
    expect(fetchCalls).toEqual([]);
  });

  it("offers no control but the camera's", async () => {
    const container = await mountView(KITCHEN_L_DESIGN);

    expect(
      allIn(container, "input, select, textarea, a, form, [contenteditable]"),
    ).toHaveLength(0);
    for (const button of allIn(container, "button")) {
      expect(button.getAttribute("type")).toBe("button");
      expect(button.closest('[role="group"]')).not.toBeNull();
    }
    expect(scene.editorMounts).toBe(0);
  });

  it("writes nothing to the browser's storage and says nothing to a console while it is drawn, pressed and left", async () => {
    const calls = CONSOLE_METHODS.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const stored = vi.spyOn(Storage.prototype, "setItem");

    const container = await mountView(KITCHEN_L_DESIGN);
    for (const chip of allIn<HTMLButtonElement>(container, "button"))
      click(chip);
    screen?.unmount();
    screen = undefined;

    expect(stored).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });
});

describe("the canvas", () => {
  it("is gone from the page, and its effects cleaned, when the view is left", async () => {
    await mountView(KITCHEN_L_DESIGN);
    expect(scene.canvasesLive).toBe(1);

    screen?.unmount();
    screen = undefined;

    expect(scene.canvasesLive).toBe(0);
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("is one canvas at a time over a series of kitchens drawn and left", async () => {
    for (let round = 0; round < 5; round += 1) {
      await mountView(KITCHEN_L_DESIGN);
      expect(scene.canvasesLive).toBe(1);
      screen?.unmount();
      screen = undefined;
    }

    expect(scene.canvasesLive).toBe(0);
    expect(scene.canvasesEverMounted).toBe(5);
  });

  it.each(LOCALES)(
    "says the browser cannot draw it, in %s, and offers no camera for a picture that is not there",
    async (locale) => {
      scene.support = "unsupported";

      const container = await mountView(KITCHEN_L_DESIGN, locale);

      expect(container.textContent).toContain(
        CATALOGUES[locale].staffKitchen.viewNoWebgl,
      );
      expect(allIn(container, "button, canvas")).toHaveLength(0);
      expect(scene.canvasesEverMounted).toBe(0);
    },
  );
});

describe("a kitchen of any odd but valid shape", () => {
  const EMPTY_ROOM: Design = { ...KITCHEN_L_DESIGN, placements: [] };
  const CROWDED: Design = {
    ...KITCHEN_L_DESIGN,
    placements: Array.from({ length: 400 }, (_, index) => {
      const template =
        KITCHEN_L_DESIGN.placements[index % KITCHEN_L_DESIGN.placements.length];
      if (template === undefined) throw new Error("no placement to copy");
      return { ...template, id: `crowd-${String(index)}` };
    }),
  };
  const NO_EMPTY_COLUMNS: Design = {
    ...KITCHEN_L_DESIGN,
    emptyColumns: [],
  };

  it.each([
    ["the seeded kitchen", KITCHEN_L_DESIGN],
    ["a kitchen with no body in it", EMPTY_ROOM],
    ["four hundred bodies", CROWDED],
    ["a body past the end of its wall", OVERFLOWING_KITCHEN_L_DESIGN],
    ["a room narrower than its run", NARROWED_ROOM_OVERFLOWING_DESIGN],
    ["no empty columns", NO_EMPTY_COLUMNS],
  ])(
    "draws %s, its summary and its chips, without a message from React",
    async (_, design) => {
      const errors = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const warnings = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      const container = await mountView(design);

      expect(scene.canvasesLive).toBe(1);
      expect(allIn(container, "button").length).toBeGreaterThan(0);
      expect(useConfiguratorStore.getState().design).toBe(design);
      expect(errors).not.toHaveBeenCalled();
      expect(warnings).not.toHaveBeenCalled();
    },
  );

  it.each(["ro", "ru"] as const)(
    "summarises every one of them in %s with all seven rows and no value left empty",
    (locale) => {
      const translate = createTranslator({
        locale,
        messages: CATALOGUES[locale] as typeof roMessages,
      });
      const designs = [
        KITCHEN_L_DESIGN,
        EMPTY_ROOM,
        CROWDED,
        OVERFLOWING_KITCHEN_L_DESIGN,
        NARROWED_ROOM_OVERFLOWING_DESIGN,
        NO_EMPTY_COLUMNS,
      ];

      for (const design of designs) {
        const rows = describeStaffSummaryRows({
          design,
          priceBook: SAMPLE_PRICE_ROOT,
          copy: resolveStaffKitchenCopy(translate),
          content: resolveContent(translate),
          noValue: NO_VALUE,
        });

        expect(rows.map(({ key }) => key)).toEqual([
          "shape",
          "walls",
          "material",
          "hardware",
          "finish",
          "bodies",
          "price",
        ]);
        for (const row of rows) expect(row.value.trim()).not.toBe("");
        expect(rows.find(({ key }) => key === "bodies")?.value).toBe(
          String(design.placements.length),
        );
      }
    },
  );

  it("warns beside the price, and only there, when the starting price is a floor the kitchen overflows", () => {
    const translate = createTranslator({
      locale: "ro",
      messages: roMessages,
    });
    const rowsOf = (design: Design) =>
      describeStaffSummaryRows({
        design,
        priceBook: SAMPLE_PRICE_ROOT,
        copy: resolveStaffKitchenCopy(translate),
        content: resolveContent(translate),
        noValue: NO_VALUE,
      });

    const overflowing = rowsOf(OVERFLOWING_KITCHEN_L_DESIGN);
    const sound = rowsOf(KITCHEN_L_DESIGN);

    expect(overflowing.find(({ key }) => key === "price")?.sub).toBeTruthy();
    expect(sound.find(({ key }) => key === "price")?.sub).toBeUndefined();
    expect(overflowing.filter(({ sub }) => sub !== undefined)).toHaveLength(1);
  });

  it("gives a kitchen that cannot be priced a dash for the price and a count of its bodies", () => {
    const translate = createTranslator({ locale: "ro", messages: roMessages });

    const rows = describeStaffSummaryRows({
      design: EMPTY_ROOM,
      priceBook: SAMPLE_PRICE_ROOT,
      copy: resolveStaffKitchenCopy(translate),
      content: resolveContent(translate),
      noValue: NO_VALUE,
    });

    expect(rows.find(({ key }) => key === "price")?.value).toBe(NO_VALUE);
    expect(rows.find(({ key }) => key === "bodies")?.value).toBe("0");
  });

  it("renders the summary card of an overflowing kitchen with its warning inside the price row", () => {
    screen = mountInCatalogue(
      createElement(StaffKitchenSummary, {
        design: OVERFLOWING_KITCHEN_L_DESIGN,
        title: roMessages.staffKitchen.summaryTitleSent,
        noValue: NO_VALUE,
      }),
    );

    const price = requireIn(screen.container, '[data-fact="price"] dd');

    expect(price.children.length).toBeGreaterThan(0);
    expect(price.textContent.length).toBeGreaterThan(0);
  });
});
