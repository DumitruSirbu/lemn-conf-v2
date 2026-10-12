// @vitest-environment happy-dom
//
// The stored copy taken with the probe's answer, read through each thing that reads a design: the records the scene
// draws, the price, the panel and its footer, the next save, the review reached from the editor, and the share
// control. The editor is mounted for real with a kept page one revision old; in place of its screen stands a
// component that calls the same hooks the screen's parts call and publishes what they answered.
//
// What this cannot see: the pixels of the scene. `design-return-stored-copy.e2e.spec.ts` and the 8K2 traces do.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  derivePlacementRecords,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DesignId,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HydrateAndConfigure } from "@/app/d/[id]/hydrate-and-configure";
import { HydrateAndReview } from "@/app/d/[id]/review/hydrate-and-review";
import type { PanelView } from "@/panel/panel-model";
import { usePanelView } from "@/panel/use-panel-view";
import { usePricedDesign } from "@/price/use-priced-design";
import { ShareDesign } from "@/share/share-design";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";

vi.mock("@/app/configurator/configure/configure-screen", () => ({
  ConfigureScreen: EveryConsumer,
}));
vi.mock("@/app/d/[id]/review/review-screen", () => ({
  ReviewScreen: () => null,
}));

interface Seen {
  recordIds: readonly string[];
  pricing: PricingResult | undefined;
  panel: PanelView | undefined;
}

const seen: Seen = { recordIds: [], pricing: undefined, panel: undefined };

/** The hooks the scene, the price bar, the panel and the settings sheet's share section read the design through. */
function EveryConsumer() {
  seen.recordIds = useConfiguratorStore((state) => state.records).map(
    (record) => record.id,
  );
  seen.pricing = usePricedDesign();
  seen.panel = usePanelView();
  return createElement(
    "div",
    { "data-testid": "share-region" },
    createElement(ShareDesign),
  );
}

const DESIGN_ID = "design-returned-to" as DesignId;
const KEPT_PAGE_REVISION = "2";
const STORED_REVISION = "3";
const REVISION_AFTER_THE_NEXT_SAVE = "4";
const OTHER_HARDWARE_TIER = "hardware.premium";
const PROBE_ANSWER_MS = 50;
const SAVE_GOES_WITHIN_MS = 1500;

const KEPT_PAGE: Design = structuredClone(KITCHEN_L_DESIGN);

/** One body fewer than the page kept, and another hardware tier: the records, the price and the body all differ. */
const STORED_COPY: Design = {
  ...structuredClone(KITCHEN_L_DESIGN),
  placements: KITCHEN_L_DESIGN.placements.slice(0, -1),
  settings: {
    ...KITCHEN_L_DESIGN.settings,
    hardwareTierId: OTHER_HARDWARE_TIER,
  },
};

const BODY_ONLY_THE_KEPT_PAGE_HAS =
  KITCHEN_L_DESIGN.placements.at(-1)?.id ?? "";

function priceOf(design: Design): PricingResult {
  return priceDesign({
    design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

function totalOf(pricing: PricingResult | undefined): number {
  if (pricing?.ok !== true) throw new Error("no price");
  return pricing.priced.totalMinor;
}

interface Request {
  readonly method: string;
  readonly path: string;
  readonly expectedRevision: string | null;
  readonly body: string;
}

let requests: Request[];
let container: HTMLDivElement;
let root: Root;

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** The server: the design's read answers the stored copy, a save is stored, the share status is "none". */
function answer(url: string, init: RequestInit): Promise<Response> {
  const method = init.method ?? "GET";
  requests.push({
    method,
    path: url,
    expectedRevision: new Headers(init.headers).get("x-expected-revision"),
    body: typeof init.body === "string" ? init.body : "",
  });
  if (url.endsWith("/share")) return Promise.resolve(json({ active: false }));
  if (method === "PUT")
    return Promise.resolve(
      json({ id: DESIGN_ID, revision: REVISION_AFTER_THE_NEXT_SAVE }),
    );
  return Promise.resolve(
    json({ design: STORED_COPY, revision: STORED_REVISION, canWrite: true }),
  );
}

function editorOnTheKeptPage() {
  return createElement(NextIntlClientProvider, {
    locale: "ro",
    messages: roMessages,
    timeZone: "Europe/Chisinau",
    children: createElement(HydrateAndConfigure, {
      design: KEPT_PAGE,
      designId: DESIGN_ID,
      revision: KEPT_PAGE_REVISION,
    }),
  });
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function returnToTheKeptPageAndHearTheAnswer(): Promise<void> {
  act(() => {
    root.render(editorOnTheKeptPage());
  });
  await wait(PROBE_ANSWER_MS);
}

function requestsTo(suffix: string, method: string): Request[] {
  return requests.filter(
    (request) => request.method === method && request.path.endsWith(suffix),
  );
}

beforeEach(() => {
  requests = [];
  vi.stubGlobal("fetch", answer);
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
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

describe("before the answer, on the page the router kept", () => {
  it("draws and prices the kept page, locked, and offers no share control", () => {
    act(() => {
      root.render(editorOnTheKeptPage());
    });

    expect(seen.recordIds).toContain(BODY_ONLY_THE_KEPT_PAGE_HAS);
    expect(totalOf(seen.pricing)).toBe(totalOf(priceOf(KEPT_PAGE)));
    expect(useConfiguratorStore.getState().canWrite).toBe("checking");
    expect(
      container.querySelector('[data-testid="share-region"]')?.childNodes,
    ).toHaveLength(0);
    expect(requestsTo("/share", "GET")).toEqual([]);
  });
});

describe("after the answer's copy is taken", () => {
  it("prices two different totals for the kept page and the stored copy, so the checks below can tell them apart", () => {
    expect(totalOf(priceOf(STORED_COPY))).not.toBe(totalOf(priceOf(KEPT_PAGE)));
  });

  it("hands the scene the records of the stored copy", async () => {
    await returnToTheKeptPageAndHearTheAnswer();

    const stored = useConfiguratorStore.getState().design;
    expect(seen.recordIds).toEqual(
      derivePlacementRecords(
        stored,
        buildKitchenLBodyCatalog(cabinetDepthMmOf(stored)),
      ).map((record) => record.id),
    );
    expect(seen.recordIds).not.toContain(BODY_ONLY_THE_KEPT_PAGE_HAS);
  });

  it("prices the stored copy", async () => {
    await returnToTheKeptPageAndHearTheAnswer();

    expect(totalOf(seen.pricing)).toBe(totalOf(priceOf(STORED_COPY)));
  });

  it("opens the panel on a body of the stored copy, unlocked, with the stored copy's price in its footer", async () => {
    await returnToTheKeptPageAndHearTheAnswer();
    const body = seen.recordIds.at(0) ?? "";

    act(() => {
      useConfiguratorStore.getState().select({ kind: "placement", id: body });
    });

    if (seen.panel?.kind !== "open") throw new Error("the panel is closed");
    expect(seen.panel.notice).toBeUndefined();
    expect(seen.panel.footer.price).toBeDefined();
    expect(totalOf(seen.pricing)).toBe(totalOf(priceOf(STORED_COPY)));
  });

  it("has no panel for the body only the kept page had", async () => {
    await returnToTheKeptPageAndHearTheAnswer();

    act(() => {
      useConfiguratorStore
        .getState()
        .select({ kind: "placement", id: BODY_ONLY_THE_KEPT_PAGE_HAS });
    });

    expect(seen.panel?.kind).toBe("closed");
  });

  it("states the stored revision in the next save, whose body is the stored copy with the new edit", async () => {
    await returnToTheKeptPageAndHearTheAnswer();
    const removable = useConfiguratorStore
      .getState()
      .records.find((record) => record.canDelete);
    if (removable === undefined) throw new Error("no removable body");

    act(() => {
      useConfiguratorStore
        .getState()
        .select({ kind: "placement", id: removable.id });
      useConfiguratorStore.getState().remove();
    });
    await wait(SAVE_GOES_WITHIN_MS);

    const saves = requestsTo(`/${DESIGN_ID}`, "PUT");
    expect(saves).toHaveLength(1);
    expect(saves[0]?.expectedRevision).toBe(STORED_REVISION);
    const sent = JSON.parse(saves[0]?.body ?? "{}") as Design;
    const sentIds = sent.placements.map(({ id }) => id);
    expect(sent.settings?.hardwareTierId).toBe(OTHER_HARDWARE_TIER);
    expect(sentIds).not.toContain(BODY_ONLY_THE_KEPT_PAGE_HAS);
    expect(sentIds).not.toContain(removable.id);
    expect(sentIds).toHaveLength(STORED_COPY.placements.length - 1);
  });

  it("is the copy the review shows when reached from the editor, though the review's own page is the older one", async () => {
    await returnToTheKeptPageAndHearTheAnswer();
    const taken = useConfiguratorStore.getState().design;

    renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(HydrateAndReview, {
          design: KEPT_PAGE,
          designId: DESIGN_ID,
          revision: KEPT_PAGE_REVISION,
        }),
      }),
    );

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: taken,
      revision: STORED_REVISION,
      canWrite: true,
    });
  });

  it("offers the share control for this design, which asks the server for the link of the stored row", async () => {
    await returnToTheKeptPageAndHearTheAnswer();

    expect(
      container.querySelector('[data-testid="share-region"]')?.childNodes
        .length,
    ).toBeGreaterThan(0);
    expect(requestsTo(`/${DESIGN_ID}/share`, "GET")).toHaveLength(1);
  });

  it("asked for the design once and saved nothing by taking the copy", async () => {
    await returnToTheKeptPageAndHearTheAnswer();

    expect(requestsTo(`/${DESIGN_ID}`, "GET")).toHaveLength(1);
    expect(requestsTo(`/${DESIGN_ID}`, "PUT")).toEqual([]);
  });
});
