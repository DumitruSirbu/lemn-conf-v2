// @vitest-environment happy-dom
// What the Preview pop-up says under the slide when Select did not produce a kitchen: its own sentences, not the room
// screen's `room.compose.*` ones, which speak of a kitchen already drawn behind it.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PresetCarouselDialog,
  type PresetSlide,
} from "@/room/preset-carousel-dialog";
import type { PresetCopyStatus } from "@/room/use-generation";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import type { Catalogue, CatalogueLocale } from "../support/catalogues";

const SLIDE: PresetSlide = {
  id: "slide-one",
  name: "A kitchen",
  imageUrl: "/api/presets/slide-one/image",
  isAdjusted: false,
};

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

function mount(
  locale: CatalogueLocale,
  messages: Catalogue,
  copyStatus: PresetCopyStatus,
): void {
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(PresetCarouselDialog, {
          slides: [SLIDE],
          startIndex: 0,
          copyStatus,
          onSelect: () => undefined,
          onSlideChange: () => undefined,
          onClose: () => undefined,
        }),
        locale,
        messages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

function statusText(): string | null {
  return (
    container.querySelector('[data-testid="preset-carousel-status"]')
      ?.textContent ?? null
  );
}

const LOCALES = [
  ["ro", roMessages],
  ["ru", ruMessages as Catalogue],
] as const;

describe.each(LOCALES)(
  "the Preview pop-up's status line in %s",
  (locale, messages) => {
    it("says the pop-up's own failure sentence when the copy failed", () => {
      mount(locale, messages, "failed");

      expect(statusText()).toBe(messages.presetChooser.selectFailed);
      expect(statusText()).not.toBe(messages.room.compose.saveFailed);
    });

    it("says the pop-up's own limit sentence when the day's limit is reached", () => {
      mount(locale, messages, "limited");

      expect(statusText()).toBe(messages.presetChooser.selectLimitReached);
      expect(statusText()).not.toBe(messages.room.compose.limitReached);
    });

    it("says nothing while nothing has gone wrong", () => {
      mount(locale, messages, "idle");

      expect(statusText()).toBe("");
    });
  },
);
