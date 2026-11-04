// @vitest-environment happy-dom
//
// Counterexamples for the rename of a class the catalogue does not key: the field refuses what the domain refuses and in
// the domain's words, a class the draft deletes offers no field, the production client offers none, a second press while a
// save is out sends nothing, an answer that arrives after the person typed on does not overwrite what they typed, and
// typing the published name back leaves no change in "De publicat".
import fc from "fast-check";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  judgeCreatedRowText,
  SAMPLE_PRICE_BOOK,
  type CreatedRowTextRefusalCode,
  type DraftChange,
  type HardwareTier,
} from "@lemnaria/configurator-domain";

import { HardwareEditScreen } from "@/price-dashboard/hardware-edit";
import {
  FETCHING_PRICE_DRAFT_CLIENT,
  type DraftChangeOutcome,
} from "@/price-dashboard/price-draft-client";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn, click, mountInCatalogue } from "../support/render-with-intl";
import {
  alertsIn,
  buttonNamed,
  fieldNamed,
  settle,
  typeInField,
} from "./cabinet-detail-harness";
import {
  BLUM,
  CREATED,
  CREATED_CLASS,
  HETTICH,
  hardwarePageOf,
  mountHardwareEdit,
  pendingChipText,
  press,
  type MountedHardware,
} from "./hardware-harness";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const NAME = roCopy("priceDashboard.hardware.nameLabel");
const RENAME = roCopy("priceDashboard.hardware.renameAction");
const CREATED_NAME = "GTV Economic";

const REFUSAL_WORDS: Readonly<Record<CreatedRowTextRefusalCode, string>> = {
  TEXT_EMPTY: roCopy("priceDashboard.errors.textEmpty"),
  MISSING_VALUE: roCopy("priceDashboard.errors.textEmpty"),
  TEXT_TOO_LONG: roCopy("priceDashboard.errors.textTooLong"),
  TEXT_FORBIDDEN_CHARACTER: roCopy(
    "priceDashboard.errors.textForbiddenCharacter",
  ),
  TEXT_STATES_AN_AMOUNT: roCopy("priceDashboard.errors.textStatesAnAmount"),
};

const PUBLISHED = "hardware.economic";
const publishedTier = {
  tierId: PUBLISHED,
  ruleId: PUBLISHED,
  name: CREATED_NAME,
  description: "",
  ...Object.fromEntries(HARDWARE_RATE_FIELDS.map((field) => [field, 2_000])),
} as unknown as HardwareTier;

function pageWithThePublishedClass(changes: readonly DraftChange[] = []) {
  const page = hardwarePageOf({ changes });
  const book = {
    ...SAMPLE_PRICE_BOOK,
    hardware: {
      ...SAMPLE_PRICE_BOOK.hardware,
      tiers: [...SAMPLE_PRICE_BOOK.hardware.tiers, publishedTier],
    },
  };
  return {
    ...page,
    state: { ...page.state, active: { ...page.state.active, book } },
  };
}

let mounted: MountedHardware | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

async function mountCreated(): Promise<HTMLElement> {
  mounted = await mountHardwareEdit(
    CREATED,
    hardwarePageOf({ changes: CREATED_CLASS }),
  );
  return mounted.container;
}

const headingOf = (container: HTMLElement) =>
  container.querySelector("h1")?.textContent;

const renameButtonIn = (container: HTMLElement) =>
  buttonNamed(container, RENAME);

/** The longest name the domain takes, found by asking it rather than by repeating its bound. */
function longestAcceptedNameLength(): number {
  let length = 1;
  while (judgeCreatedRowText("a".repeat(length + 1), "name").ok) length += 1;
  return length;
}

describe("the typed name is judged as the domain judges it", () => {
  it("stops at the domain's bound: the longest name is takeable, one more is refused as too long", async () => {
    const container = await mountCreated();
    const longest = longestAcceptedNameLength();

    typeInField(container, NAME, "a".repeat(longest));
    expect(alertsIn(container)).toEqual([]);
    expect(renameButtonIn(container).disabled).toBe(false);

    typeInField(container, NAME, "a".repeat(longest + 1));
    expect(alertsIn(container)).toEqual([REFUSAL_WORDS.TEXT_TOO_LONG]);
    expect(renameButtonIn(container).disabled).toBe(true);
    expect(mounted?.draftServer.calls).toEqual([]);
  });

  it.each<[string, string, CreatedRowTextRefusalCode]>([
    ["only spaces", "     ", "TEXT_EMPTY"],
    ["an empty string", "", "TEXT_EMPTY"],
    ["a zero-width space alone", "​", "TEXT_EMPTY"],
    ["a control character", "GTV\u0007", "TEXT_FORBIDDEN_CHARACTER"],
    ["a price in lei", "GTV 450 lei", "TEXT_STATES_AN_AMOUNT"],
    ["a price behind a currency symbol", "GTV €450", "TEXT_STATES_AN_AMOUNT"],
    ["a percentage", "GTV 20%", "TEXT_STATES_AN_AMOUNT"],
    ["an inclusion", "GTV cu montaj inclus", "TEXT_STATES_AN_AMOUNT"],
  ])(
    "refuses %s, with the domain's words, and sends nothing",
    async (_title, text, code) => {
      const container = await mountCreated();

      typeInField(container, NAME, text);

      expect(judgeCreatedRowText(text, "name")).toEqual({ ok: false, code });
      expect(alertsIn(container)).toEqual([REFUSAL_WORDS[code]]);
      expect(renameButtonIn(container).disabled).toBe(true);
      expect(mounted?.draftServer.calls).toEqual([]);
    },
  );

  it("takes a name with a bare number, which is a model and no price", async () => {
    const container = await mountCreated();

    typeInField(container, NAME, "GTV 2000");

    expect(alertsIn(container)).toEqual([]);
    expect(renameButtonIn(container).disabled).toBe(false);
  });

  it("agrees with the domain for any text: a refusal shows its words and the button is off exactly when the domain refuses or the name is the same", async () => {
    const container = await mountCreated();

    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (text) => {
        typeInField(container, NAME, text);
        const judged = judgeCreatedRowText(text, "name");
        const isRefused = !judged.ok;
        const isSame = judged.ok && judged.text === CREATED_NAME;
        expect(alertsIn(container)).toEqual(
          judged.ok ? [] : [REFUSAL_WORDS[judged.code]],
        );
        expect(renameButtonIn(container).disabled).toBe(isRefused || isSame);
      }),
      { numRuns: 150 },
    );
    expect(mounted?.draftServer.calls).toEqual([]);
  });

  it("does not offer a save for the name the draft already holds, however it is padded", async () => {
    const container = await mountCreated();

    typeInField(container, NAME, `   ${CREATED_NAME}  `);

    expect(alertsIn(container)).toEqual([]);
    expect(renameButtonIn(container).disabled).toBe(true);
  });
});

describe("a save", () => {
  it("sends once when the button is pressed twice while the first is out", async () => {
    const container = await mountCreated();
    typeInField(container, NAME, "GTV Premium");
    const release = mounted?.draftServer.holdNextWrite();
    const button = renameButtonIn(container);

    click(button);
    await settle();
    click(button);
    await settle();
    release?.();
    await settle();

    expect(mounted?.draftServer.calls).toHaveLength(1);
    expect(headingOf(container)).toBe("GTV Premium");
  });

  it("keeps what was typed after the save was pressed, when the answer arrives late", async () => {
    const container = await mountCreated();
    typeInField(container, NAME, "GTV Premium");
    const release = mounted?.draftServer.holdNextWrite();

    click(renameButtonIn(container));
    await settle();
    typeInField(container, NAME, "GTV Premium Plus");
    release?.();
    await settle();

    expect(fieldNamed(container, NAME).value).toBe("GTV Premium Plus");
  });

  it.each<[string, DraftChangeOutcome]>([
    [
      "a refusal of the words",
      { kind: "refused", code: "TEXT_STATES_AN_AMOUNT" },
    ],
    ["a refusal of the candidate", { kind: "candidate-refused" }],
  ])(
    "keeps the typed name and says something under the field on %s",
    async (_title, outcome) => {
      const container = await mountCreated();
      typeInField(container, NAME, "GTV Premium");
      mounted?.draftServer.answerNextWriteWith(outcome);

      await press(renameButtonIn(container));

      expect(fieldNamed(container, NAME).value).toBe("GTV Premium");
      expect(alertsIn(container)).toHaveLength(1);
      expect(headingOf(container)).toBe(CREATED_NAME);
    },
  );

  it("clears the server's refusal as soon as the person types again", async () => {
    const container = await mountCreated();
    typeInField(container, NAME, "GTV Premium");
    mounted?.draftServer.answerNextWriteWith({
      kind: "refused",
      code: "TEXT_STATES_AN_AMOUNT",
    });
    await press(renameButtonIn(container));

    typeInField(container, NAME, "GTV Premium Plus");

    expect(alertsIn(container)).toEqual([]);
  });
});

describe("a class the draft deletes", () => {
  it("offers no field and no rename button, and shows the name as it stands", async () => {
    const deletion: DraftChange = {
      address: {
        kind: "item-deleted",
        item: { kind: "hardware", tierId: PUBLISHED },
      },
      value: true,
    };
    mounted = await mountHardwareEdit(
      PUBLISHED,
      pageWithThePublishedClass([deletion]),
    );
    const { container } = mounted;

    expect(
      allIn<HTMLLabelElement>(container, "label").filter(
        (label) => label.textContent.trim() === NAME,
      ),
    ).toEqual([]);
    expect(
      allIn<HTMLButtonElement>(container, "button").filter(
        (button) => button.textContent.trim() === RENAME,
      ),
    ).toEqual([]);
    expect(headingOf(container)).toBe(CREATED_NAME);
    expect(mounted.draftServer.calls).toEqual([]);
  });
});

describe("a published class renamed and then named as it was", () => {
  it("takes the published name typed back as no change: nothing is left in the draft for the class", async () => {
    mounted = await mountHardwareEdit(PUBLISHED, pageWithThePublishedClass());
    const { container } = mounted;
    typeInField(container, NAME, "GTV Premium");
    await press(renameButtonIn(container));
    expect(pendingChipText(container)).toBeDefined();

    typeInField(container, NAME, CREATED_NAME);
    await press(renameButtonIn(container));

    expect(headingOf(container)).toBe(CREATED_NAME);
    expect(mounted.draftServer.state().draft.changes).toEqual([]);
    expect(pendingChipText(container)).toBeUndefined();
  });
});

describe("the production client", () => {
  it("takes no change of a created row's words", () => {
    expect(FETCHING_PRICE_DRAFT_CLIENT.acceptsCreatedRowText).not.toBe(true);
  });

  it("is the one a screen mounted without a client is given: the name is text with the reason, and no field", () => {
    const page = hardwarePageOf({ changes: CREATED_CLASS });
    const screen = mountInCatalogue(
      createElement(HardwareEditScreen, {
        locale: "ro",
        context: contextOf("administrator", [
          "kitchens",
          "hardware",
          "publish",
        ]),
        page,
        tierId: CREATED,
      }),
    );
    try {
      expect(
        allIn<HTMLInputElement>(screen.container, "input").filter(
          (input) => input.name === "name",
        ),
      ).toEqual([]);
      expect(screen.container.textContent).toContain(CREATED_NAME);
      expect(screen.container.textContent).toContain(
        roCopy("priceDashboard.lifecycle.cannotJudge"),
      );
    } finally {
      screen.unmount();
    }
  });
});

describe("a class the catalogue keys", () => {
  it.each([HETTICH, BLUM])(
    "%s offers neither a name field nor a rename button",
    async (tierId) => {
      mounted = await mountHardwareEdit(tierId, hardwarePageOf());
      const { container } = mounted;

      expect(
        allIn<HTMLLabelElement>(container, "label").filter(
          (label) => label.textContent.trim() === NAME,
        ),
      ).toEqual([]);
      expect(
        allIn<HTMLButtonElement>(container, "button").filter(
          (button) => button.textContent.trim() === RENAME,
        ),
      ).toEqual([]);
    },
  );
});
