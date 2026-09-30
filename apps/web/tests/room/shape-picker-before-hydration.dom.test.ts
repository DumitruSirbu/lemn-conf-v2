// @vitest-environment happy-dom
//
// **A shape card tapped before hydration is reported once the picker hydrates** — the defect that left
// *Continuă* disabled for good under load (see `tests/e2e/room-shape-before-hydration.e2e.spec.ts`).
//
// The stimulus is the real one: the picker is rendered to a string as the server does, a radio is
// tapped in that markup while no React is attached to it, and only then is the markup hydrated.
import type { RoomShape } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, type ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShapePicker } from "@/room/shape-picker";

import roMessages from "../../src/messages/ro.json";

const SHAPES: readonly RoomShape[] = ["linear", "L", "U"];

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  container.remove();
});

function thePicker(
  chosenShape: RoomShape | undefined,
  onChoose: (shape: RoomShape) => void,
): ReactElement {
  return createElement(NextIntlClientProvider, {
    children: createElement(ShapePicker, {
      chosenShape,
      labelledBy: "shape-question",
      describedBy: undefined,
      onChoose,
    }),
    locale: "ro",
    messages: roMessages,
    timeZone: "Europe/Chisinau",
  });
}

function radioFor(shape: RoomShape): HTMLInputElement {
  const radio = container.querySelector(`[data-testid="room-shape-${shape}"]`);
  if (!(radio instanceof HTMLInputElement)) {
    throw new Error(`the picker draws no radio for ${shape}`);
  }
  return radio;
}

function serverRenderedPicker(): void {
  container.innerHTML = renderToString(thePicker(undefined, vi.fn()));
}

function hydratePicker(onChoose: (shape: RoomShape) => void): void {
  act(() => {
    root = hydrateRoot(container, thePicker(undefined, onChoose));
  });
}

describe("ShapePicker hydrating over a card tapped before React attached", () => {
  for (const shape of SHAPES) {
    it(`reports the ${shape} card as chosen`, () => {
      const onChoose = vi.fn();
      serverRenderedPicker();
      radioFor(shape).click();

      hydratePicker(onChoose);

      expect(onChoose).toHaveBeenCalledWith(shape);
    });
  }

  it("reports nothing when no card was tapped", () => {
    const onChoose = vi.fn();
    serverRenderedPicker();

    hydratePicker(onChoose);

    expect(onChoose).not.toHaveBeenCalled();
  });

  it("still reports a card tapped after hydration", () => {
    const onChoose = vi.fn();
    serverRenderedPicker();
    hydratePicker(onChoose);

    act(() => {
      radioFor("L").click();
    });

    expect(onChoose).toHaveBeenCalledExactlyOnceWith("L");
  });
});
