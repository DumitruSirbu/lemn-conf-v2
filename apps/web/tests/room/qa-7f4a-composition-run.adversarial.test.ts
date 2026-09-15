// @vitest-environment happy-dom
//
// **Adversarial QA for M7 wave 7F4a — the run, its kit and its token.**
//
// `room-composition.dom.test.ts` balances the lease ledger over four paths: a normal run, a
// `generateKitchen` that throws, a customer who leaves mid-flight, and two runs in succession. Every
// one of those enters `loadProbeFactory` and comes out of it with a lease. This file attacks the
// paths that do **not**:
//
//   - a throw raised **between `makeKit` and `createBodyProbeLease`** — the window in which a kit
//     exists and nothing is bracketing it yet;
//   - a `disposeKit` that itself throws, on a run that had already succeeded;
//   - a screen that **unmounts** while a run is in flight, rather than one whose customer tapped
//     *Înapoi*;
//   - **two runs alive at once**, which the four ledger tests never produce: each of them awaits its
//     run before starting the next, so the run token's comparison is never actually put under load.
//
// The adapter is mocked exactly as that file mocks it — `makeKit`, `createBodyProbe` and `disposeKit`
// only, over the real module — so `use-generation.ts`'s own factory and lease bracket are the code
// under test. What is new here is that each of the three can be made to fail on demand.
import type { BodyProbe } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}));

/**
 * The kit ledger, plus the three failure switches this file arms.
 *
 * `disposed` counts **entries** into `disposeKit`, not successful ones, so a disposal that throws
 * still registers that the kit was handed back — the question then is what the screen does with the
 * throw, not whether the handover happened.
 */
const adapter = vi.hoisted(() => ({
  built: 0,
  disposed: 0,
  roomBuilderThrows: false,
  probeConstructionThrows: false,
  disposalThrows: false,
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

// `createFakeBodyProbe` is reached through the static import at the bottom of the import block and
// never through an `await import(…)` inside this factory: `tests/support/fake-body-probe.ts` imports
// the adapter itself, so a dynamic import here would wait on the mock factory that is still running.
// The note is `room-composition.dom.test.ts`'s and is repeated because the trap is the same one.
vi.mock("@lemnaria/three-adapter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/three-adapter")>();
  return {
    ...actual,
    makeKit: (options: { cabinetDepthMm?: number }) => {
      adapter.built += 1;
      return {
        cabinetDepthMm: options.cabinetDepthMm,
        builders: {
          "kitchen-l": () => {
            if (adapter.roomBuilderThrows) {
              throw new Error("the kitchen-l builder exploded");
            }
            return {};
          },
        },
      };
    },
    createBodyProbe: (kit: { cabinetDepthMm?: number }): BodyProbe => {
      if (adapter.probeConstructionThrows) {
        throw new Error("the probe could not be built over this kit");
      }
      return createFakeBodyProbe({
        cabinetDepthMm: kit.cabinetDepthMm ?? DECLARED_CABINET_DEPTH_MM,
      });
    },
    disposeKit: () => {
      adapter.disposed += 1;
      if (adapter.disposalThrows) throw new Error("disposal exploded");
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

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import type { Catalogue, CatalogueLocale } from "../support/catalogues";
import { createFakeBodyProbe } from "../support/fake-body-probe";

const DECLARED_CABINET_DEPTH_MM = 600;

/** A room the domain accepts, with room to spare for storage. */
const ROOM_QUERY = "shape=L&wallA=4.2&wallB=3&height=2.5&direction=left";

/** The owner's smallest accepted room: the fridge and the worktop are dropped for fit and nothing is
 *  left over for storage, so 1F draws both a *nu poate fi inclus* row and the dropped-roles
 *  sentence. */
const SMALLEST_ROOM_QUERY =
  "shape=L&wallA=0.9&wallB=2.2&height=2.2&direction=left";

const RUN_TIMEOUT_MS = 3000;
const POLL_MS = 5;

let container: HTMLDivElement;
let root: Root;

const CATALOGUE_FOR: Readonly<Record<CatalogueLocale, Catalogue>> = {
  ro: roMessages,
  ru: ruMessages as Catalogue,
};

function render(locale: CatalogueLocale = "ro"): void {
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(RoomScreen),
        locale,
        messages: CATALOGUE_FOR[locale],
        timeZone: "Europe/Chisinau",
      }) as ReactElement,
    );
  });
}

function composePhase(): string | null {
  return (
    maybeAt("room-compose-notice")?.getAttribute("data-compose-phase") ?? null
  );
}

/**
 * **Every phase the notice has actually been drawn in, taken from the DOM's own mutation record.**
 *
 * Polling is not good enough for this claim, and that is a measured statement rather than a caution:
 * with the run token deleted, an abandoned refusal paints and the fresh composition paints over it
 * **inside one five-millisecond poll**, and a sampled trail never sees the refusal at all. That
 * version of this test stayed green over the broken code. Reading `oldValue` off each attribute
 * record recovers the transitions the sampler slept through, and `none` marks the windows in which
 * 1F was not on screen at all.
 */
const phaseTrail: string[] = [];
let phaseWatcher: MutationObserver | undefined;

const PHASE_ATTRIBUTE = "data-compose-phase";

function recordPhase(phase: string): void {
  if (phaseTrail.at(-1) !== phase) phaseTrail.push(phase);
}

function noticeIn(node: Node): Element | undefined {
  if (!(node instanceof Element)) return undefined;
  if (node.hasAttribute(PHASE_ATTRIBUTE)) return node;
  return node.querySelector(`[${PHASE_ATTRIBUTE}]`) ?? undefined;
}

/**
 * The phase a notice carried **at the moment it was added**, which is not the phase it carries now:
 * a node added as `composing` and updated to `composed` in the same batch reads `composed` off the
 * live DOM. The first later attribute record on that node holds the value it was added with.
 */
function phaseWhenAdded(
  notice: Element,
  laterRecords: readonly MutationRecord[],
): string | null {
  const firstChange = laterRecords.find(
    (record) => record.type === "attributes" && record.target === notice,
  );
  return firstChange === undefined
    ? notice.getAttribute(PHASE_ATTRIBUTE)
    : firstChange.oldValue;
}

/** Replays a batch of mutation records in order into the trail. */
function absorb(records: readonly MutationRecord[]): void {
  records.forEach((record, index) => {
    if (record.type === "attributes") {
      if (record.oldValue !== null) recordPhase(record.oldValue);
      return;
    }
    for (const added of record.addedNodes) {
      const notice = noticeIn(added);
      if (notice === undefined) continue;
      const phase = phaseWhenAdded(notice, records.slice(index + 1));
      if (phase !== null) recordPhase(phase);
    }
    for (const removed of record.removedNodes) {
      if (noticeIn(removed) !== undefined) recordPhase("none");
    }
  });
}

function watchPhases(): void {
  phaseWatcher = new MutationObserver(absorb);
  phaseWatcher.observe(container, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [PHASE_ATTRIBUTE],
  });
}

/** The trail, with whatever the screen is showing right now appended — the last transition has no
 *  record after it to say what it landed on. */
function phasesSeen(): readonly string[] {
  absorb(phaseWatcher?.takeRecords() ?? []);
  recordPhase(composePhase() ?? "none");
  return phaseTrail;
}

async function waitUntil(settled: () => boolean, what: string): Promise<void> {
  for (let waited = 0; waited < RUN_TIMEOUT_MS; waited += POLL_MS) {
    if (settled()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    });
  }
  throw new Error(`the composition never ${what}`);
}

/**
 * **Lets a run's dynamic import resolve without letting its paint frame arrive.**
 *
 * `composeOrThrow` awaits `import(…)` and then `theNextPaint()`, which is a `requestAnimationFrame`
 * followed by a `setTimeout`. Draining microtasks resolves the first and cannot reach the second, so
 * the run parks **between** them — which is where a second run has to be started from if the two are
 * to be alive at once.
 *
 * **It is also a mocking constraint, and it is worth knowing before a 7F3 or 7F4b test hits it.**
 * Two dynamic imports of a `vi.mock`-ed module issued in the *same* tick do not return the same
 * namespace under Vitest 3.2: the factory runs once and the second import resolves to the **real**
 * module. Measured directly — `Promise.all([import(x), import(x)])` gives `a !== b`, with `a` mocked
 * and `b` not. In this file that surfaced as the second run calling the **real** `makeKit` and dying
 * on *"Cannot bake a procedural texture"*, which reads exactly like a production defect and is not
 * one: a browser's module cache returns one namespace for one specifier. Resolving the first import
 * before issuing the second sidesteps it.
 */
async function letTheImportResolve(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
  });
}

/** Lets every continuation a finished run may still hold run to completion. Used where the claim is
 *  that **nothing** happens next: a token that was not compared would repaint inside this window. */
async function letAbandonedWorkSettle(): Promise<void> {
  for (let tick = 0; tick < 10; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    });
  }
}

/**
 * **Waits without `act`, and that is the whole point of it.**
 *
 * `act` defers React's flush to the end of its scope, so two runs that settle inside one polling
 * window are coalesced into a **single** render and the earlier state never reaches the DOM at all.
 * Measured: with the run token deleted, an `act`-wrapped poll records the trail
 * `composing → none → composing → composed` and never sees the abandoned refusal, because React
 * never painted it. A browser has no `act` and would paint it. Polling outside `act` lets React
 * flush on its own schedule, one settle per render, which is what the browser does.
 */
async function settleOutsideAct(settled: () => boolean): Promise<void> {
  for (let waited = 0; waited < RUN_TIMEOUT_MS; waited += POLL_MS) {
    if (settled()) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error("the composition never settled");
}

async function settleComposition(): Promise<void> {
  await waitUntil(() => composePhase() === "composed", "resolved its rows");
}

async function settleAnyOutcome(): Promise<void> {
  await waitUntil(
    () => composePhase() === "composed" || composePhase() === "failed",
    "settled",
  );
}

async function settleReleasedKits(expected: number): Promise<void> {
  await waitUntil(() => adapter.disposed === expected, "released its kit");
}

async function settleGenerationCalls(expected: number): Promise<void> {
  await waitUntil(
    () => vi.mocked(generateKitchen).mock.calls.length === expected,
    "reached the generator",
  );
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

function rowStatuses(): readonly string[] {
  return [...container.querySelectorAll("[data-compose-status]")].map(
    (row) => row.getAttribute("data-compose-status") ?? "",
  );
}

function kitLedger(): { readonly built: number; readonly disposed: number } {
  return { built: adapter.built, disposed: adapter.disposed };
}

beforeEach(() => {
  browser.search = ROOM_QUERY;
  browser.push.mockClear();
  browser.replace.mockClear();
  vi.mocked(generateKitchen).mockClear();
  adapter.built = 0;
  adapter.disposed = 0;
  adapter.roomBuilderThrows = false;
  adapter.probeConstructionThrows = false;
  adapter.disposalThrows = false;
  phaseTrail.length = 0;
  holdEveryRequestOpen();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  watchPhases();
});

afterEach(() => {
  phaseWatcher?.disconnect();
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
 * timing decided how far the hand-off got. **This file's subject is the kit and the run token**, and
 * every assertion in it predates the hand-off.
 *
 * **It never answers, rather than failing**, so the hand-off produces no state change at all here: a
 * rejection would land after the test that started it had finished, updating `RoomScreen` outside
 * `act` and printing a warning per run. The hand-off's own guarantees — including what a refused
 * write does to the screen — are `room-handoff.dom.test.ts`'s.
 */
function holdEveryRequestOpen(): void {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
}

describe("a kit that exists before the lease does (criterion 28, risk 5)", () => {
  it.each([
    ["the room builder throws", () => (adapter.roomBuilderThrows = true)],
    [
      "the probe cannot be built over the kit",
      () => (adapter.probeConstructionThrows = true),
    ],
  ])(
    "gives the kit back when %s inside the probe factory",
    async (_case, arm) => {
      arm();
      render();

      tapContinue();
      await settleAnyOutcome();

      // `loadProbeFactory` calls `makeKit`, then the `kitchen-l` builder, then `createBodyProbe`,
      // and only then wraps the result in `createBodyProbeLease`. A throw from either of the two
      // middle steps leaves a kit allocated with no `finally` anywhere above it.
      expect(kitLedger()).toEqual({ built: 1, disposed: 1 });
    },
  );

  it("does not crash, and leaves the customer a way out, when the probe factory throws", async () => {
    adapter.probeConstructionThrows = true;
    render();

    tapContinue();
    await settleAnyOutcome();

    expect(elementAt("room-compose-notice").textContent).toContain(
      roMessages.room.compose.failed,
    );
    // A throw before a log existed: no row may claim anything about fit.
    expect(rowStatuses()).toEqual([]);
    tapComposeBack();
    expect(maybeAt("room-fields")).not.toBe(null);
  });

  it("delivers a composition whose kit would not go back, and writes the failure down", async () => {
    // **Rewritten deliberately.** This test previously pinned the opposite behaviour — phase
    // `failed` — and documented it as "not endorsed": `createBodyProbeLease`'s `finally` rethrew, so
    // a `disposeKit` that failed discarded a `generateKitchen` that had already returned `ok: true`
    // and the customer read *composition could not be completed* over a kitchen that was composed
    // correctly. The coordinator ruled on **2026-09-15** that a composition that succeeded is
    // delivered: a kit that will not go back is a resource problem, and throwing the finished
    // kitchen away over it converts a leak into a visible failure, which is strictly worse for the
    // customer. `body-probe.ts` is unchanged; the guard is `use-generation.ts`'s `releaseOrReport`.
    //
    // The report is asserted through `console.error` because that *is* the seam — the application's
    // structured-log module is `server-only` and there is no client equivalent — so a silent
    // swallow, which the ruling also forbids, reddens this line.
    const reported = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    onTestFinished(() => {
      reported.mockRestore();
    });
    adapter.disposalThrows = true;
    render();

    tapContinue();
    await settleAnyOutcome();

    expect(kitLedger()).toEqual({ built: 1, disposed: 1 });
    expect(composePhase()).toBe("composed");
    expect(rowStatuses()).toHaveLength(5);
    expect(reported).toHaveBeenCalled();
    // What held under the old behaviour and must hold under the new one: the screen settled and the
    // customer can still leave.
    tapComposeBack();
    expect(maybeAt("room-fields")).not.toBe(null);
  });
});

describe("a run whose screen is gone (criterion 28)", () => {
  it("gives the kit back after the whole screen unmounts mid-flight", async () => {
    render();

    tapContinue();
    // Not *Înapoi* — the component tree itself goes. The run's continuation is the only thing left
    // holding the kit, and nothing in `useGeneration` is unmount-aware.
    act(() => {
      root.unmount();
    });
    await settleReleasedKits(1);

    expect(kitLedger()).toEqual({ built: 1, disposed: 1 });
    // Re-created so `afterEach`'s unmount has a root to act on.
    root = createRoot(container);
  });
});

describe("two runs alive at once (the run token)", () => {
  it("balances the ledger when a second run starts before the first has settled", async () => {
    render();

    tapContinue();
    await letTheImportResolve();
    // **The precondition, asserted rather than assumed.** The wave's own *"two runs in succession"*
    // test settles the first run before tapping again, so the token's comparison is never loaded.
    // This says the first run has not reached the generator yet — it is parked on its paint frame —
    // and the second is started on top of it.
    expect(vi.mocked(generateKitchen)).not.toHaveBeenCalled();
    expect(composePhase()).toBe("composing");

    tapComposeBack();
    tapContinue();
    await settleComposition();
    await settleGenerationCalls(2);
    await settleReleasedKits(2);

    expect(vi.mocked(generateKitchen)).toHaveBeenCalledTimes(2);
    expect(kitLedger()).toEqual({ built: 2, disposed: 2 });
  });

  it("never paints the abandoned run's outcome over the run the customer is watching", async () => {
    // The first run refuses and the second composes, so the two outcomes are distinguishable on the
    // glass. If the token comparison were dropped, the refusal would land second — it started first
    // — and the customer would watch a finished kitchen turn into *composition could not be
    // completed*.
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
    render();

    tapContinue();
    await letTheImportResolve();
    expect(vi.mocked(generateKitchen)).not.toHaveBeenCalled();

    tapComposeBack();
    tapContinue();
    await settleOutsideAct(() => composePhase() === "composed");

    expect(vi.mocked(generateKitchen)).toHaveBeenCalledTimes(2);
    expect(composePhase()).toBe("composed");
    expect(phasesSeen()).not.toContain("failed");
    expect(rowStatuses()).toHaveLength(5);
  });

  it("leaves the form standing when the run the customer walked away from settles", async () => {
    render();

    tapContinue();
    expect(composePhase()).toBe("composing");
    tapComposeBack();
    await settleGenerationCalls(1);
    await letAbandonedWorkSettle();

    // The run finished, and its state was discarded rather than drawn: no 1F body ever reappears
    // and the fields the customer went back to are still the ones on screen.
    expect(maybeAt("room-compose")).toBe(null);
    expect(maybeAt("room-fields")).not.toBe(null);
    // The run drew its pending list, the customer left, and nothing came back: no second window in
    // which 1F was on screen.
    expect(phasesSeen()).toEqual(["composing", "none"]);
  });
});

describe("composition is not addressable (criterion 24, ruling R13)", () => {
  it("returns a reload to the form, with no run and no second generation", async () => {
    render();
    tapContinue();
    await settleComposition();
    const queryAfterComposing = browser.search;

    // A reload is a fresh tree over the same address bar, which is exactly what R13 says must not
    // re-enter composition. Asserted here rather than inferred from *"the URL did not change"*: an
    // unchanged URL and a re-entered screen are independent failures.
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    render();

    expect(browser.search).toBe(queryAfterComposing);
    expect(maybeAt("room-compose")).toBe(null);
    expect(maybeAt("room-fields")).not.toBe(null);
    expect(elementAt("top-bar-title").textContent).toBe(roMessages.room.title);
    expect(vi.mocked(generateKitchen)).toHaveBeenCalledTimes(1);
  });
});

describe("1F's sentences, in both catalogues (criteria 30, 36)", () => {
  /** Every leaf under `room.compose` that the rendered frame is expected to resolve, so a row that
   *  fell back to its key shows up as the key itself in the body text. */
  const RAW_KEY_MARKERS = ["room.compose", "room.shapes", "undefined"];

  it.each(["ro", "ru"] as const)(
    "renders 1F in %s with no unresolved key anywhere in the body",
    async (locale) => {
      browser.search = SMALLEST_ROOM_QUERY;
      render(locale);

      tapContinue();
      await settleComposition();

      const body = elementAt("room-compose").textContent;
      expect(body).not.toBe("");
      for (const marker of RAW_KEY_MARKERS) {
        expect(body, `${locale} leaked ${marker}`).not.toContain(marker);
      }
    },
  );

  it("puts the same row in the same state in Romanian and in Russian", async () => {
    browser.search = SMALLEST_ROOM_QUERY;
    render("ro");
    tapContinue();
    await settleComposition();
    const romanian = {
      statuses: rowStatuses(),
      droppedIsDrawn: maybeAt("room-compose-dropped") !== null,
    };

    // The same run, re-rendered under the other catalogue: nothing about the composition changes,
    // so a disagreement here is a copy defect and not a different kitchen.
    render("ru");

    expect(rowStatuses()).toEqual(romanian.statuses);
    expect(maybeAt("room-compose-dropped") !== null).toBe(
      romanian.droppedIsDrawn,
    );
    expect(elementAt("room-compose-status-fridge").textContent).toBe(
      ruMessages.room.compose.status.notPlaced,
    );
  });

  it("names every dropped role in the sentence, in the customer's own language", async () => {
    // 900 × 2200 keeps only the sink and the hob: `plan.dropped` holds the fridge and the worktop,
    // and the sentence is the only place either of them is explained.
    browser.search = SMALLEST_ROOM_QUERY;
    render();

    tapContinue();
    await settleComposition();

    const sentence = elementAt("room-compose-dropped").textContent;
    expect(sentence).toContain(roMessages.room.compose.role.fridge);
    expect(sentence).toContain(roMessages.room.compose.role.preparation);
    expect(sentence).not.toContain(roMessages.room.compose.role.sink);

    render("ru");

    const russian = elementAt("room-compose-dropped").textContent;
    expect(russian).toContain(ruMessages.room.compose.role.fridge);
    expect(russian).toContain(ruMessages.room.compose.role.preparation);
  });

  it("draws no dropped-roles sentence when the room left room for everything", async () => {
    render();

    tapContinue();
    await settleComposition();

    expect(rowStatuses()).not.toContain("not_placed");
    expect(maybeAt("room-compose-dropped")).toBe(null);
  });
});
