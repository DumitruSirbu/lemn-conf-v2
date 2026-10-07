// @vitest-environment happy-dom
//
// Frames 3A and 3B as a screen (M8 8D criteria 7, 9, 11–14, 19). The page is rendered to markup from a design held
// by the snapshot provider, the way a request renders it, and read back with a DOM. The scene, the locale menu and
// the editor's exit screen are stubs: this is about what the screen draws and where, not about WebGL.
//
// What this cannot see: layout. That the bottom region is pinned at every scroll position, that it hides no row,
// that nothing is clipped at 390 px and that a touch lands are the visual pass's; here the stylesheet's declarations
// are pinned and the document's order is checked.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  findOverflowingPlacementIds,
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  type Design,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const webgl = vi.hoisted(() => ({
  state: "supported" as "probing" | "supported" | "unsupported",
}));

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => webgl.state,
}));
vi.mock("@/review/review-scene", () => ({
  ReviewScene: () => createElement("div", { "data-testid": "scene-stub" }),
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div", { "data-testid": "locale-menu" }),
}));
vi.mock("@/components/webgl-unavailable", () => ({
  WebGLUnavailable: () =>
    createElement("main", { "data-testid": "webgl-unavailable" }),
}));

import { ReviewScreen } from "@/app/d/[id]/review/review-screen";
import { describeReview, REVIEW_READING_ORDER } from "@/review/review-model";
import { ConfiguratorSnapshotProvider } from "@/store/configurator-snapshot";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  emptied,
  pastTheWall,
  withAnUnofferedTier,
} from "../support/review-edits";
import { priceAndProject } from "../support/generated-kitchens";
import { ro } from "../support/romanian-content";
import { ARMS, composedKitchensOf } from "../support/swept-kitchens";

const DESIGN_ID = "design-under-review";
const MESSAGES = { ro: roMessages, ru: ruMessages } as const;
const STYLESHEET = readFileSync(
  join(import.meta.dirname, "../../src/app/d/[id]/review/review.module.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

function render(design: Design, locale: keyof typeof MESSAGES = "ro") {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: MESSAGES[locale] as typeof roMessages,
      timeZone: "Europe/Chisinau",
      children: createElement(ConfiguratorSnapshotProvider, {
        loaded: {
          design,
          designId: DESIGN_ID,
          revision: "1",
          canWrite: false,
        },
        children: createElement(ReviewScreen, { designId: DESIGN_ID }),
      }),
    }),
  );
  return container;
}

function sectionsInOrder(page: HTMLElement): string[] {
  return [...page.querySelectorAll("[data-section]")].map(
    (element) => element.getAttribute("data-section") ?? "",
  );
}

function bottomOf(page: HTMLElement): HTMLElement {
  const bottom = page.querySelector<HTMLElement>(
    '[data-testid="review-bottom"]',
  );
  if (bottom === null) throw new Error("the review draws no bottom region");
  return bottom;
}

function ctaOf(page: HTMLElement): HTMLElement {
  const cta = page.querySelector<HTMLElement>('[data-testid="review-cta"]');
  if (cta === null) throw new Error("the review draws no call to action");
  return cta;
}

function hrefsOf(elements: ArrayLike<Element>): (string | null)[] {
  return [...Array.from(elements)].map((element) =>
    element.getAttribute("href"),
  );
}

function overflowingKitchen(): { design: Design; ids: readonly string[] } {
  const first = KITCHEN_L_DESIGN.placements[0];
  if (first === undefined) throw new Error("the seeded kitchen has bodies");
  const design = pastTheWall(KITCHEN_L_DESIGN, new Set([first.id]));
  return { design, ids: findOverflowingPlacementIds(design) };
}

beforeEach(() => {
  webgl.state = "supported";
});

describe("the reading order", () => {
  it("places the flagged total's sentence and the refusal's after the disclaimer and before the figure", () => {
    const at = (section: (typeof REVIEW_READING_ORDER)[number]) =>
      REVIEW_READING_ORDER.indexOf(section);

    expect(at("disclaimer")).toBeLessThan(at("overflowWarning"));
    expect(at("overflowWarning")).toBeLessThan(at("refusal"));
    expect(at("refusal")).toBeLessThan(at("figure"));
    expect(at("figure")).toBeLessThan(at("callToAction"));
  });
});

describe("an available review of a kitchen that fits", () => {
  const page = render(KITCHEN_L_DESIGN);

  it("is one page of one <main>, headed by the approved title", () => {
    expect(page.querySelectorAll("main")).toHaveLength(1);
    expect(page.querySelector("h1")?.textContent).toBe(roMessages.review.title);
  });

  it("lays its sections out in the model's order, the not-included block before the call to action", () => {
    const expected = REVIEW_READING_ORDER.filter(
      (section) => section !== "overflowWarning" && section !== "refusal",
    );

    expect(sectionsInOrder(page)).toEqual(expected);
    expect(sectionsInOrder(page).indexOf("notIncluded")).toBeLessThan(
      sectionsInOrder(page).indexOf("callToAction"),
    );
  });

  it("lists one row per body and draws the model's own sentences", () => {
    expect(
      page.querySelectorAll(
        '[data-testid="review-group"] [data-testid="review-row"]',
      ),
    ).toHaveLength(KITCHEN_L_DESIGN.placements.length);
    expect(page.textContent).toContain(ro.priceBreakdown.disclaimer);
    expect(page.textContent).toContain(ro.review.roundedUpNote);
    expect(page.textContent).toContain(ro.priceBreakdown.note);
  });

  it("offers a live call to action to the placeholder contact page, with no reason beside it", () => {
    const cta = ctaOf(page);

    expect(cta.tagName).toBe("A");
    expect(cta.getAttribute("href")).toBe("/ro/configurator/contact");
    expect(cta.getAttribute("aria-disabled")).toBeNull();
    expect(page.querySelector('[data-section="refusal"]')).toBeNull();
    expect(
      page.querySelector('[data-testid="review-named-bodies"]'),
    ).toBeNull();
  });

  it("opens the editor from each group with its first body selected, from the settings row, and from the 3D link", () => {
    const catalog = buildKitchenLBodyCatalog(
      cabinetDepthMmOf(KITCHEN_L_DESIGN),
    );
    const firstBodies = projectDesignForDisplay(KITCHEN_L_DESIGN, catalog).map(
      (group) => group.entries[0]?.placementId,
    );

    expect(
      hrefsOf(page.querySelectorAll('[data-testid="review-group-edit"]')),
    ).toEqual(
      firstBodies.map((id) => `/ro/d/${DESIGN_ID}?select=${String(id)}`),
    );
    const links = hrefsOf(page.querySelectorAll("a"));
    expect(links).toContain(`/ro/d/${DESIGN_ID}?settings=open`);
    expect(links).toContain(`/ro/d/${DESIGN_ID}`);
  });

  it("ends in the bottom region, which follows the content in the flow and holds the figure and the call to action", () => {
    const main = page.querySelector("main");

    expect(main?.lastElementChild).toBe(bottomOf(page));
    expect(
      [...bottomOf(page).querySelectorAll("[data-section]")].map((element) =>
        element.getAttribute("data-section"),
      ),
    ).toEqual(["figure", "callToAction"]);
  });
});

describe("a kitchen with a body past its wall", () => {
  const { design, ids } = overflowingKitchen();
  const page = render(design);
  const submit = describeReview({
    content: ro,
    ...priceAndProject(design),
  });

  it("is named by the model, and the test starts from a body that really overflows", () => {
    expect(ids.length).toBeGreaterThan(0);
    expect(submit.submit).toMatchObject({
      kind: "refused",
      code: "BODIES_PAST_WALL",
    });
  });

  it("lays out every section in the model's order, both sentences included", () => {
    expect(sectionsInOrder(page)).toEqual([...REVIEW_READING_ORDER]);
  });

  it("pins, in this order, the flagged total's sentence, the refusal's, the figure and the call to action", () => {
    const bottom = bottomOf(page);

    expect(
      [...bottom.querySelectorAll("[data-section]")].map((element) =>
        element.getAttribute("data-section"),
      ),
    ).toEqual(["overflowWarning", "refusal", "figure", "callToAction"]);
    expect(
      bottom.querySelector('[data-section="overflowWarning"]')?.textContent,
    ).toBe(ro.price.overflowingTotalWarning);
    expect(bottom.querySelector('[data-section="refusal"]')?.textContent).toBe(
      ro.review.refusalReasons.BODIES_PAST_WALL,
    );
  });

  it("turns the call to action off, announced with the sentence that is on screen beside it", () => {
    const cta = ctaOf(page);
    const sentence = bottomOf(page).querySelector('[data-section="refusal"]');

    expect(cta.tagName).toBe("BUTTON");
    expect(cta.getAttribute("aria-disabled")).toBe("true");
    expect(cta.getAttribute("href")).toBeNull();
    expect(sentence?.id).not.toBe("");
    expect(cta.getAttribute("aria-describedby")).toBe(sentence?.id);
    expect(bottomOf(page).contains(cta)).toBe(true);
  });

  it("lists each named body as a link to the editor with it selected, directly above the bottom region", () => {
    const named = page.querySelector('[data-testid="review-named-bodies"]');
    const links = [...(named?.querySelectorAll("a") ?? [])];
    const expected =
      submit.kind === "available" && submit.submit.kind === "refused"
        ? submit.submit.bodies
        : [];

    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      expected.map((body) => `/ro/d/${DESIGN_ID}?select=${body.placementId}`),
    );
    expect(links.map((link) => link.textContent)).toEqual(
      expected.map((body) => body.label),
    );
    expect(named?.parentElement?.lastElementChild).toBe(named);
    expect(named?.parentElement?.nextElementSibling).toBe(bottomOf(page));
  });

  it("marks the row of each named body, and no other", () => {
    const marked = [
      ...page.querySelectorAll(
        '[data-testid="review-row"][data-marked="true"]',
      ),
    ];

    expect(marked).toHaveLength(ids.length);
    expect(
      marked.every(
        (row) =>
          row.getAttribute("aria-describedby") ===
          bottomOf(page).querySelector('[data-section="refusal"]')?.id,
      ),
    ).toBe(true);
  });
});

describe("a review that cannot be shown", () => {
  const unavailableKitchens: { name: string; design: Design; code: string }[] =
    [
      {
        name: "a price that cannot be computed",
        design: withAnUnofferedTier(KITCHEN_L_DESIGN),
        code: "PRICING_FAILED",
      },
      {
        name: "a kitchen holding no body",
        design: emptied(KITCHEN_L_DESIGN),
        code: "NO_CABINET",
      },
    ];

  it.each(unavailableKitchens)(
    "$name: the top bar, the heading, the sentence, the call to action off and the way back, and nothing else",
    ({ design, code }) => {
      const page = render(design);

      expect(page.querySelector("header")).not.toBeNull();
      expect(page.querySelector("h1")?.textContent).toBe(
        roMessages.review.title,
      );
      expect(page.querySelector('[data-section="refusal"]')?.textContent).toBe(
        ro.review.refusalReasons[code as keyof typeof ro.review.refusalReasons],
      );
      expect(ctaOf(page).getAttribute("aria-disabled")).toBe("true");
      expect(
        page
          .querySelector('[data-testid="review-unavailable-back"]')
          ?.getAttribute("href"),
      ).toBe(`/ro/d/${DESIGN_ID}`);
      expect(sectionsInOrder(page)).toEqual(["refusal", "callToAction"]);
      expect(page.textContent).not.toContain("MDL");
      expect(page.querySelector('[data-testid="review-row"]')).toBeNull();
      expect(page.querySelector("ul")).toBeNull();
      expect(page.querySelector('[data-testid="scene-stub"]')).toBeNull();
    },
  );

  it("names the bodies past the wall in a list that is the only place they appear", () => {
    const { design, ids } = overflowingKitchen();
    const page = render(withAnUnofferedTier(design));

    expect(page.querySelector('[data-section="refusal"]')?.textContent).toBe(
      ro.review.refusalReasons.BODIES_PAST_WALL,
    );
    expect(
      page.querySelectorAll('[data-testid="review-named-bodies"] a'),
    ).toHaveLength(ids.length);
    expect(page.querySelector('[data-testid="review-row"]')).toBeNull();
  });
});

describe("the call to action is never off without its sentence in the same region", () => {
  const edits: readonly ((design: Design) => Design)[] = [
    (design) => design,
    withAnUnofferedTier,
    emptied,
    (design) => {
      const first = design.placements[0];
      return first === undefined
        ? design
        : pastTheWall(design, new Set([first.id]));
    },
  ];

  const designs = ARMS.flatMap((arm) =>
    composedKitchensOf(arm)
      .slice(0, 3)
      .flatMap(({ design }) => edits.map((edit) => edit(design))),
  );

  it("holds for every swept kitchen under every edit, in both languages", () => {
    expect(designs.length).toBeGreaterThan(0);
    for (const design of designs)
      for (const locale of ["ro", "ru"] as const) {
        const page = render(design, locale);
        const isOff = ctaOf(page).getAttribute("aria-disabled") === "true";
        const sentence = bottomOf(page).querySelector(
          '[data-section="refusal"]',
        );

        expect(isOff).toBe(sentence !== null);
        if (isOff)
          expect(ctaOf(page).getAttribute("aria-describedby")).toBe(
            sentence?.id,
          );
      }
  });
});

describe("a device that cannot show the kitchen, or is still being asked", () => {
  it("shows the editor's own exit and nothing of the review, with no nested <main>", () => {
    webgl.state = "unsupported";

    const page = render(KITCHEN_L_DESIGN);

    expect(page.querySelectorAll("main")).toHaveLength(1);
    expect(
      page.querySelector('main[data-testid="webgl-unavailable"]'),
    ).not.toBeNull();
    expect(page.querySelector('[data-testid="review-row"]')).toBeNull();
    expect(page.querySelector('[data-testid="review-cta"]')).toBeNull();
    expect(page.textContent).not.toContain("MDL");
  });

  it("shows the editor's loading line and no figure while support is probed", () => {
    webgl.state = "probing";

    const page = render(KITCHEN_L_DESIGN);

    expect(page.querySelectorAll("main")).toHaveLength(1);
    expect(page.textContent).toBe(roMessages.configure.loading);
    expect(page.textContent).not.toContain("MDL");
    expect(page.querySelector('[data-testid="review-cta"]')).toBeNull();
  });
});

describe("in Russian, with both sentences showing", () => {
  it("draws the flagged total's sentence and the refusal's, both from the Russian catalogue", () => {
    const page = render(overflowingKitchen().design, "ru");
    const bottom = bottomOf(page);

    expect(
      bottom.querySelector('[data-section="overflowWarning"]')?.textContent,
    ).toBe(ruMessages.price.overflowingTotalWarning);
    expect(bottom.querySelector('[data-section="refusal"]')?.textContent).toBe(
      ruMessages.review.refusalReasons.BODIES_PAST_WALL,
    );
  });
});

describe("what the stylesheet declares (the layout itself is the visual pass's)", () => {
  function ruleBody(selector: string): string {
    const match = new RegExp(
      `(?:^|\\n)${selector.replace(".", "\\.")} \\{([^}]*)\\}`,
    ).exec(STYLESHEET);
    if (match === null) throw new Error(`no rule for ${selector}`);
    return match[1] ?? "";
  }

  it("pins the bottom region by sticking it in the flow, and fixes nothing", () => {
    expect(ruleBody(".bottom")).toContain("position: sticky");
    expect(ruleBody(".bottom")).toContain("bottom: 0");
    expect(STYLESHEET).not.toContain("position: fixed");
  });

  it.each([".preset", ".view3d", ".namedLink", ".action", ".back"])(
    "gives %s the project's touch target",
    (selector) => {
      expect(ruleBody(selector)).toMatch(/var\(--touch-target\)/);
    },
  );

  it("keeps the call to action at least 44 px tall and focusable when off", () => {
    expect(ruleBody(".cta")).toMatch(/min-height: 52px/);
    expect(STYLESHEET).toContain('.cta[aria-disabled="true"]');
  });
});
