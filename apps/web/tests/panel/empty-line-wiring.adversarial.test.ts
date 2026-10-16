// Adversarial QA for the seam the owner's 2026-09-10 ruling opened under §9's zero-result sentence.
//
// `offersFor` no longer publishes a refused row, so an opening nothing fits publishes no row at all
// — and the two **informative** empty sentences (*wider than the widest cabinet*, *narrower than the
// narrowest*) lost the `widthRangesMm` they used to read their bound off. `buildableWidthSpanMm`
// replaces it, and `use-panel-view.ts` is what carries it to `describePanel`.
//
// **An absent span degrades silently**: `describeEmptyLine` falls back to the generic *"nothing fits
// this opening"* sentence, which is a true sentence, so nothing throws and nothing looks wrong.
// `DescribePanelInput.buildableWidthSpanMm` was *optional* when this file was written, so deleting
// the one line in `use-panel-view.ts` that passes it left the whole web suite green — the same shape
// of hole `price-wiring.adversarial.test.ts` records for `pricing`. It is required as of 2026-09-11
// and the deletion is now a compile error; this file remains the case that fails on a span passed
// but passed **wrong**, which no type can see, and it drives the real `usePanelView` for it rather
// than calling `describePanel` itself.
import {
  buildableWidthSpanMm,
  buildKitchenLBodyCatalog,
  toMillimetres,
  type Design,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { ro } from "../support/romanian-content";
import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

/** The store state the hook under test reads, swapped between cases. */
const storeState = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/store/configurator-store", async (importActual) => {
  const actual =
    await importActual<typeof import("@/store/configurator-store")>();
  return {
    ...actual,
    useConfiguratorStore: (selector: (state: unknown) => unknown) =>
      selector(storeState.current),
  };
});

const { usePanelView } = await import("@/panel/use-panel-view");

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";

/** A wall body narrower than anything §7 builds. Clearing it leaves a **150 mm** opening narrower than the
 *  narrowest thing in the catalogue, which is the state under test; a wider span is never cut down to one. */
const TOO_NARROW_MM = 150;

const ONE_NARROW_BODY: Design = {
  room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
  presetId: null,
  placements: [
    {
      id: "wide",
      wall: "A",
      alongMm: 1000,
      y0Mm: 1500,
      body: {
        buildId: "wall-2door-600",
        widthMm: TOO_NARROW_MM,
        heightMm: 700,
      },
    },
  ],
  createdAt: OCCURRED_AT,
  updatedAt: OCCURRED_AT,
};

function freshStore(design: Design) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

/** React's server renderer is the only renderer this suite has (M4 wave 4A: no jsdom, no RTL), and
 *  it is enough — the claim is what the hook composes. */
function readFromHook<T>(useHook: () => T): T {
  let seen: T | undefined;
  function Probe() {
    seen = useHook();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (seen === undefined) throw new Error("the hook produced nothing");
  return seen;
}

/** The state a customer is in one press after clearing the only body on a wall: the opening it left
 *  selected, and nothing in the catalogue that fits it. */
function stateOverTheEmptySpan(): ConfiguratorState {
  const store = freshStore(ONE_NARROW_BODY);
  store.getState().select({ kind: "placement", id: "wide" });
  store.getState().remove();
  const state = store.getState();
  if (state.lastRejection !== null)
    throw new Error(`the body would not clear: ${state.lastRejection.code}`);

  const opening = state.voids.find(
    (record) => toMillimetres(record.w) === TOO_NARROW_MM,
  );
  if (!opening)
    throw new Error(
      `no ${String(TOO_NARROW_MM)} mm opening; voids: ${state.voids
        .map((record) => `${record.id}@${String(toMillimetres(record.w))}`)
        .join(", ")}`,
    );
  store.getState().select({ kind: "void", id: opening.id });
  return store.getState();
}

/** The replace section the hook produced, beside the span read from **the store's own catalogue** —
 *  the same one the hook is reading, so the expectation cannot agree with the panel by coming from a
 *  different catalogue. */
function replaceSectionFromHook() {
  const state = stateOverTheEmptySpan();
  storeState.current = state;
  const view = readFromHook(usePanelView);
  if (view.kind !== "open") throw new Error("expected an open panel");
  const section = view.sections.find(
    (candidate) => candidate.kind === "replace",
  );
  if (section?.kind !== "replace")
    throw new Error("the panel has no replace section");
  const span = buildableWidthSpanMm(state.catalog);
  if (span === undefined) throw new Error("the catalogue spans nothing");
  return { section, span };
}

describe("§9's empty sentence, wired through the hook the screen actually uses", () => {
  it("names the narrowest cabinet in the catalogue for an opening nothing fits", () => {
    // The test a dropped wiring fails. `describePanel` is never called here — `usePanelView` is —
    // so removing `buildableWidthSpanMm` from the call it makes inside leaves this red while every
    // shipped panel suite stays green.
    const { section, span } = replaceSectionFromHook();

    expect(section.rows).toEqual([]);
    expect(section.emptyLine).toBe(
      ro.panel.noOffersTooNarrow(TOO_NARROW_MM, span.minMm),
    );
  });

  it("does not fall back to the sentence that names no bound", () => {
    // The **specific** degradation an absent span produces: a true sentence that has stopped saying
    // the one thing the customer needs, which is why the case above cannot be read as "some sentence
    // was rendered".
    const { section } = replaceSectionFromHook();

    expect(section.emptyLine).not.toBe(
      ro.panel.noOffersForSlot(TOO_NARROW_MM, 700),
    );
    expect(section.emptyLine).toContain(String(TOO_NARROW_MM));
  });
});
