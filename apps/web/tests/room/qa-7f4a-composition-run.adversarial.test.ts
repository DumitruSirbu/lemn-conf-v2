// @vitest-environment happy-dom
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

/** The kit ledger and the three failure switches. `disposed` counts entries into `disposeKit`, not successes, so a
 *  throwing disposal still registers the handover. */
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

// `createFakeBodyProbe` comes from the static import below, never `await import(…)` in this factory:
// `tests/support/fake-body-probe.ts` imports the adapter, so a dynamic import waits on the running mock factory.
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

/** The smallest accepted room: the fridge and the worktop are dropped for fit and nothing is left for storage, so
 *  1F draws both a *nu poate fi inclus* row and the dropped-roles sentence. */
const SMALLEST_ROOM_QUERY =
  "shape=L&wallA=0.9&wallB=2.2&height=2.2&direction=left";

const RUN_TIMEOUT_MS = 3000;
const POLL_MS = 5;
const PRESET_LISTING_ENDPOINT = "/api/presets";
const MICROTASK_TURNS_A_LISTING_NEEDS = 40;
const MICROTASK_TURNS_AN_IMPORT_NEEDS = 8;

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

/** Every phase the notice was actually drawn in, from the DOM's mutation record: a polled trail misses a refusal
 *  that paints and is overpainted inside one 5 ms poll. `none` marks the windows with 1F off screen. */
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

/** The phase a notice carried when it was added, not now: a node added as `composing` and updated to `composed` in
 *  one batch reads `composed` off the live DOM; the first later attribute record holds the original. */
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

/** The trail plus what the screen shows now; the last transition has no record after it. */
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

/** Lets every continuation a finished run may still hold run to completion; a token never compared would repaint. */
async function letAbandonedWorkSettle(): Promise<void> {
  for (let tick = 0; tick < 10; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    });
  }
}

/** Waits without `act`: `act` coalesces two runs that settle inside one polling window into one render, so the
 *  earlier state never reaches the DOM that a browser would paint. */
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

/** Holds the hand-off's `fetch` open. Unstubbed, a settled run's `POST` opened a real socket whose timing decided how
 *  far the hand-off got. It never answers, so every trail, push count and ledger is read against `saving`; a
 *  rejection would update `RoomScreen` outside `act`. The hand-off itself is `room-handoff.dom.test.ts`'s.
 *
 *  The preset listing is answered at once with a 404, which Step 1 reads as "no presets": since M8C P8 composition
 *  starts only after that read, and a listing held open would hold every run here for its own 3 s timeout. */
function holdEveryRequestOpen(): void {
  vi.stubGlobal("fetch", (url: unknown) =>
    String(url).startsWith(PRESET_LISTING_ENDPOINT)
      ? Promise.resolve(new Response(null, { status: 404 }))
      : new Promise<Response>(() => undefined),
  );
}

/**
 * The wait (1D) between the tap and 1F, which the stubbed listing ends within microtasks. A test that acts on the run
 * straight after the tap, as these did before M8C P8, awaits this first. Microtasks only, no timer, so the run
 * is carried no further than its paint frame, where these tests mean to hold it.
 */
async function settleTheListing(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < MICROTASK_TURNS_A_LISTING_NEEDS; turn += 1) {
      await Promise.resolve();
    }
  });
}

/**
 * Lets a run get through the preset listing and resolve its dynamic import without its paint frame arriving, parking
 * the run between the two so a second run can start on top of it. Resolve the first import before issuing the second:
 * under Vitest 3.2 two same-tick dynamic imports of a `vi.mock`-ed module return different namespaces, and the second is
 * the real module. It is one `act`, not `settleTheListing` and then a second one: a second `act` is a second task
 * boundary, and under load enough real time passes in it for the paint frame to arrive.
 */
async function settleTheListingAndTheImport(): Promise<void> {
  await act(async () => {
    for (
      let turn = 0;
      turn < MICROTASK_TURNS_A_LISTING_NEEDS + MICROTASK_TURNS_AN_IMPORT_NEEDS;
      turn += 1
    ) {
      await Promise.resolve();
    }
  });
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

      // `loadProbeFactory` calls `makeKit`, the builder, `createBodyProbe`, then wraps the result in
      // `createBodyProbeLease`; a throw in the middle two leaves a kit allocated with no `finally` above it.
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
    // A composed kitchen is delivered even when `disposeKit` throws (see `releaseOrReport` in `use-generation.ts`).
    // The report goes through `console.error`, the only client seam, so a silent swallow reddens this test.
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
    // Six rows: the dishwasher joined the five (ADR 0110 Amendment M3).
    expect(rowStatuses()).toHaveLength(6);
    expect(reported).toHaveBeenCalled();
    tapComposeBack();
    expect(maybeAt("room-fields")).not.toBe(null);
  });
});

describe("a run whose screen is gone (criterion 28)", () => {
  it("gives the kit back after the whole screen unmounts mid-flight", async () => {
    render();

    tapContinue();
    await settleTheListing();
    // Not *Înapoi*: the tree itself goes, and the run's continuation is the only thing left holding the kit.
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
    await settleTheListingAndTheImport();
    // Precondition: the first run is parked on its paint frame, short of the generator, and the second starts on top.
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
    // The first run refuses and the second composes so the outcomes are distinguishable; without the token
    // comparison the refusal would land second.
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
    await settleTheListingAndTheImport();
    expect(vi.mocked(generateKitchen)).not.toHaveBeenCalled();

    tapComposeBack();
    tapContinue();
    await settleOutsideAct(() => composePhase() === "composed");

    expect(vi.mocked(generateKitchen)).toHaveBeenCalledTimes(2);
    expect(composePhase()).toBe("composed");
    expect(phasesSeen()).not.toContain("failed");
    // Six rows: the dishwasher joined the five (ADR 0110 Amendment M3).
    expect(rowStatuses()).toHaveLength(6);
  });

  it("leaves the form standing when the run the customer walked away from settles", async () => {
    render();

    tapContinue();
    await settleTheListing();
    expect(composePhase()).toBe("composing");
    tapComposeBack();
    await settleGenerationCalls(1);
    await letAbandonedWorkSettle();

    expect(maybeAt("room-compose")).toBe(null);
    expect(maybeAt("room-fields")).not.toBe(null);
    // The run drew its pending list and nothing came back: no second window in which 1F was on screen.
    expect(phasesSeen()).toEqual(["composing", "none"]);
  });
});

describe("composition is not addressable (criterion 24, ruling R13)", () => {
  it("returns a reload to the form, with no run and no second generation", async () => {
    render();
    tapContinue();
    await settleComposition();
    const queryAfterComposing = browser.search;

    // A reload is a fresh tree over the same address bar and must not re-enter composition (R13); an unchanged URL
    // and a re-entered screen are independent failures.
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
  /** Strings that appear in the body only when a row fell back to its key. */
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

    // The same run under the other catalogue: a disagreement here is a copy defect, not a different kitchen.
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
    // 900 × 2200 keeps only the sink and the hob, so `plan.dropped` holds the fridge and the worktop and the
    // sentence is the only place either is explained.
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
