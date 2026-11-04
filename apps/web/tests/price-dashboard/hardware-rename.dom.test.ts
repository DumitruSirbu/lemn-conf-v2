// @vitest-environment happy-dom
//
// The name of a class the catalogue does not key, on its own page: a field read as the draft would judge it, a button that
// sends one change of the class's words, and the shown name being the draft's. A catalogue class keeps its words, and a
// client that takes no change of a created row's words is offered no field.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type HardwareTier,
} from "@lemnaria/configurator-domain";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import type { PriceDraftClient } from "@/price-dashboard/price-draft-client";

import { allIn } from "../support/render-with-intl";
import { buttonNamed, fieldNamed, typeInField } from "./cabinet-detail-harness";
import {
  CREATED,
  CREATED_CLASS,
  rowOf,
  mountHardwareList,
  menuEntry,
  openDialog,
  openMenuOf,
  HETTICH,
  hardwarePageOf,
  mountHardwareEdit,
  pendingChipText,
  press,
  type MountedHardware,
} from "./hardware-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const NAME = roCopy("priceDashboard.hardware.nameLabel");
const RENAME = roCopy("priceDashboard.hardware.renameAction");
const CREATED_NAME = "GTV Economic";

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

const nameFieldsIn = (container: HTMLElement) =>
  allIn<HTMLLabelElement>(container, "label").filter(
    (label) => label.textContent.trim() === NAME,
  );

describe("a class the catalogue does not key", () => {
  it("has its name as a field holding the draft's name, with the rename button off until the name changes", async () => {
    const container = await mountCreated();

    expect(fieldNamed(container, NAME).value).toBe(CREATED_NAME);
    expect(buttonNamed(container, RENAME).disabled).toBe(true);
  });

  it("sends one change of the class's name, trimmed, and then shows the draft's name and the pending chip", async () => {
    const container = await mountCreated();

    typeInField(container, NAME, "  GTV Premium  ");
    await press(buttonNamed(container, RENAME));

    expect(mounted?.draftServer.calls).toEqual([
      {
        kind: "change",
        request: {
          expectedDraftRevision: "1",
          change: {
            address: {
              kind: "created-row-text",
              item: { kind: "hardware", tierId: CREATED },
              field: "name",
            },
            value: "GTV Premium",
          },
        },
      },
    ]);
    expect(headingOf(container)).toBe("GTV Premium");
    expect(fieldNamed(container, NAME).value).toBe("GTV Premium");
    expect(pendingChipText(container)).toBeDefined();
  });

  it("refuses a blank name in the field, keeps the rename button off and sends nothing", async () => {
    const container = await mountCreated();

    typeInField(container, NAME, "   ");

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      roCopy("priceDashboard.errors.textEmpty"),
    );
    expect(buttonNamed(container, RENAME).disabled).toBe(true);
    expect(mounted?.draftServer.calls).toEqual([]);
  });

  it("refuses a name that states a price, and sends nothing", async () => {
    const container = await mountCreated();

    typeInField(container, NAME, "GTV 450 lei");

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      roCopy("priceDashboard.errors.textStatesAnAmount"),
    );
    expect(buttonNamed(container, RENAME).disabled).toBe(true);
    expect(mounted?.draftServer.calls).toEqual([]);
  });

  it("keeps what was typed and says the data changed, when another writer got there first", async () => {
    const container = await mountCreated();
    typeInField(container, NAME, "GTV Premium");
    mounted?.draftServer.moveDraftBehindTheScreen();

    await press(buttonNamed(container, RENAME));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      roCopy("priceDashboard.errors.changedMeanwhile"),
    );
    expect(fieldNamed(container, NAME).value).toBe("GTV Premium");
  });
});

describe("a rename that fails and is tried again", () => {
  it("shows no error once the retry is written", async () => {
    const container = await mountCreated();
    typeInField(container, NAME, "GTV Premium");
    mounted?.draftServer.answerNextWriteWith({ kind: "failed" });
    await press(buttonNamed(container, RENAME));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      roCopy("priceDashboard.errors.saveFailed"),
    );

    await press(buttonNamed(container, RENAME));

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(headingOf(container)).toBe("GTV Premium");
  });
});

describe("a class whose words are the catalogue's", () => {
  it("shows its name as text and offers no field for it", async () => {
    mounted = await mountHardwareEdit(HETTICH, hardwarePageOf());

    expect(nameFieldsIn(mounted.container)).toEqual([]);
    expect(mounted.container.textContent).toContain(
      roCopy("priceDashboard.common.keyedTextNote"),
    );
  });
});

describe("a client that takes no change of a created row's words", () => {
  it("shows the name as text with the reason, offers no field, and sends nothing", async () => {
    const page = hardwarePageOf({ changes: CREATED_CLASS });
    const server = inMemoryPriceDraftClient(page.state);
    const withoutRename: PriceDraftClient = {
      ...server.client,
      acceptsCreatedRowText: undefined,
    };
    mounted = await mountHardwareEdit(CREATED, page, {
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

describe("a class the active version holds and the catalogue does not key", () => {
  const PUBLISHED = "hardware.economic";
  const PUBLISHED_NAME = "GTV Economic";
  const publishedTier = {
    tierId: PUBLISHED,
    ruleId: PUBLISHED,
    name: PUBLISHED_NAME,
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

  it("shows the draft's name, not the active version's, on its page and in the list, once renamed", async () => {
    const page = pageWithThePublishedClass();
    mounted = await mountHardwareEdit(PUBLISHED, page);
    typeInField(mounted.container, NAME, "GTV Premium");
    await press(buttonNamed(mounted.container, RENAME));

    expect(headingOf(mounted.container)).toBe("GTV Premium");
    expect(fieldNamed(mounted.container, NAME).value).toBe("GTV Premium");

    mounted.unmount();
    mounted = await mountHardwareList({
      ...page,
      state: mounted.draftServer.state(),
    });
    expect(rowOf(mounted.container, PUBLISHED).textContent).toContain(
      "GTV Premium",
    );
    expect(rowOf(mounted.container, PUBLISHED).textContent).not.toContain(
      PUBLISHED_NAME,
    );
  });

  it("is named by its published name in the question that switches it off, though the list shows the draft's rename", async () => {
    const page = pageWithThePublishedClass([
      {
        address: {
          kind: "created-row-text",
          item: { kind: "hardware", tierId: PUBLISHED },
          field: "name",
        },
        value: "GTV Premium",
      },
    ]);
    mounted = await mountHardwareList(page);
    expect(rowOf(mounted.container, PUBLISHED).textContent).toContain(
      "GTV Premium",
    );

    await openMenuOf(mounted.container, PUBLISHED, "GTV Premium");
    await press(
      menuEntry(
        mounted.container,
        PUBLISHED,
        roCopy("priceDashboard.common.deactivate"),
      ),
    );

    const text = openDialog()?.textContent ?? "";
    expect(text).toContain(
      roCopy("priceDashboard.lifecycle.deactivateTitle", {
        name: PUBLISHED_NAME,
      }),
    );
    expect(text).not.toContain("GTV Premium");
  });
});
