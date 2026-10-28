// The rows that get deeper between the shipped catalogue at 600 and at 700, measured here from the domain and not read
// from `@/price/deepening-rows`, so a test that prices with it checks the application's own measurement against an
// independent one (ADR 0177 A-6).
import {
  buildKitchenLBodyCatalog,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  measureDeepeningRows,
} from "@lemnaria/configurator-domain";

export const MEASURED_DEEPENING_ROWS: ReadonlySet<string> =
  measureDeepeningRows(
    buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
    buildKitchenLBodyCatalog(DEEP_CABINET_DEPTH_MM),
  );
