// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U6, the defaults screen drawn and driven: a free colour that is not a colour, an edit made
// while a save is in the air, the row a refusal lands on, a colour row whose error must reach the colour input, Cancel
// over every row, a conflict that leaves a coherent or an incoherent draft, and the words and names a person meets.
import {
  FREE_COLOUR_PATTERN,
  freeColourFinish,
  paletteFinish,
} from "@lemnaria/configurator-domain";
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

function pendingSave(): {
  readonly save: SaveFn;
  readonly answer: (outcome: DefaultsSaveOutcome) => void;
} {
  let answer: (outcome: DefaultsSaveOutcome) => void = () => undefined;
  const save: SaveFn = () =>
    new Promise<DefaultsSaveOutcome>((resolve) => {
      answer = resolve;
    });
  return {
    save,
    answer: (outcome) => {
      answer(outcome);
    },
  };
}

describe("MDF's free colour", () => {
  const MDF_INPUT = inputWith({
    materialTierId: MDF,
    finish: freeColourFinish("#eceeeb"),
  });

  it("sends the colour the picker holds, in the six-digit lowercase form, for a colour picked", async () => {
    const held = heldClient([SAVED_AT_2]);
    const container = await mount({ input: MDF_INPUT, client: held.client });

    typeInto(colourInput(container), "#12AB34");
    await flushPromises(3);
    await saveAndWait(container);

    expect(held.save.mock.calls[0]?.[0].defaults.finish).toEqual({
      kind: "free-colour",
      value: "#12ab34",
    });
    expect(requireIn(row(container, "finish"), '[dir="ltr"]').textContent).toBe(
      "#12ab34",
    );
  });

  it.each(["", "#abc", "red", "#12345", "abcdef", "#12345g", " #123456"])(
    "never sends a value that is not a six-digit hex colour, whatever is typed into the picker (%j)",
    async (typed) => {
      const held = heldClient([SAVED_AT_2]);
      const container = await mount({ input: MDF_INPUT, client: held.client });

      typeInto(colourInput(container), typed);
      await flushPromises(3);
      await saveAndWait(container);

      for (const [request] of held.save.mock.calls) {
        const { finish } = request.defaults;
        expect(finish.kind).toBe("free-colour");
        if (finish.kind === "free-colour") {
          expect(FREE_COLOUR_PATTERN.test(finish.value)).toBe(true);
        }
      }
    },
  );

  it("reads the same colour back as unchanged when the picker is set to the saved value in another case", async () => {
    const container = await mount({
      input: inputWith({
        materialTierId: MDF,
        finish: freeColourFinish("#eceeeb"),
      }),
    });

    typeInto(colourInput(container), "#ECEEEB");
    await flushPromises(3);

    expect(
      allIn(container, '[data-modified="true"]').map((element) =>
        element.getAttribute("data-member"),
      ),
    ).toEqual([]);
    expect(saveButton(container).disabled).toBe(true);
  });

  it("sends exactly one request for a picked colour, with the other five members as saved", async () => {
    const held = heldClient([SAVED_AT_2]);
    const container = await mount({ input: MDF_INPUT, client: held.client });

    typeInto(colourInput(container), "#336699");
    await flushPromises(3);
    await saveAndWait(container);

    expect(held.save).toHaveBeenCalledTimes(1);
    expect(held.save.mock.calls[0]?.[0].defaults).toEqual({
      ...MDF_INPUT.state.defaults,
      finish: freeColourFinish("#336699"),
    });
  });
});

describe("a colour row in error, on MDF", () => {
  const MDF_WEARING_A_DECOR = inputWith({
    materialTierId: MDF,
    finish: paletteFinish("pal.alb"),
  });

  it("flags a palette colour held with MDF, keeps Save off, and offers the colour input to correct it", async () => {
    const container = await mount({ input: MDF_WEARING_A_DECOR });

    expect(alertsIn(container, "finish")).toHaveLength(1);
    expect(saveButton(container).disabled).toBe(true);
    expect(colourInput(container)).not.toBeNull();
  });

  it("ties that error to the colour input a person is asked to correct: described by it and marked invalid", async () => {
    const container = await mount({ input: MDF_WEARING_A_DECOR });

    const alert = requireIn(row(container, "finish"), '[role="alert"]');
    const picker = colourInput(container);

    expect(picker.getAttribute("aria-describedby")?.split(" ")).toContain(
      alert.id,
    );
    expect(picker.getAttribute("aria-invalid")).toBe("true");
  });

  it("ties a server's refusal of the colour to the colour input as well", async () => {
    const held = heldClient([
      {
        kind: "invalid",
        issues: [{ field: "finish", code: "FINISH_NOT_IN_PALETTE" }],
      },
    ]);
    const container = await mount({
      input: inputWith({
        materialTierId: MDF,
        finish: freeColourFinish("#eceeeb"),
      }),
      client: held.client,
    });
    typeInto(colourInput(container), "#336699");
    await flushPromises(3);

    await saveAndWait(container);

    const alert = requireIn(row(container, "finish"), '[role="alert"]');
    expect(colourInput(container).getAttribute("aria-describedby")).toContain(
      alert.id,
    );
    expect(row(container, "finish").contains(document.activeElement)).toBe(
      true,
    );
  });
});

describe("an edit made while a save is in the air", () => {
  async function inFlight(): Promise<{
    container: HTMLElement;
    answer: (outcome: DefaultsSaveOutcome) => void;
    save: ReturnType<typeof vi.fn<SaveFn>>;
    readAgain: ReturnType<typeof vi.fn<KitchenDefaultsClient["readAgain"]>>;
  }> {
    const pending = pendingSave();
    const save = vi.fn<SaveFn>(pending.save);
    const fresh = inputWith({ topRowHandle: "steel" }, {}, "2", "1");
    const readAgain = vi.fn<KitchenDefaultsClient["readAgain"]>(() =>
      Promise.resolve(fresh),
    );
    const container = await mount({ client: { save, readAgain } });
    await choose(radioOf(container, "cabinetDepthMm", "700"));
    submitFormIn(container);
    await flushPromises(3);
    return { container, answer: pending.answer, save, readAgain };
  }

  it("marks the screen busy and keeps a second save and Cancel from acting while the first is in the air", async () => {
    const { container, save } = await inFlight();

    expect(requireIn(container, "form").getAttribute("aria-busy")).toBe("true");
    expect(saveButton(container).disabled).toBe(true);
    expect(cancelButton(container)?.disabled).toBe(true);
    submitFormIn(container);
    await flushPromises(3);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps the change and counts it as unsaved when the save that was in the air succeeds", async () => {
    const { container, answer } = await inFlight();
    await choose(radioOf(container, "handle", "black"));

    answer(SAVED_AT_2);
    await flushPromises(5);

    expect(checkedValue(container, "handle")).toBe("black");
    expect(checkedValue(container, "cabinetDepthMm")).toBe("700");
    expect(
      allIn(container, '[data-modified="true"]').map((element) =>
        element.getAttribute("data-member"),
      ),
    ).toEqual(["handle"]);
  });

  it("keeps the change when the save that was in the air is answered with a conflict", async () => {
    const { container, answer } = await inFlight();
    await choose(radioOf(container, "handle", "black"));

    answer({ kind: "conflict" });
    await flushPromises(8);

    expect(noticeText(container)).toBe(
      roCopy("priceDashboard.errors.changedMeanwhile"),
    );
    expect(checkedValue(container, "cabinetDepthMm")).toBe("700");
    expect(checkedValue(container, "topRowHandle")).toBe("steel");
    expect(checkedValue(container, "handle")).toBe("black");
  });

  it("keeps the change when the save that was in the air is refused as an unavailable item", async () => {
    const { container, answer } = await inFlight();
    await choose(radioOf(container, "hardwareTierId", "hardware.premium"));

    answer({
      kind: "item-unavailable",
      item: { kind: "handle", handle: "push" },
    });
    await flushPromises(8);

    expect(checkedValue(container, "hardwareTierId")).toBe("hardware.premium");
    expect(checkedValue(container, "cabinetDepthMm")).toBe("700");
  });
});

describe("the row a 409 item-unavailable lands on", () => {
  function unavailableHandle(
    handle: "steel" | "black" | "push",
  ): DefaultsSaveOutcome {
    return { kind: "item-unavailable", item: { kind: "handle", handle } };
  }
  const freshWithout = (handle: "steel" | "black" | "push") =>
    inputWith({}, { disabled: [{ kind: "handle", handle }] }, "1", "1");

  it("flags only the top-row row when only it holds the item, and moves focus there", async () => {
    const held = heldClient(
      [unavailableHandle("black")],
      freshWithout("black"),
    );
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "topRowHandle", "black"));

    await saveAndWait(container);

    expect(alertsIn(container, "topRowHandle")).toHaveLength(1);
    expect(alertsIn(container, "handle")).toHaveLength(0);
    expect(
      row(container, "topRowHandle").contains(document.activeElement),
    ).toBe(true);
    expect(saveButton(container).disabled).toBe(true);
  });

  it("flags both handle rows when both hold the item, and moves focus to the first of them", async () => {
    const held = heldClient(
      [unavailableHandle("black")],
      freshWithout("black"),
    );
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "handle", "black"));
    await choose(radioOf(container, "topRowHandle", "black"));

    await saveAndWait(container);

    expect(alertsIn(container, "handle")).toHaveLength(1);
    expect(alertsIn(container, "topRowHandle")).toHaveLength(1);
    expect(row(container, "handle").contains(document.activeElement)).toBe(
      true,
    );
  });

  it("recovers: choosing another handle on a flagged row clears only that row", async () => {
    const held = heldClient(
      [unavailableHandle("black")],
      freshWithout("black"),
    );
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "handle", "black"));
    await choose(radioOf(container, "topRowHandle", "black"));
    await saveAndWait(container);

    await choose(radioOf(container, "handle", "steel"));

    expect(alertsIn(container, "handle")).toHaveLength(0);
    expect(alertsIn(container, "topRowHandle")).toHaveLength(1);
    expect(saveButton(container).disabled).toBe(true);
  });

  it("names the material row for an unavailable material, and the hardware row for an unavailable hardware tier", async () => {
    const outcomes: [DefaultsSaveOutcome, KitchenDefaultsMember][] = [
      [
        {
          kind: "item-unavailable",
          item: { kind: "material", tierId: VENEER },
        },
        "materialTierId",
      ],
      [
        {
          kind: "item-unavailable",
          item: { kind: "hardware", tierId: "hardware.premium" },
        },
        "hardwareTierId",
      ],
    ];
    for (const [outcome, member] of outcomes) {
      const held = heldClient([outcome], SAMPLE_KITCHEN_DEFAULTS);
      const container = await mount({ client: held.client });
      await choose(radioOf(container, "materialTierId", VENEER));
      await choose(radioOf(container, "hardwareTierId", "hardware.premium"));

      await saveAndWait(container);

      expect(alertsIn(container, member), member).toHaveLength(1);
      screen?.unmount();
      screen = undefined;
    }
  });
});

describe("a 400", () => {
  it("shows the save-failed notice and flags no row when it names only a field that is not a row of this screen", async () => {
    const held = heldClient([
      {
        kind: "invalid",
        issues: [{ field: "expectedRevision", code: "UNKNOWN_VALUE" }],
      },
    ]);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "cabinetDepthMm", "700"));

    await saveAndWait(container);

    expect(noticeText(container)).toBe(
      roCopy("priceDashboard.errors.saveFailed"),
    );
    expect(allIn(container, '[data-member] [role="alert"]')).toHaveLength(0);
    expect(checkedValue(container, "cabinetDepthMm")).toBe("700");
    expect(saveButton(container).disabled).toBe(false);
  });

  it("flags every row it names and focuses the first in the page's order, whatever order it listed them in", async () => {
    const held = heldClient([
      {
        kind: "invalid",
        issues: [
          { field: "topRowHandle", code: "UNKNOWN_VALUE" },
          { field: "cabinetDepthMm", code: "UNKNOWN_VALUE" },
        ],
      },
    ]);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "cabinetDepthMm", "700"));

    await saveAndWait(container);

    expect(alertsIn(container, "cabinetDepthMm")).toHaveLength(1);
    expect(alertsIn(container, "topRowHandle")).toHaveLength(1);
    expect(
      row(container, "cabinetDepthMm").contains(document.activeElement),
    ).toBe(true);
  });
});

describe("a conflict", () => {
  it("rebases on both revisions: the next save names the fresh revision and the fresh availability revision", async () => {
    const fresh = inputWith({ handle: "black" }, {}, "5", "9");
    const held = heldClient([{ kind: "conflict" }, SAVED_AT_2], fresh);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "cabinetDepthMm", "700"));
    await saveAndWait(container);

    await saveAndWait(container);

    const [first, second] = held.save.mock.calls.map(([request]) => request);
    expect([
      first?.expectedRevision,
      first?.expectedAvailabilityRevision,
    ]).toEqual(["1", "1"]);
    expect([
      second?.expectedRevision,
      second?.expectedAvailabilityRevision,
    ]).toEqual(["5", "9"]);
  });

  const ROWS_WITHOUT_COUPLING = [
    ["hardwareTierId", "hardware.premium"],
    ["cabinetDepthMm", "700"],
    ["handle", "black"],
    ["topRowHandle", "steel"],
  ] as const;
  const pairs = ROWS_WITHOUT_COUPLING.flatMap((theirs) =>
    ROWS_WITHOUT_COUPLING.filter((mine) => mine[0] !== theirs[0]).map(
      (mine) => [theirs, mine] as const,
    ),
  );

  it.each(pairs)(
    "keeps %j's change from the other member and %j's from this person, each on its own row, and saves both",
    async ([theirsMember, theirsValue], [mineMember, mineValue]) => {
      const typed = (member: string, value: string) =>
        member === "cabinetDepthMm" ? Number(value) : value;
      const fresh = inputWith(
        { [theirsMember]: typed(theirsMember, theirsValue) },
        {},
        "2",
        "1",
      );
      const held = heldClient([{ kind: "conflict" }, SAVED_AT_2], fresh);
      const container = await mount({ client: held.client });
      await choose(radioOf(container, mineMember, mineValue));

      await saveAndWait(container);

      expect(checkedValue(container, theirsMember)).toBe(theirsValue);
      expect(checkedValue(container, mineMember)).toBe(mineValue);
      expect(
        allIn(container, '[data-modified="true"]').map((element) =>
          element.getAttribute("data-member"),
        ),
      ).toEqual([mineMember]);

      await saveAndWait(container);

      expect(held.save.mock.calls[1]?.[0].defaults).toMatchObject({
        [theirsMember]: typed(theirsMember, theirsValue),
        [mineMember]: typed(mineMember, mineValue),
      });
    },
  );

  it("keeps the colour this person chose when the material they chose came with it, over another member's colour", async () => {
    const fresh = inputWith({ finish: paletteFinish("pal.antracit") }, {}, "2");
    const held = heldClient([{ kind: "conflict" }, SAVED_AT_2], fresh);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "materialTierId", VENEER));

    await saveAndWait(container);

    expect(checkedValue(container, "materialTierId")).toBe(VENEER);
    expect(checkedValue(container, "finish")).toBe("veneer.stejar");
    expect(saveButton(container).disabled).toBe(false);
  });

  it("does not send a decor for MDF when another member moved the material to MDF under a colour this person chose: the row is flagged and Save stays off", async () => {
    const fresh = inputWith(
      { materialTierId: MDF, finish: freeColourFinish("#eceeeb") },
      {},
      "2",
    );
    const held = heldClient([{ kind: "conflict" }, SAVED_AT_2], fresh);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "finish", "pal.antracit"));

    await saveAndWait(container);
    await saveAndWait(container);

    expect(alertsIn(container, "finish")).toHaveLength(1);
    expect(saveButton(container).disabled).toBe(true);
    for (const [request] of held.save.mock.calls) {
      const { materialTierId, finish } = request.defaults;
      expect(materialTierId === MDF && finish.kind === "palette-entry").toBe(
        false,
      );
    }
  });

  it("says the save failed and keeps every change when the facts cannot be read again", async () => {
    const held = heldClient([{ kind: "conflict" }], undefined);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "handle", "black"));

    await saveAndWait(container);

    expect(noticeText(container)).toBe(
      roCopy("priceDashboard.errors.saveFailed"),
    );
    expect(checkedValue(container, "handle")).toBe("black");
    expect(saveButton(container).disabled).toBe(false);
  });
});

describe("the stand-in client, judged like the route", () => {
  it("answers a stale availability revision alone as a conflict, and writes nothing", async () => {
    const client = inMemoryKitchenDefaultsClient(SAMPLE_KITCHEN_DEFAULTS);
    const { state } = SAMPLE_KITCHEN_DEFAULTS;

    const outcome = await client.save({
      expectedRevision: state.revision,
      expectedAvailabilityRevision: "0",
      defaults: { ...state.defaults, handle: "black" },
    });

    expect(outcome).toEqual({ kind: "conflict" });
    expect((await client.readAgain())?.state.defaults.handle).toBe(
      state.defaults.handle,
    );
  });

  it("answers a depth nobody manufactures as a 400 naming the depth row, and a colour its material does not offer as the colour row", async () => {
    const client = inMemoryKitchenDefaultsClient(SAMPLE_KITCHEN_DEFAULTS);
    const { state } = SAMPLE_KITCHEN_DEFAULTS;
    const request = (defaults: KitchenDefaultsWire) => ({
      expectedRevision: state.revision,
      expectedAvailabilityRevision: state.availabilityRevision,
      defaults,
    });

    const depth = await client.save(
      request({ ...state.defaults, cabinetDepthMm: 650 }),
    );
    const colour = await client.save(
      request({ ...state.defaults, finish: freeColourFinish("#123456") }),
    );

    expect(depth).toEqual({
      kind: "invalid",
      issues: [{ field: "cabinetDepthMm", code: "UNKNOWN_VALUE" }],
    });
    expect(colour).toMatchObject({
      kind: "invalid",
      issues: [{ field: "finish" }],
    });
  });
});

describe("Cancel", () => {
  const CHANGES = [
    ["materialTierId", VENEER],
    ["hardwareTierId", "hardware.premium"],
    ["cabinetDepthMm", "700"],
    ["finish", "pal.antracit"],
    ["handle", "black"],
    ["topRowHandle", "steel"],
  ] as const;

  it.each(CHANGES)(
    "puts the %s row back to the saved value (after choosing %s) and every other row stays the saved one",
    async (member, value) => {
      const container = await mount();
      await choose(radioOf(container, member, value));

      click(cancelButton(container) ?? container);
      await flushPromises(3);

      expect(checkedValue(container, "materialTierId")).toBe(PAL);
      expect(checkedValue(container, "hardwareTierId")).toBe(
        SAVED.hardwareTierId,
      );
      expect(checkedValue(container, "cabinetDepthMm")).toBe("600");
      expect(checkedValue(container, "finish")).toBe("pal.alb");
      expect(checkedValue(container, "handle")).toBe(SAVED.handle);
      expect(checkedValue(container, "topRowHandle")).toBe(SAVED.topRowHandle);
      expect(allIn(container, '[data-modified="true"]')).toHaveLength(0);
      expect(saveButton(container).disabled).toBe(true);
      expect(cancelButton(container)).toBeUndefined();
    },
  );

  it("puts every row back at once, a free colour included, and clears the colour-reset note", async () => {
    const mdfSaved = inputWith({
      materialTierId: MDF,
      finish: freeColourFinish("#336699"),
    });
    const container = await mount({ input: mdfSaved });
    await choose(radioOf(container, "materialTierId", PAL));
    await choose(radioOf(container, "handle", "black"));
    await choose(radioOf(container, "cabinetDepthMm", "700"));
    expect(
      requireIn(row(container, "finish"), '[role="status"]').textContent,
    ).not.toBe("");

    click(cancelButton(container) ?? container);
    await flushPromises(3);

    expect(colourInput(container).value).toBe("#336699");
    expect(checkedValue(container, "materialTierId")).toBe(MDF);
    expect(
      requireIn(row(container, "finish"), '[role="status"]').textContent,
    ).toBe("");
    expect(allIn(container, '[data-modified="true"]')).toHaveLength(0);
  });

  it("clears a server's refusal along with the change, so no error stands over a value that is no longer there", async () => {
    const held = heldClient([
      {
        kind: "invalid",
        issues: [{ field: "cabinetDepthMm", code: "UNKNOWN_VALUE" }],
      },
    ]);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "cabinetDepthMm", "700"));
    await saveAndWait(container);
    expect(alertsIn(container, "cabinetDepthMm")).toHaveLength(1);

    click(cancelButton(container) ?? container);
    await flushPromises(3);

    expect(allIn(container, '[role="alert"]')).toHaveLength(0);
    expect(checkedValue(container, "cabinetDepthMm")).toBe("600");
  });

  it("goes back to what a save established, not to what the page first read", async () => {
    const held = heldClient([SAVED_AT_2]);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "cabinetDepthMm", "700"));
    await saveAndWait(container);
    await choose(radioOf(container, "handle", "black"));

    click(cancelButton(container) ?? container);
    await flushPromises(3);

    expect(checkedValue(container, "cabinetDepthMm")).toBe("700");
    expect(checkedValue(container, "handle")).toBe(SAVED.handle);
  });
});

describe("saving more than once", () => {
  it("sends the whole object each time, with every earlier change in it and the revision the last save made", async () => {
    const held = heldClient([
      SAVED_AT_2,
      { kind: "saved", saved: { revision: "3", availabilityRevision: "1" } },
    ]);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "handle", "black"));
    await saveAndWait(container);
    await choose(radioOf(container, "cabinetDepthMm", "700"));
    await saveAndWait(container);

    const [first, second] = held.save.mock.calls.map(([request]) => request);
    expect(first?.defaults).toEqual({ ...SAVED, handle: "black" });
    expect(second?.defaults).toEqual({
      ...SAVED,
      handle: "black",
      cabinetDepthMm: 700,
    });
    expect(second?.expectedRevision).toBe("2");
  });

  it("can save again after a failure: the guard against a double submit is released, and the person's values are sent again", async () => {
    const held = heldClient([{ kind: "failed" }, SAVED_AT_2]);
    const container = await mount({ client: held.client });
    await choose(radioOf(container, "handle", "black"));
    await saveAndWait(container);
    expect(noticeText(container)).toBe(
      roCopy("priceDashboard.errors.saveFailed"),
    );

    await saveAndWait(container);

    expect(held.save).toHaveBeenCalledTimes(2);
    expect(held.save.mock.calls[1]?.[0]).toEqual(held.save.mock.calls[0]?.[0]);
    expect(noticeText(container)).toContain(
      roCopy("priceDashboard.defaults.savedTitle"),
    );
  });

  it("does not submit when nothing differs from what is saved, even if the form is submitted", async () => {
    const held = heldClient([SAVED_AT_2]);
    const container = await mount({ client: held.client });

    await saveAndWait(container);

    expect(held.save).not.toHaveBeenCalled();
  });

  it("does not submit while a row is flagged, even if the form is submitted", async () => {
    const held = heldClient([SAVED_AT_2]);
    const container = await mount({
      input: inputWith(
        {},
        { disabled: [{ kind: "hardware", tierId: SAVED.hardwareTierId }] },
      ),
      client: held.client,
    });
    await choose(radioOf(container, "handle", "black"));

    await saveAndWait(container);

    expect(held.save).not.toHaveBeenCalled();
  });
});

describe("availability is judged on the screen", () => {
  it("flags the material's default colour when it is switched off, keeps Save off, and lets another colour clear it", async () => {
    const held = heldClient([SAVED_AT_2]);
    const container = await mount({
      input: inputWith(
        {},
        { disabled: [{ kind: "finish", finishId: "veneer.stejar" }] },
      ),
      client: held.client,
    });

    await choose(radioOf(container, "materialTierId", VENEER));

    expect(
      allIn(row(container, "finish"), "input[type='radio']:checked"),
    ).toHaveLength(0);
    expect(alertsIn(container, "finish")).toHaveLength(1);
    expect(saveButton(container).disabled).toBe(true);

    await choose(radioOf(container, "finish", "veneer.nuc"));
    await saveAndWait(container);

    expect(alertsIn(container, "finish")).toHaveLength(0);
    expect(held.save.mock.calls[0]?.[0].defaults).toMatchObject({
      materialTierId: VENEER,
      finish: paletteFinish("veneer.nuc"),
    });
  });

  it("offers a switched-off material, tier and handle nowhere, however many are off, and no option twice", async () => {
    const container = await mount({
      input: inputWith(
        {},
        {
          disabled: [
            { kind: "material", tierId: MDF },
            { kind: "hardware", tierId: "hardware.premium" },
            { kind: "handle", handle: "push" },
          ],
        },
      ),
    });

    for (const [member, absent] of [
      ["materialTierId", MDF],
      ["hardwareTierId", "hardware.premium"],
      ["handle", "push"],
      ["topRowHandle", "push"],
    ] as const) {
      const values = allIn<HTMLInputElement>(
        row(container, member),
        "input[type='radio']",
      ).map((radio) => radio.value);

      expect(values, member).not.toContain(absent);
      expect(new Set(values).size, member).toBe(values.length);
    }
  });
});

describe("a production build", () => {
  it("writes nothing and says so: no request leaves the page, and the saved values stay as they were", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fetched = vi.mocked(fetch).mock.calls.length;
    const container = await mount();
    await choose(radioOf(container, "handle", "black"));

    await saveAndWait(container);
    await saveAndWait(container);

    expect(noticeText(container)).toBe(
      roCopy("priceDashboard.errors.saveFailed"),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.slice(fetched)
        .filter(
          ([address]) =>
            typeof address === "string" && /default/i.test(address),
        ),
    ).toEqual([]);
    expect(checkedValue(container, "handle")).toBe("black");
  });
});

describe("what a person meets", () => {
  it("names every control: each radio by its option's words, the colour input and the buttons by theirs", async () => {
    const container = await mount({
      input: inputWith({
        materialTierId: MDF,
        finish: freeColourFinish("#eceeeb"),
      }),
    });
    await choose(radioOf(container, "cabinetDepthMm", "700"));

    for (const radio of allIn<HTMLInputElement>(
      container,
      "input[type='radio']",
    )) {
      expect(radio.closest("label")?.textContent.trim(), radio.value).not.toBe(
        "",
      );
    }
    expect(colourInput(container).getAttribute("aria-label")).toBe(
      roCopy("priceDashboard.defaults.colour"),
    );
    for (const button of allIn(container, "form button")) {
      expect(button.textContent.trim()).not.toBe("");
    }
  });

  it("points every aria reference at an element that exists, and gives every group a name", async () => {
    const container = await mount({
      input: inputWith(
        {},
        { disabled: [{ kind: "hardware", tierId: SAVED.hardwareTierId }] },
      ),
    });
    await choose(radioOf(container, "materialTierId", MDF));

    for (const element of allIn(
      container,
      "[aria-describedby],[aria-labelledby]",
    )) {
      for (const attribute of ["aria-describedby", "aria-labelledby"]) {
        for (const id of (element.getAttribute(attribute) ?? "")
          .split(" ")
          .filter((token) => token !== "")) {
          expect(
            container.querySelector(`[id="${id}"]`),
            `${attribute} ${id}`,
          ).not.toBeNull();
        }
      }
    }
    for (const group of allIn(
      container,
      '[role="radiogroup"],[role="group"]',
    )) {
      const name = (group.getAttribute("aria-labelledby") ?? "")
        .split(" ")
        .map((id) => container.querySelector(`[id="${id}"]`)?.textContent ?? "")
        .join("");
      expect(name.trim(), group.className).not.toBe("");
    }
  });

  it("repeats no id on the page", async () => {
    const container = await mount({
      input: inputWith(
        {},
        { disabled: [{ kind: "hardware", tierId: SAVED.hardwareTierId }] },
      ),
    });

    const ids = allIn(container, "[id]").map((element) => element.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("draws the heading, then the notice, then the rows in the frame's order, then the actions: the order of the page is the order of the eye", async () => {
    const container = await mount();
    await choose(radioOf(container, "cabinetDepthMm", "700"));

    const position = (element: Element) =>
      Array.from(container.querySelectorAll("*")).indexOf(element);
    const heading = position(requireIn(container, "h1"));
    const notice = position(requireIn(container, "[data-tone]"));
    const rows = allIn(container, "[data-member]").map(position);
    const actions = allIn(container, "form button").map(position);

    expect(heading).toBeLessThan(notice);
    expect(notice).toBeLessThan(rows[0] ?? 0);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    expect(actions.every((place) => place > (rows.at(-1) ?? 0))).toBe(true);
    const buttons = allIn(container, "form button").map((button) =>
      button.textContent.trim(),
    );
    expect(buttons).toEqual([
      roCopy("priceDashboard.common.save"),
      roCopy("priceDashboard.common.cancel"),
    ]);
  });

  it("shows each row's own label once, with its hint tied to the group, and no price anywhere", async () => {
    const container = await mount();

    for (const member of [
      "materialTierId",
      "hardwareTierId",
      "cabinetDepthMm",
      "finish",
      "handle",
      "topRowHandle",
    ] as const) {
      const group = requireIn(row(container, member), '[role="radiogroup"]');
      const described = (group.getAttribute("aria-describedby") ?? "").split(
        " ",
      );
      expect(described.length, member).toBeGreaterThan(0);
      for (const id of described) {
        expect(container.querySelector(`[id="${id}"]`), member).not.toBeNull();
      }
    }
    expect(container.textContent).not.toMatch(/\blei\b|\bMDL\b|\d\s?€/i);
  });
});
