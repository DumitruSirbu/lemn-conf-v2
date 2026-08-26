import { describe, expect, it } from "vitest";

import {
  renderRejection,
  type RejectionCode,
  type RejectionDetail,
} from "../../src/commands/rejection.js";

/** One sample per code. The list is the contract: a code added without a sentence fails the sweep
 *  below, which is the whole reason the code and the sentence are delivered together. */
const SAMPLES: readonly RejectionDetail[] = [
  { code: "VOID_SELECTED", params: {} },
  { code: "TARGET_NOT_FOUND", params: {} },
  { code: "INVALID_OCCURRED_AT", params: {} },
  { code: "BODY_PROBE_UNAVAILABLE", params: {} },
  { code: "ACCESSORY_NOT_DELETABLE", params: { label: "Plită cu inducție" } },
  { code: "NOT_DELETABLE", params: { label: "Corp bază" } },
  { code: "NOT_IN_LIBRARY", params: { buildId: "no-such-body" } },
  { code: "NOT_INSERTABLE", params: { label: "Corp bază" } },
  { code: "TARGET_NOT_REPLACEABLE", params: { label: "Corp bază" } },
  {
    code: "BAND_MISMATCH",
    params: {
      label: "Corp suspendat 2 uși",
      bodyBand: "wall",
      slotBand: "base",
    },
  },
  {
    code: "BAND_MISMATCH",
    params: { label: "Corp bază 2 uși", bodyBand: "base", slotBand: "wall" },
  },
  {
    code: "WIDTH_TOO_LARGE",
    params: { label: "Coloană cămară", requiredMm: 600, availableMm: 300 },
  },
  {
    code: "WIDTH_TOO_SMALL",
    params: { label: "Corp spălător", requiredMm: 560, availableMm: 400 },
  },
  {
    code: "WIDTH_NOT_SUPPORTED",
    params: {
      label: "Nișă mașină de spălat vase",
      sizesMm: [450, 600],
      availableMm: 400,
    },
  },
  { code: "OPENING_TOO_SHORT", params: { availableMm: 350, minimumMm: 400 } },
  {
    code: "HEIGHT_EXCEEDS_LEVEL",
    params: { label: "Hotă", requiredMm: 710, availableMm: 400 },
  },
  {
    code: "HEIGHT_TOO_LARGE",
    params: { label: "Coloană cămară", requiredMm: 2200, availableMm: 860 },
  },
  { code: "NO_SNAP_POSITION", params: { label: "Corp bază 2 uși" } },
  {
    code: "BUILT_SIZE_MISMATCH",
    params: { label: "Corp bază 2 uși", requiredMm: 600, builtMm: 800 },
  },
  { code: "COLUMN_MISMATCH", params: { label: "Corp bază 2 uși" } },
  {
    code: "NON_INTEGER_MILLIMETRES",
    params: { field: "widthMm", valueMm: 600.5 },
  },
  { code: "FINISH_NOT_SUPPORTED", params: { label: "Etajeră deschisă" } },
  { code: "HANDLE_NOT_SUPPORTED", params: { label: "Etajeră deschisă" } },
];

const ALL_CODES: readonly RejectionCode[] = [
  "VOID_SELECTED",
  "TARGET_NOT_FOUND",
  "INVALID_OCCURRED_AT",
  "BODY_PROBE_UNAVAILABLE",
  "ACCESSORY_NOT_DELETABLE",
  "NOT_DELETABLE",
  "NOT_IN_LIBRARY",
  "NOT_INSERTABLE",
  "TARGET_NOT_REPLACEABLE",
  "BAND_MISMATCH",
  "WIDTH_TOO_LARGE",
  "WIDTH_TOO_SMALL",
  "WIDTH_NOT_SUPPORTED",
  "OPENING_TOO_SHORT",
  "HEIGHT_EXCEEDS_LEVEL",
  "HEIGHT_TOO_LARGE",
  "NO_SNAP_POSITION",
  "BUILT_SIZE_MISMATCH",
  "COLUMN_MISMATCH",
  "NON_INTEGER_MILLIMETRES",
  "FINISH_NOT_SUPPORTED",
  "HANDLE_NOT_SUPPORTED",
];

describe("renderRejection", () => {
  it.each(SAMPLES)("renders a sentence for $code", (detail) => {
    const message = renderRejection(detail);
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain("undefined");
  });

  it("covers every code — a code with no sentence forces the panel to author copy", () => {
    const covered = new Set(SAMPLES.map((sample) => sample.code));
    expect([...covered].sort()).toEqual([...ALL_CODES].sort());
  });

  // §11 row 5: the millimetres are in the params *and* in the sentence.
  it("names the millimetres a width refusal carries as params", () => {
    const message = renderRejection({
      code: "WIDTH_TOO_LARGE",
      params: { label: "Coloană cămară", requiredMm: 600, availableMm: 300 },
    });
    expect(message).toContain("600");
    expect(message).toContain("300");
  });

  // §11 rows 3 and 4 are two different explanations, not one shared band sentence.
  it("explains a floor slot and a wall slot differently", () => {
    const ontoFloor = renderRejection({
      code: "BAND_MISMATCH",
      params: { label: "Corp suspendat", bodyBand: "wall", slotBand: "base" },
    });
    const ontoWall = renderRejection({
      code: "BAND_MISMATCH",
      params: { label: "Corp bază", bodyBand: "base", slotBand: "wall" },
    });
    expect(ontoFloor).not.toBe(ontoWall);
    expect(ontoFloor).toContain("soclu");
  });
});
