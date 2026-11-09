// @vitest-environment happy-dom
//
// M10 wave Q4, adversarial pass (frames C5A / C5AD; ADR 0062 Amendment 5 point 3; Q4-a). The implementer's
// `sent-kitchen-note.dom.test.ts` pins the happy path, the share view, the unsent answer, a pending answer and one
// remount. This file adds what it does not: every refusal and malformed answer of the `GET`, both arms of the wire with
// the stale-page and replacement cases that suppress C1, the note beside C1 (both directions of independence), the
// per-view rule against a second live screen and a re-render, the zero writes of a close (no request, no storage),
// the approved copy against the ADR's own words and the Russian leaf, and the control's keyboard and accessibility shape.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/scene/kitchen-canvas", () => ({ default: () => null }));
vi.mock("@/panel/editor-panel", () => ({ EditorPanel: () => null }));
vi.mock("@/price/price-breakdown", () => ({ PriceBreakdown: () => null }));
vi.mock("@/settings/global-settings", () => ({ GlobalSettings: () => null }));
vi.mock("@/app/configurator/configure/selection-debug", () => ({
  SelectionDebug: () => null,
}));
vi.mock("@/panel/use-panel-view", () => ({
  usePanelView: () => ({ kind: "closed" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/d/abcdefghijklmnopqrstu",
}));

import {
  ConfigureScreen,
  type ConfigureScreenVariant,
} from "@/app/configurator/configure/configure-screen";
import { PriceBookProvider } from "@/price/price-book-provider";
import { SentKitchenNote } from "@/price/sent-kitchen-note";
import { useCameraPreset } from "@/scene/camera-preset-store";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const DESIGN_ID = "abcdefghijklmnopqrstu";
const NOTE = '[data-testid="sent-kitchen-note"]';
const CLOSE = '[data-testid="sent-kitchen-note-close"]';
const BANNER = '[data-testid="price-notice"]';
const ACKNOWLEDGE = '[data-testid="price-notice-acknowledge"]';
const PRICE_BAR = '[data-testid="price-bar"]';
const PAGE_PAIR = {
  versionId: SAMPLE_PRICE_ROOT.versionId,
  availabilityRevision: SAMPLE_PRICE_ROOT.availability.revision,
};
const STALE_PAIR = {
  versionId: PAGE_PAIR.versionId,
  availabilityRevision: String(Number(PAGE_PAIR.availabilityRevision) + 1),
};

// The words the owner approved, copied from ADR 0062 Amendment 5 point 3 and not read back from the catalogue.
/* eslint-disable no-restricted-syntax -- a claim about the wording: the catalogue leaf must equal the ADR's sentence. */
const APPROVED_RO_SENTENCE =
  "Ai trimis deja această bucătărie. Modificările se văd și la noi, dar spune-ne la telefon dacă e ceva important.";
/* eslint-enable no-restricted-syntax */

interface RecordedRequest {
  readonly method: string;
  readonly address: string;
}

type NoticeAnswer =
  | { readonly status: number; readonly body?: unknown }
  | "network-failure"
  | "never";

let mounted: { root: Root; container: HTMLDivElement }[];
let requests: RecordedRequest[];

function serve(notice: NoticeAnswer): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((address: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ method, address });
      if (method !== "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({ acknowledged: PAGE_PAIR }), {
            status: 200,
          }),
        );
      }
      if (notice === "never") return new Promise<Response>(() => undefined);
      if (notice === "network-failure") {
        return Promise.reject(new TypeError("offline"));
      }
      return Promise.resolve(
        new Response(
          typeof notice.body === "string"
            ? notice.body
            : JSON.stringify(notice.body ?? {}),
          { status: notice.status },
        ),
      );
    }),
  );
}

function activeAnswer(overrides: Record<string, unknown> = {}): NoticeAnswer {
  return {
    status: 200,
    body: {
      kind: "active-version",
      isSent: true,
      current: PAGE_PAIR,
      pricesChanged: false,
      replacementsRequired: [],
      removedAccessories: [],
      ...overrides,
    },
  };
}

function noActiveVersionAnswer(isSent: boolean): NoticeAnswer {
  return { status: 200, body: { kind: "no-active-version", isSent } };
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

function editorElement(
  variant: ConfigureScreenVariant,
  locale: "ro" | "ru",
  priceBook: typeof SAMPLE_PRICE_ROOT,
): ReactElement {
  return createElement(PriceBookProvider, {
    root: priceBook,
    children: createElement(NextIntlClientProvider, {
      children: createElement(ConfigureScreen, { variant }),
      locale,
      messages: (locale === "ro"
        ? roMessages
        : ruMessages) as typeof roMessages,
      timeZone: "Europe/Chisinau",
    }),
  });
}

function render(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  mounted.push({ root, container });
  return container;
}

async function mountEditor(
  options: {
    variant?: ConfigureScreenVariant;
    locale?: "ro" | "ru";
    priceBook?: typeof SAMPLE_PRICE_ROOT;
    strict?: boolean;
  } = {},
): Promise<HTMLDivElement> {
  const element = editorElement(
    options.variant ?? "owner",
    options.locale ?? "ro",
    options.priceBook ?? SAMPLE_PRICE_ROOT,
  );
  const container = render(
    options.strict === true
      ? createElement(StrictMode, null, element)
      : element,
  );
  await settle();
  return container;
}

function unmountAll(): void {
  for (const { root, container } of mounted) {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
  mounted = [];
}

function noteIn(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(NOTE);
}

function closeIn(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(CLOSE);
  if (button === null) throw new Error("the note draws no close control");
  return button;
}

function requireElement(element: Element | null): HTMLElement {
  if (element === null) throw new Error("the element is not in the document");
  return element as HTMLElement;
}

function press(element: Element | null): void {
  if (element === null) throw new Error("nothing to press");
  act(() => {
    (element as HTMLElement).click();
  });
}

function methods(): string[] {
  return requests.map(({ method }) => method);
}

/** The editor's session check is not the note's business; only the price notice's own address is counted. */
function noticeMethods(): string[] {
  return requests
    .filter(({ address }) => address.includes("/price-notice"))
    .map(({ method }) => method);
}

beforeEach(() => {
  mounted = [];
  requests = [];
  useCameraPreset.setState({ presetId: "overview" });
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
    revision: "1",
    canWrite: true,
  });
});

afterEach(() => {
  unmountAll();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useCameraPreset.setState({ presetId: "overview" });
});

describe("an answer that is not a sent kitchen draws no note and leaves the price bar", () => {
  it.each([404, 429, 500, 503])("a %i from the route", async (status) => {
    serve({ status, body: { status: "whatever", isSent: true } });

    const editor = await mountEditor();

    expect(noteIn(editor)).toBeNull();
    expect(editor.querySelector(PRICE_BAR)).not.toBeNull();
    expect(noticeMethods()).toEqual(["GET"]);
  });

  it("a network failure", async () => {
    serve("network-failure");

    const editor = await mountEditor();

    expect(noteIn(editor)).toBeNull();
    expect(editor.querySelector(PRICE_BAR)).not.toBeNull();
  });

  it.each([
    ["isSent as the string true", { isSent: "true" }],
    ["isSent as the number 1", { isSent: 1 }],
    ["isSent as null", { isSent: null }],
    ["a 200 body with isSent absent", { isSent: undefined }],
    ["an unknown kind", { kind: "something-else" }],
  ])("a 200 whose body is %s", async (_label, overrides) => {
    const wire = activeAnswer(overrides);
    serve(wire);

    const editor = await mountEditor();

    expect(noteIn(editor)).toBeNull();
  });

  it("a 200 whose body is not JSON", async () => {
    serve({ status: 200, body: "<html>sent</html>" });

    const editor = await mountEditor();

    expect(noteIn(editor)).toBeNull();
  });

  it("a refusal that carries isSent: true in its body is not an answer", async () => {
    serve({ status: 429, body: activeBody() });

    const editor = await mountEditor();

    expect(noteIn(editor)).toBeNull();
  });
});

function activeBody(): unknown {
  const wire = activeAnswer();
  return typeof wire === "object" ? wire.body : undefined;
}

describe("the note reads isSent from either arm of the answer, and from a page the banner ignores", () => {
  it("isSent false on the active arm draws nothing even with C1 content", async () => {
    serve(activeAnswer({ isSent: false, pricesChanged: true }));

    const editor = await mountEditor();

    expect(noteIn(editor)).toBeNull();
    expect(editor.querySelector(BANNER)).not.toBeNull();
  });

  it("isSent false on the no-active-version arm draws nothing", async () => {
    serve(noActiveVersionAnswer(false));

    const editor = await mountEditor();

    expect(noteIn(editor)).toBeNull();
  });

  // Ambiguity (reported): Q4's hand-off says "`isSent`, on both arms", so a sent kitchen answered with the
  // no-active-version arm shows the note. Pinned as the wire contract reads; if the architect rules otherwise this flips.
  it("isSent true on the no-active-version arm draws the note", async () => {
    serve(noActiveVersionAnswer(true));

    const editor = await mountEditor();

    expect(noteIn(editor)).not.toBeNull();
    expect(editor.querySelector(BANNER)).toBeNull();
  });

  it("a stale page (the answer's pair is not the pair displayed) suppresses C1 and still shows the note", async () => {
    serve(activeAnswer({ current: STALE_PAIR, pricesChanged: true }));

    const editor = await mountEditor();

    expect(editor.querySelector(BANNER)).toBeNull();
    expect(noteIn(editor)).not.toBeNull();
  });

  it("a replacement still required suppresses C1 and still shows the note", async () => {
    serve(
      activeAnswer({
        pricesChanged: true,
        replacementsRequired: [
          { item: { kind: "material", tierId: "gone" }, remaining: [] },
        ],
      }),
    );

    const editor = await mountEditor();

    expect(editor.querySelector(BANNER)).toBeNull();
    expect(noteIn(editor)).not.toBeNull();
  });
});

describe("where the note must not ask, it is not drawn", () => {
  it("the share view draws no note and sends nothing, whatever the store says", async () => {
    serve(activeAnswer());

    const editor = await mountEditor({ variant: "shared" });

    expect(noteIn(editor)).toBeNull();
    expect(requests).toEqual([]);
  });

  it("the share view of a store that holds a real design id and write access still sends nothing", async () => {
    useConfiguratorStore.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: DESIGN_ID,
      revision: "1",
      canWrite: true,
    });
    serve(noActiveVersionAnswer(true));

    const editor = await mountEditor({ variant: "shared" });

    expect(noteIn(editor)).toBeNull();
    expect(requests).toEqual([]);
  });

  it("a screen that cannot write (read-only access) never asked, so draws no note", async () => {
    useConfiguratorStore.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: DESIGN_ID,
      revision: "1",
      canWrite: false,
    });
    serve(activeAnswer());

    const editor = await mountEditor();

    expect(noteIn(editor)).toBeNull();
    expect(requests).toEqual([]);
  });
});

describe("closing the note is this view's own and writes nothing", () => {
  it("sends no request, writes no storage and sets no cookie", async () => {
    serve(activeAnswer());
    const editor = await mountEditor();
    const local = vi.spyOn(Storage.prototype, "setItem");
    const cookieBefore = document.cookie;
    const requestsBefore = requests.length;

    press(closeIn(editor));
    await settle();

    expect(noteIn(editor)).toBeNull();
    expect(requests).toHaveLength(requestsBefore);
    expect(local).not.toHaveBeenCalled();
    expect(document.cookie).toBe(cookieBefore);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("is not remembered across mounts, even after a second close", async () => {
    serve(activeAnswer());
    for (let view = 0; view < 3; view += 1) {
      const editor = await mountEditor();
      expect(noteIn(editor)).not.toBeNull();
      press(closeIn(editor));
      expect(noteIn(editor)).toBeNull();
      unmountAll();
    }
  });

  it("closes only the screen it was pressed in when two screens are live", async () => {
    serve(activeAnswer());
    const first = await mountEditor();
    const second = await mountEditor();
    expect(noteIn(first)).not.toBeNull();
    expect(noteIn(second)).not.toBeNull();

    press(closeIn(first));

    expect(noteIn(first)).toBeNull();
    expect(noteIn(second)).not.toBeNull();
  });

  it("stays closed through a re-render of the same screen", async () => {
    serve(activeAnswer());
    const editor = await mountEditor();
    press(closeIn(editor));

    act(() => {
      useCameraPreset.setState({ presetId: "wallA" });
    });
    act(() => {
      useConfiguratorStore.getState().hydrate({
        design: KITCHEN_L_DESIGN,
        designId: DESIGN_ID,
        revision: "2",
        canWrite: true,
      });
    });
    await settle();

    expect(noteIn(editor)).toBeNull();
  });

  it("stays closed when isSent drops and returns within the same view", () => {
    const view = mountDirect(true);
    press(closeIn(view.container));

    view.rerender(false);
    view.rerender(true);

    expect(noteIn(view.container)).toBeNull();
  });

  it("is drawn again by a locale switch, which remounts the screen, in the new language", async () => {
    serve(activeAnswer());
    const romanian = await mountEditor({ locale: "ro" });
    press(closeIn(romanian));
    unmountAll();

    const russian = await mountEditor({ locale: "ru" });

    expect(noteIn(russian)?.textContent).toContain(
      ruMessages.sentKitchenNote.body,
    );
    expect(closeIn(russian).getAttribute("aria-label")).toBe(
      ruMessages.sentKitchenNote.close,
    );
  });
});

describe("the note and C1 are independent and can stand together", () => {
  it("shows both at once, the banner first and the note after it in the same stack, with the price bar kept", async () => {
    serve(activeAnswer({ pricesChanged: true }));

    const editor = await mountEditor();
    const banner = editor.querySelector(BANNER);
    const note = noteIn(editor);

    expect(banner).not.toBeNull();
    expect(note).not.toBeNull();
    expect(banner?.closest(".sceneFooter, [class*='sceneFooter']")).toBe(
      note?.closest(".sceneFooter, [class*='sceneFooter']"),
    );
    expect(
      requireElement(banner).compareDocumentPosition(requireElement(note)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(editor.querySelector(PRICE_BAR)).not.toBeNull();
  });

  it("closing the note leaves C1 and the price bar, and C1 can still be acknowledged afterwards", async () => {
    serve(activeAnswer({ pricesChanged: true }));
    const editor = await mountEditor();

    press(closeIn(editor));
    await settle();

    expect(noteIn(editor)).toBeNull();
    expect(editor.querySelector(BANNER)).not.toBeNull();
    expect(editor.querySelector(PRICE_BAR)).not.toBeNull();
    expect(methods()).toEqual(["GET"]);

    press(editor.querySelector(ACKNOWLEDGE));
    await settle();

    expect(methods()).toEqual(["GET", "POST"]);
    expect(editor.querySelector(BANNER)).toBeNull();
  });

  it("acknowledging C1 does not hide the note, and the note's own close afterwards sends nothing more", async () => {
    serve(activeAnswer({ pricesChanged: true }));
    const editor = await mountEditor();

    press(editor.querySelector(ACKNOWLEDGE));
    await settle();

    expect(editor.querySelector(BANNER)).toBeNull();
    expect(noteIn(editor)).not.toBeNull();
    expect(methods()).toEqual(["GET", "POST"]);

    press(closeIn(editor));
    await settle();

    expect(noteIn(editor)).toBeNull();
    expect(methods()).toEqual(["GET", "POST"]);
  });

  it("a failed acknowledgement (the route refuses) keeps C1 and does not touch the note", async () => {
    serve(activeAnswer({ pricesChanged: true }));
    const baseFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((address: string, init?: RequestInit) =>
        init?.method === "POST"
          ? Promise.reject(new TypeError("offline"))
          : baseFetch(address, init),
      ),
    );
    const editor = await mountEditor();

    press(editor.querySelector(ACKNOWLEDGE));
    await settle();

    expect(editor.querySelector(BANNER)).not.toBeNull();
    expect(noteIn(editor)).not.toBeNull();
  });
});

describe("the note never blocks editing or the price", () => {
  it("is not a dialog: it takes no focus, marks nothing inert or hidden, and leaves the scene controls pressable", async () => {
    serve(activeAnswer());

    const editor = await mountEditor();
    const note = requireElement(noteIn(editor));

    expect(note.contains(document.activeElement)).toBe(false);
    expect(note.getAttribute("aria-modal")).toBeNull();
    expect(note.getAttribute("role")).toBe("note");
    expect(editor.querySelector("[inert]")).toBeNull();
    expect(
      editor.querySelector('[aria-hidden="true"] [data-testid="price-bar"]'),
    ).toBeNull();
    expect(note.closest("[aria-hidden='true']")).toBeNull();
    const chip = [...editor.querySelectorAll("button")].find(
      (button) =>
        button.textContent === roMessages.configure.cameraPresets.wallA,
    );
    press(chip ?? null);
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
    expect(noteIn(editor)).not.toBeNull();
  });

  it("the price bar stays in the document whether the note is up or closed", async () => {
    serve(activeAnswer());
    const editor = await mountEditor();
    const barUp = editor.querySelector(PRICE_BAR);

    press(closeIn(editor));

    expect(barUp).not.toBeNull();
    expect(editor.querySelector(PRICE_BAR)).toBe(barUp);
  });

  it("the stylesheet gives the card pointer events itself and takes no fixed or absolute box over the scene", () => {
    const css = readFileSync(
      resolve(
        import.meta.dirname,
        "../../src/price/sent-kitchen-note.module.css",
      ),
      "utf8",
    );
    const noteRule = /\.note\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

    expect(noteRule).toMatch(/pointer-events:\s*auto/);
    expect(noteRule).not.toMatch(/position:\s*(fixed|absolute)/);
    expect(css).not.toMatch(/\.(glyph|body)\s*\{[^}]*pointer-events:\s*auto/);
  });

  it("the stack that holds the note ignores pointers, so only the card's own box takes them", () => {
    const css = readFileSync(
      resolve(
        import.meta.dirname,
        "../../src/app/configurator/configure/configure.module.css",
      ),
      "utf8",
    );
    const footerRule = /\.sceneFooter\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

    expect(footerRule).toMatch(/pointer-events:\s*none/);
  });
});

describe("the words and the control", () => {
  it("the Romanian leaf is the approved sentence from the ADR, character for character", () => {
    expect(roMessages.sentKitchenNote.body).toBe(APPROVED_RO_SENTENCE);
    // eslint-disable-next-line no-restricted-syntax -- a claim about the wording: the approved name of the close control.
    expect(roMessages.sentKitchenNote.close).toBe("Închide nota");
  });

  it("draws exactly the approved sentence as the note's only sentence, with no markup or placeholders", async () => {
    serve(activeAnswer());

    const editor = await mountEditor();
    const body = requireElement(noteIn(editor)).querySelector("p");

    expect(body?.textContent).toBe(APPROVED_RO_SENTENCE);
    expect(body?.innerHTML).toBe(APPROVED_RO_SENTENCE);
    expect(APPROVED_RO_SENTENCE).not.toMatch(/[{}<>]/);
  });

  it("both languages carry a non-empty body and close name, and the two differ", () => {
    for (const leaf of ["body", "close"] as const) {
      expect(roMessages.sentKitchenNote[leaf].trim()).not.toBe("");
      expect(ruMessages.sentKitchenNote[leaf].trim()).not.toBe("");
      expect(ruMessages.sentKitchenNote[leaf]).not.toBe(
        roMessages.sentKitchenNote[leaf],
      );
    }
    expect(Object.keys(ruMessages.sentKitchenNote).sort()).toEqual(
      Object.keys(roMessages.sentKitchenNote).sort(),
    );
  });

  it("the close control is a native, enabled, named button whose mark and the card's glyph are hidden from readers", async () => {
    serve(activeAnswer());
    const editor = await mountEditor();
    const button = closeIn(editor);

    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.disabled).toBe(false);
    expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    expect(button.getAttribute("aria-label")).toBe(
      roMessages.sentKitchenNote.close,
    );
    expect(button.querySelector("[aria-hidden='true']")?.textContent).toBe("×");
    expect(
      requireElement(noteIn(editor)).querySelectorAll("[aria-hidden='true']")
        .length,
    ).toBe(2);
  });

  it("the card's tab stops are the close button alone, after C1's own button", async () => {
    serve(activeAnswer({ pricesChanged: true }));
    const editor = await mountEditor();

    const stopsInNote = requireElement(noteIn(editor)).querySelectorAll(
      "button, a, input, select, textarea, [tabindex]",
    );
    const ackAndClose = [
      ...editor.querySelectorAll(`${ACKNOWLEDGE}, ${CLOSE}`),
    ];

    expect(stopsInNote).toHaveLength(1);
    expect(
      ackAndClose.map((element) => element.getAttribute("data-testid")),
    ).toEqual(["price-notice-acknowledge", "sent-kitchen-note-close"]);
  });

  it("the close button takes focus and is the active element when focused", async () => {
    serve(activeAnswer());
    const editor = await mountEditor();
    const button = closeIn(editor);

    act(() => {
      button.focus();
    });

    expect(document.activeElement).toBe(button);
  });
});

describe("the one reader of the answer", () => {
  it("sends one GET under strict mode's double effect and draws one note", async () => {
    serve(activeAnswer());

    const editor = await mountEditor({ strict: true });

    expect(methods()).toEqual(["GET"]);
    expect(editor.querySelectorAll(NOTE)).toHaveLength(1);
  });

  it("the note on its own, mounted with isSent true, sends no request at all", () => {
    serve(activeAnswer());

    mountDirect(true);

    expect(requests).toEqual([]);
  });

  it("the note draws nothing for isSent false and nothing is a request either", () => {
    serve(activeAnswer());

    const view = mountDirect(false);

    expect(noteIn(view.container)).toBeNull();
    expect(requests).toEqual([]);
  });
});

function mountDirect(isSent: boolean): {
  container: HTMLDivElement;
  rerender: (next: boolean) => void;
} {
  const wrap = (value: boolean): ReactElement =>
    createElement(NextIntlClientProvider, {
      children: createElement(SentKitchenNote, { isSent: value }),
      locale: "ro",
      messages: roMessages,
      timeZone: "Europe/Chisinau",
    });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(wrap(isSent));
  });
  mounted.push({ root, container });
  return {
    container,
    rerender: (next) => {
      act(() => {
        root.render(wrap(next));
      });
    },
  };
}
