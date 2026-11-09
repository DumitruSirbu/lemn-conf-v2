// @vitest-environment happy-dom
//
// The forced-replacement sheet, in the editor as it is mounted. The scene and the panel are
// stubbed; the price bar, the breakdown, the sheet and the notice hook are real, over a `fetch` that records every request
// and holds the design's save open until the test lets it land, so "no GET and no POST until the save has landed" is
// observed and not inferred.
import { createTranslator } from "next-intl";
import { act } from "react";
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
import { utterancesOf } from "../support/read-aloud";
import { ro } from "../support/romanian-content";
import {
  advanceClock,
  beginTest,
  byTestId,
  carryingMdf,
  carryingMdfAndPremium,
  chooseTier,
  driveEveryTimerFromTheTest,
  endTest,
  HETTICH_NAME,
  hydrate,
  MELAMINE_NAME,
  mountEditor,
  notice,
  OFF_PAIR,
  press,
  required,
  requiredButton,
  requestsOf,
  ROOT_NOTHING_OFF_AT_PAIR,
  ROOT_WITH_MDF_AND_PREMIUM_OFF,
  serveWorld,
  settle,
  SWITCHED_OFF_MATERIAL,
  VANISHED_MATERIAL,
  type Editor,
  type World,
} from "../support/replacement-sheet-world";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import {
  kitchenCarrying,
  MATERIAL_DEFAULT_TIER_ID,
} from "../support/tier-offer-world";

const OTHER_MATERIAL = "material.veneer";
const TEXT = roMessages.replacementSheet;
const TOO_MANY_REQUESTS = 429;
const say = createTranslator({ locale: "ro", messages: roMessages });

let editor: Editor;
let world: World;

beforeEach(() => {
  beginTest();
});

afterEach(async () => {
  await endTest();
});

describe("a saved kitchen that carries a tier availability has switched off", () => {
  beforeEach(() => {
    hydrate(carryingMdf());
    world = serveWorld({ notices: [notice()] });
  });

  it("opens as a modal dialog with focus on the first Alege, the row announced and nothing chosen", async () => {
    editor = await mountEditor();

    const sheet = required(editor, "replacement-sheet");
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.textContent).toContain(TEXT.title);
    expect(document.activeElement).toBe(required(editor, "replacement-choose"));
    // Q5d: the row is read as its text, not as a labelled group: the item and its status once each.
    expect(sheet.querySelector('[role="group"]')).toBeNull();
    expect(utterancesOf(required(editor, "replacement-row"))).toEqual([
      ro.priceBreakdown.wholeKitchenCategories.material,
      "MDF vopsit mat",
      TEXT.unavailable,
      `${TEXT.choose} ${ro.priceBreakdown.wholeKitchenCategories.material}`,
    ]);
    expect(sheet.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it("shows no figure anywhere: the bar says when the price comes, and the review control is off", async () => {
    editor = await mountEditor();

    expect(required(editor, "price-bar-replacement-pending").textContent).toBe(
      TEXT.priceAfterChoosing,
    );
    expect(byTestId(editor, "price-bar-total")).toBeNull();
    expect(editor.container.textContent).not.toMatch(/\d[\d\s]*\s?MDL/);
    const review = required(editor, "review-cta");
    expect(review.tagName).toBe("SPAN");
    expect(review.getAttribute("aria-disabled")).toBe("true");
  });

  it("makes the screen behind it inert, and can be left only by the ‹ it draws itself", async () => {
    editor = await mountEditor();

    const behind = [...editor.container.querySelectorAll("main > *")].filter(
      (band) => !band.contains(required(editor, "replacement-sheet")),
    );
    expect(behind.length).toBeGreaterThan(0);
    expect(behind.every((band) => band.hasAttribute("inert"))).toBe(true);
    expect(
      required(editor, "replacement-sheet-leave").getAttribute("href"),
    ).toMatch(/^\/.*/);
  });

  it("does nothing on Escape and on a click outside it", async () => {
    editor = await mountEditor();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    act(() => {
      editor.container.querySelector<HTMLElement>("main")?.click();
    });

    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
  });

  it("asks before leaving when ‹ is pressed, as the top bar's own does", async () => {
    editor = await mountEditor();

    press(required(editor, "replacement-sheet-leave"));

    expect(byTestId(editor, "back-confirm-dialog")).not.toBeNull();
    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
  });

  it("draws no C1 beside it, whatever the answer says", async () => {
    world = serveWorld({ notices: [notice({ pricesChanged: true })] });

    editor = await mountEditor();

    expect(byTestId(editor, "price-notice")).toBeNull();
  });

  it("names an accessory taken out as information only, with nothing to press", async () => {
    world = serveWorld({
      notices: [
        notice({
          replacementsRequired: [],
          removedAccessories: [{ accessoryId: "dishDryingRack" }],
        }),
      ],
    });

    editor = await mountEditor();

    const rack = SAMPLE_PRICE_ROOT.book.accessories.dishDryingRack;
    expect(required(editor, "replacement-info").textContent).toBe(
      say("replacementSheet.accessoryRemoved", {
        name: ro.bookText(rack.name, rack.nameKey),
      }),
    );
    expect(
      required(editor, "replacement-info").querySelector("button"),
    ).toBeNull();
  });
});

describe("where the sheet's flow cannot complete, nothing opens and nothing flashes", () => {
  beforeEach(() => {
    world = serveWorld({ notices: [notice()] });
  });

  const cases: readonly {
    name: string;
    variant?: ConfigureScreenVariant;
    canWrite?: WriteAccess;
    priceRoot?: PriceBookRoot;
  }[] = [
    { name: "the share view", variant: "shared" },
    { name: "write access still being checked", canWrite: "checking" },
    { name: "a page that may not write", canWrite: false },
    { name: "no active price book", priceRoot: NO_PRICE_BOOK },
  ];

  it.each(cases)(
    "$name: no dialog, no pending bar, no disabled review control, and no request for a notice",
    async ({ variant, canWrite, priceRoot }) => {
      hydrate(carryingMdf(), canWrite ?? true);

      editor = await mountEditor({
        ...(variant === undefined ? {} : { variant }),
        ...(priceRoot === undefined ? {} : { priceRoot }),
      });

      expect(byTestId(editor, "replacement-sheet")).toBeNull();
      expect(byTestId(editor, "price-bar-replacement-pending")).toBeNull();
      expect(byTestId(editor, "price-bar")).toBeNull();
      expect(
        byTestId(editor, "review-cta")?.getAttribute("aria-disabled") ?? null,
      ).toBeNull();
      expect(requestsOf(world, "GET")).toEqual([]);
    },
  );
});

describe("choosing a replacement", () => {
  beforeEach(() => {
    hydrate(carryingMdf());
  });

  it("offers only the remaining options, the kitchen's own tier struck and unselectable, and the apply control off until a pick", async () => {
    world = serveWorld({ notices: [notice()] });
    editor = await mountEditor();

    press(required(editor, "replacement-choose"));

    const options = [
      ...editor.container.querySelectorAll<HTMLButtonElement>("[data-option]"),
    ];
    expect(options.map((option) => option.disabled)).toEqual([
      false,
      false,
      true,
    ]);
    expect(options.at(-1)?.textContent).toContain("MDF vopsit mat");
    expect(options.at(-1)?.textContent).toContain(TEXT.strikethroughNote);
    expect(
      options.some((option) => option.getAttribute("aria-pressed") === "true"),
    ).toBe(false);
    expect(requiredButton(editor, "replacement-apply").disabled).toBe(true);
    expect(editor.container.textContent).toContain(TEXT.priceAfterApplying);

    const [firstRemaining] = options;
    if (firstRemaining === undefined) throw new Error("no option is offered");
    press(firstRemaining);

    expect(requiredButton(editor, "replacement-apply").disabled).toBe(false);
  });

  it("goes back to the list without writing anything", async () => {
    world = serveWorld({ notices: [notice()] });
    editor = await mountEditor();
    press(required(editor, "replacement-choose"));

    press(required(editor, "replacement-chooser-back"));

    expect(byTestId(editor, "replacement-choose")).not.toBeNull();
    expect(
      useConfiguratorStore.getState().design.settings?.materialTierId,
    ).toBe(SWITCHED_OFF_MATERIAL);
    expect(requestsOf(world, "PUT")).toEqual([]);
  });
});

describe("after the last choice", () => {
  beforeEach(() => {
    hydrate(carryingMdf());
  });

  it("shows the price at once and sends no GET and no POST while the save is in flight", async () => {
    world = serveWorld({
      notices: [notice(), notice({ pricesChanged: true })],
    });
    editor = await mountEditor();

    await chooseTier(editor, MELAMINE_NAME);

    expect(byTestId(editor, "replacement-sheet")).toBeNull();
    expect(byTestId(editor, "price-bar-total")).not.toBeNull();
    expect(
      useConfiguratorStore.getState().design.settings?.materialTierId,
    ).toBe(MATERIAL_DEFAULT_TIER_ID);
    expect(requestsOf(world, "PUT")).toHaveLength(1);
    expect(requestsOf(world, "GET")).toHaveLength(1);
    expect(requestsOf(world, "POST")).toEqual([]);
    expect(byTestId(editor, "replacement-confirmation")).toBeNull();
  });

  it("asks again only once the save has landed, carries the prices sentence when that answer says so, then acknowledges the displayed pair", async () => {
    world = serveWorld({
      notices: [notice(), notice({ pricesChanged: true })],
    });
    editor = await mountEditor();
    await chooseTier(editor, MELAMINE_NAME);

    await world.landSave("2");

    expect(requestsOf(world, "GET")).toHaveLength(2);
    const lines = required(editor, "replacement-confirmation").textContent;
    expect(lines).toContain(
      say("replacementSheet.changedMaterial", { name: MELAMINE_NAME }),
    );
    expect(lines).toContain(roMessages.customerPriceNotice.alsoUpdated);
    expect(requestsOf(world, "POST")).toEqual([
      expect.objectContaining({ body: OFF_PAIR }),
    ]);
    expect(byTestId(editor, "price-notice")).toBeNull();
  });

  it("carries no prices sentence when the second answer says the prices did not move", async () => {
    world = serveWorld({
      notices: [
        notice({ pricesChanged: true }),
        notice({ pricesChanged: false }),
      ],
    });
    editor = await mountEditor();
    await chooseTier(editor, MELAMINE_NAME);

    await world.landSave("2");

    const lines = required(editor, "replacement-confirmation").textContent;
    expect(lines).toContain(
      say("replacementSheet.changedMaterial", { name: MELAMINE_NAME }),
    );
    expect(lines).not.toContain(roMessages.customerPriceNotice.alsoUpdated);
    expect(requestsOf(world, "POST")).toHaveLength(1);
  });

  it("follows the second answer and not the first when the two disagree", async () => {
    world = serveWorld({
      notices: [
        notice({ pricesChanged: false }),
        notice({ pricesChanged: true }),
      ],
    });
    editor = await mountEditor();
    await chooseTier(editor, MELAMINE_NAME);

    await world.landSave("2");

    expect(required(editor, "replacement-confirmation").textContent).toContain(
      roMessages.customerPriceNotice.alsoUpdated,
    );
  });

  it("keeps the first answer when the second ask fails: a sent kitchen keeps its note, nothing is acknowledged and no prices sentence is said", async () => {
    world = serveWorld({
      notices: [notice({ isSent: true }), TOO_MANY_REQUESTS],
    });
    editor = await mountEditor();
    await chooseTier(editor, MELAMINE_NAME);

    await world.landSave("2");

    expect(requestsOf(world, "GET")).toHaveLength(2);
    expect(byTestId(editor, "sent-kitchen-note")).not.toBeNull();
    expect(requestsOf(world, "POST")).toEqual([]);
    expect(byTestId(editor, "price-notice")).toBeNull();
    const lines = required(editor, "replacement-confirmation").textContent;
    expect(lines).toContain(
      say("replacementSheet.changedMaterial", { name: MELAMINE_NAME }),
    );
    expect(lines).not.toContain(roMessages.customerPriceNotice.alsoUpdated);
  });

  it("acknowledges nothing and says no prices sentence on a stale page: the second answer is for another pair", async () => {
    const newerPair = { ...OFF_PAIR, availabilityRevision: "2" };
    world = serveWorld({
      notices: [notice(), notice({ current: newerPair, pricesChanged: true })],
    });
    editor = await mountEditor();
    await chooseTier(editor, MELAMINE_NAME);

    await world.landSave("2");

    expect(
      required(editor, "replacement-confirmation").textContent,
    ).not.toContain(roMessages.customerPriceNotice.alsoUpdated);
    expect(requestsOf(world, "POST")).toEqual([]);
  });

  it("writes no marker when the second answer still owes a replacement", async () => {
    world = serveWorld({
      notices: [
        notice(),
        notice({
          replacementsRequired: [
            {
              item: { kind: "material", tierId: OTHER_MATERIAL },
              remaining: [],
            },
          ],
        }),
      ],
    });
    editor = await mountEditor();
    await chooseTier(editor, MELAMINE_NAME);

    await world.landSave("2");

    expect(requestsOf(world, "POST")).toEqual([]);
  });

  it("never asks again when the save never lands", async () => {
    world = serveWorld({
      notices: [notice(), notice({ pricesChanged: true })],
    });
    editor = await mountEditor();
    await chooseTier(editor, MELAMINE_NAME);

    await settle();
    await settle();

    expect(requestsOf(world, "GET")).toHaveLength(1);
    expect(requestsOf(world, "POST")).toEqual([]);
    expect(byTestId(editor, "replacement-confirmation")).toBeNull();
  });

  it("goes by itself after a while, and the review control is live again", async () => {
    driveEveryTimerFromTheTest();
    world = serveWorld({ notices: [notice(), notice()] });
    editor = await mountEditor();
    await chooseTier(editor, MELAMINE_NAME);
    await world.landSave("2");
    expect(byTestId(editor, "replacement-confirmation")).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_001);
    });

    expect(byTestId(editor, "replacement-confirmation")).toBeNull();
    expect(byTestId(editor, "review-cta")?.tagName).toBe("A");
  });
});

describe("several rows at once", () => {
  beforeEach(() => {
    hydrate(carryingMdfAndPremium());
  });

  it("resolves rows one by one, keeps the resolved one drawn with the change label, and shows the price only when all are chosen", async () => {
    world = serveWorld({ notices: [notice(), notice()] });
    editor = await mountEditor({ priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF });
    expect(
      editor.container.querySelectorAll('[data-testid="replacement-row"]'),
    ).toHaveLength(2);

    await chooseTier(editor, MELAMINE_NAME);

    const rows = [
      ...editor.container.querySelectorAll('[data-testid="replacement-row"]'),
    ];
    expect(rows.map((row) => row.getAttribute("data-resolved"))).toEqual([
      "true",
      "false",
    ]);
    expect(rows[0]?.textContent).toContain(MELAMINE_NAME);
    expect(rows[0]?.textContent).toContain(TEXT.change);
    expect(byTestId(editor, "price-bar-total")).toBeNull();
    expect(required(editor, "price-bar-replacement-pending")).not.toBeNull();
  });

  it("does not ask again when the first save lands while the last choice is still queued behind it", async () => {
    driveEveryTimerFromTheTest();
    world = serveWorld({
      notices: [notice(), notice({ pricesChanged: true })],
    });
    editor = await mountEditor({ priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF });
    await chooseTier(editor, MELAMINE_NAME);
    // The second choice is made while the first save is in flight, so it waits behind it.
    await chooseTier(editor, HETTICH_NAME);
    expect(requestsOf(world, "PUT")).toHaveLength(1);

    await world.landSave("2");

    // The revision has moved, and the design on screen is still not the one the server holds: the second choice waits
    // behind the coalescer's one-save-a-second interval, where `saveStatus` already reads idle.
    expect(useConfiguratorStore.getState().revision).toBe("2");
    expect(useConfiguratorStore.getState().saveStatus).toBe("idle");
    expect(requestsOf(world, "PUT")).toHaveLength(1);
    expect(requestsOf(world, "GET")).toHaveLength(1);
    expect(requestsOf(world, "POST")).toEqual([]);

    await advanceClock(1_000);
    expect(requestsOf(world, "PUT")).toHaveLength(2);
    expect(requestsOf(world, "GET")).toHaveLength(1);
    expect(requestsOf(world, "POST")).toEqual([]);

    await world.landSave("3");
    expect(requestsOf(world, "GET")).toHaveLength(2);
    expect(requestsOf(world, "POST")).toHaveLength(1);
    expect(required(editor, "replacement-confirmation").textContent).toContain(
      roMessages.customerPriceNotice.alsoUpdated,
    );
  });
});

describe("a tier the book no longer holds", () => {
  beforeEach(() => {
    hydrate(kitchenCarrying({ materialTierId: VANISHED_MATERIAL }));
    world = serveWorld({
      notices: [notice(), notice({ pricesChanged: true })],
    });
  });

  it("shows the generic line and never the id, offers the active tiers, and no figure shows", async () => {
    editor = await mountEditor({ priceRoot: ROOT_NOTHING_OFF_AT_PAIR });

    expect(required(editor, "replacement-sheet").textContent).toContain(
      TEXT.unnamedOptionUnavailable,
    );
    expect(editor.container.textContent).not.toContain(VANISHED_MATERIAL);
    expect(byTestId(editor, "price-bar-total")).toBeNull();
    press(required(editor, "replacement-choose"));
    expect(editor.container.querySelectorAll("[data-option]")).toHaveLength(3);
    expect(
      editor.container.querySelectorAll("[data-option][disabled]"),
    ).toHaveLength(0);
  });

  it("prices the kitchen once a tier is chosen", async () => {
    editor = await mountEditor({ priceRoot: ROOT_NOTHING_OFF_AT_PAIR });

    await chooseTier(editor, MELAMINE_NAME);

    expect(byTestId(editor, "price-bar-total")).not.toBeNull();
  });
});

describe("a kitchen the customer has already sent", () => {
  it("gets the same sheet, beside the sent-kitchen note", async () => {
    hydrate(carryingMdf());
    world = serveWorld({ notices: [notice({ isSent: true })] });

    editor = await mountEditor();

    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
    expect(byTestId(editor, "sent-kitchen-note")).not.toBeNull();
  });
});

describe("availability coming back before any choice", () => {
  it("opens no sheet on the next open and the price shows", async () => {
    hydrate(carryingMdf());
    world = serveWorld({ notices: [notice()] });

    editor = await mountEditor({ priceRoot: ROOT_NOTHING_OFF_AT_PAIR });

    expect(byTestId(editor, "replacement-sheet")).toBeNull();
    expect(byTestId(editor, "price-bar-total")).not.toBeNull();
  });
});
