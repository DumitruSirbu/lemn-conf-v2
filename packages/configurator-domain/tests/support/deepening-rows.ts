// The rows that get deeper between the shipped catalogue at 600 and at 700, measured and not listed (ADR 0177 A-6).
// Every suite that prices a design passes this set as `deepeningRows`, so no suite prices with a set of its own making
// by accident; the one that wants a different set (a catalogue of its own, an empty set) builds it where it is used.
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { measureDeepeningRows } from "../../src/pricing/deepening-rows.js";
import { DEEP_CABINET_DEPTH_MM } from "../../src/pricing/percentage-lines.js";
import { DEFAULT_CABINET_DEPTH_MM } from "../../src/worktop-depth.js";

export const MEASURED_DEEPENING_ROWS: ReadonlySet<string> =
  measureDeepeningRows(
    buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
    buildKitchenLBodyCatalog(DEEP_CABINET_DEPTH_MM),
  );
