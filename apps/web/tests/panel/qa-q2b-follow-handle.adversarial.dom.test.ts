// @vitest-environment happy-dom
//
// Adversarial QA for the handle control's "Ca restul bucătăriei" row, on the mounted panel over the real store: what the
// row names for every kitchen handle setting in both locales, that it keeps focus through a press, that a read-only
// browser cannot press it, that its pressed state survives a save and a resume, and that its copy carries no figure.
import {
  HandleSchema,
  KITCHEN_L_DESIGN,
  type Design,
  type Handle,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Content } from "@/i18n/content";

const shown = vi.hoisted(() => ({ locale: "ro" as "ro" | "ru" }));

vi.mock("@/i18n/use-content", async () => {
  const { contentFor } = await import("../support/catalogues");
  const { default: roMessages } = await import("../../src/messages/ro.json");
  const { default: ruMessages } = await import("../../src/messages/ru.json");
  return {
    useContent: (): Content =>
      shown.locale === "ro"
        ? contentFor("ro", roMessages)
        : contentFor("ru", ruMessages as typeof roMessages),
  };
});

import { EditorPanel } from "@/panel/editor-panel";
import { usePanelView } from "@/panel/use-panel-view";
import { useConfiguratorStore } from "@/store/configurator-store";

import { contentFor, CATALOGUES, requireLeafAt } from "../support/catalogues";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const BASE_CABINET_ID = "p0";
const TOP_ROW_CABINET_ID = "p15";
const DEFAULT_BASE_HANDLE: Handle = "steel";
const DEFAULT_TOP_ROW_HANDLE: Handle = "push";
const HANDLES: readonly Handle[] = HandleSchema.options;
const UNSET = undefined;
const FOLLOW_ROW = "handle-follow-kitchen";
const FOLLOW_LEAF = "panel.handleFollowsKitchen";

let openings = 0;
let container: HTMLDivElement;
let root: Root;

function PanelAsTheScreenMountsIt() {
  return createElement(EditorPanel, { view: usePanelView() });
}

function kitchenWith(
  settings: Partial<
    Pick<Design["settings"] & object, "handle" | "topRowHandle">
  >,
): Design {
  const kitchen = { ...KITCHEN_L_DESIGN.settings };
  delete kitchen.handle;
  delete kitchen.topRowHandle;
  return { ...KITCHEN_L_DESIGN, settings: { ...kitchen, ...settings } };
}

function openThePanelOn(
  design: Design,
  selectedId: string,
  options: { canWrite?: boolean; designId?: string } = {},
): void {
  openings += 1;
  act(() => {
    useConfiguratorStore.getState().hydrate({
      design,
      designId: options.designId ?? `qa-q2b-follow-${String(openings)}`,
      revision: "1",
      canWrite: options.canWrite ?? true,
    });
    useConfiguratorStore.getState().attachBodyProbe(createFakeProbeFactory());
    useConfiguratorStore
      .getState()
      .select({ kind: "placement", id: selectedId });
    root.render(createElement(PanelAsTheScreenMountsIt));
  });
}

function elementAt(testId: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  if (element === null) throw new Error(`the panel draws no ${testId}`);
  return element;
}

function press(testId: string): void {
  act(() => {
    elementAt(testId).click();
  });
}

function ownHandleOf(placementId: string): Handle | undefined {
  return useConfiguratorStore
    .getState()
    .design.placements.find((placement) => placement.id === placementId)?.body
    .handle;
}

beforeEach(() => {
  shown.locale = "ro";
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
});

const KITCHEN_SETTINGS = [UNSET, ...HANDLES].flatMap((handle) =>
  [UNSET, ...HANDLES].map((topRowHandle) => ({
    ...(handle === UNSET ? {} : { handle }),
    ...(topRowHandle === UNSET ? {} : { topRowHandle }),
  })),
);

describe.each(["ro", "ru"] as const)("in %s", (locale) => {
  const [, messages] = CATALOGUES.find(([name]) => name === locale) ?? [];
  if (messages === undefined) throw new Error(`no catalogue for ${locale}`);
  const words = contentFor(locale, messages);

  it.each(KITCHEN_SETTINGS)(
    "names the handle the kitchen gives the cabinet, below the top row and on it, under kitchen %j",
    (settings) => {
      shown.locale = locale;
      const expectedBelow = settings.handle ?? DEFAULT_BASE_HANDLE;
      const expectedOnTop = settings.topRowHandle ?? DEFAULT_TOP_ROW_HANDLE;

      openThePanelOn(kitchenWith(settings), BASE_CABINET_ID);
      const below = elementAt(FOLLOW_ROW).textContent;
      openThePanelOn(kitchenWith(settings), TOP_ROW_CABINET_ID);
      const onTop = elementAt(FOLLOW_ROW).textContent;

      expect(below).toContain(words.panel.handleFollowsKitchen);
      expect(below).toContain(words.panel.handleLabels[expectedBelow]);
      expect(onTop).toContain(words.panel.handleFollowsKitchen);
      expect(onTop).toContain(words.panel.handleLabels[expectedOnTop]);
    },
  );

  it.each(HANDLES)(
    "still names the kitchen's handle, not its own %s, while the cabinet wears one of its own",
    (own) => {
      shown.locale = locale;
      const kitchenHandle = HANDLES.find((handle) => handle !== own);
      if (kitchenHandle === undefined) throw new Error("fixture: one handle");
      openThePanelOn(kitchenWith({ handle: kitchenHandle }), BASE_CABINET_ID);

      press(`handle-${own}`);

      const row = elementAt(FOLLOW_ROW);
      expect(ownHandleOf(BASE_CABINET_ID)).toBe(own);
      expect(row.getAttribute("aria-pressed")).toBe("false");
      expect(row.textContent).toContain(
        words.panel.handleLabels[kitchenHandle],
      );
      expect(elementAt(`handle-${own}`).getAttribute("aria-pressed")).toBe(
        "true",
      );
    },
  );

  it("carries no digit in the row, whichever handle it names", () => {
    shown.locale = locale;
    for (const handle of HANDLES) {
      openThePanelOn(kitchenWith({ handle }), BASE_CABINET_ID);

      expect(elementAt(FOLLOW_ROW).textContent).not.toMatch(/\d/);
    }
  });
});

describe("the copy", () => {
  it("is written in both locales, differently, with no digit and no Latin letter in the Russian", () => {
    const [ro, ru] = CATALOGUES.map(([, messages]) =>
      requireLeafAt(messages, FOLLOW_LEAF),
    );

    expect(ro).toMatch(/^\S.*\S$/);
    expect(ru).toMatch(/^\S.*\S$/);
    expect(ro).not.toBe(ru);
    expect(ro).not.toMatch(/\d/);
    expect(ru).not.toMatch(/\d/);
    expect(ru).not.toMatch(/[A-Za-z]/);
  });
});

describe("the row as a control", () => {
  it("is a real button in the tab order, after every chip and before the note, with a pressed state that is never absent", () => {
    openThePanelOn(kitchenWith({}), BASE_CABINET_ID);
    const row = elementAt(FOLLOW_ROW);
    const chips = HANDLES.map((handle) => elementAt(`handle-${handle}`));
    const note = container.querySelector('[data-testid="section-handle"] > p');

    expect(row.tagName).toBe("BUTTON");
    expect(row.getAttribute("type")).toBe("button");
    expect(row.tabIndex).toBeGreaterThanOrEqual(0);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    for (const chip of chips) {
      expect(
        chip.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(note).not.toBeNull();
    expect(
      row.compareDocumentPosition(note as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the same element, and focus on it, through a press that changes the document", () => {
    openThePanelOn(kitchenWith({}), BASE_CABINET_ID);
    press("handle-black");
    const row = elementAt(FOLLOW_ROW);
    act(() => {
      row.focus();
    });
    expect(document.activeElement).toBe(row);

    press(FOLLOW_ROW);

    expect(ownHandleOf(BASE_CABINET_ID)).toBeUndefined();
    expect(elementAt(FOLLOW_ROW)).toBe(row);
    expect(document.activeElement).toBe(row);
    expect(row.getAttribute("aria-pressed")).toBe("true");
  });

  it("answers a second press as a quiet no-op: still pressed, nothing refused, nothing written", () => {
    openThePanelOn(kitchenWith({}), BASE_CABINET_ID);
    const before = useConfiguratorStore.getState().design;

    press(FOLLOW_ROW);
    press(FOLLOW_ROW);

    expect(elementAt(FOLLOW_ROW).getAttribute("aria-pressed")).toBe("true");
    expect(useConfiguratorStore.getState().lastRejection).toBeNull();
    expect(useConfiguratorStore.getState().design.placements).toEqual(
      before.placements,
    );
    expect(useConfiguratorStore.getState().hasBeenEdited).toBe(false);
  });

  it("cannot be pressed in a browser that may not write: a handle of its own stays when the row is pressed", () => {
    const wearing = kitchenWith({});
    openThePanelOn(
      {
        ...wearing,
        placements: wearing.placements.map((placement) =>
          placement.id === BASE_CABINET_ID
            ? { ...placement, body: { ...placement.body, handle: "black" } }
            : placement,
        ),
      },
      BASE_CABINET_ID,
      { canWrite: false },
    );
    const row = elementAt(FOLLOW_ROW) as HTMLButtonElement;
    const chip = elementAt("handle-black") as HTMLButtonElement;

    expect(row.disabled).toBe(true);
    expect(chip.disabled).toBe(true);
    press(FOLLOW_ROW);
    expect(useConfiguratorStore.getState().lastRejection).toBeNull();
    expect(ownHandleOf(BASE_CABINET_ID)).toBe("black");
    expect(row.getAttribute("aria-pressed")).toBe("false");
  });

  it("is disabled with the chips' reason, and the reason is readable without reaching the button", () => {
    openThePanelOn(kitchenWith({}), BASE_CABINET_ID, { canWrite: false });
    const chipText = elementAt("handle-black").textContent;
    const rowText = elementAt(FOLLOW_ROW).textContent;
    const reasonOfTheChip = chipText
      .replace(contentFor("ro", CATALOGUES[0][1]).panel.handleLabels.black, "")
      .trim();

    expect(reasonOfTheChip).not.toBe("");
    expect(rowText).toContain(reasonOfTheChip);
  });
});

describe("saved and resumed", () => {
  it("shows the row pressed on a document that was cleared, saved and loaded again", () => {
    openThePanelOn(kitchenWith({ handle: "black" }), BASE_CABINET_ID);
    press("handle-push");
    press(FOLLOW_ROW);
    const saved = JSON.parse(
      JSON.stringify(useConfiguratorStore.getState().design),
    ) as Design;

    openThePanelOn(saved, BASE_CABINET_ID);

    const row = elementAt(FOLLOW_ROW);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(row.textContent).toContain(
      contentFor("ro", CATALOGUES[0][1]).panel.handleLabels.black,
    );
    expect(ownHandleOf(BASE_CABINET_ID)).toBeUndefined();
  });

  it("keeps a cleared cabinet cleared when the same design is loaded again over a stale copy that still has the handle", () => {
    const stale = kitchenWith({ handle: "steel" });
    const withOwn: Design = {
      ...stale,
      placements: stale.placements.map((placement) =>
        placement.id === BASE_CABINET_ID
          ? { ...placement, body: { ...placement.body, handle: "black" } }
          : placement,
      ),
    };
    const designId = "qa-q2b-follow-takeback";
    openThePanelOn(withOwn, BASE_CABINET_ID, { designId });
    expect(ownHandleOf(BASE_CABINET_ID)).toBe("black");

    press(FOLLOW_ROW);
    expect(ownHandleOf(BASE_CABINET_ID)).toBeUndefined();
    openThePanelOn(withOwn, BASE_CABINET_ID, { designId });

    expect(ownHandleOf(BASE_CABINET_ID)).toBeUndefined();
    expect(elementAt(FOLLOW_ROW).getAttribute("aria-pressed")).toBe("true");
  });
});
