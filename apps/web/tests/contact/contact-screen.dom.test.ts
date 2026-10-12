// @vitest-environment happy-dom
//
// The contact page of a design as a screen: what stands before the form is shown (the probe), the bar, the card, the
// refusal that replaces the form, and the call to action while an edit is unsaved. The scene probe, the locale menu and
// the editor's exit screen are stubs; nothing is answered.
//
// What this cannot see: layout (that the pinned region stays at the viewport's foot, that nothing is clipped at 390 px)
// and a tap's effect on a real router. The first is the visual pass's; the history entry a link adds is the e2e's.
import {
  KITCHEN_L_DESIGN,
  findOverflowingPlacementIds,
  type Design,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const webgl = vi.hoisted(() => ({
  state: "supported" as "probing" | "supported" | "unsupported",
}));

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => webgl.state,
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div", { "data-testid": "locale-menu" }),
}));
vi.mock("@/components/webgl-unavailable", () => ({
  WebGLUnavailable: () =>
    createElement("main", { "data-testid": "webgl-unavailable" }),
}));

import { describeReview } from "@/review/review-model";

import {
  editWithoutSaving,
  DESIGN_ID,
  landSave,
} from "./contact-submission-harness";
import {
  elementIn,
  fillWholeForm,
  MESSAGES,
  mountContactScreen,
  pressCallToAction,
  recordTraffic,
  type MountedScreen,
  type RecordedTraffic,
  type ScreenLocale,
} from "./contact-screen-harness";
import { priceAndProject } from "../support/generated-kitchens";
import {
  emptied,
  pastTheWall,
  withAnUnofferedTier,
} from "../support/review-edits";
import { ro } from "../support/romanian-content";

let screen: MountedScreen;
let traffic: RecordedTraffic;

function mount(
  design: Design = KITCHEN_L_DESIGN,
  locale: ScreenLocale = "ro",
): HTMLElement {
  screen = mountContactScreen({ design, locale });
  return screen.container;
}

function overflowingKitchen(): Design {
  const first = KITCHEN_L_DESIGN.placements[0];
  if (first === undefined) throw new Error("the seeded kitchen has bodies");
  const design = pastTheWall(KITCHEN_L_DESIGN, new Set([first.id]));
  expect(findOverflowingPlacementIds(design)).not.toEqual([]);
  return design;
}

beforeEach(() => {
  webgl.state = "supported";
  traffic = recordTraffic();
});

afterEach(() => {
  screen.unmount();
  vi.unstubAllGlobals();
});

describe("before the form is shown", () => {
  it("shows the editor's loading line, and no form and no figure, while the device is still being asked", () => {
    webgl.state = "probing";

    const container = mount();

    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).toBe(MESSAGES.ro.configure.loading);
  });

  it("shows the editor's exit and no form on a device that cannot show the kitchen", () => {
    webgl.state = "unsupported";

    const container = mount();

    expect(
      container.querySelector('[data-testid="webgl-unavailable"]'),
    ).not.toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("the top bar", () => {
  it.each(["ro", "ru"] as const)(
    "carries the title in %s and the way back to the review, which is a link and not a step back",
    (locale) => {
      const container = mount(KITCHEN_L_DESIGN, locale);
      const back = elementIn(
        container,
        '[data-testid="contact-back"]',
        HTMLAnchorElement,
      );

      expect(
        elementIn(container, '[data-testid="contact-top-bar-title"]')
          .textContent,
      ).toBe(MESSAGES[locale].contact.topBarTitle);
      expect(back.getAttribute("href")).toBe(
        `/${locale}/d/${DESIGN_ID}/review`,
      );
      expect(back.getAttribute("aria-label")).toBe(
        MESSAGES[locale].configure.backAction,
      );
      expect(
        container.querySelector('[data-testid="locale-menu"]'),
      ).not.toBeNull();
    },
  );
});

describe("the heading and the card", () => {
  it.each(["ro", "ru"] as const)(
    "puts the heading and the subheading in %s before the fields",
    (locale) => {
      const container = mount(KITCHEN_L_DESIGN, locale);

      expect(container.querySelector("h1")?.textContent).toBe(
        MESSAGES[locale].contact.heading,
      );
      expect(container.textContent).toContain(
        MESSAGES[locale].contact.subheading,
      );
    },
  );

  it("shows the review's own room line and figure for the design the store holds", () => {
    const { pricing, groups } = priceAndProject(KITCHEN_L_DESIGN);
    const review = describeReview({
      content: ro,
      design: KITCHEN_L_DESIGN,
      pricing,
      groups,
    });
    if (review.kind !== "available")
      throw new Error("the seeded kitchen is priced");

    const card = elementIn(mount(), '[data-testid="contact-design-card"]');

    expect(card.querySelector('[data-section="roomLine"]')?.textContent).toBe(
      review.roomLine,
    );
    expect(card.querySelector('[data-section="figure"]')?.textContent).toBe(
      `${review.figure.label} ${review.figure.amountText}`,
    );
  });

  it("draws the card before the first field", () => {
    const container = mount();
    const card = elementIn(container, '[data-testid="contact-design-card"]');
    const firstField = elementIn(container, 'input[name="name"]');

    expect(
      card.compareDocumentPosition(firstField) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("a design the review refuses", () => {
  const refusals: readonly {
    readonly name: string;
    readonly design: () => Design;
    readonly code: keyof typeof MESSAGES.ro.review.refusalReasons;
  }[] = [
    {
      name: "a price that cannot be computed",
      design: () => withAnUnofferedTier(KITCHEN_L_DESIGN),
      code: "PRICING_FAILED",
    },
    {
      name: "a kitchen holding no body",
      design: () => emptied(KITCHEN_L_DESIGN),
      code: "NO_CABINET",
    },
    {
      name: "a body past its wall",
      design: overflowingKitchen,
      code: "BODIES_PAST_WALL",
    },
  ];

  it.each(refusals)(
    "$name: shows the review's sentence and the link to the review, and no form",
    ({ design, code }) => {
      const container = mount(design());

      expect(
        container.querySelector('[data-section="refusal"]')?.textContent,
      ).toBe(MESSAGES.ro.review.refusalReasons[code]);
      expect(
        elementIn(
          container,
          '[data-testid="contact-review-link"]',
        ).getAttribute("href"),
      ).toBe(`/ro/d/${DESIGN_ID}/review`);
      expect(container.textContent).toContain(MESSAGES.ro.contact.reviewLink);
      expect(container.querySelector("form")).toBeNull();
      expect(container.querySelector("input")).toBeNull();
      expect(container.querySelector('[data-testid="contact-cta"]')).toBeNull();
    },
  );

  it("tells the refusal in Russian in the Russian page", () => {
    const container = mount(emptied(KITCHEN_L_DESIGN), "ru");

    expect(
      container.querySelector('[data-section="refusal"]')?.textContent,
    ).toBe(MESSAGES.ru.review.refusalReasons.NO_CABINET);
  });
});

describe("the one form", () => {
  it("is drawn once: one form, one call to action, one consent", () => {
    const container = mount();

    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-testid="contact-cta"]'),
    ).toHaveLength(1);
    expect(container.querySelectorAll('input[name="consent"]')).toHaveLength(1);
  });
});

describe("the pinned region", () => {
  it("keeps whatever takes focus clear of itself while the page is shown, and gives the page back when it goes", () => {
    const viewport = document.documentElement;
    mount();

    expect(viewport.style.scrollPaddingBottom).toContain("var(--safe-gap)");

    screen.unmount();
    expect(viewport.style.scrollPaddingBottom).toBe("");
    screen = mountContactScreen();
  });
});

describe("while an edit is unsaved", () => {
  function waitingScreen(): HTMLElement {
    const container = mount();
    fillWholeForm(container);
    editWithoutSaving("edited-in-the-editor");
    return container;
  }

  it("turns the call to action off and names the sentence that says why, beside it in the pinned region", () => {
    const container = waitingScreen();
    const cta = elementIn(container, '[data-testid="contact-cta"]');
    const sentence = elementIn(container, '[data-testid="contact-save-wait"]');

    expect(cta.getAttribute("aria-disabled")).toBe("true");
    expect(sentence.id).not.toBe("");
    expect(cta.getAttribute("aria-describedby")).toBe(sentence.id);
    expect(sentence.textContent).toBe(MESSAGES.ro.reviewScreen.saving);
    expect(
      elementIn(container, '[data-testid="contact-bottom"]').contains(sentence),
    ).toBe(true);
  });

  it("sends nothing for a press, and sends the next revision once the save has landed", () => {
    const container = waitingScreen();

    pressCallToAction(container);
    expect(traffic.contactBodies).toEqual([]);

    landSave("5");
    expect(
      elementIn(container, '[data-testid="contact-cta"]').getAttribute(
        "aria-disabled",
      ),
    ).toBeNull();
    pressCallToAction(container);

    expect(traffic.contactBodies).toHaveLength(1);
    expect(traffic.contactBodies[0]).toMatchObject({
      design: { id: DESIGN_ID, revision: "5" },
    });
  });

  it("leaves the call to action on, with no sentence, when nothing is owed", () => {
    const container = mount();

    expect(
      elementIn(container, '[data-testid="contact-cta"]').getAttribute(
        "aria-disabled",
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="contact-save-wait"]'),
    ).toBeNull();
  });
});
