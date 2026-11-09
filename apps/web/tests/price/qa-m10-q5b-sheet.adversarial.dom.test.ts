// @vitest-environment happy-dom
//
// Q5b's adversarial pass over the mounted sheet: a lone colour and a lone handle through the save-landed rule, the colour that
// waits, the reset line in each arm of its rule (global colour only, a cabinet's only, none stored, offered by the new
// material), two and three colours at once, and what is drawn (no id, a first option that is not a selection, no button on a
// resolved colour).
import {
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
  type ItemRef,
} from "@lemnaria/configurator-domain";
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

import type { PriceBookRoot } from "@/price/price-book-root";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import { ro } from "../support/romanian-content";
import {
  advanceClock,
  beginTest,
  byTestId,
  chooseTier,
  driveEveryTimerFromTheTest,
  endTest,
  hydrate,
  mountEditor,
  notice,
  present,
  press,
  recoverTheSaveQueue,
  rerenderUnder,
  required,
  requestsOf,
  ROOT_NOTHING_OFF_AT_PAIR,
  serveWorld,
  settle,
  type Editor,
  type World,
} from "../support/replacement-sheet-world";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { tierName } from "../support/tier-offer-world";

const SENTENCE =
  roMessages.replacementSheet.changedMaterial.split("{name}. ")[1] ?? "";
const WHITE = paletteFinish("pal.alb");
const ANTHRACITE = paletteFinish("pal.antracit");
const HAVANNA = paletteFinish("pal.gri-havanna");
const VENEER_OAK = paletteFinish("veneer.stejar");
const BLACK_OFF: ItemRef = { kind: "handle", handle: "black" };
const WHITE_OFF: ItemRef = { kind: "finish", finishId: "pal.alb" };
const ANTHRACITE_OFF: ItemRef = { kind: "finish", finishId: "pal.antracit" };
const HAVANNA_OFF: ItemRef = { kind: "finish", finishId: "pal.gri-havanna" };
const VENEER_OFF: ItemRef = { kind: "material", tierId: "material.veneer" };
const VANISHED_MATERIAL = "material.created-and-since-deleted";

type ChangedLeaf =
  | "changedMaterial"
  | "changedHardware"
  | "changedColour"
  | "changedHandle";
function full(leaf: ChangedLeaf, name: string): string {
  return roMessages.replacementSheet[leaf].replace("{name}", name);
}
function stem(leaf: ChangedLeaf, name: string): string {
  return full(leaf, name).replace(` ${SENTENCE}`, "");
}
function reverted(colour: string): string {
  return roMessages.replacementSheet.colourReverted.replace("{colour}", colour);
}

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
  vi.restoreAllMocks();
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

/** The row about this kind of thing, by the label the screen draws on it, whatever order the domain lists the rows in. */
function rowAbout(editor: Editor, kindLabel: string): HTMLElement | undefined {
  return rowsOf(editor).find((row) => row.textContent.includes(kindLabel));
}

function controlOf(row: HTMLElement | undefined): HTMLElement | null {
  return row?.querySelector('[data-testid="replacement-choose"]') ?? null;
}

/** Opens the chooser of this row, picks the option with this name and applies it, without landing the save. */
function chooseInRow(
  row: HTMLElement | undefined,
  editor: Editor,
  name: string,
): void {
  press(present(controlOf(row), "the row's control"));
  press(optionNamed(editor, name));
  press(required(editor, "replacement-apply"));
}

function chooseOption(editor: Editor, name: string): void {
  const owed = rowsOf(editor).find(
    (row) => row.dataset.resolved === "false" && controlOf(row) !== null,
  );
  chooseInRow(owed, editor, name);
}

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

const LONE_ROWS = [
  {
    name: "colour",
    design: () =>
      withCabinets(kitchenWith({ finish: WHITE }), [{ finish: WHITE }]),
    owed: WHITE_OFF,
    pick: () => ro.finishName("pal.gri-havanna"),
    leaf: "changedColour",
  },
  {
    name: "handle",
    design: () => kitchenWith({ handle: "black" }),
    owed: BLACK_OFF,
    pick: () => ro.panel.handleLabels.push,
    leaf: "changedHandle",
  },
] as const;

describe.each(LONE_ROWS)(
  "a lone $name row through the save-landed rule",
  ({ design, owed, pick, leaf }) => {
    async function open(notices: Parameters<typeof serveWorld>[0]["notices"]) {
      const world = serveWorld({ notices });
      hydrate(design());
      const editor = await mountEditor({ priceRoot: rootSwitchingOff(owed) });
      chooseOption(editor, pick());
      await settle();
      return { editor, world };
    }

    it("shows the price at once and asks and writes nothing until the save lands (the price is the store's, the second GET and the marker are the save's)", async () => {
      const { editor, world } = await open([notice(), notice()]);

      expect(byTestId(editor, "price-bar-total")).not.toBeNull();
      expect(byTestId(editor, "replacement-confirmation")).toBeNull();
      expect(requestsOf(world, "GET")).toHaveLength(1);
      expect(requestsOf(world, "POST")).toEqual([]);

      await landSavesUntilConfirmed(editor, world);

      expect(requestsOf(world, "GET")).toHaveLength(2);
      expect(requestsOf(world, "POST")).toHaveLength(1);
      expect(confirmationLines(editor)).toEqual([full(leaf, pick())]);
    });

    it.each([409, 500, 429, 503])(
      "a save answered %i sends no GET and no POST",
      async (status) => {
        const { editor, world } = await open([
          notice(),
          notice({ pricesChanged: true }),
        ]);

        await world.refuseSave(status);
        await advanceClock(500);

        expect(requestsOf(world, "GET")).toHaveLength(1);
        expect(requestsOf(world, "POST")).toEqual([]);
        expect(byTestId(editor, "replacement-confirmation")).toBeNull();
        await recoverTheSaveQueue(world);
      },
    );

    it("a save the network drops sends no GET and no POST", async () => {
      const { editor, world } = await open([notice(), notice()]);

      await world.dropSave();
      await advanceClock(500);

      expect(requestsOf(world, "GET")).toHaveLength(1);
      expect(requestsOf(world, "POST")).toEqual([]);
      expect(byTestId(editor, "replacement-confirmation")).toBeNull();
      await recoverTheSaveQueue(world);
    });

    it("an unrelated edit made while the choice's save is in flight holds the GET until that edit's own save has landed", async () => {
      const { editor, world } = await open([
        notice(),
        notice({ pricesChanged: true }),
      ]);
      act(() => {
        useConfiguratorStore.getState().applyWholeKitchenSettings({
          cabinetDepthMm: undefined,
          hardwareTierId: "hardware.soft-close",
          availableMaterialTierIds: [],
          availableHardwareTierIds: ["hardware.soft-close"],
        });
      });
      const { design: edited, savedDesign } = useConfiguratorStore.getState();
      expect(edited).not.toBe(savedDesign);

      await world.landSave("2");

      expect(requestsOf(world, "GET")).toHaveLength(1);
      expect(requestsOf(world, "POST")).toEqual([]);
      expect(byTestId(editor, "replacement-confirmation")).toBeNull();

      await advanceClock(1_000);
      await world.landSave("3");

      expect(requestsOf(world, "GET")).toHaveLength(2);
      expect(requestsOf(world, "POST")).toHaveLength(1);
    });

    it("a revision that moved with a design on screen that is not the saved one sends no GET (SIMULATED: the design half)", async () => {
      const { world } = await open([notice(), notice()]);

      act(() => {
        useConfiguratorStore.getState().applySaved({
          id: useConfiguratorStore.getState().designId as never,
          revision: "2" as never,
        });
      });
      await settle();

      expect(useConfiguratorStore.getState().design).not.toBe(
        useConfiguratorStore.getState().savedDesign,
      );
      expect(requestsOf(world, "GET")).toHaveLength(1);
      expect(requestsOf(world, "POST")).toEqual([]);
    });

    it("pressed twice in one breath, Apply commits and saves once", async () => {
      const world = serveWorld({ notices: [notice(), notice()] });
      hydrate(design());
      const editor = await mountEditor({ priceRoot: rootSwitchingOff(owed) });
      press(required(editor, "replacement-choose"));
      press(optionNamed(editor, pick()));
      const apply = required(editor, "replacement-apply");

      press(apply);
      press(apply);
      await landSavesUntilConfirmed(editor, world);

      expect(requestsOf(world, "PUT")).toHaveLength(1);
      expect(requestsOf(world, "POST")).toHaveLength(1);
      expect(confirmationLines(editor)).toEqual([full(leaf, pick())]);
    });
  },
);

describe("the chooser as the customer meets it", () => {
  async function openLoneColour(): Promise<Editor> {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(
      withCabinets(kitchenWith({ finish: WHITE }), [{ finish: ANTHRACITE }]),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(WHITE_OFF),
    });
    press(required(editor, "replacement-choose"));
    return editor;
  }

  it("focuses its first enabled option, which is not selected, with the struck option disabled and unannounced as pressed", async () => {
    const editor = await openLoneColour();
    const options = [
      ...editor.container.querySelectorAll<HTMLButtonElement>("[data-option]"),
    ];
    const [first] = options.filter((option) => !option.disabled);

    expect(document.activeElement).toBe(first);
    expect(first?.getAttribute("aria-pressed")).toBe("false");
    expect(first?.dataset.selected).toBe("false");
    const struck = present(
      options.find((option) => option.disabled),
      "the struck option",
    );
    expect(struck.dataset.struck).toBe("true");
    expect(struck.dataset.selected).toBe("false");
    expect(struck.getAttribute("aria-pressed")).toBeNull();

    // A click on the struck one chooses nothing, and Aplică stays off.
    act(() => {
      struck.click();
    });
    expect(required(editor, "replacement-apply")).toHaveProperty(
      "disabled",
      true,
    );
    expect(options.every((option) => option.dataset.selected === "false")).toBe(
      true,
    );
  });

  it("selects exactly the picked option, and moving the pick moves the selection (one at a time)", async () => {
    const editor = await openLoneColour();

    press(optionNamed(editor, ro.finishName("pal.gri-havanna")));
    press(optionNamed(editor, ro.finishName("pal.nuc-warmia")));

    const selected = [
      ...editor.container.querySelectorAll<HTMLButtonElement>(
        '[data-option][data-selected="true"]',
      ),
    ];
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain(ro.finishName("pal.nuc-warmia"));
    expect(required(editor, "replacement-apply")).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("draws a swatch on each colour option and none on a handle chooser's", async () => {
    const colours = await openLoneColour();
    expect(
      colours.container.querySelectorAll("[data-option] [data-wood]").length,
    ).toBeGreaterThan(0);
  });

  it("draws no swatch for a handle", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(kitchenWith({ handle: "black" }));
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(BLACK_OFF),
    });
    press(required(editor, "replacement-choose"));

    expect(
      editor.container.querySelectorAll("[data-option]").length,
    ).toBeGreaterThan(1);
    expect(
      editor.container.querySelectorAll("[data-option] [data-wood]"),
    ).toHaveLength(0);
  });

  it("Cancel goes back to the list with the row still owed and nothing changed", async () => {
    const editor = await openLoneColour();
    const before = useConfiguratorStore.getState().design;
    press(optionNamed(editor, ro.finishName("pal.gri-havanna")));

    press(required(editor, "replacement-chooser-back"));

    expect(useConfiguratorStore.getState().design).toBe(before);
    expect(rowsOf(editor)).toHaveLength(1);
    expect(rowsOf(editor)[0]?.dataset.resolved).toBe("false");
    expect(controlOf(rowsOf(editor)[0])).not.toBeNull();
  });
});

describe("a colour row that waits behind a material row", () => {
  const veneerKitchen = kitchenWith({
    materialTierId: "material.veneer",
    finish: VENEER_OAK,
    hardwareTierId: "hardware.premium",
  });
  const owedRows = [
    VENEER_OFF,
    { kind: "finish", finishId: "veneer.stejar" } as const,
    { kind: "hardware", tierId: "hardware.premium" } as const,
  ];

  it("has no control while the material is owed, keeps the sheet open on the material's, and focuses the material's button", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(veneerKitchen);
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(...owedRows),
    });

    const material = rowAbout(
      editor,
      ro.priceBreakdown.wholeKitchenCategories.material,
    );
    const colour = rowAbout(editor, ro.globalSettings.colourHeading);
    const hardware = rowAbout(
      editor,
      ro.priceBreakdown.wholeKitchenCategories.hardware,
    );

    expect(controlOf(material)).not.toBeNull();
    expect(controlOf(colour)).toBeNull();
    expect(controlOf(hardware)).not.toBeNull();
    expect(document.activeElement).toBe(controlOf(material));
  });

  it("turns the colour row, once the material is chosen, into a resolved row naming where it went, without a control", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(veneerKitchen);
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(...owedRows),
    });

    await chooseTier(editor, tierName("material.melamine"));

    const material = rowAbout(
      editor,
      ro.priceBreakdown.wholeKitchenCategories.material,
    );
    const colour = rowAbout(editor, ro.globalSettings.colourHeading);
    expect(colour?.dataset.resolved).toBe("true");
    expect(colour?.textContent).toContain(ro.finishName("pal.alb"));
    expect(controlOf(colour)).toBeNull();
    expect(controlOf(material)).not.toBeNull();
  });

  it("never shows an id: not the row's, the options', nor the vanished tier's", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({
        materialTierId: VANISHED_MATERIAL,
        finish: ANTHRACITE,
        hardwareTierId: "hardware.premium",
      }),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff({
        kind: "hardware",
        tierId: "hardware.premium",
      }),
    });

    expect(rowsOf(editor).length).toBeGreaterThan(0);
    const everything = required(editor, "replacement-sheet").innerHTML;
    expect(everything).not.toMatch(
      /created-and-since-deleted|pal\.|veneer\.|material\.|hardware\./,
    );
  });
});

describe("the reset line, arm by arm", () => {
  /** A veneer kitchen whose material is owed (alone), so choosing melamine rewrites whatever colours are stored. */
  async function replaceVeneerWith(
    design: Design,
    to: string,
    material: { kind: "material"; tierId: string } = {
      kind: "material",
      tierId: "material.veneer",
    },
  ): Promise<{ editor: Editor; lines: string[] }> {
    const world = serveWorld({ notices: [notice(), notice()] });
    hydrate(design);
    const editor = await mountEditor({ priceRoot: rootSwitchingOff(material) });
    await chooseTier(editor, tierName(to));
    await landSavesUntilConfirmed(editor, world);
    return { editor, lines: confirmationLines(editor) };
  }

  it("shows it for a global colour that is the only stored one, after the material line", async () => {
    const { lines } = await replaceVeneerWith(
      kitchenWith({ materialTierId: "material.veneer", finish: VENEER_OAK }),
      "material.melamine",
    );

    expect(lines).toEqual([
      full("changedMaterial", tierName("material.melamine")),
      reverted(ro.finishName("pal.alb")),
    ]);
  });

  it("shows it for a cabinet's own colour that is the only stored one", async () => {
    const { lines } = await replaceVeneerWith(
      withCabinets(kitchenWith({ materialTierId: "material.veneer" }), [
        { finish: VENEER_OAK },
      ]),
      "material.melamine",
    );

    expect(lines).toEqual([
      full("changedMaterial", tierName("material.melamine")),
      reverted(ro.finishName("pal.alb")),
    ]);
  });

  it("is silent when no colour is stored anywhere", async () => {
    const { lines } = await replaceVeneerWith(
      kitchenWith({ materialTierId: "material.veneer" }),
      "material.melamine",
    );

    expect(lines).toEqual([
      full("changedMaterial", tierName("material.melamine")),
    ]);
  });

  it("is silent when the new material offers the stored colour (a vanished material wearing a melamine colour, replaced by melamine)", async () => {
    const { lines } = await replaceVeneerWith(
      withCabinets(
        kitchenWith({ materialTierId: VANISHED_MATERIAL, finish: ANTHRACITE }),
        [{ finish: ANTHRACITE }],
      ),
      "material.melamine",
      { kind: "material", tierId: VANISHED_MATERIAL },
    );

    expect(lines).toEqual([
      full("changedMaterial", tierName("material.melamine")),
    ]);
    expect(useConfiguratorStore.getState().design.settings?.finish).toEqual(
      ANTHRACITE,
    );
  });

  it("names MDF's default by its value when MDF is the new material", async () => {
    const { lines } = await replaceVeneerWith(
      kitchenWith({ materialTierId: "material.veneer", finish: VENEER_OAK }),
      "material.painted-mdf",
    );

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      full("changedMaterial", tierName("material.painted-mdf")),
    );
    expect(lines[1]).toMatch(/^Culoarea a revenit la #[0-9a-fA-F]{3,8}\.$/);
  });

  it("with the price sentence on the last change only when hardware is chosen too, the reset line standing right after the material", async () => {
    const world = serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({
        materialTierId: "material.veneer",
        finish: VENEER_OAK,
        hardwareTierId: "hardware.premium",
      }),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(VENEER_OFF, {
        kind: "hardware",
        tierId: "hardware.premium",
      }),
    });

    await chooseTier(editor, tierName("material.melamine"));
    await chooseTier(editor, tierName("hardware.standard"));
    await landSavesUntilConfirmed(editor, world);

    expect(confirmationLines(editor)).toEqual([
      stem("changedMaterial", tierName("material.melamine")),
      reverted(ro.finishName("pal.alb")),
      full("changedHardware", tierName("hardware.standard")),
    ]);
  });
});

describe("a colour owed that the vanished material hid until it was replaced", () => {
  it("appears after the material is chosen, is chosen like any other, takes the material's change control away, and the reset is silent (the colour was kept)", async () => {
    const world = serveWorld({ notices: [notice(), notice()] });
    hydrate(
      withCabinets(kitchenWith({ materialTierId: VANISHED_MATERIAL }), [
        { finish: HAVANNA },
      ]),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(HAVANNA_OFF),
    });
    // Under a material no code declares, the colour is not judged until the material is: one row, the vanished material's.
    expect(rowsOf(editor)).toHaveLength(1);

    await chooseTier(editor, tierName("material.melamine"));

    const material = rowAbout(
      editor,
      ro.priceBreakdown.wholeKitchenCategories.material,
    );
    const colour = rowAbout(editor, ro.globalSettings.colourHeading);
    expect(material?.dataset.resolved).toBe("true");
    expect(controlOf(material)).not.toBeNull();
    expect(colour?.dataset.resolved).toBe("false");
    expect(controlOf(colour)).not.toBeNull();
    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();

    chooseInRow(colour, editor, ro.finishName("pal.nuc-warmia"));

    expect(controlOf(rowsOf(editor)[0])).toBeNull();
    await landSavesUntilConfirmed(editor, world);
    expect(confirmationLines(editor)).toEqual([
      stem("changedMaterial", tierName("material.melamine")),
      full("changedColour", ro.finishName("pal.nuc-warmia")),
    ]);
    expect(
      JSON.stringify(useConfiguratorStore.getState().design),
    ).not.toContain("pal.gri-havanna");
  });
});

describe("several colours and a handle in one sheet", () => {
  async function openThreeColoursAndAHandle() {
    const world = serveWorld({ notices: [notice(), notice()] });
    hydrate(
      withCabinets(kitchenWith({ finish: WHITE, handle: "black" }), [
        { finish: ANTHRACITE },
        { finish: HAVANNA },
      ]),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(
        WHITE_OFF,
        ANTHRACITE_OFF,
        HAVANNA_OFF,
        BLACK_OFF,
      ),
    });
    return { editor, world };
  }

  it("draws one row per item and says, in C4C, a line per item in order (colours, then the handle) however they were chosen, with the sentence once at the end", async () => {
    const { editor, world } = await openThreeColoursAndAHandle();
    expect(rowsOf(editor)).toHaveLength(4);

    const handleRow = rowsOf(editor).find((row) =>
      row.textContent.includes(ro.globalSettings.kitchenHandleHeading),
    );
    chooseInRow(handleRow, editor, ro.panel.handleLabels.push);
    chooseOption(editor, ro.finishName("pal.nuc-warmia"));
    chooseOption(editor, ro.finishName("pal.stejar-halifax"));
    chooseOption(editor, ro.finishName("pal.nuc-warmia"));
    await landSavesUntilConfirmed(editor, world);

    const lines = confirmationLines(editor);
    expect(lines).toHaveLength(4);
    expect(lines.filter((line) => line.includes(SENTENCE))).toEqual([lines[3]]);
    expect(lines[3]).toBe(full("changedHandle", ro.panel.handleLabels.push));
    expect(new Set(lines.slice(0, 3))).toEqual(
      new Set([
        stem("changedColour", ro.finishName("pal.nuc-warmia")),
        stem("changedColour", ro.finishName("pal.stejar-halifax")),
      ]),
    );
    expect(
      lines
        .slice(0, 3)
        .filter(
          (line) =>
            line === stem("changedColour", ro.finishName("pal.nuc-warmia")),
        ),
    ).toHaveLength(2);
  });

  it("says every colour line even when two colours were replaced by the same colour, with no React duplicate-key warning", async () => {
    const complaints = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { editor, world } = await openThreeColoursAndAHandle();

    chooseOption(editor, ro.finishName("pal.nuc-warmia"));
    chooseOption(editor, ro.finishName("pal.nuc-warmia"));
    chooseOption(editor, ro.finishName("pal.nuc-warmia"));
    chooseOption(editor, ro.panel.handleLabels.push);
    await landSavesUntilConfirmed(editor, world);

    expect(confirmationLines(editor)).toHaveLength(4);
    expect(
      complaints.mock.calls.filter((call) =>
        String(call[0]).includes("same key"),
      ),
    ).toEqual([]);
  });

  it("holds every replaced colour out of the stored design at every level, and moves no other colour", async () => {
    const { editor, world } = await openThreeColoursAndAHandle();
    const untouched = withCabinets(KITCHEN_L_DESIGN, [])
      .placements.slice(2)
      .map((placement) => placement.body);

    chooseOption(editor, ro.finishName("pal.nuc-warmia"));
    chooseOption(editor, ro.finishName("pal.stejar-halifax"));
    chooseOption(editor, ro.finishName("pal.nuc-warmia"));
    chooseOption(editor, ro.panel.handleLabels.push);
    await landSavesUntilConfirmed(editor, world);

    const { design } = useConfiguratorStore.getState();
    const text = JSON.stringify(design);
    expect(text).not.toContain("pal.alb");
    expect(text).not.toContain("pal.antracit");
    expect(text).not.toContain("pal.gri-havanna");
    expect(text).not.toContain('"handle":"black"');
    expect(
      design.placements.slice(2).map((placement) => placement.body),
    ).toEqual(untouched);
  });
});

describe("a resolved row, when availability comes back", () => {
  it("keeps a colour row drawn as resolved naming the colour, with no control, and lets the sheet close when nothing is owed", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(
      withCabinets(kitchenWith({ finish: WHITE }), [{ finish: ANTHRACITE }]),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(WHITE_OFF, ANTHRACITE_OFF),
    });
    chooseOption(editor, ro.finishName("pal.stejar-halifax"));
    expect(rowsOf(editor).map((row) => row.dataset.resolved)).toEqual([
      "true",
      "false",
    ]);

    await rerenderUnder(ROOT_NOTHING_OFF_AT_PAIR);

    expect(byTestId(editor, "replacement-sheet")).toBeNull();
  });
});
