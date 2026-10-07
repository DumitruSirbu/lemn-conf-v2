// @vitest-environment happy-dom
//
// Criterion 10: one place hands `describeReview` its inputs, and they are one design's, from one read of the store.
//
// What this cannot see: a second caller added under a name the parse does not follow (a re-export, a dynamic
// import). The import check reads this repository's own import statements and calls, which is all a reviewer reads
// as well.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  KITCHEN_L_DESIGN,
  widthOptionsFor,
  type Design,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PriceBar } from "@/price/price-bar";
import type { ReviewView } from "@/review/review-model";
import { useReview } from "@/review/use-review";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const SRC_ROOT = join(import.meta.dirname, "../../src");
const SOLE_CALLER = "review/use-review.ts";
const MODEL_MODULE = "review/review-model.ts";

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFilesUnder(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

/** Whether the file imports `describeReview` from the model, by name, as a value or a type. */
function importsDescribeReview(source: string): boolean {
  const importsFromTheModel =
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'][^"']*review-model["']/g;
  return [...source.matchAll(importsFromTheModel)].some((match) =>
    (match[1] ?? "")
      .split(",")
      .map((name) => name.replace(/^\s*type\s+/, "").trim())
      .includes("describeReview"),
  );
}

describe("one place hands the model its inputs", () => {
  const files = sourceFilesUnder(SRC_ROOT).map((path) => ({
    name: relative(SRC_ROOT, path),
    source: readFileSync(path, "utf8"),
  }));

  it("has exactly one importer of describeReview, outside the model itself", () => {
    const importers = files
      .filter(
        ({ name, source }) =>
          name !== MODEL_MODULE && importsDescribeReview(source),
      )
      .map(({ name }) => name);

    expect(importers).toEqual([SOLE_CALLER]);
  });

  it("has no call to describeReview anywhere else, however it was reached", () => {
    const callers = files
      .filter(
        ({ name, source }) =>
          name !== MODEL_MODULE &&
          name !== SOLE_CALLER &&
          /\bdescribeReview\s*\(/.test(source),
      )
      .map(({ name }) => name);

    expect(callers).toEqual([]);
  });
});

let container: HTMLDivElement;
let root: Root;
let latest: ReviewView | undefined;

function Probe() {
  latest = useReview();
  return createElement(PriceBar);
}

function mountProbe(): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(Probe),
      }),
    );
  });
}

function reviewNow() {
  if (latest?.kind !== "available")
    throw new Error("the seeded kitchen has no available review");
  return latest;
}

/** A body of the seeded kitchen and a width it can be set to that it does not have now, as the store's own
 *  command would accept it. */
function aBodyAndAWidthItCanTake(design: Design): {
  placementId: string;
  widthMm: number;
} {
  const state = useConfiguratorStore.getState();
  for (const placement of design.placements) {
    const options = createFakeProbeFactory()(600).use((probe) =>
      widthOptionsFor({
        design: state.design,
        catalog: state.catalog,
        columns: state.columns,
        target: { kind: "placement", id: placement.id },
        probe,
      }),
    );
    const other = options.find(
      (option) => option.verdict.status === "available",
    );
    if (other !== undefined)
      return { placementId: placement.id, widthMm: other.widthMm };
  }
  throw new Error("no body of the seeded kitchen can change width");
}

function rowOf(placementId: string) {
  return reviewNow()
    .groups.flatMap((group) => group.rows)
    .find((row) => row.key === placementId);
}

describe("the review follows the store's design, row and figure together", () => {
  beforeEach(() => {
    // An edit schedules a save; nothing here is a server, and the review never waits on one.
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    useConfiguratorStore.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "design-under-review",
      revision: "1",
      canWrite: true,
    });
    useConfiguratorStore.getState().attachBodyProbe(createFakeProbeFactory());
    latest = undefined;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    useConfiguratorStore.getState().detachBodyProbe();
    vi.unstubAllGlobals();
  });

  it("shows the widened body's new width in the very next view, with the price bar's own figure", () => {
    mountProbe();
    const { placementId, widthMm } = aBodyAndAWidthItCanTake(
      useConfiguratorStore.getState().design,
    );
    const labelBefore = rowOf(placementId)?.label;
    useConfiguratorStore
      .getState()
      .select({ kind: "placement", id: placementId });

    act(() => {
      useConfiguratorStore.getState().setWidth(widthMm);
    });

    const label = rowOf(placementId)?.label;
    const record = useConfiguratorStore
      .getState()
      .records.find((candidate) => candidate.id === placementId);
    expect(record?.widthMm).toBe(widthMm);
    expect(label).not.toBe(labelBefore);
    expect(label).toContain(String(widthMm));
    expect(reviewNow().figure.amountText).toBe(
      container.querySelector('[data-testid="price-bar-total"]')?.textContent,
    );
  });

  it("keeps the figure equal to the price bar's through a second edit", () => {
    mountProbe();
    const { placementId, widthMm } = aBodyAndAWidthItCanTake(
      useConfiguratorStore.getState().design,
    );
    useConfiguratorStore
      .getState()
      .select({ kind: "placement", id: placementId });

    act(() => {
      useConfiguratorStore.getState().setWidth(widthMm);
    });
    act(() => {
      useConfiguratorStore.getState().remove();
    });

    expect(rowOf(placementId)).toBeUndefined();
    expect(reviewNow().figure.amountText).toBe(
      container.querySelector('[data-testid="price-bar-total"]')?.textContent,
    );
  });
});
