// @vitest-environment happy-dom
//
// The first column of the staff kitchen page: the kitchen to look at and what it is made of. The picture is the review's
// view-only canvas over a store hydrated read-only; it never mounts the editor's canvas, and it describes the design it
// is given and no other. The canvas itself is a stub (happy-dom has no WebGL); that the real view-only stage selects
// nothing is `tests/scene/kitchen-stage-view-only.test.ts`.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
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
  viewOnlyViews: [] as unknown[],
  editorMounts: 0,
  support: "supported" as "probing" | "supported" | "unsupported",
}));

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => {
      scene.editorMounts += 1;
      return null;
    },
    ViewOnlyKitchenCanvas: (props: { view: unknown }) => {
      scene.viewOnlyViews.push(props.view);
      return element("canvas", { "data-testid": "stub-canvas" });
    },
  };
});

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => scene.support,
  detectWebGLSupport: () => true,
}));

const L_CAMERA_CHIPS = 3;
const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const NO_VALUE = "—";

let screen: MountedScreen | undefined;

beforeEach(() => {
  scene.viewOnlyViews = [];
  scene.editorMounts = 0;
  scene.support = "supported";
  useCameraPreset.setState({ presetId: "overview" });
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
});

async function mountView(
  design: Design,
  isCurrentVariantOfSent = false,
  locale: TestLocale = "ro",
): Promise<HTMLElement> {
  screen = mountInCatalogue(
    createElement(StaffKitchenView, { design, isCurrentVariantOfSent }),
    locale,
  );
  // The canvas is a dynamic import: it lands a tick after the first draw.
  await act(async () => {
    await Promise.resolve();
  });
  return screen.container;
}

/** The page's own words, resolved from the shipped catalogue like the page resolves them. */
function wordsIn(locale: TestLocale) {
  return createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace: "staffKitchen",
  });
}

function rowsOf(design: Design, locale: TestLocale = "ro") {
  const translate = createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
  });
  return describeStaffSummaryRows({
    design,
    priceBook: SAMPLE_PRICE_ROOT,
    copy: resolveStaffKitchenCopy(translate),
    content: resolveContent(translate),
    noValue: NO_VALUE,
  });
}

function valueOf(
  rows: ReturnType<typeof rowsOf>,
  key: ReturnType<typeof rowsOf>[number]["key"],
): string | undefined {
  return rows.find((row) => row.key === key)?.value;
}

const SMALLER_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  placements: KITCHEN_L_DESIGN.placements.slice(0, 3),
};

describe("the picture", () => {
  it("mounts the view-only canvas and never the editor's", async () => {
    const container = await mountView(KITCHEN_L_DESIGN);

    expect(requireIn(container, '[data-testid="stub-canvas"]')).not.toBeNull();
    expect(scene.viewOnlyViews.length).toBeGreaterThan(0);
    expect(scene.editorMounts).toBe(0);
  });

  it("draws the design it is given from a store that cannot write, under an id no kitchen has", async () => {
    await mountView(KITCHEN_L_DESIGN);

    const store = useConfiguratorStore.getState();
    expect(store.design).toBe(KITCHEN_L_DESIGN);
    expect(store.canWrite).toBe(false);
    expect(store.designId).toBe("staff-view");
    expect(store.designId).not.toMatch(/^[A-Za-z0-9_-]{21}$/);
  });

  it("puts the next kitchen into the store when it is mounted for another design", async () => {
    await mountView(KITCHEN_L_DESIGN);
    screen?.unmount();

    await mountView(SMALLER_DESIGN);

    expect(useConfiguratorStore.getState().design).toBe(SMALLER_DESIGN);
  });

  it("says it is for reading, and that it is the current variant only when told so", async () => {
    const plain = await mountView(KITCHEN_L_DESIGN);
    expect(plain.textContent).toContain(roMessages.staffKitchen.viewOnly);
    expect(
      plain.querySelector('[data-testid="staff-kitchen-current-variant"]'),
    ).toBeNull();
    screen?.unmount();

    const current = await mountView(KITCHEN_L_DESIGN, true);

    expect(
      requireIn(current, '[data-testid="staff-kitchen-current-variant"]')
        .textContent,
    ).toBe(roMessages.staffKitchen.viewCurrent);
  });

  it("offers the room's camera views as chips, the pressed one being the one the scene frames", async () => {
    const container = await mountView(KITCHEN_L_DESIGN);
    const chips = allIn<HTMLButtonElement>(container, "button");

    expect(chips).toHaveLength(L_CAMERA_CHIPS);
    expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
    ]);

    click(chips[1] ?? container);

    expect(
      allIn<HTMLButtonElement>(container, "button").map((chip) =>
        chip.getAttribute("aria-pressed"),
      ),
    ).toEqual(["false", "true", "false"]);
  });

  it("says the browser cannot draw it, with no chips and no canvas, when there is no WebGL", async () => {
    scene.support = "unsupported";

    const container = await mountView(KITCHEN_L_DESIGN);

    expect(container.textContent).toContain(
      roMessages.staffKitchen.viewNoWebgl,
    );
    expect(allIn(container, "button")).toHaveLength(0);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("draws the loading line, not the canvas, while the browser is still being asked", async () => {
    scene.support = "probing";

    const container = await mountView(KITCHEN_L_DESIGN);

    expect(container.textContent).toContain(roMessages.configure.loading);
    expect(container.querySelector("canvas")).toBeNull();
  });
});

describe("the summary", () => {
  it("tells the shape, the walls, the material, the hardware, the finish, the bodies and the starting price", () => {
    const words = roMessages.staffKitchen;
    const rows = rowsOf(KITCHEN_L_DESIGN);

    expect(rows.map(({ key, label }) => [key, label])).toEqual([
      ["shape", words.summaryShape],
      ["walls", words.summaryWalls],
      ["material", words.summaryMaterial],
      ["hardware", words.summaryHardware],
      ["finish", words.summaryFinish],
      ["bodies", words.summaryBodies],
      ["price", words.summaryPrice],
    ]);
    expect(valueOf(rows, "shape")).toBe(roMessages.room.shapes.L.name);
    expect(valueOf(rows, "walls")).toBe(
      wordsIn("ro")("summaryWallsValue", { walls: "3560 × 2920" }),
    );
    expect(valueOf(rows, "material")).toBe(
      roMessages.priceBook.material.melamine.name,
    );
    expect(valueOf(rows, "hardware")).toBe(
      roMessages.priceBook.hardware.standard.name,
    );
    expect(valueOf(rows, "finish")).toBe(roMessages.finish.pal.alb);
    expect(valueOf(rows, "bodies")).toBe("26");
    expect(valueOf(rows, "price")).toBe(
      `${roMessages.price.startingPrefix} 86 000 MDL`,
    );
  });

  it("tells the same facts in Russian", () => {
    const rows = rowsOf(KITCHEN_L_DESIGN, "ru");

    expect(valueOf(rows, "shape")).toBe(ruMessages.room.shapes.L.name);
    expect(valueOf(rows, "walls")).toBe(
      wordsIn("ru")("summaryWallsValue", { walls: "3560 × 2920" }),
    );
    expect(valueOf(rows, "material")).toBe(
      ruMessages.priceBook.material.melamine.name,
    );
    expect(valueOf(rows, "finish")).toBe(ruMessages.finish.pal.alb);
    expect(valueOf(rows, "price")).toBe(
      `${ruMessages.price.startingPrefix} 86 000 MDL`,
    );
  });

  it("describes the design it is given and no other: fewer bodies cost less", () => {
    const whole = rowsOf(KITCHEN_L_DESIGN);
    const smaller = rowsOf(SMALLER_DESIGN);

    expect(valueOf(smaller, "bodies")).toBe("3");
    expect(valueOf(smaller, "price")).not.toBe(valueOf(whole, "price"));
    expect(valueOf(smaller, "walls")).toBe(valueOf(whole, "walls"));
  });

  it("gives a kitchen with no bodies no price rather than a zero", () => {
    const rows = rowsOf({ ...KITCHEN_L_DESIGN, placements: [] });

    expect(valueOf(rows, "bodies")).toBe("0");
    expect(valueOf(rows, "price")).toBe(NO_VALUE);
  });

  it("is a card headed with the title it is told, a list of the facts, and the note that a price is not an offer", () => {
    screen = mountInCatalogue(
      createElement(StaffKitchenSummary, {
        design: KITCHEN_L_DESIGN,
        title: roMessages.staffKitchen.summaryTitleSent,
        noValue: NO_VALUE,
      }),
    );
    const card = requireIn(
      screen.container,
      '[data-testid="staff-kitchen-summary"]',
    );

    expect(requireIn(card, "h2").textContent).toBe(
      roMessages.staffKitchen.summaryTitleSent,
    );
    expect(allIn(card, "dt").map((term) => term.textContent)).toEqual([
      roMessages.staffKitchen.summaryShape,
      roMessages.staffKitchen.summaryWalls,
      roMessages.staffKitchen.summaryMaterial,
      roMessages.staffKitchen.summaryHardware,
      roMessages.staffKitchen.summaryFinish,
      roMessages.staffKitchen.summaryBodies,
      roMessages.staffKitchen.summaryPrice,
    ]);
    expect(card.textContent).toContain(
      roMessages.staffKitchen.summaryPriceNote,
    );
  });
});
