// @vitest-environment happy-dom
//
// **Adversarial QA for the hand-off out of 1F** — M7 wave 7F4b, criteria 39–43.
//
// `room-handoff.dom.test.ts` drives the wave's own criteria down their intended path. This file
// goes at the seams that path does not touch: the **second** way into a duplicate row, the token
// paths nobody bumped, the document a retry actually writes, and the failures that arrive after the
// customer has stopped looking — including one that arrives while a **newer** composition is on the
// glass, which is the only case in which the hand-off's own token guard is load-bearing.
//
// Criterion 44 is the journey and is an e2e's; nothing here stands in for it.
//
// **Nothing here opens a socket.** `fetch` is stubbed for the whole file and every request the
// screen can issue is answered in memory; a connection that is merely *refused* still counts as a
// request the test did not control, and that is the defect this milestone has shipped five times.
//
// The mocks are `room-handoff.dom.test.ts`'s, for its reasons: `next/navigation` one layer below
// the component's own import, the adapter over the real module so the lease bracket stays under
// test, and `generateKitchen` **wrapped** rather than replaced so every design written below is a
// genuinely composed one. Romanian is never spelled here.
import type {
  BodyProbe,
  Design,
  DesignId,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => browser.pathname,
  useSearchParams: () => new URLSearchParams(browser.search),
  useRouter: () => ({
    push: browser.push,
    replace: browser.replace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@lemnaria/three-adapter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/three-adapter")>();
  return {
    ...actual,
    makeKit: (options: { cabinetDepthMm?: number }) => ({
      cabinetDepthMm: options.cabinetDepthMm,
      builders: { "kitchen-l": () => ({}) },
    }),
    createBodyProbe: (kit: { cabinetDepthMm?: number }): BodyProbe =>
      createFakeBodyProbe({
        cabinetDepthMm: kit.cabinetDepthMm ?? DECLARED_CABINET_DEPTH_MM,
      }),
    disposeKit: () => undefined,
  };
});

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return { ...actual, generateKitchen: vi.fn(actual.generateKitchen) };
});

import { generateKitchen } from "@lemnaria/configurator-domain";

// The production formatter, so the expected figures are the locale's own notation rather than a
// separator spelled here — the same rule the catalogue reads under.
import { formatMetresForDisplay } from "@/room/metres-text";
import { RoomScreen } from "@/room/room-screen";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { createFakeBodyProbe } from "../support/fake-body-probe";

const ROOM_QUERY = "shape=L&wallA=4.2&wallB=3&height=2.5&direction=left";
/** A second room the domain also accepts, for the "the URL moved under the run" cases. */
const OTHER_ROOM_QUERY =
  "shape=L&wallA=5.4&wallB=3.6&height=2.7&direction=left";

const DECLARED_CABINET_DEPTH_MM = 600;
const DESIGNS_ENDPOINT = "/api/designs";

const MINTED_ID: DesignId = "design 1";
const MINTED_REVISION = "1";
const WRITTEN_REVISION = "2";
const EDITOR_HREF = `/ro/d/${encodeURIComponent(MINTED_ID)}`;

const RUN_TIMEOUT_MS = 3000;
const POLL_MS = 5;

let container: HTMLDivElement;
let root: Root;

// ── The stubbed server ──────────────────────────────────────────────────────────────────────────

interface ServerCall {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

/** One write's fate, when the file needs two in flight at once and they must end differently. */
interface ScriptedWrite {
  readonly status: number;
  readonly held: Deferred;
}

interface ServerScript {
  mintStatus: number;
  /** What the mint answers with. A **server-chosen** value, so a test may make it hostile. */
  mintedId: DesignId;
  writeStatus: number;
  heldWrite: Deferred | undefined;
  /** Keyed by the write's ordinal. A write with no entry falls back to `writeStatus`/`heldWrite`. */
  writesInOrder: Map<number, ScriptedWrite>;
}

let calls: ServerCall[];
let script: ServerScript;

function callsTo(method: string): readonly ServerCall[] {
  return calls.filter((call) => call.method === method);
}

function editorPushes(): readonly string[] {
  return browser.push.mock.calls
    .map((call) => String(call[0]))
    .filter((href) => href.includes("/d/"));
}

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as unknown as Response;
}

function installStubbedServer(): void {
  vi.stubGlobal(
    "fetch",
    (url: unknown, init?: RequestInit): Promise<Response> => {
      const method = init?.method ?? "GET";
      calls.push({ method, url: String(url), body: jsonBodyOf(init) });

      if (method === "POST") {
        return Promise.resolve(
          script.mintStatus === 201
            ? jsonResponse(201, {
                id: script.mintedId,
                revision: MINTED_REVISION,
              })
            : jsonResponse(script.mintStatus, {}),
        );
      }
      if (method === "PUT") {
        return answerTheWriteWhenReleased(callsTo("PUT").length - 1);
      }
      return Promise.resolve(jsonResponse(404, {}));
    },
  );
}

function jsonBodyOf(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") return undefined;
  return JSON.parse(body) as unknown;
}

async function answerTheWriteWhenReleased(ordinal: number): Promise<Response> {
  const scripted = script.writesInOrder.get(ordinal);
  await (scripted?.held ?? script.heldWrite)?.promise;
  const status = scripted?.status ?? script.writeStatus;
  if (status !== 200) return jsonResponse(status, {});
  return jsonResponse(200, { id: script.mintedId, revision: WRITTEN_REVISION });
}

function newDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = () => {
      promiseResolve();
    };
  });
  return { promise, resolve };
}

/** Scripts the nth write — its status and its own release — so two can be in flight at once and
 *  settle in an order the test chooses. */
function scriptWrite(ordinal: number, status: number): Deferred {
  const held = newDeferred();
  script.writesInOrder.set(ordinal, { status, held });
  return held;
}

function holdTheWrite(): Deferred {
  const held = newDeferred();
  script.heldWrite = held;
  return held;
}

/** Releases a held write and lets every continuation behind it run, so what follows is asserted
 *  after the hand-off has had its chance rather than before it. */
async function release(held: Deferred): Promise<void> {
  script.heldWrite = undefined;
  await act(async () => {
    held.resolve();
    await held.promise;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 4));
  });
}

/** Lets the pending microtasks and one timer turn over without waiting for any particular outcome.
 *  Used where the claim is that **nothing** happens, which no `waitUntil` can settle on. */
async function settleQuietly(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 8));
  });
}

// ── The screen ──────────────────────────────────────────────────────────────────────────────────

function render(): void {
  renderWrappedIn((screen) => screen);
}

function renderUnderStrictMode(): void {
  renderWrappedIn((screen) => createElement(StrictMode, null, screen));
}

function renderWrappedIn(wrap: (screen: ReactElement) => ReactElement): void {
  act(() => {
    root.render(
      wrap(
        createElement(NextIntlClientProvider, {
          children: createElement(RoomScreen),
          locale: "ro",
          messages: roMessages,
          timeZone: "Europe/Chisinau",
        }),
      ),
    );
  });
}

async function waitUntil(settled: () => boolean, what: string): Promise<void> {
  for (let waited = 0; waited < RUN_TIMEOUT_MS; waited += POLL_MS) {
    if (settled()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    });
  }
  throw new Error(`the hand-off never ${what}`);
}

function elementAt(testId: string): HTMLElement {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the screen draws no ${testId}`);
  }
  return element;
}

function maybeAt(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function handoffState(): string | null {
  return (
    maybeAt("room-compose-notice")?.getAttribute("data-compose-handoff") ?? null
  );
}

function settleFailedHandoff(): Promise<void> {
  return waitUntil(() => handoffState() === "failed", "reported its failure");
}

function settleNavigation(): Promise<void> {
  return waitUntil(() => editorPushes().length > 0, "navigated");
}

function settleWrite(): Promise<void> {
  return waitUntil(() => callsTo("PUT").length > 0, "issued its write");
}

function settleComposedRows(): Promise<void> {
  return waitUntil(() => handoffState() !== null, "composed");
}

function tapContinue(): void {
  act(() => {
    elementAt("room-continue").click();
  });
}

function tapComposeBack(): void {
  act(() => {
    elementAt("room-compose-back").click();
  });
}

function tapRetry(): void {
  act(() => {
    elementAt("room-compose-retry").click();
  });
}

function tapRetryTwiceInOneTick(): void {
  act(() => {
    const retry = elementAt("room-compose-retry");
    retry.click();
    retry.click();
  });
}

function pressBrowserBack(): void {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

/** The design the engine produced for a given run, taken off the wrapped implementation: a second
 *  `generateKitchen` call stamps its own `createdAt` and would differ in two fields. */
function theGeneratedDesign(runIndex = 0): Design {
  const outcome = vi.mocked(generateKitchen).mock.results[runIndex]?.value as
    | { ok: boolean; design?: Design }
    | undefined;
  if (outcome?.design === undefined) {
    throw new Error(`composition ${String(runIndex)} produced no design`);
  }
  return outcome.design;
}

beforeEach(() => {
  browser.search = ROOM_QUERY;
  browser.push.mockReset();
  browser.replace.mockReset();
  vi.mocked(generateKitchen).mockClear();
  calls = [];
  script = {
    mintStatus: 201,
    mintedId: MINTED_ID,
    writeStatus: 200,
    heldWrite: undefined,
    writesInOrder: new Map(),
  };
  installStubbedServer();
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

// ── 1. The duplicate row, from the angles the wave's own tests do not take ───────────────────────

describe("no tap sequence mints a second row (criterion 39)", () => {
  /**
   * **A second *Continuă* in the same tick is not asserted here, and the reason is the harness.**
   *
   * `use-generation.ts` reaches the adapter through `await import(…)`, and two of those issued in
   * one tick **race Vitest's module mock**: measured directly, two concurrent
   * `import("@lemnaria/three-adapter")` calls inside a file that mocks it hand back **different**
   * `makeKit` identities — one mocked, one real — and the real one bakes a texture and throws under
   * happy-dom (`three-guards.ts:65`). Warming the module first does not fix it. Any assertion
   * written over that tick would be measuring Vitest.
   *
   * It is not a gap in the product's cover, because the test below closes the question a level
   * earlier: React flushes a click synchronously, so by the time a second physical tap lands the
   * button is no longer in the document.
   */
  it("takes the primary control away with the first tap, so a second one reaches nothing", () => {
    render();

    tapContinue();

    // 1F replaces the form, and 1F's own primary control is the busy `<div>` and not a button.
    expect(maybeAt("room-continue")).toBe(null);
    expect(maybeAt("room-compose")).not.toBe(null);
  });

  it("mints nothing when the customer leaves before the composition settles", async () => {
    render();

    tapContinue();
    tapComposeBack();
    await settleQuietly();

    // The run is discarded by token in the transition that would have built the attempt, so no
    // design ever exists and nothing is minted for one. This is the earlier half of criterion 42 —
    // the wave's own tests hold the **write**, which is a run that got much further.
    expect(maybeAt("room-fields")).not.toBe(null);
    expect(calls).toEqual([]);
    expect(editorPushes()).toEqual([]);
  });

  it("mints nothing when a browser Back leaves before the composition settles", async () => {
    render();

    tapContinue();
    pressBrowserBack();
    await settleQuietly();

    expect(maybeAt("room-fields")).not.toBe(null);
    expect(calls).toEqual([]);
    expect(editorPushes()).toEqual([]);
  });

  it("mints nothing when the composition itself is refused", async () => {
    // **The engine's second refusal arm, over a log whose bodies were placed.** The real engine
    // runs first and its log is kept, so the refusal here is the shape `generate-kitchen.ts`
    // actually returns — a design that was discarded behind a log full of `placed` steps — rather
    // than an empty object the screen could never receive.
    const theRealEngine = vi.mocked(generateKitchen).getMockImplementation();
    if (theRealEngine === undefined) {
      throw new Error("the engine is replaced rather than wrapped");
    }
    vi.mocked(generateKitchen).mockImplementationOnce((input) => ({
      ok: false,
      reason: { code: "MINIMUM_NOT_MET", params: {} },
      log: theRealEngine(input).log,
    }));
    render();

    tapContinue();
    await waitUntil(
      () =>
        maybeAt("room-compose-notice")?.getAttribute("data-compose-phase") ===
        "failed",
      "reported the composition failure",
    );
    await settleQuietly();

    // No kitchen, so nothing to write: the hand-off must not reach the network at all, and the
    // failed state carries no retry control because the way out is *Înapoi*.
    expect(calls).toEqual([]);
    expect(editorPushes()).toEqual([]);
    expect(maybeAt("room-compose-retry")).toBe(null);
    expect(maybeAt("room-compose-rows")).toBe(null);
  });

  it.each([
    ["a path traversal", "../../admin"],
    ["a query and a fragment", "d?next=/admin#frag"],
    ["a percent sign and a space", "50% off design"],
  ])(
    "escapes the minted id into both the write's URL and the editor's path when it carries %s",
    async (_case, hostileId) => {
      script.mintedId = hostileId;
      render();

      tapContinue();
      await settleNavigation();

      const escaped = encodeURIComponent(hostileId);
      // The id is a value the **server** chose. A path segment built by concatenation is exactly
      // where that stops being safe, on both legs: the conditional `PUT` and the editor's route.
      expect(callsTo("PUT")[0]?.url).toBe(`${DESIGNS_ENDPOINT}/${escaped}`);
      expect(editorPushes()).toEqual([`/ro/d/${escaped}`]);
      // The id occupies exactly one path segment: no separator, no query and no fragment of its
      // own survives into the route, so `../../admin` cannot climb out of `/ro/d/`.
      expect(editorPushes()[0]?.slice("/ro/d/".length)).not.toMatch(/[/?#]/);
    },
  );

  it("pushes nothing further once the hand-off has already navigated", async () => {
    render();

    tapContinue();
    await settleNavigation();
    render();
    await settleQuietly();

    // Criterion 40's *"never twice"*: the attempt memoises its completed run, and nothing on the
    // screen can ask it again once the customer is on their way.
    expect(editorPushes()).toEqual([EDITOR_HREF]);
    expect(callsTo("PUT")).toHaveLength(1);
  });

  it("writes once when the retry is tapped twice before the screen can re-render", async () => {
    script.writeStatus = 500;
    render();

    tapContinue();
    await settleFailedHandoff();
    script.writeStatus = 200;
    tapRetryTwiceInOneTick();
    await settleNavigation();
    await settleQuietly();

    expect(callsTo("POST")).toHaveLength(1);
    expect(callsTo("PUT")).toHaveLength(2);
    expect(editorPushes()).toEqual([EDITOR_HREF]);
  });

  it("mints one row overall when the first mint was refused and the retry succeeds", async () => {
    script.mintStatus = 500;
    render();

    tapContinue();
    await settleFailedHandoff();
    script.mintStatus = 201;
    tapRetry();
    await settleNavigation();

    // Two `POST`s, because the first created nothing: a refused mint is discarded from the
    // repository's identity map precisely so the retry is not permanently poisoned. **One row
    // exists**, and the write went to it.
    expect(callsTo("POST")).toHaveLength(2);
    expect(callsTo("PUT")).toHaveLength(1);
    expect(editorPushes()).toEqual([EDITOR_HREF]);
  });

  it("mints once under StrictMode when the write failed and the customer retried", async () => {
    script.writeStatus = 500;
    renderUnderStrictMode();

    tapContinue();
    await settleFailedHandoff();
    script.writeStatus = 200;
    tapRetry();
    await settleNavigation();
    await settleQuietly();

    expect(callsTo("POST")).toHaveLength(1);
    expect(callsTo("PUT")).toHaveLength(2);
    expect(editorPushes()).toEqual([EDITOR_HREF]);
  });

  it("issues nothing further when the screen re-renders under a moved URL mid-write", async () => {
    const held = holdTheWrite();
    render();

    tapContinue();
    await settleWrite();
    browser.search = OTHER_ROOM_QUERY;
    render();
    render();
    await release(held);
    await settleQuietly();

    expect(callsTo("POST")).toHaveLength(1);
    expect(callsTo("PUT")).toHaveLength(1);
    expect(vi.mocked(generateKitchen)).toHaveBeenCalledTimes(1);
  });
});

// ── 2. The run token: the two paths the wave's own tests never bump ──────────────────────────────

describe("every way out of 1F disarms the hand-off (criterion 42)", () => {
  it("disarms the navigation when a browser Back leaves composition mid-write", async () => {
    const held = holdTheWrite();
    render();

    tapContinue();
    await settleWrite();
    pressBrowserBack();

    expect(maybeAt("room-fields")).not.toBe(null);

    await release(held);
    await settleQuietly();

    // The write was never cancelled — a half-written row is worse than a whole one — and the
    // customer stayed where the gesture put them.
    expect(callsTo("PUT")).toHaveLength(1);
    expect(editorPushes()).toEqual([]);
    expect(maybeAt("room-compose")).toBe(null);
  });

  it("disarms the navigation when the URL stops naming a shape mid-write", async () => {
    const held = holdTheWrite();
    render();

    tapContinue();
    await settleWrite();
    browser.search = "";
    render();

    expect(maybeAt("room-compose")).toBe(null);

    await release(held);
    await settleQuietly();

    expect(callsTo("PUT")).toHaveLength(1);
    expect(editorPushes()).toEqual([]);
  });

  it("does not resurrect 1F when the write fails after the customer has gone back", async () => {
    const held = holdTheWrite();
    script.writeStatus = 500;
    render();

    tapContinue();
    await settleWrite();
    tapComposeBack();
    await release(held);
    await settleQuietly();

    // A failure that arrives for a run nobody is watching must change nothing: no notice, no
    // retry control, and above all no 1F pushed back over the form the customer is now using.
    expect(maybeAt("room-compose")).toBe(null);
    expect(maybeAt("room-compose-retry")).toBe(null);
    expect(maybeAt("room-fields")).not.toBe(null);
    expect(editorPushes()).toEqual([]);
  });

  it("does not fail a second composition when the first one's write rejects late", async () => {
    // The sharpest version of criterion 42: the abandoned run does not merely have nowhere to
    // report to — a **newer** run is on the screen, and a failure marked without checking the token
    // would land on that one. The customer would read *the kitchen could not be opened* over a
    // write that is still perfectly in flight, and be offered a retry that re-runs it.
    const abandonedWrite = scriptWrite(0, 500);
    const currentWrite = scriptWrite(1, 200);
    render();

    tapContinue();
    await settleWrite();
    tapComposeBack();
    tapContinue();
    await waitUntil(
      () => callsTo("PUT").length > 1,
      "issued the second composition's write",
    );

    abandonedWrite.resolve();
    await settleQuietly();

    expect(handoffState()).toBe("saving");
    expect(maybeAt("room-compose-retry")).toBe(null);
    expect(elementAt("room-compose-notice").textContent).not.toContain(
      roMessages.room.compose.saveFailed,
    );

    currentWrite.resolve();
    await settleNavigation();

    expect(editorPushes()).toEqual([EDITOR_HREF]);
  });

  it("does not crash when the write fails after the screen has unmounted", async () => {
    const held = holdTheWrite();
    script.writeStatus = 500;
    render();

    tapContinue();
    await settleWrite();
    act(() => {
      root.unmount();
    });
    await release(held);
    await settleQuietly();

    expect(editorPushes()).toEqual([]);
    expect(callsTo("PUT")).toHaveLength(1);
    root = createRoot(container);
  });
});

// ── 3. The document that is written is the document that was composed (criterion 43) ─────────────

describe("the written document is the composed one (criterion 43)", () => {
  it("writes the design composed for the typed room even after the URL moved to another room", async () => {
    const held = holdTheWrite();
    render();

    tapContinue();
    await settleWrite();
    // The address bar moves to a different — and also valid — room while the write is in flight.
    browser.search = OTHER_ROOM_QUERY;
    render();
    await release(held);
    await settleQuietly();

    expect(callsTo("PUT")[0]?.body).toEqual(theGeneratedDesign());
  });

  it("re-writes byte-for-byte the same document when the retry runs", async () => {
    script.writeStatus = 500;
    render();

    tapContinue();
    await settleFailedHandoff();
    script.writeStatus = 200;
    tapRetry();
    await settleNavigation();

    const [first, second] = callsTo("PUT");
    // The retry re-runs **the composition's own attempt**, which closes over one design. A retry
    // that re-derived its document — from the draft, from the URL, from a fresh `generateKitchen` —
    // would differ here in at least `createdAt`, and the row would stop being the kitchen drawn.
    expect(second?.body).toEqual(first?.body);
    expect(second?.body).toEqual(theGeneratedDesign());
    expect(second?.url).toBe(first?.url);
  });

  it("keeps the frame's room summary on the composed room, not the room the URL moved to", async () => {
    const held = holdTheWrite();
    render();

    tapContinue();
    await settleComposedRows();
    browser.search = OTHER_ROOM_QUERY;
    render();

    // The run **carries** its room rather than reading it back, so the line above the list keeps
    // describing the kitchen being written. The two rooms share no wall length, so a summary that
    // tracked the address bar would swap every figure in the sentence.
    const summary = elementAt("room-compose-summary").textContent;
    expect(summary).toContain(formatMetresForDisplay(4200, "ro"));
    expect(summary).toContain(formatMetresForDisplay(3000, "ro"));
    expect(summary).not.toContain(formatMetresForDisplay(5400, "ro"));
    expect(summary).not.toContain(formatMetresForDisplay(3600, "ro"));

    await release(held);
  });
});

// ── 4. The failure path, at the two points the wave's own tests stop short of ────────────────────

describe("a hand-off that cannot finish leaves a way forward (criterion 41)", () => {
  it("offers a retry when the navigation itself throws, and writes nothing a second time", async () => {
    browser.push.mockImplementation((href: unknown) => {
      if (String(href).includes("/d/")) throw new Error("the router is gone");
    });
    render();

    tapContinue();
    await settleFailedHandoff();

    // The row was minted and the document **did** land; only the last step failed.
    expect(callsTo("POST")).toHaveLength(1);
    expect(callsTo("PUT")).toHaveLength(1);
    expect(elementAt("room-compose-retry").textContent).toBe(
      roMessages.room.compose.retry,
    );

    const pushesBeforeTheRetry = editorPushes().length;
    browser.push.mockImplementation(() => undefined);
    tapRetry();
    await waitUntil(
      () => editorPushes().length > pushesBeforeTheRetry,
      "navigated on the retry",
    );
    await settleQuietly();

    // The attempt cached its completed write, so the recovery is a navigation and not a second
    // `PUT` of a document the database already holds. Two push **attempts** — the one that threw
    // and the one that worked — both aimed at the same design.
    expect(callsTo("POST")).toHaveLength(1);
    expect(callsTo("PUT")).toHaveLength(1);
    expect(editorPushes()).toEqual([EDITOR_HREF, EDITOR_HREF]);
  });

  it("keeps 1F busy and leaves the Back control working when the write never settles", async () => {
    holdTheWrite();
    render();

    tapContinue();
    await settleWrite();
    await settleQuietly();

    // Nothing has resolved, so the honest screen is the busy one — not a failure, and not a retry
    // control over a write that may still land.
    expect(handoffState()).toBe("saving");
    expect(maybeAt("room-compose-cta")).not.toBe(null);
    expect(maybeAt("room-compose-retry")).toBe(null);
    expect(editorPushes()).toEqual([]);

    tapComposeBack();
    expect(maybeAt("room-fields")).not.toBe(null);
  });

  it("shows the composed rows under the save-failed sentence, with no busy control left", async () => {
    script.writeStatus = 500;
    render();

    tapContinue();
    await settleFailedHandoff();

    expect(elementAt("room-compose-notice").textContent).toContain(
      roMessages.room.compose.saveFailed,
    );
    // The composition succeeded, so the rule paragraph and the five rows are still true.
    expect(container.querySelectorAll("[data-compose-status]")).toHaveLength(5);
    expect(elementAt("room-compose-notice").textContent).not.toContain(
      roMessages.room.compose.failed,
    );
    expect(maybeAt("room-compose-cta")).toBe(null);
  });
});

// ── 5. Re-entering composition after leaving it ──────────────────────────────────────────────────

describe("a second deliberate selection is a second design", () => {
  it("mints a second row when the customer goes back and composes again", async () => {
    render();

    tapContinue();
    await settleNavigation();
    tapComposeBack();
    tapContinue();
    await waitUntil(
      () => callsTo("POST").length > 1,
      "minted the second composition",
    );
    await settleQuietly();

    // Documented behaviour, asserted so a change to it is deliberate: the attempt is a field of
    // **this** run's state, so a new run carries a new mint identity. Two compositions, two rows.
    expect(callsTo("POST")).toHaveLength(2);
    expect(callsTo("PUT")).toHaveLength(2);
    expect(vi.mocked(generateKitchen)).toHaveBeenCalledTimes(2);
    expect(callsTo("PUT")[1]?.body).toEqual(theGeneratedDesign(1));
  });

  it("offers no retry control once the customer has left a failed hand-off", async () => {
    script.writeStatus = 500;
    render();

    tapContinue();
    await settleFailedHandoff();
    tapComposeBack();

    expect(maybeAt("room-compose-retry")).toBe(null);
    expect(maybeAt("room-fields")).not.toBe(null);
  });
});

// ── 6. The wave's new copy ───────────────────────────────────────────────────────────────────────

describe("the hand-off's two sentences exist in both catalogues", () => {
  it("carries saveFailed and retry in Romanian and in Russian, key-identical and non-empty", () => {
    expect(Object.keys(ruMessages.room.compose).sort()).toEqual(
      Object.keys(roMessages.room.compose).sort(),
    );
    for (const catalogue of [roMessages, ruMessages]) {
      expect(catalogue.room.compose.saveFailed.trim()).not.toBe("");
      expect(catalogue.room.compose.retry.trim()).not.toBe("");
    }
  });

  it("says something different from the composition failure, which sends the customer elsewhere", () => {
    // `failed` has no kitchen behind it and points back to the dimensions; `saveFailed` has the
    // whole kitchen drawn above it and offers a retry. One sentence for both would be a lie in
    // whichever state it was not written for.
    expect(roMessages.room.compose.saveFailed).not.toBe(
      roMessages.room.compose.failed,
    );
    expect(ruMessages.room.compose.saveFailed).not.toBe(
      ruMessages.room.compose.failed,
    );
    expect(ruMessages.room.compose.saveFailed).not.toBe(
      roMessages.room.compose.saveFailed,
    );
  });
});
