// The store and generation share one domain-owned ADR 0090 reconciliation seam. This test uses a
// wall-end removal because its recorded and published maps must differ: duplicating either half in
// the web adapter would make the comparison fail instead of drifting silently.
import {
  buildKitchenLBodyCatalog,
  deriveRecordedColumns,
  derivePlacementRecords,
  reconcileSuccessfulCommandResult,
  removePlacement,
  toMetres,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { applyCommandResult } from "../../src/store/apply-command-result";

const OCCURRED_AT = "2026-09-12T00:00:00.000Z";
const DESIGN: Design = {
  room: { shape: "L", widthMm: 750, depthMm: 2830, heightMm: 2600 },
  presetId: null,
  placements: [
    {
      id: "sink",
      wall: "A",
      alongMm: 400,
      y0Mm: 0,
      body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
    },
  ],
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
};

describe("the web store consumes domain command-result reconciliation", () => {
  it("matches both domain faces while retaining selection as web-only state", () => {
    const catalog = buildKitchenLBodyCatalog(600);
    const previousRecordedColumns = deriveRecordedColumns(
      derivePlacementRecords(DESIGN, catalog),
      DESIGN,
      toMetres(DESIGN.room.widthMm),
    );
    const result = removePlacement({
      design: DESIGN,
      catalog,
      target: { kind: "placement", id: "sink" },
      occurredAt: OCCURRED_AT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const domain = reconcileSuccessfulCommandResult({
      result,
      catalog,
      previousRecordedColumns,
    });
    const web = applyCommandResult({
      result,
      catalog,
      columns: previousRecordedColumns,
      selection: { kind: "placement", id: "sink" },
    });
    expect(web.applied).toBe(true);
    if (!web.applied) return;

    expect({
      design: web.state.design,
      records: web.state.records,
      recordedColumns: web.state.recordedColumns,
      columns: web.state.columns,
      voids: web.state.voids,
    }).toStrictEqual(domain);
    expect(web.state.selection?.kind).toBe("void");

    const recorded = [...domain.recordedColumns.values()];
    const published = [...domain.columns.values()];
    expect(recorded).toHaveLength(1);
    expect(published).toHaveLength(1);
    expect(Math.round((recorded[0]?.w ?? 0) * 1000)).toBe(800);
    expect(Math.round((published[0]?.w ?? 0) * 1000)).toBe(750);
  });
});
