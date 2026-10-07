// @vitest-environment happy-dom
//
// Arriving at the review (M8 8D S4, criteria 4 and 20): what the page does with a store that may already hold the
// design with an edit not yet saved, that it asks the server nothing, and what its call to action does while a save
// is owed. The scene, the locale menu and the editor's exit screen are stubs; WebGL support is answered "supported".
//
// What this cannot see: Next's client navigation from the editor, the save coalescer's timing, and any request the
// review's *children* might make that is not a `fetch` (none exists today). The no-request pin watches `fetch` and
// reads the review's sources.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/review/review-scene", () => ({
  ReviewScene: () => createElement("div", { "data-testid": "scene-stub" }),
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
import ruMessages from "../../src/messages/ru.json";

const DESIGN_ID = "design-under-review" as DesignId;
const OTHER_ID = "another-design" as DesignId;
const SRC = join(import.meta.dirname, "../../src");

let container: HTMLDivElement;
let root: Root;
const fetchCalls = vi.fn();

function editedCopyOf(design: Design): Design {
  return { ...design, presetId: "edited-in-the-editor" };
}

function mountReview(pageDesign: Design, locale: "ro" | "ru" = "ro"): void {
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        locale,
        messages: (locale === "ro"
          ? roMessages
          : ruMessages) as typeof roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(HydrateAndReview, {
          design: pageDesign,
          designId: DESIGN_ID,
          revision: "1",
        }),
      }),
    );
  });
}

function cta(): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    '[data-testid="review-cta"]',
  );
  if (element === null) throw new Error("no call to action");
  return element;
}

function waitSentence(): string | undefined {
  return (
    container.querySelector('[data-testid="review-save-wait"]')?.textContent ??
    undefined
  );
}

function sourceFilesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesIn(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", (...args: unknown[]) => {
    fetchCalls(...args);
    return new Promise<Response>(() => undefined);
  });
  fetchCalls.mockClear();
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

describe("a direct load of the review", () => {
  beforeEach(() => {
    useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
  });

  it("hydrates the store from the page's design", () => {
    mountReview(KITCHEN_L_DESIGN);

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: KITCHEN_L_DESIGN,
      designId: DESIGN_ID,
      revision: "1",
      canWrite: "checking",
    });
  });

  it("has its call to action ready as soon as the page is, with no sentence about a save", () => {
    mountReview(KITCHEN_L_DESIGN);

    expect(cta().tagName).toBe("A");
    expect(cta().getAttribute("aria-disabled")).toBeNull();
    expect(waitSentence()).toBeUndefined();
  });

  it("sends no request at all", async () => {
    mountReview(KITCHEN_L_DESIGN);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(fetchCalls).not.toHaveBeenCalled();
  });
});

describe("arriving from the editor, which holds this design with an edit not yet saved", () => {
  const edited = editedCopyOf(KITCHEN_L_DESIGN);

  beforeEach(() => {
    const store = useConfiguratorStore.getState();
    store.hydrate({
      design: KITCHEN_L_DESIGN,
      designId: DESIGN_ID,
      revision: "4",
      canWrite: true,
    });
    useConfiguratorStore.setState({ design: edited, hasBeenEdited: true });
  });

  it("keeps the editor's store: the edit, the revision and the probe's answer", () => {
    mountReview(KITCHEN_L_DESIGN);

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: edited,
      savedDesign: KITCHEN_L_DESIGN,
      revision: "4",
      canWrite: true,
      hasBeenEdited: true,
    });
  });

  it("holds the call to action off, with the saving sentence on screen beside it", () => {
    mountReview(KITCHEN_L_DESIGN);

    expect(cta().tagName).toBe("BUTTON");
    expect(cta().getAttribute("aria-disabled")).toBe("true");
    expect(waitSentence()).toBe(roMessages.reviewScreen.saving);
    expect(cta().getAttribute("aria-describedby")).toBe(
      container.querySelector('[data-testid="review-save-wait"]')?.id,
    );
  });

  it("says the same in Russian", () => {
    mountReview(KITCHEN_L_DESIGN, "ru");

    expect(waitSentence()).toBe(ruMessages.reviewScreen.saving);
  });

  it("makes the call to action ready at the moment the save that covers the edit lands", () => {
    mountReview(KITCHEN_L_DESIGN);

    act(() => {
      useConfiguratorStore
        .getState()
        .applySaved({ id: DESIGN_ID, revision: "5", savedDesign: edited });
    });

    expect(cta().tagName).toBe("A");
    expect(waitSentence()).toBeUndefined();
  });

  it("keeps waiting when the save that lands is an older one than the edit on screen", () => {
    mountReview(KITCHEN_L_DESIGN);

    act(() => {
      useConfiguratorStore.getState().applySaved({
        id: DESIGN_ID,
        revision: "5",
        savedDesign: editedCopyOf(KITCHEN_L_DESIGN),
      });
    });

    expect(cta().getAttribute("aria-disabled")).toBe("true");
  });

  it("sends no request either", async () => {
    mountReview(KITCHEN_L_DESIGN);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(fetchCalls).not.toHaveBeenCalled();
  });

  it.each([
    ["error", roMessages.panel.saveFailedNotice],
    ["stopped", roMessages.panel.saveStoppedNotice],
    ["conflict", roMessages.panel.saveConflictNotice],
    ["unauthorized", roMessages.panel.readOnlyRefusedNotice],
  ] as const)(
    "when the save has failed (%s) says what the editor says, and does not offer the request",
    (status, sentence) => {
      mountReview(KITCHEN_L_DESIGN);

      act(() => {
        useConfiguratorStore.getState().setSaveStatus(status);
      });

      expect(waitSentence()).toBe(sentence);
      expect(cta().getAttribute("aria-disabled")).toBe("true");
    },
  );
});

describe("arriving at a store that holds another design, or none", () => {
  it("replaces another design's store with the page's", () => {
    useConfiguratorStore.getState().hydrate({
      design: editedCopyOf(KITCHEN_L_DESIGN),
      designId: OTHER_ID,
      revision: "9",
      canWrite: true,
    });

    mountReview(KITCHEN_L_DESIGN);

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: KITCHEN_L_DESIGN,
      savedDesign: KITCHEN_L_DESIGN,
      designId: DESIGN_ID,
      revision: "1",
      canWrite: "checking",
      hasBeenEdited: false,
    });
    expect(waitSentence()).toBeUndefined();
  });
});

describe("what the review's sources may reach for", () => {
  const files = [
    ...sourceFilesIn(join(SRC, "review")),
    ...sourceFilesIn(join(SRC, "app/d/[id]/review")),
  ].map((path) => ({ path, source: readFileSync(path, "utf8") }));

  it("names no design endpoint, no repository client and no write-access probe", () => {
    const offenders = files
      .filter(({ source }) =>
        /api\/designs|fetch-configuration-repository|useWriteAccessProbe|loadWithAccess|\bfetch\s*\(/.test(
          source,
        ),
      )
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
