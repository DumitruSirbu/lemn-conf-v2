// @vitest-environment happy-dom
//
// One accessory's page (frame D6B): its words and the rule that adds it, a price per unit that reads what it is typed as
// before anything is sent, a Save that sends one change of "De publicat" and shows only what the server stored, the
// accessory's switch and deletion, which are the dialogs' and not the draft's, and the name of a created accessory, which
// can be reworded. A built-in's words and rule are the catalogue's and read-only.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { formatLei } from "@/price-dashboard/format-lei";
import type { PriceDraftClient } from "@/price-dashboard/price-draft-client";
import { plainLeiOf } from "@/price-dashboard/price-field-input";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn } from "../support/render-with-intl";
import { buttonNamed, fieldNamed, typeInField } from "./cabinet-detail-harness";
import {
  accessoryItem,
  accessoryPageOf,
  COVER_NAME,
  CREATED,
  CREATED_ACCESSORY,
  DRYING_RACK,
  mountAccessoryEdit,
  PUBLISHED,
  PUBLISHED_RULE,
  SINK_COVER,
  type MountedAccessories,
} from "./accessory-harness";
import {
  dialogButton,
  openDialog,
  pendingChipText,
  press,
} from "./hardware-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const PRICE = roCopy("priceDashboard.accessories.pricePerPiece");
const NAME = roCopy("priceDashboard.accessories.nameLabel");
const RENAME = roCopy("priceDashboard.accessories.renameAction");
const SAVE = roCopy("priceDashboard.common.save");
const CANCEL = roCopy("priceDashboard.common.cancel");
const CREATED_NAME = "Suport pentru farfurii";
const COVER = SAMPLE_PRICE_BOOK.accessories.sinkProtectiveCover;
const lei = (minor: number) =>
  formatLei(minor, roCopy("priceDashboard.units.currency"));
const priceChange = (accessoryId: string, value: number): DraftChange => ({
  address: { kind: "accessory", accessoryId, field: "perUnitMinor" },
  value,
});
const alertsIn = (container: HTMLElement) =>
  allIn(container, '[role="alert"]').map((alert) => alert.textContent);
const headingOf = (container: HTMLElement) =>
  container.querySelector("h1")?.textContent;
const nameFieldsIn = (container: HTMLElement) =>
  allIn<HTMLLabelElement>(container, "label").filter(
    (label) => label.textContent.trim() === NAME,
  );

let mounted: MountedAccessories | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

async function mountEdit(
  accessoryId: string,
  options: Parameters<typeof accessoryPageOf>[0] = {},
) {
  mounted = await mountAccessoryEdit(accessoryId, accessoryPageOf(options));
  return mounted.container;
}

describe("a built-in accessory's page", () => {
  it("shows its name and its rule as text the catalogue owns, says only the price and the state change here, and offers no field for the words", async () => {
    const container = await mountEdit(SINK_COVER);

    expect(headingOf(container)).toBe(COVER_NAME);
    expect(nameFieldsIn(container)).toEqual([]);
    expect(allIn(container, "input")).toHaveLength(1);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.accessories.ruleSinkCover"),
    );
    expect(container.textContent).toContain(
      roCopy("priceDashboard.accessories.builtInNote"),
    );
    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.accessories.linkFixedNote"),
    );
  });

  it("offers a switch and the price, and a deletion that is off and says the accessory comes with the catalogue", async () => {
    const container = await mountEdit(DRYING_RACK);

    const deleteButton = buttonNamed(
      container,
      roCopy("priceDashboard.accessories.deleteAction"),
    );
    expect(deleteButton.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(
        deleteButton.getAttribute("aria-describedby") ?? "",
      )?.textContent,
    ).toBe(roCopy("priceDashboard.lifecycle.builtInAccessoryCannotBeDeleted"));
    expect(
      container
        .querySelector('button[role="switch"]')
        ?.getAttribute("aria-checked"),
    ).toBe("true");
    await press(deleteButton);
    expect(openDialog()).toBeNull();
  });
});

describe("the sink cover's deletion", () => {
  it("is off with the reason that the cover is always added, which offers no way round, and the page draws no hint that offers one", async () => {
    const container = await mountEdit(SINK_COVER);

    const deleteButton = buttonNamed(
      container,
      roCopy("priceDashboard.accessories.deleteAction"),
    );
    expect(deleteButton.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(
        deleteButton.getAttribute("aria-describedby") ?? "",
      )?.textContent,
    ).toBe(roCopy("priceDashboard.lifecycle.alwaysPresentCannotBeDeleted"));
    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.accessories.deleteHint"),
    );
    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.lifecycle.builtInAccessoryCannotBeDeleted"),
    );
  });

  it("is told the rack's own way: it keeps the hint, since the rack can be switched off instead", async () => {
    const container = await mountEdit(DRYING_RACK);

    expect(container.textContent).toContain(
      roCopy("priceDashboard.accessories.deleteHint"),
    );
  });
});

describe("the sink cover's switch", () => {
  it("is off with the reason that the cover is always added, and the rack's stays on", async () => {
    const cover = await mountEdit(SINK_COVER);
    const coverSwitch = cover.querySelector('button[role="switch"]');
    expect(coverSwitch?.getAttribute("aria-disabled")).toBe("true");
    expect(coverSwitch?.getAttribute("aria-checked")).toBe("true");
    expect(cover.textContent).toContain(
      roCopy("priceDashboard.lifecycle.alwaysPresentCannotChange"),
    );
    mounted?.unmount();

    const rack = await mountEdit(DRYING_RACK);

    expect(
      rack
        .querySelector('button[role="switch"]')
        ?.getAttribute("aria-disabled"),
    ).toBeNull();
  });
});

describe("the price", () => {
  it("holds the price the draft would leave and names what is active", async () => {
    const container = await mountEdit(SINK_COVER, {
      changes: [priceChange(SINK_COVER, 50_000)],
    });

    expect(fieldNamed(container, PRICE).value).toBe(plainLeiOf(50_000));
    expect(container.textContent).toContain(
      roCopy("priceDashboard.common.activeValue", {
        amount: lei(COVER.perUnitMinor),
      }),
    );
  });

  it("is refused when it is not whole tens of lei, empty or not a number: Save stays off and nothing is sent", async () => {
    const container = await mountEdit(SINK_COVER);

    typeInField(container, PRICE, "125,50");
    expect(fieldNamed(container, PRICE).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(buttonNamed(container, SAVE)).toHaveProperty("disabled", true);
    typeInField(container, PRICE, "");
    expect(fieldNamed(container, PRICE).getAttribute("aria-invalid")).toBe(
      "true",
    );
    typeInField(container, PRICE, "abc");

    expect(alertsIn(container)).toContain(
      roCopy("priceDashboard.errors.notNumber", { example: "450,00" }),
    );
    expect(mounted?.draftServer.calls).toEqual([]);
  });

  it("sends one change for the accessory on Save and says it went to De publicat", async () => {
    const container = await mountEdit(SINK_COVER);
    typeInField(container, PRICE, "600");

    await press(buttonNamed(container, SAVE));

    expect(mounted?.draftServer.calls).toEqual([
      {
        kind: "change",
        request: {
          expectedDraftRevision: "1",
          change: priceChange(SINK_COVER, 60_000),
        },
      },
    ]);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.common.priceSavedNotice"),
    );
    expect(pendingChipText(container)).toBeDefined();
  });

  it("takes the change back out of the draft when it is typed back to the active price, instead of adding a no-op", async () => {
    const container = await mountEdit(SINK_COVER, {
      changes: [priceChange(SINK_COVER, 50_000)],
    });
    typeInField(container, PRICE, plainLeiOf(COVER.perUnitMinor));

    await press(buttonNamed(container, SAVE));

    expect(mounted?.draftServer.calls.map((call) => call.kind)).toEqual([
      "revert",
    ]);
    expect(mounted?.draftServer.state().draft.changes).toEqual([]);
  });

  it("puts back what the draft holds when Cancel is pressed, and sends nothing", async () => {
    const container = await mountEdit(SINK_COVER);
    typeInField(container, PRICE, "999");

    await press(buttonNamed(container, CANCEL));

    expect(fieldNamed(container, PRICE).value).toBe(
      plainLeiOf(COVER.perUnitMinor),
    );
    expect(mounted?.draftServer.calls).toEqual([]);
  });

  it("says why under the field the server refused, and does not say it was saved", async () => {
    const container = await mountEdit(SINK_COVER);
    typeInField(container, PRICE, "600");
    mounted?.draftServer.answerNextWriteWith({
      kind: "refused",
      code: "TOO_LARGE",
    });

    await press(buttonNamed(container, SAVE));

    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.common.priceSavedNotice"),
    );
    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.tooBig"),
    ]);
  });

  it("is a change and never a revert for a created accessory, which has no active price to type back to", async () => {
    const container = await mountEdit(CREATED, { changes: CREATED_ACCESSORY });
    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.common.activeValue", { amount: "" }).slice(0, 6),
    );
    typeInField(container, PRICE, "800");
    typeInField(container, PRICE, "900");

    await press(buttonNamed(container, SAVE));

    expect(mounted?.draftServer.calls.map((call) => call.kind)).toEqual([
      "change",
    ]);
    expect(mounted?.draftServer.state().draft.changes).toHaveLength(2);
  });
});

describe("a linked accessory's page", () => {
  it("names the cabinet type it follows and says the type is fixed, and shows the authored description", async () => {
    const container = await mountEdit(PUBLISHED, { linked: [PUBLISHED_RULE] });

    expect(container.textContent).toContain(
      roCopy("priceDashboard.accessories.linkFixedNote"),
    );
    expect(container.textContent).toContain(PUBLISHED_RULE.description);
    expect(
      container.querySelector('[data-testid="accessory-earning"]')?.textContent,
    ).toContain(roCopy("priceDashboard.accessories.linkLabel"));
  });

  it("does not let an accessory only the draft knows be switched on, and says it is activated after publishing", async () => {
    const container = await mountEdit(CREATED, { changes: CREATED_ACCESSORY });

    const switchButton = container.querySelector('button[role="switch"]');
    expect(switchButton?.getAttribute("aria-checked")).toBe("false");
    expect(switchButton?.getAttribute("aria-disabled")).toBe("true");
    expect(container.textContent).toContain(
      roCopy("priceDashboard.lifecycle.activateNotPublished"),
    );
  });

  it("takes a created accessory back out of the draft when it is deleted from its page, and says nothing is left to publish", async () => {
    const container = await mountEdit(CREATED, { changes: CREATED_ACCESSORY });

    await press(
      buttonNamed(container, roCopy("priceDashboard.accessories.deleteAction")),
    );
    const dialog = openDialog();
    if (dialog === null) throw new Error("no dialog opened");
    await press(dialogButton(dialog, roCopy("priceDashboard.common.delete")));

    expect(mounted?.draftServer.state().draft.changes).toEqual([]);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.accessories.createdRemoved"),
    );
  });

  it("is told, for an accessory the draft deletes, that the deletion waits for publishing, with nothing else to do", async () => {
    const deletion: DraftChange = {
      address: {
        kind: "item-deleted",
        item: accessoryItem(PUBLISHED) as never,
      },
      value: true,
    };
    const container = await mountEdit(PUBLISHED, {
      linked: [PUBLISHED_RULE],
      changes: [deletion],
    });

    expect(container.textContent).toContain(
      roCopy("priceDashboard.accessories.deleteNotice"),
    );
    expect(allIn(container, "input")).toEqual([]);
    expect(container.querySelector('button[role="switch"]')).toBeNull();
  });
});

describe("the name of a created accessory", () => {
  it("is a field holding the draft's name, with the rename button off until the name changes", async () => {
    const container = await mountEdit(CREATED, { changes: CREATED_ACCESSORY });

    expect(fieldNamed(container, NAME).value).toBe(CREATED_NAME);
    expect(buttonNamed(container, RENAME).disabled).toBe(true);
  });

  it("sends one change of the accessory's name, trimmed, and then shows the draft's name", async () => {
    const container = await mountEdit(CREATED, { changes: CREATED_ACCESSORY });

    typeInField(container, NAME, "  Alt suport  ");
    await press(buttonNamed(container, RENAME));

    expect(mounted?.draftServer.calls).toEqual([
      {
        kind: "change",
        request: {
          expectedDraftRevision: "1",
          change: {
            address: {
              kind: "created-row-text",
              item: accessoryItem(CREATED),
              field: "name",
            },
            value: "Alt suport",
          },
        },
      },
    ]);
    expect(headingOf(container)).toBe("Alt suport");
  });

  it("is taken back out of the draft when typed back to the published name, instead of leaving a no-op change", async () => {
    const rename: DraftChange = {
      address: {
        kind: "created-row-text",
        item: accessoryItem(PUBLISHED) as never,
        field: "name",
      },
      value: "Alt nume",
    };
    const container = await mountEdit(PUBLISHED, {
      linked: [PUBLISHED_RULE],
      changes: [rename],
    });

    typeInField(container, NAME, PUBLISHED_RULE.name);
    await press(buttonNamed(container, RENAME));

    expect(mounted?.draftServer.calls.map((call) => call.kind)).toEqual([
      "revert",
    ]);
    expect(mounted?.draftServer.state().draft.changes).toEqual([]);
  });

  it("refuses a name that states a price, and sends nothing", async () => {
    const container = await mountEdit(CREATED, { changes: CREATED_ACCESSORY });

    typeInField(container, NAME, "Suport 450 lei");

    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.textStatesAnAmount"),
    ]);
    expect(buttonNamed(container, RENAME).disabled).toBe(true);
    expect(mounted?.draftServer.calls).toEqual([]);
  });

  it("is text with the reason, and no field, where the client takes no change of a created row's words", async () => {
    const page = accessoryPageOf({ changes: CREATED_ACCESSORY });
    const server = inMemoryPriceDraftClient(page.state);
    const withoutRename: PriceDraftClient = {
      ...server.client,
      acceptsCreatedRowText: undefined,
    };
    mounted = await mountAccessoryEdit(CREATED, page, {
      draftClient: withoutRename,
    });
    const { container } = mounted;

    expect(nameFieldsIn(container)).toEqual([]);
    expect(container.textContent).toContain(CREATED_NAME);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.lifecycle.cannotJudge"),
    );
    expect(server.calls).toEqual([]);
  });
});
