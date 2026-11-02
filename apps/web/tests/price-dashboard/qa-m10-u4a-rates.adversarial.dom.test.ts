// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U4a, saving the four rates of a class: one write for each rate that differs, the first that is not
// written stops the rest, and what the page says afterwards is only what the server stored. `hardware-edit.dom.test.ts` makes
// the first write fail; here the second does (the one case where a rate is already in the draft when the sequence stops), a
// person types between two writes, and a late answer arrives after the screen has moved on.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MAX_PRICE_COEFFICIENT_MINOR,
  SAMPLE_PRICE_BOOK,
  TEN_LEI_MINOR,
} from "@lemnaria/configurator-domain";

import { plainLeiOf } from "@/price-dashboard/price-field-input";
import type {
  DraftChangeOutcome,
  PriceDraftClient,
} from "@/price-dashboard/price-draft-client";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn } from "../support/render-with-intl";
import {
  buttonNamed,
  fieldNamed,
  settle,
  typeInField,
} from "./cabinet-detail-harness";
import {
  CREATED,
  CREATED_CLASS,
  HETTICH,
  hardwarePageOf,
  mountHardwareEdit,
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
const SAVE = roCopy("priceDashboard.common.save");
const SAVED_NOTICE = roCopy("priceDashboard.common.priceSavedNotice");
const TOO_LARGE = roCopy("priceDashboard.errors.tooBig");
const hettich = () => {
  const tier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (held) => held.tierId === HETTICH,
  );
  if (tier === undefined) throw new Error(HETTICH);
  return tier;
};

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

interface FailingSecondWrite {
  readonly client: PriceDraftClient;
  readonly sent: () => readonly string[];
  readonly stopFailing: () => void;
}

/** A draft client over the in-memory one that refuses its second `change` while `isFailing`, and records each field sent. */
function clientFailingTheSecondWrite(
  page: ReturnType<typeof hardwarePageOf>,
): FailingSecondWrite & {
  readonly server: ReturnType<typeof inMemoryPriceDraftClient>;
} {
  const server = inMemoryPriceDraftClient(page.state);
  const fields: string[] = [];
  let isFailing = true;
  const client: PriceDraftClient = {
    ...server.client,
    change: (request) => {
      const { address } = request.change;
      fields.push("field" in address ? address.field : address.kind);
      const isSecond = fields.length === 2;
      return isSecond && isFailing
        ? Promise.resolve<DraftChangeOutcome>({
            kind: "refused",
            code: "TOO_LARGE",
          })
        : server.client.change(request);
    },
  };
  return {
    client,
    server,
    sent: () => fields,
    stopFailing: () => {
      isFailing = false;
    },
  };
}

async function mountWith(
  client: PriceDraftClient,
  page = hardwarePageOf(),
  tierId = HETTICH,
): Promise<HTMLElement> {
  mounted = await mountHardwareEdit(tierId, page, { draftClient: client });
  return mounted.container;
}

describe("a save whose second rate is refused after the first was written", () => {
  it("shows the refusal under the second field only, claims no save, and keeps the first rate in the draft as pending", async () => {
    const page = hardwarePageOf();
    const failing = clientFailingTheSecondWrite(page);
    const container = await mountWith(failing.client, page);
    typeInField(container, HINGE, "100");
    typeInField(container, SLIDE, "200");
    typeInField(container, LIFT, "700");

    await press(buttonNamed(container, SAVE));

    expect(failing.sent()).toEqual(["perHingeMinor", "perDrawerMinor"]);
    expect(container.textContent).not.toContain(SAVED_NOTICE);
    expect(fieldNamed(container, SLIDE).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(
      fieldNamed(container, HINGE).getAttribute("aria-invalid"),
    ).toBeNull();
    expect(failing.server.state().draft.changes).toHaveLength(1);
    expect(fieldNamed(container, HINGE).value).toBe("100");
  });

  it("sends only the rates still owed on the retry: the one written is not written again", async () => {
    const page = hardwarePageOf();
    const failing = clientFailingTheSecondWrite(page);
    const container = await mountWith(failing.client, page);
    typeInField(container, HINGE, "100");
    typeInField(container, SLIDE, "200");
    typeInField(container, LIFT, "700");
    await press(buttonNamed(container, SAVE));
    failing.stopFailing();

    await press(buttonNamed(container, SAVE));

    expect(failing.sent()).toEqual([
      "perHingeMinor",
      "perDrawerMinor",
      "perDrawerMinor",
      "perLiftMinor",
    ]);
    expect(container.textContent).toContain(SAVED_NOTICE);
    expect(failing.server.state().draft.changes).toHaveLength(3);
  });

  it("offers Cancel, which puts back what the draft holds: the rate that was written stays, the one that was not goes", async () => {
    const page = hardwarePageOf();
    const failing = clientFailingTheSecondWrite(page);
    const container = await mountWith(failing.client, page);
    typeInField(container, HINGE, "100");
    typeInField(container, SLIDE, "200");
    await press(buttonNamed(container, SAVE));

    await press(buttonNamed(container, roCopy("priceDashboard.common.cancel")));

    expect(fieldNamed(container, HINGE).value).toBe("100");
    expect(fieldNamed(container, SLIDE).value).toBe(
      plainLeiOf(hettich().perDrawerMinor),
    );
    expect(allIn(container, '[role="alert"]')).toEqual([]);
  });
});

describe("typing between two writes of one save", () => {
  it("sends no further write once the person has typed, and shows no notice for the save the typing replaced", async () => {
    const page = hardwarePageOf();
    const server = inMemoryPriceDraftClient(page.state);
    const container = await mountWith(server.client, page);
    typeInField(container, HINGE, "100");
    typeInField(container, SLIDE, "200");
    typeInField(container, LIFT, "700");
    const release = server.holdNextWrite();

    const saving = press(buttonNamed(container, SAVE));
    typeInField(container, PUSH, "300");
    release();
    await saving;
    await settle();

    const sentFields = server.calls.flatMap((call) =>
      call.kind === "change" && "field" in call.request.change.address
        ? [call.request.change.address.field]
        : [],
    );
    expect(sentFields).toEqual(["perHingeMinor"]);
    expect(container.textContent).not.toContain(SAVED_NOTICE);
    expect(fieldNamed(container, PUSH).value).toBe("300");
  });
});

describe("a rate at the bounds", () => {
  const LARGEST_TEN_LEI =
    Math.floor(MAX_PRICE_COEFFICIENT_MINOR / TEN_LEI_MINOR) * TEN_LEI_MINOR;

  it("sends a rate of zero, which is a rate and not an absent one", async () => {
    const server = inMemoryPriceDraftClient(hardwarePageOf().state);
    const container = await mountWith(server.client);
    typeInField(container, LIFT, "0");

    await press(buttonNamed(container, SAVE));

    expect(server.state().draft.changes).toEqual([
      {
        address: { kind: "hardware", tierId: HETTICH, field: "perLiftMinor" },
        value: 0,
      },
    ]);
    expect(fieldNamed(container, LIFT).value).toBe("0");
  });

  it("sends the largest whole ten lei the book's bound takes, and the draft judges it as a rate", async () => {
    const server = inMemoryPriceDraftClient(hardwarePageOf().state);
    const container = await mountWith(server.client);
    typeInField(container, HINGE, plainLeiOf(LARGEST_TEN_LEI));

    await press(buttonNamed(container, SAVE));

    expect(server.state().draft.changes).toHaveLength(1);
    expect(server.state().draft.changes[0]?.value).toBe(LARGEST_TEN_LEI);
    expect(fieldNamed(container, HINGE).value).toBe(
      plainLeiOf(LARGEST_TEN_LEI),
    );
  });

  it("refuses the next whole ten lei on the field, without sending it", async () => {
    const server = inMemoryPriceDraftClient(hardwarePageOf().state);
    const container = await mountWith(server.client);

    typeInField(container, HINGE, plainLeiOf(LARGEST_TEN_LEI + TEN_LEI_MINOR));

    expect(fieldNamed(container, HINGE).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(
      allIn(container, '[role="alert"]').map((alert) => alert.textContent),
    ).toContain(TOO_LARGE);
    expect(buttonNamed(container, SAVE)).toHaveProperty("disabled", true);
    expect(server.calls).toEqual([]);
  });

  it("refuses a digit string too long to be counted, as too big, and not as a figure it was bent into", async () => {
    const server = inMemoryPriceDraftClient(hardwarePageOf().state);
    const container = await mountWith(server.client);

    typeInField(container, HINGE, "9".repeat(40));

    expect(
      allIn(container, '[role="alert"]').map((alert) => alert.textContent),
    ).toContain(TOO_LARGE);
    expect(server.calls).toEqual([]);
  });
});

describe("the rates of a class only the draft holds", () => {
  it("writes each rate as a change of its own, so the class is never left with a rate nobody set, and the creation is untouched", async () => {
    const page = hardwarePageOf({ changes: CREATED_CLASS });
    const server = inMemoryPriceDraftClient(page.state);
    const container = await mountWith(server.client, page, CREATED);
    typeInField(container, HINGE, "100");
    typeInField(container, PUSH, "0");

    await press(buttonNamed(container, SAVE));

    const held = server.state().draft.changes;
    const rateOf = Object.fromEntries(
      held.flatMap((change) =>
        change.address.kind === "hardware"
          ? [[change.address.field, change.value]]
          : [],
      ),
    );
    expect(held[0]?.address.kind).toBe("hardware-tier-created");
    expect(held).toHaveLength(1 + 4);
    expect(rateOf).toEqual({
      perHingeMinor: 10_000,
      perDrawerMinor: 2_000,
      perPushToOpenMinor: 0,
      perLiftMinor: 2_000,
    });
  });
});
