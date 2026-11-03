// @vitest-environment happy-dom
//
// One hardware class's page (frame D4B): four rate fields that read what they are typed as before anything is sent, a Save
// that sends one change of "De publicat" per changed rate and shows only what the server stored, and the class's switch and
// deletion, which are the dialogs' and not the draft's.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { formatLei } from "@/price-dashboard/format-lei";
import type { PriceDraftClient } from "@/price-dashboard/price-draft-client";
import { plainLeiOf } from "@/price-dashboard/price-field-input";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn, click, requireIn } from "../support/render-with-intl";
import {
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
  STANDARD,
  dialogButton,
  hardwareItem,
  hardwarePageOf,
  mountHardwareEdit,
  openDialog,
  pendingChipText,
  press,
  type MountedHardware,
} from "./hardware-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const HINGE = roCopy("priceDashboard.hardware.priceHinge");
const SLIDE = roCopy("priceDashboard.hardware.priceSlide");
const PUSH = roCopy("priceDashboard.hardware.pricePush");
const LIFT = roCopy("priceDashboard.hardware.priceLift");
const PUSH_RUNNER = roCopy("priceDashboard.hardware.pricePushRunner");
const SAVE = roCopy("priceDashboard.common.save");
const CANCEL = roCopy("priceDashboard.common.cancel");
const lei = (minor: number) =>
  formatLei(minor, roCopy("priceDashboard.units.currency"));
const tierOf = (tierId: string) => {
  const tier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (t) => t.tierId === tierId,
  );
  if (tier === undefined) throw new Error(tierId);
  return tier;
};
const rateChange = (
  tierId: string,
  field: (typeof HARDWARE_RATE_FIELDS)[number],
  value: number,
): DraftChange => ({
  address: { kind: "hardware", tierId, field },
  value,
});

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

async function mountHettich(
  options: Parameters<typeof hardwarePageOf>[0] = {},
) {
  mounted = await mountHardwareEdit(HETTICH, hardwarePageOf(options));
  return mounted.container;
}

describe("the rates", () => {
  it("are a field for each, the push runner last, each holding the rate the draft would leave and naming what is active", async () => {
    const container = await mountHettich();
    const hettich = tierOf(HETTICH);

    expect(
      [HINGE, SLIDE, PUSH, LIFT, PUSH_RUNNER].map(
        (label) => fieldNamed(container, label).value,
      ),
    ).toEqual([
      plainLeiOf(hettich.perHingeMinor),
      plainLeiOf(hettich.perDrawerMinor),
      plainLeiOf(hettich.perPushToOpenMinor),
      plainLeiOf(hettich.perLiftMinor),
      plainLeiOf(hettich.perPushRunnerMinor),
    ]);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.common.activeValueWithHint", {
        amount: lei(hettich.perLiftMinor),
        hint: roCopy("priceDashboard.hardware.priceLiftHint"),
      }),
    );
    expect(container.textContent).toContain(
      roCopy("priceDashboard.common.activeValueWithHint", {
        amount: lei(hettich.perPushRunnerMinor),
        hint: roCopy("priceDashboard.hardware.pricePushRunnerHint"),
      }),
    );
  });

  it("says nothing is active, and asks for the lift's own words, on a class the draft created", async () => {
    const created = "hardware.economic";
    mounted = await mountHardwareEdit(
      created,
      hardwarePageOf({
        changes: [
          {
            address: { kind: "hardware-tier-created", tierId: created },
            value: {
              name: "GTV Economic",
              description: "Pentru oferte economice",
            },
          },
          ...HARDWARE_RATE_FIELDS.map((field) =>
            rateChange(created, field, 2_000),
          ),
        ],
      }),
    );

    const container = mounted.container;

    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.common.activeValue", { amount: "" }).slice(0, 6),
    );
    expect(fieldNamed(container, LIFT).value).toBe(plainLeiOf(2_000));
  });
});

describe("what is typed", () => {
  it("is refused on the push-runner field at zero, Save stays off and nothing is sent", async () => {
    const container = await mountHettich();

    typeInField(container, PUSH_RUNNER, "0");

    expect(
      fieldNamed(container, PUSH_RUNNER).getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      allIn(container, '[role="alert"]').map((alert) => alert.textContent),
    ).toContain(roCopy("priceDashboard.errors.aboveZero"));
    expect(buttonNamed(container, SAVE)).toHaveProperty("disabled", true);
    expect(mounted?.draftServer.calls).toEqual([]);
  });

  it("is refused on its own field when it is not a multiple of ten lei, Save stays off and nothing is sent", async () => {
    const container = await mountHettich();

    typeInField(container, PUSH, "125,50");

    expect(fieldNamed(container, PUSH).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(buttonNamed(container, SAVE)).toHaveProperty("disabled", true);
    expect(mounted?.draftServer.calls).toEqual([]);
  });

  it("accepts an amount the screen already holds, though it is not whole tens of lei", async () => {
    const container = await mountHettich();

    typeInField(container, LIFT, "700");
    typeInField(container, HINGE, plainLeiOf(tierOf(HETTICH).perHingeMinor));

    expect(
      fieldNamed(container, HINGE).getAttribute("aria-invalid"),
    ).toBeNull();
    expect(buttonNamed(container, SAVE)).toHaveProperty("disabled", false);
  });

  it("is refused when empty, and when it is not a number", async () => {
    const container = await mountHettich();

    typeInField(container, SLIDE, "");
    expect(fieldNamed(container, SLIDE).getAttribute("aria-invalid")).toBe(
      "true",
    );
    typeInField(container, SLIDE, "abc");

    expect(
      allIn(container, '[role="alert"]').map((alert) => alert.textContent),
    ).toContain(
      roCopy("priceDashboard.errors.notNumber", { example: "450,00" }),
    );
  });
});

describe("Save", () => {
  it("sends one change for each rate that differs, in the order of the fields, and says it went to De publicat", async () => {
    const container = await mountHettich();
    typeInField(container, HINGE, "100");
    typeInField(container, LIFT, "700");

    await press(buttonNamed(container, SAVE));

    expect(mounted?.draftServer.calls).toEqual([
      {
        kind: "change",
        request: {
          expectedDraftRevision: "1",
          change: rateChange(HETTICH, "perHingeMinor", 10_000),
        },
      },
      {
        kind: "change",
        request: {
          expectedDraftRevision: "2",
          change: rateChange(HETTICH, "perLiftMinor", 70_000),
        },
      },
    ]);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.common.priceSavedNotice"),
    );
    expect(pendingChipText(container)).toBeDefined();
  });

  it("takes a rate back out of the draft when it is typed back to the active one, instead of adding a change", async () => {
    const container = await mountHettich({
      changes: [rateChange(HETTICH, "perLiftMinor", 70_000)],
    });
    typeInField(container, LIFT, plainLeiOf(tierOf(HETTICH).perLiftMinor));

    await press(buttonNamed(container, SAVE));

    expect(mounted?.draftServer.calls.map((call) => call.kind)).toEqual([
      "revert",
    ]);
    expect(mounted?.draftServer.state().draft.changes).toEqual([]);
  });

  it("says why under the field the server refused, and does not say it was saved", async () => {
    const container = await mountHettich();
    typeInField(container, LIFT, "700");
    mounted?.draftServer.answerNextWriteWith({
      kind: "refused",
      code: "TOO_LARGE",
    });

    await press(buttonNamed(container, SAVE));

    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.common.priceSavedNotice"),
    );
    expect(
      allIn(container, '[role="alert"]').map((alert) => alert.textContent),
    ).toContain(roCopy("priceDashboard.errors.tooBig"));
  });

  it("says the data changed after a conflict, and keeps what was typed", async () => {
    const container = await mountHettich();
    typeInField(container, LIFT, "700");
    mounted?.draftServer.moveDraftBehindTheScreen();

    await press(buttonNamed(container, SAVE));

    expect(
      allIn(container, '[role="alert"]').map((alert) => alert.textContent),
    ).toContain(roCopy("priceDashboard.errors.changedMeanwhile"));
    expect(fieldNamed(container, LIFT).value).toBe("700");
  });

  it("does not say nothing changed when the second of two rates fails after the first landed", async () => {
    const page = hardwarePageOf();
    const server = inMemoryPriceDraftClient(page.state);
    let sent = 0;
    const failingSecondWrite: PriceDraftClient = {
      ...server.client,
      change: (request) => {
        sent += 1;
        return sent === 2
          ? Promise.resolve({ kind: "failed" })
          : server.client.change(request);
      },
    };
    mounted = await mountHardwareEdit(HETTICH, page, {
      draftClient: failingSecondWrite,
    });
    const container = mounted.container;
    typeInField(container, HINGE, "9990");
    typeInField(container, LIFT, "9990");

    await press(buttonNamed(container, SAVE));

    const alerts = allIn(container, '[role="alert"]').map(
      (alert) => alert.textContent,
    );
    expect(server.state().draft.changes).toHaveLength(1);
    expect(alerts).toEqual([roCopy("priceDashboard.errors.savePartlyFailed")]);
  });

  it("drops the answer of a write the person has typed over, so no notice is shown for what is no longer on screen", async () => {
    const container = await mountHettich();
    typeInField(container, LIFT, "700");
    const release = mounted?.draftServer.holdNextWrite();
    click(buttonNamed(container, SAVE));
    typeInField(container, LIFT, "710");

    release?.();
    await settle();

    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.common.priceSavedNotice"),
    );
    expect(fieldNamed(container, LIFT).value).toBe("710");
  });

  it("leaves Save off while a value is refused and offers Cancel, which restores what the draft holds", async () => {
    const container = await mountHettich();
    typeInField(container, HINGE, "9,99");

    await press(buttonNamed(container, CANCEL));

    expect(fieldNamed(container, HINGE).value).toBe(
      plainLeiOf(tierOf(HETTICH).perHingeMinor),
    );
    expect(() => buttonNamed(container, CANCEL)).toThrow();
  });

  it("writes every rate of a class the draft created as a change, even one typed back to its own value", async () => {
    const created = "hardware.economic";
    mounted = await mountHardwareEdit(
      created,
      hardwarePageOf({
        changes: [
          {
            address: { kind: "hardware-tier-created", tierId: created },
            value: {
              name: "GTV Economic",
              description: "Pentru oferte economice",
            },
          },
          ...HARDWARE_RATE_FIELDS.map((field) =>
            rateChange(created, field, 2_000),
          ),
        ],
      }),
    );
    const container = mounted.container;
    typeInField(container, PUSH, "30");

    await press(buttonNamed(container, SAVE));

    expect(mounted.draftServer.calls.map((call) => call.kind)).toEqual([
      "change",
    ]);
    expect(mounted.draftServer.state().draft.changes.length).toBe(
      1 + HARDWARE_RATE_FIELDS.length,
    );
  });
});

describe("whether customers may choose the class", () => {
  it("is a switch that opens the dialog on Cancel and writes at once on confirming, without a change of the draft", async () => {
    const container = await mountHettich();
    const toggle = requireIn(container, '[role="switch"]');

    await press(toggle);
    const dialog = openDialog();
    expect(document.activeElement).toBe(dialog && dialogButton(dialog, CANCEL));
    await press(
      dialogButton(
        dialog ?? container,
        roCopy("priceDashboard.lifecycle.deactivateConfirm"),
      ),
    );

    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(mounted?.draftServer.calls).toEqual([]);
    expect(
      mounted?.lifecycle.calls.filter((call) => call.kind === "setActive"),
    ).toHaveLength(1);
  });

  it("names the other classes that stay on offer in its dialog, each by its own name and never by this class's", async () => {
    const container = await mountHettich();

    await press(requireIn(container, '[role="switch"]'));

    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.remaining", {
        options: `${roCopy("priceBook.hardware.standard.name")}, Blum`,
      }),
    );
  });

  it("is off, with the fixed-default reason beside it, for the book's fallback class", async () => {
    mounted = await mountHardwareEdit(STANDARD, hardwarePageOf());

    const toggle = requireIn(mounted.container, '[role="switch"]');
    await press(toggle);

    expect(toggle.getAttribute("aria-disabled")).toBe("true");
    expect(openDialog()).toBeNull();
    expect(mounted.container.textContent).toContain(
      roCopy("priceDashboard.lifecycle.fixedDefaultCannotChange"),
    );
  });

  it("is switched on again from a switched-off class by the same dialog's counterpart", async () => {
    mounted = await mountHardwareEdit(
      BLUM,
      hardwarePageOf({ disabled: [hardwareItem(BLUM)] }),
    );
    const toggle = requireIn(mounted.container, '[role="switch"]');

    await press(toggle);
    await press(
      dialogButton(
        openDialog() ?? mounted.container,
        roCopy("priceDashboard.lifecycle.activateConfirm"),
      ),
    );

    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});

describe("deleting the class", () => {
  it("is a change of the draft, and the page then says the deletion waits for publication and offers no rate to edit", async () => {
    mounted = await mountHardwareEdit(BLUM, hardwarePageOf());
    const container = mounted.container;

    await press(
      buttonNamed(container, roCopy("priceDashboard.hardware.deleteAction")),
    );
    await press(
      dialogButton(
        openDialog() ?? container,
        roCopy("priceDashboard.common.delete"),
      ),
    );

    expect(mounted.draftServer.calls.map((call) => call.kind)).toEqual([
      "change",
    ]);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.hardware.deleteNotice"),
    );
    expect(() => fieldNamed(container, HINGE)).toThrow();
  });

  it("is off, with its reason, for a class a kitchen's defaults name", async () => {
    mounted = await mountHardwareEdit(
      HETTICH,
      hardwarePageOf({ defaults: { hardwareTierId: HETTICH } }),
    );

    const button = buttonNamed(
      mounted.container,
      roCopy("priceDashboard.hardware.deleteAction"),
    );
    await press(button);

    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(openDialog()).toBeNull();
    expect(mounted.container.textContent).toContain(
      roCopy("priceDashboard.lifecycle.defaultCannotChange"),
    );
  });
});

describe("deleting a class only the draft holds", () => {
  it("takes it out of the draft and says nothing is left to publish, in place of a page for a class that is gone", async () => {
    mounted = await mountHardwareEdit(
      CREATED,
      hardwarePageOf({ changes: CREATED_CLASS }),
    );
    const container = mounted.container;

    await press(
      buttonNamed(container, roCopy("priceDashboard.hardware.deleteAction")),
    );
    await press(
      dialogButton(
        openDialog() ?? container,
        roCopy("priceDashboard.common.delete"),
      ),
    );

    expect(mounted.draftServer.calls.map((call) => call.kind)).toEqual([
      "revert",
    ]);
    expect(
      container.querySelector('[data-testid="hardware-removed"]')?.textContent,
    ).toContain(roCopy("priceDashboard.hardware.createdRemoved"));
  });
});

describe("the page in Russian", () => {
  it("draws with the Russian words and the same fields", async () => {
    mounted = await mountHardwareEdit(HETTICH, hardwarePageOf(), {
      locale: "ru",
    });

    expect(allIn(mounted.container, "input")).toHaveLength(
      HARDWARE_RATE_FIELDS.length,
    );
    expect(mounted.container.querySelector("h1")?.textContent).toBe("Hettich");
  });
});
