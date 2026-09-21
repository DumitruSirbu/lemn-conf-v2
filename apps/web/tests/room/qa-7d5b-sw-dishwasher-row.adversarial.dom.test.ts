// @vitest-environment happy-dom
//
// **Adversarial QA for M7 wave 7D5b slice SW — the dishwasher row as the customer reads it**, in
// both locales (ADR 0110 Amendment M3; ADR 0113).
//
// `generation-steps.dom.test.ts` renders the two plan witnesses. This file renders the rooms where
// the row is most likely to be told wrong: the S2 trade rooms, and the rooms where the fridge is
// dropped and a dishwasher stands — where a sentence naming what was left out sits right under a row
// saying the dishwasher is in. It also holds the owner's *no explanatory sentence* ruling to the
// whole frame rather than to the row's child count: the dishwasher's label appears on the glass
// exactly once, in its row, whatever the row's status.
import {
  generateKitchen,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  pendingGenerationRows,
  resolveGenerationRows,
} from "@/room/generation-model";
import { GenerationSteps } from "@/room/generation-steps";
import type { ActiveGenerationRun } from "@/room/use-generation";

import {
  CATALOGUES,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-14T09:00:00.000Z";
const WITNESS_CEILING_MM = 2600;

const ROW_ORDER = [
  "fridge",
  "sink",
  "preparation",
  "hob",
  "dishwasher",
  "storage",
] as const;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function roomOf(widthMm: number, depthMm: number): DesignRoom {
  return { shape: "L", widthMm, depthMm, heightMm: WITNESS_CEILING_MM };
}

function composedRun(room: DesignRoom): ActiveGenerationRun {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) {
    throw new Error(
      `${String(room.widthMm)} × ${String(room.depthMm)} no longer composes`,
    );
  }
  return {
    phase: "composed",
    room,
    rows: resolveGenerationRows(result.log),
    design: result.design,
    log: result.log,
    attempt: {
      run: () => {
        throw new Error("this file renders rows; it never performs a hand-off");
      },
    },
    handoff: "saving",
  };
}

function render(
  run: ActiveGenerationRun,
  locale: CatalogueLocale,
  messages: Catalogue,
): void {
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(GenerationSteps, {
          run,
          onBack: () => undefined,
          onRetry: () => undefined,
        }),
        locale,
        messages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

function elementAt(testId: string): Element {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (element === null) throw new Error(`1F drew no ${testId}`);
  return element;
}

function occurrencesIn(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/** Rooms, their expected dishwasher and storage words, and why each is here. */
const ROOMS: readonly (readonly [
  string,
  DesignRoom,
  "placed" | "not_placed",
  "placed" | "not_placed",
])[] = [
  [
    "1500 × 2800, M1, dishwasher-only storage",
    roomOf(1500, 2800),
    "placed",
    "not_placed",
  ],
  [
    "900 × 3400, the (e) drawer swap",
    roomOf(900, 3400),
    "placed",
    "not_placed",
  ],
  ["1500 × 3500, no dishwasher", roomOf(1500, 3500), "not_placed", "placed"],
  ["4650 × 1000, the (c) tower trade", roomOf(4650, 1000), "placed", "placed"],
  ["900 × 5000, the (b) pantry trade", roomOf(900, 5000), "placed", "placed"],
  ["900 × 4700, the (d) bottle trade", roomOf(900, 4700), "placed", "placed"],
];

describe.each(CATALOGUES)(
  "frame 1F's dishwasher row in %s (7D5b SW)",
  (locale, messages) => {
    const compose = messages.room.compose;

    it.each(ROOMS)(
      "%s: six rows in order, with the dishwasher and storage reading their own words",
      (_case, room, dishwasherStatus, storageStatus) => {
        render(composedRun(room), locale, messages);

        expect(
          [...container.querySelectorAll("[data-compose-status]")].map((row) =>
            row.getAttribute("data-testid"),
          ),
        ).toEqual(ROW_ORDER.map((rowId) => `room-compose-row-${rowId}`));
        expect(
          elementAt("room-compose-row-dishwasher").getAttribute(
            "data-compose-status",
          ),
        ).toBe(dishwasherStatus);
        expect(elementAt("room-compose-status-dishwasher").textContent).toBe(
          dishwasherStatus === "placed"
            ? compose.status.placed
            : compose.status.notPlaced,
        );
        expect(elementAt("room-compose-status-storage").textContent).toBe(
          storageStatus === "placed"
            ? compose.status.placed
            : compose.status.notPlaced,
        );
      },
    );

    it.each(ROOMS)(
      "%s: the label is on the glass once, in its row, with the width and nothing explaining it",
      (_case, room) => {
        render(composedRun(room), locale, messages);

        const row = elementAt("room-compose-row-dishwasher");
        expect(elementAt("room-compose-name-dishwasher").textContent).toBe(
          `${compose.dishwasher} · 600`,
        );
        expect(occurrencesIn(container.textContent, compose.dishwasher)).toBe(
          1,
        );
        expect(
          [...row.children].map((child) => child.getAttribute("data-testid")),
        ).toEqual([
          null,
          "room-compose-name-dishwasher",
          "room-compose-status-dishwasher",
        ]);
      },
    );

    it.each([
      ["900 × 3400", roomOf(900, 3400)],
      ["1500 × 2800", roomOf(1500, 2800)],
    ])(
      "%s: the dropped sentence names the fridge and never the dishwasher, under a dishwasher inclus",
      (_case, room) => {
        render(composedRun(room), locale, messages);

        const sentence = elementAt("room-compose-dropped").textContent;
        expect(sentence).toContain(compose.role.fridge);
        expect(sentence).not.toContain(compose.dishwasher);
        expect(sentence).not.toContain(compose.role.storage);
        expect(elementAt("room-compose-status-preparation").textContent).toBe(
          compose.status.placed,
        );
      },
    );

    it("draws the row pending at 600 before the log exists, keyed the same as when resolved", () => {
      render(
        {
          phase: "composing",
          room: roomOf(1500, 2800),
          rows: pendingGenerationRows(),
        },
        locale,
        messages,
      );

      expect(
        elementAt("room-compose-row-dishwasher").getAttribute(
          "data-compose-status",
        ),
      ).toBe("pending");
      expect(elementAt("room-compose-name-dishwasher").textContent).toBe(
        `${compose.dishwasher} · 600`,
      );
    });
  },
);
