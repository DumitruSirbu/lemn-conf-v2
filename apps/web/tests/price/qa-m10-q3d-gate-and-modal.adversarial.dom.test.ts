// @vitest-environment happy-dom
//
// The sheet's gate and its modality. The sheet never opens, not even for a frame, where its flow cannot complete: a
// `MutationObserver` installed BEFORE the mount records every node the sheet or its pending bar was ever drawn as, so a flash
// that came and went inside a settle is caught. The ways out are tried the way a browser delivers them: a bubbling key on the
// focused element, a click on the scrim itself, the back link's question, and the browser's Back.
import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import { act } from "react";

import {
  forgetEditorOrigin,
  readEditorOrigin,
  recordEditorOpenedFromStepOne,
} from "@/app/configurator/configure/back-guard";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/scene/kitchen-canvas", () => ({ default: () => null }));
vi.mock("@/panel/editor-panel", () => ({ EditorPanel: () => null }));
vi.mock("@/settings/global-settings", () => ({ GlobalSettings: () => null }));
vi.mock("@/app/configurator/configure/selection-debug", () => ({
  SelectionDebug: () => null,
}));
vi.mock("@/panel/use-panel-view", () => ({
  usePanelView: () => ({ kind: "closed" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/d/abcdefghijklmnopqrstu",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { NO_PRICE_BOOK, type PriceBookRoot } from "@/price/price-book-root";
import {
  useConfiguratorStore,
  type WriteAccess,
} from "@/store/configurator-store";
import type { ConfigureScreenVariant } from "@/app/configurator/configure/configure-screen";

import roMessages from "../../src/messages/ro.json";
import { ro } from "../support/romanian-content";
import {
  beginTest,
  byTestId,
  chooseTier,
  currentDesignId,
  endTest,
  hydrate,
  mountEditor,
  notice,
  press,
  required,
  requiredButton,
  requestsAboutTheKitchen,
  requestsOf,
  ROOT_WITH_MDF_AND_PREMIUM_OFF,
  ROOT_WITH_MDF_OFF,
  serveWorld,
  settle,
  SWITCHED_OFF_HARDWARE,
  SWITCHED_OFF_MATERIAL,
  type Editor,
  type World,
  carryingMdf,
  carryingMdfAndPremium,
  HETTICH_NAME,
  MELAMINE_NAME,
  rerenderUnder,
  ROOT_NOTHING_OFF_AT_PAIR,
} from "../support/replacement-sheet-world";
import { utterancesOf } from "../support/read-aloud";
import { rowsOf } from "../support/replacement-sheet-flow";
import { tierName } from "../support/tier-offer-world";

const TEXT = roMessages.replacementSheet;
const SHEET_TELLTALES = [
  '[data-testid="replacement-sheet"]',
  '[data-testid="price-bar-replacement-pending"]',
  '[data-testid="review-cta"][aria-disabled="true"]',
] as const;

let watching: MutationObserver | undefined;

/** Watches the whole document from before the mount: every element the sheet's telltales were ever drawn as. */
function watchForTheSheet(): { readonly sightings: () => string[] } {
  const sighted: string[] = [];
  const noteIn = (node: Node): void => {
    if (!(node instanceof Element)) return;
    for (const selector of SHEET_TELLTALES) {
      if (node.matches(selector) || node.querySelector(selector) !== null) {
        sighted.push(selector);
      }
    }
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(noteIn);
      if (record.type === "attributes" && record.target instanceof Element) {
        noteIn(record.target);
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-disabled", "data-testid"],
  });
  watching = observer;
  return {
    sightings: () => {
      for (const record of observer.takeRecords()) {
        record.addedNodes.forEach(noteIn);
        if (record.type === "attributes" && record.target instanceof Element) {
          noteIn(record.target);
        }
      }
      return sighted;
    },
  };
}

beforeEach(() => {
  beginTest();
});

afterEach(async () => {
  watching?.disconnect();
  watching = undefined;
  await endTest();
});

describe("where the sheet's flow cannot complete it never opens, not even for a moment", () => {
  interface Refusal {
    readonly name: string;
    readonly variant?: ConfigureScreenVariant;
    readonly canWrite?: WriteAccess;
    readonly designId?: string | null;
    readonly priceRoot?: PriceBookRoot;
  }
  const refusals: readonly Refusal[] = [
    {
      name: "the share view under its sentinel id",
      variant: "shared",
      canWrite: false,
      designId: "shared-view",
    },
    {
      name: "the share view even if it were handed a real id and write access",
      variant: "shared",
    },
    { name: "write access still being checked", canWrite: "checking" },
    { name: "write access whose check failed", canWrite: "check-failed" },
    { name: "a page that may not write", canWrite: false },
    { name: "no active price book", priceRoot: NO_PRICE_BOOK },
    { name: "a design with no id yet", designId: null },
    {
      name: "the share sentinel id on the owner's screen",
      designId: "shared-view",
    },
    {
      name: "an id one character short of a design id",
      designId: "abcdefghijklmnopqrst",
    },
    {
      name: "an id one character past a design id",
      designId: "abcdefghijklmnopqrstuv",
    },
    { name: "an id carrying markup", designId: "<img src=x onerror=alert(1)>" },
    {
      name: "an id that would climb out of the route",
      designId: "../../etc/passwd_aaaa",
    },
  ];

  it.each(refusals)(
    "$name: the sheet and its pending bar are never drawn, the review control is never disabled, and nothing is requested",
    async ({ variant, canWrite, designId, priceRoot }) => {
      const world = serveWorld({ notices: [notice()] });
      const watch = watchForTheSheet();
      hydrate(
        carryingMdf(),
        canWrite ?? true,
        designId === undefined ? currentDesignId() : designId,
      );

      const editor = await mountEditor({
        ...(variant === undefined ? {} : { variant }),
        ...(priceRoot === undefined ? {} : { priceRoot }),
      });

      expect(watch.sightings()).toEqual([]);
      expect(byTestId(editor, "price-bar")).toBeNull();
      expect(requestsAboutTheKitchen(world)).toEqual([]);
    },
  );

  it("write access settling to false: the sheet is never drawn and the notice is never asked for", async () => {
    const world = serveWorld({ notices: [notice()] });
    hydrate(carryingMdf(), "checking");
    const watch = watchForTheSheet();
    await mountEditor();

    act(() => {
      useConfiguratorStore.getState().applyWriteAccess({
        designId: currentDesignId(),
        canWrite: false,
      });
    });
    await settle();

    expect(watch.sightings()).toEqual([]);
    expect(requestsAboutTheKitchen(world)).toEqual([]);
  });

  it("write access failing and then being retried: nothing is drawn or asked while it is unsettled", async () => {
    const world = serveWorld({ notices: [notice()] });
    hydrate(carryingMdf(), "checking");
    const watch = watchForTheSheet();
    await mountEditor();

    act(() => {
      useConfiguratorStore
        .getState()
        .failWriteAccessCheck({ designId: currentDesignId() });
    });
    await settle();
    act(() => {
      useConfiguratorStore.getState().retryWriteAccessCheck();
    });
    await settle();

    expect(useConfiguratorStore.getState().canWrite).toBe("checking");
    expect(watch.sightings()).toEqual([]);
    expect(requestsAboutTheKitchen(world)).toEqual([]);
  });

  it("write access settling to true: no request before it, the sheet and exactly one GET after", async () => {
    const world = serveWorld({ notices: [notice()] });
    hydrate(carryingMdf(), "checking");
    const editor = await mountEditor();
    expect(requestsAboutTheKitchen(world)).toEqual([]);
    expect(byTestId(editor, "replacement-sheet")).toBeNull();

    act(() => {
      useConfiguratorStore.getState().applyWriteAccess({
        designId: currentDesignId(),
        canWrite: true,
      });
    });
    await settle();

    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
    expect(requestsOf(world, "GET")).toHaveLength(1);
  });

  it("an open sheet goes with the write access that opened it, instead of leaving a modal with no way to save", async () => {
    serveWorld({ notices: [notice()] });
    hydrate(carryingMdf(), true);
    const editor = await mountEditor();
    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();

    act(() => {
      useConfiguratorStore.setState({ canWrite: false });
    });
    await settle();

    expect(byTestId(editor, "replacement-sheet")).toBeNull();
    expect(byTestId(editor, "price-bar-replacement-pending")).toBeNull();
    for (const band of editor.container.querySelectorAll("main > *")) {
      expect(band.hasAttribute("inert")).toBe(false);
    }
  });
});

describe("the sheet can be left only by the back link", () => {
  beforeEach(() => {
    serveWorld({ notices: [notice()] });
    hydrate(carryingMdf());
  });

  function pressEscapeWhereFocusIs(): void {
    act(() => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
  }

  function scrimOf(editor: Editor): HTMLElement {
    const host = required(editor, "replacement-sheet").parentElement;
    const scrim = host?.firstElementChild;
    if (
      !(scrim instanceof HTMLElement) ||
      scrim.getAttribute("aria-hidden") !== "true"
    ) {
      throw new Error("the sheet's scrim is not where the host puts it");
    }
    return scrim;
  }

  it("ignores Escape pressed on the focused control, on the surface and on the body, with focus kept inside", async () => {
    const editor = await mountEditor();
    const sheet = required(editor, "replacement-sheet");

    pressEscapeWhereFocusIs();
    act(() => {
      sheet.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(byTestId(editor, "replacement-sheet")).toBe(sheet);
    expect(sheet.contains(document.activeElement)).toBe(true);
  });

  it("ignores a press on its own scrim", async () => {
    const editor = await mountEditor();

    press(scrimOf(editor));

    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
  });

  it("ignores Escape inside the chooser, and the chooser's cancel control writes nothing", async () => {
    const editor = await mountEditor();
    press(required(editor, "replacement-choose"));

    pressEscapeWhereFocusIs();

    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
    expect(
      useConfiguratorStore.getState().design.settings?.materialTierId,
    ).toBe(SWITCHED_OFF_MATERIAL);
  });

  it("keeps the sheet, its inert backdrop and its focus after the ‹ question is answered Stay", async () => {
    const editor = await mountEditor();
    const sheet = required(editor, "replacement-sheet");
    const bandsBehind = (): Element[] =>
      [...editor.container.querySelectorAll("main > *")].filter(
        (band) => !band.contains(sheet),
      );
    press(required(editor, "replacement-sheet-leave"));

    const question = required(editor, "back-confirm-dialog");
    expect(question.closest("[inert]")).toBeNull();
    expect(sheet.closest("[inert]")).not.toBeNull();

    press(required(editor, "back-confirm-confirm-back"));
    await settle();

    expect(byTestId(editor, "back-confirm-dialog")).toBeNull();
    expect(byTestId(editor, "replacement-sheet")).toBe(sheet);
    expect(sheet.closest("[inert]")).toBeNull();
    expect(bandsBehind().every((band) => band.hasAttribute("inert"))).toBe(
      true,
    );
    expect(sheet.contains(document.activeElement)).toBe(true);
  });

  it("answers Escape on the ‹ question with Stay, and the next Escape still leaves the sheet where it is", async () => {
    const editor = await mountEditor();
    press(required(editor, "replacement-sheet-leave"));

    pressEscapeWhereFocusIs();
    await settle();
    expect(byTestId(editor, "back-confirm-dialog")).toBeNull();
    pressEscapeWhereFocusIs();

    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
    expect(
      [...editor.container.querySelectorAll("main > *")]
        .filter((band) => !band.contains(required(editor, "replacement-sheet")))
        .every((band) => band.hasAttribute("inert")),
    ).toBe(true);
  });
});

describe("the browser's Back while the sheet is up", () => {
  const ORIGIN = "http://localhost:3000";

  afterEach(() => {
    forgetEditorOrigin();
    window.history.replaceState(null, "", `${ORIGIN}/`);
  });

  it("asks the same question over the sheet and, answered Stay, leaves the sheet, its inert backdrop and its focus as they were", async () => {
    const editorPath = `/ro/d/${currentDesignId()}`;
    serveWorld({ notices: [notice(), notice()] });
    hydrate(carryingMdfAndPremium());
    window.history.replaceState(null, "", `${ORIGIN}${editorPath}`);
    recordEditorOpenedFromStepOne(currentDesignId() as never);
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
    });
    await chooseTier(editor, tierName("material.melamine"));
    expect(readEditorOrigin().guardedPathname).toBe(editorPath);
    const sheet = required(editor, "replacement-sheet");

    act(() => {
      window.history.replaceState(null, "", `${ORIGIN}${editorPath}`);
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    expect(byTestId(editor, "back-confirm-dialog")).not.toBeNull();
    expect(sheet.closest("[inert]")).not.toBeNull();
    press(required(editor, "back-confirm-confirm-back"));
    await settle();

    expect(byTestId(editor, "back-confirm-dialog")).toBeNull();
    expect(byTestId(editor, "replacement-sheet")).toBe(sheet);
    expect(sheet.closest("[inert]")).toBeNull();
    expect(sheet.contains(document.activeElement)).toBe(true);
  });
});

describe("the sheet's rows, chooser and focus", () => {
  let world: World;
  beforeEach(() => {
    world = serveWorld({ notices: [notice(), notice()] });
    hydrate(carryingMdfAndPremium());
  });

  const choosable = (editor: Editor): HTMLElement[] => [
    ...editor.container.querySelectorAll<HTMLElement>(
      '[data-testid="replacement-choose"]',
    ),
  ];

  it("announces each owed row on its own and names each choose control by the row it belongs to", async () => {
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
    });

    // Q5d: the row has no group label of its own; it is read as its kind, its item and its status, once each, in that order,
    // and the control after them is named by the verb and that row's kind.
    const kinds = ro.priceBreakdown.wholeKitchenCategories;
    expect(rowsOf(editor).map(utterancesOf)).toEqual([
      [
        kinds.material,
        "MDF vopsit mat",
        TEXT.unavailable,
        `${TEXT.choose} ${kinds.material}`,
      ],
      [
        kinds.hardware,
        tierName("hardware.premium"),
        TEXT.unavailable,
        `${TEXT.choose} ${kinds.hardware}`,
      ],
    ]);
    const sheet = required(editor, "replacement-sheet");
    expect(sheet.querySelector('[role="group"]')).toBeNull();
    const [first, second] = choosable(editor);
    expect(document.activeElement).toBe(first);
    const idsOf = (control: HTMLElement | undefined): string[] =>
      control?.getAttribute("aria-labelledby")?.split(" ") ?? [];
    expect(idsOf(first)).toHaveLength(2);
    expect(
      idsOf(first).every((id) => document.getElementById(id) !== null),
    ).toBe(true);
    expect(
      idsOf(second).every((id) => document.getElementById(id) !== null),
    ).toBe(true);
    expect(new Set([...idsOf(first), ...idsOf(second)]).size).toBe(4);
  });

  it("offers each group its own remaining options and never the other group's, with nothing preselected on any open", async () => {
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
    });
    const optionNames = (): string[] =>
      [...editor.container.querySelectorAll<HTMLElement>("[data-option]")].map(
        (option) => option.querySelector("span")?.textContent ?? "",
      );
    const nameOfTier = (
      group: "material" | "hardware",
      tierId: string,
    ): string => {
      const tier = SAMPLE_PRICE_BOOK[group].tiers.find(
        (held) => held.tierId === tierId,
      );
      if (tier === undefined) throw new Error(`no ${tierId}`);
      return ro.bookText(tier.name, tier.nameKey);
    };

    press(choosable(editor)[0]);
    expect(optionNames()).toEqual([
      nameOfTier("material", "material.melamine"),
      nameOfTier("material", "material.veneer"),
      nameOfTier("material", SWITCHED_OFF_MATERIAL),
    ]);
    const [firstOption] =
      editor.container.querySelectorAll<HTMLElement>("[data-option]");
    press(firstOption);
    press(required(editor, "replacement-chooser-back"));

    press(choosable(editor)[1]);
    expect(optionNames()).toEqual([
      nameOfTier("hardware", "hardware.standard"),
      nameOfTier("hardware", "hardware.soft-close"),
      nameOfTier("hardware", SWITCHED_OFF_HARDWARE),
    ]);
    const sheet = required(editor, "replacement-sheet");
    expect(sheet.querySelector('[aria-pressed="true"]')).toBeNull();
    expect(sheet.querySelector('[data-selected="true"]')).toBeNull();
    expect(requiredButton(editor, "replacement-apply").disabled).toBe(true);
  });

  it("does not let the struck option be picked, and leaves the apply control off after pressing it", async () => {
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
    });
    press(choosable(editor)[0]);
    const struck = [
      ...editor.container.querySelectorAll<HTMLButtonElement>("[data-option]"),
    ].find((option) => option.dataset.struck === "true");

    press(struck as HTMLElement);

    expect(struck?.disabled).toBe(true);
    expect(struck?.hasAttribute("aria-pressed")).toBe(false);
    expect(requiredButton(editor, "replacement-apply").disabled).toBe(true);
    expect(requestsOf(world, "PUT")).toEqual([]);
  });

  it("moves focus to the next row still owed once a row is resolved, never to the resolved one", async () => {
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
    });

    await chooseTier(editor, tierName("material.melamine"));

    const rows = [
      ...editor.container.querySelectorAll<HTMLElement>(
        '[data-testid="replacement-row"]',
      ),
    ];
    const owedButton = rows[1]?.querySelector("button");
    expect(rows.map((row) => row.dataset.resolved)).toEqual(["true", "false"]);
    expect(document.activeElement).toBe(owedButton);
    expect(rows[0]?.querySelector('[role="group"]')).toBeNull();
  });

  it("draws an accessory taken out as information with nothing focusable, and the first choose control stays the first control", async () => {
    serveWorld({
      notices: [
        notice({ removedAccessories: [{ accessoryId: "dishDryingRack" }] }),
      ],
    });
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
    });

    const info = required(editor, "replacement-info");
    expect(info.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(
      0,
    );
    expect(info.getAttribute("role")).toBeNull();
    expect(document.activeElement).toBe(choosable(editor)[0]);
    expect(required(editor, "replacement-sheet").textContent).toContain(
      TEXT.exitHint,
    );
  });
});

describe("the bar and the review control while a replacement is owed", () => {
  it("the bar says when the price comes, it is the only thing in the bar, and the review control is a disabled span, not a link", async () => {
    serveWorld({ notices: [notice()] });
    hydrate(carryingMdf());
    const editor = await mountEditor({ priceRoot: ROOT_WITH_MDF_OFF });

    const bar = required(editor, "price-bar");
    expect(bar.textContent).toBe(TEXT.priceAfterChoosing);
    expect(bar.querySelectorAll("[data-testid]")).toHaveLength(1);
    const review = required(editor, "review-cta");
    expect(review.tagName).toBe("SPAN");
    expect(review.getAttribute("aria-disabled")).toBe("true");
    expect(review.hasAttribute("href")).toBe(false);
  });
});

describe("where focus goes when the sheet closes", () => {
  it("lands on the review control, not on the body, after the last choice of one row", async () => {
    serveWorld({ notices: [notice()] });
    hydrate(carryingMdf());
    const editor = await mountEditor();

    await chooseTier(editor, MELAMINE_NAME);

    expect(byTestId(editor, "replacement-sheet")).toBeNull();
    const review = required(editor, "review-cta");
    expect(review.tagName).toBe("A");
    expect(document.activeElement).toBe(review);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("lands on the review control after the last of two rows, and stays inside the sheet until then", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(carryingMdfAndPremium());
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
    });

    await chooseTier(editor, MELAMINE_NAME);
    expect(
      required(editor, "replacement-sheet").contains(document.activeElement),
    ).toBe(true);
    await chooseTier(editor, HETTICH_NAME);

    expect(byTestId(editor, "replacement-sheet")).toBeNull();
    expect(document.activeElement).toBe(required(editor, "review-cta"));
  });

  it("lands on the review control when availability comes back before any choice", async () => {
    serveWorld({ notices: [notice()] });
    hydrate(carryingMdf());
    const editor = await mountEditor();

    await rerenderUnder(ROOT_NOTHING_OFF_AT_PAIR);

    expect(byTestId(editor, "replacement-sheet")).toBeNull();
    expect(document.activeElement).toBe(required(editor, "review-cta"));
  });
});

describe("the review control and the pending bar while a replacement is owed", () => {
  it("is a link that says it is disabled while a choice is owed, with no address, and a plain live link after", async () => {
    serveWorld({ notices: [notice()] });
    hydrate(carryingMdf());
    const editor = await mountEditor();

    const whileOwed = required(editor, "review-cta");
    expect(whileOwed.getAttribute("role")).toBe("link");
    expect(whileOwed.getAttribute("aria-disabled")).toBe("true");
    expect(whileOwed.hasAttribute("href")).toBe(false);

    await chooseTier(editor, MELAMINE_NAME);

    const after = required(editor, "review-cta");
    expect(after.tagName).toBe("A");
    expect(after.hasAttribute("href")).toBe(true);
    expect(after.hasAttribute("aria-disabled")).toBe(false);
    expect(after.getAttribute("role")).toBeNull();
  });

  it("mounts the pending bar's live region empty and puts its words in afterwards, so they are announced", async () => {
    serveWorld({ notices: [notice()] });
    hydrate(carryingMdf());
    const region = '[data-testid="price-bar-replacement-pending"]';
    let wasMountedEmpty = false;
    let wereWordsAddedLater = false;
    const isRegion = (node: Node): node is Element =>
      node instanceof Element && node.matches(region);
    watching = new MutationObserver((records) => {
      for (const record of records) {
        for (const added of record.addedNodes) {
          if (
            isRegion(added) ||
            (added instanceof Element && added.querySelector(region) !== null)
          ) {
            wasMountedEmpty = true;
          }
        }
        if (isRegion(record.target) && record.addedNodes.length > 0) {
          wereWordsAddedLater = true;
        }
      }
    });
    watching.observe(document.body, { subtree: true, childList: true });

    const editor = await mountEditor();

    expect(wasMountedEmpty).toBe(true);
    expect(wereWordsAddedLater).toBe(true);
    expect(required(editor, "price-bar-replacement-pending").textContent).toBe(
      TEXT.priceAfterChoosing,
    );
  });
});
