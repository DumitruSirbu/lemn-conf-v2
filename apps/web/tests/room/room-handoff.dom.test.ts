// @vitest-environment happy-dom
//
// **The hand-off out of 1F, driven through the real screen** — M7 wave 7F4b, criteria 39, 40, 41,
// 42 and 43.
//
// **Why this file exists at all, in the words of the record that asked for it.** Wave 7E2's
// close-out says a factory-level test *"cannot substitute"* for this one, and wave 7F4 was split in
// two precisely so that it would be written. The failure this wave risks is **a second design row
// per composition**, and every existing test stays green over it: `createDesignCreationAttempt`
// holds one mint identity for its whole lifetime, so an attempt built in a click handler, in a
// render or in a `useMemo` over the design mints a row **per call** — and each of those mints is a
// *different* attempt, which means 7E2's one-row-per-attempt guarantee is satisfied by every one of
// them. Only a count of `POST /api/designs` taken through the rendered screen tells the two apart.
//
// **So `fetch` is stubbed and the repository is real.** `sessionConfigurationRepository` — the
// module singleton the application uses — does the minting and the writing here, including the
// `WeakMap` keyed on the provisional mint identity that makes a retry after a failed `PUT` reuse the
// row rather than create a second one. Replacing the repository would move the guarantee out of the
// test and back into a stub's opinion of it.
//
// Three further mocks, each for `room-composition.dom.test.ts`'s reason: `next/navigation` one layer
// below the component's own import, so a spy holds the localized URL a browser would be sent to;
// `@lemnaria/three-adapter` over the real module, so the lease bracket stays the code under test;
// and `generateKitchen` wrapped rather than replaced, so every design written below is a genuinely
// composed one.
//
// Romanian is never spelled here: every expected sentence is read out of the imported catalogue.
import type {
  BodyProbe,
  Design,
  DesignId,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The address bar, the live query and the router. Two different pushes reach this spy — the
 *  departure's, which carries the room's own query, and the hand-off's — and `editorPushes` is what
 *  keeps the assertions below about the second. */
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

// **`createFakeBodyProbe` is reached through a static import at the bottom of this file, never from
// inside the factory** — `tests/support/fake-body-probe.ts` imports the adapter itself, so an
// `await import(…)` here would ask this mock factory to finish before it can finish.
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

import {
  forgetEditorOrigin,
  readEditorOrigin,
} from "@/app/configurator/configure/back-guard";
import { sessionConfigurationRepository } from "@/persistence/fetch-configuration-repository";
import { RoomScreen } from "@/room/room-screen";

import roMessages from "../../src/messages/ro.json";
import { createFakeBodyProbe } from "../support/fake-body-probe";

/** A room the domain accepts, in the query's own wire form. Every field is answered, so the screen
 *  is at 1D and *Continuă* composes rather than only departing. */
const ROOM_QUERY = "shape=L&wallA=4.2&wallB=3&height=2.5&direction=left";

/** The room that query describes, to the millimetre — criterion 43's *"the room the customer typed"*. */
const THE_TYPED_ROOM = {
  shape: "L",
  widthMm: 4200,
  depthMm: 3000,
  heightMm: 2500,
} as const;

const DECLARED_CABINET_DEPTH_MM = 600;

const DESIGNS_ENDPOINT = "/api/designs";

/** What the stubbed mint answers with. **The id carries a character a path has to escape**, because
 *  the editor's route is built from it by concatenation and that is exactly where an id stops being
 *  escaped: a server chooses this value, and nothing here may assume it is already URL-safe. */
const MINTED_ID: DesignId = "design 1";
const MINTED_REVISION = "1";
const WRITTEN_REVISION = "2";

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

/** How the stub answers. A test sets what it needs and leaves the rest; `heldWrite` is how a write
 *  is kept genuinely in flight while *"nothing has navigated yet"* is asserted. */
interface ServerScript {
  mintStatus: number;
  writeStatus: number;
  throwsOnWrite: boolean;
  heldWrite: Deferred | undefined;
}

let calls: ServerCall[];
let script: ServerScript;
/** The last document written to each address, so a `GET` answers with what was actually stored
 *  rather than with a fixture — which is what makes criterion 43's read-back a round trip. */
let stored: Map<string, unknown>;

function callsTo(method: string): readonly ServerCall[] {
  return calls.filter((call) => call.method === method);
}

/** The hand-off's navigations, told apart from the departure's by their destination. Both reach the
 *  same spy: `departTo("presets")` pushes the room's own query on every tap of *Continuă*. */
function editorPushes(): readonly string[] {
  return browser.push.mock.calls
    .map((call) => String(call[0]))
    .filter((href) => href.includes("/d/"));
}

/**
 * A response as the repository reads one: `ok`, `status` and `json()`, and nothing else.
 *
 * A literal rather than a `Response`, because those three members are the whole of the contract
 * `fetch-configuration-repository.ts` uses, and a `happy-dom` `Response` would add a body stream
 * this file would then be asserting the behaviour of.
 */
function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as unknown as Response;
}

/**
 * The application's own endpoints, answered in memory.
 *
 * **The write throws where the script says to, synchronously.** `fetch` rejecting and `fetch`
 * throwing are different shapes and the second is the one a caller can get wrong; the factory-level
 * half of criterion 41's third case — a repository whose `save` throws before it returns a promise —
 * is `create-design.adversarial.test.ts`'s, and what is asserted here is that a throw anywhere under
 * the write leaves the customer in 1F with a way forward.
 */
function installStubbedServer(): void {
  vi.stubGlobal(
    "fetch",
    (url: unknown, init?: RequestInit): Promise<Response> => {
      const method = init?.method ?? "GET";
      const address = String(url);
      const body = jsonBodyOf(init);
      calls.push({ method, url: address, body });

      if (method === "POST") return Promise.resolve(answerTheMint());
      if (method === "PUT") {
        if (script.throwsOnWrite) throw new Error("the network is gone");
        return answerTheWriteWhenReleased(address, body);
      }
      return Promise.resolve(answerTheRead(address));
    },
  );
}

/** The document a request carried, parsed back out of the string the repository serialised. Narrowed
 *  to `string` first: `BodyInit` covers streams and blobs, and stringifying one of those would give
 *  `[object Object]` and a body nothing could compare. */
function jsonBodyOf(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") return undefined;
  return JSON.parse(body) as unknown;
}

function answerTheMint(): Response {
  if (script.mintStatus !== 201) return jsonResponse(script.mintStatus, {});
  return jsonResponse(201, { id: MINTED_ID, revision: MINTED_REVISION });
}

async function answerTheWriteWhenReleased(
  address: string,
  body: unknown,
): Promise<Response> {
  await script.heldWrite?.promise;
  if (script.writeStatus !== 200) return jsonResponse(script.writeStatus, {});
  stored.set(address, body);
  return jsonResponse(200, { id: MINTED_ID, revision: WRITTEN_REVISION });
}

function answerTheRead(address: string): Response {
  const document = stored.get(address);
  if (document === undefined) return jsonResponse(404, {});
  return jsonResponse(200, {
    id: MINTED_ID,
    design: document,
    revision: WRITTEN_REVISION,
    canWrite: true,
  });
}

function holdTheWrite(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = () => {
      promiseResolve();
    };
  });
  const held = { promise, resolve };
  script.heldWrite = held;
  return held;
}

/** Releases a held write and lets its continuations run, so what follows is asserted after the
 *  hand-off has had every chance to navigate rather than before. */
async function release(held: Deferred): Promise<void> {
  await act(async () => {
    held.resolve();
    await held.promise;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  });
}

// ── The screen ──────────────────────────────────────────────────────────────────────────────────

function render(): void {
  renderWrappedIn((screen) => screen);
}

/** The configuration the application ships (`next.config.ts:9`). A hand-off started from a **mount**
 *  effect would write twice here and once everywhere else in this file. */
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

/** Real timers throughout: the run crosses a `requestAnimationFrame` before it blocks, and a fake
 *  timer would let it skip the very frame the composition depends on. */
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

async function settleFailedHandoff(): Promise<void> {
  await waitUntil(() => handoffState() === "failed", "reported its failure");
}

async function settleNavigation(): Promise<void> {
  await waitUntil(() => editorPushes().length > 0, "navigated");
}

async function settleWrite(): Promise<void> {
  await waitUntil(() => callsTo("PUT").length > 0, "issued its write");
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

/** The design the engine produced for this run, taken off the wrapped implementation rather than
 *  regenerated: a second `generateKitchen` call stamps its own `createdAt`, so a re-run would differ
 *  from the written document in two fields and would prove nothing about either. */
function theGeneratedDesign(): Design {
  const outcome = vi.mocked(generateKitchen).mock.results[0]?.value as
    | { ok: boolean; design?: Design }
    | undefined;
  if (outcome?.design === undefined) {
    throw new Error("no composition produced a design");
  }
  return outcome.design;
}

beforeEach(() => {
  browser.search = ROOM_QUERY;
  forgetEditorOrigin();
  browser.push.mockClear();
  browser.replace.mockClear();
  vi.mocked(generateKitchen).mockClear();
  calls = [];
  stored = new Map();
  script = {
    mintStatus: 201,
    writeStatus: 200,
    throwsOnWrite: false,
    heldWrite: undefined,
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

describe("one composition is one design row (criterion 39)", () => {
  it("issues exactly one POST for a complete run, and none for a re-render", async () => {
    render();

    tapContinue();
    await settleNavigation();
    render();
    render();

    expect(callsTo("POST")).toHaveLength(1);
    expect(callsTo("POST")[0]?.url).toBe(DESIGNS_ENDPOINT);
    // The mint takes no request body: the row is created from the seeded fixture and the customer's
    // own design travels in the `PUT` that follows (ADR 0019's 2026-08-31 correction).
    expect(callsTo("POST")[0]?.body).toBeUndefined();
    expect(callsTo("PUT")).toHaveLength(1);
  });

  it("issues exactly one POST under StrictMode too", async () => {
    renderUnderStrictMode();

    tapContinue();
    await settleNavigation();

    expect(callsTo("POST")).toHaveLength(1);
    expect(callsTo("PUT")).toHaveLength(1);
  });
});

describe("navigation follows the write and nothing else (criterion 40)", () => {
  it("navigates once, to the design just written, and never while the write is in flight", async () => {
    const held = holdTheWrite();
    render();

    tapContinue();
    await settleWrite();

    // The row exists and the document is on its way: this is precisely the window in which a
    // navigation taken on the mint's 201 would already have happened.
    expect(callsTo("POST")).toHaveLength(1);
    expect(editorPushes()).toEqual([]);

    await release(held);
    await settleNavigation();

    // The localized editor route, with the id escaped into the path. next-intl builds the href, so
    // the spy holds a string rather than the value the hook passed it.
    expect(editorPushes()).toEqual([`/ro/d/${encodeURIComponent(MINTED_ID)}`]);
  });

  // The editor's first render asks whether Step 1 is behind it, so the answer has to be on record when the push is
  // made and has to name the design being opened. Read at the moment of the push, which is the order that matters.
  it("records the design as opened from Step 1 before it pushes the editor's route", async () => {
    const originAtTheEditorPush: (string | null)[] = [];
    browser.push.mockImplementation((href: unknown) => {
      if (String(href).includes("/d/")) {
        originAtTheEditorPush.push(readEditorOrigin().designId);
      }
    });
    render();

    tapContinue();
    await settleNavigation();
    browser.push.mockReset();

    expect(originAtTheEditorPush).toEqual([MINTED_ID]);
  });

  it("stops calling the write in flight once it has landed", async () => {
    const held = holdTheWrite();
    render();

    tapContinue();
    await settleWrite();

    expect(handoffState()).toBe("saving");

    await release(held);
    await settleNavigation();

    // **The hand-off had no success arm at all until wave 7F4b's review** (finding F7), so a run
    // that finished stayed `saving` for ever. It is invisible while the editor is opening — and it
    // is the customer's whole position whenever the navigation is declined instead, which is what
    // criterion 42 asks for on every screen the customer has left.
    expect(handoffState()).toBe("saved");
  });
});

describe("a failed hand-off keeps the customer where they are (criterion 41)", () => {
  it.each([
    [
      "the mint is refused",
      () => {
        script.mintStatus = 500;
      },
    ],
    [
      "the write is refused",
      () => {
        script.writeStatus = 500;
      },
    ],
    [
      "the request throws",
      () => {
        script.throwsOnWrite = true;
      },
    ],
  ])("offers a retry and navigates nowhere when %s", async (_case, arrange) => {
    arrange();
    render();

    tapContinue();
    await settleFailedHandoff();

    expect(editorPushes()).toEqual([]);
    // The composed rows are still on the glass: the kitchen is real and only the write failed. Six
    // since wave 7D5b, whose dishwasher row joined the five (ADR 0110 Amendment M3).
    expect(container.querySelectorAll("[data-compose-status]")).toHaveLength(6);
    expect(elementAt("room-compose-notice").textContent).toContain(
      roMessages.room.compose.saveFailed,
    );
    expect(elementAt("room-compose-retry").textContent).toBe(
      roMessages.room.compose.retry,
    );
    // The busy control is gone with it, so nothing on the screen claims to still be working.
    expect(maybeAt("room-compose-cta")).toBe(null);
  });

  it("does not re-compose when the retry runs", async () => {
    script.writeStatus = 500;
    render();

    tapContinue();
    await settleFailedHandoff();
    script.writeStatus = 200;
    tapRetry();
    await settleNavigation();

    // A retry that re-composed would produce a second — and different, because `occurredAt` moves —
    // design for a row that was minted against the first.
    expect(vi.mocked(generateKitchen)).toHaveBeenCalledTimes(1);
  });
});

describe("leaving disarms the hand-off (criterion 42)", () => {
  it("lets the write land but moves nobody when the customer has gone back", async () => {
    const held = holdTheWrite();
    render();

    tapContinue();
    await settleWrite();
    tapComposeBack();
    expect(maybeAt("room-fields")).not.toBe(null);

    await release(held);

    // The row is whole — the write was never cancelled — and the customer stayed where they went.
    expect(callsTo("PUT")).toHaveLength(1);
    expect(editorPushes()).toEqual([]);
    expect(maybeAt("room-fields")).not.toBe(null);
    expect(maybeAt("room-compose")).toBe(null);
  });

  it("moves nobody when the screen unmounts with the write in flight", async () => {
    const held = holdTheWrite();
    render();

    tapContinue();
    await settleWrite();
    act(() => {
      root.unmount();
    });

    await release(held);

    expect(callsTo("PUT")).toHaveLength(1);
    expect(editorPushes()).toEqual([]);
    // `afterEach` unmounts again, and React allows a second unmount; a fresh root keeps the teardown
    // reading the same in every test.
    root = createRoot(container);
  });
});

describe("the editor opens on the generated kitchen (criterion 43)", () => {
  it("writes the composed design, with the typed room and no preset", async () => {
    render();

    tapContinue();
    await settleNavigation();

    const written = callsTo("PUT")[0]?.body;
    expect(written).toEqual(theGeneratedDesign());
    expect(written).toMatchObject({ presetId: null, room: THE_TYPED_ROOM });
  });

  it("reads back a document that deep-equals what the composition produced", async () => {
    render();

    tapContinue();
    await settleNavigation();

    // The same `GET` the editor's load path issues, through the same repository and the same
    // `DesignSchema` parse `readDesign` performs. **The deep equality is the claim**: a design the
    // engine can produce and the schema quietly alters on the way back — a dropped optional, an
    // applied default — fails here, and so does the seed fixture surviving into the stored row.
    const loaded =
      await sessionConfigurationRepository.loadWithAccess(MINTED_ID);

    expect(loaded.design).toEqual(theGeneratedDesign());
    expect(loaded.revision).toBe(WRITTEN_REVISION);
  });
});
