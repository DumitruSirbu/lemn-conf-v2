// An item's switch row and row menu at 390 x 844 with real touch; the scenarios are in the support module, which the
// desktop line runs too. A phone's menu is not a popover, so no menu width is asked of it.
import { describeItemLook } from "./support/item-look-spec";

describeItemLook({ width: 390, height: 844, label: "390", popoverWidths: [] });
