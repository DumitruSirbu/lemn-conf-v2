// **Backlog 51, the half a domain fixture cannot reach: the 700 mm kitchen the *command* produces.**
//
// `packages/configurator-domain/tests/backlog-51-chain-homogeneity-is-unreachable.test.ts` sweeps
// the offer list for a column that would end up holding two `alongWallPositionFollows` chains, and
// finds none. Its 700 mm world is built by swapping `settings.cabinetDepthMm`, which is **not the
// world the product produces**: `setCabinetDepth` rebuilds every body through the catalogue at the
// new depth and renames build ids as it goes (`base-drawer3-600` -> `base-3drawer`), and a rebuild
// is precisely the mechanism that could put a body on a different chain from the one its column
// already stands on.
//
// So the same sweep is run here on the document the command actually returns, and on the way back
// as well: 600 -> 700 -> 600. The store is the only place both halves are available — the command
// needs a body probe, which lives in the adapter.
import {
  KITCHEN_L_DESIGN,
  buildKitchenLBodyCatalog,
  offersFor,
  type BodyCatalog,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-08T21:00:00.000Z";
const DEEPER_MM = 700;
const DEFAULT_MM = 600;

function createStore() {
  return createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

function chainOf(catalog: BodyCatalog, buildId: string): string | undefined {
  return catalog.get(buildId)?.depthRule?.alongWallPositionFollows;
}

function chainsBesides(
  records: readonly PlacementRecord[],
  col: string,
  exceptId?: string,
): Set<string> {
  return new Set(
    records
      .filter((record) => record.col === col && record.id !== exceptId)
      .map(
        (record) => record.depthRule?.alongWallPositionFollows ?? "UNDECLARED",
      ),
  );
}

interface SweptRow {
  readonly where: string;
  readonly buildId: string;
  readonly chain: string | undefined;
  readonly siblingChains: ReadonlySet<string>;
}

/** Every offer the product can produce on the store's current document. */
function sweepEveryOffer(store: Store): readonly SweptRow[] {
  const { design, catalog, records, voids, columns } = store.getState();
  const targets = [
    ...voids.map((record) => ({
      kind: "void" as const,
      id: record.id,
      col: record.col,
    })),
    ...records.map((record) => ({
      kind: "placement" as const,
      id: record.id,
      col: record.col,
    })),
  ];
  return targets.flatMap((target) =>
    offersFor({
      records,
      voids,
      columns,
      catalog,
      cabinetDepthMm: design.settings?.cabinetDepthMm ?? DEFAULT_MM,
      target: { kind: target.kind, id: target.id },
    }).map((row) => ({
      where: `${target.kind}:${target.id}`,
      buildId: row.buildId,
      chain: chainOf(catalog, row.buildId),
      siblingChains: chainsBesides(
        records,
        target.col,
        target.kind === "placement" ? target.id : undefined,
      ),
    })),
  );
}

function chainsPerColumn(store: Store): Map<string, Set<string>> {
  const perColumn = new Map<string, Set<string>>();
  for (const record of store.getState().records) {
    const chains = perColumn.get(record.col) ?? new Set<string>();
    chains.add(record.depthRule?.alongWallPositionFollows ?? "UNDECLARED");
    perColumn.set(record.col, chains);
  }
  return perColumn;
}

function mixedColumns(store: Store): readonly string[] {
  return [...chainsPerColumn(store)]
    .filter(([, chains]) => chains.size > 1)
    .map(([col]) => col);
}

function buildIdsOf(store: Store): readonly string[] {
  return store.getState().design.placements.map((p) => p.body.buildId);
}

describe("a depth change, and the column chains on the other side of it", () => {
  it("really rebuilds — otherwise everything below is the domain's fixture again", () => {
    const store = createStore();
    const before = buildIdsOf(store);

    store.getState().setCabinetDepth(DEEPER_MM);

    expect(store.getState().design.settings?.cabinetDepthMm).toBe(DEEPER_MM);
    // The rename is the whole reason this file exists: a settings swap would leave these equal.
    expect(buildIdsOf(store)).not.toEqual(before);
  });

  it("leaves every column on one chain at 700, and again back at 600", () => {
    const store = createStore();
    expect(mixedColumns(store)).toEqual([]);

    store.getState().setCabinetDepth(DEEPER_MM);
    expect(mixedColumns(store)).toEqual([]);

    store.getState().setCabinetDepth(DEFAULT_MM);
    expect(mixedColumns(store)).toEqual([]);
    // Non-vacuity: there are columns, and they carry chains to be wrong about.
    expect(chainsPerColumn(store).size).toBeGreaterThan(5);
  });

  it("offers nothing that would mix a column on the document the command returned", () => {
    const store = createStore();
    store.getState().setCabinetDepth(DEEPER_MM);

    const swept = sweepEveryOffer(store);
    // Every row was a question actually asked: its column still holds a member, so the filter below
    // cannot be empty by short circuit. This is the guard the domain file's emptied world fails.
    expect(swept.length).toBeGreaterThan(50);
    expect(swept.every((row) => row.siblingChains.size > 0)).toBe(true);

    const wouldMix = swept.filter(
      (row) => row.chain !== undefined && !row.siblingChains.has(row.chain),
    );
    expect(wouldMix).toEqual([]);
  });

  it("offers no wall-map body at 700 either", () => {
    const store = createStore();
    store.getState().setCabinetDepth(DEEPER_MM);

    const swept = sweepEveryOffer(store);
    expect(swept.length).toBeGreaterThan(50);
    expect(swept.filter((row) => row.chain === "wall-map")).toEqual([]);
  });
});
