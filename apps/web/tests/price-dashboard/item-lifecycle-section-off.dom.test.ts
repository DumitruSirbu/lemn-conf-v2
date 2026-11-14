// @vitest-environment happy-dom
//
// The availability section of an item's page: with a reason its button is off, says so to the browser and to assistive
// technology, and a press on it asks for nothing; the status is stated either way; without a reason it is pressed.
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type DeletableItemRef,
} from "@lemnaria/configurator-domain";

import { ItemLifecycleSection } from "@/price-dashboard/item-edit-parts";
import { useItemAvailability } from "@/price-dashboard/use-item-availability";

import { click, mountInCatalogue } from "../support/render-with-intl";
import { draftMovingOnEveryRead } from "../support/draft-facts-now";
import { renderHook } from "../support/render-hook";
import {
  availabilityActionIn,
  availabilityStatusIn,
} from "./item-availability-control";
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
  const toggle = availabilityActionIn(mounted.container);
  const unmount = () => {
    mounted.unmount();
    desk.unmount();
  };
  return {
    toggle,
    status: availabilityStatusIn(mounted.container),
    requestSwitch,
    unmount,
  };
}

function descriptionOf(control: HTMLElement): (string | undefined)[] {
  return (control.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent);
}

describe("an item's availability section", () => {
  it("has its button off when it has a reason, and a press on it asks for nothing", () => {
    const { toggle, requestSwitch, unmount } = sectionWith(REASON);

    expect(toggle.getAttribute("aria-disabled")).toBe("true");
    click(toggle);

    expect(requestSwitch).not.toHaveBeenCalled();
    unmount();
  });

  it("carries the reason and then the hint as its description, so the off state is said and not only drawn", () => {
    const { toggle, unmount } = sectionWith(REASON);

    expect(descriptionOf(toggle)).toEqual([REASON, WORDS.activeNote]);
    unmount();
  });

  it("states the status whether or not the button is off, and the reason stands under the button", () => {
    const { toggle, status, unmount } = sectionWith(REASON);

    expect(status.textContent).toBe(
      `${WORDS.activeLabel}${roCopy("priceDashboard.chips.active")}`,
    );
    expect(toggle.nextElementSibling?.textContent).toBe(REASON);
    unmount();
  });

  it("is described by the hint alone, and says no reason, while the button can be pressed", () => {
    const { toggle, unmount } = sectionWith(undefined);

    expect(descriptionOf(toggle)).toEqual([WORDS.activeNote]);
    expect(toggle.nextElementSibling?.textContent).not.toBe(REASON);
    unmount();
  });

  it("has its button on when it has no reason, and a press on it asks for the change", () => {
    const { toggle, requestSwitch, unmount } = sectionWith(undefined);

    expect(toggle.hasAttribute("aria-disabled")).toBe(false);
    click(toggle);

    expect(requestSwitch).toHaveBeenCalledExactlyOnceWith(HETTICH);
    unmount();
  });
});
