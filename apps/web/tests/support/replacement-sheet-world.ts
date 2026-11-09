// The editor as the replacement sheet's adversarial suites mount it: the real `ConfigureScreen` over a `fetch` that records every
// request, answers the notice's `GET` from a script, and holds every design save open until the test decides how it ends.
// The scene, the panel and the camera are stubbed by each test file (a `vi.mock` is hoisted per file and cannot live here).
//
// Kept apart from `q3d-replacement-sheet.dom.test.ts`'s private helpers on purpose: that file's world answers a save only with
// a revision, and the cases here need a save that is refused, a notice that fails, and a server that remembers a marker.
import { tierRef, type Design } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";

import {
  ConfigureScreen,
  type ConfigureScreenVariant,
} from "@/app/configurator/configure/configure-screen";
import { PriceBookProvider } from "@/price/price-book-provider";
import type { PriceBookRoot } from "@/price/price-book-root";
import { useCameraPreset } from "@/scene/camera-preset-store";
import {
  useConfiguratorStore,
  type WriteAccess,
} from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import { SAMPLE_PRICE_ROOT } from "./sample-price-root";

export const SWITCHED_OFF_MATERIAL = "material.painted-mdf";
export const SWITCHED_OFF_HARDWARE = "hardware.premium";
export const VANISHED_MATERIAL = "material.created-and-since-deleted";
export const OFF_PAIR = {
  versionId: SAMPLE_PRICE_ROOT.versionId,
  availabilityRevision: "1",
};

export const ROOT_WITH_MDF_OFF: PriceBookRoot = {
  ...SAMPLE_PRICE_ROOT,
  availability: {
    revision: "1",
    disabled: [tierRef("material", SWITCHED_OFF_MATERIAL)],
  },
};
export const ROOT_WITH_MDF_AND_PREMIUM_OFF: PriceBookRoot = {
  ...SAMPLE_PRICE_ROOT,
  availability: {
    revision: "1",
    disabled: [
      tierRef("material", SWITCHED_OFF_MATERIAL),
      tierRef("hardware", SWITCHED_OFF_HARDWARE),
    ],
  },
};
/** The same pair as the switched-off roots with nothing switched off: availability that came back, or never went. */
export const ROOT_NOTHING_OFF_AT_PAIR: PriceBookRoot = {
  ...SAMPLE_PRICE_ROOT,
  availability: { revision: "1", disabled: [] },
};

export interface SentRequest {
  readonly method: string;
  readonly address: string;
  readonly body: unknown;
}

/** What the notice's `GET` answers: the route's body, a status with no body, or a network that is down. */
export type NoticeAnswer = Record<string, unknown> | number | "network-down";
export type NoticeScript =
  | readonly NoticeAnswer[]
  | ((
      nth: number,
      requests: readonly SentRequest[],
    ) => NoticeAnswer | Promise<NoticeAnswer>);

export interface World {
  readonly requests: SentRequest[];
  /** Answers the oldest held save `200` at this revision. */
  readonly landSave: (revision: string) => Promise<void>;
  /** Answers the oldest held save with this status and no usable body (a conflict, a limit, a fault). */
  readonly refuseSave: (status: number) => Promise<void>;
  /** Fails the oldest held save the way a dropped connection does. */
  readonly dropSave: () => Promise<void>;
  /** How many saves are waiting to be answered. */
  readonly savesWaiting: () => number;
  readonly landEverySave: () => Promise<void>;
}

export interface Editor {
  readonly container: HTMLDivElement;
}

let designsMade = 0;
let clockMs = Date.now();
let isEveryTimerDriven = false;
let editorRoot: Root | undefined;
let editorContainer: HTMLDivElement | undefined;
let serving: World | undefined;
let designId = "";

/** The id this test's kitchen is saved under. */
export function currentDesignId(): string {
  return designId;
}

/** A design id of its own per test: the store's save queue is a module singleton, and a hydrate for an id with an unsaved
 *  write queued adopts that write, which would carry one test's choice into the next. */
export function beginTest(): void {
  clockMs += 10_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clockMs);
  designsMade += 1;
  designId = `q3dqadesign${String(designsMade).padStart(10, "0")}`;
  useCameraPreset.setState({ presetId: "overview" });
}

export async function endTest(): Promise<void> {
  if (editorRoot !== undefined) {
    const mounted = editorRoot;
    act(() => {
      mounted.unmount();
    });
  }
  editorRoot = undefined;
  await serving?.landEverySave();
  isEveryTimerDriven = false;
  editorContainer?.remove();
  editorContainer = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  // A test that drove the clock forward leaves the save queue believing the last save was that late: the next test must
  // start after it, or its first save waits out the difference on a timer nobody advances.
  clockMs = Math.max(clockMs, Date.now());
  vi.useRealTimers();
  useCameraPreset.setState({ presetId: "overview" });
}

export function driveEveryTimerFromTheTest(): void {
  vi.useRealTimers();
  vi.useFakeTimers();
  vi.setSystemTime(clockMs);
  isEveryTimerDriven = true;
}

export async function advanceClock(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

export async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) {
      if (isEveryTimerDriven) await vi.advanceTimersByTimeAsync(0);
      else await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

export function notice(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: "active-version",
    isSent: false,
    current: OFF_PAIR,
    pricesChanged: false,
    replacementsRequired: [],
    removedAccessories: [],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function answerNotice(
  script: NoticeScript,
  nth: number,
  requests: readonly SentRequest[],
): Promise<Response> {
  const answer = await (typeof script === "function"
    ? script(nth, requests)
    : (script[Math.min(nth, script.length - 1)] ?? notice()));
  if (answer === "network-down") throw new TypeError("down");
  if (typeof answer === "number") return new Response("{}", { status: answer });
  return jsonResponse(answer);
}

/**
 * Installs the fake `fetch`. Every `PUT` waits for the test. A `POST` is acknowledged at the pair it carried, unless
 * `postStatus` says otherwise. A `GET` is answered from `notices`, the last answer repeated.
 */
export function serveWorld({
  notices,
  postStatus = 200,
}: {
  readonly notices: NoticeScript;
  readonly postStatus?: number;
}): World {
  const requests: SentRequest[] = [];
  const heldSaves: {
    resolve: (answer: Response) => void;
    reject: (error: Error) => void;
  }[] = [];
  let noticesGiven = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((address: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" ? safeParse(init.body) : undefined;
      requests.push({ method, address, body });
      if (method === "PUT") {
        return new Promise<Response>((resolve, reject) => {
          heldSaves.push({ resolve, reject });
        });
      }
      if (method === "POST") {
        return Promise.resolve(
          postStatus === 200
            ? jsonResponse({ acknowledged: body })
            : new Response("{}", { status: postStatus }),
        );
      }
      // Only the notice's own read takes an answer from the script: the account control reads the session on its first
      // mount in a file, and that read must not use up the answer that was written for the kitchen.
      if (!address.endsWith("/price-notice")) {
        return Promise.resolve(new Response("{}", { status: 404 }));
      }
      const nth = noticesGiven;
      noticesGiven += 1;
      return answerNotice(notices, nth, requests);
    }),
  );
  const oldestSave = () => {
    const hold = heldSaves.shift();
    if (hold === undefined) {
      throw new Error("no save is waiting to be answered");
    }
    return hold;
  };
  const answerOldest = (answer: Response): void => {
    oldestSave().resolve(answer);
  };
  serving = {
    requests,
    landSave: async (revision) => {
      answerOldest(jsonResponse({ id: designId, revision }));
      await settle();
    },
    refuseSave: async (status) => {
      answerOldest(new Response("{}", { status }));
      await settle();
    },
    dropSave: async () => {
      oldestSave().reject(new TypeError("the connection dropped"));
      await settle();
    },
    savesWaiting: () => heldSaves.length,
    landEverySave: async () => {
      for (const hold of heldSaves.splice(0)) {
        hold.resolve(jsonResponse({ id: designId, revision: "99" }));
      }
      await Promise.resolve();
    },
  };
  return serving;
}

function editorTree(root: PriceBookRoot, variant: ConfigureScreenVariant) {
  return createElement(PriceBookProvider, {
    root,
    children: createElement(NextIntlClientProvider, {
      children: createElement(ConfigureScreen, { variant }),
      locale: "ro",
      messages: roMessages,
      timeZone: "Europe/Chisinau",
    }),
  });
}

export async function mountEditor({
  variant = "owner",
  priceRoot = ROOT_WITH_MDF_OFF,
}: {
  readonly variant?: ConfigureScreenVariant;
  readonly priceRoot?: PriceBookRoot;
} = {}): Promise<Editor> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  editorRoot = root;
  editorContainer = container;
  act(() => {
    root.render(editorTree(priceRoot, variant));
  });
  await settle();
  return { container };
}

/** The same mounted editor, handed another root: the page's availability changing under it, with no remount. */
export async function rerenderUnder(
  priceRoot: PriceBookRoot,
  variant: ConfigureScreenVariant = "owner",
): Promise<void> {
  const root = editorRoot;
  if (root === undefined) throw new Error("no editor is mounted");
  act(() => {
    root.render(editorTree(priceRoot, variant));
  });
  await settle();
}

/** Takes the editor down and mounts it again, as opening the kitchen a second time does. */
export async function reopenEditor(
  priceRoot: PriceBookRoot,
  variant: ConfigureScreenVariant = "owner",
): Promise<Editor> {
  const mounted = editorRoot;
  if (mounted !== undefined) {
    act(() => {
      mounted.unmount();
    });
  }
  editorContainer?.remove();
  editorRoot = undefined;
  return mountEditor({ priceRoot, variant });
}

export function hydrate(
  design: Design,
  canWrite: WriteAccess = true,
  id: string | null = designId,
): void {
  // The share view hydrates under a sentinel and a new design has no id: the shapes a real id never takes are put there after
  // the hydrate, the way those screens come by them.
  useConfiguratorStore.getState().hydrate({
    design,
    designId,
    revision: "1",
    canWrite,
  });
  useConfiguratorStore.setState({ designId: id });
}

export function byTestId(editor: Editor, testId: string): HTMLElement | null {
  return editor.container.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
}

export function required(editor: Editor, testId: string): HTMLElement {
  const found = byTestId(editor, testId);
  if (found === null) throw new Error(`nothing is drawn as ${testId}`);
  return found;
}

export function requiredButton(
  editor: Editor,
  testId: string,
): HTMLButtonElement {
  const found = required(editor, testId);
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`${testId} is drawn, but not as a button`);
  }
  return found;
}

/** A value a test needs to be there, said by what it is when it is not. */
export function present<Value>(
  value: Value | null | undefined,
  what: string,
): Value {
  if (value === null || value === undefined) {
    throw new Error(`${what} is not there`);
  }
  return value;
}

export function press(element: HTMLElement | null | undefined): void {
  const control = present(element, "the control to press");
  act(() => {
    control.click();
  });
}

/** Opens the chooser of the first row still owed, picks the option with this name and applies it. */
export async function chooseTier(editor: Editor, name: string): Promise<void> {
  const owed = editor.container.querySelector<HTMLElement>(
    '[data-testid="replacement-row"][data-resolved="false"] [data-testid="replacement-choose"]',
  );
  if (owed === null) throw new Error("no row is owed a choice");
  press(owed);
  const option = [
    ...editor.container.querySelectorAll<HTMLButtonElement>("[data-option]"),
  ].find((candidate) => candidate.textContent.includes(name));
  if (option === undefined) throw new Error(`the chooser offers no ${name}`);
  press(option);
  press(required(editor, "replacement-apply"));
  await settle();
}

export function requestsOf(world: World, method: string): SentRequest[] {
  return world.requests.filter(
    (request) =>
      request.method === method &&
      (method !== "GET" || request.address.endsWith("/price-notice")),
  );
}

/** Lets a refused save recover so the page-wide save queue is clean for the next test: the retry is let through and
 *  lands. A conflict is first answered the way the customer answers it. */
export async function recoverTheSaveQueue(world: World): Promise<void> {
  act(() => {
    useConfiguratorStore.getState().overwriteConflict();
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await advanceClock(120_000);
    if (world.savesWaiting() > 0) await world.landSave(String(10 + attempt));
  }
}

const ACCOUNT_SESSION_ADDRESS = "/api/account/session";

/** Every request except the account control's own session read, which the screen makes whoever is looking. */
export function requestsAboutTheKitchen(world: World): SentRequest[] {
  return world.requests.filter(
    (request) => request.address !== ACCOUNT_SESSION_ADDRESS,
  );
}
