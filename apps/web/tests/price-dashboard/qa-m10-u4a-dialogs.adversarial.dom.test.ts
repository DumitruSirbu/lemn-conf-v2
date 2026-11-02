// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U4a, `ItemDialogs` as U4b and U4c will use it. The dialogs are written to be told an item and
// the names of what remains, and "drawn the same for every kind of item"; the hardware tests only ever run them over a hardware
// class. Here every flow is drawn over each kind of item the book can switch, in both locales, and what a kind must not be
// told is checked: no hardware word for a material, a colour, a handle or an accessory, and no promise of a replacement to
// choose for an accessory (the v2-fixes-2 brief, "Accessories have no alternative to choose"; M10 hand-offs, U4a/T1: "the D5E
// hint does not hold for accessories: opening a kitchen never lowers their count").
import { act, createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { ItemRef } from "@lemnaria/configurator-domain";

import { ItemDialogs } from "@/price-dashboard/item-dialogs";
import type { ItemFlow } from "@/price-dashboard/item-flows";

import {
  mountInCatalogue,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { flushPromises } from "../support/render-hook";
import { roCopy } from "./romanian-copy";

const KINDS_THAT_ARE_NOT_HARDWARE: readonly (readonly [string, ItemRef])[] = [
  ["a material", { kind: "material", tierId: "material.mdf" }],
  ["a colour", { kind: "finish", finishId: "white" }],
  ["a handle", { kind: "handle", handle: "push" }],
  [
    "a built-in accessory",
    { kind: "accessory", accessoryId: "sinkProtectiveCover" },
  ],
  [
    "a linked accessory",
    { kind: "accessory", accessoryId: "linked-towel-rail" },
  ],
];

const ACCESSORY: ItemRef = {
  kind: "accessory",
  accessoryId: "sinkProtectiveCover",
};

/** A linked accessory the dashboard created: the only kind of accessory that is ever deleted (built-ins never are). */
const LINKED_ACCESSORY = {
  kind: "accessory",
  accessoryId: "linked-towel-rail",
} as const;

/** What a person reads about hardware, which no other kind of item's dialog may say. */
/* eslint-disable no-restricted-syntax -- a negative claim about the wording: the words no dialog for another kind of item may hold. */
const HARDWARE_WORDS =
  /feronerie|clas[aăeă]|balama|glisier|push-to-open|rabatabil|мебельн|фурнитур|класс|петл|направляющ/iu;
/* eslint-enable no-restricted-syntax */

const NAME = "Numele";
const NO_REMAINING: readonly ItemRef[] = [];
const OTHER: ItemRef = { kind: "material", tierId: "material.pal" };

let mounted: MountedScreen | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

function flowsOf(item: ItemRef): readonly (readonly [string, ItemFlow])[] {
  const deletable =
    item.kind === "finish" || item.kind === "handle" ? undefined : item;
  const counted = { kind: "counted", count: 23 } as const;
  const common: (readonly [string, ItemFlow])[] = [
    [
      "the switch-off",
      { kind: "deactivate", item, remaining: [OTHER], usage: counted },
    ],
    [
      "the switch-off nobody uses",
      {
        kind: "deactivate",
        item,
        remaining: NO_REMAINING,
        usage: { kind: "counted", count: 0 },
      },
    ],
    ["the switch-on", { kind: "activate", item }],
    ["the last active option", { kind: "last-active-option", item }],
  ];
  if (deletable === undefined) return common;
  return [
    ...common,
    [
      "the deletion",
      { kind: "delete", item: deletable, usage: counted, isDraftOnly: false },
    ],
    [
      "the deletion of a draft-only row",
      { kind: "delete", item: deletable, usage: counted, isDraftOnly: true },
    ],
    [
      "the block on a used item that is on",
      { kind: "delete-blocked", item: deletable, count: 23, isOn: true },
    ],
    [
      "the block on a used item that is off",
      { kind: "delete-blocked", item: deletable, count: 23, isOn: false },
    ],
  ];
}

function textOf(flow: ItemFlow, locale: TestLocale): string {
  mounted = mountInCatalogue(
    createElement(ItemDialogs, {
      desk: {
        flow,
        failure: undefined,
        isBusy: false,
        confirm: () => undefined,
        dismiss: () => undefined,
      },
      nameOf: () => NAME,
      returnFocusFallbackRef: { current: null },
    }),
    locale,
  );
  const dialog = document.querySelector(
    '[role="alertdialog"], [role="dialog"]',
  );
  const text = dialog?.textContent;
  mounted.unmount();
  mounted = undefined;
  if (text === undefined) throw new Error(`no dialog opened for ${flow.kind}`);
  return text;
}

describe("a dialog drawn for an item that is not hardware", () => {
  it.each(KINDS_THAT_ARE_NOT_HARDWARE)(
    "says no word of hardware for %s, in any flow, in either locale",
    async (_kind, item) => {
      for (const locale of ["ro", "ru"] as const) {
        for (const [label, flow] of flowsOf(item)) {
          const text = textOf(flow, locale);
          await act(async () => {
            await flushPromises(2);
          });

          expect(
            HARDWARE_WORDS.exec(text)?.[0],
            `${label} for ${item.kind} in ${locale}: "${text}"`,
          ).toBeUndefined();
        }
      }
    },
  );

  it("is a check that can fail: the words it looks for are found in a sentence about hardware", () => {
    expect(HARDWARE_WORDS.exec("Clasa de feronerie")?.[0]).toBeDefined();
    expect(HARDWARE_WORDS.exec("Класс фурнитуры")?.[0]).toBeDefined();
  });

  it("names the item with the name the screen gave, in every flow that names one", () => {
    for (const [label, flow] of flowsOf(ACCESSORY)) {
      const text = textOf(flow, "ro");
      if (flow.kind === "last-active-option" || flow.kind === "activate") {
        expect(text, label).toContain(NAME);
      }
    }
  });
});

describe("what a switch-off says of an accessory", () => {
  it("says the line is dropped and the customer is told, never that a replacement is chosen, when kitchens use it", () => {
    const text = textOf(
      {
        kind: "deactivate",
        item: ACCESSORY,
        remaining: NO_REMAINING,
        usage: { kind: "counted", count: 5 },
      },
      "ro",
    );

    expect(text).toContain(
      roCopy("priceDashboard.lifecycle.accessoryRemovedExplained"),
    );
    expect(text).not.toContain(
      roCopy("priceDashboard.lifecycle.replacementExplained"),
    );
  });

  it("says no line of consequence for an accessory nobody uses beyond that customers cannot choose it", () => {
    const text = textOf(
      {
        kind: "deactivate",
        item: ACCESSORY,
        remaining: NO_REMAINING,
        usage: { kind: "counted", count: 0 },
      },
      "ro",
    );

    expect(text).not.toContain(
      roCopy("priceDashboard.lifecycle.accessoryRemovedExplained"),
    );
    expect(text).not.toContain(
      roCopy("priceDashboard.lifecycle.replacementExplained"),
    );
  });
});

describe("the block on deleting a used accessory (reads the brief and the M10 hand-off, U4a/T1)", () => {
  // "Accessories have no alternative to choose": a customer who opens a kitchen that uses a switched-off accessory is told it
  // was taken out, and chooses nothing. The block names "o poți dezactiva; clientului i se va cere atunci să aleagă altă
  // opțiune" and the inactive block says "clienții aleg altă opțiune": both are false of an accessory.
  // eslint-disable-next-line no-restricted-syntax -- a negative claim about the wording: the promise of another option, which an accessory has none of.
  const CHOOSE_ANOTHER = /alt[aă] op[tț]iune|другой вариант/iu;

  it.each(["ro", "ru"] as const)(
    "does not promise an accessory's customer a replacement to choose, where the accessory is on (%s)",
    (locale) => {
      const text = textOf(
        {
          kind: "delete-blocked",
          item: LINKED_ACCESSORY,
          count: 23,
          isOn: true,
        },
        locale,
      );

      expect(CHOOSE_ANOTHER.exec(text)?.[0]).toBeUndefined();
    },
  );

  it.each(["ro", "ru"] as const)(
    "does not promise an accessory's customer a replacement to choose, where the accessory is already off (%s)",
    (locale) => {
      const text = textOf(
        {
          kind: "delete-blocked",
          item: LINKED_ACCESSORY,
          count: 23,
          isOn: false,
        },
        locale,
      );

      expect(CHOOSE_ANOTHER.exec(text)?.[0]).toBeUndefined();
    },
  );

  it("does promise it for a hardware class, which is what the same sentence is true of", () => {
    const text = textOf(
      {
        kind: "delete-blocked",
        item: { kind: "hardware", tierId: "hardware.soft-close" },
        count: 23,
        isOn: true,
      },
      "ro",
    );

    expect(CHOOSE_ANOTHER.exec(text)?.[0]).toBeDefined();
  });
});
