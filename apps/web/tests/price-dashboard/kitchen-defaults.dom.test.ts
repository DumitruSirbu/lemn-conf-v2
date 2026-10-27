// @vitest-environment happy-dom
//
// The new-kitchen defaults screen (frames D9A, D9B, D9C): six labelled rows, only active options, the colour reset note, a
// whole-object save with the revisions the page read, and the three ways a save is answered that are not a success. It is
// drawn inside the staff frame, from the facts the server supplies, through a client the test holds.
import { paletteFinish } from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DefaultsSaveOutcome,
  KitchenDefaultsClient,
} from "@/price-dashboard/kitchen-defaults-client";
import type { KitchenDefaultsPageInput } from "@/price-dashboard/kitchen-defaults-model";
import { KitchenDefaultsScreen } from "@/price-dashboard/kitchen-defaults-page";
import {
  inMemoryKitchenDefaultsClient,
  SAMPLE_KITCHEN_DEFAULTS,
} from "@/price-dashboard/kitchen-defaults-sample";
import { KITCHEN_DEFAULTS_MEMBERS } from "@/price-dashboard/price-dashboard-wire-contract";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  submitFormIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const COPY = {
  ro: roMessages.priceDashboard,
  ru: ruMessages.priceDashboard,
} as const;

const ROWS_IN_THE_FRAMES_ORDER = [
  "materialTierId",
  "hardwareTierId",
  "cabinetDepthMm",
  "finish",
  "handle",
  "topRowHandle",
];

let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllEnvs();
  leaveTheStaffServer();
});

interface Held {
  readonly save: ReturnType<typeof vi.fn<KitchenDefaultsClient["save"]>>;
  readonly readAgain: ReturnType<
    typeof vi.fn<KitchenDefaultsClient["readAgain"]>
  >;
  readonly client: KitchenDefaultsClient;
}

function heldClient(
  outcome: DefaultsSaveOutcome,
  fresh?: KitchenDefaultsPageInput,
): Held {
  const save = vi.fn<KitchenDefaultsClient["save"]>(() =>
    Promise.resolve(outcome),
  );
  const readAgain = vi.fn<KitchenDefaultsClient["readAgain"]>(() =>
    Promise.resolve(fresh),
  );
  return { save, readAgain, client: { save, readAgain } };
}

async function mount({
  input = SAMPLE_KITCHEN_DEFAULTS,
  client,
  locale = "ro",
}: {
  input?: KitchenDefaultsPageInput;
  client?: KitchenDefaultsClient;
  locale?: TestLocale;
} = {}): Promise<HTMLElement> {
  screen = mountInCatalogue(
    createElement(KitchenDefaultsScreen, {
      locale,
      context: contextOf("administrator", ["kitchens", "cabinets", "defaults"]),
      input,
      client,
    }),
    locale,
  );
  await flushPromises(5);
  return screen.container;
}

const row = (container: HTMLElement, member: string): HTMLElement =>
  requireIn(container, `[data-member="${member}"]`);

const optionLabels = (container: HTMLElement, member: string): string[] =>
  allIn(row(container, member), "label").map((label) =>
    label.textContent.trim(),
  );

const radioOf = (
  container: HTMLElement,
  member: string,
  value: string,
): HTMLInputElement =>
  requireIn<HTMLInputElement>(
    row(container, member),
    `input[type="radio"][value="${value}"]`,
  );

const checkedValue = (container: HTMLElement, member: string): string =>
  requireIn<HTMLInputElement>(
    row(container, member),
    "input[type='radio']:checked",
  ).value;

const saveButton = (container: HTMLElement): HTMLButtonElement =>
  requireIn<HTMLButtonElement>(container, 'button[type="submit"]');

const cancelButton = (container: HTMLElement): HTMLButtonElement | null =>
  allIn<HTMLButtonElement>(container, 'button[type="button"]').find(
    (button) =>
      button.textContent.trim() === roCopy("priceDashboard.common.cancel"),
  ) ?? null;

async function choose(radio: HTMLInputElement): Promise<void> {
  click(radio);
  await flushPromises(3);
}

async function saveAndWait(container: HTMLElement): Promise<void> {
  submitFormIn(container);
  await flushPromises(8);
}

const noticeText = (container: HTMLElement): string =>
  requireIn(container, "[data-tone]").textContent.trim();

describe("the page as first drawn (D9A)", () => {
  it("shows the six rows in the frame's order, each a labelled group, inside the staff frame", async () => {
    const container = await mount();

    const members = allIn(container, "[data-member]").map((element) =>
      element.getAttribute("data-member"),
    );
    expect(members).toEqual(ROWS_IN_THE_FRAMES_ORDER);
    expect(Object.keys(KITCHEN_DEFAULTS_MEMBERS).sort()).toEqual(
      [...ROWS_IN_THE_FRAMES_ORDER].sort(),
    );
    for (const member of members) {
      const group = requireIn(
        row(container, member ?? ""),
        '[role="radiogroup"]',
      );
      const labelId = group.getAttribute("aria-labelledby") ?? "";
      expect(
        container.querySelector(`[id="${labelId}"]`)?.textContent,
      ).not.toBe("");
    }
    expect(requireIn(container, "h1").textContent).toBe(
      roCopy("priceDashboard.defaults.title"),
    );
    expect(noticeText(container)).toBe(
      roCopy("priceDashboard.defaults.appliesNote"),
    );
  });

  it("offers the options in the sample's active catalogue, with the book's own words", async () => {
    const container = await mount();

    expect(optionLabels(container, "materialTierId")).toEqual([
      roCopy("priceBook.material.melamine.name"),
      roCopy("priceBook.material.painted-mdf.name"),
      roCopy("priceBook.material.veneer.name"),
    ]);
    expect(optionLabels(container, "hardwareTierId")).toEqual([
      roCopy("priceBook.hardware.standard.name"),
      "Hettich",
      "Blum",
    ]);
    expect(optionLabels(container, "cabinetDepthMm")).toEqual([
      `600 ${roCopy("priceDashboard.units.mm")}`,
      `700 ${roCopy("priceDashboard.units.mm")}`,
    ]);
    expect(optionLabels(container, "handle")).toEqual([
      roCopy("panel.handleLabels.steel"),
      roCopy("panel.handleLabels.black"),
      roCopy("panel.handleLabels.push"),
    ]);
  });

  it("checks the saved values, marks no row as changed, and keeps Save off with nothing to cancel", async () => {
    const container = await mount();

    expect(checkedValue(container, "materialTierId")).toBe("material.melamine");
    expect(checkedValue(container, "cabinetDepthMm")).toBe("600");
    expect(checkedValue(container, "finish")).toBe("pal.alb");
    expect(checkedValue(container, "topRowHandle")).toBe("push");
    expect(allIn(container, `[data-modified="true"]`)).toHaveLength(0);
    expect(saveButton(container).disabled).toBe(true);
    expect(cancelButton(container)).toBeNull();
  });

  it("speaks Russian on the Russian page: the rows, the options and the buttons", async () => {
    const container = await mount({ locale: "ru" });

    expect(container.textContent).toContain(COPY.ru.defaults.frontMaterial);
    expect(container.textContent).toContain(COPY.ru.defaults.appliesNote);
    expect(container.textContent).toContain(COPY.ru.common.save);
    expect(optionLabels(container, "handle")[0]).toBe(
      ruMessages.panel.handleLabels.steel,
    );
  });

  it("offers only what is active: a value switched off since it was saved is flagged and keeps Save off", async () => {
    const input: KitchenDefaultsPageInput = {
      ...SAMPLE_KITCHEN_DEFAULTS,
      disabled: [
        { kind: "hardware", tierId: "hardware.standard" },
        { kind: "finish", finishId: "pal.antracit" },
      ],
    };

    const container = await mount({ input });

    expect(optionLabels(container, "hardwareTierId")).toEqual([
      "Hettich",
      "Blum",
    ]);
    expect(optionLabels(container, "finish")).not.toContain(
      roCopy("finish.pal.antracit"),
    );
    const alert = requireIn(row(container, "hardwareTierId"), '[role="alert"]');
    expect(alert.textContent).toBe(
      roCopy("priceDashboard.defaults.itemUnavailable"),
    );
    const group = requireIn(
      row(container, "hardwareTierId"),
      '[role="radiogroup"]',
    );
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(group.getAttribute("aria-describedby")).toContain(alert.id);
    expect(saveButton(container).disabled).toBe(true);

    await choose(radioOf(container, "hardwareTierId", "hardware.soft-close"));

    expect(allIn(container, '[role="alert"]')).toHaveLength(0);
    expect(saveButton(container).disabled).toBe(false);
  });
});

describe("a change of material (D9B)", () => {
  it("resets a colour the material does not offer to that material's default and says so, naming both colours", async () => {
    const container = await mount();

    await choose(radioOf(container, "materialTierId", "material.veneer"));

    expect(checkedValue(container, "finish")).toBe("veneer.stejar");
    expect(optionLabels(container, "finish")).toEqual([
      roCopy("finish.veneer.stejar"),
      roCopy("finish.veneer.nuc"),
    ]);
    expect(
      requireIn(row(container, "finish"), '[role="status"]').textContent,
    ).toBe(
      roCopy("priceDashboard.defaults.colourReset", {
        unavailableColour: roCopy("finish.pal.alb"),
        replacementColour: roCopy("finish.veneer.stejar"),
      }),
    );
  });

  it("marks the two rows that changed, enables Save, and offers Cancel", async () => {
    const container = await mount();

    await choose(radioOf(container, "materialTierId", "material.veneer"));

    const changed = allIn(container, `[data-modified="true"]`).map((element) =>
      element.getAttribute("data-member"),
    );
    expect(changed).toEqual(["materialTierId", "finish"]);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.defaults.modified"),
    );
    expect(saveButton(container).disabled).toBe(false);
    expect(cancelButton(container)).not.toBeNull();
  });

  it("says nothing when the material keeps the colour, and drops the note once a colour is chosen", async () => {
    const container = await mount();
    await choose(radioOf(container, "materialTierId", "material.veneer"));

    await choose(radioOf(container, "finish", "veneer.nuc"));

    expect(
      requireIn(row(container, "finish"), '[role="status"]').textContent,
    ).toBe("");
  });

  it("gives MDF a colour input in place of a list, starting at MDF's default colour", async () => {
    const container = await mount();

    await choose(radioOf(container, "materialTierId", "material.painted-mdf"));

    const picker = requireIn<HTMLInputElement>(
      row(container, "finish"),
      'input[type="color"]',
    );
    expect(picker.value).toBe("#eceeeb");
    expect(allIn(row(container, "finish"), 'input[type="radio"]')).toHaveLength(
      0,
    );
    expect(allIn(row(container, "finish"), '[role="radiogroup"]')).toHaveLength(
      0,
    );
    expect(
      requireIn(row(container, "finish"), '[role="group"]').contains(picker),
    ).toBe(true);
  });

  it("puts everything back on Cancel and moves focus to the page's heading", async () => {
    const container = await mount();
    await choose(radioOf(container, "materialTierId", "material.veneer"));

    click(cancelButton(container) ?? container);
    await flushPromises(3);

    expect(checkedValue(container, "materialTierId")).toBe("material.melamine");
    expect(checkedValue(container, "finish")).toBe("pal.alb");
    expect(allIn(container, `[data-modified="true"]`)).toHaveLength(0);
    expect(saveButton(container).disabled).toBe(true);
    expect(document.activeElement).toBe(requireIn(container, "h1"));
  });
});

describe("a save (D9C)", () => {
  it("writes all six settings with the revisions the page read, then shows the saved notice and moves focus to it", async () => {
    const held = heldClient({
      kind: "saved",
      saved: { revision: "2", availabilityRevision: "1" },
    });
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "cabinetDepthMm", "700"));

    await saveAndWait(container);

    expect(held.save).toHaveBeenCalledTimes(1);
    const request = held.save.mock.calls[0]?.[0];
    expect(request?.expectedRevision).toBe("1");
    expect(request?.expectedAvailabilityRevision).toBe("1");
    expect(Object.keys(request?.defaults ?? {}).sort()).toEqual(
      Object.keys(KITCHEN_DEFAULTS_MEMBERS).sort(),
    );
    expect(request?.defaults.cabinetDepthMm).toBe(700);
    expect(noticeText(container)).toContain(
      roCopy("priceDashboard.defaults.savedTitle"),
    );
    expect(noticeText(container)).toContain(
      roCopy("priceDashboard.defaults.savedBody"),
    );
    expect(document.activeElement).toBe(requireIn(container, "[data-tone]"));
  });

  it("takes what it saved as the new baseline: nothing is marked changed, Save is off again, and the next save names the new revision", async () => {
    const held = heldClient({
      kind: "saved",
      saved: { revision: "2", availabilityRevision: "1" },
    });
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "cabinetDepthMm", "700"));
    await saveAndWait(container);

    expect(allIn(container, `[data-modified="true"]`)).toHaveLength(0);
    expect(saveButton(container).disabled).toBe(true);
    await choose(radioOf(container, "handle", "black"));
    await saveAndWait(container);

    expect(held.save.mock.calls[1]?.[0].expectedRevision).toBe("2");
  });

  it("sends one request when the form is submitted twice before the first is answered", async () => {
    let answer: (outcome: DefaultsSaveOutcome) => void = () => undefined;
    const save = vi.fn<KitchenDefaultsClient["save"]>(
      () => new Promise((resolve) => (answer = resolve)),
    );
    const container = await mount({
      client: { save, readAgain: () => Promise.resolve(undefined) },
    });
    await choose(radioOf(container, "cabinetDepthMm", "700"));

    submitFormIn(container);
    submitFormIn(container);
    await flushPromises(3);
    answer({
      kind: "saved",
      saved: { revision: "2", availabilityRevision: "1" },
    });
    await flushPromises(5);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("is a whole write against the stand-in client, which accepts it and moves on its revision", async () => {
    const client = inMemoryKitchenDefaultsClient(SAMPLE_KITCHEN_DEFAULTS);
    const container = await mount({ client });
    await choose(radioOf(container, "materialTierId", "material.veneer"));

    await saveAndWait(container);

    expect(noticeText(container)).toContain(
      roCopy("priceDashboard.defaults.savedTitle"),
    );
    const again = await client.readAgain();
    expect(again?.state.defaults.materialTierId).toBe("material.veneer");
    expect(again?.state.defaults.finish).toEqual({
      kind: "palette-entry",
      entryId: "veneer.stejar",
    });
  });
});

describe("a save that is not accepted", () => {
  it("shows a refused value on its own row, tied to it, moves focus to that row, and keeps everything typed", async () => {
    const held = heldClient({
      kind: "invalid",
      issues: [{ field: "finish", code: "FINISH_NOT_IN_PALETTE" }],
    });
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "cabinetDepthMm", "700"));
    await choose(radioOf(container, "finish", "pal.antracit"));

    await saveAndWait(container);

    const group = requireIn(row(container, "finish"), '[role="radiogroup"]');
    const alert = requireIn(row(container, "finish"), '[role="alert"]');
    expect(alert.textContent).toBe(
      roCopy("priceDashboard.defaults.itemUnavailable"),
    );
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(group.getAttribute("aria-describedby")).toContain(alert.id);
    expect(row(container, "finish").contains(document.activeElement)).toBe(
      true,
    );
    expect(checkedValue(container, "cabinetDepthMm")).toBe("700");
    expect(checkedValue(container, "finish")).toBe("pal.antracit");
    expect(saveButton(container).disabled).toBe(true);
  });

  it("clears the refusal when that row is changed, and lets the person save again", async () => {
    const held = heldClient({
      kind: "invalid",
      issues: [{ field: "cabinetDepthMm", code: "UNKNOWN_VALUE" }],
    });
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "cabinetDepthMm", "700"));
    await saveAndWait(container);

    await choose(radioOf(container, "cabinetDepthMm", "600"));
    await choose(radioOf(container, "handle", "black"));

    expect(allIn(container, '[role="alert"]')).toHaveLength(0);
    expect(saveButton(container).disabled).toBe(false);
  });

  it("flags the row holding an item a 409 says is no longer available, and reads the facts again", async () => {
    const fresh: KitchenDefaultsPageInput = {
      ...SAMPLE_KITCHEN_DEFAULTS,
      disabled: [{ kind: "handle", handle: "black" }],
    };
    const held = heldClient(
      { kind: "item-unavailable", item: { kind: "handle", handle: "black" } },
      fresh,
    );
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "handle", "black"));

    await saveAndWait(container);

    expect(held.readAgain).toHaveBeenCalledTimes(1);
    expect(
      requireIn(row(container, "handle"), '[role="alert"]').textContent,
    ).toBe(roCopy("priceDashboard.defaults.itemUnavailable"));
    expect(
      allIn(row(container, "topRowHandle"), '[role="alert"]'),
    ).toHaveLength(0);
    expect(optionLabels(container, "handle")).not.toContain(
      roCopy("panel.handleLabels.black"),
    );
    expect(row(container, "handle").contains(document.activeElement)).toBe(
      true,
    );
  });

  it("says the data changed meanwhile when the defaults moved, takes the other member's values for every row left alone, and saves on the new revision without undoing them", async () => {
    const memory = inMemoryKitchenDefaultsClient(SAMPLE_KITCHEN_DEFAULTS);
    const save = vi.fn<KitchenDefaultsClient["save"]>((request) =>
      memory.save(request),
    );
    const container = await mount({
      client: { save, readAgain: () => memory.readAgain() },
    });
    await choose(radioOf(container, "cabinetDepthMm", "700"));
    await memory.save({
      expectedRevision: "1",
      expectedAvailabilityRevision: "1",
      defaults: { ...SAMPLE_KITCHEN_DEFAULTS.state.defaults, handle: "black" },
    });

    await saveAndWait(container);

    expect(noticeText(container)).toBe(
      roCopy("priceDashboard.errors.changedMeanwhile"),
    );
    expect(document.activeElement).toBe(requireIn(container, "[data-tone]"));
    expect(checkedValue(container, "cabinetDepthMm")).toBe("700");
    expect(checkedValue(container, "handle")).toBe("black");
    expect(
      allIn(container, `[data-modified="true"]`).map((element) =>
        element.getAttribute("data-member"),
      ),
    ).toEqual(["cabinetDepthMm"]);

    await saveAndWait(container);

    expect(save.mock.calls[1]?.[0].expectedRevision).toBe("2");
    expect(save.mock.calls[1]?.[0].defaults).toMatchObject({
      cabinetDepthMm: 700,
      handle: "black",
    });
    expect(noticeText(container)).toContain(
      roCopy("priceDashboard.defaults.savedTitle"),
    );
  });

  it("says the save failed when the facts cannot be read again after a conflict", async () => {
    const held = heldClient({ kind: "conflict" }, undefined);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "cabinetDepthMm", "700"));

    await saveAndWait(container);

    expect(noticeText(container)).toBe(
      roCopy("priceDashboard.errors.saveFailed"),
    );
  });

  it("says the save failed, and keeps the values, when the client answers failed or throws", async () => {
    const throwing: KitchenDefaultsClient = {
      save: () => Promise.reject(new Error("offline")),
      readAgain: () => Promise.resolve(undefined),
    };
    const container = await mount({ client: throwing });
    await choose(radioOf(container, "cabinetDepthMm", "700"));

    await saveAndWait(container);

    expect(noticeText(container)).toBe(
      roCopy("priceDashboard.errors.saveFailed"),
    );
    expect(document.activeElement).toBe(requireIn(container, "[data-tone]"));
    expect(checkedValue(container, "cabinetDepthMm")).toBe("700");
    expect(saveButton(container).disabled).toBe(false);
  });

  it("claims no save in a production build, which has no server behind it yet", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = await mount();
    await choose(radioOf(container, "cabinetDepthMm", "700"));

    await saveAndWait(container);

    expect(noticeText(container)).toBe(
      roCopy("priceDashboard.errors.saveFailed"),
    );
  });
});

describe("the in-memory client, which stands in for R4b's route", () => {
  const colourSwitchedOff: KitchenDefaultsPageInput = {
    ...SAMPLE_KITCHEN_DEFAULTS,
    disabled: [{ kind: "finish", finishId: "pal.antracit" }],
  };

  it("refuses a colour that is switched off as unavailable, naming the item, and writes nothing", async () => {
    const client = inMemoryKitchenDefaultsClient(colourSwitchedOff);
    const { state } = colourSwitchedOff;

    const outcome = await client.save({
      expectedRevision: state.revision,
      expectedAvailabilityRevision: state.availabilityRevision,
      defaults: { ...state.defaults, finish: paletteFinish("pal.antracit") },
    });

    expect(outcome).toEqual({
      kind: "item-unavailable",
      item: { kind: "finish", finishId: "pal.antracit" },
    });
    expect((await client.readAgain())?.state.revision).toBe(state.revision);
  });
});
