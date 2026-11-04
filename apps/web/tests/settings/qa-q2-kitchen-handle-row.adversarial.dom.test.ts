// @vitest-environment happy-dom
//
// **Adversarial QA for wave Q2 (M10): the whole-kitchen handle row, mounted with the real store and the real price root.**
//
// What `kitchen-handle-row.dom.test.ts` leaves open, attacked here (coordinator rulings of 2026-11-02 stated first):
//
//   - the offer over all eight subsets of switched-off handles, with entries of other kinds beside them that must not
//     move the row;
//   - a stored handle that availability switched off opens with nothing marked, offers the rest, and a press that did
//     not touch the handle leaves it as stored (the replacement is Q5's);
//   - a pending choice that availability switches off before *Aplică* is never committed: the row does not offer it, so
//     the sheet must not write it either (the price would refuse the kitchen it was written into);
//   - the pill does not name the handle, before or after a press;
//   - a press that names no handle never stamps one, whatever else it changes;
//   - the radio group's semantics and labelling, in Romanian and Russian, and the focus it returns;
//   - `useCatalogueAvailability` with and without a provider.
import {
  HandleSchema,
  KITCHEN_L_DESIGN,
  type CatalogueAvailability,
  type Design,
  type Handle,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shown = vi.hoisted(() => ({ locale: "ro" as "ro" | "ru" }));

vi.mock("@/i18n/use-content", async () => {
  const { contentFor } = await import("../support/catalogues");
  const { default: roMessages } = await import("../../src/messages/ro.json");
  const { default: ruMessages } = await import("../../src/messages/ru.json");
  return {
    useContent: () =>
      shown.locale === "ro"
        ? contentFor("ro", roMessages)
        : contentFor("ru", ruMessages as typeof roMessages),
  };
});

import { PriceBookProvider } from "@/price/price-book-provider";
import { describeApplyRefusal } from "@/settings/global-settings-model";
import type { ActivePriceBook, PriceBookRoot } from "@/price/price-book-root";
import {
  usePricedDesign,
  useCatalogueAvailability,
} from "@/price/use-priced-design";
import { GlobalSettings } from "@/settings/global-settings";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { contentFor } from "../support/catalogues";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const EVERY_HANDLE: readonly Handle[] = HandleSchema.options;
const VISIBLE_SETTING_COUNT = 3;
const HANDLE_GROUP = '[data-testid="global-settings-handle-group"]';

let container: HTMLElement;
let root: Root;
let caseNumber = 0;

function ShownTotal() {
  const pricing = usePricedDesign();
  return createElement(
    "output",
    { "data-testid": "shown-total" },
    pricing.ok ? String(pricing.priced.totalMinor) : "no price",
  );
}

function mountUnder(priceRoot: PriceBookRoot): void {
  act(() => {
    root.render(
      createElement(PriceBookProvider, {
        root: priceRoot,
        children: [
          createElement(GlobalSettings, {
            key: "settings",
            visibleCount: VISIBLE_SETTING_COUNT,
          }),
          createElement(ShownTotal, { key: "total" }),
        ],
      }),
    );
  });
}

function rootWith(
  disabled: CatalogueAvailability["disabled"],
): ActivePriceBook {
  return {
    ...SAMPLE_PRICE_ROOT,
    availability: { revision: "1", disabled },
  };
}

function handlesOff(...handles: readonly Handle[]): ActivePriceBook {
  return rootWith(handles.map((handle) => ({ kind: "handle", handle })));
}

function hydrateWith(design: Design): void {
  caseNumber += 1;
  useConfiguratorStore.getState().hydrate({
    design,
    designId: `q2-adversarial-${String(caseNumber)}`,
    revision: "1",
    canWrite: true,
  });
}

function withHandle(handle: Handle): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, handle },
  };
}

beforeEach(() => {
  shown.locale = "ro";
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  hydrateWith(KITCHEN_L_DESIGN);
  container = document.createElement("main");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

function click(selector: string): void {
  const element = container.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`nothing matches ${selector}`);
  act(() => {
    element.click();
  });
}

function openSheet(): void {
  click('[data-testid="global-settings-trigger"]');
}

function apply(): void {
  click('[data-testid="global-settings-apply"]');
}

function handleRadios(): readonly HTMLInputElement[] {
  return [
    ...container.querySelectorAll<HTMLInputElement>(`${HANDLE_GROUP} input`),
  ];
}

function handleRadio(handle: Handle): HTMLInputElement {
  const radio = handleRadios().find((one) => one.value === handle);
  if (radio === undefined) throw new Error(`no ${handle} option on the sheet`);
  return radio;
}

function press(handle: Handle): void {
  const radio = handleRadio(handle);
  act(() => {
    radio.click();
  });
}

function offeredHandles(): readonly string[] {
  return handleRadios().map((radio) => radio.value);
}

function markedHandles(): readonly string[] {
  return handleRadios()
    .filter((radio) => radio.checked)
    .map((radio) => radio.value);
}

function storedHandle(): string | undefined {
  return useConfiguratorStore.getState().design.settings?.handle;
}

function shownTotal(): string | null {
  return (
    container.querySelector('[data-testid="shown-total"]')?.textContent ?? null
  );
}

function trigger(): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    '[data-testid="global-settings-trigger"]',
  );
  if (element === null) throw new Error("no trigger");
  return element;
}

/** A change the press can commit without a body probe (the depth cannot rebuild without a scene attached). */
function chooseAnotherHardwareTier(): void {
  const groups = container.querySelectorAll(
    '[data-testid="global-settings-group"]',
  );
  const hardware = groups[1];
  const another = hardware?.querySelector<HTMLInputElement>(
    "input:not(:checked)",
  );
  if (another === null || another === undefined)
    throw new Error("no other hardware tier");
  act(() => {
    another.click();
  });
}

function everySubsetOf(
  handles: readonly Handle[],
): readonly (readonly Handle[])[] {
  return Array.from({ length: 1 << handles.length }, (_, mask) =>
    handles.filter((_handle, index) => (mask >> index) & 1),
  );
}

describe("the offer, over every subset of switched-off handles", () => {
  const SUBSETS = everySubsetOf(EVERY_HANDLE);
  /** Entries of other kinds: none of them is a handle, so none may move the row. */
  const NOISE = [
    { kind: "hardware", tierId: "hardware.premium" },
    { kind: "accessory", accessoryId: "an-accessory-nobody-owns" },
  ] as const;

  it("covers all eight subsets", () => {
    expect(SUBSETS).toHaveLength(8);
  });

  it.each(SUBSETS.map((off) => [off.join("+") || "(none)", off] as const))(
    "with %s switched off, offers the rest in the declared order, and no row when all three are",
    (_name, off) => {
      mountUnder(
        rootWith([
          ...off.map((handle) => ({ kind: "handle" as const, handle })),
          ...NOISE,
        ]),
      );
      openSheet();

      const expected = EVERY_HANDLE.filter((handle) => !off.includes(handle));
      expect(offeredHandles()).toEqual(expected);
      expect(container.querySelector(HANDLE_GROUP) === null).toBe(
        expected.length === 0,
      );
    },
  );

  it.each(SUBSETS.map((off) => [off.join("+") || "(none)", off] as const))(
    "with %s switched off, marks the slot's default for a kitchen that chose none only where it is offered",
    (_name, off) => {
      mountUnder(handlesOff(...off));
      openSheet();

      expect(markedHandles()).toEqual(off.includes("steel") ? [] : ["steel"]);
    },
  );
});

describe("a stored handle that availability switched off", () => {
  it("opens with nothing marked and offers the other two", () => {
    hydrateWith(withHandle("black"));
    mountUnder(handlesOff("black"));
    openSheet();

    expect(markedHandles()).toEqual([]);
    expect(offeredHandles()).toEqual(["steel", "push"]);
  });

  it("is left as stored by a press that changed something else", () => {
    hydrateWith(withHandle("black"));
    mountUnder(handlesOff("black"));
    openSheet();
    chooseAnotherHardwareTier();

    apply();

    // The press did commit (the hardware tier moved), so "handle unchanged" is not a refused press.
    expect(
      useConfiguratorStore.getState().design.settings?.hardwareTierId,
    ).toBeDefined();
    expect(storedHandle()).toBe("black");
  });

  it("is replaced by the one the customer then chooses, and that one is marked on the next open", () => {
    hydrateWith(withHandle("black"));
    mountUnder(handlesOff("black"));
    openSheet();
    press("push");

    apply();

    expect(storedHandle()).toBe("push");
    openSheet();
    expect(markedHandles()).toEqual(["push"]);
  });

  it("is marked again the moment it is switched back on, with no reload", () => {
    hydrateWith(withHandle("black"));
    mountUnder(handlesOff("black"));
    openSheet();
    expect(markedHandles()).toEqual([]);

    mountUnder(SAMPLE_PRICE_ROOT);

    expect(markedHandles()).toEqual(["black"]);
  });
});

describe("a pending choice that availability switches off before apply", () => {
  it("is not written by the press, because the row no longer offers it", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    openSheet();
    press("black");

    mountUnder(handlesOff("black"));
    expect(offeredHandles()).toEqual(["steel", "push"]);
    apply();

    expect(storedHandle()).not.toBe("black");
  });

  it("leaves the bar's figure standing after that press", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    openSheet();
    press("black");

    mountUnder(handlesOff("black"));
    apply();

    expect(shownTotal()).not.toBe("no price");
  });
});

describe("a press that names no handle", () => {
  it("never stamps one, whichever other setting it changes", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    openSheet();
    chooseAnotherHardwareTier();

    apply();

    expect(
      useConfiguratorStore.getState().design.settings?.hardwareTierId,
    ).toBeDefined();
    expect(storedHandle()).toBeUndefined();
  });

  it("writes nothing when a handle is chosen, chosen back, and the sheet is cancelled", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    const before = useConfiguratorStore.getState().design;
    openSheet();
    press("push");
    press("steel");

    click('[data-testid="global-settings-cancel"]');

    expect(useConfiguratorStore.getState().design).toBe(before);
  });
});

describe("the settings pill", () => {
  function pillText(): { readonly labels: string; readonly name: string } {
    return {
      labels: [
        ...container.querySelectorAll(
          '[data-testid="global-settings-pill-label"]',
        ),
      ]
        .map((label) => label.textContent)
        .join("|"),
      name: trigger().getAttribute("aria-label") ?? "",
    };
  }

  it.each(EVERY_HANDLE)(
    "does not name the handle, and does not change when %s is applied",
    (handle) => {
      mountUnder(SAMPLE_PRICE_ROOT);
      const before = pillText();
      openSheet();
      press(handle);
      apply();

      const after = pillText();

      expect(after).toEqual(before);
      for (const label of Object.values(roMessages.panel.handleLabels)) {
        expect(after.name).not.toContain(label);
        expect(after.labels).not.toContain(label);
      }
    },
  );
});

describe("the radio group's semantics and labelling", () => {
  it.each([
    ["ro", roMessages],
    ["ru", ruMessages],
  ] as const)(
    "in %s, is a labelled radio group of native radios named alike, each labelled by its text",
    (locale, messages) => {
      shown.locale = locale;
      mountUnder(SAMPLE_PRICE_ROOT);
      openSheet();
      const group = container.querySelector(HANDLE_GROUP);
      if (group === null) throw new Error("no handle group");

      const labelledBy = group.getAttribute("aria-labelledby");
      const heading =
        labelledBy === null ? null : document.getElementById(labelledBy);
      expect(group.getAttribute("role")).toBe("radiogroup");
      expect(heading?.textContent).toBe(
        messages.globalSettings.kitchenHandleHeading,
      );
      expect(heading?.tagName).toBe("H3");

      const radios = handleRadios();
      expect(radios).toHaveLength(EVERY_HANDLE.length);
      expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
      expect(radios.every((radio) => radio.type === "radio")).toBe(true);
      expect(radios.every((radio) => !radio.hasAttribute("tabindex"))).toBe(
        true,
      );
      radios.forEach((radio) => {
        const label = radio.closest("label");
        expect(label?.textContent).toBe(
          messages.panel.handleLabels[radio.value as Handle],
        );
      });
      expect(group.textContent).toContain(
        messages.globalSettings.kitchenHandleHint,
      );
      // Not an English or Romanian leftover in the other language.
      if (locale === "ru")
        expect(group.textContent).not.toContain(
          roMessages.globalSettings.kitchenHandleHint,
        );
    },
  );

  it("names its radios apart from every other group's, so an arrow key never leaves the group", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    openSheet();

    const handleName = handleRadios()[0]?.name ?? "";
    const others = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ].filter((radio) => !handleRadios().includes(radio));

    expect(handleName).not.toBe("");
    expect(others.length).toBeGreaterThan(0);
    expect(others.some((radio) => radio.name === handleName)).toBe(false);
  });

  it("moves exactly one radio of the group when another is pressed, and none of the other groups'", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    openSheet();
    const othersBefore = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ]
      .filter((radio) => !handleRadios().includes(radio))
      .map((radio) => radio.checked);

    press("push");

    expect(markedHandles()).toEqual(["push"]);
    const othersAfter = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ]
      .filter((radio) => !handleRadios().includes(radio))
      .map((radio) => radio.checked);
    expect(othersAfter).toEqual(othersBefore);
  });

  it("sits after the colour and before the hardware group in document order", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    openSheet();
    const headings = [...container.querySelectorAll("h3")].map(
      (heading) => heading.textContent,
    );

    const ofRow = (text: string) => headings.indexOf(text);
    const at = ofRow(roMessages.globalSettings.kitchenHandleHeading);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(
      ofRow(roMessages.globalSettings.groupHeadings.material),
    );
    expect(at).toBeLessThan(
      ofRow(roMessages.globalSettings.groupHeadings.hardware),
    );
  });

  it("returns focus to the pill after the press, as the sheet's other presses do", () => {
    mountUnder(SAMPLE_PRICE_ROOT);
    openSheet();
    press("push");

    apply();

    expect(document.activeElement).toBe(trigger());
  });
});

describe("useCatalogueAvailability", () => {
  function availabilityUnder(
    priceBook: PriceBookRoot | "no provider",
  ): unknown {
    const seen: { current: unknown } = { current: "never rendered" };
    function Probe() {
      seen.current = useCatalogueAvailability();
      return null;
    }
    act(() => {
      root.render(
        priceBook === "no provider"
          ? createElement(Probe)
          : createElement(PriceBookProvider, {
              root: priceBook,
              children: createElement(Probe),
            }),
      );
    });
    return seen.current;
  }

  it("is undefined where no page supplied a book, so a sheet there draws no row", () => {
    expect(availabilityUnder("no provider")).toBeUndefined();
  });

  it("is undefined under a root that holds no book", () => {
    expect(availabilityUnder({ kind: "none" })).toBeUndefined();
  });

  it("is the active root's own availability, by reference", () => {
    const active = handlesOff("black");

    expect(availabilityUnder(active)).toBe(active.availability);
  });
});

describe("the copy the row resolves, in both languages", () => {
  it.each([
    ["ro", roMessages],
    ["ru", ruMessages],
  ] as const)(
    "%s: heading and hint are filled leaves, and the three options are the panel's own words",
    (locale, messages) => {
      const content = contentFor(locale, messages as typeof roMessages);

      expect(content.globalSettings.kitchenHandleHeading).toBe(
        messages.globalSettings.kitchenHandleHeading,
      );
      expect(content.globalSettings.kitchenHandleHint.length).toBeGreaterThan(
        10,
      );
      expect(
        new Set(
          EVERY_HANDLE.map((handle) => content.panel.handleLabels[handle]),
        ).size,
      ).toBe(3);
    },
  );
});

describe("a refused press that was about the handle", () => {
  it.each([
    ["ro", roMessages],
    ["ru", ruMessages],
  ] as const)(
    "%s: names the handle row by its own heading and says what the command said",
    (locale, messages) => {
      const content = contentFor(locale, messages as typeof roMessages);

      const sentence = describeApplyRefusal(
        { setting: "handle", message: "the reason" },
        content,
      );

      expect(sentence).toBe(
        content.globalSettings.applyRefused(
          messages.globalSettings.kitchenHandleHeading,
          "the reason",
        ),
      );
      expect(sentence).toContain(messages.globalSettings.kitchenHandleHeading);
    },
  );
});
