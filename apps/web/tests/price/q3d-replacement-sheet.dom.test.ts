// @vitest-environment happy-dom
//
// M10 wave Q3d (frames C4A-C4D): the forced-replacement sheet, in the editor as it is mounted. The scene and the panel are
// stubbed; the price bar, the breakdown, the sheet and the notice hook are real, over a `fetch` that records every request
// and holds the design's save open until the test lets it land, so "no GET and no POST until the save has landed" is
// observed and not inferred.
import { tierRef, type Design } from "@lemnaria/configurator-domain";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
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

import {
  ConfigureScreen,
  type ConfigureScreenVariant,
} from "@/app/configurator/configure/configure-screen";
import { PriceBookProvider } from "@/price/price-book-provider";
import { NO_PRICE_BOOK, type PriceBookRoot } from "@/price/price-book-root";
import { useCameraPreset } from "@/scene/camera-preset-store";
import {
  useConfiguratorStore,
  type WriteAccess,
} from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import {
  kitchenCarrying,
  MATERIAL_DEFAULT_TIER_ID,
} from "../support/tier-offer-world";

/** A design id of its own per test: the store's save queue is a module singleton, and a hydrate for an id that still has an
 *  unsaved write queued adopts that write, which would carry one test's choice into the next. */
let designId = "";
let designsMade = 0;
const SWITCHED_OFF_MATERIAL = "material.painted-mdf";
const SWITCHED_OFF_HARDWARE = "hardware.premium";
const VANISHED_MATERIAL = "material.created-and-since-deleted";
const OTHER_MATERIAL = "material.veneer";
const OFF_PAIR = {
  versionId: SAMPLE_PRICE_ROOT.versionId,
  availabilityRevision: "1",
};
const TEXT = roMessages.replacementSheet;

/** The page's root once availability has come back: the same pair as the switched-off root, so a re-enable is a new open. */
const SAMPLE_PRICE_ROOT_AT_PAIR: PriceBookRoot = {
  ...SAMPLE_PRICE_ROOT,
  availability: { revision: "1", disabled: [] },
};
const ROOT_WITH_MDF_OFF: PriceBookRoot = {
  ...SAMPLE_PRICE_ROOT,
  availability: {
    revision: "1",
    disabled: [tierRef("material", SWITCHED_OFF_MATERIAL)],
  },
};
const ROOT_WITH_MDF_AND_PREMIUM_OFF: PriceBookRoot = {
  ...SAMPLE_PRICE_ROOT,
  availability: {
    revision: "1",
    disabled: [
      tierRef("material", SWITCHED_OFF_MATERIAL),
      tierRef("hardware", SWITCHED_OFF_HARDWARE),
    ],
  },
};

interface SentRequest {
  readonly method: string;
  readonly address: string;
  readonly body: unknown;
}

interface Server {
  readonly requests: SentRequest[];
  /** Lets the oldest held save land, at this revision. */
  readonly landSave: (revision: string) => Promise<void>;
  readonly landEverySave: () => Promise<void>;
}

let container: HTMLDivElement;
let root: Root;
let server: Server;

/** One notice answer per `GET`, in order; the last is repeated. Every `PUT` is held until `landSave`. */
function serveNotices(answers: readonly Record<string, unknown>[]): void {
  const requests: SentRequest[] = [];
  const heldSaves: ((revision: string) => void)[] = [];
  let noticesGiven = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((address: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({
        method,
        address,
        body: typeof init?.body === "string" ? safeParse(init.body) : undefined,
      });
      if (method === "PUT") {
        return new Promise<Response>((resolve) => {
          heldSaves.push((revision) => {
            resolve(jsonResponse({ id: designId, revision }));
          });
        });
      }
      if (method === "POST") {
        return Promise.resolve(jsonResponse({ acknowledged: OFF_PAIR }));
      }
      const answer = answers[Math.min(noticesGiven, answers.length - 1)];
      noticesGiven += 1;
      return Promise.resolve(jsonResponse(answer ?? {}));
    }),
  );
  server = {
    requests,
    landSave: async (revision) => {
      const land = heldSaves.shift();
      if (land === undefined) throw new Error("no save is waiting to land");
      land(revision);
      await settle();
    },
    landEverySave: async () => {
      for (const land of heldSaves.splice(0)) land("99");
      await Promise.resolve();
    },
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function notice(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: "active-version",
    isSent: false,
    current: OFF_PAIR,
    pricesChanged: false,
    replacementsRequired: [],
    removedAccessories: [],
    ...overrides,
  };
}

/** The save coalescer waits a second between saves on the clock. Only `Date` is faked by default, bumped past that second
 *  for every test, so a test's first save goes out at once; a test about the wait drives every timer itself. */
let isEveryTimerDriven = false;
let clockMs = Date.now();

function driveEveryTimerFromTheTest(): void {
  vi.useRealTimers();
  vi.useFakeTimers();
  vi.setSystemTime(clockMs);
  isEveryTimerDriven = true;
}

async function advanceClock(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) {
      if (isEveryTimerDriven) await vi.advanceTimersByTimeAsync(0);
      else await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function mountEditor({
  variant = "owner",
  priceRoot = ROOT_WITH_MDF_OFF,
}: {
  variant?: ConfigureScreenVariant;
  priceRoot?: PriceBookRoot;
} = {}): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(PriceBookProvider, {
        root: priceRoot,
        children: createElement(NextIntlClientProvider, {
          children: createElement(ConfigureScreen, { variant }),
          locale: "ro",
          messages: roMessages,
          timeZone: "Europe/Chisinau",
        }),
      }),
    );
  });
  await settle();
}

function hydrate(design: Design, canWrite: WriteAccess = true): void {
  useConfiguratorStore.getState().hydrate({
    design,
    designId,
    revision: "1",
    canWrite,
  });
}

const carryingMdf = (): Design =>
  kitchenCarrying({ materialTierId: SWITCHED_OFF_MATERIAL });

function byTestId(id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function required(id: string): HTMLElement {
  const found = byTestId(id);
  if (found === null) throw new Error(`nothing is drawn as ${id}`);
  return found;
}

function requiredButton(id: string): HTMLButtonElement {
  const found = required(id);
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`${id} is drawn, but not as a button`);
  }
  return found;
}

/** What the page calls a tier of the sample book: the book row through its message leaf, as the sheet reads it. */
function nameOf(tierId: string): string {
  const tier = [
    ...SAMPLE_PRICE_ROOT.book.material.tiers,
    ...SAMPLE_PRICE_ROOT.book.hardware.tiers,
  ].find((candidate) => candidate.tierId === tierId);
  if (tier === undefined) throw new Error(`the sample book has no ${tierId}`);
  return ro.bookText(tier.name, tier.nameKey);
}

const MELAMINE_NAME = nameOf(MATERIAL_DEFAULT_TIER_ID);
const HETTICH_NAME = nameOf("hardware.soft-close");
const say = createTranslator({ locale: "ro", messages: roMessages });

function press(element: HTMLElement): void {
  act(() => {
    element.click();
  });
}

/** Opens the chooser of the first row still owed, picks the option with this name and applies it. */
async function chooseTier(name: string): Promise<void> {
  const owed = container.querySelector<HTMLElement>(
    '[data-testid="replacement-row"][data-resolved="false"] [data-testid="replacement-choose"]',
  );
  if (owed === null) throw new Error("no row is owed a choice");
  press(owed);
  const option = [
    ...container.querySelectorAll<HTMLButtonElement>("[data-option]"),
  ].find((candidate) => candidate.textContent.includes(name));
  if (option === undefined) throw new Error(`the chooser offers no ${name}`);
  press(option);
  press(required("replacement-apply"));
  await settle();
}

function requestsOf(method: string): SentRequest[] {
  return server.requests.filter((request) => request.method === method);
}

beforeEach(() => {
  clockMs += 10_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clockMs);
  designsMade += 1;
  designId = `q3dsheetdesign${String(designsMade).padStart(7, "0")}`;
  useCameraPreset.setState({ presetId: "overview" });
});

afterEach(async () => {
  act(() => {
    root.unmount();
  });
  // The coalescer is one for the whole page and saves one at a time: a save left in flight would hold every later test's.
  await server.landEverySave();
  isEveryTimerDriven = false;
  container.remove();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useCameraPreset.setState({ presetId: "overview" });
});

describe("a saved kitchen that carries a tier availability has switched off (C4A)", () => {
  beforeEach(() => {
    hydrate(carryingMdf());
    serveNotices([notice()]);
  });

  it("opens as a modal dialog with focus on the first Alege, the row announced and nothing chosen", async () => {
    await mountEditor();

    const sheet = required("replacement-sheet");
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.textContent).toContain(TEXT.title);
    expect(document.activeElement).toBe(required("replacement-choose"));
    expect(
      sheet.querySelector('[role="group"]')?.getAttribute("aria-label"),
    ).toBe("MDF vopsit mat nu mai este disponibil");
    expect(sheet.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it("shows no figure anywhere: the bar says when the price comes, and the review control is off", async () => {
    await mountEditor();

    expect(required("price-bar-replacement-pending").textContent).toBe(
      TEXT.priceAfterChoosing,
    );
    expect(byTestId("price-bar-total")).toBeNull();
    expect(container.textContent).not.toMatch(/\d[\d\s]*\s?MDL/);
    const review = required("review-cta");
    expect(review.tagName).toBe("SPAN");
    expect(review.getAttribute("aria-disabled")).toBe("true");
  });

  it("makes the screen behind it inert, and can be left only by the ‹ it draws itself", async () => {
    await mountEditor();

    const behind = [...container.querySelectorAll("main > *")].filter(
      (band) => !band.contains(required("replacement-sheet")),
    );
    expect(behind.length).toBeGreaterThan(0);
    expect(behind.every((band) => band.hasAttribute("inert"))).toBe(true);
    expect(required("replacement-sheet-leave").getAttribute("href")).toMatch(
      /^\/.*/,
    );
  });

  it("does nothing on Escape and on a click outside it", async () => {
    await mountEditor();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    act(() => {
      container.querySelector<HTMLElement>("main")?.click();
    });

    expect(byTestId("replacement-sheet")).not.toBeNull();
  });

  it("asks before leaving when ‹ is pressed, as the top bar's own does", async () => {
    await mountEditor();

    press(required("replacement-sheet-leave"));

    expect(byTestId("back-confirm-dialog")).not.toBeNull();
    expect(byTestId("replacement-sheet")).not.toBeNull();
  });

  it("draws no C1 beside it, whatever the answer says", async () => {
    serveNotices([notice({ pricesChanged: true })]);

    await mountEditor();

    expect(byTestId("price-notice")).toBeNull();
  });

  it("names an accessory taken out as information only, with nothing to press", async () => {
    serveNotices([
      notice({
        replacementsRequired: [],
        removedAccessories: [{ accessoryId: "dishDryingRack" }],
      }),
    ]);

    await mountEditor();

    const rack = SAMPLE_PRICE_ROOT.book.accessories.dishDryingRack;
    expect(required("replacement-info").textContent).toBe(
      say("replacementSheet.accessoryRemoved", {
        name: ro.bookText(rack.name, rack.nameKey),
      }),
    );
    expect(required("replacement-info").querySelector("button")).toBeNull();
  });
});

describe("where the sheet's flow cannot complete, nothing opens and nothing flashes", () => {
  beforeEach(() => {
    serveNotices([notice()]);
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

      await mountEditor({
        ...(variant === undefined ? {} : { variant }),
        ...(priceRoot === undefined ? {} : { priceRoot }),
      });

      expect(byTestId("replacement-sheet")).toBeNull();
      expect(byTestId("price-bar-replacement-pending")).toBeNull();
      expect(byTestId("price-bar")).toBeNull();
      expect(
        byTestId("review-cta")?.getAttribute("aria-disabled") ?? null,
      ).toBeNull();
      expect(requestsOf("GET")).toEqual([]);
    },
  );
});

describe("choosing a replacement (C4B)", () => {
  beforeEach(() => {
    hydrate(carryingMdf());
  });

  it("offers only the remaining options, the kitchen's own tier struck and unselectable, and the apply control off until a pick", async () => {
    serveNotices([notice()]);
    await mountEditor();

    press(required("replacement-choose"));

    const options = [
      ...container.querySelectorAll<HTMLButtonElement>("[data-option]"),
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
    expect(requiredButton("replacement-apply").disabled).toBe(true);
    expect(container.textContent).toContain(TEXT.priceAfterApplying);

    const [firstRemaining] = options;
    if (firstRemaining === undefined) throw new Error("no option is offered");
    press(firstRemaining);

    expect(requiredButton("replacement-apply").disabled).toBe(false);
  });

  it("goes back to the list without writing anything", async () => {
    serveNotices([notice()]);
    await mountEditor();
    press(required("replacement-choose"));

    press(required("replacement-chooser-back"));

    expect(byTestId("replacement-choose")).not.toBeNull();
    expect(
      useConfiguratorStore.getState().design.settings?.materialTierId,
    ).toBe(SWITCHED_OFF_MATERIAL);
    expect(requestsOf("PUT")).toEqual([]);
  });
});

describe("after the last choice (C4C, Q3-b, Q3-c)", () => {
  beforeEach(() => {
    hydrate(carryingMdf());
  });

  it("shows the price at once and sends no GET and no POST while the save is in flight", async () => {
    serveNotices([notice(), notice({ pricesChanged: true })]);
    await mountEditor();

    await chooseTier(MELAMINE_NAME);

    expect(byTestId("replacement-sheet")).toBeNull();
    expect(byTestId("price-bar-total")).not.toBeNull();
    expect(
      useConfiguratorStore.getState().design.settings?.materialTierId,
    ).toBe(MATERIAL_DEFAULT_TIER_ID);
    expect(requestsOf("PUT")).toHaveLength(1);
    expect(requestsOf("GET")).toHaveLength(1);
    expect(requestsOf("POST")).toEqual([]);
    expect(byTestId("replacement-confirmation")).toBeNull();
  });

  it("asks again only once the save has landed, carries the prices sentence when that answer says so, then acknowledges the displayed pair", async () => {
    serveNotices([notice(), notice({ pricesChanged: true })]);
    await mountEditor();
    await chooseTier(MELAMINE_NAME);

    await server.landSave("2");

    expect(requestsOf("GET")).toHaveLength(2);
    const lines = required("replacement-confirmation").textContent;
    expect(lines).toContain(
      say("replacementSheet.changedMaterial", { name: MELAMINE_NAME }),
    );
    expect(lines).toContain(roMessages.customerPriceNotice.alsoUpdated);
    expect(requestsOf("POST")).toEqual([
      expect.objectContaining({ body: OFF_PAIR }),
    ]);
    expect(byTestId("price-notice")).toBeNull();
  });

  it("carries no prices sentence when the second answer says the prices did not move", async () => {
    serveNotices([
      notice({ pricesChanged: true }),
      notice({ pricesChanged: false }),
    ]);
    await mountEditor();
    await chooseTier(MELAMINE_NAME);

    await server.landSave("2");

    const lines = required("replacement-confirmation").textContent;
    expect(lines).toContain(
      say("replacementSheet.changedMaterial", { name: MELAMINE_NAME }),
    );
    expect(lines).not.toContain(roMessages.customerPriceNotice.alsoUpdated);
    expect(requestsOf("POST")).toHaveLength(1);
  });

  it("follows the second answer and not the first when the two disagree", async () => {
    serveNotices([
      notice({ pricesChanged: false }),
      notice({ pricesChanged: true }),
    ]);
    await mountEditor();
    await chooseTier(MELAMINE_NAME);

    await server.landSave("2");

    expect(required("replacement-confirmation").textContent).toContain(
      roMessages.customerPriceNotice.alsoUpdated,
    );
  });

  it("acknowledges nothing and says no prices sentence on a stale page: the second answer is for another pair", async () => {
    const newerPair = { ...OFF_PAIR, availabilityRevision: "2" };
    serveNotices([
      notice(),
      notice({ current: newerPair, pricesChanged: true }),
    ]);
    await mountEditor();
    await chooseTier(MELAMINE_NAME);

    await server.landSave("2");

    expect(required("replacement-confirmation").textContent).not.toContain(
      roMessages.customerPriceNotice.alsoUpdated,
    );
    expect(requestsOf("POST")).toEqual([]);
  });

  it("writes no marker when the second answer still owes a replacement", async () => {
    serveNotices([
      notice(),
      notice({
        replacementsRequired: [
          { item: { kind: "material", tierId: OTHER_MATERIAL }, remaining: [] },
        ],
      }),
    ]);
    await mountEditor();
    await chooseTier(MELAMINE_NAME);

    await server.landSave("2");

    expect(requestsOf("POST")).toEqual([]);
  });

  it("never asks again when the save never lands", async () => {
    serveNotices([notice(), notice({ pricesChanged: true })]);
    await mountEditor();
    await chooseTier(MELAMINE_NAME);

    await settle();
    await settle();

    expect(requestsOf("GET")).toHaveLength(1);
    expect(requestsOf("POST")).toEqual([]);
    expect(byTestId("replacement-confirmation")).toBeNull();
  });

  it("goes by itself after a while, and the review control is live again", async () => {
    driveEveryTimerFromTheTest();
    serveNotices([notice(), notice()]);
    await mountEditor();
    await chooseTier(MELAMINE_NAME);
    await server.landSave("2");
    expect(byTestId("replacement-confirmation")).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_001);
    });

    expect(byTestId("replacement-confirmation")).toBeNull();
    expect(byTestId("review-cta")?.tagName).toBe("A");
  });
});

describe("several rows at once (C4D)", () => {
  beforeEach(() => {
    hydrate(
      kitchenCarrying({
        materialTierId: SWITCHED_OFF_MATERIAL,
        hardwareTierId: SWITCHED_OFF_HARDWARE,
      }),
    );
  });

  it("resolves rows one by one, keeps the resolved one drawn with the change label, and shows the price only when all are chosen", async () => {
    serveNotices([notice(), notice()]);
    await mountEditor({ priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF });
    expect(
      container.querySelectorAll('[data-testid="replacement-row"]'),
    ).toHaveLength(2);

    await chooseTier(MELAMINE_NAME);

    const rows = [
      ...container.querySelectorAll('[data-testid="replacement-row"]'),
    ];
    expect(rows.map((row) => row.getAttribute("data-resolved"))).toEqual([
      "true",
      "false",
    ]);
    expect(rows[0]?.textContent).toContain(MELAMINE_NAME);
    expect(rows[0]?.textContent).toContain(TEXT.change);
    expect(byTestId("price-bar-total")).toBeNull();
    expect(required("price-bar-replacement-pending")).not.toBeNull();
  });

  it("does not ask again when the first save lands while the last choice is still queued behind it", async () => {
    driveEveryTimerFromTheTest();
    serveNotices([notice(), notice({ pricesChanged: true })]);
    await mountEditor({ priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF });
    await chooseTier(MELAMINE_NAME);
    // The second choice is made while the first save is in flight, so it waits behind it.
    await chooseTier(HETTICH_NAME);
    expect(requestsOf("PUT")).toHaveLength(1);

    await server.landSave("2");

    // The revision has moved, and the design on screen is still not the one the server holds: the second choice waits
    // behind the coalescer's one-save-a-second interval, where `saveStatus` already reads idle.
    expect(useConfiguratorStore.getState().revision).toBe("2");
    expect(useConfiguratorStore.getState().saveStatus).toBe("idle");
    expect(requestsOf("PUT")).toHaveLength(1);
    expect(requestsOf("GET")).toHaveLength(1);
    expect(requestsOf("POST")).toEqual([]);

    await advanceClock(1_000);
    expect(requestsOf("PUT")).toHaveLength(2);
    expect(requestsOf("GET")).toHaveLength(1);
    expect(requestsOf("POST")).toEqual([]);

    await server.landSave("3");
    expect(requestsOf("GET")).toHaveLength(2);
    expect(requestsOf("POST")).toHaveLength(1);
    expect(required("replacement-confirmation").textContent).toContain(
      roMessages.customerPriceNotice.alsoUpdated,
    );
  });
});

describe("a tier the book no longer holds (Q3-g, ruling 2)", () => {
  beforeEach(() => {
    hydrate(kitchenCarrying({ materialTierId: VANISHED_MATERIAL }));
    serveNotices([notice(), notice({ pricesChanged: true })]);
  });

  it("shows the generic line and never the id, offers the active tiers, and no figure shows", async () => {
    await mountEditor({ priceRoot: SAMPLE_PRICE_ROOT_AT_PAIR });

    expect(required("replacement-sheet").textContent).toContain(
      TEXT.unnamedOptionUnavailable,
    );
    expect(container.textContent).not.toContain(VANISHED_MATERIAL);
    expect(byTestId("price-bar-total")).toBeNull();
    press(required("replacement-choose"));
    expect(container.querySelectorAll("[data-option]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-option][disabled]")).toHaveLength(
      0,
    );
  });

  it("prices the kitchen once a tier is chosen", async () => {
    await mountEditor({ priceRoot: SAMPLE_PRICE_ROOT_AT_PAIR });

    await chooseTier(MELAMINE_NAME);

    expect(byTestId("price-bar-total")).not.toBeNull();
  });
});

describe("a kitchen the customer has already sent (Q3-d)", () => {
  it("gets the same sheet, beside the sent-kitchen note", async () => {
    hydrate(carryingMdf());
    serveNotices([notice({ isSent: true })]);

    await mountEditor();

    expect(byTestId("replacement-sheet")).not.toBeNull();
    expect(byTestId("sent-kitchen-note")).not.toBeNull();
  });
});

describe("availability coming back before any choice (Q3-e)", () => {
  it("opens no sheet on the next open and the price shows", async () => {
    hydrate(carryingMdf());
    serveNotices([notice()]);

    await mountEditor({ priceRoot: SAMPLE_PRICE_ROOT_AT_PAIR });

    expect(byTestId("replacement-sheet")).toBeNull();
    expect(byTestId("price-bar-total")).not.toBeNull();
  });
});
