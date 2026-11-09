// @vitest-environment happy-dom
//
// A colour or a handle owed in the replacement sheet is chosen there (A-16): the lone row opens the sheet and has its own
// chooser, one press is one commit and one save, no level of the design names the switched-off item afterwards, and C4C says
// what changed per item. A colour waits behind a material row, and the reset the material change causes is announced only when
// it rewrote a stored colour, the kitchen's included.
import {
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
  type ItemRef,
} from "@lemnaria/configurator-domain";
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

import type { PriceBookRoot } from "@/price/price-book-root";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import { ro } from "../support/romanian-content";
import {
  beginTest,
  advanceClock,
  byTestId,
  chooseTier,
  driveEveryTimerFromTheTest,
  endTest,
  hydrate,
  mountEditor,
  notice,
  present,
  press,
  required,
  requestsOf,
  serveWorld,
  settle,
  type Editor,
  type World,
} from "../support/replacement-sheet-world";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { tierName } from "../support/tier-offer-world";

const TEXT = roMessages.replacementSheet;
/** The closing sentence every "changed to {name}" leaf carries, read from the leaf so no wording is written here. */
const SENTENCE =
  roMessages.replacementSheet.changedMaterial.split("{name}. ")[1] ?? "";

type ChangedLeaf =
  | "changedMaterial"
  | "changedHardware"
  | "changedColour"
  | "changedHandle";

/** What a change says in its leaf's own words: with the closing sentence, or without it. */
function full(leaf: ChangedLeaf, name: string): string {
  return replaceName(roMessages.replacementSheet[leaf], name);
}
function stem(leaf: ChangedLeaf, name: string): string {
  return full(leaf, name).replace(` ${SENTENCE}`, "");
}
function reverted(colour: string): string {
  return replaceName(roMessages.replacementSheet.colourReverted, colour);
}
function replaceName(leaf: string, name: string): string {
  return leaf.replace(/\{(name|colour)\}/, name);
}
const WHITE = paletteFinish("pal.alb");
const ANTHRACITE = paletteFinish("pal.antracit");
const BLACK_OFF: ItemRef = { kind: "handle", handle: "black" };
const WHITE_OFF: ItemRef = { kind: "finish", finishId: "pal.alb" };
const ANTHRACITE_OFF: ItemRef = { kind: "finish", finishId: "pal.antracit" };

function rootSwitchingOff(...items: readonly ItemRef[]): PriceBookRoot {
  return {
    ...SAMPLE_PRICE_ROOT,
    availability: { revision: "1", disabled: items },
  };
}

function kitchenWith(settings: NonNullable<Design["settings"]>): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, ...settings },
  };
}

/** The sample kitchen with its first cabinets given colours or handles of their own. */
function withCabinets(
  design: Design,
  bodies: readonly Partial<Design["placements"][number]["body"]>[],
): Design {
  return {
    ...design,
    placements: design.placements.map((placement, index) => {
      const own = bodies[index];
      return own === undefined
        ? placement
        : { ...placement, body: { ...placement.body, ...own } };
    }),
  };
}

beforeEach(() => {
  beginTest();
  driveEveryTimerFromTheTest();
});

afterEach(async () => {
  await endTest();
});

function rowsOf(editor: Editor): HTMLElement[] {
  return [
    ...editor.container.querySelectorAll<HTMLElement>(
      '[data-testid="replacement-row"]',
    ),
  ];
}

function confirmationLines(editor: Editor): string[] {
  return [
    ...editor.container.querySelectorAll(
      '[data-testid="replacement-confirmation"] span',
    ),
  ].map((line) => line.textContent);
}

function optionNamed(editor: Editor, name: string): HTMLButtonElement {
  const found = [
    ...editor.container.querySelectorAll<HTMLButtonElement>("[data-option]"),
  ].find((option) => option.textContent.includes(name));
  return present(found, `the option ${name}`);
}

/** Chooses the option with this name for the first row still owed, and applies it without landing the save. */
function chooseOption(editor: Editor, name: string): void {
  press(
    present(
      editor.container.querySelector<HTMLElement>(
        '[data-testid="replacement-row"][data-resolved="false"] [data-testid="replacement-choose"]',
      ),
      "a row with a control",
    ),
  );
  press(optionNamed(editor, name));
  press(required(editor, "replacement-apply"));
}

/** Lands the saves the page makes, however many the coalescer spaces out, each at a revision of its own, and stops as
 *  soon as the confirmation shows: it goes by itself after a few seconds, so the clock must not run on past it. */
async function landSavesUntilConfirmed(
  editor: Editor,
  world: World,
): Promise<void> {
  let revision = 2;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await advanceClock(1_000);
    while (world.savesWaiting() > 0) {
      await world.landSave(String(revision));
      revision += 1;
    }
    if (byTestId(editor, "replacement-confirmation") !== null) return;
  }
  throw new Error("no confirmation was shown once the saves had landed");
}

describe("a lone switched-off colour", () => {
  let editor: Editor;
  let world: World;
  beforeEach(async () => {
    world = serveWorld({
      notices: [notice(), notice({ pricesChanged: false })],
    });
    hydrate(
      withCabinets(kitchenWith({ finish: WHITE }), [
        { finish: ANTHRACITE },
        { finish: WHITE },
      ]),
    );
    editor = await mountEditor({ priceRoot: rootSwitchingOff(WHITE_OFF) });
  });

  it("opens the sheet with a control to choose, so the back link is not the only way on", () => {
    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
    expect(rowsOf(editor)).toHaveLength(1);
    expect(byTestId(editor, "replacement-choose")).not.toBeNull();
  });

  it("opens a chooser of the active colours only, focused on its first, nothing chosen, with the kitchen's own struck", () => {
    press(required(editor, "replacement-choose"));

    const options = [
      ...editor.container.querySelectorAll<HTMLButtonElement>("[data-option]"),
    ];
    const offered = options.filter((option) => !option.disabled);
    expect(required(editor, "replacement-sheet").textContent).toContain(
      ro.globalSettings.colourHeading,
    );
    expect(
      offered.some((option) =>
        option.textContent.includes(ro.finishName("pal.alb")),
      ),
    ).toBe(false);
    expect(document.activeElement).toBe(offered[0]);
    expect(offered.every((option) => option.dataset.selected === "false")).toBe(
      true,
    );
    const struck = present(options.at(-1), "the struck option");
    expect(struck.disabled).toBe(true);
    expect(struck.getAttribute("aria-pressed")).toBeNull();
    expect(struck.textContent).toContain(ro.finishName("pal.alb"));
    expect(required(editor, "replacement-apply")).toHaveProperty(
      "disabled",
      true,
    );
    expect(required(editor, "replacement-sheet").textContent).not.toContain(
      TEXT.chooserAppliesTo.slice(0, 9),
    );
  });

  it("is one commit and one save, replaces the colour at every level, and moves no other colour", async () => {
    chooseOption(editor, ro.finishName("pal.gri-havanna"));

    const { design } = useConfiguratorStore.getState();
    expect(JSON.stringify(design)).not.toContain("pal.alb");
    expect(design.settings?.finish).toEqual(paletteFinish("pal.gri-havanna"));
    expect(design.placements[0]?.body.finish).toEqual(ANTHRACITE);
    expect(design.placements[1]?.body.finish).toEqual(
      paletteFinish("pal.gri-havanna"),
    );
    await settle();
    expect(world.savesWaiting()).toBe(1);
    expect(byTestId(editor, "price-bar-total")).not.toBeNull();
    expect(requestsOf(world, "GET")).toHaveLength(1);
    expect(requestsOf(world, "POST")).toEqual([]);

    await landSavesUntilConfirmed(editor, world);

    expect(requestsOf(world, "PUT")).toHaveLength(1);
    expect(requestsOf(world, "GET")).toHaveLength(2);
    expect(requestsOf(world, "POST")).toHaveLength(1);
    expect(byTestId(editor, "replacement-sheet")).toBeNull();
    expect(byTestId(editor, "price-bar-total")).not.toBeNull();
    expect(confirmationLines(editor)).toEqual([
      full("changedColour", ro.finishName("pal.gri-havanna")),
    ]);
  });
});

describe("a lone switched-off handle", () => {
  it("is chosen in the sheet, replaced at every level it is stored, and confirmed by its own leaf", async () => {
    const world = serveWorld({ notices: [notice(), notice()] });
    hydrate(
      withCabinets(kitchenWith({ handle: "black", topRowHandle: "black" }), [
        { handle: "black" },
        { handle: "steel" },
      ]),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(BLACK_OFF),
    });
    expect(byTestId(editor, "replacement-choose")).not.toBeNull();

    chooseOption(editor, ro.panel.handleLabels.push);
    await landSavesUntilConfirmed(editor, world);

    const { design } = useConfiguratorStore.getState();
    expect(design.settings).toMatchObject({
      handle: "push",
      topRowHandle: "push",
    });
    expect(
      design.placements.slice(0, 2).map((placement) => placement.body.handle),
    ).toEqual(["push", "steel"]);
    expect(requestsOf(world, "PUT")).toHaveLength(1);
    expect(requestsOf(world, "POST")).toHaveLength(1);
    expect(confirmationLines(editor)).toEqual([
      full("changedHandle", ro.panel.handleLabels.push),
    ]);
  });
});

describe("a switched-off colour beside a switched-off material", () => {
  const veneerKitchen = kitchenWith({
    materialTierId: "material.veneer",
    finish: paletteFinish("veneer.stejar"),
  });
  const owed = [
    { kind: "material", tierId: "material.veneer" } as const,
    { kind: "finish", finishId: "veneer.stejar" } as const,
  ];
  /** A hardware row owed as well, so the sheet stays open after the material is chosen. */
  const veneerKitchenOnPremiumHardware = {
    ...veneerKitchen,
    settings: { ...veneerKitchen.settings, hardwareTierId: "hardware.premium" },
  };
  const owedWithHardware = [
    ...owed,
    { kind: "hardware", tierId: "hardware.premium" } as const,
  ];

  it("waits: only the material has a control until it is chosen", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(veneerKitchen);
    const editor = await mountEditor({ priceRoot: rootSwitchingOff(...owed) });

    const [material, colour] = rowsOf(editor);

    expect(
      material?.querySelector('[data-testid="replacement-choose"]'),
    ).not.toBeNull();
    expect(
      colour?.querySelector('[data-testid="replacement-choose"]'),
    ).toBeNull();
  });

  it("shows the colour row resolved by the material change, naming the colour it returned to, and announces the reset after the material line", async () => {
    const world = serveWorld({ notices: [notice(), notice()] });
    hydrate(veneerKitchenOnPremiumHardware);
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(...owedWithHardware),
    });

    await chooseTier(editor, tierName("material.melamine"));
    const rows = rowsOf(editor);

    expect(rows.map((row) => row.dataset.resolved)).toEqual([
      "true",
      "false",
      "true",
    ]);
    expect(rows[2]?.textContent).toContain(ro.finishName("pal.alb"));
    expect(
      rows[2]?.querySelector('[data-testid="replacement-choose"]'),
    ).toBeNull();
    await chooseTier(editor, tierName("hardware.standard"));
    await landSavesUntilConfirmed(editor, world);
    expect(confirmationLines(editor)).toEqual([
      stem("changedMaterial", tierName("material.melamine")),
      reverted(ro.finishName("pal.alb")),
      full("changedHardware", tierName("hardware.standard")),
    ]);
  });

  it("says no reset when the kitchen stored no colour, which repaints without a word", async () => {
    const world = serveWorld({ notices: [notice(), notice()] });
    hydrate(kitchenWith({ materialTierId: "material.veneer" }));
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff({
        kind: "material",
        tierId: "material.veneer",
      }),
    });

    await chooseTier(editor, tierName("material.melamine"));
    await landSavesUntilConfirmed(editor, world);

    expect(confirmationLines(editor)).toEqual([
      full("changedMaterial", tierName("material.melamine")),
    ]);
  });

  it("asks no confirmation before the material apply: the one dialog stays the sheet", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(veneerKitchenOnPremiumHardware);
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(...owedWithHardware),
    });

    await chooseTier(editor, tierName("material.melamine"));

    expect(
      useConfiguratorStore.getState().design.settings?.materialTierId,
    ).toBe("material.melamine");
    expect(editor.container.querySelectorAll('[role="dialog"]')).toHaveLength(
      1,
    );
    expect(byTestId(editor, "back-confirm-dialog")).toBeNull();
  });
});

describe("two switched-off colours, the kitchen's and a cabinet's own", () => {
  it("give two rows, two choices and two lines, each row naming its own replacement, the price sentence said once", async () => {
    const world = serveWorld({ notices: [notice(), notice()] });
    hydrate(
      withCabinets(kitchenWith({ finish: WHITE }), [{ finish: ANTHRACITE }]),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(WHITE_OFF, ANTHRACITE_OFF),
    });
    expect(rowsOf(editor)).toHaveLength(2);

    chooseOption(editor, ro.finishName("pal.stejar-halifax"));
    expect(rowsOf(editor).map((row) => row.dataset.resolved)).toEqual([
      "true",
      "false",
    ]);
    chooseOption(editor, ro.finishName("pal.nuc-warmia"));
    await landSavesUntilConfirmed(editor, world);

    const { design } = useConfiguratorStore.getState();
    expect(design.settings?.finish).toEqual(
      paletteFinish("pal.stejar-halifax"),
    );
    expect(design.placements[0]?.body.finish).toEqual(
      paletteFinish("pal.nuc-warmia"),
    );
    const lines = confirmationLines(editor);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      stem("changedColour", ro.finishName("pal.stejar-halifax")),
    );
    expect(lines[1]).toBe(
      full("changedColour", ro.finishName("pal.nuc-warmia")),
    );
  });

  it("names each resolved row by its own replacement while the other is still owed", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(
      withCabinets(kitchenWith({ finish: WHITE }), [{ finish: ANTHRACITE }]),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(WHITE_OFF, ANTHRACITE_OFF),
    });

    chooseOption(editor, ro.finishName("pal.stejar-halifax"));

    const [resolved] = rowsOf(editor);
    expect(resolved?.textContent).toContain(
      ro.finishName("pal.stejar-halifax"),
    );
    expect(
      resolved?.querySelector('[data-testid="replacement-choose"]'),
    ).toBeNull();
  });
});
