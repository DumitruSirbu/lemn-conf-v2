// @vitest-environment happy-dom
// M8D wave W2, decision D-2: the one notice both preset dialogs draw. A tone is told by its mark as well as its colour,
// the live region exists before it has anything to say, and the region's text is the sentence alone.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PresetStatusNotice,
  type PresetStatus,
  type PresetStatusTone,
} from "@/preset/preset-status-notice";

const SENTENCE = "Saving the preset...";
const TEST_ID = "a-notice";

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

function render(status: PresetStatus | undefined): void {
  act(() => {
    root.render(createElement(PresetStatusNotice, { status, testId: TEST_ID }));
  });
}

function region(): HTMLElement {
  return required(
    container.querySelector<HTMLElement>(`[data-testid="${TEST_ID}"]`),
  );
}

function noticeBox(): HTMLElement {
  return required(
    required(
      container.querySelector<HTMLElement>("[data-tone], p"),
    ).closest<HTMLElement>("div"),
  );
}

describe("PresetStatusNotice", () => {
  it.each([
    ["progress", undefined],
    ["error", "!"],
    ["warn", "!"],
    ["ok", "✓"],
  ] as const)("draws the %s tone with its own mark", (tone, glyph) => {
    render({ tone, sentence: SENTENCE });

    expect(noticeBox().getAttribute("data-tone")).toBe(tone);
    const mark = noticeBox().firstElementChild;
    expect(mark?.tagName).toBe("SPAN");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.textContent).toBe(glyph ?? "");
  });

  it("tells progress, error and ok apart by their mark, not by colour alone", () => {
    const markOf = (tone: PresetStatusTone): string => {
      render({ tone, sentence: SENTENCE });
      return noticeBox().firstElementChild?.textContent ?? "";
    };

    const marks = [markOf("progress"), markOf("error"), markOf("ok")];

    expect(new Set(marks).size).toBe(3);
  });

  it("reads the sentence alone in its live region, with the mark outside it", () => {
    render({ tone: "error", sentence: SENTENCE });

    expect(region().getAttribute("role")).toBe("status");
    expect(region().getAttribute("aria-live")).toBe("polite");
    expect(region().textContent).toBe(SENTENCE);
    expect(region().querySelector("[aria-hidden]")).toBeNull();
  });

  it("draws the live region with nothing in it, and no tone or mark, while there is nothing to say", () => {
    render(undefined);

    expect(region().getAttribute("role")).toBe("status");
    expect(region().hasAttribute("hidden")).toBe(false);
    expect(region().textContent).toBe("");
    expect(
      container.querySelector("[data-tone]")?.getAttribute("data-tone") ?? null,
    ).toBeNull();
    expect(container.querySelector("[aria-hidden]")).toBeNull();
  });

  it("keeps the same live region when the sentence arrives, so a screen reader announces the change", () => {
    render(undefined);
    const before = region();

    render({ tone: "warn", sentence: SENTENCE });

    expect(region()).toBe(before);
    expect(region().textContent).toBe(SENTENCE);
  });

  it("clears the tone again when the status goes back to nothing", () => {
    render({ tone: "ok", sentence: SENTENCE });

    render(undefined);

    expect(region().textContent).toBe("");
    expect(container.querySelector("[data-tone]")).toBeNull();
    expect(container.querySelector("[aria-hidden]")).toBeNull();
  });

  it("draws a sentence as text, never as markup", () => {
    render({ tone: "error", sentence: "<b>x</b>" });

    expect(region().textContent).toBe("<b>x</b>");
    expect(region().querySelector("b")).toBeNull();
  });
});

// Helpers

function required<Element>(element: Element | null): Element {
  if (element === null) throw new Error("the notice drew nothing here");
  return element;
}
