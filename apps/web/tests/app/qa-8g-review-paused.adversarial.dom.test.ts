// @vitest-environment happy-dom
//
// The review while the limit on saves holds a write: how the sentence is drawn and what it offers. A pause is no
// failure, so it has the quiet card and no way back to the editor to settle anything. The scene, the locale menu and
// the exit screen are stubs; WebGL support is answered "supported".
import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/review/review-scene", () => ({
  ReviewScene: () => createElement("div"),
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => null,
}));
vi.mock("@/components/webgl-unavailable", () => ({
  WebGLUnavailable: () => createElement("main"),
}));

import { HydrateAndReview } from "@/app/d/[id]/review/hydrate-and-review";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";

const DESIGN_ID = "design-under-review" as DesignId;
const RESUMES_AT_MS = new Date(2026, 9, 10, 14, 5).getTime();

let container: HTMLDivElement;
let root: Root;

function mountReviewOfAnEditedDesign(): void {
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
    revision: "4",
    canWrite: true,
  });
  useConfiguratorStore.setState({
    design: { ...KITCHEN_L_DESIGN, presetId: "edited-in-the-editor" },
  });
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(HydrateAndReview, {
          design: KITCHEN_L_DESIGN,
          designId: DESIGN_ID,
          revision: "4",
        }),
      }),
    );
  });
}

function waitSentence(): Element {
  const sentence = container.querySelector('[data-testid="review-save-wait"]');
  if (sentence === null) throw new Error("no sentence about a save");
  return sentence;
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("the review while the limit on saves holds a write", () => {
  beforeEach(() => {
    mountReviewOfAnEditedDesign();
    act(() => {
      useConfiguratorStore.getState().setSaveStatus("error", RESUMES_AT_MS);
    });
  });

  it("draws the sentence in the quiet card, not the refusal's red edge", () => {
    const drawnAs = waitSentence().getAttribute("class") ?? "";

    expect(drawnAs).toContain("waiting");
    expect(drawnAs).not.toContain("refusal");
  });

  it("offers no link to the editor, where there is nothing to settle", () => {
    expect(
      container.querySelector('[data-testid="review-open-editor"]'),
    ).toBeNull();
  });

  it("draws the same status with no time as the failure it is", () => {
    act(() => {
      useConfiguratorStore.getState().setSaveStatus("error");
    });

    expect(waitSentence().getAttribute("class") ?? "").toContain("refusal");
  });
});
