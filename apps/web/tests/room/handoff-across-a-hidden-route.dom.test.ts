// @vitest-environment happy-dom
//
// **The hand-off across a route that was hidden rather than unmounted** — wave 7F4b's review,
// finding F1.
//
// **The defect this file was written against, measured before it was fixed.** `useGeneration` used
// one counter for two different questions: *which composition is on the screen* and *is there still
// a screen to move*. The second was answered by bumping that counter from an **unmount cleanup**,
// which was sound only because unmounting also destroyed the state holding the attempt.
//
// Next 16.3.4 breaks that coupling. `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`:
// with Cache Components on, a navigation **hides** the old page inside React's `<Activity>` instead
// of unmounting it, and *"both React state and DOM state are preserved"* while its effects clean up.
// `next.config.ts` does not set `cacheComponents` today, so this is reproduced here the way the
// framework would produce it — the same `<Activity>`, driven directly — rather than by turning the
// flag on.
//
// **What it measured, on `e2f24dc`:** compose, let the write fail, hide the route, show it again,
// tap *Încearcă din nou*. The `PUT` lands and the row is correct, and the customer waits on
// *Se compune…* forever, because the navigation guard compares a token the cleanup has already
// moved. `room-handoff.dom.test.ts:547` cannot see it: it unmounts for real, which destroys the
// state too, so it passes either way.
//
// The mocks are `room-handoff.dom.test.ts`'s, for its reasons.
import type { BodyProbe, DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { Activity, act, createElement } from "react";
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

import { RoomScreen } from "@/room/room-screen";

import roMessages from "../../src/messages/ro.json";
import { createFakeBodyProbe } from "../support/fake-body-probe";

const ROOM_QUERY = "shape=L&wallA=4.2&wallB=3&height=2.5&direction=left";
const DECLARED_CABINET_DEPTH_MM = 600;
const MINTED_ID: DesignId = "design 1";
const EDITOR_HREF = `/ro/d/${encodeURIComponent(MINTED_ID)}`;
const RUN_TIMEOUT_MS = 3000;
const POLL_MS = 5;

interface ServerCall {
  readonly method: string;
  readonly body: unknown;
}

let container: HTMLDivElement;
let root: Root;
let calls: ServerCall[];
let writeStatus: number;
/** Held when a test needs the write to be genuinely in flight at a chosen moment. Left unset, the
 *  stub answers at once. */
let heldWrite:
  | { readonly promise: Promise<void>; readonly release: () => void }
  | undefined;

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
    async (_url: unknown, init?: RequestInit): Promise<Response> => {
      const method = init?.method ?? "GET";
      calls.push({ method, body: init?.body });
      if (method === "POST") {
        return jsonResponse(201, { id: MINTED_ID, revision: "1" });
      }
      await heldWrite?.promise;
      if (writeStatus !== 200) return jsonResponse(writeStatus, {});
      return jsonResponse(200, { id: MINTED_ID, revision: "2" });
    },
  );
}

function holdTheWrite(): { readonly release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = () => {
      resolve();
    };
  });
  heldWrite = { promise, release };
  return heldWrite;
}

/** Releases a held write and lets every continuation it unblocks run, so what follows is asserted
 *  after the hand-off has had its chance to navigate rather than before. */
async function releaseTheWrite(): Promise<void> {
  const held = heldWrite;
  if (held === undefined) throw new Error("no write is being held");
  await act(async () => {
    held.release();
    await held.promise;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 4));
  });
}

/**
 * The room screen inside the boundary Next puts a route in, at the visibility the framework would
 * give it. Hiding runs the subtree's effect cleanups and **keeps its state**, which is the whole
 * mechanism under test; `display: none` leaves every node queryable, so the controls below are read
 * exactly as they are in every other file here.
 */
function renderAt(mode: "visible" | "hidden"): void {
  act(() => {
    root.render(
      createElement(Activity, {
        mode,
        children: createElement(NextIntlClientProvider, {
          children: createElement(RoomScreen),
          locale: "ro",
          messages: roMessages,
          timeZone: "Europe/Chisinau",
        }),
      }),
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

function handoffState(): string | null {
  return (
    container
      .querySelector('[data-testid="room-compose-notice"]')
      ?.getAttribute("data-compose-handoff") ?? null
  );
}

function tap(testId: string): void {
  act(() => {
    elementAt(testId).click();
  });
}

beforeEach(() => {
  browser.search = ROOM_QUERY;
  browser.push.mockClear();
  calls = [];
  writeStatus = 500;
  heldWrite = undefined;
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

describe("a route that was hidden and shown again (review finding F1)", () => {
  it("still opens the editor when the retry succeeds after the round trip", async () => {
    renderAt("visible");
    tap("room-continue");
    await waitUntil(() => handoffState() === "failed", "reported its failure");

    // The customer leaves 1F by a route change that is not *Înapoi* — a locale switch is a `push`,
    // so `leave` never runs — and comes back. The composition, its attempt and the retry control
    // are all still there, because hiding preserves state.
    renderAt("hidden");
    renderAt("visible");
    expect(elementAt("room-compose-retry")).toBeDefined();

    writeStatus = 200;
    tap("room-compose-retry");
    await waitUntil(() => editorPushes().length > 0, "navigated");

    expect(editorPushes()).toEqual([EDITOR_HREF]);
    // The round trip minted nothing and the retry wrote to the row the first attempt minted.
    expect(callsTo("POST")).toHaveLength(1);
    expect(callsTo("PUT")).toHaveLength(2);
  });

  it("moves nobody while the route is hidden", async () => {
    writeStatus = 200;
    holdTheWrite();
    renderAt("visible");
    tap("room-continue");
    await waitUntil(() => callsTo("PUT").length > 0, "issued its write");

    // Hidden **with the write genuinely in flight** — released only below, so the navigation this
    // test is about had not been taken before the route went away.
    renderAt("hidden");
    await releaseTheWrite();

    // Criterion 42 at its new shape: the write lands, and a hidden route does not push the customer
    // out of whatever page they are actually looking at.
    expect(callsTo("PUT")).toHaveLength(1);
    expect(editorPushes()).toEqual([]);
    // And the run says so. This is the one position in which `saved` is not merely `saving` under
    // another name: the design is written, nobody was moved to it, and the state the customer would
    // come back to used to claim the write was still going (finding F7).
    expect(handoffState()).toBe("saved");
  });
});
