// @vitest-environment happy-dom
// `next/navigation` is mocked one layer below the component's import, so spies receive the localized href.
// Only `makeKit`, `createBodyProbe` and `disposeKit` are replaced in the adapter, so the lease bracket in
// `use-generation.ts` stays under test.
import type { BodyProbe, BodyProbeLease } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The address bar, the live query and the router; `search` is what `useSearchParams` reads. */
const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}));

/** What the run's probe factory allocated and released, counted at the adapter's own boundary. */
const kitLedger = vi.hoisted(() => ({ built: 0, disposed: 0 }));

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

// `createFakeBodyProbe` is imported statically below, never via `await import` in this factory: its module imports
// `@lemnaria/three-adapter`, so a dynamic import here would wait on this very mock factory and hang the run.
vi.mock("@lemnaria/three-adapter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/three-adapter")>();
  return {
    ...actual,
    makeKit: (options: { cabinetDepthMm?: number }) => {
      kitLedger.built += 1;
      return {
        cabinetDepthMm: options.cabinetDepthMm,
        builders: { "kitchen-l": () => ({}) },
      };
    },
    createBodyProbe: (kit: { cabinetDepthMm?: number }): BodyProbe =>
      fakeProbeAtKitDepth(kit.cabinetDepthMm),
    disposeKit: () => {
      kitLedger.disposed += 1;
    },
  };
});

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return { ...actual, generateKitchen: vi.fn(actual.generateKitchen) };
});

import { generateKitchen } from "@lemnaria/configurator-domain";

import { RoomScreen } from "@/room/room-screen";
import { parseRoomUrlState } from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import type { Catalogue, CatalogueLocale } from "../support/catalogues";
import { createFakeBodyProbe } from "../support/fake-body-probe";

/** A room the domain accepts, written in the query's own wire form. */
const ROOM_QUERY = "shape=L&wallA=4.2&wallB=3&height=2.5&direction=left";

/** The owner's smallest accepted room (ADR 0108 Amendment E): the two required bodies fit, and
 *  neither the fridge nor any storage does. */
const SMALLEST_ROOM_QUERY =
  "shape=L&wallA=0.9&wallB=2.2&height=2.2&direction=left";

/** Any depth would do; it is the kitchen's declared one so the fake kit is the one the run would build. */
const DECLARED_CABINET_DEPTH_MM = 600;

/** The probe the fake kit answers with. It measures what the builder would actually produce, so an
 *  insert that passed the domain's guards succeeds — the kit is faked, the composition is not. */
function fakeProbeAtKitDepth(cabinetDepthMm: number | undefined): BodyProbe {
  return createFakeBodyProbe({
    cabinetDepthMm: cabinetDepthMm ?? DECLARED_CABINET_DEPTH_MM,
  });
}

/**
 * How long a run may take before this file gives up on it; the margin covers the adapter's dynamic import.
 * Polled, not slept through: a run left in flight leaks its `generateKitchen` call and kit into the next test.
 */
const RUN_TIMEOUT_MS = 3000;
const POLL_MS = 5;

let container: HTMLDivElement;
let root: Root;

const CATALOGUE_FOR: Readonly<Record<CatalogueLocale, Catalogue>> = {
  ro: roMessages,
  ru: ruMessages as Catalogue,
};

function render(locale: CatalogueLocale = "ro"): void {
  renderWrappedIn((screen) => screen, locale);
}

/**
 * The same screen under `<StrictMode>`, which `next.config.ts` enables in development.
 * StrictMode re-runs effects at mount only: a mount effect that generates is caught here, one keyed on a tap flag
 * by *"balances the ledger over two runs in succession"*.
 */
function renderUnderStrictMode(locale: CatalogueLocale = "ro"): void {
  renderWrappedIn((screen) => createElement(StrictMode, null, screen), locale);
}

function renderWrappedIn(
  wrap: (screen: ReactElement) => ReactElement,
  locale: CatalogueLocale,
): void {
  act(() => {
    root.render(
      wrap(
        createElement(NextIntlClientProvider, {
          children: createElement(RoomScreen),
          locale,
          messages: CATALOGUE_FOR[locale],
          timeZone: "Europe/Chisinau",
        }),
      ),
    );
  });
}

/** Real timers throughout: the run crosses a `requestAnimationFrame` before it blocks, which fake timers would skip. */
async function waitUntil(settled: () => boolean, what: string): Promise<void> {
  for (let waited = 0; waited < RUN_TIMEOUT_MS; waited += POLL_MS) {
    if (settled()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    });
  }
  throw new Error(`the composition never ${what}`);
}

function composePhase(): string | null {
  return (
    maybeAt("room-compose-notice")?.getAttribute("data-compose-phase") ?? null
  );
}

async function settleComposition(): Promise<void> {
  await waitUntil(() => composePhase() === "composed", "resolved its rows");
}

async function settleFailure(): Promise<void> {
  await waitUntil(() => composePhase() === "failed", "reported its failure");
}

/** The signal a run that nobody is watching has finished: its kit is back. */
async function settleReleasedKits(expected: number): Promise<void> {
  await waitUntil(() => kitLedger.disposed === expected, "released its kit");
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

function tapFormBack(): void {
  act(() => {
    elementAt("room-back").click();
  });
}

/** The query a navigation was sent to. next-intl builds a localized href string, so the spy holds a
 *  URL and not the `{ pathname, query }` the component passed. */
function queryOf(href: unknown): URLSearchParams {
  return new URL(String(href), "https://lemnaria.test").searchParams;
}

/**
 * The settle's `router.replace` coming back as the query the browser holds. The router is a spy, so a test can hold
 * a departure in flight; `useRoomDeparture` pushes only when the live query returns the exact text it flushed.
 */
function deliverTheFlush(): void {
  const flushed: unknown = browser.replace.mock.calls.at(-1)?.[0];
  if (flushed === undefined) throw new Error("no flush was issued to deliver");
  browser.search = queryOf(flushed).toString();
  render();
}

function lengthField(field: string): HTMLInputElement {
  const control = elementAt(`room-length-${field}`);
  if (!(control instanceof HTMLInputElement)) {
    throw new Error(`the ${field} field is not an input`);
  }
  return control;
}

/** A keystroke written through the prototype's setter: React tracks `value` on the element, so a plain assignment
 *  updates that tracker and the `input` event looks like no change. */
function typeIntoLengthField(field: string, text: string): void {
  act(() => {
    const control = lengthField(field);
    Reflect.set(HTMLInputElement.prototype, "value", text, control);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function rowStatuses(): readonly string[] {
  return [...container.querySelectorAll("[data-compose-status]")].map(
    (row) => row.getAttribute("data-compose-status") ?? "",
  );
}

beforeEach(() => {
  browser.search = ROOM_QUERY;
  browser.push.mockClear();
  browser.replace.mockClear();
  vi.mocked(generateKitchen).mockClear();
  kitLedger.built = 0;
  kitLedger.disposed = 0;
  holdEveryRequestOpen();
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

/**
 * Holds every request open so a settled run's hand-off stops at its first `fetch` instead of opening a real socket.
 * It never answers: a rejection would land after the test ended and update `RoomScreen` outside `act`.
 * Push and request counts below are therefore the departure's alone; the hand-off's guarantees are
 * `room-handoff.dom.test.ts`'s.
 */
function holdEveryRequestOpen(): void {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
}

// The sequences reachable only at a composable draft; those in `qa-7f1-d45-convergence.adversarial.test.ts` lead
// with *Continuă*, which opens 1F here.
describe("a departure in flight, with a composition beside it", () => {
  it("lets the primary tap override an armed back tap and compose the room it flushed", async () => {
    render();
    // The draft moves ahead of the URL, so `departTo` arms and waits rather than pushing at once.
    typeIntoLengthField("wallA", "4300");

    tapFormBack();
    tapContinue();

    expect(browser.push).not.toHaveBeenCalled();
    deliverTheFlush();
    await settleComposition();

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(queryOf(browser.push.mock.calls[0]?.[0]).get("wallA")).toBe("4.3");
    expect(vi.mocked(generateKitchen)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateKitchen).mock.calls[0]?.[0].room.widthMm).toBe(
      4300,
    );
    expect(kitLedger).toEqual({ built: 1, disposed: 1 });
  });

  it("resolves a departure armed by the primary tap after the customer has left 1F", async () => {
    render();
    typeIntoLengthField("wallA", "4300");

    tapContinue();
    await settleComposition();
    // 1F's own back is a state clear, not a departure: it does not disarm the flush, which must not strand the
    // customer.
    tapComposeBack();
    expect(maybeAt("room-fields")).not.toBe(null);

    deliverTheFlush();

    // The push fires and carries the room already showing, so it mints no history entry; the write's own navigation is
    // disarmed by the run token (`room-handoff.dom.test.ts`).
    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(queryOf(browser.push.mock.calls[0]?.[0]).get("wallA")).toBe("4.3");
    expect(maybeAt("room-fields")).not.toBe(null);
    expect(maybeAt("room-compose")).toBe(null);
  });
});

describe("entering composition (criteria 24, 27, 29)", () => {
  it("is reached from the tap and appears nowhere in the URL", async () => {
    // Precondition: a query not resolving to 1D would make every assertion below pass over the wrong screen.
    expect(
      parseRoomUrlState(Object.fromEntries(new URLSearchParams(ROOM_QUERY)))
        .substate,
    ).toBe("1D");
    const pushState = vi.spyOn(window.history, "pushState");
    render();

    tapContinue();
    await settleComposition();

    expect(browser.search).toBe(ROOM_QUERY);
    expect(pushState).not.toHaveBeenCalled();
    // The spy receives next-intl's localized href, because the mock sits one layer below the component's router import.
    expect(browser.push).toHaveBeenCalledTimes(1);
    const destination = new URL(
      String(browser.push.mock.calls[0]?.[0]),
      "https://lemnaria.test",
    );
    expect(destination.pathname).toBe(browser.pathname);
    expect(destination.searchParams.toString()).toBe(ROOM_QUERY);
  });

  it("paints every row pending before the blocking call is made", async () => {
    render();

    tapContinue();

    expect(vi.mocked(generateKitchen)).not.toHaveBeenCalled();
    // Six rows, the dishwasher's among them (ADR 0110 Amendment M3).
    expect(rowStatuses()).toEqual([
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);

    await settleComposition();
  });

  it("calls the generator exactly once per tap, and not again on a re-render", async () => {
    render();

    tapContinue();
    await settleComposition();
    render();
    render("ru");

    expect(vi.mocked(generateKitchen)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateKitchen).mock.calls[0]?.[0].room).toEqual({
      shape: "L",
      widthMm: 4200,
      depthMm: 3000,
      heightMm: 2500,
    });
  });

  it("calls the generator exactly once per tap under StrictMode too", async () => {
    // StrictMode is the configuration the app runs in development; an effect that generated would build two kits here.
    renderUnderStrictMode();

    tapContinue();
    await settleComposition();

    expect(vi.mocked(generateKitchen)).toHaveBeenCalledTimes(1);
    expect(kitLedger).toEqual({ built: 1, disposed: 1 });
  });

  it("resolves every row together, leaving none pending", async () => {
    render();

    tapContinue();
    await settleComposition();

    expect(rowStatuses()).toHaveLength(6);
    expect(rowStatuses()).not.toContain("pending");
  });
});

describe("the top bar in composition (criterion 25)", () => {
  it("changes only its title, and changes it back on leaving", async () => {
    render();
    const pillBefore = elementAt("top-bar-step").textContent;
    expect(elementAt("top-bar-title").textContent).toBe(roMessages.room.title);

    tapContinue();
    await settleComposition();

    expect(elementAt("top-bar-title").textContent).toBe(
      roMessages.room.compose.title,
    );
    expect(elementAt("top-bar-step").textContent).toBe(pillBefore);
    expect(
      maybeAt("locale-menu-toggle") ?? maybeAt("top-bar-wordmark"),
    ).not.toBe(null);

    tapComposeBack();

    expect(elementAt("top-bar-title").textContent).toBe(roMessages.room.title);
  });
});

describe("the body is replaced, not hidden (criterion 26)", () => {
  it("removes the form from the DOM and restores the draft exactly on the back control", async () => {
    render();
    // A notation the refill would not reproduce: `canonicalRoomQuery` writes `4.2`, which reads back as "4200" (ADR
    // 0126).
    // The leading zero survives only if nothing re-seeded the draft from the query.
    // Text that never parsed is unreachable here: an unreadable length puts the room back at 1B, with nothing to
    // compose.
    typeIntoLengthField("wallA", "04200");

    tapContinue();
    await settleComposition();

    expect(maybeAt("room-fields")).toBe(null);
    expect(maybeAt("room-corner")).toBe(null);
    expect(container.querySelector("svg[data-testid='room-plan']")).toBe(null);

    tapComposeBack();

    expect(lengthField("wallA").value).toBe("04200");
    expect(maybeAt("room-compose")).toBe(null);
  });
});

describe("the rows the frame draws (criteria 31, 32)", () => {
  it("draws a dropped role as the frame draws it, and never strikes its text", async () => {
    browser.search = SMALLEST_ROOM_QUERY;
    render();

    tapContinue();
    await settleComposition();

    const fridge = elementAt("room-compose-row-fridge");
    expect(fridge.getAttribute("data-compose-status")).toBe("not_placed");
    expect(elementAt("room-compose-status-fridge").textContent).toBe(
      roMessages.room.compose.status.notPlaced,
    );
    expect(fridge.className).not.toContain("strike");
    expect(container.querySelector("[style*='line-through']")).toBe(null);
  });

  it("keeps the storage row and marks it not placed when nothing was left over", async () => {
    browser.search = SMALLEST_ROOM_QUERY;
    render();

    tapContinue();
    await settleComposition();

    expect(
      elementAt("room-compose-row-storage").getAttribute("data-compose-status"),
    ).toBe("not_placed");
    expect(elementAt("room-compose-name-storage").textContent).toContain(
      roMessages.room.compose.storageExtent,
    );
  });
});

describe("the kit is borrowed and released on every path (criterion 28)", () => {
  it("balances the ledger on a normal run", async () => {
    render();

    tapContinue();
    await settleComposition();

    expect(kitLedger).toEqual({ built: 1, disposed: 1 });
  });

  it("balances the ledger when the composition throws", async () => {
    // The throw is placed inside `lease.use`, as a real one would be, so the `finally` in `createBodyProbeLease` is
    // what
    // is asserted.
    vi.mocked(generateKitchen).mockImplementationOnce((input) => {
      const lease: BodyProbeLease = input.probeAt(DECLARED_CABINET_DEPTH_MM);
      return lease.use(() => {
        throw new Error("composition exploded");
      });
    });
    render();

    tapContinue();
    await settleFailure();

    expect(kitLedger).toEqual({ built: 1, disposed: 1 });
  });

  it("balances the ledger when the customer leaves mid-flight", async () => {
    render();

    tapContinue();
    tapComposeBack();
    // `generateKitchen` is one synchronous call and cannot be cancelled; the abandoned run must still return the kit.
    await settleReleasedKits(1);

    expect(kitLedger).toEqual({ built: 1, disposed: 1 });
    expect(maybeAt("room-fields")).not.toBe(null);
  });

  it("balances the ledger over two runs in succession", async () => {
    render();

    tapContinue();
    await settleComposition();
    tapComposeBack();
    tapContinue();
    await settleComposition();

    expect(kitLedger).toEqual({ built: 2, disposed: 2 });
  });
});

describe("a refusal or a throw is a dead end the customer can leave (criterion 35)", () => {
  it.each([
    [
      "a throw",
      () => {
        vi.mocked(generateKitchen).mockImplementationOnce(() => {
          throw new Error("composition exploded");
        });
      },
    ],
    [
      "a refusal",
      () => {
        vi.mocked(generateKitchen).mockImplementationOnce((input) => ({
          ok: false,
          reason: { code: "MINIMUM_NOT_MET", params: {} },
          log: {
            occurredAt: input.occurredAt,
            plan: {
              room: input.room,
              bases: [],
              floorWidthsMm: { A: [], B: [] },
              dropped: [],
              minimumMet: false,
              remainderMm: { A: 0, B: 0 },
            },
            steps: [],
            commands: [],
          },
        }));
      },
    ],
  ])(
    "shows the failure after %s and navigates nowhere",
    async (_case, arrange) => {
      arrange();
      render();

      tapContinue();
      const pushesFromTheDeparture = browser.push.mock.calls.length;
      await settleFailure();

      expect(elementAt("room-compose-notice").textContent).toContain(
        roMessages.room.compose.failed,
      );
      expect(browser.push).toHaveBeenCalledTimes(pushesFromTheDeparture);

      tapComposeBack();

      expect(maybeAt("room-fields")).not.toBe(null);
    },
  );

  it("draws no row at all when the refusal's own log holds placed bodies", async () => {
    // The engine's second refusal arm: the refusal's log holds placed bodies (here the fridge), yet a discarded design
    // must draw no row. Mocked: reaching it through the engine needs a plan whose arithmetic and probe disagree.
    vi.mocked(generateKitchen).mockImplementationOnce((input) => ({
      ok: false,
      reason: { code: "MINIMUM_NOT_MET", params: {} },
      log: {
        occurredAt: input.occurredAt,
        plan: {
          room: input.room,
          bases: [],
          floorWidthsMm: { A: [], B: [] },
          dropped: [],
          minimumMet: true,
          remainderMm: { A: 0, B: 0 },
        },
        steps: [
          {
            id: "fridge",
            role: "fridge",
            buildId: "base-fridge-700",
            status: "placed",
            placementId: "placement-fridge",
            commands: [],
          },
          {
            id: "sink",
            role: "sink",
            buildId: "base-sink-600",
            status: "not_placed",
            reason: { code: "DROPPED_FOR_FIT", params: {} },
            commands: [],
          },
        ],
        commands: [],
      },
    }));
    render();

    tapContinue();
    await settleFailure();

    expect(rowStatuses()).toEqual([]);
    expect(maybeAt("room-compose-rows")).toBe(null);
    expect(maybeAt("room-compose-row-fridge")).toBe(null);
    // The rule paragraph is removed before the sweep: `status.placed` (*inclus*) is a substring of `status.notPlaced`,
    // which the rule paragraph contains by design.
    const textOutsideTheRule = container.textContent.replace(
      roMessages.room.compose.rule,
      "",
    );
    expect(textOutsideTheRule).not.toContain(
      roMessages.room.compose.status.placed,
    );
    expect(elementAt("room-compose-notice").textContent).toContain(
      roMessages.room.compose.failed,
    );
  });
});

/**
 * A browser Back out of 1F is a `popstate` event (`room-screen.tsx`), not a URL change: `departTo("presets")` pushes
 * the room's own query over an entry holding the same text, so `liveText` does not move and no effect keyed on it
 * fires.
 */
describe("a browser Back out of composition", () => {
  function pressBrowserBack(): void {
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
  }

  it("restores the form on a URL that still names the same room", async () => {
    render();
    tapContinue();
    await settleComposition();
    // The entry behind 1F carries this same query, which is the whole difficulty.
    expect(browser.search).toBe(ROOM_QUERY);

    pressBrowserBack();

    expect(maybeAt("room-compose")).toBe(null);
    expect(maybeAt("room-fields")).not.toBe(null);
    expect(elementAt("top-bar-title").textContent).toBe(roMessages.room.title);
  });

  it("ends a run still in flight, and the kit still goes back", async () => {
    render();

    tapContinue();
    pressBrowserBack();

    expect(maybeAt("room-fields")).not.toBe(null);
    // `generateKitchen` is one synchronous call and cannot be cancelled; the abandoned run must release its kit and
    // never
    // paint over the form (the run token).
    await settleReleasedKits(1);
    expect(kitLedger).toEqual({ built: 1, disposed: 1 });
    expect(maybeAt("room-compose")).toBe(null);
  });
});
