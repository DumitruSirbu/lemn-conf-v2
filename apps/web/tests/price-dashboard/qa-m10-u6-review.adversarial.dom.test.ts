// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U6's review changes, drawn and driven: the colour a rebase resets, the note over a save, and
// MDF's colour input while the kitchen holds no free colour. The first suite of this wave is in
// `qa-m10-u6-screen.adversarial.dom.test.ts`.
import { freeColourFinish, paletteFinish } from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DefaultsSaveOutcome,
  KitchenDefaultsClient,
} from "@/price-dashboard/kitchen-defaults-client";
import type { KitchenDefaultsPageInput } from "@/price-dashboard/kitchen-defaults-model";
import { KitchenDefaultsScreen } from "@/price-dashboard/kitchen-defaults-page";
import { SAMPLE_KITCHEN_DEFAULTS } from "@/price-dashboard/kitchen-defaults-sample";
import type {
  KitchenDefaultsMember,
  KitchenDefaultsWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  submitFormIn,
  typeInto,
  type MountedScreen,
} from "../support/render-with-intl";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const SAVED = SAMPLE_KITCHEN_DEFAULTS.state.defaults;
const PAL = "material.melamine";
const MDF = "material.painted-mdf";
const VENEER = "material.veneer";

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

type SaveFn = KitchenDefaultsClient["save"];

interface Held {
  readonly save: ReturnType<typeof vi.fn<SaveFn>>;
  readonly readAgain: ReturnType<
    typeof vi.fn<KitchenDefaultsClient["readAgain"]>
  >;
  readonly client: KitchenDefaultsClient;
}

function heldClient(
  outcomes: readonly DefaultsSaveOutcome[],
  fresh?: KitchenDefaultsPageInput,
): Held {
  let next = 0;
  const save = vi.fn<SaveFn>(() => {
    const outcome = outcomes[Math.min(next, outcomes.length - 1)];
    next += 1;
    return Promise.resolve(outcome ?? { kind: "failed" });
  });
  const readAgain = vi.fn<KitchenDefaultsClient["readAgain"]>(() =>
    Promise.resolve(fresh),
  );
  return { save, readAgain, client: { save, readAgain } };
}

const SAVED_AT_2: DefaultsSaveOutcome = {
  kind: "saved",
  saved: { revision: "2", availabilityRevision: "1" },
};

function inputWith(
  defaults: Partial<KitchenDefaultsWire>,
  rest: Partial<KitchenDefaultsPageInput> = {},
  revision = "1",
  availabilityRevision = "1",
): KitchenDefaultsPageInput {
  return {
    ...SAMPLE_KITCHEN_DEFAULTS,
    ...rest,
    state: {
      ...SAMPLE_KITCHEN_DEFAULTS.state,
      revision,
      availabilityRevision,
      defaults: { ...SAVED, ...defaults },
    },
  };
}

async function mount({
  input = SAMPLE_KITCHEN_DEFAULTS,
  client,
}: {
  input?: KitchenDefaultsPageInput;
  client?: KitchenDefaultsClient;
} = {}): Promise<HTMLElement> {
  screen = mountInCatalogue(
    createElement(KitchenDefaultsScreen, {
      locale: "ro",
      context: contextOf("administrator", ["kitchens", "cabinets", "defaults"]),
      input,
      client,
    }),
    "ro",
  );
  await flushPromises(5);
  return screen.container;
}

const row = (container: HTMLElement, member: KitchenDefaultsMember) =>
  requireIn(container, `[data-member="${member}"]`);

const radioOf = (
  container: HTMLElement,
  member: KitchenDefaultsMember,
  value: string,
) =>
  requireIn<HTMLInputElement>(
    row(container, member),
    `input[type="radio"][value="${value}"]`,
  );

const checkedValue = (container: HTMLElement, member: KitchenDefaultsMember) =>
  requireIn<HTMLInputElement>(
    row(container, member),
    "input[type='radio']:checked",
  ).value;

const saveButton = (container: HTMLElement) =>
  requireIn<HTMLButtonElement>(container, 'button[type="submit"]');

const cancelButton = (container: HTMLElement) =>
  allIn<HTMLButtonElement>(container, 'button[type="button"]').find(
    (button) =>
      button.textContent.trim() === roCopy("priceDashboard.common.cancel"),
  );

const colourInput = (container: HTMLElement) =>
  requireIn<HTMLInputElement>(row(container, "finish"), 'input[type="color"]');

const noticeText = (container: HTMLElement) =>
  requireIn(container, "[data-tone]").textContent.trim();

const alertsIn = (container: HTMLElement, member: KitchenDefaultsMember) =>
  allIn(row(container, member), '[role="alert"]');

async function choose(radio: HTMLInputElement): Promise<void> {
  click(radio);
  await flushPromises(3);
}

async function saveAndWait(container: HTMLElement): Promise<void> {
  submitFormIn(container);
  await flushPromises(8);
}

const MDF_WEARING_A_DECOR = inputWith({
  materialTierId: MDF,
  finish: paletteFinish("pal.alb"),
});

const noteOf = (container: HTMLElement) =>
  requireIn(row(container, "finish"), '[role="status"]').textContent;

describe("a conflict that makes the person's draft incoherent, or unsaveable", () => {
  it("lands a colour the new material lacks on that material's first colour still on offer, naming it, with nothing flagged", async () => {
    const fresh = inputWith(
      { materialTierId: VENEER, finish: paletteFinish("veneer.nuc") },
      { disabled: [{ kind: "finish", finishId: "veneer.stejar" }] },
      "2",
    );
    const held = heldClient([{ kind: "conflict" }, SAVED_AT_2], fresh);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "finish", "pal.antracit"));
    await choose(radioOf(container, "handle", "black"));

    await saveAndWait(container);

    expect(checkedValue(container, "materialTierId")).toBe(VENEER);
    expect(checkedValue(container, "finish")).toBe("veneer.nuc");
    expect(alertsIn(container, "finish")).toHaveLength(0);
    expect(noteOf(container)).toBe(
      roCopy("priceDashboard.defaults.colourReset", {
        unavailableColour: roCopy("finish.pal.antracit"),
        replacementColour: roCopy("finish.veneer.nuc"),
      }),
    );
    await saveAndWait(container);
    expect(held.save.mock.calls[1]?.[0].defaults).toMatchObject({
      materialTierId: VENEER,
      finish: paletteFinish("veneer.nuc"),
      handle: "black",
    });
  });

  it("flags, and does not reset, a colour the other member switched off that the person left alone", async () => {
    const fresh = inputWith(
      {},
      { disabled: [{ kind: "finish", finishId: "pal.alb" }] },
      "2",
    );
    const held = heldClient([{ kind: "conflict" }], fresh);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "handle", "black"));

    await saveAndWait(container);

    expect(alertsIn(container, "finish")).toHaveLength(1);
    expect(saveButton(container).disabled).toBe(true);
    expect(noteOf(container)).toBe("");

    await choose(radioOf(container, "finish", "pal.antracit"));

    expect(alertsIn(container, "finish")).toHaveLength(0);
    expect(saveButton(container).disabled).toBe(false);
  });

  it("takes the other member's whole (material, colour) pair when the person changed neither, and shows no note", async () => {
    const fresh = inputWith(
      { materialTierId: VENEER, finish: paletteFinish("veneer.nuc") },
      {},
      "2",
    );
    const held = heldClient([{ kind: "conflict" }], fresh);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "handle", "black"));

    await saveAndWait(container);

    expect(checkedValue(container, "materialTierId")).toBe(VENEER);
    expect(checkedValue(container, "finish")).toBe("veneer.nuc");
    expect(noteOf(container)).toBe("");
    expect(
      allIn(container, '[data-modified="true"]').map((element) =>
        element.getAttribute("data-member"),
      ),
    ).toEqual(["handle"]);
  });

  it("flags an item-unavailable 409 on the colour that was reset on the way, not on the one that was sent", async () => {
    const fresh = inputWith(
      {},
      { disabled: [{ kind: "finish", finishId: "pal.antracit" }] },
      "1",
    );
    const held = heldClient(
      [
        {
          kind: "item-unavailable",
          item: { kind: "finish", finishId: "pal.antracit" },
        },
      ],
      fresh,
    );
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "finish", "pal.antracit"));

    await saveAndWait(container);

    expect(alertsIn(container, "finish")).toHaveLength(1);
    expect(
      allIn<HTMLInputElement>(
        row(container, "finish"),
        "input[type='radio']",
      ).map((radio) => radio.value),
    ).not.toContain("pal.antracit");
    expect(row(container, "finish").contains(document.activeElement)).toBe(
      true,
    );
  });
});

describe("the colour-reset note over a save", () => {
  it("is gone once the save that made it succeeds, and the saved notice stands in its place", async () => {
    const held = heldClient([SAVED_AT_2]);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "materialTierId", VENEER));
    expect(noteOf(container)).not.toBe("");

    await saveAndWait(container);

    expect(noteOf(container)).toBe("");
    expect(noticeText(container)).toContain(
      roCopy("priceDashboard.defaults.savedTitle"),
    );
  });

  it("stays through a refusal, which wrote nothing and so changed nothing the note says", async () => {
    const held = heldClient([{ kind: "failed" }]);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "materialTierId", VENEER));

    await saveAndWait(container);

    expect(noteOf(container)).not.toBe("");
  });

  it("goes with Cancel and is not left by a later colour choice", async () => {
    const container = await mount();
    await choose(radioOf(container, "materialTierId", VENEER));
    await choose(radioOf(container, "finish", "veneer.nuc"));

    expect(noteOf(container)).toBe("");

    await choose(radioOf(container, "materialTierId", PAL));
    expect(noteOf(container)).not.toBe("");
    await choose(radioOf(container, "handle", "black"));
    expect(cancelButton(container)).toBeDefined();
    click(cancelButton(container) ?? container);
    await flushPromises(3);

    expect(noteOf(container)).toBe("");
  });

  it("still explains a colour reset made while the save was in the air, which the save did not write", async () => {
    let answer: (outcome: DefaultsSaveOutcome) => void = () => undefined;
    const save = vi.fn<KitchenDefaultsClient["save"]>(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const container = await mount({
      client: { save, readAgain: () => Promise.resolve(undefined) },
    });
    await choose(radioOf(container, "handle", "black"));
    submitFormIn(container);
    await flushPromises(3);
    await choose(radioOf(container, "materialTierId", VENEER));

    answer(SAVED_AT_2);
    await flushPromises(8);

    expect(checkedValue(container, "finish")).toBe("veneer.stejar");
    expect(
      allIn(container, '[data-modified="true"]').map((element) =>
        element.getAttribute("data-member"),
      ),
    ).toEqual(["materialTierId", "finish"]);
    expect(noteOf(container)).not.toBe("");
  });

  it("names the colour left behind and the one arrived at, in the sentence's order, for PAL to MDF and PAL to veneer", async () => {
    const container = await mount();

    await choose(radioOf(container, "materialTierId", MDF));
    expect(noteOf(container)).toBe(
      roCopy("priceDashboard.defaults.colourReset", {
        unavailableColour: roCopy("finish.pal.alb"),
        replacementColour: "#eceeeb",
      }),
    );

    await choose(radioOf(container, "materialTierId", VENEER));
    expect(noteOf(container)).toBe(
      roCopy("priceDashboard.defaults.colourReset", {
        unavailableColour: "#eceeeb",
        replacementColour: roCopy("finish.veneer.stejar"),
      }),
    );
  });
});

describe("MDF's colour input when the kitchen holds no free colour", () => {
  it("shows the default white in the input, an empty readout, and the default as a radio option beside it", async () => {
    const container = await mount({ input: MDF_WEARING_A_DECOR });

    const radios = allIn<HTMLInputElement>(
      row(container, "finish"),
      "input[type='radio']",
    );

    expect(colourInput(container).value).toBe("#eceeeb");
    expect(requireIn(row(container, "finish"), '[dir="ltr"]').textContent).toBe(
      "",
    );
    expect(radios.map((radio) => radio.value)).toEqual(["#eceeeb"]);
    expect(radios.every((radio) => !radio.checked)).toBe(true);
  });

  it("clears the error and enables Save when the default colour is chosen, and then offers no radio at all", async () => {
    const held = heldClient([SAVED_AT_2]);
    const container = await mount({
      input: MDF_WEARING_A_DECOR,
      client: held.client,
    });
    await choose(radioOf(container, "finish", "#eceeeb"));

    expect(alertsIn(container, "finish")).toHaveLength(0);
    expect(allIn(row(container, "finish"), "input[type='radio']")).toHaveLength(
      0,
    );
    expect(saveButton(container).disabled).toBe(false);
    await saveAndWait(container);

    expect(held.save.mock.calls[0]?.[0].defaults.finish).toEqual(
      freeColourFinish("#eceeeb"),
    );
  });

  it("lets black be picked from the input in that state, which changes the colour although the input already showed a colour", async () => {
    const held = heldClient([SAVED_AT_2]);
    const container = await mount({
      input: MDF_WEARING_A_DECOR,
      client: held.client,
    });

    typeInto(colourInput(container), "#000000");
    await flushPromises(3);
    await saveAndWait(container);

    expect(held.save.mock.calls[0]?.[0].defaults.finish).toEqual(
      freeColourFinish("#000000"),
    );
    expect(allIn(row(container, "finish"), "input[type='radio']")).toHaveLength(
      0,
    );
  });

  it("offers no default-colour radio where the material has a list or the kitchen already holds a free colour", async () => {
    for (const input of [
      SAMPLE_KITCHEN_DEFAULTS,
      inputWith({
        materialTierId: VENEER,
        finish: paletteFinish("veneer.nuc"),
      }),
      inputWith({ materialTierId: MDF, finish: freeColourFinish("#123456") }),
    ]) {
      const container = await mount({ input });
      const values = allIn<HTMLInputElement>(
        row(container, "finish"),
        "input[type='radio']",
      ).map((radio) => radio.value);

      expect(values).not.toContain("#eceeeb");
      screen?.unmount();
      screen = undefined;
    }
  });

  it("is a radio group of its own only while it holds a radio, and keeps the colour input inside the labelled group", async () => {
    const container = await mount({ input: MDF_WEARING_A_DECOR });

    const group = requireIn(row(container, "finish"), "[aria-labelledby]");

    expect(group.contains(colourInput(container))).toBe(true);
    expect(group.getAttribute("aria-labelledby")).not.toBe("");
    const labelId = group.getAttribute("aria-labelledby") ?? "";
    expect(requireIn(container, `[id="${labelId}"]`).textContent).toBe(
      roCopy("priceDashboard.defaults.colour"),
    );
  });

  it("moves MDF to PAL and back through the reset, holding no radio on the way", async () => {
    const container = await mount({
      input: inputWith({
        materialTierId: MDF,
        finish: freeColourFinish("#336699"),
      }),
    });

    await choose(radioOf(container, "materialTierId", PAL));
    expect(checkedValue(container, "finish")).toBe("pal.alb");
    await choose(radioOf(container, "materialTierId", MDF));

    expect(colourInput(container).value).toBe("#eceeeb");
    expect(allIn(row(container, "finish"), "input[type='radio']")).toHaveLength(
      0,
    );
    expect(alertsIn(container, "finish")).toHaveLength(0);
  });
});
