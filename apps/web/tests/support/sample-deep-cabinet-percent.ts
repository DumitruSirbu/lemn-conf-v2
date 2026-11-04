import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

/** The depth percentage the shipped sample book publishes: what a test of the settings sheet states when the figure
 *  is not what it is about. A test that is about the figure publishes its own (`tests/price/q1-depth-line.test.tsx`). */
export const SAMPLE_DEEP_CABINET_PERCENT =
  SAMPLE_PRICE_BOOK.depthRule.deepCabinetPercent;
