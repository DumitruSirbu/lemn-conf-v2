// **The whole-kitchen sheet, on a browser that may not write** (M6-AUD-001).
//
// Wave 6G's surface selected `design`, `catalog`, three mutation actions and `lastRejection`, and
// never `canWrite` or `saveStatus`. So on a `/d/{id}` link opened without the write-token cookie the
// trigger was live, the radios were live, and *Aplică* invoked the mutation path — while §9's panel
// one band away was correctly greyed from the same two store fields. A reader could change a tier,
// watch the price move, and land on `saveStatus: "unauthorized"` with the change still on screen.
//
// Two axes are swept, because the panel deliberately fails closed on both and this surface did on
// neither: `canWrite` at `false`, `"checking"` and `"check-failed"`, and a writable browser whose
// save has already been refused.
//
// **This file is also what closes the dropped-wiring risk** `GlobalSettingsSurface.editability`
// records: the sheet's default is *writable*, so the assertions below drive the real store-connected
// `GlobalSettings` rather than the presentational surface, and go red if it stops passing the prop.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ro } from "@/content/ro";
import type { SaveStatus } from "@/persistence/save-coalescer";
import {
  createConfiguratorStore,
  type ConfiguratorState,
  type WriteAccess,
} from "@/store/configurator-store";
import { describeEditability } from "@/store/editability";

import { createFakeProbeFactory } from "../support/fake-body-probe";

/** `global-settings-shell.test.ts`'s pattern, for its reason: the component under test runs against
 *  a real store's real fields rather than a hand-written state shape. */
const storeState = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/store/configurator-store", async (importActual) => {
  const actual =
    await importActual<typeof import("@/store/configurator-store")>();
  return {
    ...actual,
    useConfiguratorStore: (selector: (state: unknown) => unknown) =>
      selector(storeState.current),
  };
});

const { GlobalSettings, GlobalSettingsSurface } = await import(
  "@/settings/global-settings"
);
const { describeGlobalSettings } = await import(
  "@/settings/global-settings-model"
);
const { offerWholeKitchenTiers } = await import("@/price/whole-kitchen-tiers");
const {
  KITCHEN_L_BODY_CATALOG,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  countCabinetsWearingAChosenFinish,
  priceDesign,
  projectDesignForDisplay,
} = await import("@lemnaria/configurator-domain");

/** Every locked state, and the fact each one is locked for. The panel fails closed on all four; this
 *  surface used to fail open on all four. */
const EVERY_LOCKED_ACCESS: readonly {
  readonly canWrite: WriteAccess;
  readonly saveStatus: SaveStatus;
  readonly reason: string;
}[] = [
  { canWrite: false, saveStatus: "idle", reason: ro.panel.readOnlyReason },
  {
    canWrite: "checking",
    saveStatus: "idle",
    reason: ro.panel.accessCheckingReason,
  },
  {
    canWrite: "check-failed",
    saveStatus: "idle",
    reason: ro.panel.accessUncheckableReason,
  },
  {
    canWrite: true,
    saveStatus: "unauthorized",
    reason: ro.panel.readOnlyReason,
  },
];

function stateFor(access: {
  readonly canWrite: WriteAccess;
  readonly saveStatus: SaveStatus;
}): ConfiguratorState {
  const store = createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
  });
  // Written onto the real state rather than hydrated through the API, so the fixture is the two
  // fields the rule reads and nothing about how they got there.
  return {
    ...store.getState(),
    canWrite: access.canWrite,
    saveStatus: access.saveStatus,
  };
}

function closedScreenMarkupFor(access: {
  readonly canWrite: WriteAccess;
  readonly saveStatus: SaveStatus;
}): string {
  storeState.current = stateFor(access);
  return renderToStaticMarkup(createElement(GlobalSettings));
}

/** The open sheet at a given access, which a static render cannot reach through the trigger —
 *  `useState` does not advance without a browser. It is the same `editability` value `GlobalSettings`
 *  computes, from the same function, handed to the same surface. */
function openSheetMarkupFor(access: {
  readonly canWrite: WriteAccess;
  readonly saveStatus: SaveStatus;
}): string {
  const view = describeGlobalSettings({
    pricing: priceDesign({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: KITCHEN_L_DESIGN.settings,
    }),
    offer: offerWholeKitchenTiers({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: KITCHEN_L_DESIGN.settings,
    }),
    groups: projectDesignForDisplay(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
    applied: KITCHEN_L_DESIGN.settings ?? {},
    pending: KITCHEN_L_DESIGN.settings ?? {},
    rejection: null,
    chosenColourCount: countCabinetsWearingAChosenFinish(KITCHEN_L_DESIGN),
  });
  return renderToStaticMarkup(
    createElement(GlobalSettingsSurface, {
      id: "settings",
      view,
      editability: describeEditability(access),
      onChoose: () => undefined,
      onChooseDepth: () => undefined,
      onCancel: () => undefined,
      onApply: () => undefined,
    }),
  );
}

/** Every `<input type="radio">` in a fragment, with whether it renders `disabled`. */
function radioDisabledFlags(markup: string): boolean[] {
  return [...markup.matchAll(/<input\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => tag.includes('type="radio"'))
    .map((tag) => tag.includes("disabled"));
}

function tagWithTestId(markup: string, testId: string): string {
  const found = [...markup.matchAll(/<(?:button|input)\b[^>]*>/g)]
    .map(([tag]) => tag)
    .find((tag) => tag.includes(`data-testid="${testId}"`));
  if (!found) throw new Error(`no control carries data-testid="${testId}"`);
  return found;
}

describe("the control that opens the sheet", () => {
  it("is greyed with its reason in every state that is not an explicit yes", () => {
    for (const access of EVERY_LOCKED_ACCESS) {
      const markup = closedScreenMarkupFor(access);
      const trigger = tagWithTestId(markup, "global-settings-trigger");
      const label = `${String(access.canWrite)} / ${access.saveStatus}`;

      expect(trigger, label).toContain("disabled");
      // §13.1's reason. It travels as the button's own description because ADR 0082's containment
      // forbids adding a line to this strip — see the component's comment.
      expect(trigger, label).toContain(`title="${access.reason}"`);
      expect(trigger, label).toContain(
        `data-disabled-reason="${access.reason}"`,
      );
    }
  });

  it("is live, and carries no reason, on a browser the load said may write", () => {
    // Without this the sweep above proves only that a string appears somewhere, not that it is
    // earned by the access state.
    const trigger = tagWithTestId(
      closedScreenMarkupFor({ canWrite: true, saveStatus: "idle" }),
      "global-settings-trigger",
    );

    expect(trigger).not.toContain("disabled");
    expect(trigger).not.toContain("title=");
  });

  it("hides nothing by locking, because the chips beside it already name both tiers", () => {
    // Why disabling the trigger outright is allowed at all: a locked visitor is not being denied
    // information, only the edit. Both stored tiers are on the strip with the sheet shut.
    const markup = closedScreenMarkupFor({
      canWrite: false,
      saveStatus: "idle",
    });

    for (const group of ["material", "hardware"] as const) {
      const tierId =
        KITCHEN_L_DESIGN.settings?.[
          group === "material" ? "materialTierId" : "hardwareTierId"
        ] ?? SAMPLE_PRICE_BOOK[group].defaultTierId;
      const tier = SAMPLE_PRICE_BOOK[group].tiers.find(
        (one) => one.tierId === tierId,
      );
      if (!tier) throw new Error(`the book holds no ${group} tier "${tierId}"`);
      expect(markup, group).toContain(tier.name);
    }
  });

  it("follows the two store fields rather than a constant, so the wiring cannot be dropped", () => {
    // The dropped-wiring risk `GlobalSettingsSurface.editability`'s doc comment names: its default
    // is *writable*, so a `GlobalSettings` that stopped passing the prop would look correct on a
    // writable browser. Moving one field of an otherwise-writable state is what catches that.
    const writable = tagWithTestId(
      closedScreenMarkupFor({ canWrite: true, saveStatus: "idle" }),
      "global-settings-trigger",
    );
    const refused = tagWithTestId(
      closedScreenMarkupFor({ canWrite: true, saveStatus: "unauthorized" }),
      "global-settings-trigger",
    );

    expect(writable).not.toContain("disabled");
    expect(refused).toContain("disabled");
  });
});

describe("the sheet itself, if a locked browser reaches it", () => {
  it("greys every radio in every group, so nothing is offered that cannot be satisfied", () => {
    for (const access of EVERY_LOCKED_ACCESS) {
      const flags = radioDisabledFlags(openSheetMarkupFor(access));
      const label = `${String(access.canWrite)} / ${access.saveStatus}`;

      // Derived rather than pinned at a number: a fourth group must not satisfy this by arithmetic.
      expect(flags.length, label).toBeGreaterThan(0);
      expect(
        flags.every(Boolean),
        `${label}: ${String(flags.filter((flag) => !flag).length)} live radios`,
      ).toBe(true);
    }
  });

  it("greys the apply and leaves the cancel alone, because leaving must stay possible", () => {
    const markup = openSheetMarkupFor({
      canWrite: false,
      saveStatus: "idle",
    });

    expect(tagWithTestId(markup, "global-settings-apply")).toContain(
      "disabled",
    );
    expect(tagWithTestId(markup, "global-settings-cancel")).not.toContain(
      "disabled",
    );
  });

  it("states the reason once for the sheet, and again only on the action it locks", () => {
    for (const access of EVERY_LOCKED_ACCESS) {
      const markup = openSheetMarkupFor(access);
      const label = `${String(access.canWrite)} / ${access.saveStatus}`;

      expect(markup, label).toContain(
        'data-testid="global-settings-read-only-reason"',
      );
      // Twice, and both are accounted for: the line at the head of the body, and *Aplică*'s own
      // description. Not once per radio — a sentence repeated down a dozen rows is the sheet
      // arguing with itself.
      expect(markup.split(access.reason).length - 1, label).toBe(2);
      expect(tagWithTestId(markup, "global-settings-apply"), label).toContain(
        `title="${access.reason}"`,
      );
    }
  });

  it("leaves the tab ring with a stop the browser can actually reach", () => {
    // The trap computes its ends from the live DOM, so a disabled control listed as a stop moves the
    // wrap point onto an element Tab never visits. `Renunță` is never disabled, which is what keeps
    // the locked ring non-empty.
    const markup = openSheetMarkupFor({ canWrite: false, saveStatus: "idle" });
    const stops = [...markup.matchAll(/<(?:button|input)\b[^>]*>/g)]
      .map(([tag]) => tag)
      .filter((tag) =>
        tag.startsWith("<button")
          ? !tag.includes("disabled")
          : tag.includes('type="radio"') &&
            /\bchecked\b/.test(tag) &&
            !tag.includes("disabled"),
      );

    expect(stops.length).toBe(1);
    expect(stops.at(0)).toContain('data-testid="global-settings-cancel"');
  });

  it("renders a live sheet on a writable browser, so none of the above is unconditional", () => {
    const markup = openSheetMarkupFor({ canWrite: true, saveStatus: "idle" });

    expect(radioDisabledFlags(markup).some(Boolean)).toBe(false);
    expect(markup).not.toContain(
      'data-testid="global-settings-read-only-reason"',
    );
    expect(tagWithTestId(markup, "global-settings-apply")).not.toContain(
      "disabled",
    );
  });
});

describe("the four states this sweep calls locked", () => {
  it("are exactly the ones the shared rule locks, so the sweep is not testing its own list", () => {
    for (const access of EVERY_LOCKED_ACCESS) {
      const editability = describeEditability(access);
      const label = `${String(access.canWrite)} / ${access.saveStatus}`;

      expect(editability.isReadOnly, label).toBe(true);
      expect(editability.disabledReason, label).toBe(access.reason);
    }
    expect(
      describeEditability({ canWrite: true, saveStatus: "idle" }).isReadOnly,
    ).toBe(false);
  });
});
