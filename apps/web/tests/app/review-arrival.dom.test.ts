// @vitest-environment happy-dom
//
// Arriving at the review: what the page does with a store that may already hold the
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
import { isGreaterRevision } from "@/store/revision-order";

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

describe("a write the limit on saves holds", () => {
  const RESUMES_AT_MS = new Date(2026, 9, 10, 14, 5).getTime();

  it.each([
    ["ro", roMessages],
    ["ru", ruMessages],
  ] as const)(
    "says in %s the time it will be sent, and does not offer the request",
    (locale, messages) => {
      mountReview(KITCHEN_L_DESIGN, locale);

      act(() => {
        useConfiguratorStore.getState().setSaveStatus("error", RESUMES_AT_MS);
      });

      expect(waitSentence()).toBe(
        messages.panel.savePausedNotice.replace("{time}", "14:05"),
      );
      expect(cta().getAttribute("aria-disabled")).toBe("true");
    },
  );

  it("says the editor's failure again when the same status carries no time", () => {
    mountReview(KITCHEN_L_DESIGN);

    act(() => {
      useConfiguratorStore.getState().setSaveStatus("error");
    });

    expect(waitSentence()).toBe(roMessages.panel.saveFailedNotice);
  });
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

describe("a conflict is settled in the editor", () => {
  const edited = editedCopyOf(KITCHEN_L_DESIGN);

  beforeEach(() => {
    useConfiguratorStore.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: DESIGN_ID,
      revision: "4",
      canWrite: true,
    });
    useConfiguratorStore.setState({ design: edited, hasBeenEdited: true });
  });

  it.each(["ro", "ru"] as const)(
    "says in %s that the kitchen was changed elsewhere and the choice is made in the editor, not the editor's own sentence",
    (locale) => {
      const messages = locale === "ro" ? roMessages : ruMessages;
      mountReview(KITCHEN_L_DESIGN, locale);

      act(() => {
        useConfiguratorStore.getState().setSaveStatus("conflict");
      });

      expect(waitSentence()).toBe(messages.reviewScreen.conflict);
      expect(waitSentence()).not.toBe(messages.panel.saveConflictNotice);
      expect(container.textContent).not.toContain(
        messages.panel.saveConflictReloadLabel,
      );
      expect(cta().getAttribute("aria-disabled")).toBe("true");
    },
  );

  it("offers a link to the design's editor beside the sentence, and only then", () => {
    mountReview(KITCHEN_L_DESIGN);
    expect(
      container.querySelector('[data-testid="review-open-editor"]'),
    ).toBeNull();

    act(() => {
      useConfiguratorStore.getState().setSaveStatus("conflict");
    });

    const link = container.querySelector('[data-testid="review-open-editor"]');
    expect(link?.getAttribute("href")).toMatch(
      new RegExp(`^/ro/d/${DESIGN_ID}(\\?select=.+)?$`),
    );
    expect(link?.textContent).toBe(roMessages.reviewScreen.openEditor);
  });

  it("lands on the first body in display order, the one the first group's own edit link names", () => {
    mountReview(KITCHEN_L_DESIGN);
    const firstGroupEdit = container
      .querySelector('[data-testid="review-group-edit"]')
      ?.getAttribute("href");

    act(() => {
      useConfiguratorStore.getState().setSaveStatus("conflict");
    });

    const link = container.querySelector('[data-testid="review-open-editor"]');
    expect(firstGroupEdit).toMatch(/\?select=/);
    expect(link?.getAttribute("href")).toBe(firstGroupEdit);
  });

  it.each(["error", "stopped", "unauthorized"] as const)(
    "offers no editor link for %s, whose sentence names no control",
    (status) => {
      mountReview(KITCHEN_L_DESIGN);

      act(() => {
        useConfiguratorStore.getState().setSaveStatus(status);
      });

      expect(
        container.querySelector('[data-testid="review-open-editor"]'),
      ).toBeNull();
    },
  );
});

describe("the review shows the newest copy this tab can know", () => {
  const newerOnServer = editedCopyOf(KITCHEN_L_DESIGN);

  function holdCleanStoreAt(revision: string, design: Design): void {
    useConfiguratorStore.getState().hydrate({
      design,
      designId: DESIGN_ID,
      revision,
      canWrite: true,
    });
  }

  function mountPageAt(revision: string, design: Design): void {
    act(() => {
      root.render(
        createElement(NextIntlClientProvider, {
          locale: "ro",
          messages: roMessages,
          timeZone: "Europe/Chisinau",
          children: createElement(HydrateAndReview, {
            design,
            designId: DESIGN_ID,
            revision,
          }),
        }),
      );
    });
  }

  it("replaces a clean store that is older than the page with the page's copy", () => {
    holdCleanStoreAt("4", KITCHEN_L_DESIGN);

    mountPageAt("5", newerOnServer);

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: newerOnServer,
      savedDesign: newerOnServer,
      revision: "5",
    });
    expect(cta().tagName).toBe("A");
  });

  it("keeps a clean store that stands at the page's revision", () => {
    holdCleanStoreAt("5", KITCHEN_L_DESIGN);

    mountPageAt("5", newerOnServer);

    expect(useConfiguratorStore.getState().design).toBe(KITCHEN_L_DESIGN);
  });

  it("keeps a clean store newer than the page, as a page restored by Back or Forward may be older", () => {
    holdCleanStoreAt("7", KITCHEN_L_DESIGN);

    mountPageAt("5", newerOnServer);

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: KITCHEN_L_DESIGN,
      revision: "7",
    });
  });

  it("keeps a store that holds an unsaved edit, however much newer the page is", () => {
    holdCleanStoreAt("4", KITCHEN_L_DESIGN);
    const unsaved = editedCopyOf(KITCHEN_L_DESIGN);
    useConfiguratorStore.setState({ design: unsaved });

    mountPageAt("50", newerOnServer);

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: unsaved,
      savedDesign: KITCHEN_L_DESIGN,
      revision: "4",
    });
  });

  it("keeps a store whose edit is saved-in-flight: the edit is not clean until the save lands", () => {
    holdCleanStoreAt("4", KITCHEN_L_DESIGN);
    const inFlight = editedCopyOf(KITCHEN_L_DESIGN);
    useConfiguratorStore.setState({ design: inFlight });
    useConfiguratorStore.getState().setSaveStatus("saving");

    mountPageAt("5", newerOnServer);

    expect(useConfiguratorStore.getState().design).toBe(inFlight);
  });

  it("sends no request to learn which copy is newer", async () => {
    holdCleanStoreAt("4", KITCHEN_L_DESIGN);

    mountPageAt("5", newerOnServer);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(fetchCalls).not.toHaveBeenCalled();
  });
});

describe("revisions compare as whole numbers, never as a number", () => {
  it.each([
    ["10", "9", true],
    ["9", "10", false],
    ["5", "5", false],
    ["6", "5", true],
    ["9007199254740993", "9007199254740992", true],
    ["9007199254740992", "9007199254740993", false],
    ["9223372036854775807", "9223372036854775806", true],
    ["9223372036854775806", "9223372036854775807", false],
  ] as const)("%s against %s is greater: %s", (candidate, held, expected) => {
    expect(isGreaterRevision(candidate, held)).toBe(expected);
  });

  it("is never greater on the strength of a value that is not a revision", () => {
    for (const notARevision of [
      "",
      "0",
      "01",
      "1e3",
      " 7",
      "7\n",
      "-3",
      "abc",
    ]) {
      expect(isGreaterRevision(notARevision, "5")).toBe(false);
      expect(isGreaterRevision("5", notARevision)).toBe(false);
    }
  });

  it("is greater than a store that holds no revision", () => {
    expect(isGreaterRevision("1", null)).toBe(true);
  });
});

describe("whatever takes focus stays clear of the pinned region", () => {
  const observed: { callback: () => void; target: Element }[] = [];
  const REGION_HEIGHT_PX = { current: 244 };

  beforeEach(() => {
    observed.length = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly callback: () => void) {}
        observe(target: Element): void {
          observed.push({ callback: this.callback, target });
        }
        disconnect(): void {
          observed.length = 0;
        }
      },
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const height =
          this.getAttribute("data-testid") === "review-bottom"
            ? REGION_HEIGHT_PX.current
            : 0;
        return new DOMRect(0, 0, 390, height);
      },
    );
    useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function reserved(): string {
    return document.documentElement.style.scrollPaddingBottom;
  }

  it("reserves the region's height, and the safe gap, at the viewport's foot", () => {
    mountReview(KITCHEN_L_DESIGN);

    expect(reserved()).toBe("calc(244px + var(--safe-gap))");
    expect(
      observed.map(({ target }) => target.getAttribute("data-testid")),
    ).toEqual(["review-bottom"]);
  });

  it("follows the region as its sentences come and go", () => {
    mountReview(KITCHEN_L_DESIGN);

    REGION_HEIGHT_PX.current = 378;
    act(() => {
      observed[0]?.callback();
    });

    expect(reserved()).toBe("calc(378px + var(--safe-gap))");
    REGION_HEIGHT_PX.current = 244;
  });

  it("gives the viewport back when the screen goes away", () => {
    mountReview(KITCHEN_L_DESIGN);

    act(() => {
      root.unmount();
    });
    root = createRoot(container);

    expect(reserved()).toBe("");
  });
});

describe("a save under way is a wait, not an error", () => {
  const edited = editedCopyOf(KITCHEN_L_DESIGN);

  beforeEach(() => {
    useConfiguratorStore.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: DESIGN_ID,
      revision: "4",
      canWrite: true,
    });
    useConfiguratorStore.setState({ design: edited });
  });

  function classOfTheWaitSentence(): string {
    return (
      container
        .querySelector('[data-testid="review-save-wait"]')
        ?.getAttribute("class") ?? ""
    );
  }

  it("is drawn in the quiet card, not the refusal's red edge", () => {
    mountReview(KITCHEN_L_DESIGN);

    expect(classOfTheWaitSentence()).toContain("waiting");
    expect(classOfTheWaitSentence()).not.toContain("refusal");
  });

  it.each(["error", "stopped", "conflict", "unauthorized"] as const)(
    "is drawn as the failure it is once the save has come to %s",
    (status) => {
      mountReview(KITCHEN_L_DESIGN);

      act(() => {
        useConfiguratorStore.getState().setSaveStatus(status);
      });

      expect(classOfTheWaitSentence()).toContain("refusal");
    },
  );
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
