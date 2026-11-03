// @vitest-environment happy-dom
//
// A material's surcharge, swept: every whole percent either side of the book's bounds typed into the field of a mounted
// page, what Save then sends, and the example's figures over the whole range against the preview that is the dashboard's
// one source of price arithmetic.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyChanges,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  MAX_MATERIAL_PERCENT,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import {
  EXAMPLE_BUILD_ID,
  EXAMPLE_WIDTH_MM,
  materialExampleOf,
} from "@/price-dashboard/material-example";
import { surchargeAddressOf } from "@/price-dashboard/material-model";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn } from "../support/render-with-intl";
import { buttonNamed, fieldNamed, typeInField } from "./cabinet-detail-harness";
import {
  MDF,
  PAL,
  VENEER,
  materialItem,
  materialPageOf,
  mountMaterialEdit,
  press,
  previewedPrice,
  SAMPLE_MATERIALS,
  type MountedMaterials,
} from "./material-harness";
import { roCopy } from "./romanian-copy";
import { cabinetNamesOf } from "./dashboard-state-fixture";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const SURCHARGE = roCopy("priceDashboard.materials.columnSurcharge");
const SAVE = roCopy("priceDashboard.common.save");
const ACTIVE_MDF =
  SAMPLE_MATERIALS.find((tier) => tier.tierId === MDF)?.percentOfCabinets ??
  Number.NaN;
const BASE_CABINET_RULE = "cabinet.base-cabinet";

let mounted: MountedMaterials | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

function screenOf(): MountedMaterials {
  if (mounted === undefined) throw new Error("nothing is mounted");
  return mounted;
}

const bookWith = (percent: number, base: PriceBook = SAMPLE_PRICE_BOOK) => {
  const applied = applyChanges(base, [
    { address: surchargeAddressOf(MDF), value: percent },
  ]);
  if (!applied.ok) throw new Error(`${String(percent)} did not apply`);
  return applied.book;
};

const alertsOf = (container: HTMLElement) => allIn(container, '[role="alert"]');

describe("the field, over every percent from below zero to past the greatest", () => {
  it("marks a value invalid, and Save off, exactly outside 0 to the greatest, and sends nothing while typing", async () => {
    mounted = await mountMaterialEdit(MDF, materialPageOf());
    const { container } = screenOf();
    const swept: number[] = [];

    for (let percent = -3; percent <= MAX_MATERIAL_PERCENT + 4; percent += 1) {
      typeInField(container, SURCHARGE, String(percent));
      const field = fieldNamed(container, SURCHARGE);
      const isValid = percent >= 0 && percent <= MAX_MATERIAL_PERCENT;
      const canSave = isValid && percent !== ACTIVE_MDF;

      expect(field.getAttribute("aria-invalid"), String(percent)).toBe(
        isValid ? null : "true",
      );
      expect(alertsOf(container), String(percent)).toHaveLength(
        isValid ? 0 : 1,
      );
      expect(buttonNamed(container, SAVE), String(percent)).toHaveProperty(
        "disabled",
        !canSave,
      );
      swept.push(percent);
    }

    expect(swept).toHaveLength(MAX_MATERIAL_PERCENT + 8);
    expect(screenOf().draftServer.calls).toEqual([]);
  });

  it("ties a refusal to its field: the field is described by the alert that says it", async () => {
    mounted = await mountMaterialEdit(MDF, materialPageOf());
    const { container } = screenOf();

    for (const typed of [
      "201",
      "-1",
      "1.5",
      "",
      "abc",
      "1e2",
      "0x10",
      "\uFF15",
    ]) {
      typeInField(container, SURCHARGE, typed);
      const [alert] = alertsOf(container);

      expect(alertsOf(container), JSON.stringify(typed)).toHaveLength(1);
      expect(
        fieldNamed(container, SURCHARGE)
          .getAttribute("aria-describedby")
          ?.split(" "),
        JSON.stringify(typed),
      ).toContain(alert?.id);
    }
  });

  it("refuses what is not a whole percent in words of its own, never as a number that is out of range", async () => {
    mounted = await mountMaterialEdit(MDF, materialPageOf());
    const { container } = screenOf();
    const refusals = new Map<string, string>([
      [
        "1.5",
        roCopy("priceDashboard.errors.percentNotWhole", { example: "15" }),
      ],
      [
        "1e2",
        roCopy("priceDashboard.errors.percentNotWhole", { example: "15" }),
      ],
      ["", roCopy("priceDashboard.materials.surchargeEmpty")],
      ["-1", roCopy("priceDashboard.errors.percentNegative")],
      ["201", roCopy("priceDashboard.errors.percentTooBig", { max: "200" })],
    ]);

    for (const [typed, words] of refusals) {
      typeInField(container, SURCHARGE, typed);

      expect(
        alertsOf(container).map((alert) => alert.textContent),
        JSON.stringify(typed),
      ).toEqual([words]);
    }
  });
});

describe("Save, at the boundaries", () => {
  it.each([0, 1, MAX_MATERIAL_PERCENT - 1, MAX_MATERIAL_PERCENT])(
    "sends exactly one change, of %i, and nothing else",
    async (percent) => {
      mounted = await mountMaterialEdit(MDF, materialPageOf());
      const { container } = screenOf();
      typeInField(container, SURCHARGE, String(percent));

      await press(buttonNamed(container, SAVE));

      expect(screenOf().draftServer.calls).toEqual([
        {
          kind: "change",
          request: {
            expectedDraftRevision: "1",
            change: { address: surchargeAddressOf(MDF), value: percent },
          },
        },
      ]);
      expect(
        screenOf().lifecycle.calls.filter((call) => call.kind === "setActive"),
      ).toEqual([]);
    },
  );

  it("sends nothing for the active surcharge typed on a clean draft, however it is spelt", async () => {
    mounted = await mountMaterialEdit(MDF, materialPageOf());
    const { container } = screenOf();

    for (const typed of [
      String(ACTIVE_MDF),
      ` ${String(ACTIVE_MDF)} `,
      `0${String(ACTIVE_MDF)}`,
    ]) {
      typeInField(container, SURCHARGE, typed);

      expect(buttonNamed(container, SAVE), typed).toHaveProperty(
        "disabled",
        true,
      );
    }
    expect(screenOf().draftServer.calls).toEqual([]);
  });

  it("sends nothing for the draft's own surcharge typed again, so no equal change is written twice", async () => {
    mounted = await mountMaterialEdit(
      MDF,
      materialPageOf({
        changes: [{ address: surchargeAddressOf(MDF), value: 35 }],
      }),
    );
    const { container } = screenOf();

    typeInField(container, SURCHARGE, "035");

    expect(buttonNamed(container, SAVE)).toHaveProperty("disabled", true);
    expect(screenOf().draftServer.calls).toEqual([]);
  });

  it("takes the draft's change out when the active surcharge is typed back,", async () => {
    mounted = await mountMaterialEdit(
      MDF,
      materialPageOf({
        changes: [{ address: surchargeAddressOf(MDF), value: 35 }],
      }),
    );
    const { container } = screenOf();
    typeInField(container, SURCHARGE, String(ACTIVE_MDF));

    await press(buttonNamed(container, SAVE));

    expect(screenOf().draftServer.calls.map((call) => call.kind)).toEqual([
      "revert",
    ]);
    expect(screenOf().draftServer.state().draft.changes).toEqual([]);
  });
});

describe("the example's heading", () => {
  it("names the example cabinet by its catalogue name and its width, and the name is not empty", async () => {
    mounted = await mountMaterialEdit(MDF, materialPageOf());
    const cabinetName = cabinetNamesOf(SAMPLE_PRICE_BOOK)[EXAMPLE_BUILD_ID];

    const heading = screenOf().container.querySelector(
      '[data-testid="material-example"] h3',
    );

    expect(cabinetName?.trim()).toBeTruthy();
    expect(heading?.textContent).toBe(
      roCopy("priceDashboard.materials.exampleTitle", {
        cabinetName: cabinetName ?? "",
        widthMm: EXAMPLE_WIDTH_MM,
      }),
    );
  });
});

describe("a page that has no field", () => {
  it("is PAL's, whatever the draft holds: no input, no Save", async () => {
    mounted = await mountMaterialEdit(PAL, materialPageOf());

    expect(allIn(screenOf().container, "input")).toEqual([]);
    expect(
      allIn(screenOf().container, "button").map((button) =>
        button.textContent.trim(),
      ),
    ).not.toContain(SAVE);
  });

  it("is the page of a material the draft deletes: the deletion is all it says", async () => {
    mounted = await mountMaterialEdit(
      VENEER,
      materialPageOf({
        changes: [
          {
            address: { kind: "item-deleted", item: materialItem(VENEER) },
            value: true,
          },
        ],
      }),
    );

    expect(allIn(screenOf().container, "input")).toEqual([]);
    expect(screenOf().container.textContent).toContain(
      roCopy("priceDashboard.materials.deleteNotice"),
    );
  });
});

describe("the example", () => {
  const input = (percent: number, draft = SAMPLE_PRICE_BOOK) => ({
    active: SAMPLE_PRICE_BOOK,
    draft,
    tierId: MDF,
    percent,
  });

  it("holds the preview's own figure for every whole percent from 0 to the greatest, at both depths", () => {
    let previousMaterial = -1;

    for (let percent = 0; percent <= MAX_MATERIAL_PERCENT; percent += 1) {
      const typed = bookWith(percent);
      const example = materialExampleOf(input(percent));

      expect(example?.next, String(percent)).toEqual({
        standard: {
          referenceMinor: previewedPrice(typed, PAL, DEFAULT_CABINET_DEPTH_MM),
          materialMinor: previewedPrice(typed, MDF, DEFAULT_CABINET_DEPTH_MM),
        },
        deep: {
          referenceMinor: previewedPrice(typed, PAL, DEEP_CABINET_DEPTH_MM),
          materialMinor: previewedPrice(typed, MDF, DEEP_CABINET_DEPTH_MM),
        },
      });
      const material = example?.next.standard.materialMinor ?? Number.NaN;
      expect(material, String(percent)).toBeGreaterThanOrEqual(
        previousMaterial,
      );
      previousMaterial = material;
    }
  });

  it("draws no figure for a surcharge one past the greatest or below zero", () => {
    expect(materialExampleOf(input(MAX_MATERIAL_PERCENT + 1))).toBeUndefined();
    expect(materialExampleOf(input(-1))).toBeUndefined();
  });

  it("prices the draft's other changes in the figures it proposes, and the active version's own in the line it compares with", () => {
    const anchorChange: DraftChange = {
      address: {
        kind: "cabinet",
        ruleId: BASE_CABINET_RULE,
        field: "anchorMinor",
      },
      value: 450_000,
    };
    const applied = applyChanges(SAMPLE_PRICE_BOOK, [anchorChange]);
    if (!applied.ok) throw new Error("the anchor did not apply");
    const candidate = applied.book;

    const example = materialExampleOf(input(ACTIVE_MDF, candidate));

    expect(example?.next.standard.materialMinor).toBe(
      previewedPrice(
        bookWith(ACTIVE_MDF, candidate),
        MDF,
        DEFAULT_CABINET_DEPTH_MM,
      ),
    );
    expect(example?.active).toEqual({
      referenceMinor: previewedPrice(
        SAMPLE_PRICE_BOOK,
        PAL,
        DEFAULT_CABINET_DEPTH_MM,
      ),
      materialMinor: previewedPrice(
        SAMPLE_PRICE_BOOK,
        MDF,
        DEFAULT_CABINET_DEPTH_MM,
      ),
    });
    expect(example?.next.standard.materialMinor).not.toBe(
      example?.active?.materialMinor,
    );
  });
});
