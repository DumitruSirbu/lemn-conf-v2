// An item's switch row and row menu at desktop, 1440 x 900 with a pointer, and the menu of a created row at 1100, where
// the accessories' table begins; the scenarios are in the support module, which the phone line runs too.
import { describeItemLook } from "./support/item-look-spec";

describeItemLook({
  width: 1440,
  height: 900,
  label: "1440",
  popoverWidths: [1100, 1440],
});
