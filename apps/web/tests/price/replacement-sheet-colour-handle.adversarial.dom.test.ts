// @vitest-environment happy-dom
//
// The mounted replacement sheet, attacked: a lone colour and a lone handle through the save-landed rule, the colour that waits,
// the note said while a material is owed (where it sits, when it shows, both locales), no reset line in any arm
// (global colour only, a cabinet's only, none stored, offered by the new material, MDF), two and three colours at once,
// and what is drawn (no id, a first option that is not a selection, no button on a resolved colour).
// Facts these pin: an undeclared OLD material also leaves a colour row owed, which appears only after that material is
// replaced; a resolved handle row the design no longer stores shows no value.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
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

import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { LEAKED_ID } from "../support/leaked-id";
import { ro } from "../support/romanian-content";
import {
  ANTHRACITE,
  ANTHRACITE_OFF,
  BLACK_OFF,
  HAVANNA,
  HAVANNA_OFF,
  kitchenWith,
  rootSwitchingOff,
  VENEER_OAK,
  VENEER_OFF,
  WHITE,
  WHITE_OFF,
  withCabinets,
} from "../support/replacement-kitchens";
import {
  full,
  PRICE_SENTENCE,
  stem,
} from "../support/replacement-confirmation-lines";
import {
  chooseInRow,
  chooseOption,
  confirmationLines,
  controlOf,
  landSavesUntilConfirmed,
  optionNamed,
  rowAbout,
  rowsOf,
} from "../support/replacement-sheet-flow";
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
} from "../support/replacement-sheet-world";
import { tierName } from "../support/tier-offer-world";

const VANISHED_MATERIAL = "material.created-and-since-deleted";

beforeEach(() => {
  beginTest();
  driveEveryTimerFromTheTest();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await endTest();
});

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

  it("turns the colour row, once the material is chosen, into a resolved row with no value and no control", async () => {
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
    expect(
      colour?.querySelector('[data-testid="replacement-row-value"]'),
    ).toBeNull();
    expect(colour?.textContent).not.toContain(ro.finishName("pal.alb"));
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
    expect(byTestId(editor, "replacement-material-note")).not.toBeNull();
    expect(everything).not.toMatch(LEAKED_ID);
  });
});

describe("the dialog's description", () => {
  const describedByOf = (editor: Editor): readonly string[] =>
    (
      required(editor, "replacement-sheet").getAttribute("aria-describedby") ??
      ""
    )
      .split(/\s+/)
      .filter((id) => id !== "");
  const idOf = (editor: Editor, testId: string): string =>
    required(editor, testId).id;

  it("includes the note's id after the body's while the note is shown, and each id names the element it points to", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({ materialTierId: VANISHED_MATERIAL, finish: ANTHRACITE }),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff({
        kind: "material",
        tierId: VANISHED_MATERIAL,
      }),
    });

    const noteId = idOf(editor, "replacement-material-note");
    expect(noteId).not.toBe("");
    expect(describedByOf(editor)).toEqual([
      idOf(editor, "replacement-body"),
      noteId,
    ]);
  });

  it("is the body's id alone when no note is shown", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(withCabinets(kitchenWith({ finish: WHITE }), [{ finish: WHITE }]));
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(WHITE_OFF),
    });

    expect(byTestId(editor, "replacement-material-note")).toBeNull();
    expect(describedByOf(editor)).toEqual([idOf(editor, "replacement-body")]);
  });

  it("goes back to the body's id alone when the material is chosen and other rows remain", async () => {
    serveWorld({ notices: [notice(), notice()] });
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
    expect(describedByOf(editor)).toHaveLength(2);

    await chooseTier(editor, tierName("material.melamine"));

    expect(byTestId(editor, "replacement-material-note")).toBeNull();
    expect(describedByOf(editor)).toEqual([idOf(editor, "replacement-body")]);
  });
});

describe("no reset line, in any arm", () => {
  /** A kitchen whose material is owed (alone), so choosing the replacement rewrites whatever colours are stored. */
  async function replaceMaterialWith(
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

  it("asks no question before the apply, though a stored colour will be rewritten: the one dialog is the sheet, and one press changes the material", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({ materialTierId: "material.veneer", finish: VENEER_OAK }),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(VENEER_OFF),
    });
    expect(editor.container.querySelectorAll('[role="dialog"]')).toHaveLength(
      1,
    );

    press(required(editor, "replacement-choose"));
    press(optionNamed(editor, tierName("material.melamine")));
    press(required(editor, "replacement-apply"));

    expect(
      useConfiguratorStore.getState().design.settings?.materialTierId,
    ).toBe("material.melamine");
    expect(useConfiguratorStore.getState().design.settings?.finish).toEqual(
      WHITE,
    );
    expect(byTestId(editor, "back-confirm-dialog")).toBeNull();
    expect(editor.container.querySelectorAll('[role="dialog"]')).toHaveLength(
      0,
    );
  });

  it("is only the material's line for a global colour that is the only stored one, though the colour was rewritten", async () => {
    const { lines } = await replaceMaterialWith(
      kitchenWith({ materialTierId: "material.veneer", finish: VENEER_OAK }),
      "material.melamine",
    );

    expect(lines).toEqual([
      full("changedMaterial", tierName("material.melamine")),
    ]);
    expect(useConfiguratorStore.getState().design.settings?.finish).toEqual(
      WHITE,
    );
  });

  it("is only the material's line for a cabinet's own colour that is the only stored one", async () => {
    const { lines } = await replaceMaterialWith(
      withCabinets(kitchenWith({ materialTierId: "material.veneer" }), [
        { finish: VENEER_OAK },
      ]),
      "material.melamine",
    );

    expect(lines).toEqual([
      full("changedMaterial", tierName("material.melamine")),
    ]);
  });

  it("is only the material's line when no colour is stored anywhere", async () => {
    const { lines } = await replaceMaterialWith(
      kitchenWith({ materialTierId: "material.veneer" }),
      "material.melamine",
    );

    expect(lines).toEqual([
      full("changedMaterial", tierName("material.melamine")),
    ]);
  });

  it("is only the material's line when the new material offers the stored colour, which is kept (a vanished material wearing a melamine colour, replaced by melamine)", async () => {
    const { lines } = await replaceMaterialWith(
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

  it("is only the material's line when MDF is the new material, and its free default is named nowhere", async () => {
    const { editor, lines } = await replaceMaterialWith(
      kitchenWith({ materialTierId: "material.veneer", finish: VENEER_OAK }),
      "material.painted-mdf",
    );

    expect(lines).toEqual([
      full("changedMaterial", tierName("material.painted-mdf")),
    ]);
    expect(editor.container.textContent).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("is the material and hardware lines, with the price sentence on the last change only, when hardware is chosen too", async () => {
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
      full("changedHardware", tierName("hardware.standard")),
    ]);
  });
});

describe("a material chosen again in the sheet", () => {
  const PREMIUM_OFF = { kind: "hardware", tierId: "hardware.premium" } as const;

  /** A veneer kitchen wearing a veneer colour, with hardware owed too so the sheet stays open after the material is chosen. */
  async function chooseMelamineThenChooseItAgain() {
    const world = serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({
        materialTierId: "material.veneer",
        finish: VENEER_OAK,
        hardwareTierId: "hardware.premium",
      }),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(VENEER_OFF, PREMIUM_OFF),
    });
    const materialLabel = ro.priceBreakdown.wholeKitchenCategories.material;
    await chooseTier(editor, tierName("material.melamine"));
    const designAfterFirstChoice = useConfiguratorStore.getState().design;

    chooseInRow(
      rowAbout(editor, materialLabel),
      editor,
      tierName("material.melamine"),
    );
    return { editor, world, designAfterFirstChoice };
  }

  it("offers a resolved material row a control to change it, and choosing the tier already applied commits nothing and saves nothing", async () => {
    const { editor, world, designAfterFirstChoice } =
      await chooseMelamineThenChooseItAgain();

    expect(useConfiguratorStore.getState().design).toBe(designAfterFirstChoice);
    expect(world.savesWaiting()).toBeLessThanOrEqual(1);
    expect(rowsOf(editor).map((row) => row.dataset.resolved)).toEqual([
      "true",
      "false",
    ]);
  });

  it("still reports it as one change line, once, harmlessly", async () => {
    const { editor, world } = await chooseMelamineThenChooseItAgain();

    await chooseTier(editor, tierName("hardware.standard"));
    await landSavesUntilConfirmed(editor, world);

    const lines = confirmationLines(editor);
    expect(
      lines.filter((line) => line.includes(tierName("material.melamine"))),
    ).toHaveLength(1);
    expect(lines).toContain(
      stem("changedMaterial", tierName("material.melamine")),
    );
  });

  it("says nothing about the colour after a later press either: the lines are the customer's own changes", async () => {
    const { editor, world } = await chooseMelamineThenChooseItAgain();

    await chooseTier(editor, tierName("hardware.standard"));
    await landSavesUntilConfirmed(editor, world);

    expect(confirmationLines(editor)).toEqual([
      stem("changedMaterial", tierName("material.melamine")),
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

  it("draws one row per item and says, in the confirmation, a line per item in order (colours, then the handle) however they were chosen, with the sentence once at the end", async () => {
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
    expect(lines.filter((line) => line.includes(PRICE_SENTENCE))).toEqual([
      lines[3],
    ]);
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

describe("a handle row resolved by availability coming back, while another row keeps the sheet open", () => {
  // The state a customer can see: the sheet stays open on the material, and the handle row, switched back on behind it, is
  // drawn resolved. Nothing replaced the handle, so it cannot say the kitchen's other handle did (inferred from the colour
  // arm, which names a colour that came back as the colour it still is).
  it("names the cabinet's own handle that came back as that handle, not as the kitchen's other one", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(
      withCabinets(
        kitchenWith({
          materialTierId: "material.painted-mdf",
          handle: "steel",
        }),
        [{ handle: "black" }],
      ),
    );
    const mdfOff = {
      kind: "material",
      tierId: "material.painted-mdf",
    } as const;
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(mdfOff, BLACK_OFF),
    });
    expect(rowsOf(editor)).toHaveLength(2);

    await rerenderUnder(rootSwitchingOff(mdfOff));

    const handleRow = rowAbout(editor, ro.globalSettings.kitchenHandleHeading);
    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
    expect(handleRow?.dataset.resolved).toBe("true");
    expect(controlOf(handleRow)).toBeNull();
    expect(handleRow?.textContent).toContain(ro.panel.handleLabels.black);
  });
});

describe("the note that a material's colours go with it, as the customer meets it", () => {
  const NOTE = roMessages.replacementSheet.materialAndColoursUnavailable;
  const PREMIUM_OFF = { kind: "hardware", tierId: "hardware.premium" } as const;
  const noteOf = (editor: Editor) =>
    byTestId(editor, "replacement-material-note");

  it("sits inside the dialog, straight after the lead and before the first row, as text a screen reader reads", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({ materialTierId: "material.veneer", finish: VENEER_OAK }),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(VENEER_OFF, {
        kind: "finish",
        finishId: "veneer.stejar",
      }),
    });

    const note = present(noteOf(editor), "the material note");
    const sheet = required(editor, "replacement-sheet");

    expect(sheet.contains(note)).toBe(true);
    expect(required(editor, "replacement-body").nextElementSibling).toBe(note);
    expect(
      note.compareDocumentPosition(present(rowsOf(editor)[0], "the first row")),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(note.closest('[aria-hidden="true"]')).toBeNull();
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe(NOTE);
  });

  it.each([
    [
      "a named switched-off material",
      () =>
        kitchenWith({ materialTierId: "material.veneer", finish: VENEER_OAK }),
      [VENEER_OFF],
    ],
    [
      "a named switched-off material with a colour waiting behind it",
      () =>
        kitchenWith({ materialTierId: "material.veneer", finish: VENEER_OAK }),
      [VENEER_OFF, { kind: "finish", finishId: "veneer.stejar" } as const],
    ],
    [
      "a vanished material no code names",
      () => kitchenWith({ materialTierId: VANISHED_MATERIAL }),
      [PREMIUM_OFF],
    ],
    [
      "a material owed on a kitchen that stores no colour",
      () => kitchenWith({ materialTierId: "material.veneer" }),
      [VENEER_OFF],
    ],
  ])("is shown for %s", async (_name, design, owed) => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(design());
    const editor = await mountEditor({ priceRoot: rootSwitchingOff(...owed) });

    expect(noteOf(editor)?.textContent).toBe(NOTE);
    expect(
      editor.container.querySelectorAll(
        '[data-testid="replacement-material-note"]',
      ),
    ).toHaveLength(1);
  });

  it.each([
    ["a lone colour", () => kitchenWith({ finish: WHITE }), [WHITE_OFF]],
    ["a lone handle", () => kitchenWith({ handle: "black" }), [BLACK_OFF]],
    [
      "a lone hardware tier",
      () => kitchenWith({ hardwareTierId: "hardware.premium" }),
      [PREMIUM_OFF],
    ],
    [
      "a colour and a handle",
      () => kitchenWith({ finish: WHITE, handle: "black" }),
      [WHITE_OFF, BLACK_OFF],
    ],
  ])("is not shown for %s", async (_name, design, owed) => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(design());
    const editor = await mountEditor({ priceRoot: rootSwitchingOff(...owed) });

    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
    expect(noteOf(editor)).toBeNull();
  });

  it("is back on the list when the customer opens a chooser and cancels", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({ materialTierId: "material.veneer", finish: VENEER_OAK }),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(VENEER_OFF),
    });

    press(required(editor, "replacement-choose"));
    press(required(editor, "replacement-chooser-back"));
    expect(noteOf(editor)?.textContent).toBe(NOTE);
  });

  it("is gone once the material is chosen, while another row keeps the sheet open, and is not in the confirmation", async () => {
    const world = serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({
        materialTierId: "material.veneer",
        finish: VENEER_OAK,
        hardwareTierId: "hardware.premium",
      }),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(VENEER_OFF, PREMIUM_OFF),
    });
    expect(noteOf(editor)).not.toBeNull();

    await chooseTier(editor, tierName("material.melamine"));
    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
    expect(noteOf(editor)).toBeNull();

    await chooseTier(editor, tierName("hardware.standard"));
    await landSavesUntilConfirmed(editor, world);
    expect(
      byTestId(editor, "replacement-confirmation")?.textContent,
    ).not.toContain(NOTE);
  });

  it("says the Russian leaf under /ru, which is not the Romanian one", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(kitchenWith({ materialTierId: VANISHED_MATERIAL }));
    const editor = await mountEditor({
      locale: "ru",
      priceRoot: rootSwitchingOff(PREMIUM_OFF),
    });
    const russian = ruMessages.replacementSheet.materialAndColoursUnavailable;

    expect(russian.length).toBeGreaterThan(0);
    expect(russian).not.toBe(NOTE);
    expect(noteOf(editor)?.textContent).toBe(russian);
  });

  it("says the Romanian leaf under /ro", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(kitchenWith({ materialTierId: VANISHED_MATERIAL }));
    const editor = await mountEditor({
      locale: "ro",
      priceRoot: rootSwitchingOff(PREMIUM_OFF),
    });

    expect(noteOf(editor)?.textContent).toBe(NOTE);
  });
});

describe("a colour row resolved because availability came back, beside a material row that stays owed", () => {
  it("still names its own colour, has no control, and the note stays while the material is owed", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({ materialTierId: "material.veneer", finish: VENEER_OAK }),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(VENEER_OFF, {
        kind: "finish",
        finishId: "veneer.stejar",
      }),
    });
    expect(rowsOf(editor)).toHaveLength(2);

    await rerenderUnder(rootSwitchingOff(VENEER_OFF));

    const colour = rowAbout(editor, ro.globalSettings.colourHeading);
    expect(colour?.dataset.resolved).toBe("true");
    expect(controlOf(colour)).toBeNull();
    expect(
      colour?.querySelector('[data-testid="replacement-row-value"]')
        ?.textContent,
    ).toBe(ro.finishName("veneer.stejar"));
    expect(byTestId(editor, "replacement-material-note")?.textContent).toBe(
      roMessages.replacementSheet.materialAndColoursUnavailable,
    );
  });
});
