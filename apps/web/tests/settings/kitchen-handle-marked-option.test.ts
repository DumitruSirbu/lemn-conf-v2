// The handle row marks the handle the kitchen will wear after *Aplică*: a pressed handle that availability has since
// switched off is dropped by apply, so the row must not keep marking it.
import {
  DEFAULT_HANDLE,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type CatalogueAvailability,
  type Handle,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { offerWholeKitchenTiers } from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  type WholeKitchenChoice,
} from "@/settings/global-settings-model";

import { NOTHING_DISABLED } from "../support/availability";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { ro as content } from "../support/romanian-content";
import { SAMPLE_DEEP_CABINET_PERCENT } from "../support/sample-deep-cabinet-percent";

const PRESSED: Handle = "black";
const STORED: Handle = "push";

function switchedOff(...handles: readonly Handle[]): CatalogueAvailability {
  return {
    revision: "1",
    disabled: handles.map((handle) => ({ kind: "handle", handle })),
  };
}

function markedHandles(sheet: {
  readonly applied?: WholeKitchenChoice;
  readonly pending?: WholeKitchenChoice;
  readonly availability?: CatalogueAvailability;
}): readonly Handle[] {
  const request = {
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: KITCHEN_L_DESIGN.settings,
  };
  const view = describeGlobalSettings({
    content,
    pricing: priceDesign(request),
    offer: offerWholeKitchenTiers(request),
    deepCabinetPercent: SAMPLE_DEEP_CABINET_PERCENT,
    groups: projectDesignForDisplay(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
    applied: sheet.applied ?? {},
    pending: sheet.pending ?? {},
    chosenColourCount: 0,
    availability: sheet.availability ?? NOTHING_DISABLED,
  });
  return (view.handleGroup?.options ?? [])
    .filter((option) => option.isSelected)
    .map((option) => option.handle);
}

describe("the handle row's marked option", () => {
  it("is the pressed handle while the sheet still offers it", () => {
    expect(
      markedHandles({
        applied: { handle: STORED },
        pending: { handle: PRESSED },
      }),
    ).toEqual([PRESSED]);
  });

  it("falls back to the applied handle when the pressed one was switched off while the sheet was open", () => {
    expect(
      markedHandles({
        applied: { handle: STORED },
        pending: { handle: PRESSED },
        availability: switchedOff(PRESSED),
      }),
    ).toEqual([STORED]);
  });

  it("falls back to the slot's default when the pressed handle was switched off and none is applied", () => {
    expect(
      markedHandles({
        pending: { handle: PRESSED },
        availability: switchedOff(PRESSED),
      }),
    ).toEqual([DEFAULT_HANDLE]);
  });

  it("is the applied handle when nothing is pressed", () => {
    expect(markedHandles({ applied: { handle: STORED } })).toEqual([STORED]);
  });

  it("marks nothing when the stored handle is switched off and nothing is pressed", () => {
    expect(
      markedHandles({
        applied: { handle: STORED },
        availability: switchedOff(STORED),
      }),
    ).toEqual([]);
  });
});
