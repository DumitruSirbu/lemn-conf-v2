// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave Q3d, the choice itself: "every choice applies via applyWholeKitchenSettings with exactly the chosen
// tier, and a material change resets colour per ADR 0057", a refused or locked press, and a vanished tier id that is markup.
// `q3d-replacement-sheet.dom.test.ts` reads the design after the press; here the store's action is wrapped so that the REQUEST
// it was handed is asserted exactly (a sheet that also sent the other group, or an unoffered tier list, would still end in the
// same design for these examples).
import { fc } from "@fast-check/vitest";
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
import { everythingSaidIn } from "../support/figures-in-text";
import {
  countMovedFinishes,
  FINISHES_RESOLVED_BY_VENEER,
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
  CHOSEN_FINISH_BY_PLACEMENT_ID,
} from "../support/mdf-kitchen-wearing-chosen-colours";
import { ro } from "../support/romanian-content";
import {
  beginTest,
  byTestId,
  chooseTier,
  endTest,
  hydrate,
  mountEditor,
  notice,
  present,
  press,
  required,
  requiredButton,
  requestsOf,
  ROOT_NOTHING_OFF_AT_PAIR,
  ROOT_WITH_MDF_AND_PREMIUM_OFF,
  ROOT_WITH_MDF_OFF,
  serveWorld,
  settle,
  SWITCHED_OFF_HARDWARE,
  SWITCHED_OFF_MATERIAL,
  type Editor,
} from "../support/replacement-sheet-world";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { kitchenCarrying } from "../support/tier-offer-world";

const nameOfMaterial = (tierId: string): string => {
  const tier = SAMPLE_PRICE_ROOT.book.material.tiers.find(
    (held) => held.tierId === tierId,
  );
  if (tier === undefined) throw new Error(`no ${tierId}`);
  return ro.bookText(tier.name, tier.nameKey);
};
const nameOfHardware = (tierId: string): string => {
  const tier = SAMPLE_PRICE_ROOT.book.hardware.tiers.find(
    (held) => held.tierId === tierId,
  );
  if (tier === undefined) throw new Error(`no ${tierId}`);
  return ro.bookText(tier.name, tier.nameKey);
};

const ACTIVE_MATERIAL_IDS = ["material.melamine", "material.veneer"];
const ALL_HARDWARE_IDS = [
  "hardware.standard",
  "hardware.soft-close",
  "hardware.premium",
];
const originalApply = useConfiguratorStore.getState().applyWholeKitchenSettings;
const applySpy = vi.fn(originalApply);

beforeEach(() => {
  beginTest();
  applySpy.mockReset();
  applySpy.mockImplementation(originalApply);
  useConfiguratorStore.setState({ applyWholeKitchenSettings: applySpy });
});

afterEach(async () => {
  await endTest();
  useConfiguratorStore.setState({ applyWholeKitchenSettings: originalApply });
});

describe("what the sheet asks the store to apply", () => {
  it("a material row asks for exactly the chosen material, with the two offers and nothing else", async () => {
    const world = serveWorld({ notices: [notice()] });
    hydrate(kitchenCarrying({ materialTierId: SWITCHED_OFF_MATERIAL }));
    const editor = await mountEditor({ priceRoot: ROOT_WITH_MDF_OFF });

    await chooseTier(editor, nameOfMaterial("material.veneer"));

    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy.mock.calls[0]?.[0]).toStrictEqual({
      materialTierId: "material.veneer",
      availableMaterialTierIds: ACTIVE_MATERIAL_IDS,
      availableHardwareTierIds: ALL_HARDWARE_IDS,
    });
    expect(requestsOf(world, "PUT")).toHaveLength(1);
  });

  it("a hardware row asks for exactly the chosen hardware and leaves the material alone", async () => {
    serveWorld({ notices: [notice()] });
    hydrate(kitchenCarrying({ hardwareTierId: SWITCHED_OFF_HARDWARE }));
    const editor = await mountEditor({
      priceRoot: {
        ...SAMPLE_PRICE_ROOT,
        availability: {
          revision: "1",
          disabled: [{ kind: "hardware", tierId: SWITCHED_OFF_HARDWARE }],
        },
      },
    });

    await chooseTier(editor, nameOfHardware("hardware.standard"));

    expect(applySpy).toHaveBeenCalledTimes(1);
    const [request] = applySpy.mock.calls[0] ?? [];
    expect(request).toStrictEqual({
      hardwareTierId: "hardware.standard",
      availableMaterialTierIds: [
        "material.melamine",
        "material.painted-mdf",
        "material.veneer",
      ],
      availableHardwareTierIds: ["hardware.standard", "hardware.soft-close"],
    });
    expect(Object.keys(request ?? {})).not.toContain("materialTierId");
  });

  it("two rows are two separate presses, each asking only for its own group", async () => {
    serveWorld({ notices: [notice()] });
    hydrate(
      kitchenCarrying({
        materialTierId: SWITCHED_OFF_MATERIAL,
        hardwareTierId: SWITCHED_OFF_HARDWARE,
      }),
    );
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
    });

    await chooseTier(editor, nameOfMaterial("material.veneer"));
    await chooseTier(editor, nameOfHardware("hardware.standard"));

    const askedFor = applySpy.mock.calls.map(([request]) =>
      Object.keys(request).filter(
        (key) => key.endsWith("TierId") && !key.startsWith("available"),
      ),
    );
    expect(askedFor).toEqual([["materialTierId"], ["hardwareTierId"]]);
  });
});

describe("a material change resets the colour (ADR 0057)", () => {
  it("choosing veneer for an MDF kitchen resolves exactly the free colours veneer does not offer and keeps its own woods", async () => {
    serveWorld({ notices: [notice()] });
    const before = MDF_KITCHEN_WEARING_CHOSEN_COLOURS;
    hydrate(before);
    const editor = await mountEditor({ priceRoot: ROOT_WITH_MDF_OFF });

    await chooseTier(editor, nameOfMaterial("material.veneer"));

    const after = useConfiguratorStore.getState().design;
    expect(after.settings?.materialTierId).toBe("material.veneer");
    expect(countMovedFinishes(before, after)).toBe(FINISHES_RESOLVED_BY_VENEER);
    for (const placement of after.placements) {
      const wore = CHOSEN_FINISH_BY_PLACEMENT_ID[placement.id];
      if (wore?.kind === "palette-entry") {
        expect(placement.body.finish).toEqual(wore);
      }
    }
  });

  it("choosing melamine resolves every colour it does not offer, so no cabinet is left wearing a colour of the vanished material", async () => {
    serveWorld({ notices: [notice()] });
    const before = MDF_KITCHEN_WEARING_CHOSEN_COLOURS;
    hydrate(before);
    const editor = await mountEditor({ priceRoot: ROOT_WITH_MDF_OFF });

    await chooseTier(editor, nameOfMaterial("material.melamine"));

    const after = useConfiguratorStore.getState().design;
    expect(countMovedFinishes(before, after)).toBe(
      Object.keys(CHOSEN_FINISH_BY_PLACEMENT_ID).length,
    );
    expect(byTestId(editor, "price-bar-total")).not.toBeNull();
  });
});

describe("a press the store refuses, and a page that may no longer write", () => {
  async function openChooser(): Promise<{
    readonly editor: Editor;
    readonly world: ReturnType<typeof serveWorld>;
  }> {
    const world = serveWorld({ notices: [notice()] });
    hydrate(kitchenCarrying({ materialTierId: SWITCHED_OFF_MATERIAL }));
    const editor = await mountEditor({ priceRoot: ROOT_WITH_MDF_OFF });
    press(required(editor, "replacement-choose"));
    const [first] =
      editor.container.querySelectorAll<HTMLElement>("[data-option]");
    press(first);
    return { editor, world };
  }

  it("says why in an alert, keeps the sheet and the chooser, and neither saves nor asks", async () => {
    const { editor, world } = await openChooser();
    applySpy.mockReturnValue({
      committed: false,
      setting: "material",
      reason: { code: "BODY_PROBE_UNAVAILABLE", params: {} },
    });

    press(required(editor, "replacement-apply"));
    await settle();

    const alert = editor.container.querySelector('[role="alert"]');
    expect(present(alert, "the refusal's alert").textContent).not.toBe("");
    expect(byTestId(editor, "replacement-apply")).not.toBeNull();
    expect(requestsOf(world, "PUT")).toEqual([]);
    expect(
      useConfiguratorStore.getState().design.settings?.materialTierId,
    ).toBe(SWITCHED_OFF_MATERIAL);
  });

  it("a save the server refused as unauthorised locks the apply control with the reason, and pressing it asks the store for nothing", async () => {
    const { editor } = await openChooser();

    act(() => {
      useConfiguratorStore.getState().setSaveStatus("unauthorized");
    });
    await settle();
    const apply = requiredButton(editor, "replacement-apply");
    const callsBefore = applySpy.mock.calls.length;
    press(apply);

    expect(apply.disabled).toBe(true);
    expect(apply.title).toBe(ro.panel.readOnlyReason);
    expect(applySpy.mock.calls.length).toBe(callsBefore);
    expect(byTestId(editor, "replacement-sheet-leave")).not.toBeNull();
  });
});

describe("a vanished tier id that is markup, through the whole editor", () => {
  const MARKUP_ID = fc
    .string({ maxLength: 10 })
    .map((tail) => `ZZVANISHED-<img src=x onerror=alert(1)>"'&${tail}`);

  it("never reaches the screen as text, attribute or element, and leaves the rest of the row intact", async () => {
    let run = 0;
    await fc.assert(
      fc.asyncProperty(MARKUP_ID, async (vanishedId) => {
        run += 1;
        beginTest();
        serveWorld({ notices: [notice()] });
        hydrate(
          kitchenCarrying({
            materialTierId: vanishedId,
            hardwareTierId: vanishedId,
          }),
        );
        const editor = await mountEditor({
          priceRoot: ROOT_NOTHING_OFF_AT_PAIR,
        });
        try {
          const sheet = required(editor, "replacement-sheet");
          expect(editor.container.innerHTML).not.toContain("ZZVANISHED");
          expect(everythingSaidIn(editor.container)).not.toContain(
            "ZZVANISHED",
          );
          expect(editor.container.querySelector("img")).toBeNull();
          expect(
            sheet.querySelectorAll('[data-testid="replacement-row"]'),
          ).toHaveLength(2);
          expect(sheet.textContent).toContain(
            roMessages.replacementSheet.unnamedOptionUnavailable,
          );
        } finally {
          await endTest();
        }
      }),
      { numRuns: 8 },
    );
    expect(run).toBeGreaterThan(0);
  });
});
