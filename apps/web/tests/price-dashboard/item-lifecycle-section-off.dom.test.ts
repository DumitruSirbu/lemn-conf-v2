// @vitest-environment happy-dom
//
// The switch row of an item's page: with a reason it is a switch that is off, says so to the browser and to assistive
// technology, and a press on it asks for nothing; without one it is pressed as before.
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type DeletableItemRef,
} from "@lemnaria/configurator-domain";

import { ItemLifecycleSection } from "@/price-dashboard/item-edit-parts";
import { useItemAvailability } from "@/price-dashboard/use-item-availability";

import {
  click,
  mountInCatalogue,
  requireIn,
} from "../support/render-with-intl";
import { draftMovingOnEveryRead } from "../support/draft-facts-now";
import { renderHook } from "../support/render-hook";
import { recordingLifecycleClient } from "./recording-item-lifecycle-client";
import { roCopy } from "./romanian-copy";

const HETTICH: DeletableItemRef = {
  kind: "hardware",
  tierId: "hardware.soft-close",
};
const NOTHING_OFF = { revision: "1", disabled: [] };
const REASON = roCopy("priceDashboard.lifecycle.fixedDefaultCannotChange");
const WORDS = {
  activeLabel: "Active in the configurator",
  activeNote: "Applies at once.",
  deleteHeading: "Delete",
  deleteHint: undefined,
  deleteAction: "Delete the class",
};

function sectionWith(switchReason: string | undefined) {
  const lifecycle = recordingLifecycleClient({
    book: SAMPLE_PRICE_BOOK,
    availability: NOTHING_OFF,
    defaults: {},
    usage: [],
  });
  const desk = renderHook(() =>
    useItemAvailability({
      observed: NOTHING_OFF,
      book: SAMPLE_PRICE_BOOK,
      defaults: {},
      client: lifecycle.client,
      deleteFromDraft: () => Promise.resolve({ kind: "failed" }),
      isDraftOnly: () => false,
      readDraftNow: draftMovingOnEveryRead(),
    }),
  );
  const requestSwitch = vi.fn();
  const mounted = mountInCatalogue(
    createElement(ItemLifecycleSection, {
      availability: { ...desk.result.current, requestSwitch },
      item: HETTICH,
      reasons: { switchReason, deleteReason: undefined },
      words: WORDS,
    }),
  );
  const toggle = requireIn(mounted.container, '[role="switch"]');
  const unmount = () => {
    mounted.unmount();
    desk.unmount();
  };
  return { toggle, requestSwitch, unmount };
}

describe("an item's switch row", () => {
  it("is a switch that is off when it has a reason, and a press on it asks for nothing", () => {
    const { toggle, requestSwitch, unmount } = sectionWith(REASON);

    expect(toggle.getAttribute("aria-disabled")).toBe("true");
    expect(toggle.className).toContain("switch");
    click(toggle);

    expect(requestSwitch).not.toHaveBeenCalled();
    unmount();
  });

  it("carries the reason as its description, so the off state is said and not only drawn", () => {
    const { toggle, unmount } = sectionWith(REASON);

    const describedBy = toggle.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe(REASON);
    unmount();
  });

  it("is a switch that is not off when it has no reason, and a press on it asks for the switch", () => {
    const { toggle, requestSwitch, unmount } = sectionWith(undefined);

    expect(toggle.hasAttribute("aria-disabled")).toBe(false);
    click(toggle);

    expect(requestSwitch).toHaveBeenCalledExactlyOnceWith(HETTICH);
    unmount();
  });
});
