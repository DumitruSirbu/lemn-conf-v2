// @vitest-environment happy-dom
//
// **Sub-state 1F, driven through the real screen** — M7 wave 7F4a, criteria 24, 25, 26, 27, 28, 29,
// 31, 32 and 35.
//
// Three things are mocked and each for a stated reason.
//
// **`next/navigation`, one layer below the component's own import**, exactly as
// `room-screen.dom.test.ts` mocks it: what a spy receives is the localized URL the browser would be
// sent to, and next-intl's href construction is exercised rather than stubbed.
//
// **`@lemnaria/three-adapter`, over the real module.** Only `makeKit`, `createBodyProbe` and
// `disposeKit` are replaced — the three the run's probe factory calls — so the **lease bracket in
// `use-generation.ts` is the code under test** rather than a stand-in for it, and the ledger counts
// the real allocations and releases that file makes. Everything else in the adapter is the adapter's.
//
// **`generateKitchen`, wrapped rather than replaced.** The default is the domain's own
// implementation, so every assertion below runs against a genuinely composed log; the spy is there to
// count calls (criterion 27) and, in two tests, to make the engine refuse or throw (criterion 35).
//
// Romanian is never spelled here: every expected sentence is read out of the imported catalogue.
import type { BodyProbe, BodyProbeLease } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The address bar, the live query and the router. `search` is what `useSearchParams` reads: under
 *  ruling R9 the screen derives the room from the query the browser holds. */
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

// **`createFakeBodyProbe` is reached through a static import at the bottom of this file, never from
// inside the factory.** `tests/support/fake-body-probe.ts` itself imports `@lemnaria/three-adapter`
// for `isCatalogBuildId`, so an `await import(…)` of it *here* asks the adapter's own mock factory to
// finish before it can finish — a cycle that hangs the run rather than failing it, which is an hour
// nobody should spend twice.
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

/** The depth the lease in the throwing test is taken at. It only has to be a depth — nothing is
 *  measured — and it is the kitchen's declared one so the fake kit is the one the run would build. */
const DECLARED_CABINET_DEPTH_MM = 600;

/** The probe the fake kit answers with. It measures what the builder would actually produce, so an
 *  insert that passed the domain's guards succeeds — the kit is faked, the composition is not. */
function fakeProbeAtKitDepth(cabinetDepthMm: number | undefined): BodyProbe {
  return createFakeBodyProbe({
    cabinetDepthMm: cabinetDepthMm ?? DECLARED_CABINET_DEPTH_MM,
  });
}

/** How long a run may take before this file gives up on it. A settled run takes about 15 ms here;
 *  the margin is for the tap that pays for the adapter's dynamic import.
 *
 *  **Polled rather than slept through, and every test waits for its own run to end.** A fixed sleep
 *  that came up short left the previous run in flight, so its `generateKitchen` call and its kit
 *  landed in the *next* test's counters — which is what a leaked asynchronous run always does to a
 *  suite, and it read as *"the generator was called twice"*. */
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
 * The same screen under `<StrictMode>`, which is **the configuration the application actually ships
 * to development**: `next.config.ts:9` sets `reactStrictMode: true`. Criterion 27 is otherwise proved
 * against a React that single-invokes effects, which is not the React a developer runs.
 *
 * **What this catches, measured by breaking it rather than argued** (2026-09-14). Two effect-started
 * shapes were substituted for the handler and this file re-run:
 *
 *   - **A mount effect** — caught, loudly and by eleven tests: the composition starts with no tap at
 *     all, so the form is never drawn and the top bar reads *Preset* on arrival.
 *   - **An effect keyed on a tap flag** — **not** caught by this test, and the reason is worth
 *     knowing: React re-runs effects at **mount** only, so an effect whose first run is an *update*
 *     is invoked once under StrictMode just as it is without it. It was caught by *"balances the
 *     ledger over two runs in succession"* instead, because a dep that does not change cannot fire a
 *     second run.
 *
 * So R15's rule holds, and its **stated reason is narrower than it reads**: *"an effect that
 * generates runs twice in development"* is true of a mount effect and not of a tap-flag one. Both are
 * refused here; only the first is refused by StrictMode.
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

/** Real timers throughout: the run deliberately crosses a `requestAnimationFrame` before it blocks
 *  (criterion 29), and fake timers would let it skip the very frame that proves the point. */
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
 * The settle's `router.replace` coming back as the query the browser holds.
 *
 * The router here is a spy, so nothing moves the address bar on its own — which is what lets a test
 * hold a departure **in flight** and tap again before it lands. Delivering the echo is what resolves
 * it, and `useRoomDeparture` pushes only when the live query comes back as the exact text it flushed.
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

/** A keystroke as the browser delivers it. Written through the prototype's setter rather than as
 *  `input.value = …`: React defines its own `value` property on the element to track what it last
 *  rendered, so a plain assignment updates that tracker too and the `input` event looks like no
 *  change at all. `room-url-round-trip.dom.test.ts` carries the same note. */
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
 * **The hand-off wave 7F4b added, held open here rather than left to the network** (2026-09-15).
 *
 * A composition that settles now mints a design, and until this stub existed that `POST` left
 * `happy-dom` opening a real socket to `localhost:3000` — an `ECONNREFUSED` per settled run, whose
 * timing decided how far the hand-off got and therefore whether a second `browser.push` had landed
 * by the time an assertion below counted them. **This file's subject is the composition**, and every
 * assertion in it predates the hand-off; holding the write open keeps each one measuring what it was
 * written to measure and leaves every push count the departure's alone.
 *
 * **It never answers, rather than failing**, so the hand-off gets no further than its first `fetch`:
 * `compose` marks the run `saving` before the write is issued and nothing moves it off that, where a
 * rejection would land after the test that started it had finished and update `RoomScreen` outside
 * `act`. **Every push and request count below is counted against that stop** — a hand-off allowed to
 * settle here would add a second `browser.push` and a `PUT` to totals this file reads as the
 * departure's alone. The hand-off's own guarantees — one row, navigation only after the write, and
 * the disarm — are `room-handoff.dom.test.ts`'s.
 */
function holdEveryRequestOpen(): void {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
}

/**
 * **The two departure sequences this wave made new, and the reason they are tested here.**
 *
 * `qa-7f1-d45-convergence.adversarial.test.ts` pins the departure machine over sequences, and every
 * one of its sequences **leads with *Continuă***. From 7F4a on, that first tap replaces the form with
 * 1F whenever the draft resolves to a room the domain accepts — so those exact gestures became
 * unperformable and were re-pointed at a draft that does not compose.
 *
 * What is left reachable at a composable draft is the mirror image, and it was **never** covered by
 * that file because it did not exist until this wave: a departure armed by ***Înapoi*** that a
 * *Continuă* tap then overrides **while starting a run**, and a departure armed by *Continuă* whose
 * flush lands after the customer has already left 1F. Both go through the untouched machine in
 * `room-query-sync.ts`; what is new is the run alongside it.
 */
describe("a departure in flight, with a composition beside it", () => {
  it("lets the primary tap override an armed back tap and compose the room it flushed", async () => {
    render();
    // The draft moves ahead of the URL, so `departTo` arms and waits rather than pushing at once.
    typeIntoLengthField("wallA", "4,3");

    tapFormBack();
    tapContinue();

    // Nothing has left yet: both taps are waiting on the same flush.
    expect(browser.push).not.toHaveBeenCalled();
    deliverTheFlush();
    await settleComposition();

    // The second button's destination wins — the room's query, not the shape step's bare pathname.
    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(queryOf(browser.push.mock.calls[0]?.[0]).get("wallA")).toBe("4.3");
    // And exactly one composition ran, for the room the customer typed rather than the stale URL.
    expect(vi.mocked(generateKitchen)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateKitchen).mock.calls[0]?.[0].room.widthMm).toBe(
      4300,
    );
    expect(kitLedger).toEqual({ built: 1, disposed: 1 });
  });

  it("resolves a departure armed by the primary tap after the customer has left 1F", async () => {
    render();
    typeIntoLengthField("wallA", "4,3");

    tapContinue();
    await settleComposition();
    // 1F's own back is a **state clear**, not a departure: it does not disarm the flush the tap
    // issued, and it must not strand the customer when that flush finally echoes.
    tapComposeBack();
    expect(maybeAt("room-fields")).not.toBe(null);

    deliverTheFlush();

    // The push fires, and it carries the room the customer is looking at — the URL already showing,
    // so it mints no history entry.
    //
    // **The seam this named for 7F4b, and where it was settled.** The late thing a primary tap arms
    // is no longer only this flush: it also arms a write, whose own navigation *does* move the
    // customer. That one is disarmed by the run token — `room-handoff.dom.test.ts`'s
    // *"lets the write land but moves nobody when the customer has gone back"*. **This push stayed a
    // no-op**, and `room-query-sync.ts` was not touched to make it one: its destination is still the
    // room's own query, which is the URL already showing.
    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(queryOf(browser.push.mock.calls[0]?.[0]).get("wallA")).toBe("4.3");
    expect(maybeAt("room-fields")).not.toBe(null);
    expect(maybeAt("room-compose")).toBe(null);
  });
});

describe("entering composition (criteria 24, 27, 29)", () => {
  it("is reached from the tap and appears nowhere in the URL", async () => {
    // The guard the rest of this file stands on: a query that did not resolve to 1D would make every
    // assertion below pass over a screen nobody meant to draw.
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
    // The departure still happens exactly as it did before this wave: one push, carrying the
    // canonical room and no key composition invented. What the spy receives is the localized href
    // next-intl builds, because the mock sits one layer below the component's own router import.
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

    // Asserted *before* the run settles, and this is criterion 29's whole mechanism: the list is on
    // the glass while `generateKitchen` has not been entered.
    expect(vi.mocked(generateKitchen)).not.toHaveBeenCalled();
    // Six rows since wave 7D5b: the dishwasher's joined the five (ADR 0110 Amendment M3).
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
    // **The configuration the application ships** (`next.config.ts:9`), and the only one in which the
    // defect R15 forbids is visible: an effect that generated would build two kits here and one
    // everywhere else in this file. One tap, one call — asserted where a double would show.
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

    // Six rows since wave 7D5b: the dishwasher's joined the five (ADR 0110 Amendment M3).
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
    // A notation the URL does not carry — `canonicalRoomQuery` writes `4.2`, the customer typed
    // this. It survives only if nothing re-seeded the draft from the query, which is the claim.
    //
    // **Why not text that never parsed at all**: an L asks for three lengths, and a field that does
    // not read as a length puts the room back at 1B, where there is no room to compose. The
    // unparsed-residue half of criterion 26 is unreachable from 1F by construction.
    typeIntoLengthField("wallA", "4,200");

    tapContinue();
    await settleComposition();

    expect(maybeAt("room-fields")).toBe(null);
    expect(maybeAt("room-corner")).toBe(null);
    expect(container.querySelector("svg[data-testid='room-plan']")).toBe(null);

    tapComposeBack();

    expect(lengthField("wallA").value).toBe("4,200");
    expect(maybeAt("room-compose")).toBe(null);
  });
});

describe("the rows the frame draws (criteria 31, 32)", () => {
  it("draws a dropped role as the frame draws it, and never strikes its text", async () => {
    // The owner's smallest accepted room: the fridge has no wall to stand on.
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
    // The throw is placed *inside* `lease.use`, which is where a real one happens: it is the
    // `finally` in `createBodyProbeLease` that this asserts, reached through the factory
    // `use-generation.ts` builds.
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
    // The run cannot be cancelled — `generateKitchen` is one synchronous call — so what is asserted
    // is that it still gives the kit back after the customer has gone.
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
    // **`generateKitchen`'s second refusal arm** (`generate-kitchen.ts:296-300`): the plan's minimum
    // was met, and then `insertBody` refused the sink or the hob at the real probe. The log it
    // refuses over carries the bodies that *did* insert — here the fridge — and folding it into rows
    // put ***Frigider · 700 — inclus*** under ***Compunerea nu s-a putut finaliza***, for a design
    // that was discarded and that nobody will ever open (coordinator's ruling, 2026-09-15).
    //
    // Mocked rather than provoked, because reaching this arm through the engine needs a plan whose
    // arithmetic and whose probe disagree. The shape of the value is the domain's own: `ok: false`
    // with a log whose steps include a `placed` one.
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

    // No row, rather than rows the view remembers to hide: `GenerationRunState`'s `failed` member
    // carries none.
    expect(rowStatuses()).toEqual([]);
    expect(maybeAt("room-compose-rows")).toBe(null);
    expect(maybeAt("room-compose-row-fridge")).toBe(null);
    // **The sweep reads the screen with the rule paragraph removed, and that is not a relaxation.**
    // Since the owner's 2026-09-15 ruling `status.placed` is *inclus* and `status.notPlaced` is *nu
    // poate fi inclus* — the first is a substring of the second — and the rule paragraph, which this
    // screen draws in every phase, contains the second by design. Left whole, the assertion would
    // fail on approved copy rather than on a drawn row. Every other node still has to be free of the
    // word, so a fridge row leaking onto a failed screen is caught exactly as before.
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
 * **A browser Back out of 1F clears the run and shows the form** — the coordinator's ruling of
 * 2026-09-15, and there was no coverage of the gesture at all before it.
 *
 * The screen cannot read this traversal off the URL, which is why it is an event here and a
 * `popstate` in `room-screen.tsx`. `departTo("presets")` **pushes** the room's own query and the
 * entry behind it is the settle's `replace` of that same query, so **both entries carry the same
 * text**: `liveText` does not move, the sub-state is 1D on both sides, and an effect keyed on either
 * cannot fire. What the customer saw before this ruling was 1F still on the glass and a Back button
 * that appeared to do nothing.
 *
 * R13 is untouched: nothing about composition is written to or read from the URL — the run is ended
 * by the gesture.
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
    // The run cannot be cancelled — `generateKitchen` is one synchronous call — so what is asserted
    // is that the abandoned run releases its kit and never paints over the form (the run token).
    await settleReleasedKits(1);
    expect(kitLedger).toEqual({ built: 1, disposed: 1 });
    expect(maybeAt("room-compose")).toBe(null);
  });
});
