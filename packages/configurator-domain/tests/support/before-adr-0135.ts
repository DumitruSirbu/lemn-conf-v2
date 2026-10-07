// What ADR 0135 changed in a generated design, put back — so a digest recorded before it can still be
// reproduced from today's output, and a rebaseline is shown to be exactly these fields and no others.
//
// Three things moved in a stored design, all of them the base corner pieces' own:
//  - the base return (`base-corner-return-320`) is 330 wide from the run's carcass front, 570, and not
//    320 wide from 580: its centre is 5 mm nearer the corner (S2, the joint move);
//  - its recorded column depth is 620, not 600: the run's worktop overhang (S1);
//  - the X-leg's recorded column depth is 620, not 630: its worktop is on the run's line (S2).
// Nothing else is touched: a sweep that still matches the old digest after this is a sweep in which
// those fields were the whole difference.
const BASE_RETURN_BUILD_ID = "base-corner-return-320";
const BASE_X_LEG_BUILD_ID = "base-corner-x-900";

const RETURN_CENTRE_SHIFT_MM = 5;
const RETURN_WIDTH_GROWTH_MM = 10;
const RETURN_COLUMN_DEPTH_BEFORE_MM = 600;
const X_LEG_COLUMN_DEPTH_BEFORE_MM = 630;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberAt(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number") {
    throw new Error(
      `before-adr-0135: ${key} is not a number on ${JSON.stringify(record)}`,
    );
  }
  return value;
}

function returnPlacementBefore(
  placement: Record<string, unknown>,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...placement,
    alongMm: numberAt(placement, "alongMm") + RETURN_CENTRE_SHIFT_MM,
    body: {
      ...body,
      widthMm: numberAt(body, "widthMm") - RETURN_WIDTH_GROWTH_MM,
    },
  };
}

function columnExtentBefore(
  extent: Record<string, unknown>,
): Record<string, unknown> {
  if (extent["depthFromBuildId"] === BASE_RETURN_BUILD_ID) {
    return {
      ...extent,
      alongMm: numberAt(extent, "alongMm") + RETURN_CENTRE_SHIFT_MM,
      widthMm: numberAt(extent, "widthMm") - RETURN_WIDTH_GROWTH_MM,
      depthMm: RETURN_COLUMN_DEPTH_BEFORE_MM,
    };
  }
  if (extent["depthFromBuildId"] === BASE_X_LEG_BUILD_ID) {
    return { ...extent, depthMm: X_LEG_COLUMN_DEPTH_BEFORE_MM };
  }
  return extent;
}

/** `result` as a design or generation result held before ADR 0135, read through JSON so the answer
 *  is a fresh value and the input is never mutated. */
export function asBeforeAdr0135(result: unknown): unknown {
  return JSON.parse(JSON.stringify(result), (_key, value: unknown) => {
    if (!isObject(value)) return value;
    const body = value["body"];
    if (isObject(body) && body["buildId"] === BASE_RETURN_BUILD_ID) {
      return returnPlacementBefore(value, body);
    }
    return columnExtentBefore(value);
  }) as unknown;
}
